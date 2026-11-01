/* ============================================================
 * tests/v34271_plan_baseline.test.mjs — L13-O7: PLAN 三行基线直连验收
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeLonshaBaseline, checkPlanBaseline } from '../tools/gen_plan_baseline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLAN_FILE = path.join(ROOT, 'PLAN.md');

function withPlan(content, fn) {
  const original = fs.readFileSync(PLAN_FILE, 'utf8');
  try { fs.writeFileSync(PLAN_FILE, content, 'utf8'); return fn(); }
  finally { fs.writeFileSync(PLAN_FILE, original, 'utf8'); }
}

test('L13-O7: PLAN.md 版本、门禁、体量三行必须与磁盘真读完全一致', () => {
  const chk = checkPlanBaseline();
  assert.equal(chk.ok, true, 'PLAN.md 基线不应漂移：' + (chk.errors || []).join('; '));
});

test('L13-O7: 三行必须包含当前真源读数，且旧体量读数绝迹', () => {
  const content = fs.readFileSync(PLAN_FILE, 'utf8');
  const baseline = computeLonshaBaseline();
  assert.match(content, new RegExp(`\\*\\*v${baseline.version.replaceAll('.', '\\.' )}\\*\\*`));
  assert.ok(content.includes(`**${baseline.testFileCount} 测试文件 / ${baseline.auditMjsCount - baseline.auditUnderscoreCount} 个 audit 脚本**`));
  assert.ok(content.includes(`磁盘 ${baseline.auditMjsCount} \`.mjs\``));
  assert.ok(content.includes(`**${baseline.indexLines} 行**`));
  assert.ok(content.includes(`**${baseline.memberCount}** 成员`));
  assert.ok(content.includes(`extra_js **${baseline.extraJsCount}** 项`));
  assert.ok(!content.includes('**12122 行**'));
  assert.ok(!content.includes('**723** 成员'));
  assert.ok(!content.includes('extra_js **243** 项'));
});

test('L13-O7: 负控制 — 版本、门禁、体量任一行被篡改都必须转红', () => {
  const original = fs.readFileSync(PLAN_FILE, 'utf8');
  const cases = [
    ['版本', original.replace(/\| 版本 \|.*\|/, '| 版本 | **v9.9.9**（篡改） | test |')],
    ['门禁', original.replace(/\| 门禁 \|.*\|/, '| 门禁 | 在役面 **999 测试文件 / 999 个 audit 脚本**（磁盘 999 `.mjs` + 0 `.cjs`） | test |')],
    ['体量', original.replace(/\| 体量 \|.*\|/, '| 体量 | `index.js` **99999 行** / **0** 成员;+ extra_js **0** 项 | test |')],
  ];
  for (const [label, tampered] of cases) {
    const chk = withPlan(tampered, () => checkPlanBaseline());
    assert.equal(chk.ok, false, `${label}行篡改后必须转红`);
    assert.ok(chk.errors.length >= 1, `${label}行篡改后必须有具名错误`);
  }
});

test('L13-O7: 版本判据确实读取 index.js，而不是写死版本号', () => {
  const indexFile = path.join(ROOT, 'index.js');
  const originalIndex = fs.readFileSync(indexFile, 'utf8');
  const originalPlan = fs.readFileSync(PLAN_FILE, 'utf8');
  try {
    fs.writeFileSync(indexFile, originalIndex.replace("const VERSION = '3.433.0'", "const VERSION = '9.9.9'"), 'utf8');
    const tamperedPlan = originalPlan.replace(/\| 版本 \|.*\|/, '| 版本 | **v9.9.9**（index.js VERSION 真源） | index.js |');
    fs.writeFileSync(PLAN_FILE, tamperedPlan, 'utf8');
    assert.equal(checkPlanBaseline().ok, true, '改动 VERSION 后，匹配的新版本行应通过');
  } finally {
    fs.writeFileSync(indexFile, originalIndex, 'utf8');
    fs.writeFileSync(PLAN_FILE, originalPlan, 'utf8');
  }
});
