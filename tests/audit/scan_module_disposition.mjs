#!/usr/bin/env node
/**
 * tests/audit/scan_module_disposition.mjs — 装载面模块的**终局处置**门禁（计划 L22-O7）
 * ------------------------------------------------------------
 * 为什么存在（L22-O7 真实现场）：
 *   `tests/audit/module_consumption_ledger.json` 里有 11 个模块 `load_surface_only:true`
 *   —— 装载面（optional-engine-registry.js）能取到它们，生产业务零调用点。
 *   generated ledger 的 `why` 字段却写着 `load_surface_only`：**那是机器分类标签，
 *   不是处置理由**。生成器（tools/gen_module_consumption_ledger.mjs）每次重跑都会把
 *   `why` 重新写回这个标签，所以往那一栏填理由等于往会被覆盖的地方填 —— 灰色留存。
 *
 *   本门禁把「处置」搬到人工维护的 `module_disposition_ledger.json`，并对每条做**可核的**
 *   四件事，而不是接受一句话自述：
 *     ① 理由不是标签：`why` 不得等于/仅由灰标签组成，且长度 ≥ MIN_WHY_CHARS；
 *     ② 被取代者必须自己活着：`superseded_by` 里每个模块都必须在 generated ledger 中
 *        `business_call_sites > 0`，且**自己不是休眠条目**（不许「死人取代死人」）；
 *     ③ 声明的 API 必须真有：`declared_api` 每个名字既要在模块源码里出现，
 *        又要能真从模块导出对象上取到（`typeof === 'function'`）—— 防抄错/防张冠李戴；
 *     ④ 反向闸：处置为 dormant 的模块若已长出业务调用点（台账 business_call_sites > 0），
 *        说明声明腐坏，必须翻牌成 active —— 否则就成了「用一张休眠声明掩盖真接线」。
 *
 * 退出码：0 通过 / 1 存在违规 / 2 结构失效（fail-closed：读不到台账、条目为空、探针数不匹配）。
 *
 * 诚实边界：本门禁判「处置写得实不实、可不可核」，不判产品该不该复活某个模块；
 *   复活属产品决策，写在 `revive_trigger` 里，由人读。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.LONSHA_AUDIT_ROOT || path.resolve(__dir, '../..');

export const MIN_WHY_CHARS = 80;

const DEFAULT_GREY_TAGS = [
  'load_surface_only', 'zero_consumption', 'docs_probe_only',
  'dormant', 'unused', 'todo', 'tbd', 'wip', 'pending', 'n/a', 'na',
];

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_e) { return null; }
}

/* 灰标签判定：整体等于某个标签，或去掉标点后只剩标签词（例如 "load_surface_only."）。 */
export function isGreyReason(why, greyTags = DEFAULT_GREY_TAGS) {
  if (typeof why !== 'string') return true;
  const norm = why.trim().toLowerCase().replace(/[.\s_\-:;]+$/g, '');
  if (norm.length === 0) return true;
  return greyTags.some((t) => norm === t.toLowerCase());
}

/**
 * 纯函数入口（便于判据注入合成台账做负控制，不需要改盘上文件）。
 * @param {object} opts
 * @param {string} [opts.rootDir]
 * @param {object} [opts.ledger]       生成的消费台账（module_consumption_ledger.json 的对象）
 * @param {object} [opts.disposition]  处置台账（module_disposition_ledger.json 的对象）
 * @param {boolean} [opts.loadModules] 是否真 require 模块核 API（默认 true）
 */
