/* ============================================================
 * intersubjective-parallax-isolation.js — [v3.460.0 · V21-L5]
 * 多角色主体间性与非对称情报隔绝矩阵 (Intersubjective Parallax Isolation)
 * ------------------------------------------------------------
 * 解决多 NPC/群聊场景中记忆串味、知晓边界混乱痛点：
 * 1. 角色私有知识库严密沙盒隔绝 (Private Knowledge Sandbox)
 * 2. 公共知识 vs 猜测/传闻非对称标记 (Public vs Inferred vs Rumor)
 * 3. 跨角色视差认知矩阵与盲区探测 (Parallax Asymmetry Matrix)
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaParallaxIsolation = factory();
        root.IntersubjectiveParallaxIsolation = root.LonShaParallaxIsolation;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function createParallaxIsolationState() {
        return {
            version: VERSION,
            characterDossiers: new Map(), // actorName -> { knownFacts: Set, suspectedFacts: Set, blindSpots: Set }
            sharedPublicFacts: new Set(),
            updatedAt: Date.now()
        };
    }

    function ensureActorDossier(state, actor) {
        const name = String(actor || "").trim();
        if (!name) return null;
        if (!state.characterDossiers.has(name)) {
            state.characterDossiers.set(name, {
                actor: name,
                knownFacts: new Set(),
                suspectedFacts: new Set(),
                blindSpots: new Set()
            });
        }
        return state.characterDossiers.get(name);
    }

    function grantFactKnowledge(state, actor, factId, mode = "known") {
        if (!state || !state.characterDossiers) return false;
        const dossier = ensureActorDossier(state, actor);
        if (!dossier) return false;
        const fid = String(factId || "").trim();
        if (!fid) return false;

        dossier.blindSpots.delete(fid);
        if (mode === "suspected") {
            dossier.suspectedFacts.add(fid);
        } else {
            dossier.knownFacts.add(fid);
        }
        state.updatedAt = Date.now();
        return true;
    }

    function checkActorKnowledge(state, actor, factId) {
        if (!state || !state.characterDossiers) return { known: false, mode: "unaware" };
        const fid = String(factId || "").trim();
        if (state.sharedPublicFacts && state.sharedPublicFacts.has(fid)) {
            return { known: true, mode: "public_common" };
        }
        const dossier = state.characterDossiers.get(String(actor || "").trim());
        if (!dossier) return { known: false, mode: "unaware" };

        if (dossier.knownFacts.has(fid)) return { known: true, mode: "private_known" };
        if (dossier.suspectedFacts.has(fid)) return { known: true, mode: "suspected" };
        return { known: false, mode: "blind_spot" };
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
     *     ② 更要命的是它在这些模块上**必然装脏**：本模块的 characterDossiers / sharedPublicFacts 是
     *        `Map<actor, {knownFacts:Set, suspectedFacts:Set, blindSpots:Set}>` + `Set`，而落盘/读盘走 JSON —— 存档里它们是普通对象/数组，
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
        const s = createParallaxIsolationState();
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return s;
        const toSet = (v) => {
            if (v instanceof Set) return new Set(Array.from(v).map(String));
            if (Array.isArray(v)) return new Set(v.map(String));
            return new Set();
        };
        /* characterDossiers 的正体是 Map<actorName, {knownFacts:Set, suspectedFacts:Set, blindSpots:Set}>。
         * 三层容器都必须重建：Map 留原值则 .get 报错；内层 Set 在 JSON 里是数组，
         * 留原值则 .has 恒假（首版通用浅合并正是把数组直接塞进 Set 字段）。*/
        let entries = [];
        if (saved.characterDossiers instanceof Map) entries = Array.from(saved.characterDossiers.entries());
        else if (Array.isArray(saved.characterDossiers)) entries = saved.characterDossiers;
        else if (saved.characterDossiers && typeof saved.characterDossiers === 'object') entries = Object.entries(saved.characterDossiers);
        for (const pair of entries) {
            if (!Array.isArray(pair) || pair.length < 2) continue;
            const v = pair[1];
            const d = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
            s.characterDossiers.set(String(pair[0]), {
                knownFacts: toSet(d.knownFacts),
                suspectedFacts: toSet(d.suspectedFacts),
                blindSpots: toSet(d.blindSpots)
            });
        }
        s.sharedPublicFacts = toSet(saved.sharedPublicFacts);
        if (Number.isFinite(Number(saved.updatedAt))) s.updatedAt = Number(saved.updatedAt);
        return s;
    }

    /* [v3.464.0 · L21-O4] 按水合表的**登记名**导出别名。
     * 宿主 `engine-persistence-ops.js` 登记的是 `hydrateParallaxState`（专用名），
     * 而本文件的水合实现收敛在 hydrateState 一处 —— 保留单一实现，只加导出别名，
     * 避免出现两份实现（两份即第二真源，本仓 v3.444.0 的「同名两份」教训）。 */
    const hydrateParallaxState = hydrateState;

    /* [v3.464.0 · L21-O4] 宿主初始化登记名别名。
     * `index.js` 的 v21Initializers 表登记的是 `createInitialParallaxState`，
     * 而本文件的默认状态构造叫 `createParallaxIsolationState` —— 现场实测（本版起点）：
     * 表里 18 项登记名**没有一个**在模块导出面上存在，于是
     * `typeof lib[initFn] === 'function'` 恒假，初始化整段静默跳过 ——
     * v3.460.0 声称的「18 项心智引擎初始状态与宿主生命周期融合挂载」实际从未发生。
     * 这里只加**别名**，不复制实现：两份实现即第二真源（v3.444.0 同名两份的教训）。 */
    const createInitialParallaxState = createParallaxIsolationState;

    return {
        VERSION,
        createParallaxIsolationState,
        grantFactKnowledge,
        checkActorKnowledge,
        hydrateState,
        hydrateParallaxState,
        createInitialParallaxState
    };
}));
