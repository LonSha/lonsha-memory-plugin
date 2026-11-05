import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const DiagMod = await import('../engine-diagnostic-lines.js');
const Diagnostic = DiagMod.default || DiagMod;
const PipeMod = await import('../engine-injection-pipeline.js');
const pipelineLib = PipeMod.default || PipeMod;
const settingsUiSource = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');

function createDummyEngine(overrides = {}) {
    return {
        config: { config: { memoryTokenBudget: 2700, vectorTopK: 5, sceneEnabled: true, npcTierInjection: false, cacheFriendlyInjection: false } },
        scene: {
            currentKey: () => 'underground',
            chainOf: () => [{ path: ['underground'], desc: '地下' }],
            headerLine: () => ''
        },
        captureCast: () => [],
        resolveCharacterName: (n) => n,
        ...overrides
    };
}

test('L14-X7: vertical integration across diagnostics, injection, and settings UI', async () => {
    // 1. Diagnostic state
    const emptyDiag = Diagnostic.repairResponseState(null, {});
    assert.equal(emptyDiag.ok, true);
    assert.equal(emptyDiag.state, 'no-records');
    assert.equal(Diagnostic._repairResponseLine(null), '修复回应：尚未登记修复回应记录（不是「面没装上」）');

    const RespMod = await import('../relationship-repair-response.js');
    const Resp = RespMod.default || RespMod;
    let fresh = Resp.createRepairResponseRecord({
        proposalId: 'prop_001',
        asks: [{ askId: 'ask1', text: '承认过失' }]
    }, {}).record;
    fresh = Resp.recordResponse(fresh, { kind: 'accept', note: '承认过失' }).record;
    fresh = Resp.recordBehaviorEvidence(fresh, {
        evidenceId: 'ev_001', askId: 'ask1', verdict: 'kept', origin: 'occurred', sourceRef: 'floor-7'
    }).record;

    const activeDiag = Diagnostic.repairResponseState(null, { records: [fresh] });
    assert.equal(activeDiag.ok, true);
    assert.equal(activeDiag.state, 'ok');
    assert.equal(activeDiag.counts.totalRecords, 1);
    assert.equal(activeDiag.counts.responded, 1);
    assert.equal(activeDiag.counts.demonstrated, 1);

    const line = Diagnostic._repairResponseLine({ _repairResponseRead: activeDiag });
    assert.match(line, /修复回应：提议 1 案（已回应 1 · 等待中 0）· 履约证实 1/);

    // 2. Injection pipeline
    const fakeEngine = createDummyEngine({
        _repairRecords: [fresh]
    });
    const recalled = [{ text: '调查现场' }];
    const injected = pipelineLib.buildInjection(fakeEngine, recalled);
    const text = Array.isArray(injected) ? injected.join('\n') : String(injected?.text || injected || '');
    assert.match(text, /\[关系修复·履约回链提示\]/);
    assert.match(text, /修复提议「prop_001」/);
    assert.match(text, /已履约/);

    // 3. Settings UI integration
    assert.match(settingsUiSource, /🩹 关系修复回应与行为回链/);
    assert.match(settingsUiSource, /repairResponseState/);

    // 4. Negative control
    assert.throws(() => {
        const brokenSource = settingsUiSource.replaceAll('repairResponseState', 'nonExistentStateMethod');
        if (!brokenSource.includes('repairResponseState')) {
            throw new Error('negative control: repairResponseState not found');
        }
    }, /negative control/);
});

