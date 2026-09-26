/* ========================================================
 * sleep-awaken.js — 睡眠记忆的唤醒面（补上单向门的回程）[v3.234.0]
 * --------------------------------------------------------
 * 为什么需要：`index.js` 的睡眠周期 `sleepCycle()` 把低保留价值摘要标成
 *   `archivedForSleep = true`，注释承诺「不物理删除，需要时可唤醒」；但实测
 *   全仓 `archivedForSleep` 共 9 处引用、**归零点 0 处** —— 归档是一扇单向门：
 *   被归档的条目此后只被召回侧过滤掉，永远不会回来。
 *   长线跑团下这意味着：一句「当时没人在乎」的细节，哪怕后来成为关键伏笔，
 *   也无法再被想起 —— 而它正好是「低价值才被睡」的那一批。
 *
 * 机制来源（只搬机制，不搬代码）：XLDB-sillytavern 自述的「本该被遗忘的记忆在
 *   相似情景中的**语义匹配再激活**」。其许可为自定义许可证（明文禁止修改/改编/
 *   衍生/再发布），故本模块**不参考其任何源码**，只按该机制描述独立实现；
 *   且本仓已有等价基础（`cosineSimilarity` / `summary` 池 / 实体唤醒），
 *   本模块只补上缺失的那一段。
 *
 * 与既有 `awakenByEntities` 的分工（两者不互相顶替）：
 *   · `awakenByEntities`：**实体名**命中即唤醒（人/地名逐字出现）。
 *   · 本模块：**语义相似**唤醒 —— 情景相近但用词不同时也能召回
 *     （这正是「语义再激活」与「字面命中」的区别）。
 *   本模块**不改** `awakenByEntities` 的行为；两者各自独立上报。
 *
 * 纪律（与仓内一贯口径对齐）：
 *   ① **只读判定、显式写回**：`plan()` 只算不写；`apply()` 才改标记。
 *   ② **不越权**：不碰 `summaries` 数组本身（不删、不重排），只翻转
 *      `archivedForSleep` / 置 `awakened` / 记 `awakeReason`。
 *   ③ **可解释**：每个唤醒决定都带 `reason` 与 `score`，零命中与「没跑过」可分。
 *   ④ **不抛**：任何输入畸形都落成 `{ok:false, reason}`，绝不外抛。
 *   ⑤ **阈值必须显式**：不设「魔法默认值即静默生效」——默认阈值走常量，
 *      调用方可覆盖，且结果里回显用得是哪一个。
 * 挂 window.LonShaSleepAwaken。
 * ======================================================== */
