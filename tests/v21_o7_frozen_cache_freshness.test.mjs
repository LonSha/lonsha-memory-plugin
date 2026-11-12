// tests/v21_o7_frozen_cache_freshness.test.mjs — 冻结读数新鲜度三态门 [L21-O7 · v3.465.2]
//   判定体 tests/audit/_freshness_judge.mjs 纯函数化（不读盘的部分无 side-effect）；
//   本判据只回答一个问题：「盘上的冻结读数，现在还能不能当现行事实读？」
//   三态 fresh / stale / expired 各答各的，不许合成一个布尔。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeFreshness, parseTimestamp, refreshCommand, READING_PRODUCERS } from './audit/_freshness_judge.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 86400000;
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok ' + m); };
const bad = (m) => { fail++; console.error('  xx ' + m); };

// ── A1 真盘读数逐份判定 ──
test('v21_o7 A1. 两条 ISO 冻结读数在真盘上判定且生成器登记在案', () => {
    for (const [rel, producer] of Object.entries(READING_PRODUCERS)) {
        assert.ok(fs.existsSync(path.join(ROOT, rel)), rel + ' 必须在盘');
        assert.ok(fs.existsSync(path.join(ROOT, producer)), rel + ' 的生成器 ' + producer + ' 必须在盘');
        const j = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
        const v = judgeFreshness(j);
        assert.ok(['fresh', 'stale', 'expired'].includes(v.state), rel + ' 判定必须是三态之一，got ' + v.state);
        if (v.state === 'expired') {
            const cmd = refreshCommand(producer);
            assert.ok(cmd.startsWith('node tests/'), 'expired 必须给可复制刷新命令，got ' + cmd);
            console.log('  note ' + rel + ' 已过期 ⇒ 刷新命令：' + cmd);
        } else {
            ok(rel + ' → ' + v.state + '（' + v.why + '）');
        }
    }
});

// ── B1 三态各可造（改 generatedAt 造假时间；口径①）──
test('v21_o7 B1. fresh / stale / expired 三态各可造', () => {
    const now = Date.now();
    assert.equal(judgeFreshness({ generatedAt: new Date(now - 3 * DAY).toISOString() }, now).state, 'fresh');
    assert.equal(judgeFreshness({ generatedAt: new Date(now - 60 * DAY).toISOString() }, now).state, 'stale');
    assert.equal(judgeFreshness({ generatedAt: new Date(now - 120 * DAY).toISOString() }, now).state, 'expired');
    ok('三态各可造（3 / 60 / 120 天）');
});

// ── B2 expired 必须红且给可复制刷新命令（口径②）──
test('v21_o7 B2. expired 红路径给可复制刷新命令', () => {
    const v = judgeFreshness({ generatedAt: new Date(Date.now() - 120 * DAY).toISOString() });
    assert.equal(v.state, 'expired');
    const cmd = refreshCommand(READING_PRODUCERS['tests/audit/realhost_readings.json']);
    assert.match(cmd, /^node tests\//);
    ok('expired 判红且刷新命令 = ' + cmd);
});

// ── B3 fail-closed：缺时间戳 ⇒ expired ──
test('v21_o7 B3. 缺时间戳 fail-closed 判 expired', () => {
    assert.equal(judgeFreshness({}).state, 'expired');
    assert.equal(judgeFreshness({ generatedAt: 'not-a-date' }).state, 'expired');
    assert.equal(parseTimestamp(null), null);
    ok('缺时间戳 / 坏时间戳 / 空对象全部 fail-closed');
});

// ── N1 负控制：把 ageDays 计算改成恒 0 ⇒ 三态归一为 fresh，判据必须当场翻红 ──
test('v21_o7 N1. 负控制·ageDays 恒 0 ⇒ 三态归一必须被识破', async () => {
    const judgePath = path.join(ROOT, 'tests', 'audit', '_freshness_judge.mjs');
    const src = fs.readFileSync(judgePath, 'utf8');
    const anchor = 'const ageDays = Math.max(0, (now - ts) / DAY_MS);';
    assert.equal(src.split(anchor).length - 1, 1, 'ageDays 计算行必须恰中 1 次（锚点纪律）');
    const broken = src.replace(anchor, 'const ageDays = 0;');
    const tmp = path.join(ROOT, 'tests', 'audit', '_freshness_judge__nc1.mjs');
    fs.writeFileSync(tmp, broken);
    try {
        const m = await import('./audit/_freshness_judge__nc1.mjs?nc=1');
        const now = Date.now();
        const states = [120, 60, 3].map((d) => m.judgeFreshness({ generatedAt: new Date(now - d * DAY).toISOString() }, now).state);
        assert.deepEqual(states, ['fresh', 'fresh', 'fresh'],
            '破坏后必须呈现三态归一形态（这正是要防的假绿）');
    } finally {
        fs.rmSync(tmp, { force: true });
    }
    // 破坏形态已复现 ⇒ 说明判据的 B1 三态断言正是拦住它的那道门
    ok('N1 破坏可复现且由 B1 三态断言拦截（ageDays 恒 0 ⇒ 全 fresh ⇒ B1 必红）');
});