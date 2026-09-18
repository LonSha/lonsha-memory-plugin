/**
 * ai-select.js — [v3.96 缝合] 前置 AI 精选引擎
 *
 * 【来源】缝合 wominIII/ai-worldbook-router（zmer）的两段式路由：
 *   本地粗召回 → 前置 AI 从候选 JSON 精选「本轮真正相关」→ 只注入精选结果。
 *   解决记忆插件「本地评分命中但语义无关」的误注入问题——对大型记忆库/世界书
 *   减少无关注入、省 token、提精度。
 *
 * 【工程化重写】（非照抄 index.js 6029 行，只取机制）：
 *   - 纯函数 scoreEntry/recallCandidates 可测（无 window 依赖，normalize 注入）
 *   - AI 精选严格 JSON 契约（禁 Markdown/reasoning/id，只返回 key+reason，空集约定）
 *   - 三级 fallback：AI 精选失败 → 本地评分 topN；无 AI 通道 → 直接本地评分
 *   - 独立路由模型通道（不占用主回复模型），经调用方注入的 llm.callAPI 统一走
 *   - buildSelectPrompt 契约参考 router buildAiPrompt，压缩候选预览控 token
 *
 * 挂 window.LonShaAISelect，双导出（对齐 narrative-pulse 约定）。
 */
