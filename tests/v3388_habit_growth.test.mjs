import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { STAGES, recordGrowthEvidence, evaluateCompetencyAfterRevocation } = require('../character-habit-growth-evidence.js');

test('L9-X6 · 角色能力证据束演进与证据撤销后降级', () => {
    let bundle = { actorId: 'bob', skillOrHabit: 'craftsmanship', records: [] };

    // 记录尝试与有效实践
    bundle = recordGrowthEvidence(bundle, {
        stage: STAGES.ATTEMPTED,
        evidenceId: 'ev_first_try',
        description: '首次尝试修复时钟轮系'
    });
    bundle = recordGrowthEvidence(bundle, {
        stage: STAGES.EFFECTIVE,
        evidenceId: 'ev_success_workshop',
        description: '在师傅指导下完成榫卯连接',
        contextCondition: 'with_mentor'
    });

    assert.equal(bundle.records.length, 2);
    assert.equal(bundle.status, 'active');

    // 撤销工坊经历证据 -> 降级为待验证状态，不静默归零
    const downgraded = evaluateCompetencyAfterRevocation(bundle, ['ev_success_workshop']);
    assert.equal(downgraded.status, 'needs_reverification');
    assert.equal(downgraded.validRecords.length, 1);
    assert.equal(downgraded.revokedCount, 1);
});