/* [v3.458.0 · V20 史诗级双计划] 心理防御、超图因果推演与自愈免疫单测 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

test('L20-O1 认知心理防御与潜意识移情扭曲引擎', async () => {
  const mod = await import(pathToFileURL(path.join(ROOT, 'psychological-defense-engine.js')).href);
  const PDE = mod.default || mod;

  const state = PDE.createState();
  assert.equal(state.version, '3.458.0');

  // 1. 注册创伤与防御机制
  PDE.registerDefenseNode(state, {
    character: '林深',
    triggerKeywords: ['大火', '背叛', '遗迹'],
    mechanism: PDE.DEFENSE_TYPES.DENIAL,
    description: '当年旧友背叛'
  });

  PDE.registerDefenseNode(state, {
    character: '林深',
    triggerKeywords: ['绝密实验'],
    mechanism: PDE.DEFENSE_TYPES.REPRESSION,
    description: '不可承受的实验痛苦'
  });

  // 2. 注册潜意识移情
  PDE.registerTransference(state, {
    character: '林深',
    sourcePrototype: '已故导师雷恩',
    targetActor: '艾拉',
    emotionalCharge: '既崇敬又畏惧'
  });

  // 3. 候选记忆池
  const candidates = [
    { id: 'm1', text: '林深目睹了大火中旧友的背叛', character: '林深' },
    { id: 'm2', text: '林深参与了当年的绝密实验过程', character: '林深' },
    { id: 'm3', text: '艾拉微笑着递过一杯热茶', character: '艾拉' }
  ];

  const result = PDE.evaluatePsychologicalDistortion(candidates, {
    currentSpeaker: '林深',
    inSceneCharacters: ['林深', '艾拉'],
    queryText: '关于大火的真相'
  }, state);

  // 验证：m1 否认（保留并扭曲），m2 压抑（被抑制过滤），m3 无防御触发（保留）
  assert.equal(result.candidates.length, 2, '压抑机制的记忆必须被剔除出常规候选');
  const m1 = result.candidates.find(c => c.id === 'm1');
  assert.ok(m1.text.includes('【潜意识否认·合理化怀疑】'), '否认机制必须添加心理防线心声');
  assert.ok(result.directives.includes('【潜意识移情】林深 不由自主地将 已故导师雷恩 的影子重叠在 艾拉 身上'));
  assert.ok(result.directives.includes('【心理防御·压抑】林深 对关键事件产生本能排斥'));
});

test('L20-O2 超图多跳联合因果推演拓扑中枢', async () => {
  const mod = await import(pathToFileURL(path.join(ROOT, 'hypergraph-causal-backtracking-hub.js')).href);
  const HCH = mod.default || mod;

  const state = HCH.createState();
  HCH.registerNode(state, { id: 'c1', label: '暴雨封山' });
  HCH.registerNode(state, { id: 'c2', label: '密函被截获' });
  HCH.registerNode(state, { id: 'e1', label: '两派信使断联' });
  HCH.registerNode(state, { id: 'e2', label: '全面决裂开战' });

  // 注册超边：多因一果 (c1 + c2 -> e1)
  HCH.registerHyperedge(state, {
    name: '通讯阻绝',
    causes: ['c1', 'c2'],
    effects: ['e1'],
    rationale: '天灾与人祸双重阻绝'
  });

  // 级联边：e1 -> e2
  HCH.registerHyperedge(state, {
    name: '战火爆发',
    causes: ['e1'],
    effects: ['e2'],
    rationale: '误会升级不可逆转'
  });

  // 反向因果回溯
  const trace = HCH.backtrackCausalClosure(state, 'e2', 3);
  assert.equal(trace.causalChain.length, 2, '必须完整反溯出两跳因果链条');
  assert.ok(trace.rootCauses.includes('c1'), '根源原因 c1 必须被闭包覆盖');
  assert.ok(trace.rootCauses.includes('c2'), '根源原因 c2 必须被闭包覆盖');
  assert.ok(trace.rationaleSummary.includes('【超图因果推演链】'));
});

test('L20-O3 记忆自愈免疫与抗幻觉冲突仲裁', async () => {
  const mod = await import(pathToFileURL(path.join(ROOT, 'memory-healing-immunity-adjudicator.js')).href);
  const MHIA = mod.default || mod;

  const state = MHIA.createState();
  const invariants = [
    { entity: '索恩', rule: '老将军索恩在第15楼已阵亡长眠', character: '索恩' },
    { entity: '星核钥匙', rule: '星核钥匙在第20楼彻底损毁于熔岩', item: '星核钥匙' }
  ];

  // 幻觉文本：描写已故索恩在说话
  const hallucinatoryText = '索恩微笑着走上前拔剑说道：“我们还没输！”';
  const adjudication = MHIA.adjudicateAndHeal(hallucinatoryText, invariants, state, 30);

  assert.equal(adjudication.healthy, false, '违背不变量的文本必须判定为非健康');
  assert.equal(adjudication.violations.length, 1);
  assert.equal(adjudication.violations[0].type, 'mortality_violation');
  assert.ok(adjudication.patch, '必须生成自愈补丁');

  // 构建免疫指令
  const directives = MHIA.buildImmunizationDirectives(state);
  assert.ok(directives.includes('【记忆自愈免疫接种】'));
  assert.ok(directives.includes('角色「索恩」已于早期定论确凿死亡'));
});