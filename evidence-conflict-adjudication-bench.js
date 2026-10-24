/* ============================================================
 * evidence-conflict-adjudication-bench.js — [M9-O2 · 第九期规划]
 * 证据驱动的多视角冲突聚合与成组裁决台（纯函数内核）
 * ------------------------------------------------------------
 * 【治理缺口】
 *   旧系统包含 evidence-query、evidence-solver 与 testimony-board，
 *   但遇到多事实矛盾（如：Alice 年龄是 17 岁 vs 27 岁；地点在城南 vs 城北）时，
 *   算法倾向于按置信分简单覆盖，抹杀了多视角、伪装、时效或谣言差异。
 *   用户需要能够：
 *     1. 将指向同一实体+属性的矛盾事实聚合成证据束 (Evidence Bundle)；
 *     2. 做出四种法定裁决：
 *        - ADOPT:     采纳此事实为正典，其余退为 superseded
 *        - JUXTAPOSE: 并列保留（如不同角色的主观认知或伪装场景）
 *        - PENDING:   存疑保留待证实，均不进入高置信注入
 *        - REVOKE:    全部推翻/撤回
 *     3. 撤回裁决后下游可逆恢复，拒绝硬覆盖破坏原始凭证。
 * ============================================================ */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EvidenceConflictAdjudicationBench = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const ADJUDICATION_VERDICTS = Object.freeze({
        ADOPT: 'adopt',           // 采纳单一胜出者
        JUXTAPOSE: 'juxtapose',   // 并列多元视角
        PENDING: 'pending',       // 挂起存疑
        REVOKE: 'revoke'          // 撤销该束全部事实
    });

    /**
     * 将事实按 subject + predicate 聚合成证据束
     */
    function clusterConflictBundles(facts) {
        const list = Array.isArray(facts) ? facts : [];
        const bundles = new Map();

        for (const f of list) {
            if (!f || !f.id) continue;
            const sub = String(f.subject || '').trim();
            const pred = String(f.predicate || '').trim();
            const key = `${sub}::${pred}`;

            if (!bundles.has(key)) {
                bundles.set(key, {
                    bundleKey: key,
                    subject: sub,
                    predicate: pred,
                    candidates: [],
                    isConflicting: false
                });
            }

            bundles.get(key).candidates.push(f);
        }

        const result = [];
        for (const [key, bundle] of bundles.entries()) {
            // 检查不同候选的值(object)是否存在差异
            const distinctValues = new Set(bundle.candidates.map(c => String(c.object || c.value || '').trim()));
            bundle.isConflicting = distinctValues.size > 1;
            bundle.candidateCount = bundle.candidates.length;
            result.push(bundle);
        }

        return result;
    }

    /**
     * 对冲突证据束执行成组用户裁决
     */
    function adjudicateBundle(bundle, verdict, options = {}) {
        if (!bundle || !Array.isArray(bundle.candidates)) {
            return { ok: false, error: 'invalid-bundle' };
        }

        const validVerdicts = Object.values(ADJUDICATION_VERDICTS);
        if (!validVerdicts.includes(verdict)) {
            return { ok: false, error: 'invalid-verdict' };
        }

        const reason = String(options.reason || 'user-bundle-adjudication').trim();
        const winnerId = options.winnerFactId ? String(options.winnerFactId).trim() : null;

        const resolvedFacts = [];

        switch (verdict) {
            case ADJUDICATION_VERDICTS.ADOPT: {
                if (!winnerId) {
                    return { ok: false, error: 'winner-id-required-for-adopt' };
                }
                const winnerExists = bundle.candidates.some(c => String(c.id) === winnerId);
                if (!winnerExists) {
                    return { ok: false, error: 'winner-not-in-bundle' };
                }

                for (const c of bundle.candidates) {
                    if (String(c.id) === winnerId) {
                        resolvedFacts.push(Object.assign({}, c, {
                            state: 'confirmed',
                            adjudicationNote: `Adopted as canon: ${reason}`,
                            adjudicatedAt: Date.now()
                        }));
                    } else {
                        resolvedFacts.push(Object.assign({}, c, {
                            state: 'expired',
                            supersededBy: winnerId,
                            adjudicationNote: `Superseded by ${winnerId}: ${reason}`,
                            adjudicatedAt: Date.now()
                        }));
                    }
                }
                break;
            }

            case ADJUDICATION_VERDICTS.JUXTAPOSE: {
                for (const c of bundle.candidates) {
                    resolvedFacts.push(Object.assign({}, c, {
                        state: 'inference',
                        perspective: c.perspective || options.perspective || 'subjective_view',
                        adjudicationNote: `Juxtaposed multi-perspective: ${reason}`,
                        adjudicatedAt: Date.now()
                    }));
                }
                break;
            }

            case ADJUDICATION_VERDICTS.PENDING: {
                for (const c of bundle.candidates) {
                    resolvedFacts.push(Object.assign({}, c, {
                        state: 'candidate',
                        isDisputed: true,
                        adjudicationNote: `Held pending verification: ${reason}`,
                        adjudicatedAt: Date.now()
                    }));
                }
                break;
            }

            case ADJUDICATION_VERDICTS.REVOKE: {
                for (const c of bundle.candidates) {
                    resolvedFacts.push(Object.assign({}, c, {
                        state: 'revoked',
                        revocationReason: reason,
                        adjudicatedAt: Date.now()
                    }));
                }
                break;
            }
        }

        return {
            ok: true,
            verdict,
            bundleKey: bundle.bundleKey,
            facts: resolvedFacts
        };
    }

    return {
        ADJUDICATION_VERDICTS,
        clusterConflictBundles,
        adjudicateBundle
    };
}));