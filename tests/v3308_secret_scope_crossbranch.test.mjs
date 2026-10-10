// tests/v3308_secret_scope_crossbranch.test.mjs — M-O8 第三刀：跨支 / 跨卷的秘密边界认「知情名单」（v3.308.0）
//
//   计划第二期 M-O8 四条验收里，第②条「A 分支秘密不出现在 B」此前**只治了一半**：
//   X6 / X5 早就各有一个 `filterByKeeper`，但它们把秘密条的 `keeper` 当成
//   「有权查看的人」（名单内放行）；而 `secret-ledger.js` 里 `keeper` 的意思是
//   **「不该知道的人」**（写侧纪律：keeper 在场即拒推进 / 拒揭露）——
//   **同名异义**。于是跨模块对接时方向整个反了。
//   本档把两件事同时钉住：① 口径按**知情名单**（knowers）分派；② **正文**不得随
//   「对照 / 提案 / 接续包」外带（入口剥 + 出口二道闸，剥了几份进 shadowed 读数）。
//
//   修前真读数（探针 /tmp/probe_o8c.mjs 与 /tmp/probe_o8f.mjs，rc 均为 0；条 = { keeper:['阿绣'], knowers:['老周'] }）：
//     · X6 filterByKeeper(viewer='阿绣') ⇒ visible=1  ← 守密人**被放行**，正文进读数
//     · X6 filterByKeeper(viewer='老周') ⇒ hidden=1  ← 在册知情者**被挡住**
//     · X5 同款（visible=1 / hidden=1）
//     · 对照读数 `deltas[].b` 是**整条**秘密：`Object.keys(d.b)` =
//       ["id","secret","keeper","knowers","about","progress","status","floor"]，逐字含正文；
//       `proposeImport.proposals[].value` 同款。
//     · X5 侧：`buildContinuationPack` 的条目 `value` / `proposeHandoff` 的 `proposals[].value`
//       同样原样携带正文（探针 ② 实测 `含正文=true`）。
//   修后：守密人 visible=0 / 在册知情者 visible=1，且三路读数里都搜不到正文。
//
//   本档判据面（23 条）：
//     A 结构：A1 两模块版本 3 + 返回面两档/风险计数/剥正文读数在位；A2 旧字段名逐个仍在
//     B 口径：B1 守密人看不见；B2 在册知情者看得见；B3 无名单者看不见
//     C 判不了：C1 无 viewer + 有名单 ⇒ 单独一档；C2 计数守恒
//     D 端到端：D1★ 对照读数不外带正文（修前实测会外带）；D2 提案 value 不含正文
//     E 跨卷：E1★ 接续包条目不带正文；E2 提案不带正文；E3 剥了几份数得出来（shadowed）
//     F 同名异人：F1 两路风险计数都数得出来；F2 同一角色不同宇宙同名即计数；F3 全仓无 knowerIds
//     G 单一真源：G1★ X6 / X5 / secret-ledger 三处同口径
//     H 边界如实：H1 值守位串而不是空串；H2 不改调用方对象；H3 边界字段不剥
//     I 负控制：I1~I4 四条真源码破坏；I5 破坏工具两向自证
//     J 判据纯度：J1 锚点常量统一声明 + 源侧各恰中 1 次；J2 版本常量各一处
//     K 版本锚：K1 本档出生版本（供 V4 计数）
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { breakOnce } from './_break_kit.mjs';   // 破坏形态唯一真源（v3247 B1 台账已登记）

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const BS = require(path.join(ROOT, 'branch-semantics.js'));
const VC = require(path.join(ROOT, 'volume-continuation.js'));
const SL = require(path.join(ROOT, 'secret-ledger.js'));

const bsSrc = read('branch-semantics.js');
const vcSrc = read('volume-continuation.js');
const SELF = readFileSync(new URL(import.meta.url).pathname, 'utf8');

const BODY = '养女实为仇家之后';
/** 探针条：`keeper` = 不该知道的人「阿绣」；`knowers` = 已经知道的人「老周」。
 *  `key` 是**适形字段**：X5 的 `buildContinuationPack` 按「面内键」寻址（无键的条目
 *  不可寻址、根本不进包），H1/V1 两侧的同一条形状必须两处都能跑。 */
const SEC = Object.freeze({
  id: 'sec_1', key: 'sec_1', secret: BODY, keeper: ['阿绣'], knowers: ['老周'], about: ['阿绣'],
  progress: 0, status: 'sealed', floor: 3
});
/** 五面全在（**必须声明**：不声明 ⇒ 面被记「在场未知」⇒ comparable:false ⇒ 判据根本没碰到那一格）。 */
const ALL = Object.freeze({ factVersion: true, characterState: true, unfinished: true, money: true, storyTime: true });
const SIDE = (owners, modules) => ({ modules: modules === undefined ? ALL : modules, owners });
/** X5 的**面条目**形态（与 X6 不同，本仓既有口径见 v3293 B4）：
 *  边界字段（`keeper` / `knowers`）挂**面条目**上、正文挂在 `value` 里 ——
 *  过滤按面条目判、剥除按 `value` 判。X6 的条目则是「自身即内容」（{id, secret, …}）。 */
const SEC_E = Object.freeze({
  id: 'sec_1', key: 'sec_1', value: SEC, keeper: ['阿绣'], knowers: ['老周'], from: 3
});
const VIEWER_IN = Object.freeze({ id: '老周', name: '老周' });
const VIEWER_KEEPER = Object.freeze({ id: '阿绣', name: '阿绣' });

/* ──────────────────────────────────────────────────────────
 * 真源码锚点常量（判据纯度：字面量只在这里声明一次，下文的破坏与自证都引用常量名）
 * ────────────────────────────────────────────────────────── */
