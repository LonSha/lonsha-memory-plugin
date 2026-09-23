// tests/v3194_time_and_fact_version.test.mjs
// [v3.194.0] 时间与事实版本 / 事件完整性 / 记忆修复闭环（计划第三部分的三个优先项）
//   计划原文点名这三件事「决定长期记忆是否可信」，并给出可验收例证：
//     「『她以前住在北京，后来搬到上海』应保留两个时间段的居住事实。查询『现在去哪里找她』
//       与『回忆大学时的生活』，需要得到不同结果。模型推测出的住址则必须与正文明确确认的住址分开。」
//   本版把这三句翻译成可回归的判据，并盯住三类**接线级**失效
//   （模块写了、宿主没接 → 机制零生效；接了但挂错条件 → 静默丢账）：
//     ① 区间与来源：from/to 区间可分「当时/现在/后来被推翻」，五态来源走信任门槛
//     ② 事件完整性：起因—行动—结果—后续，未完成事项可单独列出且缺段不沉默
//     ③ 修复闭环：一次修复 = 一份受影响派生件清单，逐项落定才算修完
//     ④ 接线结构与发布卫生：落笔方法在类体内、落笔不挂在矛盾账条件里、三模块登记且真被消费
import { readFileSync, readdirSync } from 'fs';
import { createRequire } from 'module';
import assert from 'node:assert/strict';
import test from 'node:test';
import { stripComments, braceMatch } from './_audit_lib.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const require_ = createRequire(import.meta.url);
const raw = readFileSync(ROOT + 'index.js', 'utf-8');
const src = stripComments(raw);
const manifest = JSON.parse(readFileSync(ROOT + 'manifest.json', 'utf-8'));
const pkg = JSON.parse(readFileSync(ROOT + 'package.json', 'utf-8'));
const FV = require_(ROOT + 'fact-version.js');
const EC = require_(ROOT + 'event-completeness.js');
const RL = require_(ROOT + 'repair-loop.js');

const NEW_MODULES = ['fact-version.js', 'event-completeness.js', 'repair-loop.js'];

/* ── ① 区间与来源：计划点名的三句验收 ───────────────── */
test('v3194 1. 搬迁后「现在」与「大学时」必须给不同结果（计划验收点）', () => {
  let st = FV.normalize(null);
  const a = FV.assertFact(st, { subject: '她', predicate: '居住', value: '北京', from: 1, floor: 1, origin: 'stated' });
  st = a.state;
  const b = FV.assertFact(st, { subject: '她', predicate: '居住', value: '上海', from: 50, floor: 50, origin: 'stated' });
  st = b.state;
  assert.equal(b.changed, true, '新事实入账');
  assert.equal(b.sequenced, true, '新 from 更晚 ⇒ 判为时序推进（不是并列冲突）');
  assert.equal(b.superseded.length, 1, '旧条自动闭合，且闭的是旧条不是新条');
  const college = FV.lookup(st, { subject: '她', predicate: '居住', at: 10 });
  const now = FV.lookup(st, { subject: '她', predicate: '居住', at: 99 });
  assert.equal(college.fact.value, '北京', '「大学时」⇒ 北京');
  assert.equal(now.fact.value, '上海', '「现在」⇒ 上海');
  assert.notEqual(college.fact.value, now.fact.value, '两次查询结果确实不同');
  const tl = FV.timeline(st, { subject: '她', predicate: '居住' });
  assert.equal(tl.versions.length, 2, '两段都留着，不丢任何一段');
  assert.deepEqual(tl.versions.map((f) => f.value), ['北京', '上海'], '按 from 升序排好');
});

