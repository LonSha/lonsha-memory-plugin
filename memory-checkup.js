/**
 * memory-checkup.js — 记忆体检 —— 唯一桥（v3.472.0 · L22-X4）
 *
 * 纪律：纯函数只读，吃一份「记忆库读数」吐健康项清单。不重算冲突/过期（那是各自引擎的账），
 * 只汇总与分档。每项可点进去（带源标识）。四态：invalid / healthy / warning / critical。
 */
(function (global) {
    'use strict';

    var FACES = ['invalid', 'healthy', 'warning', 'critical'];
    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    function checkup(readings) {
        if (!readings || typeof readings !== 'object') return { face: 'invalid', items: [] };
        var defs = [
            { key: 'conflicts', label: '冲突', warn: 1, crit: 10 },
            { key: 'stale', label: '过期', warn: 5, crit: 20 },
            { key: 'zeroConsumption', label: '零消费', warn: 1, crit: 5 },
            { key: 'duplicates', label: '重复', warn: 5, crit: 20 }
        ];
        var items = [];
        var worst = 'healthy';
        for (var i = 0; i < defs.length; i++) {
            var d = defs[i];
            var n = numOrNull(readings[d.key]);
            if (n === null) { items.push({ key: d.key, label: d.label, value: null, level: 'unknown' }); continue; }
            var level = 'ok';
            if (n >= d.crit) { level = 'critical'; worst = 'critical'; }
            else if (n >= d.warn) { level = 'warning'; if (worst !== 'critical') worst = 'warning'; }
            items.push({ key: d.key, label: d.label, value: n, level: level });
        }
        return { face: worst, items: items };
    }

    function checkupNote(r) {
        if (!r) return '读不出体检结果';
        if (r.face === 'invalid') return '记忆库读数读不出来';
        if (r.face === 'healthy') return '记忆库一切正常';
        var bad = r.items.filter(function (it) { return it.level === 'warning' || it.level === 'critical'; });
        var summary = bad.map(function (it) { return it.label + ' ' + it.value; }).join('、');
        return (r.face === 'critical' ? '需要处理：' : '注意：') + summary;
    }

    function selfCheck() {
        var bad = [];
        if (checkup(null).face !== 'invalid') bad.push('空读数应 invalid');
        var ok = checkup({ conflicts: 0, stale: 0, zeroConsumption: 0, duplicates: 0 });
        if (ok.face !== 'healthy') bad.push('全零应 healthy');
        var warn = checkup({ conflicts: 3, stale: 0, zeroConsumption: 0, duplicates: 0 });
        if (warn.face !== 'warning') bad.push('单项预警应 warning');
        var crit = checkup({ conflicts: 3, stale: 30 });
        if (crit.face !== 'critical') bad.push('超阈应 critical');
        var unknown = checkup({});
        if (unknown.items[0].level !== 'unknown') bad.push('缺读数应 unknown 不冒充 0');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { FACES: FACES, checkup: checkup, checkupNote: checkupNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaMemoryCheckup = api;
})(typeof window !== 'undefined' ? window : globalThis);
