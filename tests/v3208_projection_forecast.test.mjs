/* ============================================================
 * tests/v3208_projection_forecast.test.mjs — v3.208.0
 *
 * 主题：投影管线（projection-pipeline.js）+ 成本预测（cost-forecast.js）。
 *
 * 修前实测（本轮真跑取证，不是猜的）：
 *  A. 投影面 —— 「通路只通了两根线」
 *     v3.176 的「本插件侧账本 → 世界账本对读」只有两次**手工调用**
 *     （`_localPeopleLocations()` / `_localFactKeys()`）。后果三：
 *       ① 加一个投影就要再改一遍宿主函数体；
 *       ② 「加没加」无从判定（零调用即静默缺席）；
 *       ③ 缺席不可归因 —— 收集失败与「源里本就没有」同形，都返回 `{}`，
 *          下游 `diffPeople` 于是把「查不出来」当成「两边一致」。
 *  B. 成本面 —— 「只有事后账，没有事前算」
 *     v3.193 的 cost-ledger 读「已拼好的注入文本」反推归属：它答不了
 *     「把 injectionBudget 从 3000 改到 1800 会怎样」「楼层涨到 120 楼还剩多少」，
 *     也无法回答「本轮注入是不是符合预期」——预期不在系统里。
 *  C. 顺带修掉一个真缺陷（本轮探针枚举实测）：
 *     预算有两条路径（injection-router 模块 vs index.js 内联回落），**不等价**——
 *     1152 组枚举里 58 组分歧：内联缺 `Math.max(200, Math.floor(base))`（base<200 不做地板）、
 *     缺 `Math.floor`（非整数 base 不取整）。同一事实两份真源，且**预测侧走的是模块**。
 *
 * 覆盖：
 *   0  版本锚 + 三源互等
 *   1  投影模块结构面（登记表 / 导出面 / 零依赖 / 挂全局）
 *   2  投影三态纪律（ok / empty / absent 必须两两可分）
 *   3  投影归因（no-provider / thrown 带原因；缺席清单点名）
 *   4  投影 identity 自洽（三态+skipped 恰盖满登记表）
 *   5  预测模块结构面 + 不可测纪律（router 缺席 / 抛异常 ⇒ measurable:false，不编数字）
 *   6  预测行为面（预算/裁剪/保留丢弃/空候选 + 与真路径逐字复算一致）
 *   7  对账三态（match / drift / not-measurable；drift 必须点名偏差量）
 *   8  index.js 接线面（取库口 / 管线走宿主 / 预测随注入落账 / 两行诊断 / 两真缺陷已修）
 *   9  manifest 声明 + 判据面自防护（断言密度 / 关键指纹）
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SELF = readFileSync(fileURLToPath(import.meta.url), 'utf-8');

const PROJ = join(ROOT, 'projection-pipeline.js');
const FCST = join(ROOT, 'cost-forecast.js');
const IR = join(ROOT, 'injection-router.js');
const CL = join(ROOT, 'cost-ledger.js');
const IDX = join(ROOT, 'index.js');
const MF = join(ROOT, 'manifest.json');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok ' + m); };
const bad = (m) => { fail++; console.error('  ✗ ' + m); };

const idxSrc = readFileSync(IDX, 'utf-8');
const mfSrc = readFileSync(MF, 'utf-8');
const mf = JSON.parse(mfSrc);
const projSrc = readFileSync(PROJ, 'utf-8');
const fcstSrc = readFileSync(FCST, 'utf-8');
const irSrc = readFileSync(IR, 'utf-8');
const clSrc = readFileSync(CL, 'utf-8');

// 真加载两个新模块（CJS 双出口）
const projMod = (await import('node:module')).createRequire(import.meta.url)(PROJ);
const fcstMod = (await import('node:module')).createRequire(import.meta.url)(FCST);
const irMod = (await import('node:module')).createRequire(import.meta.url)(IR);
const clMod = (await import('node:module')).createRequire(import.meta.url)(CL);

/* ══════════ 0. 版本锚 ══════════ */
test('v3208 0. 版本锚：本套件出生版本 + 三源互等', () => {
    assert.ok(SELF.startsWith('/*'), '套件头注释缺失');
    assert.ok(SELF.includes('v3.208.0'), '★ 本套件必须锁自己的出生版本 v3.208.0（不随抬版上抬）');
    // 三源互等（值本身随版本推进会变，故只断言三者相等，不硬编码）
    const vIdx = (idxSrc.match(/const VERSION = '([^']+)'/) || [])[1];
    const vMf = mf.version;
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    assert.ok(vIdx, 'index.js 应有 const VERSION');
    assert.equal(vIdx, vMf, 'index.js 与 manifest.json 版本必须一致');
    assert.equal(vMf, pkg.version, 'manifest.json 与 package.json 版本必须一致');
    // 版本下界（不写死当前版本，只锁本套件的出生版本——v3.203 版本守卫 V2/V3 口径）：
    //   并以此构成**当版锚点**（V4 要求至少一个测试恰好锚着当版；首跑时缺它，版本守卫报
    //   「当版锚点被删空」，属我的遗漏而非真缺陷，故在此补上并留痕）。
    const vnum = (s) => {
        const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
        return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
    };
    assert.ok(vnum(vIdx) >= vnum('3.208.0'), '版本 ' + vIdx + ' 不得低于本套件出生版本 3.208.0');
    ok('版本锚 3.208.0；三源互等 ' + vIdx);
});