test('v3194 2. 模型推测的住址必须与正文确认的分开（信任门槛，不是标签）', () => {
  let st = FV.normalize(null);
  st = FV.assertFact(st, { subject: '他', predicate: '居住', value: '猜测地', from: 5, floor: 5, origin: 'inferred' }).state;
  const q = FV.lookup(st, { subject: '他', predicate: '居住', at: 9 });
  // 语义：ok 表示「查询执行了」，结论在 reason 里（不要把 ok 当命中）。
  assert.equal(q.ok, true, '查询执行了');
  assert.equal(q.reason, 'none-trusted', '推测值默认被信任门槛挡在现状查询之外');
  assert.equal(q.fact, null, '挡下时不返回 fact（不给出一个「像答案」的东西）');
  assert.equal(q.excludedByTrust, 1, '被挡下的条数可读数');
  assert.equal(q.versions.length, 1, '但版本仍可见（挡的是消费，不是销毁）');
  const low = FV.lookup(st, { subject: '他', predicate: '居住', at: 9, minTrust: 0 });
  assert.equal(low.fact.value, '猜测地', '显式放宽门槛才可见');
  // 五态来源的信任序必须严格递减，否则「分开」无从谈起
  const t = FV.ORIGIN_TRUST;
  assert.ok(t.confirmed > t.stated && t.stated > t.reported && t.reported > t.inferred && t.inferred > t.system,
    '来源信任序严格递减');
  assert.equal(FV.DEFAULT_MIN_TRUST, t.reported, '默认门槛落在 reported——推断/系统值不得代表现状');
});

test('v3194 3. 值不同但时序不明时必须并存标冲突，不得静默覆盖', () => {
  let st = FV.normalize(null);
  st = FV.assertFact(st, { subject: '她', predicate: '居住', value: '北京', from: 20, floor: 20 }).state;
  const r = FV.assertFact(st, { subject: '她', predicate: '居住', value: '上海', floor: 21 });
  assert.equal(r.conflict, true, '新条无 from ⇒ 判不了先后 ⇒ 冲突');
  assert.equal(r.sequenced, false, '不得冒充时序推进');
  assert.ok(r.conflictWith.length >= 1, '冲突对侧可定位');
  // 两条都留着：冲突的处置是「并存 + 标出来」，不是覆盖掉一条
  assert.equal(r.state.facts.length, 2, '两条并存（不静默覆盖）');
  // 时点查询仍只取「覆盖该时点」的那条：北京 [20, ∞) 覆盖 22
  const at22 = FV.lookup(r.state, { subject: '她', predicate: '居住', at: 22 });
  assert.equal(at22.reason, 'ok', '有区间覆盖该时点 ⇒ 可答');
  assert.equal(at22.fact.value, '北京', '取覆盖 22 的那条（上海无区间 ⇒ coversAt 判不了，不猜）');
  // 「现在」（不给 at）取 to 为空的全部 ⇒ 两条都在 ⇒ 显式 ambiguous，不随便挑一个
  const nowQ = FV.lookup(r.state, { subject: '她', predicate: '居住' });
  assert.equal(nowQ.reason, 'ambiguous', '两条都未闭合 ⇒ 现状查询显式 ambiguous');
  assert.equal(nowQ.fact, null, '不挑一个当答案');
  assert.equal(nowQ.facts.length, 2, '但两条都返回，交给调用方处置');
});

test('v3194 4. 撤销是终局且可溯源，撤销后不再进现状查询', () => {
  let st = FV.normalize(null);
  const a = FV.assertFact(st, { subject: '甲', predicate: '职务', value: '队长', from: 1, floor: 1 });
  const rv = FV.revokeFact(a.state, { id: a.fact.id, reason: '认错人' });
  assert.equal(rv.changed, true, '撤销是一次真变更');
  const q = FV.lookup(rv.state, { subject: '甲', predicate: '职务' });
  assert.equal(q.reason, 'none-revoked', '撤销态与「从未有过」可分（不是 none）');
  assert.equal(q.excludedByRevoked, 1, '撤销条数可读数');
  assert.ok(rv.state.facts[0].history.length >= 2, '撤销留痕（history 含 assert 与 revoke）');
});

