(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaPyramidClusterEngine = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createState() {
        return {
            clusters: [], // { epochId, title, summary, factCount, timeRange }
            currentBudgetTokens: 1200
        };
    }

    /**
     * 将细碎事实分层聚类压缩为时代纪要金字塔
     */
    function compressFactsIntoPyramid(state, facts = [], epochTitle = '第一纪：初遇老城') {
        if (!facts || facts.length === 0) return null;

        const cluster = {
            id: 'pyr_' + Date.now(),
            epochTitle,
            factCount: facts.length,
            representativeFacts: facts.slice(0, 3).map(f => f.text || f),
            pyramidSummary: `【${epochTitle}】共凝练 ${facts.length} 件过往核心线索，包含对彼此身份的初探与老洋房的暗涌。`,
            createdAt: Date.now()
        };
        state.clusters.push(cluster);
        return cluster;
    }

    /**
     * 依据场景紧张度 (Tension 0.0 ~ 1.0) 弹性伸缩 Token 预算
     * 高紧张 (对抗/追逐) -> 紧凑预算 (400-600 tokens)，提纯当前指令；
     * 低紧张 (闲聊/温情) -> 舒缓预算 (1200-2000 tokens)，释放长程回忆。
     */
    function adjustAttentionBudget(state, tensionScore = 0.2) {
        const tension = Math.max(0, Math.min(1.0, tensionScore));
        if (tension >= 0.7) {
            state.currentBudgetTokens = Math.round(500 * (1.0 - (tension - 0.7)));
        } else {
            state.currentBudgetTokens = Math.round(1200 + (0.7 - tension) * 1000);
        }
        return {
            tension,
            budgetTokens: state.currentBudgetTokens,
            strategy: tension >= 0.7 ? 'HIGH_TENSION_COMPACT' : 'LOW_TENSION_EXPANDED'
        };
    }

    /* ============================================================
     * [v3.464.0 · L21-O4 水合面补齐] / [v3.465.1 L21-O4 复检：按本模块形状归一]
     * 为什么必须补：宿主 `engine-persistence-ops.js` 的水合表把本模块登记成
     *   `hydrateState`，而本文件此前根本没有这个函数 —— 恢复路径上
     *   `typeof mod['hydrateState'] === 'function'` 恒假，静默走 `: _ext[key]` 兜底，
     *   把**原始 payload**直接赋给宿主字段。表面上「恢复了」，实际装进去的是没经归一的数据。
     *
     * ★ [v3.465.1] 首版这里写的是「以默认形状为底逐键浅合并」的通用实现。复检判定它
     *   **本身就是它声称要修的那个病**：
     *     ① 19 个模块共用同一份通用体 => 逐字副本簇（`tests/v3281_o7_module_copy_ledger.test.mjs`
     *        的 B1 当场翻红，点名 hydrateState 一簇 11 成员）。本仓「两份实现即第二真源」。
     *     ② 更要命的是它在这些模块上**必然装脏**：本模块的 clusters / currentBudgetTokens 是
     *        数组（元素含 factCount 与 timeRange）+ 正整数预算，而落盘/读盘走 JSON —— 存档里它们是普通对象/数组，
     *        浅合并会把普通对象原样写回字段，此后本模块每次 `.get` / `.has` / `.add`
     *        都是 TypeError。「登记成立」不等于「恢复正确」。
     *   故按本模块真实形状逐字段归一（与同族 37 个已有 hydrateState 的口径一致：
     *   只取认得的键、逐字段夹紧、构造正确的容器类型），并且**不再**与任何模块逐字相同。
     *
     * 口径（刻意**不抛错**，与同族 createState 的宽容度一致）：
     *   ① 非对象 / null / 数组 => 整体回落默认状态；
     *   ② 只读默认形状里已有的键（野键一律丢弃：野键进状态等于第二真源）；
     *   ③ 容器按形状重建（Map/Set 由 entries/数组重建，绝不留原值）；
     *   ④ 数值按字段值域夹紧，字符串按受控枚举回落；未知值回落默认值（不抛、不猜）。
     * ============================================================ */

    function hydrateState(saved) {
        const s = createState();
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return s;
        if (Array.isArray(saved.clusters)) {
            for (const c of saved.clusters) {
                if (!c || typeof c !== 'object' || Array.isArray(c)) continue;
                s.clusters.push({
                    epochId: String(c.epochId == null ? '' : c.epochId),
                    title: String(c.title == null ? '' : c.title),
                    summary: String(c.summary == null ? '' : c.summary),
                    factCount: Math.max(0, Number.isFinite(Number(c.factCount)) ? Math.floor(Number(c.factCount)) : 0),
                    timeRange: (c.timeRange && typeof c.timeRange === 'object' && !Array.isArray(c.timeRange)) ? c.timeRange : {}
                });
            }
        }
        const budget = Number(saved.currentBudgetTokens);
        if (Number.isFinite(budget) && budget > 0) s.currentBudgetTokens = Math.floor(budget);
        return s;
    }

    return {
        createState: createState,
        compressFactsIntoPyramid: compressFactsIntoPyramid,
        adjustAttentionBudget: adjustAttentionBudget,
        hydrateState
    };
}));