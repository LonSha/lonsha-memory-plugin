// tests/v3167_cse_capacity_identity.test.mjs
// LonSha 记忆引擎 v3.167.0 主题：容量/截断面 —— 「上限不该改写存进去的东西的身份」
//
// 覆盖三处已实证缺陷与三项配套修复，全部按**不变量**断言（不绑当时的代码形状）：
//   A 容量身份：淘汰必回报（I1）· toward 超限拒绝而非降级 · 幽灵不虚占配额
//   B 索引同源：索引键 ⊆ states 真实 toward（I2）· 容量淘汰后自愈 · 导入即收口
//   C 撞键防护：跨语义不合并（有向条目与无向同名条目并存）
//   D 单源收口：只有 _reindexTargets 改索引 · 写入/淘汰/删除/导入四条路径全归口
//   E 可观测性与发布卫生：selfCheck 含本行且非空壳 · diagnose() 永不抛 · 版本四处同步
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { CSEngine } = require('../cse-engine.js');
const src = readFileSync(new URL('../cse-engine.js', import.meta.url), 'utf8');
const idxSrc = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

/* ── 共用助手：把「该角色索引键 ⊆ states 真实 toward」写成可复用判据 ── */
const towardKeys = (e, ch) => Object.keys(e.chars[ch]?.toward || {});
const liveToward = (e, ch) => new Set((e.chars[ch]?.states || []).map(s => s.toward).filter(Boolean));
const ghostsOf = (e, ch) => towardKeys(e, ch).filter(t => !liveToward(e, ch).has(t));
const assertNoGhost = (e, ch, msg) => assert.deepStrictEqual(ghostsOf(e, ch), [], msg);
/** 灌满 n 条 core（权重最高、永不淘汰），把容量压力全部推给后续的 situational。 */
const fillCore = (e, ch, n) => {
  for (let i = 0; i < n; i++) e.set({ character: ch, layer: 'core', field: 'c' + i, value: 'v', confidence: 1.0 });
};

/* ══════════════ A. 容量身份 ══════════════ */
test('v3.167 A 不变量 I1：set 返回成功 ⇔ 条目真实在 store 里', () => {
  const e = new CSEngine();
  fillCore(e, 'A', 40);
  assert.equal(e.get('A').length, 40, '前提：已顶格');
  // 低置信度 situational：weight = 1 * 0.3 = 0.3，是全场最弱，会被自己挤掉
  const st = e.set({ character: 'A', layer: 'situational', field: '一时情绪', value: '很生气', confidence: 0.3 });
  const stored = e.get('A').some(s => s.field === '一时情绪');
  assert.equal(st === null, !stored, `回报与 store 不一致：set 返回 ${st === null ? 'null' : '非null'}、store 里${stored ? '有' : '没有'}`);
  assert.equal(stored, false, '这条最弱条目确实进不去（容量语义未变）');
});

test('v3.167 A 淘汰必回报：被淘汰的写入返回 null 而非谎报成功', () => {
  const e = new CSEngine();
  fillCore(e, 'B', 40);
  const r = e.setDetailed({ character: 'B', layer: 'situational', field: '情绪', value: '怒', confidence: 0.3 });
  assert.equal(r.state, null, '被当场淘汰 → state 必须为 null');
  assert.equal(r.status, 'evicted', '状态须可区分于「非法输入」与「容量拒绝」');
  assert.equal(r.reason, 'states_capacity');
  assert.ok(e.ledger.evicted >= 1, '淘汰必须记账（此前无任何痕迹）');
});

test('v3.167 A 未被淘汰的正常写入仍返回状态（重构未把成功路径也砍掉）', () => {
  const e = new CSEngine();
  const st = e.set({ character: 'C', layer: 'situational', field: '情绪', value: '平静', confidence: 0.7 });
  assert.ok(st && st.field === '情绪');
  assert.ok(e.get('C').includes(st), '返回的对象就是 store 里的那一个');
  assert.equal(e.get('C').length, 1, '没有 phantom 副本');
});

