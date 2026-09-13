// tests/v365_oplog_lockfact.test.mjs
// LonSha 记忆引擎 v3.65.0 OpLog 锁定埋点 + 矛盾视图 + 桥统计测试
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';

const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf-8');
const su = readFileSync('/home/user/lonsha-memory-plugin/settings-ui.js', 'utf-8');
const bridge = readFileSync('/home/user/ruby-phone-work/apps/memory/lonsha-bridge.js', 'utf-8');

test('=== 1. OpLog locked_fact 埋点检查 ===', () => {
    assert.ok(src.includes("lockFact(text)"), 'lockFact 包装方法');
    assert.ok(src.includes("unlockFact(id)"), 'unlockFact 包装方法');
    assert.ok(src.includes("this.opLog?.log?.('locked_fact', 'add'"), '锁定 add 埋点');
    assert.ok(src.includes("this.opLog?.log?.('locked_fact', 'remove'"), '解除 remove 埋点');
    // 类型注释更新
    assert.ok(src.includes('conflict|pair|locked_fact'), '类型注释更新');
});

test('=== 2. UI 改调包装方法（含降级兜底） ===', () => {
    // 优先走引擎包装（带埋点），降级直调 summary
    assert.ok(su.includes('s.lockFact ? s.lockFact(text) : s.summary.addLockedFact(text, curFloor)'), '添加走包装方法');
    assert.ok(su.includes('s.unlockFact ? s.unlockFact(id) : s.summary.removeLockedFact(id)'), '删除走包装方法');
});

test('=== 3. 未决矛盾视图检查 ===', () => {
    assert.ok(su.includes("viewType === 'conflicts'"), 'conflicts 视图分支');
    assert.ok(su.includes('⚔️ 未决矛盾账本'), '视图标题');
    assert.ok(su.includes('sevBadge'), 'severity 徽标函数');
    assert.ok(su.includes('🔴高'), '高严重度徽标');
    assert.ok(su.includes('🟡中'), '中严重度徽标');
    assert.ok(su.includes('🔵低'), '低严重度徽标');
    assert.ok(su.includes('矛盾是剧情资产'), '资产说明');
    assert.ok(su.includes('esc(c.subject)'), 'XSS 转义');
    assert.ok(su.includes('s.conflicts?.conflicts?.length || 0'), '卡片动态计数');
});

test('=== 4. 矛盾卡片位置检查 ===', () => {
    const lfIdx = su.indexOf('data-view="lockedfacts"');
    const cfIdx = su.indexOf('data-view="conflicts"');
    const injIdx = su.indexOf('data-view="injection"');
    assert.ok(cfIdx > lfIdx, '矛盾卡片在锁定事实之后');
    assert.ok(cfIdx < injIdx, '在注入预览之前');
});

test('=== 5. 桥统计 lockedFactsIngested 检查 ===', () => {
    assert.ok(bridge.includes('lockedFactsIngested: 0'), 'stats 初始字段');
    assert.ok(bridge.includes('this.stats.lockedFactsIngested = (this.stats.lockedFactsIngested || 0) + 1'), '回填累加');
    // 累加在 record 之后（只有实际写入才计数）
    const recIdx = bridge.indexOf("[铁律] ${lf.text}");
    const cntIdx = bridge.indexOf('this.stats.lockedFactsIngested');
    assert.ok(recIdx > 0 && cntIdx > recIdx, '计数在 record 之后');
});

test('=== 6. OpLog 埋点功能测试（模拟 lockFact 逻辑） ===', () => {
    // 复刻 lockFact 的埋点逻辑
    const entries = [];
    let seq = 0;
    const log = (type, op, ref, floor, meta) => {
        entries.push({ seq: ++seq, ts: Date.now(), type: String(type || '').slice(0, 20), op: String(op || '').slice(0, 10), ref: String(ref || '').slice(0, 60), floor: floor ?? null, meta: meta ? String(meta).slice(0, 80) : '' });
    };
    // 模拟锁定
    const id = 'lf_test1234_abcd';
    log('locked_fact', 'add', id.slice(0, 12), 42, '林一在聚贤庄留下解药');
    assert.strictEqual(entries[0].type, 'locked_fact', '类型 locked_fact');
    assert.strictEqual(entries[0].op, 'add', '操作 add');
    assert.strictEqual(entries[0].floor, 42, '楼层记录');
    // 模拟解除
    log('locked_fact', 'remove', id.slice(0, 12), 42, '林一在聚贤庄留下解药');
    assert.strictEqual(entries[1].op, 'remove', '操作 remove');
    // stats 聚合
    const byType = {};
    for (const e of entries) byType[e.type] = (byType[e.type] || 0) + 1;
    assert.strictEqual(byType.locked_fact, 2, 'locked_fact 计数 2');
});