/* ================================================================
 * story-eval-runner.js — 剧情三阶段评测内核（真管线，零造假）
 * [v3.250.0] 计划 A 批 M-O2 首批。
 *
 * 为什么单独一个 runner 而不是把逻辑写在套件里：三阶段（候选 → 排序 → 注入）的
 *   **口径**必须只有一份。套件里再写一遍，下一版就会有两份「什么叫候选全」的定义。
 *
 * 三阶段都用真模块：
 *   ① 候选：unified-recall.graphToCandidates（includeDeferred = 全量参赛）
 *   ② 排序：ai-select.scoreEntry（真评分）
 *   ③ 注入：unified-recall.mergeWithGuaranteed → 组装 → **逐条过真机制门**
 *
 * ★ 关于「禁止带入」的口径（本 runner 最重要的一条设计决定）：
 *   图管线**没有** forbid 概念，硬零（隐藏身份泄露 / 已撤销事实 / 跨会话误注）
 *   必须由**机制**守，不能靠图管线代管。于是每条危险样本带两个东西：
 *     · probe —— 一条**绑定该机制**的探针条目（如带 `!掌柜` 披露条件的关系边）
 *     · expect —— 该探针应当被挡下（abs/err），而不是期望整块上下文里没这个词
 *   反过来，探针在**同一条上下文**里必须**确实会被拦**（guard.detail.probeGated）：
 *   否则“没泄露”只是因为门从来不开 —— 那是假绿（本仓 v3.249 刚治过的同类病）。
 * ================================================================ */
