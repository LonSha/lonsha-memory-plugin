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
    // [v3.167] 容量账本。容量上限本身没问题，问题是**上限在看不见的地方改写了条目身份**：
    //   淘汰（条目消失）与降级（有向变无向）此前都不留痕，调用方只看见「set 没返回 null」。
    //   四个计数器全部并入 opLog 与 selfCheck 诊断行，让「谁被丢、谁被拒、谁自愈」可见。
    //     inserted      真正落进 store 的新条目数
    //     refined       命中既有条目并更新/累积证据的次数
    //     evicted       被 MAX_STATES_PER_CHAR 挤出 store 的条目数
    //     rejected      因身份约束（toward 超限）被明确拒绝的写入数（替代静默降级）
    //     ghostReclaimed 索引与 states 脱钩后自愈回收的幽灵键数
    this.ledger = { inserted: 0, refined: 0, evicted: 0, rejected: 0, ghostReclaimed: 0 };
    this.lastReject = null;
    this.lastExtractReport = null;
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

  /**
   * [v3.167] toward 索引与 states 的单一同源收口。
   *
   * 不变量 I2：Object.keys(c.toward) ⊆ { s.toward | s ∈ c.states 且 s.toward }
   *
   * 修前 toward 索引只有「加」没有「清」：写入路径就地 `c.toward[st.toward] = {...}`，
   * 而容量淘汰路径（c.states.length 截断）直接把 states 里的条目丢了，索引键留在原地。
   * 幽灵键有两个后果，都不是报错能发现的：
   *   ① 虚占 MAX_TOWARD 配额——真实关系被挡在门外（这正是「幽灵挤占容量」）；
   *   ② 任何读索引的一方（诊断、面板、后续版本）会看到一个 store 里并不存在的对象。
   *
   * 收口方式：从 states 重建索引，所有写入 / 淘汰 / 删除 / 导入路径都必须过这里。
   * 同 target 命中多条时保留 updatedAt 最新的一条（与写入路径「后写覆盖」语义一致）。
   *
   * @returns {number} 本次回收的幽灵键数
   */
  _reindexTargets(c) {
    if (!c || !c.toward || typeof c.toward !== 'object') return 0;
    const live = {};
    for (const s of (c.states || [])) {
      const t = (s && s.toward) ? text(s.toward) : '';
      if (!t) continue;
      const prev = live[t];
      if (!prev || (s.updatedAt || 0) >= prev.updatedAt) {
        live[t] = { field: s.field, value: s.value, layer: s.layer, updatedAt: s.updatedAt || 0 };
      }
    }
    let reclaimed = 0;
    for (const t of Object.keys(c.toward)) if (!live[t]) reclaimed++;
    c.toward = live;
    this.ledger.ghostReclaimed += reclaimed;
    return reclaimed;
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
   *
   * [v3.167] 返回形状保持不变（state|null），但**成功语义被收紧**：
   *   返回非 null ⇔ 该条目此刻真实存在于 store（不变量 I1）。
   *   修前「非 null」只代表「set 走完了」，不代表「东西还在」——容量淘汰会在
   *   回报之后把新写入的低置信度条目挤掉（D1）。
   *   需要区分 新增/精炼/被淘汰/被拒绝 的调用方请用 setDetailed()。
   * @returns {state|null}
   */
  set(o) { return this.setDetailed(o).state; }

  /**
   * [v3.167] 带回报的写入——容量/截断面的唯一写入口。
   *
   * 三处缺陷共享同一后果：**调用方收到的回报与 store 真实内容不一致**。
   *   D1 淘汰发生在回报之后：新写入的低置信度 situational 条目（权重 0.3）
   *      会被自己挤出去，而 set() 仍返回该对象。
   *   D2 toward 超限静默降级：有向状态被改写成无向，**条目身份被容量上限改写**，
   *      且无计数器、无日志、返回值看不出任何差异。
   *   D3 降级必然撞键：降级出的 (field, toward=null) 与本就无向的同名字段条目
   *      命中同一个 find 键 → 走 refine → 两条语义不同的状态被合并成一条。
   *
   * 修复后的处置顺序（**语义优先**）：回收幽灵 → 判容量 → 落进去 或 明确拒绝。
   * 关键取舍：toward 超限时**拒绝**而不是降级——降级是把「A 对 B 有明确指向」
   * 偷换成「A 的状态」，这是语义级失真，不是丢数据；宁可这条不进 store，
   * 也不能让 store 里出现一条身份被改写的条目。
   *
   * @returns {Object} {state: state|null, status: 'inserted'|'refined'|'unchanged'|'evicted'|'rejected'|'invalid',
   *            reason?: string, evicted?: state|null}
   */
  setDetailed(o) {
    const st = mkState(o);
    if (!st.character || !st.field || !st.value) return { state: null, status: 'invalid', reason: 'empty_field' };
    const c = this._c(st.character);
    if (!c) return { state: null, status: 'invalid', reason: 'empty_character' };
    // core 层不绑定对象
    if (st.layer === LAYERS.CORE) st.toward = null;
    // [v3.167] ① 先回收幽灵，再判容量。顺序很重要：修前淘汰留下的索引键会虚占
    //   MAX_TOWARD 配额，让「配额已满」这个判断基于一组并不存在的对象。
    this._reindexTargets(c);
    // [v3.167] ② toward 容量：语义优先，拒绝而非降级（详见方法头注释 D2/D3）。
    //   注意只在「该 target 尚不存在」时判容量：更新既有关系不增加键数，不该被拒。
    if (st.toward && !c.toward[st.toward] && Object.keys(c.toward).length >= MAX_TOWARD) {
      this.ledger.rejected++;
      this.lastReject = { character: st.character, field: st.field, toward: st.toward, floor: st.floor, reason: 'toward_capacity', ts: Date.now() };
      return { state: null, status: 'rejected', reason: 'toward_capacity' };
    }
    // 查找既有同键条目（character+field+toward）。
    // 降级被禁止后，撞键窗口随之关闭：带 toward 的请求要么带着 toward 落进去
    // （键里含 toward，不会与无向条目相撞），要么在上一行被拒（根本不进入查找）。
    const exist = c.states.find(s => s.field === st.field && (s.toward || null) === (st.toward || null));
    if (exist) {
      // refine 需新证据：同 floor 同值不覆盖
      if (exist.value === st.value && exist.floor === st.floor) {
        this._addEvidence(exist, st.floor, o.source || 'extract');
        exist.confidence = Math.max(exist.confidence, st.confidence);
        exist.updatedAt = Date.now();
        this._reindexTargets(c);
        this.ledger.refined++;
        return { state: exist, status: 'unchanged' };
      }
      // 值变化且是新楼层 → refine（保留证据链）
      exist.value = st.value;
      exist.layer = st.layer;          // 允许层迁移（如 situational → adaptive 固化）
      exist.visibility = st.visibility;
      exist.confidence = st.confidence;
      exist.floor = st.floor;
      this._addEvidence(exist, st.floor, o.source || 'extract');
      exist.updatedAt = Date.now();
      // 同步 toward 索引（收口，不再就地写键）
      this._reindexTargets(c);
      this.ledger.refined++;
      return { state: exist, status: 'refined' };
    }
    // 新增
    this._addEvidence(st, st.floor, o.source || 'extract');
    c.states.push(st);
    this.ledger.inserted++;
    let evicted = null;
    if (c.states.length > MAX_STATES_PER_CHAR) {
      // 淘汰：situational 低置信度最旧者优先
      c.states.sort((a, b) => {
        const wa = (a.layer === LAYERS.CORE ? 3 : a.layer === LAYERS.ADAPTIVE ? 2 : 1) * a.confidence;
        const wb = (b.layer === LAYERS.CORE ? 3 : b.layer === LAYERS.ADAPTIVE ? 2 : 1) * b.confidence;
        return wb - wa || (b.updatedAt - a.updatedAt);
      });
      evicted = c.states[MAX_STATES_PER_CHAR] || null;
      c.states.length = MAX_STATES_PER_CHAR;
      if (evicted) this.ledger.evicted++;
    }
    // [v3.167] ③ 索引收口放在淘汰**之后**：修前这一行在淘汰之后执行，但淘汰丢掉的
    //   条目留下的旧索引键不会被清（幽灵键），且 sort 打乱顺序后索引描述可能停在旧值。
    this._reindexTargets(c);
    // [v3.167] ④ 回报必须与 store 一致（不变量 I1）：刚写进去的条目若当场被自己挤掉，
    //   就不能回报成功，否则调用方按返回值计数时账目与 store 出现缺口。
    if (!c.states.includes(st)) {
      return { state: null, status: 'evicted', reason: 'states_capacity', evicted };
    }
    return { state: st, status: 'inserted', evicted };
  }
  /** 批量从 LLM 提取结果登记 */
  addFromExtracted(list, floor) {
    let n = 0;
    // [v3.167] 返回值保持 number（调用方 index.js 按它计数并写 opLog）。
    //   但容量面的账目必须单独留痕：修前这里只数「set 没返回 null」，
    //   被当场淘汰、被 toward 上限静默降级的条目完全不体现在任何地方。
    const rep = { attempted: (list || []).length, inserted: 0, refined: 0, evicted: 0, rejected: 0, rejectedSamples: [] };
    for (const s of (list || [])) {
      const r = this.setDetailed({ ...s, floor: s.floor ?? floor, source: 'llm_extract' });
      if (r.status === 'inserted') rep.inserted++;
      else if (r.status === 'refined' || r.status === 'unchanged') rep.refined++;
      else if (r.status === 'evicted') rep.evicted++;
      else if (r.status === 'rejected') {
        rep.rejected++;
        if (rep.rejectedSamples.length < 3) rep.rejectedSamples.push(text(s?.character) + '\u00b7' + text(s?.field) + '\u2192' + text(s?.toward));
      }
      if (r.state) n++;
    }
    this.lastExtractReport = rep;
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
      // 清理空 toward 索引（[v3.167] 归口到单一同源收口，与写入/淘汰路径同一函数）
      this._reindexTargets(c);
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
      // [v3.167] 导入即收口：存档里的 toward 索引可能来自修前的淘汰/删除路径，
      //   带幽灵键；不清的话幽灵会跨设备随存档一路传下去（且虚占配额）。
      this._reindexTargets(c);
    }
  }
  /**
   * [v3.167] 容量/截断面诊断（供 selfCheck 渲染）。
   *
   * 修前 CSE 在 selfCheck 的近 20 行子系统统计里**一行都没有**——于是
   * 「有状态在看不见的地方被丢弃 / 身份被改写」这件事没有任何用户可见出口，
   * 而 CSE 恰恰是全插件唯一会主动丢弃已写入数据的子系统。
   * 诊断永不抛出（selfCheck 的既有约定）。
   */
  diagnose() {
    let chars = 0, states = 0, towardKeys = 0, ghosts = 0, nearCapChars = 0;
    try {
      for (const ch of Object.keys(this.chars)) {
        const c = this.chars[ch];
        if (!c || !Array.isArray(c.states)) continue;
        chars++;
        states += c.states.length;
        const live = {};
        for (const s of c.states) if (s && s.toward) live[text(s.toward)] = 1;
        const liveN = Object.keys(live).length;
        towardKeys += liveN;
        if (c.toward && typeof c.toward === 'object') {
          for (const t of Object.keys(c.toward)) if (!live[t]) ghosts++;
        }
        if (c.states.length >= MAX_STATES_PER_CHAR) nearCapChars++;
      }
    } catch (e) { /* 诊断不得抛出 */ }
    return {
      chars, states, towardKeys, ghosts, nearCapChars,
      ledger: Object.assign({}, this.ledger),
      lastReject: this.lastReject ? Object.assign({}, this.lastReject) : null,
      lastExtractReport: this.lastExtractReport ? Object.assign({}, this.lastExtractReport) : null,
      caps: { states: MAX_STATES_PER_CHAR, toward: MAX_TOWARD, evidence: MAX_EVIDENCE }
    };
  }
}

// ── 导出 ─────────────────────────────────────────────
const api = { CSEngine, LAYERS, VIS, CONFIDENCE_EXTRACT, CONFIDENCE_CONFIRMED };
if (typeof window !== 'undefined') window.LonShaCSE = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
