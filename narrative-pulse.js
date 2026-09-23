/* ========================================================
 * narrative-pulse.js — 叙事心电图（Narrative Pulse）
 * 【完全原创·LonSha 独有】叙事节奏与情感结构分析引擎
 *
 * 创作动机（补全的独有空白）：
 *   现有 35 个类全部在建模「记忆与事实」——记住了什么、谁在场、
 *   时间几何、矛盾何在。但没有任何系统在回答一个所有记忆插件
 *   （含 MyriadKnots）都没回答的问题：「这段故事写得怎么样？」
 *   本引擎补全「叙事美学与情感结构」这一独有维度。
 *
 * 核心原则：零额外 API 消耗——纯文本启发式 + 复用现成数据
 *   （events.importance / SuspenseBook 悬念簿 / narrativeEntropy 熵值），
 *   不抢主模型与提取 LLM 的调用额度。
 *
 * 四大能力：
 *   1. 情感极性曲线  中文情感词典极性扫描，追踪剧情情绪走向（喜/悲/惧/怒/暖/悬）
 *   2. 张力节奏计    事件重要度×冲突×悬念负荷合成张力值，画最近 N 楼心电图
 *   3. 角色弧光阶段  单角色情感/关系/目标轨迹拟合「启程→历练→蜕变→归真」弧光
 *   4. 自反性叙事建议 检测连续高压（ burnout ）/连续平淡（ stagnation ），
 *                     提示主模型该放缓呼吸拍或该掀起波澜——这是元叙事自反馈
 *
 * 挂 window.LonShaNarrativePulse，供 index.js 提取/注入/诊断使用。
 * ======================================================== */
