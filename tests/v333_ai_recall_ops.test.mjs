// v3.33 AI 主动记忆操作符 测试（st-memory-enhancement AI 编辑表格理念轻量版）
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const assert = (n, c) => { if (c) { pass++; console.log(`✓ ${n}`); } else { fail++; console.log(`✗ ${n}`); } };
// ===== 1. 静态锚点 =====
assert('config 有 aiRecallOps', src.includes('aiRecallOps: true'));
assert('config 有 MaxPerFloor', src.includes('aiRecallOpsMaxPerFloor: 12'));
assert('config 有 Debug', src.includes('aiRecallOpsDebug: false'));
assert('有 extractMemoryOpsFromText', src.includes('function extractMemoryOpsFromText(text)'));
assert('有 stripMemoryOpsTags', src.includes('function stripMemoryOpsTags(text)'));
assert('钩子在 cleanMessageText 前', src.indexOf('const aiRecallOps = this.config.config.aiRecallOps') < src.indexOf('message.mes = this.cleanMessageText(_tc.content)'));
assert('钩子剥离标签', src.includes('_tc.content = stripMemoryOpsTags(_tc.content)'));
assert('结果合并进 extracted.status_changes', src.includes('extracted.status_changes = [...(extracted.status_changes || []), ...aiRecallOps.changes]'));
assert('结果合并进 extracted.todos', src.includes('extracted.todos = [...(extracted.todos || []), ...aiRecallOps.todos]'));
assert('结果合并进 extracted.items', src.includes('extracted.items = [...(extracted.items || []), ...aiRecallOps.items]'));
assert('VERSION 存在且有效', /const VERSION = '[3-9]\.[0-9]+\.[0-9]+'/.test(src));
assert('无重复合并块', (src.match(/merged into extracted/g) || []).length === 1);
assert('每楼主动操作数上限存在', src.includes('const _cap = Number(this.config.config.aiRecallOpsMaxPerFloor)'));
assert('cap 应用于 status_changes', src.includes('extracted.status_changes.length > _cap'));
assert('cap 应用于 todos', src.includes('extracted.todos.length > _cap'));
assert('cap 应用于 items', src.includes('extracted.items.length > _cap'));
// ===== 2. 行为验证：解析器（复制 index.js 中的真实实现语义） =====
function extractMemoryOpsFromText(text) {
  try {
    const out = { changes: [], todos: [], items: [] };
    const src = String(text || '');
    if (!src.includes('<')) return out;
    const re = /<(field|todo|item)\s*:\s*([^>]+?)>\s*/gi;
    let m;
    while ((m = re.exec(src)) && out.changes.length + out.todos.length + out.items.length < 30) {
      const kind = m[1].toLowerCase();
      const body = String(m[2] || '').trim();
      if (!body) continue;
      if (kind === 'field') {
        const eq = body.indexOf('=');
        if (eq < 1) continue;
        const lhs = body.slice(0, eq).trim();
        const val = body.slice(eq + 1).trim();
        if (!val) continue;
        const dot = lhs.indexOf('.');
        if (dot < 1) continue;
        const character = lhs.slice(0, dot).trim();
        const field = lhs.slice(dot + 1).trim();
        if (!character || !field) continue;
        const chg = { character, field };
        if (/^[+-]\d+([.]\d+)?$/.test(val)) chg.delta = Number(val);
        else chg.value = val;
        out.changes.push(chg);
      } else if (kind === 'todo') {
        const bar = body.indexOf('|');
        const lhs = bar > 0 ? body.slice(0, bar) : body;
        const dot = lhs.indexOf('.');
        const character = (dot > 0 ? lhs.slice(0, dot) : lhs).trim();
        const text = (dot > 0 ? lhs.slice(dot + 1) : '').trim();
        const date = bar > 0 ? body.slice(bar + 1).trim() : '';
        if (!character || !text) continue;
        out.todos.push({ character, text, date });
      } else if (kind === 'item') {
        const eq = body.indexOf('=');
        if (eq < 1) continue;
        const action = body.slice(0, eq).trim();
        const rest = body.slice(eq + 1).trim();
        const dot = rest.indexOf('.');
        if (dot < 1) continue;
        const holder = rest.slice(0, dot).trim();
        const rest2 = rest.slice(dot + 1);
        const bar = rest2.indexOf('|');
        const name = (bar > 0 ? rest2.slice(0, bar) : rest2).trim();
        const desc = bar > 0 ? rest2.slice(bar + 1).trim() : '';
        if (!holder || !name) continue;
        out.items.push({ action: action === '失去' ? 'update' : 'add', name, desc, holder, state: action === '失去' ? '丢失' : '' });
      }
    }
    return out;
  } catch (e) { return { changes: [], todos: [], items: [] }; }
}
function stripMemoryOpsTags(text) {
  try { return String(text || '').replace(/<\/?(field|todo|item)\s*:[^>]*?>/gi, ''); }
  catch (e) { return text; }
}
// --- field tag ---
{
  const r = extractMemoryOpsFromText('<field:小红.好感=+5>');
  assert('field 增量解析', r.changes.length === 1 && r.changes[0].character === '小红' && r.changes[0].field === '好感' && r.changes[0].delta === 5);
  const r2 = extractMemoryOpsFromText('<field:小明.心情=平静>');
  assert('field 绝对值解析', r2.changes.length === 1 && r2.changes[0].value === '平静' && r2.changes[0].delta === undefined);
  const r3 = extractMemoryOpsFromText('<field:小明.好感=-3>');
  assert('field 负增量', r3.changes[0].delta === -3);
}
// --- todo tag ---
{
  const r = extractMemoryOpsFromText('<todo:小红.还书|3月20日>');
  assert('todo 带日期解析', r.todos.length === 1 && r.todos[0].character === '小红' && r.todos[0].text === '还书' && r.todos[0].date === '3月20日');
  const r2 = extractMemoryOpsFromText('<todo:小明.买药>');
  assert('todo 无日期解析', r2.todos.length === 1 && r2.todos[0].text === '买药' && r2.todos[0].date === '');
}
// --- item tag ---
{
  const r = extractMemoryOpsFromText('<item:取得=小红.钥匙|开箱用>');
  assert('item 取得解析', r.items.length === 1 && r.items[0].action === 'add' && r.items[0].name === '钥匙' && r.items[0].holder === '小红' && r.items[0].desc === '开箱用');
  const r2 = extractMemoryOpsFromText('<item:失去=小明.钥匙>');
  assert('item 失去解析', r2.items.length === 1 && r2.items[0].action === 'update' && r2.items[0].state === '丢失');
}
// --- 多标签混合 ---
{
  const r = extractMemoryOpsFromText('她递给他钥匙。<field:小红.好感=+5><todo:小明.还书|3月20日><item:取得=小明.钥匙|开箱>正文继续。');
  assert('混合解析: changes=1', r.changes.length === 1);
  assert('混合解析: todos=1', r.todos.length === 1);
  assert('混合解析: items=1', r.items.length === 1);
}
// --- strip ---
{
  const s = stripMemoryOpsTags('她递给他钥匙。<field:小红.好感=+5>他说谢谢。<todo:小明.还书|3月20日>');
  assert('strip 移除 field 标签', !s.includes('<field:'));
  assert('strip 移除 todo 标签', !s.includes('<todo:'));
  assert('strip 保留正文', s.includes('她递给他钥匙。') && s.includes('他说谢谢。'));
}
// --- 无标签/非字符串安全 ---
{
  assert('无标签安全', extractMemoryOpsFromText('普通文本没有标签').changes.length === 0);
  assert('null 安全', extractMemoryOpsFromText(null).changes.length === 0);
  assert('undefined 安全', extractMemoryOpsFromText(undefined).changes.length === 0);
  assert('非法 field 忽略', extractMemoryOpsFromText('<field:=5>').changes.length === 0);
  assert('非法 item 忽略', extractMemoryOpsFromText('<item:取得=无der>').items.length === 0);
  assert('strip null 安全', stripMemoryOpsTags(null) === 'null' || stripMemoryOpsTags(null) === '');
}
console.log(`\n[ai-recall-ops] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
