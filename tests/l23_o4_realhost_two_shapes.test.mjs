/* ============================================================
 * tests/l23_o4_realhost_two_shapes.test.mjs — v3.474.0
 * —— 第二十三期 L23-O4：`realhost` 读数**接门**，且 `available` / `unavailable` **两态不同形**
 * ------------------------------------------------------------
 * 计划原文：「`L23-O4` `realhost` 读数接门：`available` 必须真有读数过阈值、`unavailable` 必须记
 *   `cause`，**两态不同形**」。
 *
 * 【修前是什么样（本项立项依据，不是假设）】
 *   `tests/audit/realhost_readings.json` 在本刀之前**没有任何门在读**：它由 `_realhost_suite.mjs` 落盘，
 *   然后就没下文了。于是「跑不了」的读数会一直躺在仓里，而每一版 CHANGELOG 都可以照抄「真机未跑」——
 *   没人发现「其实连成因都没记清」，也没有任何东西拦得住「把跑不了的读数写成看起来跑过」。
 *
 * 【两项验收落成什么】
 *   ① **接门**：本文件读真读数，按形状判定；两侧形状的判定真源住
 *      `tests/audit/_realhost_readings_shape.mjs`（阈值仍由 `_realhost_judge.mjs` 的三个 judge 给，
 *      不在这里重写第二份 —— 同一事实两处实现是本仓明令禁止的形态）。
 *   ② **两态不同形**：环境态**不得**出现跑过态的键（blocks/readings/ok/defects/pageErrors），
 *      跑过态**不得**出现环境态的键（cause/causeAction/causeWhy/env/reason）。这条是硬的：
 *      否则「没跑」与「跑过」在账本上同形，下一版必然把前者读成后者。
 *
 * 判据清单：
 *   A1 真读数可判（三态之内），且它现在是环境态 —— 环境态成因面必须齐（cause/group/action/why/reason）
 *   A2 落盘者唯一：`realhost_readings.json` 只能由 `_realhost_suite.mjs` 写（别处写 = 第二份真源）
 *   B1 两态键面互斥（正反两向，用合成对象）
 *   C1 跑过态：三块真读数过阈值（正向合成用例必须绿）
 *   C2 跑过态：`globals < 85` 必须红（阈值真源是 MIN_GLOBALS，不是本文件里的数字）
 *   D1 负控制：环境态缺 cause ⇒ 红
 *   D2 负控制：环境态偷带 `readings` ⇒ 红（「跑不了」伪装成「跑过」）
 *   D3 负控制：跑过态偷带 `cause` ⇒ 红
 *   D4 负控制：跑过态 blocks 全 false ⇒ 红（这份读数什么也没回答）
 *   D5 负控制：`product-defect` 但 defects 为空 ⇒ 红（缺陷被吞）
 * ============================================================ */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  judgeReadingsShape, regroupReadings, ENV_ONLY_KEYS, RAN_ONLY_KEYS,
} from './audit/_realhost_readings_shape.mjs';
import { MIN_GLOBALS, CAUSE_ACTION, ENV_CAUSES, ALL_CAUSES } from './audit/_realhost_judge.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ok = (m) => console.log('  ✓ ' + m);
const clone = (o) => JSON.parse(JSON.stringify(o));

const READING = JSON.parse(read('tests/audit/realhost_readings.json'));

