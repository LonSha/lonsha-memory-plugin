/**
 * tests/v3183_branch_guard.test.mjs — v3.184.0 分支守护
 *
 * 覆盖：
 *   1. 三态队列互不混同（request / apply / swipe）
 *   2. 消费语义：consume 取走即清；peek 不取走
 *   3. TTL 过期：时钟推进后不再认领
 *   4. 签名辨别力：翻页 / 换代 / 改正文 / 改时间戳 各自改变签名
 *   5. 落层守卫五态 + **判不了就放行**（本模块最关键的纪律）
 *   6. 手动编辑静默窗口
 *   7. 翻页去重（DOM 点击 + 事件双到达只处理一次）
 *   8. 会话隔离 + clearSession
 *   9. 上限收敛
 *  10. 畸形输入不抛
 *  11. 反向审计（负控制）：破坏真判据后行为必须可观测地改变
 *  12. 接线自证：index.js 在 MESSAGE_SWIPED 与摘要落笔处真的调了本模块
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
const G = require(path.join(root, 'branch-guard.js'));
let pass = 0;
const ok = (name, cond, extra) => {
  assert.ok(cond, extra ? name + ' — ' + extra : name);
  pass += 1;
};
const eq = (name, a, b) => {
  assert.equal(a, b, name + ` — 期望 ${JSON.stringify(b)}，实得 ${JSON.stringify(a)}`);
  pass += 1;
};
/** 造楼（与 index.js 消息形状一致）。 */
const msg = (text, { index = 0, swipe = 0, send_date = 't1', gen = '' } = {}) => ({
  index, swipe_id: swipe, mes: text, send_date, is_user: false,
  extra: gen ? { gen_id: gen } : {},
});
/** 可控时钟。 */
const clock = () => { let t = 1000000; return { now: () => t, adv: (ms) => { t += ms; } }; };

// ========== 1. 三态队列互不混同 ==========
{
  const g = G.createGuard();
  ok('1a 标 request', g.markRequestRollback(5, 's1') === true);
  ok('1b request 在列', g.isRequestRollback(5, 's1') === true);
  ok('1c request 不影响 apply', g.consumeApplyRollback(5, 's1') === false);
  ok('1d request 不影响 swipe', g.isSwipeMode(5, 's1') === false);
  ok('1e 标 apply', g.markApplyRollback(6, 's1') === true);
  ok('1f apply 在列', g.consumeApplyRollback(6, 's1') === true);
  ok('1g apply 取走后没了', g.consumeApplyRollback(6, 's1') === false);
  ok('1h 标 swipe', g.markSwipeMode(7, 's1') === true);
  ok('1i swipe 在列', g.isSwipeMode(7, 's1') === true);
  ok('1j swipe peek 不取走', g.isSwipeMode(7, 's1') === true);
}

// ========== 2. 消费语义 ==========
{
  const g = G.createGuard();
  g.markRequestRollback(3, 's1');
  g.markRequestRollback(9, 's1');
  g.markRequestRollback(5, 's1');
  const got = g.consumeRequestRollbacks('s1');
  eq('2a 全部取走且升序', got.join(','), '3,5,9');
  eq('2b 再取为空', g.consumeRequestRollbacks('s1').length, 0);
}

// ========== 3. TTL 过期 ==========
{
  const c = clock();
  const g = G.createGuard({ now: c.now });
  g.markRequestRollback(4, 's1', 5000);
  ok('3a 未过期在列', g.isRequestRollback(4, 's1') === true);
  c.adv(6000);
  ok('3b 过期后不在列', g.isRequestRollback(4, 's1') === false);
  eq('3c 过期的取不出来', g.consumeRequestRollbacks('s1').length, 0);
}

