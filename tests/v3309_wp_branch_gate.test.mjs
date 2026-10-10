// tests/v3309_wp_branch_gate.test.mjs — v3.309.0 · M-O8 第四刀成对套件
//
// 主题：**世界推进账本写入必须经过分支判定**（M-O8 验收②「A 分支秘密不出现在 B」
//   在「翻页 / 重生成」这一路径上的字面收口）。
//
// 修前实测（探针 tests/audit/_mo8_branch_probe.mjs，rc=0，v3.307.0 基线）：
//   承诺块 / 认知块 / 秘密块**早于**分支守护 295~422 行；
//   `_branchOk` 的四个使用点里，世界推进的 21 个写入口被覆盖 **0** 处
//   ⇒ 翻页 / 重生成后，被放弃那一分支的承诺 / 支线 / 认知 / **秘密**照旧入账。
//
// 本档为何以**结构读 + 真源码破坏**为主（而不是纯行为断言）：
//   `onMessageReceived` 是宿主巨型方法的**内联段**，仓库无任何装载 index.js 并驱动
//   该方法的夹具（现有的 index.js 装载类测试只取函数体文本）。硬造一个 1.6 万行宿主
//   的仿真夹具，等于另写一份宿主 —— 那份夹具与真源之间无人核对，判据会**绿得没有信息量**
//   （本仓点名的假绿第一形态：对着一个自造物断言）。故本档：
//     · 结构读（R1~R4）钉住「闸在哪、拦什么、判不了怎么办、读数在哪」
//     · 真源码破坏负控制钉住「每条结构读都真的会翻红」
//     · 把「真宿主下的端到端行为」如实登记为**未执行**（无 headless 环境与真 ST）
//
// 纪律（沿用本仓既有）：
//   · 锚点必须先断言「恰中 1 次」（同值替换视为没改）
//   · 破坏一律作用在**真源码**副本上，再对副本跑**同一套判据**
//   · 破坏工具走**唯一真源** `tests/_break_kit.mjs`（`breakOnce`）——
//     首版自带 `sabotage` 内联重写，是「换名重写」形态（逃过 B2/C1 的**出口名集**），
//     被 v3247 B1 双向差集与 D2 当场点名；已收编（名集的已知边界见本版 CHANGELOG）。
//   · 判据体整体包 try/catch（破坏副本可能让结构读抛错，与「没拦住」同形）

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakOnce } from './_break_kit.mjs';   // 破坏形态唯一真源（v3247 B1 台账已登记）

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC_PATH = path.join(ROOT, 'index.js');
const BORN = '3.309.0';

const read = () => fs.readFileSync(SRC_PATH, 'utf-8');
const SELF = fs.readFileSync(new URL(import.meta.url), 'utf-8');

// ── 锚点常量（分三类，各有不同的唯一性判据）─────────────────────────────
//   ① EXACT   —— 真源上必须**恰中 1 次**（结构读的立足点）
//   ② BROKEN  —— **修前形态**锚点：真源上必须**恰中 0 次**（即「已经修好」），
//                仅在破坏副本里被造出来。★ 曾误把这类锚点塞进 ① 的通用断言，
//                真源上恒 0 ⇒ 判据当场翻红，而红的是判据自己（自伤一例，留痕于此）。
//   ③ TEXT    —— 口径留档文本：只要求**存在**，不要求唯一（注释里复述是允许的）
const ANCHOR = Object.freeze({
    decl: 'let _branchOk = true;',
    wpBlock: 'worldProgressEnabled && extracted && _branchOk',
    guardCall: 'this._branchGuard.guardApply(message',
    verdictWrite: 'this._branchVerdict = { accept: !!g0.accept, judged: !!g0.judged',
    wpSkipWrite: 'this._wpBranchSkip = {',
    wpSkipReason: "'wp-skip'",
    applySkip: "'apply-skip'",
    lineRead: '_wpBranchSkip && this._wpBranchSkip.skipped',
    verdictJudge: 'judged: !!g0.judged, reason:',
});

/** ② 破坏形态锚点：修前形态，真源上须恰中 0 次。 */
const ANCHOR_BROKEN = Object.freeze({
    wpBlockNoGate: 'worldProgressEnabled && extracted) {',
});

/** ③ 文本留档：存在即可，不判唯一。 */
const ANCHOR_TEXT = Object.freeze({
    failOpenNote: 'judged === false',
    noSecondLoop: '两次判定各取一次',
});