const ANCHOR = Object.freeze({
  /** X6 知情名单分派（拆掉它 ⇒ 守密人重新被放行）。 */
  dispatch: "const knowers = Array.isArray(e.knowers) ? e.knowers.map(keyOf).filter(Boolean) : [];",
  /** X6 判不了那一档（改成放行 ⇒ 「判不了」消失）。 */
  undecided: 'if (!vName) { hidden++; knowerUndecided++; continue; }',
  /** X6 风险计数（拆掉 ⇒ 同名异人风险不可见）。 */
  count: 'for (const n of knowers) { if (n === vName) { knowersMatched++; break; } }',
  /** X6 正文剥除（拆掉 ⇒ 正文重新外带）。**两行必须一起拆**：只拆 a 侧时
   *  `only-in-b` 的差异仍走 b 侧剥除（判据根本不翻红，负控制会变成假绿）。
   *  拆成两个**单行**常量再拼装：单行常量才能被「本档内只声明一次」这条纯度判据
   *  逐字核对（多行常量在源码里是 `\n` 转义文本，文件内检索必然 0 命中 —— 那是判据假红）。 */
  maskA: 'const ma = maskSecretBody(aVal);',
  maskB: 'const mb = maskSecretBody(bVal);',
  /** X5 正文剥除（拆掉 ⇒ 正文重新进包/提案）。 */
  maskVc: 'const _m = maskSecretBody(rec.value);',
  /** X5 出口二道闸（拆掉 ⇒ 自造包那条路重新泄漏）。 */
  maskOut: 'value: maskSecretBody(e.value).value, from: e.from,',
});

/* ──────────────────────────────────────────────────────────
 * A. 结构
 * ────────────────────────────────────────────────────────── */
test('v3308 A1. 两模块版本 = 3，返回面新增两档 + 风险计数 + 剥正文读数（旧字段一个不改）', () => {
  assert.equal(BS.BRANCH_SEMANTICS_VERSION, 3, 'X6 版本须抬到 3（口径 + 正文剥除）');
  assert.equal(VC.VOLUME_CONTINUATION_VERSION, 3, 'X5 版本须抬到 3（同款）');
  const g = BS.filterByKeeper([SEC], '老周');
  for (const k of ['knowerOnly', 'knowerUndecided', 'knowersMatched']) assert.ok(k in g, 'X6 返回面必须有 ' + k);
  const g2 = VC.filterByKeeper([SEC], '老周');
  for (const k of ['knowerOnly', 'knowerUndecided', 'knowersMatched']) assert.ok(k in g2, 'X5 返回面必须有 ' + k);
  /* 剥正文读数：对照面带 shadowed（面级 + 顶层）。 */
  const cmp = BS.compareOwners(SIDE({ w: { unfinished: [] } }), SIDE({ w: { unfinished: [SEC] } }), { viewer: '老周' });
  assert.ok('shadowed' in cmp, 'compareOwners 顶层须报 shadowed');
  assert.ok('shadowed' in cmp.owners[0].faces.unfinished, '面级须报 shadowed');
});

test('v3308 A2. 旧字段名逐个仍在（只增不改：下游按旧键断言不必猜）', () => {
  const g = BS.filterByKeeper([SEC], '老周');
  for (const k of ['visible', 'hidden', 'hiddenBy', 'nameMatched', 'total']) assert.ok(k in g, 'X6 旧键必须仍在：' + k);
  const g2 = VC.filterByKeeper([SEC], '老周');
  for (const k of ['visible', 'hidden', 'hiddenBy', 'total', 'byName', 'nameMatched']) assert.ok(k in g2, 'X5 旧键必须仍在：' + k);
  /* makeDelta 旧键：kind / key / a / b / from / scope 一个不改。 */
  const d = BS.compareOwners(SIDE({ w: { unfinished: [] } }), SIDE({ w: { unfinished: [SEC] } }), { viewer: '老周' })
    .owners[0].faces.unfinished.deltas[0];
  for (const k of ['kind', 'key', 'a', 'b', 'from', 'scope']) assert.ok(k in d, 'delta 旧键必须仍在：' + k);
});

/* ──────────────────────────────────────────────────────────
 * B. 口径（本档主题：同名异义治掉了没有）
 * ────────────────────────────────────────────────────────── */
test('v3308 B1. ★★★ 守密人（不该知道的人）看不见：可见数 0、正文不外带', () => {
  const g = BS.filterByKeeper([SEC], '阿绣');
  assert.equal(g.visible.length, 0, '守密人不得看见（修前这里是 1 —— 方向反了）');
  assert.equal(g.hidden, 1, '被挡条数必须计数可见');
  const g2 = VC.filterByKeeper([SEC], '阿绣');
  assert.equal(g2.visible.length, 0, 'X5 同款：守密人不得看见');
  assert.equal(g2.hidden, 1, 'X5 同款：计数可见');
});

test('v3308 B2. ★★★ 在册知情者（已经知道的人）看得见', () => {
  const g = BS.filterByKeeper([SEC], '老周');
  assert.deepEqual(g.visible.map((e) => e.id), ['sec_1'], '在册知情者应看得见（修前这里是 hidden=1）');
  assert.deepEqual(VC.filterByKeeper([SEC], '老周').visible.map((e) => e.id), ['sec_1'], 'X5 同款');
});

test('v3308 B3. 名单外的第三人看不见（三态里最保守的一态没被改动）', () => {
  assert.equal(BS.filterByKeeper([SEC], '外人').visible.length, 0);
  assert.equal(VC.filterByKeeper([SEC], '外人').visible.length, 0);
});

/* ──────────────────────────────────────────────────────────
 * C. 「判不了」单独一档
 * ────────────────────────────────────────────────────────── */
test('v3308 C1. ★★ 无 viewer 且条目有名单 ⇒ 判不了单独一档（≠ 名单外）', () => {
  const g = BS.filterByKeeper([SEC], '');
  assert.equal(g.visible.length, 0, '不知道看的人是谁 ⇒ 不得放行');
  assert.equal(g.knowerUndecided, 1, '判不了必须单独计数');
  assert.equal(g.knowerOnly, 1, '这一路判过几条也要报');
  const gOut = BS.filterByKeeper([SEC], '外人');
  assert.equal(gOut.knowerUndecided, 0, '名单外的人不算判不了');
});