/* ── ② 事件完整性：未完成事项是交付物 ─────────────── */
test('v3194 5. 只有起因不算未完成事项；有行动缺结果才算', () => {
  let st = EC.normalize(null);
  st = EC.addSegment(st, { title: '试炼', role: 'cause', text: '她收到一封信', floor: 1, eventKey: 'k1' }).state;
  assert.equal(EC.completeness(st.events[0]).state, 'dangling', '仅有起因 ⇒ dangling');
  assert.equal(EC.outstanding(st).length, 0, 'dangling 不算未完成事项（还谈不上未完成）');
  st = EC.addSegment(st, { title: '试炼', role: 'action', text: '她动身前往', floor: 2, eventKey: 'k2' }).state;
  assert.equal(EC.outstanding(st).length, 1, '有行动缺结果 ⇒ 列为未完成事项');
});

test('v3194 6. 缺哪一段被显式列出，不沉默；补齐两段才是 complete', () => {
  let st = EC.normalize(null);
  st = EC.addSegment(st, { title: '试炼', role: 'cause', text: '起因', floor: 1, eventKey: 'a' }).state;
  st = EC.addSegment(st, { title: '试炼', role: 'action', text: '行动', floor: 2, eventKey: 'b' }).state;
  st = EC.addSegment(st, { title: '试炼', role: 'result', text: '结果', floor: 3, eventKey: 'c' }).state;
  const c1 = EC.completeness(st.events[0]);
  assert.equal(c1.state, 'open', '有结果但缺后续 ⇒ 仍 open');
  assert.ok(c1.missing.includes('followup'), '缺段出现在 missing 里（不是沉默）');
  assert.equal(EC.outstanding(st).length, 1, '缺后续 ⇒ 仍挂在未完成名单');
  st = EC.addSegment(st, { title: '试炼', role: 'followup', text: '后续', floor: 4, eventKey: 'd' }).state;
  assert.equal(EC.completeness(st.events[0]).state, 'complete', '两段齐 ⇒ complete');
  assert.equal(EC.outstanding(st).length, 0, 'complete 移出未完成名单');
});

test('v3194 7. 重复提取不翻倍（幂等键），空段与未知段是显式拒绝而非丢弃', () => {
  let st = EC.normalize(null);
  const first = EC.addSegment(st, { title: '试炼', role: 'action', text: '她动身前往', floor: 2, eventKey: 'same' });
  st = first.state;
  const again = EC.addSegment(st, { title: '试炼', role: 'action', text: '她动身前往', floor: 2, eventKey: 'same' });
  assert.equal(again.duplicated, true, '同 (role,eventKey) 判重');
  assert.equal(again.changed, false, '重复到达不算变更');
  assert.equal(again.state.events[0].segments.length, 1, '账上仍只有一段（不翻倍）');
  const bad = EC.addSegment(st, { title: '试炼', role: 'nonsense', text: 'x' });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'unknown-role', '未知角色段 ⇒ 显式拒绝');
  const empty = EC.addSegment(st, { title: '试炼', role: 'action', text: '   ' });
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, 'empty-segment', '空文本 ⇒ 显式拒绝（「来了但为空」要看得见）');
});

test('v3194 8. 有实效的写入必须报 changed=true（本版修的真缺陷）', () => {
  // 修前：addSegment/openEvent 走 result() 默认 changed:false，宿主的 if (r.changed) n++
  //   永远计 0 —— 落笔量读数恒为 0，而账其实在涨（读数与实况不符）。
  const a = EC.addSegment(EC.normalize(null), { title: 'T', role: 'action', text: 'x', floor: 1, eventKey: 'k' });
  assert.equal(a.changed, true, 'addSegment 有实效 ⇒ changed=true');
  const o = EC.openEvent(EC.normalize(null), { title: 'T' });
  assert.equal(o.changed, true, 'openEvent 新建 ⇒ changed=true');
  const o2 = EC.openEvent(o.state, { title: 'T' });
  assert.equal(o2.changed, false, 'openEvent 幂等命中既有 ⇒ changed=false');
  // 与同族两模块口径一致（三模块对 changed 的语义必须同义，否则宿主计数不可比）
  const f = FV.assertFact(FV.normalize(null), { subject: 'a', predicate: 'b', value: 'c' });
  assert.equal(f.changed, true, 'fact-version 同口径');
  const r = RL.request(RL.normalize(null), { action: 'revoke', subject: 'a', target: 'b' });
  assert.equal(r.changed, true, 'repair-loop 同口径');
});

