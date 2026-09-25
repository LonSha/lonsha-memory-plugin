/* ============================================================
 * tests/v3215_repair_write_channel.test.mjs — [v3.214.0] Gate R1-F
 *
 * 锁住「修复预览 + 受控写入面」的四条契约。全部落在**真源码**上：
 * 宿主方法与修复模块都从 index.js / repair-loop.js 现提，桥的**回执构造点**
 * 也从源码里提，不用替身——否则测的是「我重写了一遍」，不是「仓库里那份」。
 *
 *   ① 预览只算不改：`preview()` 签名里没有状态；调它之后 `_repairState` 必须**逐字未动**；
 *      「预览过 ⇒ 登记必过同一份判据、同一份清单」不得靠两处各写一遍 if；
 *   ② 幂等只按「未放弃」判重：同键重放不新增记录；**放弃后重试是新意图，必须重新登记**；
 *   ③ 写入面过两道门：缺幂等键拒、预览修订对不上表拒，且**被拒时账不动**；
 *      `expectRevision` 缺省不得被当成 0 而"恰好"通过；
 *   ④ 回执形状恒定 9 键（失败分支与成功分支同形），`revision` 一律回当下修订号
 *      ——「这次什么都没写」不得与「这次写了」同形。
 *
 * 负控制一律：真源码破坏（锚点恰中 1 次）→ 载入破坏副本 → 在副本上重跑同款判据 → 必须现形。
 * 工具自证：锚点不存在 / 不唯一 / 同值替换 ⇒ 必须抛（防「破坏写了个假锚点」）。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const R = process.cwd();
const idxSrc = fs.readFileSync(path.join(R, 'index.js'), 'utf8');
const rlSrc = fs.readFileSync(path.join(R, 'repair-loop.js'), 'utf8');
const require_ = createRequire(import.meta.url);
const RL = require_(path.join(R, 'repair-loop.js'));

/* ───────────────── 源码提取（全部靠花括号配平，不做文本猜测） ───────────────── */

