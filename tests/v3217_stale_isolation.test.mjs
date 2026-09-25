/* ============================================================
 * tests/v3217_stale_isolation.test.mjs — [v3.216.0] Gate R2-B
 *
 * 主题：**迟到的结果不得写脏读数** —— 读数必须等到代际确认之后才落地。
 *
 * 修前实测（真源码读取，R2-A 已如实声明的边界）：
 *   R2-A 把读数收口到唯一构造点 `_injectionRecord`，但**写入时机没动**：
 *   `onBeforeGeneration()` 在 await 内部**无条件**落地（`this._injectionRecord({...})`），
 *   而代际守卫 `if (myGen !== this._genSeq)` 在 `await` **之后**才判定。
 *   于是「快速连发两次生成」时：先发的那一轮在 await 期间已经把读数写进去了，
 *   守卫随后只拦住**注入槽位**（`writeInjectSlot`），拦不住它早已写脏的读数。
 *   面板上「最近一次实际注入」于是可能是**一次从未生效的注入** ——
 *   而它旁边那行 `writeInjectSlot` 的结果恰恰说明这一轮没生效。两行读数互相矛盾。
 *
 * 收口（本 Gate）：
 *  ① `onBeforeGeneration()` 只**暂存**（`_injectionStage`），不写读数；
 *  ② 读数由 `_injectionCommit(myGen)` 在**代际确认之后**落地（`GENERATION_STARTED` 处理器里，
 *     守卫 `if` 块**之后**）—— 结构性保证「记录发生在 await 之后」；
 *  ③ 轮次号 `round` 只由**提交**推进：被丢弃的那一轮不占轮次，
 *     于是「第 N 轮」与「真正生效过的第 N 次注入」永远同号；
 *  ④ 过期分支必须**清掉暂存**并把它记进 discard（`payloadChars` / `payloadBlocks`）——
 *     不清则下一次新鲜提交会**捡起上一轮的载荷**落成读数（比不落地更坏：读数是假的）。
 *  ⑤ `_injectionCommit` 自带代际核对：即便被误调（守卫被绕过）也不静默落一个别的代的载荷。
 *
 * 边界如实声明：本 Gate 只保证「读数落地不早于代际确认」与「过期载荷不留痕不得」
 * 这两件事。**不声称**消除了注入槽位之外的其它迟到写（如 charMem / 账本写入）——
 * 那些各自有归属，属后续 Gate 范围。
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

function braceBlock(text, at) {
    const open = text.indexOf('{', at);
    if (open < 0) return null;
    let depth = 0, end = -1;
    for (let i = open; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return end > 0 ? text.slice(open, end + 1) : null;
}
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

/* ───────────────── 被测方法清单 ───────────────── */

