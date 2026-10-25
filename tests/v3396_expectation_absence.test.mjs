import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    EXPECTATION_STATUS,
    createExpectation,
    evaluateExpectations
} = require('../expectation-absence-tracker.js');

test('L10-X5 · createExpectation 槽位规范化', () => {
    const exp = createExpectation({
        expector: 'alice',
        targetActor: 'bob',
        actionDescription: '送来生日蛋糕',
        registeredFloor: 50,
        dueFloor: 60,
        significance: 0.8
    });

    assert.equal(exp.expector, 'alice');
    assert.equal(exp.targetActor, 'bob');
    assert.equal(exp.status, EXPECTATION_STATUS.PENDING);
    assert.equal(exp.dueFloor, 60);
});

test('L10-X5 · evaluateExpectations 履约与逾期缺席判定', () => {
    const exp1 = createExpectation({
        id: 'exp_01',
        expector: 'alice',
        targetActor: 'bob',
        actionDescription: '在车站接人',
        dueFloor: 30
    });
    const exp2 = createExpectation({
        id: 'exp_02',
        expector: 'alice',
        targetActor: 'bob',
        actionDescription: '回复求助信',
        dueFloor: 40
    });

    const list = [exp1, exp2];

    // 第 25 楼，bob 履约了 exp1
    const { updatedList: listAt25, newlyAbsents: abs25 } = evaluateExpectations(list, 25, [
        { actor: 'bob', description: 'Bob提前到达并在车站接人成功' }
    ]);
    assert.equal(abs25.length, 0);
    assert.equal(listAt25.find(e => e.id === 'exp_01').status, EXPECTATION_STATUS.FULFILLED);
    assert.equal(listAt25.find(e => e.id === 'exp_02').status, EXPECTATION_STATUS.PENDING);

    // 第 45 楼，推进超过了 exp2 的截止楼层 40，且无回复信记录 -> 判定缺席
    const { updatedList: listAt45, newlyAbsents: abs45 } = evaluateExpectations(listAt25, 45, []);
    assert.equal(abs45.length, 1);
    assert.equal(abs45[0].id, 'exp_02');
    assert.equal(abs45[0].status, EXPECTATION_STATUS.BREACHED_ABSENT);
    assert.ok(abs45[0].memoryNarrative.includes('反常缺席'));
    assert.ok(abs45[0].memoryNarrative.includes('未能在约定节点'));
});