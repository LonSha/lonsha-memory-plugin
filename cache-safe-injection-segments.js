/* ========================================================
 * cache-safe-injection-segments.js — [v3.484.0] 注入分段（缓存友好）
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   本插件的注入是「把这一轮要注入的块按当下算出来的顺序拼成一串」——
 *   `engine-injection-pipeline.js` 里 `stablePrefix` / `prefixCache` / `kvCache`
 *   三个词的出现次数为 **0**（全仓 467 个运行时模块实测同为此读数）。
 *   后果不是「注入错了」，是**每轮都在重算一遍过去**：只要稳定内容（人物档案、
 *   正史、长期事实）与本轮召回在同一条字符串里交错，且顺序随召回结果抖动，
 *   宿主的 KV 前缀缓存就一次都命中不了 —— 明明同一段文本上一轮刚算过。
 *
 * 【缝合来源 / 只搬纪律不搬实现】
 *   源：光域·镜忆 V0.1 的「90-10 前缀缓存保护」。它把注入切成
 *   **前 90% 跨轮不变、后 10% 才是本轮变动**，并且顺序由固定排序键决定。
 *   本模块只搬这条纪律，不搬它的存储与向量层（本仓已有自己的召回内核）。
 *
 * 【三档不可混同（本仓 R2-A 同族纪律）】
 *   'plannable'  —— 块集合非空且能定序，可算比例
 *   'no_stable'  —— 一个稳定块都没有（首轮 / 全是本轮召回）⇒ 比例记 null，不记 0
 *   'malformed'  —— 入参不是数组 / 全是非法块 ⇒ 原样回空面，不抛
 *   三档读数都是「0 个稳定块」时长得一样，混同就分不清「机制没接上」与
 *   「这一轮本来就只有新内容」。
 *
 * 【不做什么（边界）】
 *   · 不取 token 真值：只吃调用方给的字符数口径（`chars`），token 换算在调用方；
 *   · 不改块内容、不裁块：裁预算另有 `prompt-budget-dynamic-allocator.js`；
 *   · 不读 window / 不读 DOM / 不发请求：纯函数、可单测、同输入同输出；
 *   · 不替调用方决定「拼不拼」：只回 segments + readings，接不接由注入管线定。
 *
 * 【接线位置】engine-injection-pipeline.js 组装注入串之前取 plan()，
 *   稳定段原序在前、变动段在后；index.js 另有委托桩供面板取读数。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaCacheSafeSegments = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /** 三态字面量收在一处：下游断言与诊断行都取这里，别各自写字面量。 */
    var STATES = {
        PLANNABLE: 'plannable',
        NO_STABLE: 'no_stable',
        MALFORMED: 'malformed'
    };

    /** 稳定段占比下限：低于它就没必要谈前缀缓存（本仓实测注入块常在 0.95 以上）。 */
    var MIN_RATIO = 0.8;

    /** 与全仓同一 fnv1a（canonical-stringify.js 是单一口径，这里只做定序指纹）。 */
    function fnv1a(str) {
        var s = String(str == null ? '' : str);
        var h = 2166136261;
        for (var i = 0; i < s.length; i += 1) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0).toString(36);
    }

    /** 块文本口径：`text` 优先，其次 `content`；都没有就空串（不猜）。 */
    function textOf(block) {
        if (!block || typeof block !== 'object') return '';
        if (typeof block.text === 'string') return block.text;
        if (typeof block.content === 'string') return block.content;
        return '';
    }

    /**
     * 谁是稳定段：显式 `volatility` 优先（'stable' / 'volatile'），
     * 其次 `stable === false` 视为变动，其余一律按稳定 ——
     * 默认稳定是**故意的**：把稳定误判成变动只是少缓存，反过来会锁死过期内容。
     */
    function classify(block) {
        if (!block || typeof block !== 'object') return 'volatile';
        if (block.volatility === 'volatile' || block.volatility === 'varying') return 'volatile';
        if (block.volatility === 'stable') return 'stable';
        if (block.stable === false) return 'volatile';
        return 'stable';
    }

    /** 定序键：先 `order`（数字），再 `id` 字典序 —— 与入参顺序无关。 */
    function compareStable(a, b) {
        var oa = Number(a.order);
        var ob = Number(b.order);
        var fa = isFinite(oa) ? oa : 1e9;
        var fb = isFinite(ob) ? ob : 1e9;
        if (fa !== fb) return fa - fb;
        var ia = String(a.id == null ? '' : a.id);
        var ib = String(b.id == null ? '' : b.id);
        if (ia < ib) return -1;
        if (ia > ib) return 1;
        return 0;
    }

    function charsOf(block) {
        var c = Number(block && block.chars);
        if (isFinite(c) && c >= 0) return c;
        return textOf(block).length;
    }

    /**
     * plan(blocks, opts) -> { state, segments, readings }
     *   segments[0] 恒为 stable（可能为空数组），segments[1] 恒为 volatile。
     *   变动段保留入参相对顺序（= 新旧先后，调用方说了算），不重排。
     */
    function plan(blocks, opts) {
        var o = opts && typeof opts === 'object' ? opts : {};
        var minRatio = isFinite(Number(o.minRatio)) ? Number(o.minRatio) : MIN_RATIO;
        var readings = {
            state: STATES.MALFORMED,
            blockCount: 0,
            stableCount: 0,
            volatileCount: 0,
            stableChars: 0,
            volatileChars: 0,
            totalChars: 0,
            stableRatio: null,
            orderHash: '',
            cacheSafe: false,
            minRatio: minRatio
        };
        if (!Array.isArray(blocks) || blocks.length === 0) {
            return { state: STATES.MALFORMED, segments: [
                { kind: 'stable', blocks: [], chars: 0 },
                { kind: 'volatile', blocks: [], chars: 0 }
            ], readings: readings };
        }
        var stable = [];
        var volatile = [];
        for (var i = 0; i < blocks.length; i += 1) {
            var b = blocks[i];
            if (!b || typeof b !== 'object') continue;
            var t = textOf(b);
            if (!t && !(isFinite(Number(b.chars)) && Number(b.chars) > 0)) continue;
            if (classify(b) === 'stable') stable.push(b); else volatile.push(b);
        }
        if (stable.length === 0 && volatile.length === 0) {
            return { state: STATES.MALFORMED, segments: [
                { kind: 'stable', blocks: [], chars: 0 },
                { kind: 'volatile', blocks: [], chars: 0 }
            ], readings: readings };
        }
        stable.sort(compareStable);
        var sc = 0, vc = 0, k;
        for (k = 0; k < stable.length; k += 1) sc += charsOf(stable[k]);
        for (k = 0; k < volatile.length; k += 1) vc += charsOf(volatile[k]);
        readings.blockCount = stable.length + volatile.length;
        readings.stableCount = stable.length;
        readings.volatileCount = volatile.length;
        readings.stableChars = sc;
        readings.volatileChars = vc;
        readings.totalChars = sc + vc;
        if (stable.length === 0) {
            readings.state = STATES.NO_STABLE;
            readings.stableRatio = null;
        } else {
            readings.state = STATES.PLANNABLE;
            readings.stableRatio = readings.totalChars > 0 ? sc / readings.totalChars : 1;
            readings.cacheSafe = readings.stableRatio >= minRatio;
        }
        readings.orderHash = fnv1a(stable.map(function (b) {
            return String(b.id == null ? '' : b.id);
        }).join('\u0001'));
        return {
            state: readings.state,
            segments: [
                { kind: 'stable', blocks: stable, chars: sc },
                { kind: 'volatile', blocks: volatile, chars: vc }
            ],
            readings: readings
        };
    }

    /**
     * 顺序指纹是否与上一轮一致：只比**稳定段**。
     * 变动段本来就是每轮新的，比它等于说「永远不一致」，那条读数就没有信息量。
     */
    function sameStablePrefix(prevReadings, nextReadings) {
        var a = prevReadings && prevReadings.orderHash ? String(prevReadings.orderHash) : '';
        var b = nextReadings && nextReadings.orderHash ? String(nextReadings.orderHash) : '';
        if (!a || !b) return { same: false, reason: 'no-hash' };
        return { same: a === b, reason: a === b ? 'same' : 'changed', prev: a, next: b };
    }

    /** 拼串辅助：稳定段在前、变动段在后（调用方真要拼时用这一处，别各自写）。 */
    function join(planned) {
        try {
            var segs = planned && planned.segments ? planned.segments : [];
            var out = [];
            for (var i = 0; i < segs.length; i += 1) {
                var bs = segs[i] && segs[i].blocks ? segs[i].blocks : [];
                for (var j = 0; j < bs.length; j += 1) {
                    var t = textOf(bs[j]);
                    if (t) out.push(t);
                }
            }
            return out.join('\n\n');
        } catch (e) {
            return '';
        }
    }

    return {
        STATES: STATES,
        MIN_RATIO: MIN_RATIO,
        plan: plan,
        classify: classify,
        sameStablePrefix: sameStablePrefix,
        join: join,
        fnv1a: fnv1a,
        charsOf: charsOf,
        textOf: textOf
    };
}));
