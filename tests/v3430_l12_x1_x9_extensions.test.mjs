// tests/v3430_l12_x1_x9_extensions.test.mjs — v3.430.0 L12-X1/X2/X3/X4/X5/X9：六项拓展的**产品面判据**
//
// 主题：本版的六项拓展（组织制度 / 意义演化 / 前史作者工具 / 裁决影响回放 / 跨仓回执链 / 沉默可解释）
//   不是「内核函数已存在」就算交付 —— 现场是「内核建好了、产品面一次都没进去过」
//   （计划原文：`grep -c institutional-memory index.js` = 0；`symbolic-evolution` = 0）。
//   本档把每一项的**验收语句**翻译成可复算的读数，并在真宿主上真跑。
//
// 【本档钉什么】
//   A 结构面（六面全在册 + 宿主桩是委派不是重实现 + 三态缺席构造器）
//   B 真宿主健康态（真装载 245 文件零失败，六面逐条可调、writesNothing 自证、四态理由互不相同）
//   C 逐项验收（X1 四类来源与传闻不投票 / X2 多义并列+来源+人物差异+反例单列 / X3 前史三态+只读+预览）
//   D 逐项验收（X4 四裁决下游不同形+秘密排除计数+未受影响不重算 / X5 四态入链+缺席不伪造+sessionOnly）
//   E 逐项验收（X9 四问 + surfacing/notFound 分桶 + 静音不删除且可逆 + 两条真源各自生效）
//   F 三条真源码破坏（各配原版对照，破坏副本重新装载后必须现形）
//   G 当版锚 + 两处登记面 + 锚点纯度 H5 + 工具两向自证
//
// 【边界】
//   本档在 vm + 最小 DOM shim 上**真装载**产品代码并**真调**宿主方法。
//   它 **不** 证明真浏览器里的排版观感、真机触摸命中，也不证明跨会话持久化 —— 那些只有真 ST 能证（L12-O5 边界）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { breakSource, assertSingleHit } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TEST_REL = path.join('tests', 'v3430_l12_x1_x9_extensions.test.mjs');
const readRoot = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ok = (m) => console.log('  + ' + m);

const HOST_SRC = readRoot('index.js');
const OWNER_SRC = readRoot('engine-diagnostic-lines.js');
const UI_SRC = readRoot('settings-ui.js');

const FACES = ['institutionRuleState', 'meaningViewState', 'worldlinePrehistory',
    'evidenceImpactReplay', 'actionReceiptState', 'silenceExplainState'];

const VERSION = (/const VERSION = '([0-9.]+)'/.exec(HOST_SRC) || [])[1] || '0.0.0';
const vnum = (s) => {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
};

/* -------------------- 真宿主装载（与 drill_unload.mjs 同形的 shim） -------------------- */
const noop = () => {};
function fakeElement() {
    return new Proxy({}, {
        get: (t, k) => {
            if (k === 'style') return {};
            if (k === 'classList') return { add: noop, remove: noop, toggle: noop, contains: () => false };
            if (typeof k === 'symbol') return undefined;
            if (['appendChild', 'removeChild', 'remove', 'addEventListener', 'removeEventListener',
                'setAttribute', 'getAttribute', 'insertBefore'].includes(k)) return () => null;
            if (k === 'querySelector') return () => fakeElement();
            if (k === 'querySelectorAll') return () => [];
            if (['children', 'childNodes'].includes(k)) return [];
            return undefined;
        },
        set: () => true,
    });
}

/** 真装载整棵装载面。overrides 可替换某个文件的内容（负控制用）。
 *  ★ 必须装载**完整**装载面：只装几个文件会让模块间取库口全落空，
 *    「降级」与「装载失败」就分不开了（X6 那轮判据自伤的同一个坑）。 */
function boot(overrides) {
    const mf = JSON.parse(readRoot('manifest.json'));
    const ORDER = [mf.js].concat(mf.extra_js);
    const ctx = {};
    ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
    ctx.console = { log: noop, warn: noop, error: noop, info: noop, debug: noop };
    ctx.document = {
        createElement: fakeElement, createTextNode: () => ({}), createDocumentFragment: fakeElement,
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        addEventListener: noop, removeEventListener: noop,
        head: fakeElement(), body: fakeElement(), documentElement: fakeElement(),
        currentScript: null, readyState: 'complete',
    };
    ctx.localStorage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop, length: 0, key: () => null };
    ctx.performance = { now: () => 0 };
    ctx.setTimeout = (fn) => { if (typeof fn === 'function') setTimeout(() => { try { fn(); } catch (_e) { /* 留痕不得成为新失败 */ } }, 0); return 0; };
    ctx.clearTimeout = noop; ctx.setInterval = () => 0; ctx.clearInterval = noop;
    ctx.requestAnimationFrame = () => 0; ctx.cancelAnimationFrame = noop;
    ctx.navigator = { userAgent: 'x1x9' };
    ctx.location = { href: 'http://localhost/' };
    ctx.URL = URL; ctx.Blob = class {};
    ctx.fetch = () => Promise.resolve({ ok: false, json: async () => ({}) });
    ctx.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
    ctx.CustomEvent = class {}; ctx.Event = class {};
    ctx.addEventListener = noop; ctx.removeEventListener = noop;
    ctx.SillyTavern = {
        getContext: () => ({ chat: [{ is_user: false, is_system: false, name: 'A', mes: 'x1x9' }], characters: [], chatId: 'x1x9-1' }),
        eventSource: { on: noop, off: noop, emit: noop, once: noop, removeListener: noop },
        libs: {}, chatMetadata: {},
    };
    const sb = vm.createContext(ctx);
    const loadFails = [];
    for (const f of ORDER) {
        const src = (overrides && typeof overrides[f] === 'string') ? overrides[f] : readRoot(f);
        try { vm.runInContext(src, sb, { filename: f }); }
        catch (e) { loadFails.push({ file: f, msg: String((e && e.message) || e).slice(0, 140) }); }
    }
    return { sb, loadFails, order: ORDER };
}

