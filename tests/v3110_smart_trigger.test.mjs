/**
 * v3.110 — 事件性门控（缝合 bionic maintenance/smart-trigger.js）
 *
 * 覆盖：
 *   0  版本与 manifest 注册
 *   1  normalizePending：起点/终点/省略楼/空文本/上限
 *   2  关键词评分（含封顶）
 *   3  自定义规则（命中一条即止 + 无效正则忽略）
 *   4  多轮往返 / 情绪波动 / 疑似实体
 *   5  阈值行为与可注入权重
 *   6  纯函数与确定性（入参不被修改 / 同输入同输出）
 *   7  summarizeTriggers 台账诊断
 *   8  index.js 正向接线（门控 / fail-open 降级 / 统计 / 报告）
 *   9  逆向审计：默认关时既有链路零变更
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const idxSrc = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const suiSrc = readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf8');

// 语义版本比较（v3.101 起的工程规范：parseFloat('3.100.0') === 3.1 会让断言失效）
function vnum(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}

const ST = require('../smart-trigger.js');

let pass = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };

const u = (mes, index) => ({ is_user: true, mes, index });
const a = (mes, index) => ({ is_user: false, mes, index });

// ---------- 0 ----------
test('【0】版本与 manifest 注册', () => {
  const v = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
  assert.ok(vnum(v) >= vnum('3.110.0'), `index.js 版本 ${v} < 3.110.0`);
  assert.ok(vnum(manifest.version) >= vnum('3.110.0'), `manifest 版本 ${manifest.version} < 3.110.0`);
  assert.ok(manifest.extra_js.includes('smart-trigger.js'), 'smart-trigger.js 已注册 extra_js');
  ok('版本 / manifest 注册');
});

// ---------- 1 ----------
test('【1】normalizePending：区间 / 省略楼 / 空文本 / 上限', () => {
  const chat = [u('一', 0), a('二', 1), u('', 2), a('四', 3)];
  const all = ST.normalizePending(chat, {});
  assert.deepStrictEqual(all.map(m => m.index), [0, 1, 3], '空文本楼层被剔除');
  assert.strictEqual(all[0].role, 'user');
  assert.strictEqual(all[1].role, 'assistant');

  const from1 = ST.normalizePending(chat, { lastProcessed: 0 });
  assert.deepStrictEqual(from1.map(m => m.index), [1, 3], 'lastProcessed 之后开始');

  const to2 = ST.normalizePending(chat, { lastProcessed: -1, endFloor: 2 });
  assert.deepStrictEqual(to2.map(m => m.index), [0, 1], 'endFloor 含端点');

  const omitted = ST.normalizePending(chat, { isOmitted: (m) => m.index === 1 });
  assert.deepStrictEqual(omitted.map(m => m.index), [0, 3], '番外楼被排除');

  const capped = ST.normalizePending(chat, { maxMessages: 1 });
  assert.deepStrictEqual(capped.map(m => m.index), [3], '上限取尾部（最近的更相关）');

  assert.deepStrictEqual(ST.normalizePending(null, {}), [], '非数组安全');
  assert.deepStrictEqual(ST.normalizePending([], { lastProcessed: 5 }), [], '起点越界安全');
  ok('待判定消息归一 / 区间 / 省略 / 上限');
});

// ---------- 2 ----------
test('【2】关键词评分与封顶', () => {
  const r1 = ST.evaluateTrigger([a('她突然回头。')], {});
  assert.strictEqual(r1.stats.keywordHits.includes('突然'), true);
  assert.ok(r1.score >= 1);

  const many = ST.evaluateTrigger([a('突然 没想到 原来 其实 发现')], {});
  assert.strictEqual(many.score, 2, '关键词贡献封顶 2 分');
  assert.strictEqual(many.triggered, true, '2 分达到缺省阈值');

  const none = ST.evaluateTrigger([a('今天的阳光很好。')], {});
  assert.strictEqual(none.score, 0, '无命中 0 分');
  assert.strictEqual(none.triggered, false);
  assert.deepStrictEqual(none.reasons, []);

  const customKw = ST.evaluateTrigger([a('这里出现了咒术回廊。')], { keywords: ['咒术'] });
  assert.strictEqual(customKw.stats.keywordHits[0], '咒术');
  assert.strictEqual(ST.DEFAULT_TRIGGER_KEYWORDS.includes('背叛'), true, '缺省表含背叛');
  ok('关键词 / 封顶 / 可注入词表');
});

// ---------- 3 ----------
test('【3】自定义触发规则：命中一条即止 / 无效正则忽略', () => {
  const r = ST.evaluateTrigger([a('无关文本')], { patterns: '夜晚.*码头\n白天', threshold: 2 });
  assert.strictEqual(r.stats.customPatternHit, '', '未命中留空');
  assert.ok(!r.reasons.some(x => x.startsWith('自定义触发')));

  const hit = ST.evaluateTrigger([a('他深夜去了码头')], { patterns: '夜晚|码头' });
  assert.strictEqual(hit.stats.customPatternHit, '夜晚|码头');
  assert.ok(hit.score >= 2, '自定义命中加权 2 分');

  // 两条规则同时命中：只记第一条，防止分数爆炸
  const two = ST.evaluateTrigger([a('码头与灯塔')], { patterns: ['码头', '灯塔'] });
  assert.strictEqual(two.stats.customPatternHit, '码头', '命中一条即止');
  const onlyOne = ST.evaluateTrigger([a('码头与灯塔')], { patterns: ['码头', '灯塔'], threshold: 3 });
  assert.strictEqual(onlyOne.triggered, false, '两条规则不叠加（否则会误触发）');

  // 无效正则静默忽略，不影响主流程
  const bad = ST.evaluateTrigger([a('他深夜去了码头')], { patterns: '([unclosed' });
  assert.strictEqual(bad.stats.customPatternHit, '', '无效正则被忽略');
  assert.deepStrictEqual(ST.normalizePatterns('a\nb, c'), ['a', 'b', 'c'], '字符串切分');
  assert.deepStrictEqual(ST.normalizePatterns(['a', ' b ', '']), ['a', 'b'], '数组归一');
  ok('自定义规则 / 单命中 / 容错');
});

// ---------- 4 ----------
test('【4】多轮往返 / 情绪波动 / 疑似新实体', () => {
  // 角色切换：u-a-u = 2 次切换
  const turns = ST.evaluateTrigger([u('你', 0), a('我', 1), u('他', 2)], {});
  assert.strictEqual(turns.stats.roleSwitchCount, 2);
  assert.ok(turns.reasons.includes('多轮往返互动'));

  const single = ST.evaluateTrigger([a('单一消息', 0)], {});
  assert.strictEqual(single.stats.roleSwitchCount, 0);
  assert.ok(!single.reasons.includes('多轮往返互动'));

  const emo = ST.evaluateTrigger([a('你骗我！为什么？！', 0)], {});
  assert.strictEqual(emo.stats.punctuationHits, 3);
  assert.ok(emo.reasons.includes('情绪/冲突波动'));

  const flat = ST.evaluateTrigger([a('好的。', 0)], {});
  assert.strictEqual(flat.stats.punctuationHits, 0);
  assert.ok(!flat.reasons.includes('情绪/冲突波动'));

  const ent = ST.evaluateTrigger([a('他走进了圣樱学院。', 0)], {});
  assert.ok(ent.stats.entityHits > 0, '中文实体后缀命中');
  assert.ok(ent.reasons.includes('疑似新实体/新地点'));

  const entEn = ST.evaluateTrigger([a('Doctor arrived.', 0)], {});
  assert.ok(entEn.stats.entityHits > 0, '英文大写词命中');
  ok('往返 / 情绪 / 实体');
});

// ---------- 5 ----------
test('【5】阈值行为与可注入权重', () => {
  const msgs = [a('她突然回头。', 0)];
  assert.strictEqual(ST.evaluateTrigger(msgs, { threshold: 1 }).triggered, true);
  assert.strictEqual(ST.evaluateTrigger(msgs, { threshold: 5 }).triggered, false, '高分阈值拦住');
  assert.strictEqual(ST.evaluateTrigger(msgs, { threshold: 5 }).threshold, 5, '阈值回显');

  const zeroW = ST.evaluateTrigger(msgs, { weights: { keywordPerHit: 0, keywordCap: 0 }, threshold: 1 });
  assert.strictEqual(zeroW.triggered, false, '权重置零则不触发');

  const boost = ST.evaluateTrigger(msgs, { weights: { keywordPerHit: 3, keywordCap: 3 }, threshold: 3 });
  assert.strictEqual(boost.score, 3, '可注入权重生效');

  const capped = ST.evaluateTrigger(msgs, { maxKeywordScore: 1, threshold: 2 });
  assert.strictEqual(capped.score, 1, 'maxKeywordScore 覆盖封顶');

  // 非法阈值/权重回落缺省，不抛错
  const junk = ST.evaluateTrigger(msgs, { threshold: 'abc', weights: { keywordPerHit: -5 } });
  assert.strictEqual(junk.threshold, ST.DEFAULT_THRESHOLD, '非法阈值回落');
  assert.ok(junk.score >= 1, '非法权重回落缺省');

  const empty = ST.evaluateTrigger([], {});
  assert.deepStrictEqual({ t: empty.triggered, s: empty.score, r: empty.reasons }, { t: false, s: 0, r: [] }, '空输入安全');
  const blank = ST.evaluateTrigger([u('   ', 0)], {});
  assert.strictEqual(blank.stats.messageCount, 0, '纯空白消息视作空');
  ok('阈值 / 权重注入 / 非法回落');
});

// ---------- 6 ----------
test('【6】纯函数与确定性', () => {
  const msgs = [u('你骗我！', 0), a('他突然出现。', 1)];
  const snapshot = JSON.stringify(msgs);
  const r1 = ST.evaluateTrigger(msgs, {});
  assert.strictEqual(JSON.stringify(msgs), snapshot, '入参未被修改');

  const r2 = ST.evaluateTrigger(msgs, {});
  assert.strictEqual(r1.score, r2.score, '同输入同分');
  assert.deepStrictEqual(r1.reasons, r2.reasons, '同输入同理由');

  const withIdx = ST.evaluateTrigger([a('文本')], {});
  assert.strictEqual(withIdx.stats.messageCount, 1);
  assert.strictEqual(typeof withIdx.stats.chars, 'number');

  // 缺省实体模式是全局正则：连续调用不应因 lastIndex 漂移
  const e1 = ST.evaluateTrigger([a('圣樱学院')], {});
  const e2 = ST.evaluateTrigger([a('圣樱学院')], {});
  assert.strictEqual(e1.stats.entityHits, e2.stats.entityHits, '全局正则无状态漂移');
  ok('纯函数 / 确定性 / 无状态漂移');
});

// ---------- 7 ----------
test('【7】summarizeTriggers 台账诊断', () => {
  const records = [
    { score: 3, triggered: true, reasons: ['关键词: 背叛', '多轮往返互动'] },
    { score: 0, triggered: false, reasons: [] },
    { score: 1, triggered: false, reasons: ['疑似新实体/新地点'] },
    { score: 2, triggered: true, reasons: ['关键词: 告白', '多轮往返互动', '情绪/冲突波动'] },
  ];
  const s = ST.summarizeTriggers(records);
  assert.strictEqual(s.evaluated, 4);
  assert.strictEqual(s.fired, 2);
  assert.strictEqual(s.skipped, 2);
  assert.strictEqual(s.savedCalls, 2, '省下的调用数 = 跳过数');
  assert.strictEqual(s.fireRate, 0.5);
  assert.strictEqual(s.avgScore, 1.5);
  assert.strictEqual(s.topReasons[0].count, 2, '首位为并列最高频（2 次）');
  const pair = s.topReasons.filter(r => r.count === 2).map(r => r.reason).sort();
  assert.deepStrictEqual(pair, ['关键词', '多轮往返互动'], '并列高频理由齐全且已按类型折叠');

  const empty = ST.summarizeTriggers([]);
  assert.strictEqual(empty.fireRate, 0, '空台账不除零');
  assert.strictEqual(empty.avgScore, 0);
  assert.deepStrictEqual(empty.topReasons, []);
  assert.strictEqual(ST.summarizeTriggers(null).evaluated, 0, '非数组安全');
  ok('台账诊断 / 命中率 / 高频理由');
});

// ---------- 8 ----------
test('【8】index.js 接线：门控已挂上提取主链路', () => {
  assert.ok(/smartTriggerEnabled:\s*false/.test(idxSrc), '默认关（不改变既有行为）');
  assert.ok(idxSrc.includes('smartTriggerEnabled === true'), '门控为显式 === true');
  assert.ok(idxSrc.includes('window.LonShaSmartTrigger'), 'window 通道');
  assert.ok(idxSrc.includes("require('./smart-trigger.js')"), 'require 降级通道');
  assert.ok(idxSrc.includes('st.normalizePending'), '区间取值真调用');
  assert.ok(idxSrc.includes('st.evaluateTrigger'), '判定真调用');
  assert.ok(idxSrc.includes('this.isOmittedFloor(m)'), '番外楼参与排除');
  assert.ok(/smartTriggerThreshold:\s*2/.test(idxSrc), '阈值配置存在');
  assert.ok(/smartTriggerPatterns:\s*''/.test(idxSrc), '自定义规则配置存在');
  assert.ok(idxSrc.includes('this._triggerStats'), '门控台账记录');
  assert.ok(idxSrc.includes('平淡楼跳过 LLM 提取'), '降级路径日志存在');
  assert.ok(idxSrc.includes('extractMemorySimple(message)'), 'fail-open：降级本地摘要（不丢楼层）');
  assert.ok(idxSrc.includes('事件性门控') && idxSrc.includes('exportMemoryReport'), '审计报告展示');
  assert.ok(suiSrc.includes('smartTriggerEnabled'), 'settings-ui 声明该键（非幽灵配置）');
  assert.ok(suiSrc.includes('smartTriggerThreshold'), 'settings-ui 声明阈值键');
  assert.ok(suiSrc.includes('smartTriggerPatterns'), 'settings-ui 声明规则键（data-cfg-text）');
  ok('接线（门控 / 双通道 / 降级 / 台账 / UI）');
});

// ---------- 9 ----------
test('【9】逆向审计：默认关时既有提取链路零变更', () => {
  // 门控分支必须整体位于「无 extracted」判断内，且显式 === true
  const gateAt = idxSrc.indexOf('if (this.config.config.smartTriggerEnabled === true) {');
  assert.ok(gateAt > 0, '门控分支存在');
  const legacyAt = idxSrc.indexOf('extracted = await this.extractMemoryWithLLM(message);', gateAt);
  assert.ok(legacyAt > gateAt, '既有 LLM 提取仍在，且位于门控之后');
  const block = idxSrc.slice(gateAt, legacyAt);
  assert.ok(!/extracted\s*=\s*await/.test(block), '门控分支内不直接改 extracted');
  assert.ok(block.includes('catch (e) { errLog(e,'), '门控异常被吞掉不影响主链路');

  // 关闭时：_triggerDecision 恒为 null → 走 else 分支 → 与原实现等价
  assert.ok(idxSrc.includes('if (_triggerDecision && _triggerDecision.triggered === false)'), '仅在判定明确为 false 时才跳过');
  assert.ok(idxSrc.includes('} else {\n                        extracted = await this.extractMemoryWithLLM(message);'),
    '非跳过路径仍走原 LLM 提取');

  // 既有提取相关配置与调用仍在
  assert.ok(idxSrc.includes('extractionEnabled: true'), '既有提取开关未动');
  assert.ok(idxSrc.includes('synopsisFastPath'), '<synopsis> 快速路径优先级未被门控破坏');
  const fastAt = idxSrc.indexOf('const synopsisText = extractSynopsisFast(');
  assert.ok(fastAt > 0 && fastAt < gateAt, '快速路径在门控之前（AI 自带 synopsis 仍优先，不额外计费）');

  // 纯函数无状态
  const m = [a('圣樱学院', 0)];
  assert.strictEqual(ST.evaluateTrigger(m, {}).score, ST.evaluateTrigger(m, {}).score);
  ok('既有路径未改 / 门控位置正确 / 幂等');
});

console.log(`\n[v3.110] 事件性门控：${pass} 组断言通过`);