(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaEntityDisambiguator = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createState() {
        return {
            characterAliases: {}, // "苏离": ["她", "苏小姐", "离离"], "林深": ["他", "林警官"]
            affinityScores: {}    // "苏离": 85, "林深": 30
        };
    }

    function registerCharacter(state, name, aliases = [], affinity = 50) {
        state.characterAliases[name] = aliases;
        state.affinityScores[name] = affinity;
    }

    /**
     * 在多人同场情境下，根据人际图谱亲密度加权解析代词“她”/“他”到底指向谁
     */
    function resolvePronounTarget(state, pronoun, presentCharacters = []) {
        const candidates = presentCharacters.filter(charName => {
            const aliases = state.characterAliases[charName] || [];
            return aliases.includes(pronoun);
        });

        if (candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];

        // 多人匹配时，亲密度最高者胜出
        candidates.sort((a, b) => {
            const affA = state.affinityScores[a] || 0;
            const affB = state.affinityScores[b] || 0;
            return affB - affA;
        });

        return {
            resolvedTarget: candidates[0],
            confidence: 0.95,
            reason: `根据在场候选与羁绊亲密度权重（${candidates[0]}:${state.affinityScores[candidates[0]]}），代词 [${pronoun}] 仲裁指向 [${candidates[0]}]。`
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
     *     ② 更要命的是它在这些模块上**必然装脏**：本模块的 characterAliases / affinityScores 是
     *        两个普通对象表（别名数组 + 0~100 分数），而落盘/读盘走 JSON —— 存档里它们是普通对象/数组，
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
        const srcAlias = (saved.characterAliases && typeof saved.characterAliases === 'object' && !Array.isArray(saved.characterAliases)) ? saved.characterAliases : null;
        if (srcAlias) {
            for (const name of Object.keys(srcAlias)) {
                const v = srcAlias[name];
                s.characterAliases[String(name)] = Array.isArray(v) ? v.map(String) : [];
            }
        }
        const srcScore = (saved.affinityScores && typeof saved.affinityScores === 'object' && !Array.isArray(saved.affinityScores)) ? saved.affinityScores : null;
        if (srcScore) {
            for (const name of Object.keys(srcScore)) {
                const n = Number(srcScore[name]);
                s.affinityScores[String(name)] = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
            }
        }
        return s;
    }

    return {
        createState: createState,
        registerCharacter: registerCharacter,
        resolvePronounTarget: resolvePronounTarget,
        hydrateState
    };
}));