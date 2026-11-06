/* ============================================================
 * hypergraph-causal-backtracking-hub.js — [v3.458.0 · V20-L2]
 * 超图多跳联合因果推演拓扑中枢 (Hypergraph Causal Backtracking Hub)
 * ------------------------------------------------------------
 * 【核心设计】
 *   突破经典知识图谱仅支持点对点（Binary Edge）二元关联的局限，
 *   在长程网状叙事中构建「超边（Hyperedges）」多维因果拓扑：
 *   1. 多因一果（Many-to-One / Conjoint Causes）：
 *      多个独立条件（如：暴雨封山 + 密函被截 + 误信谗言）联合诱发唯一重大决裂；
 *   2. 一因多果（One-to-Many Cascade Effects）：
 *      单次核心事件（如：老城主暴毙）辐射引发多个阵营分支的平行演变；
 *   3. 拓扑回溯推演（Topological Backtracking）：
 *      给定当前剧情困局或矛盾状态，沿超边反向回溯完整的必要原因闭包（Causal Closure），
 *      输出结构化因果证据链，防止模型丢失长线伏笔源头。
 * ============================================================ */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaHypergraphCausalHub = factory();
        root.HypergraphCausalBacktrackingHub = root.LonShaHypergraphCausalHub;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const VERSION = '3.458.0';

    /**
     * 创建纯净超图因果状态
     */
    function createState() {
        return {
            version: VERSION,
            hyperedges: [],     // [{ id, name, type: 'conjoint_causes'|'cascade_effects'|'complex_chain', causes: [], effects: [], weight, floor, verified, rationale }]
            nodes: {},          // { [nodeId]: { id, label, floor, sourceBook, metadata } }
            totalBacktracks: 0,
            updatedAt: Date.now()
        };
    }

    /**
     * 宽容水合状态
     */
    function hydrateState(raw = {}) {
        if (!raw || typeof raw !== 'object') return createState();
        return {
            version: VERSION,
            hyperedges: Array.isArray(raw.hyperedges) ? raw.hyperedges.slice() : [],
            nodes: (raw.nodes && typeof raw.nodes === 'object') ? { ...raw.nodes } : {},
            totalBacktracks: Number(raw.totalBacktracks) || 0,
            updatedAt: Number(raw.updatedAt) || Date.now()
        };
    }

    /**
     * 注册因果节点
     */
    function registerNode(state, node = {}) {
        if (!state || !state.nodes) return null;
        const id = String(node.id || `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
        const entry = {
            id,
            label: String(node.label || node.text || '').trim(),
            floor: Number(node.floor) || null,
            sourceBook: String(node.sourceBook || 'general'),
            character: String(node.character || '').trim()
        };
        state.nodes[id] = entry;
        state.updatedAt = Date.now();
        return entry;
    }

    /**
     * 注册超边（支持多因一果、一因多果）
     */
    function registerHyperedge(state, edge = {}) {
        if (!state || !Array.isArray(state.hyperedges)) return null;
        const id = String(edge.id || `hedge_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
        const causes = Array.isArray(edge.causes) ? edge.causes.map(String).filter(Boolean) : [];
        const effects = Array.isArray(edge.effects) ? edge.effects.map(String).filter(Boolean) : [];
        if (!causes.length && !effects.length) return null;

        const entry = {
            id,
            name: String(edge.name || '因果汇聚').trim(),
            type: edge.type || (causes.length > 1 ? 'conjoint_causes' : 'cascade_effects'),
            causes,
            effects,
            weight: Math.max(0.1, Math.min(1.0, Number(edge.weight) || 0.8)),
            floor: Number(edge.floor) || null,
            verified: edge.verified !== false,
            rationale: String(edge.rationale || '').trim(),
            createdAt: Date.now()
        };
        state.hyperedges.push(entry);
        state.updatedAt = Date.now();
        return entry;
    }

    /**
     * 沿超边反向回溯因果链（Backtracking）
     * @param {Object} state 超图状态
     * @param {String} targetEffectId 目标结果节点 ID 或关键词匹配
     * @param {Number} maxDepth 最大回溯跳数
     * @returns {Object} { rootCauses, causalChain, directHyperedges, rationaleSummary }
     */
    function backtrackCausalClosure(state = {}, targetEffectId = '', maxDepth = 3) {
        state.totalBacktracks = (state.totalBacktracks || 0) + 1;
        const visitedEdges = new Set();
        const visitedNodes = new Set();
        const rootCauses = [];
        const matchedHyperedges = [];
        const causalChain = [];

        function traceBack(currentEffect, depth) {
            if (depth > maxDepth) return;
            visitedNodes.add(currentEffect);

            // 寻找以此为 effect 的超边
            const incomingEdges = (state.hyperedges || []).filter(h => 
                !visitedEdges.has(h.id) && (h.effects.includes(currentEffect) || h.effects.some(e => e.includes(currentEffect)))
            );

            for (const edge of incomingEdges) {
                visitedEdges.add(edge.id);
                matchedHyperedges.push(edge);
                causalChain.push({
                    depth,
                    hyperedgeName: edge.name,
                    causes: edge.causes,
                    effects: edge.effects,
                    rationale: edge.rationale
                });

                for (const causeId of edge.causes) {
                    if (!visitedNodes.has(causeId)) {
                        traceBack(causeId, depth + 1);
                        rootCauses.push(causeId);
                    }
                }
            }
        }

        traceBack(targetEffectId, 1);

        const uniqueRootCauses = Array.from(new Set(rootCauses));
        let rationaleSummary = '';
        if (matchedHyperedges.length > 0) {
            const steps = matchedHyperedges.map(e => `[${e.name}] 由【${e.causes.join(' + ')}】联合导致【${e.effects.join(' & ')}】（依据：${e.rationale || '前因必然'}）`);
            rationaleSummary = `【超图因果推演链】\n${steps.join('\n')}`;
        }

        return {
            targetEffectId,
            rootCauses: uniqueRootCauses,
            matchedHyperedges,
            causalChain,
            rationaleSummary
        };
    }

    return {
        VERSION,
        createState,
        hydrateState,
        registerNode,
        registerHyperedge,
        backtrackCausalClosure
    };
}));