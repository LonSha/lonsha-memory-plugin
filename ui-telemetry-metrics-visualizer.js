/* ============================================================
 * ui-telemetry-metrics-visualizer.js — 设置面板玩家动线与诊断可视化极致轻量化渲染器
 * [v3.461.0 · 零黑话白话交互卡片渲染]
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
                root.UITelemetryMetricsVisualizer = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    class UITelemetryMetricsVisualizer {
        renderHumanizedDashboard(rawMetrics = {}) {
            const moodScore = Math.max(0, Math.min(1, Number(rawMetrics.moodTemperature) || 0.5));
            const bondScore = Math.max(0, Math.min(1, Number(rawMetrics.bondStickiness) || 0.6));
            const memoryCount = Math.max(0, Number(rawMetrics.memoryDepthCount) || 120);
            const systemHealthy = rawMetrics.isHealthy !== false;

            const moodTemp = Math.round(moodScore * 100);
            const bondPercent = Math.round(bondScore * 100);

            return {
                panelTitle: "心智与记忆微观概览",
                humanizedCards: [
                    {
                        badge: "🌡️",
                        label: "当前心境温度",
                        valueText: `${moodTemp}°C`,
                        statusTone: moodTemp > 75 ? "热情奔放" : moodTemp < 35 ? "清冷克制" : "温润平和",
                        description: "反映角色当前对话中的情感活跃度与情绪余震强度。"
                    },
                    {
                        badge: "💞",
                        label: "情感羁绊黏性",
                        valueText: `${bondPercent}%`,
                        statusTone: bondPercent > 70 ? "心领神会" : "尚存戒备",
                        description: "双方经历重大事件、互助与承诺积累的信任厚度。"
                    },
                    {
                        badge: "📚",
                        label: "记忆库存沉淀",
                        valueText: `${memoryCount} 条`,
                        statusTone: "检索秒达",
                        description: "已分层提炼为三层金字塔，核心誓约永久驻留免遗忘。"
                    },
                    {
                        badge: "🛡️",
                        label: "系统运转状态",
                        valueText: systemHealthy ? "流畅如初" : "轻微过载",
                        statusTone: "无技术黑话",
                        description: "后台波纹调度与注意力流控自动平衡，无需操心参数。"
                    }
                ]
            };
        }
    }
    if (typeof globalThis !== "undefined") { globalThis.UITelemetryMetricsVisualizer = UITelemetryMetricsVisualizer; }
    if (typeof window !== "undefined") { window.UITelemetryMetricsVisualizer = UITelemetryMetricsVisualizer; }
    if (typeof module !== "undefined" && module.exports) { module.exports = UITelemetryMetricsVisualizer; }

    /* ============================================================
     * [v3.461.0 接线修复] 本文件此前是 ESM 形态（export …），而宿主 extra_js、
     * 审计沙箱与 optional-engine-registry 的 require 全部按经典脚本加载 ——
     * `export` 在那里直接是语法错误，模块在真机上从未挂载成功。
     * 改回本仓统一的 UMD/IIFE 注册形态（同 ego-defense-mechanisms-engine.js）：
     * CJS 侧保留 module.exports 供测试与注册表的 require 使用，
     * 经典脚本侧把引擎类挂到全局，让取库口与编排器真的取得到。
     * ============================================================ */
    return UITelemetryMetricsVisualizer;
}));
