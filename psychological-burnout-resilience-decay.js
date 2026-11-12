/* ============================================================
 * psychological-burnout-resilience-decay.js — [v3.460.0 · V21-L18]
 * 长程情绪耗竭与心理韧性衰减模型 (Psychological Burnout Resilience Decay)
 * ------------------------------------------------------------
 * 1. 创伤抗击打心理韧性 (Mental Resilience Meter)
 * 2. 连续绝望境遇下的厌战与情感麻木 (Learned Helplessness)
 * 3. 治愈羁绊事件重塑心理韧性 (Psychological Restoration)
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaBurnoutResilience = factory();
        root.PsychologicalBurnoutResilienceDecay = root.LonShaBurnoutResilience;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function createResilienceState() {
        return {
            version: VERSION,
            actorResilience: new Map(), // actor -> { resilience: 1.0, exhaustion: 0.0 }
            updatedAt: Date.now()
        };
    }

    function applyStressTrauma(state, actor, stressImpact = 0.25) {
        if (!state || !state.actorResilience) return null;
        const name = String(actor || "");
        if (!state.actorResilience.has(name)) {
            state.actorResilience.set(name, { resilience: 1.0, exhaustion: 0.0 });
        }
        const st = state.actorResilience.get(name);
        st.exhaustion = Math.min(1.0, st.exhaustion + Number(stressImpact));
        st.resilience = Math.max(0.0, 1.0 - st.exhaustion);
        state.updatedAt = Date.now();

        let stateDescription = "心态充沛";
        if (st.exhaustion >= 0.75) {
            stateDescription = "重度心力交瘁，表现出倦怠麻木与习得性无助";
        } else if (st.exhaustion >= 0.4) {
            stateDescription = "有些疲惫与心防脆弱";
        }

        return {
            actor: name,
            resilience: Number(st.resilience.toFixed(2)),
            exhaustion: Number(st.exhaustion.toFixed(2)),
            directive: `[长程情绪耗竭状态] 角色当前处于「${stateDescription}」，言语中偶现疲态。`
        };
    }

    function generateBurnoutDirectives(state = {}, speaker = "角色") {
        if (!state) return null;
        const resilienceMap = state.actorResilience;
        if (!resilienceMap) return null;
        const st = resilienceMap instanceof Map ? resilienceMap.get(speaker) : resilienceMap[speaker];
        if (!st || st.exhaustion < 0.3) return null;
        return `[当前精力状态] 角色近期稍感疲惫，语气略显温和倦怠。`;
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
     *     ② 更要命的是它在这些模块上**必然装脏**：本模块的 actorResilience 是
     *        `Map<actor, {resilience:0~1, exhaustion:0~1}>`，而落盘/读盘走 JSON —— 存档里它们是普通对象/数组，
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
        const s = createResilienceState();
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return s;
        let entries = [];
        if (saved.actorResilience instanceof Map) entries = Array.from(saved.actorResilience.entries());
        else if (Array.isArray(saved.actorResilience)) entries = saved.actorResilience;
        else if (saved.actorResilience && typeof saved.actorResilience === 'object') entries = Object.entries(saved.actorResilience);
        for (const pair of entries) {
            if (!Array.isArray(pair) || pair.length < 2) continue;
            const v = pair[1];
            const r = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
            const res = Number(r.resilience);
            const exh = Number(r.exhaustion);
            s.actorResilience.set(String(pair[0]), {
                resilience: Number.isFinite(res) ? Math.max(0, Math.min(1, res)) : 1,
                exhaustion: Number.isFinite(exh) ? Math.max(0, Math.min(1, exh)) : 0
            });
        }
        if (Number.isFinite(Number(saved.updatedAt))) s.updatedAt = Number(saved.updatedAt);
        return s;
    }

    /* [v3.464.0 · L21-O4] 按水合表的**登记名**导出别名。
     * 宿主 `engine-persistence-ops.js` 登记的是 `hydrateBurnoutState`（专用名），
     * 而本文件的水合实现收敛在 hydrateState 一处 —— 保留单一实现，只加导出别名，
     * 避免出现两份实现（两份即第二真源，本仓 v3.444.0 的「同名两份」教训）。 */
    const hydrateBurnoutState = hydrateState;

    /* [v3.464.0 · L21-O4] 宿主初始化登记名别名。
     * `index.js` 的 v21Initializers 表登记的是 `createInitialBurnoutState`，
     * 而本文件的默认状态构造叫 `createResilienceState` —— 现场实测（本版起点）：
     * 表里 18 项登记名**没有一个**在模块导出面上存在，于是
     * `typeof lib[initFn] === 'function'` 恒假，初始化整段静默跳过 ——
     * v3.460.0 声称的「18 项心智引擎初始状态与宿主生命周期融合挂载」实际从未发生。
     * 这里只加**别名**，不复制实现：两份实现即第二真源（v3.444.0 同名两份的教训）。 */
    const createInitialBurnoutState = createResilienceState;

    return {
        VERSION,
        createResilienceState,
        applyStressTrauma,
        generateBurnoutDirectives,
        hydrateState,
        hydrateBurnoutState,
        createInitialBurnoutState
    };
}));