/* 合成的「跑过态」基线：三块读数都满足阈值（阈值本身不在这里重写，判定由 judge 给）。 */
function ranFixture(patch = {}) {
  return {
    schema: 'realhost-readings@1',
    version: '3.474.0',
    blocks: { load: true, write: true, worldline: true },
    readings: [
      { block: 'load', key: 'globals', value: MIN_GLOBALS + 3, source: 'fixture' },
      { block: 'load', key: 'status', value: 'ok', source: 'fixture' },
      { block: 'load', key: 'hasUI', value: true, source: 'fixture' },
      { block: 'write', key: 'same', value: { ret: true, markInCurrentAfter: true }, source: 'fixture' },
      { block: 'write', key: 'swap', value: { ret: false, markInCurrentAfter: false, confirmed: null, entryStatus: 'deferred' }, source: 'fixture' },
      { block: 'write', key: 'drain', value: { calls: [{ slotChatId: 'c1', curChatId: 'c1' }] }, source: 'fixture' },
      /* worldline 的读数形状（真源：_realhost_judge.judgeWorldline）——
       *   每格是 { bucket, why }，四格缺一即红；另需 epochAdvance.applied === true。 */
      {
        block: 'worldline',
        key: 'buckets',
        value: {
          era1: { bucket: 'blocked', why: 'fixture:跨纪元' },
          now: { bucket: 'kept', why: 'fixture:本纪元' },
          beta: { bucket: 'blocked', why: 'fixture:中间纪元' },
          nolocate: { bucket: 'undecided', why: 'fixture:无楼层无线标' },
        },
        source: 'fixture',
      },
      { block: 'worldline', key: 'epochAdvance', value: { applied: true, why: 'fixture', conflict: null }, source: 'fixture' },
    ],
    defects: [],
    pageErrors: [],
    ok: true,
    verdict: 'success',
    ...patch,
  };
}

test('A1 真读数可判：三态之内且当前是环境态，成因面必须齐（缺 cause 的「跑不了」= 没说清为什么）', () => {
  const r = judgeReadingsShape(READING);
  assert.ok(r.mode !== 'unknown', '真读数必须落在三态之内，实 ' + r.mode + '：' + r.problems.join(' | '));
  assert.equal(r.mode, 'env', '当前环境应当是「跑不了」（无 ST / 无浏览器）；若真跑过了请更新本判据的口径，'
    + '而不是让它两边都算过');
  assert.deepEqual(r.problems, [], '环境态成因面不自洽：\n- ' + r.problems.join('\n- '));
  assert.ok(ALL_CAUSES.includes(READING.cause), 'cause 必须是 ALL_CAUSES 之一，实 ' + READING.cause);
  assert.equal(READING.causeGroup, ENV_CAUSES.includes(READING.cause) ? 'env' : 'non-env', 'causeGroup 必须与 cause 同源');
  assert.equal(READING.causeAction, CAUSE_ACTION[READING.cause], 'causeAction 必须逐字等于处置表（不许各写一份）');
  ok('真读数 mode=env / cause=' + READING.cause + ' / 处置=「' + String(READING.causeAction).slice(0, 18) + '…」');
});

