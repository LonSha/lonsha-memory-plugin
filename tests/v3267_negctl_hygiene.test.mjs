/* ============================================================
 * tests/v3267_negctl_hygiene.test.mjs — [v3.267.0 · A2 判据面卫生]
 *   负控制卫生门禁（tests/audit/scan_negctl_hygiene.mjs）的常驻套件。
 *
 *   【为什么本档存在】
 *     本仓最贵的形态是「绿着，但绿的成因不是判据在守」。三形态假绿是它的三个入口：
 *       ① 对原文件断言（破坏没发生也绿）
 *       ② 破坏写死成模拟常量（真判据没被调用）
 *       ③ 破坏把判据自己删了（自我指涉）
 *     本档给 scan_negctl_hygiene 装上观测点：判据纯函数对**真源码破坏后的副本**必须翻红。
 *     没有这一档，那个门禁无论返回什么，全仓没有一处会因它失效而变红
 *     （scan_fixture_sync 的 E4 逐条要求这一件）。
 *
 *   【判据与负控制跑同一份代码】
 *     auditNegctlSource(code) 是 tests/_negctl_hygiene.mjs 的纯函数；A 段对磁盘真源码跑它，
 *     D 段对**真源码破坏后的副本**跑同一个它。破坏一律走唯一真源 tests/_break_kit.mjs
 *     的 breakSource（锚点须恰中 1 次）。
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { breakSource } from './_break_kit.mjs';
import { stripComments } from './_audit_lib.mjs';
import { auditNegctlSource, NEGCTL_SIGNALS, NEGCTL_ADVISORY, FAKE_GREEN_FORMS } from './_negctl_hygiene.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const NL = String.fromCharCode(10);
const Q = String.fromCharCode(39);
const SELF_REL = 'tests/v3267_negctl_hygiene.test.mjs';
const GATE_REL = 'tests/audit/scan_negctl_hygiene.mjs';
const LIB_REL = 'tests/_negctl_hygiene.mjs';
const GATE = read(GATE_REL);
const LIB = read(LIB_REL);
const SELF = read(SELF_REL);
const AUDIT_DIR = path.join(ROOT, 'tests', 'audit');
const NEG_FILES = fs.readdirSync(AUDIT_DIR).filter((f) => f.endsWith('_negctl.mjs')).sort();
/** 面下限：实测 17 份（2026-10-04）。取 12 —— 留自然增减余量。 */
const MIN_NEG = 12;

/* ══════════ A 判据真源面 ══════════ */
test('v3267 A1. ★★ 硬信号集与三形态假绿的名字必须在场，且计数锁住', () => {
    assert.equal(NEGCTL_SIGNALS.length, 9, '硬信号实测 9 条（K1–K9）；少一条即判据被裁短');
    assert.ok(Object.keys(FAKE_GREEN_FORMS).length === 3, '三形态假绿必须三种都在场');
    for (const g of NEGCTL_SIGNALS) {
        assert.ok(g.id && g.re instanceof RegExp && g.why, '信号须带 id / 正则 / 理由：' + JSON.stringify(g.id));
    }
    assert.ok(NEGCTL_ADVISORY.length >= 1, '不饱和信号读数面不得为空调（删掉就没人知道还差什么）');
});

test('v3267 A2. ★★★ 每条硬信号必须真能命中：合法样例命中、掏空样例不命中（两向自证）', () => {
    /* 两向自证：只验「合法样例命中」会把一条恒真正则判成绿（`/./` 也是正则）。 */
    const LEGAL = [
        'writeFileSync(p, s);', 'spawnSync(x, y);', 'fs.mkdtempSync(t);',
        'const n = t.split(a).length - 1;', 'if (!out.includes(attr)) fail();',
        'LONSHA_AUDIT_ROOT=dir', 'fs.rmSync(dir, {force:true});', 'process.exit(0);',
        '// N0 原版对照',
    ].join(NL);
    const legal = auditNegctlSource(LEGAL);
    assert.equal(legal.ok, true, '合法样例必须全绿（否则判据过窄）：' + legal.missing.join(' ｜ '));
    const GUT = 'const x = 1;' + NL + 'export default x;';
    const gut = auditNegctlSource(GUT);
    assert.equal(gut.ok, false, '掏空样例必须报缺（否则判据恒绿）');
    assert.equal(gut.missing.length, NEGCTL_SIGNALS.length, '掏空样例应缺全部硬信号：实 ' + gut.missing.length);
});