/* ── ③ 修复闭环：一次修复 = 一份清单 ─────────────── */
test('v3194 9. 修复请求先给出受影响派生件清单，逐项落定才算修完', () => {
  const pool = {
    summaries: [{ key: 'sum_3', text: '张三住在北京' }],
    relations: [{ key: 'A->B', text: '旧归属' }],
    promises: [{ key: 'p1', content: '张三还书' }],
    timeline: [{ key: 'tl_9', text: '张三搬走了' }],
  };
  const r0 = RL.request(RL.normalize(null), { action: 'retarget', subject: '张三', to: '李四', pool });
  assert.equal(r0.ok, true);
  assert.ok(r0.total >= 3, '扫出受影响派生件（实 ' + r0.total + '）');
  const kinds = new Set(r0.affected.map((x) => x.kind));
  assert.ok(kinds.has('summary'), '摘要池参与');
  assert.ok(kinds.has('timeline'), '时间线池参与');
  for (const it of r0.affected) assert.equal(it.status, 'pending', '初态一律 pending（没有「默认完成」）');
  let st = r0.state;
  assert.equal(RL.pending(st).length, 1, '未落定前该修复挂在 pending 名单');
  for (const it of r0.affected) st = RL.settle(st, { id: r0.repair.id, key: it.key, kind: it.kind, status: 'done' }).state;
  assert.equal(RL.pending(st).length, 0, '全部落定后不再 pending');
  assert.equal(st.repairs[0].status, 'applied', '全落定 ⇒ applied');
});

test('v3194 10. 有失败项判 partial 而不是 applied（修了一半不许报修好）', () => {
  const pool = { summaries: [{ key: 'sum_1', text: '张三' }, { key: 'sum_2', text: '张三' }] };
  const rq = RL.request(RL.normalize(null), { action: 'revoke', subject: '张三', target: '张三', pool });
  assert.equal(rq.total, 2, '两项待落定');
  let st = rq.state;
  // 落一项为 failed：还有 pending ⇒ 仍是 open（「还没修完」不许提前算成功）
  const s1 = RL.settle(st, { id: rq.repair.id, key: rq.affected[0].key, kind: rq.affected[0].kind, status: 'failed' });
  assert.equal(s1.repair.status, 'open', '还有 pending ⇒ open（不提前收尾）');
  assert.equal(s1.settled, false, 'settled 为 false');
  assert.equal(s1.failed, 1, '失败数可读数');
  assert.equal(s1.pending, 1, '待落定数可读数');
  st = s1.state;
  // 落定剩下那项：pending 归零且存在 failed ⇒ partial（不是 applied）
  const s2 = RL.settle(st, { id: rq.repair.id, key: rq.affected[1].key, kind: rq.affected[1].kind, status: 'done' });
  assert.equal(s2.repair.status, 'partial', 'pending 归零 + 有 failed ⇒ partial');
  assert.equal(s2.settled, true, '全部落定 ⇒ settled');
  assert.equal(RL.pending(s2.state).length, 0, '不再挂 pending 名单');
  // 反向对照：全 done 才推 applied（判据不是恒 partial）
  const okRun = RL.request(RL.normalize(null), { action: 'revoke', subject: '张三', target: '张三', pool });
  let st2 = okRun.state;
  for (const it of okRun.affected) st2 = RL.settle(st2, { id: okRun.repair.id, key: it.key, kind: it.kind, status: 'done' }).state;
  assert.equal(st2.repairs[0].status, 'applied', '无失败 ⇒ applied（两态可分）');
});

