// tests/v3372_seventh_cycle_expansion_batch_a.test.mjs — [LonSha记忆插件 · 第七期拓展批次 A]
import test from 'node:test';
import assert from 'node:assert/strict';

import OralHistoryArchive from '../oral-history-archive.js';
import BoundedInterview from '../bounded-interview.js';

test('LonSha · 第七期拓展批次 A · M7-X1 口述史与多声部档案', async (t) => {
    await t.test('自检零异常', () => {
        const res = OralHistoryArchive.oralHistoryArchiveSelfCheck();
        assert.deepEqual(res.problems, []);
    });

    await t.test('四位讲述者、多视角并列且不裁决单一真相', () => {
        let evt = OralHistoryArchive.createOralHistoryEvent({
            id: 'evt_festival_fire',
            title: '元宵夜失火疑云'
        });

        // 视角 1
        evt = OralHistoryArchive.recordPerspective(evt, {
            witnessId: 'witness_a',
            witnessName: '打更老赵',
            narrative: '我看到后巷有烟，以为是有人放鞭炮。',
            details: [{ topic: '起火原因', statement: '燃放鞭炮' }]
        });
        // 视角 2
        evt = OralHistoryArchive.recordPerspective(evt, {
            witnessId: 'witness_b',
            witnessName: '酒馆掌柜',
            narrative: '那是后厨堆的干柴着了，跟鞭炮没关系。',
            details: [{ topic: '起火原因', statement: '后厨干柴自燃' }]
        });
        // 视角 3
        evt = OralHistoryArchive.recordPerspective(evt, {
            witnessId: 'witness_c',
            witnessName: '巡夜差役',
            narrative: '赶到时火势已大，只顾着救人。',
            details: [{ topic: '救援反应', statement: '火势极大紧急救人' }]
        });
        // 视角 4
        evt = OralHistoryArchive.recordPerspective(evt, {
            witnessId: 'witness_d',
            witnessName: '隔壁裁缝',
            narrative: '我当时睡熟了，听到铜锣响才披衣服出来。',
            details: [{ topic: '惊醒时刻', statement: '闻铜锣而起' }]
        });

        assert.equal(evt.perspectives.length, 4);

        // 比对分析：起火原因产生争议(dispute)，保持并列记录
        const analysis = OralHistoryArchive.analyzeGapsAndOverlaps(evt);
        assert.equal(analysis.disputes.length, 1);
        assert.equal(analysis.disputes[0].topic, '起火原因');
        assert.equal(analysis.disputes[0].perspectives.length, 2);

        // 生成后续定向探访问题
        const inquiries = OralHistoryArchive.generateFollowupInquiries(evt, analysis);
        assert.ok(inquiries.some(q => q.topic === '起火原因' && q.type === 'dispute_clarification'));
    });

    await t.test('撤回公开授权保留归档原件，严禁物理删除', () => {
        let evt = OralHistoryArchive.createOralHistoryEvent({ id: 'evt_retract_test' });
        evt = OralHistoryArchive.recordPerspective(evt, {
            witnessId: 'w_sensitive',
            witnessName: '隐名当事人',
            narrative: '这段往事我不想让外人看。',
            details: [{ topic: '往事', statement: '私密陈述' }]
        });

        evt = OralHistoryArchive.retractPerspectivePublicity(evt, 'w_sensitive', '当事人要求收回公开权限');
        const p = evt.perspectives.find(item => item.witnessId === 'w_sensitive');
        assert.equal(p.visibility, OralHistoryArchive.VISIBILITY_SCOPE.RETRACTED);
        assert.equal(p.narrative, '这段往事我不想让外人看。');
        assert.equal(p.revisionHistory.length, 1);
    });
});

test('LonSha · 第七期拓展批次 A · M7-X4 有界角色访谈模拟', async (t) => {
    await t.test('自检零异常', () => {
        const res = BoundedInterview.boundedInterviewSelfCheck();
        assert.deepEqual(res.problems, []);
    });

    await t.test('知情边界与认识状态约束（盲区禁止虚构、敏感沉默、已知回忆）', () => {
        const session = BoundedInterview.createInterviewSession({
            sessionId: 'intv_boundary_demo',
            characterId: 'char_a',
            characterName: '阿宁',
            knownFacts: ['当年同窗聚会', '借走一把雨伞'],
            sensitiveTopics: ['家族负债'],
            blindSpots: ['十年后海外投资', '省城暗桩名单']
        });

        // 1. 已知事实 -> 回忆
        const b1 = BoundedInterview.evaluateInquiryBoundary(session, '你当年借走过谁的雨伞吗？', '借走一把雨伞');
        assert.equal(b1.epistemicType, BoundedInterview.EPISTEMIC_TYPE.EVIDENCED_RECALL);
        assert.equal(b1.allowedToAnswer, true);

        // 2. 盲区 -> 未知（绝对禁止虚构）
        const b2 = BoundedInterview.evaluateInquiryBoundary(session, '省城暗桩名单究竟在谁手里？', '省城暗桩名单');
        assert.equal(b2.epistemicType, BoundedInterview.EPISTEMIC_TYPE.UNKNOWN);
        assert.equal(b2.allowedToAnswer, false);

        // 3. 敏感防线 -> 沉默
        const b3 = BoundedInterview.evaluateInquiryBoundary(session, '当时你家的家族负债到底有多少？', '家族负债');
        assert.equal(b3.epistemicType, BoundedInterview.EPISTEMIC_TYPE.SILENCE);
        assert.equal(b3.allowedToAnswer, false);
    });

    await t.test('未采纳回答绝不注入，显式采纳方可提取', () => {
        let session = BoundedInterview.createInterviewSession({
            sessionId: 'intv_adopt_demo',
            characterId: 'char_b',
            characterName: '老陈',
            knownFacts: ['旧码头仓库货箱编号']
        });

        // 记录草稿轮次
        session = BoundedInterview.recordInterviewTurn(session, {
            question: '旧码头仓库货箱编号是多少？',
            topic: '旧码头仓库货箱编号',
            answer: '是七号柜，上面写着红漆。',
            adoptionStatus: BoundedInterview.ADOPTION_STATUS.DRAFT
        });

        // 此时不应进入注入
        assert.equal(BoundedInterview.filterAdoptedForInjection(session).length, 0);

        // 采纳
        const turnId = session.turns[0].turnId;
        session = BoundedInterview.updateTurnAdoption(session, turnId, BoundedInterview.ADOPTION_STATUS.ADOPTED);

        const injected = BoundedInterview.filterAdoptedForInjection(session);
        assert.equal(injected.length, 1);
        assert.equal(injected[0].statement, '是七号柜，上面写着红漆。');
    });
});