// 审计基建（v3.185）：条目关联「消费面」扫描 —— 产出必须有消费者
// ------------------------------------------------------------
// 为什么存在：
//   v3.184 落地的 crosslink（手写 Aho-Corasick 词表）在宿主侧只做到了**生产**：
//   建索引、扫摘要、记候选、报一行「关联N条候选」。候选算出来却没有任何消费者——
//   对召回与注入的行为零影响。这正是本仓 v3.0~v3.11 的主线缺陷形态
//   （「模块在、宿主不调用」）在**同一模块内**的复现：生产接上了，消费没接。
//
//   更糟的是这类形态**测试全绿也不反映**：单元测试只验 crosslink.js 自身，
//   而「候选有没有被用掉」是宿主侧事实。故本扫描独立于单元测试。
//
//   同时本版修掉一条更重的缺陷：recallMemory 的末步 `intentRerank(merged, queryText)`
//   引用了**全仓零声明**的自由变量 queryText（唯一同名是 intentRerank 自己的形参），
//   在默认配置下稳定抛 ReferenceError，被调用链上层的 `catch { return ''; }` 静默吞掉，
//   后果是**整轮记忆注入为空**。旧测试恰好锁定了这个错误字面量（字符串在场即绿），
//   属典型假绿。R3 专门守这条：错误字面量必须零出现，正确形态必须在场。
//
// 判定：
//   R0 自证：读自身源码核对判据数；needle 拆开拼接（防判据自我满足）；打印卫生读数
//   R1 模块存活：crosslink 可 require、导出齐、行数不低于下限（防截断成空壳）
//   R2 宿主真消费：消费面的定义 + 调用逐个在场（剥注释后计数，注释里写「已消费」不算）
//   R3 位置纪律：提权在 hybridMerge 之后 / rerank 之前；注入行在关系块之后；
//                自由变量 queryText 零出现、query.text 形态在场
//   R4 边界纪律（跑真模块 + 文本双证）：提权只给常量小分、提权块内不得写图/删边；
//                停用词串传入不得被逐字拆开（本仓真实陷阱）
//   R5 读数可分辨：「未启用 / 累计算 / 未命中数 / 摘要入表 / 召回提权」五态齐，
//                且 ⚠️ 只挂在 idle 分支上（「没接」与「接了但本轮无事」不同形）
//   R6 配置面：键已声明 + 有 UI 控件 + **默认必须为 false**（默认关＝零行为变化承诺）
//
// 退出码：0=卫生  1=存在真缺陷  2=结构漂移（探测器失效）
// 夹具通道：LONSHA_AUDIT_ROOT 指向合成仓库（负控制用）。
import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
const P = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');

const FILES = { xl: 'crosslink.js', idx: 'index.js', sui: 'settings-ui.js', mf: 'manifest.json' };
for (const k of Object.keys(FILES)) {
    if (!fs.existsSync(path.join(ROOT, FILES[k]))) {
        console.error('[xref-consumer] 缺少 ' + FILES[k] + '（' + ROOT + '）');
        process.exit(2);
    }
}
const idxRaw = fs.readFileSync(path.join(ROOT, FILES.idx), 'utf8');
const suiRaw = fs.readFileSync(path.join(ROOT, FILES.sui), 'utf8');
const mf = JSON.parse(fs.readFileSync(path.join(ROOT, FILES.mf), 'utf8'));

// 形态判据一律在剥注释后的文本上下结论（注释里写「已接消费者」不算接上）。
function stripComments(code) {
    const out = code.split('');
    let i = 0;
    while (i < code.length) {
        const c = code[i];
        if (c === '/' && code[i + 1] === '/') { while (i < code.length && code[i] !== '\n') { out[i] = ' '; i++; } continue; }
        if (c === '/' && code[i + 1] === '*') {
            out[i] = ' '; out[i + 1] = ' '; i += 2;
            while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) { if (code[i] !== '\n') out[i] = ' '; i++; }
            if (i < code.length) { out[i] = ' '; out[i + 1] = ' '; i += 2; }
            continue;
        }
        i++;
    }
    return out.join('');
}
const idx = stripComments(idxRaw);
const sui = stripComments(suiRaw);
if (idxRaw.length < 500000) {
    console.error('[xref-consumer] index.js 退化（' + idxRaw.length + ' 字节），审计需同步结构变化');
    process.exit(2);
}

