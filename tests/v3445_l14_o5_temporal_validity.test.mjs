import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const T = require_('../temporal-validity-workflow.js');
const FV = require_('../fact-version.js');
const DT = require_('../dual-time.js');

function stateOf(...facts) {
    return { version: 1, seq: facts.length, facts };
}
function fact(id, value, from, to = null) {
    return { id, subject: 'home', predicate: 'place', value, origin: 'confirmed', from, to, floor: from };
}
const base = stateOf(
    fact('old', '北京', 1, 10),
    fact('now', '上海', 10, null)
);
const coords = [{ subject: 'now', actor: '甲', occurred: 10, disclosed: 10, learned: 10 }];
const deps = { factVersion: FV, dualTime: DT, state: base, coords };
const INDEX = fs.readFileSync(path.join(process.cwd(), 'index.js'), 'utf8');

test('L14-O5 · 宿主四条消费路径都接统一适配器', () => {
    assert.match(INDEX, /TV\.readAt\(this\._factVersionState/);
    assert.match(INDEX, /TV\.resolveQuery\(this\._factVersionState/);
    assert.match(INDEX, /TV\.explainFact/);
    assert.match(INDEX, /TV\.selectFacts/);
    assert.match(INDEX, /\.filter\(timeGate\)/);
    assert.match(INDEX, /TV\.line\(this\._factVersionState/);
});

test('L14-O5 · 当前只选开放版本，历史时点仍能选旧版本', () => {
    const now = T.selectFacts([base.facts[0], base.facts[1]], { ...deps });
    assert.deepEqual(now.selected.map(f => f.id), ['now']);
    const then = T.selectFacts([base.facts[0], base.facts[1]], { ...deps, at: 5, allowHistorical: true });
    assert.deepEqual(then.selected.map(f => f.id), ['old']);
    const noHistory = T.selectFacts([base.facts[0]], { ...deps, at: 5 });
    assert.equal(noHistory.selected.length, 0);
});

test('L14-O5 · 迟到披露不把早期视角改成已知', () => {
    const late = fact('late', '秘密', 1, null);
    const lateCoords = [{ subject: 'late', actor: '甲', occurred: 1, disclosed: 100, learned: 100 }];
    const before = T.explainFact(late, { state: stateOf(late), factVersion: FV, dualTime: DT, coords: lateCoords, actor: '甲', at: 20 });
    const after = T.explainFact(late, { state: stateOf(late), factVersion: FV, dualTime: DT, coords: lateCoords, actor: '甲', at: 120 });
    assert.equal(before.dualTime.known, 'no');
    assert.equal(before.reason, 'not-yet-known');
    assert.equal(before.eligible, false);
    assert.equal(after.dualTime.known, 'yes');
    assert.equal(after.eligible, true);
});

test('L14-O5 · 未知日期不补当前楼，未知事实默认不进入窗口', () => {
    const unknown = { id: 'unknown', subject: 'x', predicate: 'when', value: '未说明', origin: 'confirmed' };
    assert.equal(T.classifyFactValidity(unknown, 50).status, T.TEMPORAL_STATUS.UNCERTAIN);
    assert.equal(T.filterFactsByTemporalWindow([unknown], 50).length, 0);
    assert.equal(T.explainFact(unknown, { at: 50 }).eligible, false);
    assert.equal(T.explainFact(unknown, { at: 50, allowUncertain: true }).eligible, true);
});

test('L14-O5 · 当时但未给楼层只报告 unknownTime，不回退成现在', () => {
    const out = T.resolveQuery(base, '回忆她以前住在哪里', { ...deps });
    assert.equal(out.unknownTime, true);
    assert.ok(out.rows.every(row => row.eligible === false));
    assert.ok(out.rows.every(row => row.explanations.every(e => e.reason === 'unknown-time')));
});

test('L14-O5 · 统一诊断行同时包含事实版本与双时间读数', () => {
    const line = T.line(base, { factVersion: FV, dualTime: DT, coords });
    assert.match(line, /事实/);
    assert.match(line, /坐标/);
});
