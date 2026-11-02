/* ============================================================
 * tests/v3442_l13_x6_silence_list.test.mjs — v3.442.0
 * ------------------------------------------------------------
 * L13-X6 · 静音清单面 —— 把「我现在把什么静音了」做成一个常驻可解的面。
 *
 * 【真实现场（本版起点，两条硬读数）】
 *   ① 全仓零常驻静音清单：`silenceExplainState` 只在「问为什么召不回」时才用；
 *   ② `seasonState` / `topicSeasons` 在 `index.js` / `memory-organs.js` / `memory-core.js`
 *      三个文件里**一次都没出现**（除诊断层读它之外零写入点），也不在 WorldProgress 的
 *      构造 / 导出 / 导入三处枚举里 ⇒ **静音存盘即丢、读档即空**。
 *      所以本版不是「再画一个视图」：先补「有地方存」（memory-organs.js 三处），再画面。
 *
 * 【本档钉住的六件事】
 *   A  两源分列：ctx（本轮上下文）与 season（持久存档）各成一列；
 *      同一 id 在两源都出现时**两列都保留**（「持久静音 + 本轮又静了一次」是两条信息）；
 *      两源条数**不相加**成「当前被静音的主题数」（合计只是条数，不是主题数）。
 *   B  三态不同形：不可用（ok:false + module-unavailable，且明写「不是你没有静音任何东西」）
 *      / 真的没有（ok:true + total 0 + 说明怎么才有）/ 有静音（两源分列 + 逐条可解）。
 *   C  只读自证：`silenceListState` 前后 engine 既有槽位**逐字不变**；重复读两次仍不改账。
 *   D  逐条解除：只认一个 topicId（**没有批量入口**），解除后**其它静音原样**；
 *      解除不删键（mute → embrace，历史可审计）；失败面逐个如实报且不写账。
 *   E  真源码破坏三条（各配原版对照）：两源被合并成一列 / ctx-only 被报成「已解除」 /
 *      解除顺手清空整张动作表（等于「全部解除」）。
 *   F  当版锚 v3.442.0（vnum 形，守卫认得那一形）。
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
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { breakSource } from './_break_kit.mjs';

const require_ = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const DIAG_SRC = read('engine-diagnostic-lines.js');
const HOST_SRC = read('index.js');
const UI_SRC = read('settings-ui.js');
const ORG_SRC = read('memory-organs.js');
const MANIFEST = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));

// ── 锚点（文件头声明一次；判据函数**不**引用这些串） ──────────────────────
const A_D_LIST = 'function silenceListState(engine, opts) {';
const A_D_LIST_END = '/* 逐条解除静音。**只认一个 topicId**，没有批量入口（见档头「为什么没有全部解除」）。 */';
const A_D_LIFT = 'function silenceLift(engine, payload) {';
const A_D_LIFT_END = 'function _silenceListLine(engine) {';
const A_UI_VIEW = "else if (viewType === 'silence') {";
const A_UI_VIEW_END = "else if (viewType === 'oplog') {";
const A_UI_BIND = "            if (viewType === 'silence') {";
const A_UI_BIND_END = '            // [v3.63] lockedfacts 视图的交互绑定';
const A_HOST_FWD = 'silenceListState(...args) {';
const A_HOST_LIFT = 'silenceLift(...args) {';
/* 三条负控制的破坏锚（各自在真源恰中 1 次） */
const A_NEG_MERGE = 'const items = ctxItems.concat(seasonItems);';
const A_NEG_CTXONLY = "if (ids.indexOf(tid) >= 0) return bad('ctx-only-muted');";
const A_NEG_WIPE = "const out = MS.applySeasonAction(st, tid, 'embrace');";

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

