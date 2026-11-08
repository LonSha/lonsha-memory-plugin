/* ============================================================
 * rumor-entropy-gossip-diffusion.js — [v3.461.0 · 第十八期全新认知引擎]
 * 群体流言熵增失真与 NPC 社交传染模型 (Rumor Entropy Gossip Diffusion)
 * ------------------------------------------------------------
 * 【核心机制与传播学模型】
 * 模拟市井传闻与 NPC 间情报流转中的"信息熵增畸变"：
 *   真实世界里的秘密每在人群中传播一棒（Hop），就会随传播者的性格偏见（添油加醋、遗漏限定词、数字放大）发生扭曲。
 *   实现“三个人传下来，偷摸看电影变成了私奔出逃”的鲜活生活谣言生态。
 * ============================================================ */

export class RumorEntropyGossipDiffusion {
    constructor(options = {}) {
        this.options = Object.assign({
            distortionRatePerHop: 0.25,
            maxHops: 5
        }, options);
        this.rumorChains = new Map();
    }

    /**
     * 秘密转为传闻并在 NPC 网络中发生一跳传染
     */
    diffuseRumor(rumorId, originSecret, carrierNPC = {}) {
        const id = rumorId || ("rumor_" + Date.now());
        let chain = this.rumorChains.get(id);

        if (!chain) {
            chain = {
                id,
                truth: originSecret.content || "某件秘事",
                currentVersion: originSecret.content || "某件秘事",
                hopCount: 0,
                distortionLog: [],
                credibility: 1.0
            };
        }

        chain.hopCount++;
        const bias = carrierNPC.bias || "sensationalist"; // sensationalist(夸张), paranoid(多疑), gossipy(八卦)
        let distorted = chain.currentVersion;

        if (bias === "sensationalist") {
            distorted = distorted.replace(/可能|或许/g, "绝对").replace(/一次/g, "成百上千次");
            distorted = `【惊爆】大家都在疯传：` + distorted + "！而且手段极其惊人！";
        } else if (bias === "paranoid") {
            distorted = `【绝密阴谋】听说背后的真正黑手其实是：` + distorted;
        } else {
            distorted = `【坊间闲话】我可是只跟你一个人说的啊，` + distorted;
        }

        chain.currentVersion = distorted;
        chain.credibility = Math.max(0.2, Number((chain.credibility * (1 - this.options.distortionRatePerHop)).toFixed(2)));
        chain.distortionLog.push({
            hop: chain.hopCount,
            carrier: carrierNPC.name || "路人NPC",
            distortedVersion: distorted
        });

        this.rumorChains.set(id, chain);
        return chain;
    }

    formatRumorPrompt() {
        if (this.rumorChains.size === 0) return "";
        const latest = Array.from(this.rumorChains.values()).slice(-2);
        const lines = ["【市井流言畸变·耳语传闻网络】"];
        for (const r of latest) {
            lines.push(`- 传闻 [传了${r.hopCount}棒, 可信度${(r.credibility * 100).toFixed(0)}%]: \"${r.currentVersion}\"`);
        }
        return lines.join("\n");
    }

    exportState() {
        return { rumorChains: Array.from(this.rumorChains.entries()) };
    }

    hydrateState(state) {
        if (state && Array.isArray(state.rumorChains)) {
            this.rumorChains = new Map(state.rumorChains);
        }
    }
}

export default RumorEntropyGossipDiffusion;