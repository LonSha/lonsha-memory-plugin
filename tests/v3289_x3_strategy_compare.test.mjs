/* ================================================================
 * v3289_x3_strategy_compare.test.mjs — [v3.289.0 · X3] 注入策略对照的**成对判据**
 *
 * 【为什么单列一档（而不是并进 v3270 的 X1 档）】
 *   X1 的面是「**单套**配置的注入容量预演」；X3 的面是「**多套**配置的对照」。
 *   两者可独立演进（各自的 `*_VERSION` 也是分列的），判据必须跟面走：
 *   把 X3 的新增断言塞进 X1 档，会让「X1 挂了」与「X3 挂了」同形 —— 归因立刻变差。
 *
 * 【本档拦的是什么（逐条对应 X3 验收原文）】
 *   A 结构面    —— 出口在场、`applied` 恒 false（**不应用任何方案**）、三档来源字段齐全
 *   B1 冻结候选 —— 多套 plan 拿到**同一份**候选（基数不随 plan 变）⇒ 对照才有效
 *   B2 单一真源 —— 每套读数走同一个 `predictInjection`（摘掉它 ⇒ 本档场景失据）
 *   C1 禁用不计 —— `disabled` / `active:false` 的项不进候选合计，且计入 `excluded` 可解释
 *   C2 逐项差   —— `deltaBudgetNow` / `atRiskDeltaVsBase` 与基准逐项可复算
 *   D1 三档来源 —— dryrun ⇒ exact / constant ⇒ constant-only / 缺自述 ⇒ unknown
 *   D2 范围有限 —— 非 exact 时 `scope.limited` 必须为真且带原因（不得冒充完整激活）
 *   E  不可测≠通过 —— 无可测方案时**不给对照结论**且 `diff` 为 null
 *   F  真源码破坏 —— 摘掉「同一份候选」这一条 ⇒ B1 场景不再成立（归因自证）
 *   G  自防护 + 当版锚点
 * ================================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PIPE_REL = 'projection-pipeline.js';
const readRoot = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const pipeSrc = () => readRoot(PIPE_REL);
const NL = String.fromCharCode(10);
const ok = (m) => console.log('  OK ' + m);

/* 载入真源（IIFE 挂 window.LonShaProjectionPipeline）。用 vm 而非 require：判据要能对**副本**取值，
   require 有缓存，破坏副本取不到（本仓「判据要能在副本上跑」的既有坑）。
   【坑】真源尾部挂载判定是 `typeof window !== 'undefined'` ⇒ 沙箱**必须**提供 window（给 module 也行，
   但 window 是主挂点）；早期版本把 window 显式设成 undefined ⇒ 挂载分支全不命中 ⇒ api() 恒 undefined。 */
function loadPipe(src) {
    const sandbox = { console };
    sandbox.window = {};
    sandbox.globalThis = sandbox;
    const ctx = vm.createContext(sandbox);
    vm.runInContext(src, ctx, { filename: PIPE_REL });
    return sandbox.window.LonShaProjectionPipeline;
}
const api = () => loadPipe(pipeSrc());

/* ---- 破坏锚点（逐字取自真源，禁改；本档须逐字持有） ---- */
/* 锚点①：候选**同一份**（B1 的根据）。含反斜杠/引号风险低，用普通串即可。 */
const A_SAME_ITEMS = "                items: eligible,";
/* 锚点②：走同一个 predictInjection（B2 的根据）。 */
const A_DELEGATE = "            try { r = predictInjection(callOpts); } catch (e) { threw = String((e && e.message) || e); }";
/* 锚点③：禁用/非激活剔除（C1 的根据）。 */
const A_EXCLUDE_DISABLED = "                if (it.disabled === true) { excluded.disabled++; excluded.chars += Math.max(0, _num0(it.chars)); continue; }";
/* 锚点④：三档来源判定（D1 的根据）。 */
const A_ACTIVATION = "        if (srcKind === 'dryrun' || srcKind === 'verified') activation = 'exact';";
/* 锚点⑤：不可测时不给结论（E 的根据）。 */
const A_NO_MEASURABLE = "            out.why = '所有方案都不可测（' + results.map((r) => r.id + ':' + r.reason).join(' / ')";
/* 自防护锚点：本档标题（自身非空的自证）。 */
const A_SELF_HEAD = 'v3289_x3_strategy_compare';

