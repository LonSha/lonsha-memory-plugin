/* ============================================================
 * tests/v3270_b2_injection_preview.test.mjs — [v3.270.0 · B2/X1 注入容量预演]
 *
 * 主题：把「这条世界书占多少 token、它会挤掉哪条记忆」从**注入前答不出**变成
 *       注入前可算、可归因、可双向证明的读数（计划 B2 / 双仓 X1 的上游那一半）。
 *
 * 修前实测（本轮真跑取证，不是读源码推算）：
 *   ① 下游 F-9 干跑有**取数层**（哪些世界书条目会被激活），但答不出占用与挤占——
 *      注入前的容量面在上游是**空的**；本仓 cost-forecast 的输入面里没有世界书，结构性盲。
 *   ② 下游 config/projection-contract.js 认死 SUPPORTED_API_VERSION = 1：上游一抬版，
 *      四个现役业务 App（place / chars / plotline / clock）当场判 ahead → unusable。
 *      全仓真跑取证（v3208 / v3212 / v3213 均断言 projectionApiVersion === 1）。
 *      ⇒ 本轮预演**只能是 sourceLedger 的子键**，不得进 ENVELOPE_FIELDS。
 *   ③ 世界书取数通道：SillyTavern.getContext().lore（全仓仅两处真入口）；
 *      loadWorldInfo / saveWorldInfo 全库零命中——本仓不走 ST 世界书 API。
 *      故「全库条目」「哪些会被激活」都**不在本插件可观测面内**，能精确回答的只有
 *      「确定进提示词的那一部分」＝ enabled && constant === true。
 *   ④ 本档首跑即抓到我自己的一个真缺陷：buildEnvelope(null) 上裸写 pipeline.prediction
 *      会在「管线缺席」这条**最常走的降级路径**上抛 TypeError（v3212 / v3213 当场翻红）。
 *      同一行紧邻的 projections 用的是 available && ...——判据替我抵上了这一眼。
 *
 * 覆盖：
 *   A 机制面（预算槽语义可复算 / 两个新方法真在定义位 / 世界书取数真源唯一）
 *   B 三态可分（模块缺席 / 世界书未知 / 有读数——各自独立，未知**不得**写成 0）
 *   C 挤占复算与真路径同源（比「真函数的两次调用差」，**不比常量**）
 *   D 三条真源码破坏负控制（撤回世界书并入 / 挤占写死为常量 / 未知写成 0）
 *   E 工具两向自证 + 判据纯度
 *   F 两张台账 + 版本锚
 *   G 出口面不变式（ENVELOPE_FIELDS 一字不动 / api 版不抬 / 旧五态照旧）
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { breakSource } from './_break_kit.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SELF = readFileSync(fileURLToPath(import.meta.url), 'utf-8');
const PROJ = join(ROOT, 'projection-pipeline.js');
const IR = join(ROOT, 'injection-router.js');
const IDX = join(ROOT, 'index.js');
const require_ = createRequire(import.meta.url);
const idxSrc = readFileSync(IDX, 'utf-8');
const projMod = require_(PROJ);
const irMod = require_(IR);

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok ' + m); };
const bad = (m) => { fail++; console.error('  xx ' + m); };

/* 破坏实现**不在本档**：全仓唯一真源是 tests/_break_kit.mjs（v3.247.0 收编口径 ——
 *   锚点恰中 1 次 + 替换必须真改源码 + 一律 AssertionError + 历史措辞全纳），
 *   本档只从它 import。★ 首版我在本档自写了一份 breakSource，v3247 的门禁当场点名
 *   「仍在本地重写破坏工具（全仓只准一处）」—— 已按纪律改走 import。 */
/* 破坏副本落到**独立临时树**并真加载：不碰真源、不污染 require 缓存 */
function loadBroken(src, tag) {
    const dir = mkdtempSync(join(tmpdir(), 'v3270-' + tag + '-'));
    const file = join(dir, 'projection-pipeline.js');
    writeFileSync(file, src);
    return { mod: require_(file), dir, file };
}