function countOf(src, needle) {
    let n = 0, i = 0;
    while ((i = src.indexOf(needle, i)) >= 0) { n++; i += needle.length; }
    return n;
}

function lineOf(src, needle) {
    const i = src.indexOf(needle);
    if (i < 0) return -1;
    return src.slice(0, i).split('\n').length;
}

// ── 真源码破坏工具：**收编唯一真源**（口径 ①②③④ 与消息面全在 tests/_break_kit.mjs）──
//   本档曾自带 `sabotage`（三行等价实现，名字不在 B2/C1 的出口名集里 ⇒ 静默逃逸）。
//   「换名重写」是名字集检测的**已知边界**：名集只能追已有名字，追不到下一次改名。
//   故本档按「唯一真源」纪律接线，不再留本地实现。

/** 对给定源码跑**同一套**结构读，返回 { ok, why }。 */
function structuralReads(src) {
    const out = { ok: true, why: [] };
    const g = lineOf(src, ANCHOR.guardCall);
    const wp = lineOf(src, ANCHOR.wpBlock);
    const sec = lineOf(src, 'const secretReqs = Array.isArray(extracted.secrets)');
    // R1 判定前移：判定行必须在世界推进块与秘密块之前
    if (!(g > 0 && wp > 0 && g < wp)) out.why.push('R1 判定未早于世界推进块（' + g + ' vs ' + wp + '）');
    if (!(g > 0 && sec > 0 && g < sec)) out.why.push('R1 判定未早于秘密块（' + g + ' vs ' + sec + '）');
    // R2 块头有闸
    if (countOf(src, ANCHOR.wpBlock) < 1) out.why.push('R2 世界推进块头无分支闸');
    // R3 判定对象含 accept + judged，且放行纪律留档
    if (countOf(src, ANCHOR.verdictWrite) < 1) out.why.push('R3 判定对象缺 accept/judged 双字段');
    if (countOf(src, ANCHOR_TEXT.failOpenNote) < 1) out.why.push('R3 放行纪律（judged === false）无留档');
    // R4 读数被写 + 被读（零读 = 等于没写）
    if (countOf(src, ANCHOR.wpSkipWrite) < 1) out.why.push('R4 _wpBranchSkip 未被写');
    if (countOf(src, ANCHOR.lineRead) < 1) out.why.push('R4 _wpBranchSkip 未被读（写完没人调）');
    // R5 单一判定：§2 不再重算（否则同一问题两个答案）
    if (countOf(src, ANCHOR.guardCall) !== 1) out.why.push('R5 guardApply 调用点不是 1 处（实测 ' + countOf(src, ANCHOR.guardCall) + '）');
    return { ok: out.why.length === 0, why: out.why };
}

// ══ A 结构 ══════════════════════════════════════════════════════════════
test('v3309 A1. ★★★ 四条结构读在原版上全绿（正控制地基）', () => {
    const r = structuralReads(read());
    assert.equal(r.ok, true, '结构读不应有失败项：' + r.why.join('；'));
});

test('v3309 A2. 分支判定只算一次（同一问题不得有两个答案）', () => {
    const src = read();
    assert.equal(countOf(src, ANCHOR.guardCall), 1, 'guardApply 调用点必须恰 1 处');
    assert.ok(countOf(src, ANCHOR_TEXT.noSecondLoop) >= 1, '「不再重算」的理由须留档（防后人顺手加回去）');
});

// ══ B 闸的语义 ══════════════════════════════════════════════════════════
test('v3309 B1. ★★ 闸挂在块头条件串上（不是挂在某个写入口上）', () => {
    const src = read();
    const wpLine = lineOf(src, ANCHOR.wpBlock);
    assert.ok(wpLine > 0, '世界推进块条件串须含分支闸');
    // 闸在块头 ⇒ 覆盖该块内**全部**写入口，无需逐个包
    const body = src.slice(src.indexOf(ANCHOR.wpBlock));
    for (const w of ['this.worldProg.addPromise(', 'this.worldProg.revealKnowledge(', 'this.recordSecretFact(']) {
        assert.ok(body.indexOf(w) >= 0, '写入口应在闸之后（' + w + '）');
        assert.ok(body.indexOf(w) > 0 && body.indexOf(w) < 40000, '写入口须落在块内');
    }
});

test('v3309 B2. ★★ 判不了一律放行（闸不是裸判）', () => {
    const src = read();
    // 判定对象里 accept 与 judged 都在：闸只吃 accept，judged 供放行纪律判读
    assert.ok(src.includes(ANCHOR.verdictJudge), 'judged 必须随判定对象一起出来');
    assert.ok(src.includes('隔离漏一点'), '「漏一点好过全消失」的纪律须逐字留档');
});

