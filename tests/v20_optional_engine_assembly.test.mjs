import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

test('optional engines are present in production manifest and assembly', () => {
    assert.ok(manifest.extra_js.includes('optional-engine-registry.js'));
    assert.match(index, /LonShaOptionalEngineRegistry/);
    assert.match(index, /this\.optionalEngines/);
    assert.match(index, /this\.optionalEngineStatus/);
});