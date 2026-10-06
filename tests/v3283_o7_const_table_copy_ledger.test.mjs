// tests/v3283_o7_const_table_copy_ledger.test.mjs — v3.283.0 O7 第四项（续三）：常量表「值级」副本面
// 主题：**登记的副本值在两侧必须逐字相等** —— 前四层判据没有一处钉这个。
//
//   【为什么本档存在（真缺口，本轮实测）】
//     O7 到此的四层副本判据各管一面，但没有一处钉住「常量的**值**在两侧逐字相等」：
//       · v3280 只枚举 `function` 声明形态（MODULES × funcBodies），常量表不在面内；
//       · v3281 的 buildClusters 也按 `function`（名字→体→成员）聚类，常量不在面内；
//       · v3264 / v3266 的 `VERBATIM_CONSTS` 只判**声明是否存在**：
//             new RegExp('(const|let)\\s+' + c + '\\s*=').test(modSrc)
//         —— 它不含任何值比对，故「副本声明还在、值已经不同」它看不见；
//       · v3282（本版新增）判的是**别名**（同体不同名），而这三对常量是**同名**，正好在它面外。
//
//     **实测证伪（真源码破坏，本轮跑过）**：把 `memory-organs.js` 的
//     `ARCHIVE_TOP_LEVEL_KEYS` 副本在 `'extensions',` 后插入一个多余键
//     （值级漂移、声明仍在 ⇒ v3264 的在场性判据不会响）⇒ `node tests/run.mjs` **仍 262/262 全绿**。
//     即：**该副本的值漂移，整套测试面完全不可见**。这正是 O7 第一条要抓的
//     「减少实际重复实现」的反面 —— 重复实现没人守，就是两份会各自腐化的真源。
//
//   【本档登记（3 对同名常量表，实测值逐字相同）】
//     ARCHIVE_TOP_LEVEL_KEYS   index.js ↔ memory-organs.js   629 字符  md5 72ef6f67
//     RELATION_CONFLICT_GROUPS index.js ↔ memory-core.js     134       md5 a2700f54
//     STORAGE_FP_FIELDS        index.js ↔ memory-organs.js    65       md5 70a8fcd9
//     三对都在 v3264 / v3266 的 `VERBATIM_CONSTS` 名单里被**按名**登记过（声明在场性），
//     本档补的是那份名单缺的**值**这一维（两者互补，非重复）。
//
//   【判据（fail-closed）】
//     A  枚举面：根级 .js 下限 + 常量表声明枚举下限 + 同名跨文件对下限（塌陷时「0 漂移」是空对空）
//     B1 新增未登记的同名常量副本即红
//     B2 登记项漂移/消失、成员集合变化、或某一侧的**声明形态**不再取得出块即红（点名差异面）
//     C  真源码破坏（三向）：改宿主侧成员 / 改模块侧成员 / 凭空复制一份 ⇒ 同一条 judge 翻红
//     D  工具两向自证：breakSource 的 0 次 / 同值替换必抛；原版判据真、破坏副本真红
//     E  判据纯度 H5：破坏锚点字面量在本档各只声明一次（先钉「本档无多行锚点」防计数空转），
//        且真源上各恰中一次
//     F  自防护 + 三源同源 + 当版锚点
//
//   【边界（诚实）】
//     ① 本档只保证「登记在案的三对常量副本的**值**在两侧逐字相等，且新出现的一对必须登记」。
//        它**不**判定这三对是否应当合并为单真源 —— 模块注释已声明它们是刻意的副本
//        （宿主与历史套件把类/常量抠进 `new Function` 单独重放时需要），收拢与否是设计决定。
//     ② 面只覆盖「数组/对象字面量表」（含 `Object.freeze([...])` / `new Set([...])` / `new Map([...])`）。
//        标量常量（`const X = 3`）不构成「实现副本」，本档不收 —— 那是配额而非缺口。
//     ③ 本档与 v3282 的常量面**不重叠**：v3282 收的是**名字不同**的两份（`RESIDENT_FALLBACK` /
//        `RESIDENT_MARKERS`、`keys` / `pFields`），本档收的是**名字相同**的两份。四档合起来
//        才是常量副本的全枚举面（v3264/v3266 判在场、本档判值、v3280/v3281 判函数体、v3282 判别名）。
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

