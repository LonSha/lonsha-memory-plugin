/* ============================================================
 * doc-readings-generator.js — L26-O9 文档与实现同源
 *
 * 【治的欠债】文档里的读数靠手抄，容易过期：改完代码忘了改文档，于是
 *   README 写着 605 个测试、实际 623 个，读的人（和以后的我）都当真。
 *
 * 【三条硬要求】
 *   1. 读数由生成器产出（`collectReadings()` 只接受**注入的测量函数**，不在文档侧编数）；
 *   2. 文档里声明的读数逐条对拍；不一致 ⇒ `stale` 并点名「文档写 X、实际 Y」；
 *   3. 文档里出现但生成器**量不出来**的读数 ⇒ `unverifiable`，单列，
 *      **不许并进 ok**（量不出来的数不算通过，也不算失败）。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaDocReadingsGenerator = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * @param {object} measures {读数键: () => 数字}
     * 键必须写成「文档里出现的字面名字」，这样对拍不靠别名映射（别名表本身就是手抄）。
     */
    function collectReadings(measures) {
        var m = measures || {};
        var out = {};
        var failures = [];
        Object.keys(m).forEach(function (key) {
            var fn = m[key];
            if (typeof fn !== 'function') {
                failures.push({ key: key, why: '测量器不是函数' });
                return;
            }
            var v = fn();
            if (typeof v !== 'number' || !isFinite(v)) {
                failures.push({ key: key, why: '测量器返回的不是数字：' + String(v) });
                return;
            }
            out[key] = v;
        });
        return { readings: out, failures: failures, ok: failures.length === 0 };
    }

    /**
     * 扫文档里 `键: 数字` / `键：数字` / `键 = 数字` 的声明。
     * @param {string} docText
     * @param {string[]} keys 关心的读数键（其余字样不当读数）
     */
    function extractClaims(docText, keys) {
        var src = String(docText || '');
        var wanted = Array.isArray(keys) ? keys : [];
        var claims = [];
        wanted.forEach(function (key) {
            var re = new RegExp(escapeRe(key) + '\\s*[:：=]\\s*(\\d+)', 'g');
            var m;
            while ((m = re.exec(src)) !== null) {
                claims.push({ key: key, value: Number(m[1]), at: m.index });
            }
        });
        return claims;
    }

    function escapeRe(s) {
        return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * 对拍：文档 vs 生成物。
     * @param {{docText:string, readings:object}} opts
     */
    function auditDoc(opts) {
        var o = opts || {};
        var readings = o.readings || {};
        var keys = Object.keys(readings);
        var claims = extractClaims(o.docText, keys);
        var stale = [];
        claims.forEach(function (c) {
            if (readings[c.key] !== c.value) {
                stale.push({ key: c.key, doc: c.value, actual: readings[c.key] });
            }
        });
        // 文档里出现「像读数却量不出来」的键：单列，不许当通过。
        var unverifiable = [];
        var looseRe = /([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9_]{1,20})\s*[:：]\s*(\d+)/g;
        var m;
        while ((m = looseRe.exec(String(o.docText || ''))) !== null) {
            var k = m[1].trim();
            if (keys.indexOf(k) >= 0) continue;
            if (unverifiable.some(function (u) { return u.key === k; })) continue;
            unverifiable.push({ key: k, doc: Number(m[2]) });
        }
        return {
            claims: claims,
            stale: stale,
            unverifiable: unverifiable,
            /** 有声明、且每条都等于生成值，才算同源。 */
            ok: stale.length === 0 && claims.length > 0,
            reading: claims.length === 0
                ? 'doc-no-readings'
                : (stale.length ? ('doc-stale:' + stale.map(function (s) { return s.key; }).join(',')) : 'doc-synced')
        };
    }

    /** 生成文档片段：读数只从生成物来，文档侧不许自己写数。 */
    function renderReadingsBlock(readings, title) {
        var keys = Object.keys(readings || {}).sort();
        var lines = ['### ' + (title || '实读读数'), '', '| 读数 | 值 |', '|---|---|'];
        keys.forEach(function (k) {
            lines.push('| ' + k + ' | ' + readings[k] + ' |');
        });
        lines.push('', '> 本表由 `doc-readings-generator.js` 生成，手改无效。');
        return lines.join('\n');
    }

    return {
        collectReadings: collectReadings,
        extractClaims: extractClaims,
        auditDoc: auditDoc,
        renderReadingsBlock: renderReadingsBlock
    };
}));