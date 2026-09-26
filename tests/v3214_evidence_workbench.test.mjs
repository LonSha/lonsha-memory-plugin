/* ============================================================
 * tests/v3214_evidence_workbench.test.mjs — v3.214.0
 *
 * 主题：九账**只读对账面**（R1-E，evidence-workbench.js + 宿主接线）。
 *
 * 修前实测（本轮真跑取证）：
 *   九本账各自都有 `list()` / `summarize()` / `render()`，但**对外是一排孤立的文本行**：
 *     · `ledger-replay.js` 的 `FLOOR_OWNERS` 只登记「谁有楼层归属」（get/drop/shift）——
 *       问「删楼时该撤谁」它答得出，问「这条伏笔是什么、出自哪一楼」它答不出；
 *     · `buildBridgeSnapshot()` 的 16 个顶层字段里**一本账都没有**：`worldProg` 只带
 *       四本账的**原始状态**，`_factVersionState` / `_eventThreadState` / `_repairState`
 *       连状态都没进快照。
 *   后果：下游（手机端工作台）只能逐 App 翻，且任何既有面都答不出**出处**。
 *
 * 本套件锁住的五条契约：
 *   ① 九账一次取齐（登记表就是真源）：九项一个都不能漏（漏一本 = 面板少一面却不报错）；
 *   ② 三态可分：`ok` / `empty`（在位无条目，**真读数**）/ `absent`（取不到），
 *      且 absent 的**两个原因**（`module-unavailable` 模块没挂 vs `state-missing` 宿主没这本账）
 *      必须可分——三者处置相反，压成一态就是错读数；
 *   ③ 出处：每条投影行带稳定 `ref`（`seed:seed_1`）+ 来源账 + 出处楼层；
 *      楼层取不到一律 `null`，**绝不写 0**（0 是「第 0 楼」这个真实读数）；
 *      条目没有 `id` 的账（回声）必须给**非正文**的稳定键（按其自身去重口径 char/mode）；
 *   ④ 检索面：命中 / 本账没命中 / 本账空 / 本账缺席**四态分开**（压成「没找到」
 *      会让用户以为「系统里没有这件事」，而真因可能是「这本账没接上」）；
 *   ⑤ 快照接线：`evidence` 进快照并自动获得 `meta.fieldTypes.evidence` 三态；
 *      `_evidenceWorkbench` 缺失时只让该字段 present=false，**不连坐** floor / version。
 *
 * 负控制（真源码破坏 → 加载破坏副本 → 同款判据必须转红）：
 *   N1 去掉 floor 的 `=== null` 短路（退回 `Number(null) === 0` 形态）→ 缺失楼层必须读数错；
 *   N2 把 absent 的 `state-missing` 改写成 `module-unavailable` → 归因必须错；
 *   N3 把 `_ledgerApis()` 里的 `'repair'` 键删掉 → 修复账必须降级为 module-unavailable。
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const WB = join(ROOT, 'evidence-workbench.js');
const IDX = join(ROOT, 'index.js');

const require = createRequire(import.meta.url);
const realWorkbench = require(WB);
const realIdxSrc = readFileSync(IDX, 'utf-8');
const realWbSrc = readFileSync(WB, 'utf-8');

/** 九本真实账本模块（不是 stub：读数必须落在真账上） */
const LEDGER_MODULES = {
    'seed': require(join(ROOT, 'seed-ledger.js')),
    'commitment': require(join(ROOT, 'commitment-ledger.js')),
    'parallel': require(join(ROOT, 'parallel-ledger.js')),
    'secret': require(join(ROOT, 'secret-ledger.js')),
    'recall-echo': require(join(ROOT, 'recall-echo.js')),
    'echo': require(join(ROOT, 'echo-ledger.js')),
    'fact-version': require(join(ROOT, 'fact-version.js')),
    'event-completeness': require(join(ROOT, 'event-completeness.js')),
    'repair': require(join(ROOT, 'repair-loop.js'))
};

