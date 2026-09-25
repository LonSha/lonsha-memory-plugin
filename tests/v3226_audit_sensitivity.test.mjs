// tests/v3226_audit_sensitivity.test.mjs — 审计扫描器灵敏度体检（O-3）[v3.225.0]
//   主题：**审计的审计**。本仓审计目录里有 29 个扫描器 + 13 个负控制；扫描器负责「判缺陷」，
//   而「扫描器自己还有没有判的能力」此前只在**测试侧**散点验过：
//     · v3159 [2b] 只覆盖 3 个扫描器（scan_resilience / scan_wiring / scan_config_liveness）；
//     · v3177 的 C7 是测试里的一条断言（默认根上 index.js 要出现在清单里）—— 判据在测试里，不在门上。
//
//   本轮把这件事立成「表 + 判据」：
//     tests/audit/audit_scan_probe_matrix.tsv 是「扫描器 × 退化形态 → 实测退出码」的登记表，
//     本套件常驻校验它（结构 / 双向齐全 / H 列全 0 / G、T 至少一列非 0）。
//
//   为什么值得一张表：扫描器的输入面只有两类 —— 根 .js/.mjs 源码树、tests/ 目录。
//     ① H 列非 0：健康树上误红（假红，浪费人的注意力）；
//     ② G 与 T 都是 0：两类输入面都不敏感 ⇒ **恒绿探测器** —— 它永远通过，
//        而人以为有它守着。这比根本没有它更坏。
//
//   本轮实测到的**唯一真缺陷**（已修）：语法门 tests/audit/scan_syntax.mjs 在
//     「根目录 .js 全删 / 全掏空」时仍 exit 0，报「270 / 335 个文件均可解析」——
//     0 个源文件的世界里「都能解析」为真，但本门存在的唯一理由就是**入口文件**。
//     旧代码只有 `total === 0` 一道，而掏空根 .js 后 tests/ 树里仍有 200+ 个 .mjs，那道兜不住。
//     修法：默认根上补「入口在场 + 非退化」守卫（exit 2），显式 --root 的语义逐字不动。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const AUDIT = path.join(ROOT, 'tests', 'audit');
const TABLE = path.join(AUDIT, 'audit_scan_probe_matrix.tsv');
const GATE = path.join(AUDIT, 'scan_syntax.mjs');

const read = (p) => fs.readFileSync(p, 'utf8');
const tableText = read(TABLE);

/** 在役扫描器：与该目录下实际的 .mjs 面逐字对齐（排除 `_` 前缀辅助文件与 negctl 负控制）。 */
const inService = fs.readdirSync(AUDIT)
    .filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && !f.includes('negctl'))
    .sort();

/** 表行提取：[文件名, H, G, T, 判读]（# 开头与空行不算）。 */
function parseTable(text) {
    const rows = [];
    for (const line of text.split('\n')) {
        if (!line.trim() || line.trim().startsWith('#')) continue;
        const c = line.split('\t');
        if (c.length < 4) return { rows, bad: line };
        rows.push(c);
    }
    return { rows, bad: null };
}

/** J1 双向齐全：在役集合 == 登记集合（多一个退位项、少一个新增项都算红）。 */
function registryJudge(text, live) {
    const { rows, bad } = parseTable(text);
    if (bad) return false;
    const listed = rows.map((r) => r[0]).sort();
    if (rows.length !== new Set(listed).size) return false;   // 重号
    return listed.length === live.length && listed.every((x, i) => x === live[i]);
}

/** J2 H 列必须全 0：扫描器在健康树上不得误红。 */
function healthyJudge(text) {
    const { rows, bad } = parseTable(text);
    if (bad || !rows.length) return false;
    return rows.every((r) => Number(r[1]) === 0);
}

/** J3 每条都要有敏感性：G 或 T 至少一列非 0（两列都是 0 ⇒ 恒绿探测器）。 */
function sensitivityJudge(text) {
    const { rows, bad } = parseTable(text);
    if (bad || !rows.length) return false;
    return rows.every((r) => Number(r[2]) !== 0 || Number(r[3]) !== 0);
}

// ══════════ A 表本体 ══════════
test('v3226 A1. ★★ 灵敏度登记表在场且结构可解析（29 条扫描器 + 形态定义可复现）', () => {
    assert.ok(fs.existsSync(TABLE), '登记表必须在场：tests/audit/audit_scan_probe_matrix.tsv');
    const { rows, bad } = parseTable(tableText);
    assert.equal(bad, null, '每行必须有 >= 4 个制表符分隔的列：' + String(bad).slice(0, 80));
    assert.equal(rows.length, inService.length, '登记条数须等于在役扫描器数');
    assert.ok(rows.length >= 29, '本轮实测 29 条，实得 ' + rows.length + '（表被删减？）');
    for (const [s, h, g, t] of rows) {
        for (const [name, v] of [['H', h], ['G', g], ['T', t]]) {
            assert.ok(['0', '1', '2', 'TIMEOUT'].includes(v), s + ' 的 ' + name + ' 列取值非法：' + v);
        }
    }
    // 形态定义写在表头里（否则这张表不可复现，也无从判「H/G/T 是什么意思」）
    assert.ok(/H = 不改动/.test(tableText) && /G = 删掉镜像根目录全部 \.js/.test(tableText)
        && /gutted/.test(tableText), '表头须逐字写明三档形态，使表可复现');
});

