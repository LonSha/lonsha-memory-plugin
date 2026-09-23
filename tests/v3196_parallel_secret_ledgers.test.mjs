/**
 * v3.196 — 平行事实账本 + 秘密账本（素材：日月西预设）
 *
 * 来源：SillyTavern 预设「【日月西】Gemini & Claude v0.41 @电波系」的机制面提炼：
 *   🗝️平行事件 →「别处正在发生的事」账本（audience: hidden|overheard 区分在场角色是否可知晓）
 *   💌秘密来信/🔮绝密档案 →「某角色此刻不该被知晓的事」账本（keeper 点名持有者，显式揭露才解封）
 * 设计边界：
 *   - 两个账本均为显式写入（不进 AI 提取 schema），宿主提供 recordParallelFact / recordSecretFact 入口
 *   - 小手机（ruby-phone）只读投影，经桥快照 worldProg 消费，不回写
 *
 * 覆盖：
 *   0  版本与 manifest
 *   1  parallel-ledger 模块行为（audience 过滤 / present-knows / open-cap / sweep）
 *   2  secret-ledger 模块行为（keeper-present / open-locked / reveal / sweep / progress 单调）
 *   3  WorldProgress 四处接线（初始化 / toInjection / export / import）
 *   4  宿主入口 recordParallelFact / recordSecretFact（接线到 worldProg 状态）
 *   5  manifest extra_js 登记与加载顺序（seed → secret → parallel → cost）
 *   6  语法门禁（新模块 + index.js 均可解析）
 *   7  桥快照字段注册面（snapshot 消费契约不被破坏）
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
const idxSrc = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

function vnum(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}
let pass = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };

const parallel = require(path.join(ROOT, 'parallel-ledger.js'));
const secret = require(path.join(ROOT, 'secret-ledger.js'));

// ---------- 0 ----------
test('【0】版本与 manifest', () => {
  const v = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
  assert.ok(vnum(v) >= vnum('3.197.0'), `index.js 版本 ${v} < 3.197.0`);
  assert.ok(vnum(manifest.version) >= vnum('3.197.0'), `manifest 版本 ${manifest.version} < 3.197.0`);
  ok('版本 / manifest ≥ 3.197.0');
});

// ---------- 1 ----------
test('【1】parallel-ledger 行为', () => {
  // audience 缺省 hidden
  const s = parallel.note(null, { title: '船期', fact: '货船改道', place: '外港' }).state;
  assert.equal(s.items[0].audience, 'hidden');
  // present 命中拒 present-knows
  let r = parallel.note(s, { title: '内线', fact: '巡捕房有内线', place: '巡捕房', who: ['老周'] });
  assert.equal(r.ok, true);
  r = parallel.note(r.state, { title: '内线', fact: '巡捕房有内线', place: '巡捕房', who: ['老周'], present: ['老周'] });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'present-knows');
  // openish + audience 叠加过滤（v3.196 修复点：不得提前 return）
  let s2 = parallel.note(null, { title: 'H', fact: '密谋', place: '码头' }).state;
  s2 = parallel.note(s2, { title: 'V', fact: '热搜', place: '报馆', audience: 'overheard' }).state;
  assert.deepEqual(parallel.list(s2, { status: 'openish', audience: 'overheard' }).map(i => i.title), ['V']);
  assert.deepEqual(parallel.list(s2, { status: 'openish', audience: 'hidden' }).map(i => i.title), ['H']);
  // 渲染分面
  const vis = parallel.renderVisible(s2, 4);
  const hid = parallel.renderHidden(s2, 4);
  assert.ok(vis.includes('V') && !vis.includes('H'), '可见块不含隐藏条目');
  assert.ok(hid.includes('H') && !hid.includes('V'), '隐藏块不含公开条目');
  // open-cap：第 5 条拒
  let s3 = null;
  for (let i = 0; i < 5; i++) {
    s3 = parallel.note(s3, { title: 'T' + i, fact: 'f' + i, place: 'p' + i }).state;
  }
  const r3 = parallel.note(s3, { title: 'T5', fact: 'f5', place: 'p5' });
  assert.equal(r3.ok, false);
  assert.equal(r3.reason, 'open-cap');
  // touch/settle 必须带 note；sweep 只清 settledFloor < floor
  const t1 = parallel.touch(s2, { title: 'V', note: '见报了', floor: 3 });
  assert.equal(t1.ok, true);
  assert.equal(t1.state.items.find(i => i.title === 'V').status, 'touched');
  const st = parallel.settle(s2, { title: 'H', note: '水落石出', floor: 5 });
  assert.equal(st.ok, true);
  assert.equal(st.state.items.find(i => i.title === 'H').status, 'settled');
  const sw = parallel.sweep(st.state, 6);
  assert.equal(sw.ok, true);
  assert.equal(sw.swept, 1);
  ok('parallel: audience 过滤 / present-knows / open-cap / touch+settle+sweep');
});

// ---------- 2 ----------
test('【2】secret-ledger 行为', () => {
  // seal 必须点名 keeper，内容字段是 secret（非 fact）
  let r = secret.seal(null, { secret: '养女实为仇家之后', keeper: '阿绣' });
  assert.equal(r.ok, true);
  assert.equal(r.state.items[0].status, 'sealed');
  let s = r.state;
  // 缺 keeper 拒
  let r2 = secret.seal(s, { secret: 'x', keeper: '' });
  assert.equal(r2.ok, false);
  // keeper 在场拒推进
  r = secret.advance(s, { title: '养女实为仇家之后'.slice(0, 20), secret: '养女实为仇家之后', present: ['阿绣'], progress: 30 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'keeper-present');
  // advance 到 advancing
  r = secret.advance(s, { secret: '养女实为仇家之后', progress: 30, floor: 2, note: '她翻出了旧照片' });
  assert.equal(r.ok, true);
  assert.equal(r.state.items[0].status, 'advancing');
  s = r.state;
  // 未揭露前同秘事再 seal 不新增（复封顶更新）
  r2 = secret.seal(s, { secret: '养女实为仇家之后', keeper: '阿绣' });
  assert.equal(r2.ok, true);
  assert.equal(r2.state.items.length, 1, '同秘事不重复成条');
  s = r2.state;
  // reveal 进度补到 100
  r = secret.reveal(s, { secret: '养女实为仇家之后', floor: 6, note: '当众摊牌' });
  assert.equal(r.ok, true);
  assert.equal(r.state.items[0].status, 'revealed');
  assert.equal(r.state.items[0].progress, 100);
  // 已揭露不出现在 render
  assert.equal(secret.render(r.state, 5), '');
  // sweep 只清 revealedFloor < floor
  const sw = secret.sweep(r.state, 7);
  assert.equal(sw.ok, true);
  assert.equal(sw.swept, 1);
  // progress 回退拒绝
  const r3 = secret.seal(null, { secret: 'B秘', keeper: '阿绣' });
  const r4 = secret.advance(r3.state, { secret: 'B秘', progress: 40, floor: 2, note: 'n1' });
  assert.equal(r4.ok, true);
  const r5 = secret.advance(r4.state, { secret: 'B秘', progress: 30, floor: 3, note: 'n2' });
  assert.equal(r5.ok, false);
  assert.equal(r5.reason, 'progress-back');
  ok('secret: keeper-present / 复封顶 / reveal / sweep / progress 单调');
});

// ---------- 3 ----------
test('【3】WorldProgress 四处接线', () => {
  assert.ok(idxSrc.includes('this.parallelLedger = null; // [v3.196]'), '构造初始化 parallelLedger');
  assert.ok(idxSrc.includes('this.secretLedger = null; // [v3.196]'), '构造初始化 secretLedger');
  assert.ok(idxSrc.includes("id: 'wp_parallel_visible'"), 'toInjection 公开面');
  assert.ok(idxSrc.includes("id: 'wp_parallel_hidden'"), 'toInjection 隐藏面');
  assert.ok(idxSrc.includes("id: 'wp_secret_ledger'"), 'toInjection 秘密面');
  assert.ok(/parallelLedger: this\.parallelLedger \|\| null,\n\s*secretLedger: this\.secretLedger \|\| null,/.test(idxSrc), 'export/import 随身带');
  ok('WorldProgress 构造/注入/export/import 四处接线');
});

// ---------- 4 ----------
test('【4】宿主入口方法', () => {
  assert.ok(idxSrc.includes('recordParallelFact(input = {})'), 'recordParallelFact 存在');
  assert.ok(idxSrc.includes('recordSecretFact(input = {})'), 'recordSecretFact 存在');
  // 入口必须指向 worldProg 状态槽，不落全局
  const slice = (name) => {
    const i = idxSrc.indexOf(name + '(input = {})');
    assert.ok(i >= 0, name + ' 存在且签名可定位');
    return idxSrc.slice(i, i + 1200);
  };
  const body1 = slice('recordParallelFact');
  assert.ok(body1.includes('this.worldProg.parallelLedger'), 'parallel 状态槽 = worldProg.parallelLedger');
  const body2 = slice('recordSecretFact');
  assert.ok(body2.includes('this.worldProg.secretLedger'), 'secret 状态槽 = worldProg.secretLedger');
  ok('recordParallelFact / recordSecretFact 接线');
});

// ---------- 5 ----------
test('【5】manifest extra_js 登记', () => {
  const extra = manifest.extra_js || [];
  const iSeed = extra.indexOf('seed-ledger.js');
  const iSecret = extra.indexOf('secret-ledger.js');
  const iParallel = extra.indexOf('parallel-ledger.js');
  assert.ok(iSeed >= 0, 'seed-ledger 已登记');
  assert.ok(iSecret === iSeed + 1, 'secret-ledger 紧随 seed');
  assert.ok(iParallel === iSecret + 1, 'parallel-ledger 紧随 secret');
  ok('extra_js 顺序 seed → secret → parallel');
});

// ---------- 6 ----------
test('【6】语法门禁', () => {
  const { execSync } = require('node:child_process');
  for (const f of ['parallel-ledger.js', 'secret-ledger.js', 'index.js']) {
    execSync('node --check ' + JSON.stringify(path.join(ROOT, f)), { stdio: 'pipe' });
  }
  ok('新模块 + index.js 语法通过');
});

// ---------- 7 ----------
test('【7】桥快照契约面', () => {
  // 桥快照 deep 拷贝 worldProg.export()，新增账本字段随 export 自动入快照；
  // 此处只验证 export 面不被本版改动破坏（字段集只增不减）。
  for (const field of ['commitmentLedger', 'seedLedger', 'parallelLedger', 'secretLedger', 'knowledge', 'plotArcs']) {
    assert.ok(idxSrc.includes(field + ': this.' + field + ' || null') || idxSrc.includes(field + ': this.' + field), 'export 字段 ' + field);
  }
  ok('export 字段集只增不减');
});

console.log(`\n[v3.196] ${pass} 组断言通过`);