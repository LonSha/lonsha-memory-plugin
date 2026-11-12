/* L21-X3: tacit code legibility — 默契暗号「存在性」与「含义」分离 [v3.465.5]
 * 底座：tacit-intimacy-code-engine.js（LonShaTacitIntimacy）。
 * 暗号是二人专属，但观众（玩家）看不懂 —— 修法不是把含义摊开（那就不是暗号了），
 * 而是**存在性与含义分离**（与 v3.439.0 秘密三刀同口径）：
 *   coded      —— 有暗号，含义遮蔽（只告诉你"这是暗号"，不告诉你什么意思）
 *   ambiguous  —— 可能是暗号也可能是正常话，列出候选**不猜**（绝不把 ambiguous 并进 coded）
 *   plain      —— 就是句正常话
 * 词典里已解锁（intimacyLevel 达到档位）的暗号才在面板给含义。
 * 挂载：LonShaTacitCodeLegibility / CJS / AMD */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) define([], factory);
  else if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LonShaTacitCodeLegibility = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '3.465.5';
  const STATES = Object.freeze({ CODED: 'coded', AMBIGUOUS: 'ambiguous', PLAIN: 'plain' });

  const textOf = x => String(x == null ? '' : x).trim();
  const contains = (hay, needle) => !!needle && hay.includes(needle);

  /**
   * 对一句话判定暗号可解码性。
   * @param {string} utterance 当前这句话
   * @param {Array}  codebook  默契词典 [{phrase, realMeaning, ...}]
   * @param {Object} opts
   *   - intimacyLevel  羁绊等级（0-100）；≥60 才在面板给已解锁含义，否则只标"存在性"
   *   - inPresenceOthers 有第三者在场（coded 含义在面板也继续遮蔽，防旁人视角剧透）
   * @returns {{state, utterance, candidates:[{phrase}], revealMeaning, note}}
   *   revealMeaning=true 时面板才显示 realMeaning；false 时只显示"（暗号）"标记。
   */
  function classify(utterance, codebook, opts) {
    const text = textOf(utterance);
    const book = Array.isArray(codebook) ? codebook : [];
    const o = opts || {};
    const out = {
      state: STATES.PLAIN,
      utterance: text,
      candidates: [],
      revealMeaning: false,
      note: ''
    };
    if (!book.length || !text) { out.note = '没有暗号词典或句子为空，按普通话处理'; return out; }

    // 部分重叠（句子只沾到暗号一半，或句子是暗号的前缀）不算命中，只算候选 —— 不猜。
    const exact = book.filter(c => contains(text, c.phrase));
    const partial = book.filter(c => !contains(text, c.phrase) && hasOverlap(c.phrase, text));
    if (exact.length === 1) {
      const c = exact[0];
      out.state = STATES.CODED;
      out.candidates = [c.phrase];
      out.revealMeaning = !(o.inPresenceOthers) && Number(o.intimacyLevel) >= 60;
      out.note = out.revealMeaning
        ? '这是你们的暗号，词典已解锁'
        : '这是你们的暗号（含义只可意会）';
      return out;
    }
    if (exact.length > 1) {
      // 多个暗号同时命中 ⇒ 无法确定指哪一个，列候选不猜（不并入 coded）
      out.state = STATES.AMBIGUOUS;
      out.candidates = exact.map(c => c.phrase);
      out.note = '这句话可能对应多个暗号，不替你猜是哪一个';
      return out;
    }
    if (partial.length) {
      out.state = STATES.AMBIGUOUS;
      out.candidates = partial.map(c => c.phrase);
      out.note = '这句话里有一点暗号的影子，但不能确定，不猜';
      return out;
    }
    out.note = '没有命中任何暗号，就是句普通话';
    return out;
  }

  /* 短暗语的"沾边"判定：暗号与句子有 ≥2 字连续公共子串 */
  function hasOverlap(phrase, text) {
    for (let i = 0; i < phrase.length - 1; i++) {
      if (textOf(text).includes(phrase.slice(i, i + 2))) return true;
    }
    return false;
  }

  /* 面板标记：对话里暗号句的小标记（只说"这是暗号"，点开也只有存在性） */
  function marker(verdict) {
    if (!verdict) return '';
    if (verdict.state === STATES.CODED) return '（暗号）';
    if (verdict.state === STATES.AMBIGUOUS) return '（可能是暗号）';
    return '';
  }

  /* 词典读面：羁绊详情「🤫 默契词典」——已解锁才给含义，未解锁只给存在性 */
  function formatDictionary(codebook, intimacyLevel) {
    const lv = Number(intimacyLevel) || 0;
    return (Array.isArray(codebook) ? codebook : []).map(c => {
      const unlocked = lv >= 60;
      return '· 「' + c.phrase + '」' + (unlocked ? '—— ' + c.realMeaning : '—— （已记下，还不到告诉你含义的时候）');
    }).join('\n');
  }

  return { VERSION, STATES, classify, marker, formatDictionary, hasOverlap };
}));