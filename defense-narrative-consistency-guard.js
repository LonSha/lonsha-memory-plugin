/* L21-X1: ego-defense narrative consistency guard. Does not mutate engine output or locked facts. */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) define([], factory);
  else if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LonShaDefenseConsistency = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '3.465.3';
  const STATES = Object.freeze({ CONSISTENT: 'consistent', STRAINED: 'strained', CONTRADICTS: 'contradicts' });
  const verbs = ['答应','承诺','保证','允诺','应承','发誓','约定','原谅','接受','同意','拒绝','喜欢','爱上','恨','背叛','离开','抛下','伤害','欺骗','撒谎','弄坏','搞砸'];
  const negation = /(没有|没|从未|未曾|不曾|并未|不会|不|别|绝非|压根|根本就没)/;
  const textOf = x => String(x == null ? '' : (typeof x === 'object' ? (x.text || x.statement || '') : x)).trim();
  // 上下文证据判定：先做人称代词归一（你/我/他/她 = 同一对话双方，'帮你'≈'帮我'），
//   再剔除动词词干，然后按字符 bigram 求交，**但虚词 bigram（没/不/过/的/了…）与
//   动词槽位相邻残段一律不算证据** —— 否则「答应过帮小明」会撞上「答应过帮我」。
  const STOP_CHARS = '没不的了吗呢吧在有也都就还很太过是';
  const PRONOUNS = /[你我他她它]/g;
  function overlap(a, b, verb) {
    const norm = s => textOf(s).replace(PRONOUNS, '人');
    const strip = s => verb ? s.split(verb).join('◇') : s;
    const A = strip(norm(a)), B = strip(norm(b));
    if (!A || !B) return false;
    const grams = s => { const set = new Set(); for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2)); return set; };
    const gb = grams(B);
    for (const g of grams(A)) {
      if (g.includes('◇')) continue;                       // 动词槽位相邻残段
      let stop = false;
      for (const ch of g) if (STOP_CHARS.includes(ch)) { stop = true; break; }
      if (stop) continue;                                   // 虚词 bigram 不是事件证据
      if (gb.has(g)) return true;
    }
    return false;
  }
  function semanticSignature(candidate) {
    const text = textOf(candidate);
    return { text, verb: verbs.find(v => text.includes(v)) || null, negated: negation.test(text) };
  }
  function suggestion(sig, fact) {
    const f = textOf(fact);
    return '我确实' + (sig.verb || '记得这件事') + '过' + (f ? '（' + f + '）' : '') + '，只是当时心里有别的想法';
  }
  function guard(candidate, lockedFacts) {
    const text = textOf(candidate), sig = semanticSignature(text);
    const facts = Array.isArray(lockedFacts) ? lockedFacts : [];
    const out = { state: STATES.CONSISTENT, text, reason: '', suggested: '', matchedFactId: null };
    if (!facts.length) { out.reason = '没有已锁定事实可依，放行'; return out; }
    if (!sig.verb) { out.state = STATES.STRAINED; out.reason = '无法从这句话里识别可核对的动作，无法确定'; return out; }
    const hit = facts.find(f => { const ft = textOf(f); return sig.verb && ft.includes(sig.verb) && overlap(text, ft, sig.verb); });
    if (!hit) { out.reason = '已锁定事实中没有关于「' + sig.verb + '」的记录，放行'; return out; }
    out.matchedFactId = hit.id || null;
    if (sig.negated) {
      out.state = STATES.CONTRADICTS;
      out.reason = '这一句与已锁定事实不符：「' + textOf(hit) + '」';
      out.suggested = suggestion(sig, hit);
    } else out.reason = '与已锁定事实「' + textOf(hit) + '」一致';
    return out;
  }
  function guardDistortions(distortions, lockedFacts) {
    return (Array.isArray(distortions) ? distortions : []).map(d => ({
      rawFact: d && d.rawFact, mechanism: d && d.mechanism, subjectiveTake: d && d.subjectiveTake,
      verdict: guard(d && d.subjectiveTake, lockedFacts)
    }));
  }
  function summarize(verdicts) {
    const n = (Array.isArray(verdicts) ? verdicts : []).filter(v => v && v.verdict && v.verdict.state === STATES.CONTRADICTS).length;
    return n ? '【⚠️ 有些话和铁律对不上】' + n + ' 句需要换一种说法。' : '';
  }
  return { VERSION, STATES, semanticSignature, guard, guardDistortions, summarize };
}));
