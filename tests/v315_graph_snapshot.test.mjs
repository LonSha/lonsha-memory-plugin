// tests/v315_graph_snapshot.test.mjs
// v3.15 图谱版本快照 + 楼层截断回溯测试（收编 zhino A5.2.1）
// 双模式：行为实测（snapshotGraph/truncateGraphFrom/export-import）+ 静态断言（联动/持久化/版本）
import { readFileSync } from 'fs';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');
const PLUGIN_NAME = 'LonSha记忆引擎';   // 匹配 index.js 顶部常量
let pass = 0;
const ok = (m) => { pass++; console.log('ok: ' + m); };
const fail = (m) => { console.error('FAIL: ' + m); process.exit(1); };

// ─── 从源码抽 MemoryGraph 类（最小化重建，保留快照方法）───
const gMatch = src.match(/    class MemoryGraph \{[\s\S]*?\n    \}/);
if (!gMatch) fail('未找到 MemoryGraph 类');
const gCode = gMatch[0];
// 抽取快照方法单独验证（依赖 rebuildNameIndex/addNode 用注入）
const snapM = src.match(/        snapshotGraph\(floor\) \{[\s\S]*?\n        \}\n/);
const truncM = src.match(/        truncateGraphFrom\(floor\) \{[\s\S]*?\n        \}\n/);
if (!snapM || !truncM) fail('快照方法未找到');

