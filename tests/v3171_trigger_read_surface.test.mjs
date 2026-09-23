/**
 * v3.171 — 门控读数面（smart-trigger 读侧审计）
 *
 * 主题：v3.169 立 I5（有损必有计数）/ I6（读失败 ≠ 读到了 0），v3.170 把两条拿出
 *   账本本体做了第一次跨界检查（stm-ltm）。v3.171 递给同仓第三个承载「判断」的
 *   子系统 smart-trigger（v3.110 缝合 BME 的 maintenance/smart-trigger.js）的**读侧**：
 *   「读数缺失 / 读数失败 / 静默丢弃」必须可计数、可对账、可入面板。
 *
 * 修前六项实测缺陷（/tmp/probe_st.mjs）→ 修后逐条钉住：
 *   D1 非法正则被静默当作「未命中」（读取方无从区分「没匹配」与「判不了」）
 *   D2 空待判定集与平淡楼在宿主台账塌缩同形（空读被计为「省下一次 LLM 调用」）
 *   D3 maxMessages 静默丢弃最旧、无计数（休眠炸弹：宿主目前不传该参数）
 *   D4 isOmitted 抛错被吞成「没被省略」（异常零留痕）
 *   D5 keywordHits 命中 40 个只留 32 个且无「已截断」标记
 *   D6 宿主 300 条环形台账淘汰量无自述、无「评估数 vs 记录数」对账
 *
 * 层次：
 *   A 非法正则两态可分（D1）      B 空读 vs 平淡两态可分（D2）
 *   C 丢弃/失败计数（D3/D4）      D 截断标记（D5）
 *   E 台账对账与双态面板（D6）    F 适配助手与形状兼容
 *   G 宿主接线（index.js）        H 源码层不变量 + 工具自证
 *   I 负控制：真破坏 → 加载破坏副本 → 在其上重跑 A–G 层同款真判据
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeLines } from './_audit_lib.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = require(path.join(root, 'smart-trigger.js'));
// 通过 window 通道拿同一实例（宿主用的就是这个通道）
globalThis.window = globalThis.window || {};
globalThis.window.LonShaSmartTrigger = raw;
const ST = raw;
const SRC = fs.readFileSync(path.join(root, 'smart-trigger.js'), 'utf8');
const idxSrc = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

/** 剥注释（与 v3170 套件同一语义），用于源码层文本判据 */
// [v3.191] codeLines 已收敛到唯一真源 tests/_audit_lib.mjs（此处不再本地重写）
const code = codeLines(SRC).join('\n');

const u = (mes, index) => ({ is_user: true, mes, index });
const a = (mes, index) => ({ is_user: false, mes, index });

/** 破坏副本加载（子进程无关：本模块无副作用依赖） */
function loadBroken(src, key) {
  const f = path.join(fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'll171_')), 'mod.js');
  fs.writeFileSync(f, src, 'utf8');
  try {
    delete require.cache[require.resolve(f)];
    const mod = require(f);
    if (!mod || typeof mod !== 'object') throw new Error('半真值：破坏副本未能加载出模块');
    return mod;
  } catch (e) { delete require.cache[f]; throw e; } finally {
    try { fs.unlinkSync(f); } catch (_e) { /* 清理失败不影响结论 */ }
  }
}
/** 对源码做一次破坏；锚点必须恰中一次 */
function breakSource(src, anchor, replacement) {
  const n = String(src).split(anchor).length - 1;
  if (n !== 1) throw new Error(`锚点命中 ${n} 次（要求恰好 1 次）`);
  return src.split(anchor).join(replacement);
}
/** 负控制：判据必须翻红（抛错，或返回非布尔半真值） */
function negative(fn, label) {
  let fired = false, how = '';
  try {
    const r = fn();
    if (typeof r === 'boolean') { fired = !r; how = fired ? '判据返回 false' : ''; }
    else { fired = true; how = `半真值 ${String(r)}`; }
  } catch (e) { fired = true; how = '抛错'; }
  if (!fired) throw new Error(`负控制未触发（假绿）：${label}`);
  return how;
}

