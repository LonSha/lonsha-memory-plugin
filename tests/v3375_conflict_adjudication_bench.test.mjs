import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Bench = require('../evidence-conflict-adjudication-bench.js');

test('L9-O2 · 矛盾事实聚合成冲突证据束', () => {
    const facts = [
        { id: 'f-1', subject: 'LuoJia', predicate: 'age', object: '17', floor: 10 },
        { id: 'f-2', subject: 'LuoJia', predicate: 'age', object: '27', floor: 25 },
        { id: 'f-3', subject: 'LuoJia', predicate: 'city', object: 'Baoji', floor: 10 },
        { id: 'f-4', subject: 'LuoJia', predicate: 'city', object: 'Baoji', floor: 15 } // 同值不冲突
    ];

    const bundles = Bench.clusterConflictBundles(facts);
    assert.equal(bundles.length, 2);

    const ageBundle = bundles.find(b => b.predicate === 'age');
    assert.equal(ageBundle.isConflicting, true);
    assert.equal(ageBundle.candidateCount, 2);

    const cityBundle = bundles.find(b => b.predicate === 'city');
    assert.equal(cityBundle.isConflicting, false);
    assert.equal(cityBundle.candidateCount, 2);
});

test('L9-O2 · 成组裁决：采纳单一事实与旧事实优雅过期', () => {
    const bundle = {
        bundleKey: 'LuoJia::age',
        candidates: [
            { id: 'f-1', subject: 'LuoJia', predicate: 'age', object: '17' },
            { id: 'f-2', subject: 'LuoJia', predicate: 'age', object: '27' }
        ]
    };

    const res = Bench.adjudicateBundle(bundle, Bench.ADJUDICATION_VERDICTS.ADOPT, {
        winnerFactId: 'f-2',
        reason: 'Ten-year time skip in chapter 2'
    });

    assert.equal(res.ok, true);
    assert.equal(res.facts.length, 2);

    const winner = res.facts.find(f => f.id === 'f-2');
    assert.equal(winner.state, 'confirmed');

    const loser = res.facts.find(f => f.id === 'f-1');
    assert.equal(loser.state, 'expired');
    assert.equal(loser.supersededBy, 'f-2');
});

test('L9-O2 · 成组裁决：并列视角与存疑挂起', () => {
    const bundle = {
        bundleKey: 'Secret::location',
        candidates: [
            { id: 'f-10', subject: 'Secret', predicate: 'location', object: 'North Tower', perspective: 'guard_report' },
            { id: 'f-11', subject: 'Secret', predicate: 'location', object: 'South Bunker', perspective: 'rebel_rumor' }
        ]
    };

    // JUXTAPOSE
    const juxRes = Bench.adjudicateBundle(bundle, Bench.ADJUDICATION_VERDICTS.JUXTAPOSE, {
        reason: 'Dual undercover disinformation'
    });
    assert.equal(juxRes.ok, true);
    assert.equal(juxRes.facts.every(f => f.state === 'inference'), true);

    // PENDING
    const pendRes = Bench.adjudicateBundle(bundle, Bench.ADJUDICATION_VERDICTS.PENDING, {
        reason: 'Awaiting scout report'
    });
    assert.equal(pendRes.ok, true);
    assert.equal(pendRes.facts.every(f => f.state === 'candidate' && f.isDisputed === true), true);
});