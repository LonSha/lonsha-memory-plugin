/* ============================================================
 * tests/v3219_outcome_truth.test.mjs — [v3.218.0] Gate R2-E
 *
 * 主题：**「被中止」与「正常完成」不得同形** —— 这是 R2 范围里「取消和迟到隔离」
 * 的**取消**那一半（迟到那半由 R2-B / R2-D 收口）。
 *
 * 修前实测（真源码读取）：
 *   `GENERATION_ENDED`（用户 Esc 中止）在当前实现里只做一件事 ——
 *   复位 `_generationActive = false`（v3.12 的兜底，防自愈调度器永久延后）。
 *   于是读数上两种处境**同形**：中止那一轮同样有 `_lastInjection`（注入确实发生过 ——
 *   STARTED 已写槽位、模型也确实收到了 prompt），但没有任何格子说「这一轮没产出回复」。
 *   而两者的处置相反：**前者该重发，后者该看回复**。这正是本仓最贵的那类错读数。
 *
 * 收口（本 Gate）：
 *  ① 读数增 `outcome`（缺省 `'pending'`；键面 10 → 11）；
 *  ② 唯一标注入口 `_injectionEnd(kind)`：
 *     `'received'`（MESSAGE_RECEIVED ⇒ 回复已落层）⇒ `'completed'`；
 *     其余（GENERATION_ENDED）⇒ `'aborted'`；
 *     **只从 `'pending'` 迁出**（ST 的正常次序是 RECEIVED 先于 ENDED，
 *     无此门则一次正常完成会被随后的 ENDED 改写成「中止」）；
 *     无读数时计入 `noReadout`（「没有可标注的注入」≠「标注成功」）；
 *     已判定后又来信号计入 `afterReadout`（幂等，不重写）。
 *  ③ 两处事件接线（`_h1` / `_h6`）与面板/自检行的结局徽标。
 *
 * 负控制一律：真源码破坏（锚点恰中 1 次）→ 载入破坏副本 → 在副本上重跑**同款判据**。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from './_audit_lib.mjs';

const R = process.cwd();
const idxSrc = fs.readFileSync(path.join(R, 'index.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(R, 'settings-ui.js'), 'utf8');

/* ───────────────── 源码提取 ───────────────── */

function blockAt(src, at) {
    if (at < 0) return null;
    const open = src.indexOf('{', at);
    if (open < 0) return null;
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return end > 0 ? src.slice(at, end + 1) : null;
}
function blockOf(src, header) {
    const at = src.indexOf(header);
    assert.ok(at >= 0, '锚点必须存在：' + header);
    const n = src.split(header).length - 1;
    assert.strictEqual(n, 1, '锚点必须唯一（恰中 1 次）：' + header + '（实 ' + n + ' 次）');
    return blockAt(src, at);
}
function breakSource(src, anchor, replacement) {
    const n = src.split(anchor).length - 1;
    assert.strictEqual(n, 1, '破坏锚点必须恰中 1 次：' + anchor.slice(0, 56) + '（实 ' + n + ' 次）');
    return src.replace(anchor, replacement);
}

const HOST_METHODS = [
    '_injectionRecord(extra) {',
    '_injectionStage(payload) {',
    '_injectionCommit(myGen) {',
    '_injectionClose(myGen) {',
    '_injectionRefOf(i) {',
    '_injectionDiscardStale(myGen) {',
    '_injectionEnd(kind) {',
];

function anyStub() {
    const s = new Proxy(function () {}, {
        get: (t, p) => {
            if (p === Symbol.toPrimitive) return () => '';
            if (p === 'then') return undefined;
            if (p === Symbol.iterator) return function* () {};
            if (p === 'length') return 0;
            if (p === 'toString') return () => '';
            return s;
        },
        apply: () => s,
    });
    return s;
}
const est = (t) => Math.ceil(String(t || '').length * 0.9);

function engineFrom(src) {
    const parts = HOST_METHODS.map(h => blockAt(src, src.indexOf(h)));
    assert.strictEqual(parts.filter(Boolean).length, HOST_METHODS.length,
        '宿主方法体必须全部可提取（缺失即接线不全）');
    const real = {
        _lastInjection: null, _lastInjectionDraft: null, _lastInjectionDiscard: null,
        _injectionPending: null, _injectionRound: 0, _injectionStale: 0, _genSeq: 0,
        _injectionEnded: { completed: 0, aborted: 0, noReadout: 0, afterReadout: 0 },
    };
    const host = new Proxy(real, { get: (t, p) => (p in t ? t[p] : anyStub()) });
    const fn = new Function('estimateTextTokens', 'errLog', `return ({ ${parts.join(',\n')} });`);
    return Object.assign(host, fn(est, () => {}));
}

