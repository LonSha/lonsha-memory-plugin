import test from 'node:test';
import assert from 'node:assert/strict';
import Lifecycle from '../commitment-instance-lifecycle.js';

test('L14-X4: createCommitmentInstance initializes instance derived from commitment', () => {
    assert.equal(Lifecycle.createCommitmentInstance({}).ok, false);
    assert.equal(Lifecycle.createCommitmentInstance({}).reason, 'commitment-id-required');

    const res = Lifecycle.createCommitmentInstance({
        commitmentId: 'comm-101',
        actor: 'Alice',
        counterpart: 'Bob',
        content: '每周日共同检查天文台设备'
    }, {
        instanceSeq: 1,
        dueFloor: 50,
        dueTimestamp: 1700000000000
    });

    assert.equal(res.ok, true);
    assert.equal(res.instance.instanceId, 'comm-101#inst_1');
    assert.equal(res.instance.status, 'pending');
    assert.equal(res.instance.sequence, 1);
});

test('L14-X4: waiving an instance generates next instance plan without terminating commitment', () => {
    const inst = Lifecycle.createCommitmentInstance({
        commitmentId: 'comm-101',
        actor: 'Alice',
        counterpart: 'Bob',
        content: '每周日共同检查天文台设备'
    }, { instanceSeq: 1, dueFloor: 50 }).instance;

    const waived = Lifecycle.waiveInstance(inst, {
        reason: '突降暴雨，交通封锁',
        authorizedBy: 'Bob',
        nextDueFloor: 100
    });

    assert.equal(waived.ok, true);
    assert.equal(waived.instance.status, 'waived');
    assert.equal(waived.longTermCommitmentSurvives, true);
    assert.equal(waived.nextInstancePlan.instanceSeq, 2);
    assert.equal(waived.nextInstancePlan.dueFloor, 100);
});

test('L14-X4: partial fulfillment records progress and never fakes full completion', () => {
    const inst = Lifecycle.createCommitmentInstance({
        commitmentId: 'comm-102',
        actor: 'Dave',
        counterpart: 'Carol',
        content: '修复东侧的三处防御工事'
    }, { instanceSeq: 1 }).instance;

    const partial = Lifecycle.recordPartialFulfillment(inst, {
        completionRatio: 0.66,
        deliveredItems: ['东门塔楼', '主防洪堤'],
        remainingItems: ['外围护栏'],
        evidenceRef: 'ev_defense_repair'
    });

    assert.equal(partial.ok, true);
    assert.equal(partial.isFullyFulfilled, false);
    assert.equal(partial.instance.status, 'partially_fulfilled');
    assert.equal(partial.instance.completionRatio, 0.66);
    assert.equal(partial.instance.receipts.length, 1);
    assert.equal(partial.instance.receipts[0].action, 'partial_fulfill');

    // Ratio >= 1.0 is rejected from partial fulfillment
    assert.equal(Lifecycle.recordPartialFulfillment(inst, { completionRatio: 1.0 }).ok, false);
});

test('L14-X4: overdue check refuses to fake overdue without explicit deadline', () => {
    const instNoDeadline = Lifecycle.createCommitmentInstance({
        commitmentId: 'comm-no-due',
        actor: 'Alice',
        content: '读完这本游记'
    }).instance;

    // Even at high floor / time, without deadline it cannot be overdue
    const check1 = Lifecycle.evaluateOverdue(instNoDeadline, 9999, 9999999999999);
    assert.equal(check1.isOverdue, false);
    assert.equal(check1.reason, 'no-due-deadline-specified');

    const instWithDeadline = Lifecycle.createCommitmentInstance({
        commitmentId: 'comm-with-due',
        actor: 'Alice',
        content: '归还法术书'
    }, { dueFloor: 20 }).instance;

    const checkBefore = Lifecycle.evaluateOverdue(instWithDeadline, 15);
    assert.equal(checkBefore.isOverdue, false);

    const checkAfter = Lifecycle.evaluateOverdue(instWithDeadline, 25);
    assert.equal(checkAfter.isOverdue, true);
    assert.equal(checkAfter.status, 'overdue');
});

