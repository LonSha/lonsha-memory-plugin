/* ============================================================
 * tests/l23_o1_index_layer_blocker.test.mjs — v3.474.0
 * —— 第二十三期 L23-O1：`index.js` 四层拆分的前提核验 + 行数天花板重定基
 * ------------------------------------------------------------
 * 计划原文（.agents/notes/proposed/architecture/2026-11-17-product-optimization-v23.md）：
 *   「L23-O1 拆 `index.js`（13546 行）为装配/注册/生命周期/事件四层，只搬不改，
 *     导出面逐字不变 + 快照零差异」。
 *
 * 【本项执行中**推翻了计划书的前提**，如实记在这里（不许悄悄改口径）】
 *   实勘（acorn 对 index.js 做精确闭包计算，不是目测）：
 *     · `MemoryEngine`      L1705–L10204 = 8500 行
 *     · `LonShaMemoryPlugin` L11273–L12654 = 1382 行，自由名 = **48 个 IIFE 局部名**
 *       + **22 个跨 classic script 全局名**（`LonShaRubyPhoneBridge` /
 *       `TemporalFlashbulbDilationEngine` …，全部以 `typeof X !== 'undefined'` 形态惰性取用）。
 *     · 而入口 L12685 `const plugin = new LonShaMemoryPlugin();` 是**装载期同步实例化**，
 *       L12690 立刻 `window.LonShaMemory = plugin` 交给宿主；`manifest.extra_js`
 *       按本仓装载模型在入口脚本**之后**才加载（见 `index_split_ledger.wiring.lazy`）。
 *   ⇒ 把这两个类搬到 extra_js 模块，装载期就会「类缺席」，宿主拿不到实例。
 *     那不是「搬代码」，是**改装载语义** —— 计划要求的是「只搬不改」，故该前提不成立。
 *     旁证：L22-O1 的 b3/b5 已用同一套闭包实测得出「闭包为空的候选 = 0」，辅助层这条
 *     矿脉到顶；再拆必须先建「装载期可用的注入面」（结构变更），不是一个刀能回。
 *
 * 【于是本项的真实可交付物 = 把 R2 那条存量红**诚实地**收掉，而不是假装拆完了】
 *   R2「index.js 行数只降不涨」的天花板 12963 **自 4440a35（那版 13350 行）起从未达成过**，
 *   一直红着，红到没人再信它。处理方式只有两种，本项选后者并写明理由：
 *     ① 硬拆到 12963（前提已被证伪，做不到）；
 *     ② **重定基**：把天花板改成实测值，并升级为 ratchet（涨一行即红）。
 *   ②不等于「抬账抹平」：账里必须同时写 from/to/证据/为什么不能靠拆达成，
 *   且本判据钉住三条 —— 天花板 == 实测行数、值必须小于拆前行数、阻断理由必须写清。
 *
 * 判据清单（每条带负控制，禁止恒绿）：
 *   A1 台账 rebase 记录齐全（from / to / measured / evidence≥2 条 / why_not_silent）
 *   A2 ratchet：台账天花板 === index.js 实测行数，且 < lines_before_split
 *   A3 not_done.four_layer_split 写了阻断理由（≥120 字，且不是灰标签）
 *   B1 行为级证据：真跑装载器 ⇒ 入口装载完成时 `window.LonShaMemory` **已存在**
 *      （这一条正是「装载期实例化」的机器证据，不是读注释）
 *   B2 台账里有「extra_js 在入口之后加载」的装载顺序读数
 *   C1 负控制：天花板 = 实测 + 1 ⇒ A2 必须红
 *   C2 负控制：天花板改回 12963（未达成值）⇒ A2 必须红
 *   C3 负控制：删掉 not_done.four_layer_split ⇒ A3 必须红
 *   C4 负控制：把阻断理由换成灰标签（「以后再拆」）⇒ A3 必须红
 * ============================================================ */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ok = (m) => console.log('  ✓ ' + m);

/* 出生版本（本档生于 v3.474.0）。
 * ★ 写成**数值数组**而不是 vnum（当版字面量）自锚，理由：版本守卫 V4 要求「当版锚点恰好 1 处」，
 *   而 L23-O5 的判据已经占着那个锚（它是本批第一刀，也是「首次上界门」的出生档）。
 *   两个都锚 ⇒ V4 判「多处锚会在抬版时分叉」。
 *   本档要守的是「仓库版本不回退到本档出生之前」，用数值下界即够，不必抢锚。 */
