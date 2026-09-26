/* ============================================================
 * tests/v3243_numornull_semantics.test.mjs — v3.243.0
 *
 * 主题：**别名与口径同族** —— `numOrNull` 归位「原样数」族。
 *
 *   病根（v3.240.0 引进，本版收口）：契约里 `finiteFloor` 与 `numOrNull` 被当成
 *   「同判据的两个名字」，于是 `numOrNull` 成了**取整版**；而全仓另外七处同名函数
 *   （`snapshot-checkpoint.js` / `index.js:_numOrNull` / `scene-book.js` /
 *   `evidence-workbench.js:finiteNumStrict` / `ledger-replay.js` / `archive-shift.js` /
 *   `age-anchor.js`）**都不取整**。实测分歧 5/18 个样本：
 *     `numOrNull(0.5)` 契约侧 `0`、`snapshot-checkpoint` 侧 `0.5` —— 换个模块就换了答案。
 *   而契约那句注释里，前半句说「同 `finite`」、后半句说「与 `snapshot-checkpoint` 对齐」，
 *   这两件事本身就矛盾 ⇒ **注释为假，且没有任何判据能发现**（两边各自都「自洽」）。
 *
 *   本版：新增 `finiteNum`（原样数原语，与七处既有判据逐输入等价）→ `numOrNull` 转发它；
 *   `finiteFloor` 仍转发 `finite`（楼层语义，取整）；两张声明表并列；门禁补 R6b 与 R8。
 *
 *   判据一律落**真模块真跑** + 真源码破坏负控制：
 *     A 结构面：第二张表成表 / 与判据侧输入表对齐 / `numOrNull` 是转发而非第二份实现
 *     B 行为面：表驱动对拍 / **同名异义已消**（契约 vs snapshot-checkpoint 逐输入同判）/
 *              `finiteNum` 与 `finite` 的分野（对小数不同、对整数与「没给」相同）
 *     C 文档面：报告里那句假注释不得回潮（检测器两向自证）
 *     D 门禁 R6b/R8 真跑 + 三组真源码破坏负控制 + 保绿对照 + 工具两向自证
 *     E 判据面自防护与版本锚
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELF = readFileSync(fileURLToPath(import.meta.url), 'utf-8');
const LE_SRC = readFileSync(path.join(ROOT, 'ledger-entity.js'), 'utf-8');
const GATE_REL = 'tests/audit/scan_ledger_contract.mjs';
const GATE = readFileSync(path.join(ROOT, GATE_REL), 'utf-8');
const CONTRACT_REL = 'ledger-entity.js';
const require_ = createRequire(import.meta.url);
const LE = require_(path.join(ROOT, CONTRACT_REL));
const SC = require_(path.join(ROOT, 'snapshot-checkpoint.js'));
const CUR = /const VERSION = '([0-9.]+)'/.exec(readFileSync(path.join(ROOT, 'index.js'), 'utf-8'))[1];

function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}
const ok = (msg) => console.log('  ✓ ' + msg);

/* 声明表里的样本「标签 → 真输入」。与 v3242 的 INPUTS 同构：
 *   标签住在契约里（跨进程可读的声明），真输入住在判据里（可调用对象）。 */
const INPUTS2 = {
    'null': null, 'undefined': undefined,
    '布尔 true': true, '布尔 false': false,
    '空串': '', '空白串': '   ', '零宽串': '\u200b',
    '数组 []': [], '数组 [1]': [1], '对象 {}': {},
    '函数': () => 0, 'NaN': NaN, 'Infinity': Infinity, '-Infinity': -Infinity,
    '非数字串': 'abc',
    '数 0': 0, '数 -0': -0, '数字串 0': '0',
    '数 0.5': 0.5, '数 -0.5': -0.5, '数 3.9': 3.9,
    '数字串 0.5': '0.5',
    '数 3': 3, '数 -3': -3, '数字串 3': '3',
};
const shapeOf = (x) => (x === null ? 'null' : 'num');