// ── 夹具 ────────────────────────────────────────────────────────────────
/** 造一个最小引擎：只持有本面真源（季候动作表 / 主题表）。 */
function makeEngine(seed, libOpts) {
    const DL = require_(path.join(ROOT, 'engine-diagnostic-lines.js'));
    const engine = Object.assign({ worldProg: {} }, seed || {});
    engine._moduleLib = function (getter, name) {
        /* 真宿主用 `_moduleLib(() => window.X, 'x.js')` 取库；这里按参数还原成 require。
         *   ★ 不伪造内核 —— 取到的是磁盘上那一份（破坏它，判据必红）。 */
        const cands = [];
        const m = String(getter).match(/'([^']+\.js)'/);
        if (m) cands.push(m[1]);
        if (name) cands.push(String(name));
        for (const c of cands) {
            try { return require_(path.join(ROOT, c)); } catch (_e) { /* 下一个 */ }
        }
        return null;
    };
    const opts = libOpts || {};
    DL.bindDeps({
        moduleLib: engine._moduleLib,
        errLog: () => {},
        _changeset: () => null,
        libs: Object.assign({
            /* ⚠️ 缺一不可：silenceListState 与 silenceLift 都靠这两本库。
             *   只给一本会让 `MS` 或 `SM` 缺席，于是「模块缺席」与「真的没静音」同形 —— 正是本档要防的。 */
            _seasonSilenceLib: () => require_(path.join(ROOT, 'memory-season-silence-manager.js')),
            _memorySeasonLib: () => require_(path.join(ROOT, 'memory-season.js')),
        }, opts.libs || {}),
    });
    return { DL, engine };
}
/** 两源同时有静音的现场：t_keep 只持久、t_ctx 只本轮、t_both 两源各一次。 */
function twoSourceSeed() {
    return {
        worldProg: {
            seasonState: {
                userActions: { t_keep: 'mute', t_both: 'mute', t_defer: 'defer' },
                updatedAt: 1700000000000,
            },
            topicSeasons: [
                { id: 't_keep', title: '雨夜那把伞' },
                { id: 't_ctx', title: '母亲的信' },
                { id: 't_both', title: '旧站台' },
                { id: 't_defer', title: '一个延后的主题' },
            ],
        },
        _silenceExplainCtx: { mutedTopicIds: ['t_ctx', 't_both'], currentLocation: '车站' },
    };
}

// ═══════════════════════════════════════════════════════════════════════
// A 组：两源分列 —— 永不合并
// ═══════════════════════════════════════════════════════════════════════
test('A1: 两源分列 —— 各成一列，同一 id 双源都保留，条数不相加成主题数', () => {
    const { DL, engine } = makeEngine(twoSourceSeed());
    const r = DL.silenceListState(engine, {});
    assert.equal(r.ok, true, '内核在场 ⇒ ok:true（实 ' + r.ok + ' / ' + r.reason + '）');
    assert.equal(r.writesNothing, true, '本面是只读的');
    assert.equal(r.kind, 'silence_list');
    /* ★ 两源各自的成员必须**精确**，多一条少一条都红：
     *   持久源只认 'mute'，'defer' 不是静音（它是延后，语义完全不同）。 */
    assert.deepEqual(r.sources.season.map((x) => x.topicId).sort(), ['t_both', 't_keep'],
        '持久源：只认 mute（defer 不算静音），实得 ' + JSON.stringify(r.sources.season.map((x) => x.topicId)));
    assert.deepEqual(r.sources.ctx.map((x) => x.topicId).sort(), ['t_both', 't_ctx'],
        '本轮源：ctx.mutedTopicIds 原样，实得 ' + JSON.stringify(r.sources.ctx.map((x) => x.topicId)));
    /* ★ 双源同 id（t_both）必须在**两列各出现一次**，不许去重合并。
     *   合并掉就等于把「持久静音 + 本轮又静了一次」压成一条，用户看不出这是两件事。 */
    assert.equal(r.sources.ctx.filter((x) => x.topicId === 't_both').length, 1);
    assert.equal(r.sources.season.filter((x) => x.topicId === 't_both').length, 1);
    assert.equal(r.items.length, 4, '明细 4 条（2 + 2，同 id 计两次）');
    /* ★ counts 的三个数各有含义且**不相加**语义：ctx + season = total 是条数，不是主题数。
     *   本档把它写死成断言，防后来者"顺手"把 total 改成去重后的主题数。 */
    assert.deepEqual(r.counts, { ctx: 2, season: 2, total: 4 }, '实 ' + JSON.stringify(r.counts));
    const uniq = new Set(r.items.map((x) => x.topicId));
    assert.equal(uniq.size, 3, '去重后的**主题**数是 3，与 total=4 不同 —— 这两个数不许互换');
});

