// [v3.475.0 · L26-O4] 日志分级与采样
// 验收口径：四级+采样可调；error 永不采样且必须带可复现上下文；丢弃量必须报数。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const L = require(join(ROOT, 'log-level-gate.js'));

function collector() {
    const rows = [];
    return { rows, sink: (e) => rows.push(e) };
}

test('O4-1 只有四级，输入别的级别当场抛', () => {
    assert.deepEqual(L.LEVELS.slice(), ['debug', 'info', 'warn', 'error']);
    assert.throws(() => L.levelRank('verbose'), TypeError);
});

test('O4-2 阈值以下的级别不写，但计入 below 读数（不是消失）', () => {
    const c = collector();
    const log = L.makeLogger({ sink: c.sink, threshold: 'warn', now: () => 1 });
    log.debug('d');
    log.info('i');
    log.warn('w');
    assert.equal(c.rows.length, 1);
    assert.equal(c.rows[0].level, 'warn');
    assert.equal(log.stats().below.info, 1);
    assert.equal(log.stats().below.debug, 1);
});

test('O4-3 error 永不采样：采样率 0 时 debug/info 全丢，error 照写', () => {
    const c = collector();
    const log = L.makeLogger({ sink: c.sink, threshold: 'debug', sampleRate: 0, rng: () => 0.99, now: () => 2 });
    for (let i = 0; i < 3; i++) log.debug('d' + i);
    log.info('i');
    log.error('boom', { sessionId: 's1' });
    assert.equal(c.rows.length, 1);
    assert.equal(c.rows[0].level, 'error');
    assert.equal(log.stats().dropped.debug, 3);
    assert.equal(log.stats().dropped.error, 0);
});

test('O4-4 error 缺可复现上下文：直接抛（报错不可复现等于没报）', () => {
    const log = L.makeLogger({ sink: () => {}, threshold: 'error' });
    assert.throws(() => log.error('boom'), TypeError);
    assert.throws(() => log.error('boom', {}), TypeError);
    assert.doesNotThrow(() => log.error('boom', { sessionId: 's1' }));
});

test('O4-5 采样率越界或非数字：构造/设置时抛', () => {
    assert.throws(() => L.makeLogger({ sampleRate: 1.5 }), TypeError);
    assert.throws(() => L.makeLogger({ sampleRate: '0.5' }), TypeError);
    const log = L.makeLogger({});
    assert.throws(() => log.sampleRate(2), TypeError);
    assert.equal(log.sampleRate(0.5), 0.5);
});

test('O4-6 采样按注入的 rng 走，行为确定可复现', () => {
    const c = collector();
    let i = 0;
    const seq = [0.1, 0.9, 0.1, 0.9];
    const log = L.makeLogger({ sink: c.sink, threshold: 'info', sampleRate: 0.5, rng: () => seq[i++ % seq.length], now: () => 3 });
    log.info('a'); log.info('b'); log.info('c'); log.info('d');
    assert.deepEqual(c.rows.map((r) => r.msg), ['a', 'c']);
    assert.equal(log.stats().dropped.info, 2);
});

test('O4-7 丢弃量为 0 才 log-lossless，否则点名丢得最多的级别', () => {
    const c = collector();
    const log = L.makeLogger({ sink: c.sink, threshold: 'debug', sampleRate: 0, rng: () => 1, now: () => 4 });
    assert.equal(log.reading(), 'log-lossless');
    log.debug('x');
    log.info('y');
    log.info('y2');
    assert.match(log.reading(), /^log-sampled:info×2$/);
});

test('O4-8 每条输出带级别/时间/序号，error 带 context（便于贴给作者）', () => {
    const c = collector();
    const log = L.makeLogger({ sink: c.sink, threshold: 'debug', now: () => 1700000000000 });
    log.info('hello');
    log.error('bad', { sessionId: 'chat-9', items: 12 });
    assert.deepEqual(c.rows.map((r) => r.seq), [1, 2]);
    assert.equal(c.rows[0].at, 1700000000000);
    assert.deepEqual(c.rows[1].context, { sessionId: 'chat-9', items: 12 });
    assert.equal(c.rows[0].context, undefined);
});

test('O4-9 stats 是快照，外部改它不影响 logger 内部计数', () => {
    const log = L.makeLogger({ sink: () => {}, threshold: 'info' });
    log.info('a');
    const s = log.stats();
    s.emitted.info = 999;
    assert.equal(log.stats().emitted.info, 1);
});