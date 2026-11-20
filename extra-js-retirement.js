/* ============================================================
 * extra-js-retirement.js — L26-O2 加载瘦身与退役机制
 *
 * 【治的欠债】`manifest.extra_js` 408 项全量加载（实读文档读数），没有任何
 *   「谁可以退役」的判据。资产也是负债：只增不减的文件名列表，最后谁也不敢删。
 *
 * 【三条硬要求】
 *   1. 每项只能落三档：`retire`（给理由）/ `keep`（给理由）/ `undisposed`（**不许静默存在**）；
 *   2. `undisposed` 非空 ⇒ `ok=false`。清单类交付在本仓不算交付，所以「先放着」不是一档；
 *   3. 退役计划必须**可回滚**：`applyRetirement()` 返回被摘掉的名字（原序位），
 *      `rollbackPlan()` 能逐项还原；已确认仍被消费的文件**拒绝退役**。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaExtraJsRetirement = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var DISPOSITIONS = Object.freeze(['retire', 'keep', 'undisposed']);

    function asList(v) {
        if (!v) return [];
        if (Array.isArray(v)) return v.slice();
        if (typeof v === 'object') return Object.keys(v);
        return [];
    }

    /**
     * 生成退役计划。
     * @param {{extraJs:string[], consumers?:object, testRefs?:object, keep?:object}} opts
     *   consumers: {文件名: 引用它的文件列表}；testRefs: {文件名: 引用它的测试列表}
     *   keep: {文件名: 理由}
     */
    function buildRetirementPlan(opts) {
        var o = opts || {};
        var extraJs = asList(o.extraJs);
        var consumers = o.consumers || {};
        var testRefs = o.testRefs || {};
        var keepMap = o.keep || {};
        var candidates = [];
        var kept = [];
        var undisposed = [];

        extraJs.forEach(function (file) {
            if (typeof file !== 'string' || !file) {
                undisposed.push({ file: String(file), why: '清单里出现了非文件名的项，先修清单' });
                return;
            }
            var cons = asList(consumers[file]).filter(function (x) { return x !== file; });
            var tests = asList(testRefs[file]).filter(function (x) { return x !== file; });

            if (Object.prototype.hasOwnProperty.call(keepMap, file)) {
                var reason = keepMap[file];
                if (typeof reason !== 'string' || reason.trim().length < 4) {
                    undisposed.push({ file: file, why: '标了 keep 却没写理由（要写「靠什么活着」）' });
                    return;
                }
                kept.push({ file: file, disposition: 'keep', reason: reason.trim(), consumers: cons, tests: tests });
                return;
            }
            if (cons.length > 0) {
                // 有人消费却想删 —— 不许靠「删了再跑」发现。
                kept.push({ file: file, disposition: 'keep', reason: '仍被 ' + cons.length + ' 处引用：' + cons.slice(0, 3).join('、'), consumers: cons, tests: tests });
                return;
            }
            if (tests.length > 0) {
                candidates.push({
                    file: file, disposition: 'retire', kind: 'test-only',
                    reason: '只在测试里被引用（' + tests.slice(0, 2).join('、') + '），运行时无人消费',
                    consumers: cons, tests: tests
                });
                return;
            }
            candidates.push({
                file: file, disposition: 'retire', kind: 'zero-reference',
                reason: '运行时与测试都没有引用（零消费）',
                consumers: cons, tests: tests
            });
        });

        return {
            candidates: candidates,
            kept: kept,
            undisposed: undisposed,
            ok: undisposed.length === 0,
            reading: undisposed.length === 0
                ? 'retirement-plan:' + candidates.length + ' 可退役 / ' + kept.length + ' 保留'
                : 'retirement-undisposed:' + undisposed.length
        };
    }

    function applyRetirement(extraJs, plan) {
        var list = asList(extraJs);
        var p = plan || {};
        var retiring = (p.candidates || []).map(function (c) { return c.file; });
        var blocked = retiring.filter(function (f) {
            var row = (p.kept || []).filter(function (k) { return k.file === f; })[0];
            return !!row && asList(row.consumers).length > 0;
        });
        if (blocked.length) {
            var err = new Error('[L26-O2 拒绝退役] 这些文件仍被消费：' + blocked.join('、'));
            err.code = 'RETIRE_BLOCKED';
            err.blocked = blocked;
            throw err;
        }
        var removed = [];
        var next = list.filter(function (f, idx) {
            if (retiring.indexOf(f) < 0) return true;
            removed.push({ file: f, index: idx });
            return false;
        });
        return {
            extraJs: next,
            removed: removed,
            /** 回滚要带**原始序位**：只留文件名会让「按位插回」退化成「一律追加到末尾」。 */
            rollback: { extraJs: list.slice(), removed: removed.slice() }
        };
    }

    /** 回滚：按原序位插回。位次越界就夹到末尾，但**不猜**——回滚结果要与原清单逐项相等。 */
    function rollbackPlan(current, rollback) {
        var cur = asList(current);
        var r = rollback || {};
        var back = (r.removed || []).slice();
        var positions = (r.removed && r.removed.length && typeof r.removed[0] === 'object')
            ? r.removed
            : back.map(function (f) { return { file: f, index: -1 }; });
        var out = cur.slice();
        positions.forEach(function (item) {
            if (out.indexOf(item.file) >= 0) return;
            var at = typeof item.index === 'number' && item.index >= 0 ? Math.min(item.index, out.length) : out.length;
            out.splice(at, 0, item.file);
        });
        return {
            extraJs: out,
            restored: back.length,
            identicalToOriginal: asList(r.extraJs).length === out.length
                && asList(r.extraJs).every(function (f, i) { return out[i] === f; })
        };
    }

    return {
        DISPOSITIONS: DISPOSITIONS,
        buildRetirementPlan: buildRetirementPlan,
        applyRetirement: applyRetirement,
        rollbackPlan: rollbackPlan
    };
}));
