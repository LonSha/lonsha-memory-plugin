import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Revisit from '../memory-revisit-schedule.js';
import Season from '../memory-season.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const indexSource = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');

const sourceItems = [
    { id: 'topic-a', title: '旧车站', type: Revisit.CARD_TYPES.COMMEMORATION, sourceId: 'floor-10', quote: '我们在旧车站告别。', date: '2020-05-01' },
    { id: 'topic-b', title: '未完成的约定', type: Revisit.CARD_TYPES.DEFER, source: { id: 'floor-11', text: '下周再见。' } },
    { id: 'topic-muted', title: '已静音主题', sourceId: 'floor-12', quote: '这条不应再次推送。' },
    { id: 'topic-no-source', title: '没有来源' },
];

test('X9: host registers and consumes the revisit schedule module', () => {
    assert.ok(manifest.extra_js.includes('memory-revisit-schedule.js'));
    assert.match(indexSource, /function _memoryRevisitScheduleLib\(\).*memory-revisit-schedule\.js/);
    assert.match(indexSource, /\['回访日程', _memoryRevisitScheduleLib, 'revisitScheduleSelfCheck'\]/);
});

test('X9: revisit cards require real source and filter muted topics', () => {
    const before = JSON.stringify(sourceItems);
    const result = Revisit.buildRevisitCards(sourceItems, {
        userActions: { 'topic-muted': Season.SEASON_ACTIONS.MUTE },
    });
    assert.equal(result.writesNothing, true);
    assert.deepEqual(result.cards.map((card) => card.id), ['topic-a', 'topic-b']);
    assert.deepEqual(result.mutedTopicIds, ['topic-muted']);
    assert.deepEqual(result.rejected, [{ id: 'topic-no-source', reason: 'source-unavailable' }]);
    assert.equal(result.cards[0].sourceRefs[0], 'floor-10');
    assert.equal(JSON.stringify(sourceItems), before);
});

test('X9: selected cards become an ordered sequence and unknown cards fail closed', () => {
    const cards = Revisit.buildRevisitCards(sourceItems).cards;
    const empty = Revisit.createRevisitSession(cards, []);
    assert.equal(empty.success, false);
    assert.equal(empty.reason, 'empty-selection');
    const unknown = Revisit.createRevisitSession(cards, ['topic-a', 'missing']);
    assert.equal(unknown.success, false);
    assert.deepEqual(unknown.unknownIds, ['missing']);
    const session = Revisit.createRevisitSession(cards, ['topic-b', 'topic-a'], 1700000000000);
    assert.equal(session.success, true);
    assert.deepEqual(session.session.sequence.map((card) => card.id), ['topic-b', 'topic-a']);
});

test('X9: viewing and deferring records evidence receipts without facts or speech', () => {
    const cards = Revisit.buildRevisitCards(sourceItems).cards;
    const created = Revisit.createRevisitSession(cards, ['topic-a', 'topic-b'], 1700000000000);
    const viewed = Revisit.recordRevisitEvent(
        created.session,
        'topic-a',
        Revisit.EVENT_ACTIONS.VIEWED,
        ['floor-10'],
        1700000001000,
    );
    assert.equal(viewed.success, true);
    assert.deepEqual(viewed.receipt.evidenceRefs, ['floor-10']);
    assert.equal(viewed.receipt.createsFact, false);
    assert.equal(viewed.receipt.generatesSpeech, false);
    const deferred = Revisit.recordRevisitEvent(
        viewed.session,
        'topic-b',
        Revisit.EVENT_ACTIONS.DEFERRED,
        ['floor-11'],
        1700000002000,
    );
    assert.equal(deferred.success, true);
    assert.equal(deferred.session.receipts.length, 2);
    assert.equal(deferred.session.sequence.length, 2);
    assert.equal(Revisit.recordRevisitEvent(viewed.session, 'missing', 'viewed').reason, 'card-not-selected');
});

test('X9: schedule self-check is clean', () => {
    assert.deepEqual(Revisit.revisitScheduleSelfCheck().problems, []);
});