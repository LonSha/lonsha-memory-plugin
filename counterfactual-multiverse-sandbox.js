(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaCounterfactualSandbox = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createState() {
        return {
            pivotEvents: [],
            simulations: []
        };
    }

    function recordPivotEvent(state, eventDesc, choiceTaken, alternateChoice) {
        const pivot = {
            id: 'pivot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            eventDesc: eventDesc,
            choiceTaken: choiceTaken,
            alternateChoice: alternateChoice,
            timestamp: Date.now()
        };
        state.pivotEvents.push(pivot);
        return pivot;
    }

    function simulateAlternateOutcome(state, pivotId) {
        const pivot = state.pivotEvents.find(p => p.id === pivotId || p.eventDesc.includes(pivotId));
        if (!pivot) return null;

        const sim = {
            id: 'sim_' + Date.now(),
            pivotId: pivot.id,
            alternateChoice: pivot.alternateChoice,
            hypotheticalWorld: '如果当初没有「' + pivot.choiceTaken + '」，而是选择了「' + pivot.alternateChoice + '」，或许如今彼此早已在人海中走散，沦为毫不相关的陌路人。',
            sentimentShift: '感慨万千与更知珍惜',
            simulatedAt: Date.now()
        };
        state.simulations.push(sim);
        return sim;
    }

    function generateCounterfactualDirectives(state) {
        const directives = [];
        if (state.simulations.length > 0) {
            const latest = state.simulations[state.simulations.length - 1];
            directives.push(
                '【反事实平行人生感怀·珍惜当下】角色脑海中掠过平行命运的分歧沙盘：' + latest.hypotheticalWorld +
                '。角色内心产生强烈的情感共鸣，更加庆幸并珍惜如今与谈话对象并肩的每一刻，生成台词可自然带有一丝深沉而温柔的庆幸感叹。'
            );
        }
        return directives;
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
     *     ② 更要命的是它在这些模块上**必然装脏**：本模块的 pivotEvents / simulations 是
     *        两个数组，而落盘/读盘走 JSON —— 存档里它们是普通对象/数组，
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
        if (Array.isArray(saved.pivotEvents)) {
            for (const p of saved.pivotEvents) {
                if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
                s.pivotEvents.push({
                    id: String(p.id == null ? '' : p.id),
                    eventDesc: String(p.eventDesc == null ? '' : p.eventDesc),
                    choiceTaken: String(p.choiceTaken == null ? '' : p.choiceTaken),
                    alternateChoice: String(p.alternateChoice == null ? '' : p.alternateChoice),
                    timestamp: Number.isFinite(Number(p.timestamp)) ? Number(p.timestamp) : 0
                });
            }
        }
        if (Array.isArray(saved.simulations)) {
            for (const x of saved.simulations) {
                if (!x || typeof x !== 'object' || Array.isArray(x)) continue;
                s.simulations.push(x);
            }
        }
        return s;
    }

    return {
        createState: createState,
        recordPivotEvent: recordPivotEvent,
        simulateAlternateOutcome: simulateAlternateOutcome,
        generateCounterfactualDirectives: generateCounterfactualDirectives,
        hydrateState
    };
}));