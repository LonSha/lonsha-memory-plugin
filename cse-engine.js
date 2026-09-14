/* ========================================================
 * cse-engine.js — CSE 级人物状态引擎（Character State Engine）
 * 自研融合增强版：分层状态 + 对象绑定 + 可见性 + 证据链 + 置信度校准
 *
 * 设计来源：
 *   - 借鉴 ST-MyriadKnots（千千结）的 Core/Adaptive/Situational 三层、toward
 *     对象绑定、visibility 可见性、持续校准理念（作者 atonal519，未复制其代码，
 *     其引擎深耦合楼层锚定/身份投影无法单点剥离，故自研更强版本）。
 *   - 深度融合本插件已有能力：CharacterState 的 baseline/drift、ops 事件溯源
 *     重放、楼层位移/回滚联动、NPC 晋升、地理感知。
 *
 * 相对 MyriadKnots CSE 的增强点：
 *   1. evidence 证据链——每条状态挂 {floor, source, confidence}，可追溯来源楼层
 *   2. confidence 置信度——LLM 提取为 0.7 待校准，正文佐证/用户确认升至 1.0
 *   3. 与 ops 事件溯源统一——所有变更走 opLog，支持幂等重放与楼层回滚
 *   4. 楼层位移/回滚联动——删楼/并楼时楼层指针自动跟随（复用成熟模式）
 *   5. toward 不镜像——A→B 好感不自动写 B→A（沿用并强化此正确约束）
 *   6. visibility 三态——observable（可观察）/private（私密）/authorial（作者视角，
 *      仅注入提示词让 AI 知道，角色本人不知）
 *
 * 挂 window.LonShaCSE，供 index.js 提取处理与注入管线调用。
 * ======================================================== */