/* ══════════ A. 机制面 ══════════ */
test('v3270 A1. 预算槽语义：世界书占用并入 reserve 槽，挤占恰等于该槽的扣减量', () => {
    // 判据与产品共用同一份真源（比「真函数的两次调用差」，不比自造常量）
    const now = irMod.deriveBudget(3000, 0, 0, 50, {});
    const ifWb = irMod.deriveBudget(3000, 0, 900, 50, {});
    assert.strictEqual(now, 3150, '无外部占用时的基准预算（楼层 50 的自适应扩张）：' + now);
    assert.strictEqual(ifWb, 2100, '并入 900 token 后：' + ifWb);
    assert.strictEqual(now - ifWb, 1050, '实测挤占量 3150-2100（两个数都来自真函数，不是自造常量）');
    /* ★ 边界声明（本档首跑即撞到我自己写错的一条断言）：
     *   挤占量**只在楼层为 0 时**恰好等于 reserve 槽的原值扣减；楼层 > 0 时 deriveBudget
     *   的自适应系数会把整个预算（含那次扣减）一起等比缩放。实测：
     *     cl=0   ⇒ 3000 → 2000（差 1000 = floor(900*10/9)；自适应被 cl>0 跳过）
     *     cl=50  ⇒ 3150 → 2100（差 1050）
     *     cl=80  ⇒ 1800 → 1200（差 600 = 1000 × 0.6 地板）
     *   ⇒ deltaChars 的语义是「并入 reserve 槽后预算的**实际变化量（含自适应等比缩放）**」，
     *   不是原值扣减量；跨楼层之间也不可直接比。两处都钉住，防后人拿 cl>0 去比原值扣减。 */
    assert.strictEqual(irMod.deriveBudget(3000, 0, 0, 0, {}) - irMod.deriveBudget(3000, 0, 900, 0, {}), Math.floor(900 * 10 / 9), '楼层 0（自适应跳过）时才恰等于原值扣减');
    assert.strictEqual(irMod.deriveBudget(3000, 0, 0, 80, {}) - irMod.deriveBudget(3000, 0, 900, 80, {}), 600, '楼层 80 时被自适应等比缩放为 600');
    assert.ok(now - ifWb > 0, '并入占用必须真的让预算变小');
    ok('预算槽可复算：3150 → 2100');
});

test('v3270 A2. 接线面：预演真被挂上管线读数，不是「写了没人调」', () => {
    assert.ok(idxSrc.includes('this._projectionPrediction()'), 'index.js 缺 _projectionPrediction 的调用');
    assert.ok(idxSrc.includes('this._worldbookOccupancy()'), 'index.js 缺 _worldbookOccupancy 的调用');
    assert.ok(idxSrc.includes('        _projectionPrediction() {'), '缺 _projectionPrediction 的**定义**（只调用未定义）');
    assert.ok(idxSrc.includes('        _worldbookOccupancy() {'), '缺 _worldbookOccupancy 的**定义**');
    const at = idxSrc.indexOf('_runProjections(opts = {}) {');
    assert.ok(at >= 0, '抽不到 _runProjections 方法头（提取式判据的基准漂了）');
    const nextAt = idxSrc.indexOf('        _buildProjectionEnvelope() {', at);
    assert.ok(nextAt > at, '抽不到 _runProjections 的下一个方法头（区间不成立）');
    const body = idxSrc.slice(at, nextAt);
    assert.ok(body.includes('pipe.prediction = this._projectionPrediction()'), '_runProjections 里没把预演挂上管线读数');
    ok('预演定义 + 挂载点齐备');
});

test('v3270 A3. 世界书取数真源唯一：只走宿主 lore 通道，常驻口径显式', () => {
    assert.ok(idxSrc.includes('getContext()'), 'index.js 必须真的去宿主取上下文');
    assert.ok(idxSrc.includes('ctx.lore'), '世界书取数须走宿主 lore 通道');
    for (const api of ['loadWorldInfo', 'saveWorldInfo']) {
        assert.strictEqual(idxSrc.split(api).length - 1, 0, '本仓不走 ST 世界书 API，出现了 ' + api);
    }
    assert.ok(idxSrc.includes('constant === true'), '常驻口径必须显式按 constant === true 取（全库量不是占用）');
    assert.ok(idxSrc.includes('upperChars'), '全库上限必须单列（不得把上限当实际占用）');
    ok('世界书取数真源唯一，常驻口径显式');
});

