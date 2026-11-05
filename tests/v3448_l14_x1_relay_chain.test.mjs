import test from 'node:test';
import assert from 'node:assert/strict';
import Relay from '../knowledge-relay-chain.js';

test('L14-X1: createRelayChain validates root origin inputs', () => {
    assert.equal(Relay.createRelayChain({}).ok, false);
    assert.equal(Relay.createRelayChain({ factId: 'f1' }).reason, 'origin-speaker-required');
    
    const root = Relay.createRelayChain({
        factId: 'fact-101',
        originSpeaker: 'Alice',
        content: '秘密地宫入口在东侧钟楼',
        secret: '开门密码是 7788',
        floor: 10
    });
    assert.equal(root.ok, true);
    assert.equal(root.chain.hops.length, 1);
    assert.equal(root.chain.hops[0].to, 'Alice');
    assert.equal(root.chain.hops[0].hasSecret, true);
});

test('L14-X1: A informs B, then B is known, while C remains unknown', () => {
    const root = Relay.createRelayChain({
        factId: 'fact-101',
        originSpeaker: 'Alice',
        content: '秘密地宫入口在东侧钟楼',
        secret: '开门密码是 7788',
        floor: 10
    }).chain;

    // Alice tells Bob at floor 12 without passing secret
    const hop1 = Relay.appendRelayHop(root, {
        from: 'Alice',
        to: 'Bob',
        floor: 12,
        rumorText: '东侧钟楼有些传闻',
        passSecret: false
    });
    assert.equal(hop1.ok, true);
    const chain1 = hop1.chain;

    // Verify Bob is known at floor 12
    const bobKnown = Relay.isKnownAt(chain1, 'Bob', 12);
    assert.equal(bobKnown.known, true);
    assert.equal(bobKnown.canAccessSecret, false);

    // Verify Carol is completely uninformed
    const carolKnown = Relay.isKnownAt(chain1, 'Carol', 12);
    assert.equal(carolKnown.known, false);
    assert.equal(carolKnown.reason, 'uninformed');
});

test('L14-X1: delayed news cannot travel back in time', () => {
    const root = Relay.createRelayChain({
        factId: 'fact-101',
        originSpeaker: 'Alice',
        floor: 10
    }).chain;

    // Alice informs Bob at floor 15
    const hop = Relay.appendRelayHop(root, {
        from: 'Alice',
        to: 'Bob',
        floor: 15
    }).chain;

    // Bob at floor 12 cannot possess knowledge from floor 15
    const bobEarly = Relay.isKnownAt(hop, 'Bob', 12);
    assert.equal(bobEarly.known, false);
    assert.equal(bobEarly.reason, 'not-yet-known-at-floor');
    assert.equal(bobEarly.floor, 15);

    // Bob at floor 15 or 16 has the knowledge
    assert.equal(Relay.isKnownAt(hop, 'Bob', 15).known, true);
    assert.equal(Relay.isKnownAt(hop, 'Bob', 20).known, true);
});

test('L14-X1: unauthorized relay is rejected fail-closed', () => {
    const root = Relay.createRelayChain({
        factId: 'fact-101',
        originSpeaker: 'Alice',
        floor: 10
    }).chain;

    // Bob (not yet told) tries to inform Carol
    const invalidHop = Relay.appendRelayHop(root, {
        from: 'Bob',
        to: 'Carol',
        floor: 11
    });
    assert.equal(invalidHop.ok, false);
    assert.equal(invalidHop.reason, 'unauthorized-relay');
});

test('L14-X1: cascading relay and retraction preserves historical audit', () => {
    const root = Relay.createRelayChain({
        factId: 'fact-101',
        originSpeaker: 'Alice',
        secret: '核心机密',
        floor: 10
    }).chain;

    // Alice -> Bob (floor 12, with secret)
    const c1 = Relay.appendRelayHop(root, {
        from: 'Alice',
        to: 'Bob',
        floor: 12,
        passSecret: true
    }).chain;

    // Bob -> Carol (floor 14, with secret)
    const c2 = Relay.appendRelayHop(c1, {
        from: 'Bob',
        to: 'Carol',
        floor: 14,
        passSecret: true
    }).chain;

    // Carol -> Dave (floor 16)
    const c3 = Relay.appendRelayHop(c2, {
        from: 'Carol',
        to: 'Dave',
        floor: 16
    }).chain;

    assert.equal(Relay.isKnownAt(c3, 'Dave', 16).known, true);

    // Retract Bob's hop (hop_2)
    const retractRes = Relay.retractHop(c3, 'hop_2');
    assert.equal(retractRes.ok, true);
    const retractedChain = retractRes.chain;

    // Bob, Carol and Dave cascaded into retracted status
    assert.equal(Relay.isKnownAt(retractedChain, 'Bob', 16).known, false);
    assert.equal(Relay.isKnownAt(retractedChain, 'Carol', 16).known, false);
    assert.equal(Relay.isKnownAt(retractedChain, 'Dave', 16).known, false);

    // Historical hops are preserved (not spliced/deleted)
    assert.equal(retractedChain.hops.length, 4);
    assert.equal(retractedChain.hops[1].status, 'retracted');
    assert.equal(retractedChain.hops[2].status, 'retracted');
});
