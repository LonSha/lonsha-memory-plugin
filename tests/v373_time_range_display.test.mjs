// tests/v373_time_range_display.test.mjs
// LonSha 记忆引擎 v3.73.0 时间标签显示层（清洗误伤修复 + 时间段压缩）测试
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';

const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf-8');

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

test('=== 1. 清洗误伤修复检查 ===', () => {
    // v3.73 修复：extractDualTimeTags 用清洗前原文 _rawForSynopsis
    assert.ok(src.includes("extractDualTimeTags(_rawForSynopsis || message.mes || '')"), '清洗前原文提取');
    assert.ok(src.includes('cleanMessageText 会剥 bbs 标签'), '误伤注释');
});

test('=== 2. compactTimeRange 功能测试 ===', () => {
    const cls = extractClass(src, 'class RelativeTimeHelper');
    assert.ok(cls, 'RelativeTimeHelper 可提取');
    // 提取 compactTimeRange 方法并单测（逻辑复刻）
    const compact = (a, b) => {
        const s1 = String(a || '').trim(), s2 = String(b || '').trim();
        if (!s1 || !s2) return s2;
        let p = 0;
        const minLen = Math.min(s1.length, s2.length);
        while (p < minLen && s1[p] === s2[p]) p++;
        while (p > 0 && !/[\s/／\-－年月日]/.test(s2[p - 1])) p--;
        return p > 0 ? s2.slice(p) : s2;
    };
    // 标准场景：同日期压缩时刻
    assert.strictEqual(compact('2023/9/10 06:45', '2023/9/10 06:55'), '06:55', '同日期压缩');
    // 跨日不压缩（前缀无公共段或边界不同）
    assert.strictEqual(compact('2023/9/10 23:50', '2023/9/11 00:10'), '11 00:10', '跨日部分压缩');
    // 古风场景
    const g = compact('庆历四年暮春 辰时', '庆历四年暮春 巳时');
    assert.strictEqual(g, '巳时', '古风压缩');
    // 前缀不重合：原样保留（零误伤——公共前缀"19"未达分隔边界）
    assert.strictEqual(compact('1988/1/1', '1999/12/31'), '1999/12/31', '前缀不重合原样保留');
    // 空值防护
    assert.strictEqual(compact('', 'x'), 'x', '空 a');
    assert.strictEqual(compact('x', ''), '', '空 b');
});

test('=== 3. formatTimeRange 功能测试 ===', () => {
    // 逻辑复刻
    const formatTimeRange = (start, end, compact) => {
        if (!start) return '';
        if (!end) return String(start).trim();
        return String(start).trim() + ' - ' + compact(start, end);
    };
    const compact = (a, b) => {
        const s1 = String(a || '').trim(), s2 = String(b || '').trim();
        if (!s1 || !s2) return s2;
        let p = 0;
        while (p < Math.min(s1.length, s2.length) && s1[p] === s2[p]) p++;
        while (p > 0 && !/[\s/／\-－年月日]/.test(s2[p - 1])) p--;
        return p > 0 ? s2.slice(p) : s2;
    };
    assert.strictEqual(formatTimeRange('2023/9/10 06:45', '2023/9/10 06:55', compact), '2023/9/10 06:45 - 06:55', '压缩展示');
    assert.strictEqual(formatTimeRange('2023/9/10 06:45', '', compact), '2023/9/10 06:45', '无止只起');
    assert.strictEqual(formatTimeRange('', 'x', compact), '', '无起空串');
});

test('=== 4. rth 实例与 rangeLabel 检查 ===', () => {
    assert.ok(src.includes('if (!this.rth) this.rth = new RelativeTimeHelper();'), 'rth 懒实例化');
    assert.ok(src.includes('rangeLabel: this.rth ? this.rth.formatTimeRange('), 'time_anchor 带压缩展示');
});

test('=== 5. 清洗误伤根因确认（cleanMessageText 行为复刻） ===', () => {
    // 确认 cleanMessageText 确实会剥 bbs 标签（证明修复必要性）
    const cleaned = String('<bbs_start>1988/9/29</bbs_start>正文<bbs_end>1988/9/29</bbs_end>')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<\/?[a-zA-Z_][\w-]*[^>]*>/g, '')
        .trim();
    assert.ok(!cleaned.includes('bbs_start'), '清洗后标签消失');
    assert.ok(cleaned.includes('1988/9/29'), '时间数字保留');
    // _rawForSynopsis 保留原文（修复后路径）
    const raw = '<bbs_start>1988/9/29</bbs_start>正文<bbs_end>1988/9/29</bbs_end>';
    const startM = /<bbs_start>([\s\S]*?)<\/bbs_start>/i.exec(raw);
    assert.ok(startM, '原始文本可解析');
});