/* ============================================================
 * multi-agent-spatial-temporal-resolver.js — 多角色在场指代消歧与时空连续性强校验器
 * [v3.461.0 · 实体锚定、代词消歧与时空拓扑连续性防线]
 * ============================================================ */

export class MultiAgentSpatialTemporalResolver {
    constructor(options = {}) {
        this.options = Object.assign({
            maxTeleportationAllowanceSec: 180,
            defaultScene: "当前主场景"
        }, options);
        
        this.entityLocations = new Map(); // entityName -> { location, lastSeenTimestamp, coordinates }
        this.aliasMap = new Map();         // alias -> canonicalName
        this.socialAffinityMatrix = new Map(); // key `${a}-${b}` -> affinity (0~1)
    }

    registerEntity(canonicalName, currentLocation = null, aliases = []) {
        if (!canonicalName || typeof canonicalName !== "string") return;
        const name = canonicalName.trim();
        this.entityLocations.set(name, {
            location: currentLocation || this.options.defaultScene,
            lastSeenTimestamp: Date.now(),
            interactionCount: 0
        });
        
        for (const a of aliases) {
            if (typeof a === "string" && a.trim()) {
                this.aliasMap.set(a.trim().toLowerCase(), name);
            }
        }
    }

    resolvePronoun(pronoun, speaker, contextEntities = []) {
        const p = (pronoun || "").trim();
        if (!p) return "未知实体";
        
        if (p === "我" || p === "本人" || p === "在下") {
            return speaker || "当前第一人称";
        }
        if (p === "你" || p === "您") {
            const others = contextEntities.filter(e => e !== speaker);
            return others[0] || "交互对话方";
        }
        if (["他", "她", "对方", "那人", "此人"].includes(p)) {
            const others = contextEntities.filter(e => e !== speaker);
            if (others.length === 1) return others[0];
            if (others.length > 1) return `[多候选消歧: ${others.join(" / ")}]`;
            return "第三人在场者";
        }
        
        return this.aliasMap.get(p.toLowerCase()) || p;
    }

    verifySpatialContinuity(entity, targetLocation, elapsedMinutes = 5) {
        const record = this.entityLocations.get(entity);
        if (!record) {
            return { valid: true, teleportationRisk: 0, reason: "新登场实体首次记录时空坐标" };
        }
        
        const isSame = record.location === targetLocation;
        if (isSame) {
            record.lastSeenTimestamp = Date.now();
            return { valid: true, teleportationRisk: 0, reason: "原地连续在场" };
        }
        
        // 检查移动时间合理性
        const isFastMoveReasonable = elapsedMinutes >= 10 || targetLocation === "邻近走廊" || targetLocation === "同室隔间";
        if (!isFastMoveReasonable && targetLocation !== this.options.defaultScene) {
            return {
                valid: false,
                teleportationRisk: 0.90,
                previousLocation: record.location,
                attemptedLocation: targetLocation,
                reason: `检测到时空瞬移穿帮：${entity} 在仅 ${elapsedMinutes} 分钟内从「${record.location}」突现至「${targetLocation}」，缺少路径行进过渡描写。`
            };
        }
        
        record.location = targetLocation;
        record.lastSeenTimestamp = Date.now();
        return { valid: true, teleportationRisk: 0.15, reason: "空间行进合理更替" };
    }

    formatDisambiguationDirectives(perspectiveSpeaker, presentEntities = []) {
        const lines = ["【多维防混淆与实体指代纪律】"];
        for (const ent of presentEntities) {
            const loc = this.entityLocations.get(ent)?.location || "同室在场";
            lines.push(`- 实体「${ent}」位于【${loc}】，代词必须精准定向，严防多角色对话张冠李戴。`);
        }
        return lines.join("\n");
    }

    exportState() {
        return {
            entityLocations: Array.from(this.entityLocations.entries()),
            aliasMap: Array.from(this.aliasMap.entries())
        };
    }

    hydrateState(state) {
        if (!state) return;
        if (Array.isArray(state.entityLocations)) this.entityLocations = new Map(state.entityLocations);
        if (Array.isArray(state.aliasMap)) this.aliasMap = new Map(state.aliasMap);
    }
}
if (typeof globalThis !== "undefined") { globalThis.MultiAgentSpatialTemporalResolver = MultiAgentSpatialTemporalResolver; }
if (typeof window !== "undefined") { window.MultiAgentSpatialTemporalResolver = MultiAgentSpatialTemporalResolver; }
if (typeof module !== "undefined" && module.exports) { module.exports = MultiAgentSpatialTemporalResolver; }
export default MultiAgentSpatialTemporalResolver;