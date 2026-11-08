/* ============================================================
 * temporal-flashbulb-dilation-engine.js — [v3.461.0 · 第十八期全新认知引擎]
 * 闪光灯主观时间膨胀与情绪像素定格引擎 (Temporal Flashbulb Dilation Engine)
 * ------------------------------------------------------------
 * 【核心机制与神经心理学依据】
 * 解决时间机械等距记录的痛点：
 *   真实人类心智在面临极端惊骇、剧烈痛苦或狂喜时刻时，会产生"主观时间拉伸 (Subjective Time Dilation)"
 *   与"闪光灯细节定格 (Flashbulb Memory)"效应。几秒钟的事故或心动，在大脑神经回路中被展开为数百帧纤毫毕现的微细节。
 * ============================================================ */

export class TemporalFlashbulbDilationEngine {
    constructor(options = {}) {
        this.options = Object.assign({
            arousalThreshold: 0.72,
            maxDilationFactor: 12.0,
            minPixelSensoryItems: 3,
            decayShieldGenerations: 200
        }, options);
        this.frozenMoments = new Map();
    }

    /**
     * 评估事件的情绪唤醒度并计算主观时间膨胀系数
     * @param {Object} event { id, summary, arousal (0~1), emotion, sensoryDetails: [] }
     */
    evaluateAndDilate(event) {
        if (!event || typeof event !== "object") return null;
        const arousal = Math.max(0, Math.min(1, Number(event.arousal) || 0));
        const isFlashbulb = arousal >= this.options.arousalThreshold;
        
        // 膨胀系数: 基于非线性指数拉伸
        const dilationFactor = isFlashbulb 
            ? Number((1.0 + Math.exp(arousal * 3.2) / 2.0).toFixed(2))
            : 1.0;

        const frozenRecord = {
            id: event.id || ("fb_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7)),
            originalSummary: event.summary || "",
            arousal,
            emotion: event.emotion || "intense_shock",
            dilationFactor,
            isFlashbulb,
            sensoryMicroPixels: Array.isArray(event.sensoryDetails) ? [...event.sensoryDetails] : [],
            subjectiveDurationStr: isFlashbulb ? `主观感觉度过了 ${(dilationFactor * 3.5).toFixed(1)} 分钟之久 (纤毫毕现)` : "客观流速",
            decayImmunity: isFlashbulb,
            decayShieldRemaining: isFlashbulb ? this.options.decayShieldGenerations : 0,
            timestamp: event.timestamp || Date.now()
        };

        if (isFlashbulb) {
            this.frozenMoments.set(frozenRecord.id, frozenRecord);
        }

        return frozenRecord;
    }

    /**
     * 获取提示词上下文注入块
     */
    formatPromptInjection(limit = 2) {
        if (this.frozenMoments.size === 0) return "";
        const recs = Array.from(this.frozenMoments.values())
            .sort((a, b) => b.arousal - a.arousal)
            .slice(0, limit);
        
        const lines = ["【潜意识闪光灯定格·时间膨胀体验】"];
        for (const r of recs) {
            lines.push(`- [突发震颤] "${r.originalSummary}" (主观时间膨胀 ${r.dilationFactor}x, ${r.subjectiveDurationStr})`);
            if (r.sensoryMicroPixels.length > 0) {
                lines.push(`  微感官定格: ${r.sensoryMicroPixels.slice(0, 3).join(" | ")}`);
            }
        }
        return lines.join("\n");
    }

    exportState() {
        return {
            frozenMoments: Array.from(this.frozenMoments.entries())
        };
    }

    hydrateState(state) {
        if (!state) return;
        if (Array.isArray(state.frozenMoments)) {
            this.frozenMoments = new Map(state.frozenMoments);
        }
    }
}

export default TemporalFlashbulbDilationEngine;
