/* ============================================================
 * tests/v3320_a_pack_identity_memory_time.test.mjs — [v3.320.0 · A 包 M3-O2/O3/O9]（40 条）
 *
 * 【本套件要证明的是「聊对人、记对事，闪回不改坏当前事实」，不是「函数返回了对象」】
 *   M3-O2 候选保真：候选层的损失无法被后续任何评分挽回 ——
 *      ① 检索面与展示面分离（200 字展示契约不动，检索面保留完整正文）；
 *      ② 远段才出现的关键结论**确实进得了评分**（修前/修后对照，不是断言字符串在场）；
 *      ③ 完整原文不全量注入（证据句按预算取）；
 *      ④ 截断不切断否定与数额（「他不想还钱」截成「他想还钱」是语义反转）；
 *      ⑤ 同一事件的多节点不重复占预算，且**无事件键的节点一律保留**；
 *      ⑥ 不同事件不因同开头合并。
 *   M3-O3 时段身份：
 *      ① 同名异人**不硬合并**，且歧义时候选看得见（读数报 ambiguous 并把候选带出来）；
 *      ② 伪装前后各按当时明面身份 —— 揭穿后才公开的称呼**不得反向泄露到旧楼**
 *         （挡下原因必须报 scope-excluded/reveal，**不得与 no-match 同形**）；
 *      ③ 时段 / 项目 / 分支 / 称呼者四类范围各自可归因；
 *      ④ 代称（她/老师）结合在场者与最近指代生成候选，歧义时返回多条而不是猜一个；
 *      ⑤ 人工绑定与范围**可撤回**（撤回范围 ≠ 删别名，两者分开）；
 *      ⑥ 范围随状态持久化 —— 重开后时段规则仍生效（漏 aliasMeta 就是重开后静默失效）。
 *   M3-O9 时态一致：
 *      ① 「当时住哪」与「现在住哪」得**不同**正确答案；
 *      ② 后补录旧事件不覆盖现状（**读侧**按时序区分；写侧保持既有并存契约一字不动）；
 *      ③ 真判不了先后时**仍 ambiguous**（不替用户裁决）；
 *      ④ 时间未知**不补现实日期**；时间副词压过回忆动词；
 *      ⑤ 信任门槛 / 撤销 / 无区间 各态可分（不得压成一态）；
 *      ⑥ 时态读面**接进注入面**（时段映射用于实际注入，不是只读不用的悬空读面）。
 *
 * 负控制一律：真源码破坏（锚点恰中 1 次）→ 在**破坏副本**上重跑**同款真判据** → 必须现形；
 *   并反向对照「原版同判据必须通过」。
 * 【当版锚点】本档自锚常量 + vnum（锚必须住在当版档案里）。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { breakOnce } from './_break_kit.mjs';
import { stripComments } from './_audit_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const require_ = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const IDX = read('index.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const UR_SRC = read('unified-recall.js');
const AS_SRC = read('ai-select.js');
const ES_SRC = read('entity-semantic.js');
const FV_SRC = read('fact-version.js');
const SELF = read(path.join('tests', 'v3320_a_pack_identity_memory_time.test.mjs'));

/** 在隔离 vm 里加载 IIFE 模块（与生产同形：window 即全局，module 缺席）。 */
function loadIIFE(src, globalName, extra) {
  const ctx = Object.assign({
    console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math,
    isFinite, Infinity, isNaN, Date, Boolean, crypto: undefined
  }, extra || {});
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const api = ctx[globalName];
  if (!api) throw new Error('模块未挂 ' + globalName);
  return api;
}
const LE = require_(path.join(R, 'ledger-entity.js'));
const UR = loadIIFE(UR_SRC, 'LonShaUnifiedRecall');
const AS = loadIIFE(AS_SRC, 'LonShaAISelect');
const ES = loadIIFE(ES_SRC, 'LonShaEntitySemantic');
const FV = loadIIFE(FV_SRC, 'LonShaFactVersion', { LonShaLedgerEntity: LE, module: undefined });

/* ══════════════ 判据（纯函数，供正反两向复用） ══════════════ */

