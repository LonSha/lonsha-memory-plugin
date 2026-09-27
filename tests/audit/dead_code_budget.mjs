#!/usr/bin/env node
/**
 * dead_code_budget.mjs — T3 落法（死代码行数上界的唯一真源导出口）
 *
 * 背景（TODO T3）：v3116 的「活跃代码总量」判据把上界写成字面量（v3.202.0 手抬
 *   32450 → 32700）。上界本身是对的（不给死代码留余量），但「手抬」有漏改风险：
 *   余量用尽时，新增一个普通模块就翻红，而翻红的信息量只有「数字不够大」。
 *
 * 本脚本不是一个独立的通过/阻断判据，而是**上界的唯一真源**：它把「实测总量」与
 *   「登记的上界」放在一处读数，供 v3116 的判据 import。
 *
 * 用法：
 *   node tests/audit/dead_code_budget.mjs                读数（不写盘）
 *   node tests/audit/dead_code_budget.mjs --suggest      只打「建议抬升值」（机器可读，不写盘）
 *   node tests/audit/dead_code_budget.mjs --bump --reason='...'
 *        把上界抬到「实测总量」并把余量留给下一次：ceiling = measured + maxSlack。
 *        必须给 --reason，且会写进 JSON 的 note —— 抬升要留理由，这是本落法存在的意义。
 *
 * [v3.244.0] 建议面：翻红的信息量此前只有「数字不够大」——「该改成多少」得自己算，
 *   而算式与 --bump 的算式是**两处**（一处手算一处代码）。本版把算式抽成唯一导出
 *   `suggestCeiling(m, b)`，读数、--suggest、翻红三条路共用它，并直接给出可复制的命令。
 *   三种情形各有预告：余量过大（须手改收紧）/ 已越界 / 余量将尽（下次增长即翻红）。
 *
 * 退出码：0 = 卫生（在预算内）  1 = 真缺陷（**越界**：实测超出 ceiling 或余量脱节）  2 = 结构漂移（预算文件缺/坏、--bump 缺理由、fail-closed）。
 * [v3.247.0 留痕] 上一版自述只写「0 正常；2 fail-closed」，而代码里 `process.exit(1)` 是越界路径 ——
 *   自述漏了一整态，读者按注释理解会以为「越界也退 2」。
 *
 * 本脚本版本无关：体内不出现任何 3.x.y 字面量。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const BUDGET = path.join(HERE, 'dead_code_budget.json');

function failClosed(msg) {
    console.error('[dead-code-budget] ' + msg);
    process.exit(2);
}

/** 活跃代码总量 = 根目录所有 .js（入口 + manifest 声明的模块）的行数之和 */
export function measureActiveLines(root = ROOT) {
    let mf;
    try { mf = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf-8')); }
    catch (e) { failClosed('读不到/坏掉的 manifest.json：' + e.message); }
    const allJs = fs.readdirSync(root).filter((f) => f.endsWith('.js')).sort();
    let total = 0;
    for (const f of allJs) total += fs.readFileSync(path.join(root, f), 'utf-8').split('\n').length;
    return { total, files: allJs.length, declared: 1 + ((mf.extra_js || []).length) };
}

/** 余量「将尽」的判据：低于 maxSlack 的一半就提前预告 —— 下次功能增长即会翻红。 */
export const THIN_SLACK_RATIO = 0.5;

/**
 * [v3.244.0] **唯一的抬升算式**：建议上界 = 实测总量 + maxSlack。
 *
 * 为什么单列成导出纯函数：`--bump` 用这个算式写盘，读数的「建议」用它做展示，
 *   `--suggest` 用它输出机器可读的一行 —— 三处若各写一遍，就是本仓治过的
 *   「一份契约 N 份拷贝」（改一处漏两处，判据在不同面上语义漂移）。
 *   `delta` 是「相对当前登记上界的差」：正数=该抬、负数=该收紧（收紧只能手改，
 *   因为 --bump 只抬不降）。本函数不写盘、不抛、不读环境 —— 纯算术，可被测试直接钉。
 */
export function suggestCeiling(m, b) {
    const ceiling = m.total + b.maxSlack;
    return {
        ceiling,                       // 建议登记的上界
        delta: ceiling - b.ceiling,    // 相对当前登记的差（>0 抬 / <0 收紧）
        measured: m.total,
        maxSlack: b.maxSlack,
    };
}

export function readBudget() {
    let b;
    try { b = JSON.parse(fs.readFileSync(BUDGET, 'utf-8')); }
    catch (e) { failClosed('读不到/坏掉的 dead_code_budget.json：' + e.message); }
    if (typeof b.ceiling !== 'number' || !Number.isFinite(b.ceiling)) failClosed('ceiling 不是数字');
    if (typeof b.maxSlack !== 'number' || !Number.isFinite(b.maxSlack)) failClosed('maxSlack 不是数字');
    return b;
}

/* 仅在被直接执行时跑 CLI 分支；被 import 时不跑。 */
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
    const b = readBudget();
    const m = measureActiveLines();
    const slack = b.ceiling - m.total;
    const args = process.argv.slice(2);
    const sug = suggestCeiling(m, b);
    const bumpAt = args.indexOf('--bump');
    if (bumpAt >= 0) {
        const rAt = args.findIndex((a) => a.startsWith('--reason'));
        const reason = rAt >= 0 ? (args[rAt].includes('=') ? args[rAt].split('=').slice(1).join('=') : args[rAt + 1] || '') : '';
        if (!reason.trim()) failClosed('--bump 必须给 --reason（抬升要留理由，否则就是本落法要治的「手抬」）');
        /* [v3.244.0] 算式只有一处：`sug.ceiling` 来自 `suggestCeiling(m, b)`。
         *   本行原文自己写了一遍 `m.total + b.maxSlack` —— 而读数/--suggest 面也要用同一个
         *   算式，于是「一份算式两处代码」。判据 tests/v3244 A2 当场把它抓红（首跑实况）。 */
        const next = sug.ceiling;
        // bump 只会**抬升**：往下调不是「抬升」，那是把已完成的历史改写掉。
        //   想收紧上界（实测降了）→ 手改 JSON 的 ceiling 并说明，不走 --bump。
        if (next <= b.ceiling) failClosed('--bump 只抬不降（当前 ' + b.ceiling + '，算出 ' + next + '）；'
            + '实测已回落时请手改 ceiling，并在 note 里写明为什么可以收紧');
        const hist = Array.isArray(b.history) ? b.history.slice() : [];
        hist.push({ ceiling: next, reason: reason.trim() });
        const out = {
            ...b,
            ceiling: next,
            note: reason.trim(),
            history: hist,
            _history_last: 'ceiling ' + b.ceiling + ' → ' + next + '（实测 ' + m.total + ' + slack ' + b.maxSlack + '）：' + reason.trim(),
        };
        fs.writeFileSync(BUDGET, JSON.stringify(out, null, 2) + '\n');
        console.log('[dead-code-budget] ceiling ' + b.ceiling + ' → ' + next + '（实测 ' + m.total + '）');
        process.exit(0);
    }
    console.log('活跃代码 ' + m.files + ' 文件（声明 ' + m.declared + '） / 实测 ' + m.total + ' 行');
    console.log('登记上界 ' + b.ceiling + ' 行（余量 ' + slack + '，上限 maxSlack=' + b.maxSlack + '）');
    /* [v3.244.0] --suggest：只打建议，机器可读（供脚本/看板消费）。不写盘、恒 exit 0。 */
    if (args.includes('--suggest')) {
        console.log('建议上界 ' + sug.ceiling + ' 行（= 实测 ' + sug.measured + ' + slack ' + sug.maxSlack + '）'
            + ' | 相对当前 ' + (sug.delta >= 0 ? '+' : '') + sug.delta);
        process.exit(0);
    }
    if (m.total >= b.ceiling) {
        console.log('  ⚠ 已越过上界：请先判断是活跃功能增长（--bump + 理由）还是死代码回流（删掉它）');
        console.log('  → 若属功能增长：node tests/audit/dead_code_budget.mjs --bump --reason=\'…\''
            + ' ⇒ ceiling = ' + sug.ceiling + '（+ ' + sug.delta + '）');
        process.exit(1);
    }
    if (slack > b.maxSlack) {
        console.log('  ⚠ 余量过大（' + slack + ' > ' + b.maxSlack + '）：上界与实测脱节，等于没守');
        console.log('  → 建议收紧到 ' + sug.ceiling + '（' + sug.delta + '）：'
            + '--bump 只抬不降，须手改 JSON 的 ceiling 并在 note 写明为什么可以收紧');
        process.exit(1);
    }
    const thinAt = b.maxSlack * THIN_SLACK_RATIO;
    if (slack < thinAt) {
        console.log('  · 余量将尽（' + slack + ' < ' + thinAt + '）：下一次活跃功能增长就会翻红');
        console.log('  → 预告：--bump 之后 ceiling = ' + sug.ceiling + '（+ ' + sug.delta + '）');
    }
    process.exit(0);
}