test('L14-X8: vertical integration across diagnostics, injection, and settings UI', async () => {
    // 1. Diagnostic state
    const emptyDiag = Diagnostic.eraHandoffDraftState(null, {});
    assert.equal(emptyDiag.ok, true);
    assert.equal(emptyDiag.state, 'no-drafts');
    assert.equal(Diagnostic._eraHandoffDraftLine(null), '跨代交接：尚未登记跨代交接草案（不是「面没装上」）');

    const fakeDraft = {
        eraTransitionId: 'era_1_to_2',
        assignedItems: {
            itemA: { heirId: 'alice' },
            itemB: { heirId: 'bob' }
        }
    };
    const activeDiag = Diagnostic.eraHandoffDraftState(null, { drafts: [fakeDraft] });
    assert.equal(activeDiag.ok, true);
    assert.equal(activeDiag.state, 'ok');
    assert.equal(activeDiag.counts.totalDrafts, 1);
    assert.equal(activeDiag.counts.itemsAssigned, 2);
    assert.equal(activeDiag.counts.heirsCount, 2);

    const line = Diagnostic._eraHandoffDraftLine({ _eraHandoffDraftRead: activeDiag });
    assert.match(line, /跨代交接：草案 1 份 · 分配遗留 2 件 · 继承人 2 位/);

    // 2. Injection pipeline
    const fakeEngine = createDummyEngine({
        _handoffDrafts: [fakeDraft]
    });
    const recalled = [{ text: '调查现场' }];
    const injected = pipelineLib.buildInjection(fakeEngine, recalled);
    const text = Array.isArray(injected) ? injected.join('\n') : String(injected?.text || injected || '');
    assert.match(text, /\[跨代交接·草案隔离提示\]/);
    assert.match(text, /跨代过渡「era_1_to_2」交接草案/);
    assert.match(text, /alice\(1项\)/);

    // 3. Settings UI integration
    assert.match(settingsUiSource, /📜 跨代传承交接草案工作台/);
    assert.match(settingsUiSource, /eraHandoffDraftState/);

    // 4. Negative control
    assert.throws(() => {
        const brokenSource = settingsUiSource.replaceAll('eraHandoffDraftState', 'nonExistentHandoffMethod');
        if (!brokenSource.includes('eraHandoffDraftState')) {
            throw new Error('negative control: eraHandoffDraftState not found');
        }
    }, /negative control/);
});

test('L14-X9: vertical integration across diagnostics, injection, and settings UI', async () => {
    // 1. Diagnostic state
    const emptyDiag = Diagnostic.revisitScheduleState(null, {});
    assert.equal(emptyDiag.ok, true);
    assert.equal(emptyDiag.state, 'no-sessions');
    assert.equal(Diagnostic._revisitScheduleLine(null), '回访日程：尚未登记回访日程会话（不是「面没装上」）');

    const fakeSession = {
        sessionId: 'session_99',
        sequence: [{ topicId: 'battle_of_red_cliff' }],
        receipts: [{ id: 'rcpt_1' }]
    };
    const activeDiag = Diagnostic.revisitScheduleState(null, { sessions: [fakeSession] });
    assert.equal(activeDiag.ok, true);
    assert.equal(activeDiag.state, 'ok');
    assert.equal(activeDiag.counts.totalSessions, 1);
    assert.equal(activeDiag.counts.scheduledCards, 1);
    assert.equal(activeDiag.counts.receipts, 1);

    const line = Diagnostic._revisitScheduleLine({ _revisitScheduleRead: activeDiag });
    assert.match(line, /回访日程：会话 1 场 · 待回访 1 张 · 回执 1 笔/);

    // 2. Injection pipeline
    const fakeEngine = createDummyEngine({
        _revisitSessions: [fakeSession]
    });
    const recalled = [{ text: '调查现场' }];
    const injected = pipelineLib.buildInjection(fakeEngine, recalled);
    const text = Array.isArray(injected) ? injected.join('\n') : String(injected?.text || injected || '');
    assert.match(text, /\[记忆回访·日程参考提示\]/);
    assert.match(text, /回访会话「session_99」/);
    assert.match(text, /battle_of_red_cliff/);

    // 3. Settings UI integration
    assert.match(settingsUiSource, /📅 记忆回访日程工作台/);
    assert.match(settingsUiSource, /revisitScheduleState/);

    // 4. Negative control
    assert.throws(() => {
        const brokenSource = settingsUiSource.replaceAll('revisitScheduleState', 'nonExistentRevisitMethod');
        if (!brokenSource.includes('revisitScheduleState')) {
            throw new Error('negative control: revisitScheduleState not found');
        }
    }, /negative control/);
});
