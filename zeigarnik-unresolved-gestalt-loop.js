/* ============================================================
 * zeigarnik-unresolved-gestalt-loop.js — [v3.461.0 · 第十八期全新认知引擎]
 * 蔡格尼克未闭合执念与潜意识反刍回路 (Zeigarnik Unresolved Gestalt Loop)
 * ------------------------------------------------------------
 * 【核心机制与完形心理学】
 * 解决记忆机械衰减带来的“漠不关心”感：
 *   人们对未完成的工作、被打断的告白、未送出的礼物记忆远比顺利结束的事件更清晰持久。
 *   引擎主动捕获被打断的任务与情感契约，将其标记为“未闭合完形 (Unclosed Gestalt)”，
 *   在长局中持续进行低频反刍，推动角色自发提起旧事。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
                root.ZeigarnikUnresolvedGestaltLoop = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    class ZeigarnikUnresolvedGestaltLoop {
        constructor(options = {}) {
            this.options = Object.assign({
                maxActiveLoops: 8,
                ruminationIntensityBase: 0.6
            }, options);
            this.openGestalts = new Map(); // id -> { id, interruptedEvent, interruptedBy, urgency, createdAt, ruminationCount }
        }

        /**
         * 捕获并打开一个未完成完形回路
         */
        openInterruptedLoop(id, data) {
            const loopId = id || ("gestalt_" + Date.now());
            const record = {
                id: loopId,
                eventSummary: data.eventSummary || "未尽之事",
                interruptedReason: data.interruptedReason || "突发意外中断",
                emotionalResidue: data.emotionalResidue || "执念未平",
                ruminationScore: Number(data.urgency || this.options.ruminationIntensityBase),
                createdAt: Date.now(),
                ruminationCount: 0,
                isResolved: false
            };

            this.openGestalts.set(loopId, record);
            return record;
        }

        /**
         * 在对话中触发潜意识反刍（随着时间流逝，未完成执念浮上水面）
         */
        advanceRuminationCycle() {
            const ruminating = [];
            for (const [id, g] of this.openGestalts.entries()) {
                if (g.isResolved) continue;
                g.ruminationCount++;
                // 执念随时间适度发酵
                g.ruminationScore = Math.min(1.0, g.ruminationScore + 0.05);
                if (g.ruminationScore >= 0.7) {
                    ruminating.push(g);
                }
            }
            return ruminating;
        }

        resolveLoop(id, resolutionNote = "") {
            if (this.openGestalts.has(id)) {
                const item = this.openGestalts.get(id);
                item.isResolved = true;
                item.resolutionNote = resolutionNote;
                return true;
            }
            return false;
        }

        formatRuminationPrompt() {
            const unresolved = Array.from(this.openGestalts.values()).filter(g => !g.isResolved);
            if (unresolved.length === 0) return "";
            const top = unresolved.sort((a, b) => b.ruminationScore - a.ruminationScore).slice(0, 2);
            const lines = ["【蔡格尼克效应·潜意识未决执念反刍】"];
            for (const u of top) {
                lines.push(`- 挂怀中断: \"${u.eventSummary}\" (打断原因: ${u.interruptedReason}, 执念反刍度: ${(u.ruminationScore * 100).toFixed(0)}%)`);
            }
            return lines.join("\n");
        }

        exportState() {
            return { openGestalts: Array.from(this.openGestalts.entries()) };
        }

        hydrateState(state) {
            if (state && Array.isArray(state.openGestalts)) {
                this.openGestalts = new Map(state.openGestalts);
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
    return ZeigarnikUnresolvedGestaltLoop;
}));
