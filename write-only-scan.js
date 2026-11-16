/**
 * write-only-scan.js — 写了不读扫描 —— 唯一桥（v3.472.0 · L22-O9）
 *
 * 纪律：纯函数。吃「键的写次数与读次数」，吐 write-only（写了没读）/ read-only / balanced 三桶。
 * 只报事实，不替人裁。四态：invalid / empty / clean / findings。
 */
(function (global) {
    'use strict';

    var FACES = ['invalid', 'empty', 'clean', 'findings'];

    function scan(fields) {
        if (!Array.isArray(fields)) return { face: 'invalid', writeOnly: [], readOnly: [], balanced: [] };
        var writeOnly = [];
        var readOnly = [];
        var balanced = [];
        for (var i = 0; i < fields.length; i++) {
            var f = fields[i];
            if (!f || typeof f !== 'object') continue;
            var key = String(f.key == null ? '' : f.key);
            var w = Number(f.writes), r = Number(f.reads);
            if (!isFinite(w) || !isFinite(r)) continue;
            if (w > 0 && r === 0) writeOnly.push({ key: key, writes: w });
            else if (r > 0 && w === 0) readOnly.push({ key: key, reads: r });
            else balanced.push(key);
        }
        var total = writeOnly.length + readOnly.length + balanced.length;
        var face;
        if (total === 0) face = 'empty';
        else if (writeOnly.length === 0) face = 'clean';
        else face = 'findings';
        return { face: face, writeOnly: writeOnly, readOnly: readOnly, balanced: balanced };
    }

    function scanNote(r) {
        if (!r) return '读不出写读扫描';
        if (r.face === 'invalid') return '字段读不出来';
        if (r.face === 'empty') return '没有可扫的字段';
        if (r.face === 'clean') return '没有写了不读的字段';
        return r.writeOnly.length + ' 个字段写了没人读：' + r.writeOnly.map(function (x) { return x.key; }).join('、');
    }

    function selfCheck() {
        var bad = [];
        if (scan(null).face !== 'invalid') bad.push('非数组应 invalid');
        if (scan([]).face !== 'empty') bad.push('空应 empty');
        if (scan([{ key: 'a', writes: 1, reads: 2 }]).face !== 'clean') bad.push('有读应 clean');
        var r = scan([{ key: 'a', writes: 3, reads: 0 }, { key: 'b', writes: 1, reads: 1 }, { key: 'c', writes: 0, reads: 5 }]);
        if (r.face !== 'findings') bad.push('有写不读应 findings');
        if (r.writeOnly.length !== 1 || r.writeOnly[0].key !== 'a') bad.push('写不读识别错');
        if (r.readOnly.length !== 1 || r.readOnly[0].key !== 'c') bad.push('只读识别错');
        if (r.balanced.length !== 1) bad.push('平衡数错');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { FACES: FACES, scan: scan, scanNote: scanNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaWriteOnlyScan = api;
})(typeof window !== 'undefined' ? window : globalThis);
