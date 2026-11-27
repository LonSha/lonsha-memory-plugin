/**
 * tests/v3488_failure_ladder_final_score_frozen.test.mjs — v3.488.0
 *
 * 缝合对象：光域·镜忆 V0.1（用户提供的酒馆助手脚本，239KB 单文件运行时）。
 * 本版只缝三条**本仓实测 0 命中**的纪律，不搬它的实现：
 *   ① 失败分档冷却（超时类失败此前一律不落表）      → failure-class-cooldown.js
 *   ② 召回终分合成（分解留痕 / 邻楼加成 / na 分档）  → recall-final-score.js
 *   ③ 冻结档（旧楼层切成按桶对齐的不变块）          → frozen-archive-blocks.js
 * 不缝的两条已在 v3.484.0 落过（grain 双粒度、90-10 前缀分段），本版不重复造。
 *
 * 覆盖：
 *   1. 五档分类各归各档（401/403 凭据、429/5xx 限流、超时、传输、分不出来）
 *   2. 分不出来 ⇒ unknown 且 TTL=0，与 transport 不同形
 *   3. record 累加 count / verdict 三态（cooling / open / absent）
 *   4. sweep 只清到点的，且 cleared 有计数
 *   5. 各档 TTL 的序关系（auth > quota > timeout = transport > unknown）
 *   6. 终分：楼层口径优先于天口径
 *   7. 终分：importance=1（5 档最低）不得拿到最高加成（首稿自伤回归）
 *   8. 终分：显式 importanceScale 覆盖值域推断
 *   9. 终分：缺因子记 null + incomplete，不冒充 1.0
 *  10. 终分：邻楼只加权，绝不合并 / 绝不改 uid / 绝不删条目
 *  11. 终分：neutral 与 composed 不同形（前者是「空转」的证据）
 *  12. 终分：纯函数（不改入参），且同分稳定
 *  13. 冻结：块 id 与入参顺序无关（同集同 id）
 *  14. 冻结：同内容 rewrites=0；改内容 rewrites>0（读数有分辨力）
 *  15. 冻结：不满桶不产块，且**不丢内容**（blocks 收走 + rest === 输入）
 *  16. 冻结：窗口推进 / 补旧条目不制造 rewrite（绝对楼层桶号）
 *  17. 接线自证：manifest 登记 ×3 + index 三库口 + engine-recall 真路径 + organs 传表
 *  18. 当版锚
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);
const CO = require(path.join(root, 'failure-class-cooldown.js'));
const FS = require(path.join(root, 'recall-final-score.js'));
const FZ = require(path.join(root, 'frozen-archive-blocks.js'));

/* ══════════ 一、失败分档冷却 ══════════ */

test('1. 五档分类各归各档', () => {
  assert.equal(CO.classify(401).cls, 'auth');
  assert.equal(CO.classify(403).cls, 'auth');
  assert.equal(CO.classify(429).cls, 'quota');
  assert.equal(CO.classify(503).cls, 'quota');
  assert.equal(CO.classify({ timedOut: true }).cls, 'timeout');
  assert.equal(CO.classify({ name: 'AbortError' }).cls, 'timeout');
  assert.equal(CO.classify({ name: 'TypeError' }).cls, 'transport');
  /* 其余 4xx 是请求本身不合法：改请求即可，不该按凭据错冷却半小时 */
  assert.equal(CO.classify(400).cls, 'transport');
  assert.equal(CO.classify(422).reason, 'http-422');
});

test('2. 分不出来就说不出来：unknown 不冷却，且与 transport 不同形', () => {
  const u = CO.classify({ name: 'WeirdError' });
  assert.equal(u.cls, 'unknown', '不许把没见过的错误硬塞进 transport');
  assert.equal(CO.ttlFor('unknown'), 0, 'unknown 不冷却');
  assert.ok(CO.ttlFor('transport') > 0);
  const e = CO.record(null, { name: 'WeirdError' }, 1000);
  assert.equal(CO.verdict(e, 1000).state, 'open', 'TTL 0 ⇒ 立刻就是 open，不挂冷却');
  assert.equal(e.count, 1, '但仍留一条账，不是无声丢弃');
});

