/* ============================================================
 * dissociative-amnesia-puzzle-workbench.js — [v3.460.0 · V21-L14]
 * 记忆解离、创伤遗忘与迷雾碎片考古工作台 (Amnesia Puzzle Workbench)
 * ------------------------------------------------------------
 * 1. 记忆碎片迷雾遮蔽与解密进度 (Fog-of-Memory Obfuscation)
 * 2. 旧物证线索催化解锁判定 (Catalytic Clue Unlocking)
 * 3. 终极真相拼齐高潮大回响 (Climax Epiphany Resonance)
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaAmnesiaWorkbench = factory();
        root.DissociativeAmnesiaPuzzleWorkbench = root.LonShaAmnesiaWorkbench;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function createPuzzleState() {
        return {
            version: VERSION,
            hiddenFragments: new Map(), // fragmentId -> { clueRequirements, isUnlocked, content }
            unlockedCount: 0,
            updatedAt: Date.now()
        };
    }

    function registerHiddenFragment(state, fragment = {}) {
        if (!state || !state.hiddenFragments) return null;
        const id = String(fragment.id || `frag_${Date.now()}`);
        const record = {
            id,
            title: String(fragment.title || "残缺记忆碎片"),
            content: String(fragment.content || ""),
            clueRequired: String(fragment.clueRequired || "key"),
            isUnlocked: false
        };
        state.hiddenFragments.set(id, record);
        state.updatedAt = Date.now();
        return record;
    }

    function presentClueTrigger(state, clueKeyword = "") {
        if (!state || !state.hiddenFragments) return [];
        const newlyUnlocked = [];
        for (const [id, frag] of state.hiddenFragments.entries()) {
            if (!frag.isUnlocked && clueKeyword.includes(frag.clueRequired)) {
                frag.isUnlocked = true;
                state.unlockedCount++;
                newlyUnlocked.push(frag);
            }
        }
        state.updatedAt = Date.now();
        return newlyUnlocked;
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
     *     ② 更要命的是它在这些模块上**必然装脏**：本模块的 hiddenFragments 是
     *        `Map<fragmentId, {clueRequirements, isUnlocked, content}>`，而落盘/读盘走 JSON —— 存档里它们是普通对象/数组，
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
        const s = createPuzzleState();
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return s;
        /* hiddenFragments 的正体是 Map —— 必须由 entries/数组/普通对象重建，绝不留原值。 */
        let entries = [];
        if (saved.hiddenFragments instanceof Map) entries = Array.from(saved.hiddenFragments.entries());
        else if (Array.isArray(saved.hiddenFragments)) entries = saved.hiddenFragments;
        else if (saved.hiddenFragments && typeof saved.hiddenFragments === 'object') entries = Object.entries(saved.hiddenFragments);
        for (const pair of entries) {
            if (!Array.isArray(pair) || pair.length < 2) continue;
            const v = pair[1];
            const f = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
            s.hiddenFragments.set(String(pair[0]), {
                clueRequirements: Array.isArray(f.clueRequirements) ? f.clueRequirements.slice() : [],
                isUnlocked: f.isUnlocked === true,
                content: String(f.content == null ? '' : f.content)
            });
        }
        s.unlockedCount = Math.max(0, Number.isFinite(Number(saved.unlockedCount)) ? Math.floor(Number(saved.unlockedCount)) : 0);
        if (Number.isFinite(Number(saved.updatedAt))) s.updatedAt = Number(saved.updatedAt);
        return s;
    }

    /* [v3.464.0 · L21-O4] 按水合表的**登记名**导出别名。
     * 宿主 `engine-persistence-ops.js` 登记的是 `hydratePuzzleState`（专用名），
     * 而本文件的水合实现收敛在 hydrateState 一处 —— 保留单一实现，只加导出别名，
     * 避免出现两份实现（两份即第二真源，本仓 v3.444.0 的「同名两份」教训）。 */
    const hydratePuzzleState = hydrateState;

    /* [v3.464.0 · L21-O4] 宿主初始化登记名别名。
     * `index.js` 的 v21Initializers 表登记的是 `createInitialPuzzleState`，
     * 而本文件的默认状态构造叫 `createPuzzleState` —— 现场实测（本版起点）：
     * 表里 18 项登记名**没有一个**在模块导出面上存在，于是
     * `typeof lib[initFn] === 'function'` 恒假，初始化整段静默跳过 ——
     * v3.460.0 声称的「18 项心智引擎初始状态与宿主生命周期融合挂载」实际从未发生。
     * 这里只加**别名**，不复制实现：两份实现即第二真源（v3.444.0 同名两份的教训）。 */
    const createInitialPuzzleState = createPuzzleState;

    return {
        VERSION,
        createPuzzleState,
        registerHiddenFragment,
        presentClueTrigger,
        hydrateState,
        hydratePuzzleState,
        createInitialPuzzleState
    };
}));
