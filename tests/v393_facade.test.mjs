// [v3.93.0] 官方门面契约测试: getPublicData / getGraphWriter
// 验证记忆插件对外暴露的官方只读/写入门面行为正确, 且只读门面不泄漏写入引用。
// 纯单文件: 用最小 mock 实例化插件类中的门面方法逻辑。
const results = [];
const ok = (name, cond, detail = '') => {
  if (cond) { results.push(name); console.log(`✓ ${name}`); }
  else { console.error(`✗ ${name} ${detail}`); process.exitCode = 1; }
};

// ---- 从 index.js 提取门面方法做行为验证 (不经完整插件加载, 避免 DOM/ST 依赖) ----
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'index.js'), 'utf8');

// 1. 静态: 门面方法存在且标注版本
ok('index.js 含 getPublicData 门面', src.includes('getPublicData() {'));
ok('index.js 含 getGraphWriter 门面', src.includes('getGraphWriter() {'));
ok('门面标注 v3.93.0', src.includes('[v3.93.0] 官方只读门面'));
// 版本号动态断言（不硬编码具体值，未来升级不再误破）：读取 VERSION 并校验 >= 3.93.0
const _vm = src.match(/const VERSION = '([0-9]+)\.([0-9]+)\.([0-9]+)'/);
ok('版本号声明存在', !!_vm);
if (_vm) {
  const [maj, min, pat] = [Number(_vm[1]), Number(_vm[2]), Number(_vm[3])];
  ok('版本号 >= 3.93.0（门面引入版本）', (maj > 3) || (maj === 3 && min > 93) || (maj === 3 && min === 93 && pat >= 0), `实际 ${maj}.${min}.${pat}`);
}

// 2. 行为: 提取方法体在受控上下文执行
// 用 new Function 构造一个带 mock engine 的对象来运行门面方法
function makeFacadeHost(engine) {
  const gpd = extractMethod(src, 'getPublicData');
  const ggw = extractMethod(src, 'getGraphWriter');
  const body = `
    const getPublicData = ${gpd};
    const getGraphWriter = ${ggw};
    return { getPublicData, getGraphWriter, engine: arguments[0] };
  `;
  const f = new Function(body);
  return f(engine);
}
function extractMethod(srcText, name) {
  const start = srcText.indexOf(name + '() {');
  if (start < 0) throw new Error('method not found: ' + name);
  let i = srcText.indexOf('{', start), depth = 0;
  for (let j = i; j < srcText.length; j++) {
    if (srcText[j] === '{') depth++;
    else if (srcText[j] === '}') { depth--; if (depth === 0) return 'function ' + srcText.slice(start, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

// 3. getPublicData: 正常聚合 engine 各子模块
{
  const mockEngine = {
    graph: { nodes: new Map([['a', { id: 'n1' }], ['b', { id: 'n2' }]]), edges: new Map([['e1', { id: 'e1' }]]) },
    summary: { summaries: [{ id: 's1' }] },
    diary: { diaries: [{ id: 'd1' }] },
    pov: { povs: [{ id: 'p1' }] },
    timeline: { events: [{ id: 't1' }] },
    status: { hp: 100 },
    ledger: { bal: 5 },
    vector: { vectors: [{ id: 'v1' }] }
  };
  const host = makeFacadeHost(mockEngine);
  const d = host.getPublicData();
  ok('getPublicData 返回对象', d && typeof d === 'object');
  ok('graph.nodes 从 Map 转数组', Array.isArray(d.graph.nodes) && d.graph.nodes.length === 2);
  ok('graph.edges 从 Map 转数组', Array.isArray(d.graph.edges) && d.graph.edges.length === 1);
  ok('聚合 summaries', d.summaries.length === 1);
  ok('聚合 diaries', d.diaries.length === 1);
  ok('聚合 povs', d.povs.length === 1);
  ok('聚合 timeline', d.timeline.length === 1);
  ok('聚合 status/ledger/vectors', d.status.hp === 100 && d.ledger.bal === 5 && d.vectors.length === 1);
  ok('返回 plain object 不含 addNode 写入引用', typeof d.graph.addNode === 'undefined');
}

// 4. getPublicData: 缺子模块时容错 (diary.list 备用 / 缺失给 [])
{
  const mockEngine = { graph: { nodes: new Map(), edges: new Map() }, diary: { list: [{ id: 'dl' }] }, timeline: { list: [{ id: 'tl' }] } };
  const host = makeFacadeHost(mockEngine);
  const d = host.getPublicData();
  ok('diary.list 备用通道', d.diaries.length === 1 && d.diaries[0].id === 'dl');
  ok('timeline.list 备用通道', d.timeline.length === 1 && d.timeline[0].id === 'tl');
  ok('缺失子模块给空数组', Array.isArray(d.summaries) && d.summaries.length === 0 && Array.isArray(d.povs));
}

// 5. getPublicData: engine/graph 缺失返回 null (不抛)
{
  const host = makeFacadeHost(null);
  ok('engine 为 null 时返回 null', host.getPublicData() === null);
  const host2 = makeFacadeHost({ /* 无 graph */ });
  ok('graph 缺失时返回 null', host2.getPublicData() === null);
}

// 6. getGraphWriter: 正常返回 graph, 缺 addNode 返回 null
{
  const g = { addNode() {}, addEdge() {}, nodes: new Map() };
  ok('getGraphWriter 返回 graph 句柄', makeFacadeHost({ graph: g }).getGraphWriter() === g);
  ok('缺 addNode 时返回 null', makeFacadeHost({ graph: { nodes: new Map() } }).getGraphWriter() === null);
  ok('engine 缺失时返回 null', makeFacadeHost(null).getGraphWriter() === null);
}

console.log(`\n[v393_facade] ${results.length} 项断言全部通过`);