// 抽取方法体（去掉签名行 + 尾部闭合 }），构造可执行函数
function methodBody(m) {
  // 去掉签名行：匹配方法名 + (floor) {
  let body = m[0].replace(/^ *snapshotGraph\(floor\) \{\n/, '').replace(/^ *truncateGraphFrom\(floor\) \{\n/, '');
  // 去掉尾部闭合 }（允许前导空白）
  body = body.replace(/[ \t]*\}\n?$/, '');
  return body;
}
const snapBody = methodBody(snapM);
const truncBody = methodBody(truncM);

// 构造一个最小 MemoryGraph 行为模型：直接用源码类代码，注入 window/errLog
class MockGraph {
  constructor() {
    this.nodes = new Map(); this.edges = new Map(); this.nameIndex = new Map();
    this._snapshots = []; this.SNAP_MAX = 6;
  }
  rebuildNameIndex() { this.nameIndex.clear(); for (const n of this.nodes.values()) this.nameIndex.set(n.name, n.id); }
  addNode(node) {
    const id = 'n' + (this.nodes.size + 1);
    this.nodes.set(id, { ...node, id });
    this.rebuildNameIndex();
    return id;
  }
}
// 由于 snapshotGraph 引用 window.LonShaMemory，需 mock window
global.window = { LonShaMemory: { engine: { config: { config: { debugMode: false } } } } };

// TC1: snapshotGraph 拍摄楼层起点状态
{
  const g = new MockGraph();
  const fn = new Function('PLUGIN_NAME', 'window', 'return function snapshotGraph(floor){' + snapBody + '}').call(null, PLUGIN_NAME, global.window);
  g.addNode({ name: 'A', type: 'character' });
  fn.call(g, 5);
  if (g._snapshots.length !== 1) fail('TC1 快照数');
  if (g._snapshots[0].floor !== 5) fail('TC1 floor');
  if (g._snapshots[0].nodes.length !== 1) fail('TC1 节点数');
  ok('TC1: snapshotGraph 记录楼层起点');
}
// TC2: 同楼覆盖（swipe 重拍不堆积）
{
  const g = new MockGraph();
  const fn = new Function('PLUGIN_NAME', 'window', 'return function snapshotGraph(floor){' + snapBody + '}').call(null, PLUGIN_NAME, global.window);
  g.addNode({ name: 'A', type: 'character' });
  fn.call(g, 3);
  g.addNode({ name: 'B', type: 'character' });
  fn.call(g, 3);
  if (g._snapshots.length !== 1) fail('TC2 同楼堆积: ' + g._snapshots.length);
  if (g._snapshots[0].nodes.length !== 2) fail('TC2 覆盖内容');
  ok('TC2: 同楼重复拍覆盖不堆积');
}
// TC3: 上限 6 张，淘汰最旧
{
  const g = new MockGraph();
  const fn = new Function('PLUGIN_NAME', 'window', 'return function snapshotGraph(floor){' + snapBody + '}').call(null, PLUGIN_NAME, global.window);
  for (let i = 1; i <= 8; i++) { g.addNode({ name: 'C' + i, type: 'character' }); fn.call(g, i); }
  if (g._snapshots.length !== 6) fail('TC3 上限: ' + g._snapshots.length);
  const floors = g._snapshots.map(s => s.floor).sort((a, b) => a - b);
  if (floors[0] !== 3) fail('TC3 最旧未淘汰: ' + floors);
  ok('TC3: 最多 6 张，淘汰最旧');
}
// TC4: truncateGraphFrom 回滚到楼前最近快照 + 截断后续快照
{
  const g = new MockGraph();
  const fn = new Function('PLUGIN_NAME', 'window', 'return function snapshotGraph(floor){' + snapBody + '}').call(null, PLUGIN_NAME, global.window);
  const tf = new Function('PLUGIN_NAME', 'window', 'return function truncateGraphFrom(floor){' + truncBody + '}').call(null, PLUGIN_NAME, global.window);
  g.addNode({ name: 'A', type: 'character' }); fn.call(g, 1);
  g.addNode({ name: 'B', type: 'character' }); fn.call(g, 2);
  g.addNode({ name: 'C', type: 'character' }); fn.call(g, 3);
  // 删楼 3 → 回滚到楼 2 状态（只有 A、B）
  const okBack = tf.call(g, 3);
  if (!okBack) fail('TC4 无快照可回溯');
  if (g._snapshots.length !== 2) fail('TC4 快照未截断: ' + g._snapshots.length);
  const names = Array.from(g.nodes.values()).map(n => n.name).sort();
  if (names.join(',') !== 'A,B') fail('TC4 回滚内容: ' + names);
  ok('TC4: 删楼回滚到楼前最近快照 + 后续快照截断');
}
// TC5: truncateGraphFrom 无快照时不崩（返回 false）
{
  const g = new MockGraph();
  const fn = new Function('PLUGIN_NAME', 'window', 'return function snapshotGraph(floor){' + snapBody + '}').call(null, PLUGIN_NAME, global.window);
  const tf = new Function('PLUGIN_NAME', 'window', 'return function truncateGraphFrom(floor){' + truncBody + '}').call(null, PLUGIN_NAME, global.window);
  const r = tf.call(g, 1);
  if (r !== false) fail('TC5 无快照应返回 false');
  ok('TC5: 无快照安全返回 false');
}
// TC6: 删最前楼层，无楼前快照 → 保留现状不清空
{
  const g = new MockGraph();
  const fn = new Function('PLUGIN_NAME', 'window', 'return function snapshotGraph(floor){' + snapBody + '}').call(null, PLUGIN_NAME, global.window);
  const tf = new Function('PLUGIN_NAME', 'window', 'return function truncateGraphFrom(floor){' + truncBody + '}').call(null, PLUGIN_NAME, global.window);
  g.addNode({ name: 'A', type: 'character' }); fn.call(g, 5);
  const r = tf.call(g, 1);   // 删楼 1，楼前（<1）无快照
  if (r !== false) fail('TC6 应返回 false');
  ok('TC6: 删最前楼无楼前快照，不清空图（保留现状）');
}

// ─── 静态断言 ───
// ST1: snapshotGraph 在 onMessageReceived 图谱写入前调用
{
  const si = src.indexOf('this.graph.snapshotGraph(message.index)');
  const ci = src.indexOf('const existChar = this.graph.findCharacterByName(canonical);');
  if (!(si > 0 && si < ci)) fail('ST1 快照点不在写入前');
  ok('ST1: 图谱快照在节点写入前（楼层起点）');
}
// ST2: rollbackFloor 内调用 truncateGraphFrom
{
  if (!src.includes('this.graph.truncateGraphFrom(floor)')) fail('ST2 联动缺失');
  const ri = src.indexOf('rollbackFloor(floor) {');
  const ti = src.indexOf('this.graph.truncateGraphFrom(floor)');
  if (!(ri > 0 && ti > ri)) fail('ST2 truncate 不在 rollbackFloor 内');
  ok('ST2: rollbackFloor 内调用图层截断回溯');
}
// ST3: export/import 带快照持久化
{
  if (!src.includes("snapshots: Array.isArray(this._snapshots)")) fail('ST3 export 缺快照');
  if (!src.includes("this._snapshots = Array.isArray(data?.snapshots)")) fail('ST3 import 缺快照');
  ok('ST3: export/import 持久化快照');
}
// ST4: 快照初始化 + 上限常量
{
  if (!src.includes('this._snapshots = []; this.SNAP_MAX = 6;')) fail('ST4 初始化');
  ok('ST4: 初始化 _snapshots + SNAP_MAX=6');
}
// ST5: 版本号
{
  if (!src.includes("VERSION = '3.15.0'")) fail('ST5 版本号');
  ok('ST5: 版本号 3.15.0');
}

console.log(`\n✓ v3.15 图谱版本快照测试全过 (${pass} 项)`);