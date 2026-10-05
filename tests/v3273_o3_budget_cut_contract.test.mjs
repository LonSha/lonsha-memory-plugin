// tests/v3273_o3_budget_cut_contract.test.mjs — v3.273.0 O3：预算裁剪的可执行契约
// [v3.273.0 O3] 裁剪的**可执行契约**：载荷总长必须落在预算内，超预算必须可归因。
//
// 修的形态（修前实测，不是推断）：三块无常驻、budget=200 ——
//   · balanced 212（超 12）：triggerBudget 只扣头部封装 \n\nNOTE\n，尾部 \nEND\n（39 字符）恒漏计；
//   · relevance 453（超 253）：keepTrig = max(3, 60%) 是**比例**不是容量，触发块越长超得越多；
//   · recency 404（超 204，常驻超预算场景）：kept 分支整批全塞，不看预算。
//   三条共同后果：「载荷恒超预算，且超了没有任何归因」。
//   （计划原文的定性：代码明确要求保留常驻块，故超预算本身不一定是错误；
//     真正要处理的是**封装文字漏计 / 按相关性裁剪时没有按容量选取 / 超出后缺少明确归因**。）
//
// 覆盖：
//   A 契约（三策略 × 多场景：载荷 ≤ 预算；常驻保护不变；触发按容量装）
//   B 归因（常驻自身超预算 ⇒ residentOverflow 可读；未超 ⇒ 不得凭空登记）
//   C 同源（index.js 内联回落与 injection-router.js 模块版逐字等价，五场景 × 三策略）
//   D 负控制（真源码破坏 → 副本上重跑**同款判据**，三条缺陷形态各自必须转红）
//   E 版本锚 + 封装常量同源
//
// 边界（诚实）：
//   契约是**软预算**：常驻块按设计全保留，常驻自身超预算时载荷如实超预算，
//   本套件不把那种情形判成失败 —— 它要求的是「超了必须读得出来」（B1）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { breakSource } from './_break_kit.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
const SELF = fs.readFileSync(new URL(import.meta.url).pathname, 'utf8');
const requireFromHere = createRequire(import.meta.url);
const IR = requireFromHere(path.join(ROOT, 'injection-router.js'));
const ROUTER_SRC = fs.readFileSync(path.join(ROOT, 'injection-router.js'), 'utf8');
const IDX_SRC = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');

/* 封装常量真源：与 index.js 的 NOTE / END 同源（本文件用拼接规避转义污染） */
const NOTE = '〔记忆系统私密简报｜仅你可见〕以下内容帮助保持剧情连贯;严禁在回复正文中复述、罗列或提及本节内容。';
const END = '〔私密简报结束〕请像一个已读过前情的叙述者那样自然续写,不要复述简报本身。';
const NL = String.fromCharCode(10);
const BS = String.fromCharCode(92);   // 反斜杠：真源码里写的是两字符 \n，不是换行
const HEAD = NL + NL + NOTE + NL;   // 52
const TAIL = NL + END + NL;         // 39

const isRes = (b) => IR.isResidentBlock(b);
/** 场景：blocks 为真实块数组，full 按生产构造式拼（含封装） */
function scene(blocks, budget) {
    return { blocks, budget, full: HEAD + blocks.join(NL) + TAIL };
}
const S = {
    // 三触发块、无常驻：修前 balanced=212 / relevance=453（都超 200）
    threeTrig: () => scene(['[事件A]' + 'a'.repeat(56), '[事件B]' + 'b'.repeat(56), '[事件C]' + 'c'.repeat(56)], 200),
    // 常驻 1 + 触发 6：修前 relevance 会按 60% 全塞
    oneResSixTrig: () => scene(['[前情摘要]' + 'r'.repeat(40), '[事件A]' + 'a'.repeat(40), '[事件B]' + 'b'.repeat(40),
        '[事件C]' + 'c'.repeat(40), '[事件D]' + 'd'.repeat(40), '[事件E]' + 'e'.repeat(40), '[手机生活记忆]' + 'm'.repeat(30)], 200),
    // 标记块分散：recency 修前整批全塞
    markerSplit: () => scene(['[前情摘要]' + 'r'.repeat(30), '[关键事件·影响当前]' + 'k'.repeat(60), '[事件B]' + 'b'.repeat(60)], 200),
    // 常驻自身超预算：三策略都应如实超预算 + 有归因
    residentOver: () => scene(['[前情摘要]' + 'r'.repeat(100), '[角色状态]' + 's'.repeat(100)], 200),
    // 宽松预算：常驻装得下、触发按容量装
    loose: () => scene(['[前情摘要]' + 'r'.repeat(40), '[事件A]' + 'a'.repeat(40), '[事件B]' + 'b'.repeat(40)], 300),
};
const STRATEGIES = ['balanced', 'relevance', 'recency'];