/** M3-O2 判据一：远段结论必须能进评分面，而展示契约不得被放宽。 */
function o2JudgeRecall(ur) {
  const tail = '她终于把那份合同签了';
  const longBody = '第一段描述了天气与街道，' + '第二段继续交代前情往事与无关细节。'.repeat(12) + tail + '。';
  const node = { id: 'n1', type: 'event', name: '那天下午', data: { content: longBody, eventId: 'e1' }, timestamp: 100 };
  const c = ur.nodeToCandidate(node);
  if (!c.searchText || !c.searchText.includes(tail)) throw new Error('候选保真：检索面丢了远段结论（候选层损失无法被后续评分挽回）');
  if (c.content.length > 200) throw new Error('展示契约被放宽：content 超 200 字（' + c.content.length + '）');
  if (c.content.includes(tail)) throw new Error('夹具失效：结论不该出现在 200 字展示摘要里');
  if (!c.sourceRef || !('floor' in c.sourceRef)) throw new Error('候选保真：完整源 ref 缺失（选中后回不到出处）');
  if (!c.indexFields) throw new Error('候选保真：结构化关键字段索引缺失');
  return c;
}

/** M3-O2 判据二：评分面必须真的读到远段结论（修前 0 分 → 修后 > 0）。 */
function o2JudgeScore(as, cand) {
  const q = '那份合同签了吗';
  const now = as.scoreEntry(cand, q, q, q).score;
  const before = as.scoreEntry(Object.assign({}, cand, { searchText: undefined }), q, q, q).score;
  if (!(now > before)) throw new Error('评分面仍读不到远段结论（修后 ' + now + ' 未超过修前 ' + before + '）');
}

/** M3-O2 判据三：证据句按预算取，且不切断否定与数额。 */
function o2JudgeEvidence(ur) {
  const ev = ur.extractEvidenceSentences('甲说过一句无关的话。他不想还那笔钱，一直拖着不办。他欠了亲戚三百五十万块钱至今未还。', '钱', { budget: 2 });
  if (!ev.sentences.length || ev.sentences.length > 2) throw new Error('证据句未按预算取（' + ev.sentences.length + '）');
  if (ev.dropped !== Math.max(0, ev.total - ev.sentences.length)) throw new Error('证据句有损无计数');
  if (/[0-9]$/.test(ev.text)) throw new Error('数额被截断（半截数字，信息变错比不记更糟）');
  const neg = ur.extractEvidenceSentences('他不想还那笔钱，一直拖着不办。', '钱', { budget: 1, maxLen: 6 });
  if (neg.text.includes('他想还') && !neg.text.includes('不想')) throw new Error('否定被截断读反（语义反转）');
}

/** M3-O2 判据四：事件级去重 —— 同事件只留一条、无键项一律保留、读数可归因。 */
function o2JudgeDedupe(ur) {
  const list = [
    { id: 'a', score: 9, updatedAt: 10, sourceRef: { eventId: 'ev1' } },
    { id: 'b', score: 5, updatedAt: 20, sourceRef: { eventId: 'ev1' } },
    { id: 'c', score: 7, updatedAt: 30, sourceRef: { eventId: 'ev2' } },
    { id: 'd', score: 1, updatedAt: 40, sourceRef: {} },
    { id: 'e', score: 1, updatedAt: 41, sourceRef: { eventId: 'ev3' } }
  ];
  const carry = {};
  const kept = ur.dedupeByEvent(list, {}, carry);
  if (kept.filter(x => x.sourceRef.eventId === 'ev1').length !== 1) throw new Error('同一事件多节点重复占预算');
  if (!kept.some(x => x.id === 'a') || kept.some(x => x.id === 'b')) throw new Error('去重未留下更优的那条');
  if (!kept.some(x => x.id === 'd')) throw new Error('无事件键的节点被丢了（「没有键」不等于「同一件事」）');
  if (!kept.some(x => x.id === 'e')) throw new Error('不同事件因同开头被合并');
  if (carry.evDropped !== 1 || carry.evNoKey !== 1) throw new Error('去重读数不可归因：' + JSON.stringify(carry));
}

/** M3-O3 判据一：同名不硬合并 + 歧义可见 + 别名限定可唯一。 */
function o3JudgeSameName(es) {
  const r = es.createRegistry({ normalizeMatch: true });
  const a1 = r.upsertEntity({ kind: 'person', name: '周砚', aliases: ['教书的周砚'] });
  r.upsertEntity({ kind: 'person', name: '周砚', aliases: ['经商的周砚'] });
  const c = {};
  const hit = r.resolveEntityAt('person', '周砚', {}, c);
  if (hit !== null) throw new Error('同名异人被硬合并成了一个实体');
  if (c.entityResolveAt.miss !== 'ambiguous') throw new Error('歧义读数错：' + c.entityResolveAt.miss);
  if (c.entityCandidates.candidates.length !== 2) throw new Error('歧义候选没带出来（调用方无从展示重名）');
  const one = r.resolveEntityAt('person', '教书的周砚', {}, {});
  if (!one || one.id !== a1.id) throw new Error('别名限定后未唯一命中');
}

