/**
 * v3.112 — 覆盖账本重算（缝合 AnchorNote refreshSummaryArchiveStateFromAnchors）
 *
 * 覆盖：
 *   0  版本与 manifest 注册
 *   1  normalizeCoverer / normalizeCoverers：字段校验 + 去重
 *   2  isCovererUsable / covers：有效性与区间判定
 *   3  computeCoverage：归属推导 / 最佳覆盖者选择 / 孤儿检测
 *   4  planArchiveActions：toHide / toRestore / unchanged 三分
 *   5  覆盖者失效 → 自动恢复（本版核心价值）
 *   6  最近楼层保护 + 手动隐藏不接管
 *   7  applyPlan 幂等 + summarizeCoverage 诊断
 *   8  纯函数与确定性
 *   9  index.js 正向接线（推导路径 / 门控 / 报告）
 *  10  逆向审计：默认关时旧增量路径零变更
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
const suiSrc = readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf8');

function vnum(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}

const CL = require('../coverage-ledger.js');

let pass = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };

const cov = (id, from, to, extra) => Object.assign({ id, fromFloor: from, toFloor: to }, extra || {});

// ---------- 0 ----------
test('【0】版本与 manifest 注册', () => {
  const v = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
  assert.ok(vnum(v) >= vnum('3.112.0'), `index.js 版本 ${v} < 3.112.0`);
  assert.ok(vnum(manifest.version) >= vnum('3.112.0'), `manifest 版本 ${manifest.version} < 3.112.0`);
  assert.ok(manifest.extra_js.includes('coverage-ledger.js'), 'coverage-ledger.js 已注册 extra_js');
  ok('版本 / manifest 注册');
});

// ---------- 1 ----------
test('【1】normalizeCoverer / normalizeCoverers', () => {
  const c = CL.normalizeCoverer({ id: ' v1 ', fromFloor: '3', toFloor: 8, version: '2', kind: 'volume', label: '卷一' });
  assert.deepStrictEqual(
    { id: c.id, from: c.fromFloor, to: c.toFloor, v: c.version, kind: c.kind, label: c.label },
    { id: 'v1', from: 3, to: 8, v: 2, kind: 'volume', label: '卷一' },
  );
  assert.strictEqual(c.excluded, false);
  assert.strictEqual(c.hiddenReason, null);

  // toFloor 缺省时退化为单楼覆盖
  const single = CL.normalizeCoverer({ id: 's', fromFloor: 5 });
  assert.strictEqual(single.toFloor, 5, 'toFloor 缺省 = fromFloor（单楼覆盖）');
  assert.strictEqual(single.kind, 'coverage', '默认 kind');

  assert.strictEqual(CL.normalizeCoverer({ fromFloor: 1, toFloor: 2 }), null, '缺 id 非法');
  assert.strictEqual(CL.normalizeCoverer({ id: 'x' }), null, '缺楼层非法');
  assert.strictEqual(CL.normalizeCoverer({ id: 'x', fromFloor: 5, toFloor: 3 }), null, '区间倒置非法');
  assert.strictEqual(CL.normalizeCoverer({ id: 'x', fromFloor: -1, toFloor: 3 }), null, '负楼层非法');
  assert.strictEqual(CL.normalizeCoverer(null), null, 'null 安全');

  const list = CL.normalizeCoverers([
    cov('a', 1, 2), cov('a', 5, 6), null, cov('', 1, 2), cov('b', 3, 4),
  ]);
  assert.deepStrictEqual(list.map(x => x.id), ['a', 'b'], '同 id 去重（先出现者胜）+ 非法剔除');
  assert.strictEqual(list[0].toFloor, 2, '保留的是先出现的那个');
  assert.deepStrictEqual(CL.normalizeCoverers(null), [], '非数组安全');
  ok('覆盖者归一 / 校验 / 去重');
});

// ---------- 2 ----------
test('【2】isCovererUsable / covers', () => {
  const normal = CL.normalizeCoverer(cov('a', 3, 6));
  assert.strictEqual(CL.isCovererUsable(normal), true);
  assert.strictEqual(CL.isCovererUsable(CL.normalizeCoverer(cov('b', 1, 2, { excluded: true }))), false, '被排除不可用');
  assert.strictEqual(CL.isCovererUsable(CL.normalizeCoverer(cov('c', 1, 2, { hiddenReason: 'manual' }))), false, '手动隐藏不可用');
  assert.strictEqual(CL.isCovererUsable(CL.normalizeCoverer(cov('d', 1, 2, { hiddenReason: 'archive' }))), true, '归档隐藏仍可用');
  assert.strictEqual(CL.isCovererUsable(null), false, 'null 安全');

  assert.strictEqual(CL.covers(normal, 3), true, '含左端点');
  assert.strictEqual(CL.covers(normal, 6), true, '含右端点');
  assert.strictEqual(CL.covers(normal, 4), true);
  assert.strictEqual(CL.covers(normal, 2), false);
  assert.strictEqual(CL.covers(normal, 7), false);
  assert.strictEqual(CL.covers(normal, null), false, '非法楼层安全');
  assert.strictEqual(CL.covers(null, 3), false, 'null 覆盖者安全');
  ok('有效性 / 区间判定');
});

// ---------- 3 ----------
test('【3】computeCoverage：归属 / 最佳选择 / 孤儿', () => {
  const r = CL.computeCoverage(
    [cov('v1', 0, 4, { version: 1 }), cov('v2', 10, 12, { version: 2 }), cov('dead', 90, 95)],
    [0, 2, 5, 10, 12, 20],
  );
  assert.deepStrictEqual(r.covered, [0, 2, 10, 12], '被覆盖楼层升序');
  assert.deepStrictEqual(r.uncovered, [5, 20], '未覆盖楼层');
  assert.strictEqual(r.ownerByFloor[0], 'v1');
  assert.strictEqual(r.ownerByFloor[10], 'v2');
  assert.strictEqual(r.byFloor[5], false);
  assert.deepStrictEqual(r.orphans, ['dead'], '不覆盖任何候选楼层 = 孤儿');

  // 重叠覆盖：版本高者胜
  const overlap = CL.computeCoverage(
    [cov('low', 0, 10, { version: 1 }), cov('high', 5, 8, { version: 9 })],
    [6],
  );
  assert.strictEqual(overlap.ownerByFloor[6], 'high', '版本高者优先');
  assert.deepStrictEqual(overlap.orphans, ['low'], '被抢走全部楼层则为孤儿');

  // 同版本 → toFloor 大者胜（更宽的覆盖优先）
  const same = CL.computeCoverage([cov('narrow', 0, 3), cov('wide', 0, 9)], [2]);
  assert.strictEqual(same.ownerByFloor[2], 'wide', '同版本取覆盖更宽者');

  // 无效覆盖者不参与推导
  const excluded = CL.computeCoverage([cov('x', 0, 5, { excluded: true })], [1, 2]);
  assert.deepStrictEqual(excluded.covered, [], '被排除者不覆盖任何楼层');
  assert.deepStrictEqual(excluded.uncovered, [1, 2]);
  assert.deepStrictEqual(excluded.orphans, ['x']);

  // 楼层去重 + 排序
  const dup = CL.computeCoverage([cov('a', 0, 9)], [3, 1, 3, 1]);
  assert.deepStrictEqual(dup.covered, [1, 3], '楼层去重升序');
  assert.deepStrictEqual(CL.computeCoverage(null, null).covered, [], '空输入安全');
  ok('覆盖推导 / 最佳覆盖者 / 孤儿检测');
});

// ---------- 4 ----------
test('【4】planArchiveActions：三分', () => {
  const plan = CL.planArchiveActions({
    coverers: [cov('v', 0, 5)],
    floors: [0, 1, 2, 8],
    hiddenIds: [1],
  });
  assert.deepStrictEqual(plan.toHide, [0, 2], '新被覆盖且未藏 → 待隐藏（升序）');
  assert.strictEqual(plan.unchanged, 1, '已藏且仍被覆盖 → 保持');
  assert.deepStrictEqual(plan.toRestore, [], '无待恢复');
  assert.strictEqual(plan.protectFloor, null, '未传保护楼层');

  // 已藏但已不在候选范围内（楼层消失）→ 恢复
  const gone = CL.planArchiveActions({ coverers: [cov('v', 0, 5)], floors: [0], hiddenIds: [0, 99] });
  assert.deepStrictEqual(gone.toRestore, [99], '不在推导覆盖内的既有隐藏 → 恢复');

  const empty = CL.planArchiveActions({});
  assert.deepStrictEqual([empty.toHide, empty.toRestore, empty.unchanged], [[], [], 0], '空输入安全');
  ok('动作三分 / 升序 / 空安全');
});

// ---------- 5 ----------
test('【5】覆盖者失效 → 被覆盖楼层自动恢复（本版核心）', () => {
  const floors = [0, 1, 2, 3, 4];
  // 第一轮：卷覆盖 0-3，全部隐藏
  const first = CL.planArchiveActions({ coverers: [cov('vol', 0, 3)], floors, hiddenIds: [] });
  assert.deepStrictEqual(first.toHide, [0, 1, 2, 3]);
  const hidden1 = CL.applyPlan([], first);
  assert.deepStrictEqual(hidden1, [0, 1, 2, 3]);

  // 第二轮：卷被删除（覆盖者消失）→ 全部恢复
  const second = CL.planArchiveActions({ coverers: [], floors, hiddenIds: hidden1 });
  assert.deepStrictEqual(second.toRestore, [0, 1, 2, 3], '覆盖者消失 → 全部恢复可见');
  assert.deepStrictEqual(second.toHide, [], '无新增隐藏');
  assert.deepStrictEqual(CL.applyPlan(hidden1, second), [], '隐藏集合清空');

  // 第三轮：卷被「排除」而非删除 → 同样恢复
  const excluded = CL.planArchiveActions({ coverers: [cov('vol', 0, 3, { excluded: true })], floors, hiddenIds: hidden1 });
  assert.deepStrictEqual(excluded.toRestore, [0, 1, 2, 3], '覆盖者被排除 → 恢复');

  // 第四轮：覆盖区间收缩（卷改为只覆盖 0-1）→ 2、3 恢复，0、1 保持
  const shrunk = CL.planArchiveActions({ coverers: [cov('vol', 0, 1)], floors, hiddenIds: hidden1 });
  assert.deepStrictEqual(shrunk.toRestore, [2, 3], '区间收缩 → 落在外面的恢复');
  assert.strictEqual(shrunk.unchanged, 2, '仍被覆盖的保持隐藏');
  assert.deepStrictEqual(CL.applyPlan(hidden1, shrunk), [0, 1]);

  // 第五轮：另一个覆盖者接管同一批楼层 → 不恢复（有人认领）
  const takeover = CL.planArchiveActions({
    coverers: [cov('vol', 0, 3, { excluded: true }), cov('vol2', 0, 3, { version: 3 })],
    floors,
    hiddenIds: hidden1,
  });
  assert.deepStrictEqual(takeover.toRestore, [], '有其他有效覆盖者接管 → 保持隐藏');
  assert.strictEqual(takeover.unchanged, 4);
  ok('覆盖者失效自动恢复 / 区间收缩 / 接管不恢复');
});

// ---------- 6 ----------
test('【6】最近楼层保护 + 手动隐藏不接管', () => {
  const plan = CL.planArchiveActions({
    coverers: [cov('v', 0, 100)],
    floors: [0, 1, 2, 3, 4],
    hiddenIds: [],
    protectFloor: 2,
  });
  assert.deepStrictEqual(plan.toHide, [0, 1, 2], 'protectFloor 之上的楼层不隐藏');
  assert.strictEqual(plan.protectFloor, 2, '保护楼层回显');

  // protectFloor 为 0：只允许隐藏第 0 楼
  const strict = CL.planArchiveActions({ coverers: [cov('v', 0, 100)], floors: [0, 1], hiddenIds: [], protectFloor: 0 });
  assert.deepStrictEqual(strict.toHide, [0], 'protectFloor=0 生效（不是「无保护」）');

  // 保护不影响恢复：受保护范围内的既有隐藏若已无覆盖者，仍应恢复
  const restore = CL.planArchiveActions({ coverers: [], floors: [0, 1, 2, 3, 4], hiddenIds: [4], protectFloor: 1 });
  assert.deepStrictEqual(restore.toRestore, [4], '保护只拦隐藏，不拦恢复（恢复永远安全）');

  // 手动隐藏不接管：调用方只传自己藏过的楼层，未传入者永不被 restore 触及
  const manual = CL.planArchiveActions({ coverers: [cov('v', 0, 9)], floors: [0, 1], hiddenIds: [] });
  assert.ok(!manual.toRestore.includes(7), '未登记的楼层不会被恢复（手动隐藏安全）');
  ok('最近楼层保护 / 恢复不受保护限制 / 手动隐藏安全');
});

// ---------- 7 ----------
test('【7】applyPlan 幂等 + summarizeCoverage 诊断', () => {
  const floors = [0, 1, 2, 3];
  const plan = CL.planArchiveActions({ coverers: [cov('v', 0, 2)], floors, hiddenIds: [1] });
  const after = CL.applyPlan([1], plan);
  assert.deepStrictEqual(after, [0, 1, 2], '应用后集合正确且升序');

  // 幂等：同状态再算一次，无动作
  const again = CL.planArchiveActions({ coverers: [cov('v', 0, 2)], floors, hiddenIds: after });
  assert.deepStrictEqual([again.toHide, again.toRestore], [[], []], '收敛后无动作（幂等）');
  assert.strictEqual(again.unchanged, 3);
  assert.deepStrictEqual(CL.applyPlan(after, again), after, '再次应用不变');

  const s = CL.summarizeCoverage(plan);
  assert.strictEqual(s.candidateFloors, 4);
  assert.strictEqual(s.coveredFloors, 3);
  assert.strictEqual(s.coverageRate, 0.75);
  assert.strictEqual(s.toHide, 2);
  assert.strictEqual(s.toRestore, 0);
  assert.strictEqual(s.unchanged, 1);
  assert.strictEqual(s.hiddenFloors, 3, '执行后隐藏数 = 保持 + 新增');

  const restorePlan = CL.planArchiveActions({ coverers: [], floors, hiddenIds: [0, 1] });
  const rs = CL.summarizeCoverage(restorePlan);
  assert.strictEqual(rs.toRestore, 2);
  assert.strictEqual(rs.hiddenFloors, 0, '全部恢复后隐藏数为 0');
  assert.strictEqual(rs.coverageRate, 0, '无覆盖者时覆盖率 0');

  const empty = CL.summarizeCoverage(null);
  assert.strictEqual(empty.candidateFloors, 0);
  assert.strictEqual(empty.coverageRate, 0, '空计划不除零');
  assert.deepStrictEqual(empty.orphans, []);
  ok('应用幂等 / 诊断口径');
});

// ---------- 8 ----------
test('【8】纯函数与确定性', () => {
  const coverers = [cov('a', 0, 3), cov('b', 5, 9, { version: 2 })];
  const floors = [0, 1, 6, 20];
  const hidden = [1];
  const snap = JSON.stringify([coverers, floors, hidden]);
  const p1 = CL.planArchiveActions({ coverers, floors, hiddenIds: hidden });
  CL.applyPlan(hidden, p1);
  CL.summarizeCoverage(p1);
  assert.strictEqual(JSON.stringify([coverers, floors, hidden]), snap, '入参未被修改');

  const p2 = CL.planArchiveActions({ coverers, floors, hiddenIds: hidden });
  assert.deepStrictEqual(p1.toHide, p2.toHide, '同输入同结果');
  assert.deepStrictEqual(p1.toRestore, p2.toRestore);
  assert.deepStrictEqual(p1.coverage.ownerByFloor, p2.coverage.ownerByFloor);

  // 覆盖者顺序打乱不改变归属（排序键完全确定）
  const shuffled = CL.planArchiveActions({ coverers: [coverers[1], coverers[0]], floors, hiddenIds: hidden });
  assert.deepStrictEqual(shuffled.coverage.ownerByFloor, p1.coverage.ownerByFloor, '覆盖者顺序无关');
  ok('纯函数 / 确定性 / 顺序无关');
});

// ---------- 9 ----------
test('【9】index.js 接线：推导路径已挂上归档', () => {
  assert.ok(idxSrc.includes('window.LonShaCoverageLedger'), 'window 通道');
  assert.ok(idxSrc.includes("require('./coverage-ledger.js')"), 'require 降级通道');
  assert.ok(idxSrc.includes('_recomputeCoverage'), '重算方法存在');
  assert.ok(idxSrc.includes('cl.planArchiveActions'), '计划真调用');
  assert.ok(idxSrc.includes('cl.summarizeCoverage'), '诊断真调用');
  assert.ok(/coverageLedgerEnabled:\s*false/.test(idxSrc), '默认关（不改变既有行为）');
  assert.ok(idxSrc.includes('coverageLedgerEnabled === true'), '门控为显式 === true');
  assert.ok(idxSrc.includes('plan.toRestore'), '恢复动作真执行');
  assert.ok(idxSrc.includes('this._archivedFloorIds.delete(idx)'), '恢复时从集合移除');
  assert.ok(idxSrc.includes("m.is_hidden && !ownSet.has(i)"), '用户手动隐藏楼层被排除（不接管）');
  assert.ok(idxSrc.includes('覆盖账本') && idxSrc.includes('exportMemoryReport'), '审计报告展示');
  assert.ok(suiSrc.includes('coverageLedgerEnabled'), 'settings-ui 声明该键（非幽灵配置）');
  ok('接线（推导 / 门控 / 恢复 / UI）');
});

// ---------- 10 ----------
test('【10】逆向审计：默认关时旧增量路径零变更', () => {
  const gateAt = idxSrc.indexOf('if (this.config.config.coverageLedgerEnabled === true) {');
  assert.ok(gateAt > 0, '门控分支存在');
  // 旧路径（folded 集合 + hideChatMessageRange）仍完整保留在门控之后
  const legacyAt = idxSrc.indexOf('const foldedFloors = new Set(', gateAt);
  assert.ok(legacyAt > gateAt, '既有 folded 增量路径仍在且位于门控之后');
  assert.ok(idxSrc.includes('aiSeen > keep && foldedFloors.has(i) && !this._archivedFloorIds.has(i)'), '旧判据未改');
  assert.ok(idxSrc.includes('restoreArchivedFloors()'), '既有全量恢复方法仍在');

  // 门控内必须允许回落：模块缺失时返回 null → 继续走旧路径
  const block = idxSrc.slice(gateAt, legacyAt);
  assert.ok(block.includes('if (applied !== null) return applied;'), '仅在重算成功时短路，否则回落旧路径');
  assert.ok(idxSrc.includes("errLog(e, '覆盖账本.recomputeCoverage'); return null;"), '异常回落 null（不吞掉归档能力）');

  // 既有清空逻辑保留（v3.25.1 结构变更清空，仍是关闭时的正确行为）
  assert.ok(idxSrc.includes("errLog(e, 'events.MESSAGE_DELETED归档清空')"), '删楼清空仍在');
  assert.ok(idxSrc.includes("errLog(e, 'events.CHAT_CHANGED归档清空')"), '换对话清空仍在');
  assert.ok(idxSrc.includes('autoArchiveCovered: false'), '既有归档开关未动');

  // 纯函数无状态
  const c = [cov('a', 0, 2)];
  assert.deepStrictEqual(
    CL.planArchiveActions({ coverers: c, floors: [1], hiddenIds: [] }).toHide,
    CL.planArchiveActions({ coverers: c, floors: [1], hiddenIds: [] }).toHide,
  );
  ok('旧增量路径未改 / 可回落 / 幂等');
});

console.log(`\n[v3.112] 覆盖账本重算：${pass} 组断言通过`);