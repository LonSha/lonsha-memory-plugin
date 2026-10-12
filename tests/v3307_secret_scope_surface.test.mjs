// tests/v3307_secret_scope_surface.test.mjs — M-O8 **第二刀**：秘密正文的三条外供路径收口 [v3.307.0]
// ------------------------------------------------------------
// 【修前实测（真探针，见 /tmp/probe_sec_proj.mjs 的同款读数）】
//   同一条秘密的**正文**同时出现在三条对外路径上：
//     ① `evidence-workbench.js` 的 secret 投影行 `title` —— 就是 `text(it.secret, MAX_TEXT)`；
//     ② `evidence-query.js` 的 `row.text` —— 由该模块自己的 textFields:['secret'] 拼出来；
//     ③ 宿主 `exportMemoryReport()` 的导出文件（日记板块连「未说出口」都照抄）。
//   而这三个模块的导出面里**零知识范围出口** —— 下游能读到正文，却问不出「这条现在能不能说」。
//   这正是 M-O8 验收③「诊断可显示『存在但不可用』，不得直接泄露正文」与④
//   「导出包按知识范围过滤」所点的缺口。
//
// 【本档判据（每条都真跑真源，不读注释、不读声明）】
//   A 面结构：工作台/查询面导出面在场；行上 `scope` / `masked` 两列恒定键
//   B 工作台行为：投影行 title 不是正文；scope 三态互不同形；正文不进本面检索
//   C 第二列泄漏：查询面的 `row.text` 也不含正文（只改一处 = 另一列照旧泄）
//   D 单一真源：知识范围判定只许调该账自己的 `knowledgeOf`，本模块不得重解一遍
//   E 诊断面（验收③）：诊断行报「存在但不可用」并分档报「判不了」
//   F 导出面（验收④）：报告只带存在性 + 知识范围，正文一律不外带
//   G 负控制 ×4（真源码破坏 → 破坏副本上重跑**同一套**判据 → 必须转红）
//   H 锚点两向自证（不存在 / 不唯一 / 同值替换必须抛，不得静默跳过）
//   I 版本锚（本档锚当版，供版本守卫 V4 计数）
//
// 【负控制纪律（本仓 v2.98 / H5-H6）】
//   · 破坏必须发生在**真源码**上，且锚点恰中期望次数；
//   · 在**破坏副本**上重跑同一套判据体（不是另写一份简化判据）；
//   · 判据不得复述锚点字面量 —— 锚点在本层由 `ANCHORS` 统一声明（见 H1 纯度判据）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { breakOnce } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const require_ = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const EW_SRC = read('evidence-workbench.js');
const EQ_SRC = read('evidence-query.js');
const IDX_SRC = read('index.js');

const EW = require_(path.join(ROOT, 'evidence-workbench.js'));
const EQ = require_(path.join(ROOT, 'evidence-query.js'));
const K = require_(path.join(ROOT, 'secret-ledger.js'));
const M = (f) => require_(path.join(ROOT, f));

const APIS = {
    'seed': M('seed-ledger.js'), 'commitment': M('commitment-ledger.js'), 'parallel': M('parallel-ledger.js'),
    'secret': K, 'recall-echo': M('recall-echo.js'), 'echo': M('echo-ledger.js'),
    'fact-version': M('fact-version.js'), 'event-completeness': M('event-completeness.js'), 'repair': M('repair-loop.js')
};

/** 三条真秘密：有名单 / 无名单 / 判据缺（api 不带 knowledgeOf）—— 三态互不同形的前提。 */
const SECRET_BODY_A = '养女实为仇家之后';
const SECRET_BODY_B = '账上少了三成';
let SEC_STATE = null;
SEC_STATE = K.seal(SEC_STATE, { secret: SECRET_BODY_A, keeper: ['阿绣'], knowers: ['阿绣'], about: ['阿绣'], floor: 3 }).state;
SEC_STATE = K.seal(SEC_STATE, { secret: SECRET_BODY_B, keeper: ['老周'], floor: 5 }).state;

