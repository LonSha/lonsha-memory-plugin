/* ============================================================
 * tests/v3443_l13_x8_round_snapshot.test.mjs — v3.443.0
 * ------------------------------------------------------------
 * L13-X8 · 本轮生成的可撤销快照 —— 「这一轮到底新塞进了哪些条目」+ 只回滚新增。
 *
 * 【真实现场（本版起点，读码可复算）】
 *   本仓能「撤」的只有一种：`row.revoke` 撤的是**证据裁决**（那条结论作废）；
 *   `snapshot-checkpoint` 做的是**整份载荷**级检查点（取个名字存下来、整份对照）。
 *   中间那一层是空的：一轮生成可能往图谱加 3 个节点、往锁定事实加 1 条，
 *   用户发现「这轮抽错了」时只能去各面对着手删，或者整份回滚（把同轮正确写入一起吞掉）。
 *   于是「这轮加错了」与「整份都废了」被压成同一种处置。
 *
 * 【本档钉住的七件事】
 *   A  指纹与 id：指纹只出 {len, head, tail, h}（**不存第二条正文副本**）；
 *      id 只认白名单键，取不到就是 null（不按索引对齐装成「按 id 对齐了」）。
 *   B  采集三态：拿不到账 ⇒ ok:false + reason（absent≠empty）；无 id 单列 skippedNoId；
 *      超上限置 truncatedOnto（不静默丢）。
 *   C  对拍三类：added / removed / modified；`unknown-fingerprint` **既不等于改过、
 *      也不等于没改**，必须单列成自己的 why（拿不到判据不等于证伪）。
 *   D  记录与四态：同一轮 before/after **共享同一个 seq**（一对一号）；
 *      采集不成**拒绝记假快照**；no-round / half-round / ok / undone 四态互不同形。
 *   E  撤销：confirm 是硬门槛（缺 / false / 字符串 'true' 全拒）；**只删 added**，
 *      removed 不动、modified 保留改后值（逐字）；没有删除口的账 skipped 单列。
 *   F  真源码破坏三条（各配原版对照）：撤销顺手回退修改 / 指纹里塞正文 / 半对当全对。
 *   G  接线面 + 当版锚 v3.443.0（vnum 形）。
 *
 * 【两条纪律（本仓反复付过学费）】
 *   1. 判据切片一律用**真实锚点 + 唯一性自证**，锚点不唯一时判据自己先红。
 *   2. 负控制一律「真源码破坏 → 加载破坏副本 → 在副本上重跑同一条判据」；
 *      判据函数**不引用**锚点串（避免自我指涉的假绿）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakSource } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const KER_SRC = read('round-entry-snapshot.js');
const DIAG_SRC = read('engine-diagnostic-lines.js');
const HOST_SRC = read('index.js');
const UI_SRC = read('settings-ui.js');
const MANIFEST = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));

// ── 锚点（文件头声明一次；判据函数**不**引用这些串） ──────────────────────
const A_MOD_PUSH = "res.modified.push({ ledger: k, id: id, why: cmp === false ? 'content-changed' : 'unknown-fingerprint' });";
const A_FP_HEAD = '            head: s.slice(0, 24),';
const A_HALF = 'if (pair.missing.length) {';
const at = (hay, needle) => hay.indexOf(needle);
const occ = (hay, needle) => hay.split(needle).length - 1;
/** 切片；并**自证锚点唯一**（不唯一直接红，不许取第一个了事）。 */
function seg(hay, start, end, label) {
    const n = occ(hay, start);
    assert.equal(n, 1, '切片锚点必须唯一（' + (label || start.slice(0, 30)) + '），实际出现 ' + n + ' 次');
    const s = at(hay, start);
    if (end == null) return hay.slice(s);
    const e = hay.indexOf(end, s + start.length);
    assert.ok(e > s, '终点锚点必须在起点之后：' + String(end).slice(0, 40));
    return hay.slice(s, e);
}
/**
 * 加载内核（**真源码**；传入破坏副本时加载的就是破坏副本）。
 *
 * ★ 为什么用 `new Function` 而不是 `vm.runInNewContext`（实测教训）：
 *   vm 造的是**另一个 realm**，沙箱内的 `Array.prototype` / `Object.prototype`
 *   与主 realm 不同；`assert.deepEqual` 是含原型的严格深比，于是
 *   `['f1','f2']` 会被判成不等于 `['f1','f2']` —— 六条判据集体假红，
 *   红的全在夹具上，要测的东西（字段集合 / 三类归属 / 只删 added）其实都是对的。
 *   new Function 与调用方同 realm，源码仍是磁盘上那一份（不是伪造内核）。
 */
function loadKernel(src = KER_SRC) {
    const mod = { exports: {} };
    const win = {};
    const fn = new Function('module', 'exports', 'window', 'globalThis', src);
    fn(mod, mod.exports, win, win);
    const api = mod.exports;
    assert.ok(api && typeof api.collectSummary === 'function', '内核必须导出 collectSummary（加载失败）');
    return api;
}
/** 一本账：{key, list}。 */
const ledger = (key, arr) => ({ key, list: () => arr });

// ═══════════════════════════════════════════════════════════════════════
// A 组：指纹与 id —— 不存正文副本，不猜条目身份
// ═══════════════════════════════════════════════════════════════════════
test('A1: 指纹只有 {len, head, tail, h} 四个字段，且不含正文副本', () => {
    const RS = loadKernel();
    const body = '甲乙丙丁'.repeat(500);           // 2000 字
    const fp = RS.fingerprintOf({ id: 'x', text: body });
    assert.deepEqual(Object.keys(fp).sort(), ['h', 'head', 'len', 'tail'],
        '指纹字段集合必须恰为 len/head/tail/h（多一个字段就可能是正文副本）');
    assert.equal(fp.len, 2000, 'len 必须是正文长度');
    assert.equal(fp.head.length, 24, 'head 只留前 24 字');
    assert.equal(fp.tail.length, 24, 'tail 只留后 24 字');
    /* ★ 这条是本面的立身之本：复制正文等于绕开各账 owner 另建一份真源，之后两边不再同步。 */
    assert.ok(JSON.stringify(fp).length < 200,
        '指纹序列化后必须很短（实 ' + JSON.stringify(fp).length + ' 字节）—— 存整段正文会远大于此');
    const mid = body.slice(900, 940);
    assert.ok(JSON.stringify(fp).indexOf(mid) < 0, '正文中段不得出现在指纹里');
});

