// tests/v371_time_prefix.test.mjs
// LonSha 记忆引擎 v3.71.0 相对时间前缀 + 完整时间锚点协议测试
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';

const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf-8');

// 提取全局函数（裸括号平衡）
function extractFunction(source, startMarker) {
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

// 两函数拼接提取（relativeTimeLabel 内部调用 parseStoryDateLoose，需同作用域）
function extractBoth() {
    const pFn = extractFunction(src, 'function parseStoryDateLoose');
    const rFn = extractFunction(src, 'function relativeTimeLabel');
    if (!pFn || !rFn) return null;
    return new Function(pFn + '\nreturn ' + rFn)();
}

test('=== 1. 静态关键字检查 ===', () => {
    assert.ok(src.includes('function parseStoryDateLoose'), '日期解析函数');
    assert.ok(src.includes('function relativeTimeLabel'), '相对前缀函数');
    assert.ok(src.includes('宁可不标，绝不标错'), '设计底线');
    // A2 注入接入
    assert.ok(src.includes("relativeTimeLabel(i.storyTime, this.clock?.date || '')"), '时间线调用');
    // B 完整时间锚点协议
    assert.ok(src.includes('必须保留完整年份或纪年'), '完整年份协议');
    assert.ok(src.includes('禁止省略年份'), '禁止短格式');
});

test('=== 2. 标准日历相对前缀测试 ===', () => {
    const relativeTimeLabel = extractBoth();
    assert.ok(relativeTimeLabel, '两函数拼接提取');
    // 今天/昨天/前天/大前天
    assert.strictEqual(relativeTimeLabel('2026/9/10', '2026/9/10'), '今天');
    assert.strictEqual(relativeTimeLabel('2026/9/9', '2026/9/10'), '昨天');
    assert.strictEqual(relativeTimeLabel('2026/9/8', '2026/9/10'), '前天');
    assert.strictEqual(relativeTimeLabel('2026/9/7', '2026/9/10'), '大前天');
    // 未来方向
    assert.strictEqual(relativeTimeLabel('2026/9/11', '2026/9/10'), '明天');
    assert.strictEqual(relativeTimeLabel('2026/9/12', '2026/9/10'), '后天');
    // N天前
    assert.strictEqual(relativeTimeLabel('2026/9/1', '2026/9/10'), '9天前');
    // N个月前
    assert.strictEqual(relativeTimeLabel('2026/3/10', '2026/9/10'), '6个月前');
    // N年前
    assert.strictEqual(relativeTimeLabel('2024/9/10', '2026/9/10'), '2年前');
    // 长跨度
    const label = relativeTimeLabel('2024/12/10', '2026/9/10');
    assert.ok(label.includes('个月前'), '长跨度复合格式: ' + label);
});

test('=== 3. 中文日期格式解析测试 ===', () => {
    const pFn = extractFunction(src, 'function parseStoryDateLoose');
    const parseStoryDateLoose = new Function('return (' + pFn + ')')();
    // YYYY年M月D日
    const d1 = parseStoryDateLoose('1988年9月29日');
    assert.strictEqual(d1.type, 'standard');
    assert.strictEqual(d1.year, 1988);
    assert.strictEqual(d1.month, 9);
    assert.strictEqual(d1.day, 29);
    // M月D日（无年）
    const d2 = parseStoryDateLoose('3月12日');
    assert.strictEqual(d2.type, 'standard');
    assert.strictEqual(d2.year, null);
    assert.strictEqual(d2.month, 3);
    // 斜杠格式
    const d3 = parseStoryDateLoose('2026/9/10');
    assert.strictEqual(d3.year, 2026);
});

test('=== 4. 架空历法安全降级测试 ===', () => {
    const pFn = extractFunction(src, 'function parseStoryDateLoose');
    const parseStoryDateLoose = new Function('return (' + pFn + ')')();
    const relativeTimeLabel = extractBoth();
    // 架空月名解析
    const d = parseStoryDateLoose('霜月3日');
    assert.strictEqual(d.type, 'fantasy');
    assert.strictEqual(d.monthId, '霜月');
    assert.strictEqual(d.day, 3);
    // 同月：可算
    assert.strictEqual(relativeTimeLabel('霜月3日', '霜月5日'), '2天前');
    assert.strictEqual(relativeTimeLabel('霜月5日', '霜月5日'), '今天');
    // 跨架空月：放弃（宁可不标，绝不标错）
    assert.strictEqual(relativeTimeLabel('霜月3日', '雪月5日'), '');
    // 架空 vs 标准：类型不匹配放弃
    assert.strictEqual(relativeTimeLabel('霜月3日', '2026/9/10'), '');
    // 解析不出：空串
    assert.strictEqual(relativeTimeLabel('某天', '2026/9/10'), '');
    assert.strictEqual(relativeTimeLabel('', '2026/9/10'), '');
});

test('=== 5. 注入行渲染复刻测试 ===', () => {
    const items = [
        { text: '林一获得解药', storyTime: '2026/9/9' },
        { text: '玉佩下落不明', storyTime: '' },
    ];
    const clockDate = '2026/9/10';
    const relativeTimeLabel = extractBoth();
    const rendered = items.map(i => {
        const rel = i.storyTime ? relativeTimeLabel(i.storyTime, clockDate) : '';
        return `- ${i.text}${rel ? '（' + rel + '）' : ''}`;
    });
    assert.strictEqual(rendered[0], '- 林一获得解药（昨天）', '带前缀');
    assert.strictEqual(rendered[1], '- 玉佩下落不明', '无时间不加前缀');
});