// tests/v3145_restore_lock.test.mjs
// [v3.145] CP-L6: 锁所有权令牌 + 变更栅栏（同一聊天内的结构性变更同样作废旧任务）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');
/* [v3.258.0 A1 第二刀] Mutex 已抽为 memory-aux.js：真执行面读模块文件（宿主仍内联声明由 v3259 A 段钉住）。 */
const auxSrc = readFileSync(new URL('../memory-aux.js', import.meta.url), 'utf8');
import { createRequire } from 'node:module';
import { breakSource } from './_break_kit.mjs';
import { loadBroken } from './_negative_util.mjs';
const require_ = createRequire(import.meta.url);
const MA = require_('../memory-aux.js');
function extractBraced(marker, source) {
    const text = source || src;
    const start = text.indexOf(marker);
    assert.ok(start >= 0, `${marker} 存在`);
    let depth = 0, i = text.indexOf('{', start + marker.length - 1);
    const open = i;
    for (; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) break; }
    }
    return text.slice(open + 1, i);
}
/* [v3.279.0 O7] 真模块装载（修前：抠 `class Mutex` 类体塞回 class + 函数构造重放
 *   —— 那是与真类**并行的第二实现**，真类漂移时本档绿着而真类已坏）。现在直接取真类。 */
const mkMutex = () => MA.Mutex;
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
test('v3.145★ 负控制：真源码破坏「正当释放」判定 → 越权释放行为必须改变', async () => {
    const anchor = 'if (cred && cred === this._holder) { /* 正当释放 */ }';
    assert.equal(auxSrc.split(anchor).length - 1, 1, '破坏锚点必须恰中 1 次');
    const bmod = loadBroken(breakSource(auxSrc, anchor, 'if (cred !== undefined || true) { /* 正当释放 */ }', 'v3145-negctl'), 'v3145_negctl');
    const BM = bmod.Mutex;
    const m = new BM();
    const a = await m.acquire('taskA');
    m.release({ id: 999, owner: 'intruder' });
    assert.equal(m.locked, false, '破坏后：越权释放被当成正当释放（锁被外人放开）—— 证明负控制可观测');
    assert.equal(m._foreignRelease, 0, '破坏后：越权计数不再累加');
    // 原版同址必须拒绝
    const mu = new MA.Mutex();
    const a2 = await mu.acquire('taskA');
    mu.release({ id: 999, owner: 'intruder' });
    assert.equal(mu.locked, true, '原版：非签发者不得放开锁');
    assert.equal(mu._foreignRelease, 1, '原版：越权释放计数可见');
});
test('v3.145 三处异步路径均携带 epoch 身份并走统一判据', () => {
    for (const v of ['_omrLease', '_bfLease', '_stlLease']) {
        assert.ok(src.includes(`const ${v} = `), `${v} 存在`);
        assert.ok(src.includes(`if (!this._leaseValid(${v}))`), `${v} 走统一判据`);
    }
    /* [v3.296.0 抬版交棒] 原写死「恰 3 处」—— 该形态是 v3.145.0 的一次性事实；
     *   v3.292.0 起 X6（分支导入）/ X7（分卷接续）/ X2（修复计划）的宿主真实接线
     *   各新增一个同形捕获点，实测已 6 处。锁当版字面量会把**活跃功能增长**判红
     *   （本仓明令禁止：删断言 = 洗断言，锁当版 = 假绿，两者都不取）。
     *   改钉**版本无关的结构不变量**：
     *   ① 捕获点数 >= 3（原先那三处老路径不得消失）；
     *   ② **每一处捕获点都必须在同一段内被 `_leaseValid` 消费** —— 只看数量不看消费，
     *      「捕获了身份却从不核」这一真缺陷会整个漏网（那正是本条要防的）。
     *      配对方式是**分割窗口**：每处捕获点到下一处捕获点（末处到文件尾）之间必须有校验。 */
    const CAP_RE = /epoch: this\._mutationEpoch \}/g;
    const caps = [...src.matchAll(CAP_RE)].map((m) => m.index);
    assert.ok(caps.length >= 3, '租约捕获点不得少于 3 处（实 ' + caps.length + '）');
    caps.forEach((at, i) => {
        const to = (i + 1 < caps.length) ? caps[i + 1] : src.length;
        const win = src.slice(at, to);
        assert.ok(/this\._leaseValid\(/.test(win),
            '第 ' + (src.slice(0, at).split('\n').length) + ' 行的租约捕获点必须在同段内被 _leaseValid 消费');
    });
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
