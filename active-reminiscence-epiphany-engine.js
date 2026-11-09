/* ============================================================
 * active-reminiscence-epiphany-engine.js — 触景生情与主动联想顿悟引擎
 * [v3.461.0 · 物象心锚触发、语义共振扩散与主观顿悟心流]
 * ============================================================ */

class ActiveReminiscenceEpiphanyEngine {
    constructor(options = {}) {
        this.options = Object.assign({
            resonanceThreshold: 0.65,
            cooldownRounds: 4,
            maxAssociationsPerCue: 10,
            decayPerTurn: 0.05,
            minSnippetLength: 5
        }, options);
        
        this.cueAssociations = new Map(); // cueKey -> [ { targetMemoryId, memorySnippet, emotionTag, salience, triggerCount } ]
        this.lastTriggeredRound = -999;
        this.triggerHistory = [];
    }

    /**
     * 注册环境物象心锚与回忆片段绑定
     */
    registerAssociation(cueKeyword, targetMemoryId, memorySnippet, emotionTag = "nostalgia", salience = 0.8) {
        if (!cueKeyword || !targetMemoryId || !memorySnippet) return false;
        const key = String(cueKeyword).trim().toLowerCase();
        
        if (!this.cueAssociations.has(key)) {
            this.cueAssociations.set(key, []);
        }
        const bucket = this.cueAssociations.get(key);
        const existing = bucket.find(b => b.targetMemoryId === targetMemoryId);
        if (existing) {
            existing.salience = Math.min(1.0, existing.salience + 0.2);
            existing.memorySnippet = memorySnippet;
            return true;
        }

        if (bucket.length >= this.options.maxAssociationsPerCue) {
            bucket.sort((a, b) => a.salience - b.salience);
            bucket.shift();
        }

        bucket.push({
            targetMemoryId,
            memorySnippet: String(memorySnippet).trim(),
            emotionTag: emotionTag || "nostalgia",
            salience: Math.max(0.1, Math.min(1.0, Number(salience) || 0.8)),
            triggerCount: 0,
            registeredAt: Date.now()
        });
        return true;
    }

    /**
     * 深度扫描对话上下文中的物象触发词
     */
    probeCuesInDialogue(dialogueText, currentRound = 1) {
        if (!dialogueText || typeof dialogueText !== "string") {
            return { triggered: false, reason: "对话内容为空" };
        }
        const roundNum = Number(currentRound) || 1;
        if (roundNum - this.lastTriggeredRound < this.options.cooldownRounds) {
            return { triggered: false, reason: "顿悟心流处于冷却沉淀期", remainingRounds: this.options.cooldownRounds - (roundNum - this.lastTriggeredRound) };
        }

        const lower = dialogueText.toLowerCase();
        const candidateHits = [];

        for (const [cue, targets] of this.cueAssociations.entries()) {
            if (lower.includes(cue)) {
                for (const t of targets) {
                    const score = t.salience * (1.0 + (cue.length / 10));
                    candidateHits.push({ cue, ...t, score });
                }
            }
        }

        if (candidateHits.length === 0) {
            return { triggered: false, reason: "未捕捉到物象触发词" };
        }

        // 按共振加权选取最高分心锚
        candidateHits.sort((a, b) => b.score - a.score);
        const chosen = candidateHits[0];
        chosen.triggerCount += 1;
        this.lastTriggeredRound = roundNum;

        const monologueMap = {
            nostalgia: `（视线凝在「${chosen.cue}」上片刻，胸口泛起微涩的怀旧余波，不期然忆起旧事……「${chosen.memorySnippet}」）`,
            trauma: `（触及「${chosen.cue}」的刹那指尖微僵，当年那幕避无可避的残影骤然闪回……「${chosen.memorySnippet}」）`,
            affection: `（听到「${chosen.cue}」，唇角不自觉浮起一丝极浅的温软，想起曾共同经历的……「${chosen.memorySnippet}」）`,
            regret: `（「${chosen.cue}」这几个字像细刺般扎入心底，那桩未解的心结再次翻涌……「${chosen.memorySnippet}」）`
        };

        const formattedPrompt = monologueMap[chosen.emotionTag] || monologueMap.nostalgia;
        const record = {
            round: roundNum,
            cue: chosen.cue,
            targetMemoryId: chosen.targetMemoryId,
            emotionTag: chosen.emotionTag,
            monologue: formattedPrompt,
            timestamp: Date.now()
        };
        this.triggerHistory.push(record);
        if (this.triggerHistory.length > 30) this.triggerHistory.shift();

        return {
            triggered: true,
            cue: chosen.cue,
            targetMemoryId: chosen.targetMemoryId,
            emotionTag: chosen.emotionTag,
            epiphanyMonologue: formattedPrompt,
            promptDirective: `【触景生情·潜意识联想】由外界物象「${chosen.cue}」诱发心流：${formattedPrompt}`
        };
    }

    exportState() {
        return {
            cueAssociations: Array.from(this.cueAssociations.entries()),
            lastTriggeredRound: this.lastTriggeredRound,
            triggerHistory: this.triggerHistory
        };
    }

    hydrateState(state) {
        if (!state || typeof state !== "object") return;
        if (Array.isArray(state.cueAssociations)) this.cueAssociations = new Map(state.cueAssociations);
        if (typeof state.lastTriggeredRound === "number") this.lastTriggeredRound = state.lastTriggeredRound;
        if (Array.isArray(state.triggerHistory)) this.triggerHistory = [...state.triggerHistory];
    }
}
if (typeof globalThis !== "undefined") { globalThis.ActiveReminiscenceEpiphanyEngine = ActiveReminiscenceEpiphanyEngine; }
if (typeof window !== "undefined") { window.ActiveReminiscenceEpiphanyEngine = ActiveReminiscenceEpiphanyEngine; }
if (typeof module !== "undefined" && module.exports) { module.exports = ActiveReminiscenceEpiphanyEngine; }

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
                root.ActiveReminiscenceEpiphanyEngine = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    return ActiveReminiscenceEpiphanyEngine;
}));
