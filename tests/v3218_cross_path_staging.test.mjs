/* ============================================================
 * tests/v3218_cross_path_staging.test.mjs — [v3.217.0] Gate R2-D
 *
 * 主题：**暂存不得被别的路径 / 别的代捡起** —— 读数必须属于写它的那一次。
 *
 * R2-B（v3.216.0）把生成路径的读数落地推迟到代际确认之后，并立下「过期清暂存」。
 * 那是**同一条路径内**的迟到（一次 STARTED 内部 await 期间）。
 * 本 Gate 治的是它旁边那一类：**载荷由 A 路径留下、被 B 路径提交**。
 *
 * 修前实测两处（真源码读取，不是设计洁癖）：
 *  ① `_injectionCommit(myGen)` 只核对**调用者传进来的代**与当前代
 *     （`if (gen !== this._genSeq) return null`），**从不核对载荷自己的代**（`p.gen`）。
 *     于是任何「留下了暂存却没有提交」的路径，其载荷会被**下一轮的提交**当成自己的载荷
 *     落成读数 —— 读数的 `round` 照常推进，而 `gen` 却是上一代的那个值。
 *     这正是 R2-B 注释里点名过的「张冠李戴比不落地更坏」形态，只是来自另一侧：
 *     那里是「过期分支没清暂存」，这里是「**根本没人提交它**」。
 *  ② `window.lonsha_memory_interceptor`（保留的兼容发布路径）调
 *     `onBeforeGeneration()` 之后**只写注入槽位，从不提交/丢弃** ——
 *     它的暂存永久悬空，成为 ① 的现成供体（"部分 ST 版本通过 manifest generate_interceptor 调用"）。
 *
 * 收口（本 Gate）：
 *  · 提交前**先核对载荷自身的代**：`p.gen !== gen` ⇒ 不落地，并按过期收尾（清暂存 + 留痕），
 *    于是「被别的路径留下的载荷」既不落成读数，也不静默消失；
 *  · interceptor 路径**自己收尾**：与事件路径各占一代（`_genSeq` 递增），
 *    提交成功即落地、不成功即过期收尾 —— 绝不留下无主暂存；
 *  · 两条路径共用**同一个**收尾入口 `_injectionClose(myGen)`（引擎不变量只写一份）：
 *    有暂存则提交，提交不成（代不符 / 无主载荷）即按过期收尾，且**不重复留痕**。
 *
 * 边界如实声明：本 Gate 只保证「每条发布路径的读数只属于它自己那一次」与
 * 「无主载荷不得被另一路径捡起」。**不声称**解决「两条发布路径同时活跃时谁赢」
 * （那是宿主集成面，取决于 ST 版本实际走哪条路），也不声称消除注入槽位之外的其它迟到写。
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

/* ───────────────── 源码提取（花括号配平；不做文本猜测） ───────────────── */

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
/** 取整段方法（含头部）。工具自证：不存在 / 多于一次 ⇒ 必须抛。 */
function blockOf(src, header) {
    const at = src.indexOf(header);
    assert.ok(at >= 0, '锚点必须存在：' + header);
    const n = src.split(header).length - 1;
    assert.strictEqual(n, 1, '锚点必须唯一（恰中 1 次）：' + header + '（实 ' + n + ' 次）');
    return blockAt(src, at);
}
/** 真源码破坏：锚点必须**恰中 1 次**，否则抛（防破坏打偏）。 */
function breakSource(src, anchor, replacement) {
    const n = src.split(anchor).length - 1;
    assert.strictEqual(n, 1, '破坏锚点必须恰中 1 次：' + anchor.slice(0, 56) + '（实 ' + n + ' 次）');
    return src.replace(anchor, replacement);
}
/**
 * 取「载荷自身代核对」**整块**（含 if 条件与块体）。
 *   为什么必须取整块而不是只取 `if (...)` 那一行：只删条件行会留下块体
 *   （`try { ...discard... } return null;` 仍在）⇒ 行为面判据照样返回 null，
 *   负控制**红不了** —— 那正是本仓「破坏没被触到」的假绿形态（破坏与判据不对齐）。
 */
