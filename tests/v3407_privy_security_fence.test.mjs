import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Fence = require('../privy-clearance-security-fence.js');

test('L10-O7 · filterMemoriesForSpeaker 四级权限安全过滤', () => {
  const memories = [
    { id: '1', title: '世界地图', clearanceLevel: Fence.PRIVY_CLEARANCE_LEVELS.LEVEL_PUBLIC },
    { id: '2', title: '商会暗号', clearanceLevel: Fence.PRIVY_CLEARANCE_LEVELS.LEVEL_SHARED_CIRCLE, circleId: 'merchant_guild' },
    { id: '3', title: '双面间谍真相', clearanceLevel: Fence.PRIVY_CLEARANCE_LEVELS.LEVEL_CONFIDENTIAL, owner: 'Alice', knownBy: ['Bob'] },
    { id: '4', title: '心中创伤自白', clearanceLevel: Fence.PRIVY_CLEARANCE_LEVELS.LEVEL_SOLITARY_SECRET, owner: 'Alice' }
  ];

  // 1. 公共角色 Charlie (非商会、非知情人)
  const charlieView = Fence.filterMemoriesForSpeaker(memories, 'Charlie', []);
  assert.equal(charlieView.length, 1);
  assert.equal(charlieView[0].id, '1');

  // 2. Bob (商会成员，且是间谍真相的知情人)
  const bobView = Fence.filterMemoriesForSpeaker(memories, 'Bob', ['merchant_guild']);
  assert.equal(bobView.length, 3);
  assert.equal(bobView.some(m => m.id === '4'), false); // 绝不能知晓 Alice 的独占隐秘

  // 3. Alice (主角自己)
  const aliceView = Fence.filterMemoriesForSpeaker(memories, 'Alice', ['merchant_guild']);
  assert.equal(aliceView.length, 4);
});

test('L10-O7 · detectPotentialBreach 越权泄露防线检测', () => {
  const secrets = [
    { id: 's1', title: '密道地图', owner: 'Alice', knownBy: ['Bob'], sensitiveKeywords: ['古井下的密道', '水晶钥匙'] }
  ];

  // Charlie 不在 knownBy 之中，生成文本却吐露了机密词
  const badGen = '我猜你一定会把财宝藏在古井下的密道里吧！';
  const breach1 = Fence.detectPotentialBreach(badGen, 'Charlie', secrets);
  assert.equal(breach1.breached, true);
  assert.equal(breach1.details[0].leakedKeyword, '古井下的密道');

  // Bob 是知情人，提及不视为越权泄露
  const okGen = '放心，古井下的密道很安全。';
  const breach2 = Fence.detectPotentialBreach(okGen, 'Bob', secrets);
  assert.equal(breach2.breached, false);
});