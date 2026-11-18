/* tools/gen-recall-gate-baseline.mjs — R25-O1 重切召回质量基准
 *
 * 为什么要工具：基准是**数据不是代码**，但数据不能手抄（手抄会把「当前就是对的」
 * 变成「谁手快谁说得算」）。本工具只做一件事：跑同一个金标集、同一个判据口径，
 * 把 gate.snapshot() 的结果写成 data/golden-recall-baseline.json。
 *
 * 用法：node tools/gen-recall-gate-baseline.mjs [--check]
 *   --check 只对比不写盘；不一致则退出码 1（CI 里用这个）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const gate = require(path.join(ROOT, 'recall-quality-gate.js'));
const bench = require(path.join(ROOT, 'recall-quality-bench.js'));

const SET = path.join(ROOT, 'data', 'golden-recall-set.json');
const BASE = path.join(ROOT, 'data', 'golden-recall-baseline.json');
const K = 5;
const ROUTES = ['lex', 'ngram'];

const set = JSON.parse(fs.readFileSync(SET, 'utf8'));
const result = bench.runSet(set, { k: K, routes: ROUTES });
const snap = gate.snapshot(result, { set: 'golden-recall-set.json' });
const text = JSON.stringify(snap, null, 2) + '\n';

const check = process.argv.includes('--check');
if (check) {
    const cur = fs.existsSync(BASE) ? fs.readFileSync(BASE, 'utf8') : '';
    if (cur !== text) {
        console.error('[recall-gate] 基准与磁盘不一致：请跑 node tools/gen-recall-gate-baseline.mjs 并复核 delta');
        process.exit(1);
    }
    console.log('[recall-gate] 基准与磁盘一致（k=' + K + ' routes=' + ROUTES.join('+') + '）');
} else {
    fs.writeFileSync(BASE, text);
    console.log('[recall-gate] 已写 ' + path.relative(ROOT, BASE)
        + ' ⇒ recallAtK=' + snap.metrics.recallAtK + ' mrr=' + snap.metrics.mrr
        + ' falseRecall=' + snap.metrics.falseRecall + ' groups=' + Object.keys(snap.groups).length);
}
