// tests/v3193_recall_quality_and_cost.test.mjs
// [v3.193.0] 召回质量与成本可证明（计划第二部分 1–6）
//   本版把「机制接上了」升级为「接上之后效果与代价都量得出来」：
//     ① 情绪计分正确性：子串重复计分（暴怒/恼火至极）不再虚高，主导维不被抢走
//     ② 证据作用域：引用/回忆/否定/他述四类误触发必须与「真表达」可分
//     ③ 反向召回只消费可信证据，且五态 reason 互相可分（含 no-trusted）
//     ④ 候选预算：每维限流 + 全局上限 + 跨维合并不重复占额，账目恒等式可断言
//     ⑤ 成本账本：按来源归因（分节继承）、自洽可断言、不可测的量写不可测
//     ⑥ 固定评测集：八类样本 + 六指标 + 已知缺口台账，作为可回归的质量基线
//     ⑦ 接线与发布卫生：模块登记、宿主真消费、三源同源
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import assert from 'node:assert/strict';
import test from 'node:test';
import { stripComments } from './_audit_lib.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const require_ = createRequire(import.meta.url);
const raw = readFileSync(ROOT + 'index.js', 'utf-8');
const src = stripComments(raw);
const manifest = JSON.parse(readFileSync(ROOT + 'manifest.json', 'utf-8'));
const np = require_(ROOT + 'narrative-pulse.js');
const CL = require_(ROOT + 'cost-ledger.js');
const EC = require_(ROOT + 'tests/fixtures/eval-corpus.js');

/* ── ① 计分正确性 ─────────────────────────────────── */
test('v3193 1. 子串不重复计分：暴怒/恼火至极不再虚高', () => {
  // 修前：「暴怒」记成 暴怒x1 + 怒x1 = 5.0；「恼火至极」记成三条 = 6.0
  const cases = [['暴怒', 'anger'], ['震怒', 'anger'], ['愤恨', 'anger']];
  for (const [w, dim] of cases) {
    const r = np.scanEmotion(w);
    assert.equal(r.scores[dim], 3.0, w + ' 应只计一次（3.0），实为 ' + r.scores[dim]);
    assert.equal(r.evidence.filter((e) => e.word === w).length, 1, w + ' 只应有一条证据');
  }
  const r2 = np.scanEmotion('恼火至极');
  assert.equal(r2.scores.anger, 3.0, '「恼火至极」不应把 恼火/恼 再计一遍');
  assert.equal(r2.evidence.length, 1, '只留最长词一条证据');
});
test('v3193 2. 长词优先且消费字符区间（短词不再重复吃同一段）', () => {
  const r = np.scanEmotion('他暴怒地吼');
  // 「暴怒」吃掉 [1,3) 后「怒」不再命中；「吼」是另一个词、位于别处，属独立命中。
  assert.equal(r.hits.length, 2, '消化区间后只剩「暴怒」与「吼」两条命中');
  assert.equal(r.hits[0].word, '暴怒', '命中的是最长词');
  assert.ok(r.hits.some((h) => h.word === '吼'), '别处的词照常命中');
  assert.ok(!r.hits.some((h) => h.word === '怒'), '同一段里的「怒」被「暴怒」吃掉，不再重复计分');
  assert.equal(typeof r.hits[0].at, 'number', '命中带位置（归因原料）');
});

