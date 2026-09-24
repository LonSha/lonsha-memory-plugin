/* ========================================================
 * module-registry.js — 模块加载登记表 / 缺席归因 [v3.209.0]
 * --------------------------------------------------------
 * 【为什么需要这一面 / 修前实测后果】
 *   v3.209 探针实测（/tmp/probe209a.mjs，真跑不是读源码）：
 *
 *   1) 宿主侧取库口 `_moduleLib` **把错误吞成同一个 null**：
 *        function _moduleLib(getGlobal, fileName) {
 *            try { … } catch (e) { /* 读全局失败按未取到处理 *\/ }
 *            if (typeof require !== 'undefined') {
 *                try { return require('./' + fileName); } catch (e) { return null; }   // ← 这里
 *            }
 *            return null;
 *        }
 *      探针把一个**存在但语法错**的模块交给它：返回 null，无任何读数。
 *      于是「文件不存在」「文件在但坏了」「全局名写错」三种根因**完全同形**，
 *      调用方一律降级为兜底实现，且诊断面只能报「模块未加载」——
 *      排查时必须手工 require 一遍才知道是哪种。v3.208 修掉的
 *      「缺席不可归因」（投影面）在**宿主取库口**这一层原样还在。
 *
 *   2) 加载**顺序**靠 manifest 数组位置隐式承载，无人守：
 *      实测 6 个模块真依赖 ledger-entity.js（commitment / seed / secret / parallel /
 *      fact-version / event-completeness），它们的 IIFE 顶部直接
 *        if (!LE) throw new Error('…账本实体契约缺真源…')
 *      —— 也就是说「把 ledger-entity.js 挪到 extra_js 末尾」会让 6 个模块**整体不执行**。
 *      探针实测（/tmp/probe209b.mjs）：挪动后抛错模块从 5 个涨到 7 个。
 *      当前顺序是对的，但正确性是**巧合**：没有任何判据写着「依赖必须先加载」。
 *
 * 【本模块做什么（只做「登记 + 归因」，不做加载器）】
 *   本仓已有真加载矩阵（tests/audit/scan_v3193_host_matrix.mjs 的 M1–M7）
 *   与静态接线扫描（scan_module_wiring.mjs 的 B1–B5）。本模块**不重复它们**，补的是：
 *     · `classify(err)` —— 把取库失败的根因分成**六态**，每态带可读 why：
 *         ok / absent（无模块）/ broken（有文件但加载抛，附 error）
 *         / stub（取到的对象缺必要方法）/ missing-symbol（全局名对但值为空）
 *         / not-attempted（没试过 —— 与「试了没有」必须可分）
 *     · `probe(file, globals, needMethods)` —— 逐模块体检，返回归因读数。
 *     · `orderCheck(list, deps)` —— 声明式顺序校验：依赖必须出现在使用方之前，
 *       缺失依赖单列（不混进「顺序倒挂」）。
 *     · `line(readings)` —— 一行读数，**必须报出缺席数与根因分布**。
 *
 * 【三态纪律】
 *   `not-attempted` 与 `absent` 不得压成一态：前者是「本模块还没查」，
 *   后者是「查了，确实没有」。本仓最忌的假绿正是把「没查」读成「没问题」。
 *
 * 挂 window.LonShaModuleRegistry；零依赖。
 * ======================================================== */
