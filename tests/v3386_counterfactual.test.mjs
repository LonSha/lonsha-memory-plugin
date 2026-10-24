import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { EXPERIMENT_LAYERS, createExperimentBranch, addExperimentOutcome } = require('../counterfactual-experiment-bench.js');

test('L9-X4 · 受证据约束的反事实实验与正史隔离门禁', () => {
    const canonFacts = [{ id: 'f1', text: '主角在2015年离开了小镇' }];
    const branch = createExperimentBranch(canonFacts, {
        description: '如果当年没有离开小镇',
        choiceId: 'stay_in_town'
    });

    assert.equal(branch.isIsolated, true);
    assert.equal(branch.baseFactsCount, 1);

    const updated = addExperimentOutcome(branch, {
        statement: '在小镇经营了一家旧书店',
        layer: EXPERIMENT_LAYERS.PLAUSIBLE_DEDUCTION
    });

    assert.equal(updated.records.length, 1);
    assert.equal(updated.records[0].cannotPromoteToCanon, true);
    assert.equal(updated.records[0].layer, 'plausible_deduction');
});