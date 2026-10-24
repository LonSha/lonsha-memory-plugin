/* ============================================================
 * multi-perspective-theater-bench.js — [L9-X7 · 第九期规划]
 * 多知情视角事件剧场材料投影器（纯函数内核）
 * ------------------------------------------------------------
 * 【核心设计】
 *   针对同一叙事事件，支持四种知情视角的材料投影计算：
 *     1. PARTICIPANT: 亲历者（可见第一手细节、行动动机，但可能缺失宏观全局信息）
 *     2. ONLOOKER: 旁观者（仅可见公开举动与表象，无法窥探心理与隐秘契约）
 *     3. FUTURE_RETROSPECTIVE: 未来回望者（已知最终因果走向与事后解密）
 *     4. ARCHIVAL_RESEARCHER: 档案研究者（仅能查阅残存证据卷宗与公约记录）
 *   切换视角绝不篡改历史客观事实，未授权的秘密事实严格从非亲历者视角中剔除。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MultiPerspectiveTheaterBench = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const PERSPECTIVE_ROLES = Object.freeze({
        PARTICIPANT: 'participant',
        ONLOOKER: 'onlooker',
        FUTURE_RETROSPECTIVE: 'future_retrospective',
        ARCHIVAL_RESEARCHER: 'archival_researcher'
    });

    function projectEventMaterialsByPerspective(eventFacts = [], perspectiveRole, options = {}) {
        const list = Array.isArray(eventFacts) ? eventFacts : [];
        const role = Object.values(PERSPECTIVE_ROLES).includes(perspectiveRole)
            ? perspectiveRole
            : PERSPECTIVE_ROLES.ONLOOKER;

        const projected = [];
        const redacted = [];

        for (const f of list) {
            if (!f || !f.id) continue;

            const isSecret = Boolean(f.isSecret);
            const isInnerMonologue = f.scope === 'inner_monologue';
            const isArchivedDoc = f.scope === 'archival' || f.hasDocumentEvidence;

            let allowed = false;
            let reason = 'public_observable';

            if (role === PERSPECTIVE_ROLES.PARTICIPANT) {
                // 亲历者可见私密与内心动机
                allowed = true;
            } else if (role === PERSPECTIVE_ROLES.ONLOOKER) {
                // 旁观者不可见内心独白与私密事实
                if (!isSecret && !isInnerMonologue) {
                    allowed = true;
                } else {
                    reason = 'hidden_from_onlooker';
                }
            } else if (role === PERSPECTIVE_ROLES.FUTURE_RETROSPECTIVE) {
                // 未来回望者可见已解密事实
                if (!isSecret || options.isDecryptedInFuture) {
                    allowed = true;
                } else {
                    reason = 'undecrypted_secret';
                }
            } else if (role === PERSPECTIVE_ROLES.ARCHIVAL_RESEARCHER) {
                // 研究者仅能见文档证据材料
                if (isArchivedDoc && !isSecret) {
                    allowed = true;
                } else {
                    reason = 'lacks_archival_record';
                }
            }

            if (allowed) {
                projected.push(f);
            } else {
                redacted.push({ id: f.id, reason });
            }
        }

        return {
            perspectiveRole: role,
            totalFacts: list.length,
            visibleCount: projected.length,
            redactedCount: redacted.length,
            projected,
            redacted
        };
    }

    return {
        PERSPECTIVE_ROLES,
        projectEventMaterialsByPerspective
    };
}));