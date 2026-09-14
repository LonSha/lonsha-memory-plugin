// [v3.89] swipe 感知召回缓存（三元组定位符校验）专项测试
import { readFileSync } from 'fs';
import assert from 'assert';

const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf8');
const sui = readFileSync('/home/user/lonsha-memory-plugin/settings-ui.js', 'utf8');
const man = JSON.parse(readFileSync('/home/user/lonsha-memory-plugin/manifest.json', 'utf8'));

// ---------- 静态接线检查 ----------
assert.ok(src.includes("swipeFingerprintGuard: true,   // [v3.89]"), 'config 默认值在位');
assert.ok(src.includes('this._recallCache.fp === curFp'), '命中校验含指纹位');
assert.ok(src.includes("fp: (this.config.config.swipeFingerprintGuard !== false && _cm) ? msgFpOf(_cm) : ''"), '缓存写入含指纹位（写入路径同受开关门控）');
assert.ok(sui.includes("ck('swipeFingerprintGuard', 'swipe 指纹校验'"), '设置开关在位');
// [v3.92] 硬编码 -> 跨源自洽（真实不变量是两源相等，不是等于某字面量）
const __verIdx = (src.match(/const VERSION = '([^']+)'/) || [])[1];
assert.ok(__verIdx, 'index.js 未找到 VERSION 常量');
assert.match(__verIdx, /^\d+\.\d+\.\d+$/, `VERSION 非法 semver: ${__verIdx}`);
assert.strictEqual(man.version, __verIdx, `manifest(${man.version}) 与 index.js VERSION(${__verIdx}) 漂移`);
console.log('✓ 静态接线检查通过');

