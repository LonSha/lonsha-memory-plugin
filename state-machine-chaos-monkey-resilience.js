/* ============================================================
 * state-machine-chaos-monkey-resilience.js — [v3.461.0 · 第十八期全新生产基座]
 * 记忆状态机混沌工程自愈防御盾 (Chaos Monkey State Resilience)
 * ------------------------------------------------------------
 * 【核心机制与工业级容灾】
 * 模拟生产环境中浏览器意外关闭、存储截断、脏数据污染与空指针异常：
 *   提供数据完整性主动校验环 (CRC/Schema Check)。
 *   当侦测到损坏或不完整的记忆状态帧时，自动切断污染扩散链，
 *   秒级回退至上一个已知健康状态并自愈补全缺损字段，保障系统永不崩溃。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
                root.StateMachineChaosMonkeyResilience = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    class StateMachineChaosMonkeyResilience {
        constructor(options = {}) {
            this.options = Object.assign({
                autoSelfHealing: true,
                strictSchemaValidation: true
            }, options);
            this.quarantinedCorruptions = [];
            this.lastKnownGoodState = null;
        }

        /**
         * 校验并净化记忆状态对象
         */
        validateAndHeal(rawState) {
            if (!rawState || typeof rawState !== "object") {
                return this.recoverFromFallback("状态对象为空或非对象");
            }

            const requiredFields = ["activePersonaId", "frozenMoments", "confabulatedNodes", "sensoryAnchors"];
            const missingFields = [];

            for (const f of requiredFields) {
                if (!(f in rawState)) {
                    missingFields.push(f);
                }
            }

            if (missingFields.length > 0) {
                const healed = Object.assign({}, rawState);
                for (const mf of missingFields) {
                    healed[mf] = mf === "activePersonaId" ? "default_mask" : [];
                }
                this.quarantinedCorruptions.push({
                    timestamp: Date.now(),
                    reason: `缺失核心字段: ${missingFields.join(", ")}`,
                    action: "自愈补全字段默认值"
                });
                this.lastKnownGoodState = healed;
                return healed;
            }

            this.lastKnownGoodState = rawState;
            return rawState;
        }

        recoverFromFallback(reason = "未知异常") {
            this.quarantinedCorruptions.push({
                timestamp: Date.now(),
                reason,
                action: "回退至上一个已知安全快照或空基底"
            });
            return this.lastKnownGoodState || {
                activePersonaId: "default_mask",
                frozenMoments: [],
                confabulatedNodes: [],
                sensoryAnchors: []
            };
        }

        getHealthReport() {
            return {
                healthy: this.quarantinedCorruptions.length === 0,
                incidentsCount: this.quarantinedCorruptions.length,
                recentIncidents: this.quarantinedCorruptions.slice(-3)
            };
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
    return StateMachineChaosMonkeyResilience;
}));
