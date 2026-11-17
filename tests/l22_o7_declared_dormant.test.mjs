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
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { breakSource } from './_break_kit.mjs';
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
/* ★ [v3.474.0 · L23-O2] 本项收口后这 11 个模块已**归档**（撤出 extra_js）：它们各自都被 ≥2 个
 *   在役模块替代（reason_kind = superseded_by_active_duplicate），继续留在装载面只是让每份
 *   宿主多背一份永不调用的副本，load_surface_only 计数也只能靠白名单维持在 11。
 *   断言不再要求「11 个仍可装载」，而是改成**归档面**（牙齿保留）：
 *   ① 装载面 0 条休眠；② 归档集恰为 11 个且逐个不在 manifest、文件仍在盘；
 *   ③ 理由仍是实质理由；④ superseded_by 指向的模块必须都**在役**（否则「被替代」是假理由）。 */
const ARCHIVED = Object.keys(disposition.entries).filter((k) => disposition.entries[k].disposition === 'archived');
const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
/* dormantCount 在扫描器里数的是**处置条目数**（历史口径），O2 之后这 11 条全是归档条目：
 * 故此处要求「装载面 0 条 + 处置条目恰 11 条」，两边都钉住，避免「静默消失」被读成「已清空」。 */
assert('装载面休眠 0 条，处置条目 11 条（全为归档）', real.checked === 0 && real.dormantCount === 11, { checked: real.checked, entries: real.dormantCount });
assert('归档集恰为 11 个', ARCHIVED.length === 11, { archived: ARCHIVED.length });
assert('归档模块全部不在 manifest.extra_js', ARCHIVED.every((k) => !(mf.extra_js || []).includes(k)), ARCHIVED.filter((k) => (mf.extra_js || []).includes(k)));
assert('归档模块文件均仍在盘（归档 ≠ 删除）', ARCHIVED.every((k) => fs.existsSync(path.join(ROOT, k))), ARCHIVED.filter((k) => !fs.existsSync(path.join(ROOT, k))));
assert('归档理由均为实质理由（≥' + MIN_WHY_CHARS + ' 字，且不是标签）',
  ARCHIVED.every((k) => { const w = String(disposition.entries[k].why || '').trim(); return [...w].length >= MIN_WHY_CHARS && !isGreyReason(w, disposition.grey_tags); }),
  ARCHIVED.map((k) => [k, [...String(disposition.entries[k].why || '').trim()].length]));
assert('归档理由的替代方必须都在役（否则「被替代」是假理由）',
  ARCHIVED.every((k) => { const sup = disposition.entries[k].superseded_by || []; return sup.length > 0 && sup.every((x) => (ledger.modules[x] || {}).business_call_sites > 0); }),
  ARCHIVED.filter((k) => { const sup = disposition.entries[k].superseded_by || []; return !(sup.length && sup.every((x) => (ledger.modules[x] || {}).business_call_sites > 0)); }));
assert('台账不再有任何 load_surface_only 条', Object.keys(ledger.modules).filter((k) => ledger.modules[k].load_surface_only === true).length === 0, null);

/* ── 反面控制 ① 灰标签理由 ──────────────────────────────── */
const greyWhy = 'load_surface_only';
assert('灰标签被识别（load_surface_only）', isGreyReason(greyWhy, disposition.grey_tags) === true);
assert('实质理由不被误伤', isGreyReason(disposition.entries[ARCHIVED[0]].why, disposition.grey_tags) === false);

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
  /* [v3.474.0 · L23-O2] 同⑤：真台账已无休眠行，④ 必须用合成行，否则「声明 API 抄错」这条判据空转。 */
  const victim = "recall-route-feedback-bench.js"; // 该模块源码里真有 rankByRoute
  const led = JSON.parse(JSON.stringify(ledger));
  led.modules[victim] = Object.assign({}, led.modules[victim] || {}, { module: victim, load_surface_only: true, business_call_sites: 0 });
  led.load_surface_only_count = 1;
  const disp = JSON.parse(JSON.stringify(disposition));
  disp.entries[victim].disposition = "declared_dormant";
  disp.entries[victim].declared_api = ["rankByRoute", "recordFeedbackTypo"];
  const r = auditDispositions({ rootDir: ROOT, ledger: led, disposition: disp, loadModules: false });
  assert("负控制④：声明 API 抄错 → 源码面报错",
    (r.violations.apiMissingInSource || []).some((v) => v.api === "recordFeedbackTypo"), r.violations.apiMissingInSource);
  assert("负控制④：正确名字不误报",
    !(r.violations.apiMissingInSource || []).some((v) => v.api === "rankByRoute"), r.violations.apiMissingInSource);
}