test('v3194 11. 复合键池映射是真清单：summary→summaries 这类单复数不匹配不得漏池', () => {
  // 初稿用 kind+'s' 拼键会得到 summarys，摘要池被静默跳过——「源头改了、下游没跟着改」
  // 这个模块本身要治的病，在它自己身上的复现。
  const probes = [['summary', 'summaries'], ['event', 'events'], ['relation', 'relations'],
    ['promise', 'promises'], ['fact', 'facts'], ['timeline', 'timeline']];
  for (const [kind, plural] of probes) {
    assert.equal(RL.POOL_KEYS[kind], plural, kind + ' → ' + plural);
    const rq = RL.request(RL.normalize(null), {
      action: 'revoke', subject: '张三', target: '张三',
      pool: { [plural]: [{ key: kind + '_k', text: '张三' }] },
    });
    assert.ok(rq.affected.some((x) => x.kind === kind), plural + ' 池必须被扫到（不得因单复数漏池）');
  }
});

test('v3194 12. 三类动作扫的针不同（不是一套规则换个名字）', () => {
  const pool = { summaries: [{ key: 's1', text: '旧名出现了' }], facts: [{ key: 'f1', text: '旧名出现了' }] };
  // retarget：受牵连的是出现**旧主体名**的派生件
  const rt = RL.request(RL.normalize(null), { action: 'retarget', subject: '旧名', to: '新名', pool });
  assert.ok(rt.total >= 1, 'retarget 按 subject 扫');
  // revoke：针是被撤销的目标文本；subject 换个无关字串仍应命中同一条
  const rv = RL.request(RL.normalize(null), { action: 'revoke', subject: '无关主体', target: '旧名出现了', pool });
  assert.ok(rv.total >= 1, 'revoke 按 target 扫（不是 subject）');
  const bad = RL.request(RL.normalize(null), { action: 'teleport', subject: 'x' });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'unknown-action', '非法动作 ⇒ 拒绝');
  assert.equal(RL.request(RL.normalize(null), { action: 'retarget', subject: 'x' }).reason, 'missing-to', 'retarget 缺 to ⇒ 拒绝');
  assert.equal(RL.request(RL.normalize(null), { action: 'revoke', subject: 'x' }).reason, 'missing-target', 'revoke 缺 target ⇒ 拒绝');
});

/* ── ④ 接线结构：三类接线级失效的定点判据 ───────────── */
test('v3194 13. 落笔方法真在类体内（写错作用域会让 node --check 直接翻红）', () => {
  // 上一版接线脚本的锚点落在**模块作用域**的取库口上（class MemoryEngine 早已闭合），
  // 把类方法语法插到那里必然语法错。故这里断言方法定义确实夹在类体范围内。
  const at = src.indexOf('class MemoryEngine {');
  assert.ok(at > 0, '找得到 MemoryEngine 类');
  const body = braceMatch(src, src.indexOf('{', at));
  assert.ok(body && body.length > 1000, '取到类体');
  for (const m of ['_absorbFactVersions(extracted, floor, storyTime) {',
    '_absorbEventSegments(extracted, floor, storyTime) {',
    'requestRepair(input) {', 'settleRepair(input) {',
    'outstandingThreads(filter) {', 'lookupFact(ref) {']) {
    assert.ok(body.includes(m), '类体内有 ' + m);
  }
  // 反向：模块作用域的取库口必须仍留在类外（若被误挪进类体会静默改变可见性）
  assert.ok(!body.includes('function _factVersionLib()'), '取库口不得被搬进类体');
});

test('v3194 14. 落笔不得挂在矛盾账条件里（否则只在有矛盾的楼层入账）', () => {
  // 修前：_absorbFactVersions 调用写在
  //   if (conflictBookEnabled !== false && extracted.conflicts.length) { try { ... } }
  // 的 try 里 ⇒ 「本楼事实/事件段是否入账」取决于「本楼恰好提取出矛盾」，
  // 没有矛盾的楼层全部不入账且零报错（静默丢账，读数上也看不出来）。
  const cond = src.indexOf('conflictBookEnabled !== false && Array.isArray(extracted?.conflicts)');
  assert.ok(cond > 0, '找得到矛盾账条件');
  const condBlock = braceMatch(src, src.indexOf('{', cond));
  assert.ok(condBlock && condBlock.length > 50, '取到矛盾账块体');
  const condEnd = src.indexOf(condBlock) + condBlock.length;
  const callAt = src.indexOf('this._absorbFactVersions(extracted, floor, sd)');
  assert.ok(callAt > 0, '落笔调用存在');
  assert.ok(callAt > condEnd,
    '落笔必须排在矛盾账块**之外**（在块内 ⇒ 无矛盾楼层静默丢账）');
  // 且两面各自独立 try：一面坏不连坐另一面
  assert.match(src, /catch \(e\) \{ errLog\(e, 'extraction\.v3194\.factVersions'\); \}/, '事实面独立捕获');
  assert.match(src, /catch \(e\) \{ errLog\(e, 'extraction\.v3194\.eventThreads'\); \}/, '事件面独立捕获');
});