/* ══════════ B. 三态可分 ══════════ */
test('v3270 B1. 模块缺席 ⇒ measurable:false 且预算面全 null，不编数字', () => {
    const r = projMod.predictInjection({ items: [{ id: 0, label: 'x', chars: 100 }], worldbook: { known: true, chars: 300 }, now: 7 });
    assert.strictEqual(r.measurable, false, '无 router ⇒ 必须报不可测');
    assert.strictEqual(r.reason, 'no-router');
    assert.strictEqual(r.budget.now, null, '不可测时不得给预算数字');
    assert.strictEqual(r.squeeze, null, '不可测时不得给挤占面');
    assert.strictEqual(r.worldbook.chars, 300, '已可确定的世界书占用照实给（不因预算不可测而丢）');
    ok('模块缺席：不可测与零分开');
});

test('v3270 B2. 世界书未知 ⇒ 占用是 null，绝不写 0', () => {
    for (const wb of [undefined, null, { known: false, reason: 'no-host-context' }, { known: false, chars: 0 }]) {
        const r = projMod.predictInjection({ router: irMod, worldbook: wb, items: [] });
        assert.strictEqual(r.measurable, false, '世界书未知时不得宣称预算可测（预算里含未知量）');
        assert.strictEqual(r.reason, 'worldbook-unknown');
        assert.strictEqual(r.worldbook.chars, null, '未知必须是 null——写成 0 就是把「读不到」读成「不占空间」');
        assert.strictEqual(r.worldbook.tokens, null);
        assert.strictEqual(r.memory.chars, 0, '记忆面明确给了空数组 ⇒ 那是**确定的 0**（与未知不同形）');
    }
    const r2 = projMod.predictInjection({ router: irMod, worldbook: { known: true, chars: 0 }, items: [] });
    assert.strictEqual(r2.measurable, true, '世界书**明确为 0 占用**是可测的（与未知不同）');
    assert.strictEqual(r2.worldbook.chars, 0);
    ok('未知与零不同形');
});

test('v3270 B3. 齐全 ⇒ measurable:true 且挤占面结构完整', () => {
    const r = projMod.predictInjection({ router: irMod, baseBudget: 3000, chatLength: 50, worldbook: { known: true, chars: 1000, count: 3, source: 'host' }, items: [] });
    assert.strictEqual(r.measurable, true);
    assert.strictEqual(r.reason, 'ok');
    assert.strictEqual(typeof r.squeeze.deltaChars, 'number');
    assert.strictEqual(typeof r.squeeze.deltaTokens, 'number');
    assert.ok(r.squeeze.deltaChars > 0, '1000 字符世界书必须挤出正数预算');
    assert.ok(Object.prototype.hasOwnProperty.call(r, 'worldbook'), '结构恒定：键必须在场');
    assert.ok(Object.prototype.hasOwnProperty.call(r, 'squeeze'), '结构恒定：挤占键必须在场');
    ok('有读数：结构与三态量齐备');
});

