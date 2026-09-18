// [v3.151] 召回自检摘要外供（织光机「最常回望的时光」数据源）专项测试
// 覆盖：静态接线（快照桥字段 + 方法在位 + 与 v3.150 账本写侧字段对齐 + 只读契约）
//       + 行为级（_summarizeRecallAudit 提取执行：空态 / 聚合 / 截断排序 / 脏数据容灾）
import { readFileSync } from 'fs';
import assert from 'assert';
const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf8');
const EMPTY = { rounds: 0, emptyRounds: 0, avgHits: 0, hotFloors: [], lastQuery: '', lastTs: 0 };

// ---------- 1. 静态接线检查 ----------
{
  // [v3.174 契约变更，显式留痕] 宿主守卫从字段字面量移到了 rawRecall 上，字段本体改为
  //   deep(rawRecall)（不再 : null 兜底——否则「宿主没这方法」与「摘要是空」同形）。
  //   意图不变：守卫必须在位、recallAudit 必须在快照里、缺失不得连坐其它字段。
  assert.ok(src.includes("const rawRecall = (typeof this._summarizeRecallAudit === 'function') ? this._summarizeRecallAudit() : undefined;"),
    '快照桥 recallAudit 宿主守卫在位（缺失即 undefined，不伪装成 null）');
  assert.ok(src.includes('recallAudit: deep(rawRecall)'), '快照桥 recallAudit 字段在位');
  assert.ok(/^\s*_summarizeRecallAudit\(\) \{/m.test(src), '_summarizeRecallAudit 方法定义在位');
  // 与 v3.150 写侧账本字段对齐：消费的就是 A 账本真实字段
  for (const f of ['empty', 'totalHits', 'floorHits', 'queryText', 'ts']) {
    assert.ok(src.includes(`r.${f}`) || src.includes(`last.${f}`), `摘要消费 A 账本字段 ${f}`);
  }
  // 只读契约：摘要方法体内不得出现写账本的语句
  const start = src.indexOf('_summarizeRecallAudit() {');
  const end = src.indexOf('\n        }', start);
  const body = src.slice(start, end);
  assert.ok(!/\.push\(|\.shift\(|\.splice\(/.test(body), '摘要方法不改写账本（只读）');
  console.log('✓ 静态接线：快照桥字段 + 方法在位 + 只读契约');
}

// ---------- 2. 提取方法做行为级测试（花括号计数）----------
function extractMethod(source, name) {
  const marker = name + '() {';
  const start = source.indexOf(marker);
  assert.ok(start > 0, `找到方法 ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0, end = -1;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  return source.slice(start, end + 1);
}
const methodSrc = extractMethod(src, '_summarizeRecallAudit');
function runSummarize(audit) {
  const proto = new Function('errLog', `return ({ ${methodSrc} });`)(() => {});
  return proto._summarizeRecallAudit.call({ _recallAudit: audit });
}

// ---------- 3. 空账本 → 中性空态（不炸、不发散）----------
{
  assert.deepStrictEqual(runSummarize([]), EMPTY, '空数组 → 中性空态');
  assert.deepStrictEqual(runSummarize(null), EMPTY, 'null 账本 → 中性空态');
  assert.deepStrictEqual(runSummarize(undefined), EMPTY, 'undefined 账本 → 中性空态');
  console.log('✓ 空账本降级为中性空态');
}

// ---------- 4. 聚合正确性：轮数 / 空结果 / 平均命中 / 热点楼层 ----------
{
  const audit = [
    { empty: false, totalHits: 4, floorHits: { 3: 2, 7: 2 }, queryText: '初次相遇', ts: 100 },
    { empty: true,  totalHits: 0, floorHits: {},              queryText: '无关查询', ts: 200 },
    { empty: false, totalHits: 8, floorHits: { 3: 5, 12: 3 }, queryText: '重逢', ts: 300 }
  ];
  const s = runSummarize(audit);
  assert.strictEqual(s.rounds, 3, '轮数');
  assert.strictEqual(s.emptyRounds, 1, '空结果轮数');
  assert.strictEqual(s.avgHits, 4, '平均命中 (4+0+8)/3 = 4');
  assert.deepStrictEqual(s.hotFloors, [{ floor: 3, count: 7 }, { floor: 12, count: 3 }, { floor: 7, count: 2 }], '热点楼层降序聚合');
  assert.strictEqual(s.lastQuery, '重逢', '末轮查询');
  assert.strictEqual(s.lastTs, 300, '末轮时间戳');
  console.log('✓ 聚合正确性（轮数/空结果/均值/热点排序/末轮）');
}

// ---------- 5. 热点截断为 Top10 + 排序 ----------
{
  const many = {};
  for (let i = 0; i < 25; i++) many[i] = i + 1;   // 25 个楼层：floor i 热度 i+1 → 最热 floor 24 (25 次)
  const s = runSummarize([{ empty: false, totalHits: 325, floorHits: many, queryText: 'x', ts: 1 }]);
  assert.strictEqual(s.hotFloors.length, 10, '热点楼层截断为 Top10');
  assert.deepStrictEqual(s.hotFloors[0], { floor: 24, count: 25 }, '最热楼层在最前');
  assert.deepStrictEqual(s.hotFloors[9], { floor: 15, count: 16 }, '截断边界（第 10 名为 floor 15）');
  assert.ok(!s.hotFloors.some(h => h.floor < 15), '被截断的低热楼层不入榜');
  console.log('✓ 热点截断 Top10 + 降序排列');
}

// ---------- 6. 脏数据容灾：null 项 / 非法楼层键 / 非法 ts ----------
{
  const audit = [
    { empty: false, totalHits: 5, floorHits: { 3: 2, 8: 3 }, queryText: 'a', ts: 10 },
    null,                                                          // 脏：null 项不得炸
    { empty: false, totalHits: 'NaN-soft', floorHits: { '-9': 5, abc: 3, 4: 2, 8: 1 }, queryText: null, ts: 'x' }
  ];
  const s = runSummarize(audit);
  assert.strictEqual(s.rounds, 3, '脏项仍计入轮数（账本长度口径）');
  assert.deepStrictEqual(s.hotFloors, [{ floor: 8, count: 4 }, { floor: 3, count: 2 }, { floor: 4, count: 2 }],
    '负数/非数楼层键被过滤；合法键跨轮累加（floor 8 = 3+1）');
  assert.ok(!s.hotFloors.some(h => h.floor < 0), '负数楼层被过滤');
  assert.strictEqual(s.avgHits, Number((5 / 3).toFixed(2)), '非法 totalHits 按 0 计参与均值');
  assert.strictEqual(s.lastQuery, '', 'null 查询文本降级为空串');
  assert.strictEqual(s.lastTs, 0, '非法 ts 降级为 0');
  console.log('✓ 脏数据容灾（null 项 / 非法键 / 非法 ts 全降级不炸）');
}

console.log('\n✓ v3.151 召回自检摘要外供 专项测试全部通过');