(function() {

// ── 文本归一（router normalizeText 同款思路）─────────────────────────
function normalizeText(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[，。！？；：、"''【】（）()<>《》·…—~`^$|\\/[\]{}@#%&*+=_-]/g, ' ')
    .trim();
}
function truncateText(s, n) { s = String(s ?? ''); return s.length > n ? s.slice(0, n) : s; }

// 停用词（router COMMON_QUERY_TERMS 思路：过滤无召回价值的口语词）
const STOP_TERMS = new Set([
  '如果','有人','这个','那个','这里','那里','什么','怎么','为何','为什么','然后',
  '可以','是不是','就是','不是','一下','一下子','这样','那样','会被','会不会',
  '到底','真的','已经','现在','之前','之后','而且','因为','所以','我','你','他','她','它'
]);

/** 提取查询词（2-6 字连续片段，去停用词），供 term 命中计分 */
function extractQueryTerms(text) {
  const t = normalizeText(text);
  if (!t) return [];
  const terms = new Set();
  // 按空格切词后，对中文长段再做 2-4 字 n-gram 切片
  for (const seg of t.split(' ')) {
    if (!seg || seg.length < 2) continue;
    if (/^[a-z0-9]+$/.test(seg)) { if (!STOP_TERMS.has(seg)) terms.add(seg); continue; }
    // 中文段：整段 + 滑窗
    if (seg.length <= 6 && !STOP_TERMS.has(seg)) terms.add(seg);
    for (let L = 4; L >= 2; L--) {
      for (let i = 0; i + L <= seg.length; i++) {
        const w = seg.slice(i, i + L);
        if (!STOP_TERMS.has(w)) terms.add(w);
      }
    }
  }
  return [...terms].slice(0, 48);
}

function countTermHits(haystack, term) {
  if (!term) return 0;
  let n = 0, i = 0;
  while ((i = haystack.indexOf(term, i)) !== -1) { n++; i += term.length; }
  return n;
}

// ── scoreEntry：分层计分（router 2851 行机制重写）─────────────────────
/**
 * 单条候选与当前上下文的相关度评分。
 * @param {object} entry { keys:{primary:[],secondary:[]}, comment, content, constant }
 * @param {string} matchText 最后用户消息+近期文本+状态摘要 合并
 * @param {string} lastUserText 最后一条用户消息（权重最高）
 * @param {string} recentText 近期对话文本
 * @returns {{score:number, matchedKeys:string[], matchedSignals:string[]}}
 */
function scoreEntry(entry, matchText, lastUserText, recentText) {
  let score = 0;
  const matchedKeys = new Set();
  const matchedSignals = new Set();
  const lowerMatchText = normalizeText(matchText);
  const lowerLastUserText = normalizeText(lastUserText);
  const comment = normalizeText(entry.comment);
  const content = normalizeText(truncateText(entry.content, 2400));
  const haystack = `${comment}\n${content}`;

  const keys = entry.keys || {};
  for (const key of (keys.primary || [])) {
    const k = normalizeText(key).trim();
    if (k && lowerMatchText.includes(k)) {
      score += lowerLastUserText.includes(k) ? 14 : 10;   // router: 14/10
      matchedKeys.add(key);
    }
  }
  for (const key of (keys.secondary || [])) {
    const k = normalizeText(key).trim();
    if (k && lowerMatchText.includes(k)) {
      score += lowerLastUserText.includes(k) ? 6 : 4;     // router: 6/4
      matchedKeys.add(key);
    }
  }
  if (comment && lowerLastUserText && comment.includes(lowerLastUserText.slice(0, 16))) score += 2;

  const lastUserTerms = extractQueryTerms(lastUserText);
  const recentTerms = extractQueryTerms(recentText);
  for (const term of lastUserTerms) {
    if (!countTermHits(haystack, term)) continue;
    matchedSignals.add(term);
    score += term.length >= 4 ? 6 : (term.length === 3 ? 4 : 2);   // router: 6/4/2
  }
  for (const term of recentTerms) {
    if (lastUserTerms.includes(term)) continue;
    if (!countTermHits(haystack, term)) continue;
    matchedSignals.add(term);
    score += term.length >= 3 ? 2 : 1;                             // router: 2/1
  }
  if (entry.constant) score -= 3;                                  // router: constant -3 降权
  return { score, matchedKeys: [...matchedKeys], matchedSignals: [...matchedSignals] };
}

// ── recallCandidates：本地粗召回（router 2925 行机制重写）─────────────
/**
 * @param {Array} entries 候选条目（含 content/keys/constant/disable）
 * @param {object} q { lastUserText, recentText, stateSummary }
 * @param {object} opts { maxCandidates, allowConstant }
 */
function recallCandidates(entries, q, opts = {}, carry = null) {
  const maxCandidates = Math.max(1, Number(opts.maxCandidates) || 20);
  const allowConstant = !!opts.allowConstant;
  const _q = (q && typeof q === 'object') ? q : {};
  const matchText = [_q.lastUserText, _q.recentText, _q.stateSummary].filter(Boolean).join('\n\n');
  // [v3.172] I6：入参不是数组 ≠ 入参是空数组。这两者此前共用同一个 [] 出口，
  //   读取方无从分辨「本次没有候选」与「调用方给错了东西」。
  const inputNotArray = !Array.isArray(entries);
  const _arr = Array.isArray(entries) ? entries : [];
  const stage1 = _arr.filter(e => e && e.content && !e.disable);
  const noContent = _arr.length - stage1.length;
  const stage2 = stage1.filter(e => allowConstant || !e.constant);
  const constantFiltered = stage1.length - stage2.length;
  const scored = stage2.map(e => {
    const { score, matchedKeys, matchedSignals } = scoreEntry(e, matchText, _q.lastUserText, _q.recentText);
    return { ...e, score, matchedKeys, matchedSignals };
  }).sort((a, b) => {
    const am = a.score > 0 ? 1 : 0, bm = b.score > 0 ? 1 : 0;
    return (bm - am) || (b.score - a.score) || ((b.order || 0) - (a.order || 0));
  });
  const out = scored.slice(0, maxCandidates);
  // [v3.172] I5：有损必有计数。截断量必须离体可读——裸数组的 length 只能证明
  //   「剩了多少」，永远证明不了「丢了多少」。
  if (carry && typeof carry === 'object') {
    carry.total = _arr.length;
    carry.scored = scored.length;
    carry.kept = out.length;
    carry.dropped = Math.max(0, scored.length - out.length);
    carry.noContent = noContent;
    carry.constantFiltered = constantFiltered;
    carry.inputNotArray = inputNotArray;
    carry.cap = maxCandidates;
  }
  return out;
}

// ── buildSelectPrompt：前置 AI 精选契约（router buildAiPrompt 重写）───
/**
 * @param {object} q { lastUserText, recentText, stateSummary }
 * @param {Array} candidates 粗召回候选（需有 .keys.all 或 ._label）
 * @param {number} maxSelect 最多精选条数
 */
function buildSelectPrompt(q, candidates, maxSelect = 6) {
  const candText = (Array.isArray(candidates) ? candidates : []).map(e => {
    const keys = (e.keys?.all?.length ? e.keys.all : (e.keys?.primary || [])).join(' / ') || (e._label || e.comment || '(无 keys)');
    return `- ${truncateText(keys, 80)}`;
  }).join('\n');
  const recentCtx = truncateText(String(q.recentText || ''), 600);
  return `<task>
从候选 keys 中选择最多 ${maxSelect} 条"本轮真正相关"的条目。
</task>

<rules>
1. 只能从候选 keys 中选。
2. 只输出严格 JSON。
3. 禁止 Markdown、禁止解释、禁止 reasoning、禁止额外字段。
4. 不要返回标题，不要返回 id，只返回命中的 key。
5. 如果没有合适条目，输出 {"selected":[]}。
</rules>

<output_format>
{"selected":[{"key":"命中的 key","reason":"简短原因"}]}
</output_format>

<last_user_message>
${truncateText(String(q.lastUserText || ''), 220) || '(空)'}
</last_user_message>

<recent_context>
${recentCtx || '(空)'}
</recent_context>

<state_summary>
${truncateText(String(q.stateSummary || ''), 320) || '(未启用)'}
</state_summary>

<candidate_keys>
${candText || '(无)'}
</candidate_keys>`;
}

// ── parseAIResponse：容错解析前置 AI 的 JSON 返回 ─────────────────────
/**
 * 从 AI 原始返回中解析 selected 的 key 列表。
 * 容错：剥 Markdown 代码块、抓第一个 {...} JSON、兼容字符串数组。
 * @returns {string[]} 命中的 key 列表（保持 AI 给定顺序）
 */
function parseAIResponse(raw, carry = null) {
  // [v3.172] I6：这里的返回值仍然是裸数组（既有契约），但「为什么是空的」
  //   从此可分——五种此前同形的空，现在各有一态。
  const _set = (state, keys, extra) => {
    if (carry && typeof carry === 'object') {
      carry.state = state;
      carry.keys = (keys || []).length;
      if (extra) Object.assign(carry, extra);
    }
    return keys;
  };
  // [v3.172] 空串不是「没返回」：前者是返回了但内容为空（blank），
  //   后者是调用方压根没拿到返回值（no-raw）。两者此前被 !raw 合并同形。
  if (raw === null || raw === undefined) return _set('no-raw', []);
  const s = String(raw).replace(/```(?:json)?/gi, '').trim();
  if (!s) return _set('blank', []);
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return _set('no-json', []);                       // 判不了：返回体里根本没有 JSON
  let obj = null;
  try { obj = JSON.parse(m[0]); } catch (_e) {
    // 尝试修复尾逗号
    try { obj = JSON.parse(m[0].replace(/,\s*([}\]])/g, '$1')); } catch (_e2) { return _set('bad-json', []); }
  }
  if (!obj || typeof obj !== 'object') return _set('not-object', []);
  const sel = obj.selected;
  if (!Array.isArray(sel)) {
    return _set('wrong-shape', [], { gotKeys: Object.keys(obj).join(',') });   // 键名不认识 / 类型不对
  }
  const keys = [];
  for (const item of sel) {
    if (typeof item === 'string' && item.trim()) keys.push(item.trim());
    else if (item && typeof item.key === 'string' && item.key.trim()) keys.push(item.key.trim());
  }
  // 明确空集 vs 有元素但全是脏元素（此前同形）
  return _set(keys.length ? 'ok' : (sel.length ? 'all-items-invalid' : 'empty'), keys, { rawItems: sel.length });
}

/**
 * 把 AI 选中的 key 映射回候选条目（按 keys.all / _label 匹配，保持 AI 顺序）。
 */
function mapKeysToCandidates(keys, candidates, carry = null) {
  const byKey = new Map();
  for (const c of (Array.isArray(candidates) ? candidates : [])) {
    const allKeys = [ ...(c.keys?.all || []), ...(c.keys?.primary || []), ...(c.keys?.secondary || []), c._label, c.comment ].filter(Boolean);
    for (const k of allKeys) if (!byKey.has(k)) byKey.set(k, c);
  }
  const out = [];
  const unmatched = [];
  for (const k of (Array.isArray(keys) ? keys : [])) {
    if (byKey.has(k)) out.push({ ...byKey.get(k), _selectReason: 'AI精选', _aiKey: k });
    else unmatched.push(String(k));
  }
  // [v3.172] I5：AI 说了 5 条、候选表只认得 2 条——那 3 条不是「没被选中」，
  //   是「选中的东西不存在」。这条差异此前随返回值长度一起消失。
  if (carry && typeof carry === 'object') {
    carry.requested = Array.isArray(keys) ? keys.length : 0;
    carry.mapped = out.length;
    carry.unmatched = unmatched.length;
    carry.unmatchedSample = unmatched.slice(0, 5);
  }
  return out;
}

/** 本地评分 fallback：AI 失败时取 topN（router selectWithFallback 同款） */
function selectWithFallback(candidates, maxSelect = 6) {
  return (Array.isArray(candidates) ? candidates : []).slice(0, maxSelect).map(e => ({
    ...e,
    _selectReason: e.matchedKeys?.length ? `关键词命中：${e.matchedKeys.join(', ')}` : `本地评分 fallback：${e.score}`
  }));
}

// ── AISelect 类：两段式路由编排 ────────────────────────────────────────
class AISelect {
  /**
   * @param {object} deps { callAI: async(prompt)=>string|null } AI 通道（可选）
   */
  constructor(deps = {}) {
    this.callAI = typeof deps.callAI === 'function' ? deps.callAI : null;
    this.maxCandidates = Number(deps.maxCandidates) || 20;
    this.maxSelect = Number(deps.maxSelect) || 6;
    this.lastTrace = null;   // 可观测性：最近一轮 {candidates, selected, source, aiRaw}
  }

  /**
   * 两段式精选：本地粗召回 → AI 精选（失败回退本地评分）。
   * @param {Array} entries 全量候选条目
   * @param {object} q { lastUserText, recentText, stateSummary }
   * @param {object} opts { maxCandidates, maxSelect, allowConstant, useAI }
   * @returns {Promise<{selected:Array, source:string, candidates:number, aiRaw:string|null}>}
   */
  async route(entries, q, opts = {}) {
    // [v3.172] 本次粗召回的读数（截断量等）留在实例上，供宿主读数面取用——
    //   返回值形状是既有契约（裸数组/固定字段），不加新键也能把读数带出去。
    const coarseCarry = {};
    const candidates = recallCandidates(entries, q, {
      maxCandidates: opts.maxCandidates || this.maxCandidates,
      allowConstant: opts.allowConstant
    }, coarseCarry);
    this.lastCoarseRead = coarseCarry;
    const maxSelect = Math.max(1, Number(opts.maxSelect) || this.maxSelect);
    const useAI = opts.useAI !== false && !!this.callAI;

    if (!useAI) {
      const selected = selectWithFallback(candidates, maxSelect);
      this.lastTrace = { candidates: candidates.length, selected: selected.length, source: 'local-noai', aiRaw: null };
      return { selected, source: 'local-noai', candidates: candidates.length, aiRaw: null };
    }

    // AI 精选路径
    try {
      const prompt = buildSelectPrompt(q, candidates, maxSelect);
      const raw = await this.callAI(prompt);
      const readState = {};
      const keys = parseAIResponse(raw, readState);
      if (keys.length) {
        const keyMap = {};
        const selected = mapKeysToCandidates(keys, candidates, keyMap);
        if (selected.length) {
          this.lastTrace = { candidates: candidates.length, selected: selected.length, source: 'ai', aiRaw: raw, readState, keyMap };
          return { selected, source: 'ai', candidates: candidates.length, aiRaw: raw, readState, keyMap };
        }
      }
      // [v3.172] I6：只有 AI「明确判定了空集」才配得到 top1 保底。
      //   「判不了」（无返回 / 无 JSON / 坏 JSON / 键名不认识 / 类型不对）此前
      //   与空集同形，会把一次读取失败静默改写成一个结论：「本轮无相关内容」。
      //   读失败 ≠ 读到了 0。
      if (readState.state === 'empty') {
        const selected = selectWithFallback(candidates.slice(0, 1), 1);
        this.lastTrace = { candidates: candidates.length, selected: selected.length, source: 'ai-empty-fallback', aiRaw: raw, readState };
        return { selected, source: 'ai-empty-fallback', candidates: candidates.length, aiRaw: raw, readState };
      }
      // 其余一律判不了 / 未作答 → 本地 fallback（不得冒充空集结论）
      const selected = selectWithFallback(candidates, maxSelect);
      this.lastTrace = { candidates: candidates.length, selected: selected.length, source: 'local-parsefail', aiRaw: raw || null, readState };
      return { selected, source: 'local-parsefail', candidates: candidates.length, aiRaw: raw || null, readState };
    } catch (e) {
      const selected = selectWithFallback(candidates, maxSelect);
      this.lastTrace = { candidates: candidates.length, selected: selected.length, source: 'local-error', aiRaw: null, error: e?.message };
      return { selected, source: 'local-error', candidates: candidates.length, aiRaw: null };
    }
  }
}

// ── [v3.172] 召回漏斗面板 ─────────────────────────────────────────────
/**
 * 把「召回漏斗每一次收缩」读出来。漏斗的收缩点全部是无计数静默丢弃：
 *   粗召回按分数截断 / AI 判不了被当作判定了空 / AI 给的 key 映射不上 /
 *   图谱候选按更新时间先截断再评分。
 * 每条记录统一形状：{ stages: {...} }（台账摘出的 { report: {...} } 与平铺简写也认）。
 * @param {Array} records 台账条目
 * @param {object} opts { cap, dropped }
 * @returns {{records,misc,cap,dropped,missing,empty,truncated,unmatched,unreadable,
 *            hardCut,channelFallback,graphDropped,stages,hasReadGap}}
 */
function normalizeRecallFunnel(records, opts = {}) {
  const cap = Math.max(1, Number(opts.cap) || 500);
  const list = Array.isArray(records) ? records : [];
  const sum = {};
  let missing = 0, recorded = 0, evaluated = 0;
  for (const rec of list) {
    const src = (rec && typeof rec === 'object')
      ? ((rec.stages && typeof rec.stages === 'object') ? rec.stages
        : ((rec.report && rec.report.stages && typeof rec.report.stages === 'object') ? rec.report.stages
          : ((rec.report && typeof rec.report === 'object') ? rec.report : rec)))
      : null;
    if (!src || typeof src !== 'object') { missing++; continue; }
    recorded++;
    if (Number.isFinite(Number(rec && rec.evaluated))) evaluated += Number(rec.evaluated);
    else evaluated++;
    for (const k of Object.keys(src)) {
      const v = Number(src[k]);
      if (Number.isFinite(v) && v) sum[k] = (sum[k] || 0) + v;
    }
  }
  const dropped = Math.max(0, Number(opts.dropped) || 0);
  const pan = {
    records: list.length, recorded, missing, cap, dropped,
    evaluated,
    empty: sum.aiEmpty || 0,              // AI 明确判定了空集
    unreadable: sum.aiUnreadable || 0,    // AI 判不了（无返回/无 JSON/坏 JSON/键名不认识/类型不对）
    unmatched: sum.keyUnmatched || 0,     // AI 选中但候选表里不存在
    truncated: sum.coarseDropped || 0,    // 粗召回按上限截断
    graphDropped: sum.graphDropped || 0,  // 图谱候选按更新时间截断
    hardCut: sum.hardCut || 0,            // 分块硬切（该模块存在的理由：避免它）
    channelFallback: sum.channelFallback || 0,   // 副通道失败回落
    stages: sum,
    hasReadGap: false,
  };
  pan.hasReadGap = !!(pan.unreadable || pan.unmatched || pan.truncated || pan.graphDropped
    || pan.dropped || pan.missing || pan.hardCut || pan.channelFallback);
  return pan;
}

const api = {
  AISelect, scoreEntry, recallCandidates, buildSelectPrompt,
  parseAIResponse, mapKeysToCandidates, selectWithFallback, extractQueryTerms, normalizeText,
  normalizeRecallFunnel
};
if (typeof window !== 'undefined') window.LonShaAISelect = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();