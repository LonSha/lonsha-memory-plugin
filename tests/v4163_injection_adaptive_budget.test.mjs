// [v4.163.0 · R26-O5] 注入预算按上下文窗口自适应：超窗就逐级降，降了几级要点名
// 验收口径：同一批条目在小窗口下注入更少，且回执点名降了几级。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const I = require(join(ROOT, 'injection-panel.js'));

const uniform = () => {
    const out = [];
    for (let i = 0; i < 10; i++) {
        out.push({ id: 'u' + i, text: '第' + i + '条正文内容填满三十个字的篇幅，用来把预算夹紧看看会不会降级', sessionId: 's1', floor: i + 1, refCount: i === 7 ? 5 : 0 });
    }
    return out;
};

test('O5-1 suggest 只算读数：给窗口算建议条数与可用字符，不改原条目', () => {
    const list = uniform();
    const before = JSON.stringify(list);
    const s = I.suggest(list, { window: 2000 });
    assert.equal(s.ok, true);
    assert.equal(s.window, 2000);
    assert.equal(s.reserve, 500);
    assert.equal(s.available, 1500);
    assert.ok(s.suggestCount > 0 && s.suggestCount <= list.length);
    assert.ok(s.charBudget > 0);
    assert.equal(JSON.stringify(list), before);
});

test('O5-2 窗口越小，建议条数单调不增', () => {
    const list = uniform();
    const counts = [8000, 2000, 800, 240, 120].map((w) => I.suggest(list, { window: w }).suggestCount);
    for (let i = 1; i < counts.length; i++) {
        assert.ok(counts[i] <= counts[i - 1], counts.join(','));
    }
    assert.ok(counts[0] > counts[counts.length - 1], counts.join(','));
});

test('O5-3 窗口宽裕且手填条数不超过候选 ⇒ 不降级：level=none、gradeCount=0', () => {
    // 八条候选、手填 8 条：窗口再宽也不该凭空裁人（裁了才是降级）
    const a = I.adaptiveRound(uniform().slice(0, 8), { window: 20000, suggestCount: 8 });
    assert.equal(a.level, 'none');
    assert.equal(a.gradeCount, 0);
    assert.deepEqual(a.degraded, []);
    assert.equal(a.entries.length, 8);
});

test('O5-4 同一批条目在小窗口下注入更少（宽 8 条 ⇒ 紧 5 条）', () => {
    const list = uniform();
    const wide = I.adaptiveRound(list, { window: 20000, suggestCount: 8 });
    const tight = I.adaptiveRound(list, { window: 140, suggestCount: 8 });
    assert.ok(tight.entries.length < wide.entries.length, wide.entries.length + ' vs ' + tight.entries.length);
    assert.ok(tight.usedChars < wide.usedChars);
});

test('O5-5 降级逐级具名：每级都有 level / why / detail，且 level 只在三档枚举里', () => {
    const tight = I.adaptiveRound(uniform(), { window: 140, suggestCount: 8 });
    assert.equal(tight.gradeCount, tight.degraded.length);
    tight.degraded.forEach((d) => {
        assert.ok(I.DEGRADE_STEPS.indexOf(d.level) !== -1, d.level);
        assert.ok(String(d.why).length > 0);
        assert.ok(String(d.detail).length > 0);
    });
    assert.deepEqual(tight.degraded.map((d) => d.level), ['count', 'length', 'score']);
    assert.equal(tight.gradeCount, 3);
});

test('O5-6 length 级真的截断：trimmed 逐条给 from/to，注入面里的长度就是 to', () => {
    const tight = I.adaptiveRound(uniform(), { window: 140, suggestCount: 8 });
    assert.ok(tight.trimmed.length > 0);
    tight.trimmed.forEach((x) => {
        assert.ok(x.from > x.to, JSON.stringify(x));
        const hit = tight.entries.filter((e) => e.id === x.id)[0];
        if (hit) assert.equal(hit.chars, x.to, x.id);
    });
});

test('O5-7 score 级只留高分：置顶/被引用多的那条必在', () => {
    const tight = I.adaptiveRound(uniform(), { window: 140, suggestCount: 8 });
    assert.equal(tight.level, 'score');
    const ids = tight.entries.map((e) => e.id);
    assert.ok(ids.indexOf('u7') !== -1, ids.join(','));
    assert.equal(ids[0], 'u7');
    assert.ok(tight.dropped.some((d) => d.kind === 'score'));
});

test('O5-8 预算守住：usedChars 不超 budget，且与唯一渲染口逐项对得上', () => {
    const tight = I.adaptiveRound(uniform(), { window: 140, suggestCount: 8 });
    assert.ok(tight.usedChars <= tight.budget, tight.usedChars + '/' + tight.budget);
    const r = I.render({ entries: tight.entries });
    assert.equal(tight.renderedChars, r.chars);
    assert.equal(tight.usedTokens, r.tokens);
    assert.equal(r.lineCount, tight.entries.length);
});

test('O5-9 硬排除不算降级：未来事件进 blocked，gradeCount 不因此上扬', () => {
    const list = uniform();
    list[3] = Object.assign({}, list[3], { future: true });
    list[5] = Object.assign({}, list[5], { voided: true });
    const wide = I.adaptiveRound(list, { window: 20000, suggestCount: 8 });
    assert.equal(wide.gradeCount, 0);
    assert.ok(wide.blocked.some((b) => b.id === 'u3' && b.kind === 'future'));
    assert.ok(wide.blocked.some((b) => b.id === 'u5' && b.kind === 'voided'));
    assert.ok(!wide.entries.some((e) => e.id === 'u5'));
});

test('O5-10 手填 budget 不能超窗：写 99999 也被窗口算出的可用字符兜住', () => {
    const a = I.adaptiveRound(uniform(), { window: 140, suggestCount: 8, budget: 99999 });
    assert.ok(a.budget <= a.plan.charBudget, a.budget + ' <= ' + a.plan.charBudget);
    assert.ok(a.usedChars <= a.budget);
    assert.equal(I.panelSelfCheck().ok, true);
});
