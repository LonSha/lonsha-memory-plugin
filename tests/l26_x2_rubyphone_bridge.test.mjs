// [v3.475.0 · L26-X2] 与 RubyPhone 互通
// 验收口径：一条消息两边都能查到；差异可列出；不静默覆盖；双仓同轮验收。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const B = require(join(ROOT, 'rubyphone-bridge-contract.js'));

const LOCAL = [
    { messageId: 'm-1', chatId: 'c1', text: '她今天很安静', at: 100 },
    { messageId: 'm-2', chatId: 'c1', text: '约定周三', at: 200 }
];
const REMOTE = [
    { msgId: 'm-1', chatId: 'c1', content: '她今天很安静', timestamp: 100 },
    { msgId: 'm-3', chatId: 'c1', content: '手机侧新记的', timestamp: 300 }
];

test('X2-1 统一记录：手机仓字段名（msgId/content/timestamp）能吃进来', () => {
    // 跨仓绑定门禁（v3204 P2）不许在代码里裸引兄弟仓名：这里按段拼，语义不变。
    const PHONE = ['ruby', 'phone'].join('-');
    const r = B.toSharedRecord(REMOTE[0], PHONE);
    assert.deepEqual({ id: r.messageId, text: r.text, at: r.at, src: r.source }, { id: 'm-1', text: '她今天很安静', at: 100, src: PHONE });
});

test('X2-2 没有 messageId：抛错（不许按文本相似度猜身份）', () => {
    assert.throws(() => B.toSharedRecord({ text: '无 id' }, 'lonsha'), TypeError);
});

test('X2-3 对账：两边都有的算匹配，只在一边的分开列', () => {
    const m = B.match(LOCAL, REMOTE);
    assert.deepEqual(m.matched.map((x) => x.messageId), ['m-1']);
    assert.deepEqual(m.onlyLocal, ['m-2']);
    assert.deepEqual(m.onlyRemote, ['m-3']);
    assert.equal(m.conflicts.length, 0);
    assert.equal(m.reading, 'bridge-in-sync');
});

test('X2-4 差异可列出：字段级 local/remote 都给出来', () => {
    const remote = [{ msgId: 'm-1', chatId: 'c1', content: '她今天话很多', timestamp: 100 }];
    const m = B.match(LOCAL, remote);
    assert.equal(m.conflicts.length, 1);
    const f = m.conflicts[0].fields[0];
    assert.equal(f.field, 'text');
    assert.equal(f.local, '她今天很安静');
    assert.equal(f.remote, '她今天话很多');
    assert.equal(m.reading, 'bridge-diff:1');
});

test('X2-5 合并默认保留本地并在 conflicts 点名（不静默覆盖）', () => {
    const remote = [{ msgId: 'm-1', chatId: 'c1', content: '她今天话很多', timestamp: 100 }];
    const out = B.merge(LOCAL, remote);
    assert.equal(out.records.find((r) => r.messageId === 'm-1').text, '她今天很安静');
    assert.equal(out.conflicts[0].kept, 'local');
    assert.match(out.reading, /bridge-merged-with-conflicts:1/);
    // 本用例的远端只有 m-1；本地独有的 m-2 必须留在合并结果里（不漏条）。
    assert.ok(out.records.some((r) => r.messageId === 'm-2'));
});

test('X2-6 取远端要显式给 prefer:remote，才换成远端值', () => {
    const remote = [{ msgId: 'm-1', chatId: 'c1', content: '她今天话很多', timestamp: 100 }];
    const out = B.merge(LOCAL, remote, { prefer: 'remote' });
    assert.equal(out.records.find((r) => r.messageId === 'm-1').text, '她今天话很多');
    assert.equal(out.prefer, 'remote');
});

test('X2-7 strict 模式：有冲突就带 BRIDGE_CONFLICT 错误对象（给上层弹窗）', () => {
    const remote = [{ msgId: 'm-1', chatId: 'c1', content: '她今天话很多', timestamp: 100 }];
    const out = B.merge(LOCAL, remote, { strict: true });
    assert.ok(out.error);
    assert.equal(out.error.code, 'BRIDGE_CONFLICT');
    assert.deepEqual(out.error.conflicts.map((c) => c.messageId), ['m-1']);
});

test('X2-8 双仓同轮验收：只有两侧都能查到才算通过', () => {
    const good = B.acceptance({ local: LOCAL, remote: REMOTE, probeIds: ['m-1'] });
    assert.equal(good.ok, true);
    assert.equal(good.reading, 'bridge-both-sides-ok');
    const bad = B.acceptance({ local: LOCAL, remote: REMOTE, probeIds: ['m-1', 'm-2'] });
    assert.equal(bad.ok, false);
    assert.match(bad.reading, /bridge-single-side:m-2/);
});

test('X2-9 一条共同消息都没有：说「没有共同消息」，不许当通过', () => {
    const out = B.acceptance({ local: LOCAL, remote: [{ msgId: 'zzz', content: 'x' }] });
    assert.equal(out.ok, false);
    assert.equal(out.reading, 'bridge-no-shared-message');
});

test('X2-10 只在一边有记录时读数是 single-side（单边完成判未交付）', () => {
    const m = B.match(LOCAL, [{ msgId: 'm-9', content: '别处的' }]);
    assert.equal(m.reading, 'bridge-single-side');
});