/* ══════════════ C 用：index.js 内联回落段（同源等价判据的被测对象） ══════════════ */
const INLINE_START = 'const strategy = keepCount;';
const INLINE_END = '}   // [v3.114] 闭合 else 分支';
function inlineSeg(src) {
    const a0 = src.indexOf(INLINE_START);
    assert.ok(a0 >= 0, '内联段起点必须存在（模块缺席时的回落实现）');
    // ★ 终锚在文件里出现 2 次（另一处是 buildInjection 早段的 else 闭合）——
    //   必须取**起点之后**的第一处，否则会切出负长度（首版实测踩过）。
    const a1 = src.indexOf(INLINE_END, a0);
    assert.ok(a1 > a0, '内联段终点必须在起点之后（同名锚须取最近一处）');
    return src.slice(a0, a1);
}
const INLINE_SEG = inlineSeg(IDX_SRC);
const inlineTrim = new Function('residentBlocks', 'triggerBlocks', 'budget', 'full', 'NOTE', 'END', 'keepCount',
    INLINE_SEG + NL + 'return full;');

/* ══════════════════════════ A. 可执行契约 ══════════════════════════ */
test('v3273 A1. 三策略载荷都不得超预算（封装计入：修前 balanced 212 / relevance 453 / recency 404）', () => {
    const bad = [];
    for (const [name, mk] of Object.entries(S)) {
        if (name === 'residentOver') continue;   // 常驻超预算属 B1 归因面，不算契约违规
        const s = mk();
        for (const st of STRATEGIES) {
            const out = IR.trimToBudget(s.full, s.budget, s.blocks, st);
            if (out.length > s.budget) bad.push(name + '/' + st + ' = ' + out.length + ' > ' + s.budget);
        }
    }
    assert.deepStrictEqual(bad, [], '超预算的场景（修前形态会在这里现形）：' + JSON.stringify(bad));
});

test('v3273 A2. 触发按**容量**装（不是比例）：装不下的触发块必须被丢，且丢在尾部', () => {
    const s = S.threeTrig();
    const tr = {};
    const out = IR.trimToBudget(s.full, s.budget, s.blocks, 'relevance', { trace: tr });
    assert.ok(out.length <= s.budget, '载荷受控');
    assert.ok(tr.keptIdxInAll.length < s.blocks.length, '必然有块被丢（三块 60 字装不进 200-52-39）');
    // 保序装填 ⇒ 被丢的只可能是**尾部**（前缀保留）
    const kept = tr.keptIdxInAll.slice();
    assert.deepStrictEqual(kept, kept.map((_, i) => i).slice(0, kept.length), '保序前缀，实留 ' + JSON.stringify(kept));
    assert.ok(tr.droppedTriggerIdx.length > 0, '丢弃清单非空');
});

test('v3273 A3. 常驻保护不变：常驻块在三策略下都必须留下（软预算的设计意图）', () => {
    const s = S.oneResSixTrig();
    for (const st of STRATEGIES) {
        const out = IR.trimToBudget(s.full, s.budget, s.blocks, st);
        assert.ok(out.includes('[前情摘要]'), st + '：常驻块必须保留');
    }
});

test('v3273 A4. 未超预算早退不变（判定对象是 full，含原封装，原样返回）', () => {
    const s = S.loose();
    const bigger = s.full.length + 100;
    for (const st of STRATEGIES) {
        assert.strictEqual(IR.trimToBudget(s.full, bigger, s.blocks, st), s.full, st + '：未超预算原样返回');
    }
});

/* ══════════════════════════ B. 归因 ══════════════════════════ */
test('v3273 B1. 常驻自身超预算 ⇒ residentOverflow 可读（不偷偷裁关键事实，但必须读得出来）', () => {
    const s = S.residentOver();
    for (const st of STRATEGIES) {
        const tr = {};
        const out = IR.trimToBudget(s.full, s.budget, s.blocks, st, { trace: tr });
        assert.ok(tr.residentOverflow, st + '：常驻溢出必须登记');
        assert.strictEqual(tr.residentOverflow.chars, HEAD.length + s.blocks.join(NL).length + TAIL.length,
            st + '：chars 是**常驻封装实长**（HEAD + 常驻 join + TAIL）');
        assert.strictEqual(tr.residentOverflow.over, tr.residentOverflow.chars - s.budget, st + '：over = chars - budget');
        assert.ok(tr.residentOverflow.over > 0, st + '：确实溢出');
        // 载荷如实超预算（不偷偷裁），但**必须**读得出来 —— 这就是本判据要的东西
        assert.ok(out.length > s.budget, st + '：常驻超预算时载荷如实超（不假装裁掉了）');
        assert.ok(out.includes('[前情摘要]') && out.includes('[角色状态]'), st + '：两个常驻块都还在');
    }
});

