// tests/v3140_control_plane_fixes.test.mjs
// [v3.140] P0 控制平面正确性复核：确认时机 / 版本判旧 / 结构化恢复结果
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');
function extractBraced(marker) {
    const start = src.indexOf(marker);
    assert.ok(start >= 0, `${marker} 存在`);
    const trimmed = marker.trimEnd();
    const open = trimmed.endsWith('{') ? start + trimmed.length - 1 : src.indexOf('{', start + marker.length);
    let depth = 0, i = open;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    return src.slice(open + 1, i);
}
test('v3.140 compareVersion 分段数值比较（修 parseFloat 语义颠倒）', () => {
    const fn = new Function(`return function (a, b) { ${extractBraced('function compareVersion(a, b) {')} }`)();
    assert.equal(fn('3.9', '3.10'), -1, 'parseFloat 口径下 3.9>3.1 是错的，必须 -1');
    assert.equal(fn('3.10', '3.9'), 1);
    assert.equal(fn('3.10.0', '3.10'), 0, '缺失段视为 0');
    assert.equal(fn('3.140.0', '3.140.0'), 0);
    assert.equal(fn('3.140.1', '3.140.0'), 1);
    assert.equal(fn(null, '0'), 0, '空值不炸');
});
test('v3.140 storage.save 仅真实落盘后推进确认（行为级）', async () => {
    const body = extractBraced('async save(chatId, data) {');
    const mk = (saveChat) => {
        const data = { graph: {}, summaries: [], schemaVersion: 1 };
        const stubConsole = { warn() {}, error() {}, log() {} };
        const win = { SillyTavern: { getContext: () => ({ chatMetadata: { extensions: {} }, saveChat }) } };
        const st = { STORAGE_KEY: 'lonsha_memory', _isWriting: false, _pendingWrite: null, _revision: 0, _confirmed: null, _lastWrite: null };
        const fn = new Function('window', 'console', 'errLog', 'ARCHIVE_TOP_LEVEL_KEY_SET', 'STORAGE_FP_FIELDS', 'VERSION', 'PLUGIN_NAME',
            `return async function (chatId, data) { ${body} }`)(win, stubConsole, () => {}, new Set(Object.keys(data)), ['graph'], '3.140.0', 'T');
        return { st, fn, data };
    };
    const a = mk(async () => {});
    assert.equal(await a.fn.call(a.st, 'c1', a.data), true, '落盘成功返回 true');
    assert.equal(a.st._confirmed?.revision, 1, '确认随真实写入推进');
    assert.equal(a.st._lastWrite.status, 'confirmed');
    const b = mk(async () => { throw new Error('disk full'); });
    assert.equal(await b.fn.call(b.st, 'c1', b.data), false, '写失败必须返回 false（旧实现恒 true）');
    assert.equal(b.st._confirmed, null, '写失败不得推进确认');
    assert.equal(b.st._lastWrite.status, 'failed');
    assert.match(b.st._lastWrite.error, /disk full/);
    const c2 = new Function('window', 'console', 'errLog', 'ARCHIVE_TOP_LEVEL_KEY_SET', 'STORAGE_FP_FIELDS', 'VERSION', 'PLUGIN_NAME',
        `return async function (chatId, data) { ${body} }`)(
        { SillyTavern: { getContext: () => ({ chatMetadata: null }) } }, { warn() {}, error() {}, log() {} }, () => {}, new Set(['graph']), ['graph'], '3.140.0', 'T');
    const stC = { STORAGE_KEY: 'k', _isWriting: false, _pendingWrite: null, _revision: 0, _confirmed: null, _lastWrite: null };
    assert.equal(await c2.call(stC, 'c1', { graph: {} }), false, '宿主无 chatMetadata → 未落地 → false');
    assert.equal(stC._confirmed, null, '无落盘证据不得推进确认');
    assert.equal(stC._lastWrite.status, 'failed');
});
test('v3.140 restoreFromPayload 返回结构化结果，单字段失败不吞后续（行为级）', () => {
    const body = extractBraced('restoreFromPayload(data) {');
    const mkEngine = () => {
        const calls = [];
        const eng = {
            storage: { _confirmed: { chatId: 'x', revision: 3 } },
            _loadedChatId: null,
            graph: { import: (d) => { calls.push('graph'); if (d?.boom) throw new Error('graph import exploded'); } },
            summary: { import: () => calls.push('summary'), lockedFacts: [] },
            clock: { import: () => calls.push('clock') },
            timeline: { import: () => calls.push('timeline') },
            status: { import: () => calls.push('status') },
            opLog: { import: () => calls.push('opLog') },
        };
        const fn = new Function('errLog', 'ARCHIVE_SCHEMA_VERSION', `return function (data) { ${body} }`)(() => {}, 1);
        return { eng, fn, calls };
    };
    const ok = mkEngine();
    const r1 = ok.fn.call(ok.eng, { graph: {}, summaries: [], clock: {}, schemaVersion: 1, producerVersion: '3.139.0' }, { source: 'test' });
    assert.equal(r1.ok, true, '全成功 ok=true');
    assert.equal(r1.count, 3);
    assert.deepEqual(r1.restored.sort(), ['clock', 'graph', 'summaries']);
    assert.ok(r1.skipped.includes('timeline'), '缺字段进 skipped');
    assert.equal(r1.source, 'test');
    assert.equal(ok.eng.storage._confirmed, null, '恢复清空确认（等真实落盘重新推进）');
    assert.equal(r1.loadedProducer, '3.139.0', '装载来源版本随结果上报');
    const boom = mkEngine();
    const r2 = boom.fn.call(boom.eng, { graph: { boom: true }, summaries: [], clock: {} });
    assert.equal(r2.ok, false, '单字段失败 ok=false');
    assert.equal(r2.failed[0].key, 'graph');
    assert.match(r2.failed[0].error, /exploded/, '失败原因可定位');
    assert.deepEqual(boom.calls, ['graph', 'summary', 'clock'], '失败后其余字段仍继续恢复');
    assert.equal(r2.count, 2, '计数只算成功项');
    const bad = mkEngine();
    const r3 = bad.fn.call(bad.eng, null);
    assert.equal(r3.ok, false, '非法 payload 明确失败');
    assert.equal(r3.count, 0);
});
test('v3.140 契约三方一致性：collectExport 键 == ARCHIVE_TOP_LEVEL_KEYS == restoreFromPayload 可恢复键', () => {
    const ce = extractBraced('collectExport() {');
    const exported = new Set([...ce.matchAll(/^\s{16}(\w+):/gm)].map(m => m[1]));
    const contract = new Set([.../Object\.freeze\(\[([\s\S]*?)\]\);/.exec(src)[1].matchAll(/'(\w+)'/g)].map(m => m[1]));
    const rp = extractBraced('restoreFromPayload(data) {');
    const restorable = new Set([...rp.matchAll(/_imp\('(\w+)'/g)].map(m => m[1]));
    for (const k of exported) assert.ok(contract.has(k), `契约缺导出键 ${k}`);
    for (const k of contract) assert.ok(exported.has(k), `契约多出不存在键 ${k}`);
    assert.equal(contract.size, exported.size, '契约与导出键数一致');
    for (const k of exported) {
        if (restorable.has(k)) continue;
        assert.ok(['version', 'schemaVersion', 'producerVersion', 'packedAt'].includes(k), `导出键 ${k} 既不可恢复也非版本元数据（A8 单真源破口）`);
    }
    assert.ok(restorable.has('schemaVersion') || rp.includes('Number(data.schemaVersion)'), 'schemaVersion 参与恢复期判读');
});
test('v3.140 判旧用 schemaVersion + compareVersion（不再 Number(插件版本) / parseFloat）', () => {
    const cem = extractBraced('checkEmbeddedMigration() {');
    assert.ok(!/Number\(this\._dataVersion\)/.test(cem), '禁用 Number(版本字符串)');
    assert.ok(!/parseFloat\(emb/.test(cem), '禁用 parseFloat 比较版本');
    assert.match(cem, /Number\(emb\.schemaVersion\)/);
    assert.match(cem, /compareVersion\(VERSION, embProducer\)/);
    assert.match(cem, /localHasData && localNotOlder/, '无本地数据时不得判为“本地更新”而清理');
    assert.match(src, /_loadedChatId = chatId/, 'storage.load 登记装载身份');
    assert.match(src, /this\._loadedChatId === chatId/, 'OMR 护栏用装载身份判定');
    assert.match(src, /_saveDeniedCount < 5/, '连续拒绝有上限（防永久卡死写入）');
});
test('v3.140 嵌入存档用真 STORAGE_KEY（收编 extensions[\'undefined\'] 历史残留）', () => {
    assert.match(src, /const _sk = this\.storage\.STORAGE_KEY;/);
    assert.match(src, /meta\?\.extensions\?\.undefined\?\.embeddedVault/, '读取兼容旧键');
    assert.match(src, /delete meta\.extensions\.undefined\.embeddedVault/, '清理旧键残留');
    assert.ok(!ui.includes('eng.STORAGE_KEY'), 'settings-ui 不再读 engine 上不存在的 STORAGE_KEY');
});
test('v3.140 UI 恢复播报结构化（部分失败不再报成功，空恢复不清副本）', () => {
    assert.match(ui, /_rr\.count\) \{ toast\('.*保持原状/);
    assert.match(ui, /部分恢复|部分导入/);
    assert.match(ui, /_rn\.failed\.length/, '文件导入也播报失败字段');
});
