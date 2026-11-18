// [v4.163.0 · R26-X4] 周报接纠错来源：四类各自计数，最大类可复算
// 验收口径：四类计数之和等于纠错总数，最大类与明细一致。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const C = require(join(ROOT, 'memory-checkup-page.js'));

function ledger() {
    let l = { days: [] };
    l = C.recordCorrections(l, '2026-11-10', ['edit', 'edit', 'owner']).ledger;
    l = C.recordCorrections(l, '2026-11-11', { time: 1, void: 1 }).ledger;
    return l;
}

test('X4-1 四类各自进日报：总数由四类相加得出，不是另外填一个数', () => {
    const l = ledger();
    assert.deepEqual(l.days[0].metrics, { corrections: 3, correctionEdit: 2, correctionOwner: 1, correctionTime: 0, correctionVoid: 0 });
    assert.equal(l.days[1].metrics.corrections, 2);
    assert.deepEqual(C.CORRECTION_KINDS, ['edit', 'owner', 'time', 'void']);
    assert.deepEqual(C.CORRECTION_METRICS, ['correctionEdit', 'correctionOwner', 'correctionTime', 'correctionVoid']);
});

test('X4-2 四类计数之和 = 纠错总数（逐日）', () => {
    const l = ledger();
    l.days.forEach((d) => {
        const sum = C.CORRECTION_KINDS.reduce((s, k, i) => s + d.metrics[C.CORRECTION_METRICS[i]], 0);
        assert.equal(sum, d.metrics.corrections, d.day);
    });
});

test('X4-3 整段明细：总数、一致性与四类逐项对上', () => {
    const b = C.correctionBreakdown(ledger());
    assert.equal(b.days, 2);
    assert.deepEqual(b.counts, { edit: 2, owner: 1, time: 1, void: 1 });
    assert.equal(b.total, 5);
    assert.equal(b.declaredTotal, 5);
    assert.equal(b.consistent, true);
});

test('X4-4 最大类与明细一致：edit 2 次最多', () => {
    const b = C.correctionBreakdown(ledger());
    assert.equal(b.top, 'edit');
    assert.equal(b.topCount, 2);
    assert.equal(b.tie, false);
    assert.deepEqual(b.leaders, ['edit']);
    assert.equal(b.counts[b.top], b.topCount);
});

test('X4-5 占比可复算：share 与 count/total 逐项一致，且合计为 1', () => {
    const b = C.correctionBreakdown(ledger());
    let sum = 0;
    C.CORRECTION_KINDS.forEach((k) => {
        assert.equal(b.share[k], Number((b.counts[k] / b.total).toFixed(4)), k);
        sum += b.share[k];
    });
    assert.ok(Math.abs(sum - 1) < 0.001, String(sum));
});

test('X4-6 单日口径：只算那一天，不等整本账', () => {
    const one = C.correctionBreakdown(ledger(), { day: '2026-11-10' });
    assert.equal(one.days, 1);
    assert.equal(one.total, 3);
    assert.equal(one.counts.time, 0);
    assert.equal(one.share.edit, 0.6667);
});

test('X4-7 平票不仲裁：两类并列时 top 为空、tie 为真', () => {
    let l = { days: [] };
    l = C.recordCorrections(l, '2026-11-12', ['edit', 'void']).ledger;
    const b = C.correctionBreakdown(l);
    assert.equal(b.tie, true);
    assert.equal(b.top, '');
    assert.deepEqual(b.leaders, ['edit', 'void']);
    assert.match(b.reason, /平票/);
});

test('X4-8 没有纠错 ⇒ 总数 0、top 为空，但不明说成「最好的一天」', () => {
    let l = { days: [] };
    l = C.recordDay(l, '2026-11-13', { recallHits: 4 }).ledger;
    const b = C.correctionBreakdown(l);
    assert.equal(b.total, 0);
    assert.equal(b.top, '');
    assert.equal(b.tie, false);
    assert.match(b.reason, /没有纠错记录/);
    C.CORRECTION_KINDS.forEach((k) => assert.equal(b.share[k], 0));
});

test('X4-9 同一天重复上报仍然覆盖不叠加（纠错也一样）', () => {
    let l = { days: [] };
    l = C.recordCorrections(l, '2026-11-14', ['edit']).ledger;
    const r = C.recordCorrections(l, '2026-11-14', ['owner', 'owner']);
    assert.equal(r.overwritten, true);
    assert.equal(r.total, 2);
    assert.equal(r.ledger.days.length, 1);
    assert.equal(r.ledger.days[0].metrics.correctionEdit, 0);
    assert.equal(r.ledger.days[0].metrics.corrections, 2);
});

test('X4-10 周报仍能读新指标，且自检绿', () => {
    const rep = C.weeklyReport(ledger());
    const row = rep.rows.find((r) => r.metric === 'correctionEdit');
    assert.ok(row, '四类纠错应当进周报的趋势行');
    assert.equal(row.first, 2);
    assert.equal(row.last, 0);
    assert.equal(row.direction, 'down');
    assert.equal(C.checkupSelfCheck().ok, true);
});
