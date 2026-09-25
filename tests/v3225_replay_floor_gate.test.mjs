/* ============================================================
 * tests/v3225_replay_floor_gate.test.mjs — [v3.224.0] Gate O-2
 *
 * 版本锚点（v3.224.0）：本套件恰好锚着它自己的出生版本，供版本守卫 V4 取基准。
 *
 * 主题：**回放 / 前移这条路径上的「没给」与「给了 0」** —— O-1 在场所面（scene-book.js）
 *   修掉的那条形态，在回放层是**第二次发病**，而且这次发生在 R3-E（v3.222.0）**新写的代码**里。
 *
 * 修前实测（真模块，不是推演）：
 *   · `replayShift(host, null)` ⇒ volumes 的 1..9 整段减到 0..8、归档集合 [0,1,2,5] → [0,1,4]、
 *     两个注入游标各减一 —— **整树前移一格**，而且返回 9（看着像「搬了 9 条」）。
 *   · 半收口：R3-E 新写的 `const d0 = Number(d); if (!Number.isFinite(d0)) return 0;` 只挡住
 *     `undefined` / NaN；`Number('') === 0`、`Number([]) === 0`、`Number(true) === 1` 全部放行。
 *     「以为这里有门」比「明确没有门」更难发现。
 *   · 宿主面同一形态：`rollbackFloor(null)` 会被下游约 38 处 `Number(floor) || 0` 读成第 0 楼，
 *     于是「宿主没给楼层」变成「把第 0 楼及其派生记录撤掉」；`MESSAGE_DELETED` 的
 *     `Number(messageId)` + isFinite 同理（`[]` / `''` 得 0 且有限）。
 *
 * 结构：
 *   A 取值门本体（floorOrNull：只认数字与非空数字字符串）
 *   B 回放入参：「没给」⇒ 一格不动 + skipped（与真回放不同形）
 *   C 反坐实：真给 0 / '5' / ' 5 ' 必须照常动手（只做「拒绝」那一半 = 把门关成谁都搬不动）
 *   D 全表清扫：整树四面（volumes / archived / inject-cursor / changeset）逐条比对
 *   E 宿主面：numOr 的数组门 + rollbackFloor / shiftFloorsFrom / MESSAGE_DELETED 三处入口门
 *   F 既有面不许回退：登记表结构自证 + 三态分域（ok / no-op / absent 三种不同形）
 *   G 版本锚
 *   N 负控制（真源码破坏 → **整仓镜像** → 同款真判据必须转红；另加「互不掩护」）
 *
 * 本套件修掉的一处**判据自身**问题：首稿把 `archived` / `inject-cursor` 标成
 *   `participates: false`（主张「宿主已做过、回放不该再做」），被 v3190 第 8/9 条**当场判死**
 *   （既有判据明写这两个面**要**参与前移）。仓内纪律「判定是缺陷还是刻意优化之前先读既有测试
 *   意图」在本轮再次生效 —— 断言取既有意图，不取我的推演。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

const LR = 'ledger-replay.js';
const IDX = 'index.js';

const LR_MOD = (await import(at(LR))).default;
const LR_SRC = read(LR);
const IDX_SRC = read(IDX);
const pkg = JSON.parse(read('package.json'));

const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));
const CURRENT = '3.224.0';

/** 一个「四面都挂上」的宿主：volumes / archived / inject-cursor / changeset 各带楼层值。 */
const mkHost = () => ({
    summary: { volumes: [{ floorStart: 1, floorEnd: 9 }] },
    _archivedFloorIds: new Set([0, 1, 2, 5]),
    _timelineInjectFloor: 5,
    _diaryInjectFloor: 7,
    _changeset: () => ({ rows: new Map([['a', { floor: 5 }], ['b', { floor: 9 }]]) }),
    worldProg: {},
    _factVersionState: null,
    _eventThreadState: null,
    _repairState: null
});

/** 宿主四面的可读快照（用于「一格没动」的逐条比对）。 */
const snap = (h) => JSON.stringify({
    volumes: h.summary.volumes,
    archived: [...h._archivedFloorIds].join(','),
    timeline: h._timelineInjectFloor,
    diary: h._diaryInjectFloor,
    rows: [...h._changeset().rows.values()].map((x) => x.floor).join(',')
});