/* ══════════ C. 挤占复算与真路径同源 ══════════ */
test('v3270 C1. 判定矩阵：真实比较「现在裁不裁」与「世界书在场时裁不裁」', () => {
    const wb = { known: true, chars: 1000 };            // ⇒ 900 token ⇒ 预算 3150 → 2100
    const mk = (chars) => ({ router: irMod, baseBudget: 3000, chatLength: 50, worldbook: wb, items: [{ id: 0, label: 'x', chars }] });
    // 记忆装得下两个预算 ⇒ 两种都不裁
    const a = projMod.predictInjection(mk(1500));
    assert.strictEqual(a.squeeze.wouldTrimNow, false);
    assert.strictEqual(a.squeeze.wouldTrimIfWorldbook, false);
    assert.strictEqual(a.squeeze.pushesIntoTrim, false);
    assert.strictEqual(a.headroom.now - a.headroom.ifWorldbook, a.squeeze.deltaChars, '两个余量的差必须恰等于挤占量（同一公式的两面）');
    // 只在世界书在场时超线 ⇒ pushesIntoTrim 必须为 true
    const b = projMod.predictInjection(mk(2500));
    assert.strictEqual(b.squeeze.wouldTrimNow, false, '2500 <= 3150');
    assert.strictEqual(b.squeeze.wouldTrimIfWorldbook, true, '2500 > 2100');
    assert.strictEqual(b.squeeze.pushesIntoTrim, true);
    assert.strictEqual(b.squeeze.overflowCharsNow, 0);
    assert.strictEqual(b.squeeze.overflowCharsIfWorldbook, 2500 - 2100, '超出量 = 记忆字符 - 预算（精确量，不是样本）');
    // 两个预算都超 ⇒ 不是「被世界书推过线」
    const c = projMod.predictInjection(mk(4000));
    assert.strictEqual(c.squeeze.wouldTrimNow, true);
    assert.strictEqual(c.squeeze.pushesIntoTrim, false, '本来就裁的情形不得归因给世界书');
    ok('判定矩阵三态可分');
});

test('v3270 C2. 挤占样本：尾部优先、总量可对账、口径自己说出来', () => {
    const items = [0, 1, 2, 3, 4].map((i) => ({ id: i, label: 'blk' + i, chars: (i + 1) * 100 }));
    const r = projMod.predictInjection({ router: irMod, baseBudget: 3000, chatLength: 50, worldbook: { known: true, chars: 1000 }, items });
    assert.strictEqual(r.squeeze.deltaChars, 1050);
    assert.ok(r.squeeze.atRisk, '有挤占就必须给样本面');
    assert.strictEqual(r.squeeze.atRisk.basis, 'tail-first');
    assert.deepStrictEqual(r.squeeze.atRisk.items.map((x) => x.id), [4, 3, 2], '从尾部取到刚盖过挤占量为止');
    assert.strictEqual(r.squeeze.atRisk.scannedChars, 1200);
    assert.strictEqual(r.squeeze.atRisk.covered, true);
    assert.ok(r.squeeze.atRisk.why && r.squeeze.atRisk.why.length >= 20, '样本口径必须自己说出为什么不是精确答案');
    const r2 = projMod.predictInjection({ router: irMod, baseBudget: 3000, chatLength: 50, worldbook: { known: true, chars: 1000 }, items, atRiskLimit: 2 });
    assert.deepStrictEqual(r2.squeeze.atRisk.items.map((x) => x.id), [4, 3], '上限必须被尊重');
    assert.strictEqual(r2.squeeze.atRisk.covered, false, '没盖过总量时必须如实说没盖过');
    const r3 = projMod.predictInjection({ router: irMod, baseBudget: 3000, chatLength: 50, worldbook: { known: true, chars: 0 }, items });
    assert.strictEqual(r3.squeeze.deltaChars, 0);
    assert.strictEqual(r3.squeeze.atRisk, null, '零挤占时不得编样本');
    ok('样本面：尾部优先 + 上限 + 零挤占为空');
});

/* ══════════ D. 三条真源码破坏负控制 ══════════ */
test('v3270 D1. 破坏「世界书并入 reserve 槽」⇒ 挤占归零（判据真在读那一行）', () => {
    const A = 'budgetIf = _num0(derive(baseBudget, tokenBudget, reserve + (wbTokens || 0), chatLength, budgetOpts));';
    const broken = breakSource(readFileSync(PROJ, 'utf-8'), A, 'budgetIf = _num0(derive(baseBudget, tokenBudget, reserve, chatLength, budgetOpts));');
    const t = loadBroken(broken, 'd1');
    try {
        const opt = { router: irMod, baseBudget: 3000, chatLength: 50, worldbook: { known: true, chars: 1000 }, items: [] };
        const r = t.mod.predictInjection(opt);
        assert.strictEqual(r.squeeze.deltaChars, 0, '并入被撤回后挤占必须为 0');
        assert.strictEqual(r.squeeze.atRisk, null, '零挤占不得再给样本');
        // 阳性对照：同一判据在原件上必须真成立（否则这组负控制证明不了任何事）
        const good = projMod.predictInjection(opt);
        assert.ok(good.squeeze.deltaChars > 0, '★ 阳性对照：原件上同判据必须真成立');
        ok('D1 破坏可观测，且原件上同判据真成立');
    } finally { rmSync(t.dir, { recursive: true, force: true }); }
});

