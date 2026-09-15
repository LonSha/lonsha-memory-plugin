// tests/v3108_event_chain.test.mjs
// v3.108 缝合 m61-oss/st-bionic-memory（BME）domain/memory-contract.js：
// 智能体事件链不变量校验（迁移表 / 终态封闭 / 非抛错追加 / 整链审计 / 链摘要）
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(REPO, 'event-chain.js'), 'utf8');
const idxSrc = fs.readFileSync(path.join(REPO, 'index.js'), 'utf8');
const suiSrc = fs.readFileSync(path.join(REPO, 'settings-ui.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));

function vnum(s) {
  const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}

const sbox = { module: { exports: {} }, window: undefined };
const load = new Function('globalThis', 'module', 'window',
  src + '\nreturn (typeof module !== \'undefined\' && module.exports) ? module.exports : globalThis.LonShaEventChain;');
const EC = load(sbox, sbox.module, undefined);
const T = EC.EVENT_TYPES;

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };

// ---------- 0. 版本与注册 ----------
test('【0】版本与 manifest 注册', () => {
  const v = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
  assert.ok(vnum(v) >= vnum('3.108.0'), `index.js 版本 ${v} < 3.108.0`);
  assert.ok(vnum(manifest.version) >= vnum('3.108.0'), `manifest 版本 ${manifest.version} < 3.108.0`);
  assert.ok(manifest.extra_js.includes('event-chain.js'), 'event-chain.js 已注册 extra_js');
  ok('版本 / manifest 注册');
});

// ---------- 1. 类型表与终态 ----------
test('【1】12 类事件 / 4 个终态', () => {
  assert.strictEqual(Object.keys(T).length, 12, '12 个事件类型');
  assert.deepStrictEqual([...EC.TERMINAL_TYPES].sort(), ['run_cancelled', 'run_completed', 'run_failed', 'run_suspended'], '4 个终态');
  assert.strictEqual(EC.isEventType(T.TOOL_STARTED), true);
  assert.strictEqual(EC.isEventType('bogus'), false);
  assert.strictEqual(EC.isEventType(null), false);
  assert.strictEqual(EC.isTerminal(T.RUN_FAILED), true);
  assert.strictEqual(EC.isTerminal(T.MODEL_REQUESTED), false);
  ok('类型表 / 终态集');
});

// ---------- 2. 迁移不变量 ----------
test('【2】canFollow 主链与特殊规则', () => {
  assert.ok(EC.canFollow(T.RUN_STARTED, T.MODEL_REQUESTED), 'start→request');
  assert.ok(EC.canFollow(T.MODEL_REQUESTED, T.ASSISTANT_MESSAGE), 'request→assistant');
  assert.ok(EC.canFollow(T.MODEL_REQUESTED, T.CONTEXT_SUMMARY_CREATED), 'request→summary（上下文压缩链）');
  assert.ok(EC.canFollow(T.CONTEXT_SUMMARY_CREATED, T.CONTEXT_COMPACTED), 'summary→compacted');
  assert.ok(EC.canFollow(T.CONTEXT_COMPACTED, T.MODEL_REQUESTED), 'compacted→request');
  assert.ok(EC.canFollow(T.ASSISTANT_MESSAGE, T.TOOL_STARTED), 'assistant→tool_started');
  assert.ok(EC.canFollow(T.TOOL_STARTED, T.TOOL_FINISHED), 'tool_started→finished');
  assert.ok(EC.canFollow(T.TOOL_STARTED, T.TOOL_INTERRUPTED), 'tool_started→interrupted');
  assert.ok(EC.canFollow(T.TOOL_FINISHED, T.MODEL_REQUESTED), 'finished→request（继续下一轮）');
  assert.ok(EC.canFollow(T.TOOL_FINISHED, T.TOOL_STARTED), 'finished→started（并行工具）');
  assert.ok(EC.canFollow(T.ASSISTANT_MESSAGE, T.RUN_COMPLETED), 'assistant→completed（正常收尾）');
  // 终态事件可随时直接结束（失败/取消/挂起）
  assert.ok(EC.canFollow(T.MODEL_REQUESTED, T.RUN_FAILED), '任意点可失败');
  assert.ok(EC.canFollow(T.TOOL_STARTED, T.RUN_CANCELLED), '任意点可取消');
  assert.ok(EC.canFollow(T.ASSISTANT_MESSAGE, T.RUN_SUSPENDED), '任意点可挂起');
  // RUN_COMPLETED 只能由 ASSISTANT_MESSAGE 转入（源码同规则）
  assert.strictEqual(EC.canFollow(T.RUN_STARTED, T.RUN_COMPLETED), false, 'start 不能直接 completed');
  assert.strictEqual(EC.canFollow(T.MODEL_REQUESTED, T.RUN_COMPLETED), false, 'request 不能直接 completed');
  assert.strictEqual(EC.canFollow(T.TOOL_FINISHED, T.RUN_COMPLETED), false, 'finished 不能直接 completed');
  // 非法跳跃
  assert.strictEqual(EC.canFollow(T.RUN_STARTED, T.ASSISTANT_MESSAGE), false, 'start 不能直接 assistant');
  assert.strictEqual(EC.canFollow(T.ASSISTANT_MESSAGE, T.MODEL_REQUESTED), false, 'assistant 不能直接 request');
  assert.strictEqual(EC.canFollow(T.RUN_STARTED, 'bogus'), false, '非法目标');
  assert.strictEqual(EC.canFollow('bogus', T.RUN_STARTED), false, '非法来源');
  ok('主链 / 上下文压缩链 / 工具链 / 特殊规则');
});

// ---------- 3. 终态封闭 ----------
test('【3】终态之后一律非法（故障可见性核心）', () => {
  for (const term of EC.TERMINAL_TYPES) {
    for (const t of Object.values(T)) {
      assert.strictEqual(EC.canFollow(term, t), false, `${term} 之后不应允许 ${t}`);
    }
  }
  // 真实场景：请求已失败却又收到助手消息（重试串包 / 双通道竞争）
  assert.strictEqual(EC.canFollow(T.RUN_FAILED, T.ASSISTANT_MESSAGE), false, '失败后又收到消息 → 违规');
  assert.strictEqual(EC.canFollow(T.RUN_CANCELLED, T.TOOL_FINISHED), false, '取消后工具仍完成 → 违规');
  // 同一终态重复上报也是违规（防重复收尾写入）
  assert.strictEqual(EC.canFollow(T.RUN_COMPLETED, T.RUN_COMPLETED), false, '重复 completed 违规');
  ok('终态封闭（含重复终态）');
});

// ---------- 4. append 非抛错语义 ----------
test('【4】append 不抛错，回报 reason/expected', () => {
  const r1 = EC.append([], { type: T.RUN_STARTED });
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r1.chain.length, 1);
  const r2 = EC.append(r1.chain, T.MODEL_REQUESTED);
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(r2.chain.length, 2);
  // 非法迁移不抛错，原链不变
  const r3 = EC.append(r2.chain, T.TOOL_STARTED);
  assert.strictEqual(r3.ok, false);
  assert.match(r3.reason, /event chain violation: model_requested -> tool_started/);
  assert.deepStrictEqual(r3.expected, ['assistant_message', 'context_summary_created'], '回报期望后续事件');
  assert.strictEqual(r3.chain.length, 2, '非法时链不被污染');
  // 未知类型
  const r4 = EC.append(r2.chain, { type: 'nope' });
  assert.strictEqual(r4.ok, false);
  assert.match(r4.reason, /unknown event type: nope/);
  // 终态之后 expected 为空数组
  const done = EC.append(EC.append(r2.chain, T.ASSISTANT_MESSAGE).chain, T.RUN_COMPLETED);
  const r5 = EC.append(done.chain, T.MODEL_REQUESTED);
  assert.strictEqual(r5.ok, false);
  assert.deepStrictEqual(r5.expected, [], '终态后期望集为空');
  // 纯函数：入参数组不被修改
  const base = [{ type: T.RUN_STARTED }];
  EC.append(base, T.MODEL_REQUESTED);
  assert.strictEqual(base.length, 1, '入参数组未被就地修改');
  // 支持纯字符串形式
  const r6 = EC.append([], T.RUN_STARTED);
  assert.strictEqual(r6.chain[0].type, T.RUN_STARTED, '字符串/对象两种入参均可');
  ok('非抛错 / reason / expected / 纯函数');
});

