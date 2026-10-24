import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Axis = require('../unified-narrative-clock-axis.js');

test('L9-O3 · 事件时间有效性状态四态判定', () => {
    const currentClock = 1700000000000;

    // 当下有效
    const activeEv = { id: 'e-1', title: '盟约缔结', validFrom: 1690000000000, validTo: 1710000000000 };
    const r1 = Axis.evaluateTemporalValidity(activeEv, currentClock);
    assert.equal(r1.status, Axis.TEMPORAL_STATUS.CURRENT_VALID);

    // 历史已闭合
    const histEv = { id: 'e-2', title: '旧政权协议', validFrom: 1680000000000, validTo: 1695000000000 };
    const r2 = Axis.evaluateTemporalValidity(histEv, currentClock);
    assert.equal(r2.status, Axis.TEMPORAL_STATUS.HISTORICAL_SUPERSEDED);

    // 未来承诺
    const futureEv = { id: 'e-3', title: '三年后之约', validFrom: 1720000000000 };
    const r3 = Axis.evaluateTemporalValidity(futureEv, currentClock);
    assert.equal(r3.status, Axis.TEMPORAL_STATUS.FUTURE_PLEDGE);

    // 无时间戳（严格不猜测）
    const untimedEv = { id: 'e-4', title: '神秘传言' };
    const r4 = Axis.evaluateTemporalValidity(untimedEv, currentClock);
    assert.equal(r4.status, Axis.TEMPORAL_STATUS.UNKNOWN_TIMING);
});

test('L9-O3 · 叙事时钟轴投影与统计', () => {
    const currentClock = 1700000000000;
    const events = [
        { id: '1', validFrom: 1690000000000, validTo: 1710000000000 },
        { id: '2', validFrom: 1680000000000, validTo: 1695000000000 },
        { id: '3', validFrom: 1720000000000 },
        { id: '4' } // untimed
    ];

    const proj = Axis.projectNarrativeAxis(events, currentClock);
    assert.equal(proj.totalEvents, 4);
    assert.equal(proj.activeCount, 1);
    assert.equal(proj.historicalCount, 1);
    assert.equal(proj.futureCount, 1);
    assert.equal(proj.untimedCount, 1);
});