test('v3273 B2. 常驻未超预算 ⇒ 不得凭空登记 residentOverflow（归因不许无中生有）', () => {
    for (const name of ['threeTrig', 'oneResSixTrig', 'markerSplit', 'loose']) {
        const s = S[name]();
        for (const st of STRATEGIES) {
            const tr = {};
            IR.trimToBudget(s.full, s.budget, s.blocks, st, { trace: tr });
            assert.ok(!('residentOverflow' in tr), name + '/' + st + '：常驻没超就不许登记溢出');
        }
    }
});

/* ══════════════════════════ C. 同源等价 ══════════════════════════ */
test('v3273 C1. 内联回落段可提取且含容量装填（结构面：不是比例形态）', () => {
    assert.ok(INLINE_SEG.includes("strategy === 'relevance'") && INLINE_SEG.includes("strategy === 'recency'"),
        '内联段必须含三策略分支');
    assert.ok(INLINE_SEG.includes('_trigBudget'), '内联段必须算触发可用容量');
    assert.ok(!INLINE_SEG.includes('triggerBlocks.slice(0, keepTrig)'), '内联段不得残留修前的比例形态');
});

test('v3273 C2. 模块版与内联版逐字等价（五场景 × 三策略；同一口径不许两份实现）', () => {
    const diff = [];
    for (const [name, mk] of Object.entries(S)) {
        const s = mk();
        const res = s.blocks.filter(isRes);
        const trg = s.blocks.filter((b) => !isRes(b));
        // ★ 只比**真裁剪**路径：full 未超预算时模块版早退原样返回，
        //   而内联段本身不含早退（早退在它外层的 if 里）—— 那不是实现漂移，是场景越界。
        if (s.full.length <= s.budget) continue;
        for (const st of STRATEGIES) {
            const mod = IR.trimToBudget(s.full, s.budget, s.blocks, st);
            const inl = inlineTrim(res, trg, s.budget, s.full, NOTE, END, st);
            if (mod !== inl) diff.push(name + '/' + st + ' mod=' + mod.length + ' inl=' + inl.length);
        }
    }
    assert.deepStrictEqual(diff, [], '模块版与内联回落必须逐字等价，漂移处：' + JSON.stringify(diff));
});

/* ══════════════════════════ D. 负控制（真源码破坏 → 副本重跑同款判据） ══════════════════════════ */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'v3273-'));
let tmpN = 0;
/** 在**破坏副本**上重跑同款判据；返回 {threw, message} */
function runOnBroken(anchor, replacement, label, fn) {
    const broken = breakSource(ROUTER_SRC, anchor, replacement, label);
    const dir = path.join(TMP, 'b' + (++tmpN));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'injection-router.js');
    fs.writeFileSync(file, broken);
    const IR2 = requireFromHere(file);
    assert.notStrictEqual(IR2, IR, '必须是破坏副本，不是原件');
    try {
        fn(IR2);
        return { threw: false, message: '' };
    } catch (e) {
        return { threw: true, message: String((e && e.message) || e) };
    }
}
/** 同款契约判据（D1/D2 共用）：任一场景超预算即抛 */
function contractProbe(ir) {
    for (const name of ['threeTrig', 'oneResSixTrig', 'markerSplit', 'loose']) {
        const s = S[name]();
        for (const st of STRATEGIES) {
            const out = ir.trimToBudget(s.full, s.budget, s.blocks, st);
            if (out.length > s.budget) throw new Error('超预算 ' + name + '/' + st + ' = ' + out.length + ' > ' + s.budget);
        }
    }
}
/** 同款归因判据（D3 用）：常驻超预算必须登记 residentOverflow */
function attributionProbe(ir) {
    const s = S.residentOver();
    for (const st of STRATEGIES) {
        const tr = {};
        ir.trimToBudget(s.full, s.budget, s.blocks, st, { trace: tr });
        if (!tr.residentOverflow) throw new Error('缺归因 ' + st);
    }
}

