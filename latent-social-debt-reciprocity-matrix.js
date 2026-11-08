/* ============================================================
 * latent-social-debt-reciprocity-matrix.js — 隐性人情亏欠与互惠补偿张力网络
 * [v3.461.0 · 关系天平、人情负债与非对称心理张力网络]
 * ============================================================ */

export class LatentSocialDebtReciprocityMatrix {
    constructor() {
        this.debtGraph = new Map(); // key `${fromEntity}->${toEntity}` -> { netScore, records: [] }
    }

    recordSocialExchange(fromEntity, toEntity, description, debtMagnitude = 1.0, isEmotional = true) {
        if (!fromEntity || !toEntity || !description) return false;
        const forwardKey = `${fromEntity}->${toEntity}`;
        const reverseKey = `${toEntity}->${fromEntity}`;

        if (!this.debtGraph.has(forwardKey)) this.debtGraph.set(forwardKey, { netScore: 0, records: [] });
        if (!this.debtGraph.has(reverseKey)) this.debtGraph.set(reverseKey, { netScore: 0, records: [] });

        const forward = this.debtGraph.get(forwardKey);
        const reverse = this.debtGraph.get(reverseKey);
        const mag = Math.max(0.1, Math.min(5.0, Number(debtMagnitude) || 1.0));

        forward.netScore += mag;
        reverse.netScore -= mag;

        forward.records.push({
            description: String(description).trim(),
            magnitude: mag,
            isEmotional,
            timestamp: Date.now()
        });
        if (forward.records.length > 20) forward.records.shift();
        return true;
    }

    assessReciprocityTension(characterA, characterB) {
        const key = `${characterA}->${characterB}`;
        const netBalance = this.debtGraph.get(key)?.netScore || 0;
        // netBalance > 0: A给B付出了很多，B欠A；netBalance < 0: B给A付出了很多，A欠B

        let dynamicRole = "势均力敌";
        let psychologicalPosture = "互助均衡，从容应对";
        let directiveText = null;

        if (netBalance <= -2.5) {
            dynamicRole = "沉重负恩者";
            psychologicalPosture = `角色「${characterA}」深感承蒙「${characterB}」关照过多，背负着深沉的感激与亏欠感`;
            directiveText = `【隐性人情亏欠·低姿态补偿】${psychologicalPosture}。在互动中言辞自觉放低身段，对对方的小小要求百依百顺，寻找机会主动偿还人情。`;
        } else if (netBalance >= 2.5) {
            dynamicRole = "默默付出者";
            psychologicalPosture = `角色「${characterA}」为「${characterB}」承担付出良多，若对方视作理所当然，心底会暗生被冷落的委屈隐痛`;
            directiveText = `【付出失衡·隐性委屈】${psychologicalPosture}。对话中偶带一丝嗔怨或试探，观察对方是否真正在意自己的付出。`;
        }

        return {
            characterA,
            characterB,
            netBalanceScore: Number(netBalance.toFixed(2)),
            dynamicRole,
            psychologicalPosture,
            directive: directiveText
        };
    }

    exportState() {
        return {
            debtGraph: Array.from(this.debtGraph.entries())
        };
    }

    hydrateState(state) {
        if (!state) return;
        if (Array.isArray(state.debtGraph)) {
            this.debtGraph = new Map(state.debtGraph);
        }
    }
}
if (typeof globalThis !== "undefined") { globalThis.LatentSocialDebtReciprocityMatrix = LatentSocialDebtReciprocityMatrix; }
if (typeof window !== "undefined") { window.LatentSocialDebtReciprocityMatrix = LatentSocialDebtReciprocityMatrix; }
if (typeof module !== "undefined" && module.exports) { module.exports = LatentSocialDebtReciprocityMatrix; }
export default LatentSocialDebtReciprocityMatrix;