const flushTimers = async (rounds) => {
    const n = Math.max(1, rounds || 6);
    let done = Promise.resolve();
    for (let i = 0; i < n; i++) done = done.then(() => new Promise((r) => setTimeout(r, 2)));
    await done;
};

/** 真装载 + 真 init。 */
async function bootReady(overrides) {
    const b = boot(overrides);
    await b.sb.LonShaMemory.init();
    await flushTimers(8);
    return { E: b.sb.LonShaMemory.engine, sb: b.sb, loadFails: b.loadFails, order: b.order };
}

/** 在指定 engine 上造一份 worldProg 夹具（跑完即弃，不改磁盘）。 */
function withWorldProg(E, prog) {
    const prev = E.worldProg;
    E.worldProg = Object.assign({}, prev, prog);
    return () => { E.worldProg = prev; };
}

/* ==================== A 结构面 ==================== */
test('v3430X1X9 A1. ★★★ 六面各自在：内核定义 / 宿主转发桩 / 面板渲染', () => {
    for (const f of FACES) {
        assert.ok(new RegExp('function ' + f + '\\s*\\(').test(OWNER_SRC), '内核缺 ' + f + ' 定义');
        assert.ok(new RegExp(f + '\\(\\.\\.\\.args\\)\\s*\\{').test(HOST_SRC), '宿主缺 ' + f + ' 转发桩');
        assert.ok(UI_SRC.includes(f), '面板没有渲染 ' + f + '（那这一面就只活在诊断行里）');
    }
    ok('六面的内核定义 / 宿主转发 / 面板渲染全在册');
});

