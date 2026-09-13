// tests/v349_pair_diary_bridge.test.mjs
// LonSha 记忆引擎 v3.49.0 群像共同记忆与日记双端互通测试套件
// 涵盖：P4 心理暗流日记双端互通（bridge.backfillDiaries）、P5 PairMemory 群像归因式记忆

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

test('=== 1. P4 日记双端互通静态验证 ===', () => {
    assert.ok(bridgeSrc.includes('backfillDiaries(diaries)'), 'P4: bridge 必须实现 backfillDiaries');
    assert.ok(bridgeSrc.includes('lonsha_${author}_${d.floor'), 'P4: 幂等 id 格式');
    assert.ok(bridgeSrc.includes('没说出口：'), 'P4: 手机日记渲染 secret');
    assert.ok(bridgeSrc.includes('对用户态度：'), 'P4: 手机日记渲染 attitude');
    assert.ok(bridgeSrc.includes('主观印象：'), 'P4: 手机日记渲染 subjRelations');
    assert.ok(src.includes('bridge.backfillDiaries?.(this.diary.diaries)'), 'P4: LonSha 调用日记回填');
    assert.ok(src.includes('diaryBridgeEnabled'), 'P4: 配置开关');
    console.log('✓ P4 日记双端互通静态验证通过');
});

test('=== 2. PairMemory 群像归因式记忆行为测试 ===', () => {
    const normStart = src.indexOf('function normalizeCharName(');
    const normBody = src.slice(normStart, braceEnd(src, src.indexOf('{', normStart)) + 1);
    const clsStart = src.indexOf('class PairMemory');
    const brace = src.indexOf('{', clsStart);
    let depth = 0, clsEnd = -1;
    for (let i = brace; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { clsEnd = i; break; } }
    }
    const pmCode = src.slice(clsStart, clsEnd + 1);
    const { PairMemory } = new Function(`${normBody}\n${pmCode}\nreturn { PairMemory };`)();

    const pm = new PairMemory();
    assert.equal(pm.toPrompt([]), '', '空记忆注入为空');

    // 归因式登记
    assert.equal(pm.addEntry('苏晨', '苏若雪', 100, '腊月', {
        event: '雨夜共伞逃过巡卫追捕',
        actorDo: '苏晨把伞让给了苏若雪',
        otherThink: '苏若雪觉得苏晨在刻意讨好',
        bothAgreed: '对外宣称只是同路',
        knownBy: 'both'
    }), true);
    // 幂等
    assert.equal(pm.addEntry('苏晨', '苏若雪', 101, '腊月', {
        event: '雨夜共伞逃过巡卫追捕', knownBy: 'both'
    }), false, '同事件幂等');
    // 无效输入
    assert.equal(pm.addEntry('', '某人', 102, '', { event: '某事件' }), false);
    assert.equal(pm.addEntry('A', 'A', 103, '', { event: '自环事件' }), false, '同角色拒登记');
    // 关键归因：key 排序归一（A|B 与 B|A 同一关系对）
    assert.equal(pm.addEntry('苏若雪', '苏晨', 104, '腊月', { event: '交换信物', knownBy: 'both' }), true);
    assert.equal(pm.pairs.length, 1, '排序归一后同一关系对');
    assert.equal(pm.pairs[0].entries.length, 2);

    // 注入（在场过滤）
    const p1 = pm.toPrompt(['苏晨']);
    assert.ok(p1.includes('[群像共同记忆·归因式]'), '注入含群像头');
    assert.ok(p1.includes('苏晨 × 苏若雪'), '注入含关系对（排序后）');
    assert.ok(p1.includes('苏晨把伞让给了苏若雪'), '注入含 actorDo 归因');
    assert.ok(p1.includes('苏若雪觉得苏晨在刻意讨好'), '注入含 otherThink 归因');
    assert.ok(p1.includes('共同：对外宣称只是同路'), '注入含 bothAgreed');
    // 不在场角色不注入
    const p2 = pm.toPrompt(['路人甲']);
    assert.equal(p2, '', '在场过滤生效');

    // 单方知晓标注
    pm.addEntry('苏晨', '王五', 105, '腊月', { event: '暗中调查王五底细', knownBy: 'one' });
    const p3 = pm.toPrompt(['苏晨', '王五']);
    assert.ok(p3.includes('⚠️仅单方知晓'), '单方知晓显式标注');

    // removeByFloor + export/import
    assert.equal(pm.removeByFloor(105), 1, '按楼删');
    const exp = pm.export();
    const pm2 = new PairMemory();
    pm2.import(exp);
    assert.equal(pm2.pairs.length, pm.pairs.length);
    console.log('✓ PairMemory 群像归因式记忆行为测试验证通过');
});

test('=== 3. PairMemory 接入链路完整性测试 ===', () => {
    assert.ok(src.includes('this.pairMem = new PairMemory();'), 'MemoryEngine 实例化 pairMem');
    assert.ok(src.includes('this.pairMem.addFromExtracted(extracted.relationships'), '提取路由接入');
    assert.ok(src.includes('this.pairMem.toPrompt('), 'buildInjection 注入');
    assert.equal(src.split('pairMem: this.pairMem.export()').length - 1, 2, 'collectExport 两处');
    assert.ok(src.includes('pack.pairMem && this.pairMem'), 'storage.load 恢复');
    assert.ok(src.includes('rollbackFloor.群像回滚'), 'rollbackFloor 联动');
    assert.ok(src.includes('for (const p of (this.pairMem?.pairs || [])) for (const e of p.entries) e.floor = dec(e.floor);'), 'shiftFloorsFrom 位移');
    assert.ok(src.includes('pairMemoryEnabled'), '配置开关');
    console.log('✓ PairMemory 接入链路完整性测试验证通过');
});