/* L13-O3: 只读视图的机器可读四态（absent / blocked / failed / empty / ok）+ reason code。
 *
 * 【本档要证明的不是「加了几个属性」，而是五件事】
 *   a) 同一视图不同造法**产出不同 data-face-state** —— 三种语义压成一个态，
 *      等于把「你去配一下」说成「本来就没有」，这是本项的核心禁令。
 *   b) 抛错是 failed（可重试），不许与 absent / empty 混形。
 *   c) 根节点**统一**带 data-face-state / data-face-why，一处覆盖全部视图。
 *   d) reason code 是短横线英文（机器可判），不是中文散文。
 *   e) vector 视图的「零向量」四态分流：「配置读不到」不许说成「没配置」。
 *
 * 【判据纪律】
 *   · 全部作用在 settings-ui.js 的**原文切片**上（该文件是经典 <script> 注入脚本，
 *     不被 node --test 加载），不重写一份实现（那是第二套真源）。
 *   · 负控制一律「真源码破坏 -> 加载破坏副本 -> 在副本上重跑同一条真判据」，
 *     不做「对原文件断言」的假绿，也不把破坏写死成模拟常量。
 *   · 锚点字面量只在 ANCHORS 段声明一次（判据纯度），判据函数不引用锚点串。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const UI = fs.readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf8');

/* ── 锚点（唯一声明处）────────────────────────────────────────────
 * A_STATE 段刻意切到 faceHTML 末行：早先误用 "return [];\n};" 作结束锚点，
 * 那个串在 faceMiss 末尾就先命中一次，导致 faceBlocked 整段被切掉、
 * 求值时报 faceBlocked is not defined —— 锚点选错会让判据自己失效。 */
const A_SCOPE = 'plugin.showBrowser = function(viewType) {';
const A_STATE_START = "const faceState = { state: 'ok', reason: '', code: '' };";
const A_STATE_END = "esc(howTo || '') + '</div>';";
const A_ESC_LINE = `const esc = (t) => String(t || '')`;
const A_ESC_ATTR_LINE = `const escAttr = (t) => esc(t).replace(`;
const A_BLOCKED_STATE = `faceState.state = 'blocked';`;
const A_MISS_CODE = `faceState.code = String(code || 'module-absent');`;
const A_ROOT_STATE = `+ '" data-face-state="' + escAttr(faceState.state`;
const A_VECTOR_HEAD = `else if (viewType === 'vectors') {`;
const A_VECTOR_TAIL = `else if (viewType === 'items') {`;

function slot(src, anchor, from) {
    const at = src.indexOf(anchor, from || 0);
    assert.ok(at >= 0, '锚点缺失（源码改名？）: ' + anchor.slice(0, 48));
    return at;
}
function extract(src, startAnchor, endAnchor, from) {
    const a = slot(src, startAnchor, from);
    const b = src.indexOf(endAnchor, a);
    assert.ok(b > a, '结束锚点缺失或乱序: ' + endAnchor.slice(0, 48));
    return src.slice(a, b + endAnchor.length);
}
function lineOf(src, anchor, from) {
    const at = slot(src, anchor, from);
    const nl = src.indexOf('\n', at);
    return src.slice(at, nl < 0 ? src.length : nl);
}

/* ── 从真源码切出四态机制并可求值 ─────────────────────────────── */
function buildFace(src) {
    const scopeAt = slot(src, A_SCOPE);
    /* 结束锚点停在 faceHTML 最后那条 return 的行尾，故此处补回函数收尾的 `};` */
    const seg = extract(src, A_STATE_START, A_STATE_END, scopeAt) + '\n};';
    const escLine = lineOf(src, A_ESC_LINE, scopeAt);
    const escAttrLine = lineOf(src, A_ESC_ATTR_LINE, scopeAt);
    /* 先自证：切出来的段必须真的含四个 helper 的声明头，否则求值必炸或判据空转 */
    for (const head of ['const faceMiss = ', 'const faceBlocked = ', 'const faceRead = ', 'const faceHTML = ']) {
        assert.ok(seg.includes(head), '切片漏了 helper: ' + head);
    }
    const code = escLine + '\n' + escAttrLine + '\n' + seg
        + '\nreturn { faceState, faceMiss, faceBlocked, faceRead, faceHTML };';
    return new Function(code)();
}

/* ── 判据函数（可作用于原件与破坏副本，故不内联任何锚点串）───────── */
function judgeRootHasState(src) {
    return /class="ls-face-root"[\s\S]{0,240}?data-face-state="/.test(src);
}
function judgeRootWired(src) {
    /* 根节点必须真的被当作 sheet 的 body 用（不是定义了没人用） */
    return /const _faceRoot = /.test(src) && /makeSheet\('lonsha-browser-overlay', title, _bodyWrapped\)/.test(src);
}
function judgeAllStatesDeclared(src) {
    return ['absent', 'blocked', 'failed', 'empty']
        .every(st => src.includes('data-ls-face="' + st + '"'));
}
function judgeCodeIsSlug(code) {
    return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(String(code || ''));
}