/** 常量表体长下限（实 65 最短）：低于此不构成「一张表」，不收。 */
const MIN_BODY = 40;
/** 根级 .js 下限（实 80）。 */
const MIN_FILES = 60;
/** 常量表声明枚举下限（实数百）：塌陷时「0 对」会伪装成卫生。 */
const MIN_TABS = 200;
/** 同名跨文件对下限（实 3）。 */
const MIN_PAIRS = 2;

/**
 * 登记表（唯一真源）。
 * 每条：[常量名, [成员文件], 体长, 体 md5(8), 声明形态]。
 * 「声明形态」= `[`（裸数组）/ `Object.freeze([` / `new Set([` … 记下来是为了让
 * 「看起来像同一张表、其实包了一层生命周期不同的写法」也能被点名。
 */
const CONST_LEDGER = [
    ['ARCHIVE_TOP_LEVEL_KEYS', ['index.js', 'memory-organs.js'], 629, '72ef6f67', 'Object.freeze(['],
    ['RELATION_CONFLICT_GROUPS', ['index.js', 'memory-core.js'], 134, 'a2700f54', '['],
    ['STORAGE_FP_FIELDS', ['index.js', 'memory-organs.js'], 65, '70a8fcd9', '['],
];

/* ---- 破坏锚点（逐字取自真源，禁改；本档须逐字持有） ---- */
/* 宿主侧与模块侧的声明行**逐字同形**，故只留一个常量：两个同形常量名本身就是一对冗余。
 *   坐标的「两侧各恰中一次」由 E1 的 assertSingleHit 分别证明。 */
const A_ARCHIVE = 'const ARCHIVE_TOP_LEVEL_KEYS = Object.freeze([';   /* index.js + memory-organs.js */
const A_MOD_TAIL = "'extensions'," + String.fromCharCode(10) + ']);';      /* 字面形态：'extensions',\n]); */
const A_MOD_RELATION = 'const RELATION_CONFLICT_GROUPS = [';               // memory-core.js（模块侧）
const A_MOD_STORAGE = "const STORAGE_FP_FIELDS = ['graph'";                // memory-organs.js（模块侧）
const A_SELF_LEN = 'assert.ok(self.length > 6000';
const A_SELF_LEDGER = 'const CONST_LEDGER = [';

const FILES = fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.bak'))
    .sort();

/* ══════════════ 判据体（纯函数：吃源码表，返回问题列表） ══════════════ */

/** 归一化：剥注释 → 折叠空白 → trim（与 v3280 / v3281 / v3282 同口径，唯一真源 stripComments）。 */
const norm = (s) => stripComments(String(s)).replace(/\s+/g, ' ').trim();

/** 配平取块（跳过引号 / 注释 / 字符串内转义）。 */
function blockFrom(src, startBrace) {
    let depth = 0, i = startBrace, quote = null;
    const n = src.length;
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
        if ('{[('.includes(c)) { depth++; i++; continue; }
        if ('}])'.includes(c)) { depth--; if (depth === 0) return src.slice(startBrace + 1, i); i++; continue; }
        i++;
    }
    return null;
}

/**
 * 枚举源码里的「数组/对象字面量表」常量声明。
 * 支持形态：`[` / `{` 裸字面量，以及 `Object.freeze(` / `new Set(` / `new Map(` 包装（包装只跳一层）。
 * 返回 [{name, body, decl}]（已归一化；体长 < MIN_BODY 的丢弃）。
 */