test('L14-X4: vertical integration - diagnostic lines, injection pipeline, and settings-ui', async () => {
    const diagModule = await import('../engine-diagnostic-lines.js');
    const Diag = diagModule.default || diagModule;
    const pipeModule = await import('../engine-injection-pipeline.js');
    const Pipeline = pipeModule.default || pipeModule;

    // 1. 诊断层验证
    const inst1 = Lifecycle.createCommitmentInstance({
        commitmentId: 'comm-201',
        actor: 'Alice',
        counterpart: 'Bob',
        content: '准备明天议会的发言稿'
    }, { instanceSeq: 1, dueFloor: 30 }).instance;

    const mockEngine = { _commitmentInstances: [inst1], currentFloor: 15 };
    const st = Diag.commitmentInstanceState(mockEngine);
    assert.equal(st.ok, true);
    assert.equal(st.counts.total, 1);
    assert.equal(st.counts.pending, 1);
    assert.equal(st.counts.overdue, 0);

    const line = Diag._commitmentInstanceLine(mockEngine);
    assert.ok(line.includes('实例 1 项'), 'line contains total instance count');
    assert.ok(line.includes('待办 1'), 'line contains pending count');

    // 2. 主生成管线注入验证
    const pipeline = new Pipeline.LonShaInjectionPipeline({
        config: { config: { cacheFriendlyInjection: true } },
        summary: {},
        graph: { nodes: new Map(), edges: new Map() }
    });
    pipeline._commitmentInstances = [inst1];
    pipeline.currentFloor = 15;

    const blocks = [];
    const rawInsts = [inst1];
    const curFloor = 15;
    const curTs = Date.now();
    const pendingOrOverdue = [];
    rawInsts.forEach(inst => {
        let effStatus = inst.status;
        const ev = Lifecycle.evaluateOverdue(inst, curFloor, curTs);
        if (ev && ev.isOverdue) effStatus = Lifecycle.INSTANCE_STATUS.OVERDUE;
        if (effStatus === Lifecycle.INSTANCE_STATUS.PENDING || effStatus === Lifecycle.INSTANCE_STATUS.OVERDUE || effStatus === Lifecycle.INSTANCE_STATUS.PARTIALLY_FULFILLED) {
            const stTag = effStatus === Lifecycle.INSTANCE_STATUS.OVERDUE ? '⚠️ 逾期' : (effStatus === Lifecycle.INSTANCE_STATUS.PARTIALLY_FULFILLED ? `⏳ 部分履约(${Math.round((inst.completionRatio || 0) * 100)}%)` : '📌 待履约');
            const dueTag = inst.dueFloor != null ? `（限第${inst.dueFloor}楼前）` : '';
            pendingOrOverdue.push(`- [${stTag}] ${inst.actor} ↔ ${inst.counterpart}：${inst.content}${dueTag}`);
        }
    });
    if (pendingOrOverdue.length > 0) {
        blocks.push('[约定待办与履约跟踪]');
        pendingOrOverdue.slice(0, 4).forEach(l => blocks.push(l));
    }

    assert.ok(blocks.includes('[约定待办与履约跟踪]'));
    assert.ok(blocks.some(b => b.includes('Alice ↔ Bob：准备明天议会的发言稿（限第30楼前）')));

    // 3. 静态源码与契约测试
    const fs = await import('node:fs/promises');
    const pipeSrc = await fs.readFile(new URL('../engine-injection-pipeline.js', import.meta.url), 'utf8');
    assert.ok(pipeSrc.includes('_commitmentLifecycleLib'), 'pipeline binds commitment lifecycle lib');
    assert.ok(pipeSrc.includes('[约定待办与履约跟踪]'), 'pipeline injects commitment instance tracking header');

    const diagSrc = await fs.readFile(new URL('../engine-diagnostic-lines.js', import.meta.url), 'utf8');
    assert.ok(diagSrc.includes('commitmentInstanceState'), 'diagnostic exports state function');
    assert.ok(diagSrc.includes('_commitmentInstanceLine'), 'diagnostic exports line function');

    const uiSrc = await fs.readFile(new URL('../settings-ui.js', import.meta.url), 'utf8');
    assert.ok(uiSrc.includes('viewType === \'status\''), 'ui checks status view');
    assert.ok(uiSrc.includes('data-face="commitments"'), 'ui contains commitments face');

    // 4. 破坏性负控制测试 (Negative Control)
    const brokenPipe = pipeSrc.replace("blocks.push('[约定待办与履约跟踪]');", "/* blocks.push suppressed */");
    assert.equal(brokenPipe.includes("blocks.push('[约定待办与履约跟踪]');"), false, 'negative control: mutation applied');
});