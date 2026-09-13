// tests/v355_oplog_browser.test.mjs
// LonSha 记忆引擎 v3.55.0 事件审计浏览器测试套件
// 涵盖：P16 OpLog 审计浏览器视图 + 状态面板入口卡片

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');
const suSrc = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf-8');

test('=== 1. OpLog 审计浏览器视图验证 ===', () => {
    assert.ok(suSrc.includes("viewType === 'oplog'"), 'oplog 视图分发');
    assert.ok(suSrc.includes("title = '🔍 事件审计链（OpLog）'"), '视图标题');
    assert.ok(suSrc.includes('opLog.recent(80)'), '最近 80 条渲染');
    assert.ok(suSrc.includes('const st = opLog.stats()'), '统计头');
    assert.ok(suSrc.includes('环形 500'), '环形说明');
    assert.ok(suSrc.includes('rollback: \'↩️回滚\''), '回滚类型中文化');
    // XSS 防护（esc 转义）
    assert.ok(suSrc.includes('${esc(e.ref)}') && suSrc.includes('${esc(e.op)}'), '条目字段转义');
    console.log('✓ OpLog 审计浏览器视图验证通过');
});

test('=== 2. 状态面板入口卡片验证 ===', () => {
    assert.ok(suSrc.includes('data-view="oplog"'), 'oplog 入口卡片');
    assert.ok(suSrc.includes('s.opLog?.entries?.length || 0'), '卡片计数');
    assert.ok(suSrc.includes('事件审计 👁'), '卡片标签');
    console.log('✓ 状态面板入口卡片验证通过');
});

test('=== 3. 数据通路验证 ===', () => {
    // settings-ui 的 s = this.engine；opLog 是 engine 实例属性
    assert.ok(src.includes('this.opLog = new OpLog();'), 'engine.opLog 实例属性');
    assert.ok(src.includes('class OpLog'), 'OpLog 类');
    // showBrowser 的 esc 转义函数在 oplog 视图前定义
    const escIdx = suSrc.indexOf('const esc = (t)');
    const oplogIdx = suSrc.indexOf("viewType === 'oplog'");
    assert.ok(escIdx > 0 && oplogIdx > escIdx, 'esc 函数先于 oplog 视图定义');
    console.log('✓ 数据通路验证通过');
});