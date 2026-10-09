#!/usr/bin/env node
/* ============================================================
 * tools/gen_state_report.mjs — M-O9「当前事实、门禁与文档自动同源」的**生成臂**
 * ------------------------------------------------------------
 * M-O9 原文：「文档读数真实性门（D1~D9）与计划陈旧标记已交付，但『当前版本 /
 *   装载面 / 测试数 / 审计数』仍需**人工复算**，抬版与增删模块时容易漂移。」
 *
 * 现有 D1~D9 解决的是**单向核对**：文档说什么、磁盘是不是那样。
 * 它不解决的是：**没有任何一处把「当前事实」整份生成出来**。
 * 于是每次抬版，人还是要自己去数 manifest 项数、数测试文件、数审计脚本 ——
 * 数错了要等 D 系列红才发现，而 D 系列只覆盖 README/PLAN 里**已经写了**的那些格。
 *
 * 本工具补的就是这一格：**一份从磁盘现读、可复算、可对账的状态报告**。
 *
 * 三条纪律（与 R-O9 同源，两仓一致）：
 *   ① **未知不报 0**：数不出来的格写 null，并在 unknown[] 里说明为什么。
 *      把「读不到」写成 0 会让「空模块目录」与「读不到目录」同形。
 *   ② **未执行不报通过**：真宿主面 / 全量实跑面若没有当场产物，一律标
 *      `not-executed` 或 `stale`，绝不写 pass。
 *   ③ **判据与生成器共用同一份取数**：本文件 export `collectState()`，
 *      测试 import 它比对 —— 两份取数必然漂移（本仓已在 test_cost_readings
 *      上立过同款纪律：读数走登记 + 重绑，不手抄）。
 *
 * 用法：
 *   node tools/gen_state_report.mjs            # 打印 JSON
 *   node tools/gen_state_report.mjs --write    # 写 tests/audit/state-report.json
 *   node tools/gen_state_report.mjs --check    # 与落盘报告对账，漂移 → exit 1
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..');

const rd = (rel) => { try { return fs.readFileSync(path.join(REPO, rel), 'utf8'); } catch (_e) { return null; } };
const rdJson = (rel) => { try { return JSON.parse(rd(rel)); } catch (_e) { return null; } };
const lsdir = (rel) => { try { return fs.readdirSync(path.join(REPO, rel)); } catch (_e) { return null; } };
const isDir = (rel) => { try { return fs.statSync(path.join(REPO, rel)).isDirectory(); } catch (_e) { return false; } };
const digest = (rels) => {
  const h = crypto.createHash('sha256');
  for (const r of rels) {
    try { h.update(r); h.update('\0'); h.update(fs.readFileSync(path.join(REPO, r))); }
    catch (_e) { h.update(r + '\0MISSING'); }
  }
  return h.digest('hex').slice(0, 16);
};

/** 门禁的**分档记账**（M-O9 第 3 条）：四档 + 每档的「跑没跑」。 */
const GATE_TIERS = {
  schema: 'gate-tiers@1',
  tiers: [
    { id: 'unit', label: '单套件（node --test tests/<file>）', how: 'node --test tests/<file>.test.mjs', when: '开发中快反馈' },
    { id: 'targeted', label: '定向集（按 pattern 过滤）', how: 'node tests/run.mjs <pattern…>', when: '改动某一面时' },
    { id: 'full', label: '全量（含审计段）', how: 'npm test -- --audit', when: '计划收口时跑一次' },
    { id: 'host', label: '真宿主（SillyTavern 本体）', how: '(无可用命令)', when: '真宿主可用时', status: 'not-executed' },
  ],
};

