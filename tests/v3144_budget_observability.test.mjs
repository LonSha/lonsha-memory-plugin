// tests/v3144_budget_observability.test.mjs
// [v3.144] 预算实测（丢弃可见性）：超预算裁剪不再静默
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');
test('v3.144 buildInjection 记录预算实测七要素', () => {
    const st = src.indexOf('_lastBudgetStats = {');
    assert.ok(st > 0, '统计写入存在');
    const blk = src.slice(st, src.indexOf('}', st));
    for (const k of ['requested', 'beforeChars', 'afterChars', 'droppedChars', 'keptBlocks', 'totalBlocks', 'droppedSamples', 'strategy', 'tokens', 'tokenBudget', 'ts']) {
        assert.ok(blk.includes(k + ':'), `缺度量 ${k}`);
    }
    assert.match(src, /const _preTrimLen = full\.length/, '裁剪前基线在 trim 之前捕获');
    const pre = src.indexOf('const _preTrimLen'), trim = src.indexOf('_ir.trimToBudget(full, budget');
    const post = src.indexOf('_lastBudgetStats = {');
    assert.ok(pre < trim && trim < post, '基线→裁剪→统计 顺序正确');
    assert.match(src, /catch \(e\) \{ errLog\(e, 'buildInjection\.预算实测'\); \}/, '统计失败不影响注入（非致命且有 errLog）');
});
test('v3.144 面板播报丢弃量与样本，并做 HTML 转义', () => {
    assert.match(ui, /_lastBudgetStats/, '面板读取实测');
    assert.match(ui, /丢弃 \$\{_bs\.droppedChars\} 字符/, '丢弃字符数可见');
    assert.match(ui, /被丢弃示例/, '丢弃样本可见');
    assert.match(ui, /replace\(\/\[<&\]\/g/, '样本转义（防注入内容里的 < & 破坏面板 DOM）');
    assert.match(ui, /如需更少丢弃可上调注入预算/, '给出可执行建议');
});
test('v3.144 head 声明必须是 let（+= 对 const 抛 TypeError，语法门查不出）', () => {
    const declRe = /(let|const) head = `<div class="ls-hint">最近一次实际注入/;
    const m = declRe.exec(ui);
    assert.ok(m, '注入预览 head 声明可定位');
    assert.equal(m[1], 'let', 'head 必须为 let：面板实测条用 head += 追加，const 会在运行时抛 TypeError');
    assert.ok(ui.slice(m.index, m.index + 3000).includes('head +='), '确实存在 += 追加（若删除 += 则本断言提示可同步简化）');
});
