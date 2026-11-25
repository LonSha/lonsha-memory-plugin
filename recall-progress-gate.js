/* ========================================================
 * recall-progress-gate.js — [v3.483.0] 召回进度门（防剧透锁）
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   本插件的召回是「**算分 → 取 top-k → 拼进注入**」，没有任何一维回答
 *   「这条记忆是不是还没发生」。三份召回主力文件里 `maxOrder` / `spoiler`
 *   的出现次数为 **0**（engine-recall.js / scene-book.js / recall-explain.js
 *   三处实测），也就是说：
 *     · 演员正在第 120 楼演到「刚认识」，召回却可能把第 400 楼才会发生的
 *       摊牌原话注入进去，模型据此提前说漏；
 *     · 这不是「多注入一点」的问题，是**方向性错误**——把未来当成过去讲。
 *   借鉴对象 lorecodex（st-tree-lore）的 `maxOrder`：目录、grep、读取三处
 *   统一设闸，超前的章节**根本不返回**，而不是返回后靠提示词叮嘱「别看」。
 *   本模块把同一纪律映射到本仓的既有真源：**楼层号**。
 *
 * 【为什么以楼层为进度，而不是叙事日期】
 *   日期（Day 12 / 2026-05-03）会随剧情钟回拨、随 dual-time 漂移，且同一日
 *   可以横跨几十楼——用它当闸会出现「同一日内的未来也被放行」或「回拨后
 *   过去被误锁」。楼层是单调、可寻址、已由 floor-ledger 立为真源的量：
 *   当前进度就是 `engine._currentFloor`（缺省回落到 chat.length）。
 *   本模块只吃数字，不自己取钟、不读 window —— 取数是调用方的事。
 *
 * 【四态判定（与 summary-provenance 同族，四态而非两态）】
 *   'ok'            —— 进度可判、条目在其内，可采信
 *   'ahead'         —— 进度可判、条目楼层超出当前进度 ⇒ **唯一会被拦下的态**
 *   'no_progress'   —— 判不了「当前到哪了」（无 floor 字段 / 进度非数）
 *                      ⇒ **放行**，宁可多注入也别丢记忆
 *   'not_seated'    —— 条目自身没有楼层归属（通用设定、人物档案这类
 *                      不挂在任何一楼上的东西）⇒ **放行**，同 lorecodex
 *                      「不属于任何章节的通用设定不受影响」
 *
 * 【为什么不把 ahead 的条目删除，只过滤】
 *   删是 SummarySystem / GC 的职责（同 summary-provenance 边界）。本模块只
 *   决定「这一轮注不注入」，条目本身留在库里，进度推进之后自然就能用了。
 *   若在这里删除，回拨剧情（rollback）就永久损失了未来内容。
 *
 * 【不做什么（边界）】
 *   · 不取钟、不读 window、不读 DOM：进度数字由调用方传入，纯函数可单测；
 *   · 不新增插件存储键：无状态，不改任何条目字段，随调用即算；
 *   · 不偷偷改主路径：`pick` 只返回 kept/dropped，接不接由调用方决定
 *     （engine-recall 里显式接线，并有 debugMode 留痕）。
 *
 * 【接线位置】engine-recall.js 的 recallMemory() 末尾、_finalize 之前，
 *   对 results 的每个来源数组统一过一遍。判据本体在此，取数在那。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaRecallProgressGate = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /** 四个态的字面量收在一处：下游断言与 UI 都取这里，别各自写字面量。 */
    var STATES = {
        OK: 'ok',
        AHEAD: 'ahead',
        NO_PROGRESS: 'no_progress',
        NOT_SEATED: 'not_seated'
    };

    /** 条目楼层：只认三种写法（召回各源实测就是这三种）。没有就返回 null。 */
    function floorOf(item) {
        if (!item || typeof item !== 'object') return null;
        var cands = [item.floor];
        if (item.metadata && typeof item.metadata === 'object') cands.push(item.metadata.floor);
        for (var i = 0; i < cands.length; i += 1) {
            var n = cands[i];
            /* 只收有限数；字符串数字也收（存档回放里见过 '120'），但空串/NaN 一律当没有。 */
            if (typeof n === 'number' && isFinite(n)) return n;
            if (typeof n === 'string' && n.trim() !== '' && isFinite(Number(n))) return Number(n);
        }
        return null;
    }

    /**
     * 进度归一：非数 / 负数 / NaN → null（= 判不了）。
     * 注意 **0 是合法进度**（还没开始），不能和 null 混同 —— 早期写成 `if (!p)`
     * 会把进度 0 当成「判不了」，于是开局第一轮完全不设闸。
     */
    function normalizeProgress(p) {
        if (typeof p === 'number' && isFinite(p) && p >= 0) return p;
        if (typeof p === 'string' && p.trim() !== '' && isFinite(Number(p)) && Number(p) >= 0) return Number(p);
        return null;
    }

    /**
     * 单条判定。返回 {状态, floor, progress}，调用方据此留痕。
     * @param {object} item 召回条目
     * @param {number|null} progress 当前进度（楼层），null = 判不了
     */
    function classify(item, progress) {
        var p = normalizeProgress(progress);
        var f = floorOf(item);
        if (p === null) return { status: STATES.NO_PROGRESS, floor: f, progress: null };
        if (f === null) return { status: STATES.NOT_SEATED, floor: null, progress: p };
        if (f > p) return { status: STATES.AHEAD, floor: f, progress: p };
        return { status: STATES.OK, floor: f, progress: p };
    }

    /**
     * 安全闸：**只拦 ahead，其余一律放行**。
     * 判不了就放行是与 branch-guard / summary-provenance 同源的纪律：
     * 过滤漏一点，好过让用户的记忆整体消失。
     */
    function isAllowed(item, progress) {
        return classify(item, progress).status !== STATES.AHEAD;
    }

    /**
     * 批量过滤一个来源数组。
     * @returns {{kept:Array, dropped:Array, counts:object}}
     *   dropped 里带 reason，方便 debug 面板逐条看「为什么这条被拦」。
     */
    function pick(list, progress) {
        var arr = Array.isArray(list) ? list : [];
        var kept = [];
        var dropped = [];
        var counts = { checked: 0, kept: 0, dropped: 0, ok: 0, ahead: 0, no_progress: 0, not_seated: 0 };
        for (var i = 0; i < arr.length; i += 1) {
            var it = arr[i];
            var c = classify(it, progress);
            counts.checked += 1;
            counts[c.status] = (counts[c.status] || 0) + 1;
            if (c.status === STATES.AHEAD) {
                dropped.push({ index: i, floor: c.floor, progress: c.progress, item: it, reason: 'ahead' });
            } else {
                kept.push(it);
            }
        }
        counts.kept = kept.length;
        counts.dropped = dropped.length;
        return { kept: kept, dropped: dropped, counts: counts };
    }

    /**
     * 对整份 results（多来源对象）批量过闸。
     * @param {object} results engine-recall 的 results（键 → 数组）
     * @param {number|null} progress
     * @returns {{results:object, counts:object, droppedBySource:object}}
     *   返回**新对象**，不改入参（主路径若还想拿原始全集做别的用途不会被本模块改坏）。
     */
    function gateResults(results, progress) {
        var src = (results && typeof results === 'object') ? results : {};
        var out = {};
        var total = { checked: 0, kept: 0, dropped: 0 };
        var droppedBySource = {};
        var keys = Object.keys(src);
        for (var i = 0; i < keys.length; i += 1) {
            var k = keys[i];
            var v = src[k];
            if (!Array.isArray(v)) {
                /* 非数组字段原样带过：本模块只认召回数组，不碰标量。 */
                out[k] = v;
                continue;
            }
            var r = pick(v, progress);
            out[k] = r.kept;
            total.checked += r.counts.checked;
            total.kept += r.counts.kept;
            total.dropped += r.counts.dropped;
            if (r.counts.dropped) droppedBySource[k] = r.dropped;
        }
        return { results: out, counts: total, droppedBySource: droppedBySource };
    }

    return {
        STATES: STATES,
        floorOf: floorOf,
        normalizeProgress: normalizeProgress,
        classify: classify,
        isAllowed: isAllowed,
        pick: pick,
        gateResults: gateResults
    };
}));
