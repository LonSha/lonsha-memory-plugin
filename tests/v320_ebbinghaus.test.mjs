// tests/v320_ebbinghaus.test.mjs
// v3.20 RubyPhone Ebbinghaus 衰减引擎嫁接到 charMem 测试
import { readFileSync } from 'fs';
const src = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');
let pass = 0;
const ok = (m) => { pass++; console.log('ok: ' + m); };
const fail = (m) => { console.error('FAIL: ' + m); process.exit(1); };

// 抽取 decayScore
const dM = src.match(/    function decayScore\(m, conf\) \{[\s\S]*?\n    \}\n/);
if (!dM) fail('decayScore 未找到');
const decayScore = new Function('return ' + dM[0].trim() + '; decayScore;')();

// TC1: 基础公式（重要性越高分越高）
{
  const a = { importance: 5, activationCount: 1, lastActive: Date.now() - 3600000, memoryStrength: 0.6, emotion: { arousal: 0.3 }, ts: Date.now() - 3600000 };
  const b = { importance: 1, activationCount: 1, lastActive: Date.now() - 3600000, memoryStrength: 0.6, emotion: { arousal: 0.3 }, ts: Date.now() - 3600000 };
  const sa = decayScore(a, {}), sb = decayScore(b, {});
  if (!(sa > sb)) fail('TC1 重要性: ' + sa + ' vs ' + sb);
  ok('TC1: 重要性越高 Ebbinghaus 分越高');
}
// TC2: 激活次数越多分越高（同重要性）
{
  const a = { importance: 3, activationCount: 5, lastActive: Date.now() - 3600000, memoryStrength: 0.6, emotion: { arousal: 0.5 }, ts: Date.now() - 3600000 };
  const b = { importance: 3, activationCount: 1, lastActive: Date.now() - 3600000, memoryStrength: 0.6, emotion: { arousal: 0.5 }, ts: Date.now() - 3600000 };
  if (!(decayScore(a, {}) > decayScore(b, {}))) fail('TC2');
  ok('TC2: 激活次数^0.3 提升分数');
}
// TC3: 时间衰减（越旧分越低）
{
  const recent = { importance: 3, activationCount: 1, lastActive: Date.now() - 3600000, memoryStrength: 0.6, emotion: { arousal: 0.5 }, ts: Date.now() - 3600000 };
  const old = { importance: 3, activationCount: 1, lastActive: Date.now() - 30*86400000, memoryStrength: 0.6, emotion: { arousal: 0.5 }, ts: Date.now() - 30*86400000 };
  if (!(decayScore(recent, {}) > decayScore(old, {}))) fail('TC3');
  ok('TC3: 时间衰减（最新分高）');
}
// TC4: pinned = 999
{ const p = { pinned: true }; if (decayScore(p, {}) !== 999) fail('TC4'); ok('TC4: pinned→999'); }
// TC5: resolved ×0.05
{
  const base = { importance: 3, activationCount: 1, lastActive: Date.now() - 3600000, memoryStrength: 0.6, emotion: { arousal: 0.5 }, ts: Date.now() - 3600000 };
  const r = decayScore({ ...base, resolved: true }, {});
  const nr = decayScore(base, {});
  if (!(r < nr && r < nr * 0.1)) fail('TC5: ' + r + ' vs ' + nr);
  ok('TC5: resolved ×0.05 降权');
}
// TC6: 无效输入安全（null 返回0，空对象返回有限正数）
{ if (decayScore(null, {}) !== 0) fail('TC6 null'); const v = decayScore({}, {}); if (!Number.isFinite(v) || v < 0 || v > 2000) fail('TC6 范围: ' + v); ok('TC6: 无效输入安全（null=0，空对象有限）'); }

// 抽取 _initEbbingMeta
const iM = src.match(/    function _initEbbingMeta\(m\) \{[\s\S]*?\n    \}\n/);
if (!iM) fail('_initEbbingMeta 未找到');
const _initEbbingMeta = new Function('return ' + iM[0].trim() + '; _initEbbingMeta;')();
// TC7: 初始化默认字段
{
  const m = _initEbbingMeta({ text: 'x', ts: 1000 });
  if (m.activationCount !== 1 || m.importance !== 3 || m.memoryStrength !== 0.5 || m.reinforcementCount !== 0) fail('TC7: ' + JSON.stringify(m));
  if (!m.emotion || m.emotion.arousal !== 0.5) fail('TC7 emotion');
  ok('TC7: _initEbbingMeta 默认字段');
}
// TC8: 已存在字段不清零
{
  const m = _initEbbingMeta({ activationCount: 7, importance: 5, memoryStrength: 0.9, ts: 1000 });
  if (m.activationCount !== 7 || m.importance !== 5 || m.memoryStrength !== 0.9) fail('TC8');
  ok('TC8: 已有字段保留');
}

// ─── 静态断言 ───
// ST1: GC 用 decayScore
{ if (!src.includes('scored.sort((a, b) => b.s - a.s)') || !src.includes('decayScore(m, {})')) fail('ST1'); ok('ST1: _gcCore 用 Ebbinghaus 打分'); }
// ST2: search 用衰减排序
{ if (!src.includes('const sa = decayScore(a, {}) * (a._isCore ? 3 : 1)')) fail('ST2'); ok('ST2: search 用衰减价值排序（核心×3加权）'); }
// ST3: addCore/addRecent 初始化
{ if (src.split('_initEbbingMeta(m);').length - 1 < 2) fail('ST3 初始化点'); ok('ST3: addCore/addRecent 都初始化 Ebbinghaus 字段'); }
// ST4: 版本号
{ if (!src.includes("VERSION = '3.20.0'")) fail('ST4'); ok('ST4: 版本号 3.20.0'); }

console.log(`\n✓ v3.20 Ebbinghaus 引擎测试全过 (${pass} 项)`);