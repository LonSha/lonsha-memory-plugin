// tests/v3281_o7_module_copy_ledger.test.mjs — v3.281.0 O7 第四项（续）：模块↔模块副本面
// 主题：**模块之间**的逐字重复实现 —— 本仓既有的副本判据 100% 只覆盖「宿主 ↔ 模块」，
//   模块 ↔ 模块这一整面**从未被枚举过**。
//
//   【为什么本档存在（真缺口，逐条有读数）】
//     v3.280.0 的逐字副本台账（tests/v3280）查的是「宿主 index.js 内联实现 ↔ 根级模块同名实现」。
//     把同一套归一化口径（剥注释 + 折叠空白，真源 tests/_audit_lib.mjs）掉转**横向**用在模块之间，
//     实测 **15 个簇 / 60 对**逐字副本，清一色两个族：
//
//       族 A「账本状态形状」
//         reject     六账版 6 模块 / 三账版 3 模块
//         result     六账版 6 模块 / 三账版 3 模块
//         record     4 模块      clone   3 模块
//         openCount  2 模块
//         remove     2 模块
//       族 B「哈希与文本原语」
//         hash32 3 模块（FNV-1a 32 位，模块注释自称「与 index.js hash32 逐字同构」）
//         fnv1a 3 模块 · textOf 3 模块 · stableStringify 2 模块
//         toSet 2 模块 · fpOf 2 模块 · normTime 2 模块
//
//     **这个面没有任何判据**：全仓扫一遍 tests/audit，唯一具备「反重复」语义的是
//     scan_ledger_contract.mjs 的 R3，而它只钉三个字面量（`revision: finite(`、
//     `.revision += 1`、本地 `function text(`）—— 上面 15 个簇一个都不在它的射程里。
//     于是这 60 对里任何一对漂移，本仓没有任何东西会响（与 v3.279.0「形态面漏一类」
//     同族：判据的面漏一类，结论就完全反了）。
//
//   【与 v3280 的关系（不是重复建设，是补另一面）】
//     v3280 判「宿主 ↔ 模块」；本档判「模块 ↔ 模块」。两档共享同一套归一化口径
//     （都从 tests/_audit_lib.mjs 进口 stripComments），但枚举面与登记表各自独立 ——
//     一条登记在 v3280（如 hash32@branch-guard.js）与一条登记在本档（hash32 的模块簇）
//     说的是两件不同的事：前者「宿主一份、该模块一份」，后者「模块彼此各有一份」。
//
//   【判据（fail-closed，簇级双向）】
//     A  枚举面：模块面确实被横向比较（模块数下限 + 簇数下限），登记表与枚举簇**双向一致**
//     B  读盘实测：15 簇逐字相同；任一簇的成员集合变了即「漂移/消失」（红，且点名差异成员）
//     C  真源码破坏（三向）：改成员 A 的体 ⇒ 该簇成员缩水；改另一族的成员 ⇒ 同样；凭空抄一份 ⇒ 新增未登记簇
//     D  工具两向自证：breakSource 的 0 次 / 不唯一 / 同值必抛；原版判据真、破坏副本真红
//     E  判据纯度 H5：三个破坏锚点字面量在本档各只声明一次，且真源上各恰中一次
//     F  自防护 + 三源同源 + 当版锚点
//
//   【边界（诚实）】
//     ① 本档只保证「登记在案的模块↔模块副本仍在、且新出现的必须登记」。它**不**判定
//        某一族应当收拢到哪 —— 族 A 有现成载体（ledger-entity.js 契约，其文件头已记
//        「原为六本账各自抄一份，逐字相同」并把 finite/text/names/revision/recordEvent/
//        copyHistory 六项收了上去），族 B 则没有任何现成载体（`hash32` 甚至被门禁
//        scan_witness_provenance 之类按**字面量逐字**要求，见下）；收拢与否取决于那些契约，
//        不是文本比对能得出的结论。
//     ② 同名不同体**必须分开成簇**：`reject`/`result` 各有两种形状（六账版带 `changed:false`、
//        三账版不带），合并成一簇会把「两种语义」的差异抹掉 —— 这正是 v3.243.0
//        「同形而不同义，比不同形更危险」那条留痕的同一个坑。
//     ③ 本档只覆盖 `function` 声明形态（与 v3280 同界）。类方法与常量表在 v3280 的
//        侦察里实测无模块级逐字副本，但**没有**常驻判据守着，故那里仍是已知的观测缺口。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { breakSource, assertSingleHit } from './_break_kit.mjs';
import { stripComments } from './_audit_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ok = (m) => console.log('  ✓ ' + m);
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex').slice(0, 8);

