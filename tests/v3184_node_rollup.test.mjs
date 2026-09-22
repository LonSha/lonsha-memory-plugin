/**
 * tests/v3184_node_rollup.test.mjs — v3.184.0 语义汇总（Node Rollup）
 *
 * 覆盖：
 *   1. rollupRange：部分覆盖语义 / 严格数值守卫 / 全缺时返回 null（不编造 [0,0]）
 *   2. canRollup 六条拒绝理由（每条都对应一种真实误用）
 *   3. planRollup：父节点形状、层级推导、边界字段只在真有边界时出现、不碰图
 *   4. line()：汇总层数 / 覆盖节点 / **有边界的层数**三态可分辨
 *   5. 畸形输入不抛
 *   6. MemoryGraph 接线：rollupGroup 写入（父节点 + semantic_contains + 认领标记）
 *   7. maintainGraph 顺序：rollup → vacuum（顺序反了会先删掉本该成组的孤儿）
 *   8. autoRollup：事件节点「无 node.floor 但有时间戳」必须仍能成组（**本版修掉的真陷阱**）
 *   9. 反向审计（负控制）：破坏真判据后行为必须可观测地改变，且原版上同判据须真
 *  10. 接线自证：manifest 注册 / 取库口 / 诊断行 / 配置声明 / 面板控件 / 维护管线步骤
 *  11. 诊断行真进 selfCheck 子系统列表（入口函数名在场不等于用户读得到）
 *  12. 版权纯度：代码体不含源实现标识符，出处注释保留
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
// IIFE + CJS 双导出：必须用 require 取库（import 拿到的是空命名空间）。
const require = createRequire(import.meta.url);
const RU = require(path.join(root, 'node-rollup.js'));
// 取库 **之后** 才快照宿主全局：IIFE 双导出模块在 require 时自挂 window/globalThis，
// 在 require 之前抓快照只会拿到 undefined，后面的「破坏副本污染/还原」断言就成了空转。
const goodGlobal = globalThis.LonShaNodeRollup;
let pass = 0;
const ok = (name, cond, extra) => {
  assert.ok(cond, extra ? name + ' — ' + extra : name);
  pass += 1;
};
const eq = (name, a, b) => {
  assert.equal(a, b, name + ` — 期望 ${JSON.stringify(b)}，实得 ${JSON.stringify(a)}`);
  pass += 1;
};
const ERRLOG = () => {};

// ========== 1. rollupRange ==========
{
  eq('1a 版本号', RU.ROLLUP_VERSION, 1);
  eq('1b 类型标记', RU.ROLLUP_KIND, 'semantic_rollup');
  const r = RU.rollupRange([{ floor: 7 }, { floor: 3 }, { floor: 11 }]);
  eq('1c start 取最小', r.start, 3);
  eq('1d end 取最大', r.end, 11);
  eq('1e 贡献数', r.contributors, 3);
  eq('1f 跳过数 0', r.skipped, 0);
}
// 部分覆盖：缺边界的子节点不否决父边界，也不贡献（Luker 同款语义）
{
  const r = RU.rollupRange([{ floor: 5 }, { name: '无边界' }, { floor: 9 }]);
  eq('1g 有边界的仍算出区间', r.start, 5);
  eq('1h 结束取有边界者', r.end, 9);
  eq('1i 贡献 2', r.contributors, 2);
  // 「有几个没参与」必须报出来——全是 undefined 与全都算出来，只看区间时同形。
  eq('1j 跳过 1 且可见', r.skipped, 1);
}
// 一个带边界信息的都没有 → null（**不是 [0,0]**，那是编造覆盖范围）
{
  eq('1k 全无边界返回 null（不编造 [0,0]）', RU.rollupRange([{ a: 1 }, { b: 2 }]), null);
  eq('1l 空数组返回 null', RU.rollupRange([]), null);
}
// 严格数值守卫：字符串 '3'、NaN、Infinity、null 都不算边界
{
  const r = RU.rollupRange([{ floor: '3' }, { floor: NaN }, { floor: Infinity }, { floor: null }, { floor: 4 }]);
  eq('1m 只认真 number', r.contributors, 1);
  eq('1n 区间只由真数值决定', r.start, 4);
  eq('1o 四个非法值全进 skipped', r.skipped, 4);
}
// data.floor 兼容（本仓 addNode 把来源信息塞进 data）
{
  const r = RU.rollupRange([{ data: { floor: 12 } }]);
  eq('1p 兼容 data.floor', r.start, 12);
  const r2 = RU.rollupRange([{ floor: 1, data: { floor: 99 } }]);
  eq('1q 顶层字段优先于 data', r2.start, 1);
}
// 自定义字段名
{
  const r = RU.rollupRange([{ seq: 2 }, { seq: 8 }], 'seq');
  eq('1r 自定义字段生效', r.end, 8);
  eq('1s 换字段后原来的 floor 不算数', RU.rollupRange([{ floor: 3 }], 'seq'), null);
}

// ========== 2. canRollup ==========
const nodesOf = (arr) => new Map(arr.map((n) => [String(n.id), n]));
{
  eq('2a 空 childIds 拒', RU.canRollup(nodesOf([]), [], '汇总').reason, 'no-children');
  eq('2b 非数组拒', RU.canRollup(nodesOf([]), null, '汇总').reason, 'no-children');
}
{
  const nodes = nodesOf([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]);
  eq('2c 数够 + 有摘要 → 可压', RU.canRollup(nodes, ['a', 'b', 'c', 'd'], '四件事').ok, true);
  // 有 id 找不到节点：**整批评判失败**，不做「有多少压多少」
  const miss = RU.canRollup(nodes, ['a', 'b', 'c', 'zzz'], '四件事');
  eq('2d 缺 id 整批拒', miss.ok, false);
  eq('2e 拒因带缺失 id', miss.reason, 'child-not-found:zzz');
  eq('2f 全缺时报全部缺失 id', RU.canRollup(nodes, ['x', 'y'], '摘要').reason, 'child-not-found:x,y');
}
{
  const nodes = nodesOf([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  eq('2g 少于 minChildren 拒', RU.canRollup(nodes, ['a', 'b', 'c'], '三件事').reason, 'too-few-children(3<4)');
  eq('2h minChildren 可放宽', RU.canRollup(nodes, ['a', 'b', 'c'], '三件事', { minChildren: 3 }).ok, true);
  eq('2i minChildren=1 被夹到 2', RU.canRollup(nodesOf([{ id: 'a' }]), ['a'], '一件', { minChildren: 1 }).ok, false);
}
{
  const nodes = nodesOf([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]);
  eq('2j 空摘要拒', RU.canRollup(nodes, ['a', 'b', 'c', 'd'], '').reason, 'empty-summary');
  eq('2k 纯空白摘要拒', RU.canRollup(nodes, ['a', 'b', 'c', 'd'], '   \n ').reason, 'empty-summary');
  eq('2l undefined 摘要拒', RU.canRollup(nodes, ['a', 'b', 'c', 'd'], undefined).reason, 'empty-summary');
}
// 已被认领：一层只能有一个父，重复认领会互相覆盖
{
  const nodes = nodesOf([
    { id: 'a' }, { id: 'b' },
    { id: 'c', data: { rollupParent: 'parent_1' } },
    { id: 'd' },
  ]);
  const v = RU.canRollup(nodes, ['a', 'b', 'c', 'd'], '四件事');
  eq('2m 已被认领则拒', v.ok, false);
  eq('2n 拒因点名被认领的 id', v.reason, 'already-claimed:c');
}
// 重复 id：会生成两条边与重复 rollupFrom，「覆盖 N 节点」随之虚高
{
  const nodes = nodesOf([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]);
  const v = RU.canRollup(nodes, ['a', 'b', 'c', 'a'], '四件事');
  eq('2o 重复 id 拒', v.ok, false);
  eq('2p 拒因点名重复 id', v.reason, 'duplicate-children:a');
}
// nodes 传普通对象也要能用（非 Map 入口）
{
  const v = RU.canRollup({ a: { id: 'a' }, b: { id: 'b' }, c: { id: 'c' }, d: { id: 'd' } }, ['a', 'b', 'c', 'd'], '四件事');
  eq('2q 普通对象入口可用', v.ok, true);
  eq('2r 返回 children 供下游复用', v.children.length, 4);
}

// ========== 3. planRollup ==========
{
  const nodes = nodesOf([
    { id: 'a', floor: 10 }, { id: 'b', floor: 40 },
    { id: 'c', floor: 20 }, { id: 'd', floor: 30 },
  ]);
  const p = RU.planRollup(nodes, ['a', 'b', 'c', 'd'], '一场火灾', { type: 'event', label: '事件' });
  eq('3a 计划成立', p.ok, true);
  eq('3b 父类型', p.parent.type, 'event');
  ok('3c 名字带层级与节点数', p.parent.name.includes('L1') && p.parent.name.includes('4节'), p.parent.name);
  ok('3d 名字用传入标签', p.parent.name.startsWith('事件'), p.parent.name);
  eq('3e 类型标记', p.parent.data.rollupKind, RU.ROLLUP_KIND);
  eq('3f 层级 = 最深子 + 1', p.parent.data.rollupDepth, 1);
  eq('3g 来源子节点全集', p.parent.data.rollupFrom.join(','), 'a,b,c,d');
  eq('3h 摘要落进父节点', p.parent.data.rollupSummary, '一场火灾');
  eq('3i 边界下沿', p.parent.data.rollupFloorStart, 10);
  eq('3j 边界上沿', p.parent.data.rollupFloorEnd, 40);
  // 父节点自身不写顶层 floor（本仓节点形状里 floor 不是通用字段），
  //   但 data.floor 会被 rollupRange / autoRollup 的 data 回退读到，故必须落在 data 上。
  eq('3k 父节点 data.floor 取下沿（供回退读取）', p.parent.data.floor, 10);
  eq('3k2 顶层 floor 不写（不冒充通用节点字段）', p.parent.floor, undefined);
  eq('3l 贡献数', p.parent.data.rollupContributors, 4);
  eq('3m 跳过数', p.parent.data.rollupSkipped, 0);
  eq('3n 返回净化后的 childIds', p.childIds.join(','), 'a,b,c,d');
}
// 层级推导：子节点带 semanticDepth 时取最深 +1
{
  const nodes = nodesOf([{ id: 'a', semanticDepth: 0 }, { id: 'b', semanticDepth: 2 }, { id: 'c', semanticDepth: 1 }, { id: 'd' }]);
  const p = RU.planRollup(nodes, ['a', 'b', 'c', 'd'], '二层之上');
  eq('3o 层级取最深子 + 1', p.parent.data.rollupDepth, 3);
}
// 一个边界都算不出来时：**整个边界字段不出现**，而不是写 null/0 让人以为算过
{
  const nodes = nodesOf([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]);
  const p = RU.planRollup(nodes, ['a', 'b', 'c', 'd'], '无楼层批次');
  eq('3p 无边界时不写 rollupFloorStart', 'rollupFloorStart' in p.parent.data, false);
  eq('3q 无边界时不写 rollupFloorEnd', 'rollupFloorEnd' in p.parent.data, false);
  eq('3r 贡献数为 0（如实）', p.parent.data.rollupContributors, 0);
  eq('3s 跳过数 = 全部', p.parent.data.rollupSkipped, 4);
  eq('3t 父节点自身 floor 为 undefined', p.parent.floor, undefined);
}
// 部分覆盖：贡献数与跳过数分别记
{
  const nodes = nodesOf([{ id: 'a', floor: 5 }, { id: 'b' }, { id: 'c' }, { id: 'd', floor: 8 }]);
  const p = RU.planRollup(nodes, ['a', 'b', 'c', 'd'], '半有边界');
  eq('3u 贡献 2', p.parent.data.rollupContributors, 2);
  eq('3v 跳过 2', p.parent.data.rollupSkipped, 2);
  eq('3w 区间只由有边界者决定', p.parent.data.rollupFloorStart + '-' + p.parent.data.rollupFloorEnd, '5-8');
}
// 纯函数：不碰图（写入是宿主职责，图的写入路径有四条需记账）
{
  const nodes = nodesOf([{ id: 'a', floor: 1 }, { id: 'b', floor: 2 }, { id: 'c', floor: 3 }, { id: 'd', floor: 4 }]);
  const before = JSON.stringify([...nodes.values()]);
  RU.planRollup(nodes, ['a', 'b', 'c', 'd'], '不该动图');
  eq('3x planRollup 不改节点（不写认领标记）', JSON.stringify([...nodes.values()]), before);
  eq('3y 父节点不落进 nodes', nodes.size, 4);
}

// ========== 4. line() ==========
{
  eq('4a 空图如实报 0 层', RU.line(new Map()), '汇总 0 层（图未压缩）');
  eq('4b 普通 Map 对象也可用', RU.line({}), '汇总 0 层（图未压缩）');
  const nodes = new Map([
    ['p1', { id: 'p1', data: { rollupKind: RU.ROLLUP_KIND, rollupFrom: ['a', 'b', 'c', 'd'], rollupFloorStart: 1 } }],
    ['p2', { id: 'p2', data: { rollupKind: RU.ROLLUP_KIND, rollupFrom: ['e', 'f', 'g', 'h'] } }],
    ['x', { id: 'x', data: {} }],
  ]);
  const l = RU.line(nodes);
  ok('4c 报层数', l.includes('汇总 2 层'), l);
  ok('4d 报覆盖节点总数', l.includes('覆盖 8 节点'), l);
  // 「有几层真算出了楼层边界」必须报：全 undefined 与全都算出来，只看层数时同形
  ok('4e 报有边界的层数', l.includes('有边界 1/2'), l);
}
{
  eq('4f 畸形输入不抛', typeof RU.line(null), 'string');
  eq('4g line 不因异常整段崩', RU.line({ a: null }), '汇总 0 层（图未压缩）');
}

// ========== 5. 畸形输入不抛 ==========
{
  eq('5a rollupRange(null) 返回 null', RU.rollupRange(null), null);
  eq('5b rollupRange(数字)', RU.rollupRange(12345), null);
  ok('5c rollupRange(含 null 元素)', RU.rollupRange([null, { floor: 3 }]).start === 3);
  eq('5d canRollup(null, null, null) 拒而非抛', RU.canRollup(null, null, null).reason, 'no-children');
  eq('5e planRollup(null, null, null) 拒而非抛', RU.planRollup(null, null, null).ok, false);
  ok('5f planRollup 拒时 parent 为 null', RU.planRollup(null, ['a'], 'x').parent === null);
  ok('5g planRollup 拒时 childIds 为空数组', Array.isArray(RU.planRollup(null, ['a'], 'x').childIds));
}

// ========== 6/7/8. MemoryGraph 接线 ==========
const isrc0 = read('index.js');
function braceEnd(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return i; }
    else if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch; i++;
      while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; }
    }
  }
  return -1;
}
const gSrc = (() => {
  const at = isrc0.indexOf('    class MemoryGraph {');
  assert.ok(at > 0, '未找到 MemoryGraph 类');
  return isrc0.slice(at, braceEnd(isrc0, isrc0.indexOf('{', at)) + 1);
})();
const normCharName = (n) => String(n || '').normalize('NFKC').replace(/\s+/g, '').trim().toLowerCase();
/** 取库桩：可切换成「模块在」与「模块缺席」两态（缺席路径也必须可测）。 */
const libOn = (getGlobal, fileName) => (fileName === 'node-rollup.js' ? RU : null);
const libOff = () => null;
const mkGraph = (lib) => new Function(
  'normalizeCharName', 'errLog', 'areLabelsInConflict', 'PLUGIN_NAME', '_moduleLib', 'window', 'console',
  `${gSrc}\n    return new MemoryGraph();`,
)(normCharName, ERRLOG, () => false, 'test', lib || libOn, undefined, { log() {} });
const addEvents = (g, n, withFloor) => {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const id = g.addNode({
      type: 'event',
      name: '事件' + i,
      data: withFloor ? { floor: 10 + i * 5 } : { type: '事件' + i },
    });
    ids.push(id);
  }
  return ids;
};

