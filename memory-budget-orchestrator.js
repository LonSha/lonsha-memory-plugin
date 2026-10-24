/* ========================================================
 * memory-budget-orchestrator.js — [M8-O5 · 第八期规划] 记忆预算编排（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   解决生成前用户不知道哪些记忆被带入、哪些被挤出的问题：
 *     ① 四层预算分层：mandatory（必需层）/ optional（可选层）/
 *        conflict（冲突待决）/ unknown（未知留白）；
 *     ② 用户主动锁定材料（lockedItems），锁定项绝不被自动淘汰；
 *     ③ 严格按照 token/字符预算编排，超额时明确列出牺牲项与原因；
 *     ④ 会话隔离，严格纯函数。
 * ======================================================== */
(function (root) {
    'use strict';

    const BUDGET_TIERS = Object.freeze({
        MANDATORY: 'mandatory',
        OPTIONAL: 'optional',
        CONFLICT: 'conflict',
        UNKNOWN: 'unknown'
    });

    function safeStr(v) { return String(v == null ? '' : v).trim(); }
    function safeArr(v) { return Array.isArray(v) ? v : []; }

    function normalizeBudgetState(raw) {
        if (!raw || typeof raw !== 'object') {
            return {
                lockedMaterials: {}, // id -> { id, reason, lockedAt }
                excludedMaterials: {}, // id -> { id, reason, excludedAt }
                updatedAt: Date.now()
            };
        }
        return {
            lockedMaterials: (raw.lockedMaterials && typeof raw.lockedMaterials === 'object') ? { ...raw.lockedMaterials } : {},
            excludedMaterials: (raw.excludedMaterials && typeof raw.excludedMaterials === 'object') ? { ...raw.excludedMaterials } : {},
            updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
        };
    }

    function lockMaterial(state, materialId, reason = '') {
        const s = normalizeBudgetState(state);
        const mId = safeStr(materialId);
        if (!mId) return { success: false, reason: 'invalid-id', state: s };

        return {
            success: true,
            state: {
                ...s,
                lockedMaterials: {
                    ...s.lockedMaterials,
                    [mId]: { id: mId, reason: safeStr(reason), lockedAt: Date.now() }
                },
                updatedAt: Date.now()
            }
        };
    }

    function unlockMaterial(state, materialId) {
        const s = normalizeBudgetState(state);
        const mId = safeStr(materialId);
        const locked = { ...s.lockedMaterials };
        delete locked[mId];

        return {
            success: true,
            state: {
                ...s,
                lockedMaterials: locked,
                updatedAt: Date.now()
            }
        };
    }

    function excludeMaterial(state, materialId, reason = '') {
        const s = normalizeBudgetState(state);
        const mId = safeStr(materialId);
        if (!mId) return { success: false, reason: 'invalid-id', state: s };

        return {
            success: true,
            state: {
                ...s,
                excludedMaterials: {
                    ...s.excludedMaterials,
                    [mId]: { id: mId, reason: safeStr(reason), excludedAt: Date.now() }
                },
                updatedAt: Date.now()
            }
        };
    }

    /**
     * 编排预算：对候选材料进行分层筛选，执行锁定保护与超限裁剪
     */
    function orchestrateMemoryBudget(materials, maxBudgetChars, state = null, options = {}) {
        const s = normalizeBudgetState(state);
        const budget = typeof maxBudgetChars === 'number' && maxBudgetChars > 0 ? maxBudgetChars : 2000;
        const list = safeArr(materials);
        const perspectiveChar = safeStr(options.perspectiveCharacter);

        const admitted = [];
        const sacrificed = [];
        let totalChars = 0;

        // 1. 过滤排除项与视角隔离项
        const available = [];
        for (const item of list) {
            if (!item || typeof item !== 'object') continue;
            const id = safeStr(item.id);

            // 用户明确排除
            if (s.excludedMaterials[id]) {
                sacrificed.push({ item, reason: 'user-excluded' });
                continue;
            }

            // 视角知情隔离
            if (perspectiveChar && Array.isArray(item.knownBy) && item.knownBy.length > 0) {
                if (!item.knownBy.includes(perspectiveChar)) {
                    sacrificed.push({ item, reason: 'character-unaware' });
                    continue;
                }
            }

            available.push(item);
        }

        // 2. 分级：锁定项和 MANDATORY 优先
        const mandatoryList = [];
        const optionalList = [];

        for (const item of available) {
            const id = safeStr(item.id);
            const isLocked = Boolean(s.lockedMaterials[id]);
            const tier = safeStr(item.tier) || BUDGET_TIERS.OPTIONAL;

            if (isLocked || tier === BUDGET_TIERS.MANDATORY) {
                mandatoryList.push({ ...item, isLocked, effectiveTier: BUDGET_TIERS.MANDATORY });
            } else {
                optionalList.push({ ...item, isLocked: false, effectiveTier: tier });
            }
        }

        // 必需层直接编入（若必需层自身超预算，依然保住锁定项）
        for (const item of mandatoryList) {
            const contentLen = safeStr(item.content).length;
            admitted.push(item);
            totalChars += contentLen;
        }

        // 3. 可选层按权重/分数填补剩余预算
        optionalList.sort((a, b) => (b.score || 0) - (a.score || 0));

        for (const item of optionalList) {
            const contentLen = safeStr(item.content).length;
            if (totalChars + contentLen <= budget) {
                admitted.push(item);
                totalChars += contentLen;
            } else {
                sacrificed.push({
                    item,
                    reason: 'budget-exhausted',
                    requiredChars: contentLen,
                    remainingChars: Math.max(0, budget - totalChars)
                });
            }
        }

        return {
            maxBudgetChars: budget,
            totalCandidates: list.length,
            admittedCount: admitted.length,
            sacrificedCount: sacrificed.length,
            totalChars,
            admitted,
            sacrificed
        };
    }

    function memoryBudgetSelfCheck() {
        const problems = [];
        if (Object.keys(BUDGET_TIERS).length !== 4) problems.push('BUDGET_TIERS 必须恰好为 4 种级别');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        BUDGET_TIERS,
        normalizeBudgetState,
        lockMaterial,
        unlockMaterial,
        excludeMaterial,
        orchestrateMemoryBudget,
        memoryBudgetSelfCheck
    });

    root.LonShaMemoryBudgetOrchestrator = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);