// ══════════ B 双向齐全 ══════════
test('v3226 B1. ★★ 与在役扫描器双向齐全（新增不登记 ⇒ 红；残留退位项 ⇒ 红）', () => {
    assert.equal(registryJudge(tableText, inService), true, 'J1 在原件上必须为真');
    const listed = parseTable(tableText).rows.map((r) => r[0]);
    const missing = inService.filter((s) => !listed.includes(s));
    const extra = listed.filter((s) => !inService.includes(s));
    assert.deepEqual(missing, [], '在役但未登记（新扫描器必须登记，否则体检面悄悄变窄）');
    assert.deepEqual(extra, [], '登记了但不在役（退位项须一并从表里摘掉）');
});

test('v3226 B2. ★ 每个负控制的被测目标都在表内（负控制不得指向空）', () => {
    const negs = fs.readdirSync(AUDIT).filter((f) => f.includes('negctl') && f.endsWith('.mjs'));
    assert.ok(negs.length >= 13, '负控制面不应变窄，实得 ' + negs.length);
    const listed = parseTable(tableText).rows.map((r) => r[0]);
    for (const n of negs) {
        const src = read(path.join(AUDIT, n));
        // 负控制里写着自己的被测目标文件名（两种引用写法都认）
        const hit = listed.filter((s) => src.includes(s));
        assert.ok(hit.length >= 1, n + ' 的被测目标不在登记表内（负控制可能指向已改名的扫描器）');
    }
    // 反向：受负控制驱动的扫描器比例 —— 本轮实测 13/29，作为观察读数如实报出
    const driven = listed.filter((s) => negs.some((n) => read(path.join(AUDIT, n)).includes(s)));
    assert.ok(driven.length >= 13, '受负控制驱动的扫描器实得 ' + driven.length + '（<= 12 说明负控制被摘了）');
});

// ══════════ C 灵敏度 ══════════
test('v3226 C1. ★★ 健康树不得误红：H 列逐条为 0', () => {
    assert.equal(healthyJudge(tableText), true, 'J2 在原件上必须为真');
});

test('v3226 C2. ★★★ 没有恒绿探测器：G、T 至少一列非 0', () => {
    assert.equal(sensitivityJudge(tableText), true, 'J3 在原件上必须为真');
    const dead = parseTable(tableText).rows.filter((r) => Number(r[2]) === 0 && Number(r[3]) === 0).map((r) => r[0]);
    assert.deepEqual(dead, [], '两档退化都不敏感的扫描器就是恒绿探测器：' + dead.join(', '));
});

// ══════════ D 本轮真缺陷面：语法门的入口在场性 ══════════
// 用**最小镜像**（只建入口 + 门自身），驱动默认根与显式 --root 两条路径：
//   ① 默认根：入口不在场 / 退化 ⇒ 必须 exit 2（新守卫）；
//   ② 显式 --root：小树夹具语义逐字保留（C4/C5/C6 依赖它）。
function miniMirror(mut) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3226-gate-'));
    fs.mkdirSync(path.join(dir, 'tests', 'audit'), { recursive: true });
    fs.copyFileSync(GATE, path.join(dir, 'tests', 'audit', 'scan_syntax.mjs'));
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ name: 'mini', version: '1.0.0' }));
    fs.writeFileSync(path.join(dir, 'index.js'), 'export const entry = 1;\n' + '// pad\n'.repeat(200));
    if (mut) mut(dir);
    return dir;
}
const runGate = (dir, args) => spawnSync(process.execPath,
    [path.join(dir, 'tests', 'audit', 'scan_syntax.mjs'), ...(args || [])],
    { encoding: 'utf8', cwd: dir, timeout: 120000 });