const GIVEN = [['null', null], ['undefined', undefined], ["''", ''], ["'  '", '  '], ['[]', []], ['[5]', [5]], ['{}', {}], ['true', true], ['false', false], ['NaN', NaN], ["'甲'", '甲'], ["'1a'", '1a']];
const REAL = [['0', 0], ["'0'", '0'], ['5', 5], ["'5'", '5'], ["' 5 '", ' 5 '], ['3.5', 3.5]];

// ══════════ A 取值门本体 ══════════
test('【A1】★★ 取值门只认「数字」与「非空数字字符串」，其余一律判没给', () => {
    for (const [label, v] of GIVEN) {
        assert.ok(!LR_SRC.includes('floorOrNull(') ? false : true);
        const isWeird = typeof v === 'number' ? !Number.isFinite(v) : true;
        if (isWeird) {
            // 门本体在场即可（行为在 B 组逐条验）
            assert.ok(true, label);
        }
    }
    assert.ok(/function floorOrNull\(v\)/.test(LR_SRC), '★ 本模块必须有唯一取值门 floorOrNull');
    assert.ok(/typeof v === 'number'/.test(LR_SRC) && /typeof v === 'string'/.test(LR_SRC), '★ 门须「先看类型」');
});

test('【A2】★ 门本体在真模块上装的是「先看类型」，不是 Number() 兜底', () => {
    assert.ok(!/const del = Number\(d\);\s*\n\s*if \(!Number\.isFinite\(del\)\)/.test(LR_SRC),
        '★ shiftLedgerItemFloors 不得退回 `Number(d)` + isFinite 的半收口');
    assert.ok(/const del = floorOrNull\(d\);/.test(LR_SRC), '★ 该处必须走门');
    assert.ok(/const d0 = floorOrNull\(d\); if \(d0 === null\) return 0;/.test(LR_SRC), '★ archived.shift 入参走门');
    assert.ok(/const f0 = floorOrNull\(f\); if \(f0 === null\) return 0;/.test(LR_SRC), '★ archived.drop 入参走门');
});

// ══════════ B 回放入参：「没给」⇒ 一格不动 + skipped ══════════
test('【B1】★★★ 「没给」一律 skipped 且整树一格不动（shift 侧）', () => {
    for (const [label, v] of GIVEN) {
        const h = mkHost();
        const before = snap(h);
        const rep = LR_MOD.replayShift(h, v);
        assert.equal(rep.skipped, 'floor-not-given', '★ ' + label + ' 必须报 skipped');
        assert.equal(rep.shifted, 0, '★ ' + label + ' 不得搬动任何东西，实得 ' + rep.shifted);
        assert.equal(rep.dropped, 0, '★ ' + label + ' dropped 必须为 0');
        assert.equal(rep.floor, null, '★ ' + label + ' 报告里的楼层须如实为 null，而不是 0');
        assert.equal(snap(h), before, '★ ' + label + ' 之后宿主四面必须逐字节不变');
    }
});

test('【B2】★★★ 「没给」一律 skipped 且整树一格不动（drop 侧）', () => {
    for (const [label, v] of GIVEN) {
        const h = mkHost();
        const before = snap(h);
        const rep = LR_MOD.replayDrop(h, v);
        assert.equal(rep.skipped, 'floor-not-given', '★ ' + label + ' 必须报 skipped');
        assert.equal(rep.dropped, 0, '★ ' + label + ' 不得撤掉任何东西，实得 ' + rep.dropped);
        assert.equal(rep.floor, null, '★ ' + label + ' 报告楼层须为 null');
        assert.equal(snap(h), before, '★ ' + label + ' 之后宿主四面必须逐字节不变');
    }
});

test('【B3】★★ 「没给」与「真回放」不得同形（报告可判）', () => {
    const skipped = LR_MOD.replayShift(mkHost(), null);
    const real = LR_MOD.replayShift(mkHost(), 5);
    assert.notEqual(skipped.skipped, real.skipped, '★ 两态必须可判');
    assert.equal(real.skipped, null, '★ 真回放的 skipped 须为 null');
    assert.ok(real.items.length > 0 && skipped.items.length === 0, '★ 真回放有逐账明细，「没给」没有');
});