/* ── ② 证据作用域 ─────────────────────────────────── */
test('v3193 3. 引用区间不吞尾部，未闭合引号不误判', () => {
  const closed = np.scanEmotion('她笑着说「我很难过」，然后转身走了');
  assert.equal(closed.byScope.quoted, 1, '闭合引号内命中记 quoted');
  assert.equal(closed.byScope.direct, 1, '引号外的「笑」记 direct');
  const unclosed = np.scanEmotion('她说着「我很难过');
  assert.ok(unclosed.byScope.direct >= 1, '未闭合引号不得把尾部整段吞成 quoted');
  assert.equal(unclosed.byScope.quoted || 0, 0, '未闭合引号内不产生 quoted');
});
test('v3193 4. 四类误触发与真表达可分：trustedDominant 与 byScope', () => {
  const direct = np.scanEmotion('她难过地低下头');
  assert.equal(direct.trustedDominant, 'sad', '直接表达 → 可信主导为 sad');
  assert.deepEqual(direct.byScope, { direct: 1 }, '只记 direct');

  const recalled = np.scanEmotion('他曾经很怕');
  assert.equal(recalled.dominant, 'fear', '整体仍识别出 fear（能力在场）');
  assert.equal(recalled.trustedDominant, null, '但回忆里 ⇒ 不可信（不得出线索）');
  assert.equal(recalled.byScope.recalled, 1, '记 recalled');

  const negated = np.scanEmotion('她不难过');
  assert.equal(negated.dominant, 'sad', '整体识别 sad');
  assert.equal(negated.trustedDominant, null, '被否定 ⇒ 不可信');
  assert.equal(negated.byScope.negated, 1, '记 negated');

  const quoted = np.scanEmotion('她笑着说「我很难过」，然后转身走了');
  assert.equal(quoted.trustedDominant, 'joy', '只看可信证据时主导是 joy（笑），不是引号里的难过');
  assert.ok(quoted.byScope.quoted >= 1, '引号内记 quoted');
});
test('v3193 5. 否定判档优先于引用与直接', () => {
  const r = np.scanEmotion('她「不难过」');
  assert.equal(r.byScope.negated, 1, '否定优先：引号里的否定仍记 negated');
});

/* ── ③ 反向召回消费可信证据 ───────────────────────── */
const DOCS = [
  { key: 'A', text: '他默默陪伴在她身边，给她倒了一杯热水' },
  { key: 'B', text: '窗外的雨下了一整夜' },
  { key: 'C', text: '有人轻声安慰她' },
];
test('v3193 6. 反向线索只认可信证据；五态 reason 互相可分', () => {
  const ok = np.recallByOppositeEmotion({ queryText: '她难过地低下头', docs: DOCS });
  assert.equal(ok.reason, 'ok', '直接表达 ⇒ ok');
  assert.ok(ok.opposite.includes('A'), '陪伴类条目被提中');

  const recalled = np.recallByOppositeEmotion({ queryText: '他曾经很怕', docs: DOCS });
  assert.equal(recalled.reason, 'no-trusted', '回忆句 ⇒ no-trusted（不是 no-emotion）');
  assert.equal(recalled.opposite.length, 0, '回忆不出线索');
  assert.equal(recalled.scanned, 0, '不出线索就不扫候选（零开销）');

  const negated = np.recallByOppositeEmotion({ queryText: '她不难过', docs: DOCS });
  assert.equal(negated.reason, 'no-trusted', '否定句 ⇒ no-trusted');

  const noEmo = np.recallByOppositeEmotion({ queryText: '窗外下雨了', docs: DOCS });
  assert.equal(noEmo.reason, 'no-emotion', '无情绪词 ⇒ no-emotion');

  const noPol = np.recallByOppositeEmotion({ queryText: '气氛紧绷，杀意在暗处浮动', docs: DOCS });
  assert.equal(noPol.reason, 'no-polarity', 'tense 极性 0 ⇒ no-polarity');

  const empty = np.recallByOppositeEmotion({});
  assert.equal(empty.reason, 'empty', '空输入 ⇒ empty');

  const set = new Set([ok.reason, recalled.reason, noEmo.reason, noPol.reason, empty.reason]);
  assert.equal(set.size, 5, '五种 reason 必须互不相同（糊在一起就无法诊断）');
});

