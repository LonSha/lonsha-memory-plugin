/* ============================================================
 * tests/v3480_closeout_fourth_phase.test.mjs — v3.348.0 · 第四期计划收口
 * 收口点自证:全量实跑读数已登记、四源同源、基线/上界当版有账、台账覆盖磁盘
 *
 * 【本档要证明的五件事(不是「文件在场」)】
 *   a) **收口读数真的登记了**:tests/audit/doc_readings.json 与本版同源,
 *      且四元组(测试文件 / 断言 / 审计通过 / 审计总数)全为真读数 —— 不是空壳;
 *   b) **人读面与登记逐项一致**:PLAN 的快照四元组必须与登记逐位相等(README 自 v3.424.0 起定位玩家门面,不载工程读数),
 *      且「登记已对齐当版却仍标全量待验」必须当场翻红(把已实跑说成没跑);
 *   c) **上界与基线当版有账**:line_budget.history 必须留当版条目、
 *      ceiling 与末条 history 同源;基线 measured_at 与当版同源且 rebuilds 留读数;
 *   d) **台账覆盖磁盘**:catalog_reference_consumers.tsv 与 tests/ 下的
 *      全部 .test.mjs **双向齐全**(差一条就是「接入面与判据面不同源」);
 *   e) **发布面同源**:CHANGELOG 顶节就是本版,且当版节带可磁盘重算的档自述读数。
 *
 * 【四条「不做」也在判据里】
 *   1 不手改 JSON 数字:上界/基线/登记一律只读,判「是否同源」;
 *   2 不重跑全量:本档只核对「文档 ↔ 登记 ↔ 磁盘」,跑批留给人;
 *   3 不放宽判据换绿:负控制一律真源码破坏 + 原版阳性对照;
 *   4 不建第二套台账:复用既有 doc_readings / host_beast_baseline / tsv。
 *
 * 【负控制一律真源码破坏】锚点恰中 1 次 → 在**独立树**上重跑**同款真判据** →
 *   必须现形;并反向对照「原版同判据必须通过」。判据纯度(H5)单独一段。
 * 【当版锚点】本档自锚常量 BORN_V + vnum(BORN_V)(锚必须住在当版档案里,供版本守卫 V4 计数)。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakOnce } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const SELF = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
const BORN_V = '3.348.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));

const RD = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const RJ = (root, rel) => JSON.parse(RD(root, rel));
const idxVersion = (root) => (/const VERSION = '([0-9]+[.][0-9]+[.][0-9]+)'/.exec(RD(root, 'index.js')) || [])[1];

/* ══════════════ 判据：一律纯函数(root) → 问题数组（空 = 绿） ══════════════ */

/** ① 四源同源：index / manifest / package + 三份内核副本的 let VERSION。 */
function judgeFourSource(root) {
    const bad = [];
    const cur = idxVersion(root);
    if (!cur) { bad.push('index.js 读不到 const VERSION'); return bad; }
    for (const [rel, key] of [['manifest.json', 'version'], ['package.json', 'version']]) {
        const v = RJ(root, rel)[key];
        if (v !== cur) bad.push(rel + ' ' + v + ' !! index.js ' + cur);
    }
    for (const rel of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const m = /^[ \t]*let VERSION = '([0-9]+[.][0-9]+[.][0-9]+)'/m.exec(RD(root, rel));
        if (!m) bad.push(rel + ' 找不到 let VERSION 声明(副本形态漂移)');
        else if (m[1] !== cur) bad.push(rel + ' 副本 ' + m[1] + ' !! ' + cur);
    }
    return bad;
}

/** ② 收口读数登记：doc_readings 四元组均为**真读数**(不是空壳)，且版本不得晚于当版。
 *   【中间态合法】登记落后于当版是合法的（实跑只在计划收口点跑），但必须同时标「全量待验」（由 B3 双向守）；
 *     登记落后却不标待验、或登记超前于当版，都是读数不实。登记一旦对齐当版，则必须留 rebinds 当版痕。 */
