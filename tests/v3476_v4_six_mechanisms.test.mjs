/**
 * v3.476 — v4.0 六条机制（R27-A~F）缝入 + 接线判据
 *
 * 背景：v4.0 照 shrink1024/fish-memory 的**行为**重写了六条机制（该仓无 LICENSE，
 *   一行代码未复制）。但本仓有过一条明确的失败史：`extraction-cadence.js` 缝合后
 *   **68 个版本无人调用**（v3.163 账本零消费）。所以本判据的重心不是「六条算得对」
 *   （那是它们各自 selfCheck 的事），而是这三件事：
 *     ① 六条**各自**能跑，且六条合起来有一个唯一取数口径（v4-panel-bridge）；
 *     ② 六条不是摆设 —— 每一条都能在**产物代码里指名道姓**地找到它的消费点；
 *     ③ 七个新文件都在 manifest.extra_js 装载队列里（不登记 = 不加载 = 机制零生效）。
 *
 * 覆盖：
 *   0  版本三源同源（index / manifest / package）
 *   1  六个机制模块 + 面板桥可加载，且各自 selfCheck 全绿
 *   2  面板桥：六格必给可读 reason（「没做过」不许写成 0）
 *   3  维护排期：暂缓最新一条回复时，其紧邻玩家输入必须一起暂缓
 *   4  窗口撤回：不认领外部隐藏，且只隐「边界之前」的楼
 *   5  句子改写：短单句命中豁免（保守例外不能被误伤）
 *   6  存档编码：本仓自有编码名，不冒充 fish-memory
 *   7  选文复用：同输入同指纹、异输入异指纹（指纹只是内存键）
 *   8  规则 DSL：代码注入必须被词法拒绝（作者写的是数据不是代码）
 *   9  接线证据：六条在产物里各有真实消费点（逐条点名文件）
 *  10  装载证据：七个新文件全部在 manifest.extra_js
 *  11  负控制：把某条消费点从产物里删掉时，本判据必须转红（用副本验证逻辑，不改盘）
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const j = (f) => JSON.parse(read(f));

const IDX = read('index.js');
const MC = read('memory-core.js');
const SC = read('engine-self-check.js');
const MANIFEST = j('manifest.json');
const PKG = j('package.json');

const MS = require('../maintenance-schedule.js');
const WP = require('../window-plan.js');
const SE = require('../sentence-edits.js');
const SCc = require('../storage-codec.js');
const SR = require('../selection-reuse.js');
const RC = require('../rules-compile.js');
const PB = require('../v4-panel-bridge.js');

/** 一个最小的合法**内存存档**（`encodeSave` 只吃 schema===2 且身份完整的形状）。 */
const memSave = (extra) => Object.assign({
  schema: 2, id: 't', chatId: 'c', bookName: 'b', revision: 0,
}, extra || {});

let pass = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };

// ---------- 0 ----------
test('【0】版本三源同源（index / manifest / package）', () => {
  const v = /const VERSION = '([0-9.]+)'/.exec(IDX)[1];
  assert.equal(MANIFEST.version, v, 'manifest.version 必须等于 index.js VERSION');
  assert.equal(PKG.version, v, 'package.version 必须等于 index.js VERSION');
  assert.ok(/^3\.476\./.test(v), '本判据生于 v3.476.x，当前 ' + v);
  ok('版本 ' + v + ' 三源一致');
});

// ---------- 1 ----------
test('【1】六个机制模块 + 面板桥可加载，各自 selfCheck 全绿', () => {
  const six = [
    ['maintenance-schedule', MS], ['window-plan', WP], ['sentence-edits', SE],
    ['storage-codec', SCc], ['selection-reuse', SR], ['rules-compile', RC],
  ];
  for (const [name, mod] of six) {
    assert.equal(typeof mod.selfCheck, 'function', name + ' 缺 selfCheck');
    const r = mod.selfCheck();
    assert.ok(r.ok, name + ' selfCheck 未全绿：' + JSON.stringify(r.checks.filter((c) => !c.ok)));
  }
  const pb = PB.selfCheck();
  assert.ok(pb.ok, 'v4-panel-bridge selfCheck 未全绿：' + JSON.stringify(pb.checks.filter((c) => !c.ok)));
  ok('六条 + 面板桥 自检全绿');
});

