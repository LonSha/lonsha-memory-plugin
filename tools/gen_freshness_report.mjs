#!/usr/bin/env node
/* ============================================================
 * tools/gen_freshness_report.mjs — 冻结读数新鲜度台账生成器 [L23-O9 · v3.474.0]
 * ------------------------------------------------------------
 * 【为什么要生成器】
 *   三态判定（fresh/stale/expired）如果只活在判据的断言里，台账就会靠手抄，
 *   而手抄的读数会静默漂。这里把「每份冻结读数现在是什么态」算一次、写一次，
 *   判据按**判读结论**比对 —— 盘面一变（读数刷新、或某份又放老了），台账不改就红。
 *
 * 【比对口径 · L23-O9b】`--check` 比的是 state / why 的措辞（数字已掩码）/ 登记项 / counts；
 *   `ageDays` 与 `judged_at` 是**时钟字段**，不参与相等性 —— 否则每条读数都会在它自己的
 *   周年时刻把自检翻红一次，一条按时钟必红的自检等于没有自检。手改防护由判据 C1 承担
 *   （它用台账自己的 judged_at 对 rows 做全字段深度比对，任何字段被手改都红）。
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
        generator: 'tools/gen_freshness_report.mjs（由它写；判据 --check 按判读结论比对，ageDays/judged_at 属时钟字段不参与，手改由 C1 全字段深度比对照看）',
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
        /* [L23-O9b] 逐字节比对 rows 是**按时钟必然红**的口径，必须收窄到判读结论：
         *   `ageDays` 是 floor(已过天数)，`why` 里又嵌着同一个整岁 —— 两者对「台账有没有
         *   被手改」零信息量，却让每条读数在它自己的周年时刻把自检翻红一次（10 份读数
         *   ≈ 每天 10 个红点；实测同一份台账在 23 分钟内就因 3 行 0→1 而红）。
         *   ⇒ 这里只比：state（换档要红）、why 去掉数字后的措辞（原因分类要红）、
         *     rel/producer/producer_verified/refresh（登记表要红）、counts（分布要红）。
         *   手改防护没有因此变弱：C1 用台账自己的 judged_at 对 rows 做全字段深度比对，
         *   任何字段（含 ageDays / why 原文）被手改都红；此处的职责只是「读数变老了」。
         *   两者分工后：手改 → C1 红；读数换档 → 此处红；仅仅过了零点 → 都不红。 */
        const verdictKey = (r) => JSON.stringify({
            rel: r.rel,
            producer: r.producer,
            producer_verified: r.producer_verified,
            state: r.state,
            refresh: r.refresh,
            why: String(r.why).replace(/\d+/g, '#'),
        });
        const same = JSON.stringify(cur.counts) === JSON.stringify(built.counts)
            && JSON.stringify((cur.rows || []).map(verdictKey)) === JSON.stringify(built.rows.map(verdictKey));
        if (!same) {
            const curKeys = (cur.rows || []).map(verdictKey);
            const newKeys = built.rows.map(verdictKey);
            const drift = built.rows
                .filter((r, i) => curKeys[i] !== newKeys[i])
                .map((r) => r.rel + '（现场 ' + r.state + '，台账 ' + ((cur.rows || [])[i] || {}).state + '）');
            console.error('[freshness] 台账与现场不一致（判读变了：读数刷新 / 被改态 / 手改过）'
                + (drift.length ? ' —— 差异：' + drift.join('、') : '') + ' —— 重跑 node tools/gen_freshness_report.mjs');
            process.exit(1);
        }
        console.log('[freshness] 台账与现场一致（比对口径：判读结论；ageDays/judged_at 属时钟字段不参与）：'
            + JSON.stringify(built.counts));
        return;
    }
    fs.writeFileSync(OUT, json, 'utf8');
    console.log('[freshness] 已写 ' + built.rows.length + ' 份读数：' + JSON.stringify(built.counts));
    for (const r of built.rows) {
        if (r.state !== 'fresh') console.log('  ' + r.state + '  ' + r.rel + '  ' + (r.ageDays === null ? '（无时间戳）' : r.ageDays + ' 天'));
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();