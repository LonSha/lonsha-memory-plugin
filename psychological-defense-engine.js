/* ============================================================
 * psychological-defense-engine.js — [v3.458.0 · V20-L1]
 * 认知心理防御与潜意识移情扭曲引擎 (Psychological Defense & Distortion Engine)
 * ------------------------------------------------------------
 * 【核心设计】
 *   模拟角色在遭遇心理创伤、背叛或重大反转时的心理防御机制：
 *   1. 防御机制类型（Defense Mechanisms）：
 *      - DENIAL (否认): 拒绝承认现实事实，召回时伴生对真相的合理化怀疑；
 *      - PROJECTION (投射): 将自身过错或不可告人动机归咎于在场他人；
 *      - REPRESSION (压抑): 主动屏蔽高痛苦记忆，检索强度显著衰减甚至形成阻抗记忆斑块；
 *      - REACTION_FORMATION (反向形成): 内心痛苦/仇恨，表面却表现出极度关切与谄媚。
 *   2. 潜意识移情扭曲 (Subconscious Transference):
 *      将过往经历中特定人物（如导师/旧爱/仇敌）的情感模型移情投射到当前交谈对象身上。
 *   3. 提示词动态张力注入 (Psychological Tension Injection):
 *      在简报中生成【心理防御层】与【潜意识扭曲】结构化指令，引导大模型展现微表情抗拒与内心戏。
 * ============================================================ */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaPsychologicalDefense = factory();
        root.PsychologicalDefenseEngine = root.LonShaPsychologicalDefense;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const VERSION = '3.458.0';

    const DEFENSE_TYPES = Object.freeze({
        DENIAL: 'denial',                       // 否认机制
        PROJECTION: 'projection',               // 投射机制
        REPRESSION: 'repression',               // 压抑机制
        REACTION_FORMATION: 'reaction_formation'// 反向形成
    });

    /**
     * 创建纯净心理防御持久化状态
     */
    function createState() {
        return {
            version: VERSION,
            traumaNodes: [],        // 创伤/冲突触发点 [{ id, character, triggerKeywords, mechanism, intensity, targetActor, description, createdAt }]
            transferenceModels: [], // 移情模型 [{ id, character, sourcePrototype, targetActor, emotionalCharge }]
            resistanceLedger: {},   // 记忆阻抗账本 { [memoryId]: resistanceScore }
            totalDefensesTriggered: 0,
            updatedAt: Date.now()
        };
    }

    /**
     * 宽容水合防御状态
     */
    function hydrateState(raw = {}) {
        if (!raw || typeof raw !== 'object') return createState();
        return {
            version: VERSION,
            traumaNodes: Array.isArray(raw.traumaNodes) ? raw.traumaNodes.slice() : [],
            transferenceModels: Array.isArray(raw.transferenceModels) ? raw.transferenceModels.slice() : [],
            resistanceLedger: (raw.resistanceLedger && typeof raw.resistanceLedger === 'object') ? { ...raw.resistanceLedger } : {},
            totalDefensesTriggered: Number(raw.totalDefensesTriggered) || 0,
            updatedAt: Number(raw.updatedAt) || Date.now()
        };
    }

    /**
     * 注册或更新角色的心理创伤与防御节点
     */
    function registerDefenseNode(state, node = {}) {
        if (!state || !state.traumaNodes) return null;
        const entry = {
            id: node.id || `def_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            character: String(node.character || '').trim(),
            triggerKeywords: Array.isArray(node.triggerKeywords) ? node.triggerKeywords.map(k => String(k).trim()).filter(Boolean) : [],
            mechanism: Object.values(DEFENSE_TYPES).includes(node.mechanism) ? node.mechanism : DEFENSE_TYPES.DENIAL,
            intensity: Math.max(0.1, Math.min(1.0, Number(node.intensity) || 0.5)),
            targetActor: String(node.targetActor || '').trim(),
            description: String(node.description || '').trim(),
            createdAt: Number(node.createdAt) || Date.now()
        };
        if (!entry.character) return null;
        state.traumaNodes.push(entry);
        state.updatedAt = Date.now();
        return entry;
    }

    /**
     * 注册潜意识移情模型
     */
    function registerTransference(state, model = {}) {
        if (!state || !state.transferenceModels) return null;
        const entry = {
            id: model.id || `trans_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            character: String(model.character || '').trim(),
            sourcePrototype: String(model.sourcePrototype || '').trim(), // 原型角色（如：已故挚友、背叛者导师）
            targetActor: String(model.targetActor || '').trim(),         // 投射对象（当前交互对象）
            emotionalCharge: String(model.emotionalCharge || 'ambivalent').trim() // 移情情感倾向
        };
        if (!entry.character || !entry.sourcePrototype) return null;
        state.transferenceModels.push(entry);
        state.updatedAt = Date.now();
        return entry;
    }

    /**
     * 评估候选记忆池并应用防御性扭曲与阻抗修剪
     * @param {Array} candidates 召回的记忆候选池
     * @param {Object} context 现场上下文 { currentSpeaker, inSceneCharacters, queryText }
     * @param {Object} state 持久化状态
     * @returns {Object} { filteredCandidates, directives, distortedCount }
     */
    function evaluatePsychologicalDistortion(candidates = [], context = {}, state = {}) {
        if (!Array.isArray(candidates) || !candidates.length) {
            return { candidates: [], directives: '', distortedCount: 0 };
        }
        const activeChar = context.currentSpeaker || '';
        const inScene = Array.isArray(context.inSceneCharacters) ? context.inSceneCharacters : [];
        const query = String(context.queryText || '');

        const activeDefenses = (state.traumaNodes || []).filter(n => n.character === activeChar);
        const activeTrans = (state.transferenceModels || []).filter(t => t.character === activeChar && (inScene.includes(t.targetActor) || !t.targetActor));

        if (!activeDefenses.length && !activeTrans.length) {
            return { candidates: candidates.slice(), directives: '', distortedCount: 0 };
        }

        const filtered = [];
        let distortedCount = 0;
        const generatedDirectives = [];

        // 移情模型指令生成
        for (const t of activeTrans) {
            generatedDirectives.push(`【潜意识移情】${t.character} 不由自主地将 ${t.sourcePrototype} 的影子重叠在 ${t.targetActor || '对方'} 身上，情感倾向呈现「${t.emotionalCharge}」，引发言行微观失控。`);
        }

        for (const item of candidates) {
            const text = String(item.text || item.content || '');
            let matchedDefense = null;

            for (const def of activeDefenses) {
                const hit = def.triggerKeywords.some(kw => text.includes(kw));
                if (hit) {
                    matchedDefense = def;
                    break;
                }
            }

            if (!matchedDefense) {
                filtered.push(item);
                continue;
            }

            distortedCount++;
            state.totalDefensesTriggered = (state.totalDefensesTriggered || 0) + 1;

            if (matchedDefense.mechanism === DEFENSE_TYPES.REPRESSION) {
                // 压抑机制：高阻抗，直接从显式召回中剥离，仅留下一丝无端焦虑感
                generatedDirectives.push(`【心理防御·压抑】${activeChar} 对关键事件产生本能排斥，言语间顾左右而言他，下意识回避核心真相。`);
                continue; // 阻抗抑制该条记忆进入常规 prompt
            }

            let distortedText = text;
            if (matchedDefense.mechanism === DEFENSE_TYPES.DENIAL) {
                distortedText = `【潜意识否认·合理化怀疑】${text}（内心独白：这绝不可能发生，必定是误会或伪证）`;
                generatedDirectives.push(`【心理防御·否认】${activeChar} 固执拒绝接受涉及「${matchedDefense.description}」的事实，伴随防御性驳斥。`);
            } else if (matchedDefense.mechanism === DEFENSE_TYPES.PROJECTION) {
                const target = matchedDefense.targetActor || inScene.find(c => c !== activeChar) || '对方';
                distortedText = `【潜意识投射·内疚外化】${text}（心声投射：分明是 ${target} 居心叵测才导致这一切）`;
                generatedDirectives.push(`【心理防御·投射】${activeChar} 极力将内心负罪感与缺陷外化，指责 ${target} 负有不可推卸的责任。`);
            } else if (matchedDefense.mechanism === DEFENSE_TYPES.REACTION_FORMATION) {
                distortedText = `【潜意识反向形成·过度代偿】${text}（表面伪装：极度殷切顺从，掩盖深层创痛与敌意）`;
                generatedDirectives.push(`【心理防御·反向形成】${activeChar} 表现出与其内心创伤相反的过度关切，形成戏剧性心理反差。`);
            }

            filtered.push(Object.assign({}, item, {
                text: distortedText,
                content: distortedText,
                _psychologicalDistorted: true,
                _defenseMechanism: matchedDefense.mechanism
            }));
        }

        const directivesText = Array.from(new Set(generatedDirectives)).join('\n');
        return {
            candidates: filtered,
            directives: directivesText,
            distortedCount
        };
    }

    return {
        VERSION,
        DEFENSE_TYPES,
        createState,
        hydrateState,
        registerDefenseNode,
        registerTransference,
        evaluatePsychologicalDistortion
    };
}));