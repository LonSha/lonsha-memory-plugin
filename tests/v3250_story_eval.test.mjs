// tests/v3250_story_eval.test.mjs — v3.250.0
// [v3.250.0] 计划 A 批 M-O2 首批：面向**剧情结果**的质量评测。
//
//   为什么需要它（计划原文的病根）：现有反向情绪评测 8 个主样本全绿，
//   但自然表达 0/2、动作性安慰 0/1，聚合情绪还有错判 —— 那套局部评测不能代表
//   整个引擎的叙事质量。本版交付**十二类 / 40 样本**的剧情评测：
//     旧关键线索 · 自然转述 · 动作与情绪 · 同名异人 · 伪装身份 · 闪回与现状 ·
//     矛盾未决 · 事实换代 · 约定兜现 · 秘密边界 · 删楼重生成 · 跨会话隔离
//
//   三阶段分别测（计划原文：分别测候选、排序、最终注入；前两步对但裁剪后丢失不算成功）：
//     ① 候选 = unified-recall.graphToCandidates（includeDeferred 全量参赛）
//     ② 排序 = ai-select.scoreEntry（**真评分**，不注水）+ mergeWithGuaranteed
//     ③ 注入 = 真分区 → injection-router.trimToBudget（真预算裁剪）
//   每例写清 must / mustIn / forbid / 来源与时点；验收答案**冻结在 corpus 里**。
//
//   硬零（隐藏身份泄露 / 已撤销事实 / 跨会话误注）**由真机制守**，图管线不管这件事：
//     disclosure → relation-disclosure.partition（!X = X 在场时抑制，探针自证门会开）
//     fact-revoked → fact-version（旧值必须退役/被替换）
//     provenance → summary-provenance.filterForRecall（只剔 source_changed）
//   为什么每条守卫都要「探针自证」：门从来不开时「没泄露」也是绿的 —— 那是假绿。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const require_ = createRequire(import.meta.url);
const CORPUS = require_(ROOT + 'tests/fixtures/story-eval-corpus.js');
const RUNNER = require_(ROOT + 'tests/fixtures/story-eval-runner.js');
const raw = readFileSync(ROOT + 'index.js', 'utf-8');
const manifest = JSON.parse(readFileSync(ROOT + 'manifest.json', 'utf-8'));
const pkg = JSON.parse(readFileSync(ROOT + 'package.json', 'utf-8'));
let _cache = null;
function run() { if (!_cache) _cache = RUNNER.runAll({ corpus: CORPUS }); return _cache; }
/* ── A 样本集自证（少一类即拒判，不给「静默少样本」留口） ── */
test('v3250 A1. 十二类逐类有样本，且主/缺口分列（验收答案冻结）', () => {
  const cov = CORPUS.coverageCheck();
  assert.deepEqual(cov.missing, [], '十二类不得缺类：' + cov.missing.join(','));
  assert.equal(cov.total, 40, '首批 40 样本（实测 ' + cov.total + '）');
  assert.equal(cov.total - cov.gaps, cov.main, '主/缺口分列时数字要自洽');
  assert.equal(CORPUS.STORY_EVAL_VERSION, 1, '验收答案版本冻结');
  for (const c of CORPUS.CLASSES) assert.ok(cov.byClass[c] >= 2, c + ' 每类至少 2 例（实测 ' + cov.byClass[c] + '）');
});
test('v3250 A2. 每例四件事齐备（must / mustIn / forbid+low / 来源时点）', () => {
  for (const s of CORPUS.SCENARIOS) {
    assert.ok(s.cls && s.case, '样本必须有类目与编号');
    assert.ok(Array.isArray(s.must) && Array.isArray(s.mustIn), s.case + ' 必须写 must / mustIn');
    assert.ok(s.nodes.length >= 2, s.case + ' 候选不能只有一条（否则测不出区分）');
    assert.ok(s.src && Number.isFinite(s.src.floor) && s.src.session, s.case + ' 必须写来源与时点');
    assert.ok(typeof s.query === 'string' && s.query.length >= 4, s.case + ' 查询文本必须在场');
    /* must/mustIn 必须真的指向本样本的节点（防复制粘贴改错 key 后「永远不成立」） */
    const ids = new Set(s.nodes.map((x) => x.id));
    for (const k of s.must.concat(s.mustIn)) assert.ok(ids.has(k), s.case + ' 的 ' + k + ' 不在本样本节点里');
  }
});
/* ── B 三阶段主指标（真管线） ── */
test('v3250 B1. 候选层：must 全进候选（全量参赛，上限不挡资格）', () => {
  const r = run();
  assert.equal(r.ok, true, '真管线必须能跑：' + (r.error || ''));
  assert.equal(r.metrics.stage1HitRate, 1, '候选命中率必须 100%');
  assert.deepEqual(r.samples.filter((s) => !s.stage1Ok).map((s) => s.case), [], '不得有候选层缺口');
});
test('v3250 B2. 排序层：mustIn 必须真进候选池；并如实登记「单层不可证伪」这条盲区', () => {
  const r = run();
  assert.equal(r.metrics.stage2HitRate, 1, '排序命中率必须 100%（实得 ' + r.metrics.stage2HitRate + '）');
  assert.deepEqual(r.metrics.stage2Loss, [], '不得有「候选有、排序丢」的样本');
  /* ★ 盲区必须**写在判据里**（本套件实测三轮挖出来的）：本批样本的 mustIn 都是
   *   「各样本排序首位」，而选取层（保底 / 打分 / 补齐）三层互为冗余 ⇒ 任一层单独失效
   *   都够不到 mustIn。所以 B2 现在测的是「选取层有没有整体失效」，而不是「哪一层在保它」。
   *   这条读数（mustInTopRate）就是盲区的证据；M-O2 完整集需补「非保底类型 + 零字面交集」样本组
   *   才能真正证伪单层。 */
  assert.equal(typeof r.metrics.mustInTopRate, 'number', '可证伪性读数必须在场');
  assert.equal(r.metrics.mustInPerSample.length, r.metrics.samples, '逐样本 mustIn 条数读数必须齐备');
  assert.ok(r.metrics.mustInTopRate > 0, '至少有一条 mustIn 落在排序首位（否则说明评分全废）');
  /* 排序层「零分」的样本不许算过：真评分必须给出非零，否则 this 判据只是形状检查 */
  for (const s of r.samples) {
    if (s.isGap || !(s.mustIn || []).length) continue;
    for (const k of s.mustIn) {
      const sc = (s.scored.find((x) => x.id === k) || {}).score;
      assert.ok(sc > 0, s.case + ' 的 ' + k + ' 真评分必须 > 0（实得 ' + sc + '）—— 零分过不了「真评分」这一关');
    }
  }
});
test('v3250 B3. 最终注入层：前两步对、裁剪后仍必须活着（不然不算成功）', () => {
  const r = run();
  assert.equal(r.metrics.stage3HitRate, 1, '最终注入命中率必须 100%（实得 ' + r.metrics.stage3HitRate + '）');
  assert.deepEqual(r.metrics.stage3Loss, [], '不得有「排序对、裁剪丢」的样本');
});
test('v3250 B4. 机制门（硬零）：三条全过，且**门真的会开**（探针自证）', () => {
  const r = run();
  assert.deepEqual(r.metrics.leakCases, [], '机制门被破：' + JSON.stringify(r.metrics.leakCases));
  assert.equal(r.metrics.guardOkRate, 1, '守卫通过率必须 100%');
  const det = r.metrics.gateDetail;
  assert.ok(det.length >= 4, '带机制的样本不少于 4 例（实测 ' + det.length + '）');
  const byGate = {};
  for (const d of det) byGate[d.gate] = (byGate[d.gate] || 0) + 1;
  for (const g of ['disclosure', 'fact-revoked', 'provenance']) {
    assert.ok(byGate[g] >= 1, '三类机制都必须有样本：' + g + '（实测 ' + (byGate[g] || 0) + '）');
  }
  /* 门必须真会开：逐条看 why 不是「module-missing / no-xxx（拒判）」 */
  for (const d of det) {
    if (/known-gap/.test(d.why)) continue;
    assert.equal(/missing|拒判/.test(d.why), false, d.case + ' 的守卫没真的开：' + d.why);
  }
});
/* ── C 已知缺口台账（不进主指标，但要逐条可对比） ── */
test('v3250 C1. 缺口样本逐条登记，且缺口位置写清（候选层 / 排序层）', () => {
  const r = run();
  const kg = r.metrics.knownGaps;
  assert.equal(r.metrics.gapSamples, 5, '首批缺口 5 例（实测 ' + r.metrics.gapSamples + '）');
  assert.equal(kg.length, 5, '台账逐条在场');
  for (const g of kg) {
    assert.ok(g.case && g.cls, '台账必须点名到样本');
    assert.ok(typeof g.stage1Ok === 'boolean' && typeof g.stage2Ok === 'boolean', g.case + ' 必须记两层读数');
    assert.ok(Array.isArray(g.missRank), g.case + ' 必须记「卡在哪一步」');
  }
  /* 缺口类型必须**真的是**「字面匹配召不回」那一种：候选层过得去、排序层丢掉 */
  const shape = kg.filter((g) => g.stage1Ok && g.missRank.length > 0).length;
  assert.equal(shape, kg.length, '缺口的形态必须是「候选有、排序丢」（否则它们不该叫 known-gap）');
});
test('v3250 C2. 低分噪声读数在场（只报数，不做硬零——避免把「分不开」写成「没泄露」）', () => {
  const r = run();
  /* 条数不写死：读数必须与「标了 low 的样本」一一对应（口径同源，而不是拍一个数）。 */
  const lowCases = CORPUS.SCENARIOS.filter((s) => s.low).map((s) => s.case);
  assert.ok(lowCases.length >= 3, '标了 low 的样本不少于 3 例（实测 ' + lowCases.length + '）');
  assert.deepEqual(r.metrics.lowNoise.map((x) => x.case), lowCases, '低分读数必须与 low 样本一一对应');
  for (const n of r.metrics.lowNoise) {
    assert.ok(n.id && (typeof n.score === 'number' || n.score === null), n.case + ' 必须给出分数读数');
  }
  /* 同名异人那条必须在读数里：实测按名字会给同名的另一人 2 分（分不开）——
   *   这正是「计划点名的硬零里，同名异人不该按机制级硬零立」的证据。 */
  const sn = r.metrics.lowNoise.find((x) => x.case === 'sn3');
  assert.ok(sn, '同名异人的低分读数必须在场');
  assert.ok(sn.score === null || typeof sn.score === 'number', '读数要么是数要么明确 null（不编 0）');
});
/* ── D 负控制（真源码破坏 → 同一份真判据必须转红） ── */
const { writeFileSync, mkdtempSync, mkdirSync, copyFileSync } = require_('node:fs');
const os = require_('node:os');
const CLOSURE = ['unified-recall.js', 'ai-select.js', 'injection-router.js', 'relation-disclosure.js',
  'fact-version.js', 'summary-provenance.js', 'ledger-entity.js'];
