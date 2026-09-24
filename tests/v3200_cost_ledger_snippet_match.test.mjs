/**
 * tests/v3200_cost_ledger_snippet_match.test.mjs — v3.200.0
 *
 * 主题：成本账本的反向召回读数不再把「匹配不到」写成「一条都没进」。
 *
 * 探针实证（probe_v3200）：
 *   promoted 的 key 是摘要图键（sum_<floor>），注入文本只渲染摘要正文（`- ${text}`），
 *   图键永不出现。旧实现用 injected.includes(key) 匹配，对摘要条目恒为假：
 *   提权 2 条、其中 1 条真进了注入，账本报 injectedEstimate=0、rankOnlyGap=2、
 *   诊断行「反向 0/2 条」。这是本仓最贵的形态——不报错、不崩溃、只给错读数。
 *
 * 修法：
 *   调用侧（index.js recallMemory）把每条被提权摘要的正文片段带给账本（promotedSnippets）；
 *   账本按片段匹配。一个片段都没有时记 measurable=false，
 *   injectedEstimate / rankOnlyGap 为 null，诊断行写「不可测」，不再写 0。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const require = createRequire(import.meta.url);
const CL = require(path.join(ROOT, 'cost-ledger.js'));
const IDX = read('index.js');
const COST = read('cost-ledger.js');

function vnum(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}

const BLOCKS = ['[前情摘要]', '- 3楼 她说以后会常来', '- 5楼 那晚他没再提起'];
const INJECTED = '[前情摘要]\n- 3楼 她说以后会常来';
const PROMOTED = { sum_3: ['sad'], sum_5: ['sad'] };
const base = (extra) => Object.assign({
  allBlocks: BLOCKS, injectedText: INJECTED, residentMarkers: ['[前情摘要]'], now: 1,
  emotionOpposite: { reason: 'ok', hits: 2 }, promoted: PROMOTED,
}, extra || {});

test('v3200【1】无片段时记不可测，不再把 0 写成「一条都没进」', () => {
  const lg = CL.buildCostLedger(base());
  assert.equal(lg.opposite.measurable, false, '没有片段 ⇒ 不可测');
  assert.equal(lg.opposite.injectedEstimate, null, '不可测时估算为 null，不是 0');
  assert.equal(lg.opposite.rankOnlyGap, null, '不可测时 gap 为 null，不是 promotedCount');
  assert.equal(lg.opposite.promotedCount, 2, '提权条数仍如实记录');
  const line = CL.costLine(lg);
  assert.ok(line.includes('不可测'), '诊断行必须写「不可测」：' + line);
  assert.ok(!/反向 0\/2/.test(line), '诊断行不得再写「反向 0/2」');
});

test('v3200【2】有片段时按片段匹配：1 条进注入、1 条没进', () => {
  const lg = CL.buildCostLedger(base({
    promotedSnippets: { sum_3: '她说以后会常来', sum_5: '那晚他没再提起' },
  }));
  assert.equal(lg.opposite.measurable, true);
  assert.equal(lg.opposite.injectedEstimate, 1, '只有 sum_3 的片段真在注入里');
  assert.equal(lg.opposite.rankOnlyGap, 1, 'gap 是真没进的那 1 条');
  assert.ok(CL.costLine(lg).includes('反向 1/2 条'), '诊断行给出真读数');
});

test('v3200【3】片段都没进注入时，0 是真 0（可测）', () => {
  const lg = CL.buildCostLedger(base({
    promotedSnippets: { sum_3: '完全不存在的句子甲', sum_5: '完全不存在的句子乙' },
  }));
  assert.equal(lg.opposite.measurable, true);
  assert.equal(lg.opposite.injectedEstimate, 0, '片段都没匹配上 ⇒ 真 0');
  assert.equal(lg.opposite.rankOnlyGap, 2);
});

test('v3200【4】空注入时不做 includes 判定，记不可测', () => {
  const lg = CL.buildCostLedger(base({
    injectedText: '', promotedSnippets: { sum_3: '她说以后会常来' },
  }));
  assert.equal(lg.opposite.measurable, false);
  assert.equal(lg.opposite.injectedEstimate, null);
});

test('v3200【5】短片段（<4 字）不算可测依据，避免短词误匹配', () => {
  const lg = CL.buildCostLedger(base({
    promotedSnippets: { sum_3: '她', sum_5: '他' },
  }));
  assert.equal(lg.opposite.measurable, false, '不足 4 字的片段不可靠，按不可测处理');
});

test('v3200【6】接线：调用侧真的把片段带给账本', () => {
  assert.ok(IDX.includes('this._emoOppositeSnippets = _emoSnippets;'), 'recallMemory 计算片段');
  assert.ok(IDX.includes('promotedSnippets: this._emoOppositeSnippets'), 'buildInjection 把片段交给账本');
  assert.ok(COST.includes('o.promotedSnippets'), '账本消费片段');
  assert.ok(COST.includes('measurable'), '账本区分可测/不可测');
});

test('v3200【7】负控制：抽掉片段匹配 → 读数退回恒 0（判据转红）', async () => {
  // 真源码破坏：让片段匹配分支失效，退回「只按 key 匹配」
  const anchor = 'if (snip && snip.length >= 4) { snippetCount++; if (injected.includes(snip)) { injectedEstimate++; matchedBySnippet = true; } }';
  const hits = COST.split(anchor).length - 1;
  assert.equal(hits, 1, '锚点恰中 1 次');
  const broken = COST.replace(anchor, 'if (false) { snippetCount++; }');
  const dir = path.join(ROOT, '..');
  const tmp = path.join('/tmp', 'v3200-cost-broken.cjs');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(tmp, broken);
  const req = createRequire(import.meta.url);
  const CLbad = req(tmp);
  const lg = CLbad.buildCostLedger(base({
    promotedSnippets: { sum_3: '她说以后会常来', sum_5: '那晚他没再提起' },
  }));
  // 破坏后：片段被忽略，图键又不在注入里 ⇒ 退回不可测（measurable=false）
  //   即「有片段却测不出」——这正是本版要防的退化
  assert.equal(lg.opposite.measurable, false, '破坏后片段失效 ⇒ 退回不可测（判据转红）');
  assert.equal(lg.opposite.injectedEstimate, null);
});

test('v3200【0】版本 / manifest / package ≥ 3.200.0', () => {
  const pkg = JSON.parse(read('package.json'));
  const manifest = JSON.parse(read('manifest.json'));
  const v = /const VERSION = '([^']+)'/.exec(IDX)[1];
  assert.ok(vnum(v) >= vnum('3.200.0'), `index.js 版本 ${v} < 3.200.0`);
  assert.ok(vnum(manifest.version) >= vnum('3.200.0'), `manifest ${manifest.version} < 3.200.0`);
  assert.ok(vnum(pkg.version) >= vnum('3.200.0'), `package ${pkg.version} < 3.200.0`);
});