/** 副本体长度下限：低于此长度不构成「实现副本」（1 行的转发包装不该被本档收进来）。 */
const MIN_BODY = 60;
/** 模块面下限（实 79）：低于此说明模块枚举失效，「0 簇」变成空对空。 */
const MIN_MODULES = 60;
/** 簇数下限（实 15）：登记表被清空或枚举面塌陷时立刻红。 */
const MIN_CLUSTERS = 12;

/**
 * 登记表（唯一真源）。每条：[函数名, [成员模块], 体 md5(8), 这一簇为什么存在 / 为什么留多份]。
 * **成员集合与体 md5 都与磁盘实测同源**：新增/删除任一条、或任一成员的体漂移，
 * 本档 A/B 段会当场翻红（簇级双向判据）。
 */
const LEDGER = [
    ['reject', ['commitment-ledger.js', 'echo-ledger.js', 'parallel-ledger.js', 'recall-echo.js', 'secret-ledger.js', 'seed-ledger.js'], '8eb6fe95',
        '六账拒绝形状 {ok:false, reason, changed:false, state:normalize(state)}；契约 ledger-entity.js 的六项里没有它'],
    ['result', ['commitment-ledger.js', 'echo-ledger.js', 'parallel-ledger.js', 'recall-echo.js', 'secret-ledger.js', 'seed-ledger.js'], 'c1b0fedc',
        '六账成功形状 Object.assign({ok:true, state:normalize(state)}, extra)；同上，契约未收'],
    ['record', ['commitment-ledger.js', 'parallel-ledger.js', 'secret-ledger.js', 'seed-ledger.js'], 'b3290291',
        '一行转发 LE.recordEvent(item, event, {maxHistory: MAX_HISTORY, stampFloor: true})；四账的 maxHistory/stampFloor 恰好同值'],
    ['clone', ['parallel-ledger.js', 'secret-ledger.js', 'seed-ledger.js'], 'd5d00b8d',
        '三账状态克隆 {version:1, seq:finite(...)||0, items:...map(copyItem)}；已走契约的 finite/copyItem，但形状各账自带'],
    ['reject', ['event-completeness.js', 'fact-version.js', 'repair-loop.js'], '42ee6084',
        '三账拒绝形状（多一个 changed:false、键序不同）—— **与六账版是两种语义，不得合并成簇**'],
    ['result', ['event-completeness.js', 'fact-version.js', 'repair-loop.js'], '297d1a0d',
        '三账成功形状 Object.assign({ok:true, changed:false, state:normalize(state)}, extra||{})'],
    ['hash32', ['branch-guard.js', 'floor-ledger.js', 'summary-provenance.js'], '6b78dbb6',
        'FNV-1a 32 位双 hash；模块注释自称「与 index.js hash32 逐字同构……两端口径必须一致」，是**刻意声明**的副本'],
    ['fnv1a', ['model-response.js', 'stale-guard.js', 'turn-reconciler.js'], '3b85b86c',
        'FNV-1a（另一套：Math.imul 演进式常数），三个 SSE/陈旧守卫模块各一份'],
    ['textOf', ['branch-guard.js', 'floor-ledger.js', 'summary-provenance.js'], 'ca3a5c55',
        '取该楼当前显示页正文（swipe_id 决定页）；注释自称「与 index.js msgTextOf 同口径」'],
    ['stableStringify', ['stale-guard.js', 'turn-reconciler.js'], '91fe5f73',
        '稳定序列化（bigint / 键排序），两个守卫模块各一份'],
    ['toSet', ['dependency-closure.js', 'stale-guard.js'], '80015455',
        '字符串集合构造（trim + 去空），两个模块各一份'],
    ['fpOf', ['floor-ledger.js', 'summary-provenance.js'], '603ed1a3',
        '楼层指纹（is_user/swipe_id 派生），两模块各一份'],
    ['normTime', ['recall-artifact.js', 'task-inbox.js'], '3f9d48b6',
        '时间戳归一（有限且非负取整，否则回落），两模块各一份'],
    ['openCount', ['parallel-ledger.js', 'secret-ledger.js'], 'b0721608',
        '未了结计数 state.items.filter((item) => OPEN[item.status]).length；两账共用同一个 OPEN 形状'
        + '（seed-ledger 的计数判据是 item.status === \'open\' || \'advancing\'，故不在此簇）'],
    ['remove', ['parallel-ledger.js', 'secret-ledger.js'], '92e9360b',
        '按 ref 删除一条（normalize → find → splice → record 事件），两账各一份'],
];

