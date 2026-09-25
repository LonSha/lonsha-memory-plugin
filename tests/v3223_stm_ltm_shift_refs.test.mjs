/* ============================================================
 * tests/v3223_stm_ltm_shift_refs.test.mjs — [v3.222.0] Gate R3-E
 *
 * 版本锚点（v3.222.0）：本套件恰好锚着它自己的出生版本，供版本守卫 V4 取基准。
 *
 * 主题：**短期长期记忆（stm-ltm）在「前移」这条路径上的脱钩**。
 *
 * 背景：删楼那一侧早就有级联清理（`removeByFloors`，v3.170 还修过它「只摘 span」
 *   的谎），而前移那一侧**从来没有** —— `ledger-replay.js` 的登记表里
 *   `stm-ltm` 这一项的 `shift` 写死为 `null`，于是：
 *     · 删掉第 5 楼后执行「前移 5」，`unconsolidated_stm[].floor` 里的 8 仍是 8（应为 7）、
 *       `stm_entries[].floors` 里的 8 仍是 8、`ltm_entries[].span` 一格不动；
 *     · 回放报告报 `no-op / shifted 0`，**不报错也不留痕**；
 *     · 而宿主 `SHIFT_FACE_LABELS` 这张逐面诊断标签表里，明写着 stm-ltm 对应
 *       「短期长期记忆位移」—— 诊断面**声称它会前移**。两处都在源码里，读者会各信一份。
 *   这是本仓 v3.170 在**同一个文件**上治过的同族形态（注释声称摘 span、实现从未碰 span）
 *   的**登记表版本**。
 *   三类引用都是持久化权威数据（`chatMetadata.extensions.LonShaMemory.stmLtm`），
 *   楼层错位既不报错也不留痕：`recallView` 只被测试消费，`selfReport` 只聚合 loss 计数。
 *   更糟的是既有判据把这个例外**白名单化**了（`scan_v3190` / `v3190` / `v3182` 三处），
 *   而「按楼层集合整体摘除、无单点位移语义」这个理由不成立 ——
 *   `unconsolidated_stm[].floor` 就是单点楼层号。
 *
 * 层次：A 数据层（三类引用各自可对账）
 *       B 前移跟随（单点 / 集合 / 区间 + 与游标账本解耦）
 *       C 登记表接线（真参与前移 + 回放报告 + 覆盖度 + 全表无例外）
 *       D 不落 loss / 不写回计数 / 摘要不清
 *       E 边界（非有限数 / 旧模块退路 / 宿主不手抄第二份 / 乱输入）
 *       F 负控制前置（原版对照）
 *       G 自述一致（标签表与登记表对齐 + 版本锚）
 *       N 负控制（真源码破坏 → 破坏副本 → 同款真判据必须转红）
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
// 剥注释助手走**唯一真源**（tests/_audit_lib.mjs，v3.191.0 收敛；E1 结构判据守住）：
//   本地再写一份会被 scan_audit_lib_consolidation 点名（那正是它要治的「同一条口径多份实现」）。
import { stripComments } from './_audit_lib.mjs';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const SM_PATH = path.join(REPO, 'stm-ltm.js');
const LR_PATH = path.join(REPO, 'ledger-replay.js');
const IDX_PATH = path.join(REPO, 'index.js');
const SM = require(SM_PATH);
const LR = require(LR_PATH);
const smSrc = fs.readFileSync(SM_PATH, 'utf8');
const lrSrc = fs.readFileSync(LR_PATH, 'utf8');
const idxSrc = fs.readFileSync(IDX_PATH, 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));
function vnum(s) {
    const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
    return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}
// 形态判据一律做在代码上、不做在注释散文上（注释里提到旧写法不得误报）：
//   剥注释由唯一真源 `stripComments` 提供（等长占位、偏移不变，且认字符串 / 正则字面量）。

/** 夹具：三类楼层引用各就位（单点 / 集合 / 区间）。 */
function fixture() {
    const s = SM.normalizeState(null);
    s.unconsolidated_stm = [
        { id: 'raw_1_2', text: '甲', msg_id: 2, floor: 2, ts: 1 },
        { id: 'raw_2_5', text: '乙', msg_id: 5, floor: 5, ts: 2 },
        { id: 'raw_3_8', text: '丙', msg_id: 8, floor: 8, ts: 3 }
    ];
    s.stm_entries = [{ id: 'stm_1', text: 't', msg_ids: [3, 6, 9], floors: [3, 6, 9], ts: 4, score: 0 }];
    s.ltm_entries = [{ id: 'ltm_1', summary: 's', from_stm_ids: ['stm_1'], ts: 5, span: { from: 3, to: 9 } }];
    return s;
}
function floorsOf(st) { return st.unconsolidated_stm.map((e) => e.floor); }
function stmFloors(st) { return st.stm_entries[0].floors.slice(); }
function hostOf(st) { return { stmLtm: SM, _stmLtmState: st }; }
function itemOf(rep, id) { return rep.items.find((x) => x.id === id); }

