/* ============================================================
 * conflict-advice.js — L26-X6 冲突仲裁建议
 *
 * 【治的欠债】L25-X8 只把冲突「标出来」，用户看着两条互斥的记忆不知道选哪个。
 *   本档只给**建议**：每条冲突 1~2 条建议 + 依据，**仍然不自动改**。
 *
 * 【三条硬要求】
 *   1. 每条冲突给 1~2 条建议，每条都带 `basis`（凭什么这么建议）；
 *   2. 建议**只读**：`autoApply` 恒为 false，`applyAdvice()` 明确拒绝自动执行；
 *   3. 用户不采纳不影响后续 —— 建议函数是纯函数，不写任何状态。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaConflictAdvice = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var KINDS = Object.freeze(['value', 'event', 'timeline']);
    var AUTO_APPLY = false;

    function hasEvidence(side) {
        return !!(side && side.messageId);
    }

    function strengthOf(side) {
        return side && typeof side.strength === 'number' && isFinite(side.strength) ? side.strength : null;
    }

    /**
     * @param {{id:string, kind?:string, local:object, remote:object, note?:string}} conflict
     */
    function advise(conflict) {
        var c = conflict || {};
        var kind = KINDS.indexOf(c.kind) >= 0 ? c.kind : 'value';
        var local = c.local || {};
        var remote = c.remote || {};
        var out = [];

        if (hasEvidence(local) && !hasEvidence(remote)) {
            out.push({
                action: 'keep-local',
                basis: '本地这条有证据消息 ' + local.messageId + '，远端没有',
                risk: '若远端其实也有证据但没登记，这里会建议错'
            });
        } else if (hasEvidence(remote) && !hasEvidence(local)) {
            out.push({
                action: 'keep-remote',
                basis: '远端这条有证据消息 ' + remote.messageId + '，本地没有',
                risk: '远端证据可能是另一段对话的，需人眼看一眼'
            });
        }

        if (!out.length) {
            var ls = strengthOf(local);
            var rs = strengthOf(remote);
            if (ls !== null && rs !== null && ls !== rs) {
                var higher = ls > rs ? 'local' : 'remote';
                out.push({
                    action: higher === 'local' ? 'keep-local' : 'keep-remote',
                    basis: (higher === 'local' ? '本地' : '远端') + '显著度更高（' + Math.max(ls, rs) + ' vs ' + Math.min(ls, rs) + '）',
                    risk: '显著度是历史召回统计，不代表更正确'
                });
            }
        }

        if (kind === 'event' && out.length < 2) {
            var lt = typeof local.at === 'number' && isFinite(local.at) ? local.at : null;
            var rt = typeof remote.at === 'number' && isFinite(remote.at) ? remote.at : null;
            if (lt !== null && rt !== null && lt !== rt) {
                out.push({
                    action: rt > lt ? 'keep-remote' : 'keep-local',
                    basis: '事件时间更新的一侧更可能是后改的（' + Math.max(lt, rt) + ' 晚于 ' + Math.min(lt, rt) + '）',
                    risk: '后改不一定更对，也可能记错了时间'
                });
            }
        }

        if (out.length < 2) {
            out.push({
                action: 'keep-both',
                basis: '两侧都无法从证据或时间上分出高下，保守做法是都留着并标注「待确认」',
                risk: '两条互斥记忆同时存在，回答时可能自相矛盾'
            });
        }

        return {
            id: c.id === undefined ? null : c.id,
            kind: kind,
            suggestions: out.slice(0, 2),
            autoApply: AUTO_APPLY,
            reading: 'conflict-advice:' + out.slice(0, 2).map(function (s) { return s.action; }).join('+')
        };
    }

    function adviseAll(conflicts) {
        var list = Array.isArray(conflicts) ? conflicts : [];
        var items = list.map(advise);
        return {
            items: items,
            count: items.length,
            autoApply: AUTO_APPLY,
            reading: items.length ? ('conflict-advised:' + items.length) : 'conflict-none'
        };
    }

    /** 显式拒绝自动执行：本档只建议，改数据必须走用户的动作。 */
    function applyAdvice() {
        var err = new Error('[L26-X6] 本档只给建议，不自动改记忆；请在冲突页里由人点选');
        err.code = 'ADVICE_NOT_APPLICABLE';
        throw err;
    }

    return {
        KINDS: KINDS,
        AUTO_APPLY: AUTO_APPLY,
        advise: advise,
        adviseAll: adviseAll,
        applyAdvice: applyAdvice
    };
}));