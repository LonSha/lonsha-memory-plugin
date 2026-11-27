/* ============================================================
 * tests/v3488_vector_backend_ladder.test.mjs — v3.488.0
 *
 * 主题：缝合「光域·镜忆」的**五档向量后端降级链**（第 5 条，最后一条）。
 *
 *   那边是 st_local → local_hybrid → browser_onnx → external_api 的自动降级。
 *   本仓只有一个向量出口（local-ngram-vectorizer.js），但「现在到底走在第几档」
 *   在面板上从来没有形状 —— 用户看到召回变差，看不到真嵌入已整层掉了。
 *
 *   搬进本仓时必须改形：
 *     · 那四档里 st_local / browser_onnx 本宿主根本没有。**不许假装有**
 *       （不写进 order 谎报优先级，只在声明里记缺席，并在读数上现形）。
 *     · 本仓真实序是 external_api → local_hybrid → legacy_simple（不是镜忆链序）。
 *     · 不探活、不发请求：探针与请求的**结果**由调用方给，本模块只判定 + 回预算。
 *       在这里再写一遍超时重试就是第二个真源（与 fetchWithTimeoutRetry 漂移）。
 *
 * 覆盖：
 *   1  三态不同形：absent（全无观测）≠ 走了最差档
 *   2  三态不同形：unknown（没人声明过）≠ absent（不可用）
 *   3  三态不同形：cooling（可用但在冷却窗内）≠ absent
 *   4  降级来源形态 `local-ngram-after:xxx` 归位到原档（尾巴不改档位）
 *   5  认不出来的来源进 unclassified，不猜它是哪一档
 *   6  当前档 = order 里最靠前且被观测到的档；order 外声明缺席的档照样现形
 *   7  探针：新鲜失败 ⇒ absent（带 probe-failed）；过期 ⇒ unknown(probe-stale)，不冒充失败
 *   8  探针缓存：窗内 fresh / 窗外 stale / 时钟回拨 ⇒ none（不冒充新鲜）
 *   9  预算：缺省 3500 / 8000；档位覆盖优先于全局
 *   10 纯函数：同入参必得同出参；入参（含 Map）不被改
 *   11 malformed：order 非数组 / 空 ⇒ 有状态不抛异常
 *   12 人话：四态四种句子，不是同一句换个数
 *   13 不新增配置键：本模块不读 window / localStorage / 全局 config
 *   14 observe 吃四种容器形态
 *   15 接线自证：manifest ×1 + engine-registry ×1 + index 库口/注入/读数 + 诊断行登记
 *   16 当版锚
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = new URL('..', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');
const L = require('../vector-backend-ladder.js');

const ORDER = ['external_api', 'local_hybrid', 'legacy_simple'];
const base = (extra) => Object.assign({ order: ORDER, now: 1000 }, extra || {});

test('1. 全无观测 ⇒ absent，与「走了最差档」不同形', () => {
  const none = L.plan(base({ observed: new Map() }));
  assert.equal(none.state, 'absent');
  assert.equal(none.current, null);
  assert.equal(none.currentIndex, -1);
  assert.equal(none.readings.observedTotal, 0);
  /* 走了最差档是 degraded（有观测、当前档在末尾），两态不许同形 */
  const worst = L.plan(base({ observed: { 'legacy-simple': 3 } }));
  assert.equal(worst.state, 'degraded');
  assert.equal(worst.current, 'legacy_simple');
  assert.equal(worst.currentIndex, 2);
  assert.notEqual(L.summary(none), L.summary(worst), 'absent 与 degraded 的人话必须不同');
});

test('2. 没人声明过 ⇒ unknown，绝不记成 absent', () => {
  const r = L.plan(base({
    observed: { 'legacy-simple': 1 },
    declared: { external_api: 'absent', local_hybrid: 'unknown', legacy_simple: 'present' },
    why: { external_api: 'no-key' }
  }));
  assert.deepEqual(r.readings.absent.map((x) => x.rung), ['external_api']);
  assert.deepEqual(r.readings.unknown.map((x) => x.rung), ['local_hybrid']);
  assert.equal(r.readings.unknown[0].reason, 'not-declared');
  /* 未声明的档不许出现在 absent 里（这是「两态同形」的老账） */
  assert.equal(r.readings.absent.some((x) => x.rung === 'local_hybrid'), false);
});

