// tests/v358_full_instrumentation.test.mjs
// LonSha 记忆引擎 v3.58.0 全量埋点测试套件
// 涵盖：P20 七路埋点补全（diary/pov/timeline/card/money/conflict/pair）——OpLog 13 类型全覆盖

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');

test('=== 1. OpLog 13 类型全覆盖验证 ===', () => {
    const types = ['summary', 'graph', 'status', 'suspense', 'item', 'rollback',
                   'diary', 'pov', 'timeline', 'card', 'money', 'conflict', 'pair'];
    for (const t of types) {
        assert.ok(src.includes(`opLog?.log('${t}'`), `埋点缺失: ${t}`);
    }
    // 注释中的类型清单与实际埋点一致
    assert.ok(src.includes('summary|graph|status|item|suspense|diary|pov|timeline|card|money|conflict|pair'), 'OpLog 类型注释');
    console.log('✓ OpLog 13 类型全覆盖验证通过');
});

test('=== 2. 新增七路埋点上下文正确性 ===', () => {
    // diary：generateLiving 后
    assert.ok(src.includes("if (dn) this.opLog?.log('diary', 'add', `${dn} entries`"), 'diary 埋点在写入数确认后');
    // pov：主 pov_memories 路径（owner 归一化后）
    assert.ok(src.includes("this.opLog?.log('pov', 'add', owner, message.index || 0, String(p.content).slice(0, 40))"), 'pov 埋点含 owner 与内容摘录');
    // timeline：主 story_date 路径
    assert.ok(src.includes("this.opLog?.log('timeline', 'add', `tl_${message.index || 0}`"), 'timeline 埋点');
    // card：forge 后
    assert.ok(src.includes("this.opLog?.log('card', 'forge', `${n} cards`"), 'card 埋点');
    // money：账本更新后
    assert.ok(src.includes("this.opLog?.log('money', 'update', `${extracted.money_changes.length} changes`"), 'money 埋点');
    // conflict：登记后
    assert.ok(src.includes("this.opLog?.log('conflict', 'add', `${n} conflicts`"), 'conflict 埋点');
    // pair：群像更新后
    assert.ok(src.includes("this.opLog?.log('pair', 'add', `${n} pairs`"), 'pair 埋点');
    console.log('✓ 新增七路埋点上下文正确性验证通过');
});