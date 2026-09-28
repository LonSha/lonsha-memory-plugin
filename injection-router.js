/**
 * injection-router.js — [v3.114 缝合] 注入分区路由 + 预算裁剪（buildInjection 的可测核心）
 *
 * 【来源】从 index.js buildInjection（362 行最长函数）中抽出两条独立可测的决策链：
 *   1) partitionRecalled：把召回条目按 source 路由到 16 个注入分区（原 if-else 链）
 *   2) trimToBudget：超预算时按策略裁剪（relevance / recency / balanced），含自适应预算推导
 *
 * 【为何抽】原函数把「路由」「拼装」「裁剪」混在一起，且裁剪策略只能整体测试、
 *   无法单独断言「某类 source 是否进了正确的分区」。抽出后三条链可独立单测。
 *
 * 【约束】纯函数：不修改入参；无 this；无 window/宿主依赖（chatLength 由调用方注入）。
 */
(function (global) {
    'use strict';

    // 16 分区（顺序即注入顺序的基线；source 匹配优先精确、后包含）
    const PARTITIONS = Object.freeze([
        'worldProgs', 'neuralChains', 'itemRecs', 'itemStoredRecs', 'reflectRecs',
        'statuses', 'suspenses', 'holidays', 'volumes', 'bm25Hits', 'povs',
        'timelines', 'phoneMem', 'diaries', 'relations', 'treeNotes', 'dedupNotes', 'summaries',
    ]);

    // source → 分区的精确匹配表
    const EXACT = Object.freeze({
        worldprogress: 'worldProgs',
        neuralChain: 'neuralChains',
        items: 'itemRecs',
        reflection: 'reflectRecs',
        status: 'statuses',
        suspense: 'suspenses',
        bm25: 'bm25Hits',
        memoryTree: 'treeNotes',
        dedup: 'dedupNotes',
    });

    // source → 分区的包含匹配（source 带后缀修饰时，如 items_stored:xxx / volume:3 / pov:Alice）
    const INCLUDES = Object.freeze([
        ['items_stored', 'itemStoredRecs'],
        ['holiday', 'holidays'],
        ['volume', 'volumes'],
        ['pov', 'povs'],
        ['timeline', 'timelines'],
        ['rubyphone', 'phoneMem'],
        ['diary', 'diaries'],
        ['graph', 'relations'],
    ]);

    // 常驻分区（裁剪时全保留）——与 index.js buildInjection 的 RESIDENT_MARKERS 完全一致（13 个）
    //   [v3.211] 第 13 个是 `[类型化事实·长期]`：类型化事实的稳定块（permanent/long 生命周期，
    //   如世界规则、事件结果、人物状态）必须每轮必注 —— 它们正是「不该被一次裁剪丢掉」的那类。
    //   注意波动块 `[类型化事实·当下]` **不在此表**：medium/short/dynamic 的类型（地点/物品/
    //   线索/场景事实）本来就该随预算裁剪，列为常驻等于把一次性内容每轮灌进上下文。
    const RESIDENT_PREFIXES = Object.freeze([
        '[前情摘要]', '[角色状态]', '[角色关系]', '[关键事件·影响当前]', '[剧情时间线]',
        '[卷]', '[早前剧情概括]', '[角色长期关系网]', '[主角当前客观状态与生活习惯]',
        '[近期已了结事项', '[宏观世界线·纪元史记]', '[当前剧情时间]', '[类型化事实·长期]',
    ]);

    // recency 策略保留的分区标记
    const RECENCY_MARKERS = Object.freeze([
        '[关键事件·影响当前]', '[剧情时间线]', '[角色状态]', 'POV', '[手机生活记忆]', '[前情摘要]', '[节日]',
    ]);

    function partitionRecalled(items, opts) {
        const o = opts || {};
        const maxItems = Math.max(0, Number(o.maxItems) || 0);
        const list = Array.isArray(items) ? items : [];
        const buckets = {};
        for (const p of PARTITIONS) buckets[p] = [];
        for (const item of list.slice(0, maxItems || list.length)) {
            const src = String(item?.source || '');
            let part = EXACT[src];
            if (!part) {
                for (const [needle, name] of INCLUDES) {
                    if (src.includes(needle)) { part = name; break; }
                }
            }
            (buckets[part || 'summaries']).push(item);
        }
        return buckets;
    }

    function isResidentBlock(text) {
        const s = String(text || '');
        return RESIDENT_PREFIXES.some((p) => s.startsWith(p) || s.includes(p));
    }

    function classifyBlocks(blocks) {
        const resident = [], trigger = [];
        for (const b of (Array.isArray(blocks) ? blocks : [])) {
            if (isResidentBlock(b)) resident.push(b);
            else trigger.push(b);
        }
        return { resident, trigger };
    }

    /**
     * 自适应预算推导（原 v3.50 第三层）。
     * chatLength 由调用方注入（解耦 window）；decayReference=80、clamp 0.6~1.8。
     */
    function deriveBudget(base, tokenBudget, reserve, chatLength, opts) {
        const o = opts || {};
        let budget = Math.max(200, Math.floor(Number(base) || 0));
        const tb = Number(tokenBudget) || 0;
        const rs = Number(reserve) || 0;
        // [v3.133] token→字符换算改用 CJK 口径（estimateTextTokens 逆变换）：汉字≈0.9 token/字 → 1 token≈1.11 字符。
        // 旧口径 *4（0.25 token/字符，纯 ASCII）对中文正文超发约 3.5 倍——900 token 放行 3600 字符（实际≈4000 token）。
        if (tb > 0) budget = Math.max(200, Math.min(budget, Math.floor(tb * 10 / 9)));
        if (rs > 0) budget = Math.max(200, budget - Math.floor(rs * 10 / 9));
        if (o.adaptive !== false) {
            const cl = Number(chatLength) || 0;
            if (cl > 0) {
                const decayRef = Number(o.decayFloors) || 80;
                const factor = Math.max(0.6, Math.min(1.8, 1.8 - (cl / decayRef) * 1.2));
                budget = Math.max(200, Math.floor(budget * factor));
            }
        }
        return budget;
    }

    /**
     * 召回只读边界 [v3.195]。
     * 召回文本是「已经发生过的记录」，不是本轮正在发生的事，也不是本轮指令。
     * 三条硬边界，缺一就不是边界：
     *   1) recalled 不得覆盖 newer（更新的事实优先，旧记录只作背景）
     *   2) 召回块一律标 readonly，调用方不得把它当成本轮动作
     *   3) 没有显式维护指令（maintain=true）就不产生任何写回
     * 不改写原文，只给每条加上来源标记与是否可写。
     */
    function sealRecall(recalled, newer, opts) {
        const o = opts || {};
        const oldList = Array.isArray(recalled) ? recalled : [];
        const newList = Array.isArray(newer) ? newer : [];
        const maintain = o.maintain === true;
        const newerKeys = new Set(newList.map((item) => String(item && (item.key || item.id || item.text) || '')).filter(Boolean));
        const sealed = [];
        let shadowed = 0;
        for (const item of oldList) {
            const key = String(item && (item.key || item.id || item.text) || '');
            const covered = key && newerKeys.has(key);
            if (covered) shadowed++;
            sealed.push({
                text: String(item && (item.text || item.content) || ''),
                key,
                source: 'recalled',
                readonly: true,
                shadowed: covered,
                writable: false
            });
        }
        return {
            sealed,
            writable: maintain ? newList.map((item) => ({
                text: String(item && (item.text || item.content) || ''),
                key: String(item && (item.key || item.id) || ''),
                source: 'current',
                readonly: false,
                writable: true
            })) : [],
            maintain,
            shadowed,
            refusedWrite: !maintain && oldList.length > 0
        };
    }

    /**
     * [v3.251.0] M-O3：预算裁剪 + **阶段回执**（可选 `opts.trace`）。
     *
     * 【为什么必须由裁剪过程自己派生，而不是事后反推】
     *   修前「哪个块被裁掉」只能拿最终文本做 `includes(块)` 反推 —— cost-ledger 的
     *   `identity.includesHeuristic: true` 就是这条自认。反推有两处**已知盲区**：
     *     · **同文重复**：同一文本在候选里出现两份、裁掉其中一份时，`includes` 仍为真
     *       ⇒ 把「裁了一份」读成「原样留下」，是假绿；
     *     · **半段截断**：recency 无可保留项时走 `slice(0, budget)` 硬截断，切口落在块
     *       内部 ⇒ 半段块 `includes` 为假 ⇒ 把「切了半段」读成「整块被丢」。
     *   两者都是在**判定发生的地点之外**猜。trace 在裁剪发生的地点把「谁留下」记下来，
     *   它是构建过程派生的本轮事实（只记留下哪些文本、按什么策略、切在哪），
     *   不是第二份事实库（不复制块的内容语义，也不参与任何决策）。
     *
     * 【向后兼容】不传 opts 时行为逐字同修前：v3114 的三策略判据与真路径都不受影响。
     */
    function trimToBudget(full, budget, blocks, strategy, opts) {
        const len = String(full || '').length;
        if (len <= budget) return full;
        const all = Array.isArray(blocks) ? blocks : [];
        // 与 classifyBlocks 同口径、同顺序的分组（**保序划分**），额外记下每个触发块在
        //   输入数组中的**下标** —— 回执要按下标说话，不能按文本说话（见下）。
        const resident = [], trigger = [], _trigIdxInAll = [];
        for (let _k = 0; _k < all.length; _k++) {
            if (isResidentBlock(all[_k])) resident.push(all[_k]);
            else { trigger.push(all[_k]); _trigIdxInAll.push(_k); }
        }
        const _trace = (opts && opts.trace && typeof opts.trace === 'object') ? opts.trace : null;
        if (_trace) {
            _trace.traceFrom = 'router';       // 回执来源（消费侧据此判它是否可信）
            _trace.strategy = String(strategy || 'balanced');
            _trace.trimmed = true;
            _trace.hardTruncated = false;
            _trace.residentKept = resident.length;
            _trace.triggerTotal = trigger.length;
            _trace.contiguous = null;      // 三策略各自填
            _trace.keptIdxInAll = [];      // ★ 保留块的**下标**（判定只用它）
            _trace.keptTexts = [];         // 可读面：保留块的文本（与下标必须一一对应）
            _trace.droppedTriggerIdx = []; // 触发组内被丢的下标（便于回答「从第几个开始丢」）
        }
        /* 下标而不是文本：同文重复是修前 `includes` 反推的**头号盲区** ——
         *   候选里有两条完全相同的文本、预算只装得下一条时，`includes` 对两条都为真，
         *   于是把「裁了一份」读成「两份都留着」。按下标判定在构造上不可能有这个问题。
         *
         *   ★ 入参必须是**触发组内的位置**，不能是文本：若按文本回查（`trigger.indexOf(t)`），
         *     两条同文触发块会双双指到第一个位置 —— 本方法要治的正是同文，绝不能在
         *     自己的实现里再犯一次（第一版就这么写过，被同一类反例打回）。 */
        const _markKeptByPos = (posInTrigger) => {
            if (!_trace) return;
            const inTrig = Array.isArray(posInTrigger) ? posInTrigger.slice() : [];
            _trace.keptTexts = inTrig.map((p) => trigger[p]);
            const out = [];
            for (let i = 0; i < all.length; i++) if (isResidentBlock(all[i])) out.push(i);
            for (const p of inTrig) {
                const at = _trigIdxInAll[p];
                if (Number.isFinite(at) && at >= 0) out.push(at);
            }
            out.sort((a, b) => a - b);
            _trace.keptIdxInAll = out;
            _trace.droppedTriggerIdx = _trigIdxInAll.filter((x) => out.indexOf(x) < 0);
        };
        const _posRange = (n) => { const a = []; for (let i = 0; i < n; i++) a.push(i); return a; };
        const NOTE = '〔记忆系统私密简报｜仅你可见〕以下内容帮助保持剧情连贯;严禁在回复正文中复述、罗列或提及本节内容。';
        const END = '〔私密简报结束〕请像一个已读过前情的叙述者那样自然续写,不要复述简报本身。';
        const st = strategy || 'balanced';
        if (st === 'relevance') {
            const keepTrig = Math.max(3, Math.floor(trigger.length * 0.6));
            const keptT = trigger.slice(0, keepTrig);
            if (_trace) { _trace.contiguous = true; _markKeptByPos(_posRange(keptT.length)); }
            return `\n\n${NOTE}\n${[...resident, ...keptT].join('\n')}\n${END}\n`;
        }
        if (st === 'recency') {
            const keptT = trigger.filter((b) => RECENCY_MARKERS.some((k) => b.startsWith(k) || b.includes(k)));
            const kept = [...resident, ...keptT];
            if (_trace) {
                // recency 的保留集**非连续**（按标记筛，中间会跳）：只记一个断点下标是错的，
                //   故显式记 contiguous=false + 真实保留清单，下游不得按下标算区间。
                _trace.contiguous = false;
                /* ★ 位置必须用**同一个判据**重算，不能拿保留文本回查下标：
                 *   `keptT.indexOf(trigger[i])` 在「两条同文触发块」时会把第二条也认成保留
                 *   （回查到第一条）—— 那正是本方法要治的同文盲区，绝不能在自己的实现里再犯。
                 *   这里直接用筛 keptT 时的同一谓词（RECENCY_MARKERS）对 trigger 逐个判。 */
                _markKeptByPos(_posRange(trigger.length).filter((i) =>
                    RECENCY_MARKERS.some((k) => trigger[i].startsWith(k) || trigger[i].includes(k))));
            }
            if (kept.length) return `\n\n${NOTE}\n${kept.join('\n')}\n${END}\n`;
            /* 硬截断：`full.slice(0, budget)` 的切口可能落在**块内部**。
             *   块级保留清单因此不成立（不按下标判整块），但「半段」这件事本身要能被追踪，
             *   故这里按**原始 full** 精确扫出每个块的 [start, end) span（块按构造顺序出现，
             *   从上一个块的结束位置继续搜）。消费侧据此判三态：
             *     整块在切点内 / 跨切点被切半 / 完全在切点外 —— 修前这三态同形（都只是 includes=false）。
             *   边界如实登记：这是诊断回执用的定位，若两个块的文本互为子串，按序定位可能偏移；
             *   该路径只在 recency 硬截断时启用，且只影响「半段」标注，不参与任何决策。 */
            if (_trace) {
                _trace.hardTruncated = true;
                _trace.sliceAt = budget;
                _trace.keptIdxInAll = null;    // 块级清单不成立（消费侧必须走 span 判据）
                _trace.keptTexts = [];
                const _full0 = String(full);
                const spans = [];
                let cur = 0;
                for (let i = 0; i < all.length; i++) {
                    const t = String(all[i] == null ? '' : all[i]);
                    if (!t) { spans.push(null); continue; }
                    const at = _full0.indexOf(t, cur);
                    if (at < 0) { spans.push(null); continue; }   // 定位不到 ⇒ null，不编位置
                    spans.push([at, at + t.length]);
                    cur = at + t.length;
                }
                _trace.blockSpans = spans;
            }
            return String(full).slice(0, budget);
        }
        // balanced：常驻全保留 + 触发按剩余预算截断
        const residentText = `\n\n${NOTE}\n${resident.join('\n')}`;
        const triggerBudget = Math.max(0, budget - residentText.length);
        const kept = [];
        let acc = 0;
        for (const t of trigger) {
            if (acc + t.length > triggerBudget) break;
            kept.push(t);
            acc += t.length;
        }
        if (_trace) { _trace.contiguous = true; _markKeptByPos(_posRange(kept.length)); }
        return `${residentText}${kept.length ? '\n' + kept.join('\n') : ''}\n${END}\n`;
    }

    const api = {
        PARTITIONS,
        partitionRecalled,
        classifyBlocks,
        isResidentBlock,
        deriveBudget,
        trimToBudget,
        sealRecall,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaInjectionRouter = api;
    return api;
})(typeof window !== 'undefined' ? window : globalThis);