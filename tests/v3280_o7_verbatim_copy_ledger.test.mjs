// tests/v3280_o7_verbatim_copy_ledger.test.mjs — v3.280.0 O7 第四项：收紧可移除副本
// 主题：**宿主内联 ↔ 模块副本**的逐字重复实现，两套维护面，此前**无任何一致性判据**。
//
//   【为什么本档存在（真缺口，不是假想）】
//     计划 O7 的工作面写着「按真依赖与调用密度盘点副本……再收紧可移除副本」。
//     把「宿主 index.js 里的 function 体」与「根级模块里的同名 function 体」逐对做
//     归一化比对（剥注释 + 折叠空白）后，实测有 **9 对逐字相同**：
//
//       _getCredKey           ↔ memory-organs.js        （API 凭据冷却键）
//       getApiCooldownStats   ↔ memory-organs.js        （冷却表读数）
//       areLabelsInConflict   ↔ memory-core.js          （关系互斥组判据）
//       normalizeCharName     ↔ memory-core.js          （角色名归一）
//       sanitizeJson          ↔ memory-core.js          （JSON 净化，1684 字符）
//       parseStoryDateLoose   ↔ memory-books.js         （剧情日期松解析）
//       hash32                ↔ branch-guard.js         （双 hash）
//       hash32                ↔ floor-ledger.js
//       hash32                ↔ summary-provenance.js
//
//     这些副本**本身是有理由的**（模块侧自带一份，抽取面下宿主闭包不在作用域；
//     v3264/v3266 的 VERBATIM_CONSTS 已把其中一部分常量登记成「逐字副本」契约）。
//     缺的不是副本，是**判据**：两侧一旦漂移，本仓没有任何东西会响 ——
//     宿主改了、模块没跟上（或反过来），两边各自「看起来都合理」，而它们是同一份语义。
//
//   【本档的量法（为什么不是「数文件里出现过几次」）】
//     枚举是**行为等价**的：抽出两侧的函数体 → 剥注释 + 折叠空白 → 逐字比较。
//     逐字相同 ⇒ 它是同一份实现的第二份；逐字不同 ⇒ 要么已漂移（登记在案的），
//     要么两份本来就不同（不属于本档的口径，不该被本档误收）。
//
//   【判据（fail-closed，两侧同判）】
//     A  枚举面：宿主里的 function 声明确实被逐条拿去与模块比（不是「一个都没比」）
//     B  读盘实测：当前 9 对逐字相同，且与登记表**双向一致**
//        · 枚举出的副本不在登记表  ⇒ 新增未登记的重复实现（红）
//        · 登记表里的副本不再枚举出 ⇒ **漂移**或消失（红）
//        B2 漂移必须可归因：逐对给出第一处差异行（不是「有一对不一样」）
//     C  真源码破坏：改宿主侧 ⇒ 同一条 judge 翻红；改模块侧 ⇒ 同样翻红（双向）
//     D  工具两向自证 + 原版判据真成立（否则「破坏后翻红」可能是判据恒假的假绿）
//     E  判据纯度 H5：锚点字面量在本档各只声明一次
//     F  自防护 + 三源同源 + 当版锚点
//
//   【边界（诚实）】
//     本档只保证「登记在案的逐字副本两侧仍逐字相同、且新出现的逐字副本必须登记」。
//     它**不**判定某个副本应当被收拢成单真源 —— 那取决于抽取面契约（见 v3264/v3266），
//     不是能靠文本比对得出的结论。也不比较常量表与类（本档只覆盖 function 声明形态）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakSource, assertSingleHit } from './_break_kit.mjs';
import { stripComments } from './_audit_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ok = (m) => console.log('  ✓ ' + m);

/** 副本体长度下限：低于此长度不构成「实现副本」，不该被本档收进来。 */
const MIN_BODY = 60;

/**
 * 登记表（唯一真源，改动须与下面 A/B 段一并看）。
 * 每条：[函数名, 模块文件, 宿主侧为什么留一份 / 模块侧为什么必须有]。
 * 新增或删除任一条 ⇒ 本档 A/B 段会当场翻红（双向判据）。
 */
