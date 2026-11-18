// [v4.158.0 · R24-X6] 世界共享记忆：多个角色记得同一件事
// 验收口径：事件本体只有一份；分歧两条并存且差异逐字段列出；A 视角召回不返回 B 的私密细节。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const S = require(join(ROOT, 'shared-event-memory.js'));


test('X6-1 三态齐：agreed / divergent / single_witness', () => {
    assert.deepEqual(S.STATES, ['agreed', 'divergent', 'single_witness']);
});

test('X6-2 事件本体只有一份（两人各记一条，本体数不变）', () => {
    const s = S.summarize(S.fixture());
    assert.equal(s.bodyCount, 2, 'rain 与 book 各一份本体');
    assert.equal(s.bodies.rain.holders.length, 2);
    assert.deepEqual(s.bodies.rain.who, ['林夏', '陈舟'].sort());
});

test('X6-3 分歧不仲裁：两条视角并存', () => {
    const rain = S.summarize(S.fixture()).rows.find((r) => r.eventId === 'rain');
    assert.equal(rain.state, 'divergent');
    assert.equal(rain.perspectives.length, 2);
});

test('X6-4 差异逐字段列出（谁说的不一样）', () => {
    const rain = S.summarize(S.fixture()).rows.find((r) => r.eventId === 'rain');
    assert.ok(rain.divergences.length > 0);
    const d = rain.divergences[0];
    assert.equal(d.diffs[0].facet, 'what');
    assert.ok(d.diffs[0].a && d.diffs[0].b);
    assert.deepEqual(d.holders.sort(), ['林夏', '陈舟'].sort());
});

test('X6-5 只有一人经历 ⇒ single_witness（不是 agreed）', () => {
    const book = S.summarize(S.fixture()).rows.find((r) => r.eventId === 'book');
    assert.equal(book.state, 'single_witness');
    assert.equal(book.holders.length, 1);
});

test('X6-6 共识态：两人说的一模一样 ⇒ agreed', () => {
    const same = [
        { id: 'x1', eventId: 'moon', holder: '林夏', when: '2026-11-02', where: '天台', who: ['林夏'], what: '月亮很圆', text: '月亮很圆' },
        { id: 'x2', eventId: 'moon', holder: '陈舟', when: '2026-11-02', where: '天台', who: ['林夏'], what: '月亮很圆', text: '月亮很圆' }
    ];
    assert.equal(S.summarize(same).rows[0].state, 'agreed');
});

test('X6-7 在场者取自己的视角', () => {
    const s = S.summarize(S.fixture());
    const mine = S.recallFor(s, '林夏');
    const rain = mine.results.find((r) => r.eventId === 'rain');
    assert.equal(rain.mode, 'own');
    assert.equal(rain.text, '雨下得很大');
});

test('X6-8 不在场者：按 heard_about 标注来源，不给私密细节', () => {
    const s = S.summarize(S.fixture());
    const out = S.recallFor(s, '小雨');
    const rain = out.results.find((r) => r.eventId === 'rain');
    assert.equal(rain.mode, 'heard_about');
    assert.match(rain.text, /听说/);
    assert.ok(!rain.text.includes('他很害怕'));
    assert.ok(!rain.text.includes('他忘了带伞'));
});

test('X6-9 负控制：越界即红 —— 拿不到别人的 secret', () => {
    const s = S.summarize(S.fixture());
    const all = ['林夏', '陈舟', '小雨'].map((w) => JSON.stringify(S.recallFor(s, w))).join('|');
    assert.ok(!all.includes('她很害怕'));
    assert.ok(!all.includes('他忘了带伞'));
});

test('X6-10 接线 + 自检 + 经典脚本形态', () => {
    const mf = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    assert.ok((mf.extra_js || []).includes('shared-event-memory.js'));
    const rg = readFileSync(join(ROOT, 'optional-engine-registry.js'), 'utf8');
    assert.ok(rg.includes("'LonShaSharedEventMemory', 'shared-event-memory.js'"));
    const idx = readFileSync(join(ROOT, 'index.js'), 'utf8');
    assert.ok(idx.includes('this.engine.sharedEvents'));
    const s = S.sharedSelfCheck();
    assert.equal(s.ok, true, JSON.stringify(s.bad));
    assert.match(s.sample, /bodies=/);
    const src = readFileSync(join(ROOT, 'shared-event-memory.js'), 'utf8');
    assert.ok(src.includes('root.LonShaSharedEventMemory = api;'));
    assert.ok(!/^export /m.test(src));
});