test('v3309 B3. 账本面与摘要面的拦截面分开记（不并成一处）', () => {
    const src = read();
    assert.ok(countOf(src, ANCHOR.wpSkipReason) >= 1, '账本面审计落点须在');
    assert.ok(countOf(src, ANCHOR.applySkip) >= 1, '摘要面审计落点须仍在（旧行为不改）');
    assert.ok(countOf(src, '.log?.(\'branch\'') >= 2, '两条审计各记一条');
});

// ══ C 读数被读（零读 = 等于没写）═══════════════════════════════════════
test('v3309 C1. ★ _wpBranchSkip 进诊断面（不是只写不读）', () => {
    const src = read();
    assert.ok(countOf(src, ANCHOR.lineRead) >= 1, '诊断面须读该读数');
    const ln = lineOf(src, ANCHOR.lineRead);
    const near = src.slice(src.indexOf('_branchGuardLine()'), src.indexOf('_branchGuardLine()') + 2000);
    assert.ok(near.includes('账本面拦截'), '诊断句须把账本面单独说出来');
});

test('v3309 C2. ★ 从未拦过不报（三态不同形：不是「放行」）', () => {
    const src = read();
    const seg = src.slice(src.indexOf('_branchGuardLine()'), src.indexOf('_branchGuardLine()') + 2000);
    assert.ok(seg.includes('skipped'), '判据须看 skipped 字段，而不是「对象存在」');
    assert.ok(seg.includes('?'), '三元：无记录即不报（不得塌成「放行」）');
});

// ══ D 负控制（真源码破坏 ⇒ 必须翻红）════════════════════════════════════
test('v3309 D1. ★★★ 负控制①：拆掉块头闸 ⇒ 世界推进重新不受分支约束（真翻红）', () => {
    let broke = null;
    try {
        broke = breakOnce(read(), ANCHOR.wpBlock, ANCHOR_BROKEN.wpBlockNoGate);
        const r = structuralReads(broke);
        assert.equal(r.ok, false, '拆掉块头闸后必须翻红');
        assert.ok(r.why.some((w) => w.includes('R2')), '翻红理由须是 R2：' + r.why.join('；'));
    } catch (e) { throw new Error('负控制①失败：' + e.message); }
});

test('v3309 D2. ★★★ 负控制②：判定不前移（回到摘要落笔处才算）⇒ R1 翻红', () => {
    let broke = null;
    try {
        // 破坏形态：把块头闸留着，但把判定对象挪到世界推进之后 —— 用「删掉前移段」模拟
        const src = read();
        const iDecl = src.indexOf(ANCHOR.decl);
        const iWp = src.indexOf(ANCHOR.wpBlock);
        assert.ok(iDecl > 0 && iWp > iDecl, '前移段两端点须都在场且顺序正确（打偏 ⇒ 段为空 ⇒ 假绿）');
        const seg = src.slice(iDecl, iWp);
        assert.ok(seg.length > 0, '前移段不得为空（空段替换 = 同值，负控制会退化成对原文件断言）');
        broke = src.replace(seg, '');
        const r = structuralReads(broke);
        assert.equal(r.ok, false, '前移段被拆后必须翻红');
    } catch (e) { throw new Error('负控制②失败：' + e.message); }
});

test('v3309 D3. ★★★ 负控制③：判定对象丢掉 judged ⇒ 判不了放行这一格消失（真翻红）', () => {
    let broke = null;
    try {
        broke = breakOnce(read(), ANCHOR.verdictWrite, 'this._branchVerdict = { accept: !!g0.accept, reason: String(g0.reason || \'\'), floor: f0 };');
        const r = structuralReads(broke);
        assert.equal(r.ok, false, '丢掉 judged 后必须翻红');
        assert.ok(r.why.some((w) => w.includes('R3')), '翻红理由须是 R3：' + r.why.join('；'));
    } catch (e) { throw new Error('负控制③失败：' + e.message); }
});

test('v3309 D4. ★★★ 负控制④：读数只写不读 ⇒ 「写完没人调」重新变得看不见（真翻红）', () => {
    let broke = null;
    try {
        broke = breakOnce(read(), ANCHOR.lineRead, '__never_reads_this__');
        const r = structuralReads(broke);
        assert.equal(r.ok, false, '读数被摘掉读取点后必须翻红');
        assert.ok(r.why.some((w) => w.includes('R4')), '翻红理由须是 R4：' + r.why.join('；'));
    } catch (e) { throw new Error('负控制④失败：' + e.message); }
});