/** M3-O3 判据二：揭穿不反向泄露 —— 旧楼挡下且原因报 reveal，与 no-match 可分。 */
function o3JudgeReveal(es) {
  const r = es.createRegistry({ normalizeMatch: true });
  r.upsertEntity({ kind: 'person', name: '珞珈', aliases: ['珞花'] });
  r.markReveal('person', '珞花', 50);
  const cold = {};
  if (r.resolveEntityAt('person', '珞花', { at: 20 }, cold) !== null) throw new Error('揭穿后的称呼泄露到了旧楼');
  if (cold.entityResolveAt.miss !== 'scope-excluded' || cold.entityResolveAt.blockedBy !== 'reveal') {
    throw new Error('挡下原因未报 reveal，与 no-match 同形了：' + cold.entityResolveAt.miss + '/' + cold.entityResolveAt.blockedBy);
  }
  if (r.resolveEntityAt('person', '珞花', { at: 60 }, {}) === null) throw new Error('揭穿后当下仍不可用（过度拦截）');
  const cnever = {};
  r.resolveEntityAt('person', '查无此人', {}, cnever);
  if (cnever.entityResolveAt.miss !== 'no-match') throw new Error('真正没登记的名字未报 no-match（两态压成一态）');
}

/** M3-O3 判据三：四类范围各自可归因 + 未给上下文不挡 + 撤回可用 + 持久化。 */
function o3JudgeScope(es) {
  const r = es.createRegistry({ normalizeMatch: true });
  r.upsertEntity({ kind: 'person', name: '王玉兰', aliases: ['小王'] });
  r.setAliasScope('person', '小王', { from: 100, to: 200, project: 'p1' });
  if (r.resolveEntityAt('person', '小王', { at: 50, project: 'p1' }, {}) !== null) throw new Error('早于 from 未挡');
  if (r.resolveEntityAt('person', '小王', { at: 200, project: 'p1' }, {}) !== null) throw new Error('晚于 to 未挡');
  if (r.resolveEntityAt('person', '小王', { at: 150, project: 'p1' }, {}) === null) throw new Error('区间内被误挡');
  const cproj = {};
  if (r.resolveEntityAt('person', '小王', { at: 150, project: 'p2' }, cproj) !== null
    || cproj.entityResolveAt.blockedBy !== 'project') {
    throw new Error('跨项目未挡或原因不可归因：' + cproj.entityResolveAt.blockedBy);
  }
  if (r.resolveEntityAt('person', '小王', {}, {}) === null) throw new Error('未给上下文时不该挡（零影响既有调用）');
  if (!r.listAliasScopes('person').length) throw new Error('范围列举为空');
  // 撤回范围 ≠ 删别名：撤回范围后别名仍在，只是不再受时段约束
  if (!r.removeAliasScope('person', '小王').ok) throw new Error('撤回范围失败');
  if (r.listAliasScopes('person').length !== 0) throw new Error('撤回范围后范围列表未清空');
  if (r.resolveAll('person', '小王').length !== 1) throw new Error('撤回范围不等于删别名（别名应仍在）');
  if (!r.removeAlias('person', '小王').ok || r.resolveAll('person', '小王').length !== 0) throw new Error('撤回别名失败');
  if (r.removeAlias('person', '小王').reason !== 'alias-not-found') throw new Error('重复撤回未报 alias-not-found');
  // 持久化：范围必须随状态往返（漏 aliasMeta = 重开后静默失效）
  const r2 = es.createRegistry({ normalizeMatch: true });
  r2.upsertEntity({ kind: 'person', name: '阿黎', aliases: ['黎黎'] });
  r2.setAliasScope('person', '黎黎', { revealAfter: 80 });
  const st = r2.exportState();
  if (!st.entities[0].aliasMeta || Object.keys(st.entities[0].aliasMeta).length !== 1) throw new Error('exportState 未带 aliasMeta');
  const r3 = es.createRegistry({ normalizeMatch: true });
  r3.importState(st);
  const c9 = {};
  if (r3.resolveEntityAt('person', '黎黎', { at: 10 }, c9) !== null || c9.entityResolveAt.blockedBy !== 'reveal') {
    throw new Error('重开后时段规则静默失效（遮蔽规则没随状态往返）');
  }
  if (r3.resolveEntityAt('person', '黎黎', { at: 100 }, {}) === null) throw new Error('重开后当下不可用');
}

