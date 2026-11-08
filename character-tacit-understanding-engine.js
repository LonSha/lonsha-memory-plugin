/* ============================================================
 * character-tacit-understanding-engine.js — [v3.460.0 · 第十六期心智引擎]
 * 角色默契心领神会与未言明暗号引擎 (Character Tacit Understanding & Inside-Code Engine)
 * ------------------------------------------------------------
 * 【核心设计与痛点解决】
 * 经历过共同生死的角色或相知甚深的朋友，交谈时不需要说尽每一个字：
 *   - 一个眼神、一个特定手势、半句话、或者彼此约定的特定指代，就能秒懂对方意思。
 *   - 本引擎维护“专属默契条目(Tacit Codes)”与“心领神会指数(Comprehension Level)”，
 *     在对话中激发“无需点破即可会意”的情感深度。
 *
 * 【体验纪律】
 * 严禁任何技术黑话，面向玩家只输出生活化提示词：
 *   如 [彼此间的默契无需多言]、[心领神会]、[只有你们才懂的暗语]
 *
 * 挂载：LonShaTacitUnderstanding / CJS / AMD
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaTacitUnderstanding = factory();
        root.TacitUnderstandingEngine = root.LonShaTacitUnderstanding;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const VERSION = '3.460.0';

    function createState() {
        return {
            version: VERSION,
            tacitBonds: {}, // { [charName]: { score: 0, sharedJokes: [], secretSignals: [] } }
            updatedAt: Date.now()
        };
    }

    function hydrateState(raw) {
        if (!raw || typeof raw !== 'object') return createState();
        return {
            version: VERSION,
            tacitBonds: (raw.tacitBonds && typeof raw.tacitBonds === 'object') ? { ...raw.tacitBonds } : {},
            updatedAt: Number(raw.updatedAt) || Date.now()
        };
    }

    /**
     * 注册或强化默契
     */
    function reinforceTacitBond(state, charName, { signal = '', meaning = '' } = {}) {
        const s = hydrateState(state);
        const name = String(charName || '你');
        if (!s.tacitBonds[name]) {
            s.tacitBonds[name] = { score: 1, secretSignals: [] };
        }
        const b = s.tacitBonds[name];
        b.score += 1;
        if (signal && meaning) {
            b.secretSignals.push({ signal, meaning, createdAt: Date.now() });
            if (b.secretSignals.length > 10) b.secretSignals.shift();
        }
        s.updatedAt = Date.now();
        return s;
    }

    /**
     * 检测文本中是否有默契触发
     */
    function matchTacitSignals(state, charName, text = '') {
        const s = hydrateState(state);
        const name = String(charName || '你');
        const b = s.tacitBonds[name];
        if (!b || !b.secretSignals || b.secretSignals.length === 0) return [];
        return b.secretSignals.filter(sig => text.includes(sig.signal));
    }

    /**
     * 生成小说化扮演指令
     */
    function generateTacitDirectives(state, charName, text = '') {
        const s = hydrateState(state);
        const name = String(charName || '你');
        const b = s.tacitBonds[name];
        if (!b) return '';

        const matched = matchTacitSignals(state, charName, text);
        const directives = [];

        if (matched.length > 0) {
            matched.forEach(m => {
                directives.push(`[只有你们才懂的暗号] 对方提到了“${m.signal}”，你心底瞬间领会其深意（${m.meaning}），无需在明面上说破，眼神或一句简短回应即可心照不宣。`);
            });
        } else if (b.score >= 5) {
            directives.push(`[彼此间的默契] 双方交流无需过多客套解释，一个眼神或半句话就能心领神会，神情自然且带着相熟的松弛感。`);
        }

        return directives.join('\n');
    }

    return {
        VERSION,
        createState,
        hydrateState,
        reinforceTacitBond,
        matchTacitSignals,
        generateTacitDirectives
    };
}));