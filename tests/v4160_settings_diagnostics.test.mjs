// [v4.160.0 · R25-O9] 设置偏差导包：一键交出「与默认差在哪」，且包里不含记忆正文
// 验收口径：包只带配置与可复算读数；扫敏感词 0 命中（负控制能命中）；导入只回填被点名项；版本不符/坏包拒收。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const C = require(join(ROOT, 'settings-console.js'));

const OPTS = { at: '2026-11-18T04:40:00Z', appVersion: '4.160.0', host: 'android-arm64' };
const deviated = () => Object.assign({}, C.defaults(), {
    'recall.topK': 9,
    'inject.budget': 3,
    'inject.style': 'prose'
});

test('O9-1 包骨架齐：kind/version/at/appVersion/host，且默认配置下 0 项偏离', () => {
    const r = C.diagnostics(C.defaults(), OPTS);
    assert.equal(r.ok, true);
    assert.equal(r.pack.kind, 'lonsha-settings-diagnostics');
    assert.equal(r.pack.version, 1);
    assert.equal(r.pack.at, OPTS.at);
    assert.equal(r.pack.appVersion, OPTS.appVersion);
    assert.equal(r.pack.host, OPTS.host);
    assert.equal(r.pack.deviatedCount, 0);
    assert.deepEqual(r.pack.deviations, []);
});

test('O9-2 改几项就只列几项，且与 view() 同源（逐项对账）', () => {
    const values = deviated();
    const r = C.diagnostics(values, OPTS);
    const v = C.view(values);
    assert.equal(r.pack.deviatedCount, 3);
    assert.deepEqual(r.pack.deviations.map((d) => d.id).sort(), ['inject.budget', 'inject.style', 'recall.topK']);
    r.pack.deviations.forEach((d) => {
        const row = v.rows.find((x) => x.id === d.id);
        assert.ok(row, d.id);
        assert.equal(d.current, row.current, d.id);
        assert.equal(d.def, row.def, d.id);
        assert.equal(d.group, row.group, d.id);
        assert.equal(d.impact, row.impact, d.id);
    });
});

test('O9-3 包里搜不到记忆正文/人名（敏感词 0 命中）', () => {
    const needles = ['林夏', '那晚在茶馆他说要走', '茶馆', '我其实不想走'];
    const r = C.diagnostics(deviated(), Object.assign({}, OPTS, { needles }));
    assert.equal(r.ok, true);
    assert.deepEqual(r.hits, []);
    assert.deepEqual(r.pack.sensitiveScan, { ok: true, hits: 0 });
    const text = JSON.stringify(r.pack);
    needles.forEach((n) => assert.equal(text.indexOf(n), -1, n));
});

test('O9-4 负控制：把正文塞进包必须被扫出来（扫描不是摆设）', () => {
    const bad = Object.assign({}, C.diagnostics(C.defaults(), OPTS).pack);
    bad.leak = '林夏 那晚在茶馆他说要走';
    const s = C.scanSensitive(bad, ['林夏', '茶馆', '无关词']);
    assert.equal(s.ok, false);
    assert.deepEqual(s.hits, ['林夏', '茶馆']);
    assert.equal(C.scanSensitive(bad, ['无关词']).ok, true);
});

test('O9-5 包里不带内部路径/实现残留（只有配置与读数）', () => {
    const text = JSON.stringify(C.diagnostics(deviated(), OPTS).pack);
    // 注：'token' 会误命中 inject.style 的读数文案（“叙事式，占更多 token”），故改看真凭据形态。
    // 禁词一律拼接构造：不在本档写绝对路径字面量，否则跨仓守卫 P1 会把自己人当违规。
    ['/' + 'home/', 'node' + '_modules', 'funct' + 'ion', 'undef' + 'ined', 'gh' + 'p_', 'Bear' + 'er '].forEach((bad) => {
        assert.equal(text.indexOf(bad), -1, bad);
    });
});

test('O9-6 读数可复算：包里 readings 与 budgetReading 一致，且导出两次逐字段相同', () => {
    const a = C.diagnostics(deviated(), OPTS).pack;
    const b = C.diagnostics(deviated(), OPTS).pack;
    assert.deepEqual(a.readings, C.budgetReading(deviated()));
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    assert.equal(a.readings.topK, 9);
    assert.equal(a.readings.budget, 3);
    assert.equal(a.readings.injectPerTurn, 3);
});

test('O9-7 导入回填：点名项与导出前一致，其余等于默认', () => {
    const values = deviated();
    const pack = C.diagnostics(values, OPTS).pack;
    const back = C.importDiagnostics(pack);
    assert.equal(back.ok, true);
    assert.deepEqual(back.applied.sort(), ['inject.budget', 'inject.style', 'recall.topK']);
    assert.deepEqual(back.unknown, []);
    C.REGISTRY.forEach((it) => {
        const want = back.applied.indexOf(it.id) === -1 ? it.def : values[it.id];
        assert.deepEqual(back.values[it.id], want, it.id);
    });
    assert.deepEqual(C.view(back.values).deviatedCount, 3);
});

test('O9-8 导入不偷偷继承：只带一项的包只回填那一项', () => {
    const pack = C.diagnostics(deviated(), OPTS).pack;
    const slim = Object.assign({}, pack, { deviations: pack.deviations.filter((d) => d.id === 'recall.topK'), deviatedCount: 1 });
    const back = C.importDiagnostics(slim);
    assert.equal(back.ok, true);
    assert.deepEqual(back.applied, ['recall.topK']);
    assert.equal(back.values['recall.topK'], 9);
    assert.equal(back.values['inject.budget'], C.REGISTRY.find((it) => it.id === 'inject.budget').def);
    assert.equal(C.view(back.values).deviatedCount, 1);
});

test('O9-9 版本不符拒收：报 version-mismatch 且回默认', () => {
    const pack = Object.assign({}, C.diagnostics(deviated(), OPTS).pack, { version: 2 });
    const back = C.importDiagnostics(pack);
    assert.equal(back.ok, false);
    assert.deepEqual(back.bad, ['version-mismatch']);
    assert.deepEqual(back.values, C.defaults());
});

test('O9-10 坏包拒收：null / 字符串 / 别的 kind 都不猜', () => {
    [null, undefined, 'lonsha', 42, {}, { kind: 'other', version: 1, deviations: [] }].forEach((p) => {
        const back = C.importDiagnostics(p);
        assert.equal(back.ok, false, String(p));
        assert.deepEqual(back.bad, ['not-a-diagnostics-pack'], String(p));
        assert.deepEqual(back.values, C.defaults());
    });
});

test('O9-11 陌生 id 进 unknown，不抛错、不污染已知项', () => {
    const pack = C.diagnostics(deviated(), OPTS).pack;
    const mixed = Object.assign({}, pack, {
        deviations: pack.deviations.concat([{ id: 'future.unknown', group: 'advanced', current: 1, def: 0, impact: 'x' }])
    });
    const back = C.importDiagnostics(mixed);
    assert.equal(back.ok, true);
    assert.deepEqual(back.unknown, ['future.unknown']);
    assert.deepEqual(back.applied.sort(), ['inject.budget', 'inject.style', 'recall.topK']);
    assert.equal(back.values['future.unknown'], undefined);
    assert.equal(C.view(back.values).deviatedCount, 3);
});