// ---- 6. rollupGroup 写入 ----
{
  const g = mkGraph(libOn);
  const ids = addEvents(g, 4, true);
  const r = g.rollupGroup(ids, '四件小事', { type: 'event', label: '事件' });
  eq('6a 汇总成功', r.ok, true);
  eq('6b 图里多了 1 个父节点', g.nodes.size, 5);
  ok('6c 父节点可查到', !!g.nodes.get(r.parentId));
  ok('6d 父节点名带层级', g.nodes.get(r.parentId).name.includes('L1'), g.nodes.get(r.parentId).name);
  const edges = [...g.edges.values()].filter((e) => e.label === 'semantic_contains');
  eq('6e 每个子节点一条 semantic_contains 边', edges.length, 4);
  eq('6f 边方向父→子', edges.every((e) => e.from === r.parentId && ids.includes(e.to)), true);
  eq('6g 子节点全被认领', ids.every((id) => g.nodes.get(id).data.rollupParent === String(r.parentId)), true);
  // **不删任何子节点**：rollup 做加法，减法归 vacuum
  eq('6h 子节点一个都没删', ids.every((id) => !!g.nodes.get(id)), true);
  eq('6i 累计读数 created=1', g._rollupRead.created, 1);
  eq('6j 累计读数 lastReason=ok', g._rollupRead.lastReason, 'ok');
  eq('6k 覆盖数记账', g._rollupRead.lastCovered, 4);
  eq('6l 父节点名索引可用（rebuildNameIndex 被调用）', g.nameIndex.size > 0, true);
}
// 认领后重复压同一批 → 拒，且**拒也要计数**（否则「压了 0 层」与「模块没加载」同形）
{
  const g = mkGraph(libOn);
  const ids = addEvents(g, 4, true);
  g.rollupGroup(ids, '第一次');
  const r2 = g.rollupGroup(ids, '第二次');
  eq('6m 重复压缩被拒', r2.ok, false);
  ok('6n 拒因是已被认领', r2.reason.startsWith('already-claimed'), r2.reason);
  eq('6o 图没被污染（仍 5 个节点）', g.nodes.size, 5);
  eq('6p 拒也计数 rejected=1', g._rollupRead.rejected, 1);
  eq('6q 拒因留痕', g._rollupRead.lastReason.startsWith('already-claimed'), true);
}
// 模块缺席：也要计数（否则「压了 0 层」与「模块没加载」同形）
{
  const g = mkGraph(libOff);
  const ids = addEvents(g, 4, true);
  const r = g.rollupGroup(ids, '模块不在');
  eq('6r 模块缺席时拒', r.ok, false);
  eq('6s 拒因 module-unavailable', r.reason, 'module-unavailable');
  eq('6t 缺席也计数', g._rollupRead.rejected, 1);
  eq('6u 缺席不写图', g.nodes.size, 4);
}
// 判据拒绝（节点数不够）时同样留痕
{
  const g = mkGraph(libOn);
  const ids = addEvents(g, 3, true);
  const r = g.rollupGroup(ids, '三个不够');
  eq('6v 节点数不足被拒', r.ok, false);
  ok('6w 拒因可见（不是静默返回）', r.reason.startsWith('too-few-children'), r.reason);
  eq('6x 不足也计数', g._rollupRead.rejected, 1);
}