/** 真账本写出的 host（只给 workbench 需要的那几本账，其余缺席由三态如实报）。 */
function mkHost() {
    const S = APIS['seed'], C = APIS.commitment, P = APIS.parallel, RE = APIS['recall-echo'], E = APIS.echo;
    return {
        worldProg: {
            seedLedger: S.plant(null, { hook: '冰箱里的旧照片', source: '第3楼', floor: 3 }).state,
            commitmentLedger: C.open(null, { content: '周末去看房子', actor: '阿绣', floor: 5 }).state,
            parallelLedger: P.note(null, { title: '搬家', fact: '正在搬家', place: '老城区', who: ['阿绣'], floor: 7 }).state,
            secretLedger: SEC_STATE,
            recallEcho: RE.mark(null, { detail: '钥匙串', kind: 'clue', floor: 11 }).state,
            echoLedger: E.produce(null, { mode: 'pocket', char: '阿绣', floor: 13, fields: { 物品: '伞' }, os: '今天风很大' }).state
        },
        _factVersionState: null, _eventThreadState: null, _repairState: null
    };
}
/** 无 `knowledgeOf` 的 secret API（模拟「旧版模块在场」）：判据缺必须与「判不了」分档。 */
function apisWithoutKnowledgeOf() {
    const copy = Object.assign({}, K);
    delete copy.knowledgeOf;
    return Object.assign({}, APIS, { 'secret': copy });
}

/* ══════════ 真源码破坏的锚点：**在本层只声明一次**（H1 纯度判据据此计数） ══════════
 * 判据体一律引用本表的字段，不复述锚点串 —— 复述会让纯度判据数到它自己那一份而恒过。 */
const ANCHORS = {
    /* 工作台：秘密投影行的站位串（把正文放回去即破坏） */
    ewTitle: '                    title: SECRET_MASK,',
    /* 工作台：行上的知识范围列（塌成一态即破坏） */
    ewScope: '                    scope: k.state, masked: true,',
    /* 查询面：正文不进检索面（写回 ['secret'] 即破坏） */
    eqTextFields: '            textFields: [],',
    /* 导出面：秘密段的表头（正文一旦随报告出去即破坏） */
    idxReportHead: "push('## 🤫 未揭露的秘密（正文按知识范围隔离，不随报告导出）');"
};
const ANCHOR_VALUES = Object.values(ANCHORS);

/* ══════════ 判据体（纯函数：吃「模块源码」→ 返回问题列表；空 = 卫生） ══════════
 * 三件事都必须由**同一份判据**承担：正例、负控制、以及破坏副本上的复跑。 */

function loadFrom(src) {
    const mod = { exports: {} };
    new Function('window', 'module', 'exports', src)(undefined, mod, mod.exports);
    return mod.exports;
}
const verge = (arr, i) => (Array.isArray(arr) ? arr[i] : undefined);

