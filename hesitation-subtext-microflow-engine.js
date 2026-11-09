/* ============================================================
 * hesitation-subtext-microflow-engine.js — 欲言又止与潜台词心机推演引擎
 * [v3.461.0 · 吞吐迟疑微动态、潜台词生成与自尊心防线]
 * ============================================================ */

class HesitationSubtextMicroflowEngine {
    constructor(options = {}) {
        this.options = Object.assign({
            defaultPrideThreshold: 0.65,
            hesitationTriggerChance: 0.40
        }, options);
    }

    synthesizeSubtext(spokenWords, unspokenTruth, characterPride = 0.7, vulnerability = 0.5) {
        const pride = Math.min(1.0, Math.max(0, Number(characterPride) || 0.7));
        const vul = Math.min(1.0, Math.max(0, Number(vulnerability) || 0.5));
        
        const isHighPride = pride > this.options.defaultPrideThreshold;
        const punctuation = isHighPride ? "……" : "——";
        
        // 根据自尊与脆弱度推导微动作
        let somaticAction = "话语戛然而止，喉结微动，把剩下的话硬生生咽回腹中";
        if (isHighPride && vul > 0.6) {
            somaticAction = "眼神倏地偏向一侧避开对视，指尖下意识紧紧掐入掌心，强压下涌到嘴边的自白";
        } else if (!isHighPride && vul > 0.6) {
            somaticAction = "嘴唇翕动了几下，眼底闪过一丝近乎求助的无措，却终究不敢吐露半句";
        }

        const injectionText = `【欲言又止·潜台词】表象话语：「${spokenWords}${punctuation}」 ` +
            `（${somaticAction}）` +
            `【喉间未尽之意：其实心底真正翻涌的是『${unspokenTruth}』，但出于内心防护选择克制隐忍】`;

        return {
            spokenWords,
            unspokenTruth,
            characterPride: pride,
            somaticAction,
            formattedInjection: injectionText
        };
    }
}
if (typeof globalThis !== "undefined") { globalThis.HesitationSubtextMicroflowEngine = HesitationSubtextMicroflowEngine; }
if (typeof window !== "undefined") { window.HesitationSubtextMicroflowEngine = HesitationSubtextMicroflowEngine; }
if (typeof module !== "undefined" && module.exports) { module.exports = HesitationSubtextMicroflowEngine; }

/* ============================================================
 * [v3.461.0 接线修复] 本文件此前是 ESM 形态（export …），而宿主 extra_js、
 * 审计沙箱与 optional-engine-registry 的 require 全部按经典脚本加载 ——
 * `export` 在那里直接是语法错误，模块在真机上从未挂载成功。
 * 改回本仓统一的 UMD/IIFE 注册形态（同 ego-defense-mechanisms-engine.js）：
 * CJS 侧保留 module.exports 供测试与注册表的 require 使用，
 * 经典脚本侧把引擎类挂到全局，让取库口与编排器真的取得到。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
                root.HesitationSubtextMicroflowEngine = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    return HesitationSubtextMicroflowEngine;
}));