/* ══════════════════════════════════════════════════════════════ */

test('L13-O3 A: 四种造法产出四个不同态，且两两不同形', () => {
    /* ① 模块没装上 */
    let f = buildFace(UI);
    f.faceRead(() => '向量服务缺席', () => []);
    assert.equal(f.faceState.state, 'absent');
    assert.equal(f.faceState.code, 'module-absent');
    const hAbsent = String(f.faceHTML(''));
    assert.match(hAbsent, /data-ls-face="absent"/);
    assert.match(hAbsent, /没装上/);

    /* ② 装上了但缺前置条件（未配 Key） */
    f = buildFace(UI);
    f.faceBlocked('embedding-not-configured', 'Embedding 端点或 Key 未配置');
    assert.equal(f.faceState.state, 'blocked');
    assert.equal(f.faceState.code, 'embedding-not-configured');
    const hBlocked = String(f.faceHTML(''));
    assert.match(hBlocked, /data-ls-face="blocked"/);
    assert.match(hBlocked, /data-face-why="embedding-not-configured"/);
    assert.match(hBlocked, /缺前置条件/);

    /* ③ 装上了、有前置条件、真没有数据 */
    f = buildFace(UI);
    f.faceRead(() => '', () => []);
    const hEmpty = String(f.faceHTML(''));
    assert.match(hEmpty, /data-ls-face="empty"/);
    assert.match(hEmpty, /data-face-why="no-data"/);

    /* ④ 四态互不同形 —— 压成一个态是本项明令禁止的解 */
    assert.notEqual(hAbsent, hBlocked);
    assert.notEqual(hBlocked, hEmpty);
    assert.notEqual(hAbsent, hEmpty);
    /* 文案也必须随态变化：absent 说「没装上」，blocked 说「缺前置条件」，不许同用一句 */
    assert.ok(!/缺前置条件/.test(hAbsent), 'absent 不许说成缺前置条件');
    assert.ok(!/没装上/.test(hBlocked), 'blocked 不许说成没装上');
    assert.ok(!/没装上|缺前置条件/.test(hEmpty), 'empty 不许借 absent/blocked 的文案');
});