/* ---- 破坏锚点（逐条取自真源，禁改；本档须逐字持有） ---- */
const A_C1 = '  function openCount(state) {\n    return state.items.filter((item) => OPEN[item.status]).length;';
const A_C2 = "    let h = 0x811c9dc5;\n    const s = String(str || '');";
const A_B2 = 'return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;';
const A_SELF_LEN = 'assert.ok(selfLen > 6000';
const A_SELF_LEDGER = 'const LEDGER = [';
const A_LIB_IMPORT = "from './_audit_lib.mjs'";

/* 模块面（与 scan_wiring 的根级模块口径同形：根目录 .js，排除 .bak 与宿主 index.js） */
const MODULES = fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.bak') && f !== 'index.js')
    .sort();

/* ══════════════ 判据体（纯函数：吃模块源码表，返回问题列表） ══════════════ */

/** 归一化：剥注释（唯一真源）→ 折叠空白 → trim。两侧同款，比较才有意义。 */
function norm(body) {
    return stripComments(String(body)).replace(/\s+/g, ' ').trim();
}

/**
 * 从 `{` 起用**跳过引号与注释**的配平取块。
 * 为什么不能裸数花括号：函数体里的正则字面量/模板串都可能含 `{`（如 `/\\s{2,}/`），
 * 裸计数会提前收口 —— 那样两侧即使真漂移也可能「同样地被截断」而看起来相等。
 */
function blockFrom(src, startBrace) {
    let depth = 0, i = startBrace;
    const n = src.length;
    let quote = null;
    while (i < n) {
        const c = src[i];
        if (quote) {
            if (c === '\\') { i += 2; continue; }
            if (c === quote) quote = null;
            i++; continue;
        }
        if (c === '"' || c === "'" || c === '`') { quote = c; i++; continue; }
        if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e + 1; continue; }
        if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i); i = e < 0 ? n : e + 2; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return src.slice(startBrace + 1, i); }
        i++;
    }
    return null;
}

/** 跳过参数表（配平到配对的 `)`），返回紧跟其后的 `{` 下标；取不到返回 -1。 */
function braceAfterParams(src, openParen) {
    let depth = 0, i = openParen;
    const n = src.length;
    let quote = null;
    while (i < n) {
        const c = src[i];
        if (quote) {
            if (c === '\\') { i += 2; continue; }
            if (c === quote) quote = null;
            i++; continue;
        }
        if (c === '"' || c === "'" || c === '`') { quote = c; i++; continue; }
        if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e + 1; continue; }
        if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i); i = e < 0 ? n : e + 2; continue; }
        if (c === '(') depth++;
        else if (c === ')') { depth--; if (depth === 0) break; }
        i++;
    }
    let k = i + 1;
    while (k < n && /\s/.test(src[k])) k++;
    return src[k] === '{' ? k : -1;
}

