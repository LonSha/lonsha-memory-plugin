import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Response from '../relationship-repair-response.js';
import Theater from '../relationship-repair-theater.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const indexSource = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');

const proposal = {
    proposalId: 'prop-1',
    fromActorId: 'luojia',
    toActorId: 'shuyun',
    summary: '为三年前失约道歉，并提出三条补救。',
    unresolvedHistory: ['三年前的失约', '当天的空等'],
    asks: [
        { askId: 'a1', text: '当面把当年家中急事说清楚', severity: 'high' },
        { askId: 'a2', text: '补上那场没去成的音乐会', severity: 'normal' },
        { askId: 'a3', text: '以后失约提前说', severity: 'high' },
    ],
};

function freshRecord() {
    const created = Response.createRepairResponseRecord(proposal, {});
    assert.equal(created.ok, true);
    assert.equal(created.writes, false);
    return created.record;
}

test('X7: host registers and consumes the repair response module', () => {
    assert.ok(manifest.extra_js.includes('relationship-repair-response.js'));
    assert.match(indexSource, /function _repairResponseLib\(\).*relationship-repair-response\.js/);
    assert.match(indexSource, /\['修复回应', _repairResponseLib, 'repairResponseSelfCheck'\]/);
});

test('X7: a proposal without concrete asks is rejected instead of faked', () => {
    assert.equal(Response.createRepairResponseRecord({}, {}).reason, 'proposal-required');
    assert.equal(Response.createRepairResponseRecord({ proposalId: 'p' }, {}).reason, 'asks-required');
    const noId = Response.createRepairResponseRecord({ proposalId: 'p', asks: [{ text: 'x' }] }, {});
    assert.equal(noId.ok, false);
    assert.equal(noId.reason, 'no-valid-asks');
    // 建记录不写源
    const before = JSON.stringify(proposal);
    freshRecord();
    assert.equal(JSON.stringify(proposal), before);
});

test('X7: rejection is a valid outcome, not an unfinished task', () => {
    const rec = Response.recordResponse(freshRecord(), { kind: 'reject', note: '无法释怀。' });
    assert.equal(rec.ok, true);
    assert.equal(rec.validOutcome, true);
    assert.equal(rec.isRejection, true);
    const p = Response.computeProgress(rec.record);
    assert.equal(p.state, 'responded');
    assert.equal(p.validOutcome, true);
    assert.equal(p.isRejection, true);
    assert.notEqual(p.state, 'awaiting-response');
    // 拒绝不是失败态：不存在 failed
    assert.ok(!Response.RESPONSE_STATES.includes('failed'));
    // 逐条都落 rejected
    assert.equal(Response.resolveAskKind(rec.record, 'a1').kind, 'rejected');
    assert.equal(Response.resolveAskKind(rec.record, 'a3').kind, 'rejected');
});

test('X7: deferral is a decision, and partial requires every ask to be classified', () => {
    const deferred = Response.recordResponse(freshRecord(), { kind: 'defer' });
    assert.equal(deferred.isDeferral, true);
    assert.equal(Response.computeProgress(deferred.record).isDeferral, true);

    // 部分接受：留空的诉求不是「默认接受」，是「还没说」
    const incomplete = Response.recordResponse(freshRecord(), {
        kind: 'partial',
        acceptedAskIds: ['a1'],
    });
    assert.equal(incomplete.ok, false);
    assert.equal(incomplete.reason, 'unclassified-asks');
    assert.deepEqual(incomplete.unclassifiedAskIds, ['a2', 'a3']);

    // 同一条既接受又拒绝 → 输入矛盾，不替用户裁决
    const conflict = Response.recordResponse(freshRecord(), {
        kind: 'partial',
        acceptedAskIds: ['a1'],
        rejectedAskIds: ['a1', 'a2', 'a3'],
    });
    assert.equal(conflict.ok, false);
    assert.equal(conflict.reason, 'conflicting-ask-classification');

    // 完整的部分接受
    const ok = Response.recordResponse(freshRecord(), {
        kind: 'partial',
        acceptedAskIds: ['a1'],
        rejectedAskIds: ['a2'],
        deferredAskIds: ['a3'],
    });
    assert.equal(ok.ok, true);
    assert.equal(Response.resolveAskKind(ok.record, 'a1').kind, 'accepted');
    assert.equal(Response.resolveAskKind(ok.record, 'a2').kind, 'rejected');
    assert.equal(Response.resolveAskKind(ok.record, 'a3').kind, 'deferred');
});

test('X7: one apology never clears the old events', () => {
    let rec = freshRecord();
    assert.equal(rec.oldEventsCleared, false);
    rec = Response.recordResponse(rec, { kind: 'accept' }).record;
    assert.equal(rec.oldEventsCleared, false);
    const p = Response.computeProgress(rec);
    assert.equal(p.oldEventsCleared, false);
    // 旧事原样保留，和解也不抹
    assert.deepEqual(p.unresolvedHistory, ['三年前的失约', '当天的空等']);
    // 接受之后也只是「口头」，因为还没有后续行为证据
    assert.equal(p.progress, 'declared');
    assert.notEqual(p.progress, 'demonstrated');
});

