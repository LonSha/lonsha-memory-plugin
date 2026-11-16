/**
 * memory-archive-pack.js — 记忆档案包导出 —— 唯一桥（v3.472.0 · L22-X8）
 *
 * 纪律：纯函数。把一段剧情范围的记忆打成「可回放」的包结构。
 * 隐私键一律剔除（不许导出 settings/apiKey/token 之流），并在结果里如实报剔除数。
 * 四态：invalid / empty / packed。
 */
(function (global) {
    'use strict';

    var FACES = ['invalid', 'empty', 'packed'];
    var PRIVATE_KEYS = ['apiKey', 'token', 'password', 'secret', 'authorization', 'cookie'];
    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }
    function isPrivate(key) {
        var k = String(key == null ? '' : key).toLowerCase();
        for (var i = 0; i < PRIVATE_KEYS.length; i++) if (k.indexOf(PRIVATE_KEYS[i].toLowerCase()) >= 0) return true;
        return false;
    }
    function scrub(obj, counter) {
        if (Array.isArray(obj)) return obj.map(function (x) { return scrub(x, counter); });
        if (obj && typeof obj === 'object') {
            var out = {};
            for (var k in obj) {
                if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
                if (isPrivate(k)) { counter.n++; continue; }
                out[k] = scrub(obj[k], counter);
            }
            return out;
        }
        return obj;
    }

    function buildPack(items, range) {
        var arr = Array.isArray(items) ? items : null;
        if (!arr) return { face: 'invalid', pack: null };
        var from = range ? numOrNull(range.from) : null;
        var to = range ? numOrNull(range.to) : null;
        var kept = [];
        for (var i = 0; i < arr.length; i++) {
            var it = arr[i];
            if (!it || typeof it !== 'object') continue;
            var at = numOrNull(it.storyAt != null ? it.storyAt : it.at);
            if (from !== null && (at === null || at < from)) continue;
            if (to !== null && (at === null || at > to)) continue;
            kept.push(it);
        }
        var counter = { n: 0 };
        var scrubbed = scrub(kept, counter);
        if (scrubbed.length === 0) return { face: 'empty', pack: null, scrubbed: counter.n };
        return {
            face: 'packed',
            pack: { schema: 'lonsha-memory-pack@1', items: scrubbed, count: scrubbed.length },
            scrubbed: counter.n
        };
    }

    function packNote(r) {
        if (!r) return '读不出档案包';
        if (r.face === 'invalid') return '这些记忆读不出来';
        if (r.face === 'empty') return '这段剧情范围里没有可导出的记忆';
        var extra = r.scrubbed ? '（剔除 ' + r.scrubbed + ' 处隐私键）' : '';
        return '打包 ' + r.pack.count + ' 条记忆' + extra;
    }

    function selfCheck() {
        var bad = [];
        if (buildPack(null).face !== 'invalid') bad.push('非数组应 invalid');
        if (buildPack([]).face !== 'empty') bad.push('空应 empty');
        var r = buildPack([
            { storyAt: 100, text: 'a', apiKey: 'secret123', nested: { token: 't' } },
            { storyAt: 200, text: 'b' }
        ], { from: 50, to: 300 });
        if (r.face !== 'packed' || r.pack.count !== 2) bad.push('打包数错');
        if (r.scrubbed !== 2) bad.push('隐私键剔除数错，得 ' + r.scrubbed);
        if ('apiKey' in r.pack.items[0]) bad.push('隐私键未剔除');
        if ('token' in r.pack.items[0].nested) bad.push('嵌套隐私键未剔除');
        var ranged = buildPack([{ storyAt: 100 }, { storyAt: 999 }], { from: 0, to: 500 });
        if (ranged.pack.count !== 1) bad.push('范围过滤错');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { FACES: FACES, PRIVATE_KEYS: PRIVATE_KEYS, buildPack: buildPack, packNote: packNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaMemoryArchivePack = api;
})(typeof window !== 'undefined' ? window : globalThis);
