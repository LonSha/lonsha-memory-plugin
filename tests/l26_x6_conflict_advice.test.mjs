// [v3.475.0 · L26-X6] 冲突仲裁建议
// 验收口径：每条冲突 1~2 条建议 + 依据；不自动改；用户不采纳不影响后续。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const C = require(join(ROOT, 'conflict-advice.js'));

test('X6-1 三类冲突闭集；AUTO_APPLY 恒为 false', () => {
    assert.deepEqual(C.KINDS.slice(), ['value', 'event', 'timeline']);
    assert.equal(C.AUTO_APPLY, false);
});

test('X6-2 每条冲突给 1~2 条建议，且每条都带依据与风险', () => {
    const a = C.advise({ id: 'c1', kind: 'value', local: { text: 'A' }, remote: { text: 'B' } });
    assert.ok(a.suggestions.length >= 1 && a.suggestions.length <= 2, String(a.suggestions.length));
    a.suggestions.forEach((s) => {
        assert.ok(s.basis && s.basis.length > 6, s.action);
        assert.ok(s.risk && s.risk.length > 4, s.action);
    });
    assert.equal(a.autoApply, false);
});

test('X6-3 只有一侧有证据：建议保留有证据的那侧，依据点名证据消息', () => {
    const a = C.advise({ id: 'c1', local: { text: 'A', messageId: 'msg-7' }, remote: { text: 'B' } });
    assert.equal(a.suggestions[0].action, 'keep-local');
    assert.match(a.suggestions[0].basis, /msg-7/);
});

test('X6-4 两侧都没证据：保守给 keep-both，不假装能分出高下', () => {
    const a = C.advise({ id: 'c2', local: { text: 'A' }, remote: { text: 'B' } });
    assert.ok(a.suggestions.some((s) => s.action === 'keep-both'));
});

test('X6-5 显著度差异：提示保留更高的一侧，并说明「显著度≠更正确」', () => {
    const a = C.advise({ id: 'c3', local: { text: 'A', strength: 9 }, remote: { text: 'B', strength: 2 } });
    assert.equal(a.suggestions[0].action, 'keep-local');
    assert.match(a.suggestions[0].risk, /不代表更正确/);
});

test('X6-6 事件类冲突：时间更新的那侧更可能是后改的', () => {
    const a = C.advise({ id: 'c4', kind: 'event', local: { at: 100 }, remote: { at: 200 } });
    assert.ok(a.suggestions.some((s) => s.action === 'keep-remote'), JSON.stringify(a.suggestions));
});

test('X6-7 应用建议：明确拒绝自动执行（本档只建议）', () => {
    assert.throws(() => C.applyAdvice({ id: 'c1' }), (e) => {
        assert.equal(e.code, 'ADVICE_NOT_APPLICABLE');
        assert.match(e.message, /不自动改记忆/);
        return true;
    });
});

test('X6-8 批量建议：逐条给，读数带条数；空列表说没有冲突', () => {
    const out = C.adviseAll([
        { id: 'c1', local: { text: 'A', messageId: 'm1' }, remote: { text: 'B' } },
        { id: 'c2', local: { text: 'C' }, remote: { text: 'D' } }
    ]);
    assert.equal(out.count, 2);
    assert.equal(out.reading, 'conflict-advised:2');
    assert.equal(out.autoApply, false);
    assert.equal(C.adviseAll([]).reading, 'conflict-none');
});

test('X6-9 纯函数：同输入两次结果一致，且不改入参', () => {
    const conflict = { id: 'c9', local: { text: 'A', messageId: 'm1' }, remote: { text: 'B' } };
    const snapshot = JSON.stringify(conflict);
    const a = C.advise(conflict);
    const b = C.advise(conflict);
    assert.deepEqual(a.suggestions, b.suggestions);
    assert.equal(JSON.stringify(conflict), snapshot);
});