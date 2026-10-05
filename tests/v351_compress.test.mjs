// tests/v351_compress.test.mjs
// LonSha 记忆引擎 v3.51.0 摘要压缩质量优化测试套件
// 涵盖：compressSummary 主干句压缩（氛围句过滤/动作句提权/时序保持）+ 向量索引接入

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { createRequire } from 'node:module';

const srcRaw = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');
/* [v3.266.0 A1 第六刀] MemoryGraph / SummarySystem / GameClock / CharacterState 已外移
 *   memory-core.js：本文件的类抽取面与静态面改读「入口 + 该模块」合看（语义一字不改，
 *   只换被读的文件面；不放宽：每一条仍须在场）。 */
const src = srcRaw + String.fromCharCode(10) + readFileSync(new URL('../memory-core.js', import.meta.url), 'utf8');

/* [v3.279.0 O7] 抽取面改为**真模块装载**：修前本档从源码抠 SummarySystem 类体 + new Function 重放，
 *   那是与 memory-core.js 真类**并行的第二实现**（类外符号靠注入，漂移了本档绿着而真类已坏）。
 *   现在直接 require 真模块拿真类 —— 语义一字不改，只换「被跑的对象」；静态面仍读「入口 + 该模块」合看。 */
const require_ = createRequire(import.meta.url);
const MC = require_(new URL('../memory-core.js', import.meta.url).pathname);

function braceEnd(s, open) {
    let depth = 0;
    for (let i = open; i < s.length; i++) {
        const ch = s[i];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return i; }
        else if (ch === "'" || ch === '"' || ch === '`') { const q = ch; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } }
        else if (ch === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; }
    }
    return -1;
}

test('=== 1. compressSummary 主干句压缩行为测试 ===', () => {
    // [v3.279.0 O7] 真模块装载（修前是抠类体 + new Function 重放）
    const ss = new MC.SummarySystem();

    // 场景 1：氛围句 + 动作句混合——动作句应胜出
    const mixed = '气氛变得紧张起来。苏晨拔出短剑指向王五。空气中弥漫着火药味。王五说我不怕你。两人随即大打出手。';
    const c1 = ss.compressSummary(mixed, 120);
    assert.ok(c1.includes('苏晨拔出短剑'), '动作句保留');
    assert.ok(c1.includes('王五说我不怕你'), '台词句保留');
    assert.ok(!c1.includes('气氛变得紧张'), '氛围句被过滤');
    assert.ok(!c1.includes('空气中弥漫'), '氛围句被过滤');

    // 场景 2：短文本直通
    assert.equal(ss.compressSummary('短文本。', 120), '短文本。');

    // 场景 3：空文本
    assert.equal(ss.compressSummary('', 120), '');

    // 场景 4：maxLen 截断保底
    const long = '第一句说了重要的事。'.repeat(20);
    const c4 = ss.compressSummary(long, 60);
    assert.ok(c4.length <= 62, 'smartTruncate 保底生效');

    // 场景 5：阅读理解句式降权
    const c5 = ss.compressSummary('他挥手告别。这体现了他的复杂心态。她转身离开。', 120);
    assert.ok(!c5.includes('体现'), '阅读理解句式被过滤');
    console.log('✓ compressSummary 主干句压缩行为测试验证通过');
});

test('=== 2. 向量索引接入验证 ===', () => {
    assert.ok(src.includes('this.summary.compressSummary(messageText, 160)'), '向量索引素材使用压缩摘要');
    assert.ok(src.includes('compressSummary(text, maxLen) {'), '方法定义存在');
    // 正文摘要路径不受影响（createSummary 仍用 smartTruncate 兜底）
    // [v3.91] 兜底长度已从硬编码 200 改为 opts.maxLen（接入 config.maxSummaryLength），缺省仍为 200
    assert.ok(src.includes('this.smartTruncate(safeMes, Number.isFinite(_maxLen) && _maxLen > 0 ? Math.round(_maxLen) : 200)'), '正文摘要兜底路径保留（smartTruncate + 缺省 200）');
    console.log('✓ 向量索引接入验证通过');
});