function judgeReadingsRegistered(root) {
    const bad = [];
    const cur = idxVersion(root);
    const reg = RJ(root, 'tests/audit/doc_readings.json');
    if (!/^[0-9]+[.][0-9]+[.][0-9]+$/.test(String(reg.version))) {
        bad.push('doc_readings.version 形态非法:' + reg.version);
    } else if (vnum(reg.version) > vnum(cur)) {
        bad.push('doc_readings.version ' + reg.version + ' 晚于当版 ' + cur + '(登记不能签未来版)');
    }
    for (const k of ['tests_total', 'assertions', 'audit_passed', 'audit_total']) {
        if (typeof reg[k] !== 'number' || reg[k] <= 0) bad.push('doc_readings 缺真读数 ' + k + '(空壳登记)');
    }
    if (typeof reg.tests_total === 'number' && typeof reg.assertions === 'number'
        && reg.assertions < reg.tests_total) {
        bad.push('断言数 ' + reg.assertions + ' 少于测试文件数 ' + reg.tests_total + ' —— 摘要有误');
    }
    if (reg.version === cur && !(reg.rebinds || {})['v' + cur]) {
        bad.push('登记已对齐当版 v' + cur + ' 但 rebinds 缺当版留痕(手改的登记?)');
    }
    return bad;
}

/** ③ 人读面快照与登记逐位一致（PLAN 面；README 自 v3.424.0 起定位玩家门面，不载工程读数）。 */
function judgeDocSnapshot(root) {
    const bad = [];
    const reg = RJ(root, 'tests/audit/doc_readings.json');
    const plan = RD(root, 'PLAN.md');
    const pm = /最近全量快照 \*\*v([0-9.]+)：(\d+) 测试文件 \/ (\d+) 断言 0 失败 \/ 审计 (\d+)\/(\d+)\*\*/.exec(plan);
    if (!pm) bad.push('PLAN 缺「最近全量快照 **vX：N 测试文件 / M 断言 0 失败 / 审计 P/Q**」');
    else if (pm[1] !== reg.version || +pm[2] !== reg.tests_total || +pm[3] !== reg.assertions
        || +pm[4] !== reg.audit_passed || +pm[5] !== reg.audit_total) {
        bad.push('PLAN 快照 v' + pm[1] + ' · ' + pm[2] + '/' + pm[3] + '/' + pm[4] + '/' + pm[5] + ' !! 登记值');
    }
    return bad;
}

/** ④ 待验标记与登记状态双向一致：登记对齐当版 ⇒ 不得再有「全量待验」。 */
function judgePendingMarker(root) {
    const bad = [];
    const cur = idxVersion(root);
    const reg = RJ(root, 'tests/audit/doc_readings.json');
    const pp = /当前 v([0-9.]+) \*\*全量待验\*\*/.exec(RD(root, 'PLAN.md'));
    if (reg.version === cur) {
        if (pp) bad.push('PLAN 仍标「当前 v' + pp[1] + ' 全量待验」,而登记已对齐 ' + cur);
    } else {
        if (!pp || pp[1] !== cur) bad.push('PLAN 缺「当前 v' + cur + ' **全量待验**」(登记停在 v' + reg.version + ')');
    }
    return bad;
}