test('v3430X1X9 A2. ★★★ 宿主转发桩是**委派**而非重实现（唯一真源）', () => {
    const re = /(\w+)\(\.\.\.args\)\s*\{\s*const M = _moduleLib\(\(\) => window\.LonShaDiagnosticLines/g;
    const found = new Set();
    for (const m of HOST_SRC.matchAll(re)) found.add(m[1]);
    for (const f of FACES) {
        assert.ok(found.has(f), f + ' 的宿主桩没有走 _moduleLib 取库口（可能是第二份实现）');
    }
    for (const f of FACES) {
        const at = OWNER_SRC.indexOf('function ' + f + '(');
        assert.ok(at > 0, '缺 ' + f);
        const body = OWNER_SRC.slice(at, at + 900);
        assert.ok(!/window\.LonShaMemory/.test(body), f + ' 的实现体直读宿主全局（内核应只吃注入）');
    }
    ok('六面各只有一份实现，宿主侧全是委派桩');
});

/* 【本档第 11 处自伤】初稿假设「六面同形」，要求六面都有 `const absent = (why) => ({...})`。
 *   实测不是：X1/X2/X4/X5 用局部 absent()；X3 走 state 三态（unregistered/covered/gap）；
 *   X9 走 state 三态（not-found/unavailable/…）+ questions/counts。
 *   它们确实不同形，但不是「同一个构造器」那种不同形。判据要钉的是「每一面都有一条
 *   不会跟健康读数混淆的缺席出口」，而不是「六面写法一致」——后者是整洁性诉求冒充判据。 */
test('v3430X1X9 A3. ★★ 三态纪律：缺席形态与健康形态不是同一个形状', () => {
    /* 实测三档（本档第 11/13 处自伤修正）：
     *   一档 absent()：X1/X2/X4/X5 —— 局部 `const absent = (why)` + ok:false + reason:why
     *   二档 state-unavailable：X9 —— 也有 absent()，但缺席时 state 变 'unavailable'
     *   三档 state-tri：X3 —— **没有** absent()，靠 `base` 模板的 state 三态
     *     (unregistered/covered/gap) 承载，ok 恒 true；它的“判不了”是一个**可修的状态**，
     *     不是一个不可用的面。拿 absent() 去要它是把两种语义当成同一种。 */
    const ABSENT_CTOR = ['institutionRuleState', 'meaningViewState', 'evidenceImpactReplay', 'actionReceiptState'];
    const STATE_UNAVAIL = ['silenceExplainState'];
    const STATE_TRI = ['worldlinePrehistory'];
    assert.deepEqual(ABSENT_CTOR.concat(STATE_UNAVAIL, STATE_TRI).sort(), FACES.slice().sort(),
        '六面必须各归一档（新面加进来时要在这里选边）');
    for (const f of ABSENT_CTOR.concat(STATE_UNAVAIL)) {
        const at = OWNER_SRC.indexOf('function ' + f);
        assert.ok(at > 0, '缺 ' + f);
        const head = OWNER_SRC.slice(at, at + 2600);
        assert.ok(/const absent = \(why\) => \(\{/.test(head), '缺席构造器 ' + f);
        assert.ok(/ok: false, reason: why/.test(head), f + ' 的缺席形态没有 ok:false + reason');
    }
    for (const f of STATE_UNAVAIL) {
        const head = OWNER_SRC.slice(OWNER_SRC.indexOf('function ' + f), OWNER_SRC.indexOf('function ' + f) + 2600);
        assert.ok(/state: 'unavailable'/.test(head), f + ' 的缺席态必须是 state:unavailable（与 not-found 不同形）');
    }
    for (const f of STATE_TRI) {
        const head = OWNER_SRC.slice(OWNER_SRC.indexOf('function ' + f), OWNER_SRC.indexOf('function ' + f) + 2600);
        assert.ok(/const base = \{/.test(head), f + ' 缺统一的 base 模板（它靠模板而非局部构造器定形）');
        /* 三态必须三个词各自在源码里存在（真跑验收在 C3）。 */
        for (const st of ['unregistered', 'covered', 'gap']) {
            assert.ok(head.includes("state: '" + st + "'") || head.includes("'" + st + "'"),
                f + ' 缺三态中的 ' + st);
        }
    }
    ok('六面缺席出口三档各归其位（四面 absent / 一面 state-unavailable / 一面 state 三态）');
});

/* ==================== B 真宿主健康态 ==================== */
test('v3430X1X9 B1. ★★★ 真装载零失败，六面逐条可调且自证只读', async () => {
    const { E, loadFails, order } = await bootReady(null);
    assert.equal(loadFails.length, 0, '真装载面必须零装载失败：' + JSON.stringify(loadFails.slice(0, 4)));
    assert.ok(order.length >= 50, '装载面异常：' + order.length + ' 个文件');
    assert.ok(E, 'engine 未在构造期挂上');
    for (const f of FACES) {
        assert.equal(typeof E[f], 'function', '宿主缺方法 ' + f);
        const r = E[f]();
        assert.ok(r && typeof r === 'object', f + ' 必须回对象，实 ' + typeof r);
        assert.ok('kind' in r, f + ' 缺 kind 字段（机器可读标识）');
        assert.ok('writesNothing' in r, f + ' 缺 writesNothing（只读读数面必须自证不写）');
        assert.equal(r.writesNothing, true, f + ' 的读面写了东西');
        assert.ok('ok' in r, f + ' 缺 ok 字段（三态判据的唯一入口）');
    }
    ok('真装载零失败；六面全部可调，各带 kind / writesNothing / ok');
});

test('v3430X1X9 B2. ★★★ 「判不了」与「没有」在读数上可区分', async () => {
    const { E } = await bootReady(null);
    const why = {};
    for (const f of FACES) why[f] = String(E[f]().reason || '');
    ok('六面各自的 reason：' + FACES.map((f) => f + '=' + (why[f] || '(空)')).join(' / '));
    assert.equal(E.evidenceImpactReplay().ok, false, '缺事实键必须 ok:false（判不了 != 没有影响）');
    assert.equal(E.institutionRuleState().ok, true, '空表必须是 ok:true（有读数、只是 0 条）');
    assert.notEqual(why.evidenceImpactReplay, why.institutionRuleState,
        '「判不了」与「没有」不得同一个 reason 词');
    const trio = [why.worldlinePrehistory, why.silenceExplainState, why.actionReceiptState];
    assert.equal(new Set(trio).size, 3, 'X3/X5/X9 的空态理由必须三种不同形，实 ' + JSON.stringify(trio));
    ok('「判不了 / 没有跳线 / 没有主题 / 空链」四态四种词');
});

/* ==================== C X1 / X2 / X3 ==================== */
test('v3430X1X9 C1. ★★★ X1 组织制度：四类来源分桶 + 传闻不进表决三态', async () => {
    const { E } = await bootReady(null);
    const restore = withWorldProg(E, {
        institutionRules: [
            { id: 'r1', title: '宵禁', status: 'active', sourceTier: 'public_rule', version: 2, ratifiedBy: ['A', 'B'], previousVersionContent: '旧版正文' },
            { id: 'r2', title: '轮值', status: 'proposed', sourceTier: 'institutional', version: 1, ratifiedBy: [] },
            { id: 'r3', title: '老规矩', status: 'repealed', sourceTier: 'individual', version: 3 },
            { id: 'r4', title: '听说要搬', status: 'active', sourceTier: 'rumor' },
        ],
    });
    try {
        const r = E.institutionRuleState();
        assert.equal(r.ok, true, '有数据时 ok 必须为 true');
        assert.equal(r.rules, 4, '四条规则都要在册，实 ' + r.rules);
        assert.deepEqual(Object.assign({}, r.byTier),
            { individual: 1, institutional: 1, public_rule: 1, rumor: 1 }, '四类来源分桶不对：' + JSON.stringify(r.byTier));
        assert.equal(r.active + r.proposed + r.repealed, 3, '传闻被算进表决三态了（三条非传闻应恰好 3，实 ' + (r.active + r.proposed + r.repealed) + '）');
        assert.equal(r.active, 1, 'active 只应数真生效的那条（传闻不算），实 ' + r.active);
        const item = r.items.find((x) => x.ruleId === 'r1');
        assert.equal(item.hasPrevious, true, 'r1 有旧版，hasPrevious 必须为真');
        assert.equal(item.previousContent, null, '默认不许带出旧版正文');
        const withH = E.institutionRuleState({ withHistory: true });
        assert.equal(withH.items.find((x) => x.ruleId === 'r1').previousContent, '旧版正文',
            '显式 withHistory 时必须能取出旧版正文');
        assert.ok(Array.isArray(r.lineage) && r.lineage.length === 4, '谱系必须逐条可查');
    } finally { restore(); }
    ok('X1：四类来源分桶正确；传闻不进表决三态；旧版仅显式可取');
});

test('v3430X1X9 C2. ★★★ X2 意义演化：多义并列 + 逐条来源 + 人物差异 + 反例单列', async () => {
    const { E } = await bootReady(null);
    const restore = withWorldProg(E, {
        meaningMap: {
            symbols: {
                sym1: {
                    name: '旧戒指',
                    history: [
                        { stage: 'ordinary', meaningSummary: '普通物件', floor: 3, triggerEvent: '捡到' },
                        { stage: 'promise', meaningSummary: '定情物', floor: 20, triggerEvent: '对她说' },
                        { stage: 'evidence', meaningSummary: '债务证据', floor: 45, triggerEvent: '债主上门' },
                    ],
                    perspectives: {
                        '甲': { currentMeaning: '定情物', stage: 'promise' },
                        '乙': { currentMeaning: '债务证据', stage: 'evidence' },
                        '丙': { currentMeaning: '（不认同）只是个旧戒指', stage: 'ordinary' },
                    },
                },
            },
        },
        meaningObjections: [{ symbolId: 'sym1', actor: '丁', meaning: '根本不是她的', floor: 50 }],
    });
    try {
        const r = E.meaningViewState();
        assert.equal(r.ok, true);
        assert.equal(r.symbols, 1, '一个符号，实 ' + r.symbols);
        assert.equal(r.history, 3, '三次意义变化都要计入，实 ' + r.history);
        const it = r.items[0];
        const meanings = it.actors.map((a) => a.meaning);
        assert.ok(meanings.includes('定情物') && meanings.includes('债务证据'),
            '两个人物理解必须并列在场，实 ' + JSON.stringify(meanings));
        assert.ok(it.history.every((h) => h.floor !== null), '每条历史必须带楼层（来源）');
        assert.deepEqual(it.history.map((h) => h.floor), [3, 20, 45], '历史楼层必须逐条可查');
        assert.ok(it.history.some((h) => h.trigger), '必须带触发事件（来源的另一半）');
        assert.equal(it.objections, 1, '反例必须单列（含 objections 表里那条），实 ' + it.objections);
        /* 【本档第 12 处自伤】vm 里的数组是**另一个 realm 的 Array**，`assert.deepStrictEqual`
         *   会连带比原型链，于是 actual 与 expected 打印一模一样却仍然失败。
         *   跨 realm 的比较口径：比 JSON 文本（值相等即相等），而不是比原型。 */
        assert.equal(JSON.stringify(it.objectionActors.slice()), JSON.stringify(['丙']),
            '「（不认同）」前缀的视角必须归到反例，不混进 byActor');
        assert.equal(r.touchesFactOwner, false, '意义面不许写回事实 owner（它是视角不是事实）');
        assert.ok(Array.isArray(r.objectionItems) && r.objectionItems.length >= 1, '反例必须能逐条展开');
    } finally { restore(); }
    ok('X2：多义并列 / 逐条来源 / 人物差异 / 反例单列全部可读');
});

test('v3430X1X9 C3. ★★★ X3 前史体检：三态不同形 + 只读 + 预览三态', async () => {
    const { E } = await bootReady(null);
    const unreg = E.worldlinePrehistory();
    assert.equal(unreg.state, 'unregistered', '没登记时 state 必须是 unregistered，实 ' + unreg.state);
    assert.ok(unreg.suggestions.length >= 1, '没登记必须给出出路（先登记第一行）');
    const covered = E.worldlinePrehistory({ jumps: '1:现实' });
    assert.equal(covered.state, 'covered', '首跳第 1 楼时 state 必须是 covered，实 ' + covered.state);
    assert.ok(!/安全/.test(JSON.stringify(covered)), 'covered 态不许说「安全」——只报事实');
    const gap = E.worldlinePrehistory({ jumps: '40:梦境一层' });
    assert.equal(gap.state, 'gap', '首跳第 40 楼时 state 必须是 gap，实 ' + gap.state);
    assert.equal(gap.gapFrom, 1, '缺口起点必须是 1，实 ' + gap.gapFrom);
    assert.equal(gap.gapTo, 39, '缺口终点必须是首跳-1，实 ' + gap.gapTo);
    assert.equal(new Set([unreg.state, covered.state, gap.state]).size, 3, '三态必须三个词');
    assert.equal(gap.writesNothing, true, '前史体检必须自证只读');
    const cfgOf = () => JSON.stringify(E.config && E.config.config ? E.config.config.worldlineJumps : null);
    const before = cfgOf();
    E.worldlinePrehistory({ jumps: '40:梦境一层' });
    assert.equal(cfgOf(), before, '体检改了真配置（它只能出建议与预览）');
    assert.ok(['not-run', 'no-items', 'applied', 'no-current-line'].includes(gap.previewState),
        'previewState 必须是三档之一，实 ' + gap.previewState);
    assert.ok(gap.suggestions.every((s) => s.writes === false), '每条建议都必须写明不写数据');
    ok('X3：unregistered / covered / gap 三态不同形；只读；建议恒 writes:false');
});

/* ==================== D X4 / X5 ==================== */
test('v3430X1X9 D1. ★★★ X4 影响回放：四种裁决的下游四个不同词', async () => {
    const { E } = await bootReady(null);
    /* 【夹具口径，按内核源码复算】`traceImpactGraph` 判「受影响」的唯一依据是
     *   `dependsOn` 里含这个 factKey —— 只写 `tier` 不算受影响（tier 是**受影响之后**
     *   的自动分级，它由 category 派生，传进来会被覆盖）。
     *   初稿漏了 dependsOn，于是 affected 恒空 ⇒ recomputed 空、秘密也排不进受影响清单，
     *   D1 报「recomputed 只收 recomputable 的受影响项，实 []」。不是产品坏了，是夹具不成立。 */
    const deps = [
        { id: 's1', title: '摘要1', category: 'summary', dependsOn: ['fact:age'], tier: 'recomputable' },
        { id: 'rt1', title: '路线1', category: 'route', dependsOn: ['fact:age'], tier: 'needs_confirm' },
        { id: 'h1', title: '秘密档', category: 'summary', dependsOn: ['fact:age'], tier: 'recomputable', secret: true },
        /* 未受影响的对照项：不在 dependsOn 里，一行都不许进 recomputed。 */
        { id: 'x1', title: '无关摘要', category: 'summary', dependsOn: ['fact:other'], tier: 'recomputable' },
    ];
    const restore = withWorldProg(E, { factDependents: deps });
    try {
        const outs = {};
        for (const v of ['adopt', 'parallel', 'pending', 'revoke']) {
            const r = E.evidenceImpactReplay({ factKey: 'fact:age', verdict: v });
            assert.equal(r.ok, true, v + ' 必须 ok:true，实 ' + JSON.stringify(r).slice(0, 200));
            outs[v] = r.downstream;
            assert.ok(r.downstream, v + ' 的 downstream 不许为空');
        }
        assert.equal(new Set(Object.values(outs)).size, 4,
            '四种裁决的下游必须四个词，实 ' + JSON.stringify(outs));
        assert.equal(outs.revoke, 'pending', '撤回裁决后下游必须回到 pending，实 ' + outs.revoke);
        const r = E.evidenceImpactReplay({ factKey: 'fact:age', verdict: 'adopt' });
        assert.equal(r.secretsExcluded, 1, '秘密依赖项必须排除并计数，实 ' + r.secretsExcluded);
        assert.ok(!r.affected.some((a) => a.id === 'h1'), '秘密依赖项不许出现在受影响清单里');
        assert.ok(!r.recomputed.includes('rt1'), 'needs_confirm 的项不许进 recomputed（那是全量重算的形状）');
        assert.equal(JSON.stringify(r.recomputed), JSON.stringify(['s1']),
            'recomputed 只收 recomputable 的受影响项，实 ' + JSON.stringify(r.recomputed));
        /* 未受影响的 x1 与密密的 h1 都不得出现（不全量重算 == 不声称全量重算）。 */
        assert.ok(!r.recomputed.includes('x1'), '未受影响项不许进 recomputed（那是全量重算的形状）');
        assert.equal(r.writesNothing, true);
    } finally { restore(); }
    ok('X4：四裁决四个下游词；撤回回 pending；秘密排除并计数；未受影响不重算');
});

test('v3430X1X9 D2. ★★★ X5 回执链：四态入链 + 下游缺席不伪造 + 可拒长期保存', async () => {
    const { E } = await bootReady(null);
    const empty = E.actionReceiptState();
    assert.equal(empty.downstream, 'absent', '下游缺席必须报 absent，实 ' + empty.downstream);
    assert.equal(empty.receipts, 0, '缺席时不许编回执，实 ' + empty.receipts);
    const byOut = empty.byOutcome || {};
    for (const k of ['accepted', 'rejected', 'timed_out', 'partial']) {
        assert.ok(k in byOut, '四态缺 ' + k + '（失败与未执行必须同样有意义）');
    }
    assert.ok(Array.isArray(empty.chain), '必须给出可审阅的链（不是单个结论）');
    assert.ok(OWNER_SRC.includes('partially_completed'), '必须处理 bridge 的 partially_completed 原始词');
    assert.ok('sessionOnly' in empty, '必须给出 sessionOnly 读数（用户可拒绝长期保存）');
    assert.equal(empty.writesNothing, true, '读面不写');
    ok('X5：空链报 absent 不伪造；四态齐；链可审阅；sessionOnly 可读');
});

/* ==================== E X9 ==================== */
test('v3430X1X9 E1. ★★★ X9 沉默可解释：四问齐 + 静音可逆 + 没进来 != 不存在', async () => {
    const { E } = await bootReady(null);
    const r = E.silenceExplainState();
    assert.equal(r.ok, true, 'ok 必须为 true（有读数，只是没有主题），实 ' + r.ok + ' / ' + r.reason);
    const q = r.questions || {};
    assert.deepEqual(Object.keys(q).sort(), ['blocked', 'muted', 'notRecalled', 'trimmed'],
        '四问必须是且仅是这四个桶，实 ' + JSON.stringify(Object.keys(q)));
    for (const k of ['notRecalled', 'blocked', 'trimmed', 'muted']) {
        assert.ok(Array.isArray(q[k]), '四问缺 ' + k + '（四问必须各是一个可查的桶）');
    }
    assert.ok('surfacing' in r.counts && 'notFound' in r.counts,
        '「浮现中」与「不存在」必须是两个桶（本仓治过多次的错读数）');
    assert.equal(r.state, 'not-found', '没主题时 state 是 not-found（不是 unavailable），实 ' + r.state);
    assert.ok(!/delete.*mutedTopicIds|mutedTopicIds\.delete/.test(OWNER_SRC), '静音不许删除（只标记）');
    ok('X9：四问四个桶；surfacing 与 notFound 分列；not-found != unavailable；静音可逆');
});

test('v3430X1X9 E2. ★★★ X9 静音的两条真源各自生效，不互相替代', async () => {
    const { E } = await bootReady(null);
    const r1 = E.silenceExplainState({
        topics: [{ id: 't1', location: '图书馆', actors: ['甲'], evidenceCount: 3 }],
        ctx: { mutedTopicIds: ['t1'] },
    });
    assert.equal(r1.counts.muted, 1, 'ctx 里静音的专题必须归到 muted 桶，实 ' + JSON.stringify(r1.counts));
    const t1 = r1.topics.find((x) => x.topicId === 't1');
    assert.ok(t1, '静音的主题必须仍在册（静音不删除）');
    assert.equal(t1.reversible, true, '静音必须可逆（可随时重开）');
    const restore = withWorldProg(E, { seasonState: { userActions: { t2: 'mute' } } });
    try {
        const r2 = E.silenceExplainState({
            topics: [{ id: 't2', location: '图书馆', actors: ['甲'], evidenceCount: 3 }],
            ctx: {},
        });
        assert.equal(r2.counts.muted, 1, '持久静音必须同样归到 muted 桶，实 ' + JSON.stringify(r2.counts));
    } finally { restore(); }
    ok('X9：ctx 静音与持久静音两条真源各自生效，静音不删除且可逆');
});

/* ==================== F 三条真源码破坏（各配原版对照） ==================== */
/* 三枚锚点逐字取自真源码，且在本档各只声明一次（G3 钉 H5 纯度）。 */
const A_RUMOR = "if (tier === 'rumor') {";
const A_OBJVIEW = 'const isObjView = (v) => !!(v && (v.isObjection === true';
const A_SECRET = 'if (d.secret === true || d.isSecret === true) { secretsExcluded += 1; continue; }';

/** 真源码破坏 + 原版对照：两侧都**真装载**，断言必须两侧不同形。
 *  只断破坏侧 = 假绿第二形（破坏写死成常量也能过）；
 *  只断原版侧 = 假绿第一形（对原文件断言，破坏没发生也绿）。
 *  破坏副本还必须**仍能装载**：若它连装载都失败，测到的是语法错，不是语义漂移。 */
async function twoSides(rel, anchor, repl, label) {
    const h = await bootReady(null);
    const broken = breakSource(readRoot(rel), anchor, repl, label);
    const b = await bootReady({ [rel]: broken });
    assert.equal(h.loadFails.length, 0, '原版侧装载必须零失败：' + JSON.stringify(h.loadFails.slice(0, 3)));
    assert.equal(b.loadFails.length, 0, '破坏副本必须仍能装载（否则测的是语法错）：'
        + JSON.stringify(b.loadFails.slice(0, 3)));
    return { E1: h.E, E2: b.E };
}

test('v3430X1X9 F1. ★★★ 真源码破坏：传闻一旦进表决 ⇒ active 立刻从 1 变 2', async () => {
    const RULES = [
        { id: 'r1', title: '宵禁', status: 'active', sourceTier: 'public_rule' },
        { id: 'r2', title: '轮值', status: 'proposed', sourceTier: 'institutional' },
        { id: 'r3', title: '老规矩', status: 'repealed', sourceTier: 'individual' },
        { id: 'r4', title: '听说要搬', status: 'active', sourceTier: 'rumor' },
    ];
    const read = (E) => {
        const un = withWorldProg(E, { institutionRules: RULES });
        try { return E.institutionRuleState(); } finally { un(); }
    };
    const { E1, E2 } = await twoSides('engine-diagnostic-lines.js', A_RUMOR,
        "if (false && tier === 'rumor') {", '传闻也进表决三态');
    const a = read(E1);
    const b = read(E2);
    assert.equal(a.active, 1, '原版：active 只数真生效的那条，实 ' + a.active);
    assert.equal(a.byTier.rumor, 1, '原版：传闻有自己的桶，实 ' + a.byTier.rumor);
    assert.equal(b.active, 2, '破坏后传闻被算进 active（判据必须现形），实 ' + b.active);
    assert.notEqual(a.active, b.active, '破坏未改变读数 ⇒ 这条判据没承重');
    ok('F1：传闻进表决会让 active 1 → 2，判据真翻红');
});

test('v3430X1X9 F2. ★★★ 真源码破坏：反例一旦混进人数 ⇒ objectionActors 立刻空', async () => {
    const MAP = {
        symbols: {
            sym1: {
                name: '旧戒指',
                history: [{ stage: 'ordinary', meaningSummary: '普通物件', floor: 3 }],
                perspectives: {
                    '甲': { currentMeaning: '定情物' },
                    '丙': { currentMeaning: '（不认同）只是个旧戒指' },
                },
            },
        },
    };
    const read = (E) => {
        const un = withWorldProg(E, { meaningMap: MAP });
        try { return E.meaningViewState(); } finally { un(); }
    };
    const { E1, E2 } = await twoSides('engine-diagnostic-lines.js', A_OBJVIEW,
        'const isObjView = (v) => !!(false && (v.isObjection === true', '反例识别失效');
    const a = read(E1);
    const b = read(E2);
    /* 【本档第 13 处自伤】objectionActors 挂在 `items[i]` 上，不在顶层：
     *   顶层只有汇总的 `objections`（个数）与 `objectionItems`（逐条）。
     *   读错一层会拿到 undefined，而不是“产品没分反例”。 */
    const ia = a.items[0];
    const ib = b.items[0];
    assert.equal(JSON.stringify(ia.objectionActors), JSON.stringify(['丙']),
        '原版：「（不认同）」前缀必须归反例，实 ' + JSON.stringify(ia.objectionActors));
    assert.equal(a.byActor['丙'], undefined, '原版：反例不进 byActor');
    assert.equal(JSON.stringify(ib.objectionActors), JSON.stringify([]),
        '破坏后反例识别失效（判据必须现形），实 ' + JSON.stringify(ib.objectionActors));
    assert.equal(b.byActor['丙'], 1, '破坏后反例混进了人数，实 ' + JSON.stringify(b.byActor));
    ok('F2：反例识别失效 ⇒ objectionActors 空、byActor 多出一人');
});

test('v3430X1X9 F3. ★★★ 真源码破坏：秘密不再排除 ⇒ secretsExcluded 归零且秘密进受影响清单', async () => {
    /* 同 D1 口径：必须带 dependsOn，否则 h1 压根不在受影响集合里，
     *   「秘密漏进 affected」这一断言就变成对一个永远空的病例断言（假绿第一形）。 */
    const DEPS = [
        { id: 's1', title: '摘要1', category: 'summary', dependsOn: ['fact:age'], tier: 'recomputable' },
        { id: 'h1', title: '秘密档', category: 'summary', dependsOn: ['fact:age'], tier: 'recomputable', secret: true },
    ];
    const read = (E) => {
        const un = withWorldProg(E, { factDependents: DEPS });
        try { return E.evidenceImpactReplay({ factKey: 'fact:age', verdict: 'adopt' }); } finally { un(); }
    };
    const { E1, E2 } = await twoSides('engine-diagnostic-lines.js', A_SECRET,
        'if (false) { secretsExcluded += 1; continue; }', '秘密不再排除');
    const a = read(E1);
    const b = read(E2);
    assert.equal(a.secretsExcluded, 1, '原版：秘密依赖项必须排除并计数，实 ' + a.secretsExcluded);
    assert.ok(!a.affected.some((x) => x.id === 'h1'), '原版：秘密不许出现在受影响清单里');
    assert.equal(b.secretsExcluded, 0, '破坏后不再计数（判据必须现形），实 ' + b.secretsExcluded);
    assert.ok(b.affected.some((x) => x.id === 'h1'), '破坏后秘密进了受影响清单，实 ' + JSON.stringify(b.affected.map((x) => x.id)));
    ok('F3：秘密排除失效 ⇒ secretsExcluded 1 → 0，秘密漏进 affected');
});

/* ==================== G 当版锚 + 登记面 + 纯度 ==================== */
test('v3430X1X9 G1. ★★ 当版下界锚：版本 ≥ 3.430.0（三处真源）', () => {
    assert.ok(vnum(VERSION) >= vnum('3.430.0'), 'index.js VERSION 必须 ≥ 3.430.0，实 ' + VERSION);
    const pkg = JSON.parse(readRoot('package.json'));
    assert.ok(vnum(pkg.version) >= vnum('3.430.0'), 'package.json 版本必须 ≥ 3.430.0，实 ' + pkg.version);
    const mf = JSON.parse(readRoot('manifest.json'));
    assert.ok(vnum(mf.version) >= vnum('3.430.0'), 'manifest 版本必须 ≥ 3.430.0，实 ' + mf.version);
    ok('三处真源版本均已 ≥ 3.430.0（实 ' + VERSION + '）');
});

test('v3430X1X9 G2. ★★ 两处登记面：在役名册 + v3247 接收方台账', () => {
    const cat = readRoot(path.join('tests', 'audit', 'catalog_reference_consumers.tsv'));
    assert.ok(cat.includes('v3430_l12_x1_x9_extensions.test.mjs'),
        '本档必须进 tests/audit/catalog_reference_consumers.tsv（在役名册）');
    const ledger = readRoot(path.join('tests', 'v3247_break_kit_consolidation.test.mjs'));
    assert.ok(ledger.includes("'v3430_l12_x1_x9_extensions.test.mjs'"),
        '本档必须进 v3247 的 REGISTRY（否则 _break_kit 取用面无人对账）');
    ok('两处登记面已补');
});

test('v3430X1X9 G3. ★★★ 三枚破坏锚点在本档各只声明一次（判据纯度 H5）', () => {
    const SELF = readRoot(TEST_REL);
    const decls = [
        ['A_RUMOR', A_RUMOR, 'engine-diagnostic-lines.js'],
        ['A_OBJVIEW', A_OBJVIEW, 'engine-diagnostic-lines.js'],
        ['A_SECRET', A_SECRET, 'engine-diagnostic-lines.js'],
    ];
    for (const [name, lit, rel] of decls) {
        const n = SELF.split(lit).length - 1;
        /* H5：锚点字面量只能出现一次 —— 写第二处等于判据自己引用了锚点串，
         *   以后改锚点时会“改一处、漏一处”，负控制静默退化成对原文件断言。 */
        assert.strictEqual(n, 1, '锚点 ' + name + ' 在本档应恰出现 1 次（实 ' + n + ' 次）');
        assertSingleHit(readRoot(rel), lit, name);
    }
    ok('三枚锚点各只声明一次（H5），且在真源上各恰中 1 次');
});

test('v3430X1X9 G4. ★★ 破坏工具两向自证：零命中 / 多命中 / 同值替换均拒绝', () => {
    assert.throws(() => assertSingleHit(OWNER_SRC, '绝对不存在的锚点字符串-xyz', 'x-miss'), /拒绝破坏/);
    assert.throws(() => assertSingleHit(OWNER_SRC, 'const absent = (why) =>', 'x-multi'), /拒绝破坏/);
    assert.throws(() => breakSource(OWNER_SRC, A_RUMOR, A_RUMOR, 'x-same'), /拒绝破坏/);
    /* 正控：真破坏必须真的变了，且不等于原件。 */
    const broke = breakSource(OWNER_SRC, A_RUMOR, "if (false && tier === 'rumor') {", 'x-ok');
    assert.notEqual(broke, OWNER_SRC, '正控：破坏必须真的改变源码');
    ok('G4：零命中 / 多命中 / 同值替换均拒绝；正控真改变源码');
});