function braceBlock(text, startIdx) {
    let depth = 0, end = -1;
    for (let i = startIdx; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return end > 0 ? text.slice(startIdx, end + 1) : null;
}
/** 从 `header` 处起取整个函数/方法（**含头部**：对象字面量方法简写需要 `name() {` 这一段）。 */
function blockOf(src, header) {
    const at = src.indexOf(header);
    if (at < 0) return null;
    const open = src.indexOf('{', at);
    if (open < 0) return null;
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return end > 0 ? src.slice(at, end + 1) : null;
}
function bridgeLiteralOf(src) {
    const marker = 'window.lonsha_memory_bridge_v1 = {';
    const at = src.indexOf(marker);
    if (at < 0) return null;
    return braceBlock(src, src.indexOf('{', at));
}

const HOST_METHODS = [
    '_repairPool() {', 'requestRepair(input) {', 'previewRepair(input) {',
    'settleRepair(input) {', 'abandonRepair(input) {', 'repairRevision() {'
];

/** 用给定源码里的**真宿主方法**造引擎（破损副本上跑同一套判据时也走这里）。 */
function engineFrom(src, rl) {
    const body = HOST_METHODS.map(h => {
        const s = blockOf(src, h);
        assert.ok(s, '宿主方法在位：' + h);
        return s;
    }).join(',\n');
    const eng = new Function(
        '_repairLoopLib', 'errLog', 'PLUGIN_NAME', 'window',
        `return ({ ${body} });`
    )(() => rl, () => {}, 'v3215', {});
    return Object.assign(eng, makePoolHost());
}
/** 用给定源码里的**真桥字面量 + 真回执构造点**造桥。 */
function bridgeFrom(src, plugin) {
    const lit = bridgeLiteralOf(src);
    const receipt = blockOf(src, 'function repairReceipt(extra) {');
    const revOf = blockOf(src, 'function repairRevisionOf() {');
    assert.ok(lit, '桥对象字面量可提取');
    assert.ok(receipt, '回执构造点在位（回执形状必须来自真源码，不许测试里重写一份）');
    assert.ok(revOf, '修订取值口在位');
    const body = `${receipt}\n${revOf}\nreturn (${lit});`;
    return new Function('plugin', body)(plugin);
}

/** 真形状的派生件池宿主：六池各放一条能命中「苏晴」/「住老城」的条目。 */
function makePoolHost() {
    return {
        config: { config: { debugMode: false } },
        _repairState: null,
        _mutationEpoch: 0,
        summary: { getActiveSummaries: () => [{ floor: 3, text: '苏晴 搬家' }] },
        _eventThreadState: { events: [{ id: 'f7:action:abc', title: '苏晴 搬家那天的争执' }] },
        graph: { edges: new Map() },
        worldProg: { commitmentLedger: null },
        _factVersionState: { facts: [{ id: 'f1', subject: '苏晴', predicate: '住', value: '老城' }] },
        timeline: { entries: [] }
    };
}
function ctx() {
    const host = makePoolHost();
    const eng = engineFrom(idxSrc, RL);
    Object.assign(eng, host);
    const bridge = bridgeFrom(idxSrc, { engine: eng });
    return { host: eng, bridge };
}
/** 新鲜 ctx，且引擎的宿主池换成给定实现（负控制用）。 */
function ctxWith(src, rl) {
    const eng = engineFrom(src, rl);
    return { host: eng, bridge: bridgeFrom(src, { engine: eng }) };
}

const RECEIPT_KEYS = ['ok', 'reason', 'repairId', 'action', 'affected', 'total', 'revision', 'replayed', 'at'];
function assertReceiptShape(r, tag) {
    assert.deepEqual(Object.keys(r).slice().sort(), RECEIPT_KEYS.slice().sort(),
        tag + '：回执必须 9 键恒定（少一个键 = 失败分支与成功分支不同形）');
    assert.ok(Number.isFinite(r.at) && r.at > 0, tag + '：at 是时间戳');
    assert.ok(Array.isArray(r.affected), tag + '：affected 恒为数组');
    assert.ok(Number.isFinite(r.total) && Number.isFinite(r.revision), tag + '：total/revision 恒为数字');
}

/* ─────────────────────────── ① 预览只算不改 ─────────────────────────── */

test('v3215 1. preview 只算不改：调完预览，修复账逐字未动', () => {
    const c = ctx();
    assert.strictEqual(c.host._repairState, null, '起手没有修复账');
    const p1 = c.bridge.repair.preview({ action: 'revoke', subject: '苏晴', target: '住老城' });
    const p2 = c.bridge.repair.preview({ action: 'revoke', subject: '苏晴', target: '住老城' });
    assert.equal(p1.ok, true, '预览成功');
    assert.equal(p1.total, p1.affected.length, 'total 与 affected 一致');
    assert.ok(p1.total >= 1, '池里有命中项（否则这条判据是空转）');
    assert.equal(p1.replayed, false);
    assert.deepEqual(p1.affected, p2.affected, '两次预览逐条一致（纯函数）');
    assert.notStrictEqual(p1.affected, p2.affected, '两次预览不得回同一个数组引用（回的是副本）');
    assert.strictEqual(c.host._repairState, null, '预览之后仍然是「还没有修复账」——只算不改');
    assert.equal(c.host.repairRevision(), 0, '预览不推进修订号');
});

test('v3215 2. 预览与登记同一份判据、同一份清单（预览过 ⇒ 登记必过）', () => {
    const c = ctx();
    const inp = { action: 'retarget', subject: '苏晴', target: '林砚', to: '林砚' };
    const p = c.bridge.repair.preview(inp);
    const a = c.bridge.repair.apply(Object.assign({ idempotencyKey: 'k-same', expectRevision: 0 }, inp));
    assert.equal(p.ok, true);
    assert.equal(a.ok, true, '预览过了，登记也必须过（共用 validate，不是两处 if）');
    assert.deepEqual(
        a.affected.map(x => x.kind + ':' + x.key),
        p.affected.map(x => x.kind + ':' + x.key),
        '两边算出的 affected 逐条一致'
    );
    // 反面：非法入参两边也必须**同一个理由**（否则界面会出现「预览通过、点了没反应」）
    const badInp = { action: 'revoke', subject: '苏晴' };  // revoke 缺 target
    assert.equal(c.bridge.repair.preview(badInp).reason, 'missing-target');
    assert.equal(c.bridge.repair.apply(Object.assign({ idempotencyKey: 'k', expectRevision: 0 }, badInp)).reason, 'missing-target');
});

/* ─────────────────────────── ② 幂等（只按未放弃判重） ─────────────────────────── */

test('v3215 3. request 不给键时**本来就不幂等**——这正是桥强制注入键的理由', () => {
    const c = ctx();
    const inp = { action: 'revoke', subject: '苏晴', target: '住老城' };
    c.host.requestRepair(inp);
    c.host.requestRepair(inp);
    assert.equal(c.host._repairState.repairs.length, 2,
        '内部 API 缺 dedupeKey 时不做判重（旧行为逐字保留）⇒ 写入口必须比它严一档');
});

test('v3215 4. 同幂等键重放：不新增记录，交回同一条并标 replayed', () => {
    const c = ctx();
    const inp = { action: 'revoke', subject: '苏晴', target: '住老城' };
    const r1 = c.bridge.repair.apply(Object.assign({ idempotencyKey: 'k1', expectRevision: 0 }, inp));
    assert.equal(r1.ok, true);
    assert.equal(r1.replayed, false, '第一次是真登记');
    const r2 = c.bridge.repair.apply(Object.assign({ idempotencyKey: 'k1', expectRevision: 0 }, inp));
    assert.equal(r2.ok, true);
    assert.equal(r2.replayed, true, '重放必须如实标 replayed（不得与真写同形）');
    assert.equal(r2.repairId, r1.repairId, '交回的是同一条');
    assert.equal(c.host._repairState.repairs.length, 1, '重放不新增记录');
});

test('v3215 5. 放弃过的那次重试是**新意图**：必须能重新登记', () => {
    const c = ctx();
    const inp = { action: 'revoke', subject: '苏晴', target: '住老城' };
    const r1 = c.bridge.repair.apply(Object.assign({ idempotencyKey: 'k2', expectRevision: 0 }, inp));
    const ab = c.bridge.repair.abandon({ id: r1.repairId, expectRevision: 0 });
    assert.equal(ab.ok, true);
    assertReceiptShape(ab, 'abandon');
    const r3 = c.bridge.repair.apply(Object.assign({ idempotencyKey: 'k2', expectRevision: 0 }, inp));
    assert.equal(r3.ok, true);
    assert.equal(r3.replayed, false, '放弃后重试不得被旧记录挡住（否则「改主意」被永久锁死）');
    assert.notEqual(r3.repairId, r1.repairId, '是一条新记录');
    assert.equal(c.host._repairState.repairs.length, 2);
});

test('v3215 5b. 陈旧的 settle 不得落到新会话的同号记录上（切聊后 rp_1 与 rp_1 同号）', () => {
    // 场景：会话 A 里 rp_1 的落定请求在路上；切聊 / 回滚推进变更栅栏 → 会话 B 载入**自己那份账**
    //   （`_repairState` 来自该会话的存档），于是 B 那边也有一条 rp_1。
    //   若写面不校验修订，那条陈旧 settle 会把 B 的 rp_1 标成 done ——「落定成功了，落定的是别人的修复」。
    const c = ctx();
    const a = c.bridge.repair.apply({ action: 'revoke', subject: '苏晴', target: '住老城', idempotencyKey: 'ka', expectRevision: 0 });
    assert.equal(a.ok, true);
    const keysB = c.bridge.repair.preview({ action: 'retarget', subject: '苏晴', target: '林砚', to: '林砚' });
    assert.ok(keysB.total >= 1, '新代数的预览有命中项');
    // 切聊：栅栏推进 + 载入会话 B 自己的账（尚无记录）
    c.host._mutationEpoch = 1;
    c.host._repairState = null;
    const b = c.bridge.repair.apply({ action: 'retarget', subject: '苏晴', target: '林砚', to: '林砚', idempotencyKey: 'kb', expectRevision: 1 });
    assert.equal(b.ok, true, '新代数里照常可写（门上的是旧代数的请求，不是写入本身）');
    assert.equal(b.repairId, a.repairId, '★ 两条会话的同号是现实（各账自己的 seq）——正因如此才必须靠修订区分');
    // 旧代数发来的落定：必须被拒（否则它落到的是 B 那条同号记录）
    const stale = c.bridge.repair.settle({ id: a.repairId, key: keysB.affected[0].key, kind: keysB.affected[0].kind, status: 'done', expectRevision: 0 });
    assert.equal(stale.ok, false);
    assert.equal(stale.reason, 'revision-mismatch');
    assert.equal(stale.revision, 1, '回执回的是**当下**修订号');
    const rec = c.host._repairState.repairs.find(x => x.id === b.repairId);
    assert.equal(rec.status, 'open', '新会话那条记录必须仍是未落定（陈旧 settle 不得改它）');
    // 修正在修订号上的落定照常生效
    const fresh = c.bridge.repair.settle({ id: b.repairId, key: keysB.affected[0].key, kind: keysB.affected[0].kind, status: 'done', expectRevision: 1 });
    assert.equal(fresh.ok, true, '修订对表后照常落定');
});

/* ─────────────────────────── ③ 两道门（拒即不改账） ─────────────────────────── */

test('v3215 6. 门①缺幂等键即拒，且账不动', () => {
    const c = ctx();
    const base = { action: 'revoke', subject: '苏晴', target: '住老城', expectRevision: 0 };
    const r = c.bridge.repair.apply(base);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'missing-idempotency-key');
    assertReceiptShape(r, 'apply/missing-idempotency-key');
    const rEmpty = c.bridge.repair.apply(Object.assign({ idempotencyKey: '   ' }, base));
    assert.equal(rEmpty.reason, 'missing-idempotency-key', '空白键 = 没给键');
    assert.strictEqual(c.host._repairState, null, '被拒时账必须逐字未动');
});

