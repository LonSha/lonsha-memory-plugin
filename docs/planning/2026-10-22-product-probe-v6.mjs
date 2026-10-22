// Planning-only observations of current production modules; not future feature tests.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ctx = vm.createContext({ console });
for (const name of ['ledger-entity.js', 'fact-version.js', 'hypothesis-workspace.js', 'material-pack.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), ctx, { filename: name });
}
const plain = v => JSON.parse(JSON.stringify(v));
const observed = {};
const fv = ctx.LonShaFactVersion;
assert.ok(fv, 'production fact module loaded');
const normalized = fv.normalize({ facts: [{ id: 'f1', subject: '林岚', predicate: '住所', value: '北城', from: 10, floor: 40, occurredAt: '剧情第一日', learnedAt: '剧情第四日' }] });
assert.equal(normalized.facts.length, 1);
assert.equal(normalized.facts[0].from, 10);
assert.equal(normalized.facts[0].floor, 40);
assert.equal(Object.hasOwn(normalized.facts[0], 'occurredAt'), false);
assert.equal(Object.hasOwn(normalized.facts[0], 'learnedAt'), false);
observed.fact = { retained: ['from', 'floor'], nonContractFieldsDiscarded: ['occurredAt', 'learnedAt'], scope: 'normalize only; not an assertion about all clock/knowledge modules' };
const h = ctx.LonShaHypothesisWorkspace;
const original = { worksets: [] };
const created = h.createWorkspace(original, { id: 'h1', label: '改约', snapshotFloor: 40, assumptions: [{ factId: 'f1', override: '南城' }] });
assert.equal(created.ok, true);
assert.equal(original.worksets.length, 0);
assert.equal(created.workspace.snapshotFloor, 40);
assert.equal(created.workspace.assumptions.length, 1);
observed.hypothesis = { fields: Object.keys(created.workspace), pureReturnState: true, scope: 'workspace constructor, no host persistence claim' };
const mp = ctx.LonShaMaterialPack;
assert.ok(mp, 'production material module loaded');
assert.deepEqual(plain(mp.TASKS), ['meet', 'reunion', 'advance', 'resolve']);
observed.material = { tasks: plain(mp.TASKS), scope: 'task vocabulary, not generation quality' };
console.log(JSON.stringify({ kind: 'bounded-module-observation', cases: 3, observed }, null, 2));
