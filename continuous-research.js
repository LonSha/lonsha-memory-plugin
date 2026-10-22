/* ========================================================
 * continuous-research.js — [M6-O8 · v3.358.0] 持续研究记忆契约
 * 纯函数/纯契约，零依赖，零写回。
 * --------------------------------------------------------
 * 解决问题：
 *   从资料改版后重写整份报告，到将研究专题组织为问题—主张—证据/反证—未决条件网络；
 *   资料改版时仅局部重算受影响主张，保留作者论述正文修改，支持矛盾版本并存与断点续作。
 * 核心机制：
 *   1. 专题架构（Inquiry）：关联问题、主张、并存矛盾、未决条件与论述草稿；
 *   2. 局部依赖重算（Selective Recomputation）：资料更新时仅标记/重算依赖对应 docId+sectionId 的主张；
 *   3. 作者正文保护（Draft Protection）：用户编辑过的论述草稿绝不被静默覆盖，新建议仅输出为修补建议；
 *   4. 矛盾并存机制（Contradiction Parity）：相互矛盾的不同资料版本在作者裁定前保持并存，不越俎代庖；
 *   5. 断点接续（Continuation）：重开后完整恢复研究问题、未决条件与支撑证据链。
 * ======================================================== */
'use strict';

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaContinuousResearch = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const VERSION = '3.358.0';

    function _str(v) { return (v != null) ? String(v).trim() : ''; }
    function _arr(v) { return Array.isArray(v) ? v : []; }
    function _clone(v) {
        if (v == null || typeof v !== 'object') return v;
        return JSON.parse(JSON.stringify(v));
    }

    /**
     * 创建研究专题
     */
    function createInquiry(spec = {}) {
        const question = _str(spec.question);
        if (!question) {
            throw new Error('createInquiry requires non-empty question');
        }
        return Object.freeze({
            inquiryId: _str(spec.inquiryId) || ('inq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
            question,
            domain: _str(spec.domain) || 'general',
            status: _str(spec.status) || 'active', // 'active' | 'concluded' | 'archived'
            claims: _arr(spec.claims).map(_normalizeClaim),
            contradictions: _arr(spec.contradictions).map(_normalizeContradiction),
            pendingConditions: _arr(spec.pendingConditions).map(_str).filter(Boolean),
            narrativeDraft: {
                text: _str(spec.narrativeDraft?.text),
                lastUserEditedAt: spec.narrativeDraft?.lastUserEditedAt || null,
                userLocked: Boolean(spec.narrativeDraft?.userLocked)
            },
            createdAt: spec.createdAt || Date.now(),
            updatedAt: spec.updatedAt || Date.now()
        });
    }

    function _normalizeClaim(c) {
        const statement = _str(c?.statement);
        if (!statement) throw new Error('Claim statement is required');
        return Object.freeze({
            claimId: _str(c.claimId) || ('clm_' + Math.random().toString(36).slice(2, 7)),
            statement,
            supportingEvidence: _arr(c.supportingEvidence).map(_normalizeEvidence),
            counterEvidence: _arr(c.counterEvidence).map(_normalizeEvidence),
            status: _str(c.status) || 'supported', // 'supported' | 'disputed' | 'unsupported' | 'needs_review'
            needsReview: Boolean(c.needsReview),
            confidenceLevel: _str(c.confidenceLevel) || 'solid', // 'tentative' | 'solid' | 'speculative'
            reviewReason: _str(c.reviewReason) || ''
        });
    }

    function _normalizeEvidence(e) {
        return Object.freeze({
            evidenceId: _str(e?.evidenceId) || ('ev_' + Math.random().toString(36).slice(2, 7)),
            sourceDocId: _str(e?.sourceDocId),
            sectionId: _str(e?.sectionId),
            quote: _str(e?.quote),
            docVersion: _str(e?.docVersion) || '1.0',
            addedAt: e?.addedAt || Date.now()
        });
    }

    function _normalizeContradiction(ct) {
        return Object.freeze({
            contradictionId: _str(ct?.contradictionId) || ('ct_' + Math.random().toString(36).slice(2, 7)),
            sourceA: _str(ct?.sourceA),
            sourceB: _str(ct?.sourceB),
            description: _str(ct?.description),
            status: _str(ct?.status) || 'acknowledged_divergence', // 'acknowledged_divergence' | 'reconciled'
            authorRuling: _str(ct?.authorRuling) || null
        });
    }

    function addClaim(inquiry, claimSpec) {
        if (!inquiry || !inquiry.inquiryId) throw new Error('Invalid inquiry');
        const nextClaims = [...inquiry.claims, _normalizeClaim(claimSpec)];
        return Object.freeze({
            ..._clone(inquiry),
            claims: nextClaims,
            updatedAt: Date.now()
        });
    }

    function addContradiction(inquiry, contradictionSpec) {
        if (!inquiry || !inquiry.inquiryId) throw new Error('Invalid inquiry');
        const nextCt = [...inquiry.contradictions, _normalizeContradiction(contradictionSpec)];
        return Object.freeze({
            ..._clone(inquiry),
            contradictions: nextCt,
            updatedAt: Date.now()
        });
    }

    function updateNarrativeDraft(inquiry, newText, isUserEdit = true) {
        if (!inquiry || !inquiry.inquiryId) throw new Error('Invalid inquiry');
        return Object.freeze({
            ..._clone(inquiry),
            narrativeDraft: {
                text: _str(newText),
                lastUserEditedAt: isUserEdit ? Date.now() : inquiry.narrativeDraft.lastUserEditedAt,
                userLocked: isUserEdit ? true : inquiry.narrativeDraft.userLocked
            },
            updatedAt: Date.now()
        });
    }

    /**
     * 资料更新时仅局部重算受影响主张
     */
    function recomputeOnSourceUpdate(inquiry, updateEvent = {}) {
        if (!inquiry || !inquiry.inquiryId) throw new Error('Invalid inquiry');
        const updatedDocId = _str(updateEvent.updatedDocId);
        const updatedSections = _arr(updateEvent.updatedSectionIds).map(_str);

        let recomputedCount = 0;
        const nextClaims = inquiry.claims.map(claim => {
            const affectedEvidence = claim.supportingEvidence.concat(claim.counterEvidence).filter(ev => {
                if (ev.sourceDocId !== updatedDocId) return false;
                if (updatedSections.length === 0) return true;
                return updatedSections.includes(ev.sectionId);
            });

            if (affectedEvidence.length === 0) {
                return claim;
            }

            recomputedCount++;
            return Object.freeze({
                ...claim,
                needsReview: true,
                status: 'needs_review',
                reviewReason: 'Source document [' + updatedDocId + '] section changed. Recomputation requested.'
            });
        });

        const preservedDraft = { ...inquiry.narrativeDraft };
        const suggestedRevisions = [];

        if (recomputedCount > 0) {
            suggestedRevisions.push('Recomputed ' + recomputedCount + ' claim(s) due to updates in ' + updatedDocId);
        }

        return Object.freeze({
            ..._clone(inquiry),
            claims: nextClaims,
            narrativeDraft: preservedDraft,
            suggestedRevisions,
            lastRecomputedAt: Date.now(),
            recomputedCount,
            updatedAt: Date.now()
        });
    }

    function deriveResearchBrief(inquiry) {
        if (!inquiry) return null;
        const totalClaims = inquiry.claims.length;
        const supported = inquiry.claims.filter(c => c.status === 'supported').length;
        const needsReview = inquiry.claims.filter(c => c.needsReview || c.status === 'needs_review').length;
        const activeContradictions = inquiry.contradictions.filter(c => c.status !== 'reconciled');

        return {
            inquiryId: inquiry.inquiryId,
            question: inquiry.question,
            status: inquiry.status,
            totalClaims,
            supportedClaimsCount: supported,
            needsReviewClaimsCount: needsReview,
            activeContradictionsCount: activeContradictions.length,
            contradictions: activeContradictions.map(c => ({
                sources: [c.sourceA, c.sourceB],
                description: c.description
            })),
            pendingConditions: inquiry.pendingConditions,
            narrativeSummary: inquiry.narrativeDraft.text || 'No narrative text recorded.',
            isUserLocked: inquiry.narrativeDraft.userLocked
        };
    }

    return Object.freeze({
        VERSION,
        createInquiry,
        addClaim,
        addContradiction,
        updateNarrativeDraft,
        recomputeOnSourceUpdate,
        deriveResearchBrief
    });
});