test('v3215 7. 门②修订对不上表即拒（含缺省不得"恰好"通过），且账不动', () => {
    const c = ctx();
    const base = { action: 'revoke', subject: '苏晴', target: '住老城', idempotencyKey: 'k7' };
    const mismatch = c.bridge.repair.apply(Object.assign({ expectRevision: 7 }, base));
    assert.equal(mismatch.reason, 'revision-mismatch');
    assert.equal(mismatch.revision, 0, '被拒时回的是**当下**修订号');
    const missing = c.bridge.repair.apply(Object.assign({}, base));
    assert.equal(missing.reason, 'revision-mismatch', 'expectRevision 缺省不得被当成 0 而恰好通过');
    assert.strictEqual(c.host._repairState, null, '两次被拒之后账仍未动');
    // 栅栏推进（回滚/恢复/切聊）后，先前缓存下来的 expectRevision 必然失效
    c.host._mutationEpoch = 1;
    const stale = c.bridge.repair.apply(Object.assign({ expectRevision: 0 }, base));
    assert.equal(stale.reason, 'revision-mismatch', '旧代数的预览修订不得照写进新代数');
    assert.equal(stale.revision, 1, '回执回当下修订号（不是发起时那个）');
    c.host._mutationEpoch = 0;
    const fresh = c.bridge.repair.apply(Object.assign({ expectRevision: 0 }, base));
    assert.equal(fresh.ok, true, '修订对表后照常可写');
    assert.equal(fresh.revision, 0);
});

