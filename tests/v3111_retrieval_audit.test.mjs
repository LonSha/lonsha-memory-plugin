/**
 * v3.111 — 召回自检（缝合 bionic retrieval/recall-candidate-packet.js
 *                          + maintenance/task-graph-stats.js）
 *
 * 覆盖：
 *   0  版本与 manifest 注册
 *   1  auditVectorEntry：七类归因逐条触发
 *   2  auditVectorStore：重复判定确定性 / 计数 / 覆盖率
 *   3  planVectorTail：排序 / 归因通道 / exclude / limit
 *   4  summarizeTypeCounts：schema 顺序 vs 无 schema 排序
 *   5  createReferenceMap：稳定编号 / 裁剪 / byMemoryId
 *   6  buildGraphOverview 文本形状 + summarizeAudit 结论
 *   7  纯函数与确定性
 *   8  index.js 正向接线（体检报告 / 补召回 / 门控 / 上限）
 *   9  逆向审计：默认关时召回主链路零变更
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
const suiSrc = readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf8');

function vnum(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}

const RA = require('../retrieval-audit.js');

let pass = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };

const vec = (over) => Object.assign({
  id: 'v1',
  text: '内容',
  embedding: [1, 0, 0],
  metadata: {},
  timestamp: 1000,
  accessCount: 1,
  importance: 6,
}, over || {});

const node = (id, type, extra) => Object.assign({ id, type, label: '标签' + id }, extra || {});

// ---------- 0 ----------
test('【0】版本与 manifest 注册', () => {
  const v = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
  assert.ok(vnum(v) >= vnum('3.111.0'), `index.js 版本 ${v} < 3.111.0`);
  assert.ok(vnum(manifest.version) >= vnum('3.111.0'), `manifest 版本 ${manifest.version} < 3.111.0`);
  assert.ok(manifest.extra_js.includes('retrieval-audit.js'), 'retrieval-audit.js 已注册 extra_js');
  ok('版本 / manifest 注册');
});

// ---------- 1 ----------
test('【1】auditVectorEntry：七类归因', () => {
  assert.deepStrictEqual(RA.auditVectorEntry(vec(), {}).reasons, [], '健康条无归因');

  assert.ok(RA.auditVectorEntry(vec({ embedding: undefined }), {}).reasons.includes('missing-embedding'));
  assert.ok(RA.auditVectorEntry(vec({ embedding: [] }), {}).reasons.includes('missing-embedding'));

  assert.ok(RA.auditVectorEntry(vec({ embedding: [0, 0, 0] }), {}).reasons.includes('zero-vector'));
  assert.ok(!RA.auditVectorEntry(vec({ embedding: [0, 1, 0] }), {}).reasons.includes('zero-vector'), '非全零不算');

  assert.ok(RA.auditVectorEntry(vec({ embedding: [1, 0] }), { expectedDimension: 3 }).reasons.includes('dimension-mismatch'));
  assert.ok(!RA.auditVectorEntry(vec({ embedding: [1, 0, 0] }), { expectedDimension: 3 }).reasons.includes('dimension-mismatch'));
  assert.ok(!RA.auditVectorEntry(vec({ embedding: [1, 0] }), {}).reasons.includes('dimension-mismatch'), '未给基准则不判维度');

  assert.ok(RA.auditVectorEntry(vec({ text: 'x'.repeat(50) }), { maxTextChars: 20 }).reasons.includes('oversized-text'));

  const orphan = vec({ metadata: { chunkGroup: 'cg1', chunkTotal: 4 } });
  assert.ok(RA.auditVectorEntry(orphan, { chunkIndexesByGroup: { cg1: [0, 1] } }).reasons.includes('orphan-chunk'));
  assert.ok(!RA.auditVectorEntry(orphan, { chunkIndexesByGroup: { cg1: [0, 1, 2, 3] } }).reasons.includes('orphan-chunk'));
  assert.ok(!RA.auditVectorEntry(orphan, {}).reasons.includes('orphan-chunk'), '未给组信息则不判');

  const stale = vec({ timestamp: 1, accessCount: 0, importance: 2 });
  assert.ok(RA.auditVectorEntry(stale, { staleAfterMs: 1000, now: 999999 }).reasons.includes('stale-access'));
  assert.ok(!RA.auditVectorEntry(vec({ timestamp: 999999, accessCount: 0, importance: 2 }), { staleAfterMs: 1000, now: 999999 }).reasons.includes('stale-access'), '未超期不算');
  assert.ok(!RA.auditVectorEntry(vec({ timestamp: 1, accessCount: 5, importance: 2 }), { staleAfterMs: 1000, now: 999999 }).reasons.includes('stale-access'), '访问过不算');
  assert.ok(!RA.auditVectorEntry(vec({ timestamp: 1, accessCount: 0, importance: 9 }), { staleAfterMs: 1000, now: 999999 }).reasons.includes('stale-access'), '高重要度不算');
  assert.ok(!RA.auditVectorEntry(vec({ timestamp: 1, accessCount: 0, importance: 2 }), {}).reasons.includes('stale-access'), '未开老化判定则不算');

  const m = RA.auditVectorEntry(vec({ embedding: [1, 0, 0] }), {});
  assert.strictEqual(m.vectorLength, 3);
  assert.strictEqual(m.embeddingMissing, false);
  assert.strictEqual(m.importance, 6);
  ok('单条体检 / 七类归因 / 不误报');
});

// ---------- 2 ----------
test('【2】auditVectorStore：重复判定确定性 / 计数 / 覆盖率', () => {
  const list = [
    vec({ id: 'a', text: '同一段', timestamp: 500 }),
    vec({ id: 'b', text: '同一段', timestamp: 100 }),
    vec({ id: 'c', text: '唯一', embedding: [] }),
    vec({ id: 'd', text: '同一段', timestamp: 900 }),
  ];
  const a = RA.auditVectorStore(list, { expectedDimension: 3 });
  assert.deepStrictEqual(a.duplicateIds.sort(), ['a', 'd'], '保留时间戳最早者（b）');
  assert.deepStrictEqual(a.duplicateKeptIds, ['b'], '保留者被记录');
  assert.strictEqual(a.total, 4);
  assert.strictEqual(a.issueCounts['duplicate-text'], 2, '重复计数');
  assert.strictEqual(a.issueCounts['missing-embedding'], 1);
  assert.strictEqual(a.healthy, 1, '仅 b 无问题（时间戳最早且唯一）');

  // 输入顺序无关：同一批数据打乱后重复集合相同
  const shuffled = [list[3], list[2], list[1], list[0]];
  const a2 = RA.auditVectorStore(shuffled, { expectedDimension: 3 });
  assert.deepStrictEqual(a2.duplicateIds.sort(), a.duplicateIds.sort(), '重复判定与顺序无关');
  assert.deepStrictEqual(a2.duplicateKeptIds, a.duplicateKeptIds, '保留集与顺序无关');

  // 时间戳相同 → 先出现者胜（确定性）
  const t0 = [vec({ id: 'x', text: 't', timestamp: 0 }), vec({ id: 'y', text: 't', timestamp: 0 })];
  assert.deepStrictEqual(RA.auditVectorStore(t0, {}).duplicateIds, ['y'], '同时间戳取先出现者');

  // 文本为空的条目不参与重复判定
  const blanks = [vec({ id: 'e', text: '' }), vec({ id: 'f', text: '' })];
  assert.deepStrictEqual(RA.auditVectorStore(blanks, {}).duplicateIds, [], '空文本不判重');

  assert.strictEqual(RA.auditVectorStore(null, {}).total, 0, '非数组安全');
  const sum = RA.summarizeAudit(a);
  assert.strictEqual(sum.coverage, 0.25, '覆盖率 = 健康/总数');
  assert.strictEqual(sum.unhealthy, 3);
  const emptySum = RA.summarizeAudit(RA.auditVectorStore([], {}));
  assert.strictEqual(emptySum.coverage, 1, '空库覆盖率 1（不除零）');
  ok('整体体检 / 确定性 / 覆盖率');
});

// ---------- 3 ----------
test('【3】planVectorTail：排序 / 通道 / 排除 / 上限', () => {
  const list = [
    vec({ id: 'low', text: 'A', embedding: [], floor: 3, importance: 9 }),
    vec({ id: 'high', text: 'B', embedding: [], floor: 30, importance: 2 }),
    vec({ id: 'mid', text: 'C', embedding: [0, 0, 0], floor: 30, importance: 7 }),
    vec({ id: 'dup', text: 'D', timestamp: 1 }),
    vec({ id: 'dup2', text: 'D', timestamp: 2 }),
    vec({ id: 'ok', text: 'E' }),
  ];
  const tail = RA.planVectorTail(list, { expectedDimension: 3, limit: 10 });
  assert.deepStrictEqual(tail.candidates.map(c => c.id), ['mid', 'high', 'low'], 'floor 降序→importance 降序');
  assert.deepStrictEqual(tail.candidates[0].channels, ['vector-tail', 'zero-vector'], '通道含归因');
  assert.strictEqual(tail.candidates[0].rank, 1, 'rank 从 1 起');
  assert.strictEqual(tail.channels['missing-embedding'], 2);
  assert.strictEqual(tail.channels['zero-vector'], 1);
  assert.strictEqual(tail.channels['duplicate-text'], undefined, '重复默认不进掉队清单');
  assert.strictEqual(tail.flaggedTotal, 3);

  const limited = RA.planVectorTail(list, { expectedDimension: 3, limit: 2 });
  assert.strictEqual(limited.candidates.length, 2, 'limit 生效');
  assert.strictEqual(limited.flaggedTotal, 3, 'flaggedTotal 反映总数');

  const excluded = RA.planVectorTail(list, { expectedDimension: 3, excludeIds: ['mid', 'low'] });
  assert.deepStrictEqual(excluded.candidates.map(c => c.id), ['high'], 'excludeIds 生效');

  const onlyZero = RA.planVectorTail(list, { expectedDimension: 3, includeReasons: ['zero-vector'] });
  assert.deepStrictEqual(onlyZero.candidates.map(c => c.id), ['mid'], 'includeReasons 白名单');

  const fromVault = RA.planVectorTail({ vectors: list }, { expectedDimension: 3 });
  assert.strictEqual(fromVault.flaggedTotal, 3, '支持 {vectors} 形状');

  const dim = RA.planVectorTail([vec({ id: 'dim', embedding: [1, 0] })], { expectedDimension: 3 });
  assert.deepStrictEqual(dim.candidates[0].channels, ['vector-tail', 'dimension-mismatch'], '维度不符可补召回');
  ok('掉队清单 / 排序 / 通道 / 上限 / 排除');
});

// ---------- 4 ----------
test('【4】summarizeTypeCounts：schema 顺序 vs 无 schema 排序', () => {
  const nodes = [node('n1', 'event'), node('n2', 'event'), node('n3', 'character'), node('n4', 'quest')];
  const schema = [{ id: 'quest', label: '任务' }, { id: 'event', label: '事件' }, { id: 'character' }];
  const withSchema = RA.summarizeTypeCounts(nodes, schema);
  assert.deepStrictEqual(withSchema.map(r => r.typeId), ['quest', 'event', 'character'], '按 schema 顺序');
  assert.deepStrictEqual(withSchema.map(r => r.count), [1, 2, 1]);
  assert.strictEqual(withSchema[1].label, '事件', 'schema label 优先');

  const noSchema = RA.summarizeTypeCounts(nodes, null);
  assert.deepStrictEqual(noSchema.map(r => r.typeId), ['character', 'event', 'quest'], '无 schema 按类型名排序');
  assert.strictEqual(noSchema[1].label, '事件', '内置标签兜底');
  assert.strictEqual(RA.summarizeTypeCounts([node('x', 'weird')], null)[0].label, 'weird', '未知类型回退 id');

  const keepZero = RA.summarizeTypeCounts(nodes, [{ id: 'pov_memory' }], { includeTypes: false });
  assert.deepStrictEqual(keepZero.map(r => [r.typeId, r.count]), [['pov_memory', 0]], 'includeTypes:false 保留零计数');

  const archived = RA.summarizeTypeCounts([node('a1', 'event'), node('a2', 'event', { archived: true })], null);
  assert.strictEqual(archived[0].count, 1, '归档节点不计入');
  assert.deepStrictEqual(RA.summarizeTypeCounts(null, null), [], '非数组安全');
  assert.deepStrictEqual(RA.summarizeTypeCounts([node('z', '')], null), [], '无类型节点跳过');
  ok('类型计数 / schema 顺序 / 归档剔除');
});

// ---------- 5 ----------
test('【5】createReferenceMap：稳定编号 / 裁剪 / byMemoryId', () => {
  const scored = [
    { node: node('m1', 'event', { label: '码头之约' }), score: 0.8123 },
    { node: node('m2', 'character', { label: '珞珈' }), weightedScore: 0.5 },
    { node: node('m3', 'location', { label: '这'.repeat(40) }), finalScore: 0.25 },
    { node: node('m4', 'event', { label: '零分' }), score: 0 },
    { node: node('m5', 'event', { label: '归档', archived: true }), score: 0.9 },
  ];
  const map = RA.createReferenceMap(scored, { maxCount: 6, maxLength: 10 });
  assert.deepStrictEqual(map.references.map(r => r.key), ['G1', 'G2', 'G3'], '排除零分与归档后连续编号');
  assert.deepStrictEqual(map.references.map(r => r.memoryId), ['m1', 'm2', 'm3']);
  assert.strictEqual(map.references[0].typeLabel, '事件');
  assert.strictEqual(map.references[0].score, 0.812, '分数三位小数');
  assert.strictEqual(map.references[1].score, 0.5, 'weightedScore 兜底');
  assert.strictEqual(map.references[2].label.length, 10, '标签裁剪到上限');
  assert.ok(map.references[2].label.endsWith('…'), '裁剪加省略号');
  assert.deepStrictEqual(map.byMemoryId, { m1: 'G1', m2: 'G2', m3: 'G3' });

  const capped = RA.createReferenceMap(scored, { maxCount: 1, prefix: 'N' });
  assert.deepStrictEqual(capped.references.map(r => r.key), ['N1'], 'maxCount + 前缀');

  const again = RA.createReferenceMap(scored, { maxCount: 6 });
  assert.deepStrictEqual(again.references.map(r => r.key), map.references.map(r => r.key), '同输入同编号（prompt 与诊断共用）');
  assert.strictEqual(RA.clipLabel('', 5), '—', '空标签占位');
  ok('引用键 / 编号稳定 / 裁剪');
});

// ---------- 6 ----------
test('【6】buildGraphOverview 文本 + summarizeAudit 结论', () => {
  const nodes = [node('n1', 'event', { label: 'A' }), node('n2', 'event', { label: 'B' })];
  const refMap = RA.createReferenceMap([{ node: node('n2', 'event', { label: 'B' }), score: 0.75 }], {});
  const text = RA.buildGraphOverview(nodes, null, refMap, {});
  assert.ok(text.startsWith('### 图谱节点统计'), '标题行');
  assert.ok(text.includes('  - 事件: 2'), '类型计数行');
  assert.ok(text.includes('### 与当前任务最相关的既有节点'), '相关节点小节');
  assert.ok(text.includes('- [G1|事件] B (score=0.750)'), '引用行格式');
  assert.strictEqual(RA.buildGraphOverview([], null, null, {}), '', '空图返回空串');
  assert.strictEqual(RA.buildGraphOverview([{}], [], null, {}), '', '无有效类型返回空串');

  const custom = RA.buildGraphOverview(nodes, null, refMap, { heading: '统计', relevantHeading: '相关' });
  assert.ok(custom.includes('### 统计') && custom.includes('### 相关'), '标题可注入');

  const audit = RA.auditVectorStore([
    vec({ id: 'a', text: 'A', embedding: [] }),
    vec({ id: 'b', text: 'B', embedding: [0, 0, 0] }),
    vec({ id: 'c', text: 'C', embedding: [1, 0] }),
    vec({ id: 'd', text: 'D' }),
  ], { expectedDimension: 3 });
  const sum = RA.summarizeAudit(audit, { topN: 2 });
  assert.strictEqual(sum.total, 4);
  assert.strictEqual(sum.healthy, 1, '仅 d 健康');
  assert.strictEqual(sum.blockingRecall, 3, '三类向量缺陷均阻断召回');
  assert.strictEqual(sum.recoverable, 3);
  assert.strictEqual(sum.topIssues.length, 2, 'topN 截断');
  assert.ok(sum.topIssues.every(i => i.count === 1));
  ok('总览文本 / 体检结论');
});

// ---------- 7 ----------
test('【7】纯函数与确定性', () => {
  const list = [vec({ id: 'a' }), vec({ id: 'b', embedding: [] })];
  const snap = JSON.stringify(list);
  const nodes = [node('n1', 'event')];
  const nodeSnap = JSON.stringify(nodes);
  RA.auditVectorStore(list, { expectedDimension: 3 });
  RA.planVectorTail(list, {});
  RA.summarizeTypeCounts(nodes, null);
  RA.createReferenceMap([{ node: nodes[0], score: 1 }], {});
  assert.strictEqual(JSON.stringify(list), snap, '向量入参未被修改');
  assert.strictEqual(JSON.stringify(nodes), nodeSnap, '节点入参未被修改');

  const r1 = RA.auditVectorStore(list, {});
  const r2 = RA.auditVectorStore(list, {});
  assert.deepStrictEqual(r1.issueCounts, r2.issueCounts, '同输入同结果');
  assert.deepStrictEqual(RA.planVectorTail(list, {}).candidates, RA.planVectorTail(list, {}).candidates);
  ok('纯函数 / 确定性');
});

// ---------- 8 ----------
test('【8】index.js 接线：体检报告 + 掉队补召回', () => {
  assert.ok(idxSrc.includes('window.LonShaRetrievalAudit'), 'window 通道');
  assert.ok(idxSrc.includes("require('./retrieval-audit.js')"), 'require 降级通道');
  assert.ok(idxSrc.includes('ra.auditVectorStore'), '体检真调用');
  assert.ok(idxSrc.includes('ra.summarizeAudit'), '结论真调用');
  assert.ok(idxSrc.includes('ra.planVectorTail'), '掉队清单真调用');
  assert.ok(idxSrc.includes('ra.summarizeTypeCounts'), '图谱计数真调用');
  assert.ok(idxSrc.includes('召回体检') && idxSrc.includes('exportMemoryReport'), '审计报告展示');
  assert.ok(/vectorTailRecoveryEnabled:\s*false/.test(idxSrc), '补召回默认关（不改变既有行为）');
  assert.ok(idxSrc.includes('vectorTailRecoveryEnabled === true'), '门控为显式 === true');
  assert.ok(/vectorTailRecoveryLimit:\s*8/.test(idxSrc), '上限配置存在（防灌爆候选池）');
  assert.ok(idxSrc.includes("source: 'vector:tail'"), '补召回条目带来源标记');
  assert.ok(idxSrc.includes('includeReasons: [\'missing-embedding\', \'zero-vector\', \'dimension-mismatch\']'),
    '只补真阻断召回的缺陷，不带重复/陈旧');
  assert.ok(suiSrc.includes('vectorTailRecoveryEnabled'), 'settings-ui 声明该键（非幽灵配置）');
  ok('接线（体检 / 补召回 / 上限 / UI）');
});

// ---------- 9 ----------
test('【9】逆向审计：默认关时召回主链路零变更', () => {
  const gateAt = idxSrc.indexOf('if (this.config.config.vectorTailRecoveryEnabled === true');
  assert.ok(gateAt > 0, '补召回门控分支存在');
  const vecAt = idxSrc.indexOf("const vectorResults = await this.vector.search(");
  assert.ok(vecAt > 0 && vecAt < gateAt, '既有向量检索仍在且位于补召回之前');
  const blockEnd = idxSrc.indexOf('// [v1.9] P1: 卷摘要召回', gateAt);
  assert.ok(blockEnd > gateAt, '定位补召回分支结尾');
  const block = idxSrc.slice(gateAt, blockEnd);
  assert.ok(!/results\.vector\s*=\s*\[/.test(block), '补召回不重置既有向量结果（只追加）');
  assert.ok(block.includes('results.vector.push('), '仅追加');
  assert.ok(/catch \(e\) \{ errLog\(e,/.test(block), '异常被吞不影响主链路');

  // 既有召回源配置未动
  assert.ok(idxSrc.includes('vectorEnabled: true'), '既有向量开关未动');
  assert.ok(idxSrc.includes('summaryFoldEnabled'), '卷摘要召回仍在');
  assert.ok(idxSrc.includes('holidayAware'), '节日感知召回仍在');

  // 体检是纯读：exportMemoryReport 内不得出现对向量库的写操作
  const reportAt = idxSrc.indexOf('召回体检');
  assert.ok(reportAt > 0);
  const reportBlock = idxSrc.slice(reportAt - 400, reportAt + 1600);
  assert.ok(!/this\.vector\.vectors\s*=\s*[^=]/.test(reportBlock), '体检不写回向量库');
  assert.ok(!/\.push\(/.test(reportBlock) || /L\.push\(/.test(reportBlock), '报告内只 push 文本行');

  // 无配置键的纯读诊断：默认始终生效且不改变召回结果
  assert.ok(!/retrievalAuditEnabled/.test(idxSrc), '体检无需配置键（永远可用的纯读诊断）');
  ok('既有召回路径未改 / 体检纯读 / 无幽灵配置');
});

console.log(`\n[v3.111] 召回自检：${pass} 组断言通过`);