// tests/v21_o8_write_only_scan.test.mjs — 「写了不读」反向扫描判据 [L21-O8 · v3.465.2]
//   口径：① 扫描器两向自证（只写不读必抓 / 写且读不许误杀）；② 真盘欠账逐条有登记理由；
//   ③ 已知误报形态各有夹具 —— 防扫描器靠排除项把真缺陷也排掉。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { scanRepo } from '../tools/scan_write_only_fields.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 造一个最小镜像树跑扫描（真源码破坏自证纪律：夹具写在盘上，不写死常量）。 */
function scratch(files) {
    const t = fs.mkdtempSync(path.join(os.tmpdir(), 'wo-scan-'));
    for (const [rel, src] of Object.entries(files)) {
        fs.mkdirSync(path.join(t, rel, '..'), { recursive: true });
        fs.writeFileSync(path.join(t, rel), src);
    }
    return t;
}

test('v21_o8 A1. 两向自证：只写不读必抓，写且读不误杀', () => {
    const t = scratch({
        'dead.js': 'const state = {}; function f() { state.deadField = 1; }',
        'alive.js': 'const state = {}; function w() { state.liveField = 1; } function r() { return state.liveField; }',
        'strkey.js': 'const state = {}; function w() { state.strField = 1; } function r() { return state["strField"]; }',
    });
    try {
        const f = scanRepo(t);
        const fields = f.map((x) => x.field).sort();
        assert.deepEqual(fields, ['deadField'],
            '只写不读必抓（deadField）；写且读（liveField）与字符串键读（strField）不许误杀，got ' + fields.join(','));
    } finally { fs.rmSync(t, { recursive: true, force: true }); }
});

test('v21_o8 A2. 链式赋值右值不重复计读，this 前缀不误报', () => {
    const t = scratch({
        'chain.js': 'const state = {}; function f() { state.a = state.b = 0; }',
        // state.b = 0 是写；state.a = ... 里的 state.b 出现在右值也是写形态
    });
    try {
        const f = scanRepo(t).map((x) => x.field).sort();
        assert.deepEqual(f, ['a', 'b'], '链式两侧都是写，读计数必须为 0，got ' + f.join(','));
    } finally { fs.rmSync(t, { recursive: true, force: true }); }
});

test('v21_o8 B1. 真盘扫描：欠账必须逐条登记（或为空）', () => {
    const findings = scanRepo(ROOT);
    const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'audit', 'write_only_ledger.json'), 'utf8'));
    const excused = new Set((ledger.entries || []).map((e) => e.field));
    const debts = findings.filter((f) => !excused.has(f.field));
    assert.deepEqual(debts.map((d) => d.field), [],
        '未登记欠账：' + debts.map((d) => d.field + '@' + d.writes[0]).join('; '));
});

test('v21_o8 B2. 登记表卫生：每条必须带实质理由与 read 指向', () => {
    const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'audit', 'write_only_ledger.json'), 'utf8'));
    assert.ok(Array.isArray(ledger.entries) && ledger.entries.length > 0, '登记表不可为空壳');
    for (const e of ledger.entries) {
        assert.ok(e.field && typeof e.reason === 'string' && e.reason.length >= 20,
            'field ' + (e.field || '?') + ' 的 reason 缺失或太短（无理由登记无效）');
        assert.ok(typeof e.read === 'string' && e.read.length > 3,
            'field ' + e.field + ' 必须指明读取点（跨对象读在哪）');
    }
});

test('v21_o8 C1. 豁免不能变成垃圾桶：已修字段不许留在登记表', async () => {
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync('node', ['tools/scan_write_only_fields.mjs'],
        { cwd: ROOT, encoding: 'utf8' });
    const m = out.match(/写无读 (\d+) 个字段/);
    assert.ok(m, '扫描器必须输出统计行');
    const found = new Set();
    const re = /(?:^|\n)  (?:x |豁免)([A-Za-z_$][\w$]*) /g;
    let mm; while ((mm = re.exec(out)) !== null) found.add(mm[1]);
    const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'audit', 'write_only_ledger.json'), 'utf8'));
    for (const e of ledger.entries) {
        assert.ok(found.has(e.field),
            '登记表里的 ' + e.field + ' 已不在扫描结果中（字段已被修掉）⇒ 登记已腐烂，必须删除该条（豁免也双向）');
    }
});