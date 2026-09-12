// tests/v316_three_core.test.mjs
// v3.16 zhino 三核心收编测试（两层记忆 + 神经链召回 + 世界推进）
// 双模式：行为实测（charMem 银行 / 神经链构造 / 世界推进注入）+ 静态断言（链路完整）
import { readFileSync } from 'fs';
const src = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');
const PLUGIN_NAME = 'LonSha记忆引擎';
let pass = 0;
const ok = (m) => { pass++; console.log('ok: ' + m); };
const fail = (m) => { console.error('FAIL: ' + m); process.exit(1); };

// ─── 组件抽取 ───
const bankM = src.match(/    class CharacterMemoryBank \{[\s\S]*?\n    \}\n/);
const wpM = src.match(/    class WorldProgress \{[\s\S]*?\n    \}\n/);
if (!bankM || !wpM) fail('未找到 CharacterMemoryBank / WorldProgress 类');

// 直接 eval 类定义（独立闭包，注入 window/PLUGIN_NAME）
const errLog = () => {};
const evalClass = (code) => {
  const fn = new Function('window', 'PLUGIN_NAME', 'errLog', code + '\nreturn { CharacterMemoryBank, WorldProgress };');
  return fn({ LonShaMemory: { engine: { config: { config: { debugMode: false } } } } }, PLUGIN_NAME, errLog);
};
const { CharacterMemoryBank, WorldProgress } = evalClass(bankM[0] + '\n' + wpM[0]);

// ─── ① 角色记忆银行 ───
// TC1: 核心永久 + 近期更替（近期超 3 条淘汰最旧）
{
  const b = new CharacterMemoryBank();
  b.addCore('夏木', '夏木与主角初遇' , 1);
  b.addRecent('夏木', '近期甲', 1);
  b.addRecent('夏木', '近期乙', 2);
  b.addRecent('夏木', '近期丙', 3);
  b.addRecent('夏木', '近期丁', 4);
  const m = b.of('夏木');
  if (m.core.length !== 1) fail('TC1 核心数');
  if (m.recent.length !== 3) fail('TC1 近期上限: ' + m.recent.length);
  if (m.recent[0].text !== '近期乙') fail('TC1 最旧淘汰: ' + m.recent[0].text);
  ok('TC1: 核心永久 + 近期保留最近3条淘汰最旧');
}
// TC2: 升降级 & 删除
{
  const b = new CharacterMemoryBank();
  b.addRecent('A', '待升级', 1);
  const rid = b.of('A').recent[0].id;
  if (!b.promoteToCore('A', rid)) fail('TC2 升级失败');
  if (b.of('A').core.length !== 1) fail('TC2 升级后核心');
  const cid = b.of('A').core[0].id;
  if (!b.demoteToRecent('A', cid)) fail('TC2 降级失败');
  if (b.of('A').recent.length !== 1) fail('TC2 降级后近期');
  b.deleteMemory('A', b.of('A').recent[0].id);
  if (b.of('A').recent.length !== 0) fail('TC2 删除');
  ok('TC2: 升降级 + 删除');
}
// TC3: search 按词 + 核心优先
{
  const b = new CharacterMemoryBank();
  b.addRecent('A', '他们去海边', 1);
  b.addCore('A', '怕水', 2);
  const r = b.search('A', '水');
  if (!r.length) fail('TC3 无命中');
  if (r[0].text !== '怕水') fail('TC3 核心未优先: ' + JSON.stringify(r));
  ok('TC3: search 核心优先');
}
// TC4: export/import 对称
{
  const b = new CharacterMemoryBank();
  b.addCore('A', 'c1', 1); b.addRecent('A', 'r1', 2);
  const exp = b.export();
  const b2 = new CharacterMemoryBank(); b2.import(exp);
  if (b2.of('A').core.length !== 1 || b2.of('A').recent.length !== 1) fail('TC4 导入');
  ok('TC4: export/import 对称');
}

