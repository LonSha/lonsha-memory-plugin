/* ============================================================
 * dissociative-persona-mask-matrix.js — [v3.461.0 · 第十八期全新认知引擎]
 * 伪装面具与多重解离人格视界防火墙 (Dissociative Persona Mask Matrix)
 * ------------------------------------------------------------
 * 【核心机制与防穿帮保证】
 * 彻底解决双面间谍、卧底、解离人格随口自曝的致命Bug：
 *   构建 Mask (表层伪装) 与 Core (潜意识里人格) 的严格单向物理隔离视界。
 *   常态对话严防潜意识动机外泄；当且仅当环境安全度校验通过或暗号确认时才向提示词释放 Core。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
                root.DissociativePersonaMaskMatrix = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    class DissociativePersonaMaskMatrix {
        constructor(options = {}) {
            this.options = Object.assign({
                defaultActivePersona: "mask",
                leakPreventionStrict: true
            }, options);
            this.personas = new Map(); // personaId -> { id, type: "mask"|"core", name, traits, secrets, passphrase, stressThreshold }
            this.activePersonaId = "default_mask";
            this.safeHouseEngaged = false;
        }

        registerPersona(id, profile) {
            this.personas.set(id, {
                id,
                type: profile.type || "mask",
                name: profile.name || id,
                traits: Array.isArray(profile.traits) ? profile.traits : [],
                secrets: Array.isArray(profile.secrets) ? profile.secrets : [],
                passphrase: profile.passphrase || null,
                stressThreshold: profile.stressThreshold || 0.85
            });
        }

        switchPersona(id) {
            if (this.personas.has(id)) {
                this.activePersonaId = id;
                return true;
            }
            return false;
        }

        setSafeHouseEnvironment(isSafe) {
            this.safeHouseEngaged = !!isSafe;
        }

        /**
         * 视界安全过滤检索：隔离潜意识核心秘密
         */
        filterMemoriesByPersonaHorizon(memories = [], currentContext = "") {
            const current = this.personas.get(this.activePersonaId) || { type: "mask", secrets: [] };
            const isCoreUnsealed = current.type === "core" || this.safeHouseEngaged;

            return memories.filter(mem => {
                const text = (mem.text || mem.summary || "").toLowerCase();
                if (isCoreUnsealed) return true;
            
                // 若当前是 Mask 表层，严禁任何 Core 级别的机密标签进入提示词
                if (mem.isCoreSecret || mem.classification === "deep_agent") {
                    return false;
                }
                // 检查暗号与核心机密触发
                for (const s of current.secrets) {
                    if (text.includes(s.toLowerCase()) && !this.safeHouseEngaged) {
                        return false;
                    }
                }
                return true;
            });
        }

        formatMaskStatusPrompt() {
            const current = this.personas.get(this.activePersonaId);
            if (!current) return "";
            if (current.type === "mask") {
                return `【伪装面具状态】当前激活外显人格: [${current.name}] (严格潜意识防火墙生效中，潜台词不可对当事人直述)`;
            }
            return `【里人格解离释放】当前本体里人格: [${current.name}] (真实动机已解封)`;
        }

        exportState() {
            return {
                activePersonaId: this.activePersonaId,
                safeHouseEngaged: this.safeHouseEngaged,
                personas: Array.from(this.personas.entries())
            };
        }

        hydrateState(state) {
            if (!state) return;
            this.activePersonaId = state.activePersonaId || this.activePersonaId;
            this.safeHouseEngaged = !!state.safeHouseEngaged;
            if (Array.isArray(state.personas)) {
                this.personas = new Map(state.personas);
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
    return DissociativePersonaMaskMatrix;
}));
