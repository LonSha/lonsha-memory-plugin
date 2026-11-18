// [v4.162.0 · R26-X1] 时点书签：给「第 37 轮」起个人能记住的名字
// 验收口径：起名后按名字能一键投影；同名二次起名被拒且旧名仍可用。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const T = require(join(ROOT, 'memory-time-machine.js'));
const V = require(join(ROOT, 'memory-views.js'));

const S1 = { memories: [{ id: 'a', text: '茶馆', persons: ['林夏'], places: ['茶馆'], type: 'event', floor: 10 }] };
const S2 = { memories: S1.memories.concat([{ id: 'b', text: '海边', persons: ['林夏'], places: ['海边'], type: 'event', floor: 12 }]) };
function build() {
    const m1 = T.mark(T.createMachine(), S1, { round: 1, at: '2026-11-10' });
    return T.mark(m1.machine, S2, { round: 2, at: '2026-11-12' }).machine;
}

test('X1-1 给时点起名 ⇒ 成功且回执带上轮次与名字', () => {
    const r = T.setName(build(), 2, '初遇那天');
    assert.equal(r.ok, true);
    assert.equal(r.round, 2);
    assert.equal(r.name, '初遇那天');
});

test('X1-2 按名字取回时点（一眼知道是哪轮、哪天、几条）', () => {
    const m = T.setName(build(), 2, '初遇那天').machine;
    const f = T.findByName(m, '初遇那天');
    assert.equal(f.ok, true);
    assert.equal(f.round, 2);
    assert.equal(f.at, '2026-11-12');
    assert.equal(f.count, 2);
});

test('X1-3 起名后按名一键投影（书签接得上视图）', () => {
    const m = T.setName(build(), 1, '茶馆那晚').machine;
    const f = T.findByName(m, '茶馆那晚');
    const p = V.project(S1, { timeMachine: T, machineState: m, atRound: f.round });
    assert.equal(p.meta.atRound, 1);
    assert.equal(p.meta.source, 'mark');
    assert.equal(p.count, 1);
});

test('X1-4 同名二次起名被拒，旧名仍可用（不覆盖）', () => {
    const m = T.setName(build(), 2, '初遇那天').machine;
    const again = T.setName(m, 1, '初遇那天');
    assert.equal(again.ok, false);
    assert.deepEqual(again.bad, ['name-taken']);
    const f = T.findByName(m, '初遇那天');
    assert.equal(f.round, 2, '旧名还指向原来那一轮');
});

test('X1-5 显式覆盖才可以改名（把开关交给调用方）', () => {
    const m = T.setName(build(), 2, '初遇那天').machine;
    const over = T.setName(m, 1, '初遇那天', { overwrite: true });
    assert.equal(over.ok, true);
    assert.equal(T.findByName(over.machine, '初遇那天').round, 1);
});

test('X1-6 同一轮改名 ⇒ 旧名失效、新名生效（不出现两个名指一轮的幻觉）', () => {
    const m = T.setName(build(), 2, '旧名').machine;
    const r = T.setName(m, 2, '新名');
    assert.equal(r.ok, true);
    assert.deepEqual(T.findByName(r.machine, '旧名').bad, ['no-such-name']);
    assert.equal(T.findByName(r.machine, '新名').round, 2);
});

test('X1-7 没这一轮 / 空名字 ⇒ 各自具名', () => {
    assert.deepEqual(T.setName(build(), 99, 'x').bad, ['no-such-round']);
    assert.deepEqual(T.setName(build(), 1, '   ').bad, ['empty-name']);
    assert.deepEqual(T.findByName(build(), '').bad, ['empty-name']);
});

test('X1-8 查不存在的名字 ⇒ 具名，不拿最近时点顶替', () => {
    const f = T.findByName(build(), '查无此名');
    assert.equal(f.ok, false);
    assert.deepEqual(f.bad, ['no-such-name']);
    assert.equal(f.round, undefined);
});

test('X1-9 起名不动历史：标记条数不变、原有轮次都在', () => {
    const m0 = build();
    const m1 = T.setName(m0, 2, '初遇那天').machine;
    assert.equal(m1.marks.length, m0.marks.length);
    assert.deepEqual(m1.marks.map((k) => k.round), [1, 2]);
    assert.equal(m0.marks[1].name, undefined, '原机器上的标记没有被改名副作用污染');
});

test('X1-10 自检绿', () => {
    const sc = T.machineSelfCheck();
    assert.equal(sc.ok, true, JSON.stringify(sc.bad));
});
