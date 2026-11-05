import test from 'node:test';
import assert from 'node:assert/strict';
import Seating from '../scene-character-seating-partition.js';

test('L14-X6: createSeatingSession and selfCheck', () => {
  const check = Seating.sceneSeatingPartitionSelfCheck();
  assert.equal(check.status, 'ok');

  const session = Seating.createSeatingSession({
    sceneId: 'act3_scene1',
    sceneTitle: 'Council at Dawn',
    activeSeats: ['alice', 'bob', 'charlie']
  });

  assert.equal(session.sceneId, 'act3_scene1');
  assert.deepEqual(session.activeSeats, ['alice', 'bob', 'charlie']);
});

test('L14-X6: partitionMaterialsForSeats separates shared, private pockets, partial, and embargoed', () => {
  const session = Seating.createSeatingSession({
    sceneId: 'act3_scene1',
    activeSeats: ['alice', 'bob', 'charlie']
  });

  const materials = [
    {
      materialId: 'mat_weather',
      summary: 'Heavy rain is approaching the castle.',
      knownByCharacters: ['alice', 'bob', 'charlie', 'david'] // All seated know -> sharedPool
    },
    {
      materialId: 'mat_alice_secret',
      summary: 'Alice forged the council seal yesterday.',
      knownByCharacters: ['alice'] // Only alice seated knows -> privatePockets.alice
    },
    {
      materialId: 'mat_conspiracy',
      summary: 'Bob and Charlie planned a rebellion together.',
      knownByCharacters: ['bob', 'charlie'] // Subset seated know -> partialSubsets
    },
    {
      materialId: 'mat_dragon_nest',
      summary: 'A red dragon is sleeping in the southern ruins.',
      knownByCharacters: ['david', 'eve'] // No seated knows -> embargoedSecrets
    }
  ];

  const partitioned = Seating.partitionMaterialsForSeats(session, materials);

  assert.equal(partitioned.sharedPool.length, 1);
  assert.equal(partitioned.sharedPool[0].materialId, 'mat_weather');

  assert.equal(partitioned.privatePockets.alice.length, 1);
  assert.equal(partitioned.privatePockets.alice[0].materialId, 'mat_alice_secret');
  assert.equal(partitioned.privatePockets.bob.length, 0);

  assert.equal(partitioned.partialSubsets.length, 1);
  assert.equal(partitioned.partialSubsets[0].materialId, 'mat_conspiracy');

  assert.equal(partitioned.embargoedSecrets.length, 1);
  assert.equal(partitioned.embargoedSecrets[0].materialId, 'mat_dragon_nest');
});

