// [v4.158.0 · R24-X9] 注入面透明化：这一轮到底注入了什么
// 验收口径：面板条目与实际注入文本逐条对应；临时禁本轮不注入；裁掉要报；未来事件默认零注入。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const P = require(join(ROOT, 'injection-panel.js'));


test('X9-1 面板列出的条目与实际注入文本逐条对应（不多不少）', () => {
    const p = P.buildRound(P.makeCandidates(8), { budget: 200 });
    const r = P.render(p);
    assert.equal(r.lineCount, p.entries.length);
    assert.equal(r.text.split('\n').length, p.entries.length);
    p.entries.forEach((e) => assert.ok(r.text.includes(e.text), e.id));
});

test('X9-2 每条都带来源与「为什么被选中」', () => {
    const p = P.buildRound(P.makeCandidates(8), { budget: 200 });
    p.entries.forEach((e) => {
        assert.ok(e.why && P.REASONS.includes(e.why), `${e.id}: ${e.why}`);
        assert.match(e.source, /s1#\d+/);
        assert.ok(e.chars === e.text.length);
    });
});

test('X9-3 预算可见：总量 / 上限 / 剩余对得上', () => {
    const p = P.buildRound(P.makeCandidates(8), { budget: 100 });
    assert.equal(p.budget, 100);
    assert.ok(p.usedChars <= 100);
    assert.equal(p.remaining, 100 - p.usedChars);
    assert.equal(p.usedChars, p.entries.reduce((s, e) => s + e.chars, 0));
});

test('X9-4 被预算裁掉的条目必须报出来（不许静默丢）', () => {
    const cand = P.makeCandidates(8);
    const p = P.buildRound(cand, { budget: 60 });
    assert.ok(p.dropped.length > 0);
    p.dropped.forEach((d) => {
        const m = cand.find((x) => x.id === d.id);
        assert.equal(d.chars, m.text.length);
        assert.match(d.why, /预算/);
    });
    assert.equal(p.entries.length + p.dropped.length + p.blocked.length, cand.length);
});

test('X9-5 剧透防护：未来事件默认零注入', () => {
    const p = P.buildRound(P.makeCandidates(8), { budget: 400 });
    assert.ok(!p.entries.some((e) => e.id === 'm6'));
    assert.ok(p.blocked.some((b) => b.id === 'm6'));
});

test('X9-6 负控制：显式开启后可注入，且读数可见', () => {
    const p = P.buildRound(P.makeCandidates(8), { budget: 400, allowFuture: true });
    assert.ok(p.entries.some((e) => e.id === 'm6'));
    assert.equal(p.allowFuture, true);
});

test('X9-7 临时禁用：本轮确实没进上下文，且不计入字符', () => {
    const p = P.buildRound(P.makeCandidates(8), { budget: 200 });
    const target = p.entries[0].id;
    const before = p.usedChars;
    const t = P.tempDisable(p, target);
    assert.equal(t.ok, true);
    assert.ok(!P.render(t.panel).text.includes(p.entries[0].text));
    assert.equal(t.panel.usedChars, before - p.entries[0].chars);
    assert.equal(t.panel.remaining, t.panel.budget - t.panel.usedChars);
    assert.ok(t.panel.tempBlocked.some((b) => b.id === target));
});

test('X9-8 临时禁用不改原面板（纯函数）', () => {
    const p = P.buildRound(P.makeCandidates(8), { budget: 200 });
    const snap = JSON.stringify(p);
    P.tempDisable(p, p.entries[0].id);
    assert.equal(JSON.stringify(p), snap);
});

test('X9-9 禁用不在本轮的条目要拒', () => {
    const p = P.buildRound(P.makeCandidates(3), { budget: 400 });
    const r = P.tempDisable(p, 'nope');
    assert.equal(r.ok, false);
    assert.deepEqual(r.bad, ['not-in-round']);
});

test('X9-10 确定性：同输入同面板（含顺序）', () => {
    const a = P.buildRound(P.makeCandidates(8), { budget: 120 });
    const b = P.buildRound(P.makeCandidates(8), { budget: 120 });
    assert.deepEqual(a.entries.map((e) => e.id), b.entries.map((e) => e.id));
    assert.deepEqual(a.dropped.map((e) => e.id), b.dropped.map((e) => e.id));
});

test('X9-11 接线：manifest.extra_js + registry + index.js 真消费点', () => {
    const mf = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    assert.ok((mf.extra_js || []).includes('injection-panel.js'));
    const rg = readFileSync(join(ROOT, 'optional-engine-registry.js'), 'utf8');
    assert.ok(rg.includes("'LonShaInjectionPanel', 'injection-panel.js'"));
    const idx = readFileSync(join(ROOT, 'index.js'), 'utf8');
    assert.ok(idx.includes('this.engine.injectionPanel'));
    assert.ok(idx.includes("typeof api.render === 'function'"));
});

test('X9-12 自检绿 + 经典脚本形态', () => {
    const s = P.panelSelfCheck();
    assert.equal(s.ok, true, JSON.stringify(s.bad));
    assert.match(s.sample, /entries=/);
    const src = readFileSync(join(ROOT, 'injection-panel.js'), 'utf8');
    assert.ok(src.includes('root.LonShaInjectionPanel = api;'));
    assert.ok(!/^export /m.test(src));
});