// ---- 7. maintainGraph 顺序：rollup → vacuum ----
{
  const g = mkGraph(libOn);
  addEvents(g, 4, true);
  const order = [];
  const realRollup = g.autoRollup.bind(g);
  const realVacuum = g.vacuum.bind(g);
  g.autoRollup = (o) => { order.push('rollup'); return realRollup(o); };
  g.vacuum = (o) => { order.push('vacuum'); return realVacuum(o); };
  const out = g.maintainGraph({ minChildren: 4, types: ['event'] });
  eq('7a 顺序固定为 rollup 在前', order.join('>'), 'rollup>vacuum');
  ok('7b 返回两段读数', !!out.rollup && !!out.vacuum);
  eq('7c 压成 1 层', out.rollup.created, 1);
  // 顺序反了会先删掉「本可成组但当前无父」的孤儿；正序下汇总边让子节点先被连上。
  eq('7d 4 个子节点 + 1 个父节点全在', g.nodes.size, 5);
  eq('7e vacuum 没误删任何节点', out.vacuum.prunedNodes, 0);
}
{
  const g = mkGraph(libOn);
  addEvents(g, 4, true);
  const out = g.maintainGraph({ rollup: false });
  eq('7f rollup:false 时不汇总', out.rollup, null);
  ok('7g vacuum 仍执行', !!out.vacuum);
}
{
  const g = mkGraph(libOn);
  addEvents(g, 4, true);
  const out = g.maintainGraph({ vacuum: false });
  eq('7h vacuum:false 时不压缩', out.vacuum, null);
  eq('7i rollup 仍执行', out.rollup.created, 1);
}