// ---------- 5. 整链校验 ----------
test('【5】validateChain 定位首个违规', () => {
  const good = [T.RUN_STARTED, T.MODEL_REQUESTED, T.ASSISTANT_MESSAGE, T.TOOL_STARTED, T.TOOL_FINISHED, T.MODEL_REQUESTED, T.ASSISTANT_MESSAGE, T.RUN_COMPLETED];
  const g = EC.validateChain(good);
  assert.strictEqual(g.valid, true, '正常链通过');
  assert.strictEqual(g.stoppedAt, -1);
  assert.strictEqual(g.lastType, T.RUN_COMPLETED);
  // 中途出现非法跳跃
  const bad = [T.RUN_STARTED, T.MODEL_REQUESTED, T.TOOL_STARTED];
  const b = EC.validateChain(bad);
  assert.strictEqual(b.valid, false);
  assert.strictEqual(b.stoppedAt, 2, '定位到第 3 个事件（index 2）');
  assert.strictEqual(b.issues[0].previous, T.MODEL_REQUESTED);
  // 未知类型也定位
  const unk = [T.RUN_STARTED, 'nope'];
  const u = EC.validateChain(unk);
  assert.strictEqual(u.valid, false);
  assert.strictEqual(u.stoppedAt, 1);
  assert.match(u.issues[0].reason, /unknown event type/);
  // 空链合法（无事件即无违规）
  const e = EC.validateChain([]);
  assert.strictEqual(e.valid, true);
  assert.strictEqual(e.lastType, null);
  ok('整链审计 / 定位 / 空链');
});