test('A2: fpEqual 三态 —— 拿不到指纹既不算改过、也不算没改', () => {
    const RS = loadKernel();
    const a = RS.fingerprintOf({ id: 'x', text: '张三取走了账本' });
    const b = RS.fingerprintOf({ id: 'x', text: '张三取走了账本' });
    const c = RS.fingerprintOf({ id: 'x', text: '张三取走了银两' });
    assert.equal(RS.fpEqual(a, b), true, '同内容 ⇒ true');
    assert.equal(RS.fpEqual(a, c), false, '同长度不同内容 ⇒ false（head/tail/h 任一不同都算改过）');
    assert.equal(a.len, c.len, '上面那条必须建立在「长度相同」上，否则它只是靠 len 分辨的');
    assert.equal(RS.fpEqual(a, null), 'unknown-fingerprint', '缺一侧指纹 ⇒ unknown-fingerprint');
    assert.equal(RS.fpEqual(null, null), 'unknown-fingerprint');
    /* ★ 三态纪律：'unknown-fingerprint' 与 false 必须不同值，否则「比过、不一样」和
     *   「根本没比」在下游同形，一次采集失败会被读成「这些条目都改过」。 */
    assert.notEqual(RS.fpEqual(a, null), false);
});

test('A3: idOf 只认白名单键；取不到就是 null（不按索引对齐）', () => {
    const RS = loadKernel();
    assert.equal(RS.idOf({ id: 'f1' }), 'f1');
    assert.equal(RS.idOf({ uid: 'u2' }), 'u2');
    assert.equal(RS.idOf({ key: 'k3' }), 'k3');
    assert.equal(RS.idOf({ factId: 7 }), '7', '数字 id 须转成字符串（同一 id 在两侧必须同一形）');
    assert.equal(RS.idOf({ text: '没有 id 的条目' }), null);
    assert.equal(RS.idOf(['f1']), null, '数组不是条目（不许拿下标当 id）');
    assert.equal(RS.idOf(null), null);
    assert.equal(RS.idOf({ id: '   ' }), null, '空白 id 等于没有 id');
});

// ═══════════════════════════════════════════════════════════════════════
// B 组：采集三态 —— absent ≠ empty，截断必须自报
// ═══════════════════════════════════════════════════════════════════════
test('B1: 拿不到账 ⇒ ok:false + reason；账是空的 ⇒ ok:true + 计数 0（两者不同形）', () => {
    const RS = loadKernel();
    assert.equal(RS.collectSummary(null).ok, false);
    assert.equal(RS.collectSummary([]).ok, false);
    assert.equal(RS.collectSummary([]).reason, 'no-ledgers');
    assert.equal(RS.collectSummary([{ key: '', list: () => [] }]).ok, false,
        'key 为空串的账不可用（否则所有条目会挤进同一格）');
    assert.equal(RS.collectSummary([{ key: 'a' }]).ok, false, '没有 list 的账不可用');
    const thrown = RS.collectSummary([{ key: 'boom', list: () => { throw new Error('x'); } }]);
    assert.equal(thrown.ok, false, 'list 抛异常时整份采集不可用（不许当成「0 条」）');
    assert.match(String(thrown.reason), /ledger-unreadable:boom/, '理由必须点名是哪本账读不出');
    /* ★ 真正的「空」：ok:true + counts 0 —— 与上面的 ok:false 形状完全不同。 */
    const empty = RS.collectSummary([ledger('facts', [])]);
    assert.equal(empty.ok, true);
    assert.deepEqual(empty.counts, { facts: 0 });
    assert.equal(empty.ledgerCount, 1);
});

test('B2: 没有 id 的条目单列 skippedNoId，不混进 entries', () => {
    const RS = loadKernel();
    const r = RS.collectSummary([ledger('facts', [
        { id: 'f1', text: 'a' }, { text: '无 id' }, { id: 'f2', text: 'b' },
    ])]);
    assert.equal(r.ok, true);
    assert.deepEqual(r.entries.facts.map((e) => e.id), ['f1', 'f2'], '只收有 id 的');
    assert.equal(r.skippedNoId, 1, '被跳过的那条必须计数（静默丢弃会让「本轮新增」少算）');
    assert.equal(r.counts.facts, 2);
});

test('B3: 超过上限置 truncatedOnto（截断自报，不静默丢）', () => {
    const RS = loadKernel();
    const many = Array.from({ length: RS.MAX_ENTRIES_PER_LEDGER + 37 }, (_, i) => ({ id: 'f' + i, text: 't' + i }));
    const r = RS.collectSummary([ledger('big', many)]);
    assert.equal(r.ok, true);
    assert.equal(r.counts.big, RS.MAX_ENTRIES_PER_LEDGER, '只记前 MAX_ENTRIES_PER_LEDGER 条');
    assert.equal(r.truncatedOnto.big, true, '截断必须自报（静默截断会让「本轮新增」凭空少算）');
    /* 对照：没超上限时不得留下 truncatedOnto 痕迹。 */
    const small = RS.collectSummary([ledger('small', many.slice(0, 3))]);
    assert.deepEqual(small.truncatedOnto, {}, '未截断时不许报截断');
});

// ═══════════════════════════════════════════════════════════════════════
// C 组：对拍三类 —— unknown-fingerprint 单列
// ═══════════════════════════════════════════════════════════════════════
test('C1: added / removed / modified 三类精确，modified.why = content-changed', () => {
    const RS = loadKernel();
    const mk = (arr) => RS.collectSummary([ledger('facts', arr)]);
    const before = mk([{ id: 'f1', text: '甲' }, { id: 'f2', text: '乙' }]);
    const after = mk([{ id: 'f1', text: '甲' }, { id: 'f2', text: '乙乙' }, { id: 'f3', text: '丙' }]);
    const d = RS.diffSummaries(before, after);
    assert.equal(d.ok, true);
    assert.deepEqual(d.added, [{ ledger: 'facts', id: 'f3' }], '新增只认 f3');
    assert.deepEqual(d.removed, [], '没删任何条目');
    assert.deepEqual(d.modified, [{ ledger: 'facts', id: 'f2', why: 'content-changed' }],
        'f2 内容变了（f1 逐字未动，不该出现在任何一类里）');
    assert.deepEqual(d.counts, { added: 1, removed: 0, modified: 1 });
    /* 反向：删条目必须单独进 removed。 */
    const back = RS.diffSummaries(after, before);
    assert.deepEqual(back.removed, [{ ledger: 'facts', id: 'f3' }]);
});

test('C2: 缺指纹的条目单列 unknown-fingerprint（不许当成 content-changed）', () => {
    const RS = loadKernel();
    /* 手工构造摘要：after 那侧的 fp 缺失（模拟采集到一半断了）。 */
    const before = { ok: true, entries: { facts: [{ id: 'f1', fp: RS.fingerprintOf({ text: 'a' }) }] }, counts: { facts: 1 } };
    const after = { ok: true, entries: { facts: [{ id: 'f1', fp: null }] }, counts: { facts: 1 } };
    const d = RS.diffSummaries(before, after);
    assert.equal(d.counts.modified, 1);
    assert.equal(d.modified[0].why, 'unknown-fingerprint',
        '拿不到指纹 ≠ 内容变了（把没比过的读成「改过」会让待复核清单掺进假条目）');
    /* ★ 三态：它也不许出现在 added / removed 里（那两条是「确定发生了」）。 */
    assert.equal(d.counts.added, 0);
    assert.equal(d.counts.removed, 0);
});

