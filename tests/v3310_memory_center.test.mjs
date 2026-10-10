/* ============================================================
 * tests/v3310_memory_center.test.mjs — [v3.310.0 · M-X1] 用户侧记忆控制中心成对套件（15 条）
 *
 * 【本套件要证明的七件事（不是「函数返回了对象」）】
 *   ① **超 200 条的旧记忆仍能在界面上翻到**（M-X1 验收原文第一条的界面落点）：
 *      900 条的约定账里，目标条目落在**最老那一条**（工作台摘要面 200 条之外），
 *      界面条件 `text=AZ900` 必须命中 `commitment:cm0` —— 界面**不得**再切一次窗口
 *      （再切一次就把 X1 修掉的那条缺陷原样装回来：900 条与 200 条同形）。
 *   ② **四态互不同形且各带具名 reason**（本仓最贵的老账就是把它们压成一格）：
 *      `result` / `empty`（面可查、确实没有）/ `unknown`（判不了：区间反转 · 翻过头 ·
 *      点了登记表里没有的账）/ `error`（面不可用：内核缺席 · 扫描面为空 · 抛错）。
 *   ③ **查询零写副作用**：dispatch 前后宿主账本逐字节相同（界面是只读面）。
 *   ④ **动作只声明不执行**：宿主没提供的 handler ⇒ 内核降级为 `unavailable`，
 *      不假装能用；处置类动作在 `step` 里如实回报 `handled:false` + `ignored`。
 *   ⑤ **保存的是「条件」不是「结果」**：走 `evidence-query.upsertSaved/replaySaved`
 *      （单一真源），本模块不另建第二份证据库。
 *   ⑥ **界面显示的 = 内核真查到的**：渲染串由内核产出（`sheetHtml`），面板只塞容器；
 *      面板**不得手抄一份字段清单**（那与内核的字段表会各长各的）。
 *   ⑦ **宿主接线逐符号在场**：取库口 / 唯一装配点 / 七出口 / 自述 / 诊断行 / 加载面登记。
 *
 * 负控制一律：真源码破坏（锚点恰中 1 次）→ 在**破坏副本**上重跑**同款真判据** → 必须现形；
 *   并反向对照「原版同判据必须通过」。★ 三形假绿的统一修法：破坏打在真源码上、
 *   判据在副本上跑（不对原文件断言）、破坏不许把判据自己删掉。
 * 【当版锚点】形态按本仓 V4 惯例：**本档自锚常量 + vnum**（锚必须住在当版档案里）。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { breakOnce } from './_break_kit.mjs';
import { stripComments } from './_audit_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const require_ = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const MOD = 'memory-center.js';
const MOD_SRC = read(MOD);
const SELF = read(path.join('tests', 'v3310_memory_center.test.mjs'));
const IDX = read('index.js');
const UI = read('settings-ui.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));

const C = require_(path.join(R, MOD));
const Q = require_(path.join(R, 'evidence-query.js'));
const W = require_(path.join(R, 'evidence-workbench.js'));

/* ── 依赖装配（与宿主 `memoryCenterDeps()` 同口径：七件，五件同出内核） ── */
const APIS = {};
for (const s of W.LEDGERS) APIS[s.id] = {};
const depsOf = () => ({
    query: Q.query, normalizeSpec: Q.normalizeSpec, upsertSaved: Q.upsertSaved,
    removeSaved: Q.removeSaved, replaySaved: Q.replaySaved,
    FILTERS: Q.FILTERS, LEDGERS: W.LEDGERS
});

/* ───────────────── 夹具（期望值全部来自真读数，不猜） ───────────────── */
/** 900 条约定账：`items[0]` 是最老那条（独特词 AZ900），工作台摘要面看不到它。 */
function host900() {
    const items = [];
    for (let i = 0; i < 900; i++) {
        items.push({
            id: 'cm' + i, actor: '苏晴', counterpart: '林一',
            content: (i === 0 ? 'AZ900 ' : '') + '约定 ' + i,
            status: i % 2 ? 'open' : 'done', floor: i, updatedFloor: i, revision: 1
        });
    }
    return {
        worldProg: {
            commitmentLedger: { items: items },
            seedLedger: { items: [{ id: 's0', hook: '零楼伏笔', source: 'seedLedger', status: 'open', floor: 0, updatedFloor: 0, revision: 1 }] },
            parallelLedger: { items: [] }, secretLedger: null, recallEcho: null, echoLedger: null
        },
        _factVersionState: { facts: [{ id: 'f1', subject: '苏晴', predicate: '住', value: '老城', origin: 'dialog', status: 'active', floor: 1, revision: 3 }] },
        _eventThreadState: { events: [] },
        _repairState: { repairs: [] }
    };
}

/**
 * 负控制锚点（**在判据层只声明一次**，见 K1 的纯度检查）。
 *   ★ 为什么收成一张表：锚点若在「破坏调用」与「纯度断言」两处各写一份，
 *     改一处漏一处时纯度检查会**恒过**（它数的是自己那一份）。
 *   ★ 为什么用 String.raw：锚点是**磁盘现值**（含引号转义与缩进），多一个空格即打偏；
 *     `breakOnce` 会在 0 命中时当场拒绝（本档不靠肉眼对齐）。
 */
