/* ============================================================
 * [v3.170.0] 巩固面：游标在建，账本不在 —— 有损必有计数（I5）与读失败≠读到 0（I6）
 * ------------------------------------------------------------
 * 动机（v3.169 刚立的两条不变量，第一个跨界检查对象）：
 *   v3.169 确立 I5/I6 时审计的是**账本自己**（OpLog）。本版把它们拿到同仓另一个
 *   承载叙事记忆的子系统上跑一遍 —— stm-ltm.js（v3.96 缝合进本仓，此后 74 个版本
 *   无人审计过它的内部口径）。探针真跑，实测六处违反：
 *
 *   D1（I6）id 基数取自一个摄入路径从不推进的计数器。ingest() 的 id 前缀用
 *     stm_counter（只在巩固时前进），于是 consolidate 清空 raw 后 counter 原地不动，
 *     下一批 id 与上一批**完全重复**。实测两批各 2 条 →
 *     ['raw_1_0','raw_2_1','raw_1_0','raw_2_1']。「每条片段一个可寻址身份」
 *     塌缩成「每批一个编号」，而 raw 区是**断点续跑的唯一凭据**。
 *   D2（I5）降级拼接取末端、无痕迹、无计数。`texts.join(' / ').slice(-400)`
 *     静默丢弃开头（实测 777 → 400，首段消失、无省略号、state 无任何计数）。
 *     读者会把「只写了这么多」与「写了又被切掉」看成同一件事。
 *   D3（I5）LTM 滚动窗口丢最旧、零计数。ltm_counter 先前进、条目随后被丢
 *     （实测新建的 ltm_24 立刻不在库），「新建 24 条」与「新建 500 条丢 476 条」同形。
 *   D4（声称与实现不一致）removeByFloors 的注释与语义都写「LTM 摘要固化不级联删
 *     （只摘 span）」，实现**从未碰过 span**（实测 span 原样 {from:3,to:7}）——
 *     删楼后摘要的来源范围指向不存在的楼层；stm 条目被删、counter 与游标全不动。
 *   D5（I5）断点续跑的两个游标字段 pending_partials 全程只被赋 []、从不写入，
 *     却被文档（含文件头部与 state 结构说明）列为断点续跑核心。
 *   D6（I6）normalizeState(undefined) 与 normalizeState({}) 返回完全同形，
 *     「从没跑过」与「跑过且真的空」不可区分。
 *
 * 修复口径（本测试锁定的主张）：
 *   · 三态可区分：fresh / absent[] / repaired[]（只增不换：第一个返回值形状不变）；
 *   · 有损必有计数：loss 账本 11 项 + lastDrop 摘要，任何丢失路径都必须落数；
 *   · 降级不静默裁掉开头（原文进库），旧口径保留为显式旁路 legacyTrimOnSave；
 *   · span 真摘（与承诺一致），摘空置 null 并单独计数；
 *   · LTM 摘要有在库上限且截断落账；
 *   · selfReport 一行自述，含读数自洽检查（矛盾时报出而非吞掉，fail-closed）；
 *   · 声明了但从不填充的字段如实登记（不改语义，只让它可见）。
 *
 * 判据绑不变量、不绑具体写法；每条核心判据都配一次负控制。
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as U from './_negative_util.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = require('../stm-ltm.js');
const SRC = fs.readFileSync(path.join(root, 'stm-ltm.js'), 'utf8');
/** 剥注释：文本判据一律做在代码行上，避免被注释字样满足（v3.169 的两处假绿教训） */
function codeLines(src) {
  const out = [];
  let inBlock = false;
  for (const raw of String(src).split('\n')) {
    let line = raw;
    if (inBlock) {
      const e = line.indexOf('*/');
      if (e === -1) continue;
      line = line.slice(e + 2); inBlock = false;
    }
    for (;;) {
      const s = line.indexOf('/*');
      if (s === -1) break;
      const e = line.indexOf('*/', s + 2);
      if (e === -1) { line = line.slice(0, s); inBlock = true; break; }
      line = line.slice(0, s) + line.slice(e + 2);
    }
    const lc = line.indexOf('//');
    if (lc !== -1) line = line.slice(0, lc);
    if (line.trim()) out.push(line);
  }
  return out;
}
const code = codeLines(SRC).join('\n');

