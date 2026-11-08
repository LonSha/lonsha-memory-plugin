/* ============================================================
 * cognitive-scatoma-denial-guard.js — [v3.461.0 · 第十八期全新认知引擎]
 * 认知盲点与防御性选择性失聪守卫 (Cognitive Scatoma Denial Guard)
 * ------------------------------------------------------------
 * 【核心机制与心理防御学】
 * 解决大模型直白全盘接受残忍真相的非人违和感：
 *   当揭露的事实彻底击碎角色的核心情感支柱时，心智本能触发“心理暗点/认知盲点 (Scatoma)”，
 *   产生“选择性失聪、借口合理化、归咎于他人污蔑”的本能否认反应，直到心智防御逐步瓦解。
 * ============================================================ */

export class CognitiveScatomaDenialGuard {
    constructor(options = {}) {
        this.options = Object.assign({
            denialThreshold: 0.8,
            rationalizationExcuses: [
                "这绝不可能，肯定有人伪造了证据陷害他！",
                "我亲眼见过的他根本不是这种人，这里面一定有天大的误会！",
                "别想挑拨我们之间的关系，我是不会上当的。"
            ]
        }, options);
        this.activeBlindspots = new Map();
    }

    registerBlindspot(topic, sensitiveCoreTarget, denialIntensity = 0.9) {
        this.activeBlindspots.set(topic, {
            topic,
            target: sensitiveCoreTarget,
            intensity: denialIntensity,
            isCracked: false,
            breakdownProgress: 0.0
        });
    }

    /**
     * 过滤审查记忆内容，对触碰暗点的内容执行合理化否认包装
     */
    filterAndRationalize(incomingFact, topic) {
        const spot = this.activeBlindspots.get(topic);
        if (!spot || spot.isCracked) return { filtered: false, fact: incomingFact };

        // 承受度受到冲击，但表层心理机制强行阻断吸收
        spot.breakdownProgress += 0.2;
        if (spot.breakdownProgress >= 1.0) {
            spot.isCracked = true;
            return {
                filtered: false,
                isBreakdown: true,
                message: `【心理暗点崩塌】再也无法自我欺骗，残酷事实全面侵入意识：\"${incomingFact}\"`
            };
        }

        const excuse = this.options.rationalizationExcuses[
            Math.floor(Math.random() * this.options.rationalizationExcuses.length)
        ];

        return {
            filtered: true,
            isBreakdown: false,
            denialPrompt: `【认知盲点生效·防御性否认】面对\"${incomingFact}\"，角色本能抗拒相信，心理合理化对策：\"${excuse}\"`
        };
    }

    formatScatomaPrompt() {
        const active = Array.from(this.activeBlindspots.values()).filter(s => !s.isCracked);
        if (active.length === 0) return "";
        const lines = ["【潜意识认知盲点 (Scatoma) 坚守中】"];
        for (const s of active) {
            lines.push(`- 盲点保护区 [${s.topic} -> ${s.target}]: 严禁直视该真相 (防线坚固度: ${((1 - s.breakdownProgress) * 100).toFixed(0)}%)`);
        }
        return lines.join("\n");
    }

    exportState() {
        return { activeBlindspots: Array.from(this.activeBlindspots.entries()) };
    }

    hydrateState(state) {
        if (state && Array.isArray(state.activeBlindspots)) {
            this.activeBlindspots = new Map(state.activeBlindspots);
        }
    }
}

export default CognitiveScatomaDenialGuard;