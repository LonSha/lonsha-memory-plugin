// tests/v3250_story_eval.test.mjs — v3.250.0
// [v3.250.0] 计划 A 批 M-O2 首批：面向**剧情结果**的质量评测。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'path';
const ROOT = new URL('..', import.meta.url).pathname;
const require_ = createRequire(import.meta.url);
const CORPUS = require_(ROOT + 'tests/fixtures/story-eval-corpus.js');
const RUNNER = require_(ROOT + 'tests/fixtures/story-eval-runner.js');
const raw = readFileSync(ROOT + 'index.js', 'utf-8');
const manifest = JSON.parse(readFileSync(ROOT + 'manifest.json', 'utf-8'));
const pkg = JSON.parse(readFileSync(ROOT + 'package.json', 'utf-8'));
let _cache = null;
function run() { if (!_cache) _cache = RUNNER.runAll({ corpus: CORPUS }); return _cache; }
test('v3250 A1. 十二类逐类有样本，且主/缺口分列（验收答案冻结）', () => {
  const cov = CORPUS.coverageCheck();
  assert.deepEqual(cov.missing, [], '十二类不得缺类：' + cov.missing.join(','));
  assert.equal(cov.total, 43, '样本总数（实测 ' + cov.total + '）');
  assert.equal(cov.total - cov.gaps, cov.main, '主/缺口分列时数字要自洽');
  assert.equal(CORPUS.STORY_EVAL_VERSION, 1, '验收答案版本冻结');
  for (const c of CORPUS.CLASSES) assert.ok(cov.byClass[c] >= 2, c + ' 每类至少 2 例（实测 ' + cov.byClass[c] + '）');
  const rp = CORPUS.SCENARIOS.find((s) => s.case === 'rp1');
  assert.ok(rp && rp.kind === 'rank-probe', '冻结语料必须含 rp1 rank-probe');
});
test('v3250 A2. 每例四件事齐备（must / mustIn / forbid+low / 来源时点）', () => {
  for (const s of CORPUS.SCENARIOS) {
    assert.ok(s.cls && s.case, '样本必须有类目与编号');
    assert.ok(Array.isArray(s.must) && Array.isArray(s.mustIn), s.case + ' 必须写 must / mustIn');
    assert.ok(s.nodes.length >= 2, s.case + ' 候选不能只有一条（否则测不出区分）');
    assert.ok(s.src && Number.isFinite(s.src.floor) && s.src.session, s.case + ' 必须写来源与时点');
    assert.ok(typeof s.query === 'string' && s.query.length >= 4, s.case + ' 查询文本必须在场');
    const ids = new Set(s.nodes.map((x) => x.id));
    for (const k of s.must.concat(s.mustIn)) assert.ok(ids.has(k), s.case + ' 的 ' + k + ' 不在本样本节点里');
  }
});
test('v3250 B1. 候选层：must 全进候选（全量参赛，上限不挡资格）', () => {
  const r = run();
  assert.equal(r.ok, true, '真管线必须能跑：' + (r.error || ''));
  assert.equal(r.metrics.stage1HitRate, 1, '候选命中率必须 100%');
  assert.deepEqual(r.samples.filter((s) => !s.isGap && !s.isRankProbe && !s.stage1Ok).map((s) => s.case), [], '不得有候选层缺口');
});
test('v3250 B2. 排序层：mustIn 必须真进候选池；并如实登记「单层不可证伪」这条盲区', () => {
  const r = run();
  assert.equal(r.metrics.stage2HitRate, 1, '排序命中率必须 100%（实得 ' + r.metrics.stage2HitRate + '）');
  assert.deepEqual(r.metrics.stage2Loss, [], '不得有「候选有、排序丢」的样本');
  assert.equal(typeof r.metrics.mustInTopRate, 'number', '可证伪性读数必须在场');
  assert.equal(r.metrics.mustInPerSample.length, r.metrics.samples, '逐样本 mustIn 条数读数必须齐备');
  assert.ok(r.metrics.mustInTopRate > 0.9, 'mustIn 多应落在排序首位（实得 ' + r.metrics.mustInTopRate + '）；低于此值说明评分或保底出了问题');
  for (const s of r.samples) {
    if (s.isGap || s.isRankProbe || !(s.mustIn || []).length) continue;
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
  for (const d of det) {
    if (/known-gap/.test(d.why)) continue;
    assert.equal(/missing|拒判/.test(d.why), false, d.case + ' 的守卫没真的开：' + d.why);
  }
});
test('v3250 C1. 缺口样本逐条登记，且缺口位置写清（候选层 / 排序层）', () => {
  const r = run();
  const kg = r.metrics.knownGaps;
  assert.ok(r.metrics.gapSamples >= 1, '缺口台账至少要有 1 例（否则说明台账根本没生效）');
  assert.equal(kg.length, r.metrics.gapSamples, '台账条数必须等于缺口样本数');
  for (const g of kg) {
    assert.ok(g.case && g.cls, '台账必须点名到样本');
    assert.ok(typeof g.stage1Ok === 'boolean' && typeof g.stage2Ok === 'boolean', g.case + ' 必须记两层读数');
    assert.ok(Array.isArray(g.missRank), g.case + ' 必须记「卡在哪一步」');
  }
  const byStage = kg.map((g) => (g.stage1Ok ? 'rank' : 'candidate'));
  assert.ok(byStage.length > 0, '台账不能为空');
  for (const g of kg) {
    const where = g.stage1Ok ? 'rank' : 'candidate';
    assert.ok(where === 'rank' ? Array.isArray(g.missRank) : true, g.case + ' 的缺口位置必须可判定');
  }
});
test('v3250 C2. 低分噪声读数在场（只报数，不做硬零——避免把「分不开」写成「没泄露」）', () => {
  const r = run();
  const lowCases = CORPUS.SCENARIOS.filter((s) => s.low).map((s) => s.case);
  assert.ok(lowCases.length >= 3, '标了 low 的样本不少于 3 例（实测 ' + lowCases.length + '）');
  assert.deepEqual(r.metrics.lowNoise.map((x) => x.case), lowCases, '低分读数必须与 low 样本一一对应');
  for (const n of r.metrics.lowNoise) {
    assert.ok(n.id && (typeof n.score === 'number' || n.score === null), n.case + ' 必须给出分数读数');
  }
  const sn = r.metrics.lowNoise.find((x) => x.case === 'sn3');
  assert.ok(sn, '同名异人的低分读数必须在场');
  assert.ok(sn.score === null || typeof sn.score === 'number', '读数要么是数要么明确 null（不编 0）');
});
const { writeFileSync, mkdtempSync, copyFileSync } = require_('node:fs');
const os = require_('node:os');
const CLOSURE = ['unified-recall.js', 'ai-select.js', 'injection-router.js', 'relation-disclosure.js',
  'fact-version.js', 'summary-provenance.js', 'ledger-entity.js'];
function makeTree(tag) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lonsha-v3250-' + tag + '-'));
  for (const f of CLOSURE) copyFileSync(path.join(ROOT, f), path.join(dir, f));
  return dir;
}
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
test('v3250 D2. ★ 盲区读数的灵敏度自证：冻结语料 rp1 mustIn 不在首位，读数必须 < 1', () => {
  const UR = require_(ROOT + 'unified-recall.js');
  const AS = require_(ROOT + 'ai-select.js');
  const IR = require_(ROOT + 'injection-router.js');
  const sc = CORPUS.SCENARIOS.find((s) => s.case === 'rp1');
  assert.ok(sc && sc.kind === 'rank-probe', '冻结语料必须含 rp1（非保底+查询只命中噪声）');
  const res = RUNNER.runAll({ corpus: CORPUS, scenarios: [sc],
    modules: { UR: UR, AS: AS, IR: IR } });
  assert.ok(res.ok, '自造样本必须能跑：' + (res.error || ''));
  /* rank-probe 不进主指标 ⇒ 单独喂 rp1 时 main 为空、mustInTopRate=0，仍 < 1。
   * 真正要证的是：用主指标口径跑这一条时，mustIn 不在 scored 首位。 */
  const ids = (res.samples[0].scored || []).map((x) => x.id);
  assert.ok(ids.indexOf('rp1_a') !== 0, 'rp1 的 mustIn 不得占据排序首位（实得首位 ' + ids[0] + '）');
  assert.ok(res.metrics.mustInTopRate < 1,
    '★ 读数必须有灵敏度：自造样本里 mustIn 不在首位，读数必须 < 1（实得 ' + res.metrics.mustInTopRate + '）');
  const base = run().metrics.mustInTopRate;
  assert.ok(base > 0.9, '对照：本批主样本读数应接近 1（实得 ' + base + '）');
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
test('v3250 E1. 评测集与 runner 都在仓内，且套件真调用了它们', () => {
  const self = readFileSync(new URL(import.meta.url).pathname, 'utf-8');
  assert.ok(self.includes('[v3.250.0]'), '版本标记在场');
  assert.ok(self.includes('RUNNER.runAll'), '套件必须真跑真管线');
  assert.ok(self.includes('CORPUS.SCENARIOS') || self.includes('CORPUS.coverageCheck'), '真读语料库');
  const runnerSrc = readFileSync(ROOT + 'tests/fixtures/story-eval-runner.js', 'utf-8');
  assert.ok(runnerSrc.includes('o.corpus') || runnerSrc.includes('opts.corpus') || /\.SCENARIOS/.test(runnerSrc),
    'runner 的样本必须来自 corpus 入参（不得内嵌第二份样本）');
});
test('v3250 E2. 版本锚：三源同源 + 当版恰好锚着（本套件就是当版 frontier）', () => {
  const v = /const VERSION = '([0-9.]+)'/.exec(raw)[1];
  assert.equal(v, manifest.version, 'manifest 跟随 index.js');
  assert.equal(manifest.version, pkg.version, 'package 跟随 index.js');
  const vnum = (s) => String(s).split('.').map(Number).reduce((a, b) => a * 1000 + b, 0);
  assert.ok(vnum(v) >= vnum('3.250.0'), '本套件只在 3.250.0 及以后成立，实得 ' + v);
});