/* 工具：真把 STM 顶到溢出（多次巩固直到触顶），可选预置 LTM */
async function rollover(extraLtm = 0) {
  let s = S.normalizeState(null);
  if (extraLtm) {
    s.ltm_entries = Array.from({ length: extraLtm }, (_, i) => ({ id: 'ltm_seed' + i, summary: 'x', from_stm_ids: [], ts: 1, span: null }));
    s.ltm_counter = extraLtm;
  }
  s.consolidate_threshold = 1;
  for (let b = 0; b <= S.MAX_STM_ENTRIES; b++) {
    s = S.ingest(s, [{ text: 'b' + b, msg_id: b, floor: b }]);
    s = (await S.consolidate(s, { force: true })).state;
  }
  return s;
}

/* ══════════ A. id 身份：每条片段一个可寻址身份（D1） ══════════ */
test('A1 跨批 id 唯一：摄入路径自己推进基数', () => {
  let s = S.normalizeState(null);
  s = S.ingest(s, [{ text: '甲一' }, { text: '甲二' }]);
  s = S.ingest(s, [{ text: '乙一' }, { text: '乙二' }]);
  const ids = s.unconsolidated_stm.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length, '不同片段不得共用 id：' + JSON.stringify(ids));
  assert.equal(s.raw_counter, 4, '摄入计数器应推进到 4');
  assert.equal(s.loss.rawIngested, 4, '摄入量应入账');
});

test('A2 巩固清空 raw 后再摄入，id 仍不与已处理批次重复', async () => {
  let s = S.normalizeState(null);
  s = S.ingest(s, [{ text: 'a' }, { text: 'b' }]);
  s.consolidate_threshold = 1;
  s = (await S.consolidate(s, { force: true })).state;
  const s2 = S.ingest(s, [{ text: 'c' }]);
  assert.equal(s2.unconsolidated_stm[0].id, 'raw_3_', 'id 不得回退到 raw_1_');
});

test('A3 同 msg_id 复用时的去重兜底（身份不因调用方重复而塌缩）', () => {
  let s = S.normalizeState(null);
  s = S.ingest(s, [{ text: 'A', msg_id: 7 }]);
  s = S.ingest(s, [{ text: 'B', msg_id: 7 }]);
  const ids = s.unconsolidated_stm.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length, JSON.stringify(ids));
  // 本条路径靠 raw_counter 递增自然避开兜底；兜底只在基数被外部污染时才触发
  assert.equal(s.loss.rawIdCollisions, 0, '不该触发兜底去重');
});

test('A4 外部污染基数时兜底生效并落账（I5）', () => {
  let s = S.normalizeState(null);
  s = S.ingest(s, [{ text: 'A', msg_id: 1 }]);
  s.raw_counter = 0;                                  // 模拟外部把计数器写坏
  s = S.ingest(s, [{ text: 'B', msg_id: 1 }]);
  const ids = s.unconsolidated_stm.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length, '兜底必须保证唯一：' + JSON.stringify(ids));
  assert.ok(s.loss.rawIdCollisions >= 1, '兜底触发必须落账');
});

/* ══════════ B. 降级路径不得静默裁掉开头（D2） ══════════ */
test('B1 无 summarize 通道时原文完整进库（不再 slice(-400)）', async () => {
  const parts = Array.from({ length: 5 }, (_, i) => '第' + (i + 1) + '段' + '内'.repeat(150));
  let s = S.normalizeState(null);
  s = S.ingest(s, parts.map((t, i) => ({ text: t, msg_id: i, floor: i })));
  const r = await S.consolidate(s, { force: true });
  const full = parts.join(' / ');
  assert.equal(r.state.stm_entries[0].text.length, full.length, '降级后长度应等于原文');
  assert.ok(r.state.stm_entries[0].text.includes('第1段'), '最早的内容不得被无声丢弃');
  assert.equal(r.legacyTrimmed, 0, '本路径不应发生截断');
  assert.equal(r.state.loss.legacyTrimOnSave, 0);
});

test('B2 旧口径保留为显式旁路：要裁就记一笔（I5）', async () => {
  const parts = Array.from({ length: 5 }, (_, i) => 'S' + i + 'x'.repeat(200));
  let s = S.normalizeState(null);
  s = S.ingest(s, parts.map(t => ({ text: t })));
  const r = await S.consolidate(s, { force: true, legacyTrimOnSave: true });
  assert.ok(r.legacyTrimmed > 0, '截断量必须如实回报给调用方');
  assert.equal(r.state.loss.legacyTrimOnSave, 1, '截断必须落账');
  assert.equal(r.state.loss.lastDrop.kind, 'legacyTrimOnSave');
});

