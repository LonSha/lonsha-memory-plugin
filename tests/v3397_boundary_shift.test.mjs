import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    BOUNDARY_TIER,
    PREROGATIVES,
    createBoundaryState,
    grantPrerogative,
    triggerBoundaryRefortification
} = require('../psychological-boundary-shift.js');

test('L10-X6 · createBoundaryState & grantPrerogative 关系特许突破与层级跃迁', () => {
    let state = createBoundaryState('user_bob', BOUNDARY_TIER.CAUTIOUS);
    assert.equal(state.tier, 'cautious');
    assert.equal(state.allowedPrerogatives.length, 0);

    // 授予称谓特许与肢体接触特许 -> 升级为熟稔 (familiar)
    state = grantPrerogative(state, PREROGATIVES.NICKNAME_ALLOWED);
    state = grantPrerogative(state, PREROGATIVES.PHYSICAL_PROXIMITY);
    assert.equal(state.tier, 'familiar');
    assert.equal(state.allowedPrerogatives.length, 2);

    // 进一步解锁隐私探寻与脆弱袒露 -> 升级为亲密 (intimate)
    state = grantPrerogative(state, PREROGATIVES.PAST_SECRETS_PROBE);
    state = grantPrerogative(state, PREROGATIVES.VULNERABILITY_SHARE);
    assert.equal(state.tier, 'intimate');
    assert.equal(state.allowedPrerogatives.length, 4);
});

test('L10-X6 · triggerBoundaryRefortification 信任受创与壁垒收缩', () => {
    let state = createBoundaryState('user_bob', BOUNDARY_TIER.INTIMATE);
    assert.equal(state.tier, 'intimate');

    // 遭遇背叛事件
    state = triggerBoundaryRefortification(state, '将私密信物转交他人');
    assert.equal(state.tier, 'cautious');
    assert.ok(state.trustScore < 0.4);
    assert.ok(state.defenseNarrative.includes('心理防御壁垒重构'));
    assert.ok(state.defenseNarrative.includes('将私密信物转交他人'));
    // 脆弱与隐私特许被剥夺，仅保留称谓特许
    assert.deepEqual(state.allowedPrerogatives, [PREROGATIVES.NICKNAME_ALLOWED]);
});