const ANCHORS = Object.freeze({
    /* L1：视图词表被拆掉一态（词的完整性是契约：少一态意味着某类处境无处安放）。 */
    views: String.raw`const VIEW_STATES = Object.freeze(['panel', 'result', 'empty', 'unknown', 'error']);`,
    viewsBroken: String.raw`const VIEW_STATES = Object.freeze(['panel', 'result', 'empty', 'unknown']);`,
    /* L2：扫描面为空被判成「确实没有」—— 本仓最忌的同形（把「面坏了」说成「没有」）。 */
    scanAbsent: String.raw`        if (q.total === 0 && (counts.ok || 0) === 0) return { view: 'error', reason: 'scan-surface-absent' };`,
    scanAbsentBroken: String.raw`        if (q.total === 0 && (counts.ok || 0) === 0) return { view: 'empty', reason: 'no-match' };`,
    /* L3：点了登记表里没有的账被判成「确实没有」—— 「判不了」冒充「没有」。 */
    unknownLedger: String.raw`            if (bad.length) return { view: 'unknown', reason: 'unknown-ledger', detail: bad };`,
    unknownLedgerBroken: String.raw`            if (bad.length) return { view: 'empty', reason: 'no-match' };`,
    /* L4：宿主未提供的 handler 不再降级 —— 「不可用」被说成「可用」。 */
    degrade: String.raw`                row.kind = 'unavailable';`,
    degradeBroken: String.raw`                row.kind = a.kind;`,
    /* L5：属性转义被摘（回到修前形态：引号替换为自身 = 等价空操作，属性值遇引号会吞并标签）。 */
    escAttr: String.raw`+ escAttr(st.text) +`,
    escAttrBroken: String.raw`+ st.text +`,
    /* L6：改条件不回第一页（「改了条件却停在旧页」会看着像查不到）。 */
    pageReset: String.raw`            st.page = 1;`,
    pageResetBroken: String.raw`            st.page = st.page;`
});
/** 面板侧破坏形态锚点（修前形态：面板手抄一份字段清单）。 */
const UI_ANCHORS = Object.freeze({
    fromCore: String.raw`                    const b = (typeof s.memoryCenterBlankState === 'function') ? s.memoryCenterBlankState() : null;`,
    handCopy: String.raw`                    const b = { ledgers: [], actor: '', status: '', source: '', floorFrom: '', floorTo: '', revisionFrom: '', revisionTo: '', text: '', hasFloor: null, page: 1, pageSize: 30, sort: '', dir: 'asc', saved: [], activeSaved: '' };`
});