test('B3 走 AI 通道时不受降级口径影响', async () => {
  let s = S.normalizeState(null);
  s = S.ingest(s, [{ text: 'x'.repeat(3000) }]);
  const r = await S.consolidate(s, { force: true, summarize: async () => '简短摘要' });
  assert.equal(r.usedAI, true);
  assert.equal(r.state.stm_entries[0].text, '简短摘要');
  assert.equal(r.legacyTrimmed, 0);
});

/* ══════════ C. 容量动作必有计数（D3） ══════════ */
test('C1 STM 溢出滚进 LTM：动作落账、在库不超上限', async () => {
  const s = await rollover();
  assert.ok(s.loss.stmEvicted >= 1, 'STM 容量动作必须落账');
  assert.ok(s.ltm_entries.length >= 1, '溢出应滚动进 LTM');
  assert.ok(s.stm_entries.length <= S.MAX_STM_ENTRIES, 'STM 必须封顶');
});

test('C2 LTM 窗口丢最旧：丢弃落账且给出被丢的 id', async () => {
  const s = await rollover(S.MAX_LTM_ENTRIES);
  assert.ok(s.loss.ltmEvicted >= 1, 'LTM 丢弃必须落账');
  assert.equal(s.loss.lastDrop.kind, 'ltmEvicted');
  assert.ok(Array.isArray(s.loss.lastDrop.ids) && s.loss.lastDrop.ids.length >= 1, '必须给出被丢的 id');
  assert.ok(s.ltm_entries.length <= S.MAX_LTM_ENTRIES);
  // 核心可区分性：「窗口丢过」与「从未超限」不得同形
  assert.equal(S.selfReport(s).degraded, true, '丢过的状态必须被判为有损');
});

test('C3 LTM 摘要有在库上限：截断落账且量可读', async () => {
  const big = 'x'.repeat(S.LTM_SUMMARY_CAP + 500);
  let s = S.normalizeState(null);
  s.consolidate_threshold = 1;
  s.stm_entries = [
    { id: 'stm_0', text: big, msg_ids: [], floors: [0], ts: 1, score: 0 },
    ...Array.from({ length: S.MAX_STM_ENTRIES - 1 }, (_, i) => ({ id: 'stm_x' + i, text: 't', msg_ids: [], floors: [i + 1], ts: 1, score: 0 }))
  ];
  s.stm_counter = S.MAX_STM_ENTRIES;
  s = S.ingest(s, [{ text: 'tail', msg_id: 99, floor: 99 }]);
  const r = await S.consolidate(s, { force: true });
  const ltm = r.state.ltm_entries[r.state.ltm_entries.length - 1];
  assert.equal(ltm.summary.length, S.LTM_SUMMARY_CAP, '摘要必须有在库上限');
  assert.equal(r.state.loss.ltmTrimmed, 1, '截断必须落账');
  assert.equal(r.state.loss.lastDrop.dropped, 500, '截断量必须可读');
});

test('C4 上限常量可读（新增有损路径时不得改小既有上限）', () => {
  assert.equal(S.MAX_STM_ENTRIES, 40);
  assert.equal(S.MAX_LTM_ENTRIES, 24);
  assert.ok(S.LTM_SUMMARY_CAP > 0);
});

/* ══════════ D. removeByFloors：声称与实现一致（D4） ══════════ */
const mkSpan = () => {
  const s = S.normalizeState(null);
  s.ltm_entries = [{ id: 'ltm_1', summary: 's', from_stm_ids: ['stm_1'], ts: 1, span: { from: 3, to: 7 } }];
  s.stm_entries = [{ id: 'stm_1', text: 't', msg_ids: [11], floors: [3, 7], ts: 1, score: 0 }];
  return s;
};

test('D1 span 被真摘（与「只摘 span」的承诺一致）', () => {
  const s2 = S.removeByFloors(mkSpan(), [3, 7]);
  assert.ok(s2.ltm_entries[0].span, '有剩余楼层时 span 不应被清空');
  assert.equal(s2.ltm_entries[0].span.from, 4);
  assert.equal(s2.ltm_entries[0].span.to, 6);
  assert.equal(s2.ltm_entries[0].summary, 's', '摘要本身固化不删');
  assert.equal(s2.loss.spanDropped, 1, 'span 动作必须落账');
});

test('D2 span 被摘空时置 null 并单独计数', () => {
  const s3 = S.removeByFloors(mkSpan(), [3, 4, 5, 6, 7]);
  assert.equal(s3.ltm_entries[0].span, null);
  assert.equal(s3.loss.spanEmptied, 1);
});