'use strict';
(function() {

// ── 情感极性词典（中文，按六维情绪分组，词 → 强度权重）─────────────
// 原创整理：面向角色扮演/小说叙事语境，兼顾古今文体。权重 1~3。
const EMO_LEXICON = {
  joy:   { 笑:1, 喜:2, 欢:2, 甜:1, 温柔:2, 幸福:3, 开心:2, 快乐:2, 欣慰:2, 安心:2, 温暖:2, 悸动:2, 心动:2, 亲吻:2, 拥抱:1, 撒娇:2, 调笑:1, 莞尔:1, 宠溺:2, 缠绵:2 },
  sad:   { 泪:2, 哭:2, 泣:2, 悲伤:3, 难过:2, 心痛:3, 绝望:3, 失落:2, 孤独:2, 寂寞:2, 遗憾:2, 愧疚:2, 自责:2, 心碎:3, 呜咽:2, 哀:2, 凄凉:2, 黯然:2, 牺牲:3, 离别:2 },
  fear:  { 怕:1, 恐惧:3, 惊:2, 颤抖:2, 发抖:2, 慌:2, 不安:2, 寒意:2, 毛骨悚然:3, 战栗:2, 退缩:2, 畏惧:2, 胆寒:2, 梦魇:2, 阴影:2 },
  anger: { 怒:2, 愤:2, 吼:2, 咆哮:2, 憎恨:3, 怨恨:3, 暴怒:3, 咬牙切齿:2, 恼火:2, 火大:2, 震怒:3, 恼火至极:3, 愤恨:3, 怒火:2, 恼:1 },
  warm:  { 守护:2, 陪伴:2, 依靠:2, 信任:2, 珍惜:2, 眷恋:2, 牵挂:2, 心安:2, 归处:2, 家:1, 港湾:2, 承诺:2, 永远:1 },
  tense: { 危机:3, 杀意:3, 对决:2, 冲突:2, 阴谋:2, 背叛:3, 陷阱:2, 追击:2, 逼近:2, 压迫:2, 窒息:2, 绝境:3, 死斗:3, 悬念:2, 揭穿:2, 真相:2, 秘密:1 }
};
// 六维 → 极性分值（正=上扬，负=下沉）与张力贡献
const EMO_POLARITY = { joy: 1, warm: 0.8, sad: -0.6, fear: -0.7, anger: -0.5, tense: 0 };
const EMO_TENSION  = { joy: 0, warm: 0, sad: 0.5, fear: 0.9, anger: 0.8, tense: 1 };
/* ── 情绪反向召回映射（负面情绪 → 与之相对的那一面）─────────────────────
 * 机制来源：memory-palace（badcode1024-tech/sillytavern-long-term-memory）的
 *   EMOTION_OPPOSITES + matchEmotion 反向分支。
 *   **只取机制，不取注入口径**：该库靠 CHAT_COMPLETION_PROMPT_READY 直接向 chat
 *   推 system 消息做注入，与本仓 setExtensionPrompt 的路线不同，本仓不引入那条路线。
 *
 * 词表本土化（关键）：原库是 17 个「情绪形容词 → 相对正面词」映射，其词汇面与本仓
 *   EMO_LEXICON 不重合——照搬会得到一批 scanEmotion 永远扫不到的词，反向线索恒空，
 *   看着接上了、实际零命中。故这里**按本仓词表重写**：键取 sad/fear/anger/tense
 *   四维的负面词，值取 joy/warm 两维的词；每个值都能被 scanEmotion 扫到，
 *   反向线索与词典共用同一份事实（测试逐词核对归属，漂移即响）。
 *
 * 语义：负面情绪在场时，与之相对的那一面也该被想起来——
 *   难过时想起温柔相待，恐惧时想起安然相伴，愤怒时想起珍惜与眷恋，绝境里想起承诺。
 *   与 memory-palace 的立意一致：冲突当下把「对方的好」一并带进上下文。
 * 保守取舍：只列语义明确的词；未列入者不贡献反向线索（宁可不触发，也不乱触发）。
 */
const EMOTION_OPPOSITES = {
  // sad 维 → 相对正面
  悲伤: ['笑', '欢', '温柔', '幸福', '开心', '快乐', '欣慰', '安心', '温暖', '甜', '拥抱', '撒娇'],
  难过: ['温柔', '安心', '陪伴', '温暖', '笑', '幸福', '拥抱'],
  心痛: ['温柔', '幸福', '陪伴', '安心', '珍惜', '温暖'],
  绝望: ['信任', '承诺', '守护', '陪伴', '归处', '温暖'],
  失落: ['欣慰', '开心', '陪伴', '安心', '甜'],
  孤独: ['陪伴', '拥抱', '依靠', '港湾', '归处', '温暖'],
  寂寞: ['陪伴', '眷恋', '牵挂', '心安', '依靠'],
  遗憾: ['珍惜', '眷恋', '牵挂', '承诺', '温暖'],
  愧疚: ['安心', '信任', '温柔', '欣慰', '依靠'],
  心碎: ['温柔', '守护', '陪伴', '珍惜', '心安'],
  离别: ['眷恋', '牵挂', '承诺', '珍惜', '陪伴'],
  牺牲: ['守护', '承诺', '珍惜', '信任', '眷恋'],
  // fear 维 → 相对正面
  恐惧: ['安心', '心安', '守护', '陪伴', '信任', '依靠', '归处', '温暖'],
  不安: ['安心', '心安', '信任', '依靠', '陪伴', '温暖'],
  畏惧: ['守护', '信任', '依靠', '陪伴', '心安'],
  胆寒: ['温暖', '陪伴', '心安', '守护'],
  寒意: ['温暖', '拥抱', '陪伴'],
  梦魇: ['安心', '心安', '温柔', '陪伴'],
  阴影: ['温暖', '守护', '信任', '陪伴'],
  // anger 维 → 相对正面
  憎恨: ['温柔', '莞尔', '宠溺', '珍惜', '笑'],
  怨恨: ['温柔', '莞尔', '安心', '珍惜', '眷恋'],
  暴怒: ['温柔', '莞尔', '宠溺', '安心'],
  恼火: ['温柔', '莞尔', '宠溺', '撒娇', '笑'],
  愤恨: ['温柔', '珍惜', '安心', '宠溺'],
  怒火: ['温柔', '莞尔', '安心', '宠溺'],
  震怒: ['温柔', '莞尔', '安心', '依靠'],
  // tense 维 → 相对正面
  危机: ['陪伴', '信任', '承诺', '守护', '依靠', '心安'],
  背叛: ['信任', '守护', '承诺', '珍惜'],
  绝境: ['承诺', '守护', '信任', '陪伴', '归处'],
  窒息: ['温暖', '安心', '陪伴', '心安'],
  压迫: ['温暖', '守护', '陪伴', '依靠'],
  杀意: ['守护', '温柔', '信任', '安心'],
  死斗: ['守护', '承诺', '陪伴', '信任'],
};

const text = v => typeof v === 'string' ? v : '';
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));

/* ================================================================
 * 情感极性扫描器：对一段文本算六维情绪得分 → 综合极性 + 张力
 * ================================================================ */
/* ── [v3.193.0] 情绪证据的「作用域」与可信度 ────────────────────────────
 * 为什么需要：同一句话出现在不同位置，意义完全不同——
 *   「她不难过」里的难过不是难过；「他曾经很怕」是回忆不是当下；
 *   A 说「我恨他」不该让 B 的记忆被反向提权；用户引用一段文本更不该触发。
 * 本层只做一件事：给每条命中标注它出现在什么位置，并给出可信度。
 *   不重写引擎、不新建词表——词表仍是原来那一份。
 *
 * 引号配对只认成对的中文/全角引号：「」『』“”‘’。直角引号与英文引号不参与配对：
 *   英文引号在正文里大量作撇号/所有格出现，误配对会把整段正文判成引用区间。
 */
