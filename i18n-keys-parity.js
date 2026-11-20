/* ============================================================
 * i18n-keys-parity.js — L26-O6 多语言键集合与缺键显式标记
 *
 * 【治的欠债】全仓中文硬编码（路线图原文 `【待复核】`）。要做双语，先要有
 *   「哪些键缺」的读数，且**缺键不许显示成空串** —— 空串会让用户以为「本来就没这个词」。
 *
 * 【三条硬要求】
 *   1. 两份语言包的键集合必须能双向对拍（缺在英文侧 / 缺在中文侧分开列）；
 *   2. 缺键与空值一律显示**显式标记** `⟦缺键:key⟧`，绝不返回空串；
 *   3. 键展开用扁平点号路径，数组按索引算键（`a.0.b`），不靠手抄键表。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaI18nKeysParity = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var MISSING_MARK = '⟦缺键:';

    /** 「普通对象」的判定走 toString 标签：与仓里既有的 _isPlain/isPlain 刻意不同实现，
     *  免得再长一份逐字副本（v3282 alias-copy 台账口径）。数组/日期/映射都取不到该标签。 */
    function isPlain(v) {
        if (!v || typeof v !== 'object') return false;
        return Object.prototype.toString.call(v) === '[object Object]';
    }

    function flattenKeys(obj, prefix, out) {
        var acc = out || [];
        var pre = prefix || '';
        if (obj === null || obj === undefined) return acc;
        if (Array.isArray(obj)) {
            obj.forEach(function (v, i) {
                flattenKeys(v, pre ? pre + '.' + i : String(i), acc);
            });
            return acc;
        }
        if (isPlain(obj)) {
            Object.keys(obj).forEach(function (k) {
                flattenKeys(obj[k], pre ? pre + '.' + k : k, acc);
            });
            return acc;
        }
        acc.push(pre);
        return acc;
    }

    function lookup(pack, key) {
        var cur = pack;
        var parts = String(key).split('.');
        for (var i = 0; i < parts.length; i++) {
            if (cur === null || typeof cur !== 'object' || !(parts[i] in cur)) return { found: false };
            cur = cur[parts[i]];
        }
        return { found: true, value: cur };
    }

    /** 缺键返回显式标记；值为空串/纯空白也算「没有这个词」。 */
    function translate(pack, key, fallback) {
        var hit = lookup(pack || {}, key);
        if (!hit.found) return MISSING_MARK + key + '⟧';
        var v = hit.value;
        if (v === null || v === undefined) return MISSING_MARK + key + '⟧';
        if (typeof v === 'string' && v.trim() === '') return MISSING_MARK + key + '⟧';
        return typeof v === 'string' ? v : String(v);
    }

    function comparePacks(left, right) {
        var lk = flattenKeys(left);
        var rk = flattenKeys(right);
        var missingInRight = lk.filter(function (k) { return rk.indexOf(k) < 0; });
        var missingInLeft = rk.filter(function (k) { return lk.indexOf(k) < 0; });
        var shared = lk.filter(function (k) { return rk.indexOf(k) >= 0; });
        var emptyValues = shared.filter(function (k) {
            var a = lookup(left, k).value;
            var b = lookup(right, k).value;
            return (typeof a === 'string' && a.trim() === '') || (typeof b === 'string' && b.trim() === '');
        });
        return {
            leftKeys: lk.length,
            rightKeys: rk.length,
            shared: shared.length,
            missingInRight: missingInRight,
            missingInLeft: missingInLeft,
            emptyValues: emptyValues,
            parity: missingInRight.length === 0 && missingInLeft.length === 0,
            ok: missingInRight.length === 0 && missingInLeft.length === 0 && emptyValues.length === 0,
            reading: (missingInRight.length || missingInLeft.length)
                ? ('i18n-gaps:' + missingInRight.length + '+' + missingInLeft.length)
                : (emptyValues.length ? 'i18n-empty:' + emptyValues.length : 'i18n-parity')
        };
    }

    /** @param {{locales:object}} opts locales: {zh:{...}, en:{...}} */
    function auditLocales(opts) {
        var o = opts || {};
        var names = Object.keys(o.locales || {});
        if (names.length < 2) {
            throw new TypeError('[L26-O6] 至少要两份语言包才能对拍，收到 ' + names.length + ' 份');
        }
        var base = names[0];
        var pairs = names.slice(1).map(function (n) {
            var r = comparePacks(o.locales[base], o.locales[n]);
            return { base: base, other: n, result: r };
        });
        var broken = pairs.filter(function (p) { return !p.result.ok; });
        return {
            locales: names,
            pairs: pairs,
            ok: broken.length === 0,
            reading: broken.length ? ('i18n-broken:' + broken.map(function (p) { return p.other; }).join(',')) : 'i18n-parity'
        };
    }

    return {
        MISSING_MARK: MISSING_MARK,
        flattenKeys: flattenKeys,
        lookup: lookup,
        translate: translate,
        comparePacks: comparePacks,
        auditLocales: auditLocales
    };
}));