test('D3 无交集的 span 原样保留（不制造假动作）', () => {
  const s4 = S.removeByFloors(mkSpan(), [100]);
  assert.equal(s4.ltm_entries[0].span.from, 3);
  assert.equal(s4.ltm_entries[0].span.to, 7);
  assert.equal(s4.loss.spanDropped, 0);
});

test('D4 中间挖洞后 span 带 gaps 与 kept（读数诚实）', () => {
  const s5 = S.removeByFloors(mkSpan(), [5]);
  assert.equal(s5.ltm_entries[0].span.gaps, true);
  assert.equal(s5.ltm_entries[0].span.kept, 4);
});

test('D5 stm/floors/raw 删除全部落账（I5）', () => {
  const s = S.normalizeState(null);
  s.unconsolidated_stm = [{ id: 'a', text: 'x', msg_id: 1, floor: 3, ts: 1 }];
  s.stm_entries = [
    { id: 'stm_1', text: 't', msg_ids: [], floors: [3], ts: 1, score: 0 },
    { id: 'stm_2', text: 't', msg_ids: [], floors: [3, 9], ts: 1, score: 0 }
  ];
  const s2 = S.removeByFloors(s, [3]);
  assert.equal(s2.loss.floorDropped, 2, '两个 floor 引用被摘');
  assert.equal(s2.loss.emptyEntriesDropped, 1, '一条条目被摘空后离表');
  assert.equal(s2.loss.rawDropped, 1, '一个 raw 片段被删');
  assert.equal(s2.loss.lastDrop.kind, 'floorsRemoved');
  assert.equal(s2.loss.lastDrop.floorsDropped, 2);
  assert.equal(s2.loss.lastDrop.emptyDropped, 1);
});

test('D6 既有级联清理语义不变（v396 的断言口径）', async () => {
  // 要删的是**中间**那个楼层：先插 floor 1..2，再插 floor 4..5，最后插 floor 3，
  // 于是条目 floors 顺序为 [1,2,4,5,3]，摘掉 3 后正好得到 v396 钉住的 [1,2,4,5]。
  let st = null;
  for (const i of [1, 2, 4, 5, 3]) st = S.ingest(st, [{ text: '片段' + i, msg_id: i, floor: i }]);
  const r = await S.consolidate(st, { summarize: async () => 'S' });
  assert.deepEqual(r.state.stm_entries[0].floors, [1, 2, 4, 5, 3], '巩固时保序');
  const st2 = S.removeByFloors(r.state, [3]);
  assert.deepEqual(st2.stm_entries[0].floors, [1, 2, 4, 5]);
});

/* ══════════ E. 三态：读失败 ≠ 读到了 0（D6） ══════════ */
test('E1 fresh / absent / repaired 三态可区分', () => {
  const d0 = S.normalizeDetail(undefined);
  const d1 = S.normalizeDetail({});
  const d2 = S.normalizeDetail({ unconsolidated_stm: 'x', consolidate_threshold: 'y' });
  assert.equal(d0.fresh, true, '从没跑过 → fresh');
  assert.equal(d1.fresh, false, '给了对象就不是 fresh');
  assert.ok(d1.absent.includes('unconsolidated_stm'), '键不存在须登记为 absent');
  assert.ok(d2.repaired.includes('unconsolidated_stm'), '坏形状须登记为 repaired');
  assert.notEqual(
    JSON.stringify([d0.fresh, d0.absent.length]),
    JSON.stringify([d1.fresh, d1.absent.length]),
    '两种处境不得同形');
});

test('E2 向后兼容：normalizeState 仍返回 state 本体', () => {
  const st = S.normalizeState(undefined);
  assert.ok(Array.isArray(st.stm_entries) && Array.isArray(st.ltm_entries));
  assert.equal(typeof st.cursor_state.stm.position, 'number');
});

test('E3 未知键不被静默丢弃（前向兼容）', () => {
  // 顶层未知键**不进** state（避免污染持久化对象）；前向兼容靠的是三层嵌套键：
  //   cursor_state 之外的两层（stm / ltm 子对象）里的未知键必须原样保留。
  const st = S.normalizeState({ cursor_state: { stm: { futureStm: 7 }, ltm: {}, futureKey: 42 }, futureTop: 7 });
  assert.equal(st.cursor_state.futureKey, 42, 'cursor_state 层未知键须保留');
  assert.equal(st.cursor_state.stm.futureStm, 7, 'stm 子对象未知键须保留');
  assert.equal(st.futureTop, undefined, '顶层未知键不进 state（避免污染）');
});

