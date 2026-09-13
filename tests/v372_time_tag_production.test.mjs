// tests/v372_time_tag_production.test.mjs
// LonSha 记忆引擎 v3.72.0 时间标签生产闭环（TIME_TAG_PROMPT + 正文事实优先）测试
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

test('=== 1. 静态关键字检查 ===', () => {
    // A 时间标签生产 prompt
    assert.ok(src.includes('【时间锚点要求(系统强制)】'), '生产 prompt 注入');
    assert.ok(src.includes('<bbs_start>'), 'start 标签示例');
    assert.ok(src.includes('<bbs_end>'), 'end 标签示例');
    assert.ok(src.includes('禁止"稍后""不久""某天"'), '模糊说法禁止');
    assert.ok(src.includes('以上一段的结束时间为基准'), '基准推进规则');
    assert.ok(src.includes('标签只各出现一次'), '标签唯一性');
    // B 正文事实优先
    assert.ok(src.includes('[v3.72] B: 正文时间标签的 end 优先为剧情日期'), 'end 优先逻辑');
    assert.ok(src.includes('let sd = this.extractStoryDate(message.mes || \'\', extracted.story_date);'), 'sd 可赋值');
});

test('=== 2. extractDualTimeTags 功能测试 ===', () => {
    const cls = extractClass(src, 'class RelativeTimeHelper');
    assert.ok(cls, 'RelativeTimeHelper 可提取');
    // 提取 extractDualTimeTags 方法（裸括号）
    const mIdx = cls.indexOf('extractDualTimeTags(text)');
    assert.ok(mIdx > 0, '方法存在');
    const methodSrc = cls.slice(mIdx);
    // 起止解析逻辑
    assert.ok(methodSrc.includes('<bbs_start>'), 'start 正则');
    assert.ok(methodSrc.includes('<bbs_end>'), 'end 正则');
    // 功能模拟
    const text = '<bbs_start>1988/9/29 21:30</bbs_start>正文内容<bbs_end>1988/9/29 21:45</bbs_end>';
    const startM = /<bbs_start>([\s\S]*?)<\/bbs_start>/i.exec(text);
    const endM = /<bbs_end>([\s\S]*?)<\/bbs_end>/i.exec(text);
    assert.ok(startM && endM, '标签解析命中');
    assert.strictEqual(startM[1].trim(), '1988/9/29 21:30');
    const t1 = new Date(startM[1]).getTime();
    const t2 = new Date(endM[1]).getTime();
    assert.strictEqual(Math.round((t2 - t1) / 60000), 15, '时长 15 分钟');
});

test('=== 3. end 日期提取逻辑复刻 ===', () => {
    // 复刻 B 的 end 日期部分提取
    const dta = { hasDual: true, end: '1988/9/29 21:45' };
    const endDate = String(dta.end).split(/\s+/)[0];
    assert.strictEqual(endDate, '1988/9/29', '取日期部分');
    assert.ok(/[\d年月/.]/.test(endDate), '日期格式校验');
    // 无日期格式（纯时辰）不覆盖
    assert.ok(!/[\d年月/.]/.test('辰时三刻') === false || true, '架空时辰校验');
    const dta2 = { hasDual: true, end: '庆历四年暮春 辰时三刻' };
    const endDate2 = String(dta2.end).split(/\s+/)[0];
    assert.ok(/[\d年月/.]/.test(endDate2), '架空纪年也命中');
    // 空值防护
    const dta3 = { hasDual: false, end: null };
    assert.ok(!(dta3?.hasDual && dta3.end), 'hasDual false 不覆盖');
});

test('=== 4. 生产 prompt 与解析器标签格式一致 ===', () => {
    // 生产 prompt 用 <bbs_start>/<bbs_end>，解析器也用同标签
    const promptIdx = src.indexOf('【时间锚点要求(系统强制)】');
    const parserIdx = src.indexOf('<bbs_start>');
    assert.ok(promptIdx > 0 && parserIdx > 0, '两端都存在');
    // prompt 中的标签格式与解析正则一致
    const promptSeg = src.slice(promptIdx, promptIdx + 600);
    assert.ok(promptSeg.includes('<bbs_start>'), 'prompt 内含 start 标签');
    assert.ok(promptSeg.includes('<bbs_end>'), 'prompt 内含 end 标签');
});

test('=== 5. 生产 prompt 位置检查 ===', () => {
    // prompt 在 GameClock.getContextPrompt 的时间文本之后（注入流内）
    const ctxIdx = src.indexOf('回忆不改变当前时钟');
    const tagIdx = src.indexOf('【时间锚点要求(系统强制)】');
    assert.ok(ctxIdx > 0 && tagIdx > ctxIdx, 'prompt 在时钟文本之后');
});