test('v3308 C2. 计数守恒：总条数 = 可见 + 被挡（不静默少条）', () => {
  const list = [SEC, { id: 'pub', value: 9 }];
  for (const who of ['阿绣', '老周', '外人', '']) {
    const g = BS.filterByKeeper(list, who);
    assert.equal(g.visible.length + g.hidden, g.total, 'viewer=' + (who || '空') + ' 时可见+被挡须等于总数');
    assert.equal(g.total, 2);
  }
});

/* ──────────────────────────────────────────────────────────
 * D. 端到端：对照 / 提案（修前实测会外带正文的那条）
 * ────────────────────────────────────────────────────────── */
test('v3308 D1. ★★★ 对照读数不再外带秘密正文（修前 deltas[].b 原样带出整条）', () => {
  /* ★ 两侧**必须显式声明五面在场**：不声明 ⇒ 面「在场未知」⇒ comparable:false ⇒
   *   面里根本不会有 delta ⇒ 「没有正文」自然成立 —— 那是本仓点名的假绿第二形。 */
  const A = SIDE({ __world__: { unfinished: [] } });
  const B = SIDE({ __world__: { unfinished: [SEC] } });
  const cmp = BS.compareOwners(A, B, { viewer: '老周' });
  const face = cmp.owners[0].faces.unfinished;
  assert.equal(face.comparable, true, '面必须可比（否则本判据是空转）');
  assert.equal(face.deltas.length, 1, '在册知情者视角下这一条应出 delta（判据真的碰到了那一格）');
  assert.equal(JSON.stringify(cmp).indexOf(BODY), -1, '★ 对照读数不得含秘密正文');
  /* 结构仍在：站位串 + 边界字段随条目走（不是把整条删掉）。 */
  const b = face.deltas[0].b;
  assert.equal(b.secret, BS.SECRET_MASK, '正文位置须是明确站位串（不是空串、不是删键）');
  assert.deepEqual(b.keeper, ['阿绣'], 'keeper 是边界字段，必须随条目走');
  assert.deepEqual(b.knowers, ['老周'], 'knowers 是边界字段，必须随条目走');
  assert.equal(b.progress, 0, '推进度必须随条目走');
  assert.ok(cmp.shadowed >= 1, '剥了几份必须数得出来（否则「没漏」与「没走到」同形）');
  /* 守密人视角：整面被挡，连条目都不出现。 */
  const cmp2 = BS.compareOwners(A, B, { viewer: '阿绣' });
  assert.equal(JSON.stringify(cmp2).indexOf(BODY), -1, '守密人视角不得含正文');
  assert.equal(cmp2.owners[0].faces.unfinished.deltas.length, 0, '守密人视角下不该有这条差异');
  assert.equal(cmp2.shadowed, 0, '被挡的条目不进对照面 ⇒ 剥除计数为 0（两者不同形）');
});

test('v3308 D2. 提案面：value 键不含秘密正文（修前 proposals[].value 就是整条）', () => {
  const A = SIDE({ __world__: { unfinished: [] } });
  const B = SIDE({ __world__: { unfinished: [SEC] } });
  const cmp = BS.compareOwners(A, B, { viewer: '老周' });
  const pr = BS.proposeImport(cmp, {});
  assert.equal(pr.proposals.length, 1, '这一条应出提案（判据真的碰到了那一格）');
  assert.equal(JSON.stringify(pr).indexOf(BODY), -1, '★ 提案不得含秘密正文');
  assert.equal(pr.proposals[0].value.secret, BS.SECRET_MASK, '提案 value 的正文位置须是站位串');
  /* 出口二道闸：调用方**自造** comparison（绕过入口）也带不出正文。 */
  const fake = { owners: [{ id: 'w', faces: { unfinished: { comparable: true, deltas: [{ kind: 'only-in-b', key: 'sec_1', a: null, b: SEC, from: { a: null, b: 3 }, scope: { a: 'unknown', b: 'unknown' } }] } } }] };
  const pr2 = BS.proposeImport(fake, {});
  assert.equal(JSON.stringify(pr2).indexOf(BODY), -1, '★ 绕开入口的自造 comparison 也须在出口被剥');
});

/* ──────────────────────────────────────────────────────────
 * E. 跨卷（X5）：包 / 提案 / 剥除读数
 * ────────────────────────────────────────────────────────── */
const R_VOL = [{ id: 'v1', title: '第一卷', chapters: [{ id: 'c1' }] }];
const packWith = (value) => ({
  projectId: 'pj1', volumeId: 'v1', sourceRef: 'sess#1',
  entries: [{ ownerKey: 'id:__world__', face: 'unfinished', key: 'sec_1', value: value, from: 3, scope: 'branch' }]
});

test('v3308 E1. ★★★ 接续包条目不带秘密正文（修前 pack.entries[].value 原样携带）', () => {
  const pack = packWith(SEC);
  const pr = VC.proposeHandoff(pack, { modules: { unfinished: true }, entries: [] }, {});
  assert.equal(pr.proposals.length, 1, '这一条应出提案');
  assert.equal(JSON.stringify(pr).indexOf(BODY), -1, '★ 提案不得含秘密正文');
  assert.equal(pr.proposals[0].value.secret, VC.SECRET_MASK, '正文位置须是站位串');
  assert.deepEqual(pr.proposals[0].value.keeper, ['阿绣'], '边界字段随条目走');
  /* 预览的**冲突条**：走名字通道 + 显式 allowNameLink，两侧同键不同值 ⇒ 进 conflicts，
   *   两侧都不得带正文（这是冲突条唯一会现形的路径：按 id 的条不与按名字的条比对、
   *   未显式放行的同名条只进候选表 —— 两条都不产生冲突条目）。 */
  const packN = VC.buildContinuationPack({
    project: { projectId: 'pj1', title: '长篇', volumes: R_VOL },
    volumeId: 'v1',
    faces: { unfinished: [{ name: '阿绣', key: 'sec_1', value: SEC, from: 3 }] },
    viewer: '老周'
  }).pack;
  const tgtN = { modules: { unfinished: true }, entries: [{ name: '阿绣', face: 'unfinished', key: 'sec_1', value: { name: '阿绣', key: 'sec_1', secret: '另一版本', progress: 40 } }] };
  const pv = VC.previewContinuation(packN, tgtN, { allowNameLink: true });
  assert.equal(pv.conflicts.length, 1, '这一格必须真的产生冲突条（否则判据空转）');
  assert.equal(JSON.stringify(pv).indexOf(BODY), -1, '★ 预览的冲突条不得含正文');
  assert.equal(JSON.stringify(pv).indexOf('另一版本'), -1, '★ 目标侧的值同样不得进读数');
  assert.equal(pv.conflicts[0].packValue.secret, VC.SECRET_MASK, '包侧正文位置须是站位串');
  assert.equal(pv.conflicts[0].targetValue.secret, VC.SECRET_MASK, '★ 目标侧也要剥（只剥一侧 = 泄漏仍然发生）');
  assert.equal(pv.shadowed, 2, '冲突条两侧各剥一份 ⇒ 2（剥除读数跟着走）');
});