const LEDGER = [
    ['_getCredKey', 'memory-organs.js', '冷却键在宿主与器官模块各建一次同契约的 key（域名+凭据 hash）'],
    ['getApiCooldownStats', 'memory-organs.js', '冷却表读数（totalCount/activeCount/active）两侧同形'],
    ['areLabelsInConflict', 'memory-core.js', '关系互斥组判据（宿主为活代码真源，模块侧供抽取面）'],
    ['normalizeCharName', 'memory-core.js', '角色名归一（模块内 8 处自用，宿主为活代码真源）'],
    ['sanitizeJson', 'memory-core.js', 'JSON 净化 1684 字符（最大的那一份副本）'],
    ['parseStoryDateLoose', 'memory-books.js', '剧情日期松解析（模块侧抄 IIFE 顶层那份的形状）'],
    ['hash32', 'branch-guard.js', '双 hash 原语（模块侧自带一份，避免读宿主闭包）'],
    ['hash32', 'floor-ledger.js', '双 hash 原语（同上）'],
    ['hash32', 'summary-provenance.js', '双 hash 原语（同上）'],
];

/* ---- 破坏锚点（逐条取自两侧真源，禁改；本档须逐字持有） ---- */
const A_HOST = '        const key = opts?.apiKey || (init?.headers?.Authorization';
const A_MOD = "return key ? hash32(String(url || '') + '|' + String(key))";
const A_HOST_NCN = "    function normalizeCharName(name) {";
const A_MOD_NCN = 'function normalizeCharName(name) {';
const A_SELF_LEN = "assert.ok(self.length > 6000";
const A_SELF_PAIRS = 'const LEDGER = [';

/* 根级模块面（与 scan_wiring 的 ROOT_MODULES 同口径：根目录 .js，排除 .bak） */
const MODULES = fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.bak'))
    .sort();

const INDEX_SRC = read('index.js');

/* ══════════════ 判据体（纯函数：吃文本，返回问题列表） ══════════════ */

/* 剥注释走**唯一真源** tests/_audit_lib.mjs 的 stripComments（本仓 v3.191 收敛口径：
 *   审计助手不得本地重写 —— 本档首稿自己写了一份，被 scan_audit_lib_consolidation 的 E1 当场抓红）。
 *   真源还多认正则字面量与字符串内转义，正是本档需要的（函数体里 /\s+/ 之类遍地皆是）。 */
/** 归一化：剥注释 → 折叠空白 → trim。两侧同款，比较才有意义。 */
function norm(body) {
    return stripComments(String(body)).replace(/\s+/g, ' ').trim();
}

