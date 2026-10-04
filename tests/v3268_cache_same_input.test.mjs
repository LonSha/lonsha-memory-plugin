/* ============================================================
 * tests/v3268_cache_same_input.test.mjs — [v3.267.0 · A3 缓存正确性回归加固]
 *
 * 主题：把「正确性被静默打掉」的**同输入退化模式**在 stale-guard 与投影新鲜度守卫上
 *       补成常驻断言。本档只加断言，**不改产品**（实测两处当前均正确，见下）。
 *
 * 修前实测（本轮真跑取证，不是推测）：
 *   ① `stale-guard.js` 的 `createChangeSet()` 同输入 ⇒ 同 `id` / 同 `payloadFingerprint`，
 *      且与时钟无关（两次调用之间强推时钟，读数逐字不变）—— 这是**幂等键**的承重面：
 *      一旦有人把 `createdAt: Date.now()` 之类写进指纹 seed，幂等键就会每轮换一个，
 *      同幂等键重放/冲突判定（`checkIdempotency`）随之整体失灵。
 *      实测破坏：seed 塞 `createdAt` ⇒ 两次同输入 `id` 变成 `cs_d5c932ad` vs `cs_a36af31a`（真转红）。
 *   ② `validateChangeSet()` 的 `behind` 门控（base 落后 ⇒ 必须要求状态指纹）：
 *      实测破坏（`if (behind)` → `if (false)`）⇒ `no-fingerprint` 整条消失（真转红）；
 *      而「读集缺失」那条 stale 判据不受连坐（两条闸互不遮蔽）。
 *   ③ `index.js` 的投影新鲜度**面**（`meta.projectionFreshness`）导出键集恰为
 *      `dropped / from / reason / to`；实测破坏（往面里塞 `at: Date.now()`）⇒ 键集变
 *      `at,dropped,from,reason,to`（真转红）。
 *
 *   ★ 为什么本档判「**结构面**同输入」而不是「字节面同输入」（本轮取证的关键分寸）：
 *     投影面里合法地存在时刻字段（`_projectionDropped.at` 是**内部**留痕，不外供；
 *     快照顶层 `exportedAt` 是生成时刻）。实测：往面里塞时钟位之后，
 *     **键集**在强推时钟前后逐字稳定（可判），而**值**随时钟变化（不可判 —— 值断言必 flaky）。
 *     故本档一律锁键集/三态/原因，不锁时刻值：这是「判据不能比被测物更脆」的分寸。
 *
 * 覆盖：
 *   A  纯函数面（stale-guard）：同输入同 id/指纹（跨时钟）、键序无关、不改入参、
 *      幂等键形态、三态（ok/stale/invalid）与 behind 门控形态
 *   B  投影新鲜度面：同实例重复导出同形、不同实例同形、三态（同代/丢弃/本来没这面）键集冻结
 *   C  负控制：真源码破坏（seed 塞时钟 / behind 门控摘掉 / 面里塞时钟位 / 面里缺一键）
 *      ⇒ 同款真判据必须转红；阳性对照在原件上必须真成立（两向）
 *   D  工具两向自证：锚点不存在 / 锚点不唯一 / 同值替换 ⇒ 必须抛
 *   E  台账：参考基准登记（跨仓守卫 P3）+ 破坏工具接收方台账（v3247 B1）
 *   F  版本锚（出生下界 3.267.0）
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { breakSource } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ok = (m) => console.log('  ✓ ' + m);

const SG_SRC = read('stale-guard.js');
const IDX_SRC = read('index.js');

/* ══════════ 真源装载（两份：原件 / 破坏副本 走同一段代码） ══════════ */

/** stale-guard：IIFE 双导出，可直接在 Function 里装载（与 v3104 同规格）。 */
function loadSG(src) {
    const sbox = { module: { exports: {} }, window: undefined };
    const fn = new Function('globalThis', 'module', 'window',
        src + "\nreturn (typeof module !== 'undefined' && module.exports) ? module.exports : globalThis.LonShaStaleGuard;");
    return fn(sbox, sbox.module, undefined);
}

/** 从真源码抽类方法体（花括号计数）；找不到返回 null。与 v3212/v3213 同款。 */
function extractMethod(source, name) {
    const marker = name + '() {';
    const start = source.indexOf(marker);
    if (start < 0) return null;
    const bodyStart = source.indexOf('{', start);
    let depth = 0, end = -1;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return end > 0 ? source.slice(start, end + 1) : null;
}

