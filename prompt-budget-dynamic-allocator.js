/* ============================================================
 * prompt-budget-dynamic-allocator.js — [v3.461.0 · 第十八期全新生产基座]
 * 提示词预算动态弹性竞价分配器 (Prompt Budget Dynamic Allocator)
 * ------------------------------------------------------------
 * 【核心机制与 Token 经济学】
 * 解决复杂插件提示词膨胀挤爆上下文窗口的风险：
 *   在注入前，设定硬性 Token 总预算配额（如 1200 Tokens）。
 *   根据当前剧情态势（日常聊天 vs 复杂悬疑/战斗推演），
 *   动态为 LonSha 记忆心智与 RubyPhone 拟真手机状态分配弹性预算比例，
 *   超额部分按重要性权重渐进修剪。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
                root.PromptBudgetDynamicAllocator = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    class PromptBudgetDynamicAllocator {
        constructor(options = {}) {
            this.options = Object.assign({
                maxTotalTokenBudget: 1200,
                defaultMemoryRatio: 0.55,
                defaultPhoneRatio: 0.45
            }, options);
        }

        /**
         * 根据场景动态计算两端配额
         */
        allocateBudgets(sceneType = "casual") {
            let memoryRatio = this.options.defaultMemoryRatio;
            let phoneRatio = this.options.defaultPhoneRatio;

            if (sceneType === "investigation" || sceneType === "combat") {
                // 悬疑破案或战斗对撞：扩充记忆心智配额
                memoryRatio = 0.70;
                phoneRatio = 0.30;
            } else if (sceneType === "phone_heavy" || sceneType === "social_chat") {
                // 密集玩手机/刷朋友圈：扩充手机系统配额
                memoryRatio = 0.35;
                phoneRatio = 0.65;
            }

            const total = this.options.maxTotalTokenBudget;
            return {
                sceneType,
                totalBudget: total,
                memoryBudgetTokens: Math.floor(total * memoryRatio),
                phoneBudgetTokens: Math.floor(total * phoneRatio)
            };
        }

        /**
         * 针对文本进行预算截断修剪
         */
        enforceBudget(promptText = "", budgetTokens = 500) {
            if (!promptText) return "";
            // 粗略估算 1 Token ≈ 1.8 字符 (中英混合)
            const maxChars = Math.floor(budgetTokens * 1.8);
            if (promptText.length <= maxChars) return promptText;

            return promptText.slice(0, maxChars) + "\n...[超预算动态自适应截断]";
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
    return PromptBudgetDynamicAllocator;
}));