// ---- 8. autoRollup：事件节点「无 node.floor」陷阱 ----
{
  // 本仓事件节点构造为 {type, name, data}，floor 挂在边上、节点自身没有。
  // 若「排序依据」要求真 floor，事件节点会**全被跳过**——接上了但永远空转。
  const g = mkGraph(libOn);
  const ids = addEvents(g, 4, false);
  eq('8a 前提：事件节点确实没有 node.floor', ids.every((id) => g.nodes.get(id).floor === undefined), true);
  ok('8b 前提：事件节点有时间戳（addNode 补的）', ids.every((id) => Number(g.nodes.get(id).timestamp) > 0), true);
  const r = g.autoRollup({ minChildren: 4, types: ['event'] });
  eq('8c 无 floor 的事件节点仍能成组（本版修掉的真陷阱）', r.created, 1);
  eq('8d 没有被判成「无可判定依据」而跳过', r.skipped, 0);
  const parent = g.nodes.get(r.parentIds[0]);
  ok('8e 这类批次不写楼层边界（如实）', parent.data.rollupFloorStart === undefined, String(parent.data.rollupFloorStart));
  eq('8f 但贡献数如实为 0', parent.data.rollupContributors, 0);
}
// 真判不了的（既无楼层也无时间戳）才进 skipped
{
  const g = mkGraph(libOn);
  const ids = addEvents(g, 4, false);
  for (const id of ids) g.nodes.get(id).timestamp = 0;   // 抹掉时间戳，模拟无法排序的节点
  const r = g.autoRollup({ minChildren: 4, types: ['event'] });
  eq('8g 无楼层也无时间戳 → 计入 skipped', r.skipped, 4);
  eq('8h 不产出父节点', r.created, 0);
}
// 确定性：同一批输入产出同一父名（用 LLM 生成父名会让每次维护产出不同节点，图更乱）
{
  const nameOf = (g) => {
    const r = g.autoRollup({ minChildren: 4, types: ['event'] });
    return g.nodes.get(r.parentIds[0]).name + '|' + g.nodes.get(r.parentIds[0]).data.rollupSummary;
  };
  const g1 = mkGraph(libOn); addEvents(g1, 4, true);
  const g2 = mkGraph(libOn); addEvents(g2, 4, true);
  eq('8i 同批输入产出同一父名与摘要', nameOf(g1), nameOf(g2));
}
// 已认领 / 自己就是汇总层 的节点不再入池
{
  const g = mkGraph(libOn);
  const first = addEvents(g, 4, true);
  g.autoRollup({ minChildren: 4, types: ['event'] });
  const second = g.autoRollup({ minChildren: 4, types: ['event'] });
  eq('8j 第二轮不再重复压同一批', second.created, 0);
  // 父节点自身的 type 是 event（沿用 type 参数），必须靠 rollupKind 排他，否则会被当成新子节点
  eq('8k 父节点不被当成新子节点', g.nodes.size, 5);
  ok('8l 父节点带 rollupKind 标记', g.nodes.get([...first].length ? [...g.nodes.keys()].find((k) => g.nodes.get(k).data.rollupKind) : null).data.rollupKind === RU.ROLLUP_KIND);
}
// 不足一批时不产出
{
  const g = mkGraph(libOn);
  addEvents(g, 3, true);
  const r = g.autoRollup({ minChildren: 4, types: ['event'] });
  eq('8m 不足一批不产出', r.created, 0);
  eq('8n 也不误报跳过', r.skipped, 0);
}
// 类型过滤：只压指定类型
{
  const g = mkGraph(libOn);
  addEvents(g, 4, true);
  for (let i = 0; i < 4; i++) g.addNode({ type: 'character', name: '角色' + i, data: {} });
  const r = g.autoRollup({ minChildren: 4, types: ['event'] });
  eq('8o 只压 event 类型', r.created, 1);
  eq('8p 角色节点未被卷入', g.nodes.size, 9);
}