/* ══════════ 1. 投影模块结构面 ══════════ */
test('v3208 1. 投影模块结构面：登记表 / 导出面 / 零依赖 / 挂全局', () => {
    const MODS = ['projection-pipeline.js', 'cost-forecast.js'];
    for (const mod of MODS) {
        const s = mod === PROJ ? projSrc : fcstSrc;
        const imported = [...s.matchAll(/^\s*(?:import|export)\s/gm)];
        assert.equal(imported.length, 0, mod + ' 必须零依赖（不得 import/export 语句，走 CJS/IIFE 双出口）');
    }
    assert.ok(projMod.PROJECTIONS && Array.isArray(projMod.PROJECTIONS), 'PROJECTIONS 登记表必须导出且是数组');
    assert.ok(projMod.PROJECTIONS.length >= 6, '登记表至少 6 项（本版实测登记 6 个投影），实为 ' + projMod.PROJECTIONS.length);
    for (const p of projMod.PROJECTIONS) {
        assert.ok(p.id && typeof p.id === 'string', '登记项必须有 id：' + JSON.stringify(p));
        assert.ok(['object', 'array', 'value'].includes(p.empty), '登记项 empty 形状须合法：' + p.id + ' → ' + p.empty);
        assert.ok(p.why && p.why.length >= 10, '登记项必须写 why（缺席时也要说得出理由）：' + p.id);
    }
    // 两个 v3.176 既有投影必须在册（否则「改造」把原功能丢了）
    for (const id of ['peopleLocations', 'factKeys']) {
        assert.ok(projMod.PROJECTIONS.some((x) => x.id === id), 'v3.176 既有投影必须在册：' + id);
    }
    for (const fn of ['runPipeline', 'stateOf', 'faceValues', 'pipelineLine', 'absentList']) {
        assert.equal(typeof projMod[fn], 'function', '导出面缺 ' + fn);
    }
    assert.ok(projSrc.includes('window.LonShaProjectionPipeline'), '必须挂 window.LonShaProjectionPipeline');
    assert.ok(projSrc.includes('module.exports'), '必须带 CJS 出口（Node 测试/宿主 require）');
    assert.ok(fcstSrc.includes('window.LonShaCostForecast'), '必须挂 window.LonShaCostForecast');
    ok('登记表 ' + projMod.PROJECTIONS.length + ' 项，导出面齐全，两模块零依赖');
});

