/* ============================================================
 * tests/v34240_worldline_memory.test.mjs — v3.425.0
 * M7-X1 世界线记忆与跨线污染闸（worldline-memory.js）
 *   本档出生在 v3.424.0；v3.424.1 自纠（`>1` 段变动率不得被压平）就地续写，
 *   v3.425.0 主键换血（变动率 → 纪元）就地续写，故文件头版本随当前版走，
 *   但锚点仍是 vnum 恰好对应当版（见 H2 段 SELF_VERSION）。
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

test('A2 内核公开面：版本 + 四态 + 三关系 + 三收束态 + 五桶 + 五策略 + 六纪元原语', () => {
    /* ★ [v3.425.0] WM_VERSION 1 → 2：主键从「变动率」换成「纪元（层标记@切换楼层）」，
     *   且公开面新增 normFloor / epochOf / epochAt / futureEpochOf / normLineId / READER_POLICIES。
     *   版本号是**契约信号**：外部若按 v1 的口径（lineId+divergence 即身份）读，
     *   会在「同层标记跨纪元」这一格拿到相反结论，故必须升版而不能静默改语义。 */
    assert.strictEqual(WM.WM_VERSION, 2);
    /* ★ 六个纪元原语必须在公开面上 —— 上一版实测 `W.epochAt is not a function`：
     *   函数存在、判据也过，但不在冻结对象里 ⇒ 宿主一律调不到 ⇒ 输入面永远空。
     *   这条判据专门钉住「内部有、外部没有」这个形态。 */
    for (const fn of ['normFloor', 'epochOf', 'epochAt', 'futureEpochOf', 'normLineId', 'normDivergence']) {
        assert.strictEqual(typeof WM[fn], 'function', '公开面缺函数: ' + fn);
    }
    assert.deepStrictEqual(WM.READER_POLICIES.slice().sort(), ['allow', 'none'],
        '保留者策略恰两支：none（默认）/ allow');
    assert.deepStrictEqual(WM.DEFAULT_BANDS, [], '内核默认零分段（去世界观化）');
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
    /* ★ [v3.425.0] adjacent 现在**必须显式给分段**才可达（同域 + 够近）：
     *   本版内核零预设，不给 bands 时 attractor 为空，「邻近」与「异线」同形。
     *   这不是把一态杀死 —— 是让数字编号成为真正的「可选能力」：
     *   配了 bands 的卡仍然有四态，没配的卡只有 同纪元 / 异纪元 / 判不了（三态）。
     *   故本判据两段都验：无 bands 时 adjacent 不可达，有 bands 时可达。 */
    const bandsOpt = { bands: [{ name: 'lo', hi: 0.5 }, { name: 'hi', hi: 1e9 }] };
    const got = [
        WM.tagOf({ worldline: { lineId: 'A', divergence: 0.2 } }, L1).state,
        WM.tagOf({ worldline: { lineId: 'B', divergence: 0.21 } }, L1, bandsOpt).state,
        WM.tagOf({ worldline: { lineId: 'C', divergence: 0.9 } }, L1).state,
        WM.tagOf({ text: 'no mark' }, L1).state,
    ];
    assert.deepStrictEqual(got, ['native', 'adjacent', 'foreign', 'unknown']);
    assert.strictEqual(new Set(got).size, 4, '四态互斥（显式分段时可穷举）');
    /* 无分段时 adjacent 关闭：同号不同值也不许当邻近 */
    const noBand = WM.tagOf({ worldline: { lineId: 'B', divergence: 0.21 } }, L1);
    assert.strictEqual(noBand.state, 'foreign', '无分段时邻近档自动关闭，落异线');
    assert.strictEqual(noBand.why, 'cross-line');
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
    /* ★ [v3.425.0] 邻近判定现在**必须同时满足三件**：两线都有 attractor（即显式给了
     *   bands）、attractor 相同、确有变动率且距离在 adjacentEpsilon 内。
     *   缺任何一件都退回 far —— 不再拿模型编的变动率单独当证据。 */
    const bandsOpt = { bands: [{ name: 'lo', hi: 0.5 }, { name: 'hi', hi: 1e9 }] };
    /* 有分段 + 同域 + 够近 ⇒ near */
    assert.strictEqual(
        WM.relationOf({ lineId: 'A', divergence: 0.2 }, { lineId: 'B', divergence: 0.25 }, bandsOpt).relation,
        'near');
    /* 有分段但跨域（0.2 在 lo，0.95 在 hi）⇒ 不是 near */
    assert.notStrictEqual(
        WM.relationOf({ lineId: 'A', divergence: 0.2 }, { lineId: 'B', divergence: 0.95 }, bandsOpt).relation,
        'near');
    /* ★ 无分段：即便够近也**不许**算邻近（没有「域」这回事，邻近无从谈起） */
    const noBand = WM.relationOf({ lineId: 'A', divergence: 0.2 }, { lineId: 'B', divergence: 0.25 });
    assert.strictEqual(noBand.relation, 'far', '无分段时数字不参与，不同层标记一律 far');
    assert.strictEqual(noBand.basis, 'line-id');
});

test('B5 收束三态不同形：converged / not-converged / unregistered', () => {
    /* ★ [v3.425.0] scope 里的域名字由**卡**给（本版零预设，没有 gamma 这个默认域）。
     *   不给 bands 时当前域为空 ⇒「没有当前域」与「域不匹配」会同形，三态验不出来。
     *   故这里显式给一套分段，用卡自己定义的名字（lo / hi）。 */
    const bandsOpt = { bands: [{ name: 'lo', hi: 0.5 }, { name: 'hi', hi: 1e9 }] };
    const st = {
        current: { lineId: 'A', divergence: 0.2 },   /* 落 lo */
        convergences: [{ key: 'k1', scope: 'all' }, { key: 'k2', scope: ['hi'] }],
    };
    assert.strictEqual(WM.convergenceOf('k1', st, bandsOpt).state, 'converged');
    assert.strictEqual(WM.convergenceOf('k2', st, bandsOpt).state, 'not-converged');
    assert.strictEqual(WM.convergenceOf('k3', st, bandsOpt).state, 'unregistered');
    /* 且：没有当前域时**不许**把「域不匹配」报成 not-converged（那是编一个否定） */
    const noAtt = WM.convergenceOf('k2', { current: { lineId: 'A', divergence: 0.2 }, convergences: [{ key: 'k2', scope: ['hi'] }] });
    assert.strictEqual(noAtt.state, 'unregistered', '没有当前域 ⇒ 判不了，不编否定');
    assert.strictEqual(noAtt.why, 'no-current-attractor');
});

