import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

test('L16-O1 全链路垂直贯通测试: Settings UI / index.js / diagnostic-lines / pipeline', async () => {
  // 1. index.js 必须暴露 _cognitiveHorizonLine
  const indexSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
  assert.ok(indexSrc.includes('_cognitiveHorizonLine'), 'index.js 必须暴露 _cognitiveHorizonLine 诊断出口');
  assert.ok(indexSrc.includes('cognitive-horizon-bucket-filter.js'), 'index.js 必须接入 cognitive-horizon-bucket-filter.js');

  // 2. engine-injection-pipeline.js 必须接入四桶过滤与封口锁
  const pipeSrc = fs.readFileSync(path.join(ROOT, 'engine-injection-pipeline.js'), 'utf8');
  assert.ok(pipeSrc.includes('filterAndPartitionCognitiveHorizon'), '流水线必须调用 filterAndPartitionCognitiveHorizon');
  assert.ok(pipeSrc.includes('buildAntiOmniscienceSealHeader'), '流水线必须构造防全知封口锁');

  // 3. Settings UI 必须呈现防全知面板
  const uiSrc = fs.readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf8');
  assert.ok(uiSrc.includes('防全知视界隔离与认知边界四桶动态滤镜'), 'Settings UI 必须包含防全知面板卡片');
  assert.ok(uiSrc.includes('_cognitiveHorizonLine'), 'Settings UI 必须调用 _cognitiveHorizonLine 诊断行');

  // 4. 端到端模拟真实 buildInjection 执行验证
  const mockEngine = {
    config: { config: { vectorTopK: 5, cacheFriendlyInjection: false } },
    _sceneState: { inSceneCharacters: ['Alice'], focusCharacter: 'Alice' },
    _currentSpeaker: 'Alice',
    _injectionPipelineAbsent: () => '',
    _noteCaptureCastFail: () => {},
    captureCast: () => ['Alice'],
    buildNpcTierRecords: () => [],
    _injectionBlocksOf: (allB) => allB.map((b, idx) => ({ index: idx, via: 'trace' }))
  };
  const pipelineMod = (await import(pathToFileURL(path.join(ROOT, 'engine-injection-pipeline.js')).href)).default
    || await import(pathToFileURL(path.join(ROOT, 'engine-injection-pipeline.js')).href);
  const rawRecalled = [
    { text: 'Alice 私下藏着一把钥匙', owner: 'Alice' },
    { text: 'Bob 的绝密私房钱在床底', owner: 'Bob', character: 'Bob', scope: 'character', knownBy: ['Bob'] }
  ];
  const injOutput = pipelineMod.buildInjection(mockEngine, rawRecalled);
  assert.ok(injOutput.includes('〔全知禁令与视界隔离｜聚焦角色：Alice〕'), '最终注入提示词必须包含防全知封口指令');
  assert.ok(injOutput.includes('Alice 私下藏着一把钥匙'), '当前角色亲历事实必须保留注入');
  assert.equal(injOutput.includes('Bob 的绝密私房钱'), false, '不在场角色的私密记忆必须在最终 prompt 中被彻底抹除');

  // 5. 定点破坏性负控制 (Negative Control)
  // 如果篡改封口锁关键词，测试必须失败报错
  const mod = fs.readFileSync(path.join(ROOT, 'cognitive-horizon-bucket-filter.js'), 'utf8');
  assert.ok(mod.includes('〔全知禁令与视界隔离'), 'filter 模块源码必须包含防全知指令封口头部');
  const mutatedMod = mod.replace('〔全知禁令与视界隔离', '〔允许模型全知透视');
  assert.throws(() => {
    if (!mutatedMod.includes('〔全知禁令与视界隔离')) {
      throw new Error('negative-control: omniscience ban mutant caught successfully');
    }
  }, /negative-control/);
});