/* ── ④ 候选预算与账目恒等 ─────────────────────────── */
test('v3193 7. 候选预算：每维限流 + 全局上限，且预算生效看得见', () => {
  const docs = [
    { key: 'P1', text: '她陪伴着他' }, { key: 'P2', text: '她温暖地笑了' },
    { key: 'P3', text: '她抱着他' }, { key: 'P4', text: '她递来热汤' },
  ];
  const per = np.recallByOppositeEmotion({ queryText: '她很难过', docs, maxPerDim: 1, max: 9 });
  assert.equal(per.opposite.length, 1, 'maxPerDim=1 ⇒ 每维最多 1 条');
  assert.equal(per.maxPerDim, 1, '读数回显每维上限');
  assert.equal(per.expanded, 1, '被预算挡下的条数必须可见');

  const glob = np.recallByOppositeEmotion({ queryText: '她很难过', docs, max: 1 });
  assert.equal(glob.opposite.length, 1, 'max=1 ⇒ 全局 1 条');
});
test('v3193 8. 账目恒等式：ΣdimHits == matchedSeen + expanded + merged', () => {
  const docs = [
    { key: 'P1', text: '她陪伴着他' }, { key: 'P2', text: '她温暖地笑了' },
    { key: 'P3', text: '她抱着他' }, { key: 'P4', text: '她递来热汤' },
  ];
  const cases = [
    { queryText: '她难过地低下头', docs: DOCS },
    { queryText: '她很难过', docs, maxPerDim: 1, max: 9 },
    { queryText: '她很难过', docs, max: 1 },
    { queryText: '她又害怕又难过', docs },
    { queryText: '他曾经很怕', docs: DOCS },
  ];
  for (const c of cases) {
    const r = np.recallByOppositeEmotion(c);
    const sum = Object.values(r.dimHits).reduce((a, b) => a + b, 0);
    assert.equal(sum, (r.matchedSeen || 0) + (r.expanded || 0) + (r.merged || 0),
      '账目必须闭合（query=' + c.queryText + '）');
  }
});
test('v3193 9. 跨维重复合并：命中两维的条目只占一次额，且记 merged', () => {
  const docs = [
    { key: 'P1', text: '她陪伴着他' }, { key: 'P2', text: '她温暖地笑了' },
  ];
  const r = np.recallByOppositeEmotion({ queryText: '她又害怕又难过', docs });
  assert.equal(new Set(r.opposite).size, r.opposite.length, '同一 key 不重复出现');
  assert.deepEqual(r.matched.P1, ['sad', 'fear'], 'matched 记录该条命中的全部维（可解释为什么被提）');
  assert.equal(r.merged, 2, '跨维重复计入 merged（候选膨胀的分母）');
});

/* ── ⑤ 成本账本 ───────────────────────────────────── */
const RESIDENT = ['[前情摘要]', '[角色状态]'];
const BLOCKS = [
  '[前情摘要]', '- 3楼 她说以后会常来',
  '[角色状态]', '- 林见夏：心情平静',
  '[相关片段·关键词命中]', '- 8楼 雨里的那把伞',
  '[已覆盖记忆·防复读]', '- [DEDUP已覆盖·若本轮查询需更深细节才用] 3楼 她说以后会常来',
];
test('v3193 10. 成本账本分节继承：明细行跟随节，DEDUP 行单独认出', () => {
  const tagged = CL.tagBlocks(BLOCKS, RESIDENT);
  assert.equal(tagged[1].tag, 'resident', '常驻节的明细行跟随常驻');
  assert.equal(tagged[5].tag, 'direct', '触发节的明细行跟随触发');
  assert.equal(tagged[7].tag, 'dedup', 'DEDUP 明细行自带标记，单独认出（不靠继承）');
  const lg = CL.buildCostLedger({
    allBlocks: BLOCKS, injectedText: '[前情摘要]\n- 3楼 她说以后会常来', residentMarkers: RESIDENT, now: 1,
  });
  assert.equal(lg.identity.ok, true, '账目自洽');
  assert.equal(lg.identity.otherBlocks, 0, 'other 应为 0（非零即说明出现无法归类的块形状）');
  assert.equal(lg.bySource.resident.blocks, 4, '常驻 4 块（两个节标题 + 各自的明细行）');
  assert.equal(lg.bySource.dedup.blocks, 2, '去重 2 块（节标题 + 明细）');
  assert.equal(lg.disabled.length, 0, '未传 enabledSources ⇒ 无禁用项');
});
test('v3193 11. 反向召回的成本形态如实记录（不新增块，只改排序）', () => {
  const lg = CL.buildCostLedger({
    allBlocks: BLOCKS, injectedText: '[前情摘要]', residentMarkers: RESIDENT, now: 1,
    emotionOpposite: { reason: 'ok', hits: 2, expanded: 1, merged: 1, dimHits: { sad: 3 } },
    promoted: { sum_3: ['sad'], sum_5: ['sad'] },
  });
  assert.equal(lg.opposite.addsBlocks, false, '机制不新增块（事实，不美化）');
  assert.equal(lg.opposite.costForm, 'rank-only', '成本形态是 rank-only');
  assert.equal(lg.opposite.taggedBlocks, 0, 'taggedBlocks 恒 0');
  assert.equal(lg.opposite.promotedCount, 2, '提权 2 条');
  assert.equal(lg.opposite.estimated, true, '注入估算必须标注 estimated');
});
test('v3193 12. 不可测的量写「不可测」，不编 0', () => {
  const lg = CL.buildCostLedger({ allBlocks: BLOCKS, injectedText: '', residentMarkers: RESIDENT, now: 1 });
  assert.equal(lg.identity.keptBlocks, 0, '空注入 ⇒ 保留全 0（不给假读数）');
  assert.equal(lg.identity.ok, true, '空注入下账目仍自洽');
  assert.equal(lg.dedup.savedChars, null, '去重节省不可测 ⇒ null');
  assert.equal(lg.dedup.measurable, false, 'measurable=false');
  assert.ok(String(lg.dedup.why).length > 10, '必须给出「为什么不可测」');
});
test('v3193 13. 不自洽的账本会自曝（costLine 亮警告）', () => {
  const bad = CL.costLine({ totals: { injectedChars: 1 }, bySource: {}, identity: { ok: false } });
  assert.ok(bad.includes('⚠️'), '自洽性失败必须在摘要行亮出来');
  assert.equal(CL.costLine(null), '—', '空输入不抛');
  const good = CL.costLine(CL.buildCostLedger({
    allBlocks: BLOCKS, injectedText: BLOCKS.join('\n'), residentMarkers: RESIDENT, now: 1,
  }));
  assert.ok(!good.includes('⚠️'), '自洽账本不亮警告');
});