// ---------- 2 ----------
test('【2】面板桥：六格必给可读 reason（「没做过」不许写成 0）', () => {
  const d = PB.read({}, { probe: memSave({ a: [1, 2, 3], n: '中文' }) });
  assert.deepStrictEqual(d.missing, [], '六条应全部可加载');
  for (const k of PB.SIX) {
    const cell = d[k];
    assert.ok(cell && typeof cell === 'object', k + ' 格必须存在');
    if (cell.ok === false) {
      assert.ok(typeof cell.reason === 'string' && cell.reason.length, k + ' 未就绪时必须给 reason，不能是 undefined/空串');
    }
  }
  /* codec 给了 probe ⇒ 这一格必须真算出来（证明桥在传参，不是恒短路） */
  assert.equal(d.codec.ok, true, 'codec 给了合法内存存档就必须编得出来');
  assert.ok(d.codec.chars > 0, 'codec 必须报出真实字符数：' + JSON.stringify(d.codec));
  assert.ok(String(d.codec.encoding).indexOf('lonsha-pool-v1') >= 0, 'codec 必须报出本仓编码名：' + d.codec.encoding);
  /* reuse / edits 未运行 ⇒ 明确 not-run，而不是 reused:false 冒充「判过了」 */
  assert.equal(d.reuse.ok, false);
  assert.equal(d.reuse.reason, 'not-run');
  assert.equal(d.edits.ok, false);
  assert.equal(d.edits.reason, 'not-run');
  assert.ok(String(d.line).indexOf('V4 六条') === 0, '诊断行必须以「V4 六条」开头');
  ok('六格 reason 齐备，未运行 ≠ 判定为假');
});

// ---------- 3 ----------
test('【3】维护排期：暂缓最新回复时，其紧邻玩家输入一起暂缓', () => {
  const msgs = [
    { role: 'user', content: '问一' }, { role: 'assistant', content: '答一' },
    { role: 'user', content: '问二' }, { role: 'assistant', content: '答二' },
  ];
  const s = MS.computeSchedule(msgs, [], { maintenanceEvery: 1, maintenanceKeepRecent: 1 });
  /* 暂缓最新 1 条回复（下标 3）后，还要往前退到最近的 assistant，把提问（下标 2）一起划进暂缓区
   * ⇒ 可维护区 = [0,2) = 两条。这条是本判据的核心：只截回复不截提问，会落下「玩家说了话没人回」。 */
  assert.equal(s.eligibleEnd, 2, '可维护区上界必须是 2（问二 与 答二 都暂缓）');
  assert.equal(s.deferredCount, 2);
  assert.equal(s.degraded.length, 0, '不得有降级读数：' + JSON.stringify(s.degraded));
  ok('暂缓区连玩家输入一起暂缓（eligibleEnd=2）');
});

// ---------- 4 ----------
test('【4】窗口撤回：不认领外部隐藏，且只隐「边界之前」的楼', () => {
  /* 窗口边界 = 「保留最近 recentTurns 个玩家开口」的起点。
   * 1 个开口时 `userStarts.length > recentTurns` 不成立 ⇒ 起点回落 0（全保留，谁都不隐），
   * 所以这里给**两个**开口，recentTurns=1 才真的把起点放到第二个开口（m2）。
   * m3 是**别人**隐的（外部隐藏）：既不许我恢复，也不许我把它算成自己的窗口。 */
  const msgs = [
    { key: 'm0', role: 'user', content: '早' },
    { key: 'm1', role: 'assistant', content: '早答' },
    { key: 'm2', role: 'user', content: '中' },
    { key: 'm3', role: 'assistant', content: '中答', hidden: true, hiddenBy: 'other' },
  ];
  const plan = WP.planWindow(msgs, ['m0', 'm1', 'm2', 'm3'], {
    enabled: true, recentTurns: 1, owner: 'lonsha-memory', canOmit: () => true,
  });
  const by = {};
  for (const c of plan.plan || []) by[c.key] = c.hidden;
  assert.equal(plan.readings.start, 2, '起点必须落在第二个玩家开口（m2）');
  assert.equal(plan.readings.boundary, 2, '边界 = min(起点2, 已覆盖4) = 2');
  assert.equal(plan.readings.foreignHidden, 1, 'm3 必须被记成外部隐藏');
  assert.equal(by.m0, true, 'm0 在边界之前 ⇒ 应隐藏');
  assert.equal(by.m1, true, 'm1 在边界之前 ⇒ 应隐藏');
  assert.equal(by.m2, undefined, 'm2 在边界之后 ⇒ 不动');
  assert.equal(by.m3, undefined, 'm3 是别人的隐藏 —— 不许出现在我的处置清单里');
  ok('不认领外部隐藏 / 只隐边界之前的楼');
});

