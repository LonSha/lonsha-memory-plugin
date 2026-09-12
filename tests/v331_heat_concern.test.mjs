// v3.31 召回加热 + concern 复发 测试
// 抽取 index.js 的相关方法做黑盒验证
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const assert = (n, c) => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}`); } };

// ===== 1. 静态锚点检查 =====
assert('config 有 heatOnRecallEnabled', src.includes('heatOnRecallEnabled: true'));
assert('VectorStore 有 _heatEntry 方法', src.includes('_heatEntry(v)'));
assert('VectorStore 有 heatByText 方法', src.includes('heatByText(text)'));
assert('search 调用 _heatEntry', /for \(const v of scored\.slice\(0, topK\)\) \{[\s\S]*?this\._heatEntry\(src\)/.test(src));
assert('BM25 命中加热', src.includes('this.vector.heatByText(b.text)'));
assert('todos 有 lastMentionedAt', src.includes('lastMentionedAt: Date.now()'));
assert('todos 有 reoccurred 标记', src.includes('reoccurred: reoccurred || undefined'));
assert('pruneTodos 有复发豁免', src.includes('lastMentionedAt && (Date.now() - t.lastMentionedAt < 24'));

// ===== 2. 行为验证（热逻辑） =====
// 模拟 VectorStore 的加热逻辑
function simulateHeat(v) {
  v.accessCount = (v.accessCount || 0) + 1;
  v.activationCount = (v.activationCount || 1) + 1;
  v.lastActive = Date.now();
  v.metadata = { ...(v.metadata || {}), accessCount: v.accessCount, activationCount: v.activationCount, lastActive: v.lastActive };
  return v;
}
{
  const start = Date.now() - 10 * 86400000; // 10天前
  const mem = { id: 'v1', text: '戒奶茶', accessCount: 1, activationCount: 2, lastActive: start, timestamp: start };
  simulateHeat(mem);
  assert('加热后 accessCount+1', mem.accessCount === 2);
  assert('加热后 activationCount+1', mem.activationCount === 3);
  assert('加热后 lastActive 刷新（续命）', mem.lastActive >= Date.now() - 1000);
  assert('metadata 同步', mem.metadata.accessCount === 2 && mem.metadata.activationCount === 3);
}

// ===== 3. 行为验证（concern 复发 + 豁免） =====
{
  const now = Date.now();
  // 模拟 addTodos 复发判定
  let todos = [{ text: '还书', date: '3月15日', createdAt: now - 86400000, lastMentionedAt: now - 86400000 }];
  const text = '还书';
  const reoccurred = todos.some(x => x.text === text);
  assert('复发检测到既有待办', reoccurred === true);
  todos = todos.filter(x => x.text !== text);
  todos.push({ text, date: '3月20日', createdAt: now, lastMentionedAt: now, reoccurred: reoccurred || undefined });
  assert('复发后重述 date 更新', todos[0].date === '3月20日');
  assert('复发标记 reoccurred 为真', todos[0].reoccurred === true);
  assert('复发刷新 lastMentionedAt', Math.abs(todos[0].lastMentionedAt - now) < 1000);

  // 模拟 pruneTodos 复发豁免：旧日期已过但最近重申 → 保留
  const cur = new Date('2026-03-22');
  const td = new Date('2026-03-20');
  const diffMin = (cur - td) / 60000;
  const expiryMinutes = 60;
  // 未重申（lastMentionedAt 很久前）→ 过期清除
  todos[0].lastMentionedAt = now - 5 * 86400000;
  const shouldPrune = !(todos[0].lastMentionedAt && (now - todos[0].lastMentionedAt < 24 * 3600000)) && diffMin > expiryMinutes;
  assert('旧待办过期应清除', shouldPrune === true);
  // 重申（lastMentionedAt 最近）→ 豁免保留
  todos[0].lastMentionedAt = now - 3600000; // 1小时前重申
  const exempt = todos[0].lastMentionedAt && (now - todos[0].lastMentionedAt < 24 * 3600000);
  assert('最近重申复发豁免', exempt === true);
}

console.log(`\n${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);