test('3. record 累加 count；verdict 三态可分', () => {
  const t0 = 1_000_000;
  let e = CO.record(null, { timedOut: true }, t0);
  assert.equal(e.count, 1);
  e = CO.record(e, { timedOut: true }, t0 + 1000);
  assert.equal(e.count, 2, '连续失败要累加');
  assert.equal(e.firstAt, t0, 'firstAt 必须停在第一次');
  assert.equal(CO.verdict(e, t0 + 2000).state, 'cooling');
  assert.equal(CO.verdict(e, t0 + 999_999).state, 'open', '到点即解除');
  assert.equal(CO.verdict(null, t0).state, 'absent');
  /* absent 与 open 必须不同形：一个是「压根没探过」，一个是「探过、好了」 */
  assert.notEqual(CO.verdict(null, t0).state, CO.verdict(e, t0 + 999_999).state);
});

test('4. sweep 只清到点的，cleared 有计数', () => {
  const t0 = 1_000_000;
  const map = new Map();
  map.set('a', CO.record(null, { timedOut: true }, t0));          /* 120s */
  map.set('b', CO.record(null, 401, t0));                          /* 1800s */
  const r = CO.sweep(map, t0 + 200_000);
  assert.equal(r.kept, 1, 'auth 还在冷却');
  assert.equal(r.cleared, 1, 'timeout 已到点被清');
  assert.deepEqual(r.clearedKeys, ['a']);
  assert.equal(map.has('a'), false);
  assert.equal(CO.sweep(null, t0).malformed, true, '非 Map 如实报 malformed，不抛');
});

test('5. 各档 TTL 的序关系', () => {
  const auth = CO.ttlFor('auth');
  const quota = CO.ttlFor('quota');
  const timeout = CO.ttlFor('timeout');
  const transport = CO.ttlFor('transport');
  assert.ok(auth > quota, '配置错该比限流关得久');
  assert.ok(quota > timeout, '限流该比网络抖动关得久');
  assert.equal(timeout, transport, '超时与传输同档：都只是抖动');
  assert.equal(CO.ttlFor('unknown'), 0);
  /* opts 可逐档覆盖（面板调档走这里） */
  assert.equal(CO.ttlFor('auth', { auth: 5 }), 5);
});

/* ══════════ 二、召回终分合成 ══════════ */

const DECAY_FLOOR = (d) => Math.exp(-d / 60);

test('6. 楼层口径优先于天口径', () => {
  const items = [{ id: 'x', score: 1, floor: 0, ageDays: 0 }];
  /* 两条曲线给相反的结果：谁生效一眼看得出 */
  const r = FS.compose(items, {
    nowFloor: 100,
    decayFloor: () => 0.5,
    decay: () => 0.9
  });
  assert.equal(r.items[0].factors.time, 0.5, '给了 decayFloor 就必须用楼层口径');
  assert.equal(r.items[0].factors.timeBasis, 'floor');
  assert.equal(r.readings.timeByFloor, 1);
  assert.equal(r.readings.timeByDays, 0, '两种基数分开计数，不许混在一张表上');
});

test('7. importance=1 是 5 档最低，不得拿到最高加成（首稿自伤回归）', () => {
  const low = FS.importanceOf({ importance: 1 });
  const high = FS.importanceOf({ importance: 5 });
  assert.equal(low.scale, 'five', '1 落在两套口径的重叠点上，按本仓主流（5 档）解释');
  assert.equal(low.value, 0);
  assert.equal(high.value, 1);
  const r = FS.compose([
    { id: 'low', score: 1, floor: 10, importance: 1 },
    { id: 'high', score: 1, floor: 10, importance: 5 }
  ], { nowFloor: 10, decayFloor: () => 1, neighborEnabled: false });
  const byId = Object.fromEntries(r.items.map((x) => [x.id, x]));
  assert.ok(byId.high.factors.importance > byId.low.factors.importance,
    '最不重要的那条拿到更高加成 = 方向性错误');
  assert.equal(byId.low.importanceAssumed, true, '口径靠推断时必须留痕');
});

