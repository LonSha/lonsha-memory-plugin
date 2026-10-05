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
    '[近期已了结事项', '[宏观世界线·纪元史记]', '[当前剧情时间]', '[类型化事实·长期]'];

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
    return { blocks: 0, kept: 0, dropped: 0, partial: 0, chars: 0, keptChars: 0, droppedChars: 0, partialChars: 0, tokens: 0, keptTokens: 0 };
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
   *   trace           裁剪过程回执（index.js `_injectionTraceDraft`）：可用则按下标判留存，
   *                   不可用退回 `injected.includes` 并在 identity 上如实自述（keptFrom/traceWhy）
   *   tokensOf        文本→token 估算函数
   *   now             时间戳（测试可注入求确定性）
   * }
   */
  function buildCostLedger(opts) {
    const o = opts || {};
    const tagged = tagBlocks(o.allBlocks, o.residentMarkers);
    const injected = String(o.injectedText == null ? '' : o.injectedText);
    const tokensOf = o.tokensOf;
    /* [v3.251.0] M-O3：**留存判据**从「文本反推」换成「裁剪回执」。
     *   修前本模块顶部自认 `identity.includesHeuristic: true` —— 「哪些块留在注入里」
     *   只用 `injected.includes(block)` 反推，有两个实测盲区（探针 /tmp/mo3/probe1.mjs）：
     *     · 同文重复：两条完全相同的触发块只留下一条时，`includes` 对两条都为真
     *       ⇒ 「裁掉一份」被读成「两份都在」；
     *     · 半段截断：recency 硬截断切在块内部时，半段块 `includes` 为假
     *       ⇒ 「切了半段」被读成「整块被丢」。
     *   回执（index.js `_injectionTraceDraft`）由裁剪发生的地点派生，按下标说话，
     *   这两个盲区在构造上不可能发生。
     *
     *   可用性两问（与 index.js `_injectionBlocksOf` 同规格、同门槛）：
     *     ① 规模自证：`blockCount` 必须等于本模块收到的块数（防「拿别批的回执判本批」）；
     *     ② 来源必须是路由模块（内联回落时没有块级清单，不可当精确判据用）。
     *   不满足则**退回 includes 并把这件事记在 identity 上**（`includesHeuristic` 随之为 true），
     *   绝不静默混用两种判据 —— 「这次是精确的还是猜的」必须读得出来。 */
    const _tr = (o.trace && typeof o.trace === 'object') ? o.trace : null;
    const _allLen = Array.isArray(o.allBlocks) ? o.allBlocks.length : 0;
    /* [v3.274.0] O4：精确判据有**两态**，不是一个 —— 修前只认「下标清单」，于是
     *   硬截断（recency 无保留项时的 slice）整组退回 includes：那正是「把可测写成不可测」
     *   （与预测侧同族）。回执在硬截断态给的是 blockSpans，按下标判不成立、按 span 判成立。 */
    const _trOk = !!(_tr && _tr.version && Number(_tr.blockCount) === _allLen && _tr.traceFrom === 'router');
    const idxOk = _trOk && Array.isArray(_tr.keptIdxInAll);
    const spanOk = _trOk && _tr.hardTruncated === true && Array.isArray(_tr.blockSpans);
    const traceOk = idxOk || spanOk;   // 「精确判据可用」的合并口径
    const keptIdxSet = idxOk ? new Set(_tr.keptIdxInAll) : null;
    const sliceAt = spanOk ? Number(_tr.sliceAt) : NaN;
    let _tagIdx = -1;

    const bySource = {};
    const touch = (t) => (bySource[t] || (bySource[t] = _blank()));
    let keptTotal = 0, droppedTotal = 0, partialTotal = 0, candidateChars = 0, candidateTokens = 0, emptyBlocks = 0;
    const droppedSamples = [];

    for (const { block, tag } of tagged) {
      /* 下标必须**先推进再跳过空块**：`keptIdxInAll` 指的是调用侧块数组里的位置，
       *   而空块**也占一个位置**。若写成「跳过空块后再 ++」，只要有空块在前面，
       *   后续所有块的下标就整体前移 —— 会出现一类极难察觉的错读数：
       *   账本按回执判保留，却把「保留/丢弃」贴到了别的块身上。 */
      _tagIdx++;
      if (tag === 'empty') { emptyBlocks++; continue; }
      const rec = touch(tag);
      const t = _tok(block, tokensOf);
      rec.blocks++; rec.chars += block.length; rec.tokens += t;
      candidateChars += block.length; candidateTokens += t;
      // 空注入文本时不做判据：'' 会被任何 includes 判 false，但空块判 true，
      // 两边都不靠谱。一律记「未注入」——账本宁可说「这一轮没注入」，也不给假的保留数。
      //   回执判据下同样受此门控：空注入 ⇒ 整批皆未注入（与既有一致，读数不变）。
      /* 三态互斥穷尽（与 index.js `_injectionBlocksOf` 同规格）：
       *   idxOk  回执带块级下标清单 ⇒ 按下标判（同文重复也分得开）
       *   spanOk 硬截断 ⇒ 按原始 full 的 span 判「整块在切点内 / 被切半 / 在切点外」
       *   否则   回执缺席/规模不符 ⇒ 退回 includes（已知盲区如实自述） */
      let kept = false, partial = false;
      if (idxOk) {
        kept = injected.length > 0 && keptIdxSet.has(_tagIdx);
      } else if (spanOk) {
        const sp = Array.isArray(_tr.blockSpans[_tagIdx]) ? _tr.blockSpans[_tagIdx] : null;
        if (sp) {
          kept = injected.length > 0 && sp[1] <= sliceAt;
          partial = injected.length > 0 && sp[0] < sliceAt && sp[1] > sliceAt;
        } else {
          kept = injected.length > 0 && injected.includes(block);   // span 定位不到 ⇒ 降级
        }
      } else {
        kept = injected.length > 0 && injected.includes(block);
      }
      if (partial) { rec.partial++; rec.partialChars += block.length; partialTotal++; }
      else if (kept) { rec.kept++; rec.keptChars += block.length; rec.keptTokens += t; keptTotal++; }
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
    /* [v3.251.0] M-O3 第 ⑦ 条：**「禁用项不计入实际注入成本」要可判，而不只是被声明**。
     *   修前这里只输出一个 `disabled` 名单（谁被关了），没有任何一格回答
     *   「它到底有没有偷偷贡献成本」—— 名单与事实之间没有对账。
     *   现在拿裁剪回执里的 `sourceBlocks`（拼装现场逐源记的块数）做**交叉核对**：
     *     · 自有块的源（有注入期自有渲染）：禁用 ⇒ 该源块数**必须为 0**；
     *       非零即说明闸门与拼装现场不一致 ⇒ 记进 `disabledLeak`（账本自曝，不静默）。
     *     · 融合源（召回侧生效）：构建期不可分，如实计入 `notSeparable`，
     *       不给一个编造的 0（那是把「测不了」写成「没有」）。
     *   两者都不写「成本为 0」这种结论 —— 只报**可判的那部分事实**。 */
    const srcBlocks = (o.trace && o.trace.sourceBlocks && typeof o.trace.sourceBlocks === 'object') ? o.trace.sourceBlocks : null;
    const fusedKeys = (o.trace && o.trace.fusedSourceBlocks && Array.isArray(o.trace.fusedSourceBlocks.keys))
      ? o.trace.fusedSourceBlocks.keys : [];
    const disabledLeak = [];
    const notSeparable = [];
    const unaccounted = [];
    const checked = [];
    for (const k of disabled) {
      if (srcBlocks && Object.prototype.hasOwnProperty.call(srcBlocks, k)) {
        // 自有块记账在场：这一源的「禁用 ⇒ 0 块」**可核对**（唯一可当场证伪的一类）
        checked.push(k);
        if (Number(srcBlocks[k]) > 0) disabledLeak.push({ source: k, blocks: Number(srcBlocks[k]) });
      } else if (fusedKeys.indexOf(k) >= 0) {
        notSeparable.push(k);   // 登记过：在召回侧生效，构建期不可分
      } else {
        // 既没有自有块记账、也不是登记的融合源 ⇒ **没有参与核对**。
        //   不写成「不可分」：那是把「没测」与「测不了」混成一态（本仓三态纪律）。
        unaccounted.push(k);
      }
    }

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
      /* [v3.251.0] M-O3 第 ⑦ 条：禁用名单与**事实**的对账结果（两态都可读，互不冒充）。 */
      disabledCost: {
        declared: disabled.length,
        // 禁用却仍有块 ⇒ 闸门失效（账本自曝；空数组表示「核对通过」）
        leak: disabledLeak,
        leakBlocks: disabledLeak.reduce((a, x) => a + x.blocks, 0),
        // 三态分开摆，互不冒充：
        //   checked       —— 有自有块记账，**核对过**（禁用 ⇒ 0 块已被证伪过一遍）
        //   notSeparable  —— 登记在案的融合源（召回侧生效，构建期不可分）
        //   unaccounted   —— 既无记账也非登记融合源 ⇒ **没参与核对**（不是「测不了」）
        checked,
        checkedCount: checked.length,
        notSeparable,
        notSeparableCount: notSeparable.length,
        unaccounted,
        unaccountedCount: unaccounted.length,
        verdict: (disabledLeak.length ? 'leak'
          : (unaccounted.length ? 'partially-checked' : (notSeparable.length ? 'fused-only' : 'checked'))),
        why: '自有块的源按拼装现场记账核对（禁用 ⇒ 必须 0 块）；融合源在召回侧生效、构建期不可分；两者都没命中的记「未参与核对」，不混进不可分',
      },
      /* [v3.251.0] M-O3 第 ③ 条：**五阶段漏斗**（与回执同源，不另算一份）。
       *   为什么账本要带上它：M-O3 要的是「一条链上的同一个事实」——
       *   回执里说「合并 40 条、最终留 12 块」，账本这里说「这 12 块是谁的、多少字符」。
       *   两处若各算一遍就会漂移；故此处只**转述回执**（缺失则整格 null）。 */
      stages: (o.trace && o.trace.stages) ? o.trace.stages : null,
      stageNotes: (o.trace && o.trace.stageNotes) ? o.trace.stageNotes : null,
      /* [v3.251.0] M-O3 第 ⑤/⑧ 条：token 口径与分层标识同样转述（缺失 ⇒ null）。 */
      tokenSource: (o.trace && o.trace.tokenSource) ? String(o.trace.tokenSource) : null,
      layer: (o.trace && o.trace.layer) ? o.trace.layer : null,
      recallSources: (o.recallSources && typeof o.recallSources === 'object') ? o.recallSources : {},
      identity: {
        candidateBlocks: tagged.length,
        emptyBlocks,
        otherBlocks: (bySource.other || {}).blocks || 0,
        keptBlocks: keptTotal,
        droppedBlocks: droppedTotal,
        /* [v3.274.0] O4：被切半单列。半段进了载荷，既不是「保留」也不是「整块被丢」——
         *   修前它与整块被丢同形（两者都只是 includes=false），账本因此多报被丢块数。 */
        partialBlocks: partialTotal,
        // 自洽：除空块外每块恰落进三态之一（保留 / 被丢 / 被切半）
        ok: (keptTotal + droppedTotal + partialTotal) === (tagged.length - emptyBlocks)
          && (Object.keys(bySource).reduce((a, k) => a + bySource[k].blocks, 0) + emptyBlocks) === tagged.length,
        /* [v3.251.0] M-O3：这一格的含义从「本模块一直在猜」变成
         *   「**本次**用的是猜还是回执」—— 它是判据来源的**如实自述**，不是固定标签。
         *   回执可用（规模自证 + 来源为路由模块）⇒ false（按下标判定，精确）；
         *   否则 true（`injected.includes` 反推，已知盲区仍在）。 */
        includesHeuristic: !traceOk,
        // 判据来源四态：按下标 / 按 span / 未裁剪整批 / 反推（与 index.js 的 keptFrom 同口径）
        keptFrom: idxOk ? 'trace' : (spanOk ? 'trace-span' : 'includes'),
        // 回执不可用的原因（可归因：规模对不上 / 来源不是路由 / 既无下标也无 span / 压根没给回执）
        traceWhy: traceOk ? null : (!_tr ? 'no-trace'
          : (Number(_tr.blockCount) !== _allLen ? 'scale-mismatch'
            : (_tr.traceFrom !== 'router' ? String(_tr.traceFrom || 'unknown') : 'no-kept-idx'))),
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
      /* [v3.251.0] M-O3：判据来源与禁用对账都上这一行 ——
       *   「这块读数是精确的还是猜的」「禁用的源有没有偷偷贡献」都是**用户该当场知道**的事，
       *   藏进账本深处等于没说（本仓对诊断行的口径：坏消息必须在场）。 */
      const _id = ledger.identity || {};
      if (_id.keptFrom === 'includes') parts.push('留存判据=文本反推');
      const _dc = ledger.disabledCost || {};
      if (_dc.verdict === 'leak') parts.push(`⚠️ 禁用却有块 ${_dc.leakBlocks}`);
      else if (_dc.verdict === 'partially-checked') parts.push(`禁用核对 ${_dc.checkedCount || 0}/${_dc.declared}（其余未参与核对）`);
      else if (_dc.verdict === 'fused-only' && _dc.declared) parts.push(`禁用核对 0/${_dc.declared}（均为召回侧源）`);
      if (ledger.truncated && ledger.truncated.blocks) parts.push(`截断 ${ledger.truncated.blocks} 块`);
      if (ledger.identity && ledger.identity.ok === false) parts.push('⚠️ 账目不自洽');
      return parts.join(' · ');
    } catch (e) { return '—（账本异常）'; }
  }

  const api = { buildCostLedger, tagBlocks, costLine, OPPOSITE_MARKERS, DEDUP_MARKERS, RESIDENT_FALLBACK, COST_VERSION };
  if (typeof window !== 'undefined') window.LonShaCostLedger = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();