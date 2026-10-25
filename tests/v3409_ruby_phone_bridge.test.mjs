import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Bridge = require('../ruby-phone-bidirectional-bridge.js');

test('L10-O9 · ingestPhoneInteraction 手机端事件感知与认知提案转换', () => {
  const phoneEvent = {
    eventType: Bridge.PHONE_EVENT_TYPES.CHAT_MESSAGE,
    sender: 'Alice',
    recipient: 'User',
    content: '明天上午十点我在老地方咖啡馆等你，不见不散。',
    timestamp: 1700000000000
  };

  const proposal = Bridge.ingestPhoneInteraction(phoneEvent, 18);
  assert.equal(proposal.bridgeSource, 'RUBY_PHONE_BRIDGE');
  assert.equal(proposal.floor, 18);
  assert.equal(proposal.subject, 'Alice');
  assert.equal(proposal.predicate, '手机私信');
  assert.ok(proposal.statement.includes('老地方咖啡馆'));
  assert.equal(proposal.confidence, 0.95);
});

test('L10-O9 · projectMemoriesToPhoneState 记忆反哺手机端状态与提醒', () => {
  const activeFacts = [
    { subject: 'Alice', predicate: '代号', object: '夜莺' },
    { subject: 'Alice', predicate: '真实身份', object: '安全局特遣员' },
    { subject: 'Alice', title: '明日咖啡馆赴约', isPromised: true, validFrom: 1700010000000 }
  ];

  const phoneState = Bridge.projectMemoriesToPhoneState(activeFacts, { name: 'Alice', contactId: 'c-101' });
  assert.equal(phoneState.characterName, 'Alice');
  assert.equal(phoneState.contactId, 'c-101');
  assert.ok(phoneState.projectedRemark.includes('夜莺'));
  assert.ok(phoneState.projectedRemark.includes('安全局特遣员'));

  assert.equal(phoneState.pendingReminders.length, 1);
  assert.equal(phoneState.pendingReminders[0].title, '明日咖啡馆赴约');
  assert.equal(phoneState.pendingReminders[0].status, 'PENDING');
});

test('L10-O9 · verifyBridgeHealth 通信链路健康度检验', () => {
  const now = Date.now();
  const healthyStatus = {
    lastPhonePing: now - 5000,
    lastMemorySync: now - 8000
  };
  const check1 = Bridge.verifyBridgeHealth(healthyStatus);
  assert.equal(check1.healthy, true);
  assert.equal(check1.status, 'BRIDGE_ONLINE');

  const degradedStatus = {
    lastPhonePing: now - 120000, // 超过 1 分钟
    lastMemorySync: now - 5000
  };
  const check2 = Bridge.verifyBridgeHealth(degradedStatus);
  assert.equal(check2.healthy, false);
  assert.equal(check2.status, 'BRIDGE_DEGRADED');
});