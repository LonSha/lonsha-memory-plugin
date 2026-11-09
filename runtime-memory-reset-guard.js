/* ============================================================
 * runtime-memory-reset-guard.js — 跨周目与角色卡切换内存无损热重载防护哨兵
 * [v3.461.0 · 角色边界隔离与会话上下文污染物理熔断]
 * ============================================================ */

class RuntimeMemoryResetGuard {
    constructor(options = {}) {
        this.options = Object.assign({
            enforceStrictCharBoundary: true,
            autoPurgeOrphanSnapshots: true
        }, options);
        
        this.activeSessionId = null;
        this.activeCharacterName = null;
        this.auditTrail = [];
    }

    assertSessionBoundary(sessionId, characterName, onContextPurgeCallback) {
        if (!sessionId || !characterName) {
            return { switchDetected: false, reason: "缺少会话或角色标识，保持现状" };
        }

        if (!this.activeSessionId && !this.activeCharacterName) {
            this.activeSessionId = sessionId;
            this.activeCharacterName = characterName;
            return { switchDetected: false, reason: "首轮会话锚定初始化完成" };
        }

        const isSessionChanged = this.activeSessionId !== sessionId;
        const isCharacterChanged = this.activeCharacterName !== characterName;

        if (isSessionChanged || isCharacterChanged) {
            const previousContext = {
                sessionId: this.activeSessionId,
                characterName: this.activeCharacterName
            };
            const incomingContext = {
                sessionId,
                characterName
            };

            let purgeSuccess = false;
            if (typeof onContextPurgeCallback === "function") {
                try {
                    onContextPurgeCallback(previousContext, incomingContext);
                    purgeSuccess = true;
                } catch (e) {
                    console.error("[RuntimeMemoryResetGuard] 上下文清除回调异常:", e);
                }
            }

            const eventRecord = {
                timestamp: Date.now(),
                previous: previousContext,
                incoming: incomingContext,
                isSessionChanged,
                isCharacterChanged,
                purged: purgeSuccess
            };
            this.auditTrail.push(eventRecord);
            if (this.auditTrail.length > 50) this.auditTrail.shift();

            // 更新当前锚点
            this.activeSessionId = sessionId;
            this.activeCharacterName = characterName;

            return {
                switchDetected: true,
                eventRecord,
                message: `成功检测到上下文跃迁（原:「${previousContext.characterName}」-> 现:「${characterName}」），已安全执行内存隔离熔断。`
            };
        }

        return { switchDetected: false, reason: "同会话同角色连续交互" };
    }

    getResetAuditHistory() {
        return this.auditTrail;
    }
}
if (typeof globalThis !== "undefined") { globalThis.RuntimeMemoryResetGuard = RuntimeMemoryResetGuard; }
if (typeof window !== "undefined") { window.RuntimeMemoryResetGuard = RuntimeMemoryResetGuard; }
if (typeof module !== "undefined" && module.exports) { module.exports = RuntimeMemoryResetGuard; }

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
                root.RuntimeMemoryResetGuard = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    return RuntimeMemoryResetGuard;
}));
