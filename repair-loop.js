/* ========================================================
 * repair-loop.js — 记忆修复闭环 [v3.194.0]
 * --------------------------------------------------------
 * 【为什么需要这一面 / 修前实测后果】
 *   计划点名三条修复动作，本仓**零入口**：
 *     ① 纠正实体归属（这条记忆其实属于另一个人）
 *     ② 拆分误合并事件（两件事被并成一条）
 *     ③ 撤销错误事实并更新派生内容（撤了之后，从它派生出的摘要/关系/时间线还在引用它）
 *   前两条不说，第三条是要害：本仓的摘要、图谱边、时间线、承诺账都是从同一条事实派生的，
 *   只把源事实删掉而不管派生件，等于「源头改了、下游还指着旧值」——
 *   这正是 v3.177/v3.190 治理过的那一族缺陷（生活事件停在旧值、位移改两次）。
 *
 * 【本模块的职责：把一次修复变成一次可复算的传播】
 *   输入是一次修复请求（retarget / split / revoke），输出是**受影响的派生件清单**：
 *     { ok, action, target, affected: [{kind, key, why}], dangling, changed }
 *   宿主拿这份清单去逐处改派生件。本模块**不直接改**那些子系统——
 *   它没有它们的引用，也不该有（否则就是第二份真源）。
 *
 * 【为什么必须有「未处理完」这一态（本项目硬纪律）】
 *   宿主改派生件可能只改成功一部分（某个子系统抛错、某条已被上限淘汰）。
 *   修复不是一次动作，而是一段有状态的流程，所以本模块保留 pending 台账：
 *   每条受影响项标 done / failed / missing，**全部落定**才算修复完成。
 *   不这么做的话，「修了但有一处没跟上」与「修复完成」在界面上完全同形。
 *
 * 【本模块不做什么（边界）】
 *   · 不判断修复是否正确（那是人的决定）；只保证「一次修复被完整传播、且可追踪」。
 *   · 不自动猜该改哪些派生件。命中规则显式写在 affectedBy 里，逐条可读、可测；三类动作扫的针不同，不是同一套换名字。
 *   · 不做批量撤销的级联推理（撤销 A 是否该连带撤销 B 由调用方逐条提交）。
 *
 * 挂 window.LonShaRepairLoop，供 index.js 修复入口 / 诊断面使用。
 * ======================================================== */
