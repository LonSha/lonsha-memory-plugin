/* ========================================================
 * schema-migration.js — 存档结构迁移注册表 [v3.209.0]
 * --------------------------------------------------------
 * 【为什么需要这一面 / 修前实测后果】
 *   v3.209 侦察实测（逐点核对，非抽样）：
 *     · `ARCHIVE_SCHEMA_VERSION = 1`，但全仓 **零迁移函数**：
 *       grep `migrat` 在 59 个根模块里只命中 index.js 的 13 处，且全部属于
 *       「检查/上报」两类 —— 没有一处是「把旧结构改成新结构」。
 *     · `restoreFromPayload` 对 `schemaVersion` **只处理一个方向**：
 *         9505: const _sv = Number(data.schemaVersion) || 0;
 *         9506: if (_sv > ARCHIVE_SCHEMA_VERSION) { res.schemaWarning = ... }
 *       即「存档比插件新」会报警；而「存档比插件旧」**完全无人处理** ——
 *       旧档被逐字段塞进新运行时，缺字段静默缺失、语义变化静默沿用。
 *     · 结构代际升到 2 时会发生什么无人可答：没有注册表，没有 dry-run，
 *       没有「已迁移」标记，没有失败回滚。这正是计划 M-P2 点名的风险。
 *
 * 【本模块做什么】
 *   1. 迁移**注册表**（单一真源）：每条 `{from, to, id, why, migrate(payload)}`，
 *      禁止在调用点各写各的 if。步骤必须**连续**（from→to 首尾相接），
 *      否则注册表本身即缺陷 —— 由 `plan()` 结构校验抓着。
 *   2. `plan(payload, target, registry?)` 纯函数：算出「要走哪几步、跳哪几步、为什么」。
 *      注册表可选注入（生产省略即用模块自带注册表；判据用它覆盖执行路径）。
 *      三态可分：
 *        · `up-to-date`  —— 已是最新代际（steps 空，**不等于**「没检查」）
 *        · `plan`        —— 需要迁移（steps 列出 id，逐条带 why）
 *        · `too-new`     —— 存档新于插件（可以给出，但**不得假装能迁**）
 *        · `unknown`     —— 载荷没有可用的结构版本（旧到连字段都没有）
 *   3. `run(payload, plan, opts)` 执行迁移：
 *        · 默认 **dry-run**（`opts.apply !== true` 一律不写），与 v3.142 恢复管线同一纪律；
 *        · 每步独立 try/catch，单步失败即停并**保留已完成步**的读数；
 *        · 失败时返回 `snapshot`（迁移前深拷贝）供调用方回滚，**不自行回滚**
 *          （回滚是恢复管线的职责，本模块不得偷偷写运行时）；
 *        · 成功后写 `migratedFrom` / `migratedTo` / `migratedAt` 三键，
 *          使「已迁移」可判（重复迁移幂等：代数已等于目标则 steps 为空）。
 *
 * 【三态纪律（本仓最忌的假绿）】
 *   `plan()` 绝不把「版本字段缺失」当成「已是最新」：前者返回 `unknown` + `why`，
 *   后者返回 `up-to-date`。压成一态就会让「没检查」被读成「检查过了没问题」。
 *   同理 `too-new` 不降级为 `plan`：返档降级是另一件事，不在本模块职责内。
 *
 * 挂 window.LonShaSchemaMigration；零依赖（不 require 任何本仓模块）。
 * ======================================================== */
