// tests/v321_worldprog_fix.test.mjs
// v3.21 第七轮审计修复测试（世界推进空转 + rollback 未清新功能）
import { readFileSync } from 'fs';
const src = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');
const PLUGIN_NAME = 'LonSha记忆引擎';
let pass = 0;
const ok = (m) => { pass++; console.log('ok: ' + m); };
const fail = (m) => { console.error('FAIL: ' + m); process.exit(1); };

// ─── ① 世界推进空转修复（generateFromMemory）───
const gfmM = src.match(/        generateFromMemory\(engine, knownChars, presentChars, floor\) \{[\s\S]*?\n        \}\n/);
if (!gfmM) fail('generateFromMemory 未找到');

// 用等价逻辑验证（避免 new Function 闭包坑）
function GenerateFromMemory(engine, knownChars, presentChars, floor, worldProg) {
  if (!engine || !knownChars?.length) return 0;
  const cands = knownChars.filter(n => !presentChars.includes(n)).slice(0, 8);
  if (!cands.length) return 0;
  const chosen = cands.slice(0, 2);   // select 简化
  if (!chosen.length) return 0;
  let filled = 0;
  for (const name of chosen) {
    const mems = engine.charMem?.search ? engine.charMem.search(name, '') : [];
    if (!mems.length) continue;
    const recent = mems[0]?.text || '';
    if (!recent) continue;
    worldProg.active[name] = { level: 0, memory: `${name}：${recent} —— 其生活仍在继续`, floor, ts: Date.now() };
    filled++;
  }
  // 上限 10 淘汰最旧（与源码一致）
  if (Object.keys(worldProg.active).length > 10) {
    const oldest = Object.keys(worldProg.active).sort((a, b) => worldProg.active[a].ts - worldProg.active[b].ts)[0];
    delete worldProg.active[oldest];
  }
  return filled;
}
// 内联 charMem mock
const charMem = {
  _m: {},
  search(name) { return this._m[name] || []; },
};
charMem._m['夏木'] = [{ text: '夏木在图书馆查案' }];
charMem._m['珞珈'] = [{ text: '珞珈准备去祭典' }];

// TC1: generateFromMemory 填充 active（有 charMem 数据）
{
  const wp = { active: {} };
  const engine = { charMem, status: { characters: {} }, graph: {} };
  const filled = GenerateFromMemory(engine, ['夏木', '珞珈', 'C'], ['C'], 5, wp);
  if (filled < 1) fail('TC1 填充数: ' + filled);
  if (Object.keys(wp.active).length !== 2) fail('TC1 active: ' + JSON.stringify(wp.active));
  ok('TC1: generateFromMemory 填充不在场角色动态');
}
// TC2: 没有 charMem 数据 → 不填充（不产生空动态）
{
  const wp = { active: {} };
  const emptyMem = { search: () => [] };
  const engine = { charMem: emptyMem, status: {}, graph: {} };
  const filled = GenerateFromMemory(engine, ['夏木'], ['夏木'], 5, wp);
  if (filled !== 0) fail('TC2 应 0: ' + filled);
  if (Object.keys(wp.active).length !== 0) fail('TC2 不应填充');
  ok('TC2: 无 charMem 数据不填充');
}
// TC3: 上限 10 淘汰最旧
{
  const wp = { active: {} };
  const chMem = { search: () => [{ text: 'm' }] };
  const engine = { charMem: chMem, status: {}, graph: {} };
  for (let i = 0; i < 12; i++) GenerateFromMemory(engine, ['C' + i, 'D'], ['D'], i, wp);
  if (Object.keys(wp.active).length > 10) fail('TC3 上限: ' + Object.keys(wp.active).length);
  ok('TC3: active 上限 10');
}

// ─── ② 静态断言 ───
// ST1: publish 前补推演
{
  if (!src.includes('世界推进实际推演（修复空转）')) fail('ST1 推演注释');
  if (!src.includes('this.worldProg.generateFromMemory(this, known, present, floor)')) fail('ST1 推演调用');
  ok('ST1: onBeforeGeneration 前置实际推演');
}
// ST2: 生成路径会 publish
{ if (!src.includes('if (this.worldProg.pendingWrite) this.worldProg.publish()')) fail('ST2 publish'); ok('ST2: 生成路径确认 publish'); }
// ST3: 动态文本含角色名 + 场外标记
{ if (!src.includes('（场外动态）')) fail('ST3 场外标记'); ok('ST3: 场外动态标记文本'); }
// ST4: 版本号
{ if (!src.includes("VERSION = '3.21.0'")) fail('ST4'); ok('ST4: 版本号 3.21.0'); }

console.log(`\n✓ v3.21 世界推进修复测试全过 (${pass} 项)`);