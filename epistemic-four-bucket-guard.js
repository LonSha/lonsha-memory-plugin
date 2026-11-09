/* ============================================================
 * epistemic-four-bucket-guard.js — 亲历/共历/传闻/禁区四桶认知视界物理隔离守卫
 * [v3.461.0 · 主观视界物理隔离与防全知穿帮装甲]
 * ============================================================ */

class EpistemicFourBucketGuard {
    constructor() {
        this.buckets = {
            experienced: new Map(), // 亲身历经
            shared: new Map(),      // 共同在场目击
            hearsay: new Map(),     // 听闻流言/转述
            forbidden: new Set()    // 绝密不可知/全知禁区
        };
        this.characterKnowledgeRegistry = new Map(); // charName -> Set(factIds)
    }

    assignFact(factId, factContent, bucketType = "hearsay", metadata = {}) {
        if (!["experienced", "shared", "hearsay", "forbidden"].includes(bucketType)) {
            bucketType = "hearsay";
        }
        if (bucketType === "forbidden") {
            this.buckets.forbidden.add(factId);
            return { factId, bucket: "forbidden", secured: true };
        }

        this.buckets[bucketType].set(factId, {
            id: factId,
            content: factContent,
            perspectiveHolder: metadata.perspectiveHolder || null,
            witnesses: Array.isArray(metadata.witnesses) ? metadata.witnesses : [],
            assignedAt: Date.now()
        });
        return { factId, bucket: bucketType, secured: true };
    }

    canCharacterKnow(characterName, factId) {
        if (!characterName || !factId) return { permitted: false, reason: "参数不合法" };
        
        // 禁区绝对不可知
        if (this.buckets.forbidden.has(factId)) {
            return {
                permitted: false,
                bucket: "forbidden",
                reason: `涉及全知全能帝重视角禁区，对角色「${characterName}」严格物理遮蔽。`
            };
        }

        // 亲历者权限校验
        if (this.buckets.experienced.has(factId)) {
            const fact = this.buckets.experienced.get(factId);
            if (fact.perspectiveHolder === characterName) {
                return { permitted: true, bucket: "experienced", data: fact };
            }
        }

        // 共同在场目击校验
        if (this.buckets.shared.has(factId)) {
            const fact = this.buckets.shared.get(factId);
            if (fact.witnesses.includes(characterName) || fact.perspectiveHolder === characterName) {
                return { permitted: true, bucket: "shared", data: fact };
            }
        }

        // 听闻/流言校验
        if (this.buckets.hearsay.has(factId)) {
            return { permitted: true, bucket: "hearsay", data: this.buckets.hearsay.get(factId) };
        }

        return {
            permitted: false,
            bucket: "unregistered",
            reason: `事实未在该角色的知识视界内登记，判定为角色未知盲区。`
        };
    }

    sanitizePromptInjection(perspectiveCharacter, rawFacts = []) {
        const filtered = [];
        const blocked = [];

        for (const fact of rawFacts) {
            const fid = fact.id || fact._id || String(fact);
            const access = this.canCharacterKnow(perspectiveCharacter, fid);
            if (access.permitted) {
                filtered.push({
                    ...fact,
                    _epistemicBucket: access.bucket,
                    _epistemicTag: access.bucket === "experienced" ? "【亲身经历】" : access.bucket === "shared" ? "【现场目击】" : "【道听途说】"
                });
            } else {
                blocked.push({ factId: fid, reason: access.reason });
            }
        }

        return {
            allowedFacts: filtered,
            blockedFacts: blocked,
            totalInput: rawFacts.length,
            isSecure: blocked.length > 0
        };
    }

    exportState() {
        return {
            experienced: Array.from(this.buckets.experienced.entries()),
            shared: Array.from(this.buckets.shared.entries()),
            hearsay: Array.from(this.buckets.hearsay.entries()),
            forbidden: Array.from(this.buckets.forbidden)
        };
    }

    hydrateState(state) {
        if (!state) return;
        if (Array.isArray(state.experienced)) this.buckets.experienced = new Map(state.experienced);
        if (Array.isArray(state.shared)) this.buckets.shared = new Map(state.shared);
        if (Array.isArray(state.hearsay)) this.buckets.hearsay = new Map(state.hearsay);
        if (Array.isArray(state.forbidden)) this.buckets.forbidden = new Set(state.forbidden);
    }
}
if (typeof globalThis !== "undefined") { globalThis.EpistemicFourBucketGuard = EpistemicFourBucketGuard; }
if (typeof window !== "undefined") { window.EpistemicFourBucketGuard = EpistemicFourBucketGuard; }
if (typeof module !== "undefined" && module.exports) { module.exports = EpistemicFourBucketGuard; }

/* ============================================================
 * [v3.461.0 接线修复] 本文件此前是 ESM 形态（export …），而宿主 extra_js、
 * 审计沙箱与 optional-engine-registry 的 require 全部按经典脚本加载 ——
 * `export` 在那里直接是语法错误，模块在真机上从未挂载成功。
 * 改回本仓统一的 UMD/IIFE 注册形态（同 ego-defense-mechanisms-engine.js）：
 * CJS 侧保留 module.exports 供测试与注册表的 require 使用，
 * 经典脚本侧把引擎类挂到全局，让取库口与编排器真的取得到。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
                root.EpistemicFourBucketGuard = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    return EpistemicFourBucketGuard;
}));
