// [v4.163.0 · R26-X7] 问诊建议一键执行：建议带动作 id，执行后点名改了哪一项
// 验收口径：执行「放宽到冷层」后冷层条目可召回，回执点名该项。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const C = require(join(ROOT, 'memory-checkup-page.js'));

function state() {
    return {
        settings: { 'recall.tiers': 'hot,warm' },
        memories: [
            { id: 'm1', text: '海边那次谈话', tier: 'hot' },
            { id: 'm2', text: '海边的旧事', tier: 'cold' },
            { id: 'm3', text: '无关的事', tier: 'warm', excluded: true }
        ]
    };
}

test('X7-1 每条建议都带动作读数：白名单内的可执行、白名单外明说没有', () => {
    const a = C.adviceActions('tier-cold');
    assert.equal(a.ok, true);
    assert.equal(a.items.length, 3);
    a.items.forEach((x) => {
        assert.ok(String(x.text).length > 0);
        assert.ok(x.action === null || typeof x.action === 'string');
    });
    assert.equal(a.items[0].action, 'recall.widen-cold');
    assert.equal(a.items[0].executable, true);
    const ex = C.adviceActions('excluded');
    const notExec = ex.items.filter((x) => x.executable === false);
    assert.equal(notExec.length, 1);
    assert.equal(notExec[0].action, null);
    assert.match(notExec[0].why, /白名单/);
});

test('X7-2 白名单外的动作不给执行：具名 not-in-whitelist', () => {
    const r = C.runAction(state(), 'recall.check-rule');
    assert.equal(r.ok, false);
    assert.deepEqual(r.bad, ['not-in-whitelist']);
    assert.deepEqual(r.changed, []);
});

test('X7-3 执行「放宽到冷层」：设置真的变了，回执点名键与前后值', () => {
    const r = C.runAction(state(), 'recall.widen-cold');
    assert.equal(r.ok, true);
    assert.equal(r.scope, 'config');
    assert.deepEqual(r.changed, [{ key: 'recall.tiers', from: 'hot,warm', to: 'hot,warm,cold' }]);
    assert.equal(r.state.settings['recall.tiers'], 'hot,warm,cold');
});

test('X7-4 放宽之前冷层搜不到，放宽之后搜得到（效果可验）', () => {
    const s0 = state();
    assert.equal(C.recallPreview(s0, '海边').count, 1);
    const r = C.runAction(s0, 'recall.widen-cold');
    const pv = C.recallPreview(r.state, '海边');
    assert.equal(pv.count, 2);
    assert.deepEqual(pv.hits, ['m1', 'm2']);
    assert.ok(pv.tiers.indexOf('cold') !== -1);
});

test('X7-5 条目类动作：改的是那一条，回执点名 memories[id].字段', () => {
    const r = C.runAction(state(), 'memory.mark-important', 'm2');
    assert.equal(r.ok, true);
    assert.equal(r.scope, 'item');
    assert.equal(r.target, 'm2');
    assert.deepEqual(r.changed, [{ key: 'memories[m2].important', from: '(未设)', to: true }]);
    assert.equal(r.state.memories.find((m) => m.id === 'm2').important, true);
});

test('X7-6 条目类动作缺目标 / 目标不存在：具名失败，不乱改第一条', () => {
    assert.deepEqual(C.runAction(state(), 'memory.describe').bad, ['need-target']);
    assert.deepEqual(C.runAction(state(), 'memory.describe', 'ghost').bad, ['no-such-memory']);
});

test('X7-7 query 类动作不改状态，只给下一步提示', () => {
    const s0 = state();
    const r = C.runAction(s0, 'recall.explicit-name');
    assert.equal(r.ok, true);
    assert.equal(r.scope, 'query');
    assert.deepEqual(r.changed, []);
    assert.ok(String(r.hint).length > 0);
    assert.deepEqual(r.state, s0);
});

test('X7-8 执行是纯函数：入参没被改', () => {
    const s0 = state();
    const before = JSON.stringify(s0);
    C.runAction(s0, 'recall.widen-cold');
    C.runAction(s0, 'memory.mark-important', 'm2');
    assert.equal(JSON.stringify(s0), before);
});

test('X7-9 未知原因键 ⇒ no-advice，不编三条建议', () => {
    const a = C.adviceActions('no-such-reason');
    assert.equal(a.ok, false);
    assert.deepEqual(a.bad, ['no-advice']);
    assert.deepEqual(a.items, []);
    assert.ok(Object.keys(C.ADVICE_ACTIONS).every((k) => Array.isArray(C.ADVICE[k])));
});

test('X7-10 每条建议的文案与 ADVICE 原文逐字一致（动作只是挂上去，不改话）', () => {
    Object.keys(C.ADVICE).forEach((k) => {
        const a = C.adviceActions(k);
        assert.equal(a.ok, true, k);
        assert.deepEqual(a.items.map((x) => x.text), C.ADVICE[k].slice(), k);
    });
    assert.equal(C.checkupSelfCheck().ok, true);
});
