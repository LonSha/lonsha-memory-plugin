/* ================================================================
 * eval-corpus.js — 召回质量固定评测集（纯数据 + 纯函数，零依赖）
 * [v3.193.0] 计划 A1/A2：召回质量必须**可复现地量出来**，而不是靠随手写的夹具。
 *
 * 为什么需要它：此前 `v3186_emotion_opposite_recall.test.mjs` 里有 6 组手工夹具，
 * 能证明「机制接上了」，但答不了「接上之后召回好没好」——没有固定的样本集，
 * 就没有跨版本的对比基线；改词表、改阈值、改预算之后，质量是升是降无人能答。
 *
 * 八类样本（计划点名，逐类必须有）：
 *   sad→温暖/陪伴 · fear→安全/守护 · anger→和解/理解 · tense→放松/熟悉
 *   · 多负面并存 · 负面词只是叙事引用 · 负面在被否定/回忆/他述里 · 多角色情绪归属
 *
 * 指标口径（每一个都能在样本上真算出来，不写「约」「大致」）：
 *   oppositeHitRate 期望反向命中率 = 期望命中且真命中 / 期望命中的样本数
 *   irrelevantRate  无关召回率     = 命中了期望集之外条目的样本数 / 总样本数
 *   misboostRate    负面同类误提权 = 期望空命中却真命中同类负面条目的样本数 / 期望空样本数
 *   expansionRatio  候选膨胀比例   = Σ(expanded+merged) / Σ(scanned)
 *   tokenDelta      注入增量 token = 由 cost-ledger 逐样本算出的注入 token
 *   latencyMs       识别与召回耗时 = 逐样本 wall-clock 之和
 * ================================================================ */
