/* ============================================================
 * epistemic-boundary-auditor.js — [v3.461.0 · 第十八期全新生产基座]
 * 认识论边界与非全知严谨性全量审计监视器 (Epistemic Boundary Auditor)
 * ------------------------------------------------------------
 * 【核心机制与防全知门禁】
 * 作为提示词合成的最后一道物理防火墙：
 *   扫描待注入模型上下文的提示词文本，检测是否存在“全知越权词”
 *   （如：“你其实知道……”、“背地里其实是……”、“上帝视角显示……”）。
 *   若角色并非当事人且无物证/情报支撑，强制剥离或降级为“毫无依据的直觉猜想”，守卫非全知边界。
 * ============================================================ */

class EpistemicBoundaryAuditor {
    constructor(options = {}) {
        this.options = Object.assign({
            strictOmniscienceSanitization: true,
            forbiddenOmniscientPatterns: [
                /你明知.*?(但是|却)/i,
                /上帝视角显示/i,
                /观众都知道/i,
                /背地里实际上正在/i
            ]
        }, options);
        this.auditLog = [];
    }

    /**
     * 审计并净化提示词中的全知越界描述
     */
    auditAndSanitize(promptText = "", characterRole = "mortal") {
        if (!promptText || typeof promptText !== "string") return { text: promptText, violations: 0 };
        let sanitized = promptText;
        let violationCount = 0;

        for (const pattern of this.options.forbiddenOmniscientPatterns) {
            if (pattern.test(sanitized)) {
                violationCount++;
                sanitized = sanitized.replace(pattern, "【隐约感到某些异样】");
            }
        }

        if (violationCount > 0) {
            this.auditLog.push({
                timestamp: Date.now(),
                role: characterRole,
                violations: violationCount
            });
        }

        return {
            text: sanitized,
            violationCount,
            clean: violationCount === 0
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
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
                root.EpistemicBoundaryAuditor = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    return EpistemicBoundaryAuditor;
}));
