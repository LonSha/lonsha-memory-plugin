// [v4.158.0 · R24-X4] 纠错闭环：用户改一条记忆，后续召回真的变
// 验收口径：编辑后下一轮召回命中新内容；作废后不再注入但审计可查；回滚逐字段一致；影响面与回执对得上。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const C = require(join(ROOT, 'memory-correction-loop.js'));

const base = () => ({
    memories: [{ id: 'm1', text: '他在车站答应要回来', owner: '陈舟', at: '2026-11-01T00:00:00Z' }],
    receipts: [{ kind: 'recall', ids: ['m1'], round: 7 }, { kind: 'recall', ids: ['m1'], round: 9 }],
    revisions: {}
});

test('X4-1 四类动作齐：改内容/改人物/改时间/作废', () => {
    assert.deepEqual(C.ACTIONS, ['edit', 'owner', 'time', 'void']);
    const a = C.applyCorrection(base(), 'm1', { text: '他在海边答应要回来' });
    const b = C.applyCorrection(a.store, 'm1', { owner: '林夏' });
    const c = C.applyCorrection(b.store, 'm1', { at: '2026-11-18T00:00:00Z' });
    const d = C.applyCorrection(c.store, 'm1', { void: true });
    assert.ok(a.ok && b.ok && c.ok && d.ok);
    assert.equal(d.store.memories[0].voided, true);
});

test('X4-2 编辑即时生效：下一轮召回命中新内容、旧内容不再命中', () => {
    const a = C.applyCorrection(base(), 'm1', { text: '他在海边答应要回来' });
    const now = C.recall(a.store, '海边');
    const old = C.recall(a.store, '车站');
    assert.ok(now.results.some((x) => x.id === 'm1'));
    assert.ok(!old.results.some((x) => x.id === 'm1'));
});

test('X4-3 改过的条目带 correctedByUser 标记（注入时能说明）', () => {
    const a = C.applyCorrection(base(), 'm1', { text: '他在海边答应要回来' });
    const r = C.recall(a.store, '海边').results[0];
    assert.equal(r.correctedByUser, true);
});

test('X4-4 作废：不再召回，但修订历史与回执仍可查（审计不丢）', () => {
    const a = C.applyCorrection(base(), 'm1', { void: true }, { at: '2026-11-18' });
    assert.equal(C.recall(a.store, '车站').results.length, 0);
    assert.equal(C.history(a.store, 'm1').length, 1);
    assert.equal(C.history(a.store, 'm1')[0].action, 'void');
    assert.ok(a.store.receipts.some((r) => r.kind === 'correction'));
});

test('X4-5 回滚：回到 v1 后内容与当时逐字段一致', () => {
    const original = base();
    const a = C.applyCorrection(original, 'm1', { text: '他在海边答应要回来' });
    const b = C.applyCorrection(a.store, 'm1', { owner: '林夏' });
    const rb = C.rollback(b.store, 'm1', 1);
    assert.equal(rb.ok, true);
    assert.deepEqual(rb.memory, original.memories[0]);
});

test('X4-6 回滚到不存在的版本要拒（不许静默改动）', () => {
    const r = C.rollback(base(), 'm1', 99);
    assert.equal(r.ok, false);
    assert.deepEqual(r.bad, ['no-such-version']);
});

test('X4-7 影响面：被召回次数与最近一轮与回执对得上', () => {
    const r = C.impact(base(), 'm1');
    assert.equal(r.recalledTimes, 2);
    assert.equal(r.lastRound, 9);
    assert.match(r.note, /2 次/);
});

test('X4-8 改不存在的条目要拒', () => {
    const r = C.applyCorrection(base(), 'nope', { text: 'x' });
    assert.equal(r.ok, false);
    assert.deepEqual(r.bad, ['not-found']);
});

test('X4-9 纯函数：纠正不许改入参库', () => {
    const s = base();
    const snap = JSON.stringify(s);
    C.applyCorrection(s, 'm1', { text: '改了' });
    assert.equal(JSON.stringify(s), snap);
});

test('X4-10 修订历史递增且动作可读', () => {
    const a = C.applyCorrection(base(), 'm1', { text: 'A' });
    const b = C.applyCorrection(a.store, 'm1', { text: 'B' });
    const h = C.history(b.store, 'm1');
    assert.deepEqual(h.map((x) => x.version), [1, 2]);
    h.forEach((x) => assert.ok(x.action));
});

test('X4-11 接线：manifest.extra_js + registry + index.js 真消费点', () => {
    const mf = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    assert.ok((mf.extra_js || []).includes('memory-correction-loop.js'));
    const rg = readFileSync(join(ROOT, 'optional-engine-registry.js'), 'utf8');
    assert.ok(rg.includes("'LonShaCorrectionLoop', 'memory-correction-loop.js'"));
    const idx = readFileSync(join(ROOT, 'index.js'), 'utf8');
    assert.ok(idx.includes('this.engine.correctionLoop'));
    assert.ok(idx.includes("typeof api.applyCorrection === 'function'"));
});

test('X4-12 自检绿 + 经典脚本形态', () => {
    const s = C.correctionSelfCheck();
    assert.equal(s.ok, true, JSON.stringify(s.bad));
    assert.match(s.sample, /actions=4/);
    const src = readFileSync(join(ROOT, 'memory-correction-loop.js'), 'utf8');
    assert.ok(src.includes('root.LonShaCorrectionLoop = api;'));
    assert.ok(!/^export /m.test(src));
});