/** ⑤ 行上界当版有账：末条 history 带当版号,ceiling/note 与末条同源。 */
function judgeLineBudget(root) {
    const bad = [];
    const cur = idxVersion(root);
    const b = RJ(root, 'tests/audit/host_beast_baseline.json');
    const lb = b.line_budget || {};
    const hist = Array.isArray(lb.history) ? lb.history : [];
    if (!hist.length) { bad.push('line_budget.history 为空(静默抬升)'); return bad; }
    const last = hist[hist.length - 1];
    if (!String(last.reason || '').includes('v' + cur)) {
        bad.push('line_budget 末条 history 未留当版登记(v' + cur + ')——「长回线上要有账」');
    }
    if (lb.ceiling !== last.ceiling) bad.push('line_budget.ceiling ' + lb.ceiling + ' !! 末条 history ' + last.ceiling);
    if (lb.note !== last.reason) bad.push('line_budget.note 不是末条 history 理由的复述');
    if (typeof b.readings.total_lines === 'number' && typeof lb.ceiling === 'number') {
        if (b.readings.total_lines > lb.ceiling) bad.push('宿主行数 ' + b.readings.total_lines + ' 越过上界 ' + lb.ceiling);
        if (lb.ceiling - b.readings.total_lines > lb.maxSlack) {
            bad.push('上界余量 ' + (lb.ceiling - b.readings.total_lines) + ' 超过 maxSlack ' + lb.maxSlack + '(上界与实测脱节)');
        }
    }
    return bad;
}

/** ⑥ 宿主基线当版同源：measured_at + rebuilds 留读数 + 行数与真文件一致。 */
function judgeBaselineVersion(root) {
    const bad = [];
    const cur = idxVersion(root);
    const b = RJ(root, 'tests/audit/host_beast_baseline.json');
    if (b.measured_at !== 'v' + cur) bad.push('基线 measured_at ' + b.measured_at + ' !! v' + cur + '(陈旧登记)');
    if (!b.rebuilds || !b.rebuilds['v' + cur]) bad.push('rebuilds 面缺当版 v' + cur + ' 读数');
    else if (b.rebuilds['v' + cur].readings.total_lines !== b.readings.total_lines) {
        bad.push('rebuilds 与 readings 不同读数');
    }
    const realLines = RD(root, 'index.js').split('\n').length;
    if (b.readings.total_lines !== realLines) {
        bad.push('基线行数 ' + b.readings.total_lines + ' !! 真 index.js ' + realLines + ' 行');
    }
    return bad;
}

/** ⑦ 台账覆盖磁盘（双向齐全）。diskNames 由调用方给,便于在独立树上复用。 */
function judgeTsvCovers(root, diskNames) {
    const bad = [];
    const rows = RD(root, 'tests/audit/catalog_reference_consumers.tsv').split('\n')
        .map((l) => l.split('\t')[0].trim()).filter((l) => l && !l.startsWith('#'));
    const rset = new Set(rows);
    const dset = new Set(diskNames);
    for (const f of diskNames) if (!rset.has(f)) bad.push('磁盘新增未登记:' + f);
    for (const f of rows) if (!dset.has(f)) bad.push('登记了不存在的档:' + f);
    return bad;
}

