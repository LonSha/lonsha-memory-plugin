/* ============================================================
 * physical-token-spatial-trace-tracker.js — [L11-X3 · 第十一期前沿拓展机制]
 * 具身信物与物理空间轨迹流转链 (Physical Token & Spatial Trace Tracker)
 * ------------------------------------------------------------
 * 【核心设计】
 *   打破传统记忆系统仅记录虚无缥缈抽象对话的局限，让记忆拥有【物理重量与空间载体】：
 *   1. 具身信物实体管理（Physical Token State Machine）：
 *      磨损痕迹、物理位置（在口袋/锁在铁盒/被遗落）、归属权转移历史；
 *   2. 睹物思人与触觉激活（Tactile Remembrance）：
 *      当该信物被角色拿在手中把玩、触碰或意外破损时，瞬间激活深层情感记忆回路；
 *   3. 信物损坏/遗失的情感震颤：一旦信物毁灭，触发对应的心理创伤与空缺回响。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaTokenTracker = factory();
        root.PhysicalTokenSpatialTraceTracker = root.LonShaTokenTracker;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const TOKEN_STATUS = Object.freeze({
        INTACT: 'intact',       // 完好无损
        WORN: 'worn',           // 岁月磨损 / 带有划痕
        DAMAGED: 'damaged',     // 破损开裂
        DESTROYED: 'destroyed'  // 彻底焚毁 / 碎裂
    });

    /**
     * 创建一个具身信物对象
     * @param {Object} spec - 信物参数 { name, initialOwner, boundMemory, location }
     * @returns {Object} 信物对象
     */
    function createToken(spec = {}) {
        const name = String(spec.name || '未命名信物').trim();
        const initialOwner = spec.initialOwner || '主角';
        const boundMemory = spec.boundMemory || '未绑定特定往事';

        return {
            id: `token_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name,
            currentOwner: initialOwner,
            transferHistory: [{ from: null, to: initialOwner, at: Date.now() }],
            location: spec.location || '贴身口袋',
            status: TOKEN_STATUS.INTACT,
            wearLevel: 0, // 磨损度 0..100
            boundMemory
        };
    }

    /**
     * 转移信物归属
     */
    function transferToken(token = {}, newOwner = '', transferReason = '') {
        const history = Array.isArray(token.transferHistory) ? token.transferHistory.slice() : [];
        history.push({
            from: token.currentOwner,
            to: newOwner,
            reason: transferReason,
            at: Date.now()
        });

        return {
            ...token,
            currentOwner: newOwner,
            transferHistory: history
        };
    }

    /**
     * 当角色与信物发生物理交互时，生成情感共振提示词
     * @param {Object} token - 信物对象
     * @param {string} interactionKind - 交互方式（touch, gaze, drop, break）
     * @returns {Object} 交互回执与提示词指导
     */
    function interactWithToken(token = {}, interactionKind = 'touch') {
        const name = token.name;
        const memory = token.boundMemory;
        let prompt = '';

        if (interactionKind === 'touch' || interactionKind === 'gaze') {
            prompt = `【具身信物触觉回响】：指尖触及到 [${name}] 的冰凉与表面磨损。这枚信物所承载的往事（${memory}）如同潮水般在心头回涌，让角色的神情不自觉地柔和下来或隐隐作痛。`;
        } else if (interactionKind === 'break' || interactionKind === 'damage') {
            prompt = `【具身信物受损剧痛】：伴随着清脆的断裂声，承载着（${memory}）的 [${name}] 出现了无法弥合的裂痕。角色心底仿佛有什么东西一同碎裂了，产生强烈的窒息感与惊惶。`;
        }

        return {
            tokenName: name,
            interactionKind,
            promptDirective: prompt
        };
    }

    return {
        TOKEN_STATUS,
        createToken,
        transferToken,
        interactWithToken
    };
}));