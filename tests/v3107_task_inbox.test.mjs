// tests/v3107_task_inbox.test.mjs
// v3.107 缝合 m61-oss/st-bionic-memory（BME）domain/memory-inbox.js：
// 任务收件箱状态机（幂等准入 + 五重校验迁移 + 批量原子 + 延迟可见 + 诊断摘要）
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(REPO, 'task-inbox.js'), 'utf8');
const idxSrc = fs.readFileSync(path.join(REPO, 'index.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));

function vnum(s) {
  const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}

const sbox = { module: { exports: {} }, window: undefined };
const load = new Function('globalThis', 'module', 'window',
  src + '\nreturn (typeof module !== \'undefined\' && module.exports) ? module.exports : globalThis.LonShaTaskInbox;');
const TI = load(sbox, sbox.module, undefined);

const S = TI.INBOX_STATUS;
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };

const mk = (over) => Object.assign({
  itemId: 'i1', kind: 'summary-fold', dedupeKey: 'k1', createdAt: 1000,
}, over || {});

// ---------- 0. 版本与注册 ----------
test('【0】版本与 manifest 注册', () => {
  const v = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
  assert.ok(vnum(v) >= vnum('3.107.0'), `index.js 版本 ${v} < 3.107.0`);
  assert.ok(vnum(manifest.version) >= vnum('3.107.0'), `manifest 版本 ${manifest.version} < 3.107.0`);
  assert.ok(manifest.extra_js.includes('task-inbox.js'), 'task-inbox.js 已注册 extra_js');
  ok('版本 / manifest 注册');
});

// ---------- 1. 状态机与迁移表 ----------
test('【1】五态与合法迁移表', () => {
  assert.deepStrictEqual(Object.values(S).sort(), ['cancelled', 'claimed', 'completed', 'deferred', 'pending'], '五态');
  assert.ok(TI.canTransition(S.PENDING, S.CLAIMED), 'pending→claimed');
  assert.ok(TI.canTransition(S.PENDING, S.DEFERRED), 'pending→deferred');
  assert.ok(TI.canTransition(S.PENDING, S.CANCELLED), 'pending→cancelled');
  assert.ok(TI.canTransition(S.DEFERRED, S.PENDING), 'deferred→pending（推迟后回到可见）');
  assert.ok(TI.canTransition(S.DEFERRED, S.CLAIMED), 'deferred→claimed');
  assert.ok(TI.canTransition(S.CLAIMED, S.COMPLETED), 'claimed→completed');
  assert.ok(TI.canTransition(S.CLAIMED, S.DEFERRED), 'claimed→deferred（领取后失败可退回推迟）');
  // 越权迁移必须为假（这是本模块存在的理由）
  assert.strictEqual(TI.canTransition(S.PENDING, S.COMPLETED), false, 'pending 不能跳过 claim 直接 completed');
  assert.strictEqual(TI.canTransition(S.CANCELLED, S.CLAIMED), false, '已放弃不能复活');
  assert.strictEqual(TI.canTransition(S.COMPLETED, S.PENDING), false, '已完成不能回退');
  assert.strictEqual(TI.canTransition('bogus', S.PENDING), false, '非法源状态');
  assert.strictEqual(TI.canTransition(S.PENDING, 'bogus'), false, '非法目标状态');
  assert.strictEqual(TI.isStatus(''), false, 'isStatus 空串为假');
  ok('迁移表 / 越权拒绝');
});

// ---------- 2. 条目归一与校验 ----------
test('【2】createInboxItem 校验与归一', () => {
  assert.throws(() => TI.createInboxItem({ kind: 'a', dedupeKey: 'k' }), /requires itemId/, '缺 itemId 抛错');
  assert.throws(() => TI.createInboxItem({ itemId: 'i', dedupeKey: 'k' }), /requires kind/, '缺 kind 抛错');
  assert.throws(() => TI.createInboxItem({ itemId: 'i', kind: 'a' }), /requires dedupeKey/, '缺 dedupeKey 抛错（防静默无去重）');
  assert.throws(() => TI.createInboxItem({ itemId: 'i', kind: 'a', dedupeKey: 'k', status: 'nope' }), /invalid inbox status/, '非法状态抛错');
  const it = TI.createInboxItem({ itemId: ' i1 ', kind: ' a ', dedupeKey: ' k ', createdAt: 500, availableAt: 900 });
  assert.strictEqual(it.itemId, 'i1', 'itemId 去空白');
  assert.strictEqual(it.status, S.PENDING, '默认 pending');
  assert.strictEqual(it.revision, 0, '初始 revision 0');
  assert.strictEqual(it.attempt, 0, '初始 attempt 0');
  assert.strictEqual(it.availableAt, 900, 'availableAt 保留');
  assert.deepStrictEqual(it.payload, {}, 'payload 默认空对象');
  const neg = TI.createInboxItem(mk({ createdAt: -5, sequence: -3 }));
  assert.strictEqual(neg.sequence, 0, '非法 sequence 回落 0');
  assert.ok(Number.isFinite(neg.createdAt), 'createdAt 有值');
  ok('入参校验 / 归一兜底');
});

// ---------- 3. 幂等准入 ----------
test('【3】admitItem 按 dedupeKey 幂等', () => {
  let items = [];
  const a1 = TI.admitItem(items, { item: mk(), now: 1000 });
  items = a1.items;
  assert.strictEqual(a1.admitted, true);
  assert.strictEqual(a1.replayed, false);
  assert.strictEqual(items.length, 1);
  const a2 = TI.admitItem(items, { item: mk({ itemId: 'i2' }), now: 2000 });
  items = a2.items;
  assert.strictEqual(a2.admitted, false, '同 dedupeKey 不再新增');
  assert.strictEqual(a2.replayed, true);
  assert.strictEqual(items.length, 1, '条目数不变');
  assert.strictEqual(a2.item.itemId, 'i1', '复用已存在条目');
  // 显式 dedupeKey 覆盖 item 内嵌
  const a3 = TI.admitItem(items, { item: mk({ itemId: 'i3', dedupeKey: 'zzz' }), dedupeKey: 'k1', now: 3000 });
  assert.strictEqual(a3.replayed, true, '显式 dedupeKey 优先且命中既有');
  assert.throws(() => TI.admitItem(items, { item: { itemId: 'i9', kind: 'a' } }), /requires dedupeKey/, '无 dedupeKey 拒绝准入');
  // 原数组不被修改（纯函数）
  const base = [TI.createInboxItem(mk())];
  const snapshotLen = base.length;
  TI.admitItem(base, { item: mk({ itemId: 'new', dedupeKey: 'k2' }), now: 1 });
  assert.strictEqual(base.length, snapshotLen, '入参数组未被就地修改');
  ok('幂等准入 / 纯函数');
});

// ---------- 4. 迁移五重校验 ----------
test('【4】planTransition 五重前置校验', () => {
  const items = [TI.createInboxItem(mk({ availableAt: 5000 }))];
  assert.throws(() => TI.planTransition(items, { itemId: 'nope', status: S.CLAIMED, claimId: 'c' }), /not found/, '条目不存在');
  assert.throws(() => TI.planTransition(items, { itemId: 'i1', status: S.CLAIMED, claimId: 'c', expectedStatus: S.DEFERRED, now: 9000 }), /status changed/, '期望状态不符');
  assert.throws(() => TI.planTransition(items, { itemId: 'i1', status: S.CLAIMED, claimId: 'c', expectedRevision: 7, now: 9000 }), /revision changed/, '期望修订不符');
  assert.throws(() => TI.planTransition(items, { itemId: 'i1', status: S.COMPLETED, now: 9000 }), /invalid inbox transition/, '越权迁移');
  assert.throws(() => TI.planTransition(items, { itemId: 'i1', status: S.CLAIMED, claimId: 'c', now: 1000 }), /not available/, '未到可见时间不得领取');
  assert.throws(() => TI.planTransition(items, { itemId: 'i1', status: S.CLAIMED, now: 9000 }), /requires claimId/, '领取必须有 claimId');
  assert.throws(() => TI.planTransition(items, { status: S.CLAIMED }), /requires itemId/, '缺 itemId');
  // 合法领取
  const p = TI.planTransition(items, { itemId: 'i1', status: S.CLAIMED, claimId: 'c1', claimOwner: 'worker', now: 9000 });
  assert.strictEqual(p.current.status, S.PENDING, 'current 为迁移前');
  assert.strictEqual(p.next.status, S.CLAIMED, 'next 为新状态');
  assert.strictEqual(p.next.revision, 1, 'revision 递增');
  assert.strictEqual(p.next.sequence, 1, 'sequence 递增');
  assert.strictEqual(p.next.attempt, 1, '领取累加 attempt');
  assert.strictEqual(p.next.claimId, 'c1', 'claimId 落定');
  assert.strictEqual(p.next.createdAt, 1000, 'createdAt 保持');
  ok('存在性 / 状态 / 修订 / 迁移 / 可见时间 / claimId');
});

// ---------- 5. 推迟与可见性 ----------
test('【5】deferred 设置可见时间，未到时间不可领取', () => {
  let items = [TI.createInboxItem(mk({ createdAt: 0 }))];
  items = TI.applyTransition(items, { itemId: 'i1', status: S.DEFERRED, availableAt: 10000, note: '等摘要窗口', now: 1000 }).items;
  assert.strictEqual(items[0].status, S.DEFERRED);
  assert.strictEqual(items[0].availableAt, 10000, '推迟设可见时间');
  assert.strictEqual(items[0].note, '等摘要窗口', 'note 落定');
  assert.strictEqual(TI.listRunnable(items, { now: 5000 }).length, 0, '未到时间不可执行（pending 视图）');
    assert.strictEqual(TI.listClaimable(items, { now: 5000 }).length, 0, '未到时间不可领取');
    assert.strictEqual(TI.listClaimable(items, { now: 10001 }).length, 1, '到点后可领取');
    assert.strictEqual(TI.listRunnable(items, { now: 10001 }).length, 0, 'deferred 不自动成为 pending（须显式领取）');
  assert.throws(() => TI.planTransition(items, { itemId: 'i1', status: S.CLAIMED, claimId: 'c', now: 5000 }), /not available/, 'deferred 期领取被拒');
  // deferred→pending（手动恢复可见）
  const back = TI.applyTransition(items, { itemId: 'i1', status: S.PENDING, now: 12000 }).items;
  assert.strictEqual(back[0].status, S.PENDING, 'deferred→pending 合法');
  // deferred 迁移到 claimed 后 attempt 也累加
  const claimed = TI.applyTransition(items, { itemId: 'i1', status: S.CLAIMED, claimId: 'c9', now: 10001 }).items;
  assert.strictEqual(claimed[0].attempt, 1, 'deferred→claimed 累加 attempt');
  ok('延迟可见 / 恢复 / 领取路径');
});

// ---------- 6. 终态与 payload 合并 ----------
test('【6】终态不可离开 + payloadPatch 合并', () => {
  let items = [TI.createInboxItem(mk())];
  items = TI.applyTransition(items, { itemId: 'i1', status: S.CLAIMED, claimId: 'c', payloadPatch: { batchLen: 20 }, now: 2000 }).items;
  items = TI.applyTransition(items, { itemId: 'i1', status: S.COMPLETED, now: 3000 }).items;
  assert.strictEqual(items[0].status, S.COMPLETED);
  assert.strictEqual(items[0].payload.batchLen, 20, 'payloadPatch 生效');
  assert.throws(() => TI.planTransition(items, { itemId: 'i1', status: S.PENDING, now: 4000 }), /invalid inbox transition/, 'completed 为终态');
  const cancelled = TI.applyTransition([TI.createInboxItem(mk({ itemId: 'x', dedupeKey: 'kx' }))], { itemId: 'x', status: S.CANCELLED, now: 4000 }).items;
  assert.throws(() => TI.planTransition(cancelled, { itemId: 'x', status: S.CLAIMED, claimId: 'c', now: 5000 }), /invalid inbox transition/, 'cancelled 为终态');
  ok('终态封闭 / payload 合并');
});

// ---------- 7. 批量原子 ----------
test('【7】planBatchTransition 批量原子性', () => {
  const base = [
    TI.createInboxItem(mk({ itemId: 'a', dedupeKey: 'ka' })),
    TI.createInboxItem(mk({ itemId: 'b', dedupeKey: 'kb' })),
    TI.createInboxItem(mk({ itemId: 'c', dedupeKey: 'kc', status: S.PENDING })),
  ];
  assert.throws(() => TI.planBatchTransition(base, { itemIds: [], status: S.CLAIMED }), /requires itemIds/, '空列表拒绝');
  // 有一个非法（c 已被取消 → 不能 claim）→ 整批抛错
  const withCancelled = base.map(it => it.itemId === 'c' ? Object.assign({}, it, { status: S.CANCELLED }) : it);
  assert.throws(() => TI.planBatchTransition(withCancelled, { itemIds: ['a', 'b', 'c'], status: S.CLAIMED, claimId: 'c1' }), /invalid inbox transition/, '任一非法整批失败');
  // 原数组未被修改（无半套新状态）
  assert.strictEqual(withCancelled.filter(it => it.status === S.CLAIMED).length, 0, '失败的批量不产生半套状态');
  // 全部合法 → 一次领取
  const all = TI.planBatchTransition(base, { itemIds: ['a', 'b', 'a'], status: S.CLAIMED, claimId: 'c1', claimOwner: 'w', now: 5000 });
  assert.strictEqual(all.planned.length, 2, '重复 id 去重');
  assert.strictEqual(all.items.filter(it => it.status === S.CLAIMED).length, 2, '两条均被领取');
  assert.strictEqual(all.items.find(it => it.itemId === 'c').status, S.PENDING, '未列入者不受影响');
  assert.ok(all.planned.every(it => it.attempt === 1), '每条各自累加 attempt');
  ok('批量原子 / 去重 / 未列入不受影响');
});

// ---------- 8. latestByItemId ----------
test('【8】latestByItemId 取最新修订', () => {
  const items = [
    TI.createInboxItem(mk({ revision: 0 })),
    TI.createInboxItem(mk({ revision: 2, status: S.CLAIMED, claimId: 'c' })),
    TI.createInboxItem(mk({ revision: 1, status: S.DEFERRED })),
    TI.createInboxItem(mk({ itemId: 'other', dedupeKey: 'ko', revision: 0 })),
  ];
  const m = TI.latestByItemId(items);
  assert.strictEqual(m.size, 2, '两个 itemId');
  assert.strictEqual(m.get('i1').revision, 2, '取最高 revision');
  assert.strictEqual(m.get('i1').status, S.CLAIMED, '对应状态正确');
  ok('历史多版本取最新');
});

// ---------- 9. listRunnable / summarizeInbox ----------
test('【9】listRunnable 与 summarizeInbox', () => {
  const items = [
    TI.createInboxItem(mk({ itemId: 'p1', dedupeKey: 'a', createdAt: 100 })),
    TI.createInboxItem(mk({ itemId: 'p2', dedupeKey: 'b', createdAt: 3000 })),
    TI.createInboxItem(mk({ itemId: 'd1', dedupeKey: 'c', status: S.DEFERRED, availableAt: 99999, createdAt: 100 })),
    TI.createInboxItem(mk({ itemId: 'c1', dedupeKey: 'd', status: S.CLAIMED, claimId: 'x', createdAt: 100 })),
    TI.createInboxItem(mk({ itemId: 'x1', dedupeKey: 'e', status: S.CANCELLED, createdAt: 100 })),
  ];
  const runnable = TI.listRunnable(items, { now: 5000 });
  assert.deepStrictEqual(runnable.map(i => i.itemId).sort(), ['p1', 'p2'], '只暴露 pending 且到点');
  assert.strictEqual(TI.listRunnable(items, { now: 5000, kind: 'summary-fold' }).length, 2, 'kind 过滤命中');
  assert.strictEqual(TI.listRunnable(items, { now: 5000, kind: 'other' }).length, 0, 'kind 过滤未命中');
  const rep = TI.summarizeInbox(items, { now: 5000 });
  assert.strictEqual(rep.total, 5, '总数');
  assert.strictEqual(rep.counts.pending, 2);
  assert.strictEqual(rep.counts.deferred, 1);
  assert.strictEqual(rep.counts.claimed, 1);
  assert.strictEqual(rep.counts.cancelled, 1);
  assert.strictEqual(rep.counts.completed, 0);
  assert.strictEqual(rep.runnable, 2, '可执行数');
  assert.strictEqual(rep.oldestItemId, 'p1', '最旧待办为 createdAt 最小者');
  assert.strictEqual(rep.waitingMs, 4900, '等待时长 = now - 最旧 createdAt');
  const empty = TI.summarizeInbox([null, undefined], { now: 0 });
  assert.strictEqual(empty.total, 0, '空/脏数组不崩');
  assert.strictEqual(empty.waitingMs, 0);
  ok('可执行清单 / 计数 / 积压时长');
});

// ---------- 10. index.js 接线（正向） ----------
test('【10】index.js 接线：收件箱视图已挂上主链路', () => {
  assert.ok(idxSrc.includes('getTaskInbox()'), 'getTaskInbox 方法存在');
  assert.ok(idxSrc.includes('getTaskInboxReport()'), 'getTaskInboxReport 方法存在');
  assert.ok(idxSrc.includes('window.LonShaTaskInbox'), 'window 通道');
  assert.ok(idxSrc.includes("require('./task-inbox.js')"), 'require 降级通道');
  assert.ok(idxSrc.includes('inboxLib.summarizeInbox'), '实际调用 summarizeInbox（非幽灵配置）');
  assert.ok(idxSrc.includes('任务收件箱'), '审计报告已展示收件箱段');
  assert.ok(idxSrc.includes('任务收件箱') && idxSrc.includes('exportMemoryReport'), '展示挂在记忆报告内');
  assert.ok(idxSrc.includes('enqueuedAt: Date.now()'), 'enqueueRetry 记录入队时间');
  ok('接线（方法 / 双通道 / 报告展示 / 入队时间）');
});

// ---------- 11. 逆向审计：零行为变更 ----------
test('【11】逆向审计：不改既有消费逻辑与去重语义', () => {
  // 既有消费路径仍在（v3.70 断言不破）
  assert.ok(idxSrc.includes('30000 * Math.pow(2, job.attempts - 1)'), '指数退避未改');
  assert.ok(idxSrc.includes('job.attempts >= 3'), '3 次上限未改');
  assert.ok(idxSrc.includes("const exist = this.retryQueue.find(j => j.kind === kind && j.tier === tier);"), 'kind+tier 去重未改');
  assert.ok(idxSrc.includes('if (this.retryQueue.length > 5) this.retryQueue.shift();'), '容量上限未改');
  // 新增字段不参与既有判断
  const pushLine = /this\.retryQueue\.push\(\{[^}]*\}\)/.exec(idxSrc);
  assert.ok(pushLine && pushLine[0].includes('enqueuedAt'), 'push 行含 enqueuedAt');
  assert.ok(pushLine[0].includes('attempts: 0') && pushLine[0].includes('nextAttemptAt: 0'), '既有字段保持');
  // 收件箱视图是纯读：方法体内不含对 retryQueue 的写入
  const body = /getTaskInbox\(\)[\s\S]{0,1600}?\n {8}\}/.exec(idxSrc)[0];
  assert.ok(!/this\.retryQueue\s*=/.test(body), 'getTaskInbox 不写 retryQueue');
  assert.ok(!/\.push\(|\.shift\(|\.filter\(/.test(body.replace(/return \(this\.summary\?\.retryQueue \|\| \[\]\)\.map/g, '.map')), 'getTaskInbox 不改数组');
  // 收件箱投影语义：等待退避窗口 → deferred；否则 pending
  const items = [
    { itemId: 'a', kind: 'volume', dedupeKey: 'volume/1', status: 'pending', availableAt: 0, revision: 0, sequence: 0, attempt: 0, createdAt: 1 },
    { itemId: 'b', kind: 'tier', dedupeKey: 'tier/2', status: 'deferred', availableAt: 100, revision: 1, sequence: 1, attempt: 1, createdAt: 1 },
  ];
  assert.strictEqual(TI.listRunnable(items, { now: 50 }).length, 1, '退避窗口内的任务不可执行');
  assert.strictEqual(TI.listClaimable(items, { now: 50 }).length, 1, '退避窗口内不可领取');
  assert.strictEqual(TI.listClaimable(items, { now: 150 }).length, 2, '退避到期后可领取');
  ok('消费逻辑未改 / 视图纯读 / 投影语义');
});

console.log(`[v3107] ${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;