const SNAP_BODY = extractMethod(IDX_SRC, 'buildBridgeSnapshot');
assert.ok(SNAP_BODY, 'index.js 缺 buildBridgeSnapshot 方法体（拿不到被测主体）');

const require = createRequire(import.meta.url);
const P = require(path.join(ROOT, 'projection-pipeline.js'));

/** 用**真方法体**造实例（不是模拟常量：判据必须跑在真源码上）。 */
function makeEngine(src, host = {}) {
    const body = extractMethod(src, 'buildBridgeSnapshot');
    const win = { SillyTavern: { getContext: () => ({ chat: [{}] }) } };
    const eng = new Function('VERSION', 'errLog', 'window', `return ({ ${body} });`)
        ('3.267.0-test', () => {}, win);
    return Object.assign(eng, host);
}
const envFor = (conv, rev) => P.buildEnvelope(null, { scope: { conversationId: conv }, revision: rev, nowProvider: () => 1000 });
const BASE_HOST = { clock: null, worldProg: null, moneyLedger: null, outline: null, status: null, _summarizeRecallAudit: null };

/** 强推时钟：同一次 tick 内 `Date.now()` 必须真的前进（否则「跨时钟」是空转）。 */
function tick() {
    const t0 = Date.now();
    let n = 0;
    while (Date.now() === t0 && n < 5e6) n++;
    return Date.now() !== t0;
}

/* ══════════ 判据（正/负控制共用同一份；返回普通值，不抛） ══════════ */

const csArgs = () => ({
    chatId: 'c1', baseRevision: 3, taskId: 't9',
    operations: [{ type: 'add', target: 'm1' }, { type: 'del', target: 'm2' }],
    readIds: ['m0'], sourceRefs: ['r1'], readStateFingerprint: 'fp-1',
});

/** A1 同输入 ⇒ 同幂等键（跨时钟）。为什么排除 createdAt：它是**生成时刻**不是指纹输入。 */
function judgeSameInputKey(mod) {
    const g = () => { const o = mod.createChangeSet(csArgs()); return { id: o.id, fp: o.payloadFingerprint, key: o.idempotencyKey }; };
    const a = g();
    const advanced = tick();
    const b = g();
    return { ok: a.id === b.id && a.fp === b.fp && a.key === b.key, advanced, a, b };
}

/** A2 键序无关：入参键序不同 ⇒ 同 id。（指纹必须建立在稳定序列化上。） */
function judgeKeyOrderFree(mod) {
    const k1 = mod.createChangeSet({ chatId: 'c1', baseRevision: 1, operations: [{ target: 'x', type: 'add' }] });
    const k2 = mod.createChangeSet({ baseRevision: 1, operations: [{ type: 'add', target: 'x' }], chatId: 'c1' });
    return { ok: k1.id === k2.id && k1.payloadFingerprint === k2.payloadFingerprint, k1: k1.id, k2: k2.id };
}

/** A3 纯函数：判定/规划/摘要三入口都不得改入参。 */
function judgeNoMutate(mod) {
    const cs = mod.createChangeSet(csArgs());
    const cur = { chatId: 'c1', revision: 5, availableIds: ['m0', 'm1', 'm2', 'r1'], stateFingerprint: 'fp-1' };
    const cs0 = JSON.stringify(cs), cur0 = JSON.stringify(cur);
    mod.validateChangeSet(cs, cur);
    mod.planCommit(cs, cur, {});
    mod.summarize(cs, cur);
    return { ok: JSON.stringify(cs) === cs0 && JSON.stringify(cur) === cur0 };
}

/** A4 三态形态可分（ok / stale / invalid 各一个真场景，三者不得同形）。 */
function judgeTriState(mod) {
    const mk = (over) => mod.createChangeSet(Object.assign({ chatId: 'c1', baseRevision: 9, operations: [{ target: 'z' }] }, over));
    const okRes = mod.validateChangeSet(mk({}), { chatId: 'c1', revision: 9, availableIds: ['z'] });
    const staleRes = mod.validateChangeSet(mk({ readIds: ['m0'] }), { chatId: 'c1', revision: 9, availableIds: ['z'] });
    const invalidRes = mod.validateChangeSet(mk({ sourceRefs: ['nope'] }), { chatId: 'c1', revision: 9, availableIds: ['z'] });
    const kinds = [okRes.kind, staleRes.kind, invalidRes.kind];
    return { ok: new Set(kinds).size === 3, kinds };
}