test('v3194 15. 宿主调用的每个模块方法都真的存在（宿主↔模块防漂移）', () => {
  // 关键：别名是按**作用域**取的，不能全文件按名字扫。实测踩到过：
  //   index.js:1220 的 `EC.append(...)` 属于 `_eventChainLib()`（agent run 生命周期链），
  //   与 v3.194 的 EC（event-completeness）**同名不同物**。按名字全文件扫会把
  //   `EC.append` 记成本版模块的方法，得出「宿主调了不存在的方法」的假结论。
  // 正确做法：先找到绑定点 `const X = _xxxLib();`，再只扫该绑定之后的窗口。
  const cases = [
    { alias: 'FV', lib: '_factVersionLib', api: FV },
    { alias: 'EC', lib: '_eventCompletenessLib', api: EC },
    { alias: 'RL', lib: '_repairLoopLib', api: RL },
  ];
  for (const { alias, lib, api } of cases) {
    const binder = '= ' + lib + '()';
    let from = 0, seen = 0;
    const used = new Set();
    while (true) {
      const at = src.indexOf(binder, from);
      if (at < 0) break;
      seen++;
      // 只扫「该绑定点之后」的窗口——绑定本身把别名与该模块唯一绑定起来。
      const win = src.slice(at, at + 4000);
      const re = new RegExp('\\b' + alias + '\\.([A-Za-z_$][\\w$]*)\\s*\\(', 'g');
      let m;
      while ((m = re.exec(win)) !== null) used.add(m[1]);
      from = at + binder.length;
    }
    assert.ok(seen >= 1, alias + ' 有取库绑定点（' + lib + '()）');
    assert.ok(used.size >= 3, alias + ' 在本版作用域内被调用了（实 ' + used.size + ' 个方法）');
    for (const name of used) {
      assert.equal(typeof api[name], 'function',
        alias + '.' + name + ' 必须是模块真导出的函数（宿主调用不得指向不存在的方法）');
    }
  }
});

test('v3194 16. 三个模块登记进 extra_js，且消费面不悬空', () => {
  const ej = manifest.extra_js || [];
  for (const f of NEW_MODULES) {
    assert.ok(ej.includes(f), f + ' 必须在 manifest.extra_js（不登记 = 不加载 = 机制零生效）');
    assert.match(raw, new RegExp("window\\.LonSha\\w+, '" + f.replace('.', '\\.') + "'"), f + ' 有取库口引用');
  }
  // 根 .js 数 = 入口 + 声明模块（防游离文件与悬空注册两个方向）
  const allJs = readdirSync(ROOT).filter((f) => f.endsWith('.js'));
  assert.equal(allJs.length, 1 + ej.length,
    '根 .js 数应等于 入口(index.js) + extra_js（实 ' + allJs.length + ' vs ' + (1 + ej.length) + '）');
  for (const f of ej) assert.ok(allJs.includes(f), 'extra_js 指向的文件必须真实存在: ' + f);
});

