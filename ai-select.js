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
function recallCandidates(entries, q, opts = {}) {
  const maxCandidates = Math.max(1, Number(opts.maxCandidates) || 20);
  const allowConstant = !!opts.allowConstant;
  const matchText = [q.lastUserText, q.recentText, q.stateSummary].filter(Boolean).join('\n\n');
  return (Array.isArray(entries) ? entries : [])
    .filter(e => e && e.content && !e.disable)
    .filter(e => allowConstant || !e.constant)
    .map(e => {
      const { score, matchedKeys, matchedSignals } = scoreEntry(e, matchText, q.lastUserText, q.recentText);
      return { ...e, score, matchedKeys, matchedSignals };
    })
    .sort((a, b) => {
      const am = a.score > 0 ? 1 : 0, bm = b.score > 0 ? 1 : 0;
      return (bm - am) || (b.score - a.score) || ((b.order || 0) - (a.order || 0));
    })
    .slice(0, maxCandidates);
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
function parseAIResponse(raw) {
  if (!raw) return [];
  let s = String(raw).replace(/```(?:json)?/gi, '').trim();
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return [];
  let obj = null;
  try { obj = JSON.parse(m[0]); } catch (_e) {
    // 尝试修复尾逗号
    try { obj = JSON.parse(m[0].replace(/,\s*([}\]])/g, '$1')); } catch (_e2) { return []; }
  }
  const sel = obj?.selected;
  if (!Array.isArray(sel)) return [];
  const keys = [];
  for (const item of sel) {
    if (typeof item === 'string' && item.trim()) keys.push(item.trim());
    else if (item && typeof item.key === 'string' && item.key.trim()) keys.push(item.key.trim());
  }
  return keys;
}

/**
 * 把 AI 选中的 key 映射回候选条目（按 keys.all / _label 匹配，保持 AI 顺序）。
 */
function mapKeysToCandidates(keys, candidates) {
  const byKey = new Map();
  for (const c of (Array.isArray(candidates) ? candidates : [])) {
    const allKeys = [ ...(c.keys?.all || []), ...(c.keys?.primary || []), ...(c.keys?.secondary || []), c._label, c.comment ].filter(Boolean);
    for (const k of allKeys) if (!byKey.has(k)) byKey.set(k, c);
  }
  const out = [];
  for (const k of (Array.isArray(keys) ? keys : [])) {
    if (byKey.has(k)) out.push({ ...byKey.get(k), _selectReason: 'AI精选', _aiKey: k });
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
    const candidates = recallCandidates(entries, q, {
      maxCandidates: opts.maxCandidates || this.maxCandidates,
      allowConstant: opts.allowConstant
    });
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
      const keys = parseAIResponse(raw);
      if (keys.length) {
        const selected = mapKeysToCandidates(keys, candidates);
        if (selected.length) {
          this.lastTrace = { candidates: candidates.length, selected: selected.length, source: 'ai', aiRaw: raw };
          return { selected, source: 'ai', candidates: candidates.length, aiRaw: raw };
        }
      }
      // AI 返回空集：语义上本轮无相关（尊重 AI 判断，但保底给本地 top1 防止空注入）
      if (keys.length === 0 && raw) {
        const selected = selectWithFallback(candidates.slice(0, 1), 1);
        this.lastTrace = { candidates: candidates.length, selected: selected.length, source: 'ai-empty-fallback', aiRaw: raw };
        return { selected, source: 'ai-empty-fallback', candidates: candidates.length, aiRaw: raw };
      }
      // raw 为空或解析失败 → 本地 fallback
      const selected = selectWithFallback(candidates, maxSelect);
      this.lastTrace = { candidates: candidates.length, selected: selected.length, source: 'local-parsefail', aiRaw: raw || null };
      return { selected, source: 'local-parsefail', candidates: candidates.length, aiRaw: raw || null };
    } catch (e) {
      const selected = selectWithFallback(candidates, maxSelect);
      this.lastTrace = { candidates: candidates.length, selected: selected.length, source: 'local-error', aiRaw: null, error: e?.message };
      return { selected, source: 'local-error', candidates: candidates.length, aiRaw: null };
    }
  }
}

const api = {
  AISelect, scoreEntry, recallCandidates, buildSelectPrompt,
  parseAIResponse, mapKeysToCandidates, selectWithFallback, extractQueryTerms, normalizeText
};
if (typeof window !== 'undefined') window.LonShaAISelect = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();