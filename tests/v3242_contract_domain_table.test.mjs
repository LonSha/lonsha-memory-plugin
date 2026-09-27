/* ============================================================
 * tests/v3242_contract_domain_table.test.mjs — v3.242.0
 *
 * 主题：契约面三项深化 —— 看不见的空白 / `-0` / **域声明表**。
 *
 *   三件都是「契约的输出域此前只能靠读实现来推断」这一个根因的三个切面：
 *     ① `text` 的空白口径是 `\s`，而它**不覆盖**零宽一族与 NBSP。
 *        实测 `text('\u200b')` 得长度 1 的串（看着是空串），
 *        而 `names('a\u200b,b')` 得 `['a\u200b','b']` —— 去重键不再相等，
 *        「A」与「A\u200b」会被记成**两个人**。
 *     ② `Math.floor(-0) === -0`（IEEE 754）⇒ `finite(-0)` 返回 `-0`。
 *        楼层口径下 -0 就是 0，但 `Object.is` 型读侧判据把它分成两态。
 *     ③ `finite` 的输出域没有任何**声明**，于是「判据写得对不对」本身不可判。
 *
 *   判据一律落**真模块真跑** + 真源码破坏负控制：
 *     A 结构面：声明表成表且与实现同文件
 *     B 行为面：表驱动对拍（真函数 × 真表逐条）
 *     C 空白口径：零宽一族与 NBSP 逐字符
 *     D -0 归一与两向自证
 *     E 门禁 R6/R7 真跑 + 负控制
 *     F 判据面自防护与版本锚
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync, mkdirSync } from 'fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ledgerLevelConsumers } from './_fixture_sync.mjs';
import { breakText } from './_break_kit.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELF = readFileSync(fileURLToPath(import.meta.url), 'utf-8');
const LE_SRC = readFileSync(path.join(ROOT, 'ledger-entity.js'), 'utf-8');
const GATE_REL = 'tests/audit/scan_ledger_contract.mjs';
const GATE = readFileSync(path.join(ROOT, GATE_REL), 'utf-8');
const CONTRACT_REL = 'ledger-entity.js';
const require_ = createRequire(import.meta.url);
const LE = require_(path.join(ROOT, CONTRACT_REL));
const CUR = /const VERSION = '([0-9.]+)'/.exec(readFileSync(path.join(ROOT, 'index.js'), 'utf-8'))[1];

function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}
const ok = (msg) => console.log('  ✓ ' + msg);

/* 声明表里的样本「标签 → 真输入」。**表驱动对拍**的一半：
 *   标签住在契约里（跨进程可读的声明），真输入住在判据里（可调用对象）。
 *   两边都按同一个顺序走，任一侧漏一条就整组不成表：
 *   契约里加了样本而判据没加（或反之）⇒ 下面的长度断言立刻翻红。 */
const INPUTS = {
    'null': null, 'undefined': undefined,
    '布尔 true': true, '布尔 false': false,
    '空串': '', '空白串': '   ', '零宽串': '\u200b',
    '数组 []': [], '数组 [1]': [1], '对象 {}': {},
    '函数': () => 0, 'NaN': NaN, 'Infinity': Infinity, '-Infinity': -Infinity,
    '非数字串': 'abc',
    '数 0': 0, '数 -0': -0, '数字串 0': '0',
    '数 3': 3, '数 -3': -3, '数 3.9': 3.9, '数 -3.9': -3.9,
    '数字串 3': '3',
};

/* ══════════ A. 结构面 ══════════ */
test('v3242 A1. 契约带域声明表：outputs 三种形态 + cases 与 outputs 自洽', () => {
    const FD = LE.FINITE_DOMAINS;
    assert.ok(FD && typeof FD === 'object', '契约须导出 FINITE_DOMAINS');
    assert.deepStrictEqual([...FD.outputs], ['null', 'zero', 'int'],
        '输出域须恰为三种可枚举形态（多了就不是「有限输出」）：' + JSON.stringify(FD.outputs));
    assert.ok(Array.isArray(FD.cases) && FD.cases.length >= 20,
        'cases 样本数 ' + (FD.cases && FD.cases.length) + ' 少于 20：表被抽薄');
    for (const row of FD.cases) {
        assert.ok(Array.isArray(row) && row.length === 2, '每条样本须是 [标签, 期望]：' + JSON.stringify(row));
        assert.ok(FD.outputs.includes(row[1]), '样本「' + row[0] + '」的期望 `' + row[1] + '` 不在 outputs 里');
    }
    ok('声明表 ' + FD.cases.length + ' 条 × ' + FD.outputs.length + ' 形态');
});

