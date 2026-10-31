/* ============================================================
 * tools/gen_plan_baseline.mjs — L11-O6: 文档体量读数直接由探针生成
 * ------------------------------------------------------------
 * 真实需求（L11-O6 / Problem 5）：
 *   PLAN.md:57-61 的体量表停留在 12122 行 / 723 成员 / 243 项，
 *   实测 index.js 真实物理行、host_beast_probe.cjs 成员数与 extra_js 长度均已漂移。
 *   本工具直接消费磁盘与探针真实读数改写 PLAN.md，并提供 --check 与 --write 接口。
 *
 * 用法：
 *   node tools/gen_plan_baseline.mjs          # 打印当前探针读数
 *   node tools/gen_plan_baseline.mjs --check  # 校验 PLAN.md 内数字是否与现场一致
 *   node tools/gen_plan_baseline.mjs --write  # 改写 PLAN.md 体量读数
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..');
const PLAN_FILE = path.join(ROOT, 'PLAN.md');

export function computeLonshaBaseline() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const indexLines = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8').split('\n').length;
  const extraJsCount = Array.isArray(manifest.extra_js) ? manifest.extra_js.length : 0;

  // 运行宿主巨兽探针获取成员数
  const probeRaw = execFileSync(process.execPath, [path.join(ROOT, 'tests/audit/host_beast_probe.cjs')], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const probeData = JSON.parse(probeRaw);
  const memberCount = probeData.member_count;

  const volumeLine = `| 体量 | \`index.js\` **${indexLines} 行**(探针读数;\`wc -l\` ${indexLines}) / **${memberCount}** 成员 —— 宿主巨兽探针实读对账;+ extra_js **${extraJsCount}** 项 | \`wc -l\` / \`manifest.json\` / \`tests/audit/host_beast_probe.cjs\` |`;

  return {
    version: manifest.version || pkg.version,
    indexLines,
    memberCount,
    extraJsCount,
    volumeLine,
  };
}

export function checkPlanBaseline() {
  const data = computeLonshaBaseline();
  if (!fs.existsSync(PLAN_FILE)) {
    return { ok: false, errors: ['PLAN.md 不存在'] };
  }
  const content = fs.readFileSync(PLAN_FILE, 'utf8');
  const errors = [];

  // 1. 检查 index.js 行数
  const linePattern = new RegExp(`index\\.js\`?\\s+\\*\\*${data.indexLines}\\s*行\\*\\*`);
  if (!linePattern.test(content)) {
    errors.push(`PLAN.md 未匹配 index.js 行数：期望 **${data.indexLines} 行**`);
  }

  // 2. 检查探针成员数
  const memberPattern = new RegExp(`\\*\\*${data.memberCount}\\*\\*\\s*成员`);
  if (!memberPattern.test(content)) {
    errors.push(`PLAN.md 未匹配成员数：期望 **${data.memberCount}** 成员`);
  }

  // 3. 检查 extra_js 项数
  const extraPattern = new RegExp(`extra_js\\s+\\*\\*${data.extraJsCount}\\*\\*\\s*项`);
  if (!extraPattern.test(content)) {
    errors.push(`PLAN.md 未匹配 extra_js 项数：期望 extra_js **${data.extraJsCount}** 项`);
  }

  return { ok: errors.length === 0, errors };
}

export function writePlanBaseline() {
  const data = computeLonshaBaseline();
  let content = fs.readFileSync(PLAN_FILE, 'utf8');

  // 改写体量行
  content = content.replace(
    /\|\s*体量\s*\|.*\|.*\|/,
    data.volumeLine
  );

  fs.writeFileSync(PLAN_FILE, content, 'utf8');
  return { ok: true };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv[2];
  if (arg === '--write') {
    writePlanBaseline();
    console.log('[tools/gen_plan_baseline] PLAN.md 体量读数已按探针现场更新。');
    const chk = checkPlanBaseline();
    if (!chk.ok) {
      console.error('[tools/gen_plan_baseline] 写入后自检失败：', chk.errors);
      process.exit(1);
    }
    console.log('[tools/gen_plan_baseline] 写入后自检全部通过。');
  } else if (arg === '--check') {
    const chk = checkPlanBaseline();
    if (!chk.ok) {
      console.error('[tools/gen_plan_baseline] PLAN.md 与探针读数漂移：\n  ' + chk.errors.join('\n  '));
      process.exit(1);
    }
    console.log('[tools/gen_plan_baseline] PLAN.md 与探针读数一致。');
  } else {
    const data = computeLonshaBaseline();
    console.log('当前计算的基线读数：', data);
  }
}