test('v3308 E2. 包构造：buildContinuationPack 的条目与返回面（入口剥 + 剥除读数同形）', () => {
  /* buildContinuationPack 的输入是 face 数组（由宿主按面拆开），秘密条以 face 条目形态进来。
   * ★ viewer 必须传**对象**：本模块只接受 `{ id }` / `{ name }` 形态（字符串会被记成
   *   「没给我们看的人是谁」⇒ 条目被挡 ⇒ 判据在「没走到」那一面上空转）。 */
  const r = VC.buildContinuationPack({
    project: { projectId: 'pj1', title: '长篇', volumes: R_VOL },
    volumeId: 'v1',
    faces: { unfinished: [SEC_E] },
    viewer: VIEWER_IN
  });
  assert.equal(r.ok, true, '建包应成功：' + r.reason);
  assert.equal(r.pack.entries.length, 1, '在册知情者视角下这条应进包');
  assert.equal(JSON.stringify(r).indexOf(BODY), -1, '★ 包里不得含秘密正文');
  assert.equal(r.pack.entries[0].value.secret, VC.SECRET_MASK, '包里正文位置须是站位串');
  assert.equal(r.shadowed, 1, '包构造须报剥了几份正文');
  /* 缺项目：返回面同形（不得缺字段，否则「剥了 0 份」与「这条路没走到」同形）。 */
  const r2 = VC.buildContinuationPack({ volumeId: 'v1' });
  assert.equal(r2.ok, false);
  assert.equal(r2.shadowed, 0, '缺项目也要报 shadowed:0（字段必须在位）');
  const pv0 = VC.previewContinuation(null, null, {});
  assert.equal(pv0.shadowed, 0, '缺包也要报 shadowed:0');
});

test('v3308 E3. 剥了几份数得出来（shadowed 随真泄漏面走，不是常数）', () => {
  /* 三级阶梯：无正文 ⇒ 0；一条正文 ⇒ 1；两条正文 ⇒ 2。
   *   读数必须是**跟着真泄漏面走的量**，不是常数 —— 否则「没漏」与「没走到」同形。
   *   （viewer 一律传对象形态，见 E2 的注。） */
  const proj = { projectId: 'pj1', title: '长篇', volumes: R_VOL };
  const cleanE = { ownerKey: 'id:__world__', face: 'unfinished', key: 'p1', value: '普普通通的值', from: 2 };
  const twoBody = { id: 'sec_2', key: 'sec_2', secret: '另一条秘密正文', keeper: ['甲'], knowers: ['老周'] };
  const twoE = { ownerKey: 'id:__world__', face: 'unfinished', key: 'sec_2', value: twoBody, keeper: ['甲'], knowers: ['老周'], from: 4 };
  const secE = { ownerKey: 'id:__world__', face: 'unfinished', key: 'sec_1', value: SEC, keeper: ['阿绣'], knowers: ['老周'], from: 3 };
  const r0 = VC.buildContinuationPack({ project: proj, volumeId: 'v1', faces: { unfinished: [cleanE] }, viewer: VIEWER_IN });
  assert.equal(r0.pack.entries.length, 1, '无正文的条目照样进包');
  assert.equal(r0.shadowed, 0, '没有正文 ⇒ 剥 0 份（0 与「没走到」不同形：条目确实进了包）');
  const r1 = VC.buildContinuationPack({ project: proj, volumeId: 'v1', faces: { unfinished: [secE] }, viewer: VIEWER_IN });
  assert.equal(r1.shadowed, 1, '一条正文 ⇒ 剥 1 份');
  const r2 = VC.buildContinuationPack({ project: proj, volumeId: 'v1', faces: { unfinished: [secE, twoE] }, viewer: VIEWER_IN });
  assert.equal(r2.pack.entries.length, 2, '两条都应进包');
  assert.equal(r2.shadowed, 2, '两条正文 ⇒ 剥 2 份（读数必须跟着条数走）');
  assert.equal(JSON.stringify(r2).indexOf(BODY), -1, '两条路径都不得带正文');
  /* 守密人视角：条目被挡 ⇒ 不进包 ⇒ 剥 0 份（挡下与剥除是两件事，读数上也不该混）。 */
  const r3 = VC.buildContinuationPack({ project: proj, volumeId: 'v1', faces: { unfinished: [secE] }, viewer: VIEWER_KEEPER });
  assert.equal(r3.pack.entries.length, 0, '守密人视角下不进包');
  assert.equal(r3.shadowed, 0, '被挡的条目根本没进包 ⇒ 剥除计数为 0（与「剥了 1 份」不同形）');
  assert.equal(r3.hidden, 1, '被挡条数仍要计数可见（不静默少条）');
});

/* ──────────────────────────────────────────────────────────
 * F. 同名异人 / 伪装身份 / 同一角色不同宇宙（工作项 3）
 * ────────────────────────────────────────────────────────── */
