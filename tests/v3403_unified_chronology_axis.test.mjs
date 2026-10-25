import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Chronology = require('../unified-chronology-axis-engine.js');

test('L10-O3 · evaluateTemporalState 统一双时间五态判定', () => {
  const current = 1000;

  // 1. 当下生效
  const activeItem = { id: '1', title: '驻军条约', validFrom: 500, validTo: 1500 };
  const r1 = Chronology.evaluateTemporalState(activeItem, current);
  assert.equal(r1.state, Chronology.TEMPORAL_STATES.CURRENT_ACTIVE);

  // 2. 历史闭合
  const histItem = { id: '2', title: '旧盟约', validFrom: 100, validTo: 800 };
  const r2 = Chronology.evaluateTemporalState(histItem, current);
  assert.equal(r2.state, Chronology.TEMPORAL_STATES.HISTORICALLY_CLOSED);

  // 3. 未来承诺
  const futureItem = { id: '3', title: '五年后决斗', validFrom: 2000 };
  const r3 = Chronology.evaluateTemporalState(futureItem, current);
  assert.equal(r3.state, Chronology.TEMPORAL_STATES.FUTURE_PROMISE);

  // 4. 逾期违约
  const breachItem = { id: '4', title: '明日还钱', validTo: 900, isPromised: true, fulfilled: false };
  const r4 = Chronology.evaluateTemporalState(breachItem, current);
  assert.equal(r4.state, Chronology.TEMPORAL_STATES.EXPIRED_BREACH);

  // 5. 无时间戳拒绝猜测
  const unknownItem = { id: '5', title: '山野传言' };
  const r5 = Chronology.evaluateTemporalState(unknownItem, current);
  assert.equal(r5.state, Chronology.TEMPORAL_STATES.UNDETERMINED);
});

test('L10-O3 · 古代时辰兼容与时间快照提示词生成', () => {
  const items = [
    { id: '1', title: '午时开战', validFrom: '午', validTo: '未' },
    { id: '2', title: '子时夜探', validFrom: '子', validTo: '丑' }
  ];

  // 当前为午时
  const snapshot = Chronology.projectChronologySnapshot(items, '午');
  assert.equal(snapshot.active.length, 1);
  assert.equal(snapshot.historical.length, 1);
  assert.equal(snapshot.active[0].title, '午时开战');
  assert.equal(snapshot.historical[0].title, '子时夜探');

  const prompt = Chronology.formatChronologyPrompt(snapshot);
  assert.ok(prompt.includes('当下确凿生效'));
  assert.ok(prompt.includes('午时开战'));
  assert.ok(prompt.includes('已闭合历史陈迹'));
});