function constTablesOf(src) {
    const out = [];
    const RE = /(?:^|\n)([ \t]*)(?:const|let)[ \t]+([A-Za-z_$][A-Za-z0-9_$]*)[ \t]*=[ \t]*/g;
    let m;
    while ((m = RE.exec(src)) !== null) {
        let i = m.index + m[0].length;
        let decl = '';
        /* 一层包装（freeze / Set / Map）：跳过键名、小括号、空白，落在字面量括号上 */
        const wrapM = /^(Object\.freeze|new[ \t]+Set|new[ \t]+Map)/.exec(src.slice(i));
        if (wrapM) {
            decl = wrapM[1] + '(';
            i += wrapM[0].length;
            while (i < src.length && src[i] !== '(') i++;
            i++;
            while (i < src.length && /[ \t]/.test(src[i])) i++;
        }
        const open = src[i];
        if (open !== '[' && open !== '{') continue;
        const b = blockFrom(src, i);
        if (b === null) continue;
        const nb = norm(b);
        if (nb.length < MIN_BODY) continue;
        out.push({ name: m[2], body: nb, decl: decl + open });
    }
    return out;
}

/**
 * 真判据体：给定「全仓源码表」，返回问题列表；空数组 = 卫生。
 * @param {Object<string,string>} srcMap { 文件名: 源码 }
 * @param {Array} ledger 登记表（[name, files, len, md5, decl]）
 */
function judge(srcMap, ledger) {
    const P = [];
    const files = Object.keys(srcMap);
    /* A. 枚举面：整仓必须真的被枚举（否则「0 漂移」是空对空） */
    if (files.length < MIN_FILES) P.push('A 枚举面失效：只扫到 ' + files.length + ' 个根级 .js（下限 ' + MIN_FILES + '）');
    const per = new Map();       // name -> body -> {disk 成员集, decl 集}
    let tabs = 0;
    for (const f of files) {
        for (const t of constTablesOf(srcMap[f])) {
            tabs++;
            if (!per.has(t.name)) per.set(t.name, new Map());
            const byBody = per.get(t.name);
            if (!byBody.has(t.body)) byBody.set(t.body, { files: new Set(), decls: new Set() });
            byBody.get(t.body).files.add(f);
            byBody.get(t.body).decls.add(t.decl);
        }
    }
    if (tabs < MIN_TABS) P.push('A 枚举面失效：只枚举出 ' + tabs + ' 张常量表（下限 ' + MIN_TABS + '）');
    const pairs = [];
    for (const [nm, byBody] of per) {
        for (const [body, rec] of byBody) {
            if (rec.files.size < 2) continue;
            pairs.push([nm, [...rec.files].sort(), body.length, md5(body), [...rec.decls].sort().join('|')]);
        }
    }
    if (pairs.length < MIN_PAIRS) P.push('A 枚举面失效：只枚举出 ' + pairs.length + ' 对同名跨文件常量表（下限 ' + MIN_PAIRS + '）');

    const disk = new Map(pairs.map((p) => [p[0] + '#' + p[3], p]));
    const decl = new Map(ledger.map((p) => [p[0] + '#' + p[3], p]));

    for (const [k, r] of disk) {
        if (!decl.has(k)) P.push('B1 新增未登记的同名常量副本：' + r[0] + ' @[' + r[1].join(',') + '] len=' + r[2] + ' md5=' + r[3] + ' decl=' + r[4]);
    }
    for (const [k, r] of decl) {
        if (!disk.has(k)) {
            P.push('B2 登记在案的常量副本值已漂移或已消失：' + r[0]
                + '（登记成员 [' + r[1].join(',') + '] len=' + r[2] + ' md5=' + r[3] + ' decl=' + r[4] + '）');
            continue;
        }
        const got = disk.get(k);
        if (got[1].join(',') !== r[1].join(',')) {
            P.push('B2 ' + r[0] + ' 成员集合变了：登记 [' + r[1].join(',') + '] / 实测 [' + got[1].join(',') + ']');
        }
        /* 声明形态对比：`[` 与 `Object.freeze([` 的生命周期不同（可换 vs 冻结），
         *   若某一侧把 freeze 摘了，值仍然逐字相同、但契约已经不同 —— 必须点名。 */
        const want = r[4].split('|').filter(Boolean).join('|');
        if (got[4] !== want && got[4].split('|').sort().join('|') !== want.split('|').sort().join('|')) {
            P.push('B2 ' + r[0] + ' 声明形态变了：登记 ' + r[4] + ' / 实测 ' + got[4]);
        }
    }
    for (const r of ledger) {
        if (!Array.isArray(r[1]) || r[1].length < 2) P.push('B3 登记项的成员文件必须 >= 2：' + r[0]);
        if (!Number.isInteger(r[2]) || r[2] <= 0) P.push('B3 登记项须有体长：' + r[0]);
        if (!/^[0-9a-f]{8}$/.test(r[3])) P.push('B3 登记项须有体 md5(8)：' + r[0]);
    }
    return P;
}