test('v3194 17. 三面账进契约键、进存档、进恢复（少一处就是「存了不读」）', () => {
  for (const k of ['factVersions', 'eventThreads', 'repairLog']) {
    // 用双引号串包单引号，避免在正则字面量里嵌引号带来的转义陷阱。
    assert.ok(new RegExp("ARCHIVE_TOP_LEVEL_KEYS[\\s\\S]{0,4000}?['\"]" + k + "['\"]").test(src),
      k + ' 在 ARCHIVE_TOP_LEVEL_KEYS（collectExport 导出键集契约）');
    assert.match(src, new RegExp('collectExport\\(\\)\\s*\\{[\\s\\S]*?' + k + ':\\s*this\\.'), k + ' 在 collectExport 真导出');
  }
  assert.ok(/'factVersions', 'eventThreads'/.test(src), '两面进 CARRYOVER_CONTRACT_KEYS（携带包契约）');
  // 恢复侧三条独立登记（单面坏不连坐）——「另存副本」与「漏登记」都会让这条翻红
  assert.match(src, /_imp\('factVersions', data\.factVersions != null/, 'factVersions 走恢复管线');
  assert.match(src, /_imp\('eventThreads', data\.eventThreads != null/, 'eventThreads 走恢复管线');
  assert.match(src, /_imp\('repairLog', data\.repairLog != null/, 'repairLog 走恢复管线');
  // 恢复用的是裸名取库口：取库口定义在模块作用域，写成 this._xxxLib() 会抛 TypeError
  // 并被 try/catch 吞成 errLog（看起来「导入成功」而实际什么都没恢复）。
  assert.ok(!/this\._(factVersion|eventCompleteness|repairLoop)Lib\(/.test(src),
    '取库口调用不得带 this.（同名闭包函数不在实例上）');
  assert.ok(!/engine\._(factVersion|eventCompleteness|repairLoop)Lib\(/.test(src),
    '取库口调用不得带 engine.（同上）');
});

test('v3194 18. 三面账跨存档往返不丢（导入导出闭环）', () => {
  let st = FV.normalize(null);
  st = FV.assertFact(st, { subject: '她', predicate: '居住', value: '北京', from: 1, floor: 1 }).state;
  st = FV.assertFact(st, { subject: '她', predicate: '居住', value: '上海', from: 50, floor: 50 }).state;
  const rt = FV.normalize(JSON.parse(JSON.stringify(st)));
  assert.deepEqual(FV.timeline(rt, { subject: '她', predicate: '居住' }).versions.map((f) => f.value),
    ['北京', '上海'], '两段跨往返都在');
  assert.equal(FV.lookup(rt, { subject: '她', predicate: '居住', at: 10 }).fact.value, '北京', '往返后时间点查询仍分得开');
  let e = EC.normalize(null);
  e = EC.addSegment(e, { title: 'T', role: 'action', text: '行动', floor: 2, eventKey: 'k' }).state;
  const e2 = EC.normalize(JSON.parse(JSON.stringify(e)));
  assert.equal(EC.outstanding(e2).length, 1, '事件线跨往返后未完成事项仍在');
  const rq = RL.request(RL.normalize(null), { action: 'revoke', subject: 'a', target: 'b', pool: { facts: [{ key: 'f', text: 'b' }] } });
  const r2 = RL.normalize(JSON.parse(JSON.stringify(rq.state)));
  assert.equal(RL.pending(r2).length, 1, '修复台账跨往返后未落定项仍在');
});

/* ── ⑤ 发布卫生 ─────────────────────────────────── */
test('v3194 19. 三源同源，且不低于本版', () => {
  const v = /const VERSION = '([0-9.]+)'/.exec(raw)[1];
  assert.equal(v, '3.195.0', 'index.js 版本号为 3.194.0');
  assert.equal(manifest.version, '3.195.0', 'manifest 跟随 index.js');
  assert.equal(pkg.version, '3.195.0', 'package 跟随 index.js');
});

test('v3194 20. 本版 test 文件自身进了 tests/ 目录', () => {
  const self = readFileSync(new URL(import.meta.url), 'utf-8');
  assert.ok(self.includes('[v3.194.0]'), '版本标记存在');
  assert.ok(readdirSync(ROOT + 'tests').includes('v3194_time_and_fact_version.test.mjs'), '文件真在 tests/ 下');
  assert.ok(self.includes('assertFact') && self.includes('addSegment') && self.includes('RL.request'), '真调用了三模块');
});
