/* ============================================================
 * latent-social-bond-reciprocity-engine.js — [v3.460.0 · 第十六期心智引擎]
 * 隐性人情羁绊与互惠张力引擎 (Latent Social Bond & Reciprocity Engine)
 * ------------------------------------------------------------
 * 【核心设计与痛点解决】
 * 许多AI角色在长期互动中表现得“只知索取或完全无私”，缺乏真实人际交往的互惠张力：
 *   - 当玩家倾听其心事、赠予帮助或给予关怀时，角色应在心底积蓄“感激与情意”；
 *   - 当角色曾经失信、推脱或冷落过玩家时，角色应产生微小的“歉疚与补偿欲”；
 *   - 本引擎计算隐性的人情收支天平(Reciprocity Ledger)，产生真实的心情牵引。
 *
 * 【体验纪律】
 * 严禁技术黑话，面向玩家只输出生活化提示词：
 *   如 [心怀感激与挂念]、[隐隐有些歉疚想要弥补]、[觉得彼此是可以交心的人]
 *
 * 挂载：LonShaSocialBondReciprocity / CJS / AMD
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaSocialBondReciprocity = factory();
        root.LatentSocialBondReciprocityEngine = root.LonShaSocialBondReciprocity;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const VERSION = '3.460.0';

    function createState() {
        return {
            version: VERSION,
            bonds: {}, // 格式: { [characterName]: { kindnessBalance: 0, favorCount: 0, debtCount: 0, warmth: 0.5, lastReason: '' } }
            updatedAt: Date.now()
        };
    }

    function hydrateState(raw) {
        if (!raw || typeof raw !== 'object') return createState();
        return {
            version: VERSION,
            bonds: (raw.bonds && typeof raw.bonds === 'object') ? { ...raw.bonds } : {},
            updatedAt: Number(raw.updatedAt) || Date.now()
        };
    }

    /**
     * 记录一次人情互动
     */
    function recordSocialEvent(state, targetChar, eventType, detail = '') {
        const s = hydrateState(state);
        const name = String(targetChar || '你');
        if (!s.bonds[name]) {
            s.bonds[name] = {
                kindnessBalance: 0, // 正数表示觉得亏欠对方/感激对方，负数表示对方亏欠自己
                favorCount: 0,
                debtCount: 0,
                warmth: 0.5,
                lastReason: ''
            };
        }
        const bond = s.bonds[name];

        if (eventType === 'care' || eventType === 'gift' || eventType === 'listen') {
            // 对方给予关怀、礼物或倾听
            bond.kindnessBalance += 1;
            bond.favorCount += 1;
            bond.warmth = Math.min(1.0, bond.warmth + 0.1);
            bond.lastReason = detail || '收到对方的真诚关心';
        } else if (eventType === 'apology_needed' || eventType === 'neglect') {
            // 自己冷落或亏欠对方
            bond.kindnessBalance += 1.5;
            bond.debtCount += 1;
            bond.lastReason = detail || '觉得自己刚才有些疏忽对方';
        } else if (eventType === 'repay') {
            // 自己回报了对方
            bond.kindnessBalance = Math.max(0, bond.kindnessBalance - 1);
        }

        s.updatedAt = Date.now();
        return s;
    }

    /**
     * 生成通俗易懂的小说化扮演指令
     */
    function generateReciprocityDirectives(state, targetChar) {
        const s = hydrateState(state);
        const name = String(targetChar || '你');
        const bond = s.bonds[name];
        if (!bond) return '';

        const directives = [];
        if (bond.kindnessBalance >= 2) {
            directives.push(`[心怀感激与挂念] 始终记得对方先前给予的体贴与包容（事由：${bond.lastReason || '对方的善意'}），心肠比平时更软，主动流露出关心。`);
        } else if (bond.kindnessBalance >= 1) {
            directives.push(`[心中惦记对方] 隐约觉得受到对方关照，言辞间透出亲近与愿意分担的态度。`);
        }

        if (bond.debtCount > 0 && bond.kindnessBalance >= 1.5) {
            directives.push(`[隐隐有些歉疚想要弥补] 之前似乎让对方受了委屈或冷落，这次下意识想要主动找补，态度更加温和周到。`);
        }

        return directives.join('\n');
    }

    return {
        VERSION,
        createState,
        hydrateState,
        recordSocialEvent,
        generateReciprocityDirectives
    };
}));