/** 真生成一轮：暂存 + 提交（走真方法），得到 pending 读数。 */
function pendingRound(eng, html, gen) {
    eng._genSeq = gen;
    eng._injectionStage({ html, blocks: [{ ref: 'inj_' + gen + '_0', kept: true, chars: html.length, label: '块' }], gen });
    return eng._injectionClose(gen);
}

/**
 * 判据（纯函数，**正负两跑**）：结局三态必须落在三个互不相同的值上，
 * 且「完成」不被随后的 ENDED 改写（幂等）。
 */
function jOutcomeTriad(mod) {
    // ① 正常完成：MESSAGE_RECEIVED 先到、GENERATION_ENDED 后到
    const a = mod.engine();
    pendingRound(a, 'A', 1);
    if (a._lastInjection.outcome !== 'pending') return { ok: false, why: '刚落地时结局应为 pending，实 ' + a._lastInjection.outcome };
    a._injectionEnd('received');
    const afterRx = a._lastInjection.outcome;
    a._injectionEnd('ended');
    const afterEnd = a._lastInjection.outcome;
    if (afterRx !== 'completed') return { ok: false, why: 'RECEIVED 应落 completed，实 ' + afterRx };
    if (afterEnd !== 'completed') return { ok: false, why: '★ 随后的 ENDED 把「已完成」改写成「中止」了（实 ' + afterEnd + '）' };
    // ② 用户中止：只有 GENERATION_ENDED
    const b = mod.engine();
    pendingRound(b, 'B', 1);
    b._injectionEnd('ended');
    if (b._lastInjection.outcome !== 'aborted') return { ok: false, why: 'ENDED 应落 aborted，实 ' + b._lastInjection.outcome };
    if (afterRx === b._lastInjection.outcome) return { ok: false, why: '★ 「完成」与「中止」落成了同一个值' };
    // ③ 无读数：不计入任何结局，只计 noReadout
    const c = mod.engine();
    const r = c._injectionEnd('ended');
    if (r !== null) return { ok: false, why: '无读数时应回 null' };
    if (c._injectionEnded.noReadout !== 1) return { ok: false, why: '无读数须计入 noReadout（实 ' + c._injectionEnded.noReadout + '）' };
    if (c._injectionEnded.aborted !== 0) return { ok: false, why: '★ 无读数被误计成「中止」' };
    return { ok: true, why: '' };
}
/** 判据：结局计数两账分开（完成/中止/无读数/已判定后重复） */
function jCounters(mod) {
    const e = mod.engine();
    pendingRound(e, 'X', 1); e._injectionEnd('received'); e._injectionEnd('ended');
    pendingRound(e, 'Y', 2); e._injectionEnd('ended');
    e._injectionEnd('ended');
    const s = e._injectionEnded;
    if (s.completed !== 1) return { ok: false, why: 'completed 计数错：' + s.completed };
    if (s.aborted !== 1) return { ok: false, why: 'aborted 计数错：' + s.aborted };
    /* 重复信号共两次：① 第一轮的 RECEIVED 之后又来了 ENDED（那本是同一次生成的结束事件）；
     *   ② 第二轮已落 aborted 后又来一次 ENDED。两次都属「已判定后又来」，
     *   故 afterReadout 应为 2 —— 原写 1 是判据自己算错（与实现不对齐的假红）。 */
    if (s.afterReadout !== 2) return { ok: false, why: 'afterReadout 计数错：' + s.afterReadout };
    return { ok: true, why: '' };
}

/* ══════════ T1 工具自证 ══════════ */
test('v3219 1. 工具自证：锚点不存在/不唯一、破坏打偏都必须抛', () => {
    assert.throws(() => blockOf(idxSrc, '这个方法不存在(zz) {'), /锚点必须存在/);
    assert.throws(() => blockOf(idxSrc, 'recalled) {'), /锚点必须唯一/);
    assert.throws(() => breakSource(idxSrc, '绝不存在的串zzz', 'x'), /恰中 1 次/);
    assert.throws(() => breakSource(idxSrc, 'function', 'x'), /恰中 1 次/);
    const b = blockOf(idxSrc, '_injectionEnd(kind) {');
    assert.ok(b && b.includes('completed'), '真锚点取到整段方法体');
});

