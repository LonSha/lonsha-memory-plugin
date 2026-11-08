/* ============================================================
 * dramatic-reveal-catharsis-hub.js — 戏剧性真相揭露与情感宣泄高潮中枢
 * [v3.461.0 · 剧情张力蓄积、伏笔临界核爆与情感宣泄总控台]
 * ============================================================ */

export class DramaticRevealCatharsisHub {
    constructor(options = {}) {
        this.options = Object.assign({
            climaxTensionThreshold: 85,
            tensionDecayPerTurn: 3,
            maxTensionCap: 100
        }, options);
        
        this.tensionMeter = 20; // 0 ~ 100
        this.buriedSecrets = []; // [ { id, secretTruth, triggerClues: [], revealed: bool, emotionalImpact } ]
        this.catharsisHistory = [];
    }

    burySecret(id, secretTruth, triggerClues = [], emotionalImpact = "earth_shattering") {
        const item = {
            id: String(id),
            secretTruth: String(secretTruth).trim(),
            triggerClues: Array.isArray(triggerClues) ? triggerClues.map(c => String(c).toLowerCase()) : [],
            revealed: false,
            emotionalImpact,
            buriedTimestamp: Date.now()
        };
        this.buriedSecrets.push(item);
        return item;
    }

    feedNarrativeStimulus(stimulusText, tensionBump = 15) {
        const text = String(stimulusText || "").toLowerCase();
        let matchedClueCount = 0;

        for (const sec of this.buriedSecrets) {
            if (sec.revealed) continue;
            for (const clue of sec.triggerClues) {
                if (text.includes(clue)) {
                    matchedClueCount += 1;
                }
            }
        }

        const totalDelta = tensionBump + (matchedClueCount * 12);
        this.tensionMeter = Math.min(this.options.maxTensionCap, this.tensionMeter + totalDelta);

        return {
            currentTension: this.tensionMeter,
            matchedClueCount,
            isClimaxReady: this.tensionMeter >= this.options.climaxTensionThreshold
        };
    }

    triggerClimaxIfReady() {
        if (this.tensionMeter < this.options.climaxTensionThreshold) {
            return { triggered: false, currentTension: this.tensionMeter };
        }

        const pendingSecrets = this.buriedSecrets.filter(s => !s.revealed);
        if (pendingSecrets.length === 0) {
            return { triggered: false, reason: "无未解秘密可供爆发" };
        }

        const chosen = pendingSecrets[0];
        chosen.revealed = true;
        chosen.revealedTimestamp = Date.now();

        const catharsisRecord = {
            secretId: chosen.id,
            truth: chosen.secretTruth,
            tensionLevelAtClimax: this.tensionMeter,
            timestamp: Date.now()
        };
        this.catharsisHistory.push(catharsisRecord);
        // 宣泄后张力平复回落
        this.tensionMeter = 30;

        return {
            triggered: true,
            secretTruth: chosen.secretTruth,
            tensionAtBurst: catharsisRecord.tensionLevelAtClimax,
            promptDirective: `【戏剧高潮爆发·真相决堤（张力 ${catharsisRecord.tensionLevelAtClimax}%）】` +
                `长期掩藏在深渊中的真相「${chosen.secretTruth}」在不可抵挡的剧烈情绪宣泄中彻底揭开！` +
                `所有虚与委蛇的体面瞬间撕碎，情感如同决堤山洪倾泻而出，极度逼真强烈！`
        };
    }

    exportState() {
        return {
            tensionMeter: this.tensionMeter,
            buriedSecrets: this.buriedSecrets,
            catharsisHistory: this.catharsisHistory
        };
    }

    hydrateState(state) {
        if (!state) return;
        if (typeof state.tensionMeter === "number") this.tensionMeter = state.tensionMeter;
        if (Array.isArray(state.buriedSecrets)) this.buriedSecrets = [...state.buriedSecrets];
        if (Array.isArray(state.catharsisHistory)) this.catharsisHistory = [...state.catharsisHistory];
    }
}
if (typeof globalThis !== "undefined") { globalThis.DramaticRevealCatharsisHub = DramaticRevealCatharsisHub; }
if (typeof window !== "undefined") { window.DramaticRevealCatharsisHub = DramaticRevealCatharsisHub; }
if (typeof module !== "undefined" && module.exports) { module.exports = DramaticRevealCatharsisHub; }
export default DramaticRevealCatharsisHub;