/** A5 behind 门控：base 落后 ⇒ 必须要求状态指纹（否则「指纹不符」这条闸永不响）。 */
function judgeBehindGate(mod) {
    const cs = mod.createChangeSet({ chatId: 'c1', baseRevision: 1, operations: [{ target: 'z' }] });
    const r = mod.validateChangeSet(cs, { chatId: 'c1', revision: 9, availableIds: ['z'] });
    /* 阳性对照：指纹在场且不符 ⇒ state-changed；两条都必须在同一条门控下。 */
    const cs2 = mod.createChangeSet({ chatId: 'c1', baseRevision: 1, operations: [{ target: 'z' }], readStateFingerprint: 'old' });
    const r2 = mod.validateChangeSet(cs2, { chatId: 'c1', revision: 9, availableIds: ['z'], stateFingerprint: 'new' });
    return {
        ok: r.issues.includes('no-fingerprint') && r.kind === 'stale'
            && r2.issues.includes('state-changed') && r2.kind === 'stale',
        noFp: r.issues.join('|'), changed: r2.issues.join('|'),
    };
}

/** B1 投影新鲜度**面**的键集（排序后字符串；面缺席 ⇒ 'null'）。 */
function faceKeys(engine) {
    const s = engine.buildBridgeSnapshot();
    if (!s || !s.meta) return '<no-snap>';
    const f = s.meta.projectionFreshness;
    return f === null || f === undefined ? 'null' : Object.keys(f).sort().join(',');
}

/** B2 同一份输入下的**结构面**（present / 会话 / 键集 / 丢弃归因）——不含时刻。 */
function structuralFace(engine) {
    const s = engine.buildBridgeSnapshot();
    if (!s) return { snap: false };
    const ft = (s.meta && s.meta.fieldTypes && s.meta.fieldTypes.projection) || {};
    const d = engine._projectionDropped;
    return {
        snap: true,
        present: !!ft.present,
        kind: ft.kind === undefined ? null : ft.kind,
        conv: s.projection ? String(s.projection.conversationId) : null,
        keys: faceKeys(engine),
        drop: d ? [String(d.reason), String(d.from), String(d.to)].join('|') : null,
    };
}

/* ══════════ A 纯函数面：stale-guard 同输入不变量 ══════════ */

test('A1. ★★★ 同输入 ⇒ 同幂等键，且**跨时钟**不变（幂等重放/冲突判定的承重面）', () => {
    const SG = loadSG(SG_SRC);
    const j = judgeSameInputKey(SG);
    assert.equal(j.advanced, true, '夹具失效：同一次 tick 内时钟没前进，「跨时钟」是空转');
    assert.equal(j.ok, true, '同输入必须同 id/指纹/幂等键：' + j.a.id + ' vs ' + j.b.id);
    assert.equal(j.a.key, 'change-set:' + j.a.id, '幂等键必须由 id 派生（形态契约）');
    ok('同输入同键，跨时钟稳定（' + j.a.id + '）');
});

test('A2. ★★ 键序无关：入参键序不同 ⇒ 同 id（指纹必须建于稳定序列化）', () => {
    const j = judgeKeyOrderFree(loadSG(SG_SRC));
    assert.equal(j.ok, true, '键序不同却换了 id：' + j.k1 + ' vs ' + j.k2);
    ok('键序无关');
});

test('A3. ★★ 纯函数：validate / planCommit / summarize 三入口都不得改入参', () => {
    const j = judgeNoMutate(loadSG(SG_SRC));
    assert.equal(j.ok, true, '判定入口改了入参（第二次调用会读到被污染的读数）');
    ok('三入口均不改入参');
});

test('A4. ★★★ 三态形态可分：ok / stale / invalid 各一真场景，不得同形', () => {
    const j = judgeTriState(loadSG(SG_SRC));
    assert.equal(j.ok, true, '三种形态塌成同形（读者无从归因）：' + j.kinds.join('/'));
    assert.deepEqual(j.kinds, ['ok', 'stale', 'invalid'], '三态名与顺序即契约');
    ok('三态可分：' + j.kinds.join('/'));
});

test('A5. ★★★ behind 门控：base 落后 ⇒ 缺指纹必须点名，指纹不符 ⇒ state-changed', () => {
    const j = judgeBehindGate(loadSG(SG_SRC));
    assert.equal(j.ok, true, 'behind 门控形态不符：无指纹=' + j.noFp + ' / 不符=' + j.changed);
    ok('behind 两条判据各就位（' + j.noFp + ' / ' + j.changed + '）');
});