/** M3-O3 判据四：代称结合在场与最近指代；歧义时返回多条而不是猜一个。 */
function o3JudgeReferent(es) {
  const r = es.createRegistry({ normalizeMatch: true });
  const q1 = r.upsertEntity({ kind: 'person', name: '绫地宁宁' });
  const q2 = r.upsertEntity({ kind: 'person', name: '周砚' });
  const refs = r.referentCandidates('person', '她', { present: ['绫地宁宁'], lastMention: '周砚' });
  if (refs.length !== 2) throw new Error('在场者与最近指代未同时进候选（' + refs.length + '）');
  if (refs[0].id !== q1.id) throw new Error('在场者未优先于仅最近提到者');
  const one = r.referentCandidates('person', '她', { present: ['周砚'] });
  if (one.length !== 1 || one[0].id !== q2.id) throw new Error('只按在场者筛应得单条');
}

/** M3-O9 判据一：当时与现在得不同正确答案。 */
function o9JudgeThenNow(fv) {
  const mk = () => ({ version: 1, seq: 0, facts: [] });
  let st = mk();
  st = fv.assertFact(st, { subject: '林安安', predicate: '居住', value: '北京', from: 10, to: 100, origin: 'stated' }).state;
  st = fv.assertFact(st, { subject: '林安安', predicate: '居住', value: '上海', from: 100, origin: 'stated' }).state;
  const now = fv.readAt(st, null).rows.find(r => r.predicate === '居住');
  if (now.state !== 'current' || now.value !== '上海') throw new Error('现在未取到当前值：' + now.state + '/' + now.value);
  const then = fv.readAt(st, 50).rows.find(r => r.predicate === '居住');
  if (then.state !== 'historical' || then.value !== '北京') throw new Error('当时未取到历史值：' + then.state + '/' + then.value);
}

/** M3-O9 判据二：后补录旧事件不覆盖现状（读侧时序区分 + 旧事仍可查）。 */
function o9JudgeBackfill(fv) {
  const mk = () => ({ version: 1, seq: 0, facts: [] });
  let st = mk();
  st = fv.assertFact(st, { subject: '王玉兰', predicate: '居住', value: '上海', from: 100, origin: 'stated' }).state;
  const r = fv.assertFact(st, { subject: '王玉兰', predicate: '居住', value: '北京', from: 5, origin: 'stated' });
  st = r.state;
  if (r.superseded.length !== 0) throw new Error('写侧既有并存契约被改动（superseded=' + r.superseded.length + '）');
  const row = fv.readAt(st, null).rows.find(x => x.predicate === '居住');
  if (row.state !== 'current' || row.value !== '上海') throw new Error('后补旧事覆盖了现状：' + row.state + '/' + row.value);
  if (!Array.isArray(row.staleOpen) || row.staleOpen.length !== 1 || row.staleOpen[0].value !== '北京') {
    throw new Error('更早那条未进 staleOpen（静默丢弃）');
  }
  const back = fv.readAt(st, 50).rows.find(x => x.predicate === '居住');
  if (back.value !== '北京') throw new Error('回看旧时点查不到旧事（旧事被删或被当现状）');
  // 真判不了先后 ⇒ 仍 ambiguous（不硬裁决）
  let st2 = mk();
  st2 = fv.assertFact(st2, { subject: '甲', predicate: '持有', value: '剑', origin: 'stated' }).state;
  st2 = fv.assertFact(st2, { subject: '甲', predicate: '持有', value: '刀', origin: 'stated' }).state;
  const row2 = fv.readAt(st2, null).rows.find(x => x.predicate === '持有');
  if (row2.state !== 'ambiguous' || row2.values.length !== 2) throw new Error('判不了先后时被硬裁决了：' + row2.state);
}

