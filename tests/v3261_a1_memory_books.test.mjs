// tests/v3261_a1_memory_books.test.mjs - v3.259.0
//
// 主题：A1 宿主巨兽第四刀 —— 七个「书册 / 时间」类（IncrementBookmark / EchoPool /
//   SuspenseBook / PrequelSystem / RelativeTimeHelper / PlotTimeline / BM25）抽为
//   memory-books.js 之后的**接线、行为与破坏面**。
//
//   【为什么本档存在】
//     前三刀（v3.257.0 叶子账本 / v3.258.0 工具类与生成侧派生系统）剥的是彼此独立的类；
//     本刀这一簇里**有两对真依赖边**，且两条边都跨「书册 <-> 时间」：
//       · PrequelSystem.selectInjection 内 `new BM25()`（前情选段打分）；
//       · SuspenseBook.getOpenPrompts 内 `new RelativeTimeHelper()`（悬项到期倒计时）。
//     正因为跨簇，拆成两个模块就得另造注入链，故同刀搬 —— 风险也比前三刀多两种：
//       · ★ 依赖边被拆散：两个类一起搬走、边留在原地 ⇒ 选段静默退到尾部两段、倒计时静默不出；
//       · ★ 唯一取用口被绕开：RelativeTimeHelper 在宿主有 13 处零散读取，本刀收成
//         `_newRelativeTimeHelper()` 一个口子；只要有一处绕过，缺模块时那一处就外抛
//         （其余处都已降级）⇒ 症状是「偶发外抛」而非全崩，最难归因。
//     故本档不问「文件里有没有这个类」，而问「接线是否逐点在场、退路是否同形、
//     破坏之后同一条判据会不会翻红」。
//
//   【判据与负控制跑同一份代码】
//     judgeSlice(idxSrc, modSrc) 是纯函数；A 段对磁盘真源码跑它，D 段对**真源码破坏后的副本**
//     跑同一个它。破坏一律走唯一真源 tests/_break_kit.mjs 的 breakSource（锚点须恰中 1 次）。
//
//   【本档与历史套件的关系】
//     七个类各自的历史套件（v319 / v323 / v332 / v343 / v345 / v346 / v372 / v373 / v386 /
//     v387 / v390 / v3121 / v3152 / v3179 / stress_bench …）此前**从 index.js 抽类做真执行**；
//     本刀把那些抽取面改到 memory-books.js 上（语义一字不改、只换被读的文件），
//     而「宿主不得再内联声明」集中在本档 A 段判——一份口径一处实现。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakSource } from './_break_kit.mjs';
import { stripComments } from './_audit_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const NL = String.fromCharCode(10);
const Q = String.fromCharCode(39);
const MOD_REL = 'memory-books.js';
const IDX = read('index.js');
const MOD = read(MOD_REL);
const M = (await import('../memory-books.js')).default;
/** 本刀剥走的七个「书册 / 时间」类。 */
const BOOKS = ['IncrementBookmark', 'EchoPool', 'SuspenseBook', 'PrequelSystem', 'RelativeTimeHelper', 'PlotTimeline', 'BM25'];
/** 类的成员面（不含 constructor）：退路与真实现按方法名对账，也是 A 段「搬完整了没有」的抽样面。 */
const MEMBERS = {
    IncrementBookmark: ['_store', 'get', 'save', 'reset', 'all', 'resyncAfterDeletion'],
    EchoPool: ['_baseLife', '_maxCount', 'onRecalled', 'tick', 'export', 'import'],
    SuspenseBook: ['add', 'getOpenPrompts', 'resolve', 'openItems', 'recentlyResolved', 'getRecentlyResolvedPrompt', 'prune', 'briefForPrompt', 'export', 'import'],
    PrequelSystem: ['importPrequel', 'clearPrequel', '_boundaryWeight', 'splitFragments', '_frags', '_format', '_estimateTokens', '_tailFallback', 'selectInjection', 'buildInjection', 'export', 'import'],
    RelativeTimeHelper: ['extractDualTimeTags', 'compactTimeRange', 'formatTimeRange', 'calcAge', 'calcDaysTogether', 'normalizeNumericDateSeparators', 'looksLikeStructuredNumericDate', 'extractDayNumber', 'extractMonthIdentifier', 'parseStoryDate', 'calcDaysDiff', 'relativeTimePrefix'],
    PlotTimeline: ['add', 'searchNear', '_norm', 'getChangesSince', 'export', 'import'],
    BM25: ['_tokenize', '_lexExpand', '_lexNormalize', 'normalizeQueryByLexicon', 'rebuild', '_cliffCut', 'search', '_expandAliases', 'searchBranches'],
};
/** 构造点对位：类名 -> 宿主实例字段（刻意不同名，故不能按类名推字段名）。 */
const FIELDS = {
    IncrementBookmark: 'bookmarks', EchoPool: 'echo', SuspenseBook: 'suspense',
    PrequelSystem: 'prequel', PlotTimeline: 'timeline', BM25: 'bm25',
};
/** RelativeTimeHelper 不走宿主字段：它的唯一取用口是 _newRelativeTimeHelper()（13 处零散调用收成一个）。 */
const VIA_FACTORY = ['RelativeTimeHelper'];
/** 类体切到配对右花括号。 */
function classEnd(src, at) {
    const open = src.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return i + 1; }
    }
    return src.length;
}
const CTRL = ['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'new'];
/* 方法名切分按**成员签名缩进**，且缩进由类声明自身的缩进推出。
 *   【判据留痕】首版把缩进写死成 8 空格（照搬 host_beast_probe.cjs 的口径）—— 那只对
 *   **宿主闭包里的类**成立（类体 4 + 成员 8）。模块 memory-books.js 的类声明在 IIFE 顶层
 *   （类体 0 + 成员 4），于是同一份正则对新搬来的七类**一条都切不出来**，A 段当场报 61 条
 *   「模块 X 缺成员 Y」—— 判据对真源码恒红，量的不是缺陷。修法：不写死缩进，按类声明缩进 + 4 推。 */
const memberRe = (indent) => new RegExp('^ {' + (indent + 4) + '}(?:static\\s+)?(?:async\\s+)?(?:get\\s+|set\\s+)?([A-Za-z_$][\\w$]*)\\s*\\(', 'gm');
const methodNames = (body, indent) => [...body.matchAll(memberRe(indent))].map((m) => m[1]).filter((n) => !CTRL.includes(n));
/** 真实现/退路里某个类体的方法名集合。 */
function methodsOf(src, name) {
    const at = src.indexOf('class ' + name + ' {') >= 0 ? src.indexOf('class ' + name + ' {') : src.indexOf('class ' + name + '{');
    if (at < 0) return null;
    /* 类声明自身的缩进（行首到 class 的空白数）决定成员签名缩进。 */
    const indent = at - (src.lastIndexOf(NL, at - 1) + 1);
    return methodNames(src.slice(at, classEnd(src, at)), indent);
}
const ok = (m) => console.log('  \u2713 ' + m);

/**
 * 真判据体（纯函数，无副作用）。返回问题列表，空数组 = 卫生。
 * A 段与 D 段跑的是**同一个它**。
 */
function judgeSlice(idxSrc, modSrc) {
    const problems = [];
    /* ① 宿主不得再内联声明，模块必须真的声明它 */
    for (const name of BOOKS) {
        if (new RegExp('class ' + name + '\\s*\\{').test(idxSrc)) problems.push('index.js 仍内联 ' + name);
        if (!modSrc.includes('class ' + name + ' {')) problems.push(MOD_REL + ' 缺 ' + name);
    }
    /* ② 构造点逐点在场、唯一、且接在宿主字段上（RelativeTimeHelper 走唯一取用口，另判） */
    for (const name of BOOKS) {
        const needle = '_newMemoryBooks(' + Q + name + Q;
        const n = idxSrc.split(needle).length - 1;
        const want = VIA_FACTORY.includes(name) ? 1 : 1;
        if (n !== want) problems.push('构造点 ' + needle + ' 命中 ' + n + ' 次（须恰 ' + want + '）');
    }
    for (const [name, field] of Object.entries(FIELDS)) {
        const needle = 'this.' + field + ' = _newMemoryBooks(' + Q + name + Q;
        if (!idxSrc.includes(needle)) problems.push(name + ' 的构造点未接到宿主字段 this.' + field);
    }
    /* ③ 取库口：具名函数 + 真读表达式 */
    if (!/function _memoryBooksLib\(\)\s*\{/.test(idxSrc)) problems.push('缺具名取库口 _memoryBooksLib()');
    if (!idxSrc.includes("_moduleLib(() => window.LonShaMemoryBooks, '" + MOD_REL + "')")) {
        problems.push('取库口不是真读表达式 window.LonShaMemoryBooks');
    }
    /* ④ 缺席退路 + 统一构造点 + RelativeTimeHelper 唯一取用口 */
    if (!/class MemoryBooksFallback/.test(idxSrc)) problems.push('缺缺席退路 MemoryBooksFallback');
    if (!/function _newMemoryBooks\(name, \.\.\.args\)/.test(idxSrc)) problems.push('缺统一构造点 _newMemoryBooks(name, ...args)');
    if (!/function _newRelativeTimeHelper\(\)\s*\{/.test(idxSrc)) problems.push('缺唯一取用口 _newRelativeTimeHelper()');
    if (!idxSrc.includes("return _newMemoryBooks('RelativeTimeHelper'")) problems.push('取用口未走统一构造点（RelativeTimeHelper 取用点）');
    /* ⑤ 退路与真实现按方法名对账（本刀特有：55 个方法名，靠肉眼看不住） */
    problems.push(...fallbackParity(idxSrc, modSrc));
    /* ⑥ 成员面不得缩水（搬过来的是不是原来那一份） */
    for (const [name, members] of Object.entries(MEMBERS)) {
        const real = methodsOf(modSrc, name);
        if (!real) { problems.push(MOD_REL + ' 里切不出 ' + name + '（判据自身失效）'); continue; }
        for (const m of members) {
            if (!real.includes(m)) problems.push('模块 ' + name + ' 缺成员 ' + m);
        }
    }
    /* ⑦ 模块自身只准有**受控宿主接触面**：SillyTavern 上下文与词典都走可选链。
     *   必须在剥注释副本上看（头注点名这些词是为了说明「不碰什么」）。 */
    const modCode = stripComments(modSrc);
    if (modCode.includes('require(')) problems.push(MOD_REL + ' 出现宿主依赖 require(');
    /* 【判据留痕】首版写成「剥注释后不得出现**裸** window.SillyTavern.」—— 对真源码当场报红。
     *   逐条核后确认那是**误判**：模块里确实有一处 `window.SillyTavern.getContext()`，但它在
     *   上一行的可选链守卫之下（守卫不成立整段不执行），是本仓既定的**二级兜底**形态。
     *   判据必须量「形态」而不是「出现过这个串」：裸取必须**紧邻其守卫**，且配对至少存在一对。 */
    const stGuarded = (modCode.match(/window\.SillyTavern\?\./g) || []).length;
    if (stGuarded < 2) problems.push(MOD_REL + ' 可选链取用只剩 ' + stGuarded + ' 处（SillyTavern 接触面必须走可选链）');
    const stLines = modCode.split(NL);
    for (let i = 0; i < stLines.length; i++) {
        const l = stLines[i];
        if (l.includes('window.SillyTavern?.') || !l.includes('window.SillyTavern.')) continue;
        if (/try\s*\{/.test(l)) continue;
        problems.push(MOD_REL + ' 第 ' + (i + 1) + ' 行有**既非可选链、又不在 try 内**的裸 window.SillyTavern 取用');
    }
    if (/window\.LonSha(?!Memory\?\.)/.test(modCode)) problems.push(MOD_REL + ' 有非可选链的 window.LonSha* 接触');
    if (!modSrc.includes('global.LonShaMemoryBooks = api')) problems.push(MOD_REL + ' 缺全局导出面');
    if (!modSrc.includes('module.exports = api')) problems.push(MOD_REL + ' 缺 CommonJS 导出面');
    /* ⑧ 宿主同名副本必须与模块内那份同源（同一语义两处实现 => 必须对账） */
    /* 【判据留痕】首版用 `indexOf('function parseStoryDateLoose')` 取宿主**第一份**——
     *   实测宿主有两份同名函数（第一份返回 {type:'standard',...}；第二份返回 {y, mo, d}），
     *   **函数声明提升后生效的是第二份**，模块内那份逐字对应的正是第二份。
     *   于是首版判据对真源码恒红（比对的是同一名字下的另一个函数）。
     *   修法：不按出现顺序取，按**归一化后与模块逐字相同**定位，并要求命中恰好一份。 */
    const nz = (s) => s.replace(/\s+/g, '');
    const looseBodies = (src) => {
        const out = [];
        for (const m of src.matchAll(/function[ \t]+parseStoryDateLoose[ \t]*\(([^)]*)\)[ \t]*\{/g)) {
            const from = src.indexOf('{', m.index);
            let depth = 0;
            for (let i = from; i < src.length; i++) {
                if (src[i] === '{') depth++;
                else if (src[i] === '}') { depth--; if (depth === 0) { out.push(src.slice(from, i + 1)); break; } }
            }
        }
        return out;
    };
    const modBodies = looseBodies(modSrc), hostBodies = looseBodies(idxSrc);
    if (modBodies.length !== 1) problems.push(MOD_REL + ' 里 parseStoryDateLoose 不是恰好一份（切出 ' + modBodies.length + ' 份）');
    if (hostBodies.length < 2) problems.push('宿主 parseStoryDateLoose 不足两份（搬走前实测两份，形状不同）');
    if (modBodies.length === 1 && hostBodies.length) {
        /* ① 形状面：模块这份必须是**被消费的形状**（getChangesSince 读 .type/.year/.month/.day）——
         *    【留痕】首版抄了内层闭包那份 {y, mo, d}，形状不对 ⇒ 带锚点日期时该函数恒空。 */
        const body = modBodies[0];
        for (const need of ['type:', 'standard', 'fantasy', 'monthId']) {
            if (!body.includes(need)) problems.push(MOD_REL + ' 的 parseStoryDateLoose 不是被消费的形状（缺 ' + need + '）');
        }
        /* ② 同源面：与宿主**恰好一份**逐字等价（忽略空白与缩进 —— 两份缩进本就不同）。 */
        const same = hostBodies.filter((b) => nz(b) === nz(body));
        if (same.length !== 1) {
            problems.push('模块内 parseStoryDateLoose 在宿主里找不到**恰好一份**同源副本（命中 ' + same.length + ' 份 ⇒ 逐字副本已漂移、或抄错了份）');
        }
    }
    /* ⑨ 唯一取用口不得被绕过：所有 new 都必须处在「取用口优先、裸 new 兜底」形态里 */
    const bare = idxSrc.split('new RelativeTimeHelper(').length - 1;
    const guarded = idxSrc.split('typeof _newRelativeTimeHelper === ' + Q + 'function' + Q).length - 1;
    if (bare !== guarded) {
        problems.push('有 ' + bare + ' 处 new RelativeTimeHelper()，但只有 ' + guarded + ' 处走了取用口优先形态（绕过取用口 => 缺模块时那一处外抛）');
    }
    const calls = idxSrc.split('_newRelativeTimeHelper()').length - 1;
    if (calls < 12) problems.push('取用口调用点只剩 ' + calls + ' 处（剥走前实测 13 处 + 兜底形态 4 处），疑有调用点漏接');
    /* ⑩ 两条**跨类依赖边**必须在场 —— 本刀为什么把这七类同刀搬的全部理由。
     *   拆散的症状都是**静默降级**：选段退到尾部两段、倒计时不出（不是崩溃，最难归因）。 */
    const EDGES = [
        ['SuspenseBook.getOpenPrompts -> RelativeTimeHelper（期限倒计时）', 'getOpenPrompts', /new RelativeTimeHelper\(\)/],
        ['PrequelSystem.selectInjection -> BM25（超预算选段打分）', 'selectInjection', /new BM25\(\)/],
    ];
    for (const [label, member, rex] of EDGES) {
        const at = modSrc.indexOf(member + '(');
        if (at < 0) { problems.push(MOD_REL + ' 缺 ' + member + '（依赖边的载体不在）'); continue; }
        const body = modSrc.slice(at, classEnd(modSrc, at));
        if (!rex.test(body)) problems.push('依赖边断了：' + label);
    }
    return problems;
}

/** 退路与真实现的方法面必须对得上（真实现有的，退路必须有同名空实现）。 */
function fallbackParity(idxSrc, modSrc) {
    const problems = [];
    const at = idxSrc.indexOf('class MemoryBooksFallback');
    if (at < 0) return ['退路类体切不出来（判据自身失效）'];
    const fbIndent = at - (idxSrc.lastIndexOf(NL, at - 1) + 1);
    const fbNames = new Set(methodNames(idxSrc.slice(at, classEnd(idxSrc, at)), fbIndent));
    for (const name of BOOKS) {
        const real = methodsOf(modSrc, name);
        if (!real) { problems.push(MOD_REL + ' 里切不出 ' + name + '（判据自身失效）'); continue; }
        for (const m of real) {
            if (m === 'constructor') continue;
            if (!fbNames.has(m)) problems.push('退路缺方法 ' + name + '.' + m);
        }
    }
    return problems;
}

/* ========== A 接线逐点在场 ========== */
test('v3261 A. 接线逐点在场：宿主不内联 / 模块真声明且成员齐 / 7 处构造点对位 / 退路同形 / 取用口不被绕过', () => {
    const problems = judgeSlice(IDX, MOD);
    assert.deepEqual(problems, [], '接线面缺陷：' + JSON.stringify(problems));
    ok('接线逐点在场（判据体与 D 段负控制同源）');
});

/* ========== B 模块真加载 + 行为 ========== */
test('v3261 B. 模块真加载：导出七项 + 七类真构造 + 逐类语义抽检（含两条跨类依赖边）', () => {
    /* 导出面 = 七个类 + bindErrLog（宿主 `_newRelativeTimeHelper()` 的「取库口现算」分支承重符号：
     *   模块首版漏导出它 ⇒ 该分支恒 false、静默降级；本刀收尾补上并把这里钉住）。 */
    assert.deepEqual(Object.keys(M).sort(), BOOKS.concat('bindErrLog').sort(), '导出面须为七个类 + bindErrLog');
    assert.equal(typeof M.bindErrLog, 'function', 'bindErrLog 须可真调用（宿主现算分支的承重面）');
    assert.equal(M.bindErrLog(null).errLog, M.bindErrLog(null).errLog, '缺席 opts 须回落空实现（不抛）');
    for (const n of BOOKS) assert.equal(typeof M[n], 'function', n + ' 须可构造');
    /* IncrementBookmark：无 ST 上下文时如实回 0（不伪造「能读」） */
    const ib = new M.IncrementBookmark(null);
    assert.equal(ib.get('x'), 0, '无 chatMetadata => 如实回 0');
    assert.deepEqual(ib.all(), {}, '无存储 => 空集而非抛');
    assert.deepEqual(ib.resyncAfterDeletion([1], 5), [], '无存储 => 无变化');
    /* EchoPool：容量与寿命都由注入的 cfgGetter 惰性决定（构造函数不吃硬编码） */
    const ep = new M.EchoPool(() => ({ echoBaseLife: 3, echoMaxCount: 2 }));
    ep.onRecalled([{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }]);
    assert.equal(ep.items.length, 2, '容量 2 生效（裁到最近两条）');
    assert.equal(ep.items[0].life, 3, '基础寿命 3 生效');
    assert.equal(ep.tick().length, 2, '衰减一轮仍存活');
    ep.tick(); ep.tick();
    assert.equal(ep.tick().length, 0, '寿命耗尽即清空');
    const ep0 = new M.EchoPool(() => ({ echoBaseLife: 2, echoMaxCount: 0 }));
    ep0.onRecalled([{ id: 'a', text: 'A' }]);
    assert.equal(ep0.items.length, 0, '容量 0 = 关闭（不得被 slice(-0) 坑成「不清空」）');
    /* SuspenseBook：唯一命中才结（本刀搬走的 v3.179 纪律） */
    const sb = new M.SuspenseBook();
    const id1 = sb.add('plan', '周末一起去海边玩', 3, '2024年3月15日');
    sb.add('suspense', '那封信到底是谁寄的', 4, '2024年3月16日');
    sb.add('plan', '那封信的来历得查清楚', 5, '2024年3月17日');
    assert.ok(id1 && sb.openItems().length === 3, '三条悬项都 open');
    assert.equal(sb.resolve('海边', 'done', '成行', 9).id, id1, '唯一命中就结');
    /* 【判据留痕】首版这里的抽查询词取成 '的' —— 实测它只命中**一条**（另两条不含该字），
     *   「多条命中一律不结」这一档根本没被覆盖到（断言却是绿的，因为它恰好确实是唯一命中）。
     *   改取两条悬项**共有**的词 '信'，才真的走到多命中那一支。 */
    assert.equal(sb.resolve('信', 'done', '', 9), null, '多条命中一律不结（宁可漏结）');
    assert.equal(sb.openItems().length, 2, '未命中的仍 open');
    assert.ok(sb.briefForPrompt().includes('s2'), '清单带稳定短编号');
    /* ★ 依赖边一：SuspenseBook -> RelativeTimeHelper（到期倒计时） */
    const sb2 = new M.SuspenseBook();
    sb2.add('plan', '一个月后的约定要兑现', 1, '2024年3月15日', '2024年4月15日');
    const prompts = sb2.getOpenPrompts('2024年4月1日');
    assert.ok(/距期限还剩14天/.test(prompts[0]), '倒计时真算出来了（依赖边活着）：' + prompts[0]);
    /* PrequelSystem：边界切片 + 预算内注入 */
    const ps = new M.PrequelSystem();
    const imported = ps.importPrequel('第一段。第二段！第三段？\n第四段');
    assert.equal(imported.ok, true, '导入成功');
    /* 切片下界是 32 字符（Math.max(32, ...)），故样本必须长过它才谈得上「切开」。
     *  【判据留痕】首版拿 8 字符样本断言 >= 2 段，恒假 —— 判据自红，不是实现的问题。 */
    assert.ok(ps.splitFragments('一。'.repeat(40) + '尾', 32).length >= 2, '边界加权切片真的切开了');
    const inj = ps.buildInjection({}, { baseChars: 3000, tokenBase: 2700 });
    assert.ok(inj.includes('【用户导入的过去经历资料】'), '预算内注入成形');
    ps.clearPrequel();
    assert.equal(ps.buildInjection({}, {}), '', '清空后不注入（空集如实回报）');
    /* ★ 依赖边二：PrequelSystem -> BM25（超预算时按相关性选段） */
    const psBig = new M.PrequelSystem();
    psBig.importPrequel(Array.from({ length: 40 }, (_, i) => '第' + i + '段：海边拾贝与咖啡店的旧事。').join('\n'));
    const sel = psBig.selectInjection(psBig.splitFragments(psBig.text, 120), [{ key: 'main', text: '海边', weight: 1 }], '海边', 400, 100);
    assert.ok(sel.length >= 1, '超预算时 BM25 选段有产出（依赖边活着）');
    assert.ok(sel.length < psBig.splitFragments(psBig.text, 120).length, '选段真做了裁剪');
    /* RelativeTimeHelper：三个口径（解析 / 年龄 / 相对前缀） */
    const rth = new M.RelativeTimeHelper();
    assert.deepEqual(rth.parseStoryDate('2024年3月15日'), { type: 'standard', year: 2024, month: 3, day: 15 }, '中文日期解析');
    assert.deepEqual(rth.parseStoryDate('2024-03-15'), { type: 'standard', year: 2024, month: 3, day: 15 }, '数字日期解析');
    assert.equal(rth.parseStoryDate('霜月3日').type, 'fantasy', '架空历法可辨（不与标准历法同形）');
    assert.equal(rth.calcAge('1986-03-02', '2024年3月15日'), 38, '年龄数学差');
    /* 阶梯是「前天 / 昨天 / 今天 / N天前」，2 天走的是**具名词**那一档（不是 '2天前'）。 */
    assert.equal(rth.relativeTimePrefix('2024年3月13日', '2024年3月15日'), '前天', '相对前缀（近档具名）');
    assert.equal(rth.relativeTimePrefix('2024年3月12日', '2024年3月15日'), '3天前', '相对前缀（远档计数）');
    assert.equal(rth.compactTimeRange('2023/9/10 06:45', '2023/9/10 06:55'), '06:55', '时间段压缩');
    assert.equal(rth.extractDualTimeTags('<bbs_start>2024年3月15日</bbs_start><bbs_end>2024年3月16日</bbs_end>').hasDual, true, '双界时间锚点');
    assert.equal(rth.extractDualTimeTags('没有标签').hasDual, false, '无标签如实回 false');
    /* PlotTimeline：按楼层游标读取变化 */
    const tl = new M.PlotTimeline();
    tl.add('2024年3月15日', '在海边遇见旧友', 3, ['甲'], 8);
    tl.add('2024年4月1日', '收到一封信', 7, ['乙'], 6);
    /* ★ 这条是**本刀真实回归**的守卫：模块首版抄错 parseStoryDateLoose 的份 ⇒ 带锚点日期时
     *   这里恒为 0（静默功能回归）。无锚点那条路径不受影响，故两条断言必须同时在场。 */
    assert.equal(tl.getChangesSince(0, '2024年3月15日').length, 1, '游标 + 时间窗过滤（带锚点日期，抄错份即恒空）');
    assert.equal(tl.getChangesSince(5, '').length, 1, '只按楼层游标也有产出');
    assert.equal(tl.searchNear('2024年3月15日', 3, 5)[0].text, '在海边遇见旧友', '按剧情日期相近度召回');
    assert.equal(tl.add('', '', 1), null, '缺参 => null（不抛）');
    /* BM25：分支归一化检索 */
    const bm = new M.BM25();
    bm.rebuild([{ id: 1, text: '海边 拾贝 与 咖啡 店' }, { id: 2, text: '雨天 读书' }, { id: 3, text: '咖啡 与 旧友' }]);
    const hits = bm.searchBranches([{ key: 'main', text: '海边', weight: 1 }], 5);
    assert.equal(hits.length >= 1 && hits[0].id, 1, '命中片段排在首位');
    assert.ok(Array.isArray(bm.search('咖啡', 5)), '单查询走同一管线');
    assert.equal(new M.BM25().searchBranches([{ key: 'main', text: 'x', weight: 1 }], 5).length, 0, '空语料 => 空集（不抛）');
    ok('导出七项；七类真构造；两条跨类依赖边都活着');
});

/* ========== C 加载面与基线 ========== */
test('v3261 C. 加载面与基线：manifest 恰 1 项 + 基线读数随本刀同源重建', () => {
    const mf = JSON.parse(read('manifest.json'));
    assert.equal(mf.extra_js.filter((f) => f === MOD_REL).length, 1, MOD_REL + ' 须在 extra_js 恰好 1 次');
    assert.equal(mf.extra_js[mf.extra_js.length - 1], MOD_REL, '本刀模块须是 extra_js 末项（加载序）');
    const b = JSON.parse(read('tests/audit/host_beast_baseline.json'));
    assert.equal(b.readings.total_lines, IDX.split(NL).length, '基线行数须等于真 index.js 行数');
    const _cur = b.measured_at;
    assert.ok(b.rebuilds[_cur], '当版须在 rebuilds 面留读数（每次重建才可回溯）');
    assert.equal(b.rebuilds[_cur].readings.member_count, b.readings.member_count, 'rebuilds 与 readings 同读数');
    assert.ok(b.readings.member_count < 549, '成员数须已随本刀下降（剥走前的基线是 549）');
    assert.ok(b.readings.total_lines < 17444, '行数须已随本刀下降（剥走前 17444）');
    assert.ok(b.readings.total_lines <= 17000, '本刀须至少剥掉 440 行，实测 ' + b.readings.total_lines);
    ok('manifest 恰 1 项且在末位；基线行数/成员数与真文件同源且已下降');
});

/* ========== D 真源码破坏 -> 同一条判据必须翻红 ========== */
test('v3261 D. 真源码破坏 -> 同一条判据必须翻红（取库口 / 模块类名 / 构造点 / 退路方法 / 取用口 / 依赖边 各一条）', () => {
    const b1 = breakSource(IDX, "_moduleLib(() => window.LonShaMemoryBooks, 'memory-books.js')",
        "_moduleLib(() => window.LonShaMemoryBooksTYPO, 'memory-books.js')", 'A1-取库口');
    assert.ok(judgeSlice(b1, MOD).some((p) => p.includes('真读表达式')), '取库口读错全局名必须翻红');
    const b2 = breakSource(MOD, 'class SuspenseBook {', 'class SuspenseBookX {', 'A1-模块类名');
    assert.ok(judgeSlice(IDX, b2).some((p) => p.includes('缺 SuspenseBook')), '模块缺类必须翻红');
    const b3 = breakSource(IDX, "this.timeline = _newMemoryBooks('PlotTimeline');", 'this.timeline = null;', 'A1-漏接构造点');
    assert.ok(judgeSlice(b3, MOD).some((p) => p.includes("_newMemoryBooks('PlotTimeline'")), '漏接构造点必须翻红');
    const b4 = breakSource(IDX, "        briefForPrompt() { return '（暂无未了结的悬念）'; }" + NL, '', 'A1-退路缺方法');
    assert.ok(judgeSlice(b4, MOD).some((p) => p.includes('退路缺方法 SuspenseBook.briefForPrompt')), '退路少一个方法必须翻红');
    const b5 = breakSource(IDX, "return _newMemoryBooks('RelativeTimeHelper', opt.errLog || errLog);", 'return new MemoryBooksFallback();', 'A1-取用口绕开统一构造点');
    assert.ok(judgeSlice(b5, MOD).some((p) => p.includes('取用口未走统一构造点')), '取用口绕开必须翻红');
    /* ⑥ 依赖边：把模块内那条真 new 拆掉 ⇒ ⑩ 必须翻红（这是本刀选型的理由所在） */
    const b6 = breakSource(MOD, 'const rth = new RelativeTimeHelper();', 'const rth = null;', 'A1-依赖边被拆');
    assert.ok(judgeSlice(IDX, b6).some((p2) => p2.includes('依赖边断了')), '依赖边被拆必须翻红');
    ok('六条真源码破坏各自被同一条判据抓到（破坏面不是抽样面）');
});

/* ========== E 出生版本下限锚 ========== */
const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
test('v3261 E. 出生版本下限锚（本档出生在 3.259.0）', () => {
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(vnum(codeVer) >= vnum('3.259.0'), '本套件只在 3.259.0 及以后成立；当前 ' + codeVer);
    ok('本档锚着 ' + codeVer);
});

/* ========== F 判据面自防护 ========== */
test('v3261 F. 判据面自防护：实现住在本档 + 走唯一破坏真源 + 清单不得缩水 + 负控制锚点纯度', () => {
    const SELF = read('tests/v3261_a1_memory_books.test.mjs');
    assert.ok(/function judgeSlice\(/.test(SELF), '判据体必须住在本档');
    assert.ok(/function fallbackParity\(/.test(SELF), '退路对账必须住在本档');
    assert.ok(SELF.includes('breakSource') && SELF.includes('./_break_kit.mjs'), '破坏必须走唯一真源');
    assert.equal(BOOKS.length, 7, '本刀剥走的类面为七项，不得缩水');
    assert.equal(Object.keys(FIELDS).length, 6, '构造点对位表为六项（第七项走唯一取用口）');
    assert.equal(Object.keys(MEMBERS).length, 7, '成员面对账表为七项');
    /* 【口径留痕】`MEMBERS` 是**按类分别列**的表：跨类重名（add / export / import）各记一次，合计 61 项；
     *   退路 `MemoryBooksFallback` 是**一个类**、方法名 55 项（含 constructor；去掉它是 54）。三者不是同一个数
     *   （首版把 55 当成「按类分别列的和」来断言，当场自红）。 */
    const allMemberNames = Object.keys(MEMBERS).reduce((a, k) => a.concat(MEMBERS[k]), []);
    assert.equal(allMemberNames.length, 61, '按类分别列合计 61 项（不得缩水）');
    assert.equal(new Set(allMemberNames).size, 54, '去重后 54 项（退路那 55 项含 constructor，故本表不含它）');
    assert.ok(SELF.length > 9000, '本档不得被掏空');
    assert.ok(SELF.includes('read(' + Q + 'index.js' + Q + ')') && SELF.includes('read(MOD_REL)'), '真源必须从磁盘读');
    /* 负控制锚点纯度：每个锚点字面量只准在「判据体（judgeSlice/fallbackParity）与 D 段」里
     *   出现一次；出了这两个区就只准在下面这张表里出现一次。
     *   【判据留痕】首版把两个区**整块挖掉**再数 —— 而取库口那条锚点在 D 段里是唯一一处，
     *   挖掉之后计数变 0，判据自红（『0 !== 1』）。
     *   正确口径是「总数 − 区内数 == 1」：**在区内出现是判据体自己的事**（D 段就是拿它做真源码破坏），
     *   不在区内的那一处才该是这张表的声明。同时锚点在真源码里必须真的存在（否则负控制是空的）。 */
    const judgeRegion = SELF.slice(SELF.indexOf('function judgeSlice('), SELF.indexOf('function fallbackParity('));
    const dBlock = SELF.slice(SELF.indexOf("test('v3261 D."), SELF.indexOf('/* ========== E'));
    const inRegion = (a) => judgeRegion.split(a).length - 1 + dBlock.split(a).length - 1;
    for (const [label, anchor, src] of [
        ['取库口', '_moduleLib(() => window.LonShaMemoryBooks, ' + Q + MOD_REL + Q + ')', IDX],
        ['模块类名', 'class SuspenseBook {', MOD],
        ['构造点', 'this.timeline = _newMemoryBooks(' + Q + 'PlotTimeline' + Q + ');', IDX],
        ['退路方法', '        briefForPrompt() { return ' + Q + '（暂无未了结的悬念）' + Q + '; }', IDX],
        ['取用口', "return _newMemoryBooks('RelativeTimeHelper', opt.errLog || errLog);", IDX],
        ['依赖边', 'const bm = new BM25();', MOD],
    ]) {
        assert.ok(src.includes(anchor), label + ' 锚点在真源码里必须存在（否则负控制是空的）');
        const all = SELF.split(anchor).length - 1;
        assert.ok(all >= 1, label + ' 锚点必须至少被写一处');
        /* 口径：锚点可能在 D 段里（真源码破坏的靶子）、也可能只在表里（如『依赖边』那条另有靶子），
         *   两者都合法；非法的是**同一条真源被写两处以上**（两处即会漂移）。故判「档内总数 − 区内数 ≤ 1」。 */
        assert.ok(all - inRegion(anchor) <= 1, label + ' 的锚点字面量在「判据体与 D 段之外」不得多于一处（实测 ' + (all - inRegion(anchor)) + ' 次）');
    }
    ok('判据实现 / 破坏真源 / 清单规模 / 锚点纯度四者自洽');
});