const readAll = () => {
    const m = {};
    for (const f of FILES) m[f] = read(f);
    return m;
};

const SELF_REL = path.join('tests', 'v3283_o7_const_table_copy_ledger.test.mjs');

/* ══════════════ A. 结构面 ══════════════ */
test('v3283 A1. ★★ 枚举面与登记表都在场（枚举失效时「0 漂移」是空对空）', () => {
    assert.ok(FILES.length >= MIN_FILES, '根级 .js 面须 >= ' + MIN_FILES + ' 个（实 ' + FILES.length + '）');
    const tabs = FILES.reduce((a, f) => a + constTablesOf(read(f)).length, 0);
    assert.ok(tabs >= MIN_TABS, '常量表枚举须非空（实 ' + tabs + '，下限 ' + MIN_TABS + '）');
    assert.ok(CONST_LEDGER.length >= MIN_PAIRS, '登记表不得被清空（实 ' + CONST_LEDGER.length + ' 对）');
    const seen = new Set();
    for (const [nm, files, len, h, decl] of CONST_LEDGER) {
        assert.ok(typeof nm === 'string' && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(nm), '登记项须是常量名：' + nm);
        assert.ok(Array.isArray(files) && files.length >= 2, '成员文件须 >= 2：' + nm);
        for (const f of files) assert.ok(FILES.includes(f), '登记成员须是真根级 .js：' + f + '（在 ' + nm + ' 里）');
        assert.ok(Number.isInteger(len) && len > 0, '须登记体长：' + nm);
        assert.ok(/^[0-9a-f]{8}$/.test(h), '须登记体 md5(8)：' + nm);
        assert.ok(typeof decl === 'string' && decl.length > 0, '须登记声明形态：' + nm);
        assert.ok(!seen.has(nm + '#' + h), '同一对不得重复登记：' + nm);
        seen.add(nm + '#' + h);
    }
    ok('根级 ' + FILES.length + ' 个 .js；登记表 ' + CONST_LEDGER.length + ' 对，成员/体长/md5/形态格式全过');
});

/* ══════════════ B. 读盘实测 ══════════════ */
test('v3283 B1. ★★★ 3 对同名常量副本的值逐字相等，且与登记表双向一致', () => {
    const problems = judge(readAll(), CONST_LEDGER);
    assert.deepEqual(problems, [], '盘上真源必须卫生：' + problems.join(' | '));
    ok('3 对常量副本值级双向一致；无新增未登记对，无漂移/形态变化');
});

