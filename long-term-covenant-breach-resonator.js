/* ============================================================
 * long-term-covenant-breach-resonator.js — 长期承诺誓约与违约反噬共鸣中心
 * [v3.461.0 · 跨数百轮约定追踪、违约信任冰川与灵魂心锚熔铸]
 * ============================================================ */

class LongTermCovenantBreachResonator {
    constructor(options = {}) {
        this.options = Object.assign({
            maxActiveCovenants: 10,
            breachPenaltyMultiplier: 2.5,
            fulfillmentTrustBonus: 1.8
        }, options);
        
        this.covenants = new Map(); // id -> CovenantRecord
        this.breachHistory = [];
        this.trustGlacierLevel = 0.0; // 0.0 ~ 1.0 (背叛后构筑的情感冰川厚度)
    }

    forgeCovenant(id, promiseText, participants = [], terms = {}) {
        if (!id || !promiseText) return false;
        const record = {
            id: String(id),
            promiseText: String(promiseText).trim(),
            participants: Array.isArray(participants) ? [...participants] : [],
            status: "active", // active | fulfilled | breached | compromised
            conditions: terms.conditions || "无附加条件",
            forgedAtRound: Number(terms.round) || 1,
            emotionalWeight: Math.max(0.5, Math.min(3.0, Number(terms.weight) || 1.5)),
            forgedTimestamp: Date.now(),
            breachConsequences: terms.consequences || "永久性信任崩解与心防冰封"
        };
        
        this.covenants.set(record.id, record);
        return record;
    }

    judgeBreachOrFulfill(id, eventType, narrativeEvidence = "", currentRound = 1) {
        const cov = this.covenants.get(id);
        if (!cov || cov.status !== "active") return null;

        cov.resolvedRound = Number(currentRound) || 1;
        cov.resolvedEvidence = String(narrativeEvidence).trim();
        cov.resolvedTimestamp = Date.now();

        if (eventType === "breach") {
            cov.status = "breached";
            // 叠加信任冰川厚度
            const penalty = Number((cov.emotionalWeight * 0.3 * this.options.breachPenaltyMultiplier).toFixed(2));
            this.trustGlacierLevel = Math.min(1.0, this.trustGlacierLevel + penalty);

            const breachRecord = {
                covenantId: id,
                promiseText: cov.promiseText,
                evidence: cov.resolvedEvidence,
                trustGlacierIncrease: penalty,
                currentGlacierLevel: this.trustGlacierLevel,
                timestamp: Date.now()
            };
            this.breachHistory.push(breachRecord);

            return {
                status: "breached",
                trustGlacierLevel: this.trustGlacierLevel,
                impactType: "信任崩塌·不可逆心痕",
                promptDirective: `【誓约碎裂·因果反噬（信任冰川厚度 ${Math.round(this.trustGlacierLevel * 100)}%）】` +
                    `昔日庄重立下的誓约「${cov.promiseText}」遭到无情背弃（事实凭据: ${cov.resolvedEvidence}）。` +
                    `角色内心构筑起极高的戒备冷感高墙，神情眼神透出被刺痛后的冷漠疏离，杜绝轻易谅解。`
            };
        }

        if (eventType === "fulfill") {
            cov.status = "fulfilled";
            this.trustGlacierLevel = Math.max(0.0, this.trustGlacierLevel - 0.2);
            return {
                status: "fulfilled",
                impactType: "契约践行·灵魂心锚加固",
                promptDirective: `【誓约践行·宿命长梦初圆】共同恪守的承诺「${cov.promiseText}」终成现实（凭据: ${cov.resolvedEvidence}）。` +
                    `角色深层心防彻底融解，触发极深的情感依恋与矢志不渝的灵魂心锚。`
            };
        }

        return null;
    }

    getActiveCovenants() {
        return Array.from(this.covenants.values()).filter(c => c.status === "active");
    }

    exportState() {
        return {
            covenants: Array.from(this.covenants.entries()),
            breachHistory: this.breachHistory,
            trustGlacierLevel: this.trustGlacierLevel
        };
    }

    hydrateState(state) {
        if (!state || typeof state !== "object") return;
        if (Array.isArray(state.covenants)) this.covenants = new Map(state.covenants);
        if (Array.isArray(state.breachHistory)) this.breachHistory = [...state.breachHistory];
        if (typeof state.trustGlacierLevel === "number") this.trustGlacierLevel = state.trustGlacierLevel;
    }
}
if (typeof globalThis !== "undefined") { globalThis.LongTermCovenantBreachResonator = LongTermCovenantBreachResonator; }
if (typeof window !== "undefined") { window.LongTermCovenantBreachResonator = LongTermCovenantBreachResonator; }
if (typeof module !== "undefined" && module.exports) { module.exports = LongTermCovenantBreachResonator; }

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
                root.LongTermCovenantBreachResonator = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    return LongTermCovenantBreachResonator;
}));