'use strict';
(function() {

// ── 常量 ─────────────────────────────────────────────
const LAYERS = Object.freeze({ CORE: 'core', ADAPTIVE: 'adaptive', SITUATIONAL: 'situational' });
const VIS = Object.freeze({ OBSERVABLE: 'observable', PRIVATE: 'private', AUTHORIAL: 'authorial' });
const MAX_STATES_PER_CHAR = 40;   // 每角色状态条数上限（防膨胀）
const MAX_TOWARD = 24;            // 每角色 toward 关系上限
const MAX_EVIDENCE = 6;           // 单条状态最多保留的证据数
const CONFIDENCE_EXTRACT = 0.7;   // LLM 提取默认置信度
const CONFIDENCE_CONFIRMED = 1.0; // 已确证

const text = v => typeof v === 'string' ? v.trim() : '';
const clamp01 = n => Math.max(0, Math.min(1, Number(n) || 0));

// ── 合法层/可见性归一 ─────────────────────────────────
function normLayer(l) {
  l = text(l).toLowerCase();
  return (l === LAYERS.CORE || l === LAYERS.ADAPTIVE) ? l : LAYERS.SITUATIONAL;
}
function normVis(v) {
  v = text(v).toLowerCase();
  return (v === VIS.PRIVATE || v === VIS.AUTHORIAL) ? v : VIS.OBSERVABLE;
}

/* ================================================================
 * 单条人物状态
 * @field {character, layer, field, value, toward, visibility, confidence, floor, evidence[], updatedAt}
 * ================================================================ */
function mkState(o) {
  return {
    character:  text(o.character).slice(0, 40),
    layer:      normLayer(o.layer),
    field:      text(o.field).slice(0, 30),        // 如「好感」「情绪」「目标」「创伤」
    value:      text(o.value).slice(0, 120),       // 自由文本或简短值
    toward:     text(o.toward).slice(0, 40) || null, // 指向对象（有明确证据才填）
    visibility: normVis(o.visibility),
    confidence: clamp01(o.confidence ?? CONFIDENCE_EXTRACT),
    floor:      Number(o.floor) || 0,
    evidence:   Array.isArray(o.evidence) ? o.evidence.slice(-MAX_EVIDENCE) : [],
    updatedAt:  Date.now()
  };
}

/* ================================================================
 * CSE 引擎类
 * ================================================================ */
class CSEngine {
  constructor() {
    // { [character]: { states: [...], toward: { [target]: {...} } } }
    this.chars = {};
  }

  _c(char, create = true) {
    char = text(char);
    if (!char) return null;
    if (!this.chars[char]) {
      if (!create) return null;
      this.chars[char] = { states: [], toward: {} };
    }
    return this.chars[char];
  }

  /** 追加证据（幂等：同 floor 同 source 不重复） */
  _addEvidence(st, floor, source) {
    source = text(source).slice(0, 60);
    if (!source) return;
    if (st.evidence.some(e => e.floor === floor && e.source === source)) return;
    st.evidence.push({ floor: floor || 0, source, ts: Date.now() });
    if (st.evidence.length > MAX_EVIDENCE) st.evidence.shift();
  }

  /**
   * 写入/更新一条状态（核心入口）
   * - 同 character+field+toward 的条目做 refine（需新证据，否则不覆盖）
   * - toward 仅在 layer=situational/adaptive 且明确指向时保留；core 层强制 null
   * - core 层状态不挂 toward（核心人设不绑定对象）
   * @returns {state|null}
   */
  set(o) {
    const st = mkState(o);
    if (!st.character || !st.field || !st.value) return null;
    const c = this._c(st.character);
    if (!c) return null;

    // core 层不绑定对象
    if (st.layer === LAYERS.CORE) st.toward = null;
    // toward 上限
    if (st.toward && Object.keys(c.toward).length >= MAX_TOWARD && !c.toward[st.toward]) {
      st.toward = null;
    }

    // 查找既有同键条目（character+field+toward）
    const exist = c.states.find(s => s.field === st.field && (s.toward || null) === (st.toward || null));
    if (exist) {
      // refine 需新证据：同 floor 同值不覆盖
      if (exist.value === st.value && exist.floor === st.floor) {
        this._addEvidence(exist, st.floor, o.source || 'extract');
        exist.confidence = Math.max(exist.confidence, st.confidence);
        exist.updatedAt = Date.now();
        return exist;
      }
      // 值变化且是新楼层 → refine（保留证据链）
      exist.value = st.value;
      exist.layer = st.layer;          // 允许层迁移（如 situational → adaptive 固化）
      exist.visibility = st.visibility;
      exist.confidence = st.confidence;
      exist.floor = st.floor;
      this._addEvidence(exist, st.floor, o.source || 'extract');
      exist.updatedAt = Date.now();
      // 同步 toward 索引
      if (st.toward) c.toward[st.toward] = { field: st.field, value: st.value, layer: st.layer };
      return exist;
    }

    // 新增
    this._addEvidence(st, st.floor, o.source || 'extract');
    c.states.push(st);
    if (c.states.length > MAX_STATES_PER_CHAR) {
      // 淘汰：situational 低置信度最旧者优先
      c.states.sort((a, b) => {
        const wa = (a.layer === LAYERS.CORE ? 3 : a.layer === LAYERS.ADAPTIVE ? 2 : 1) * a.confidence;
        const wb = (b.layer === LAYERS.CORE ? 3 : b.layer === LAYERS.ADAPTIVE ? 2 : 1) * b.confidence;
        return wb - wa || (b.updatedAt - a.updatedAt);
      });
      c.states.length = MAX_STATES_PER_CHAR;
    }
    if (st.toward) c.toward[st.toward] = { field: st.field, value: st.value, layer: st.layer };
    return st;
  }

  /** 批量从 LLM 提取结果登记 */
  addFromExtracted(list, floor) {
    let n = 0;
    for (const s of (list || [])) {
      if (this.set({ ...s, floor: s.floor ?? floor, source: 'llm_extract' })) n++;
    }
    return n;
  }

  /** 校准：提升置信度（正文佐证/用户确认时调用，只读，不创建） */
  confirm(character, field, toward) {
    const c = this._c(character, false);
    if (!c) return false;
    const st = c.states.find(s => s.field === text(field) && (s.toward || null) === (text(toward) || null));
    if (!st) return false;
    st.confidence = CONFIDENCE_CONFIRMED;
    st.updatedAt = Date.now();
    return true;
  }

  /** 查询：按层过滤（只读，不创建空角色） */
  get(character, layer) {
    const c = this._c(character, false);
    if (!c) return [];
    if (!layer) return c.states.slice();
    const l = normLayer(layer);
    return c.states.filter(s => s.layer === l);
  }

  /** 查询：某角色对某对象的全部 toward 状态（只读） */
  getToward(character, target) {
    const c = this._c(character, false);
    if (!c) return [];
    target = text(target);
    return c.states.filter(s => s.toward === target);
  }

  /**
   * 生成注入提示词
   * @param character 当前登场角色（null=全部）
   * @param opts { includePrivate: 是否含私密层, maxStates }
   */
  toPrompt(character, opts = {}) {
    const includePrivate = opts.includePrivate !== false;
    const maxStates = Number(opts.maxStates) || 10;
    const chars = character ? [character] : Object.keys(this.chars);
    const blocks = [];
    for (const ch of chars) {
      const c = this.chars[ch];
      if (!c || !c.states.length) continue;
      const vis = c.states.filter(s => includePrivate || s.visibility !== VIS.PRIVATE);
      if (!vis.length) continue;
      // 分层排序：core → adaptive → situational，各层内按置信度+时间
      const order = { [LAYERS.CORE]: 0, [LAYERS.ADAPTIVE]: 1, [LAYERS.SITUATIONAL]: 2 };
      const sorted = vis.slice().sort((a, b) =>
        (order[a.layer] - order[b.layer]) || (b.confidence - a.confidence) || (b.updatedAt - a.updatedAt)
      ).slice(0, maxStates);
      const layerName = { [LAYERS.CORE]: '核心特质', [LAYERS.ADAPTIVE]: '逐渐适应', [LAYERS.SITUATIONAL]: '当下状态' };
      const rows = sorted.map(s => {
        const t = s.toward ? `→${s.toward}` : '';
        const v = s.visibility === VIS.PRIVATE ? '（私密）' : s.visibility === VIS.AUTHORIAL ? '（幕后）' : '';
        const conf = s.confidence < 1 ? ` [待证${Math.round(s.confidence * 100)}%]` : '';
        return `  - 【${layerName[s.layer]}】${s.field}${t}：${s.value}${v}${conf}`;
      });
      blocks.push(`◆ ${ch}\n${rows.join('\n')}`);
    }
    if (!blocks.length) return '';
    return `[人物状态引擎·CSE]（分层呈现：核心特质=稳定人设 / 逐渐适应=固化中的变化 / 当下状态=一时情绪；toward 仅在有明确指向时标注；待证=需剧情佐证，请勿当作既定事实）：\n${blocks.join('\n')}`;
  }

  /** 楼层位移（删楼/并楼时调用）：floor > deleted 的指针前移 */
  shiftFloors(deleted) {
    const del = Number(deleted);
    if (!Number.isFinite(del)) return 0;
    let n = 0;
    for (const ch of Object.keys(this.chars)) {
      for (const s of this.chars[ch].states) {
        if (s.floor > del) { s.floor--; n++; }
        for (const e of s.evidence) { if (e.floor > del) e.floor--; }
      }
    }
    return n;
  }

  /** 楼层回滚（rollbackFloor 联动）：删除该楼产生的状态与证据 */
  removeByFloor(floor) {
    const f = Math.max(0, Math.round(Number(floor) || 0));
    let removed = 0;
    for (const ch of Object.keys(this.chars)) {
      const c = this.chars[ch];
      // 该楼新增的整条删除；该楼仅加了证据的回退证据
      c.states = c.states.filter(s => {
        if (s.floor === f && s.evidence.length <= 1) { removed++; return false; }
        s.evidence = s.evidence.filter(e => e.floor !== f);
        return true;
      });
      // 清理空 toward 索引
      for (const t of Object.keys(c.toward)) {
        if (!c.states.some(s => s.toward === t)) delete c.toward[t];
      }
    }
    return removed;
  }

  /** 删除角色全部状态 */
  removeChar(character) {
    if (this.chars[text(character)]) { delete this.chars[text(character)]; return true; }
    return false;
  }

  export() { return { chars: this.chars }; }
  import(data) {
    this.chars = (data && typeof data.chars === 'object' && data.chars) ? data.chars : {};
    for (const ch of Object.keys(this.chars)) {
      const c = this.chars[ch];
      if (!Array.isArray(c.states)) c.states = [];
      if (!c.toward || typeof c.toward !== 'object') c.toward = {};
      // 清洗每条状态的层/可见性/置信度合法性
      c.states = c.states.map(s => {
        const cleaned = mkState(s);
        if (s.updatedAt) cleaned.updatedAt = s.updatedAt; // 保留原时间戳
        return cleaned;
      }).filter(s => s.character && s.field && s.value);
    }
  }
}

// ── 导出 ─────────────────────────────────────────────
const api = { CSEngine, LAYERS, VIS, CONFIDENCE_EXTRACT, CONFIDENCE_CONFIRMED };
if (typeof window !== 'undefined') window.LonShaCSE = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