test('C3: 对拍是纯读 —— 两份摘要逐字不变', () => {
    const RS = loadKernel();
    const mk = (arr) => RS.collectSummary([ledger('facts', arr)]);
    const before = mk([{ id: 'f1', text: '甲' }]);
    const after = mk([{ id: 'f1', text: '乙' }, { id: 'f2', text: '丙' }]);
    const snap = JSON.stringify([before, after]);
    RS.diffSummaries(before, after);
    RS.diffSummaries(before, after);
    assert.equal(JSON.stringify([before, after]), snap, '对拍两次后两份摘要必须逐字不变');
});

// ═══════════════════════════════════════════════════════════════════════
// D 组：记录 + 四态
// ═══════════════════════════════════════════════════════════════════════
test('D1: 同一轮 before/after 共享同一个 seq（一对一号），下一轮才 +1', () => {
    const RS = loadKernel();
    const engine = {};
    const mk = (arr) => RS.collectSummary([ledger('facts', arr)]);
    const b1 = RS.recordSnapshot(engine, { phase: 'before', summary: mk([{ id: 'f1', text: 'a' }]) });
    const a1 = RS.recordSnapshot(engine, { phase: 'after', summary: mk([{ id: 'f1', text: 'a' }, { id: 'f2', text: 'b' }]) });
    /* ★ 修前实测后果：before=1 / after=2，而面板与 roundUndoState 报的是 after.seq ——
     *   用户会看到「第 2 轮」而实际只跑过一轮。 */
    assert.equal(b1.seq, 1);
    assert.equal(a1.seq, 1, '同一轮的 after 必须复用 before 的 seq（实 ' + a1.seq + '）');
    const b2 = RS.recordSnapshot(engine, { phase: 'before', summary: mk([{ id: 'f1', text: 'a' }]) });
    assert.equal(b2.seq, 2, '下一轮的 before 才 +1');
    assert.equal(engine._roundSnapshots.length, 3);
});

test('D2: 采集不成 ⇒ 拒绝记假快照；phase 非法 / 无 engine 各自拒绝', () => {
    const RS = loadKernel();
    const engine = {};
    const r = RS.recordSnapshot(engine, { phase: 'before', summary: { ok: false, reason: 'no-ledgers' } });
    assert.equal(r.ok, false);
    assert.equal(r.writes, false);
    assert.match(String(r.reason), /summary-unavailable:no-ledgers/);
    /* ★ 关键：一条快照都不许落下 —— 记了就等于宣布「本轮新增 0 条」这个编出来的结论。 */
    assert.equal(engine._roundSnapshots, undefined, '采集失败时不许在引擎上留任何快照槽位');
    assert.equal(RS.recordSnapshot(engine, { phase: 'mid', summary: { ok: true } }).reason, 'phase-invalid');
    assert.equal(RS.recordSnapshot(null, { phase: 'before', summary: { ok: true } }).reason, 'engine-absent');
    /* 环上限：连记 20 条后只留 MAX_ROUNDS 条。 */
    for (let i = 0; i < 20; i++) RS.recordSnapshot(engine, { phase: 'before', summary: { ok: true, entries: {}, counts: {}, ledgerCount: 1 } });
    assert.equal(engine._roundSnapshots.length, RS.MAX_ROUNDS, '快照环只留最近 MAX_ROUNDS 轮');
});

test('D3: 三态 half-round 点名缺哪半；一对都没有才是 no-round', () => {
    const RS = loadKernel();
    const engine = {};
    const mk = (arr) => RS.collectSummary([ledger('facts', arr)]);
    const none = RS.roundUndoState(engine);
    assert.equal(none.state, 'no-round');
    assert.deepEqual(none.missing, ['before', 'after']);
    assert.equal(none.ok, true, '「没有」是可用面的一种状态，不是不可用');
    RS.recordSnapshot(engine, { phase: 'before', summary: mk([{ id: 'f1', text: 'a' }]) });
    const half = RS.roundUndoState(engine);
    assert.equal(half.state, 'half-round', '只有 before ⇒ half-round（采集断在半路）');
    assert.deepEqual(half.missing, ['after'], '必须点名缺的是 after');
    assert.match(String(half.reason), /half-round:after/);
    assert.notEqual(half.state, none.state, '「半对」与「一对都没有」不许同形');
});

test('D4: undone 第四态 —— 撤过的那一轮不许再报「可撤」，也不许装成「本来就没有」', () => {
    const RS = loadKernel();
    const engine = {};
    let facts = [{ id: 'f1', text: 'a' }];
    const mk = () => RS.collectSummary([ledger('facts', facts)]);
    RS.recordSnapshot(engine, { phase: 'before', summary: mk() });
    facts = [{ id: 'f1', text: 'a' }, { id: 'f2', text: 'b' }];
    RS.recordSnapshot(engine, { phase: 'after', summary: mk() });
    const rem = { facts: (id) => { const i = facts.findIndex((x) => x.id === id); if (i < 0) return false; facts.splice(i, 1); return true; } };
    assert.equal(RS.undoRound(engine, { confirm: true, removers: rem }).ok, true);
    const st = RS.roundUndoState(engine);
    assert.equal(st.state, 'undone', '撤过 ⇒ undone（修前这个标志只被写、从不被读）');
    assert.equal(st.reason, 'already-undone');
    assert.equal(st.counts.added, 0, '已撤 ⇒ 不得再报可撤条数');
    assert.ok(st.undoneAt > 0, '必须留下撤销时间（面板要答「刚才撤的是哪一轮」）');
    /* 重放必须被拒，且理由与「没有可撤」不同形。 */
    const again = RS.undoRound(engine, { confirm: true, removers: rem });
    assert.equal(again.ok, false);
    assert.equal(again.reason, 'already-undone');
    assert.equal(again.writes, false);
});

// ═══════════════════════════════════════════════════════════════════════
// E 组：撤销 —— confirm 硬门槛，只删 added
// ═══════════════════════════════════════════════════════════════════════
test('E1: confirm 是硬门槛 —— 缺 / false / 字符串 "true" 全拒且账一条未动', () => {
    const RS = loadKernel();
    const engine = {};
    let facts = [{ id: 'f1', text: 'a' }];
    const mk = () => RS.collectSummary([ledger('facts', facts)]);
    RS.recordSnapshot(engine, { phase: 'before', summary: mk() });
    facts = [{ id: 'f1', text: 'a' }, { id: 'f2', text: 'b' }];
    RS.recordSnapshot(engine, { phase: 'after', summary: mk() });
    let touched = 0;
    const rem = { facts: (id) => { touched++; const i = facts.findIndex((x) => x.id === id); if (i < 0) return false; facts.splice(i, 1); return true; } };
    for (const payload of [{ removers: rem }, { removers: rem, confirm: false }, { removers: rem, confirm: 'true' }, { removers: rem, confirm: 1 }]) {
        const r = RS.undoRound(engine, payload);
        assert.equal(r.ok, false, '未确认就必须拒绝（payload: ' + JSON.stringify(payload.confirm) + '）');
        assert.equal(r.reason, 'confirm-required');
    }
    assert.equal(touched, 0, '★ 未确认时连删除口都不许调 —— 误点一次就抹掉整轮写入');
    assert.equal(facts.length, 2);
    /* 反向对照：给了 confirm 才真的动。 */
    assert.equal(RS.undoRound(engine, { confirm: true, removers: rem }).counts.removed, 1);
});