test('8. 显式 importanceScale 覆盖值域推断', () => {
  const u = FS.importanceOf({ importance: 1, importanceScale: 'unit' });
  assert.equal(u.scale, 'unit');
  assert.equal(u.value, 1);
  assert.equal(u.assumed, false, '调用方声明过就不是「推断」');
  const f = FS.importanceOf({ importance: 0.8, importanceScale: 'five' });
  assert.equal(f.scale, 'five', '显式声明优先于值域');
});

test('9. 缺因子记 null + incomplete，不冒充 1.0', () => {
  /* 取证纪律：要断言「三个因子都缺席」，就必须把邻楼显式关掉 ——
   *   邻楼默认是开的，`nowFloor` 与条目同楼就必然命中，那时「缺席」是假话。 */
  const r = FS.compose([{ id: 'n', score: 1, floor: 10 }], { nowFloor: 10, neighborEnabled: false });
  const it = r.items[0];
  assert.equal(it.factors.time, null, '没有任何衰减来源 ⇒ null，不是 1.0');
  assert.equal(it.na.time, true);
  assert.equal(it.incomplete, true);
  assert.equal(it.factors.importance, null);
  assert.equal(r.readings.naTime, 1);
  assert.equal(r.readings.naImportance, 1);
  assert.equal(r.state, 'neutral', '三个因子都缺席 ⇒ 空转，不是 composed');
  /* ×1 的因子不是「生效」：曲线给了但正好返回 1，分数没动、序没动，
   *   报 composed 就是空转被冒充成生效（靠 withTime 判状态的旧写法会报错）。 */
  const one = FS.compose([{ id: 'p', score: 1, floor: 40 }], { nowFloor: 40, decayFloor: () => 1, neighborEnabled: false });
  assert.equal(one.items[0].factors.time, 1, '曲线真被调用了，只是值正好是 1');
  assert.equal(one.counts.withTime, 1, '分解读数仍如实记「算过时间」');
  assert.equal(one.state, 'neutral', '×1 ⇒ 空转，不许报 composed');
  assert.equal(one.counts.changed, 0);
  const oneN = FS.compose([{ id: 'p', score: 1, floor: 41 }], { nowFloor: 40, neighborEnabled: true, neighborBonus: 1 });
  assert.equal(oneN.counts.neighborHits, 1, '邻楼命中了');
  assert.equal(oneN.state, 'neutral', '但加成是 ×1 ⇒ 仍是空转');
});

test('10. 邻楼只加权，绝不合并 / 改 uid / 删条目', () => {
  const items = [
    { id: 'near', score: 1, floor: 99, turnUid: 't1' },
    { id: 'far', score: 1, floor: 10, turnUid: 't2' }
  ];
  const r = FS.compose(items, { nowFloor: 100, neighborEnabled: true, neighborBonus: 1.5, timeFloor: 1 });
  assert.equal(r.items.length, 2, '邻楼加成不许减少条目');
  assert.deepEqual(r.items.map((x) => x.id).sort(), ['far', 'near']);
  const near = r.items.find((x) => x.id === 'near');
  assert.equal(near.factors.neighbor, 1.5);
  assert.equal(near.turnUid, 't1', '不许改 uid');
  assert.equal(r.readings.neighborHits, 1);
  /* 关掉后必须回到 1.0 且 na.neighbor */
  const off = FS.compose(items, { nowFloor: 100, neighborEnabled: false });
  assert.equal(off.items[0].factors.neighbor, 1);
  assert.equal(off.items[0].na.neighbor, true);
});

test('11. neutral 与 composed 不同形', () => {
  const flat = FS.compose([{ id: 'a', score: 1, floor: 10 }], { nowFloor: 10, neighborEnabled: false });
  assert.equal(flat.state, 'neutral');
  assert.equal(flat.readings.active, false);
  const real = FS.compose([{ id: 'a', score: 1, floor: 10, importance: 5 }], { nowFloor: 10, neighborEnabled: false });
  assert.equal(real.state, 'composed');
  assert.notEqual(flat.readings.active, real.readings.active);
  /* 两种状态的人话也不同句 */
  assert.notEqual(FS.summary(flat), FS.summary(real));
});

