// [v3.475.0 · L26-X8] 批量操作台账
// 验收口径：谁/多少/哪些都记；可回滚；过期明确拒绝；台账不可变。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const L = require(join(ROOT, 'batch-op-ledger.js'));

function ledger(now) {
    return L.createLedger({ now: () => now });
}

test('X8-1 四种批量操作闭集；未知类型直接抛', () => {
    assert.deepEqual(L.OPS.slice(), ['delete', 'correct', 'merge', 'tag']);
    assert.throws(() => ledger(1000).record({ op: 'purge', actor: 'me', ids: ['a'] }), TypeError);
});

test('X8-2 记账必含谁/多少/哪些/何时/什么操作', () => {
    const l = ledger(1700000000000);
    const e = l.record({ op: 'delete', actor: '用户', ids: ['m1', 'm2', 'm3'], why: '清理重复' });
    assert.equal(e.id, 'batch-1');
    assert.equal(e.actor, '用户');
    assert.equal(e.count, 3);
    assert.deepEqual(e.ids, ['m1', 'm2', 'm3']);
    assert.equal(e.at, 1700000000000);
    assert.equal(e.why, '清理重复');
});

test('X8-3 缺 actor 或缺 ids：拒绝记账（台账不许有匿名操作）', () => {
    const l = ledger(1);
    assert.throws(() => l.record({ op: 'delete', ids: ['a'] }), TypeError);
    assert.throws(() => l.record({ op: 'delete', actor: 'me', ids: [] }), TypeError);
    assert.throws(() => l.record({ op: 'delete', actor: 'me', ids: [1] }), TypeError);
});

test('X8-4 台账不可变：改传入数组不影响已记账内容', () => {
    const l = ledger(1);
    const ids = ['m1', 'm2'];
    l.record({ op: 'delete', actor: 'me', ids });
    ids.push('m3');
    assert.deepEqual(l.list()[0].ids, ['m1', 'm2']);
    const copy = l.list();
    copy[0].ids.push('mX');
    assert.deepEqual(l.list()[0].ids, ['m1', 'm2']);
});

test('X8-5 回滚：把动过的 id 原样交回，条数一致', () => {
    const l = ledger(1000);
    l.record({ op: 'delete', actor: 'me', ids: ['m1', 'm2'], at: 1000 });
    const u = l.undo('batch-1', { now: 2000 });
    assert.deepEqual(u.restoreIds, ['m1', 'm2']);
    assert.equal(u.reading, 'batch-undo-ready:2');
});

test('X8-6 过期回滚：明确拒绝并说清多久以前（不静默失败）', () => {
    const l = ledger(1000);
    l.record({ op: 'delete', actor: 'me', ids: ['m1'], at: 1000 });
    assert.throws(() => l.undo('batch-1', { now: 1000 + L.DEFAULT_WINDOW_MS + 1 }), (e) => {
        assert.equal(e.code, 'BATCH_UNDO_EXPIRED');
        assert.match(e.message, /超过可回滚窗口/);
        return true;
    });
});

test('X8-7 回滚窗口必须正数：传 0 或负数直接抛', () => {
    const l = ledger(1000);
    l.record({ op: 'tag', actor: 'me', ids: ['m1'], at: 1000 });
    assert.throws(() => l.undo('batch-1', { windowMs: 0 }), TypeError);
    assert.throws(() => l.undo('batch-1', { windowMs: -1 }), TypeError);
});

test('X8-8 撤销不存在的操作：抛 BATCH_UNDO_UNKNOWN，不编一个结果', () => {
    assert.throws(() => ledger(1).undo('batch-99'), (e) => {
        assert.equal(e.code, 'BATCH_UNDO_UNKNOWN');
        return true;
    });
});

test('X8-9 人类可读台账：一行一条，含谁/多少/哪些；空台账说「还没有」', () => {
    const l = ledger(5);
    assert.equal(l.render().text, '还没有批量操作');
    l.record({ op: 'correct', actor: '用户阿岚', ids: ['m1', 'm2', 'm3', 'm4'], at: 5 });
    const r = l.render();
    assert.equal(r.lines.length, 1);
    assert.match(r.lines[0], /batch-1 · correct · 用户阿岚 · 4 条/);
    assert.match(r.lines[0], /m1、m2、m3…/);
});

test('X8-10 find 找不到返回 null（不抛，便于 UI 探测）', () => {
    const l = ledger(1);
    assert.equal(l.find('batch-404'), null);
    l.record({ op: 'delete', actor: 'me', ids: ['a'], at: 1 });
    assert.equal(l.find('batch-1').count, 1);
});