const EMO_SCOPE_TRUST = { direct: 1, recalled: 0.3, other: 0.2, quoted: 0.2, system: 0, negated: 0 };
// 反向召回只消费 >= 该阈值的证据。阈值 0.5 是刻意的：
//   只有 direct（当前人物直接表达）够格。回忆(0.3)/他述(0.2)/引用(0.2) 都在线下——
//   计划点名的失败模式正是「他曾经恐惧」被当成现在恐惧、「A 的悲伤影响 B」。
const EMO_SCOPE_MIN_TRUST = 0.5;
// 否定词：命中词前 2 字内含其一即不计分（「她不难过」「没在害怕」「不再孤独」）
const EMO_NEGATION = ['不', '没', '别', '未', '无', '非', '莫', '甭', '勿'];
// 时间/回忆标记与句末标点（用于文本级「回忆」识别）
const EMO_RECALL_MARKERS = ['曾经', '当年', '那时', '那时候', '记得', '回忆起', '回想', '以前', '从前', '过去', '小时候', '想起'];
const EMO_SENTENCE_END = ['。', '！', '？', '；', '\n'];
function _isRecalled(txt, at) {
  const from = Math.max(0, at - 12);
  const win = txt.slice(from, at);
  const cut = Math.max(...EMO_SENTENCE_END.map((c) => win.lastIndexOf(c)));
  const seg = cut >= 0 ? win.slice(cut + 1) : win;
  return EMO_RECALL_MARKERS.some((m) => seg.includes(m));
}
function _isNegated(txt, at) {
  for (let k = Math.max(0, at - 2); k < at; k++) {
    if (EMO_NEGATION.includes(txt[k])) return true;
  }
  return false;
}
const EMO_QUOTE_PAIRS = [['「', '」'], ['『', '』'], ['“', '”'], ['‘', '’']];

function _quoteMask(txt) {
  const n = txt.length;
  const mask = new Uint8Array(n);
  for (const [lo, hi] of EMO_QUOTE_PAIRS) {
    let open = -1;
    for (let i = 0; i < n; i++) {
      const ch = txt[i];
      if (ch === lo) { if (open < 0) open = i; }
      else if (ch === hi) {
        if (open >= 0) { for (let k = open; k <= i; k++) mask[k] = 1; open = -1; }
      }
    }
    // 未闭合的引号：不把整段尾部吞成引用（宁可不标，也不误杀正文）
  }
  return mask;
}
// 词表按长度降序：长词优先消费，短子串不再重复计分（v3.193.0 修）
function _buildWordIndex() {
  const out = [];
  for (const dim of Object.keys(EMO_LEXICON)) {
    for (const [word, w] of Object.entries(EMO_LEXICON[dim])) out.push({ dim, word, w, len: word.length });
  }
  out.sort((a, b) => b.len - a.len || a.word.localeCompare(b.word, 'zh'));
  return out;
}
const EMO_WORD_INDEX = _buildWordIndex();

