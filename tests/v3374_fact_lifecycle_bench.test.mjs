import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Bench = require('../fact-unified-lifecycle-bench.js');

test('L9-O1 · 事实状态规范化与六态解析', () => {
    const rawActive = { id: 'f-1', subject: 'Alice', predicate: 'livesIn', object: 'District-9', floor: 12 };
    const parsedActive = Bench.normalizeFact(rawActive);
    assert.equal(parsedActive.state, Bench.LIFECYCLE_STATES.CANDIDATE);

    const rawConfirmed = { id: 'f-2', subject: 'Bob', predicate: 'role', object: 'Pilot', confirmed: true };
    const parsedConfirmed = Bench.normalizeFact(rawConfirmed);
    assert.equal(parsedConfirmed.state, Bench.LIFECYCLE_STATES.CONFIRMED);

    const rawRevoked = { id: 'f-3', subject: 'Charlie', predicate: 'status', object: 'Traitor', revoked: true };
    const parsedRevoked = Bench.normalizeFact(rawRevoked);
    assert.equal(parsedRevoked.state, Bench.LIFECYCLE_STATES.REVOKED);
});

test('L9-O1 · 状态转移裁决、审计留痕与不可逆保护', () => {
    const fact = Bench.normalizeFact({ id: 'f-100', subject: 'Eve', predicate: 'access', object: 'Admin', confirmed: true });
    assert.equal(fact.state, Bench.LIFECYCLE_STATES.CONFIRMED);

    // 裁决撤回
    const res = Bench.transitionFact(fact, Bench.LIFECYCLE_STATES.REVOKED, {
        reason: 'Security breach compromised key',
        operator: 'lonsha-admin'
    });

    assert.equal(res.ok, true);
    assert.equal(res.mutated, true);
    assert.equal(res.fact.state, Bench.LIFECYCLE_STATES.REVOKED);
    assert.equal(res.fact.revocationReason, 'Security breach compromised key');
    assert.equal(res.fact.revisionHistory.length, 1);
    assert.equal(res.fact.revisionHistory[0].operator, 'lonsha-admin');
});

test('L9-O1 · 注入上下文准入评定与策略差分', () => {
    const f1 = Bench.normalizeFact({ id: 'f-1', state: 'confirmed', subject: 'A' });
    const f2 = Bench.normalizeFact({ id: 'f-2', state: 'inference', confidence: 0.85, subject: 'B' });
    const f3 = Bench.normalizeFact({ id: 'f-3', state: 'inference', confidence: 0.4, subject: 'C' });
    const f4 = Bench.normalizeFact({ id: 'f-4', state: 'revoked', subject: 'D' });

    const facts = [f1, f2, f3, f4];

    // 平衡模式：confirmed + high-confidence inference 放行
    const balancedRes = Bench.evaluateAdmission(facts, Bench.ADMISSION_POLICY.BALANCED);
    assert.equal(balancedRes.admittedCount, 2);
    assert.deepEqual(balancedRes.admitted.map(x => x.id), ['f-1', 'f-2']);
    assert.equal(balancedRes.rejectedCount, 2);

    // 严苛模式：仅 confirmed
    const strictRes = Bench.evaluateAdmission(facts, Bench.ADMISSION_POLICY.STRICT);
    assert.equal(strictRes.admittedCount, 1);
    assert.equal(strictRes.admitted[0].id, 'f-1');

    // 绝对撤回不容许在任何策略下放行
    const exploratoryRes = Bench.evaluateAdmission(facts, Bench.ADMISSION_POLICY.EXPLORATORY);
    assert.equal(exploratoryRes.rejected.some(r => r.fact.id === 'f-4' && r.reason === 'strictly-revoked-by-user'), true);
});