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

const text = v => typeof v === 'string' ? v : '';
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));

/* ================================================================
 * 情感极性扫描器：对一段文本算六维情绪得分 → 综合极性 + 张力
 * ================================================================ */
function scanEmotion(txt) {
  txt = text(txt);
  const scores = { joy: 0, sad: 0, fear: 0, anger: 0, warm: 0, tense: 0 };
  if (!txt) return { scores, polarity: 0, tension: 0, dominant: null };
  for (const dim of Object.keys(EMO_LEXICON)) {
    for (const [word, w] of Object.entries(EMO_LEXICON[dim])) {
      // 简单包含计数（词频累加），中文无分词依赖
      let idx = 0, cnt = 0;
      while ((idx = txt.indexOf(word, idx)) !== -1) { cnt++; idx += word.length; }
      if (cnt) scores[dim] += w * Math.min(cnt, 4); // 单词最多计 4 次防爆
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
  return { scores, polarity, tension, dominant };
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
const api = { NarrativePulse, scanEmotion, ARC_PHASES, EMO_LEXICON };
if (typeof window !== 'undefined') window.LonShaNarrativePulse = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();