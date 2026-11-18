// [v4.160.0 · R25-O5] 注入面与预算路由合流
// 验收口径：usedTokens 与真实渲染同源（不另算一套）；裁掉原因只有一张枚举表；
//           预算降一半 dropped 单调不降；未来事件仍默认零注入。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const P = require(join(ROOT, 'injection-panel.js'));

const cands = () => ([
    { id: 'a', text: '第一段记忆内容', sessionId: 's1', floor: 1 },
    { id: 'b', text: 'second memory body text', sessionId: 's1', floor: 2 },
    { id: 'c', text: '第三段有点长的记忆内容，用来把预算顶满', sessionId: 's1', floor: 3 },
    { id: 'd', text: '这一段应当被预算裁掉', sessionId: 's1', floor: 4 }
]);

const round = (budget) => P.buildRound(cands(), { budget });

test('O5-1 token 估算口径单源：CJK 一字一拍、ASCII 四字符一拍', () => {
    assert.equal(P.tokenEstimate('中文四字'), 4);
    assert.equal(P.tokenEstimate('abcd'), 1);
    assert.equal(P.tokenEstimate(''), 0);
});

test('O5-2 usedTokens 与真实渲染同源（不另算一套）', () => {
    const p = round(600);
    const r = P.render(p);
    assert.equal(p.usedTokens, r.tokens);
    assert.equal(p.renderedChars, r.chars);
});

test('O5-3 每条条目自带 tokens，总量可逐条加总', () => {
    const p = round(600);
    const sum = p.entries.reduce((a, e) => a + e.tokens, 0);
    assert.ok(sum > 0);
    assert.ok(p.usedTokens >= sum, '渲染含前缀与换行，不应少于逐条之和');
});

test('O5-4 裁掉原因只有一张枚举表（kind 机器读数 + why 人读文本）', () => {
    assert.deepEqual(Object.keys(P.DROP_KINDS).sort(), ['budget', 'future', 'tempExclude']);
    const p = P.buildRound(cands(), { budget: 30 });
    assert.ok(p.dropped.length > 0);
    p.dropped.forEach((d) => assert.equal(d.kind, 'budget'));
    assert.ok(p.dropped[0].why.indexOf(P.DROP_KINDS.budget) === 0, 'why 必须由枚举派生');
});

test('O5-5 预算减半 ⇒ dropped 单调不降', () => {
    const wide = round(600), tight = round(40), tighter = round(20);
    assert.ok(tight.dropped.length >= wide.dropped.length);
    assert.ok(tighter.dropped.length >= tight.dropped.length);
});

test('O5-6 剩余量可复算：remaining = budget - usedChars', () => {
    const p = round(600);
    assert.equal(p.remaining, p.budget - p.usedChars);
    assert.ok(p.usedChars <= p.budget);
});

test('O5-7 未来事件默认零注入，且原因是同一个枚举', () => {
    const c = [{ id: 'f', text: '明天才会发生的事', future: true }];
    const p = P.buildRound(c, { budget: 600 });
    assert.equal(p.entries.length, 0);
    assert.equal(p.blocked[0].kind, 'future');
    assert.ok(p.blocked[0].why.indexOf(P.DROP_KINDS.future) === 0);
    assert.equal(P.buildRound(c, { budget: 600, allowFuture: true }).entries.length, 1);
});

test('O5-8 本轮临时排除也进同一枚举，且不计入 usedChars', () => {
    const p = P.buildRound(cands(), { budget: 600, tempExclude: ['a'] });
    assert.equal(p.tempBlocked[0].kind, 'tempExclude');
    assert.equal(p.entries.some((e) => e.id === 'a'), false);
    assert.ok(p.usedChars <= round(600).usedChars);
});

test('O5-9 一条都不装时不报错，读数归零', () => {
    const p = P.buildRound([], { budget: 600 });
    assert.equal(p.entries.length, 0);
    assert.equal(p.usedChars, 0);
    assert.equal(p.usedTokens, 0);
});

test('O5-10 确定性：同输入两次读数逐字段相同', () => {
    assert.equal(JSON.stringify(round(120)), JSON.stringify(round(120)));
});

test('O5-11 形态与自检绿', () => {
    const raw = require('node:fs').readFileSync(join(ROOT, 'injection-panel.js'), 'utf8');
    assert.ok(raw.includes('root.LonShaInjectionPanel = api;'));
    assert.ok(!/^export /m.test(raw));
    assert.equal(P.panelSelfCheck().ok, true);
});
