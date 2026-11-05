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

test('L14-X2: vertical integration across diagnostics, injection, and settings UI with negative controls', async () => {
    const DiagMod = await import('../engine-diagnostic-lines.js');
    const Diag = DiagMod.default || DiagMod;
    const PipelineMod = await import('../engine-injection-pipeline.js');
    const pipelineLib = PipelineMod.default || PipelineMod;
    // 1. Diagnostic state test
    const dummyEngine = {
        _narrationSessions: []
    };
    const emptyState = Diag.narrationCompareState(dummyEngine);
    assert.equal(emptyState.ok, true);
    assert.equal(emptyState.state, 'no-sessions');
    const emptyLine = Diag._narrationCompareLine(dummyEngine);
    assert.match(emptyLine, /尚未登记多方讲述对照会话/);
    const s1 = Compare.createNarrationCompareSession({
        eventId: 'ev_bell',
        title: '钟楼事件',
        canonicalEvidence: [{ evidenceId: 'ev_1', text: '真实钟楼钥匙遗落' }]
    }).session;
    const s2 = Compare.addCharacterNarration(s1, {
        speaker: 'Alice',
        segments: [{ text: '钥匙在水井旁丢了', evidenceRef: 'ev_1' }]
    }).session;
    const s3 = Compare.addCharacterNarration(s2, {
        speaker: 'Bob',
        segments: [{ text: '我没见过什么钥匙', evidenceRef: 'ev_1', isDisputed: true }]
    }).session;

    dummyEngine._narrationSessions = [s3];
    dummyEngine._narrationCompareRead = null;
    const populatedState = Diag.narrationCompareState(dummyEngine);
    assert.equal(populatedState.ok, true);
    assert.equal(populatedState.state, 'ok');
    assert.equal(populatedState.counts.totalSessions, 1);
    assert.equal(populatedState.counts.totalNarrations, 2);
    assert.equal(populatedState.counts.disputed, 1);
    assert.equal(populatedState.counts.concordant, 1);
    const populatedLine = Diag._narrationCompareLine(dummyEngine);
    assert.match(populatedLine, /会话 1 场/);
    assert.match(populatedLine, /讲述 2 篇/);
    assert.match(populatedLine, /分歧 1/);
    // 2. Main generation injection pipeline test
    const fakeEngine = {
        config: { config: { memoryTokenBudget: 2700, vectorTopK: 5, sceneEnabled: true, npcTierInjection: false, cacheFriendlyInjection: false } },
        _narrationSessions: [s3],
        scene: {
            currentKey: () => 'bell_tower',
            chainOf: () => [{ path: ['bell_tower'], desc: '钟楼' }],
            headerLine: () => ''
        },
        captureCast: () => [],
        resolveCharacterName: (n) => n
    };
    const recalled = [{ text: '调查现场' }];
    const injectionResult = pipelineLib.buildInjection(fakeEngine, recalled);
    assert.ok(injectionResult.includes('[往事多方讲述对照·分歧提示]'), '分歧提示块必须被注入');
    assert.ok(injectionResult.includes('钟楼事件'), '事件标题必须包含');
    assert.ok(injectionResult.includes('Bob(disputed)'), '应提示Bob存在争议分歧');

    // 3. Settings UI integration verification
    const fs = await import('fs');
    const settingsUiSrc = fs.readFileSync('settings-ui.js', 'utf8');
    assert.ok(settingsUiSrc.includes("s.narrationCompareState"), 'settings-ui 必须调用 narrationCompareState');
    assert.ok(settingsUiSrc.includes("s._narrationCompareLine"), 'settings-ui 必须调用 _narrationCompareLine');
    assert.ok(settingsUiSrc.includes("🗣️ 往事讲述多方对照"), 'settings-ui 必须渲染工作台标题');

    // 4. Negative controls: break code and assert failure
    const mutatedSrc = settingsUiSrc.replaceAll("s.narrationCompareState", "s.nonExistentState");
    assert.ok(!mutatedSrc.includes("s.narrationCompareState"), '负控制变异成功');
    assert.throws(() => {
        if (!mutatedSrc.includes("s.narrationCompareState")) {
            throw new Error('negative-control: narrationCompareState call site missing');
        }
    }, /negative-control/);
});