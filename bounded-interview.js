/* ========================================================
 * bounded-interview.js — [M7-X4 · 第七期规划] 有界角色访谈模拟（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   创作者常想通过访谈探寻角色对历史事件、情感冲突或隐秘往事的个人理解。
 *   传统做法往往让模型随意替角色虚构“客观全知事实”，导致人设崩塌或秘密泄漏。
 *   有界角色访谈模拟建立“严格受证据与知情范围约束的探访机制”：
 *     ① 四种认识形态区分(EPISTEMIC_TYPE)：
 *        - 有据回忆(evidenced_recall)：确切发生并处于角色当时知情内；
 *        - 推断(inference)：角色基于有限碎片的合理推测，显式标明推测性；
 *        - 沉默(silence)：角色知情但因情感保护、立场或秘密选择回避；
 *        - 未知(unknown)：超出角色知情界限，必须回答“不知道”，严禁脑补；
 *     ② 会话可暂停可恢复：会话支持暂停与重新唤起，上下文状态完全保真；
 *     ③ 候选采纳闭环：访谈生成的回答仅作为草稿(draft)或候选(candidate)，
 *        未被显式采纳(adopted)绝不进入长期记忆注入；
 *     ④ 保持认知差异：若与其他角色的叙述冲突，保留差异而不强行抚平。
 * ======================================================== */
