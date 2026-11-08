/* ============================================================
 * narrative-momentum-flow-inertia-engine.js — [v3.460.0 · 第十六期心智引擎]
 * 对话动量与心流势头维持引擎 (Narrative Momentum & Flow Inertia Engine)
 * ------------------------------------------------------------
 * 【核心设计与痛点解决】
 * 角色在长对话中极易出现“突然冷场”或机械切换话题的割裂感：
 *   - 当双方情绪聊到高潮（兴奋、对峙、暧昧、悲伤）时，若新一轮输入简短，
 *     传统检索往往立刻降温，角色回复瞬间索然无味。
 *   - 本引擎维护对话心流的“动量值(Momentum)”与“情绪惯性(Emotional Inertia)”，
 *     具备自然衰减、高潮守卫与情绪黏滞力。
 *
 * 【体验纪律】
 * 严禁任何晦涩技术黑话，面向玩家只输出生活化提示词：
 *   如 [聊天氛围正浓]、[仍沉浸在刚才的对话中]、[余韵未消]
 *
 * 挂载：LonShaNarrativeMomentum / CJS / AMD
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaNarrativeMomentum = factory();
        root.NarrativeMomentumEngine = root.LonShaNarrativeMomentum;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const VERSION = '3.460.0';

    /**
     * 创建干净的动量状态机
     */
    function createState() {
        return {
            version: VERSION,
            intensity: 0.2, // 当前动量强度 0.0 ~ 1.0
            dominantTone: '平稳', // 平稳, 欢欣, 凝重, 激昂, 紧绷, 亲昵
            unresolvedPique: '', // 尚未消解的话题锋芒或余波
            turnCounter: 0,
            lastFloor: 0,
            updatedAt: Date.now()
        };
    }

    /**
     * 宽容水合状态
     */
    function hydrateState(raw) {
        if (!raw || typeof raw !== 'object') return createState();
        return {
            version: VERSION,
            intensity: typeof raw.intensity === 'number' ? Math.max(0, Math.min(1, raw.intensity)) : 0.2,
            dominantTone: typeof raw.dominantTone === 'string' ? raw.dominantTone : '平稳',
            unresolvedPique: typeof raw.unresolvedPique === 'string' ? raw.unresolvedPique : '',
            turnCounter: Number(raw.turnCounter) || 0,
            lastFloor: Number(raw.lastFloor) || 0,
            updatedAt: Number(raw.updatedAt) || Date.now()
        };
    }

    /**
     * 根据输入文本与前轮情绪更新对话动量
     */
    function updateMomentum(state, inputContext = {}) {
        const s = hydrateState(state);
        const text = String(inputContext.text || '');
        const speaker = inputContext.speaker || '对方';
        s.turnCounter += 1;
        s.lastFloor = Number(inputContext.floor || s.turnCounter);

        // 识别情绪爆发词与激动标记
        const isExcited = /[！!？?]{2,}|太棒了|好喜欢|别走|凭什么|我不信|你敢|真的很想|一定要/.test(text);
        const isTense = /危险|快跑|不能说|秘密|暴露|警察|敌人|叛徒/.test(text);
        const isIntimate = /抱|靠着|牵手|温柔|吻|喜欢你|只属于你|小笨蛋/.test(text);
        const isCold = /哦|嗯|好吧|算了|无所谓|走了|随便/.test(text) && text.length <= 6;

        if (isExcited) {
            s.intensity = Math.min(1.0, s.intensity + 0.35);
            s.dominantTone = '激昂';
            s.unresolvedPique = text.slice(0, 30);
        } else if (isTense) {
            s.intensity = Math.min(1.0, s.intensity + 0.4);
            s.dominantTone = '紧绷';
            s.unresolvedPique = '情势紧迫的悬念';
        } else if (isIntimate) {
            s.intensity = Math.min(1.0, s.intensity + 0.3);
            s.dominantTone = '亲昵';
            s.unresolvedPique = '未褪去的温情余温';
        } else if (isCold) {
            // 自然衰减而非瞬间归零（心流黏滞性）
            s.intensity = Math.max(0.1, s.intensity * 0.7);
            if (s.intensity < 0.25) s.dominantTone = '平稳';
        } else {
            // 普通对话缓慢衰减或维持
            s.intensity = Math.max(0.15, s.intensity * 0.9);
        }

        s.updatedAt = Date.now();
        return s;
    }

    /**
     * 生成通俗易懂的小说化扮演指令
     */
    function generateMomentumDirectives(state) {
        const s = hydrateState(state);
        if (s.intensity < 0.35) {
            return ''; // 低动量下不干扰日常平稳交流
        }

        const directives = [];
        if (s.intensity >= 0.7) {
            if (s.dominantTone === '激昂') {
                directives.push(`[聊天氛围正浓] 情绪正处在峰值，言语间带着止不住的兴致与热烈，不要突然冷场或客套。`);
            } else if (s.dominantTone === '紧绷') {
                directives.push(`[神经高度紧绷] 刚才的话题带来强烈的压迫感，目光和心跳仍未平复，保持警觉与专注。`);
            } else if (s.dominantTone === '亲昵') {
                directives.push(`[空气中弥漫着依恋] 彼此靠近的呼吸和心跳清晰可感，回应带着下意识的温柔与眷恋。`);
            }
        } else {
            directives.push(`[余韵未消] 仍沉浸在刚才的话题心境中（基调：${s.dominantTone}），接续自然，情绪过渡温润。`);
        }

        if (s.unresolvedPique) {
            directives.push(`[心中悬着的事] 对方刚才提到的“${s.unresolvedPique}”仍在心头回响，如有必要可自然追问或表态。`);
        }

        return directives.join('\n');
    }

    return {
        VERSION,
        createState,
        hydrateState,
        updateMomentum,
        generateMomentumDirectives
    };
}));