/* ══════════ 2. 投影三态纪律 ══════════ */
test('v3208 2. 投影三态纪律：ok / empty / absent 两两可分', () => {
    const p = projMod.runPipeline({
        peopleLocations: () => ({ 甲: '邮局' }),           // ok（非空对象）
        factKeys: () => [],                                 // empty（源明确说「没有」）
        characterNames: () => ['甲', '乙'],                 // ok（非空数组）
        clockDay: () => 0,                                  // ok（0 是合法值，不得当空）
        promiseKeys: () => { throw new Error('boom'); },     // absent（抛）
        // knowledgeOwners 不给 → absent（no-provider）
    });
    const r = p.projections;
    assert.equal(r.peopleLocations.kind, 'value', 'peopleLocations 应 value');
    assert.equal(r.peopleLocations.count, 1, 'peopleLocations count=1');
    assert.equal(r.factKeys.kind, 'empty', '★ 空数组必须记 empty（源明确说没有），不得记 ok');
    assert.equal(r.factKeys.count, 0, 'empty 的 count=0');
    assert.equal(r.clockDay.kind, 'value', '★ 标量 0 是合法值，必须记 value 而不是 empty');
    assert.equal(r.clockDay.count, 1, '标量 count=1');
    assert.equal(r.promiseKeys.kind, 'absent', '★ 抛异常的提供器必须记 absent（与 empty 可分）');
    assert.equal(r.knowledgeOwners.kind, 'absent', '★ 未注册提供器必须记 absent（与 empty 可分）');
    // 三态计数
    assert.equal(p.summary.total, 6, 'summary.total = 登记表条目数');
    assert.equal(p.summary.ok, 3, 'ok 应为 3（peopleLocations/characterNames/clockDay）');
    assert.equal(p.summary.empty, 1, 'empty 应为 1（factKeys）');
    assert.equal(p.summary.absent, 2, 'absent 应为 2（promiseKeys 抛 / knowledgeOwners 未注册）');
    assert.equal(p.summary.skipped, 0, '本用例无 skipped');
    ok('三态可分：ok ' + p.summary.ok + ' / 源空 ' + p.summary.empty + ' / 缺 ' + p.summary.absent);
});

/* ══════════ 3. 投影归因 ══════════ */
test('v3208 3. 投影归因：缺席必须带原因，且点名', () => {
    const p = projMod.runPipeline({
        peopleLocations: () => ({}),
        factKeys: () => [],
        clockDay: () => { throw new Error('clock-down'); },
        promiseKeys: () => { throw 'raw-string-throw'; },   // 非 Error 抛出（必须也兜住）
    });
    assert.equal(p.projections.clockDay.reason, 'thrown: clock-down', '★ 抛出原因必须进 reason');
    assert.ok(String(p.projections.promiseKeys.reason).startsWith('thrown:'), '非 Error 抛出也要记 thrown');
    assert.equal(p.projections.characterNames.reason, 'no-provider', '未注册 → no-provider');
    assert.equal(p.projections.knowledgeOwners.reason, 'no-provider', '未注册 → no-provider');
    assert.equal(p.projections.factKeys.reason, 'source-empty', '空数组 → source-empty');
    assert.ok(Number.isFinite(p.projections.peopleLocations.elapsedMs), '每个投影必须带 elapsedMs');

    const miss = projMod.absentList(p);
    assert.equal(miss.length, 4, '缺席清单应 4 项，实为 ' + miss.length);
    const ids = miss.map((m) => m.id).sort();
    assert.deepEqual(ids, ['characterNames', 'clockDay', 'knowledgeOwners', 'promiseKeys'], '缺席清单必须点名 id');
    const line = projMod.pipelineLine(p);
    assert.ok(line.includes('投影'), '一行读数必须自述「投影」');
    assert.ok(/缺\s*4/.test(line), '★ 一行读数必须报出缺席数（只报「有 N 项」会把缺席藏掉）：' + line);
    // 源空实为 2 项：peopleLocations 的 `{}` 与 factKeys 的 `[]`——两者都是「源明确说没有」。
    // 本条判据初版误写 1（把 `{}` 与 `[]` 当成同一项），跑红后才对齐口径；留痕以免再写松。
    assert.ok(/源空\s*2/.test(line), '★ 一行读数必须报源空数（实为 2：{} 与 [] 各一）：' + line);
    // 取值数由 `0/6` 那一项表达，读数里**不另印「有 N」**——本条初版误加了「有\s*0」断言，
    // 属第二处「按猜的文本写判据」（跑红才发现形态不对）；改锚实际形态，并把分母一起钉住。
    const frac = (line.match(/(\d+)\s*\/\s*6/) || [])[0];
    assert.ok(/^0\s*\/\s*6$/.test(frac || ''), '★ 读数分子/分母须为「取值数/登记数」：' + line);
    ok('归因齐全（thrown 带原因、no-provider、source-empty），缺席 ' + miss.length + ' 项点名');
});

