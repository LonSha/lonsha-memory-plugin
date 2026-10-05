// tests/v3276_o6_holdout_and_turns.test.mjs — v3.276.0 O6：质量评测的留出集与端到端
//
//   [v3.276.0 O6] 计划原文三条验收：① 新增能力在不改期望集的前提下提升；
//   ② 无答案样本不会靠扩召回数量得分；③ 泄密等禁入指标单独计不被平均命中率抵消。
//
// 覆盖：
//   A 留出集是留出集（与冻结集三重不交 / 冻结集逐字节未动 / 不参调参）
//   B 真管线三阶段 + 多轮状态序列 + 无答案样本（扩召回数量读数）
//   C 禁入指标单独计（带门分母，不被平均命中率抵消）
//   D 负控制（真源码破坏 → 副本上重跑同款判据；工具两向自证；判据纯度）
//   E 版本锚（下限形 3.276.0）
//
// 边界（诚实）：
//   · 本 runner 只跑**确定性内核**（候选 → 评分 → 裁剪，真模块、零 LLM）。
//     「提取→写入→召回→请求载荷→生成」需要真宿主 + 真模型，本档如实记不可测（modelFace.measured=false）。
//   · 召回是词面机制（无语义向量层）。故「自然转述」样本按冻结集同标准保留共有名词；
//     **零词面重叠**的纯同义替换另立 semantic-gap 登记，不进主指标（拿它当泛化缺口会得出错误的改产品结论）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { breakSource } from './_break_kit.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
const SELF = fs.readFileSync(new URL(import.meta.url).pathname, 'utf8');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const requireFromHere = createRequire(import.meta.url);
const CORPUS = requireFromHere(path.join(ROOT, 'tests/fixtures/story-eval-corpus.js'));
const HOLD = requireFromHere(path.join(ROOT, 'tests/fixtures/story-eval-holdout.js'));
const RUNNER = requireFromHere(path.join(ROOT, 'tests/fixtures/story-eval-runner.js'));
const RUNNER_SRC = read('tests/fixtures/story-eval-runner.js');
const IDX_SRC = read('index.js');
const HOLDOUT_SRC = read('tests/fixtures/story-eval-holdout.js');

const MODS = RUNNER.DEF_MODULES(globalThis);
const run = (list) => RUNNER.runAll({ corpus: { CLASSES: CORPUS.CLASSES }, scenarios: list });
const HOLDOUT = CORPUS.parseRows(HOLD.ROWS);
const FROZEN = CORPUS.SCENARIOS;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'v3276-'));
let tmpN = 0;

/* ══════════════ A. 留出集必须是留出集 ══════════════ */

test('v3276 A1. ★★ 与冻结集三重不交：案例号 / 节点 id / 查询文本', () => {
    const fCases = new Set(FROZEN.map((s) => s.case));
    const fIds = new Set();
    for (const s of FROZEN) for (const n of s.nodes) fIds.add(n.id);
    const fQueries = new Set(FROZEN.map((s) => s.query));
    const dupCase = HOLDOUT.filter((s) => fCases.has(s.case)).map((s) => s.case);
    const dupQuery = HOLDOUT.filter((s) => fQueries.has(s.query)).map((s) => s.case);
    const dupId = [];
    for (const s of HOLDOUT) for (const n of s.nodes) if (fIds.has(n.id)) dupId.push(n.id);
    assert.deepEqual(dupCase, [], '★ 案例号不得与冻结集重合（重合即「改期望集」）');
    assert.deepEqual(dupQuery, [], '★ 查询文本不得与冻结集逐字重合（重合即复述，不是留出）');
    assert.deepEqual(dupId, [], '★ 节点 id 不得与冻结集重合');
    assert.ok(HOLDOUT.length >= 20, '留出集样本数不少于 20（实得 ' + HOLDOUT.length + '）');
});

test('v3276 A2. ★★ 冻结集文件在留出集验证期间逐字节未动（用摘要钉住）', () => {
    /* 为什么钉摘要而不是钉行数：行数不变但内容被改（换个词）同样会让留出集失效。
     * 期望值是**本轮实测**的冻结集指纹；它变了就说明有人为了过判据去动冻结集。 */
    const src = read('tests/fixtures/story-eval-corpus.js');
    const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
    const fp = hash(src);
    assert.equal(src.includes('STORY_EVAL_VERSION = 2'), true, '冻结集版本仍为 2');
    assert.equal(fp, '3a8a8c99', '★ 冻结集指纹（实得 ' + fp + '）—— 改了冻结集就必须在这里显式改，且说明为什么');
    assert.equal(CORPUS.SCENARIOS.length, 55, '冻结集样本数仍为 55');
});