test('3. 声明可用但正在冷却 ⇒ cooling，不是 absent', () => {
  const cd = (rung) => (rung === 'external_api' ? 'cooling' : 'open');
  const r = L.plan(base({
    observed: { 'local-ngram': 5 },
    declared: { external_api: 'present', local_hybrid: 'present' },
    cooldown: cd
  }));
  assert.equal(r.current, 'local_hybrid');
  assert.equal(r.state, 'degraded');
  assert.deepEqual(r.readings.cooling.map((x) => x.rung), ['external_api']);
  assert.equal(r.readings.absent.length, 0, '冷却不是不可用，不许混进 absent');
  assert.equal(r.readings.betterNotUsed[0].code, 'cooling');
  /* 声明缺席优先于冷却：既然声明了不可用，冷却就是无关信息 */
  const r2 = L.plan(base({
    observed: { 'local-ngram': 1 },
    declared: { external_api: 'absent' },
    cooldown: cd
  }));
  assert.equal(r2.readings.absent[0].rung, 'external_api');
  assert.equal(r2.readings.cooling.length, 0);
});

test('4. `local-ngram-after:<因>` 归位到 local_hybrid（尾巴不改档位）', () => {
  assert.equal(L.rungOfSource('local-ngram'), 'local_hybrid');
  assert.equal(L.rungOfSource('local-ngram-after:apiError'), 'local_hybrid');
  assert.equal(L.rungOfSource('local-ngram-after:exception'), 'local_hybrid');
  assert.equal(L.rungOfSource('api'), 'external_api');
  assert.equal(L.rungOfSource('legacy-simple'), 'legacy_simple');
  const r = L.plan(base({ observed: { 'local-ngram-after:noKey': 2 } }));
  assert.equal(r.current, 'local_hybrid');
  assert.equal(r.readings.byRung.local_hybrid, 2);
  assert.equal(r.readings.unclassified, 0);
});

test('5. 认不出来的来源进 unclassified，不猜', () => {
  const r = L.plan(base({ observed: { 'api': 1, 'who-knows': 2 } }));
  assert.equal(r.readings.unclassified, 2);
  assert.equal(r.readings.unknownSource['who-knows'], 2);
  assert.equal(r.current, 'external_api', '认不出的来源不许影响当前档判定');
  assert.equal(L.rungOfSource('who-knows'), null);
});

test('6. 当前档取 order 里最靠前且被观测到的；order 外的缺席档照样现形', () => {
  const r = L.fromSources(new Map([['d1', 'api'], ['d2', 'local-ngram']]));
  assert.equal(r.current, 'external_api');
  assert.equal(r.state, 'ready');
  /* 本仓真实序里没有 st_local / browser_onnx（宿主没实现），但必须在读数上看得见 */
  const absent = r.readings.absent.map((x) => x.rung).sort();
  assert.deepEqual(absent, ['browser_onnx', 'st_local']);
  assert.equal(r.readings.absent.every((x) => x.outsideOrder === true), true);
  assert.equal(r.readings.absent.find((x) => x.rung === 'browser_onnx').reason, '宿主无 onnx 运行时');
  assert.equal(L.REPO_ORDER.includes('st_local'), false, '宿主没有的档不许写进 order 谎报优先级');
  assert.equal(L.MIRROR_CHAIN.length, 5, '镜忆原链是五档（这就是第 5 条的「五」）');
});

test('7. 探针新鲜失败 ⇒ absent；过期 ⇒ unknown(probe-stale)，不冒充失败', () => {
  const fresh = new Map([['external_api', { at: 900, ok: false, reason: 'timeout' }]]);
  const a = L.plan(base({ observed: { 'local-ngram': 1 }, declared: { external_api: 'present' }, probeCache: fresh, probeCacheMs: 60000 }));
  assert.equal(a.readings.absent[0].rung, 'external_api');
  assert.equal(a.readings.absent[0].reason, 'probe-failed:timeout');
  const stale = new Map([['external_api', { at: 1, ok: false, reason: 'timeout' }]]);
  const b = L.plan(base({ observed: { 'local-ngram': 1 }, probeCache: stale, probeCacheMs: 60 }));
  assert.equal(b.readings.unknown[0].rung, 'external_api');
  assert.equal(b.readings.unknown[0].reason, 'probe-stale');
  assert.equal(b.readings.absent.length, 0, '探针过期只表示该重探，不是失败');
});