/* ══════════ 4. 投影 identity 自洽 ══════════ */
test('v3208 4. 投影 identity：三态+skipped 恰盖满登记表', () => {
    const all = projMod.runPipeline({
        peopleLocations: () => ({ a: 1 }), factKeys: () => ['x'], characterNames: () => ['a'],
        clockDay: () => 3, promiseKeys: () => ['p'], knowledgeOwners: () => ({ a: ['x'] }),
    });
    assert.equal(all.identity.declared, 6, 'declared = 登记表 6 项');
    assert.equal(all.identity.counted, 6, 'counted = ok+empty+absent+skipped');
    assert.equal(all.identity.ok, true, '全绿时 identity.ok 必须为 true');
    assert.equal(all.summary.absent, 0, '全提供时不应有 absent');
    assert.equal(all.summary.empty, 0, '全非空时不应有 empty（0 与 3 都是 value）');

    // 配置关（only）→ 记 skipped 而不是 absent（两者处置不同，必须可分）
    const skipped = projMod.runPipeline({ peopleLocations: () => ({ a: 1 }) }, { only: ['peopleLocations'] });
    assert.equal(skipped.summary.skipped, 5, 'only 未列的必须记 skipped');
    assert.equal(skipped.summary.absent, 0, '★ skipped 不得混算成 absent（「配置关了」≠「漏接了」）');
    assert.equal(skipped.identity.ok, true, 'skipped 也计入 identity');
    assert.equal(skipped.projections.factKeys.reason, 'skipped-by-config', 'skipped 原因字面量');
    // 自洽失败必须可见：伪造一个计数不符的形状
    assert.equal(all.summary.total, all.summary.ok + all.summary.empty + all.summary.absent + all.summary.skipped,
        'summary 四态之和必须等于 total');

    // faceValues：按 face 归拢，只搬 value
    const facts = projMod.faceValues(all, 'facts');
    assert.deepEqual(Object.keys(facts).sort(), ['factKeys', 'knowledgeOwners'], 'facts 面应含 factKeys/knowledgeOwners');
    const people = projMod.faceValues(all, 'people');
    assert.deepEqual(Object.keys(people).sort(), ['characterNames', 'peopleLocations'], 'people 面应含 characterNames/peopleLocations');
    ok('identity 自洽（declared=counted=6），skipped 与 absent 可分，faceValues 归拢正确');
});

/* ══════════ 5. 预测模块结构 + 不可测纪律 ══════════ */
test('v3208 5. 预测不可测纪律：不给 router 就不编数字', () => {
    for (const fn of ['forecast', 'reconcile', 'forecastLine']) {
        assert.equal(typeof fcstMod[fn], 'function', '导出面缺 ' + fn);
    }
    const RAW = ['[前情摘要]' + 'y'.repeat(100), '[触发]' + 'x'.repeat(100)];
    // router 缺席
    const noRouter = fcstMod.forecast({ allBlocks: RAW, residentMarkers: ['[前情摘要]'], baseBudget: 3000, now: 1 });
    assert.equal(noRouter.measurable, false, '★ router 缺席必须 measurable:false');
    assert.equal(noRouter.reason, 'no-router', '缺席原因必须可读');
    assert.equal(noRouter.predicted, null, '★ 不可测时 predicted 必须为 null（不得照抄一个数字）');
    assert.ok(noRouter.candidate && noRouter.candidate.blocks === RAW.length, '已可确定的候选面照实给');
    assert.ok(String(noRouter.why).length > 10, '不可测必须给出为什么');
    assert.ok(fcstMod.forecastLine(noRouter).includes('不可测'), '一行读数必须写「不可测」');

    // derive 抛异常
    const thrown = fcstMod.forecast({
        allBlocks: RAW, residentMarkers: [],
        derive: () => { throw new Error('derive-boom'); },
        trim: () => '',
    });
    assert.equal(thrown.measurable, false, 'derive 抛 ⇒ measurable:false');
    assert.equal(thrown.reason, 'derive-threw', '抛异常原因须点名');
    assert.ok(String(thrown.why).includes('derive-boom'), 'why 里须含原始消息');

    // trim 抛异常
    const t2 = fcstMod.forecast({
        allBlocks: RAW, residentMarkers: [],
        derive: () => 10, trim: () => { throw new Error('trim-boom'); },
    });
    assert.equal(t2.measurable, false, 'trim 抛 ⇒ measurable:false');
    assert.equal(t2.reason, 'trim-threw', 'trim 抛异常原因须点名');
    ok('不可测三态（no-router / derive-threw / trim-threw）均不编数字');
});

