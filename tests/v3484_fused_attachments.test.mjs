/**
 * tests/v3484_fused_attachments.test.mjs — v3.484.0 缝合两份外部脚本
 *
 * 缝合对象（用户提供，非网上下载）：
 *   A. 📚 通用角色弧光与世界书归档台 V4.6 → 记忆的**可读文本镜像**（render/parse 往返）
 *   B. 光域·镜忆 V0.1 → ① 90-10 前缀缓存保护 ② 召回干跑透视 ③ 双粒度 grain 择优
 *
 * 只搬纪律，不搬实现：召回内核 / 挤出池 / 幂等 id / 世界书预演本仓已有（实测命中），
 * 故四条新面全部落在「本仓实测 0 命中」的位置（读码读数写在各模块头部）。
 *
 * 覆盖：
 *   1. 分段：定序与入参顺序无关（同集同哈希）
 *   2. 分段：变动段抖动不改顺序指纹（否则那条读数没有信息量）
 *   3. 分段：no_stable 时比例记 null，不记 0
 *   4. 分段：纯函数（不改入参）
 *   5. 干跑：排名 / 预算切点 / 拦截归因
 *   6. 干跑：na / green / red 三态可分（无预算 ⇒ na，不是 green）
 *   7. 干跑：malformed 不抛，且与 empty 不同形
 *   8. grain：高分胜出 / 同分取 card / 原话仍随行
 *   9. grain：不跨 uid 合并
 *  10. mirror：往返可逆（含换行 / 态度行 / 三种外层标签）
 *  11. mirror：重复保存不叠头
 *  12. 接线自证：manifest 登记 + index/engine-recall 真引用 + 诊断行注册
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);
const A = require(path.join(root, 'cache-safe-injection-segments.js'));
const B = require(path.join(root, 'recall-dryrun-lens.js'));
const C = require(path.join(root, 'recall-grain-merge.js'));
const D = require(path.join(root, 'memory-text-mirror.js'));

test('1. 分段：定序与入参顺序无关', () => {
  const b1 = { id: 'p1', text: '人物档案', order: 1 };
  const b2 = { id: 'p2', text: '正史', order: 2 };
  const x = A.plan([b1, b2]);
  const y = A.plan([b2, b1]);
  assert.equal(x.readings.orderHash, y.readings.orderHash, '同集不同入参顺序必须同指纹');
  assert.deepEqual(x.segments[0].blocks.map(b => b.id), ['p1', 'p2']);
});

test('2. 分段：变动段抖动不改顺序指纹', () => {
  const stable = [{ id: 'p1', text: '档案', order: 1 }];
  const r1 = A.plan(stable.concat([{ id: 'v1', text: '本轮召回A', volatility: 'volatile' }]));
  const r2 = A.plan(stable.concat([{ id: 'v2', text: '本轮召回BBBB', volatility: 'volatile' }]));
  assert.equal(r1.readings.orderHash, r2.readings.orderHash);
  assert.equal(A.sameStablePrefix(r1.readings, r2.readings).same, true);
  assert.equal(r1.segments[1].blocks[0].id, 'v1');
});

test('3. 分段：no_stable 时比例是 null 而不是 0', () => {
  const r = A.plan([{ id: 'v1', text: 'x', volatility: 'volatile' }]);
  assert.equal(r.state, 'no_stable');
  assert.equal(r.readings.stableRatio, null, 'null 才能与「占了 0%」分开');
  assert.equal(r.readings.cacheSafe, false);
  assert.equal(A.plan([]).state, 'malformed');
});

test('4. 分段：不改入参（纯函数）', () => {
  const blocks = [
    { id: 'b', text: 'y', order: 2 },
    { id: 'a', text: 'x', order: 1 },
    { id: 'v', text: 'z', volatility: 'volatile' }
  ];
  const snap = JSON.stringify(blocks);
  A.plan(blocks);
  assert.equal(JSON.stringify(blocks), snap, '入参顺序被就地改动了');
});

test('5. 干跑：排名 / 预算切点 / 拦截归因', () => {
  const res = B.inspect({
    budgetTokens: 100,
    tokenOf: (c) => c.tokens,
    candidates: [
      { id: 'a', floor: 3, rrfScore: 0.2, tokens: 60 },
      { id: 'b', floor: 4, rrfScore: 0.9, tokens: 60 },
      { id: 'c', floor: 5, rrfScore: 0.5, tokens: 60 }
    ]
  });
  assert.equal(res.state, 'inspected');
  assert.deepEqual(res.rows.map(r => r.id), ['b', 'c', 'a'], '必须按分数降序');
  assert.equal(res.readings.admitted, 1);
  assert.equal(res.readings.cut, 2);
  assert.equal(res.rows[1].cutBy, 'budget', '落选要带归因，不能只给个数');
  assert.equal(res.readings.tokensUsed, 60);
  assert.equal(res.readings.tokensLeft, 40);
});

test('6. 干跑：na 与 green 分开（无预算不是「通过」）', () => {
  const res = B.inspect({ candidates: [{ id: 'a', floor: 1, rrfScore: 1, tokens: 5 }] });
  const budget = res.redLines.find(x => x.key === 'budget');
  assert.equal(budget.state, 'na');
  assert.equal(res.redLines.find(x => x.key === 'unique_ids').state, 'green');
  const red = B.inspect({ candidates: [{ id: 'a', tokens: 5 }, { id: 'a', tokens: 5 }] });
  assert.equal(red.redLines.find(x => x.key === 'unique_ids').state, 'red');
  assert.equal(red.redLines.find(x => x.key === 'score_present').state, 'red');
});

test('7. 干跑：malformed 不抛，且与 empty 不同形', () => {
  const bad = B.inspect({ candidates: 'nope' });
  assert.equal(bad.state, 'malformed');
  assert.equal(bad.readings.reason, 'candidates-not-array');
  const empty = B.inspect({ candidates: [] });
  assert.equal(empty.state, 'empty');
  assert.notEqual(bad.state, empty.state);
  assert.equal(B.summary(bad).indexOf('不合法') >= 0, true);
});

test('8. grain：高分胜出 / 同分取 card / 原话仍随行', () => {
  const res = C.merge([
    { turnUid: 't1', grain: 'card', score: 0.4, text: '摘要' },
    { turnUid: 't1', grain: 'raw', score: 0.8, text: '他原话' },
    { turnUid: 't2', grain: 'card', score: 0.5, text: '摘要2' },
    { turnUid: 't2', grain: 'raw', score: 0.5, text: '原话2' }
  ]);
  assert.equal(res.state, 'merged');
  assert.equal(res.counts.merged, 2);
  const t1 = res.items.find(i => i.turnUid === 't1');
  assert.equal(t1.matchedGrain, 'raw', '高分是 raw 就该选 raw');
  assert.equal(t1.text, '他原话');
  const t2 = res.items.find(i => i.turnUid === 't2');
  assert.equal(t2.matchedGrain, 'card', '同分默认取摘要（省预算）');
  assert.equal(t2.bestRawChunkText, '原话2', '同分也把原话带出去，省不等于丢');
  assert.equal(res.dropped.length, 2);
});

test('9. grain：不跨 uid 合并', () => {
  const res = C.merge([
    { turnUid: 't1', grain: 'card', score: 0.5, text: 'a' },
    { turnUid: 't9', grain: 'raw', score: 0.5, text: '同样的话' }
  ]);
  assert.equal(res.items.length, 2, '不同楼层的相同内容不是同一条记忆');
  assert.equal(res.state, 'single');
  assert.equal(C.merge(null).state, 'malformed');
});

test('10. mirror：往返可逆（换行 / 态度 / 外层标签）', () => {
  const notes = [
    { from: 12, to: 14, tag: '核心记忆', text: '他第一次叫她名字。' },
    { from: 40, tag: '近期记忆', text: '她把伞留给了他。\n然后走了。' }
  ];
  const text = D.render({ notes, attitude: '开始信任', wrap: true, character: '阿岚' });
  const back = D.parse(text);
  assert.equal(back.state, 'parsed');
  assert.equal(back.attitude, '开始信任');
  assert.equal(back.character, '阿岚');
  assert.equal(back.tag, 'character_memory');
  assert.equal(back.notes.length, 2);
  assert.deepEqual(back.notes[0], { from: 12, to: 14, tag: '核心记忆', text: '他第一次叫她名字。' });
  assert.deepEqual(back.notes[1], { from: 40, to: 40, tag: '近期记忆', text: '她把伞留给了他。\n然后走了。' });
  const again = D.render({ notes: back.notes, attitude: back.attitude });
  assert.equal(D.parse(again).notes.length, 2, '二次往返必须稳定');
});

test('11. mirror：重复保存不叠头', () => {
  const body = '使用说明：这是注入抬头\n角色标识：阿岚\n【灵魂原典·初建底色】 她怕黑。';
  const stripped = D.stripInjectedHeader(body);
  assert.equal(stripped, '她怕黑。');
  const legacy = '<character_archive character="旧档">\n【角色记忆与人物弧光轨迹】\n• [第3楼｜近期记忆]：「旧话」\n当前对{{user}}态度：疏远\n</character_archive>';
  const p = D.parse(legacy);
  assert.equal(p.tag, 'character_archive', '旧标签也要认，只认一种会丢内容');
  assert.equal(p.notes.length, 1);
  assert.equal(p.attitude, '疏远');
  assert.equal(D.parse('').state, 'empty');
});

test('12. 接线自证：登记 + 真引用 + 诊断行', () => {
  const man = JSON.parse(read('manifest.json'));
  for (const m of ['cache-safe-injection-segments.js', 'recall-dryrun-lens.js',
                   'recall-grain-merge.js', 'memory-text-mirror.js']) {
    assert.equal(man.extra_js.includes(m), true, 'manifest 未登记 ' + m);
  }
  const idx = read('index.js');
  for (const fn of ['_cacheSafeSegmentsLib', '_recallDryRunLensLib', '_recallGrainMergeLib', '_memoryTextMirrorLib']) {
    assert.equal(idx.includes('function ' + fn + '('), true, 'index.js 缺库口 ' + fn);
    assert.equal(idx.includes(fn + ': ' + fn), true, 'libs 未注入 ' + fn);
  }
  assert.equal(idx.includes('_planInjectionSegments(blocks)'), true, '插件类缺 _planInjectionSegments');
  assert.equal(idx.includes('_renderMemoryMirror(notes, opts)'), true, '插件类缺 _renderMemoryMirror');
  const rec = read('engine-recall.js');
  assert.equal(rec.includes('_lastRecallGrainMerge'), true, '召回没记双粒度读数');
  assert.equal(rec.includes('_lastRecallDryRun'), true, '召回没记干跑读数');
  const diag = read('engine-diagnostic-lines.js');
  for (const line of ['_cacheSafeSegmentsLine', '_recallGrainMergeLine', '_recallDryRunLine', '_memoryMirrorLine']) {
    assert.equal(diag.includes(line + ': ' + line), true, '诊断行未注册 ' + line);
  }
});

/* ========== 13. 当版自锚（版本守卫 V4：当版档案里恰一处 vnum 锚点） ========== */
{
  const vnum = (s) => {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
  };
  const cur = (/const VERSION = '([0-9.]+)'/.exec(read('index.js')) || [])[1];
  assert.equal(cur, '3.484.0', 'index.js VERSION 应为 3.484.0，实得 ' + cur);
  assert.equal(vnum('3.484.0'), 3484000, '数值口径不可复算');
  assert.equal(JSON.parse(read('manifest.json')).version, '3.484.0');
  assert.equal(JSON.parse(read('package.json')).version, '3.484.0');
}