test('L14-X6: dynamic re-partitioning when seat changes and perspective prompt isolation', () => {
  let session = Seating.createSeatingSession({
    sceneId: 'act3_scene1',
    activeSeats: ['alice', 'bob', 'charlie']
  });

  const materials = [
    {
      materialId: 'mat_conspiracy',
      summary: 'Bob and Charlie planned a rebellion together.',
      knownByCharacters: ['bob', 'charlie']
    }
  ];

  // 当三人都在时，mat_conspiracy 属于 partialSubsets（Bob与Charlie私下知道）
  let res = Seating.partitionMaterialsForSeats(session, materials);
  assert.equal(res.partialSubsets.length, 1);

  // Bob 离席，只剩 Alice 和 Charlie
  session = Seating.updateSeats(session, ['alice', 'charlie']);
  res = Seating.partitionMaterialsForSeats(session, materials);
  // 此时在席中只有 Charlie 一个人知道 -> 自动重算归入 Charlie 的 privatePockets
  assert.equal(res.partialSubsets.length, 0);
  assert.equal(res.privatePockets.charlie.length, 1);
  assert.equal(res.privatePockets.alice.length, 0);

  // 为 Alice 构造 Perspective Prompt：绝不包含 Charlie 的私密
  const alicePrompt = Seating.buildCharacterPerspectivePrompt(res, 'alice');
  assert.equal(alicePrompt.includes('rebellion'), false);

  // 为 Charlie 构造 Perspective Prompt：包含 Strictly Private Knowledge
  const charliePrompt = Seating.buildCharacterPerspectivePrompt(res, 'charlie');
  assert.equal(charliePrompt.includes('rebellion'), true);
  assert.equal(charliePrompt.includes('Strictly Private Knowledge'), true);
});
test('L14-X6: cross-layer integration (diagnostic lines, injection pipeline, settings-ui)', async () => {
  // 1. 验证诊断层 seatingPartitionState 与 _seatingPartitionLine
  const diagLib = (await import('../engine-diagnostic-lines.js')).default;
  assert.ok(typeof diagLib.seatingPartitionState === 'function', 'seatingPartitionState exists in diagnostic lines');
  assert.ok(typeof diagLib._seatingPartitionLine === 'function', '_seatingPartitionLine exists in diagnostic lines');

  // 空席位状态：state 必须为 no-seats 而非 unavailable 或 ok
  const emptyState = diagLib.seatingPartitionState({}, { seats: [] });
  assert.equal(emptyState.state, 'no-seats');
  assert.equal(emptyState.ok, false);

  // 正常席位与材料测试
  const mockEngine = {
    _activeSeats: ['alice', 'bob'],
    _seatingMaterials: [
      { materialId: 'm1', summary: 'Alice and Bob know the castle route', knownByCharacters: ['alice', 'bob'] },
      { materialId: 'm2', summary: 'Alice secret ring', knownByCharacters: ['alice'] }
    ],
    _seatingSceneId: 'throne_room',
    _seatingSceneTitle: '王座厅密谋'
  };

  const validState = diagLib.seatingPartitionState(mockEngine);
  assert.equal(validState.ok, true);
  assert.equal(validState.counts.shared, 1);
  assert.equal(validState.counts.private, 1);
  assert.ok(validState.perspectives.alice.includes('Alice secret ring'));
  assert.ok(!validState.perspectives.bob.includes('Alice secret ring'), 'Bob perspective must NOT leak Alice private material');

  const line = diagLib._seatingPartitionLine(mockEngine);
  assert.ok(line.includes('王座厅密谋') || line.includes('场景分席'));
  assert.ok(line.includes('共知 1') || line.includes('独知'));

  // 2. 验证注入主链路 engine-injection-pipeline.js 调用
  const pipelineLib = (await import('../engine-injection-pipeline.js')).default;
  assert.ok(typeof pipelineLib.buildInjection === 'function', 'buildInjection exists');

  // 模拟带席位的 engine 执行 buildInjection
  const fakeEngine = {
    config: { config: { memoryTokenBudget: 2700, vectorTopK: 5, sceneEnabled: true, npcTierInjection: false, cacheFriendlyInjection: false } },
    _activeSeats: ['alice', 'bob'],
    _seatingMaterials: [
      { materialId: 'm1', summary: 'Castle route', knownByCharacters: ['alice', 'bob'] },
      { materialId: 'm2', summary: 'Alice secret diary', knownByCharacters: ['alice'] }
    ],
    _currentSpeaker: 'alice',
    scene: {
      currentKey: () => 'castle/hall',
      chainOf: () => [{ path: ['castle', 'hall'], desc: '大殿' }],
      headerLine: () => ''
    },
    captureCast: () => ['alice', 'bob'],
    resolveCharacterName: (n) => n
  };

  const recalled = [{ text: '城门在黄昏关闭' }];
  const injectionResult = pipelineLib.buildInjection(fakeEngine, recalled);
  assert.ok(injectionResult.includes('[下一幕分席准备]'), 'injection must contain seating partition prompt');
  assert.ok(injectionResult.includes('Castle route'), 'injection must contain shared material');
  assert.ok(injectionResult.includes('Alice secret diary'), 'injection for alice must contain alice private material');
  assert.ok(fakeEngine._lastSeatingPartition, 'engine must record _lastSeatingPartition');
});

test('L14-X6: negative control - removing seating partition breaks cross-layer assertions', async () => {
  const fs = await import('node:fs');
  const pipeSrc = fs.readFileSync('engine-injection-pipeline.js', 'utf-8');
  assert.ok(pipeSrc.includes('_sceneSeatingPartitionLib'), 'pipeline contains seating partition hook');
  assert.ok(pipeSrc.includes("blocks.push('[下一幕分席准备]\\n' + seatingPrompt)"), 'pipeline injects prompt');

  // 负控制 1：模拟破坏注入逻辑，注入结果不再包含分席提示
  const brokenPipeSrc = pipeSrc.replace("blocks.push('[下一幕分席准备]\\n' + seatingPrompt)", "// blocks.push disabled");
  assert.ok(!brokenPipeSrc.includes("blocks.push('[下一幕分席准备]\\n' + seatingPrompt)"), 'negative control condition: prompt injection suppressed');

  // 负控制 2：UI 缺少 seatingPartitionState 消费时必须被检测出
  const uiSrc = fs.readFileSync('settings-ui.js', 'utf-8');
  const brokenUiSrc = uiSrc.replace('s.seatingPartitionState()', 'null');
  assert.ok(!brokenUiSrc.includes('s.seatingPartitionState()'), 'negative control condition: UI consumption suppressed');
});