// ========== 4. 签名辨别力 ==========
{
  const base = msg('甲', { index: 0, swipe: 0, send_date: 't1' });
  const sig0 = G.signatureOf(base);
  ok('4a 同楼同页同签名', G.signatureOf(msg('甲', { index: 0, swipe: 0, send_date: 't1' })) === sig0);
  ok('4b 翻页变签名', G.signatureOf(msg('甲', { index: 0, swipe: 1, send_date: 't1' })) !== sig0);
  ok('4c 改正文变签名', G.signatureOf(msg('乙', { index: 0, swipe: 0, send_date: 't1' })) !== sig0);
  ok('4d 换代次变签名', G.signatureOf(msg('甲', { index: 0, swipe: 0, send_date: 't1', gen: 'g2' })) !== sig0);
  ok('4e 改时间戳变签名', G.signatureOf(msg('甲', { index: 0, swipe: 0, send_date: 't2' })) !== sig0);
  ok('4f 楼层号不进签名（同页不同楼同签名）',
    G.signatureOf(msg('甲', { index: 0, swipe: 0, send_date: 't1' })) === G.signatureOf(msg('甲', { index: 7, swipe: 0, send_date: 't1' })));
  // 正文取自当前显示页
  const sw = { index: 0, swipe_id: 1, swipes: ['第一版', '第二版'], mes: '第二版', send_date: 't1', is_user: false, extra: {} };
  ok('4g 取当前显示页正文', G.textOf(sw) === '第二版', G.textOf(sw));
  ok('4h 用户楼不进签名正则可辨', G.isAssistantMessage({ is_user: true }) === false);
}

// ========== 5. 落层守卫五态 ==========
{
  const g = G.createGuard();
  const m = msg('甲', { index: 3, send_date: 't1' });
  // 判不了 → 放行
  const r1 = g.guardApply(m, '', 's1');
  ok('5a 无签名 → 放行', r1.accept === true);
  ok('5b 无签名标 judged:false', r1.judged === false);
  eq('5c 原因 no-signature', r1.reason, 'no-signature');
  // 签名一致 → 放行
  const sig = G.signatureOf(m);
  const r2 = g.guardApply(m, sig, 's1');
  ok('5d 签名一致 → 放行', r2.accept === true);
  ok('5e 签名一致 judged:true', r2.judged === true);
  // 签名不一致 → 拦
  const r3 = g.guardApply(m, sig + 'X', 's1');
  ok('5f 签名不一致 → 拦', r3.accept === false);
  eq('5g 原因 signature-mismatch', r3.reason, 'signature-mismatch');
  ok('5h 拦也标 judged:true', r3.judged === true);
  // apply 标记 → 拦
  g.markApplyRollback(8, 's1');
  const r4 = g.guardApply(msg('x', { index: 8 }), '', 's1');
  ok('5i apply 标记 → 拦', r4.accept === false);
  eq('5j 原因 apply-rollback', r4.reason, 'apply-rollback');
  // 畸形楼 → 放行
  const r5 = g.guardApply(null, 'whatever', 's1');
  ok('5k 畸形楼 → 放行', r5.accept === true);
  ok('5l 畸形楼 judged:false', r5.judged === false);
}

// ========== 6. 手动编辑静默窗口 ==========
{
  const c = clock();
  const g = G.createGuard({ now: c.now, manualWindowMs: 3000 });
  ok('6a 初始不在窗口', g.inManualEditWindow() === false);
  g.markManualEdit();
  ok('6b 标记后在窗口', g.inManualEditWindow() === true);
  const r = g.guardApply(msg('甲', { index: 1 }), G.signatureOf(msg('甲', { index: 1 })), 's1');
  ok('6c 窗口内拦', r.accept === false);
  eq('6d 原因 manual-edit-window', r.reason, 'manual-edit-window');
  c.adv(4000);
  ok('6e 出窗口', g.inManualEditWindow() === false);
  ok('6f 出窗口后签名一致放行', g.guardApply(msg('甲', { index: 1 }), G.signatureOf(msg('甲', { index: 1 })), 's1').accept === true);
  // 时间戳只前进
  g.markManualEdit(c.now());
  const t1 = g.manualEditAt();
  g.markManualEdit(t1 - 5000);
  eq('6g 时间戳不回退', g.manualEditAt(), t1);
}

