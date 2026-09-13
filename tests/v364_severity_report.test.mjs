// tests/v364_severity_report.test.mjs
// LonSha 记忆引擎 v3.64.0 severity 全链路 + 全景报告锁定板块 + 手机铁律标识测试
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';

const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf-8');
const mv = readFileSync('/home/user/ruby-phone-work/apps/memory/memory-view.js', 'utf-8');
const css = readFileSync('/home/user/ruby-phone-work/apps/memory/memory.css', 'utf-8');
const bridge = readFileSync('/home/user/ruby-phone-work/apps/memory/lonsha-bridge.js', 'utf-8');

// 提取 ConflictBook 类（裸括号平衡法）
function extractClass(source, startMarker) {
    const start = source.indexOf(startMarker);
    if (start < 0) return null;
    let depth = 0, started = false;
    for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') { depth--; if (started && depth === 0) return source.slice(start, i + 1); }
    }
    return null;
}

test('=== 1. 静态关键字检查 ===', () => {
    // A 全景报告锁定板块
    assert.ok(src.includes('## 🔒 用户锁定事实'), '报告板块标题');
    assert.ok(src.includes('以下事实由用户显式锁定'), '板块说明');
    assert.ok(src.includes('- 锁定事实：'), '概览计数');
    // B severity 全链路
    assert.ok(src.includes("add(subject, versionA, versionB, note, floor, storyTime, severity)"), 'add 签名扩展');
    assert.ok(src.includes("['low', 'medium', 'high'].includes(severity)"), 'severity 白名单');
    assert.ok(src.includes('c?.severity'), 'addFromExtracted 透传');
    assert.ok(src.includes('【严重度:'), 'toPrompt 标注');
    // C 手机铁律标识
    assert.ok(mv.includes('ironTag'), 'ironTag');
    assert.ok(mv.includes('mem-iron'), 'mem-iron class');
    assert.ok(mv.includes('🔒铁律'), '铁律标签文本');
    assert.ok(css.includes('.mem-iron'), 'CSS 样式');
    assert.ok(css.includes('#fbbf24'), '金色渐变');
});

test('=== 2. ConflictBook severity 功能测试 ===', () => {
    const cls = extractClass(src, 'class ConflictBook');
    assert.ok(cls, 'ConflictBook 可提取');
    const ConflictBook = new Function('return (' + cls + ')')();
    const cb = new ConflictBook();
    // severity 白名单：合法值透传
    assert.strictEqual(cb.add('灵石来源', '甲给的', '乙给的', '来源矛盾', 10, '3月12日', 'high'), true, 'high 登记成功');
    assert.strictEqual(cb.conflicts[0].severity, 'high', 'severity 保存');
    // 非法值兜底 medium
    assert.strictEqual(cb.add('玉佩归属', '在A手', '在B手', '归属矛盾', 11, '3月13日', 'critical'), true, '非法 severity 兜底');
    assert.strictEqual(cb.conflicts[1].severity, 'medium', '兜底为 medium');
    // 不传 severity 默认 medium
    assert.strictEqual(cb.add('口供冲突', 'X', 'Y', '', 12, ''), true, '不传 severity');
    assert.strictEqual(cb.conflicts[2].severity, 'medium', '默认 medium');
    // addFromExtracted 透传
    const cb2 = new ConflictBook();
    const n = cb2.addFromExtracted([
        { subject: '事实A', versionA: 'v1', versionB: 'v2', note: 'n', severity: 'low' },
        { subject: '事实B', versionA: 'v1', versionB: 'v2', severity: 'high' },
        { subject: '事实C', versionA: 'v1', versionB: 'v2' },
    ], 20, '3月14日');
    assert.strictEqual(n, 3, '3 条登记');
    assert.strictEqual(cb2.conflicts[0].severity, 'low', '透传 low');
    assert.strictEqual(cb2.conflicts[1].severity, 'high', '透传 high');
    assert.strictEqual(cb2.conflicts[2].severity, 'medium', '缺省 medium');
});

test('=== 3. ConflictBook toPrompt severity 标注测试 ===', () => {
    const cls = extractClass(src, 'class ConflictBook');
    const ConflictBook = new Function('return (' + cls + ')')();
    const cb = new ConflictBook();
    cb.add('事实A', 'v1', 'v2', 'n', 10, '', 'high');
    cb.add('事实B', 'v1', 'v2', 'n', 11, '', 'low');
    const prompt = cb.toPrompt();
    assert.ok(prompt.includes('【严重度:high】'), 'high 显式标注');
    assert.ok(prompt.includes('【严重度:low】'), 'low 显式标注');
    // medium 不标注（省 token）
    const cb2 = new ConflictBook();
    cb2.add('事实C', 'v1', 'v2', '', 12, '', 'medium');
    assert.ok(!cb2.toPrompt().includes('【严重度:'), 'medium 不标注');
});

test('=== 4. ConflictBook export/import 对称测试 ===', () => {
    const cls = extractClass(src, 'class ConflictBook');
    const ConflictBook = new Function('return (' + cls + ')')();
    const cb = new ConflictBook();
    cb.add('事实A', 'v1', 'v2', 'n', 10, '3月12日', 'high');
    const exported = cb.export();
    assert.ok(exported.conflicts[0].severity === 'high', 'export 含 severity');
    const cb2 = new ConflictBook();
    cb2.import(exported);
    assert.strictEqual(cb2.conflicts[0].severity, 'high', 'import 恢复 severity');
});

test('=== 5. 幂等与旧数据兼容测试 ===', () => {
    const cls = extractClass(src, 'class ConflictBook');
    const ConflictBook = new Function('return (' + cls + ')')();
    const cb = new ConflictBook();
    // 幂等：同 subject 同版本对不重复
    cb.add('事实A', 'v1', 'v2', '', 10, '', 'high');
    assert.strictEqual(cb.add('事实A', 'v1', 'v2', '', 10, '', 'high'), false, '重复登记拒绝');
    // 旧数据兼容：无 severity 字段的旧条目 toPrompt 不报错
    cb.conflicts.push({ subject: '旧条目', versionA: 'a', versionB: 'b', note: '', floor: 1, time: '', timestamp: 0 });
    assert.ok(typeof cb.toPrompt() === 'string' && cb.toPrompt().length > 0, '旧条目 toPrompt 兼容');
});

test('=== 6. 全景报告板块位置检查 ===', () => {
    // 锁定事实板块在概览之后、主角档案之前
    const repIdx = src.indexOf('exportMemoryReport');
    const lfIdx = src.indexOf('## 🔒 用户锁定事实');
    const protIdx = src.indexOf('## 🧍 主角档案');
    assert.ok(repIdx > 0 && lfIdx > repIdx, '板块在报告内');
    assert.ok(lfIdx < protIdx, '在主角档案之前');
});

test('=== 7. 手机端渲染完整性检查 ===', () => {
    // ironTag 在 lonshaTag 之后渲染（铁律优先显示在最前）
    const ironIdx = mv.indexOf('ironTag + lonshaTag');
    assert.ok(ironIdx > 0, 'ironTag 在渲染序最前');
    // 正则匹配 [铁律] 前缀
    assert.ok(mv.includes('/^\\[铁律\\]/.test(m.content'), '铁律前缀匹配');
    // 桥侧铁律条目带 [铁律] 前缀（对齐）
    assert.ok(bridge.includes('[铁律] '), '桥侧 [铁律] 前缀对齐');
});