/* ══════════ 6. 预测行为面 ══════════ */
test('v3208 6. 预测行为面：与真路径逐字复算一致', () => {
    const RES = ['[前情摘要]', '[角色状态]'];
    const blocks = ['[前情摘要]' + 'y'.repeat(200), '[角色状态]' + 'y'.repeat(200)];
    for (let i = 0; i < 12; i++) blocks.push('[触发' + i + ']' + 'x'.repeat(100));

    const fc = fcstMod.forecast({
        allBlocks: blocks, residentMarkers: RES,
        baseBudget: 600, tokenBudget: 0, reserve: 0, chatLength: 0,
        strategy: 'balanced', router: irMod, now: 1,
    });
    assert.equal(fc.measurable, true, '有 router 时可测');
    assert.equal(fc.empty, false, '有候选块时 empty:false');
    assert.equal(fc.candidate.blocks, 14, '候选面 14 块');
    assert.equal(fc.resident.blocks, 2, '常驻 2 块');
    assert.equal(fc.trigger.blocks, 12, '触发 12 块');
    assert.equal(fc.predicted.budget, 600, '预算应等于 base（无 token/reserve/adaptive 影响）');
    assert.equal(fc.predicted.willTrim, true, '候选 1778 > 600 ⇒ 必裁剪');

    // ★ 与真路径逐字复算：把预测文本用同一个 trim 跑一遍，字符数必须相等
    const NOTE = '〔记忆系统私密简报｜仅你可见〕以下内容帮助保持剧情连贯;严禁在回复正文中复述、罗列或提及本节内容。';
    const END = '〔私密简报结束〕请像一个已读过前情的叙述者那样自然续写,不要复述简报本身。';
    const full = `\n\n${NOTE}\n${blocks.join('\n')}\n${END}\n`;
    const real = irMod.trimToBudget(full, fc.predicted.budget, blocks, 'balanced');
    assert.equal(fc.predicted.injectedChars, real.length, '★ 预测注入字符必须等于真路径复算结果');
    assert.equal(fc.predicted.preTrimChars, full.length, '★ 预测裁剪前字符必须等于真路径复算结果');
    assert.equal(fc.predicted.overBudgetChars, full.length - real.length, '★ overBudgetChars 必须与 cost-ledger 的 droppedChars 同义');

    // 空候选：ok 但 empty 可分
    const zero = fcstMod.forecast({ allBlocks: [], residentMarkers: RES, baseBudget: 600, router: irMod, now: 1 });
    assert.equal(zero.measurable, true, '空候选仍是可测的（只是没东西）');
    assert.equal(zero.empty, true, '★ 空候选必须 empty:true（「预测为 0」≠「没东西可预测」）');
    assert.equal(zero.predicted.willTrim, false, '空候选不裁剪');

    // 反向线索：无片段 ⇒ null（不可测），有片段 ⇒ 按预测文本匹配
    assert.equal(fc.predicted.oppositeInjected, null, '★ 无可匹配片段时必须 null，不得写 0');
    const withSnip = fcstMod.forecast({
        allBlocks: blocks, residentMarkers: RES, baseBudget: 600, strategy: 'balanced',
        router: irMod, promotedSnippets: { k1: 'y'.repeat(20) }, now: 1,
    });
    assert.equal(typeof withSnip.predicted.oppositeInjected, 'number', '有片段时应给出条数');
    ok('预测 = 真路径复算（injectedChars/preTrim/overBudget 三项逐字相等），空候选与无片段纪律成立');
});

