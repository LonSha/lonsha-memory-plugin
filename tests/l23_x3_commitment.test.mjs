// tests/l23_x3_commitment_followthrough.test.mjs — L23-X3「承诺兑现追踪」
// 计划书：kept/pending/overdue 三态，过期必须显形；另判「没期限」不许并进 pending。
import { test } from 'node:test';
import assert from 'node:assert';
import { loadIife, readManifest } from './_iife_load.mjs';

const M = loadIife('commitment-followthrough.js', 'LonShaCommitmentFollowthrough');

test('【1】四桶分得清：兑现 / 未到期 / 过期 / 期限读不出', () => {
    const r = M.trackCommitments([
        { id: 'a', dueFloor: 100, keptAtFloor: 40, text: '带你去看海' },
        { id: 'b', dueFloor: 200 },
        { id: 'c', dueFloor: 50 },
        { id: 'd', text: '有空再说' }
    ], 100);
    assert.strictEqual(r.face, 'tracked');
    assert.deepStrictEqual(r.counts, { kept: 1, pending: 1, overdue: 1, undated: 1 });
    assert.deepStrictEqual(r.kept.map((x) => x.id), ['a']);
    assert.deepStrictEqual(r.overdue.map((x) => x.id), ['c']);
    assert.strictEqual(r.overdue[0].overdueBy, 50);
});

test('【2】过期必须显形，且成句里带出数字', () => {
    const r = M.trackCommitments([{ id: 'c', dueFloor: 50 }], 120);
    assert.strictEqual(r.overdue.length, 1);
    assert.match(M.followthroughNote(r), /过期 1/);
});

test('【3】此刻读不出 → 不判过期（也不许假装已过期）', () => {
    const r = M.trackCommitments([{ id: 'x', dueFloor: 1 }], null);
    assert.strictEqual(r.overdue.length, 0);
    assert.strictEqual(r.clockKnown, false);
    assert.match(M.followthroughNote(r), /此刻读不出/);
});

test('【4】负控制：把无期限的并进 pending 必须被判红', () => {
    const r = M.trackCommitments([{ id: 'd', text: '有空再说' }], 10);
    assert.strictEqual(r.undated.length, 1);
    assert.strictEqual(r.pending.length, 0, '并进 pending 等于替它定了日子');
});

test('【5】空清单是 empty、非数组是 invalid，不塌成 tracked', () => {
    assert.strictEqual(M.trackCommitments([], 1).face, 'empty');
    assert.strictEqual(M.trackCommitments('nope', 1).face, 'invalid');
});

test('【6】自检与注册', () => {
    assert.strictEqual(M.selfCheck().ok, true, M.selfCheck().bad.join('; '));
    assert.ok(readManifest().extra_js.includes('commitment-followthrough.js'));
});