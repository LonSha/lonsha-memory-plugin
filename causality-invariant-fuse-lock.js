(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaCausalityInvariantLock = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createState() {
        return {
            timelineAnchors: [], // { epochId, timestamp, physicalInvariants: { itemId: 'DESTROYED'|'SEALED'|'EXISTS' } }
            fuseViolations: []
        };
    }

    function registerAnchor(state, epochId, timestamp, physicalInvariants = {}) {
        const anchor = {
            epochId,
            timestamp,
            physicalInvariants: { ...physicalInvariants }
        };
        state.timelineAnchors.push(anchor);
        return anchor;
    }

    /**
     * 前摄因果校验：若后续章节声称使用了早已被确认为 DESTROYED 的物体，强制触发熔断
     */
    function verifyCausality(state, targetEpochId, itemId, intendedAction = 'USE') {
        const pastAnchor = state.timelineAnchors.find(a => a.physicalInvariants[itemId] === 'DESTROYED');
        if (pastAnchor) {
            const violation = {
                id: 'viol_' + Date.now(),
                targetEpochId,
                itemId,
                intendedAction,
                destroyedEpoch: pastAnchor.epochId,
                timestamp: Date.now()
            };
            state.fuseViolations.push(violation);
            return {
                allowed: false,
                fused: true,
                reason: `【因果不变量主动熔断】物品 [${itemId}] 已在 [${pastAnchor.epochId}] 中被明确销毁，绝不可在后续 [${targetEpochId}] 中作为完好实物复现！`
            };
        }

        return {
            allowed: true,
            fused: false
        };
    }

    return {
        createState: createState,
        registerAnchor: registerAnchor,
        verifyCausality: verifyCausality
    };
}));