test('A2: since / until 口径 —— last-season-action ≠ 逐条起点；until 恒 null', () => {
    const { DL, engine } = makeEngine(twoSourceSeed());
    const r = DL.silenceListState(engine, {});
    const seasonRow = r.sources.season.find((x) => x.topicId === 't_keep');
    const ctxRow = r.sources.ctx.find((x) => x.topicId === 't_ctx');
    /* 持久源：内核只写动作词、不记时间 ⇒ 只能报「最近一次季候动作」，且必须**自报这是哪一种**。
     *   把它直接当「这一条的静音起点」就是把全局时间冒充逐条时间（本仓治过的错读数）。 */
    assert.equal(seasonRow.sinceKind, 'last-season-action', '持久源的 since 语义必须是 last-season-action');
    assert.equal(seasonRow.since, 1700000000000, '读数取自 seasonState.updatedAt');
    assert.deepEqual(Object.keys(seasonRow).sort(),
        ['liftable', 'since', 'sinceKind', 'source', 'title', 'topicId', 'until', 'why'],
        '持久源行字段面（加字段要同步这里）');
    /* 本轮源：根本没有持久起点这回事。 */
    assert.equal(ctxRow.sinceKind, 'this-run');
    assert.equal(ctxRow.since, null, '本轮源不得编一个起点出来');
    /* until 恒 null：本仓没有静音到期机制，写时间 = 凭空承诺。 */
    for (const x of r.items) assert.equal(x.until, null, 'until 必须恒 null（无到期机制）');
    /* liftable 逐源不同：持久可解，本轮不可解（本面改不动调用方的 ctx）。 */
    assert.equal(seasonRow.liftable, true);
    assert.equal(ctxRow.liftable, false, '本轮静音不许报成可解 —— 报了就是假承诺');
});

test('A3: 主题名只用于加名字 —— 读不到主题表时 title 为 null（不是「名字就叫 id」）', () => {
    const { DL } = makeEngine({
        worldProg: {
            seasonState: { userActions: { t_x: 'mute' }, updatedAt: 1 },
            /* 主题表整张缺席 */
        },
    });
    const r = DL.silenceListState({ worldProg: { seasonState: { userActions: { t_x: 'mute' }, updatedAt: 1 } } }, {});
    assert.equal(r.ok, true);
    const row = r.sources.season.find((x) => x.topicId === 't_x');
    assert.equal(row.title, null, '主题表缺席 ⇒ title 必须是 null，不许回落成 id 或空串');
    assert.equal(row.topicId, 't_x');
});

