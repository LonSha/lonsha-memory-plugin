// [v4.158.0 · R24-X7] 多视角记忆：同一件事，不同的人记得不一样
// 验收口径：A 亲历 / B 听说 / C 不在场 三场景；C 召回不得含该事件；B 注入带（听 A 说）；越界负控制。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const M = require(join(ROOT, 'perspective-memory.js'));


test('X7-1 见证三态齐：亲历 / 听说 / 推断', () => {
    assert.deepEqual(M.WITNESS, ['lived', 'heard', 'inferred']);
    assert.equal(M.normalize({ id: 'a', text: 'x' }).witness, 'inferred', '缺省不许当成亲历');
});

test('X7-2 A 亲历可见，且召回里有它', () => {
    const s = M.fixture();
    const a = M.recallFor(s, '林夏');
    assert.ok(a.results.some((r) => r.id === 'evA'));
    assert.equal(a.who, '林夏');
});

test('X7-3 越界即红：A 看不到 B 的私密记忆', () => {
    const s = M.fixture();
    const a = M.recallFor(s, '林夏');
    assert.ok(!a.results.some((r) => r.id === 'evB'));
    assert.ok(!a.results.some((r) => r.id === 'p1'));
    assert.deepEqual(M.leakCheck(s, '林夏').leaks, []);
});

test('X7-4 C 不在场：只能看到公开事件，看不到当事人视角', () => {
    const s = M.fixture();
    const c = M.recallFor(s, '小雨');
    assert.deepEqual(c.results.map((r) => r.id), ['evA']);
    assert.deepEqual(M.leakCheck(s, '小雨').leaks, []);
});

test('X7-5 B 听说：注入文本带（听 A 说）标注', () => {
    const s = M.fixture();
    const b = M.recallFor(s, '陈舟').results.find((r) => r.id === 'evB');
    assert.equal(b.witness, 'heard');
    assert.match(b.text, /（听林夏说）/);
    assert.equal(b.source, '林夏');
});

test('X7-6 听说无来源 ⇒ hearsay_unknown，且文案写明来源不可考', () => {
    const s = { memories: [{ id: 'h1', text: '听说要下雨', holder: '小雨', witness: 'heard' }] };
    const r = M.recallFor(s, '小雨').results[0];
    assert.equal(r.hearsayUnknown, true);
    assert.match(r.text, /来源不可考/);
});

test('X7-7 推断态要标（不许当成事实）', () => {
    const s = M.fixture();
    const r = M.recallFor(s, '陈舟').results.find((x) => x.id === 'evC');
    assert.equal(r.witness, 'inferred');
    assert.match(r.text, /（推断）/);
});

test('X7-8 公开事件多人可见（不是按 holder 一刀切）', () => {
    const s = M.fixture();
    ['林夏', '陈舟', '小雨', '陌生人'].forEach((who) => {
        assert.ok(M.recallFor(s, who).results.some((r) => r.id === 'evA'), who);
    });
});

test('X7-9 负控制：去掉 holder 过滤就会越界（证明过滤真的在起作用）', () => {
    const s = M.fixture();
    const naive = s.memories.filter((m) => String(m.text).indexOf('私事') !== -1);
    assert.ok(naive.length > 0, '负控制样本要在');
    assert.ok(!M.recallFor(s, '小雨').results.some((r) => r.id === 'p1'));
});

test('X7-10 按 eventId 聚焦：同一事件的不同视角各自成条', () => {
    const s = M.fixture();
    const a = M.recallFor(s, '林夏', { eventId: 'rain' });
    const b = M.recallFor(s, '陈舟', { eventId: 'rain' });
    assert.deepEqual(a.results.map((r) => r.id), ['evA']);
    // 陈舟：evA 是公开事件（人人可见），加上自己的两条视角
    assert.deepEqual(b.results.map((r) => r.id).sort(), ['evA', 'evB', 'evC']);
});

test('X7-11 接线 + 自检 + 经典脚本形态', () => {
    const mf = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    assert.ok((mf.extra_js || []).includes('perspective-memory.js'));
    const rg = readFileSync(join(ROOT, 'optional-engine-registry.js'), 'utf8');
    assert.ok(rg.includes("'LonShaPerspectiveMemory', 'perspective-memory.js'"));
    const idx = readFileSync(join(ROOT, 'index.js'), 'utf8');
    assert.ok(idx.includes('this.engine.perspective'));
    const s = M.perspectiveSelfCheck();
    assert.equal(s.ok, true, JSON.stringify(s.bad));
    assert.match(s.sample, /leak=0/);
    const src = readFileSync(join(ROOT, 'perspective-memory.js'), 'utf8');
    assert.ok(src.includes('root.LonShaPerspectiveMemory = api;'));
    assert.ok(!/^export /m.test(src));
});
