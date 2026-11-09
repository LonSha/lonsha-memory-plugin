/* ============================================================
 * hierarchical-compaction-ledger.js — 记忆演化金字塔索引压缩与无损反向溯源账本
 * [v3.461.0 · 工业级多层金字塔聚类折叠与溯源链]
 * ============================================================ */

class HierarchicalCompactionLedger {
    constructor(options = {}) {
        this.options = Object.assign({
            l1ToL2ClusterSize: 4,
            l2ToL3ClusterSize: 3,
            maxRetentionLayers: 3
        }, options);
        
        this.layers = {
            rawL1: new Map(),   // id -> { text, metadata, timestamp, accessCount }
            sceneL2: new Map(), // sceneId -> { summary, rawFactIds: [], compactedAt }
            epochL3: new Map()  // epochId -> { grandSummary, sceneIds: [], compactedAt }
        };
        this.parentPointers = new Map(); // childId -> parentId
    }

    recordRawFact(id, text, metadata = {}) {
        if (!id || !text) return false;
        this.layers.rawL1.set(id, {
            id,
            text: String(text).trim(),
            metadata: metadata && typeof metadata === "object" ? metadata : {},
            timestamp: Date.now(),
            accessCount: 1
        });
        return true;
    }

    compactToScene(sceneId, summary, rawFactIds = []) {
        if (!sceneId || !summary || !Array.isArray(rawFactIds) || rawFactIds.length === 0) return false;
        
        // 校验底层事实存在性
        const validRawIds = rawFactIds.filter(fid => this.layers.rawL1.has(fid));
        if (validRawIds.length === 0) return false;

        this.layers.sceneL2.set(sceneId, {
            id: sceneId,
            summary: String(summary).trim(),
            rawFactIds: validRawIds,
            compactedAt: Date.now()
        });

        for (const fid of validRawIds) {
            this.parentPointers.set(fid, sceneId);
        }
        return true;
    }

    compactToEpoch(epochId, grandSummary, sceneIds = []) {
        if (!epochId || !grandSummary || !Array.isArray(sceneIds) || sceneIds.length === 0) return false;
        
        const validSceneIds = sceneIds.filter(sid => this.layers.sceneL2.has(sid));
        if (validSceneIds.length === 0) return false;

        this.layers.epochL3.set(epochId, {
            id: epochId,
            grandSummary: String(grandSummary).trim(),
            sceneIds: validSceneIds,
            compactedAt: Date.now()
        });

        for (const sid of validSceneIds) {
            this.parentPointers.set(sid, epochId);
        }
        return true;
    }

    traceBackOrigins(summaryId) {
        if (!summaryId) return { level: "unknown", origins: [], rawCount: 0 };

        if (this.layers.epochL3.has(summaryId)) {
            const epoch = this.layers.epochL3.get(summaryId);
            const allRaw = [];
            const scenes = [];
            for (const sid of epoch.sceneIds) {
                const sc = this.layers.sceneL2.get(sid);
                if (sc) {
                    scenes.push({ id: sc.id, summary: sc.summary });
                    for (const rId of sc.rawFactIds) {
                        const rf = this.layers.rawL1.get(rId);
                        if (rf) allRaw.push(rf);
                    }
                }
            }
            return {
                level: "epochL3",
                summaryText: epoch.grandSummary,
                subScenes: scenes,
                rawFacts: allRaw,
                rawCount: allRaw.length,
                compressionRatio: Number((allRaw.length / Math.max(1, 1 + scenes.length)).toFixed(2))
            };
        }

        if (this.layers.sceneL2.has(summaryId)) {
            const sc = this.layers.sceneL2.get(summaryId);
            const allRaw = [];
            for (const rId of sc.rawFactIds) {
                const rf = this.layers.rawL1.get(rId);
                if (rf) allRaw.push(rf);
            }
            return {
                level: "sceneL2",
                summaryText: sc.summary,
                rawFacts: allRaw,
                rawCount: allRaw.length,
                compressionRatio: Number((allRaw.length / 1).toFixed(2))
            };
        }

        return { level: "unknown", origins: [], rawCount: 0 };
    }

    exportState() {
        return {
            rawL1: Array.from(this.layers.rawL1.entries()),
            sceneL2: Array.from(this.layers.sceneL2.entries()),
            epochL3: Array.from(this.layers.epochL3.entries()),
            parentPointers: Array.from(this.parentPointers.entries())
        };
    }

    hydrateState(state) {
        if (!state || typeof state !== "object") return;
        if (Array.isArray(state.rawL1)) this.layers.rawL1 = new Map(state.rawL1);
        if (Array.isArray(state.sceneL2)) this.layers.sceneL2 = new Map(state.sceneL2);
        if (Array.isArray(state.epochL3)) this.layers.epochL3 = new Map(state.epochL3);
        if (Array.isArray(state.parentPointers)) this.parentPointers = new Map(state.parentPointers);
    }
}
if (typeof globalThis !== "undefined") { globalThis.HierarchicalCompactionLedger = HierarchicalCompactionLedger; }
if (typeof window !== "undefined") { window.HierarchicalCompactionLedger = HierarchicalCompactionLedger; }
if (typeof module !== "undefined" && module.exports) { module.exports = HierarchicalCompactionLedger; }

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
                root.HierarchicalCompactionLedger = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    return HierarchicalCompactionLedger;
}));
