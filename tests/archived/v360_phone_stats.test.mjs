/* [v3.204.0 退役] 本文件断言的是 ruby-phone 的旧 lonsha-bridge 一代：
 *   queryPhoneMemory / backfillDiaries / syncClock / lockFact / syncSummaryEdit /
 *   lockedFactsIngested / protagonistIngested / _sleepTick … 这些方法在 ruby-phone
 *   2.6.0 -> 2.92.0 的重构中已整体移除（活体桥只剩 backfill / recall / recallBlock /
 *   applyCoordinatedInjection / onFloor* / getStats），且原引用的
 *   /home/user/ruby-phone-work 快照树无 git、停在 2.6.0-modular。
 *   实测：换成活体树 /home/user/ruby-phone 后，本批 17 个文件 17/17 全红。
 *   即它锁的是一份**已死掉的集成**，任何干净 clone 都必红。
 *   本仓侧的等价覆盖由 v356（outline）/ v353（_recallSourceStats）/ v325（keepRecentTokenReserve）
 *   / v386（_bm25）持有；桥契约的活体判据在 ruby-phone 侧 tests/lonsha-bridge-contract.test.mjs。
 *   退役依据与负控制见 CHANGELOG v3.204.0 与 tests/v3204_no_cross_repo_binding.test.mjs。
 */
// tests/v360_phone_stats.test.mjs
// LonSha 记忆引擎 v3.60.0 手机端专项测试套件
// 涵盖：A 桥接统计卡片（memory-view 消费 bridge.getStats）、C 巩固次数可见、手机端体检复查

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');
const mvSrc = readFileSync(new URL('../../ruby-phone-work/apps/memory/memory-view.js', import.meta.url), 'utf-8');

test('=== 1. 桥接统计卡片验证 ===', () => {
    assert.ok(mvSrc.includes('const bridgeStats = (window.VirtualPhone?.lonshaBridge?.getStats?.()) || {};'), 'bridgeStats 获取（可选链守卫）');
    assert.ok(mvSrc.includes("(bridgeStats.backfillCount || 0)"), '回填次数卡片');
    assert.ok(mvSrc.includes("(bridgeStats.bm25Docs || 0)"), '检索索引卡片');
    assert.ok(mvSrc.includes('LonSha 桥接（回填 '), '桥接状态行');
    assert.ok(mvSrc.includes("(bridgeStats.enabled ? '🟢 启用' : '⚪ 停用')"), '启用状态');
    assert.ok(mvSrc.includes("(bridgeStats.coordinated ? ' · 协调注入' : '')"), '协调注入状态');
    console.log('✓ 桥接统计卡片验证通过');
});

test('=== 2. 巩固次数可见验证 ===', () => {
    assert.ok(mvSrc.includes('window.VirtualPhone?.memoryCore?._sleepTick || 0'), '巩固次数读取');
    assert.ok(mvSrc.includes('巩固 '), '巩固标签');
    // 巩固管线在位（v3.48 激活）
    const phoneIdx = readFileSync(new URL('../../ruby-phone-work/index.js', import.meta.url), 'utf-8');
    assert.ok(phoneIdx.includes("_mc._sleepTick = (_mc._sleepTick || 0) + 1;"), '巩固计数器在位');
    console.log('✓ 巩固次数可见验证通过');
});

test('=== 3. 桥接数据源验证 ===', () => {
    // bridge.getStats 返回结构（backfillCount/injectCount/bm25Docs/enabled/coordinated）
    const bridgeSrc = readFileSync(new URL('../../ruby-phone-work/apps/memory/lonsha-bridge.js', import.meta.url), 'utf-8');
    assert.ok(bridgeSrc.includes('backfillCount'), 'backfillCount 字段');
    assert.ok(bridgeSrc.includes('injectCount'), 'injectCount 字段');
    assert.ok(bridgeSrc.includes('bm25Docs: this._bm25.N'), 'bm25Docs 字段');
    assert.ok(bridgeSrc.includes('coordinated: this.coordinated'), 'coordinated 字段');
    console.log('✓ 桥接数据源验证通过');
});