/* ══════════ A. 结构面 ══════════ */
test('v3243 A1. 契约带第二张表：outputs 两种形态 + cases 与 outputs 自洽', () => {
    const ND = LE.NUM_OR_NULL_DOMAINS;
    assert.ok(ND && typeof ND === 'object', '契约须导出 NUM_OR_NULL_DOMAINS');
    assert.deepStrictEqual([...ND.outputs], ['null', 'num'],
        '原样数族的输出域须恰为两种（多一种就不是「原样」了）：' + JSON.stringify(ND.outputs));
    assert.ok(Array.isArray(ND.cases) && ND.cases.length >= 20,
        'cases 样本数 ' + (ND.cases && ND.cases.length) + ' 少于 20：表被抽薄');
    for (const row of ND.cases) {
        assert.ok(Array.isArray(row) && row.length === 2, '每条样本须是 [标签, 期望]：' + JSON.stringify(row));
        assert.ok(ND.outputs.includes(row[1]), '样本「' + row[0] + '」的期望 `' + row[1] + '` 不在 outputs 里');
    }
    assert.ok(ND.cases.some((r) => r[1] === 'num'), '表里须有 num 样本（否则与「楼层」族无法区分）');
    assert.ok(ND.cases.some((r) => r[1] === 'null'), '表里须有 null 样本');
    ok('第二张表 ' + ND.cases.length + ' 条 × ' + ND.outputs.length + ' 形态');
});

test('v3243 A2. 第二张表与判据侧的输入表逐标签对齐（缺一条即不成表）', () => {
    const labels = LE.NUM_OR_NULL_DOMAINS.cases.map((r) => r[0]);
    const mine = Object.keys(INPUTS2);
    assert.strictEqual(labels.length, mine.length,
        '契约声明 ' + labels.length + ' 条、判据可调用输入 ' + mine.length + ' 条 —— 两侧不等即表不成表');
    for (const l of labels) assert.ok(l in INPUTS2, '判据侧缺样本输入：' + l);
    for (const m of mine) assert.ok(labels.includes(m), '判据侧多出契约未声明的样本：' + m);
    ok('两侧 ' + labels.length + ' 条逐标签对齐');
});