// ══════════════════════ A. 非法正则两态可分（D1） ══════════════════════
test('A1 非法正则进 invalidPatterns，合法规则进 customPatterns', () => {
  const r = ST.evaluateTrigger([a('她突然回头。')], { patterns: ['([', '她突然回头'] });
  assert.deepEqual(r.stats.invalidPatterns, ['(['], '坏规则被登记');
  assert.deepEqual(r.stats.customPatterns, ['她突然回头'], '合法规则被登记');
  assert.equal(r.stats.customPatternHit, '她突然回头', '合法规则仍能命中');
});

test('A2 compilePatterns 独立可用且不抛', () => {
  const c = ST.compilePatterns('ok\n([\n好的');
  assert.equal(c.ok.length, 2);
  assert.equal(c.invalid.length, 1);
  const empty = ST.compilePatterns('');
  assert.deepEqual(empty.ok, []);
  assert.deepEqual(empty.invalid, []);
});

test('A3 「判不了」与「没命中」不再同形', () => {
  const bad = ST.evaluateTrigger([a('平淡的一天。')], { patterns: ['(['] });
  const good = ST.evaluateTrigger([a('平淡的一天。')], { patterns: ['不存在的词'] });
  assert.equal(bad.stats.customPatternHit, '', '都未命中');
  assert.equal(good.stats.customPatternHit, '');
  // 分水岭：一个有 invalidPatterns，一个没有 —— 读取方能区分
  assert.equal(bad.stats.invalidPatterns.length, 1);
  assert.equal(good.stats.invalidPatterns.length, 0);
});

test('A4 非法正则不影响既有评分（fail-open）', () => {
  const withBad = ST.evaluateTrigger([a('她突然回头。')], { patterns: ['(['] });
  const noPattern = ST.evaluateTrigger([a('她突然回头。')], {});
  assert.equal(withBad.score, noPattern.score, '坏规则不改变得分');
});

// ══════════════════════ B. 空读 vs 平淡两态可分（D2） ══════════════════════
test('B1 空集时 stats.empty 为真且短路径返回合法形状', () => {
  const r = ST.evaluateTrigger([], {});
  assert.equal(r.stats.empty, true);
  assert.equal(r.triggered, false);
  assert.equal(r.score, 0);
  assert.deepEqual(r.reasons, []);
});

test('B2 平淡楼不带 empty 标记（与空读分道）', () => {
  const flat = ST.evaluateTrigger([a('今天的阳光很好。')], {});
  assert.notEqual(flat.stats.empty, true);
  assert.equal(flat.stats.messageCount, 1);
});

test('B3 仅空白楼层也被当作空读（不是「读到了 0」）', () => {
  const r = ST.evaluateTrigger([a('   ', 0), u('', 1)], {});
  assert.equal(r.stats.empty, true, '全空白 = 无内容可判');
});

// ══════════════════════ C. 丢弃 / 失败计数（D3/D4） ══════════════════════
test('C1 maxMessages 丢弃量经 carry 带出，返回值仍是裸数组', () => {
  const chat = [u('一', 0), a('二', 1), u('三', 2), a('四', 3), u('五', 4)];
  const carry = {};
  const out = ST.normalizePending(chat, { maxMessages: 2 }, carry);
  assert.ok(Array.isArray(out), '返回数组（既有调用形状不变）');
  assert.deepEqual(out.map(m => m.index), [3, 4], '取尾部');
  assert.equal(carry.dropped, 3, '丢弃 3 条可读');
  assert.equal(carry.available, 5);
  assert.equal(carry.kept, 2);
});

test('C2 未触发上限时 dropped 为 0（不虚报有损）', () => {
  const carry = {};
  ST.normalizePending([u('一', 0), a('二', 1)], { maxMessages: 5 }, carry);
  assert.equal(carry.dropped, 0);
});

test('C3 不传 maxMessages 时不丢弃（宿主现状）', () => {
  const carry = {};
  const out = ST.normalizePending([u('一', 0), a('二', 1), u('三', 2)], {}, carry);
  assert.equal(out.length, 3);
  assert.equal(carry.dropped, 0);
});