function scanEmotion(txt, opts = {}) {
  txt = text(txt);
  opts = opts || {};
  const scores = { joy: 0, sad: 0, fear: 0, anger: 0, warm: 0, tense: 0 };
  const trustedScores = { joy: 0, sad: 0, fear: 0, anger: 0, warm: 0, tense: 0 };
  const evidence = [];
  const byScope = {};
  const hits = [];   // 每命中一条：{ dim, word, at, scope, trusted }（位置是归因的唯一原料）
  const empty = () => ({
    scores, trustedScores, polarity: 0, tension: 0, dominant: null,
    trustedDominant: null, trustedPolarity: 0, evidence, byScope, credibleWords: 0, hits,
  });
  if (!txt) return empty();
  // 引用区间（成对引号内的内容）
  const quoted = _quoteMask(txt);
  // 上下文区间：opts.contexts = [{ text, kind }]，kind 默认 recalled（回忆/他述）
  const ctxKind = new Array(txt.length).fill('');
  for (const c of (Array.isArray(opts.contexts) ? opts.contexts : [])) {
    const t = text(c && c.text);
    const kind = text(c && c.kind) || 'recalled';
    if (!t) continue;
    let i = 0;
    while ((i = txt.indexOf(t, i)) !== -1) {
      for (let k = i; k < i + t.length && k < txt.length; k++) ctxKind[k] = kind;
      i += t.length;
    }
  }
  const consumed = new Uint8Array(txt.length);
  let credibleWords = 0;
  for (const c of EMO_WORD_INDEX) {
    let i = 0, cnt = 0, tcnt = 0;
    const scopes = {};
    while ((i = txt.indexOf(c.word, i)) !== -1) {
      const end = i + c.len;
      let free = true;
      for (let k = i; k < end; k++) if (consumed[k]) { free = false; break; }
      if (free) {
        for (let k = i; k < end; k++) consumed[k] = 1;
        cnt++;
        // 判档顺序：否定 > 引用 > 上下文（回忆/他述）> 直接表达
        // 判档顺序：否定 > 引用 > 上下文（回忆/他述）> 文本级回忆标记 > 直接表达
        const sc = _isNegated(txt, i) ? 'negated'
          : (quoted[i] ? 'quoted'
            : (ctxKind[i] || (_isRecalled(txt, i) ? 'recalled' : 'direct')));
        scopes[sc] = (scopes[sc] || 0) + 1;
        byScope[sc] = (byScope[sc] || 0) + 1;
        const _trusted = (EMO_SCOPE_TRUST[sc] || 0) >= EMO_SCOPE_MIN_TRUST;
        if (_trusted) { tcnt++; credibleWords++; }
        if (hits.length < 400) hits.push({ dim: c.dim, word: c.word, at: i, scope: sc, trusted: _trusted });
      }
      // 关键（v3.193.0）：无论是否计入，都跳过整个词宽——
      //   否则「暴怒」里的「怒」会被再计一次，anger 虚高并可能抢走主导维
      i = end;
    }
    if (cnt) {
      const capped = Math.min(cnt, 4);
      const tcapped = Math.min(tcnt, 4);
      scores[c.dim] += c.w * capped;              // 单词最多计 4 次防爆
      trustedScores[c.dim] += c.w * tcapped;
      evidence.push({ dim: c.dim, word: c.word, count: capped, weight: c.w, trustedCount: tcapped, scopes });
    }
  }
  let pol = 0, ten = 0, total = 0;
  for (const dim of Object.keys(scores)) {
    pol += scores[dim] * EMO_POLARITY[dim];
    ten += scores[dim] * EMO_TENSION[dim];
    total += scores[dim];
  }
  const polarity = total ? clamp(pol / total, -1, 1) : 0;
  const tension = clamp(ten / 12, 0, 1); // 经验归一
  // 主导情绪
  let dominant = null, best = 0;
  for (const dim of Object.keys(scores)) if (scores[dim] > best) { best = scores[dim]; dominant = dim; }
  evidence.sort((a, b) => (b.weight * b.count) - (a.weight * a.count) || a.word.localeCompare(b.word, 'zh'));
  // 可信维：只用 >= EMO_SCOPE_MIN_TRUST 的证据重算主导维与极性
  let tPol = 0, tTen = 0, tTotal = 0, tDom = null, tBest = 0;
  for (const dim of Object.keys(trustedScores)) {
    const sc = trustedScores[dim];
    tPol += sc * EMO_POLARITY[dim];
    tTen += sc * EMO_TENSION[dim];
    tTotal += sc;
    if (sc > tBest) { tBest = sc; tDom = dim; }
  }
  const trustedPolarity = tTotal ? clamp(tPol / tTotal, -1, 1) : 0;
  return {
    scores, trustedScores, polarity, tension, dominant, evidence, byScope, credibleWords, hits,
    trustedDominant: tTotal ? tDom : null, trustedPolarity,
  };
}
/* ================================================================
 * 某一情绪维的「相对的那一面」词表并集：由该维的负面词经 EMOTION_OPPOSITES 汇出。
 *   空数组 = 该维没有反向词（如 joy/warm 本身是正面维，不作为线索来源）。
 * ================================================================ */

/* ================================================================
 * 情绪证据分层：把一拍的分数还原成「哪些词、哪一维、命中几次」
 *   旧拍只存 polarity / tension / dominant。同一个分数可以来自完全不同的词，
 *   读数看不出分数的依据。这里不重扫正文、不新建词表：只读拍上已经记下的命中。
 *   旧存档没有 evidence 字段时按空层读，不把缺失伪装成「这一拍没有情绪」。
 *   layer = 'scored' 有命中词；'missing' 是旧拍；'none' 是新拍但词典零命中。
 * ================================================================ */