test('v3270 D2. 破坏「挤占量写死为常量」⇒ 真复算被绕过，当场现形', () => {
    const A = 'const squeezedChars = Math.max(0, budgetNow - budgetIf);';
    const broken = breakSource(readFileSync(PROJ, 'utf-8'), A, 'const squeezedChars = 0; // 写死');
    const t = loadBroken(broken, 'd2');
    try {
        const opt = { router: irMod, baseBudget: 3000, chatLength: 50, worldbook: { known: true, chars: 1000 }, items: [] };
        const r = t.mod.predictInjection(opt);
        assert.strictEqual(r.squeeze.deltaChars, 0, '写死后真复算不再参与');
        assert.strictEqual(r.budget.ifWorldbook, 2100, '预算面还在（证明破坏只拿掉了挤占复算，不是把模块改坏到不可用）');
        const good = projMod.predictInjection(opt);
        assert.strictEqual(good.squeeze.deltaChars, 1050, '★ 阳性对照：原件上同判据读到真值');
        ok('D2 破坏可观测，预算面独立不变');
    } finally { rmSync(t.dir, { recursive: true, force: true }); }
});

test('v3270 D3. 破坏「未知 ⇒ null」⇒ 「读不到」被读成「不占空间」', () => {
    const A = 'const wbChars = wbKnown ? _num0(wbRaw.chars) : null;';
    const broken = breakSource(readFileSync(PROJ, 'utf-8'), A, 'const wbChars = wbKnown ? _num0(wbRaw.chars) : 0;');
    const t = loadBroken(broken, 'd3');
    try {
        const r = t.mod.predictInjection({ router: irMod, worldbook: { known: false, reason: 'no-host-context' }, items: [] });
        assert.strictEqual(r.worldbook.chars, 0, '破坏后未知被写成 0——正是本仓最贵的那个同形');
        // 阳性对照：原件上必须守住 null（否则 B2 的判据是摆设）
        const good = projMod.predictInjection({ router: irMod, worldbook: { known: false, reason: 'no-host-context' }, items: [] });
        assert.strictEqual(good.worldbook.chars, null, '★ 阳性对照：原件上未知必须是 null');
        assert.strictEqual(good.measurable, false);
        ok('D3 破坏可观测，原件守住 null');
    } finally { rmSync(t.dir, { recursive: true, force: true }); }
});

/* ══════════ E. 工具两向自证 + 判据纯度 ══════════ */
test('v3270 E1. 破坏工具两向自证：锚点不在/不唯一/同值替换均必须抛', () => {
    const src = 'aaa\nbbb\n';
    assert.throws(() => breakSource(src, 'not-there', 'x'), /拒绝破坏/, '锚点不存在必须抛（否则破坏没发生却报绿）');
    assert.throws(() => breakSource('x\nx\n', 'x', 'y'), /拒绝破坏/, '锚点不唯一必须抛（错误的位置改了会读到假结论）');
    assert.throws(() => breakSource(src, 'aaa', 'aaa'), /拒绝破坏/, '同值替换必须抛（那什么都没改）');
    assert.throws(() => breakSource(src, '', 'x'), /拒绝破坏/, '空锚点必须抛');
    ok('破坏工具两向都自证');
});