test('v3308 F1. ★★ 两路风险计数都数得出来（keeper 侧 nameMatched / knowers 侧 knowersMatched）', () => {
  const gk = BS.filterByKeeper([{ id: 'k1', keeper: ['萧忆柔'] }], '萧忆柔');
  assert.equal(gk.nameMatched, 1, 'keeper 侧按名命中须计数（v3.292.0 既有口径）');
  const gn = BS.filterByKeeper([{ id: 's1', knowers: ['萧忆柔'], keeper: ['别人'] }], '萧忆柔');
  assert.equal(gn.knowersMatched, 1, '★ knowers 侧按名命中须计数（本刀新开）');
  assert.equal(gn.visible.length, 1, '在册即放行');
  const gn2 = BS.filterByKeeper([{ id: 's2', knowers: ['珞珈'], keeper: ['别人'] }], '珞花');
  assert.equal(gn2.knowersMatched, 0, '名字不同不得命中（伪装身份不得静默串）');
  assert.equal(gn2.visible.length, 0, '名字不同即看不见');
});

test('v3308 F2. 同一角色不同宇宙：同名即命中 —— 风险如实计数（不做静默合并，也不静默拒绝）', () => {
  const twoUniverse = [
    { id: 'u1', knowers: ['萧忆柔'], keeper: ['旁观者'] },
    { id: 'u2', knowers: ['萧忆柔'], keeper: ['旁观者'] }
  ];
  const g = BS.filterByKeeper(twoUniverse, '萧忆柔');
  assert.equal(g.visible.length, 2, '按名命中：两条都放行（不做静默合并）');
  assert.equal(g.knowersMatched, 2, '两条命中都要计数（风险可见）');
  assert.equal(g.hidden, 0);
});

test('v3308 F3. 全仓无 knowerIds 通道 —— 如实登记（不假装有 id 通道）', () => {
  /* 只在**代码位置**查（去掉行注释与块注释）：本档与源码的注释里都会提到这个名字，
   * 对注释断言会把「如实登记」变成「不许提这件事」。 */
  const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const f of ['branch-semantics.js', 'volume-continuation.js', 'secret-ledger.js']) {
    assert.equal(codeOnly(read(f)).indexOf('knowerIds'), -1,
      f + ' 代码位不得出现 knowerIds（若将来加了，本用例必须同步改为「按 id 不串」）');
  }
});

/* ──────────────────────────────────────────────────────────
 * G. 单一真源（三处同口径）
 * ────────────────────────────────────────────────────────── */
test('v3308 G1. ★★★ X6 / X5 / secret-ledger 三处同口径：同一组输入三处同判', () => {
  /* 只看**秘密条**（带知情名单）：四处 viewer 下可见数必须逐格一致。
   *   在册知情者 ⇒ 1；守密人 / 名单外 / 空 viewer ⇒ 0（空 viewer 属「判不了」，也不放行）。
   *   不一并断言「公开条」：它在三处的**兜底面不同**（X6/X5 走公开面放行，
   *   secret-ledger 的 `filterForViewer` 带 viewer 时把 unlisted 记 undecided）——
   *   那是三处的**设计差异**（公开面在秘密账里根本不存在），不是「口径不一致」。
   *   公开条各处的如实读数另由 G2 逐格钉住。 */
  for (const who of ['阿绣', '老周', '外人', '']) {
    const expect = (who === '老周') ? 1 : 0;
    assert.equal(BS.filterByKeeper([SEC], who).visible.length, expect, 'X6 viewer=' + (who || '空'));
    assert.equal(VC.filterByKeeper([SEC], who).visible.length, expect, 'X5 viewer=' + (who || '空'));
    assert.equal(SL.filterForViewer([SEC], who).visible.length, expect, 'secret-ledger viewer=' + (who || '空'));
  }
  assert.equal(BS.filterByKeeper([SEC], '').knowerUndecided, 1, 'X6 判不了单独一档');
  assert.equal(VC.filterByKeeper([SEC], '').knowerUndecided, 1, 'X5 同款');
  /* secret-ledger 的「判不了」在那两处另有几何：无 viewer 时它把**整条**记 notKnower
   *   （「名单在册但没他」与「无 viewer 而条目有名单」在它的口径里同属 notKnower，
   *   undecided 只留给「条目根本没给名单」）—— 如实记下这个差异，不假装三处字段同形。 */
  const slNone = SL.filterForViewer([SEC], '');
  assert.equal(slNone.visible.length, 0, 'secret-ledger：不知道看的人是谁 ⇒ 也不放行');
  assert.equal(slNone.withheld, 1, 'secret-ledger：被挡条数计数可见');
});

test('v3308 G2. 公开条（未给名单）在三处的兜底面如实不同形 —— 不假装一样', () => {
  const pub = { id: 'pub', value: 7 };
  /* X6 / X5：未给名单 ⇒ 按**公开面**兜底，任何 viewer（含空）都放行。 */
  assert.equal(BS.filterByKeeper([pub], '').visible.length, 1, 'X6：公开条在空 viewer 下放行');
  assert.equal(VC.filterByKeeper([pub], '').visible.length, 1, 'X5 同款');
  assert.equal(BS.filterByKeeper([pub], '老周').visible.length, 1, 'X6：公开条给 viewer 也放行');
  /* secret-ledger：本账**没有公开面**（秘密账里每条都该有边界）——
   *   空 viewer ⇒ 放行（unlisted 那一档）；给了 viewer ⇒ 记 undecided（判不了就在读数里说）。 */
  assert.equal(SL.filterForViewer([pub], '').visible.length, 1, 'secret-ledger：空 viewer 下 unlisted 走可见面');
  const slViewer = SL.filterForViewer([pub], '老周');
  assert.equal(slViewer.visible.length, 0, 'secret-ledger：给了 viewer 就不是「未给名单」能放行的场景');
  assert.equal(slViewer.undecided, 1, 'secret-ledger：这一档必须记成「判不了」，不与「挡下」同形');
});

/* ──────────────────────────────────────────────────────────
 * H. 边界如实（站着位的三条）
 * ────────────────────────────────────────────────────────── */