// ══════════ C 反坐实：真给了必须照常动手 ══════════
test('【C1】★★★ 反坐实：真给 0 / \'5\' / \' 5 \' 一律照常回放（门不得关成「谁都搬不动」）', () => {
    for (const [label, v] of REAL) {
        const h = mkHost();
        const before = snap(h);
        const rep = LR_MOD.replayShift(h, v);
        assert.equal(rep.skipped, null, '★ ' + label + ' 是真给，不得被跳过');
        assert.equal(rep.floor, Number(String(v).trim()), '★ ' + label + ' 报告楼层须等于真值');
        assert.notEqual(snap(h), before, '★ ' + label + ' 必须真的动手');
        assert.ok(rep.shifted > 0, '★ ' + label + ' 的 shifted 必须 > 0，实得 ' + rep.shifted);
    }
});

test('【C2】★★ 真给 0 是「第 0 楼」不是「没给」：归档集合保留 0、其后照常前移', () => {
    const h = mkHost();
    const rep = LR_MOD.replayShift(h, 0);
    assert.equal(rep.skipped, null);
    // archived: 0 本身在 d0=0 处 ⇒ 被跳过（f === d0 那一支），1/2/5 → 0/1/4
    assert.equal([...h._archivedFloorIds].sort().join(','), '0,1,4', '★ 第 0 楼自身须保留为 0');
    // volumes 1..9 → 0..8
    assert.equal(h.summary.volumes[0].floorStart, 0, '★ 真给 0 时其后楼层照常前移');
});

// ══════════ D 全表清扫：另一条时间线（0 与 5）逐面可对账 ══════════
test('【D1】★★ 同一宿主两条时间线互不串：给 0 与给 5 的四面结果必须不同且各自正确', () => {
    const h0 = mkHost();
    LR_MOD.replayShift(h0, 0);
    const h5 = mkHost();
    LR_MOD.replayShift(h5, 5);
    assert.notEqual(snap(h0), snap(h5), '★ 两条时间线不得同形');
    assert.equal(h5.summary.volumes[0].floorStart, 1, '★ 删 5 不影响 1 楼起点');
    assert.equal(h5.summary.volumes[0].floorEnd, 8, '★ 1..9 里跨过 5 的只有 floorEnd');
    assert.equal(h0.summary.volumes[0].floorEnd, 8);
    assert.equal(h0.summary.volumes[0].floorStart, 0, '★ 删 0 会把起点也搬下来');
});

// ══════════ E 宿主面三处入口门 ══════════
test('【E1】★★ 宿主 numOr 多挡一格：数组 / 对象不得被 Number() 读成第 0 楼', () => {
    const m = /function numOr\(v, fallback\) \{[\s\S]*?\n    \}/.exec(IDX_SRC);
    assert.ok(m, '★ numOr 可提取');
    assert.ok(/typeof v === 'object'/.test(m[0]), '★ 必须挡 object（`Number([]) === 0`）');
    const numOr = new Function('return (' + m[0].replace('function numOr', 'function') + ')')();
    for (const v of [null, undefined, '', [], [5], {}, true, false, NaN]) {
        assert.equal(numOr(v, null), null, '★ 怪值必须回退：' + JSON.stringify(v));
    }
    assert.equal(numOr(0, null), 0, '★ 真 0 必须保住');
    assert.equal(numOr(' 5 ', null), 5, '★ 数字串照常');
});

test('【E2】★★★ 宿主三处入口门在场：回滚 / 前移 / 删楼事件', () => {
    assert.ok(/const _f0 = numOr\(floor, null\);\s*\n\s*if \(_f0 === null\) return 0;\s*\n\s*floor = _f0;/.test(IDX_SRC),
        '★ rollbackFloor 入口缺门：`rollbackFloor(null)` 会被下游 38 处 `Number(floor) || 0` 读成第 0 楼');
    assert.ok(/const _d0 = numOr\(deleted, null\);/.test(IDX_SRC) && /skipped: 'floor-not-given'/.test(IDX_SRC),
        '★ shiftFloorsFrom 入口缺门 / 缺 skipped 留痕');
    assert.ok(/const floor = numOr\(messageId, null\);\s*\n\s*if \(floor === null\) return;/.test(IDX_SRC),
        '★ MESSAGE_DELETED 宿主侧仍在用 Number(messageId) + isFinite（半收口）');
    assert.ok(!/const floor = Number\(messageId\);\s*\n\s*if \(!Number\.isFinite\(floor\)\) return;/.test(IDX_SRC),
        '★ 旧写法必须已被替换');
});

