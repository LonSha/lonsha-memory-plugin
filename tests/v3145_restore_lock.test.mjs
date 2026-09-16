// tests/v3145_restore_lock.test.mjs
// [v3.145] CP-L6: 锁所有权令牌 + 变更栅栏（同一聊天内的结构性变更同样作废旧任务）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');
function extractBraced(marker) {
    const start = src.indexOf(marker);
    assert.ok(start >= 0, `${marker} 存在`);
    let depth = 0, i = src.indexOf('{', start + marker.length - 1);
    const open = i;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    return src.slice(open + 1, i);
}
const mkMutex = () => {
    const body = extractBraced('class Mutex {');
    // 类体含 constructor/get 简写，必须塞回 class 而非 function 体
    return new Function('setTimeout', 'clearTimeout', 'console', `return class Mutex { ${body} }`)(
        setTimeout, clearTimeout, { warn: () => {} });
};
test('v3.145 Mutex 令牌：非持有者释放被拒绝，持有者释放生效', async () => {
    const M = mkMutex();
    const m = new M();
    const a = await m.acquire('taskA');
    assert.ok(a && typeof a.id === 'number', 'acquire 返回凭证对象（truthy，兼容既有 !acquired 判定）');
    assert.equal(m.locked, true);
    m.release({ id: 999, owner: 'intruder' });                       // 越权：晚到的旧 finally
    assert.equal(m.locked, true, '非签发者不得放开锁');
    assert.equal(m._foreignRelease, 1, '越权释放计数可见');
    m.release();                                                     // 无凭证：兼容旧调用，按持有者释放
    assert.equal(m.locked, false, '无凭证仍释放（兼容 mock/旧路径）');
    const b = await m.acquire('taskB');
    assert.ok(b.id > a.id, '令牌单调递增');
    m.release(b);
    assert.equal(m.locked, false, '正当释放生效');
    assert.equal(m._foreignRelease, 1, '正当释放不计越权');
});
test('v3.145 Mutex 排队：交接时签发新凭证，旧凭证随后失效', async () => {
    const M = mkMutex();
    const m = new M();
    const a = await m.acquire('taskA');
    const bp = m.acquire('taskB');                 // 排队
    m.release(a);                                  // A 完成 → 交给 B
    const b = await bp;
    assert.ok(b && b.owner === 'queued' || b.owner === 'taskB' || b.owner, 'B 获发凭证');
    assert.notEqual(b.id, a.id, 'B 的凭证不同于 A');
    m.release(a);                                  // A 晚到的重复释放
    assert.equal(m.locked, true, 'A 的旧凭证不得放开 B 的锁');
    m.release(b);
    assert.equal(m.locked, false);
});
test('v3.145 变更栅栏：rollback / 真实恢复推进 epoch，dryRun 不推进', () => {
    const rf = extractBraced('rollbackFloor(floor) {');
    assert.match(rf, /this\._bumpEpoch\('rollback-floor-' \+ floor\)/, '回滚推进栅栏');
    assert.ok(rf.indexOf('_bumpEpoch') > rf.indexOf('if (!entry) return 0;'), '无账本条目时不空推（先判定后 bump）');
    const rp = extractBraced('restoreFromPayload(data) {');
    assert.match(rp, /if \(opts\.dryRun !== true\) this\._bumpEpoch\('restore:'/, '真实恢复才推进（预检零副作用）');
    assert.match(src, /_mutationEpoch = \(this\._mutationEpoch \|\| 0\) \+ 1/, 'bump 单调递增且 NaN 安全');
    assert.match(src, /_lastEpochBump = \{ epoch:.*reason:/, '推进原因落可见性字段');
});
test('v3.145 _leaseValid：双类失效（切聊/状态变更）+ 开关可回退', () => {
    const body = extractBraced('_leaseValid(lease) {');
    const fn = new Function(`return function (lease) { ${body} }`)();
    const eng = (epoch, chatId) => ({ config: { config: { sessionLeaseGuardEnabled: true } }, _mutationEpoch: epoch, getCurrentChatId: () => chatId });
    assert.equal(fn.call(eng(5, 'c1'), { chatId: 'c1', epoch: 5 }), true, '同会话同栅栏→有效');
    assert.equal(fn.call(eng(5, 'c2'), { chatId: 'c1', epoch: 5 }), false, '切聊→失效');
    assert.equal(fn.call(eng(6, 'c1'), { chatId: 'c1', epoch: 5 }), false, '同会话但状态已回滚→失效（v3.141 挡不住的那一类）');
    const off = new Function(`return function (lease) { ${body} }`)();
    assert.equal(off.call({ config: { config: { sessionLeaseGuardEnabled: false } }, _mutationEpoch: 9, getCurrentChatId: () => 'zzz' }, { chatId: 'c1', epoch: 1 }), true, '开关关闭退回宽松');
});
test('v3.145 三处异步路径均携带 epoch 身份并走统一判据', () => {
    for (const v of ['_omrLease', '_bfLease', '_stlLease']) {
        assert.ok(src.includes(`const ${v} = `), `${v} 存在`);
        assert.ok(src.includes(`if (!this._leaseValid(${v}))`), `${v} 走统一判据`);
    }
    assert.equal((src.match(/epoch: this\._mutationEpoch \}/g) || []).length, 3, '三处租约捕获发起时栅栏（排除 _lastEpochBump 的记录字段）');
    assert.equal((src.match(/if \(!this\._leaseValid\(/g) || []).length, 3, '三处统一判据');
    assert.equal((src.match(/this\.mutex\.release\(_\w+Cred\)/g) || []).length, 2, 'OMR/backfill 均带凭证释放');
    assert.ok(!/this\.mutex\.release\(\)/.test(src), '禁止无凭证释放残留');
});
test('v3.145 故障可见性：栅栏作废与越权释放进诊断面板', () => {
    assert.match(ui, /_epochDropped \|\| s\.mutex\?\._foreignRelease \? \(\(\) => \{/, '诊断块显示条件含新故障');
    assert.match(ui, /状态变更栅栏作废 \$\{s\._epochDropped\} 次/, '栅栏作废次数可见');
    assert.match(ui, /s\._lastEpochBump\.reason/, '最近推进原因可见');
    assert.match(ui, /拒绝越权释放锁 \$\{s\.mutex\._foreignRelease\} 次/, '越权释放可见');
    assert.ok(!/_lastForeignRelease/.test(src), '无死字段残留（越权计数真源在 mutex._foreignRelease）');
});