test('v3.167 A toward 超限：拒绝而非降级（有向身份不得被改写）', () => {
  const e = new CSEngine();
  for (let i = 1; i <= 24; i++) {
    e.set({ character: 'A', layer: 'situational', field: 'f' + i, value: 'v', toward: 'obj' + i, confidence: 0.5 });
  }
  assert.equal(towardKeys(e, 'A').length, 24, '前提：关系向已满 24');
  const st = e.set({ character: 'A', layer: 'situational', field: '好感', value: '高', toward: 'obj25', confidence: 0.9 });
  assert.equal(st, null, '超限的写入不得回报成功');
  const any = e.get('A').find(s => s.field === '好感');
  assert.equal(any, undefined, '关键：不得以「降级为无向」的形式把它偷偷放进去（那不是丢数据，是语义失真）');
  assert.equal(e.ledger.rejected, 1, '拒绝必须记账（此前无计数器、无日志、返回值无差异）');
  assert.equal(e.lastReject?.toward, 'obj25', '末次拒绝须可归因到具体目标');
});

test('v3.167 A 更新既有关系不增键数，不该被容量拒绝', () => {
  const e = new CSEngine();
  for (let i = 1; i <= 24; i++) {
    e.set({ character: 'A', layer: 'situational', field: 'f' + i, value: 'v', toward: 'obj' + i, confidence: 0.5 });
  }
  const st = e.set({ character: 'A', layer: 'situational', field: 'f1', value: 'v2', toward: 'obj1', confidence: 0.9, floor: 9 });
  assert.ok(st, '对已有目标的更新不该被拒（判容量只看「是否新增键」）');
  assert.equal(e.ledger.rejected, 0);
});

test('v3.167 A 幽灵不得虚占关系向配额', () => {
  const e = new CSEngine();
  // 用 core 条目带 toward 撑满 states 容量，逼出淘汰 → 修前会留下幽灵索引键
  for (let i = 0; i < 41; i++) e.set({ character: 'Z', layer: 'core', field: 'c' + i, value: 'v', toward: 'o' + i, confidence: 1.0 });
  assertNoGhost(e, 'Z', '容量淘汰后不得留下无主索引键');
  assert.ok(towardKeys(e, 'Z').length <= 40, `索引键数 ${towardKeys(e, 'Z').length} 不得超过真实条目数`);
});

/* ══════════════ B. 索引同源（I2） ══════════════ */
test('v3.167 B 不变量 I2：索引键 ⊆ states 真实 toward', () => {
  const e = new CSEngine();
  e.set({ character: 'D', field: '好感', value: '高', toward: 'E', confidence: 0.9 });
  e.set({ character: 'D', field: '敌意', value: '强', toward: 'F', confidence: 0.9 });
  e.removeByFloor(0);   // 该楼新增整条删除（floor 默认 0）
  assertNoGhost(e, 'D', '删除路径后索引必须与 store 同源');
  assert.deepStrictEqual(towardKeys(e, 'D'), [], '条目都删了，索引也该空');
});

test('v3.167 B refine 改指后索引跟随（不留旧键）', () => {
  const e = new CSEngine();
  e.set({ character: 'D', field: '好感', value: '高', toward: 'E', confidence: 0.9 });
  e.set({ character: 'D', field: '好感', value: '低', toward: 'F', confidence: 0.9 });
  assertNoGhost(e, 'D', '改指后不得残留无主键');
  const keys = towardKeys(e, 'D');
  for (const t of keys) assert.ok(liveToward(e, 'D').has(t), `索引键 ${t} 必须对应真实条目`);
});

test('v3.167 B 幽灵自愈：索引被外部注入脏键后，下一次写入即回收', () => {
  const e = new CSEngine();
  e.set({ character: 'D', field: '好感', value: '高', toward: 'E', confidence: 0.9 });
  e.chars['D'].toward['幽灵'] = { field: 'x' };          // 模拟旧存档/旧路径留下的脏键
  assert.equal(ghostsOf(e, 'D').length, 1, '前提：脏键已注入');
  e.set({ character: 'D', field: '情绪', value: '平静', confidence: 0.7 });
  assertNoGhost(e, 'D', '任何一次写入都应顺带自愈索引（收口点统一）');
  assert.ok(e.ledger.ghostReclaimed >= 1, '自愈次数须可见');
});

