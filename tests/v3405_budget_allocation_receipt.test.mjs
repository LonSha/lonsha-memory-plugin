import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Allocator = require('../transparent-budget-allocation-receipt.js');

test('L10-O5 · allocateBudgetWithReceipt 优先级隔离与裁切回执', () => {
  const materials = [
    { id: 'c1', content: '绝密身份：卧底侦探', pool: Allocator.BUDGET_POOLS.POOL_CRITICAL, priority: 100, tokenCost: 50 },
    { id: 'x1', content: '双方处于冷战期，对视时回避目光', pool: Allocator.BUDGET_POOLS.POOL_CONTEXTUAL, priority: 80, tokenCost: 40 },
    { id: 'a1', content: '耳根微红，指尖轻微颤动', pool: Allocator.BUDGET_POOLS.POOL_ATMOSPHERE, priority: 50, tokenCost: 20 },
    { id: 'w1', content: '帝国历302年大旱，粮价飙升十倍，各地暴动频发', pool: Allocator.BUDGET_POOLS.POOL_WORLD_LORE, priority: 10, tokenCost: 100 }
  ];

  // 总预算只给 100 tokens
  const receipt = Allocator.allocateBudgetWithReceipt(materials, {
    maxTotalTokens: 100,
    poolCaps: {
      POOL_CRITICAL: 100,
      POOL_CONTEXTUAL: 50,
      POOL_ATMOSPHERE: 30,
      POOL_WORLD_LORE: 50
    }
  });

  // c1(50) + x1(40) = 90 tokens; a1(20) 导致超 100，被丢弃
  assert.equal(receipt.admittedCount >= 2, true);
  const c1 = receipt.admittedItems.find(it => it.id === 'c1');
  assert.ok(c1);
  assert.equal(c1.admittedInPool, Allocator.BUDGET_POOLS.POOL_CRITICAL);

  const droppedWorld = receipt.droppedItems.find(it => it.id === 'w1');
  assert.ok(droppedWorld);
  assert.equal(droppedWorld.dropReason, 'EXCEEDED_TOTAL_BUDGET');

  const summary = Allocator.formatReceiptSummary(receipt);
  assert.ok(summary.includes('记忆预算分配回执'));
  assert.ok(summary.includes('核心['));
});