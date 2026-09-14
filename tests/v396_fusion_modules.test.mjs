// [v3.96] 缝合四模块单测：ai-select / stm-ltm / unified-recall / api-channels
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const AIS = require('../ai-select.js');
const STM = require('../stm-ltm.js');
const UR = require('../unified-recall.js');
const AC = require('../api-channels.js');

// ══════════ ① ai-select 前置 AI 精选 ══════════
test('ai-select: scoreEntry 分层计分（primary>secondary>term>constant降权）', () => {
  const e1 = { keys: { primary: ['图书馆'], secondary: ['咖啡'], all: ['图书馆', '咖啡'] }, comment: '图书馆约会', content: 'x', constant: false };
  const e2 = { keys: { primary: [], secondary: ['战斗'], all: ['战斗'] }, comment: '战斗', content: 'x', constant: false };
  const q = '我们去图书馆吧';
  const s1 = AIS.scoreEntry(e1, q, q, '').score;
  const s2 = AIS.scoreEntry(e2, q, q, '').score;
  assert.ok(s1 > s2, `primary命中(${s1})应>secondary未命中(${s2})`);
  // constant 降权
  const ec = { keys: { primary: ['图书馆'], secondary: [], all: ['图书馆'] }, comment: '常驻', content: 'x', constant: true };
  const sc = AIS.scoreEntry(ec, q, q, '').score;
  assert.ok(sc < s1, `constant应降权: ${sc} < ${s1}`);
});

test('ai-select: recallCandidates 过滤constant+按分排序', () => {
  const cands = [
    { keys: { primary: ['图书馆'], secondary: [], all: ['图书馆'] }, comment: 'A', content: 'x', constant: false, order: 1 },
    { keys: { primary: [], secondary: [], all: [] }, comment: '常驻', content: 'x', constant: true },
    { keys: { primary: ['战斗'], secondary: [], all: ['战斗'] }, comment: 'B', content: 'x', constant: false, order: 2 }
  ];
  const r = AIS.recallCandidates(cands, { lastUserText: '图书馆', recentText: '', stateSummary: '' }, { maxCandidates: 10 });
  assert.equal(r.length, 2, 'constant应被过滤');
  assert.equal(r[0].comment, 'A', '命中项应排前');
  assert.ok(r[0].score > 0);
});

test('ai-select: parseAIResponse 容错（代码块/尾逗号/字符串数组）', () => {
  assert.deepEqual(AIS.parseAIResponse('```json\n{"selected":[{"key":"图书馆"}]}\n```'), ['图书馆']);
  assert.deepEqual(AIS.parseAIResponse('{"selected":[{"key":"A",},{"key":"B"}]}'), ['A', 'B']); // 尾逗号
  assert.deepEqual(AIS.parseAIResponse('{"selected":["X","Y"]}'), ['X', 'Y']); // 字符串数组
  assert.deepEqual(AIS.parseAIResponse('{"selected":[]}'), []);
  assert.deepEqual(AIS.parseAIResponse('垃圾输出'), []); // 无效输入返回空数组（route 按 length 判空）
});