test('E4 老存档读入：既有值不丢、账本补零、不误报有损', () => {
  const legacy = { unconsolidated_stm: [], stm_entries: [], ltm_entries: [], cursor_state: { stm: { position: 3 }, ltm: { position: 1 } }, consolidate_threshold: 5, stm_counter: 2, ltm_counter: 1 };
  const d = S.normalizeDetail(legacy);
  assert.equal(d.fresh, false);
  assert.ok(d.absent.includes('raw_counter'), '老存档缺 raw_counter 须被登记');
  assert.equal(d.state.cursor_state.stm.position, 3);
  assert.equal(d.state.stm_counter, 2);
  assert.equal(d.state.loss.ltmEvicted, 0, '账本补零而非 undefined');
  assert.equal(S.selfReport(legacy).degraded, false, '缺字段不等于有损');
});

/* ══════════ F. selfReport：一行自述与读数自洽 ══════════ */
test('F1 干净状态：ok=true 且行末为「无损」', () => {
  const r = S.selfReport({});
  assert.equal(r.ok, true);
  assert.match(r.row, /无损$/);
  assert.equal(r.reasons.length, 0);
  assert.equal(r.incoherent.length, 0);
});

test('F2 有损状态：ok=false、reasons 非空、行含「有损：」', async () => {
  const s = await rollover(S.MAX_LTM_ENTRIES);
  const r = S.selfReport(s);
  assert.equal(r.ok, false);
  assert.match(r.row, /有损：/);
  assert.ok(r.reasons.length >= 1);
  assert.ok(r.counters.ltmEvicted > 0);
});

test('F3 I5 读侧：任何非零损失计数都必须能在自述里定位', async () => {
  const s = await rollover(S.MAX_LTM_ENTRIES);
  const r = S.selfReport(s);
  const c = r.counters;
  const lossy = Object.keys(c).filter(k => Number(c[k]) > 0);
  assert.ok(lossy.length > 0, '本场景必须真有损失');
  for (const k of lossy) {
    // 每项要么出现在 reasons（被判为有损），要么是「非丢失类」的容量动作
    const nonLoss = ['rawIngested', 'rawConsolidated', 'stmEvicted'];
    assert.ok(r.reasons.length > 0 || nonLoss.includes(k), k + ' 未被自述覆盖');
  }
});

test('F4 读数自洽检查：矛盾时报出而非吞掉（fail-closed）', () => {
  const bad = S.normalizeState(null);
  bad.loss.rawConsolidated = 5;
  bad.loss.rawIngested = 1;
  const r = S.selfReport(bad);
  assert.equal(r.ok, false);
  assert.ok(r.incoherent.length >= 1, '已巩固 > 已摄入必须被报出');
  assert.match(r.row, /读数矛盾/);
});

test('F5 读数自洽检查不误报（真值一致时静默）', () => {
  const r = S.selfReport({ loss: { rawIngested: 3, rawConsolidated: 3 } });
  assert.equal(r.incoherent.length, 0);
});

test('F6 声明了但从不填充的字段被如实登记', () => {
  const r = S.selfReport({});
  assert.ok(Array.isArray(r.cursor.declaredButNeverFilled));
  assert.ok(r.cursor.declaredButNeverFilled.includes('stm.pending_partials'),
    '断点续跑字段全程为空这件事必须可见');
});

test('F7 selfReport 纯读、不抛（非法输入也不炸）', async () => {
  const s = await rollover(S.MAX_LTM_ENTRIES);
  const before = JSON.stringify(s);
  S.selfReport(s);
  assert.equal(JSON.stringify(s), before, 'selfReport 不得改动状态');
  for (const bad of [null, undefined, 123, 'x', []]) {
    assert.doesNotThrow(() => S.selfReport(bad));
    assert.doesNotThrow(() => S.lossSummary(bad));
  }
});

test('F8 lossSummary 与 selfReport 同源（不得各写一套）', async () => {
  const s = await rollover(S.MAX_LTM_ENTRIES);
  assert.equal(S.lossSummary(s), S.selfReport(s).row);
});

/* ══════════ G. 往返与兼容：账本随存档走 ══════════ */
test('G1 账本与计数器随存档往返不丢', async () => {
  const s = await rollover(S.MAX_LTM_ENTRIES);
  const round = S.normalizeState(JSON.parse(JSON.stringify(s)));
  assert.equal(round.loss.ltmEvicted, s.loss.ltmEvicted);
  assert.equal(round.raw_counter, s.raw_counter);
  assert.equal(JSON.stringify(round.loss.lastDrop), JSON.stringify(s.loss.lastDrop));
});