test('v3276 A3. ★ 十二类在留出集里逐类有样本，且每类 2 例', () => {
    const cov = CORPUS.coverageCheck(HOLDOUT);
    assert.deepEqual(cov.missing, [], '十二类不得缺类：' + cov.missing.join(','));
    for (const c of CORPUS.CLASSES) assert.equal(cov.byClass[c], 2, c + ' 恰 2 例（实得 ' + cov.byClass[c] + '）');
    assert.equal(cov.total, 24, '留出集恰 24 例（实得 ' + cov.total + '）');
});

test('v3276 A4. ★ 每例带人工标注依据（原文出处），且解析走冻结集同一解析器', () => {
    /* 解析器只有一份：HOLDOUT_SRC 里不得出现自己的 parse 实现。 */
    assert.ok(!/function\s+parseRows/.test(HOLDOUT_SRC), '★ 留出集不得另写一份解析器（同一事实两份实现）');
    assert.ok(HOLDOUT_SRC.includes('normNode'), '节点归一只有一处');
    for (const s of HOLDOUT) {
        assert.ok(s.note && s.note.length > 4, s.case + ' 必须写清这一例在测什么');
        assert.ok(s.nodes.length >= 2, s.case + ' 候选不能只有一条（否则测不出区分）');
        for (const k of s.must.concat(s.mustIn)) assert.ok(s.nodes.some((n) => n.id === k), s.case + ' 的 ' + k + ' 不在本样本节点里');
    }
    /* 人工标注依据：第 16 列（kind 之后）逐条写在源文件里。 */
    const annotated = HOLDOUT_SRC.split('\n').filter((l) => /第[一二三四五六七八九十百零]+楼写/.test(l));
    assert.ok(annotated.length >= 20, '★ 人工标注依据（原文出处）不少于 20 行（实得 ' + annotated.length + '）');
});

/* ══════════════ B. 真管线三阶段 / 多轮 / 无答案 ══════════════ */

test('v3276 B1. ★★ 留出集三阶段真跑：候选 / 排序 / 最终注入（真模块，零造假）', () => {
    const r = run(HOLDOUT);
    assert.equal(r.ok, true, '真管线必须能跑：' + (r.error || ''));
    const m = r.metrics;
    assert.equal(m.samples, 24);
    assert.equal(m.stage1HitRate, 1, '候选命中率必须 100%（实得 ' + m.stage1HitRate + '）');
    assert.deepEqual(m.stage2Loss, [], '不得有「候选有、排序丢」的样本：' + JSON.stringify(m.stage2Loss));
    assert.equal(m.stage2HitRate, 1, '排序命中率必须 100%（实得 ' + m.stage2HitRate + '）');
    assert.deepEqual(m.stage3Loss, [], '不得有「排序对、裁剪丢」的样本');
    assert.equal(m.stage3HitRate, 1, '最终注入命中率必须 100%（实得 ' + m.stage3HitRate + '）');
    assert.equal(m.avgCandTotal > 2, true, '候选总数读数在场（实得 ' + m.avgCandTotal + '）');
});

test('v3276 B2. ★★ 多轮状态序列：同一记忆图逐轮追问，前轮结论不得在后轮消失', () => {
    assert.ok(HOLD.TURNS.length >= 2, '多轮序列不少于 2 组');
    for (const spec of HOLD.TURNS) {
        assert.ok(spec.turns.length >= 2, spec.case + ' 至少两轮');
        const r = RUNNER.runTurns(spec, MODS, {});
        assert.equal(r.ok, true, spec.case + ' 必须能跑：' + (r.error || ''));
        assert.equal(r.turnsTotal, spec.turns.length);
        assert.equal(r.allOk, true, '★ ' + spec.case + ' 有轮次掉链：' + JSON.stringify(r.badTurns) + ' / ' + JSON.stringify(r.turns.filter((t) => !(t.stage1Ok && t.stage2Ok && t.stage3Ok))));
        /* 逐轮图**完全相同**：故「某轮丢」只能归因到该轮查询，不能归因到图变了。 */
        for (const t of r.turns) assert.equal(t.candTotal >= spec.nodes.length, true, '每轮都读同一张图（实得候选 ' + t.candTotal + '）');
    }
});

