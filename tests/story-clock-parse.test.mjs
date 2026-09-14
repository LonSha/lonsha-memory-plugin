/**
 * story-clock-parse.js（缝入自 MyriadKnots）单元测试
 * node 环境下挂 window 模拟浏览器全局，验证解析核心。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// 挂 window 后加载 IIFE 模块
globalThis.window = {};
const src = fs.readFileSync(path.resolve('story-clock-parse.js'), 'utf8');
new Function(src)();
const SC = globalThis.window.LonShaStoryClock;

test('模块暴露 4 个纯函数', () => {
    assert.ok(SC, 'window.LonShaStoryClock 未挂载');
    for (const fn of ['parseClockFields', 'parseSharedStoryClock', 'storyClockSignature', 'decideStoryClockInjection']) {
        assert.equal(typeof SC[fn], 'function', `缺 ${fn}`);
    }
});

test('parseClockFields: 完整三字段 complete=true', () => {
    const r = SC.parseClockFields('date=10月4日 | weekday=周二 | time=15:30');
    assert.equal(r.date, '10月4日');
    assert.equal(r.weekday, '周二');
    assert.equal(r.time, '15:30');
    assert.equal(r.complete, true);
});
test('parseClockFields: 缺字段 complete=false', () => {
    assert.equal(SC.parseClockFields('date=10月4日 | time=15:30').complete, false);
    assert.equal(SC.parseClockFields('').complete, false);
});
test('parseClockFields: weekday 非法时 complete=false', () => {
    assert.equal(SC.parseClockFields('date=x | weekday=星期八 | time=1:00').complete, false);
    // 合法变体
    assert.equal(SC.parseClockFields('date=x | weekday=周日 | time=1:00').complete, true);
    assert.equal(SC.parseClockFields('date=x | weekday=星期六 | time=1:00').complete, true);
});
test('parseClockFields: 兼容中文分隔符与全角等号', () => {
    const r = SC.parseClockFields('date＝天顺三年春，weekday=周一，time＝辰时');
    assert.equal(r.date, '天顺三年春');
    assert.equal(r.weekday, '周一');
    assert.equal(r.time, '辰时');
});

test('parseSharedStoryClock: 标准 start/end 注释对', () => {
    const mes = '<!-- LONSHA-start | date=10月4日 | weekday=周二 | time=15:30 -->正文正文<!-- LONSHA-end | date=10月4日 | weekday=周二 | time=16:00 -->';
    const r = SC.parseSharedStoryClock(mes);
    assert.equal(r.namespace, 'LONSHA');
    assert.equal(r.complete, true);
    assert.equal(r.endMeta.time, '16:00');
});
test('parseSharedStoryClock: 识别其它插件命名空间（QQJ）', () => {
    const mes = '<!-- QQJ-start | date=10月4日 | weekday=周二 | time=15:30 -->x<!-- QQJ-end | date=10月4日 | weekday=周二 | time=16:00 -->';
    const r = SC.parseSharedStoryClock(mes);
    assert.equal(r.namespace, 'QQJ');
    assert.equal(r.complete, true);
});
test('parseSharedStoryClock: 无注释返回 null', () => {
    assert.equal(SC.parseSharedStoryClock('纯正文没有注释'), null);
});
test('parseSharedStoryClock: 不完整时钟（缺 time）complete=false', () => {
    const mes = '<!-- LONSHA-start | date=10月4日 | weekday=周二 -->x<!-- LONSHA-end | date=10月4日 | weekday=周二 -->';
    const r = SC.parseSharedStoryClock(mes);
    assert.equal(r.complete, false);
});
test('parseSharedStoryClock: 重复注释对标记 duplicate→complete=false', () => {
    const mes = '<!-- LONSHA-start | date=d | weekday=周一 | time=1:00 -->a<!-- LONSHA-start | date=d | weekday=周一 | time=2:00 -->b<!-- LONSHA-end | date=d | weekday=周一 | time=3:00 -->';
    const r = SC.parseSharedStoryClock(mes);
    assert.equal(r.duplicate, true);
    assert.equal(r.complete, false);
});

test('storyClockSignature: 稳定指纹与大小写归一', () => {
    const mes = '<!-- LONSHA-start | date=d | weekday=周一 | time=1:00 -->x<!-- LONSHA-end | date=d | weekday=周一 | time=2:00 -->';
    const c = SC.parseSharedStoryClock(mes);
    const sig = SC.storyClockSignature(c);
    assert.ok(sig.includes('lonsha'));
    assert.equal(SC.storyClockSignature(null), '');
});

test('decideStoryClockInjection: 五态裁决', () => {
    assert.deepEqual(SC.decideStoryClockInjection({ ownActive: false }), { inject: false, status: 'closed' });
    assert.deepEqual(SC.decideStoryClockInjection({ ownActive: true, ownCustom: true }), { inject: true, status: 'custom' });
    assert.deepEqual(SC.decideStoryClockInjection({ ownActive: true, peerActive: true, peerCustom: true }), { inject: false, status: 'adapted-peer-custom' });
    assert.deepEqual(SC.decideStoryClockInjection({ ownActive: true, peerActive: true }), { inject: false, status: 'adapted-peer' });
    assert.deepEqual(SC.decideStoryClockInjection({ ownActive: true }), { inject: true, status: 'standalone-default' });
});