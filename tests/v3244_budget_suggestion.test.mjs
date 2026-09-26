/* ============================================================
 * tests/v3244_budget_suggestion.test.mjs — v3.244.0
 *
 * 主题：**建议面带数值** —— 死代码预算的抬升建议（计划 #14 / P1）。
 *
 *   病根：`dead_code_budget.mjs` 翻红的信息量只有「数字不够大」：
 *     · 已越界 → 只告诉你越了，**该改成多少**得自己算；
 *     · 余量过大 → 只说「脱节」，不说收紧到多少；
 *     · 余量将尽 → **毫无预告**，直到下次增长才红。
 *   而「实测 + maxSlack」这个算式在 `--bump` 里已有一份 —— 读数面若再手写一份，
 *   就是本仓治过的「一份契约 N 份拷贝」（改一处漏一处）。
 *
 *   本版：把算式抽成唯一导出纯函数 `suggestCeiling(m, b)`，
 *   读数 / `--suggest` / 翻红三条路共用；导出 `THIN_SLACK_RATIO` 作为「将尽」判据；
 *   三种情形各给出可直接复制的命令与数值。
 *
 *   判据一律落**真函数真跑** + **真脚本子进程真跑** + 真源码破坏负控制：
 *     A 结构面：唯一算式是导出纯函数 / 常量导出 / 体内不留版本字面量
 *     B 行为面：纯函数算术（含 delta 正负零）/ 不写盘 / 不抛
 *     C CLI 四态真跑（夹具里造状态）：健康 / 将尽 / 越界 / 余量过大；+ `--suggest` 不写盘
 *     D 负控制：算式破坏 / 阈值破坏 / `--suggest` 破坏 → 同款判据必须转红；保绿对照；工具两向自证
 *     E 判据面自防护与版本锚
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, copyFileSync, mkdtempSync, rmSync, mkdirSync } from 'fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { suggestCeiling, THIN_SLACK_RATIO } from './audit/dead_code_budget.mjs';
/* 【v3.244.0 教训】剥离注释要**用唯一真源**，不要本地再写一份：
 *   本组首版自己写了个三行 `stripComments`，当场被 `scan_audit_lib_consolidation.mjs`
 *   抓红 ——「仍在本地重写 stripComments（v3.191 已收敛到唯一真源）」。
 *   那个门禁正是为这一条存在的：同一条口径多份实现，修一处漏一处。
 *   故改为从 `tests/_audit_lib.mjs` import（本仓既有用法，见 v3164）。 */
import { stripComments } from './_audit_lib.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELF = readFileSync(fileURLToPath(import.meta.url), 'utf-8');
const SCRIPT_REL = 'tests/audit/dead_code_budget.mjs';
const SCRIPT = readFileSync(path.join(ROOT, SCRIPT_REL), 'utf-8');
const BUDGET_REL = 'tests/audit/dead_code_budget.json';
/* 【v3.244.0 教训】判据要**看代码，不看注释**：本组首跑用裸 `split(字面量)` 计数，
 *   于是我自己在 `--bump` 段写下的解释性注释（里面引用了那个表达式）把计数顶成 2，
 *   判据当场自红。这不是实现有两份拷贝，是**判据没剥注释** —— 与 v3241 A2 同款。
 *   剥离器来自唯一真源（`tests/_audit_lib.mjs`），不本地重写 —— 见上方 import 处留痕。 */
const CODE = stripComments(SCRIPT);
const CUR = /const VERSION = '([0-9.]+)'/.exec(readFileSync(path.join(ROOT, 'index.js'), 'utf-8'))[1];

function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}
const ok = (msg) => console.log('  ✓ ' + msg);

/* ---------- 夹具：一个自足的小仓库（ROOT/ + tests/audit/） ----------
 * 实测行数固定为 FIXTURE_LINES，于是四种状态都能精确构造：
 *   healthy      slack == maxSlack（不告警、不预告）
 *   will-exhaust slack < maxSlack/2（exit 0 + 「余量将尽」+ 预告）
 *   over         measured >= ceiling（exit 1 + 可复制命令）
 *   over-slack   slack > maxSlack（exit 1 + 「建议收紧到」）  */
