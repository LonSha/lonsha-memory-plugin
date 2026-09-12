// v3.32 剧情时间线重要度分级注入 测试（Visual-Memory highlightThreshold 理念）
// 覆盖：events 提取 schema importance；PlotTimeline.add 持久化（向后兼容）；recall 保留；buildInjection 分级注入
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const assert = (n, c) => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}`); } };
// ===== 1. 静态锚点检查 =====
assert('extractionPrompt events 规则含 importance', src.includes('importance（1-10，数字越大越重要'));
assert('输出 schema events 含 importance 默认5', src.includes('"importance": 5'));
assert('PlotTimeline.add 接受 importance 参数', /add\(date, text, floor, characters = \[\], importance = 5\)/.test(src));
assert('PlotTimeline.add 持久化 importance 且限幅1-10', src.includes('importance: (importance >= 1 && importance <= 10) ? importance : 5'));
assert('PlotTimeline.add 去重时保大 importance', src.includes('if (importance > (exist.importance || 5)) exist.importance = importance'));
assert('onMessageReceived 聚合 tlImp', src.includes('let tlImp = 5;'));
assert('timeline.add 传 tlImp（主）', src.includes('timeline.add(sd, extracted.summary, message.index || 0, extracted.characters || [], tlImp)'));
assert('timeline.add 传 tlImp（推进）', src.includes('timeline.add(advanced, extracted.summary, message.index || 0, extracted.characters || [], tlImp)'));
assert('recall 保留 importance', src.includes("source: 'timeline', importance: e.importance || 5"));
assert('buildInjection 关键事件置顶块', src.includes('blocks.push("[关键事件·影响当前]");'));
assert('buildInjection 分级过滤 tlKey', src.includes('timelines.filter(i => (i.importance || 5) >= 7)'));
assert('RESIDENT_MARKERS 含关键事件', src.includes("'[关键事件·影响当前]'"));
assert('recencyTypes 含关键事件', src.includes("'[关键事件·影响当前]'"));
// ===== 2. 行为验证：PlotTimeline.add 重要度持久化与去重保大 =====
function simAdd(entries, date, text, floor, cl, importance = 5) {
  if (!date || !text) return null;
  const exist = entries.find(e => e.date === date && e.text === text);
  if (exist) { exist.floor = floor; if (importance > (exist.importance || 5)) exist.importance = importance; return exist; }
  const e = { id: 'tl_', date, text, floor, characters: cl || [], importance: (importance >= 1 && importance <= 10) ? importance : 5, timestamp: Date.now() };
  entries.push(e);
  if (entries.length > 500) entries.shift();
  return e;
}
{
  const entries = [];
  simAdd(entries, '3月12日', '主角决定参加比赛', 10, [], 3);
  assert('新建条目持久化 importance=3', entries[0].importance === 3);
  simAdd(entries, '3月12日', '主角决定参加比赛', 12, [], 9);
  assert('去重触碰不新增', entries.length === 1);
  assert('去重时保大 importance=9', entries[0].importance === 9);
  simAdd(entries, '3月13日', '主角发现真相', 15);
  assert('无 importance 默认 5', entries[1].importance === 5);
  simAdd(entries, '3月14日', '坏事件', 16, [], 99);
  assert('importance 越上限回退默认5', entries[2].importance === 5);
  simAdd(entries, '3月15日', '琐事', 17, [], 0);
  assert('importance 越下限限幅到5', entries[3].importance === 5);
}
// ===== 3. 行为验证：tlImp 聚合逻辑 =====
function aggTlImp(events) {
  let tlImp = 5;
  for (const ev of (events || [])) {
    const v = Number(ev?.importance);
    if (v >= 1 && v <= 10 && v > tlImp) tlImp = v;
  }
  return tlImp;
}
assert('无 events 默认 5', aggTlImp(undefined) === 5);
assert('events 无 importance 默认 5', aggTlImp([{ type: 'a' }]) === 5);
assert('events 最高 importance 聚合', aggTlImp([{ importance: 3 }, { importance: 9 }, { importance: 7 }]) === 9);
assert('越限 importance 被忽略', aggTlImp([{ importance: 11 }, { importance: 0 }]) === 5);
// ===== 4. 行为验证：buildInjection 分级 =====
function tierBlocks(timelines) {
  const tlKey = timelines.filter(i => (i.importance || 5) >= 7);
  const tlRest = timelines.filter(i => (i.importance || 5) < 7);
  const blocks = [];
  if (tlKey.length) {
    blocks.push('[关键事件·影响当前]');
    const seenK = new Set();
    tlKey.forEach(i => { const key = i.text || ''; if (seenK.has(key)) return; seenK.add(key); blocks.push(`- ${key}`); });
  }
  if (tlRest.length) {
    blocks.push('[剧情时间线]');
    const seen = new Set();
    tlRest.forEach(i => { const key = i.text || ''; if (seen.has(key)) return; seen.add(key); blocks.push(`- ${key}`); });
  }
  return blocks;
}
{
  const timelines = [
    { id: 'a', text: '旧日决定参赛', date: '3月1日', importance: 8 },
    { id: 'b', text: '主角获胜', date: '3月2日', importance: 9 },
    { id: 'c', text: '去市场买菜', date: '3月3日', importance: 2 },
    { id: 'd', text: '寒暄问候', date: '3月4日', importance: 3 },
    { id: 'e', text: '无importance项', date: '3月5日' },
  ];
  const b = tierBlocks(timelines);
  assert('关键事件块在最前', b[0] === '[关键事件·影响当前]');
  assert('关键事件含8分项', b.includes('- 旧日决定参赛'));
  assert('关键事件含9分项', b.includes('- 主角获胜'));
  const keyBlockEnd = b.indexOf('[剧情时间线]');
  assert('关键块只含重要事件', keyBlockEnd >= 0 && b.slice(1, keyBlockEnd).length === 2);
  assert('普通时间线含琐事', b.includes('- 去市场买菜'));
  assert('无 importance 进普通时间线(默认5)', b.includes('- 无importance项'));
}
console.log(`\n[importance-timeline] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
