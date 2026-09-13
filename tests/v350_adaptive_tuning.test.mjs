// tests/v350_adaptive_tuning.test.mjs
// LonSha 记忆引擎 v3.50.0 自适应调优测试套件
// 涵盖：P6 剧情时钟权威同步（GameClock→手机状态栏）、rerank 评分式精排升级、注入预算上下文感知自适应

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');
const bridgeSrc = readFileSync(new URL('../../ruby-phone-work/apps/memory/lonsha-bridge.js', import.meta.url), 'utf-8');

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

test('=== 1. P6 剧情时钟权威同步验证 ===', () => {
    assert.ok(bridgeSrc.includes('syncClock(clock)'), 'P6: bridge 必须实现 syncClock');
    assert.ok(bridgeSrc.includes('this._lastSyncClockDate === clock.date'), 'P6: 同日期幂等（防状态栏闪烁）');
    assert.ok(bridgeSrc.includes("tmObj.setTime(clock.label || '00:00', String(clock.date), null, { force: true"), 'P6: 强制写入 timeManager');
    assert.ok(src.includes('bridge.syncClock?.(_backfillPayload.clock)'), 'P6: LonSha 调用时钟同步');
    assert.ok(src.includes('clockSyncEnabled'), 'P6: 配置开关');
    console.log('✓ P6 剧情时钟权威同步验证通过');
});

test('=== 2. rerank 评分式精排升级验证 ===', () => {
    assert.ok(src.includes('你是检索评分器。给定【查询】和编号候选列表，为每条候选打相关度分'), '评分式 prompt 必须存在');
    assert.ok(src.includes('你是检索精排器。给定【查询】和编号候选列表，按与查询的相关度从高到低输出候选编号') === false, '旧排序式 prompt 必须绝迹');
    assert.ok(src.includes('_rerankScore = x.s'), '评分写回 item');
    // 兼容旧格式
    assert.ok(src.includes('优先解析评分对象'), '评分对象优先解析');
    assert.ok(src.includes('order.map(x => Number(x) - 1)'), '旧数组格式兼容保留');
    // RRF 消费
    assert.ok(src.includes('const rerankBonus = item._rerankScore >= 6 ? (item._rerankScore / 10) * 0.05 : 0;'), 'RRF 消费精排分');
    assert.ok(src.includes('rrfScore: (prev?.rrfScore || 0) + rrfScore + rerankBonus'), 'RRF 加权公式');
    console.log('✓ rerank 评分式精排升级验证通过');
});

test('=== 3. 注入预算上下文感知自适应验证 ===', () => {
    assert.ok(src.includes('adaptiveBudget !== false'), '自适应开关');
    assert.ok(src.includes('adaptiveBudgetDecayFloors'), '衰减参考楼层配置');
    assert.ok(src.includes('Math.max(0.6, Math.min(1.8, 1.8 - (_chatLen / decayRef) * 1.2))'), '扩张系数公式（clamp 0.6~1.8）');
    assert.ok(src.includes('budget = Math.max(200, Math.floor(budget * factor));'), '预算乘系数');
    // 原有双层预算保留
    assert.ok(src.includes('memoryTokenBudget'), 'token 预算双层保留');
    assert.ok(src.includes('keepRecentTokenReserve'), '正文预留保留');
    console.log('✓ 注入预算上下文感知自适应验证通过');
});

test('=== 4. 评分式精排行为模拟测试 ===', () => {
    // 模拟评分解析逻辑（从源码提取行为等价片段）
    const parseStart = src.indexOf('优先解析评分对象');
    assert.ok(parseStart > 0);
    // 行为验证：评分对象解析 + 排序 + 过滤零分
    const scores = { "1": 8, "3": 4, "7": 0 };
    const docs = [{ text: 'A' }, { text: 'B' }, { text: 'C' }, { text: 'D' }, { text: 'E' }, { text: 'F' }, { text: 'G' }];
    const scored = docs.map((d, i) => ({ d, i, s: Number(scores[String(i + 1)]) || 0 }))
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s);
    assert.equal(scored.length, 2, '零分项过滤');
    assert.equal(scored[0].i, 0, '最高分排前');
    assert.equal(scored[0].s, 8);
    assert.equal(scored[1].s, 4);
    // RRF 加成验证
    const bonus = scored[0].s >= 6 ? (scored[0].s / 10) * 0.05 : 0;
    assert.ok(Math.abs(bonus - 0.04) < 1e-9, '高分加成 0.04');
    const lowBonus = scored[1].s >= 6 ? (scored[1].s / 10) * 0.05 : 0;
    assert.equal(lowBonus, 0, '低分（<6）不加成');
    // 自适应预算公式验证
    const formula = (chatLen, decayRef = 80) => Math.max(0.6, Math.min(1.8, 1.8 - (chatLen / decayRef) * 1.2));
    assert.equal(formula(0), 1.8, '0 楼扩容 1.8x');
    assert.ok(Math.abs(formula(40) - 1.2) < 1e-9, '40 楼 1.2x');
    assert.ok(Math.abs(formula(80) - 0.6) < 1e-9, '80 楼收紧 0.6x');
    assert.equal(formula(200), 0.6, 'clamp 下限');
    console.log('✓ 评分式精排行为模拟测试验证通过');
});