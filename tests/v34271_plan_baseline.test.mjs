/* ============================================================
 * tests/v34271_plan_baseline.test.mjs — L13-O7: PLAN 三行基线直连验收
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeLonshaBaseline, checkPlanBaseline } from '../tools/gen_plan_baseline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLAN_FILE = path.join(ROOT, 'PLAN.md');

/* [v3.467.0 并发竞态修复] 副本树夹具：负控制的篡改只落在副本里。
 *   历史教训（本轮全量两度翻红的真因）：此前的负控制**直接篡改真仓** index.js / PLAN.md
 *   再还原 —— 与并发档（v3430/v3439~v3445 的六源同源判据）赛跑，谁在篡改窗口里读盘谁假红，
 *   集体报「VERSION 实 9.9.9」。负控制纪律本来就要求「破坏发生在独立 fixture 目录」，
 *   这里补齐：最小副本只搬判据真正读的文件（PLAN.md / index.js / package.json /
 *   manifest.json / tests/audit/host_beast_probe.cjs + _audit_lib.mjs），
 *   成员数探针在副本与真仓逐字节同源（VERSION 字符串不参与成员切分）。 */
function makeReplicaRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v34271-replica-'));
  /* 会被篡改的两个文件必须**真拷贝**：writeFileSync 会写穿符号链接、伤到真仓。
   * 其余顶层条目（tests/、各模块 .js、manifest、package…）全部符号链接 ——
   * 副本的门禁计数与探针面因此与真仓逐字节同源，且零拷贝开销。 */
  for (const f of ['PLAN.md', 'index.js']) {
    fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  }
  for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (e.name === 'PLAN.md' || e.name === 'index.js' || e.name === '.git' || e.name === 'node_modules') continue;
    fs.symlinkSync(path.join(ROOT, e.name), path.join(dir, e.name), e.isDirectory() ? 'dir' : 'file');
  }
  return dir;
}
function destroyReplicaRoot(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/* [v3.467.0] 原 withPlan（对真仓 PLAN.md 的写盘还原助手）已随负控制整体搬进
 *   makeReplicaRoot 副本树而删除 —— 真仓在并发下永远只读。 */

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

test('L13-O7: 负控制 — 版本、门禁、体量任一行被篡改都必须转红（副本树，不碰真仓）', () => {
  /* [v3.467.0] withPlan 真仓写盘版搬进副本树：withPlan 留给对真仓只读的判据用。 */
  const dir = makeReplicaRoot();
  try {
    const planFile = path.join(dir, 'PLAN.md');
    const original = fs.readFileSync(planFile, 'utf8');
    const cases = [
      ['版本', original.replace(/\| 版本 \|.*\|/, '| 版本 | **v9.9.9**（篡改） | test |')],
      ['门禁', original.replace(/\| 门禁 \|.*\|/, '| 门禁 | 在役面 **999 测试文件 / 999 个 audit 脚本**（磁盘 999 `.mjs` + 0 `.cjs`） | test |')],
      ['体量', original.replace(/\| 体量 \|.*\|/, '| 体量 | `index.js` **99999 行** / **0** 成员;+ extra_js **0** 项 | test |')],
    ];
    for (const [label, tampered] of cases) {
      fs.writeFileSync(planFile, tampered, 'utf8');
      const chk = checkPlanBaseline(dir);
      assert.equal(chk.ok, false, `${label}行篡改后必须转红`);
      assert.ok(chk.errors.length >= 1, `${label}行篡改后必须有具名错误`);
    }
  } finally { destroyReplicaRoot(dir); }
});

test('L13-O7: 版本判据确实读取 index.js，而不是写死版本号（副本树，不碰真仓）', () => {
  /* 【本判据自己付过的学费（v3.439.0 抬版时当场翻红）】
   *   原写法把「改造用的锚」写死成 `const VERSION = '3.433.0'`，于是**每次抬版这条判据就失效** ——
   *   replace 匹配不到 → index.js 没被改 → VERSION 仍是当版 → PLAN 却写成 9.9.9 → 判据转红。
   *   红得对（判据真的在比），但红的原因是**判据自己在抬版时坏掉**，这属于「抬版仪式」反模式。
   *   修法：锚从**当版真值**现场派生，任何版本号都能跑；且必须自证锚恰中 1 次（否则破坏没发生，
   *   这条自证会退化成恒绿）。
   * 【v3.467.0 并发竞态修复】原实现**直接篡改真仓 index.js**（写 9.9.9 再还原）——
   *   并发档在窗口里读盘即集体假红（实测两轮全量分别炸 12 档 / 1 档）。整个破坏
   *   搬进副本树：真仓全程只读，篡改自证与复原自证都在副本上做。 */
  const dir = makeReplicaRoot();
  try {
    const indexFile = path.join(dir, 'index.js');
    const planFile = path.join(dir, 'PLAN.md');
    const originalIndex = fs.readFileSync(indexFile, 'utf8');
    const originalPlan = fs.readFileSync(planFile, 'utf8');
    const cur = (/const VERSION = '([^']+)'/.exec(originalIndex) || [])[1];
    assert.ok(cur, 'index.js VERSION 真源必须在场');
    const anchor = "const VERSION = '" + cur + "'";
    assert.equal(originalIndex.split(anchor).length - 1, 1, '改造锚必须在真源里恰中 1 次（否则下面的破坏不会发生）');
    fs.writeFileSync(indexFile, originalIndex.replace(anchor, "const VERSION = '9.9.9'"), 'utf8');
    assert.ok(fs.readFileSync(indexFile, 'utf8').indexOf("const VERSION = '9.9.9'") > 0, '副本 index.js 必须真的被改成 9.9.9');
    const tamperedPlan = originalPlan.replace(/\| 版本 \|.*\|/, '| 版本 | **v9.9.9**（index.js VERSION 真源） | index.js |');
    fs.writeFileSync(planFile, tamperedPlan, 'utf8');
    assert.equal(checkPlanBaseline(dir).ok, true, '改动 VERSION 后，匹配的新版本行应通过（证明判据读的是 index.js 而不是常量）');
    // 复原自证：两个文件必须逐字回到原样（在副本上验证破坏是可逆的）
    fs.writeFileSync(indexFile, originalIndex, 'utf8');
    fs.writeFileSync(planFile, originalPlan, 'utf8');
    assert.equal(fs.readFileSync(indexFile, 'utf8'), originalIndex, '副本 index.js 必须逐字复原');
    assert.equal(fs.readFileSync(planFile, 'utf8'), originalPlan, '副本 PLAN.md 必须逐字复原');
  } finally { destroyReplicaRoot(dir); }
});