test('C4 isOmitted 抛错被计数且 fail-open 纳入该楼', () => {
  const chat = [u('一', 0), a('二', 1), u('三', 2)];
  const carry = {};
  const out = ST.normalizePending(chat, {
    isOmitted: (m) => { if (m.index === 1) throw new Error('boom'); return false; },
  }, carry);
  assert.equal(out.length, 3, '抛错楼仍纳入');
  assert.equal(carry.omitErrors, 1, '异常留痕');
});

test('C5 isOmitted 正常返回 true 时正确排除且不计错误', () => {
  const chat = [u('一', 0), a('二', 1), u('三', 2)];
  const carry = {};
  const out = ST.normalizePending(chat, { isOmitted: (m) => m.index === 1 }, carry);
  assert.deepEqual(out.map(m => m.index), [0, 2]);
  assert.equal(carry.omitErrors, 0);
});

test('C6 不传 carry 不抛（向后兼容调用方）', () => {
  assert.deepEqual(ST.normalizePending([u('一', 0)], {}).map(m => m.index), [0]);
  assert.deepEqual(ST.normalizePending(null, {}), []);
});

// ══════════════════════ D. 截断标记（D5） ══════════════════════
test('D1 keywordHits 超过 32 条时给出总量与截断量', () => {
  const kws = Array.from({ length: 40 }, (_, i) => 'kw' + i);
  const r = ST.evaluateTrigger([a(kws.join(' '))], { keywords: kws });
  assert.equal(r.stats.keywordHitsTotal, 40, '总量可读');
  assert.equal(r.stats.keywordHits.length, 32, '列表仍限 32（向后兼容）');
  assert.equal(r.stats.keywordHitsTruncated, 8, '截断量可读');
});

test('D2 未截断时 total 与列表等长、无截断字段', () => {
  const kws = ['突然', '发现'];
  const r = ST.evaluateTrigger([a('突然 发现')], { keywords: kws });
  assert.equal(r.stats.keywordHitsTotal, 2);
  assert.equal(r.stats.keywordHits.length, 2);
  assert.equal(r.stats.keywordHitsTruncated, undefined, '不虚报截断');
});

// ══════════════════════ E. 台账对账与双态面板（D6） ══════════════════════
test('E1 summarizeTriggers 给出 evaluated/recorded/missing/emptyCount', () => {
  const s = ST.summarizeTriggers([
    { score: 3, triggered: true, reasons: ['关键词: 突然'] },
    { score: 0, triggered: false, reasons: [] },
  ]);
  assert.equal(s.evaluated, 2);
  assert.equal(s.recorded, 2);
  assert.equal(s.missing, 0);
  assert.equal(s.emptyCount, 0);
  assert.equal('cap' in s && 'dropped' in s, true, '宿主注入位已声明');
});

test('E2 既有 v3110 台账口径逐项不变', () => {
  const s = ST.summarizeTriggers([
    { score: 2, triggered: true, reasons: ['多轮往返互动'] },
    { score: 1, triggered: true, reasons: ['关键词: 突然'] },
    { score: 0, triggered: false, reasons: [] },
    { score: 0, triggered: false, reasons: [] },
  ]);
  assert.equal(s.evaluated, 4);
  assert.equal(s.fired, 2);
  assert.equal(s.skipped, 2);
  assert.equal(s.savedCalls, 2);
  assert.equal(s.fireRate, 0.5);
  assert.equal(s.avgScore, 0.75);
});

test('E3 面板把空读从平淡楼里拆出来', () => {
  const panel = ST.normalizeTriggerReport([
    { score: 0, triggered: false, reasons: [], report: { empty: true } },
    { score: 0, triggered: false, reasons: [] },
    { score: 1, triggered: true, reasons: [] },
  ], {});
  assert.equal(panel.records, 3);
  assert.equal(panel.empty, 1);
  assert.equal(panel.plain, 2);
  assert.equal(panel.hasReadGap, true, '有缺口必须报');
});

test('E4 面板也认直出形状 stats.empty（两种形状都认得）', () => {
  const empty = ST.evaluateTrigger([], {});
  const panel = ST.normalizeTriggerReport([empty], {});
  assert.equal(panel.empty, 1);
});

