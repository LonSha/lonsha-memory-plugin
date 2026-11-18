// [v4.161.0 · R25-X1] 时点浏览：回到上一周的对话现场
// 验收口径：任一历史时点都能一键投影；差异里点一条能定位到对应楼层。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const T = require(join(ROOT, 'memory-time-machine.js'));
const V = require(join(ROOT, 'memory-views.js'));

const S1 = { memories: [{ id: 'a', text: '林夏在茶馆说要走', persons: ['林夏'], places: ['茶馆'], type: 'event', at: '2026-11-10', floor: 10 }] };
const S2 = { memories: S1.memories.concat([{ id: 'c', text: '林夏和顾青在海边', persons: ['林夏', '顾青'], places: ['海边'], type: 'event', at: '2026-11-12', floor: 12 }]) };
const S3 = { memories: [S1.memories[0], { id: 'c', text: '林夏和顾青在海边散步', persons: ['林夏', '顾青'], places: ['海边'], type: 'event', at: '2026-11-12', floor: 12 }] };

function build() {
    const m0 = T.createMachine();
    const m1 = T.mark(m0, S1, { round: 1, at: '2026-11-10', label: '初遇' });
    const m2 = T.mark(m1.machine, S2, { round: 2, at: '2026-11-12', label: '第二周' });
    const m3 = T.mark(m2.machine, S3, { round: 3, at: '2026-11-13' });
    return m3.machine;
}

test('X1-1 空机器：一行不编（rows 空、首末轮给 null）', () => {
    const b = T.browse(T.createMachine());
    assert.equal(b.ok, true);
    assert.deepEqual(b.rows, []);
    assert.equal(b.firstRound, null);
    assert.equal(b.lastRound, null);
});

test('X1-2 三个时点 ⇒ 三行，按轮次升序，每行四件事齐', () => {
    const b = T.browse(build());
    assert.deepEqual(b.rows.map((r) => r.round), [1, 2, 3]);
    b.rows.forEach((r) => {
        assert.equal(typeof r.round, 'number');
        assert.ok(r.at.length > 0, String(r.round));
        assert.equal(typeof r.count, 'number');
        assert.equal(typeof r.diffCount, 'number');
    });
    assert.equal(b.firstRound, 1);
    assert.equal(b.lastRound, 3);
});

test('X1-3 首行没有前一版 ⇒ 差条数就是该时点条数（不冒充差异）', () => {
    const b = T.browse(build());
    assert.equal(b.rows[0].prevRound, null);
    assert.equal(b.rows[0].diffCount, b.rows[0].count);
    assert.equal(b.rows[0].kinds, null);
});

test('X1-4 后面每行的差条数可复算＝前版 diff 四类之和', () => {
    const m = build();
    const b = T.browse(m);
    [1, 2].forEach((i) => {
        const row = b.rows[i];
        const d = T.diff(m, row.prevRound, row.round);
        assert.equal(row.diffCount, d.counts.added + d.counts.modified + d.counts.removed + d.counts.status, String(row.round));
        assert.deepEqual(row.kinds, d.counts);
    });
});

test('X1-5 只有未变条目 ⇒ 差条数 0（未变不算差异）', () => {
    const m1 = T.mark(T.createMachine(), S1, { round: 1, at: 'd1' });
    const m2 = T.mark(m1.machine, S1, { round: 2, at: 'd2' });
    const b = T.browse(m2.machine);
    assert.equal(b.rows[1].diffCount, 0);
    assert.equal(b.rows[1].kinds.unchanged, 1);
});

test('X1-6 差异里点一条能定位到对应楼层', () => {
    const m = build();
    const d = T.diff(m, 1, 2);
    const row = d.changes.find((c) => c.kind === 'added');
    const loc = T.locate(m, 2, row.id);
    assert.equal(loc.ok, true);
    assert.equal(loc.floor, 12);
    assert.equal(loc.round, 2);
    assert.ok(loc.text.includes('海边'));
});

test('X1-7 快照里没楼层 ⇒ 如实说没有，不编一个楼层出来', () => {
    const m1 = T.mark(T.createMachine(), { memories: [{ id: 'x', text: '无楼层' }] }, { round: 1, at: 'd' });
    const loc = T.locate(m1.machine, 1, 'x');
    assert.equal(loc.ok, false);
    assert.deepEqual(loc.bad, ['no-floor']);
});

test('X1-8 没这条 / 没这一轮：各自具名，不拿最近的顶替', () => {
    const m = build();
    assert.deepEqual(T.locate(m, 2, 'zzz').bad, ['no-such-memory']);
    assert.deepEqual(T.locate(m, 9, 'a').bad, ['no-such-round']);
});

test('X1-9 选中任一历史时点 ⇒ 三视图都能出（且标清用的是哪个时点）', () => {
    const m = build();
    const p = V.project(S1, { timeMachine: T, machineState: m, atRound: 1 });
    const tv = V.timelineView(p);
    const gv = V.graphView(p);
    const sv = V.searchView(p, '茶馆');
    assert.equal(tv.meta.atRound, 1);
    assert.ok(tv.items.length >= 1);
    assert.ok(gv.nodes.length >= 1);
    assert.ok(sv.results.length >= 1);
});

test('X1-10 不同时点的三视图确实不同（不是复用现库充数）', () => {
    const m = build();
    const p1 = V.project(S1, { timeMachine: T, machineState: m, atRound: 1 });
    const p2 = V.project(S3, { timeMachine: T, machineState: m, atRound: 3 });
    assert.equal(p1.count, 1);
    assert.equal(p2.count, 2);
    assert.notDeepEqual(V.timelineView(p1).items.map((i) => i.id), V.timelineView(p2).items.map((i) => i.id));
});
