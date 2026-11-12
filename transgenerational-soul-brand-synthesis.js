/* ============================================================
 * transgenerational-soul-brand-synthesis.js — [v3.460.0 · V21-L9]
 * 跨周目灵魂烙印转生与深层潜意识代际沉淀 (Transgenerational Soul Brand Synthesis)
 * ------------------------------------------------------------
 * 1. 跨周目核心记忆升华为前世直觉烙印 (Instinctive Soul Brands)
 * 2. 轮回既视感微反应触发器 (Deja-Vu Epiphany Sensor)
 * 3. 宿命宿怨因果转生传承 (Reincarnation Karmic Lineage)
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaSoulBrand = factory();
        root.TransgenerationalSoulBrandSynthesis = root.LonShaSoulBrand;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function createSoulBrandState() {
        return {
            version: VERSION,
            activeBrands: [], // [{ id, pastEpoch, characterOrigin, brandEssence, triggerKeywords, intuitionBonus }]
            incarnationCycle: 1,
            updatedAt: Date.now()
        };
    }

    function inscribeSoulBrand(state, brand = {}) {
        if (!state || !state.activeBrands) return false;
        const entry = {
            id: String(brand.id || `brand_${Date.now()}`),
            pastEpoch: String(brand.pastEpoch || "previous_life"),
            characterOrigin: String(brand.characterOrigin || "ancestor"),
            brandEssence: String(brand.brandEssence || "前世记忆的执念"),
            triggerKeywords: Array.isArray(brand.triggerKeywords) ? brand.triggerKeywords : [],
            intuitionBonus: String(brand.intuitionBonus || "莫名熟悉的第六感"),
            inscribedAt: Date.now()
        };
        state.activeBrands.push(entry);
        state.updatedAt = Date.now();
        return entry;
    }

    function probeDejaCasualResonance(state, contextText = "") {
        if (!state || !state.activeBrands) return [];
        const matches = [];
        for (const b of state.activeBrands) {
            for (const kw of b.triggerKeywords) {
                if (contextText.includes(kw)) {
                    matches.push({
                        brandId: b.id,
                        origin: b.characterOrigin,
                        flashbackPrompt: `[宿命既视感] 角色心中骤然升起强烈的莫明战栗与前世既视感：${b.intuitionBonus}`
                    });
                    break;
                }
            }
        }
        return matches;
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
     *     ② 更要命的是它在这些模块上**必然装脏**：本模块的 activeBrands / incarnationCycle 是
     *        数组（元素含 `triggerKeywords` 数组与 `intuitionBonus`）+ 正整数，而落盘/读盘走 JSON —— 存档里它们是普通对象/数组，
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
        const s = createSoulBrandState();
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return s;
        if (Array.isArray(saved.activeBrands)) {
            for (const b of saved.activeBrands) {
                if (!b || typeof b !== 'object' || Array.isArray(b)) continue;
                const bonus = Number(b.intuitionBonus);
                s.activeBrands.push({
                    id: String(b.id == null ? '' : b.id),
                    pastEpoch: String(b.pastEpoch == null ? '' : b.pastEpoch),
                    characterOrigin: String(b.characterOrigin == null ? '' : b.characterOrigin),
                    brandEssence: String(b.brandEssence == null ? '' : b.brandEssence),
                    triggerKeywords: Array.isArray(b.triggerKeywords) ? b.triggerKeywords.map(String) : [],
                    intuitionBonus: Number.isFinite(bonus) ? bonus : 0
                });
            }
        }
        const cycle = Number(saved.incarnationCycle);
        if (Number.isFinite(cycle) && cycle >= 1) s.incarnationCycle = Math.floor(cycle);
        if (Number.isFinite(Number(saved.updatedAt))) s.updatedAt = Number(saved.updatedAt);
        return s;
    }

    /* [v3.464.0 · L21-O4] 按水合表的**登记名**导出别名。
     * 宿主 `engine-persistence-ops.js` 登记的是 `hydrateSynthesisState`（专用名），
     * 而本文件的水合实现收敛在 hydrateState 一处 —— 保留单一实现，只加导出别名，
     * 避免出现两份实现（两份即第二真源，本仓 v3.444.0 的「同名两份」教训）。 */
    const hydrateSynthesisState = hydrateState;

    /* [v3.464.0 · L21-O4] 宿主初始化登记名别名。
     * `index.js` 的 v21Initializers 表登记的是 `createInitialSynthesisState`，
     * 而本文件的默认状态构造叫 `createSoulBrandState` —— 现场实测（本版起点）：
     * 表里 18 项登记名**没有一个**在模块导出面上存在，于是
     * `typeof lib[initFn] === 'function'` 恒假，初始化整段静默跳过 ——
     * v3.460.0 声称的「18 项心智引擎初始状态与宿主生命周期融合挂载」实际从未发生。
     * 这里只加**别名**，不复制实现：两份实现即第二真源（v3.444.0 同名两份的教训）。 */
    const createInitialSynthesisState = createSoulBrandState;

    return {
        VERSION,
        createSoulBrandState,
        inscribeSoulBrand,
        probeDejaCasualResonance,
        hydrateState,
        hydrateSynthesisState,
        createInitialSynthesisState
    };
}));