test('v3.167 B 导入即收口：存档里的幽灵不跨设备传播', () => {
  const e = new CSEngine();
  e.import({ chars: { Q: { states: [{ character: 'Q', field: '好感', value: '高', toward: 'R' }], toward: { R: { field: '好感' }, 幽灵: { field: 'x' } } } } });
  assert.deepStrictEqual(towardKeys(e, 'Q'), ['R'], '导入后索引只保留真实存在的关系');
  assertNoGhost(e, 'Q');
});

test('v3.167 B 重复 import 幂等，不累积脏键', () => {
  const e = new CSEngine();
  const dump = { chars: { Q: { states: [{ character: 'Q', field: '好感', value: '高', toward: 'R' }], toward: { R: { field: '好感' } } } } };
  e.import(dump); e.import(dump); e.import(dump);
  assert.deepStrictEqual(towardKeys(e, 'Q'), ['R']);
  assert.equal(e.get('Q').length, 1, '重复导入不产生条目副本');
});

/* ══════════════ C. 撞键防护 ══════════════ */
test('v3.167 C 跨语义不合并：有向条目与无向同名字段条目并存', () => {
  const e = new CSEngine();
  e.set({ character: 'A', layer: 'situational', field: '好感', value: '对某人的好感', toward: 'B', confidence: 0.9 });
  e.set({ character: 'A', layer: 'situational', field: '好感', value: '一般好感', confidence: 0.9 });
  const same = e.get('A').filter(s => s.field === '好感');
  assert.equal(same.length, 2, '两条语义不同的状态必须并存（修前被 find 键撞成一条）');
  assert.deepStrictEqual(same.map(s => s.toward).sort(), [null, 'B'].sort());
});

test('v3.167 C 被拒写入不污染既有条目、不改变其内容', () => {
  const e = new CSEngine();
  e.set({ character: 'A', layer: 'situational', field: '好感', value: '一般好感', confidence: 0.3 });
  const before = JSON.stringify(e.get('A'));
  for (let i = 1; i <= 24; i++) e.set({ character: 'A', layer: 'situational', field: 'r' + i, value: 'v', toward: 'obj' + i, confidence: 0.9 });
  const rejected = e.set({ character: 'A', layer: 'situational', field: '好感', value: '对 obj25', toward: 'obj25', confidence: 0.9 });
  assert.equal(rejected, null, '超限写入被拒');
  const after = e.get('A').find(s => s.field === '好感' && !s.toward);
  assert.ok(after, '既有无向条目仍应存在');
  assert.equal(after.value, '一般好感', '既有条目不得被这次被拒的写入改写');
  assert.equal(before.includes('一般好感'), true);
});

test('v3.167 C 同一 (field, toward) 仍是同一条（refine 语义未被破坏）', () => {
  const e = new CSEngine();
  e.set({ character: 'A', field: '好感', value: '陌生', toward: 'B', floor: 1 });
  e.set({ character: 'A', field: '好感', value: '信任', toward: 'B', floor: 8 });
  const same = e.get('A').filter(s => s.field === '好感' && s.toward === 'B');
  assert.equal(same.length, 1, '同键仍走 refine，不该分裂成两条');
  assert.equal(same[0].value, '信任');
  assert.equal(same[0].evidence.length, 2, '证据链仍保留');
});

/* ══════════════ D. 单源收口 ══════════════ */
test('v3.167 D 只有 _reindexTargets 改索引（无就地写键残留）', () => {
  // 逐行扫描，注释行（`*` / `//` 开头）不计——本仓注释里会引用修前的旧写法作说明
  const writeLines = src.split('\n').filter(l => {
    const t = l.trim();
    if (t.startsWith('*') || t.startsWith('//')) return false;
    return /c\.toward\[[^\]]+\]\s*=/.test(t);
  });
  assert.deepStrictEqual(writeLines, [], '不得再就地写 c.toward[key]（那是幽灵的来源）');
  assert.equal(/delete\s+c\.toward\[/.test(src), false, '删除也须归口，不得散落 delete');
  const assign = src.match(/c\.toward\s*=\s*live/g) || [];
  assert.equal(assign.length, 1, '索引整体赋值只应出现在收口函数内一处');
  const fnStart = src.indexOf('_reindexTargets(c) {');
  assert.ok(fnStart > 0, '收口函数存在');
  assert.ok(src.indexOf('c.toward = live') > fnStart, '该赋值必须在收口函数体内');
});

