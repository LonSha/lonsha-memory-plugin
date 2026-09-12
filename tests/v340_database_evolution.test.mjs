// tests/v340_database_evolution.test.mjs
// LonSha 记忆引擎 v3.40 数据库级演进测试套件
// 覆盖：检索管道流水线闭环（修复回响池早退劫胡）、写入协调器（Write Coalescing）、图数据库真空压缩（Graph Vacuum）
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (msg) => { pass++; console.log('✓ ' + msg); };
const bad = (msg) => { fail++; console.log('✗ ' + msg); };

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

const normFn = (n) => String(n || '').normalize('NFKC').replace(/\s+/g, '').trim().toLowerCase();
const errLog = () => {};

const conflictDef = `
const RELATION_CONFLICT_GROUPS = [
    new Set(['陌生', '相识', '友好', '暧昧', '暗恋', '热恋', '恋人', '夫妻', '冷战', '决裂', '陌路']),
    new Set(['盟友', '同行', '中立', '对立', '敌对', '宿敌', '仇敌', '背叛'])
];
function areLabelsInConflict(l1, l2) {
    if (!l1 || !l2 || l1 === l2) return false;
    for (const group of RELATION_CONFLICT_GROUPS) {
        if (group.has(l1) && group.has(l2)) return true;
    }
    const p1 = '\${l1}-\${l2}';
    if (/恋人-决裂|决裂-恋人|友好-敌对|敌对-友好|盟友-宿敌|宿敌-盟友/i.test(p1)) return true;
    return false;
}
`;

console.log('=== 1. 静态锚点检查 ===');
assert.ok(src.includes('vacuum(options = {})'), 'MemoryGraph 必须拥有 vacuum 压缩方法');
ok('MemoryGraph 拥有 vacuum 方法');

assert.ok(!src.includes('return inj1;'), 'onBeforeGeneration 中禁止回响池孤立早退');
ok('onBeforeGeneration 回响池与下游管道合并，杜绝早退截断');

assert.ok(src.includes('_isWriting') && src.includes('_pendingWrite'), 'StorageManager 必须拥有写入队列与写合并锁');
ok('StorageManager 包含 Write Coalescing 写协调锁');

console.log('=== 2. Graph Vacuum (碎片整理与压缩) 动态测试 ===');
const graphSrc = extractClass('MemoryGraph');
const mkGraph = () => new Function('normalizeCharName', 'errLog', `
    ${conflictDef}
    ${graphSrc}
    return new MemoryGraph();
`)(normFn, errLog);

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
const storageSrc = extractClass('StorageManager');
const mkStorage = () => new Function('VERSION', 'PLUGIN_NAME', 'errLog', `
    ${storageSrc}
    return new StorageManager();
`)('3.40.0', 'LonShaMemory', errLog);

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