/* ─────────────────────────── ④ 回执形状恒定 + 面分离 ─────────────────────────── */

test('v3215 8. 成功/失败分支回执同形；模块缺席如实归因，不得伪装成"没有受影响项"', () => {
    const c = ctx();
    const okReceipt = c.bridge.repair.apply({ action: 'revoke', subject: '苏晴', target: '住老城', idempotencyKey: 'k8', expectRevision: 0 });
    assertReceiptShape(okReceipt, 'apply/成功');
    const okPrev = c.bridge.repair.preview({ action: 'revoke', subject: '苏晴', target: '住老城' });
    assertReceiptShape(okPrev, 'preview/成功');
    const badPrev = c.bridge.repair.preview({ action: 'teleport', subject: '苏晴' });
    assertReceiptShape(badPrev, 'preview/拒绝');
    assert.equal(badPrev.reason, 'unknown-action');
    const badSettle = c.bridge.repair.settle({ id: 'rp_none', expectRevision: 0 });
    assertReceiptShape(badSettle, 'settle/找不到');
    assert.equal(badSettle.reason, 'not-found');
    const okSettle = c.bridge.repair.settle({ id: okReceipt.repairId, key: okReceipt.affected[0].key, kind: okReceipt.affected[0].kind, status: 'done', expectRevision: 0 });
    assertReceiptShape(okSettle, 'settle/成功');
    assert.equal(okSettle.total, okReceipt.total, 'total 在各方法里语义一致（= 本条修复的派生件总数）');
    // settle / abandon 同样是写动作，同样必须过修订门（切聊后 rp_1 同号会落到别人的记录上）
    for (const m of ['settle', 'abandon']) {
        const noRev = c.bridge.repair[m]({ id: okReceipt.repairId });
        assert.equal(noRev.reason, 'revision-mismatch', m + ' 缺 expectRevision 必须拒');
        assertReceiptShape(noRev, m + '/缺修订');
        const staleRev = c.bridge.repair[m]({ id: okReceipt.repairId, expectRevision: 99 });
        assert.equal(staleRev.reason, 'revision-mismatch', m + ' 修订对不上表必须拒');
    }
    assert.equal(c.host._repairState.repairs[0].status, 'applied', '三次被拒不得改变账上状态');

    // 引擎不在位：如实说 engine-absent（而不是「ok:true, total:0」那种"看起来一切正常"）
    const noEng = bridgeFrom(idxSrc, {});
    const r = noEng.repair.apply({ action: 'revoke', subject: 's', target: 't', idempotencyKey: 'k', expectRevision: 0 });
    assert.equal(r.reason, 'engine-absent');
    assertReceiptShape(r, 'apply/engine-absent');
    assert.equal(noEng.repair.preview({ action: 'revoke', subject: 's', target: 't' }).reason, 'engine-absent');

    // 修复模块没挂：engine 在位但取库失败 ⇒ module-unavailable，且不得与「没有受影响项」同形
    const c2 = ctxWith(idxSrc, null);
    const r2 = c2.bridge.repair.preview({ action: 'revoke', subject: '苏晴', target: '住老城' });
    assert.equal(r2.ok, false);
    assert.equal(r2.reason, 'module-unavailable');
    assert.equal(r2.total, 0);
    assert.equal(r2.action, '', 'reason 之外不得凭空冒出动作名');
    assertReceiptShape(r2, 'preview/module-unavailable');
});

