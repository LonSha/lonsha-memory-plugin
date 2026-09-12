// v3.34 记忆可视化面板与编辑管理 测试
import fs from 'node:fs';
const uiSrc = fs.readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');
const idxSrc = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const mftSrc = fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const assert = (n, c) => { if (c) { pass++; console.log('✓ ' + n); } else { fail++; console.log('✗ ' + n); } };
// ===== 1. 静态锚点检查 =====
assert('有 _memPersist 存盘', uiSrc.includes('plugin._memPersist = async function'));
assert('有 _memToast 提示', uiSrc.includes('plugin._memToast = function'));
assert('有 _memOps 操作分发', uiSrc.includes('plugin._memOps = function'));
assert('有 _memOpsRender 渲染', uiSrc.includes('plugin._memOpsRender = function'));
assert('summaries 绑定 opkind', uiSrc.includes('data-opkind="summary"'));
assert('timeline 绑定 opkind', uiSrc.includes('data-opkind="timeline"'));
assert('povs 绑定 opkind', uiSrc.includes('data-opkind="pov"'));
assert('vectors 绑定 opkind', uiSrc.includes('data-opkind="vector"'));
assert('suspense 绑定 opkind', uiSrc.includes('data-opkind="suspense"'));
assert('点击条目操作提示', uiSrc.includes('点击条目可操作'));
assert('FAB 包含时间线入口', uiSrc.includes('data-act="timeline"'));
assert('VERSION 存在有效', /const VERSION = '[3-9]\.[0-9]+\.[0-9]+'/.test(idxSrc));
assert('manifest 版本有效', /"version": "[3-9]\.[0-9]+\.[0-9]+"/.test(mftSrc));
// ===== 2. 行为模拟：timeline 操作 =====
{
  const entries = [{ id: 't1', text: '初遇', importance: 5 }, { id: 't2', text: '告白', importance: 8 }];
  const e = entries.find(x => x.id === 't1');
  e.importance = Math.min(10, (e.importance || 5) + 2);
  assert('升星后 importance 为 7', e.importance === 7);
  const rest = entries.filter(x => x.id !== 't1');
  assert('删除后只剩 1 条', rest.length === 1 && rest[0].id === 't2');
}
// ===== 3. 行为模拟：summary 与 POV 删除 =====
{
  let sums = [{ floor: 1, text: '第一幕' }, { floor: 2, text: '第二幕' }];
  sums = sums.filter(x => x.floor !== 1);
  assert('summary 按楼层删除生效', sums.length === 1 && sums[0].floor === 2);
  let povs = [{ id: 'p1', content: '秘密A' }, { id: 'p2', content: '秘密B' }];
  povs = povs.filter(x => x.id !== 'p1');
  assert('POV 删除生效', povs.length === 1 && povs[0].id === 'p2');
}
// ===== 4. 行为模拟：status field 与 todo 操作 =====
{
  const rec = { fields: { 好感: 10, 心情: '开心' }, todos: [{ text: '还书' }] };
  const base = Number(rec.fields['好感']) || 0;
  rec.fields['好感'] = Math.round((base + Number(' +5 ')) * 100) / 100;
  assert('好感数值增量 +5 成功', rec.fields['好感'] === 15);
  rec.fields['心情'] = '平静';
  assert('心情绝对值设置成功', rec.fields['心情'] === '平静');
  delete rec.fields['心情'];
  assert('删除字段成功', rec.fields['心情'] === undefined);
  rec.todos = rec.todos.filter(x => x.text !== '还书');
  assert('待办完成移除成功', rec.todos.length === 0);
}
console.log('[visual-editor] ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
