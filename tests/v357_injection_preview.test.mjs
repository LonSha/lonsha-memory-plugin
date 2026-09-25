// tests/v357_injection_preview.test.mjs
// LonSha 记忆引擎 v3.57.0 注入预览测试套件
// 涵盖：P19 注入缓存（双路径）+ 预览视图（分块渲染/区块高亮/空态）+ 入口卡片

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');
const suSrc = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf-8');

test('=== 1. 注入缓存双路径验证 ===', () => {
    // [v3.128] 注入缓存结构新增 tokens 字段——原精确字符串断言改为语义正则（仍要求 html/ts/prev 三要素在位）
    // [v3.215.0] R2-A：读数收口到唯一构造点 `_injectionRecord`，「双路径」不再各写一份字面量
    //   —— 真生成走 `_injectionRecord`（origin:'generation'），诊断 dry-run 另存
    //   `_diagnostics.dryRun`（**不写** `_lastInjection`）。故断言改为守
    //   「构造点自带 html/tokens/ts/prev 四要素」+「两条入口都在位且一写一不写」。
    assert.ok(src.includes('this._lastInjection = ' + 'rec'), '唯一构造点写读数本体（含 prev 快照与 token 估算）');
    assert.ok(/prev: \(this\._lastInjection && this\._lastInjection\.html\) \|\| null,/.test(src), 'prev 快照要素在位');
    assert.ok(/tokens: Number\.isFinite\(e\.tokens\) \? e\.tokens : estimateTextTokens\(html\),/.test(src), 'token 估算要素在位');
    assert.ok(/origin: String\(e\.origin \|\| 'generation'\),/.test(src), '真生成路径 origin 明确（诊断必须另走一路）');
    // [v3.216.0] R2-B：生成路径改调 `_injectionStage`（无条件暂存，零块也留读数），
    //   读数由代际确认后的 `_injectionCommit` 落成。
    assert.ok(/this\._injectionStage\(\{\s*\n\s*html: inj2 \|\| '',/.test(src), '主路径无条件暂存（零块也留读数）');
    assert.ok(/this\.engine\._injectionCommit\(/.test(src), '读数由提交落成（不得在 await 内落地）');
    assert.ok(!/this\._lastInjection = \{ html: inj/.test(src), '降级路径不再单独写 `_lastInjection`（诊断另存 `_diagnostics.dryRun`）');
    // 缓存的是裁剪后最终形态（buildInjection 返回值）——[v3.87] 起 inj2 为 let（追加前情注入）
    assert.ok(src.includes('let inj2 = this.buildInjection(candidateItems);'), '主路径调用在位');
    console.log('✓ 注入缓存双路径验证通过');
});

test('=== 2. 预览视图验证 ===', () => {
    assert.ok(suSrc.includes("viewType === 'injection'"), 'injection 视图分发');
    assert.ok(suSrc.includes("title = '👁 注入内容预览'"), '视图标题');
    assert.ok(suSrc.includes('已经预算裁剪，即 AI 真实所见'), '“真实所见”语义标注');
    assert.ok(suSrc.includes("inj.html.split"), '分块渲染');
    // 区块标题高亮（绿色 meta 行）——[v3.94] 实现已主题变量化为 var(--ls-success,#3fb950)
    assert.ok(suSrc.includes('color:var(--ls-success,#3fb950)'), '区块头高亮');
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