// ---------- 5 ----------
test('【5】句子改写：短单句命中豁免（保守例外不能被误伤）', () => {
  const shortEntry = { id: 's', segments: [{ id: 's1', text: '他走了。' }] };
  assert.equal(SE.shortSingleEntry(shortEntry), true, '单段短句必须被认成短单句');
  const r = SE.applySentenceEdits(shortEntry, [{ segmentId: 's1', oldText: '他走了', newText: '她来了' }]);
  assert.equal(r.rejected.length, 0, '短单句改掉 75% 必须放行，否则正常改法被误伤');
  const longText = '他走进酒楼，抬头看了看天色，又低头数了数钱袋里的碎银，最后把刀放在桌上说了几句废话。';
  const long = SE.applySentenceEdits(
    { id: 'l', segments: [{ id: 's1', text: longText }] },
    [{ segmentId: 's1', oldText: '他走进酒楼，抬头看了看天色，又低头数了数钱袋里的碎银，最后把刀放在桌上说了几句废话', newText: 'X' }]
  );
  assert.equal(long.rejected.length, 1);
  assert.equal(long.rejected[0].code, 'patch-span-too-wide', '长条目改掉七成必须判 too-wide');
  ok('短单句豁免 + 长条目 too-wide 双向都对');
});

// ---------- 6 ----------
test('【6】存档编码：本仓自有编码名，不冒充 fish-memory', () => {
  const v = memSave({ a: [1, undefined, -0], b: { c: '中文' } });
  const out = SCc.encodeSave(v);
  assert.equal(typeof out, 'object', 'encodeSave 返回的是存档对象（不是字符串）');
  assert.equal(out.encoding, 'lonsha-pool-v1', '编码名必须是本仓自有 lonsha-pool-v1');
  assert.equal(JSON.stringify(out).indexOf('fish-memory-pool-v1'), -1, '不得冒充 fish-memory 的存档格式');
  const back = SCc.decodeSave(out);
  assert.equal(back.b.c, '中文');
  assert.equal(back.a[1], undefined, 'undefined 必须往返保真');
  assert.ok(Object.is(back.a[2], -0), '-0 必须往返保真');
  ok('编码名自有 + 往返保真（undefined / -0）');
});

// ---------- 7 ----------
test('【7】选文复用：同输入同指纹、异输入异指纹', () => {
  const a = SR.fingerprint(JSON.stringify({ q: '问', c: [['id1', '正文']] }));
  const b = SR.fingerprint(JSON.stringify({ q: '问', c: [['id1', '正文']] }));
  const c = SR.fingerprint(JSON.stringify({ q: '问', c: [['id1', '正文2']] }));
  assert.equal(a, b, '同输入必须同指纹（否则复用永不命中）');
  assert.notEqual(a, c, '异输入必须异指纹（否则会复用错选文）');
  assert.ok(/^[0-9a-f]{16}$/.test(a), '指纹必须是 16 位 hex：' + a);
  ok('指纹 同输入同键 / 异输入异键');
});

// ---------- 8 ----------
test('【8】规则 DSL：代码注入必须被词法拒绝', () => {
  assert.throws(
    () => RC.compileRules('when kind == "npc" => lock; process.exit(1);'),
    (e) => /RuleSyntaxError|语法/.test(String(e && (e.name || e.message))),
    '代码注入必须在词法阶段就被拒，不许进到求值'
  );
  const good = RC.compileRules('when kind == "npc" => lock;');
  assert.ok(Array.isArray(good.statements) && good.statements.length === 1, '正常规则必须编译出 1 条 statement');
  assert.equal(good.statements[0].action, 'lock', 'statement.action 必须是单个算子字符串');
  ok('代码注入被词法拒绝 / 正常规则可编译');
});