const BIRTH = [3, 474, 0];
const parseVer = (v) => String(v).split('.').map(Number);

test('Z1 出生版本下界：仓库版本不得回退到本档出生（v3.474.0）之前', () => {
  const cur = parseVer(JSON.parse(read('manifest.json')).version);
  const cmp = (cur[0] - BIRTH[0]) || (cur[1] - BIRTH[1]) || (cur[2] - BIRTH[2]);
  assert.ok(cmp >= 0, '仓库版本 ' + cur.join('.') + ' 不得回退到 v' + BIRTH.join('.') + ' 之前');
  assert.deepEqual(BIRTH, [3, 474, 0]);
  ok('出生版本下界 v' + BIRTH.join('.') + ' 成立（当前 ' + cur.join('.') + '）');
});

const LEDGER_PATH = path.join(ROOT, 'tests/audit/index_split_ledger.json');
const INDEX_PATH = path.join(ROOT, 'index.js');
const LOADER = path.join(ROOT, 'tests/_index_loader.cjs');
const ledger = JSON.parse(read('tests/audit/index_split_ledger.json'));
const idxText = read('index.js');
const idxLines = idxText.split('\n').length;

/* 灰标签：这些词本身不是理由（「以后再拆」= 没给理由） */
const GREY = ['以后再拆', '后续处理', '待后续', '待定', 'TODO', 'TBD', '暂不处理', '暂缓'];

/** A 面单点真源：重定基必须自洽。C1/C2 拿篡改后的数据反着打同一段代码。 */
function judgeRebase(led, lines) {
  const problems = [];
  const rb = led.rebase || null;
  if (!rb) problems.push('台账缺 rebase 记录（重定基必须留账，不许悄悄改数）');
  else {
    if (!Number.isFinite(rb.from) || !Number.isFinite(rb.to)) problems.push('rebase.from / rebase.to 必须是数字');
    if (!(rb.measured_index_lines === led.index_lines_max)) {
      problems.push('rebase.measured_index_lines(' + rb.measured_index_lines + ') 必须等于 index_lines_max('
        + led.index_lines_max + ') —— 否则账里记的和闸用的是两个数');
    }
    if (!Array.isArray(rb.evidence) || rb.evidence.length < 2) problems.push('rebase.evidence 至少两条机器证据');
    if (!String(rb.why_not_silent || '').trim()) problems.push('rebase.why_not_silent 为空（抬天花板必须说明为什么不是抹平）');
  }
  /* ratchet：天花板必须等于**当前实测**，不是「不超过」 */
  if (led.index_lines_max !== lines) {
    problems.push('index_lines_max(' + led.index_lines_max + ') 必须 === 实测 ' + lines
      + ' 行（ratchet：涨一行即红；小于实测等于闸比现实松，等于实测才是「不许再涨」）');
  }
  if (!(led.index_lines_max < led.lines_before_split)) {
    problems.push('重定基后的天花板(' + led.index_lines_max + ') 必须仍小于拆前行数(' + led.lines_before_split + ')');
  }
  return problems;
}

test('A1/A2 台账重定基自洽 + ratchet（天花板 === 实测行数 且 < 拆前）', () => {
  const problems = judgeRebase(ledger, idxLines);
  assert.deepEqual(problems, [], '重定基口径不自洽：\n- ' + problems.join('\n- '));
  ok('rebase ' + ledger.rebase.from + ' → ' + ledger.index_lines_max + '（实测 ' + idxLines + ' 行，拆前 '
    + ledger.lines_before_split + ' 行）');
});

test('A3 not_done 写清四层拆分被阻断的实质理由（不是灰标签）', () => {
  const why = String(ledger.not_done?.four_layer_split || '');
  assert.ok([...why].length >= 120, '阻断理由必须写清（≥120 字），实得 ' + [...why].length + ' 字');
  const grey = GREY.filter((w) => why.includes(w));
  assert.deepEqual(grey, [], '阻断理由里出现灰标签：' + grey.join(','));
  assert.ok(/装载期/.test(why), '阻断理由必须点到「装载期」这个真原因（否则读者会以为只是没空）');
  ok('阻断理由 ' + [...why].length + ' 字，点明装载期实例化');
});

