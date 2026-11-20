// [v3.475.0 · L26-O1] 宿主兼容矩阵的拒载面
// 验收口径：矩阵逐格三态；不可用项明确拒载并说原因；必需要求缺席必须抛而不是返回假。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const G = require(join(ROOT, 'host-refusal-gate.js'));

const MODERN = {
    Proxy: function () {}, structuredClone: function () {}, WeakRef: function () {},
    crypto: { randomUUID: function () {} }, Intl: { Segmenter: function () {} },
    queueMicrotask: function () {}
};
const OLD = { crypto: {}, Intl: {} };

test('O1-1 只有三态，没有第四态', () => {
    assert.deepEqual(G.STATUSES.slice(), ['available', 'degraded', 'refused']);
});

test('O1-2 现代宿主：全格 available，读数 host-ok，可装', () => {
    const r = G.assess({ env: MODERN, hostVersion: '1.13.2', minHostVersion: '1.12.0' });
    assert.equal(r.verdict, 'ok');
    assert.equal(r.reading, 'host-ok');
    assert.equal(r.loadable, true);
    assert.equal(r.rows.filter((x) => x.status !== 'available').length, 0);
});

test('O1-3 缺必需能力：整机拒载，点名并给人话原因与动作', () => {
    const r = G.assess({ env: OLD, hostVersion: '1.13.2', minHostVersion: '1.12.0' });
    assert.equal(r.verdict, 'refused');
    assert.equal(r.loadable, false);
    assert.ok(r.reading.startsWith('host-refused:'));
    assert.ok(r.refused.includes('Proxy'));
    assert.ok(r.refused.includes('structuredClone'));
    r.rows.filter((x) => x.status === 'refused').forEach((x) => {
        assert.ok(x.reason && x.reason.length > 6, x.cap);
        assert.ok(x.action && x.action.length > 4, x.cap);
    });
    assert.match(r.message, /装不了/);
});

test('O1-4 非必需能力缺席只降级，不许并进 ok', () => {
    const env = Object.assign({}, MODERN, { WeakRef: undefined, queueMicrotask: undefined });
    const r = G.assess({ env, hostVersion: '1.13.2', minHostVersion: '1.12.0' });
    assert.equal(r.verdict, 'degraded');
    assert.deepEqual(r.degraded.sort(), ['WeakRef', 'queueMicrotask']);
    assert.equal(r.reading, 'host-degraded:WeakRef,queueMicrotask');
    assert.equal(r.loadable, true);
});

test('O1-5 宿主版本低于门槛即拒载，并且理由里给了该升到哪一版', () => {
    const r = G.assess({ env: MODERN, hostVersion: '1.10.9', minHostVersion: '1.12.0' });
    assert.equal(r.verdict, 'refused');
    assert.ok(r.refused.includes('host-version'));
    const row = r.rows.find((x) => x.cap === 'host-version');
    assert.match(row.reason, /1\.12\.0/);
    assert.match(row.action, /1\.12\.0/);
});

test('O1-6 宿主版本读不出来：判拒载，不许按 0 当「很旧」也不许当通过', () => {
    assert.equal(G.parseHostVersion('not-a-version'), null);
    assert.equal(G.parseHostVersion(undefined), null);
    const r = G.assess({ env: MODERN, hostVersion: 'abc', minHostVersion: '1.12.0' });
    assert.equal(r.verdict, 'refused');
    assert.match(r.rows[0].reason, /读不出来/);
});

test('O1-7 版本比较是方向敏感的（正反例成对）', () => {
    assert.equal(G.compareVersions('1.11.0', '1.12.0'), -1);
    assert.equal(G.compareVersions('1.13.0', '1.12.0'), 1);
    assert.equal(G.compareVersions('1.12.0', '1.12.0'), 0);
    assert.equal(G.compareVersions('1.12', '1.12.0'), 0);
    assert.equal(G.compareVersions('x', '1.12.0'), null);
});

test('O1-8 拒载必须抛错（抛错才拦得住），可装时返回 true', () => {
    const bad = G.assess({ env: OLD, hostVersion: '1.13.2', minHostVersion: '1.12.0' });
    assert.throws(() => G.assertLoadable(bad), (e) => {
        assert.equal(e.code, 'HOST_REFUSED');
        assert.ok(e.refused.length >= 2);
        return true;
    });
    const good = G.assess({ env: MODERN, hostVersion: '1.13.2', minHostVersion: '1.12.0' });
    assert.equal(G.assertLoadable(good), true);
});

test('O1-9 每项能力的降级后果都写了人话（缺一条即红）', () => {
    const caps = Object.keys(G.detect(MODERN));
    assert.equal(caps.length, 8);
    caps.forEach((c) => {
        assert.equal(typeof G.PERCEIVED[c], 'string', c);
        assert.ok(G.PERCEIVED[c].length > 6, c);
    });
});