// ═══════════════════════════════════════════════════════════════════════
// B 组：三态不同形
// ═══════════════════════════════════════════════════════════════════════
test('B1: 三态不同形 —— 不可用 / 真的没有 / 有静音', () => {
    /* ① 不可用：把两本库都抽掉 ⇒ 真缺席（不是「空账」）。 */
    const gone = makeEngine({ worldProg: { seasonState: { userActions: { a: 'mute' } } } },
        { libs: { _seasonSilenceLib: () => null, _memorySeasonLib: () => null } });
    const rGone = gone.DL.silenceListState(gone.engine, {});
    assert.equal(rGone.ok, false, '内核缺席必须 ok:false');
    assert.equal(rGone.reason, 'module-unavailable');
    assert.equal(rGone.state, 'unavailable');
    /* 缺席面与在场面**逐字同键**：面板才能用同一套渲染而不猜。 */
    const live = makeEngine(twoSourceSeed());
    const rLive = live.DL.silenceListState(live.engine, {});
    assert.deepEqual(Object.keys(rGone).sort(), Object.keys(rLive).sort(),
        '缺席面与在场面键面必须恒定（实 ' + JSON.stringify(Object.keys(rGone).sort()) + '）');

    /* ② 真的没有：内核在场、两源都空 ⇒ ok:true + total 0。
     *   ★ 与 ① 必须**不同形**：一个说「这个面没装上」，一个说「你真的没静音任何东西」。 */
    const empty = makeEngine({ worldProg: { seasonState: { userActions: {}, updatedAt: 1 }, topicSeasons: [] } });
    const rEmpty = empty.DL.silenceListState(empty.engine, {});
    assert.equal(rEmpty.ok, true, '空账不是不可用');
    assert.equal(rEmpty.reason, '');
    assert.deepEqual(rEmpty.counts, { ctx: 0, season: 0, total: 0 });

    /* ③ 有静音 */
    assert.equal(rLive.counts.total, 4);
    /* ③ 与 ② 的区别只在读数，不在形状（面板据此区分「有」与「没有」）。 */
    assert.equal(rLive.ok, rEmpty.ok, '两态都 ok:true —— 区别在 counts，不在 ok');
    assert.notEqual(rLive.counts.total, rEmpty.counts.total);
});

test('B2: 面板四段渲染与绑定一一对应（按钮在、点了没反应是本仓反复治过的一类）', () => {
    /* 渲染块 */
    const view = seg(UI_SRC, A_UI_VIEW, A_UI_VIEW_END, 'silence 视图');
    assert.ok(view.includes('data-silence-src='), '渲染必须带源标记（两源分列才可机读）');
    assert.ok(view.includes('data-silence-lift='), '可解条目必须渲染解除按钮');
    assert.ok(/不可用（\*\*不是「你没有静音任何东西」\*\*/.test(view),
        '缺席态必须显式否掉「你什么都没静音」这条误读');
    assert.ok(view.includes('真的没有静音。'), '空态必须给「真的没有 + 怎么才有」');
    assert.ok(view.includes('不相加成'), '合计必须自述「不相加成主题数」');
    assert.ok(/没有「全部解除」/.test(view), '面板必须自述为什么没有一键全解');
    /* ★ 反向断言：**不许**出现批量/全部解除的按钮标记。
     *   这不是风格问题 —— 一键全解会掩盖误操作（分不清「原本一条」与「刚全解」）。 */
    assert.ok(!/data-silence-(all|bulk|lift-all)\b/.test(UI_SRC), '不许有任何批量解除入口');
    /* 绑定块 */
    const bind = seg(UI_SRC, A_UI_BIND, A_UI_BIND_END, 'silence 绑定');
    assert.ok(bind.includes("ov.querySelectorAll('[data-silence-lift]')"),
        '渲染出的解除按钮必须有同名选择器绑定（否则就是点了没反应）');
    assert.ok(bind.includes('s.silenceLift('), '解除必须走宿主 silenceLift');
    assert.ok(bind.includes("why === 'ctx-only-muted'"),
        'ctx-only 必须在这一层就被认出来并如实说明（不许落到通用失败文案里）');
    assert.ok(bind.includes("plugin.showBrowser('silence')"), '成功后按同一视图重建（不就地改 DOM）');
});