test('X7: behavior evidence must link back to an ask and carry a real source', () => {
    let rec = Response.recordResponse(freshRecord(), { kind: 'accept' }).record;
    // 不能回链 → 拒收
    assert.equal(Response.recordBehaviorEvidence(rec, { evidenceId: 'e1', verdict: 'kept', sourceRef: 'floor-9' }).reason, 'ask-link-required');
    // 回链到不存在的诉求 → 拒收
    assert.equal(Response.recordBehaviorEvidence(rec, { evidenceId: 'e1', askId: 'zz', verdict: 'kept', sourceRef: 'floor-9' }).reason, 'unknown-ask');
    // 没有来源 → 拒收（无凭据不得捏造「他做到了」）
    assert.equal(Response.recordBehaviorEvidence(rec, { evidenceId: 'e1', askId: 'a1', verdict: 'kept' }).reason, 'source-required');
    // 不认得的判定 → 拒收
    assert.equal(Response.recordBehaviorEvidence(rec, { evidenceId: 'e1', askId: 'a1', verdict: 'maybe', sourceRef: 'floor-9' }).reason, 'unknown-verdict');
    // 正常记账
    const ok = Response.recordBehaviorEvidence(rec, { evidenceId: 'e1', askId: 'a1', verdict: 'kept', sourceRef: 'floor-9' });
    assert.equal(ok.ok, true);
    assert.equal(ok.countedInProgress, true);
    // 重复 id 拒收
    assert.equal(Response.recordBehaviorEvidence(ok.record, { evidenceId: 'e1', askId: 'a1', verdict: 'kept', sourceRef: 'floor-9' }).reason, 'duplicate-evidence');
});

test('X7: progress is judged by real behavior evidence, drafts are excluded', () => {
    let rec = Response.recordResponse(freshRecord(), { kind: 'accept' }).record;
    // 只有草案证据 → 仍是「口头」，不算做到
    const draft = Response.recordBehaviorEvidence(rec, {
        evidenceId: 'd1', askId: 'a1', verdict: 'kept', origin: 'draft', sourceRef: 'sim-1',
    });
    assert.equal(draft.ok, true);
    assert.equal(draft.countedInProgress, false);
    const pDraft = Response.computeProgress(draft.record);
    assert.equal(pDraft.progress, 'declared');
    assert.equal(pDraft.draftEvidenceCount, 1);
    assert.equal(pDraft.occurredEvidenceCount, 0);
    assert.equal(pDraft.draftEvidenceExcluded, true);
    assert.equal(pDraft.asksKept, 0);

    // 真实行为证据才推成 demonstrated
    const real = Response.recordBehaviorEvidence(draft.record, {
        evidenceId: 'e1', askId: 'a1', verdict: 'kept', origin: 'occurred', sourceRef: 'floor-42',
    });
    const pReal = Response.computeProgress(real.record);
    assert.equal(pReal.progress, 'demonstrated');
    assert.equal(pReal.asksKept, 1);
    assert.equal(pReal.asksUnproven, 2);
    // 一次履约不等于全部履约
    assert.notEqual(pReal.asksKept, pReal.asksTotal);

    // 后续行为与承诺相反 → broken 优先
    const broke = Response.recordBehaviorEvidence(real.record, {
        evidenceId: 'e2', askId: 'a3', verdict: 'broken', origin: 'occurred', sourceRef: 'floor-51',
    });
    const pBroke = Response.computeProgress(broke.record);
    assert.equal(pBroke.progress, 'broken');
    assert.equal(pBroke.asksBroken, 1);
    // 即使有过一次履约，也不能把「又失约了」读成进展
    assert.notEqual(pBroke.progress, 'demonstrated');
});

test('X7: unknown evidence is neither kept nor broken', () => {
    let rec = Response.recordResponse(freshRecord(), { kind: 'accept' }).record;
    rec = Response.recordBehaviorEvidence(rec, {
        evidenceId: 'e1', askId: 'a1', verdict: 'unknown', origin: 'occurred', sourceRef: 'floor-7',
    }).record;
    const p = Response.computeProgress(rec);
    // 判不了就是判不了：不能读成做到，也不能读成没做到
    assert.equal(p.progress, 'declared');
    assert.equal(p.asksKept, 0);
    assert.equal(p.asksBroken, 0);
    assert.equal(p.perAsk.find((x) => x.askId === 'a1').verdict, 'unknown');
});

test('X7: second response cannot silently overwrite the first', () => {
    const rec = Response.recordResponse(freshRecord(), { kind: 'reject' }).record;
    const again = Response.recordResponse(rec, { kind: 'accept' });
    assert.equal(again.ok, false);
    assert.equal(again.reason, 'already-responded');
    assert.equal(again.previous.kind, 'reject');
});

test('X7: coexists with the existing repair theater without changing its contract', () => {
    const enc = Theater.createRepairEncounter({
        initiatorId: 'luojia',
        recipientId: 'shuyun',
        conflictCore: '三年前失约',
    });
    assert.ok(enc.encounterId);
    // 剧场仍是四条整路径；本模块补的是逐条回应，两者不互相顶替
    assert.equal(Object.keys(Theater.REPAIR_PATH).length, 4);
    assert.equal(Object.keys(Response.RESPONSE_KINDS).length, 4);
});

test('X7: self check has no problems', () => {
    const sc = Response.repairResponseSelfCheck();
    assert.deepEqual([...sc.problems], []);
});