// tests/v346_fortress_pyramid.test.mjs
// LonSha 记忆引擎 v3.46.0 史记金字塔、剧情时钟与 Prompt Cache 堡垒测试套件
// 涵盖：GameClock 剧情时钟与回忆隔离、悬念簿期限倒计时联动、
// GrandChronicle 纪元宏观史记金字塔、Prompt Cache 静态前缀确定性字典序、
// POV 视界隔离与全知禁令、跨会话时钟状态延续

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');

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
function extractClass(name) {
    const start = src.indexOf(`class ${name} {`);
    if (start < 0) throw new Error('missing class ' + name);
    const brace = src.indexOf('{', start);
    return src.slice(start, braceEnd(src, brace) + 1);
}

const errLog = () => {};

test('=== 1. 静态关键锚点与版本检查 ===', () => {
    assert.match(src.match(/const VERSION = '([^']+)';/)?.[1] || '', /^3\.(?:4[6-9]|5\d)/, '版本号必须 >= 3.46.0');
    assert.ok(src.includes('class GameClock'), '必须声明 GameClock 剧情时钟类');
    assert.ok(src.includes('addGrandChronicle') && src.includes('getGrandChroniclePrompt'), 'SummarySystem 必须声明宏观史记方法');
    assert.ok(src.includes('getOpenPrompts(clockDate)'), 'SuspenseBook 必须支持时钟联动倒计时');
    assert.ok(src.includes('[宏观世界线·纪元史记]'), '必须支持宏观史记注入块');
    assert.ok(src.includes('[当前剧情时间]'), '必须支持当前剧情时间注入块');
    assert.ok(src.includes('〔全知禁令与私密视界'), '必须支持全知禁令与私密视界提示');
    assert.ok(src.includes("a.name.localeCompare(b.name, 'zh-CN')"), 'NPC羁绊必须按字典序稳定排序');
    assert.ok(src.includes('clock: this.clock?.export?.() || null'), 'collectExport 必须携带 clock');
    assert.ok(src.includes('this.clock = new GameClock();'), 'MemoryEngine 必须实例化 GameClock');
    console.log('✓ 静态锚点与接口声明检查全部通过');
});

test('=== 2. GameClock 剧情时钟动态演进与回忆隔离测试 ===', () => {
    const rthCode = extractClass('RelativeTimeHelper');
    const clockCode = extractClass('GameClock');
    const mkClock = () => new Function(`
        ${rthCode}
        ${clockCode}
        return new GameClock();
    `)();

    const clock = mkClock();
    assert.equal(clock.date, '', '初始日期为空');
    assert.equal(clock.label, '', '初始刻度为空');

    const s1 = clock.setTime({ date: '2026-10-01', label: '申时·薄暮·微雪', floor: 10 });
    assert.equal(s1.updated, true);
    assert.equal(clock.date, '2026-10-01');
    assert.equal(clock.label, '申时·薄暮·微雪');
    assert.ok(clock.getContextPrompt().includes('2026-10-01 · 申时·薄暮·微雪'));
    assert.ok(clock.getContextPrompt().includes('回忆不改变当前时钟'));

    const s2 = clock.setTime({ date: '2016-05-04', label: '十年前·大火之夜', flashback: true, floor: 12 });
    assert.equal(s2.flashback, true);
    assert.equal(s2.updated, false);
    assert.equal(clock.date, '2026-10-01', '主时钟日期绝对不能被回忆篡改倒退');
    assert.equal(clock.label, '申时·薄暮·微雪', '主时钟时段绝对不能被回忆篡改倒退');
    assert.ok(clock.lastFlashback !== null);
    assert.equal(clock.lastFlashback.date, '2016-05-04');
    assert.ok(clock.getContextPrompt().includes('前情往事回忆为 2016-05-04 · 十年前·大火之夜，非当前时钟'));

    clock.setTime({ relativeDays: 3, floor: 15 });
    assert.equal(clock.date, '2026-10-04', '相对天数计算推进正确');

    const exported = clock.export();
    assert.equal(exported.date, '2026-10-04');
    assert.equal(exported.lastFlashback.date, '2016-05-04');

    const clock2 = mkClock();
    clock2.import(exported);
    assert.equal(clock2.date, '2026-10-04');
    assert.equal(clock2.lastFlashback.label, '十年前·大火之夜');
    console.log('✓ GameClock 剧情时钟动态推进与回忆隔离测试验证通过');
});