/* ══════════ B 投影新鲜度面：同输入同形 + 键集冻结 ══════════ */

test('B1. ★★★ 同输入同形（同实例重复导出 / 不同实例）与三态键集冻结', () => {
    const same = makeEngine(IDX_SRC, { ...BASE_HOST, _lastProjectionEnvelope: envFor('chat-A', 4), getCurrentChatId: () => 'chat-A', _mutationEpoch: 4 });
    const f1 = structuralFace(same), f2 = structuralFace(same);
    assert.deepEqual(f2, f1, '★ 同实例同输入两次导出必须同形（否则读数不可复现）');
    assert.equal(f1.present, true, '★ 同代必须照常导出（阳性对照：守卫不得把正常路径拦掉）');
    assert.equal(f1.keys, 'null', '同代导出时不得留「丢弃」痕迹（null 与 {dropped:true} 两态必须可分）');

    const fresh = makeEngine(IDX_SRC, { ...BASE_HOST, _lastProjectionEnvelope: envFor('chat-A', 4), getCurrentChatId: () => 'chat-A', _mutationEpoch: 4 });
    assert.deepEqual(structuralFace(fresh), f1, '★ 不同实例同输入必须同形（judge 不得依赖实例身份）');

    const dropped = makeEngine(IDX_SRC, { ...BASE_HOST, _lastProjectionEnvelope: envFor('chat-A', 4), getCurrentChatId: () => 'chat-B', _mutationEpoch: 4 });
    const d1 = structuralFace(dropped), d2 = structuralFace(dropped);
    assert.deepEqual(d2, d1, '★ 丢弃态两次导出必须同形');
    assert.equal(d1.present, false, '会话不符必须不导出');
    assert.equal(d1.keys, 'dropped,from,reason,to', '★ 丢弃面键集即契约，实测 ' + d1.keys);
    assert.equal(d1.drop, 'stale-conversation|chat-A|chat-B', '丢弃必须可归因（扔掉了要说出来）');

    const none = makeEngine(IDX_SRC, { ...BASE_HOST, getCurrentChatId: () => 'chat-A', _mutationEpoch: 4 });
    const n1 = structuralFace(none);
    assert.equal(n1.keys, 'null', '「本来没这面」不得伪造丢弃原因');
    assert.notEqual(n1.keys, d1.keys, '★ 「扔掉了」与「本来就没这面」必须不同形');
    ok('同输入同形；键集冻结 ' + d1.keys + '；丢弃/缺席可分');
});

test('B2. ★★ 结构面判据不依赖时钟：面里若混入时刻位，键集必须现形（见 C3）', () => {
    /* 为什么单列这一条：值面对时钟敏感 ⇒ 值断言必 flaky。本档只锁结构面，
     *   故须证明「结构面在原件上确实稳定」，否则「结构稳定」是空话。 */
    const host = { ...BASE_HOST, _lastProjectionEnvelope: envFor('chat-A', 4), getCurrentChatId: () => 'chat-B', _mutationEpoch: 4 };
    const e1 = makeEngine(IDX_SRC, { ...host });
    const before = faceKeys(e1);
    tick();
    const e2 = makeEngine(IDX_SRC, { ...host });
    assert.equal(faceKeys(e2), before, '结构面跨时钟必须逐字稳定（判据不得比被测物更脆）');
    ok('结构面跨时钟稳定（' + before + '）');
});

/* ══════════ C 负控制：真源码破坏 ⇒ 同款真判据必须转红 ══════════ */

