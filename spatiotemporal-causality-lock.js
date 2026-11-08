/* ============================================================
 * spatiotemporal-causality-lock.js — [v3.460.0 · V21-L2]
 * 全时态因果一致性验证与时空锁闭机制 (Spatiotemporal Causality Lock)
 * ------------------------------------------------------------
 * 解决倒叙叙事、死者发言、未来事实穿梭等时空逻辑 Bug：
 * 1. 绝对时间轴与相对叙事时钟 DAG 锁（DAG Timeline Lock）
 * 2. 事实成立前提依赖校验（Prerequisite Causal Proof）
 * 3. 幽灵行为与超前因果阻断（Anachronism Interceptor）
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaCausalityLock = factory();
        root.SpatiotemporalCausalityLock = root.LonShaCausalityLock;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function createCausalityLockState() {
        return {
            version: VERSION,
            timelineEvents: new Map(), // eventId -> eventRecord
            causalDependencies: [],    // [{ prerequisiteId, dependentId, reason }]
            characterLifespans: new Map(), // characterName -> { bornAt, deceasedAt, status }
            updatedAt: Date.now()
        };
    }

    function recordTimelineEvent(state, event = {}) {
        if (!state || !state.timelineEvents) return null;
        const id = String(event.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
        const record = {
            id,
            timestamp: Number(event.timestamp) || Date.now(),
            storyEpoch: String(event.storyEpoch || "current"),
            actor: String(event.actor || "narrator").trim(),
            action: String(event.action || "").trim(),
            description: String(event.description || "").trim(),
            prerequisites: Array.isArray(event.prerequisites) ? event.prerequisites : [],
            createdAt: Date.now()
        };
        state.timelineEvents.set(id, record);
        if (record.prerequisites.length > 0) {
            for (const preId of record.prerequisites) {
                state.causalDependencies.push({ prerequisiteId: preId, dependentId: id });
            }
        }
        state.updatedAt = Date.now();
        return record;
    }

    function validateCausalConsistency(state, candidateEvent = {}) {
        if (!state || !state.timelineEvents) return { valid: false, violations: ["invalid_state"] };
        const violations = [];
        const actor = String(candidateEvent.actor || "").trim();
        const candTime = Number(candidateEvent.timestamp) || Date.now();

        // 1. 生命状态校验 (避免死者行动 Bug)
        if (actor && state.characterLifespans && state.characterLifespans.has(actor)) {
            const span = state.characterLifespans.get(actor);
            if (span.deceasedAt && candTime > span.deceasedAt) {
                violations.push(`post_mortem_action: character ${actor} died at ${span.deceasedAt}, cannot act at ${candTime}`);
            }
        }

        // 2. 前置依赖时间倒错校验
        const prereqs = Array.isArray(candidateEvent.prerequisites) ? candidateEvent.prerequisites : [];
        for (const preId of prereqs) {
            const preEvt = state.timelineEvents.get(preId);
            if (!preEvt) {
                violations.push(`missing_prerequisite: event requires ${preId} which is not established`);
            } else if (preEvt.timestamp > candTime) {
                violations.push(`temporal_paradox: prerequisite ${preId} (${preEvt.timestamp}) occurs after candidate (${candTime})`);
            }
        }

        return {
            valid: violations.length === 0,
            violations
        };
    }

    function setCharacterLifespan(state, actor, lifespan = {}) {
        if (!state || !state.characterLifespans) return false;
        const name = String(actor || "").trim();
        if (!name) return false;
        state.characterLifespans.set(name, {
            actor: name,
            bornAt: lifespan.bornAt || null,
            deceasedAt: lifespan.deceasedAt || null,
            status: lifespan.deceasedAt ? "deceased" : "alive",
            updatedAt: Date.now()
        });
        state.updatedAt = Date.now();
        return true;
    }

    return {
        VERSION,
        createCausalityLockState,
        recordTimelineEvent,
        validateCausalConsistency,
        setCharacterLifespan
    };
}));