const GUARD_HEAD = 'if (Number.isFinite(p.gen) && p.gen !== gen) {';
function selfGuardBlock(src) {
    const at = src.indexOf(GUARD_HEAD);
    assert.ok(at >= 0, '自身代核对块必须在位');
    const n = src.split(GUARD_HEAD).length - 1;
    assert.strictEqual(n, 1, '自身代核对块必须唯一（实 ' + n + ' 次）');
    const blk = blockAt(src, at);
    assert.ok(blk && blk.includes('return null'), '整块必须含 return null（破坏才算触到机制）');
    return blk;
}

/* ───────────────── 被测方法清单 + 万能 stub ───────────────── */

const HOST_METHODS = [
    '_injectionRecord(extra) {',
    '_injectionStage(payload) {',
    '_injectionCommit(myGen) {',
    '_injectionClose(myGen) {',
    '_injectionRefOf(i) {',
    '_injectionDiscardStale(myGen) {',
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

/** 从真源码里的真宿主方法造引擎（破坏副本上重跑同款判据时也走这里）。 */
function engineFrom(src) {
    const parts = HOST_METHODS.map(h => blockAt(src, src.indexOf(h)));
    assert.strictEqual(parts.filter(Boolean).length, HOST_METHODS.length,
        '宿主方法体必须全部可提取（缺失即接线不全）');
    const real = {
        _lastInjection: null, _lastInjectionDraft: null, _lastInjectionDiscard: null,
        _injectionPending: null, _injectionRound: 0, _injectionStale: 0, _genSeq: 0,
    };
    const host = new Proxy(real, { get: (t, p) => (p in t ? t[p] : anyStub()) });
    const fn = new Function('estimateTextTokens', 'errLog', `return ({ ${parts.join(',\n')} });`);
    return Object.assign(host, fn(est, () => {}));
}

/** 真源码里的 interceptor 发布路径（保留的兼容入口）造一个可调用函数。 */
function interceptorFrom(src, engine) {
    const header = 'window.lonsha_memory_interceptor = async (chat, ...args) => {';
    const at = src.indexOf(header);
    assert.ok(at >= 0, 'interceptor 锚点必须存在');
    const body = blockAt(src, at + header.length - 1);           // 取 `=> { ... }` 的整块
    assert.ok(body && body.length > 20, 'interceptor 函数体可提取');
    const fn = new Function('plugin', 'writeInjectSlot', 'numOr', 'errLog', 'PLUGIN_NAME',
        `return async (chat, ...args) => ${body};`);
    const writes = [];
    const itc = fn({ engine }, (k, c, d) => { writes.push({ k, c, d }); return true; },
        (n, d) => (Number.isFinite(Number(n)) ? Number(n) : d), () => {}, 'v3218');
    return { itc, writes };
}

/* ══════════ T1 工具自证（锚点不存在 / 不唯一 / 破坏打偏都必须抛） ══════════ */
test('v3218 1. 工具自证：锚点不存在/不唯一、破坏打偏都必须抛', () => {
    assert.throws(() => blockOf(idxSrc, '这个方法不存在(zz) {'), /锚点必须存在/, '不存在的锚点必须抛');
    assert.throws(() => blockOf(idxSrc, 'recalled) {'), /锚点必须唯一/, '出现多次的锚点必须抛');
    assert.throws(() => breakSource(idxSrc, '绝不存在的串zzz', 'x'), /恰中 1 次/, '零命中的破坏必须抛');
    assert.throws(() => breakSource(idxSrc, 'function', 'x'), /恰中 1 次/, '多命中的破坏必须抛');
    const b = blockOf(idxSrc, '_injectionCommit(myGen) {');
    assert.ok(b && b.includes('_injectionRecord('), '真锚点取到整段方法体');
});

/* ══════════ T2 结构：提交必须核对**载荷自己的代** ══════════ */
test('v3218 2. 提交前必须核对载荷自身的代（`p.gen`），不只是调用者传进来的代', () => {
    const code = stripComments(idxSrc);
    const commit = blockOf(code, '_injectionCommit(myGen) {');
    assert.ok(/\bp\.gen\b/.test(commit),
        '★ 提交体内必须出现对 `p.gen` 的判读 —— 只核对调用者传进来的代，拦不住「别人留下的载荷」');
    assert.ok(/p\.gen[^\n]*!==|!==[^\n]*p\.gen|p\.gen\s*\)?\s*!==/.test(commit),
        '★ 必须是**比较**（不是只读一眼就丢）：载荷的代与本次代不符即不得落地');
    /* 顺序：自身代核对必须发生在**写读数之前**（写下去再检查等于没检查——本仓假绿第②形） */
    const iSelf = commit.indexOf('p.gen');
    const iRec = commit.indexOf('_injectionRecord(');
    assert.ok(iSelf >= 0 && iRec > iSelf, '★ 自身代核对必须先于 `_injectionRecord`（落地之前判）');
    /* 收尾：被判定为「别人的载荷」时必须清暂存，否则它会一直悬着等下一个受害者 */
    assert.ok(commit.includes('_injectionDiscardStale('),
        '★ 别人的载荷按过期收尾（清暂存 + 留痕），不得静默留在暂存里');
    /* 收尾入口本身也要在：调用方不该自己拼「先提交、不成再丢弃」（同一口径被抄 N 份的老形态）。 */
    assert.ok(stripComments(idxSrc).includes('_injectionClose(myGen) {'),
        '★ 引擎侧必须有收尾唯一入口 `_injectionClose`');
});

