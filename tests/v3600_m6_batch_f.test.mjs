/* ============================================================
 * tests/v3600_m6_batch_f.test.mjs — v3.360.0 · 第六期批次 F 记忆侧两项验收
 *   - M6-X4 多步反事实实验：比较两条人生路线
 *   - M6-X9 跨时代传承：世界进入新阶段
 * ------------------------------------------------------------
 * 判据分五面：
 *   A 面 版本锚与结构自证
 *   B 面 M6-X4 反事实实验（冻结引用 / 首次分歧定位 / 丢弃无副作用）
 *   C 面 M6-X9 跨时代传承（四类提案 / 私人经历不继承 / 撤销旧卷可读）
 *   D 面 WorldProgress 集成
 *   E 面 负控制三向自证
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rel = (p) => path.join(ROOT, p);
const read = (p) => fs.readFileSync(rel(p), 'utf8');
const BORN_V = '3.360.0';
const CE_REL = 'counterfactual-experiment.js';
const EI_REL = 'era-inheritance.js';

// IIFE 模块通过 globalThis 挂载
const ceCode = read(CE_REL);
const eiCode = read(EI_REL);
// 清除可能残留
delete globalThis.CounterfactualExperimentLib;
delete globalThis.EraInheritanceLib;
// 执行 IIFE
eval(ceCode);
eval(eiCode);
const CE = globalThis.CounterfactualExperimentLib;
const EI = globalThis.EraInheritanceLib;

function vnum(v) { return v.split('.').map(Number).reduce((a, b, i) => a + b * Math.pow(100, 2 - i), 0); }

function breakSource(code, anchor, replacement) {
  const idx = code.indexOf(anchor);
  if (idx === -1) throw new Error(`Anchor not found: ${anchor}`);
  const before = code.slice(0, idx);
  const after = code.slice(idx + anchor.length);
  return before + replacement + after;
}

/* ============================================================ */
/* A 面：版本锚与结构自证                                       */
/* ============================================================ */
test('A1: index.js VERSION >= BORN_V', () => {
  const idx = read('index.js');
  const m = idx.match(/\s*VERSION\s*=\s*['"]([^'"]+)['"]/);
  assert.ok(m, 'VERSION not found in index.js');
  assert.ok(vnum(m[1]) >= vnum(BORN_V), `VERSION ${m[1]} < ${BORN_V}`);
});

test('A2: manifest.json version >= BORN_V', () => {
  const man = JSON.parse(read('manifest.json'));
  assert.ok(vnum(man.version) >= vnum(BORN_V), `manifest version ${man.version} < ${BORN_V}`);
});

test('A3: 两模块通过 globalThis 挂载', () => {
  assert.ok(typeof CE === 'object', 'CounterfactualExperimentLib not on globalThis');
  assert.ok(typeof EI === 'object', 'EraInheritanceLib not on globalThis');
  assert.ok(vnum(CE.VERSION) >= vnum(BORN_V), `CE.VERSION ${CE.VERSION} < ${BORN_V}`);
  assert.ok(vnum(EI.VERSION) >= vnum(BORN_V), `EI.VERSION ${EI.VERSION} < ${BORN_V}`);
});

test('A4: BORN_V 自锚', () => {
  assert.equal(BORN_V, '3.360.0');
});

/* ============================================================ */
/* B 面：M6-X4 多步反事实实验                                   */
/* ============================================================ */
test('B1: 同一筹展起点分别改期/不改期各推进三幕，可定位首次分歧', () => {
  const exp = CE.createExperiment({
    experimentId: 'exp_001',
    frozenFacts: { event: '筹展开始', date: '2024-03-01' },
    interventions: ['change-date'],
    routeIds: ['routeA', 'routeB'],
  });
  // routeA: 不改期
  CE.advanceStep(exp, 'routeA', { assumption: '按时举办', result: '展期正常' });
  CE.advanceStep(exp, 'routeA', { assumption: '观众到场', result: '互动顺利' });
  CE.advanceStep(exp, 'routeA', { assumption: '后续邀约', result: '收到新展' });

  // routeB: 改期
  CE.advanceStep(exp, 'routeB', { assumption: '改期到下月', result: '展期推迟' });
  CE.advanceStep(exp, 'routeB', { assumption: '通知观众', result: '部分流失' });
  CE.advanceStep(exp, 'routeB', { assumption: '新展期举办', result: '小规模完成' });

  const div = CE.locateFirstDivergence(exp, 'routeA', 'routeB');
  assert.equal(div.found, true);
  assert.equal(div.stepIndex, 0); // 第一步就分歧
  assert.equal(div.detailA.assumption, '按时举办');
  assert.equal(div.detailB.assumption, '改期到下月');
});