test('L13-O3 B: 取数抛错是 failed（可重试），不与 absent/empty 混形', () => {
    const f = buildFace(UI);
    /* 守卫自身抛错（服务对象读失败）也必须落 failed，不许炸出面板 */
    f.faceRead(() => { throw new Error('守卫自己抛'); }, () => []);
    assert.equal(f.faceState.state, 'failed', '守卫抛错须落 failed');
    assert.equal(f.faceState.code, 'read-threw');

    const g = buildFace(UI);
    g.faceRead(() => '', () => { throw new Error('底层读失败'); });
    assert.equal(g.faceState.state, 'failed');
    assert.equal(g.faceState.code, 'read-threw');
    const h = String(g.faceHTML(''));
    assert.match(h, /data-ls-face="failed"/);
    assert.match(h, /重试/, '失败必须留重试入口');
    assert.ok(!/真的没有/.test(h), 'failed 不许说成 empty');
    /* 源码面：失败态的重试按钮必须真接线到 showBrowser 重进 */
    assert.match(UI, /\.ls-face-retry'\)\.forEach[\s\S]{0,200}plugin\.showBrowser\(viewType\)/, '重试按钮须真接线');
});

test('L13-O3 C: 根节点统一挂机读态 —— 一处覆盖全部视图', () => {
    assert.ok(judgeRootHasState(UI), '根节点须带 data-face-state');
    assert.ok(judgeRootWired(UI), '根节点须真作为 sheet body 使用');
    assert.ok(/data-face-why="/.test(UI), '根节点须带 data-face-why');
    /* 四态标记必须齐（缺一个即说明有态被压掉了） */
    assert.ok(judgeAllStatesDeclared(UI), '四态标记须齐: absent/blocked/failed/empty');
    /* ok 态也必须带属性：不许只给空态挂 */
    assert.match(UI, /faceState\.state === 'ok' \? 'ok' : faceState\.state/, 'ok 态须落值到 data-face-state');
});

test('L13-O3 D: reason code 必须是短横线英文，且完全由代码产生（不猜）', () => {
    for (const code of ['module-absent', 'embedding-not-configured', 'read-threw', 'no-data', 'precondition-missing']) {
        assert.ok(judgeCodeIsSlug(code), 'reason code 须短横线英文: ' + code);
    }
    /* 真源码里所有往 code 写字的地方，写入值都必须是 slug 或 slug 常量 */
    const writes = UI.match(/faceState\.code = [^;]+;/g) || [];
    assert.ok(writes.length >= 3, 'code 写入点须存在: ' + writes.length);
    for (const w of writes) {
        assert.ok(!/[\u4e00-\u9fa5]/.test(w), 'code 不许写中文散文: ' + w);
    }
    /* 求值面：真调用产出的 code 必须过 slug 判据 */
    const f = buildFace(UI);
    f.faceRead(() => { throw new Error('x'); }, () => []);
    assert.ok(judgeCodeIsSlug(f.faceState.code), '抛错产出 code 须是 slug: ' + f.faceState.code);
    const g = buildFace(UI);
    g.faceMiss('服务缺席');
    assert.ok(judgeCodeIsSlug(g.faceState.code), '缺席产出 code 须是 slug: ' + g.faceState.code);
});

test('L13-O3 E: vector 视图零向量四态分流，配置读不到 != 没配置', () => {
    const at = slot(UI, A_VECTOR_HEAD);
    const seg = UI.slice(at, UI.indexOf(A_VECTOR_TAIL, at));
    assert.ok(seg.length > 100, 'vector 段切空了');
    assert.match(seg, /faceBlocked\('embedding-not-configured'/, 'vector 零向量须能判 blocked');
    assert.match(seg, /faceRead\(/, 'vector 须走 faceRead 收口（缺席/抛错）');
    assert.match(seg, /向量服务缺席/, 'vector 缺席仍须判 absent');
    /* known 只在**真读到配置对象**时置真 */
    assert.match(seg, /if \(c\) return \{ known: true, ready: !!\(url && key\) \};/, 'known 只能由真读到的配置点亮');
    assert.match(seg, /return \{ known: false, ready: false \};/, '读不到时须保留未知');
    /* 判 blocked 的前提必须是「已知且未就绪」，不许单看 ready */
    assert.match(seg, /_embCfg\.known && !_embCfg\.ready/, 'blocked 须以 known && !ready 为前提');
});

test('L13-O3 F: 真源码破坏 -> 同一条判据必须翻红（四组负控制）', () => {
    /* ── N1: 把 blocked 压成 empty（最常见的偷懒解法）── */
    const n1 = UI.replace(A_BLOCKED_STATE, `faceState.state = 'empty';`);
    assert.notEqual(n1, UI, 'N1 破坏锚点须命中');
    {
        const f = buildFace(n1);
        f.faceBlocked('embedding-not-configured', 'x');
        assert.equal(f.faceState.state, 'empty');
        assert.notEqual(f.faceState.state, 'blocked', '=> A 段 blocked 断言在此必然翻红');
    }

    /* ── N2: 根节点去掉 data-face-state（状态只泄在空态 hint 上）── */
    const n2 = UI.replace(A_ROOT_STATE, `+ '" data-face-state-x="' + escAttr(faceState.state`);
    assert.notEqual(n2, UI, 'N2 破坏锚点须命中');
    assert.equal(judgeRootHasState(n2), false, '=> C 段根节点判据在此翻红');
    assert.equal(judgeRootHasState(UI), true, '原版上同一判据须为真');

    /* ── N3: reason code 写成中文散文 ── */
    const n3 = UI.replace(A_MISS_CODE, `faceState.code = '模块没装上';`);
    assert.notEqual(n3, UI, 'N3 破坏锚点须命中');
    {
        const f = buildFace(n3);
        f.faceMiss('模块没装上');
        assert.equal(judgeCodeIsSlug(f.faceState.code), false, '=> D 段 slug 判据在此翻红');
    }
    {
        const f = buildFace(UI);
        f.faceMiss('模块没装上');
        assert.equal(judgeCodeIsSlug(f.faceState.code), true, '原版上同一判据须为真');
    }

    /* ── N4: 少一个态标记（absent/blocked 混成一态）── */
    const n4 = UI.replace('data-ls-face="blocked"', 'data-ls-face="absent"');
    assert.notEqual(n4, UI, 'N4 破坏锚点须命中');
    assert.equal(judgeAllStatesDeclared(n4), false, '=> C 段四态齐全判据在此翻红');
    assert.equal(judgeAllStatesDeclared(UI), true, '原版上四态须齐');
});

/* 工具两向自证：锚点不存在就必须抛，不许静默退化 */
test('L13-O3 G: 锚点自证 —— 源码改名时判据必须抛，不许空转通过', () => {
    assert.throws(() => slot('nothing here', A_STATE_START), /锚点缺失/);
    assert.throws(() => extract(UI, A_STATE_START, '绝不存在的结束锚点'), /结束锚点缺失/);
    /* 切片自证：faceBlocked 必须在切片内（早先锚点选错把它切掉了，静默退化） */
    const seg = extract(UI, A_STATE_START, A_STATE_END, slot(UI, A_SCOPE));
    assert.ok(seg.includes('const faceBlocked = '), 'faceBlocked 必须在切片内');
    assert.ok(seg.includes('const faceHTML = '), 'faceHTML 必须在切片内');
});