test('v3243 A3. `numOrNull` 是**转发**（不是第二份实现），且两张表都在同文件', () => {
    const i = LE_SRC.indexOf('  function numOrNull(value) {');
    assert.ok(i > 0, '契约里须有 `function numOrNull(value) {`');
    /* 取函数体要按**花括号配对**，不能找第一个 '}'：注释里出现 '}' 就截错（本组首跑即此）。 */
    let depth = 0, end = i;
    for (let k = LE_SRC.indexOf('{', i); k < LE_SRC.length; k++) {
        if (LE_SRC[k] === '{') depth++;
        else if (LE_SRC[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
    }
    const body = LE_SRC.slice(i, end + 1);
    assert.match(body, /return finiteNum\(value\);/, '`numOrNull` 必须转发 `finiteNum`（原样数族）');
    assert.ok(!/Math\.floor\(/.test(body), '`numOrNull` 体内不得再出现取整');
    assert.ok(LE_SRC.includes('const NUM_OR_NULL_DOMAINS = Object.freeze({'), '第二张表须就地声明在同文件');
    assert.ok(LE_SRC.includes('const FINITE_DOMAINS = Object.freeze({'), '第一张表仍须在场（不是「用第二张换掉第一张」）');
    ok('转发形态 + 两张表同文件');
});

/* ══════════ B. 行为面 ══════════ */
test('v3243 B1. 真函数 × 真表逐条对拍：25 条样本全部命中声明', () => {
    let n = 0;
    for (const [label, expect] of LE.NUM_OR_NULL_DOMAINS.cases) {
        const got = LE.finiteNum(INPUTS2[label]);
        assert.strictEqual(shapeOf(got), expect,
            '样本「' + label + '」期望 ' + expect + '，实得 ' + shapeOf(got) + '（值 ' + JSON.stringify(got) + '）');
        n++;
    }
    assert.strictEqual(n, LE.NUM_OR_NULL_DOMAINS.cases.length, '对拍条数须等于声明条数（不许跳样本）');
    ok('表驱动对拍 ' + n + '/' + n);
});

test('v3243 B2. ★ 同名异义已消：契约 `numOrNull` 与 snapshot-checkpoint 逐输入同判', () => {
    let n = 0;
    for (const [label, v] of Object.entries(INPUTS2)) {
        const a = LE.numOrNull(v), b = SC.numOrNull(v);
        assert.ok(Object.is(a, b),
            '样本「' + label + '」两处必须同判（修前 0.5/-0.5/3.9/\'0.5\'/-0 分歧）：'
            + JSON.stringify(a) + ' vs ' + JSON.stringify(b));
        n++;
    }
    /* 反向钉住：这两个名字以前真的分歧过（否则本组可能只是「碰巧都对」）。 */
    assert.ok(!Object.is(0.5, 0), '（反向样本：0.5 与 0 不同 —— 修前契约侧把它取整成 0）');
    assert.strictEqual(LE.numOrNull(0.5), 0.5, '★ 原样数族不得取整：0.5 必须还是 0.5');
    assert.strictEqual(LE.numOrNull(-0.5), -0.5, '负小数同样不得取整（修前是 -1）');
    assert.strictEqual(LE.numOrNull(3.9), 3.9, '小数不得被抹掉（修前是 3）');
    assert.strictEqual(LE.numOrNull('0.5'), 0.5, '数字串小数同样原样');
    assert.ok(Object.is(LE.numOrNull(-0), -0), '原样族连 -0 都不改写符号（取整族归 +0）');
    ok('与 snapshot-checkpoint 同判 ' + n + '/' + n + '（含 5 个修前分歧样本）');
});

test('v3243 B3. `finiteNum` 与 `finite` 的分野：小数不同、整数与「没给」相同', () => {
    for (const l of ['数 0.5', '数 -0.5', '数 3.9', '数字串 0.5']) {
        assert.notStrictEqual(LE.finite(INPUTS2[l]), LE.finiteNum(INPUTS2[l]),
            '样本「' + l + '」两族必须给出不同答案（否则两族白白分开）');
    }
    for (const l of ['数 0', '数字串 0', '数 3', '数 -3', '数字串 3']) {
        assert.ok(Object.is(LE.finite(INPUTS2[l]), LE.finiteNum(INPUTS2[l])),
            '样本「' + l + '」上两族应给出同一答案：' + l);
    }
    for (const l of ['null', 'undefined', '空串', '空白串', '零宽串', '布尔 true', '数组 []', '对象 {}', 'NaN', 'Infinity']) {
        assert.strictEqual(LE.finite(INPUTS2[l]), null, '「没给」族在 finite 上是 null：' + l);
        assert.strictEqual(LE.finiteNum(INPUTS2[l]), null, '「没给」族在 finiteNum 上是 null：' + l);
    }
    /* 三个入口的家族归属：Floor/finite ⇒ 取整；numOrNull/finiteNum ⇒ 原样。 */
    assert.ok(Object.is(LE.finiteFloor(0.5), 0), 'finiteFloor 仍取整（楼层语义不变）');
    assert.ok(Object.is(LE.numOrNull(0.5), 0.5), 'numOrNull 不取整（原样语义）');
    ok('两族分野成立且互不越界');
});

/* ══════════ C. 文档面：报告里那句假注释不得回潮 ══════════ */
test('v3243 C1. 契约里那句「同判据的另一个名字」不得回潮（检测器两向自证）', () => {
    /* 被禁串**拼出来**而不是直写：本套件自己就含这句原文的话，C1 会先把自己判红
     *   （首跑实况）。判据要能区分「我在找它」与「它就是」，写法上就必须只留一份字样。 */
    const BAD = ['与 `finite`', '同判据的另一', '个名字'].join('');
    assert.ok(BAD.includes('同判据的另一'), '（检测器自证：拼出来的串确实是那句禁语）');
    assert.ok(!LE_SRC.includes(BAD), '★ 那句假注释不得回潮：它同时宣称「同 finite」与「与 snapshot 对齐」，'
        + '而这两件事互相矛盾（前者取整、后者不取整）');
    /* 「同判据别名」这个说法本身也是错的：两族口径不同，不存在「同判据的别名」。 */
    assert.ok(!LE_SRC.includes('同判据别名'), '「同判据别名」的说法不得回潮（两族口径不同）');
    ok('假注释与错误说法均已清除');
});

test('v3243 C2. 契约须留下「更正留痕」而不是悄悄改掉', () => {
    assert.ok(LE_SRC.includes('【留痕：上一版这句话是错的】'),
        '须留下「上一版这句话是错的」的留痕 —— 否则下一个读代码的人会重新引进它');
    assert.ok(LE_SRC.includes('【v3.243.0 更正】'), 'finite 注释里那句错误断言须带更正标记');
    assert.ok(/与全仓七处同判据|全仓七处/.test(LE_SRC), '须点名「原样数族与全仓七处既有判据同口径」');
    ok('更正留痕在场');
});

/* ══════════ D. 门禁 R6b/R8 真跑 + 负控制 ══════════ */
const GAUGED = ['manifest.json', 'index.js', CONTRACT_REL, 'seed-ledger.js', 'secret-ledger.js',
    'parallel-ledger.js', 'commitment-ledger.js', 'fact-version.js', 'event-completeness.js',
    'recall-echo.js', 'echo-ledger.js', 'repair-loop.js',
    'tests/audit/catalog_reference_consumers.tsv'];
function mkTree() {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'v3243-gate-'));
    for (const f of GAUGED) {
        const dest = path.join(dir, f);
        mkdirSync(path.dirname(dest), { recursive: true });
        writeFileSync(dest, readFileSync(path.join(ROOT, f)));
    }
    return dir;
}
/* 夹具要把被测对象放到**干净环境**里跑：本套件自己跑在 `node --test` 里，
 *   `NODE_TEST*` 标记会被传进子进程，子进程的 TAP 行为随之改变 ⇒ 退出码不再等于真判据结果
 *   （v3241 D1/D2 踩过）。这里一并剥掉。 */
function cleanEnv(root) {
    const env = { ...process.env, LONSHA_AUDIT_ROOT: root };
    for (const k of Object.keys(env)) {
        if (/^NODE_TEST/.test(k) || k === 'NODE_OPTIONS') delete env[k];
    }
    return env;
}
function runGate(root) {
    return spawnSync(process.execPath, [path.join(ROOT, GATE_REL)], {
        encoding: 'utf-8', timeout: 120000, cwd: ROOT, env: cleanEnv(root),
    });
}
function breakText(src, anchor, repl) {
    const n = src.split(anchor).length - 1;
    if (n !== 1) throw new Error('拒绝破坏：锚点命中 ' + n + ' 次（要求恰好 1 次）');
    const out = src.split(anchor).join(repl);
    if (out === src) throw new Error('拒绝破坏：替换未改变源码');
    return out;
}
function withTree(mutate) {
    const dir = mkTree();
    try {
        mutate(dir);
        const r = runGate(dir);
        return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
    } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('v3243 D1. 真仓库上门禁 exit 0，且读数点名三项新判据', () => {
    const r = runGate(ROOT);
    const out = (r.stdout || '') + (r.stderr || '');
    assert.strictEqual(r.status, 0, '健康树必须 exit 0：' + out.slice(-400));
    assert.ok(/两张域声明表成表/.test(out), '读数须含「两张域声明表」：' + out.slice(-200));
    assert.ok(/名字与口径同族/.test(out), '读数须含「名字与口径同族」：' + out.slice(-200));
    ok('门禁 exit 0（含 R6b/R8 读数）');
});

test('v3243 D2. 负控制 N1：`finiteNum` 被改成取整 → 必须 exit 1（R8，原样数族）', () => {
    const r = withTree((d) => {
        const p = path.join(d, CONTRACT_REL);
        const src = readFileSync(p, 'utf-8');
        writeFileSync(p, breakText(src,
            '    return Number.isFinite(n) ? n : null;',
            '    return Number.isFinite(n) ? Math.floor(n) : null;'));
    });
    assert.strictEqual(r.status, 1, 'R8 必须翻红，实得 ' + r.status + ' / ' + r.out.slice(-300));
    assert.ok(/R8 .*finiteNum/.test(r.out), '归因串须指向 R8 且点名 finiteNum：' + r.out.slice(-300));
    assert.ok(/原样数/.test(r.out), '须点名「原样数」族：' + r.out.slice(-300));
});

test('v3243 D3. 负控制 N2：`numOrNull` 转发回取整版 → 必须 exit 1（R8，取整版回潮）', () => {
    const r = withTree((d) => {
        const p = path.join(d, CONTRACT_REL);
        const src = readFileSync(p, 'utf-8');
        writeFileSync(p, breakText(src,
            '  function numOrNull(value) {\n    return finiteNum(value);\n  }',
            '  function numOrNull(value) {\n    return finite(value);\n  }'));
    });
    assert.strictEqual(r.status, 1, 'R8 必须翻红，实得 ' + r.status + ' / ' + r.out.slice(-300));
    assert.ok(/R8 .*numOrNull/.test(r.out), '归因串须指向 R8 且点名 numOrNull：' + r.out.slice(-300));
});

test('v3243 D4. 负控制 N3：第二张表被抽薄（cases 掉到 3 条）→ 必须 exit 1（R6b）', () => {
    const r = withTree((d) => {
        const p = path.join(d, CONTRACT_REL);
        const src = readFileSync(p, 'utf-8');
        const at = src.indexOf('    cases: Object.freeze([', src.indexOf('NUM_OR_NULL_DOMAINS'));
        assert.ok(at > 0, '真源码里须有第二张表的 cases（否则本组是空跑）');
        const endMark = '    ]),';
        const end = src.indexOf(endMark, at);
        const anchor = src.slice(at, end + endMark.length);
        assert.strictEqual(src.split(anchor).length - 1, 1, '锚点须恰中 1 次');
        writeFileSync(p, breakText(src, anchor,
            "    cases: Object.freeze([\n      ['null', 'null'], ['数 0.5', 'num'],\n    ]),"));
    });
    assert.strictEqual(r.status, 1, 'R6b 必须翻红，实得 ' + r.status + ' / ' + r.out.slice(-300));
    assert.ok(/R6b .*只有 2 条/.test(r.out), '须点名样本数：' + r.out.slice(-300));
});

test('v3243 D5. 负控制 N4：第二张表被整体摘除 → 必须 exit 1（R6b 报「缺表」）', () => {
    const r = withTree((d) => {
        const p = path.join(d, CONTRACT_REL);
        const src = readFileSync(p, 'utf-8');
        writeFileSync(p, breakText(src, '  const NUM_OR_NULL_DOMAINS = Object.freeze({',
            '  const __ND_REMOVED__ = Object.freeze({'));
    });
    assert.strictEqual(r.status, 1, 'R6b 必须翻红，实得 ' + r.status + ' / ' + r.out.slice(-300));
    assert.ok(/R6b 契约缺「原样数」族的域声明表/.test(r.out), '须报「缺表」：' + r.out.slice(-300));
});

test('v3243 D6. 保绿对照：契约里只加一行注释 → 仍须 exit 0（注释不是语义）', () => {
    const r = withTree((d) => {
        const p = path.join(d, CONTRACT_REL);
        const src = readFileSync(p, 'utf-8');
        writeFileSync(p, '// 只是一行注释，不改变任何口径\n' + src);
    });
    assert.strictEqual(r.status, 0, '注释不得改变结论：' + r.out.slice(-300));
});

test('v3243 D7. 负控制工具两向自证：锚点不存在 / 不唯一 / 同值替换必须抛', () => {
    assert.throws(() => breakText(GATE, 'THIS_ANCHOR_ABSENT_V3243', ''), /拒绝破坏/, '锚点不存在必须抛');
    assert.throws(() => breakText(GATE, 'const ', ''), /拒绝破坏/, '多命中必须抛');
    assert.throws(() => breakText(GATE, 'defects.push(', 'defects.push('), /拒绝破坏/, '同值替换必须抛');
    assert.ok(GATE.includes('R6b '), '真源码里 R6b 判据在场（否则整组负控制是空的）');
    assert.ok(GATE.includes('R8 '), '真源码里 R8 判据在场');
    assert.ok(GATE.includes("'R8 契约 ' + name"), 'R8 的归因串须点名具体函数名（否则两条 R8 不可区分）');
});

/* ══════════ E. 判据面自防护与版本锚 ══════════ */
test('v3243 E1. 判据面自防护：断言密度与关键指纹不得缩水', () => {
    const asserts = (SELF.match(/assert\./g) || []).length;
    assert.ok(asserts >= 40, '本套件断言数 ' + asserts + ' 少于 40：判据被稀释');
    for (const fp of ['NUM_OR_NULL_DOMAINS', 'finiteNum', 'R6b ', 'R8 ', '名字与口径同族',
        'snapshot-checkpoint.js', '拒绝破坏', 'scan_ledger_contract.mjs']) {
        assert.ok(SELF.includes(fp), '关键指纹缺失：' + fp);
    }
    ok('断言 ' + asserts + ' 条，指纹齐全');
});

test('v3243 E2. 版本锚：本版不低于出生版本 3.243.0', () => {
    assert.ok(vnum(CUR) >= vnum('3.243.0'), '本版不得低于出生版本（CUR=' + CUR + '）');
    assert.ok(SELF.includes("vnum('3.243.0')"), '须显式留下出生版本锚');
});
