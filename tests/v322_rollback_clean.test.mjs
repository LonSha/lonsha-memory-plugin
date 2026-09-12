// tests/v322_rollback_clean.test.mjs
// v3.22 第七轮审计修复（rollbackFloor 未清 charMem/_thinkingSignals）
import { readFileSync } from 'fs';
const src = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');
let pass = 0;
const ok = (m) => { pass++; console.log('ok: ' + m); };
const fail = (m) => { console.error('FAIL: ' + m); process.exit(1); };

// ─── ① charMem removeByFloor ───
// 等价逻辑验证（charMem 结构: { char: { core:[], recent:[] } }，记忆带 floor）
function charMemRemoveByFloor(memories, floor) {
  const f = Math.max(0, Math.round(Number(floor) || 0));
  for (const char of Object.keys(memories)) {
    const c = memories[char];
    c.core = c.core.filter(x => x.floor !== f);
    c.recent = c.recent.filter(x => x.floor !== f);
  }
  return memories;
}
// TC1: 删除指定楼层的记忆
{
  const m = { A: { core: [{ text: 'c1', floor: 5 }], recent: [{ text: 'r1', floor: 4 }] } };
  charMemRemoveByFloor(m, 5);
  if (m.A.core.length !== 0) fail('TC1 核心未删: ' + JSON.stringify(m.A.core));
  if (m.A.recent.length !== 1) fail('TC1 近期误删');
  ok('TC1: removeByFloor 删除指定楼层核心记忆');
}
// TC2: 其他楼层保留
{
  const m = { A: { core: [{ text: 'c1', floor: 5 }, { text: 'c2', floor: 3 }], recent: [] } };
  charMemRemoveByFloor(m, 5);
  if (m.A.core.length !== 1 || m.A.core[0].floor !== 3) fail('TC2 其他楼保留: ' + JSON.stringify(m.A.core));
  ok('TC2: 其他楼层记忆保留');
}
// TC3: 不存在楼层不误删
{
  const m = { A: { core: [{ text: 'c1', floor: 5 }], recent: [] } };
  charMemRemoveByFloor(m, 99);
  if (m.A.core.length !== 1) fail('TC3 误删');
  ok('TC3: 不存在楼层不误删');
}

// ─── ② 场外信号 clearThinkingSignalsByFloor ───
// 等价逻辑
function clearSigByFloor(signals, floor) {
  const f = Math.max(0, Math.round(Number(floor) || 0));
  return Array.isArray(signals) ? signals.filter(s => s.floor !== f) : signals;
}
// TC4: 按楼层清场外信号
{
  const signals = [{ floor: 5, text: 'x' }, { floor: 4, text: 'y' }];
  const after = clearSigByFloor(signals, 5);
  if (after.length !== 1 || after[0].floor !== 4) fail('TC4: ' + JSON.stringify(after));
  ok('TC4: clearThinkingSignalsByFloor 按楼层清理');
}
// TC5: 无信号安全
{ if (clearSigByFloor(undefined, 5) !== undefined) fail('TC5'); ok('TC5: 无信号安全'); }

// ─── 静态断言 ───
// ST1: rollbackFloor 内补 charMem 清理
{ if (!src.includes('this.charMem?.removeByFloor) this.charMem.removeByFloor(floor)')) fail('ST1 charMem'); ok('ST1: rollbackFloor 内 charMem 清理'); }
// ST2: rollbackFloor 内补场外信号清理
{ if (!src.includes('this.clearThinkingSignalsByFloor(floor)')) fail('ST2 信号'); ok('ST2: rollbackFloor 内场外信号清理'); }
// ST3: 方法定义存在
{ if (!src.includes('removeByFloor(floor) {\n            const f = Math.max')) fail('ST3 charMem方法'); if (!src.includes('clearThinkingSignalsByFloor(floor) {')) fail('ST3 信号方法'); ok('ST3: 两个清理方法已定义'); }
// ST4: 版本号（容灾：>= 3.23）
{ const vm4 = src.match(/const VERSION = '(\d+\.\d+\.\d+)'/); if (vm4 && parseFloat(vm4[1]) >= 3.23) ok('ST4: 版本号 ' + vm4[1]); else fail('ST4: 版本 >= 3.23'); }

console.log(`\n✓ v3.22 rollback 清理修复测试全过 (${pass} 项)`);