test('8. 探针缓存窗与时钟回拨', () => {
  const cache = new Map([['external_api', { at: 1000, ok: true, reason: 'ok' }]]);
  assert.equal(L.probeUsable(cache, 'external_api', 1000, 60000).state, 'fresh');
  assert.equal(L.probeUsable(cache, 'external_api', 61000, 60000).state, 'fresh', '边界含等于');
  assert.equal(L.probeUsable(cache, 'external_api', 61001, 60000).state, 'stale');
  assert.equal(L.probeUsable(cache, 'external_api', 500, 60000).state, 'none', '时钟回拨不许冒充新鲜');
  assert.equal(L.probeUsable(cache, 'local_hybrid', 1000, 60000).state, 'none');
  const rec = L.rememberProbe({ ok: false, reason: 'quota' }, 777);
  assert.deepEqual(rec, { at: 777, ok: false, reason: 'quota' });
  assert.equal(L.rememberProbe({}, 5).reason, 'failed', '没理由时如实记 failed，不记 ok');
});

test('9. 预算：缺省 3500/8000，档位覆盖优先', () => {
  assert.equal(L.DEFAULTS.probeTimeoutMs, 3500);
  assert.equal(L.DEFAULTS.requestTimeoutMs, 8000);
  const a = L.plan(base({ observed: { 'api': 1 } }));
  assert.equal(a.readings.probeTimeoutMs, 3500);
  assert.equal(a.readings.requestTimeoutMs, 8000);
  const b = L.plan(base({
    observed: { 'api': 1 },
    budgets: { probeTimeoutMs: 1200, external_api: { requestTimeoutMs: 20000 } }
  }));
  assert.equal(b.readings.probeTimeoutMs, 1200);
  assert.equal(b.readings.requestTimeoutMs, 20000, '档位覆盖必须优先于全局');
});

test('10. 纯函数：同入参同出参，入参不被改', () => {
  const obs = new Map([['d1', 'api'], ['d2', 'local-ngram-after:apiError']]);
  const order = ORDER.slice();
  const inp = { order, now: 42, observed: obs, declared: { external_api: 'present' }, probeCacheMs: 60000 };
  const a = L.plan(inp);
  const b = L.plan(inp);
  assert.deepEqual(a, b, '同入参必得同出参');
  assert.equal(obs.size, 2, '观测容器不许被改');
  assert.deepEqual(order, ORDER, 'order 不许被改');
  assert.equal(a.readings.byRung.external_api, 1);
  /* 返回的 order 是副本：改它不影响下一次 */
  a.readings.order.push('legacy_simple');
  assert.deepEqual(L.plan(inp).readings.order, ORDER);
});

test('11. order 非数组 / 空 ⇒ malformed，有状态不抛', () => {
  const a = L.plan({ order: 'external_api', observed: { api: 1 } });
  assert.equal(a.state, 'malformed');
  assert.equal(a.readings.reason, 'order-not-array');
  const b = L.plan({ order: [], observed: { api: 1 } });
  assert.equal(b.state, 'malformed');
  assert.equal(b.readings.reason, 'order-empty');
  const c = L.plan(null);
  assert.equal(c.state, 'malformed', 'null 入参也要给出状态，不许抛');
  assert.equal(L.plan(undefined).readings.current, null);
});

