/* ============================================================
 * meaning-evolution-map.js — [L9-X2 · 第九期规划]
 * 意义演化地图与多视角解释流（纯函数内核）
 * ------------------------------------------------------------
 * 【核心设计】
 *   地点、物件、语句与关系从普通概念演变为具有象征意义/冲突证据/纪念物：
 *     - 将意义解释独立为视角解释对象 (Perspective Interpretation)
 *     - 不直接篡改底层事实本体的所有权，支持多角色视角并列共存
 *     - 支持演化节点的反例与证伪，删除单个解释仅级联其衍生节点
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MeaningEvolutionMap = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function addMeaningInterpretation(mapData = {}, interpretation = {}) {
        const nodes = Array.isArray(mapData.nodes) ? mapData.nodes.slice() : [];
        if (!interpretation || !interpretation.targetId || !interpretation.actorId) {
            return {
                nodes,
                success: false,
                reason: 'missing_target_or_actor'
            };
        }

        const newNode = {
            id: interpretation.id || `meaning_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            targetId: interpretation.targetId,
            actorId: interpretation.actorId,
            symbolicRole: interpretation.symbolicRole || 'neutral', // promise, conflict_evidence, memorial, etc.
            narrativeMeaning: String(interpretation.narrativeMeaning || '').trim(),
            timestamp: interpretation.timestamp || Date.now(),
            counterExamples: Array.isArray(interpretation.counterExamples) ? interpretation.counterExamples : []
        };

        nodes.push(newNode);
        return {
            nodes,
            success: true,
            nodeId: newNode.id
        };
    }

    function getTargetMeaningsByActor(nodes = [], targetId, actorId) {
        const list = Array.isArray(nodes) ? nodes : [];
        return list.filter(n => n.targetId === targetId && (!actorId || n.actorId === actorId));
    }

    return {
        addMeaningInterpretation,
        getTargetMeaningsByActor
    };
}));