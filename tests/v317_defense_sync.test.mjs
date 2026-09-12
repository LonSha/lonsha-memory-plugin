// tests/v317_defense_sync.test.mjs
// v3.17 三核心×七项目防御缝合包测试
// ① charMem 确定性 id（baibai）② charMem GC 校准（anima）③ worldProg 发布确认（shujuku）④ worldProg 对账（yuzuki）
import { readFileSync } from 'fs';
const src = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');
const PLUGIN_NAME = 'LonSha记忆引擎';
let pass = 0;
const ok = (m) => { pass++; console.log('ok: ' + m); };
const fail = (m) => { console.error('FAIL: ' + m); process.exit(1); };

const bankM = src.match(/    class CharacterMemoryBank \{[\s\S]*?\n    \}\n/);
const wpM = src.match(/    class WorldProgress \{[\s\S]*?\n    \}\n/);
const EXTERNAL_FUNCS = `function decayScore(m, conf) {
        if (!m) return 0;
        const lambda = conf?.lambda || 0.03;
        const now = Date.now();
        const lastActive = m.lastActive ? (typeof m.lastActive === 'number' ? m.lastActive : new Date(m.lastActive).getTime()) : (m.ts || now);
        const days = (now - lastActive) / 86400000;
        const hours = (now - lastActive) / 3600000;
        const importance = (m.importance !== undefined && m.importance !== null) ? m.importance : (m._isCore ? 1 : 0.5);   // [v3.20] 修复 ?? 与 ?: 优先级
        const activation = m.activationCount || 1;
        const strength = m.memoryStrength ?? (m._isCore ? 0.8 : 0.4);
        const freshHalfLife = conf?.freshHalfLife || 48;
        const reinforcement = 1 + Math.min((m.reinforcementCount || 0) * 0.15, 1.5);
        const arousal = m.emotion?.arousal ?? 0.5;
        const emotionWeight = 1 + arousal * 0.8;
        const combined = days <= (conf?.shortTermDays || 7)
            ? Math.exp(-0.1 * days) * 0.7 + emotionWeight * 0.3
            : emotionWeight * 0.7 + Math.exp(-0.1 * days) * 0.3;
        const freshness = 1 + Math.exp(-hours / freshHalfLife);
        let score = Math.max(importance, 1) * Math.pow(activation, 0.3) * Math.exp(-lambda * Math.max(days, 0)) * combined * freshness * (0.5 + strength * 0.5) * reinforcement;
        if (m.resolved) score *= 0.05;
        if (m.pinned) score = 999;
        return score;
    }\n\nfunction _initEbbingMeta(m) {
        if (!m.ts) m.ts = Date.now();
        if (m.lastActive === undefined) m.lastActive = m.ts;
        if (m.activationCount === undefined) m.activationCount = 1;
        if (m.importance === undefined) m.importance = 3;   // 1-5 默认3
        if (m.memoryStrength === undefined) m.memoryStrength = 0.5;
        if (m.reinforcementCount === undefined) m.reinforcementCount = 0;
        if (m.emotion === undefined) m.emotion = { valence: 0.5, arousal: 0.5 };
        return m;
    }\n\n`;
if (!bankM || !wpM) fail('类未找到');
const errLog = () => {};
const evalC = (code) => {
  const fn = new Function('window', 'PLUGIN_NAME', 'errLog', code + '\nreturn { CharacterMemoryBank, WorldProgress };');
  return fn({ LonShaMemory: { engine: { config: { config: { debugMode: false } } } } }, PLUGIN_NAME, errLog);
};
const { CharacterMemoryBank, WorldProgress } = evalC(EXTERNAL_FUNCS + bankM[0] + '\n' + wpM[0]);

// ─── ① 确定性 id（baibai）───
// TC1: 同角色同文本同楼层 → 同 id（幂等不重复）
{
  const b = new CharacterMemoryBank();
  b.addCore('A', '夏木与主角初遇', 1);
  b.addCore('A', '夏木与主角初遇', 1);
  const c = b.of('A').core;
  if (c.length !== 1) fail('TC1 幂等失败: ' + c.length);
  ok('TC1: 确定性 id 幂等（同内容重复写不堆积）');
}
// TC2: 不同文本 → 不同 id（新增）
{
  const b = new CharacterMemoryBank();
  b.addCore('A', '第一条', 1);
  b.addCore('A', '第二条', 1);
  if (b.of('A').core.length !== 2) fail('TC2 不同文本应新增');
  ok('TC2: 不同文本不同 id 新增');
}
// TC3: 确定性 id 稳定（同文本两次调用的 id 相等）
{
  const b = new CharacterMemoryBank();
  const m1 = b.addRecent('A', '祭典约定', 3);
  const m2 = b.addRecent('A', '祭典约定', 3);
  if (m1.id !== m2.id) fail('TC3 id 不稳定: ' + m1.id + ' vs ' + m2.id);
  ok('TC3: 确定性 id 稳定（跨调用相同）');
}
// TC4: 升降级保留确定性 id
{
  const b = new CharacterMemoryBank();
  const m = b.addRecent('A', '待升级', 1);
  b.promoteToCore('A', m.id);
  const core = b.of('A').core[0];
  if (core.id !== m.id) fail('TC4 升级丢 id');
  ok('TC4: 升降级 id 不丢失');
}

