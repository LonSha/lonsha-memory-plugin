(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaBranchDiffMerger = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /**
     * 比对两条世界线/存档分支的记忆差异并支持挑拣合并
     */
    function diffBranches(branchA_facts = [], branchB_facts = []) {
        const idMapA = new Map(branchA_facts.map(f => [f.id, f]));
        const idMapB = new Map(branchB_facts.map(f => [f.id, f]));

        const common = [];
        const uniqueToA = [];
        const uniqueToB = [];

        for (const [id, factA] of idMapA.entries()) {
            if (idMapB.has(id)) {
                common.push({ id, factA, factB: idMapB.get(id) });
            } else {
                uniqueToA.push(factA);
            }
        }

        for (const [id, factB] of idMapB.entries()) {
            if (!idMapA.has(id)) {
                uniqueToB.push(factB);
            }
        }

        return {
            commonCount: common.length,
            uniqueToACount: uniqueToA.length,
            uniqueToBCount: uniqueToB.length,
            diff: { common, uniqueToA, uniqueToB }
        };
    }

    /**
     * 挑拣合并：从 B 分支将指定 ID 的记忆事实合并入 A 分支
     */
    function cherryPickMerge(branchA_facts = [], branchB_facts = [], selectedIds = []) {
        const merged = [...branchA_facts];
        const existingIds = new Set(branchA_facts.map(f => f.id));

        let addedCount = 0;
        for (const f of branchB_facts) {
            if (selectedIds.includes(f.id) && !existingIds.has(f.id)) {
                merged.push({
                    ...f,
                    mergedFromBranch: true,
                    mergedAt: Date.now()
                });
                addedCount++;
            }
        }

        return {
            success: true,
            addedCount,
            mergedTotal: merged.length,
            mergedFacts: merged
        };
    }

    return {
        diffBranches: diffBranches,
        cherryPickMerge: cherryPickMerge
    };
}));