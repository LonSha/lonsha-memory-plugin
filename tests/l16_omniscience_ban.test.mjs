import test from 'node:test';
import assert from 'node:assert/strict';
import filterMod from '../cognitive-horizon-bucket-filter.js';

test('L16-O1: Cognitive Horizon 4-Bucket Filter 基本划分逻辑', () => {
  const { BUCKETS, classifyCognitiveBucket, filterAndPartitionCognitiveHorizon, buildAntiOmniscienceSealHeader } = filterMod;
  assert.ok(BUCKETS, 'BUCKETS 枚举必须存在');
  assert.equal(BUCKETS.DIRECT_LIVED, 'DIRECT_LIVED');
  assert.equal(BUCKETS.SHARED_SCENE, 'SHARED_SCENE');
  assert.equal(BUCKETS.RUMOR_UNVERIFIED, 'RUMOR_UNVERIFIED');
  assert.equal(BUCKETS.EMBARGO_SILENT, 'EMBARGO_SILENT');

  // 1. 世界公理 / 常识：进入 SHARED_SCENE
  const worldFact = { text: '这是魔法大陆的天气系统', scope: 'world' };
  assert.equal(classifyCognitiveBucket(worldFact, 'Alice', ['Alice', 'Bob']).bucket, BUCKETS.SHARED_SCENE);

  // 2. 主观亲历 (DIRECT_LIVED): 角色就是发言者本人
  const livedFact = { text: 'Alice 私下藏着一把钥匙', owner: 'Alice' };
  assert.equal(classifyCognitiveBucket(livedFact, 'Alice', ['Alice', 'Bob']).bucket, BUCKETS.DIRECT_LIVED);

  // 3. 传闻与未经证实 (RUMOR_UNVERIFIED)
  const rumorFact = { text: '城外出现了龙的踪迹', isRumor: true, knownBy: ['Alice'] };
  const rRes = classifyCognitiveBucket(rumorFact, 'Alice', ['Alice']);
  assert.equal(rRes.bucket, BUCKETS.RUMOR_UNVERIFIED);

  // 4. 认知禁区 (EMBARGO_SILENT) 负控制：Bob 的私密心事，当前发言人是 Alice，Bob 并不在场
  const secretFact = { text: 'Bob 暗中谋划背叛', owner: 'Bob', character: 'Bob', scope: 'character', knownBy: ['Bob'] };
  const eRes = classifyCognitiveBucket(secretFact, 'Alice', ['Alice', 'Charlie']);
  assert.equal(eRes.bucket, BUCKETS.EMBARGO_SILENT, '非知情角色绝不能获取其他角色的私密心声');

  // 5. 批量过滤统计自洽
  const candidates = [worldFact, livedFact, rumorFact, secretFact];
  const partitioned = filterAndPartitionCognitiveHorizon(candidates, 'Alice', ['Alice', 'Charlie']);
  assert.equal(partitioned.directLived.length, 1);
  assert.equal(partitioned.sharedScene.length, 1);
  assert.equal(partitioned.rumorUnverified.length, 1);
  assert.equal(partitioned.embargoSilent.length, 1);
  assert.equal(partitioned.stats.embargoed, 1);
  assert.ok(partitioned.rumorUnverified[0].text.includes('[传闻/道听途说·未证实]'), '传闻必须打上认知前缀');

  // 6. 防全知封口锁指令
  const seal = buildAntiOmniscienceSealHeader('Alice');
  assert.ok(seal.includes('〔全知禁令与视界隔离｜聚焦角色：Alice〕'), '必须包含角色专名封口锁');
  assert.ok(seal.includes('严禁展现任何未卜先知的上帝全知视角'), '必须包含上帝视角防透视禁令');
});

test('L16-O1: 酒馆多角色动态性测试（不硬编码任何角色卡名称）', () => {
  const { BUCKETS, filterAndPartitionCognitiveHorizon, buildAntiOmniscienceSealHeader } = filterMod;
  // 测试任意动态酒馆角色名，如 "Kaelen_The_Mage", "Elena", "NPC_Merchant_01"
  const dynamicHero = 'Kaelen_The_Mage';
  const seal = buildAntiOmniscienceSealHeader(dynamicHero);
  assert.ok(seal.includes(`聚焦角色：${dynamicHero}`), '必须动态绑定酒馆当前角色名');

  const memories = [
    { text: 'Kaelen 昨夜研究了禁咒', owner: dynamicHero },
    { text: '城防军换岗时间是子夜', scope: 'world' },
    { text: '神秘雇主只信任 Elena', owner: 'Elena', knownBy: ['Elena'] }
  ];

  const res = filterAndPartitionCognitiveHorizon(memories, dynamicHero, [dynamicHero]);
  assert.equal(res.directLived.length, 1);
  assert.equal(res.sharedScene.length, 1);
  assert.equal(res.embargoSilent.length, 1, 'Elena 的秘密必须对 Kaelen 禁运');
  assert.equal(res.embargoSilent[0].reason, 'off-limits-cognitive-embargo');
});
