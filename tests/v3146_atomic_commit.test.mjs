// tests/v3146_atomic_commit.test.mjs
// [v3.146] CP 原子提交边界：恢复部分失败自动回滚到恢复前快照（不留半套状态）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');
function extractBraced(marker) {
    const start = src.indexOf(marker);
    assert.ok(start >= 0, `${marker} 存在`);
    let depth = 0, i = src.indexOf('{', start + marker.length - 1);
    const open = i;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    return src.slice(open + 1, i);
}
const KEYS = ['version', 'graph', 'summaries', 'clock', 'schemaVersion', 'producerVersion', 'extensions', 'exportedAt', 'lastSave'];
// 构造真实可运行的 restoreFromPayload（含 self 递归），clock 导入故意抛错
function mk({ atomic = true } = {}) {
    const calls = [];
    const body = extractBraced('restoreFromPayload(data) {');
    const fn = new Function('errLog', 'ARCHIVE_SCHEMA_VERSION', 'ARCHIVE_TOP_LEVEL_KEY_SET', 'PLUGIN_NAME',
        `return function (data) { ${body} }`)(() => {}, 1, new Set(KEYS), 'TEST');
    const eng = {
        storage: { _confirmed: { chatId: 'c', revision: 7 } },
        config: { config: { atomicRestoreEnabled: atomic } },
        _archiveExtensions: {}, _mutationEpoch: 0,
        _bumpEpoch() { this._mutationEpoch++; },
        graph: { import: (d) => calls.push('graph=' + (d?.v || '?')) },
        summary: { import: () => calls.push('summary'), lockedFacts: [] },
        clock: { import: (d) => { calls.push('clock=' + (d?.v || '?')); if (d?.boom) throw new Error('clock boom'); } },
        collectExport: () => ({ graph: { v: 'OLD' }, clock: { v: 'OLD' }, summaries: [], schemaVersion: 1, producerVersion: '3.146.0' }),
    };
    eng.restoreFromPayload = function (data, opts) { return fn.call(this, data, opts); };
    return { eng, fn, calls };
}
const BAD = { graph: { v: 'NEW' }, clock: { v: 'NEW', boom: true }, summaries: [], schemaVersion: 1 };
test('v3.146 部分失败 + snapshot → 自动回滚到恢复前快照（旧值重新装入）', () => {
    const { eng, calls } = mk();
    const r = eng.restoreFromPayload(BAD, { source: 'file-import', snapshot: true });
    assert.equal(r.ok, false, '仍如实报告失败');
    assert.equal(r.rolledBack, true, '标记已回滚');
    assert.ok(r.rollback.restored >= 2, `回滚恢复了字段（${JSON.stringify(r.rollback)}）`);
    assert.deepEqual(calls, ['graph=NEW', 'summary', 'clock=NEW', 'graph=OLD', 'summary', 'clock=OLD'], '失败后旧快照被重新装入（非半套）');
    assert.equal(r.loadedProducer, null, '回滚不得把快照的 producerVersion(3.146.0) 写进本次结果（外层字段不被递归污染）');
    assert.equal(eng._lastRestore, r, '面板记录的是原始失败+回滚结果（不被回滚自身覆盖）');
});
test('v3.146 未请求 snapshot 时不抓快照也不回滚（storage.load 语义保持）', () => {
    const { eng, calls } = mk();
    const r = eng.restoreFromPayload(BAD, { source: 'storage-load' });
    assert.equal(r.ok, false);
    assert.equal(r.rolledBack, undefined, '无 snapshot 请求 → 不回滚不标记');
    assert.deepEqual(calls, ['graph=NEW', 'summary', 'clock=NEW'], '不得把旧档装回（防跨聊污染）');
});
test('v3.146 开关关闭退回 v3.145 前行为（可回退）', () => {
    const { eng, calls } = mk({ atomic: false });
    const r = eng.restoreFromPayload(BAD, { source: 'file-import', snapshot: true });
    assert.equal(r.ok, false);
    assert.equal(r.rolledBack, undefined, '开关关闭→不回滚');
    assert.deepEqual(calls, ['graph=NEW', 'summary', 'clock=NEW']);
});
test('v3.146 dryRun 预检不抓快照、不回滚、零副作用', () => {
    const { eng, calls } = mk();
    const r = eng.restoreFromPayload(BAD, { source: 'precheck', dryRun: true, snapshot: true });
    assert.equal(r.dryRun, true);
    assert.equal(r.rolledBack, undefined);
    assert.equal(calls.length, 0, '预检不执行任何 import');
    assert.equal(eng.storage._confirmed.revision, 7, '预检不清确认');
    assert.equal(eng._mutationEpoch, 0, '预检不推栅栏');
});
test('v3.146 全成功路径不触发回滚，快照分支无额外开销泄漏', () => {
    const { eng, calls } = mk();
    const r = eng.restoreFromPayload({ graph: { v: 'NEW' }, clock: { v: 'NEW' }, summaries: [], schemaVersion: 1 }, { source: 'file-import', snapshot: true });
    assert.equal(r.ok, true);
    assert.equal(r.rolledBack, undefined, '成功不回滚');
    assert.deepEqual(calls, ['graph=NEW', 'summary', 'clock=NEW']);
});
test('v3.146 UI 两处用户发起的恢复已请求 snapshot，storage.load 刻意不请求', () => {
    assert.equal((ui.match(/snapshot: true/g) || []).length, 2, '导入 + 嵌入恢复两处抓快照');
    assert.match(src, /restoreFromPayload\(data, \{ source: 'storage-load' \}\)/, 'load 不抓快照');
    assert.match(src, /atomicRestoreEnabled: true/, '配置默认开启');
    assert.match(src, /source: 'auto-rollback:' \+ res\.source/, '回滚来源可追溯');
    assert.match(src, /回滚目标是「上一聊天/, 'load 不抓快照的跨档污染理由已注释在案');
    assert.match(ui, /ck\('atomicRestoreEnabled', '恢复原子提交'/, '开关已进面板（v3113 配置覆盖守卫要求）');
});
test('v3.146 面板可见性：回滚成功/失败未回滚/回滚未见效三态都可查（不留静默）', () => {
    assert.match(ui, /已自动回滚原状态/, '回滚成功可见');
    assert.match(ui, /未回滚（保留半套，可紧急备份恢复）/, '失败但未回滚可见');
    assert.match(ui, /r\.rollbackWarning/, '回滚未见效告警可见');
    assert.equal((ui.match(/已自动回滚原状态/g) || []).length, 1, '面板段无重复注入');
    assert.match(ui, /ck\('atomicRestoreEnabled', '恢复原子提交'/, '开关已进面板（v3113 配置覆盖守卫要求）');
});