// ========== 9. 反向审计（负控制） ==========
const src = read('node-rollup.js');
{
  const tmp = path.join(root, 'tests', '.tmp-negctl-v3184nr');
  fs.mkdirSync(tmp, { recursive: true });
  const A_STRICT = 'if (typeof raw === \'number\' && Number.isFinite(raw)) withRange.push(raw);';
  const A_EMPTY = 'if (!withRange.length) return null;';
  const A_CLAIM = 'const claimed = children.filter(c => c && c.data && c.data.rollupParent);';
  const A_DUP = 'if (dup.length) return { ok: false, reason: \'duplicate-children:\' + dup.join(\',\'), children };';
  const A_TOFEW = 'if (children.length < minChildren) {';
  const A_TSESCAPE = 'if (f === null && !ts) { skipped.push(String(n.id)); continue; }';

  // H6 工具两向自证：不存在的锚点零命中、锚点必须恰中一次
  eq('负控0a 不存在的锚点零命中', src.split('THIS_ANCHOR_DOES_NOT_EXIST').length, 1);
  for (const [label, anchor, file] of [
    ['负控0b 严格数值守卫锚点唯一', A_STRICT, src],
    ['负控0c 全缺返回 null 锚点唯一', A_EMPTY, src],
    ['负控0d 认领检查锚点唯一', A_CLAIM, src],
    ['负控0e 重复 id 检查锚点唯一', A_DUP, src],
    ['负控0f 子节点数下限锚点唯一', A_TOFEW, src],
    ['负控0g 时间戳逃逸锚点唯一（在 index.js 内）', A_TSESCAPE, isrc0],
  ]) eq(label, file.split(anchor).length, 2);

  // 负控制 1：破坏严格数值守卫 → 字符串 '3' 会被当成边界（正是要防的假覆盖）
  {
    const f = path.join(tmp, 'strict.cjs');
    fs.writeFileSync(f, src.replace(A_STRICT, 'if (raw !== undefined) withRange.push(Number(raw));'), 'utf8');
    const mod = require(f);
    // 双向契约：原版上同判据须真（字符串不算边界）
    eq('负控1 前提：原版拒字符串边界', RU.rollupRange([{ floor: '3' }]), null);
    const r = mod.rollupRange([{ floor: '3' }]);
    ok('负控1：守卫破坏后字符串被当成边界（判据确实在跑）', !!r && r.start === 3, JSON.stringify(r));
  }
  // 负控制 2：破坏「全缺返回 null」→ 会编造出 [0,0] 覆盖范围
  {
    const f = path.join(tmp, 'empty.cjs');
    fs.writeFileSync(f, src.replace(A_EMPTY, 'if (!withRange.length) withRange.push(0);'), 'utf8');
    const mod = require(f);
    eq('负控2 前提：原版全缺时 null', RU.rollupRange([{ a: 1 }]), null);
    const r = mod.rollupRange([{ a: 1 }]);
    ok('负控2：破坏后编造出 [0,0]', !!r && r.start === 0 && r.end === 0, JSON.stringify(r));
  }
  // 负控制 3：破坏认领检查 → 同一子节点可被两个父认领（压完的图与压之前不一致）
  {
    const f = path.join(tmp, 'claim.cjs');
    fs.writeFileSync(f, src.replace(A_CLAIM, 'const claimed = [];'), 'utf8');
    const mod = require(f);
    const nodes = new Map([
      ['a', { id: 'a' }], ['b', { id: 'b' }],
      ['c', { id: 'c', data: { rollupParent: 'p0' } }], ['d', { id: 'd' }],
    ]);
    const ids = ['a', 'b', 'c', 'd'];
    eq('负控3 前提：原版拒已被认领的批', RU.canRollup(nodes, ids, 'x').ok, false);
    eq('负控3：破坏后重复认领被放行', mod.canRollup(nodes, ids, 'x').ok, true);
  }
  // 负控制 4：破坏重复 id 检查 → 父节点「覆盖 N 节点」虚高
  {
    const f = path.join(tmp, 'dup.cjs');
    fs.writeFileSync(f, src.replace(A_DUP, 'if (false) { }'), 'utf8');
    const mod = require(f);
    const nodes = new Map([['a', { id: 'a' }], ['b', { id: 'b' }], ['c', { id: 'c' }], ['d', { id: 'd' }]]);
    const ids = ['a', 'b', 'c', 'a'];
    eq('负控4 前提：原版拒重复 id', RU.canRollup(nodes, ids, 'x').ok, false);
    const v = mod.canRollup(nodes, ids, 'x');
    eq('负控4：破坏后重复 id 被放行', v.ok, true);
    eq('负控4b：正是「覆盖数虚高」的来源（childIds 仍是 4，实体只有 3）', v.children.length, 4);
  }
  // 负控制 5：破坏子节点数下限 → 两个节点也压一层（得不偿失的层会塞满图）
  {
    const f = path.join(tmp, 'tofew.cjs');
    fs.writeFileSync(f, src.replace(A_TOFEW, 'if (children.length < 1) {'), 'utf8');
    const mod = require(f);
    const nodes = new Map([['a', { id: 'a' }], ['b', { id: 'b' }]]);
    eq('负控5 前提：原版拒两个节点', RU.canRollup(nodes, ['a', 'b'], 'x').ok, false);
    eq('负控5：破坏后两个节点也成层', mod.canRollup(nodes, ['a', 'b'], 'x').ok, true);
  }
  // 负控制 6（打 index.js 真源码）：取消时间戳逃逸 → 无 floor 的事件节点全被跳过，功能空转
  {
    const brokenSrc = gSrc.replace(A_TSESCAPE, 'if (f === null) { skipped.push(String(n.id)); continue; }');
    eq('负控6a 破坏确实发生（真源码锚点命中）', brokenSrc !== gSrc, true);
    const mkBroken = new Function(
      'normalizeCharName', 'errLog', 'areLabelsInConflict', 'PLUGIN_NAME', '_moduleLib', 'window', 'console',
      `${brokenSrc}\n    return new MemoryGraph();`,
    )(normCharName, ERRLOG, () => false, 'test', libOn, undefined, { log() {} });
    // 双向契约：原版上同判据须真（能压成 1 层）
    const good = mkGraph(libOn);
    addEvents(good, 4, false);
    eq('负控6b 前提：原版能压成 1 层', good.autoRollup({ minChildren: 4, types: ['event'] }).created, 1);
    addEvents(mkBroken, 4, false);
    const r = mkBroken.autoRollup({ minChildren: 4, types: ['event'] });
    eq('负控6c 破坏后压成 0 层（功能空转）', r.created, 0);
    eq('负控6d 且这 4 个节点被静默计入 skipped', r.skipped, 4);
  }
  // 破坏副本自身会挂全局 → 必须还原，否则后续断言验的是坏副本
  ok('负控7a 破坏副本确实污染了宿主全局（还原断言非空转）', globalThis.LonShaNodeRollup !== goodGlobal);
  globalThis.LonShaNodeRollup = goodGlobal;
  ok('负控7b 宿主全局已还原为真模块', globalThis.LonShaNodeRollup === goodGlobal);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ========== 10. 接线自证 ==========
{
  const isrc = read('index.js');
  ok('10a index.js 引用 LonShaNodeRollup', /LonShaNodeRollup/.test(isrc));
  ok('10b 通过 _moduleLib 取库（模块接线审计的消费判据）', /_moduleLib\(\(\) => window\.LonShaNodeRollup, 'node-rollup\.js'\)/.test(isrc));
  const mf = JSON.parse(read('manifest.json'));
  ok('10c manifest 登记 node-rollup.js', mf.extra_js.includes('node-rollup.js'));
  ok('10d 有诊断读数入口', /_graphRollupLine/.test(isrc));
  ok('10e rollupGroup 写了认领标记', isrc.includes('child.data.rollupParent = String(parentId);'));
  ok('10f 写入走 addEdge 原路径（semantic_contains 边）', isrc.includes("type: 'semantic_contains'"));
  ok('10g 父节点走 addNode 并重建索引', isrc.includes('const parentId = this.addNode(plan.parent);') && isrc.includes('this.rebuildNameIndex();'));
  ok('10h maintainGraph 固定 rollup→vacuum 顺序', /out\.rollup = this\.autoRollup\(options\)[\s\S]{0,400}this\.vacuum\(/.test(isrc));
}
// 维护管线接线：步骤存在、在 optimize 之后、在 cadence-triage 之前、标记 ignoreFailure
{
  const isrc = read('index.js');
  const at = isrc.indexOf('async _maintenancePipeline(');
  ok('10i _maintenancePipeline 存在', at > 0);
  const body = isrc.slice(at, braceEnd(isrc, isrc.indexOf('{', at)) + 1);
  const iStep = body.indexOf("name: 'graph-rollup'");
  const iOpt = body.indexOf("name: 'optimize'");
  const iTri = body.indexOf("name: 'cadence-triage'");
  ok('10j graph-rollup 步骤存在', iStep > 0);
  ok('10k 排在 optimize 之后', iStep > iOpt && iOpt > 0);
  ok('10l 排在 cadence-triage 之前', iTri > iStep && iTri > 0);
  ok('10m 标 ignoreFailure（增强步骤失败不阻断落笔与归档）', /name: 'graph-rollup',\s*\n\s*ignoreFailure: true,/.test(body));
  ok('10n 复用既有节奏旋钮（不新造周期旋钮）', body.includes('optimizeEveryFloors'));
  ok('10o 读数留痕到引擎', body.includes('eng._graphRollupRead'));
  ok('10p 被 graphRollupEnabled 管控', body.includes('cfg.graphRollupEnabled !== false'));
  ok('10q 读 minChildren 配置', body.includes('cfg.graphRollupMinChildren'));
}
// 配置声明纪律（v3.160）：读取点用 config.config.KEY 的键必须在默认配置块声明
{
  const isrc = read('index.js');
  const cfgAt = isrc.indexOf('this.config = {');
  ok('10r 默认配置块存在', cfgAt > 0);
  const cfg = isrc.slice(cfgAt, braceEnd(isrc, isrc.indexOf('{', cfgAt)) + 1);
  ok('10s 声明 graphRollupEnabled', /graphRollupEnabled: true,/.test(cfg));
  ok('10t 声明 graphRollupMinChildren', /graphRollupMinChildren: 4,/.test(cfg));
}
// 面板控件（v3.160 纪律：已声明的键必须有控件或白名单槽位，否则用户不可达）
{
  const ui = read('settings-ui.js');
  ok('10u 面板有开关控件', /ck\('graphRollupEnabled'/.test(ui));
  ok('10v 面板有数值控件', /data-cfg-num="graphRollupMinChildren"/.test(ui));
  ok('10w 数值控件用 ?? 回退（min>0，仍按同族口径）', /graphRollupMinChildren \?\? 4/.test(ui));
}

// ========== 11. 诊断行真进 selfCheck ==========
{
  const isrc = read('index.js');
  const scStart = isrc.indexOf('async selfCheck() {');
  ok('11a selfCheck 方法存在', scStart > 0);
  const scBody = isrc.slice(scStart, braceEnd(isrc, isrc.indexOf('{', scStart)) + 1);
  ok('11b 真调用 _graphRollupLine', scBody.includes('this._graphRollupLine('));
  const rowsIdx = scBody.indexOf('const rows = [');
  ok('11c selfCheck 构建子系统列表 rows', rowsIdx >= 0);
  const lb = scBody.indexOf('[', rowsIdx);
  let _bd = 0, _rb = -1;
  for (let i = lb; i < scBody.length; i++) {
    if (scBody[i] === '[') _bd++;
    else if (scBody[i] === ']') { _bd--; if (_bd === 0) { _rb = i; break; } }
  }
  ok('11d rows 列表字面量闭合', _rb > lb);
  const lit = scBody.slice(lb, _rb + 1);
  const keys = [];
  for (const m of lit.matchAll(/\['([^']+)',/g)) keys.push(m[1]);
  for (const m of scBody.matchAll(/rows\.push\(\[\s*'([^']+)'/g)) keys.push(m[1]);
  ok('11e 诊断行「图谱汇总」进入 selfCheck 子系统列表', keys.includes('图谱汇总'), '现有键：' + keys.join(','));
}

// ========== 12. 版权纯度 ==========
{
  const src2 = read('node-rollup.js');
  // 版权纯度判据必须区分「代码复用」与「出处注释」：源码里提到参考项目名是正当的出处标注。
  // 真判据是**去掉注释后的代码体**里不含源实现的标识符/命名空间。
  const codeBody = src2
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  ok('12a 代码体不含源实现函数名', !codeBody.includes('compactNodes'));
  ok('12b 代码体不含源实现装配函数', !codeBody.includes('createRollupWithChildren'));
  ok('12c 代码体不含源实现重挂函数', !codeBody.includes('reparentNode'));
  ok('12d 代码体不含源实现错误码', !/BAD_ARGS|CHILD_NOT_FOUND|CHILD_HAS_PARENT/.test(codeBody));
  ok('12e 代码体不含参考项目命名（出处只允许出现在注释）', !/luker|nocturne|liyuan/i.test(codeBody));
  ok('12f 但保留出处注释（可追溯）', /luker/i.test(src2), '出处注释缺失则无法回溯参考来源');
  ok('12g CJS 双导出', /module\.exports = api/.test(src2));
  ok('12h 挂 LonSha 前缀全局', goodGlobal === RU && RU.ROLLUP_VERSION === 1);
  // 所有 catch 必须走 errLog（scan_claim_truthfulness 会数静默吞异常，不得新增）
  const silent = [...src2.matchAll(/catch\s*\([^)]*\)\s*\{\s*\}/g)].length;
  eq('12i 无空 catch（不新增静默吞异常）', silent, 0);
}
console.log(`v3184 node-rollup: ${pass} passed`);
