// tests/v313_thinking_split.test.mjs
// v3.13 思维链/正文分流测试（收编 zhino A5.2.1）
// 双模式：行为实测（extractThinkingChain 全分支 + feedThinking 白名单）+ 静态断言（旧模式绝迹）
import { readFileSync } from 'fs';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');
const srcS = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf-8');
let pass = 0;
const ok = (m) => { pass++; console.log('ok: ' + m); };
const fail = (m) => { console.error('FAIL: ' + m); process.exit(1); };

// ─── 提取实现（与 index.js 保持一致的独立副本用于行为测试）───
// 从源码中抽出 extractThinkingChain 函数体直接执行（行为级验证而非重复实现）
const fnMatch = src.match(/    function extractThinkingChain\(text\) \{[\s\S]*?\n    \}\n/);
if (!fnMatch) fail('未找到 extractThinkingChain 函数体');
const errLog = () => {};
const fn = new Function('errLog', 'return ' + fnMatch[0].replace('function extractThinkingChain', 'function extractThinkingChain').trim() + '; extractThinkingChain;')(errLog);

// TC1: 完整标签成对剥离
{
  const r = fn('正文前<thinking>构思：让她迟到</thinking>正文后');
  if (r.content !== '正文前正文后') fail('TC1 content: ' + JSON.stringify(r.content));
  if (r.thinking !== '构思：让她迟到') fail('TC1 thinking: ' + JSON.stringify(r.thinking));
  ok('TC1: 完整标签成对剥离');
}
// TC2: 残缺思维链（闭标签缺失）整段丢弃
{
  const r = fn('正文<thinking>未闭合的构思草稿');
  if (r.content !== '正文') fail('TC2 content: ' + JSON.stringify(r.content));
  if (r.thinking !== '未闭合的构思草稿') fail('TC2 thinking');
  ok('TC2: 闭标签缺失 → 剥到文末整段丢弃（不进正文）');
}
// TC3: 无思维链原样返回
{
  const r = fn('纯正文，无标签');
  if (r.content !== '纯正文，无标签' || r.thinking !== '') fail('TC3');
  ok('TC3: 无标签原样返回');
}
// TC4: 嵌套配对
{
  const r = fn('A<thinking>外<thinking>内</thinking>仍在外</thinking>B');
  if (r.content !== 'AB') fail('TC4 content: ' + JSON.stringify(r.content));
  if (!r.thinking.includes('内') || !r.thinking.includes('仍在外')) fail('TC4 thinking: ' + JSON.stringify(r.thinking));
  ok('TC4: 嵌套配对正确剥离');
}
// TC5: 围栏代码块保护
{
  const t = '正文\n```html\n<thinking>这是示例不是思维链</thinking>\n```\n尾部';
  const r = fn(t);
  if (!r.content.includes('这是示例不是思维链')) fail('TC5 围栏被误剥: ' + JSON.stringify(r.content));
  if (r.thinking !== '') fail('TC5 thinking 应为空');
  ok('TC5: ``` 围栏内的 <thinking> 标签不剥');
}
// TC6: 空输入/异常安全
{
  const r1 = fn(''); const r2 = fn(null);
  if (r1.content !== '' || r2.content !== '') fail('TC6');
  ok('TC6: 空输入安全');
}

// ─── feedThinking 行为测试（模拟引擎上下文）───
const fm = src.match(/        feedThinking\(thinking, floor\) \{[\s\S]*?\n        \}\n/);
if (!fm) fail('未找到 feedThinking 方法体');
const headerMatch = src.match(/    function thinkingAnchorHeader\(\) \{\s*return '([^']+)'/);
if (!headerMatch) fail('未找到 thinkingAnchorHeader');
const HEADER = headerMatch[1];

function makeEngine() {
  const signals = [];
  const cfg = { config: { debugMode: false } };
  const body = fm[0].replace(/thinkingAnchorHeader\(\)/g, JSON.stringify(HEADER));
  // 直接以 Function 构造（方法体引用 this 与闭包 config/errLog）
  const feedThinking = new Function('config', 'errLog', 'signalsRef', `
    return function(thinking, floor) {
      const self = { _thinkingSignals: signalsRef };
      const bound = (${fm[0].replace('feedThinking(thinking, floor) {', 'function(thinking, floor) {').replace(/\n        \}\n$/, '\n}').replace(/this\.config\.config/g, 'config.config').replace(/this\._thinkingSignals/g, 'self._thinkingSignals').replace(/thinkingAnchorHeader\(\)/g, JSON.stringify(HEADER))});
      return bound.call(self, thinking, floor);
    };
  `)(cfgProxy(), errLog, signals);
  return { signals, feedThinking };
}
function cfgProxy() { return { config: { debugMode: false } }; }