test('v3215 9. 写动作只收在唯一命名空间 repair 之下，且不扰动只读面', () => {
    const c = ctx();
    for (const k of ['requestRepair', 'settleRepair', 'abandonRepair', 'previewRepair', 'writeRepair']) {
        assert.ok(!(k in c.bridge), '写动作不得摊在桥顶层：' + k);
    }
    assert.ok(c.bridge.repair && typeof c.bridge.repair === 'object', '写面收在 repair 命名空间');
    for (const m of ['preview', 'apply', 'settle', 'abandon']) {
        assert.equal(typeof c.bridge.repair[m], 'function', 'repair.' + m + ' 在位');
    }
    // 只读面照旧：写一次之后 refresh 仍然五态可用
    const snap = () => ({ bridge: 'lonsha_memory_bridge_v1', floor: 1 });
    c.bridge.repair.apply({ action: 'revoke', subject: '苏晴', target: '住老城', idempotencyKey: 'k9', expectRevision: 0 });
    c.host.buildBridgeSnapshot = snap;
    assert.equal(c.bridge.sourceState, 'idle', '写面不碰来源态');
    assert.ok(c.bridge.refresh(), '只读面照常取数');
    assert.equal(c.bridge.sourceState, 'ready');
});

/* ─────────────────────────── ⑤ 负控制（真破坏必须现形） ─────────────────────────── */