test('v3273 D0. 工具两向自证：破坏必须恰中 1 次、必须真改源码、原版上同判据必须真成立', () => {
    // ① 原版上同款判据必须真成立（否则下面的「破坏后转红」毫无意义）
    contractProbe(IR);
    attributionProbe(IR);
    // ② 锚点不存在 ⇒ 抛
    assert.throws(() => breakSource(ROUTER_SRC, 'const 不存在的锚点XYZ = 1;', 'x', 'D0'), /拒绝破坏|命中 0 次|恰中 1 次/);
    // ③ 锚点不唯一 ⇒ 抛
    assert.throws(() => breakSource(ROUTER_SRC, 'function', 'x', 'D0'), /拒绝破坏|恰中 1 次|要求恰好 1 次/);
    // ④ 同值替换 ⇒ 抛（否则「破坏副本」等于原件）
    const A1 = 'return `${HEAD}${[...resident, ...kept].join(\'' + BS + 'n\')}${TAIL}`;';
    assert.throws(() => breakSource(ROUTER_SRC, A1, A1, 'D0'), /必须真的改变源码|拒绝破坏/);
});

test('v3273 D1. 负控制·容量漏计尾部封装（修前 balanced 形态）⇒ 「载荷 ≤ 预算」必须转红', () => {
    // 修前形态：`triggerBudget = budget - residentText.length` 只扣头部封装，尾部 \nEND\n 恒漏计。
    //   破坏点选**共享的 triggerBudget**（三策略同用），去掉 `- TAIL.length` 即复现该漏计。
    const A = 'const triggerBudget = Math.max(0, budget - residentFrameLen - TAIL.length - (resident.length ? 1 : HEAD.length));';
    const B = 'const triggerBudget = Math.max(0, budget - residentFrameLen - (resident.length ? 1 : HEAD.length));';
    const r = runOnBroken(A, B, 'D1 漏计 TAIL', contractProbe);
    assert.ok(r.threw, '★ 漏计尾部封装后，契约判据必须转红（否则判据对这条缺陷是空转）');
    assert.match(r.message, /超预算/);
});

test('v3273 D2. 负控制·relevance 退回比例形态 ⇒ 「载荷 ≤ 预算」必须转红', () => {
    const r = runOnBroken('const keptT = _fillTrigger(ranked);',
        'const keptT = ranked;', 'D2 比例代替容量', contractProbe);
    assert.ok(r.threw, '★ 退回「按比例全塞」后，契约判据必须转红');
    assert.match(r.message, /超预算/);
});

test('v3273 D3. 负控制·删掉 residentOverflow 登记 ⇒ 归因判据必须转红', () => {
    const r = runOnBroken('_trace.residentOverflow = { chars: residentFrameLen + TAIL.length, over: residentOver };',
        'void residentOver;', 'D3 去归因', attributionProbe);
    assert.ok(r.threw, '★ 删掉溢出登记后，归因判据必须转红');
    assert.match(r.message, /缺归因/);
});

/* ══════════════════════════ E. 版本锚 + 常量同源 ══════════════════════════ */
test('v3273 E1. 封装常量同源：模块 HEAD/TAIL 长度 = 52/39，与 index.js NOTE/END 同源', () => {
    assert.strictEqual(HEAD.length, 52, 'HEAD = NL NL + NOTE + NL');
    assert.strictEqual(TAIL.length, 39, 'TAIL = NL + END + NL');
    assert.ok(ROUTER_SRC.includes(NOTE), '模块里的 NOTE 必须与 index.js 同文');
    assert.ok(ROUTER_SRC.includes(END), '模块里的 END 必须与 index.js 同文');
    assert.ok(IDX_SRC.includes(NOTE) && IDX_SRC.includes(END), 'index.js 的 NOTE/END 是常量真源');
});

test('v3273 E2. 版本锚（下限形）：三源同源且不低于 3.273.0', () => {
    const vnum = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0).reduce((a, b) => a * 1000 + b, 0);
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
    const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).version;
    const idxVer = (/const VERSION = '([0-9.]+)'/.exec(IDX_SRC) || [])[1];
    assert.ok(idxVer, 'index.js 必须有 VERSION 常量');
    assert.strictEqual(pkg, idxVer, 'package.json 与 index.js 版本必须一致');
    assert.strictEqual(man, idxVer, 'manifest.json 与 index.js 版本必须一致');
    assert.ok(vnum(idxVer) >= vnum('3.273.0'), '本套件自 3.273.0 起成立；当前 ' + idxVer);
    assert.ok(SELF.includes('v3.273.0'), '★ 本档必须锁自己的出生版本 v3.273.0（不随抬版上抬）');
});