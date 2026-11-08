/* ============================================================
 * emotional-inertia-mood-residue-engine.js — 情感惯性阻尼与心境余震衰减机
 * [v3.461.0 · 情绪余韵阻尼模型与反瞬变心理状态机]
 * ============================================================ */

export class EmotionalInertiaMoodResidueEngine {
    constructor(options = {}) {
        this.options = Object.assign({
            decayPerTurn: 0.12,
            maxConcurrentResidues: 5,
            minResidueCutoff: 0.08,
            traumaResistanceMultiplier: 1.6
        }, options);
        
        this.activeResidues = []; // [ { id, emotion, intensity, cause, turnsRemaining, isTraumatic, createdAt } ]
    }

    injectEmotionalShock(emotion, intensity = 0.8, cause = "突发事件", durationTurns = 6, isTraumatic = false) {
        const shockId = `shock_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const clampedIntensity = Math.min(1.0, Math.max(0.1, Number(intensity) || 0.8));
        const turns = Math.max(2, Math.round(durationTurns * (isTraumatic ? this.options.traumaResistanceMultiplier : 1.0)));

        const shock = {
            id: shockId,
            emotion: emotion || "shock",
            intensity: clampedIntensity,
            cause: String(cause || "情绪冲击").trim(),
            turnsRemaining: turns,
            isTraumatic: Boolean(isTraumatic),
            createdAt: Date.now()
        };

        this.activeResidues.push(shock);
        if (this.activeResidues.length > this.options.maxConcurrentResidues) {
            this.activeResidues.sort((a, b) => a.intensity - b.intensity);
            this.activeResidues.shift();
        }
        return shock;
    }

    stepTurn() {
        for (const res of this.activeResidues) {
            const actualDecay = res.isTraumatic ? this.options.decayPerTurn * 0.6 : this.options.decayPerTurn;
            res.intensity = Math.max(0, Number((res.intensity - actualDecay).toFixed(3)));
            res.turnsRemaining -= 1;
        }
        this.activeResidues = this.activeResidues.filter(r => r.turnsRemaining > 0 && r.intensity >= this.options.minResidueCutoff);
    }

    getCurrentResidueSummary() {
        if (this.activeResidues.length === 0) return null;
        
        // 找出主导情绪与次生余震
        const sorted = [...this.activeResidues].sort((a, b) => b.intensity - a.intensity);
        const dominant = sorted[0];
        const percent = Math.round(dominant.intensity * 100);

        const moodToneDescriptions = {
            anger: "胸中郁气难平，语调硬涩且带有下意识的防卫刺意",
            sorrow: "眸中神采沉滞，语意低徊，带着挥之不去的疲惫酸涩",
            terror: "呼吸节奏紊乱，指节泛白，对周遭动静存在过激警戒",
            romantic_ache: "目光低垂避开直视，心绪动荡翻涌却极力保持克制矜持",
            guilt: "言辞放低姿态，眼神闪烁回避，急切想要在微细节中补偿对方"
        };

        const toneBehavior = moodToneDescriptions[dominant.emotion] || `神情间残留着明显的${dominant.emotion}余韵，动作略显迟滞`;
        const directive = `【心境余震·${dominant.emotion}（强度${percent}%，尚余${dominant.turnsRemaining}轮阻尼）】` +
            `受到此前「${dominant.cause}」的持续影响：${toneBehavior}。` +
            `在此心境彻底平复前，严禁毫无过渡地突兀切换为嬉笑轻快态度。`;

        return {
            dominantEmotion: dominant.emotion,
            intensity: dominant.intensity,
            intensityPercent: percent,
            cause: dominant.cause,
            turnsRemaining: dominant.turnsRemaining,
            promptDirective: directive,
            activeResiduesCount: this.activeResidues.length
        };
    }

    exportState() {
        return {
            activeResidues: this.activeResidues
        };
    }

    hydrateState(state) {
        if (!state) return;
        if (Array.isArray(state.activeResidues)) {
            this.activeResidues = [...state.activeResidues];
        }
    }
}
if (typeof globalThis !== "undefined") { globalThis.EmotionalInertiaMoodResidueEngine = EmotionalInertiaMoodResidueEngine; }
if (typeof window !== "undefined") { window.EmotionalInertiaMoodResidueEngine = EmotionalInertiaMoodResidueEngine; }
if (typeof module !== "undefined" && module.exports) { module.exports = EmotionalInertiaMoodResidueEngine; }
export default EmotionalInertiaMoodResidueEngine;