const baseItems = () => [
    { id: 'a', chars: 100 },
    { id: 'b', chars: 200 },
    { id: 'off', chars: 50, disabled: true },
];
const cmpOpts = (over) => Object.assign({
    derive: (b, t, r, c) => b - r,
    items: baseItems(),
    itemsSource: { kind: 'dryrun' },
    worldbook: { known: true, chars: 300, count: 3 },
    baseBudget: 1000, reserve: 0, tokenBudget: 0, chatLength: 0,
    plans: [{ id: 'cur', baseBudget: 1000 }, { id: 'tight', baseBudget: 500 }],
    now: 1,
}, over || {});

test('v3289 A. 出口在场、不应用任何方案、结构字段齐全', () => {
    const P = api();
    assert.equal(typeof P.compareStrategies, 'function', 'compareStrategies 必须在出口面');
    assert.equal(P.COMPARE_VERSION, 1, '对照读数结构版本');
    /* 不改既有面：PROJECTION_API_VERSION 不因新增出口而抬（原文「保留 v1 消费兼容」）。 */
    assert.equal(P.PROJECTION_API_VERSION, 1, '不得抬 projection API 版本');
    const r = P.compareStrategies(cmpOpts());
    assert.equal(r.applied, false, '对照**不应用**任何方案');
    assert.equal(typeof r.applyHint, 'string');
    assert.ok(r.applyHint.length > 0, '须说明「应用走显式配置动作」');
    for (const k of ['activation', 'activationWhy', 'scope', 'plans', 'diff']) {
        assert.ok(Object.prototype.hasOwnProperty.call(r, k), '结构字段缺: ' + k);
    }
    ok('出口 + applied:false + 结构齐全（API 版本未抬）');
});

test('v3289 B1. 冻结同一候选：多套 plan 的候选基数一致', () => {
    const P = api();
    /* 源码面：候选**同一份**（每套 plan 复用同一个 `eligible`，不按 plan 重取）。 */
    assert.equal(pipeSrc().split(A_SAME_ITEMS).length - 1, 1,
        '真源须恰有一处「候选同一份」落点（实 ' + (pipeSrc().split(A_SAME_ITEMS).length - 1) + '）');
    /* 两份 items 引用若被某套 plan 改写，基数会分叉 —— 这里逐 plan 核同一份。 */
    const r = P.compareStrategies(cmpOpts({
        plans: [{ id: 'p1', baseBudget: 900 }, { id: 'p2', baseBudget: 600 }, { id: 'p3', baseBudget: 300 }],
    }));
    assert.equal(r.scope.eligibleItems, 2, '过滤后候选基数（禁用项已剔除）');
    for (const p of r.plans) {
        assert.equal(p.raw.memory.items, 2, '每套 plan 的候选条数须**同一份**（' + p.id + '）');
        assert.equal(p.raw.memory.chars, 300, '每套 plan 的候选字符合计须**同一份**（' + p.id + '）');
    }
    /* 预算不同 ⇒ 读数必须**不同**（否则「对照」是摆设：全都一样说明没真跑）。 */
    const budgets = r.diff.rows.map((x) => x.budgetNow);
    assert.equal(new Set(budgets).size, 3, '三套预算须给出三个**不同**读数（实 ' + budgets.join(',') + '）');
    ok('候选冻结（3 套同基数）+ 读数随配置真变（' + budgets.join('/') + '）');
});

test('v3289 B2. 单一真源：每套读数走同一个 predictInjection', () => {
    const src = pipeSrc();
    const hits = src.split(A_DELEGATE).length - 1;
    assert.equal(hits, 1, '对照必须**恰有一处**委派到 predictInjection（实 ' + hits + '）');
    /* 交叉核：对照的读数与直接调 predictInjection **逐值相等**（不是另算一遍）。 */
    const P = api();
    const o = cmpOpts();
    const cmp = P.compareStrategies(o);
    const direct = P.predictInjection({
        derive: o.derive, items: o.items.filter((it) => !it.disabled && it.active !== false),
        worldbook: o.worldbook, baseBudget: 1000, reserve: 0, tokenBudget: 0, chatLength: 0, now: 1,
        strategy: 'balanced',
    });
    assert.equal(cmp.diff.rows[0].budgetNow, direct.budget.now, '对照首套读数须等于直接预演');
    assert.equal(cmp.diff.rows[0].squeezeChars, direct.squeeze.deltaChars, '挤占读数须同源');
    ok('单一真源：委派 1 处 + 与直接预演逐值相等');
});