test('E2: 只删 added —— removed 不动、modified 保留改后值（逐字）', () => {
    const RS = loadKernel();
    const engine = {};
    let facts = [{ id: 'f1', text: '原句' }, { id: 'f2', text: '会被删的' }];
    const mk = () => RS.collectSummary([ledger('facts', facts)]);
    RS.recordSnapshot(engine, { phase: 'before', summary: mk() });
    /* 本轮：f1 改了内容、f2 删了、f3 新增。 */
    facts = [{ id: 'f1', text: '改后的句子' }, { id: 'f3', text: '新加的' }];
    RS.recordSnapshot(engine, { phase: 'after', summary: mk() });
    const rem = { facts: (id) => { const i = facts.findIndex((x) => x.id === id); if (i < 0) return false; facts.splice(i, 1); return true; } };
    const st = RS.roundUndoState(engine);
    assert.deepEqual(st.added, [{ ledger: 'facts', id: 'f3', undoable: true }]);
    assert.equal(st.modified[0].id, 'f1');
    assert.equal(st.modified[0].undoable, false, 'modified 恒不可撤');
    assert.equal(st.modified[0].pendingReview, true, 'modified 只标待复核');
    assert.equal(st.removed[0].why, 'content-not-kept', 'removed 不可撤：正文未留，撤回来等于编造');
    const r = RS.undoRound(engine, { confirm: true, removers: rem });
    assert.equal(r.ok, true);
    assert.deepEqual(r.removed, [{ ledger: 'facts', id: 'f3' }], '只删了新增的 f3');
    assert.deepEqual(facts.map((x) => x.id), ['f1'], 'f2 不该被「找回来」');
    assert.equal(facts[0].text, '改后的句子', '★ f1 必须保留改后值 —— 回退修改会吞掉别的动作');
});

test('E3: 没有删除口的账 skipped 单列；删失败 ⇒ failed + partial（不静默算成功）', () => {
    const RS = loadKernel();
    const engine = {};
    let a = [{ id: 'a1', text: 'x' }];
    let b = [{ id: 'b1', text: 'y' }];
    const mk = () => RS.collectSummary([ledger('alpha', a), ledger('beta', b)]);
    RS.recordSnapshot(engine, { phase: 'before', summary: mk() });
    a = [{ id: 'a1', text: 'x' }, { id: 'a2', text: 'x2' }];
    b = [{ id: 'b1', text: 'y' }, { id: 'b2', text: 'y2' }];
    RS.recordSnapshot(engine, { phase: 'after', summary: mk() });
    /* 只给 alpha 的删除口，且 a2 删得掉、b 没入口。 */
    const rem = { alpha: (id) => { const i = a.findIndex((x) => x.id === id); if (i < 0) return false; a.splice(i, 1); return true; } };
    const r = RS.undoRound(engine, { confirm: true, removers: rem });
    assert.equal(r.counts.removed, 1);
    assert.equal(r.counts.skipped, 1, '没有删除口的账必须 skipped 单列（静默丢会让用户以为撤干净了）');
    assert.equal(r.skipped[0].why, 'no-remover');
    assert.equal(b.length, 2, 'beta 一条都没动');
    /* 删不掉的账 ⇒ failed + partial，ok:false。 */
    const engine2 = {};
    let c = [{ id: 'c1', text: 'z' }];
    const mk2 = () => RS.collectSummary([ledger('gamma', c)]);
    RS.recordSnapshot(engine2, { phase: 'before', summary: mk2() });
    c = [{ id: 'c1', text: 'z' }, { id: 'c2', text: 'z2' }];
    RS.recordSnapshot(engine2, { phase: 'after', summary: mk2() });
    const r2 = RS.undoRound(engine2, { confirm: true, removers: { gamma: () => false } });
    assert.equal(r2.ok, false);
    assert.equal(r2.reason, 'partial');
    assert.equal(r2.counts.failed, 1);
    assert.equal(r2.counts.removed, 0);
});

test('E4: 本轮没有新增 ⇒ nothing-to-undo，与「撤成功」不同形', () => {
    const RS = loadKernel();
    const engine = {};
    const facts = [{ id: 'f1', text: 'a' }];
    const mk = () => RS.collectSummary([ledger('facts', facts)]);
    RS.recordSnapshot(engine, { phase: 'before', summary: mk() });
    RS.recordSnapshot(engine, { phase: 'after', summary: mk() });
    const r = RS.undoRound(engine, { confirm: true, removers: { facts: () => true } });
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'nothing-to-undo');
    assert.equal(r.writes, false, '没写任何东西（与「撤成功」的 writes:true 不同形）');
    assert.equal(r.counts.removed, 0);
});

