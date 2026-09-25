import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const ui = readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf8');

test('v3.128 注入槽位清单化（LEGACY 清空模式）', () => {
  assert.match(src, /const INJECT_SLOTS = \[/);
  assert.match(src, /for \(const slot of INJECT_SLOTS\) writeInjectSlot\(slot\.key, '', slot\.clearDepth\)/);
  // 清单必须覆盖当前全部在写槽位
  assert.match(src, /key: 'lonsha_memory',/);
  assert.match(src, /key: 'lonsha_memory_history',/);
  // 不得再残留手写双行清空
  assert.doesNotMatch(src, /writeInjectSlot\('lonsha_memory', '', 0\);\s*\n\s*writeInjectSlot\('lonsha_memory_history', '', 9999\)/);
});

test('v3.128 token 估算 CJK 口径且用于注入记录与面板', () => {
  // 提取纯函数体做行为验证（无 window/宿主依赖）
  const i = src.indexOf('function estimateTextTokens(text) {');
  const end = src.indexOf('\n    }', i);
  assert.ok(i > 0 && end > i);
  const fn = new Function('return ' + src.slice(i, end + 6))();
  assert.equal(fn(''), 0);
  const zh = '今天天气很好我们一起出去逛街吃饭';           // 16 汉字
  const en = 'abcdefghijklmnopqrstuvwxyz0123456789';      // 36 ASCII
  assert.equal(fn(zh), Math.ceil(zh.length * 0.9));       // CJK ~0.9 token/字
  assert.equal(fn(en), Math.ceil(en.length / 4));         // ASCII ~4 字符/token
  assert.ok(fn(zh + en) > fn(en), '混合文本应大于纯 ASCII');
  assert.ok(fn(zh) > Math.ceil(zh.length / 4) * 2, '对中文应显著高于旧 chars/4 口径');
  // 引擎双路径写入 tokens 字段 + UI 展示
  // [v3.215.0] R2-A：读数收口到唯一构造点 `_injectionRecord`（原两条路径各写一份
  //   `_lastInjection` 的形态正是本版修掉的归属塌陷）。断言改为：
  //   构造点内 tokens 走同一 CJK 口径 + 真生成路径确实经构造点落地 + UI 展示仍在。
  assert.match(src, /tokens: Number\.isFinite\(e\.tokens\) \? e\.tokens : estimateTextTokens\(html\),/);
  // [v3.216.0] R2-B：生成路径改调 `_injectionStage`（读数由代际确认后的提交落成）。
  assert.match(src, /this\._injectionStage\(\{\s*\n\s*html: inj2 \|\| '',/);
  assert.match(src, /this\._injectionRecord\(\{\s*\n\s*html: p\.html, origin: 'generation',/);
  assert.match(ui, /约 \$\{inj\.tokens\} token（CJK 口径估算）/);
});

test('v3.128 钱财账本 zod 式幅度 clamp 与开关默认值', () => {
  assert.match(src, /maxMoneyDelta: 0,/);
  assert.match(src, /moneyLedgerEnabled: true,/);
  assert.match(src, /next = prev \+ Math\.sign\(next - prev\) \* maxDelta/);
  assert.match(src, /'ledger\.clamp'/);
  // UI 暴露开关与滑条
  assert.match(ui, /ck\('moneyLedgerEnabled'/);
  assert.match(ui, /data-cfg-num="maxMoneyDelta"/);
});