test('A2 落盘者唯一：realhost_readings.json 只能由 _realhost_suite.mjs 写', () => {
  /* 扫描口径（v21_o1 ⑦ 与 v3436 都栽过「只搜字面量」）：
   *   真源码很少把文件名直接写在 writeFileSync 里，典型写法是
   *     const OUT_JSON = path.join(HERE, 'realhost_readings.json');
   *     fs.writeFileSync(OUT_JSON, ...)
   *   所以判「谁写」必须**两件同时成立**：
   *     (1) 文件里存在一条绑定的右值命中 realhost_readings.json → 记下绑定名；
   *     (2) writeFileSync 的首参是那个绑定名（或直接是字面量路径）。
   *   只满足其一的都不算写入者（如 _realhost_readings_shape.mjs 只 import 不写）。
   * 空清单不许当绿：下面有「必须看见真落盘者」的正向对照。 */
  const strip = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const writers = [];
  let scanned = 0;
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
      if (name.name === 'node_modules' || name.name === '.git') continue;
      const p = path.join(dir, name.name);
      if (name.isDirectory()) { if (!/^\.|^docs$/.test(name.name)) walk(p); continue; }
      if (!/\.(mjs|js|cjs)$/.test(name.name)) continue;
      scanned += 1;
      const src = strip(fs.readFileSync(p, 'utf8'));
      /* (1) 字面量路径 —— 涵盖 writeFileSync('x/realhost_readings.json') 写法 */
      const hitLiteral = /['"`][^'"`\n]*realhost_readings\.json/.test(src);
      /* (2) 绑定名：const|let|var NAME = …… realhost_readings.json ……（同一行） */
      const binders = [];
      const reBind = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*realhost_readings\.json/g;
      let m;
      while ((m = reBind.exec(src))) binders.push(m[1]);
      let writes = false;
      if (hitLiteral && /writeFileSync\([^)]*realhost_readings\.json/.test(src)) writes = true;
      for (const b of binders) {
        const reW = new RegExp('writeFileSync\\(\\s*' + b.replace(/\$/g, '\\$') + '\\b');
        if (reW.test(src)) writes = true;
      }
      if (writes) writers.push(path.relative(ROOT, p));
    }
  };
  walk(ROOT);
  /* 排除本文件自身：它把「写这个文件」的判定当**被测样本**写在源码里，
   *   不排除的话扫描器会把「判据里描述这件事」误判成「判据自己也去写」——
   *   那是把元信息当被测对象（v21_o1 的 ⑦ 也栽过同一形态）。 */
  const filtered = writers.filter((w) => !/l23_o4_realhost_two_shapes/.test(w));
  /* 正向对照：扫描面必须真的看得见那个落盘者。看不见 = 扫描器坏了，
   *   此时 deepEqual 的「唯一」没有任何信息量（空清单假绿）。 */
  assert.ok(filtered.includes('tests/audit/_realhost_suite.mjs'),
    '扫描器没看见真落盘者 _realhost_suite.mjs —— 空清单不许当绿（扫了 ' + scanned + ' 个文件，命中 ' + writers.join(', ') + '）');
  assert.deepEqual(filtered, ['tests/audit/_realhost_suite.mjs'],
    '读数落盘者必须唯一（否则账本有两个真源，形状判定会被绕过）：' + writers.join(', '));
  ok('落盘者唯一：' + filtered[0] + '（扫 ' + scanned + ' 个脚本，变量绑定与字面量两条路都认）');
});

test('B1 两态键面互斥（环境态不含跑过态的键；跑过态不含环境态的键）', () => {
  const env = judgeReadingsShape(READING);
  assert.equal(env.ok, true, '真环境态必须自洽：' + env.problems.join(' | '));
  for (const k of RAN_ONLY_KEYS) {
    assert.ok(!Object.prototype.hasOwnProperty.call(READING, k),
      '环境态读数出现了跑过态的键 ' + k + ' —— 两态必须不同形');
  }
  const ran = ranFixture();
  for (const k of ENV_ONLY_KEYS) {
    assert.ok(!Object.prototype.hasOwnProperty.call(ran, k), '跑过态夹具不该带 ' + k + '（夹具自身要保持互斥形）');
  }
  assert.equal(judgeReadingsShape(ran).ok, true, '合法跑过态必须自洽：' + judgeReadingsShape(ran).problems.join(' | '));
  ok('两态键面互斥（环境态 ' + ENV_ONLY_KEYS.length + ' 键 / 跑过态 ' + RAN_ONLY_KEYS.length + ' 键）');
});

test('C1 跑过态：三块真读数必须过阈值（正向合成用例）', () => {
  const good = judgeReadingsShape(ranFixture());
  assert.deepEqual(good.problems, [], '合规跑过态必须全绿：' + good.problems.join(' | '));
  assert.deepEqual(good.checkedBlocks, ['load', 'write', 'worldline'], '三块都要真判（不许只判一块就宣布通过）');
  const grouped = regroupReadings(ranFixture().readings);
  assert.equal(grouped.load.globals, MIN_GLOBALS + 3, '平铺读数必须能还原成三块（还原真源唯一）');
  ok('跑过态三块过阈值（globals=' + (MIN_GLOBALS + 3) + ' ≥ ' + MIN_GLOBALS + '）');
});