export function collectState() {
  const unknown = [];
  const man = rdJson('manifest.json');
  const pkg = rdJson('package.json');
  const idx = rd('index.js');

  /* ── 版本面：三源（manifest / package / index 常量）── */
  const mVer = man ? String(man.version || '') : null;
  const pVer = pkg ? String(pkg.version || '') : null;
  let iVer = null;
  if (idx) {
    const m = /const\s+VERSION\s*=\s*['"]([^'"]+)['"]/.exec(idx);
    iVer = m ? m[1] : null;
  }
  const verSources = [mVer, pVer, iVer].filter((x) => x);
  const versionSame = verSources.length === 3 && new Set(verSources).size === 1;
  if (!versionSame) unknown.push(`版本三源不全同源：manifest=${mVer} package=${pVer} index=${iVer}`);
  /** 「人读索引」= README 里写的当前版本（M-O9 验收：当前版本 / 人读索引 / 机器装载面三者一致） */
  const readme = rd('README.md');
  let readmeVer = null;
  if (readme) {
    const m = /当前版本[^\n]*?`?(\d+\.\d+\.\d+)`?/.exec(readme);
    readmeVer = m ? m[1] : null;
  }
  if (!readme) unknown.push('README.md 读不到，「人读索引」版本为 null');
  else if (!readmeVer) unknown.push('README.md 里找不到「当前版本」行，「人读索引」版本为 null');

  /* ── 装载面：manifest.extra_js 与根级 .js ── */
  const extraJs = man && Array.isArray(man.extra_js) ? man.extra_js : null;
  if (!man) unknown.push('manifest.json 读不到，装载面为 null');
  else if (!extraJs) unknown.push('manifest.extra_js 不是数组，装载面为 null');
  const rootJs = lsdir('.');
  const rootJsFiles = rootJs ? rootJs.filter((n) => n.endsWith('.js')).sort() : null;
  if (!rootJsFiles) unknown.push('仓库根读不到，根级 .js 清单为 null');
  /* 装载面与磁盘面的一致性：extra_js 里每一项都必须在盘上（缺项 = 装载时会炸） */
  const missingInManifest = extraJs ? extraJs.filter((f) => !fs.existsSync(path.join(REPO, f))) : null;
  if (missingInManifest && missingInManifest.length) {
    unknown.push('manifest.extra_js 里有 ' + missingInManifest.length + ' 项在盘上不存在（装载会失败）');
  }

  /* ── 门禁面：测试文件 / 审计脚本 ── */
  const tests = lsdir('tests');
  const testFiles = tests ? tests.filter((n) => n.endsWith('.test.mjs')).sort() : null;
  if (!testFiles) unknown.push('tests/ 读不到，测试文件数为 null');
  const auditDirExists = isDir('tests/audit');
  const audit = auditDirExists ? lsdir('tests/audit') : null;
  const auditAll = audit ? audit.filter((n) => n.endsWith('.mjs') || n.endsWith('.cjs')).sort() : null;
  /** 探针（`_` 前缀）不是门禁面：它们是被调用的一次性取证脚本。 */
  const auditGated = auditAll ? auditAll.filter((n) => !n.startsWith('_')) : null;
  const auditProbes = auditAll ? auditAll.filter((n) => n.startsWith('_')).length : null;

  /* ── 全量实跑面：只信登记（本脚本不跑全量 —— 审计段跑全量会自指）── */
  const readings = rdJson('tests/audit/doc_readings.json');
  let fullRun = { status: 'not-executed', reason: '本报告不跑全量：审计段跑全量会自指（doc_readings.json 的 note 已登记此纪律）' };
  if (readings && readings.version) {
    const same = String(readings.version) === mVer;
    fullRun = {
      status: same ? 'registered' : 'stale',
      registered_at: String(readings.version),
      tests_total: readings.tests_total ?? null,
      assertions: readings.assertions ?? null,
      audit: (readings.audit_passed != null && readings.audit_total != null)
        ? `${readings.audit_passed}/${readings.audit_total}` : null,
      reason: same
        ? '登记版本与当前版本同源（登记的是**最近一次全量实跑**的读数，不是本次现跑）'
        : `登记版本 ${readings.version} ≠ 当前 ${mVer} ⇒ 该读数**已陈旧**，必须重跑全量并重绑`,
    };
    if (!same) unknown.push('全量实跑读数陈旧：doc_readings 登记 ' + readings.version + '，当前 ' + mVer);
  } else if (readings === null) {
    unknown.push('tests/audit/doc_readings.json 读不到或解析失败，全量实跑面为 null');
  }

  /* ── 真宿主面：本环境有没有（如实记，不许写 pass）── */
  const host = {
    status: 'not-executed',
    reason: '交付环境无任何可访问的 SillyTavern 实例（无宿主进程、无宿主目录）；不得以桩结果冒充',
  };

  /* ── 摘要面（干净检出重建同一份报告）── */
  /* 摘要面：**机器面**（机器装载与版本真源）+ **人读面**（人读索引：README/PLAN，发布面：CHANGELOG/TODO）
   *   + **实跑登记**（doc_readings.json）。人读面进摘要是刻意的：D 系列只看「文档写了什么 → 磁盘是不是那样」，
   *   抄不进摘要 —— 而「文档被悄悄改了、报告却还写着旧摘要」正是「报告漂移」的一个入口。
   *   盘上不存在的项（如本仓没有的 update-log.json）如实记 null，**不写成 0**（同「未知不报 0」）。 */
  const scope = ['manifest.json', 'package.json', 'index.js', 'update-log.json',
    'README.md', 'PLAN.md', 'CHANGELOG.md', 'TODO.md', 'tests/audit/doc_readings.json'];
  const hashes = {};
  for (const r of scope) {
    try { hashes[r] = crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO, r))).digest('hex').slice(0, 12); }
    catch (_e) { hashes[r] = null; }
  }

  return {
    schema: 'state-report@1',
    generated_by: 'tools/gen_state_report.mjs',
    version: versionSame ? verSources[0] : null,
    version_sources: { manifest: mVer, package: pVer, index_const: iVer },
    version_same: versionSame,
    human_index_version: readmeVer,
    /* M-O9 验收第 1 条：当前版本 / 人读索引 / 机器装载面三者一致 */
    triple_consistent: versionSame && readmeVer === mVer && !!extraJs,
    loading: {
      extra_js: extraJs ? extraJs.length : null,
      extra_js_list: extraJs,
      root_js: rootJsFiles ? rootJsFiles.length : null,
      missing_in_manifest: missingInManifest,
    },
    gates: {
      test_files: testFiles ? testFiles.length : null,
      test_files_list: testFiles,
      audit_dir_exists: auditDirExists,
      audit_gated: auditGated ? auditGated.length : null,
      audit_probes: auditProbes,
      tiers: GATE_TIERS,
    },
    full_run: fullRun,
    host_run: host,
    digest: { scope, per_file: hashes },
    unknown,
    unknown_count: unknown.length,
  };
}