'use strict';
(function (root) {
  /** 六态根因。顺序即「严重度」：ok 最轻，not-attempted 是唯一的「未知」。 */
  const KINDS = Object.freeze(['ok', 'absent', 'broken', 'stub', 'missing-symbol', 'not-attempted']);

  /**
   * 归类一次取库结果。
   * @param {object} r { attempted, file, value, error, needMethods }
   */
  function classify(r) {
    const x = r || {};
    if (x.attempted !== true) return { kind: 'not-attempted', why: '尚未尝试取库（与「取过但不存在」不同，不得当作已有结论）' };
    const file = String(x.file || '(未命名)');
    if (x.error) return { kind: 'broken', why: '模块 ' + file + ' 存在但加载抛异常：' + String(x.error.message || x.error), error: String(x.error.message || x.error) };
    const v = x.value;
    if (v === undefined || v === null) return { kind: 'absent', why: '模块 ' + file + ' 取不到（无此文件 / 全局未挂载 / 双通道都失败）' };
    const need = Array.isArray(x.needMethods) ? x.needMethods : [];
    if (need.length) {
      const miss = need.filter((m) => typeof v[m] !== 'function');
      if (miss.length) return { kind: 'stub', why: '模块 ' + file + ' 取到了但缺必需方法：' + miss.join('、') + '（可能是旧版残留或接口改名）', missed: miss };
    }
    if (x.symbolExpected && !x.symbolFound) {
      return { kind: 'missing-symbol', why: '模块 ' + file + ' 的全局符号 ' + x.symbolExpected + ' 未挂载（拼写或挂载目标分歧）' };
    }
    return { kind: 'ok', why: '模块 ' + file + ' 可用' + (need.length ? '（必需方法齐备）' : '') };
  }

  /** 逐模块体检：把一次失败拆成「哪一步失败、什么根因」。 */
  function probe(entry) {
    const e = entry || {};
    const c = classify(e);
    return {
      file: String(e.file || '(未命名)'),
      kind: c.kind,
      why: c.why,
      error: c.error || null,
      missed: c.missed || [],
      at: Date.now(),
    };
  }

  /**
   * 声明式顺序校验。
   * @param {string[]} list 实际加载顺序
   * @param {Object<string,string[]>} deps 使用方 → 依赖文件列表
   */
  function orderCheck(list, deps) {
    const order = Array.isArray(list) ? list.slice() : [];
    const idx = new Map(order.map((f, i) => [f, i]));
    const out = { ok: true, before: [], after: [], missing: [], unknown: [], issues: [] };
    const d = deps && typeof deps === 'object' ? deps : {};
    for (const [user, ds] of Object.entries(d)) {
      if (!idx.has(user)) { out.unknown.push(user); continue; }
      for (const dep of (Array.isArray(ds) ? ds : [])) {
        if (!idx.has(dep)) { out.missing.push({ user, dep }); continue; }
        const rec = { user, dep, userAt: idx.get(user), depAt: idx.get(dep) };
        if (idx.get(dep) < idx.get(user)) out.before.push(rec); else out.after.push(rec);
      }
    }
    // 缺依赖（声明了但清单里没有）与顺序倒挂分开报：两者处置完全不同
    if (out.missing.length) { out.ok = false; out.issues.push('声明了依赖但清单里没有：' + out.missing.map((m) => m.user + '→' + m.dep).join('、')); }
    if (out.after.length) { out.ok = false; out.issues.push('加载顺序倒挂（依赖在使用方之后）：' + out.after.map((m) => m.dep + ' 在 ' + m.user + ' 之后').join('、')); }
    // 未知使用方**也必须**使 ok=false：依赖表里出现不在清单中的使用方，意味着
    //   「这张依赖表」与「这次要查的清单」不是同一份 —— 若仍报 ok:true，
    //   就把「对不上」读成了「顺序没问题」（本仓最忌的假绿形态）。
    //   v3.209 探针实测抓到的本模块自身缺陷：原实现只 push issues 不动 ok。
    if (out.unknown.length) { out.ok = false; out.issues.push('依赖表里出现了不在清单中的使用方：' + out.unknown.join('、')); }
    return out;
  }

  /** 一行读数：**必须报出席位数与根因分布**（只报「全部可用」会把缺席藏掉）。 */
  function line(readings) {
    try {
      const rs = Array.isArray(readings) ? readings : [];
      if (!rs.length) return '模块加载 尚无读数（未体检）';
      const by = {};
      for (const r of rs) by[r.kind] = (by[r.kind] || 0) + 1;
      const okN = by.ok || 0;
      const bad = rs.filter((r) => r.kind !== 'ok');
      const parts = KINDS.filter((k) => by[k]).map((k) => k + ' ' + by[k]);
      const head = '模块加载 ' + okN + '/' + rs.length + ' · ' + parts.join(' · ');
      if (!bad.length) return head;
      // 缺席**点名**（哪个文件、什么根因），否则「有 N 个问题」无从下手
      const detail = bad.slice(0, 4).map((r) => r.file + '(' + r.kind + ')').join('、');
      return head + ' ｜ ' + detail + (bad.length > 4 ? ' 等 ' + bad.length + ' 项' : '');
    } catch (e) { return '—（模块加载读数异常）'; }
  }

  const api = Object.freeze({ KINDS, classify, probe, orderCheck, line });
  root.LonShaModuleRegistry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);