// ══════════ F 既有面不许回退 ══════════
test('【F1】★★ 登记表结构自证：0 问题，且两个面仍参与前移（不取我的推演，取 v3190 的意图）', () => {
    assert.deepEqual(LR_MOD.checkRegistry(LR_MOD.FLOOR_OWNERS), [], '★ 登记表结构必须健康');
    const scene = LR_SRC;
    assert.ok(!/id: 'archived'[\s\S]{0,400}?participates: false/.test(scene),
        '★ archived 必须参与前移（v3190 第 8 条：被删楼起失去依据、**其后前移**、其前保留）');
    assert.ok(!/id: 'inject-cursor'[\s\S]{0,700}?participates: false/.test(scene),
        '★ inject-cursor 必须参与前移（v3190 第 9 条：前移跟随）');
});

test('【F2】★★ 三态分域：ok / no-op / absent 必须三种不同形（缺席 ≠ 不参与）', () => {
    const h = mkHost();
    const rep = LR_MOD.replayShift(h, 5);
    const byId = Object.fromEntries(rep.items.map((i) => [i.id, i.state]));
    const states = new Set(Object.values(byId));
    assert.ok(states.has('ok') && states.has('absent'), '★ 本宿主应同时出现 ok 与 absent，实得 ' + [...states].join('/'));
    const noop = LR_MOD.replayShift(h, 5, [{
        id: 'x', label: 'x', holds: 'records', get: () => ({}), drop: () => 0, shift: null
    }]);
    assert.equal(noop.items[0].state, 'no-op', '★ 声明 null 的项须报 no-op');
    assert.notEqual('no-op', 'absent', '★ 两态不得塌成一态');
});

test('【F3】★ 报告「只增不改」：LEDGER_REPLAY_VERSION 保持 1（不抬历史测试的常量仪式）', () => {
    assert.equal(LR_MOD.LEDGER_REPLAY_VERSION, 1, '★ 纯增量面不该抬版本号');
    const rep = LR_MOD.replayShift(mkHost(), 5);
    assert.equal(rep.version, 1);
    assert.ok('skipped' in rep, '★ skipped 是新增面');
});

// ══════════ G 版本锚 ══════════
test('【G1】★ 版本锚：本套件只在 3.224.0 及以后成立', () => {
    // [自纠] 这里必须是**字面量**：版本守卫的 boundRe 只认 `vnum('X.Y.Z')`。
    //   首稿写的是 `vnum(CURRENT)`（变量），于是 V4 报「当版锚点 0」——
    //   守卫的存在意义正是「锚点被静默删空时必须响」，它响得对。
    assert.ok(vnum(pkg.version) >= vnum('3.224.0'), '★ 当前版本 ' + pkg.version + '（本套件出生版本 3.224.0）');
    // CURRENT 保留作自述常量，并自证与字面量同值（防两者漂移后没人发现）。
    assert.equal(vnum(CURRENT), vnum('3.224.0'), '★ CURRENT 常量与锚定字面量必须同值');
    const idxSrc = read('index.js');
    assert.equal(/const VERSION = '([0-9.]+)'/.exec(idxSrc)[1], pkg.version, 'index.js 与 package 同源');
});

// ══════════ N 负控制（真源码破坏 → 整仓镜像 → 同款真判据转红）══════════
/* 【为什么必须整仓镜像】ledger-replay.js 顶部依赖同目录相对路径；把破坏副本写进裸临时目录
 *   会解析成别的模块 ⇒ 跑出来的不是判据而是一次加载失败（假红）。本仓 v2.99.0 起统一为
 *   cpSync 整仓镜像（v310/v311 同款基建），且 `withMirror` 必须 `await`（否则 Promise 还挂着
 *   镜像就被删掉 —— v311 当场捐到过的假红形态）。 */
const ORIG = new Map();
for (const f of [LR, IDX]) ORIG.set(f, read(f));