test('v3309 D5. ★★★ 负控制⑤：判定被加算第二遍 ⇒ 同一问题两个答案（真翻红）', () => {
    let broke = null;
    try {
        // 在 §2 处再插一次同形调用（模拟「顺手在下面再算一次」）
        const src = read();
        assert.equal(src.split("if (!_branchOk) {").length - 1, 1, '第二遍判定的插入点须恰中 1 次');
        broke = src.replace('if (!_branchOk) {', ANCHOR.guardCall + '); if (!_branchOk) {');
        const r = structuralReads(broke);
        assert.equal(r.ok, false, '判定被算两遍后必须翻红');
        assert.ok(r.why.some((w) => w.includes('R5')), '翻红理由须是 R5：' + r.why.join('；'));
    } catch (e) { throw new Error('负控制⑤失败：' + e.message); }
});

// ══ E 判据纯度 / 工具自证 ════════════════════════════════════════════════
test('v3309 E1. ★★ 三类锚点各自的唯一性判据（EXACT / BROKEN / TEXT）', () => {
    const src = read();
    // ① EXACT：本档恰声明 1 次 + 真源上恰中 1 次
    for (const [k, v] of Object.entries(ANCHOR)) {
        assert.equal(countOf(SELF, v), 1, '锚点 ' + k + ' 在本档须恰声明 1 次，实测 ' + countOf(SELF, v));
        assert.equal(countOf(src, v), 1, '锚点 ' + k + ' 在真源上须恰中 1 次，实测 ' + countOf(src, v));
    }
    // ② BROKEN：真源上恰中 0 次（= 已经修好），本档恰声明 1 次
    for (const [k, v] of Object.entries(ANCHOR_BROKEN)) {
        assert.equal(countOf(SELF, v), 1, '破坏形态锚点 ' + k + ' 在本档须恰声明 1 次');
        assert.equal(countOf(src, v), 0, '破坏形态锚点 ' + k + ' 不得出现在真源上（出现即没修好）');
    }
    // ③ TEXT：真源上存在（允许在注释里复述 ⇒ 不判唯一）
    for (const [k, v] of Object.entries(ANCHOR_TEXT)) {
        assert.ok(countOf(src, v) >= 1, '口径留档 ' + k + ' 须在真源上存在');
    }
});

test('v3309 E2. ★★ 破坏工具两向自证：锚点不存在 / 不唯一 / 同值替换，都必须抛', () => {
    const src = read();
    assert.throws(() => breakOnce(src, '__不存在__', 'x'), /恰中 1 次/);
    assert.throws(() => breakOnce(src, 'l', 'x'), /恰中 1 次/, '单字符锚点必不唯一');
    assert.throws(() => breakOnce(src, ANCHOR.wpSkipWrite, ANCHOR.wpSkipWrite), /同值替换/);
    // 真破坏必须**可观测地改变**源码（否则破坏是空转）
    assert.notEqual(breakOnce(src, ANCHOR.lineRead, '__x__'), src);
});

test('v3309 E3. 真源码上原版判据真、破坏副本真红（H5 判据纯度的本档落地）', () => {
    assert.equal(structuralReads(read()).ok, true, '原版必须真绿');
    const broke = breakOnce(read(), ANCHOR.wpBlock, ANCHOR_BROKEN.wpBlockNoGate);
    assert.equal(structuralReads(broke).ok, false, '破坏副本必须真红');
});

// ══ F 版本锚 ════════════════════════════════════════════════════════════
test('v3309 F1. ★ 本档出生版本 = 3.309.0（自锚常量形 + vnum 锚，供版本守卫 V4 计数）', () => {
    // 自锚常量形：原文里出现一次版本字面量（BORN 声明处），此处再断言它真的在档内
    assert.match(SELF, /v3\.309\.0/, '本档须自述出生版本');
    assert.equal(BORN, '3.309.0', '自锚常量与自述须一致');
    /* V4 的合法锚形：vnum 恰好锚着当版（口径见 scan_version_guard 段头 ——
     *   锚必须住在**当版套件**里，且 `vnum('X.Y.Z')` 那种「锁死数」不许出现在历史文件中）。
     *   vnum 口径与守卫同一算式：major*1000000 + minor*1000 + patch。 */
    const vnum = (s) => { const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s).trim()); return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN; };
    assert.equal(vnum(BORN), 3309000, '当版锚须住在本档（V4 当版档案口径）');
});