test('C2 跑过态：globals 低于阈值必须红（阈值真源是 MIN_GLOBALS）', () => {
  const low = ranFixture();
  low.readings = low.readings.map((r) => (r.block === 'load' && r.key === 'globals'
    ? { ...r, value: MIN_GLOBALS - 1 } : r));
  const r = judgeReadingsShape(low);
  assert.equal(r.ok, false, 'globals 低于 ' + MIN_GLOBALS + ' 竟然通过 —— 阈值形同虚设');
  /* 报错文案真源在 _realhost_judge.judgeLoad（写的是「LonSha* 全局数 84 < 85」），
     断言只认「globals」字面量会误红——这里按语义认：全局数 / globals 任一。 */
  assert.ok(r.problems.some((p) => /全局数|globals/i.test(p)), '必须点名全局数塌陷，实：' + r.problems.join(' | '));
});

test('D1 负控制：环境态缺 cause ⇒ 红', () => {
  const bad = clone(READING);
  delete bad.cause;
  const r = judgeReadingsShape(bad);
  assert.equal(r.ok, false, '缺 cause 的环境态竟然通过');
  assert.ok(r.problems.some((p) => p.includes('cause')), '必须点名 cause 缺失');
});

test('D2 负控制：环境态偷带 readings ⇒ 红（「跑不了」伪装成「跑过」）', () => {
  const bad = clone(READING);
  bad.readings = [];
  const r = judgeReadingsShape(bad);
  assert.equal(r.ok, false, '环境态带 readings 竟然通过 —— 这正是「两态同形」的漏洞');
  assert.ok(r.problems.some((p) => p.includes('跑过态')), '必须按「两态不同形」口径报错');
});

test('D3 负控制：跑过态偷带 cause ⇒ 红', () => {
  const bad = ranFixture({ cause: 'no-st-endpoint' });
  const r = judgeReadingsShape(bad);
  assert.equal(r.ok, false, '跑过态带 cause 竟然通过');
  assert.ok(r.problems.some((p) => p.includes('环境态')), '必须按「两态不同形」口径报错');
});

test('D4 负控制：跑过态 blocks 全 false ⇒ 红（这份读数什么也没回答）', () => {
  const bad = ranFixture({ blocks: { load: false, write: false, worldline: false } });
  const r = judgeReadingsShape(bad);
  assert.equal(r.ok, false, 'blocks 全 false 竟然通过');
  assert.ok(r.problems.some((p) => p.includes('一块')), '必须点名「一块都没跑」');
});

test('D5 负控制：product-defect 但 defects 为空 ⇒ 红（缺陷被吞）', () => {
  const bad = ranFixture({ verdict: 'product-defect', ok: false, defects: [] });
  const r = judgeReadingsShape(bad);
  assert.equal(r.ok, false, 'product-defect 却没有缺陷条目竟然通过');
  assert.ok(r.problems.some((p) => p.includes('product-defect')), '必须点名结论与读数矛盾');
});

test('E1 判定体不重写阈值（同一事实两处实现是本仓明令禁止的形态）', () => {
  const shape = read('tests/audit/_realhost_readings_shape.mjs');
  assert.ok(/from '\.\/_realhost_judge\.mjs'/.test(shape), '形状判定必须 import 阈值真源，不得自带一份');
  assert.ok(!/MIN_GLOBALS\s*=\s*\d+/.test(shape), '形状判定文件里不得再定义 MIN_GLOBALS');
  assert.ok(!/85/.test(shape.replace(/\/\*[\s\S]*?\*\//g, '')), '去掉注释后不得出现写死的 85（阈值必须来自真源）');
  ok('阈值单一真源：judgeLoad / judgeWrite / judgeWorldline 直接调用');
});
