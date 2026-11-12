/* ============================================================
 * memory-conflict-healing-arbitrator.js — 记忆冲突主动仲裁与反事实自愈防线
 * [v3.461.0 · 双轨记忆辩证仲裁树与时序反转愈合]
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
                root.MemoryConflictHealingArbitrator = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    class MemoryConflictHealingArbitrator {
        constructor(options = {}) {
            this.options = Object.assign({
                preferLatestTurnOnLinearFacts: true,
                allowDualBranchOnSubconsciousLie: true
            }, options);
        
            this.conflictRulings = [];
        }

        arbitrate(existingFact, incomingFact) {
            if (!existingFact || !incomingFact) {
                return {
                    resolved: true,
                    ruling: "noop",
                    selectedFact: incomingFact || existingFact,
                    dualBranch: null
                };
            }

            const existTurn = Number(existingFact.turnIndex) || 0;
            const incomTurn = Number(incomingFact.turnIndex) || 0;
            const isDeceptionOrDistortion = Boolean(incomingFact.isLie || incomingFact.isSubconsciousDistortion || incomingFact.isDenial);
        
            let rulingType = "update";
            let dualBranchData = null;

            if (isDeceptionOrDistortion && this.options.allowDualBranchOnSubconsciousLie) {
                // 双轨分支：客观物理事实保留，角色主观认知单独分支
                rulingType = "dual_branch_isolate";
                dualBranchData = {
                    objectiveTruth: existingFact.text || existingFact.summary,
                    subjectiveBelief: incomingFact.text || incomingFact.summary,
                    distortionOrigin: incomingFact.distortionOrigin || "自尊防卫或刻意瞒骗"
                };
            } else if (incomTurn > existTurn) {
                // 线性前向演更替
                rulingType = "supersede_and_archive";
            } else {
                // 时序倒错或模糊冲突
                rulingType = "dialectic_coexistence";
            }

            const rulingRecord = {
                id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                existingId: existingFact.id,
                incomingId: incomingFact.id,
                ruling: rulingType,
                dualBranch: dualBranchData,
                effectiveText: rulingType === "dual_branch_isolate"
                    ? `【双轨事实】物理真相:「${existingFact.text}」 | 角色自欺认知:「${incomingFact.text}」`
                    : (incomingFact.text || incomingFact.summary),
                timestamp: Date.now()
            };

            this.conflictRulings.push(rulingRecord);
            return rulingRecord;
        }

        getRulingsHistory() {
            return this.conflictRulings;
        }
    }
    if (typeof globalThis !== "undefined") { globalThis.MemoryConflictHealingArbitrator = MemoryConflictHealingArbitrator; }
    if (typeof window !== "undefined") { window.MemoryConflictHealingArbitrator = MemoryConflictHealingArbitrator; }
    if (typeof module !== "undefined" && module.exports) { module.exports = MemoryConflictHealingArbitrator; }

    /* ============================================================
     * [v3.461.0 接线修复] 本文件此前是 ESM 形态（export …），而宿主 extra_js、
     * 审计沙箱与 optional-engine-registry 的 require 全部按经典脚本加载 ——
     * `export` 在那里直接是语法错误，模块在真机上从未挂载成功。
     * 改回本仓统一的 UMD/IIFE 注册形态（同 ego-defense-mechanisms-engine.js）：
     * CJS 侧保留 module.exports 供测试与注册表的 require 使用，
     * 经典脚本侧把引擎类挂到全局，让取库口与编排器真的取得到。
     * ============================================================ */
    return MemoryConflictHealingArbitrator;
}));
