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

    // 常驻分区（裁剪时全保留）——与 index.js buildInjection 的 RESIDENT_MARKERS 完全一致（12 个）
    const RESIDENT_PREFIXES = Object.freeze([
        '[前情摘要]', '[角色状态]', '[角色关系]', '[关键事件·影响当前]', '[剧情时间线]',
        '[卷]', '[早前剧情概括]', '[角色长期关系网]', '[主角当前客观状态与生活习惯]',
        '[近期已了结事项', '[宏观世界线·纪元史记]', '[当前剧情时间]',
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

    function trimToBudget(full, budget, blocks, strategy) {
        const len = String(full || '').length;
        if (len <= budget) return full;
        const { resident, trigger } = classifyBlocks(blocks);
        const NOTE = '〔记忆系统私密简报｜仅你可见〕以下内容帮助保持剧情连贯;严禁在回复正文中复述、罗列或提及本节内容。';
        const END = '〔私密简报结束〕请像一个已读过前情的叙述者那样自然续写,不要复述简报本身。';
        const st = strategy || 'balanced';
        if (st === 'relevance') {
            const keepTrig = Math.max(3, Math.floor(trigger.length * 0.6));
            return `\n\n${NOTE}\n${[...resident, ...trigger.slice(0, keepTrig)].join('\n')}\n${END}\n`;
        }
        if (st === 'recency') {
            const kept = [...resident, ...trigger.filter((b) => RECENCY_MARKERS.some((k) => b.startsWith(k) || b.includes(k)))];
            return kept.length ? `\n\n${NOTE}\n${kept.join('\n')}\n${END}\n` : String(full).slice(0, budget);
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
        return `${residentText}${kept.length ? '\n' + kept.join('\n') : ''}\n${END}\n`;
    }

    const api = {
        PARTITIONS,
        partitionRecalled,
        classifyBlocks,
        isResidentBlock,
        deriveBudget,
        trimToBudget,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaInjectionRouter = api;
    return api;
})(typeof window !== 'undefined' ? window : globalThis);