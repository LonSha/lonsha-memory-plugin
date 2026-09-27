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
  const RUNNER_VERSION = 2;
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
      /* ★ 验收答案要**回填到结果上**：汇总层（以及判据）读的是结果对象。
       *   首版只回填了「判过的缺口」（missCand 等），没回填 must/mustIn ⇒ 汇总层读到空数组，
       *   而 `[].every()` 恒真 ⇒ mustInTopRate 永远是 1 —— 一条只在纸上成立的读数。 */
      must: sc.must.slice(), mustIn: sc.mustIn.slice(), forbid: (sc.forbid || []).slice(),
      candTotal: candIds.length, candIds: candIds.slice(0, 40),
      scored: ranked.slice(0, 8).map((x) => ({ id: x.id, score: x.score })),
      mergedIds: mergedIds.slice(), mergeCarry: m2,
      missCand: missCand, missMerge: missMerge, missRank: missRank,
      guard: gd,
      low: sc.low || '',
      lowScores: lowScores,
      /* 阶段闸门：候选层 / 排序层 / 机制门（危险样本才用） */
      stage1Ok: missCand.length === 0,
      /* gap 样本（keys 与 query 无字面交集⇒字面匹配召不回）**不进主指标**，
       *   但读数照旧全留：它是「已知缺口台账」，下次改评分能逐条对比。 */
      isGap: sc.kind === 'gap',
      stage2Ok: sc.kind === 'gap' ? true : (missMerge.length === 0 && missRank.length === 0),
      guardOk: gd.guarded,
      stage3Ok: (sc.kind === 'gap' || (sc.mustIn || []).length === 0) ? true : (function () {
        /* 最终注入层：在真分区 + 真预算裁剪下，mustIn 是否仍活着 ——
         *   前两步对、裁剪后丢了**不算成功**（计划原文）。 */
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
  /** 单条事实账的装配（守卫夹具与正控共用，避免两处各写一遍）。 */
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
  /** 事实账守卫：现状值对不对 + 旧值到底退没退役（退役也算守卫成立）。 */
  function guardFact(FV, sc) {
    const facts = (sc.facts || []).slice();
    if (!facts.length) return { guarded: false, why: 'no-facts（拒判）', detail: {} };
    const b = buildFactState(FV, facts);
    const lk = FV.lookup(b.state, { subject: facts[0].subject, predicate: facts[0].predicate });
    const cur = lk && lk.fact ? String(lk.fact.value) : '';
    const bad = String(sc.forbidValue || '');
    const tl = FV.timeline(b.state, { subject: facts[0].subject });
    const versions = (tl && tl.versions) || [];
    /* 三种成立方式：旧值退役 / 现状已替换 / 历史视图里由新版本覆盖该时点 */
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
  /** 来源过滤守卫：先把该楼的来源指纹挂上，再让它**对不上**（删楼 / 换页）。 */
  function guardProvenance(SP, sc) {
    const floor = Number(sc.deletedFloor);
    if (!Number.isFinite(floor) || floor < 0) return { guarded: false, why: 'no-deleted-floor（拒判）', detail: {} };
    const probe = { id: 'probe', text: 'probe-' + sc.case, floor: floor };
    const before = [];
    for (let i = 0; i < floor; i++) before.push({ index: i, mes: '第 ' + i + ' 楼旧正文', is_user: false, swipes: ['第 ' + i + ' 楼旧正文'], swipe_id: 0 });
    /* ★ 楼层索引必须落在**数组下标**上：floorOf 若拿不到 index/floor 会给 -1，
     *   指纹照旧能取（fpOf 不看楼层）⇒ capture 成功但 verify 永远找不到该楼，
     *   于是判据把「楼不在」读成「门没开」—— 首版就踩了这个假绿。 */
    const atFloor = { index: floor, mes: '第 ' + floor + ' 楼原文（留证时的显示页）', is_user: false,
      swipes: ['第 ' + floor + ' 楼原文（留证时的显示页）'], swipe_id: 0 };
    const chatBefore = before.concat([atFloor]);
    const cap = SP.capture(probe, atFloor);
    const captured = !!cap;
    /* ★ 让来源对不上的方式必须选**真会被剔**的那一种（本仓纪律：只剔 source_changed）。
     *   删楼（数组截短）⇒ verify 得 source_missing，而 filterForRecall **故意放行**它
     *     （删楼与楼层前移不可区分，前移时剔掉就是真丢 —— 见 summary-provenance 的已知代价）。
     *   所以探针用「同楼换页（swipe）」：楼还在、指纹变了 ⇒ source_changed ⇒ 真被剔。
     *   首版用删楼写法，判据把「机制按纪律放行」误读成「硬零被破」—— 测的不是同一件事。 */
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
  /**
   * 真机制守卫（只对 kind !== 'gap' 且带 gate 的样本跑）：
   *   · disclosure    —— 关系披露门（!X = X 在场时抑制）
   *   · fact-revoked  —— 事实换代 / 撤销（旧值必须退役）
   *   · provenance    —— 来源页过滤（source_changed 必须被剔）
   *   · scoring       —— 应被评分自然挡下（不加额外机制）
   * 返回 { guarded, why, detail }：guarded=false 即**硬零被破**（泄露）。
   */
  function guard(sc, modules, ctx) {
    const g = sc.gate;
    if (!g) return { guarded: true, why: 'no-gate', detail: {} };
    if (sc.kind === 'gap') return { guarded: true, why: 'known-gap（不进主指标）', detail: {} };
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
      /* 自证门真的会开：同条件在同一条上下文里必须被抑制（否则「没泄露」是假绿）。 */
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
  /** 跑全量 + 汇总指标（口径都在这里，套件只读指标）。 */
  function runAll(opts) {
    const o = opts || {};
    const root = (typeof globalThis !== 'undefined') ? globalThis : {};
    const M = Object.assign(DEF_MODULES(root), o.modules || {});
    const missing = [];
    if (!M.UR || typeof M.UR.graphToCandidates !== 'function') missing.push('unified-recall.graphToCandidates');
    if (!M.AS || typeof M.AS.scoreEntry !== 'function') missing.push('ai-select.scoreEntry');
    if (!M.IR || typeof M.IR.trimToBudget !== 'function') missing.push('injection-router.trimToBudget');
    /* 危险样本需要真机制；缺了它**拒判**（不静默跳过那些样本 —— 那是把硬零挪出战场的典型做法）。 */
    const gateNeeded = [];
    const list = Array.isArray(o.scenarios) && o.scenarios.length ? o.scenarios : (o.corpus && o.corpus.SCENARIOS) || [];
    for (const s of list) {
      if (s.gate === 'disclosure' && !(M.RD && M.RD.partition)) gateNeeded.push('relation-disclosure.partition');
      if (s.gate === 'fact-revoked' && !(M.FV && M.FV.lookup)) gateNeeded.push('fact-version.lookup');
      if (s.gate === 'provenance' && !(M.SP && M.SP.filterForRecall)) gateNeeded.push('summary-provenance.filterForRecall');
    }
    if (missing.length || gateNeeded.length) {
      /* 缺模块 ⇒ 拒判（不是「通过」）。写 0 分会让这一版看起来「全过」。 */
      return { ok: false, error: '真管线模块缺失：' + missing.concat(gateNeeded).join(' / '), samples: [], metrics: null };
    }
    if (!list.length) return { ok: false, error: '样本集为空（拒判）', samples: [], metrics: null };
    const samples = list.map((sc) => runSample(sc, M, o));
    return summarize(samples, o);
  }
  /** 汇总（与 runAll 分开：套件可拿自造样本直接过这一层）。 */
  function summarize(samples, opts) {
    const o = opts || {};
    /* 主指标只跑非 gap 样本（与 eval-corpus 同一口径）；gap 另立台账。 */
    const main = samples.filter((s) => !s.isGap);
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
        guardOkRate: pct('guardOk'),
        /* 危险样本与门实际开合（门没开过就必须显出来 —— 否则“没泄露”是假绿） */
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
        /* ★ 排序层的**可证伪性**读数：mustIn 每样本条数 + 是否全在各样本的排序首位。
         *   为什么要有它：本批样本的 mustIn 都是「单条最高分」，而选取层（保底/打分/补齐
         *   三层）互为冗余 ⇒ 把名额压到 1 条时 mustIn 照样在。这意味着**选取层对本批
         *   不可证伪**，必须写成读数而不是假装测过单条层失效。 */
        mustInPerSample: main.map((s) => (s.mustIn || []).length),
        mustInTopRate: main.length ? main.filter((s) => {
          const ids = s.scored.map((x) => x.id);
          return (s.mustIn || []).every((k) => ids.indexOf(k) < 1);
        }).length / main.length : 0,
        /* 低分噪声读数（只报，不做硬零）：期望 0 分 —— 非 0 不是错，但要看得见 */
        lowNoise: samples.filter((s) => s.low).map((s) => ({ case: s.case, id: s.low, score: (s.lowScores[0] || {}).score })),
        /* 已知缺口台账：逐条记「缺口在哪一步 + 现读数」，下版可逐条对比。 */
        knownGaps: gaps.map((s) => ({ case: s.case, cls: s.cls,
          stage1Ok: s.stage1Ok, stage2Ok: s.stage2Ok, missRank: s.missRank, why: s.note })),
        gapStage1: gaps.filter((s) => s.stage1Ok).length,
        gapStage2: gaps.filter((s) => s.stage2Ok).length,
      },
    };
  }
  /** 逐条判门禁（默认门槛 = 本版实测基线；收紧即变回归门禁）。 */
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
    return bad;
  }
  const api = { RUNNER_VERSION, pick, DEF_MODULES, guard, runSample, runAll, summarize, checkGates };
  if (typeof window !== 'undefined') window.LonShaStoryEvalRunner = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
