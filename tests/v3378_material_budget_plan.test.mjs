import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Plan = require('../generation-material-budget-plan.js');

test('L9-O5 · 材料预算分层录取与超限安全裁剪', () => {
    const materials = [
        { id: 'm-req', tier: 'required', content: '绝对核心事实', tokenEstimate: 500 },
        { id: 'm-opt-1', tier: 'optional', score: 10, content: '高价值背景', tokenEstimate: 300 },
        { id: 'm-opt-2', tier: 'optional', score: 5, content: '低价值背景', tokenEstimate: 400 }
    ];

    // 预算仅 900：REQUIRED(500) + OPT1(300) = 800 <= 900 录取；OPT2(400) 超限被舍弃
    const plan = Plan.orchestrateMaterialPlan(materials, 900);
    assert.equal(plan.admittedCount, 2);
    assert.equal(plan.droppedCount, 1);
    assert.equal(plan.admitted[0].id, 'm-req');
    assert.equal(plan.admitted[1].id, 'm-opt-1');
    assert.equal(plan.dropped[0].id, 'm-opt-2');
    assert.equal(plan.usedTokens, 800);
});