/* ══════════ T3 行为：旧代载荷不得被新代提交落地 ══════════ */
test('v3218 3. 别的代留下的载荷：新代提交必须拒绝落地，且如实留痕', () => {
    const c = engineFrom(idxSrc);
    c._genSeq = 1;
    c._injectionStage({ html: '上一代留下的载荷', blocks: [{ ref: 'inj_1_0', kept: true }], gen: 1 });
    // 模拟「留下暂存的路径从不提交」：代际推进到 2（新一次生成到来）
    c._genSeq = 2;
    const out = c._injectionCommit(2);
    assert.strictEqual(out, null, '★ 载荷属于第 1 代，第 2 代的提交不得把它当成自己的载荷落地');
    assert.strictEqual(c._lastInjection, null, '读数必须仍是「未落地」——不是「落了个别人的」');
    assert.strictEqual(c._injectionRound, 0, '★ 轮次不得推进（推进就等于给一次没发生的注入占号）');
    assert.strictEqual(c._injectionPending, null, '★ 无主载荷必须被清掉（不然它一直等着下一个受害者）');
    assert.strictEqual(c._injectionStale, 1, '过期留痕 +1（这件事必须看得见，不能静默）');
    assert.strictEqual(c._lastInjectionDiscard.pendingDiscarded, true, '留痕须如实记下被丢弃的是**有载荷的**');
});

/* ══════════ T4 阳性对照：同代载荷照常提交 ══════════ */
test('v3218 4. 阳性对照：载荷自己的代与本次代一致时，照常落地（不得把正常路径也拦掉）', () => {
    const c = engineFrom(idxSrc);
    c._genSeq = 3;
    c._injectionStage({ html: '本代载荷', blocks: [{ ref: 'inj_3_0', kept: true }], gen: 3 });
    const r = c._injectionCommit(3);
    assert.ok(r && r.html === '本代载荷', '同代载荷必须落地');
    assert.strictEqual(r.round, 1, '轮次照常推进');
    assert.strictEqual(r.gen, 3, '读数记下自己属于哪一代');
    assert.strictEqual(c._injectionPending, null, '提交后清暂存');
});

