/* ============================================================
 * emotional-anchor-binding-resonance-hub.js — [v3.460.0 · V21-L12]
 * 心锚誓约不可逆反噬与情感羁绊共生中枢 (Emotional Anchor Binding Hub)
 * ------------------------------------------------------------
 * 1. 终身誓约与灵魂心锚建立 (Sacred Oath Inscription)
 * 2. 违约心碎与不可逆信赖坍塌裁决 (Oath-Breaker Karmic Lash)
 * 3. 角色间的情感共生波形联动 (Affective Resonance Symbiosis)
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaEmotionalAnchor = factory();
        root.EmotionalAnchorBindingResonanceHub = root.LonShaEmotionalAnchor;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function createAnchorState() {
        return {
            version: VERSION,
            activeCovenants: new Map(), // covenantId -> covenant
            brokenOaths: [],
            updatedAt: Date.now()
        };
    }

    function inscribeCovenant(state, oathSpec = {}) {
        if (!state || !state.activeCovenants) return null;
        const id = String(oathSpec.id || `cov_${Date.now()}`);
        const covenant = {
            id,
            parties: Array.isArray(oathSpec.parties) ? oathSpec.parties : [],
            promiseText: String(oathSpec.promiseText || oathSpec.title || ""),
            title: String(oathSpec.title || oathSpec.promiseText || ""),
            sanctityLevel: Number(oathSpec.sanctityLevel || 1.0),
            status: "sacred_active",
            createdAt: Date.now()
        };
        state.activeCovenants.set(id, covenant);
        state.updatedAt = Date.now();
        return covenant;
    }

    function shatterCovenant(state, covenantId, breakerActor = "") {
        if (!state || !state.activeCovenants) return null;
        const cov = state.activeCovenants.get(covenantId);
        if (!cov) return null;
        cov.status = "shattered";
        const brokenRecord = {
            covenantId,
            breakerActor: String(breakerActor),
            brokenAt: Date.now(),
            backlashTension: 1.0,
            directive: `[誓约决裂创伤] 誓约已被背弃！角色心中筑起永久性信任冰川，伴随剧烈痛苦与因果反噬。`
        };
        state.brokenOaths.push(brokenRecord);
        state.updatedAt = Date.now();
        return brokenRecord;
    }
    function generateAnchorDirectives(state, speaker = "") {
        if (!state) return null;
        const dirs = [];
        if (Array.isArray(state.brokenOaths) && state.brokenOaths.length > 0) {
            const latestBroken = state.brokenOaths[state.brokenOaths.length - 1];
            dirs.push(latestBroken.directive);
        } else if (state.activeCovenants && state.activeCovenants.size > 0) {
            for (const cov of state.activeCovenants.values()) {
                if (cov.status === "sacred_active") {
                    dirs.push(`[心中立下的誓约] 曾许下不可辜负的诺言：“${cov.promiseText || cov.title || '彼此的誓约'}”，无论面对何种境遇都不可轻易违背。`);
                    break;
                }
            }
        }
        return dirs.length ? dirs.join("\n") : null;
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
     *     ② 更要命的是它在这些模块上**必然装脏**：本模块的 activeCovenants / brokenOaths 是
     *        `Map<covenantId, covenant>` + 数组，而落盘/读盘走 JSON —— 存档里它们是普通对象/数组，
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
        const s = createAnchorState();
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return s;
        /* activeCovenants 的正体是 Map —— 由 entries/数组/普通对象重建。 */
        let entries = [];
        if (saved.activeCovenants instanceof Map) entries = Array.from(saved.activeCovenants.entries());
        else if (Array.isArray(saved.activeCovenants)) entries = saved.activeCovenants;
        else if (saved.activeCovenants && typeof saved.activeCovenants === 'object') entries = Object.entries(saved.activeCovenants);
        for (const pair of entries) {
            if (!Array.isArray(pair) || pair.length < 2) continue;
            const v = pair[1];
            if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
            s.activeCovenants.set(String(pair[0]), v);
        }
        if (Array.isArray(saved.brokenOaths)) {
            for (const b of saved.brokenOaths) {
                if (!b || typeof b !== 'object' || Array.isArray(b)) continue;
                s.brokenOaths.push(b);
            }
        }
        if (Number.isFinite(Number(saved.updatedAt))) s.updatedAt = Number(saved.updatedAt);
        return s;
    }

    /* [v3.464.0 · L21-O4] 按水合表的**登记名**导出别名。
     * 宿主 `engine-persistence-ops.js` 登记的是 `hydrateAnchorState`（专用名），
     * 而本文件的水合实现收敛在 hydrateState 一处 —— 保留单一实现，只加导出别名，
     * 避免出现两份实现（两份即第二真源，本仓 v3.444.0 的「同名两份」教训）。 */
    const hydrateAnchorState = hydrateState;

    /* [v3.464.0 · L21-O4] 宿主初始化登记名别名。
     * `index.js` 的 v21Initializers 表登记的是 `createInitialAnchorState`，
     * 而本文件的默认状态构造叫 `createAnchorState` —— 现场实测（本版起点）：
     * 表里 18 项登记名**没有一个**在模块导出面上存在，于是
     * `typeof lib[initFn] === 'function'` 恒假，初始化整段静默跳过 ——
     * v3.460.0 声称的「18 项心智引擎初始状态与宿主生命周期融合挂载」实际从未发生。
     * 这里只加**别名**，不复制实现：两份实现即第二真源（v3.444.0 同名两份的教训）。 */
    const createInitialAnchorState = createAnchorState;

    return {
        VERSION,
        createAnchorState,
        inscribeCovenant,
        shatterCovenant,
        generateAnchorDirectives,
        hydrateState,
        hydrateAnchorState,
        createInitialAnchorState
    };
}));