// ---------- 提取 msgFpOf 及依赖（花括号计数） ----------
function extractFn(source, name) {
  const marker = 'function ' + name + '(';
  const start = source.indexOf(marker);
  assert.ok(start > 0, `找到函数 ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0, end = -1;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  return source.slice(start, end + 1);
}
const errLogFn = extractFn(src, 'errLog');
const hash32Fn = extractFn(src, 'hash32');
const msgTextFn = extractFn(src, 'msgTextOf');
const msgFpFn = extractFn(src, 'msgFpOf');
const lib = new Function('errLog', `'use strict'; ${errLogFn}\n${hash32Fn}\n${msgTextFn}\n${msgFpFn}\nreturn { hash32, msgTextOf, msgFpOf };`)(() => {});
const { msgFpOf, hash32 } = lib;

// ---------- 测试 1: 指纹函数行为（同文本同 swipe 同 fp；换 swipe 变 fp；换文本变 fp） ----------
{
  const base = { is_user: false, swipe_id: 0, swipes: ['变体A正文', '变体B正文'], send_date: '2026-09-14 10:00:00' };
  const fpA0 = msgFpOf(base);
  const fpB = msgFpOf({ ...base, swipe_id: 1 });
  assert.notStrictEqual(fpA0, fpB, '不同 swipe 变体 → 不同指纹');
  // 模拟翻回旧变体（swipe_id 0）→ 指纹还原
  assert.strictEqual(msgFpOf({ ...base, swipe_id: 0 }), fpA0, '翻回旧变体 → 指纹一致（变体级复用依据）');
  // 编辑正文 → 指纹变化
  assert.notStrictEqual(msgFpOf({ ...base, swipes: ['变体A正文改', '变体B正文'], swipe_id: 0 }), fpA0, '编辑正文 → 指纹变化');
  // 空消息容灾
  assert.strictEqual(typeof msgFpOf(null), 'string');
  console.log('✓ msgFpOf 指纹行为验证（翻变体变化/翻回还原/编辑变化/容灾）');
}

// ---------- 测试 2: 缓存命中判定逻辑仿真（复刻 v3.89 命中条件） ----------
function makeEngine(configOverrides = {}) {
  return {
    config: { config: { recallCacheEnabled: true, swipeFingerprintGuard: true, debugMode: false, ...configOverrides } },
    _recallCache: null
  };
}
function tryCacheHit(engine, chat) {
  // 复刻 onBeforeGeneration 缓存命中路径（v3.89 版）
  if (!engine.config.config.recallCacheEnabled || !engine._recallCache) return null;
  const ctxChat = chat;
  const curFloor = ctxChat.length - 1;
  const qKey = 'query-abc';
  const curMsg = ctxChat[curFloor];
  const curFp = (engine.config.config.swipeFingerprintGuard !== false && curMsg) ? msgFpOf(curMsg) : '';
  if (engine._recallCache.floor === curFloor && engine._recallCache.queryKey === qKey && engine._recallCache.injection
      && engine._recallCache.fp === curFp) {
    return engine._recallCache.injection;   // 命中
  }
  return null;   // 未命中 → 重算召回
}
function writeCache(engine, chat, injection) {
  const cc = chat;
  const _cm = cc[cc.length - 1];
  engine._recallCache = { floor: cc.length - 1, queryKey: 'query-abc', injection, fp: _cm ? msgFpOf(_cm) : '' };
}

{
  const chat = [
    { is_user: true, mes: '用户消息' },
    { is_user: false, swipe_id: 0, swipes: ['回复甲', '回复乙'], send_date: '2026-09-14 10:00:00' }
  ];
  const eng = makeEngine();

  // 第一次生成 → 写缓存
  writeCache(eng, chat, '注入V1');
  assert.strictEqual(eng._recallCache.fp, msgFpOf(chat[1]), '写入时指纹为末楼指纹');

  // 同变体重roll → 命中（v2.9 原意保留）
  assert.strictEqual(tryCacheHit(eng, chat), '注入V1', '同变体重roll → 缓存命中');

  // 翻到变体1 → 指纹变化 → 失效（v3.89 修复点）
  chat[1].swipe_id = 1;
  assert.strictEqual(tryCacheHit(eng, chat), null, '翻到不同变体 → 缓存失效重算');

  // 重算后写入新指纹
  writeCache(eng, chat, '注入V2');
  assert.strictEqual(tryCacheHit(eng, chat), '注入V2', '新变体下重roll → 新缓存命中');

  // 翻回变体0 → 旧指纹 → 失效（旧变体注入已不匹配新缓存条目；一致性优先）
  chat[1].swipe_id = 0;
  assert.strictEqual(tryCacheHit(eng, chat), null, '翻回旧变体 → 当前缓存失效重算');

  // 编辑正文 → 失效
  chat[1].swipe_id = 0;
  writeCache(eng, chat, '注入V3');
  chat[1].swipes[0] = '回复甲（被编辑）';
  assert.strictEqual(tryCacheHit(eng, chat), null, '编辑末楼正文 → 缓存失效');

  // 换楼 → floor 不匹配 → 失效
  writeCache(eng, chat, '注入V4');
  chat.push({ is_user: true, mes: '新楼层' });
  assert.strictEqual(tryCacheHit(eng, chat), null, '新增楼层 → floor 变化失效');
  console.log('✓ 缓存三元组判定仿真：同变体命中/翻变体失效/翻回失效/编辑失效/换楼失效');
}

// ---------- 测试 3: 开关关闭 → 行为退回 v2.9（写入/命中两侧指纹位恒空串，翻变体也命中） ----------
{
  const chat = [
    { is_user: true, mes: '用户消息' },
    { is_user: false, swipe_id: 0, swipes: ['回复甲', '回复乙'], send_date: '2026-09-14 10:00:00' }
  ];
  const eng = makeEngine({ swipeFingerprintGuard: false });
  // 写入路径复刻 v3.89 实现（门控后）
  const _cm = chat[chat.length - 1];
  eng._recallCache = { floor: chat.length - 1, queryKey: 'query-abc', injection: '注入V1',
    fp: (eng.config.config.swipeFingerprintGuard !== false && _cm) ? msgFpOf(_cm) : '' };
  assert.strictEqual(eng._recallCache.fp, '', '开关关闭 → 写入指纹位为空串');
  // 翻变体后仍命中（v2.9 原行为）
  chat[1].swipe_id = 1;
  assert.strictEqual(tryCacheHit(eng, chat), '注入V1', '开关关闭 + 翻变体 → 仍命中（退回 v2.9 行为）');
  // 对照：开关开启时同样场景必须失效（独立 chat，不与前段共享状态）
  const chatOn = [
    { is_user: true, mes: '用户消息' },
    { is_user: false, swipe_id: 0, swipes: ['回复甲', '回复乙'], send_date: '2026-09-14 10:00:00' }
  ];
  const engOn = makeEngine();
  const _cm2 = chatOn[chatOn.length - 1];
  engOn._recallCache = { floor: chatOn.length - 1, queryKey: 'query-abc', injection: '注入V1',
    fp: (engOn.config.config.swipeFingerprintGuard !== false && _cm2) ? msgFpOf(_cm2) : '' };
  assert.notStrictEqual(engOn._recallCache.fp, '', '开关开启 → 写入真实指纹');
  assert.strictEqual(tryCacheHit(engOn, chatOn), '注入V1', '开关开启 + 同变体 → 命中（基线）');
  chatOn[1].swipe_id = 1;
  assert.strictEqual(tryCacheHit(engOn, chatOn), null, '开关开启 + 翻变体 → 失效（对照）');
  console.log('✓ 开关门控对称性：关闭退回 v2.9（翻变体命中），开启则失效重算');
}

console.log('\n✓ v3.89 swipe 指纹校验专项测试全部通过');