test('B6 保留者特权默认关闭：名单外必挡，名单内默认也挡，显式 allow 才放行', () => {
    /* ★ [v3.425.0 · 方向反转] 这条判据在 v3.424.x 期待的是「名单内 kept===1」，
     *   即把「跨线保留者能拿到异线记忆」当**功能**。用户口径纠正后，那恰恰是要防的
     *   问题本身 —— 串的角色只是从配角换成了主角。故默认 none：**所有人都挡**。 */
    const L1 = { lineId: 'A', divergence: 0.2 };
    const L3 = { lineId: 'C', divergence: 0.9 };
    const g1 = WM.guard([{ id: 'x', worldline: L3 }], '甲', { current: L1, readers: ['乙'] });
    assert.strictEqual(g1.counts.blocked, 1);
    assert.strictEqual(g1.reader, false);
    /* 名单内、未配策略 ⇒ 仍然挡（默认 none） */
    const g2 = WM.guard([{ id: 'x', worldline: L3 }], '乙', { current: L1, readers: ['乙'] });
    assert.strictEqual(g2.counts.blocked, 1, '名单内默认也挡');
    assert.strictEqual(g2.reader, true, '但仍如实标出「他在名单里」');
    assert.strictEqual(g2.readerPolicy, 'none');
    /* 非法策略值一律折回 none：拼错一个词不能变成全放行 */
    const g3 = WM.guard([{ id: 'x', worldline: L3 }], '乙',
        { current: L1, readers: ['乙'], readerPolicy: 'allowll' });
    assert.strictEqual(g3.counts.blocked, 1);
    assert.strictEqual(g3.readerPolicy, 'none');
    assert.ok(g3.why.includes('reader-policy-illegal-fallback-none'));
    /* 显式 allow 才放行，且仍带 byState 标注（不是无条件 native） */
    const g4 = WM.guard([{ id: 'x', worldline: L3 }], '乙',
        { current: L1, readers: ['乙'], readerPolicy: 'allow' });
    assert.strictEqual(g4.counts.kept, 1);
    assert.strictEqual(g4.reader, true);
    assert.strictEqual(g4.byState.foreign, 1, '保留者拿到的异线记忆仍带标注');
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

test('B8 内核二十四项自证全绿（含纪元判据六项）', () => {
    const r = WM.selfCheck();
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.failed, 0);
    /* [v3.424.1] 9 -> 12：新增「超一变动率不被压平 / 超一段同号超差仍判不了 /
     *   超一读数不冒充百分百」三条 —— 它们钉的正是 v3.424.0 clamp01 压平那个缺陷。
     * ★ [v3.425.0] 12 -> 24：主键换血后新增十二项 ——
     *   内核零世界观预设 / 楼层合法化不吞 null / 纪元优先于变动率 / 同号跨纪元不串 /
     *   未来纪元对保留者也挡 / epochAt 反推纪元 / epochAt 无跳跃不猜 /
     *   无标条目按楼层反推 / 别名由配置提供 / 无分段则数字不参与 /
     *   名单内默认也挡 / 保留者策略非法值折回 none。
     *   项数是**契约**：少一项说明有判据被静默删掉过。 */
    assert.strictEqual(r.checks.length, 24);
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
    /* ★ [v3.425.0] 邻近档需要「域」，而本版内核零预设 ⇒ 必须显式配 worldlineBands，
     *   否则测到的是「没有分段这回事」（三态），而不是四态。
     *   这条同时证明：分段是**卡给的**，不是内核预设的。 */
    const e = makeEngine({
        worldlineMemoryEnabled: true, worldlineId: 'A', worldlineDivergence: 0.2,
        worldlineBands: 'lo<0.5\nhi<1000000000',
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
    /* ★ [v3.425.0] 同 C2：邻近档须有域，故显式配分段（域名字由卡自定）。 */
    const mk = (p) => makeEngine({
        worldlineMemoryEnabled: true, worldlineId: 'A', worldlineDivergence: 0.2,
        worldlineBands: 'lo<0.5\nhi<1000000000',
        worldlineAdjacentPolicy: p,
    }).worldlineGate({ items: [{ id: 'adj', worldline: { lineId: 'B', divergence: 0.25 } }] });
    const h = mk('hold'), a = mk('allow'), b = mk('block');
    assert.strictEqual(h.held.length, 1);
    assert.strictEqual(a.kept.length, 1);
    assert.strictEqual(b.blocked.length, 1);
    assert.deepStrictEqual([h.policy, a.policy, b.policy], ['hold', 'allow', 'block']);
});

test('C4 保留者名单从配置解析；默认策略下名单内也被挡，显式 allow 才放行', () => {
    /* ★ [v3.425.0 · 方向反转] 原判据断言「名单内 kept===1」，把保留者特权当功能。
     *   用户口径：谁都不该知道自己别条线的经历 —— 给名单内放行本身就是串。
     *   故默认 none：名单内也挡；要保留者题材必须显式开 allow。 */
    const e = makeEngine({
        worldlineMemoryEnabled: true, worldlineId: 'A', worldlineDivergence: 0.2,
        worldlineReaders: '主角甲，配角乙',
    });
    assert.deepStrictEqual(e._worldlineState({}).readers, ['主角甲', '配角乙']);
    assert.strictEqual(e._worldlineState({}).readerPolicy, 'none', '默认策略必须是 none');
    const items = [{ id: 'f', worldline: { lineId: 'C', divergence: 0.9 } }];
    assert.strictEqual(e.worldlineGate({ items, viewer: '主角甲' }).blocked.length, 1, '名单内默认也挡');
    assert.strictEqual(e.worldlineGate({ items, viewer: '旁人' }).blocked.length, 1);
    /* 显式开 allow：名单内放行、名单外仍挡 */
    const e2 = makeEngine({
        worldlineMemoryEnabled: true, worldlineId: 'A', worldlineDivergence: 0.2,
        worldlineReaders: '主角甲', worldlineReaderPolicy: 'allow',
    });
    assert.strictEqual(e2.worldlineGate({ items, viewer: '主角甲' }).kept.length, 1);
    assert.strictEqual(e2.worldlineGate({ items, viewer: '旁人' }).blocked.length, 1);
    /* 写错策略值 ⇒ 折回 none（不许拼错一个词变成全放行） */
    const e3 = makeEngine({
        worldlineMemoryEnabled: true, worldlineId: 'A', worldlineDivergence: 0.2,
        worldlineReaders: '主角甲', worldlineReaderPolicy: 'Allow',
    });
    assert.strictEqual(e3._worldlineState({}).readerPolicy, 'none');
    assert.strictEqual(e3.worldlineGate({ items, viewer: '主角甲' }).blocked.length, 1);
});

test('C5 收束登记表从多行文本解析，未登记报 unregistered', () => {
    /* ★ [v3.425.0] 域名字由卡给（本版零预设，不再有 gamma 这种内置域），
     *   且须显式配分段才有「当前域」。 */
    const e = makeEngine({
        worldlineMemoryEnabled: true, worldlineId: 'A', worldlineDivergence: 0.2,
        worldlineBands: 'lo<0.5\nhi<1000000000',
        worldlineConvergences: '某事=hi,alpha\n另一事=all\n只有键没有域',
    });
    assert.strictEqual(e.worldlineConvergence('另一事').state, 'converged');
    assert.strictEqual(e.worldlineConvergence('某事').state, 'not-converged');
    assert.strictEqual(e.worldlineConvergence('完全没登记的事').state, 'unregistered');
    /* ★ 三态语义边界（易混，故单列）：
     *   · 「完全没登记」⇒ unregistered（**查不到这个 key**，判不了）；
     *   · 「登记了键但没给域」⇒ 解析出 scope=[]，走到「登记过且本域不在 scope 里」
     *     ⇒ not-converged（**明确的本域不收束**）。
     *   二者必须不同形：把「登记过但本域不收束」报成 unregistered，
     *   等于把已知的否定降级成判不了；反过来把没登记报成 not-converged 是编否定。 */
    assert.strictEqual(e.worldlineConvergence('只有键没有域').state, 'not-converged',
        '登记了键但没给域 ⇒ 本域不收束（已知的否定），不是判不了');
    assert.strictEqual(e.worldlineConvergence('压根没这回事').state, 'unregistered',
        '查不到这个 key 才是判不了');
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
    /* [v3.424.1] 原判据锁的是「range 滑块 + ls-v-wldiv 数值标签」，而 range 被 min=0/max=1
     *   写死，等于在 UI 层又一次规定「变动率只能是 0~1」—— 与内核 clamp 同源的错误。
     *   改判形态而不改实质：控件仍恰一处，但必须是**能输 >1** 的文本框。 */
    assert.strictEqual(uiSrc.match(/data-cfg-num="worldlineDivergence"/g).length, 1, '控件恰一处');
    assert.ok(/<input type="text"[^>]*data-cfg-num="worldlineDivergence"/.test(uiSrc), '为可输 >1 的文本框');
    assert.ok(!/<input type="range"[^>]*worldlineDivergence/.test(uiSrc), '不得再用 range 锁死 0~1');
    assert.ok(uiSrc.includes('data-cfg-text="worldlineBands"'), '吸引域分段有控件（v3.424.1 新增）');
});

test('F2 变动率用 ?? 不用 ||（0 是合法值），默认取 β 线锚点', () => {
    /* [v3.424.1] 默认值 1.0 -> 1.048596（Steins;Gate 线）：旧默认 1.0 恰好落在「>1 才算 β」
     *   的边界上，配合旧 clamp 会让使用者永远看不到 β 段。 */
    assert.ok(uiSrc.includes('value="${c.worldlineDivergence ?? 1.048596}"'));
    assert.ok(!/worldlineDivergence \|\| /.test(uiSrc), '0 是合法变动率，不得被 || 吃掉');
});

/* ================= G 真源码破坏负控制 ================= */
/* 每条负控制：在临时副本上真改源码 → 真跑同款判据 → 必须观测到行为改变。
 *   禁止「对原文件断言」或「把破坏写死成模拟常量」（那两种是假绿三形之一）。 */
/* 破坏锚点：字面量在全档只准声明一次（H1 判据纯度），G 段与 H 段都引用常量名。
 *   锚点一律逐字取自真实源码，改源码时这里会以「恰中 1 次」失败先叫。 */
/* ★ [v3.425.0] 破坏锚点必须指向**真源码的返回语句**（tagOf 的 no-line-mark 分支）。
 *   旧锚点取的是 selfCheck 里的样本代码，而本版重写自证时那句已被删
 *   ⇒ 锚点命中 0 次 ⇒ 负控制失效（判据绿但没验到任何事）。
 *   这正是「破坏锚点须指向真 src」的要求：自证里的样本不是实现。 */
const ANCHOR_NO_MARK = "return { state: LINE_STATE.UNKNOWN, why: 'no-line-mark', relation: '', distance: null, basis: 'none' };";
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
        "return { state: LINE_STATE.NATIVE, why: 'no-line-mark', relation: '', distance: null, basis: 'none' };", (target) => {
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
    /* [v3.424.1] 自锚常量形（scan_version_guard V4「本档自锚常量」）：本档出生 3.424.0，
     *   续写至 3.424.1；下界仍写出生版本，等号锚单独用 SELF_VERSION 指出「本档就是当版」。 */
    const BIRTH_VERSION = '3.424.0';
    const SELF_VERSION = '3.425.0';
    assert.ok(vnum(v) >= vnum(BIRTH_VERSION), 'index.js 版本下界 ' + BIRTH_VERSION + '（实测 ' + v + '）');
    assert.strictEqual(vnum(v), vnum(SELF_VERSION), '本档即当版（自锚）');
});

/* ================= I v3.424.1 自纠：>1 段变动率不得被压平 ================= */
/* 这一段的由来（实测，非整洁性偏好）：
 *   v3.424.0 对变动率调 clamp01 压进 [0,1]，而《命运石之门》的 β 线正是 1.130205 / 1.048596
 *   这种 **大于 1** 的编号。压平后 1.130205 与 1.900000 都变成 1：
 *     · relationOf 里 distance 恒 0 ⇒ 「同号超差判不了」这条**本模块最核心的判据在 >1 段永不触发**；
 *     · 实测 byState = {native:4, adjacent:0, foreign:0, unknown:0} —— 四条真实相距 0.85 的
 *       不同世界线全部落 native，普通角色会拿到异线记忆（正是本模块要防的那个错误）；
 *     · 读数面把 113.02% 显示成 100%，使用者无从察觉。
 * 本段每条判据都对准那个缺陷，且锚点字面量在本档内只声明一次。 */

test('I1 超一变动率原样保留，不再被压成 1', () => {
    const L = WM.normalizeLine({ lineId: 'B', divergence: 1.130205 });
    assert.strictEqual(L.ok, true);
    assert.strictEqual(L.divergence, 1.130205, '1.130205 必须原样保留（clamp01 会压成 1）');
    assert.strictEqual(L.why, 'ok', '未被截断时 why 应为 ok，不报 clamped');
    const H = WM.normalizeLine({ lineId: 'B', divergence: 1.9 });
    assert.strictEqual(H.divergence, 1.9);
    /* 负值仍折 0：变动率没有负数语义，但这不是「上界截断」 */
    assert.strictEqual(WM.normalizeLine({ lineId: 'B', divergence: -0.5 }).divergence, 0);
    /* 非法值仍如实报，不猜 */
    assert.strictEqual(WM.normalizeLine({ lineId: 'B', divergence: 'abc' }).ok, false);
});

test('I2 同 lineId 在 >1 段相差超容差 ⇒ 仍判 unknown（核心判据不得在 >1 段失效）', () => {
    const rel = WM.relationOf({ lineId: 'B', divergence: 1.130205 }, { lineId: 'B', divergence: 1.9 });
    assert.strictEqual(rel.relation, WM.RELATION.UNKNOWN, '同号超差必须判不了，不许猜同线');
    assert.strictEqual(rel.why, 'same-line-id-divergence-gap');
    assert.strictEqual(rel.distance, 0.77, 'distance 必须是真实差值 0.77（clamp 压平后会是 0）');
    /* 容差内的同号线仍判 same —— 修正不得把判据整体打死 */
    const same = WM.relationOf({ lineId: 'B', divergence: 1.130205 }, { lineId: 'B', divergence: 1.135 });
    assert.strictEqual(same.relation, WM.RELATION.SAME);
});

test('I3 >1 段的不同世界线不得被认成本线（普通角色会因此拿到异线记忆）', () => {
    /* 粗粒度 lineId（'beta'）是最可能的真实用法：线号相同、变动率不同 */
    const cur = { lineId: 'beta', divergence: 1.130205 };
    const pool = [1.048596, 1.130205, 1.6, 1.9].map((d, i) => ({ id: 'm' + i, worldline: { lineId: 'beta', divergence: d } }));
    const g = WM.guard(pool, '椎名真由理', { current: cur });
    const states = WM.guard(pool, '椎名真由理', { current: cur }).byState;
    assert.ok(states.native <= 1, '至多一条能在容差内算本线，实测 native=' + states.native);
    assert.ok(states.unknown >= 3, '其余一律判不了，实测 unknown=' + states.unknown);
    assert.strictEqual(g.counts.kept, states.native, 'kept 数必须等于 native 数（不许把判不了的放进注入面）');
    assert.ok(g.counts.kept < 4, '绝不能四条全 kept（v3.424.0 实测就是 4/4）');
});

test('I4 读数面不得把 113.02% 显示成 100%', () => {
    const s = WM.line({ current: { lineId: 'beta', divergence: 1.130205 } });
    assert.ok(s.indexOf('113.02%') >= 0, '读数须显示真实变动率，实测：' + s);
    assert.ok(s.indexOf('100%') < 0, '任一位显示 100% 即说明被压平');
});

test('I5 line() 接受分段参数，读数域与判据域同口径', () => {
    /* 自定义分段：0.x=α，1.x=β */
    const bands = [{ name: 'alpha', hi: 1.0 }, { name: 'beta', hi: 2.0 }, { name: 'gamma', hi: 1e9 }];
    const st = { current: { lineId: 'beta', divergence: 1.130205 } };
    const withBands = WM.line(st, { bands: bands });
    assert.ok(withBands.indexOf('beta') >= 0, '带分段读数应显示 beta，实测：' + withBands);
    /* 与判据侧同一份分段必须给同一答案 */
    assert.strictEqual(WM.attractorOf(1.130205, { bands: bands }), 'beta');
    /* 不传 opts 时行为与旧版一致（兼容式增强，不是破坏性改签） */
    assert.ok(typeof WM.line(st) === 'string' && WM.line(st).length > 0);
});

test('I6 ★ 默认零分段（去世界观化）：不配 bands 时数字完全不参与，配了才生效', () => {
    /* ★ [v3.425.0 · 反向改判] 这条判据在 v3.424.1 钉的是「默认分段 = alpha<1 / beta<2 /
     *   gamma 兜底」。但那等于把《命运石之门》的分段写进内核默认值 —— 而使用者的原创卡是
     *   梦境层级 / 时间循环 / 平行宇宙 / 存档点，哪一种都不长这样。故默认分段整体删除，
     *   判据随之**反向**：现在要求「默认没有分段」，配了分段才落到卡自己的域。
     *   这不是放宽判据，是把「内核认识某个具体世界」这条旧契约改成「内核不认识任何世界」。 */
    assert.deepStrictEqual(WM.DEFAULT_BANDS, [], '内核默认必须零分段');
    assert.deepStrictEqual(WM.bandsOf({}), [], '不给配置就是没有分段（不兜底成三段）');
    assert.strictEqual(WM.attractorOf(0.571024), '', '没有分段就没有域，不编一个');
    assert.strictEqual(WM.attractorOf(1.130205), '');
    assert.strictEqual(WM.attractorOf(2.5), '');
    assert.strictEqual(WM.attractorOf('abc'), '', '非法值不猜成第一段');
    /* 配了分段（域名字由卡自定）才生效 */
    const mine = { bands: [{ name: '浅梦', hi: 1.0 }, { name: '深梦', hi: 1e9 }] };
    assert.strictEqual(WM.attractorOf(0.571024, mine), '浅梦');
    assert.strictEqual(WM.attractorOf(1.130205, mine), '深梦');
    /* 空分段不得把任何值塞进第一段（旧实现兜底成 bands[0]） */
    assert.strictEqual(WM.attractorOf(0.5, { bands: [] }), '');
});

test('I7 宿主贯通：worldlineBands 从配置解析并下传，且不传时退回默认', () => {
    const e = makeEngine({
        worldlineMemoryEnabled: true, worldlineId: 'beta', worldlineDivergence: 1.130205,
        worldlineBands: 'alpha<1.0\nbeta<2.0',
        worldlineReaders: '冈部伦太郎',
    });
    const st = e._worldlineState({});
    assert.deepStrictEqual(st.bands, [{ name: 'alpha', hi: 1.0 }, { name: 'beta', hi: 2.0 }],
        '两行分段须被解析成 [{name,hi}]');
    /* `域名=上界` 写法与 `域名<上界` 等价（与收束表同形，便于卡作者记忆） */
    const e2 = makeEngine({ worldlineMemoryEnabled: true, worldlineBands: 'a=1.5\nb=3' });
    assert.deepStrictEqual(e2._worldlineState({}).bands, [{ name: 'a', hi: 1.5 }, { name: 'b', hi: 3 }]);
    /* ★ [v3.425.0] 空配置 ⇒ 空数组。注意语义变了：旧版是「空则退回内核默认三段」，
     *   本版内核默认就是空 —— 空 = 没有分段这回事，不是「没配所以用别人的分段」。 */
    assert.deepStrictEqual(makeEngine({})._worldlineState({}).bands, []);
    /* 注释行与坏行被跳过，不污染分段 */
    const e3 = makeEngine({ worldlineMemoryEnabled: true, worldlineBands: '# 注释\nbadline\nalpha<1' });
    assert.deepStrictEqual(e3._worldlineState({}).bands, [{ name: 'alpha', hi: 1 }]);
    /* 诊断行读数与判据同口径 */
    const line = e._worldlineLine();
    assert.ok(line.indexOf('beta') >= 0, '诊断行须用配置的分段，实测：' + line);
});

test('I8 worldlineBands 是已声明的配置键，且 UI 可达（v3160 两条不变量）', () => {
    assert.ok(cfgSrc.includes('worldlineBands:'), '默认块已声明');
    assert.ok(uiSrc.includes('data-cfg-text="worldlineBands"'), 'UI 有控件');
    assert.ok(/const CARD_CFG_KEYS = \[[\s\S]*'worldlineBands'/.test(cfgSrc), '进卡白名单');
    /* [1b] 声明了就得有人按成员读：配置块外必须至少一处 .worldlineBands */
    const readSites = (cfgSrc + diagSrc).match(/\.worldlineBands(?![A-Za-z0-9_$])/g) || [];
    assert.ok(readSites.length >= 1, '必须有一处按成员读取，实测 ' + readSites.length);
});

/* ================= J 纪元主键（v3.425.0 · 本版唯一新增能力） =================
 * 全部样本用「原创卡」的形态：层标记是中文自造词（现实 / 梦境一层），没有任何
 * α/β/Steins;Gate，也没有任何数字编号参与 —— 这正是用户要的「机制都可能」。
 */
test('J1 纪元优先于变动率：同层标记、同变动率、起线楼层不同 ⇒ 异纪元', () => {
    const a = { lineId: '现实', divergence: 0.5, startFloor: 1 };
    const b = { lineId: '现实', divergence: 0.5, startFloor: 60 };
    const r = WM.relationOf(a, b);
    assert.strictEqual(r.relation, 'far', '同层标记不同纪元必须判异，不许因变动率相同算同线');
    assert.strictEqual(r.why, 'same-line-id-cross-epoch');
    assert.strictEqual(r.basis, 'epoch', '判据来源须如实标注为 epoch（不是 divergence）');
    /* 同纪元才算同线 */
    const c = { lineId: '现实', divergence: 0.9, startFloor: 60 };
    const r2 = WM.relationOf(b, c);
    assert.strictEqual(r2.relation, 'same', '同纪元内变动率不同仍是同一条命');
    assert.strictEqual(r2.why, 'same-epoch');
});
test('J2 同层标记跨纪元不串：跳出去又跳回来，旧纪元记忆必须挡', () => {
    /* 现实@1 → 梦境一层@20 → 现实@45：第三个「现实」是新纪元，不是第一个的续 */
    const st = { current: { lineId: '现实', startFloor: 45 } };
    const items = [
        { id: 'reality_now', worldline: '现实', startFloor: 45 },
        { id: 'reality_old', worldline: '现实', startFloor: 1 },
        { id: 'dream', worldline: '梦境一层', startFloor: 20 },
    ];
    const g = WM.guard(items, '', st);
    assert.strictEqual(g.counts.kept, 1);
    assert.strictEqual(g.kept[0].key, 'reality_now');
    assert.strictEqual(g.counts.blocked, 2);
    const old = g.blocked.find((x) => x.key === 'reality_old');
    assert.ok(old, '旧纪元必须被挡');
    assert.strictEqual(old.why, 'same-line-id-cross-epoch',
        '同层标记跨纪元要具名，不能与「不同层」混成同一个理由码');
});
test('J3 未来纪元闸：起线楼层更晚的记忆，对任何角色都不可见（含保留者）', () => {
    const item = { id: 'fut', worldline: '梦境二层', startFloor: 90 };
    const st = { current: { lineId: '现实', startFloor: 45 } };
    /* 普通角色 */
    const g1 = WM.guard([item], '', st);
    assert.strictEqual(g1.counts.blocked, 1);
    assert.strictEqual(g1.blocked[0].why, 'future-epoch');
    assert.strictEqual(g1.counts.future, 1, 'future 须单独计数（读数要能看见）');
    /* 保留者 + allow：仍然挡 —— 保留者记得的是「已经历过的别的层」，不是「还没到的层」 */
    const g2 = WM.guard([item], '主角',
        { current: { lineId: '现实', startFloor: 45 }, readers: ['主角'], readerPolicy: 'allow' });
    assert.strictEqual(g2.counts.blocked, 1, '保留者也不得预知未来纪元');
    assert.strictEqual(g2.blocked[0].why, 'future-epoch');
});
test('J4 楼层反推：只有 floor 的条目靠切换登记表认祖归宗（酒馆真实形态）', () => {
    /* 酒馆里抽取出来的记忆普遍只有 floor，没有层标记 —— 这是最常见的真实形态 */
    const jumps = [{ floor: 1, lineId: '现实' }, { floor: 20, lineId: '梦境一层' }, { floor: 45, lineId: '现实' }];
    const st = { current: { lineId: '现实', startFloor: 45 }, jumps: jumps };
    const g = WM.guard([
        { id: 'at30', floor: 30 },      /* 落在 梦境一层@20 区间 */
        { id: 'at50', floor: 50 },      /* 落在 现实@45 区间 = 当前纪元 */
        { id: 'at10', floor: 10 },      /* 落在 现实@1 区间 = 旧纪元 */
    ], '', st);
    assert.strictEqual(g.counts.kept, 1, '只有当前纪元那一条可进');
    assert.strictEqual(g.kept[0].key, 'at50');
    const byKey = {};
    for (const r of g.blocked) byKey[r.key] = r;
    assert.strictEqual(byKey.at10.why, 'same-line-id-cross-epoch', '第 10 楼属于旧纪元');
    assert.strictEqual(byKey.at30.why, 'cross-line-cross-epoch', '第 30 楼属于梦境层的那个纪元');
});
test('J5 无跳跃登记时不猜：不许把无据条目默认成第 0 楼', () => {
    const noJumps = WM.epochAt(30, []);
    assert.strictEqual(noJumps.why, 'no-jump-before');
    assert.strictEqual(noJumps.epoch, '', '没登记就不给纪元（不编一个 @0）');
    /* 全局：没有 jumps 时，只有 floor 的条目落 unknown 而不是 native */
    const g = WM.guard([{ id: 'x', floor: 30 }], '', { current: { lineId: '现实', startFloor: 45 } });
    assert.strictEqual(g.counts.undecided, 1, '判不了就是判不了，不许冒充本纪元');
    assert.strictEqual(g.undecided[0].why, 'no-line-mark');
});
test('J6 层标记别名表完全由卡提供（内核零内置，换写法不改内核）', () => {
    /* 内核不认识任何具体写法：同一层的两种中文写法，不给别名就是两条层 */
    assert.strictEqual(WM.normLineId('梦境一层'), '梦境一层');
    assert.strictEqual(WM.normLineId('梦一'), '梦一');
    assert.notStrictEqual(WM.normLineId('梦境一层'), WM.normLineId('梦一'));
    /* 卡作者给别名表后才折叠（表由配置给，不是内核写死） */
    const opts = { layerAlias: { '梦一': '梦境一层' } };
    assert.strictEqual(WM.normLineId('梦一', opts), '梦境一层');
    assert.strictEqual(WM.normLineId('梦境一层', opts), '梦境一层');
    /* 别名大小写不敏感；映射目标为空则保留原值（不做半折叠） */
    assert.strictEqual(WM.normLineId('ALPHA', { layerAlias: { 'alpha': '第一步' } }), '第一步');
    assert.strictEqual(WM.normLineId('alpha', { layerAlias: { 'alpha': '' } }), 'alpha');
    /* 剥尾部括注（模型爱写「梦境一层（第2轮）」）但整串括注保留 */
    assert.strictEqual(WM.normLineId('梦境一层（第2轮）'), '梦境一层');
    assert.strictEqual(WM.normLineId('（存档）'), '（存档）');
});
test('J7 normFloor 不吃 null / 空串：0 是合法楼层，null 判不了', () => {
    assert.strictEqual(WM.normFloor(0), 0, '第 0 楼是合法楼层');
    assert.strictEqual(WM.normFloor(null), null, 'Number(null)===0，若不拦就会把「没楼层」塌成 0 楼');
    assert.strictEqual(WM.normFloor(''), null);
    assert.strictEqual(WM.normFloor(undefined), null);
    assert.strictEqual(WM.normFloor(true), null, '布尔不是楼层');
    assert.strictEqual(WM.normFloor('12'), 12);
    /* 这条塌陷的后果不是「差一位」，是纪元全员相等 ⇒ 判据整体失效 */
    const r = WM.relationOf({ lineId: 'A', divergence: 0.2 }, { lineId: 'A', divergence: 0.6 });
    assert.strictEqual(r.relation, 'unknown', '没楼层时同号超差必须判不了（塌成 @0 会误判 same-epoch）');
    assert.strictEqual(r.why, 'same-line-id-divergence-gap');
});
test('J8 原创世界观端到端：梦境层级 + 纯中文层标 + 零数字 + 零预设', () => {
    /* 这张卡：没有变动率、没有分段、没有任何英文层名，全靠「层标记 + 切换楼层」 */
    const jumps = [
        { floor: 1, lineId: '现实' }, { floor: 20, lineId: '梦境一层' },
        { floor: 45, lineId: '现实' }, { floor: 70, lineId: '梦境二层' },
    ];
    const st = { current: { lineId: '现实', startFloor: 45 }, jumps: jumps };
    const g = WM.guard([
        { id: 'dream1_memory', worldline: '梦境一层', startFloor: 20 },
        { id: 'reality_now', worldline: '现实', startFloor: 45 },
        { id: 'reality_old', worldline: '现实', startFloor: 1 },
        { id: 'dream2_future', worldline: '梦境二层', startFloor: 70 },
        { id: 'no_floor_at_all' },
    ], '', st);
    assert.strictEqual(g.counts.kept, 1, '只有当前纪元可进注入');
    assert.strictEqual(g.kept[0].key, 'reality_now');
    assert.strictEqual(g.counts.blocked, 3);
    assert.strictEqual(g.counts.undecided, 1, '连楼层都没有的一条：判不了，但仍放行（不清空历史）');
    assert.strictEqual(g.counts.future, 1, '未来纪元须被单独数出来');
    /* 零预设自证：整轮判定没有任何一处依赖数字分段 */
    assert.deepStrictEqual(WM.bandsOf({}), []);
    assert.deepStrictEqual(WM.DEFAULT_BANDS, []);
});

/* ================= K 宿主接线（用户原话：插件需要适配） ================= */
test('K1 五个纪元配置键：默认声明 + UI 可达 + 进卡白名单 + 有人按成员读', () => {
    const KEYS = ['worldlineStartFloor', 'worldlineJumps', 'worldlineLayerAlias', 'worldlineReaderPolicy'];
    for (const k of KEYS) {
        assert.ok(cfgSrc.includes(k + ':'), '默认块已声明: ' + k);
        assert.ok(uiSrc.includes(k), 'UI 有控件/文案: ' + k);
        assert.ok(new RegExp('const CARD_CFG_KEYS = \\[[\\s\\S]*\'' + k + '\'').test(cfgSrc),
            '进卡白名单: ' + k);
        /* [1b] 声明了就得有人按成员读（配置块外至少一处 .KEY） */
        const sites = (cfgSrc + diagSrc).match(new RegExp('\\.' + k + '(?![A-Za-z0-9_$])', 'g')) || [];
        assert.ok(sites.length >= 1, '必须有一处按成员读取: ' + k);
    }
});
test('K2 _worldlineState 真的把纪元输入带出来（否则内核拿不到输入）', () => {
    const e = makeEngine({
        worldlineMemoryEnabled: true,
        worldlineId: '现实',
        worldlineStartFloor: '45',
        worldlineJumps: '1:现实\n20:梦境一层\n45=现实',
        worldlineLayerAlias: '梦一=梦境一层',
        worldlineReaderPolicy: 'allow',
    });
    const st = e._worldlineState({});
    assert.strictEqual(st.current.lineId, '现实');
    assert.strictEqual(st.current.startFloor, 45, 'current 必须带 startFloor');
    assert.deepStrictEqual(st.jumps, [
        { floor: 1, lineId: '现实', divergence: null },
        { floor: 20, lineId: '梦境一层', divergence: null },
        { floor: 45, lineId: '现实', divergence: null },
    ], '切换登记表须按楼层升序，且两种分隔符都收');
    assert.deepStrictEqual(st.layerAlias, { '梦一': '梦境一层' });
    assert.strictEqual(st.readerPolicy, 'allow');
    /* 未配置时：startFloor 为 null（不猜），readerPolicy 为 none，jumps 为空 */
    const d = makeEngine({ worldlineMemoryEnabled: true })._worldlineState({});
    assert.strictEqual(d.startFloor, null, '没配就 null，不许默认 0');
    assert.strictEqual(d.readerPolicy, 'none');
    assert.deepStrictEqual(d.jumps, []);
    /* 非法 startFloor 也不猜 */
    assert.strictEqual(makeEngine({ worldlineStartFloor: 'abc' })._worldlineState({}).startFloor, null);
});
test('K3 viewer 三级回落：没有 opts.viewer 时接 _currentSpeaker', () => {
    /* _worldlineViewer 全仓零赋值点 ⇒ 旧实现 viewer 恒 ''，保留者判定恒 false。
     * 现改为 opts.viewer > _worldlineViewer > _currentSpeaker。 */
    const e = makeEngine({
        worldlineMemoryEnabled: true, worldlineId: '现实', worldlineStartFloor: 45,
        worldlineReaders: '主角', worldlineReaderPolicy: 'allow',
    });
    const items = [{ id: 'f', worldline: '梦境一层', startFloor: 20 }];
    /* 不传 viewer：回落到 _currentSpeaker */
    e._currentSpeaker = '主角';
    assert.strictEqual(e.worldlineGate({ items }).kept.length, 1, '须回落到 _currentSpeaker');
    e._currentSpeaker = '旁人';
    assert.strictEqual(e.worldlineGate({ items }).blocked.length, 1);
    /* 显式 opts.viewer 优先 */
    assert.strictEqual(e.worldlineGate({ items, viewer: '主角' }).kept.length, 1);
});
/* ================= L 酒馆真实形态（有标记 + 有楼层，无 startFloor） =================
 * ★ 这一段是第四处自纠的**唯一**判据。前三段（J）的样本都自带 startFloor，
 *   走的是 relationOf 的对象分支，纪元直接算得出 —— 反推路径完全不被覆盖。
 *   而真实条目长这样：{ worldline:'现实', floor:1 }。缺了这一段，
 *   「同号跨纪元不串」在真实数据上失效这件事没有任何判据能抓（p18 前后 J 段都全绿）。
 */
test('L1 有标记 + 有楼层但无 startFloor：楼层反推必须覆盖线标（真实形态）', () => {
    /* 原创卡：现实@1 → 梦境一层@20 → 现实@45（当前）。
     * 三条记忆都写字面「现实」/「梦境一层」，都没有起线楼层，只有 floor。 */
    const jumps = [
        { floor: 1, lineId: '现实' }, { floor: 20, lineId: '梦境一层' },
        { floor: 45, lineId: '现实' }, { floor: 70, lineId: '梦境二层' },
    ];
    const st = { current: { lineId: '现实', startFloor: 45 }, jumps: jumps };
    const g = WM.guard([
        { id: 'now', worldline: '现实', floor: 45 },      /* 现实@45 = 当前 ⇒ 可进 */
        { id: 'old', worldline: '现实', floor: 1 },       /* 现实@1  ⇒ 旧纪元，必须挡 */
        { id: 'dream', worldline: '梦境一层', floor: 20 },/* 梦境一层@20 ⇒ 异纪元 */
    ], '', st);
    assert.strictEqual(g.counts.kept, 1, '只有当前纪元那一条可进，实测 kept=' + g.counts.kept);
    assert.strictEqual(g.kept[0].key, 'now');
    const byKey = {};
    for (const r of g.blocked) byKey[r.key] = r;
    assert.ok(byKey.old, '第 1 楼的「现实」是旧纪元，必须被挡（这正是 p18 修的那个洞）');
    assert.strictEqual(byKey.old.why, 'same-line-id-cross-epoch',
        '层标记字面相同、纪元不同 ⇒ 必须具名 same-line-id-cross-epoch，实测 ' + byKey.old.why);
    assert.strictEqual(byKey.old.epoch, '现实@1', '纪元须由楼层反推而得，实测 ' + byKey.old.epoch);
    assert.strictEqual(byKey.old.basis, 'epoch', '判据来源须是 epoch 而非 line-id');
    assert.strictEqual(byKey.dream.epoch, '梦境一层@20');
});
test('L2 纪元反推不得吃当前纪元的 startFloor 兜底（否则每条都变当前纪元）', () => {
    /* 根因钉点：guard 会往 opts 注入当前纪元的 startFloor（给当前线的字符串形态兜底用）。
     * 若那份 opts 原样传给条目，条目就会被补成「当前纪元」⇒ 纪元恒相等 ⇒ 整格失效。
     * 这里用「同层标记但不同楼层」的两条直接验：一条当前、一条旧，
     * 若判断结果相同（都 kept 或都 blocked）就说明兜底串进来了。 */
    const jumps = [{ floor: 1, lineId: '现实' }, { floor: 45, lineId: '现实' }];
    const st = { current: { lineId: '现实', startFloor: 45 }, jumps: jumps };
    const g = WM.guard([
        { id: 'a', worldline: '现实', floor: 45 },
        { id: 'b', worldline: '现实', floor: 1 },
    ], '', st);
    assert.notStrictEqual(g.kept.length, 2, '两条楼层不同，结局不得相同（兜底串入就会变成都 kept）');
    assert.notStrictEqual(g.blocked.length, 2, '同上：也不得都 blocked');
    assert.strictEqual(g.kept.length, 1);
    assert.strictEqual(g.blocked.length, 1);
});
test('L3 线标与楼层反推冲突时具名记因，不静默取其一', () => {
    /* 第 30 楼按登记表属「梦境一层@20」，但条目自己写着「现实」。楼层是磁盘事实 ⇒
     * 按楼层判；但冲突本身要留痕（floorConflict），否则卡里写错标记永远查不出来。 */
    const jumps = [{ floor: 1, lineId: '现实' }, { floor: 20, lineId: '梦境一层' }, { floor: 45, lineId: '现实' }];
    const st = { current: { lineId: '现实', startFloor: 45 }, jumps: jumps };
    const t = WM.tagOf({ id: 'x', worldline: '现实', floor: 30 }, { lineId: '现实', startFloor: 45 },
        { jumps: jumps });
    assert.strictEqual(t.epoch, '梦境一层@20', '按楼层判：第 30 楼落在梦境一层区间');
    assert.strictEqual(t.floorConflict, 'epoch-floor-conflict', '冲突须具名，实测 ' + t.floorConflict);
    /* 不冲突时为空串（不许恒定报警） */
    const t2 = WM.tagOf({ id: 'y', worldline: '现实', floor: 50 }, { lineId: '现实', startFloor: 45 },
        { jumps: jumps });
    assert.strictEqual(t2.floorConflict, '');
});
test('L4 counts.future 恒存在（未命中时为 0，不得是 undefined）', () => {
    const g = WM.guard([{ id: 'n', worldline: '现实', startFloor: 45 }], '',
        { current: { lineId: '现实', startFloor: 45 } });
    assert.strictEqual(typeof g.counts.future, 'number', '读数面要能看见 0，不能看不见');
    assert.strictEqual(g.counts.future, 0);
    /* 命中时确实是 1（且不进三桶总数的双算） */
    const g2 = WM.guard([{ id: 'f', worldline: '梦境二层', startFloor: 90 }], '',
        { current: { lineId: '现实', startFloor: 45 } });
    assert.strictEqual(g2.counts.future, 1);
    assert.strictEqual(g2.counts.kept + g2.counts.held + g2.counts.blocked + g2.counts.undecided, 1,
        '四桶合计等于条数；future 是叠加读数，不另立桶');
});
test('K4 召回闸把「判不了」逐条留证（静默放行 = 假安全面）', () => {
    /* 口径未变（undecided 仍放行，不清空历史），但必须可查：
     * _worldlineRecallFilter.undecidedSample 要能看见放了哪些、为什么判不了。 */
    assert.ok(recallSrc.includes('undecidedSample'), '召回闸须留证');
    const e = makeEngine({
        worldlineMemoryEnabled: true, worldlineId: '现实', worldlineStartFloor: 45,
    });
    const g = e.worldlineGate({ items: [{ id: 'n' }, { id: 'm' }] });
    assert.strictEqual(g.undecided.length, 2);
    for (const r of g.undecided) {
        assert.strictEqual(r.why, 'no-line-mark', '逐条都要有理由码');
    }
});