export function auditDispositions(opts = {}) {
  const rootDir = opts.rootDir || ROOT;
  const doLoad = opts.loadModules !== false;

  const ledger = opts.ledger !== undefined
    ? opts.ledger
    : readJson(path.join(rootDir, 'tests/audit/module_consumption_ledger.json'));
  const disposition = opts.disposition !== undefined
    ? opts.disposition
    : readJson(path.join(rootDir, 'tests/audit/module_disposition_ledger.json'));

  const fail = (error) => ({
    status: 'fail_closed',
    exitCode: 2,
    error,
    checked: 0,
    dormantCount: 0,
    violations: {},
  });

  if (!ledger || !ledger.modules || typeof ledger.modules !== 'object') {
    return fail('找不到/读不动 module_consumption_ledger.json（或其 modules 不是对象）');
  }
  if (!disposition || !disposition.entries || typeof disposition.entries !== 'object') {
    return fail('找不到/读不动 module_disposition_ledger.json（或其 entries 不是对象）');
  }

  const dispVocab = Array.isArray(disposition.disposition_vocabulary) && disposition.disposition_vocabulary.length
    ? disposition.disposition_vocabulary
    : ['declared_dormant'];
  const kindVocab = Array.isArray(disposition.reason_kind_vocabulary) && disposition.reason_kind_vocabulary.length
    ? disposition.reason_kind_vocabulary
    : ['superseded_by_active_duplicate', 'no_host_consumer'];
  const greyTags = Array.isArray(disposition.grey_tags) && disposition.grey_tags.length
    ? disposition.grey_tags
    : DEFAULT_GREY_TAGS;

  const modules = ledger.modules;
  const dormant = Object.keys(modules).filter((k) => modules[k] && modules[k].load_surface_only === true);

  /* 探针失效 fail-closed：装载面模块一个都没扫到，说明口径坏了（不是「都处置完了」）。 */
  if (dormant.length === 0) {
    return fail('generated ledger 中 load_surface_only 模块为 0 —— 探针失效，fail-closed（不是「已清空」）');
  }

  const violations = {
    missing: [],            // 装载面模块没有处置条目
    greyReason: [],         // 理由缺失/是标签/太短
    badDisposition: [],     // disposition 不在词表
    badReasonKind: [],      // reason_kind 不在词表
    supersederNotActive: [],// 被取代者不存在 / 零业务消费 / 自己也是休眠条目
    apiMissingInSource: [], // 声明的 API 名字在模块源码里找不到
    apiMissingAtRuntime: [],// 声明的 API 在导出对象上取不到
    loadFailed: [],         // 模块 require 失败（休眠 ≠ 坏掉）
    staleDeclaration: [],   // 已长出业务调用点却仍声明 dormant（声明腐坏）
    ghost: [],              // 处置条目指向的模块已不在装载面（条目过期）
  };

  const require_ = createRequire(import.meta.url);
  const sourceCache = new Map();
  function sourceOf(modFile) {
    if (!sourceCache.has(modFile)) {
      try { sourceCache.set(modFile, fs.readFileSync(path.join(rootDir, modFile), 'utf8')); }
      catch (_e) { sourceCache.set(modFile, null); }
    }
    return sourceCache.get(modFile);
  }

  for (const modFile of dormant) {
    const entry = disposition.entries[modFile];
    if (!entry || typeof entry !== 'object') {
      violations.missing.push({ module: modFile, why: '装载面模块没有处置条目（灰色留存）' });
      continue;
    }

    if (!dispVocab.includes(entry.disposition)) {
      violations.badDisposition.push({ module: modFile, got: String(entry.disposition), vocabulary: dispVocab });
    }
    if (!kindVocab.includes(entry.reason_kind)) {
      violations.badReasonKind.push({ module: modFile, got: String(entry.reason_kind), vocabulary: kindVocab });
    }

    const why = typeof entry.why === 'string' ? entry.why.trim() : '';
    if (isGreyReason(why, greyTags) || [...why].length < MIN_WHY_CHARS) {
      violations.greyReason.push({
        module: modFile,
        chars: [...why].length,
        min: MIN_WHY_CHARS,
        why: '理由缺失/仅为标签/过短（R2 实质理由缺失）',
      });
    }

    /* ② 被取代者必须自己活着 */
    if (entry.reason_kind === 'superseded_by_active_duplicate') {
      const sup = Array.isArray(entry.superseded_by) ? entry.superseded_by : [];
      if (sup.length === 0) {
        violations.supersederNotActive.push({ module: modFile, why: 'reason_kind=被取代但 superseded_by 为空' });
      }
      for (const s of sup) {
        const sm = modules[s];
        if (!sm) {
          violations.supersederNotActive.push({ module: modFile, superseder: s, why: '被取代者不在 generated ledger 中' });
          continue;
        }
        if (disposition.entries[s]) {
          violations.supersederNotActive.push({ module: modFile, superseder: s, why: '被取代者自己也是休眠条目（死人取代死人）' });
          continue;
        }
        if (!(sm.business_call_sites > 0)) {
          violations.supersederNotActive.push({
            module: modFile, superseder: s,
            business_call_sites: sm.business_call_sites,
            why: '被取代者在生产业务上零调用点，不能作为取代证据',
          });
        }
      }
    } else if (entry.reason_kind === 'no_host_consumer') {
      if (typeof entry.no_host_surface !== 'string' || entry.no_host_surface.trim().length < 8) {
        violations.badReasonKind.push({
          module: modFile,
          why: 'reason_kind=no_host_consumer 必须写明 no_host_surface（缺哪个宿主面）',
        });
      }
    }

    /* ③ 声明的 API 必须真有 */
    const api = Array.isArray(entry.declared_api) ? entry.declared_api.filter((x) => typeof x === 'string' && x.length) : [];
    if (api.length === 0) {
      violations.apiMissingInSource.push({ module: modFile, why: 'declared_api 为空（没声明要核什么）' });
    }
    const src = sourceOf(modFile);
    if (!src) {
      violations.apiMissingInSource.push({ module: modFile, why: '模块源码读不到' });
    } else {
      for (const name of api) {
        const re = new RegExp(`(^|[^A-Za-z0-9_$])${name.replace(/[$]/g, '\\$')}([^A-Za-z0-9_$]|$)`);
        if (!re.test(src)) {
          violations.apiMissingInSource.push({ module: modFile, api: name, why: '声明的 API 在模块源码中找不到' });
        }
      }
    }

    /* 休眠 ≠ 坏掉：真 require 一次，声明 API 必须能取到函数 */
    if (doLoad && api.length > 0) {
      let exported = null;
      try { exported = require_(path.join(rootDir, modFile)); }
      catch (e) {
        violations.loadFailed.push({ module: modFile, why: String((e && e.message) || e).slice(0, 200) });
      }
      if (exported) {
        for (const name of api) {
          if (typeof exported[name] !== 'function') {
            const globals = globalCache(require_, path.join(rootDir, modFile), exported);
            if (!globals || typeof globals[name] !== 'function') {
              violations.apiMissingAtRuntime.push({ module: modFile, api: name, why: '导出对象上取不到该函数' });
            }
          }
        }
      }
    }
  }

  /* ④ 反向闸 + 幽灵条目 */
  for (const modFile of Object.keys(disposition.entries)) {
    const m = modules[modFile];
    if (!m) {
      violations.ghost.push({ module: modFile, why: '处置条目指向的模块不在 generated ledger 中' });
      continue;
    }
    if (m.load_surface_only !== true) {
      violations.ghost.push({
        module: modFile,
        business_call_sites: m.business_call_sites,
        why: '模块已不在装载面（已长出业务消费）—— 条目过期',
      });
      continue;
    }
    if (m.business_call_sites > 0) {
      violations.staleDeclaration.push({
        module: modFile,
        business_call_sites: m.business_call_sites,
        why: '已长出业务调用点却仍声明 dormant：必须翻牌为 active（不许用休眠声明掩盖真接线）',
      });
    }
  }

  const totalViolations = Object.values(violations).reduce((a, arr) => a + arr.length, 0);
  return {
    status: totalViolations > 0 ? 'defect' : 'ok',
    exitCode: totalViolations > 0 ? 1 : 0,
    checked: dormant.length,
    dormantCount: Object.keys(disposition.entries).length,
    violations,
    totalViolations,
  };
}

