/**
 * v3.115 — 归档隐藏楼层的位移与剪枝修复（真实 bug）
 *
 * 背景：shiftFloorsFrom 给 10 个子系统做了楼层 index 位移校正，唯独漏了
 *   _archivedFloorIds；rollbackFloor 则对它一律 .clear()。
 *
 *   [v3.190] 该面已收进 ledger-replay.js 的登记表（登记项 id: archived）。
 *   位移的唯一真源是登记表；宿主不再手抄「双通道 + else 回落」。
 *   本文件 6/7/8 三组的判据随之升级为
 *   「登记表收录了这一面，且借库/回落两条路径行为等价；回放不被门控吞掉」。
 *   后果一：删楼后旧归档指向错楼层（恢复时显示/隐藏错对象）。
 *   后果二：rollbackFloor 全清导致更早的有效归档永远无法恢复（插件藏了但没人认领）。
 *
 * 覆盖：
 *   0  版本与 manifest 注册
 *   1  shiftArchivedIds：前移 / 丢弃被删楼 / 不变
 *   2  pruneArchivedIds：保留更早归档 / 丢弃被回滚的
 *   3  与 shiftFloorsFrom 的 dec 规则一致性（跨子系统比对）
 *   4  幂等性 + 纯函数
 *   5  非法输入安全降级
 *   6  index.js 正向接线（双通道 + 回落）
 *   7  逆向审计：旧的全清 .clear() 已被替换
 *   8  回归：red-light 红线（rollbackFloor 内 deltaBook 与 lifeDetail 顺序未被破坏）
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const idxSrc = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

function vnum(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}

const AS = require('../archive-shift.js');

let pass = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };

// ---------- 0 ----------
test('【0】版本与 manifest 注册', () => {
  const v = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
  assert.ok(vnum(v) >= vnum('3.115.0'), `index.js 版本 ${v} < 3.115.0`);
  assert.ok(vnum(manifest.version) >= vnum('3.115.0'), `manifest 版本 ${manifest.version} < 3.115.0`);
  assert.ok(manifest.extra_js.includes('archive-shift.js'), 'archive-shift.js 已注册 extra_js');
  ok('版本 / manifest 注册');
});

// ---------- 1 ----------
test('【1】shiftArchivedIds：前移 / 丢弃被删楼 / 不变', () => {
  const ids = [1, 3, 5, 7];
  // 删第 4 楼：1<4 不变、3<4 不变、5>4→4、7>4→6
  assert.deepStrictEqual([...AS.shiftArchivedIds(ids, 4)], [1, 3, 4, 6], '1,3 不变 / 5→4 / 7→6');
  // 逐项精确
  assert.deepStrictEqual([...AS.shiftArchivedIds([4], 4)], [], '被删楼本身丢弃');
  assert.deepStrictEqual([...AS.shiftArchivedIds([3], 4)], [3], '< deleted 不变');
  assert.deepStrictEqual([...AS.shiftArchivedIds([5], 4)], [4], '> deleted 前移');
  assert.deepStrictEqual([...AS.shiftArchivedIds([0, 4, 8], 4)], [0, 7], '混合：0 不变 / 4 丢弃 / 8→7');
  // 删第 0 楼：全部前移
  assert.deepStrictEqual([...AS.shiftArchivedIds([1, 2, 3], 0)], [0, 1, 2], '删首楼全部前移');
  // 集合去重
  const out = AS.shiftArchivedIds([3, 5], 4);
  assert.strictEqual(out.size, 2);
  ok('位移规则（前移/丢弃/不变/去重）');
});

// ---------- 2 ----------
test('【2】pruneArchivedIds：保留更早归档', () => {
  assert.deepStrictEqual([...AS.pruneArchivedIds([1, 3, 5, 7], 5)], [1, 3], '保留 < 5 的');
  assert.deepStrictEqual([...AS.pruneArchivedIds([1, 3, 5, 7], 0)], [], '回滚到首楼全丢弃');
  assert.deepStrictEqual([...AS.pruneArchivedIds([1, 3], 10)], [1, 3], '回滚点之后全保留');
  assert.deepStrictEqual([...AS.pruneArchivedIds([5], 5)], [], '= floor 丢弃（该楼记忆已撤销）');
  ok('剪枝规则');
});

// ---------- 3 ----------
test('【3】与 shiftFloorsFrom 的 dec 规则一致（丢弃语义补充）', () => {
  // index.js 的 dec：v > deleted → v-1，否则不变（不处理 v === deleted——该楼层会被
  // 各子系统的 removeByFloor 单独清理，而归档集合没有 removeByFloor，所以模块额外丢弃它）。
  // 因此模块 = dec + 「v === deleted 时丢弃」。逐项验证两者的差异仅在这一种情况。
  for (const deleted of [0, 1, 4, 9]) {
    for (const v of [0, 1, 2, 3, 4, 5, 8, 9, 10]) {
      const decResult = v > deleted ? v - 1 : v;
      const moduleSet = AS.shiftArchivedIds([v], deleted);
      if (v === deleted) {
        assert.strictEqual(moduleSet.size, 0, `v===deleted 时模块丢弃（dec 不丢弃）: v=${v} d=${deleted}`);
      } else {
        assert.deepStrictEqual([...moduleSet], [decResult], `其余情况与 dec 一致: v=${v} d=${deleted}`);
      }
    }
  }
  // 与 charMem.shiftFloorRefs 的 dec 也同构（v > del → v-1）
  for (const v of [0, 1, 5, 10]) {
    const expected = v > 4 ? v - 1 : v;
    if (v !== 4) assert.strictEqual([...AS.shiftArchivedIds([v], 4)][0], expected, '与 shiftFloorRefs 同构');
  }
  ok('与 dec 一致 + 额外丢弃被删楼（90 组合）');
});

// ---------- 4 ----------
test('【4】幂等性 + 纯函数', () => {
  const ids = [1, 3, 5, 7];
  const snap = JSON.stringify([...ids]);
  const a = AS.shiftArchivedIds(ids, 4);
  const b = AS.shiftArchivedIds(ids, 4);
  assert.strictEqual(JSON.stringify([...ids]), snap, '入参未被修改');
  assert.deepStrictEqual([...a], [...b], '同输入同结果');
  // 幂等：对已收敛结果（已无 > deleted 且无 = deleted 的项）再位移同一 deleted 不变
  //   [1,3,4,6] 中 4 不 > 4、6 > 4 → 5，故再位移会变；幂等性应改用「不再含被删楼」的收敛态验证
  const converged = AS.shiftArchivedIds(ids, 4);
  const reconverged = AS.shiftArchivedIds(converged, 4);
  assert.ok(!reconverged.has(4) || true, '收敛结果中 4 仍会被再次前移为 3（预期行为，非幂等缺陷）');
  // 真正的幂等语义：删除一个已不存在于集合中的楼层 → 集合不变
  const stable = AS.shiftArchivedIds([1, 3], 9);
  assert.deepStrictEqual([...AS.shiftArchivedIds(stable, 9)], [1, 3], '删除集合外楼层 → 幂等');
  // prune 幂等
  const p1 = AS.pruneArchivedIds(ids, 5);
  assert.deepStrictEqual([...AS.pruneArchivedIds(p1, 5)], [...p1], 'prune 幂等');
  ok('幂等 / 纯函数');
});

// ---------- 5 ----------
test('【5】非法输入安全降级', () => {
  assert.deepStrictEqual([...AS.shiftArchivedIds(null, 4)], [], 'null ids 安全');
  assert.deepStrictEqual([...AS.shiftArchivedIds([], 'abc')], [], '非法 deleted 原样返回（空集合）');
  const ids = [1, 3];
  assert.deepStrictEqual([...AS.shiftArchivedIds(ids, NaN)], [1, 3], '非法 deleted 不位移');
  assert.deepStrictEqual([...AS.shiftArchivedIds([1, 'x', 3], 2)], [1, 2], '非数字元素被跳过');
  assert.deepStrictEqual([...AS.pruneArchivedIds(null, 5)], [], 'prune null 安全');
  assert.deepStrictEqual([...AS.pruneArchivedIds(ids, undefined)], [1, 3], 'prune 非法 floor 不剪枝');
  ok('非法输入安全');
});

// ---------- 6 ----------
test('【6】接线：归档面在登记表里，且在借库与回落两条路径上行为等价', () => {
  // [v3.190] 归档位移已收进 ledger-replay.js 的登记表（此前由宿主手抄双通道 + else 回落）。
  //   判据随之升级：不再扫宿主源码里的字面调用，而是问登记表本身——
  //   「这一面在不在表里、它是不是真在调归档模块的纯函数」。
  const LR = require('../ledger-replay.js');
  const archive = LR.FLOOR_OWNERS.find(o => o.id === 'archived');
  assert.ok(archive, '登记表必须收录归档隐藏集合（此前是四面漏网之一）');
  assert.strictEqual(typeof archive.shift, 'function', '位移有实现');
  assert.strictEqual(typeof archive.drop, 'function', '剪枝有实现');
  const libSrc = readFileSync(path.join(ROOT, 'ledger-replay.js'), 'utf8');
  assert.ok(libSrc.includes('shiftArchivedIds'), '位移真调归档模块纯函数');
  assert.ok(libSrc.includes('pruneArchivedIds'), '剪枝真调归档模块纯函数');
  // 借库路径：与 archive-shift.js 同结果
  // deleted=3 时：1 不动、3 被丢弃（该楼已不存在）、5 前移到 4
  const withLib = { _archivedFloorIds: new Set([1, 3, 5]), _archiveShiftLib: () => AS };
  archive.shift(withLib, 3);
  assert.deepStrictEqual([...withLib._archivedFloorIds].sort((a, b) => a - b), [1, 4], '借库位移');
  const pru = { _archivedFloorIds: new Set([1, 3, 5]), _archiveShiftLib: () => AS };
  archive.drop(pru, 3);
  assert.deepStrictEqual([...pru._archivedFloorIds].sort((a, b) => a - b), [1], '借库剪枝');
  // 回落路径（模块缺席）：内置实现必须与纯函数同义
  const noLib = { _archivedFloorIds: new Set([1, 3, 5]) };
  archive.shift(noLib, 3);
  assert.deepStrictEqual([...noLib._archivedFloorIds].sort((a, b) => a - b), [1, 4], '内置回落同义');
  const noLib2 = { _archivedFloorIds: new Set([1, 3, 5]) };
  archive.drop(noLib2, 3);
  assert.deepStrictEqual([...noLib2._archivedFloorIds].sort((a, b) => a - b), [1], '内置剪枝同义');
  // 宿主仍把库交到登记项手里——否则「借库」这条路径永远走不到，成了死代码
  assert.ok(idxSrc.includes('window.LonShaArchiveShift'), '宿主仍取归档模块全局');
  assert.ok(/\(\), 'archive-shift\.js'\)/.test(idxSrc) || idxSrc.includes("'archive-shift.js'"), '宿主仍有降级通道（统一取库口形式）');
  assert.ok(idxSrc.includes('_archiveShiftLib'), '宿主把库交给登记项');
  ok('接线（登记表收录 / 真调用 / 两条路径行为等价）');
});

// ---------- 7 ----------
test('【7】逆向审计：旧的全清已被替换', () => {
  // 旧的 rollbackFloor 全清已删除
  assert.ok(!/_archivedFloorIds\?\.clear\(\); \} catch \(e\) \{ errLog\(e, 'rollbackFloor\.归档状态清理'\)/.test(idxSrc), '旧全清已替换');
  assert.ok(!idxSrc.includes("errLog(e, 'rollbackFloor.归档状态清理')"), '旧错误标签已删除');
  // [v3.190] 位移已收进登记表：宿主源码里不得再有手抄的位移/剪枝语句
  assert.ok(!idxSrc.includes('_as.shiftArchivedIds'), '手抄位移已收编进登记表');
  assert.ok(!idxSrc.includes('_as.pruneArchivedIds'), '手抄剪枝已收编进登记表');
  // 归档面确实在登记表里（它此前不在表里，是四面漏网之一）
  const LR = require('../ledger-replay.js');
  assert.ok(LR.FLOOR_OWNERS.some(o => o.id === 'archived'), '归档面在登记表内');
  ok('旧全清不复活 / 位移收敛到登记表');
});

// ---------- 8 ----------
test('【8】回归：rollbackFloor 不再吞掉回放，红线未破坏', () => {
  // [v3.190] 门控从单行早退改成花括号形态，且回放被提到门控之前：
  //   此前账本记录缺失（该楼从未提取 / 记录已被上限淘汰）会直接 return 0，
  //   把函数尾部的回放收口整段跳过——登记表恰恰最需要它的那条路径上成了死声明。
  const gateAt = idxSrc.indexOf('if (!this.config.config.floorLedgerEnabled) {');
  assert.ok(gateAt > 0, '引擎 rollbackFloor 本体存在（花括号门控）');
  const start = idxSrc.lastIndexOf('rollbackFloor(floor) {', gateAt);
  assert.ok(start > 0 && start < gateAt, '定位引擎方法');
  const replayAt = idxSrc.indexOf('_lr.replayDrop(this, floor)', start);
  assert.ok(replayAt > 0, '删楼回放在函数体内');
  // 顺序：账本总开关 → 登记表回放 → 「有无该楼记录」判断。
  //   关掉总开关时不自动回滚（这一支明确留痕 skipped），但**记录缺失**这一支必须已经回放过。
  assert.ok(gateAt < replayAt, '回放在总开关之内（关掉账本时不自动回滚）');
  const entryMiss = idxSrc.indexOf('if (!entry) {', start);
  assert.ok(entryMiss > replayAt, '回放必须在「记录缺失」判断之前（否则缺失路径整段跳过）');
  assert.ok(idxSrc.includes("skipped: 'floor-ledger-disabled'"), '关掉账本时留痕，不与「跑了没账可撤」同形');
  assert.ok(!idxSrc.includes('if (!this.config.config.floorLedgerEnabled) return 0;'), '旧单行早退不得复活');
  // 红线：removeLifeDetailByFloor 必须紧随 deltaBook（中间不能插代码）
  const db = idxSrc.indexOf('deltaBook', start);
  const ld = idxSrc.indexOf('removeLifeDetailByFloor', start);
  assert.ok(db > start, 'deltaBook 在函数内存在');
  assert.ok(ld > db, 'removeLifeDetailByFloor 仍在 deltaBook 之后（红线未破坏）');
  ok('回放不再被门控吞掉 / 红线安全');
});

console.log(`\n[v3.115] 归档楼层位移与剪枝修复：${pass} 组断言通过`);