/** M3-O9 判据三：意图解析 —— 不补现实日期；时间副词压过回忆动词；各态可分。 */
function o9JudgeIntent(fv) {
  const cases = [
    ['她当时住在哪里', 'then', '当时'],
    ['她现在住哪里', 'now', '现在'],
    ['我记得她以前说话很轻', 'then', '以前'],
    ['她想起那年冬天的事', 'flashback', '想起'],
    ['她现在还记得那件事吗', 'now', '现在'],
    ['那份合同签了吗', 'unspecified', '']
  ];
  for (const [text, wantIntent, wantCue] of cases) {
    const it = fv.classifyIntent(text);
    if (it.intent !== wantIntent) throw new Error('意图判错「' + text + '」→ ' + it.intent + '（应 ' + wantIntent + '）');
    if (wantCue && it.cue !== wantCue) throw new Error('线索词判错「' + text + '」→ ' + it.cue);
  }
  const t1 = fv.classifyIntent('她当时住在哪里');
  if (t1.at !== null) throw new Error('时间未知时补了现实日期');
  if (t1.unknownTime !== true) throw new Error('时间未知未标 unknownTime');
  const t2 = fv.classifyIntent('第 42 楼那天发生了什么');
  if (t2.intent !== 'then' || t2.at !== 42) throw new Error('显式楼层未解析');
}

/** M3-O9 判据四：信任门槛 / 撤销 / 无区间 / 计数穷尽 各态可分。 */
function o9JudgeStates(fv) {
  const mk = () => ({ version: 1, seq: 0, facts: [] });
  let a = mk();
  a = fv.assertFact(a, { subject: '乙', predicate: '在', value: '家', origin: 'inferred' }).state;
  if (fv.readAt(a, null).rows[0].state !== 'none-trusted') throw new Error('模型推测未按信任门槛挡下');
  let b = mk();
  b = fv.assertFact(b, { subject: '丙', predicate: '在', value: '家', origin: 'stated' }).state;
  b = fv.revokeFact(b, { id: b.facts[0].id, reason: '记错了' }).state;
  if (fv.readAt(b, null).rows[0].state !== 'none-revoked') throw new Error('全撤销未报 none-revoked');
  let c = mk();
  c = fv.assertFact(c, { subject: '丁', predicate: '在', value: '家', origin: 'stated' }).state;
  const r = fv.readAt(c, 99);
  if (r.rows[0].state !== 'unversioned') throw new Error('无区间账按时点查未报 unversioned（冒充了当时）');
  const sum = Object.values(r.counts).reduce((x, y) => x + y, 0);
  if (sum !== r.rows.length) throw new Error('状态计数不穷尽（' + sum + ' ≠ ' + r.rows.length + '）');
  // resolveQuery 端到端
  let d = mk();
  d = fv.assertFact(d, { subject: '戊', predicate: '居住', value: '上海', from: 100, origin: 'stated' }).state;
  d = fv.assertFact(d, { subject: '戊', predicate: '居住', value: '北京', from: 5, origin: 'stated' }).state;
  const rq = fv.resolveQuery(d, '她现在住哪');
  if (rq.intent !== 'now' || rq.rows.find(x => x.predicate === '居住').value !== '上海') throw new Error('resolveQuery 未按意图取当下');
  const rq2 = fv.resolveQuery(d, '她当时住哪', { at: 50 });
  if (rq2.intent !== 'then' || rq2.rows.find(x => x.predicate === '居住').value !== '北京') throw new Error('resolveQuery 未按意图取当时');
}

/* ══════════════ A. 结构面 ══════════════ */
test('v3320 A1. 候选保真：三处导出与接线在位（不是「模块里有这个名字」）', () => {
  for (const n of ['extractEvidenceSentences', 'dedupeByEvent', 'nodeToCandidate', 'graphToCandidates']) {
    assert.equal(typeof UR[n], 'function', 'unified-recall 缺 ' + n);
  }
  assert.ok(AS_SRC.includes('entry.searchText'), 'ai-select 未把检索面接进词项命中判定');
  assert.ok(IDX.includes('dedupeByEvent'), '宿主未接事件级去重');
  assert.ok(IDX.includes('extractEvidenceSentences'), '宿主未接证据句（完整原文不全量注入）');
  const code = stripComments(UR_SRC);
  assert.ok(code.includes('SEARCH_TEXT_MAX'), '检索面上限常量缺位');
  assert.ok(code.includes('NEGATION_RE') && code.includes('AMOUNT_RE'), '保护面判据缺位');
});