function breakSource(src, from, to, tag) {
    const hits = src.split(from).length - 1;
    assert.equal(hits, 1, `[${tag}] 破坏锚点必须恰中 1 次（实 ${hits}）——中了 0 次或多次，破坏就不是定点的`);
    const out = src.split(from).join(to);
    assert.notEqual(out, src, `[${tag}] 破坏必须真的改变源码`);
    return out;
}
/** 把破坏后的 repair-loop 落到临时文件并载入（走真 require，不用替身）。 */
function loadRLFrom(src, tag) {
    /* [v3.226.0] 临时副本一律落 os.tmpdir()，**不许落仓根**：
     *   落仓根会在跑批期间往仓里丢文件，而本仓有多个「整仓镜像」测试（v3206 / v3225 / v3159…）
     *   正在 cpSync 整仓 —— 实测撞出 ENOENT（lstat 到一半、目录已被对方清掉），
     *   表现为「疑似环境资源耗尽（非判据失败）」并触发重试，其实是**自家测试互相踩**。
     *   另：文件挪到 tmpdir 后 require 仍走绝对路径（内部已 resolve），并显式删 cache key ——
     *   否则同一路径复用时拿到的是上一轮的模块。 */
    const p = path.join(os.tmpdir(), `.tmp_v3215_${tag}_${Date.now()}_${Math.random().toString(36).slice(2)}.js`);
    fs.writeFileSync(p, src, 'utf8');
    try {
        try { delete require.cache[require.resolve(p)]; } catch (e) { /* 首次无该项 */ }
        return require_(p);
    } finally {
        try { delete require.cache[require.resolve(p)]; } catch (e) { /* 已被清掉 */ }
        try { fs.unlinkSync(p); } catch (e) { /* 清理失败不影响判定 */ }
    }
}

/* 判据：正负控制**共用同一份**（不在负控制里另写一套断言） */
const JUDGE = {
    /** 缺幂等键必须拒（门①在位） */
    missingKeyGate(src, rl) {
        const c = ctxWith(src, rl);
        const r = c.bridge.repair.apply({ action: 'revoke', subject: '苏晴', target: '住老城', expectRevision: 0 });
        return r.ok === false && r.reason === 'missing-idempotency-key';
    },
    /** 放弃后重试必须是新登记（幂等只按"未放弃"判重） */
    abandonThenRetry(src, rl) {
        const c = ctxWith(src, rl);
        const inp = { action: 'revoke', subject: '苏晴', target: '住老城', idempotencyKey: 'kx', expectRevision: 0 };
        const r1 = c.bridge.repair.apply(inp);
        c.bridge.repair.abandon({ id: r1.repairId, expectRevision: 0 });
        const r3 = c.bridge.repair.apply(inp);
        return r3.ok === true && r3.replayed === false && r3.repairId !== r1.repairId;
    },
    /** 回执形状恒定（9 键，含 revision） */
    receiptShape(src, rl) {
        const c = ctxWith(src, rl);
        const ok = c.bridge.repair.apply({ action: 'revoke', subject: '苏晴', target: '住老城', idempotencyKey: 'ks', expectRevision: 0 });
        const bad = c.bridge.repair.apply({ action: 'revoke', subject: '苏晴', target: '住老城', expectRevision: 0 });
        const shape = (r) => Object.keys(r).slice().sort().join(',') === RECEIPT_KEYS.slice().sort().join(',');
        return shape(ok) && shape(bad) && bad.ok === false;
    },
    /** 陈旧 settle（旧代数）必须被拒，且不得改到新代数那条同号记录 */
    staleSettleBlocked(src, rl) {
        const c = ctxWith(src, rl);
        const a = c.bridge.repair.apply({ action: 'revoke', subject: '苏晴', target: '住老城', idempotencyKey: 'ka', expectRevision: 0 });
        if (a.ok !== true) return false;
        const kb = c.bridge.repair.preview({ action: 'retarget', subject: '苏晴', target: '林砚', to: '林砚' });
        if (!kb.affected.length) return false;
        c.host._mutationEpoch = 1;
        c.host._repairState = null;   // 会话 B 载入自己的账
        const b = c.bridge.repair.apply({ action: 'retarget', subject: '苏晴', target: '林砚', to: '林砚', idempotencyKey: 'kb', expectRevision: 1 });
        if (b.ok !== true || b.repairId !== a.repairId) return false;
        const stale = c.bridge.repair.settle({ id: a.repairId, key: kb.affected[0].key, kind: kb.affected[0].kind, status: 'done', expectRevision: 0 });
        const rec = c.host._repairState.repairs.find(x => x.id === b.repairId);
        return stale.ok === false && stale.reason === 'revision-mismatch' && !!rec && rec.status === 'open';
    }
};

