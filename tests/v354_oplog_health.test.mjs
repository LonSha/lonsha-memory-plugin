// tests/v354_oplog_health.test.mjs
// LonSha 记忆引擎 v3.54.0 事件溯源与手机端体检测试套件
// 涵盖：P15 OpLog 事件溯源日志（行为/环形缓冲/查询/持久化）、P15 埋点覆盖、手机端体检结论

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

test('=== 1. OpLog 行为测试（环形缓冲/查询/统计/持久化）===', () => {
    const clsStart = src.indexOf('class OpLog');
    const brace = src.indexOf('{', clsStart);
    let depth = 0, clsEnd = -1;
    for (let i = brace; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { clsEnd = i; break; } }
    }
    const OpLog = new Function('return (' + src.slice(clsStart, clsEnd + 1) + ');')();
    const log = new OpLog();

    // 基础记录
    log.log('summary', 'add', 'sum_10', 10, '苏晨拔剑');
    log.log('graph', 'add', '苏晨', 10, 'character node');
    log.log('status', 'update', '2 changes', 11, '苏晨.好感,王五.信任');
    assert.equal(log.entries.length, 3);
    assert.equal(log.entries[0].seq, 1);
    assert.equal(log.entries[2].seq, 3);

    // 查询
    assert.equal(log.queryByFloor(10).length, 2);
    assert.equal(log.queryByType('graph').length, 1);
    assert.equal(log.queryByRef('苏晨').length, 1);
    assert.equal(log.recent(2).length, 2);

    // 环形缓冲：600 条只留 500
    for (let i = 0; i < 600; i++) log.log('item', 'update', `item_${i}`, i % 100, '');
    assert.equal(log.entries.length, 500, '环形缓冲 500');
    assert.equal(log.entries[0].ref.startsWith('item_'), true, '旧 summary 条目被挤出');

    // stats：前 3 条（summary/graph/status）+ 600 item = 603，环形挤掉最旧 103 条（3 条非 item + 100 条 item）
    const st = log.stats();
    assert.equal(st.total, 500);
    assert.equal(st.byType.item, 500, '非 item 3 条 + 最旧 100 条 item 被挤出');

    // 持久化
    const exp = log.export();
    const log2 = new OpLog();
    log2.import(exp);
    assert.equal(log2.entries.length, 500);
    assert.equal(log2._seq, log._seq, 'seq 连续性恢复');
    console.log('✓ OpLog 行为测试验证通过');
});

test('=== 2. 埋点覆盖验证（六条主路径）===', () => {
    assert.ok(src.includes("this.opLog?.log('summary', 'add', `sum_${message?.index || 0}`"), 'summary 埋点');
    assert.ok(src.includes("this.opLog?.log('graph', 'add', canonical"), 'graph 角色埋点');
    assert.ok(src.includes("this.opLog?.log('status', 'update'"), 'status 埋点');
    assert.ok(src.includes("this.opLog?.log('suspense', 'add'"), 'suspense 埋点');
    assert.ok(src.includes("this.opLog?.log('item', 'update'"), 'item 埋点');
    assert.ok(src.includes("this.opLog?.log('rollback', 'remove'"), 'rollback 埋点');
    // 埋点必须不引用不存在的变量（rollback 无 reason 参数）
    assert.ok(src.includes("`deleted by ${reason") === false, 'rollback 埋点不得引用不存在的 reason');
    console.log('✓ 埋点覆盖验证通过');
});

test('=== 3. OpLog 持久化链路验证 ===', () => {
    assert.ok(src.includes('this.opLog = new OpLog();'), 'engine 实例化');
    assert.equal(src.split('opLog: this.opLog?.export?.() || null,').length - 1, 2, 'collectExport 两处');
    assert.ok(src.includes('if (pack.opLog && this.opLog) this.opLog.import(pack.opLog);'), 'storage.load 恢复');
    assert.ok(src.includes('for (const e of (this.opLog?.entries || [])) if (typeof e.floor === \'number\') e.floor = dec(e.floor);'), 'shiftFloorsFrom 楼层位移');
    console.log('✓ OpLog 持久化链路验证通过');
});

test('=== 4. 手机端体检结论固化 ===', () => {
    // 体检结论 1：v3.48 修复后无新死类（MemoryCore/pool/emotion/bridge 均为活链路）
    const phoneIdx = readFileSync(new URL('../../ruby-phone-work/index.js', import.meta.url), 'utf-8');
    assert.ok(phoneIdx.includes('new MemoryCore(storage)'), 'MemoryCore 活链路');
    assert.ok(phoneIdx.includes('_mc._sleepTick % 12 === 0'), 'sleep() 巩固活链路（v3.48 激活）');
    assert.ok(phoneIdx.includes('mountLonShaBridge'), 'bridge 活链路');
    // 体检结论 2：bridge 增量索引在位（v3.52）
    assert.ok(bridgeSrc.includes('_indexedIds'), 'BM25 增量索引');
    // 体检结论 3：bridge 日记/时钟通道在位（v3.49/v3.50）
    assert.ok(bridgeSrc.includes('backfillDiaries(diaries)'), '日记双端通道');
    assert.ok(bridgeSrc.includes('syncClock(clock)'), '时钟同步通道');
    // 体检结论 4：console 治理记录（647 条暂不治理——移动端容错日志有诊断价值，列入观察项）
    console.log('✓ 手机端体检结论固化验证通过');
});