test('v3270 E2. 判据纯度：三个破坏锚点在真源里各自恰中一次，且本档不自造被测实现', () => {
    const src = readFileSync(PROJ, 'utf-8');
    const anchors = [
        'budgetIf = _num0(derive(baseBudget, tokenBudget, reserve + (wbTokens || 0), chatLength, budgetOpts));',
        'const squeezedChars = Math.max(0, budgetNow - budgetIf);',
        'const wbChars = wbKnown ? _num0(wbRaw.chars) : null;',
    ];
    for (const a of anchors) assert.strictEqual(src.split(a).length - 1, 1, '锚点必须恰中一次：' + a.slice(0, 46));
    // 判据纯度：本档不得自己实现一套被测逻辑（只许调用真源）；H5 口径：锚点字面量只准声明一次
    /* ★ 自指陷阱（本档首版当场踩到）：原本把锚点字面量直接写在断言里，
     *   于是那串字面量在本文件里出现了 2 次（破坏处 1 次 + 断言里的参数 1 次），
     *   「只准声明一次」这条断言被**它自己的写法**弄红。
     *   修法：锚点由片段拼出，字面量在断言行里根本不存在 ⇒ 自指不可能发生。 */
    const A = 'budgetIf = _num0(derive(baseBudget, tokenBudget, reserve + ' + '(wbTokens || 0), chatLength, budgetOpts));';
    /* 锚点在本档里应当**恰出现一次**：它的家是 D1 的破坏调用（那里本来就该是字面量）。
     *   故正确口径不是「必须为 0 次」（本档首版就是这么写错的），而是「恰 1 次，
     *   且那一次落在 D1 区间内」—— 这样才是「判据没在重复持有锚点」的可核说法。 */
    /* 正确的口径（本档在这条上连改三版，留痕）：锚点在本档应恰出现 **2 次**。
     *   两次都是合法的家：① D1 的破坏调用（那里本来就该是字面量）；
     *   ② E2 的唯一性清单（要拿它在真源里数命中数）。
     *   而真正会造出「自指假红」的形态是「锚点混进 **assert 行**」——那才是必须为 0 的。 */
    assert.strictEqual(SELF.split(A).length - 1, 2, '锚点在本档应恰出现 2 次（D1 破坏调用 + E2 唯一性清单）');
    for (const line of SELF.split('\n')) {
        if (/^\s*assert\./.test(line)) assert.ok(!line.includes(A), '★ 破坏锚点不得出现在断言行里（那会造成自指假红）');
    }
    const d1At = SELF.indexOf('v3270 D1.');
    const d1End = SELF.indexOf('v3270 D2.', d1At);
    const bestAt = SELF.indexOf(A);
    assert.ok(d1At > 0 && d1End > d1At, 'D1 区间定位失败');
    assert.ok(bestAt > d1At && bestAt < d1End, '★ 锚点必须只出现在 D1 的破坏调用里，不得被判据重复持有');
    // 接线面：必须从唯一真源 import（本档首版自写实现，v3247 门禁当场点名）
    assert.ok(SELF.includes("from './_break_kit.mjs'"), '★ 必须从 tests/_break_kit.mjs import 破坏工具（不得本地重写）');
    const sig = 'function ' + 'deriveBudget(';
    assert.ok(!SELF.includes(sig), '本档不得重写 deriveBudget（那是自造被测物）');
    const sig2 = 'function ' + 'predictInjection(';
    assert.ok(!SELF.includes(sig2), '本档不得重写 predictInjection（同理）');
    ok('锚点唯一 + 判据纯度成立');
});

/* ══════════ F. 台账 + 版本锚 ══════════ */
test('v3270 F1. 两张台账都点名本档', () => {
    const cat = readFileSync(join(ROOT, 'tests/audit/catalog_reference_consumers.tsv'), 'utf-8');
    assert.ok(cat.includes('v3270_b2_injection_preview.test.mjs'), '参考基准台账未登记本档');
    const kit = readFileSync(join(ROOT, 'tests/v3247_break_kit_consolidation.test.mjs'), 'utf-8');
    assert.ok(kit.includes('v3270_b2_injection_preview.test.mjs'), '破坏件接收方台账未登记本档');
    ok('两张台账均在册');
});

