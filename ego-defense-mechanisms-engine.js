/* ============================================================
 * ego-defense-mechanisms-engine.js — [v3.461.0 · 第十七期全新心智引擎]
 * 心理防御机制与自欺欺人叙事重塑引擎 (Ego Defense & Narrative Self-Deception Engine)
 * ------------------------------------------------------------
 * 【核心设计与痛点解决】
 * 解决记忆“过度诚实录音笔”问题：
 *   - 真实人性具有心理防御（合理化解脱、投射转嫁、主观否认与自尊保护）。
 *   - 当角色面临内疚、羞愧、失误或恐惧时，自主对事实进行主观润色，
 *     生成兼具自尊维护与心虚掩饰的第一人称内心旁白。
 *
 * 【体验纪律】
 * 严禁技术黑话，面向玩家只输出生活化心理暗流：
 *   如 [下意识为自己开脱]、[心里有些发虚]、[绝不承认是自己的过失]
 *
 * 挂载：LonShaEgoDefense / CJS / AMD
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaEgoDefense = factory();
        root.EgoDefenseEngine = root.LonShaEgoDefense;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const VERSION = '3.461.0';

    /**
     * 创建心理防御状态机
     */
    function createState() {
        return {
            version: VERSION,
            defenseLevel: 0.1, // 防御激活度 0.0 ~ 1.0
            activeMechanisms: [], // rationalize(合理化), projection(转嫁), denial(否认), compensation(补偿)
            subjectiveDistortions: [], // 主观润色后的事实条目
            fragileEgoPoints: [], // 脆弱自尊敏感点
            lastFloor: 0,
            updatedAt: Date.now()
        };
    }

    /**
     * 宽容水合状态
     */
    function hydrateState(raw) {
        const s = createState();
        if (!raw || typeof raw !== 'object') return s;
        if (typeof raw.defenseLevel === 'number') s.defenseLevel = Math.max(0, Math.min(1, raw.defenseLevel));
        if (Array.isArray(raw.activeMechanisms)) s.activeMechanisms = raw.activeMechanisms.slice(0, 10);
        if (Array.isArray(raw.subjectiveDistortions)) s.subjectiveDistortions = raw.subjectiveDistortions.slice(0, 20);
        if (Array.isArray(raw.fragileEgoPoints)) s.fragileEgoPoints = raw.fragileEgoPoints.slice(0, 10);
        if (typeof raw.lastFloor === 'number') s.lastFloor = raw.lastFloor;
        return s;
    }

    /**
     * 评估客观事实并生成心理防御主观叙事
     */
    function processEgoThreat(state, threatFact) {
        const next = hydrateState(state);
        if (!threatFact || typeof threatFact !== 'object') return next;

        const statement = String(threatFact.statement || threatFact.text || '');
        const isFaultOrBlame = /(弄坏|搞砸|失手|背叛|逃跑|失误|认错|丢脸|输了|懦弱|亏欠)/.test(statement);
        const isCriticism = /(你太笨|你的错|全怪你|不守信用|真差劲|自私)/.test(statement);

        if (isFaultOrBlame || isCriticism) {
            next.defenseLevel = Math.min(1.0, next.defenseLevel + 0.35);
            
            // 自动推导合理化机制
            let mechanism = 'rationalize';
            let subjectiveInterpretation = '';
            
            if (isCriticism) {
                mechanism = 'projection';
                subjectiveInterpretation = '他根本不明白当时情况多凶险，只会在事后挑刺';
            } else {
                mechanism = 'rationalize';
                subjectiveInterpretation = '当时那种突发状况，换做任何人都不可能做得更好了';
            }

            if (!next.activeMechanisms.includes(mechanism)) {
                next.activeMechanisms.push(mechanism);
            }

            next.subjectiveDistortions.unshift({
                rawFact: statement,
                mechanism: mechanism,
                subjectiveTake: subjectiveInterpretation,
                rationalizedAt: Date.now()
            });
            next.subjectiveDistortions = next.subjectiveDistortions.slice(0, 15);
        } else {
            // 平稳情境下防御自然回落
            next.defenseLevel = Math.max(0.1, next.defenseLevel - 0.05);
            if (next.defenseLevel < 0.3) {
                next.activeMechanisms = [];
            }
        }

        next.updatedAt = Date.now();
        return next;
    }

    /**
     * 生成主生成管线心理暗流指令（零生僻黑话）
     */
    function generateEgoDirectives(state) {
        if (!state || state.defenseLevel < 0.3) return [];
        const directives = [];

        if (state.defenseLevel >= 0.7) {
            directives.push('【内心防御与自尊维护】你心里清楚有些不妥，但自尊心让你极难坦白认错，会下意识找借口或转移话题。');
        } else {
            directives.push('【微妙的心虚掩饰】言语中带有一丝不易察觉的别扭，试图将焦点从自己的失误上引开。');
        }

        if (state.subjectiveDistortions && state.subjectiveDistortions.length > 0) {
            const topDistortion = state.subjectiveDistortions[0];
            directives.push('【真实主观心境】“' + topDistortion.subjectiveTake + '”');
        }

        return directives;
    }

    return {
        VERSION,
        createState,
        hydrateState,
        processEgoThreat,
        generateEgoDirectives
    };
}));
