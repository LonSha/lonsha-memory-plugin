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