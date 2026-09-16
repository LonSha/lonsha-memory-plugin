// tests/v3142_atomic_restore.test.mjs
// [v3.142] CP: 两阶段恢复（dryRun 零副作用）+ 未知键 round-trip（宽容解析）+ missing/skipped 分离
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
const KEYS = ['version', 'graph', 'summaries', 'clock', 'schemaVersion', 'producerVersion', 'extensions', 'exportedAt', 'thirdPartyThing'];
function mkFn() {
    const calls = [];
    const eng = {
        _bumpEpoch() {},   // [v3.145] CP-L6: 恢复推进栅栏（mock 无需真计数）
        storage: { _confirmed: { chatId: 'c', revision: 9 } },
        _archiveExtensions: {},
        graph: { import: (d) => { calls.push('graph'); if (d?.boom) throw new Error('x'); } },
        summary: { import: () => calls.push('summary'), lockedFacts: [] },
        clock: { import: () => calls.push('clock') },
    };
    const fn = new Function('errLog', 'ARCHIVE_SCHEMA_VERSION', 'ARCHIVE_TOP_LEVEL_KEY_SET',
        `return function (data) { ${extractBraced('restoreFromPayload(data) {')} }`)(
        () => {}, 1, new Set(KEYS.filter(k => k !== 'thirdPartyThing')));
    return { eng, fn, calls };
}
test('v3.142 dryRun 零副作用：不改确认状态、不写运行时、不收容未知键', () => {
    const a = mkFn();
    const r = a.fn.call(a.eng, { graph: {}, summaries: [], unknown1: 1 }, { dryRun: true, source: 'precheck' });
    assert.equal(r.dryRun, true, '结果标记预检');
    assert.equal(a.eng.storage._confirmed.revision, 9, '预检不得清确认（只读不该有副作用）');
    assert.deepEqual(a.eng._archiveExtensions, {}, '预检不得收容未知键');
    assert.equal(r.unknown.length, 1, '预检仍报告未知键');
    assert.equal(a.calls.length, 0, '预检绝不调用任何 import');
    assert.equal(r.count, 2, '预检给出可恢复计划数');
    const b = mkFn();
    b.fn.call(b.eng, { graph: {}, summaries: [] }, { source: 'real' });
    assert.deepEqual(b.calls.sort(), ['graph', 'summary'], '非预检才真正写入');
    assert.equal(b.eng.storage._confirmed, null, '真实恢复清确认');
});
test('v3.142 未知顶层键 round-trip：收进 extensions 且随 collectExport 回写（不丢不炸）', () => {
    const { eng, fn } = mkFn();
    const r = fn.call(eng, { graph: {}, thirdPartyThing: { keep: 1 }, extensions: { fromBag: 2 } }, { source: 't' });
    assert.equal(r.ok, true, '未知键不致失败');
    assert.deepEqual(r.unknown, ['thirdPartyThing'], '未知键被识别');
    assert.equal(r.unknownPreserved, 1);
    assert.deepEqual(eng._archiveExtensions.thirdPartyThing, { keep: 1 }, '未知键收容');
    assert.equal(eng._archiveExtensions.fromBag, 2, '存档自带 extensions 合并回流');
    const ce = extractBraced('collectExport() {');
    assert.match(ce, /extensions: this\._archiveExtensions \|\| \{\}/, 'collectExport 回写收容袋（round-trip 出口）');
    const contract = /Object\.freeze\(\[([\s\S]*?)\]\);/.exec(src)[1];
    assert.match(contract, /'extensions',/, '契约登记 extensions 键');
});
test('v3.142 missing 与 skipped 分离：有数据但引擎无模块不再被误报为「无数据」', () => {
    const calls = [];
    const eng = {
        _bumpEpoch() {},   // [v3.145] CP-L6: 恢复推进栅栏（mock 无需真计数）
        storage: { _confirmed: null }, _archiveExtensions: {},
        graph: { import: () => calls.push('graph') },
        summary: { import: () => calls.push('summary'), lockedFacts: [] },
        // 故意不装配 clock / timeline：payload 给了这两个键的数据
    };
    const fn = new Function('errLog', 'ARCHIVE_SCHEMA_VERSION', 'ARCHIVE_TOP_LEVEL_KEY_SET',
        `return function (data) { ${extractBraced('restoreFromPayload(data) {')} }`)(() => {}, 1, new Set(KEYS));
    const r = fn.call(eng, { graph: {}, summaries: [], clock: { t: 1 }, timeline: [1] }, { source: 't' });
    assert.ok(r.missing.includes('clock'), '有数据但引擎缺模块 → missing');
    assert.ok(r.missing.includes('timeline'), '同上：timeline 数据存在但引擎未装配');
    assert.ok(!r.skipped.includes('clock'), 'missing 不得混入 skipped（旧实现两者同桶，掩盖丢数据）');
    assert.ok(!r.skipped.includes('timeline'));
    assert.ok(r.skipped.includes('opLog'), 'payload 本就没这个字段 → skipped');
    assert.equal(r.ok, true, '缺模块不算失败（数据不该硬塞给不存在的子系统）');
    assert.deepEqual(calls, ['graph', 'summary']);
});
test('v3.142 导入侧原子性：空恢复不落盘、部分失败先紧急备份、两阶段预检已接线', () => {
    assert.match(ui, /if \(!_rn\.count\) \{ toast\('\u274c 存档无可恢复内容，原记忆保持不变（未落盘）'\); return; \}/, '空恢复不得覆盖原存档');
    assert.match(ui, /storage\.load\(chatId, \{ preserveRuntime: true \}\)/, '恢复前只读取回原存档（不写运行时）');
    assert.match(ui, /emergency\?\.save\(chatId, `部分导入前原存档/, '部分失败落盘前留紧急备份退路');
    assert.match(ui, /dryRun: true \}\);/, '嵌入恢复走两阶段预检');
    assert.match(ui, /_pre\.schemaWarning/, '结构代际过新时预检即中止（不应用半套）');
    assert.match(ui, /_rn\.unknown\?\.length/, '播报未知键保留数');
});
