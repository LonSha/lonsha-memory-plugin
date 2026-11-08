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

    return {
        createState: createState,
        registerCharacter: registerCharacter,
        resolvePronounTarget: resolvePronounTarget
    };
}));