// ---------- 6. 链摘要 ----------
test('【6】summarizeChain 计数与诊断', () => {
  const chain = [T.RUN_STARTED, T.MODEL_REQUESTED, T.ASSISTANT_MESSAGE, T.TOOL_STARTED, T.TOOL_FINISHED, T.MODEL_REQUESTED, T.ASSISTANT_MESSAGE, T.RUN_COMPLETED];
  const s = EC.summarizeChain(chain);
  assert.strictEqual(s.length, 8);
  assert.strictEqual(s.counts[T.MODEL_REQUESTED], 2, '类型计数');
  assert.strictEqual(s.counts[T.TOOL_STARTED], 1);
  assert.strictEqual(s.toolRounds, 1, '工具轮次');
  assert.strictEqual(s.lastType, T.RUN_COMPLETED);
  assert.strictEqual(s.terminal, true, '末事件为终态');
  assert.strictEqual(s.started, true, '含 run_started');
  const mid = EC.summarizeChain([T.RUN_STARTED, T.MODEL_REQUESTED]);
  assert.strictEqual(mid.terminal, false, '未结束不算终态');
  const empty = EC.summarizeChain(null);
  assert.strictEqual(empty.length, 0);
  assert.strictEqual(empty.terminal, false);
  ok('计数 / 轮次 / 终态判定');
});

// ---------- 7. 行为等价：与源码迁移表逐条对齐 ----------
test('【7】与源码 AGENT_EVENT_TRANSITIONS 逐条对齐', () => {
  // 源码表中明确列出的全部边（照抄自 memory-contract.js）
  const expected = {
    run_started: ['model_requested'],
    model_requested: ['assistant_message', 'context_summary_created'],
    context_summary_created: ['model_requested', 'context_compacted'],
    context_compacted: ['model_requested'],
    assistant_message: ['tool_started', 'run_completed'],
    tool_started: ['tool_finished', 'tool_interrupted'],
    tool_finished: ['tool_started', 'model_requested'],
    tool_interrupted: [],
  };
  for (const [from, tos] of Object.entries(expected)) {
    for (const to of Object.values(T)) {
      // 源码特殊规则：非 run_completed 的终态事件可随时直接进入（不走迁移表），
      // 故此处只对「非终态目标 + run_completed」做表驱动比较。
      if (EC.isTerminal(to) && to !== T.RUN_COMPLETED) {
        assert.strictEqual(EC.canFollow(from, to), true, `${from} 可随时进入 ${to}（源码规则）`);
        continue;
      }
      const expect = tos.includes(to);
      assert.strictEqual(EC.canFollow(from, to), expect, `canFollow(${from}, ${to}) 应为 ${expect}`);
    }
  }
  // 终态来源在源码表中不存在 → 全部为假（已由【3】覆盖）
  for (const term of EC.TERMINAL_TYPES) {
    assert.deepStrictEqual(EC.ALLOWED_TRANSITIONS[term], [], `${term} 迁移表为空`);
  }
  ok('与源码逐条等价');
});

