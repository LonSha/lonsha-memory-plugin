import test from 'node:test';
import assert from 'node:assert/strict';
import Compare from '../past-event-narration-compare.js';

test('L14-X2: createNarrationCompareSession initializes baseline evidence', () => {
    assert.equal(Compare.createNarrationCompareSession({}).ok, false);
    assert.equal(Compare.createNarrationCompareSession({}).reason, 'event-id-required');

    const res = Compare.createNarrationCompareSession({
        eventId: 'event-rainy-night',
        title: '钟楼事件',
        canonicalEvidence: [
            { evidenceId: 'ev_1', text: '当晚20:00 Alice与Bob到达钟楼', floor: 10 },
            { evidenceId: 'ev_2', text: '20:15 钥匙在争执中落入水井', floor: 10 }
        ]
    });

    assert.equal(res.ok, true);
    assert.equal(res.session.canonicalEvidence.length, 2);
    assert.equal(res.session.narrations.length, 0);
});

test('L14-X2: multiple character narrations compared side-by-side with distinct statuses', () => {
    const session = Compare.createNarrationCompareSession({
        eventId: 'event-rainy-night',
        title: '钟楼事件',
        canonicalEvidence: [
            { evidenceId: 'ev_1', text: '当晚20:00 Alice与Bob到达钟楼', floor: 10 },
            { evidenceId: 'ev_2', text: '20:15 钥匙在争执中落入水井', floor: 10 }
        ]
    }).session;

    // Alice tells concordant facts
    const s1 = Compare.addCharacterNarration(session, {
        speaker: 'Alice',
        stance: 'objective',
        segments: [
            { text: '八点我和Bob一起去的钟楼', evidenceRef: 'ev_1' },
            { text: '后来钥匙掉水井里了', evidenceRef: 'ev_2' }
        ]
    }).session;

    // Bob tells evasive/disputed version
    const s2 = Compare.addCharacterNarration(s1, {
        speaker: 'Bob',
        stance: 'defensive',
        segments: [
            { text: '当时雨很大，可能八点过才到', evidenceRef: 'ev_1', isDisputed: true },
            { text: '我没注意到什么钥匙的事情', evidenceRef: 'ev_2', isEvasive: true }
        ]
    }).session;

    // Carol tells hearsay without evidence
    const s3 = Compare.addCharacterNarration(s2, {
        speaker: 'Carol',
        stance: 'rumor',
        segments: [
            { text: '听说他们当晚去盗取了宝物', evidenceRef: null }
        ]
    }).session;

    assert.equal(s3.narrations.length, 3);
    assert.equal(s3.segmentsDiff.length, 2);

    const row1 = s3.segmentsDiff[0];
    assert.equal(row1.hasDispute, true);
    assert.equal(row1.bySpeaker.Alice.status, 'concordant');
    assert.equal(row1.bySpeaker.Bob.status, 'disputed');
    assert.equal(row1.bySpeaker.Carol.status, 'unsubstantiated');

    const row2 = s3.segmentsDiff[1];
    assert.equal(row2.bySpeaker.Bob.status, 'evasive');
    assert.equal(row2.bySpeaker.Carol, null);
});

test('L14-X2: narrations editing never mutates canonical evidence', () => {
    const initSession = Compare.createNarrationCompareSession({
        eventId: 'ev_test',
        canonicalEvidence: [
            { evidenceId: 'ev_1', text: '真实物理证据：A并没有开枪', floor: 5 }
        ]
    }).session;

    // Speaker claims the opposite
    const updated = Compare.addCharacterNarration(initSession, {
        speaker: 'Dave',
        segments: [
            { text: '我认为A开枪了，所有人都看见了', evidenceRef: 'ev_1', isDisputed: true }
        ]
    }).session;

    // Canonical evidence remains strictly intact
    assert.equal(updated.canonicalEvidence[0].text, '真实物理证据：A并没有开枪');
    assert.equal(updated.narrations[0].segments[0].status, 'disputed');

    // Trace canonical evidence back
    const traced = Compare.traceCanonicalEvidence(updated, 'ev_1');
    assert.equal(traced.evidenceId, 'ev_1');
    assert.equal(traced.floor, 5);
});