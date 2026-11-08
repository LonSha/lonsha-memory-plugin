(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaTacitIntimacy = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const VERSION = 'v17.0.0-L17-X3';

    function createState(initial = {}) {
        return {
            intimacyLevel: typeof initial.intimacyLevel === 'number' ? initial.intimacyLevel : 65,
            codebook: Array.isArray(initial.codebook) ? initial.codebook : [
                {
                    phrase: '下雨了',
                    realMeaning: '有外人监视/提高戒备',
                    context: 'danger_alert',
                    triggerCount: 0
                },
                {
                    phrase: '老地方',
                    realMeaning: '天台旧长椅/两人的私密据点',
                    context: 'secret_rendezvous',
                    triggerCount: 0
                },
                {
                    phrase: '红茶不加糖',
                    realMeaning: '心情不佳/需要安静陪伴',
                    context: 'emotional_signal',
                    triggerCount: 0
                }
            ],
            lastTriggeredCode: initial.lastTriggeredCode || null
        };
    }

    function hydrateState(state) {
        if (!state) return createState();
        return {
            intimacyLevel: typeof state.intimacyLevel === 'number' ? state.intimacyLevel : 65,
            codebook: Array.isArray(state.codebook) ? state.codebook : [],
            lastTriggeredCode: state.lastTriggeredCode || null
        };
    }

    function registerCode(state, phrase, realMeaning, context = 'general') {
        if (!state || !phrase || !realMeaning) return null;
        const cleanPhrase = String(phrase).trim();
        const existing = state.codebook.find(c => c.phrase === cleanPhrase);
        if (existing) {
            existing.realMeaning = String(realMeaning).trim();
            existing.context = context;
            return existing;
        }
        const newCode = {
            phrase: cleanPhrase,
            realMeaning: String(realMeaning).trim(),
            context,
            triggerCount: 0
        };
        state.codebook.push(newCode);
        return newCode;
    }

    function evaluateTacitContext(state, { currentSpeaker, userUtterance = '', inPresenceOthers = false }) {
        if (!state || state.intimacyLevel < 30) {
            return {
                active: false,
                reason: 'intimacy_too_low'
            };
        }

        const text = String(userUtterance || '');
        let matchedCode = null;

        for (const code of state.codebook) {
            if (text.includes(code.phrase) || (code.realMeaning && text.includes(code.realMeaning))) {
                matchedCode = code;
                code.triggerCount = (code.triggerCount || 0) + 1;
                state.lastTriggeredCode = code;
                break;
            }
        }

        const shouldSuggestCovert = inPresenceOthers && state.intimacyLevel >= 60;
        let directive = '';
        if (matchedCode) {
            directive = '【心智默契响应·专属私语暗号】：检测到玩家触及你们之间的默契暗语「' + matchedCode.phrase + '」（里层密意：“' + matchedCode.realMeaning + '”）。你应心领神会，无须向旁人点破含义，仅通过自然回应或眼神动作默契承接。';
        } else if (shouldSuggestCovert) {
            directive = '【心智默契响应·公共场合防窃听】：当前场景有第三者在场，请发挥你们的高羁绊默契，使用含蓄短句、隐秘眼神或暗号传递彼此真实心意，避免直白公开秘密。';
        }

        return {
            active: Boolean(matchedCode || shouldSuggestCovert),
            intimacyLevel: state.intimacyLevel,
            matchedCode,
            shouldSuggestCovert,
            promptDirective: directive
        };
    }

    function generateTacitDirectives(state, context = {}) {
        const evalResult = evaluateTacitContext(state, context);
        if (evalResult && evalResult.active && evalResult.promptDirective) {
            return [evalResult.promptDirective];
        }
        return [];
    }

    return {
        VERSION,
        createState,
        hydrateState,
        registerCode,
        evaluateTacitContext,
        generateTacitDirectives
    };
}));