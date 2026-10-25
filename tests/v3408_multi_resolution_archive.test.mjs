import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Archive = require('../multi-resolution-archive-orchestrator.js');

test('L10-O8 · sealVolumeArchive 分卷封存与无损细节钻取', () => {
  const rawLogs = [
    { floor: 1, speaker: 'User', text: '你好，欢迎来到宝鸡。', id: 'm-1' },
    { floor: 2, speaker: 'Alice', text: '谢谢你带我来，这是我第一次离开老家。', id: 'm-2' }
  ];

  const vol = Archive.sealVolumeArchive('vol-1', '宝鸡相遇篇', 1, 50, rawLogs, {
    milestones: ['初次抵达宝鸡车站', '租下合租房并确立信任']
  });

  assert.equal(vol.volumeId, 'vol-1');
  assert.equal(vol.tier, Archive.RESOLUTION_TIERS.TIER_VOLUME_MILESTONE);
  assert.equal(vol.floorRange[0], 1);
  assert.equal(vol.floorRange[1], 50);
  assert.equal(vol.milestones.length, 2);

  // 验证按楼层向下钻取解压
  const drill2 = Archive.expandVolumeDrilldown(vol, 2);
  assert.ok(drill2);
  assert.equal(drill2.speaker, 'Alice');
  assert.ok(drill2.keyExcerpt.includes('离开老家'));
  assert.equal(drill2.rawId, 'm-2');

  const drillNone = Archive.expandVolumeDrilldown(vol, 99);
  assert.equal(drillNone, null);
});

test('L10-O8 · renderMultiResolutionContext 多分辨率阶梯提示词混排', () => {
  const sealed = [
    { volumeTitle: '序章·青涩岁月', floorRange: [1, 50], condensedSummary: '· 确立搭档关系\n· 遭遇第一次险境' }
  ];
  const beats = [
    { sceneName: '茶馆密谈', summary: '探查到黑市交易账本' }
  ];
  const logs = [
    { floor: 55, speaker: 'Bob', text: '行动必须在今晚开始。' }
  ];

  const prompt = Archive.renderMultiResolutionContext(sealed, beats, logs);
  assert.ok(prompt.includes('长线多分辨率史诗图卷'));
  assert.ok(prompt.includes('序章·青涩岁月'));
  assert.ok(prompt.includes('茶馆密谈'));
  assert.ok(prompt.includes('L55 Bob: 行动必须在今晚开始'));
});