test('12. 纯函数：不改入参；同分保持入参相对次序', () => {
  const items = [
    { id: 'a', score: 0.5, floor: 10 },
    { id: 'b', score: 0.5, floor: 10 }
  ];
  const snap = JSON.stringify(items);
  const r = FS.compose(items, { nowFloor: 10, decayFloor: () => 1, neighborEnabled: false });
  assert.equal(JSON.stringify(items), snap, '入参一个字节都不许动');
  assert.deepEqual(r.items.map((x) => x.id), ['a', 'b'], '同分必须稳定');
  assert.equal(FS.compose(null, {}).state, 'malformed', '非数组如实报 malformed，不抛');
});

/* ══════════ 三、冻结档 ══════════ */

const mk = (from, to) => {
  const out = [];
  for (let f = from; f < to; f += 1) out.push({ floor: f, turnUid: 'u' + f, text: 'm' + f });
  return out;
};

test('13. 块 id 与入参顺序无关', () => {
  const a = FZ.plan(mk(0, 24), { untilFloor: 24, blockSize: 12 });
  const b = FZ.plan(mk(0, 24).reverse(), { untilFloor: 24, blockSize: 12 });
  assert.equal(a.state, 'frozen');
  assert.equal(a.counts.blocks, 2);
  assert.deepEqual(a.blocks.map((x) => x.blockId), b.blocks.map((x) => x.blockId),
    '同集不同入参顺序必须同 id，否则每轮都在重写');
  assert.equal(FZ.join(a.blocks), FZ.join(b.blocks), '块文本也必须逐字节相同');
});

test('14. rewrites 有分辨力：同内容 0 / 改内容 >0', () => {
  const base = FZ.plan(mk(0, 24), { untilFloor: 24, blockSize: 12 });
  const same = FZ.plan(mk(0, 24), { untilFloor: 24, blockSize: 12, prevBlocks: base.blocks });
  assert.equal(same.counts.rewrites, 0);
  assert.equal(same.counts.added, 0);
  const changed = FZ.plan(
    mk(0, 24).map((x) => ({ ...x, text: x.text + '!' })),
    { untilFloor: 24, blockSize: 12, prevBlocks: base.blocks }
  );
  assert.ok(changed.counts.rewrites > 0, '内容变了必须记 rewrite，否则读数没有信息量');
});

test('15. 不满桶不产块，且不丢内容（恒等式）', () => {
  /* 13 条 / 块 12 ⇒ 一个满桶 + 一个只有 1 条的桶 */
  const r = FZ.plan(mk(0, 13), { untilFloor: 24, blockSize: 12 });
  assert.equal(r.counts.blocks, 1);
  assert.equal(r.counts.rest, 1, '那条不满桶的必须回到 rest（首稿在这里静默丢了它）');
  const inBlocks = r.blocks.reduce((a, b) => a + b.count, 0);
  assert.equal(inBlocks + r.rest.length, 13, 'blocks 收走 + rest === 输入');
  /* 只有半截时是 partial，与「没有这回事」不同形 */
  const only = FZ.plan(mk(0, 5), { untilFloor: 24, blockSize: 12 });
  assert.equal(only.state, 'partial');
  assert.equal(only.counts.blocks, 0);
  assert.equal(only.rest.length, 5);
  assert.notEqual(only.state, FZ.plan(mk(0, 5), { untilFloor: 0, blockSize: 12 }).state);
});