/* ───────────────── 判据本体（纯函数：负控制要在破坏副本上重跑它们） ───────────────── */
/** A1：分发面恰一次 + 末位（零兄弟依赖）+ 双导出 + 冻结。 */
function judgeA1(Cx, mf, src) {
    if (!Cx || typeof Cx !== 'object') return '模块须可加载（CJS 双导出）';
    const hits = (mf.extra_js || []).filter((f) => f === MOD);
    if (hits.length !== 1) return 'extra_js 里 ' + MOD + ' 必须恰出现 1 次，实 ' + hits.length;
    if (mf.extra_js[mf.extra_js.length - 1] !== MOD) {
        return '本模块不 require 任何兄弟模块（对加载顺序零要求）⇒ 追加末位，实末位=' + mf.extra_js[mf.extra_js.length - 1];
    }
    const code = stripComments(src);
    if (code.includes('require(')) return '模块**不得** require 兄弟模块（依赖经 deps 参数注入，缺席才可表达）';
    if (!code.includes('module.exports = api')) return '必须保留 CJS 导出';
    if (!/root\.LonSha[A-Za-z]* = api;/.test(code)) return '必须挂浏览器全局（宿主按全局名取件）';
    if (!/const api = Object\.freeze\(\{/.test(code)) return '导出面须冻结（防宿主侧被改写）';
    if (typeof globalThis.LonShaMemoryCenter !== 'object') return 'root.LonShaMemoryCenter 必须被挂上';
    if (Object.isFrozen(globalThis.LonShaMemoryCenter) !== true) return '全局挂载须冻结（防宿主侧被改写）';
    return '';
}
/** A2：导出面逐字（含词表 / 动作登记表 / 界面字段映射）。 */
function judgeA2(Cx) {
    const need = ['blankState', 'loadState', 'saveState', 'buildSpec', 'keysAligned', 'viewOfOf',
        'dispatch', 'step', 'applyAction', 'resolveActions', 'specLine', 'sheetHtml',
        'describe', 'selfCheck', 'line'];
    for (const k of need) if (typeof Cx[k] !== 'function') return '导出面缺函数：' + k;
    for (const k of ['VIEW_STATES', 'ACTION_KINDS', 'REQUIRED_DEPS', 'UI_FIELDS', 'ACTIONS']) {
        if (!Array.isArray(Cx[k])) return '导出面缺登记表数组：' + k;
    }
    if (Cx.CENTER_VERSION !== 1) return 'CENTER_VERSION 须为 1，实 ' + Cx.CENTER_VERSION;
    if (Cx.VIEW_STATES.length !== 5) return '视图词表须五态，实 ' + Cx.VIEW_STATES.length;
    if (Cx.REQUIRED_DEPS.length !== 7) return '依赖面须七件，实 ' + Cx.REQUIRED_DEPS.length;
    if (Cx.UI_FIELDS.length !== 10) return '界面字段须十项（缺一项即漏一类条件），实 ' + Cx.UI_FIELDS.length;
    if (!Cx.ACTIONS.every((a) => (a.kind === 'write') === (a.writes === true))) {
        return '动作声明不自洽（writes 与 kind 必须一致）';
    }
    /* handlerId 是**装配产物**（`resolveActions` 把动作 id 映射成宿主契约键），不是登记表上的常量：
     *   故这里判「派发出去的动作行逐条带 handlerId」，而不是直接读 ACTIONS。 */
    const actRows = Cx.resolveActions({}, null);
    if (actRows.length !== Cx.ACTIONS.length) return '动作行数须与登记表一致，实 ' + actRows.length + '/' + Cx.ACTIONS.length;
    if (!actRows.every((a) => typeof a.handlerId === 'string' && a.handlerId && a.handlerId === a.id)) {
        return '每个动作行须带 handlerId（= 动作 id，宿主契约键）';
    }
    if (!actRows.every((a) => a.declaredKind === a.kind && a.unavailable === false)) return '未询问宿主时须原样给出声明的 kind';
    return '';
}
/**
 * B1：界面字段映射与真源 `FILTERS` **逐字对齐**（映射到一个不在册的条件键即报红）。
 *   ★ 为什么必须对真源而不是对本模块自己的清单：清单自己跟自己对永远相等，
 *     「界面上少一格条件」这件事在自指口径下**不可见**。
 */
function judgeB1(Cx, filters) {
    const ka = Cx.keysAligned({ FILTERS: filters });
    if (ka.ok !== true) return 'UI_FIELDS 与真源 FILTERS 必须逐字对齐：缺 ' + JSON.stringify(ka.missing) + ' 多 ' + JSON.stringify(ka.extra);
    if (ka.count !== filters.length) return '对齐项数应等于条件键数，实 ' + ka.count;
    /* 反向自证：真源少一个键时**必须**报红（否则上面那条是空转）。 */
    const fewer = filters.filter((f) => f.key !== 'revisionTo');
    const bad = Cx.keysAligned({ FILTERS: fewer });
    if (bad.ok !== false || bad.missing.indexOf('revisionTo') < 0) {
        return '真源少一个条件键时必须点名它（否则对齐判据空转）';
    }
    if (Cx.keysAligned({}).ok !== false) return '条件登记表缺席时不得报「对齐」';
    return '';
}
/**
 * C1：四态分形（真上游内核 + 真账本登记表，不是 mock）。
 *   每一态同时断 view 与 reason —— 只看 view 会把「判不了」与「面坏了」看成同一档。
 */
function judgeStates(Cx, deps) {
    const H = host900();
    const st = (o) => Object.assign(Cx.blankState(), o);
    const run = (o) => Cx.dispatch(deps, st(o), { host: H, apis: APIS });
    /* ① result */
    const r = run({ text: 'AZ900' });
    if (r.view !== 'result' || r.reason !== '') return '有命中须落 result，实 ' + r.view + '/' + r.reason;
    /* ② empty：面可查、确实没有 */
    const e = run({ text: '绝对不存在的词ZZZ' });
    if (e.view !== 'empty' || e.reason !== 'no-match') return '面可查且没有须落 empty/no-match，实 ' + e.view + '/' + e.reason;
    /* ③ unknown：翻过头（内核不回落第一页） */
    const p = run({ page: 999 });
    if (p.view !== 'unknown' || p.reason !== 'page-out-of-range') return '翻过头须落 unknown/page-out-of-range，实 ' + p.view + '/' + p.reason;
    /* ④ unknown：区间反转（按空集，不静默交换） */
    const i = run({ floorFrom: 100, floorTo: 1 });
    if (i.view !== 'unknown' || i.reason !== 'inverted-range') return '区间反转须落 unknown/inverted-range，实 ' + i.view + '/' + i.reason;
    /* ⑤ unknown：点了登记表里没有的账（并点名是哪一本） */
    const u = run({ ledgers: ['__不存在的账__'] });
    if (u.view !== 'unknown' || u.reason !== 'unknown-ledger') return '未知账本须落 unknown/unknown-ledger，实 ' + u.view + '/' + u.reason;
    if (!Array.isArray(u.detail) || u.detail.indexOf('__不存在的账__') < 0) return '未知账本须点名是哪一本（detail）';
    /* ⑥ error：扫描面为空（九账全取不到）—— 这不是「查不到」 */
    const empty = Cx.dispatch(deps, st({}), { host: {}, apis: APIS });
    if (empty.view !== 'error' || empty.reason !== 'scan-surface-absent') {
        return '扫描面为空须落 error/scan-surface-absent（**不是** empty），实 ' + empty.view + '/' + empty.reason;
    }
    /* ⑦ error：内核缺席（依赖缺 query 一格） */
    const none = Cx.dispatch({ FILTERS: Q.FILTERS, LEDGERS: W.LEDGERS }, st({}), { host: H, apis: APIS });
    if (none.view !== 'error' || none.reason !== 'module-absent') return '内核缺席须落 error/module-absent，实 ' + none.view + '/' + none.reason;
    /* ⑧ error：内核抛错（不把「抛了」读成「没有」） */
    const thrown = Cx.dispatch({ query: () => { throw new Error('boom'); } }, st({}), { host: H, apis: APIS });
    if (thrown.view !== 'error' || thrown.reason !== 'thrown') return '内核抛错须落 error/thrown，实 ' + thrown.view + '/' + thrown.reason;
    /* 七态互不同形（任意两态不得同形）。 */
    const all = [r, e, p, i, u, empty, none, thrown].map((x) => x.view + '/' + String(x.reason));
    if (new Set(all).size !== all.length) return '各态必须互不同形，实 ' + JSON.stringify([...new Set(all)]);
    return '';
}
/** C2：超 200 条仍能翻到最老那条（界面不得再切一次窗口）。 */
function judgeBeyond200(Cx, deps) {
    const H = host900();
    /* 前提：工作台摘要面确实只覆盖尾部 200 条（否则本条无从取证）。 */
    const face = W.buildWorkbench(H, { apis: APIS });
    const cm = face.ledgers.commitment;
    if (!cm || cm.items.length !== 200 || !cm.truncated) return '夹具前提不成立：消费者摘要面应只覆盖 200 条且自报 truncated';
    if (cm.items.some((x) => String(x.title).indexOf('AZ900') >= 0)) return '夹具前提不成立：目标条不该出现在摘要面里';
    const r = Cx.dispatch(deps, Object.assign(Cx.blankState(), { text: 'AZ900' }), { host: H, apis: APIS });
    if (r.view !== 'result') return '超 200 条的旧记忆必须仍能检索到，实 ' + r.view + '/' + r.reason;
    if (r.pager.total !== 1) return 'text=AZ900 应恰命中 1 条，实 ' + r.pager.total;
    if (!r.rows.length || r.rows[0].ref !== 'commitment:cm0') return '须命中工作台摘要面之外的最老那条（commitment:cm0），实 ' + JSON.stringify((r.rows[0] || {}).ref);
    if (!r.query || r.query.coverage.summaryBypassed !== true) return '界面须复用「直读原账全量」的内核读数（summaryBypassed）';
    return '';
}
/** D1：查询零写副作用（界面是只读面）。 */
function judgeZeroWrite(Cx, deps) {
    const H = host900();
    const before = JSON.stringify([H.worldProg, H._factVersionState, H._eventThreadState, H._repairState]);
    Cx.dispatch(deps, Cx.blankState(), { host: H, apis: APIS });
    Cx.dispatch(deps, Object.assign(Cx.blankState(), { text: '约定', ledgers: ['commitment'] }), { host: H, apis: APIS });
    Cx.step(deps, Cx.blankState(), 'page', { page: 2 }, { host: H, apis: APIS });
    const after = JSON.stringify([H.worldProg, H._factVersionState, H._eventThreadState, H._repairState]);
    if (before !== after) return '查询 / 翻页不得改动宿主账本（逐字节须相同）';
    if (before.length < 1000) return '夹具前提不成立：宿主账本过小（扫描面不可信）';
    return '';
}
/** E1：动作只声明不执行（缺 handler ⇒ unavailable；处置类动作如实回报未处理）。 */
function judgeActions(Cx, deps) {
    const H = host900();
    const f = Cx.dispatch(deps, Cx.blankState(), { host: H, apis: APIS, availableHandlers: ['row.detail', 'query.reset'] });
    const by = {};
    for (const a of f.actions) by[a.id] = a;
    if (by['row.detail'].kind !== 'read' || by['row.detail'].unavailable) return '宿主已提供的 handler 不得降级';
    if (by['query.reset'].kind !== 'read' || by['query.reset'].unavailable) return '宿主已提供的 handler 不得降级';
    const un = f.actions.filter((a) => a.unavailable);
    if (un.length !== Cx.ACTIONS.length - 2) return '未提供的 handler 次数应为 ' + (Cx.ACTIONS.length - 2) + '，实 ' + un.length;
    for (const a of un) {
        if (a.kind !== 'unavailable') return a.id + ' 未提供时 kind 须降级为 unavailable，实 ' + a.kind;
        if (a.declaredKind !== Cx.ACTIONS.filter((x) => x.id === a.id)[0].kind) return a.id + ' 须保留声明 kind（declaredKind）供诊断面读';
    }
    /* 宿主**没声明**（undefined）与「声明了但没有」是两件事：前者原样给声明的 kind。 */
    const g = Cx.dispatch(deps, Cx.blankState(), { host: H, apis: APIS });
    if (g.actions.some((a) => a.unavailable)) return '宿主未声明 handler 时不得擅自标 unavailable（「我没问」≠「宿主说没有」）';
    /* 处置类动作在 step 里**不处理**：如实回报 handled:false + ignored，不假装成功。 */
    const r = Cx.step(deps, Cx.blankState(), 'row.revoke', {}, { host: H, apis: APIS });
    if (r.handled !== false || r.ignored !== 'row.revoke') return '处置类动作不得在内核执行（须 handled:false 并点名 ignored）';
    /* 界面自身的动作**要**处理：翻页 / 改条件 / 清空。 */
    const pg = Cx.step(deps, Cx.blankState(), 'page', { page: 2 }, { host: H, apis: APIS });
    if (pg.handled !== true || pg.state.page !== 2) return '翻页须由内核处理（handled:true 且状态真的改了）';
    /* ★ 从 `page: 5` 起测「改条件回第一页」：从第 1 页起测时，回不回第一页在本读数上同形
     *   （测不到 —— 这正是本仓说的「判据自己空转」）。 */
    const ft = Cx.step(deps, Object.assign(Cx.blankState(), { page: 5 }), 'filter', { key: 'actor', value: '苏晴' }, { host: H, apis: APIS });
    if (ft.handled !== true || ft.state.actor !== '苏晴' || ft.state.page !== 1) return '改条件须由内核处理并回到第一页（不得停在旧页）';
    const bad = Cx.step(deps, Cx.blankState(), 'filter', { key: '__没这格__', value: 'x' }, { host: H, apis: APIS });
    if (bad.handled !== false || bad.ignored !== '__没这格__') return '未知界面字段须点名 ignored（不得静默吞掉）';
    return '';
}
/** F1：保存的是「条件」不是「结果」（单一真源：evidence-query 的 upsert/replay）。 */
function judgeSaved(Cx, deps) {
    const H = host900();
    const up = Q.upsertSaved([], { label: '甲', spec: { ledgers: ['commitment'], actors: ['苏晴'] } }, 1000);
    if (!up.saved) return '条件保存须走 evidence-query.upsertSaved（单一真源）';
    const saved = up.list;
    const f = Cx.dispatch(deps, Object.assign(Cx.blankState(), { saved: saved }), { host: H, apis: APIS });
    if (f.saved.length !== 1 || !f.saved[0].replayKey) return '保存项须经界面读出（带稳定 replayKey）';
    /* 保存项里不得出现结果字段（那是第二份证据库）。 */
    for (const it of f.saved) {
        for (const k of ['rows', 'total', 'hits', 'items', 'scanned']) {
            if (Object.prototype.hasOwnProperty.call(it, k)) return '保存项里不得存结果字段 `' + k + '`（那是第二份证据库）';
        }
    }
    const r = Cx.step(deps, Object.assign(Cx.blankState(), { saved: saved }), 'load-saved', { replayKey: f.saved[0].replayKey }, { host: H, apis: APIS });
    if (r.handled !== true) return '载入已保存的条件须由内核处理';
    if (r.view !== 'result' || r.pager.total !== 900) return '载入后须用当前原账重跑（应命中 900 条），实 ' + r.view + '/' + r.pager.total;
    if (r.state.activeSaved !== f.saved[0].replayKey) return '载入后须记下当前生效的条件键';
    /* 键对不上 ⇒ 点名，不静默。 */
    const miss = Cx.step(deps, Cx.blankState(), 'load-saved', { replayKey: '__无此键__' }, { host: H, apis: APIS });
    if (miss.handled !== false || miss.ignored !== '__无此键__') return '键对不上须点名 ignored（不得当作载入成功）';
    /* 渲染面：保存列表必须显示的是**条件摘要**，不是结果。 */
    const html = Cx.sheetHtml(f);
    if (html.indexOf('苏晴') < 0) return '渲染串须显示保存的条件摘要';
    return '';
}
/** G1：渲染与视图同源（`data-view` 自证四态 + 属性转义生效）。 */
function judgeRender(Cx, deps) {
    const H = host900();
    const run = (o) => Cx.sheetHtml(Cx.dispatch(deps, Object.assign(Cx.blankState(), o), { host: H, apis: APIS }));
    const ok = run({ text: 'AZ900' });
    if (!/data-view="result"/.test(ok)) return '有命中时渲染串须自证 data-view="result"';
    if (!/data-action="/.test(ok)) return '条目上须带动作标记（宿主据此把点击转给 handler）';
    if (!/data-mc="f"/.test(ok)) return '条件输入须带 data-mc="f" 标记';
    /* 翻页控件只在**真有多页**时出现（单页不渲染空控件 —— 那是诚实的：没有下一页就别给按钮）。 */
    const many = run({});
    if (many.indexOf('data-mc="page"') < 0) return '真有多页时须带 data-mc="page" 标记（单页不给按钮是对的）';
    if (/data-mc="page"/.test(ok)) return '只有一页时不得渲染翻页控件（假控件也是把「没有」说成「有」）';
    const empty = run({ text: '绝对不存在的词ZZZ' });
    if (!/data-view="empty"/.test(empty)) return '确实没有时渲染串须自证 data-view="empty"';
    const none = Cx.dispatch({ FILTERS: Q.FILTERS, LEDGERS: W.LEDGERS }, Cx.blankState(), { host: H, apis: APIS });
    if (!/data-view="error"/.test(Cx.sheetHtml(none))) return '内核缺席时渲染串须自证 data-view="error"';
    /* 属性转义：值里的双引号必须被转义，否则会吞并后续标签。 */
    const esc = Cx.dispatch(deps, Object.assign(Cx.blankState(), { text: 'a"b<c' }), { host: H, apis: APIS });
    const html = Cx.sheetHtml(esc);
    const m = /value="([^"]*)"/.exec(html);
    if (!m) return '条件输入须带 value 属性（否则转义判据无从取证）';
    if (m[1].indexOf('<') >= 0) return '属性值里的尖括号必须被转义';
    if (/value="a"b/.test(html)) return '属性值里的引号必须被转义（否则会吞并后续 HTML）';
    return '';
}
/** H1：宿主接线逐符号在场（取库口 + 唯一装配点 + 七出口 + 自述 + 诊断行）。 */
function judgeHost(src) {
    const once = ['memoryCenterDeps() {', '_memoryCenterAbsent(state, reason) {', 'memoryCenterView(state, opts) {',
        'memoryCenterStep(state, action, payload, opts) {', 'memoryCenterLoad(raw) {', 'memoryCenterBlankState() {',
        'memoryCenterSave(state) {', 'memoryCenterSheet(face) {', 'memoryCenterDescribe() {', 'memoryCenterLine() {',
        'function _memoryCenterLib() {'];
    for (const s of once) {
        const n = src.split(s).length - 1;
        if (n !== 1) return '宿主口须恰好在场一次：' + s + '（实 ' + n + '）';
    }
    if (!src.includes("_moduleLib(() => window.LonShaMemoryCenter, 'memory-center.js')")) return '取库口须真读全局名 + 文件名';
    if (!src.includes("['记忆控制', this.memoryCenterLine()]")) return '诊断行须接进 selfCheck 表';
    if (!src.includes('_memoryCenterLast')) return '宿主须留最近一次读数（诊断行据此说「上次扫了多少」）';
    /* 不写账：这条链路上不得出现 save/import/clear 之类写动作。 */
    const a = src.indexOf('memoryCenterView(state, opts) {');
    const b = src.indexOf('memoryCenterLoad(raw) {');
    if (a < 0 || b <= a) return '宿主方法体切片失败（判据失效）';
    const seg = src.slice(a, b);
    for (const banned of ['storage.save', '.import(', '.clear(']) {
        if (seg.indexOf(banned) >= 0) return '控制中心链路不得含写动作 `' + banned + '`';
    }
    /* 装配点七件键名须与内核 REQUIRED_DEPS 逐字一致（改名会静默变成「依赖缺席」）。
     *   判在**装配点方法体切片**里 —— 全文件搜键名会把别处同名常量也算进来（假绿第二形）。 */
    const da = src.indexOf('memoryCenterDeps() {');
    const db = src.indexOf('_memoryCenterAbsent(state, reason) {');
    if (da < 0 || db <= da) return '装配点方法体切片失败（判据失效）';
    const depsSeg = src.slice(da, db);
    for (const need of C.REQUIRED_DEPS) {
        if (depsSeg.indexOf(need.key + ':') < 0) return '装配点缺依赖键：' + need.key;
    }
    if (depsSeg.indexOf('LEDGERS: _evidenceQueryLedgersOf()') < 0) return '账本登记表须复用工作台的 LEDGERS（单一真源，不另抄一份）';
    return '';
}
/** H2：面板薄接线（渲染与字段表都不许在面板里重写）。 */
function judgePanel(src) {
    /* ★ 视图分支与交互块分别恰一处。注意 `else if (...)` 里**包含** `if (...)` 这个子串，
     *   故先扣掉带 `else ` 前缀的那一处再数（不扣会被自己的前缀数成两处 —— 判据自己翻红）。 */
    const elseIf = src.split("else if (viewType === 'memorycenter') {").length - 1;
    const anyIf = src.split("if (viewType === 'memorycenter') {").length - 1;
    if (elseIf !== 1) return '面板缺控制中心视图分支（恰一处，实 ' + elseIf + '）';
    if (anyIf - elseIf !== 1) return '面板缺控制中心交互绑定块（恰一处，实 ' + (anyIf - elseIf) + '）';
    if (src.indexOf('data-view="memorycenter"') < 0) return '状态总览须有控制中心入口卡片';
    if (src.split('+ s.memoryCenterSheet(face);').length - 1 !== 1) return '整页渲染须来自内核（面板只塞容器）';
    /* ★ 面板不得手抄一份字段清单（那是第二套字段表，与内核各长各的）。
     *   取证打**手抄形态本身**（含 `ledgers: []` / `actor: ''` 的字面对象），而不是打
     *   「某个变量名 = 字面表」—— 破坏副本把字面表塞进 `const b = {...}` 时，
     *   只打变量名的判据会**看不见**（判据自己空转，本条即由此现形）。 */
    if (/\{ ledgers: \[\], actor: ''/.test(src)) return '面板不得手抄字段清单（须取自 memoryCenterBlankState）';
    if (src.indexOf('memoryCenterBlankState()') < 0) {
        return '面板空白态须取自内核（memoryCenterBlankState）';
    }
    /* 处置类动作走 handler 映射；未接即如实提示，不假装成功。 */
    if (src.indexOf('const h = (plugin._memoryCenterHandlers || {})[id];') < 0) return '面板须把处置类动作转给 _memoryCenterHandlers';
    if (src.indexOf("toast('该动作未接：' + id)") < 0) return '未接的 handler 须如实提示「未接」（不得假装成功）';
    return '';
}

/* ── 破坏副本装载（真源码 → 真装载，不走 mock） ── */
function loadBroken(tag, src, anchor, repl) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3310-' + tag + '-'));
    const p = path.join(dir, MOD);
    const broken = breakOnce(src, anchor, repl, tag);
    fs.writeFileSync(p, broken);
    const chk = require_('node:child_process').spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
    assert.equal(chk.status, 0, '破坏副本必须语法可过（否则归因不成立）：' + String(chk.stderr).slice(-300));
    return require_(p);
}

/* ══════════════════ A 模块与导出面 ══════════════════ */
test('v3310 A1. ★★★★ 模块登记面：分发面恰一次 + 末位（零兄弟依赖）+ 双导出 + 冻结', () => {
    assert.ok(fs.existsSync(path.join(R, MOD)), MOD + ' 必须在场');
    assert.equal(judgeA1(C, MF, MOD_SRC), '', '登记面判据');
    assert.equal(MF.extra_js.filter((x) => x === MOD).length, 1, MOD + ' 须恰登记一次');
});

test('v3310 A2. ★★★★ 导出面：十五个函数 + 五张登记表 + 版本常量', () => {
    assert.equal(judgeA2(C), '', '导出面判据');
    assert.deepEqual(C.VIEW_STATES.slice(), ['panel', 'result', 'empty', 'unknown', 'error'], '视图词表逐字');
    const sc = C.selfCheck(depsOf());
    assert.equal(sc.ok, true, '自检须为真：' + JSON.stringify(sc));
    assert.equal(sc.viewsComplete, true);
    assert.equal(sc.actionsCoherent, true);
    assert.equal(sc.writesNothing, true);
});

test('v3310 B1. ★★★★★ 界面字段映射与真源 FILTERS 逐字对齐（自指口径不可见的那一格）', () => {
    assert.equal(judgeB1(C, Q.FILTERS), '', '对齐判据');
    /* 十项条件键逐字核对（不许推导：改名即漏一类条件）。 */
    const want = ['ledgers', 'actors', 'statuses', 'sources', 'floorFrom', 'floorTo', 'revisionFrom', 'revisionTo', 'text', 'hasFloor'];
    const got = C.UI_FIELDS.map((f) => f.specKey);
    assert.deepEqual(got, want, 'UI_FIELDS 的 specKey 须与真源条件键逐字一致');
});

/* ══════════════════ C 四态分形 / 超 200 条 ══════════════════ */
test('v3310 C1. ★★★★★ 四态分形：有命中 / 确实没有 / 判不了（三路）/ 面不可用（三路）', () => {
    assert.equal(judgeStates(C, depsOf()), '', '四态判据');
});

test('v3310 C2. ★★★★★ 超 200 条仍能翻到最老那条（界面不得再切一次窗口）', () => {
    assert.equal(judgeBeyond200(C, depsOf()), '', '超 200 条判据');
});

/* ══════════════════ D 零写 / E 动作 ══════════════════ */
test('v3310 D1. ★★★★ 查询零写副作用（dispatch / step 前后宿主账本逐字节相同）', () => {
    assert.equal(judgeZeroWrite(C, depsOf()), '', '零写判据');
});

test('v3310 E1. ★★★★★ 动作只声明不执行：缺 handler 降级 + 处置类如实回报未处理', () => {
    assert.equal(judgeActions(C, depsOf()), '', '动作判据');
});

/* ══════════════════ F 保存条件 / G 渲染 ══════════════════ */
test('v3310 F1. ★★★★ 保存的是条件不是结果（单一真源：evidence-query 的 upsert / replay）', () => {
    assert.equal(judgeSaved(C, depsOf()), '', '保存判据');
});

test('v3310 G1. ★★★★ 渲染与视图同源：四态自证 + 属性转义生效', () => {
    assert.equal(judgeRender(C, depsOf()), '', '渲染判据');
});

/* ══════════════════ H 宿主与面板接线 ══════════════════ */
test('v3310 H1. ★★★★★ 宿主接线逐符号在场（取库口 / 唯一装配点 / 七出口 / 自述 / 诊断行 / 无写动作）', () => {
    assert.equal(judgeHost(IDX), '', '宿主接线判据');
    /* 本面刻意不进快照：快照构造里不得出现 memoryCenter*（每轮付一遍九账扫描代价的那种设计）。 */
    const at = IDX.indexOf('const snap = {');
    assert.ok(at > 0, '快照构造点必须在场（否则本判据扫描面失效，会恒真）');
    assert.equal(/memoryCenter/.test(IDX.slice(at, at + 12000)), false, '控制中心不得进快照（按需查询口 ≠ 每轮状态投影）');
});

test('v3310 H2. ★★★★★ 面板薄接线：渲染与字段表都不许在面板里重写', () => {
    assert.equal(judgePanel(UI), '', '面板接线判据');
});

/* ══════════════════ J 加载面 ══════════════════ */
test('v3310 J1. 加载面：模块登记进 extra_js 且磁盘在场', () => {
    assert.ok(MF.extra_js.includes(MOD), MOD + ' 必须在 manifest.extra_js（不登记 = 浏览器不加载 = 面永远缺席）');
    assert.equal(MF.extra_js.filter((x) => x === MOD).length, 1, MOD + ' 始终恰登记一次');
    assert.ok(fs.existsSync(path.join(R, MOD)), '磁盘必须在场');
    assert.ok(MF.extra_js.includes('evidence-query.js'), '内核须仍登记（本模块复用它的条件口径）');
    assert.ok(MF.extra_js.includes('evidence-workbench.js'), '工作台须仍登记（账本登记表的单一真源）');
});

/* ══════════════════ K 负控制 / 判据纯度 ══════════════════ */
test('v3310 K1. ★★★★ 破坏工具两向自证：锚点不存在 / 不唯一 / 同值替换，都必须抛', () => {
    assert.throws(() => breakOnce(MOD_SRC, '__不存在__', 'x'), /恰中 1 次/);
    assert.throws(() => breakOnce(MOD_SRC, 'e', 'x'), /恰中 1 次/, '单字符锚点必不唯一');
    assert.throws(() => breakOnce(MOD_SRC, ANCHORS.views, ANCHORS.views), /同值替换/);
    assert.notEqual(breakOnce(MOD_SRC, ANCHORS.views, ANCHORS.viewsBroken), MOD_SRC, '真破坏必须可观测地改变源码');
});

test('v3310 K2. ★★★★★ 六条真源码破坏负控制（每条必须让对应判据转红）+ 正控制地基', () => {
    const deps = depsOf();
    /* 地基：未破坏时全部判据必须为真（否则后面的「转红」可能是判据自己坏了）。 */
    assert.equal(judgeA2(C), '', '原件上导出面判据必须为真');
    assert.equal(judgeStates(C, deps), '', '原件上四态判据必须为真');
    assert.equal(judgeActions(C, deps), '', '原件上动作判据必须为真');
    assert.equal(judgeRender(C, deps), '', '原件上渲染判据必须为真');

    /* ① 拆掉视图词表里的一态 ⇒ 自检须转 false。 */
    const b1 = loadBroken('views', MOD_SRC, ANCHORS.views, ANCHORS.viewsBroken);
    assert.equal(b1.VIEW_STATES.length, 4, '破坏必须真的生效（词表少一态）');
    assert.equal(b1.selfCheck(deps).viewsComplete, false, '拆掉一态必须让 viewsComplete 转 false');
    assert.equal(b1.selfCheck(deps).ok, false, '拆掉一态必须让自检整体转 false');

    /* ② 扫描面为空被判成「确实没有」⇒ 四态判据须点名。 */
    const b2 = loadBroken('scan', MOD_SRC, ANCHORS.scanAbsent, ANCHORS.scanAbsentBroken);
    const f2 = b2.dispatch(deps, b2.blankState(), { host: {}, apis: APIS });
    assert.equal(f2.view, 'empty', '破坏必须真的生效（面坏了被报成没有）');
    assert.ok(judgeStates(b2, deps).indexOf('scan-surface-absent') >= 0, '同款判据须点名：' + judgeStates(b2, deps));

    /* ③ 点了不存在的账被判成「确实没有」⇒ 四态判据须点名。 */
    const b3 = loadBroken('unknown', MOD_SRC, ANCHORS.unknownLedger, ANCHORS.unknownLedgerBroken);
    assert.ok(judgeStates(b3, deps).indexOf('unknown-ledger') >= 0, '同款判据须点名：' + judgeStates(b3, deps));
    assert.equal(judgeStates(C, deps), '', '对照：原件上仍为零问题');

    /* ④ 宿主未提供的 handler 不再降级 ⇒ 动作判据须点名（本仓最忌的「说成可用」）。 */
    const b4 = loadBroken('degrade', MOD_SRC, ANCHORS.degrade, ANCHORS.degradeBroken);
    const f4 = b4.dispatch(deps, b4.blankState(), { host: host900(), apis: APIS, availableHandlers: ['row.detail'] });
    /* 破坏只摘掉 `kind` 的降级（`unavailable` 标记仍在）—— 这正是要现形的那半：症状是「界面上
     *   按钮看着可用」，故按 `kind` 取证，不按 `unavailable` 布尔取证。 */
    assert.equal(f4.actions.filter((a) => a.kind === 'unavailable').length, 0, '破坏必须真的生效（kind 不再降级）');
    assert.match(judgeActions(b4, deps), /unavailable/, '同款判据须点名降级失效：' + judgeActions(b4, deps));

    /* ⑤ 属性转义被摘 ⇒ 渲染判据须点名。 */
    const b5 = loadBroken('escattr', MOD_SRC, ANCHORS.escAttr, ANCHORS.escAttrBroken);
    const escFace = b5.dispatch(deps, Object.assign(b5.blankState(), { text: 'a"b<c' }), { host: host900(), apis: APIS });
    const escHtml = b5.sheetHtml(escFace);
    assert.equal(/value="a"b/.test(escHtml), true, '破坏必须真的生效（引号未转义）');
    assert.ok(judgeRender(b5, deps).indexOf('转义') >= 0, '同款判据须点名转义失效：' + judgeRender(b5, deps));

    /* ⑥ 改条件不回第一页 ⇒ 动作判据须点名（「改了条件却停在旧页」会看着像查不到）。 */
    const b6 = loadBroken('pagereset', MOD_SRC, ANCHORS.pageReset, ANCHORS.pageResetBroken);
    const st6 = Object.assign(b6.blankState(), { page: 5 });
    const ft6 = b6.step(deps, st6, 'filter', { key: 'actor', value: '苏晴' }, { host: host900(), apis: APIS });
    assert.equal(ft6.state.page, 5, '破坏必须真的生效（改条件后仍停在旧页）');
    assert.ok(judgeActions(b6, deps).indexOf('第一页') >= 0, '同款判据须点名：' + judgeActions(b6, deps));

    /* 面板侧负控制：面板手抄字段清单 ⇒ 面板判据须点名。 */
    const uiBroken = breakOnce(UI, UI_ANCHORS.fromCore, UI_ANCHORS.handCopy, 'panel-handcopy');
    assert.notEqual(uiBroken, UI, '破坏必须真的生效');
    assert.ok(judgePanel(uiBroken).indexOf('memoryCenterBlankState') >= 0 || judgePanel(uiBroken).indexOf('手抄') >= 0,
        '面板判据须点名手抄字段表：' + judgePanel(uiBroken));
    assert.equal(judgePanel(UI), '', '对照：原件上面板判据仍为零问题');
});

/* ══════════════════ L 判据纯度 / 版本锚 ══════════════════ */
test('v3310 L1. ★★★ 判据纯度：每个锚点字面量在本档只声明一次 + 面板锚点同样', () => {
    for (const [k, v] of Object.entries(ANCHORS)) {
        assert.equal(SELF.split(v).length - 1, 1, '锚点 ' + k + ' 在本档里必须恰出现 1 次（纯度检查才有内容）');
    }
    for (const [k, v] of Object.entries(UI_ANCHORS)) {
        assert.equal(SELF.split(v).length - 1, 1, '面板锚点 ' + k + ' 在本档里必须恰出现 1 次');
    }
    /* fail-closed：模块缺失 / 登记行缺失都必须抛（不静默跳过）。 */
    assert.ok(fs.existsSync(path.join(R, MOD)), '模块必须真在场（缺 ⇒ 本档当场抛，不静默跳过）');
    assert.throws(() => fs.accessSync(path.join(R, 'no-such-file-' + MOD)), /ENOENT/);
});

/** 版本序数（本档自锚常量形，供版本守卫 V4 计数）。 */
const vnum = (s) => { const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s).trim()); return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN; };
/** 本档出生版本（V4 当版锚点：锚必须住在**当版档案**里，故写在这一档、不写进历史文件）。 */
const BORN = '3.310.0';

test('v3310 M1. ★★★ 版本锚：本档出生版本 + 四源同源（V4 当版锚点形态）', () => {
    assert.equal(vnum(BORN), 3310000, 'vnum 序数必须可数（当版锚点）');
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(codeVer, '入口版本常量必须在场');
    assert.ok(vnum(codeVer) >= vnum(BORN), '本套件只在 ' + BORN + ' 及以后成立；当前 ' + codeVer);
    assert.equal(MF.version, codeVer, 'manifest 与入口同源');
    assert.equal(PKG.version, codeVer, 'package.json 与入口同源');
    for (const m of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const mv = (/let VERSION = '([^']+)'/.exec(read(m)) || [])[1];
        assert.equal(mv, codeVer, m + ' 副本须与入口同源（须是 let：bindDeps 可换，const 会 TypeError）');
    }
    assert.ok(SELF.includes("const BORN = '3.310.0'"), '当版锚点必须显式留在本档里');
    assert.equal(SELF.includes('vnum(BORN)'), true, '锚形须可被守卫计数');
});
