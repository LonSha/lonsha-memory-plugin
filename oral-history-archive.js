/* ========================================================
 * oral-history-archive.js — [M7-X1 · 第七期规划] 口述史与多声部档案（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   多年后重访家庭/社团/历史事件时，各成员对动机、责任与事实细节的记忆互不相同。
 *   传统系统往往强行覆盖或裁定单一“客观事实”，抹杀了人际视角的真实复杂性。
 *   口述史与多声部档案系统实现：
 *     ① 多视角并列：将每个人的叙述、当时知情、后续修正和公开范围清晰并列；
 *     ② 绝不选出唯一真相：正视记忆分歧，标记重叠(overlapping)、争议(disputed)与空白(gap)；
 *     ③ 撤回公开不毁历史原件：当事人收回公开授权时，仅收紧可见性，归档痕迹与原件完整保留；
 *     ④ 差异驱动后续访谈：基于叙述盲区与矛盾点自动生成定向探访问题。
 * ======================================================== */
(function (root) {
    'use strict';

    /** 可公开范围 */
    const VISIBILITY_SCOPE = Object.freeze({
        PUBLIC: 'public',         // 完全公开
        RESTRICTED: 'restricted', // 圈内/关联人可见
        PRIVATE: 'private',       // 仅讲述者/管理者可见
        RETRACTED: 'retracted'    // 已撤回公开授权（历史留存但不公开）
    });

    /** 叙述版本状态 */
    const PERSPECTIVE_STATUS = Object.freeze({
        ACTIVE: 'active',         // 当前有效
        REVISED: 'revised',       // 已被后续修订更正
        RETRACTED: 'retracted'    // 已撤回公开
    });

    /** 细节比对一致性状态 */
    const DETAIL_AGREEMENT = Object.freeze({
        OVERLAPPING: 'overlapping',   // 互相印证重合
        DISPUTED: 'disputed',         // 存在分歧矛盾
        GAP: 'gap',                   // 盲区未涉
        UNVERIFIABLE: 'unverifiable'  // 无法核实/无法判定
    });

    function safeStr(val, fallback = '') {
        return (typeof val === 'string' && val.trim().length > 0) ? val.trim() : fallback;
    }

    function safeArr(val) {
        return Array.isArray(val) ? val : [];
    }

    /**
     * 创建口述史事件根节点
     */
    function createOralHistoryEvent(raw = {}) {
        return {
            id: safeStr(raw.id, `oral_evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
            title: safeStr(raw.title, '未命名口述史事件'),
            period: safeStr(raw.period, '未知时期'),
            summary: safeStr(raw.summary, ''),
            tags: safeArr(raw.tags).map(t => safeStr(t)).filter(Boolean),
            perspectives: [],
            createdAt: safeStr(raw.createdAt, new Date().toISOString())
        };
    }

    /**
     * 规范化叙述输入
     */
    function normalizePerspective(raw = {}, index = 0) {
        return {
            perspectiveId: safeStr(raw.perspectiveId, `persp_${index}_${Math.random().toString(36).slice(2, 6)}`),
            witnessId: safeStr(raw.witnessId, `witness_${index}`),
            witnessName: safeStr(raw.witnessName, '匿名讲述者'),
            narrative: safeStr(raw.narrative, ''),
            witnessAwareness: safeArr(raw.witnessAwareness).map(a => safeStr(a)).filter(Boolean),
            details: safeArr(raw.details).map((d, dIdx) => ({
                detailId: safeStr(d.detailId, `det_${dIdx}`),
                topic: safeStr(d.topic, '常规细节'),
                statement: safeStr(d.statement, ''),
                certainty: typeof d.certainty === 'number' ? Math.max(0, Math.min(1, d.certainty)) : 0.8,
                sourceRef: safeStr(d.sourceRef, 'oral_testimony')
            })),
            visibility: Object.values(VISIBILITY_SCOPE).includes(raw.visibility)
                ? raw.visibility
                : VISIBILITY_SCOPE.PUBLIC,
            status: Object.values(PERSPECTIVE_STATUS).includes(raw.status)
                ? raw.status
                : PERSPECTIVE_STATUS.ACTIVE,
            recordedAt: safeStr(raw.recordedAt, new Date().toISOString()),
            revisionHistory: safeArr(raw.revisionHistory)
        };
    }

    /**
     * 记录或更新某个讲述者的口述记录
     */
    function recordPerspective(event = {}, perspectiveInput = {}) {
        const evt = createOralHistoryEvent(event);
        evt.perspectives = safeArr(event.perspectives).map(p => ({ ...p }));

        const norm = normalizePerspective(perspectiveInput, evt.perspectives.length + 1);
        const existingIdx = evt.perspectives.findIndex(p => p.witnessId === norm.witnessId);

        if (existingIdx >= 0) {
            const old = evt.perspectives[existingIdx];
            const historyCopy = {
                narrative: old.narrative,
                details: old.details,
                visibility: old.visibility,
                archivedAt: new Date().toISOString()
            };
            norm.revisionHistory = [...safeArr(old.revisionHistory), historyCopy];
            evt.perspectives[existingIdx] = norm;
        } else {
            evt.perspectives.push(norm);
        }

        return evt;
    }

    /**
     * 修订讲述（保留历史原件）
     */
    function revisePerspective(event = {}, witnessId = '', patch = {}) {
        const evt = createOralHistoryEvent(event);
        evt.perspectives = safeArr(event.perspectives).map(p => ({ ...p }));
        const targetIdx = evt.perspectives.findIndex(p => p.witnessId === witnessId);
        if (targetIdx < 0) return evt;

        const current = evt.perspectives[targetIdx];
        const prevRevision = {
            narrative: current.narrative,
            details: current.details,
            revisedAt: new Date().toISOString(),
            reason: safeStr(patch.reason, '记忆补充修订')
        };

        const updated = {
            ...current,
            narrative: patch.narrative !== undefined ? safeStr(patch.narrative) : current.narrative,
            witnessAwareness: patch.witnessAwareness !== undefined ? safeArr(patch.witnessAwareness) : current.witnessAwareness,
            details: patch.details !== undefined ? safeArr(patch.details) : current.details,
            status: PERSPECTIVE_STATUS.ACTIVE,
            revisionHistory: [...safeArr(current.revisionHistory), prevRevision]
        };

        evt.perspectives[targetIdx] = updated;
        return evt;
    }

    /**
     * 撤回公开授权（保护讲述者意愿，但保留归档原件，严禁物理删除抹除历史）
     */
    function retractPerspectivePublicity(event = {}, witnessId = '', reason = '') {
        const evt = createOralHistoryEvent(event);
        evt.perspectives = safeArr(event.perspectives).map(p => ({ ...p }));
        const targetIdx = evt.perspectives.findIndex(p => p.witnessId === witnessId);
        if (targetIdx < 0) return evt;

        const current = evt.perspectives[targetIdx];
        const retractionLog = {
            previousVisibility: current.visibility,
            retractedAt: new Date().toISOString(),
            reason: safeStr(reason, '讲述者要求撤回公开')
        };

        evt.perspectives[targetIdx] = {
            ...current,
            visibility: VISIBILITY_SCOPE.RETRACTED,
            status: PERSPECTIVE_STATUS.RETRACTED,
            revisionHistory: [...safeArr(current.revisionHistory), retractionLog]
        };

        return evt;
    }

    /**
     * 读者比对重叠与空缺（绝不强制裁决单一真相）
     */
    function analyzeGapsAndOverlaps(event = {}, options = {}) {
        const perspectives = safeArr(event.perspectives).filter(p => {
            if (options.includeRetracted) return true;
            return p.visibility !== VISIBILITY_SCOPE.RETRACTED;
        });

        const topicMap = new Map();

        perspectives.forEach(p => {
            safeArr(p.details).forEach(d => {
                const topicKey = safeStr(d.topic, '常规');
                if (!topicMap.has(topicKey)) {
                    topicMap.set(topicKey, []);
                }
                topicMap.get(topicKey).push({
                    witnessId: p.witnessId,
                    witnessName: p.witnessName,
                    statement: d.statement,
                    certainty: d.certainty,
                    sourceRef: d.sourceRef
                });
            });
        });

        const overlaps = [];
        const disputes = [];
        const gaps = [];

        topicMap.forEach((records, topic) => {
            if (records.length <= 1) {
                gaps.push({
                    topic,
                    onlyReportedBy: records[0] ? records[0].witnessName : '未知',
                    recordCount: records.length,
                    note: '仅单一讲述者提及，其他当事人未作交代'
                });
            } else {
                // 检测是否存在不同叙述陈述
                const uniqueStatements = Array.from(new Set(records.map(r => r.statement.trim())));
                if (uniqueStatements.length === 1) {
                    overlaps.push({
                        topic,
                        commonStatement: uniqueStatements[0],
                        witnessCount: records.length,
                        witnesses: records.map(r => r.witnessName),
                        agreement: DETAIL_AGREEMENT.OVERLAPPING
                    });
                } else {
                    disputes.push({
                        topic,
                        perspectives: records.map(r => ({
                            witnessName: r.witnessName,
                            statement: r.statement,
                            certainty: r.certainty
                        })),
                        agreement: DETAIL_AGREEMENT.DISPUTED,
                        note: '各方叙述存在分歧，保持并列记录，不做裁决'
                    });
                }
            }
        });

        return {
            eventId: event.id || '',
            totalPerspectivesAnalyzed: perspectives.length,
            overlaps,
            disputes,
            gaps,
            unresolvedCount: disputes.length + gaps.length
        };
    }

    /**
     * 基于未解释处与分歧点生成后续探访问题
     */
    function generateFollowupInquiries(event = {}, analysis = {}) {
        const inquiries = [];
        const gaps = safeArr(analysis.gaps);
        const disputes = safeArr(analysis.disputes);

        disputes.forEach((d, idx) => {
            inquiries.push({
                inquiryId: `inq_disp_${idx}`,
                topic: d.topic,
                type: 'dispute_clarification',
                question: `关于“${d.topic}”，不同讲述者存在不同陈述，当时是否有什么特殊缘由或视角盲区？`,
                targetWitnesses: safeArr(d.perspectives).map(p => p.witnessName)
            });
        });

        gaps.forEach((g, idx) => {
            inquiries.push({
                inquiryId: `inq_gap_${idx}`,
                topic: g.topic,
                type: 'gap_exploration',
                question: `目前仅有 ${g.onlyReportedBy} 提及“${g.topic}”，其他人当时是否在场或知晓此事？`,
                targetWitnesses: []
            });
        });

        return inquiries;
    }

    /**
     * 模块自检函数
     */
    function oralHistoryArchiveSelfCheck() {
        const problems = [];
        try {
            let evt = createOralHistoryEvent({ id: 'evt_test', title: '老院拆迁回忆' });
            
            // 四位讲述者
            evt = recordPerspective(evt, {
                witnessId: 'w1',
                witnessName: '大伯',
                narrative: '当年是为了让二弟先买房才签的字。',
                witnessAwareness: ['拆迁款分配'],
                details: [{ topic: '拆迁原因', statement: '照顾二弟' }]
            });
            evt = recordPerspective(evt, {
                witnessId: 'w2',
                witnessName: '二姑',
                narrative: '我记得是大家抓阄决定的，根本没有特意照顾谁。',
                witnessAwareness: ['抓阄现场'],
                details: [{ topic: '拆迁原因', statement: '抓阄决定' }]
            });
            evt = recordPerspective(evt, {
                witnessId: 'w3',
                witnessName: '堂哥',
                narrative: '我那时候在念初中，只记得院子里的槐树被砍了。',
                witnessAwareness: ['院子老槐树'],
                details: [{ topic: '槐树砍伐', statement: '槐树被砍' }]
            });
            evt = recordPerspective(evt, {
                witnessId: 'w4',
                witnessName: '邻居王叔',
                narrative: '他们老李家那天吵得挺凶，后来好像都妥协了。',
                witnessAwareness: ['吵架动静'],
                details: [{ topic: '家庭会议气氛', statement: '吵得很凶后妥协' }]
            });

            if (evt.perspectives.length !== 4) {
                problems.push(`讲述者数量不符: 期望4, 实际${evt.perspectives.length}`);
            }

            // 修订测试
            evt = revisePerspective(evt, 'w1', {
                narrative: '当年是为了让二弟先买房才签的字，但其实父亲私下找我谈过。',
                reason: '记起父亲当时的谈话'
            });
            const w1 = evt.perspectives.find(p => p.witnessId === 'w1');
            if (!w1 || w1.revisionHistory.length !== 1) {
                problems.push('讲述者修订历史记录未正确保留');
            }

            // 对比分析
            const analysis = analyzeGapsAndOverlaps(evt);
            if (analysis.disputes.length === 0) {
                problems.push('未能识别出“拆迁原因”的陈述分歧');
            }

            // 撤回公开授权测试
            evt = retractPerspectivePublicity(evt, 'w4', '邻居要求不公开个人回忆');
            const w4 = evt.perspectives.find(p => p.witnessId === 'w4');
            if (w4.visibility !== VISIBILITY_SCOPE.RETRACTED) {
                problems.push('撤回公开授权状态不正确');
            }
            if (!w4.narrative) {
                problems.push('撤回公开错误地删除了历史原件');
            }

            // 后续提问生成
            const inquiries = generateFollowupInquiries(evt, analysis);
            if (inquiries.length === 0) {
                problems.push('基于分歧与空白的问题生成失败');
            }
        } catch (err) {
            problems.push(`自检运行异常: ${err && err.message ? err.message : String(err)}`);
        }
        return { problems };
    }

    const OralHistoryArchive = Object.freeze({
        VISIBILITY_SCOPE,
        PERSPECTIVE_STATUS,
        DETAIL_AGREEMENT,
        createOralHistoryEvent,
        normalizePerspective,
        recordPerspective,
        revisePerspective,
        retractPerspectivePublicity,
        analyzeGapsAndOverlaps,
        generateFollowupInquiries,
        oralHistoryArchiveSelfCheck
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = OralHistoryArchive;
    }
    root.OralHistoryArchive = OralHistoryArchive;
    root.LonShaOralHistoryArchive = OralHistoryArchive;
})(typeof globalThis !== 'undefined' ? globalThis : window);
