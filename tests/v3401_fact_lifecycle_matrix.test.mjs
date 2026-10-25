import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    FACT_STATE,
    createFactEntry,
    transitionFactState,
    filterInjectableFacts
} = require('../fact-unified-lifecycle-matrix.js');

test('L10-O1 · createFactEntry & transitionFactState 状态规范与强契约', () => {
    let fact = createFactEntry({
        content: 'Alice 曾在旧灯塔留下了一本日记',
        sourceFloor: 12,
        occurredAt: '三年前深秋',
        learnedAt: '第12楼对白',
        validUntilFloor: 100
    });

    assert.equal(fact.state, FACT_STATE.DRAFT);
    assert.equal(fact.verifiedBy, null);

    // 尝试无验证人转为 VERIFIED -> 必须抛出异常（防伪造已确认）
    assert.throws(() => {
        transitionFactState(fact, FACT_STATE.VERIFIED, {});
    }, /必须提供明确的验证者/);

    // 正确确认
    fact = transitionFactState(fact, FACT_STATE.VERIFIED, { verifiedBy: 'user_inspect' });
    assert.equal(fact.state, FACT_STATE.VERIFIED);
    assert.equal(fact.verifiedBy, 'user_inspect');

    // 撤销事实并记录理由
    fact = transitionFactState(fact, FACT_STATE.REVOKED, { reason: '被后续剧情证伪为假线索' });
    assert.equal(fact.state, FACT_STATE.REVOKED);
    assert.equal(fact.revocationReason, '被后续剧情证伪为假线索');

    // 已撤销事实禁止直接转回 VERIFIED
    assert.throws(() => {
        transitionFactState(fact, FACT_STATE.VERIFIED, { verifiedBy: 'user_inspect' });
    }, /已明确撤销的事实禁止直接转为确认状态/);
});

test('L10-O1 · filterInjectableFacts 活跃候选与楼层有效期过滤', () => {
    const f1 = createFactEntry({ id: '1', content: '有效事实', state: FACT_STATE.VERIFIED, validUntilFloor: 50 });
    const f2 = createFactEntry({ id: '2', content: '草稿待定', state: FACT_STATE.DRAFT });
    const f3 = createFactEntry({ id: '3', content: '推测事实', state: FACT_STATE.HYPOTHETICAL, validUntilFloor: 80 });
    const f4 = createFactEntry({ id: '4', content: '已撤销', state: FACT_STATE.REVOKED });

    const all = [f1, f2, f3, f4];

    // 在第 30 楼：f1 和 f3 可注入，f2（草稿）和 f4（撤销）被过滤
    const at30 = filterInjectableFacts(all, 30);
    assert.equal(at30.length, 2);
    assert.deepEqual(at30.map(f => f.id), ['1', '3']);

    // 在第 60 楼：f1 超过 validUntilFloor 50 已失效，仅剩 f3
    const at60 = filterInjectableFacts(all, 60);
    assert.equal(at60.length, 1);
    assert.equal(at60[0].id, '3');
});