test('v3320 A2. 时段身份：范围/代称/撤回/揭穿四组入口全在位', () => {
  const r = ES.createRegistry();
  for (const n of ['setAliasScope', 'removeAliasScope', 'removeAlias', 'listAliasScopes',
    'markReveal', 'candidatesFor', 'resolveEntityAt', 'referentCandidates']) {
    assert.equal(typeof r[n], 'function', 'entity-semantic 缺 ' + n);
  }
  // aliases 形状不得被改动（既有调用方与 exportState 都吃字符串数组）
  const e = r.upsertEntity({ kind: 'person', name: '甲', aliases: ['乙'] });
  assert.ok(Array.isArray(e.aliases) && typeof e.aliases[0] === 'string', 'aliases 形状被改了（应为字符串数组）');
  assert.ok(ES_SRC.includes('aliasMeta'), '范围存储位缺位');
});

test('v3320 A3. 时态一致：写侧契约不动 + 读侧新面 + 注入面接线', () => {
  for (const n of ['readAt', 'classifyIntent', 'resolveQuery']) {
    assert.equal(typeof FV[n], 'function', 'fact-version 缺 ' + n);
  }
  // 跨 vm realm 的数组原型不同，deepEqual 会误报；逐字比序列化形式
  assert.equal(JSON.stringify(FV.TIME_STATES),
    JSON.stringify(['current', 'historical', 'ambiguous', 'none-at', 'unversioned', 'none-trusted', 'none-revoked']),
    '时态词表逐字');
  const code = stripComments(FV_SRC);
  assert.ok(IDX.includes('gatedStale'), 'stale 过滤未接进注入面（时段映射未用于实际注入）');
  assert.ok(IDX.includes('timeRead') && IDX.includes('queryIntent') && IDX.includes('resolveFactsByTime'),
    '时态读面的宿主出口缺位');
  // 写侧一字不动：auto 的换代判定必须是原始形态
  assert.ok(code.includes('allSequenced = differing.length > 0 && newFrom != null'), 'auto 换代判定被改动（既有锁定契约）');
  assert.ok(!code.includes('backfilledTo'), '写侧被插入了 backfill 逻辑（应只改读侧）');
});

/* ══════════════ B. 行为面 ══════════════ */
test('v3320 B1. ★ 远段关键结论进得了评分面（修前/修后对照）', () => {
  const c = o2JudgeRecall(UR);
  o2JudgeScore(AS, c);
});

test('v3320 B2. ★ 展示契约不被放宽（内容 200 字 / secondary 默认 8 条）', () => {
  const c = o2JudgeRecall(UR);
  assert.equal(c.content.length <= 200, true);
  const big = { id: 'n', type: 'event', name: '长', data: { content: Array.from({ length: 30 }, (_, i) => '第' + (i + 1) + '个独立短语内容').join('。') }, timestamp: 1 };
  assert.ok(UR.nodeToCandidate(big).keys.secondary.length <= 8, '默认 secondary 条数被放宽（既有契约）');
  assert.ok(UR.nodeToCandidate(big, { maxSecondaryKeys: 32 }).keys.secondary.length > 8, '放宽通道未生效');
});

test('v3320 B3. ★ 证据句按预算取 + 不切断否定与数额 + 有损必有计', () => {
  o2JudgeEvidence(UR);
});

test('v3320 B4. ★ 事件级去重：同事件不重复占预算、无键项保留、不同事件不合并', () => {
  o2JudgeDedupe(UR);
});

test('v3320 B5. ★ 同名异人不硬合并，且歧义时候选看得见', () => {
  o3JudgeSameName(ES);
});

test('v3320 B6. ★★ 揭穿不反向泄露到旧楼（挡下原因报 reveal，与 no-match 可分）', () => {
  o3JudgeReveal(ES);
});

test('v3320 B7. ★★ 四类范围各自可归因 + 可撤回 + 随状态持久化', () => {
  o3JudgeScope(ES);
});

test('v3320 B8. ★ 代称结合在场与最近指代；歧义时返回多条而不是猜一个', () => {
  o3JudgeReferent(ES);
});

test('v3320 B9. ★★ 当时与现在得不同正确答案', () => {
  o9JudgeThenNow(FV);
});

test('v3320 B10. ★★ 后补录旧事件不覆盖现状（写侧契约不动，读侧区分）', () => {
  o9JudgeBackfill(FV);
});

test('v3320 B11. ★ 意图解析：不补现实日期 + 时间副词压过回忆动词', () => {
  o9JudgeIntent(FV);
});

test('v3320 B12. ★ 信任门槛 / 撤销 / 无区间 / 计数穷尽 各态可分', () => {
  o9JudgeStates(FV);
});