test('ai-select: AISelect.route 五态 source + AI失败回退', async () => {
  const cands = [
    { keys: { primary: ['图书馆'], secondary: [], all: ['图书馆'] }, comment: 'A', content: 'x' },
    { keys: { primary: ['战斗'], secondary: [], all: ['战斗'] }, comment: 'B', content: 'x' }
  ];
  // 无AI通道 → local-noai
  const s1 = new AIS.AISelect({ callAI: null, maxCandidates: 10, maxSelect: 2 });
  const r1 = await s1.route(cands, { lastUserText: '图书馆' });
  assert.equal(r1.source, 'local-noai');
  // AI返回有效 → ai
  const s2 = new AIS.AISelect({ callAI: async () => '{"selected":[{"key":"图书馆","reason":"r"}]}', maxCandidates: 10, maxSelect: 2 });
  const r2 = await s2.route(cands, { lastUserText: '图书馆' });
  assert.equal(r2.source, 'ai');
  assert.equal(r2.selected.length, 1);
  // AI抛错 → local-error 回退本地
  const s3 = new AIS.AISelect({ callAI: async () => { throw new Error('x'); }, maxCandidates: 10, maxSelect: 2 });
  const r3 = await s3.route(cands, { lastUserText: '图书馆' });
  assert.equal(r3.source, 'local-error');
  assert.ok(r3.selected.length > 0, '错误回退应给本地topN');
  // AI返回空集 → ai-empty-fallback 保底top1
  const s4 = new AIS.AISelect({ callAI: async () => '{"selected":[]}', maxCandidates: 10, maxSelect: 2 });
  const r4 = await s4.route(cands, { lastUserText: '图书馆' });
  assert.equal(r4.source, 'ai-empty-fallback');
  assert.equal(r4.selected.length, 1, '空集应保底top1');
});

// ══════════ ② stm-ltm 游标巩固 ══════════
test('stm-ltm: 低于阈值不巩固，达阈值触发+游标推进', async () => {
  let st = null;
  for (let i = 1; i <= 4; i++) st = STM.ingest(st, [{ text: '片段' + i, msg_id: i, floor: i }]);
  let r = await STM.consolidate(st, {});
  assert.equal(r.consolidated, 0, '低于阈值5不应巩固');
  st = STM.ingest(r.state, [{ text: '片段5', msg_id: 5, floor: 5 }]);
  r = await STM.consolidate(st, { summarize: async t => '摘要:' + t.length + '条' });
  assert.equal(r.consolidated, 5);
  assert.equal(r.usedAI, true);
  assert.equal(r.state.stm_entries.length, 1);
  assert.equal(r.state.stm_entries[0].id, 'stm_1');
  assert.equal(r.state.cursor_state.stm.position, 5, '游标应推进到5');
  assert.equal(r.state.unconsolidated_stm.length, 0, 'raw区应清空（断点续跑）');
});

test('stm-ltm: 无summarize通道降级拼接', async () => {
  let st = null;
  for (let i = 1; i <= 5; i++) st = STM.ingest(st, [{ text: '片段' + i, floor: i }]);
  const r = await STM.consolidate(st, {});
  assert.equal(r.usedAI, false);
  assert.ok(r.state.stm_entries[0].text.length > 0, '降级应有拼接内容');
});

test('stm-ltm: 断点续跑pendingRaw + 级联清理 + 重抽', async () => {
  let st = null;
  for (let i = 1; i <= 5; i++) st = STM.ingest(st, [{ text: '片段' + i, msg_id: i, floor: i }]);
  assert.equal(STM.pendingRaw(st).length, 5);
  let r = await STM.consolidate(st, { summarize: async () => 'S' });
  assert.equal(STM.pendingRaw(r.state).length, 0);
  // 级联清理 floor 3
  const st2 = STM.removeByFloors(r.state, [3]);
  assert.deepEqual(st2.stm_entries[0].floors, [1, 2, 4, 5]);
  // 重抽
  const rx = await STM.reextract(st2, 'stm_1', { summarize: async () => '重抽' });
  assert.equal(rx.ok, true);
  assert.equal(rx.state.stm_entries[0].text, '重抽');
});

test('stm-ltm: STM溢出滚动进LTM', async () => {
  let st = null;
  // 喂 MAX_STM_ENTRIES+1 批，触发滚动
  for (let b = 0; b <= STM.MAX_STM_ENTRIES; b++) {
    for (let i = 0; i < 5; i++) st = STM.ingest(st, [{ text: `b${b}片段${i}`, floor: b * 5 + i }]);
    st = (await STM.consolidate(st, { summarize: async () => 'S' + b })).state;
  }
  assert.ok(st.stm_entries.length <= STM.MAX_STM_ENTRIES, 'STM应封顶');
  assert.ok(st.ltm_entries.length > 0, '溢出应滚进LTM');
  const view = STM.recallView(st, { stmCount: 6, ltmCount: 3 });
  assert.ok(view.stm.length <= 6 && view.ltm.length <= 3);
});