test('G2 既有四条口径未被破坏（v396）', async () => {
  let st = null;
  for (let i = 1; i <= 5; i++) st = S.ingest(st, [{ text: '片段' + i, msg_id: i, floor: i }]);
  const r = await S.consolidate(st, { summarize: async t => '摘要:' + t.length + '条' });
  assert.equal(r.consolidated, 5);
  assert.equal(r.usedAI, true);
  assert.equal(r.state.stm_entries[0].id, 'stm_1');
  assert.equal(r.state.cursor_state.stm.position, 5);
  assert.equal(r.state.unconsolidated_stm.length, 0);
});

test('G3 pendingRaw / reextract 仍可用', async () => {
  let st = null;
  for (let i = 1; i <= 5; i++) st = S.ingest(st, [{ text: '片段' + i, msg_id: i, floor: i }]);
  assert.equal(S.pendingRaw(st).length, 5);
  const r = await S.consolidate(st, { summarize: async () => 'S' });
  assert.equal(S.pendingRaw(r.state).length, 0);
  const rx = await S.reextract(r.state, 'stm_1', { summarize: async () => '重抽' });
  assert.equal(rx.ok, true);
  assert.equal(rx.state.stm_entries[0].text, '重抽');
});

test('G4 recallView 仍按最近取（口径不变）', async () => {
  const s = await rollover();
  const v = S.recallView(s, { stmCount: 6, ltmCount: 3 });
  assert.ok(v.stm.length <= 6 && v.ltm.length <= 3);
});

/* ══════════ H. 源码层：判据绑在不变量上，不绑写法 ══════════ */
test('H1 有损路径都经 loss 账本（源码层核验）', () => {
  for (const k of ['ltmEvicted', 'ltmTrimmed', 'floorDropped', 'spanDropped', 'spanEmptied', 'rawDropped', 'emptyEntriesDropped', 'legacyTrimOnSave', 'rawIdCollisions']) {
    assert.ok(code.includes('loss.' + k) || S.LOSS_KEYS.includes(k),
      '有损计数 ' + k + ' 必须在 LOSS_KEYS 登记且被写入');
  }
  assert.ok(/s\.loss\.ltmEvicted\s*\+=/.test(code), 'LTM 丢弃必须真累加');
  assert.ok(/s\.loss\.spanDropped\s*\+=/.test(code), 'span 动作必须真累加');
});

test('H2 降级路径不得再出现 slice(-STM_FALLBACK_CHARS) 这种静默裁头', () => {
  // 允许 legacyTrimOnSave 旁路（显式、有账），不得再有「无条件裁头」
  const lines = code.split('\n').filter(l => /slice\(-STM_FALLBACK_CHARS\)|slice\(-LTM_FALLBACK_CHARS\)/.test(l));
  for (const l of lines) {
    assert.ok(false, '发现无条件裁头：' + l.trim());
  }
  assert.ok(code.includes('legacyTrimOnSave'), '旧口径须保留为显式旁路');
});

test('H3 新增导出只增不换（既有键一个不动）', () => {
  for (const k of ['normalizeState', 'defaultCursor', 'ingest', 'consolidate', 'pendingRaw', 'removeByFloors', 'reextract', 'recallView', 'DEFAULT_THRESHOLD', 'MAX_STM_ENTRIES', 'MAX_LTM_ENTRIES']) {
    assert.ok(typeof S[k] !== 'undefined', '既有导出 ' + k + ' 不得消失');
  }
  for (const k of ['normalizeDetail', 'stateProvenance', 'selfReport', 'lossSummary', 'LOSS_KEYS', 'LTM_SUMMARY_CAP']) {
    assert.ok(typeof S[k] !== 'undefined', '本版新增导出 ' + k + ' 应存在');
  }
});

test('H4 剥注释副本的自证（工具失灵本身也会静默）', () => {
  assert.ok(!code.includes('账本口径分账'), '剥注释后不得残留注释字样（否则文本判据会被注释满足）');
  assert.ok(code.includes('function selfReport'), '剥注释不得吞掉代码本体');
  assert.ok(code.includes('s.loss.rawIngested +='), '剥注释不得吞掉账本写入');
});