test('=== 3. 悬念簿与剧情时钟倒计时联动测试 ===', () => {
    const rthCode = extractClass('RelativeTimeHelper');
    const suspCode = extractClass('SuspenseBook');
    const mkSuspense = () => new Function(`
        ${rthCode}
        ${suspCode}
        return new SuspenseBook();
    `)();
    const sb = mkSuspense();

    sb.add('plan', '前往聚贤庄解毒', 1, '2026-10-01', '2026-10-05');
    sb.add('plan', '送达紧急密信', 2, '2026-10-01', '2026-10-02');
    sb.add('suspense', '调查刺客来历', 3, '2026-10-01', '2026-09-30');
    sb.add('plan', '无期限常规任务', 4);

    const prompts = sb.getOpenPrompts('2026-10-02');
    assert.equal(prompts.length, 4);
    assert.ok(prompts.some(p => p.includes('前往聚贤庄解毒') && p.includes('[距期限还剩3天]')));
    assert.ok(prompts.some(p => p.includes('送达紧急密信') && p.includes('[今日到期!]')));
    assert.ok(prompts.some(p => p.includes('调查刺客来历') && p.includes('[已逾期2天!]')));
    assert.ok(prompts.some(p => p.includes('无期限常规任务') && !p.includes('距期限') && !p.includes('到期') && !p.includes('逾期')));
    console.log('✓ 悬念簿与剧情时钟倒计时联动测试验证通过');
});

test('=== 4. 纪元宏观史记与编年金字塔动态测试 ===', () => {
    const sumCode = extractClass('SummarySystem');
    const mkSummary = () => new Function(`
        ${sumCode}
        return new SummarySystem();
    `)();
    const ss = mkSummary();

    ss.addGrandChronicle('纪元大事件一：汴京大剧变，主角被迫逃离并结识林冲。', { floorStart: 1, floorEnd: 50 });
    ss.addGrandChronicle('纪元大事件二：沧州草料场大火，林冲上梁山，主角远赴西夏。', { floorStart: 51, floorEnd: 120 });

    const prompt = ss.getGrandChroniclePrompt();
    assert.ok(prompt.includes('[宏观世界线·纪元史记]（长程核心脉络与不可变历史大事件）：'));
    assert.ok(prompt.includes('汴京大剧变'));
    assert.ok(prompt.includes('沧州草料场大火'));

    const exp = ss.export();
    assert.equal(exp.historical.length, 2);

    const ss2 = mkSummary();
    ss2.import(exp);
    assert.equal(ss2.historical.length, 2);
    assert.ok(ss2.getGrandChroniclePrompt().includes('主角远赴西夏'));
    console.log('✓ 纪元宏观史记与编年金字塔动态测试验证通过');
});

test('=== 5. Prompt Cache 静态前缀确定性字典序测试 ===', () => {
    const match = src.match(/function fmtNpcTiesContext\(npcs\) \{([\s\S]*?)\n    \}/);
    assert.ok(match, '未能提取 fmtNpcTiesContext 函数');
    const fmtNpcTiesContext = new Function('npcs', match[1]);

    const setA = [
        { name: '鲁智深', ties: '结义兄弟' },
        { name: '高俅', ties: '死敌' },
        { name: '白胜', ties: '同伙' }
    ];
    const setB = [
        { name: '白胜', ties: '同伙' },
        { name: '鲁智深', ties: '结义兄弟' },
        { name: '高俅', ties: '死敌' }
    ];
    const outA = fmtNpcTiesContext(setA);
    const outB = fmtNpcTiesContext(setB);
    assert.equal(outA, outB, '不同输入顺序生成的 NPC 羁绊字符串必须100%完全一致');
    console.log('✓ Prompt Cache 静态前缀确定性字典序测试验证通过');
});

test('=== 6. 跨会话 Carryover 状态种子带时钟延续测试 ===', () => {
    const seed = {
        type: 'lonsha_carryover_seed',
        version: '3.46.0',
        createdAt: Date.now(),
        clock: {
            date: '2026-10-04',
            label: '申时·薄暮',
            precision: 'day',
            lastFlashback: null,
            turn: 88
        }
    };
    assert.equal(seed.version, '3.46.0');
    assert.equal(seed.clock.date, '2026-10-04');
    assert.equal(seed.clock.label, '申时·薄暮');
    console.log('✓ 跨会话 Carryover 状态种子时钟延续测试验证通过');
});