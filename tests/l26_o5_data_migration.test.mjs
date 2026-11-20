// [v3.475.0 · L26-O5] 迁移兼容矩阵
// 验收口径：读/升/拒三态明确；拒载不静默降级；版本读不出来不许当 0。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const M = require(join(ROOT, 'data-migration-matrix.js'));

test('O5-1 三态闭集，没有第四态', () => {
    assert.deepEqual(M.STATES.slice(), ['read', 'upgrade', 'refuse']);
});

test('O5-2 同版本直读，且明确「不做任何改写」', () => {
    const c = M.cellFor('4', '4');
    assert.equal(c.state, 'read');
    assert.match(c.reason, /不做任何改写/);
});

test('O5-3 旧数据升到新版：给出逐版步骤，步数=版本差', () => {
    const p = M.planMigration({ from: '1' });
    assert.equal(p.state, 'upgrade');
    assert.deepEqual(p.steps, ['v1→v2', 'v2→v3', 'v3→v4']);
    assert.equal(p.reading, 'migration-upgrade:3');
    assert.equal(p.ok, true);
});

test('O5-4 新数据往旧版塞：拒载并说清「宁可拒载也不写坏」', () => {
    const c = M.cellFor('5', '4');
    assert.equal(c.state, 'refuse');
    assert.match(c.reason, /不提供降级写入/);
});

test('O5-5 版本号读不出来：拒载，不许当版本 0 蒙过去', () => {
    assert.equal(M.parseDataVersion('abc'), null);
    assert.equal(M.parseDataVersion(null), null);
    const c = M.cellFor('abc', '4');
    assert.equal(c.state, 'refuse');
    assert.match(c.reason, /读不出来/);
});

test('O5-6 矩阵逐格：已知版本每格都有一行，且每格三态之一', () => {
    const p = M.planMigration({ from: '2', to: '4' });
    assert.equal(p.cells.length, M.FORMAT_VERSIONS.length);
    p.cells.forEach((row) => {
        assert.ok(M.STATES.includes(row.state), row.from);
        assert.ok(row.reason && row.reason.length > 4, row.from);
    });
});

test('O5-7 表外版本进 unknown，不算通过', () => {
    const p = M.planMigration({ from: '9', to: '4' });
    assert.equal(p.unknown.length, 1);
    assert.equal(p.ok, false);
});

test('O5-8 真执行：拒载必抛（code=MIGRATION_REFUSED）', () => {
    const p = M.planMigration({ from: '5', to: '4' });
    assert.throws(() => M.applyMigration({ a: 1 }, p), (e) => {
        assert.equal(e.code, 'MIGRATION_REFUSED');
        assert.match(e.message, /迁移拒载/);
        return true;
    });
});

test('O5-9 真执行成功：逐步记 applied；直读时一步都不走', () => {
    const up = M.planMigration({ from: '2', to: '4' });
    const out = M.applyMigration({ a: 1 }, up);
    assert.deepEqual(out.applied, ['v2→v3', 'v3→v4']);
    assert.equal(out.state, 'upgrade-done');
    const rd = M.applyMigration({ a: 1 }, M.planMigration({ from: '4', to: '4' }));
    assert.deepEqual(rd.applied, []);
    assert.equal(rd.state, 'read');
});

test('O5-10 升格步骤写坏：抛错，不许跳过继续写', () => {
    const broken = { state: 'upgrade', ok: true, steps: ['v1'] };
    assert.throws(() => M.applyMigration({}, broken), TypeError);
});