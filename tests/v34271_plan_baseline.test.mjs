/* ============================================================
 * tests/v34271_plan_baseline.test.mjs — L11-O6: PLAN 体量探针直连验收
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeLonshaBaseline, checkPlanBaseline } from '../tools/gen_plan_baseline.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..');
const PLAN_FILE = path.join(ROOT, 'PLAN.md');

test('L11-O6: PLAN.md 体量读数必须与宿主探针及磁盘实读完全一致', () => {
  const chk = checkPlanBaseline();
  assert.equal(chk.ok, true, 'PLAN.md 体量读数不应漂移：' + (chk.errors || []).join('; '));
});

test('L11-O6: 历史陈旧读数（12122 行 / 723 成员 / 243 项）必须在 PLAN.md 彻底绝迹', () => {
  const content = fs.readFileSync(PLAN_FILE, 'utf8');
  assert.ok(!content.includes('**12122 行**'), '不得再有 12122 行陈旧读数');
  assert.ok(!content.includes('**723** 成员'), '不得再有 723 成员陈旧读数');
  assert.ok(!content.includes('extra_js **243** 项'), '不得再有 extra_js 243 项陈旧读数');

  const baseline = computeLonshaBaseline();
  assert.ok(content.includes(`**${baseline.indexLines} 行**`), '必须包含当前 index.js 真实行数');
  assert.ok(content.includes(`**${baseline.memberCount}** 成员`), '必须包含探针真实成员数');
  assert.ok(content.includes(`extra_js **${baseline.extraJsCount}** 项`), '必须包含真实 extra_js 模块数');
});

test('L11-O6: 负控制 — 篡改 PLAN.md 体量读数后，checkPlanBaseline 必须精准转红', () => {
  const original = fs.readFileSync(PLAN_FILE, 'utf8');
  try {
    const tampered = original.replace(/\|\s*体量\s*\|.*\|.*\|/, '| 体量 | `index.js` **99999 行** / **0** 成员;+ extra_js **0** 项 | `test` |');
    fs.writeFileSync(PLAN_FILE, tampered, 'utf8');

    const chk = checkPlanBaseline();
    assert.equal(chk.ok, false, '篡改后 checkPlanBaseline 必须转红');
    assert.ok(chk.errors.length >= 2, '必须报出至少两处未对齐项');
  } finally {
    fs.writeFileSync(PLAN_FILE, original, 'utf8');
  }
});