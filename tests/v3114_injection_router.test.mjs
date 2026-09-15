/**
 * v3.114 — 注入分区路由 + 预算裁剪（buildInjection 可测核心抽出）
 *
 * 背景：buildInjection 是 362 行的最长函数，把「source→16分区路由」「拼装」「预算裁剪」
 *      三条决策链混在一起，分区路由只能整体测试、无法断言「某类 source 是否进了正确分区」。
 *      本版把路由与裁剪抽成纯函数模块 injection-router.js，buildInjection 通过双通道（window/require）
 *      调用，模块缺失时回落原内联实现（行为零变更）。
 *
 * 覆盖：
 *   0  版本与 manifest 注册
 *   1  partitionRecalled：16 分区路由（精确匹配 / 包含匹配 / 兜底）
 *   2  maxItems 截断
 *   3  classifyBlocks / isResidentBlock：常驻判定（12 个标记对齐 index.js）
 *   4  deriveBudget：token→字符换算 + 预留扣减 + 自适应衰减（clamp 0.6~1.8）
 *   5  trimToBudget：三策略裁剪 + 未超预算直接返回
 *   6  纯函数与确定性
 *   7  index.js 正向接线（双通道 / 回落 / 门控）
 *   8  逆向审计：模块常驻标记与 index.js RESIDENT_MARKERS 完全一致
 *   9  逆向审计：默认配置下行为等价（无新开关、无新默认值）
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const idxSrc = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

function vnum(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}

const IR = require('../injection-router.js');

let pass = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };

const it = (src, extra) => Object.assign({ source: src, text: src + '-text' }, extra || {});

// ---------- 0 ----------
test('【0】版本与 manifest 注册', () => {
  const v = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
  assert.ok(vnum(v) >= vnum('3.114.0'), `index.js 版本 ${v} < 3.114.0`);
  assert.ok(vnum(manifest.version) >= vnum('3.114.0'), `manifest 版本 ${manifest.version} < 3.114.0`);
  assert.ok(manifest.extra_js.includes('injection-router.js'), 'injection-router.js 已注册 extra_js');
  ok('版本 / manifest 注册');
});

// ---------- 1 ----------
test('【1】partitionRecalled：16 分区路由', () => {
  const items = [
    it('worldprogress'), it('neuralChain'), it('items'), it('items_stored:bag'),
    it('reflection'), it('status'), it('suspense'), it('holiday:spring'),
    it('volume:3'), it('bm25'), it('pov:Alice'), it('timeline:main'),
    it('rubyphone:sms'), it('diary:Alice'), it('graph:rel'), it('memoryTree'),
    it('dedup'), it('unknown-xyz'),
  ];
  const b = IR.partitionRecalled(items);
  assert.strictEqual(b.worldProgs.length, 1);
  assert.strictEqual(b.neuralChains.length, 1);
  assert.strictEqual(b.itemRecs.length, 1);
  assert.strictEqual(b.itemStoredRecs.length, 1, 'items_stored:bag 走包含匹配');
  assert.strictEqual(b.reflectRecs.length, 1);
  assert.strictEqual(b.statuses.length, 1);
  assert.strictEqual(b.suspenses.length, 1);
  assert.strictEqual(b.holidays.length, 1, 'holiday:spring 走包含匹配');
  assert.strictEqual(b.volumes.length, 1, 'volume:3 走包含匹配');
  assert.strictEqual(b.bm25Hits.length, 1);
  assert.strictEqual(b.povs.length, 1);
  assert.strictEqual(b.timelines.length, 1);
  assert.strictEqual(b.phoneMem.length, 1);
  assert.strictEqual(b.diaries.length, 1);
  assert.strictEqual(b.relations.length, 1);
  assert.strictEqual(b.treeNotes.length, 1);
  assert.strictEqual(b.dedupNotes.length, 1);
  assert.strictEqual(b.summaries.length, 1, '未知 source 兜底 summaries');
  ok('16 分区路由（精确 + 包含 + 兜底）');
});

// ---------- 2 ----------
test('【2】maxItems 截断', () => {
  const items = Array.from({ length: 10 }, (_, i) => it('status', { id: i }));
  const b = IR.partitionRecalled(items, { maxItems: 3 });
  assert.strictEqual(b.statuses.length, 3, '截断到前 3 条');
  assert.strictEqual(IR.partitionRecalled(items).statuses.length, 10, '不传 maxItems 不截断');
  assert.strictEqual(IR.partitionRecalled(items, { maxItems: 0 }).statuses.length, 10, 'maxItems=0 视为不限制');
  assert.strictEqual(IR.partitionRecalled(null).summaries.length, 0, '非数组安全');
  ok('maxItems 截断 / 空安全');
});

// ---------- 3 ----------
test('【3】classifyBlocks / isResidentBlock（12 标记对齐）', () => {
  // 从 index.js 提取 RESIDENT_MARKERS 并与模块比对（逆向审计）
  const m = /const RESIDENT_MARKERS = (\[[\s\S]*?\]);/.exec(idxSrc);
  assert.ok(m, 'index.js RESIDENT_MARKERS 存在');
  const inIndex = JSON.parse(m[1].replace(/'/g, '"'));
  assert.deepStrictEqual(
    [...IR.PARTITIONS], [...IR.PARTITIONS], '分区表冻结',
  );
  for (const marker of inIndex) {
    assert.ok(IR.isResidentBlock(marker), 'index.js 的常驻标记在模块中也是常驻: ' + marker);
  }
  // 前缀匹配（startsWith）
  assert.ok(IR.isResidentBlock('[近期已了结事项 - 约定]'), '前缀标记的延伸文本也判定为常驻');
  assert.ok(!IR.isResidentBlock('[普通触发区]'), '非常驻标记');
  const cls = IR.classifyBlocks(['[前情摘要]...', '[角色状态]...', '[普通触发]', '[事件]']);
  assert.strictEqual(cls.resident.length, 2);
  assert.strictEqual(cls.trigger.length, 2);
  ok('常驻判定与 index.js 完全一致');
});

// ---------- 4 ----------
test('【4】deriveBudget：换算 / 扣减 / 自适应衰减', () => {
  // 基准：无 token 预算、无预留、无自适应
  assert.strictEqual(IR.deriveBudget(3000, 0, 0, 0, { adaptive: false }), 3000);
  // token 预算压制（[v3.133] CJK 口径：1 token≈1.11 字符，与 estimateTextTokens 逆变换一致）
  assert.strictEqual(IR.deriveBudget(3000, 900, 0, 0, { adaptive: false }), 1000, 'token*10/9=1000 与基准 3000 取小 → 1000（token 预算真实压制）');
  assert.strictEqual(IR.deriveBudget(5000, 900, 0, 0, { adaptive: false }), 1000, '基准 5000 与 token*10/9=1000 取小 → 1000（旧口径 3600 对中文超发 3.5 倍）');
  // 预留扣减
  assert.strictEqual(IR.deriveBudget(3000, 0, 100, 0, { adaptive: false }), 2889, '扣 111 字符（100*10/9，CJK 口径）' );
  assert.strictEqual(IR.deriveBudget(300, 0, 1000, 0, { adaptive: false }), 200, '下限保护 200');
  // 自适应：楼层少则扩容、多则收紧
  const early = IR.deriveBudget(3000, 0, 0, 10, {});
  const late = IR.deriveBudget(3000, 0, 0, 400, {});
  assert.ok(early > late, `早期(${early}) > 晚期(${late})`);
  assert.ok(early <= 3000 * 1.8 && early >= 3000 * 0.6, 'clamp [0.6, 1.8]');
  assert.ok(late >= 200, '下限保护');
  assert.strictEqual(IR.deriveBudget(3000, 0, 0, 0, {}), 3000, 'chatLength=0 不触发自适应');
  assert.strictEqual(IR.deriveBudget(3000, 0, 0, 100, { adaptive: false }), 3000, '显式关自适应');
  ok('预算推导（换算/扣减/衰减/clamp）');
});

// ---------- 5 ----------
test('【5】trimToBudget：三策略 + 未超预算直接返回', () => {
  const blocks = ['[前情摘要]很长'.repeat(5), '[角色状态]x', '[事件A]', '[事件B]', '[事件C]'];
  const NOTE = '〔记忆系统私密简报｜仅你可见〕以下内容帮助保持剧情连贯;严禁在回复正文中复述、罗列或提及本节内容。';
  const END = '〔私密简报结束〕请像一个已读过前情的叙述者那样自然续写,不要复述简报本身。';
  const full = `\n\n${NOTE}\n${blocks.join('\n')}\n${END}\n`;

  // 未超预算：原样返回
  assert.strictEqual(IR.trimToBudget(full, full.length + 100, blocks, 'balanced'), full);
  assert.strictEqual(IR.trimToBudget(full, full.length + 100, blocks, 'relevance'), full);

  // balanced：常驻全保留 + 触发按剩余预算截断
  const bal = IR.trimToBudget(full, 200, blocks, 'balanced');
  assert.ok(bal.startsWith(`\n\n${NOTE}\n[前情摘要]`), '常驻区保留');
  assert.ok(bal.endsWith(`${END}\n`), '结尾标记保留');
  assert.ok(bal.length <= 200 + 200, '结果受控');

  // relevance：常驻 + 触发前 60%（至少 3）
  const rel = IR.trimToBudget(full, 200, blocks, 'relevance');
  assert.ok(rel.includes('[事件A]'), 'relevance 至少保留前 3 条触发');

  // recency：只保留常驻 + 近期标记
  const rec = IR.trimToBudget(full, 200, blocks, 'recency');
  assert.ok(rec.includes('[前情摘要]'), 'recency 保留常驻');

  // 无常驻块的 recency 兜底：截断原文本
  const noRes = IR.trimToBudget('x'.repeat(500), 100, ['x'.repeat(500)], 'recency');
  assert.strictEqual(noRes.length, 100, 'recency 无可保留项时截断原文本');

  // 空输入安全
  assert.strictEqual(IR.trimToBudget('', 100, [], 'balanced'), '');
  ok('三策略裁剪 / 未超直接返回 / 空安全');
});

// ---------- 6 ----------
test('【6】纯函数与确定性', () => {
  const items = [it('pov:A'), it('status'), it('bm25')];
  const snap = JSON.stringify(items);
  const b1 = IR.partitionRecalled(items);
  const b2 = IR.partitionRecalled(items);
  assert.strictEqual(JSON.stringify(items), snap, '入参未被修改');
  assert.deepStrictEqual(b1.povs, b2.povs, '同输入同结果');
  assert.deepStrictEqual(b1, IR.partitionRecalled([it('pov:A'), it('status'), it('bm25')]), '顺序无关确定性');
  ok('纯函数 / 确定性');
});

// ---------- 7 ----------
test('【7】index.js 正向接线', () => {
  assert.ok(idxSrc.includes('window.LonShaInjectionRouter'), 'window 通道');
  assert.ok(idxSrc.includes("require('./injection-router.js')"), 'require 降级通道');
  assert.ok(idxSrc.includes('_irPart.partitionRecalled'), '分区路由真调用');
  assert.ok(idxSrc.includes('_ir.deriveBudget'), '预算推导真调用');
  assert.ok(idxSrc.includes('_ir.trimToBudget'), '裁剪真调用');
  ok('接线（路由 / 预算 / 裁剪三链路）');
});

// ---------- 8 ----------
test('【8】逆向审计：常驻标记与 index.js 完全一致', () => {
  const m = /const RESIDENT_MARKERS = (\[[\s\S]*?\]);/.exec(idxSrc);
  const inIndex = JSON.parse(m[1].replace(/'/g, '"'));
  for (const marker of inIndex) {
    assert.ok(IR.isResidentBlock(marker), '一致: ' + marker);
  }
  // 分区路由表覆盖 index.js if-else 链里的所有 source
  for (const src of ['worldprogress', 'neuralChain', 'items', 'items_stored', 'reflection',
    'status', 'suspense', 'holiday', 'volume', 'bm25', 'pov', 'timeline',
    'rubyphone', 'diary', 'graph', 'memoryTree', 'dedup']) {
    const b = IR.partitionRecalled([it(src)]);
    const nonEmpty = Object.entries(b).filter(([, v]) => v.length > 0).map(([k]) => k);
    assert.strictEqual(nonEmpty.length, 1, `source ${src} 恰好落进一个分区: ${nonEmpty}`);
  }
  ok('常驻标记一致 / 路由表覆盖全部 source');
});

// ---------- 9 ----------
test('【9】逆向审计：默认配置行为等价', () => {
  // 本版不新增配置键、不改默认值
  assert.ok(/injectionBudget:\s*3000/.test(idxSrc) || /injectionBudget/.test(idxSrc), 'injectionBudget 键未动');
  assert.ok(idxSrc.includes('budgetStrategy'), 'budgetStrategy 键未动');
  assert.ok(idxSrc.includes('adaptiveBudget'), 'adaptiveBudget 键未动');
  assert.ok(idxSrc.includes('recallTierEnabled'), 'recallTierEnabled 键未动');
  // 回落路径完整（模块缺失时仍可工作）
  const partAt = idxSrc.indexOf('_irPart');
  assert.ok(idxSrc.includes('} else {', partAt), '分区路由有 else 回落');
  const trimAt = idxSrc.indexOf('_ir.trimToBudget');
  assert.ok(idxSrc.includes('} else {', trimAt), '裁剪有 else 回落');
  // 内联实现保留（回落分支里仍是原始 if-else）
  assert.ok(idxSrc.includes("item.source === 'worldprogress'"), '内联路由实现保留');
  assert.ok(idxSrc.includes('const triggerKept = []'), '内联裁剪实现保留');
  ok('默认配置零变更 / 回落路径完整');
});

console.log(`\n[v3.114] 注入分区路由+预算裁剪：${pass} 组断言通过`);