test('v3.167 D 四条路径全部归口：写入 / 淘汰 / 删除 / 导入', () => {
  const calls = (src.match(/this\._reindexTargets\(c\)/g) || []).length;
  assert.ok(calls >= 4, `收口调用点应覆盖写入(新增/refine)、删除、导入，实测 ${calls} 处`);
  const rmStart = src.indexOf('removeByFloor(floor) {');
  assert.ok(rmStart > 0, 'removeByFloor 存在');
  const rmBody = src.slice(rmStart, src.indexOf('removeChar(character) {'));
  assert.match(rmBody, /this\._reindexTargets\(c\)/, '删除路径必须走收口');
  const imStart = src.indexOf('import(data) {');
  const imBody = src.slice(imStart, src.indexOf('diagnose() {'));
  assert.match(imBody, /this\._reindexTargets\(c\)/, '导入路径必须走收口');
});

test('v3.167 D toward 降级的那行代码已不存在（防回归）', () => {
  assert.equal(/length\s*>=\s*MAX_TOWARD\s*&&\s*!c\.toward\[st\.toward\]/.test(src), false, '修前的静默降级判定必须消失');
  const nulls = src.match(/st\.toward\s*=\s*null/g) || [];
  assert.equal(nulls.length, 1, '只允许 core 层强制 null 这一处合法赋值');
  assert.ok(/st\.layer === LAYERS\.CORE\)\s*st\.toward = null/.test(src), '该处必须是 core 分支');
});

/* ══════════════ E. 可观测性与发布卫生 ══════════════ */
test('v3.167 E diagnose() 结构完整且永不抛', () => {
  const e = new CSEngine();
  e.set({ character: 'A', field: '好感', value: '高', toward: 'B', floor: 1 });
  e.set({ character: 'A', field: '情绪', value: '怒', floor: 2 });
  const d = e.diagnose();
  for (const k of ['chars', 'states', 'towardKeys', 'ghosts', 'nearCapChars', 'ledger', 'caps']) {
    assert.ok(k in d, `diagnose 必须输出 ${k}`);
  }
  assert.equal(d.chars, 1); assert.equal(d.states, 2); assert.equal(d.towardKeys, 1); assert.equal(d.ghosts, 0);
  assert.equal(d.caps.states, 40); assert.equal(d.caps.toward, 24);
  // 脏状态不得让诊断抛（selfCheck 的既有约定：诊断永不影响主链路）
  const bad = new CSEngine();
  bad.chars = { X: { states: null, toward: { k: 1 } }, Y: null, Z: { states: [null, { toward: 't' }], toward: null } };
  assert.doesNotThrow(() => bad.diagnose(), 'diagnose 对畸形 store 必须容错');
  assert.doesNotThrow(() => new CSEngine().diagnose(), '空引擎可用');
});