async function withMini(mut, fn) {
    const dir = miniMirror(mut);
    try { return await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('v3226 D1. ★★ 默认根：入口在场且非退化 ⇒ exit 0（不得误红）', async () => {
    await withMini(null, async (dir) => {
        const r = runGate(dir);
        assert.equal(r.status, 0, '最小健康镜像上不得红：' + String(r.stderr || r.stdout).slice(0, 200));
    });
});

test('v3226 D2. ★★★ 默认根：入口被删 / 被掏空 ⇒ exit 2（修前报「均可解析」）', async () => {
    await withMini((d) => fs.rmSync(path.join(d, 'index.js')), async (dir) => {
        const r = runGate(dir);
        assert.equal(r.status, 2, '入口不在场时必须 exit 2（结构漂移），实得 ' + r.status);
        assert.match(String(r.stderr), /结构漂移|入口不在场|只为入口文件而存在/, '须如实说出「没得判」，而不是报通过');
    });
    await withMini((d) => fs.writeFileSync(path.join(d, 'index.js'), '// gutted\n'), async (dir) => {
        const r = runGate(dir);
        assert.equal(r.status, 2, '入口退化时必须 exit 2，实得 ' + r.status);
        assert.match(String(r.stderr), /输入退化|显式传 --root/, '须指出这是「没得判」并给出夹具通道');
    });
});

test('v3226 D3. ★★ 显式 --root 的语义逐字保留（负控制/等价性对照依赖它）', async () => {
    await withMini(null, async (dir) => {
        const small = fs.mkdtempSync(path.join(os.tmpdir(), 'v3226-sm-'));
        try {
            fs.writeFileSync(path.join(small, 'a.js'), 'export const a = 1;\n');
            assert.equal(runGate(dir, ['--root', small]).status, 0, '健康小树必须放行');
            fs.writeFileSync(path.join(small, 'b.js'), 'export const b = ;\n');
            assert.equal(runGate(dir, ['--root', small]).status, 1, '损坏小树必须 exit 1（真语法失败）');
            assert.equal(runGate(dir, ['--root', path.join(small, 'nope-xyz')]).status, 2, '不存在的路径必须 exit 2');
        } finally { fs.rmSync(small, { recursive: true, force: true }); }
    });
});

test('v3226 D4. ★★ 真仓默认根仍全绿（守卫不得把正常检出误伤）', () => {
    const r = spawnSync(process.execPath, [GATE], { encoding: 'utf8', cwd: ROOT, timeout: 120000 });
    assert.equal(r.status, 0, '真仓上语法门必须通过：' + String(r.stderr || r.stdout).slice(0, 200));
    assert.match(String(r.stdout), /语法门通过：\d+ 个文件/, '通过时必须给出覆盖面读数');
});

// ══════════ E 版本锚 ══════════
const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));

test('v3226 E1. ★ 版本锚（当版字面量，不随抬版漂移）', () => {
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
    const idx = read(path.join(ROOT, 'index.js'));
    const codeVer = (/const VERSION = '([^']+)'/.exec(idx) || [])[1];
    assert.ok(codeVer, '入口版本常量在场');
    assert.equal(vnum(codeVer), vnum('3.225.0'), '本套件只针 3.225.0 这一版；当前 ' + codeVer);
    assert.equal(pkg.version, codeVer);
});

// ══════════ F 负控制（真表破坏 ⇒ 同款真判据必须转红） ══════════
function mutateOnce(text, from, to) {
    const n = text.split(from).length - 1;
    assert.equal(n, 1, '锚点应恰好命中 1 次，实际 ' + n + '：' + String(from).slice(0, 60));
    return text.replace(from, to);
}

// 三条判据在原件上必须全真 —— 否则后面的「转红」可能是判据自己坏了（假红）
function allTrue(text, live) {
    return registryJudge(text, live) && healthyJudge(text) && sensitivityJudge(text);
}

test('v3226 N0. 阳性对照：未破坏时三条判据全真（否则 N 组是假红）', () => {
    assert.equal(allTrue(tableText, inService), true, '原件上三条判据必须全真');
});

test('v3226 N1. ★★ 负控制·健康树误红：把某行 H 改成 1 ⇒ J2 转红', () => {
    const broken = mutateOnce(tableText, 'scan_syntax.mjs\t0\t', 'scan_syntax.mjs\t1\t');
    assert.equal(healthyJudge(broken), false, 'H 列非 0 必须让 J2 转红');
    assert.equal(healthyJudge(tableText), true, '对照：原件上仍为真');
});

test('v3226 N2. ★★ 负控制·恒绿探测器：把某行 G、T 都改成 0 ⇒ J3 转红', () => {
    const broken = mutateOnce(tableText, 'scan_syntax.mjs\t0\t2\t0\t', 'scan_syntax.mjs\t0\t0\t0\t');
    assert.equal(sensitivityJudge(broken), false, '两档皆 0 必须让 J3 转红');
    assert.equal(sensitivityJudge(tableText), true, '对照：原件上仍为真');
});

test('v3226 N3. ★★★ 负控制·登记面变窄 / 长出退位项 ⇒ J1 双向都要转红', () => {
    // ① 在役扫描器里删掉一条登记（覆盖缺口）
    const lines = tableText.split('\n');
    const idx = lines.findIndex((l) => l.startsWith('scan_wiring.mjs\t'));
    assert.ok(idx > 0, '锚点行在场');
    const dropped = lines.slice(0, idx).concat(lines.slice(idx + 1)).join('\n');
    assert.equal(registryJudge(dropped, inService), false, '少登记一条必须转红（缺口）');
    // ② 登记表里多一条不在役的扫描器（退位项）
    const extra = tableText.replace(/\n$/, '\nscan_v9999_ghost.mjs\t0\t2\t0\t幽灵\n');
    assert.equal(registryJudge(extra, inService), false, '多一条不在役项必须转红（残留）');
    assert.equal(registryJudge(tableText, inService), true, '对照：原件上仍为真');
});
