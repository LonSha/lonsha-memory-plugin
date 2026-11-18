// [v4.160.0 · R25-O7] 老宿主主链回归（三档）
// 验收口径：无 Proxy / 无 structuredClone / 无 Intl.Segmenter 各自都能把主链跑完；
//           每档的降级必须具名且能被用户感知；不许静默等价。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const H = require(join(ROOT, 'host-compatibility-matrix.js'));

const CHAIN = ['load', 'write', 'recall', 'inject', 'view-read'];

test('O7-1 三档齐：noProxy / noClone / noSegmenter', () => {
    assert.deepEqual(H.PROFILES, ['noProxy', 'noClone', 'noSegmenter']);
});

test('O7-2 每档都能把主链四步跑完（含视图读取）', () => {
    const r = H.runProfiles();
    assert.equal(r.ok, true, JSON.stringify(r.rows.map((x) => x.profile + ':' + x.ok)));
    r.rows.forEach((row) => {
        assert.deepEqual(row.steps.map((s) => s.step), CHAIN, row.profile + ' 的主链步骤不全');
        assert.ok(row.steps.every((s) => s.ok === true), row.profile + ' 有步骤失败');
    });
});

test('O7-3 每档的降级都具名（缺了什么、降成什么）', () => {
    H.runProfiles().rows.forEach((row) => {
        assert.ok(row.missing.length > 0, row.profile + ' 必须点名缺哪项能力');
        assert.ok(row.degradedRows.length > 0, row.profile + ' 必须给出降级后的形态');
    });
});

test('O7-4 无 Proxy 档：视图是快照，必须标记 requiresRefetch', () => {
    const r = H.runProfile('noProxy');
    assert.equal(r.requiresRefetch, true, '没有 Proxy 就不能假装实时视图');
    const viewStep = r.steps.find((s) => s.step === 'view-read');
    assert.equal(viewStep.liveView, false);
});

test('O7-5 有 Proxy 档（现宿主）：实时视图，不需要重取', () => {
    const r = H.runProfile('noClone');
    assert.equal(r.requiresRefetch, false);
    assert.equal(r.steps.find((s) => s.step === 'view-read').liveView, true);
});

test('O7-6 无 structuredClone 档：深拷降级为 JSON 往返，主链仍绿', () => {
    const r = H.runProfile('noClone');
    assert.equal(r.ok, true);
    assert.ok(r.missing.some((x) => String(x).indexOf('structuredClone') !== -1 || String(x).indexOf('clone') !== -1)
        || r.degradedRows.length > 0, '降级面必须可见');
});

test('O7-7 无 Intl.Segmenter 档：分词降级，召回仍能命中', () => {
    const r = H.runProfile('noSegmenter');
    assert.equal(r.ok, true);
    assert.equal(r.steps.find((s) => s.step === 'recall').ok, true);
});

test('O7-8 未知档位给清晰失败，不静默跑现宿主', () => {
    const r = H.runProfile('ancient');
    assert.equal(r.ok, false);
    assert.deepEqual(r.bad, ['unknown-profile']);
});

test('O7-9 三档读数互不相同（不是同一个环境跑了三次）', () => {
    const rows = H.runProfiles().rows;
    const sigs = rows.map((r) => r.profile + '|' + r.requiresRefetch + '|' + r.missing.map(String).sort().join(',') + '|' + r.degradedRows.map(String).sort().join(','));
    assert.equal(new Set(sigs).size, 3, '三档的读数签名应各不相同');
});

test('O7-10 确定性：同一档跑两次读数一致', () => {
    assert.equal(JSON.stringify(H.runProfile('noProxy')), JSON.stringify(H.runProfile('noProxy')));
});

test('O7-11 形态与自检（含原有八项能力）', () => {
    const raw = require('node:fs').readFileSync(join(ROOT, 'host-compatibility-matrix.js'), 'utf8');
    assert.ok(raw.includes('root.LonShaHostCompatMatrix = api;'));
    assert.ok(!/^export /m.test(raw));
    assert.equal(H.CAPS.length, 8);
    assert.equal(H.hostCompatSelfCheck().ok, true);
});
