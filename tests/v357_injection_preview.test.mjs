// tests/v357_injection_preview.test.mjs
// LonSha 记忆引擎 v3.57.0 注入预览测试套件
// 涵盖：P19 注入缓存（双路径）+ 预览视图（分块渲染/区块高亮/空态）+ 入口卡片

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');
const suSrc = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf-8');

test('=== 1. 注入缓存双路径验证 ===', () => {
    assert.ok(src.includes("this._lastInjection = { html: inj2, ts: Date.now(), prev: this._lastInjection?.html || null }"), '主路径缓存（含 prev 快照）');
    assert.ok(src.includes("this._lastInjection = { html: inj, ts: Date.now(), prev: this._lastInjection?.html || null }"), '降级路径缓存（含 prev 快照）');
    // 缓存的是裁剪后最终形态（buildInjection 返回值）
    assert.ok(src.includes('const inj2 = this.buildInjection(candidateItems);'), '主路径调用在位');
    console.log('✓ 注入缓存双路径验证通过');
});

test('=== 2. 预览视图验证 ===', () => {
    assert.ok(suSrc.includes("viewType === 'injection'"), 'injection 视图分发');
    assert.ok(suSrc.includes("title = '👁 注入内容预览'"), '视图标题');
    assert.ok(suSrc.includes('已经预算裁剪，即 AI 真实所见'), '“真实所见”语义标注');
    assert.ok(suSrc.includes("inj.html.split"), '分块渲染');
    // 区块标题高亮（绿色 meta 行）
    assert.ok(suSrc.includes('color:#a6e3a1'), '区块头高亮');
    // XSS  转义
    assert.ok(suSrc.includes('esc(trimmed)'), '行级转义');
    // 空态提示
    assert.ok(suSrc.includes('暂无注入记录'), '空态提示');
    console.log('✓ 预览视图验证通过');
});

test('=== 3. 入口卡片验证 ===', () => {
    assert.ok(suSrc.includes('data-view="injection"'), 'injection 入口卡片');
    assert.ok(suSrc.includes('s._lastInjection ? \'👁\' : \'—\''), '卡片状态图标');
    assert.ok(suSrc.includes('注入预览 👁'), '卡片标签');
    console.log('✓ 入口卡片验证通过');
});