test('v3308 H1. ★★ 正文位置是**明确站位串**：不是空串、不是删键、不是前缀', () => {
  const masked = BS.maskSecretBody(SEC).value;
  assert.equal(masked.secret, BS.SECRET_MASK, '须替换为站位串');
  assert.notEqual(masked.secret, '', '空串与「这条本来没有内容」同形');
  assert.notEqual(masked.secret, BODY.slice(0, 3), '正文前缀是「只漏一点」，历来不接受');
  assert.ok(masked.secret.length > 10, '站位串须是明确的存在性声明');
  /* 站位串必须**可判**：下游能按它判 masked，不必猜字符串。 */
  assert.deepEqual(BS.SECRET_BODY_KEYS, ['secret', 'secretText', 'secretBody'], '键名表须在公共面上');
  assert.equal(VC.SECRET_MASK, BS.SECRET_MASK, '两模块站位串必须同一句（否则下游要认两句）');
});

test('v3308 H2. ★★ 不改调用方的对象（对照 / 建包都只读：剥除走浅拷贝）', () => {
  const sideA = SIDE({ w: { unfinished: [] } });
  const sideB = SIDE({ w: { unfinished: [SEC] } });
  const snapA = JSON.stringify(sideA);
  const snapB = JSON.stringify(sideB);
  BS.compareOwners(sideA, sideB, { viewer: '老周' });
  assert.equal(JSON.stringify(sideA), snapA, '侧 A 不得被改写');
  assert.equal(JSON.stringify(sideB), snapB, '★ 侧 B 的原始秘密条不得被就地改写成站位串');
  const pack = packWith(SEC);
  const snapP = JSON.stringify(pack);
  VC.proposeHandoff(pack, { modules: { unfinished: true }, entries: [] }, {});
  VC.buildContinuationPack({ project: { projectId: 'pj1', volumes: R_VOL }, volumeId: 'v1', faces: { unfinished: [SEC] }, viewer: '老周' });
  assert.equal(JSON.stringify(pack), snapP, '调用方的包不得被就地改写');
  assert.equal(SEC.secret, BODY, '★ 夹具秘密条本身必须没被改');
});

test('v3308 H3. 边界字段不剥：keeper / knowers / progress / status / floor 随条目走', () => {
  const masked = BS.maskSecretBody(SEC).value;
  for (const k of ['id', 'keeper', 'knowers', 'about', 'progress', 'status', 'floor']) {
    assert.deepEqual(masked[k], SEC[k], '边界字段必须原样保留：' + k);
  }
  /* 深度递归的边界如实：只剥**顶层**（不做会走进任意载荷的递归）。 */
  const nested = { id: 'x', wrapper: { secret: BODY } };
  assert.equal(BS.maskSecretBody(nested).value.wrapper.secret, BODY, '嵌套层不在本刀范围（边界显式声明）');
  assert.equal(BS.maskSecretBody(nested).masked, 0, '嵌套正文不计入 masked（读数不得虚报）');
  /* 非对象值原样通过（string / number / null / 数组）。 */
  for (const v of ['abc', 7, null, undefined, [1, 2]]) {
    assert.deepEqual(BS.maskSecretBody(v).value, v, '非对象值原样通过：' + JSON.stringify(v));
    assert.equal(BS.maskSecretBody(v).masked, 0);
  }
});

/* ──────────────────────────────────────────────────────────
 * I. 真源码破坏负控制（口径 ①②③④ 走 _break_kit 唯一真源）
 * ────────────────────────────────────────────────────────── */
/** 在破坏副本上跑同一套判据：返回失败原因（空串 = 全绿）。
 *  ★ 整体包 try/catch：破坏副本可能让某个分支返回**形态不同**的值（例如 `packValue` 变成
 *  undefined），判据自己抛 TypeError 与「判据翻红」在输出上同形 —— 那是本仓点名的
 *  「判据自己炸了遮住结论」。归因按侧名带出，异常也走同一条出口。 */
function judgeScope(BSx, VCx) {
  let side = 'X6';
  try {
    return judgeScopeInner(BSx, VCx, (s) => { side = s; });
  } catch (e) {
    return side + ' 判据在破坏副本上异常（异常与翻红必须分清）：' + (e && e.message);
  }
}