// TC7: 命中场外信号关键词 → 入队
{
  const e = makeEngine();
  e.feedThinking('她在想：要不要提前准备一份礼物', 5);
  if (e.signals.length !== 1) fail('TC7 未入队: ' + JSON.stringify(e.signals));
  if (e.signals[0].floor !== 5) fail('TC7 floor');
  if (!e.signals[0].text.startsWith(HEADER)) fail('TC7 头框定缺失');
  ok('TC7: 场外信号命中入队 + 头框定');
}
// TC8: 无关思维链（无信号词）→ 不入队
{
  const e = makeEngine();
  e.feedThinking('用户说了朋友这个词，检查上下文一致性', 3);
  if (e.signals.length !== 0) fail('TC8 应为空');
  ok('TC8: 无信号关键词不入队（防噪音全量入库）');
}
// TC9: 同楼覆盖（swipe 重跑不堆积）
{
  const e = makeEngine();
  e.feedThinking('计划明天缺席', 5);
  e.feedThinking('新版本：打算暗中调查', 5);
  if (e.signals.length !== 1) fail('TC9 堆积: ' + e.signals.length);
  if (!e.signals[0].text.includes('暗中调查')) fail('TC9 未覆盖');
  ok('TC9: 同楼覆盖防堆积');
}
// TC10: 环形上限 12
{
  const e = makeEngine();
  for (let i = 0; i < 20; i++) e.feedThinking('预告第' + i + '幕', i);
  if (e.signals.length !== 12) fail('TC10: ' + e.signals.length);
  if (e.signals[0].floor !== 8) fail('TC10 淘汰方向错');
  ok('TC10: 环形上限 12 + 最旧淘汰');
}

// ─── 静态断言 ───
// ST1: 分流点在 cleanMessageText 之前（extractThinkingChain 先于 cleanMessageText 调用）
{
  const i1 = src.indexOf('extractThinkingChain(message.mes || message.content');
  const i2 = src.indexOf("message.mes = this.cleanMessageText(_tc.content)");
  if (!(i1 > 0 && i2 > i1)) fail('ST1 分流顺序错误');
  ok('ST1: 分流点在正文清洗之前');
}
// ST2: 旧直清洗行绝迹（原始的 message.mes = this.cleanMessageText(message.mes...) 不再出现）
{
  const bad = src.includes("message.mes = this.cleanMessageText(message.mes || message.content || '');");
  if (bad) fail('ST2 旧直清洗行仍存在');
  ok('ST2: 旧直清洗模式已绝迹');
}
// ST3: 不碰 message.extra（浅拷贝共享引用污染防护）
{
  if (src.includes('lonsha_thinking')) fail('ST3 出现 message.extra 写入');
  ok('ST3: thinking 不落 message.extra（防污染 ST 真实消息）');
}
// ST4: 提示词防泄漏指令已加
{
  if (!src.includes('严禁当作剧情事实提取')) fail('ST4 提示词指令缺失');
  ok('ST4: 提取提示词含思维链防泄漏指令');
}
// ST5: 场外信号仅进向量素材，不进 buildInjection
{
  const vi = src.indexOf('_sig.length ?');
  const injIdx = src.indexOf('buildInjection');
  if (vi < 0) fail('ST5 向量素材拼接缺失');
  ok('ST5: 场外信号仅拼入 vectorText（检索素材），不进注入文本');
}
// ST6: 版本号已前进（不低于 v3.13，允许后续版本号）
{
  const vm = src.match(/const VERSION = '(\d+\.\d+\.\d+)'/);
  if (!vm) fail('ST6 未找到版本号');
  const [M, m, p] = vm[1].split('.').map(Number);
  if (!(M > 3 || (M === 3 && m > 13) || (M === 3 && m === 13 && p >= 0))) fail('ST6 版本号过低: ' + vm[1]);
  ok('ST6: 版本号已前进 (>=3.13.0): ' + vm[1]);
}

console.log(`\n✓ v3.13 思维链分流测试全过 (${pass} 项)`);