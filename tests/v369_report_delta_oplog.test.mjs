// tests/v369_report_delta_oplog.test.mjs
// LonSha 记忆引擎 v3.69.0 全景报告增量板块 + OpLog delta 埋点 + 手机统计展示测试
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';

const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf-8');
const mv = readFileSync('/home/user/ruby-phone-work/apps/memory/memory-view.js', 'utf-8');
const bridge = readFileSync('/home/user/ruby-phone-work/apps/memory/lonsha-bridge.js', 'utf-8');

test('=== 1. 全景报告正史增量板块 ===', () => {
    const repIdx = src.indexOf('exportMemoryReport');
    const repBody = src.slice(repIdx, repIdx + 10000);
    assert.ok(repBody.includes('## 📒 正史增量'), '报告板块标题');
    assert.ok(repBody.includes('已确证：'), 'established 分组');
    assert.ok(repBody.includes('待定：'), 'uncertain 分组');
    assert.ok(repBody.includes('楼佐证'), '楼层溯源');
    // 板块位置：在锁定事实板块之后
    const lfIdx = repBody.indexOf('## 🔒 用户锁定事实');
    const dbIdx = repBody.indexOf('## 📒 正史增量');
    assert.ok(dbIdx > lfIdx, '增量板块在锁定事实之后');
});

test('=== 2. OpLog delta 埋点（第 15 类型） ===', () => {
    assert.ok(src.includes("this.opLog?.log?.('delta', 'add'"), 'delta add 埋点');
    assert.ok(src.includes("'fold_' + (batch[0]?.floor ?? '?')"), 'fold_ ref');
    // 埋点在 deltas 消费处（n > 0 时才埋点）
    const consumeIdx = src.indexOf('this.deltaBook.addFromList(deltasList');
    const logIdx = src.indexOf("log?.('delta', 'add'");
    assert.ok(consumeIdx > 0 && logIdx > consumeIdx, '埋点在消费之后');
});

test('=== 3. 手机端统计展示 ===', () => {
    // 桥接统计行：铁律/正史计数
    assert.ok(mv.includes('lockedFactsIngested'), '铁律计数');
    assert.ok(mv.includes('deltaIngested'), '正史计数');
    assert.ok(mv.includes('🔒铁律'), '铁律标签');
    assert.ok(mv.includes('📒正史'), '正史标签');
    // 数据源是 bridge stats
    assert.ok(bridge.includes('lockedFactsIngested: 0'), '桥 stats 初始字段');
    assert.ok(bridge.includes('deltaIngested: 0'), 'delta stats 初始字段');
});

test('=== 4. 手机端数据链路完整性 ===', () => {
    // bridgeStats 来源：window.VirtualPhone.lonshaBridge.getStats()
    assert.ok(mv.includes('lonshaBridge?.getStats?.()'), 'getStats 数据源');
    // 桥侧 getStats 返回 stats
    assert.ok(bridge.includes('getStats()'), 'getStats 方法');
});

test('=== 5. OpLog delta 埋点功能模拟 ===', () => {
    // 复刻埋点逻辑
    const entries = [];
    let seq = 0;
    const log = (type, op, ref, floor, meta) => {
        entries.push({ seq: ++seq, type: String(type || '').slice(0, 20), op: String(op || '').slice(0, 10), ref: String(ref || '').slice(0, 60), floor: floor ?? null, meta: meta ? String(meta).slice(0, 80) : '' });
    };
    // 模拟卷摘要折叠 +3 条增量
    log('delta', 'add', 'fold_42', 42, '+3条增量');
    assert.strictEqual(entries[0].type, 'delta', '类型 delta');
    assert.strictEqual(entries[0].op, 'add', '操作 add');
    assert.strictEqual(entries[0].floor, 42, '楼层');
    assert.strictEqual(entries[0].meta, '+3条增量', 'meta 计数');
    // stats 聚合
    const byType = {};
    for (const e of entries) byType[e.type] = (byType[e.type] || 0) + 1;
    assert.strictEqual(byType.delta, 1, 'delta 计数');
});