test('12. 人话：四态四种句子', () => {
  const ready = L.summary(L.plan(base({ observed: { api: 1 } })));
  const degraded = L.summary(L.plan(base({ observed: { 'legacy-simple': 1 } })));
  const absent = L.summary(L.plan(base({ observed: new Map() })));
  const mal = L.summary(L.plan({ order: 'x' }));
  const all = [ready, degraded, absent, mal];
  assert.equal(new Set(all).size, 4, '四种状态不许同形：' + all.join(' / '));
  assert.match(ready, /首选档/);
  assert.match(degraded, /第 3\/3 档/);
  assert.match(absent, /没有任何向量产出/);
  assert.match(mal, /缺量/);
  assert.equal(L.summary(null).length > 0, true);
});

test('13. 不新增配置键：模块不读 window / localStorage / 全局 config', () => {
  const src = read('vector-backend-ladder.js');
  assert.equal(/localStorage/.test(src), false);
  assert.equal(/window\./.test(src), false);
  assert.equal(/LonShaConfig|configMgr|\.config\.config/.test(src), false);
  /* 纯函数纪律：不读时钟 */
  assert.equal(/Date\.now\(\)/.test(src), false, 'now 必须由调用方给');
  assert.equal(/fetch\(|XMLHttpRequest/.test(src), false, '不发请求');
});

test('14. observe 吃四种容器形态', () => {
  const m = L.observe(new Map([['d1', 'api'], ['d2', 'api']]));
  assert.deepEqual(m.byRung, { external_api: 2 });
  assert.equal(m.total, 2);
  const arr = L.observe(['api', 'legacy-simple', 'oops']);
  assert.equal(arr.byRung.external_api, 1);
  assert.equal(arr.byRung.legacy_simple, 1);
  assert.equal(arr.unclassified, 1);
  const counts = L.observe({ api: 3, 'local-ngram': 1 });
  assert.deepEqual(counts.byRung, { external_api: 3, local_hybrid: 1 });
  assert.equal(counts.total, 4);
  const plain = L.observe({ doc_1: 'api', doc_2: 'local-ngram' });
  assert.equal(plain.total, 2);
  assert.equal(plain.byRung.local_hybrid, 1);
  assert.equal(L.observe(null).total, 0);
});

test('15. 接线自证：manifest ×1 + registry ×1 + index + 诊断行登记', () => {
  const man = JSON.parse(read('manifest.json'));
  assert.equal(man.extra_js.includes('vector-backend-ladder.js'), true, '未登记进 manifest.extra_js');
  assert.equal(man.extra_js.length, 465, 'extra_js 应为 465（本版 +1）');
  const reg = read('optional-engine-registry.js');
  assert.equal(reg.includes("['VectorBackendLadder', 'vector-backend-ladder.js']"), true, '可选引擎台账里没有它 = 宿主装不上');
  const idx = read('index.js');
  assert.equal(idx.includes("window.LonShaVectorBackendLadder, 'vector-backend-ladder.js'"), true);
  assert.equal(idx.includes('_vectorBackendLadderLib: _vectorBackendLadderLib,'), true, 'bindDeps 少一处注入，面板恒为 module-missing');
  assert.equal(idx.includes('_vectorLadderReadings()'), true);
  assert.equal(idx.includes('embedSourceByDoc'), true, '读数必须真读来源账，不能只报个常量');
  const diag = read('engine-diagnostic-lines.js');
  assert.equal(diag.includes('_vectorLadderLine: _vectorLadderLine,'), true, '诊断行没导出 = 面板上没有这一行');
  assert.equal(diag.includes('L.fromSources(sources'), true, '诊断行必须走模块唯一入口，不许自己数来源');
  const ledger = JSON.parse(read('tests/audit/diag_split_verbatim.json'));
  for (const f of ['_vectorBackendLadderLib', '_vectorLadderLine']) {
    assert.equal(ledger.core_functions.includes(f), true, '装配面函数未登记：' + f);
  }
  /* 单一口径：本仓真实序只此一份 */
  assert.deepEqual(L.REPO_ORDER, ['external_api', 'local_hybrid', 'legacy_simple']);
});

test('16. 当版锚', () => {
  const man = JSON.parse(read('manifest.json'));
  assert.equal(man.version, '3.488.0', '本套件自 3.488.0 起成立；当前 ' + man.version);
  assert.equal(L.VERSION, '3.488.0');
  assert.equal(read('vector-backend-ladder.js').includes("VERSION = '3.488.0'"), true);
});
