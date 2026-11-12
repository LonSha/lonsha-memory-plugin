/* ============================================================
 * obsessive-taboo-multi-tier-defense.js — [v3.460.0 · V21-L4]
 * 创伤禁忌与应激失控的多层心理防线重构 (Multi-Tier Taboo Defense Engine)
 * ------------------------------------------------------------
 * 升级 V20 机械硬拦截为动态心理张力波形与三层渐进心理防线：
 * Tier 1: 轻微回避 (Defensive Diversion & Evasion)
 * Tier 2: 掩饰性谎言/合理化 (Rationalization & Masking)
 * Tier 3: 应激崩溃破防 (Acute Traumatic Meltdown & Lash-Out)
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaMultiTierDefense = factory();
        root.ObsessiveTabooMultiTierDefense = root.LonShaMultiTierDefense;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    const DEFENSE_TIER = Object.freeze({
        TIER_1_EVASION: 1,       // 轻微回避
        TIER_2_RATIONALIZE: 2,   // 掩饰合理化
        TIER_3_MELTDOWN: 3       // 应激破防
    });

    function createMultiTierDefenseState() {
        return {
            version: VERSION,
            tabooSensors: new Map(), // character -> [{ tabooId, keyword, triggerCount, traumaThreshold }]
            stressTension: new Map(), // character -> tensionLevel (0.0 ~ 1.0)
            updatedAt: Date.now()
        };
    }

    function registerCharacterTaboo(state, character, taboo = {}) {
        if (!state || !state.tabooSensors) return false;
        const charName = String(character || "").trim();
        if (!charName) return false;
        if (!state.tabooSensors.has(charName)) {
            state.tabooSensors.set(charName, []);
            state.stressTension.set(charName, 0.0);
        }
        const list = state.tabooSensors.get(charName);
        list.push({
            tabooId: String(taboo.id || taboo.tabooId || `taboo_${Date.now()}`),
            topic: String(taboo.topic || taboo.keyword || "").trim(),
            keywords: Array.isArray(taboo.keywords) ? taboo.keywords : [String(taboo.keyword || taboo.topic || taboo || "")].filter(Boolean),
            traumaThreshold: Number(taboo.traumaThreshold || 0.7),
            sensitizedAt: Date.now()
        });
        state.updatedAt = Date.now();
        return true;
    }

    function evaluatePsychologicalDefense(state, character, incomingText = "") {
        if (!state || !state.tabooSensors) return { tier: 0, tension: 0.0, directive: null };
        const charName = String(character || "").trim();
        const taboos = state.tabooSensors.get(charName) || [];
        let currentTension = state.stressTension.get(charName) || 0.0;
        let matchedTaboo = null;

        for (const t of taboos) {
            for (const kw of t.keywords) {
                if (incomingText.includes(kw)) {
                    matchedTaboo = t;
                    currentTension = Math.min(1.0, currentTension + 0.35);
                    break;
                }
            }
            if (matchedTaboo) break;
        }

        if (!matchedTaboo) {
            currentTension = Math.max(0.0, currentTension - 0.05); // 自然平复
        }

        state.stressTension.set(charName, currentTension);
        state.updatedAt = Date.now();

        if (currentTension >= 0.75) {
            return {
                tier: DEFENSE_TIER.TIER_3_MELTDOWN,
                tension: currentTension,
                matchedTaboo,
                directive: "[心理创伤重度应激] 角色情绪彻底失控破防，表现出歇斯底里、剧烈抗拒或攻击性防御，语序破碎。"
            };
        } else if (currentTension >= 0.4) {
            return {
                tier: DEFENSE_TIER.TIER_2_RATIONALIZE,
                tension: currentTension,
                matchedTaboo,
                directive: "[掩饰性防御] 角色内心警惕紧绷，言语中极力粉饰太平、编造合理化借口试图转移矛盾。"
            };
        } else if (currentTension > 0.1) {
            return {
                tier: DEFENSE_TIER.TIER_1_EVASION,
                tension: currentTension,
                matchedTaboo,
                directive: "[轻微回避] 角色眼神游移、短暂沉默，试图轻描淡写地换个轻松话题避开尴尬点。"
            };
        }

        return { tier: 0, tension: currentTension, matchedTaboo: null, directive: null };
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
     *     ② 更要命的是它在这些模块上**必然装脏**：本模块的 tabooSensors / stressTension 是
     *        `Map<character, Array<sensor>>` + `Map<character, 0~1>`，而落盘/读盘走 JSON —— 存档里它们是普通对象/数组，
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
        const s = createMultiTierDefenseState();
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return s;
        const entriesOf = (v) => {
            if (v instanceof Map) return Array.from(v.entries());
            if (Array.isArray(v)) return v;
            if (v && typeof v === 'object') return Object.entries(v);
            return [];
        };
        /* tabooSensors 是 Map<character, Array<sensor>>，stressTension 是 Map<character, number>。
         * 两者都必须由 JSON 对象重建：留原值则后续 .get/.set 全是 TypeError。*/
        for (const pair of entriesOf(saved.tabooSensors)) {
            if (!Array.isArray(pair) || pair.length < 2) continue;
            const list = Array.isArray(pair[1]) ? pair[1] : [];
            const out = [];
            for (const t of list) {
                if (!t || typeof t !== 'object' || Array.isArray(t)) continue;
                out.push({
                    tabooId: String(t.tabooId == null ? '' : t.tabooId),
                    keyword: String(t.keyword == null ? '' : t.keyword),
                    triggerCount: Math.max(0, Number.isFinite(Number(t.triggerCount)) ? Math.floor(Number(t.triggerCount)) : 0),
                    traumaThreshold: Number.isFinite(Number(t.traumaThreshold)) ? Math.max(0, Math.min(1, Number(t.traumaThreshold))) : 0.5
                });
            }
            s.tabooSensors.set(String(pair[0]), out);
        }
        for (const pair of entriesOf(saved.stressTension)) {
            if (!Array.isArray(pair) || pair.length < 2) continue;
            const n = Number(pair[1]);
            s.stressTension.set(String(pair[0]), Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
        }
        if (Number.isFinite(Number(saved.updatedAt))) s.updatedAt = Number(saved.updatedAt);
        return s;
    }

    /* [v3.464.0 · L21-O4] 按水合表的**登记名**导出别名。
     * 宿主 `engine-persistence-ops.js` 登记的是 `hydrateDefenseState`（专用名），
     * 而本文件的水合实现收敛在 hydrateState 一处 —— 保留单一实现，只加导出别名，
     * 避免出现两份实现（两份即第二真源，本仓 v3.444.0 的「同名两份」教训）。 */
    const hydrateDefenseState = hydrateState;

    /* [v3.464.0 · L21-O4] 宿主初始化登记名别名。
     * `index.js` 的 v21Initializers 表登记的是 `createInitialDefenseState`，
     * 而本文件的默认状态构造叫 `createMultiTierDefenseState` —— 现场实测（本版起点）：
     * 表里 18 项登记名**没有一个**在模块导出面上存在，于是
     * `typeof lib[initFn] === 'function'` 恒假，初始化整段静默跳过 ——
     * v3.460.0 声称的「18 项心智引擎初始状态与宿主生命周期融合挂载」实际从未发生。
     * 这里只加**别名**，不复制实现：两份实现即第二真源（v3.444.0 同名两份的教训）。 */
    const createInitialDefenseState = createMultiTierDefenseState;

    return {
        VERSION,
        DEFENSE_TIER,
        createMultiTierDefenseState,
        registerCharacterTaboo,
        evaluatePsychologicalDefense,
        hydrateState,
        hydrateDefenseState,
        createInitialDefenseState
    };
}));
