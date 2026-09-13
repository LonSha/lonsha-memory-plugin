// tests/v356_outline_autoplan.test.mjs
// LonSha 记忆引擎 v3.56.0 大纲自动规划测试套件
// 涵盖：P18 OutlineDirector.planNext（耗尽触发/防重入/冷却/LLM 规划解析闭环）

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

test('=== 1. planNext 静态验证 ===', () => {
    assert.ok(src.includes('async planNext(config, llm, engine, floor)'), 'planNext 方法');
    assert.ok(src.includes('outlineAutoPlan && this.outline.exhausted && !this.outline._planning'), '耗尽触发守卫');
    assert.ok(src.includes('outlinePlanCooldownFloors'), '冷却配置');
    assert.ok(src.includes('outlineAutoPlan: true,'), '配置开关显式声明');
    assert.ok(src.includes('outlineDirectorEnabled: true,'), '导演开关显式声明');
    assert.ok(src.includes('优先消化【未结悬念】'), '规划 prompt 含悬念消化指令');
    assert.ok(src.includes('this._planning = true;') && src.includes('finally { this._planning = false; }'), '防重入标志成对');
    console.log('✓ planNext 静态验证通过');
});

test('=== 2. planNext 行为测试（mock LLM 闭环）===', async (t) => {
    const clsStart = src.indexOf('class OutlineDirector');
    const brace = src.indexOf('{', clsStart);
    let depth = 0, clsEnd = -1;
    for (let i = brace; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { clsEnd = i; break; } }
    }
    const odCode = src.slice(clsStart, clsEnd + 1);
    const OutlineDirector = new Function('return (' + odCode + ');')();

    const od = new OutlineDirector();
    const raw = `<stage_title>第一阶段</stage_title><stage_goal>测试</stage_goal><stage_tempo>mixed</stage_tempo>
<node><node_title>n1</node_title><node_goal>g1</node_goal><turn pacing="setup">t1</turn></node>`;
    od.parseOutline(raw, 1);
    od.advanceTurn(2);  // 耗尽

    const planRaw = `<stage_title>第二阶段</stage_title><stage_goal>复仇推进</stage_goal><stage_tempo>surge</stage_tempo>
<node><node_title>追查</node_title><node_goal>追查真凶</node_goal><turn pacing="pressure">夜探敌营</turn><turn pacing="turn">发现内鬼</turn></node>`;
    const mockLlm = { callAPI: async () => planRaw };

    const cfg = { outlineAutoPlan: true, outlinePlanCooldownFloors: 10 };
    const mockEngine = {
        summary: { getActiveSummaries: () => [{ text: '摘要A' }] },
        suspense: { openItems: () => [{ content: '未解之谜' }] },
        getKnownCharacters: () => ['苏晨', '苏若雪']
    };

    const st = await od.planNext(cfg, mockLlm, mockEngine, 50);
    assert.ok(st, '规划成功');
    assert.equal(st.title, '第二阶段');
    assert.equal(st.tempo, 'surge');
    assert.equal(st.nodes.length, 1);
    assert.equal(st.nodes[0].turns.length, 2);
    assert.equal(od.currentTurn.goal, '夜探敌营', '轮指针重置');
    assert.equal(od._lastPlanFailFloor, 0, '成功后冷却清零');

    // 未耗尽时不再规划
    const st2 = await od.planNext(cfg, mockLlm, mockEngine, 51);
    assert.equal(st2, null, '未耗尽不规划');

    // 冷却：失败后冷却期内不重试（注意：planNext 成功后新大纲有 2 turn，需推进两次才耗尽）
    od.advanceTurn(60);
    od.advanceTurn(61);  // 耗尽
    const badLlm = { callAPI: async () => '垃圾输出无标签' };
    const st3 = await od.planNext(cfg, badLlm, mockEngine, 61);
    assert.equal(st3, null, '解析失败返回 null');
    const st4 = await od.planNext(cfg, mockLlm, mockEngine, 63);
    assert.equal(st4, null, '冷却期内（61→63 < 10）不重试');
    const st5 = await od.planNext(cfg, mockLlm, mockEngine, 76);
    assert.ok(st5, '冷却期后重试成功');

    // 开关关闭
    const od2 = new OutlineDirector();
    od2.parseOutline(raw, 1);
    od2.advanceTurn(2);
    const st7 = await od2.planNext({ outlineAutoPlan: false }, mockLlm, mockEngine, 90);
    assert.equal(st7, null, 'outlineAutoPlan=false 时不规划');
    console.log('✓ planNext 行为测试验证通过');
});