function emotionEvidence(beat) {
  const empty = { layer: 'none', hits: [], byDim: {}, strongest: null };
  if (!beat || typeof beat !== 'object') return empty;
  if (!Array.isArray(beat.evidence)) return { layer: 'missing', hits: [], byDim: {}, strongest: null };
  const hits = [];
  const byDim = {};
  for (const raw of beat.evidence) {
    const dim = text(raw && raw.dim);
    const word = text(raw && raw.word);
    const weight = Number(EMO_LEXICON[dim] && EMO_LEXICON[dim][word]) || 0;
    const count = Math.max(0, Math.min(4, Math.round(Number(raw && raw.count) || 0)));
    if (!weight || !count) continue;
    const score = weight * count;
    const hit = { dim, word, count, weight, score };
    hits.push(hit);
    (byDim[dim] || (byDim[dim] = [])).push(hit);
  }
  hits.sort((a, b) => b.score - a.score || a.word.localeCompare(b.word, 'zh'));
  return { layer: hits.length ? 'scored' : 'none', hits, byDim, strongest: hits[0] || null };
}
function opposedWordsFor(dim) {
  const out = new Set();
  for (const w of Object.keys(EMO_LEXICON[dim] || {})) {
    for (const p of (EMOTION_OPPOSITES[w] || [])) out.add(p);
  }
  return [...out];
}
/* ================================================================
 * 情绪反向召回：本轮负面情绪在场 ⇒ 挑出「与之相对的那一面」的文档
 *
 * 为什么**只做反向、不做正向**（与本仓既有 BM25 的分工纪律）：
 *   正向线索（本轮难过 ⇒ 挑含「难过」的摘要）与 BM25 完全重叠——查询文本自带
 *   「难过」，BM25 本来就会命中含该词的摘要，再加一条提权只是把同一件事做两遍，
 *   没有独立增量。真正**没有任何通道覆盖**的是反向：查询里是「难过」，
 *   而该想起的是写着「温柔/陪伴」的那几段——它们与查询毫无字面交集，
 *   BM25 抓不到（向量能抓一部分，但依赖 Embedding 且不稳定）。
 *   故本机制只产反向线索：量小、增量明确、可解释。
 *
 * 为什么主导维为 tense/正面时不出线索：EMO_POLARITY[tense] === 0，
 *   它表示「氛围紧」而不是「情绪倾向」；紧张戏里几乎所有事都算数，挑出来等于没挑。
 * 为什么只取主导维：多维多张词表会把命中面撑得过大（一次带几十条提权名单，
 *   等于把候选池重排一遍，收益不明而风险实在）。主导维只取一条，可解释、可读。
 * 为什么不复用 _crosslinkIndex.refsFor：那把键只答「该 ref 是否被登记过」，
 *   与文本扫词无关（登记 ref ≠ 该摘要命中该词）；此处文档即候选全集，
 *   词表扫描可当场得出，另建索引只会多一份状态要同步。
 *
 * 读数纪律（三态必须可分，否则「没接上」与「接上了但本轮无事」同形）：
 *   reason = 'empty'    没有查询文本或没有候选文档——函数根本没开始判断
 *          = 'no-emotion' 扫不到任何情绪词（词典未覆盖或文本确实无情绪）
 *          = 'no-polarity' 有主导维（如 tense）但极性为 0——是氛围不是情绪倾向
 *          = 'no-opposites' 词典里该维没配反向词（配置缺失，不是世界没情绪）
 *          = 'ok'       真做了反向扫描（此时 scanned 才有意义）
 *   实测教训：初版在「tense 主导」时于赋值 dominant 之前就返回，读数呈现
 *   `dominant: null` ——与「一个词都没扫到」完全同形，等于把这条判据做哑了。
 * 纯函数：不碰全局、不写状态，输入输出皆可单测。
 * @param opts { queryText 查询文本, docs [{key, text}], max 最多收几条 }
 * @returns { active, reason, dominant, polarity, opposite[], scanned }
 * ================================================================ */
/* ================================================================
 * 多角色情绪归属（v3.193.0）
 * ----------------------------------------------------------------
 * 为什么需要：scanEmotion 回答的是「这段文本整体什么情绪」。剧情里一句话常有两个人
 * 的情绪（A 打翻水杯后 B 在笑、A 在哭），整体主导维由词数决定，于是反向召回取哪张
 * 词表就跟「谁在难过」脱钩——A 的悲伤被拿去给 B 配「陪伴/温暖」的线索。
 *
 * 归因规则（保守优先，宁可承认查不出来）：
 *   ① 只用**可信**命中（回忆/引用/否定/他述里的情绪词不归任何人，见 EMO_SCOPE_TRUST）
 *   ② 在同一句内（不跨 EMO_SENTENCE_END）向前找最近的已登记角色名，距离不超过 window
 *   ③ 找不到 ⇒ 计入 unattributed。**绝不默认归给第一个角色**——
 *      默认归属会把「查不出来」伪装成「查出来了」，比不归因更坏。
 * 纯函数：不写状态、不抛。
 * @param txt 文本
 * @param opts { characters 已登记角色名[], window 向前最大字符距离(默认 30) }
 * @returns { perChar: {名: {dims,count,dominant,trustedWords}}, unattributed, order }
 * ================================================================ */