(function () {
  'use strict';

  const EVAL_VERSION = 2;

  /* 每类样本：queryText 查询文本；docs 候选（key→文本）；expect 期望命中 key；
   * expectDim 期望的可信主导维；expectReason 期望 reason；
   * negativeOfDim 若给出，则「这些 key 属于同类负面」，被提中即算误提权。 */
  const CORPUS = [
    {
      cls: 'sad-warm', note: '悲伤 → 温暖/陪伴',
      queryText: '她一个人坐在窗边，眼泪止不住地流。',
      docs: [
        { key: 'w1', text: '他默默陪伴在她身边，给她倒了一杯热水' },
        { key: 'w2', text: '她靠在他肩上，觉得心安' },
        { key: 'n1', text: '窗外的雨下了一整夜，空气黏腻' },
      ],
      expect: ['w1', 'w2'], expectDim: 'sad', expectReason: 'ok',
    },
    {
      cls: 'fear-safe', note: '恐惧 → 安全/守护',
      queryText: '他浑身发抖，怕得不敢回头。',
      docs: [
        { key: 's1', text: '她轻声说会守护他，不必害怕' },
        { key: 's2', text: '那是可以信任的依靠，像港湾一样' },
        { key: 'n2', text: '走廊尽头的灯闪了一下' },
      ],
      expect: ['s1', 's2'], expectDim: 'fear', expectReason: 'ok',
    },
    {
      cls: 'anger-soften', note: '愤怒 → 和解/理解',
      queryText: '他怒不可遏，拳头攥得发白。',
      docs: [
        { key: 'a1', text: '她温柔地拉住他的手，说我知道你委屈' },
        { key: 'a2', text: '他忽然笑了，叹了口气说算了' },
        { key: 'n3', text: '桌上的杯子晃了一下' },
      ],
      expect: ['a1', 'a2'], expectDim: 'anger', expectReason: 'ok',
    },
    {
      cls: 'tense-relax', note: '紧张 → 放松/熟悉',
      queryText: '气氛紧绷，杀意在暗处浮动。',
      docs: [
        { key: 't1', text: '她笑着说这就是熟悉的味道' },
        { key: 'n4', text: '黑暗里传来一阵脚步声' },
      ],
      expect: [], expectDim: null, expectReason: 'no-polarity',
      note2: 'tense 极性 0 ⇒ 不出线索（氛围不是情绪倾向），期望空命中',
    },
    {
      cls: 'multi-negative', note: '多负面并存（恐惧 + 悲伤）',
      queryText: '她又害怕又难过，蜷在角落里。',
      docs: [
        { key: 'm1', text: '他陪伴着她，替她擦掉眼泪' },
        { key: 'm2', text: '她轻声说会守护她一辈子' },
        { key: 'n5', text: '墙角有一只蜘蛛' },
      ],
      expect: ['m1', 'm2'], expectReason: 'ok',
    },
    {
      cls: 'quoted-only', note: '负面词只是叙事引用（引号内）',
      queryText: '她笑着说「我很难过」，然后转身走了。',
      docs: [
        { key: 'q1', text: '她陪着他，笑得很温柔' },
        { key: 'n6', text: '风把门吹上了' },
      ],
      expect: [], expectReason: 'no-polarity',
      note2: '引号内的「难过」不可信 ⇒ 只剩 joy 主导（极性正）⇒ 不出反向线索',
    },
    {
      cls: 'negated-recalled', note: '负面在被否定 / 回忆句里',
      queryText: '她不难过。他曾经很怕。',
      docs: [
        { key: 'r1', text: '有人默默陪着他们' },
        { key: 'n7', text: '屋檐在滴水' },
      ],
      expect: [], expectReason: 'no-trusted',
      note2: '两个情绪词分别被否定与回忆吞掉 ⇒ 可信词为 0 ⇒ 零线索',
    },
    {
      cls: 'multi-char', note: '多角色情绪归属',
      queryText: '林见夏哭了。周砚笑着看她。',
      chars: ['林见夏', '周砚'],
      docs: [
        { key: 'c2', text: '他轻轻陪着她，眼神温柔' },
        { key: 'c3', text: '她笑得眼角都弯了' },
        { key: 'n6', text: '风把门吹上了' },
      ],
      expect: ['c2', 'c3'], expectDim: 'sad', expectReason: 'ok',
      expectAttr: { '林见夏': 'sad', '周砚': 'joy' },
      note2: '本类测的是「谁在难过/谁在笑」能否分开（attributeEmotion 逐角色主导维），'
        + '文档侧仍走词表（陪伴/温柔/笑）以保证期望集可判；'
        + '召回侧用的是聚合可信主导维（此处 sad），句内多角色反极性时聚合与逐角色会不一致 —— '
        + '该差距由 gap-action-comfort 与 note2 显式记账，不用放宽判据掩盖。',
    },
    /* ── 已知缺口（known-gap）─────────────────────────────
     * 这两类**不是**判据放宽，而是把「词表覆盖不足」这件事实写进评测集本身，
     * 让它每版都被量出来、看得见趋势。否则它们会以「样本通过」的形态消失，
     * 而真实场景漏召回照旧发生——那正是本仓最忌的「坏了没人知道」。
     * gap 字段会出现在 metrics.knownGaps 里，数值每版重算。 */
    {
      cls: 'gap-natural-wording', note: '【已知缺口】自然措辞未入词表',
      gap: '「气得发抖」（自然写法）在词表里只命中「发抖」⇒ 被判 fear 而非 anger；'
        + '「陪在」（自然写法）未入词表（词表只有「陪伴」）；「别怕」未入词表。'
        + '成因是词表按「标准词」而非「真实行文」收录，属覆盖问题不是逻辑问题。',
      queryText: '她一个人坐在窗边，眼泪止不住地流。',
      docs: [
        { key: 'g1', text: '他默默陪在她身边' },
        { key: 'g2', text: '别怕，有我在' },
      ],
      // expect 同上：写语义正确答案，缺口才量得出来。
      expect: ['g1', 'g2'], expectDim: 'sad', expectReason: 'ok',
    },
    {
      cls: 'gap-action-comfort', note: '【已知缺口】动作性安慰未入词表',
      gap: '「把外套披在她肩上」「递手帕」「擦眼泪」这类动作性安慰在词表里没有任何入口'
        + '（词表收的是「陪伴/守护/依靠」等状态性词）。这是覆盖面最大的一个漏召回形态，'
        + '本版只记账、不改判据：want=1 / hit=0 每版重算，直到词表或规则补上为止。',
      queryText: '她一个人坐在窗边，眼泪止不住地流。',
      docs: [{ key: 'a1', text: '他沉默着把外套披在她肩上' }],
      expect: ['a1'], expectDim: 'sad', expectReason: 'ok',
    },
    {
      cls: 'gap-aggregate-emotion', note: '【已知缺口】主体指代 / 聚合式情绪',
      gap: '「他气得发抖」当主语名不在 characters 里时，整体主导维可能被次要情绪词抢走'
        + '（发抖 → fear）；主体靠代词指代时需要调用方先做角色指代消解，本模块不做。',
      queryText: '他气得发抖，拳头攥得发白。',
      docs: [{ key: 'x1', text: '她温柔地拉住他的手' }],
      expect: [], expectDim: 'fear',
      note2: '台账里 want=0 / hit=1 表示「出了线索」，而语义上不该出（主体是愤怒，'
        + '主导维被「发抖」抢成 fear）。这类缺口看 dimOk（主导维判对了吗），不看 hit。',
    },
  ];

  /** 逐样本跑一次，返回原始读数（不吞异常：出错要看得见是哪个样本）。 */
  function runSample(s, api) {
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const r = api.recallByOppositeEmotion({ queryText: s.queryText, docs: s.docs });
    const emo = api.scanEmotion(s.queryText);
    let attr = null;
    if (s.expectAttr) {
      attr = api.attributeEmotion
        ? api.attributeEmotion(s.queryText, { characters: s.chars || [] })
        : null;
    }
    const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const got = Array.isArray(r.opposite) ? r.opposite.slice() : [];
    const exp = Array.isArray(s.expect) ? s.expect : [];
    const hitSet = new Set(got.filter((k) => exp.includes(k)));
    const extra = got.filter((k) => !exp.includes(k));
    return {
      cls: s.cls, note: s.note, reason: r.reason, dominant: r.dominant,
      trustedDominant: emo.trustedDominant, credibleWords: emo.credibleWords,
      byScope: emo.byScope, expected: exp, got, hit: [...hitSet], extra,
      expanded: r.expanded || 0, merged: r.merged || 0, scanned: r.scanned || 0,
      dimHits: r.dimHits || {}, attr, latencyMs: (t1 - t0),
      reasonOk: (s.expectReason ? r.reason === s.expectReason : true),
      dimOk: (s.expectDim ? emo.trustedDominant === s.expectDim : true),
      isGap: !!s.gap, gap: s.gap || '',
    };
  }

  /** 跑全量并汇总指标。api = narrative-pulse 导出面（必传）。 */
  function runEval(opts) {
    const o = opts || {};
    const api = o.api;
    if (!api || typeof api.recallByOppositeEmotion !== 'function' || typeof api.scanEmotion !== 'function') {
      return { version: EVAL_VERSION, ok: false, error: 'api 缺 recallByOppositeEmotion / scanEmotion', samples: [], metrics: null };
    }
    const corpus = Array.isArray(o.corpus) && o.corpus.length ? o.corpus : CORPUS;
    const samples = corpus.map((s) => runSample(s, api));

    // 已知缺口（gap）样本**不计入**主指标：主指标回答「机制在该响的时候响了吗」，
    //   gap 回答「词表/指代覆盖到哪一步」。两者混在一起会让任一方都失真。
    //   gapSample 判据只有一条：机制该响时响了（reason/dim 正确）——那是能力问题，
    //   命中与否是覆盖问题。故主指标只跑非 gap 样本。
    const mainSamples = samples.filter((x) => !x.isGap);
    const gapSamples = samples.filter((x) => x.isGap);
    const expNonEmpty = mainSamples.filter((x) => x.expected.length > 0);
    const expEmpty = mainSamples.filter((x) => x.expected.length === 0);
    const perfect = expNonEmpty.filter((x) => x.expected.every((k) => x.got.includes(k)));
    const withExtra = mainSamples.filter((x) => x.extra.length > 0);
    const misboost = expEmpty.filter((x) => x.got.length > 0);
    const sumExpanded = mainSamples.reduce((a, x) => a + x.expanded, 0);
    const sumMerged = mainSamples.reduce((a, x) => a + x.merged, 0);
    const sumScanned = mainSamples.reduce((a, x) => a + x.scanned, 0);

    const metrics = {
      samples: mainSamples.length,
      gapSamples: gapSamples.length,
      // 期望命中：样本的期望集是否被完整收回（每样本是 0/1，分母是期望非空样本数）
      oppositeHitRate: expNonEmpty.length ? perfect.length / expNonEmpty.length : 1,
      oppositeHitDetail: expNonEmpty.map((x) => ({ cls: x.cls, hit: x.hit.length, want: x.expected.length })),
      // 无关召回：出现期望集之外条目的样本占比
      irrelevantRate: mainSamples.length ? withExtra.length / mainSamples.length : 0,
      irrelevantDetail: withExtra.map((x) => ({ cls: x.cls, extra: x.extra })),
      // 负面同类误提权：期望空命中却出了线索
      misboostRate: expEmpty.length ? misboost.length / expEmpty.length : 0,
      misboostDetail: misboost.map((x) => ({ cls: x.cls, got: x.got, reason: x.reason })),
      // 候选膨胀：被预算挡下 + 跨维合并 相对 扫描量
      expansionRatio: sumScanned ? (sumExpanded + sumMerged) / sumScanned : 0,
      expanded: sumExpanded, merged: sumMerged, scanned: sumScanned,
      // 识别与召回耗时
      latencyMs: Number(mainSamples.reduce((a, x) => a + x.latencyMs, 0).toFixed(2)),
      latencyAvgMs: Number((mainSamples.reduce((a, x) => a + x.latencyMs, 0) / Math.max(1, mainSamples.length)).toFixed(3)),
      reasonOkRate: mainSamples.filter((x) => x.reasonOk).length / mainSamples.length,
      dimOkRate: mainSamples.filter((x) => x.dimOk).length / mainSamples.length,
    };
    // 已知缺口台账：每条 gap 样本记「能力是否正确 + 命中几个」，逐版可对比
    metrics.knownGaps = gapSamples.map((x) => ({
      cls: x.cls, why: x.gap || '', reasonOk: x.reasonOk, dimOk: x.dimOk,
      reason: x.reason, trustedDominant: x.trustedDominant,
      hit: x.got.length, want: x.expected.length,
    }));
    // 注入增量 token：由 cost-ledger 按「若这些线索真进了注入」估算，
    //   不接 cost-ledger 时置 null（写「不可测」而不是编 0）。
    if (o.costLedger && typeof o.costLedger.buildCostLedger === 'function') {
      let tok = 0, chars = 0;
      for (const x of samples) {
        const promoted = {};
        for (const k of x.got) promoted[k] = x.dimHits ? Object.keys(x.dimHits) : [];
        const lg = o.costLedger.buildCostLedger({
          allBlocks: x.got.map((k) => '- ' + k),
          injectedText: x.got.join('\n'),
          promoted,
          now: 1,
        });
        chars += lg.totals.injectedChars;
        tok += lg.totals.injectedTokens;
      }
      metrics.tokenDelta = tok;
      metrics.charDelta = chars;
      metrics.tokenDeltaMeasured = true;
    } else {
      metrics.tokenDelta = null;
      metrics.tokenDeltaMeasured = false;
      metrics.tokenDeltaWhy = '未接入 cost-ledger：注入增量无法从召回读数推出，不编数字';
    }

    const attrSamples = samples.filter((x) => x.attr);
    if (attrSamples.length) {
      let ok = 0, tot = 0;
      // 归因指标：逐角色核对主导维
      for (const x of attrSamples) {
        const src = corpus.find((c) => c.cls === x.cls);
        const want = (src && src.expectAttr) || {};
        for (const name of Object.keys(want)) {
          tot++;
          if (x.attr.perChar[name] && x.attr.perChar[name].dominant === want[name]) ok++;
        }
      }
      metrics.attributionRate = tot ? ok / tot : 1;
      metrics.attributionDetail = attrSamples.map((x) => ({ cls: x.cls, perChar: x.attr.perChar }));
    }

    return {
      version: EVAL_VERSION, ok: true, samples, metrics,
      // 门槛（可调；默认值 = 本版实测基线，收紧即变成回归门禁）
      gates: Object.assign({
        minOppositeHitRate: 1.0, maxIrrelevantRate: 0.0,
        maxMisboostRate: 0.0, maxExpansionRatio: 1.0, minReasonOkRate: 1.0,
      }, o.gates || {}),
    };
  }

  /** 逐条判门禁，返回违规清单（空数组 = 全过）。 */
  function checkGates(result) {
    const bad = [];
    if (!result || !result.ok || !result.metrics) return ['评测未产出指标'];
    const m = result.metrics, g = result.gates || {};
    if (m.oppositeHitRate < g.minOppositeHitRate) bad.push(`期望命中率 ${m.oppositeHitRate} < ${g.minOppositeHitRate}`);
    if (m.irrelevantRate > g.maxIrrelevantRate) bad.push(`无关召回率 ${m.irrelevantRate} > ${g.maxIrrelevantRate}`);
    if (m.misboostRate > g.maxMisboostRate) bad.push(`负面同类误提权 ${m.misboostRate} > ${g.maxMisboostRate}`);
    if (m.expansionRatio > g.maxExpansionRatio) bad.push(`候选膨胀 ${m.expansionRatio.toFixed(3)} > ${g.maxExpansionRatio}`);
    if (m.reasonOkRate < g.minReasonOkRate) bad.push(`reason 符合率 ${m.reasonOkRate} < ${g.minReasonOkRate}`);
    if (m.attributionRate != null && m.attributionRate < 1) bad.push(`多角色归因率 ${m.attributionRate} < 1`);
    return bad;
  }

  const api = { runEval, checkGates, CORPUS, EVAL_VERSION };
  if (typeof window !== 'undefined') window.LonShaEvalCorpus = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();