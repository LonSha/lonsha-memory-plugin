/* ================================================================
 * cost-ledger.js — prompt 成本账本（纯函数，零依赖）
 * [v3.193.0] 计划 A5：注入成本必须**按来源归因**，七类必须彼此可分。
 *
 * 为什么需要它：`_lastBudgetStats`（v3.144）已能报「裁剪前 / 实际 / 丢弃多少字符」，
 * 但它只回答「总共丢了多少」，回答不了「丢的是谁的」。常驻与触发的成本量级差一个
 * 数量级，混在总数里没法做取舍。更要命的是「反向召回新增了几个字」——情绪反向提权
 * 是本仓唯一靠词表跨过零字面交集的通道，它给 prompt 加了多少成本，此前**没有任何读数**。
 *
 * ── 归类口径（重要，决定了这个账本是否可信）────────────────────────
 * 注入块流是「标题块 + 若干 `- 明细` 行」的形状，所以**不能逐块独立分类**：
 * 明细行 `- 3楼 他向她道了歉` 自身不含任何来源信息，逐块判会整片落进 other。
 * 本模块按**分节继承**扫描：遇到标题开新节，`- ` 开头的明细行继承当前节标签。
 *   ① 命中 RESIDENT_MARKERS  ⇒ resident（常驻）
 *   ② 命中反向线索标题       ⇒ opposite（与 direct 分开，才回答得了「0.006 值不值」）
 *   ③ 命中去重标记           ⇒ dedup
 *   ④ 其余标题块 / 独立块    ⇒ direct（触发区）
 * `other` 留给「既非标题也非明细且判不出来」的残余——它**应当恒为 0**，
 * 一旦非零说明某处新增了无法归类的块形状，账本会自己报出来（identity.otherBlocks）。
 *
 * 常驻口径的单一真源是 index.js 的 `RESIDENT_MARKERS`，由调用方传入；
 * 本文件不另立一套常驻定义，避免两处漂移（这属于「同一事实两个真源」的老毛病）。
 * 故 `[用户锁定剧情事实]` 这类「其实每轮都注入、但没进 RESIDENT_MARKERS」的块
 * 会如实计为 direct —— 账本复述既有口径，不擅自改写别人的定义。
 *
 * ── 不可测的量就写「不可测」 ────────────────────────────────
 * 「去重节省」需要「若不去重会注入多少」这个反事实，现有数据里**没有**：
 * 被标记吞掉的是原始事实的文本，系统只留了「已覆盖」标记，原文长度未记录。
 * 所以 dedup.savedChars 为 null + measurable:false，而不是编一个 0 或按标记块倒推
 * （标记块占的预算是**成本**，不是节省，倒推会得出负节省或凭空数字）。
 * ================================================================ */
