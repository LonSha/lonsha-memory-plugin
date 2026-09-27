// tests/audit/scan_break_kit.mjs
// [v3.247.0] 审计基建 F：破坏形态库单一真源
// ------------------------------------------------------------
// 为什么需要它（计划 #19；本轮实测，不是整洁性偏好）：
//   破坏工具（「真源码替换，锚点必须恰中 1 次」）在 27 个文件里各写一份，实测分化出 ——
//     · 名字 5 种：breakSource(14) / breakText(9) / mutateOnce(4) / mk·mkBroken(匿名工厂, 4) / 内联 replace(2)
//     · 参数序 4 种：breakSource(src, anchor, repl) / (src, from, to, tag) / (from, to, tag) / mutateOnce(dir, rel, from, to)
//     · 错误类型 2 种：assert.equal 产生的 AssertionError（20 文件）/ 裸 throw Error（6 文件）
//     · 校验强度 3 种：只查命中次数 / 命中 + 同值 / 命中 + 同值（措辞各异）
//   后果不是「代码不整洁」，是**纪律没有出口**：`拒绝破坏` 只在 9/27 个文件里出现 ——
//   另外 18 个文件里，读代码的人无法判断这个破坏工具守了什么、没守什么。
//
//   更贵的一层（本轮实测）：v3174/v3175 的正则锚点形态里，命中数是这么数的 ——
//     `(idxSrc.match(new RegExp(re.source, 'g')) || []).length`
//   带 g 是对的；但同族的 v3175 写法漏了 g（`src.match(re)` 不带 g 返回**首个匹配对象**，
//   `|| []` 把它当数组 ⇒ `.length` 恒为 1）。于是「恰中 1 次」这条纪律在该形态下**空转**：
//   锚点命中 3 次也照样放行。**判据看起来在守，实际数不出第二个命中。**
//   这正是本仓最贵的形态（绿着，但绿的成因不是判据在守），也是收编的真正理由：
//   口径分散时，同一份纪律在各处的强度不同，且没人量得出差异。
//
// 判据：
//   A 真源面（动态加载 + 导出面逐项 + 别名同一性）
//   B 行为面（四条口径 + 两种锚点形态，真源自身必须立住）
//   C 接线面（不得本地重写；出口或消息必须同源；NOT_SCOPE 登记）
//   D 活性面（接收方下限 + run.mjs 下划线排除）
//   E 自证（真源码破坏 → 在破坏副本上重跑同批判据 → 必须翻红；含**真接收方真跑**）
// 退出码：0 = 卫生 / 1 = 真缺陷 / 2 = 结构漂移
// 行为通道：LONSHA_BREAK_KIT_HOME 指向「含 tests/_break_kit.mjs 的根」（E 自证用）。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AssertionError } from 'node:assert';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
/* 剥注释用**既有唯一真源**（v3.191 把 stripComments/codeLines/bodyOf/braceMatch 收敛到
 *   tests/_audit_lib.mjs，并由 scan_audit_lib_consolidation 常驻把守「不得本地重写」）。
 *   本轮的理由是实测的：不剥注释时，本门禁**自己文件头**的说明文字里逐字写着
 *   `breakSource(14) / mutateOnce(4)`，于是 C2 把本门禁自己判成了缺陷。
 *   正解是「只认代码不认注释」，不是给自己开豁免。 */
import { stripComments } from '../_audit_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.LONSHA_BREAK_KIT_HOME || path.resolve(HERE, '..', '..');
const KIT_REL = 'tests/_break_kit.mjs';
/* 本门禁的**外部观测器**（配对负控制，fixture-sync E4 的观测点）。
 *   它必须自带一份破坏实现才能破坏被测物 —— 故 C 段（不得本地重写 / 调用点必须 import 真源）
 *   在它身上命中是**设计使然**，不是缺陷（实测过：不加排除会各报一条，把观测器判成缺陷）。
 *   排除的代价与依据：它不出现在「接收方」计数里（那一面量的是**调用方**如何用出口，
 *   观测器量的是**门禁判据本身**有没有观测点，两者是不同的问题，故不混在一个计数里）。 */
