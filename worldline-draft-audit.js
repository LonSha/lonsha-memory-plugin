/* L21-X7: worldline-draft-audit. Audits a worldline jump draft BEFORE save,
 * on semantics the parser cannot see. Five independent checks, each with its
 * own ok/findings — NEVER merged into a single "draft has errors" boolean:
 *   1. floorOrder      — 楼层必须沿跳次不回退（第 n 跳 < 第 n-1 跳 ⇒ 逐处报）
 *   2. epochConflict   — 同一数字编号(divergence)被两条不同线占用 ⇒ 冲突
 *   3. prehistoryGap   — 首跳楼层之前没有锚（前史缺口，逐跳可点回源）
 *   4. whyEmpty        — 每跳的 why（跳的动机）不得为空
 *   5. duplicateFloor  — 同一楼层不得出现两次跳
 * Input: array of { floor, lineId, divergence?, why?, line? } (line = 1-based
 * source line for the editor's jump-to-row). Output: { reports, findingsFlat }. */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaWorldlineDraftAudit = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const VERSION = '1.0.0-L21-X7';

    function normJumps(jumps) {
        return (Array.isArray(jumps) ? jumps : [])
            .map(function (j, i) {
                return {
                    jumpNo: i + 1,
                    line: (j && Number.isFinite(j.line)) ? j.line : (i + 1),
                    floor: (j && Number.isFinite(j.floor)) ? Math.floor(j.floor) : null,
                    lineId: (j && j.lineId != null) ? String(j.lineId).trim() : '',
                    divergence: (j && Number.isFinite(j.divergence)) ? j.divergence : null,
                    why: (j && j.why != null) ? String(j.why).trim() : ''
                };
            })
            .filter(function (j) { return j.floor !== null || j.lineId !== ''; });
    }

    /* 五档各报各的。每档 { check, ok, findings:[{jumpNo, line, message}] }。 */
    function auditDraft(jumps) {
        const js = normJumps(jumps);
        const reports = [];

        // 1. floorOrder
        const floorFindings = [];
        for (let i = 1; i < js.length; i++) {
            if (js[i].floor !== null && js[i - 1].floor !== null && js[i].floor < js[i - 1].floor) {
                floorFindings.push({
                    jumpNo: js[i].jumpNo, line: js[i].line,
                    message: '第 ' + js[i].jumpNo + ' 跳楼层 ' + js[i].floor + ' < 第 ' + js[i - 1].jumpNo + ' 跳 ' + js[i - 1].floor
                });
            }
        }
        reports.push({ check: 'floorOrder', ok: floorFindings.length === 0, findings: floorFindings });

        // 2. epochConflict — 同 divergence 编号被不同 lineId 占用
        const epochFindings = [];
        const byDiv = {};
        for (let i = 0; i < js.length; i++) {
            if (js[i].divergence === null || !js[i].lineId) continue;
            const k = String(js[i].divergence);
            if (!byDiv[k]) byDiv[k] = { lineIds: [], first: js[i] };
            if (byDiv[k].lineIds.indexOf(js[i].lineId) < 0) byDiv[k].lineIds.push(js[i].lineId);
        }
        Object.keys(byDiv).forEach(function (k) {
            const e = byDiv[k];
            if (e.lineIds.length > 1) {
                epochFindings.push({
                    jumpNo: e.first.jumpNo, line: e.first.line,
                    message: '数字编号 ' + k + ' 被多条线占用（' + e.lineIds.join('、') + '），纪元归属冲突'
                });
            }
        });
        reports.push({ check: 'epochConflict', ok: epochFindings.length === 0, findings: epochFindings });

        // 3. prehistoryGap — 首跳楼层之前的楼层没有锚
        const gapFindings = [];
        if (js.length && js[0].floor !== null && js[0].floor > 1) {
            gapFindings.push({
                jumpNo: js[0].jumpNo, line: js[0].line,
                message: '首跳在第 ' + js[0].floor + ' 层，之前 ' + (js[0].floor - 1) + ' 层无任何锚（前史缺口）'
            });
        }
        reports.push({ check: 'prehistoryGap', ok: gapFindings.length === 0, findings: gapFindings });

        // 4. whyEmpty
        const whyFindings = [];
        for (let i = 0; i < js.length; i++) {
            if (!js[i].why) {
                whyFindings.push({ jumpNo: js[i].jumpNo, line: js[i].line, message: '第 ' + js[i].jumpNo + ' 跳的 why 为空（为什么跳这层必须写）' });
            }
        }
        reports.push({ check: 'whyEmpty', ok: whyFindings.length === 0, findings: whyFindings });

        // 5. duplicateFloor
        const dupFindings = [];
        const seen = {};
        for (let i = 0; i < js.length; i++) {
            if (js[i].floor === null) continue;
            const k = String(js[i].floor);
            if (seen[k]) {
                dupFindings.push({ jumpNo: js[i].jumpNo, line: js[i].line, message: '第 ' + js[i].jumpNo + ' 跳楼层 ' + js[i].floor + ' 与第 ' + seen[k] + ' 跳重复' });
            } else {
                seen[k] = js[i].jumpNo;
            }
        }
        reports.push({ check: 'duplicateFloor', ok: dupFindings.length === 0, findings: dupFindings });

        const findingsFlat = [];
        reports.forEach(function (r) {
            r.findings.forEach(function (f) { findingsFlat.push({ check: r.check, jumpNo: f.jumpNo, line: f.line, message: f.message }); });
        });
        return { reports: reports, findingsFlat: findingsFlat };
    }

    /* 玩家读面：每档一行，红了给「可点跳到该行」的行号列表。无总布尔。 */
    function formatPanel(audit) {
        const rs = audit && Array.isArray(audit.reports) ? audit.reports : [];
        const rows = rs.map(function (r) {
            const mark = r.ok ? '✅' : '❌';
            const lines = r.findings.map(function (f) { return f.line; }).join(',');
            return mark + ' ' + r.check + (r.ok ? '' : '（第 ' + lines + ' 行）');
        });
        return '✔ 保存前自检\n' + rows.join('\n');
    }

    return { VERSION, auditDraft, formatPanel };
}));