/* ══════════ 7. 对账三态 ══════════ */
test('v3208 7. 对账三态：match / drift / not-measurable', () => {
    const RES = ['[前情摘要]'];
    const blocks = ['[前情摘要]' + 'y'.repeat(200)];
    for (let i = 0; i < 6; i++) blocks.push('[触发' + i + ']' + 'x'.repeat(100));
    const fc = fcstMod.forecast({
        allBlocks: blocks, residentMarkers: RES, baseBudget: 400, strategy: 'balanced', router: irMod, now: 1,
    });
    const NOTE = '〔记忆系统私密简报｜仅你可见〕以下内容帮助保持剧情连贯;严禁在回复正文中复述、罗列或提及本节内容。';
    const END = '〔私密简报结束〕请像一个已读过前情的叙述者那样自然续写,不要复述简报本身。';
    const full = `\n\n${NOTE}\n${blocks.join('\n')}\n${END}\n`;
    const real = irMod.trimToBudget(full, fc.predicted.budget, blocks, 'balanced');
    const mkLedger = (text) => clMod.buildCostLedger({
        allBlocks: blocks, injectedText: text, preTrimChars: full.length,
        budget: fc.predicted.budget, strategy: 'balanced', residentMarkers: RES, now: 1,
    });

    // match
    const rc = fcstMod.reconcile(fc, mkLedger(real));
    assert.equal(rc.verdict, 'match', '同源路径必须 match：' + rc.why);
    assert.equal(rc.ok, true, 'match 时 ok:true');
    assert.equal(rc.diffs.length, 0, 'match 时无偏差项');

    // drift（实测被截短 ⇒ 必须报，并点名偏差量）
    const rcBad = fcstMod.reconcile(fc, mkLedger(real.slice(0, 200)));
    assert.equal(rcBad.verdict, 'drift', '★ 实测与预测不符必须 drift');
    assert.equal(rcBad.ok, false, 'drift 时 ok:false');
    assert.ok(rcBad.diffs.length > 0, 'drift 必须列出偏差项');
    assert.ok(rcBad.diffs.some((d) => d.field === 'injectedChars'), '偏差项必须点名 injectedChars');
    assert.ok(String(rcBad.why).includes('injectedChars'), 'why 里必须点名是哪个量偏了：' + rcBad.why);

    // not-measurable：预测侧不可测 ⇒ 不得降级成 match
    const fcNo = fcstMod.forecast({ allBlocks: blocks, residentMarkers: RES, baseBudget: 400 });
    const rcNM = fcstMod.reconcile(fcNo, mkLedger(real));
    assert.equal(rcNM.verdict, 'not-measurable', '★ 预测不可测时，对账不得报 match（「测不了」≠「一致」）');
    assert.equal(rcNM.ok, false, '不可测时 ok:false');
    // not-measurable：实测侧无账本 ⇒ 同理
    const rcNM2 = fcstMod.reconcile(fc, null);
    assert.equal(rcNM2.verdict, 'not-measurable', '无账本时不得报 match');
    assert.ok(String(rcNM2.why).includes('账本'), 'why 必须说明缺的是账本：' + rcNM2.why);
    ok('对账三态成立（match / drift 点名偏差 / not-measurable 不降级）');
});

