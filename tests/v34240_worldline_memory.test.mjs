/* ============================================================
 * tests/v34240_worldline_memory.test.mjs — v3.424.0
 * M7-X1 世界线记忆与跨线污染闸（worldline-memory.js）
 *
 * 修的是什么（修前实测，读码可复算）：
 *   命运石之门这一类**不是分支问题**，是「哪条世界线」问题。同一角色在 α 线与 β 线
 *   是两个人生，只有跨线保留者（Reading Steiner）记得别的线。
 *   本仓既有 branch-guard（楼层归属）/ branch-semantics（同会话分支对照）/
 *   branch-canon（支线正史）/ knowledge-trace（知情轨迹）/ secret-ledger（秘密边界）
 *   以及浅层 cross-branch-deja-vu-resonance-chamber（只做 8 字前缀 includes）
 *   **没有一处判「这条记忆属于哪条线」** —— 异线记忆被一视同仁注入给所有角色。
 *
 * 本刀的口径（每条都可当场证伪）：
 *   ★ 四态穷尽互斥 native / adjacent / foreign / unknown；
 *   ★ 无标 ≠ 本线（unknown 恒 undecided，绝不与 native 同形）；
 *   ★ 同 lineId 但变动率差超 epsilon ⇒ 判不了（不猜同线、也不给它「已知的远」的假身份）；
 *   ★ 邻近只由「同吸引域 + 够近」产生，跨域不得算邻近；
 *   ★ 收束三态：未登记 ≠ 不会发生；
 *   ★ 跨线保留者记得别的线，但仍带 byState 标注；名单外异线必挡；
 *   ★ 换线计划同键异值单列 conflict，不静默取其一；计划不落盘；
 *   ★ 纯只读：入参跑完逐字不变。
 *
 * 关掉（默认关）时的纪律：**不判也不猜**，如实报 disabled，
 *   绝不返回「全 kept」的假安全面 —— 那是把「没开闸」读成「都放行」。
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, copyFileSync } from 'fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ROOT = REPO_ROOT;
const require_ = createRequire(import.meta.url);

const WM = require_(path.join(ROOT, 'worldline-memory.js'));
const DL = require_(path.join(ROOT, 'engine-diagnostic-lines.js'));

/* 与 index.js 里那七行转发逐字同形（宿主出口一律转发，业务在诊断线模块） */
const HOST = {
    _worldlineState(...a) { return DL._worldlineState(this, ...a); },
    _worldlineRead(...a) { return DL._worldlineRead(this, ...a); },
    worldlineGate(...a) { return DL.worldlineGate(this, ...a); },
    worldlineConvergence(...a) { return DL.worldlineConvergence(this, ...a); },
    worldlineSwitchPlan(...a) { return DL.worldlineSwitchPlan(this, ...a); },
    worldlineDiff(...a) { return DL.worldlineDiff(this, ...a); },
    _worldlineLine(...a) { return DL._worldlineLine(this, ...a); },
};
function bindReal() {
    globalThis.window = globalThis;
    globalThis.LonShaWorldlineMemory = WM;
    DL.bindDeps({
        moduleLib: (getGlobal, fileName) => {
            try { const g = getGlobal(); if (g) return g; } catch (_) { /* fallthrough */ }
            try { return require_(path.join(ROOT, fileName)); } catch (_) { return null; }
        },
        errLog: () => {},
        libs: { _worldlineMemoryLib: () => require_(path.join(ROOT, 'worldline-memory.js')) },
    });
}
function makeEngine(cfg) {
    const e = { config: { config: Object.assign({}, cfg) }, worldProg: null };
    for (const k of Object.keys(HOST)) e[k] = HOST[k];
    return e;
}
function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}
const src = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const diagSrc = readFileSync(path.join(ROOT, 'engine-diagnostic-lines.js'), 'utf8');
const recallSrc = readFileSync(path.join(ROOT, 'engine-recall.js'), 'utf8');
const uiSrc = readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf8');
const cfgSrc = readFileSync(path.join(ROOT, 'memory-config.js'), 'utf8');
const organsSrc = readFileSync(path.join(ROOT, 'memory-organs.js'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

bindReal();

/* ================= A 结构面 ================= */
test('A1 内核已入册 manifest，且有取库口 + 宿主出口 + 诊断行', () => {
    assert.ok(manifest.extra_js.includes('worldline-memory.js'), 'extra_js 已登记');
    assert.strictEqual(src.match(/function _worldlineMemoryLib\(\)/g).length, 1, '取库口恰一处');
    assert.ok(src.includes("_moduleLib(() => window.LonShaWorldlineMemory, 'worldline-memory.js')"),
        '取库口指向真全局名');
    for (const name of ['_worldlineState', '_worldlineRead', 'worldlineGate', 'worldlineConvergence',
        'worldlineSwitchPlan', 'worldlineDiff', '_worldlineLine']) {
        assert.strictEqual(src.match(new RegExp('\\b' + name + '\\(\\.\\.\\.args\\)', 'g')).length, 1,
            '宿主出口恰一处: ' + name);
    }
    assert.ok(src.includes('_worldlineMemoryLib: _worldlineMemoryLib,'),
        '诊断线模块的取库依赖已注入（libs 映射写在 index.js 的 bindDeps 调用点）');
    assert.strictEqual(diagSrc.match(/function _worldlineMemoryLib\(\) \{ return _libs\._worldlineMemoryLib/g).length, 1,
        '诊断线模块侧取库函数恰一处（走 _libs 而非 _moduleLib，与既有文件同形）');
});

test('A2 内核公开面：版本 + 四态 + 三关系 + 三收束态 + 五桶 + 五策略常量', () => {
    assert.strictEqual(WM.WM_VERSION, 1);
    assert.strictEqual(WM.WM_KIND, 'worldline_memory');
    assert.deepStrictEqual(Object.values(WM.LINE_STATE).sort(), ['adjacent', 'foreign', 'native', 'unknown']);
    assert.deepStrictEqual(Object.values(WM.GATE).sort(), ['blocked', 'held', 'kept', 'undecided']);
    assert.deepStrictEqual(Object.values(WM.CONVERGE).sort(), ['converged', 'not-converged', 'unregistered'],
        '收束恰三态，且「未登记」与「不收束」不同形');
    assert.deepStrictEqual(Object.values(WM.PLAN).sort(), ['carry', 'conflict', 'invalidate', 'shadow', 'undecided'],
        '换线计划恰五桶');
    assert.deepStrictEqual(WM.ADJACENT_POLICIES.slice().sort(), ['allow', 'block', 'hold']);
    assert.ok(WM.MARK_FIELDS.includes('worldline'));
    assert.ok(!WM.MARK_FIELDS.includes('line'), '刻意不认裸 line（防与其他账本字段撞名）');
});

test('A3 内核零依赖、零网络、零持久化：实现体不读宿主 this', () => {
    const code = readFileSync(path.join(ROOT, 'worldline-memory.js'), 'utf8');
    for (const bad of ['require(', 'fetch(', 'localStorage', 'indexedDB', 'XMLHttpRequest']) {
        assert.ok(!code.includes(bad), '内核实现体不得出现: ' + bad);
    }
});

/* ================= B 内核真跑 ================= */
test('B1 四态穷尽互斥：三条样本各落一态，无标落 unknown', () => {
    const L1 = { lineId: 'A', divergence: 0.2 };
    const got = [
        WM.tagOf({ worldline: { lineId: 'A', divergence: 0.2 } }, L1).state,
        WM.tagOf({ worldline: { lineId: 'B', divergence: 0.25 } }, L1).state,
        WM.tagOf({ worldline: { lineId: 'C', divergence: 0.9 } }, L1).state,
        WM.tagOf({ text: 'no mark' }, L1).state,
    ];
    assert.deepStrictEqual(got, ['native', 'adjacent', 'foreign', 'unknown']);
    assert.strictEqual(new Set(got).size, 4, '四态互斥');
});

test('B2 无标绝不判成本线', () => {
    const L1 = { lineId: 'A', divergence: 0.2 };
    const t = WM.tagOf({ text: 'x' }, L1);
    assert.notStrictEqual(t.state, 'native');
    assert.strictEqual(t.why, 'no-line-mark');
});

test('B3 同 lineId 但变动率差超容差 ⇒ 判不了（不猜同线）', () => {
    const r = WM.relationOf({ lineId: 'A', divergence: 0.2 }, { lineId: 'A', divergence: 0.6 });
    assert.strictEqual(r.relation, 'unknown');
    assert.strictEqual(r.why, 'same-line-id-divergence-gap');
});

test('B4 邻近只由「同吸引域 + 够近」产生，跨域不得算邻近', () => {
    const near = WM.relationOf({ lineId: 'A', divergence: 0.2 }, { lineId: 'B', divergence: 0.95 });
    assert.notStrictEqual(near.relation, 'near');
    const ok = WM.relationOf({ lineId: 'A', divergence: 0.2 }, { lineId: 'B', divergence: 0.25 });
    assert.strictEqual(ok.relation, 'near');
});

test('B5 收束三态不同形：converged / not-converged / unregistered', () => {
    const st = {
        current: { lineId: 'A', divergence: 0.2 },
        convergences: [{ key: 'k1', scope: 'all' }, { key: 'k2', scope: ['gamma'] }],
    };
    assert.strictEqual(WM.convergenceOf('k1', st).state, 'converged');
    assert.strictEqual(WM.convergenceOf('k2', st).state, 'not-converged');
    assert.strictEqual(WM.convergenceOf('k3', st).state, 'unregistered');
});

test('B6 名单外异线必挡、名单内仍带标注', () => {
    const L1 = { lineId: 'A', divergence: 0.2 };
    const L3 = { lineId: 'C', divergence: 0.9 };
    const g1 = WM.guard([{ id: 'x', worldline: L3 }], '甲', { current: L1, readers: ['乙'] });
    assert.strictEqual(g1.counts.blocked, 1);
    assert.strictEqual(g1.reader, false);
    const g2 = WM.guard([{ id: 'x', worldline: L3 }], '乙', { current: L1, readers: ['乙'] });
    assert.strictEqual(g2.counts.kept, 1);
    assert.strictEqual(g2.reader, true);
    assert.strictEqual(g2.byState.foreign, 1, '保留者拿到的异线记忆仍带标注');
});

test('B7 换线计划同键异值单列冲突；纯只读不动入参', () => {
    const L1 = { lineId: 'A', divergence: 0.2 };
    const L2 = { lineId: 'B', divergence: 0.25 };
    const plan = WM.switchPlan(L2, {
        current: L1,
        entries: [{ id: 'a', text: 'v1', worldline: L1 }],
        targetEntries: [{ id: 'a', text: 'v2' }],
    });
    assert.strictEqual(plan.counts.conflict, 1);
    assert.strictEqual(plan.buckets.conflict[0].why, 'same-key-diff-value');

    const frozen = { current: L1, readers: ['甲'], entries: [{ id: 'a', text: 'v1', worldline: L1 }] };
    const snap = JSON.stringify(frozen);
    WM.guard(frozen.entries, '乙', frozen);
    WM.switchPlan(L2, frozen);
    WM.diffEntries(frozen.entries, []);
    assert.strictEqual(JSON.stringify(frozen), snap, '纯只读');
});

test('B8 内核九项自证全绿', () => {
    const r = WM.selfCheck();
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.failed, 0);
    assert.strictEqual(r.checks.length, 9);
});

/* ================= C 宿主接线真跑 ================= */
test('C1 开关默认关 ⇒ 如实报 disabled，绝不假装放行', () => {
    const e = makeEngine({});
    const r = e._worldlineRead({ items: [{ id: 'a' }] });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.disabled, true);
    assert.strictEqual(r.reason, 'disabled');
    assert.strictEqual(r.counts.kept, 0, '关着不能返回全 kept');
});

test('C2 宿主四态真跑：本线 kept / 邻近 held / 异线 blocked / 无标 undecided', () => {
    const e = makeEngine({
        worldlineMemoryEnabled: true, worldlineId: 'A', worldlineDivergence: 0.2,
        worldlineAdjacentPolicy: 'hold', worldlineReaders: '',
    });
    const g = e.worldlineGate({
        items: [
            { id: 'native', worldline: { lineId: 'A', divergence: 0.2 } },
            { id: 'adj', worldline: { lineId: 'B', divergence: 0.25 } },
            { id: 'foreign', worldline: { lineId: 'C', divergence: 0.9 } },
            { id: 'unmarked' },
        ],
    });
    assert.strictEqual(g.kept.length, 1);
    assert.strictEqual(g.kept[0].key, 'native');
    assert.strictEqual(g.held.length, 1);
    assert.strictEqual(g.blocked.length, 1);
    assert.strictEqual(g.undecided.length, 1);
    assert.strictEqual(g.counts.kept + g.counts.held + g.counts.blocked + g.counts.undecided, 4);
});

test('C3 邻近策略三支真跑且互不同形', () => {
    const mk = (p) => makeEngine({
        worldlineMemoryEnabled: true, worldlineId: 'A', worldlineDivergence: 0.2,
        worldlineAdjacentPolicy: p,
    }).worldlineGate({ items: [{ id: 'adj', worldline: { lineId: 'B', divergence: 0.25 } }] });
    const h = mk('hold'), a = mk('allow'), b = mk('block');
    assert.strictEqual(h.held.length, 1);
    assert.strictEqual(a.kept.length, 1);
    assert.strictEqual(b.blocked.length, 1);
    assert.deepStrictEqual([h.policy, a.policy, b.policy], ['hold', 'allow', 'block']);
});

test('C4 保留者名单从配置解析，非保留者被挡', () => {
    const e = makeEngine({
        worldlineMemoryEnabled: true, worldlineId: 'A', worldlineDivergence: 0.2,
        worldlineReaders: '冈部伦太郎，桥田至',
    });
    assert.deepStrictEqual(e._worldlineState({}).readers, ['冈部伦太郎', '桥田至']);
    const items = [{ id: 'f', worldline: { lineId: 'C', divergence: 0.9 } }];
    assert.strictEqual(e.worldlineGate({ items, viewer: '冈部伦太郎' }).kept.length, 1);
    assert.strictEqual(e.worldlineGate({ items, viewer: '真由理' }).blocked.length, 1);
});

test('C5 收束登记表从多行文本解析，未登记报 unregistered', () => {
    const e = makeEngine({
        worldlineMemoryEnabled: true, worldlineId: 'A', worldlineDivergence: 0.2,
        worldlineConvergences: '真由理之死=beta,gamma\n助手存活=all\n只有键没有域',
    });
    assert.strictEqual(e.worldlineConvergence('助手存活').state, 'converged');
    assert.strictEqual(e.worldlineConvergence('真由理之死').state, 'not-converged');
    assert.strictEqual(e.worldlineConvergence('完全没登记的事').state, 'unregistered');
});

test('C6 世界线闸可重复调用（结果写回键不得遮蔽同名方法）', () => {
    const e = makeEngine({ worldlineMemoryEnabled: true, worldlineId: 'A', worldlineDivergence: 0.2 });
    for (let i = 0; i < 3; i++) {
        const g = e.worldlineGate({ items: [{ id: 'n', worldline: { lineId: 'A', divergence: 0.2 } }] });
        assert.strictEqual(g.ok, true, '第 ' + (i + 1) + ' 次调用仍可用');
        assert.strictEqual(g.kept.length, 1);
    }
});

test('C7 诊断行：开时出行读数、关时明说未启用', () => {
    const on = makeEngine({ worldlineMemoryEnabled: true, worldlineId: 'A', worldlineDivergence: 0.2 });
    const off = makeEngine({ worldlineMemoryEnabled: false });
    assert.match(DL._worldlineLine(on), /线 A/);
    assert.match(DL._worldlineLine(on), /变动率/);
    assert.match(DL._worldlineLine(off), /未启用/);
});

/* ================= D 召回侧接线 ================= */
test('D1 召回链路里异线被摘、无标放行，且读数落账', () => {
    assert.ok(recallSrc.includes('worldlineGate'), '召回链路真调世界线闸');
    assert.ok(recallSrc.includes('_worldlineRecallFilter'), '过滤读数落账（否则「闸生效过」与「从未生效」同形');
    const e = makeEngine({
        worldlineMemoryEnabled: true, worldlineId: 'A', worldlineDivergence: 0.2,
        worldlineAdjacentPolicy: 'hold',
    });
    const merged = [
        { id: 'n', worldline: { lineId: 'A', divergence: 0.2 } },
        { id: 'f', worldline: { lineId: 'C', divergence: 0.9 } },
        { id: 'u' },
    ];
    const g = e.worldlineGate({ items: merged });
    const drop = new Set();
    for (const r of g.blocked) if (r.item) drop.add(r.item);
    for (const r of g.held) if (r.item) drop.add(r.item);
    assert.deepStrictEqual(merged.filter(x => !drop.has(x)).map(x => x.id), ['n', 'u']);
    assert.strictEqual(g.byState.foreign, 1);
    assert.strictEqual(g.byState.unknown, 1);
});

test('D2 召回侧只在开关打开时过闸（关着零行为变化）', () => {
    assert.ok(/worldlineMemoryEnabled === true/.test(recallSrc), '召回侧同样先查开关');
});

/* ================= E 持久化面 ================= */
test('E1 WorldProgress 三处成对：构造 / export / import', () => {
    const MO = require_(path.join(ROOT, 'memory-organs.js'));
    const cls = MO.WorldProgress;
    assert.strictEqual(typeof cls, 'function', 'WorldProgress 可取');
    const wp = new cls();
    assert.ok(Object.prototype.hasOwnProperty.call(wp, 'worldline'), '构造即声明 worldline');
    wp.worldline = { lineId: 'A', divergence: 0.2, readers: ['甲'], convergences: [], lastGateRead: null };
    const ex = wp.export();
    assert.ok(ex.worldline && ex.worldline.lineId === 'A', 'export 带 worldline');
    const wp2 = new cls();
    wp2.import(ex);
    assert.ok(wp2.worldline && wp2.worldline.lineId === 'A', 'import 还原');
});

test('E2 lastGateRead 只作读数缓存，不带 floor（故不需要 removeByFloor 分支）', () => {
    assert.ok(/lastGateRead = \{ ts: Date\.now\(\)/.test(diagSrc), '写的是 ts 不是 floor');
    assert.ok(!/this\.worldline\.lastGateRead[\s\S]{0,80}floor/.test(organsSrc), '不引入楼层引用');
});

/* ================= F 配置可达性 ================= */
test('F1 六个配置键都有 UI 控件（v3161 可达性）', () => {
    for (const k of ['worldlineMemoryEnabled', 'worldlineId', 'worldlineDivergence',
        'worldlineAdjacentPolicy', 'worldlineReaders', 'worldlineConvergences']) {
        assert.ok(uiSrc.includes(k), 'UI 有控件: ' + k);
        assert.ok(cfgSrc.includes(k + ':'), '默认块已声明: ' + k);
    }
    assert.strictEqual(uiSrc.match(/data-cfg-num="worldlineDivergence"/g).length, 1, '滑块恰一处');
    assert.ok(uiSrc.includes('id="ls-v-wldiv"'), '滑块数值标签存在');
});

test('F2 min=0 的变动率滑块用 ?? 不用 ||', () => {
    assert.ok(uiSrc.includes('value="${c.worldlineDivergence ?? 1.0}"'));
    assert.ok(!/worldlineDivergence \|\| /.test(uiSrc), '0 是合法变动率，不得被 || 吃掉');
});

/* ================= G 真源码破坏负控制 ================= */
/* 每条负控制：在临时副本上真改源码 → 真跑同款判据 → 必须观测到行为改变。
 *   禁止「对原文件断言」或「把破坏写死成模拟常量」（那两种是假绿三形之一）。 */
/* 破坏锚点：字面量在全档只准声明一次（H1 判据纯度），G 段与 H 段都引用常量名。
 *   锚点一律逐字取自真实源码，改源码时这里会以「恰中 1 次」失败先叫。 */
const ANCHOR_NO_MARK = "return { state: LINE_STATE.UNKNOWN, why: 'no-line-mark', relation: '', distance: null };";
const ANCHOR_SAME_ID_GAP = "return { relation: RELATION.UNKNOWN, why: 'same-line-id-divergence-gap'";
const ANCHOR_NOT_REGISTERED = "return { state: CONVERGE.UNREGISTERED, why: 'not-registered', scope: [] };";
const ANCHOR_DISABLED = "if (cfg.worldlineMemoryEnabled !== true) return absent('disabled');";

function withBrokenCopy(fileName, from, to, fn) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'wl-br-'));
    try {
        const target = path.join(dir, fileName);
        copyFileSync(path.join(ROOT, fileName), target);
        const code = readFileSync(target, 'utf8');
        const hits = code.split(from).length - 1;
        assert.strictEqual(hits, 1, '破坏锚点在 ' + fileName + ' 内必须恰中 1 次（实中 ' + hits + '）');
        writeFileSync(target, code.replace(from, to), 'utf8');
        fn(target, dir);
    } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('G1 破坏「无标落 unknown」⇒ 四态不再穷尽（行为真变）', () => {
    /* 原版阳性对照 */
    const L1 = { lineId: 'A', divergence: 0.2 };
    assert.strictEqual(WM.tagOf({ text: 'x' }, L1).state, 'unknown');
    withBrokenCopy('worldline-memory.js', ANCHOR_NO_MARK,
        "return { state: LINE_STATE.NATIVE, why: 'no-line-mark', relation: '', distance: null };", (target) => {
            delete require_.cache[target];
            const broken = require_(target);
            assert.strictEqual(broken.tagOf({ text: 'x' }, L1).state, 'native', '破坏后真的判成本线了（证明判据真的读这条路径）');
            assert.notStrictEqual(broken.tagOf({ text: 'x' }, L1).state, 'unknown');
        });
    delete require_.cache[path.join(ROOT, 'worldline-memory.js')];
    bindReal();
});