'use strict';
(function (root) {
  /* ── 迁移注册表（单一真源；新增结构代际只在此登记一处） ──
   * 现状只有代际 1，故注册表为空 —— 但**空注册表本身是合法读数**，
   * 不等于「没有这一项能力」：plan() 仍会区分 unknown / up-to-date / too-new，
   * 而「升代际却忘了登记迁移」会被 plan() 的连续性校验直接拒掉。 */
  const MIGRATIONS = Object.freeze([
    // { from: 1, to: 2, id: 'm0001-xxx', why: '…', migrate(p) { … return p; } },
  ]);

  /** 迁移前抓快照用的深拷贝（结构化克隆优先，JSON 兜底；不引入依赖）。 */
  function clone(v) {
    try {
      if (typeof structuredClone === 'function') return structuredClone(v);
    } catch (e) { /* 落到 JSON 通道 */ }
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return null; }
  }

  /** 读载荷的结构代际。三态：数字 / null（字段存在但不可解析）/ undefined（字段不存在）。 */
  function schemaOf(payload) {
    if (!payload || typeof payload !== 'object') return { kind: 'no-payload', value: null };
    if (!('schemaVersion' in payload)) return { kind: 'absent', value: null };
    const n = Number(payload.schemaVersion);
    if (!Number.isFinite(n) || n <= 0) return { kind: 'unparsable', value: null };
    return { kind: 'ok', value: Math.floor(n) };
  }

  /**
   * 纯函数：给载荷算出迁移计划。不做任何写入。
   * @param {object} payload 存档载荷
   * @param {number} target  目标代际（默认当前 ARCHIVE_SCHEMA_VERSION）
   */
  function plan(payload, target, registry) {
    // 注册表**可注入**：生产走模块自带 MIGRATIONS；判据可喂真注册表以覆盖执行路径。
    //   为什么不为了可测性去抬生产代际：抬代际会让旧插件读不了新存档（另一件事，须专门决策）。
    const REG = Array.isArray(registry) ? registry : MIGRATIONS;
    const to = Number.isFinite(Number(target)) ? Math.floor(Number(target)) : CURRENT;
    const sc = schemaOf(payload);
    const base = { from: sc.value, to, steps: [], skipped: [], ran: [], at: Date.now() };
    // 载荷**形状**必须先判：修前实测此分支被下面那条「没有 schemaVersion 字段」遮蔽，
    //   非对象载荷（null / 数组）也走 absent，读数于是说「旧到连代际都没写」——
    //   把「根本不是载荷」误诊成「旧载荷」。两类处置完全不同：
    //   前者是调用方传错（要修调用点），后者要人工确认结构后再迁移。
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        return Object.assign(base, { verdict: 'unknown', why: '载荷不是对象，无法判定结构代际' });
    }
    if (sc.kind === 'absent') return Object.assign(base, { verdict: 'unknown', why: '载荷没有 schemaVersion 字段（旧到连代际都没写），须人工确认结构后再迁移' });
    if (sc.kind === 'unparsable') return Object.assign(base, { verdict: 'unknown', why: 'schemaVersion 不可解析为代际（值=' + JSON.stringify(payload.schemaVersion) + '，须为正整数）' });
    if (sc.value > to) return Object.assign(base, { verdict: 'too-new', why: '存档结构 ' + sc.value + ' 新于插件 ' + to + '：降级读取不在迁移职责内，不得假装可迁' });
    if (sc.value === to) return Object.assign(base, { verdict: 'up-to-date', why: '已是最新结构代际 ' + to });
    // 需要迁移：按注册表逐段**连续**推进，缺失环节即结构缺陷（fail-closed）
    let cur = sc.value;
    while (cur < to) {
      const step = REG.find((m) => m.from === cur);
      if (!step) {
        return Object.assign(base, {
          verdict: 'unknown',
          why: '注册表缺 ' + cur + '→' + to + ' 的迁移步骤：升代际未登记（这不是「无需迁移」，是判不出来）',
          broken: cur,
        });
      }
      base.steps.push({ id: step.id, from: step.from, to: step.to, why: step.why });
      cur = step.to;
      if (base.steps.length > 64) { base.verdict = 'unknown'; base.why = '注册表成环（步数 > 64）'; return base; }
    }
    base.verdict = 'plan';
    base.why = '需迁移 ' + base.steps.length + ' 步：' + base.steps.map((s) => s.id).join(' → ');
    return base;
  }

  /**
   * 执行迁移。默认 dry-run（`opts.apply !== true` 不写任何东西）。
   * 返回 { ok, applied, plan, payload, snapshot, failed?, why }
   *   · 失败：applied 为已完成步数，snapshot 为迁移前深拷贝（供调用方回滚）
   *   · 幂等：对已迁移结果再跑一次，plan.verdict 为 up-to-date、steps 为空
   */
  function run(payload, opts) {
    const o = opts || {};
    const target = Number.isFinite(Number(o.target)) ? Math.floor(Number(o.target)) : CURRENT;
    const REG = Array.isArray(o.registry) ? o.registry : MIGRATIONS;
    const pl = o.plan && o.plan.verdict ? o.plan : plan(payload, target, REG);
    const out = { ok: true, applied: 0, dryRun: o.apply !== true, plan: pl, payload: null, snapshot: null, ran: [] };
    if (pl.verdict === 'unknown' || pl.verdict === 'too-new') {
      return Object.assign(out, { ok: false, why: pl.why, payload: null });
    }
    if (pl.verdict === 'up-to-date') {
      // 已是目标代际：无需改动。dry-run 仍不回载荷（与恢复管线的「预检不写」同一纪律），
      //   apply 时回原载荷的拷贝（「照原样落盘」与「没检查」在读数上必须可分）。
      return Object.assign(out, {
        why: pl.why,
        payload: o.apply === true ? clone(payload) : null,
        noop: true,
      });
    }
    // dry-run：只回计划与「将要发生什么」，不回载荷
    if (o.apply !== true) {
      return Object.assign(out, {
        why: 'dry-run：将执行 ' + pl.steps.length + ' 步（' + pl.steps.map((s) => s.id).join(' → ') + '），未写入任何内容',
      });
    }
    const snap = clone(payload);
    if (snap === null) return Object.assign(out, { ok: false, why: '迁移前快照抓取失败（载荷不可克隆），拒绝在无快照的情况下迁移' });
    let cur = Object.assign({}, payload);
    for (const st of pl.steps) {
      const impl = REG.find((m) => m.id === st.id);
      if (!impl || typeof impl.migrate !== 'function') {
        return Object.assign(out, { ok: false, applied: out.applied, snapshot: snap, why: '注册表条目 ' + st.id + ' 缺 migrate 实现（注册表与实现不一致）' });
      }
      try {
        const next = impl.migrate(cur, { from: st.from, to: st.to });
        if (!next || typeof next !== 'object') throw new Error('迁移返回非对象（不得静默丢弃载荷）');
        cur = next;
        out.applied++;
        out.ran.push({ id: st.id, from: st.from, to: st.to });
      } catch (e) {
        return Object.assign(out, { ok: false, applied: out.applied, snapshot: snap, why: '第 ' + (out.applied + 1) + ' 步 ' + st.id + ' 失败：' + String(e && e.message || e) });
      }
    }
    // 迁移标记三键：使「已迁移」可判、重复迁移幂等
    cur.schemaVersion = Math.max(Number(cur.schemaVersion) || 0, target);
    cur.migratedFrom = pl.from;
    cur.migratedTo = cur.schemaVersion;
    cur.migratedAt = new Date().toISOString();
    out.payload = cur;
    out.snapshot = snap;
    out.why = '已迁移 ' + out.applied + ' 步：' + out.ran.map((r) => r.id).join(' → ');
    return out;
  }

  /** 一行读数（诊断面消费）：必须报出三态 + 是否有迁移路径。 */
  function line(payload, target) {
    try {
      const pl = plan(payload, target);
      const n = MIGRATIONS.length;
      // unknown 的**成因必须点名**：v3.209 首版把「缺 schemaVersion 字段」与「注册表缺链」
      //   压成同一个「判不出来」——冒烟当场抓到（两种成因处置完全不同：前者要人工确认结构，
      //   后者要补注册表）。压平即本仓最忌的「把两种不同事实读成一个读数」。
      const cause = pl.verdict === 'unknown'
        ? (pl.broken !== undefined ? '缺 ' + pl.broken + '→' + pl.to + ' 迁移步骤'
          : (/没有 schemaVersion/.test(pl.why) ? '载荷无代际'
            : (/不可解析/.test(pl.why) ? '代际不可解析' : '载荷不可用')))
        : null;
      const tail = pl.verdict === 'plan' ? ' · 需 ' + pl.steps.length + ' 步'
        : pl.verdict === 'too-new' ? ' · 存档过新（不降级）'
          : pl.verdict === 'unknown' ? ' · 判不出来（' + cause + '）' : ' · 无需迁移';
      return '结构迁移 注册 ' + n + ' 条 · 载荷 ' + (pl.from === null ? '无代际' : 'v' + pl.from) + ' → 目标 v' + pl.to + tail;
    } catch (e) { return '—（结构迁移异常）'; }
  }

  const CURRENT = 1;   // 与 index.js 的 ARCHIVE_SCHEMA_VERSION 同步；独立常量便于测试传 target

  const api = Object.freeze({
    MIGRATIONS, CURRENT,
    schemaOf, plan, run, line,
  });
  root.LonShaSchemaMigration = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
