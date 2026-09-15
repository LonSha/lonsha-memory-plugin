// tests/v3109_recall_artifact.test.mjs
// v3.109 缝合 m61-oss/st-bionic-memory（BME）domain/turn-artifact.js + domain/memory-id.js：
// 逐轮召回产物复用（输入指纹 / 历史指纹判据 / 复用-替换-作废 / 老化清理 / 命中率诊断）
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(REPO, 'recall-artifact.js'), 'utf8');
const idxSrc = fs.readFileSync(path.join(REPO, 'index.js'), 'utf8');
const suiSrc = fs.readFileSync(path.join(REPO, 'settings-ui.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));

function vnum(s) {
  const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}

const sbox = { module: { exports: {} }, window: undefined };
const load = new Function('globalThis', 'module', 'window',
  src + '\nreturn (typeof module !== \'undefined\' && module.exports) ? module.exports : globalThis.LonShaRecallArtifact;');
const RA = load(sbox, sbox.module, undefined);

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };

const turn = (over) => Object.assign({
  turnId: 'turn_10',
  artifactKind: 'recall',
  floor: 10,
  userMessage: '我们上次说的那件事',
  historyFingerprint: 'h1',
  stateFingerprint: 's1',
  injectionText: '【记忆】他们于第3楼约定在码头见面。',
  selectedMemoryIds: ['mem_3', 'mem_5'],
  candidateCount: 12,
  createdAt: 1000,
}, over || {});

// ---------- 0. 版本与注册 ----------
test('【0】版本与 manifest 注册', () => {
  const v = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
  assert.ok(vnum(v) >= vnum('3.109.0'), `index.js 版本 ${v} < 3.109.0`);
  assert.ok(vnum(manifest.version) >= vnum('3.109.0'), `manifest 版本 ${manifest.version} < 3.109.0`);
  assert.ok(manifest.extra_js.includes('recall-artifact.js'), 'recall-artifact.js 已注册 extra_js');
  ok('版本 / manifest 注册');
});

// ---------- 1. 确定性序列化与指纹 ----------
test('【1】stableStringify / hash32 确定性', () => {
  assert.strictEqual(RA.stableStringify({ b: 1, a: 2 }), RA.stableStringify({ a: 2, b: 1 }), '键序无关');
  assert.strictEqual(RA.stableStringify([2, 1]), '[2,1]', '数组保序（数组序是语义）');
  assert.strictEqual(RA.stableStringify({ a: undefined, b: 1 }), '{"b":1}', 'undefined 剔除');
  assert.strictEqual(RA.stableStringify({ a: { d: 1, c: 2 } }), '{"a":{"c":2,"d":1}}', '递归排序');
  assert.strictEqual(RA.hash32(''), '811c9dc5', '空串为 FNV 偏移基值');
  assert.strictEqual(RA.hash32('abc'), RA.hash32('abc'), '同输入同输出');
  assert.match(RA.hash32('abc'), /^[0-9a-f]{8}$/, '8 位十六进制');
  assert.notStrictEqual(RA.hash32('abc'), RA.hash32('abd'), '不同输入不同输出');
  ok('确定性序列化 / 指纹稳定');
});

// ---------- 2. 输入指纹归一 ----------
test('【2】createInputFingerprint CRLF/空白归一', () => {
  const a = RA.createInputFingerprint({ turnId: 't1', userMessage: '你好\r\n世界', historyFingerprint: 'h' });
  const b = RA.createInputFingerprint({ turnId: 't1', userMessage: '你好\n世界  ', historyFingerprint: 'h' });
  assert.strictEqual(a, b, 'CRLF 与尾部空白不造成假失效');
  const c = RA.createInputFingerprint({ turnId: 't1', userMessage: '你好世界', historyFingerprint: 'h' });
  assert.notStrictEqual(a, c, '文本变化必然换指纹');
  const d = RA.createInputFingerprint({ turnId: 't1', userMessage: '你好\n世界', historyFingerprint: 'h2' });
  assert.notStrictEqual(b, d, '历史指纹变化必然换指纹');
  const e = RA.createInputFingerprint({ turnId: 't1', userMessage: '你好\n世界', historyFingerprint: 'h', recentMessages: ['上一轮'] });
  assert.notStrictEqual(b, e, '近期消息参与指纹');
  assert.strictEqual(
    RA.createInputFingerprint({ turnId: 't', userMessage: 'm', recentMessages: ['x', ''] }),
    RA.createInputFingerprint({ turnId: 't', userMessage: 'm', recentMessages: ['x'] }),
    '空近期消息不参与'
  );
  ok('归一 / 参与项 / 稳定性');
});

// ---------- 3. createArtifact ----------
test('【3】createArtifact 校验与派生', () => {
  assert.throws(() => RA.createArtifact({}), /requires turnId/, '缺 turnId 抛错');
  const a = RA.createArtifact(turn());
  assert.strictEqual(a.artifactKind, 'recall', 'kind 默认 recall');
  assert.strictEqual(a.artifactId, 'recall_' + a.inputFingerprint, 'id 由 kind+指纹派生');
  assert.strictEqual(a.empty, false, '有注入内容 → 非空');
  assert.deepStrictEqual(a.selectedMemoryIds, ['mem_3', 'mem_5']);
  const dup = RA.createArtifact(turn({ selectedMemoryIds: ['m', 'm', 'm2'] }));
  assert.deepStrictEqual(dup.selectedMemoryIds, ['m', 'm2'], '选中项去重');
  const e = RA.createArtifact(turn({ injectionText: '   ' }));
  assert.strictEqual(e.empty, true, '纯空白注入 → empty');
  const neg = RA.createArtifact(turn({ candidateCount: -5, reuseCount: -1 }));
  assert.strictEqual(neg.candidateCount, 0, '负候选数回落 0');
  assert.strictEqual(neg.reuseCount, 0, '负复用数回落 0');
  // 未提供 inputFingerprint 时按内容派生（同内容同 id）
  const p1 = RA.createArtifact({ turnId: 't', userMessage: 'x', historyFingerprint: 'h' });
  const p2 = RA.createArtifact({ turnId: 't', userMessage: 'x', historyFingerprint: 'h' });
  assert.strictEqual(p1.inputFingerprint, p2.inputFingerprint, '内容派生指纹稳定');
  ok('校验 / 派生 / 归一');
});

// ---------- 4. 复用判据（核心：历史指纹参与） ----------
test('【4】findReusableArtifact 四重命中与拒绝原因', () => {
  let store = [];
  const c1 = RA.planCommitArtifact(store, turn({ createdAt: 1000 }));
  store = c1.store;
  assert.strictEqual(c1.reused, false, '首次提交为新建');
  assert.strictEqual(store.length, 1);
  // 完全相同 → 命中
  const hit = RA.findReusableArtifact(store, { turnId: 'turn_10', artifactKind: 'recall', inputFingerprint: c1.artifact.inputFingerprint, historyFingerprint: 'h1', stateFingerprint: 's1' });
  assert.ok(hit.artifact, '同轮同输入命中');
  assert.strictEqual(hit.reason, 'hit');
  // 空 store
  assert.strictEqual(RA.findReusableArtifact([], { turnId: 'turn_10' }).reason, 'no-turn');
  // 不同轮次 / 不同输入指纹 → 不可复用
  assert.strictEqual(RA.findReusableArtifact(store, { turnId: 'turn_99', artifactKind: 'recall', inputFingerprint: c1.artifact.inputFingerprint }).reason, 'input-changed');
  // 历史指纹变化（位置与查询都没变）→ 拒绝复用（这是本模块相对既有三元组缓存的关键增量）
  const hist = RA.findReusableArtifact(store, {
    turnId: 'turn_10', artifactKind: 'recall', inputFingerprint: c1.artifact.inputFingerprint, historyFingerprint: 'h2',
  });
  assert.strictEqual(hist.artifact, null, '历史指纹不符 → 不复用');
  assert.strictEqual(hist.reason, 'history-changed');
  // 状态指纹变化（引用的记忆已变）→ 拒绝复用
  const st = RA.findReusableArtifact(store, {
    turnId: 'turn_10', artifactKind: 'recall', inputFingerprint: c1.artifact.inputFingerprint, historyFingerprint: 'h1', stateFingerprint: 's9',
  });
  assert.strictEqual(st.artifact, null, '状态指纹不符 → 不复用');
  assert.strictEqual(st.reason, 'state-changed');
  // 不传指纹时不做该项校验（向后兼容）
  const loose = RA.findReusableArtifact(store, { turnId: 'turn_10', artifactKind: 'recall', inputFingerprint: c1.artifact.inputFingerprint });
  assert.ok(loose.artifact, '未提供历史/状态指纹时不额外拒绝');
  ok('命中 / input-changed / history-changed / state-changed');
});

// ---------- 5. 空产物默认不复用 ----------
test('【5】空产物默认不复用（allowEmpty 可覆盖）', () => {
  const c = RA.planCommitArtifact([], turn({ injectionText: '' }));
  const w = { turnId: 'turn_10', artifactKind: 'recall', inputFingerprint: c.artifact.inputFingerprint, historyFingerprint: 'h1', stateFingerprint: 's1' };
  const r = RA.findReusableArtifact(c.store, w);
  assert.strictEqual(r.artifact, null, '空产物默认不复用（防用空注入覆盖非空结果）');
  assert.strictEqual(r.reason, 'empty');
  const r2 = RA.findReusableArtifact(c.store, Object.assign({}, w, { allowEmpty: true }));
  assert.ok(r2.artifact, 'allowEmpty=true 时可用');
  ok('空产物策略');
});

// ---------- 6. 提交：复用计数 / 同轮替换 ----------
test('【6】planCommitArtifact 复用计数与同轮替换', () => {
  let store = [];
  store = RA.planCommitArtifact(store, turn({ createdAt: 1000 })).store;
  const second = RA.planCommitArtifact(store, turn({ createdAt: 2000, now: 2000 }));
  store = second.store;
  assert.strictEqual(second.reused, true, '同轮同输入二次提交 → 复用');
  assert.strictEqual(store.length, 1, '不新增条目');
  assert.strictEqual(store[0].reuseCount, 1, '复用计数 +1');
  assert.strictEqual(store[0].lastReusedAt, 2000, '记录复用时间');
  // 同轮但内容变化 → 替换旧版本（同轮只保留最新）
  const changed = RA.planCommitArtifact(store, turn({ userMessage: '换个说法', createdAt: 3000 }));
  assert.strictEqual(changed.reused, false, '内容变化 → 新建');
  assert.strictEqual(changed.replaced, 1, '替换同轮旧产物');
  assert.strictEqual(changed.store.length, 1, '仍只有 1 条（同轮只留最新）');
  assert.ok(changed.artifact.injectionText.includes('第3楼'), '新产物为最新内容');
  // 不同轮次并存
  const other = RA.planCommitArtifact(changed.store, turn({ turnId: 'turn_11', floor: 11 }));
  assert.strictEqual(other.store.length, 2, '不同轮次并存');
  // 纯函数：入参不被修改
  const base = RA.planCommitArtifact([], turn()).store;
  const len = base.length;
  RA.planCommitArtifact(base, turn({ userMessage: 'x' }));
  assert.strictEqual(base.length, len, '入参数组未被就地修改');
  ok('复用 / 替换 / 并存 / 纯函数');
});

// ---------- 7. 作废与清理 ----------
test('【7】invalidateTurn / pruneArtifacts', () => {
  let store = [];
  store = RA.planCommitArtifact(store, turn({ turnId: 'a', userMessage: '1' })).store;
  store = RA.planCommitArtifact(store, turn({ turnId: 'b', userMessage: '2' })).store;
  store = RA.planCommitArtifact(store, turn({ turnId: 'c', userMessage: '3' })).store;
  const inv = RA.invalidateTurn(store, 'b');
  assert.strictEqual(inv.removed, 1, '作废 1 条');
  assert.deepStrictEqual(inv.store.map(a => a.turnId), ['a', 'c'], '其余保留');
  assert.strictEqual(RA.invalidateTurn(inv.store, 'zzz').removed, 0, '不存在则 0');
  // 老化清理：超龄条目移除
  const aged = [
    RA.createArtifact(turn({ turnId: 'old', userMessage: 'o', createdAt: 0 })),
    RA.createArtifact(turn({ turnId: 'new', userMessage: 'n', createdAt: 100000 })),
  ];
  const pruned = RA.pruneArtifacts(aged, { now: 100000, maxAgeMs: 50000 });
  assert.strictEqual(pruned.removedByAge, 1, '超龄移除 1 条');
  assert.deepStrictEqual(pruned.store.map(a => a.turnId), ['new'], '仅保留未超龄');
  // 容量清理：保留最新 N 条，且输出按时间升序（便于追加语义）
  const many = [];
  for (let i = 0; i < 10; i++) {
    many.push(RA.createArtifact(turn({ turnId: 't' + i, userMessage: 'm' + i, createdAt: 1000 + i })));
  }
  const capped = RA.pruneArtifacts(many, { now: 2000, maxEntries: 3, maxAgeMs: 999999999 });
  assert.strictEqual(capped.store.length, 3, '容量裁剪到 3 条');
  assert.deepStrictEqual(capped.store.map(a => a.turnId), ['t7', 't8', 't9'], '保留最新 3 条且按时间升序');
  assert.strictEqual(capped.removedByCap, 7, '容量移除计数');
  assert.strictEqual(RA.DEFAULT_MAX_ENTRIES, 32, '默认容量 32');
  assert.strictEqual(RA.DEFAULT_MAX_AGE_MS, 7 * 24 * 3600 * 1000, '默认有效期 7 天');
  ok('作废 / 老化 / 容量');
});

// ---------- 8. 结果形状与诊断 ----------
test('【8】toRecallResult / summarizeArtifacts', () => {
  const c = RA.planCommitArtifact([], turn());
  const r = RA.toRecallResult(c.artifact);
  assert.strictEqual(r.status, 'completed');
  assert.strictEqual(r.reused, true, '复用产物标记');
  assert.strictEqual(r.injectionText, c.artifact.injectionText, '注入文本透传');
  assert.deepStrictEqual(r.selectedMemoryIds, ['mem_3', 'mem_5']);
  assert.ok(!('selectedMemoryIds' in (RA.toRecallResult(null) || {})), 'null 产物返回 null');
  // 诊断
  let store = [];
  store = RA.planCommitArtifact(store, turn({ turnId: 'x', userMessage: '1', createdAt: 1 })).store;
  store = RA.planCommitArtifact(store, turn({ turnId: 'x', userMessage: '1', createdAt: 2, now: 2 })).store;   // 复用 1 次
  store = RA.planCommitArtifact(store, turn({ turnId: 'y', userMessage: '2', createdAt: 3 })).store;
  const s = RA.summarizeArtifacts(store);
  assert.strictEqual(s.total, 2, '条目数');
  assert.strictEqual(s.reuses, 1, '复用次数');
  assert.ok(s.hitRate > 0 && s.hitRate < 1, '命中率在 0-1 之间');
  assert.ok(s.avgInjectionChars > 0, '平均注入长度');
  const emptySum = RA.summarizeArtifacts([]);
  assert.strictEqual(emptySum.total, 0);
  assert.strictEqual(emptySum.hitRate, 0, '空库命中率 0（不除零）');
  ok('结果形状 / 命中率诊断');
});

// ---------- 9. index.js 接线（正向） ----------
test('【9】index.js 接线：召回产物已挂上主链路', () => {
  assert.ok(/recallArtifactEnabled:\s*false/.test(idxSrc), '默认关（不改变既有行为）');
  assert.ok(idxSrc.includes('recallArtifactEnabled === true'), '门控为显式 === true');
  assert.ok(idxSrc.includes('window.LonShaRecallArtifact'), 'window 通道');
  assert.ok(idxSrc.includes("require('./recall-artifact.js')"), 'require 降级通道');
  assert.ok(idxSrc.includes('aa.findReusableArtifact'), '命中判据真调用');
  assert.ok(idxSrc.includes('aa.planCommitArtifact'), '落盘真调用');
  assert.ok(idxSrc.includes('aa.pruneArtifacts'), '容量控制真调用');
  assert.ok(/this\._recallArtifacts = \[\]/.test(idxSrc), '实例字段初始化');
  assert.ok(idxSrc.includes('_historyFingerprint()'), '历史指纹方法存在');
  assert.ok(idxSrc.includes('recallArtifacts: this._recallArtifacts || []'), '随聊天持久化');
  assert.ok(idxSrc.includes('Array.isArray(data.recallArtifacts)'), '加载时恢复');
  assert.ok(idxSrc.includes('召回产物') && idxSrc.includes('exportMemoryReport'), '审计报告展示');
  assert.ok(suiSrc.includes('recallArtifactEnabled'), 'settings-ui 声明该键（非幽灵配置）');
  ok('接线（门控 / 双通道 / 方法 / 持久化 / UI）');
});

// ---------- 10. 逆向审计：默认路径零变更 ----------
test('【10】逆向审计：默认关时既有三元组缓存路径不受影响', () => {
  // 既有 v2.9 缓存写入与 v3.89 指纹校验仍在
  assert.ok(idxSrc.includes('this._recallCache = {floor: cc.length - 1'), '既有缓存写入仍在');
  assert.ok(idxSrc.includes('this._recallCache.fp === curFp'), 'v3.89 指纹命中判据仍在');
  assert.ok(idxSrc.includes('召回缓存失效: 末楼指纹变化（swipe/编辑）'), '失效日志仍在');
  assert.ok(idxSrc.includes('if (this.config.config.recallCacheEnabled && this._recallCache)'), '既有缓存门控仍在');
  // 产物分支只在显式开启时进入，且不修改既有缓存对象
  const gateAt = idxSrc.indexOf('if (this.config.config.recallArtifactEnabled === true) {');
  const legacyAt = idxSrc.indexOf('if (this.config.config.recallCacheEnabled && this._recallCache) {');
  assert.ok(gateAt > 0 && legacyAt > gateAt, '产物分支位于既有缓存分支之前且独立');
  const artifactBlock = idxSrc.slice(gateAt, legacyAt);
  assert.ok(!/this\._recallCache\s*=/.test(artifactBlock), '产物分支不修改既有缓存对象');
  // 事件清理：删楼/换对话同时清产物（防跨对话串用）
  assert.ok(idxSrc.includes("events.MESSAGE_DELETED产物清理"), '删楼清理产物');
  assert.ok(idxSrc.includes("events.CHAT_CHANGED产物清理"), '换对话清理产物');
  // 纯函数无状态：同输入重复判定结果一致
  const s = RA.planCommitArtifact([], turn()).store;
  const w = { turnId: 'turn_10', artifactKind: 'recall', inputFingerprint: s[0].inputFingerprint, historyFingerprint: 'h1', stateFingerprint: 's1' };
  assert.strictEqual(RA.findReusableArtifact(s, w).reason, RA.findReusableArtifact(s, w).reason, '判定幂等');
  ok('既有路径未改 / 独立分支 / 事件清理 / 幂等');
});

console.log(`[v3109] ${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;