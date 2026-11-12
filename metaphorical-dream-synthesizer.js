/* ============================================================
 * metaphorical-dream-synthesizer.js — 潜意识梦境反刍与超现实隐喻合成器
 * [v3.461.0 · 昼夜潜意识反刍、超现实主义梦境隐喻与清晨灵觉余味]
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
                root.MetaphoricalDreamSynthesizer = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    class MetaphoricalDreamSynthesizer {
        constructor() {
            this.archetypeMetaphors = [
                { symbol: "深海熄灭的青铜孤灯", coreAche: "孤独与被全世界遗忘的窒息" },
                { symbol: "逆行飞旋崩解的旧座钟", coreAche: "无力逆转既定失去的时空宿命" },
                { symbol: "被荆棘刺网层层封缄的乐谱", coreAche: "无法诉之于口、一旦坦白便会焚毁的禁忌心音" },
                { symbol: "无止境塌陷下坠的白石旋梯", coreAche: "对掌控感彻底剥夺的本能恐慌" },
                { symbol: "在滂沱血雨中静默燃烧的旧宅", coreAche: "被亲手毁弃的昔日承诺与无法回头的决绝" }
            ];
            this.dreamArchive = [];
        }

        synthesizeDream(daytimeUnresolved = [], dominantFear = "失去", emotionalTension = 0.7) {
            const fear = String(dominantFear || "失去").trim();
            const unresolvedThemes = Array.isArray(daytimeUnresolved) && daytimeUnresolved.length > 0 
                ? daytimeUnresolved.join("；") 
                : "白日盘旋在喉间的心结与未决之意";

            const archetype = this.archetypeMetaphors[Math.floor(Math.random() * this.archetypeMetaphors.length)];
            const dreamId = `dream_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

            const dreamRecord = {
                id: dreamId,
                symbol: archetype.symbol,
                coreAche: archetype.coreAche,
                dominantFear: fear,
                unresolvedInput: unresolvedThemes,
                timestamp: Date.now()
            };
            this.dreamArchive.push(dreamRecord);

            const morningPrompt = `【清晨残梦·潜意识直觉余波】昨夜辗转惊悸，潜意识中浮现「${archetype.symbol}」的荒诞超现实意象（暗合内心对『${fear}』的深层恐惧）。` +
                `醒来后胸口依然压抑着关于「${unresolvedThemes}」的不祥直觉，在今日言行举止间蒙上一层微妙的梦境宿命余味。`;

            return {
                dreamId,
                symbol: archetype.symbol,
                coreAche: archetype.coreAche,
                morningPrompt,
                promptDirective: morningPrompt
            };
        }

        exportState() {
            return {
                dreamArchive: this.dreamArchive
            };
        }

        hydrateState(state) {
            if (!state) return;
            if (Array.isArray(state.dreamArchive)) this.dreamArchive = [...state.dreamArchive];
        }
    }
    if (typeof globalThis !== "undefined") { globalThis.MetaphoricalDreamSynthesizer = MetaphoricalDreamSynthesizer; }
    if (typeof window !== "undefined") { window.MetaphoricalDreamSynthesizer = MetaphoricalDreamSynthesizer; }
    if (typeof module !== "undefined" && module.exports) { module.exports = MetaphoricalDreamSynthesizer; }

    /* ============================================================
     * [v3.461.0 接线修复] 本文件此前是 ESM 形态（export …），而宿主 extra_js、
     * 审计沙箱与 optional-engine-registry 的 require 全部按经典脚本加载 ——
     * `export` 在那里直接是语法错误，模块在真机上从未挂载成功。
     * 改回本仓统一的 UMD/IIFE 注册形态（同 ego-defense-mechanisms-engine.js）：
     * CJS 侧保留 module.exports 供测试与注册表的 require 使用，
     * 经典脚本侧把引擎类挂到全局，让取库口与编排器真的取得到。
     * ============================================================ */
    return MetaphoricalDreamSynthesizer;
}));