// ========== 7. 翻页去重 ==========
{
  const c = clock();
  const g = G.createGuard({ now: c.now });
  const a = g.prepareSwipe(2, 's1');
  ok('7a 首次 prepared', a.prepared === true);
  const b = g.prepareSwipe(2, 's1');
  ok('7b 立刻重来被判重复', b.skipped === true);
  eq('7c 原因 duplicate', b.reason, 'duplicate');
  c.adv(200);
  const d = g.prepareSwipe(2, 's1');
  ok('7d 过窗口后可再处理', d.prepared === true);
  // 重生成不去重
  const e1 = g.prepareRegenerate(3, 's1');
  const e2 = g.prepareRegenerate(3, 's1');
  ok('7e 重生成两次都执行', e1.prepared === true && e2.prepared === true);
}

// ========== 8. 会话隔离 ==========
{
  const g = G.createGuard();
  g.markRequestRollback(1, 'A');
  g.markRequestRollback(2, 'B');
  eq('8a A 会话只看到自己的', g.consumeRequestRollbacks('A').join(','), '1');
  eq('8b B 会话不受影响', g.consumeRequestRollbacks('B').join(','), '2');
  g.markRequestRollback(3, 'A');
  g.setProcessedSignature(4, 'sig4', 'A');
  g.clearSession('A');
  eq('8c clearSession 清空请求', g.consumeRequestRollbacks('A').length, 0);
  eq('8d clearSession 清空签名', g.getProcessedSignature(4, 'A'), '');
  ok('8e 无 sessionId 落 default', g.markRequestRollback(5) === true);
}

// ========== 9. 上限收敛 ==========
{
  const g = G.createGuard();
  for (let i = 0; i < G.MAX_ENTRIES + 50; i++) g.markRequestRollback(i, 's1');
  ok('9a 队列不超上限', g.stats().request <= G.MAX_ENTRIES, String(g.stats().request));
}

// ========== 10. 畸形输入不抛 ==========
{
  const g = G.createGuard();
  ok('10a mark 负数被拒', g.markRequestRollback(-1, 's1') === false);
  ok('10b mark 非数被拒', g.markRequestRollback('abc', 's1') === false);
  ok('10c peek 畸形不抛', g.isRequestRollback(null, 's1') === false);
  ok('10d consume 畸形不抛', g.consumeApplyRollback(undefined, 's1') === false);
  ok('10e signatureOf(null) 给空串', G.signatureOf(null) === '');
  ok('10f floorOf 畸形给 -1', G.floorOf('x') === -1);
  ok('10g resolveRequestTarget 空 chat 不抛', typeof g.resolveRequestTarget(null, 's1').target === 'number');
  ok('10h stats 不抛', typeof g.stats().request === 'number');
  ok('10i line 是字符串', typeof g.line() === 'string');
  ok('10j setProcessedSignature 畸形被拒', g.setProcessedSignature(-1, 'x', 's1') === false);
  ok('10k clearSession 畸形不抛', g.clearSession() === true);
}

