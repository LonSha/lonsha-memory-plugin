/* ============================================================
 * daydream-spontaneous-wandering-engine.js — [v3.461.0 · 第十八期全新认知引擎]
 * 独处走神白日梦与潜意识心象漂移引擎 (Daydream & Spontaneous Wandering Engine)
 * ------------------------------------------------------------
 * 【核心机制与心智游移理论 (Mind-Wandering)】
 * 解决无对话、无输入或转场独处时角色“瞬间休眠变假人”的机械感：
 *   人类大脑在默认模式网络 (DMN) 激活时，会产生自发性心象漂移、内心独白、过往碎片重组与白日梦。
 *   在长句空歇或环境静止时，生成富有氛围感与内心隐秘情绪的思维漫游碎片。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
                root.DaydreamSpontaneousWanderingEngine = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    class DaydreamSpontaneousWanderingEngine {
        constructor(options = {}) {
            this.options = Object.assign({
                wanderingEntropy: 0.6,
                symbolicImageryThemes: [
                    "看着窗外被雨水冲刷模糊的霓虹，突然想到很久以前看过的旧电影",
                    "指尖无意识地在桌角摩挲，思绪飘到了未曾说出口的那句道别",
                    "听着钟表的滴答声，仿佛置身于一片寂静无声的空旷原野"
                ]
            }, options);
            this.recentDaydreams = [];
        }

        /**
         * 触发一次自发性心智漫游
         */
        triggerMindWandering(currentMood = "solitude", relatedAnchor = "") {
            const themeIndex = Math.floor(Math.random() * this.options.symbolicImageryThemes.length);
            const baseImagery = this.options.symbolicImageryThemes[themeIndex];
        
            const daydream = {
                id: "dream_" + Date.now(),
                mood: currentMood,
                anchor: relatedAnchor || "独处静默时刻",
                streamOfConsciousness: baseImagery + (relatedAnchor ? `，隐隐约约联想到了关于【${relatedAnchor}】的残缺画面。` : "。"),
                timestamp: Date.now()
            };

            this.recentDaydreams.unshift(daydream);
            if (this.recentDaydreams.length > 5) this.recentDaydreams.pop();
            return daydream;
        }

        formatDaydreamPrompt() {
            if (this.recentDaydreams.length === 0) return "";
            const latest = this.recentDaydreams[0];
            return `【潜意识心智漫游·独处走神白日梦】\n- [氛围心象] (${latest.anchor}): \"${latest.streamOfConsciousness}\" (此时若有交互，角色神情略带恍惚与出神)`;
        }

        exportState() {
            return { recentDaydreams: [...this.recentDaydreams] };
        }

        hydrateState(state) {
            if (state && Array.isArray(state.recentDaydreams)) {
                this.recentDaydreams = [...state.recentDaydreams];
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
    return DaydreamSpontaneousWanderingEngine;
}));
