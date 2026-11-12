/* L21-X5: rumor trace-back — 谣言「可回溯原始证据」链 [v3.465.7]
 * 底座：rumor-mutation-entropy-engine.js（LonShaRumorMutation）。
 * 引擎会产出演化链（trace DAG）但没有读面回答「现在这句传言离最初的事实差了几手、
 * 中间被谁改成了什么样」。本模块把 trace 变成可回溯的证据链读面：
 *   - 逐跳对照：每一跳「改了什么」（上一版 → 下一版 的增量片段）
 *   - 异化度：hops/distortionScore 直读，不重算（单一真源）
 *   - 原始证据：originFact 永远可读（不管传了几手）
 * 只读不改：trace 是引擎的地盘，本模块只读取不回写。
 * 挂载：LonShaRumorTraceBack / CJS / AMD */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) define([], factory);
  else if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LonShaRumorTraceBack = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '3.465.7';

  /* 面向玩家的证据链读面（无黑话）。
   * @returns {{rumorId, originFact, currentNarrative, hops, distortionPct,
   *            chain:[{hop, text, changed}], summary}} */
  function traceBack(rumor) {
    const r = rumor || {};
    const trace = Array.isArray(r.trace) ? r.trace : [];
    const chain = trace.map((text, i) => ({
      hop: i,
      text: String(text || ''),
      changed: i === 0 ? '最初的事实' : diffHint(trace[i - 1], text)
    }));
    const summary = (Number(r.hops) || 0) === 0
      ? '这还是最初的说法，没有走样'
      : '这句话已经被转述了 ' + r.hops + ' 手，和最初的说法（「' + String(r.originFact || '') + '」）已经对不上了';
    return {
      rumorId: r.id || null,
      originFact: String(r.originFact || ''),
      currentNarrative: String(r.currentNarrative || ''),
      hops: Number(r.hops) || 0,
      distortionPct: Math.round((Number(r.distortionScore) || 0) * 100),
      chain,
      summary
    };
  }

  /* 逐跳增量提示：上一版与下一版之间"新添了什么"（取下一版开头的前缀与结尾的后缀） */
  function diffHint(prev, next) {
    const P = String(prev || ''), N = String(next || '');
    if (N.startsWith(P)) return '新添了：「' + N.slice(P.length).replace(/^，/, '') + '」';
    // 前缀替换型（引擎的 replace+prefix 形态）：找出 N 中不再属于 P 开头的新段
    let cut = 0;
    while (cut < P.length && cut < N.length && P[cut] === N[cut]) cut++;
    return '改写为：「' + N.slice(0, cut + 12) + '…」新添：「' + N.slice(Math.max(0, N.lastIndexOf('，') - 10)).replace(/^，/, '') + '」';
  }

  /* 批量：全部谣言的证据链（按异化度从高到低，最该被回溯的排最前） */
  function traceAll(state) {
    const list = (state && Array.isArray(state.rumors)) ? state.rumors : [];
    return list
      .map(traceBack)
      .sort((a, b) => b.hops - a.hops || b.distortionPct - a.distortionPct);
  }

  /* 面板渲染：「这条传言从哪来的」折叠块（无黑话，originFact 永远可读） */
  function formatPanel(tb) {
    if (!tb) return '';
    const lines = ['📢 传言：' + tb.currentNarrative, '🧾 来历：已转述 ' + tb.hops + ' 手（走样约 ' + tb.distortionPct + '%）'];
    lines.push('最初的事实：' + (tb.originFact || '（已不可考）'));
    for (const c of tb.chain.slice(1)) lines.push('第 ' + c.hop + ' 手：' + c.changed);
    return lines.join('\n');
  }

  return { VERSION, traceBack, traceAll, diffHint, formatPanel };
}));