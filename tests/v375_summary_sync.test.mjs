// tests/v375_summary_sync.test.mjs
// LonSha 记忆引擎 v3.75.0 摘要手动操作收尾（OpLog 埋点 + 显示说明 + 手机同步）测试
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';

const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf-8');
const su = readFileSync('/home/user/lonsha-memory-plugin/settings-ui.js', 'utf-8');
const bridge = readFileSync('/home/user/ruby-phone-work/apps/memory/lonsha-bridge.js', 'utf-8');

test('=== 1. OpLog summary 埋点检查 ===', () => {
    // 编辑埋点（summary/update）
    assert.ok(src.includes("this.opLog?.log?.('summary', 'update', 'sum_' + floor, floor,"), 'update 埋点');
    // 补摘埋点（summary/manual）
    assert.ok(src.includes("this.opLog?.log?.('summary', 'manual', 'sum_' + f, f,"), 'manual 埋点');
    // 埋点位置：在 edited 标记之后
    const updIdx = src.indexOf('s.editedAt = Date.now();');
    const updLogIdx = src.indexOf("'summary', 'update'");
    assert.ok(updIdx > 0 && updLogIdx > updIdx, 'update 埋点在标记后');
    const manIdx = src.indexOf('this.summaries.sort((a, b) => a.floor - b.floor);');
    const manLogIdx = src.indexOf("'summary', 'manual'");
    assert.ok(manIdx > 0 && manLogIdx > manIdx, 'manual 埋点在排序后');
});

test('=== 2. 时间标签显示说明检查 ===', () => {
    assert.ok(su.includes('可在酒馆设置 → 正则中添加隐藏规则'), '正则隐藏提示');
    assert.ok(su.includes('&lt;bbs_start&gt;'), 'start 标签提示');
    assert.ok(su.includes('&lt;bbs_end&gt;'), 'end 标签提示');
    assert.ok(su.includes('标签仍会保留在底层数据'), '数据保留说明');
});

test('=== 3. 桥 syncSummaryEdit 检查 ===', () => {
    assert.ok(bridge.includes('syncSummaryEdit(floor, text, opts = {})'), '方法定义');
    assert.ok(bridge.includes('[摘要·第'), '幂等标记');
    assert.ok(bridge.includes("tags: ['summary-sync']"), '同步标签');
    assert.ok(bridge.includes('pinned: true, importance: 6'), 'pinned 6');
    assert.ok(bridge.includes('this.memoryCore.updateEntry'), '更新已有条目');
    assert.ok(bridge.includes('summarySyncCount'), '统计计数');
    assert.ok(bridge.includes('summarySyncCount: 0'), 'stats 初始字段');
    // 幂等：exist 更新走 updateEntry，否则 record
    const existIdx = bridge.indexOf('const exist = pool.find');
    const updIdx = bridge.indexOf('this.memoryCore.updateEntry');
    assert.ok(existIdx > 0 && updIdx > existIdx, 'exist  判断在前');
});

test('=== 4. 幂等逻辑复刻测试 ===', () => {
    // 复刻 syncSummaryEdit 的幂等逻辑
    const pool = [
        { id: 'm1', content: '[摘要·第42楼] 旧文本' },
        { id: 'm2', content: '[摘要·第43楼] 另一条' },
    ];
    const floor = 42;
    const text = '新文本';
    const marker = '[摘要·第' + floor + '楼]';
    const exist = pool.find(m => (m.content || '').startsWith(marker));
    assert.ok(exist, '找到已有条目');
    exist.content = marker + ' ' + text;
    assert.strictEqual(exist.content, '[摘要·第42楼] 新文本', '条目更新');
    // 无匹配时新增
    const pool2 = [];
    const marker2 = '[摘要·第99楼]';
    const exist2 = pool2.find(m => (m.content || '').startsWith(marker2));
    assert.strictEqual(exist2, undefined, '无匹配走新增');
});

test('=== 5. 埋点功能模拟测试 ===', () => {
    const entries = [];
    let seq = 0;
    const log = (type, op, ref, floor, meta) => {
        entries.push({ seq: ++seq, type: String(type || '').slice(0, 20), op: String(op || '').slice(0, 10), ref: String(ref || '').slice(0, 60), floor: floor ?? null, meta: meta ? String(meta).slice(0, 80) : '' });
    };
    // 编辑摘要
    log('summary', 'update', 'sum_42', 42, '编辑后的摘要文本');
    assert.strictEqual(entries[0].type, 'summary');
    assert.strictEqual(entries[0].op, 'update');
    // 补摘
    log('summary', 'manual', 'sum_43', 43, '手动补摘的文本');
    assert.strictEqual(entries[1].op, 'manual');
    // stats 聚合
    const byOp = {};
    for (const e of entries) byOp[e.op] = (byOp[e.op] || 0) + 1;
    assert.strictEqual(byOp.update, 1);
    assert.strictEqual(byOp.manual, 1);
});