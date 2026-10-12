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
/* [M3-O2] 检索面与展示面**分离**：展示摘要仍 200 字（既有契约不动），检索文本保留完整正文。
 *   为什么必须分：候选层的损失无法被后续任何评分/精排挽回——评分只能排它拿到的候选。
 *   「超过 200 字才出现的关键结论」在候选化那一刻就已经不存在了，之后的 rerank 再准也没用。 */
const SEARCH_TEXT_MAX = 4000;
const EVIDENCE_SENTENCE_MAX = 120;
const EVIDENCE_BUDGET_DEFAULT = 3;
/* 保护面：截断不得切断否定词与数额。
 *   「他不想还钱」截成「他想还钱」是语义反转；「欠 3 万」截成「欠 3」是数额失真。
 *   两者都不是「少了一点信息」，而是「信息变错」——比不记更糟。 */
const NEGATION_RE = /[不没未别莫勿无非否拒绝停止取消戒]/;
const AMOUNT_RE = /\d+(?:\.\d+)?\s*(?:万|千|百|亿|元|块|角|分|两|斤|公斤|米|公里|岁|年|月|日|天|小时|分钟|秒|%|％|成|倍|个|件|条|次|人|口|名|层|楼)/;
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
function nodeToCandidate(node, opts = {}) {
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
  // [M3-O2] 切句条数可放宽（默认 8 保持既有契约）：短语只是 secondary 面，
  //   检索文本另有完整正文兜底，故放宽与否不改变「展示摘要 200 字」这一条。
  const _secCap = Math.max(MAX_SECONDARY_KEYS, Math.min(64, Number(opts.maxSecondaryKeys) || 0));
  const secondary = _slicePhrases(bodyText, _secCap)
    .filter(p => ![...primary].some(pk => pk.includes(p) || p.includes(pk)));

  const all = [...new Set([...primary, ...secondary])];
  if (!all.length && !name) return null; // 无任何可召回标识的节点跳过

  const label = name || _trunc(d.title || d.summary || node.id, 24);
  const content = _trunc(
    [name && `【${type}】${name}`, d.title, d.summary || d.desc || d.description, d.location && `@${d.location}`]
      .filter(Boolean).join(' '), 200);
  /* [M3-O2] 结构化关键字段索引：身份 / 时间 / 关系 / 结果四类。
   *   修前这四类里只有身份与时间进了 primary，**关系与结果字段在候选层就已消失**——
   *   检索文本里也没有，于是「谁把东西给了谁」「最后谈成了什么」这类结论永远召不回。
   *   这里把它们并进检索文本（不动 keys，以免改变既有评分口径），并按类别单独留一份可读索引。 */
  const _pick = (keys) => keys
    .map(k => (typeof d[k] === 'string' ? d[k].trim() : ''))
    .filter(Boolean);
  const indexFields = {
    identity: [...new Set([name, d.title, ...(Array.isArray(d.aliases) ? d.aliases : [])].filter(x => typeof x === 'string' && x.trim()))],
    time: _pick(['timeSpan', 'date', 'storyTime', 'at', 'floor']),
    relation: _pick(['relation', 'relationFrom', 'relationTo', 'related', 'counterpart']),
    outcome: _pick(['result', 'outcome', 'effect', 'conclusion', 'status'])
  };
  const searchText = _trunc([
    name && '【' + type + '】' + name, d.title, d.summary || d.desc || d.description,
    d.content, d.persona, d.note, d.location && '@' + d.location,
    Array.isArray(d.tags) ? d.tags.join(' ') : '',
    Array.isArray(d.path) ? d.path.join(' ') : '',
    indexFields.time.join(' '), indexFields.relation.join(' '), indexFields.outcome.join(' ')
  ].filter(Boolean).join(' '), SEARCH_TEXT_MAX);
  /* [M3-O2] 完整源 ref：候选被选中后要能回到出处（计划点名「保留完整源 ref」）。
   *   没有它，注入面只能给一句摘要，用户问「这条从哪来」时无从回答。 */
  const sourceRef = {
    id: node.id != null ? String(node.id) : '',
    floor: (d.floor != null ? d.floor : (node.floor != null ? node.floor : null)),
    revision: (d.revision != null ? d.revision : (node.revision != null ? node.revision : null)),
    eventId: String(d.eventId || d.event || node.eventId || ''),
    group: String(d.group || d.thread || ''),
    branchId: String(d.branchId || node.branchId || ''),
    source: String(d.source || node.source || ''),
    path: Array.isArray(d.path) ? d.path.map(String) : []
  };

  return {
    id: node.id,
    _nodeType: type,
    _label: label,
    comment: `[${type}] ${label}`,
    content,
    searchText,
    sourceRef,
    indexFields,
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
    const c = nodeToCandidate(n, opts);
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


// ── [M3-O2b] 查询词提取：中文按 2-4 字滑窗切，与 ai-select.extractQueryTerms 同口径 ──
/**
 * 为什么不能直接用 /[\u4e00-\u9fa5]{2,}/g：中文没有空格，那会把「她签约了吗」
 *   整体当一个词，正文里永远不命中 —— 实测中「按查询词挑证据句」直接失效。
 * 与 ai-select 的既有分词口径保持一致（段长 > 6 才滑窗），不另立第二套真源。
 */
function _queryTerms(text) {
  const t = String(text == null ? '' : text)
    .toLowerCase()
    .replace(/[，。！？；：、"'【】（）()<>《》·…—~`^$|\\/[\]{}@#%&*+=_-]/g, ' ');
  const out = new Set();
  for (const seg of t.split(/\s+/)) {
    if (!seg || seg.length < 2) continue;
    if (/^[a-z0-9]+$/.test(seg)) { out.add(seg); continue; }
    if (seg.length <= 6) out.add(seg);
    for (let L = 4; L >= 2; L--) {
      for (let i = 0; i + L <= seg.length; i++) out.add(seg.slice(i, i + L));
    }
  }
  return [...out].slice(0, 48);
}

// ── [M3-O2] 安全截断：不切断否定词与数额 ─────────────────────────────
/**
 * 把 s 截到 n 字以内，且**不切断**否定词与数额。
 * 为什么需要：「他不想还钱」截成「他想还钱」是语义反转，「欠 3 万」截成「欠 3」是数额失真。
 * 返回 { text, cut, guarded }：guarded 表示因保护面而提前收窄（可归因，不是静默变化）。
 */
function _safeTruncate(s, n) {
  const t = String(s == null ? '' : s);
  const cap = Math.max(8, Number(n) || 0);
  if (t.length <= cap) return { text: t, cut: false, guarded: false };
  let cut = t.slice(0, cap);
  let guarded = false;
  if (NEGATION_RE.test(cut.slice(-1)) || /\d$/.test(cut.slice(-1))) {
    const m = cut.match(/^[\s\S]*[，,、]/);
    if (m && m[0].length >= Math.max(4, Math.floor(cap * 0.4))) {
      cut = m[0].replace(/[，,、]$/, '');
      guarded = true;
    }
  }
  return { text: cut, cut: true, guarded: guarded };
}

// ── [M3-O2] 证据句提取：按任务预算取句，保护否定与数额 ────────────────
/**
 * 从完整正文里按查询词与任务预算挑出证据句（不是把整段原文塞进注入面）。
 * 完整原文留在 searchText 供检索，进上下文的是它挑出来的句子——「完整原文不全量注入」。
 * @param {string} text 完整检索文本
 * @param {string} queryText 本轮查询文本
 * @param {object} opts { budget=3, maxLen=120 }
 */
function extractEvidenceSentences(text, queryText, opts) {
  const o = opts || {};
  const raw = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  const budget = Math.max(1, Number(o.budget) || EVIDENCE_BUDGET_DEFAULT);
  const maxLen = Math.max(20, Number(o.maxLen) || EVIDENCE_SENTENCE_MAX);
  const out = { text: '', sentences: [], total: 0, dropped: 0, guarded: 0, cut: 0 };
  if (!raw) return out;
  const parts = raw.split(/[。！？；!?;]+/).map(x => x.trim()).filter(Boolean);
  out.total = parts.length;
  if (!parts.length) return out;
  const terms = _queryTerms(queryText);
  const scored = parts.map((s, k) => {
    let sc = 0;
    for (const t of terms) if (s.indexOf(t) >= 0) sc += t.length >= 3 ? 3 : 2;
    const neg = NEGATION_RE.test(s);
    const amt = AMOUNT_RE.test(s);
    if (neg) sc += 1;                    // 否定句优先保留（最容易被截断读反）
    if (amt) sc += 1;                    // 数额句优先保留
    if (neg && amt) sc += 1;
    return { s: s, i: k, sc: sc };
  });
  scored.sort((a, b) => (b.sc - a.sc) || (a.i - b.i));   // 同分按原文顺序（确定性）
  const picked = scored.slice(0, budget).sort((a, b) => a.i - b.i);   // 输出回原文顺序
  out.dropped = Math.max(0, parts.length - picked.length);
  for (const p of picked) {
    const r = _safeTruncate(p.s, maxLen);
    if (r.cut) out.cut++;
    if (r.guarded) out.guarded++;
    out.sentences.push(r.text);
  }
  out.text = out.sentences.join('。');
  return out;
}

// ── [M3-O2] 事件级去重：同一事件的多节点不重复占预算 ──────────────────
/**
 * 计划点名「同一事件多节点不会重复占预算」。键取 sourceRef 的事件标识
 *   （eventId / group / thread），**没有键的节点一律保留**——
 *   「没有事件标识」不等于「属于同一个事件」，把无键项并成一堆是静默丢弃。
 * @param {Array} cands 候选（可带 score）
 */
function dedupeByEvent(cands, opts, carry) {
  const list = Array.isArray(cands) ? cands : [];
  const best = new Map();
  const noKey = [];
  let keyed = 0;
  for (const c of list) {
    const r = (c && c.sourceRef) || {};
    const k = String(r.eventId || r.group || r.thread || '').trim();
    if (!k) { noKey.push(c); continue; }
    keyed++;
    const prev = best.get(k);
    if (!prev) { best.set(k, c); continue; }
    const a = Number(c.score) || 0, b = Number(prev.score) || 0;
    if (a > b || (a === b && (Number(c.updatedAt) || 0) > (Number(prev.updatedAt) || 0))) best.set(k, c);
  }
  const kept = [...best.values(), ...noKey];
  if (carry && typeof carry === 'object') {
    carry.evTotal = list.length;
    carry.evKeyed = keyed;
    carry.evEvents = best.size;
    carry.evNoKey = noKey.length;
    carry.evDropped = Math.max(0, keyed - best.size);
  }
  return kept;
}

const api = {
  GUARANTEED_TYPES, MAX_CANDIDATES,
  nodeToCandidate, graphToCandidates, mergeWithGuaranteed,
  extractEvidenceSentences, dedupeByEvent
};
if (typeof window !== 'undefined') window.LonShaUnifiedRecall = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();