/* ── 反面控制 ⑤ 已接线却仍休眠（声明腐坏） ──────────────── */
/* ── 反面控制 ⑤ 已接线却仍休眠（声明腐坏） ──────────────── */
/* [v3.474.0 · L23-O2] 真台账已没有休眠行，本组改用**合成行**（把一条归档模块临时装作仍在装载面），
 *  否则「声明腐坏」这条判据会随休眠清零而退化成空转。 */
{
  const victim = 'recall-route-feedback-bench.js'; // 该模块源码里真有 rankByRoute
  const led = JSON.parse(JSON.stringify(ledger));
  led.modules[victim] = Object.assign({}, led.modules[victim] || {}, { module: victim, load_surface_only: true, business_call_sites: 4, why: "synthetic-fixture" });
  led.load_surface_only_count = 1;
  const disp = JSON.parse(JSON.stringify(disposition));
  disp.entries[victim].disposition = "declared_dormant";
  const r = auditDispositions({ rootDir: ROOT, ledger: led, disposition: disp, loadModules: false });
  assert("负控制⑤：已长出业务调用点 → 报声明腐坏",
    (r.violations.staleDeclaration || []).some((v) => v.module === victim), r.violations.staleDeclaration);
}

/* ── 反面控制 ⑥ 归档面不自洽（O2 之后的 fail-closed 形态） ───────── */
{
  const disp = JSON.parse(JSON.stringify(disposition));
  disp.entries[ARCHIVED[0]].superseded_by = ["definitely-not-a-module.js"];
  const r = auditDispositions({ rootDir: ROOT, ledger, disposition: disp, loadModules: false });
  assert("负控制⑥：归档面不自洽 → fail-closed exit 2",
    r.status === "fail_closed" && r.exitCode === 2 && /归档面不自洽/.test(String(r.error || "")), { error: r.error, violations: r.violations });
}

/* ── 反面控制 ⑦ fail-closed：探针扫不到装载面模块 ───────── */
{
  const led = { modules: { 'x.js': { module: 'x.js', load_surface_only: false, business_call_sites: 2 } } };
  const r = auditDispositions({ rootDir: ROOT, ledger: led, disposition, loadModules: false });
  assert('负控制⑦：装载面模块扫成 0 → fail-closed exit 2（不许「通过」）',
    r.status === 'fail_closed' && r.exitCode === 2, { status: r.status, exitCode: r.exitCode });
}


/* ── 负控制 ⑧ 门禁本体被打瞎后，① 必须转绿（两向自证） ─────────────
 * 为什么补这一组：scan_fixture_sync 的 E4 判「这个门禁有没有观测点」——
 *   上面 ①–⑦ 全是**喂坏数据**，没有一处**打坏判据本身**。于是一个问题没人回答：
 *   若把灰理由那条判据改成恒假，① 还会不会红？不会的话，① 的红就不是那条判据在守。
 * 手法：真破坏门禁源码（breakSource，锚点须恰中 1 次）→ 写到临时 .mjs →
 *   带 query 动态 import（换掉模块实例，不吃缓存）→ 用**同一个坏数据**重跑。 */
{
  const gatePath = path.join(ROOT, 'tests', 'audit', 'scan_module_disposition.mjs');
  const gateSrc = fs.readFileSync(gatePath, 'utf8');
  const blind = breakSource(gateSrc, 'if (isGreyReason(why, greyTags) || [...why].length < MIN_WHY_CHARS) {', 'if (false) {', '灰理由判据');
  const tmp = path.join(os.tmpdir(), 'l22o7_gate_broken_' + process.pid + '.mjs');
  fs.writeFileSync(tmp, blind, 'utf8');
  let brokenMod = null;
  try {
    brokenMod = await import(pathToFileURL(tmp).href + '?v=' + process.pid);
  } finally {
    /* 模块已加载进内存，源文件可以立刻删（不留在盘上被别的扫描面当垃圾） */
    try { fs.unlinkSync(tmp); } catch (_e) { /* 清理失败不影响结论 */ }
  }
  const led = { modules: { 'a.js': { module: 'a.js', load_surface_only: true, business_call_sites: 0 }, 'b.js': { module: 'b.js', load_surface_only: false, business_call_sites: 3 } } };
  const disp = {
    disposition_vocabulary: ['declared_dormant'],
    reason_kind_vocabulary: ['superseded_by_active_duplicate'],
    grey_tags: disposition.grey_tags,
    entries: { 'a.js': { disposition: 'declared_dormant', reason_kind: 'superseded_by_active_duplicate', why: 'load_surface_only', superseded_by: ['b.js'], declared_api: [] } },
  };
  const r = brokenMod.auditDispositions({ rootDir: ROOT, ledger: led, disposition: disp, loadModules: false });
  assert('负控制⑧：门禁的灰理由判据被打瞎后，同一个坏数据转绿（两向自证）',
    (r.violations.greyReason || []).length === 0, r.violations.greyReason);
}

console.log('\n' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail > 0 ? 1 : 0);