test('E5 环形淘汰量经 opts.dropped 入面板并触发缺口标记', () => {
  const panel = ST.normalizeTriggerReport([{ score: 1, triggered: true, reasons: [] }], { cap: 300, dropped: 5 });
  assert.equal(panel.dropped, 5);
  assert.equal(panel.cap, 300);
  assert.equal(panel.hasReadGap, true);
});

test('E6 无缺口时 hasReadGap 为假（不虚报）', () => {
  const panel = ST.normalizeTriggerReport([{ score: 1, triggered: true, reasons: [] }], { cap: 300 });
  assert.equal(panel.hasReadGap, false);
  assert.equal(panel.dropped, null);
});

test('E7 missing 由 opts.given 与记录数差得出', () => {
  const panel = ST.normalizeTriggerReport([{ score: 1, triggered: true, reasons: [] }], { given: 5 });
  assert.equal(panel.missing, 4);
  assert.equal(panel.hasReadGap, true, '缺记录也是读数缺口');
});

// ══════════════════════ F. 适配助手与形状兼容 ══════════════════════
test('F1 pendingList 接受裸数组与 {pending} 旧形状', () => {
  const arr = [u('一', 0)];
  assert.equal(ST.pendingList(arr).length, 1);
  assert.equal(ST.pendingList({ pending: arr }).length, 1);
  assert.deepEqual(ST.pendingList(null), []);
});

test('F2 pendingReport 对两种形状都安全', () => {
  assert.equal(ST.pendingReport([u('一', 0)]).dropped, 0);
  assert.equal(ST.pendingReport({ report: { dropped: 2 } }).dropped, 2);
  assert.equal(ST.pendingReport(null).omitErrors, 0);
});

test('F3 导出块只增不换（既有八个键一个不动）', () => {
  for (const k of ['DEFAULT_TRIGGER_KEYWORDS', 'DEFAULT_THRESHOLD', 'DEFAULT_WEIGHTS',
    'DEFAULT_ENTITY_SUFFIXES', 'normalizePending', 'normalizePatterns',
    'evaluateTrigger', 'summarizeTriggers']) {
    assert.ok(typeof ST[k] !== 'undefined', `既有导出 ${k} 仍在`);
  }
  for (const k of ['compilePatterns', 'normalizeTriggerReport', 'pendingList', 'pendingReport']) {
    assert.equal(typeof ST[k], 'function', `新增导出 ${k}`);
  }
});

test('F4 normalizePending 仍是纯函数（入参不被修改）', () => {
  const chat = [u('一', 0), a('二', 1)];
  const snapshot = JSON.stringify(chat);
  ST.normalizePending(chat, { maxMessages: 1 }, {});
  assert.equal(JSON.stringify(chat), snapshot);
});

// ══════════════════════ G. 宿主接线（index.js） ══════════════════════
test('G1 调用链把 carry 与 report 接上', () => {
  assert.ok(idxSrc.includes('const _carry = {};'), 'carry 已创建');
  assert.ok(/st\.normalizePending\(_chat, \{[\s\S]{0,240}?\}, _carry\)/.test(idxSrc), 'carry 作为第三参传入');
  assert.ok(idxSrc.includes('report: {'), '台账条目带 report');
  assert.ok(idxSrc.includes('empty: !!(_triggerDecision.stats'), '空读标记入台账');
  assert.ok(idxSrc.includes('invalidPatterns: ((_triggerDecision.stats'), '判不了计数入台账');
});

test('G2 环形淘汰计数存在且随 shift 递增', () => {
  assert.ok(idxSrc.includes('this._triggerDropped = (Number(this._triggerDropped) || 0) + 1'),
    '淘汰量递增');
  assert.ok(/this\._triggerStats\.length > 300[\s\S]{0,200}?_triggerDropped/.test(idxSrc),
    '淘汰计数与环形上限绑定');
});

