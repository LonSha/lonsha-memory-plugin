#!/usr/bin/env node
/**
 * tests/l22_o7_declared_dormant.test.mjs — 装载面 11 模块「终局处置」判据（计划 L22-O7）
 * ------------------------------------------------------------
 * 反面控制是重点：本判据不是「跑通了就算绿」，而是逐条证明门禁**抓得住**五种假账：
 *   ① 往 why 里填标签（`load_surface_only`）；
 *   ② 拿另一个休眠模块当取代者（死人取代死人）；
 *   ③ 拿一个零业务消费的模块当取代者（名义取代、实际两边都死）；
 *   ④ 声明 API 抄错/张冠李戴；
 *   ⑤ 模块已长出业务消费却仍声明 dormant（用休眠声明掩盖真接线）。
 * 另有一条 fail-closed 负控制：生成台账里装载面模块被扫成 0 时，门禁必须 exit 2 而不是「通过」。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditDispositions, isGreyReason, MIN_WHY_CHARS } from './audit/scan_module_disposition.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..');

let pass = 0;
let fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('✓ ' + name); }
  else { fail++; console.log('✗ ' + name + (extra ? '  → ' + JSON.stringify(extra) : '')); }
}

const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/audit/module_consumption_ledger.json'), 'utf8'));
const disposition = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/audit/module_disposition_ledger.json'), 'utf8'));

const real = auditDispositions({ rootDir: ROOT });

/* ── 正面：真台账四关全过 ────────────────────────────────── */
assert('真台账处置检查 rc=0', real.exitCode === 0 && real.status === 'ok', real.violations);
assert('装载面模块数 = 11', real.checked === 11, { checked: real.checked });
assert('休眠声明条目数 = 11', real.dormantCount === 11, { dormant: real.dormantCount });
assert('11 个模块全部 require 成功（休眠 ≠ 坏掉）', (real.violations.loadFailed || []).length === 0, real.violations.loadFailed);
assert('声明 API 运行时全部可取', (real.violations.apiMissingAtRuntime || []).length === 0, real.violations.apiMissingAtRuntime);
assert('无幽灵条目 / 无过期处置', (real.violations.ghost || []).length === 0, real.violations.ghost);

const loadSurface = Object.keys(ledger.modules).filter((k) => ledger.modules[k].load_surface_only === true);
assert('11 条休眠条目与生成台账的 load_surface_only 逐一对齐',
  loadSurface.length === 11 && loadSurface.every((m) => disposition.entries[m]),
  { loadSurface: loadSurface.length });
assert('11 条理由均为实质理由（≥' + MIN_WHY_CHARS + ' 字，且不是标签）',
  loadSurface.every((m) => {
    const w = String(disposition.entries[m].why || '').trim();
    return [...w].length >= MIN_WHY_CHARS && !isGreyReason(w, disposition.grey_tags);
  }),
  loadSurface.map((m) => [m, [...String(disposition.entries[m].why || '').trim()].length]));

/* 反向闸在真数据上必须干净：这些模块确实零业务消费（否则声明腐坏） */
assert('真数据上无「已接线却仍休眠」',
  loadSurface.every((m) => !(ledger.modules[m].business_call_sites > 0)),
  loadSurface.filter((m) => ledger.modules[m].business_call_sites > 0));

/* ── 反面控制 ① 灰标签理由 ──────────────────────────────── */
const greyWhy = 'load_surface_only';
assert('灰标签被识别（load_surface_only）', isGreyReason(greyWhy, disposition.grey_tags) === true);
assert('实质理由不被误伤', isGreyReason(disposition.entries[loadSurface[0]].why, disposition.grey_tags) === false);

{
  const led = { modules: { 'a.js': { module: 'a.js', load_surface_only: true, business_call_sites: 0 }, 'b.js': { module: 'b.js', load_surface_only: false, business_call_sites: 3 } } };
  const disp = {
    disposition_vocabulary: ['declared_dormant'],
    reason_kind_vocabulary: ['superseded_by_active_duplicate'],
    grey_tags: disposition.grey_tags,
    entries: { 'a.js': { disposition: 'declared_dormant', reason_kind: 'superseded_by_active_duplicate', why: 'load_surface_only', superseded_by: ['b.js'], declared_api: [] } },
  };
  const r = auditDispositions({ rootDir: ROOT, ledger: led, disposition: disp, loadModules: false });
  assert('负控制①：why 填标签 → 报灰理由', (r.violations.greyReason || []).length >= 1, r.violations);
  assert('负控制①：rc=1（不通过）', r.exitCode === 1, { exitCode: r.exitCode });
}

