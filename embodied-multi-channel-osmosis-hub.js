/* ============================================================
 * embodied-multi-channel-osmosis-hub.js — [L11-O6 · 第十一期认知架构优化]
 * RubyPhone 具身生活双向浸润中枢 (Embodied Multi-Channel Osmosis Hub)
 * ------------------------------------------------------------
 * 【核心设计】
 *   攻克「线下现实对白」与「手机虚拟数字痕迹（短信、便签、未发草稿）」之间的割裂壁垒：
 *   1. 数字痕迹向现实心智渗透（Digital-to-Reality Osmosis）：
 *      线下互动时，角色的迟疑、欲言又止，受其在手机中保存的私密备忘、搜索记录深刻驱动；
 *   2. 现实情绪向数字世界外溢（Reality-to-Digital Bleed）：
 *      线下面对面发生激烈争吵/甜蜜承诺后，自动在手机中生成未发送的私信草稿、备忘录日记；
 *   3. 状态同源同步：维持现实心理阻尼与手机交互模式的一致性（如现实冷战时手机开启勿扰）。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaChannelOsmosis = factory();
        root.EmbodiedMultiChannelOsmosisHub = root.LonShaChannelOsmosis;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const CHANNEL_TYPES = Object.freeze({
        FACE_TO_FACE: 'face_to_face',   // 线下现实面对面
        SMS_CHAT: 'sms_chat',           // 手机短信/私信
        PRIVATE_NOTE: 'private_note',   // 备忘录/私密日记
        CALL_LOG: 'call_log'            // 通话记录
    });

    /**
     * 根据线下面对面经历，生成向手机端外溢的数字痕迹
     * @param {Object} offlineInteraction - 线下交互事件 { actor, stance, tension, topic, outcome }
     * @returns {Object} 数字痕迹输出 { generatedNote, unsentDraft, phoneModeShift }
     */
    function projectRealityToDigital(offlineInteraction = {}) {
        const actor = offlineInteraction.actor || '对方';
        const stance = Number(offlineInteraction.stance || 0);
        const tension = offlineInteraction.tension || 'neutral';
        const topic = offlineInteraction.topic || '今晚的谈话';

        let unsentDraft = null;
        let generatedNote = null;
        let phoneModeShift = 'normal';

        if (stance < -0.4 || tension === 'confrontational') {
            // 争吵或冷战外溢
            phoneModeShift = 'do_not_disturb';
            unsentDraft = {
                recipient: actor,
                content: `其实我刚才不该说那么重的话……但我真的受够了。`,
                status: 'draft_unsent',
                createdAt: Date.now()
            };
            generatedNote = {
                title: `关于 ${topic} 的碎碎念`,
                body: `又是不欢而散。胸口很闷。也许我们一开始就不该把话说得太满。`,
                sentiment: 'frustrated',
                createdAt: Date.now()
            };
        } else if (stance > 0.4 || tension === 'warm_intimate') {
            // 甜蜜或深刻羁绊外溢
            unsentDraft = {
                recipient: actor,
                content: `到家了吗？今天……谢谢你愿意听我说那些。`,
                status: 'draft_unsent',
                createdAt: Date.now()
            };
            generatedNote = {
                title: `关于 ${topic} 的记录`,
                body: `今天感觉两人的距离靠近了很多。希望这不是错觉。`,
                sentiment: 'hopeful',
                createdAt: Date.now()
            };
        }

        return {
            generatedNote,
            unsentDraft,
            phoneModeShift,
            sourceEvent: offlineInteraction
        };
    }

    /**
     * 将手机端的未公开数字痕迹渗透进线下面对面的提示词约束
     * @param {Array} phoneArtifacts - 手机端产物（便签、未发草稿）
     * @param {string} currentActor - 当前正在对话的角色
     * @returns {string} 渗透提示词指导
     */
    function synthesizeDigitalToRealityGuidance(phoneArtifacts = [], currentActor = '') {
        if (!Array.isArray(phoneArtifacts) || phoneArtifacts.length === 0) {
            return '';
        }

        const relevant = phoneArtifacts.filter(a => {
            if (!a) return false;
            const text = JSON.stringify(a);
            return currentActor ? text.includes(currentActor) : true;
        });

        if (relevant.length === 0) return '';

        const excerpts = relevant.slice(0, 2).map(r => {
            const body = r.body || r.content || '';
            return body.length > 30 ? body.slice(0, 30) + '…' : body;
        });

        return `【具身手机数字痕迹渗透】：角色私下在手机备忘/未发草稿中写道：“${excerpts.join(' / ')}”。这些未曾当面言说的心迹，会在当下对话的神态细节与欲言又止中产生隐性投影。`;
    }

    return {
        CHANNEL_TYPES,
        projectRealityToDigital,
        synthesizeDigitalToRealityGuidance
    };
}));