test('v3267 A3. ★★ 判据只读：真源不得读环境 / 写盘（纯数据 + 纯函数）', () => {
    const code = stripComments(LIB);
    assert.equal(/\bprocess\.env\b/.test(code), false, '判据真源不得读环境（否则同一份源码在不同环境结论不同）');
    /* 【留痕·本档首跑踩到的假红】首版写成 `/writeFileSync|rmSync|mkdirSync/`，
     *   而真源里 K1/K3/K7 的**正则字面量本身就含这些词**（`re: /writeFileSync\s*\(/`）
     *   ⇒ 判据命中自己的信号表，当场假红。修法：改判**调用形态**（`fs.<fn>(`），
     *   信号表里的 `writeFileSync\s*\(` 没有 `fs.` 前缀，两向可分辨。 */
    assert.equal(/\bfs\.(writeFileSync|rmSync|mkdirSync|cpSync)\s*\(/.test(code), false,
        '判据真源不得写盘（判「fs.<fn>(」调用形态，不判裸词 —— 裸词会被信号表自己的正则命中）');
    /* ★ 判据名同样必须**运行时拼接**：本档 A3 自己写着 `/export function <name>/`，
     *   那个正则字面量会让 C3 的 `SELF.includes('function <name>')` 命中本档 ⇒ 自指假红
     *   （本档首跑实测踩到，见 C3 留痕）。 */
    const FN = 'auditNegctl' + 'Source';
    assert.ok(new RegExp('export function ' + FN).test(code), '唯一真源必须导出判据函数');
});

/* ══════════ B 行为面：对磁盘真源码跑判据 ══════════ */
test('v3267 B1. ★★★ 扫描面非空且覆盖下限：13 份以上负控制逐份可读', () => {
    assert.ok(NEG_FILES.length >= MIN_NEG, '负控制清单退化：实测 ' + NEG_FILES.length + ' 份，下限 ' + MIN_NEG);
});

test('v3267 B2. ★★★ 逐份过硬信号集（剥注释后）：17 份负控制全部具备「真破坏 → 独立树 → 按归因翻红」的形状', () => {
    const bad = [];
    for (const f of NEG_FILES) {
        const r = auditNegctlSource(stripComments(read(path.join('tests', 'audit', f))));
        if (!r.ok) bad.push(f + '：' + r.missing.join(' ｜ '));
    }
    assert.equal(bad.length, 0, '缺硬信号的负控制（三形态假绿入口）：' + NL + bad.join(NL));
});

test('v3267 B3. ★★ 剥注释是必须的：不剥时头注会让信号集虚假饱和（同一条判据两向不同结论）', () => {
    /* 本仓负控制的头注里逐字写着 mkdtempSync / writeFileSync / 归因 / 原版对照 ——
     * 不剥注释，掏空样例只要留着头注就会被判「卫生」。这条钉住「必须先剥」。
     * 样例必须**覆盖全部 9 条硬信号**，否则报缺的是「样例不全」而不是「头注假绿」（本档首跑踩到）。 */
    const withHeader = [
        '// 做法：mkdtempSync(dir) 造树，writeFileSync(p, s) 落盘，锚点恰中 1 次，',
        '// spawnSync(node, a) 真跑，按归因断言（out.includes(attr) 点名），N0 原版对照，',
        '// LONSHA_AUDIT_ROOT 指向副本，收尾 rmSync(dir)，出口 process.exit(0)。',
        '// 定点检查：t.split(a).length - 1。',
        'const x = 1;',
    ].join(NL);
    assert.equal(auditNegctlSource(stripComments(withHeader)).ok, false,
        '剥注释后必须报缺（只靠头注不算具备形状）');
    assert.equal(auditNegctlSource(withHeader).ok, true,
        '不剥时确实会假绿 —— 这正是「必须先剥」的理由（判据两向可分辨）');
});

/* ══════════ C 门禁接线面 ══════════ */
test('v3267 C1. ★★★ 门禁必须真跑同一份判据真源（不是各写一份）', () => {
    assert.ok(GATE.includes('_negctl_hygiene.mjs'), '门禁必须 import 判据真源');
    assert.ok(GATE.includes('auditNegctlSource('), '门禁必须真调用判据函数');
    assert.ok(GATE.includes('stripComments('), '门禁必须先剥注释再判');
    const libImpl = 'function ' + 'auditNegctlSource';
    assert.equal(GATE.includes(libImpl), false, '门禁不得本地重写判据实现（同一口径只许一处）');
});

test('v3267 C2. ★★ 三态出口齐备 + 独立根 + 面下限（fail-closed）', () => {
    for (const lit of ['process.exit(0)', 'process.exit(1)', 'process.exit(2)']) {
        assert.ok(GATE.includes(lit), '缺出口 ' + lit);
    }
    assert.ok(GATE.includes('LONSHA_AUDIT_ROOT'), '门禁必须可指定审计根（负控制要在独立树上跑）');
    assert.ok(GATE.includes('MIN_' + 'NEGCTL'), '面下限常量必须在场（面塌了须 exit 2，不得当「没问题」）');
});

test('v3267 C3. ★★ 本档只调用判据，不重写判据（判据面自防护）', () => {
    /* 【留痕·本档首跑踩到的自指假红】首版写成 `SELF.includes('function ' + 'auditNegctlSource')`，
     *   而本档 A3 里的核对写成 `new RegExp('export function ' + FN)` —— 那个**字面量片段**
     *   让 SELF 里真出现了 `'export function '` 与函数名相邻的形态（拼接表达式本身），
     *   于是「检查自己是否重写实现」的判据被自己命中。
     *   修法：判据名一律运行时拼接，且断言只针对**实现形态**（`function <name>(` + 形参表），
     *   而不是名字本身出现过。 */
    /* 【留痕·本档首跑踩到的自指假红（第三次）】自防护判据**不能对被破坏的锚点字面量做文本判定**：
     *   本档 D 段（负控制）**必须**写出函数名/信号集条目的真字面量锚点（要断 breakSource 的恰中 1 次），
     *   于是任何「名字出现过即判重写」的判据都会命中 D 段 —— 那不是自指缺陷，是**判据面选错**。
     *   正解：自防护只扫**判据段**（A/B/C 面），D 段的真锚点是纪律要求，不进这一面。 */
    const judgeSection = SELF.split('/* ══════════ D ')[0];
    const FN = 'auditNegctl' + 'Source';
    const implRe = new RegExp('function ' + FN + '\\s*\\([^)]*\\)\\s*\\{');
    assert.equal(implRe.test(judgeSection), false, '判据段不得重写实现（不得声明 `function <name>(...) {` 实现体）');
    assert.ok(SELF.includes(FN + '('), '本档必须真调用判据');
    assert.equal(judgeSection.includes('{ id: ' + Q), false, '判据段不得另声明一份信号集（同一口径只许一处）');
    assert.ok(SELF.includes('NEGCTL_' + 'SIGNALS'), '本档必须引用真源信号集而不是抄一份');
});

/* ══════════ D 负控制（真源码破坏 → 独立树 → 同款判据必须转红） ══════════ */
const MIRROR = new Map();
for (const rel of [GATE_REL, LIB_REL, 'tests/_audit_lib.mjs', 'tests/_break_kit.mjs']) MIRROR.set(rel, read(rel));

/** 造独立树：镜像整仓（门禁要读 tests/ 与根模块，逐文件手抄正是本档要治的病）。 */
function withMirror(mut, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3267-negctl-'));
    try {
        fs.cpSync(ROOT, path.join(dir), { recursive: true, filter: (s) => !s.split(path.sep).includes('.git') });
        for (const [rel, body] of Object.entries(mut)) fs.writeFileSync(path.join(dir, rel), body);
        return fn(dir);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}
function runGateAt(dir) {
    const r = spawnSync(process.execPath, [path.join('tests', 'audit', 'scan_negctl_hygiene.mjs')], {
        cwd: dir, encoding: 'utf8', timeout: 180000,
        env: Object.assign({}, process.env, { LONSHA_AUDIT_ROOT: dir }),
    });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

test('v3267 N0. ★★★ 阳性对照：未破坏时门禁必须 exit 0（否则后续翻红不可归因）', () => {
    const r = runGateAt(ROOT);
    assert.equal(r.status, 0, '原版门禁必须绿：' + r.out.slice(-400));
    assert.ok(r.out.includes('通过：'), '原版必须打印通过行（破坏若无效将无处可怪）');
});

test('v3267 N1. ★★★ 破坏①：某份负控制被掏空（只剩语法合法的骨架）⇒ 门禁必须按归因翻红', () => {
    const target = NEG_FILES[0];
    const rel = path.join('tests', 'audit', target);
    const gutted = '// gutted by v3267 N1' + NL + 'export default 1;' + NL;
    withMirror({ [rel]: gutted }, (dir) => {
        const r = runGateAt(dir);
        assert.equal(r.status, 1, '掏空一份负控制后必须 exit 1（真缺陷），实得 ' + r.status + '：' + r.out.slice(-400));
        assert.ok(r.out.includes(target), '必须点名被掏空的那份负控制：' + target);
    });
});

test('v3267 N2. ★★★ 破坏②：判据信号集被裁到只剩一条（破坏写死成常量的等价形态）⇒ 必须翻红', () => {
    const anchor = '    { id: ' + Q + 'K9' + Q + ', re: /(原版|N0|expectExit|expectStatus|status\\s*===\\s*0|code\\s*===\\s*0)/';
    const found = LIB.split(anchor).length - 1;
    assert.equal(found, 1, '锚点须恰中 1 次（实 ' + found + '），否则本组作废');
    const broken = breakSource(LIB, anchor, '    { id: ' + Q + 'K9' + Q + ', re: /x/,', 'v3267 N2');
    withMirror({ [LIB_REL]: broken }, (dir) => {
        const r = runGateAt(dir);
        assert.equal(r.status, 1, '阳性对照判据被放宽后 17 份负控制里该缺 K9 的那批必须报红，实得 ' + r.status + '：' + r.out.slice(-400));
        assert.ok(r.out.includes('K9'), '翻红必须按归因点名 K9：' + r.out.slice(-400));
    });
});

test('v3267 N3. ★★★ 破坏③：扫描面塌成 0 份（面下限失效）⇒ 必须 exit 2 而不是「没问题」', () => {
    /* 结构漂移必须与「卫生」分形：把清单过滤改成永不命中 ⇒ 若门禁仍 exit 0，
     * 那它就是在用「找不到东西」冒充「东西没问题」。 */
    const anchor = LIB + NL + GATE;   // 占位防裁
    const gateAnchor = '.' + 'endsWith(' + Q + '_negctl.mjs' + Q + ')';
    const hit = GATE.split(gateAnchor).length - 1;
    assert.equal(hit, 1, '锚点须恰中 1 次（实 ' + hit + '）');
    const broken = breakSource(GATE, gateAnchor, '.' + 'endsWith(' + Q + '__never__' + Q + ')', 'v3267 N3');
    withMirror({ [GATE_REL]: broken }, (dir) => {
        const r = runGateAt(dir);
        assert.equal(r.status, 2, '清单塌成 0 份必须 exit 2（结构漂移），实得 ' + r.status + '：' + r.out.slice(-400));
        assert.ok(/退化|结构漂移/.test(r.out), '必须点名「退化 / 结构漂移」：' + r.out.slice(-400));
    });
    void anchor;
});

test('v3267 N4. ★★ 工具两向自证：锚点不存在 / 不唯一 / 同值都必须被拒，唯一锚点必须被接受', () => {
    assert.throws(() => breakSource(LIB, '这个锚点绝不存在__' + 'v3267', 'x', 'nope'), /拒绝破坏/,
        '锚点不存在必须拒绝（否则「破坏没发生」会被当成「破坏无效」）');
    const dup = 'const a = 1;' + NL + 'const a = 1;';
    assert.throws(() => breakSource(dup, 'const a = 1;', 'x', 'dup'), /拒绝破坏/, '不唯一锚点必须被拒');
    assert.throws(() => breakSource(LIB, 'export function auditNegctlSource(', 'export function auditNegctlSource(', 'same'),
        /拒绝破坏/, '同值替换必须被拒（「破坏副本」等于原件 = 假绿第一形）');
    /* 反面：唯一锚点 + 真改变 ⇒ 必须被接受。没有这一条，上面三条 throws 可能只是「什么都拒」。 */
    assert.doesNotThrow(() => breakSource(LIB, 'function auditNegctlSource(code)',
        'function auditNegctlSource(code) /* x */', 'unique'));
});

/* ══════════ E 版本锚 ══════════ */
const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));

test('v3267 E1. ★ 版本锚（当版 frontier）：三源同源且 ≥ 3.267.0', () => {
    const pkg = JSON.parse(read('package.json'));
    const codeVer = (/const VERSION = '([^']+)'/.exec(read('index.js')) || [])[1];
    const mf = JSON.parse(read('manifest.json'));
    assert.ok(codeVer, '入口版本常量在场');
    assert.ok(vnum(codeVer) >= vnum('3.267.0'), '本档只在 3.267.0 及以后成立；当前 ' + codeVer);
    assert.equal(pkg.version, codeVer);
    assert.equal(mf.version, codeVer);
    assert.ok((mf.extra_js || []).includes('memory-config.js'), '第七刀模块必须在 extra_js 清单里');
});