test('v3276 B3. ★★ 无答案样本：记忆里没有这条 ⇒ 「扩召回数量」必须被量出来', () => {
    assert.ok(HOLD.NO_ANSWER.length >= 2, '无答案样本不少于 2 例');
    for (const spec of HOLD.NO_ANSWER) {
        const r = RUNNER.runNoAnswer(spec, MODS, {});
        assert.equal(r.ok, true, spec.case + ' 必须能跑：' + (r.error || ''));
        assert.ok(typeof r.topScore === 'number', '最高分必须是真读数（不是「约」）');
        assert.ok(typeof r.paddedZeroScore === 'number', '★ 零分却被补进注入的条数必须可读（这是「扩召回数量」的直接读数）');
        /* 判据口径（不做产品结论）：
         *   引擎在候选稀疏时会把零分条目补齐进注入（mergeWithGuaranteed 第 3 步）。
         *   本档钉的是**这个行为被如实量出来**，而不是「必须返回空」——
         *   后者是产品决策，不是本档能替它做的。 */
        assert.equal(r.mergedTotal, r.mergedIds.length, '读数自洽');
        assert.ok(r.paddedZeroScore >= 0 && r.paddedZeroScore <= r.mergedTotal, '零分补齐数不得超出注入总数');
        assert.ok(typeof r.noEvidence === 'boolean', '「有无词面证据」必须三态可分');
    }
    /* 反坐实：给一条**真有答案**的查询 ⇒ 读数必须与「无答案」不同形。 */
    const spec = HOLD.NO_ANSWER[0];
    const withAns = Object.assign({}, spec, { query: spec.nodes[0].data.summary });
    const r2 = RUNNER.runNoAnswer(withAns, MODS, {});
    assert.ok(r2.topScore > 0, '★ 把查询换成真存在的内容后，最高分必须 > 0（否则「无答案」读数没有分辨力）');
});

/* ══════════════ C. 禁入指标单独计 ══════════════ */

test('v3276 C1. ★★★ 泄密等禁入指标单独计：分母是**带门样本**，不被平均命中率抵消', () => {
    const m = run(HOLDOUT).metrics;
    assert.ok(m.guardGatedDenominator >= 4, '带机制门的样本不少于 4 例（实得 ' + m.guardGatedDenominator + '）');
    assert.equal(m.guardGatedOk, m.guardGatedDenominator, '禁入指标：带门样本全部守住（' + m.guardGatedOk + '/' + m.guardGatedDenominator + '）');
    assert.equal(m.guardOkRateGated, 1, '★ 带门分母口径的守卫通过率（实得 ' + m.guardOkRateGated + '）');
    assert.equal(m.leakCases.length, 0, '机制门被破：' + JSON.stringify(m.leakCases));
    /* ★ 分母口径自证：旧键的分母是全部主样本，两者**必须不同**（否则「单独计」是空话）。 */
    assert.equal(m.guardMainDenominator, m.samples, '覆盖率口径的分母是全部主样本');
    assert.notEqual(m.guardGatedDenominator, m.guardMainDenominator, '★ 禁入指标的分母必须窄于平均命中率的分母');
});

test('v3276 C2. ★★ 门真的会开（探针自证）：三类机制逐类有样本且守卫理由不是「拒判」', () => {
    const m = run(HOLDOUT).metrics;
    const byGate = {};
    for (const d of m.gateDetail) byGate[d.gate] = (byGate[d.gate] || 0) + 1;
    for (const g of ['disclosure', 'fact-revoked', 'provenance']) {
        assert.ok(byGate[g] >= 1, '三类机制都必须有样本：' + g + '（实得 ' + (byGate[g] || 0) + '）');
    }
    for (const d of m.gateDetail) {
        assert.equal(/missing|拒判/.test(d.why), false, d.case + ' 的守卫没真的开：' + d.why);
        assert.equal(d.ok, true, d.case + ' 的守卫未通过');
    }
});

test('v3276 C3. ★★ 分母为 0（没有带门样本）必须**拒判**，不得当成通过', () => {
    const noGate = HOLDOUT.filter((s) => !s.gate).map((s) => Object.assign({}, s));
    const r = run(noGate);
    assert.equal(r.metrics.guardGatedDenominator, 0, '构造：本批没有带门样本');
    assert.equal(r.metrics.guardOkRateGated, null, '★ 无带门样本 ⇒ 禁入读数记 null（不可测），不是 1.0');
    const bad = RUNNER.checkGates(r, { minStage1: 0, minStage2: 0, minStage3: 0, maxLeak: 0, minGuardGated: 1 });
    assert.ok(bad.some((x) => /拒判/.test(x)), '★ checkGates 必须报「禁入指标拒判」：' + JSON.stringify(bad));
});