/** 枚举某源码里所有 function 声明 → { 名字: [归一化体, ...] }（取不到配平块的跳过）。 */
function funcs(src) {
    const out = new Map();
    const RE = /(?:^|\n)[ \t]*(?:async[ \t]+)?function[ \t]+([A-Za-z_$][A-Za-z0-9_$]*)[ \t]*\(/g;
    let m;
    while ((m = RE.exec(src)) !== null) {
        const openParen = m.index + m[0].length - 1;
        const brace = braceAfterParams(src, openParen);
        if (brace < 0) continue;
        const body = blockFrom(src, brace);
        if (body === null) continue;
        const nm = m[1];
        if (!out.has(nm)) out.set(nm, []);
        out.get(nm).push(norm(body));
    }
    return out;
}

/**
 * 横向聚类：模块 ↔ 模块的逐字副本。
 * @returns {Map<string, Map<string, Array<string>>>} 名字 → 体 md5 → 成员模块（已排序、去重）
 */
function buildClusters(modSrc) {
    const per = new Map();      // 名字 -> 体 -> 成员集
    for (const [f, src] of Object.entries(modSrc)) {
        for (const [nm, bodies] of funcs(src)) {
            if (!per.has(nm)) per.set(nm, new Map());
            const byBody = per.get(nm);
            for (const b of bodies) {
                if (b.length < MIN_BODY) continue;
                if (!byBody.has(b)) byBody.set(b, new Set());
                byBody.get(b).add(f);
            }
        }
    }
    const out = new Map();      // 名字 -> md5 -> 成员
    for (const [nm, byBody] of per) {
        for (const [b, mods] of byBody) {
            if (mods.size < 2) continue;
            if (!out.has(nm)) out.set(nm, new Map());
            out.get(nm).set(md5(b), [...mods].sort());
        }
    }
    return out;
}

/** 把簇集合压成可比对的登记形态：['名字#md5', 成员数组]。 */
function clusterList(cl) {
    const rows = [];
    for (const [nm, byHash] of cl) {
        for (const [h, mods] of byHash) rows.push([nm + '#' + h, mods.slice()]);
    }
    return rows;
}

/**
 * 真判据体：给定「模块源码表」，返回问题列表；空数组 = 卫生。
 * 双向：磁盘上有的簇必须在登记表里；登记表里的簇必须在磁盘上（且成员集合一致）。
 * @param {Object<string,string>} modSrc { 模块文件名: 源码 }
 * @param {Array} ledger 登记表（[name, mods, hash, why]）
 */
function judge(modSrc, ledger) {
    const P = [];
    const mods = Object.keys(modSrc);
    /* A. 枚举面：模块面必须真的被横向比较（否则「0 簇」是空对空） */
    if (mods.length < MIN_MODULES) P.push('A 枚举面失效：模块面只有 ' + mods.length + ' 个文件（下限 ' + MIN_MODULES + '）');
    const cl = buildClusters(modSrc);
    const rows = clusterList(cl);
    if (rows.length < MIN_CLUSTERS) P.push('A 枚举面失效：只枚举出 ' + rows.length + ' 个模块↔模块副本簇（下限 ' + MIN_CLUSTERS + '）');

    const disk = new Map(rows.map(([k, m]) => [k, m.join(',')]));
    const decl = new Map(ledger.map(([nm, m, h]) => [nm + '#' + h, m.slice().sort().join(',')]));

    for (const [k, mem] of disk) {
        if (!decl.has(k)) P.push('B1 新增未登记的模块↔模块逐字副本：' + k + '（成员 ' + mem + '）');
    }
    for (const [k, mem] of decl) {
        if (!disk.has(k)) P.push('B2 登记在案的副本已不再逐字相同（漂移）或已消失：' + k + '（登记成员 [' + mem + ']）');
        else if (disk.get(k) !== mem) P.push('B2 ' + k + ' 成员集合变了：登记 [' + mem + '] / 实测 [' + disk.get(k) + ']');
    }
    /* B3 归因：同名但簇集合对不上的，说出差在哪（不是「有一簇不一样」） */
    const diskNames = new Set(rows.map(([k]) => k.split('#')[0]));
    const declNames = new Set(ledger.map(([nm]) => nm));
    for (const nm of declNames) {
        if (!diskNames.has(nm)) P.push('B3 登记的名字在盘上已枚举不出任何簇：' + nm + '（体已改掉或函数被删）');
    }
    return P;
}

/** 读全量模块面（判据用；只读本档关心的那些会漏掉新增副本）。 */
function readAllModules() {
    const out = {};
    for (const f of MODULES) {
        try { out[f] = read(f); } catch (_e) { /* 读不到即缺席，由判据按成员集合判 */ }
    }
    return out;
}

/** 自防护锚点用的「本档源码」读取（路径只此一处）。 */
const SELF_REL = path.join('tests', 'v3281_o7_module_copy_ledger.test.mjs');

/* ══════════════ A. 结构面 ══════════════ */
test('v3281 A1. ★★ 枚举面与登记表都在场（枚举失效时「0 漂移」是空对空）', () => {
    assert.ok(MODULES.length >= MIN_MODULES, '模块面须 >= ' + MIN_MODULES + ' 个文件（实 ' + MODULES.length + '）');
    const total = MODULES.reduce((a, f) => a + funcs(read(f)).size, 0);
    assert.ok(total >= 400, '模块面 function 枚举须非空（全体实 ' + total + '，下限 400）');
    assert.ok(LEDGER.length >= MIN_CLUSTERS, '登记表不得被清空（实 ' + LEDGER.length + ' 簇）');
    const seen = new Set();
    for (const [nm, m, h, why] of LEDGER) {
        assert.ok(typeof nm === 'string' && nm.length > 0, '登记项须有函数名');
        assert.ok(Array.isArray(m) && m.length >= 2, '登记项须 >= 2 个成员模块：' + nm);
        for (const f of m) assert.ok(MODULES.includes(f), '登记成员须是真模块：' + f + '（在 ' + nm + ' 里）');
        assert.ok(/^[0-9a-f]{8}$/.test(h), '登记项须带体 md5(8)：' + nm);
        assert.ok(typeof why === 'string' && why.length >= 10, '登记项须写清「这一簇是什么 / 为什么留多份」：' + nm);
        assert.ok(!seen.has(nm + '#' + h), '同一簇不得重复登记：' + nm);
        seen.add(nm + '#' + h);
    }
    ok('模块面 ' + MODULES.length + ' 个文件；登记表 ' + LEDGER.length + ' 簇，成员与体 md5 格式全过');
});

/* ══════════════ B. 读盘实测 ══════════════ */
test('v3281 B1. ★★★ 15 簇逐字副本与登记表双向一致（少一个成员即漂移）', () => {
    const problems = judge(readAllModules(), LEDGER);
    assert.deepEqual(problems, [], '盘上真源必须卫生：' + problems.join(' | '));
    ok('簇级双向一致；无新增未登记簇，无成员漂移');
});

test('v3281 B2. ★★ 漂移可归因（成员缩水会点名，不是「有一簇不一样」）', () => {
    const mods = readAllModules();
    const broken = Object.assign({}, mods);
    /* 在 task-inbox.js 的 normTime 里改一个字符 —— 该模块必须从这一簇的成员里掉出去 */
    broken['task-inbox.js'] = breakSource(mods['task-inbox.js'], A_B2,
        'return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallbackX;', 'v3281_b2');
    const problems = judge(broken, LEDGER);
    assert.ok(problems.some((p) => p.includes('normTime')), '必须点名 normTime：' + problems.join(' | '));
    assert.ok(problems.some((p) => p.includes('task-inbox.js')), '归因必须点名掉出去的成员：' + problems.join(' | '));
    ok('改 task-inbox.js 的 normTime 一个字符 ⇒ judge 点名该簇成员集合变化');
});

/* ══════════════ C. 真源码破坏（三向） ══════════════ */
test('v3281 C1. ★★ 改族 A 成员（parallel-ledger.js 的 openCount）⇒ 同一条 judge 翻红', () => {
    /* 替换文本刻意**不包含** A_C1 作为前缀：A_C1 无右边界，若写成 `A_C1 + 后缀`，
     *   `!includes(A_C1)` 恒假（原串仍在新串里），可观察性断言会自相矛盾。 */
    const broken = breakSource(read('parallel-ledger.js'), A_C1,
        '  function openCount(state) {\n    return state.items.filter((item) => OPEN[item.statX]).length;', 'v3281_c1');
    assert.ok(broken.includes('OPEN[item.statX]'), '破坏必须可观察（替换文本进场）');
    assert.equal(broken.includes(A_C1), false, '破坏必须可观察（原锚点退出）');
    const mods = readAllModules();
    mods['parallel-ledger.js'] = broken;
    const problems = judge(mods, LEDGER);
    assert.ok(problems.some((p) => p.includes('openCount')), '必须点名 openCount：' + problems.join(' | '));
    ok('改 parallel-ledger.js 的 openCount ⇒ judge 翻红（该簇成员缩水）');
});

test('v3281 C2. ★★ 改族 B 成员（floor-ledger.js 的 hash32）⇒ 同一条 judge 翻红', () => {
    const broken = breakSource(read('floor-ledger.js'), A_C2,
        "    let h = 0x811c9dc5;\n    const s = String(str || 'x');", 'v3281_c2');
    assert.ok(broken.includes("String(str || 'x')"), '破坏必须可观察（替换文本进场）');
    assert.equal(broken.includes(A_C2), false, '破坏必须可观察（原锚点退出）');
    const mods = readAllModules();
    mods['floor-ledger.js'] = broken;
    const problems = judge(mods, LEDGER);
    assert.ok(problems.some((p) => p.includes('hash32')), '必须点名 hash32：' + problems.join(' | '));
    ok('改 floor-ledger.js 的 hash32 ⇒ judge 翻红（该簇成员缩水）');
});

test('v3281 C3. ★★ 凭空抄一份到本无该函数的模块 ⇒ judge 点名「新增未登记」', () => {
    const mods = readAllModules();
    const broken = Object.assign({}, mods);
    /* 要触发 **B1「新增未登记」**（而不是 B2「成员集合变了」），注入的 (名字, 体) 组合
     *   必须是登记表里**没有**的 —— 把同一个新函数抄进两个本来都没有它的模块即成立。
     *   （若只往已有簇里加一个成员，judge 会走 B2「成员集合变了」那条路：那也是红，
     *   但那测的是「成员漂移」，不是本段要测的「凭空多出一簇」。） */
    const INJ = '\nfunction probeTwinFn(state) { return state.items.filter((it) => it && typeof it.id === "string").slice(0, 8).length + 100; }\n';
    for (const t of ['age-anchor.js', 'crosslink.js']) {
        assert.ok(!funcs(mods[t]).has('probeTwinFn'), t + ' 原本不得有 probeTwinFn（否则不是「新增」）');
        broken[t] = mods[t] + INJ;
    }
    const problems = judge(broken, LEDGER);
    assert.ok(problems.some((p) => p.includes('新增未登记的模块↔模块逐字副本')),
        '必须点名新增未登记：' + problems.join(' | '));
    assert.ok(problems.some((p) => p.includes('probeTwinFn')), '必须点名新增的函数名：' + problems.join(' | '));
    assert.ok(problems.some((p) => p.includes('age-anchor.js') && p.includes('crosslink.js')),
        '必须点名两个注入的模块：' + problems.join(' | '));
    ok('凭空抄一份 probeTwinFn 进 age-anchor.js + crosslink.js ⇒ judge 点名「新增未登记」');
});

/* ══════════════ D. 工具两向自证 ══════════════ */
test('v3281 D1. ★★★ 工具两向自证：锚点 0 次/不唯一/同值替换必抛；原版判据真、破坏副本真红', () => {
    const src = read('parallel-ledger.js');
    assert.throws(() => assertSingleHit(src, 'const 绝不存在的锚点 = 1;', 'v3281_n0'), /锚点/, '锚点不存在必须抛');
    assert.throws(() => assertSingleHit(src, 'function ', 'v3281_nmany'), /锚点/, '锚点不唯一必须抛');
    assert.throws(() => breakSource(src, A_C1, A_C1, 'v3281_same'), /改变|替换/, '同值替换必须抛');
    const broken = breakSource(src, A_C1,
        '  function openCount(state) {\n    return state.items.filter((item) => OPEN[item.statZ]).length;', 'v3281_db');
    assert.notEqual(src, broken, '破坏须真的改变源码');
    assert.deepEqual(judge(readAllModules(), LEDGER), [], '原版上同判据必须真成立');
    const mods = readAllModules();
    mods['parallel-ledger.js'] = broken;
    assert.notDeepEqual(judge(mods, LEDGER), [], '破坏副本上同判据必须真翻红');
    ok('两向自证通过；原版判据真、破坏副本真红');
});

/* ══════════════ E. 判据纯度（H5） ══════════════ */
test('v3281 E1. ★★ 判据纯度：破坏锚点字面量在本档各只声明一次，且真源上各恰中一次', () => {
    const self = read(SELF_REL);
    /* 计数必须用**转义形态**：多行锚点在本档源码里是 `\n` 两字符（不是真换行），
     *   直接用真换行去 split 会得 0 —— 那样「各只声明一次」就变成**空转**（恒 0 恒绿）。
     *   先断言「真换行形态与转义形态不同」，就是为了钉住「本档确有多行锚点」这件事：
     *   将来锚点若被改成单行，这条断言会先红，提醒计数口径要重判。 */
    const esc = (a) => a.replace(/\n/g, '\\n');
    assert.notEqual(esc(A_C1), A_C1, 'C1 须是多行锚点（计数口径依赖此事实）');
    assert.notEqual(esc(A_C2), A_C2, 'C2 须是多行锚点（计数口径依赖此事实）');
    for (const [label, a] of [['C1', A_C1], ['C2', A_C2], ['B2', A_B2]]) {
        const n = self.split(esc(a)).length - 1;
        assert.equal(n, 1, label + ' 锚点字面量在本档须恰好出现 1 次（实 ' + n + '）');
    }
    /* 另外钉住「坐标在各被破坏文件里唯一」——E1 与 C1/C2/D1 用的是同一个常量，
     *   所以下面这四条同时是那三段的定点证明。 */
    assertSingleHit(read('parallel-ledger.js'), A_C1, 'v3281_h1');
    assertSingleHit(read('summary-provenance.js'), A_C2, 'v3281_h2');
    assertSingleHit(read('floor-ledger.js'), A_C2, 'v3281_h3');
    assertSingleHit(read('task-inbox.js'), A_B2, 'v3281_h4');
    ok('3 个破坏锚点字面量各只声明一次；4 个坐标在真源上各恰中一次');
});

/* ══════════════ F. 自防护 + 三源 + 当版锚点 ══════════════ */
test('v3281 F1. ★ 自防护：登记表与判据自身不得被摘掉；O7 既有真源特征仍在场', () => {
    assert.ok(read('index.js').includes('const VERSION = '), 'index.js 版本常量在场');
    assert.ok(read('index.js').includes('rebindModuleDeps'), 'O7 第一批真源特征仍在场');
    assert.ok(read('ledger-entity.js').includes('账本实体契约'), '族 A 的现成载体（契约模块）仍在场');
    const self = read(SELF_REL);
    const selfLen = self.length;
    assert.ok(selfLen > 6000, '本档自身不得被清空（实 ' + selfLen + ' 字符）');
    assert.ok(self.includes(A_SELF_LEDGER), '本档须逐字持有登记表锚点');
    assert.ok(self.includes(A_SELF_LEN), '本档须持有自防护锚点');
    assert.ok(self.includes(A_LIB_IMPORT), '剥注释须从唯一真源进口（不得本地重写助手）');
    ok('真源特征 / 契约模块 / 登记表 / 本档自身均在位（' + selfLen + ' 字符）');
});

test('v3281 F2. ★ 三源同源，且本档恰锚当版（供版本守卫 V4 计数）', () => {
    const pkg = JSON.parse(read('package.json')).version;
    const man = JSON.parse(read('manifest.json')).version;
    const SQ = String.fromCharCode(39);
    const vnum = (s) => String(s).split('.').map((x) => Number(x)).join('.');
    assert.equal(pkg, man, 'package.json 与 manifest.json 版本一致');
    assert.ok(read('index.js').includes('const VERSION = ' + SQ + pkg + SQ + ';'), 'index.js 版本常量与 package.json 一致');
    /* [v3.282.0 交棒] 本档写于 3.281.0；转下限锚：后续版本须 >= 它，不得把历史档锁成恰好等于当版。 */
    assert.ok(vnum(pkg) >= vnum('3.281.0'), '本档版本下界 3.281.0 不得被绕过（实 ' + pkg + '）');
    ok('三源同源；本档锚 v3.281.0');
});