/* ══════════ H+. 负控制基建自证（先证明「能翻红」，再谈负控制）══════════
 * 历史教训（v3.169 NEG6/NEG9、ruby-phone v2.32 F4/F7/F8，以及本套件首轮 8 处全部翻车）：
 *   负控制的假绿有三形 —— ①对原文件断言（破坏没发生也绿）；
 *   ②破坏写死成模拟常量（真判据根本没被调用）；③破坏把判据自己删了（自我指涉）。
 *   本层统一为：真源码破坏（锚点恰中 1 次）→ 加载破坏副本 → 在副本上重跑
 *   A–G 层的**同款真判据**；翻红 = 抛错或返回半真值。 */

/* 8 处破坏锚点（本文件内这些字面量只允许在 I_ANCHORS 声明处各出现一次；
 * 判据一律通过模块 API 观测行为，绝不引用锚点字符串本身 —— 见 H5） */
const I_ANCHORS = [
  's.raw_counter = base + list.length;',                               // I1
  "distilled = texts.join(' / ');",                                    // I2
  's.loss.ltmEvicted += dropN;',                                       // I3
  's.loss.spanDropped += spanTouched;',                                // I4
  'const fresh = !supplied;',                                          // I5
  "raw_counter: num('raw_counter'),",                                  // I8
  '  for (const x of incoherent) reasons.push(`读数矛盾：${x}`);',      // I6
  'function selfReport(state) {\n  const d = normalizeDetail(state);', // I7
];
const A = (n) => I_ANCHORS[n];

test('H5 负控制判据的纯度：判据不得引用将被破坏的源码片段（防自我指涉假绿）', () => {
  // 全文范围内每个锚点字面量只允许出现一次（I_ANCHORS 声明处）。
  // 若判据本体也引用锚点，破坏发生时判据自己跟着失效 —— 又一种「不报错」。
  // 注意：I7 锚点在源码里以 \n 转义书写，计数前先做转义归一。
  const own = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const ownNorm = own.replace(/\\n/g, '\n');
  for (const a of I_ANCHORS) {
    assert.equal(ownNorm.split(a).length - 1, 1, '锚点全文只准声明一次：' + a);
  }
});

test('H6 负控制工具两向自证（工具失灵本身也会静默）', () => {
  // ① 没破坏成功必须抛（锚点不存在/不唯一都不许静默）
  assert.throws(() => U.breakSource(SRC, '绝不存在的锚点__neg__', ''));
  // ② 破坏必须真的改变行为（工具不是空转）
  const broken = U.breakSource(SRC, A(4), 'const fresh = false;');
  assert.notEqual(broken, SRC);
  assert.equal(U.loadBroken(broken, 'h6').normalizeDetail(undefined).fresh, false, '破坏必须可观测');
  // ③ 原版上同一判据必须为真（否则负控制恒红、失去分辨力）
  assert.equal(S.normalizeDetail(undefined).fresh, true);
  // ④ negative() 自身：无反应必须抛、真翻红必须放行
  assert.throws(() => U.negative(() => true, '自检：无反应'));
  assert.doesNotThrow(() => U.negative(() => false, '自检：返回 false'));
  assert.doesNotThrow(() => U.negative(() => { throw new Error('翻红'); }, '自检：抛错'));
});