test('v3242 A2. 声明表与判据侧的输入表逐标签对齐（缺一条即不成表）', () => {
    const labels = LE.FINITE_DOMAINS.cases.map((r) => r[0]);
    const mine = Object.keys(INPUTS);
    assert.strictEqual(labels.length, mine.length,
        '契约声明 ' + labels.length + ' 条、判据可调用输入 ' + mine.length + ' 条 —— 两侧不等即表不成表');
    for (const l of labels) assert.ok(l in INPUTS, '判据侧缺样本输入：' + l);
    for (const m of mine) assert.ok(labels.includes(m), '判据侧多出契约未声明的样本：' + m);
    ok('两侧 ' + labels.length + ' 条逐标签对齐');
});

test('v3242 A3. 声明表与实现同文件（就地声明，不是外挂文档）', () => {
    assert.ok(LE_SRC.includes('const FINITE_DOMAINS = Object.freeze({'),
        '声明表须在契约模块内就地声明（同文件同版本才能一起抬版）');
    assert.ok(/const INVISIBLE = \/\[[^\]]*\\u200b[^\]]*\]\/g;/.test(LE_SRC),
        '零宽字符集须是本模块的具名常量（口径有名字才谈得上同源）');
    ok('声明表与实现同文件');
});

/* ══════════ B. 行为面：表驱动对拍（真函数 × 真表） ══════════ */
test('v3242 B1. 真函数 × 真表逐条对拍：23 条样本全部命中声明', () => {
    let n = 0;
    for (const [label, expect] of LE.FINITE_DOMAINS.cases) {
        const got = LE.finite(INPUTS[label]);
        const kind = got === null ? 'null' : (Object.is(got, 0) ? 'zero' : 'int');
        assert.strictEqual(kind, expect,
            '样本「' + label + '」期望 ' + expect + '，实得 ' + kind + '（值 ' + JSON.stringify(got) + '）');
        if (expect === 'int') assert.ok(Number.isInteger(got), '标签为 int 的样本须得整数：' + label);
        if (expect === 'zero') assert.ok(got === 0, '标签为 zero 的样本须得 0：' + label);
        n++;
    }
    assert.strictEqual(n, LE.FINITE_DOMAINS.cases.length, '对拍条数须等于声明条数（不许跳样本）');
    ok('表驱动对拍 ' + n + '/' + n);
});

test('v3242 B2. 同族同判、异族异判（finiteFloor 随 finite；numOrNull 随 finiteNum）', () => {
    const shape = (x) => (x === null ? 'null' : (Object.is(x, 0) ? 'zero' : x));
    for (const [label] of LE.FINITE_DOMAINS.cases) {
        const v = INPUTS[label];
        const a = LE.finite(v), b = LE.finiteFloor(v), c = LE.numOrNull(v);
        /* 【v3.243.0 修订 · 本条原文默认了「别名同判据」】原句写
         *   `deepStrictEqual([shape(b), shape(c)], [shape(a), shape(a)])` ——
         *   即「三个入口必须同判」。那要求 numOrNull 与 finite 同族，
         *   而 v3.243.0 起 numOrNull 归「原样数」族（小数不取整）。
         *   本组改为**两族各自同判**：楼层族两名（finite / finiteFloor）同判；
         *   原样族（numOrNull）与 finiteNum 同判。分开才是本版的目的。 */
        assert.deepStrictEqual([shape(b)], [shape(a)], '楼层族两名须同判：' + label);
        assert.ok(Object.is(c, LE.finiteNum(v)), '原样族须与 finiteNum 同判：' + label);
    }
    /* 异族必须异判（对小数）—— 否则两族分开只是一句说法。 */
    assert.notStrictEqual(LE.finite(3.9), LE.numOrNull(3.9), '楼层族取整、原样族不取整 ⇒ 对小数必不同');
    assert.notStrictEqual(LE.finite(-0.5), LE.numOrNull(-0.5), '负小数同样必不同（-1 vs -0.5）');
    ok('同族同判、异族异判');
});