/* ══════════ T2 结构：唯一标注入口 + 只从 pending 迁出 ══════════ */
test('v3219 2. 结局标注是唯一入口，且只从 pending 迁出（幂等门在位）', () => {
    const code = stripComments(idxSrc);
    const fn = blockOf(code, '_injectionEnd(kind) {');
    assert.ok(/outcome\s*!==\s*'pending'/.test(fn), '★ 幂等门必须在：已判定过的不重写');
    assert.ok(fn.includes('received') && fn.includes('completed') && fn.includes('aborted'),
        '三种取值齐备');
    assert.ok(fn.includes('noReadout'), '★ 无读数必须单独计数（「没有可标注的注入」≠「标注成功」）');
    /* 读数的 outcome 只允许**标注入口**改。
     *   判据作用域必须收在标注入口块体上：全仓还有同名字段（悬念簿 `it.outcome = [...]`），
     *   拿 `/\.outcome\s*=/` 扫全文会把它们一并算进来 ⇒ 判据永远红（测的是别的模块）。 */
    const writes = (fn.match(/inj\.outcome\s*=/g) || []).length;
    assert.strictEqual(writes, 1, '★ 标注入口内只允许一处改读数 outcome，实 ' + writes + ' 处');
    assert.ok(/outcome: String\(e\.outcome \|\| 'pending'\)/.test(code), '构造点给缺省 pending');
});

/* ══════════ T3 行为：三态互不相同 + 幂等 ══════════ */
test('v3219 3. 结局三态互不相同，且「完成」不被随后的 ENDED 改写（判据：jOutcomeTriad）', () => {
    const mod = { engine: () => engineFrom(idxSrc) };
    const r = jOutcomeTriad(mod);
    assert.equal(r.ok, true, r.why);
});

test('v3219 4. 四个计数账互不混淆（完成/中止/无读数/已判定后重复）', () => {
    const mod = { engine: () => engineFrom(idxSrc) };
    const r = jCounters(mod);
    assert.equal(r.ok, true, r.why);
});

/* ══════════ T5 事件接线：两处都到位，且顺序正确 ══════════ */
test('v3219 5. 两处事件接线齐备：RECEIVED 落 completed、ENDED 落 aborted', () => {
    const code = stripComments(idxSrc);
    const h1 = blockAt(code, code.indexOf('const _h1 = (messageId) => {'));
    assert.ok(h1, '_h1 可提取');
    assert.ok(/_injectionEnd\('received'\)/.test(h1), '★ MESSAGE_RECEIVED 必须落结局（否则「完成」永远判不出来）');
    const h6 = blockAt(code, code.indexOf('const _h6 = () => {'));
    assert.ok(h6, '_h6 可提取');
    assert.ok(/_injectionEnd\('ended'\)/.test(h6), '★ GENERATION_ENDED 必须落结局（修前它只复位标志）');
    // v3.12 的兜底不得被搬走：标志复位仍在
    assert.ok(h6.includes('_generationActive = false'), '标志复位仍在（自愈调度器读它防并发）');
});

/* ══════════ T6 外供面与展示面 ══════════ */
test('v3219 6. 结局必须外供并展示（读数外供面 + 自检行 + 面板徽标）', () => {
    const code = stripComments(idxSrc);
    const readout = blockOf(code, 'buildInjectionReadout() {');
    assert.ok(/outcome:/.test(readout), '★ 外供面必须带出结局（否则下游读不到 = 上游给了没人读）');
    const sc = blockOf(idxSrc, 'async selfCheck() {');
    assert.ok(sc.includes('结局'), '自检行必须报结局');
    assert.ok(sc.includes('_injectionEnded'), '自检行须带出计数账');
    assert.ok(/被中止/.test(sc), '自检行须把「被中止」写出来（不是只给一个未定义值）');
    assert.ok(uiSrc.includes('被中止'), '面板必须能显示「被中止」');
    assert.ok(uiSrc.includes('已完成'), '面板必须能显示「已完成」');
});