/** 标签表解析：宿主 SHIFT_FACE_LABELS 的 id 列表（剥注释后的真源码文本）。 */
function labelOwners() {
    const m = /SHIFT_FACE_LABELS = Object\.freeze\(\{([\s\S]*?)\}\);/.exec(stripComments(idxSrc));
    if (!m) return { ids: [], missing: ['（标签表不可读）'], noShift: [] };
    const ids = [...m[1].matchAll(/(?:'([^']+)'|([A-Za-z][A-Za-z0-9-]*))\s*:/g)].map((x) => x[1] || x[2]);
    const byId = new Map(LR.FLOOR_OWNERS.map((o) => [o.id, o]));
    return {
        ids,
        missing: ids.filter((i) => !byId.has(i)),
        noShift: ids.filter((i) => byId.has(i) && typeof byId.get(i).shift !== 'function')
    };
}

// ══════════ A 数据层：三类引用各自可对账 ══════════
test('【A1】★ 三类楼层引用都在数据层：单点 / 集合 / 区间各有一处（漏一类就留幽灵楼层号）', () => {
    const st = fixture();
    assert.deepEqual(floorsOf(st), [2, 5, 8], '单点：unconsolidated_stm 里的 floor');
    assert.deepEqual(stmFloors(st), [3, 6, 9], '集合：stm_entries 里的 floors');
    assert.deepEqual([st.ltm_entries[0].span.from, st.ltm_entries[0].span.to], [3, 9], '区间：ltm_entries 里的 span');
    assert.equal(typeof SM.shiftFloorRefs, 'function', '★ 模块必须导出 shiftFloorRefs（前移侧的唯一入口）');
});

test('【A2】★ 导出面只增不换：既有键一个不动（含 removeByFloors）', () => {
    for (const k of ['ingest', 'consolidate', 'removeByFloors', 'shiftFloorRefs', 'reextract', 'recallView', 'selfReport']) {
        assert.equal(typeof SM[k], 'function', '导出面缺 ' + k);
    }
    assert.equal(Object.keys(SM).filter((k) => k === 'shiftFloorRefs').length, 1, 'shiftFloorRefs 恰一次');
});

test('【A3】★ 楼层集合由待巩固片段派生（不是手抄清单）：consolidate 产出的 floors 与 msg_ids 同源', async () => {
    let s = SM.normalizeState(null);
    s = SM.ingest(s, [{ text: '甲', msg_id: 2, floor: 2 }, { text: '乙', msg_id: 5, floor: 5 }, { text: '丙', msg_id: 8, floor: 8 }]);
    s = (await SM.consolidate(s, { force: true })).state;
    assert.deepEqual(s.stm_entries[0].floors, [2, 5, 8], '★ floors 由 pending 的 floor 派生');
    assert.deepEqual(s.stm_entries[0].msg_ids, [2, 5, 8], '两者同源（同一批 pending）');
});

test('【A4】★ 「无楼层」条目原样保留：null 与非数值不参与，也不被谎报成 0', () => {
    const s = SM.normalizeState(null);
    s.unconsolidated_stm = [{ id: 'a', text: 'x', msg_id: 1, floor: null, ts: 1 }];
    s.ltm_entries = [{ id: 'ltm_1', summary: 's', from_stm_ids: [], ts: 2, span: null }];
    assert.equal(SM.shiftFloorRefs(s, 5), 0, '无楼层归属 ⇒ 0（不猜）');
    assert.equal(s.unconsolidated_stm[0].floor, null, '★ null 不得被读成第 0 楼（0 是合法楼层）');
    assert.equal(s.ltm_entries[0].span, null, 'span 为 null 的摘要原样保留');
});

test('【A5】★ 只读不发明：位移不新增/不删除任何条目（只改元素内部字段）', () => {
    const st = fixture();
    const n0 = st.stm_entries.length + st.ltm_entries.length + st.unconsolidated_stm.length;
    SM.shiftFloorRefs(st, 5);
    assert.equal(st.stm_entries.length + st.ltm_entries.length + st.unconsolidated_stm.length, n0, '条目数不变');
    assert.equal(st.stm_entries[0].msg_ids.join(','), '3,6,9', 'msg_ids 不随楼层位移（msg_id 可能跨楼层）');
});

// ══════════ B 前移跟随：三类引用都跟 ══════════
test('【B1】★ 前移 5：单点 8→7、集合 6→5 与 9→8、区间 to 9→8，其余一格不动', () => {
    const st = fixture();
    const n = SM.shiftFloorRefs(st, 5);
    assert.deepEqual(floorsOf(st), [2, 5, 7], '★ 单点：只有 8 被减（5 是「被删楼自身」不动、2 更小不动）');
    assert.deepEqual(stmFloors(st), [3, 5, 8], '★ 集合：3 不动、6→5、9→8');
    assert.deepEqual([st.ltm_entries[0].span.from, st.ltm_entries[0].span.to], [3, 8], '★ 区间：from 3 不动、to 9→8');
    assert.equal(n, 4, '重定位处数如实回报（单点 1 + 集合 2 + 区间 1）');
});

test('【B2】★ 区间整体平移、不重算疏密：gaps / kept 保持原值（前移不改变结构）', () => {
    const st = fixture();
    st.ltm_entries[0].span = { from: 3, to: 9, gaps: true, kept: 3 };
    SM.shiftFloorRefs(st, 5);
    const sp = st.ltm_entries[0].span;
    assert.equal(sp.from, 3);
    assert.equal(sp.to, 8);
    assert.equal(sp.gaps, true, '★ 不重算 gaps（那会把位移读成「结构变了」）');
    assert.equal(sp.kept, 3, '★ 也不重算 kept');
});

test('【B3】★ 区间两端分开判：from 恰等于 d 不动、to > d 才减（不整段一起减）', () => {
    const s = SM.normalizeState(null);
    s.ltm_entries = [{ id: 'ltm_1', summary: 's', from_stm_ids: [], ts: 1, span: { from: 5, to: 9 } }];
    const n = SM.shiftFloorRefs(s, 5);
    assert.equal(s.ltm_entries[0].span.from, 5, '★ from 恰等于 d 不动（它是「被删楼自身」的残留，不是其后）');
    assert.equal(s.ltm_entries[0].span.to, 8, 'to 跟随');
    assert.equal(n, 1, '只重定位一处');
});

test('【B4】★ 与游标/账本解耦：位移不碰 cursor_state、不写 lastDrop', () => {
    const st = fixture();
    const cursor = JSON.stringify(st.cursor_state);
    const lastDrop = JSON.stringify(st.loss.lastDrop);
    SM.shiftFloorRefs(st, 5);
    assert.equal(JSON.stringify(st.cursor_state), cursor, '★ 游标不动（位移不消耗进度）');
    assert.equal(JSON.stringify(st.loss.lastDrop), lastDrop, '★ 位移不得写 lastDrop（那是「有损」的留痕）');
});

// ══════════ C 登记表接线 ══════════
test('【C1】★ 回放前移真搬：报告 state=ok、count=4、整表 shifted 含本面（修前是 no-op / 0）', () => {
    const st = fixture();
    const rep = LR.replayShift(hostOf(st), 5);
    const it = itemOf(rep, 'stm-ltm');
    assert.ok(it, '报告里必须有 stm-ltm 一项');
    assert.equal(it.state, 'ok', '★ 修前是 no-op；no-op 与 absent 是两件事，修后连 no-op 都不该是');
    assert.equal(it.count, 4, '本面回报 4 处');
    assert.ok(rep.shifted >= 4, '整表 shifted 应含本面的 4 处，实 ' + rep.shifted);
    assert.equal(rep.threw, 0, '不抛');
    assert.deepEqual(floorsOf(st), [2, 5, 7], '★ 走回放路径时数据真被搬（不是只报了数）');
});

test('【C2】★ 覆盖度面如实报「这一面会前移」（修前 shifts=false）', () => {
    const row = LR.coverage(hostOf(fixture())).rows.find((r) => r.id === 'stm-ltm');
    assert.ok(row, '登记表必须有 stm-ltm 一行');
    assert.equal(row.shifts, true, '★ 覆盖度断言它会前移（修前 false，与标签表自述冲突）');
    assert.equal(row.state, 'present', '在场');
});

test('【C3】★ 登记表全表无例外：没有任何一面拒绝前移（白名单已撤销）', () => {
    assert.deepEqual(LR.FLOOR_OWNERS.filter((o) => o.shift === null).map((o) => o.id), [],
        '★ 一个面都不许拒绝前移（这不是放宽，是把例外收掉）');
    assert.ok(LR.FLOOR_OWNERS.length >= 42, '登记表规模不缩水（42 本账），实 ' + LR.FLOOR_OWNERS.length);
    assert.deepEqual(LR.checkRegistry(LR.FLOOR_OWNERS), [], '登记表结构健康');
});

test('【C4】★ 登记项真调模块（不是就地手抄一份位移循环）', () => {
    const code = stripComments(lrSrc);
    assert.ok(/h\.stmLtm\.shiftFloorRefs\(h\._stmLtmState, d\)/.test(code),
        '★ 登记项必须走模块入口 shiftFloorRefs（手抄那份必然漏掉后来新增的引用面）');
    assert.ok(!/unconsolidated_stm/.test(code), '登记项里不得出现对模块内部数组名的直接操作');
    assert.ok(!/\.floors\s*=\s*[^;]*\.map\(/.test(code), '登记项里不得手抄 floors 的 map 位移');
});

// ══════════ D 不落 loss / 不写回计数 / 摘要不清 ══════════
test('【D1】★ 原地语义：返回值是计数而不是 state（回写计数会污染状态）', () => {
    const st = fixture();
    assert.equal(typeof SM.shiftFloorRefs(st, 5), 'number', '★ 返回计数');
    assert.ok(Array.isArray(st.unconsolidated_stm), '★ 传入的 state 仍是合法状态（没有被计数替换掉）');
    const own = LR.FLOOR_OWNERS.find((o) => o.id === 'stm-ltm');
    assert.equal(typeof own.shift(hostOf(st), 4), 'number', '登记项也只取计数');
});

test('【D2】★★ 位移不落 loss：LOSS_KEYS 全零、lastDrop 为 null、selfReport 仍报「无损」', () => {
    const st = fixture();
    LR.replayShift(hostOf(st), 5);
    for (const k of SM.LOSS_KEYS) assert.equal(st.loss[k], 0, '★ ' + k + ' 必须为 0（位移不是有损动作）');
    assert.equal(st.loss.lastDrop, null, 'lastDrop 保持 null');
    const r = SM.selfReport(st);
    assert.equal(r.ok, true, '★ 位移不得把诊断面读成降级（selfReport 把 loss 非零一律读成降级）');
    assert.ok(!r.reasons.some((x) => /楼层清理/.test(x)), '不得出现「楼层清理」类告警');
    // 两向自证：同一套判据在**真删楼**后必须报损（否则这条判据是恒绿的）
    const st2 = fixture();
    st2.unconsolidated_stm = st2.unconsolidated_stm.filter((e) => e.floor === 5);
    const after = SM.removeByFloors(st2, [5]);
    assert.equal(after.loss.rawDropped, 1, '删楼删掉 1 段待巩固片段并落账');
    assert.equal(after.loss.spanDropped, 1, '删楼摘过 1 个 span 并落账');
    assert.equal(SM.selfReport(after).ok, false, '★ 真删楼后 selfReport 必须报损（同款判据的另一向）');
});

test('【D3】★ 位移不清摘要内容：summary / from_stm_ids 逐字节不变（只动 span 两格）', () => {
    const st = fixture();
    st.ltm_entries[0].summary = '一段摘要';
    const before = JSON.stringify([st.ltm_entries[0].summary, st.ltm_entries[0].from_stm_ids]);
    SM.shiftFloorRefs(st, 5);
    assert.equal(JSON.stringify([st.ltm_entries[0].summary, st.ltm_entries[0].from_stm_ids]), before,
        '★ 摘要已固化，不因楼层位移而重写（v3.170 的口径）');
    assert.equal(st.ltm_entries[0].span.to, 8, '只有 span 跟随');
});

// ══════════ E 边界 ══════════
test('【E1】★ 非有限数如实 0 且一格不动（不猜、不把「没给」当第 0 楼）', () => {
    for (const bad of ['怪', null, undefined, NaN, {}, []]) {
        const st = fixture();
        assert.equal(SM.shiftFloorRefs(st, bad), 0, 'shiftFloorRefs(' + String(bad) + ') 如实 0');
        assert.deepEqual(floorsOf(st), [2, 5, 8], 'state 一格不动');
    }
});

test('【E2】★ 旧模块退路：缺 shiftFloorRefs 时如实 0（留痕在报告里，不假装搬过）', () => {
    const legacy = { normalizeState: () => ({}), removeByFloors: () => ({}) };
    const st = fixture();
    const rep = LR.replayShift({ stmLtm: legacy, _stmLtmState: st }, 5);
    const it = itemOf(rep, 'stm-ltm');
    assert.equal(it.state, 'ok', '旧模块走「取了目标、动作如实返回 0」这条路（不是 absent）');
    assert.equal(it.count, 0, '★ 如实 0');
    assert.equal(rep.threw, 0, '不抛');
    assert.equal(st.unconsolidated_stm[2].floor, 8, '★ 退路下数据不动（不假装搬过）');
    assert.equal(itemOf(LR.replayShift({ _stmLtmState: st }, 5), 'stm-ltm').state, 'absent',
        '连模块都没有 ⇒ absent（与 no-op 不同形）');
});

test('【E3】★ 宿主不手抄第二份位移：index.js 里不得出现对模块前移入口的直调', () => {
    const code = stripComments(idxSrc);
    assert.ok(!/this\.stmLtm\.shiftFloorRefs/.test(code),
        '★ 宿主不得自己调前移入口（那就成了第二份位移真源，两份事实必然漂移）');
    assert.ok(/this\.stmLtm\.removeByFloors\(this\._stmLtmState, \[floor\]\)/.test(code),
        '删楼侧仍由宿主在 rollbackFloor 内清（与登记表 drop 是同一动作的两处入口，语义一致）');
});

test('【E4】★ 乱输入不抛：脏 floor / 畸形 span / null 条目一路不炸（只搬可判的那几处）', () => {
    const st = fixture();
    st.unconsolidated_stm.push({ id: 'raw_4_bad', text: 'x', msg_id: 7, floor: '怪', ts: 4 });
    st.stm_entries.push({ id: 'stm_2', text: 'u', msg_ids: [], floors: null, ts: 5, score: 0 });
    st.ltm_entries.push({ id: 'ltm_2', summary: 'v', from_stm_ids: [], ts: 6, span: { from: '怪', to: null } });
    st.ltm_entries.push(null);
    let n = -1;
    assert.doesNotThrow(() => { n = SM.shiftFloorRefs(st, 5); }, '不抛');
    assert.equal(n, 4, '只有可判的四处被搬（脏值不猜）');
    assert.equal(st.unconsolidated_stm[3].floor, '怪', '★ 非数值 floor 原样保留（不被读成 0）');
});

// ══════════ F 负控制前置 ══════════
test('【F0】★ 原版对照：本套件的全部闭合判据在真源码上必须干净（否则「破坏翻红」不可归因）', () => {
    assert.equal(SM.shiftFloorRefs(fixture(), 5), 4, 'B1 判据在真源码上成立');
    assert.equal(itemOf(LR.replayShift(hostOf(fixture()), 5), 'stm-ltm').count, 4, 'C1 判据在真源码上成立');
    assert.equal(LR.coverage(hostOf(fixture())).rows.find((r) => r.id === 'stm-ltm').shifts, true, 'C2 判据在真源码上成立');
    assert.equal(LR.FLOOR_OWNERS.filter((o) => o.shift === null).length, 0, 'C3 判据在真源码上成立');
    const L = labelOwners();
    assert.deepEqual(L.missing, [], 'G1 判据在真源码上成立');
    assert.deepEqual(L.noShift, [], 'G1 判据在真源码上成立（自述与登记表一致）');
});

// ══════════ G 自述一致 + 版本锚 ══════════
test('【G1】★ 自述一致：诊断面标签表声称「会前移」的面，登记表里必须真会前移（含 stm-ltm）', () => {
    const L = labelOwners();
    assert.ok(L.ids.includes('stm-ltm'), '★ 标签表里必须有 stm-ltm（它就是本版那条自述冲突的实证）');
    assert.deepEqual(L.missing, [], '★ 标签表里不得有登记表不认识的 id（读者会各信一份）');
    assert.deepEqual(L.noShift, [],
        '★ 标签表声称会前移、而登记表写 null ⇒ 自述冲突（v3.170 治过的同族形态，本轮治它的登记表版本）');
});

test('【G2】★ 版本锚：本套件只在 3.222.0 及以后成立', () => {
    assert.ok(vnum(pkg.version) >= vnum('3.222.0'), '★ 当前版本 ' + pkg.version);
    assert.equal(manifest.version, pkg.version, '三源一致（index.js / manifest / package）');
    assert.equal(/const VERSION = '([0-9.]+)'/.exec(idxSrc)[1], pkg.version, 'index.js 与 package 同源');
});

// ══════════ N 负控制：真源码破坏 → 破坏副本 → 同款真判据必须转红 ══════════
function mutate(srcText, anchor, repl, tag) {
    const hits = String(srcText).split(anchor).length - 1;
    assert.equal(hits, 1, tag + '：锚点须恰中 1 次（实 ' + hits + '）——锚点漂移即判据失效');
    return String(srcText).split(anchor).join(repl);
}
/**
 * 破坏副本：整仓镜像（只搬根目录 .js —— 这两个模块都是零依赖 IIFE，
 *   但纪律仍是「不许裸临时目录」：相对依赖在裸目录里会解析失败，那会变成假红）。
 */
function loadMirror(over, name) {
    const dir = fs.mkdtempSync(path.join(REPO, '.tmp_v3223_' + name + '_'));
    for (const f of fs.readdirSync(REPO)) {
        if (!f.endsWith('.js')) continue;
        fs.copyFileSync(path.join(REPO, f), path.join(dir, f));
    }
    for (const [rel, text] of Object.entries(over)) fs.writeFileSync(path.join(dir, rel), text);
    const p = path.join(dir, 'ledger-replay.js');
    delete require.cache[require.resolve(p)];
    return { LRx: require(p), dir };
}
/**
 * 破坏锚点表。每个字面量在本文件里只准出现一次（见 N0），
 *   且**替换串一律不含锚点**（否则「锚点唯一」这条自身会失效）。
 */
const ANCHORS = [
    '    const v = dec(e.floor);\n    if (v !== null) { e.floor = v; n += 1; }',
    '    e.floors = e.floors.map((f) => { const v = dec(f); if (v !== null) { n += 1; return v; } return f; });',
    '    if (to !== null) { e.span.to = to; n += 1; }',
    '    return (Number.isFinite(v) && v > d0) ? v - 1 : null;',
    '  const d0 = (typeof deleted === \'number\') ? deleted\n    : (typeof deleted === \'string\' && deleted.trim() !== \'\') ? Number(deleted)\n    : NaN;',
    '  return n;\n}\n',
    '            shift: (h, d) => (h.stmLtm && h._stmLtmState && typeof h.stmLtm.shiftFloorRefs === \'function\')\n                ? (Number(h.stmLtm.shiftFloorRefs(h._stmLtmState, d)) || 0)\n                : 0',
    "        'stm-ltm': 'shiftFloorsFrom.短期长期记忆位移'"
];
const AN = (n) => ANCHORS[n];

test('【N0】★ 负控制判据的纯度：锚点字面量全文只准出现在 ANCHORS 声明处', () => {
    const own = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').replace(/const ANCHORS = \[[\s\S]*?\n\];/, '');
    for (const a of ANCHORS) {
        assert.equal(own.split(a).length - 1, 0,
            '★ 锚点字面量不得在别处复现（判据引用锚点 = 破坏时判据自我指涉失效）：' + JSON.stringify(a.slice(0, 40)));
    }
    assert.equal(ANCHORS.length, 8, '锚点表 8 条');
});

test('【N1】★ 负控制：撤掉单点位移 → 单点判据（8 变 7）必须转红', () => {
    const { LRx, dir } = loadMirror({ 'stm-ltm.js': mutate(smSrc, AN(0), '', 'N1'), 'ledger-replay.js': lrSrc }, 'n1');
    try {
        const st = fixture();
        LRx.replayShift({ stmLtm: require(path.join(dir, 'stm-ltm.js')), _stmLtmState: st }, 5);
        assert.notDeepEqual(floorsOf(st), [2, 5, 7], '★ 同款判据在破坏副本上必须失败（单点 8 停在 8）');
        assert.deepEqual(floorsOf(st), [2, 5, 8], '破坏可观测：单点那一格没动');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N2】★ 负控制：撤掉集合位移 → 集合判据（6→5、9→8）必须转红', () => {
    const { LRx, dir } = loadMirror({ 'stm-ltm.js': mutate(smSrc, AN(1), '', 'N2'), 'ledger-replay.js': lrSrc }, 'n2');
    try {
        const st = fixture();
        LRx.replayShift({ stmLtm: require(path.join(dir, 'stm-ltm.js')), _stmLtmState: st }, 5);
        assert.notDeepEqual(stmFloors(st), [3, 5, 8], '★ 集合判据转红（6/9 停在原地）');
        assert.deepEqual(stmFloors(st), [3, 6, 9], '破坏可观测：集合那一格没动');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N3】★ 负控制：撤掉区间末端位移 → 区间判据（to 变 8）必须转红', () => {
    const { LRx, dir } = loadMirror({ 'stm-ltm.js': mutate(smSrc, AN(2), '', 'N3'), 'ledger-replay.js': lrSrc }, 'n3');
    try {
        const st = fixture();
        LRx.replayShift({ stmLtm: require(path.join(dir, 'stm-ltm.js')), _stmLtmState: st }, 5);
        assert.notEqual(st.ltm_entries[0].span.to, 8, '★ 区间末端判据转红（to 停在 9）');
        assert.equal(st.ltm_entries[0].span.to, 9, '破坏可观测：to 没动');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N4】★ 负控制：`>` 改成 `>=` → 「被删楼自身不得被平移」判据必须转红', () => {
    const broken = mutate(smSrc, AN(3), '    return (Number.isFinite(v) && v >= d0) ? v - 1 : null;', 'N4');
    const { LRx, dir } = loadMirror({ 'stm-ltm.js': broken, 'ledger-replay.js': lrSrc }, 'n4');
    try {
        const st = fixture();
        LRx.replayShift({ stmLtm: require(path.join(dir, 'stm-ltm.js')), _stmLtmState: st }, 5);
        assert.notDeepEqual(floorsOf(st), [2, 5, 7], '★ 边界判据转红（第 5 楼自己被减成 4）');
        assert.deepEqual(floorsOf(st), [2, 4, 7], '破坏可观测：被删楼自身被平移');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N5】★ 负控制：取值口径退回 `Number(deleted)` → 「没给」被读成第 0 楼，判据必须转红', () => {
    const broken = mutate(smSrc, AN(4), '  const d0 = Number(deleted);', 'N5');
    const { dir } = loadMirror({ 'stm-ltm.js': broken, 'ledger-replay.js': lrSrc }, 'n5');
    try {
        const mod = require(path.join(dir, 'stm-ltm.js'));
        const st = fixture();
        assert.notEqual(mod.shiftFloorRefs(st, null), 0,
            '★ 同款判据（非有限数如实 0）在破坏副本上必须失败：null 被读成第 0 楼');
        assert.deepEqual(floorsOf(st), [1, 4, 7], '破坏可观测：连小于 d 的楼层也被平移');
        for (const bad of ['', [], false]) {
            const s2 = fixture();
            assert.notEqual(mod.shiftFloorRefs(s2, bad), 0,
                '★ ' + JSON.stringify(bad) + ' 被读成第 0 楼（真源码里须如实 0）');
            assert.notDeepEqual(floorsOf(s2), [2, 5, 8], '破坏可观测：' + JSON.stringify(bad) + ' 平移了整表');
        }
        // 两向自证：同款判据在真源码上必须为真（否则本组是「无反应」而不是「翻红」）
        const clean = fixture();
        for (const bad of [null, '', [], false]) {
            assert.equal(SM.shiftFloorRefs(clean, bad), 0, '真源码上 ' + JSON.stringify(bad) + ' 如实 0');
        }
        assert.deepEqual(floorsOf(clean), [2, 5, 8], '真源码上同款判据为真');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N6】★ 负控制：位移落 loss → 「不落 loss / 不假报警」判据必须转红', () => {
    const broken = mutate(smSrc, AN(5), '  if (state && state.loss) state.loss.floorDropped += n;\n  return (n);\n}\n', 'N6');
    const { LRx, dir } = loadMirror({ 'stm-ltm.js': broken, 'ledger-replay.js': lrSrc }, 'n6');
    try {
        const mod = require(path.join(dir, 'stm-ltm.js'));
        const st = fixture();
        const rep = LRx.replayShift({ stmLtm: mod, _stmLtmState: st }, 5);
        assert.ok(rep.shifted >= 4, '前置：破坏副本确实搬了（' + rep.shifted + ' 处）');
        assert.notEqual(st.loss.floorDropped, 0,
            '★ 「LOSS_KEYS 全零」判据转红（破坏落在**原 state.loss** 上才可观测；'
            + '落在 normalizeState 的副本上就观测不到 —— 那正是首版失败的原因）');
        assert.equal(st.loss.floorDropped, 4, '破坏可观测：位移量被落成 loss');
        assert.equal(mod.selfReport(st).ok, false, '★ 「selfReport 仍报无损」判据转红（诊断面从此长期假报警）');
        const clean = fixture();
        LRx.replayShift({ stmLtm: SM, _stmLtmState: clean }, 5);
        assert.equal(clean.loss.floorDropped, 0, '真源码上同款判据为真（否则本组恒绿）');
        assert.equal(SM.selfReport(clean).ok, true, '真源码上诊断面仍报无损');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N7】★ 负控制：返回值改成 state → 「原地语义（返回计数）」判据必须转红', () => {
    const broken = mutate(smSrc, AN(5), '  return s;\n}\n', 'N7');
    const { LRx, dir } = loadMirror({ 'stm-ltm.js': broken, 'ledger-replay.js': lrSrc }, 'n7');
    try {
        const mod = require(path.join(dir, 'stm-ltm.js'));
        const out = mod.shiftFloorRefs(fixture(), 5);
        assert.notEqual(typeof out, 'number',
            '★ 同款判据（返回值是计数）在破坏副本上必须失败：拿到 ' + typeof out);
        assert.equal(typeof out, 'object', '破坏可观测：返回了 state（调用方会以为必须回写）');
        // 破坏的后果正是这条判据要防的形态：回放面把「返回 state」读成 0 处，
        //   而数据其实**已经原地搬过了** ⇒ 报告与数据不一致。
        const st = fixture();
        const rep = LRx.replayShift({ stmLtm: mod, _stmLtmState: st }, 5);
        assert.equal(rep.items.find((x) => x.id === 'stm-ltm').count, 0, '破坏可观测：报告 0 处');
        assert.deepEqual(floorsOf(st), [2, 5, 7], '★ 数据搬了、报告说 0 处（报告与数据不一致）');
        assert.equal(typeof SM.shiftFloorRefs(fixture(), 5), 'number', '真源码上同款判据为真（返回计数）');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N8】★ 负控制：登记项 shift 改回 null → 全表无例外 / 覆盖度 / 回放报告三向判据都转红', () => {
    const broken = mutate(lrSrc, AN(6), '            shift: null', 'N8');
    const { LRx, dir } = loadMirror({ 'stm-ltm.js': smSrc, 'ledger-replay.js': broken }, 'n8');
    try {
        assert.equal(LRx.FLOOR_OWNERS.filter((o) => o.shift === null).length, 1,
            '★ 「全表无例外」判据转红（例外回来了）');
        const cov = LRx.coverage({ stmLtm: SM, _stmLtmState: fixture() }).rows.find((r) => r.id === 'stm-ltm');
        assert.equal(cov.shifts, false, '★ 覆盖度判据转红（又声称它不参与前移）');
        const st = fixture();
        const rep = LRx.replayShift({ stmLtm: SM, _stmLtmState: st }, 5);
        assert.equal(itemOf(rep, 'stm-ltm').state, 'no-op', '★ 回放报告判据转红（no-op / shifted 0）');
        assert.equal(rep.shifted, 0, '破坏可观测：整表一处未搬');
        assert.deepEqual(floorsOf(st), [2, 5, 8], '破坏可观测：单点楼层号没跟');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N9】★ 负控制：标签表把 stm-ltm 换成一个不存在的面 → 自述一致判据必须转红', () => {
    const broken = mutate(idxSrc, AN(7), "        'ghost-face': 'shiftFloorsFrom.幽灵面位移'", 'N9');
    const m = /SHIFT_FACE_LABELS = Object\.freeze\(\{([\s\S]*?)\}\);/.exec(stripComments(broken));
    const ids = [...m[1].matchAll(/(?:'([^']+)'|([A-Za-z][A-Za-z0-9-]*))\s*:/g)].map((x) => x[1] || x[2]);
    const byId = new Map(LR.FLOOR_OWNERS.map((o) => [o.id, o]));
    assert.ok(!ids.includes('stm-ltm'), '破坏可观测：标签表里已无 stm-ltm');
    assert.notDeepEqual(ids.filter((i) => !byId.has(i)), [],
        '★ 自述一致判据转红（标签表面向一个不存在的登记项）');
});

test('【N10】★ 负控制·互不掩护：三类引用的破坏各自只打掉自己那一面（不是一坏全坏）', () => {
    const probes = [
        [AN(0), '单点', (st) => floorsOf(st).join(',') === '2,5,7'],
        [AN(1), '集合', (st) => stmFloors(st).join(',') === '3,5,8'],
        [AN(2), '区间', (st) => st.ltm_entries[0].span.to === 8]
    ];
    for (const [anchor, name] of probes) {
        const { dir } = loadMirror({ 'stm-ltm.js': mutate(smSrc, anchor, '', 'N10-' + name), 'ledger-replay.js': lrSrc }, 'n10');
        try {
            const mod = require(path.join(dir, 'stm-ltm.js'));
            const alive = probes.filter(([a]) => a !== anchor)
                .filter(([, , judge]) => { const s2 = fixture(); mod.shiftFloorRefs(s2, 5); return judge(s2); })
                .map(([, n]) => n);
            assert.deepEqual(alive.sort(),
                ['单点', '集合', '区间'].filter((x) => x !== name).sort(),
                '★ 破坏「' + name + '」后另两面必须仍成立（实：' + alive.join('、') + '）—— 否则判据一坏全坏，失去分辨力');
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
});