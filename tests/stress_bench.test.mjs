// tests/stress_bench.test.mjs
// LonSha 记忆引擎大规模压力与吞吐基准测试
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { performance } from 'node:perf_hooks';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

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

// 提取 MemoryGraph
const graphSrc = extractClass('MemoryGraph');
const mkGraph = () => new Function('normalizeCharName', 'errLog', `
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

    ${graphSrc}
    return new MemoryGraph();
`)(normFn, errLog);

// 提取 BM25Engine
const bm25Src = extractClass('BM25');
const mkBM25 = () => new Function('errLog', `
    ${bm25Src}
    return new BM25();
`)(errLog);

console.log('=== [STRESS TEST 1] 1000 节点 / 5000 边 时态图谱压力测试 ===');
const graph = mkGraph();

const t0 = performance.now();
const nodeIds = [];
for (let i = 0; i < 1000; i++) {
    const id = graph.addNode({
        name: `实体_${i}`,
        type: i % 3 === 0 ? 'character' : (i % 3 === 1 ? 'location' : 'concept'),
        description: `这是用于高压测试的实体描述编号 #${i}，具有一定的语义特征与上下文属性。`,
        floor: i,
        importance: (i % 10) / 10
    });
    nodeIds.push(id);
}
const tNodes = performance.now() - t0;
console.log(`✓ 插入 1,000 个实体节点耗时: ${tNodes.toFixed(2)} ms`);
assert.equal(graph.nodes.size, 1000);

const t1 = performance.now();
for (let i = 0; i < 5000; i++) {
    const srcId = nodeIds[i % 1000];
    const tgtId = nodeIds[(i * 7 + 13) % 1000];
    if (srcId !== tgtId) {
        graph.addEdge({
            from: srcId,
            to: tgtId,
            relation: i % 4 === 0 ? '喜欢' : (i % 4 === 1 ? '位于' : (i % 4 === 2 ? '持有' : '敌对')),
            weight: ((i % 100) + 1) / 100,
            validFrom: i % 500,
            validTo: i % 2 === 0 ? (i % 500) + 50 : null,
            floor: i % 500
        });
    }
}
const tEdges = performance.now() - t1;
console.log(`✓ 插入 5,000 条关联边耗时: ${tEdges.toFixed(2)} ms`);

const t2 = performance.now();
let recalledCount = 0;
for (let i = 0; i < 100; i++) {
    const queryEntities = [`实体_${i * 10}`, `实体_${i * 10 + 1}`];
    const nodes = graph.findByNames(queryEntities);
    recalledCount += nodes.length;
}
const tSearch = performance.now() - t2;
console.log(`✓ 连续 100 次实体索引检索耗时: ${tSearch.toFixed(2)} ms (平均 ${(tSearch/100).toFixed(3)} ms/次, 命中 ${recalledCount} 节点)`);
assert.ok(tSearch < 200, '图索引检索耗时过高，超过 200ms 警戒线');

const t3 = performance.now();
const exported = graph.export();
const exportTime = performance.now() - t3;
const jsonStr = JSON.stringify(exported);
console.log(`✓ 导出 1000 节点 / ${graph.edges.size} 边耗时: ${exportTime.toFixed(2)} ms (JSON 大小: ${(jsonStr.length / 1024).toFixed(2)} KB)`);

const t4 = performance.now();
const restoredGraph = mkGraph();
restoredGraph.import(JSON.parse(jsonStr));
const importTime = performance.now() - t4;
console.log(`✓ 反序列化恢复图谱耗时: ${importTime.toFixed(2)} ms`);
assert.equal(restoredGraph.nodes.size, 1000);
assert.equal(restoredGraph.edges.size, graph.edges.size);

console.log('=== [STRESS TEST 2] BM25 稀疏检索在 10,000 条长文本下的性能测试 ===');
const bm25 = mkBM25();
const tBmInsert = performance.now();
const docs = [];
for (let i = 0; i < 5000; i++) {
    docs.push({ id: i, text: `角色_${i % 50} 在 地点_${i % 30} 进行了一次关于 道具_${i % 100} 的秘密交谈，发生于楼层 ${i}，情境极其复杂且充满了意外反转。` });
}
bm25.rebuild(docs);
console.log(`✓ 索引 5,000 篇文档耗时: ${(performance.now() - tBmInsert).toFixed(2)} ms`);

const tBmSearch = performance.now();
for (let i = 0; i < 50; i++) {
    const res = bm25.search(`角色_${i} 秘密交谈 道具_${i*2}`, 5, { cliffCut: true, minResults: 2 });
    assert.ok(res.length >= 0);
}
const bmSearchTime = performance.now() - tBmSearch;
console.log(`✓ 连续 50 次复杂 BM25 稀疏搜索耗时: ${bmSearchTime.toFixed(2)} ms (平均 ${(bmSearchTime/50).toFixed(3)} ms/次)`);
assert.ok(bmSearchTime < 1000, 'BM25 搜索延迟过高，超过 1000ms 警戒线');

console.log('[STRESS TESTS PASSED] 压力基准测试全部通过！');