test('E5: [L14-O1] partial 撤销重试 —— 只标已撤 id，failed/skipped 可重试，撤完最后一粒才 undone', () => {
    const RS = loadKernel();
    /* 场景 A：两本账，alpha 有删除口、beta 没有 ⇒ 首撤 removed=1 / skipped=1，且不得 undone。 */
    const engine = {};
    let a = [{ id: 'a1', text: 'x' }];
    let b = [{ id: 'b1', text: 'y' }];
    const mk = () => RS.collectSummary([ledger('alpha', a), ledger('beta', b)]);
    RS.recordSnapshot(engine, { phase: 'before', summary: mk() });
    a = [{ id: 'a1', text: 'x' }, { id: 'a2', text: 'x2' }];
    b = [{ id: 'b1', text: 'y' }, { id: 'b2', text: 'y2' }];
    RS.recordSnapshot(engine, { phase: 'after', summary: mk() });
    const remA = { alpha: (id) => { const i = a.findIndex((x) => x.id === id); if (i < 0) return false; a.splice(i, 1); return true; } };
    const r1 = RS.undoRound(engine, { confirm: true, removers: remA });
    assert.equal(r1.ok, true, '只有 skipped 没有 failed ⇒ 不算失败（E3 口径：partial 仅指 failed）');
    assert.equal(r1.counts.removed, 1);
    assert.equal(r1.counts.skipped, 1);
    /* ★ 核心判据：partial 后不得整轮 undone —— 剩余 id 必须仍可撤。 */
    const st1 = RS.roundUndoState(engine);
    assert.equal(st1.state, 'ok', 'partial 后必须仍报 ok（实 ' + st1.state + ' + ' + (st1.reason || '') + '）');
    assert.equal(st1.counts.added, 1, '剩余可撤必须恰 1 条（beta 的 b2）');
    assert.deepEqual(st1.added.map((x) => x.id), ['b2'], '已撤的 a2 不许再出现在清单里');
    /* 补上 beta 删除口后重试：撤掉 b2 ⇒ 才整轮 undone。 */
    const remB = { beta: (id) => { const i = b.findIndex((x) => x.id === id); if (i < 0) return false; b.splice(i, 1); return true; } };
    const r2 = RS.undoRound(engine, { confirm: true, removers: remB });
    assert.equal(r2.ok, true);
    assert.equal(r2.counts.removed, 1, '重试只撤剩余的 b2，不重放 a2');
    assert.deepEqual(b.map((x) => x.id), ['b1'], 'b2 真从账上消失');
    const st2 = RS.roundUndoState(engine);
    assert.equal(st2.state, 'undone', '撤完最后一粒才 undone');
    assert.equal(st2.reason, 'already-undone');
    /* 场景 B：failed 同样不吞可撤性。 */
    const engine2 = {};
    let c = [{ id: 'c1', text: 'z' }];
    const mk2 = () => RS.collectSummary([ledger('gamma', c)]);
    RS.recordSnapshot(engine2, { phase: 'before', summary: mk2() });
    c = [{ id: 'c1', text: 'z' }, { id: 'c2', text: 'z2' }];
    RS.recordSnapshot(engine2, { phase: 'after', summary: mk2() });
    let refuse = true;
    const r3 = RS.undoRound(engine2, { confirm: true, removers: { gamma: () => !refuse } });
    assert.equal(r3.reason, 'partial');
    assert.equal(r3.counts.failed, 1);
    const st3 = RS.roundUndoState(engine2);
    assert.equal(st3.state, 'ok', 'failed 后仍可重试（实 ' + st3.state + '）');
    assert.equal(st3.counts.added, 1);
    refuse = false;
    const r4 = RS.undoRound(engine2, { confirm: true, removers: { gamma: (id) => { const i = c.findIndex((x) => x.id === id); if (i < 0) return false; c.splice(i, 1); return true; } } });
    assert.equal(r4.ok, true, '修好原因后重试必须成功（修前会撞 already-undone）');
    assert.equal(RS.roundUndoState(engine2).state, 'undone');
});

test('E6: [L14-O1] 全撤成功语义不变 —— 一次撤完直接 undone（D4/H3 场景的补充口径）', () => {
    const RS = loadKernel();
    const engine = {};
    let facts = [{ id: 'f1', text: 'a' }];
    const mk = () => RS.collectSummary([ledger('facts', facts)]);
    RS.recordSnapshot(engine, { phase: 'before', summary: mk() });
    facts = [{ id: 'f1', text: 'a' }, { id: 'f2', text: 'b' }, { id: 'f3', text: 'c' }];
    RS.recordSnapshot(engine, { phase: 'after', summary: mk() });
    const rem = { facts: (id) => { const i = facts.findIndex((x) => x.id === id); if (i < 0) return false; facts.splice(i, 1); return true; } };
    const r = RS.undoRound(engine, { confirm: true, removers: rem });
    assert.equal(r.ok, true);
    assert.equal(r.counts.removed, 2, '本轮新增恰 2 条（f2/f3；f1 是轮前就有的）');
    const st = RS.roundUndoState(engine);
    assert.equal(st.state, 'undone', '全撤成功 ⇒ undone（与修前一致）');
    assert.equal(st.undoneAt > 0, true, 'undoneAt 必须留下');
    const again = RS.undoRound(engine, { confirm: true, removers: rem });
    assert.equal(again.reason, 'already-undone');
});


/** 在破坏副本上重跑「撤销只删新增、改过的保留改后值」这条判据。 */
function judgeUndoKeepsModified(RS) {
    const bad = [];
    const engine = {};
    let facts = [{ id: 'f1', text: '原句' }];
    const mk = () => RS.collectSummary([ledger('facts', facts)]);
    RS.recordSnapshot(engine, { phase: 'before', summary: mk() });
    facts = [{ id: 'f1', text: '改后的句子' }, { id: 'f3', text: '新加的' }];
    RS.recordSnapshot(engine, { phase: 'after', summary: mk() });
    const rem = { facts: (id) => { const i = facts.findIndex((x) => x.id === id); if (i < 0) return false; facts.splice(i, 1); return true; } };
    RS.undoRound(engine, { confirm: true, removers: rem });
    const f1 = facts.find((x) => x.id === 'f1');
    if (!f1) bad.push('改过的条目被一起撤掉了（回退修改吞掉了别的动作）');
    else if (f1.text !== '改后的句子') bad.push('改过的条目被改回旧值了：' + f1.text);
    return bad;
}
/** 在破坏副本上重跑「指纹里不许有正文副本」这条判据。 */
function judgeNoBodyCopy(RS) {
    const bad = [];
    const body = '甲乙丙丁'.repeat(500);
    const fp = RS.fingerprintOf({ id: 'x', text: body });
    if (!fp) return ['指纹不可用'];
    if (fp.head.length > 24) bad.push('head 超过 24 字（疑似整段正文进快照）');
    if (fp.tail.length > 24) bad.push('tail 超过 24 字');
    if (JSON.stringify(fp).length >= 200) bad.push('指纹体积过大（' + JSON.stringify(fp).length + ' 字节）');
    const mid = body.slice(900, 940);
    if (JSON.stringify(fp).indexOf(mid) >= 0) bad.push('正文中段出现在指纹里');
    return bad;
}
/** 在破坏副本上重跑「半对不许当全对」这条判据。 */
function judgeHalfRound(RS) {
    const bad = [];
    const engine = {};
    const mk = () => RS.collectSummary([ledger('facts', [{ id: 'f1', text: 'a' }])]);
    RS.recordSnapshot(engine, { phase: 'before', summary: mk() });
    const st = RS.roundUndoState(engine);
    if (st.state !== 'half-round') bad.push('只有 before 时状态为 ' + st.state + '（半对被当成了别的形态）');
    if (!(st.missing || []).includes('after')) bad.push('没有点名缺 after');
    return bad;
}

test('F1: 负控制① 撤销顺手回退（把 modified 也一起删）→ 判据必红（原版对照必绿）', () => {
    assert.deepEqual(judgeUndoKeepsModified(loadKernel()), [], '原版：撤销只删新增这条判据必须绿');
    const broken = breakSource(KER_SRC, A_MOD_PUSH,
        "res.modified.push({ ledger: k, id: id, why: 'content-changed' }); res.added.push({ ledger: k, id: id });", 'x8_n1');
    const r = judgeUndoKeepsModified(loadKernel(broken));
    assert.ok(r.length > 0, '把 modified 也删掉后判据必须翻红，实得 ' + JSON.stringify(r));
    assert.ok(r.some((x) => /改过|一起撤/.test(x)), '必须点名「改过的条目被动了」');
});

