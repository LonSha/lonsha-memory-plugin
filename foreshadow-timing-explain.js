/* L21-X2: foreshadow timing explain — 四因子各自可读、不相加成一个分数 [v3.465.4]
 * 底座：latent-plot-foreshadowing-engine.js（LonShaLatentForeshadowing）。
 * 回答「为什么现在提 / 为什么不提」：时间距离 / 情绪张力 / 话题邻近度 / 在场人物。
 * 四因子各自独立给出 verdict 与可读理由；最终裁决用「门 + 否决权 + 支持票」的显式规则，
 * 绝不把四因子加权合成一个数字（v3.439.0 已验证：压成一个数会让"为什么"永远看不见）。
 * 挂载：LonShaForeshadowTimingExplain / CJS / AMD */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) define([], factory);
  else if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LonShaForeshadowTimingExplain = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '3.465.4';
  const FACTORS = Object.freeze(['timeDistance', 'emotionalTension', 'topicProximity', 'presentCharacters']);

  const DAY_MS = 86400000;
  const textOf = x => String(x == null ? '' : x).trim();

  /* 因子一：时间距离 —— 约定/埋下距今多久（按楼层距离或真实时间，谁有算谁） */
  function factorTimeDistance(suspense, ctx) {
    const now = Number(ctx.now) || Date.now();
    const floors = Number(ctx.currentFloor) - Number(suspense.createdAtFloor || suspense.floor || 0);
    const days = suspense.createdAt ? (now - Number(suspense.createdAt)) / DAY_MS : null;
    const enough = (Number.isFinite(floors) && floors >= 3) || (days != null && days >= 1);
    let detail;
    if (days != null && days >= 1) detail = '已经过了约 ' + Math.round(days) + ' 天，时间够了';
    else if (Number.isFinite(floors) && floors >= 3) detail = '已经隔了约 ' + floors + ' 楼剧情，时间够了';
    else detail = '刚发生不久（' + (Number.isFinite(floors) ? floors + ' 楼' : '同一天') + '），还不到旧事重提的时候';
    return { key: 'timeDistance', label: '时间距离', ok: enough, detail, weight: undefined };
  }

  /* 因子二：情绪张力 —— 张力太高（正在吵架/应激）时不提，有一票否决权 */
  function factorEmotionalTension(suspense, ctx) {
    const tension = Number(ctx.tension);
    const has = Number.isFinite(tension);
    const tooHigh = has && tension >= 0.7;
    return {
      key: 'emotionalTension', label: '情绪张力', ok: !tooHigh,
      veto: tooHigh,
      detail: !has ? '当前氛围张力未知，不作为否决依据'
        : tooHigh ? '当前张力 ' + tension.toFixed(2) + '（≥0.7），正在气头或应激上，此时提起只会火上浇油'
        : '当前张力 ' + tension.toFixed(2) + '，氛围还算平稳'
    };
  }

  /* 因子三：话题邻近度 —— 当前话题与悬念的内容是否有语义交集 */
  function factorTopicProximity(suspense, ctx) {
    const q = textOf(ctx.queryText), t = textOf(suspense.topic) + textOf(suspense.detail);
    let hit = '';
    if (q && t) {
      for (let i = 0; i < q.length - 1 && !hit; i++) {
        const g = q.slice(i, i + 2);
        if (g.includes('的') || g.includes('了') || g.includes('吗')) continue;
        if (t.includes(g)) hit = g;
      }
    }
    return {
      key: 'topicProximity', label: '话题邻近度', ok: !!hit,
      detail: hit ? '当前话题聊到「' + hit + '」，和「' + textOf(suspense.topic) + '」正好相关'
        : '当前话题与「' + textOf(suspense.topic) + '」暂时不沾边'
    };
  }

  /* 因子四：在场人物 —— 悬念相关的人在不在场 */
  function factorPresentCharacters(suspense, ctx) {
    const present = Array.isArray(ctx.presentCharacters) ? ctx.presentCharacters.map(textOf) : [];
    const related = Array.isArray(suspense.relatedCharacters) ? suspense.relatedCharacters.map(textOf) : [];
    if (!related.length) {
      return { key: 'presentCharacters', label: '在场人物', ok: present.length > 0,
        detail: related.length === 0 && present.length ? '悬念未登记特定相关人，任何在场者都可自然提起' : '当前没有可判断的在场人物' };
    }
    const hit = related.find(p => present.includes(p));
    return {
      key: 'presentCharacters', label: '在场人物', ok: !!hit,
      detail: hit ? '相关的人（' + hit + '）正在场' : '相关的人（' + related.join('、') + '）不在场，提起也没人接得上'
    };
  }

  /**
   * 四因子解释主函数。
   * @returns {{suspenseId, topic, shouldMention, rule, factors:[4], headline}}
   *   rule 是显式规则文本（不是分数）：张力否决 + 时间门 + （邻近 或 在场）支持。
   */
  function explainTiming(suspense, ctx) {
    const factors = [
      factorTimeDistance(suspense, ctx || {}),
      factorEmotionalTension(suspense, ctx || {}),
      factorTopicProximity(suspense, ctx || {}),
      factorPresentCharacters(suspense, ctx || {})
    ];
    const byKey = k => factors.find(f => f.key === k);
    const tension = byKey('emotionalTension');
    const time = byKey('timeDistance');
    const near = byKey('topicProximity');
    const present = byKey('presentCharacters');
    // 显式裁决规则（每一步都可指着说为什么，不是一个加权和）：
    const shouldMention = time.ok && !tension.veto && (near.ok || present.ok);
    const rule = '裁决规则：时间距离须够 + 情绪张力不否决 + （话题邻近 或 相关人在场）至少满足其一。四因子各自独立可读，不合成分数。';
    const headline = shouldMention
      ? '为什么现在提：' + [time.ok && time.detail, (near.ok && near.detail) || (present.ok && present.detail)].filter(Boolean).join('；')
      : '为什么不提：' + [!time.ok && time.detail, tension.veto && tension.detail, !near.ok && !present.ok && (near.detail + '；' + present.detail)].filter(Boolean).join('；');
    return {
      suspenseId: suspense.id || null,
      topic: textOf(suspense.topic),
      shouldMention, rule, factors, headline
    };
  }

  /* 批量：对每条未决伏笔给出解释（不改引擎状态） */
  function explainAll(openSuspenses, ctx) {
    return (Array.isArray(openSuspenses) ? openSuspenses : []).map(s => explainTiming(s, ctx || {}));
  }

  /* 面板可读渲染：每行可展开的四因子（无技术黑话） */
  function formatFactors(explain) {
    if (!explain || !Array.isArray(explain.factors)) return '';
    return explain.factors.map(f => '· ' + f.label + '：' + f.detail).join('\n');
  }

  return { VERSION, FACTORS, explainTiming, explainAll, formatFactors,
    _factors: { factorTimeDistance, factorEmotionalTension, factorTopicProximity, factorPresentCharacters } };
}));