(function () {
  'use strict';
  const RUNNER_VERSION = 3; // [v3.276.0 O6] 留出集通路：多轮序列 + 无答案样本
  /** 取一个模块（Node: require；浏览器: root.LonShaXxx）。 */
  function pick(root, name, rel) {
    if (root && root[name]) return root[name];
    if (typeof require === 'function') { try { return require(rel); } catch (_e) { /* 忽略 */ } }
    return null;
  }
  const DEF_MODULES = function (root) {
    return {
      UR: pick(root, 'LonShaUnifiedRecall', '../../unified-recall.js'),
      AS: pick(root, 'LonShaAISelect', '../../ai-select.js'),
      IR: pick(root, 'LonShaInjectionRouter', '../../injection-router.js'),
      RD: pick(root, 'LonShaRelationDisclosure', '../../relation-disclosure.js'),
      FV: pick(root, 'LonShaFactVersion', '../../fact-version.js'),
      SP: pick(root, 'LonShaSummaryProvenance', '../../summary-provenance.js'),
      FL: pick(root, 'LonShaFloorLedger', '../../floor-ledger.js'),
    };
  };
  /** 三阶段跑一个样本。modules 缺任一必需项 ⇒ 调用方拒判（不写 0 分）。 */
  function runSample(sc, modules, opts) {
    const o = opts || {};
    const UR = modules.UR, AS = modules.AS;
    const q = sc.query;
    const c1 = {};
    const cands = UR.graphToCandidates(sc.nodes, { includeDeferred: true }, c1);
    const candIds = cands.map((c) => c.id);
    const scored = cands.map((c) => Object.assign({}, c, { score: AS.scoreEntry(c, q, q, q).score }));
    const ranked = scored.slice().sort((a, b) => (b.score - a.score) || (b.updatedAt - a.updatedAt));
    const m2 = {};
    /* ★ 名额必须**真会筛**：样本候选 = 目标 1–2 条 + 噪声 4 条 ≈ 6 条。
     *   默认 8 个名额时 mergeWithGuaranteed 的「保底 + 补齐」会把候选全收进来，
     *   排序层根本不构成瓶颈 —— 那样 B2/D2 测的就不是排序层（首版即踩：
     *   破坏「有分数的才选进来」后 mustIn 照样全在 merged 里，判据纹丝不动）。
     *   收紧到 4：超过名额的**真会被筛掉**，mustIn 能否留下才是排序层的本事。 */
    const merged = UR.mergeWithGuaranteed(ranked, { maxTotal: Number(o.maxTotal) || 4 }, m2);
    const mergedIds = merged.map((c) => c.id);
    const inCand = (k) => candIds.indexOf(k) >= 0;
    const inMerge = (k) => mergedIds.indexOf(k) >= 0;
    const scoreOf = (k) => { const x = ranked.find((y) => y.id === k); return x ? Number(x.score) || 0 : null; };
    const missCand = sc.must.filter((k) => !inCand(k));
    const missMerge = sc.mustIn.filter((k) => !inMerge(k));
    const missRank = []
      .concat((sc.mustIn || []).filter((k) => inCand(k) && !inMerge(k)))
      .concat((sc.must || []).filter((k) => inCand(k) && (scoreOf(k) || 0) <= 0));
    /* 真机制守卫：本样本的「禁止带入」由哪道门守、门现在到底开不开 */
    const scoreMap = {};
    for (const x of ranked) scoreMap[x.id] = x.score;
    const gd = guard(sc, modules, { contextText: q, scores: scoreMap, deletedFloor: sc.deletedFloor });
    const lowScores = (sc.low ? [sc.low] : []).map((k) => ({ id: k, score: scoreOf(k) }));
    return {
      cls: sc.cls, case: sc.case, note: sc.note, query: q, gate: sc.gate || '',
      must: sc.must.slice(), mustIn: sc.mustIn.slice(), forbid: (sc.forbid || []).slice(),
      candTotal: candIds.length, candIds: candIds.slice(0, 40),
      scored: ranked.slice(0, 8).map((x) => ({ id: x.id, score: x.score })),
      mergedIds: mergedIds.slice(), mergeCarry: m2,
      missCand: missCand, missMerge: missMerge, missRank: missRank,
      guard: gd,
      low: sc.low || '',
      lowScores: lowScores,
      stage1Ok: missCand.length === 0,
      isGap: sc.kind === 'gap',
      isRankProbe: sc.kind === 'rank-probe',
      stage2Ok: (sc.kind === 'gap' || sc.kind === 'rank-probe') ? true : (missMerge.length === 0 && missRank.length === 0),
      guardOk: gd.guarded,
      stage3Ok: (sc.kind === 'gap' || sc.kind === 'rank-probe' || (sc.mustIn || []).length === 0) ? true : (function () {
        const IR = modules.IR;
        const recalled = merged.map((c) => ({ text: String(c.content || c._label || ''), source: 'graph:' + c._nodeType }));
        const blocks = recalled.map((r) => r.text);
        const tight = IR.trimToBudget(blocks.join('\n'), Number(o.budget) || 200, blocks, o.strategy || 'balanced');
        return sc.mustIn.every((k) => {
          const c = merged.find((x) => x.id === k);
          if (!c) return false;
          const t = String(c.content || c._label || '');
          return !!t && tight.indexOf(t) >= 0;
        });
      })(),
      noiseIds: (sc.noiseIds || []).slice(), noiseInMerge: (sc.noiseIds || []).filter((k) => inMerge(k)).length,
    };
  }
  /* ── [v3.276.0 O6] 多轮状态序列：同一记忆图逐轮追问 ────────────────
   * 【为什么必须逐轮跑而不是拼成一个大查询】
   *   多轮的质量问题恰好出在「上一轮说过的、下一轮不见了」：把三轮拼成一个查询，
   *   这个形态**测不出来**（每轮都有全量候选参赛）。
   * 【口径】每轮独立走真三阶段，节点集**逐轮完全相同**（同一张图），
   *   故「某轮丢」只能归因到该轮的查询，不能归因到图变了。
   */
  function runTurns(spec, modules, opts) {
    const o = opts || {};
    const turns = Array.isArray(spec.turns) ? spec.turns : [];
    if (!turns.length) return { ok: false, error: '多轮样本没有轮次（拒判）', turns: [] };
    const out = [];
    for (let i = 0; i < turns.length; i++) {
      const t = turns[i];
      const sc = {
        cls: spec.cls, case: spec.case + '#t' + (i + 1), floor: spec.floor, session: spec.session,
        query: t.query, note: spec.note,
        must: (t.must || []).slice(), mustIn: (t.mustIn || []).slice(), forbid: [],
        low: '', gate: '', guardCond: '', kind: '',
        nodes: (spec.nodes || []).slice(),
        noiseIds: (spec.nodes || []).filter((n) => /_n\d+$/.test(n.id)).map((n) => n.id),
        src: { floor: spec.floor, session: spec.session },
      };
      const r = runSample(sc, modules, o);
      out.push({ turn: i + 1, query: t.query, srcText: t.srcText || '', stage1Ok: r.stage1Ok, stage2Ok: r.stage2Ok,
        stage3Ok: r.stage3Ok, missCand: r.missCand, missMerge: r.missMerge, candTotal: r.candTotal,
        mergedIds: r.mergedIds });
    }
    const bad = out.filter((x) => !(x.stage1Ok && x.stage2Ok && x.stage3Ok));
    return { ok: true, case: spec.case, cls: spec.cls, turns: out,
      turnsOk: out.length - bad.length, turnsTotal: out.length, badTurns: bad.map((x) => x.turn), allOk: bad.length === 0 };
  }

  /* ── [v3.276.0 O6] 「无答案」样本：记忆里没有这条 ────────────────
   * 【口径：不许靠扩召回数量得分】
   *   引擎在候选稀疏时会把**零分条目补齐**进注入（mergeWithGuaranteed 第 3 步）。
   *   在「有答案」的场景里这是保底（防漏召）；在「本来就没有答案」的场景里，
   *   它就变成「拿无关条目凑出一个看起来有内容的注入」—— 判据必须能把它量出来。
   *   故本通路报两件事：
   *     · paddedZeroScore —— 零分却进了注入的条数（**扩召回数量**的直接读数）
   *     · topScore —— 最高分；为 0 表示「一条真证据都没有」
   *   并且**不做**「必须返回空」这种断言：本 runner 不下产品结论，只把读数交出去。
   */
  function runNoAnswer(spec, modules, opts) {
    const o = opts || {};
    const q = String(spec.query || '');
    if (!q) return { ok: false, error: '无答案样本没有查询（拒判）' };
    const nodes = (spec.nodes || []).slice();
    const cands = modules.UR.graphToCandidates(nodes, { includeDeferred: true }, {});
    const scored = cands.map((c) => Object.assign({}, c, { score: modules.AS.scoreEntry(c, q, q, q).score }));
    const ranked = scored.slice().sort((a, b) => (b.score - a.score) || (b.updatedAt - a.updatedAt));
    const carry = {};
    const merged = modules.UR.mergeWithGuaranteed(ranked, { maxTotal: Number(o.maxTotal) || 4 }, carry);
    const topScore = ranked.length ? Number(ranked[0].score) || 0 : null;
    const padded = merged.filter((c) => (Number(c.score) || 0) <= 0).length;
    return {
      ok: true, case: spec.case, cls: spec.cls, query: q, note: spec.note || '',
      srcText: spec.srcText || '',
      candTotal: cands.length, mergedTotal: merged.length,
      topScore: topScore, paddedZeroScore: padded,
      /* 判据读数（不是产品结论）：有词面证据为 0 条 ⇒ 这一轮「答不出」是**应当的**。 */
      noEvidence: (topScore === 0 || topScore === null),
      mergedIds: merged.map((c) => c.id), scoredIds: ranked.filter((c) => (Number(c.score) || 0) > 0).map((c) => c.id),
    };
  }

  function buildFactState(FV, facts) {
    let st = FV.normalize(null);
    const trace = [];
    for (const f of (facts || [])) {
      const r = FV.assertFact(st, f);
      trace.push({ ok: r.ok, reason: r.reason || '', changed: r.changed });
      if (r.state) st = r.state;
    }
    return { state: st, trace: trace };
  }
  function guardFact(FV, sc) {
    const facts = (sc.facts || []).slice();
    if (!facts.length) return { guarded: false, why: 'no-facts（拒判）', detail: {} };
    const b = buildFactState(FV, facts);
    const lk = FV.lookup(b.state, { subject: facts[0].subject, predicate: facts[0].predicate });
    const cur = lk && lk.fact ? String(lk.fact.value) : '';
    const bad = String(sc.forbidValue || '');
    const tl = FV.timeline(b.state, { subject: facts[0].subject });
    const versions = (tl && tl.versions) || [];
    const tomb = versions.some((v) => String(v.value) === bad && v.revoked);
    const replaced = !!cur && cur !== bad;
    const supersededInView = versions.some((v) => String(v.value) === bad && v.to != null);
    return {
      guarded: !!bad && (replaced || tomb || supersededInView),
      why: 'fact-revoked',
      detail: { reason: lk.reason, current: cur, forbidden: bad, tomb: tomb, replaced: replaced,
        supersededInView: supersededInView, versions: versions.length, trace: b.trace },
    };
  }
  function guardProvenance(SP, sc) {
    const floor = Number(sc.deletedFloor);
    if (!Number.isFinite(floor) || floor < 0) return { guarded: false, why: 'no-deleted-floor（拒判）', detail: {} };
    const probe = { id: 'probe', text: 'probe-' + sc.case, floor: floor };
    const before = [];
    for (let i = 0; i < floor; i++) before.push({ index: i, mes: '第 ' + i + ' 楼旧正文', is_user: false, swipes: ['第 ' + i + ' 楼旧正文'], swipe_id: 0 });
    const atFloor = { index: floor, mes: '第 ' + floor + ' 楼原文（留证时的显示页）', is_user: false,
      swipes: ['第 ' + floor + ' 楼原文（留证时的显示页）'], swipe_id: 0 };
    const cap = SP.capture(probe, atFloor);
    const captured = !!cap;
    const atFloor2 = { index: floor, mes: '第 ' + floor + ' 楼改过之后', is_user: false,
      swipes: ['第 ' + floor + ' 楼原文（留证时的显示页）', '第 ' + floor + ' 楼改过之后'], swipe_id: 1 };
    const chatAfter = before.concat([atFloor2]);
    const r = SP.filterForRecall([probe], chatAfter);
    return {
      guarded: captured && r.dropped.length >= 1,
      why: 'provenance',
      detail: { captured: captured, dropped: r.dropped.length, status: (r.dropped[0] || {}).status || '', counts: r.counts },
    };
  }
  function guard(sc, modules, ctx) {
    const g = sc.gate;
    if (!g) return { guarded: true, why: 'no-gate', detail: {} };
    if (sc.kind === 'gap' || sc.kind === 'rank-probe') return { guarded: true, why: 'known-gap（不进主指标）', detail: {} };
    if (g === 'scoring') {
      const ks = ctx && ctx.scores ? ctx.scores : {};
      const id = (sc.low || (sc.forbid || [])[0] || '');
      const s = (id && ks[id] != null) ? Number(ks[id]) : null;
      if (s == null) return { guarded: false, why: 'no-score（拒判）', detail: {} };
      return { guarded: s <= 0, why: 'scoring', detail: { id: id, score: s } };
    }
    if (g === 'disclosure') {
      const RD = modules.RD;
      if (!RD || typeof RD.partition !== 'function') return { guarded: false, why: 'module-missing:relation-disclosure', detail: {} };
      const text = String(ctx && ctx.contextText || '');
      const probe = RD.partition([{ id: 'probe', data: { disclosure: sc.guardCond } }], text);
      const gateOpens = (probe.counts && probe.counts.miss) > 0;
      const edges = (sc.forbid || []).map((id) => ({ id: id, data: { disclosure: sc.guardCond } }));
      const r = RD.partition(edges, text);
      return { guarded: gateOpens && r.gated.length === edges.length, why: 'disclosure',
        detail: { gateOpens: gateOpens, gated: r.gated.map((x) => x.id), counts: r.counts, cond: sc.guardCond } };
    }
    if (g === 'fact-revoked') {
      const FV = modules.FV;
      if (!FV || typeof FV.lookup !== 'function') return { guarded: false, why: 'module-missing:fact-version', detail: {} };
      return guardFact(FV, sc);
    }
    if (g === 'provenance') {
      const SP = modules.SP;
      if (!SP || typeof SP.filterForRecall !== 'function') return { guarded: false, why: 'module-missing:summary-provenance', detail: {} };
      return guardProvenance(SP, sc);
    }
    return { guarded: true, why: g, detail: {} };
  }
  function runAll(opts) {
    const o = opts || {};
    const root = (typeof globalThis !== 'undefined') ? globalThis : {};
    const M = Object.assign(DEF_MODULES(root), o.modules || {});
    const missing = [];
    if (!M.UR || typeof M.UR.graphToCandidates !== 'function') missing.push('unified-recall.graphToCandidates');
    if (!M.AS || typeof M.AS.scoreEntry !== 'function') missing.push('ai-select.scoreEntry');
    if (!M.IR || typeof M.IR.trimToBudget !== 'function') missing.push('injection-router.trimToBudget');
    const gateNeeded = [];
    const list = Array.isArray(o.scenarios) && o.scenarios.length ? o.scenarios : (o.corpus && o.corpus.SCENARIOS) || [];
    for (const s of list) {
      if (s.gate === 'disclosure' && !(M.RD && M.RD.partition)) gateNeeded.push('relation-disclosure.partition');
      if (s.gate === 'fact-revoked' && !(M.FV && M.FV.lookup)) gateNeeded.push('fact-version.lookup');
      if (s.gate === 'provenance' && !(M.SP && M.SP.filterForRecall)) gateNeeded.push('summary-provenance.filterForRecall');
    }
    if (missing.length || gateNeeded.length) {
      return { ok: false, error: '真管线模块缺失：' + missing.concat(gateNeeded).join(' / '), samples: [], metrics: null };
    }
    if (!list.length) return { ok: false, error: '样本集为空（拒判）', samples: [], metrics: null };
    const samples = list.map((sc) => runSample(sc, M, o));
    return summarize(samples, o);
  }
  function summarize(samples, opts) {
    const o = opts || {};
    const main = samples.filter((s) => !s.isGap && !s.isRankProbe);
    const gaps = samples.filter((s) => s.isGap);
    const n = main.length;
    const pct = (k) => (n ? main.filter((s) => s[k]).length / n : 0);
    const leakCases = samples.filter((s) => s.gate && !s.guardOk);
    const hardZero = {};
    for (const s of leakCases) hardZero[s.cls] = (hardZero[s.cls] || 0) + 1;
    const byClass = {};
    for (const c of (o.corpus && o.corpus.CLASSES) || []) {
      const g = samples.filter((s) => s.cls === c);
      byClass[c] = {
        samples: g.length,
        stage1: g.length ? g.filter((s) => s.stage1Ok).length / g.length : 1,
        stage2: g.length ? g.filter((s) => s.stage2Ok).length / g.length : 1,
        stage3: g.length ? g.filter((s) => s.stage3Ok).length / g.length : 1,
        guarded: g.filter((s) => !s.gate || s.guardOk).length === g.length,
      };
    }
    return {
      ok: true, samples: samples,
      metrics: {
        samples: n, gapSamples: gaps.length,
        stage1HitRate: pct('stage1Ok'),
        stage2HitRate: pct('stage2Ok'),
        stage3HitRate: pct('stage3Ok'),
        /* [v3.276.0 O6] 硬零指标**单独计**：
         *   修前 `guardOkRate = pct('guardOk')` 的分母是**全部主样本**（55 例），
         *   而带机制门的只有 4 例 —— 于是「泄密」这种禁入指标被摊进 55 例里：
         *   一例泄露只让读数从 1.0 掉到 0.982，在一堆 0.9x 的覆盖率里根本看不出来。
         *   计划原文点名：「泄密等禁入指标单独计不被平均命中率抵消」。
         *   故新增 `guardOkRateGated`（分母 = 带门样本）与显式的分子/分母；
         *   旧键 `guardOkRate` 保留（v3250 在用），但语义按注释说清是**覆盖率**口径。 */
        guardOkRate: pct('guardOk'),
        guardOkRateGated: (function () {
          const g = main.filter((s) => s.gate);
          return g.length ? g.filter((s) => s.guardOk).length / g.length : null;
        })(),
        guardGatedOk: main.filter((s) => s.gate && s.guardOk).length,
        guardGatedDenominator: main.filter((s) => s.gate).length,
        guardMainDenominator: n,
        gatedSamples: samples.filter((s) => s.gate).length,
        gateDetail: samples.filter((s) => s.gate).map((s) => ({ case: s.case, gate: s.gate, ok: s.guardOk, why: s.guard.why })),
        leakCases: leakCases.map((s) => ({ case: s.case, cls: s.cls, gate: s.gate, detail: s.guard.detail })),
        hardZeroByClass: hardZero,
        byClass: byClass,
        worstClasses: Object.keys(byClass)
          .map((c) => ({ cls: c, stage3: byClass[c].stage3, samples: byClass[c].samples }))
          .sort((a, b) => (a.stage3 - b.stage3) || (a.cls < b.cls ? -1 : 1))
          .slice(0, 3),
        stage2Loss: samples.filter((s) => s.stage1Ok && !s.stage2Ok).map((s) => ({ case: s.case, miss: s.missMerge.concat(s.missRank) })),
        stage3Loss: samples.filter((s) => s.stage2Ok && !s.stage3Ok).map((s) => ({ case: s.case, mustIn: s.mustIn })),
        avgCandTotal: n ? samples.reduce((a, s) => a + s.candTotal, 0) / n : 0,
        mustInPerSample: main.map((s) => (s.mustIn || []).length),
        mustInTopRate: main.length ? main.filter((s) => {
          const ids = s.scored.map((x) => x.id);
          return (s.mustIn || []).every((k) => ids.indexOf(k) < 1);
        }).length / main.length : 0,
        lowNoise: samples.filter((s) => s.low).map((s) => ({ case: s.case, id: s.low, score: (s.lowScores[0] || {}).score })),
        knownGaps: gaps.map((s) => ({ case: s.case, cls: s.cls,
          stage1Ok: s.stage1Ok, stage2Ok: s.stage2Ok, missRank: s.missRank, why: s.note })),
        gapStage1: gaps.filter((s) => s.stage1Ok).length,
        gapStage2: gaps.filter((s) => s.stage2Ok).length,
        /* [v3.276.0 O6] **模型输出与确定性内核分报告**。
         *   计划原文要求「模型输出与确定性内核分报告」；本 runner 只跑确定性内核
         *   （候选 → 评分 → 裁剪，全部真模块、无 LLM 调用）。
         *   没有真模型条件时**如实记不可测**（measured:false + 原因），
         *   不得写成 0 或省略该字段 —— 省略会让「没测」与「测了没问题」同形。 */
        modelFace: {
          measured: false,
          why: '无真模型条件（本 runner 不调 LLM；提取→写入→召回→请求载荷→生成需真宿主 + 真模型）',
          deterministicOnly: true,
        },
      },
    };
  }
  function checkGates(result, gates) {
    if (!result || !result.ok || !result.metrics) return ['评测未产出指标（拒判，不是通过）'];
    const m = result.metrics, g = Object.assign({
      minStage1: 1, minStage2: 1, minStage3: 1, maxLeak: 0,
    }, gates || {});
    const bad = [];
    if (m.stage1HitRate < g.minStage1) bad.push('候选命中率 ' + m.stage1HitRate + ' < ' + g.minStage1);
    if (m.stage2HitRate < g.minStage2) bad.push('排序命中率 ' + m.stage2HitRate + ' < ' + g.minStage2);
    if (m.stage3HitRate < g.minStage3) bad.push('最终注入命中率 ' + m.stage3HitRate + ' < ' + g.minStage3);
    if (m.leakCases.length > g.maxLeak) bad.push('机制门被破 ' + m.leakCases.length + ' 例 > ' + g.maxLeak);
    /* 禁入指标另有**带门分母**的读数：分母为 0（没有带门样本）时拒判，不得当成 1.0 通过。 */
    if (typeof g.minGuardGated === 'number') {
      if (m.guardOkRateGated === null) bad.push('没有带机制门的样本 ⇒ 禁入指标拒判（不得当成通过）');
      else if (m.guardOkRateGated < g.minGuardGated) bad.push('带门守卫通过率 ' + m.guardOkRateGated + ' < ' + g.minGuardGated);
    }
    return bad;
  }
  const api = { RUNNER_VERSION, pick, DEF_MODULES, guard, runSample, runAll, summarize, checkGates, runTurns, runNoAnswer };
  if (typeof window !== 'undefined') window.LonShaStoryEvalRunner = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