'use strict';
(function (root) {
  const REASONS = Object.freeze({
    ok: '执行完成',
    'no-pool': '没有可审的摘要池',
    'no-query': '没给线索（无法判定“相似情景”）',
    'no-vector': '无向量能力（退回字面共现计分）',
    'malformed': '入参畸形'
  });

  const DEFAULTS = Object.freeze({
    threshold: 0.62,   // 语义相似度阈值（余弦）
    literalMin: 2,     // 无向量时的字面共现最低词数
    maxAwaken: 3,      // 单次最多唤醒条数（防一次性涌入）
    minLen: 2          // 分词最短长度
  });

  function _num(v, fb) { const n = Number(v); return Number.isFinite(n) ? n : fb; }
  function _text(v) { return (v === undefined || v === null) ? '' : String(v); }
  function _reject(reason, extra) {
    return Object.assign({ ok: false, reason: reason, awakened: [], considered: 0 }, extra || {});
  }

  /** 分词：中文按字串片段 + 西文按词。不依赖外部分词器。 */
  function tokens(s, minLen) {
    const t = _text(s).toLowerCase();
    const ml = _num(minLen, DEFAULTS.minLen);
    const out = [];
    for (const seg of t.split(/[^0-9a-z\u4e00-\u9fff]+/g)) {
      if (!seg) continue;
      if (/^[0-9a-z]+$/.test(seg)) { if (seg.length >= 2) out.push(seg); continue; }
      for (let i = 0; i + ml <= seg.length; i++) out.push(seg.slice(i, i + ml));
    }
    return out;
  }

  /** 字面共现计分（无向量能力时的降级面）。返回 0..1。 */
  function literalScore(queryTokens, textTokens) {
    const q = Array.isArray(queryTokens) ? queryTokens : [];
    const t = Array.isArray(textTokens) ? textTokens : [];
    if (!q.length || !t.length) return 0;
    const set = new Set(t);
    let hit = 0;
    for (const tok of new Set(q)) if (set.has(tok)) hit++;
    return hit / Math.sqrt(q.length * set.size) || 0;
  }

  /** 余弦相似度（与 index.js 同公式，不引入新依赖） */
  function cosine(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
  }

  /** 取候选池：已睡的摘要（已唤醒的不重复入选）。 */
  function poolOf(summaries) {
    if (!Array.isArray(summaries)) return null;
    return summaries.filter((s) => s && s.archivedForSleep && !s.awakened);
  }

  /**
   * 只计算不写回。
   * @param {{summaries:Array, queryText:string, queryEmbedding?:Array, embed?:Function, threshold?:number, maxAwaken?:number}} o
   */
  function plan(o) {
    const opt = (o && typeof o === 'object') ? o : {};
    const pool = poolOf(opt.summaries);
    if (!pool) return _reject(REASONS.malformed, { reason: REASONS.malformed, detail: 'summaries 不是数组' });
    if (!pool.length) return _reject(REASONS['no-pool'], { pool: 0 });
    const qt = _text(opt.queryText).trim();
    const qemb = Array.isArray(opt.queryEmbedding) ? opt.queryEmbedding : null;
    if (!qt && !qemb) return _reject(REASONS['no-query'], { pool: pool.length });

    const threshold = _num(opt.threshold, DEFAULTS.threshold);
    const maxAwaken = Math.max(1, _num(opt.maxAwaken, DEFAULTS.maxAwaken));
    const qTokens = tokens(qt, opt.minLen);
    // [v3.234.0] 语义面只有「查询向量在场」且「确实发生了至少一次向量计分」才算数。
    //   首稿把判据写成 `scored[0].by === 'literal'` —— 一条向量都匹配不上时 scored 为空，
    //   于是 mode 报 'semantic' 而实际一分都没算过：**降级冒充了语义命中**。
    //   实测暴露（v3235 第 7 条）：维度不匹配的池子 + 正交查询 ⇒ mode='semantic'（错）。
    const useVector = !!(qemb && qemb.length);
    const scored = [];
    let vecScored = 0;
    for (const s of pool) {
      const txt = _text(s.text);
      let score = 0, by = '';
      if (useVector) {
        const emb = Array.isArray(s.embedding) ? s.embedding : null;
        if (emb && emb.length === qemb.length) { score = cosine(qemb, emb); by = 'cosine'; vecScored++; }
      }
      if (!by) { score = literalScore(qTokens, tokens(txt, opt.minLen)); by = 'literal'; }
      if (score > 0) scored.push({ id: s.id || ('sum_' + s.floor), floor: s.floor, score: score, by: by, text: txt.slice(0, 120) });
    }
    scored.sort((a, b) => b.score - a.score);

    const literalMode = vecScored === 0;
    const minScore = literalMode ? Math.max(threshold * 0.5, 0.15) : threshold;
    const awakened = [];
    for (const c of scored) {
      if (awakened.length >= maxAwaken) break;
      if (c.score < minScore) continue;
      awakened.push(Object.assign({}, c, { reason: literalMode ? '字面共现命中（无向量面）' : '语义相似命中' }));
    }
    return {
      ok: true, reason: REASONS.ok,
      mode: literalMode ? 'literal' : 'semantic',
      // 降级必须留名：字面面把「无可用向量」写进结果，读得出「这次是语义命中还是退而求其次」
      degrade: literalMode ? REASONS['no-vector'] : null,
      threshold: minScore, requestedThreshold: threshold,
      considered: scored.length, pool: pool.length,
      awakened: awakened
    };
  }

  /**
   * 显式写回：只翻标记，不动数组。
   * @returns {{applied:number, ids:string[], skipped:string[], plan:object}}
   */
  function apply(planResult, summaries, at) {
    const out = { applied: 0, ids: [], skipped: [], plan: planResult || null };
    if (!planResult || planResult.ok !== true || !Array.isArray(planResult.awakened)) return out;
    if (!Array.isArray(summaries)) return out;
    const stamp = _num(at, Date.now());
    const byId = new Map();
    for (const s of summaries) {
      if (!s) continue;
      byId.set(s.id || ('sum_' + s.floor), s);
    }
    for (const a of planResult.awakened) {
      const s = byId.get(a.id);
      if (!s) { out.skipped.push(String(a.id)); continue; }
      if (!s.archivedForSleep) { out.skipped.push(String(a.id)); continue; }
      s.archivedForSleep = false;
      s.awakened = true;
      s.awakenReason = a.reason;
      s.awakenScore = a.score;
      s.awakenedAt = stamp;
      out.applied++;
      out.ids.push(String(a.id));
    }
    return out;
  }

  /** 一条句面：供诊断面直转（读不出就说读不出）。 */
  function describe(r) {
    if (!r || typeof r !== 'object') return '启动面：未跑过';
    if (r.ok !== true) return '启动面：' + _text(r.reason || REASONS.malformed);
    if (!r.considered) return '启动面：候选 0 条（池中 ' + r.pool + ' 条已睡，无相似情景）';
    return '启动面：' + r.mode + ' 命中 ' + r.awakened.length + '/' + r.considered + '（阈值 ' + r.threshold.toFixed(2) + '）';
  }

  const api = Object.freeze({
    REASONS: REASONS, DEFAULTS: DEFAULTS,
    tokens: tokens, literalScore: literalScore, cosine: cosine,
    poolOf: poolOf, plan: plan, apply: apply, describe: describe
  });
  root.LonShaSleepAwaken = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
