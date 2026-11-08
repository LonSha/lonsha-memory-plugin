(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaBeliefSelfHealingDAG = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createState() {
        return {
            nodes: {}, // factId -> { id, text, valid: true }
            edges: []  // { parentId, childId, derivationType }
        };
    }

    function registerFactNode(state, factId, text) {
        state.nodes[factId] = {
            id: factId,
            text,
            valid: true,
            invalidatedAt: null,
            invalidationReason: null
        };
        return state.nodes[factId];
    }

    function addDerivationEdge(state, parentId, childId, derivationType = 'LOGICAL_INFERENCE') {
        state.edges.push({
            parentId,
            childId,
            derivationType
        });
    }

    /**
     * 当根事实被纠错或推翻时，沿着 DAG 级联让全部下游派生推论失效自愈
     */
    function invalidateFactCascading(state, rootFactId, reason = 'CORRECTED_BY_TRUTH') {
        const queue = [rootFactId];
        const invalidatedIds = [];

        while (queue.length > 0) {
            const currentId = queue.shift();
            const node = state.nodes[currentId];
            if (node && node.valid) {
                node.valid = false;
                node.invalidatedAt = Date.now();
                node.invalidationReason = reason;
                invalidatedIds.push(currentId);

                // 查找所有以 currentId 为父节点的子节点
                const children = state.edges
                    .filter(e => e.parentId === currentId)
                    .map(e => e.childId);
                queue.push(...children);
            }
        }

        return {
            rootFactId,
            invalidatedCount: invalidatedIds.length,
            invalidatedIds,
            summary: `已沿因果DAG级联失效 ${invalidatedIds.length} 条派生事实，杜绝历史错误推论滞留。`
        };
    }

    return {
        createState: createState,
        registerFactNode: registerFactNode,
        addDerivationEdge: addDerivationEdge,
        invalidateFactCascading: invalidateFactCascading
    };
}));