function attributeEmotion(txt, opts = {}) {
  const t = text(txt);
  const chars = (Array.isArray(opts.characters) ? opts.characters : [])
    .map((c) => text(c)).filter(Boolean);
  const win = Math.max(1, Number(opts.window) || 30);
  const perChar = {};
  const unattributed = { count: 0, dims: {}, dominant: null, trustedWords: 0 };
  if (!t || !chars.length) {
    const emo0 = scanEmotion(t);
    return { perChar, unattributed, order: [], noCharacters: chars.length === 0, total: emo0.hits.length };
  }
  const emo = scanEmotion(t);
  const bump = (box, h) => {
    box.dims[h.dim] = (box.dims[h.dim] || 0) + 1;
    box.count++;
    box.trustedWords++;
  };
  const sentence = (a, b) => {
    const seg = t.slice(a, b);
    for (const end of EMO_SENTENCE_END) if (seg.includes(end)) return false;
    return true;
  };
  const order = [];
  for (const h of emo.hits) {
    if (!h.trusted) continue;                       // 规则①：不可信的不归任何人
    let owner = null, bestAt = -1, bestName = '';
    for (const c of chars) {                        // 规则②：同句内最近的前置角色名
      const at = t.lastIndexOf(c, Math.max(0, h.at - 1));
      if (at < 0) continue;
      if (h.at - (at + c.length) > win) continue;
      if (!sentence(at + c.length, h.at)) continue;
      if (at > bestAt || (at === bestAt && c.length > bestName.length)) { bestAt = at; owner = c; bestName = c; }
    }
    if (!owner) { bump(unattributed, h); continue; } // 规则③：查不出来就承认
    if (!perChar[owner]) { perChar[owner] = { dims: {}, count: 0, dominant: null, trustedWords: 0 }; order.push(owner); }
    bump(perChar[owner], h);
  }
  for (const k of Object.keys(perChar)) {
    let b = 0, d = null;
    for (const dim of Object.keys(perChar[k].dims)) if (perChar[k].dims[dim] > b) { b = perChar[k].dims[dim]; d = dim; }
    perChar[k].dominant = d;
  }
  {
    let b = 0, d = null;
    for (const dim of Object.keys(unattributed.dims)) if (unattributed.dims[dim] > b) { b = unattributed.dims[dim]; d = dim; }
    unattributed.dominant = d;
  }
  return { perChar, unattributed, order, noCharacters: false, total: emo.hits.length };
}
function recallByOppositeEmotion(opts = {}) {
  const out = {
    active: false, reason: 'empty', dominant: null, polarity: 0, opposite: [], scanned: 0,
    dimHits: {}, matched: {}, matchedSeen: 0, expanded: 0, merged: 0, maxPerDim: 0, credibleWords: 0, scopes: {},
  };
  const q = text(opts.queryText);
  const docs = Array.isArray(opts.docs) ? opts.docs : [];
  if (!q || !docs.length) return out;
  const emo = scanEmotion(q);
  out.scopes = emo.byScope || {};
  out.credibleWords = emo.credibleWords || 0;
  const dom = emo.trustedDominant;                       // [v3.193.0] 只认可信维，不认全量维
  if (!emo.dominant) { out.reason = 'no-emotion'; return out; }
  if (!dom) {
    // 有情绪词、但全在回忆/引用/否定/他述里——不能出线索（计划点名的四类误触发）
    out.reason = 'no-trusted';
    out.dominant = emo.dominant;
    return out;
  }
  const pol = Number(EMO_POLARITY[dom]) || 0;
  if (pol >= 0) { out.reason = 'no-polarity'; out.dominant = dom; return out; }
  // 多负面维合并：可信负面维按可信分排序，全部参与（命中两维的文档只出现一次）
  const negDims = Object.keys(emo.trustedScores)
    .filter((d2) => (Number(EMO_POLARITY[d2]) || 0) < 0 && emo.trustedScores[d2] > 0)
    .sort((a, b) => emo.trustedScores[b] - emo.trustedScores[a]);
  const dimWords = negDims.map((d2) => ({ dim: d2, words: opposedWordsFor(d2) })).filter((x) => x.words.length);
  if (!dimWords.length) { out.reason = 'no-opposites'; out.dominant = dom; return out; }
  out.active = true;
  out.reason = 'ok';
  out.dominant = dom;
  out.polarity = pol;
  const maxN = Math.max(1, Number(opts.max) || 5);
  const maxPerDim = Math.max(1, Number(opts.maxPerDim) || maxN);
  out.maxPerDim = maxPerDim;
  const seen = new Set();
  for (const { dim, words } of dimWords) {
    let taken = 0;
    for (const d of docs) {
      const k = String((d && d.key) || '');
      const t = text(d && d.text);
      if (!k || !t) continue;
      if (!words.some((w) => t.includes(w))) continue;
      out.dimHits[dim] = (out.dimHits[dim] || 0) + 1;    // 命中即记（含被预算挡下、含已由别维收下）
      if (seen.has(k)) {                                 // 已由别的维收下：合并，不重复占额
        if (out.matched[k] && !out.matched[k].includes(dim)) out.matched[k].push(dim);
        out.merged++;                                    // 账目闭合：跨维重复命中（候选膨胀的分母）
        continue;
      }
      if (taken >= maxPerDim || out.opposite.length >= maxN) { out.expanded++; continue; }
      seen.add(k);
      out.opposite.push(k);
      out.matched[k] = [dim];
      out.matchedSeen++;
      taken++;
    }
  }
  for (const d of docs) {                                // scanned 仍是「看了多少条」，与预算无关
    const k = String((d && d.key) || '');
    if (k && text(d && d.text)) out.scanned++;
  }
  return out;
}

