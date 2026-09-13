// tests/v363_locked_facts_ui.test.mjs
// LonSha 记忆引擎 v3.63.0 锁定事实 UI 管理 + 手机端回填测试
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';

const su = readFileSync('/home/user/lonsha-memory-plugin/settings-ui.js', 'utf-8');
const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf-8');
const bridge = readFileSync('/home/user/ruby-phone-work/apps/memory/lonsha-bridge.js', 'utf-8');

test('=== 1. settings-ui 静态关键字检查 ===', () => {
    assert.ok(su.includes('data-view="lockedfacts"'), '锁定事实卡片');
    assert.ok(su.includes("viewType === 'lockedfacts'"), '视图分支');
    assert.ok(su.includes('🔒 用户锁定剧情事实'), '视图标题');
    assert.ok(su.includes('ls-lf-input'), '添加输入框');
    assert.ok(su.includes('ls-lf-add'), '添加按钮');
    assert.ok(su.includes('ls-lf-del'), '删除按钮');
    assert.ok(su.includes('data-lfid'), '删除按钮 id 标注');
    assert.ok(su.includes('逐字'), '逐字保护说明');
    assert.ok(su.includes('校验器防遗漏'), '校验器提示');
});

test('=== 2. settings-ui 交互绑定检查 ===', () => {
    // 添加流程：addLockedFact + toast + 视图刷新
    assert.ok(su.includes('addLockedFact(text, curFloor)'), '添加调用');
    assert.ok(su.includes("plugin.showBrowser('lockedfacts')"), '视图刷新');
    // 删除流程：confirm + removeLockedFact
    assert.ok(su.includes('removeLockedFact(id)'), '删除调用');
    assert.ok(su.includes('解除锁定'), '删除确认文案');
    // Enter 提交
    assert.ok(su.includes("if (e.key === 'Enter') doAdd()"), 'Enter 提交');
    // XSS 防护：锁定文本经 esc 渲染
    assert.ok(su.includes('esc(f.text)'), '文本 esc 转义');
    // 空输入防护
    assert.ok(su.includes("if (!text) { toast('请输入事实内容'); return; }"), '空输入防护');
});

test('=== 3. 卡片位置与计数检查 ===', () => {
    // 锁定事实卡片在事件审计卡片之后、注入预览之前（状态总览卡片区内）
    const cardIdx = su.indexOf('data-view="lockedfacts"');
    const oplogIdx = su.indexOf('data-view="oplog"');
    const injIdx = su.indexOf('data-view="injection"');
    assert.ok(cardIdx > oplogIdx, '在事件审计之后');
    assert.ok(cardIdx < injIdx, '在注入预览之前');
    // 卡片计数动态读取
    assert.ok(su.includes('s.summary?.getLockedFacts?.().length || 0'), '动态计数');
});

test('=== 4. 双端桥接：锁定事实回填通道 ===', () => {
    // 桥侧：lockedFacts 通道
    assert.ok(bridge.includes('lockedFacts'), '桥侧 lockedFacts 通道');
    assert.ok(bridge.includes('[铁律]'), '铁律标签');
    assert.ok(bridge.includes("tags: ['locked-fact']"), '标签');
    assert.ok(bridge.includes('pinned: true, importance: 9'), 'pinned 高重要度');
    // 节流：最多 6 条
    assert.ok(bridge.includes('slice(-6)'), '回填节流 6 条');
    // LonSha 侧：payload 携带
    assert.ok(src.includes('lockedFacts: (this.config.config.lockedFactsEnabled !== false) ? this.summary.getLockedFacts() : []'), 'payload 携带锁定事实');
});

test('=== 5. 桥侧语法与幂等检查 ===', () => {
    // 幂等：memoryCore.record 幂等由 pinned 短语前缀保证（[铁律] 前缀固定）
    assert.ok(bridge.includes("record('ai', `[铁律] ${lf.text}"), '记录格式统一');
    // 空值防护
    assert.ok(bridge.includes('if (!lf?.text) continue;'), '空文本跳过');
    // Array.isArray 防护
    assert.ok(bridge.includes('Array.isArray(lockedFacts)'), '类型防护');
});