test('v3215 10. 负控制：四处真破坏必须在同一套判据上各自现形（不许互相掩护）', () => {
    // 原版上三条判据必须全部为真，否则下面的"变红"说明不了任何事
    for (const name of Object.keys(JUDGE)) {
        assert.equal(JUDGE[name](idxSrc, RL), true, `原版：判据 ${name} 必须为真`);
    }

    // N1 破坏：门①的守卫被短路 ⇒ 缺键不再被拒（会掉到门②，reason 变成 revision-mismatch）
    const n1 = breakSource(idxSrc,
        "if (!String(i.idempotencyKey == null ? '' : i.idempotencyKey).trim()) {",
        'if (false) {', 'N1');
    assert.equal(JUDGE.missingKeyGate(n1, RL), false, 'N1：门①被拆掉后，缺键拦截必须现形');

    // N2 破坏：幂等判重丢掉「未放弃」限定 ⇒ 放弃后重试被旧记录挡住（"改主意"被永久锁死）
    const n2 = breakSource(rlSrc,
        "r.dedupeKey === dedupeKey && r.status !== 'abandoned'",
        'r.dedupeKey === dedupeKey', 'N2');
    assert.equal(JUDGE.abandonThenRetry(idxSrc, loadRLFrom(n2, 'n2')), false, 'N2：丢掉未放弃限定后必须现形');

    // N3 破坏：回执构造点漏掉 revision 键 ⇒ 失败分支与成功分支不再同形
    const n3 = breakSource(idxSrc,
        'revision: Number.isFinite(e.revision) ? e.revision : 0,',
        '', 'N3');
    assert.equal(JUDGE.receiptShape(n3, RL), false, 'N3：回执漏键后形状判据必须现形');

    // N4 破坏：settle 的修订门被短路 ⇒ 旧代数的落定会落到新代数的同号记录上。
    //   锚点必须带上 settle 独有的上一行注释：`if (i.expectRevision == null || ...)` 这一行
    //   在 settle 与 abandon 各出现一次，裸行锚点不唯一（拆一处而另一处还在，判定就被掩护住了）。
    const n4 = breakSource(idxSrc,
        "宁可拒，不可错位写入。\n                const nowRev = repairRevisionOf();\n                if (i.expectRevision == null || Number(i.expectRevision) !== nowRev) {",
        '宁可拒，不可错位写入。\n                const nowRev = repairRevisionOf();\n                if (false) {', 'N4');
    assert.equal(JUDGE.staleSettleBlocked(n4, RL), false, 'N4：settle 修订门被拆后必须现形');

    // 破坏副本自证：破坏确实改了行为（不是"改了源码但读的还是旧值"）。
    //   N1 拆掉门①之后，这一下缺键写入**真的落账了**（门②此刻恰好通过：expectRevision 0 === 修订 0）
    //   —— 这正是「必须拒的动作被执行了」，比断言某个 reason 更硬。
    const n1c = ctxWith(n1, RL);
    const r = n1c.bridge.repair.apply({ action: 'revoke', subject: '苏晴', target: '住老城', expectRevision: 0 });
    assert.equal(r.ok, true, 'N1 自证：门①被拆掉后，缺幂等键的写入确实被执行（行为已改变）');
    assert.notStrictEqual(n1c.host._repairState, null, 'N1 自证：账上确实多了一条本不该登记的记录');
});