/* ── 反面控制 ② 死人取代死人 ────────────────────────────── */
{
  const led = { modules: {
    'a.js': { module: 'a.js', load_surface_only: true, business_call_sites: 0 },
    'b.js': { module: 'b.js', load_surface_only: true, business_call_sites: 0 },
  } };
  const goodWhy = '这是一条足够长的实质理由，说明该模块为何休眠、谁在承担同一能力、以及复活条件是什么，避免出现灰色留存。';
  const disp = {
    disposition_vocabulary: ['declared_dormant'],
    reason_kind_vocabulary: ['superseded_by_active_duplicate'],
    grey_tags: disposition.grey_tags,
    entries: {
      'a.js': { disposition: 'declared_dormant', reason_kind: 'superseded_by_active_duplicate', why: goodWhy, superseded_by: ['b.js'], declared_api: [] },
      'b.js': { disposition: 'declared_dormant', reason_kind: 'superseded_by_active_duplicate', why: goodWhy, superseded_by: ['a.js'], declared_api: [] },
    },
  };
  const r = auditDispositions({ rootDir: ROOT, ledger: led, disposition: disp, loadModules: false });
  assert('负控制②：休眠模块当取代者 → 报「死人取代死人」',
    (r.violations.supersederNotActive || []).some((v) => /死人取代死人/.test(v.why)), r.violations.supersederNotActive);
}

/* ── 反面控制 ③ 零业务消费的模块当取代者 ────────────────── */
{
  const led = { modules: {
    'a.js': { module: 'a.js', load_surface_only: true, business_call_sites: 0 },
    'c.js': { module: 'c.js', load_surface_only: false, business_call_sites: 0 },
  } };
  const goodWhy = '这是一条足够长的实质理由，说明该模块为何休眠、谁在承担同一能力、以及复活条件是什么，避免出现灰色留存。';
  const disp = {
    disposition_vocabulary: ['declared_dormant'],
    reason_kind_vocabulary: ['superseded_by_active_duplicate'],
    grey_tags: disposition.grey_tags,
    entries: { 'a.js': { disposition: 'declared_dormant', reason_kind: 'superseded_by_active_duplicate', why: goodWhy, superseded_by: ['c.js'], declared_api: [] } },
  };
  const r = auditDispositions({ rootDir: ROOT, ledger: led, disposition: disp, loadModules: false });
  assert('负控制③：取代者零业务消费 → 拒判为取代证据',
    (r.violations.supersederNotActive || []).some((v) => v.superseder === 'c.js'), r.violations.supersederNotActive);
}

/* ── 反面控制 ④ 声明 API 抄错 ───────────────────────────── */
{
  const disp = JSON.parse(JSON.stringify(disposition));
  disp.entries['recall-route-feedback-bench.js'].declared_api = ['rankByRoute', 'recordFeedbackTypo'];
  const r = auditDispositions({ rootDir: ROOT, ledger, disposition: disp });
  assert('负控制④：声明 API 抄错 → 源码面报错',
    (r.violations.apiMissingInSource || []).some((v) => v.api === 'recordFeedbackTypo'), r.violations.apiMissingInSource);
  assert('负控制④：正确名字不误报',
    !(r.violations.apiMissingInSource || []).some((v) => v.api === 'rankByRoute'), r.violations.apiMissingInSource);
}

/* ── 反面控制 ⑤ 已接线却仍休眠（声明腐坏） ──────────────── */
{
  const led = JSON.parse(JSON.stringify(ledger));
  led.modules['memory-task-workbench.js'].business_call_sites = 4;
  const r = auditDispositions({ rootDir: ROOT, ledger: led, disposition, loadModules: false });
  assert('负控制⑤：已长出业务调用点 → 报声明腐坏',
    (r.violations.staleDeclaration || []).some((v) => v.module === 'memory-task-workbench.js'), r.violations.staleDeclaration);
}

/* ── 反面控制 ⑥ 漏处置 / 幽灵条目 ──────────────────────── */
{
  const disp = JSON.parse(JSON.stringify(disposition));
  delete disp.entries['meaning-evolution-map.js'];
  disp.entries['no-such-module.js'] = disp.entries['recall-route-feedback-bench.js'];
  const r = auditDispositions({ rootDir: ROOT, ledger, disposition: disp, loadModules: false });
  assert('负控制⑥：漏处置 → 报灰色留存',
    (r.violations.missing || []).some((v) => v.module === 'meaning-evolution-map.js'), r.violations.missing);
  assert('负控制⑥：幽灵条目 → 报条目过期',
    (r.violations.ghost || []).some((v) => v.module === 'no-such-module.js'), r.violations.ghost);
}

/* ── 反面控制 ⑦ fail-closed：探针扫不到装载面模块 ───────── */
{
  const led = { modules: { 'x.js': { module: 'x.js', load_surface_only: false, business_call_sites: 2 } } };
  const r = auditDispositions({ rootDir: ROOT, ledger: led, disposition, loadModules: false });
  assert('负控制⑦：装载面模块扫成 0 → fail-closed exit 2（不许「通过」）',
    r.status === 'fail_closed' && r.exitCode === 2, { status: r.status, exitCode: r.exitCode });
}

console.log('\n' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail > 0 ? 1 : 0);