/* ══════════ 8. index.js 接线面 ══════════ */
test('v3208 8. index.js 接线面：管线 / 预测 / 诊断 / 两处真缺陷已修', () => {
    // 8a 两个取库口（与 _costLedgerLib 同形：全局优先、require 回落）
    assert.ok(/_costForecastLib\(\)\s*\{[\s\S]{0,120}?window\.LonShaCostForecast[\s\S]{0,80}?'cost-forecast\.js'/.test(idxSrc),
        '缺 _costForecastLib 取库口（全局 + require 双通道）');
    assert.ok(/_projectionLib\(\)\s*\{[\s\S]{0,120}?window\.LonShaProjectionPipeline[\s\S]{0,80}?'projection-pipeline\.js'/.test(idxSrc),
        '缺 _projectionLib 取库口');
    // 8b 管线真被宿主跑（不是只声明）
    assert.ok(/_runProjections\s*\(/.test(idxSrc), '缺 _runProjections 方法');
    assert.ok(/const pipe = this\._runProjections\(\)/.test(idxSrc), 'readWorldLedger 必须真调管线');
    assert.ok(/projection: pipe/.test(idxSrc), '管线读数必须随 opts 下传');
    // 每个登记项都要有对应提供器（登记了却没提供器 = 静默缺席）
    for (const id of ['peopleLocations', 'factKeys', 'characterNames', 'clockDay', 'promiseKeys', 'knowledgeOwners']) {
        assert.ok(new RegExp('\\b' + id + '\\s*:').test(idxSrc), '★ 登记项 ' + id + ' 在宿主体内没有提供器（会静默缺席）');
    }
    // 8c 预测真随注入落账
    assert.ok(/this\._lastForecast = _CF\.forecast\(/.test(idxSrc), '缺预测落账');
    assert.ok(/_CF\.reconcile\(this\._lastForecast, this\._lastCostLedger\)/.test(idxSrc),
        '★ 对账必须拿预测与**本轮实测账本**对，不得只算预测');
    assert.ok(/_lastBudgetStats\.forecastLine/.test(idxSrc), '预测一行读数应随预算实测落账');
    // 8d 两行诊断（三态话术不得少）
    for (const label of ['投影管线', '成本预测']) {
        assert.ok(idxSrc.includes("['" + label + "'"), '缺诊断面行：' + label);
    }
    assert.ok(idxSrc.includes('模块未加载（projection-pipeline.js）'), '投影行须报模块未加载态');
    assert.ok(idxSrc.includes('待本轮（尚未收集）'), '投影行须报「尚未跑过」态');
    assert.ok(idxSrc.includes('模块未加载（cost-forecast.js）'), '预测行须报模块未加载态');
    assert.ok(idxSrc.includes('待本轮（尚未预测）'), '预测行须报「尚未预测」态');
    assert.ok(idxSrc.includes('｜对账不可测：'), '预测行须区分「对账不可测」');

    ok('接线齐全（2 取库口 + 6 提供器 + 管线下传 + 预测随账 + 对账 + 2 诊断行）');
    // 8e 真缺陷已修：内联回落预算路径必须与模块**逐项等价**。
    //    判据口径（v3.208 踩坑留痕）：初版只做两三条文本断言 + 锚一个我猜的收尾 token
    //    （`const _preTrimLen`），结果内联段实际有 21 行、锚点窗口过窄 ⇒ 判据报「未定位」，
    //    看似实现有问题，实为判据写窄了。现改为**真源码枚举**：从 index.js 真源码里切出
    //    内联段、包成函数、与 injection-router.deriveBudget 逐组比对——不依赖文本形态。
    const A1 = '[v3.208.0] 与 injection-router.deriveBudget';
    const A2 = 'const _preTrimLen';
    assert.equal(idxSrc.split(A1).length - 1, 1, '★ 内联等价性锚点须恰中 1 次（0 ⇒ 段被删，>1 ⇒ 判据会锚错）');
    assert.equal(idxSrc.split(A2).length - 1, 1, '★ 收尾锚点须恰中 1 次');
    const _a = idxSrc.lastIndexOf('// [v3.208.0]', idxSrc.indexOf(A1));
    const _b = idxSrc.indexOf(A2, _a);
    let inlineSeg = idxSrc.slice(_a, _b);
    const _cut = inlineSeg.lastIndexOf('\n            }');   // 切掉关闭 else 的括号（保留注释与赋值）
    assert.ok(_cut > 400, '内联段切分失败（实现被改写后判据须同步）');
    inlineSeg = inlineSeg.slice(0, _cut);
    const wrapInline = (src) => new Function('BUDGET_IN', 'TB', 'RS', 'CL',
        'let budget = Number(BUDGET_IN) || 0;\nconst tokenBudget = Number(TB) || 0;\n'
        + 'const reserve = Number(RS) || 0;\nconst _chatLen = Number(CL) || 0;\n' + src + '\nreturn budget;');
    const BASES = [0, -10, 50, 100, 150, 199, 200, 201, 500, 3000, 3000.7, 5000];
    const TBS = [0, 900, 3000, 0.5, 99999, 123.4, 4500, 8000];
    const RSS = [0, 100, 300, 5000, 0.5, 42.7];
    const CLS = [0, 10, 80, 120, 300, 1000];
    const ctxOf = (ad, df) => ({ config: { config: { adaptiveBudget: ad, adaptiveBudgetDecayFloors: df } } });
    let cases = 0, divergent = 0, firstBad = '';
    const sweep = (fn) => {
        for (const base of BASES) for (const tb of TBS) for (const rs of RSS) for (const cl of CLS)
            for (const ad of [true, false]) for (const df of [40, 80]) {
                const got = fn.call(ctxOf(ad, df), base, tb, rs, cl);
                const want = irMod.deriveBudget(base, tb, rs, cl, { adaptive: ad, decayFloors: df });
                cases++;
                if (got !== want) { divergent++; if (!firstBad) firstBad = `base=${base},tb=${tb},rs=${rs},cl=${cl},ad=${ad},df=${df}：内联 ${got} vs 模块 ${want}`; }
            }
    };
    sweep(wrapInline(inlineSeg));
    assert.equal(divergent, 0, '★ 内联回落与模块不等价 ' + divergent + '/' + cases + ' 组，首例：' + firstBad
        + '（预测侧走模块，降级路径会漂移）');
    // 负控制：把该行地板拿掉 ⇒ 同款判据必须翻红（证明上面那条不是恒绿）
    const mutated = inlineSeg.replace('budget = Math.max(200, Math.floor(Number(budget) || 0));', 'budget = Number(budget) || 0;');
    assert.notEqual(mutated, inlineSeg, '★ 负控制锚点未命中：地板行不在内联段里，判据纯度不成立');
    let mCases = 0, mDiv = 0;
    const origFn = wrapInline(inlineSeg), mutFn = wrapInline(mutated);
    for (const base of BASES) for (const tb of TBS) for (const rs of RSS) for (const cl of CLS)
        for (const ad of [true, false]) for (const df of [40, 80]) {
            mCases++;
            const worst = [origFn.call(ctxOf(ad, df), base, tb, rs, cl), mutFn.call(ctxOf(ad, df), base, tb, rs, cl)];
            const want = irMod.deriveBudget(base, tb, rs, cl, { adaptive: ad, decayFloors: df });
            if (worst[0] === want && worst[1] !== want) mDiv++;
        }
    assert.ok(mDiv > 0, '★ 负控制未翻红：拿掉地板后判据仍全绿 ⇒ 判据恒绿，不具区分力');
    ok('parity 枚举 ' + cases + ' 组 0 分歧（负控制 ' + mDiv + '/' + mCases + ' 组翻红，判据有效）');
});

/* ══════════ 9. manifest 声明 + 判据面自防护 ══════════ */
test('v3208 9. manifest 声明 + 判据面自防护', () => {
    for (const mod of ['cost-forecast.js', 'projection-pipeline.js']) {
        assert.ok(mf.extra_js.includes(mod), 'manifest.extra_js 必须声明 ' + mod);
    }
    assert.equal(mf.extra_js.filter((x) => x === 'cost-forecast.js').length, 1, 'cost-forecast.js 只能声明一次');
    assert.equal(mf.extra_js.filter((x) => x === 'projection-pipeline.js').length, 1, 'projection-pipeline.js 只能声明一次');
    assert.equal(mf.extra_js[0], 'ledger-entity.js', '账本实体契约仍须在 extra_js 首位（v3.207 不变量）');
    assert.ok(existsSync(join(ROOT, 'ledger-entity.js')), 'ledger-entity.js 必须仍在');

    // 判据面自防护：断言密度与关键指纹不得缩水
    const asserts = (SELF.match(/assert\./g) || []).length;
    assert.ok(asserts >= 60, '本套件断言数 ' + asserts + ' 少于 60：判据被稀释');
    const lines = SELF.split('\n').length;
    assert.ok(lines >= 220, '本套件行数 ' + lines + ' 少于 220：判据面被抽薄');
    for (const fp of ['runPipeline', 'PROJECTIONS', 'absentList', 'faceValues', 'pipelineLine',
        'forecast', 'reconcile', 'forecastLine', 'overBudgetChars', 'measurable',
        'not-measurable', 'no-provider', 'skipped-by-config', 'LonShaProjectionPipeline', 'LonShaCostForecast']) {
        assert.ok(SELF.includes(fp), '关键指纹缺失：' + fp);
    }
    assert.ok(clSrc.includes('buildCostLedger'), 'cost-ledger 未被误删（对账依赖它）');
    assert.ok(irSrc.includes('deriveBudget') && irSrc.includes('trimToBudget'), 'injection-router 的两个纯函数是对账基准，不得改名/删除');
    ok('断言 ' + asserts + ' 条 / ' + lines + ' 行，指纹齐全，manifest 声明正确');
});

// [v3.209.0 修正] 此处原为裸 `console.log(...)` —— 顶层同步执行、而 node:test 的用例是异步跑的，
//   于是**恒打印「通过 0 / 失败 0」**：退出码是对的，但这行人类可见的汇总与「一行都没跑」同形。
//   它是本版主题的镜像（该可分的读数被压成一态），由本版新增的同款扫描（tests/v3209 组 14）抓到。
process.on('exit', () => {
    console.log('\n[v3.208 投影管线 + 成本预测] 通过 ' + pass + ' / 失败 ' + fail);
    if (fail > 0) process.exitCode = 1;
});