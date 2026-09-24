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
 *   node tests/audit/dead_code_budget.mjs --bump --reason='...'
 *        把上界抬到「实测总量」并把余量留给下一次：ceiling = measured + maxSlack。
 *        必须给 --reason，且会写进 JSON 的 note —— 抬升要留理由，这是本落法存在的意义。
 *
 * 退出码：0 正常；2 fail-closed（预算文件缺/坏、或 --bump 缺理由）。
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
    const bumpAt = args.indexOf('--bump');
    if (bumpAt >= 0) {
        const rAt = args.findIndex((a) => a.startsWith('--reason'));
        const reason = rAt >= 0 ? (args[rAt].includes('=') ? args[rAt].split('=').slice(1).join('=') : args[rAt + 1] || '') : '';
        if (!reason.trim()) failClosed('--bump 必须给 --reason（抬升要留理由，否则就是本落法要治的「手抬」）');
        const next = m.total + b.maxSlack;
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
    if (m.total >= b.ceiling) {
        console.log('  ⚠ 已越过上界：请先判断是活跃功能增长（--bump + 理由）还是死代码回流（删掉它）');
        process.exit(1);
    }
    if (slack > b.maxSlack) {
        console.log('  ⚠ 余量过大（' + slack + ' > ' + b.maxSlack + '）：上界与实测脱节，等于没守');
        process.exit(1);
    }
    process.exit(0);
}