test('v3283 B2. ★★ 值级漂移可归因（点名是哪一对、差在哪一维）', () => {
    const mods = readAll();
    /* 在模块侧表尾插一个多余键：值漂移、声明仍在 —— 正是 v3264 在场性判据看不见的那种 */
    mods['memory-organs.js'] = breakSource(mods['memory-organs.js'], A_MOD_TAIL,
        "'extensions'," + String.fromCharCode(10) + "'probeBogusKey'," + String.fromCharCode(10) + ']);', 'v3283_b2');
    const problems = judge(mods, CONST_LEDGER);
    assert.ok(problems.some((p) => p.includes('ARCHIVE_TOP_LEVEL_KEYS')), '必须点名该常量：' + problems.join(' | '));
    assert.ok(problems.some((p) => p.includes('md5=')), '归因须带体指纹：' + problems.join(' | '));
    ok('模块侧表尾多插一个键 ⇒ judge 点名该常量副本值已漂移（带 md5）');
});

/* ══════════════ C. 真源码破坏（三向） ══════════════ */
test('v3283 C1. ★★ 改宿主侧成员（index.js 的 ARCHIVE_TOP_LEVEL_KEYS）⇒ 同一条 judge 翻红', () => {
    /* 替换文本刻意**不包含** A_ARCHIVE 作为前缀：锚点无右边界，
     *   写成 `A_ARCHIVE + 后缀` 会让 `!includes(锚点)` 恒假，可观察性断言自相矛盾。 */
    const broken = breakSource(read('index.js'), A_ARCHIVE,
        'const ARCHIVE_TOP_LEVEL_KEYS_PROBE = Object.freeze([', 'v3283_c1a');
    assert.ok(broken.includes('ARCHIVE_TOP_LEVEL_KEYS_PROBE'), '破坏必须可观察（替换文本进场）');
    assert.equal(broken.includes(A_ARCHIVE), false, '破坏必须可观察（原锚点退出）');
    const mods = readAll();
    mods['index.js'] = broken;
    const problems = judge(mods, CONST_LEDGER);
    assert.ok(problems.some((p) => p.includes('ARCHIVE_TOP_LEVEL_KEYS')), '必须点名该常量：' + problems.join(' | '));

    /* 两侧同形，故**换一侧必须也翻红** —— 只破宿主侧证明不了模块侧那一份也在面内。 */
    const mods2 = readAll();
    mods2['memory-organs.js'] = breakSource(read('memory-organs.js'), A_ARCHIVE,
        'const ARCHIVE_TOP_LEVEL_KEYS_PROBE = Object.freeze([', 'v3283_c1b');
    const problems2 = judge(mods2, CONST_LEDGER);
    assert.ok(problems2.some((p) => p.includes('ARCHIVE_TOP_LEVEL_KEYS')),
        '模块侧同一坐标也要翻红：' + problems2.join(' | '));
    ok('改 index.js 或 memory-organs.js 的同形声明行 ⇒ judge 均翻红（该对成员缩水）');
});

test('v3283 C2. ★★ 改模块侧成员（memory-core.js 的 RELATION_CONFLICT_GROUPS / memory-organs.js 的 STORAGE_FP_FIELDS）⇒ 翻红', () => {
    const mods = readAll();
    mods['memory-core.js'] = breakSource(mods['memory-core.js'], A_MOD_RELATION,
        'const RELATION_CONFLICT_GROUPS_PROBE = [', 'v3283_c2a');
    let problems = judge(mods, CONST_LEDGER);
    assert.ok(problems.some((p) => p.includes('RELATION_CONFLICT_GROUPS')), '必须点名 RELATION_CONFLICT_GROUPS：' + problems.join(' | '));

    const mods2 = readAll();
    mods2['memory-organs.js'] = breakSource(mods2['memory-organs.js'], A_MOD_STORAGE,
        "const STORAGE_FP_FIELDS_PROBE = ['graph'", 'v3283_c2b');
    problems = judge(mods2, CONST_LEDGER);
    assert.ok(problems.some((p) => p.includes('STORAGE_FP_FIELDS')), '必须点名 STORAGE_FP_FIELDS：' + problems.join(' | '));
    ok('改 memory-core.js / memory-organs.js 的常量副本 ⇒ judge 均翻红');
});