/** ⑧ 发布面：CHANGELOG 顶节为本版,且带可磁盘重算的档自述读数。 */
function judgeReleaseFace(root) {
    const bad = [];
    const cur = idxVersion(root);
    const cl = RD(root, 'CHANGELOG.md');
    if (!cl.startsWith('## v' + cur)) bad.push('CHANGELOG 顶节不是 v' + cur + '(发布面没抬版)');
    const head = cl.split(/\n## v[0-9.]+/)[0];
    if (!/`tests\/[A-Za-z0-9_.-]+\.test\.mjs`[^\n]{0,40}?\d+ 条/.test(head)) {
        bad.push('CHANGELOG 当版节读不到「tests/x.test.mjs（N 条）」档自述(D9 形态)');
    }
    return bad;
}

const DISK = fs.readdirSync(path.join(R, 'tests')).filter((f) => f.endsWith('.test.mjs')).sort();

/* ══════════════ A 结构面 + 收口面（真仓库） ══════════════ */
test('v3480 A1. ★★ 本档是当版档案:头部同现本档名与当版号 + 自锚常量 BORN_V', () => {
    const head = SELF.split('\n').slice(0, 12);
    const line = head.find((l) => l.includes('v3480_closeout_fourth_phase') && l.includes('v' + BORN_V));
    assert.ok(line, '本档头部须同一行同时写清「本档名 + 当版号」(frontier 的结构性标志)');
    assert.ok(vnum(idxVersion(R)) >= vnum(BORN_V), 'BORN_V 是本档出生锚,当版只能 ≥ 它(下界口径:交棒给下一版后本档不再是 frontier,不得再锁当版 —— 同 v3470 G1 形态)');
    console.log('  ok frontier 头在场,自锚 ' + BORN_V);
});

test('v3480 A2. ★★★ 四源同源:index / manifest / package + 三份内核副本', () => {
    const bad = judgeFourSource(R);
    assert.deepEqual(bad, [], '四源不同源:' + bad.join(' | '));
});

test('v3480 B1. ★★★★★ 收口读数已登记且与当版同源（doc_readings 四元组均为真读数）', () => {
    const bad = judgeReadingsRegistered(R);
    assert.deepEqual(bad, [], '登记面不合格:' + bad.join(' | '));
    const reg = RJ(R, 'tests/audit/doc_readings.json');
    console.log('  ok 登记 v' + reg.version + '：' + reg.tests_total + ' 文件 / ' + reg.assertions
        + ' 断言 / 审计 ' + reg.audit_passed + '/' + reg.audit_total);
});

test('v3480 B2. ★★★★★ 人读面快照与登记逐位一致（PLAN 面）', () => {
    const bad = judgeDocSnapshot(R);
    assert.deepEqual(bad, [], '快照与登记脱节:' + bad.join(' | '));
});

test('v3480 B3. ★★★★ 待验标记与登记状态反向一致（对齐则不得再标待验）', () => {
    const bad = judgePendingMarker(R);
    assert.deepEqual(bad, [], '待验标记不自洽:' + bad.join(' | '));
});

test('v3480 B4. ★★★★ 行上界当版有账:末条 history 带当版号 + ceiling/note 同源', () => {
    const bad = judgeLineBudget(R);
    assert.deepEqual(bad, [], '行上界账不合格:' + bad.join(' | '));
});

test('v3480 B5. ★★★★ 宿主基线当版同源:measured_at + rebuilds + 行数逐项一致', () => {
    const bad = judgeBaselineVersion(R);
    assert.deepEqual(bad, [], '基线当版读数不一致:' + bad.join(' | '));
});

test('v3480 B6. ★★★★ 死代码预算 ceiling 与末条 history 同源（防静默改数）', () => {
    const dcb = RJ(R, 'tests/audit/dead_code_budget.json');
    const hist = Array.isArray(dcb.history) ? dcb.history : [];
    assert.ok(hist.length >= 1, '死代码上限必须有抬升留痕');
    const last = hist[hist.length - 1];
    assert.equal(dcb.ceiling, last.ceiling, '当前 ceiling 必须等于末条 history 的 ceiling');
    assert.equal(dcb.note, last.reason, '当前 note 必须是末条 history 理由的复述');
});

test('v3480 C1. ★★★★★ 台账覆盖磁盘（catalog_reference_consumers.tsv 双向齐全）', () => {
    const bad = judgeTsvCovers(R, DISK);
    assert.deepEqual(bad, [], '台账与磁盘不同源:' + bad.join(' | '));
    console.log('  ok 台账 ' + DISK.length + ' 档双向齐全');
});

test('v3480 C2. ★★★★ 发布面:CHANGELOG 顶节为本版 + 当版节带档自述读数', () => {
    const bad = judgeReleaseFace(R);
    assert.deepEqual(bad, [], '发布面不合格:' + bad.join(' | '));
});


/* ══════════════ D 负控制:真源码破坏 → 独立树 → 同款真判据 ══════════════
/* ══════════════ D 负控制:真源码破坏 → 独立树 → 同款真判据 ══════════════
 * 破坏点全部是**真源**(不是模拟常量,也不是对原文件断言):
 *   在独立树里改掉真文件的一行 ⇒ 判据必须现形;原版同判据必须通过。
 * 【锚点一律现场派生】不得把当版号写死在破坏锚点里 —— 那样下一版抬版本档自己就腐坏了。
 *   派生后仍要求「在目标文件里恰中 1 次」,这件事由 breakOnce 自证(C 段已收编)。 */
const FILES = ['index.js', 'manifest.json', 'package.json', 'README.md', 'PLAN.md',
    'CHANGELOG.md', 'TODO.md', 'memory-config.js', 'memory-core.js', 'memory-organs.js'];
const AUDIT_JSON = ['doc_readings.json', 'host_beast_baseline.json', 'dead_code_budget.json',
    'catalog_reference_consumers.tsv'];
function mkTree() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3480-close-'));
    for (const f of FILES) fs.copyFileSync(path.join(R, f), path.join(dir, f));
    fs.mkdirSync(path.join(dir, 'tests', 'audit'), { recursive: true });
    for (const f of AUDIT_JSON) {
        fs.copyFileSync(path.join(R, 'tests', 'audit', f), path.join(dir, 'tests', 'audit', f));
    }
    return dir;
}
function withTree(mutate) {
    const dir = mkTree();
    try { mutate(dir); return dir; } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
}
/** 在树里对**真源文件**做一次定点破坏;锚点由 breakOnce 保证恰中 1 次。 */
function wreck(tree, rel, anchor, repl) {
    const p = path.join(tree, rel);
    fs.writeFileSync(p, breakOnce(fs.readFileSync(p, 'utf8'), anchor, repl, rel));
}