test('B1 ★★★ 行为级证据：入口装载完成时宿主已拿到实例（= 装载期实例化，不是读注释）', () => {
  const out = path.join(ROOT, '.l23_o1_surface.json');
  try { fs.unlinkSync(out); } catch (_e) { /* 不存在即可 */ }
  const r = spawnSync(process.execPath, [LOADER, out], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
  assert.equal(r.status, 0, '装载器必须 rc=0：' + String(r.stderr || '').slice(-400));
  const surface = JSON.parse(fs.readFileSync(out, 'utf8'));
  try { fs.unlinkSync(out); } catch (_e) { /* 清理失败不影响结论 */ }
  /* 装载器只 `require('../index.js')`：不调 init、不手动 new、不 await。
   *   ⇒ 装载完成那一刻 `globalThis.LonShaMemory` 若已是 object，它只能是入口自己的
   *   `new LonShaMemoryPlugin()` 造的。这就是「类不能离开入口文件」的机器证据。 */
  assert.ok(surface.surface && Object.keys(surface.surface).length > 0, '装载器必须产出导出面');
  assert.equal(surface.surface.LonShaMemory, 'object',
    '装载完成时宿主实例必须已存在（window.LonShaMemory 为 object）；实得 '
    + JSON.stringify(surface.surface.LonShaMemory) + '，导出面键数 ' + Object.keys(surface.surface).length);
  /* 结构性旁证：实例化点在 IIFE 体一层（4 空格缩进），不在任何函数里 —— 所以它随入口装载执行。 */
  const topLevelNew = idxText.split('\n').filter((l) => /^ {4}const plugin = new LonShaMemoryPlugin\(\);$/.test(l));
  assert.equal(topLevelNew.length, 1,
    '入口必须在 IIFE 顶层（4 空格缩进）同步实例化插件；实得 ' + topLevelNew.length + ' 处');
  ok('装载期已产出宿主实例（LonShaMemory=object）⇒ 插件类必须与入口同文件');
});

test('B2 台账记着装载顺序（extra_js 在入口之后 ⇒ 晚到的东西装载期不可用）', () => {
  const wiring = JSON.stringify(ledger.wiring || {});
  assert.ok(/extra_js/.test(wiring), 'wiring 里必须写明 extra_js 的加载时机');
  const lazyText = String(ledger.wiring?.lazy || '');
  assert.ok(/extra_js/.test(lazyText) && /之后/.test(lazyText),
    'wiring.lazy 必须写明「extra_js 在入口脚本之后加载」——这是整条阻断论证的前提，实得：' + lazyText.slice(0, 80));
  ok('装载顺序读数在场：' + lazyText.slice(0, 40) + '…');
});

test('C1 负控制：天花板 = 实测 + 1 ⇒ A2 必须红（闸不能比现实松）', () => {
  const loose = JSON.parse(JSON.stringify(ledger));
  loose.index_lines_max = idxLines + 1;
  loose.rebase.measured_index_lines = loose.index_lines_max;
  const problems = judgeRebase(loose, idxLines);
  assert.ok(problems.length > 0, '负控制失败：天花板比实测松 1 行时判据仍绿 —— ratchet 是假牙');
  assert.ok(problems.some((p) => p.includes('ratchet')), '必须以 ratchet 口径报错，实得：' + problems.join(' | '));
});

test('C2 负控制：天花板改回 12963（从未达成过的值）⇒ A2 必须红', () => {
  const old = JSON.parse(JSON.stringify(ledger));
  old.index_lines_max = 12963;
  old.rebase.measured_index_lines = 12963;
  const problems = judgeRebase(old, idxLines);
  assert.ok(problems.some((p) => p.includes('ratchet')),
    '负控制失败：把天花板改回未达成值 12963 时判据没报 —— 那正是「红到没人信」的旧形态');
});

test('C3/C4 负控制：删掉阻断理由 / 换成灰标签 ⇒ A3 必须红', () => {
  const judgeWhy = (why) => {
    const problems = [];
    if (!why) problems.push('缺 not_done.four_layer_split');
    else {
      if ([...why].length < 120) problems.push('理由过短');
      if (GREY.some((w) => why.includes(w))) problems.push('出现灰标签');
      if (!/装载期/.test(why)) problems.push('没点明装载期');
    }
    return problems;
  };
  assert.deepEqual(judgeWhy(String(ledger.not_done?.four_layer_split || '')), [], '真数据必须通过（正向对照）');
  assert.ok(judgeWhy('').length > 0, '负控制失败：空理由竟然通过');
  assert.ok(judgeWhy('以后再拆，后续处理，' + 'x'.repeat(130)).length > 0, '负控制失败：灰标签理由竟然通过');
});
