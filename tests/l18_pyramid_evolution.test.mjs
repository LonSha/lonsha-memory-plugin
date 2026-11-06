/* [v3.456.0 · V18] 分层记忆折叠金字塔与整合演化：纯内核真跑 + 负控制断言 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const require = createRequire(import.meta.url);
const HPE = require(path.join(ROOT, 'hierarchical-pyramid-evolution.js'));

test('L18-O1 分层折叠集群识别与同层合并规划 (Fan-in Cluster)', () => {
  const summaries = [
    { floor: 1, text: '初入宝鸡城北，打探到商会线索', accessCount: 2, level: 1 },
    { floor: 2, text: '商会总管拒绝提供账本，神色慌张', accessCount: 3, level: 1 },
    { floor: 3, text: '夜探商会密室，发现假银票印版', accessCount: 5, level: 1 },
    { floor: 30, text: '远赴长安拜访老友，偶遇故人', accessCount: 1, level: 1 }
  ];

  const clusters = HPE.planHierarchicalClusters(summaries, { fanInThreshold: 3 });
  assert.equal(clusters.length, 1, '应聚合出 1 个连续集群');
  const c = clusters[0];
  assert.equal(c.startFloor, 1);
  assert.equal(c.endFloor, 3);
  assert.equal(c.count, 3);
  assert.equal(c.totalAccess, 10, '访问热度应正确汇总');
  assert.equal(c.targetLevel, 2, '折叠目标层级应为 level 2 (周记/场景卷)');

  // 破坏性负控制：fanInThreshold 设为 5 时，3 条记录不应成团
  const badClusters = HPE.planHierarchicalClusters(summaries, { fanInThreshold: 5 });
  assert.equal(badClusters.length, 0, 'negative-control: 未达 fanIn 门限严禁成团');
});

test('L18-O2 语义演化与去重边构建规划 (Evolution Links)', () => {
  const items = [
    { id: 'sum_10', floor: 10, text: '城北红茶馆每周二休息闭店', timestamp: 1000 },
    { id: 'sum_15', floor: 15, text: '城北红茶馆每周二休息闭店，招收学徒一名', timestamp: 2000 }, // 高度重叠演化
    { id: 'sum_20', floor: 20, text: '在码头购买了一批红茶原料', timestamp: 3000 }                      // 相关话题
  ];

  const edges = HPE.planEvolutionLinks(items, {
    evolutionSimThreshold: 0.75,
    relatedSimThreshold: 0.40
  });

  assert.ok(edges.length >= 1, '应探测到关联或演化边');
  const evo = edges.find(e => e.type === 'evolution');
  assert.ok(evo, '高相似条目必须生成 evolution 边');
  assert.equal(evo.fromId, 'sum_10', '较旧的应指向较新的');
  assert.equal(evo.toId, 'sum_15');
  assert.ok(evo.similarity >= 0.75);

  // 状态水合与落盘测试
  const st = HPE.createState();
  const added = HPE.applyEvolutionEdges(st, edges);
  assert.ok(added >= 1);
  assert.equal(st.evolutionLinksCount, edges.length);

  const hydrated = HPE.hydrateState(JSON.parse(JSON.stringify(st)));
  assert.equal(hydrated.evolutionLinksCount, st.evolutionLinksCount);
  assert.equal(hydrated.links.length, st.links.length);
});

test('L18-O3 睡眠遗忘与演化归档安全联动 (Sleep-Retention Plan)', () => {
  const now = Date.now();
  const summaries = [
    {
      id: 'sum_1', floor: 1, text: '旧红茶馆', importance: 4, accessCount: 0,
      createdAt: now - 3600000 * 48 // 48小时前，低访问，低重要度
    },
    {
      id: 'sum_2', floor: 2, text: '极其关键的主线秘密', importance: 9, accessCount: 1,
      createdAt: now - 3600000 * 48 // 重要度>=8，豁免
    }
  ];

  const evolutionEdges = [
    { type: 'evolution', fromId: 'sum_1', toId: 'sum_99' }
  ];

  const plan = HPE.planSleepEvolutionArchival(summaries, evolutionEdges, {
    sleepForgetThreshold: 0.50,
    minAgeHoursForSleep: 1.0
  });

  assert.equal(plan.toArchive.length, 1, '低价值且有演化替换的记忆应进入归档');
  assert.equal(plan.toArchive[0].id, 'sum_1');
  assert.ok(plan.toArchive[0].reason.includes('演化'), '应标明演化加速休眠原因');
  assert.equal(plan.evolvedCount, 1);
});