test('v3276 C4. ★ 模型输出与确定性内核分报告：无真模型条件时如实记不可测', () => {
    const m = run(HOLDOUT).metrics;
    assert.ok(m.modelFace, 'modelFace 读数必须在场');
    assert.equal(m.modelFace.measured, false, '本 runner 不调 LLM ⇒ 如实记不可测');
    assert.ok(/真模型|LLM|宿主/.test(m.modelFace.why), '不可测必须写清原因（不是空字符串）');
    assert.equal(m.modelFace.deterministicOnly, true, '必须自述本读数只覆盖确定性内核');
    assert.notEqual(m.modelFace.measured, 0, '★ 不可测不得写成 0（「没测」与「测了是 0」不同形）');
});

/* ══════════════ D. 负控制 ══════════════ */

/* —— 同款判据本体 —— */

/** 真管线模块闭包：负控制要把**被破坏的模块**与 runner 一起喂进去。
 *   为什么不能只破坏 runner：runner 只是编排层，真正的行为在模块里；
 *   只破坏 runner 的编排不会让「候选/排序/注入」的真实读数变化。
 *   且破坏 runner 副本后，副本自己的 `require` 会把相对路径解析到临时目录 ——
 *   真模块找不到 ⇒ 报「模块缺失」而不是判据转红，那是**夹具失效**不是负控制成立。 */
/* 闭包必须含**传递依赖**：fact-version.js 自己 require('./ledger-entity.js')，
 *   漏了它就会报 MODULE_NOT_FOUND —— 那是夹具缺文件，不是判据转红。 */
const CLOSURE = ['unified-recall.js', 'ai-select.js', 'injection-router.js', 'relation-disclosure.js',
    'fact-version.js', 'summary-provenance.js', 'ledger-entity.js'];
function makeTree(tag) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha-v3276-' + tag + '-'));
    for (const f of CLOSURE) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
    return dir;
}
/** 破坏模块闭包里的一个文件（锚点须恰中 1 次），返回可喂给 runner 的模块集。 */
function brokenModules(tag, file, oldText, newText) {
    const dir = makeTree(tag);
    const p = path.join(dir, file);
    const src = fs.readFileSync(p, 'utf8');
    const n = src.split(oldText).length - 1;
    assert.equal(n, 1, '变异锚点须恰中 1 次：' + tag + ' / ' + file + '（实得 ' + n + '）');
    const next = src.replace(oldText, newText);
    assert.notEqual(next, src, '变异必须真的改了文件：' + tag);
    fs.writeFileSync(p, next);
    for (const k of Object.keys(requireFromHere.cache || {})) if (k.includes(path.basename(dir))) delete requireFromHere.cache[k];
    return {
        UR: requireFromHere(path.join(dir, 'unified-recall.js')),
        AS: requireFromHere(path.join(dir, 'ai-select.js')),
        IR: requireFromHere(path.join(dir, 'injection-router.js')),
        RD: requireFromHere(path.join(dir, 'relation-disclosure.js')),
        FV: requireFromHere(path.join(dir, 'fact-version.js')),
        SP: requireFromHere(path.join(dir, 'summary-provenance.js')),
    };
}

/** B1 判据本体：留出集三阶段必须全绿（可注入被破坏的 runner 与模块）。 */
function holdoutJudge(runner, mods) {
    const list = CORPUS.parseRows(HOLD.ROWS);
    const r = runner.runAll({ corpus: { CLASSES: CORPUS.CLASSES }, scenarios: list, modules: mods || MODS });
    if (!r.ok) throw new Error('真管线跑不动：' + r.error);
    if (r.metrics.stage1HitRate !== 1) throw new Error('候选命中率掉了：' + r.metrics.stage1HitRate);
    if (r.metrics.stage2HitRate !== 1) throw new Error('★ 排序命中率掉了：' + r.metrics.stage2HitRate + ' 丢失 ' + JSON.stringify(r.metrics.stage2Loss));
    if (r.metrics.stage3HitRate !== 1) throw new Error('最终注入命中率掉了：' + r.metrics.stage3HitRate);
}