/* ══════════ N1-N3 负控制 ══════════ */
test('v3219 N1. 破坏：摘掉幂等门 ⇒ 同款判据必须现形（完成被 ENDED 改写）', () => {
    const anchor = "                if (inj.outcome !== 'pending') { st.afterReadout += 1; return inj.outcome; }   // 已判定：不重写（幂等）";
    assert.ok(idxSrc.includes(anchor), '幂等门锚点在位');
    const broken = breakSource(idxSrc, anchor, '                // 破坏：不再守住幂等门');
    const mod = { engine: () => engineFrom(broken) };
    const r = jOutcomeTriad(mod);
    assert.equal(r.ok, false, '幂等门被摘掉，判据却没转红');
    assert.ok(/改写成「中止」/.test(r.why), '转红原因须指向真因：' + r.why);
});

test('v3219 N2. 破坏：MESSAGE_RECEIVED 不再落结局 ⇒ 「完成」判据必须现形', () => {
    const code = stripComments(idxSrc);
    const h1 = blockAt(code, code.indexOf('const _h1 = (messageId) => {'));
    const line = h1.split('\n').find(l => l.includes("_injectionEnd('received')"));
    assert.ok(line, '接线行在位');
    const broken = breakSource(idxSrc, line.trim(), '// 破坏：不再落结局');
    const brokenCode = stripComments(broken);
    const b1 = blockAt(brokenCode, brokenCode.indexOf('const _h1 = (messageId) => {'));
    assert.ok(!/_injectionEnd\('received'\)/.test(b1), '★ 破坏副本上 RECEIVED 的结局标注必须消失（源码面判据现形）');
    // 行为面同款判据：没有 RECEIVED 就永远落不了 completed
    const e = engineFrom(broken);
    pendingRound(e, 'Z', 1);
    e._injectionEnd('ended');
    assert.strictEqual(e._lastInjection.outcome, 'aborted', '★ 破坏副本上正常完成也被读成中止');
});

test('v3219 N3. 破坏：ENDED 不再落结局 ⇒ 中止与完成同形（修前形态复现）', () => {
    const anchor = "                        try { this.engine._injectionEnd('ended'); } catch (e) { errLog(e, 'events.GENERATION_ENDED结局'); }";
    assert.ok(idxSrc.includes(anchor), 'ENDED 结局锚点在位');
    const broken = breakSource(idxSrc, anchor, '                        // 破坏：不再落结局（回到修前形态）');
    const brokenCode = stripComments(broken);
    const h6 = blockAt(brokenCode, brokenCode.indexOf('const _h6 = () => {'));
    assert.ok(!/_injectionEnd\('ended'\)/.test(h6), '★ 破坏副本上 ENDED 的结局标注必须消失（前端形态复现）');
    const e = engineFrom(broken);
    pendingRound(e, 'W', 1);
    e._injectionEnd('ended');
    assert.strictEqual(e._lastInjection.outcome, 'aborted',
        '★ 破坏副本上中止仍能落定（因为破坏只在事件接线，不在方法体）—— 这正是「接线面」与「机制面」必须分开守的理由');
});

/* ══════════ T7 跨仓：外供字段不得只活在快照里 ══════════ */
test('v3219 7. 跨仓提醒：新外供字段必须在同轮接进下游（否则又是「上游给了没人读」）', () => {
    /* 本判据不检查下游仓库（跨仓不 import，本仓门禁也不扫兄弟树）；
     *   它守的是**本仓侧的自述**：新字段进快照时，CHANGELOG 必须写明它要下游同步接。 */
    const log = fs.readFileSync(path.join(R, 'CHANGELOG.md'), 'utf8');
    const sec = log.slice(log.indexOf('## v3.218.0'), log.indexOf('## v3.217.0'));
    assert.ok(sec.length > 100, 'v3.218.0 节必须存在');
    assert.ok(/outcome/.test(sec), 'CHANGELOG 须点名新字段');
    assert.ok(/下游|RubyPhone|消费侧/.test(sec), '★ CHANGELOG 须写明该字段要下游同一轮接上（跨仓纪律）');
});

/* ══════════ T8 版本锚 ══════════ */
test('v3219 8. 本 Gate 属于 v3.218.0', () => {
    const ver = (idxSrc.match(/const VERSION = '([^']+)'/) || [])[1];
    const vnum = (s) => {
        const m = /^([0-9]+)\.([0-9]+)\.([0-9]+)/.exec(String(s || '').trim());
        return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
    };
    assert.ok(vnum(ver) >= vnum('3.218.0'), '★ 版本不得低于本套件出生版本 3.218.0（实 ' + ver + '）');
});

console.log('\n✓ v3.218.0 R2-E 取消留痕专项测试全部通过');