const defects = [];
let checks = 0;
const ok = (name) => { checks++; };
const bad = (name, detail) => { checks++; defects.push(name + (detail ? '：' + detail : '')); };

// ── R0 自证 ──
// needle 拆开拼接：若直接写整串，本文件自身也含该串，"缺了也绿" 无从察觉。
const NEEDLE_A = '条' + '目复用';
const NEEDLE_B = '本轮' + '可提关联';
// 自证对象是「判据骨架」，不是运行期计数（计数是循环里复用的，字面只出现 2 次）。
//   这里必须用**两个独立字面量**：SECTION_MARKS 是运行期枚举，EXPECT_MARKS 是自证期望值。
//   教训（本轮实测）：最初只用一个数组，检查写成 `SECTION_MARKS.filter(s => !decl.includes(s))`，
//   于是「把数组元素改名」会让两边同时改变、永远相等——自证形同虚设（负控制 N-R0b 抓到）。
//   现在要求集合完全相等且数量为 6：任一元素被删/改名立即失败。
const EXPECT_SECTION_COUNT = 6;
// 判据**骨架下界**：静态 ok/bad 调用点数（当前 55）。删掉任一段判据都会显著减少它。
//   为什么不用运行期 checks 计数：运行期计数受循环迭代数影响，与实现细节耦合；
//   而且一旦拿它当结论前置，被破坏的副本会因「计数不足」先翻红，把**真实归因掩盖掉**
//   （实测：还原 queryText 缺陷后扫描器报了自证失败而非 R3 归因）。
//   静态调用点数只反映「骨架有没有被删」，不会抢占归因。
const EXPECT_CALLSITE_MIN = 45;
// 归因串契约（负控制逐条依赖）：这些串被删/改名 = 扫描器悄悄丢掉一条判别力。
const EXPECT_ATTRIB = [
    'R2 召回侧未消费',
    'R3 位置错',
    'R3 自由变量',
    'R4 越权写图',
    'R4 分值越界',
    'R5 idle 警示不可分辨',
    'R6 默认值不符',
    'R6 无 UI 控件',
    '判据纯度',
    '自证失败',
];
const SECTION_MARKS = ['R1 模块存活', 'R2 宿主真消费', 'R3 位置纪律', 'R4 边界纪律', 'R5 读数可分辨', 'R6 配置面'];
const EXPECT_MARKS = ['R1 模块存活', 'R2 宿主真消费', 'R3 位置纪律', 'R4 边界纪律', 'R5 读数可分辨', 'R6 配置面'];
const marksDecl = (P.match(/const SECTION_MARKS = \[([\s\S]*?)\];/) || [])[1] || '';
const selfFaults = [];
if (SECTION_MARKS.length !== EXPECT_SECTION_COUNT) selfFaults.push('枚举长度 ' + SECTION_MARKS.length + '≠' + EXPECT_SECTION_COUNT);
for (const s of EXPECT_MARKS) if (!SECTION_MARKS.includes(s)) selfFaults.push('枚举缺「' + s + '」');
for (const s of SECTION_MARKS) if (!EXPECT_MARKS.includes(s)) selfFaults.push('枚举多出「' + s + '」');
const callSites = (P.match(/(?<![A-Za-z_$])(?:ok|bad)\('/g) || []).length;
if (callSites < EXPECT_CALLSITE_MIN) selfFaults.push('判据调用点仅 ' + callSites + '（下界 ' + EXPECT_CALLSITE_MIN + '）');
if (!marksDecl) selfFaults.push('未找到 SECTION_MARKS 声明');
for (const s of EXPECT_MARKS) if (!marksDecl.includes("'" + s + "'")) selfFaults.push('枚举声明缺「' + s + '」');
// 归因串契约：负控制逐条依赖这些归因翻红。若某条归因被删除/改名，本扫描器就**悄悄失去一条判别力**，
//   而单元测试与其它审计都不会察觉（这正是「静默失效」的另一种形态，发生在审计器自己身上）。
//   检查必须在**剔除声明数组之后**的文本上做，否则数组自身的字面会让检查永远为真（自满足）。
const declStripped = P.replace(/const EXPECT_ATTRIB = \[[\s\S]*?\];/, '');
for (const a of EXPECT_ATTRIB) if (!declStripped.includes(a)) selfFaults.push('归因串缺失「' + a + '」');
if (selfFaults.length) {
    console.error('[xref-consumer] R0 自证失败：' + selfFaults.join('、') + '（本文件疑被删改）');
    process.exit(2);
}
const anchorCount = (P.match(/^\s*\['[^']+',\s*\d+,\s*'[^']+'\],?$/gm) || []).length;
if (anchorCount < 9) {
    console.error('[xref-consumer] R0 自证失败：R2 消费面锚点表仅 ' + anchorCount + ' 条（下限 9）');
    process.exit(2);
}
if (!/process\.exit\(1\)/.test(P) || !/process\.exit\(2\)/.test(P)) {
    console.error('[xref-consumer] R0 自证失败：结论分支（0/1/2）不完整');
    process.exit(2);
}
if (P.includes(NEEDLE_A) || P.includes(NEEDLE_B)) {
    // 本文件含同名 needle 会让「宿主里缺了也绿」——故 need 拆开拼接，这里守住纯度。
    console.error('[xref-consumer] R0 判据纯度失败：needle 未拆开拼接');
    process.exit(2);
}
console.log('[xref-consumer] R0 自证：判据段 ' + SECTION_MARKS.length + ' 段齐｜消费面锚点 ' + anchorCount + ' 条｜index.js ' + idxRaw.length + ' 字节｜模块登记 ' + ((mf.extra_js || []).length) + ' 项');

// ── R1 模块存活 ──
let XL = null;
try { XL = require(path.join(ROOT, FILES.xl)); } catch (e) {
    console.error('[xref-consumer] R1 crosslink 加载失败：' + e.message);
    process.exit(2);
}
const xlSrc = fs.readFileSync(path.join(ROOT, FILES.xl), 'utf8');
const xlLines = xlSrc.split('\n').length;
if (xlLines < 200) bad('R1 模块存活', 'crosslink.js 仅 ' + xlLines + ' 行（下限 200，疑被截断）'); else ok('R1 行数');
for (const fn of ['createIndex', 'fingerprintOf', 'scanText', 'buildAutomaton']) {
    if (typeof XL[fn] !== 'function') bad('R1 导出缺失', fn); else ok('R1 ' + fn);
}
const xlRegistered = (mf.extra_js || []).some(x => (Array.isArray(x) ? x[0] : x) === FILES.xl);
if (!xlRegistered) bad('R1 manifest 登记', FILES.xl + ' 未在 extra_js'); else ok('R1 登记');

// ── R2 宿主真消费（定义 + 调用都要在场）──
const CONSUMER_ANCHORS = [
    ['_crosslinkConsumePair', 2, '候选挑取（定义+调用）'],
    ['_crosslinkConsumeAlive', 2, '过期退场判定（定义+调用）'],
    ['_crosslinkConsumeLine', 2, '消费面诊断行（定义+调用）'],
    ['_crosslinkXrefs', 3, '摘要入表的幂等账（init+读+写）'],
    ['_xrefIdx = idx', 1, '索引暴露（诊断区分模块缺席/未建/正常）'],
    ['_crosslinkXrefN', 2, '入表条数读数（写入+诊断）'],
    ['_crosslinkConsumed', 2, '累计提项读数（累加+诊断）'],
    ['_crosslinkConsumeMissN', 2, '未命中读数（累加+诊断）'],
    ['_crosslinkRefRanked', 2, '召回提权命中读数（累加+诊断）'],
];
for (const [needle, min, label] of CONSUMER_ANCHORS) {
    const n = idx.split(needle).length - 1;
    if (n < min) bad('R2 消费面缺失', label + '「' + needle + '」出现 ' + n + ' 次（需 ≥' + min + '）');
    else ok('R2 ' + needle);
}
if (!/refsFor\s*\(/.test(idx)) bad('R2 召回侧未消费', '宿主未调用 refsFor（候选算出来没人用）'); else ok('R2 refsFor 调用');

// ── R3 位置纪律 ──
const posOf = (needle) => idx.indexOf(needle);
const pMerge = posOf('this.hybridMerge(results)');
const pBoost = posOf('_crosslinkBoostKeys && _crosslinkBoostKeys.size');
// 锚点要兼容「正确形态」与「历史坏形态」两种调用：坏形态须能落到 R3 自由变量判据，
//   而不是因为找不到锚点先报 R3 锚点缺失（归因错位会让负控制失去判别力）。
const pRerank = (() => {
    const good = idx.indexOf('this.intentRerank(merged, query.text);');
    const badLit2 = idx.indexOf('this.intentRerank(merged, queryText);');
    if (good < 0) return badLit2;
    if (badLit2 < 0) return good;
    return Math.min(good, badLit2);
})();
if (pMerge < 0 || pBoost < 0 || pRerank < 0) {
    bad('R3 锚点缺失', 'hybridMerge=' + pMerge + ' boost=' + pBoost + ' rerank=' + pRerank);
} else {
    if (!(pMerge < pBoost)) bad('R3 位置错', '提权未落在 hybridMerge 之后（merge@' + pMerge + ' boost@' + pBoost + '）'); else ok('R3 提权在 merge 后');
    if (!(pBoost < pRerank)) bad('R3 位置错', '提权未落在 rerank 之前（boost@' + pBoost + ' rerank@' + pRerank + '）'); else ok('R3 提权在 rerank 前');
}
const pRel = posOf('_RD.partition');
const pXcInject = posOf(NEEDLE_B);
if (pRel < 0 || pXcInject < 0) bad('R3 锚点缺失', '关系块=' + pRel + ' 注入行=' + pXcInject);
else if (!(pRel < pXcInject)) bad('R3 位置错', '可提关联行未落在关系块之后'); else ok('R3 注入行在关系块后');
// queryText 自由变量回归守门。
//   注意形态陷阱：方法**定义行** `intentRerank(merged, queryText) {` 天然含该子串且完全合法，
//   真正的病态是**调用行**（以形参名当变量用）。故判据锚定「调用后带分号」的形态，
//   并额外核对定义行仍为形参（防有人把形参改名的同时把调用也改成自由变量）。
const badLit = idx.split('intentRerank(merged, queryText);').length - 1;
if (badLit > 0) bad('R3 自由变量回归', 'intentRerank(merged, queryText); 调用仍在场 ' + badLit + ' 处（整轮注入会被静默清空）'); else ok('R3 queryText 调用已清零');
if (!/intentRerank\(merged, queryText\)\s*\{/.test(idx)) bad('R3 形参形态漂移', '未找到 intentRerank(merged, queryText) { 定义行（形参是合法的，不该被误删）'); else ok('R3 定义行形参在场');
if (!/intentRerank\(merged, query\.text\);/.test(idx)) bad('R3 正确形态缺失', '未找到 intentRerank(merged, query.text); 调用'); else ok('R3 query.text 调用在场');
// 自由变量体检：queryText 在剥注释后的代码里只允许以「形参 / 属性名 / 属性访问 / 方法体内的形参使用」出现。
//   方法体范围必须显式排除，否则会把 `const q = String(queryText || '');`（intentRerank 自己的形参）误报成自由变量。
const rerankBodyRange = (() => {
    const lines = idx.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (/intentRerank\s*\(\s*merged\s*,\s*queryText\s*\)\s*\{/.test(lines[i])) {
            for (let j = i + 1; j < lines.length && j < i + 60; j++) {
                if (/^\s{4,}[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{/.test(lines[j])) return [i + 1, j];
            }
            return [i + 1, i + 60];
        }
    }
    return [0, 0];
})();
const freeUse = idx.split('\n').map((l, n) => [n + 1, l]).filter(([ln, l]) =>
    /\bqueryText\b/.test(l)
    && !(ln >= rerankBodyRange[0] && ln <= rerankBodyRange[1])               // 方法体内：形参本身
    && !/\bqueryText\s*:/.test(l)                                           // 对象属性键
    && !/\.\s*queryText\b/.test(l)                                          // 属性访问
);
if (freeUse.length) bad('R3 自由变量残留', JSON.stringify(freeUse.slice(0, 3)));
else ok('R3 无自由变量残留（形参使用 ' + rerankBodyRange[0] + '-' + rerankBodyRange[1] + ' 行已豁免）');

// ── R4 边界纪律 ──
const boostBlock = (() => {
    const i = idx.indexOf('_crosslinkBoostKeys && _crosslinkBoostKeys.size');
    if (i < 0) return '';
    // 切片必须从 `if (` 起——否则入口条件本身被切掉，判据会把「块在但条件不可见」误报成不可达。
    const start = Math.max(0, idx.lastIndexOf('if (', i));
    const j = idx.indexOf('this.intentRerank(merged, query.text)', i);
    return idx.slice(start, j > i ? j : i + 3000);
})();
for (const forbidden of ['addEdge', 'removeRef', 'deleteEdge', '.splice(', 'graph.add']) {
    if (boostBlock.includes(forbidden)) bad('R4 越权写图', '提权块内出现 ' + forbidden + '（承诺只提名次，不写图/不删边）');
    else ok('R4 禁写 ' + forbidden);
}
// 提权分值形态：本仓写成 `_it.rrfScore = (_it.rrfScore || 0) + 0.006;`（加法形态），
//   故判据同时接受 `+=` 与 `= (x||0) + c` 两种写法，别把合法写法判成「不可辨」。
const boostAmt = (boostBlock.match(/rrfScore\s*\+=\s*([0-9.]+)/) || [])[1]
    || (boostBlock.match(/rrfScore\s*=\s*\(\s*[^()]*\|\|\s*0\s*\)\s*\+\s*([0-9.]+)/) || [])[1];
if (!boostAmt) bad('R4 分值不可辨', '提权块内未找到 rrfScore += <常量> 或 rrfScore = (x||0) + <常量>');
else if (Number(boostAmt) > 0.05) bad('R4 分值越界', '提权 ' + boostAmt + ' 过大（应只动名次边界，不得把低相关条目抬进前排）');
else ok('R4 提权常量 ' + boostAmt);
// 提权块必须真读关键词集合（防「块在，条件恒假」——即写了个永远不进的分支）
if (!/if\s*\(_crosslinkBoostKeys\s*&&\s*_crosslinkBoostKeys\.size\)/.test(boostBlock)) {
    bad('R4 提权条件不可达', '提权块入口条件非 _crosslinkBoostKeys.size 非空（形同虚设）');
} else ok('R4 提权入口条件');
if (!/_crosslinkBoostKeys\.has\(/.test(boostBlock)) bad('R4 未真匹配键', '提权块内未对 _crosslinkBoostKeys.has(...) 求值');
else ok('R4 键匹配在场');
// 停用词串传入不得被逐字拆开（真实陷阱：Array.from 会把「主角」拆成「主」「角」）
let xrefIdx;
try { xrefIdx = XL.createIndex({ stopwords: '主角,系统' }); } catch (e) {
    console.error('[xref-consumer] R4 行为判据异常：' + e.message); process.exit(2);
}
xrefIdx.add('主角', 'sum_9');
xrefIdx.add('海棠', 'sum_3');
const hitStop = xrefIdx.refsFor('主角');
const hitReal = xrefIdx.refsFor('今天海棠来了');
const stopSplit = xrefIdx.refsFor('主');
if (hitStop.length) bad('R4 停用词失效', '「主角」不应被收录（stopwords 串被拆成字符？）');
else ok('R4 停用词生效');
if (stopSplit.length) bad('R4 停用词逐字拆分', '单字「主」被判为命中 → stopwords 未按串处理');
else ok('R4 无逐字拆分');
if (!hitReal.some(r => String(r) === 'sum_3')) bad('R4 召回行为错', '「海棠」应命中 sum_3，实得 ' + JSON.stringify(hitReal));
else ok('R4 召回行为');

// ── R5 读数可分辨 ──
if (!idx.includes(NEEDLE_A)) bad('R5 诊断行缺失', 'selfCheck 无「' + NEEDLE_A + '」行');
else ok('R5 诊断行在场');
// 取诊断行实现的**方法体**：定义行 → 下一个方法定义行之间。
// 取段必须靠定义行定位，不能靠「找第二次出现」——调用点也在同一文件里。
const _defLine = (name) => new RegExp('^\\s{4,}' + name + '\\s*\\(').exec(idxRaw);
const lineBody = (() => {
    const lines = idxRaw.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (/^\s{4,}_crosslinkConsumeLine\s*\(/.test(lines[i])) {
            const out = [lines[i]];
            for (let j = i + 1; j < lines.length && j < i + 40; j++) {
                if (out.length > 1 && /^\s{4,}[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{/.test(lines[j])) break;
                out.push(lines[j]);
            }
            return out.join('\n');
        }
    }
    return '';
})();
if (!lineBody) bad('R5 实现不可取', '未定位到 _crosslinkConsumeLine 方法体（结构漂移）');
for (const [label, needle] of [['未启用态', '关联未启用'], ['累计提项', '累计提'], ['未命中数', '未命中'], ['摘要入表', '摘要入表'], ['召回提权读数', '召回提权']]) {
    if (!lineBody.includes(needle)) bad('R5 读数不可分辨', '诊断行缺「' + label + '」');
    else ok('R5 ' + label);
}
// idle 警示必须是**本机制自己那一行**的绑定，不能是别的机制的同类形态（v3.186 接管时收窄）。
//   背景：v3.186 为另一机制（情绪反向召回）新增了同款 `idle ? ' ⚠️' : ''` 形态，
//   于是裸形态判据会让「删掉本机制的 ⚠️」因「别人还有一份」而仍绿——判别力被旁路。
//   故锚到归属行上，并把 idle 条件也锚到本机制的锚点字段。
//   注意：归属行名必须用本文件已有的 NEEDLE_A 变量拼出——直接写整串会破坏本文件的判据纯度
//   （R0 会报「needle 未拆开拼接」，那正是本文件守自己的形态）。
const XL_IDLE_LINE = new RegExp("return \\['" + NEEDLE_A + "', line \\+ \\(idle \\? ' ⚠️' : ''\\)\\];");
const XL_IDLE_COND = /const idle = !!\(hasSums && this\._xrefIdx != null && !Number\(this\._crosslinkXrefN \|\| 0\)\)/;
if (!XL_IDLE_LINE.test(idx) || !XL_IDLE_COND.test(idx)) {
    bad('R5 idle 警示不可分辨', '⚠️ 未与 idle（有摘要且入表 0）条件绑定，或未锚在本机制自己的那一行上——「没接」与「接了但本轮无事」会同形');
} else ok('R5 idle 警示绑定');
if (new RegExp(NEEDLE_A).test(lineBody)) bad('R5 判据自我指涉', '诊断行实现内出现了行名本身');

// ── R6 配置面 ──
const KEY = 'crosslinkRecallBoost';
if (!new RegExp(KEY + '\\s*:\\s*false').test(idx)) bad('R6 默认值不符', KEY + ' 默认必须为 false（默认关＝零行为变化承诺）');
else ok('R6 默认 false');
if (!new RegExp(KEY + "\\s*!==?\\s*undefined|" + KEY + "\\s*===\\s*true").test(idx)) bad('R6 未被读取', KEY + ' 无消费点（死配置）');
else ok('R6 键有消费点');
if (!sui.includes("ck('" + KEY + "'")) bad('R6 无 UI 控件', KEY + ' 缺 settings-ui 控件（v3.160 纪律）');
else ok('R6 UI 控件');

// ── 结论 ──
//   注意：这里**不再**用运行期 checks 计数做自证下界。骨架完整性已由 R0 的静态调用点数守住；
//   运行期计数做前置会让被破坏副本先报自证失败、掩盖真实归因（本轮实测过），得不偿失。
console.log('[xref-consumer] 判据点 ' + checks + ' 处（骨架调用点 ' + callSites + '，下界 ' + EXPECT_CALLSITE_MIN + '）｜缺陷 ' + defects.length + ' 项');
if (defects.length) {
    for (const d of defects) console.log('  ✗ ' + d);
    process.exit(1);
}
console.log('  ✓ 条目关联消费面卫生：生产有消费者、位置正确、边界未越权、读数可分辨、默认零行为变化');
process.exit(0);