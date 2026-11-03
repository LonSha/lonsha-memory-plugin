import test from 'node:test';
import assert from 'node:assert/strict';
import Books from '../memory-books.js';
import Archive from '../multi-resolution-archive-orchestrator.js';

function docs(count) {
    return Array.from({ length: count }, (_, i) => ({
        id: 'd-' + i,
        text: i % 2 ? '图书馆 还书 爱丽丝 承诺' : '王国 城池 历史 战争 远方',
        floor: i,
    }));
}

test('O7: incremental BM25 upsert matches a full rebuild', () => {
    const initial = docs(120);
    const incremental = new Books.BM25();
    // rebuild historically retains the supplied array reference; isolate the
    // incremental fixture so the expected full-rebuild corpus is independent.
    incremental.rebuild(initial.map((doc) => ({ ...doc })));
    incremental.upsert({ id: 'd-7', text: '龙牙剑 爱丽丝 还书', floor: 7 });
    incremental.upsert({ id: 'd-new', text: '龙牙剑 图书馆', floor: 121 });
    assert.equal(incremental.remove('d-10'), true);
    assert.equal(incremental.remove('missing'), false);

    const expectedDocs = initial
        .filter((doc) => doc.id !== 'd-7' && doc.id !== 'd-10')
        .concat([{ id: 'd-7', text: '龙牙剑 爱丽丝 还书', floor: 7 }, { id: 'd-new', text: '龙牙剑 图书馆', floor: 121 }]);
    const rebuilt = new Books.BM25();
    rebuilt.rebuild(expectedDocs);
    const query = [{ key: 'main', text: '龙牙剑 爱丽丝', weight: 1 }];
    assert.deepEqual(incremental.searchBranches(query, 8), rebuilt.searchBranches(query, 8));
    assert.equal(incremental.N, expectedDocs.length);
    assert.equal(incremental.df.get('龙牙'), rebuilt.df.get('龙牙'));
});

test('O7: bounded archive rendering filters before consuming limits', () => {
    const volumes = Array.from({ length: 5 }, (_, i) => ({ volumeTitle: 'V' + i, floorRange: [i, i + 9], condensedSummary: 'summary-' + i, hidden: i === 0 }));
    const beats = Array.from({ length: 5 }, (_, i) => ({ sceneName: 'S' + i, summary: 'beat-' + i }));
    const logs = Array.from({ length: 5 }, (_, i) => ({ floor: i, speaker: 'A', text: 'log-' + i }));
    const output = Archive.renderMultiResolutionContext(volumes, beats, logs, {
        maxVolumes: 2,
        maxBeats: 1,
        maxLogs: 1,
        maxChars: 300,
        visible: (item, tier) => tier !== 'volume' || !item.hidden,
    });
    assert.ok(output.includes('V1') && output.includes('V2'), output);
    assert.ok(!output.includes('V0'), output);
    assert.ok(output.includes('beat-0'));
    assert.ok(output.includes('[读取已截断]'));
    assert.ok(output.length <= 340);
});

test('O7: archive drilldown cancellation and scan budget are bounded', () => {
    const volume = Archive.sealVolumeArchive('v', 'V', 0, 999, Array.from({ length: 1000 }, (_, i) => ({ floor: i, speaker: 'A', text: 'x', id: 'm-' + i })));
    assert.equal(Archive.expandVolumeDrilldown(volume, 999, { maxScan: 10 }), null);
    assert.equal(Archive.expandVolumeDrilldown(volume, 999, { signal: { aborted: true } }), null);
    assert.equal(Archive.expandVolumeDrilldown(volume, 999, { maxScan: 1000 }).rawId, 'm-999');
});

test('O7: 10k mixed-log bounded render stays within the presentation budget', () => {
    const logs = Array.from({ length: 10000 }, (_, i) => ({ floor: i, speaker: i % 2 ? 'User' : 'Alice', text: 'long mixed payload ' + i }));
    const started = performance.now();
    const output = Archive.renderMultiResolutionContext([], [], logs, { maxLogs: 80, maxChars: 5000 });
    const elapsed = performance.now() - started;
    assert.ok(output.length <= 5050);
    assert.ok(output.includes('L0 Alice') || output.includes('L1 User'));
    assert.ok(output.includes('[读取已截断]'));
    assert.ok(elapsed < 250, 'bounded render unexpectedly slow: ' + elapsed.toFixed(1) + 'ms');
});