test('v3283 C3. ★★ 把宿主侧那张表整体复制到本无该常量的模块 ⇒ judge 点名「新增未登记」', () => {
    const mods = readAll();
    /* 取宿主真表整体（含 freeze 包装），整份复制进 age-anchor.js：名字与值都在，只是多了一处 */
    const m = /const ARCHIVE_TOP_LEVEL_KEYS = Object\.freeze\(\[[\s\S]*?\]\);/.exec(read('index.js'));
    assert.ok(m, '宿主侧 ARCHIVE_TOP_LEVEL_KEYS 必须存在（判据自身不得失效）');
    mods['age-anchor.js'] = mods['age-anchor.js'] + String.fromCharCode(10) + m[0] + String.fromCharCode(10);
    const problems = judge(mods, CONST_LEDGER);
    assert.ok(problems.some((p) => p.includes('ARCHIVE_TOP_LEVEL_KEYS')), '必须点名该常量：' + problems.join(' | '));
    ok('宿主表整份复制进 age-anchor.js ⇒ judge 点名该对成员集合变化（新增未登记成员）');
});

/* ══════════════ D. 工具两向自证 ══════════════ */
test('v3283 D1. ★★★ 工具两向自证：锚点 0 次/同值替换必抛；原版判据真、破坏副本真红', () => {
    const src = read('memory-organs.js');
    assert.throws(() => assertSingleHit(src, 'const 绝不存在的锚点 = 1;', 'v3283_n0'), /锚点/, '锚点不存在必须抛');
    assert.throws(() => breakSource(src, A_ARCHIVE, A_ARCHIVE, 'v3283_same'), /改变|替换/, '同值替换必须抛');
    const broken = breakSource(src, A_ARCHIVE,
        'const ARCHIVE_TOP_LEVEL_KEYS_Z = Object.freeze([', 'v3283_db');
    assert.notEqual(src, broken, '破坏须真的改变源码');
    assert.deepEqual(judge(readAll(), CONST_LEDGER), [], '原版上同判据必须真成立');
    const mods = readAll();
    mods['memory-organs.js'] = broken;
    assert.notDeepEqual(judge(mods, CONST_LEDGER), [], '破坏副本上同判据必须真翻红');
    ok('两向自证通过；原版判据真、破坏副本真红');
});