// ═══════════════════════════════════════════════════════════════════════
// C 组：只读自证
// ═══════════════════════════════════════════════════════════════════════
test('C1: 读面只读 —— 前后 engine 逐字不变、无新键、重复读两次仍不改账', () => {
    const { DL, engine } = makeEngine(twoSourceSeed());
    const before = JSON.stringify({ wp: engine.worldProg, ctx: engine._silenceExplainCtx });
    const keysBefore = Object.keys(engine).sort();
    const r1 = DL.silenceListState(engine, {});
    const r2 = DL.silenceListState(engine, {});
    const after = JSON.stringify({ wp: engine.worldProg, ctx: engine._silenceExplainCtx });
    assert.equal(after, before, '读面不得改动 worldProg / ctx（逐字比对）');
    assert.deepEqual(Object.keys(engine).sort(),
        keysBefore.concat(keysBefore.includes('_silenceListRead') ? [] : ['_silenceListRead']).sort().filter((v, i, a) => a.indexOf(v) === i),
        'engine 只允许**新增读缓存**这一个键（不许悄悄加别的槽位）');
    assert.deepEqual(r1.counts, r2.counts, '重复读两次读数必须一致');
    assert.deepEqual(r1.items.map((x) => x.topicId + '|' + x.source),
        r2.items.map((x) => x.topicId + '|' + x.source), '重复读两次明细顺序也必须一致');
    /* seasonState 仍原样：读面不得把它"归一化"写回去。 */
    assert.equal(engine.worldProg.seasonState.updatedAt, 1700000000000);
    assert.equal(engine.worldProg.seasonState.userActions.t_defer, 'defer', 'defer 项必须一字不动');
});

// ═══════════════════════════════════════════════════════════════════════
// D 组：逐条解除
// ═══════════════════════════════════════════════════════════════════════
test('D1: 解除只动这一条 —— 其它静音原样、defer 原样、不删键（mute → embrace 可审计）', () => {
    const { DL, engine } = makeEngine(twoSourceSeed());
    const before = JSON.parse(JSON.stringify(engine.worldProg.seasonState.userActions));
    const r = DL.silenceLift(engine, { topicId: 't_keep' });
    assert.equal(r.ok, true, '解除应成功（实 ' + r.reason + '）');
    assert.equal(r.writes, true);
    assert.equal(r.lifted, true);
    assert.equal(r.from, 'mute');
    assert.equal(r.to, 'embrace');
    const ua = engine.worldProg.seasonState.userActions;
    /* ★ 三件事同时成立才算「只解这一条」：
     *   ① 目标条从 mute 变 embrace（不删键：删了就丢了「曾经静音过」这段历史）；
     *   ② 另一条静音仍原样；
     *   ③ defer 项一字不动（它不是静音，解除操作不许顺手碰它）。 */
    assert.equal(ua.t_keep, 'embrace', '目标条必须变成 embrace（不是删除键）');
    assert.ok(Object.prototype.hasOwnProperty.call(ua, 't_keep'), '不许删键 —— 删了历史就消失了');
    assert.equal(ua.t_both, before.t_both, '另一条静音必须原样保留');
    assert.equal(ua.t_defer, 'defer', 'defer 不许被解除操作碰到');
    /* 解除后重读：该条不再出现在持久源，但另一条还在。 */
    const after = DL.silenceListState(engine, {});
    assert.deepEqual(after.sources.season.map((x) => x.topicId), ['t_both'],
        '解除后持久源应只剩另一条（删错条或多删都会红）');
});