test('C1. ★★★★ 破坏·幂等键混入时钟（seed 塞 createdAt）⇒ A1 判据必须转红', () => {
    const broken = breakSource(SG_SRC, '        const seed = {', '        const seed = {\n            createdAt: Date.now(),', 'A1-seed-clock');
    const jBroken = judgeSameInputKey(loadSG(broken));
    assert.equal(jBroken.advanced, true, '夹具失效：时钟没前进，破坏副本的幂等键漂移测不出来（必 flaky）');
    assert.equal(jBroken.ok, false, '破坏后同输入仍同 id（判据未转红＝负控制无效）');
    assert.notEqual(jBroken.a.id, jBroken.b.id, '破坏后幂等键必须随时钟漂移：' + jBroken.a.id + ' vs ' + jBroken.b.id);
    /* 阳性对照：同一条判据在**原件**上必须为真（否则「转红」可能是判据恒红）。 */
    assert.equal(judgeSameInputKey(loadSG(SG_SRC)).ok, true, '阳性对照不成立：判据在原件上就红，证明不了任何事');
    /* 不连坐：这里必须挑**时钟无关**的判据。
     *   [本轮实测留痕] 首版拿 `judgeKeyOrderFree` 做「不连坐」，并发/慢机下偶发假红：
     *   键序判据比较两次 `createChangeSet()` 的 id，而破坏副本的 seed 已被塞进时钟
     *   ⇒ 两次调用之间跨过一毫秒就会各给一个 id ⇒ 「不连坐」在**破坏副本**上本来就该假。
     *   这正是本档开头那条纪律的反面教材：**判据不能比被测物更脆**。
     *   三态判据（A4）只比 kind，与时钟无关 —— 用它才证得成「这一处破坏不外溢」。 */
    assert.equal(judgeTriState(loadSG(broken)).ok, true, '只破坏 seed，不该连坐三态判据（读集/跨会话两条闸独立生效）');
    assert.equal(judgeNoMutate(loadSG(broken)).ok, true, '只破坏 seed，不该连坐「不改入参」判据');
    ok('seed 混时钟 ⇒ 幂等键逐轮漂移（' + jBroken.a.id + ' ≠ ' + jBroken.b.id + '）');
});

test('C2. ★★★ 破坏·behind 门控摘掉 ⇒ A5 判据必须转红（且不连坐读集闸）', () => {
    const broken = breakSource(SG_SRC, '        if (behind) {', '        if (false) {', 'A5-behind-gate');
    const jBroken = judgeBehindGate(loadSG(broken));
    assert.equal(jBroken.ok, false, '破坏后缺指纹不再点名（判据未转红＝负控制无效）');
    assert.equal(jBroken.noFp, '', '破坏后 no-fingerprint 必须整条消失，实测：' + jBroken.noFp);
    const jStale = judgeTriState(loadSG(broken));
    assert.equal(jStale.ok, true, '只摘 behind 门控，不该连坐三态判据（读集缺失那条闸独立生效）');
    assert.equal(judgeBehindGate(loadSG(SG_SRC)).ok, true, '阳性对照不成立');
    ok('behind 门控摘掉 ⇒ no-fingerprint 消失，读集闸不连坐');
});

test('C3. ★★★★ 破坏·投影面混入时刻位（面里塞 at）⇒ 键集冻结判据必须转红', () => {
    const FRESH = "return { dropped: true, reason: String(d.reason || 'unknown'), from: (d.from === undefined ? null : d.from), to: (d.to === undefined ? null : d.to) };";
    const broken = breakSource(IDX_SRC, FRESH, FRESH.replace(' };', ", at: Date.now() };"), 'B1-face-clock');
    const host = { ...BASE_HOST, _lastProjectionEnvelope: envFor('chat-A', 4), getCurrentChatId: () => 'chat-B', _mutationEpoch: 4 };
    const keysBroken = faceKeys(makeEngine(broken, { ...host }));
    assert.equal(keysBroken, 'at,dropped,from,reason,to', '破坏后键集必须现形，实测 ' + keysBroken);
    assert.equal(faceKeys(makeEngine(IDX_SRC, { ...host })), 'dropped,from,reason,to', '阳性对照不成立：原件键集就已不符');
    /* ★ 与 B2 呼应：键集在破坏副本上也跨时钟稳定 ⇒ 说明抓到的是**结构**漂移，
       不是「这次恰好时刻不同」（那会是 flaky 假红）。 */
    const e1 = makeEngine(broken, { ...host });
    const k1 = faceKeys(e1);
    tick();
    assert.equal(faceKeys(makeEngine(broken, { ...host })), k1, '破坏副本上的键集也必须跨时钟稳定（否则判据是 flaky）');
    ok('面里混时刻位 ⇒ 键集 +at 现形（且不靠时刻差异）');
});