const HOST_METHODS = [
    '_injectionRecord(extra) {',
    '_injectionStage(payload) {',
    '_injectionCommit(myGen) {',
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

/* ══════════ T1 工具自证 ══════════ */
test('v3217 1. 工具自证：锚点不存在/不唯一、破坏打偏都必须抛', () => {
    assert.throws(() => blockOf(idxSrc, '这个方法不存在(zz) {'), /锚点必须存在/, '不存在的锚点必须抛');
    assert.throws(() => blockOf(idxSrc, 'recalled) {'), /锚点必须唯一/, '出现多次的锚点必须抛');
    assert.throws(() => breakSource(idxSrc, '绝不存在的串zzz', 'x'), /恰中 1 次/, '零命中必须抛');
    assert.throws(() => breakSource(idxSrc, 'function', 'x'), /恰中 1 次/, '多命中必须抛');
});

/* ══════════ T2 结构：真实例化只发生在提交点 ══════════ */
test('v3217 2. `_injectionRecord` 的调用点只有提交一处（生成路径不得自己落地）', () => {
    const code = stripComments(idxSrc);
    const callers = (code.match(/this\._injectionRecord\(/g) || []).length;
    assert.strictEqual(callers, 1, '★ 全源码只允许一处调用 `_injectionRecord`（实 ' + callers + ' 处）');
    const commit = blockOf(code, '_injectionCommit(myGen) {');
    assert.ok(commit.includes('this._injectionRecord('), '那处调用在 `_injectionCommit` 内（读数由提交落地）');
    const onBefore = blockOf(code, 'async onBeforeGeneration(');
    assert.ok(!onBefore.includes('this._injectionRecord('),
        '★ onBeforeGeneration 不得自己落地读数 —— 它发生在 await 内部，而代际确认在其之后');
    assert.ok(onBefore.includes('_injectionStage('), 'onBeforeGeneration 只暂存');
    // 记录必须发生在 await 之后：处理器里 commit 在守卫 if 块之后
    const h7 = stripComments(blockOf(idxSrc, 'const _h7 = async () => {'));
    assert.ok(h7.includes('await this.engine.onBeforeGeneration()'), '处理器仍 await 生成前注入');
    const iGuard = h7.indexOf('myGen !== this._genSeq');
    /* [v3.217.0] R2-D：路径改调收尾唯一入口 `_injectionClose(`（内部才调提交）。
     *   守的性质不变：**收尾必须晚于代际守卫**。 */
    const iCommit = h7.indexOf('this.engine._injectionClose(');
    assert.ok(iGuard >= 0, '代际守卫在位');
    assert.ok(iCommit > iGuard, '★ 读数落地必须晚于代际守卫（否则迟到代照样写脏读数）');
});

/* ══════════ T3 暂存不写读数 ══════════ */
test('v3217 3. 暂存不写读数：`_injectionStage` 只写 pending', () => {
    const c = engineFrom(idxSrc);
    const p = c._injectionStage({ html: '载荷', blocks: [{ ref: 'inj_1_0', kept: true }], gen: 1 });
    assert.strictEqual(c._lastInjection, null, '★ 暂存阶段读数必须仍是「未落地」');
    assert.ok(c._injectionPending && c._injectionPending.html === '载荷', '暂存进了 pending');
    assert.strictEqual(p.gen, 1, '暂存记下自己属于哪一代');
});

/* ══════════ T4 提交落地 + 轮次只由提交推进 ══════════ */
test('v3217 4. 代际确认后提交：读数落地，轮次由提交推进', () => {
    const c = engineFrom(idxSrc);
    c._genSeq = 1;
    c._injectionStage({ html: '第一轮载荷', blocks: [{ ref: 'inj_1_0', kept: true }], gen: 1 });
    assert.strictEqual(c._injectionRound, 0, '暂存不推进轮次');
    const r = c._injectionCommit(1);
    assert.ok(r && r.html === '第一轮载荷', '提交落成读数');
    assert.strictEqual(r.round, 1, '轮次由提交推进');
    assert.strictEqual(r.origin, 'generation');
    assert.strictEqual(c._injectionPending, null, '提交后清空暂存（防下一轮捡起旧载荷）');
    assert.strictEqual(c._lastInjection.round, 1, '读数与返回值同源');
});

/* ══════════ T5 过期提交：不写读数 + 清暂存 ══════════ */
test('v3217 5. 过期代提交：不写读数、累计 stale、暂存必须被清', () => {
    const c = engineFrom(idxSrc);
    c._genSeq = 1;
    c._injectionStage({ html: '过期载荷', blocks: [{ ref: 'inj_1_0', kept: true }], gen: 1 });
    c._genSeq = 2;                                   // 快速连发：新代到来
    const out = c._injectionCommit(1);               // 旧代提交（守卫已在外层拦过，这里二次核对）
    assert.strictEqual(out, null, '★ 过期代不得落成读数（即便被误调）');
    assert.strictEqual(c._lastInjection, null, '读数仍是「未落地」——不是「落了个错的」');
    assert.strictEqual(c._injectionRound, 0, '被丢弃的那一轮不占轮次');
    // 过期分支收尾
    const q = c._injectionStage({ html: '过期载荷', blocks: [{ ref: 'inj_1_0', kept: true }], gen: 1 });
    const d = c._injectionDiscardStale(1);
    assert.strictEqual(c._injectionStale, 1, '过期计数 +1');
    assert.strictEqual(c._injectionPending, null, '★ 过期必须清暂存（不清则下轮捡起旧载荷）');
    assert.ok(d.payloadChars > 0, '留痕必须带上被丢弃载荷的读数：' + JSON.stringify(d));
    assert.strictEqual(d.payloadBlocks, 1, '被丢弃的块数也如实记下');
    assert.strictEqual(d.pendingDiscarded, true, '如实区分「有过待落地载荷」与「本来就没有」');
    assert.strictEqual(q.gen, 1);
});

/* ══════════ T6 过期后新鲜提交不得串轮 ══════════ */
test('v3217 6. 过期之后的新鲜提交：落的必须是新载荷（不得捡起旧载荷）', () => {
    const c = engineFrom(idxSrc);
    c._genSeq = 1;
    c._injectionStage({ html: '第一代载荷', blocks: [{ ref: 'inj_1_0', kept: true }], gen: 1 });
    c._genSeq = 2;
    c._injectionDiscardStale(1);                     // 过期收尾（清暂存）
    c._injectionStage({ html: '第二代载荷', blocks: [{ ref: 'inj_1_0', kept: true }], gen: 2 });
    const r = c._injectionCommit(2);
    assert.ok(r, '新代提交成功');
    assert.strictEqual(r.html, '第二代载荷', '★ 落的是新载荷');
    assert.strictEqual(r.round, 1, '轮次从 1 起 —— 被丢弃的那一代没占号');
    assert.strictEqual(r.gen, 2, '读数记下自己属于哪一代（下游可对表）');
});

/* ══════════ T7 结构：提交调用点在守卫之后（跨源码断言，防被搬运） ══════════ */
test('v3217 7. 提交点必须在守卫之后，且过期分支不得有提交调用', () => {
    const h7 = stripComments(blockOf(idxSrc, 'const _h7 = async () => {'));
    const iGuard = h7.indexOf('myGen !== this._genSeq');
    const iCommit = h7.indexOf('this.engine._injectionClose(');
    assert.ok(iCommit > iGuard, '收尾晚于守卫');
    // 守卫 if 块体内（到下一个 return 为止）不得出现提交调用
    const guardBlock = blockAt(h7, iGuard);
    assert.ok(guardBlock, '守卫块可提取');
    assert.ok(!guardBlock.includes('_injectionCommit(') && !guardBlock.includes('_injectionClose('),
        '★ 过期分支内不得提交/收尾（那正是修前的写脏形态）');
    assert.ok(guardBlock.includes('_injectionDiscardStale('), '过期分支只留痕');
});

/* ══════════ N1-N3 负控制：真源码破坏 → 载入破坏副本 → 同款判据必须现形 ══════════ */

test('v3217 N1. 破坏：把提交搬回 await 内部（写脏） ⇒ 结构判据必须现形', () => {
    const anchor = '                this._injectionStage({';
    assert.ok(idxSrc.includes(anchor), '暂存锚点在位');
    const broken = breakSource(idxSrc, anchor, '                this._injectionRecord({   // 破坏：提前落地\n' + anchor);
    const code = stripComments(broken);
    const callers = (code.match(/this\._injectionRecord\(/g) || []).length;
    const onBefore = blockOf(code, 'async onBeforeGeneration(');
    // 同款判据：全源码只允许提交点一处调用
    assert.ok(callers > 1, '★ 破坏副本上「调用点唯一」必须现形（实 ' + callers + ' 处）');
    assert.ok(onBefore.includes('this._injectionRecord('), '★ 破坏副本上 onBeforeGeneration 自己落地了读数');
});

test('v3217 N2. 破坏：过期分支不清暂存 ⇒ 「不串轮」判据必须现形', () => {
    const anchor = '            this._injectionPending = null;   // ★ 必须清：不清则下一次新鲜提交会捡起旧载荷';
    assert.ok(idxSrc.includes(anchor), '清暂存锚点在位');
    const broken = breakSource(idxSrc, anchor, '            // 破坏：暂存不清');
    const c = engineFrom(broken);
    c._genSeq = 1;
    c._injectionStage({ html: '第一代载荷', blocks: [{ ref: 'a', kept: true }], gen: 1 });
    c._genSeq = 2;
    c._injectionDiscardStale(1);
    const pend = c._injectionPending;
    assert.ok(pend && pend.html === '第一代载荷',
        '★ 破坏副本上旧载荷仍留在暂存里（下一次新鲜提交会把它当成自己的载荷落成读数）');
});

test('v3217 N3. 破坏：暂存直接写读数 ⇒ 「暂存不写读数」判据必须现形', () => {
    const anchor = '            this._injectionPending = rec;';
    assert.ok(idxSrc.includes(anchor), '暂存锚点在位');
    const broken = breakSource(idxSrc, anchor,
        '            this._lastInjection = { html: String(rec.html || \'\') };   // 破坏：暂存即落地\n' + anchor);
    const c = engineFrom(broken);
    c._injectionStage({ html: '载荷', blocks: [], gen: 1 });
    assert.ok(c._lastInjection !== null, '★ 破坏副本上「暂存不写读数」必须现形（读数被提前写脏）');
});

/* ══════════ T8 版本锚（version-guard V4） ══════════ */
test('v3217 8. 本 Gate 属于 v3.216.0', () => {
    const ver = (idxSrc.match(/const VERSION = '([^']+)'/) || [])[1];
    const vnum = (s) => {
        const m = /^([0-9]+)\.([0-9]+)\.([0-9]+)/.exec(String(s || '').trim());
        return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
    };
    assert.ok(vnum(ver) >= vnum('3.216.0'), '★ 版本不得低于本套件出生版本 3.216.0（实 ' + ver + '）');
});

console.log('\n✓ v3.216.0 R2-B 迟到隔离专项测试全部通过');