// ─── ② GC 校准（anima）───
// TC5: 超 50 条时校准淘汰（保留最新 50）——ts 相同时淘汰任意最旧
{
  const b = new CharacterMemoryBank();
  for (let i = 0; i < 60; i++) b.addCore('A', '记忆' + i, i);
  const c = b.of('A').core;
  if (c.length !== 50) fail('TC5 GC 后: ' + c.length);
  ok('TC5: GC 校准后保留 50 条');
}
// TC6: 未超上限不动作
{
  const b = new CharacterMemoryBank();
  for (let i = 0; i < 10; i++) b.addCore('A', 'm' + i, i);
  b.gc('A');
  if (b.of('A').core.length !== 10) fail('TC6 不该删');
  ok('TC6: 未超上限 GC 不动作');
}

// ─── ③ 发布确认（shujuku）───
// TC7: propose → publish 生效（detached 副本，宿主确认后发布）
{
  const wp = new WorldProgress();
  wp.propose('C', 1, 'C在图书馆查案', 5);
  if (Object.keys(wp.active).length !== 0) fail('TC7 propose 不应立即生效');
  wp.publish();
  if (Object.keys(wp.active).length !== 1) fail('TC7 publish 后应生效');
  if (wp.active.C.memory !== 'C在图书馆查案') fail('TC7 内容');
  ok('TC7: propose detached → publish 生效');
}
// TC8: discard 丢弃 pending（不生效）
{
  const wp = new WorldProgress();
  wp.propose('D', 2, 'D的行动', 6);
  wp.discard();
  if (Object.keys(wp.active).length !== 0) fail('TC8 discard 后不应生效');
  ok('TC8: discard 丢弃 pending（拒绝半提交）');
}
// TC9: revision 单调递增 + publish 后 pendingWrite 清空
{
  const wp = new WorldProgress();
  const p1 = wp.propose('A', 0, 'm1', 1);
  const p2 = wp.propose('B', 0, 'm2', 2);
  if (!(p2.revision > p1.revision)) fail('TC9 revision 未递增');
  wp.publish();
  if (wp.pendingWrite !== null) fail('TC9 publish 后 pending 未清空');
  ok('TC9: revision 单调递增 + publish 清空 pending');
}

// ─── ④ 对账（yuzuki）───
// TC10: reconcile 删除过期推进（floor > latestFloor 失活）
{
  const wp = new WorldProgress();
  wp.propose('A', 0, 'm1', 5); wp.publish();
  wp.propose('B', 0, 'm2', 7); wp.publish();
  const removed = wp.reconcile(5);   // latestFloor=5, floor>5 的 B 失活
  if (removed !== 1) fail('TC10 removed: ' + removed);
  if (wp.active.B) fail('TC10 B 未失活');
  if (!wp.active.A) fail('TC10 A 应保留');
  ok('TC10: reconcile 过期推进失活（楼层重排后）');
}

// ─── 静态断言 ───
// ST1: charMem 确定性 id（不再用 Math.random）
{
  if (src.includes("id: 'cm_' + Date.now() + '_' + Math.random")) fail('ST1 旧随机 id 残留');
  ok('ST1: charMem 确定性 id（旧随机 id 绝迹）');
}
// ST2: GC 校准器（_gcCore）
{ if (!src.includes('_gcCore')) fail('ST2 GC'); ok('ST2: GC 校准器 _gcCore'); }
// ST3: 发布确认（propose/publish/discard + revision）
{ if (!src.includes('propose(char, level, memory, floor)')) fail('ST3 propose'); if (!src.includes('publish() {') || !src.includes('discard()')) fail('ST3 publish/discard'); ok('ST3: 发布确认 propose/publish/discard'); }
// ST4: 对账挂 rollbackFloor
{ if (!src.includes('this.worldProg.discard(); this.worldProg.reconcile(floor - 1)')) fail('ST4 对账'); ok('ST4: rollbackFloor 内 世界推进隔离+对账'); }
// ST5: 宿主确认点在生成路径
{ if (!src.includes('public this.worldProg.publish()')) ok('ST5c 注释'); if (!src.includes('pendingWrite) this.worldProg.publish()')) fail('ST5 宿主确认'); ok('ST5: 生成路径宿主确认点'); }
// ST6: 版本号已前进（>= v3.17）
{
  const vm = src.match(/const VERSION = '(\d+\.\d+\.\d+)'/);
  if (!vm) fail('ST6 未找到版本号');
  const [M, m, p] = vm[1].split('.').map(Number);
  if (!(M > 3 || (M === 3 && m > 17) || (M === 3 && m === 17 && p >= 0))) fail('ST6 版本号过低: ' + vm[1]);
  ok('ST6: 版本号已前进 (>=3.17.0): ' + vm[1]);
}

console.log(`\n✓ v3.17 防御缝合包测试全过 (${pass} 项)`);