/* ══════════ T5 结构：interceptor 路径必须自己收尾 ══════════ */
test('v3218 5. interceptor 发布路径必须自己收尾（提交或过期收尾），不得留下无主暂存', () => {
    const code = stripComments(idxSrc);
    const header = 'window.lonsha_memory_interceptor = async (chat, ...args) => {';
    const at = code.indexOf(header);
    assert.ok(at >= 0, 'interceptor 锚点必须存在');
    const body = blockAt(code, at + header.length - 1);
    assert.ok(body, 'interceptor 函数体可提取');
    assert.ok(body.includes('onBeforeGeneration()'), '它仍调生成前注入（会留下暂存）');
    assert.ok(/_injectionClose\(/.test(body),
        '★ 留下暂存的路径必须自己收尾（走引擎侧唯一入口 `_injectionClose`）—— 否则载荷悬空，等下一轮的提交来捡');
    assert.ok(/_genSeq\s*=/.test(body),
        '路径必须有自己的代（与事件路径一样，各占一代）');
    /* 事件路径与 interceptor 路径必须走**同一个**收尾入口：各抄一遍就是「同一口径被抄 N 份」。 */
    const h7 = blockAt(code, code.indexOf('const _h7 = async () => {'));
    assert.ok(h7.includes('_injectionClose('), '事件路径也走同一收尾入口');
    const inBoth = (code.match(/_injectionClose\(/g) || []).length;
    assert.strictEqual(inBoth, 3, '★ 收尾入口只许「定义 1 + 两条路径各 1」共 3 处（实 ' + inBoth + ' 处）');
});

/* ══════════ T6 行为：interceptor 跑完不得留下暂存 ══════════ */
test('v3218 6. interceptor 真跑一遍：读数落地成自己那一次，且暂存被清空', async () => {
    const engine = engineFrom(idxSrc);
    engine._genSeq = 0;
    // 真 onBeforeGeneration 太重：只保留它的**行为契约**（暂存一个载荷），其余走真方法
    engine.onBeforeGeneration = async function () {
        this._injectionStage({ html: '拦截器载荷', blocks: [{ ref: 'inj_1_0', kept: true }], gen: Number(this._genSeq) || 0 });
        return '拦截器载荷';
    };
    engine.buildVolumeInjection = () => '';
    const { itc, writes } = interceptorFrom(idxSrc, engine);
    const chat = [{ mes: 'base' }];
    await itc(chat);
    assert.strictEqual(engine._injectionPending, null,
        '★ 拦截器路径跑完不得留下无主暂存（留下就会被下一轮的提交捡起）');
    assert.ok(engine._lastInjection && engine._lastInjection.html === '拦截器载荷',
        '它自己那次注入必须落成读数（这就是「AI 真实所见」）');
    assert.strictEqual(engine._lastInjection.origin, 'generation', '仍是生成读数（不是诊断读数）');
    assert.strictEqual(engine._injectionRound, 1, '轮次由提交推进，一路径一代');
    assert.strictEqual(engine._lastInjection.gen, engine._genSeq,
        '★ 读数的代必须**等于它自己那一代**（不得是别人留下的载荷的代）');
    assert.ok(writes.some(w => w.k === 'lonsha_memory'), '注入槽位照旧被写（发布路径本身未变）');
    assert.strictEqual(chat[0].mes, 'base', '槽位可写时不得走 chat 降级拼接');
});

/* ══════════ T7 行为：interceptor 之后的新一次生成不得捡起它的载荷 ══════════ */
test('v3218 7. 拦截器路径之后：下一次生成提交的必须是它自己的载荷', async () => {
    const engine = engineFrom(idxSrc);
    engine._genSeq = 0;
    engine.onBeforeGeneration = async function () {
        this._injectionStage({ html: '第一次载荷', blocks: [{ ref: 'inj_1_0', kept: true }], gen: Number(this._genSeq) || 0 });
        return '第一次载荷';
    };
    engine.buildVolumeInjection = () => '';
    const { itc } = interceptorFrom(idxSrc, engine);
    await itc([{ mes: 'x' }]);
    const first = engine._lastInjection;
    assert.ok(first && first.html === '第一次载荷');
    // 第二次生成：事件路径（自己占一代 + 自己暂存 + 自己提交）
    const myGen = (engine._genSeq = (engine._genSeq || 0) + 1);
    engine._injectionStage({ html: '第二次载荷', blocks: [{ ref: 'inj_2_0', kept: true }], gen: myGen });
    const r = engine._injectionCommit(myGen);
    assert.ok(r, '第二次提交必须成功');
    assert.strictEqual(r.html, '第二次载荷', '★ 落的必须是它自己的载荷');
    assert.strictEqual(r.gen, myGen, '代际自洽');
    assert.strictEqual(r.round, 2, '轮次连续推进');
});

/* ══════════ N1-N3 负控制：真源码破坏 → 载入破坏副本 → 同款判据必须现形 ══════════ */

test('v3218 N1. 破坏：把「载荷自身代核对」摘掉 ⇒ 同款判据必须现形', () => {
    const blk = selfGuardBlock(idxSrc);
    const broken = breakSource(idxSrc, blk, '// 破坏：不再核对载荷自身的代（整块摘除）');
    const c = engineFrom(broken);
    c._genSeq = 1;
    c._injectionStage({ html: '上一代留下的载荷', blocks: [{ ref: 'inj_1_0', kept: true }], gen: 1 });
    c._genSeq = 2;
    const out = c._injectionCommit(2);
    assert.ok(out !== null, '★ 破坏副本上「别人的载荷被当自己的落地」必须现形');
    assert.strictEqual(c._lastInjection.html, '上一代留下的载荷',
        '★ 破坏副本上读数落的正是别人留下的载荷（round 前进而 gen 停在旧代）');
});

test('v3218 N2. 破坏：interceptor 不再收尾 ⇒ 「不得留下无主暂存」判据必须现形', async () => {
    const code = stripComments(idxSrc);
    const header = 'window.lonsha_memory_interceptor = async (chat, ...args) => {';
    const at = code.indexOf(header);
    const body = blockAt(code, at + header.length - 1);
    const lines = body.split('\n').filter(l => /_injectionClose\(/.test(l));
    assert.ok(lines.length >= 1, '收尾行必须在位');
    let broken = idxSrc;
    for (const l of lines) broken = breakSource(broken, l.trim(), '// 破坏：不再收尾');
    const engine = engineFrom(broken);
    engine._genSeq = 0;
    engine.onBeforeGeneration = async function () {
        this._injectionStage({ html: '拦截器载荷', blocks: [{ ref: 'inj_1_0', kept: true }], gen: Number(this._genSeq) || 0 });
        return '拦截器载荷';
    };
    engine.buildVolumeInjection = () => '';
    const { itc } = interceptorFrom(broken, engine);
    await itc([{ mes: 'x' }]);
    assert.ok(engine._injectionPending !== null,
        '★ 破坏副本上无主暂存必须现形（它会等着下一轮的提交来捡）');
});

test('v3218 N3. 破坏：自身代核对写成恒真 ⇒ 同款判据（源码面）必须现形', () => {
    const blk = selfGuardBlock(idxSrc);
    // 「核对写成恒真」正是本仓假绿第②形（破坏写死成模拟常量）的形态：看着像核对，实际不判。
    //   故这里先把**同值替换**当作一次「不算破坏」的自证，再用整块替换做真破坏。
    const same = breakSource(idxSrc, blk, blk);
    assert.ok(same.includes(GUARD_HEAD), '同值替换不算破坏（防止把「没破坏」当绿灯）');
    const broken2 = breakSource(idxSrc, blk, 'if (false) { /* 破坏：核对恒不触发 */ }');
    const commit2 = blockOf(stripComments(broken2), '_injectionCommit(myGen) {');
    assert.ok(!/p\.gen[^\n]*!==/.test(commit2), '★ 破坏副本上「载荷自身代核对」必须消失（源码面判据现形）');
    const c = engineFrom(broken2);
    c._genSeq = 1;
    c._injectionStage({ html: '旧载荷', blocks: [{ ref: 'inj_1_0', kept: true }], gen: 1 });
    c._genSeq = 2;
    assert.ok(c._injectionCommit(2) !== null, '★ 破坏副本上行为面判据同步现形');
});

/* ══════════ T8 版本锚（version-guard V4） ══════════ */
test('v3218 8. 本 Gate 属于 v3.217.0', () => {
    const ver = (idxSrc.match(/const VERSION = '([^']+)'/) || [])[1];
    const vnum = (s) => {
        const m = /^([0-9]+)\.([0-9]+)\.([0-9]+)/.exec(String(s || '').trim());
        return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
    };
    assert.ok(vnum(ver) >= vnum('3.217.0'), '★ 版本不得低于本套件出生版本 3.217.0（实 ' + ver + '）');
});

console.log('\n✓ v3.217.0 R2-D 跨路径暂存隔离专项测试全部通过');