/* ══════════ C. 空白口径：零宽一族与 NBSP ══════════ */
test('v3242 C1. 零宽一族与 NBSP 逐字符：text 归成空串、finite 归成 null', () => {
    const cases = [
        ['ZWSP U+200B', '\u200b'], ['ZWNJ U+200C', '\u200c'], ['ZWJ U+200D', '\u200d'],
        ['BOM U+FEFF', '\ufeff'], ['NBSP U+00A0', '\u00a0'],
    ];
    for (const [name, ch] of cases) {
        assert.strictEqual(LE.text(ch), '', name + ' 应被 text 归成空串（修前得长度 1 的串）');
        assert.strictEqual(LE.finite(ch), null, name + ' 应被 finite 归成 null');
    }
    // 两向自证：这些字符**夹在文本里**时不得被当分隔符吃掉整串
    assert.strictEqual(LE.text('前\u200b后'), '前 后', '夹在中间应归成半角空格（不是删掉粘一起）');
    // 半角/全角空白与制表、换行仍照旧
    for (const [name, ch] of [['空格', ' '], ['制表', '\t'], ['换行', '\n'], ['全角空格', '\u3000']]) {
        assert.strictEqual(LE.text(ch), '', name + ' 仍应归成空串');
    }
    ok('5 类隐形字符 + 4 类常规空白逐条命中');
});

test('v3242 C2. 去重键同源：零宽夹缝不得把人名分成两个', () => {
    const got = LE.names('a\u200b,b');
    assert.deepStrictEqual(got, ['a', 'b'],
        '零宽连接符应被归一掉（修前得 ["a\u200b","b"] ⇒ 同一人被记两次）：' + JSON.stringify(got));
    // 真去重：同一名字带与不带零宽，去重后只留一条
    assert.deepStrictEqual(LE.names('若雪,\u200b若雪'), ['若雪'],
        '同名（带零宽）须被去重键识别为同一个：' + JSON.stringify(LE.names('若雪,\u200b若雪')));
    ok('零宽不再制造「隐形分身」');
});

/* ══════════ D. -0 归一与两向自证 ══════════ */
test('v3242 D1. -0 归一到 +0，且 +0 与其它数不受影响（两向自证）', () => {
    assert.ok(Object.is(LE.finite(-0), 0), 'finite(-0) 必须是 +0（实得 ' + JSON.stringify(LE.finite(-0)) + '）');
    assert.ok(!Object.is(LE.finite(-0), -0), 'finite(-0) 不得保留 -0 符号');
    assert.ok(Object.is(LE.finite(0), 0), 'finite(0) 仍是 +0');
    assert.strictEqual(LE.finite(-3), -3, '负数不得被 -0 归一误伤');
    assert.strictEqual(LE.finite(-0.5), -1, '负小数仍按 floor 取整（-0.5 ⇒ -1，不是 -0）');
    assert.strictEqual(LE.finite(3.9), 3, '正小数仍按 floor 取整');
    ok('-0 归一，其余取值原样');
});

/* ══════════ E. 门禁 R6/R7 真跑 + 负控制 ══════════ */
/* [v3.246.0] 本表**不是账本名册**（同名异义，别照名字对号）：它是 mirror 树要搬的文件集 ——
 *   manifest / 主入口 / 契约 / 九本账 / 登记表，缺一个门禁就在夹具里提前 fail-closed。
 *   但「九本账」那一截原先也是手抄 ⇒ 换成从唯一真源派生；
 *   manifest / index / 契约 / TSV 仍显式列出（它们不是账本级消费者，派生不出来）。 */