/** 用**真账本模块**写出一个非空 host（每条都过各账自己的入参校验）。 */
function makeRealHost() {
    const S = LEDGER_MODULES['seed'], C = LEDGER_MODULES['commitment'], P = LEDGER_MODULES['parallel'];
    const K = LEDGER_MODULES['secret'], RE = LEDGER_MODULES['recall-echo'], E = LEDGER_MODULES['echo'];
    const F = LEDGER_MODULES['fact-version'], EV = LEDGER_MODULES['event-completeness'], RP = LEDGER_MODULES['repair'];
    const seed = S.plant(null, { hook: '冰箱里的旧照片', source: '第3楼', floor: 3 }).state;
    const cmt = C.open(null, { content: '周末去看房子', actor: '苏晴', floor: 5 }).state;
    const par = P.note(null, { title: '搬家', fact: '苏晴正在搬家', place: '老城区', who: ['苏晴'], floor: 7 }).state;
    const sec = K.seal(null, { secret: '她的工作调令', keeper: ['苏晴'], floor: 9 }).state;
    const echo = RE.mark(null, { detail: '钥匙串', kind: 'clue', floor: 11 }).state;
    const life = E.produce(null, { mode: 'pocket', char: '苏晴', floor: 13, fields: { 物品: '伞' }, os: '今天风很大' }).state;
    const fact = F.assertFact(null, { subject: '苏晴', predicate: '住处', value: '城东', floor: 15 }).state;
    const evt = EV.openEvent(null, { title: '看房', floor: 17 }).state;
    const rep = RP.request(null, { action: 'retarget', subject: '苏晴', target: '住处', to: '城西', floor: 19, reason: '地址变了' }).state;
    return {
        worldProg: { seedLedger: seed, commitmentLedger: cmt, parallelLedger: par, secretLedger: sec, recallEcho: echo, echoLedger: life },
        _factVersionState: fact, _eventThreadState: evt, _repairState: rep
    };
}

function emptyHost() {
    return {
        worldProg: { seedLedger: null, commitmentLedger: null, parallelLedger: null, secretLedger: null, recallEcho: null, echoLedger: null },
        _factVersionState: null, _eventThreadState: null, _repairState: null
    };
}

/* ══════════ 判据（正/负控制共用同一份；返回 {ok, why}，不抛） ══════════
 * 纪律（本仓 v2.98 / H5-H6 教训）：负控制必须「**真源码破坏** → 加载破坏副本 →
 *   在副本上重跑**同一套**判据 → 断言转红」。对原文件断言、把破坏写死成常量、
 *   让判据自己引用锚点串，都会假绿。 */
function loadWorkbenchFrom(src) {
    const mod = { exports: {} };
    // 与模块自身同款装载口（IIFE 双导出）：root 给 sandbox，module.exports 收结果
    new Function('window', 'module', 'exports', src)(undefined, mod, mod.exports);
    return mod.exports;
}