test('F2: 负控制② 指纹里塞正文 → 判据必红（原版对照必绿）', () => {
    assert.deepEqual(judgeNoBodyCopy(loadKernel()), [], '原版：不存正文副本这条判据必须绿');
    const broken = breakSource(KER_SRC, A_FP_HEAD, '            head: s,', 'x8_n2');
    const r = judgeNoBodyCopy(loadKernel(broken));
    assert.ok(r.length > 0, '指纹塞进整段正文后判据必须翻红，实得 ' + JSON.stringify(r));
    assert.ok(r.some((x) => /正文|体积/.test(x)));
});

test('F3: 负控制③ 半对当全对（删掉 missing 分支）→ 判据必红（原版对照必绿）', () => {
    assert.deepEqual(judgeHalfRound(loadKernel()), [], '原版：半对判据必须绿');
    const broken = breakSource(KER_SRC, A_HALF, 'if (false) {', 'x8_n3');
    const r = judgeHalfRound(loadKernel(broken));
    assert.ok(r.length > 0, '半对被当成全对后判据必须翻红，实得 ' + JSON.stringify(r));
});

// ═══════════════════════════════════════════════════════════════════════
// G 组：接线面 + 当版锚
// ═══════════════════════════════════════════════════════════════════════
test('G1: 内核入册 manifest.extra_js（恰一处）+ 零依赖双导出', () => {
    const ej = MANIFEST.extra_js || [];
    assert.equal(ej.filter((x) => x === 'round-entry-snapshot.js').length, 1,
        '内核必须登记进 extra_js 恰一次（否则消费台账会判未登记孤儿）');
    assert.ok(ej.length >= 248, '登记后模块总数应 ≥ 248（实 ' + ej.length + '）');
    assert.ok(KER_SRC.includes('module.exports = api'), 'CJS 导出必须在（node 侧判据靠它加载）');
    assert.ok(KER_SRC.includes('LonShaRoundEntrySnapshot'), '浏览器侧全局名必须在（宿主取库口按它取）');
});

