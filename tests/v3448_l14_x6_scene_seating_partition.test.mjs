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