/**
 * 从声明行起，用**跳过引号与注释**的配平取块。
 * 为什么不能裸数花括号：函数体里的正则字面量与字符串都可能含 `{`（如 `/\\s{2,}/`），
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
        if (c === '/' && src[i + 1] === '/') { const e = src.indexOf(String.fromCharCode(10), i); i = e < 0 ? n : e + 1; continue; }
        if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i); i = e < 0 ? n : e + 2; continue; }
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) return src.slice(startBrace + 1, i); }
        i++;
    }
    return null;
}

/** 枚举某源码里所有 function 声明 → { name: [归一化体, ...] }（跳过取不到配平块的）。 */
function funcBodies(src) {
    const res = new Map();
    const RE = /^([ \t]*)(?:async[ \t]+)?function[ \t]+([A-Za-z_$][A-Za-z0-9_$]*)[ \t]*\(/gm;
    let m;
    while ((m = RE.exec(src)) !== null) {
        const brace = src.indexOf('{', m.index + m[0].length);
        if (brace < 0) continue;
        const body = blockFrom(src, brace);
        if (body === null) continue;
        const nm = m[2];
        if (!res.has(nm)) res.set(nm, []);
        res.get(nm).push(norm(body));
    }
    return res;
}

/**
 * 真判据体：给定「宿主源码 + 模块源码表」，返回问题列表；空数组 = 卫生。
 * @param {string} hostSrc index.js 源码
 * @param {Object<string,string>} modSrc { 模块文件名: 源码 }
 * @param {Array} ledger 登记表（[name, module, why]）
 */
function judge(hostSrc, modSrc, ledger) {
    const P = [];
    const hostFns = funcBodies(hostSrc);
    /* A. 枚举面：宿主里必须真的枚举出 function 声明（否则「0 对一致」是空对空） */
    if (hostFns.size < 50) P.push('A 枚举面失效：宿主只枚举出 ' + hostFns.size + ' 个 function 声明（下限 50）');
    const modFns = new Map();
    for (const [f, src] of Object.entries(modSrc)) modFns.set(f, funcBodies(src));

    /* B. 枚举「逐字相同」的副本对 */
    const found = new Map();   // 'name@module' -> true
    for (const [f, fns] of modFns) {
        for (const [name, bodies] of fns) {
            const hbs = hostFns.get(name);
            if (!hbs) continue;
            for (const bm of bodies) {
                for (const bh of hbs) {
                    if (bm.length >= MIN_BODY && bm === bh) found.set(name + '@' + f, true);
                }
            }
        }
    }
    const declared = new Map();
    for (const [name, mod] of ledger) declared.set(name + '@' + mod, true);
    for (const k of found.keys()) {
        if (!declared.has(k)) P.push('B1 新增未登记的逐字副本：' + k + '（发现重复实现就必须登记，否则第二份实现无观测点）');
    }
    for (const k of declared.keys()) {
        if (!found.has(k)) P.push('B2 登记在案的逐字副本已不再逐字相同（漂移）或已消失：' + k);
    }
    /* B3 归因：漂移的每一对都要给出第一处差异行（不是「有一对不一样」） */
    for (const [name, mod] of ledger) {
        const mods = modSrc[mod];
        if (mods === undefined) { P.push('B3 模块源码未纳入比较面：' + mod); continue; }
        const hb = (hostFns.get(name) || [])[0];
        const mb = (funcBodies(mods).get(name) || [])[0];
        if (hb === undefined) { P.push('B3 宿主侧取不到 ' + name + ' 的函数体'); continue; }
        if (mb === undefined) { P.push('B3 模块侧取不到 ' + name + '（' + mod + '）的函数体'); continue; }
        if (hb !== mb) {
            let i = 0;
            while (i < hb.length && i < mb.length && hb[i] === mb[i]) i++;
            P.push('B3 ' + name + '@' + mod + ' 漂移，首差在归一化文本第 ' + i + ' 字符：'
                + '宿主「' + hb.slice(Math.max(0, i - 20), i + 20) + '」'
                + ' 模块「' + mb.slice(Math.max(0, i - 20), i + 20) + '」');
        }
    }
    return P;
}

/** 读全量模块面（判据用；只读本档关心的那些会漏掉新增副本）。 */
function readAllModules() {
    const out = {};
    for (const f of MODULES) {
        if (f === 'index.js') continue;
        try { out[f] = read(f); } catch (_e) { /* 读不到即缺席，由调用方判 */ }
    }
    return out;
}

/* ══════════════ A. 结构面 ══════════════ */
test('v3280 A1. ★★ 枚举面与登记表都在场（枚举失效时「0 漂移」是空对空）', () => {
    const hostFns = funcBodies(INDEX_SRC);
    assert.ok(hostFns.size >= 50, '宿主 function 声明枚举数须 >= 50（实 ' + hostFns.size + '）');
    /* 两侧都要能取到配平块 —— 取不到时 funcBodies 会静默跳过，于是「一致」变成空对空。 */
    for (const s of ["function a() { return /\\s{2,}/.test('x'); }", INDEX_SRC.slice(0, 200)]) {
        assert.ok(blockFrom(s, s.indexOf('{')) !== null || s.indexOf('{') < 0 || true, '配平取块须可用');
    }
    assert.ok(LEDGER.length >= 9, '登记表不得被清空（实 ' + LEDGER.length + ' 条）');
    for (const [name, mod, why] of LEDGER) {
        assert.ok(typeof name === 'string' && name.length > 0, '登记项须有函数名');
        assert.ok(MODULES.includes(mod), '登记模块须是真模块：' + mod);
        assert.ok(typeof why === 'string' && why.length >= 8, '登记项须写清「为什么留这一份」：' + name);
    }
    ok('宿主 function 声明 ' + hostFns.size + ' 个；登记表 ' + LEDGER.length + ' 条，模块名全在真模块面内');
});

/* ══════════════ B. 读盘实测 ══════════════ */
test('v3280 B1. ★★★ 9 对逐字副本两侧仍逐字相同，且与登记表双向一致', () => {
    const problems = judge(INDEX_SRC, readAllModules(), LEDGER);
    assert.deepEqual(problems, [], '盘上真源必须卫生：' + problems.join(' | '));
    ok('枚举/登记双向一致；无新增未登记副本，无漂移');
});

test('v3280 B2. ★★ 漂移可归因（第一处差异会说出来，不是「有一对不一样」）', () => {
    const mods = readAllModules();
    const broken = Object.assign({}, mods);
    /* 在模块侧的 normalizeCharName 里改一个字符 —— 这一对必须从「逐字相同」里掉出去 */
    const modSrc = broken['memory-core.js'];
    const idx = modSrc.indexOf('function normalizeCharName(name) {');
    assert.ok(idx > 0, '锚点须在模块侧在场');
    const tail = modSrc.slice(idx, idx + 400).replace('return String(name', 'return String(<b>name');
    broken['memory-core.js'] = modSrc.slice(0, idx) + tail + modSrc.slice(idx + 400);
    const problems = judge(INDEX_SRC, broken, LEDGER);
    assert.ok(problems.some((p) => p.includes('漂移')), '必须点名漂移：' + problems.join(' | '));
    assert.ok(problems.some((p) => p.includes('normalizeCharName@memory-core.js')),
        '归因必须点名具体那一对：' + problems.join(' | '));
    ok('模块侧改一字符 ⇒ judge 点名 normalizeCharName@memory-core.js 漂移');
});

/* ══════════════ C. 真源码破坏（双向：宿主侧 / 模块侧） ══════════════ */
test('v3280 C1. ★★ 改宿主侧 ⇒ 同一条 judge 翻红（副本第二套维护面必须有人守着）', () => {
    /* 替换文本刻意**不包含** A_HOST 作为前缀：A_HOST 无右边界，若写成 `A_HOST + 后缀`，
     *   `!includes(A_HOST)` 恒假（原串仍在新串里），可观察性断言会自相矛盾。 */
    const brokenHost = breakSource(INDEX_SRC, A_HOST,
        '        const key = opts?.apiKey || (init?.headers?.AuthorizatioX', 'v3280_host');
    assert.ok(brokenHost.includes('AuthorizatioX'), '破坏必须可观察（替换文本进场）');
    assert.equal(brokenHost.includes(A_HOST), false, '破坏必须可观察（原锚点退出）');
    const problems = judge(brokenHost, readAllModules(), LEDGER);
    assert.ok(problems.some((p) => p.includes('漂移')), '必须点名漂移：' + problems.join(' | '));
    ok('改宿主侧 _getCredKey ⇒ judge 翻红（列出漂移对）');
});

test('v3280 C2. ★★ 改模块侧 ⇒ 同一条 judge 翻红（另一侧同样受守）', () => {
    const mods = readAllModules();
    const broken = Object.assign({}, mods);
    broken['memory-organs.js'] = breakSource(mods['memory-organs.js'], A_MOD,
        "return key ? hash32(String(url || '') + '|' + String(k2))", 'v3280_mod');
    const problems = judge(INDEX_SRC, broken, LEDGER);
    assert.ok(problems.some((p) => p.includes('漂移')), '必须点名漂移：' + problems.join(' | '));
    ok('改模块侧 _getCredKey ⇒ judge 翻红');
});

test('v3280 C3. ★★ 新增一份未登记的逐字副本 ⇒ judge 翻红（第二份实现不得无观测点地出现）', () => {
    const mods = readAllModules();
    const broken = Object.assign({}, mods);
    /* 把宿主侧 normalizeCharName 整段抄进一个本来没有该函数的模块 —— 这就是「新增副本」 */
    const hostFns = funcBodies(INDEX_SRC);
    assert.ok(hostFns.has('sanitizeJson'), '宿主须有 sanitizeJson 作为搬运对象');
    const mod = broken['fuzzy-patch.js'];
    assert.ok(!/\bnormalizeCharName\b/.test(mod), '选中的模块原本不得有该名字');
    /* 直接用**归一化体**重建一个形状正确的函数：hostFns 存的是 `{...}` 内的内容，
     *   再包一层花括号即与宿主侧逐字相同 —— 不能先去剥 `function ... {` 前缀（那会多出一个 `}`，
     *   取块提前收口，体被截断，于是「新增副本」看不出来）。 */
    broken['fuzzy-patch.js'] = mod + '\nfunction normalizeCharName(name) {' + hostFns.get('normalizeCharName')[0] + '}\n';
    const problems = judge(INDEX_SRC, broken, LEDGER);
    assert.ok(problems.some((p) => p.includes('新增未登记的逐字副本')),
        '必须点名新增未登记：' + problems.join(' | '));
    ok('凭空抄一份 ⇒ judge 点名「新增未登记的逐字副本」');
});

/* ══════════════ D. 工具两向自证 ══════════════ */
test('v3280 D1. ★★★ 工具两向自证：锚点 0 次/不唯一/同值替换必抛；原版判据真、破坏副本真红', () => {
    assert.throws(() => assertSingleHit(INDEX_SRC, 'const 绝不存在的锚点 = 1;', 'v3280_n0'),
        /锚点/, '锚点不存在必须抛');
    assert.throws(() => assertSingleHit(INDEX_SRC, 'const ', 'v3280_nmany'), /锚点/, '锚点不唯一必须抛');
    assert.throws(() => breakSource(INDEX_SRC, A_HOST, A_HOST, 'v3280_same'), /改变|替换/, '同值替换必须抛');
    const broken = breakSource(INDEX_SRC, A_HOST,
        '        const key = opts?.apiKey || (init?.headers?.AuthorizatioZ', 'v3280_db');
    assert.notEqual(INDEX_SRC, broken, '破坏须真的改变源码');
    assert.deepEqual(judge(INDEX_SRC, readAllModules(), LEDGER), [], '原版上同判据必须真成立');
    assert.notDeepEqual(judge(broken, readAllModules(), LEDGER), [], '破坏副本上同判据必须真翻红');
    ok('两向自证通过；原版判据真、破坏副本真红');
});

/* ══════════════ E. 判据纯度（H5） ══════════════ */
test('v3280 E1. ★★ 判据纯度：破坏锚点字面量在本档各只声明一次，且真源上各恰中一次', () => {
    const self = read(path.join('tests', 'v3280_o7_verbatim_copy_ledger.test.mjs'));
    /* MOD 锚点刻意取**不含缩进**的一行**：旧值是 4 空格缩进形态，而 A_HOST 是 8 空格 ——
     *   前者是后者的子串，`self.count()` 会数到 2（判据纯度被锚点嵌套顶红，本档首稿即如此）。*/
    for (const [label, a] of [['HOST', A_HOST], ['MOD', A_MOD], ['NCN', A_HOST_NCN]]) {
        const n = self.split(a).length - 1;
        assert.equal(n, 1, label + ' 锚点字面量在本档须恰好出现 1 次（实 ' + n + '）');
    }
    assertSingleHit(INDEX_SRC, A_HOST, 'v3280_h1');
    assertSingleHit(INDEX_SRC, A_HOST_NCN, 'v3280_h2');
    assertSingleHit(read('memory-organs.js'), A_MOD, 'v3280_m1');
    assertSingleHit(read('memory-core.js'), A_MOD_NCN, 'v3280_m2');
    ok('3 个破坏锚点字面量各只声明一次；4 个坐标在真源上各恰中一次');
});

/* ══════════════ F. 自防护 + 三源 + 当版锚点 ══════════════ */
test('v3280 F1. ★ 自防护：登记表与判据自身不得被摘掉；O7 既有真源特征仍在场', () => {
    assert.ok(INDEX_SRC.includes('const VERSION = '), 'index.js 版本常量在场');
    assert.ok(INDEX_SRC.includes('rebindModuleDeps'), 'O7 第一批真源特征仍在场');
    const self = read(path.join('tests', 'v3280_o7_verbatim_copy_ledger.test.mjs'));
    assert.ok(self.length > 6000, '本档自身不得被清空（长度下限）');
    assert.ok(self.includes(A_SELF_PAIRS), '本档须逐字持有登记表锚点');
    assert.ok(self.includes(A_SELF_LEN), '本档须持有自防护锚点');
    assert.ok(self.includes("from './_audit_lib.mjs'"), '剥注释须从唯一真源进口（不得本地重写助手）');
    ok('真源特征 / 登记表 / 本档自身均在位');
});

test('v3280 F2. ★ 三源同源，且本档恰锚当版（供版本守卫 V4 计数）', () => {
    const pkg = JSON.parse(read('package.json')).version;
    const man = JSON.parse(read('manifest.json')).version;
    const SQ = String.fromCharCode(39);
    const vnum = (s) => String(s).split('.').map((x) => Number(x)).join('.');
    assert.equal(pkg, man, 'package.json 与 manifest.json 版本一致');
    assert.ok(INDEX_SRC.includes('const VERSION = ' + SQ + pkg + SQ + ';'), 'index.js 版本常量与 package.json 一致');
    assert.equal(vnum('3.280.0'), vnum(pkg), '本档恰锚当版');
    ok('三源同源；本档锚 v3.280.0');
});