// ══════════ ③ unified-recall 统一召回管线 ══════════
test('unified-recall: 图谱节点候选化（结构化keys+切句secondary）', () => {
  const nodes = [
    { id: 'n1', type: 'character', name: '绫地宁宁', data: { title: '图书委员', persona: '温柔内向喜欢读书', aliases: ['宁宁'] }, timestamp: 100 },
    { id: 'n2', type: 'event', name: '告白', data: { summary: '在天台向宁宁告白成功', location: '学校天台' }, timestamp: 200 },
    { id: 'n3', type: 'node', name: '', data: {}, timestamp: 50 }
  ];
  const cands = UR.graphToCandidates(nodes);
  assert.equal(cands.length, 2, '空节点应被过滤');
  const char = cands.find(c => c._nodeType === 'character');
  assert.ok(char.keys.primary.includes('绫地宁宁'));
  assert.ok(char.keys.primary.includes('宁宁'), '别名应进primary');
  assert.ok(char._guaranteed, 'character应保底');
  const evt = cands.find(c => c._nodeType === 'event');
  assert.ok(evt.keys.primary.includes('学校天台'), 'location应进primary');
});

test('unified-recall: mergeWithGuaranteed 类型保底（低分白名单也入选）', () => {
  const scored = [
    { id: 'a', score: 20, _guaranteed: false, updatedAt: 1 },
    { id: 'b', score: 0, _guaranteed: true, updatedAt: 2 },   // 低分但保底
    { id: 'c', score: 15, _guaranteed: false, updatedAt: 3 }
  ];
  const merged = UR.mergeWithGuaranteed(scored, { maxTotal: 2 });
  const ids = merged.map(x => x.id);
  assert.ok(ids.includes('a'), '高分应入选');
  assert.ok(ids.includes('b'), '保底类型即使0分也应入选');
  assert.equal(merged.length, 2);
});

// ══════════ ④ api-channels 副API通道 ══════════
test('api-channels: normalizeChannels + resolveChannel 副通道解析', () => {
  const ch = AC.normalizeChannels({ summarize: { endpoint: 'http://x', model: 'cheap', enabled: true }, embed: {} });
  assert.equal(AC.resolveChannel(ch, 'summarize').useSecondary, true);
  assert.equal(AC.resolveChannel(ch, 'embed').useSecondary, false, '未配置应回落主通道');
  assert.equal(AC.resolveChannel(ch, 'extract').useSecondary, false);
  assert.deepEqual(Object.keys(AC.TASKS).length, 7, '七类任务通道');
});

test('api-channels: route 三态（secondary/main-fallback/main）', async () => {
  const ch = AC.normalizeChannels({ summarize: { endpoint: 'http://x', model: 'm', enabled: true } });
  // 副通道成功
  const r1 = await AC.route({ task: 'summarize', prompt: 'p', channels: ch, callMain: async () => 'MAIN', callSecondary: async () => 'SEC' });
  assert.equal(r1.text, 'SEC'); assert.equal(r1.source, 'secondary');
  // 副通道失败回落主通道
  const r2 = await AC.route({ task: 'summarize', prompt: 'p', channels: ch, callMain: async () => 'MAIN', callSecondary: async () => { throw new Error('x'); } });
  assert.equal(r2.text, 'MAIN'); assert.equal(r2.source, 'main-fallback');
  // 无副通道走主
  const r3 = await AC.route({ task: 'extract', prompt: 'p', channels: ch, callMain: async () => 'MAIN' });
  assert.equal(r3.text, 'MAIN'); assert.equal(r3.source, 'main');
  // 无callMain安全返回
  const r4 = await AC.route({ task: 'extract', prompt: 'p', channels: ch });
  assert.equal(r4.text, ''); assert.ok(r4.error);
});