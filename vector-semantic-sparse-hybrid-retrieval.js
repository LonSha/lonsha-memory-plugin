/* ============================================================
 * vector-semantic-sparse-hybrid-retrieval.js — [v3.461.0 · 第十八期全新生产基座]
 * 稠密向量与稀疏语义混合检索优化器 (Dense-Sparse Hybrid Retrieval & RRF)
 * ------------------------------------------------------------
 * 【核心机制与工业级搜索】
 * 突破单一向量检索对罕见专有名词、暗号、缩写失效的痛点：
 *   结合 BM25 词频稀疏匹配与语义向量稠密相似度，
 *   运用倒数秩融合算法 (Reciprocal Rank Fusion, RRF: 1 / (60 + rank))，
 *   对召回结果进行重排序，大幅降低幻觉召回。
 * ============================================================ */

class VectorSemanticSparseHybridRetrieval {
    constructor(options = {}) {
        this.options = Object.assign({
            rrfConstant: 60,
            sparseWeight: 0.45,
            denseWeight: 0.55
        }, options);
    }

    /**
     * 计算简易词法匹配得分 (BM25 近似稀疏得分)
     */
    calculateSparseScore(query = "", text = "") {
        const qTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (qTerms.length === 0) return 0;
        const lowerDoc = text.toLowerCase();
        let matches = 0;
        for (const term of qTerms) {
            if (lowerDoc.includes(term)) matches++;
        }
        return matches / qTerms.length;
    }

    /**
     * 倒数秩融合 (RRF) 算法
     * @param {Array} sparseRankedList [{ id, text, score }] 按稀疏得分降序
     * @param {Array} denseRankedList [{ id, text, score }] 按稠密向量得分降序
     */
    fuseRRF(sparseRankedList = [], denseRankedList = []) {
        const k = this.options.rrfConstant;
        const scoreMap = new Map(); // id -> { id, item, rrfScore, sparseRank, denseRank }

        sparseRankedList.forEach((item, index) => {
            const rank = index + 1;
            const rrf = 1 / (k + rank);
            scoreMap.set(item.id, {
                id: item.id,
                item,
                rrfScore: rrf * this.options.sparseWeight,
                sparseRank: rank,
                denseRank: null
            });
        });

        denseRankedList.forEach((item, index) => {
            const rank = index + 1;
            const rrf = 1 / (k + rank);
            if (scoreMap.has(item.id)) {
                const entry = scoreMap.get(item.id);
                entry.rrfScore += rrf * this.options.denseWeight;
                entry.denseRank = rank;
            } else {
                scoreMap.set(item.id, {
                    id: item.id,
                    item,
                    rrfScore: rrf * this.options.denseWeight,
                    sparseRank: null,
                    denseRank: rank
                });
            }
        });

        return Array.from(scoreMap.values())
            .sort((a, b) => b.rrfScore - a.rrfScore)
            .map(entry => Object.assign({}, entry.item, {
                hybridScore: entry.rrfScore,
                sparseRank: entry.sparseRank,
                denseRank: entry.denseRank
            }));
    }
}

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
                root.VectorSemanticSparseHybridRetrieval = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    return VectorSemanticSparseHybridRetrieval;
}));