test('G2 破坏「同号超差判不了」⇒ 退回猜同线（行为真变）', () => {
    const a = { lineId: 'A', divergence: 0.2 }, b = { lineId: 'A', divergence: 0.6 };
    assert.strictEqual(WM.relationOf(a, b).relation, 'unknown');
    withBrokenCopy('worldline-memory.js', ANCHOR_SAME_ID_GAP,
        "return { relation: RELATION.SAME, why: 'same-line-id-divergence-gap'", (target) => {
            delete require_.cache[target];
            const broken = require_(target);
            assert.strictEqual(broken.relationOf(a, b).relation, 'same', '破坏后真的猜成同线');
        });
    delete require_.cache[path.join(ROOT, 'worldline-memory.js')];
    bindReal();
});

test('G3 破坏「未登记 ⇒ unregistered」⇒ 未登记被读成不会发生（行为真变）', () => {
    const st = { current: { lineId: 'A', divergence: 0.2 }, convergences: [] };
    assert.strictEqual(WM.convergenceOf('nope', st).state, 'unregistered');
    withBrokenCopy('worldline-memory.js', ANCHOR_NOT_REGISTERED,
        "return { state: CONVERGE.NO, why: 'not-registered', scope: [] };", (target) => {
            delete require_.cache[target];
            const broken = require_(target);
            assert.strictEqual(broken.convergenceOf('nope', st).state, 'not-converged', '破坏后未登记被读成拒收束');
        });
    delete require_.cache[path.join(ROOT, 'worldline-memory.js')];
    bindReal();
});

