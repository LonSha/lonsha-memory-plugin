/* ========================================================
 * secret-ledger.js — 秘密账本 [v3.196.0]
 * --------------------------------------------------------
 * 伏笔是「还没收的悬念」。秘密是另一类：某个角色此刻绝对不该知道，
 * 揭露必须有出处，不能靠读心或巧合。
 *
 * 纪律（来自秘密档案的状态约束，不搬提示词）：
 *   · 必须点名 keeper（谁还不知道）。没有守密人就拒绝。
 *   · progress 只接受调用方给出的 0–100 整数，不从正文猜。
 *   · 未到 100 禁止 reveal。reveal 必须带 note，说明这一轮怎么被知道。
 *   · 在场名单里出现 keeper 时，禁止把进度推进或标成已揭露。
 *   · 已揭露条目下一回合才清：sweep(floor) 只清 revealedFloor < floor。
 *   · 未揭露最多 MAX_OPEN 条；超额拒绝新秘密，不覆盖旧的。
 * 不推断正文是否真的发生，只接收已经确认的事实。
 * 挂 window.LonShaSecretLedger。
 * ======================================================== */
'use strict';
(function (root) {
  // [v3.207] 账本实体契约单一真源（ledger-entity.js）。取库双通道与 index.js 的 _moduleLib 同形：
  //   浏览器走全局（extra_js 在入口之后加载，故在 IIFE 内**惰性**取，不能构造期缓存）、Node 走 require。
  //   两处写法在六本账里逐字同形，便于常驻门禁按字面量扫描（tests/audit/scan_ledger_contract.mjs）。
  const LE = (typeof window !== 'undefined' && window.LonShaLedgerEntity) ? window.LonShaLedgerEntity
    : ((typeof module !== 'undefined' && module.exports) ? require('./ledger-entity.js') : (root.LonShaLedgerEntity || null));
  if (!LE) throw new Error('[lonsha] ledger-entity.js 未加载：账本实体契约缺真源（查 manifest.extra_js 加载顺序）');
  const ACTIONS = Object.freeze(['seal', 'advance', 'reveal', 'drop']);
  const OPEN = Object.freeze({ sealed: true, advancing: true });
  const MAX_ITEMS = 80;
  const MAX_OPEN = 5;
  const MAX_HISTORY = 8;

  // [v3.207] text / finite / names 由账本实体契约提供（原为六本账各自抄一份，逐字相同）。
  const text = LE.text;
  const finite = LE.finite;
  const finiteFloor = LE.finiteFloor;   // [v3.240.0] floor 一族专用（与 finite 同判据，按名点名）
  const names = (value) => LE.names(value, 40, 8);
  function percent(value) {
    const n = finite(value);
    if (n == null || n < 0 || n > 100) return null;
    return n;
  }
  function copyEvent(event) {
    return {
      action: ACTIONS.includes(event.action) ? event.action : 'advance',
      eventKey: text(event.eventKey, 120),
      floor: finiteFloor(event.floor),
      source: text(event.source, 40),
      note: text(event.note, 120),
      progress: percent(event.progress)
    };
  }
  function copyItem(item) {
    const status = item.status === 'revealed' || item.status === 'dropped' ? item.status
      : (item.status === 'advancing' ? 'advancing' : 'sealed');
    const prog = percent(item.progress);
    return {
      id: text(item.id, 80),
      secret: text(item.secret, 180),
      keeper: names(item.keeper),
      // [v3.306.0 · M-O8] 知情名单随条目走（与 keeper 成对，单份契约）
      knowers: names(item.knowers),
      about: names(item.about),
      progress: prog == null ? 0 : prog,
      status,
      // [v3.207] 修订号读回走契约（`finite(item.revision) || 1` 原为六本账逐字重复）。
      revision: LE.revisionOf(item),
      floor: finiteFloor(item.floor),
      updatedFloor: finiteFloor(item.updatedFloor),
      revealedFloor: finiteFloor(item.revealedFloor),
      source: text(item.source, 40),
      // [v3.207] 历史读回走契约（末 MAX_HISTORY 条 + 逐条 copyEvent）。
      history: LE.copyHistory(item, MAX_HISTORY, copyEvent)
    };
  }
  function clone(state) {
    return {
      version: 1,
      seq: finite(state && state.seq) || 0,
      items: Array.isArray(state && state.items) ? state.items.map(copyItem) : []
    };
  }
  function normalize(raw) {
    const state = clone(raw);
    const seen = new Set();
    state.items = state.items.filter((item) => {
      if (!item.id || !item.secret || !item.keeper.length || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).slice(-MAX_ITEMS);
    return state;
  }
  function nextId(state) {
    state.seq += 1;
    return 'sec_' + state.seq;
  }
  function result(state, extra) {
    return Object.assign({ ok: true, state: normalize(state) }, extra);
  }
  function reject(state, reason) {
    return { ok: false, reason, changed: false, state: normalize(state) };
  }
  // [v3.207] 记一次变更走契约：幂等比对 + push + 截断 + 版本自增 + 戳 updatedFloor。
  //   stampFloor 原样戳 event.floor（**不得**过 finite：null 会被压成 0）。
  function record(item, event) {
    return LE.recordEvent(item, event, { maxHistory: MAX_HISTORY, stampFloor: true });
  }
  function openCount(state) {
    return state.items.filter((item) => OPEN[item.status]).length;
  }
  function find(state, ref) {
    const id = text(ref && ref.id, 80);
    if (id) return state.items.find((item) => item.id === id) || null;
    const secret = text(ref && ref.secret, 180).toLowerCase();
    if (!secret) return null;
    return state.items.find((item) => OPEN[item.status] && item.secret.toLowerCase() === secret) || null;
  }
  function keeperPresent(keeper, present) {
    const here = new Set(names(present).map((name) => name.toLowerCase()));
    if (!here.size) return '';
    return keeper.find((name) => here.has(name.toLowerCase())) || '';
  }

  /* ── [v3.306.0 · M-O8] 秘密的「知识范围」单一真源 ─────────────────────────
   * 为什么另起一套而不是直接用上面的 keeperPresent（**这个决定本身就是本版要治的那类缺陷**）：
   *   `keeperPresent(keeper, present)` 问的是「**守密人在不在场**」—— 它服务写入侧的
   *   三条纪律（advance/reveal 一旦 keeper-present 即拒绝推进/揭露）。
   *   注入侧要问的是**反过来的那一问**：「这个人**知不知道**？」
   *   两者若共用同一份名单，读数**必然同形**（都在场 ⇒ 写侧拒写、读侧也遮蔽），
   *   而那一格恰好是最坏的一格：守密人在场**正是最不能说漏的时刻**，读侧却按同一判据整条抹掉。
   *   所以本版把「谁知道」明确成**两份互不同形的名单**：
   *     keeper  —— 不该知道的人（写侧用；在其中就拒绝写入）；
   *     knowers —— 已经知道的人（读侧用；在其中才允许进模型载荷）。
   *
   * knowledgeOf 三态刻意不同形（本仓口径：缺席 / 空 / 判不了 永不同形）：
   *   'knower'   —— 在册知情者（可进载荷）；
   *   'listed'   —— 条目**给了**知情名单，但此人不在其中（该遮蔽）；
   *   'unlisted' —— 条目**根本没给**知情名单（判不了）。
   *                判不了**不按 listed 处置**（那是猜）：调用方按名单无关的公开面兜底，
   *                并把「判不了」单独计进读数 —— 绝不静默当成「都没听说」。
   * 名单比较一律先过 names()（去重 + 长度截断），再小写归一，
   *   与 keeperPresent 同口径；不清洗大小写会让「阿绣」与「阿繡」互不识别。
   */
  function listHas(list, who) {
    const w = text(who, 40).toLowerCase();
    if (!w) return false;
    return names(list).some((x) => x.toLowerCase() === w);
  }
  function knowledgeOf(item, who) {
    if (!item || typeof item !== 'object') return 'unlisted';
    const knowers = names(item.knowers);
    if (!knowers.length) return 'unlisted';
    return listHas(knowers, who) ? 'knower' : 'listed';
  }
  /* 秘密的知识范围过滤 —— 注入 / 诊断 / 下游导出**共用这一个口**（单一真源）。
   * 与 X6 `branch-semantics.filterByKeeper`、X5 `volume-continuation.filterByKeeper`
   *   **同口径同目的**（那两处治「跨支混入」，本处治「同支内混入」）；
   *   改名不为风格，为**指明对象**（秘密的边界由 knowers 划定，不是由 keeper 划定）。
   * viewer 为空 ⇒ 只见公开面（未给知情名单的条目），
   *   **不得**因「不知道看的人是谁」就全放行（与 X6 filterByKeeper 逐字同口径）。
   * 剔除一律计数可见（分三档）—— 静默少条会让「被挡住」读成「本来就没有」。 */
  function filterForViewer(items, viewer) {
    const list = Array.isArray(items) ? items : [];
    const vw = text(viewer, 40);
    const visible = [];
    let withheld = 0, known = 0, notKnower = 0, undecided = 0;
    for (const it of list) {
      const k = knowledgeOf(it, vw);            // 'knower' | 'listed' | 'unlisted'
      const pass = vw ? (k === 'knower') : (k === 'unlisted');
      if (pass) {
        visible.push(it);
        if (k === 'knower') known++;
        continue;
      }
      withheld++;
      if (k === 'unlisted') undecided++;         // 判不了：单独一档，不与「挡下」同形
      else notKnower++;                          // 名单在册但没他 / 无 viewer 而条目有名单
    }
    return { visible, withheld, known, notKnower, undecided, total: list.length };
  }

  function seal(rawState, input) {
    const state = normalize(rawState);
    const secret = text(input && input.secret, 180);
    const keeper = names(input && input.keeper);
    if (!secret) return reject(state, 'missing-secret');
    if (!keeper.length) return reject(state, 'missing-keeper');
    /* [v3.306.0 · M-O8] 知情名单（读侧边界）。与 keeper 是**两份名单**：
     *   keeper = 还不知情的人（写侧纪律用）；knowers = 已经知道的人（读侧边界用）。
     *   缺省空 ⇒ 该条在读侧按「未给名单」（unlisted）处理：不进角色载荷，
     *   由调用方按名单无关的公开面兜底并把「判不了」计进读数。 */
    const knowers = names(input && input.knowers);
    const given = input && input.progress != null && input.progress !== '';
    const progress = percent(input && input.progress);
    if (given && progress == null) return reject(state, 'bad-progress');
    if (progress === 100) return reject(state, 'reveal-required');
    const eventKey = text(input && input.eventKey, 120);
    const existing = state.items.find((item) => OPEN[item.status] && item.secret.toLowerCase() === secret.toLowerCase());
    if (existing) {
      /* 知情名单只**追加**不覆盖：后到的提取轮次补「谁也已经知道了」，
       *   一次漏填的轮次不得把已经建立的知情事实清空。 */
      if (knowers.length) existing.knowers = names((existing.knowers || []).concat(knowers));
      const replayed = !eventKey || existing.history.some((event) => event.eventKey === eventKey);
      if (eventKey && !replayed) record(existing, { action: 'seal', eventKey, floor: finiteFloor(input && input.floor), source: text(input && input.source, 40), note: '', progress: existing.progress });
      return result(state, { item: copyItem(existing), replayed, changed: !replayed });
    }
    if (openCount(state) >= MAX_OPEN) return reject(state, 'open-cap');
    const item = copyItem({
      id: nextId(state), secret, keeper, knowers, about: input && input.about,
      progress: progress == null ? 0 : progress, status: 'sealed', revision: LE.REVISION.CREATE,
      floor: input && input.floor, updatedFloor: input && input.floor,
      revealedFloor: null, source: input && input.source, history: []
    });
    record(item, { action: 'seal', eventKey, floor: item.floor, source: item.source, note: '', progress: item.progress });
    state.items.push(item);
    return result(state, { item: copyItem(item), replayed: false, changed: true });
  }

  function advance(rawState, input) {
    const state = normalize(rawState);
    const item = find(state, input);
    if (!item) return reject(state, 'not-found');
    if (!OPEN[item.status]) return result(state, { item: copyItem(item), replayed: true, changed: false, reason: 'terminal' });
    const progress = percent(input && input.progress);
    if (progress == null) return reject(state, 'bad-progress');
    if (progress >= 100) return reject(state, 'reveal-required');
    if (progress < item.progress) return reject(state, 'progress-back');
    if (keeperPresent(item.keeper, input && input.present) && progress > item.progress) return reject(state, 'keeper-present');
    const noteText = text(input && input.note, 120);
    if (!noteText) return reject(state, 'empty-note');
    const event = {
      action: 'advance', eventKey: text(input && input.eventKey, 120), floor: finiteFloor(input && input.floor),
      source: text(input && input.source, 40), note: noteText, progress
    };
    if (!record(item, event)) return result(state, { item: copyItem(item), replayed: true, changed: false });
    item.progress = progress;
    item.status = 'advancing';
    return result(state, { item: copyItem(item), replayed: false, changed: true });
  }

  function reveal(rawState, input) {
    const state = normalize(rawState);
    const item = find(state, input);
    if (!item) return reject(state, 'not-found');
    if (!OPEN[item.status]) return result(state, { item: copyItem(item), replayed: true, changed: false, reason: 'terminal' });
    const noteText = text(input && input.note, 120);
    if (!noteText) return reject(state, 'empty-note');
    if (keeperPresent(item.keeper, input && input.present)) return reject(state, 'keeper-present');
    const event = {
      action: 'reveal', eventKey: text(input && input.eventKey, 120), floor: finiteFloor(input && input.floor),
      source: text(input && input.source, 40), note: noteText, progress: 100
    };
    if (!record(item, event)) return result(state, { item: copyItem(item), replayed: true, changed: false });
    item.progress = 100;
    item.status = 'revealed';
    item.revealedFloor = event.floor;
    return result(state, { item: copyItem(item), replayed: false, changed: true });
  }

  function drop(rawState, input) {
    const state = normalize(rawState);
    const item = find(state, input);
    if (!item) return reject(state, 'not-found');
    if (!OPEN[item.status]) return result(state, { item: copyItem(item), replayed: true, changed: false, reason: 'terminal' });
    const noteText = text(input && input.note, 120);
    if (!noteText) return reject(state, 'empty-note');
    const event = {
      action: 'drop', eventKey: text(input && input.eventKey, 120), floor: finiteFloor(input && input.floor),
      source: text(input && input.source, 40), note: noteText, progress: item.progress
    };
    if (!record(item, event)) return result(state, { item: copyItem(item), replayed: true, changed: false });
    item.status = 'dropped';
    item.revealedFloor = event.floor;
    return result(state, { item: copyItem(item), replayed: false, changed: true });
  }

  function remove(rawState, ref) {
    const state = normalize(rawState);
    const item = find(state, ref) || state.items.find((it) => it.id === text(ref && ref.id, 80));
    if (!item) return reject(state, 'not-found');
    if (OPEN[item.status]) return reject(state, 'open-locked');
    state.items = state.items.filter((it) => it.id !== item.id);
    return result(state, { item: copyItem(item), removed: true, changed: true });
  }

  function sweep(rawState, floor) {
    const state = normalize(rawState);
    const f = finiteFloor(floor);
    if (f == null) return reject(state, 'missing-floor');
    const before = state.items.length;
    state.items = state.items.filter((item) => {
      if (OPEN[item.status]) return true;
      if (item.revealedFloor == null) return true;
      return item.revealedFloor >= f;
    });
    return result(state, { swept: before - state.items.length, changed: state.items.length !== before });
  }

  function list(rawState, filter) {
    const state = normalize(rawState);
    const status = text(filter && filter.status, 20);
    return state.items.filter((item) => {
      if (status === 'unrevealed') return !!OPEN[item.status];
      if (status && item.status !== status) return false;
      return true;
    }).map(copyItem);
  }

  /* [v3.306.0 · M-O8] 按 viewer 渲染未揭露秘密 —— **注入口**。
   *   与下面的 render 的关系：render 是**名单无关**的旧口（保留，供诊断与对照复核），
   *   renderForViewer 才是注入路径的入口。整段文本带**显式禁令头** ——
   *   修前它没有头、没有禁令、正文裸奔（与 parallel 的 renderHidden 头、
   *   wp_knowledge 的「切勿未卜先知」同规格，此前只有秘密面缺席）。
   *   read（逐档计数）随文本一起回：让「挡下了几条、其中几条判不了」可被诊断看见。 */
  const SECRET_HEAD = '【尚未揭露的秘密｜仅知情名单内的人知晓，未列名者一概不知情，严禁未卜先知或代其说破】';
  function renderForViewer(rawState, viewer, limit) {
    const all = list(rawState, { status: 'unrevealed' });
    const v = filterForViewer(all, viewer);
    const vw = text(viewer, 40);
    const items = v.visible.slice(-(finite(limit) || MAX_OPEN));
    const read = {
      total: v.total, visible: v.visible.length, rendered: items.length,
      withheld: v.withheld, known: v.known, notKnower: v.notKnower,
      undecided: v.undecided, noViewer: vw ? 0 : 1, malformed: 0
    };
    if (!items.length) return { text: '', read };
    const body = items.map((item) => {
      /* 正文一律走 copyItem 已截断的 secret（与 render 同口径）；about 不在注入里暴露。 */
      const tag = vw ? '（' + vw + '知情）' : '（公开）';
      return '- ' + item.id + tag + '（' + item.progress + '%）' + item.secret;
    }).join('\n');
    return { text: SECRET_HEAD + '\n' + body, read };
  }

  function render(rawState, limit) {
    const items = list(rawState, { status: 'unrevealed' }).slice(-(finite(limit) || MAX_OPEN));
    if (!items.length) return '';
    return '【尚未揭露的秘密】\n' + items.map((item) => {
      return '- ' + item.id + '〔' + item.keeper.join('、') + '不知 · ' + item.progress + '%〕' + item.secret;
    }).join('\n');
  }

  /* [v3.306.0 · M-O8] 自检/诊断行 —— 注入侧隔离的**真实读侧**。
   *   为什么必须有一条：读数是写给别的模块看的，`_secretRead` 若只有写没有读，
   *   就落进本仓反复治理的那一类（写完没人调 = 等于没写；scan_module_wiring 会判红）。
   *   与 knowledge-network.line 同形态：纯函数、不抛、**说不出结论的一档必须单独报**
   *   （undecided 若并进 withheld，读者会以为「判过了」）。 */
  function line(read) {
    const r = read || {};
    if (r.malformed && !r.rendered && !r.withheld) return '模块未加载或版本错配（secret-ledger.js 无 renderForViewer）';
    const parts = ['注入 ' + (r.rendered || 0), '挡下 ' + (r.withheld || 0)];
    if (r.known) parts.push('在册知情 ' + r.known);
    if (r.notKnower) parts.push('不在册 ' + r.notKnower);
    if (r.undecided) parts.push('**判不了 ' + r.undecided + '**');
    if (r.noViewer) parts.push('无在场者 ' + r.noViewer + ' 轮');
    if (r.malformed) parts.push('版本错配 ' + r.malformed);
    return parts.join(' · ');
  }

  const api = Object.freeze({
    MAX_OPEN,
    normalize, seal, advance, reveal, drop, remove, sweep, list, render,
    // [v3.306.0 · M-O8] 知识范围面：注入/诊断/下游导出共用的单一真源
    knowledgeOf, filterForViewer, renderForViewer,
    line
  });
  root.LonShaSecretLedger = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