test('v3215 11. 工具自证：锚点不存在 / 不唯一 / 同值替换必须抛', () => {
    assert.throws(() => breakSource(idxSrc, 'const THIS_ANCHOR_NEVER_EXISTS = 1;', 'x', 'ghost'),
        /恰中 1 次/, '锚点不存在必须抛');
    assert.throws(() => breakSource(idxSrc, 'return null;', 'return undefined;', 'multi'),
        /恰中 1 次/, '锚点不唯一必须抛');
    assert.throws(() => breakSource(idxSrc, 'window.lonsha_memory_bridge_v1 = {', 'window.lonsha_memory_bridge_v1 = {', 'noop'),
        /必须真的改变源码/, '同值替换（没真破坏）必须抛');
});

/* ─────────────────────────── ⑦ 版本与发布卫生 ─────────────────────────── */

test('v3215 13. 三源同源且不低于出生版本；CHANGELOG 顶节就是本版', () => {
    const man = JSON.parse(fs.readFileSync(path.join(R, 'manifest.json'), 'utf8'));
    const pkg = JSON.parse(fs.readFileSync(path.join(R, 'package.json'), 'utf8'));
    const v = (/const VERSION = '([0-9.]+)'/.exec(idxSrc) || [])[1];
    assert.ok(v, '取到版本真值');
    const vnum = (s) => { const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(String(s)); return m ? +m[1] * 1e6 + +(m[2] || 0) * 1e3 + +(m[3] || 0) : NaN; };
    assert.equal(man.version, v, `manifest(${man.version}) 与 index.js(${v}) 漂移`);
    assert.equal(pkg.version, v, `package.json(${pkg.version}) 与 index.js(${v}) 漂移`);
    assert.ok(vnum(v) >= vnum('3.214.0'), '版本不得低于本套件出生版本 3.214.0');
    const top = (fs.readFileSync(path.join(R, 'CHANGELOG.md'), 'utf8').match(/^## (v[0-9.]+)/m) || [])[1];
    assert.equal(top, 'v' + v, `CHANGELOG 顶节(${top})应是本版`);
});

test('v3215 12. 写入面与宿主方法都落在真类体内（放错作用域会静默改变可见性）', () => {
    const at = idxSrc.indexOf('class MemoryEngine {');
    assert.ok(at > 0, '找得到 MemoryEngine 类');
    const cls = braceBlock(idxSrc, idxSrc.indexOf('{', at));
    assert.ok(cls && cls.length > 1000, '取到类体');
    for (const m of HOST_METHODS) assert.ok(cls.includes(m), '类体内有 ' + m);
    // 反向：桥与回执构造点必须在类**外**（它们是模块作用域的对外面，不是引擎方法）
    assert.ok(!cls.includes('window.lonsha_memory_bridge_v1 = {'), '桥不得被挪进类体');
    assert.ok(!cls.includes('function repairReceipt(extra) {'), '回执构造点不得被挪进类体');
    // 取库口仍在模块作用域（v3194 已立的纪律：取库口不进类体）
    assert.ok(!cls.includes('function _repairLoopLib()'), '取库口不得被搬进类体');
});
