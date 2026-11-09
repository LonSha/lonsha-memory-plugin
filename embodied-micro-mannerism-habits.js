/* ============================================================
 * embodied-micro-mannerism-habits.js — 角色专属口癖习惯与具身化微行为映射器
 * [v3.461.0 · 角色具身微习惯库、躯体生理自律映射与肢体微动态]
 * ============================================================ */

class EmbodiedMicroMannerismHabits {
    constructor() {
        this.characterProfiles = new Map(); // charName -> { mannerisms: [], verbalTics: [] }
        this.recentMannerismUsage = [];
    }

    registerCharacterHabits(characterName, mannerisms = [], verbalTics = []) {
        if (!characterName) return false;
        this.characterProfiles.set(String(characterName).trim(), {
            mannerisms: Array.isArray(mannerisms) ? mannerisms : [],
            verbalTics: Array.isArray(verbalTics) ? verbalTics : []
        });
        return true;
    }

    synthesizeEmbodiedCue(characterName, emotionalContext = "nervous", urgency = 0.5) {
        const profile = this.characterProfiles.get(characterName) || {
            mannerisms: [
                { trigger: "nervous", action: "指尖无意识掐入掌心，喉间逸出一声极轻微的微滞", weight: 1.0 },
                { trigger: "calm", action: "垂眸整理袖口微皱的褶痕，呼吸节律清浅无波", weight: 1.0 },
                { trigger: "defensive", action: "抱臂微微后仰拉开距离，下颌线绷紧如刀刻", weight: 1.2 },
                { trigger: "flustered", action: "视线游移避开对视，耳廓浮起一层极淡的薄红", weight: 1.1 }
            ],
            verbalTics: [
                { context: "hesitant", prefix: "……那个，", suffix: "……吧。" }
            ]
        };

        const matched = profile.mannerisms.filter(m => m.trigger === emotionalContext);
        const candidate = matched.length > 0 
            ? matched[Math.floor(Math.random() * matched.length)]
            : profile.mannerisms[0];

        const cueText = candidate ? candidate.action : "呼吸微微一滞";
        const record = {
            characterName,
            emotionalContext,
            cueText,
            timestamp: Date.now()
        };
        
        this.recentMannerismUsage.push(record);
        if (this.recentMannerismUsage.length > 20) this.recentMannerismUsage.shift();

        return {
            characterName,
            emotionalContext,
            microAction: cueText,
            stageDirection: `（${cueText}）`,
            promptDirective: `【具身化微行为·${characterName}】神情生理呈现具身反应：（${cueText}），动作自然流淌融入行文，杜绝机械悬浮。`
        };
    }

    exportState() {
        return {
            characterProfiles: Array.from(this.characterProfiles.entries()),
            recentMannerismUsage: this.recentMannerismUsage
        };
    }

    hydrateState(state) {
        if (!state) return;
        if (Array.isArray(state.characterProfiles)) this.characterProfiles = new Map(state.characterProfiles);
        if (Array.isArray(state.recentMannerismUsage)) this.recentMannerismUsage = [...state.recentMannerismUsage];
    }
}
if (typeof globalThis !== "undefined") { globalThis.EmbodiedMicroMannerismHabits = EmbodiedMicroMannerismHabits; }
if (typeof window !== "undefined") { window.EmbodiedMicroMannerismHabits = EmbodiedMicroMannerismHabits; }
if (typeof module !== "undefined" && module.exports) { module.exports = EmbodiedMicroMannerismHabits; }

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
                root.EmbodiedMicroMannerismHabits = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    return EmbodiedMicroMannerismHabits;
}));
