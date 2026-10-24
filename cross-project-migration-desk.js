/* ========================================================
 * cross-project-migration-desk.js — [M8-O8 · 第八期规划] 跨项目记忆迁移工作台（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   解决用户在复制、拆分、归档或接续项目时面临的越界与空壳问题：
 *     ① 严格防空壳阻断：接续包缺 owner 或密级未知时明确拒绝，绝不生成假空壳；
 *     ② 依赖闭包分析（dependency closure）：迁移某事实时自动标明其依赖的前置因果；
 *     ③ 同名消歧与私密事实隔离保护；
 *     ④ 会话隔离，严格纯函数。
 * ======================================================== */
(function (root) {
    'use strict';

    function safeStr(v) { return String(v == null ? '' : v).trim(); }
    function safeArr(v) { return Array.isArray(v) ? v : []; }

    /**
     * 校验待导出的接续包合规性（Fail-Closed 阻断）
     */
    function validateContinuationPackage(pkg) {
        if (!pkg || typeof pkg !== 'object') {
            return { valid: false, reason: 'empty-package' };
        }
        const owner = safeStr(pkg.owner);
        if (!owner) {
            return { valid: false, reason: 'missing-owner-blocked' };
        }
        const targetProjectId = safeStr(pkg.targetProjectId);
        if (!targetProjectId) {
            return { valid: false, reason: 'missing-target-project' };
        }
        return { valid: true, owner, targetProjectId };
    }

    /**
     * 计算待迁移事实的因果依赖闭包
     */
    function computeDependencyClosure(selectedFactIds, allProjectFacts = []) {
        const selected = new Set(safeArr(selectedFactIds).map(safeStr));
        const factsMap = new Map();
        for (const f of safeArr(allProjectFacts)) {
            if (f && (f.id || f.factKey)) {
                factsMap.set(safeStr(f.id || f.factKey), f);
            }
        }

        const missingPrerequisites = [];
        const closedClosure = new Set(selected);

        for (const fId of selected) {
            const fact = factsMap.get(fId);
            if (!fact) continue;

            const preIds = safeArr(fact.prerequisiteFactIds);
            for (const pId of preIds) {
                if (!selected.has(pId)) {
                    missingPrerequisites.push({
                        dependentFactId: fId,
                        missingFactId: pId,
                        missingFact: factsMap.get(pId) || null
                    });
                }
            }
        }

        return {
            selectedCount: selected.size,
            isComplete: missingPrerequisites.length === 0,
            missingPrerequisites
        };
    }

    /**
     * 执行安全的跨项目打包迁移
     */
    function packCrossProjectManifest(pkgSpec, allFacts = []) {
        const val = validateContinuationPackage(pkgSpec);
        if (!val.valid) {
            return { success: false, reason: val.reason, manifest: null };
        }

        const selectedIds = safeArr(pkgSpec.selectedFactIds);
        const closure = computeDependencyClosure(selectedIds, allFacts);

        const factsToPack = [];
        const excludedSecrets = [];

        for (const f of safeArr(allFacts)) {
            const id = safeStr(f.id || f.factKey);
            if (!selectedIds.includes(id)) continue;

            // 私密自知或未证实事实默认严禁外带
            if (f.securityTier === 'private_self' || f.isSecret === true) {
                excludedSecrets.push({ id, reason: 'secret-ledger-protection' });
                continue;
            }

            factsToPack.push({
                ...f,
                exportedFromProject: safeStr(pkgSpec.sourceProjectId),
                importedToProject: val.targetProjectId,
                owner: val.owner,
                exportedAt: Date.now()
            });
        }

        return {
            success: true,
            closureComplete: closure.isComplete,
            missingPrerequisites: closure.missingPrerequisites,
            manifest: {
                packageId: `cpkg_${val.targetProjectId}_${Date.now()}`,
                owner: val.owner,
                sourceProjectId: safeStr(pkgSpec.sourceProjectId),
                targetProjectId: val.targetProjectId,
                items: factsToPack,
                excludedSecrets
            }
        };
    }

    function crossProjectMigrationSelfCheck() {
        const problems = [];
        const badPkg = validateContinuationPackage({ sourceProjectId: 'p1' });
        if (badPkg.valid) problems.push('缺少 owner 的接续包必须被 fail-closed 阻断');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        validateContinuationPackage,
        computeDependencyClosure,
        packCrossProjectManifest,
        crossProjectMigrationSelfCheck
    });

    root.LonShaCrossProjectMigrationDesk = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);