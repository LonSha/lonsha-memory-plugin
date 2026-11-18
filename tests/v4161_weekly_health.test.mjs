// [v4.161.0 · R25-X4] 记忆健康周报：这周比上周好在哪/差在哪
// 验收口径：两次读数生成一份周报，趋势方向与两快照差值一致。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const C = require(join(ROOT, 'memory-checkup-page.js'));

function twoDays() {
    let l = { days: [] };
    l = C.recordDay(l, '2026-11-10', { recallHits: 3, newMemories: 2, deleted: 1, corrections: 0, hitRate: 0.6 }).ledger;
    l = C.recordDay(l, '2026-11-17', { recallHits: 9, newMemories: 1, deleted: 0, corrections: 2, hitRate: 0.8 }).ledger;
    return l;
}

test('X4-1 指标白名单固定，只存数字（正文一个字都不落盘）', () => {
    assert.deepEqual(C.DAY_METRICS, ['recallHits', 'newMemories', 'deleted', 'corrections', 'hitRate']);
    const l = C.recordDay({ days: [] }, '2026-11-10', { recallHits: 3, text: '林夏的秘密', note: '别存我' }).ledger;
    assert.deepEqual(Object.keys(l.days[0].metrics), ['recallHits']);
    const text = JSON.stringify(l);
    assert.equal(text.includes('秘密'), false);
    assert.equal(text.includes('别存我'), false);
});

test('X4-2 同一天重复上报 ⇒ 覆盖不叠加（一天体检多次不虚高）', () => {
    let l = C.recordDay({ days: [] }, '2026-11-10', { recallHits: 3 }).ledger;
    const r = C.recordDay(l, '2026-11-10', { recallHits: 5 });
    assert.equal(r.overwritten, true);
    assert.equal(r.ledger.days.length, 1);
    assert.equal(r.ledger.days[0].metrics.recallHits, 5);
});

test('X4-3 两次读数 ⇒ 一份周报，趋势方向与差值符号一致', () => {
    const rep = C.weeklyReport(twoDays());
    const get = (k) => rep.rows.find((r) => r.metric === k);
    assert.equal(get('recallHits').delta, 6);
    assert.equal(get('recallHits').direction, 'up');
    assert.equal(get('newMemories').delta, -1);
    assert.equal(get('newMemories').direction, 'down');
    assert.equal(get('corrections').direction, 'up');
    rep.rows.forEach((r) => {
        const want = r.delta > 0 ? 'up' : (r.delta < 0 ? 'down' : 'flat');
        assert.equal(r.direction, want, r.metric);
        assert.equal(r.delta, Math.round((r.last - r.first) * 10000) / 10000, r.metric);
    });
});

test('X4-4 覆盖率与跨度真实：from/to/days 与库一致', () => {
    const rep = C.weeklyReport(twoDays());
    assert.deepEqual(rep.coverage, { from: '2026-11-10', to: '2026-11-17', days: 2 });
    assert.equal(rep.empty, false);
});

test('X4-5 单日读数 ⇒ 差值 0、方向 flat（不虚报趋势）', () => {
    const l = C.recordDay({ days: [] }, '2026-11-10', { recallHits: 3 }).ledger;
    const rep = C.weeklyReport(l);
    assert.equal(rep.rows[0].delta, 0);
    assert.equal(rep.rows[0].direction, 'flat');
    assert.equal(rep.rows[0].points, 1);
});

test('X4-6 空台账 ⇒ empty，不编一行趋势', () => {
    const rep = C.weeklyReport({ days: [] });
    assert.equal(rep.empty, true);
    assert.deepEqual(rep.rows, []);
});

test('X4-7 越阈值才点名：越线的带原因，不越线的不吭声', () => {
    const rep = C.weeklyReport(twoDays());
    const a = C.healthAlerts(rep, { recallHits: 3, corrections: 3, hitRate: 0.5 });
    assert.equal(a.count, 1);
    assert.equal(a.alerts[0].metric, 'recallHits');
    assert.ok(a.alerts[0].reason.includes('recallHits'));
    assert.ok(a.alerts[0].reason.includes('从 3 变到 9'));
    assert.equal(C.healthAlerts(rep, {}).count, 0);
});

test('X4-8 没设阈值的指标不会被点名（不自己定阈值）', () => {
    const rep = C.weeklyReport(twoDays());
    const a = C.healthAlerts(rep, { deleted: 5 });
    assert.equal(a.count, 0);
});

test('X4-9 台账按日排序稳定，同输入两次同周报', () => {
    let l = C.recordDay({ days: [] }, '2026-11-17', { recallHits: 9 }).ledger;
    l = C.recordDay(l, '2026-11-10', { recallHits: 3 }).ledger;
    assert.deepEqual(l.days.map((d) => d.day), ['2026-11-10', '2026-11-17']);
    assert.equal(JSON.stringify(C.weeklyReport(l)), JSON.stringify(C.weeklyReport(l)));
});

test('X4-10 自检绿', () => {
    const sc = C.checkupSelfCheck();
    assert.equal(sc.ok, true, JSON.stringify(sc.bad));
});
