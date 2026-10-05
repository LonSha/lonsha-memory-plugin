// tests/v340_database_evolution.test.mjs
// LonSha 记忆引擎 v3.40 数据库级演进测试套件
// 覆盖：检索管道流水线闭环（修复回响池早退劫胡）、写入协调器（Write Coalescing）、图数据库真空压缩（Graph Vacuum）
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

import { createRequire } from 'node:module';
const srcRaw = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
/* [v3.266.0 A1 第六刀] MemoryGraph / SummarySystem / GameClock / CharacterState 已外移
 *   memory-core.js：本文件的类抽取面与静态面改读「入口 + 该模块」合看（语义一字不改，
 *   只换被读的文件面；不放宽：每一条仍须在场）。 */
const src = srcRaw + String.fromCharCode(10) + readFileSync(new URL('../memory-core.js', import.meta.url), 'utf8');
/* [v3.264.0 A1 第五刀] StorageManager 已外移 memory-organs.js：抽取面改读该模块（语义一字不改）。 */
const orgSrc = readFileSync(new URL('../memory-organs.js', import.meta.url), 'utf8');
/* [v3.277.0 O7] 抽取面改为**真模块装载**：修前本档从源码抠类体 + new Function 重放，
 *   那是与真类**并行的第二实现**（类外符号靠注入，normalizeCharName / 关系冲突组还是
 *   本档手抄的副本）——两处一旦漂移，本档绿着而真类已坏。现在直接 require 真模块拿真类
 *   （memory-core.js 自带 normalizeCharName / errLog 收口，无需注入）——语义一字不改，
 *   只换「被跑的对象」；静态面仍读「入口 + 该模块」合看。 */

const require_ = createRequire(import.meta.url);
const MC = require_(new URL('../memory-core.js', import.meta.url).pathname);
const MO = require_(new URL('../memory-organs.js', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (msg) => { pass++; console.log('✓ ' + msg); };
const bad = (msg) => { fail++; console.log('✗ ' + msg); };


console.log('=== 1. 静态锚点检查 ===');
assert.ok(src.includes('vacuum(options = {})'), 'MemoryGraph 必须拥有 vacuum 压缩方法');
ok('MemoryGraph 拥有 vacuum 方法');

assert.ok(!src.includes('return inj1;'), 'onBeforeGeneration 中禁止回响池孤立早退');
ok('onBeforeGeneration 回响池与下游管道合并，杜绝早退截断');

assert.ok(orgSrc.includes('_isWriting') && orgSrc.includes('_pendingWrite'), 'StorageManager 必须拥有写入队列与写合并锁（[v3.264.0] 类已外移）');
ok('StorageManager 包含 Write Coalescing 写协调锁');

console.log('=== 2. Graph Vacuum (碎片整理与压缩) 动态测试 ===');
const mkGraph = () => new MC.MemoryGraph();

{
    const g = mkGraph();
    const idA = g.addNode({ name: '爱丽丝', type: 'character' });
    const idB = g.addNode({ name: '鲍勃', type: 'character' });
    
    // 模拟 10 次情感剧烈波动，生成 10 条已闭环的历史边
    for (let i = 1; i <= 10; i++) {
        g.addEdge({
            from: idA,
            to: idB,
            relation: i % 2 === 0 ? '恋人' : '决裂',
            active: false,
            validFrom: i * 5,
            validTo: i * 5 + 3,
            floor: i * 5
        });
    }
    assert.equal(g.edges.size, 10);

    // 插入 3 个孤儿 concept 节点（无任何关联边）
    g.addNode({ name: '废弃线索1', type: 'concept' });
    g.addNode({ name: '废弃线索2', type: 'concept' });
    g.addNode({ name: '废弃线索3', type: 'event' });
    assert.equal(g.nodes.size, 5);

    // 执行真空压缩：同实体对历史边最多保留 3 条，清理孤儿节点
    const result = g.vacuum({ maxHistoricalPerPair: 3, pruneOrphans: true });
    assert.equal(result.prunedEdges, 7, '应压缩淘汰 7 条冗余老旧历史边');
    assert.equal(result.prunedNodes, 3, '应清理 3 个无边连接的临时孤儿节点');
    assert.equal(g.edges.size, 3, '剩余边应为 3 条');
    assert.equal(g.nodes.size, 2, '核心角色节点应完整保留 (爱丽丝, 鲍勃)');
    
    // 验证名称索引同步自愈
    assert.equal(g.findCharacterByName('爱丽丝')?.name, '爱丽丝');
    assert.equal(g.findByNames(['废弃线索1']).length, 0, '已清理的孤儿节点索引应同步清除');
    ok('Graph Vacuum 历史边压缩与孤儿节点回收测试通过');
}

console.log('=== 3. StorageManager 写入合并 (Write Coalescing) 测试 ===');
const mkStorage = () => new MO.StorageManager();

{
    const sm = mkStorage();
    let saveChatCalls = 0;
    let lastSavedData = null;

    const mockContext = {
        chatMetadata: { extensions: {} },
        saveChat: async () => {
            saveChatCalls++;
            await new Promise(r => setTimeout(r, 20));
        }
    };
    globalThis.window = {
        SillyTavern: {
            getContext: () => mockContext
        }
    };

    // 瞬间连续并发调用 5 次 save
    const p1 = sm.save('chat_1', { seq: 1 });
    const p2 = sm.save('chat_1', { seq: 2 });
    const p3 = sm.save('chat_1', { seq: 3 });
    const p4 = sm.save('chat_1', { seq: 4 });
    const p5 = sm.save('chat_1', { seq: 5 });

    await Promise.all([p1, p2, p3, p4, p5]);

    // 验证：5 次并发保存被自动合并为 2 次实际 I/O（第 1 次正在写入，后续 2-5 被写合并为最新的第 5 次写入）
    assert.ok(saveChatCalls <= 2, `写调用未能合并，实际调用次数: ${saveChatCalls}`);
    const finalSaved = globalThis.window.SillyTavern.getContext().chatMetadata.extensions.lonsha_memory;
    assert.equal(finalSaved.data.seq, 5, '最终落盘数据必须为最新一次的状态 (seq: 5)');
    assert.ok(finalSaved.stats, '存盘元数据必须包含 stats 摘要');
    ok('StorageManager Write Coalescing 写协调锁验证通过');
}

console.log('[V340 TESTS PASSED] 全部数据库级演进测试通过！');