/** C1 判据本体：禁入指标必须窄于平均命中率的分母（可注入被破坏的 runner）。 */
function gatedDenomJudge(runner, mods) {
    const list = CORPUS.parseRows(HOLD.ROWS);
    const r = runner.runAll({ corpus: { CLASSES: CORPUS.CLASSES }, scenarios: list, modules: mods || MODS });
    if (!r.ok) throw new Error('真管线跑不动：' + r.error);
    const m = r.metrics;
    if (m.guardGatedDenominator === m.guardMainDenominator) throw new Error('★ 禁入指标分母被摊平（' + m.guardGatedDenominator + '）：泄密被平均命中率抵消');
    if (m.guardOkRateGated !== 1) throw new Error('带门守卫通过率不是 1：' + m.guardOkRateGated);
}

/** C3 判据本体：没有带门样本时禁入读数必须拒判（不是 1.0）。 */
function gatedNullJudge(runner, mods) {
    const list = CORPUS.parseRows(HOLD.ROWS).filter((s) => !s.gate).map((s) => Object.assign({}, s));
    const r = runner.runAll({ corpus: { CLASSES: CORPUS.CLASSES }, scenarios: list, modules: mods || MODS });
    if (!r.ok) throw new Error('真管线跑不动：' + r.error);
    if (r.metrics.guardOkRateGated !== null) throw new Error('★ 无带门样本却给了读数：' + r.metrics.guardOkRateGated);
}

/** B3 判据本体：无答案样本必须量出「扩召回数量」。 */
function noAnswerJudge(runner, mods) {
    const spec = HOLD.NO_ANSWER[0];
    const r = runner.runNoAnswer(spec, mods || MODS, {});
    if (!r.ok) throw new Error('无答案通路跑不动：' + r.error);
    if (typeof r.paddedZeroScore !== 'number') throw new Error('★ 零分补齐数不可读');
    const withAns = Object.assign({}, spec, { query: spec.nodes[0].data.summary });
    const r2 = runner.runNoAnswer(withAns, mods || MODS, {});
    if (!(r2.topScore > 0)) throw new Error('★ 换成真有答案的查询后最高分仍为 ' + r2.topScore + '（读数无分辨力）');
}

/* 锚点选择（本档实测踩过两次）：
 *   ① 破坏点必须在**真行为**里，不在 runner 的编排层：只改编排不会让三阶段读数变化；
 *   ② 破坏 runner 后其副本自己的 require 会把相对路径解析到临时目录，真模块找不到
 *      ⇒ 报「模块缺失」而不是判据转红 —— 那是夹具失效，不是负控制成立。
 *      故：破坏模块闭包 + 显式注入模块集，两条一起做。 */
const A_UR = "    kept = out.slice();";
const A_AS = "score += term.length >= 4 ? 6 : (term.length === 3 ? 4 : 2);";
const A_R1 = "const merged = UR.mergeWithGuaranteed(ranked, { maxTotal: Number(o.maxTotal) || 4 }, m2);";
const A_R3 = "        guardOkRateGated: (function () {";

/* runner 自身的破坏（只用于「读数被写死」这一类）：编排层改动不影响真行为，
 *   故这类负控制只对**读数口径**类判据有效（D4 即此类）。 */
function runOnBroken(anchor, replacement, label, fn) {
    const broken = breakSource(RUNNER_SRC, anchor, replacement, label);
    const file = path.join(TMP, 'r' + (++tmpN) + '.js');
    fs.writeFileSync(file, broken);
    const mod = requireFromHere(file);
    assert.notStrictEqual(mod, RUNNER, '必须是破坏副本，不是原件');
    try { fn(mod); return { threw: false, message: '' }; }
    catch (e) { return { threw: true, message: String((e && e.message) || e) }; }
}

test('v3276 D1. 阳性对照：三套判据在**原版**上必须真成立', () => {
    holdoutJudge(RUNNER);
    gatedDenomJudge(RUNNER);
    gatedNullJudge(RUNNER);
    noAnswerJudge(RUNNER);
});

test('v3276 D2. ★★ 负控制·候选层不再全量参赛 ⇒ 留出集三阶段判据必须转红', () => {
    const mods = brokenModules('d2', 'unified-recall.js', A_UR, "    kept = out.slice(0, 1);");
    let threw = false, msg = '';
    try { holdoutJudge(RUNNER, mods); } catch (e) { threw = true; msg = String((e && e.message) || e); }
    assert.ok(threw, '★ 候选层被砍后，留出集判据必须转红（否则它守的不是真管线）');
    assert.match(msg, /候选命中率掉了|排序命中率掉了|最终注入命中率掉了/);
    holdoutJudge(RUNNER, MODS);
});

