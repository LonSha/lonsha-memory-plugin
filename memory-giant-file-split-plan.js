/**
 * memory-giant-file-split-plan.js — 巨型文件拆分计划 —— 唯一桥（v3.472.0 · L22-O1）
 *
 * 纪律：纯函数。吃「文件行数与职责标记」，吐出「按职责切分后的目标文件与行数预算」。
 * 只给计划，不执行拆分。上界判据据此；超预算如实标 over。四态：invalid / ok / over。
 */
(function (global) {
    'use strict';

    var FACES = ['invalid', 'ok', 'over'];
    var DEFAULT_BUDGET = 3000;

    function planSplit(spec) {
        if (!spec || typeof spec !== 'object') return { face: 'invalid', plan: [] };
        var lines = Number(spec.lines);
        if (!isFinite(lines) || lines < 0) return { face: 'invalid', plan: [] };
        var budget = Number(spec.budget);
        if (!isFinite(budget) || budget <= 0) budget = DEFAULT_BUDGET;
        var responsibilities = Array.isArray(spec.responsibilities) ? spec.responsibilities.filter(function (x) { return x && typeof x === 'object'; }) : [];
        if (responsibilities.length === 0) {
            var over0 = lines > budget;
            return { face: over0 ? 'over' : 'ok', plan: [{ name: String(spec.file || 'index'), weight: lines, budget: budget, over: over0 }], over: over0 };
        }
        var totalWeight = 0;
        var i;
        for (i = 0; i < responsibilities.length; i++) {
            var w = Number(responsibilities[i].weight);
            totalWeight += (isFinite(w) && w > 0) ? w : 1;
        }
        var plan = [];
        var anyOver = false;
        for (i = 0; i < responsibilities.length; i++) {
            var r = responsibilities[i];
            var ww = Number(r.weight);
            if (!isFinite(ww) || ww <= 0) ww = 1;
            var share = Math.round((ww / totalWeight) * lines);
            var isOver = share > budget;
            if (isOver) anyOver = true;
            plan.push({ name: String(r.name || ('part' + i)), weight: ww, budget: share, over: isOver });
        }
        return { face: anyOver ? 'over' : 'ok', plan: plan, over: anyOver, source: String(spec.file || '') };
    }

    function splitPlanNote(r) {
        if (!r) return '读不出拆分计划';
        if (r.face === 'invalid') return '文件规模读不出来';
        if (r.face === 'ok') return '拆成 ' + r.plan.length + ' 个文件，均在预算内';
        var overs = r.plan.filter(function (p) { return p.over; }).length;
        return '拆成 ' + r.plan.length + ' 个文件，其中 ' + overs + ' 个仍超预算';
    }

    function selfCheck() {
        var bad = [];
        if (planSplit(null).face !== 'invalid') bad.push('空应 invalid');
        if (planSplit({ lines: -1 }).face !== 'invalid') bad.push('负行数应 invalid');
        var ok = planSplit({ file: 'big.js', lines: 9000, budget: 3000, responsibilities: [{ name: 'a', weight: 1 }, { name: 'b', weight: 1 }, { name: 'c', weight: 1 }] });
        if (ok.face !== 'ok') bad.push('均分应 ok');
        if (ok.plan.length !== 3) bad.push('文件数错');
        if (ok.plan[0].budget !== 3000) bad.push('预算均分错，得 ' + ok.plan[0].budget);
        var over = planSplit({ lines: 9000, budget: 3000, responsibilities: [{ name: 'huge', weight: 10 }, { name: 'tiny', weight: 1 }] });
        if (over.face !== 'over') bad.push('不均应 over');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { FACES: FACES, DEFAULT_BUDGET: DEFAULT_BUDGET, planSplit: planSplit, splitPlanNote: splitPlanNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaGiantFileSplitPlan = api;
})(typeof window !== 'undefined' ? window : globalThis);
