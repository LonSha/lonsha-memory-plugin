// tests/v3306_secret_knowledge_scope.test.mjs — M-O8 第一刀：秘密的「知识范围」注入侧隔离（v3.306.0）
//
//   计划第二期 M-O8 原文（「隐私、秘密与跨项目隔离审计」）四条验收里，第①③条是
//   「未获知的秘密不进入角色生成上下文」「同名异人 / 伪装身份 / 同一角色不同宇宙」，
//   第②条是「A 分支秘密不出现在 B」。**修前全仓实测**（探针 /tmp/probe_secret_leak.js）：
//
//     · 写入侧有纪律：`advance`/`reveal` 一旦 keeper 在场即拒写（reason `keeper-present`）；
//     · 注入侧**无任何纪律**：`WorldProgress.toInjection` 直调 `render(secretLedger, 5)`，
//       把秘密**正文**与「谁知道」写成一行注入，且与在场名单**完全无关**。
//       实测（守密人「阿绣」在场）：
//         【尚未揭露的秘密】\n- sec_1〔阿绣不知 · 0%〕养女实为仇家之后
//       —— 正文逐字进模型载荷，且**无禁令句**。对照同一处的另两面：
//         认知隔离面 wp_knowledge 带「切勿未卜先知」；平行事实隐藏面带「在场角色不得知晓」。
//         三面里只有秘密面没有。
//     · 更硬的一条：`recordSecretFact` 在**提取层根本没有生产口**（全仓零调用点，
//       而同代的 recordCommitmentFact 有 2 处、recordSeedFact 有 2 处、recordEcho 有 1 处），
//       故秘密账本在真实运行里**永远为空** —— 「不泄漏」是因为「压根没数据」。
//
//   本档判据面（14 条）：
//     A1 注入面结构：toInjection 不再直调名单无关的 render；走 renderForViewer + fail-closed
//     A2 导出面：赋能出口三件（knowledgeOf / filterForViewer / renderForViewer）+ line
//     A3 生产口：secrets 提取通道存在、与 knowledge_changes 同路、记账带 floor/eventKey
//     B1 knowledgeOf 三态（knower / listed / unlisted）**互不同形**
//     B2 filterForViewer：viewer 在册 / 不在册 / 缺省 / 无 viewer 四路 + 逐档计数
//     B3 renderForViewer：禁令头在位、命中的在册者进载荷、不在册者**逐条**挡住
//     B4 写入侧纪律未被本版削弱（keeper-present 拒推进/拒揭露）
//     B5 复封：knowers 只追加不覆盖（漏填的轮次不得清空既有知情事实）
//     C1 端到端：守密人单独在场 ⇒ 整条不注入（修前那一格是泄漏）
//     C2 端到端：在册知情者 ⇒ 注入且含正文与禁令头
//     C3 端到端：多秘密逐条判定（不全丢、也不全放）
//     C4 fail-closed：旧版模块（无 renderForViewer）⇒ 不渲染 + malformed 可见
//     D1 读数有真实读侧：_secretIsolationLine + 自检面「秘密隔离」行（不是写完没人调）
//     E1~E3 三条真源码破坏负控制（拆遮蔽分流 / 拆 fail-closed / 拆 knowers 追加）
//     F1 判据纯度（锚点字面量各恰出现 1 次）+ fail-closed
//     G1 版本锚（本档出生版本 + 三源同源）
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { breakOnce } from './_break_kit.mjs';   // 破坏形态唯一真源（v3247 B1 台账已登记）

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const idxSrc = read('index.js');
const orgSrc = read('memory-organs.js');
const slSrc = read('secret-ledger.js');
const cfgSrc = read('memory-config.js');
const manifest = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(read('package.json'));
const SELF = readFileSync(new URL(import.meta.url).pathname, 'utf8');

function vnum(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}
let pass = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };

/* 浏览器面装载：secret-ledger 走 window 全局（memory-organs 的取库口与产品同址）。 */
function freshWorld() {
  global.window = global;
  for (const k of Object.keys(require.cache)) {
    if (/(secret-ledger|ledger-entity|memory-organs)\.js$/.test(k)) delete require.cache[k];
  }
  global.window.LonShaSecretLedger = require(path.join(ROOT, 'secret-ledger.js'));
  global.window.LonShaLedgerEntity = require(path.join(ROOT, 'ledger-entity.js'));
  const organs = require(path.join(ROOT, 'memory-organs.js'));
  return { WP: organs.WorldProgress, secret: global.window.LonShaSecretLedger };
}
const { WP, secret } = freshWorld();
const blow = (id) => { const b = []; return { push: (x) => b.push(x), get: () => b, id }; };