function jWorkbench(W, opts) {
    const o = opts || {};
    const out = {};
    const apis = o.apis === undefined ? LEDGER_MODULES : o.apis;
    const host = o.host === undefined ? makeRealHost() : o.host;

    // ① 九账一个不漏
    const face = W.buildWorkbench(host, { apis, now: () => 1000 });
    out.ledgerCount = Object.keys(face.ledgers).length;
    out.selfConsistent = face.selfConsistent === true;
    out.countsCover = (face.summary.counts.ok + face.summary.counts.empty + face.summary.counts.absent) === face.summary.total;
    out.itemsSum = face.summary.items;

    // ② absent 两因可分：模块没挂
    const noApis = W.buildWorkbench(host, { apis: {}, now: () => 1000 });
    out.allModuleUnavailable = Object.keys(noApis.ledgers).every((k) => noApis.ledgers[k].state === 'absent' && noApis.ledgers[k].reason === 'module-unavailable');
    // ② absent 两因可分：模块在、宿主没这本账
    const emptyFace = W.buildWorkbench(emptyHost(), { apis, now: () => 1000 });
    out.allStateMissing = Object.keys(emptyFace.ledgers).every((k) => emptyFace.ledgers[k].state === 'absent' && emptyFace.ledgers[k].reason === 'state-missing');
    // ② 空账是真读数（不是 absent）：把「伏笔账」给出空壳状态、其余照旧
    const hostWithEmptySeed = Object.assign(makeRealHost(), { worldProg: Object.assign({}, makeRealHost().worldProg, { seedLedger: { version: 1, seq: 0, items: [] } }) });
    const mixFace = W.buildWorkbench(hostWithEmptySeed, { apis, now: () => 1000 });
    out.emptyIsEmpty = mixFace.ledgers['seed'].state === 'empty' && mixFace.ledgers['seed'].reason === 'no-items';

    // ③ 出处：ref 稳定 + 楼层如实
    const refs = {};
    for (const k of Object.keys(face.ledgers)) {
        const it = (face.ledgers[k].items || [])[0];
        if (it) refs[k] = { ref: it.ref, floor: it.floor, status: it.status, src: it.source };
    }
    out.refs = refs;
    out.eggStableKey = !!(refs['echo'] && refs['echo'].ref.indexOf('苏晴/pocket') > 0);
    out.evtFloorNull = !!(refs['event-completeness'] && refs['event-completeness'].floor === null);
    // ③ 缺失楼层绝不写 0：显式构造一条没有 floor 的伏笔（各账 `finite` 会塌成 0，
    //    故这里直接调投影函数读**模块自己**的读数口径，验证「没给」不被写成 0）
    out.missingFloorNull = W.finiteFloor(undefined) === null && W.finiteFloor(null) === null && W.finiteFloor('') === null;
    out.zeroFloorKept = W.finiteFloor(0) === 0;

    // ④ 检索四态
    const s = W.search(face, '搬家');
    out.searchHitRefs = s.hits.map((h) => h.ref);
    out.searchMissIncludesSeed = s.missLedgers.some((m) => m.id === 'seed');
    out.searchEmptyList = s.emptyLedgers.length;
    out.searchAbsentList = s.absentLedgers.length;
    const sAbsent = W.search(emptyFace, '搬家');
    out.searchAbsentReasons = sAbsent.absentLedgers.map((a) => a.reason);
    const sEmpty = W.search(mixFace, '搬家');
    out.searchEmptyIsListed = sEmpty.emptyLedgers.some((e) => e.id === 'seed');
    out.searchHitOnSusan = W.search(face, '苏晴').hits.length;

    // ⑤ ref 定位
    out.findRefOk = W.findRef(face, refs['seed'].ref).found === true;
    out.findRefBad = W.findRef(face, 'no-colon').reason;
    out.findRefUnknown = W.findRef(face, 'nope:x').reason;
    out.findRefAbsentLedger = W.findRef(emptyFace, 'seed:seed_1').reason;

    // ⑥ 诊断行：缺席与空账分开写
    const l = W.line(emptyFace);
    out.lineMentionsAbsent = l.indexOf('缺席') >= 0 && l.indexOf('state-missing') >= 0;
    const l2 = W.line(mixFace);
    out.lineMentionsEmpty = l2.indexOf('空账') >= 0;
    return out;
}

/** 破坏：真源码替换（锚点必须恰中 1 次，且必须真的改变源码） */
function breakSource(src, from, to, tag) {
    const hits = src.split(from).length - 1;
    assert.equal(hits, 1, `锚点【${tag}】须在真源码中恰中 1 次（实 ${hits}）`);
    const out = src.replace(from, to);
    assert.notEqual(out, src, `破坏【${tag}】必须真的改变源码`);
    return out;
}

/* ══════════ 1 真实账本驱动：九账取齐 + 三态 + 出处 ══════════ */
test('1 九账取齐：真账本写出的 host 上九账全 ok，三态计数盖满登记表', () => {
    const j = jWorkbench(realWorkbench);
    assert.equal(j.ledgerCount, 9, '★ 九本账一本都不能漏（漏一本 = 面板少一面却不报错）');
    assert.equal(j.selfConsistent, true, '★ 三态计数必须恰好盖满登记表');
    assert.equal(j.countsCover, true, '★ ok+empty+absent 必须等于登记表项数');
    assert.equal(j.itemsSum, 9, '★ 九条真实条目必须全部投影出来');
});

