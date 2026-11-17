// tests/l23_o9_frozen_freshness_all.test.mjs — L23-O9：冻结读数新鲜度三态（全量覆盖）[v3.474.0]
//
// 计划原文：「冻读取新鲜度三态（fresh/stale/expired），过期给刷新命令，缺时间戳一律判 expired」。
//
// 修前的两个真缺陷（都由「读数自己」露出来，不是凭感觉）：
//   ① **覆盖面**：三态判定早就有了，但登记表只有 **2** 条（realhost / loading），
//      而盘上带时间戳的 `tests/audit/*.json` 有 **10** 份 ⇒ 另外 8 份**没有任何新鲜度门**。
//   ② **解析器一直在撒谎**：版本式时间戳（`measured_at: v3.431.0`）靠
//      `git log -S measured_at v3.431.0 -- <file>` 取提交时间，可本仓**没有逐版本 git tag**
//      （`fatal: bad revision 'v3.431.0'`）⇒ 这条路径对这 7 份**从来没成功过**，
//      全都落到 null 并被报成「缺时间戳 ⇒ expired」。
//      实际它们不是没写时间，是**解析器找不到**：修好后实测 4 份是 `stale`（42～52 天），
//      不是 `expired`。⇒ 「说了却查不到」与「根本没写」必须两个 why（结论同为 expired，原因不同形）。
//
// 口径纪律：阈值（STALE_DAYS/EXPIRED_DAYS）与判定一律来自 `tests/audit/_freshness_judge.mjs`，
//   台账一律由 `tools/gen_freshness_report.mjs` 写（本档只读、只复验，不重算阈值）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    judgeFreshness, parseTimestamp, refreshCommand, FROZEN_READINGS, STALE_DAYS, EXPIRED_DAYS,
} from './audit/_freshness_judge.mjs';
import { buildFreshness } from '../tools/gen_freshness_report.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIT = path.join(ROOT, 'tests', 'audit');
const LEDGER_PATH = path.join(AUDIT, 'freshness_ledger.json');
const DAY = 86400000;
const LEDGER = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
const NOW = Date.parse(LEDGER.judged_at);

test('A1 覆盖齐：盘上每一份带时间戳的检查读数都在登记表里（10/10），且生产者文件都在盘', () => {
    const stampKeys = ['generatedAt', 'generated_at', 'measured_at'];
    const onDisk = [];
    for (const name of fs.readdirSync(AUDIT)) {
        if (!name.endsWith('.json')) continue;
        let j = null;
        try { j = JSON.parse(fs.readFileSync(path.join(AUDIT, name), 'utf8')); } catch { continue; }
        if (!j || typeof j !== 'object' || Array.isArray(j)) continue;
        if (stampKeys.some((k) => typeof j[k] === 'string' && j[k].trim())) onDisk.push('tests/audit/' + name);
    }
    const registered = FROZEN_READINGS.map((e) => e.rel);
    const missing = onDisk.filter((r) => !registered.includes(r));
    assert.deepEqual(missing, [], '这些带时间戳的读数没有新鲜度门（谁把它当现行读都没人管）：' + missing.join(', '));
    for (const e of FROZEN_READINGS) {
        assert.ok(fs.existsSync(path.join(ROOT, e.rel)), e.rel + ' 必须在盘');
        assert.ok(fs.existsSync(path.join(ROOT, e.producer)), e.rel + ' 的生产者 ' + e.producer + ' 必须在盘');
    }
    assert.equal(FROZEN_READINGS.length, 10, '登记份数应等于实测 10（盘面变了就同步这张表）');
});

test('A2 三态各答各的：每份判定必是三态之一；expired 必须给可复制刷新命令', () => {
    let expired = 0;
    for (const e of FROZEN_READINGS) {
        const j = JSON.parse(fs.readFileSync(path.join(ROOT, e.rel), 'utf8'));
        const v = judgeFreshness(j, NOW);
        assert.ok(['fresh', 'stale', 'expired'].includes(v.state), e.rel + ' 判定越界：' + v.state);
        assert.ok(Number.isFinite(v.ageDays), e.rel + ' 判定必须回报年龄（否则三态没法复核）');
        if (v.state === 'expired') {
            const cmd = refreshCommand(e.producer);
            assert.match(cmd, /^node /, 'expired 必须给可复制刷新命令，got ' + cmd);
            expired += 1;
        }
    }
    assert.ok(expired >= 0);
});

test('A3 同义键名：`generated_at`（snake）必须当成时间戳读（修前它被报成「缺时间戳」）', () => {
    const now = Date.now();
    const snake = { generated_at: new Date(now - 2 * DAY).toISOString() };
    assert.ok(Number.isFinite(parseTimestamp(snake)), '`generated_at` 必须能解析出时间戳');
    assert.equal(judgeFreshness(snake, now).state, 'fresh', '2 天前的 snake 时间戳必须判 fresh');
    assert.equal(judgeFreshness({ generated_at: 'not-a-date' }, now).state, 'expired', '坏值仍要 fail-closed');
    const both = { generatedAt: new Date(now - 1 * DAY).toISOString(), generated_at: new Date(now - 200 * DAY).toISOString() };
    assert.equal(judgeFreshness(both, now).state, 'fresh', '两个键都在时按 camel 优先，不许取更老的那个当结论');
});