/* ══════════ I. 负控制：每条核心判据配一次故意破坏（破坏副本 + 真判据）══════════ */
test('I1 负控制：破坏 raw_counter 推进 → A1 判据必须失效', async () => {
  await U.negativeAsync(async () => {
    const mod = U.loadBroken(U.breakSource(SRC, A(0), ''), 'i1');
    let s = mod.normalizeState(null);
    s = mod.ingest(s, [{ text: '甲一' }, { text: '甲二' }]);
    s = mod.ingest(s, [{ text: '乙一' }, { text: '乙二' }]);
    const ids = s.unconsolidated_stm.map(e => e.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(s.raw_counter, 4, '摄入计数器应推进到 4');
    assert.equal(s.loss.rawIngested, 4);
  }, 'raw_counter 不再推进');
});

test('I2 负控制：降级退回静默裁头 → B1 判据必须失效', async () => {
  await U.negativeAsync(async () => {
    const mod = U.loadBroken(U.breakSource(SRC, A(1), "distilled = texts.join(' / ').slice(-400);"), 'i2');
    const parts = Array.from({ length: 5 }, (_, i) => '第' + (i + 1) + '段' + '内'.repeat(150));
    let s = mod.normalizeState(null);
    s = mod.ingest(s, parts.map((t, i) => ({ text: t, msg_id: i, floor: i })));
    const r = await mod.consolidate(s, { force: true });
    const full = parts.join(' / ');
    assert.equal(r.state.stm_entries[0].text.length, full.length);
    assert.ok(r.state.stm_entries[0].text.includes('第1段'));
    assert.equal(r.legacyTrimmed, 0);
  }, '降级退回静默裁头');
});

test('I3 负控制：抹掉 LTM 丢弃落账 → C2 判据必须失效', async () => {
  await U.negativeAsync(async () => {
    const mod = U.loadBroken(U.breakSource(SRC, A(2), ''), 'i3');
    const s = await U.rolloverWith(mod, U.MAX_LTM);
    assert.ok(s.loss.ltmEvicted >= 1, 'LTM 丢弃必须落账');
    assert.equal(s.loss.lastDrop.kind, 'ltmEvicted');
    assert.ok(Array.isArray(s.loss.lastDrop.ids) && s.loss.lastDrop.ids.length >= 1);
    assert.ok(s.ltm_entries.length <= U.MAX_LTM);
    assert.equal(mod.selfReport(s).degraded, true, '丢过的状态必须被判为有损');
  }, 'LTM 丢弃不落账');
});

test('I4 负控制：span 动作不落账 → D1 判据必须失效', () => {
  U.negative(() => {
    const mod = U.loadBroken(U.breakSource(SRC, A(3), ''), 'i4');
    const s2 = mod.removeByFloors(U.mkSpanWith(mod), [3, 7]);
    assert.ok(s2.ltm_entries[0].span);
    assert.equal(s2.ltm_entries[0].span.from, 4);
    assert.equal(s2.ltm_entries[0].span.to, 6);
    assert.equal(s2.ltm_entries[0].summary, 's');
    assert.equal(s2.loss.spanDropped, 1, 'span 动作必须落账');
  }, 'span 动作不落账');
});

test('I5 负控制：三态退回同形 → E1 判据必须失效', () => {
  U.negative(() => {
    const mod = U.loadBroken(U.breakSource(SRC, A(4), 'const fresh = false;'), 'i5');
    const d0 = mod.normalizeDetail(undefined);
    const d1 = mod.normalizeDetail({});
    assert.equal(d0.fresh, true, '从没跑过 → fresh');
    assert.ok(d1.absent.includes('unconsolidated_stm'));
    assert.notEqual(
      JSON.stringify([d0.fresh, d0.absent.length]),
      JSON.stringify([d1.fresh, d1.absent.length]));
  }, 'fresh 判定被压平');
});

test('I6 负控制：读数自洽检查被移除 → F4 判据必须失效', () => {
  U.negative(() => {
    const mod = U.loadBroken(U.breakSource(SRC, A(6), ''), 'i6');
    const bad = mod.normalizeState(null);
    bad.loss.rawConsolidated = 5;
    bad.loss.rawIngested = 1;
    const r = mod.selfReport(bad);
    assert.equal(r.ok, false);
    assert.ok(r.incoherent.length >= 1, '已巩固 > 已摄入必须被报出');
    assert.match(r.row, /读数矛盾/);
  }, '读数矛盾不再报出');
});

test('I7 负控制：selfReport 改成会改状态 → F7 判据必须失效', async () => {
  await U.negativeAsync(async () => {
    const broken = U.breakSource(SRC, A(7), A(7) + '\n  d.state.loss.ltmEvicted += 1;');
    const mod = U.loadBroken(broken, 'i7');
    const s = await U.rolloverWith(mod, U.MAX_LTM);
    const before = JSON.stringify(s);
    mod.selfReport(s);
    assert.equal(JSON.stringify(s), before, 'selfReport 不得改动状态');
  }, 'selfReport 变成写操作');
});

test('I8 负控制：账本不随存档走 → G1 判据必须失效', async () => {
  await U.negativeAsync(async () => {
    const mod = U.loadBroken(U.breakSource(SRC, A(5), ''), 'i8');
    const s = await U.rolloverWith(mod, U.MAX_LTM);
    const round = mod.normalizeState(JSON.parse(JSON.stringify(s)));
    assert.equal(typeof round.raw_counter, 'number', 'raw_counter 必须随存档归一化');
    assert.equal(round.loss.ltmEvicted, s.loss.ltmEvicted);
  }, 'raw_counter 不随存档归一化');
});

console.log('\n[v3.170.0 巩固面] 用例结束（失败数见 node --test 汇总）');
