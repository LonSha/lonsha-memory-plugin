// [v4.162.0 · R26-O1] 召回质量闸分组化：某一类崩了不能被总数遮住
// 验收口径：只砸多跳类的召回，闸必须报「多跳类掉线」而不是只说总数下降。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const G = require(join(ROOT, 'recall-quality-gate.js'));

function baseline() {
    return {
        k: 5, routes: ['lex', 'ngram'], count: 6,
        metrics: { recallAtK: 1, mrr: 1, falseRecall: 0 },
        groups: { g1: { hit: true, rank: 1 }, g2: { hit: true, rank: 2 }, g3: { hit: true, rank: 3 }, g4: { hit: true, rank: 4 }, g5: { hit: true, rank: 5 }, g6: { hit: true, rank: 1 } },
        classes: { g1: 'single', g2: 'single', g3: 'temporal', g4: 'persona', g5: 'negation', g6: 'cross' }
    };
}
function clone(x) { return JSON.parse(JSON.stringify(x)); }

test('O1-1 类别词表固定五种，category → 类的映射从金标口径来', () => {
    assert.deepEqual(G.CLASSES, ['single', 'temporal', 'persona', 'negation', 'cross']);
    assert.equal(G.classOfCategory('直述'), 'single');
    assert.equal(G.classOfCategory('同义改述'), 'single');
    assert.equal(G.classOfCategory('时间指代'), 'temporal');
    assert.equal(G.classOfCategory('人物指代'), 'persona');
    assert.equal(G.classOfCategory('否定'), 'negation');
    assert.equal(G.classOfCategory('跨会话'), 'cross');
    assert.equal(G.classOfCategory('没见过的类'), 'single');
});

test('O1-2 只砸多跳类 ⇒ 闸报「多跳类掉线」，不是只说总数', () => {
    const b = baseline();
    const a = clone(b);
    a.groups.g2 = { hit: false, rank: null };
    a.metrics.recallAtK = 0.8333;
    const v = G.judgeByClass(a, b);
    assert.equal(v.ok, false);
    assert.ok(v.bad.some((x) => x.indexOf('class-down: single') === 0), v.bad.join(' | '));
    assert.equal(v.classes.single.verdict, 'down');
});

test('O1-3 砸掉另一类时不该冤枉没掉的那类', () => {
    const b = baseline();
    const a = clone(b);
    a.groups.g4 = { hit: false, rank: null };
    a.metrics.recallAtK = 0.8333;
    const v = G.judgeByClass(a, b);
    assert.equal(v.classes.persona.verdict, 'down');
    assert.equal(v.classes.single.verdict, 'same');
    assert.equal(v.classes.temporal.verdict, 'same');
});

test('O1-4 整类消失 ⇒ 点名 class-count-changed（不是悄悄少一类）', () => {
    const b = baseline();
    const a = clone(b);
    delete a.groups.g3;
    const v = G.judgeByClass(a, b);
    assert.ok(v.bad.some((x) => x.indexOf('class-count-changed: temporal') === 0), v.bad.join(' | '));
    assert.equal(v.classes.temporal.verdict, 'count');
});

test('O1-5 每类计数之和 = 总组数（统计自洽）', () => {
    const b = baseline();
    const st = G.classStats(b);
    const sum = Object.keys(st).reduce((s2, k) => s2 + st[k].count, 0);
    assert.equal(sum, Object.keys(b.groups).length);
    const hits = Object.keys(st).reduce((s2, k) => s2 + st[k].hits, 0);
    assert.equal(hits, 6);
});

test('O1-6 类内命中率可复算（hits / count）', () => {
    const b = baseline();
    const a = clone(b);
    a.groups.g1.hit = false;
    const st = G.classStats(a);
    assert.equal(st.single.count, 2);
    assert.equal(st.single.hits, 1);
    assert.equal(st.single.hitRate, 0.5);
});

test('O1-7 阈值放宽后同类小掉不算红（阈值真的被用上）', () => {
    const b = baseline();
    const a = clone(b);
    a.groups.g2 = { hit: false, rank: null };
    a.metrics.recallAtK = 0.8333;
    const loose = G.judgeByClass(a, b, { thresholds: { single: 0.5 } });
    assert.equal(loose.classes.single.verdict, 'same');
    assert.equal(loose.bad.some((x) => x.indexOf('class-down') === 0), false);
});

test('O1-8 变好不算红（类内提升只记 up，不记 bad）', () => {
    const b = baseline();
    const a = clone(b);
    b.groups.g2 = { hit: false, rank: null };
    const v = G.judgeByClass(a, b);
    assert.equal(v.classes.single.verdict, 'up');
    assert.equal(v.bad.length, 0);
    assert.equal(v.ok, true);
});

test('O1-9 基准没盖类印章 ⇒ 具名 no-classes-in-baseline（不猜类）', () => {
    const b = baseline();
    delete b.classes;
    const v = G.judgeByClass(baseline(), b);
    assert.equal(v.ok, false);
    assert.deepEqual(v.bad, ['no-classes-in-baseline']);
});

test('O1-10 tagClasses 从金标集盖印章，且不改原快照', () => {
    const snap = { groups: { g1: { hit: true, rank: 1 }, g2: { hit: true, rank: 2 } }, metrics: {} };
    const tagged = G.tagClasses(snap, [{ id: 'g1', category: '时间指代' }, { id: 'g2', category: '否定' }]);
    assert.deepEqual(tagged.classes, { g1: 'temporal', g2: 'negation' });
    assert.equal(snap.classes, undefined);
});

test('O1-11 自检绿（原有主线判据没破）', () => {
    const sc = G.gateSelfCheck();
    assert.equal(sc.ok, true, JSON.stringify(sc.bad));
});