test('v3.167 E 诊断行进入 selfCheck 子系统列表且非空壳', () => {
  const scStart = idxSrc.indexOf('async selfCheck() {');
  assert.ok(scStart > 0, 'selfCheck 存在');
  const scEnd = idxSrc.indexOf('return report;', scStart);
  assert.ok(scEnd > scStart, 'selfCheck 主体范围可界定');
  const scBody = idxSrc.slice(scStart, scEnd);
  // 与仓库既有范式一致：括号配对扫描 rows 列表（不是裸正则抽查）
  const lb = scBody.indexOf('const rows = [');
  assert.ok(lb > 0, 'rows 列表字面量存在');
  let bd = 0, rb = -1;
  for (let i = scBody.indexOf('[', lb); i < scBody.length; i++) {
    if (scBody[i] === '[') bd++;
    else if (scBody[i] === ']') { bd--; if (bd === 0) { rb = i; break; } }
  }
  assert.ok(rb > lb, 'rows 列表闭合可定位');
  const items = [];
  for (const m of scBody.slice(lb, rb + 1).matchAll(/\['([^']+)',/g)) items.push(m[1]);
  for (const m of scBody.matchAll(/rows\.push\(\[\s*'([^']+)'/g)) items.push(m[1]);
  assert.ok(items.includes('人物状态'), '「人物状态」应进入 selfCheck 子系统列表（修完的缺陷必须能被看见）');
  assert.ok(items.includes('角色状态'), '原有「角色状态」行不得被顶掉');
  assert.ok(/return \['人物状态', txt\];/.test(scBody), '人物状态主渲染存在（非空壳，防同名兜底分支骗过）');
  assert.ok(/this\.cse\?\.diagnose\?\.\(\)/.test(scBody), '该行须读 CSE 诊断口');
  assert.ok(/d\.ghosts/.test(scBody), '索引幽灵必须在诊断行可见（收口被绕过的唯一线索）');
  assert.ok(/d\.nearCapChars/.test(scBody), '顶格压力必须可见');
});

test('v3.167 E selfCheck 诊断行不得因缺引擎而抛（降级为空实现时）', () => {
  // 修前 index.js 的 CSE 有降级实现（缺 window.LonShaCSE 时）；诊断行必须容忍它没有 diagnose()
  const scStart = idxSrc.indexOf('async selfCheck() {');
  const scBody = idxSrc.slice(scStart, idxSrc.indexOf('\n        return report;', scStart));
  assert.match(scBody, /if \(!d\) return \['人物状态',/, '缺 diagnose() 时须有兜底文案');
  assert.match(scBody, /catch \(e\) \{ errLog\(e, 'selfCheck\.cse'\);/, '异常必须被吞并留日志（不破坏 selfCheck）');
});

test('v3.167 E 容量账目并入 opLog（丢了多少、拒了多少可见）', () => {
  assert.match(idxSrc, /'cse', 'cap'/, 'opLog 必须新增 cse/cap 条目');
  assert.match(idxSrc, /lastExtractReport/, '登记点须读容量回报');
  assert.match(src, /lastExtractReport\s*=\s*rep/, 'addFromExtracted 须落容量回报');
  assert.match(src, /attempted:\s*\(list \|\| \[\]\)\.length/, '回报须含 attempted 作分母');
});

test('v3.167 E 版本四处同步', () => {
  const vnum = (s) => {
    const m = /^([0-9]+)\.([0-9]+)\.([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
  };
  const v = /const VERSION = '([\d.]+)'/.exec(idxSrc)?.[1];
  assert.ok(vnum(v) >= vnum('3.186.0'), `index.js 版本 ${v} >= 3.168.0`);
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.equal(manifest.version, v, 'manifest 与 index.js 同版');
  assert.equal(pkg.version, v, 'package.json 与 index.js 同版');
  assert.ok(changelog.startsWith('## v' + v), `CHANGELOG 顶节应为 v${v}`);
  assert.ok(changelog.includes('容量/截断面'), 'CHANGELOG 应记录容量/截断面这条主线');
});

test('v3.167 E 兼容约束：既有返回形状不变（旧调用方不受影响）', () => {
  const e = new CSEngine();
  assert.equal(e.set({ character: 'A', field: '', value: 'x' }), null, '非法输入仍返回 null');
  assert.equal(e.set({ character: '', field: 'f', value: 'v' }), null);
  assert.equal(typeof e.addFromExtracted([{ character: 'A', field: 'f', value: 'v' }], 3), 'number', 'addFromExtracted 仍返回 number');
  assert.equal(e.confirm('A', 'f'), true, 'confirm 语义未变');
  assert.equal(e.confirm('A', '不存在'), false);
  // set() 与 setDetailed() 必须一致（前者是后者的投影）
  const e2 = new CSEngine();
  const a = e2.set({ character: 'K', field: 'f', value: 'v' });
  const b = e2.setDetailed({ character: 'K', field: 'f', value: 'v2', floor: 9 });
  assert.ok(a && b.state, '两条入口都能拿到状态对象');
  assert.equal(b.state, e2.get('K')[0], 'setDetailed 返回的就是 store 里的那一个（不产生副本）');
});