import test from 'node:test';
import assert from 'node:assert/strict';
import M from '../memory-migrate-pack.js';
import Persistence from '../engine-persistence-ops.js';

globalThis.window = {};

const identity = { character: 'Alice', project: 'project-a', branch: 'branch-1', chatId: 'chat-source' };

function sourceState(items) {
    return {
        memories: { Alice: { core: items.filter((x) => x.layer === 'core').map((x) => x.item), recent: items.filter((x) => x.layer === 'recent').map((x) => x.item) } },
        autobiographies: { Alice: ['keep'] },
        tombstones: { Alice: [{ item: { id: 'cm_dead' } }] },
    };
}

function packFrom(items, metaIdentity = identity) {
    return M.packMemory({
        source: sourceState(items),
        meta: { identity: metaIdentity },
        now: 1730592000000,
    });
}

const packItems = [
    { layer: 'core', item: { id: 'cm_conflict', text: 'pack version', floor: 2 } },
    { layer: 'core', item: { id: 'cm_identical', text: 'same', floor: 3 } },
    { layer: 'recent', item: { id: 'mr_added', text: 'new memory', floor: 4 } },
    { layer: 'recent', item: { id: 'bad_ignored', text: 'not recognizable', floor: 5 } },
    { layer: 'core', item: { id: 'cm_dead', text: 'must stay tombstoned', floor: 6 } },
];

const localState = {
    ...sourceState([
        { layer: 'core', item: { id: 'cm_conflict', text: 'local version', floor: 2 } },
        { layer: 'core', item: { id: 'cm_identical', text: 'same', floor: 3 } },
    ]),
    migrationIdentity: identity,
};

test('O6: precheck returns five-category summary and identity metadata', () => {
    const pack = packFrom(packItems);
    const result = M.precheckImport(pack, localState);
    assert.equal(result.ok, true);
    assert.deepEqual(result.counts, { add: 1, conflict: 1, identical: 1, unrecognized: 1, tombstoned: 1, total: 5 });
    assert.deepEqual(result.summary, {
        total: 5,
        add: 1,
        conflict: 1,
        identical: 1,
        unrecognized: 1,
        tombstoned: 1,
        identity: result.identity,
    });
    assert.deepEqual(result.identity.mismatches, []);
    assert.equal(result.pending, undefined);
});

test('O6: mismatched character/project/branch identity fails closed', () => {
    const pack = packFrom(packItems, { ...identity, project: 'other-project' });
    const result = M.precheckImport(pack, localState);
    assert.equal(result.ok, false);
    assert.equal(result.rejected, true);
    assert.equal(result.reason, 'identity-mismatch');
    assert.deepEqual(result.identity.mismatches, ['project']);
    assert.equal(result.counts.total, pack.entries.length);
    assert.equal(result.counts.add, 0);
});

test('O6: pending decisions can be resumed and keep-both remains idempotent', () => {
    const pack = packFrom(packItems);
    const first = M.applyImport(pack, localState, {});
    assert.equal(first.ok, true);
    assert.equal(first.reason, 'partial-conflicts-pending');
    assert.equal(first.pending.length, 1);
    assert.equal(first.report.written, 1);

    const decisionKey = first.pending[0].key;
    const resumed = M.applyImport(pack, first.state, { [decisionKey]: 'keep-both' });
    assert.equal(resumed.ok, true);
    assert.equal(resumed.pending.length, 0);
    assert.equal(resumed.report.written, 1);
    assert.equal(resumed.decisionsApplied[0].decision, 'keep-both');

    const replay = M.applyImport(pack, resumed.state, { [decisionKey]: 'keep-both' });
    assert.equal(replay.ok, true);
    assert.equal(replay.report.written, 0);
    assert.equal(replay.report.keptBoth, 1);
    assert.equal(replay.state.memories.Alice.core.filter((x) => x.conflict === true).length, 1);
});

test('O6: collectExport carries a cloned recovery record', () => {
    const record = { headSha: 'b'.repeat(64), status: 'pending', decisionsApplied: [] };
    const empty = { export: () => ({}) };
    const base = { config: { config: {} }, _migrateImportRecovery: record, _roundSnapshots: [] };
    const engine = new Proxy(base, {
        get(target, key) {
            if (key in target) return target[key];
            if (key === 'getCurrentFloor') return () => 1;
            if (key === 'summary') return { export: () => ({}), getLockedFacts: () => [] };
            return empty;
        },
    });
    const payload = Persistence.collectExport(engine);
    assert.deepEqual(payload.migrateImportRecovery, record);
    assert.notEqual(payload.migrateImportRecovery, record);
});

test('O6: recovery record survives restoreFromPayload', () => {
    const record = {
        version: 1,
        headSha: 'a'.repeat(64),
        status: 'pending',
        identity,
        decisionsApplied: [{ key: 'Alice|core|cm_conflict', decision: 'use-pack' }],
        pending: [{ key: 'Alice|core|cm_other', reason: 'no-decision' }],
        report: { written: 1, pending: 1 },
        summary: { total: 2, add: 1, conflict: 1, pending: 1, written: 1 },
        chatId: identity.chatId,
        at: 1730592000000,
    };
    const engine = {
        storage: { _confirmed: 'confirmed' },
        config: { config: { atomicRestoreEnabled: false } },
        _bumpEpoch() {},
        _migrateImportRecovery: null,
    };
    const result = Persistence.restoreFromPayload(engine, { migrateImportRecovery: record }, { source: 'o6-test' });
    assert.equal(result.ok, true);
    assert.ok(result.restored.includes('migrateImportRecovery'));
    assert.deepEqual(engine._migrateImportRecovery, record);
    assert.notEqual(engine._migrateImportRecovery, record);
});
