/* ============================================================
 * recall-route-feedback-bench.js — [L9-O4 · 第九期规划]
 * 多路由召回仲裁、同名消歧与用户质量反馈闭环（纯函数内核）
 * ------------------------------------------------------------
 * 【核心设计】
 *   ① 五大召回优先路线 (Recall Routes):
 *      - EXPERIENCE_FIRST: 经历优先（突出事件因果链与亲历动作）
 *      - EVIDENCE_FIRST:   证据优先（突出公文、证言、客观凭证）
 *      - RELATION_FIRST:   关系动力优先（突出羁绊变迁、好感与态度）
 *      - PERSPECTIVE_FIRST:角色视角优先（严格根据该角色的知情范围过滤）
 *      - ARCHIVE_FIRST:    档案资料优先（客观设定、地理百科）
 *
 *   ② 用户反馈与路线权重自适应 (Feedback Loop):
 *      - 记录用户对某次召回结果的评价：HELPFUL / IRRELEVANT / MISSING_KEY_FACT
 *      - 用户反馈仅影响指定会话/角色维度的路由偏好，绝对不污染底层客观事实
 * ============================================================ */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.RecallRouteFeedbackBench = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const RECALL_ROUTES = Object.freeze({
        EXPERIENCE_FIRST: 'experience_first',
        EVIDENCE_FIRST: 'evidence_first',
        RELATION_FIRST: 'relation_first',
        PERSPECTIVE_FIRST: 'perspective_first',
        ARCHIVE_FIRST: 'archive_first'
    });

    const FEEDBACK_VERDICTS = Object.freeze({
        HELPFUL: 'helpful',
        IRRELEVANT: 'irrelevant',
        MISSING_KEY_FACT: 'missing_key_fact'
    });

    /**
     * 根据偏好路线过滤与重排召回候选
     */
    function rankByRoute(candidates, route, options = {}) {
        const list = Array.isArray(candidates) ? candidates.slice() : [];
        const activeRoute = Object.values(RECALL_ROUTES).includes(route) ? route : RECALL_ROUTES.EXPERIENCE_FIRST;
        const perspectiveCharacterId = options.characterId ? String(options.characterId).trim() : null;

        const filtered = list.filter(item => {
            if (!item || !item.id) return false;
            // 若为视角优先，必须满足知情名单或公开事实
            if (activeRoute === RECALL_ROUTES.PERSPECTIVE_FIRST && perspectiveCharacterId) {
                if (item.secretScope === 'private' && item.knowerId !== perspectiveCharacterId) {
                    return false;
                }
            }
            return true;
        });

        // 评分权重打分
        filtered.sort((a, b) => {
            const scoreA = computeItemRouteScore(a, activeRoute);
            const scoreB = computeItemRouteScore(b, activeRoute);
            return scoreB - scoreA;
        });

        return {
            route: activeRoute,
            totalRanked: filtered.length,
            rankedItems: filtered
        };
    }

    function computeItemRouteScore(item, route) {
        let base = typeof item.score === 'number' ? item.score : 1.0;
        const type = String(item.type || '').toLowerCase();

        switch (route) {
            case RECALL_ROUTES.EXPERIENCE_FIRST:
                if (type === 'experience' || type === 'event') base += 2.0;
                break;
            case RECALL_ROUTES.EVIDENCE_FIRST:
                if (type === 'evidence' || item.hasProof) base += 2.0;
                break;
            case RECALL_ROUTES.RELATION_FIRST:
                if (type === 'relation' || type === 'bond') base += 2.0;
                break;
            case RECALL_ROUTES.ARCHIVE_FIRST:
                if (type === 'archive' || type === 'lore') base += 2.0;
                break;
        }
        return base;
    }

    /**
     * 记录并聚合用户针对特定召回条目的质量反馈
     */
    function recordFeedback(feedbackStore, feedback) {
        const store = Array.isArray(feedbackStore) ? feedbackStore.slice() : [];
        if (!feedback || !feedback.factId || !feedback.verdict) {
            return { ok: false, error: 'invalid-feedback', store };
        }

        const entry = {
            factId: String(feedback.factId).trim(),
            route: feedback.route || RECALL_ROUTES.EXPERIENCE_FIRST,
            verdict: feedback.verdict,
            comment: String(feedback.comment || '').trim(),
            timestamp: Date.now()
        };

        store.push(entry);
        return { ok: true, entry, store };
    }

    return {
        RECALL_ROUTES,
        FEEDBACK_VERDICTS,
        rankByRoute,
        recordFeedback
    };
}));