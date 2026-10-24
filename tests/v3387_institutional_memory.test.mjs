import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { amendInstitutionalRule } = require('../institutional-collective-memory.js');

test('L9-X5 · 组织制度修订版本谱系保留', () => {
    let rules = [];

    // 制定初版规则
    const r1 = amendInstitutionalRule(rules, {
        ruleId: 'rule_curfew',
        title: '门禁条例',
        content: '晚上10点后禁止出入'
    });
    rules = r1.rules;
    assert.equal(rules.length, 1);
    assert.equal(rules[0].version, 1);
    assert.equal(rules[0].previousVersionContent, null);

    // 会议表决修订第二版
    const r2 = amendInstitutionalRule(rules, {
        ruleId: 'rule_curfew',
        title: '门禁条例（修正）',
        content: '周末延长至晚上11点',
        ratifiedBy: ['member_alice', 'member_bob']
    });
    rules = r2.rules;
    assert.equal(rules.length, 1);
    assert.equal(rules[0].version, 2);
    assert.equal(rules[0].previousVersionContent, '晚上10点后禁止出入');
    assert.equal(rules[0].ratifiedBy.length, 2);
});