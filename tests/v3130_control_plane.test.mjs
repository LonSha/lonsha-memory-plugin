// tests/v3130_control_plane.test.mjs
// [v3.130] stbme 控制平面分离（持久化单真源）+ baibai 正文时间标签协议闭环
// 验证：① OMR 主保存走 collectExport 单真源（手写清单废除）
//      ② collectExport 补齐漂移键、load 补齐恢复面（存↔读对称）
//      ③ extractDualTimeTags 解析诊断 + 时钟校准接线 + 协议健康统计
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');

function extractBraced(marker) {
    const start = src.indexOf(marker);
    assert.ok(start >= 0, `${marker} 存在`);
    // marker 以 `{` 结尾时末字符即方法开括号（其内部可能含 `opts = {}` 字面量，不能 indexOf 跳过）；
    // 否则从 marker 结束后找第一个开括号
    const trimmed = marker.trimEnd();
    const open = trimmed.endsWith('{') ? start + trimmed.length - 1 : src.indexOf('{', start + marker.length);
    let depth = 0, i = open;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    return src.slice(open + 1, i);
}

test('v3.130 OMR 主保存统一走 collectExport 单真源', () => {
    // [v3.138] CP-L2: 主保存先收集 payload，经持久化确认状态机校验后写入
    assert.match(src, /const _omrPayload = await this\.collectExport\(\)/, 'OMR 主保存调用 collectExport');
    assert.match(src, /await this\.storage\.save\(chatId, _omrPayload\)/, 'OMR 保存 payload');
    // 手写清单废除：`summaries: this.summary.export()` 此前出现 2 次（collectExport + OMR 各一），现应只剩 1
    const n = [...src.matchAll(/summaries: this\.summary\.export\(\)/g)].length;
    assert.equal(n, 1, `手写保存清单应已废除（现出现 ${n} 次）`);
    // 保存地面真源在 OMR 路径登记
    assert.match(src, /this\.recordSaveSource\('realtime', message\.index/);   // [v3.131] 保存来源登记方法化
});

test('v3.130 collectExport 补齐漂移键，load 补齐恢复面', () => {
    const ce = extractBraced('collectExport() {');
    for (const k of ['deltaBook:', 'cse:', 'pulse:', 'outline:', 'pairMem:', 'lockedFacts:', 'recallSourceStats:', 'timelineCursorChatId:', 'timelineCursorFingerprint:', 'lastSave:']) {
        assert.ok(ce.includes(k), `collectExport 应含 ${k}`);
    }
    const ld = extractBraced('restoreFromPayload(data) {');   // [v3.138] CP-L2: 恢复面单真源
    for (const k of ['deltaBook', 'cse', 'pulse', 'outline', 'pairMem', 'moneyLedger', 'cards', 'conflicts', 'lockedFacts', 'recallSourceStats', 'lastSave']) {
        assert.ok(ld.includes(`data.${k}`), `load 应恢复 data.${k}`);
    }
    // 游标身份随存档走
    assert.match(src, /timelineCursorChatId: this\._timelineCursorChatId/);
});

test('v3.130 extractDualTimeTags 解析诊断（成对/半对/坏标签）', () => {
    const errLog = () => {};
    const body = extractBraced('extractDualTimeTags(text) {');
    const fn = new Function('errLog', `return function (text) { ${body} }`)(errLog);
    const ok = fn('<bbs_start>2026/9/15 21:30</bbs_start>正文<bbs_end>2026/9/15 21:45</bbs_end>');
    assert.equal(ok.hasDual, true);
    assert.equal(ok.parseError, null, '数字日期成对无 parseError');
    assert.equal(ok.durationMinutes, 15);
    const half = fn('<bbs_start>2026/9/15 21:30</bbs_start>只有一半');
    assert.equal(half.hasDual, false);
    assert.equal(half.parseError, 'half-pair', '半对应标 half-pair');
    const bad = fn('<bbs_start>某天</bbs_start>x<bbs_end>次日</bbs_end>');
    assert.equal(bad.hasDual, true);
    assert.match(bad.parseError, /unparseable|empty/, '无法定位的模糊说法应标 unparseable');
});

test('v3.130 时间标签→时钟校准接线与协议健康统计', () => {
    // 校准调用存在且用 end 的日期部分
    assert.match(src, /正文时间标签校准时钟/);
    assert.match(src, /this\.clock\.setTime\(\{ date: _endD/);
    // GameClock 构造器/getSnapshot/import 三处都有 timeTagStats
    const ctor = src.slice(src.indexOf('class GameClock'), src.indexOf('setTime(opts'));
    assert.match(ctor, /timeTagStats = \{ total: 0, paired: 0, unparseable: 0, calibrated: 0 \}/);
    const snap = extractBraced('getSnapshot() {');
    assert.match(snap, /timeTagStats/);
    const gcls = src.slice(src.indexOf('class GameClock'), src.indexOf('class PlotTimeline'));
    const gImp = gcls.slice(gcls.indexOf('import(data) {'));
    assert.match(gImp, /data\.timeTagStats/, 'GameClock.import 应恢复 timeTagStats');
    // OMR 里的统计入口
    assert.match(src, /this\.clock\.timeTagStats \|\| \(this\.clock\.timeTagStats = /);
    // 诊断面板展示
    assert.match(ui, /时间标签协议/);
});

test('v3.136 设置面板导出/导入收口单真源', () => {
    const ui = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');
    assert.match(ui, /const data = await this\.engine\.collectExport\(\)/, '导出走 collectExport');
    assert.ok(!ui.includes('summaries: this.engine.summary.export()'), '手写导出清单已废除');
    // [v3.138] CP-L2: UI 导入收编 restoreFromPayload 单真源（键覆盖由单真源保证）
    assert.match(ui, /this\.engine\.restoreFromPayload\(data[,)]/, 'UI 导入走单真源');
    const rps = extractBraced('restoreFromPayload(data) {');
    for (const k of ['deltaBook', 'cse', 'pulse', 'outline', 'pairMem', 'moneyLedger', 'cards', 'conflicts', 'opLog', 'clock']) {
        assert.ok(rps.includes(`data.${k}`), `恢复单真源含 ${k}`);
    }
});

test('v3.130 版本三处同步', () => {
    const m = /const VERSION = '([^']+)'/.exec(src);
    assert.equal(m[1], '3.190.0');
    const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(manifest.version, '3.190.0');
    assert.equal(pkg.version, '3.190.0');
});