test('D2: 失败面逐态如实报 —— 且失败路径一个字都不写账', () => {
    const { DL, engine } = makeEngine(twoSourceSeed());
    const snap = () => JSON.stringify(engine.worldProg.seasonState);
    const s0 = snap();
    /* ① 缺 topicId */
    let r = DL.silenceLift(engine, {});
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'topic-id-required');
    assert.equal(r.writes, false);
    /* ② 本来就没静音 */
    r = DL.silenceLift(engine, { topicId: 't_defer' });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'not-muted', 'defer 项不是静音 ⇒ not-muted（不许当成解除成功）');
    r = DL.silenceLift(engine, { topicId: 'never-existed' });
    assert.equal(r.reason, 'not-muted');
    /* ③ 只在本轮上下文里静音 —— 本面改不动，必须如实报 ctx-only-muted，
     *    不许报成「已解除」（下一轮它还在 = 假承诺）。 */
    r = DL.silenceLift(engine, { topicId: 't_ctx' });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'ctx-only-muted');
    assert.equal(r.lifted, false);
    /* ④ 内核缺席 */
    const gone = makeEngine(twoSourceSeed(), { libs: { _memorySeasonLib: () => null } });
    r = gone.DL.silenceLift(gone.engine, { topicId: 't_keep' });
    assert.equal(r.reason, 'module-unavailable');
    /* ⑤ 没有世界推进账 */
    const noWp = makeEngine({});
    delete noWp.engine.worldProg;
    r = noWp.DL.silenceLift(noWp.engine, { topicId: 't_keep' });
    assert.equal(r.reason, 'no-world-progress');
    /* 全部失败路径跑完，账必须逐字不变。 */
    assert.equal(snap(), s0, '失败路径一个字都不许写账');
});