/* ══════════════ E. 判据纯度（H5） ══════════════ */
test('v3283 E1. ★★ 判据纯度：每个破坏锚点字面量在本档只有一个持有常量，且真源上各恰中一次', () => {
    const self = read(SELF_REL);
    const holders = new Map();   // 字面量 -> 持有它的锚点常量名集合
    for (const [label, a] of [['ARCHIVE', A_ARCHIVE],
        ['MOD_TAIL', A_MOD_TAIL], ['MOD_RELATION', A_MOD_RELATION], ['MOD_STORAGE', A_MOD_STORAGE]]) {
        /* MOD_TAIL 是刻意的多行锚点（表尾两行），其余三个是单行声明行（多行体级锚点的缩进/转义易漂）。 */
        assert.equal(a.includes(String.fromCharCode(10)) && label !== 'MOD_TAIL', false,
            label + ' 须是单行锚点（计数口径依赖此事实）');
        const esc = a.replace(/\n/g, '\\n');
        assert.ok(self.includes(esc), label + ' 锚点字面量须逐字被本档持有（否则计数口径空转）');
        if (!holders.has(esc)) holders.set(esc, new Set());
        holders.get(esc).add(label);
    }
    /* ★★ 真源事实：宿主侧与模块侧的 ARCHIVE_TOP_LEVEL_KEYS **声明行同形**（同一串字面量），
     *   所以本档刻意只有**一个**常量 A_ARCHIVE —— 若照抄成两个常量名（HOST_/MOD_），
     *   本档就自己制造了一对冗余；下面这条断言正是在钉这件事。 */
    for (const [esc, set] of holders) {
        assert.equal(set.size, 1,
            '字面量 ' + esc + ' 在本档被多个锚点常量持有：' + [...set].join(' / ') + '（禁硬抄，须复用常量）');
    }
    /* 计数口径自证：逐行扫「本档内以 const 声明锚点的那几行」，确认没有第二种写法。 */
    const declRe = /^const\s+(A_[A-Z_]+)\s*=/gm;
    const declNames = [...self.matchAll(declRe)].map((m) => m[1]);
    assert.deepEqual(declNames, ['A_ARCHIVE', 'A_MOD_TAIL', 'A_MOD_RELATION', 'A_MOD_STORAGE', 'A_SELF_LEN', 'A_SELF_LEDGER'],
        '本档锚点常量的声明序须稳定（防漏抄/错抄）');
    /* 坐标在各被破坏文件里唯一 —— 与 C1/C2/C3/D1 同用这批常量，故下面也是那几段的定点证明。
     *   同一串字面量在两份源码里各恰中一次，这比声明两个同形常量更强：它顺带钉住「两侧声明同形」这一登记前提。 */
    assertSingleHit(read('index.js'), A_ARCHIVE, 'v3283_h1');
    assertSingleHit(read('memory-organs.js'), A_ARCHIVE, 'v3283_h2');
    assertSingleHit(read('memory-organs.js'), A_MOD_TAIL, 'v3283_h3');
    assertSingleHit(read('memory-core.js'), A_MOD_RELATION, 'v3283_h4');
    assertSingleHit(read('memory-organs.js'), A_MOD_STORAGE, 'v3283_h5');
    ok('4 个破坏锚点字面量各只有 1 个持有常量（宿主/模块同形那一对共用同一常量）；'
        + '5 个坐标（含同形对的两侧）在真源上各恰中一次');
});

/* ══════════════ F. 自防护 + 三源 + 当版锚点 ══════════════ */
test('v3283 F1. ★ 自防护：登记表与判据自身不得被摘掉；O7 既有真源特征仍在场', () => {
    assert.ok(read('index.js').includes('const VERSION = '), 'index.js 版本常量在场');
    assert.ok(read('index.js').includes('rebindModuleDeps'), 'O7 第一批真源特征仍在场');
    assert.ok(read('memory-organs.js').includes(A_ARCHIVE),
        '本档第一对的真源成员仍在场（含 freeze 形态）');
    const self = read(SELF_REL);
    const selfLen = self.length;
    assert.ok(selfLen > 6000, '本档自身不得被清空（实 ' + selfLen + ' 字符）');
    assert.ok(self.includes(A_SELF_LEDGER), '本档须逐字持有登记表锚点');
    assert.ok(self.includes(A_SELF_LEN), '本档须持有自防护锚点');
    assert.ok(self.includes("from './_audit_lib.mjs'"), '剥注释须从唯一真源进口（不得本地重写助手）');
    ok('真源特征 / 登记表 / 本档自身均在位（' + selfLen + ' 字符）');
});

test('v3283 F2. ★ 三源同源，且本档恰锚当版（供版本守卫 V4 计数）', () => {
    const pkg = JSON.parse(read('package.json')).version;
    const man = JSON.parse(read('manifest.json')).version;
    const SQ = String.fromCharCode(39);
    const vnum = (s) => String(s).split('.').map((x) => Number(x)).join('.');
    assert.equal(pkg, man, 'package.json 与 manifest.json 版本一致');
    assert.ok(read('index.js').includes('const VERSION = ' + SQ + pkg + SQ + ';'), 'index.js 版本常量与 package.json 一致');
    assert.equal(vnum('3.283.0'), vnum(pkg), '本档恰锚当版');
    ok('三源同源；本档锚 v3.283.0');
});