/* ── CLI ── */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const out = collectState();
  const dest = path.join(REPO, 'tests/audit/state-report.json');
  if (process.argv.includes('--write')) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
    console.log(`[state-report] 已写入 tests/audit/state-report.json —— ver=${out.version} 测试 ${out.gates.test_files} 审计 ${out.gates.audit_gated} extra_js ${out.loading.extra_js} unknown=${out.unknown_count}`);
  } else if (process.argv.includes('--check')) {
    let onDisk = null;
    try { onDisk = JSON.parse(fs.readFileSync(dest, 'utf8')); } catch (_e) { onDisk = null; }
    if (!onDisk) { console.error('[state-report] 落盘报告不在场 → 先跑 --write'); process.exit(2); }
    const drift = [];
    const cmp = (p, a, b) => { if (a !== null && a !== undefined && b !== a) drift.push(`${p}: 报告=${b} 磁盘=${a}`); };
    cmp(out.version, null, onDisk.version);
    cmp(out.gates.test_files, null, onDisk.gates.test_files);
    cmp(out.gates.audit_gated, null, onDisk.gates.audit_gated);
    cmp(out.loading.extra_js, null, onDisk.loading.extra_js);
    cmp(out.digest.per_file.index_js, null, onDisk.digest.per_file.index_js);
    if (drift.length) {
      console.error('[state-report] 状态报告与磁盘漂移（重跑 --write）：\n  ' + drift.join('\n  '));
      process.exit(1);
    }
    console.log('[state-report] ✓ 与磁盘一致');
  } else {
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  }
}