test('16. 窗口推进 / 补旧条目不制造 rewrite（绝对楼层桶号）', () => {
  const before = FZ.plan(mk(0, 24), { untilFloor: 24, blockSize: 12 });
  /* ① 窗口推进：24 → 36，已有桶的 id 必须一个字节都不变 */
  const after = FZ.plan(mk(0, 24), { untilFloor: 36, blockSize: 12 });
  for (const b of before.blocks) {
    const same = after.blocks.find((x) => x.bucket === b.bucket);
    assert.ok(same, '桶 ' + b.bucket + ' 必须还在');
    assert.equal(same.blockId, b.blockId, '桶 ' + b.bucket + ' 的 id 被窗口推进改掉了');
  }
  const pushed = FZ.plan(mk(0, 24), { untilFloor: 36, blockSize: 12, prevBlocks: before.blocks });
  assert.equal(pushed.counts.rewrites, 0, '窗口推进不是内容变化，不许记 rewrite');
  /* ② 新来一个半截桶：不许把旧块一起取消 */
  const withTail = FZ.plan(mk(0, 24).concat(mk(24, 29)), { untilFloor: 36, blockSize: 12 });
  assert.equal(withTail.counts.blocks, 2, '一个半截桶不该让两个旧块一起消失');
  assert.equal(withTail.rest.length, 5);
});

/* ══════════ 四、接线自证 ══════════ */

test('17. 接线自证：manifest 登记 ×3 + 三库口 + 真路径消费', () => {
  const man = JSON.parse(read('manifest.json'));
  for (const f of ['failure-class-cooldown.js', 'recall-final-score.js', 'frozen-archive-blocks.js']) {
    assert.equal(man.extra_js.includes(f), true, f + ' 未登记进 manifest.extra_js');
  }
  const idx = read('index.js');
  assert.equal(idx.includes("window.LonShaFailureClassCooldown, 'failure-class-cooldown.js'"), true);
  assert.equal(idx.includes("window.LonShaRecallFinalScore, 'recall-final-score.js'"), true);
  assert.equal(idx.includes("window.LonShaFrozenArchiveBlocks, 'frozen-archive-blocks.js'"), true);
  /* bindDeps 三处注入（少了库口在真机上恒为 null，模块等于没装） */
  assert.equal(idx.includes('_failureClassCooldownLib: _failureClassCooldownLib,'), true);
  assert.equal(idx.includes('_recallFinalScoreLib: _recallFinalScoreLib,'), true);
  assert.equal(idx.includes('_frozenArchiveBlocksLib: _frozenArchiveBlocksLib,'), true);
  /* 终分的真路径在 engine-recall（每轮召回都跑），不是只挂在面板上 */
  const rec = read('engine-recall.js');
  assert.equal(rec.includes('FSL.compose(finalMerged'), true, '终分必须真跑在召回管线上');
  assert.equal(rec.includes('FLOOR_DECAY_E_FOLD'), true);
  /* 位置纪律：终分在 grain 之后、进度门之前 */
  const iGrain = rec.indexOf('_lastRecallGrainMerge = { active: true');
  const iFinal = rec.indexOf('FSL.compose(finalMerged');
  /* 注意：文件头部有同名库口访问器 `function _recallProgressGateLib()`，
   *   所以必须从终分位置往后找「真调用点」，否则量到的是访问器定义。 */
  const iGate = rec.indexOf('_recallProgressGateLib()', iFinal);
  assert.ok(iGrain >= 0 && iFinal > iGrain, '终分必须在 grain 之后');
  assert.ok(iGate > iFinal, '终分必须在进度门之前（否则门判的是旧序）');
  /* 超时冷却的真路径：organ 侧把 Map 传进 fetchWithTimeoutRetry */
  const organs = read('memory-organs.js');
  assert.equal(organs.includes('failureLedger: this._embedFailures'), true,
    '不传 Map ⇒ 冷却永远不生效（其余 23 处调用方也不该被改）');
  assert.equal(organs.includes("_FC.verdict(_failLedger.get(_failKey)"), true);
  assert.equal(organs.includes('_FC.record(_failLedger.get(_failKey)'), true);
});

test('18. 当版锚', () => {
  const pkg = JSON.parse(read('package.json'));
  const man = JSON.parse(read('manifest.json'));
  assert.equal(pkg.version, man.version, 'package == manifest');
  assert.ok(/^\d+\.\d+\.\d+$/.test(man.version), '版本号形态');
  const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
  assert.ok(vnum(man.version) >= vnum('3.488.0'), '本套件自 3.488.0 起成立；当前 ' + man.version);
  const idx = read('index.js');
  assert.equal(idx.includes("const VERSION = '3.488.0'") || idx.includes("VERSION = '" + man.version + "'"), true);
});