const GAUGED = ['manifest.json', 'index.js', CONTRACT_REL,
    ...ledgerLevelConsumers(ROOT, JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8')).extra_js),
    'tests/audit/catalog_reference_consumers.tsv'];
function mkTree() {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'v3242-gate-'));
    for (const f of GAUGED) {
        const dest = path.join(dir, f);
        mkdirSync(path.dirname(dest), { recursive: true });
        writeFileSync(dest, readFileSync(path.join(ROOT, f)));
    }
    return dir;
}
function runGate(root) {
    return spawnSync(process.execPath, [path.join(ROOT, GATE_REL)], {
        encoding: 'utf-8', timeout: 120000, cwd: ROOT,
        env: { ...process.env, LONSHA_AUDIT_ROOT: root },
    });
}
function withTree(mutate) {
    const dir = mkTree();
    try {
        mutate(dir);
        const r = runGate(dir);
        return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
    } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('v3242 E1. 真仓库上门禁 exit 0，且读数点名两项新判据', () => {
    const r = runGate(ROOT);
    /* 留痕：`runGate` 回的是 `spawnSync` 的**原样对象**（`.stdout` / `.stderr` / `.status`），
     *   只有 `withTree` 才把它折成 `{ status, out }`。本组首跑把两者当成同一个形状，
     *   于是在 `r.out.slice(-400)` 上抛 `TypeError: Cannot read properties of undefined` ——
     *   红的不是判据，是取值姿势。 */
    const out = (r.stdout || '') + (r.stderr || '');
    assert.strictEqual(r.status, 0, '健康树必须 exit 0：' + out.slice(-400));
    assert.ok(/域声明表成表/.test(out), '读数须含域声明表：' + out.slice(-200));
    assert.ok(/登记表无重复行/.test(out), '读数须含登记表：' + out.slice(-200));
    ok('门禁 exit 0（含 R6/R7 读数）');
});

test('v3242 E2. 负控制 N1：声明表被抽薄（cases 掉到 3 条）→ 必须 exit 1（R6）', () => {
    const r = withTree((d) => {
        const p = path.join(d, CONTRACT_REL);
        const src = readFileSync(p, 'utf-8');
        /* 真源码破坏：把整个 `cases` 数组体换成 3 条，掉到 R6 的下限（10 条）以下。
         *   锚点不是手抄的片段，而是**从真源码里就地切出来**的整段：
         *   本组首跑手抄了 5 条换掉 1 条 —— 23 条删完还剩 19 条（≥ 10），
         *   R6 的数量判据根本没被踩到，于是「破坏确实写进去了、结论却不变」，
         *   看着像判据失灵。留痕：破坏要踩的是**判据线**，不是碰到源码就算。 */
        /* 定位要**按声明标记**，不能按裸名字：`FINITE_DOMAINS` 首次出现是在
         *   `finite` 的注释里（索引 6765），比声明（8260）更早 —— 按裸名字定位会
         *   切到第二张表的 `cases`，破坏就变成了 ND 表的事（本组实测被这个坑拦下）。
         *   留痕：**定位锚点要指向声明，不是名字的首次出现**。 */
        const at = src.indexOf('    cases: Object.freeze([',
            src.indexOf('  const FINITE_DOMAINS = Object.freeze({'));
        assert.ok(at > 0, '真源码里须有 cases 数组（否则本组是空跑）');
        const endMark = '    ]),';
        const end = src.indexOf(endMark, at);
        assert.ok(end > at, '须能取到 cases 数组的收尾 `]),`');
        const anchor = src.slice(at, end + endMark.length);
        assert.strictEqual(src.split(anchor).length - 1, 1,
            '锚点须恰中 1 次（整段 cases 只应出现一次）');
        writeFileSync(p, breakText(src, anchor,
            "    cases: Object.freeze([\n      ['null', 'null'], ['数 3', 'int'], ['数 -3', 'int'],\n    ]),"));
    });
    assert.strictEqual(r.status, 1, 'R6 必须翻红，实得 ' + r.status + ' / ' + r.out.slice(-300));
    assert.ok(/R6 /.test(r.out), '归因串须指向 R6');
    assert.ok(/只有 \d+ 条/.test(r.out), '须点名样本数：' + r.out.slice(-300));
});

test('v3242 E3. 负控制 N2：声明表被整体摘除 → 必须 exit 1（R6，且是「缺表」而非「表空」）', () => {
    const r = withTree((d) => {
        const p = path.join(d, CONTRACT_REL);
        const src = readFileSync(p, 'utf-8');
        writeFileSync(p, breakText(src, '  const FINITE_DOMAINS = Object.freeze({',
            '  const __FD_REMOVED__ = Object.freeze({'));
    });
    assert.strictEqual(r.status, 1, 'R6 必须翻红，实得 ' + r.status + ' / ' + r.out.slice(-300));
    assert.ok(/R6 契约缺输入\/输出域声明表/.test(r.out), '须报「缺表」：' + r.out.slice(-300));
});

test('v3242 E4. 负控制 N3：登记表被塞入重复行 → 必须 exit 1（R7）', () => {
    const r = withTree((d) => {
        const p = path.join(d, 'tests/audit/catalog_reference_consumers.tsv');
        const lines = readFileSync(p, 'utf-8').split('\n').filter(Boolean);
        // 真源码破坏：把最后一行登记再追加一次（真实世界里的复制粘贴事故）
        lines.push(lines[lines.length - 1]);
        writeFileSync(p, lines.join('\n') + '\n');
    });
    assert.strictEqual(r.status, 1, 'R7 必须翻红，实得 ' + r.status + ' / ' + r.out.slice(-300));
    assert.ok(/R7 登记表有重复行/.test(r.out), '须点名重复：' + r.out.slice(-300));
});

test('v3242 E5. 保绿对照：登记表只加一行注释 → 仍须 exit 0（注释不是登记）', () => {
    const r = withTree((d) => {
        const p = path.join(d, 'tests/audit/catalog_reference_consumers.tsv');
        writeFileSync(p, '# 只是一行注释，不是登记（不得被算进名册）\n' + readFileSync(p, 'utf-8'));
    });
    assert.strictEqual(r.status, 0, '注释不得改变结论：' + r.out.slice(-300));
});

test('v3242 E6. 负控制工具两向自证：锚点不存在 / 不唯一 / 同值替换必须抛', () => {
    assert.throws(() => breakText(GATE, 'THIS_ANCHOR_ABSENT_V3242', ''), /拒绝破坏/, '锚点不存在必须抛');
    assert.throws(() => breakText(GATE, 'const ', ''), /拒绝破坏/, '多命中必须抛');
    assert.throws(() => breakText(GATE, 'defects.push(', 'defects.push('), /拒绝破坏/, '同值替换必须抛');
    assert.ok(GATE.includes('R6 '), '真源码里 R6 判据在场（否则整组负控制是空的）');
    assert.ok(GATE.includes('R7 '), '真源码里 R7 判据在场');
});

/* ══════════ F. 判据面自防护与版本锚 ══════════ */
test('v3242 F1. 判据面自防护：断言密度与关键指纹不得缩水', () => {
    const asserts = (SELF.match(/assert\./g) || []).length;
    assert.ok(asserts >= 45, '本套件断言数 ' + asserts + ' 少于 45：判据被稀释');
    for (const fp of ['FINITE_DOMAINS', 'INVISIBLE', 'R6 ', 'R7 ', '拒绝破坏',
        'catalog_reference_consumers.tsv', 'scan_ledger_contract.mjs']) {
        assert.ok(SELF.includes(fp), '关键指纹缺失：' + fp);
    }
    ok('断言 ' + asserts + ' 条，指纹齐全');
});

test('v3242 F2. 版本锚：本版不低于出生版本 3.242.0', () => {
    assert.ok(vnum(CUR) >= vnum('3.242.0'), '本版不得低于出生版本（CUR=' + CUR + '）');
    assert.ok(SELF.includes("vnum('3.242.0')"), '须显式留下出生版本锚');
});