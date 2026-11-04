import test from 'node:test';
import assert from 'node:assert/strict';
import Pipeline from '../batch-maintenance-pipeline.js';

const items = Array.from({ length: 12 }, (_, i) => ({
    id: 'fact-' + i,
    content: 'memory-' + i,
    evidence: [{ floor: i, quote: 'source-' + i }],
    entities: i === 2 ? ['Alice'] : [],
    isArchived: false,
}));

test('O9: scoped task changes only the selected ten items', () => {
    const selectedIds = items.slice(0, 10).map((item) => item.id);
    const before = JSON.stringify(items);
    const task = Pipeline.createScopedMaintenanceTask(
        items,
        selectedIds,
        Pipeline.SCOPED_MAINTENANCE_ACTIONS.ARCHIVE,
        {},
        1700000000000,
    );
    assert.equal(task.valid, true);
    assert.equal(task.targetCount, 10);
    assert.deepEqual(task.selectedIds, selectedIds);
    assert.equal(task.impact.evidence, 'preserved');
    assert.equal(JSON.stringify(items), before, 'preview must not mutate source items');

    const pending = Pipeline.applyScopedMaintenanceTask({}, task);
    assert.equal(pending.success, false);
    assert.equal(pending.reason, 'confirmation-required');
    assert.equal(pending.writes, false);
    assert.equal(JSON.stringify(items), before, 'unconfirmed task must not mutate source items');

    const applied = Pipeline.applyScopedMaintenanceTask({}, task, { confirm: true, now: 1700000001000 });
    assert.equal(applied.success, true);
    assert.equal(applied.receipt.affectedCount, 10);
    assert.deepEqual(applied.receipt.selectedIds, selectedIds);
    assert.equal(applied.transformedItems.every((item) => item.isArchived === true), true);
    assert.equal(applied.receipt.rollbackSnapshots[0].evidence[0].quote, 'source-0');
    assert.deepEqual(applied.transformedItems.map((item) => item.id), selectedIds);
    assert.equal(JSON.stringify(items), before, 'pure pipeline returns writes instead of mutating source items');
});

test('O9: empty and unknown selections fail closed', () => {
    const empty = Pipeline.createScopedMaintenanceTask(items, [], 'archive');
    assert.equal(empty.valid, false);
    assert.equal(empty.reason, 'empty-selection');

    const unknown = Pipeline.createScopedMaintenanceTask(items, ['fact-1', 'missing'], 'archive');
    assert.equal(unknown.valid, false);
    assert.equal(unknown.reason, 'unknown-selection');
    assert.deepEqual(unknown.unknownIds, ['missing']);
});

test('O9: checkpoint resumes the same selected task without widening its scope', () => {
    const selectedIds = ['fact-2', 'fact-7'];
    const task = Pipeline.createScopedMaintenanceTask(
        items,
        selectedIds,
        Pipeline.SCOPED_MAINTENANCE_ACTIONS.TAG_ENTITY,
        { entityTag: 'reviewed' },
        1700000000000,
    );
    const serialized = JSON.parse(JSON.stringify(task.checkpoint));
    const resumed = Pipeline.resumeScopedMaintenanceTask(serialized, items, 1700000002000);
    assert.equal(resumed.valid, true);
    assert.deepEqual(resumed.selectedIds, selectedIds);
    assert.equal(resumed.targetCount, 2);
    assert.ok(resumed.previewItems.every((item) => item.transformed.entities.includes('reviewed')));
});

test('O9: mute preserves evidence and reports recall impact', () => {
    const task = Pipeline.createScopedMaintenanceTask(
        items,
        ['fact-3'],
        Pipeline.SCOPED_MAINTENANCE_ACTIONS.MUTE,
        {},
        1700000000000,
    );
    assert.equal(task.valid, true);
    assert.deepEqual(task.impact, { defaultRecall: 'suppressed', evidence: 'preserved', reversible: true });
    assert.equal(task.previewItems[0].transformed.muted, true);
    assert.deepEqual(task.previewItems[0].transformed.evidence, items[3].evidence);
    const applied = Pipeline.applyScopedMaintenanceTask({}, task, { confirm: true, now: 1700000003000 });
    assert.equal(applied.success, true);
    assert.deepEqual(applied.receipt.evidenceSnapshots[0].evidence, items[3].evidence);
});