// ========== 11. resolveRequestTarget ==========
{
  const g = G.createGuard();
  const chat = [msg('甲', { index: 0 }), { index: 1, is_user: true, mes: '用户' }];
  const r1 = g.resolveRequestTarget(chat, 's1');
  eq('11a 无待回滚且末尾是用户楼 → 目标为新增楼', r1.target, 2);
  eq('11b basis=tail', r1.basis, 'tail');
  g.markRequestRollback(7, 's1');
  g.markRequestRollback(2, 's1');
  const r2 = g.resolveRequestTarget(chat, 's1');
  eq('11c 有待回滚取最小', r2.target, 2);
  eq('11d basis=request', r2.basis, 'request');
  const assistantTail = [msg('甲', { index: 0 })];
  eq('11e 末尾是 AI 楼 → 目标为该楼', g.resolveRequestTarget(assistantTail, 's1').target, 0);
}
// ========== 12. 反向审计（负控制） ==========
{
  const src = read('branch-guard.js');
  const tmp = path.join(root, 'tests', '.tmp-negctl-v3183bg');
  fs.mkdirSync(tmp, { recursive: true });
  // 破坏副本自身也会挂全局：整段结束后必须把宿主全局还原成真模块，
  // 否则「破坏副本」会顶掉 14d~14f 要验的那个真句柄（这是真的会静默污染的行为）。
  const goodGlobal = globalThis.LonShaBranchGuard;


  // 负控制 1：破坏「签名不一致就拦」→ 翻页必须不再被检出
  {
    const anchor = "if (current !== expect) {";
    ok('负控1 锚点恰中 1 次', src.split(anchor).length === 2);
    const broken = src.replace(anchor, "if (false) {");
    const f = path.join(tmp, 'sig.cjs');
    fs.writeFileSync(f, broken, 'utf8');
    const mod = require(f);
    const g2 = mod.createGuard();
    const m = msg('甲', { index: 0 });
    const r = g2.guardApply(m, 'totally-different', 's1');
    ok('负控1：fp 判据破坏后签名不符检不出（放行）', r.accept === true, JSON.stringify(r));
  }

  // 负控制 2：破坏 apply 队列消费 → 翻页态必须不再拦
  {
    const anchor = "if (floor >= 0 && this.consumeApplyRollback(floor, sessionId)) {";
    ok('负控2 锚点恰中 1 次', src.split(anchor).length === 2);
    const broken = src.replace(anchor, "if (false) {");
    const f = path.join(tmp, 'apply.cjs');
    fs.writeFileSync(f, broken, 'utf8');
    const mod = require(f);
    const g2 = mod.createGuard();
    g2.markApplyRollback(4, 's1');
    const r = g2.guardApply(msg('x', { index: 4 }), '', 's1');
    ok('负控2：apply 判据破坏后翻页态检不出（放行）', r.accept === true, JSON.stringify(r));
  }

  // 负控制 3：破坏手动编辑窗口 → 用户编辑时系统会抢写
  {
    const anchor = "if (this.inManualEditWindow()) {";
    ok('负控3 锚点恰中 1 次', src.split(anchor).length === 2);
    const broken = src.replace(anchor, "if (false) {");
    const f = path.join(tmp, 'manual.cjs');
    fs.writeFileSync(f, broken, 'utf8');
    const mod = require(f);
    const g2 = mod.createGuard();
    g2.markManualEdit();
    const m = msg('甲', { index: 1 });
    const r = g2.guardApply(m, mod.signatureOf(m), 's1');
    ok('负控3：手动窗口破坏后编辑期不再拦（放行）', r.accept === true, JSON.stringify(r));
  }

  // 负控制 4：破坏「判不了就放行」→ 首次提取会被全部拦掉（记忆功能整体失效）
  {
    const anchor = "return { accept: true, judged: false, reason: 'no-signature', current };";
    ok('负控4 锚点恰中 1 次', src.split(anchor).length === 2);
    const broken = src.replace(anchor, "return { accept: false, judged: true, reason: 'no-signature', current };");
    const f = path.join(tmp, 'nodflt.cjs');
    fs.writeFileSync(f, broken, 'utf8');
    const mod = require(f);
    const g2 = mod.createGuard();
    const r = g2.guardApply(msg('甲', { index: 0 }), '', 's1');
    ok('负控4：破坏「判不了放行」后首次提取被拦（正是要防的失效）', r.accept === false, JSON.stringify(r));
  }

  // 负控制 5：H6 工具两向自证——锚点不存在零命中、重复须被检出、破坏须可观测
  {
    const missing = 'THIS_ANCHOR_DOES_NOT_EXIST';
    eq('负控5a 不存在的锚点零命中', src.split(missing).length - 1, 0);
    const dup = "'apply-rollback'";
    const hits = src.split(dup).length - 1;
    ok('负控5b 重复锚点被检出（>1 次）', hits > 1, `命中 ${hits} 次`);
  }

  // H6 两向自证：破坏副本确实顶掉了宿主全局（否则下面的还原断言是空转）。
  ok('负控12h 破坏副本确实污染了宿主全局（还原断言非空转）',
    globalThis.LonShaBranchGuard !== goodGlobal);
  globalThis.LonShaBranchGuard = goodGlobal;
  ok('负控12i 宿主全局已还原为真模块', globalThis.LonShaBranchGuard === goodGlobal && goodGlobal.BRANCH_GUARD_VERSION === 1);

  fs.rmSync(tmp, { recursive: true, force: true });
}