/* 有些模块是 UMD 双导出：require 拿到的是 factory() 结果；个别模块只挂 root 全局，
 *   这时 require 返回值可能不含声明 API —— 退回读 globalThis 上的挂载（仍是真取到）。 */
function globalCache(_require, modPath, exported) {
  if (exported && typeof exported === 'object' && Object.keys(exported).length > 0) return exported;
  return null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const res = auditDispositions({});
  if (res.status === 'fail_closed') {
    console.error(`[module-disposition] FAIL-CLOSED (exit 2): ${res.error}`);
    process.exit(2);
  }
  const names = {
    missing: '装载面模块无处置条目（灰色留存）',
    greyReason: '理由缺失/仅为标签/过短',
    badDisposition: 'disposition 不在词表',
    badReasonKind: 'reason_kind 不在词表/缺 no_host_surface',
    supersederNotActive: '被取代者不活跃或也是休眠条目',
    apiMissingInSource: '声明 API 不在源码中',
    apiMissingAtRuntime: '声明 API 运行时取不到',
    loadFailed: '模块 require 失败（休眠≠坏掉）',
    staleDeclaration: '已长出业务调用点却仍声明 dormant',
    ghost: '处置条目过期（模块已不在装载面）',
  };
  for (const [k, label] of Object.entries(names)) {
    const arr = res.violations[k] || [];
    if (!arr.length) continue;
    console.error(`[module-disposition] ${label}（${arr.length} 条）：`);
    for (const v of arr) console.error('  - ' + JSON.stringify(v));
  }
  if (res.exitCode !== 0) {
    console.error(`[module-disposition] 结论：${res.totalViolations} 条违规`);
    process.exit(res.exitCode === 1 ? 1 : 2);
  }
  console.log(`[module-disposition] 检查通过：${res.checked} 个装载面模块全部有可核处置`
    + `（休眠声明 ${res.dormantCount} 条，理由/取代证据/声明 API/反向闸 四关全过）。`);
  process.exit(0);
}