test('C4. ★★★ 破坏·投影面缺一键（删 reason）⇒ 键集冻结判据必须两向都红', () => {
    const FRESH = "return { dropped: true, reason: String(d.reason || 'unknown'), from: (d.from === undefined ? null : d.from), to: (d.to === undefined ? null : d.to) };";
    const broken = breakSource(IDX_SRC, FRESH, FRESH.replace("reason: String(d.reason || 'unknown'), ", ''), 'B1-face-missing-key');
    const host = { ...BASE_HOST, _lastProjectionEnvelope: envFor('chat-A', 4), getCurrentChatId: () => 'chat-B', _mutationEpoch: 4 };
    const keysBroken = faceKeys(makeEngine(broken, { ...host }));
    assert.equal(keysBroken, 'dropped,from,to', '缺键必须现形（只锁「多了」不锁「少了」＝判据单向）：' + keysBroken);
    ok('面里缺 reason ⇒ 键集递减现形（两向都锁）');
});

/* ══════════ D 工具两向自证（H6）：破坏工具本身不得恒生效/恒失效 ══════════ */

test('D1. ★★ 工具两向自证：锚点不存在 / 锚点不唯一 / 同值替换 ⇒ 必须抛', () => {
    assert.throws(() => breakSource(SG_SRC, '__不存在的锚点__', 'x', 'D1'), assert.AssertionError,
        '锚点不存在仍放行 ⇒ 负控制会退化成对原文件断言');
    assert.throws(() => breakSource(SG_SRC + SG_SRC, '        const seed = {', 'X', 'D1'), assert.AssertionError,
        '锚点命中 2 次仍放行 ⇒ 破坏的不是那个点');
    assert.throws(() => breakSource(SG_SRC, '        const seed = {', '        const seed = {', 'D1'), assert.AssertionError,
        '同值替换仍放行 ⇒ 破坏副本等于原件');
    /* 反向：真锚点在原件上恰中 1 次（否则上面的 throws 只是「什么都拒」）。 */
    assert.equal(SG_SRC.split('        const seed = {').length - 1, 1, 'A1 锚点必须恰中 1 次');
    assert.equal(SG_SRC.split('        if (behind) {').length - 1, 1, 'A5 锚点必须恰中 1 次');
    assert.equal(IDX_SRC.split("return { dropped: true, reason: String(d.reason || 'unknown'), from: (d.from === undefined ? null : d.from), to: (d.to === undefined ? null : d.to) };").length - 1, 1,
        'B1 锚点必须恰中 1 次');
    ok('三条工具口径 + 三个真锚点唯一性两向成立');
});

test('D2. ★★ 判据纯度：本档只调用破坏工具，不在本地重写一份', () => {
    const own = read(path.join('tests', 'v3268_cache_same_input.test.mjs'));
    const DEFINE = /(?:^|\n)[ \t]*(?:export[ \t]+)?(?:async[ \t]+)?(?:function|const|let|var)[ \t]+(breakText|breakSource|mutateOnce|breakOnce|breakFile|assertSingleHit)[0-9A-Za-z_$]*[ \t]*[=(]/;
    const stripped = own.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal(DEFINE.test(stripped), false, '不得本地重写破坏工具（全仓只准 tests/_break_kit.mjs 一处）');
    assert.ok(/from\s*'\.\/_break_kit\.mjs'/.test(own), '必须从唯一真源 import');
    ok('判据一处实现（只调用，不重写）');
});

/* ══════════ E 台账：新增档必须登记进两张清单 ══════════ */

test('E1. ★★ 新建档在参考基准与破坏工具接收方两张台账里', () => {
    const SELF = 'v3268_cache_same_input.test.mjs';
    const catalog = read(path.join('tests', 'audit', 'catalog_reference_consumers.tsv'));
    assert.ok(catalog.split('\n').some((l) => l.startsWith(SELF + '\t')),
        '必须登记进参考基准（跨仓守卫 P3 会报「新增测试未登记」）');
    const registry = read(path.join('tests', 'v3247_break_kit_consolidation.test.mjs'));
    assert.ok(registry.includes("'" + SELF + "'"),
        '必须登记进破坏工具接收方台账（否则报「磁盘上新增了接收方却没登记」）');
    ok('两张台账均已覆盖');
});

/* ══════════ F 版本锚 ══════════ */

const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));

test('F1. ★ 版本锚（出生下界 3.267.0；三源同源）', () => {
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX_SRC) || [])[1];
    const pkg = JSON.parse(read('package.json'));
    const mf = JSON.parse(read('manifest.json'));
    assert.ok(vnum(codeVer) >= vnum('3.267.0'), '本档只在 3.267.0 及以后成立；当前 ' + codeVer);
    assert.equal(pkg.version, codeVer, 'package.json 必须与入口同版');
    assert.equal(mf.version, codeVer, 'manifest.json 必须与入口同版');
    ok('版本锚：' + codeVer);
});
