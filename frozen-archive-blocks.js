/* ========================================================
 * frozen-archive-blocks.js — [v3.488.0] 冻结档（旧楼层压成不变块，前缀才有得命中）
 *
 * 【为什么需要这一面 / 修前实测（不是估计）】
 *   `cache-safe-injection-segments.js`（v3.484.0）已经把注入切成「稳定段在前、本轮召回压尾」，
 *   并产出 `stableRatio` / `orderHash` —— 但它管的是**顺序**稳定，不是**内容**稳定。
 *   实测（474 个运行时模块）：`frozenArchive` / 冻结档 / `blockSize` 在注入侧命中 0。
 *   后果是「稳定段」每轮都在变：
 *     ① 新记忆一进来，稳定段里那段「长期事实」的拼接文本就整体位移一行；
 *     ② 拼接的条目集合随召回候选变化，同一段历史这次三条、下次五条；
 *   两者都让宿主的前缀缓存**同一条都没命中过** —— 顺序稳定但内容不稳定，等于白排。
 *
 * 【本模块做什么：把「旧楼层」切成按块对齐的不变文本块】
 *   源：光域·镜忆 V0.1 的 `frozenArchiveText` / `frozenArchiveUntilFloor` / `blockSize`。
 *   只搬纪律，不搬它的存储层：
 *     · 只冻结 `floor < untilFloor` 的条目（窗口内的历史是「已落定」的）；
 *     · 按 `blockSize`（默认 12 楼）**对齐切块**，块边界只随楼层推进移动，
 *       不随条目增减移动 —— 这是「补一条旧记忆不会重写全部块」的唯一办法；
 *     · 每块的 `blockId` 由**块内内容**算（词序无关、入参顺序无关），
 *       所以「同样的内容」恒得同样的 id，跨轮可逐字节对齐。
 *
 * 【rewrites 是这一面唯一的硬读数】
 *   调用方把上一轮的 `blocks` 传进来（`opts.prevBlocks`）。比同 index 的 blockId：
 *     · 内容句句相同 ⇒ blockId 相同 ⇒ **不算 rewrite**（前缀可命中）
 *     · 同 index 但 id 变了 ⇒ 记一次 rewrite（前缀白费，可复算）
 *   没有这个读数，「冻结了」与「每轮都在重写」在面板上完全同形。
 *
 * 【不满一块就不冻结（宁可 partial，也不造抖动块）】
 *   若剩余不足 `blockSize` 就凑一个短块，那么下一次补齐时这个短块会被重切 ⇒
 *   它的 blockId 必然变 ⇒ 每进一楼就 rewrite 一次，正好毁掉本模块的目的。
 *   故不满块时 `state = 'partial'`，**不产块**，条目留在 `rest` 里等补齐。
 *
 * 【四态不可混同】
 *   'frozen'   至少切出一块（blocks 非空）
 *   'partial'  有冻结区内容但不满一块 ⇒ 0 块，**与 'none' 不同形**
 *              （一个是「快了」，一个是「没有这回事」）
 *   'none'     `untilFloor <= 0`，或冻结区里一条都没有
 *   'malformed' 入参不是数组 / blockSize 非法
 *
 * 【不做什么（边界）】
 *   · 不裁文本、不摘要：块文本是条目原文的**原序拼接**（摘要会引入第二次改写，
 *     而改写正是要靠 blockId 才能看见的东西 —— 在这里摘要等于自己蒙住读数）；
 *   · 不落盘、不读 window / localStorage：纯函数，同输入同输出；
 *   · 不动 `rest` 里的条目：未冻结部分原样返回，由召回侧照常处理；
 *   · 不决定「拼不拼进注入」：只产块与读数，接不接由注入管线定。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaFrozenArchiveBlocks = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var STATES = {
        FROZEN: 'frozen',
        PARTIAL: 'partial',
        NONE: 'none',
        MALFORMED: 'malformed'
    };

    var DEFAULTS = {
        untilFloor: 0,
        blockSize: 12
    };

    /** 与全仓同一 fnv1a（`cache-safe-injection-segments.js` / `canonical-stringify.js` 同口径）。 */
    function fnv1a(str) {
        var s = String(str == null ? '' : str);
        var h = 2166136261;
        for (var i = 0; i < s.length; i += 1) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0).toString(36);
    }

    function num(v) {
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    function textOf(item) {
        if (!item || typeof item !== 'object') return '';
        if (typeof item.text === 'string') return item.text;
        if (typeof item.content === 'string') return item.content;
        return '';
    }

    function floorOf(item) {
        return num(item && item.floor);
    }

    function uidOf(item) {
        if (!item || typeof item !== 'object') return '';
        return String(item.turnUid || item.turnId || item.id || '');
    }

    /**
     * 块内定序键：**楼层优先、其次 uid、最后文本**。
     *   三键都在 ⇒ 入参顺序完全不影响结果（判据要测「同集不同入参顺序同 id」）。
     *   只按楼层排会在同楼多条目时退化成「看入参顺序」，那是静默的不稳定。
     */
    function orderKey(item) {
        var f = floorOf(item);
        return {
            floor: f === null ? -1 : f,
            uid: uidOf(item),
            text: textOf(item)
        };
    }

    function cmp(a, b) {
        if (a.floor !== b.floor) return a.floor - b.floor;
        if (a.uid !== b.uid) return a.uid < b.uid ? -1 : 1;
        if (a.text !== b.text) return a.text < b.text ? -1 : 1;
        return 0;
    }

    /**
     * plan(items, opts) -> { state, blocks, rest, counts }
     *   opts.untilFloor  冻结窗口上界（不含），默认 0 ⇒ 不冻结
     *   opts.blockSize   块大小（楼层跨度），默认 12
     *   opts.prevBlocks  上一轮的 blocks（可选，用于算 rewrites）
     */
    function plan(items, opts) {
        var o = opts && typeof opts === 'object' ? opts : {};
        var counts = {
            state: STATES.MALFORMED,
            input: 0,
            frozen: 0,
            rest: 0,
            blocks: 0,
            rewrites: 0,
            added: 0,
            dropped: 0,
            chars: 0,
            reason: ''
        };

        if (!Array.isArray(items)) {
            counts.reason = 'items-not-array';
            return { state: STATES.MALFORMED, blocks: [], rest: [], counts: counts };
        }
        var blockSize = num(o.blockSize);
        if (blockSize === null || blockSize < 1) blockSize = DEFAULTS.blockSize;
        var untilFloor = num(o.untilFloor);
        if (untilFloor === null) untilFloor = DEFAULTS.untilFloor;

        counts.input = items.length;

        /* 分区：冻结区（floor < untilFloor）与未冻结区。**条目本身不做任何修改**。
         *   冻结区存成 `{ item, i, key }` 包装 —— 收进块的条目要在最后把没进块的
         *   按原下标还回 rest（见下面的 leftover 段）。只存引用不够：同一个条目
         *   对象在入参里出现两次时，按引用去重会把其中一份吞掉。 */
        var frozenSrc = [];
        var rest = [];
        for (var i = 0; i < items.length; i += 1) {
            var it = items[i];
            if (!it || typeof it !== 'object') continue;
            var f = floorOf(it);
            if (f !== null && f < untilFloor) frozenSrc.push({ item: it, i: i, floor: f });
            else rest.push(it);
        }
        counts.frozen = frozenSrc.length;
        counts.rest = rest.length;

        if (untilFloor <= 0 || frozenSrc.length === 0) {
            counts.state = STATES.NONE;
            counts.reason = untilFloor <= 0 ? 'no-window' : 'empty-window';
            return { state: STATES.NONE, blocks: [], rest: rest, counts: counts };
        }

        /* ★ 分桶键是**绝对楼层桶号** `floor(floor / blockSize)`，与 untilFloor 无关。
         *
         *   [v3.488.0 二次自伤] 首版用的是 `floor((untilFloor-1-floor)/blockSize)` —— 相对桶号。
         *   那个桶号**随 untilFloor 变**：窗口从 24 推到 36 的时候，
         *   原来 idx0 装的 12..23 楼会被改成 idx1，于是**每一个块的 id 都变了**，
         *   `rewrites` 读数当场变成「全部重写」—— 正是本模块要治的那个病，被自己又写了一遍。
         *
         *   绝对桶号的三个性质（判据逐条钉）：
         *     ① 补一条**更旧**的记忆 ⇒ 只多一个新桶，已有块的 id 一个字节都不变；
         *     ② 窗口推进（untilFloor 增大） ⇒ 已有块的 id 不变，只是「可冻结范围」变大；
         *     ③ 桶号与入参顺序、条目条数、untilFloor 全都无关，只由 `floor / blockSize` 决定。 */
        var buckets = {};
        var keys = [];
        for (var s2 = 0; s2 < frozenSrc.length; s2 += 1) {
            var key = Math.floor(frozenSrc[s2].floor / blockSize);
            if (!buckets[key]) { buckets[key] = []; keys.push(key); }
            buckets[key].push(frozenSrc[s2]);
        }
        keys.sort(function (a, b) { return a - b; });   /* 旧 → 新 */

        /* 每个桶**各自**判断满不满：满的产块，不满的留 rest。
         *   为什么不做「遇到不满就整体停」：那会让一条新来的半截桶把**全部**旧块一起取消，
         *   前缀缓存直接从「命中若干块」掉到「命中 0 块」—— 一个抖动换全部失效。 */
        var blocks = [];
        var taken = new Set();
        for (var ki = 0; ki < keys.length; ki += 1) {
            var key2 = keys[ki];
            var bucket = buckets[key2];
            if (!bucket || bucket.length < blockSize) continue;
            var ordered = bucket.slice().sort(function (a, b) {
                return cmp(orderKey(a.item), orderKey(b.item));
            });
            var lo = null;
            var hi = null;
            var texts = [];
            for (var t = 0; t < ordered.length; t += 1) {
                var fx = ordered[t].floor;
                if (lo === null || fx < lo) lo = fx;
                if (hi === null || fx > hi) hi = fx;
                texts.push(textOf(ordered[t].item));
                taken.add(ordered[t].i);
            }
            var body = texts.join('\n');
            var idSeed = ordered.map(function (x) {
                return x.floor + '|' + uidOf(x.item) + '|' + textOf(x.item);
            }).join('\u0001');
            var hash = fnv1a(idSeed);
            blocks.push({
                blockId: 'blk_' + key2 + '_' + hash,
                index: key2,
                bucket: key2,
                hash: hash,
                floorRange: [lo, hi],
                count: ordered.length,
                chars: body.length,
                text: body
            });
        }

        counts.blocks = blocks.length;
        counts.chars = blocks.reduce(function (acc, b) { return acc + b.chars; }, 0);

        /* leftover：**没被任何块收走的条目一律按原序还回 rest**。
         *   冻结不是吞掉 —— 不满桶的、以及本来就晚于窗口的，全部原样交回调用方。
         *   输出必须满足 `blocks 收走的条数 + rest.length === 入参里的合法条目数`
         *   （判据钉这条恒等式；首稿正是在这里静默丢了 13 条里的那 1 条）。 */
        var restFinal = [];
        for (var z = 0; z < items.length; z += 1) {
            if (!taken.has(z)) restFinal.push(items[z]);
        }
        counts.rest = restFinal.length;
        rest = restFinal;

        if (blocks.length === 0) {
            counts.state = STATES.PARTIAL;
            counts.reason = 'less-than-one-block';
            return { state: STATES.PARTIAL, blocks: [], rest: rest, counts: counts };
        }

        /* rewrites：与上一轮比**同桶号**的 blockId。新增（没有 prev）不计 rewrite。
         *   桶号是绝对楼层桶号，故「窗口推进」不会制造 rewrite，只有「桶内内容变了」才会。 */
        var prev = Array.isArray(o.prevBlocks) ? o.prevBlocks : null;
        if (prev) {
            var byIdx = {};
            for (var p = 0; p < prev.length; p += 1) {
                var pb = prev[p];
                if (pb && typeof pb === 'object' && num(pb.index) !== null) byIdx[Number(pb.index)] = String(pb.blockId || '');
            }
            for (var q = 0; q < blocks.length; q += 1) {
                var nb = blocks[q];
                if (Object.prototype.hasOwnProperty.call(byIdx, nb.index)) {
                    if (byIdx[nb.index] !== nb.blockId) counts.rewrites += 1;
                } else {
                    counts.added += 1;
                }
            }
            var nowIdx = {};
            for (var r = 0; r < blocks.length; r += 1) nowIdx[blocks[r].index] = true;
            for (var pi in byIdx) {
                if (Object.prototype.hasOwnProperty.call(byIdx, pi) && !nowIdx[pi]) counts.dropped += 1;
            }
        }

        counts.state = STATES.FROZEN;
        return { state: STATES.FROZEN, blocks: blocks, rest: rest, counts: counts };
    }

    /**
     * join(blocks) -> 单一字符串。块间用空行连（块内是条目原文，用换行连）。
     *   刻意不在这里加抬头 / 时间戳 / 块序号 —— 任何随轮次变化的字符都会毁掉 blockId 的意义。
     */
    function join(blocks) {
        if (!Array.isArray(blocks) || blocks.length === 0) return '';
        var parts = [];
        for (var i = 0; i < blocks.length; i += 1) {
            var b = blocks[i];
            if (b && typeof b.text === 'string' && b.text) parts.push(b.text);
        }
        return parts.join('\n\n');
    }

    /** summary(res) -> 人话。四态各用不同句子。 */
    function summary(res) {
        var c = (res && res.counts) || {};
        if (!res || res.state === STATES.MALFORMED) return '冻结档未规划（' + (c.reason || 'malformed') + '）';
        if (res.state === STATES.NONE) {
            return c.reason === 'no-window' ? '无冻结窗口（untilFloor=0）' : '冻结窗口内没有条目';
        }
        if (res.state === STATES.PARTIAL) {
            return '冻结区 ' + c.frozen + ' 条，不足一块（' + c.reason + '），不产块';
        }
        var s = '冻结 ' + c.frozen + ' 条 → ' + c.blocks + ' 块（' + c.chars + ' 字）';
        if (c.rewrites) s += ' · 重写 ' + c.rewrites + ' 块';
        if (c.added) s += ' · 新增 ' + c.added + ' 块';
        if (c.dropped) s += ' · 消失 ' + c.dropped + ' 块';
        if (!c.rewrites && !c.added && !c.dropped && c.blocks) s += ' · 与上轮逐块一致';
        return s;
    }

    return {
        STATES: STATES,
        DEFAULTS: DEFAULTS,
        plan: plan,
        join: join,
        summary: summary,
        fnv1a: fnv1a
    };
}));