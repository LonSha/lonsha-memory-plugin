/**
 * unified-recall.js — [v3.96 缝合] 统一召回管线
 *
 * 【来源】缝合 wominIII/ai-worldbook-router 的 buildMemoryCandidates(3657行) +
 *   recallMemoryCandidates(3722行)：把「记忆图谱节点」候选化成与世界书条目同构的
 *   { keys.primary/secondary/all } 结构，走 ai-select 的 scoreEntry 同一套评分召回，
 *   实现「世界书条目 + 图谱记忆节点」统一管线召回（不再两套独立逻辑）。
 *
 * 【工程化重写】（非照抄，只取机制）：
 *   - 纯函数：输入 MemoryGraph 的 nodes 数组，输出候选；不依赖 window，可测。
 *   - 候选化规则：节点 name/title/summary/location/timeSpan/tags → keys.primary；
 *     data 文本切句（2-18 字片段取至多 8 条）→ keys.secondary；对齐 router。
 *   - 类型保底：event/quest/character/location 类节点保底入选（router 类型保底思路），
 *     防止高价值结构节点因 keys 未命中被漏召。
 *   - 与 ai-select 解耦：本模块只负责「候选化 + 保底合并」，评分交给 ai-select.scoreEntry。
 *
 * 挂 window.LonShaUnifiedRecall，双导出。
 */
