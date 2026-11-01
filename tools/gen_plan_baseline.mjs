/* ============================================================
 * tools/gen_plan_baseline.mjs — L13-O7: PLAN 版本、门禁与体量基线
 * ------------------------------------------------------------
 * 版本、门禁和体量三行都从当前磁盘真源生成/核对，避免 PLAN.md 静默漂移。
 * 用法：node tools/gen_plan_baseline.mjs [--check|--write]
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..');
const PLAN_FILE = path.join(ROOT, 'PLAN.md');
const TESTS_DIR = path.join(ROOT, 'tests');
const AUDIT_DIR = path.join(TESTS_DIR, 'audit');

function oneRow(content, label) {
  const rows = content.split('\n').filter((line) => line.trimStart().startsWith(`| ${label} |`));
  if (rows.length !== 1) throw new Error(`PLAN.md 应有且仅有一行「${label}」表行，实际 ${rows.length} 行`);
  return rows[0];
}
function replaceOneRow(content, label, nextRow) {
  const rows = content.split('\n');
  let hits = 0;
  const out = rows.map((line) => {
    if (line.trimStart().startsWith(`| ${label} |`)) { hits++; return nextRow; }
    return line;
  });
  if (hits !== 1) throw new Error(`PLAN.md 应有且仅有一行「${label}」表行，实际 ${hits} 行`);
  return out.join('\n');
}
function versionFromIndex() {
  const source = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
  const match = /const VERSION = '([0-9]+\.[0-9]+\.[0-9]+)'/.exec(source);
  if (!match) throw new Error('index.js 中找不到 VERSION 真源');
  return match[1];
}
function diskCounts() {
  const tests = fs.readdirSync(TESTS_DIR);
  const audits = fs.existsSync(AUDIT_DIR) ? fs.readdirSync(AUDIT_DIR) : [];
  return {
    testFileCount: tests.filter((name) => name.endsWith('.test.mjs')).length,
    auditMjsCount: audits.filter((name) => name.endsWith('.mjs')).length,
    auditCjsCount: audits.filter((name) => name.endsWith('.cjs')).length,
    auditUnderscoreCount: audits.filter((name) => name.endsWith('.mjs') && name.startsWith('_')).length,
  };
}
function probeMemberCount() {
  const raw = execFileSync(process.execPath, [path.join(ROOT, 'tests/audit/host_beast_probe.cjs')], { cwd: ROOT, encoding: 'utf8' });
  const data = JSON.parse(raw);
  if (!Number.isInteger(data.member_count)) throw new Error('宿主巨兽探针未返回整数 member_count');
  return data.member_count;
}
export function computeLonshaBaseline() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const version = versionFromIndex();
  const counts = diskCounts();
  const indexLines = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8').split('\n').length;
  const extraJsCount = Array.isArray(manifest.extra_js) ? manifest.extra_js.length : 0;
  const memberCount = probeMemberCount();
  const versionLine = `| 版本 | **v${version}**（index.js VERSION 真源） | index.js |`;
  const activeAudits = counts.auditMjsCount - counts.auditUnderscoreCount;
  const gateLine = `| 门禁 | 在役面 **${counts.testFileCount} 测试文件 / ${activeAudits} 个 audit 脚本**（\`tests/audit\` 磁盘 ${counts.auditMjsCount} \`.mjs\` + ${counts.auditCjsCount} \`.cjs\`，其中 ${counts.auditUnderscoreCount} 个 \`_\` 前缀探针不参与执行）—— 磁盘枚举读数 | \`tests/\` 与 \`tests/audit/\` 实读 |`;
  const volumeLine = `| 体量 | \`index.js\` **${indexLines} 行**(探针读数;\`wc -l\` ${indexLines}) / **${memberCount}** 成员 —— 宿主巨兽探针实读对账;+ extra_js **${extraJsCount}** 项 | \`wc -l\` / \`manifest.json\` / \`tests/audit/host_beast_probe.cjs\` |`;
  return { version, pkgVersion: pkg.version, manifestVersion: manifest.version, indexLines, memberCount, extraJsCount, ...counts, versionLine, gateLine, volumeLine };
}
export function checkPlanBaseline() {
  let data;
  try { data = computeLonshaBaseline(); } catch (error) { return { ok: false, errors: [error.message] }; }
  if (!fs.existsSync(PLAN_FILE)) return { ok: false, errors: ['PLAN.md 不存在'] };
  const content = fs.readFileSync(PLAN_FILE, 'utf8');
  const errors = [];
  let versionRow, gateRow, volumeRow;
  try { versionRow = oneRow(content, '版本'); gateRow = oneRow(content, '门禁'); volumeRow = oneRow(content, '体量'); }
  catch (error) { return { ok: false, errors: [error.message] }; }
  if (!versionRow.includes(`**v${data.version}**`)) errors.push(`PLAN.md 版本行未匹配 index.js VERSION：期望 **v${data.version}**`);
  const activeAudits = data.auditMjsCount - data.auditUnderscoreCount;
  const expectedGate = `**${data.testFileCount} 测试文件 / ${activeAudits} 个 audit 脚本**`;
  if (!gateRow.includes(expectedGate)) errors.push(`PLAN.md 门禁行未匹配磁盘枚举：期望 ${expectedGate}`);
  if (!gateRow.includes('磁盘 ' + data.auditMjsCount + ' `.mjs`')) errors.push(`PLAN.md 门禁行未匹配 audit .mjs 磁盘数：期望 ${data.auditMjsCount}`);
  if (!volumeRow.includes(`\`index.js\` **${data.indexLines} 行**`)) errors.push(`PLAN.md 未匹配 index.js 行数：期望 **${data.indexLines} 行**`);
  if (!volumeRow.includes(`**${data.memberCount}** 成员`)) errors.push(`PLAN.md 未匹配成员数：期望 **${data.memberCount}** 成员`);
  if (!volumeRow.includes(`extra_js **${data.extraJsCount}** 项`)) errors.push(`PLAN.md 未匹配 extra_js 项数：期望 extra_js **${data.extraJsCount}** 项`);
  return { ok: errors.length === 0, errors };
}
export function writePlanBaseline() {
  const data = computeLonshaBaseline();
  let content = fs.readFileSync(PLAN_FILE, 'utf8');
  content = replaceOneRow(content, '版本', data.versionLine);
  content = replaceOneRow(content, '门禁', data.gateLine);
  content = replaceOneRow(content, '体量', data.volumeLine);
  fs.writeFileSync(PLAN_FILE, content, 'utf8');
  return { ok: true, data };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv[2];
  if (arg === '--write') {
    writePlanBaseline();
    console.log('[tools/gen_plan_baseline] PLAN.md 版本、门禁、体量三行已按磁盘真源更新。');
    const chk = checkPlanBaseline();
    if (!chk.ok) { console.error('[tools/gen_plan_baseline] 写入后自检失败：', chk.errors); process.exit(1); }
    console.log('[tools/gen_plan_baseline] 写入后自检全部通过。');
  } else if (arg === '--check') {
    const chk = checkPlanBaseline();
    if (!chk.ok) { console.error('[tools/gen_plan_baseline] PLAN.md 与现场基线漂移：\n  ' + chk.errors.join('\n  ')); process.exit(1); }
    console.log('[tools/gen_plan_baseline] PLAN.md 版本、门禁、体量三行一致。');
  } else console.log('当前计算的基线读数：', computeLonshaBaseline());
}