test('B2: 两路线共享未改动前提（冻结事实不变）', () => {
  const frozenFacts = { event: '筹展', date: '2024-03-01' };
  const exp = CE.createExperiment({
    experimentId: 'exp_002',
    frozenFacts,
    interventions: [],
    routeIds: ['A', 'B'],
  });
  CE.advanceStep(exp, 'A', { assumption: 'step1', result: 'r1' });
  CE.advanceStep(exp, 'B', { assumption: 'step1-diff', result: 'r2' });
  // 冻结事实引用不变
  assert.equal(exp.frozenFacts.event, '筹展');
  assert.equal(exp.frozenFacts.date, '2024-03-01');
  // 原始 frozenFacts 对象也不变
  assert.equal(frozenFacts.event, '筹展');
});

test('B3: 丢弃实验后正史事实/人物知识/未完约定无新增', () => {
  const exp = CE.createExperiment({
    experimentId: 'exp_003',
    frozenFacts: { fact: '原史事实' },
    interventions: [],
    routeIds: ['A', 'B'],
  });
  CE.advanceStep(exp, 'A', { assumption: '假设A', result: '结果A' });
  const result = CE.discardExperiment(exp);
  assert.equal(result.discarded, true);
  assert.equal(result.frozenFactsUntouched, true);
  assert.equal(result.noSideEffects, true);
  assert.equal(exp.status, 'discarded');
  assert.equal(exp.discarded, true);
});

/* ============================================================ */
/* C 面：M6-X9 跨时代传承                                       */
/* ============================================================ */
test('C1: 跳到五年后，短期预约不照搬而组织规则可延续', () => {
  const trans = EI.createEraTransition({
    transitionId: 'trans_001',
    eraFrom: '2024',
    eraTo: '2029',
    changeRules: { timespan: '5years' },
    items: [
      { id: 'item_1', type: 'appointment', content: '下周三的约', expiry: '2024-03-15' },
      { id: 'item_2', type: 'org-rule', content: '读书社每月第一周活动' },
      { id: 'item_3', type: 'project', content: '年度展览计划' },
      { id: 'item_4', type: 'personal', content: '前任的私人日记', ownerPrivate: true },
    ],
  });
  const proposals = EI.generateInheritanceProposals(trans);
  assert.equal(proposals.length, 4);
  // 短期预约 → expired（不照搬）
  assert.equal(proposals[0].proposalType, 'expired');
  // 组织规则 → still-valid（可延续）
  assert.equal(proposals[1].proposalType, 'still-valid');
  // 项目 → inherited（由后继者继承）
  assert.equal(proposals[2].proposalType, 'inherited');
  // 私人经历 → author-decides
  assert.equal(proposals[3].proposalType, 'author-decides');
});

test('C2: 新负责人继承事业但不是自动知道前任私人经历', () => {
  const trans = EI.createEraTransition({
    transitionId: 'trans_002',
    eraFrom: '2024',
    eraTo: '2029',
    changeRules: {},
    items: [
      { id: 'proj', type: 'project', content: '展览事业' },
      { id: 'diary', type: 'personal', content: '私人日记内容', ownerPrivate: true },
    ],
  });
  EI.generateInheritanceProposals(trans);
  const result = EI.applyTransition(trans, [
    { itemId: 'proj', action: 'accept' },
    { itemId: 'diary', action: 'accept' },
  ]);
  assert.equal(result.appliedCount, 2);
  // 项目继承：新负责人继承了事业内容
  const projApplied = result.newEraState.find(a => a.itemId === 'proj');
  assert.equal(projApplied.inheritedContent, '展览事业');
  // 私人经历：即使 accept 也不自动继承私人知识
  const diaryApplied = result.newEraState.find(a => a.itemId === 'diary');
  assert.equal(diaryApplied.privateKnowledgeInherited, false);
  assert.equal(diaryApplied.inheritedContent, null); // 私人内容不自动继承
});

test('C3: 逐项选择并撤销一次转场，旧卷保持可读', () => {
  const trans = EI.createEraTransition({
    transitionId: 'trans_003',
    eraFrom: '2024',
    eraTo: '2029',
    changeRules: {},
    items: [
      { id: 'i1', type: 'org-rule', content: '规则1' },
      { id: 'i2', type: 'project', content: '项目2' },
    ],
  });
  EI.generateInheritanceProposals(trans);
  EI.applyTransition(trans, [
    { itemId: 'i1', action: 'accept' },
    { itemId: 'i2', action: 'reject' },
  ]);
  assert.equal(trans.status, 'applied');
  // 撤销
  const undo = EI.undoTransition(trans);
  assert.equal(undo.undone, true);
  assert.equal(undo.oldEraReadable, true);
  assert.equal(undo.newEraConsistent, true);
  assert.equal(trans.status, 'pending');
  assert.equal(trans.appliedItems.length, 0);
});