(function (root) {
    'use strict';

    /** 认识状态分类 */
    const EPISTEMIC_TYPE = Object.freeze({
        EVIDENCED_RECALL: 'evidenced_recall', // 有确凿经历/证据的回忆
        INFERENCE: 'inference',               // 基于已知证据的主观推测
        SILENCE: 'silence',                   // 知情但保持沉默/拒绝透露
        UNKNOWN: 'unknown'                    // 超出知情范围，确实不知道
    });

    /** 访谈会话状态 */
    const INTERVIEW_STATUS = Object.freeze({
        ACTIVE: 'active',       // 进行中
        PAUSED: 'paused',       // 已暂停（可随时恢复）
        CONCLUDED: 'concluded'  // 已总结/已完结
    });

    /** 回答应答采纳状态 */
    const ADOPTION_STATUS = Object.freeze({
        DRAFT: 'draft',         // 初稿探查
        CANDIDATE: 'candidate', // 待确认候选
        ADOPTED: 'adopted',     // 已采纳进入正式记忆
        REJECTED: 'rejected'    // 已废弃不采纳
    });

    function safeStr(val, fallback = '') {
        return (typeof val === 'string' && val.trim().length > 0) ? val.trim() : fallback;
    }

    function safeArr(val) {
        return Array.isArray(val) ? val : [];
    }

    /**
     * 创建访谈会话
     */
    function createInterviewSession(raw = {}) {
        return {
            sessionId: safeStr(raw.sessionId, `intv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
            characterId: safeStr(raw.characterId, 'unknown_char'),
            characterName: safeStr(raw.characterName, '未命名角色'),
            topic: safeStr(raw.topic, '常规往事访谈'),
            // 角色的认知边界与已知事实列表
            knownFacts: safeArr(raw.knownFacts).map(f => safeStr(f)).filter(Boolean),
            // 角色的私密/保护边界（触碰则触发沉默或警觉）
            sensitiveTopics: safeArr(raw.sensitiveTopics).map(s => safeStr(s)).filter(Boolean),
            // 角色的未涉范围/绝对盲区（触碰则触发 unknown）
            blindSpots: safeArr(raw.blindSpots).map(b => safeStr(b)).filter(Boolean),
            turns: [],
            status: INTERVIEW_STATUS.ACTIVE,
            createdAt: safeStr(raw.createdAt, new Date().toISOString()),
            lastActivityAt: safeStr(raw.lastActivityAt, new Date().toISOString())
        };
    }

    /**
     * 校验问题是否超出知情边界，并推导合规认识类型
     */
    function evaluateInquiryBoundary(session = {}, questionText = '', questionTopic = '') {
        const qTopic = safeStr(questionTopic, safeStr(questionText)).toLowerCase();
        const sensitive = safeArr(session.sensitiveTopics).some(s => qTopic.includes(s.toLowerCase()));
        if (sensitive) {
            return {
                epistemicType: EPISTEMIC_TYPE.SILENCE,
                allowedToAnswer: false,
                reason: '问题触及角色情感防线或誓言保密范畴，触发沉默/戒备'
            };
        }

        const isBlindSpot = safeArr(session.blindSpots).some(b => qTopic.includes(b.toLowerCase()));
        if (isBlindSpot) {
            return {
                epistemicType: EPISTEMIC_TYPE.UNKNOWN,
                allowedToAnswer: false,
                reason: '问题属于角色认知盲区或尚未发生之事，严格回答未知，严禁虚构'
            };
        }

        const isEvidenced = safeArr(session.knownFacts).some(k => qTopic.includes(k.toLowerCase()) || k.toLowerCase().includes(qTopic));
        if (isEvidenced) {
            return {
                epistemicType: EPISTEMIC_TYPE.EVIDENCED_RECALL,
                allowedToAnswer: true,
                reason: '问题位于角色确切知情与亲历经历范围内'
            };
        }

        // 其余情况为推断
        return {
            epistemicType: EPISTEMIC_TYPE.INFERENCE,
            allowedToAnswer: true,
            reason: '角色并未亲历全部细节，仅能作为有限推论或揣测'
        };
    }

    /**
     * 记录访谈问答轮次
     */
    function recordInterviewTurn(session = {}, turnInput = {}) {
        const s = {
            ...session,
            turns: safeArr(session.turns).map(t => ({ ...t }))
        };

        if (s.status === INTERVIEW_STATUS.CONCLUDED) {
            throw new Error('访谈会话已结案，不可继续追加问答');
        }

        const question = safeStr(turnInput.question, '');
        const topic = safeStr(turnInput.topic, '');
        const boundary = evaluateInquiryBoundary(s, question, topic);

        // 如果传入了指定的 epistemicType，做边界合法性约束
        let resolvedEpistemic = boundary.epistemicType;
        if (turnInput.epistemicType && Object.values(EPISTEMIC_TYPE).includes(turnInput.epistemicType)) {
            // 若边界判定为绝对 unknown，但输入试图伪造成回忆，强制降级回 unknown 防虚构
            if (boundary.epistemicType === EPISTEMIC_TYPE.UNKNOWN && turnInput.epistemicType === EPISTEMIC_TYPE.EVIDENCED_RECALL) {
                resolvedEpistemic = EPISTEMIC_TYPE.UNKNOWN;
            } else {
                resolvedEpistemic = turnInput.epistemicType;
            }
        }

        let answerContent = safeStr(turnInput.answer, '');
        if (resolvedEpistemic === EPISTEMIC_TYPE.UNKNOWN && !answerContent) {
            answerContent = '这件事我当时完全不在场，确实不清楚细节。';
        } else if (resolvedEpistemic === EPISTEMIC_TYPE.SILENCE && !answerContent) {
            answerContent = '……（沉默良久，移开目光没有正面回答）';
        }

        const turn = {
            turnId: safeStr(turnInput.turnId, `turn_${s.turns.length + 1}_${Math.random().toString(36).slice(2, 6)}`),
            question,
            topic,
            answer: answerContent,
            epistemicType: resolvedEpistemic,
            boundaryReason: boundary.reason,
            adoptionStatus: Object.values(ADOPTION_STATUS).includes(turnInput.adoptionStatus)
                ? turnInput.adoptionStatus
                : ADOPTION_STATUS.DRAFT,
            citedFacts: safeArr(turnInput.citedFacts).map(f => safeStr(f)).filter(Boolean),
            recordedAt: safeStr(turnInput.recordedAt, new Date().toISOString())
        };

        s.turns.push(turn);
        s.lastActivityAt = new Date().toISOString();
        if (s.status === INTERVIEW_STATUS.PAUSED) {
            s.status = INTERVIEW_STATUS.ACTIVE;
        }

        return s;
    }

    /**
     * 暂停访谈
     */
    function pauseInterview(session = {}) {
        return {
            ...session,
            status: INTERVIEW_STATUS.PAUSED,
            lastActivityAt: new Date().toISOString()
        };
    }

    /**
     * 恢复访谈
     */
    function resumeInterview(session = {}) {
        return {
            ...session,
            status: INTERVIEW_STATUS.ACTIVE,
            lastActivityAt: new Date().toISOString()
        };
    }

    /**
     * 采纳或废弃回答
     */
    function updateTurnAdoption(session = {}, turnId = '', targetStatus = ADOPTION_STATUS.ADOPTED) {
        const s = {
            ...session,
            turns: safeArr(session.turns).map(t => ({ ...t }))
        };
        const target = s.turns.find(t => t.turnId === turnId);
        if (!target) return s;

        if (Object.values(ADOPTION_STATUS).includes(targetStatus)) {
            target.adoptionStatus = targetStatus;
        }
        s.lastActivityAt = new Date().toISOString();
        return s;
    }

    /**
     * 提取可用于长期记忆注入的回答（过滤掉草稿、废弃及未证实未知项）
     */
    function filterAdoptedForInjection(session = {}) {
        const adoptedTurns = safeArr(session.turns).filter(t => t.adoptionStatus === ADOPTION_STATUS.ADOPTED);
        return adoptedTurns.map(t => ({
            characterId: session.characterId,
            characterName: session.characterName,
            topic: t.topic,
            statement: t.answer,
            epistemicType: t.epistemicType,
            isSubjectiveInference: t.epistemicType === EPISTEMIC_TYPE.INFERENCE,
            sourceRef: `interview:${session.sessionId}:${t.turnId}`
        }));
    }

    /**
     * 模块自检函数
     */
    function boundedInterviewSelfCheck() {
        const problems = [];
        try {
            let session = createInterviewSession({
                sessionId: 'intv_self_check',
                characterId: 'char_luojia',
                characterName: '珞珈',
                knownFacts: ['中考前夕去过河堤', '借给弟弟自行车'],
                sensitiveTopics: ['母亲遗留的日记'],
                blindSpots: ['十年后省城股权交易', '隔壁班同学高考成绩']
            });

            // 1. 正常回忆测试
            session = recordInterviewTurn(session, {
                question: '你中考前夕去过河堤吗？',
                topic: '河堤',
                answer: '去过，那天风很大。',
                adoptionStatus: ADOPTION_STATUS.CANDIDATE
            });
            const turn1 = session.turns[0];
            if (!turn1 || turn1.epistemicType !== EPISTEMIC_TYPE.EVIDENCED_RECALL) {
                problems.push('已知事实未能识别为 evidenced_recall');
            }

            // 2. 盲区测试（禁止虚构，必须 unknown）
            session = recordInterviewTurn(session, {
                question: '十年后省城股权交易究竟是怎么回事？',
                topic: '十年后省城股权交易'
            });
            const turn2 = session.turns[1];
            if (!turn2 || turn2.epistemicType !== EPISTEMIC_TYPE.UNKNOWN) {
                problems.push('盲区未决事实未能强制约束为 unknown');
            }

            // 3. 敏感防线测试（触发 silence）
            session = recordInterviewTurn(session, {
                question: '母亲遗留的日记里写了什么？',
                topic: '母亲遗留的日记'
            });
            const turn3 = session.turns[2];
            if (!turn3 || turn3.epistemicType !== EPISTEMIC_TYPE.SILENCE) {
                problems.push('敏感保密话题未能识别为 silence');
            }

            // 4. 暂停与恢复测试
            session = pauseInterview(session);
            if (session.status !== INTERVIEW_STATUS.PAUSED) {
                problems.push('访谈暂停状态未置位');
            }
            session = resumeInterview(session);
            if (session.status !== INTERVIEW_STATUS.ACTIVE) {
                problems.push('访谈恢复状态未恢复');
            }

            // 5. 注入隔离测试：未采纳不进入长期记忆
            const beforeAdopt = filterAdoptedForInjection(session);
            if (beforeAdopt.length !== 0) {
                problems.push('未采纳的草稿或候选错误地进入了注入列表');
            }

            // 采纳第 1 轮
            session = updateTurnAdoption(session, turn1.turnId, ADOPTION_STATUS.ADOPTED);
            const afterAdopt = filterAdoptedForInjection(session);
            if (afterAdopt.length !== 1 || afterAdopt[0].statement !== '去过，那天风很大。') {
                problems.push('已采纳回答未能正确提取为长期记忆');
            }
        } catch (err) {
            problems.push(`自检运行异常: ${err && err.message ? err.message : String(err)}`);
        }
        return { problems };
    }

    const BoundedInterview = Object.freeze({
        EPISTEMIC_TYPE,
        INTERVIEW_STATUS,
        ADOPTION_STATUS,
        createInterviewSession,
        evaluateInquiryBoundary,
        recordInterviewTurn,
        pauseInterview,
        resumeInterview,
        updateTurnAdoption,
        filterAdoptedForInjection,
        boundedInterviewSelfCheck
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = BoundedInterview;
    }
    root.BoundedInterview = BoundedInterview;
    root.LonShaBoundedInterview = BoundedInterview;
})(typeof globalThis !== 'undefined' ? globalThis : window);