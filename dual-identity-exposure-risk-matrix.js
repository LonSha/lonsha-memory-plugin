/* ============================================================
 * dual-identity-exposure-risk-matrix.js — [v3.460.0 · V21-L17]
 * 双重身份暴露风险博弈与隐秘掩饰中枢 (Dual Identity Exposure Matrix)
 * ------------------------------------------------------------
 * 1. 双重面具与社会怀疑度追踪 (Social Suspicion Meter 0.0 ~ 1.0)
 * 2. 破绽累积与应急掩护策略 (Cover Strategy Synthesis)
 * 3. 临界戒备与身份撕裂反制 (Exposure Threshold Breach)
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaIdentityExposure = factory();
        root.DualIdentityExposureRiskMatrix = root.LonShaIdentityExposure;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function createExposureState() {
        return {
            version: VERSION,
            covertIdentities: new Map(), // actor -> { publicRole, secretRole, suspicionLevel }
            updatedAt: Date.now()
        };
    }

    function recordCovertSlip(state, actor, suspicionDelta = 0.2) {
        if (!state || !state.covertIdentities) return null;
        const name = String(actor || "");
        if (!state.covertIdentities.has(name)) {
            state.covertIdentities.set(name, {
                actor: name,
                publicRole: "平民",
                secretRole: "特工/卧底",
                suspicionLevel: 0.1
            });
        }
        const record = state.covertIdentities.get(name);
        record.suspicionLevel = Math.max(0.0, Math.min(1.0, record.suspicionLevel + Number(suspicionDelta)));
        state.updatedAt = Date.now();

        let alertLevel = "safe";
        if (record.suspicionLevel >= 0.8) alertLevel = "critical_danger";
        else if (record.suspicionLevel >= 0.5) alertLevel = "suspicious";

        return {
            actor: name,
            currentSuspicion: record.suspicionLevel,
            alertLevel
        };
    }

    function generateRiskDirectives(state = {}, speaker = "角色") {
        if (!state) return null;
        const identities = state.covertIdentities;
        if (!identities) return null;
        const record = identities instanceof Map ? identities.get(speaker) : identities[speaker];
        if (!record || record.suspicionLevel < 0.4) return null;
        return `[身份防线提示] 对话中注意维护表层身份(${record.publicRole || "普通身份"})，避免无意间流露破绽。`;
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
     *     ② 更要命的是它在这些模块上**必然装脏**：本模块的 covertIdentities 是
     *        `Map<actor, {publicRole, secretRole, suspicionLevel:0~1}>`，而落盘/读盘走 JSON —— 存档里它们是普通对象/数组，
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
        const s = createExposureState();
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return s;
        /* covertIdentities 的正体是 Map —— 由 entries/数组/普通对象重建。 */
        let entries = [];
        if (saved.covertIdentities instanceof Map) entries = Array.from(saved.covertIdentities.entries());
        else if (Array.isArray(saved.covertIdentities)) entries = saved.covertIdentities;
        else if (saved.covertIdentities && typeof saved.covertIdentities === 'object') entries = Object.entries(saved.covertIdentities);
        for (const pair of entries) {
            if (!Array.isArray(pair) || pair.length < 2) continue;
            const v = pair[1];
            const c = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
            const suspicion = Number(c.suspicionLevel);
            s.covertIdentities.set(String(pair[0]), {
                publicRole: String(c.publicRole == null ? '' : c.publicRole),
                secretRole: String(c.secretRole == null ? '' : c.secretRole),
                suspicionLevel: Number.isFinite(suspicion) ? Math.max(0, Math.min(1, suspicion)) : 0
            });
        }
        if (Number.isFinite(Number(saved.updatedAt))) s.updatedAt = Number(saved.updatedAt);
        return s;
    }

    /* [v3.464.0 · L21-O4] 按水合表的**登记名**导出别名。
     * 宿主 `engine-persistence-ops.js` 登记的是 `hydrateRiskState`（专用名），
     * 而本文件的水合实现收敛在 hydrateState 一处 —— 保留单一实现，只加导出别名，
     * 避免出现两份实现（两份即第二真源，本仓 v3.444.0 的「同名两份」教训）。 */
    const hydrateRiskState = hydrateState;

    /* [v3.464.0 · L21-O4] 宿主初始化登记名别名。
     * `index.js` 的 v21Initializers 表登记的是 `createInitialRiskState`，
     * 而本文件的默认状态构造叫 `createExposureState` —— 现场实测（本版起点）：
     * 表里 18 项登记名**没有一个**在模块导出面上存在，于是
     * `typeof lib[initFn] === 'function'` 恒假，初始化整段静默跳过 ——
     * v3.460.0 声称的「18 项心智引擎初始状态与宿主生命周期融合挂载」实际从未发生。
     * 这里只加**别名**，不复制实现：两份实现即第二真源（v3.444.0 同名两份的教训）。 */
    const createInitialRiskState = createExposureState;

    return {
        VERSION,
        createExposureState,
        recordCovertSlip,
        generateRiskDirectives,
        hydrateState,
        hydrateRiskState,
        createInitialRiskState
    };
}));
