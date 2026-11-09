/* ============================================================
 * proustian-synesthesia-recall-engine.js — [v3.461.0 · 第十八期全新认知引擎]
 * 普鲁斯特感官通感诱发反射引擎 (Proustian Synesthesia Recall Engine)
 * ------------------------------------------------------------
 * 【核心机制与通感心理学】
 * 突破传统纯语义文本匹配壁垒：
 *   人类最深沉的情感回忆常由非语言感官触发（雨后泥土腥味、红茶浸玛德琳蛋糕香、旧风衣冷香、留声机底噪）。
 *   当输入识别到感官刺激词时，直接穿透理性防御，唤醒带有强烈躯体化情感的底层记忆。
 * ============================================================ */

class ProustianSynesthesiaRecallEngine {
    constructor(options = {}) {
        this.options = Object.assign({
            sensoryBoostFactor: 2.8,
            minSensoryConfidence: 0.7
        }, options);
        // 感官关键词映射与通感锚点库
        this.sensoryAnchors = new Map();
    }

    registerSensoryMemoryAnchor(id, anchor) {
        this.sensoryAnchors.set(id, {
            id,
            sensoryType: anchor.sensoryType || "olfactory", // olfactory, gustatory, tactile, auditory, visual
            stimulusKeys: Array.isArray(anchor.stimulusKeys) ? anchor.stimulusKeys.map(k => k.toLowerCase()) : [],
            dormantMemoryExcerpt: anchor.dormantMemoryExcerpt || "",
            evokedSomaticSensation: anchor.evokedSomaticSensation || "",
            evokedEmotion: anchor.evokedEmotion || "melancholy"
        });
    }

    /**
     * 针对当前文本进行普鲁斯特感官穿透扫描
     * @param {string} text 
     */
    probeSensoryTriggers(text = "") {
        if (!text || typeof text !== "string") return [];
        const lower = text.toLowerCase();
        const triggered = [];

        for (const [id, anchor] of this.sensoryAnchors.entries()) {
            for (const key of anchor.stimulusKeys) {
                if (lower.includes(key)) {
                    triggered.push({
                        anchorId: id,
                        sensoryType: anchor.sensoryType,
                        matchedStimulus: key,
                        evokedMemory: anchor.dormantMemoryExcerpt,
                        sensation: anchor.evokedSomaticSensation,
                        emotion: anchor.evokedEmotion,
                        sensoryBoost: this.options.sensoryBoostFactor
                    });
                    break;
                }
            }
        }
        return triggered;
    }

    formatProustianPrompt(triggered = []) {
        if (!triggered || triggered.length === 0) return "";
        const lines = ["【普鲁斯特感官通感突触唤醒】(非语义直觉穿透)"];
        for (const t of triggered) {
            lines.push(`- 触媒 [${t.matchedStimulus}]: 突发躯体感觉「${t.sensation}」，潜意识涌现回忆「${t.evokedMemory}」`);
        }
        return lines.join("\n");
    }

    exportState() {
        return { sensoryAnchors: Array.from(this.sensoryAnchors.entries()) };
    }

    hydrateState(state) {
        if (state && Array.isArray(state.sensoryAnchors)) {
            this.sensoryAnchors = new Map(state.sensoryAnchors);
        }
    }
}

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
                root.ProustianSynesthesiaRecallEngine = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    return ProustianSynesthesiaRecallEngine;
}));
