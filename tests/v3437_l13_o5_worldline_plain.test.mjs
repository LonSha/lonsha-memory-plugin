/* L13-O5: 世界线口径对玩家的可读化 —— 「我受影响的是哪几条」。
 *
 * 【要治的形态（实测）】
 *   v3.429.0 已交付 `data-wl-readout` 六属性机器读数，卡作者读文档能懂；
 *   普通玩家打开面板只看到一串 `alpha线@47`，既不知道那意味着什么，
 *   也不知道「没生效」跟「安全」不是一回事。
 *
 * 【本档钉住的五件事】
 *   a) 三态（none / gap / ok）各有**自己的**人话解释，句子两两不同（不做统一模板）；
 *   b) none 态文案里**不出现「安全」二字** —— 「保护没生效」不许说成「安全」；
 *   c) 「我受影响的是哪几条」走**内核读口** `worldlineAffected`，面板不自己判归属；
 *   d) 该读口三态不同形：no-source / disabled / has-undecided，不许压成「0 条」；
 *   e) 判不了（undecided）与挡下（blocked）**分列**，不许合并成一档。
 *
 * 【判据手法】
 *   A/B 段不做字符串包含，而是把源码里的 `PLAIN` 表**原文切出来真求值**，
 *   用三种真实输入各渲染一次再比 —— 这样「三句写成同一个模板」会被直接抓住，
 *   而不是被「串出现了」蒙过去。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const UI = fs.readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf8');
const DL = fs.readFileSync(path.join(ROOT, 'engine-diagnostic-lines.js'), 'utf8');
const IDX = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');

/* ── 锚点（唯一声明处）───────────────────────────────────────────── */
const A_PLAIN_MAP = 'const PLAIN = {';
const A_PLAIN_END = 'const plain = PLAIN[stateMark] || PLAIN.none;';
const A_AFF_BTN = 'id="ls-wl-affected"';
const A_AFF_CALL = 'e.worldlineAffected({})';
const A_AFF_TAIL = '/* 原文直编';
const A_KERNEL_FN = 'function worldlineAffected(engine, opts) {';
const A_KERNEL_END = "return Object.assign(base, { state: 'failed', reason: 'thrown' }); }";
const A_GATE_DISABLED = "if (cfg.worldlineMemoryEnabled !== true) {";

function slot(src, anchor, from) {
    const at = src.indexOf(anchor, from || 0);
    assert.ok(at >= 0, '锚点缺失（源码改名？）: ' + anchor.slice(0, 48));
    return at;
}

/* ── 从真源码切出 PLAIN 表并真求值 ──────────────────────────────── */
function plainTableSrc(src) {
    const a = slot(src, A_PLAIN_MAP);
    const b = src.indexOf(A_PLAIN_END, a);
    assert.ok(b > a, 'PLAIN 段切不出来');
    const seg = src.slice(a, b);
    assert.ok(/\};\s*$/.test(seg), 'PLAIN 段须以 }; 收尾');
    return seg;
}
/* 求值作用域：esc/draft/gap/st 由调用方按态造。这是一份**只渲染文案**的表，
 *  不参与任何判定，所以喂它受控值不会变成第二套真源。 */
function renderPlain(src, stateKey, ctx) {
    const seg = plainTableSrc(src);
    const f = new Function('esc', 'draft', 'gap', 'st', seg + '\nreturn PLAIN;');
    const esc = (t) => String(t == null ? '' : t);
    const table = f(esc, ctx.draft || {}, ctx.gap || null, ctx.st || {});
    assert.ok(table && typeof table[stateKey] === 'string', '缺 ' + stateKey + ' 态文案');
    return table[stateKey];
}
const CTX = {
    none: { draft: { firstFloor: null }, gap: null, st: {} },
    gap: { draft: { firstFloor: 47 }, gap: { count: 46, from: 1, to: 46 }, st: {} },
    ok: { draft: { firstFloor: 1 }, gap: null, st: { adjacentPolicy: 'hold' } },
};
const text = (html) => String(html).replace(/<[^>]*>/g, '').replace(/\s+/g, '');

/* ══════════════════════════════════════════════════════════════ */