test('v3289 C1. 禁用/非激活不计，且排除量可解释', () => {
    const P = api();
    /* 源码面：剔除是**直判**（不包一层可漂移的抽象）——两个直判行须各有其一。 */
    assert.equal(pipeSrc().includes(A_EXCLUDE_DISABLED), true,
        '真源须有「禁用项直判剔除」落点（C1 的根据）');
    const r = P.compareStrategies(cmpOpts({
        items: [{ id: 'a', chars: 100 }, { id: 'd', chars: 70, disabled: true },
            { id: 'i', chars: 30, active: false }, { id: 'b', chars: 200 }],
    }));
    assert.equal(r.scope.rawItems, 4, '原始候选条数');
    assert.equal(r.scope.eligibleItems, 2, '剔除后条数');
    assert.equal(r.scope.excluded.disabled, 1, '禁用项计数');
    assert.equal(r.scope.excluded.inactive, 1, '非激活项计数');
    assert.equal(r.scope.excluded.chars, 100, '被排除字符合计（70+30）');
    assert.equal(r.plans[0].raw.memory.chars, 300, '缓存字符合计只含 a+b');
    ok('禁用/非激活已剔除（4→2）+ 排除量可解释（chars=100）');
});

test('v3289 C2. 逐项差与基准可复算', () => {
    const P = api();
    const r = P.compareStrategies(cmpOpts());
    const [cur, tight] = r.diff.rows;
    assert.equal(r.diff.baseId, 'cur', '基准 = 第一套');
    assert.equal(cur.deltaBudgetNow, 0, '基准自比差为 0');
    assert.equal(tight.deltaBudgetNow, -500, 'tight 相对基准差 = -500（可复算）');
    assert.equal(cur.deltaSqueezeChars, 0, '基准挤占自比差 0');
    /* 世界书挤占**不随预算变**（世界书占用并入 reserve，与 base 无关）⇒ 差须为 0。 */
    assert.equal(tight.deltaSqueezeChars, 0, '挤占不随预算变（世界书占用与 base 无关）');
    ok('逐项差可复算（预算差 -500 / 挤占差 0）');
});

test('v3289 D1. 三档来源：dryrun⇒exact / constant⇒constant-only / 缺自述⇒unknown', () => {
    const P = api();
    /* 源码面：三档判定落点在真源（D1 的根据）。 */
    assert.equal(pipeSrc().includes(A_ACTIVATION), true, '真源须有「dryrun/verified ⇒ exact」落点');
    const cases = [
        [{ kind: 'dryrun' }, 'exact'],
        [{ kind: 'verified' }, 'exact'],
        [{ kind: 'constant' }, 'constant-only'],
        [{ kind: 'whatever' }, 'unknown'],
        [undefined, 'unknown'],
    ];
    for (const [src, want] of cases) {
        const r = P.compareStrategies(cmpOpts({ itemsSource: src }));
        assert.equal(r.activation, want,
            '来源 ' + JSON.stringify(src) + ' ⇒ ' + want + '（实 ' + r.activation + '）');
    }
    ok('三档来源判定正确（dryrun/verified/constant/other/缺自述）');
});

test('v3289 D2. 非 exact 时范围有限须显式标出', () => {
    const P = api();
    for (const [src, limited] of [[{ kind: 'dryrun' }, false], [{ kind: 'constant' }, true], [undefined, true]]) {
        const r = P.compareStrategies(cmpOpts({ itemsSource: src }));
        assert.equal(r.scope.limited, limited,
            JSON.stringify(src) + ' ⇒ limited=' + limited + '（实 ' + r.scope.limited + '）');
        if (limited) assert.ok(r.scope.limitedWhy.length > 0, '范围有限须带原因');
        else assert.equal(r.scope.limitedWhy, '', 'exact 时无「范围有限」原因');
    }
    ok('范围有限标记与原因随三档正确变化');
});

test('v3289 E. 不可测 ⇒ 不给对照结论（不可测≠通过）', () => {
    const P = api();
    /* 源码面：不可测时的**归因**落点在真源（E 的根据，须逐字持有）。 */
    assert.equal(pipeSrc().includes(A_NO_MEASURABLE), true, '真源须有「所有方案都不可测」归因落点');
    /* 无 router 且无 derive ⇒ predictInjection 不可测 ⇒ 对照须如实拒绝给结论。 */
    const r = P.compareStrategies({ items: baseItems(), worldbook: { known: true, chars: 300, count: 3 }, plans: [{ id: 'x' }] });
    assert.equal(r.diff, null, '无可测方案时不得给出对照');
    assert.ok(/不可测/.test(r.why), '原因须点明不可测（实：' + r.why + '）');
    /* 无 items ⇒ 无对照基数（不得把「未知」读成「没有」）。 */
    const r2 = P.compareStrategies({ derive: (b, t, rr) => b - rr, itemsSource: { kind: 'dryrun' }, plans: [{ id: 'x' }] });
    assert.equal(r2.scope.rawItems, null, '无候选时基数须为 null（不是 0）');
    assert.ok(/无对照基数|未知/.test(r2.why), '须点明无基数');
    /* 无 plans ⇒ 不给结论。 */
    const r3 = P.compareStrategies(cmpOpts({ plans: [] }));
    assert.equal(r3.diff, null, '无方案不给对照');
    ok('三态缺席各自归因（无 router / 无候选 / 无方案）');
});

