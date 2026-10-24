/* ========================================================
 * perspective-preview.js — [M7-O4 · 第七期规划] 记忆权限与视角预览内核（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   作者把私密经历写给叙述者或单个角色，担心被其他角色、摘要或跨项目导出看到；
 *   以往权限判定缺失或黑盒化，导致私密信息意外泄漏给不相关角色。
 *   记忆权限与视角预览在写入和导出前提供显式的知情边界与遮蔽判定：
 *     ① 三类事实密级：私密自知(private_self) / 角色独知(character_exclusive) / 公开(public_known)；
 *     ② 视角预览(evaluateFactPerspective)：明确汇报该角色是否知情(known)、是否遮蔽(masked)、
 *        以及是否允许跨分支/跨项目外带(exportable)；
 *     ③ 默认阻断原则(fail-closed)：无法判定的条目一律禁止外带并标示为未证实；
 *     ④ 保持历史恒定：新授权调整不篡改历史当下的已知视角。
 * ======================================================== */
(function (root) {
    'use strict';

    /** 事实密级分类 */
    const SECURITY_TIERS = Object.freeze({
        PRIVATE_SELF: 'private_self',               // 私密自知（仅本人/叙述者知情）
        CHARACTER_EXCLUSIVE: 'character_exclusive', // 角色独知（仅指定角色知情）
        PUBLIC_KNOWN: 'public_known'                // 公开已知（全员知情）
    });

    /** 授权判定结果状态 */
    const PERMISSION_VERDICTS = Object.freeze({
        ACCESSIBLE: 'accessible',     // 完全可读
        MASKED: 'masked',             // 遮蔽脱敏
        BLOCKED: 'blocked',           // 完全拒止
        UNPROVEN: 'unproven'          // 无法证明知情（fail-closed 阻断）
    });

    function safeStr(v) { return String(v == null ? '' : v).trim(); }

    /**
     * 规范化事实权限条目
     */
    function normalizeSecuredFact(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const factKey = safeStr(raw.factKey || raw.key || raw.id);
        if (!factKey) return null;

        const content = safeStr(raw.content || raw.value || raw.text);
        const validTiers = Object.values(SECURITY_TIERS);
        const tier = validTiers.includes(raw.tier) ? raw.tier : SECURITY_TIERS.PRIVATE_SELF;

        const allowedHolders = Array.isArray(raw.allowedHolders) ? raw.allowedHolders.map(safeStr).filter(Boolean) : [];
        const maskedFields = Array.isArray(raw.maskedFields) ? raw.maskedFields.map(safeStr).filter(Boolean) : [];

        return Object.freeze({
            factKey,
            content,
            tier,
            allowedHolders: Object.freeze(allowedHolders),
            maskedFields: Object.freeze(maskedFields),
            ownerId: safeStr(raw.ownerId) || 'user'
        });
    }

    /**
     * 评估某事实在特定角色视角的可见性与导出权限
     * @param {object} fact 事实条目
     * @param {string} viewerId 视角的角色 ID
     * @param {object} opts 选项 (如 isExport: boolean)
     */
    function evaluateFactPerspective(fact, viewerId, opts = {}) {
        const norm = normalizeSecuredFact(fact);
        const viewer = safeStr(viewerId);
        const isExport = Boolean(opts.isExport);

        if (!norm) {
            return Object.freeze({
                verdict: PERMISSION_VERDICTS.BLOCKED,
                known: false,
                masked: false,
                exportable: false,
                content: null,
                reason: 'invalid-fact'
            });
        }

        // 1. 公开事实：全员知情且可外带
        if (norm.tier === SECURITY_TIERS.PUBLIC_KNOWN) {
            return Object.freeze({
                verdict: PERMISSION_VERDICTS.ACCESSIBLE,
                known: true,
                masked: false,
                exportable: true,
                content: norm.content,
                reason: 'public-fact'
            });
        }

        // 2. 本人/拥有者：完全可访问
        if (viewer && viewer === norm.ownerId) {
            return Object.freeze({
                verdict: PERMISSION_VERDICTS.ACCESSIBLE,
                known: true,
                masked: false,
                exportable: !isExport || norm.tier !== SECURITY_TIERS.PRIVATE_SELF,
                content: norm.content,
                reason: 'owner-access'
            });
        }

        // 3. 私密自知：非 owner 角色完全阻断且禁止外带
        if (norm.tier === SECURITY_TIERS.PRIVATE_SELF) {
            return Object.freeze({
                verdict: PERMISSION_VERDICTS.BLOCKED,
                known: false,
                masked: false,
                exportable: false,
                content: null,
                reason: 'private-self-blocked'
            });
        }

        // 4. 角色独知
        if (norm.tier === SECURITY_TIERS.CHARACTER_EXCLUSIVE) {
            const hasAccess = viewer && norm.allowedHolders.includes(viewer);
            if (!hasAccess) {
                return Object.freeze({
                    verdict: PERMISSION_VERDICTS.BLOCKED,
                    known: false,
                    masked: false,
                    exportable: false,
                    content: null,
                    reason: 'character-not-in-allowed-holders'
                });
            }

            // 若包含遮蔽字段，进行部分脱敏
            let displayContent = norm.content;
            let isMasked = false;
            if (norm.maskedFields.length > 0) {
                for (const field of norm.maskedFields) {
                    if (displayContent.includes(field)) {
                        displayContent = displayContent.split(field).join('***');
                        isMasked = true;
                    }
                }
            }

            return Object.freeze({
                verdict: isMasked ? PERMISSION_VERDICTS.MASKED : PERMISSION_VERDICTS.ACCESSIBLE,
                known: true,
                masked: isMasked,
                exportable: !isExport, // 角色独知默认不可随意全量外带
                content: displayContent,
                reason: isMasked ? 'allowed-with-mask' : 'allowed-exclusive'
            });
        }

        // 无法判定时默认阻断 (fail-closed)
        return Object.freeze({
            verdict: PERMISSION_VERDICTS.UNPROVEN,
            known: false,
            masked: false,
            exportable: false,
            content: null,
            reason: 'unproven-fail-closed'
        });
    }

    /**
     * 自检函数
     */
    function perspectivePreviewSelfCheck() {
        const problems = [];
        if (Object.keys(SECURITY_TIERS).length !== 3) problems.push('SECURITY_TIERS 必须为 3 级');
        if (Object.keys(PERMISSION_VERDICTS).length !== 4) problems.push('PERMISSION_VERDICTS 必须为 4 态');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        SECURITY_TIERS,
        PERMISSION_VERDICTS,
        normalizeSecuredFact,
        evaluateFactPerspective,
        perspectivePreviewSelfCheck
    });

    root.LonShaPerspectivePreview = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);