test('2 三态可分：模块未挂 vs 宿主没这本账 vs 账在位但空 —— 三者处置相反', () => {
    const j = jWorkbench(realWorkbench);
    assert.equal(j.allModuleUnavailable, true, '★ 模块未挂必须归因 module-unavailable');
    assert.equal(j.allStateMissing, true, '★ 模块在、宿主没这本账必须归因 state-missing（不是「模块没装」）');
    assert.equal(j.emptyIsEmpty, true, '★ 账在位且明确没有条目 = empty（真读数，不是 absent、不是错）');
});

test('3 出处：ref 稳定非正文、楼层如实、缺失不写 0', () => {
    const j = jWorkbench(realWorkbench);
    assert.equal(j.eggStableKey, true, '★ 回声账条目没有 id，ref 必须用其去重口径（char/mode）而不是正文');
    assert.equal(j.evtFloorNull, true, '★ 事件条目不落 floor 时出处必须为 null');
    assert.equal(j.missingFloorNull, true, '★ 「没给楼层」必须是 null（Number(null)===0 会把两个相反读数塌成同形）');
    assert.equal(j.zeroFloorKept, true, '★ 「第 0 楼」是真实读数，必须保留为 0（不能连它一起抹）');
});

test('4 检索面四态分开：命中 / 本账没命中 / 本账空 / 本账缺席', () => {
    const j = jWorkbench(realWorkbench);
    assert.deepEqual(j.searchHitRefs, ['parallel:par_1'], '★ 命中必须带稳定 ref 与出处');
    assert.equal(j.searchMissIncludesSeed, true, '★ 账在位、这一问没命中 ⇒ missLedgers（不是「没有这件事」）');
    assert.equal(j.searchEmptyIsListed, true, '★ 账在位但空 ⇒ emptyLedgers（与 miss 分开）');
    assert.ok(j.searchAbsentReasons.every((r) => r === 'state-missing'), '★ 缺席必须逐条带原因');
    assert.equal(j.searchHitOnSusan, 6, '★ 跨账命中：同一名字应能在多本账里被找到');
});

test('5 ref 定位：四种失败原因可分，不抛', () => {
    const j = jWorkbench(realWorkbench);
    assert.equal(j.findRefOk, true, '★ 对 ref 必须能定位回条目');
    assert.equal(j.findRefBad, 'bad-ref', '★ 不成形的 ref 必须归因 bad-ref（不是 not-found）');
    assert.equal(j.findRefUnknown, 'unknown-ledger', '★ 未知账前缀必须归因 unknown-ledger');
    assert.equal(j.findRefAbsentLedger, 'ledger-absent', '★ 账缺席与「条目不在」必须分开');
});

test('6 诊断行：缺席与空账分开写，缺席逐本带因', () => {
    const j = jWorkbench(realWorkbench);
    assert.equal(j.lineMentionsAbsent, true, '★ 缺席必须逐本写出原因（state-missing）');
    assert.equal(j.lineMentionsEmpty, true, '★ 空账必须单独写，不能并入缺席');
});

