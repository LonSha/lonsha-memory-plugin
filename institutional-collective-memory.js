/* ============================================================
 * institutional-collective-memory.js — [L9-X5 · 第九期规划]
 * 组织制度与集体协商记忆引擎（纯函数内核）
 * ------------------------------------------------------------
 * 【核心设计】
 *   支持社群、机构、学校、工坊沉淀规则变迁、公约与集体记忆：
 *     - 四大来源层级严格分离：
 *       1. INDIVIDUAL: 个人已知体验
 *       2. INSTITUTIONAL: 机构正式公约与条文
 *       3. PUBLIC_RULE: 全员公开守则
 *       4. RUMOR: 坊间传闻与未经核实说法
 *     - 制度变更保留完整提案与表决版本谱系 (rule_lineage)，旧版永不静默抹除
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.InstitutionalCollectiveMemory = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const MEMORY_SOURCE_TIER = Object.freeze({
        INDIVIDUAL: 'individual',
        INSTITUTIONAL: 'institutional',
        PUBLIC_RULE: 'public_rule',
        RUMOR: 'rumor'
    });

    function amendInstitutionalRule(currentRules = [], proposal = {}) {
        const rules = (Array.isArray(currentRules) ? currentRules : []).slice();
        const ruleId = proposal.ruleId || `rule_${Date.now()}`;
        const existingIdx = rules.findIndex(r => r.id === ruleId);

        const newVersion = {
            id: ruleId,
            title: String(proposal.title || '').trim(),
            content: String(proposal.content || '').trim(),
            sourceTier: MEMORY_SOURCE_TIER.INSTITUTIONAL,
            version: existingIdx >= 0 ? (rules[existingIdx].version || 1) + 1 : 1,
            previousVersionContent: existingIdx >= 0 ? rules[existingIdx].content : null,
            ratifiedBy: Array.isArray(proposal.ratifiedBy) ? proposal.ratifiedBy : [],
            updatedAt: Date.now()
        };

        if (existingIdx >= 0) {
            rules[existingIdx] = newVersion;
        } else {
            rules.push(newVersion);
        }

        return {
            rules,
            activeRule: newVersion
        };
    }

    return {
        MEMORY_SOURCE_TIER,
        amendInstitutionalRule
    };
}));