/* ============================================================ */
/* D 面：WorldProgress 集成                                     */
/* ============================================================ */
test('D1: export/import 含 cfExperiments 与 eraTransitions', () => {
  const orgCode = read('memory-organs.js');
  assert.ok(orgCode.includes('this.cfExperiments'), 'cfExperiments not initialized');
  assert.ok(orgCode.includes('cfExperiments: this.cfExperiments'), 'cfExperiments not exported');
  assert.ok(orgCode.includes('this.cfExperiments = Array.isArray(data.cfExperiments)'), 'cfExperiments not imported');
  assert.ok(orgCode.includes('this.eraTransitions'), 'eraTransitions not initialized');
  assert.ok(orgCode.includes('eraTransitions: this.eraTransitions'), 'eraTransitions not exported');
  assert.ok(orgCode.includes('this.eraTransitions = Array.isArray(data.eraTransitions)'), 'eraTransitions not imported');
});

test('D2: OrganFallback 降级桩存在', () => {
  const idx = read('index.js');
  assert.ok(idx.includes('createCFExperiment() { return null; }'), 'createCFExperiment fallback not found');
  assert.ok(idx.includes('_getCounterfactualLib() { return null; }'), '_getCounterfactualLib fallback not found');
  assert.ok(idx.includes('createEraTransition() { return null; }'), 'createEraTransition fallback not found');
  assert.ok(idx.includes('_getEraInheritanceLib() { return null; }'), '_getEraInheritanceLib fallback not found');
});

/* ============================================================ */
/* E 面：负控制三向自证                                         */
/* ============================================================ */
test('E1: 负控制——破坏首次分歧定位（跳过比较）→ 可观测', () => {
  delete globalThis.CounterfactualExperimentLib;
  const brokenCode = breakSource(ceCode, 'if (stepsA[i].assumption !== stepsB[i].assumption ||\n          stepsA[i].result !== stepsB[i].result)', 'if (false)');
  eval(brokenCode + '\nglobalThis.__brokenCE = CounterfactualExperimentLib;');
  const brokenCE = globalThis.__brokenCE;
  const exp = brokenCE.createExperiment({
    experimentId: 'b1',
    frozenFacts: {},
    interventions: [],
    routeIds: ['A', 'B'],
  });
  brokenCE.advanceStep(exp, 'A', { assumption: 'same', result: 'r1' });
  brokenCE.advanceStep(exp, 'B', { assumption: 'different', result: 'r2' });
  const div = brokenCE.locateFirstDivergence(exp, 'A', 'B');
  // 破坏后：明明有分歧但 found=false → 可观测
  assert.equal(div.found, false); // 破坏导致漏检
});

test('E2: 负控制——破坏私人经历不继承（改 false → true）→ 可观测', () => {
  delete globalThis.EraInheritanceLib;
  const brokenCode = breakSource(eiCode, 'privateKnowledgeInherited: false', 'privateKnowledgeInherited: true');
  eval(brokenCode + '\nglobalThis.__brokenEI = EraInheritanceLib;');
  const brokenEI = globalThis.__brokenEI;
  const trans = brokenEI.createEraTransition({
    transitionId: 'b2',
    eraFrom: '2024', eraTo: '2029',
    changeRules: {},
    items: [{ id: 'd', type: 'personal', content: '私人日记', ownerPrivate: true }],
  });
  brokenEI.generateInheritanceProposals(trans);
  const result = brokenEI.applyTransition(trans, [{ itemId: 'd', action: 'accept' }]);
  const diary = result.newEraState[0];
  // 破坏后：私人经历被自动继承了 → 可观测
  assert.equal(diary.privateKnowledgeInherited, true); // 破坏导致私人泄露
});

test('E3: 负控制——破坏撤销（不改状态）→ 可观测', () => {
  delete globalThis.EraInheritanceLib;
  const brokenCode = breakSource(eiCode, "transition.status = 'pending'", "transition.status = 'applied'");
  eval(brokenCode + '\nglobalThis.__brokenEI2 = EraInheritanceLib;');
  const brokenEI = globalThis.__brokenEI2;
  const trans = brokenEI.createEraTransition({
    transitionId: 'b3',
    eraFrom: '2024', eraTo: '2029',
    changeRules: {},
    items: [{ id: 'x', type: 'org-rule', content: 'rule' }],
  });
  brokenEI.generateInheritanceProposals(trans);
  brokenEI.applyTransition(trans, [{ itemId: 'x', action: 'accept' }]);
  const undo = brokenEI.undoTransition(trans);
  // 破坏后：撤销后 status 仍为 applied 而非 pending → 可观测
  assert.equal(trans.status, 'applied'); // 破坏导致撤销无效
});