// ========== 13. 接线自证 ==========
{
  const src = read('index.js');
  ok('13a index.js 引用 LonShaBranchGuard', /LonShaBranchGuard/.test(src));
  ok('13b 通过 _moduleLib 取库', /_moduleLib\(\(\) => window\.LonShaBranchGuard, 'branch-guard\.js'\)/.test(src));
  ok('13c MESSAGE_SWIPED 里调了 prepareSwipe', /prepareSwipe\(/.test(src));
  ok('13d 摘要落笔处调了 guardApply', /guardApply\(/.test(src));
  ok('13e 落笔后记签名 setProcessedSignature', /setProcessedSignature\(/.test(src));
  ok('13f 有诊断读数入口', /_branchGuardLine/.test(src));
  const mf = JSON.parse(read('manifest.json'));
  ok('13g manifest 登记 branch-guard.js', mf.extra_js.includes('branch-guard.js'));
}

// ========== 14. 版权纯度（不复制源实现） ==========
{
  const src = read('branch-guard.js');
  ok('14a 不含源实现的 YuzukiMemory 命名', !src.includes('YuzukiMemory'));
  ok('14b 不含源实现的 yzm_ 设置键', !src.includes('yzm_memory'));
  ok('14c 不含源实现的表格快照（本仓由 ledger-replay 统一回放）', !src.includes('records'));
  // 14d 用行为断言而非字面量：模块走的是 `g.LonShaBranchGuard` 赋值（句柄名随宿主变），
  // 字面量 `global.LonShaBranchGuard` 会假阴性。真判据是「require 之后宿主全局上真拿得到」。
  ok('14d 挂 LonSha 前缀全局', typeof globalThis.LonShaBranchGuard === 'object' && globalThis.LonShaBranchGuard !== null);
  ok('14e 全局带版本常量', globalThis.LonShaBranchGuard.BRANCH_GUARD_VERSION === 1);
  ok('14f 全局与 require 取到同一对象', globalThis.LonShaBranchGuard === G);
  ok('14g CJS 双导出', /module\.exports = api/.test(src));
}
// ========== 15. 诊断行真进 selfCheck ==========
//   入口函数名在场**不等于**用户读得到：本仓主线失效正是「写好了入口、零调用点」。
//   判据取 v3150/v3166/v3167 同款口径：selfCheck 方法体内真有 this._branchGuardLine(，
//   且本行的键真在 rows 子系统列表里。
{
  const isrc = read('index.js');
  const scStart = isrc.indexOf('async selfCheck() {');
  ok('15a selfCheck 方法存在', scStart > 0);
  let _d = 0, scEnd = -1;
  for (let i = isrc.indexOf('{', scStart); i >= 0 && i < isrc.length; i++) {
    if (isrc[i] === '{') _d++;
    else if (isrc[i] === '}') { _d--; if (_d === 0) { scEnd = i; break; } }
  }
  ok('15b selfCheck 方法体闭合', scEnd > scStart);
  const scBody = isrc.slice(scStart, scEnd);
  ok('15c 真调用 _branchGuardLine', scBody.includes('this._branchGuardLine('));
  const rowsIdx = scBody.indexOf('const rows = [');
  ok('15d selfCheck 构建子系统列表 rows', rowsIdx >= 0);
  const lb = scBody.indexOf('[', rowsIdx);
  let _bd = 0, _rb = -1;
  for (let i = lb; i < scBody.length; i++) {
    if (scBody[i] === '[') _bd++;
    else if (scBody[i] === ']') { _bd--; if (_bd === 0) { _rb = i; break; } }
  }
  ok('15e rows 列表字面量闭合', _rb > lb);
  const lit = scBody.slice(lb, _rb + 1);
  const keys = [];
  for (const m of lit.matchAll(/\['([^']+)',/g)) keys.push(m[1]);
  for (const m of scBody.matchAll(/rows\.push\(\[\s*'([^']+)'/g)) keys.push(m[1]);
  ok('15f 诊断行「分支守护」进入 selfCheck 子系统列表', keys.includes('分支守护'),
    '现有键：' + keys.join(','));
}
console.log(`v3183 branch-guard: ${pass} passed`);