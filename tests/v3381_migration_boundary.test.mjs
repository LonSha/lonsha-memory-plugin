import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { planMigrationTransfer } = require('../project-migration-boundary-bench.js');

test('L9-O8 · 跨项目记忆迁移与秘密边界阻断', () => {
    const facts = [
        { id: 'f1', text: '通用公开设定', scope: 'shared' },
        { id: 'f2', text: '平行世界专属秘密', scope: 'private', secretScope: true },
        { id: 'f3', text: '公开关系网' }
    ];

    const safePlan = planMigrationTransfer(facts, { includePrivate: false });
    assert.equal(safePlan.exportedCount, 2);
    assert.equal(safePlan.blockedCount, 1);
    assert.equal(safePlan.blocked[0].id, 'f2');

    const leakPlan = planMigrationTransfer(facts, { includePrivate: true });
    assert.equal(leakPlan.exportedCount, 3);
    assert.equal(leakPlan.blockedCount, 0);
});