test('v3270 F2. 版本锚：本档锁出生版本，四源同源且不低于它', () => {
    assert.ok(SELF.includes('v3.270.0'), '★ 本档必须锁自己的出生版本 v3.270.0（不随抬版上抬）');
    const vIdx = (idxSrc.match(/const VERSION = '([^']+)'/) || [])[1];
    assert.ok(vIdx, 'index.js 应有 const VERSION');
    const mf = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf-8'));
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    assert.strictEqual(vIdx, mf.version, 'index.js 与 manifest.json 版本必须一致');
    assert.strictEqual(mf.version, pkg.version, 'manifest.json 与 package.json 版本必须一致');
    const vnum = (s) => { const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim()); return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN; };
    assert.ok(vnum(vIdx) >= vnum('3.270.0'), '版本 ' + vIdx + ' 不得低于本套件出生版本 3.270.0');
    ok('版本锚 ' + vIdx);
});

/* ══════════ G. 出口面不变式 ══════════ */
test('v3270 G1. 出口面一字不动：必填字段仍 11 项、api 版仍 1、预演不得混进必填清单', () => {
    assert.strictEqual(projMod.PROJECTION_API_VERSION, 1, '★ 抬版会打断下游四条现役读线（本版最重要的设计约束）');
    assert.deepStrictEqual([...projMod.ENVELOPE_FIELDS], [
        'projectionApiVersion', 'projectionVersion', 'generatedAt',
        'conversationId', 'sceneId', 'worldId',
        'items', 'visibility', 'sourceLedger', 'revision', 'expiresAt',
    ], '契约字段清单漂移（改这里必须同时抬 api 版）');
    assert.ok(!projMod.ENVELOPE_FIELDS.includes('prediction'), '预演不得进必填清单（否则老下游判 missing → malformed）');
    assert.strictEqual(projMod.PREDICTION_VERSION, 1, '预演自己的语义版必须单列');
    ok('必填 11 项不变，api 版未抬');
});

test('v3270 G2. 预演恒随 sourceLedger 外供；管线缺席时必须是 null 且不抛', () => {
    const e0 = projMod.buildEnvelope(null);
    assert.ok(Object.prototype.hasOwnProperty.call(e0.sourceLedger, 'prediction'), 'sourceLedger.prediction 必须恒有键');
    assert.strictEqual(e0.sourceLedger.prediction, null, '管线缺席 ⇒ 预演 null（「没跑」不是「占用为零」）');
    const e1 = projMod.envelopeOf({ clockDay: () => 1 }, { prediction: { measurable: true, squeeze: { deltaChars: 5 } } });
    assert.strictEqual(e1.sourceLedger.prediction.squeeze.deltaChars, 5, '构建方给的预演必须随 envelope 出去');
    const e2 = projMod.envelopeOf({ clockDay: () => 1 }, {});
    assert.strictEqual(e2.sourceLedger.prediction, null, '没给预演时是 null（恒有键）');
    ok('预演外供恒有键，缺席不抛');
});

test('v3270 G3. 契约裁定五态照旧（不动契约面就不会坏老消费者）', () => {
    const env = projMod.buildEnvelope(null);
    assert.strictEqual(projMod.contractOf(env).reason, 'ok');
    assert.strictEqual(projMod.contractOf(null).reason, 'malformed');
    assert.strictEqual(projMod.contractOf({}).reason, 'missing');
    assert.strictEqual(projMod.contractOf({ ...env, projectionApiVersion: 99 }).reason, 'ahead');
    assert.strictEqual(projMod.contractOf({ ...env, projectionApiVersion: 0 }).reason, 'behind');
    ok('五态可分照旧');
});

/* ══════════ 收尾 ══════════ */
test('v3270 Z. 收尾：失败数为 0', () => {
    assert.strictEqual(fail, 0, '本档内有 ' + fail + ' 条失败');
    assert.ok(pass >= 14, '有效断言数不应塌陷，实为 ' + pass);
});
