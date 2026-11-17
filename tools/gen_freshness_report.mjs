#!/usr/bin/env node
/* ============================================================
 * tools/gen_freshness_report.mjs — 冻结读数新鲜度台账生成器 [L23-O9 · v3.474.0]
 * ------------------------------------------------------------
 * 【为什么要生成器】
 *   三态判定（fresh/stale/expired）如果只活在判据的断言里，台账就会靠手抄，
 *   而手抄的读数会静默漂。这里把「每份冻结读数现在是什么态」算一次、写一次，
 *   判据逐字节比对 —— 盘面一变（读数刷新、或某份又放老了），台账不改就红。
 *
 * 【口径】直接调 `tests/audit/_freshness_judge.mjs` 的 judgeFreshness，
 *   不在这里重算阈值（STALE_DAYS / EXPIRED_DAYS 只有一个真源）。
 *
 * 用法：node tools/gen_freshness_report.mjs [--check]
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeFreshness, refreshCommand, FROZEN_READINGS } from '../tests/audit/_freshness_judge.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests', 'audit', 'freshness_ledger.json');

export function buildFreshness(now = Date.now()) {
    const rows = [];
    for (const e of FROZEN_READINGS) {
        const abs = path.join(ROOT, e.rel);
        const exists = fs.existsSync(abs);
        let json = null;
        try { json = exists ? JSON.parse(fs.readFileSync(abs, 'utf8')) : null; } catch { json = null; }
        const v = judgeFreshness(json, now);
        rows.push({
            rel: e.rel,
            producer: e.producer,
            producer_verified: !!e.producer_verified,
            state: exists ? v.state : 'missing',
            ageDays: v.ageDays === null ? null : Math.floor(v.ageDays),
            why: exists ? v.why : '文件不在盘上',
            refresh: refreshCommand(e.producer),
        });
    }
    const counts = rows.reduce((a, r) => { a[r.state] = (a[r.state] || 0) + 1; return a; }, {});
    return {
        file: 'tests/audit/freshness_ledger.json',
        generator: 'tools/gen_freshness_report.mjs（由它写；判据 --check 逐字节比对，手改即红）',
        note: 'L23-O9 冻结读数新鲜度台账。三态口径来自 tests/audit/_freshness_judge.mjs（阈值单一真源）。'
            + '`ageDays` 是整岁天数；版本式时间戳（measured_at）按该版本提交日计龄。'
            + 'expired 的读数**不得再作依据**，refresh 一列给出可复制的刷新命令。',
        judged_at: new Date(now).toISOString(),
        counts,
        rows,
    };
}

function main() {
    const check = process.argv.includes('--check');
    const built = buildFreshness();
    const json = JSON.stringify(built, null, 2) + '\n';
    if (check) {
        /* 比对「判断结论」，不比对 judged_at：那是**这次跑的时钟**，每次都不一样。
         *   若把它算进相等性，这条自检就永远是红的 —— 一条永远红的自检等于没有自检。 */
        if (!fs.existsSync(OUT)) { console.error('[freshness] 台账不存在 —— 先跑 node tools/gen_freshness_report.mjs'); process.exit(1); }
        let cur = null;
        try { cur = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { cur = null; }
        if (!cur) { console.error('[freshness] 台账不是合法 JSON'); process.exit(1); }
        const same = JSON.stringify(cur.counts) === JSON.stringify(built.counts)
            && JSON.stringify(cur.rows) === JSON.stringify(built.rows);
        if (!same) {
            console.error('[freshness] 台账与现场不一致（判读变了：读数刷新 / 被改态 / 手改过）—— 重跑 node tools/gen_freshness_report.mjs');
            process.exit(1);
        }
        console.log('[freshness] 台账与现场一致：' + JSON.stringify(built.counts));
        return;
    }
    fs.writeFileSync(OUT, json, 'utf8');
    console.log('[freshness] 已写 ' + built.rows.length + ' 份读数：' + JSON.stringify(built.counts));
    for (const r of built.rows) {
        if (r.state !== 'fresh') console.log('  ' + r.state + '  ' + r.rel + '  ' + (r.ageDays === null ? '（无时间戳）' : r.ageDays + ' 天'));
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();