function makeTree(tag) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lonsha-v3250-' + tag + '-'));
  for (const f of CLOSURE) copyFileSync(path.join(ROOT, f), path.join(dir, f));
  return dir;
}
/** 真源码破坏：锚点必须恰中一次，且必须真改了文件（否则抛）。 */
function mutate(tag, file, oldText, newText) {
  const dir = makeTree(tag);
  const p = path.join(dir, file);
  const src = readFileSync(p, 'utf-8');
  const n = src.split(oldText).length - 1;
  assert.equal(n, 1, '变异锚点须恰中 1 次：' + tag + ' / ' + file + '（实得 ' + n + '）');
  const next = src.replace(oldText, newText);
  assert.notEqual(next, src, '变异必须真的改了文件：' + tag);
  writeFileSync(p, next);
  return dir;
}
const fresh = (dir) => {
  for (const k of Object.keys(require_.cache)) if (k.includes(path.basename(dir))) delete require_.cache[k];
  return {
    UR: require_(path.join(dir, 'unified-recall.js')),
    AS: require_(path.join(dir, 'ai-select.js')),
    IR: require_(path.join(dir, 'injection-router.js')),
    RD: require_(path.join(dir, 'relation-disclosure.js')),
    FV: require_(path.join(dir, 'fact-version.js')),
    SP: require_(path.join(dir, 'summary-provenance.js')),
  };
};
test('v3250 D1. 破坏「候选层全量参赛」⇒ B1 同款判据必须转红', () => {
  const dir = mutate('d1', 'unified-recall.js',
    "    kept = out.slice();",
    "    kept = out.slice(0, 1);");
  const res = RUNNER.runAll({ corpus: CORPUS, modules: fresh(dir) });
  assert.ok(res.ok, '破坏后仍须能跑：' + (res.error || ''));
  assert.ok(res.metrics.stage1HitRate < 1, '★ 破坏后候选命中率必须掉下来（实得 ' + res.metrics.stage1HitRate + '）');
  assert.equal(run().metrics.stage1HitRate, 1, '阳性对照：原件上同款判据必须为绿');
});
test('v3250 D2. ★ 盲区读数的灵敏度自证：造一个「mustIn 不在首位」的样本，读数必须 < 1', () => {
  /* 为什么不用源码破坏：本批 35 主样本里，评分、保底、补齐**三层互为冗余**（实测四轮）：
   *     打 ai-select 加分 → 分数压低但 secondary 仍给分 → 仍进 merged
   *     打「有分数的才选进来」→ 一字未变（list 已按分数序，补齐取同一批）
   *     打排序 → 不动（目标多为保底类型）
   *     打保底分支 → 不动（评分层按分数序照样取到）
   *     打评分整体归零 → 仍未动（tie-break 用 updatedAt，目标 ts 本来就大）
   *   结论：**本批样本无法证伪「排序层单层失效」**（必须由 M-O2 完整集的
   *   「非保底类型 + 零字面交集」样本组补）。与其硬造一个假绿破坏，不如直接证**读数本身**
   *   有灵敏度：喂一个 mustIn 不在首位的自造样本，mustInTopRate 必须掉下来。
   *   这样至少保证「读数恒 1」不可能是因为读数写死了。 */
  const UR = require_(ROOT + 'unified-recall.js');
  const AS = require_(ROOT + 'ai-select.js');
  const IR = require_(ROOT + 'injection-router.js');
  const mk = (id, type, name, summary, ts) => ({ id, type, name, timestamp: ts, data: { summary, mark: id } });
  /* 命中项刻意放在低分、高 ts 的噪声之后：命中项 ts 小、且是非保底类型。 */
  /* 用 ASCII 独特词当查询：只要两边都用汉字，命中项很容易因为「查」「询」这种
   *   常见字蹭到 secondary 分（首版即踩：hit 的正文里也有「查询」二字 ⇒ 两边都得分，
   *   读数仍是 1，还以为是读数坏了）。 */
  const hit = mk('hit', 'trivia', '被追的旧事', '这条描述里一个查询字也不带', 1);
  const top = mk('top', 'trivia', '首位噪声', 'ZZZONLY 落在这一条', 999);
  const sc = { cls: 'legacy-clue', case: 'probe', kind: '', query: 'ZZZONLY',
    must: ['hit'], mustIn: ['hit'], forbid: [], low: '', gate: '', guardCond: '',
    nodes: [hit, top], noiseIds: [], src: { floor: 1, session: 'sp' } };
  const res = RUNNER.runAll({ corpus: CORPUS, scenarios: [sc],
    modules: { UR: UR, AS: AS, IR: IR } });
  assert.ok(res.ok, '自造样本必须能跑：' + (res.error || ''));
  assert.ok(res.metrics.mustInTopRate < 1,
    '★ 读数必须有灵敏度：自造样本里 mustIn 不在首位，读数必须 < 1（实得 ' + res.metrics.mustInTopRate + '）');
  assert.equal(run().metrics.mustInTopRate, 1, '对照：原件上（本批样本）读数为 1 —— 这就是「三层冗余」的那条读数');
});
test('v3250 D3. 破坏「裁剪保留 mustIn」⇒ B3 同款判据必须转红', () => {
  const dir = mutate('d3', 'injection-router.js',
    "        if (len <= budget) return full;",
    "        if (len <= budget) return String(full).slice(0, 1);");
  const res = RUNNER.runAll({ corpus: CORPUS, modules: fresh(dir) });
  assert.ok(res.metrics.stage3HitRate < 1, '★ 破坏后最终注入命中率必须掉下来（实得 ' + res.metrics.stage3HitRate + '）');
  assert.equal(run().metrics.stage3HitRate, 1, '阳性对照：原件上必须为绿');
});
test('v3250 D4. 破坏「披露门」⇒ B4 的守卫必须转红（且不是因缺模块）', () => {
  const dir = mutate('d4', 'relation-disclosure.js',
    "            if (r.state === 'miss') { out.counts.miss++; out.gated.push(e); continue; }",
    "            if (false) { out.counts.miss++; out.gated.push(e); continue; }");
  const res = RUNNER.runAll({ corpus: CORPUS, modules: fresh(dir) });
  const bad = res.metrics.leakCases.filter((x) => x.gate === 'disclosure');
  assert.ok(bad.length >= 1, '★ 破坏披露门后必须有泄露（实得 ' + bad.length + '）');
  assert.equal(run().metrics.leakCases.length, 0, '阳性对照：原件上不得有泄露');
});
test('v3250 D5. 变异工具两向自证（锚点不存在 / 不唯一都必须抛）', () => {
  assert.throws(() => mutate('d5a', 'unified-recall.js', '不存在的锚点字符串_zzz', 'x'), /须恰中 1 次/);
  assert.throws(() => mutate('d5b', 'unified-recall.js', 'function ', 'x'), /须恰中 1 次/);
});
/* ── E 登记与版本锚 ── */
test('v3250 E1. 评测集与 runner 都在仓内，且套件真调用了它们', () => {
  const self = readFileSync(new URL(import.meta.url).pathname, 'utf-8');
  assert.ok(self.includes('[v3.250.0]'), '版本标记在场');
  assert.ok(self.includes('RUNNER.runAll'), '套件必须真跑真管线');
  assert.ok(self.includes('CORPUS.SCENARIOS') || self.includes('CORPUS.coverageCheck'), '真读语料库');
  /* runner 不得自己造数据：它必须从传入的 corpus 拿样本 */
  const runnerSrc = readFileSync(ROOT + 'tests/fixtures/story-eval-runner.js', 'utf-8');
  assert.ok(runnerSrc.includes('o.corpus') || runnerSrc.includes('opts.corpus') || /\.SCENARIOS/.test(runnerSrc),
    'runner 的样本必须来自 corpus 入参（不得内嵌第二份样本）');
});
test('v3250 E2. 版本锚：三源同源 + 当版恰好锚着（本套件就是当版 frontier）', () => {
  const v = /const VERSION = '([0-9.]+)'/.exec(raw)[1];
  assert.equal(v, manifest.version, 'manifest 跟随 index.js');
  assert.equal(manifest.version, pkg.version, 'package 跟随 index.js');
  /* ★ 当版锚点用 vnum 恰好锁住 3.250.0（不是下界）：版本守卫 V4 要求「至少一个测试
   *   以 vnum 恰好锚着当前版本」。本套件是本版出生的 frontier —— 下一版会由新套件接管
   *   这条锚（仓内既定交棒口径：frontier 的硬等号在被下一版接管前是合法的）。 */
  const vnum = (s) => String(s).split('.').map(Number).reduce((a, b) => a * 1000 + b, 0);
  assert.equal(vnum(v), vnum('3.250.0'), '本套件出生版本 3.250.0（当版锚点）');
});