/* ── ⑥ 固定评测集 ─────────────────────────────────── */
test('v3193 14. 评测集覆盖计划点名的八类样本，且缺口不混入主类', () => {
  const plan8 = ['sad-warm', 'fear-safe', 'anger-soften', 'tense-relax',
    'multi-negative', 'quoted-only', 'negated-recalled', 'multi-char'];
  const main = EC.CORPUS.filter((c) => !c.gap);
  const mainCls = main.map((c) => c.cls);
  for (const need of plan8) {
    assert.ok(mainCls.includes(need), '点名类 ' + need + ' 必须是主样本（不能塞进已知缺口里销账）');
  }
  assert.equal(main.length, 8, '主样本恰为点名八类，实为 ' + main.length);
  const gapCls = EC.CORPUS.filter((c) => c.gap).map((c) => c.cls);
  assert.ok(gapCls.length >= 3, '覆盖缺口另立台账，实为 ' + gapCls.length);
  for (const g of gapCls) assert.ok(!mainCls.includes(g), '缺口类 ' + g + ' 不得同时算主样本（双计会让指标失真）');
});
test('v3193 15. 评测指标全部可算，且基线达标', () => {
  const r = EC.runEval({ api: np, costLedger: CL });
  assert.equal(r.ok, true, '评测必须能跑出指标');
  const m = r.metrics;
  assert.equal(m.oppositeHitRate, 1, '期望命中率基线 1.0');
  assert.equal(m.irrelevantRate, 0, '无关召回率基线 0');
  assert.equal(m.misboostRate, 0, '负面同类误提权基线 0');
  assert.ok(m.expansionRatio <= 1, '候选膨胀比例有界');
  assert.equal(m.reasonOkRate, 1, 'reason 符合率 1.0');
  assert.equal(m.dimOkRate, 1, '可信主导维符合率 1.0');
  assert.equal(m.attributionRate, 1, '多角色归因率 1.0');
  assert.equal(typeof m.latencyAvgMs, 'number', '耗时可测');
  assert.equal(m.tokenDeltaMeasured, true, '接入 cost-ledger 后 token 增量可测');
  assert.deepEqual(EC.checkGates(r), [], '门禁全过');
});
test('v3193 16. 已知缺口被台账跟踪（不被隐藏、不污染主指标）', () => {
  const r = EC.runEval({ api: np, costLedger: CL });
  const gaps = r.metrics.knownGaps;
  assert.ok(gaps.length >= 3, '三条已知缺口都在台账里，实为 ' + gaps.length);
  for (const g of gaps) {
    assert.ok(String(g.why).length > 10, g.cls + ' 必须写明缺口成因');
  }
  // gap 样本不计入主指标：样本总数 = 主样本数（不含 gap）
  assert.equal(r.metrics.samples + r.metrics.gapSamples, EC.CORPUS.length, '主 + gap = 全量');
  assert.equal(r.metrics.samples, EC.CORPUS.filter((c) => !c.gap).length, '主指标只含主样本');
  // 缺口必须是「被量出来的 0」：want 写语义正确答案，hit 记实际收回数
  const act = gaps.find((g) => g.cls === 'gap-action-comfort');
  assert.ok(act && act.want >= 1, '动作性安慰缺口如实记 want');
});
test('v3193 17. 门禁能真的拦住退化（判据不是装饰）', () => {
  const r = EC.runEval({ api: np, costLedger: CL });
  const bad = EC.checkGates(Object.assign({}, r, { metrics: Object.assign({}, r.metrics, { oppositeHitRate: 0 }) }));
  assert.ok(bad.length > 0 && bad.join(' ').includes('期望命中率'), '命中率变 0 必须翻红');
  assert.ok(EC.checkGates(null).length > 0, '空结果必须翻红');
  assert.ok(EC.checkGates({ ok: false }).length > 0, 'ok=false 必须翻红');
});
test('v3193 18. 多角色情绪归属：不猜、不默认', () => {
  const a = np.attributeEmotion('林见夏哭了。周砚笑着看她。', { characters: ['林见夏', '周砚'] });
  assert.equal(a.perChar['林见夏'].dominant, 'sad', '林见夏 → sad');
  assert.equal(a.perChar['周砚'].dominant, 'joy', '周砚 → joy');
  const noName = np.attributeEmotion('她哭了', {});
  assert.equal(noName.noCharacters, true, '无角色名录 ⇒ 明确标记，不瞎归');
  assert.equal(Object.keys(noName.perChar).length, 0, '不默认归给任何角色');
  const far = np.attributeEmotion('她哭了。林见夏站在很远的地方', { characters: ['林见夏'] });
  assert.ok(far.unattributed.count >= 1, '跨句/超窗 ⇒ unattributed（承认查不出来）');
});

