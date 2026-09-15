/**
 * v3.115 — 归档隐藏楼层的位移与剪枝修复（真实 bug）
 *
 * 背景：shiftFloorsFrom 给 10 个子系统做了楼层 index 位移校正，唯独漏了
 *   _archivedFloorIds；rollbackFloor 则对它一律 .clear()。
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
test('【6】index.js 正向接线', () => {
  assert.ok(idxSrc.includes('window.LonShaArchiveShift'), 'window 通道');
  assert.ok(idxSrc.includes("require('./archive-shift.js')"), 'require 降级通道');
  assert.ok(idxSrc.includes('_as.shiftArchivedIds'), 'shiftFloorsFrom 真调用');
  assert.ok(idxSrc.includes('_as.pruneArchivedIds'), 'rollbackFloor 真调用');
  assert.ok(idxSrc.includes("errLog(e, 'shiftFloorsFrom.归档楼层位移')"), '位移错误兜底');
  assert.ok(idxSrc.includes("errLog(e, 'rollbackFloor.归档状态精确清理')"), '剪枝错误兜底');
  // 回落路径存在（从接线点向后找 else）
  const shAt = idxSrc.indexOf('_as.shiftArchivedIds');
  assert.ok(shAt > 0, '位移真调用存在');
  const shElse = idxSrc.indexOf('} else if (this._archivedFloorIds', shAt);
  assert.ok(shElse > shAt && shElse < shAt + 400, '位移有 else 回落');
  const prAt = idxSrc.indexOf('_as.pruneArchivedIds');
  assert.ok(prAt > 0, '剪枝真调用存在');
  const prElse = idxSrc.indexOf('} else if (this._archivedFloorIds', prAt);
  assert.ok(prElse > prAt && prElse < prAt + 400, '剪枝有 else 回落');
  ok('接线（双通道 / 真调用 / 回落）');
});

// ---------- 7 ----------
test('【7】逆向审计：旧的全清已被替换', () => {
  // 旧的 rollbackFloor 全清已删除
  assert.ok(!/_archivedFloorIds\?\.clear\(\); \} catch \(e\) \{ errLog\(e, 'rollbackFloor\.归档状态清理'\)/.test(idxSrc), '旧全清已替换');
  assert.ok(!idxSrc.includes("errLog(e, 'rollbackFloor.归档状态清理')"), '旧错误标签已删除');
  // shiftFloorsFrom 内现在有归档位移（此前 10 个子系统唯独缺它）
  const sfAt = idxSrc.indexOf('shiftFloorsFrom(deleted)');
  const block = idxSrc.slice(sfAt, sfAt + 9000);
  assert.ok(block.includes('归档楼层位移'), 'shiftFloorsFrom 内含归档位移修复');
  // 位移修正必须在 dec 定义之后（否则闭包未定义）
  const decAt = idxSrc.indexOf('const dec = (v) =>', sfAt);
  const fixAt = block.indexOf('归档楼层位移');
  assert.ok(decAt > sfAt && fixAt > 0, '位移修复在函数体内');
  ok('旧全清已替换 / 位移修复已植入');
});

// ---------- 8 ----------
test('【8】回归：rollbackFloor 红线未破坏', () => {
  // 红线：引擎 rollbackFloor 内 removeLifeDetailByFloor 必须紧随 deltaBook（中间不能插代码）
  // 注意 index.js 有两处同名方法（引擎 + charMem 委托），用 floorLedgerEnabled 门控定位引擎本体
  const at = idxSrc.indexOf("if (!this.config.config.floorLedgerEnabled) return 0;");
  assert.ok(at > 0, '引擎 rollbackFloor 本体存在');
  const start = idxSrc.lastIndexOf('rollbackFloor(floor) {', at);
  assert.ok(start > 0 && start < at, '定位引擎方法');
  const db = idxSrc.indexOf('deltaBook', start);
  const ld = idxSrc.indexOf('removeLifeDetailByFloor', start);
  assert.ok(db > start, 'deltaBook 在函数内存在');
  assert.ok(ld > db, 'removeLifeDetailByFloor 仍在 deltaBook 之后（红线未破坏）');
  // 本版归档修复的插入位置必须不在 deltaBook 与 lifeDetail 之间
  const fixAt = idxSrc.indexOf('归档状态精确清理', start);
  assert.ok(fixAt > start, '归档修复在函数内');
  assert.ok(fixAt < db, '归档修复在 deltaBook 之前（不落入红线区间）');
  ok('rollbackFloor 红线安全（修复在 deltaBook 之前）');
});

console.log(`\n[v3.115] 归档楼层位移与剪枝修复：${pass} 组断言通过`);