// ---------- 8. index.js 接线（正向） ----------
test('【8】index.js 接线：callAPI 事件链审计已挂上主链路', () => {
  assert.ok(/llmEventChainEnabled:\s*false/.test(idxSrc), '默认关（不改变既有行为）');
  assert.ok(idxSrc.includes('llmEventChainEnabled !== true'), '门控为显式 !== true');
  assert.ok(idxSrc.includes('window.LonShaEventChain'), 'window 通道');
  assert.ok(idxSrc.includes("require('./event-chain.js')"), 'require 降级通道');
  assert.ok(idxSrc.includes('await this._callAPIInner(prompt)'), '包装层真实转调内层实现');
  assert.ok(/async _callAPIInner\(prompt\)/.test(idxSrc), '_callAPIInner 存在');
  assert.ok(idxSrc.includes('getLastEventChain()'), '提供诊断读取方法');
  assert.ok(EC.append([], { type: T.RUN_STARTED }).ok, '引擎可用');
  assert.ok(suiSrc.includes('llmEventChainEnabled'), 'settings-ui 声明该键（非幽灵配置）');
  // 内层实现仍保留原独立 API / 宿主降级路径（未被包装破坏）
  assert.ok(idxSrc.includes('if (cfg.apiProviderCustom && cfg.apiUrl && cfg.apiKey) {'), '独立 API 路径仍在');
  assert.ok(idxSrc.includes('generateQuietPrompt'), '宿主降级路径仍在');
  ok('接线（门控 / 双通道 / 转调 / UI 声明）');
});

// ---------- 9. 逆向审计：关闭时不引入副作用 ----------
test('【9】逆向审计：关闭时零副作用、异常不中断主链路', () => {
  // 关闭分支必须直接 return 内层实现（不构造链、不记日志）
  const m = /if \(this\.config\.config\.llmEventChainEnabled !== true\) return this\._callAPIInner\(prompt\);/.exec(idxSrc);
  assert.ok(m, '关闭分支为直接转调，无中间副作用');
  // 事件链违反只 warn（不 throw）
  const body = /async callAPI\(prompt\)[\s\S]*?\n {8}\}/.exec(idxSrc)[0];
  assert.ok(!/throw new Error\('event chain/.test(body), '链违规不抛错');
  assert.ok(/console\.warn/.test(body) && /debugMode/.test(body), '违规仅调试态告警');
  // 真实异常仍向上抛（审计不得吞掉故障）
  assert.ok(/throw e;/.test(body), '原始异常仍向上抛');
  // 引擎缺库时降级（返回内层结果）
  const noLib = idxSrc.indexOf('_eventChainLib()');
  assert.ok(noLib > 0 && idxSrc.includes('if (!EC) return this._callAPIInner(prompt);'), '缺引擎时降级');
  // 迁移校验本身是纯函数 → 重复调用结果一致
  const a = EC.canFollow(T.MODEL_REQUESTED, T.ASSISTANT_MESSAGE);
  const b = EC.canFollow(T.MODEL_REQUESTED, T.ASSISTANT_MESSAGE);
  assert.strictEqual(a, b, '纯函数无状态');
  ok('关闭零副作用 / 不吞异常 / 缺库降级');
});

console.log(`[v3108] ${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;