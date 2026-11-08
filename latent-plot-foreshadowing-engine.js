/* ============================================================
 * latent-plot-foreshadowing-engine.js — [v3.461.0 · 第十七期全新心智引擎]
 * 宿命伏笔与草蛇灰线主动提问发动机 (Latent Foreshadowing & Proactive Inquiry Engine)
 * ------------------------------------------------------------
 * 【核心设计与痛点解决】
 * 告别“玩家问一句、AI查一句”的被动检索习惯：
 *   - 角色追踪尚未兑现的重大承诺、未解之谜与情感悬念。
 *   - 在氛围合适（如长局安静、夜深人静、或情绪余波平息时），
 *     主动驱动角色打破沉默，主动提起旧约或探寻悬案真相。
 *
 * 【体验纪律】
 * 严禁技术黑话，面向玩家只输出生活化主动提议：
 *   如 [心头一直惦记着]、[忍不住主动提起]、[想要确认之前的诺言]
 *
 * 挂载：LonShaLatentForeshadowing / CJS / AMD
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaLatentForeshadowing = factory();
        root.LatentForeshadowingEngine = root.LonShaLatentForeshadowing;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const VERSION = '3.461.0';

    /**
     * 创建伏笔与主动提问状态机
     */
    function createState() {
        return {
            version: VERSION,
            openSuspenses: [], // 未结悬念与伏笔列表
            inquiryCooldown: 0, // 主动提问冷却轮数
            lastInquiredTopic: '',
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
        if (Array.isArray(raw.openSuspenses)) s.openSuspenses = raw.openSuspenses.slice(0, 30);
        if (typeof raw.inquiryCooldown === 'number') s.inquiryCooldown = Math.max(0, raw.inquiryCooldown);
        if (typeof raw.lastInquiredTopic === 'string') s.lastInquiredTopic = raw.lastInquiredTopic;
        if (typeof raw.lastFloor === 'number') s.lastFloor = raw.lastFloor;
        return s;
    }

    /**
     * 注册重大悬念与伏笔
     */
    function registerSuspense(state, topic, promiseDetail, urgency = 0.5) {
        const next = hydrateState(state);
        if (!topic) return next;

        const existingIdx = next.openSuspenses.findIndex(item => item.topic === topic);
        const item = {
            id: 'sus_' + Date.now().toString(36),
            topic: String(topic),
            detail: String(promiseDetail || topic),
            urgency: Math.max(0.1, Math.min(1.0, Number(urgency) || 0.5)),
            createdAt: Date.now(),
            inquireCount: 0
        };

        if (existingIdx >= 0) {
            next.openSuspenses[existingIdx] = item;
        } else {
            next.openSuspenses.unshift(item);
        }
        next.openSuspenses = next.openSuspenses.slice(0, 25);
        next.updatedAt = Date.now();
        return next;
    }

    /**
     * 轮次步进与主动提问触发裁决
     */
    function evaluateProactiveInquiry(state, currentFloor = 0) {
        const next = hydrateState(state);
        if (next.inquiryCooldown > 0) {
            next.inquiryCooldown--;
            return { nextState: next, shouldInquire: false, candidate: null };
        }

        // 挑选最高紧急度且尚未被频繁询问的悬念
        const candidate = next.openSuspenses.find(s => s.urgency >= 0.6 && s.inquireCount < 3);
        if (candidate) {
            candidate.inquireCount++;
            next.inquiryCooldown = 5; // 触发后进入 5 轮冷却，防止碎碎念
            next.lastInquiredTopic = candidate.topic;
            next.lastFloor = currentFloor;
            next.updatedAt = Date.now();
            return { nextState: next, shouldInquire: true, candidate: candidate };
        }

        return { nextState: next, shouldInquire: false, candidate: null };
    }

    /**
     * 生成主动提问管线指令
     */
    function generateInquiryDirectives(candidate) {
        if (!candidate) return [];
        return [
            '【角色心中牵挂与主动探问】你心里一直惦记着“' + candidate.topic + '”（' + candidate.detail + '）。此时时机适宜，你可以不经意间主动提起这件事，或者用关切的语气探问进展。'
        ];
    }

    return {
        VERSION,
        createState,
        hydrateState,
        registerSuspense,
        evaluateProactiveInquiry,
        generateInquiryDirectives
    };
}));