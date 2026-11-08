/* ============================================================
 * intersubjective-parallax-isolation.js — [v3.460.0 · V21-L5]
 * 多角色主体间性与非对称情报隔绝矩阵 (Intersubjective Parallax Isolation)
 * ------------------------------------------------------------
 * 解决多 NPC/群聊场景中记忆串味、知晓边界混乱痛点：
 * 1. 角色私有知识库严密沙盒隔绝 (Private Knowledge Sandbox)
 * 2. 公共知识 vs 猜测/传闻非对称标记 (Public vs Inferred vs Rumor)
 * 3. 跨角色视差认知矩阵与盲区探测 (Parallax Asymmetry Matrix)
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaParallaxIsolation = factory();
        root.IntersubjectiveParallaxIsolation = root.LonShaParallaxIsolation;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function createParallaxIsolationState() {
        return {
            version: VERSION,
            characterDossiers: new Map(), // actorName -> { knownFacts: Set, suspectedFacts: Set, blindSpots: Set }
            sharedPublicFacts: new Set(),
            updatedAt: Date.now()
        };
    }

    function ensureActorDossier(state, actor) {
        const name = String(actor || "").trim();
        if (!name) return null;
        if (!state.characterDossiers.has(name)) {
            state.characterDossiers.set(name, {
                actor: name,
                knownFacts: new Set(),
                suspectedFacts: new Set(),
                blindSpots: new Set()
            });
        }
        return state.characterDossiers.get(name);
    }

    function grantFactKnowledge(state, actor, factId, mode = "known") {
        if (!state || !state.characterDossiers) return false;
        const dossier = ensureActorDossier(state, actor);
        if (!dossier) return false;
        const fid = String(factId || "").trim();
        if (!fid) return false;

        dossier.blindSpots.delete(fid);
        if (mode === "suspected") {
            dossier.suspectedFacts.add(fid);
        } else {
            dossier.knownFacts.add(fid);
        }
        state.updatedAt = Date.now();
        return true;
    }

    function checkActorKnowledge(state, actor, factId) {
        if (!state || !state.characterDossiers) return { known: false, mode: "unaware" };
        const fid = String(factId || "").trim();
        if (state.sharedPublicFacts && state.sharedPublicFacts.has(fid)) {
            return { known: true, mode: "public_common" };
        }
        const dossier = state.characterDossiers.get(String(actor || "").trim());
        if (!dossier) return { known: false, mode: "unaware" };

        if (dossier.knownFacts.has(fid)) return { known: true, mode: "private_known" };
        if (dossier.suspectedFacts.has(fid)) return { known: true, mode: "suspected" };
        return { known: false, mode: "blind_spot" };
    }

    return {
        VERSION,
        createParallaxIsolationState,
        grantFactKnowledge,
        checkActorKnowledge
    };
}));