/* ══════════════ C. 接线面 ══════════════ */
test('v3320 C1. 宿主 buildAliasMap 保持无参签名（花括号计数式提取门依赖它）', () => {
  assert.ok(IDX.includes('buildAliasMap() {'), 'buildAliasMap 签名被改动（v390_alias 的 extractMethod marker 会失效）');
  assert.ok(IDX.includes('_aliasMapAt'), '时段过滤未接（揭穿不反向泄露在查询侧未生效）');
  // 方法体内不得出现裸花括号字面量（花括号计数会被带偏）
  const start = IDX.indexOf('buildAliasMap() {');
  const bodyStart = IDX.indexOf('{', start);
  let depth = 0, end = -1;
  for (let i = bodyStart; i < IDX.length; i++) {
    if (IDX[i] === '{') depth++;
    else if (IDX[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = IDX.slice(start, end + 1);
  assert.ok(body.length > 200, '方法体提取异常（长度 ' + body.length + '）');
  assert.ok(body.includes('_scopeOf'), '方法体提取被注释里的裸花括号带偏（提取到的不是完整方法体）');
});

test('v3320 C2. 注入面与查询面共用同一份时序判据（不在宿主再写一遍）', () => {
  const code = stripComments(IDX);
  assert.ok(code.includes('FVt.readAt'), '注入面未复用 readAt（会漂移成两套时间口径）');
  assert.ok(code.includes('staleIds'), 'stale 集合未构造');
  // 注入面不得自己写「from 比较」的时序规则
  const seg = code.slice(code.indexOf('staleIds'), code.indexOf('staleIds') + 900);
  assert.ok(!/Math\.max\([^)]*from/.test(seg), '注入面自己写了一套时序规则（第二份真源）');
});

test('v3320 C3. 裸 engine 容灾：宿主成员缺席时按「未给时点」处理而不是抛', () => {
  const engine = {
    config: { config: { aliasQueryExpansion: true } }, graph: null,
    buildAliasMap: null, extractCharactersFromContext: () => []
  };
  // 直接取方法体在裸 engine 上跑一遍（与 v390_alias 同口径）
  const marker = 'buildAliasMap() {';
  const start = IDX.indexOf(marker);
  const bodyStart = IDX.indexOf('{', start);
  let depth = 0, end = -1;
  for (let i = bodyStart; i < IDX.length; i++) {
    if (IDX[i] === '{') depth++;
    else if (IDX[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const src = IDX.slice(start, end + 1);
  const obj = new Function('errLog', 'return ({ ' + src + ' });')(() => {});
  const m = obj.buildAliasMap.call(engine);
  assert.ok(m instanceof Map && m.size === 0, '裸 engine 上未容灾（应返回空 Map）');
});

/* ══════════════ D. 负控制（真源码破坏 → 破坏副本上重跑同款判据） ══════════════ */
const broken = (src, anchor, replacement) => breakOnce(src, anchor, replacement);

test('v3320 D1. ★★★ 破坏 M3-O2 检索面（searchText 退回 200 字）⇒ B1 判据必须转红', () => {
  const bad = broken(UR_SRC, '_trunc(_fullSearchRaw, SEARCH_TEXT_MAX)',
'_trunc(_fullSearchRaw, 200)');
  const UR2 = loadIIFE(bad, 'LonShaUnifiedRecall');
  let threw = false, msg = '';
  try { o2JudgeRecall(UR2); } catch (e) { threw = true; msg = String(e.message || e); }
  assert.ok(threw, '检索面退回 200 字后判据必须转红（否则这条门是空转）');
  assert.match(msg, /检索面丢了远段结论/);
  o2JudgeRecall(UR);   // 反向对照：原版同判据必须过
});

test('v3320 D2. ★★★ 破坏 M3-O3 揭穿挡下（去掉 reveal 判定）⇒ B6 判据必须转红', () => {
  const bad = broken(ES_SRC, 'if (meta.revealAfter != null && at < Number(meta.revealAfter)) return { ok: false, blockedBy: \'reveal\' };',
    'if (false) return { ok: false, blockedBy: \'reveal\' };');
  const ES2 = loadIIFE(bad, 'LonShaEntitySemantic');
  let threw = false, msg = '';
  try { o3JudgeReveal(ES2); } catch (e) { threw = true; msg = String(e.message || e); }
  assert.ok(threw, '揭穿判定被拆除后判据必须转红（否则「不反向泄露」这条门是空转）');
  assert.match(msg, /泄露|reveal|scope-excluded/);
  o3JudgeReveal(ES);
});

test('v3320 D3. ★★★ 破坏 M3-O3 持久化（exportState 漏 aliasMeta）⇒ B7 判据必须转红', () => {
  const bad = broken(ES_SRC, '                    aliasMeta: { ...(e.aliasMeta || {}) },', '                    aliasMeta: {},');
  const ES2 = loadIIFE(bad, 'LonShaEntitySemantic');
  let threw = false, msg = '';
  try { o3JudgeScope(ES2); } catch (e) { threw = true; msg = String(e.message || e); }
  assert.ok(threw, 'aliasMeta 丢失后判据必须转红（否则「重开后静默失效」抓不住）');
  assert.match(msg, /aliasMeta|静默失效/);
  o3JudgeScope(ES);
});

test('v3320 D4. ★★★ 破坏 M3-O9 读侧时序（stale 与 live 不区分）⇒ B10 判据必须转红', () => {
  const bad = broken(FV_SRC, '            if (q == null && uniq.length > 1) {', '            if (false) {');
  const FV2 = loadIIFE(bad, 'LonShaFactVersion', { LonShaLedgerEntity: LE, module: undefined });
  let threw = false, msg = '';
  try { o9JudgeBackfill(FV2); } catch (e) { threw = true; msg = String(e.message || e); }
  assert.ok(threw, 'stale 区分被拆除后判据必须转红（否则「后补录覆盖现状」抓不住）');
  assert.match(msg, /覆盖了现状|staleOpen/);
  o9JudgeBackfill(FV);
});

test('v3320 D5. ★★ 破坏 M3-O9 意图优先级（回忆词压过时间副词）⇒ B11 判据必须转红', () => {
  const bad = broken(FV_SRC, "    else if (then) { intent = 'then'; cue = then; }\n    else if (now) { intent = 'now'; cue = now; }\n    else if (fb) { intent = 'flashback'; cue = fb; }",
    "    else if (fb) { intent = 'flashback'; cue = fb; }\n    else if (then) { intent = 'then'; cue = then; }\n    else if (now) { intent = 'now'; cue = now; }");
  const FV2 = loadIIFE(bad, 'LonShaFactVersion', { LonShaLedgerEntity: LE, module: undefined });
  let threw = false, msg = '';
  try { o9JudgeIntent(FV2); } catch (e) { threw = true; msg = String(e.message || e); }
  assert.ok(threw, '优先级错序后判据必须转红');
  assert.match(msg, /意图判错/);
  o9JudgeIntent(FV);
});

test('v3320 D6. ★★ 破坏 M3-O2 事件去重的无键保留 ⇒ B4 判据必须转红', () => {
  const bad = broken(UR_SRC, '    if (!k) { noKey.push(c); continue; }', '    if (!k) { continue; }');
  const UR2 = loadIIFE(bad, 'LonShaUnifiedRecall');
  let threw = false, msg = '';
  try { o2JudgeDedupe(UR2); } catch (e) { threw = true; msg = String(e.message || e); }
  assert.ok(threw, '无键项被丢弃后判据必须转红（否则「没有键 ≠ 同一件事」抓不住）');
  assert.match(msg, /无事件键的节点被丢了/);
  o2JudgeDedupe(UR);
});

/* ══════════════ E. 版本锚 ══════════════ */
const vnum = (s) => { const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s).trim()); return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN; };
const BORN = '3.320.0';
test('v3320 E1. ★★★ 版本锚：本档出生版本 + 六源同源（V4 当版锚点形态）', () => {
  assert.equal(vnum(BORN), 3320000, 'vnum 序数必须可数（当版锚点）');
  const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
  assert.ok(codeVer, '入口版本常量必须在场');
  assert.ok(vnum(codeVer) >= vnum(BORN), '本套件只在 ' + BORN + ' 及以后成立；当前 ' + codeVer);
  assert.equal(MF.version, codeVer, 'manifest 与入口同源');
  assert.equal(PKG.version, codeVer, 'package.json 与入口同源');
  for (const m of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
    const mv = (/let VERSION = '([^']+)'/.exec(read(m)) || [])[1];
    assert.equal(mv, codeVer, m + ' 副本须与入口同源（须是 let：bindDeps 可换，const 会 TypeError）');
  }
  assert.ok(SELF.includes("const BORN = '3.320.0'"), '当版锚点必须显式留在本档里');
  assert.equal(SELF.includes('vnum(BORN)'), true, '锚形须可被守卫计数');
});