test('v3276 D2b. ★★ 负控制·排序层不再给分（评分常量）⇒ 留出集判据必须转红', () => {
    const mods = brokenModules('d2b', 'ai-select.js', A_AS, "score += 0;");
    let threw = false, msg = '';
    try { holdoutJudge(RUNNER, mods); } catch (e) { threw = true; msg = String((e && e.message) || e); }
    assert.ok(threw, '★ 评分被抹平后，留出集判据必须转红');
    assert.match(msg, /排序命中率掉了|候选命中率掉了|最终注入命中率掉了/);
});

test('v3276 D3. ★★ 负控制·披露门被拆 ⇒ 禁入指标必须转红（且不是因缺模块）', () => {
    /* 披露门在 relation-disclosure.js：把「命中披露条件即拦下」改成「一律放行」，
     *   则 h-dg2 的真身记录会进注入 ⇒ 禁入读数必须掉。 */
    const anchor = "            if (r.state === 'miss') { out.counts.miss++; out.gated.push(e); continue; }";
    let mods = null;
    try {
        mods = brokenModules('d3', 'relation-disclosure.js', anchor, "            if (false) { out.counts.miss++; out.gated.push(e); continue; }");
    } catch (e) {
        throw new Error('披露门锚点未命中（产品结构变了，须同步本判据）：' + ((e && e.message) || e));
    }
    let threw = false, msg = '';
    try { gatedDenomJudge(RUNNER, mods); } catch (e) { threw = true; msg = String((e && e.message) || e); }
    assert.ok(threw, '★ 披露门被拆后，禁入指标必须转红（否则这道门是空转）');
    assert.match(msg, /禁入指标分母被摊平|带门守卫通过率不是 1/);
});

test('v3276 D4. ★★ 负控制·无带门样本时把「不可测」写成 1.0 ⇒ 拒判判据必须转红', () => {
    const r = runOnBroken(A_R3, "        guardOkRateGated: 1,\n        _unused: (function () {", 'D4 假可测', gatedNullJudge);
    assert.ok(r.threw, '★ 把「没有带门样本」写成 1.0 后，判据必须转红');
    assert.match(r.message, /无带门样本却给了读数/);
});

test('v3276 D5. 工具两向自证：锚点 0 次 / 不唯一 / 同值替换均抛；判据不得引用锚点串', () => {
    assert.throws(() => breakSource(RUNNER_SRC, 'const 不存在的锚点XYZ = 1;', 'x', 'D5'), /拒绝破坏|命中 0 次|恰中 1 次/);
    assert.throws(() => breakSource(RUNNER_SRC, 'function ', 'x', 'D5'), /拒绝破坏|恰中 1 次|要求恰好 1 次/);
    assert.throws(() => breakSource(RUNNER_SRC, "guardOkRateGated: 1", "guardOkRateGated: 1", 'D5'), /必须真的改变源码|拒绝破坏/);
    /* H5 判据纯度：判据体内不得出现被破坏的锚点字面量；锚点字面量在本档只准声明一次。 */
    const judges = holdoutJudge.toString() + gatedDenomJudge.toString() + gatedNullJudge.toString() + noAnswerJudge.toString();
    for (const a of [A_UR, A_AS, A_R1, A_R3]) {
        assert.ok(!judges.includes(a), '判据不得引用锚点字面量：' + a.slice(0, 40));
        assert.strictEqual(SELF.split(a).length - 1, 1, '锚点字面量只准声明一次（H5）');
    }
});

/* ══════════════ E. 版本锚 ══════════════ */

test('v3276 E1. 版本锚（下限形）：三源同源且不低于 3.276.0', () => {
    const vnum = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0).reduce((a, b) => a * 1000 + b, 0);
    const pkg = JSON.parse(read('package.json')).version;
    const man = JSON.parse(read('manifest.json')).version;
    const idxVer = (/const VERSION = '([0-9.]+)'/.exec(IDX_SRC) || [])[1];
    assert.ok(idxVer, 'index.js 必须有 VERSION 常量');
    assert.strictEqual(pkg, idxVer, 'package.json 与 index.js 版本必须一致');
    assert.strictEqual(man, idxVer, 'manifest.json 与 index.js 版本必须一致');
    assert.ok(vnum(idxVer) >= vnum('3.276.0'), '本套件自 3.276.0 起成立；当前 ' + idxVer);
    assert.ok(SELF.includes('v3.276.0'), '★ 本档必须锁自己的出生版本 v3.276.0（不随抬版上抬）');
});
