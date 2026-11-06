/* [v3.457.0 · V19-O1/O2] 多维防混淆与实体认知锚定矩阵核心算法与交响中枢定向测试 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

test('L19-O1 实体身份指代消歧与显式认知锚定前缀', async () => {
  const ACMDMod = await import(pathToFileURL(path.join(ROOT, 'anti-confusion-matrix-disambiguator.js')).href);
  const ACMD = ACMDMod.default || ACMDMod;
  const state = ACMD.createState();

  const candidates = [
    { id: 'c1', text: '他悄悄收下了那封匿名信，不愿被任何人知晓', character: '林深', floor: 10 },
    { id: 'c2', text: '在咖啡厅里，艾拉与雷诺低声争吵着关于钥匙的下落', floor: 12 },
    { id: 'c3', text: '普通公共场景：阳光穿过树梢照在石阶上', floor: 15 }
  ];

  const result = ACMD.disambiguateMemoryCandidates(candidates, {
    knownCharacters: ['林深', '艾拉', '雷诺'],
    currentSpeaker: '林深',
    userName: '你',
    activeFloor: 16
  }, state);

  assert.equal(result.candidates.length, 3, '候选数量必须完整保真');
  assert.ok(result.candidates[0].text.startsWith('【实体锚定·林深】'), '指代模糊的林深心声必须被赋予实体锚定前缀');
  assert.ok(result.candidates[1].text.startsWith('【多角色交互·艾拉&雷诺】'), '多角色在场混淆条目必须被打上交互标识');
  assert.equal(result.candidates[2].text, candidates[2].text, '普通场景条目不得被破坏');
  assert.equal(result.disambiguatedCount, 2, '消歧计数必须为2');
  assert.ok(result.directives.includes('【身份边界】'), '必须产出高阶防混淆身份约束指令');
  assert.ok(result.directives.includes('林深, 艾拉, 雷诺'), '已知角色名单必须动态贯通');

  // 破坏性负控制：若角色名不在 knownCharacters，不应误打多角色标签
  const soloResult = ACMD.disambiguateMemoryCandidates([candidates[1]], {
    knownCharacters: ['其他角色'],
    currentSpeaker: '其他角色'
  });
  assert.equal(soloResult.candidates[0].text.includes('【多角色交互'), false, 'negative-control: 未匹配实体时严禁胡乱打标');
});

test('L19-O2 互斥事实冲突仲裁与时空矛盾淘汰', async () => {
  const ACMDMod = await import(pathToFileURL(path.join(ROOT, 'anti-confusion-matrix-disambiguator.js')).href);
  const ACMD = ACMDMod.default || ACMDMod;
  const state = ACMD.createState();

  const candidates = [
    { id: 'f_old', text: '旧版事实：艾拉在前线战斗中不幸牺牲永眠', floor: 20 },
    { id: 'f_new', text: '最新事实：奇迹发生，艾拉从重伤昏迷中彻底醒来并站立起来微笑说话', floor: 45 }
  ];

  const conflict = ACMD.detectMutualExclusionConflict(candidates[0], candidates[1]);
  assert.ok(conflict, '必须能检测出生死互斥冲突');
  assert.equal(conflict.winnerId, 'f_new', '较高楼层的最新事实必须作为胜者胜出');
  assert.equal(conflict.loserId, 'f_old', '较低楼层的矛盾旧事实必须被标记淘汰');

  const result = ACMD.disambiguateMemoryCandidates(candidates, {
    knownCharacters: ['艾拉'],
    currentSpeaker: '艾拉',
    activeFloor: 50
  }, state);

  assert.equal(result.candidates.length, 1, '发生致命互斥时，被淘汰的陈旧冲突事实必须被裁除');
  assert.equal(result.candidates[0].id, 'f_new', '胜者条目必须保留');
  assert.equal(result.resolvedConflicts.length, 1, '冲突解决计数记录 1 次');
  assert.ok(result.directives.includes('【时空一致性】'), '结构化约束中必须包含时空一致性仲裁说明');
});

test('L19-O3 全域交响编排中枢贯通执行与状态水合', async () => {
  const MSOMod = await import(pathToFileURL(path.join(ROOT, 'memory-symphony-orchestrator.js')).href);
  const MSO = MSOMod.default || MSOMod;
  const state = MSO.createState();

  const mockEngine = {
    _currentSpeaker: '爱丽丝',
    _currentFloor: 30,
    getKnownCharacters: () => ['爱丽丝', '鲍勃'],
    getUserName: () => '探求者',
    invariants: {
      items: [
        { kind: 'death', target: '卡尔' }
      ]
    },
    _causalCircuitLib: () => ({
      verifyCausalInvariants: (fact, invariants) => {
        const t = String(fact.text || fact.content || '');
        if (t.includes('卡尔') && t.includes('微笑')) {
          return { allowed: false, violationReason: '死者复生硬冲突' };
        }
        return { allowed: true };
      }
    }),
    _antiConfusionLib: () => ({
      createState: () => ({ disambiguatedCount: 0, conflictResolvedCount: 0 }),
      disambiguateMemoryCandidates: (candidates) => ({
        candidates: candidates.map(c => Object.assign({}, c, { disambiguated: true })),
        disambiguatedCount: candidates.length,
        resolvedConflicts: [],
        directives: '【身份边界】爱丽丝与鲍勃各就其位'
      })
    }),
    _cognitiveHorizonLib: () => ({
      filterContextForCognitiveHorizon: (candidates, viewer) => {
        // 过滤不在场鲍勃的私密
        return candidates.filter(c => !(c.character === '鲍勃' && c.private));
      }
    })
  };

  const rawCandidates = [
    { id: '1', text: '爱丽丝在图书馆查阅古籍', character: '爱丽丝' },
    { id: '2', text: '死去的卡尔正在走廊里微笑着对大家说话', character: '卡尔' }, // 违背因果律
    { id: '3', text: '鲍勃暗自写下的绝密心愿', character: '鲍勃', private: true } // 违背视界边界
  ];

  const orchestrated = MSO.orchestrateMemorySymphony(mockEngine, rawCandidates, { floor: 30 });
  assert.equal(orchestrated.candidates.length, 1, '卡尔(因果冲突)与鲍勃(私密视界)必须均被交响中枢逐级裁决过滤');
  assert.equal(orchestrated.candidates[0].id, '1', '合法且经消歧的爱丽丝记忆必须保留');
  assert.ok(orchestrated.directives.includes('【身份边界】'), '交响编排产出的防混淆指令必须透传');
  assert.equal(mockEngine._symphonyState.totalSymphonyRounds, 1, '交响轮数必须真实累加');
  assert.ok(mockEngine._symphonyState.lastOrchestrationTrace, '交响追踪日志必须落盘');

  // 水合与持久化验证
  const hydrated = MSO.hydrateState(mockEngine._symphonyState);
  assert.equal(hydrated.totalSymphonyRounds, 1);
});