test('v3289 F. 真源码破坏：摘掉「同一份候选」⇒ B1 场景实测失效', () => {
    const src = pipeSrc();
    assert.equal(src.split(A_SAME_ITEMS).length - 1, 1, '锚点须在真源恰中 1 次');
    /* 【为什么这样破坏】`predictInjection` 只 `.filter()` 读候选、不回写传入数组
     *   ⇒ 把 `eligible` 换成 `eligible.slice()`（换引用不换内容）在**读数面不可观测**，
     *     那种破坏只能靠文本判定，属「写死成模拟常量」型假绿。
     *   真正可观测的破坏是**破坏「同一份」这个口径本身**：让候选随 plan 现算
     *   （按该 plan 的 baseBudget 截断条数）⇒ 两套 plan 的候选基数就会实测分叉，
     *   B1 的「每套 plan 基数一致」在破坏版上**真判据真的失败**（不是靠文本看出）。 */
    const broken = src.replace(A_SAME_ITEMS,
        '                items: eligible ? eligible.filter((it, ix) => ix < Math.max(1, Math.round((_num0((p.baseBudget === undefined) ? o.baseBudget : p.baseBudget)) / 400))) : eligible,');
    assert.notEqual(broken, src, '破坏须可观测改动');
    assert.equal(broken.includes(A_SAME_ITEMS), false, '破坏后锚点须消失（锚点纯度自证）');
    const P = loadPipe(broken);
    const r = P.compareStrategies(cmpOpts({
        plans: [{ id: 'p1', baseBudget: 900 }, { id: 'p2', baseBudget: 400 }],
    }));
    /* 真判据（与 B1 同款：每套 plan 的候选基数须同一份）——在破坏版上须**真的失败**。 */
    const counts = r.plans.map((p) => p.raw.memory.items);
    let caught = null;
    try {
        assert.equal(new Set(counts).size, 1, '每套 plan 的候选条数须同一份');
    } catch (e) { caught = e; }
    assert.ok(caught, '破坏版上 B1 的真判据必须失败（实见基数：' + counts.join('/') + '）');
    /* 反向对照：原版上同一条真判据必须通过（不是恒挂的假判据）。 */
    const r0 = api().compareStrategies(cmpOpts({
        plans: [{ id: 'p1', baseBudget: 900 }, { id: 'p2', baseBudget: 400 }],
    }));
    assert.equal(new Set(r0.plans.map((p) => p.raw.memory.items)).size, 1,
        '原版上同款真判据须通过（破坏前不得已红）');
    /* 且破坏可被**读数面**看出：两套基数真的分叉了（p2 预算 400 ⇒ 截到 1 条）。 */
    assert.notEqual(r0.plans[1].raw.memory.items, r.plans[1].raw.memory.items,
        '破坏须在读数面留下可见差异（原版 ' + r0.plans[1].raw.memory.items
        + ' / 破坏版 ' + r.plans[1].raw.memory.items + '）');
    assert.equal(r.plans[1].raw.memory.items, 1, '破坏版 p2 候选被截断到 1 条（可见分叉）');
    ok('真源码破坏：候选口径随 plan 现算 ⇒ B1 真判据实测失败（原版通过作反向对照）');
});

test('v3289 G. 自防护 + 当版锚点（V4 计数形态）', () => {
    const self = readRoot(path.join('tests', 'v3289_x3_strategy_compare.test.mjs'));
    assert.ok(self.includes(A_SELF_HEAD), '本档须持有自防护锚点');
    assert.ok(self.length > 4000, '本档自身不得被清空（实 ' + self.length + ' 字符）');
    const pkgRaw = JSON.parse(readRoot('package.json')).version;
    const manRaw = JSON.parse(readRoot('manifest.json')).version;
    const SQ = String.fromCharCode(39);
    assert.equal(pkgRaw, manRaw, 'package.json 与 manifest.json 版本一致');
    assert.ok(readRoot('index.js').includes('const VERSION = ' + SQ + pkgRaw + SQ + ';'),
        'index.js 版本常量与 package.json 一致');
    const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
    assert.ok(vnum(pkgRaw) >= vnum('3.289.0'), '版本不得回退到本档出生版本之前，当前 ' + pkgRaw);
    ok('自防护 + 当版锚点 ' + pkgRaw);
});
