// [v4.158.0 · R24-X8] 记忆时间机器：回到某一轮，看差异
// 验收口径：能回报「哪个时点」；四类差异齐；回滚不覆盖历史；不存在的轮次给清晰失败而非崩溃。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const T = require(join(ROOT, 'memory-time-machine.js'));

function rounds() {
    const s1 = { memories: [{ id: 'm1', text: '一', at: '2026-11-01' }, { id: 'm2', text: '二', at: '2026-11-01' }, { id: 'm4', text: '四（后来被删）', at: '2026-11-01' }] };
    const s2 = { memories: [
        { id: 'm1', text: '一改', at: '2026-11-01' },
        { id: 'm2', text: '二', at: '2026-11-01', voided: true },
        { id: 'm3', text: '三', at: '2026-11-02' }
    ] };
    let mc = T.createMachine();
    mc = T.mark(mc, s1, { round: 1, at: '2026-11-01' }).machine;
    mc = T.mark(mc, s2, { round: 2, at: '2026-11-02' }).machine;
    return { s1, s2, mc };
}

test('X8-1 五类差异齐：added / modified / removed / status / unchanged', () => {
    assert.deepEqual(T.KINDS, ['added', 'modified', 'removed', 'status', 'unchanged']);
});

test('X8-2 打标记留快照：之后改库不影响已打的时点', () => {
    const s1 = { memories: [{ id: 'm1', text: '一' }] };
    const a = T.mark(T.createMachine(), s1, { round: 1 });
    s1.memories[0].text = '被后来改了';
    s1.memories.push({ id: 'm9', text: '新来' });
    assert.equal(a.count, 1);
    assert.equal(a.machine.marks[0].store.memories.length, 1);
    assert.equal(a.machine.marks[0].store.memories[0].text, '一');
});

test('X8-3 差异计数对得上：一改一删一增', () => {
    const { mc } = rounds();
    const d = T.diff(mc, 1, 2);
    assert.equal(d.ok, true);
    assert.equal(d.counts.added, 1);
    assert.equal(d.counts.removed, 1);
    assert.equal(d.counts.modified, 1);
    assert.equal(d.counts.status, 1);
    assert.equal(d.counts.unchanged, 0);
});

test('X8-4 状态变化不混进「修改」：voided 单独报 status', () => {
    const { mc } = rounds();
    const rows = T.diff(mc, 1, 2).changes;
    const m2 = rows.find((r) => r.id === 'm2');
    assert.equal(m2.kind, 'status');
    assert.match(m2.after, /true/);
    const m1 = rows.find((r) => r.id === 'm1');
    assert.equal(m1.kind, 'modified');
});

test('X8-5 没变的也要报出来，不许静默略过', () => {
    const s = { memories: [{ id: 'm1', text: '一' }] };
    let mc = T.createMachine();
    mc = T.mark(mc, s, { round: 1 }).machine;
    mc = T.mark(mc, s, { round: 2 }).machine;
    const d = T.diff(mc, 1, 2);
    assert.equal(d.counts.unchanged, 1);
    assert.equal(d.changes.length, 1);
});

test('X8-6 回到旧时点：生成新分支，内容逐字段相等', () => {
    const { s1, mc } = rounds();
    const co = T.checkout(mc, 1);
    assert.equal(co.ok, true);
    assert.equal(JSON.stringify(co.store), JSON.stringify(s1));
    assert.equal(co.branch, 'b2');
});

test('X8-7 回滚不覆盖历史：旧时点仍可查、两时点仍可比', () => {
    const { mc } = rounds();
    const co = T.checkout(mc, 1, { branchId: 'back' });
    const after = co.machine;
    assert.ok(T.findMark(after, 1));
    assert.ok(T.findMark(after, 2));
    assert.equal(after.marks.length, 2);
    assert.equal(after.branches.length, 2);
    const back = after.branches.find((b) => b.id === 'back');
    assert.equal(back.store.memories.length, 3, '回滚分支带的是当时那份快照');
    assert.equal(back.atRound, 1);
    assert.equal(T.diff(after, 1, 2).counts.added, 1);
});

test('X8-8 定位辅助：这条记忆第一次出现在第几轮', () => {
    const { mc } = rounds();
    const f = T.firstSeen(mc, 'm3');
    assert.equal(f.ok, true);
    assert.equal(f.round, 2);
    assert.equal(T.firstSeen(mc, 'm1').round, 1);
    assert.equal(T.firstSeen(mc, 'nope').ok, false);
});

test('X8-9 不存在的轮次给清晰失败，不崩溃', () => {
    const { mc } = rounds();
    const d = T.diff(mc, 1, 99);
    assert.equal(d.ok, false);
    assert.deepEqual(d.bad, ['no-such-round']);
    const co = T.checkout(mc, 99);
    assert.equal(co.ok, false);
    assert.deepEqual(co.bad, ['no-such-round']);
    assert.equal(co.machine.marks.length, 2, '失败时原机不应被改');
});

test('X8-10 接线 + 自检 + 经典脚本形态', () => {
    const mf = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    assert.ok((mf.extra_js || []).includes('memory-time-machine.js'));
    const rg = readFileSync(join(ROOT, 'optional-engine-registry.js'), 'utf8');
    assert.ok(rg.includes("'LonShaTimeMachine', 'memory-time-machine.js'"));
    const idx = readFileSync(join(ROOT, 'index.js'), 'utf8');
    assert.ok(idx.includes('this.engine.timeMachine'));
    const s = T.machineSelfCheck();
    assert.equal(s.ok, true, JSON.stringify(s.bad));
    assert.match(s.sample, /marks=/);
    const raw = readFileSync(join(ROOT, 'memory-time-machine.js'), 'utf8');
    assert.ok(raw.includes('root.LonShaTimeMachine = api;'));
    assert.ok(!/^export /m.test(raw));
});