/* 破坏锚点：一律从**真源内容**现场派生(版本无关,抬版不腐)。 */
const REG_REL = 'tests/audit/doc_readings.json';
const BASE_REL = 'tests/audit/host_beast_baseline.json';
const regVersion = () => RJ(R, REG_REL).version;
const A_IDX = () => "const VERSION = '" + idxVersion(R) + "';";
const A_REG = () => '"version": "' + regVersion() + '"';
const A_BASE = () => '"measured_at": "' + RJ(R, BASE_REL).measured_at + '"';
const A_PLAN = () => '最近全量快照 **v' + regVersion() + '：';
const A_TSV = () => DISK[DISK.length - 1];

test('v3480 D1. ★★★★ 破坏 index.js 的 VERSION ⇒ 四源判据必须翻红（原版必绿）', () => {
    assert.deepEqual(judgeFourSource(R), [], '原版阳性对照:四源判据必须通过');
    const dir = withTree((d) => wreck(d, 'index.js', A_IDX(), "const VERSION = '9.999.0';"));
    try {
        const bad = judgeFourSource(dir);
        assert.ok(bad.length >= 4, '三源 + 三副本应同时报不同源,实得 ' + bad.length + ' 项:' + bad.join(' | '));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('v3480 D2. ★★★★ 破坏 doc_readings 的 version ⇒ 登记判据必须翻红（原版必绿）', () => {
    assert.deepEqual(judgeReadingsRegistered(R), [], '原版阳性对照:登记判据必须通过');
    const dir = withTree((d) => wreck(d, REG_REL, A_REG(), '"version": "9.999.0"'));
    try {
        const bad = judgeReadingsRegistered(dir);
        assert.ok(bad.some((x) => x.includes('doc_readings.version')), '版本错位必须现形:' + bad.join(' | '));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('v3480 D3. ★★★★ 破坏基线的 measured_at ⇒ 当版同源判据必须翻红（原版必绿）', () => {
    assert.deepEqual(judgeBaselineVersion(R), [], '原版阳性对照:基线判据必须通过');
    const dir = withTree((d) => wreck(d, BASE_REL, A_BASE(), '"measured_at": "v9.999.0"'));
    try {
        const bad = judgeBaselineVersion(dir);
        assert.ok(bad.some((x) => x.includes('measured_at')), '陈旧登记必须现形:' + bad.join(' | '));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('v3480 D4. ★★★★ 破坏 PLAN 快照行 ⇒ 文档判据必须翻红（原版必绿；README 面已于 v3.424.0 卸载）', () => {
    assert.deepEqual(judgeDocSnapshot(R), [], '原版阳性对照:文档快照判据必须通过');
    const d2 = withTree((d) => wreck(d, 'PLAN.md', A_PLAN(), '最近全量快照 **v9.999.0：'));
    try {
        assert.ok(judgeDocSnapshot(d2).some((x) => x.includes('PLAN')), 'PLAN 快照错位必须现形');
    } finally { fs.rmSync(d2, { recursive: true, force: true }); }
});

test('v3480 D5. ★★★★ 台账缺一行 ⇒ 覆盖判据必须翻红（原版必绿）', () => {
    assert.deepEqual(judgeTsvCovers(R, DISK), [], '原版阳性对照:台账判据必须通过');
    const dir = withTree((d) => wreck(d, 'tests/audit/catalog_reference_consumers.tsv', A_TSV(), ''));
    try {
        const bad = judgeTsvCovers(dir, DISK);
        assert.ok(bad.some((x) => x.includes('未登记')), '磁盘新增未登记必须现形:' + bad.join(' | '));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('v3480 E1. ★★★ H6 工具两向自证:锚点不存在 / 不唯一 / 同值替换必须抛', () => {
    assert.throws(() => breakOnce('abc', 'THIS_ANCHOR_ABSENT_V3480', 'x'), /锚点命中|拒绝破坏/,
        '锚点不存在必须抛(否则「破坏」是假的)');
    assert.throws(() => breakOnce('aaa', 'a', 'b'), /锚点命中|拒绝破坏/, '多命中必须抛');
    assert.throws(() => breakOnce('abc', 'abc', 'abc'), /拒绝破坏/, '同值替换必须抛(改了源码但行为未变)');
});

test('v3480 F1. ★★★ H5 判据纯度:派生锚点在**目标真源**里各恰中 1 次 + 当版号在本档恰 2 处(frontier+BORN_V)', () => {
    const targets = [
        ['A_IDX', A_IDX(), 'index.js'],
        ['A_REG', A_REG(), REG_REL],
        ['A_BASE', A_BASE(), BASE_REL],
        ['A_PLAN', A_PLAN(), 'PLAN.md'],
        ['A_TSV', A_TSV(), 'tests/audit/catalog_reference_consumers.tsv'],
    ];
    for (const [k, a, rel] of targets) {
        if (!a) continue;
        const n = RD(R, rel).split(a).length - 1;
        assert.equal(n, 1, '派生锚 ' + k + ' 在 ' + rel + ' 命中 ' + n + ' 次(应恰 1 —— 多处命中会让破坏位置不可复现)');
    }
    /* 当版号在本档只准有**两处**:frontier 头行 1 处(V5 要求) + BORN_V 定义 1 处(V4 锚点栽体)。
     *   写死第三处就会在抬版时分叉(本档首版在说明段里写死过一次,当场被本条抳出)。 */
    const selfHits = SELF.split(BORN_V).length - 1;
    assert.equal(selfHits, 2, '当版号 ' + BORN_V + ' 在本档出现 ' + selfHits + ' 次(应恰 2:frontier 行 + BORN_V;其余锚点一律现场派生)');
});

test('v3480 G1. ★★ 版本面:六源同源 + 本档出生锚 BORN_V（下界,不锁当版）', () => {
    const cur = idxVersion(R);
    assert.ok(vnum(cur) >= vnum(BORN_V), '宿主版本不得低于本档出生版本(实 ' + cur + ')');
    assert.equal(RJ(R, 'manifest.json').version, cur, 'manifest.json 未与宿主同源');
    assert.equal(RJ(R, 'package.json').version, cur, 'package.json 未与宿主同源');
    assert.ok(vnum(BORN_V) > vnum('3.347.0'), '版本序须前进');
    assert.ok(vnum(cur) >= vnum(BORN_V), 'BORN_V 是出生锚、当版只能 ≥ 它(下界口径:本档交棒后不得再锁当版)');
});