function judgeScopeInner(BSx, VCx, mark) {
  /* `key` 是**适形字段**：X5 的面内寻址要它（无键条目不可寻址、不进包也不出提案）——
   *   判据必须走到「条目真的进了包」那一格，否则破坏入口剥除也读不出差别（判据空转）。 */
  const sec = { id: 'sec_1', key: 'sec_1', secret: BODY, keeper: ['阿绣'], knowers: ['老周'], about: ['阿绣'] };
  const g1 = BSx.filterByKeeper([sec], '阿绣');
  if (g1.visible.length !== 0) return 'X6 守密人竟被放行（visible=' + g1.visible.length + '）';
  const g2 = BSx.filterByKeeper([sec], '老周');
  if (g2.visible.length !== 1) return 'X6 在册知情者竟被挡住';
  const g3 = BSx.filterByKeeper([sec], '');
  if (g3.knowerUndecided !== 1) return 'X6 无 viewer 时判不了未单独分档';
  if (g3.visible.length !== 0) return 'X6 无 viewer 时竟放行了有名单的条';
  if (g3.knowersMatched !== 0) return 'X6 空 viewer 不该计命中';
  if (g2.knowersMatched !== 1) return 'X6 在册命中未计数';
  /* 正文：对照面不得带正文（面必须可比，否则是空转判据）。 */
  const ALLx = { factVersion: true, characterState: true, unfinished: true, money: true, storyTime: true };
  const cmp = BSx.compareOwners({ modules: ALLx, owners: { w: { unfinished: [] } } },
    { modules: ALLx, owners: { w: { unfinished: [sec] } } }, { viewer: '老周' });
  const fx = cmp.owners[0].faces.unfinished;
  if (fx.comparable !== true) return 'X6 面必须可比（判据空转）';
  if (fx.deltas.length !== 1) return 'X6 应出一条第差异（判据没碰到那一格）';
  if (JSON.stringify(cmp).indexOf(BODY) >= 0) return 'X6 对照读数外带正文';
  const pr = BSx.proposeImport(cmp, {});
  if (JSON.stringify(pr).indexOf(BODY) >= 0) return 'X6 提案外带正文';
  /* X5：包 / 提案 / 预览冲突条都不得带正文。
   * ★ 边界字段挂**面条目**、正文挂 `value`（本仓 X5 既有形态，v3293 B4 同款）：
   *   若把关卡挂在 `sec` 自己身上，`rec.value` 就是 undefined ⇒ 破坏入口剥除也读不出差别
   *   （判据在「没走到」那一面上空转）。 */
  mark('X5');
  const secE = { id: 'sec_1', key: 'sec_1', value: sec, keeper: ['阿绣'], knowers: ['老周'], from: 3 };
  const v1 = VCx.filterByKeeper([secE], '阿绣');
  if (v1.visible.length !== 0) return 'X5 守密人竟被放行';
  const v2 = VCx.filterByKeeper([secE], '老周');
  if (v2.visible.length !== 1) return 'X5 在册知情者竟被挡住';
  const v3 = VCx.filterByKeeper([secE], '');
  if (v3.knowerUndecided !== 1) return 'X5 无 viewer 时判不了未单独分档';
  const pack = { projectId: 'p', volumeId: 'v', entries: [{ ownerKey: 'id:w', face: 'unfinished', key: 'sec_1', value: sec, from: 3 }] };
  const hp = VCx.proposeHandoff(pack, { modules: { unfinished: true }, entries: [] }, {});
  if (hp.proposals.length !== 1) return 'X5 该出一条提案（判据空转）';
  if (JSON.stringify(hp).indexOf(BODY) >= 0) return 'X5 提案外带正文';
  const built = VCx.buildContinuationPack({
    project: { projectId: 'p', volumes: [{ id: 'v', title: 'V', chapters: [] }] },
    volumeId: 'v', faces: { unfinished: [secE] }, viewer: { id: '老周', name: '老周' }
  });
  if (built.ok !== true) return 'X5 建包应成功';
  if (built.pack.entries.length !== 1) return 'X5 该有一条进包（判据空转）';
  if (JSON.stringify(built).indexOf(BODY) >= 0) return 'X5 包外带正文';
  if (built.shadowed !== 1) return 'X5 包剥除计数须为 1，实 ' + built.shadowed;
  const tgt = { modules: { unfinished: true }, entries: [{ name: '阿绣', face: 'unfinished', key: 'sec_1', value: { name: '阿绣', key: 'sec_1', secret: '另一版本', progress: 40 } }] };
  /* 冲突条只有在**名字通道 + 显式 allowNameLink** 下才现形（按 id 的条不与按名字的条比对，
   *   未放行的同名条只进候选表）—— 判据必须走到那一格，否则破坏冲突条入口剥除读不出差别。 */
  const packN = { projectId: 'p', volumeId: 'v', entries: [{ ownerKey: 'name:阿绣', link: 'by-name', face: 'unfinished', key: 'sec_1', value: sec, from: 3 }] };
  const pv = VCx.previewContinuation(packN, tgt, { allowNameLink: true });
  if (pv.conflicts.length !== 1) return 'X5 冲突条应现形一条（判据空转）';
  if (JSON.stringify(pv).indexOf(BODY) >= 0 || JSON.stringify(pv).indexOf('另一版本') >= 0) return 'X5 预览冲突条外带正文';
  /* 形态核对放**判据最后**：破坏后 `packValue` 可能根本不是对象（删/换了字段），
   *   直接读 `.secret` 会抛 —— 异常与翻红必须分清（见 judgeScope 的 try/catch）。 */
  if (!pv.conflicts[0].packValue || !pv.conflicts[0].targetValue) return 'X5 冲突条两侧的值必须在位';
  if (pv.conflicts[0].packValue.secret !== VCx.SECRET_MASK || pv.conflicts[0].targetValue.secret !== VCx.SECRET_MASK) return 'X5 冲突条两侧都须剥';
  if (pv.shadowed !== 2) return 'X5 冲突条两侧各剥一份 ⇒ 2，实 ' + pv.shadowed;
  return '';
}

/** 在破坏副本上加载两模块（真跑，不是文本断言）。 */
function loadPair(bsCode, vcCode) {
  const bsMod = { exports: {} };
  const vcMod = { exports: {} };
  const g = {};
  new Function('module', 'exports', 'window', 'globalThis', bsCode)(bsMod, bsMod.exports, g, g);
  new Function('module', 'exports', 'window', 'globalThis', vcCode)(vcMod, vcMod.exports, g, g);
  return { BSx: bsMod.exports, VCx: vcMod.exports };
}

/** 负控制基线：原版上同一套判据必须全绿（否则破坏后的翻红证明不了任何事）。 */
test('v3308 I0. 正控制：原版上同一套判据全绿（负控制的地基）', () => {
  const why = judgeScope(BS, VC);
  assert.equal(why, '', '原版上判据必须全绿，实为：' + why);
});

test('v3308 I1. ★★ 负控制①：拆掉 knowers 分派 ⇒ 守密人重新被放行（判据真翻红）', () => {
  const broken = breakOnce(bsSrc, ANCHOR.dispatch, 'const knowers = [];   /* [负控制①] 拆掉知情名单分派 */');
  const pair = loadPair(broken, vcSrc);
  const why = judgeScope(pair.BSx, pair.VCx);
  assert.notEqual(why, '', '★ 拆掉 knowers 分派后判据必须翻红（仍全绿说明判据没碰到这条）');
  assert.match(why, /守密人/, '归因须指向守密人那一格，实为：' + why);
});