/** B/D：工作台投影面 —— 正文不外泄 + 知识范围三态互不同形 + 判定只走单一真源。 */
function judgeWorkbench(W, apis) {
    const P = [];
    if (typeof W.buildWorkbench !== 'function') return ['工作台未导出 buildWorkbench（面被摘）'];
    const face = W.buildWorkbench(mkHost(), { apis: apis || APIS, now: () => 1000 });
    const sec = (face.ledgers || {})['secret'];
    if (!sec || sec.state !== 'ok') return ['秘密账未取到（state=' + (sec && sec.state) + '）—— 本判据失去对象'];
    const rows = Array.isArray(sec.items) ? sec.items : [];

    /* B1 正文不得出现在本面的任何行里（逐字扫，不只看 title） */
    for (const r of rows) {
        const blob = JSON.stringify(r);
        if (blob.indexOf(SECRET_BODY_A) >= 0 || blob.indexOf(SECRET_BODY_B) >= 0) {
            P.push('B1 秘密正文出现在投影行里（ref=' + r.ref + '）—— 诊断面不得携带正文');
        }
    }
    /* B2 行上两列恒定键在场（下游据 masked 区分「本来没正文」与「被遮蔽」） */
    for (const r of rows) {
        if (!('scope' in r) || !('masked' in r)) P.push('B2 投影行缺 scope / masked 列（ref=' + r.ref + '）');
        else if (r.masked !== true) P.push('B2 秘密行未声明遮蔽（masked=' + r.masked + '）');
    }
    /* B3 三态互不同形：有名单 ⇒ listed；无名单 ⇒ unlisted；api 无判据 ⇒ null（**不得**回落成 unlisted） */
    const scopes = rows.map((r) => r.scope);
    if (scopes.length < 2) P.push('B3 夹具面不足（须 ≥2 条秘密才能判三态）');
    else {
        if (scopes[0] !== 'listed') P.push('B3 有名单的那条必须读成 listed，实 ' + scopes[0]);
        if (scopes[1] !== 'unlisted') P.push('B3 无名单的那条必须读成 unlisted（判不了），实 ' + scopes[1]);
    }
    const blind = W.buildWorkbench(mkHost(), { apis: apisWithoutKnowledgeOf(), now: () => 1000 });
    const blindRow = verge((blind.ledgers || {}).secret && blind.ledgers.secret.items, 0);
    if (!blindRow) P.push('B3 判据缺的副本上取不到行');
    else {
        if (blindRow.scope !== null) P.push('B3 本账无 knowledgeOf 时 scope 必须为 null（判据缺 ≠ 判不了），实 ' + blindRow.scope);
        if (String(blindRow.detail).indexOf('判不了') < 0) P.push('B3 判据缺必须在 detail 里说出来（否则「缺判据」与「判不了」同形）');
        if (blindRow.scope === 'unlisted') P.push('B3 判据缺被回落成 unlisted —— 那是猜，不是判');
    }
    /* B4 正文不得进本面的检索结果（诊断面不承担正文检索） */
    const s = (typeof W.search === 'function') ? W.search(face, SECRET_BODY_A, {}) : null;
    if (!s) P.push('B4 工作台未导出 search（检索面被摘）');
    else {
        if (s.hits.some((h) => JSON.stringify(h).indexOf(SECRET_BODY_A) >= 0)) P.push('B4 检索结果里出现正文');
        if (!s.missLedgers.some((m) => m.id === 'secret')) {
            P.push('B4 秘密账须落在 missLedgers（账在位、这一问没命中）—— 被读成缺席/空账就是错读数');
        }
    }
    /* D 单一真源：本模块只许调该账的 knowledgeOf，不许自己重解「知不知道」 */
    if (EW_SRC_PROBE.indexOf('api.knowledgeOf') < 0) P.push('D 知识范围判定未走账本自己的 knowledgeOf（单一真源被绕开）');
    if (/listHas\s*\(/.test(EW_SRC_PROBE) || /knowers[^\n]*\.some\s*\(/.test(EW_SRC_PROBE)) {
        P.push('D 工作台里出现了第二份「名单里有没有他」的实现 —— 同一口径的第二处实现即缺陷');
    }
    return P;
}
/* D 段的「本模块源码」：正例与破坏副本都必须用**当前这份**（否则破坏会被静默忽略）。 */
let EW_SRC_PROBE = EW_SRC;

/** C：查询面 —— 第二列泄漏（row.text）+ 行上透出 scope / masked。 */
function judgeQuery(Q, apis) {
    const P = [];
    if (typeof Q.query !== 'function') return ['查询面未导出 query（面被摘）'];
    const ledgers = (typeof Q.FACETS !== 'undefined' && Array.isArray(Q.FACETS))
        ? Q.FACETS.map((f) => ({ id: f.id, label: f.why ? f.id : f.id }))
        : [];
    /* ★ 必须把**完整登记表**传下去（state / pick / project / keyOf 四件都在里面）。
     *   只传 {id,label} 会让 universeOf 读成 state-missing ⇒ 整面判空 ——
     *   那样测的是夹具搭得对不对，不是收口有没有生效（本档首跑即栽在这里）。 */
    const ledgersFromWb = (typeof EW.LEDGERS !== 'undefined' && Array.isArray(EW.LEDGERS))
        ? EW.LEDGERS : ledgers;
    const res = Q.query(mkHost(), { ledgers: ['secret'] }, { apis: apis || APIS, ledgers: ledgersFromWb, pageSize: 50 });
    /* 行序按 ref 升序稳定（sec_1 / sec_2），与夹具的声明序一致。 */
    const rows = (Array.isArray(res.rows) ? res.rows : []).slice().sort((a, b) => String(a.ref).localeCompare(String(b.ref), 'en'));
    if (!rows.length) return ['查询面在夹具上取不到秘密行 —— 本判据失去对象（state=' + res.state + '）'];
    for (const r of rows) {
        const blob = JSON.stringify(r);
        if (blob.indexOf(SECRET_BODY_A) >= 0 || blob.indexOf(SECRET_BODY_B) >= 0) {
            P.push('C1 正文出现在查询行里（ref=' + r.ref + '）—— title 与 text 是两个列，两列都得收口');
        }
        if (!('masked' in r) || r.masked !== true) P.push('C1 查询行未透出 masked（下游无从区分「没正文」与「被遮蔽」）');
        if (!('scope' in r)) P.push('C1 查询行未透出 scope（知识范围未随行外供）');
        else if (r.scope !== 'listed' && r.scope !== 'unlisted' && r.scope !== null) P.push('C1 scope 取值不在三态内：' + r.scope);
    }
    if (verge(rows, 0).scope !== 'listed') P.push('C2 有名单那行必须读成 listed，实 ' + verge(rows, 0).scope);
    if (verge(rows, 1).scope !== 'unlisted') P.push('C2 无名单那行必须读成 unlisted（判不了），实 ' + verge(rows, 1).scope);
    return P;
}

/** E：诊断行（验收③「存在但不可用」）。 */
function judgeDiagLine(W, Q) {
    const P = [];
    const face = W.buildWorkbench(mkHost(), { apis: APIS, now: () => 1000 });
    const wl = (typeof W.line === 'function') ? String(W.line(face)) : '';
    if (!wl) P.push('E 工作台诊断行为空（写不出结论的一档不得静默）');
    else {
        if (wl.indexOf('存在但不可用') < 0) P.push('E 诊断行未声明「存在但不可用」—— 验收③要的正是这一读数');
        if (wl.indexOf('判不了') < 0) P.push('E 诊断行未把「判不了」单独报出来（并进挡下就是错读数）');
        if (wl.indexOf(SECRET_BODY_A) >= 0 || wl.indexOf(SECRET_BODY_B) >= 0) P.push('E 诊断行里出现正文');
    }
    const ledgersFromWb = EW.LEDGERS; /* 同 ①：必须给完整登记表 */
    const res = Q.query(mkHost(), { ledgers: ['secret'] }, { apis: APIS, ledgers: ledgersFromWb, pageSize: 50 });
    const ql = (typeof Q.line === 'function') ? String(Q.line(res)) : '';
    if (ql.indexOf('正文遮蔽') < 0) P.push('E 查询面诊断行未报「正文遮蔽」条数（无此读数则遮蔽不可见）');
    if (ql.indexOf(SECRET_BODY_A) >= 0 || ql.indexOf(SECRET_BODY_B) >= 0) P.push('E 查询面诊断行里出现正文');
    return P;
}

/** F：导出面（验收④）—— 从 index.js **切真源码片段**跑，不手抄一份实现。 */
function secretSliceOf(idxSrc) {
    const startMark = '/* [v3.307.0 · M-O8 第二刀] 秘密账的导出面';
    const endMark = "} catch (e) { errLog(e, 'exportMemoryReport.secretScope'); }";
    const a = idxSrc.indexOf(startMark);
    const b = idxSrc.indexOf(endMark);
    if (a < 0 || b < 0 || b < a) return null;
    return idxSrc.slice(a, b + endMark.length);
}
function runSecretSlice(idxSrc) {
    const seg = secretSliceOf(idxSrc);
    if (!seg) return null;
    const body = seg.replace(/\bthis\./g, 'self.');
    /* 内层不声明 `push` 形参，也不重名：段体自己在 L 上 push，句尾统一取值。 */
    /* 形参只留段体真正需要的外部名（`self` / `window`）：与内部垫片同名会直接
     *   SyntaxError —— 抛错 ≠ 翻红，本档首跑即栽在这里。
     *   `window` 只用来让段体的 `() => window.LonShaSecretLedger` 取到真账模块，
     *   取不到时 `_moduleLib` 返回 null，段体自行回落读 `self.worldProg.secretLedger`。 */
    const fn = new Function('self', 'window',
        'const L = []; const push = (s) => L.push(s);'
        + 'const errLog = () => {};'
        + 'const _moduleLib = (g) => (typeof g === "function" ? g() : null);'
        + 'try { ' + body + ' } catch (e) { return { thrown: String(e && e.message) }; }'
        + 'return { text: L.join("\\n") };');
    const self = { worldProg: { secretLedger: SEC_STATE } };
    return fn(self, { LonShaSecretLedger: K });
}
function judgeReport(idxSrc) {
    const P = [];
    const r = runSecretSlice(idxSrc);
    if (!r) return ['F 从 index.js 切不到秘密导出段（段被删/标记被改）—— 判据 fail-closed'];
    if (r.thrown) return ['F 秘密导出段真跑抛错：' + r.thrown];
    const txt = String(r.text || '');
    if (txt.indexOf('未揭露的秘密') < 0) P.push('F 报告未出现秘密段（存在性读数缺失）');
    if (txt.indexOf(SECRET_BODY_A) >= 0 || txt.indexOf(SECRET_BODY_B) >= 0) {
        P.push('F 报告里出现秘密正文 —— 导出包必须按知识范围过滤（验收④）');
    }
    if (txt.indexOf('判不了') < 0) P.push('F 报告未报「判不了」条数（边界可判与否必须分开）');
    return P;
}

/* ══════════ A. 面结构 ══════════ */
test('v3307 A1. ★★ 两个面都在场，且行上的 scope / masked 是恒定键（非秘密账为 null / false）', () => {
    assert.equal(typeof EW.buildWorkbench, 'function', '工作台导出面必须在场');
    assert.equal(typeof EW.LEDGERS, 'object', '九账登记表必须在场');
    assert.equal(typeof EQ.query, 'function', '查询面必须在场');
    assert.equal(EW.EVIDENCE_VERSION, 3, '证据面版本须抬到 3（修后 title 语义变了：正文 → 站位串）');
    /* [v3.321.0 · B 包 M3-O6] 本行原为 `assert.equal(EQ.QUERY_VERSION, 2, ...)` ——
     *   它记的是 **v3.307.0 秘密面收口那一刻的读数**。M3-O6 新增三面
     *   （投影缓存 / 轻索引 / 协作式查询）后查询面抬到 **3**；
     *   本档要守的是「查询面有版本常量在场且 ≥ 收口时的读数」，不是那个具体数字。 */
    assert.ok(EQ.QUERY_VERSION >= 2, '查询面版本须在场且不低于 2（v3.307 收口读数；M3-O6 后为 3）');
    assert.equal(EQ.QA_VERSION, 1, 'M3-X1 问答面版本须在场（v3.321.0）');
    /* 非秘密账的两列必须仍是恒定的 null / false（不得为了秘密面把九账行键改歪） */
    const face = EW.buildWorkbench(mkHost(), { apis: APIS, now: () => 1000 });
    for (const id of ['seed', 'parallel', 'commitment']) {
        const it = verge((face.ledgers[id] || {}).items, 0);
        assert.ok(it, id + ' 应有行');
        assert.equal(it.scope, null, id + ' 的 scope 必须为 null（非秘密账无知识范围）');
        assert.equal(it.masked, false, id + ' 的 masked 必须为 false');
    }
    console.log('  ✓ 两面在场；EVIDENCE_VERSION=3 / QUERY_VERSION=2；非秘密账两列为 null/false');
});

test('v3307 A2. ★★ 秘密行面键不变（只增两列，不改既有键）—— 下游按键断言不必猜', () => {
    const face = EW.buildWorkbench(mkHost(), { apis: APIS, now: () => 1000 });
    const row = face.ledgers['secret'].items[0];
    for (const k of ['ref', 'ledger', 'ledgerLabel', 'title', 'detail', 'status', 'floor', 'updatedFloor', 'source', 'revision']) {
        assert.ok(k in row, '既有键必须仍在：' + k);
    }
    assert.deepEqual(Object.keys(row), ['ref', 'ledger', 'ledgerLabel', 'title', 'detail', 'status', 'floor', 'updatedFloor', 'source', 'revision', 'scope', 'masked'],
        '行键须恰为「修前那一套 + scope + masked」—— 顺序也要一致（便于下游逐字对差）');
    console.log('  ✓ 行键 = 修前 10 键 + scope/masked（顺序一致）');
});

test('v3307 A3. ★★★ 三条外供路径的正例：判据体在健康树上全绿（否则后面「破坏翻红」不可归因）', () => {
    assert.deepEqual(judgeWorkbench(EW, APIS), [], '工作台投影面');
    assert.deepEqual(judgeQuery(EQ, APIS), [], '查询面');
    assert.deepEqual(judgeReport(IDX_SRC), [], '导出面');
    console.log('  ✓ 三面正例全绿');
});

/* ══════════ B/C/D/E/F. 行为面（同一批判据，负控制复跑同一份） ══════════ */
test('v3307 B1. ★★★★★ 工作台：正文不进投影行，且不进本面检索（诊断面只报存在性与知识范围）', () => {
    const P = judgeWorkbench(EW, APIS).filter((x) => x[0] === 'B');
    assert.deepEqual(P, [], '工作台行为面：' + P.join(' | '));
    console.log('  ✓ 正文不在投影行里；检索不再命中秘密正文（落 missLedgers 而非缺席）');
});

test('v3307 B2. ★★★★★ 知识范围三态互不同形：listed / unlisted / 判据缺', () => {
    const face = EW.buildWorkbench(mkHost(), { apis: APIS, now: () => 1000 });
    const rows = face.ledgers['secret'].items;
    assert.equal(rows[0].scope, 'listed', '有名单 ⇒ listed');
    assert.equal(rows[1].scope, 'unlisted', '无名单 ⇒ unlisted（判不了，不得当挡下）');
    const blind = EW.buildWorkbench(mkHost(), { apis: apisWithoutKnowledgeOf(), now: () => 1000 });
    assert.equal(blind.ledgers['secret'].items[0].scope, null, '本账无 knowledgeOf ⇒ null（判据缺 ≠ 判不了）');
    assert.match(blind.ledgers['secret'].items[0].detail, /判不了/, '判据缺必须在 detail 里说出来');
    assert.notEqual(blind.ledgers['secret'].items[0].scope, 'unlisted', '判据缺不得回落成 unlisted（那是猜）');
    console.log('  ✓ 三态：listed / unlisted / null（判据缺）');
});

test('v3307 C1. ★★★★★ 查询面第二列收口：row.text 也不再携带正文', () => {
    const P = judgeQuery(EQ, APIS);
    assert.deepEqual(P, [], '查询面：' + P.join(' | '));
    /* 反向对照：证明这条判据不是空的 —— 修前那一列确实是正文 */
    const facets = EQ.FACETS.filter((f) => f.id === 'secret')[0];
    assert.deepEqual(facets.textFields, [], 'secret 的 textFields 必须为空数组（修前是 ["secret"]）');
    console.log('  ✓ 查询面两列都收口；secret.textFields = []');
});

test('v3307 D1. ★★★★ 单一真源：知识范围判定只调该账自己的 knowledgeOf，本模块不重解一遍', () => {
    const P = judgeWorkbench(EW, APIS).filter((x) => x[0] === 'D');
    assert.deepEqual(P, [], '单一真源：' + P.join(' | '));
    assert.ok(EW_SRC.indexOf('api.knowledgeOf') > 0, '工作台必须调账本自己的 knowledgeOf');
    assert.ok(EW_SRC.indexOf('knowledgeScopeOf') > 0, '取值函数必须在场（本档据此定位单一真源）');
    console.log('  ✓ 判定走 knowledgeOf；工作台里无第二份名单比较实现');
});

test('v3307 E1. ★★★★ 诊断面（验收③）：报「存在但不可用」，并把「判不了」单独分档', () => {
    const P = judgeDiagLine(EW, EQ);
    assert.deepEqual(P, [], '诊断面：' + P.join(' | '));
    const face = EW.buildWorkbench(mkHost(), { apis: APIS, now: () => 1000 });
    console.log('  ✓ 工作台诊断行：' + EW.line(face));
    console.log('  ✓ 查询面诊断行：' + EQ.line(EQ.query(mkHost(), { ledgers: ['secret'] },
        { apis: APIS, ledgers: EW.LEDGERS })));
});

test('v3307 F1. ★★★★★ 导出面（验收④）：报告只带存在性与知识范围，正文一律不外带', () => {
    const P = judgeReport(IDX_SRC);
    assert.deepEqual(P, [], '导出面：' + P.join(' | '));
    const r = runSecretSlice(IDX_SRC);
    assert.ok(r.text.indexOf('共 2 条') >= 0, '报告须给出存在性条数，实：' + r.text.slice(0, 160));
    assert.ok(r.text.indexOf(SECRET_BODY_A) < 0 && r.text.indexOf(SECRET_BODY_B) < 0, '正文不得出现在报告里');
    console.log('  ✓ 报告秘密段真跑：' + r.text.split('\n').filter(Boolean).join(' ⎮ ').slice(0, 240));
});

/* ══════════ G. 负控制 ×4（真源码破坏 → 破坏副本上重跑同一套判据） ══════════ */
test('v3307 G1. ★★★★★ 破坏①②：把正文放回 title / 把知识范围塌成一态 ⇒ 同一套判据必须转红', () => {
    /* ① 正文放回 title */
    const broken1 = breakOnce(EW_SRC, ANCHORS.ewTitle, '                    title: text(it.secret, MAX_TEXT),', 'G1 把正文放回 title');
    let P1;
    try { P1 = judgeWorkbench(loadFrom(broken1), APIS); }
    catch (e) { assert.fail('判据在破坏副本上抛错（抛错≠翻红）：' + e.message); }
    assert.ok(P1.some((x) => x.indexOf('B1') === 0), '★ 正文回到投影行后 B1 必须点名，实：' + JSON.stringify(P1));
    /* ② 知识范围塌成一态 */
    const broken2 = breakOnce(EW_SRC, ANCHORS.ewScope, '                    scope: null, masked: true,', 'G1 把 scope 塌成一态');
    let P2;
    try { P2 = judgeWorkbench(loadFrom(broken2), APIS); }
    catch (e) { assert.fail('判据在破坏副本上抛错（抛错≠翻红）：' + e.message); }
    assert.ok(P2.length > 0, '★ scope 塌成一态后必须有判据转红（三态不同形是本刀的核心），实：' + JSON.stringify(P2));
    /* 破坏副本必须与真源不同（防「破坏了但没用上」的假绿） */
    assert.notEqual(broken1, EW_SRC); assert.notEqual(broken2, EW_SRC);
    console.log('  ✓ ①②两条破坏各让判据转红（且不是抛错）');
});

test('v3307 G2. ★★★★★ 破坏③：查询面正文列写回 ⇒ row.text 判据必须转红（第二列泄漏）', () => {
    const broken = breakOnce(EQ_SRC, ANCHORS.eqTextFields, "            textFields: ['secret'],", 'G2 写回正文列');
    let P;
    try { P = judgeQuery(loadFrom(broken), APIS); }
    catch (e) { assert.fail('判据在破坏副本上抛错（抛错≠翻红）：' + e.message); }
    assert.ok(P.some((x) => x.indexOf('C1') === 0), '★ 正文列写回后 C1 必须点名，实：' + JSON.stringify(P));
    assert.notEqual(broken, EQ_SRC, '破坏必须真的改变源码');
    console.log('  ✓ ③第二列泄漏被抓（只收 title 一处是不够的）');
});

test('v3307 G3. ★★★★★ 破坏④：报告段把正文写进去 ⇒ 导出面判据必须转红（验收④不可豁免）', () => {
    const broken = breakOnce(IDX_SRC, ANCHORS.idxReportHead,
        ANCHORS.idxReportHead + " push(_open[0].secret);", 'G3 把正文写进报告');
    let P;
    try { P = judgeReport(broken); }
    catch (e) { assert.fail('判据在破坏副本上抛错（抛错≠翻红）：' + e.message); }
    assert.ok(P.some((x) => x.indexOf('F') === 0), '★ 正文进报告后 F 必须点名，实：' + JSON.stringify(P));
    assert.notEqual(broken, IDX_SRC, '破坏必须真的改变源码');
    console.log('  ✓ ④导出面泄漏被抓');
});

test('v3307 G4. ★★★★ 破坏⑤：把导出段整段删掉 ⇒ 判据必须 fail-closed（不得静默跳过）', () => {
    const seg = secretSliceOf(IDX_SRC);
    assert.ok(seg, '前置：真源上必须切得到该段');
    const broken = IDX_SRC.split(seg).join('');
    assert.notEqual(broken, IDX_SRC, '破坏必须真的改变源码');
    const P = judgeReport(broken);
    assert.deepEqual(P, ['F 从 index.js 切不到秘密导出段（段被删/标记被改）—— 判据 fail-closed'],
        '★ 段不在场时必须明确失败，而不是「没有正文 ⇒ 通过」');
    console.log('  ✓ ⑤结构漂移 fail-closed（删段不等于通过）');
});

/* ══════════ H. 锚点两向自证（工具自证：锚点必须恰中 1 次，打偏必抛） ══════════ */
test('v3307 H1. ★★★★★ 锚点两向自证：源侧恰中 1 次；不存在 / 不唯一 / 同值替换必须抛', () => {
    /* 源侧：每个锚点在它所属的真源里必须恰中 1 次 */
    for (const [k, a] of Object.entries(ANCHORS)) {
        const file = (k === 'eqTextFields') ? EQ_SRC : (k === 'idxReportHead' ? IDX_SRC : EW_SRC);
        assert.equal(file.split(a).length - 1, 1, '锚点 ' + k + ' 在其真源里必须恰中 1 次（漂移即本档静默失效）');
    }
    /* 判据层纯度：锚点字面量在本档源码里只准出现一次（即 ANCHORS 那一处声明） */
    const SELF = read(path.join('tests', 'v3307_secret_scope_surface.test.mjs'));
    for (const [k, a] of Object.entries(ANCHORS)) {
        assert.equal(SELF.split(a).length - 1, 1, '锚点字面量 ' + k + ' 在本档里必须恰出现 1 次（判据不得复述锚点串）');
    }
    /* 打偏必抛：不存在的锚点 */
    assert.throws(() => breakOnce(EW_SRC, '这段源码根本不存在', 'x', '不存在锚点'), /恰中 1 次/,
        '★ 锚点不存在必须抛，不得静默跳过');
    /* 打偏必抛：不唯一的锚点（运行时从真源里找一个真出现 >=2 次的候选，不写死） */
    const dup = ['return null;', 'return 0;', 'return;', 'const '].find((c) => EW_SRC.split(c).length - 1 >= 2);
    assert.ok(dup, '★ 必须能在真源里找到出现 >=2 次的候选（否则本项无从验证）');
    assert.throws(() => breakOnce(EW_SRC, dup, '#X#', '不唯一锚点'), /恰中 1 次/, '★ 不唯一锚点必须抛');
    /* 打偏必抛：同值替换（改写等于没改） */
    assert.throws(() => breakOnce(EW_SRC, ANCHORS.ewTitle, ANCHORS.ewTitle, '同值替换'), /必须真的改变源码/,
        '★ 同值替换必须抛（否则「破坏了但没用上」会被读成判据对破坏无反应）');
    console.log('  ✓ 锚点 ' + ANCHOR_VALUES.length + ' 处各恰中 1 次；纯度、不存在、不唯一、同值四向自证通过');
});

/* ══════════ I. 版本锚（供版本守卫 V4 计数：本档恰锚当版） ══════════ */
/* vnum 序数：V4 的计数口径就是它（写法与 v3306 G1 同形 —— 锚必须可被守卫数到）。 */
function vnum(s) {
    const m = /^(\d+)[.](\d+)[.](\d+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}
test('v3307 I1. ★ 本档恰锚当版 v3.307.0（供 scan_version_guard V4 计数）', () => {
    /* 本档自锚常量形：`vnum(BORN)` 既被 V4 认作锚，跨版之后也不会变成「锁旧版」的死数
     *   （V2 的 vnum 锁判据只对「等于当版号」的自锚常量生效）。 */
    const BORN = '3.307.0';
    assert.equal(vnum(BORN), 3307000, 'vnum 序数必须可数（当版锚点）');
    const idx = read('index.js');
    const m = /const VERSION = '([^']+)'/.exec(idx);
    assert.ok(m, 'index.js 必须有 VERSION 真源');
    /* [v3.308.0 抬版交棒] 原文是 `assert.equal(m[1], BORN)` ——【硬锁当版】。
     *   本档出生于 v3.307.0，抬版后 index.js 即不再是它锚的那一版 ⇒ 硬等号必然自伤
     *   （本仓「抬版仪式」反模式：要求每版回头改写历史档）。
     *   交棒**不弱化**：锚形仍是当版档案里的自锚常量（V4 照旧计数），
     *   本行只把「恰好等于」改成「不低于」—— 版本不得回退这条判据一字不丢。 */
    assert.ok(vnum(m[1]) >= vnum(BORN), '版本不得回退到本档出生版本之前，实 ' + m[1]);
    assert.ok(vnum(m[1]) >= vnum(BORN), '本档只在 ' + BORN + ' 及以后成立，实 ' + m[1]);
    console.log('  ✓ 本档锚 v' + m[1]);
});
