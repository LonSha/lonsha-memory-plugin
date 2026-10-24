/* ============================================================
 * tests/v3372_seventh_cycle_batch_a.test.mjs — [第七期 · 批次 A]
 * M7-O1 记忆收件箱 + M7-O2 记忆修订台 + M7-O3 召回解释与用户校正
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const R = process.cwd();

const MemoryInbox = require_(path.join(R, 'memory-inbox.js'));
const FactCorrectionBench = require_(path.join(R, 'fact-correction-bench.js'));
const RecallCorrection = require_(path.join(R, 'recall-correction.js'));

test('M7-O1 · 记忆收件箱：结构自检与词表完整性', () => {
    const check = MemoryInbox.memoryInboxSelfCheck();
    assert.deepEqual(check.problems, []);
    assert.equal(Object.keys(MemoryInbox.MEMORY_INBOX_KINDS).length, 4);
    assert.equal(Object.keys(MemoryInbox.MEMORY_INBOX_STATUS).length, 5);
});

test('M7-O1 · 记忆收件箱：候选经历候审流转（确认、改写、拒绝、暂存与消费契约）', () => {
    let inbox = [];

    // 1. 准入一组候选记忆（事实、偏好、推断、承诺）
    const r1 = MemoryInbox.admitCandidate(inbox, {
        id: 'c_fact_1',
        kind: MemoryInbox.MEMORY_INBOX_KINDS.FACT,
        content: '小雪住在海淀区五道口',
        sourceFloor: 12,
        inferred: false,
        confidence: 0.95
    });
    const r2 = MemoryInbox.admitCandidate(r1.nextInbox, {
        id: 'c_pref_1',
        kind: MemoryInbox.MEMORY_INBOX_KINDS.PREFERENCE,
        content: '小雪喜欢喝无糖乌龙茶',
        sourceFloor: 14,
        inferred: false,
        confidence: 0.9
    });
    const r3 = MemoryInbox.admitCandidate(r2.nextInbox, {
        id: 'c_infer_1',
        kind: MemoryInbox.MEMORY_INBOX_KINDS.FACT,
        content: '小雪可能打算换工作',
        sourceFloor: 16,
        inferred: true,
        confidence: 0.65
    });
    const r4 = MemoryInbox.admitCandidate(r3.nextInbox, {
        id: 'c_comm_1',
        kind: MemoryInbox.MEMORY_INBOX_KINDS.COMMITMENT,
        content: '答应周六下午陪她去美术馆',
        sourceFloor: 18,
        inferred: false,
        confidence: 0.98
    });

    inbox = r4.nextInbox;
    assert.equal(inbox.length, 4);
    assert.ok(inbox.every(it => it.status === MemoryInbox.MEMORY_INBOX_STATUS.PENDING));

    // 2. 用户操作：确认 c_fact_1
    const confRes = MemoryInbox.confirmItem(inbox, 'c_fact_1');
    assert.ok(confRes.ok);
    inbox = confRes.nextInbox;

    // 3. 用户操作：改写 c_pref_1（修正为具体品牌）
    const rwRes = MemoryInbox.rewriteItem(inbox, 'c_pref_1', '小雪喜欢喝三得利无糖乌龙茶，不加冰');
    assert.ok(rwRes.ok);
    inbox = rwRes.nextInbox;
    const rwItem = inbox.find(it => it.id === 'c_pref_1');
    assert.equal(rwItem.status, MemoryInbox.MEMORY_INBOX_STATUS.REWRITTEN);
    assert.equal(rwItem.content, '小雪喜欢喝三得利无糖乌龙茶，不加冰');
    assert.equal(rwItem.originalDraft, '小雪喜欢喝无糖乌龙茶');

    // 4. 用户操作：拒绝 c_infer_1（推测不准确）
    const rejRes = MemoryInbox.rejectItem(inbox, 'c_infer_1', '只是抱怨一下现状，未打算跳槽');
    assert.ok(rejRes.ok);
    inbox = rejRes.nextInbox;

    // 5. 用户操作：暂存 c_comm_1
    const stRes = MemoryInbox.stageItem(inbox, 'c_comm_1');
    assert.ok(stRes.ok);
    inbox = stRes.nextInbox;

    // 6. 验证消费侧契约
    const recallable = MemoryInbox.filterAdmittedForRecall(inbox);
    assert.equal(recallable.length, 2, '仅 confirmed 与 rewritten 的条目可供召回');
    assert.ok(recallable.some(it => it.id === 'c_fact_1'));
    assert.ok(recallable.some(it => it.id === 'c_pref_1'));

    const rejected = MemoryInbox.filterRejectedForSuppression(inbox);
    assert.equal(rejected.length, 1, 'rejected 条目单列用于负面抑制');
    assert.equal(rejected[0].id, 'c_infer_1');
    assert.equal(rejected[0].rejectionReason, '只是抱怨一下现状，未打算跳槽');
});

test('M7-O2 · 记忆修订台：依赖影响图分析与分级', () => {
    const dependents = [
        { id: 'sum_1', category: 'summary', dependsOn: ['xiaoxue:age'], autoRecomputable: true },
        { id: 'rel_1', category: 'relationship', dependsOn: ['xiaoxue:age', 'user:age'] },
        { id: 'note_1', category: 'user_note', dependsOn: ['xiaoxue:age'], isManual: true },
        { id: 'unrelated_1', category: 'goal', dependsOn: ['project:deadline'] }
    ];

    const impact = FactCorrectionBench.traceImpactGraph('xiaoxue:age', dependents);
    assert.equal(impact.affected.length, 3);
    assert.equal(impact.unaffected.length, 1);
    assert.equal(impact.unaffected[0].id, 'unrelated_1');

    const sumDep = impact.affected.find(a => a.id === 'sum_1');
    const relDep = impact.affected.find(a => a.id === 'rel_1');
    const noteDep = impact.affected.find(a => a.id === 'note_1');

    assert.equal(sumDep.tier, FactCorrectionBench.IMPACT_TIERS.RECOMPUTABLE);
    assert.equal(relDep.tier, FactCorrectionBench.IMPACT_TIERS.NEEDS_CONFIRM);
    assert.equal(noteDep.tier, FactCorrectionBench.IMPACT_TIERS.MANUAL_ONLY);
});

test('M7-O2 · 记忆修订台：修订、下游标记过期、回滚与撤销', () => {
    const fact = {
        key: 'xiaoxue:city',
        value: '上海',
        version: 1,
        history: []
    };

    const dependents = [
        { id: 'plan_weekend', dependsOn: ['xiaoxue:city'], value: '外滩散步' },
        { id: 'unrelated_goal', dependsOn: ['user:career'], value: '考研' }
    ];

    // 1. 修订源事实为“北京”
    const rev = FactCorrectionBench.reviseFact(fact, '北京', dependents, 1000);
    assert.ok(rev.ok);
    assert.equal(rev.updatedFact.value, '北京');
    assert.equal(rev.updatedFact.version, 2);
    assert.equal(rev.updatedFact.history.length, 1);
    assert.equal(rev.updatedFact.history[0].value, '上海');

    // 下游受影响项标为 stale，无关分支不变
    const depPlan = rev.updatedDependents.find(d => d.id === 'plan_weekend');
    const depGoal = rev.updatedDependents.find(d => d.id === 'unrelated_goal');
    assert.equal(depPlan.stale, true);
    assert.equal(depPlan.staleSourceKey, 'xiaoxue:city');
    assert.equal(depGoal.stale, undefined, '无关分支绝不标 stale');

    // 2. 回滚修订
    const roll = FactCorrectionBench.rollbackFact(rev.updatedFact, rev.updatedDependents, 2000);
    assert.ok(roll.ok);
    assert.equal(roll.updatedFact.value, '上海');
    assert.equal(roll.updatedFact.version, 1);
    const depPlanRoll = roll.updatedDependents.find(d => d.id === 'plan_weekend');
    assert.equal(depPlanRoll.stale, undefined, '回滚后下游 stale 标记解除');

    // 3. 撤销源事实（彻底删除）
    const revokeRes = FactCorrectionBench.revokeSourceFact(fact, dependents, '事实有误，予以注销', 3000);
    assert.ok(revokeRes.ok);
    assert.equal(revokeRes.updatedFact.revoked, true);
    const depPlanRevoke = revokeRes.updatedDependents.find(d => d.id === 'plan_weekend');
    assert.equal(depPlanRevoke.stale, true);
    assert.equal(depPlanRevoke.unverifiable, true, '源事实注销后下游必须标记 unverifiable');
});

test('M7-O3 · 召回解释与用户校正：依据展开、结构化校正与无关查询零退化', () => {
    // 1. 模拟召回解释报告
    const kept = [
        { id: 'f1', factKey: 'xiaoxue:job', text: '小雪是自由插画师', sourceFloor: 20, score: 0.92 },
        { id: 'f2', factKey: 'xiaoli:job', text: '小李是程序员', sourceFloor: 22, score: 0.85 }
    ];
    const dropped = [
        { id: 'f3', factKey: 'xiaoxue:hobby', text: '小雪喜欢滑板', reason: RecallCorrection.EXCLUSION_REASONS.BUDGET_TRIMMED }
    ];

    const explanation = RecallCorrection.buildRecallExplanation(kept, dropped, { query: '小雪的工作', floor: 30 });
    assert.equal(explanation.evidences.length, 2);
    assert.equal(explanation.missedCandidates.length, 1);
    assert.equal(explanation.missedCandidates[0].reason, 'budget_trimmed');

    // 2. 用户发现查询“小雪的工作”时混入了小李的事实，进行校正标定（WRONG_PERSON）
    let ledger = [];
    const cr = RecallCorrection.recordUserCorrection(ledger, {
        targetFactKey: 'xiaoli:job',
        type: RecallCorrection.CORRECTION_TYPES.WRONG_PERSON,
        queryScope: '小雪',
        reason: '问的是小雪，不能混入小李的信息'
    });
    assert.ok(cr.ok);
    ledger = cr.nextLedger;
    assert.equal(ledger.length, 1);

    // 3. 再次查询“关于小雪的近况”：校正规则生效，排除 xiaoli:job
    const candidates = [
        { id: 'c1', factKey: 'xiaoxue:job', text: '小雪是自由插画师' },
        { id: 'c2', factKey: 'xiaoli:job', text: '小李是程序员' }
    ];
    const resFiltered = RecallCorrection.applyUserCorrections(candidates, '关于小雪的近况', ledger);
    assert.equal(resFiltered.admitted.length, 1);
    assert.equal(resFiltered.admitted[0].factKey, 'xiaoxue:job');
    assert.equal(resFiltered.dropped.length, 1);
    assert.equal(resFiltered.dropped[0].factKey, 'xiaoli:job');
    assert.equal(resFiltered.dropped[0].reason, RecallCorrection.EXCLUSION_REASONS.USER_CORRECTION_FILTERED);
    assert.equal(resFiltered.dropped[0].correctionType, RecallCorrection.CORRECTION_TYPES.WRONG_PERSON);

    // 4. 查询“技术团队小李的信息”（无关查询）：校正不生效，候选集完全零退化！
    const resUnrelated = RecallCorrection.applyUserCorrections(candidates, '技术团队小李的信息', ledger);
    assert.equal(resUnrelated.admitted.length, 2, '无关查询零退化：所有条目原样保留');
    assert.equal(resUnrelated.dropped.length, 0);

    // 5. 撤销校正：即刻恢复原行为
    const revRes = RecallCorrection.revertCorrection(ledger, ledger[0].id);
    assert.ok(revRes.ok);
    const resAfterRevert = RecallCorrection.applyUserCorrections(candidates, '关于小雪的近况', revRes.nextLedger);
    assert.equal(resAfterRevert.admitted.length, 2, '撤销校正后恢复初始行为');
});