const NEGCTL_REL = 'tests/audit/scan_break_kit_negctl.mjs';
const TESTS_DIR = path.join(HOME, 'tests');
const AUDIT_DIR = path.join(TESTS_DIR, 'audit');
const RUN_REL = 'tests/run.mjs';

/* 显式不在本库范围（登记 + 理由）。门禁只验「登记过」，不复刻它们的实现：
 * 它们是夹具/运行器（造独立树、跑扫描器、收 status/out），各文件要造的树不同，本就该各写一份。 */
const NOT_SCOPE = {
    withTree: '夹具：造/清独立树，各套件的树不同（只读三文件 / withDocs / 整仓 cpSync）',
    mkTree: '同上（withTree 的树构造器）',
    mirror: '运行器：整仓镜像 + 跑门禁收 status（v3225/v3235 形态）',
    withMirror: '同上（v3236 形态）',
    brokenCopies: '运行器：批量产破坏副本再逐条跑真判据（v3174/v3175/v3176/v3180 形态）',
};
const KIT_API = ['breakOnce', 'breakSource', 'breakText', 'mutateOnce', 'breakFile', 'assertSingleHit', 'BREAK_MSG',
    'hitsMismatchMessage', 'sameValueMessage', 'emptyAnchorMessage'];
/* 本地重写的检测名集：**只放破坏工具的出口名**。
 *   【留痕】首版还收了 `mkBroken`，实测 v3184 里那是 `new Function(...)` 造图，
 *   不是破坏工具 ⇒ 一条假红。名字表要按「语义是什么」写，不是按「名字像什么」写。 */
