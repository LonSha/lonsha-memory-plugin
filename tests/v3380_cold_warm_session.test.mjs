import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Session = require('../maintenance-cold-warm-session.js');

test('L9-O7 · 记忆冷暖分级维护与保护项豁免', () => {
    const now = Date.now();
    const facts = [
        { id: '1', state: 'confirmed', lastAccessedAt: now - 100000 }, // confirmed 豁免
        { id: '2', pinned: true, lastAccessedAt: 1000 },             // pinned 豁免
        { id: '3', lastAccessedAt: now - (40 * 24 * 3600 * 1000) }    // 40天前访问，归入冷存储
    ];

    const plan = Session.planMaintenanceBatch(facts);
    assert.equal(plan.warmCount, 2);
    assert.equal(plan.coldCount, 1);
    assert.equal(plan.toArchiveCold[0].id, '3');
});