// [v4.163.0 · R26-O7] 老宿主三档进回归门禁：三档全跑 + 主链任一断即红 + 矩阵与档位对账
// 验收口径：摘掉 structuredClone 的那一档降级具名，另两档签名不变。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const H = require(join(ROOT, 'host-compatibility-matrix.js'));

const CHAIN = ['load', 'write', 'recall', 'inject', 'view-read'];

test('O7-1 一条门禁跑完三档：ok 且读数点名 3/3、漂移为 0', () => {
    const g = H.regressionGate();
    assert.equal(g.ok, true, JSON.stringify(g.failures));
    assert.equal(g.profiles, 3);
    assert.equal(g.expectedProfiles, 3);
    assert.ok(g.reading.indexOf('3/3 ok') !== -1, g.reading);
    assert.ok(g.reading.indexOf('drift=0') !== -1, g.reading);
    g.rows.forEach((r) => assert.deepEqual(r.steps.map((s) => s.step), CHAIN, r.profile));
});

test('O7-2 对账：每档恰好缺自己那一项，不多也不少', () => {
    const rec = H.reconcile();
    assert.equal(rec.ok, true, JSON.stringify(rec.bad));
    assert.deepEqual(rec.rows.map((r) => r.profile), H.PROFILES);
    H.PROFILES.forEach((p) => {
        const row = rec.rows.find((r) => r.profile === p);
        assert.deepEqual(row.got, [H.EXPECT[p]], p);
        assert.equal(row.degradedRows.length, 1, p + ' 矩阵宽度应与缺失项一致');
    });
});

test('O7-3 摘掉 structuredClone 的那一档：降级具名且说清降成什么', () => {
    const row = H.runProfile('noClone');
    assert.deepEqual(row.missing, ['structuredClone']);
    assert.equal(row.degradedRows.length, 1);
    assert.match(row.degradedRows[0], /structuredClone → /);
    assert.match(row.degradedRows[0], /JSON/);
    assert.equal(row.named, true);
});

test('O7-4 该档降级后不代表另外两档跟者变：另两档签名逐项不变', () => {
    const sigs = H.PROFILES.map((p) => H.signatureOf(p));
    const row = H.runProfile('noClone');
    assert.equal(row.requiresRefetch, false, '另两档里也有 Proxy 的档不该跟着要重取');
    const others = sigs.filter((s) => s.profile !== 'noClone');
    others.forEach((s) => {
        assert.deepEqual(s.missing, [H.EXPECT[s.profile]], s.profile);
        assert.equal(s.ok, true);
        assert.equal(s.steps, CHAIN.length);
    });
    const news = H.regressionGate({ inject: { profile: 'noClone', drop: ['Proxy'] } });
    news.rows.filter((r) => r.profile !== 'noClone').forEach((r) => {
        const old = others.find((s) => s.profile === r.profile);
        assert.deepEqual(r.missing.slice().sort(), old.missing, r.profile + ' 签名被别档的注入污染');
        assert.equal(r.requiresRefetch, old.requiresRefetch, r.profile);
        assert.equal(r.steps.length, old.steps, r.profile);
    });
});

test('O7-5 任一档主链断即红：断 recall 那一档被点名', () => {
    const g = H.regressionGate({ inject: { profile: 'noClone', breakStep: 'recall' } });
    assert.equal(g.ok, false);
    assert.ok(g.failures.indexOf('chain-broken:noClone:recall') !== -1, JSON.stringify(g.failures));
    assert.match(g.reading, /host-profiles-broken/);
});

test('O7-6 断在别的档、别的步也一样红（不是只认一档）', () => {
    const g = H.regressionGate({ inject: { profile: 'noSegmenter', breakStep: 'inject' } });
    assert.equal(g.ok, false);
    assert.ok(g.failures.indexOf('chain-broken:noSegmenter:inject') !== -1, JSON.stringify(g.failures));
});

test('O7-7 矩阵与档位对账真的会投：多缺一项就 drift 具名', () => {
    const g = H.regressionGate({ inject: { profile: 'noClone', drop: ['Proxy'] } });
    assert.equal(g.ok, false);
    const drift = g.failures.filter((f) => f.indexOf('profile-drift:noClone') === 0);
    assert.equal(drift.length, 1, JSON.stringify(g.failures));
    assert.match(drift[0], /want=structuredClone/);
    assert.ok(drift[0].indexOf('Proxy+structuredClone') !== -1, drift[0]);
});

test('O7-8 等价注入不算漂移：同一项重复摘掉仍然绿', () => {
    const rec = H.reconcile({ inject: { profile: 'noProxy', drop: ['Proxy'] } });
    assert.equal(rec.ok, true, JSON.stringify(rec.bad));
});

test('O7-9 未知档位：门禁不静默放过', () => {
    const r = H.runProfile('ancient');
    assert.equal(r.ok, false);
    assert.deepEqual(r.bad, ['unknown-profile']);
    assert.equal(H.PROFILES.length, Object.keys(H.EXPECT).length);
    H.PROFILES.forEach((p) => assert.ok(H.EXPECT[p], p));
});

test('O7-10 确定性：门禁跑两次读数逐字相同，且自检绿', () => {
    assert.equal(JSON.stringify(H.regressionGate()), JSON.stringify(H.regressionGate()));
    assert.equal(H.hostCompatSelfCheck().ok, true);
    const sigs = H.PROFILES.map((p) => JSON.stringify(H.signatureOf(p)));
    assert.equal(new Set(sigs).size, 3, '三档签名应各不相同');
});
