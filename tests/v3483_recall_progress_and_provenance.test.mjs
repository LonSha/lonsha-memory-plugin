/**
 * tests/v3483_recall_progress_and_provenance.test.mjs — v3.483.0 缝合 lorecodex 两处纪律
 *
 * 缝合对象：lena13144/lorecodex（安装名 st-tree-lore）
 *   ① maxOrder 防剧透锁 —— 它把闸设在目录、grep、读取**三处**，超前的章节根本不返回；
 *   ② readScenes 白名单 —— 「注入的必须是检索模型真正读过原文的场景」。
 *
 * 本仓的映射（不可照搬的部分已改口径，理由写在两个模块的头部注释里）：
 *   ① → recall-progress-gate.js：以**楼层**为进度（不用叙事日期），四态判定，只拦 ahead；
 *   ② → recall-provenance-ledger.js：本仓没有「读取」动作可作凭证，故只做等价可达的一半
 *        ——**不要求「读过」，但要求「指得出」**，三态 + 默认只记账不过滤。
 *
 * 覆盖（九段式，与 v3183_summary_provenance 同族）：
 *   1. 四态判定逐条 / 只拦 ahead
 *   2. 0 是合法进度（不能当「判不了」）—— 这是本模块最易犯的错
 *   3. 三态不混同（untraceable ≠ empty ≠ traceable）
 *   4. 判不了就放行（负控制：别把用户记忆整批挡在门外）
 *   5. 逐条列出（不只给个数）
 *   6. 畸形输入不抛
 *   7. 不改入参（纯函数纪律）
 *   8. 真连线自证：engine-recall.js 的 recallMemory 端到端拦下未来条目
 *   9. 接线自证 + 开关在场 + 模块登记（manifest / 宿主 libs）
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
// 本仓缝合模块是 IIFE + CJS 双导出，故用 require 取库（import 拿到空命名空间）
const require = createRequire(import.meta.url);
const G = require(path.join(root, 'recall-progress-gate.js'));
const L = require(path.join(root, 'recall-provenance-ledger.js'));

let pass = 0;
const ok = (name, cond, extra) => {
  assert.ok(cond, extra ? name + ' — ' + extra : name);
  pass += 1;
};
const eq = (name, a, b) => {
  assert.equal(a, b, name + ` — 期望 ${JSON.stringify(b)}，实得 ${JSON.stringify(a)}`);
  pass += 1;
};

// ========== 1. 四态判定：只拦 ahead ==========
{
  // 进度 19：楼 3 / 10 / 19 都在其内，30 / 99 超前
  eq('1a 过去楼层 = ok', G.classify({ floor: 3 }, 19).status, 'ok');
  eq('1b 本楼 = ok（边界算已发生）', G.classify({ floor: 19 }, 19).status, 'ok');
  eq('1c 未来楼层 = ahead', G.classify({ floor: 30 }, 19).status, 'ahead');
  eq('1d 无楼层归属 = not_seated（通用设定不受影响）', G.classify({ text: '设定' }, 19).status, 'not_seated');
  eq('1e 进度判不了 = no_progress', G.classify({ floor: 30 }, null).status, 'no_progress');
  // **只拦 ahead**：其余三态全放行
  eq('1f ahead 被拦', G.isAllowed({ floor: 30 }, 19), false);
  eq('1g ok 放行', G.isAllowed({ floor: 3 }, 19), true);
  eq('1h not_seated 放行', G.isAllowed({ text: '设定' }, 19), true);
  eq('1i no_progress 放行（判不了就放行）', G.isAllowed({ floor: 30 }, null), true);
  // 批量：7 条进、2 条被拦
  const items = [
    { id: 'a', floor: 3 }, { id: 'b', floor: 10 }, { id: 'c', floor: 19 },
    { id: 'd', floor: 30 }, { id: 'e', floor: 99 },
    { id: 'f' }, { text: '连 id 都没有' },
  ];
  const r = G.pick(items, 19);
  eq('1j 批量 kept=5', r.kept.length, 5);
  eq('1k 批量 dropped=2', r.counts.dropped, 2);
  eq('1l 逐条列出被拦楼层', r.dropped.map(d => d.floor).join(','), '30,99');
  eq('1m 四态计数齐备', [r.counts.ok, r.counts.ahead, r.counts.not_seated, r.counts.no_progress].join('/'), '3/2/2/0');
}

// ========== 2. 0 是合法进度（本模块最易犯的错） ==========
{
  // 剧情还没开始时进度是 0（chat 只有首楼）。写成 `if (!p)` 会把 0 当「判不了」，
  //   于是开局第一轮完全不设闸 —— 未来条目照样注入。
  eq('2a normalizeProgress(0) 是 0 不是 null', G.normalizeProgress(0), 0);
  eq('2b classify 进度 0 时，楼 1 = ahead', G.classify({ floor: 1 }, 0).status, 'ahead');
  eq('2c 进度 0 时，楼 0 = ok', G.classify({ floor: 0 }, 0).status, 'ok');
  eq('2d 进度 0 时「判得了」（不是 no_progress）', G.classify({ floor: 5 }, 0).status !== 'no_progress', true);
  // 反向：'0' 字符串也要认（存档回放里见过字符串楼层）
  eq('2e 字符串进度 "0" 归一为 0', G.normalizeProgress('0'), 0);
  // 负数 / NaN / 空串 一律判不了
  eq('2f 负数进度判不了', G.normalizeProgress(-1), null);
  eq('2g NaN 判不了', G.normalizeProgress(NaN), null);
  eq('2h 空串判不了', G.normalizeProgress(''), null);
  eq('2i undefined 判不了', G.normalizeProgress(undefined), null);
  // 楼层侧：字符串数字也认，空串不认
  eq('2j 字符串楼层 "120" 认', G.floorOf({ floor: '120' }), 120);
  eq('2k 空串楼层不认', G.floorOf({ floor: '' }), null);
  eq('2l metadata.floor 兜底', G.floorOf({ metadata: { floor: 7 } }), 7);
  eq('2m 楼层 0 认（0 是首楼）', G.floorOf({ floor: 0 }), 0);
}

// ========== 3. 三态不混同 ==========
{
  eq('3a 有楼层 = traceable', L.classify({ text: '甲', floor: 5 }).status, 'traceable');
  eq('3b 有 id 无楼层 = traceable', L.classify({ text: '甲', id: 'sum_5' }).status, 'traceable');
  eq('3c 都有 = traceable', L.classify({ text: '甲', id: 'x', floor: 5 }).status, 'traceable');
  eq('3d 都没有 = untraceable', L.classify({ text: '甲' }).status, 'untraceable');
  eq('3e 空文本 = empty（与 untraceable 不混同）', L.classify({ id: 'x', text: '   ' }).status, 'empty');
  eq('3f 非对象 = empty', L.classify(null).status, 'empty');
  ok('3g empty 与 untraceable 是两个态', L.STATES.EMPTY !== L.STATES.UNTRACEABLE);
  // 关键：带 floor 但空文本**仍算 empty** —— 不能因为「指得出」就掩盖「注入了空条目」
  eq('3h 带楼层的空条目仍是 empty（不被 traceable 掩盖）', L.classify({ floor: 5, text: '' }).status, 'empty');
  const acc = L.build([
    { text: '甲', floor: 5 },
    { text: '乙', id: 'bm25_1' },
    { text: '丙' },              // 指不出来源
    { text: '' },                // 空条目
  ]);
  eq('3i 台账 checked=4', acc.counts.checked, 4);
  eq('3j 台账 traceable=2', acc.counts.traceable, 2);
  eq('3k 台账 untraceable=1', acc.counts.untraceable, 1);
  eq('3l 台账 empty=1', acc.counts.empty, 1);
  eq('3m untraceable 明细逐条列出', acc.untraceable.length, 1);
  eq('3n 明细带下标', acc.untraceable[0].index, 2);
  ok('3o 读数只说「指不出来源」，不判真伪', /指不出来源/.test(L.summary(acc)), L.summary(acc));
  ok('3p 读数不出现「虚假/伪造/编造」这类判决词', !/虚假|伪造|编造|假/.test(L.summary(acc)), L.summary(acc));
}

// ========== 4. 判不了就放行 / 默认不过滤（负控制） ==========
{
  // 进度门：一批全超前的条目，进度未知时必须一条不拦
  const ahead = [{ floor: 30 }, { floor: 99 }];
  eq('4a 进度未知时 ahead 一条不拦', G.pick(ahead, null).kept.length, 2);
  eq('4b 进度未知时 dropped=0', G.pick(ahead, null).counts.dropped, 0);
  eq('4c 进度未知时计入 no_progress', G.pick(ahead, null).counts.no_progress, 2);
  // 台账：默认不过滤 —— untraceable 也在 kept 里（requireTraceable 才拦）
  const mix = [{ text: '有地址', floor: 1 }, { text: '没地址' }];
  const acc = L.build(mix);
  eq('4d 台账默认不删条目', acc.counts.checked, 2);
  const strict = L.requireTraceable(mix);
  eq('4e 严格模式才拦 untraceable', strict.kept.length, 1);
  eq('4f 严格模式列出被拦的', strict.dropped.length, 1);
  eq('4g 严格模式拦的正是那条没地址的', strict.dropped[0].status, 'untraceable');
  // 反向：严格模式绝不能把 traceable 拦掉（拦了就是真丢记忆）
  eq('4h 严格模式不拦 traceable', L.requireTraceable([{ text: 'x', floor: 2 }]).kept.length, 1);
}

// ========== 5. gateResults 多来源批量 + 不改入参 ==========
{
  const results = {
    summary: [{ id: 's1', floor: 3 }, { id: 's2', floor: 40 }],
    bm25: [{ id: 'b1', floor: 5 }],
    volume: [{ id: 'v1', floor: 2, text: '【卷1-9】' }],
    // 非数组字段要原样带过（本模块只认召回数组，不碰标量）
    totalCount: 3,
  };
  const r = G.gateResults(results, 19);
  eq('5a summary 被拦 1 条', r.results.summary.length, 1);
  eq('5b bm25 全留', r.results.bm25.length, 1);
  eq('5c volume 全留', r.results.volume.length, 1);
  eq('5d 标量原样带过', r.results.totalCount, 3);
  eq('5e 总数 checked=4', r.counts.checked, 4);
  eq('5f 总数 dropped=1', r.counts.dropped, 1);
  ok('5g 按来源归因', !!r.droppedBySource.summary, JSON.stringify(Object.keys(r.droppedBySource)));
  // 不改入参：原数组长度不变（返回的是新对象）
  eq('5h 入参 summary 仍是 2 条（未被就地裁剪）', results.summary.length, 2);
  ok('5i 返回的是新对象', r.results !== results);
}

// ========== 6. 畸形输入不抛 ==========
{
  const bad = [null, undefined, 0, '', 'abc', [], {}, NaN, { floor: {} }, { metadata: 'x' }];
  for (const b of bad) {
    let threw = false;
    try { G.classify(b, 19); G.pick(b, 19); G.gateResults(b, 19); L.classify(b); L.build(b); L.requireTraceable(b); L.summary(b); }
    catch (e) { threw = true; }
    ok('6a 畸形输入不抛：' + JSON.stringify(b), !threw);
  }
  eq('6b pick 非数组回空', G.pick(null, 19).kept.length, 0);
  eq('6c gateResults 非对象回空 results', Object.keys(G.gateResults(null, 19).results).length, 0);
  eq('6d build 非数组回空账', L.build(null).counts.checked, 0);
  eq('6e summary(null) 不抛且给读数', typeof L.summary(null), 'string');
  eq('6f 坏 floor 对象判 not_seated 而不是乱猜', G.classify({ floor: {} }, 19).status, 'not_seated');
}

// ========== 7. 真连线自证（engine 端到端） ==========
//   这一段的纪律：**不许用空桩冒充接线**。上一轮就在这踩过 —— 各来源数组全空时
//   checked=0，读数全 0 也「全绿」，等于什么都没验。故这里让 bm25 真产出 7 条。
{
  const chat = Array.from({ length: 20 }, (_, i) => ({ index: i, mes: '楼' + i, is_user: i % 2 === 0, send_date: 'T' + i }));
  const memory = [
    { id: 'past_3', text: '三楼的旧事', floor: 3, source: 'bm25' },
    { id: 'past_10', text: '十楼的旧事', floor: 10, source: 'bm25' },
    { id: 'now_19', text: '本楼刚发生的', floor: 19, source: 'bm25' },
    { id: 'future_30', text: '未来的摊牌原话', floor: 30, source: 'bm25' },
    { id: 'future_99', text: '更远的未来', floor: 99, source: 'bm25' },
    { id: 'no_floor', text: '不挂楼层的通用设定', source: 'bm25' },
    { text: '连 id 都没有的一条', source: 'bm25' },
  ];
  const g = globalThis;
  const prevWindow = g.window;
  g.window = { SillyTavern: { getContext: () => ({ chat }) } };
  try {
    const RC = require(path.join(root, 'engine-recall.js'));
    const engine = {
      config: { config: {
        enabled: true, debugMode: false,
        bm25Enabled: true, bm25TopK: 10,
        rerankEnabled: false, vectorEnabled: false, graphDiffusionEnabled: false,
        summaryFoldEnabled: false, neuralChainEnabled: false, heatOnRecallEnabled: false,
        pyramidEvolutionEnabled: false, resonanceConsolidationEnabled: false,
        memorySymphonyEnabled: false, temporalGraphEnabled: false,
      } },
      _currentFloor: 19,
      currentStoryFloor: () => 19,
      summary: { search: () => [], searchVolumes: () => [], volumes: [] },
      graph: { findByNames: () => [], edges: new Map() },
      diary: { search: () => [] },
      llm: {},
      intentRerank: (list) => list,
      captureCast: () => [],
      _aliasMapAt: null,
      computeRecallQuota: () => 1,
      bm25: { N: 7, searchBranches: () => memory.slice(), search: () => memory.slice() },
      getKnownCharacters: () => [],
      _auditRecall: () => null,
      _recordFloorRecall: () => {},
      _safeCast: () => [],
      hybridMerge: (res) => {
        const out = [];
        for (const k of Object.keys(res || {})) {
          const a = res[k];
          if (Array.isArray(a)) for (const it of a) if (it) out.push(it);
        }
        return out;
      },
    };
    const outList = await RC.recallMemory(engine, { text: '旧事', characters: [] });
    const ids = (outList || []).map(x => x && x.id);
    ok('7a 召回返回了条目（不是空跑）', (outList || []).length > 0, 'len=' + (outList || []).length);
    eq('7b 本轮注入了 5 条', (outList || []).length, 5);
    ok('7c 未来条目 future_30 已拦下', !ids.includes('future_30'), ids.join(','));
    ok('7d 未来条目 future_99 已拦下', !ids.includes('future_99'));
    ok('7e 过去条目 past_3 仍在', ids.includes('past_3'));
    ok('7f 本楼 now_19 仍在', ids.includes('now_19'));
    ok('7g 无楼层归属的通用设定仍放行', ids.includes('no_floor'));
    // 读数落地（「跑了但没拦」与「没跑」必须可分辨）
    const st = engine._lastRecallProgressGate || {};
    eq('7h 进度门读数 active', st.active, true);
    eq('7i 读数记下当前进度 19', st.progress, 19);
    eq('7j 读数 checked=7', st.checked, 7);
    eq('7k 读数 dropped=2', st.dropped, 2);
    eq('7l 逐条记下被拦楼层', (st.droppedItems || []).map(d => d.floor).join(','), '30,99');
    eq('7m 读数记下 not_seated=2', st.notSeated, 2);
    // 台账读数
    const lg = engine._lastRecallProvenanceLedger || {};
    eq('7n 台账 active', lg.active, true);
    eq('7o 台账对**注入名单**建账（5 条）', lg.counts && lg.counts.checked, 5);
    eq('7p 台账可追 4 条', lg.counts && lg.counts.traceable, 4);
    eq('7q 台账指不出来源 1 条', lg.counts && lg.counts.untraceable, 1);
    eq('7r 台账默认不删条目（strictDropped=0）', lg.strictDropped, 0);
    ok('7s 台账有一行可读读数', /注入 5 条/.test(String(lg.line)), String(lg.line));

    // 7z 开关：关掉进度门后未来条目会回来（证明拦下的是本机制，不是别处）
    engine.config.config.recallProgressGate = false;
    const out2 = await RC.recallMemory(engine, { text: '旧事', characters: [] });
    const ids2 = (out2 || []).map(x => x && x.id);
    eq('7z 关掉开关后 future_30 回来了（本机制确实是那道闸）', ids2.includes('future_30'), true);
    eq('7z-2 关掉时读数说明原因', engine._lastRecallProgressGate.reason, 'disabled');
  } finally {
    if (prevWindow === undefined) delete g.window;
    else g.window = prevWindow;
  }
}

// ========== 8. 接线自证（源码面） ==========
{
  const rc = read('engine-recall.js');
  ok('8a engine-recall 有取库口 _recallProgressGateLib', /function _recallProgressGateLib\(\)/.test(rc));
  ok('8b engine-recall 有取库口 _recallProvenanceLedgerLib', /function _recallProvenanceLedgerLib\(\)/.test(rc));
  ok('8c 真调用 G.pick', /G\.pick\(finalMerged/.test(rc));
  ok('8d 真调用 L.build', /L\.build\(finalMerged\)/.test(rc));
  ok('8e 剔除后就地回写 finalMerged', /finalMerged\.splice\(0, finalMerged\.length, \.\.\._g\.kept\)/.test(rc));
  ok('8f 有开关 recallProgressGate', /config\.recallProgressGate !== false/.test(rc));
  ok('8g 有开关 recallProvenanceLedger', /config\.recallProvenanceLedger !== false/.test(rc));
  ok('8h 严格模式需显式开', /config\.recallProvenanceStrict === true/.test(rc));
  // 进度取数三档（currentStoryFloor → _currentFloor → chat.length-1）
  ok('8i 优先 currentStoryFloor', /engine\.currentStoryFloor\(\)/.test(rc));
  ok('8j 回落 _currentFloor', /Number\(engine\._currentFloor\)/.test(rc));
  ok('8k 再回落 chat.length - 1', /_chat\.length - 1/.test(rc));
  // **-1 不是合法楼层**：三档都要 >= 0 才采纳，否则重跑会漏
  ok('8l 取数处有 >= 0 守卫（-1 不被当合法楼层）', /_n >= 0/.test(rc));
  // 位置纪律：这组接线必须在 _finalize 定义之前（否则 finalMerged 已交给下游）
  const posGate = rc.indexOf('G.pick(finalMerged');
  const posFin = rc.indexOf('const _finalize = () => {');
  ok('8m 接线在 _finalize 之前', posGate > 0 && posFin > 0 && posGate < posFin,
    'gate=' + posGate + ' finalize=' + posFin);
  // 宿主侧
  const idx = read('index.js');
  ok('8n index.js 有库口函数', /function _recallProgressGateLib\(\)/.test(idx) && /function _recallProvenanceLedgerLib\(\)/.test(idx));
  ok('8o 库口已注入 engine-recall 的 bindDeps', /_recallProgressGateLib: _recallProgressGateLib/.test(idx));
  ok('8p 取的是正确的全局名', /window\.LonShaRecallProgressGate/.test(idx) && /window\.LonShaRecallProvenanceLedger/.test(idx));
  // 配置默认值
  const cfg = read('memory-config.js');
  ok('8q 配置默认开进度门', /recallProgressGate: true/.test(cfg));
  ok('8r 配置默认开台账', /recallProvenanceLedger: true/.test(cfg));
  ok('8s 严格模式默认关', /recallProvenanceStrict: false/.test(cfg));
  // 模块登记进装载面
  const man = read('manifest.json');
  ok('8t manifest 登记 recall-progress-gate.js', man.includes('"recall-progress-gate.js"'));
  ok('8u manifest 登记 recall-provenance-ledger.js', man.includes('"recall-provenance-ledger.js"'));
}

// ========== 9. 版权纯度 / 边界（不照搬源实现） ==========
{
  const g = read('recall-progress-gate.js');
  const l = read('recall-provenance-ledger.js');
  // lorecodex 的概念不该出现在本仓模块里（说明没照抄它的实现）
  // 断言只看**代码面**：注释里引用借鉴对象（说明「本仓不这么做」）是合理的，不该判红。
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const gCode = stripComments(g), lCode = stripComments(l);
  ok('9a 不做它的章节树（无 list_series / list_arcs 工具调用）', !/list_series|list_arcs|get_arc_scenes/.test(gCode + lCode));
  ok('9b 不做它的 read_scene 往返（无该工具调用）', !/read_scene\s*\(|readScenes\s*\(/.test(gCode + lCode));
  ok('9c 不引入 IndexedDB（本仓数据在 extensionSettings / chatMetadata）', !/indexedDB|IDBDatabase/i.test(gCode + lCode));
  // 更强的一条：本仓**没有**「读过」这个状态（硬造等于自欺）
  ok('9d 台账不伪造「已读」状态字段', !/readState|hasRead\b|markRead/.test(lCode));
  // 双导出与全局名
  ok('9e 进度门挂 LonSha 前缀全局', g.includes('LonShaRecallProgressGate'));
  ok('9f 台账挂 LonSha 前缀全局', l.includes('LonShaRecallProvenanceLedger'));
  ok('9g 进度门 CJS 双导出', /module\.exports = factory\(\)/.test(g));
  ok('9h 台账 CJS 双导出', /module\.exports = factory\(\)/.test(l));
  // 不新增存储键：两个模块都不该出现写库调用
  ok('9i 进度门不写库（无 extensionSettings 赋值）', !/extensionSettings\s*\[?[^\]]*\]?\s*=/.test(g));
  ok('9j 台账不写库', !/extensionSettings\s*\[?[^\]]*\]?\s*=/.test(l));
  // 不取钟（纯函数纪律）：进度由调用方传入
  ok('9k 进度门不自己取钟', !/Date\.now\(\)|new Date\(/.test(g));
}

// ========== 10. 当版自锚（版本守卫 V4 要求：当版档案里恰一处 vnum 锚点） ==========
/* 为什么要这一条：`tests/audit/scan_version_guard.mjs` 的 V4 要求「当版 frontier 文件里
 *   必须恰有一处以 vnum 恰好锚着当前版本」——否则版本守卫失去基准（锚被静默删空也无人喊）。
 *   本文件是当版档案（文件头就写着本文件名 + v3.483.0），故由它承担这个锚。
 *   形态用字面量而非 `const CUR = ...`：V4 两种都收，字面量更直白，
 *   且这里的断言对象是 `vnum` 本身（数值口径），不是「某处文本里出现版本串」。 */
{
  const vnum = (s) => {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
  };
  const idx = read('index.js');
  const cur = (/const VERSION = '([0-9.]+)'/.exec(idx) || [])[1];
  ok('10a 当版锚：index.js VERSION 就是 v3.483.0', cur === '3.483.0', '实得 ' + cur);
  ok('10b 当版锚的数值口径可复算', vnum('3.483.0') === 3483000, '实得 ' + vnum('3.483.0'));
}

console.log(`v3483 recall-progress-gate + provenance-ledger: ${pass} passed`);