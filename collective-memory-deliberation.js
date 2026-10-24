/* ========================================================
 * collective-memory-deliberation.js — [M7-X8 · 第七期规划] 集体记忆协商（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   社团、班级、战队或工坊对某次历史争议、失败事件或功绩划分常存在多种叙述。
 *   传统系统往往采取“少数服从多数”的简单粗暴投票，将获胜方直接定为“唯一客观事实”，
 *   导致少数派的真实经历与异议被彻底抹杀，造成历史虚无主义。
 *   集体记忆协商建立“共识与异议并存、新证据可重开与生成端精准分流”机制：
 *     ① 三重陈述状态划分(CONSENSUS_TIER)：
 *        - 群体共识(consensus)：代表集体对外的共同公开叙述；
 *        - 异议保留(dissenting)：少数派坚持的不同意见与个人证词，永久留痕；
 *        - 悬而未决(unresolved)：缺乏关键证据、双方均同意暂不判定的开放细节；
 *     ② 绝不将多数票等同于客观真相：共识只是达成妥协的公开表述，异议不被抹除；
 *     ③ 新证据重开机制(reopenDeliberationWithNewEvidence)：当出土新信件或证物时，
 *        可平滑重新开启协商，而不抹杀此前历史结论的演进痕迹；
 *     ④ 生成侧精准分流(extractDeliberationKnowledge)：向后续模型或UI注入时，
 *        明确标注哪些是集体共识，哪些是特定角色的不可调和异议。
 * ======================================================== */