'use strict';
(function (root) {
  const RL_VERSION = 1;
  const MAX_REPAIRS = 120;
  /** 三类修复动作（计划点名，不多不少）。 */
  const ACTIONS = Object.freeze(['retarget', 'split', 'revoke']);
  /** 修复记录的终态四态：open=未落定 / applied=全部落定 / partial=有未落定 / abandoned=用户放弃。 */
  const STATES = Object.freeze(['open', 'applied', 'partial', 'abandoned']);
  /** 派生件类型六态——每一类都是本仓真实的派生子系统。 */
  const KINDS = Object.freeze(['summary', 'event', 'relation', 'promise', 'fact', 'timeline']);

  function text(v, max) {
    const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    return max ? s.slice(0, max) : s;
  }
  function finite(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.floor(n) : null;
  }
  function copyItem(it) {
    return {
      kind: KINDS.includes(it.kind) ? it.kind : 'summary',
      key: text(it.key, 80),
      why: text(it.why, 80),
      status: ['pending', 'done', 'failed', 'missing'].includes(it.status) ? it.status : 'pending',
      note: text(it.note, 80)
    };
  }
  function copyRepair(r) {
    return {
      id: text(r.id, 48),
      action: ACTIONS.includes(r.action) ? r.action : 'revoke',
      subject: text(r.subject, 40),
      from: text(r.from, 120),
      to: text(r.to, 120),
      target: text(r.target, 80),
      reason: text(r.reason, 120),
      floor: finite(r.floor),
      status: STATES.includes(r.status) ? r.status : 'open',
      affected: Array.isArray(r.affected) ? r.affected.map(copyItem).slice(-24) : [],
      at: finite(r.at)
    };
  }
  function clone(state) {
    return {
      version: RL_VERSION,
      seq: finite(state && state.seq) || 0,
      repairs: Array.isArray(state && state.repairs) ? state.repairs.map(copyRepair) : []
    };
  }
  function normalize(raw) {
    const state = clone(raw);
    const seen = new Set();
    state.repairs = state.repairs.filter(function (r) {
      if (!r.id || !r.subject) return false;
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    }).slice(-MAX_REPAIRS);
    return state;
  }
  function nextId(state) {
    state.seq += 1;
    return 'rpr_' + state.seq;
  }
  function result(state, extra) {
    return Object.assign({ ok: true, changed: false, state: normalize(state) }, extra || {});
  }
  function reject(state, reason) {
    return { ok: false, changed: false, reason: reason, state: normalize(state) };
  }
  function find(state, ref) {
    const id = text(ref && ref.id, 48);
    if (id) return state.repairs.find(function (r) { return r.id === id; }) || null;
    return null;
  }
  /**
   * 派生件命中规则（显式表，逐条可读）。
   *   pool = { summaries:[{key,text,floor}], events:[...], relations:[...], promises:[...], facts:[...], timeline:[...] }
   * 每条规则回答「这次修复影响了它吗、为什么」。
   * 关键纪律：**命中就列出来**，不在这里判断「要不要改」——改不改是调用方的事。
   */
  /**
   * 池键名映射（显式表）。**不能**用 kind + 's' 拼键：
   *   summary→summaries、promise→promises 拼不出来（会拼成 summarys / promise s），
   *   结果是摘要池、承诺池与事实池里的 timeline 被静默跳过——「修了但下游没跟着改」
   *   正是本模块存在的理由，它自己踩这个坑就等于没修。单数键也接受（调用方两种写法都能给）。
   */
  const POOL_KEYS = Object.freeze({
    summary: 'summaries', event: 'events', relation: 'relations',
    promise: 'promises', fact: 'facts', timeline: 'timeline'
  });
  function poolList(p, kind) {
    const plural = POOL_KEYS[kind];
    if (Array.isArray(p[plural])) return p[plural];
    if (Array.isArray(p[kind])) return p[kind];
    return [];
  }
  function affectedBy(action, target, subject, pool) {
    const p = pool || {};
    const out = [];
    const has = function (v, needle) {
      return needle && String(v == null ? '' : v).toLowerCase().includes(String(needle).toLowerCase());
    };
    const scan = function (kind, list, needle) {
      for (const it of (Array.isArray(list) ? list : [])) {
        const key = text(it && (it.key || it.id || it.name || it.title), 80);
        const body = text(it && (it.text || it.content || it.value || it.summary || it.desc), 200);
        if (!key && !body) continue;
        if (has(body, needle) || has(key, needle)) {
          out.push({ kind: kind, key: key || body.slice(0, 40), why: 'mentions-needle', status: 'pending', note: '' });
        }
      }
    };
    // 三类动作扫的针不同（不是同一套规则换个名字）：
    //   retarget ⇒ 针 = 旧主体。要说「这条其实属于别人」，受牵连的是出现旧名字
    //              的那些派生件；target 只是被纠正的那一条本身。
    //   split    ⇒ 针 = target（被误合并成一个名字的那条）。
    //   revoke   ⇒ 针 = target（被撤销的事实文本），连同从它派生的下游。
    const needle = action === 'retarget' ? subject : target;
    for (const kind of KINDS) scan(kind, poolList(p, kind), needle);
    // 去重：同 kind+key 只留一条（同一条派生件被同名多处提到不重复列入）
    const seen = new Map();
    for (const it of out) {
      const k = it.kind + '\u0000' + it.key;
      if (!seen.has(k)) seen.set(k, it);
    }
    return [...seen.values()];
  }
  /**
   * 登记一次修复请求：算出受影响派生件清单，写进 open 台账。
   * input = { action, subject, from?, to?, target?, reason?, floor?, pool?, at? }
   */
  function request(rawState, input) {
    const state = normalize(rawState);
    const i = input || {};
    const action = text(i.action, 16);
    if (!ACTIONS.includes(action)) return reject(state, 'unknown-action');
    const subject = text(i.subject, 40);
    if (!subject) return reject(state, 'missing-subject');
    const target = text(i.target, 80);
    if (action === 'revoke' && !target) return reject(state, 'missing-target');
    if (action === 'retarget' && !text(i.to, 120)) return reject(state, 'missing-to');
    if (action === 'split' && !target) return reject(state, 'missing-target');
    const affected = affectedBy(action, target, subject, i.pool);
    const rec = copyRepair({
      id: nextId(state), action: action, subject: subject,
      from: i.from, to: i.to, target: target, reason: i.reason, floor: i.floor,
      status: 'open', affected: affected, at: i.at
    });
    state.repairs.push(rec);
    return result(state, {
      repair: copyRepair(rec), changed: true,
      affected: affected.slice(), total: affected.length
    });
  }
  /**
   * 落定一条受影响项。宿主每改完一处就报一次；不报的就一直是 pending。
   *   status: 'done' | 'failed' | 'missing'（missing = 目标已不存在，如被上限淘汰）
   * 全部落定（无 pending）时自动把修复记录推成 applied；有 failed/missing 则 partial。
   */
  function settle(rawState, input) {
    const state = normalize(rawState);
    const i = input || {};
    const rec = find(state, i);
    if (!rec) return reject(state, 'not-found');
    if (rec.status === 'abandoned') return result(state, { repair: copyRepair(rec), replayed: true, changed: false, reason: 'abandoned' });
    const key = text(i.key, 80);
    const kind = text(i.kind, 24);
    const next = ['done', 'failed', 'missing'].includes(i.status) ? i.status : 'done';
    const item = rec.affected.find(function (it) { return it.key === key && (!kind || it.kind === kind); });
    if (!item) return reject(state, 'item-not-found');
    if (item.status === next) return result(state, { repair: copyRepair(rec), item: copyItem(item), replayed: true, changed: false });
    item.status = next;
    item.note = text(i.note, 80);
    const pend = rec.affected.filter(function (it) { return it.status === 'pending'; }).length;
    const bad = rec.affected.filter(function (it) { return it.status === 'failed' || it.status === 'missing'; }).length;
    rec.status = pend > 0 ? 'open' : (bad > 0 ? 'partial' : 'applied');
    return result(state, {
      repair: copyRepair(rec), item: copyItem(item), changed: true,
      pending: pend, failed: bad, settled: rec.status !== 'open'
    });
  }
  /** 放弃一次修复（用户改主意）：把剩余 pending 一并标 missing 并留原因。 */
  function abandon(rawState, input) {
    const state = normalize(rawState);
    const rec = find(state, input);
    if (!rec) return reject(state, 'not-found');
    if (rec.status === 'abandoned') return result(state, { repair: copyRepair(rec), replayed: true, changed: false });
    for (const it of rec.affected) if (it.status === 'pending') { it.status = 'missing'; it.note = 'abandoned'; }
    rec.status = 'abandoned';
    return result(state, { repair: copyRepair(rec), replayed: false, changed: true });
  }
  /** 未落定的修复名单——「修了但没修完」必须能被单独列出来。 */
  function pending(rawState) {
    const state = normalize(rawState);
    return state.repairs.filter(function (r) { return r.status === 'open'; }).map(function (r) {
      return Object.assign(copyRepair(r), {
        pending: r.affected.filter(function (it) { return it.status === 'pending'; }).map(copyItem)
      });
    });
  }
  /** 诊断一行。 */
  function line(rawState) {
    try {
      const state = normalize(rawState);
      if (!state.repairs.length) return '暂无修复记录';
      let applied = 0, open = 0, partial = 0, abandoned = 0, items = 0, bad = 0;
      for (const r of state.repairs) {
        items += r.affected.length;
        if (r.status === 'applied') applied++;
        else if (r.status === 'open') open++;
        else if (r.status === 'partial') partial++;
        else abandoned++;
        bad += r.affected.filter(function (it) { return it.status === 'failed' || it.status === 'missing'; }).length;
      }
      const parts = ['修复 ' + state.repairs.length, '已落定 ' + applied];
      if (open) parts.push('未落定 ' + open + ' ⚠️');
      if (partial) parts.push('部分完成 ' + partial + ' ⚠️');
      if (abandoned) parts.push('已放弃 ' + abandoned);
      parts.push('派生件 ' + items);
      if (bad) parts.push('异常项 ' + bad);
      return parts.join(' · ');
    } catch (e) { return '—（修复账异常）'; }
  }
  const api = Object.freeze({
    normalize, request, settle, abandon, pending, line, affectedBy, poolList,
    ACTIONS, STATES, KINDS, POOL_KEYS, RL_VERSION
  });
  root.LonShaRepairLoop = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);