/* ================================================================
 * 弧光阶段（Arc Phase）：启程→历练→低谷→蜕变→归真
 * ================================================================ */
const ARC_PHASES = ['启程', '历练', '低谷', '蜕变', '归真'];

/* ================================================================
 * NarrativePulse 引擎
 * ================================================================ */
class NarrativePulse {
  constructor() {
    this.beats = [];        // 每楼一拍：{ floor, polarity, tension, dominant, arcHint, importance, ts }
    this.MAX_BEATS = 120;   // 保留最近 120 拍（约覆盖中长剧情）
    this.arcs = {};         // { [character]: { polarityTrail: [], phase, phaseFloor } }
  }

  /**
   * 记录一楼（核心入口，onMessageReceived 调用）
   * @param floor 楼号
   * @param opts { mesText 正文文本, events 提取事件[], suspenseCount 当前悬念数, characters 登场角色[] }
   */
  beat(floor, opts = {}) {
    const emo = scanEmotion(opts.mesText || '');
    // 事件重要度加成（高重要度事件推升张力）
    let impBoost = 0, maxImp = 0;
    for (const ev of (opts.events || [])) {
      const i = Number(ev?.importance) || 0;
      if (i > maxImp) maxImp = i;
    }
    impBoost = clamp(maxImp / 10, 0, 1);
    // 悬念负荷加成
    const suspenseBoost = clamp((Number(opts.suspenseCount) || 0) / 8, 0, 1);
    // 合成张力：文本情绪张力为主，事件重要度与悬念加成
    const tension = clamp(emo.tension * 0.55 + impBoost * 0.25 + suspenseBoost * 0.20, 0, 1);

    const beat = {
      floor: floor || 0,
      polarity: emo.polarity,
      tension,
      dominant: emo.dominant,
      importance: maxImp,
      evidence: emo.evidence,
      ts: Date.now()
    };
    // 幂等：同楼覆盖
    const exist = this.beats.findIndex(b => b.floor === beat.floor);
    if (exist >= 0) this.beats[exist] = beat; else this.beats.push(beat);
    this.beats.sort((a, b) => a.floor - b.floor);
    if (this.beats.length > this.MAX_BEATS) this.beats.shift();

    // 更新角色弧光（对登场角色各记一笔极性）
    for (const ch of (opts.characters || [])) {
      const c = text(ch).slice(0, 40);
      if (!c) continue;
      if (!this.arcs[c]) this.arcs[c] = { polarityTrail: [], phase: '启程', phaseFloor: 0 };
      const arc = this.arcs[c];
      arc.polarityTrail.push({ floor: beat.floor, polarity: emo.polarity, tension });
      if (arc.polarityTrail.length > 30) arc.polarityTrail.shift();
      arc.phase = this._inferPhase(arc.polarityTrail);
    }
    return beat;
  }

  /** 由极性轨迹推断弧光阶段（原创拟合） */
  _inferPhase(trail) {
    if (!trail || trail.length < 3) return '启程';
    const n = trail.length;
    const seg = k => trail.slice(Math.floor(n * k));
    const avg = arr => arr.reduce((s, x) => s + x.polarity, 0) / (arr.length || 1);
    const avgTen = arr => arr.reduce((s, x) => s + x.tension, 0) / (arr.length || 1);
    const recent = seg(0.6), mid = seg(0.3), early = trail.slice(0, Math.max(1, Math.floor(n * 0.3)));
    const rPol = avg(recent), mPol = avg(mid), rTen = avgTen(recent);
    // 低谷：近期极性显著为负且张力高
    if (rPol < -0.25 && rTen > 0.4) return '低谷';
    // 蜕变：中期低、近期回升（V 形反转）
    if (mPol < -0.1 && rPol > mPol + 0.25) return '蜕变';
    // 归真：近期极性稳定偏正、张力回落
    if (rPol > 0.15 && rTen < 0.4) return '归真';
    // 历练：默认中段（有张力波动）
    if (rTen > 0.3 || avgTen(trail) > 0.3) return '历练';
    return '启程';
  }

  /** 最近 N 拍平均张力/极性 */
  _recentAvg(key, n = 5) {
    const arr = this.beats.slice(-n);
    if (!arr.length) return 0;
    return arr.reduce((s, b) => s + (b[key] || 0), 0) / arr.length;
  }