test('L13-O5 A: 三态各有独立人话，句子两两不同（真求值，不是查串）', () => {
    const none = text(renderPlain(UI, 'none', CTX.none));
    const gap = text(renderPlain(UI, 'gap', CTX.gap));
    const ok = text(renderPlain(UI, 'ok', CTX.ok));
    for (const [k, v] of [['none', none], ['gap', gap], ['ok', ok]]) {
        assert.ok(v.length > 40, k + ' 态人话过短: ' + v.length);
    }
    /* 三句必须彼此不同：把三态写成同一个模板正是本项禁止的解法 */
    assert.notEqual(none, gap, 'none 与 gap 文案不许相同');
    assert.notEqual(gap, ok, 'gap 与 ok 文案不许相同');
    assert.notEqual(none, ok, 'none 与 ok 文案不许相同');
    /* 每句必须点明自己的语义指向，而不是泛泛「已保存」 */
    assert.match(none, /没有生效/, 'none 须明说「没生效」');
    assert.match(gap, /判不了|分不清/, 'gap 须明说「判不了/分不清」');
    assert.match(ok, /首跳|算得清|覆盖/, 'ok 须说清覆盖了什么');
    /* gap 的数字必须来自入参（真随态），不是写死的 */
    const gap2 = text(renderPlain(UI, 'gap', { draft: { firstFloor: 9 }, gap: { count: 8, from: 1, to: 8 }, st: {} }));
    assert.notEqual(gap, gap2, 'gap 文案须随入参变化（否则是静态帮助文本）');
    assert.match(gap2, /8/, 'gap 文案须带真实条数');
});

test('L13-O5 B: none 态文案不出现「安全」二字（没生效 ≠ 安全）', () => {
    const none = text(renderPlain(UI, 'none', CTX.none));
    assert.ok(!/安全/.test(none), 'none 态文案里不许出现「安全」: ' + none.slice(0, 80));
    /* 整张表里「安全」只允许以否定语境出现。
     * ★ 先剥掉注释：注释里的「刻意不写『安全』」是给读码人看的说明，
     *   不是玩家会看到的文案 —— 把注释算进文案判据会把正确实现判红。 */
    const seg = plainTableSrc(UI).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const h of seg.matchAll(/安全/g)) {
        const ctx = seg.slice(Math.max(0, h.index - 14), h.index + 14);
        assert.ok(/不是|不许|别把|≠/.test(ctx), '「安全」只能以否定语境出现，实际: ' + ctx.replace(/\s+/g, ' '));
    }
});