(function () {
  'use strict';

  const COST_VERSION = 1;

  /** 反向线索标题（index.js 渲染时使用的字面量）。 */
  const OPPOSITE_MARKERS = ['〔反向情绪线索', '[反向情绪线索]'];
  /** 去重明细行的行首标记（index.js: `- [DEDUP已覆盖·...]`，在明细行里，不是节标题）。 */
  const DEDUP_MARKERS = ['[DEDUP已覆盖'];
  /** 承载去重明细的节标题。 */
  const DEDUP_SECTIONS = ['[已覆盖记忆·防复读]'];
  /** 常驻标记表回落值（与 index.js RESIDENT_MARKERS 保持同字面量）。 */
  const RESIDENT_FALLBACK = ['[前情摘要]', '[角色状态]', '[角色关系]', '[关键事件·影响当前]',
    '[剧情时间线]', '[卷]', '[早前剧情概括]', '[角色长期关系网]', '[主角当前客观状态与生活习惯]',
    '[近期已了结事项', '[宏观世界线·纪元史记]', '[当前剧情时间]'];

  const _head = (b) => String(b == null ? '' : b).replace(/^\s+/, '').slice(0, 40);
  const _isDetail = (b) => /^\s*-\s/.test(String(b == null ? '' : b));

  /**
   * 扫描块流 → 逐块打标签（分节继承）。
   * @returns [{ block, tag, section }]，section 为该块所属节标题（明细行记其节首）
   */
  function tagBlocks(blocks, residentMarkers) {
    const res = (Array.isArray(residentMarkers) && residentMarkers.length)
      ? residentMarkers : RESIDENT_FALLBACK;
    const out = [];
    let cur = { tag: 'other', section: '' };
    for (const raw of (Array.isArray(blocks) ? blocks : [])) {
      const s = String(raw == null ? '' : raw);
      if (!s.length) { out.push({ block: s, tag: 'empty', section: '' }); continue; }
      const h = _head(s);
      // 明细行：继承当前节（这是本模块与「逐块独立分类」的关键差别）
      if (_isDetail(s)) {
        // 明细行继承所在节；但去重明细自带行首标记，须先单独认出来——
        // 否则它们会跟着节标签落进 direct，去重账目恒为 0（等于没记）。
        const body = h.replace(/^-\s*/, '');
        let tag = cur.tag === 'empty' ? 'other' : cur.tag;
        for (const m of DEDUP_MARKERS) if (body.startsWith(m)) { tag = 'dedup'; break; }
        out.push({ block: s, tag, section: cur.section });
        continue;
      }
      // 标题/独立块：开新节
      let tag = 'direct', matched = h;
      for (const m of res) if (h.startsWith(m)) { tag = 'resident'; matched = m; break; }
      if (tag === 'direct') for (const m of OPPOSITE_MARKERS) if (h.startsWith(m)) { tag = 'opposite'; matched = m; break; }
      if (tag === 'direct') for (const m of DEDUP_SECTIONS) if (h.startsWith(m)) { tag = 'dedup'; matched = m; break; }
      cur = { tag, section: matched };
      out.push({ block: s, tag, section: matched });
    }
    return out;
  }

  function _tok(s, tokensOf) {
    const t = String(s == null ? '' : s);
    if (!t.length) return 0;
    if (typeof tokensOf === 'function') {
      try {
        const n = Number(tokensOf(t));
        if (Number.isFinite(n) && n >= 0) return n;
      } catch (e) { /* 回落估算 */ }
    }
    return Math.ceil(t.length * 9 / 10);   // 与 estimateTextTokens 的 CJK 口径一致（≈1.11 字符/token）
  }

  function _blank() {
    return { blocks: 0, kept: 0, dropped: 0, chars: 0, keptChars: 0, droppedChars: 0, tokens: 0, keptTokens: 0 };
  }

  /**
   * 生成成本账本（纯函数，可直接 JSON 序列化）。
   * @param opts {
   *   allBlocks       候选块全量（与 buildInjection 的 _allB 同源）
   *   injectedText    最终注入文本（裁剪后，即 AI 真见的那串）
   *   preTrimChars    裁剪前字符数（_preTrimLen）
   *   budget / strategy
   *   residentMarkers 常驻标记表（单一真源：index.js 的 RESIDENT_MARKERS）
   *   emotionOpposite { reason, hits, expanded, merged, dimHits{}, credibleWords }
   *   promoted        { key: [dim,...] } 反向提权名单（回答「为什么这条被提」）
   *   recallSources   { sourceName: count }
   *   enabledSources  { sourceName: bool }（false 者进 disabled）
   *   tokensOf        文本→token 估算函数
   *   now             时间戳（测试可注入求确定性）
   * }
   */
  function buildCostLedger(opts) {
    const o = opts || {};
    const tagged = tagBlocks(o.allBlocks, o.residentMarkers);
    const injected = String(o.injectedText == null ? '' : o.injectedText);
    const tokensOf = o.tokensOf;

    const bySource = {};
    const touch = (t) => (bySource[t] || (bySource[t] = _blank()));
    let keptTotal = 0, droppedTotal = 0, candidateChars = 0, candidateTokens = 0, emptyBlocks = 0;
    const droppedSamples = [];

    for (const { block, tag } of tagged) {
      if (tag === 'empty') { emptyBlocks++; continue; }
      const rec = touch(tag);
      const t = _tok(block, tokensOf);
      rec.blocks++; rec.chars += block.length; rec.tokens += t;
      candidateChars += block.length; candidateTokens += t;
      // 空注入文本时不做 includes 判定：'' 会被任何 includes 判 false，但空块判 true，
      // 两边都不靠谱。一律记「未注入」——账本宁可说「这一轮没注入」，也不给假的保留数。
      const kept = injected.length > 0 && injected.includes(block);
      if (kept) { rec.kept++; rec.keptChars += block.length; rec.keptTokens += t; keptTotal++; }
      else {
        rec.dropped++; rec.droppedChars += block.length; droppedTotal++;
        if (droppedSamples.length < 3) droppedSamples.push(block.slice(0, 36));
      }
    }

    // 反向召回：分离「被提权」与「真进了注入」。
    // [v3.200.0] 探针实证：promoted 的 key 是摘要图键（sum_<floor>），注入文本只渲染
    //   摘要正文（`- ${text}`），不含图键。旧实现用 injected.includes(key) 匹配，
    //   对摘要条目恒为假 —— 提权 2 条、1 条真进注入，账本报 0/2、rankOnlyGap=2。
    //   修法：调用侧带上「注入里真会出现的片段」（snippet），账本按片段匹配；
    //   一个片段都没有时记 measurable=false，不再把 0 写成「一条都没进」。
    const eo = o.emotionOpposite || {};
    const promoted = (o.promoted && typeof o.promoted === 'object') ? o.promoted : {};
    const promotedKeys = Object.keys(promoted);
    const snippets = (o.promotedSnippets && typeof o.promotedSnippets === 'object') ? o.promotedSnippets : {};
    let injectedEstimate = 0, snippetCount = 0, matchedBySnippet = false;
    if (injected.length > 0) {
      for (const k of promotedKeys) {
        const snip = String(snippets[k] || '').trim();
        if (snip && snip.length >= 4) { snippetCount++; if (injected.includes(snip)) { injectedEstimate++; matchedBySnippet = true; } }
        else if (k && injected.includes(k)) injectedEstimate++;
      }
    }
    const measurable = snippetCount > 0 || injectedEstimate > 0;
    const oppTagged = tagged.filter((x) => x.tag === 'opposite');
    const opposite = {
      reason: eo.reason || null,
      // 块级读数：本机制**不渲染独立块**（它只给已在候选里的摘要加 0.006 改排序），
      // 故 taggedBlocks 正常恒为 0。硬把这个 0 说成「成本为零」是错的：
      // 它改的是排序，真实代价是 rankOnlyGap——挤掉了原本会进注入的别的块。
      taggedBlocks: oppTagged.length,
      taggedChars: oppTagged.reduce((a, x) => a + x.block.length, 0),
      addsBlocks: false,
      costForm: 'rank-only',
      promotedCount: promotedKeys.length,
      hits: Number(eo.hits) || 0,
      // [v3.200.0] 片段匹配：measurable=false 时 injectedEstimate/rankOnlyGap 为 null（不可测），
      //   不再把「匹配不到」写成「一条都没进注入」。
      measurable: measurable,
      injectedEstimate: measurable ? injectedEstimate : null,
      rankOnlyGap: measurable ? Math.max(0, promotedKeys.length - injectedEstimate) : null,
      expanded: Number(eo.expanded) || 0,
      merged: Number(eo.merged) || 0,
      credibleWords: Number(eo.credibleWords) || 0,
      dimHits: (eo.dimHits && typeof eo.dimHits === 'object') ? eo.dimHits : {},
      estimated: true,
    };

    const enabled = (o.enabledSources && typeof o.enabledSources === 'object') ? o.enabledSources : {};
    const disabled = Object.keys(enabled).filter((k) => enabled[k] === false);

    const preTrim = Number(o.preTrimChars) || 0;
    const totalChars = injected.length;
    const dRec = bySource.dedup;
    const ledger = {
      version: COST_VERSION,
      ts: Number.isFinite(o.now) ? o.now : Date.now(),
      budget: Number(o.budget) || 0,
      strategy: o.strategy || '',
      totals: {
        injectedChars: totalChars,
        injectedTokens: _tok(injected, tokensOf),
        candidateChars,
        candidateTokens,
        preTrimChars: preTrim,
        droppedChars: Math.max(0, preTrim - totalChars),
      },
      bySource,
      opposite,
      dedup: {
        notes: dRec ? dRec.blocks : 0,
        markerChars: dRec ? dRec.chars : 0,
        markerTokens: dRec ? dRec.tokens : 0,
        // 反事实不可得：被吞掉的原始事实文本未留长度 ⇒ 节省量不可测。
        savedChars: null, savedTokens: null, measurable: false,
        why: '被覆盖的原始事实只留「已覆盖」标记，原文长度未记录；标记块占的预算是成本而非节省',
      },
      truncated: { blocks: droppedTotal, chars: Object.keys(bySource).reduce((a, k) => a + bySource[k].droppedChars, 0), samples: droppedSamples },
      disabled,
      recallSources: (o.recallSources && typeof o.recallSources === 'object') ? o.recallSources : {},
      identity: {
        candidateBlocks: tagged.length,
        emptyBlocks,
        otherBlocks: (bySource.other || {}).blocks || 0,
        keptBlocks: keptTotal,
        droppedBlocks: droppedTotal,
        // 自洽：除空块外每块要么保留要么丢弃；且除空块外每块都落进了某个标签
        ok: (keptTotal + droppedTotal) === (tagged.length - emptyBlocks)
          && (Object.keys(bySource).reduce((a, k) => a + bySource[k].blocks, 0) + emptyBlocks) === tagged.length,
        includesHeuristic: true,   // 「是否注入」用 includes 判定（与 v3.144 同口径），非精确
      },
    };
    return ledger;
  }

  /** 一行摘要（诊断面用）。纯字符串拼装，不抛。 */
  function costLine(ledger) {
    try {
      if (!ledger || !ledger.totals) return '—';
      const b = ledger.bySource || {};
      const g = (k) => (b[k] ? b[k].keptChars : 0);
      const o = ledger.opposite || {};
      const parts = [
        `常驻 ${g('resident')}`,
        `触发 ${g('direct')}`,
        `反向 ${o.measurable === false ? '不可测' : ((o.injectedEstimate || 0) + '/' + (o.promotedCount || 0) + ' 条')}`,
        `合计 ${ledger.totals.injectedChars} 字符`,
      ];
      if (g('other')) parts.push(`未归类 ${g('other')}`);
      if (ledger.disabled && ledger.disabled.length) parts.push(`禁用 ${ledger.disabled.length} 源`);
      if (ledger.truncated && ledger.truncated.blocks) parts.push(`截断 ${ledger.truncated.blocks} 块`);
      if (ledger.identity && ledger.identity.ok === false) parts.push('⚠️ 账目不自洽');
      return parts.join(' · ');
    } catch (e) { return '—（账本异常）'; }
  }

  const api = { buildCostLedger, tagBlocks, costLine, OPPOSITE_MARKERS, DEDUP_MARKERS, RESIDENT_FALLBACK, COST_VERSION };
  if (typeof window !== 'undefined') window.LonShaCostLedger = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();