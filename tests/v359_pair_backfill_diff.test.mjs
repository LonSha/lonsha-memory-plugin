// tests/v359_pair_backfill_diff.test.mjs
// LonSha 记忆引擎 v3.59.0 测试套件
// 涵盖：A 群像记忆手机端回填（bridge pairs 通道 + LonSha payload）、B OpLog 楼层过滤、D 注入预览 diff

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');
const suSrc = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf-8');
const bridgeSrc = readFileSync(new URL('../../ruby-phone-work/apps/memory/lonsha-bridge.js', import.meta.url), 'utf-8');

test('=== 1. A 群像记忆手机端回填验证 ===', () => {
    assert.ok(bridgeSrc.includes('extracted.pairs || []'), 'bridge pairs 通道');
    assert.ok(bridgeSrc.includes('[群像] ${p.a} × ${p.b}: ${e.event}'), '群像事件渲染（归因格式）');
    assert.ok(bridgeSrc.includes('⚠️仅单方知晓'), '单方知晓标注透传');
    assert.ok(bridgeSrc.includes("tags: [p.a, p.b]"), '双角色 tags');
    assert.ok(src.includes('pairs: this.pairMem?.export?.()?.pairs || []'), 'LonSha payload 携带 pairs');
    console.log('✓ A 群像记忆手机端回填验证通过');
});

test('=== 2. B OpLog 楼层过滤验证 ===', () => {
    assert.ok(suSrc.includes('lonsha-oplog-floor-filter'), '过滤输入框');
    assert.ok(suSrc.includes('按楼层过滤（空=全部）'), '占位提示');
    assert.ok(suSrc.includes('lonsha-oplog-rows'), '行容器 id');
    assert.ok(suSrc.includes("floorFilter.addEventListener('input'"), '实时过滤事件');
    assert.ok(suSrc.includes('第(\\d+)楼'), '楼层提取正则');
    console.log('✓ B OpLog 楼层过滤验证通过');
});

test('=== 3. D 注入预览 diff 验证 ===', () => {
    assert.ok(src.includes('prev: this._lastInjection?.html || null'), 'prev 快照双路径（首处）');
    assert.equal(src.split('prev: this._lastInjection?.html || null').length - 1, 2, 'prev 快照双路径（两处）');
    assert.ok(suSrc.includes('const prevLines = inj.prev ? new Set(inj.prev.split'), 'prev 行集合');
    assert.ok(suSrc.includes('🆕 本轮新增'), '新增计数提示');
    assert.ok(suSrc.includes('NEW</span>'), 'NEW  标注');
    assert.ok(suSrc.includes('border-left:2px solid #a6e3a1'), '新增行绿色边框');
    console.log('✓ D 注入预览 diff 验证通过');
});