// ══════════════════════════════════════════════════════════════════
test('v3306 A1~A3. ★★★★★ 注入面 / 导出面 / 生产口（修前三条全缺）', () => {
  // A1：toInjection 不得再直调名单无关的 render
  const toInj = orgSrc.slice(orgSrc.indexOf('    toInjection(knownChars = []) {'),
    orgSrc.indexOf('    // ===== 约定账本 (Promises Ledger) =====') > 0
      ? orgSrc.indexOf('    toInjection(knownChars = []) {') + 40000
      : orgSrc.length);
  const secretSeg = toInj.slice(toInj.indexOf('秘密账本'), toInj.indexOf('前文回扣账本'));
  assert.ok(secretSeg.length > 200, 'toInjection 里必须能找到秘密账本段');
  assert.ok(secretSeg.includes('renderForViewer'), 'A1 秘密面必须走 renderForViewer');
  assert.ok(!/secretApi\?\.render\?\.\(/.test(secretSeg), 'A1 不得再直调名单无关的 render');
  assert.ok(secretSeg.includes('fail-closed') || secretSeg.includes('malformed'),
    'A1 版本错配必须 fail-closed（宁可不注入）');

  // A2：导出面
  const apiBlock = slSrc.slice(slSrc.indexOf('const api = Object.freeze({'), slSrc.indexOf('root.LonShaSecretLedger = api;'));
  for (const k of ['knowledgeOf', 'filterForViewer', 'renderForViewer', 'line']) {
    assert.ok(new RegExp('(^|[\\s,])' + k + '([\\s,]|$)').test(apiBlock), 'A2 必须导出 ' + k);
  }
  assert.ok(slSrc.includes('const SECRET_HEAD'), 'A2 禁令头必须是常量（可核）');

  // A3：生产口（提取通道）
  assert.ok(cfgSrc.includes('secrets：'), 'A3 提取声明必须有 secrets 通道');
  assert.ok(cfgSrc.includes('keeper 必填'), 'A3 必须声明 keeper 必填');
  assert.ok(idxSrc.includes('extracted.secrets'), 'A3 应用块必须读 extracted.secrets');
  assert.ok(idxSrc.includes("this.recordSecretFact({"), 'A3 必须真调 recordSecretFact');
  assert.ok(idxSrc.includes("source: 'secrets'"), 'A3 必须带来源标记');
  assert.ok(idxSrc.includes("eventKey: 'seal:' + wpFloor"), 'A3 eventKey 须可幂等（含楼层）');
  assert.ok(idxSrc.includes('secretCount'), 'A3 记账面必须有 secretCount');
  ok('A1~A3 注入面 + 导出面 + 生产口');
});

test('v3306 B1. ★★★★ knowledgeOf 三态互不同形', () => {
  const { secret: S } = freshWorld();
  assert.equal(S.knowledgeOf({ knowers: ['阿绣'] }, '阿绣'), 'knower', '在册 ⇒ knower');
  assert.equal(S.knowledgeOf({ knowers: ['阿绣'] }, '李四'), 'listed', '在册但没他 ⇒ listed');
  assert.equal(S.knowledgeOf({ knowers: [] }, '阿绣'), 'unlisted', '未给名单 ⇒ unlisted');
  assert.equal(S.knowledgeOf({}, '阿绣'), 'unlisted', '无字段 ⇒ unlisted');
  assert.equal(S.knowledgeOf(null, '阿绣'), 'unlisted', '非对象 ⇒ unlisted（不抛）');
  assert.equal(S.knowledgeOf({ knowers: ['阿绣'] }, ''), 'listed', '空 viewer + 有名单 ⇒ listed（保守）');
  // 三态必须互不相等（否则「判不了」会被读成「挡下」）
  const trio = new Set([S.knowledgeOf({ knowers: ['a'] }, 'a'), S.knowledgeOf({ knowers: ['a'] }, 'b'), S.knowledgeOf({ knowers: [] }, 'a')]);
  assert.equal(trio.size, 3, '三态必须互不同形');
  ok('B1 knowledgeOf 三态');
});

test('v3306 B2. ★★★★ filterForViewer 四路 + 逐档计数', () => {
  const { secret: S } = freshWorld();
  const items = [{ id: 's1', knowers: ['阿绣'] }, { id: 's2', knowers: ['李四'] }, { id: 's3', knowers: [] }];
  const r1 = S.filterForViewer(items, '阿绣');
  assert.deepEqual(r1.visible.map((x) => x.id), ['s1'], 'viewer 在册 ⇒ 只见在册那条');
  assert.equal(r1.known, 1, 'known 计数');
  assert.equal(r1.notKnower, 1, 'notKnower 计数（s2）');
  assert.equal(r1.undecided, 1, 'undecided 计数（s3 未给名单）');
  assert.equal(r1.withheld, 2, 'withheld = notKnower + undecided');

  const r2 = S.filterForViewer(items, '王五');
  assert.deepEqual(r2.visible.map((x) => x.id), [], '不在任何名单 ⇒ 全遮蔽');
  const r3 = S.filterForViewer(items, '');
  assert.deepEqual(r3.visible.map((x) => x.id), ['s3'], '无 viewer ⇒ 只见公开面（未给名单）');
  assert.equal(r3.known, 0, '无 viewer 时 known 恒 0');
  assert.equal(r3.total, 3, 'total 如实');
  const r4 = S.filterForViewer(null, '阿绣');
  assert.deepEqual(r4.visible, [], '非数组 ⇒ 空、不抛');
  ok('B2 filterForViewer 四路');
});

test('v3306 B3. ★★★★ renderForViewer：禁令头 + 逐条判定', () => {
  const { secret: S, WP: W } = freshWorld();
  let st = S.seal(null, { secret: '给他看的', keeper: ['阿绣'], knowers: ['李四'] }).state;
  st = S.seal(st, { secret: '不给他看的', keeper: ['阿绣'], knowers: ['王五'] }).state;
  st = S.seal(st, { secret: '判不了的', keeper: ['阿绣'] }).state;
  const out = S.renderForViewer(st, '李四', 5);
  assert.ok(out.text.includes('严禁未卜先知') || out.text.includes('未列名者一概不知情'), 'B3 必须带禁令头');
  assert.ok(out.text.includes('给他看的'), 'B3 在册那条必须进载荷');
  assert.ok(!out.text.includes('不给他看的'), 'B3 不在册那条必须被逐条挡住（不是整段丢）');
  assert.ok(!out.text.includes('判不了的'), 'B3 未给名单那条不进载荷');
  assert.equal(out.read.rendered, 1, 'B3 rendered=1');
  assert.equal(out.read.withheld, 2, 'B3 withheld=2');
  assert.equal(out.read.undecided, 1, 'B3 undecided 单独成档（≠ 挡下）');
  // 空账 / 全遮蔽 ⇒ 文本为空串（不是只有头的空壳）。
  //   ★ 读侧方必须取**不在任何名单**的人：「王五」是不给他看的那条的在册知情者，
  //   用他会看到那条（首版判据就是这么写错的 —— 三态没分，「不在册」与「在册」混成一个名字）。
  assert.equal(S.renderForViewer(st, '赵六', 5).text, '', 'B3 全遮蔽 ⇒ 空串（不产生只有头的噪声块）');
  assert.equal(S.renderForViewer(null, '李四', 5).text, '', 'B3 空账 ⇒ 空串');
  ok('B3 renderForViewer');
});

test('v3306 B4. ★★★ 写入侧纪律未被本版削弱', () => {
  const { secret: S } = freshWorld();
  const st = S.seal(null, { secret: '甲', keeper: ['阿绣'] }).state;
  // keeper 在场 ⇒ 拒推进
  const a = S.advance(st, { secret: '甲', progress: 30, note: '线索', present: ['阿绣'] });
  assert.equal(a.ok, false, 'B4 keeper 在场必须拒推进');
  assert.equal(a.reason, 'keeper-present', 'B4 拒绝理由须逐字 keeper-present');
  // keeper 不在场 ⇒ 可推进
  const b = S.advance(st, { secret: '甲', progress: 30, note: '线索', present: ['李四'] });
  assert.equal(b.ok, true, 'B4 keeper 不在场应可推进');
  // keeper 在场 ⇒ 拒揭露
  const c = S.reveal(b.state, { secret: '甲', note: '说了', present: ['阿绣'] });
  assert.equal(c.ok, false, 'B4 keeper 在场必须拒揭露');
  ok('B4 写入侧纪律');
});

test('v3306 B5. ★★★ 复封：knowers 只追加不覆盖', () => {
  const { secret: S } = freshWorld();
  let st = S.seal(null, { secret: '丙', keeper: ['阿绣'], knowers: ['李四'] }).state;
  st = S.seal(st, { secret: '丙', keeper: ['阿绣'], knowers: ['王五'] }).state;
  const ks = st.items[0].knowers;
  assert.ok(ks.includes('李四') && ks.includes('王五'), 'B5 两批 knowers 都在（追加）');
  const st2 = S.seal(st, { secret: '丙', keeper: ['阿绣'], knowers: [] }).state;
  assert.ok(st2.items[0].knowers.includes('李四'), 'B5 后到的空 knowers 不得清空既有');
  ok('B5 knowers 追加语义');
});

test('v3306 C1~C4 + D1. ★★★★★ 端到端四路 + 真实读侧', () => {
  // C1：守密人单独在场（修前正是这一格泄漏）
  {
    const { secret: S, WP: W } = freshWorld();
    const wp = new W();
    wp.secretLedger = S.seal(null, { secret: '养女实为仇家之后', keeper: ['阿绣'] }).state;
    const inj = wp.toInjection(['阿绣']);
    const blk = inj.find((x) => x.id === 'wp_secret_ledger');
    assert.equal(blk, undefined, 'C1 守密人在场 + 未给知情名单 ⇒ 整条不注入');
    assert.equal(wp._secretRead.undecided >= 1, true, 'C1 判不了须计进 undecided');
    assert.equal(wp._secretRead.known, 0, 'C1 不得计成命中');
  }
  // C2：在册知情者
  {
    const { secret: S, WP: W } = freshWorld();
    const wp = new W();
    wp.secretLedger = S.seal(null, { secret: '养女实为仇家之后', keeper: ['阿绣'], knowers: ['阿绣'] }).state;
    const blk = wp.toInjection(['阿绣']).find((x) => x.id === 'wp_secret_ledger');
    assert.ok(blk, 'C2 在册知情者 ⇒ 注入');
    assert.ok(blk.text.includes('养女实为仇家之后'), 'C2 正文在位（真该漏给他）');
    assert.ok(/严禁未卜先知|未列名者一概不知情/.test(blk.text), 'C2 禁令头在位');
    assert.ok(!blk.text.includes('阿绣不知'), 'C2 不得出现自相矛盾标签');
  }
  // C3：多秘密逐条（不全丢也不全放）
  {
    const { secret: S, WP: W } = freshWorld();
    const wp = new W();
    let st = S.seal(null, { secret: '给他看的', keeper: ['阿绣'], knowers: ['李四'] }).state;
    st = S.seal(st, { secret: '不给他看的', keeper: ['阿绣'], knowers: ['王五'] }).state;
    wp.secretLedger = st;
    const blk = wp.toInjection(['李四']).find((x) => x.id === 'wp_secret_ledger');
    assert.ok(blk && blk.text.includes('给他看的'), 'C3 该漏的在位');
    assert.ok(blk && !blk.text.includes('不给他看的'), 'C3 不该漏的被挡住');
    assert.equal(wp._secretRead.withheld, 1, 'C3 挡下 1');
    assert.equal(wp._secretRead.known, 1, 'C3 命中 1');
  }
  // C4：旧版模块 fail-closed
  {
    const { WP: W } = freshWorld();
    const wp = new W();
    const real = global.window.LonShaSecretLedger;
    global.window.LonShaSecretLedger = { render: () => '【尚未揭露的秘密】\n- sec_1〔漏了〕裸奔正文' };
    const inj = wp.toInjection(['阿绣']);
    global.window.LonShaSecretLedger = real;
    assert.equal(inj.find((x) => x.id === 'wp_secret_ledger'), undefined, 'C4 旧版模块 ⇒ 不渲染（fail-closed）');
    assert.ok(wp._secretRead.malformed >= 1, 'C4 版本错配可见');
  }
  // D1：读数有真实读侧（不是写完没人调）
  assert.ok(idxSrc.includes('_secretIsolationLine() {'), 'D1 必须有诊断行方法');
  assert.ok(idxSrc.includes("return ['秘密隔离', line"), 'D1 必须接进自检面');
  assert.ok(typeof secret.line === 'function', 'D1 secret-ledger 必须导出 line');
  const l = secret.line({ rendered: 1, withheld: 2, known: 1, notKnower: 1, undecided: 1 });
  assert.ok(l.includes('判不了 1'), 'D1 「判不了」必须单独出现在行里');
  assert.ok(/模块未加载或版本错配/.test(secret.line({ malformed: 1 })), 'D1 版本错配行必须可辨');
  assert.ok(secret.line({}).includes('注入 0'), 'D1 空读数不得抛');
  ok('C1~C4 + D1');
});

test('v3306 E1~E3 + F1. ★★★★★ 三条真源码破坏负控制 + 判据纯度', () => {
  /* ★ 收编留痕（v3247 的 B2 判据当场点名过本档一次，是本档自己的自伤）：
   *   首版这里用 require 就地取真源、且局部变量与真源出口**同名** ——
   *   ① 那个同名声明命中 DEFINE_RE，被判成「本地重写破坏工具」；
   *   ② 动态 import 又不带 `from` 关键字 ⇒ B1 的接收方扫描不认本档（登记了反成掉队项）。
   *   两条合起来的正确解只有一条：**静态 import 真源 + 按台账登记**（与全仓其余档同形）。
   *   注：require / createRequire 仍用于加载被测模块（CJS 形态），那不是破坏工具，不在 B2 射程内。 */
  const BO = breakOnce;
  assert.equal(typeof BO, 'function', 'F1 _break_kit 必须提供 breakOnce');
  {
    // ★ H5 判据纯度：负控制锚点在本层只声明一次；E1~E3 与 F1 一律引用 ANCHORS，
    //   判据自身不得复述锚点串（复述 => F1 计数虚高 => 破坏「唯一命中」自证）。
    const ANCHORS = {
      pass: "      const pass = vw ? (k === 'knower') : (k === 'unlisted');",
      failClosed: "        } else if (secretApi) {",
      keepersAppend: "      if (knowers.length) existing.knowers = names((existing.knowers || []).concat(knowers));",
    };

    const mkWorld = (dir) => {
      const d = mkdtempSync(path.join(os.tmpdir(), 'v3306-'));
      cpSync(ROOT, d, { recursive: true, filter: (s) => !s.split(path.sep).includes('.git') });
      return d;
    };
    const withBroken = (dir, rel, from, to, fn) => {
      const p = path.join(dir, rel);
      const src = readFileSync(p, 'utf8');
      const broken = BO(src, from, to, rel);
      assert.notEqual(broken, src, 'F1 破坏必须真的改变源码（' + rel + '）');
      writeFileSync(p, broken);
      return fn(dir);
    };
    const loadWorld = (dir) => {
      global.window = global;
      for (const k of Object.keys(require.cache)) {
        if (k.startsWith(dir) || /(secret-ledger|ledger-entity|memory-organs)\.js$/.test(k)) delete require.cache[k];
      }
      global.window.LonShaSecretLedger = require(path.join(dir, 'secret-ledger.js'));
      global.window.LonShaLedgerEntity = require(path.join(dir, 'ledger-entity.js'));
      const organs = require(path.join(dir, 'memory-organs.js'));
      return { WP: organs.WorldProgress, secret: global.window.LonShaSecretLedger };
    };

    // E1：拆掉「缺席分流」——不在册的条目被放行（负控制必须红）
    {
      const dir = mkWorld();
      try {
        withBroken(dir, 'secret-ledger.js',
          ANCHORS.pass,
          "      const pass = true;   // [负控制 E1] 拆掉遮蔽", () => {
            const { secret: S, WP: W } = loadWorld(dir);
            const wp = new W();
            wp.secretLedger = S.seal(null, { secret: '不该漏的', keeper: ['阿绣'], knowers: ['王五'] }).state;
            const blk = wp.toInjection(['阿绣']).find((x) => x.id === 'wp_secret_ledger');
            assert.ok(blk && blk.text.includes('不该漏的'), 'E1 破坏后必须泄漏（否则判据空转）');
          });
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    // E2：拆掉 fail-closed —— 旧版模块走回裸奔渲染。
    //   ★ 破坏形状选「把旧路接回来」而不是「让守卫条件恒真」：
    //   后者会让代码去调不存在的 renderForViewer 抛 TypeError（破坏确实改了行为，
    //   但红的原因是崩了而不是漏了 —— 负控制要证的是**那条遮蔽路径真在起作用**）。
    {
      const dir = mkWorld();
      try {
        withBroken(dir, 'memory-organs.js',
          ANCHORS.failClosed,
          ANCHORS.failClosed + '\n' +
          "            if (typeof secretApi.render === 'function') { results.push({ id: 'wp_secret_ledger', text: secretApi.render(this.secretLedger, 5), source: 'worldprogress+secret-ledger' }); }   // [负控制 E2]", () => {
            const { WP: W } = loadWorld(dir);
            const wp = new W();
            const real = global.window.LonShaSecretLedger;
            global.window.LonShaSecretLedger = { render: () => '【尚未揭露的秘密】\n- 裸奔正文' };
            const inj = wp.toInjection(['阿绣']);
            global.window.LonShaSecretLedger = real;
            assert.ok(inj.find((x) => x.id === 'wp_secret_ledger'), 'E2 破坏后旧版模块必须被渲染（fail-closed 已失效）');
          });
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    // E3：拆掉 knowers 追加语义 —— 空 knowers 清空既有
    {
      const dir = mkWorld();
      try {
        withBroken(dir, 'secret-ledger.js',
          ANCHORS.keepersAppend,
          "      existing.knowers = names(knowers);   // [负控制 E3] 改成覆盖", () => {
            const { secret: S } = loadWorld(dir);
            let st = S.seal(null, { secret: '丙', keeper: ['阿绣'], knowers: ['李四'] }).state;
            st = S.seal(st, { secret: '丙', keeper: ['阿绣'], knowers: [] }).state;
            assert.equal(st.items[0].knowers.length, 0, 'E3 破坏后既有 knowers 必须被清空（追加语义已失效）');
          });
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }

    // F1：判据纯度 —— 负控制锚点字面量在本档里各恰出现 1 次
    const anchors = Object.values(ANCHORS);   // 字面量源头唯一：ANCHORS
    for (const a of anchors) {
      const n = SELF.split(a).length - 1;
      assert.equal(n, 1, 'F1 锚点字面量必须恰出现 1 次（含本档自身）：' + a.slice(0, 40));
    }
    // ★ H6 锚点两向自证：源侧必须恰中 1 次，且打偏/多中都必须抛（不得静默跳过）
    const srcOf = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
    const SRCORG = srcOf('memory-organs.js');
    const SRCSEC = srcOf('secret-ledger.js');
    assert.equal(SRCORG.split(ANCHORS.failClosed).length - 1, 1, 'H6 failClosed 锚点在源侧必须恰中 1 次');
    assert.equal(SRCSEC.split(ANCHORS.pass).length - 1, 1, 'H6 pass 锚点在源侧必须恰中 1 次');
    assert.equal(SRCSEC.split(ANCHORS.keepersAppend).length - 1, 1, 'H6 keepersAppend 锚点在源侧必须恰中 1 次');
    assert.throws(() => BO(SRCORG, ANCHORS.failClosed + '  // 打偏', 'x'), /拒绝破坏|必须真的改变源码|锚点/, 'H6 同值替换必须抛');
    assert.throws(() => BO(SRCORG, ANCHORS.failClosed, ANCHORS.failClosed), /拒绝破坏|必须真的改变源码|锚点/, 'H6 未改源码必须抛');
    assert.throws(() => BO('const a = 1;', ANCHORS.failClosed, 'x'), /拒绝破坏|锚点命中/, 'H6 锚点缺失必须抛（不得静默跳过）');
    // fail-closed：锚点打偏必须抛（不是静默跳过）
    assert.throws(() => BO('const a = 1;', '不存在的锚点', 'x'), /拒绝破坏|锚点命中/, 'F1 锚点打偏必须抛 AssertionError');
    assert.throws(() => BO('const a = 1;', 'const a = 1;', 'const a = 1;'), /拒绝破坏|必须真的改变源码/, 'F1 同值替换必须抛');
    ok('E1~E3 负控制 + F1 纯度 + fail-closed');
  }
});

test('v3306 G1. ★★★ 版本锚：本档出生版本 + 三源同源（V4 当版锚点形态）', () => {
  const BORN = '3.306.0';
  assert.equal(vnum(BORN), 3306000, 'vnum 序数必须可数（当版锚点）');
  const codeVer = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
  assert.ok(vnum(codeVer) >= vnum(BORN), '本套件只在 ' + BORN + ' 及以后成立；当前 ' + codeVer);
  assert.equal(manifest.version, codeVer, 'G1 manifest 与入口同源');
  assert.equal(pkg.version, codeVer, 'G1 package.json 与入口同源');
  assert.ok(SELF.includes("const BORN = '3.306.0'"), 'G1 当版锚点必须显式留在本档里');
  assert.equal(SELF.includes("vnum('3.306.0')") || SELF.includes('vnum(BORN)'), true, 'G1 锚形须可被守卫计数');
  ok('G1 版本锚 ' + BORN);
});

console.log('\n[v3306] 断言通过数 = ' + pass);