test('G4 破坏「关着报 disabled」⇒ 关闸被读成全放行（行为真变）', () => {
    const off = makeEngine({ worldlineMemoryEnabled: false });
    assert.strictEqual(off._worldlineRead({ items: [] }).disabled, true);
    withBrokenCopy('engine-diagnostic-lines.js', ANCHOR_DISABLED,
        "if (false) return absent('disabled');", (target) => {
            delete require_.cache[target];
            const broken = require_(target);
            broken.bindDeps({
                moduleLib: () => null, errLog: () => {},
                libs: { _worldlineMemoryLib: () => WM },
            });
            const r = broken._worldlineRead(off, { items: [{ id: 'a' }] });
            assert.notStrictEqual(r.reason, 'disabled', '破坏后关闸状态不再被识别');
            assert.strictEqual(r.ok, true, '破坏后关着也照判 —— 正是「没开闸读成放行」');
        });
    delete require_.cache[path.join(ROOT, 'engine-diagnostic-lines.js')];
    bindReal();
});

/* ================= H 判据纯度与版本锚 ================= */
test('H1 判据纯度：本档破坏锚点在本档内只声明一次', () => {
    const self = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    for (const anchor of [ANCHOR_NO_MARK, ANCHOR_SAME_ID_GAP, ANCHOR_NOT_REGISTERED, ANCHOR_DISABLED]) {
        assert.strictEqual(self.split(anchor).length - 1, 1, '锚点在本档恰一次: ' + anchor.slice(0, 40));
    }
});

test('H2 版本锚：六源同源 + 出生版本下界', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    assert.strictEqual(v, manifest.version, 'manifest 跟随 index.js');
    assert.strictEqual(v, JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version);
    for (const f of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const t = readFileSync(path.join(ROOT, f), 'utf8');
        assert.strictEqual(/let VERSION = '([0-9.]+)'/.exec(t)[1], v, f + ' 与入口同源');
    }
    assert.ok(vnum(v) >= vnum('3.424.0'), 'index.js 版本下界 3.424.0（实测 ' + v + '）');
});
