/**
 * memory-capacity-watermark.js — 容量水位与淘汰预告 —— 唯一桥（v3.473.0 · L23-X8）
 *
 * 纪律：**只预告，不执行**。输出里 executed 恒 false、requiresConfirmation 恒 true，
 *   并且**绝不修改入参**（判据用深比较钉住）。淘汰候选只按 significance 从低到高排，
 *   不按「新近」排 —— 新近不是重要性。
 * 三态：ok（水线下）/ near（接近但未满）/ over（已超）。
 */
(function (global) {
    'use strict';

    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    function forecastCapacity(input, opts) {
        var o = opts && typeof opts === 'object' ? opts : {};
        if (!input || typeof input !== 'object') return { face: 'invalid', reason: 'no-input' };
        var used = numOrNull(input.used);
        var capacity = numOrNull(input.capacity);
        if (used === null || capacity === null || capacity <= 0) return { face: 'invalid', reason: 'bad-numbers' };
        var growth = numOrNull(input.perTurnGrowth);
        if (growth === null) growth = 0;
        var ahead = numOrNull(o.turnsAhead);
        if (ahead === null) ahead = numOrNull(input.turnsAhead);
        if (ahead === null) ahead = 10;
        var ratio = used / capacity;
        var projected = used + growth * ahead;
        var nearAt = numOrNull(o.nearAt);
        if (nearAt === null) nearAt = 0.8;
        var units = Array.isArray(input.units) ? input.units : [];
        var evictions = [];
        if (projected > capacity) {
            var sorted = units
                .filter(function (u) { return u && typeof u === 'object'; })
                .map(function (u, i) {
                    return {
                        id: u.id == null ? '#' + i : String(u.id),
                        size: numOrNull(u.size) === null ? 0 : numOrNull(u.size),
                        significance: numOrNull(u.significance) === null ? 0 : numOrNull(u.significance)
                    };
                })
                .sort(function (a, b) { return a.significance - b.significance; });
            var need = projected - capacity;
            var freed = 0;
            for (var i = 0; i < sorted.length && freed < need; i++) {
                evictions.push({ id: sorted[i].id, size: sorted[i].size, significance: sorted[i].significance });
                freed += sorted[i].size;
            }
            if (freed < need) evictions.push({ id: null, size: need - freed, significance: null, note: '账上不够抵，缺口没填满' });
        }
        var face = projected > capacity ? 'over' : ratio >= nearAt ? 'near' : 'ok';
        return {
            face: face,
            used: used,
            capacity: capacity,
            ratio: Math.round(ratio * 1000) / 1000,
            projected: projected,
            turnsAhead: ahead,
            evictionCandidates: evictions,
            executed: false,
            requiresConfirmation: true
        };
    }

    function capacityNote(res) {
        if (!res || res.face === 'invalid') return '水位读不出来';
        var head = '已用 ' + Math.round(res.ratio * 100) + '%，' + res.turnsAhead + ' 轮后约 ' + res.projected;
        if (res.face === 'ok') return head + '，还在水线下';
        if (res.face === 'near') return head + '，接近上限';
        return head + '，会超出 ' + (res.evictionCandidates.length ? '；可考虑先淘汰 ' + res.evictionCandidates.length + ' 项（尚未执行）' : '');
    }

    function selfCheck() {
        var bad = [];
        var input = {
            used: 990, capacity: 1000, perTurnGrowth: 5, turnsAhead: 10,
            units: [{ id: 'a', size: 40, significance: 0.9 }, { id: 'b', size: 60, significance: 0.1 }]
        };
        var snapshot = JSON.stringify(input);
        var r = forecastCapacity(input, {});
        if (r.face !== 'over') bad.push('990+50 应 over');
        if (r.executed !== false) bad.push('不许执行');
        if (r.requiresConfirmation !== true) bad.push('必须等人确认');
        if (r.evictionCandidates[0].id !== 'b') bad.push('应先淘汰 significance 最低的');
        if (JSON.stringify(input) !== snapshot) bad.push('不许改入参');
        if (forecastCapacity({ used: 10, capacity: 1000 }, {}).face !== 'ok') bad.push('低水位应 ok');
        if (forecastCapacity({ used: 850, capacity: 1000, perTurnGrowth: 0 }, {}).face !== 'near') bad.push('85% 应 near');
        if (forecastCapacity({ used: 1, capacity: 0 }, {}).face !== 'invalid') bad.push('capacity=0 应 invalid');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { forecastCapacity: forecastCapacity, capacityNote: capacityNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaMemoryCapacityWatermark = api;
})(typeof window !== 'undefined' ? window : globalThis);