  /**
   * 自反性叙事诊断（元叙事自反馈，原创核心）
   * @returns { status, advice, streakHigh, streakLow }
   *   status: 'surge'该掀波澜 | 'breath'该放缓呼吸 | 'flow'节奏正常
   */
  diagnose(n = 6) {
    const highTh = 0.66, lowTh = 0.30;
    let streakHigh = 0, streakLow = 0;
    const arr = this.beats.slice(-n);
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].tension >= highTh) streakHigh++; else break;
    }
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].tension <= lowTh) streakLow++; else break;
    }
    let status = 'flow', advice = '';
    if (streakHigh >= 4) {
      status = 'breath';
      advice = `已连续 ${streakHigh} 楼高强度张力（危机/冲突密集）。张弛有度是叙事节奏的关键——建议安排一个「呼吸拍」：日常相处、温情对话、内心沉淀或喜剧插曲，让读者与角色都得以喘息，为下一轮高潮蓄力。`;
    } else if (streakLow >= 5) {
      status = 'surge';
      advice = `已连续 ${streakLow} 楼低张力（剧情偏平淡）。可考虑注入变量：一个新信息、一次意外造访、一项悬而未决的约定到期、或角色内心的一处暗涌，让情节重新获得向前的推力。`;
    }
    return { status, advice, streakHigh, streakLow, avgTension: this._recentAvg('tension', n), avgPolarity: this._recentAvg('polarity', n) };
  }

  /** 角色弧光查询 */
  getArc(character) {
    return this.arcs[text(character)] || null;
  }

  /**
   * 注入提示词（仅在需要时输出：诊断非 flow 或有活跃弧光时）
   * @param opts { characters 当前登场[], force 强制输出, maxArcs }
   */
  toPrompt(opts = {}) {
    const diag = this.diagnose();
    const blocks = [];
    // 节奏建议：仅非 flow 时给（避免每轮噪音）
    if (opts.force || diag.status !== 'flow') {
      blocks.push(`[叙事节奏·自反提示]（元叙事参考，非剧情事实）\n- 当前节奏：${diag.status === 'breath' ? '持续高压' : diag.status === 'surge' ? '偏平淡' : '平稳'}（近楼均张力 ${Math.round(diag.avgTension * 100)}%，极性 ${diag.avgPolarity >= 0 ? '+' : ''}${diag.avgPolarity.toFixed(2)}）\n- ${diag.advice}`);
    }
    // 角色弧光：仅当前登场角色，且已积累足够轨迹
    const chars = opts.characters || [];
    const arcRows = [];
    for (const ch of chars.slice(0, Number(opts.maxArcs) || 4)) {
      const arc = this.getArc(ch);
      if (arc && arc.polarityTrail.length >= 3) {
        arcRows.push(`- ${ch}：弧光阶段「${arc.phase}」（近期情绪 ${arc.polarityTrail.slice(-3).map(x => x.polarity >= 0 ? '↗' : '↘').join('')}）`);
      }
    }
    if (arcRows.length) blocks.push(`[角色弧光·阶段参考]（追踪情感轨迹拟合，辅助把握成长节奏）：\n${arcRows.join('\n')}`);
    return blocks.join('\n\n');
  }

  /** 楼层位移 */
  shiftFloors(deleted) {
    const del = Number(deleted);
    if (!Number.isFinite(del)) return 0;
    let n = 0;
    for (const b of this.beats) if (b.floor > del) { b.floor--; n++; }
    for (const ch of Object.keys(this.arcs)) {
      for (const t of this.arcs[ch].polarityTrail) if (t.floor > del) t.floor--;
    }
    return n;
  }

  /** 楼层回滚 */
  removeByFloor(floor) {
    const f = Math.max(0, Math.round(Number(floor) || 0));
    const before = this.beats.length;
    this.beats = this.beats.filter(b => b.floor !== f);
    for (const ch of Object.keys(this.arcs)) {
      this.arcs[ch].polarityTrail = this.arcs[ch].polarityTrail.filter(t => t.floor !== f);
      if (!this.arcs[ch].polarityTrail.length) delete this.arcs[ch];
    }
    return before - this.beats.length;
  }

  export() { return { beats: this.beats, arcs: this.arcs }; }
  import(data) {
    if (!data || typeof data !== 'object') return;
    this.beats = Array.isArray(data.beats) ? data.beats : [];
    this.arcs = (data.arcs && typeof data.arcs === 'object') ? data.arcs : {};
  }
}

// ── 导出 ─────────────────────────────────────────────
const api = { NarrativePulse, scanEmotion, emotionEvidence, attributeEmotion, recallByOppositeEmotion, opposedWordsFor, ARC_PHASES, EMO_LEXICON, EMOTION_OPPOSITES };
if (typeof window !== 'undefined') window.LonShaNarrativePulse = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();