test('A4 版本式时间戳：「找不到提交」与「没写时间」必须是两个 why（结论同为 expired）', () => {
    const resolvable = judgeFreshness({ measured_at: 'v3.472.0', _self_path: 'tests/audit/host_beast_baseline.json' }, NOW);
    assert.ok(Number.isFinite(resolvable.ageDays), 'v3.472.0 必须能解析到提交（修前一律解析失败）');
    assert.ok(!/缺时间戳/.test(resolvable.why), '能解析的读数不许被报成「缺时间戳」');
    const unresolvable = judgeFreshness({ measured_at: 'v9.9.9', _self_path: 'tests/audit/host_beast_baseline.json' }, NOW);
    assert.equal(unresolvable.state, 'expired', '查不到提交仍要 fail-closed 成 expired');
    assert.match(unresolvable.why, /解析不到对应提交/, '必须点名「说了却查不到」，实：' + unresolvable.why);
    assert.ok(!/缺时间戳/.test(unresolvable.why), '「说了却查不到」不许与「根本没写」同形');
});

test('B1 缺时间戳一律 expired（fail-closed 不许放宽）', () => {
    for (const j of [{}, { generatedAt: 'x' }, { measured_at: 'nope' }, null, { foo: 1 }]) {
        assert.equal(judgeFreshness(j, NOW).state, 'expired', '缺时间戳必须 expired：' + JSON.stringify(j));
    }
});

test('B2 生产者可信度必须分开登记：未验证的条目要写清「没验过什么」', () => {
    for (const e of FROZEN_READINGS) {
        if (e.producer_verified) continue;
        assert.ok(typeof e.why_unverified === 'string' && e.why_unverified.length >= 20,
            e.rel + ' 标了未验证就必须写清没验过什么（不许用「大概能重生」糊过去）');
    }
    assert.ok(FROZEN_READINGS.some((e) => e.producer_verified === true), '至少要有实测验证过的生产者');
    assert.ok(FROZEN_READINGS.some((e) => e.producer_verified === false), '未验证的条目也要如实留着（不许删掉装作都验过）');
});

test('C1 台账与现场逐字节同源：用台账自己的 judged_at 重算必须完全一致（手改即红）', () => {
    const rebuilt = buildFreshness(NOW);
    assert.deepEqual(rebuilt.counts, LEDGER.counts, '三态计数与重算不一致（谁把某份改成了别的态？）');
    assert.deepEqual(rebuilt.rows, LEDGER.rows, '逐行读数与重算不一致 —— 台账必须由生成器写，不许手抄');
    assert.match(String(LEDGER.generator || ''), /gen_freshness_report/, '台账必须写明它由生成器写');
});

test('C2 生成器 --check 必须绿（「台账没漂」的可执行判据，不靠人记得重跑）', async () => {
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync('node', ['tools/gen_freshness_report.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
    assert.match(out, /台账与现场一致/, '生成器自检必须通过，got ' + out.trim());
});

test('D1 负控制：阈值真的在起作用 —— 把 staleDays/expiredDays 放大后同一份读数必须改判 fresh', () => {
    const old = { measured_at: 'v3.226.0', _self_path: 'tests/audit/gate_timing_baseline.json' };
    const real = judgeFreshness(old, NOW);
    assert.notEqual(real.state, 'fresh', '这份读数现在不该是 fresh（它是 42～52 天前的）');
    const loose = judgeFreshness(old, NOW, { staleDays: 100000, expiredDays: 200000 });
    assert.equal(loose.state, 'fresh', '把阈值放到极大还判非 fresh ⇒ 三态没读阈值');
});

test('D2 负控制：阈值单一真源 —— 本档不许自带一份 STALE_DAYS/EXPIRED_DAYS', () => {
    const self = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
    assert.ok(!/const\s+STALE_DAYS\s*=/.test(self), '判据里不许重定义 STALE_DAYS（同一事实两处实现即第二真源）');
    assert.ok(!/const\s+EXPIRED_DAYS\s*=/.test(self), '判据里不许重定义 EXPIRED_DAYS');
    assert.equal(STALE_DAYS, 30, '阈值真源变了就必须同步本档期望');
    assert.equal(EXPIRED_DAYS, 90, '阈值真源变了就必须同步本档期望');
});

test('E1 出生锚：本档不早于 v3.474.0（数值数组比较）', () => {
    const BIRTH = [3, 474, 0];
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const cur = String(pkg.version).split('.').map((x) => Number(x));
    const cmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
    assert.ok(cmp(cur, BIRTH) >= 0, '本档不早于其出生版本，实：' + pkg.version);
});