test('G3 降级路径区分空读与平淡楼（空读不产记忆）', () => {
  assert.ok(idxSrc.includes('const _readEmpty = !!(_triggerDecision.stats'),
    '空读判定存在');
  assert.ok(/if \(_readEmpty\)[\s\S]{0,400}?else \{[\s\S]{0,300}?extractMemorySimple/.test(idxSrc),
    '空读跳过、平淡楼才走本地摘要');
});

test('G4 v3110【9】钉住的原文本形态未被破坏', () => {
  assert.ok(idxSrc.includes('if (_triggerDecision && _triggerDecision.triggered === false)'),
    '仅在判定明确 false 时才进跳过分支');
  assert.ok(idxSrc.includes('} else {\n                        extracted = await this.extractMemoryWithLLM(message);'),
    '非跳过路径仍走原 LLM 提取');
});

test('G5 总账与 selfCheck 各补一行门控读数', () => {
  assert.ok(idxSrc.includes("push('门控读数缺口'"), '总账行存在');
  assert.ok(idxSrc.includes("return ['门控读数'"), 'selfCheck 行存在');
  assert.ok(/\['门控读数', '—（未启用）'\]/.test(idxSrc), '未启用时诚实报—（未启用）');
  assert.ok(idxSrc.includes('normalizeTriggerReport(this._triggerStats'), '接到面板');
});

test('G6 报告展示段含读数缺口警示', () => {
  assert.ok(idxSrc.includes('读数缺口：'), '缺口警示入报告');
  assert.ok(idxSrc.includes('判定失败：'), '判定失败警示入报告');
});

test('G7 smart-trigger.js 仍在 manifest 注册', () => {
  assert.ok((manifest.extra_js || []).includes('smart-trigger.js'));
});

// ══════════════════════ H. 源码层不变量 + 工具自证 ══════════════════════
test('H1 所有有损路径都必须伴随计数（I5）', () => {
  assert.ok(code.includes('dropped = out.length - maxMessages'), '上限丢弃有计数');
  assert.ok(code.includes('omitErrors += 1'), '判定失败有计数');
  assert.ok(code.includes('keywordHitsTruncated = keywordHits.length - 32'), '截断有标记');
  assert.ok(!code.includes('return out.slice(-maxMessages);'), '不得再出现裸 slice 返回');
});

test('H2 两态判定不得退化为单态（I6）', () => {
  assert.ok(code.includes('stats.empty = true'), '空读有标记');
  assert.ok(code.includes('r.stats && r.stats.empty === true'),
    '面板认得直出形状，否则空读退化为平淡');
  assert.ok(code.includes('r.report && r.report.empty === true'),
    '面板认得台账摘出形状');
});

test('H3 剥注释副本的自证（工具失灵本身也会静默）', () => {
  const withComment = 'x(); // dropped = out.length - maxMessages;';
  assert.ok(!codeLines(withComment).join('\n').includes('dropped ='), '注释被剥掉');
  const real = 'const dropped = out.length - maxMessages;';
  assert.ok(codeLines(real).join('\n').includes('dropped ='), '代码被保留');
});

test('H4 剥注释副本与原文同源（不得因剥注释引入幻影）', () => {
  const n = codeLines(SRC).length;
  assert.ok(n > 200 && n < SRC.split('\n').length + 1, `代码行 ${n} 合理`);
});

// ── I 层负控制：真破坏 → 加载破坏副本 → 在其上重跑 A–G 同款真判据 ──
const I_ANCHORS = [
  'sink.omitErrors = omitErrors;',                                       // I1 省略判定失败不落账
  'dropped = out.length - maxMessages;',                                 // I2 上限丢弃不落账
  'stats.invalidPatterns = _compiled.invalid;',                          // I3 判不了不登记
  'stats.empty = true;   // [v3.171] 空读必须可区分（I6：读失败 ≠ 读到了 0）',  // I4 空读无标记
  `const isReadGap = !!(r && (r.empty === true
                || (r.report && r.report.empty === true)
                || (r.stats && r.stats.empty === true)));`,                            // I5 面板退化为单态
  'if (keywordHits.length > 32) stats.keywordHitsTruncated = keywordHits.length - 32;',     // I6 截断无标记
  'const missing = Number.isFinite(given) ? Math.max(0, given - list.length) : 0;',          // I7 缺记录不对账
];
const A = (n) => I_ANCHORS[n];

test('H5 负控制判据的纯度：锚点不得被抄进破坏替换串（防自我指涉）', () => {
  const own = fs.readFileSync(new URL(import.meta.url), 'utf8');
  // 只扫 I 层区域（I_ANCHORS 声明及其后）：H1/H3 里的同名字符串是独立源码判据，
  //   不属于破坏串。破坏串一律用 A(n) 复用，故 I 层内每个锚点字面量只应出现 1 次。
  const iStart = own.indexOf('const I_ANCHORS');
  assert.ok(iStart > 0, 'I 层区域可定位');
  const iZone = own.slice(iStart);
  for (const anchor of I_ANCHORS) {
    const n = iZone.split(anchor).length - 1;
    assert.equal(n, 1, `锚点在 I 层只应声明一次（破坏串须用 A(n) 复用）：${anchor}`);
  }
});

test('H6 破坏工具两向自证（工具失灵也会静默）', () => {
  assert.throws(() => breakSource(SRC, '不存在的锚点XYZ', ''), /命中 0 次/, '锚点不存在必须抛');
  const broken = breakSource(SRC, A(3), 'stats.empty = true;');
  assert.equal(loadBroken(broken, 'selfcheck').evaluateTrigger([], {}).stats.empty, true, '破坏必须可观测');
  assert.equal(ST.evaluateTrigger([], {}).stats.empty, true, '原版判据为真');
  assert.throws(() => negative(() => true, 'x'), /未触发/, 'negative 对恒真须抛');
  assert.equal(negative(() => { throw new Error('x'); }, 'y'), '抛错', '抛错算翻红');
});

test('I1 破坏「省略判定失败不落账」→ C4 判据必须翻红', () => {
  const mod = loadBroken(breakSource(SRC, A(0), 'sink.omitErrors = 0;'), 'i1');
  negative(() => {
    const carry = {};
    mod.normalizePending([u('一', 0), a('二', 1), u('三', 2)], {
      isOmitted: (m) => { if (m.index === 1) throw new Error('boom'); return false; },
    }, carry);
    return carry.omitErrors === 1;
  }, 'I1');
});

test('I2 破坏「上限丢弃计数」→ C1 判据必须翻红', () => {
  const mod = loadBroken(breakSource(SRC, A(1), 'dropped = 0;'), 'i2');
  negative(() => {
    const carry = {};
    mod.normalizePending([u('一', 0), a('二', 1), u('三', 2), a('四', 3), u('五', 4)],
      { maxMessages: 2 }, carry);
    return carry.dropped === 3;
  }, 'I2');
});

test('I3 破坏「判不了登记」→ A1 判据必须翻红', () => {
  const mod = loadBroken(breakSource(SRC, A(2), 'stats.invalidPatterns = [];'), 'i3');
  negative(() => {
    const r = mod.evaluateTrigger([a('她突然回头。')], { patterns: ['([', '她突然回头'] });
    return r.stats.invalidPatterns.length === 1;
  }, 'I3');
});

test('I4 破坏「空读标记」→ B1/B3 判据必须翻红', () => {
  const mod = loadBroken(breakSource(SRC, A(3), 'stats.empty = false;'), 'i4');
  negative(() => mod.evaluateTrigger([], {}).stats.empty === true, 'I4');
});

test('I5 破坏「面板两态判定」→ E4 判据必须翻红', () => {
  const brokenSrc = breakSource(SRC, A(4),
    'const isReadGap = !!(r && r.empty === true);');
  const mod = loadBroken(brokenSrc, 'i5');
  negative(() => {
    const empty = mod.evaluateTrigger([], {});
    return mod.normalizeTriggerReport([empty], {}).empty === 1;
  }, 'I5');
});

test('I6 破坏「截断标记」→ D1 判据必须翻红', () => {
  const mod = loadBroken(breakSource(SRC, A(5), ''), 'i6');
  negative(() => {
    const kws = Array.from({ length: 40 }, (_, i) => 'kw' + i);
    const r = mod.evaluateTrigger([a(kws.join(' '))], { keywords: kws });
    return r.stats.keywordHitsTruncated === 8;
  }, 'I6');
});

test('I7 破坏「缺记录对账」→ E7 判据必须翻红', () => {
  const mod = loadBroken(breakSource(SRC, A(6), 'const missing = 0;'), 'i7');
  negative(() => mod.normalizeTriggerReport([{ score: 1, triggered: true, reasons: [] }], { given: 5 }).missing === 4, 'I7');
});
