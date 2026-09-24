import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const P = require('../projection-pipeline.js');
function verify(mod) {
    for (const empty of ['object', 'array', 'value']) {
        for (const [value, expected] of [[undefined, 'absent'], [null, 'empty'], [0, 'value']]) {
            const p = mod.runPipeline({ probe: () => value }, {
                declaration: [{ id: 'probe', face: 'facts', empty }], nowProvider: () => 10
            });
            assert.equal(p.projections.probe.kind, expected);
            assert.equal(p.identity.ok, true);
            assert.equal(p.summary.ok + p.summary.empty + p.summary.absent + p.summary.skipped, 1);
            const env = mod.buildEnvelope(p);
            assert.equal(env.visibility.probe, expected === 'absent' ? 'withheld' : 'given');
            assert.equal(Object.hasOwn(env.items, 'probe'), expected !== 'absent');
            if (value === 0) assert.equal(env.items.probe, 0);
        }
    }
}
test('source missing, explicit empty and zero remain distinct through envelope', () => verify(P));
test('absence predicate detects real-source normalization regression', () => {
    const src = readFileSync(new URL('../projection-pipeline.js', import.meta.url), 'utf8');
    const anchor = "if (value === null) return emptyShape === 'array'";
    assert.equal(src.split(anchor).length - 1, 1);
    const broken = src.replace(anchor, "if (value === undefined || value === null) return emptyShape === 'array'");
    const load = source => {
        const sandbox = { module: { exports: {} } };
        vm.runInNewContext(source, sandbox);
        return sandbox.module.exports;
    };
    verify(load(src));
    assert.throws(() => verify(load(broken)), assert.AssertionError);
});
