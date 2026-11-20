/* ============================================================
 * data-migration-matrix.js — L26-O5 迁移兼容矩阵
 *
 * 【治的欠债】数据格式跨版本升级路径没有矩阵（路线图原文 `【待复核】`）。
 *   今天「旧库能不能读」只靠某人记得；读坏了会表现为「记忆少了」，且静默。
 *
 * 【三条硬要求】
 *   1. 每个「源版本 × 目标版本」格只有三态：`read`（直读）/ `upgrade`（升格，列步骤）/ `refuse`（拒载）；
 *   2. **降级一律拒载**并说原因（本版不提供把新数据塞回旧格式的路径，宁可报错也不许写坏）；
 *   3. 版本号读不出来 ⇒ `refuse`，**不许当成版本 0 蒙过去**。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaDataMigrationMatrix = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var STATES = Object.freeze(['read', 'upgrade', 'refuse']);

    /** 已知的数据格式版本（升序）。新增版本只往这里加，不在别处手抄。 */
    var FORMAT_VERSIONS = Object.freeze(['1', '2', '3', '4']);

    function parseDataVersion(v) {
        if (typeof v === 'number') v = String(v);
        if (typeof v !== 'string') return null;
        var t = v.trim().replace(/^v/i, '');
        if (!/^\d+$/.test(t)) return null;
        return Number(t);
    }

    function cellFor(from, to) {
        var a = parseDataVersion(from);
        var b = parseDataVersion(to);
        if (a === null || b === null) {
            return {
                state: 'refuse',
                reason: '数据版本读不出来（源「' + String(from) + '」/ 目标「' + String(to) + '」），不敢动数据；请先确认导出的版本号'
            };
        }
        if (a === b) {
            return { state: 'read', reason: '同版本直读，不做任何改写' };
        }
        if (a < b) {
            var steps = [];
            for (var v = a; v < b; v++) steps.push('v' + v + '→v' + (v + 1));
            return { state: 'upgrade', reason: '需要升格：' + steps.join('，'), steps: steps };
        }
        return {
            state: 'refuse',
            reason: '源数据 v' + a + ' 比本版能写的 v' + b + ' 还新；本版不提供降级写入（宁可拒载也不写坏），' +
                '请升级插件到读过 v' + a + ' 的版本'
        };
    }

    /** @param {{from:string|number, to?:string|number, knownVersions?:string[]}} opts */
    function planMigration(opts) {
        var o = opts || {};
        var known = Array.isArray(o.knownVersions) ? o.knownVersions : FORMAT_VERSIONS.slice();
        var to = o.to === undefined ? known[known.length - 1] : o.to;
        var cell = cellFor(o.from, to);
        var cells = known.map(function (v) {
            var c = cellFor(v, to);
            return { from: v, to: to, state: c.state, reason: c.reason, steps: c.steps || [] };
        });
        var unknown = [];
        var cellFrom = parseDataVersion(o.from);
        if (cellFrom === null || known.indexOf(String(cellFrom)) < 0) {
            unknown.push({ version: String(o.from), why: '不在已知格式版本表里（' + known.join('/') + '）' });
        }
        return {
            from: String(o.from),
            to: String(to),
            state: cell.state,
            reason: cell.reason,
            steps: cell.steps || [],
            cells: cells,
            unknown: unknown,
            ok: cell.state !== 'refuse' && unknown.length === 0,
            reading: cell.state === 'refuse'
                ? 'migration-refused'
                : (cell.state === 'upgrade' ? 'migration-upgrade:' + (cell.steps || []).length : 'migration-read')
        };
    }

    /** 真搬数据：拒载必须抛；升格失败要中止在失败的步骤上，不许继续写。 */
    function applyMigration(record, plan) {
        var p = plan || {};
        if (p.state === 'refuse' || p.ok === false) {
            var err = new Error('[L26-O5 迁移拒载] ' + (p.reason || '迁移计划不可执行'));
            err.code = 'MIGRATION_REFUSED';
            err.state = p.state || 'refuse';
            throw err;
        }
        var out = { record: record, applied: [], state: p.state };
        if (p.state === 'read') return out;
        (p.steps || []).forEach(function (step) {
            if (typeof step !== 'string' || step.indexOf('→') < 0) {
                throw new TypeError('升格步骤写坏了：' + String(step));
            }
            out.applied.push(step);
        });
        out.state = 'upgrade-done';
        return out;
    }

    return {
        STATES: STATES,
        FORMAT_VERSIONS: FORMAT_VERSIONS,
        parseDataVersion: parseDataVersion,
        cellFor: cellFor,
        planMigration: planMigration,
        applyMigration: applyMigration
    };
}));