(function (root) {
    'use strict';

    /** 陈述分类 */
    const CONSENSUS_TIER = Object.freeze({
        CONSENSUS: 'consensus',       // 达成的集体公开共识
        DISSENTING: 'dissenting',     // 少数派独立异议注记
        UNRESOLVED: 'unresolved'      // 悬而未决/无法判定的细节
    });

    /** 协商会话状态 */
    const DELIBERATION_STATUS = Object.freeze({
        OPEN: 'open',                 // 议事进行中
        CONCLUDED: 'concluded',       // 达成阶段性共识与异议归档
        REOPENED: 'reopened'          // 发现新材料，重新开启协商
    });

    function safeStr(val, fallback = '') {
        return (typeof val === 'string' && val.trim().length > 0) ? val.trim() : fallback;
    }

    function safeArr(val) {
        return Array.isArray(val) ? val : [];
    }

    /**
     * 创建集体记忆协商议题
     */
    function createDeliberationTopic(raw = {}) {
        return {
            topicId: safeStr(raw.topicId, `delib_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
            title: safeStr(raw.title, '未命名集体争议事件'),
            historicalEventRef: safeStr(raw.historicalEventRef, ''),
            status: DELIBERATION_STATUS.OPEN,
            statements: [],
            consensusSummary: '',
            reopenHistory: [],
            createdAt: safeStr(raw.createdAt, new Date().toISOString()),
            closedAt: null
        };
    }

    /**
     * 成员提交叙述或异议陈述
     */
    function submitDeliberationStatement(topic = {}, statementInput = {}) {
        const t = {
            ...topic,
            statements: safeArr(topic.statements).map(s => ({ ...s }))
        };

        const tierValues = Object.values(CONSENSUS_TIER);
        const tier = tierValues.includes(statementInput.tier) ? statementInput.tier : CONSENSUS_TIER.DISSENTING;

        const statement = {
            statementId: safeStr(statementInput.statementId, `stmt_${t.statements.length + 1}_${Math.random().toString(36).slice(2, 6)}`),
            memberId: safeStr(statementInput.memberId, 'member_anon'),
            memberName: safeStr(statementInput.memberName, '匿名成员'),
            content: safeStr(statementInput.content, ''),
            tier,
            evidenceRefs: safeArr(statementInput.evidenceRefs).map(safeStr).filter(Boolean),
            submittedAt: safeStr(statementInput.submittedAt, new Date().toISOString())
        };

        t.statements.push(statement);
        return t;
    }

    /**
     * 结案并确立集体公开叙述（同时完整保留所有少数派异议）
     */
    function concludeDeliberation(topic = {}, consensusSummary = '') {
        const t = {
            ...topic,
            statements: safeArr(topic.statements).map(s => ({ ...s }))
        };

        t.status = DELIBERATION_STATUS.CONCLUDED;
        t.consensusSummary = safeStr(consensusSummary, '社团对该事件达成基本共识，同时保留各项独立异议。');
        t.closedAt = new Date().toISOString();

        return t;
    }

    /**
     * 发现新证据重开协商
     */
    function reopenDeliberationWithNewEvidence(topic = {}, newEvidence = {}) {
        const t = {
            ...topic,
            statements: safeArr(topic.statements).map(s => ({ ...s })),
            reopenHistory: safeArr(topic.reopenHistory).map(h => ({ ...h }))
        };

        const reopenLog = {
            reopenedAt: new Date().toISOString(),
            previousConsensus: t.consensusSummary,
            newEvidenceSummary: safeStr(newEvidence.summary, '提供了新的现场记录材料'),
            submittedBy: safeStr(newEvidence.submittedBy, '未知提供者')
        };

        t.reopenHistory.push(reopenLog);
        t.status = DELIBERATION_STATUS.REOPENED;

        // 如果随附了新证词，直接加入
        if (newEvidence.statement) {
            t.statements.push({
                statementId: `stmt_reopen_${t.statements.length + 1}`,
                memberId: safeStr(newEvidence.statement.memberId, 'member_anon'),
                memberName: safeStr(newEvidence.statement.memberName, '新证人'),
                content: safeStr(newEvidence.statement.content, ''),
                tier: CONSENSUS_TIER.UNRESOLVED,
                evidenceRefs: safeArr(newEvidence.statement.evidenceRefs).map(safeStr),
                submittedAt: new Date().toISOString()
            });
        }

        return t;
    }

    /**
     * 为记忆生成侧/UI侧提取精准分流知识包
     */
    function extractDeliberationKnowledge(topic = {}) {
        const statements = safeArr(topic.statements);
        const consensusList = statements.filter(s => s.tier === CONSENSUS_TIER.CONSENSUS);
        const dissentingList = statements.filter(s => s.tier === CONSENSUS_TIER.DISSENTING);
        const unresolvedList = statements.filter(s => s.tier === CONSENSUS_TIER.UNRESOLVED);

        return {
            topicId: topic.topicId || '',
            title: topic.title || '',
            status: topic.status || DELIBERATION_STATUS.OPEN,
            publicConsensusText: topic.consensusSummary || '',
            consensusCount: consensusList.length,
            dissentingRecords: dissentingList.map(d => ({
                authorName: d.memberName,
                dissentContent: d.content,
                evidenceRefs: d.evidenceRefs
            })),
            unresolvedDetails: unresolvedList.map(u => ({
                authorName: u.memberName,
                unresolvedStatement: u.content
            })),
            hasActiveDissent: dissentingList.length > 0
        };
    }

    /**
     * 模块自检函数
     */
    function collectiveMemoryDeliberationSelfCheck() {
        const problems = [];
        try {
            let topic = createDeliberationTopic({
                topicId: 'delib_play_fail',
                title: '去年校庆话剧演出突发断电责任协商',
                historicalEventRef: 'evt_anniversary_play'
            });

            // 1. 多数派共识主张
            topic = submitDeliberationStatement(topic, {
                memberId: 'm_director',
                memberName: '导演张同学',
                content: '主因是礼堂老旧总闸负荷过载跳闸，非剧组人为失误。',
                tier: CONSENSUS_TIER.CONSENSUS
            });

            // 2. 少数派异议主张
            topic = submitDeliberationStatement(topic, {
                memberId: 'm_lighting',
                memberName: '灯光组李同学',
                content: '后台私自加接了四台大功率暖风机，加剧了过载，不能全怪礼堂电闸。',
                tier: CONSENSUS_TIER.DISSENTING,
                evidenceRefs: ['后台走电接线图草稿']
            });

            // 3. 悬而未决细节
            topic = submitDeliberationStatement(topic, {
                memberId: 'm_stage',
                memberName: '道具组王同学',
                content: '暖风机到底是谁搬进后台的，当晚大家都忙没人注意。',
                tier: CONSENSUS_TIER.UNRESOLVED
            });

            // 4. 形成阶段性结论
            topic = concludeDeliberation(topic, '对外统一口径为礼堂电网老化，对内通报批评私接违规电器并加强安全演练。');
            if (topic.status !== DELIBERATION_STATUS.CONCLUDED) {
                problems.push('协商结案状态流转异常');
            }

            // 5. 知识分流提取检查
            const pack = extractDeliberationKnowledge(topic);
            if (!pack.hasActiveDissent || pack.dissentingRecords.length !== 1) {
                problems.push('未能正确提取与保护少数派异议');
            }
            if (pack.dissentingRecords[0].authorName !== '灯光组李同学') {
                problems.push('少数派异议原作者绑定丢失');
            }

            // 6. 新证据重开协商检查
            topic = reopenDeliberationWithNewEvidence(topic, {
                summary: '保洁阿姨在旧仓库找到了写有名字的暖风机借条',
                submittedBy: '宿管老师'
            });
            if (topic.status !== DELIBERATION_STATUS.REOPENED || topic.reopenHistory.length !== 1) {
                problems.push('新证据重开协商机制异常');
            }
        } catch (err) {
            problems.push(`自检运行异常: ${err && err.message ? err.message : String(err)}`);
        }
        return { problems };
    }

    const CollectiveMemoryDeliberation = Object.freeze({
        CONSENSUS_TIER,
        DELIBERATION_STATUS,
        createDeliberationTopic,
        submitDeliberationStatement,
        concludeDeliberation,
        reopenDeliberationWithNewEvidence,
        extractDeliberationKnowledge,
        collectiveMemoryDeliberationSelfCheck
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = CollectiveMemoryDeliberation;
    }
    root.CollectiveMemoryDeliberation = CollectiveMemoryDeliberation;
    root.LonShaCollectiveMemoryDeliberation = CollectiveMemoryDeliberation;
})(typeof globalThis !== 'undefined' ? globalThis : window);