const RECEIVE_NAME_RE = /(?:^|\n)[ \t]*(?:export[ \t]+)?(?:async[ \t]+)?(?:function|const|let|var)[ \t]+(breakText|breakSource|mutateOnce|breakOnce|breakFile|assertSingleHit)[0-9A-Za-z_$]*[ \t]*[=(]/;
/* 调用点检测（C2 的触发条件）：文件里**真的调用**了破坏工具的出口。
 *   用调用点而不是文本，是实测结果：5 个负控制脚本在注释/断言文本里提到「拒绝破坏」
 *   却一处都没调用破坏工具（它们自带 probe），文本触发会误报 5 条。
 *   判据要量「谁在调用」，不是「谁的注释里提过」。 */
const CALL_SITE_RE = /(?<![\w$.])(?:breakText|breakSource|mutateOnce|breakOnce|breakFile|assertSingleHit)[ \t]*\(/;
const KIT_IMPORT_RE = /from[ \t]*['"][^'"]*_break_kit\.mjs['"]/;
const EXPECT_THROW_RE = /expectThrow|mustThrow|拒绝破坏|mustChange|BREAK_MSG/;
const MSG_LITERAL_RE = /拒绝破坏|锚点命中|恰中 1 次|恰好 1 次|必须真的改变源码|锚点应恰好命中/;
const MIN_RECEIVERS = 15;
/* 实测（v3.247.0）：期望破坏拒绝的判据点 16 个。下限取 14 —— 留 ±2 的自然增减余量；
 *   低于 14 说明扫描面塌了（文件被改名/移出 tests 面），而不是「恰好没新增」。 */
const MIN_DEFECT_SITES = 14;
const MAX_MSG_FILES = 3;
/* 接收面片段：唯一判定依据是「它是不是真源拼出来的消息的子串」。
 *   语料由**真源的消息构造函数**现场生成（不是手抄一份清单）——
 *   真源改了措辞，这里立刻对不上，而不是等某天真因不明的假绿。
 *   惰性求值（不是常量）：本常量区在 KIT 加载（A 段）之前求值，
 *   写成 `const MSG_CORPUS = KIT.hitsMismatchMessage(...)` 实测直接
 *   `Cannot access 'KIT' before initialization` —— 模块顶层 TDZ 崩栈，
 *   任何判据都来不及跑（本仓纪律：不得崩在加载栈上）。 */
function msgCorpus() {
    return [
        KIT.hitsMismatchMessage(0, 'L', 'A'), KIT.hitsMismatchMessage(2, 'L', 'A'),
        KIT.hitsMismatchMessage(0), KIT.hitsMismatchMessage(2),
        KIT.sameValueMessage('L', 'A'), KIT.sameValueMessage(),
        KIT.emptyAnchorMessage(),
    ].join('\n');
}
/* 抽出代码里用来断言的正则字面量（只认含消息措辞的那些，避免把普通正则算进来）。
 *
 *   【本判据自己踩过的一形，v3.247.0 实测】模块级带 `g` 的正则被 `.test()` 调用过之后，
 *   `lastIndex` 会停在上次命中位置；紧接着的 `String.prototype.matchAll(同一个正则对象)`
 *   会**从那个位置继续**（matchAll 内部克隆时带上原对象的 lastIndex）。
 *   实测后果：`} else if (FRAG_RE.test(code))` 先把游标推到第一个片段的末尾，
 *   于是三层嵌套调用点（v3175/v3176 形态）的**每个文件第一个片段被静默跳过** ——
 *   判据看着在扫全仓，实际每个文件漏一处。这正是本门禁治的形态（判据看着在守、
 *   实际数不全），故在此定为纪律：**这里只认非全局常量 + 每次现造一个全局副本**。 */
const FRAG_RE = /\/([^/\n]*(?:拒绝破坏|锚点命中|恰中 1 次|恰好 1 次|必须真的改变源码|锚点应恰好命中)[^/\n]*)\//;

const defects = [];
const drifts = [];
const notes = [];
const bad = (m) => defects.push(m);
const drift = (m) => drifts.push(m);
function reportDrift() {
    console.error('[break-kit] ' + drifts.length + ' 项结构漂移（探测器失效，拒绝给结论）：');
    for (const d of drifts) console.error('  x ' + d);
    process.exit(2);
}
/* fail-closed 兜底：靠「每条 drift 后面自己记得接出口」是纪律不是结构（v3.192 的教训）。 */
process.on('exit', (code) => {
    if (code === 0 && drifts.length) {
        console.error('[break-kit] ' + drifts.length + ' 项结构漂移未接出口（fail-closed 兜底）：');
        for (const d of drifts) console.error('  x ' + d);
        process.exit(2);
    }
});

/* ---------- 0 结构预检 ---------- */
if (!fs.existsSync(path.join(HOME, KIT_REL))) drift('唯一真源缺失：' + KIT_REL);
if (!fs.existsSync(AUDIT_DIR)) drift('扫描面缺失：tests/audit');
if (!fs.existsSync(path.join(TESTS_DIR, 'run.mjs'))) drift('runner 缺失：' + RUN_REL);
if (drifts.length) reportDrift();

/* ---------- A 真源面：动态加载 + 导出面 + 同一性 ---------- */
let KIT = null;
try { KIT = await import(pathToFileURL(path.join(HOME, KIT_REL)).href); }
catch (e) { drift('唯一真源不可加载（' + KIT_REL + '）：' + e.message); }
for (const k of KIT_API) {
    if (k === 'BREAK_MSG') continue;
    if (typeof KIT?.[k] !== 'function') drift('唯一真源缺导出（函数）' + k);
}
if (!KIT?.BREAK_MSG || typeof KIT.BREAK_MSG !== 'object') drift('唯一真源缺导出 BREAK_MSG（消息口径表）');
/* 别名必须与真身**同一函数对象**：别名若各长各的，收编就退化成「改了 27 处的一处」。 */
if (KIT?.breakSource !== KIT?.breakOnce || KIT?.breakText !== KIT?.breakOnce || KIT?.mutateOnce !== KIT?.breakOnce) {
    drift('破坏别名与 breakOnce 不是同一函数对象（别名各长各的 = 仍是多份实现）');
}
if (drifts.length) reportDrift();

/* ---------- B 行为面：四条口径 + 两种锚点形态（同一批判据也用于 E 自证） ---------- */
function behaviorChecks(K) {
    const fails = [];
    /* 抛出类型从**静态 import** 取（不能用 require：本门禁是 ESM，`require` 未定义 ⇒
     *   该表达式恒抛 ⇒ AER 退化成 null ⇒ B4 整段静默跳过。
     *   这正是本仓最贵的形态：判据写了、看着在守，实际因为取不到比较对象而**恒不报**。） */
    const AER = AssertionError;
    const catchOf = (fn) => { try { fn(); return null; } catch (e) { return e; } };
    const msgOf = (e) => String((e && e.message) || '');

    // B3 正路：恰中 1 次的字符串锚点必须真的改坏源码
    const ok = catchOf(() => K.breakOnce('const a = 1;', 'const a = 1;', 'const a = 2;'));
    if (ok) fails.push('B3 正路（恰中 1 次）不该抛：' + msgOf(ok));

    // B1 零命中 / 多命中必须拒绝（字符串锚点）
    const e0 = catchOf(() => K.breakOnce('abc', 'zzz', 'x'));
    if (!e0) fails.push('B1 零命中未拒绝（锚点打偏却放行 = 判据会作用在原文件上）');
    else if (!/锚点命中[ \t]*0[ \t]*次/.test(msgOf(e0)) && !/命中[ \t]*0[ \t]*次/.test(msgOf(e0))) {
        fails.push('B1 零命中拒绝了但读数不对（未报 0 次）：' + msgOf(e0).slice(0, 120));
    }
    const e2 = catchOf(() => K.breakOnce('abcabc', 'abc', 'x'));
    if (!e2) fails.push('B1 多命中未拒绝（不是定点的破坏 = 负控制测的不是那个点）');
    else if (!/锚点命中[ \t]*2[ \t]*次/.test(msgOf(e2))) {
        fails.push('B1 多命中读数不对（未报 2 次）：' + msgOf(e2).slice(0, 120));
    }

    // B2 同值替换必须拒绝（最隐蔽的一形：破坏副本 == 原件）
    const eSame = catchOf(() => K.breakOnce('abc', 'abc', 'abc'));
    if (!eSame) fails.push('B2 同值替换未拒绝（破坏副本等于原件 ⇒ 负控制退化成对原文件断言）');
    else if (!/必须真的改变源码/.test(msgOf(eSame))) {
        fails.push('B2 同值替换拒绝了但未说「必须真的改变源码」：' + msgOf(eSame).slice(0, 120));
    }

    // B2 正则锚点形态：命中数必须**真的数得出来**（v3175 漏 g 的历史漏洞就在这）
    const r0 = catchOf(() => K.breakOnce('abab', /zz/, 'x'));
    if (!r0) fails.push('B2 正则锚点零命中未拒绝');
    const r2 = catchOf(() => K.breakOnce('abab', /ab/, 'x'));
    if (!r2) fails.push('B2 正则锚点多命中（2 次）未拒绝 —— 命中数恒为 1 的空转形态（match 漏 g）');
    else if (!/锚点命中[ \t]*2[ \t]*次/.test(msgOf(r2))) {
        fails.push('B2 正则锚点多命中读数不对（未报 2 次）：' + msgOf(r2).slice(0, 120));
    }
    const rOk = catchOf(() => K.breakOnce('const a=1; const b=2;', /const a=1;/, 'const a=9;'));
    if (rOk) fails.push('B3 正则锚点正路（恰中 1 次）不该抛：' + msgOf(rOk));

    // B4 抛出类型必须是 AssertionError（30+ 处历史断言面按类型断言）
    for (const [label, e] of [['零命中', e0], ['同值替换', eSame], ['正则多命中', r2]]) {
        if (!e || !AER) continue;
        if (!(e instanceof AER)) fails.push('B4 ' + label + '的抛出不是 AssertionError（实 ' + e.constructor.name + '）：按类型断言的历史断言面会静默改义');
    }

    // B5 消息必须同时含历史出现过的措辞（改措辞 = 改全仓接收口径）
    const all = [msgOf(e0), msgOf(e2), msgOf(eSame)].join(' | ');
    for (const w of ['拒绝破坏', '锚点命中', '恰中 1 次', '要求恰好 1 次', '锚点应恰好命中 1 次', '必须真的改变源码', '命中 0 次', '命中 2 次']) {
        if (!all.includes(w)) fails.push('B5 消息面缺历史措辞「' + w + '」（同源之后接收方仍须按原正则成立）');
    }
    // 空锚点必须拒绝（任何源码都命中，等于没有定点）
    const eEmpty = catchOf(() => K.breakOnce('abc', '', 'x'));
    if (!eEmpty) fails.push('B1 空锚点未拒绝（空串在任何源码上都命中，等于没有定点）');
    return fails;
}
const origFails = behaviorChecks(KIT);
if (origFails.length) {
    /* 归因：真源**就是被检物** —— 它的行为不符是「真缺陷」（要改的是它），
     * 不是结构漂移（要改门禁）。
     *   【留痕】首版写成 exit 2，于是 N1–N4 四组自证实测全部拿到 status=2 而非期望的 1：
     *   破坏确实生效了，但归因错档 —— 负控制「翻红了但不是本组归因」。
     *   2 只留给「探测对象不在/读数不可信」（真源缺失/不可加载/导出面缺项/别名不同一/扫描面塌）。 */
    console.error('[break-kit] 唯一真源行为不符（' + origFails.length + ' 项）—— 真缺陷（被检物是 ' + KIT_REL + '）：');
    for (const f of origFails) console.error('  x ' + f);
    process.exit(1);
}

/* ---------- C 接线面 ---------- */
const testsFiles = fs.readdirSync(TESTS_DIR).filter((f) => f.endsWith('.mjs')).sort();
const auditFiles = fs.readdirSync(AUDIT_DIR).filter((f) => f.endsWith('.mjs')).sort();
const rels = testsFiles.map((f) => 'tests/' + f).concat(auditFiles.map((f) => 'tests/audit/' + f));
const sources = new Map();
for (const rel of rels) sources.set(rel, fs.readFileSync(path.join(HOME, rel), 'utf8'));

let receivers = 0;
let msgFiles = 0;
const msgOffenders = [];
let defSites = 0;
for (const rel of rels) {
    if (rel === KIT_REL) continue;
    /* 观测器不在本门禁的扫描面内（理由见 NEGCTL_REL 声明处）。 */
    if (rel === NEGCTL_REL) continue;
    const src = sources.get(rel);
    /* 一律在**剥注释后**的代码上判：注释里出现 `breakSource(14)` 这类说明文字
     *   不是「在本地重写工具」，也不是「在调用工具」。 */
    const code = stripComments(src);
    // C1 不得本地重写破坏工具的出口
    const m = RECEIVE_NAME_RE.exec(code);
    if (m) {
        bad('C1 ' + rel + ' 仍在本地重写破坏工具「' + m[1] + '」（v3.247.0 已收敛到 ' + KIT_REL + '；调用点按原名接线，一行都不用改）');
    }
    const hasKit = KIT_IMPORT_RE.test(code);
    if (hasKit) receivers++;
    // C2 期望抛出的地方，出口必须同源；消息字面量应收在真源一处
    if (CALL_SITE_RE.test(code)) {
        defSites++;
        if (!hasKit) {
            bad('C2 ' + rel + ' 调用了破坏工具，却未从唯一真源 import（出口将随本地实现漂移）');
        } else {
            /* 仍在正文里手抄消息字面量。
             *   【留痕】首版写成 `!MSG_LITERAL_RE.test(src) && !/BREAK_MSG|拒绝破坏…/` ——
             *   后一项的 `|` 两侧里 `拒绝破坏` 什么都不依赖，整个判据退化成
             *   「字符串里出现 BREAK_MSG 即判绿」，手抄「拒绝破坏」照样放行。
             *   本门禁自己规定「不靠正则猜结构」，却在这里踩了运算符优先级。
             *   本版收紧为：接了真源的文件，正文不得再出现任意消息字面量
             *   （确需例外者在该文件头显式登记，而不是让判据松一档）。 */
            /* 声明面只准一处：用于断言的正则片段必须是**真源消息构造的子串**。
             *   不能只看「出现了字面量」——`assert.throws(..., /拒绝破坏/)` 是接收方的法定用法，
             *   一个都改不得。要量的是「片段与拼装点是否同源」。 */
            for (const mm of [...code.matchAll(new RegExp(FRAG_RE.source, 'g'))]) {
                const frag = mm[1];
                /* 同源判定 = 片段里**写死的字符**必须全部来自真源拼出来的消息。
                 *   片段允许含正则元字符（`/锚点命中 \d+ 次/` 是接收方的合法写法 ——
                 *   它匹配的正是真源那条消息），故先剥掉元字符与转义再逐段核对；
                 *   只比整串会把这类片段误判成「不同源」（v3.247.0 实测：3 个文件被误报）。 */
                const fixed = frag.split(/\\[a-zA-Z]|[.*+?^${}()|[\]\\]/).filter((t) => t.trim() !== '');
                if (fixed.some((t) => !msgCorpus().includes(t))) {
                    msgFiles++;
                    if (msgOffenders.length < MAX_MSG_FILES) msgOffenders.push(rel + ' → /' + frag + '/');
                }
            }
        }
    }
}
if (msgFiles) {
    bad('C4 ' + msgFiles + ' 处断言片段写死了真源消息里没有的措辞（应与真源拼装点同源）：' + msgOffenders.join('、')
        + ' —— 消息口径若有两处可写，改一处漏一处是必然的');
}
/* NOT_SCOPE 登记：库源码里必须逐条写明「为什么不收」，否则下一个人会再收一遍 */
const kitSrc = sources.get(KIT_REL) || '';
for (const name of Object.keys(NOT_SCOPE)) {
    if (!kitSrc.includes(name)) bad('C3 唯一真源未登记不收敛项「' + name + '」（' + NOT_SCOPE[name] + '）—— 不写理由，下一轮会被再收一遍');
}

/* ---------- D 活性面 ---------- */
if (receivers < MIN_RECEIVERS) {
    drift('接收方只找到 ' + receivers + ' 个（下限 ' + MIN_RECEIVERS + '）：唯一真源没有接收方，本门禁证明不了任何东西');
}
if (defSites < MIN_DEFECT_SITES) {
    drift('「期望破坏拒绝」的判据点只找到 ' + defSites + ' 个（下限 ' + MIN_DEFECT_SITES
        + '）：出口同源面过小，口径漂移量不出来');
}
const runSrc = sources.get(RUN_REL) || '';
if (!/readdirSync\(AUDIT_DIR\)/.test(runSrc)) drift('run.mjs 的审计发现不再走 readdirSync(AUDIT_DIR)（活性面读数失去调用方）');
if (!/startsWith\('_'\)/.test(runSrc)) {
    bad('run.mjs 未排除下划线前缀文件：tests/_break_kit.mjs 会被当审计脚本执行（纯定义零调用即判绿）');
}
notes.push('D 接收方 ' + receivers + ' 个文件 import 唯一真源 ｜ 期望拒绝的判据点 ' + defSites + ' 个 ｜ 手抄消息 ' + msgFiles + ' 个');
if (drifts.length) reportDrift();

/* ---------- E 自证：真源码破坏 → 在破坏副本上重跑同批判据 → 必须翻红 ---------- */
/* 纪律：破坏必须落在**真源码**上（锚点恰中 1 次），判据必须在破坏副本上重跑；
 *   不得对原文件断言、不得把破坏写死成模拟常量。
 *   夹具走**整树复制**（tests/ 实测 4.5MB，复制约 1 秒）：
 *   「唯一真源」的接收方就是整仓 27 个文件，逐文件手抄清单正是本门禁要治的病
 *   （v3.246 的教训：清单该对齐加载图，不是对齐本次改动）。 */
const NC = [];
/* 自证夹具自身**不再写一份破坏实现**（本门禁治的就是这件事，自己带头守）：
 *   直接用真源出口破坏真源源码文本 —— 它是纯字符串函数，破坏自己的源码没有循环依赖，
 *   唯一前提是 KIT 已在 A 段从 HOME 真源码加载完成（此处确实已完成）。 */
const breakKit = (src, anchor, repl) => KIT.breakOnce(src, anchor, repl, 'scan_break_kit 自证');
function makeBrokenRoot(mutations) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha-breakkit-'));
    fs.cpSync(TESTS_DIR, path.join(dir, 'tests'), { recursive: true });
    let src = fs.readFileSync(path.join(HOME, KIT_REL), 'utf8');
    for (const [anchor, repl] of mutations) src = breakKit(src, anchor, repl);
    fs.writeFileSync(path.join(dir, KIT_REL), src);
    return dir;
}
function runGateAt(root, extraEnv) {
    const r = spawnSync(process.execPath, [path.join('tests', 'audit', 'scan_break_kit.mjs')], {
        cwd: root, encoding: 'utf8', timeout: 180000,
        env: Object.assign({}, process.env, { LONSHA_BREAK_KIT_HOME: root }, extraEnv || {}),
    });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function selfProof(name, mutations, expectHint, expectStatus) {
    let dir = null;
    try {
        dir = makeBrokenRoot(mutations);
        const r = runGateAt(dir);
        if (r.status !== expectStatus) {
            NC.push({ name, ok: false, why: '破坏后 status=' + r.status + '（期望 ' + expectStatus + '）' + (expectHint && !r.out.includes(expectHint) ? '，且未点名「' + expectHint + '」' : '') });
        } else if (expectHint && !r.out.includes(expectHint)) {
            NC.push({ name, ok: false, why: 'status 对了但未点名「' + expectHint + '」（翻红不是本组归因）' });
        } else {
            NC.push({ name: name, ok: true, why: 'status=' + r.status + ' 且点名「' + expectHint + '」' });
        }
    } catch (e) {
        NC.push({ name, ok: false, why: '夹具异常：' + e.message });
    } finally {
        if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
}
/* N0 卫生态对照：原版必须绿（只验破坏会翻红，会把「破坏写死成模拟常量」判成绿） */
{
    const okFails = behaviorChecks(KIT);
    if (okFails.length) NC.push({ name: 'N0 卫生态对照（原版）', ok: false, why: '原版判据已红：' + okFails[0] });
    else NC.push({ name: 'N0 卫生态对照（原版）', ok: true, why: '原版 ' + behaviorChecks(KIT).length + ' 项判据全绿（破坏若无效将无处可怪）' });
}
/* N1–N4：逐口径破坏（每次只打一处，归因才可读） */
selfProof('N1 命中次数检查被摘', [['const n = s.split(a).length - 1;', 'const n = 1;']], 'B1 零命中', 1);
/* 锚点跟随真源当前实现：消息构造抽出后，同值检查只剩一行（读数与拼装仍分明）。 */
selfProof('N2 同值替换检查被摘', [['if (out === s) throwMsg(sameValueMessage(label, anchor));', 'if (false) throwMsg(sameValueMessage(label, anchor));']], 'B2 同值替换', 1);
selfProof('N3 正则命中计数被钉死（v3175 漏 g 的历史形态）', [['(s.match(new RegExp(anchor.source, \'g\')) || []).length', '1']], 'B2 正则锚点多命中', 1);
selfProof('N4 抛出类型被换掉（AssertionError → Error）', [['throw new AssertionError({', 'throw new Error({']], 'B4 ', 1);
/* N5 工具两向自证：锚点不存在时自证夹具必须拒绝（否则「破坏没发生」会被当成「破坏无效」） */
{
    let ok = false;
    try { breakKit('const a = 1;', '绝不存在的锚点__break_kit__', ''); } catch (e) { ok = /命中 0 次/.test(e.message); }
    if (!ok) NC.push({ name: 'N5 自证夹具两向自证', ok: false, why: '锚点不存在时未拒绝破坏（自证可能对着原文件断言）' });
    else NC.push({ name: 'N5 自证夹具两向自证', ok: true, why: '锚点不存在即拒绝（自证不会静默变成空转）' });
}
/* N6 真接收方真跑：把出口摘成「不抛」，27 个接收方的「必须拒绝」断言必须整体翻红。
 *   这一组证的是**接收方真的在用这个出口**，而不是「门禁自己觉得自己在守」。 */
{
    let dir = null;
    try {
        dir = makeBrokenRoot([
            ['const n = s.split(a).length - 1;', 'const n = 1;'],
            ['if (out === s) throwMsg(sameValueMessage(label, anchor));', 'if (false) throwMsg(sameValueMessage(label, anchor));'],
        ]);
        const relsRun = rels.filter((rel) => rel !== KIT_REL && KIT_IMPORT_RE.test(sources.get(rel)))
            .filter((rel) => rel.startsWith('tests/') && rel.endsWith('.test.mjs'))
            .slice(0, 40);
        if (relsRun.length < 3) {
            NC.push({ name: 'N6 真接收方真跑', ok: false, why: '可跑的接收方只有 ' + relsRun.length + ' 个（太少，证不了出口承重）' });
        } else {
            const r = spawnSync(process.execPath, ['--test'].concat(relsRun), {
                cwd: dir, encoding: 'utf8', timeout: 300000,
                /* 【夹具自身的缺陷，v3.247.0 实测踩到】N6 的子 `node --test` 必须跑在**干净环境**里。
                 *   本门禁在 v3159 `[2d]` 里是被外层 `node --test` 拉起的，进程环境带着
                 *   `NODE_TEST_CONTEXT`；原样继承时 Node 递归保护会把子 runner **整体跳过** ——
                 *   实测 stdout 只有一句
                 *     `Warning: node:test run() is being called recursively within a test file. skipping running files.`
                 *   退出码 0 ⇒ 本组读成「28 个接收方全绿」⇒ N6 报假红（红的是夹具，不是判据）。
                 *   更贵的是它在**两种调用路径下结论相反**（单跑绿、在 v3159 夹具里红），
                 *   而那种「有时红有时绿」正是让人开始不信判据的形态。
                 *   修法与 v3241/v3243/v3205 逐字同形（它们都吃过同一口）。 */
                env: (() => {
                    const env = Object.assign({}, process.env, { LONSHA_BREAK_KIT_HOME: dir });
                    for (const k of Object.keys(env)) if (k === 'NODE_OPTIONS' || k.startsWith('NODE_TEST')) delete env[k];
                    return env;
                })(),
            });
            const out = (r.stdout || '') + (r.stderr || '');
            const fails = (out.match(/^# fail [0-9]+$/m) || [''])[0];
            if (r.status === 0) {
                NC.push({ name: 'N6 真接收方真跑', ok: false, why: '出口摘成不抛之后，' + relsRun.length + ' 个接收方**全绿**：它们的「必须拒绝」断言没有证明力'
                    + ' ｜ 实测输出尾部：' + out.replace(/\s+/g, ' ').slice(-600) });
            } else {
                NC.push({ name: 'N6 真接收方真跑', ok: true, why: relsRun.length + ' 个接收方在破坏副本上转红（' + (fails || 'status=' + r.status) + '）' });
            }
        }
    } catch (e) {
        NC.push({ name: 'N6 真接收方真跑', ok: false, why: '夹具异常：' + e.message });
    } finally {
        if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
}
const negFailed = NC.filter((n) => !n.ok);

/* ---------- 报告 ---------- */
console.log('[break-kit] 唯一真源 ' + KIT_REL + ' ｜ 导出面 ' + KIT_API.length + ' 项（含三别名同一函数对象）');
console.log('[break-kit] 行为面：4 口径 + 2 锚点形态（字符串 / 正则）全通过');
for (const n of notes) console.log('  · ' + n);
for (const n of NC) console.log('  ' + (n.ok ? 'ok ' : 'x  ') + n.name + '：' + n.why);
if (drifts.length) reportDrift();
if (negFailed.length) {
    console.error('[break-kit] ' + negFailed.length + ' 组自证失败：');
    for (const n of negFailed) console.error('  x ' + n.name + '：' + n.why);
    process.exit(1);
}
if (defects.length) {
    console.error('[break-kit] ' + defects.length + ' 项真缺陷：');
    for (const d of defects) console.error('  x ' + d);
    process.exit(1);
}
console.log('[break-kit] 通过：破坏形态收敛到唯一真源（' + receivers + ' 个接收方 / ' + defSites
    + ' 个判据点），四条口径由真源码破坏自证（' + NC.length + ' 组，含接收方真跑）。');
process.exit(0);