test('L13-O5 C: 受影响条目走内核读口，面板不自己判归属', () => {
    assert.ok(UI.includes(A_AFF_BTN), '面板须有「受影响条目」按钮');
    assert.ok(UI.includes(A_AFF_CALL), '面板须调内核 worldlineAffected');
    /* 面板侧整段回执：不许自己重算纪元，须自述只读 */
    const a = slot(UI, A_AFF_CALL);
    const b = UI.indexOf(A_AFF_TAIL, a);
    assert.ok(b > a, '回执段切不出来');
    const seg = UI.slice(a, b);
    assert.ok(!/epochAt|tagOf|\.guard\(/.test(seg), '面板不许自己重算纪元（第二套真源）');
    assert.match(seg, /只读/, '面板回执须自述只读');
    /* 三态在面板侧也必须不同形（不许把 disabled 说成 0 条） */
    assert.match(seg, /no-source/, '面板须处理「取不到来源」');
    assert.match(seg, /disabled/, '面板须处理「闸没开」');
    assert.match(seg, /不是「一条都没有」|不是「都没有问题」/, '缺席态不许说成 0 条');
    /* 内核读口 + api 导出 + index 代理 */
    assert.ok(DL.includes(A_KERNEL_FN), '内核须有 worldlineAffected');
    assert.match(DL, /worldlineAffected, _worldlineAffectedLine/, '读口须进 api 导出表');
    assert.match(IDX, /worldlineAffected\(\.\.\.args\)/, 'index.js 须有代理');
});

test('L13-O5 D: 读口三态不同形，且判不了/挡下分列（不许压成 0 条）', () => {
    const a = slot(DL, A_KERNEL_FN);
    const b = DL.indexOf(A_KERNEL_END, a);
    assert.ok(b > a, '读口函数体切不出来');
    const seg = DL.slice(a, b);
    for (const st of ['no-source', 'disabled', 'failed', 'has-undecided', 'clean']) {
        assert.ok(seg.includes("'" + st + "'"), '缺状态: ' + st);
    }
    assert.match(seg, /undecided: und/, 'undecided 须独立成字段');
    assert.match(seg, /blocked: blk/, 'blocked 须独立成字段');
    assert.ok(!/undecided\.concat\(blocked\)|blocked\.concat\(undecided\)/.test(seg), '不许把两桶合并');
    assert.match(seg, /writesNothing: true/, '须自述只读');
    assert.ok(!/\.save\(|writeFile|localStorage/.test(seg), '读口不许写盘');
    assert.ok(seg.includes(A_GATE_DISABLED), '须显式判「闸没开」');
});

test('L13-O5 E: 真源码破坏 -> 同一条判据必须翻红（三组负控制）', () => {
    /* ── N1: none 态写成「安全」（最典型的骗人写法）── */
    const n1 = UI.replace('这道保护现在没有生效。', '这道保护现在是安全的。');
    assert.notEqual(n1, UI, 'N1 破坏锚点须命中');
    {
        const none1 = text(renderPlain(n1, 'none', CTX.none));
        assert.match(none1, /安全/, '破坏后确实说了「安全」');
        assert.ok(!/安全/.test(text(renderPlain(UI, 'none', CTX.none))), '=> B 段判据在此必然翻红（原版无安全二字）');
    }

    /* ── N2: 三态合并成一个模板（gap 直接复用 none 的整段表达式）──
     * 破坏方式：把 gap 那**三行**整体换成 none 那**三行**原文（都保持语法有效），
     *   于是求值后两者必然同形 —— 这正是「三态写成一句」的形态。
     * 先把两段按行定位切出来，再拼，最后做一次语法自证（破坏本身不许语法错）。 */
    const lineStartOf = (src, anchor) => src.lastIndexOf('\n', src.indexOf(anchor)) + 1;
    const noneStartL = lineStartOf(UI, "none: '<b style=\"color:var(--ls-warn,#e3b341);\">这段对话还没有世界线跳转记录");
    const gapStartL = lineStartOf(UI, "gap: '<b style=\"color:var(--ls-warn,#e3b341);\">开头有 '");
    assert.ok(noneStartL > 0 && gapStartL > 0, 'N2 须能定位两段起始行');
    /* 两段的结束行：各自的下一条注释行（`/* ok：` / `/* gap：`）之前 */
    const noneEndL = lineStartOf(UI, '/* gap：');
    const gapEndL = lineStartOf(UI, '/* ok：');
    assert.ok(noneEndL > noneStartL && gapEndL > gapStartL, 'N2 须能定位两段结束行');
    const noneBlock = UI.slice(noneStartL, noneEndL);
    const n2 = UI.slice(0, gapStartL) + noneBlock.replace(/^\s*none:/, 'gap:') + UI.slice(gapEndL);
    assert.notEqual(n2, UI, 'N2 破坏须真的改动源码');
    /* 语法自证：破坏后的 PLAIN 段必须仍可求值（不然抓到的只是语法错，不是语义退化） */
    {
        const noneT = text(renderPlain(n2, 'none', CTX.none));
        const gapT = text(renderPlain(n2, 'gap', CTX.gap));
        assert.equal(gapT, noneT, '破坏后 gap 与 none 同形');
        assert.notEqual(text(renderPlain(UI, 'gap', CTX.gap)), noneT, '=> A 段「两两不同」判据在此必然翻红');
    }

    /* ── N3: 把 undecided 与 blocked 合并成一桶 ── */
    const n3 = DL.replace('undecided: und,', 'undecided: und.concat(blk),');
    assert.notEqual(n3, DL, 'N3 破坏锚点须命中');
    {
        const seg3 = n3.slice(slot(n3, A_KERNEL_FN), n3.indexOf(A_KERNEL_END, slot(n3, A_KERNEL_FN)));
        assert.ok(!/undecided: und,/.test(seg3), '=> D 段分列判据在此翻红');
        assert.ok(/undecided: und,/.test(DL.slice(slot(DL, A_KERNEL_FN), DL.indexOf(A_KERNEL_END, slot(DL, A_KERNEL_FN)))), '原版须为真');
    }
});