test('D3: 四态失败面互不同形（不许把四种原因压成同一句话）', () => {
    const reasons = new Set([
        'topic-id-required', 'not-muted', 'ctx-only-muted', 'module-unavailable', 'no-world-progress',
    ]);
    assert.equal(reasons.size, 5, '五个原因码必须彼此不同');
    /* 内核里这五条必须真的各自在场（防"合并成一个通用失败"）。 */
    const lift = seg(DIAG_SRC, A_D_LIFT, A_D_LIFT_END, 'silenceLift');
    for (const code of ['topic-id-required', 'not-muted', 'ctx-only-muted', 'module-unavailable', 'no-world-progress']) {
        assert.ok(lift.includes("'" + code + "'"), '内核必须逐条给出原因码 ' + code);
    }
    /* ★ 反向：不许出现一个"批量解除"分支。 */
    assert.ok(!/function silenceLiftAll|silenceLift\(.*\[\]|liftAll/.test(DIAG_SRC), '内核层也不许有批量解除');
});

// ═══════════════════════════════════════════════════════════════════════
// E 组：真源码破坏负控制（各配原版对照）
// ═══════════════════════════════════════════════════════════════════════
/** 在破坏副本上重跑「两源分列」这条判据；返回缺陷列表（不引用锚点串）。 */
function judgeSources(src) {
    const bad = [];
    /* ① 两源必须各成一列：明细里必须能靠 source 区分出两类。 */
    if (!/source/.test(src)) bad.push('明细无 source 标记（两源无法分列）');
    /* ② 明细必须是两列拼接（合并成一列即缺陷）。 */
    if (!/concat\(/.test(src) || !/ctxItems/.test(src) || !/seasonItems/.test(src)) {
        bad.push('两源明细被合并（不再是 ctx 列 + season 列）');
    }
    /* ③ counts 必须分列报，不许只有一个总数。 */
    if (!/counts:\s*\{\s*ctx:/.test(src)) bad.push('counts 未分列（ctx / season 被压成一个数）');
    return bad;
}
/** 在破坏副本上重跑「ctx-only 必须如实报」这条判据。 */
function judgeCtxOnly(src) {
    const bad = [];
    const body = src.slice(0, src.indexOf('function _silenceListLine'));
    /* ctx-only 那一支必须在**解除之前**就短路，而不是被当成"解除了"。 */
    if (!/ctx-only-muted/.test(body)) bad.push('缺 ctx-only-muted 分支（本轮静音会被报成已解除）');
    if (!/indexOf\(tid\)\s*>=\s*0/.test(body)) bad.push('缺「该 id 是否只在本轮上下文」的判定');
    return bad;
}
/** 在破坏副本上重跑「只解这一条」这条判据。 */
function judgeSingleLift(src) {
    const bad = [];
    const start = src.indexOf('function silenceLift(engine, payload) {');
    const end = src.indexOf('function _silenceListLine');
    const body = src.slice(start, end);
    /* 必须走内核的逐条动作接口，且动作词是单条替换。 */
    if (!/applySeasonAction\(st,\s*tid,\s*'embrace'\)/.test(body)) bad.push('解除未走逐条动作接口');
    /* 不许整表重建（整表重建 = 顺手清空其它静音）。
     *   ★ 两种写法都要认 —— 本仓真实形态是「重新赋 seasonState 对象字面量」，
     *     只认 `userActions = {}` 独立赋值会让破坏注入后判据仍绿（假绿）。 */
    if (/userActions\s*=\s*\{\s*\}\s*;/.test(body)) bad.push('解除时重建了整张动作表（等于全部解除）');
    if (/userActions\s*:\s*\{\s*\}\s*\}/.test(body)) bad.push('解除时重建了整张动作表（等于全部解除）');
    if (/seasonState\s*=\s*\{/.test(body)) bad.push('解除时整对象重写了 seasonState（等于全部解除）');
    return bad;
}

test('E1: 负控制①把两源合并成一列 → 分列判据必红（原版对照必绿）', () => {
    assert.deepEqual(judgeSources(DIAG_SRC), [], '原版：分列判据必须绿');
    const broken = breakSource(DIAG_SRC, A_NEG_MERGE,
        'const items = seasonItems.slice(); /* ctx 被合并掉 */', 'x6_n1');
    assert.notEqual(broken, DIAG_SRC, '破坏须真的改变源码');
    const r = judgeSources(broken);
    assert.ok(r.length > 0, '合并两源后分列判据必须翻红，实得 ' + JSON.stringify(r));
    assert.ok(r.some((x) => /合并/.test(x)), '必须点名「两源被合并」');
});

test('E2: 负控制②把 ctx-only 报成「已解除」→ 判据必红（原版对照必绿）', () => {
    assert.deepEqual(judgeCtxOnly(DIAG_SRC), [], '原版：ctx-only 判据必须绿');
    /* 破坏：把 ctx-only 的短路整段删掉（于是落到"没有静音"或"解除了"的路径上）。 */
    const broken = breakSource(DIAG_SRC, A_NEG_CTXONLY,
        "/* ctx-only 判定被摘 */", 'x6_n2');
    assert.notEqual(broken, DIAG_SRC, '破坏须真的改变源码');
    const r = judgeCtxOnly(broken);
    assert.ok(r.length > 0, '摘掉 ctx-only 短路后判据必须翻红，实得 ' + JSON.stringify(r));
});

test('E3: 负控制③解除顺手清空整张动作表（= 全部解除）→ 判据必红（原版对照必绿）', () => {
    assert.deepEqual(judgeSingleLift(DIAG_SRC), [], '原版：单条解除判据必须绿');
    const broken = breakSource(DIAG_SRC, A_NEG_WIPE,
        "wp.seasonState = { userActions: {} }; const out = MS.applySeasonAction(st, tid, 'embrace');", 'x6_n3');
    assert.notEqual(broken, DIAG_SRC, '破坏须真的改变源码');
    const r = judgeSingleLift(broken);
    assert.ok(r.length > 0, '清空整表后单条解除判据必须翻红，实得 ' + JSON.stringify(r));
    assert.ok(r.some((x) => /全部解除|整张动作表/.test(x)), '必须点名「等于全部解除」');
});

// ═══════════════════════════════════════════════════════════════════════
// F 组：接线面 + 当版锚
// ═══════════════════════════════════════════════════════════════════════
test('F1: 接线面 —— 宿主三桩在场 / 持久化三处齐备 / api 冻结表已挂', () => {
    /* 宿主三桩（读 / 逐条解除 / 诊断行）。 */
    assert.equal(occ(HOST_SRC, A_HOST_FWD), 1, '宿主读桩必须恰一处');
    assert.equal(occ(HOST_SRC, A_HOST_LIFT), 1, '宿主解除桩必须恰一处');
    assert.equal(occ(HOST_SRC, '_silenceListLine(...args) {'), 1, '宿主诊断行桩必须恰一处');
    /* ★ 持久化三处：构造 / 导出 / 导入。缺任何一处就是「存盘即丢」（本版起点正是这个现场）。 */
    assert.equal(occ(ORG_SRC, 'this.seasonState = null;'), 1, '构造处必须显式落格');
    assert.equal(occ(ORG_SRC, 'this.topicSeasons = [];'), 1, '主题表构造处必须显式落格');
    assert.equal(occ(ORG_SRC, 'seasonState: (this.seasonState'), 1, '导出面必须带上静音动作表');
    assert.equal(occ(ORG_SRC, 'topicSeasons: this.topicSeasons || []'), 1, '导出面必须带上主题表');
    assert.equal(occ(ORG_SRC, 'this.seasonState = (data.seasonState'), 1, '导入面必须读回静音动作表');
    assert.equal(occ(ORG_SRC, 'Array.isArray(data.topicSeasons)'), 1, '导入面必须读回主题表');
    /* api 冻结表已挂三个出口（缺一个，宿主取不到）。 */
    for (const name of ['silenceListState', 'silenceLift', '_silenceListLine']) {
        assert.ok(new RegExp('\\b' + name + ',?\\s').test(DIAG_SRC.split('var api = Object.freeze({')[1] || ''),
            'api 冻结表必须挂 ' + name);
    }
});

test('F2: 出生锚 + 三源互等 —— 本档生于 3.442.0，只承诺不倒退（当版锚已交棒）', () => {
    /* ★ 本档是**历史档案**：它的职责是钉住「本面落在 3.442.0」这件事，
     *   不是钉「今天的当版还是 3.442.0」。把出生版写成永恒当版，抬版当天必红
     *   （v3.443.0 批验实测：assert.equal(live, CUR) 实 3.443.0 / 期望 3.442.0）。
     *   当版锚的职责已交棒给当版档案 tests/v3443_l13_x8_round_snapshot.test.mjs 的 G5。
     *   口径照 tests/v3203_version_guard_handover.test.mjs 第 12 条「交棒链已拆」：
     *   出生锚下界 + 三源互等（钉同源，不钉字面量）+ 只承诺不倒退。 */
    const BORN_V = '3.442.0';
    const vnum = (v) => {
        const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(v || '').trim());
        return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
    };
    assert.equal(vnum(BORN_V), 3442000, '出生锚（vnum 形）：3.442.0 ⇒ 3442000');
    /* 三源互等：钉的是「同源」，一个字面量都不写死。 */
    const live = (/const VERSION = '([0-9]+[.][0-9]+[.][0-9]+)'/.exec(HOST_SRC) || [])[1];
    assert.equal(live, MANIFEST.version, 'index.js VERSION 与 manifest 必须同源（实 ' + live + ' / ' + MANIFEST.version + '）');
    assert.equal(MANIFEST.version, PKG.version, 'manifest 与 package 必须同源');
    /* 只承诺不倒退（本项目版本号单调递增）。 */
    assert.ok(vnum(live) >= vnum(BORN_V), '当版不得低于出生版（实 ' + live + ' / 出生 ' + BORN_V + '）');
    /* 本档专有标记在场（防「测了旧版」）。 */
    assert.ok(DIAG_SRC.includes('L13-X6'), '诊断层必须留 L13-X6 标记');
    assert.ok(SEG_HELPERS_ALIVE(), '切片助手必须仍在（判据不得被掏空）');
});
/** 自证工具在位（防止有人为过门禁把 seg/occ 掏空）。 */
function SEG_HELPERS_ALIVE() {
    return typeof seg === 'function' && typeof occ === 'function' && typeof at === 'function';
}