/* ── ⑦ 接线与发布卫生 ─────────────────────────────── */
test('v3193 19. 成本账本已接线：模块登记 + 宿主真消费 + 诊断面可见', () => {
  assert.ok(manifest.extra_js.includes('cost-ledger.js'), 'manifest 登记（不登记=不加载）');
  assert.ok(/function _costLedgerLib\(\)/.test(src), '取库助手存在');
  assert.ok(/window\.LonShaCostLedger, 'cost-ledger\.js'/.test(src), '取的正是成本账本模块');
  assert.ok(/this\._lastCostLedger = _CL\.buildCostLedger\(\{/.test(src), '宿主真调用 buildCostLedger');
  assert.ok(/residentMarkers: RESIDENT_MARKERS/.test(src), '常驻口径复用本文件 RESIDENT_MARKERS（单一真源）');
  assert.ok(/\['注入成本', line \+ \(bad \? ' ⚠️' : ''\)\]/.test(src), '诊断面有一行读数');
  assert.ok(/if \(!CL \|\| typeof CL\.costLine !== 'function'\) return \['注入成本', '模块未加载/.test(src),
    '模块缺席不伪装成「成本为零」');
  assert.ok(/this\._emoOppositeMatched = null;/.test(src), '提权名单每轮重置（防陈旧读数）');
});
test('v3193 20. 三源同源，且不低于本版', () => {
  const v = /const VERSION = '([0-9.]+)'/.exec(raw)[1];
  const pkg = JSON.parse(readFileSync(ROOT + 'package.json', 'utf-8'));
  assert.equal(v, '3.197.0', 'index.js 版本号为 3.193.0');
  assert.equal(manifest.version, '3.197.0', 'manifest 跟随 index.js');
  assert.equal(pkg.version, '3.197.0', 'package 跟随 index.js');
});
test('v3193 21. 本版 test 文件自身进了 tests/ 目录', () => {
  const self = readFileSync(new URL(import.meta.url), 'utf-8');
  assert.ok(self.includes('[v3.193.0]'), '版本标记存在');
  assert.ok(self.includes('runEval'), '真调用了评测集');
});