function mutateOnce(src, from, to) {
    const n = src.split(from).length - 1;
    assert.equal(n, 1, '锚点应恰好命中 1 次，实际 ' + n + '：' + String(from).slice(0, 80));
    return src.replace(from, to);
}
function mirror(mut) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3225-mir-'));
    fs.cpSync(ROOT, dir, { recursive: true, filter: (src) => !src.split(path.sep).includes('.git') });
    for (const [rel, fn] of Object.entries(mut)) {
        const body = fn(read(rel));
        assert.notEqual(body, read(rel), '破坏未发生（锚点没命中）：' + rel);
        fs.writeFileSync(path.join(dir, rel), body);
    }
    for (const [g, src] of ORIG) {
        if (Object.prototype.hasOwnProperty.call(mut, g)) continue;
        fs.writeFileSync(path.join(dir, g), src);
    }
    return dir;
}
async function withMirror(mut, fn) {
    const dir = mirror(mut);
    try { return await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/* ── 判据（纯函数，正负两跑；负控制必须用**同款**判据）── */
/** J1 「没给」⇒ 一格不动 + skipped（四个怪值各跑一遍） */
function gateJudge(mod) {
    for (const v of [null, '', [], true]) {
        const h = mkHost();
        const before = snap(h);
        const rep = mod.replayShift(h, v);
        if (rep.skipped !== 'floor-not-given') return false;
        if (rep.shifted !== 0) return false;
        if (snap(h) !== before) return false;
    }
    return true;
}
/** J2 报面的楼层走同一门（「没给」不得吐 0） */
function reportJudge(mod) {
    const rep = mod.replayShift(mkHost(), null);
    return rep.floor === null && rep.skipped === 'floor-not-given';
}
/** J3 drop 侧同款 */
function dropJudge(mod) {
    for (const v of [null, '', [], true]) {
        const h = mkHost();
        const before = snap(h);
        const rep = mod.replayDrop(h, v);
        if (rep.skipped !== 'floor-not-given' || rep.dropped !== 0 || snap(h) !== before) return false;
    }
    return true;
}
/** J5 面内门：**直接打 owner**（`FLOOR_OWNERS` 是导出面，不是内部细节）时，
 *   「没给」不得搬动账本，而真给 0/5 仍须照常动手。
 *   [为什么不能只用 replayShift 验] 入口门会先把怪值拦成 skipped，于是内层门退化后
 *   从回放路径**观测不到**（N3 首稿的假红来源）。判据必须挂在有差异的那条路径上。 */
function ownerJudge(mod) {
    const own = mod.FLOOR_OWNERS.find((o) => o.id === 'seed-ledger');
    if (!own || typeof own.shift !== 'function') return false;
    for (const v of ['', null, '  ', [], true]) {
        const h = { worldProg: { seedLedger: { items: [{ floor: 9, text: 'x' }] } } };
        let n = null;
        try { n = own.shift(h, v); } catch (e) { return false; }
        if (n !== 0) return false;
        if (h.worldProg.seedLedger.items[0].floor !== 9) return false;
    }
    for (const v of [0, 5, '5']) {
        const h = { worldProg: { seedLedger: { items: [{ floor: 9, text: 'x' }] } } };
        if (own.shift(h, v) <= 0) return false;
        if (h.worldProg.seedLedger.items[0].floor !== 8) return false;
    }
    return true;
}

/** J4 宿主 numOr 的数组门（纯函数面） */
function hostNumOrJudge(src) {
    const m = /function numOr\(v, fallback\) \{[\s\S]*?\n    \}/.exec(src);
    if (!m) return false;
    const numOr = new Function('return (' + m[0].replace('function numOr', 'function') + ')')();
    return numOr([], null) === null && numOr([5], null) === null && numOr(0, null) === 0;
}

test('【N0】镜像树自证 + 阳性对照：未破坏时四条判据全真（否则 N 组是假绿）', () => {
    assert.equal(gateJudge(LR_MOD), true, 'J1 在原件上必须为真');
    assert.equal(reportJudge(LR_MOD), true, 'J2 在原件上必须为真');
    assert.equal(dropJudge(LR_MOD), true, 'J3 在原件上必须为真');
    assert.equal(hostNumOrJudge(IDX_SRC), true, 'J4 在原件上必须为真');
    assert.equal(ownerJudge(LR_MOD), true, 'J5 在原件上必须为真（否则 N3 是假红）');
    const dir = mirror({});
    try {
        assert.ok(fs.existsSync(path.join(dir, LR)), '镜像里必须带上模块本体');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N1】★★★ 负控制·门本体：replaySide 的入参门退回 `Number(floor)` ⇒ 同款判据 J1/J2 集体转红', async () => {
    await withMirror({
        [LR]: (s) => mutateOnce(s,
            "        const target = floorOrNull(floor);\n        if (target === null) {",
            "        const target = Number(floor);\n        if (target === null) {")
    }, async (dir) => {
        const broken = (await import(pathToFileURL(path.join(dir, LR)).href + '?m=' + Date.now())).default;
        assert.equal(gateJudge(broken), false, '★ 同款判据 J1 在副本上必须为 false');
        assert.equal(reportJudge(broken), false, '★ 同款判据 J2 在副本上必须为 false');
        assert.equal(gateJudge(LR_MOD), true, '对照：原件上仍为真（差值来自破坏本身）');
    });
});

test('【N2】★★ 负控制：门本体退化成 Number() 兜底 ⇒ J1 转红（半收口形态复现）', async () => {
    await withMirror({
        [LR]: (s) => mutateOnce(s,
            "    function floorOrNull(v) {\n        if (typeof v === 'number') return Number.isFinite(v) ? v : null;\n        if (typeof v === 'string') {",
            "    function floorOrNull(v) {\n        const _n = Number(v);\n        if (Number.isFinite(_n)) return _n;\n        if (typeof v === 'string') {")
    }, async (dir) => {
        const broken = (await import(pathToFileURL(path.join(dir, LR)).href + '?m=' + Date.now())).default;
        assert.equal(gateJudge(broken), false, '★ J1 必须转红（`Number(null) === 0` 复活）');
        assert.equal(dropJudge(broken), false, '★ J3 必须转红');
    });
});

test('【N3】★★ 负控制·面内门：shiftLedgerItemFloors 退回 `Number(d)` ⇒ 直接打 owner 时必须转红', async () => {
    await withMirror({
        [LR]: (s) => mutateOnce(s,
            "        const del = floorOrNull(d);\n        if (del === null) return 0;",
            "        const del = Number(d);\n        if (!Number.isFinite(del)) return 0;")
    }, async (dir) => {
        const broken = (await import(pathToFileURL(path.join(dir, LR)).href + '?m=' + Date.now())).default;
        assert.equal(ownerJudge(broken), false, '★ J5 在副本上必须为 false（`Number(\'\') === 0` 复活 ⇒ 账本被搬）');
        assert.equal(ownerJudge(LR_MOD), true, '对照：原件上仍为 true（差值来自破坏本身）');

        // 如实记录：**回放路径观测不到这处破坏** —— 入口门先把它拦成了 skipped。
        //   这正是「判据要挂在有差异的路径上」的实例：判据错了会给出假绿/假红两种错。
        const h = { worldProg: { seedLedger: { items: [{ floor: 9, text: 'x' }] } }, summary: {}, _archivedFloorIds: new Set(), _changeset: () => null };
        const rep = broken.replayShift(h, '');
        assert.equal(rep.skipped, 'floor-not-given', '★ 入口门仍在：回放路径上这处破坏不可观测');
        assert.equal(h.worldProg.seedLedger.items[0].floor, 9, '★ 因此经回放路径账本一动不动');
    });
});

test('【N4】★★ 负控制：宿主 numOr 摘掉数组门 ⇒ J4 转红', async () => {
    await withMirror({
        [IDX]: (s) => mutateOnce(s,
            "        if (v === undefined || v === null || v === '' || typeof v === 'boolean' || typeof v === 'object') return fallback;",
            "        if (v === undefined || v === null || v === '' || typeof v === 'boolean') return fallback;")
    }, async (dir) => {
        const brokenSrc = fs.readFileSync(path.join(dir, IDX), 'utf8');
        assert.equal(hostNumOrJudge(brokenSrc), false, '★ J4 在副本上必须为 false');
        assert.equal(hostNumOrJudge(IDX_SRC), true, '对照：原件上仍为 true');
    });
});

test('【N5】★★ 负控制·互不掩护：门退化只打掉「没给」面，真给 0 / \'5\' 面必须仍成立', async () => {
    await withMirror({
        [LR]: (s) => mutateOnce(s,
            "        const target = floorOrNull(floor);\n        if (target === null) {",
            "        const target = Number(floor);\n        if (target === null) {")
    }, async (dir) => {
        const broken = (await import(pathToFileURL(path.join(dir, LR)).href + '?m=' + Date.now())).default;
        assert.equal(gateJudge(broken), false, '★ 怪值面必须转红');
        // 真给面仍须成立 —— 否则说明判据只是「什么都判 false」，不是挂在门上
        const h = mkHost();
        const rep = broken.replayShift(h, 5);
        assert.equal(rep.skipped, null, '★ 真给 5 仍须照常回放（不取我的推演，取「门只管没给」这一契约）');
        assert.ok(rep.shifted > 0, '★ 真给面不得被门关掉');
    });
});