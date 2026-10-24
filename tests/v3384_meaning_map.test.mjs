import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { addMeaningInterpretation, getTargetMeaningsByActor } = require('../meaning-evolution-map.js');

test('L9-X2 · 意义演化地图与多角色视角共存', () => {
    let map = { nodes: [] };

    // 角色 A 认为旧怀表是承诺
    const resA = addMeaningInterpretation(map, {
        targetId: 'item_watch',
        actorId: 'alice',
        symbolicRole: 'promise',
        narrativeMeaning: '十年前约定的信物'
    });
    map.nodes = resA.nodes;

    // 角色 B 认为旧怀表是欺骗证据
    const resB = addMeaningInterpretation(map, {
        targetId: 'item_watch',
        actorId: 'bob',
        symbolicRole: 'conflict_evidence',
        narrativeMeaning: '伪造时间的罪证'
    });
    map.nodes = resB.nodes;

    assert.equal(map.nodes.length, 2);

    const aliceViews = getTargetMeaningsByActor(map.nodes, 'item_watch', 'alice');
    assert.equal(aliceViews.length, 1);
    assert.equal(aliceViews[0].symbolicRole, 'promise');

    const bobViews = getTargetMeaningsByActor(map.nodes, 'item_watch', 'bob');
    assert.equal(bobViews.length, 1);
    assert.equal(bobViews[0].symbolicRole, 'conflict_evidence');
});