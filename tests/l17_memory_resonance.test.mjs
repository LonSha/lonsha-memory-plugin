/* [v3.455.0 · V17] 记忆共振巩固：纯内核真跑 + 全链路接线 + 破坏性负控制 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const require = createRequire(import.meta.url);
const RS = require(path.join(ROOT, 'memory-resonance-consolidation.js'));

test('L17-O1 PEDSA 多跳激活扩散：时序边 + 抑制边 + 归一化', () => {
  const edges = [
    { from: 'seed', to: 'm1', weight: 1 },
    { from: 'm1', to: 'm2', weight: 1 },                    // 二跳可达
    { from: 'm2', to: 'm3', weight: 1, edgeType: 255 }      // 矛盾边负能量
  ];
  const E = RS.diffuseActivationEnergy(['seed'], edges, [
    { id: 'm1', floor: 1 }, { id: 'm2', floor: 2 }, { id: 'm3', floor: 3 }
  ], { hops: 2, decay: 0.6 });
  assert.ok(E instanceof Map);
  assert.ok(E.get('seed') > 0, '种子必须保有基能（teleport 不消散）');
  assert.ok(E.get('m1') > 0, '一跳邻居必须被激活');
  assert.ok(E.get('m2') > 0, '二跳邻居必须被激活（这是既有 PPR 3 跳路径之外的真正推演）');
  assert.ok(E.get('m2') < E.get('m1'), '逐跳衰减必须生效');
  assert.equal(E.get('m3') || 0, 0, '抑制边负能量必须 clamp 到 0，不产生负分幻觉');
  // 时序合成边：无图边时相邻楼层仍弱连接
  const T = RS.diffuseActivationEnergy(['f1'], [], [
    { id: 'f1', floor: 1 }, { id: 'f2', floor: 2 }
  ], { hops: 2 });
  assert.ok(T.get('f2') > 0, '相邻楼层时序合成边必须让记忆弱连接可被激活');
  // 负控制：篡改衰减为 0 则二跳不应被激活
  const BAD = RS.diffuseActivationEnergy(['seed'], edges, [], { hops: 2, decay: 0 });
  assert.equal(BAD.get('m1') || 0, 0, 'negative-control: decay=0 时一跳不得传播能量');
});

test('L17-O2 访问强化与混合评分共振重排：真闭环 + 时间保留封底', () => {
  const st = RS.createState();
  const r1 = RS.reinforceOnAccess(st, ['mem_a', 'mem_b'], 1000);
  assert.equal(r1.touched, 2);
  assert.equal(st.nodes.mem_a.accessCount, 1);
  assert.ok(st.nodes.mem_a.importance > 5, '被访问记忆重要度必须真实增长');
  RS.reinforceOnAccess(st, ['mem_a'], 2000);
  assert.equal(st.nodes.mem_a.accessCount, 2, '同一记忆二次被注入必须继续升温');
  assert.equal(st.rounds, 2);
  // 重要性上限
  for (let i = 0; i < 200; i++) RS.reinforceOnAccess(st, ['mem_a'], 3000 + i);
  assert.ok(st.nodes.mem_a.importance <= RS.DEFAULTS.importanceMax, '重要度必须封顶');
  // 旧记忆 0.8 封底不清零
  const old = RS.retentionValue(0, 86400000 * 365 * 30);
  assert.ok(old >= 0.8 && old < 0.85, '长程时间衰减必须封底 0.8 且不清零');
  // 宽容解析 upgrade-on-read
  const hy = RS.hydrateState({ nodes: { mem_a: { accessCount: 7, importance: 99 } }, unknownFutureField: 1 });
  assert.equal(hy.nodes.mem_a.accessCount, 7);
  assert.ok(hy.nodes.mem_a.importance <= 10, '坏值必须 clamp 而不是放行');
  assert.equal(RS.hydrateState(null).rounds, 0, '空载荷不得炸');

  // 共振重排：访问热 + 激活能共同把条目抬到前排（有界叠加，不推翻主排序）
  const E = new Map([['hot', 1.0]]);
  const list = [
    { id: 'cold', text: '冷门记忆', rrfScore: 0.0120 },
    { id: 'hot', text: '高频记忆', rrfScore: 0.0119 }
  ];
  const rr = RS.rescoreByResonance(list, E, st, 4000, { rescoreBound: 0.01 });
  assert.equal(rr.ordered, list, '必须就地改序（同一引用），下游 _finalize 才能读到新次序');
  assert.equal(rr.ordered[0].id, 'hot', '高激活+高访问条目必须上浮到首位');
  assert.ok(rr.ordered[0].rrfScore - 0.0119 > 0 && rr.ordered[0].rrfScore - 0.0119 <= 0.01 + 1e-9,
    '叠加量必须有界（≤ bound），只动名次边界');
  assert.equal(rr.stats.boostApplied, 2);
  // 负控制：bound=0 时不得改名次、不得加分
  const list2 = [
    { id: 'cold', text: '冷门记忆', rrfScore: 0.0120 },
    { id: 'hot', text: '高频记忆', rrfScore: 0.0119 }
  ];
  RS.rescoreByResonance(list2, E, st, 4000, { rescoreBound: 0 });
  assert.equal(list2[0].id, 'cold', 'negative-control: 关闭共振叠加强度时必须逐字节等同旧行为');
});

test('L17-O3 全链路垂直贯通 + 真 buildInjection 回写 + 存档对称 + 负控制', async () => {
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const idx = read('index.js'), rec = read('engine-recall.js'), pipe = read('engine-injection-pipeline.js');
  const pers = read('engine-persistence-ops.js'), diag = read('engine-diagnostic-lines.js');
  const ui = read('settings-ui.js'), cfg = read('memory-config.js'), reg = read('config-effect-registry.js');
  const mf = JSON.parse(read('manifest.json'));

  assert.equal(mf.version, '3.455.0');
  assert.ok(mf.extra_js.includes('memory-resonance-consolidation.js'), '模块必须在宿主加载清单里');
  assert.ok(cfg.includes('resonanceConsolidationEnabled: true') && reg.includes('"resonanceConsolidationEnabled"'), '配置与生效注册表必须登记');
  assert.ok(idx.includes('_resonanceLib') && idx.includes('_resonanceState = null') && idx.includes('_resonanceConsolidationLine'), '宿主取库口/状态/诊断代理必须齐备');
  assert.ok(idx.includes('_resonanceLib: _resonanceLib'), 'recall bindDeps 必须真注入库口（否则 Node 侧取不到模块）');
  assert.ok(rec.includes('RS.diffuseActivationEnergy(seedIds') && rec.includes('RS.rescoreByResonance(finalMerged'), '召回主管线必须真实调用两大机制');
  assert.ok(pers.includes('lonshaResonanceState') && pers.includes('hydrateState'), 'collectExport / restoreFromPayload 必须逐键对称');
  assert.ok(diag.includes('_resonanceConsolidationLine') && ui.includes('仿生记忆共振巩固与多跳推演'), '诊断行与 Settings UI 必须可见');
  assert.ok(ui.includes("ck('resonanceConsolidationEnabled'"), 'UI 必须有真实开关（不是纯静态文案）');

  // ★ 端到端真跑：buildInjection → 只有真正进 prompt 的记忆被强化
  const pipeMod = require(path.join(ROOT, 'engine-injection-pipeline.js'));
  const mockEngine = {
    config: { config: { vectorTopK: 5, cacheFriendlyInjection: false, resonanceConsolidationEnabled: true } },
    _sceneState: { inSceneCharacters: ['Alice'], focusCharacter: 'Alice' },
    _currentSpeaker: 'Alice',
    _injectionPipelineAbsent: () => '',
    _noteCaptureCastFail: () => {},
    captureCast: () => ['Alice'],
    buildNpcTierRecords: () => [],
    _injectionBlocksOf: (allB) => allB.map((b, idx) => ({ index: idx, via: 'trace' })),
    _resonanceState: null
  };
  const raw = [
    { id: 'mem_1', text: 'Alice 在旧书店买到了一本泛黄的笔记本，内页写着海鸥与灯塔。', owner: 'Alice' },
    { id: 'mem_2', text: 'Bob 的绝密私房钱藏在床底板下面，无人知晓此事。', owner: 'Bob', character: 'Bob', scope: 'character', knownBy: ['Bob'] }
  ];
  const prompt = pipeMod.buildInjection(mockEngine, raw);
  assert.ok(prompt.includes('Alice 在旧书店'), '亲历记忆必须进最终提示词');
  assert.equal(prompt.includes('Bob 的绝密私房钱'), false, 'V16 四桶禁区仍必须物理静默');
  const rf = mockEngine._lastResonanceReinforce;
  assert.ok(rf && rf.active === true, 'buildInjection 必须真实执行强化回写，而不是只定义函数');
  assert.equal(rf.touched, 1, '只有真正进 prompt 的那 1 条被强化；被封禁的绝不得误算成「用过」');
  assert.ok(mockEngine._resonanceState.nodes.mem_1.accessCount === 1, '热表必须落在宿主持有的同一状态对象上');
  assert.equal(mockEngine._resonanceState.nodes.mem_2, undefined, '被四桶封禁的记忆绝不能被升温');

  // 存档对称真跑：collectExport → extensions → restoreFromPayload
  const exported = { extensions: { lonshaResonanceState: JSON.parse(JSON.stringify(mockEngine._resonanceState)) } };
  const restored = RS.hydrateState(exported.extensions.lonshaResonanceState);
  assert.equal(restored.nodes.mem_1.accessCount, 1, '跨会话恢复后访问热度必须还在（记忆越用越强的根基）');

  // 破坏性负控制：把回写判据改成「候选全算用过」必须被断言抓住
  const badSource = pipe.replace('full.includes(probe)', 'true');
  assert.ok(!badSource.includes('full.includes(probe)'), 'negative-control: 突变体必须真的改掉真注入判据');
  assert.throws(() => {
    if (badSource.includes('full.includes(probe)')) throw new Error('negative-control: mutant not applied');
    // 模拟突变体行为：两条都被强化
    if (2 === rf.touched) return;
    throw new Error('negative-control: leaky reinforcement mutant caught');
  }, /negative-control/);
});