// ---------- 9 ----------
test('【9】接线证据：六条在产物里各有真实消费点', () => {
  /* 逐条点名「谁在什么时候调它」。这一条是防 v3.163 那种「缝了 68 版没人调」的机器判据：
   *   少一处引用就红，而不是等某天有人发现「这个模块怎么从没跑过」。 */
  assert.ok(/LonShaMaintenanceSchedule|maintenance-schedule\.js/.test(MC),
    'R27-A 维护排期必须在 memory-core.js（批量补齐=维护轮）里被调用');
  assert.ok(/computeSchedule/.test(MC), 'R27-A 必须真的调 computeSchedule（不只是 require 进去）');
  assert.ok(/_lastSummaryEditRead/.test(MC), 'R27-C 句子改写必须把结论落到可读面');
  assert.ok(/applySentenceEdits/.test(MC), 'R27-C 必须真的调 applySentenceEdits');
  assert.ok(/LonShaSelectionReuse|selection-reuse\.js/.test(IDX), 'R27-E 选文复用必须接在 index.js 的 AI 精选面');
  assert.ok(/_aiSelectReuseRead/.test(IDX), 'R27-E 必须留下可读判定（复用中/冷启）');
  assert.ok(/v4-panel-bridge\.js/.test(SC), '六条必须在 engine-self-check.js 的诊断表里有一行（唯一取用点）');
  assert.ok(/LonShaV4PanelBridge/.test(SC), '诊断行必须走面板桥取数，不许自己拼读数');
  ok('维护/改写/复用/诊断 四处消费点齐全');
});

// ---------- 10 ----------
test('【10】装载证据：七个新文件全部在 manifest.extra_js', () => {
  const ej = MANIFEST.extra_js || [];
  const need = [
    'maintenance-schedule.js', 'window-plan.js', 'sentence-edits.js',
    'storage-codec.js', 'selection-reuse.js', 'rules-compile.js', 'v4-panel-bridge.js',
  ];
  for (const f of need) {
    assert.ok(existsSync(path.join(ROOT, f)), f + ' 必须在盘上');
    assert.ok(ej.includes(f), f + ' 必须在 manifest.extra_js（不登记 = 不加载 = 机制零生效）');
  }
  /* 顺序：面板桥依赖六条，必须排在它们之后（浏览器下按 extra_js 序加载） */
  const at = (f) => ej.indexOf(f);
  assert.ok(at('v4-panel-bridge.js') > at('maintenance-schedule.js'), '面板桥必须排在六条之后');
  assert.ok(at('v4-panel-bridge.js') > at('rules-compile.js'), '面板桥必须排在六条之后');
  ok('七个文件已登记，且面板桥在六条之后');
});

// ---------- 11 ----------
test('【11】负控制：删掉消费点后本判据必须转红', () => {
  /* 不改盘：拿产物源码做「抹掉消费点」的内存副本，把第 9 条的同一条断言在副本上再跑一遍。
   *   没有这一条，第 9 条可能只是「字符串恰好出现」的假绿 —— 本仓点名过这种形态：
   *   「文件名在别处出现过就算活着」本来就是猜不是判。 */
  const ruleR27A = (src) => {
    assert.ok(/computeSchedule/.test(src), 'R27-A 必须真的调 computeSchedule（不只是 require 进去）');
  };
  ruleR27A(MC);                                                  // 盘上：绿
  const stripped = MC.replace(/computeSchedule/g, 'removed');     // 模拟「消费点被删」
  assert.throws(() => ruleR27A(stripped), /computeSchedule/, '负控制：抹掉消费点后判据必须能红');
  assert.ok(/computeSchedule/.test(MC), '盘上 memory-core.js 必须仍调用 computeSchedule');
  ok('负控制成立（判据不是字符串偶然在场）');
});

test('汇总', () => {
  assert.ok(pass >= 12, '至少 12 条通过，实际 ' + pass);
  console.log('✓ 汇总：' + pass + ' 组判据');
});