(function() {

// 类型保底白名单（router recallMemoryCandidates 的保底类型）
const GUARANTEED_TYPES = new Set(['event', 'quest', 'character', 'location', 'scene', 'faction']);
const MAX_SECONDARY_KEYS = 8;    // router: content 切句取 8 条作 secondary
const MAX_CANDIDATES = 24;       // 图谱侧候选上限
const SECONDARY_MIN = 2, SECONDARY_MAX = 18; // 切句长度窗

function _trunc(s, n) { s = String(s ?? ''); return s.length > n ? s.slice(0, n) : s; }

// 把一段文本切成 2-18 字的有效短语片段（router content 切句思路）
function _slicePhrases(text, cap) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const parts = t.split(/[，。！？；：、,.!?;:\n|·…—~"'【】（）()<>《》\[\]]+/)
    .map(x => x.trim())
    .filter(x => x.length >= SECONDARY_MIN && x.length <= SECONDARY_MAX);
  const uniq = [...new Set(parts)];
  return uniq.slice(0, cap || MAX_SECONDARY_KEYS);
}

// ── 单个图谱节点 → 候选条目 ──────────────────────────────────────────
/**
 * @param {object} node MemoryGraph 节点 { id, type, name, data, timestamp }
 * @returns {object} 候选 { id, _nodeType, _label, comment, content, constant:false,
 *                          keys:{primary,secondary,all}, updatedAt, order }
 */
function nodeToCandidate(node) {
  if (!node || typeof node !== 'object') return null;
  const d = node.data || {};
  const name = String(node.name || d.name || d.title || '').trim();
  const type = String(node.type || d.type || 'node').toLowerCase();

  // primary keys：结构化身份字段（router: title/summary/location/timeSpan/keys/tags）
  const primary = new Set();
  if (name) primary.add(name);
  for (const f of [d.title, d.location, d.timeSpan, d.path]) {
    if (typeof f === 'string' && f.trim() && f.trim().length <= 24) primary.add(f.trim());
  }
  if (Array.isArray(d.path)) {
    const last = String(d.path[d.path.length - 1] || '').trim();
    if (last && last.length <= 24) primary.add(last);
  }
  for (const t of (Array.isArray(d.tags) ? d.tags : [])) {
    if (typeof t === 'string' && t.trim() && t.trim().length <= 16) primary.add(t.trim());
  }
  if (Array.isArray(d.aliases)) {
    for (const a of d.aliases) {
      if (typeof a === 'string' && a.trim() && a.trim().length <= 24) primary.add(a.trim());
    }
  }

  // secondary keys：从 data 的描述/摘要/内容切句
  const bodyText = [d.summary, d.desc, d.description, d.content, d.persona, d.note]
    .filter(x => typeof x === 'string').join('。');
  const secondary = _slicePhrases(bodyText, MAX_SECONDARY_KEYS)
    .filter(p => ![...primary].some(pk => pk.includes(p) || p.includes(pk)));

  const all = [...new Set([...primary, ...secondary])];
  if (!all.length && !name) return null; // 无任何可召回标识的节点跳过

  const label = name || _trunc(d.title || d.summary || node.id, 24);
  const content = _trunc(
    [name && `【${type}】${name}`, d.title, d.summary || d.desc || d.description, d.location && `@${d.location}`]
      .filter(Boolean).join(' '), 200);

  return {
    id: node.id,
    _nodeType: type,
    _label: label,
    comment: `[${type}] ${label}`,
    content,
    constant: false,
    disable: false,
    keys: { primary: [...primary], secondary, all },
    updatedAt: Number(node.timestamp || d.updatedAt || 0),
    order: GUARANTEED_TYPES.has(type) ? 10 : 0,
    _guaranteed: GUARANTEED_TYPES.has(type)
  };
}

// ── 图谱 → 候选数组 ─────────────────────────────────────────────────
/**
 * 候选资格 / 相关性粗排 / 最终限额**三层分开**：
 *   ① 资格层：全部可候选化节点都参赛 —— 上限只截「返回给调用方的名单」，不截参赛名单；
 *   ② 保留层：类型白名单节点保底留位（沿用 router 的保底语义，可关）；
 *   ③ 限额层：仍有余位时按「时间强度」补满 —— 时间只当**排序信号**，不再单独决定参赛资格。
 * `opts.includeDeferred = true` 时返回**全部**候选（供调用方自己做相关性粗排与限额）；
 *   此时 `carry.deferred` 仍报「按默认上限本会被挡在评分之外的条数」（有损必有计数）。
 * @param {Array|Map} nodes MemoryGraph.nodes（Map）或其值数组
 * @param {object} opts { maxCandidates, keepGuaranteed, includeDeferred }
 * @returns {Array} 候选条目
 */
function graphToCandidates(nodes, opts = {}, carry = null) {
  const cap = Math.max(1, Number(opts.maxCandidates) || MAX_CANDIDATES);
  const keepGuaranteed = opts.keepGuaranteed !== false;
  const includeDeferred = opts.includeDeferred === true;
  const arr = nodes instanceof Map ? [...nodes.values()] : (Array.isArray(nodes) ? nodes : []);
  const out = [];
  let unmappable = 0;
  for (const n of arr) {
    const c = nodeToCandidate(n);
    if (c) out.push(c); else unmappable++;
  }
  // 按更新时间降序（router: updatedAt 降序 tiebreak），新节点优先
  out.sort((a, b) => (b.updatedAt - a.updatedAt) || (b.order - a.order));
  // [v3.172] 这个截断发生在相关性评分之前——被它丢掉的是「最旧的节点」，
  //   而「最旧」与「最不相关」是两件事。上限此前硬编码且零计数。
  // [v3.249.0] M-O1：把「资格」与「限额」拆开。排序顺序不动（新节点优先，既有契约），
  //   但被上限挡下的节点不再等于「没资格被评分」——调用方可以要全量（includeDeferred）
  //   自己做相关性粗排与限额，本函数的默认返回（cap 条）一字不改。
  const deferred = Math.max(0, out.length - cap);
  let kept;
  let capFill = 0;
  if (includeDeferred) {
    kept = out.slice();
  } else {
    kept = out.slice(0, cap);
    const keptIds = new Set(kept.map(c => c.id));
    // 保留层：类型白名单节点保底留位（仍受总预算约束 —— 只在限额内塞得下时生效）
    if (keepGuaranteed) {
      for (const c of out) {
        if (kept.length >= cap) break;
        if (c._guaranteed && !keptIds.has(c.id)) { kept.push(c); keptIds.add(c.id); capFill++; }
      }
    }
    // 限额层：仍有余位 → 按「时间强度」补足（越旧越低但恒为正；同分同序 ⇒ 确定性）
    if (kept.length < cap) {
      const newest = out.reduce((m, c) => Math.max(m, Number(c.updatedAt) || 0), 0);
      const HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 30;   // 30 天半衰
      const weight = (c) => 1 / (1 + Math.max(0, newest - (Number(c.updatedAt) || 0)) / HALF_LIFE_MS);
      const rest = out.filter(c => !keptIds.has(c.id))
        .sort((a, b) => (weight(b) - weight(a)) || (b.updatedAt - a.updatedAt) || (b.order - a.order));
      for (const c of rest) {
        if (kept.length >= cap) break;
        kept.push(c); keptIds.add(c.id); capFill++;
      }
    }
  }
  if (carry && typeof carry === 'object') {
    carry.nodesTotal = arr.length;
    carry.candsTotal = out.length;
    carry.unmappable = unmappable;
    carry.kept = kept.length;
    carry.dropped = Math.max(0, out.length - kept.length);
    carry.guaranteedKept = kept.filter(c => c._guaranteed).length;
    carry.cap = cap;
    // [v3.249.0] 三层分账读数：deferred = 按默认上限本会被挡在评分之外的条数
    //   （includeDeferred 时 dropped 为 0，而 deferred 仍报真值 ⇒「没丢」与「丢了多少」可分）
    carry.deferred = deferred;
    carry.capFill = capFill;
    carry.includeDeferred = includeDeferred;
  }
  return kept;
}

// ── 保底合并：确保类型白名单节点即使评分低也进入最终候选 ─────────────
/**
 * 把经 ai-select 评分排序的候选与「类型保底」节点合并：保底类型必入，
 * 其余按分数取满 maxTotal。对齐 router recallMemoryCandidates 的保底逻辑。
 * @param {Array} scoredCandidates 经 scoreEntry 评分（带 .score）的候选
 * @param {object} opts { maxTotal=8 }
 * @returns {Array} 合并后的最终入选候选
 */
function mergeWithGuaranteed(scoredCandidates, opts = {}, carry = null) {
  const maxTotal = Math.max(1, Number(opts.maxTotal) || 8);
  const list = (Array.isArray(scoredCandidates) ? scoredCandidates : []).slice();
  // 先按分数降序
  list.sort((a, b) => (b.score || 0) - (a.score || 0) || (b.updatedAt - a.updatedAt));
  const picked = [];
  const seen = new Set();
  // 1) 类型保底优先占位（router 语义：白名单类型即使低分也必入，防高价值结构节点漏召）
  //    按 updatedAt 降序取保底，最多占一半名额，给高分普通条目留位
  const guaranteed = list.filter(c => c._guaranteed).sort((a, b) => b.updatedAt - a.updatedAt);
  const guaranteedCap = Math.max(1, Math.ceil(maxTotal / 2));
  for (const c of guaranteed) {
    if (picked.length < guaranteedCap && !seen.has(c.id)) { picked.push(c); seen.add(c.id); }
  }
  // 2) 有分数的按分补满剩余名额（保底已占的跳过）
  for (const c of list) {
    if (picked.length >= maxTotal) break;
    if ((c.score || 0) > 0 && !seen.has(c.id)) { picked.push(c); seen.add(c.id); }
  }
  // 3) 仍有空位 → 用剩余保底/普通补齐（防候选稀疏时凑不满）
  for (const c of list) {
    if (picked.length >= maxTotal) break;
    if (!seen.has(c.id)) { picked.push(c); seen.add(c.id); }
  }
  // [v3.172] 三个名额来源各自计数：保底占了多少 / 打分入围多少 / 补齐多少。
  //   否则「保底把高分条目挤出去了」这种事在结果长度里看不出来。
  if (carry && typeof carry === 'object') {
    const gPicked = picked.filter(c => c._guaranteed).length;
    carry.total = list.length;
    carry.kept = picked.length;
    carry.dropped = Math.max(0, list.length - picked.length);
    carry.guaranteedPicked = gPicked;
    carry.guaranteedCap = guaranteedCap;
    carry.scoredPicked = Math.max(0, picked.length - gPicked);
    carry.maxTotal = maxTotal;
  }
  return picked;
}

const api = {
  GUARANTEED_TYPES, MAX_CANDIDATES,
  nodeToCandidate, graphToCandidates, mergeWithGuaranteed
};
if (typeof window !== 'undefined') window.LonShaUnifiedRecall = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();