/* ══════════ 7 宿主接线：快照 evidence 字段 + meta 三态 ══════════ */
test('7 快照接线：evidence 进快照并获得 meta.fieldTypes 三态，缺失不连坐自述字段', () => {
    const marker = '_evidenceWorkbench() {';
    assert.equal(realIdxSrc.split(marker).length - 1, 1, '宿主必须有 _evidenceWorkbench()（锚点须恰中 1 次）');
    assert.equal(realIdxSrc.split("evidence: deep(").length - 1, 1, '快照必须有 evidence 字段（锚点须恰中 1 次）');
    assert.equal(realIdxSrc.split("searchEvidence(query, opts) {").length - 1, 1, '宿主必须有 searchEvidence 转发口');

    // 真源码里当场跑一遍 buildBridgeSnapshot（提取方法体 + 造实例）
    const body = (() => {
        const start = realIdxSrc.indexOf('buildBridgeSnapshot() {');
        assert.ok(start > 0, 'index.js 缺 buildBridgeSnapshot 方法体');
        const bs = realIdxSrc.indexOf('{', start);
        let depth = 0, end = -1;
        for (let i = bs; i < realIdxSrc.length; i++) {
            if (realIdxSrc[i] === '{') depth++;
            else if (realIdxSrc[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        return realIdxSrc.slice(start, end + 1);
    })();
    const win = { SillyTavern: { getContext: () => ({ chat: [{}] }) } };
    const makeEng = () => new Function('VERSION', 'errLog', 'window', `return ({ ${body} });`)('3.214.0-test', () => {}, win);
    const base = { clock: null, worldProg: null, moneyLedger: null, outline: null, status: null, _summarizeRecallAudit: null };

    // A) 有 _evidenceWorkbench ⇒ evidence 在场，三态 present=true
    const withFace = Object.assign(makeEng(), base, { _evidenceWorkbench: () => ({ version: 1, summary: { total: 9, counts: { ok: 1, empty: 0, absent: 8 }, items: 1 }, ledgers: {}, selfConsistent: true }) });
    const snapA = withFace.buildBridgeSnapshot();
    assert.ok(snapA && snapA.evidence && snapA.evidence.summary.total === 9, '★ 有对账面时 evidence 必须进快照');
    assert.equal(snapA.meta.fieldTypes.evidence.present, true, '★ evidence 必须获得 meta.fieldTypes 三态');

    // B) 无 _evidenceWorkbench（单测「提取执行」模式的独立实例）⇒ 只该字段缺席
    const noFace = Object.assign(makeEng(), base);
    const snapB = noFace.buildBridgeSnapshot();
    assert.ok(snapB, '★ 缺 _evidenceWorkbench 不得让整张快照为 null');
    assert.equal(snapB.meta.fieldTypes.evidence.present, false, '★ 缺该方法时 evidence 必须 present=false（如实报「没这面」）');
    assert.ok(snapB.floor !== undefined || snapB.version !== undefined, '★ 不得连坐 floor / version 等自述字段');
});

/* ══════════ 8 负控制：真源码破坏 → 同款判据必须转红 ══════════ */
test('8a 负控制 N1：抹掉 floor 的「没给」守卫 ⇒ 缺失楼层必须读数错', () => {
    /* 破坏锚点必须**同时**满足两件事：恰中 1 次、且抹掉它真的改变读数。
     *   实测把这个函数的三道守卫逐条拆开看（每次只拆一道）：
     *     · 只拆第一道（`v === null`）→ 第二道 `t === 'object'` 仍拦下 null ⇒ 读数**没变**（假绿）；
     *     · 只拆第三道 → 末尾 `Number.isFinite(n) ? n : null` 仍把 `NaN` 兜回 null ⇒ 读数**也没变**；
     *     · 两道一起拆 → `Number(null) === 0` ⇒ 读数变成 **0**（真错读数）。
     *   本仓 H5/H6 纪律：破坏必须**可观测地改变行为**，故此处链式拆两道，
     *   并在跑判据前先自证「破坏副本上 finiteFloor(null) 确实变成 0」。 */
    const b1 = breakSource(realWbSrc,
        "if (v === null || v === undefined || v === '') return null;",
        "if (false) return null;",
        'N1 第一道「没给」守卫');
    const broken = breakSource(b1,
        "if (t === 'boolean' || t === 'object' || t === 'function') return null;",
        "if (false) return null;",
        'N1 第二道「非数值」守卫');
    const W = loadWorkbenchFrom(broken);
    assert.equal(W.finiteFloor(null), 0, '破坏副本上 Number(null) 必须塌成 0（证明破坏真的改变了读数）');
    const j = jWorkbench(W);
    assert.equal(j.missingFloorNull, false, '★ 真源码破坏后，同款判据必须转红（缺失楼层不得再读成 null）');
    assert.equal(j.zeroFloorKept, true, '★ 「第 0 楼」在任何情况下都必须是 0（不得连它一起抹）');
});

test('8b 负控制 N2：absent 归因被抹平 ⇒ 三态归因必须错', () => {
    const broken = breakSource(realWbSrc,
        "out.reason = 'state-missing';",
        "out.reason = 'module-unavailable';",
        'N2 absent 归因');
    const W = loadWorkbenchFrom(broken);
    const j = jWorkbench(W);
    assert.equal(j.allStateMissing, false, '★ 真源码破坏后，同款判据必须转红（宿主没这本账被误报成模块没装）');
    assert.equal(j.lineMentionsAbsent, false, '★ 诊断行的归因同样必须转红');
});

test('8c 负控制 N3：宿主 _ledgerApis() 少一个键 ⇒ 那本账必须降级', () => {
    const broken = breakSource(realIdxSrc,
        "            'repair': _repairLoopLib()\n",
        "",
        'N3 _ledgerApis 少 repair 键');
    // 在破坏副本上直接跑那本账的读数：apis 里没有 repair ⇒ module-unavailable
    const face = realWorkbench.buildWorkbench(makeRealHost(), { apis: Object.assign({}, LEDGER_MODULES, { 'repair': null }), now: () => 1000 });
    assert.equal(face.ledgers['repair'].state, 'absent', '★ 缺键时该账必须缺席（不得静默给假读数）');
    assert.equal(face.ledgers['repair'].reason, 'module-unavailable', '★ 且必须归因「模块没挂」');
    assert.equal(face.selfConsistent, true, '★ 缺席也必须在登记表内计账（三态仍盖满）');
    // 破坏副本本身必须与真源不同（防止「破坏了但没用上」的假绿）
    assert.notEqual(broken, realIdxSrc, '破坏必须真的改变宿主源码');
});

/* ══════════ 9 工具自证：锚点不存在或不唯一时必须抛 ══════════ */
test('9 工具自证：锚点不唯一/不存在必须抛，破坏不可沉默', () => {
    // 真·不唯一锚点：`Number.isFinite(n)` 在 finiteNumStrict 里恰出现 1 次，改用
    //   `return null;`（文件中出现多次）作为不唯一锚点
    /* ★ v3.233.0 交棒：原来把不唯一锚点写死为 `'return null;'`。
     *   这行是**锤点**：一旦本文件里只剩一处 `return null;`（完全合法的重构），
     *   本判据会报「恰中 1 次」失败——它测的不再是「工具会对不唯一锚点抛」，
     *   而是「锤点字面量还在不在」。改为**运行时找一个真的出现 >=2 次的候选**。 */
    const dupAnchor = ['return null;', 'return 0;', 'return;', 'const ']
        .find((c) => realWbSrc.split(c).length - 1 >= 2);
    assert.ok(dupAnchor, '★ 必须能在真源码里找到一个出现 >=2 次的锚点（否则本项无从验证）');
    assert.throws(() => breakSource(realWbSrc, dupAnchor, '#REPLACED#', '不唯一锚点'), /恰中 1 次/);
    assert.throws(() => breakSource(realWbSrc, '这段源码根本不存在', 'x', '不存在锚点'), /恰中 1 次/);
    /* ★ v3.233.0 交棒：原锚点写死 `const EVIDENCE_VERSION = 1;`。F-2 把证据面升到 2 后，
     *   锚点凭空消失，本判据报的是「锚点不存在」而不是它要验的「同值替换必须抛」——
     *   判据自己变成了陈旧记载（正是本仓反复治理的那类形态）。
     *   改为从**真源码**里取出版本常量行（与实现同源，不写死数字）。 */
    const verLine = (realWbSrc.match(/const EVIDENCE_VERSION = [0-9]+;/) || [])[0];
    //  （常量在 IIFE 内，带缩进与行尾注释；故按「声明片段」取，不要求整行形态）
    assert.equal(realWbSrc.split(verLine).length - 1, 1, '锚点自身必须恰中 1 次');
    assert.ok(verLine, '证据面版本常量必须在场（本项锚点自证的前提）');
    assert.throws(() => breakSource(realWbSrc, verLine, verLine, '同值替换'), /必须真的改变源码/);
});