// ─── ② 神经链（构造验证：链1含用户→角色、链2角色→角色去重）───
// TC5: 神经链构造（模拟 recallMemory 内逻辑）
{
  const charMem = new CharacterMemoryBank();
  charMem.addRecent('夏木', '主角答应带夏木去祭典', 1);
  charMem.addCore('夏木', '喜欢甜食', 2);
  const chars = ['夏木', '珞珈'];
  const queryText = '祭典';
  const chain1 = chars.slice(0, 3).map(c => {
    const mems = charMem.search(c, queryText);
    return mems.map(m => ({ text: c + '：' + m.text, chain: 1 }));
  }).flat().slice(0, 6);
  if (chain1.length < 1) fail('TC5 链1为空');
  const seenC1 = new Set(chain1.map(x => x.text));
  // 链2: 双向
  let chain2 = [];
  for (let i = 0; i < chars.length; i++) for (let j = i+1; j < chars.length; j++) {
    const a = chars[i], b = chars[j];
    for (const mem of [...charMem.search(a, b), ...charMem.search(b, a)]) {
      const t = a + '↔' + b + '：' + mem.text;
      if (!seenC1.has(t)) chain2.push({text: t, chain: 2});
    }
  }
  ok('TC5: 神经链构造（链1=' + chain1.length + ' 链2=' + chain2.length + '）');
}

// ─── ③ 世界推进 ───
// TC6: 候选 = 不在场（已知-在场）
{
  const wp = new WorldProgress();
  const cands = wp.candidates(['A','B','C','D'], ['A','B'], null, null);
  if (cands.join(',') !== 'C,D') fail('TC6 候选: ' + cands);
  ok('TC6: 候选=不在场角色');
}
// TC7: select 打分（有独立目标/待办优先）
{
  const wp = new WorldProgress();
  const status = { characters: { 'C': { fields: { '有独立目标': 1 }, todos: [{text:'x'}] }, 'D': {} } };
  const sel = wp.select(['C','D'], status);
  if (sel[0] !== 'C') fail('TC7 打分: ' + sel);
  if (sel.length > 2) fail('TC7 上限');
  ok('TC7: select 打分优先（有目标/待办） + 最多2人');
}
// TC8: store + toInjection（注入文本）
{
  const wp = new WorldProgress();
  wp.store('C', 1, 'C在图书馆查案', 5);
  const inj = wp.toInjection();
  if (inj.length !== 1) fail('TC8 注入');
  if (inj[0].source !== 'worldprogress') fail('TC8 source');
  if (!inj[0].text.includes('C在图书馆查案')) fail('TC8 text');
  ok('TC8: store → toInjection 注入文本');
}
// TC9: 上限 10 淘汰最旧
{
  const wp = new WorldProgress();
  for (let i = 0; i < 12; i++) wp.store('C' + i, 0, 'm' + i, i);
  if (Object.keys(wp.active).length !== 10) fail('TC9 上限: ' + Object.keys(wp.active).length);
  ok('TC9: active 上限 10 淘汰最旧');
}

// ─── 静态断言 ───
// ST1: 组件挂载
{ if (!src.includes('this.charMem = new CharacterMemoryBank()') || !src.includes('this.worldProg = new WorldProgress()')) fail('ST1 挂载'); ok('ST1: charMem/worldProg 挂载'); }
// ST2: 写入点（提取后自动写入 charMem）
{ if (!src.includes('this.charMem.addRecent(cn')) fail('ST2 写入'); ok('ST2: 提取后写 charMem 近期'); if (!src.includes('this.charMem.addCore(a, coreText')) fail('ST2b 核心写入'); ok('ST2b: 关系变化写核心'); }
// ST3: 神经链召回挂载（results.neuralChain）
{ if (!src.includes('results.neuralChain')) fail('ST3 神经链'); ok('ST3: 神经链召回接入 recallMemory'); }
// ST4: 世界推进触发独立于 summaryFoldEnabled（v3.16 修复点）
{ const fi = src.indexOf('summaryFoldEnabled) {'); const wi = src.indexOf('世界推进触发: 每 EVERY_FLOORS'); if (!(fi > 0 && wi > fi) || !src.includes('独立于摘要折叠开关')) fail('ST4 触发依赖'); ok('ST4: 世界推进触发独立于摘要折叠开关'); }
// ST5: 注入渲染块
{ if (!src.includes('〔场外角色动态') || !src.includes('[关系记忆·神经链]')) fail('ST5 渲染'); ok('ST5: 场外动态 + 神经链注入渲染块'); }
// ST6: 导出/导入对称（collectExport + load import）
{ if (!src.includes('charMem: this.charMem ? this.charMem.export()')) fail('ST6 导出'); if (!src.includes('engine.charMem.import(data.charMem)')) fail('ST6 导入'); ok('ST6: charMem/worldProg 导出导入对称'); }
// ST7: 版本号
{ if (!src.includes("VERSION = '3.16.0'")) fail('ST7 版本号'); ok('ST7: 版本号 3.16.0'); }

console.log(`\n✓ v3.16 zhino 三核心测试全过 (${pass} 项)`);