test('v3308 I2. ★★ 负控制②：无 viewer 判成「全放行」⇒ 判不了那一档消失（真翻红）', () => {
  const broken = breakOnce(bsSrc, ANCHOR.undecided, 'if (!vName) { visible.push(e); continue; }   /* [负控制②] 不知道看的人是谁就放行 */');
  const pair = loadPair(broken, vcSrc);
  const why = judgeScope(pair.BSx, pair.VCx);
  assert.notEqual(why, '', '★ 把「判不了」放行后判据必须翻红');
  assert.match(why, /无 viewer/, '归因须指向无 viewer 那一格，实为：' + why);
});

test('v3308 I3. ★★ 负控制③：拆掉风险计数 ⇒ 同名异人风险重新变得看不见（真翻红）', () => {
  const broken = breakOnce(bsSrc, ANCHOR.count, '/* [负控制③] 风险计数拆掉 */');
  const pair = loadPair(broken, vcSrc);
  const why = judgeScope(pair.BSx, pair.VCx);
  assert.notEqual(why, '', '★ 拆掉 knowersMatched 后判据必须翻红');
  assert.match(why, /未计数/, '归因须指向计数那一格，实为：' + why);
});

test('v3308 I4. ★★★ 负控制④：拆掉正文剥除 ⇒ 三路读数重新外带正文（真翻红）', () => {
  /* 只破坏 X6 入口剥除（a / b 两行一起拆：`only-in-b` 走 b 侧剥除，只拆一侧判据不翻红）：
   *   X6 两条读数应立刻翻红（X5 侧仍绿 ⇒ 归因必须指向 X6）。 */
  const b1 = breakOnce(bsSrc, ANCHOR.maskA + '\n        ' + ANCHOR.maskB,
    'const ma = { value: aVal, masked: 0 };   /* [负控制④a] 入口剥除拆掉 */\n        const mb = { value: bVal, masked: 0 };');
  const p1 = loadPair(b1, vcSrc);
  const w1 = judgeScope(p1.BSx, p1.VCx);
  assert.notEqual(w1, '', '★ 拆掉 X6 入口剥除后判据必须翻红');
  assert.match(w1, /X6/, '归因须指向 X6，实为：' + w1);
  /* 只破坏 X5 包入口剥除：X5 包 / 提案应翻红。 */
  const b2 = breakOnce(vcSrc, ANCHOR.maskVc, 'const _m = { value: rec.value, masked: 0 };   /* [负控制④b] 包入口剥除拆掉 */');
  const p2 = loadPair(bsSrc, b2);
  const w2 = judgeScope(p2.BSx, p2.VCx);
  assert.notEqual(w2, '', '★ 拆掉 X5 包入口剥除后判据必须翻红');
  assert.match(w2, /X5/, '归因须指向 X5，实为：' + w2);
  /* 只破坏 X5 冲突条入口剥除：X5 冲突条那一条判据应翻红（包/提案仍绿）。 */
  const b3 = breakOnce(vcSrc, 'maskSecretBody(e.value);\n            const _mUnT = maskSecretBody(cur);',
    'e.value;   /* [负控制④c] 冲突条包侧剥除拆掉 */\n            const _mUnT = maskSecretBody(cur);');
  const p3 = loadPair(bsSrc, b3);
  const w3 = judgeScope(p3.BSx, p3.VCx);
  assert.notEqual(w3, '', '★ 拆掉冲突条包侧剥除后判据必须翻红');
  assert.match(w3, /X5/, '归因须指向 X5，实为：' + w3);
});

test('v3308 I5. 破坏必须在**真源码**上生效（锚点恰中 1 次，失配即抛 —— 工具两向自证）', () => {
  let threw = 0;
  try { breakOnce(bsSrc, '这段字面量在源文件里根本不存在', 'x'); } catch (_e) { threw++; }
  assert.equal(threw, 1, '不存在的锚点必须抛（否则「破坏生效」这件事无法自证）');
  let threw2 = 0;
  try { breakOnce(bsSrc, '    function filterByKeeper(entries, viewer) {', 'y'); } catch (_e) { threw2++; }
  assert.equal(threw2, 0, '唯一锚点不得抛（恰中 1 次）');
});

/* ──────────────────────────────────────────────────────────
 * J. 判据纯度 & K. 版本锚
 * ────────────────────────────────────────────────────────── */
test('v3308 J1. 锚点常量统一声明 + 源侧各恰中 1 次（判据不复述字面量）', () => {
  const pick = [ANCHOR.dispatch, ANCHOR.undecided, ANCHOR.count, ANCHOR.maskA, ANCHOR.maskB];
  for (const a of pick) {
    assert.equal(bsSrc.split(a).length - 1, 1, 'X6 锚点在源码里须恰中 1 次：' + a.slice(0, 44));
  }
  assert.equal(vcSrc.split(ANCHOR.maskVc).length - 1, 1, 'X5 包入口锚点须恰中 1 次');
  assert.equal(vcSrc.split(ANCHOR.maskOut).length - 1, 1, 'X5 出口二道闸锚点须恰中 1 次');
  /* 判据纯度：本档内**只声明一次**（出现 >1 次说明判据在复述字面量）。 */
  for (const a of pick) {
    assert.equal(SELF.split(a).length - 1, 1, '锚点字面量在本档内须只声明一次：' + a.slice(0, 44));
  }
});

test('v3308 J2. 版本常量两模块都只有一处定义（防副本漂移）', () => {
  assert.equal(bsSrc.split('const BRANCH_SEMANTICS_VERSION = 3;').length - 1, 1);
  assert.equal(vcSrc.split('const VOLUME_CONTINUATION_VERSION = 3;').length - 1, 1);
  /* 旧值不得残留（同值替换 / 半截抬版会留下两处定义）。 */
  assert.equal(bsSrc.split('const BRANCH_SEMANTICS_VERSION = 2;').length - 1, 0);
  assert.equal(vcSrc.split('const VOLUME_CONTINUATION_VERSION = 2;').length - 1, 0);
});

function vnum(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}
test('v3308 K1. 本档出生版本 = 3.308.0（供版本守卫 V4 计数）', () => {
  const BORN = '3.308.0';
  assert.equal(vnum(BORN), 3308000);
  assert.match(SELF, /v3\.308\.0/, '本档须自述出生版本');
});