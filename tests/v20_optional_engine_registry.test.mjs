import test from 'node:test';
import assert from 'node:assert/strict';
import registry from '../optional-engine-registry.js';

test('optional engine registry discovers all dormant pure engines', () => {
    const status = registry.status();
    assert.equal(status.length, 29);
    assert.ok(status.every(item => item.loaded), JSON.stringify(status));
    const loaded = registry.loadAll();
    assert.equal(Object.keys(loaded).length, 29);
});