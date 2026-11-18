// [v4.158.0 · R24-O9] 宿主兼容矩阵
// 验收口径：老宿主下主链路全通；每项缺失都有可感知差异；能力齐全时零降级分支。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const H = require(join(ROOT, 'host-compatibility-matrix.js'));

test('O9-1 探测 8 项能力，每项带降级目标与可感知差异', () => {
    assert.equal(H.CAPS.length, 8);
    ['Proxy', 'structuredClone', 'crypto.randomUUID', 'WeakRef', 'Intl.Segmenter', 'Array.prototype.at', 'Object.hasOwn', 'queueMicrotask'].forEach((n) => assert.ok(H.CAPS.some((c) => c.name === n), n));
    H.CAPS.forEach((c) => {
        assert.ok(c.degradedTo && c.degradedTo.length > 2, c.name);
        assert.ok(c.perceivable && c.perceivable.length > 4, c.name);
        assert.ok(/无|不会|会|可能|需|低|多|只/.test(c.perceivable), `${c.name} 的差异必须具体`);
    });
});

test('O9-2 现代宿主：零缺能力，读数 capability-complete', () => {
    const d = H.detect(globalThis);
    assert.deepEqual(d.missing, []);
    assert.equal(d.degraded, false);
    assert.equal(d.reading, 'capability-complete');
});

test('O9-3 老宿主：缺能力必须点名，不许静默', () => {
    const m = H.matrix(H.oldHost());
    assert.equal(m.degraded, true);
    assert.ok(m.missing.length >= 2, JSON.stringify(m.missing));
    assert.ok(m.reading.startsWith('capability-missing'));
    assert.ok(m.reading.includes('Proxy'));
    assert.ok(m.reading.includes('structuredClone'));
});

test('O9-4 兼容矩阵：只列缺的，且每条都带降级去向', () => {
    const m = H.matrix(H.oldHost());
    assert.equal(m.degradedRows.length, m.missing.length);
    m.degradedRows.forEach((r) => {
        assert.equal(r.present, false);
        assert.ok(r.degradedTo && r.perceivable);
    });
});

test('O9-5 老宿主主链路全通：装载→写→召回→注入', () => {
    const c = H.runMainChain(H.oldHost());
    assert.equal(c.ok, true, JSON.stringify(c.steps));
    const names = c.steps.map((s) => s.step);
    assert.deepEqual(names, ['load', 'write', 'recall', 'inject', 'view-read']);
});

test('O9-6 现代宿主主链路也全通（不许只伺候老宿主）', () => {
    assert.equal(H.runMainChain(globalThis).ok, true);
});

test('O9-7 已知差异不许假装等价：无 Proxy 时必须标 requiresRefetch', () => {
    const oldChain = H.runMainChain(H.oldHost());
    const vr = oldChain.steps.find((s) => s.step === 'view-read');
    assert.equal(vr.liveView, false);
    assert.equal(vr.requiresRefetch, true);
    const modernChain = H.runMainChain(globalThis);
    const vr2 = modernChain.steps.find((s) => s.step === 'view-read');
    assert.equal(vr2.liveView, true);
    assert.equal(vr2.requiresRefetch, false);
});

test('O9-8 分词降级：无 Intl.Segmenter 时落到 n-gram，仍能命中', () => {
    const oldTok = H.tokenizeFor(H.oldHost());
    const modernTok = H.tokenizeFor(globalThis);
    assert.ok(oldTok('蓝鲸的承诺').length >= 2);
    assert.ok(modernTok('蓝鲸的承诺').length >= 2);
});

test('O9-9 克隆降级：无 structuredClone 时用 JSON，且不崩', () => {
    const oldClone = H.cloneFor(H.oldHost());
    const src = { a: 1, b: [1, 2] };
    const out = oldClone(src);
    assert.deepEqual(out, src);
    assert.notEqual(out.b, src.b, '必须是拷贝，不是同一引用');
});

test('O9-10 接线：manifest.extra_js + registry + index.js 真消费点', () => {
    const mf = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    assert.ok((mf.extra_js || []).includes('host-compatibility-matrix.js'));
    const rg = readFileSync(join(ROOT, 'optional-engine-registry.js'), 'utf8');
    assert.ok(rg.includes("'LonShaHostCompatMatrix', 'host-compatibility-matrix.js'"));
    const idx = readFileSync(join(ROOT, 'index.js'), 'utf8');
    assert.ok(idx.includes('this.engine.hostCompat'));
    assert.ok(idx.includes("typeof api.detect === 'function'"));
});

test('O9-11 自检绿（模块自带读数）', () => {
    const s = H.hostCompatSelfCheck();
    assert.equal(s.ok, true, JSON.stringify(s.bad));
    assert.match(s.sample, /caps=8/);
});

test('O9-12 经典脚本形态：无 module 时挂 global.LonShaHostCompatMatrix', () => {
    const src = readFileSync(join(ROOT, 'host-compatibility-matrix.js'), 'utf8');
    assert.ok(src.includes('root.LonShaHostCompatMatrix = api;'));
    assert.ok(!/^export /m.test(src));
});