test('G2: 宿主接线 —— 取库口 / libs 注入 / 五桩 / 两清单；摘要与增量如实不给删除口', () => {
    assert.equal(occ(HOST_SRC, 'function _roundSnapshotLib() {'), 1, '取库口必须恰一处');
    assert.equal(occ(HOST_SRC, '_roundSnapshotLib: _roundSnapshotLib,'), 1, 'libs 注入必须恰一处');
    assert.equal(occ(HOST_SRC, '_roundLedgers() {'), 1, '账本清单口必须恰一处');
    assert.equal(occ(HOST_SRC, '_roundRemovers() {'), 1, '删除口清单必须恰一处');
    for (const name of ['roundSnapshotBefore', 'roundSnapshotAfter', 'roundUndoState', 'roundUndo', '_roundUndoLine']) {
        assert.equal(occ(HOST_SRC, name + '(...args) {'), 1, '宿主转发桩必须恰一处：' + name);
    }
    /* 五本账必须在场。 */
    for (const k of ['lockedFacts', 'graphNodes', 'graphEdges', 'summaries', 'deltas']) {
        assert.ok(HOST_SRC.includes("key: '" + k + "'"), '账本清单必须纳入 ' + k);
    }
    /* ★ 如实不给删除口的两本：删摘要会牵动卷/折叠账；DeltaBook 是 append-only。 */
    const rm = seg(HOST_SRC, '        _roundRemovers() {', '        exportMigratePack(opts) {', 'removers');
    assert.ok(!/map\.summaries\s*=/.test(rm), '摘要账不许给删除口（删摘要会牵动卷/折叠账）');
    assert.ok(!/map\.deltas\s*=/.test(rm), '正史增量账不许给删除口（append-only）');
    /* 删图谱节点后必须清 nameIndex，否则「删了节点却还能按名字查到」。 */
    assert.ok(/rebuildNameIndex/.test(rm), '删节点后必须 rebuildNameIndex');
    /* 宿主不 splice 别人的数组（一律走各账自己的方法）。 */
    assert.ok(!/\.splice\(/.test(rm), '宿主不许 splice 各账的数组（那是绕开 owner）');
    assert.ok(/removeLockedFact/.test(rm), '锁定事实必须走 memory-core 自己的 removeLockedFact');
});

test('G3: 面板接线 —— 按钮与绑定成对，二次确认真上门，撤销后 oplog 留一条', () => {
    assert.equal(occ(UI_SRC, 'data-round-undo'), 2,
        'data-round-undo 必须恰两处（渲染一处 + 绑定一处；少一处就是「按钮在、点了没反应」）');
    assert.ok(UI_SRC.includes('const roundUndoHtml = '), '面板必须真算这一段');
    assert.ok(/window\.confirm\(/.test(seg(UI_SRC, "ov.querySelectorAll('[data-round-undo]')", null, 'undo-bind')),
        '绑定里必须问二次确认');
    assert.ok(UI_SRC.includes('confirm: true'), 'confirm 必须真传给宿主（面板确认 + 内核硬门槛，两层）');
    assert.ok(UI_SRC.includes("s.opLog?.log('rollback', 'undo-round'"), '撤销后必须在审计链留一条');
    /* 四态措辞必须在场（不可用 / 半对 / 撤过 / 可撤）。 */
    for (const t of ["ru.ok !== true", 'half-round', "ru.state === 'undone'", 'data-round-undo="1"']) {
        assert.ok(UI_SRC.includes(t), '面板必须处理这一态：' + t);
    }
});

test('G4: 诊断层 —— 取库口 / 四出口 / 四态措辞 / api 冻结表已挂', () => {
    assert.equal(occ(DIAG_SRC, 'function _roundSnapshotLib() {'), 1, '诊断层取库口必须恰一处');
    for (const name of ['roundSnapshotBefore', 'roundSnapshotAfter', 'roundUndoState', 'roundUndo', '_roundUndoLine']) {
        assert.ok(new RegExp('function ' + name + '\\(engine').test(DIAG_SRC), '诊断层必须定义 ' + name);
    }
    /* undo 侧「先判 confirm 再读账」：确认之前不去读账（读也算一次动作）。 */
    const ur = seg(DIAG_SRC, 'function roundUndo(engine, payload) {', 'function _roundUndoLine(engine) {', 'roundUndo');
    const iConfirm = ur.indexOf('confirm-required');
    /* 盯**调用点**（带左括号），不是 `typeof RS.undoRound !== 'function'` 那句取库检查 ——
     *   取库可用性本来就该早于 confirm 判定，把它算进来会把自己的判据钉错位置。 */
    const iState = ur.indexOf('RS.undoRound(engine, p)');
    assert.ok(iConfirm > 0 && iState > iConfirm, '必须先判 confirm 再读账（confirm 判定要早于调用内核）');
    /* 四态措辞互不同形。 */
    const line = seg(DIAG_SRC, 'function _roundUndoLine(engine) {', 'function _silenceListLine(engine) {', '_roundUndoLine');
    for (const t of ['不可用', 'no-round', 'half-round', "state === 'undone'", '只标待复核，不回退']) {
        assert.ok(line.includes(t), '诊断行必须处理这一态：' + t);
    }
    /* api 冻结表已挂五个出口（缺一个，宿主取不到）。 */
    const apiFace = DIAG_SRC.split('var api = Object.freeze({')[1] || '';
    for (const name of ['roundSnapshotBefore', 'roundSnapshotAfter', 'roundUndoState', 'roundUndo', '_roundUndoLine']) {
        assert.ok(new RegExp('\\b' + name + ',?\\s').test(apiFace), 'api 冻结表必须挂 ' + name);
    }
});

test('G5: 出生版本下界锚点（vnum 形，守卫认得这一形）—— 当版锚已交棒 v3445 档', () => {
    /* ★ [v3.445.0 接管] 历史文件锁回**自己的出生版本**（交棒链口径，同 v3440 X7-G 先例）。
     *   改前形态是 `const CUR = '3.443.0'` + 四处 assert.equal(live, CUR)，
     *   抬到 3.444.0 当天就红 —— 这不是产品缺陷，是历史档案把「当版」写死成「永恒当版」的欠账。
     *   现状：下界 = 出生版本 3.443.0（本档不得低于它），上界 = 「不承诺高于现版」；
     *   当版锚的职责已交棒给当版档案 tests/v3445_l13_x5_migrate_pack.test.mjs 的 G5。 */
    const BORN_V = '3.443.0';
    const vnum = (v) => {
        const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(v || '').trim());
        return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
    };
    assert.equal(vnum(BORN_V), 3443000, '出生版本锚（vnum 形）：3.443.0 ⇒ 3443000');
    const live = (/const VERSION = '([0-9]+[.][0-9]+[.][0-9]+)'/.exec(HOST_SRC) || [])[1];
    assert.equal(live, MANIFEST.version, 'index.js VERSION 与 manifest 必须互等（实 ' + live + ' / ' + MANIFEST.version + '）');
    assert.equal(MANIFEST.version, PKG.version, 'manifest 与 package 必须互等');
    /* 上界：不承诺未来（现版可以更高，但不得低于本档出生版本）。 */
    assert.ok(vnum(live) >= vnum(BORN_V), '当版不得低于本档出生版本 ' + BORN_V + '（实 ' + live + '）');
    /* 内核版本串同样走下界形（round 内核生于 3.443.0，此后允许抬升）。 */
    const kernV = (/var VERSION = '([0-9]+[.][0-9]+[.][0-9]+)'/.exec(KER_SRC) || [])[1];
    assert.ok(vnum(kernV) >= vnum(BORN_V), '内核版本不得低于本档出生版本（实 ' + kernV + '）');
    /* 本档专有标记在场。 */
    assert.ok(KER_SRC.includes('L13-X8'), '内核必须留 L13-X8 标记');
    assert.ok(DIAG_SRC.includes('L13-X8'), '诊断层必须留 L13-X8 标记');
});

// ═══════════════════════════════════════════════════════════════════════
// H 组：收尾两处真缺陷 —— 门禁全绿时仍存在，只能靠真跑抓
// ═══════════════════════════════════════════════════════════════════════
/** 从 index.js 抽出真源码块（不抄一份：抄的那份会与真实现漂移）。 */
function hostBlock(startMark, endMark) {
    const i = HOST_SRC.indexOf(startMark);
    assert.ok(i >= 0, '找不到起始锚：' + startMark);
    const j = HOST_SRC.indexOf(endMark, i);
    assert.ok(j >= 0, '找不到结束锚：' + endMark);
    return HOST_SRC.slice(i, j);
}
function makeLedgerFn(block, name) {
    const body = block.replace('        ' + name + '() {', 'function ' + name + '() {');
    // 方法体内自带 `const self = this;` ⇒ 用 .call(host) 提供 this。
    return new Function('host', body + '\nreturn ' + name + '.call(host);');
}
/** 宿主替身：账的形状照 memory-core / memory-ledgers 真实现（不是编的）。 */
function mkHost() {
    return {
        summary: {
            lockedFacts: [{ id: 'lf_old', text: '主角姓林', floor: 1, createdAt: 1 }],
            summaries: [{ floor: 1, text: '开场：雨夜入城', level: 1, timestamp: 1, folded: false }],
            getLockedFacts() { return this.lockedFacts; },
            addLockedFact(text, floor) {
                const id = 'lf_' + String(text).slice(0, 4) + '_' + floor;
                this.lockedFacts.push({ id, text, floor, createdAt: Date.now() });
                return id;
            },
            removeLockedFact(id) {
                const b = this.lockedFacts.length;
                this.lockedFacts = this.lockedFacts.filter((f) => f.id !== id);
                return this.lockedFacts.length < b;
            },
        },
        graph: {
            nodes: new Map([['node_old', { id: 'node_old', name: '旧人' }]]),
            // 边也给一条：空账会让「有这本账」与「这本账采不到条目」读成同一件事。
            edges: new Map([['edge_old', { id: 'edge_old', from: 'node_old', to: 'node_old', label: '同类' }]]),
            rebuildNameIndex() { this.reb = (this.reb || 0) + 1; },
        },
        deltaBook: {
            deltas: [{ summary: '入城', status: 'established', evidenceFloor: 1, timestamp: 1 }],
            export() { return { deltas: this.deltas }; },
        },
    };
}

test('H1: 真源码采集 —— 五本账每本都采到条目且 skippedNoId=0（防两本无 id 账永远撤不到）', () => {
    const RS = loadKernel();
    const block = hostBlock('        _roundLedgers() {', '\n        _roundRemovers() {');
    const host = mkHost();
    const ledgers = makeLedgerFn(block, '_roundLedgers')(host);
    assert.equal(ledgers.length, 5, '账本清单必须恰五本');
    const s = RS.collectSummary(ledgers);
    assert.equal(s.ok, true, '采集必须成功（reason=' + s.reason + '）');
    assert.equal(s.ledgerCount, 5, '五本账必须都可读');
    /* ★ 这一条是本组存在的理由：行里没有 id 键的账会被全判 skippedNoId，
     *   于是「采集成功」但「这两本一条也采不到」—— 面板显示新增 0 条，像这轮没写入。 */
    assert.equal(s.skippedNoId, 0,
        '不许有任何行因取不到 id 被跳过（实测修前 summaries+deltas 共 4 行全跳过）：实 ' + s.skippedNoId);
    for (const k of ['lockedFacts', 'graphNodes', 'graphEdges', 'summaries', 'deltas']) {
        assert.ok(s.counts[k] > 0, '这本账必须真采到条目：' + k + '（实 ' + s.counts[k] + '）');
    }
    /* 投影必须是**位置键**：摘要 id 由 floor 合成，正史增量 id 由 (evidenceFloor, summary) 合成。
     *   且注释必须写明它不是账内核发的 id，否则后来者会拿它当主键用。 */
    assert.ok(block.includes("'sum_' + String(s && s.floor)"), '摘要必须投影出位置键 sum_<floor>');
    assert.ok(block.includes("'delta_' + String((d && d.evidenceFloor) || 0)"), '增量必须投影出位置键 delta_<floor>_<前16字>');
    assert.ok(block.includes('位置键'), '注释必须写明这是位置键而非账内核发的 id');
});
test('H2: 零调用点 —— before/after 必须在生成链路里被真调用（不是只有定义与转发桩）', () => {
    /* ★ 修前这两个出口在宿主、诊断层、api 冻结表、面板里全都"挂着"，
     *   但全仓零调用 —— 门禁只看声明，看不见"从不调用"，于是永远绿。 */
    assert.equal(occ(HOST_SRC, 'this.roundSnapshotBefore({'), 1, 'before 必须在生成链路里真调用恰一次');
    assert.equal(occ(HOST_SRC, 'this.roundSnapshotAfter({'), 1, 'after 必须在生成链路里真调用恰一次');
    /* 位置：必须夹在 applyExtractedPayload 两侧（写入前/写入后），不能跑到别处去。 */
    const iB = HOST_SRC.indexOf('this.roundSnapshotBefore({');
    const iCall = HOST_SRC.indexOf('await this.applyExtractedPayload(extracted, message, {');
    const iA = HOST_SRC.indexOf('this.roundSnapshotAfter({');
    assert.ok(iB > 0 && iCall > iB && iA > iCall,
        '次序必须是 before → applyExtractedPayload → after（实 ' + iB + ' / ' + iCall + ' / ' + iA + '）');
    /* 两条都快照，失败不得连坐记忆写入：整块必须各包 try/catch。 */
    const segB = HOST_SRC.slice(HOST_SRC.lastIndexOf('try {', iB), iB);
    assert.ok(segB.includes('try {'), 'before 必须包 try（采集失败不得连坐记忆写入）');
    /* before 没记成时不许补记 after：只有半对才是"采集断在半路"的如实读数。 */
    const segA = HOST_SRC.slice(iCall, iA + 400);
    assert.ok(/ok === true/.test(segA), 'after 侧必须看 before 是否记成才记（不许凭空补一个 after）');
});
test('H3: 真跑一轮 —— before → 写入 3 条 → after → 撤销（同一套真账本清单与删除口）', () => {
    const RS = loadKernel();
    const host = mkHost();
    const lBlock = hostBlock('        _roundLedgers() {', '\n        _roundRemovers() {');
    /* [v3.445.0 接管] 终点锚原为 roundSnapshotBefore(...args) {，本版在其前插入了迁移包三桩，
    抽块终点随接线面同步前移到新桩起点，抽取的仍是 _roundRemovers 单方法体。 */
    const rBlock = hostBlock('        _roundRemovers() {', '\n        exportMigratePack(opts) {');
    const ledgers = () => makeLedgerFn(lBlock, '_roundLedgers')(host);
    const removers = () => makeLedgerFn(rBlock, '_roundRemovers')(host);

    const before = RS.collectSummary(ledgers());
    assert.equal(before.ok, true, 'before 采集必须成功');
    const rB = RS.recordSnapshot(host, { phase: 'before', floor: 5, summary: before });
    assert.equal(rB.ok, true, 'before 必须记成');

    /* 本轮新塞进 3 条 + 改 1 条。 */
    host.summary.addLockedFact('护卫队解散', 5);
    host.summary.addLockedFact('主角左手有旧伤', 5);
    host.graph.nodes.set('node_new', { id: 'node_new', name: '林砚' });
    host.summary.summaries[0] = { ...host.summary.summaries[0], text: '开场：雨夜入城（修订）' };

    const after = RS.collectSummary(ledgers());
    const rA = RS.recordSnapshot(host, { phase: 'after', floor: 5, summary: after });
    assert.equal(rA.seq, rB.seq, '同一轮的 before/after 必须共享同一个 seq（一对一号）');

    const st = RS.roundUndoState(host);
    assert.equal(st.state, 'ok', '应读到可撤（实 ' + st.state + '）');
    assert.equal(st.counts.added, 3, '必须认出恰 3 条新增（实 ' + st.counts.added + '）');
    assert.equal(st.counts.modified, 1, '必须认出恰 1 条改过（实 ' + st.counts.modified + '）');

    const undo = RS.undoRound(host, { confirm: true, removers: removers() });
    assert.equal(undo.ok, true, '撤销必须成功（reason=' + undo.reason + '）');
    assert.equal(undo.counts.removed, 3, '必须撤掉恰 3 条');
    assert.deepEqual(host.summary.lockedFacts.map((f) => f.id), ['lf_old'], '三条新增必须真从账上消失、旧条目一条未动');
    assert.ok(!host.graph.nodes.has('node_new'), '图谱节点必须真删掉');
    assert.ok(host.graph.nodes.has('node_old'), '旧图谱节点不许被连坐');
    assert.equal(host.summary.summaries[0].text, '开场：雨夜入城（修订）', '改过的条目保持改后值（不回退）');
    assert.ok((host.graph.reb || 0) >= 1, '删节点后必须 rebuildNameIndex');

    const st2 = RS.roundUndoState(host);
    assert.equal(st2.state, 'undone', '撤完必须报已撤过（不许装成「还有 3 条可撤」）');
    const undo2 = RS.undoRound(host, { confirm: true, removers: removers() });
    assert.equal(undo2.reason, 'already-undone', '二次撤销必须被拒');
    assert.equal(host.summary.lockedFacts.length, 1, '二次撤销必须零副作用');
});
test('H4: 删除口与清单一一对应 —— 删除口的键都在清单内，且恰两本如实无删除口', () => {
    const host = mkHost();
    const lBlock = hostBlock('        _roundLedgers() {', '\n        _roundRemovers() {');
    /* [v3.445.0 接管] 终点锚原为 roundSnapshotBefore(...args) {，本版在其前插入了迁移包三桩，
    抽块终点随接线面同步前移到新桩起点，抽取的仍是 _roundRemovers 单方法体。 */
    const rBlock = hostBlock('        _roundRemovers() {', '\n        exportMigratePack(opts) {');
    const keys = makeLedgerFn(lBlock, '_roundLedgers')(host).map((l) => l.key);
    const rm = makeLedgerFn(rBlock, '_roundRemovers')(host);
    const rmKeys = Object.keys(rm);
    /* 删除口的键必须都在清单里（给出清单之外的删除口 = 删一本不在面内的账）。 */
    for (const k of rmKeys) {
        assert.ok(keys.includes(k), '删除口给了清单外的账：' + k);
    }
    /* 恰两本如实无删除口，且必须正是这两本（理由见 G2：删摘要牵动卷/折叠账、DeltaBook append-only）。 */
    const noRemover = keys.filter((k) => !rmKeys.includes(k));
    assert.deepEqual(noRemover.sort(), ['deltas', 'summaries'], '恰两本如实无删除口（实 ' + noRemover.join(',') + '）');
    /* 每个删除口都必须是函数，且**不给**的账不许偷偷在别处删。 */
    for (const k of rmKeys) assert.equal(typeof rm[k], 'function', '删除口必须是函数：' + k);
});