const FIXTURE_LINES = 12;
const MAX_SLACK = 400;
function mkFixture(ceiling, breakScript) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'v3244-budget-'));
    mkdirSync(path.join(dir, 'tests', 'audit'), { recursive: true });
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ extra_js: [] }));
    /* 不加尾部换行：`'a\nb\n'`.split('\n') 会多出一项空串（实测行数 12 → 13）。
     *   本组首跑就被这个差 1 拦住（计数面差 1 是最容易被忽略的形态）。 */
    writeFileSync(path.join(dir, 'a.js'), Array(FIXTURE_LINES).fill('x').join('\n'));
    const dest = path.join(dir, SCRIPT_REL);
    writeFileSync(dest, breakScript ? breakScript(SCRIPT) : SCRIPT);
    const budget = { _doc: 'fixture', ceiling, maxSlack: MAX_SLACK };
    writeFileSync(path.join(dir, BUDGET_REL), JSON.stringify(budget, null, 2) + '\n');
    return dir;
}
function runFixture(dir, args) {
    const r = spawnSync(process.execPath, [path.join(dir, SCRIPT_REL), ...(args || [])], {
        encoding: 'utf-8', timeout: 60000, cwd: ROOT,
    });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), stdout: r.stdout || '' };
}
function breakText(src, anchor, repl) {
    const n = src.split(anchor).length - 1;
    if (n !== 1) throw new Error('拒绝破坏：锚点命中 ' + n + ' 次（要求恰好 1 次）');
    const out = src.split(anchor).join(repl);
    if (out === src) throw new Error('拒绝破坏：替换未改变源码');
    return out;
}
function withFixture(ceiling, fn, breakScript) {
    const dir = mkFixture(ceiling, breakScript);
    try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

/* ══════════ A. 结构面 ══════════ */
test('v3244 A1. 唯一算式是**导出的纯函数** `suggestCeiling(m, b)`', () => {
    assert.strictEqual(typeof suggestCeiling, 'function', '脚本须导出 suggestCeiling');
    const got = suggestCeiling({ total: 100 }, { ceiling: 500, maxSlack: 400 });
    assert.deepStrictEqual(Object.keys(got).sort(), ['ceiling', 'delta', 'maxSlack', 'measured'].sort(),
        '返回面须含 ceiling / delta / measured / maxSlack：' + JSON.stringify(got));
    assert.strictEqual(got.ceiling, 500, 'ceiling = 实测 + maxSlack');
    assert.strictEqual(got.delta, 0, 'delta = 建议 − 当前登记');
    ok('导出纯函数 + 返回面齐备');
});

test('v3244 A2. 算式**只有一处**：CLI 不再自己写 `+ b.maxSlack`；且不留版本字面量', () => {
    /* --bump 与读数/--suggest 都必须走同一个函数 —— 否则又长成两份拷贝。
     *   计数一律在**剥过注释的代码**上做（注释里引用该表达式不算拷贝）。
     *   【v3.244.0 教训】剥离器的自证不能写「剥完更短」：唯一真源
     *   `tests/_audit_lib.mjs:stripComments` 的口径是**把注释位换成空格**（保长度、
     *   保换行），不是删除 —— 首版按「更短」自证，当场翻红。自证要钉它**真正**的契约：
     *   内容变了、注释标志没了、关键代码还在。 */
    assert.notStrictEqual(CODE, SCRIPT, '剥离器自证：剥完内容必须与原文不同');
    assert.ok(!CODE.includes('两份拷贝'), '剥离器自证：注释文字须已被清掉');
    assert.ok(CODE.includes('function suggestCeiling('), '剥离器自证：不得把被测代码一起剥掉');
    assert.strictEqual(CODE.split('\n').length, SCRIPT.split('\n').length,
        '剥离器自证：真源口径保行（换行不动）');
    assert.strictEqual(CODE.split('m.total + b.maxSlack').length - 1, 1,
        '`m.total + b.maxSlack` 在**代码**里只应出现一次（suggestCeiling 体内）：唯一算式');
    assert.strictEqual(SCRIPT.split('const next = sug.ceiling;').length - 1, 1,
        '--bump 须直接取 sug.ceiling（不得自己再算一遍）');
    assert.ok(CODE.includes('const sug = suggestCeiling(m, b);'), 'CLI 须调用该函数而非自己算');
    assert.ok(CODE.includes('suggestCeiling'), '须有 suggestCeiling 引用');
    /* 「将尽」的阈值是导出常量，不是散落的字面量。 */
    assert.strictEqual(typeof THIN_SLACK_RATIO, 'number', 'THIN_SLACK_RATIO 须是数字导出');
    assert.ok(THIN_SLACK_RATIO > 0 && THIN_SLACK_RATIO < 1, '阈值须落在 (0,1)：' + THIN_SLACK_RATIO);
    /* 脚本自述「版本无关」：除历史背景注释外不得新增版本字面量。
     *   这里只钉住**新增段**不留版本号（历史注释里的 v3.202.0 是背景，不是本版引入）。 */
    const newParts = CODE.slice(CODE.indexOf('suggestCeiling(m, b)'), CODE.length);
    assert.ok(!/3\.\d+\.\d+/.test(newParts), '新增的建议面**代码**里不得出现版本字面量（脚本要版本无关）');
    ok('唯一算式 + 常量化阈值 + 新增段无版本字面量');
});

/* ══════════ B. 行为面（真函数） ══════════ */
test('v3244 B1. 算术三档：该抬 / 该收紧 / 刚好对齐（delta 的符号就是结论）', () => {
    const raise = suggestCeiling({ total: 1000 }, { ceiling: 1200, maxSlack: 400 });
    assert.strictEqual(raise.ceiling, 1400, '该抬：1000 + 400');
    assert.strictEqual(raise.delta, 200, '该抬：delta 为正（+200）');
    const tighten = suggestCeiling({ total: 1000 }, { ceiling: 1600, maxSlack: 400 });
    assert.strictEqual(tighten.ceiling, 1400, '该收紧：仍按 实测 + slack 算');
    assert.strictEqual(tighten.delta, -200, '该收紧：delta 为负（−200）');
    const same = suggestCeiling({ total: 1000 }, { ceiling: 1400, maxSlack: 400 });
    assert.strictEqual(same.delta, 0, '刚好对齐：delta 为 0');
    ok('三档算术与符号齐备');
});

test('v3244 B2. 是**纯函数**：不读环境、不写盘、不改入参（两次调用结果一致）', () => {
    const m = { total: 7, files: 1, declared: 1 };
    const b = { ceiling: 9, maxSlack: 400 };
    const mSnap = JSON.stringify(m), bSnap = JSON.stringify(b);
    const a1 = suggestCeiling(m, b), a2 = suggestCeiling(m, b);
    assert.deepStrictEqual(a1, a2, '同输入两次调用必须同结果（不得带内部状态）');
    assert.strictEqual(JSON.stringify(m), mSnap, '入参 m 不得被改写');
    assert.strictEqual(JSON.stringify(b), bSnap, '入参 b 不得被改写');
    ok('纯函数：无状态、无副作用');
});

test('v3244 B3. 不抛：畸形输入也返回结构化结果（不猜、不崩）', () => {
    const weird = [
        [{ total: 0 }, { ceiling: 0, maxSlack: 0 }],
        [{ total: -5 }, { ceiling: 10, maxSlack: -1 }],
        [{ total: 1e9 }, { ceiling: 0, maxSlack: 1e9 }],
    ];
    for (const [m, b] of weird) {
        const got = suggestCeiling(m, b);
        assert.ok(Number.isFinite(got.ceiling), 'ceiling 须是有限数：' + JSON.stringify(got));
        assert.ok(Number.isFinite(got.delta), 'delta 须是有限数：' + JSON.stringify(got));
    }
    ok('三组畸形输入均返回有限数（不抛）');
});

/* ══════════ C. CLI 四态真跑（夹具造状态）+ --suggest ══════════ */
test('v3244 C1. 健康档（slack == maxSlack）：exit 0，且**不**预告「将尽」', () => {
    withFixture(FIXTURE_LINES + MAX_SLACK, (dir) => {
        const r = runFixture(dir);
        assert.strictEqual(r.status, 0, '健康档必须 exit 0：' + r.out);
        assert.ok(/余量 400/.test(r.out), '读数须报余量：' + r.out);
        assert.ok(!/将尽/.test(r.out), '健康档不得预告「将尽」（否则预告是噪声）：' + r.out);
    });
    ok('健康档 exit 0、无预告');
});

test('v3244 C2. 将尽档（slack < maxSlack/2）：exit 0，但必须预告并给出预告值', () => {
    withFixture(FIXTURE_LINES + 100, (dir) => {
        const r = runFixture(dir);
        assert.strictEqual(r.status, 0, '将尽不是失败，必须 exit 0：' + r.out);
        assert.ok(/余量将尽/.test(r.out), '须预告「余量将尽」：' + r.out);
        assert.ok(new RegExp('ceiling = ' + (FIXTURE_LINES + MAX_SLACK)).test(r.out),
            '预告值须是 实测 + slack = ' + (FIXTURE_LINES + MAX_SLACK) + '：' + r.out);
    });
    ok('将尽档 exit 0 + 预告');
});

test('v3244 C3. 越界档：exit 1，且必须给出**可直接复制的命令**与建议值', () => {
    withFixture(FIXTURE_LINES - 5, (dir) => {
        const r = runFixture(dir);
        assert.strictEqual(r.status, 1, '越界必须 exit 1：' + r.out);
        assert.ok(/已越过上界/.test(r.out), '须点名越界：' + r.out);
        assert.ok(/--bump --reason=/.test(r.out), '须给出可复制命令（此前只有「数字不够大」）：' + r.out);
        assert.ok(new RegExp('ceiling = ' + (FIXTURE_LINES + MAX_SLACK)).test(r.out),
            '建议值须为 ' + (FIXTURE_LINES + MAX_SLACK) + '：' + r.out);
    });
    ok('越界档 exit 1 + 命令 + 建议值');
});

test('v3244 C4. 余量过大档：exit 1，且必须给出**收紧建议**（负 delta）', () => {
    withFixture(FIXTURE_LINES + 900, (dir) => {
        const r = runFixture(dir);
        assert.strictEqual(r.status, 1, '余量过大必须 exit 1：' + r.out);
        assert.ok(/余量过大/.test(r.out), '须点名余量过大：' + r.out);
        assert.ok(/建议收紧到/.test(r.out), '须给出收紧建议：' + r.out);
        assert.ok(/手改/.test(r.out), '须说明「--bump 只抬不降 ⇒ 手改」：' + r.out);
        assert.ok(/-500/.test(r.out), 'delta 须为负（412 − 912 = −500）：' + r.out);
    });
    ok('余量过大档 exit 1 + 收紧建议');
});

test('v3244 C5. `--suggest` 机器可读、恒 exit 0、且**不写盘**', () => {
    const dir = mkFixture(FIXTURE_LINES + 100);
    try {
        const p = path.join(dir, BUDGET_REL);
        const before = readFileSync(p, 'utf-8');
        const r = runFixture(dir, ['--suggest']);
        assert.strictEqual(r.status, 0, '--suggest 恒 exit 0（只读不判）：' + r.out);
        assert.ok(new RegExp('建议上界 ' + (FIXTURE_LINES + MAX_SLACK)).test(r.out),
            '须输出建议值：' + r.out);
        assert.ok(/相对当前 \+\d+/.test(r.out), '须输出相对差（带符号）：' + r.out);
        assert.ok(!/将尽/.test(r.out), '--suggest 只输出建议，不输出预告（机器可读）：' + r.out);
        assert.strictEqual(readFileSync(p, 'utf-8'), before, '★ --suggest 不得写盘（逐字节相同）');
    } finally { rmSync(dir, { recursive: true, force: true }); }
    ok('--suggest 恒 exit 0、零写盘');
});

/* ══════════ D. 负控制：真源码破坏 → 同款判据必须转红 ══════════ */
test('v3244 D1. 破坏算式（`+` → `−`）⇒ 行为面判据在破坏副本上必须转红', async () => {
    const badFn = (s) => breakText(s, 'const ceiling = m.total + b.maxSlack;',
        'const ceiling = m.total - b.maxSlack;');
    const dir = mkFixture(0, badFn);
    try {
        const M = await import(pathToFileURL(path.join(dir, SCRIPT_REL)).href);
        /* B1 同款判据：1000 + 400 必须是 1400。 */
        assert.throws(() => assert.strictEqual(M.suggestCeiling({ total: 1000 }, { ceiling: 1200, maxSlack: 400 }).ceiling, 1400),
            /AssertionError/, '破坏副本上同款判据必须抛（否则负控制是空的）');
        assert.strictEqual(M.suggestCeiling({ total: 1000 }, { ceiling: 1200, maxSlack: 400 }).ceiling, 600,
            '（破坏已生效：加法变成了减法 ⇒ 600）');
        assert.strictEqual(suggestCeiling({ total: 1000 }, { ceiling: 1200, maxSlack: 400 }).ceiling, 1400,
            '对照：真源码下仍是 1400');
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('v3244 D2. 破坏阈值（0.5 → 0）⇒ C2 的「将尽预告」判据必须转红', () => {
    const bad = (s) => breakText(s, 'export const THIN_SLACK_RATIO = 0.5;',
        'export const THIN_SLACK_RATIO = 0;');
    withFixture(FIXTURE_LINES + 100, (dir) => {
        const r = runFixture(dir);
        assert.ok(!/余量将尽/.test(r.out),
            '（破坏已生效：阈值 0 ⇒ slack < 0 恒假 ⇒ 预告永不出现；C2 同款判据此时必须抛）' + r.out);
    }, bad);
    withFixture(FIXTURE_LINES + 100, (dir) => {
        const r = runFixture(dir);
        assert.ok(/余量将尽/.test(r.out), '对照：真源码下预告在场');
    });
});

test('v3244 D3. 破坏 `--suggest` 的退出码 ⇒ C5 的「恒 exit 0」判据必须转红', () => {
    const anchor = "    if (args.includes('--suggest')) {\n"
        + "        console.log('建议上界 ' + sug.ceiling + ' 行（= 实测 ' + sug.measured + ' + slack ' + sug.maxSlack + '）'\n"
        + "            + ' | 相对当前 ' + (sug.delta >= 0 ? '+' : '') + sug.delta);\n"
        + "        process.exit(0);\n"
        + "    }";
    const bad = (s) => breakText(s, anchor, anchor.replace('process.exit(0);', 'process.exit(1);'));
    withFixture(FIXTURE_LINES + 100, (dir) => {
        const r = runFixture(dir, ['--suggest']);
        assert.strictEqual(r.status, 1,
            '（破坏已生效：--suggest 变成 exit 1 ⇒ C5 同款判据此时必须抛）');
    }, bad);
    withFixture(FIXTURE_LINES + 100, (dir) => {
        assert.strictEqual(runFixture(dir, ['--suggest']).status, 0, '对照：真源码下恒 exit 0');
    });
});

test('v3244 D4. 保绿对照：脚本里只加一行注释 → 四态结论全不变', () => {
    /* 【v3.244.0 教训】注释要加在**末尾**：首行是 `#!` shebang，把注释插到它前面会让
     *   shebang 不再是首行 ⇒ node 把 `#!...` 当语法错误 ⇒ 脚本根本跑不起来（本组首跑实况）。
     *   这与上一条同源：判据要动被测对象时，先确认自己没破坏它「能不能跑」。 */
    const addComment = (s) => s + '\n// 只是一行注释，不改变任何算式与阈值\n';
    withFixture(FIXTURE_LINES + MAX_SLACK, (dir) => {
        assert.strictEqual(runFixture(dir).status, 0, '健康档仍 0');
    }, addComment);
    withFixture(FIXTURE_LINES - 5, (dir) => {
        assert.strictEqual(runFixture(dir).status, 1, '越界档仍 1');
    }, addComment);
    ok('注释不改变结论（两档对照）');
});

test('v3244 D5. 负控制工具两向自证：锚点不存在 / 不唯一 / 同值替换必须抛', () => {
    assert.throws(() => breakText(SCRIPT, 'THIS_ANCHOR_ABSENT_V3244', ''), /拒绝破坏/, '锚点不存在必须抛');
    assert.throws(() => breakText(SCRIPT, 'const ', ''), /拒绝破坏/, '多命中必须抛');
    assert.throws(() => breakText(SCRIPT, 'process.exit(0);', 'process.exit(0);'), /拒绝破坏/, '同值替换必须抛');
    assert.ok(SCRIPT.includes('function suggestCeiling('), '真源码里唯一算式在场（否则整组负控制是空的）');
    ok('工具两向自证通过');
});

/* ══════════ E. 判据面自防护与版本锚 ══════════ */
test('v3244 E1. 判据面自防护：断言密度与关键指纹不得缩水', () => {
    const asserts = (SELF.match(/assert\./g) || []).length;
    assert.ok(asserts >= 40, '本套件断言数 ' + asserts + ' 少于 40：判据被稀释');
    for (const fp of ['suggestCeiling', 'THIN_SLACK_RATIO', '--suggest', '余量将尽', '建议收紧到',
        '拒绝破坏', 'dead_code_budget.mjs']) {
        assert.ok(SELF.includes(fp), '关键指纹缺失：' + fp);
    }
    ok('断言 ' + asserts + ' 条，指纹齐全');
});

test('v3244 E2. 版本锚：本版不低于出生版本 3.244.0', () => {
    assert.ok(vnum(CUR) >= vnum('3.244.0'), '本版不得低于出生版本（CUR=' + CUR + '）');
    assert.ok(SELF.includes("vnum('3.244.0')"), '须显式留下出生版本锚');
});