// 审计基建（v3.186）：情绪反向召回扫描 —— 词表、消费者、位置、读数、口径
// ------------------------------------------------------------
// 为什么存在：
//   本版把 memory-palace 的 EMOTION_OPPOSITES 机制缝进召回面。这类「缝合」在本仓历史上
//   反复出现的失效形态有三种，全部逃得过单元测试：
//     ① 词表对不上本仓词典 —— 照搬原库的词，scanEmotion 永远扫不到，反向线索恒空
//        （「看着接上了、实际零命中」）。故 R2 逐词核对归属，不核对数量。
//     ② 生产接上、消费没接 —— 算得出线索但没人用（v3.184 crosslink 的形态）。R3 守它。
//     ③ 读数不可分辨 —— 「没情绪词」与「词表永远不匹配」都是 0 条，同形。R5 守它。
//
//   另有一条本版**刻意放弃**的东西必须钉住：原库用 CHAT_COMPLETION_PROMPT_READY
//   事件直接向 chat 推 system 消息做注入。用户明确要求「只要机制」，故本仓不得引入
//   那条路线——R6 反向守它（该事件名只允许出现在注释里说明来源，不得成为注册点）。
//
// 判定：
//   R0 自证：判据段枚举 + 独立期望字面量 + 静态调用点下界 + 归因串契约 + needle 拆开拼接
//   R1 模块存活：narrative-pulse 可 require、六个新导出齐、行数下限、manifest 登记
//   R2 词表纪律（行为）：键取自负面四维、值只取 joy/warm、四维各有反向词、正面维为空
//   R3 宿主真消费：取库助手 + 召回侧调用 + 提权块 + 诊断行 + selfCheck 行
//   R4 位置纪律：提权落在 hybridMerge 之后、intentRerank 之前；块内不写图/不删边；幅度只动名次
//   R5 读数可分辨：未启用/模块未加载/待本轮/ok/无反向线索 五态齐；⚠️ 只挂长期空转
//   R6 口径与默认：键默认关 + 有 UI + 行为真触发（反向提中、同类不提）+ 未引入原库注入路线
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

const FILES = { np: 'narrative-pulse.js', idx: 'index.js', sui: 'settings-ui.js', mf: 'manifest.json' };
for (const k of Object.keys(FILES)) {
    if (!fs.existsSync(path.join(ROOT, FILES[k]))) {
        console.error('[emo-opposite] 缺少 ' + FILES[k] + '（' + ROOT + '）');
        process.exit(2);
    }
}
const npRaw = fs.readFileSync(path.join(ROOT, FILES.np), 'utf8');
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
const npc = stripComments(npRaw);
if (idxRaw.length < 500000) {
    console.error('[emo-opposite] index.js 退化（' + idxRaw.length + ' 字节），审计需同步结构变化');
    process.exit(2);
}

const defects = [];
let checks = 0;
const ok = (name) => { checks++; };
const bad = (name, detail) => { checks++; defects.push(name + (detail ? '：' + detail : '')); };

// ── R0 自证 ──
// needle 拆开拼接：若直接写整串，本文件自身也含该串，「宿主里缺了也绿」无从察觉。
const NEEDLE_ROW = '情绪' + '反向';
// 自证对象是「判据骨架」。SECTION_MARKS 是运行期枚举，EXPECT_MARKS 是独立期望字面量——
//   只用一个数组自指的话，把元素改名会让两边同时变、永远相等（v3.185 负控制抓到过这个形态）。
const EXPECT_SECTION_COUNT = 6;
const EXPECT_MARKS = ['R1 模块存活', 'R2 词表纪律', 'R3 宿主真消费', 'R4 位置纪律', 'R5 读数可分辨', 'R6 口径与默认'];
const SECTION_MARKS = ['R1 模块存活', 'R2 词表纪律', 'R3 宿主真消费', 'R4 位置纪律', 'R5 读数可分辨', 'R6 口径与默认'];
// 判据**骨架下界**：静态 ok/bad 调用点数。删掉任一段判据都会显著减少它。
//   为什么不用运行期 checks 计数：拿它当结论前置会让被破坏副本因「计数不足」先翻红，
//   把**真实归因掩盖掉**（v3.185 实测过）。静态调用点数只反映骨架有无被删，不抢归因。
const EXPECT_CALLSITE_MIN = 42;
// 归因串契约（负控制逐条依赖）：被删/改名 = 扫描器悄悄丢掉一条判别力。
const EXPECT_ATTRIB = [
    'R2 反向词越界',
    'R2 键维不符',
    'R2 正面维污染',
    'R3 召回侧未消费',
    'R3 诊断行缺失',
    'R4 位置错',
    'R4 越权写图',
    'R4 分值越界',
    'R5 三态不可分辨',
    'R5 idle 警示不可分辨',
    'R6 默认值不符',
    'R6 无 UI 控件',
    'R6 机制未生效',
    'R6 同类误提',
    'R6 引入原库注入路线',
    '判据纯度',
    '自证失败',
];
const marksDecl = (P.match(/const SECTION_MARKS = \[([\s\S]*?)\];/) || [])[1] || '';
const selfFaults = [];
if (SECTION_MARKS.length !== EXPECT_SECTION_COUNT) selfFaults.push('枚举长度 ' + SECTION_MARKS.length + '≠' + EXPECT_SECTION_COUNT);
for (const s of EXPECT_MARKS) if (!SECTION_MARKS.includes(s)) selfFaults.push('枚举缺「' + s + '」');
for (const s of SECTION_MARKS) if (!EXPECT_MARKS.includes(s)) selfFaults.push('枚举多出「' + s + '」');
const callSites = (P.match(/(?<![A-Za-z_$])(?:ok|bad)\('/g) || []).length;
if (callSites < EXPECT_CALLSITE_MIN) selfFaults.push('判据调用点仅 ' + callSites + '（下界 ' + EXPECT_CALLSITE_MIN + '）');
if (!marksDecl) selfFaults.push('未找到 SECTION_MARKS 声明');
for (const s of EXPECT_MARKS) if (!marksDecl.includes("'" + s + "'")) selfFaults.push('枚举声明缺「' + s + '」');
// 归因串检查须在**剔除声明数组之后**的文本上做，否则数组自身的字面会让检查永远为真。
const declStripped = P.replace(/const EXPECT_ATTRIB = \[[\s\S]*?\];/, '');
for (const a of EXPECT_ATTRIB) if (!declStripped.includes(a)) selfFaults.push('归因串缺失「' + a + '」');
if (selfFaults.length) {
    console.error('[emo-opposite] R0 自证失败：' + selfFaults.join('、') + '（本文件疑被删改）');
    process.exit(2);
}
if (!/process\.exit\(1\)/.test(P) || !/process\.exit\(2\)/.test(P)) {
    console.error('[emo-opposite] R0 自证失败：结论分支（0/1/2）不完整');
    process.exit(2);
}
// 纯净度只允许在**剥注释后的代码**上判：注释里合法地写着机制名（来源说明是本仓惯例），
//   那不算「判据自我满足」；真正的风险是**代码**里出现 needle 字面量。
//   实测教训：初版写成 `P.includes(NEEDLE_ROW)` 直接判原文，本文件开头的说明注释即触发误报
//   （扫描器自证自己失败，正是「审计失效的方式是报告异常」的镜像形态：报告的是假问题）。
{
    // 失败时要能定位：只报「有问题」而说不出在哪，等于让下一次修复从猜开始。
    const sp = stripComments(P);
    const purityAt = sp.indexOf(NEEDLE_ROW);
    if (purityAt >= 0) {
        const tail = sp.slice(Math.max(0, purityAt - 80), purityAt).split('\n').pop();
        console.error('[emo-opposite] R0 判据纯度失败：代码（非注释）里出现 needle 字面量 @' + purityAt + ' 前文=' + JSON.stringify(tail));
        process.exit(2);
    }
}
console.log('[emo-opposite] R0 自证：判据段 ' + SECTION_MARKS.length + ' 段齐｜调用点 ' + callSites + '｜index.js ' + idxRaw.length + ' 字节');

// ── R1 模块存活 ──
let NP = null;
try { NP = require(path.join(ROOT, FILES.np)); } catch (e) {
    console.error('[emo-opposite] R1 模块加载失败：' + e.message);
    process.exit(2);
}
const npLines = npRaw.split('\n').length;
if (npLines < 250) bad('R1 模块存活', 'narrative-pulse.js 仅 ' + npLines + ' 行（下限 250，疑被截断）'); else ok('R1 行数');
for (const fn of ['scanEmotion', 'recallByOppositeEmotion', 'opposedWordsFor']) {
    if (typeof NP[fn] !== 'function') bad('R1 导出缺失', fn); else ok('R1 ' + fn);
}
if (!NP.EMOTION_OPPOSITES || typeof NP.EMOTION_OPPOSITES !== 'object') bad('R1 导出缺失', 'EMOTION_OPPOSITES');
else ok('R1 EMOTION_OPPOSITES');
const npRegistered = (mf.extra_js || []).some(x => (Array.isArray(x) ? x[0] : x) === FILES.np);
if (!npRegistered) bad('R1 manifest 登记', FILES.np + ' 未在 extra_js'); else ok('R1 登记');

// ── R2 词表纪律（行为判据，不数个数）──
//   本节的立论：缝合词表的价值**不在条数多少**，而在每个词都能被本仓词典扫到。
//   故逐词核对归属；「照搬原库 17 个形容词」这种形态会在这里成片翻红。
const LEX = NP.EMO_LEXICON || {};
const OPP = NP.EMOTION_OPPOSITES || {};
const POL = { joy: 1, warm: 0.8, sad: -0.6, fear: -0.7, anger: -0.5, tense: 0 };
// 合法的**线索来源维**：四维「负面情形」。tense 极性为 0（它表示氛围紧、不是情绪倾向），
//   但它与另三维同属「负面情形」语义，词表照配——本节的「四维各有反向词」判据（下方）
//   本就要求 tense 有词，故极性判据必须同步接受 tense，否则两条判据自相矛盾。
//   tense 在召回层**不可达**这件事由 R6 的行为判据钉住（氛围维主导 ⇒ reason 必须为 no-polarity），
//   那是行为层的事实，不该在这里用静态极性问题重复表达。
//   从 POL 推导而非手抄：将来词典新增维时，本判据与下方「正面维不可污染」自动保持互补，
//   不会各自漂移出自相矛盾的结论。
const NEG_SOURCE_DIMS = Object.keys(POL).filter(d => d !== 'joy' && d !== 'warm');
let oppKeys = 0, oppVals = 0, badDim = [], badVal = [], badPolarity = [];
for (const [neg, vals] of Object.entries(OPP)) {
    oppKeys++;
    const dims = Object.keys(LEX).filter(d => neg in (LEX[d] || {}));
    if (!dims.length) { badDim.push(neg + '(不在任何维)'); continue; }
    if (!dims.some(d => NEG_SOURCE_DIMS.includes(d))) badPolarity.push(neg + '(' + dims.join('/') + ')');
    for (const v of (Array.isArray(vals) ? vals : [])) {
        oppVals++;
        if (!(v in (LEX.joy || {})) && !(v in (LEX.warm || {}))) badVal.push(neg + '→' + v);
    }
}
if (badDim.length) bad('R2 键维不符', '这些键不在 EMO_LEXICON 任何一维里（scanEmotion 永远扫不到）：' + badDim.slice(0, 8).join('、'));
else ok('R2 键归属词典（' + oppKeys + ' 键）');
if (badPolarity.length) bad('R2 键极性不符', '这些键所在维极性不为负（不该作线索源）：' + badPolarity.slice(0, 8).join('、'));
else ok('R2 键皆负面维');
if (badVal.length) bad('R2 反向词越界', '这些值不在 joy/warm 维里（写了扫不到的词，线索恒空）：' + badVal.slice(0, 8).join('、'));
else ok('R2 值皆是正面词（' + oppVals + ' 值）');
for (const d of ['sad', 'fear', 'anger', 'tense']) {
    const n = (NP.opposedWordsFor ? NP.opposedWordsFor(d) : []).length;
    if (!n) bad('R2 维无反向词', d + ' 维没有任何反向词（该维负面情绪永远出不了线索）');
    else ok('R2 ' + d + ' 维反向词 ' + n + ' 个');
}
for (const d of ['joy', 'warm']) {
    const n = (NP.opposedWordsFor ? NP.opposedWordsFor(d) : []).length;
    if (n) bad('R2 正面维污染', d + ' 维本不该有反向词（它是线索的**目标**，不是来源），实得 ' + n + ' 个');
    else ok('R2 ' + d + ' 维无反向词');
}

// ── R3 宿主真消费（定义 + 调用都要在场）──
const CONSUMER_ANCHORS = [
    ['function _emotionOppositeLib()', 1, '取库助手（复用 narrative-pulse，不新建词表）'],
    ['window.LonShaNarrativePulse, \'narrative-pulse.js\'', 1, '取的正是情绪模块'],
    ['EL.recallByOppositeEmotion({ queryText: query.text', 1, '召回侧真调用'],
    ['let _emoOppositeKeys = null;', 1, '线索集合声明'],
    ['if (_emoOppositeKeys && _emoOppositeKeys.size) {', 1, '提权块入口'],
    ['this._emoOppositeRead = {', 1, '读数落账'],
    ['_emotionOppositeLine() {', 1, '诊断行定义'],
    ['this._emotionOppositeLine()', 1, '诊断行调用（selfCheck 读取）'],
    ["['" + NEEDLE_ROW + "', line", 1, 'selfCheck 子系统行'],
];
for (const [needle, min, label] of CONSUMER_ANCHORS) {
    const n = idx.split(needle).length - 1;
    if (n < min) bad('R3 消费面缺失', label + '「' + needle + '」出现 ' + n + ' 次（需 ≥' + min + '）');
    else ok('R3 ' + label);
}
if (!/EL\.recallByOppositeEmotion\s*\(/.test(idx)) bad('R3 召回侧未消费', '宿主未调用 recallByOppositeEmotion（线索算出来没人用）');
else ok('R3 recallByOppositeEmotion 调用');
if (!/this\._emoOppositeRounds = Number\(/.test(idx)) bad('R3 生效轮数未累加', '没有生效轮数读数，诊断面的「长期空转」判不出来');
else ok('R3 生效轮数累加');
if (!/this\._emoOppositeBoosted = Number\(/.test(idx)) bad('R3 提权计数未累加', '没有提权条数读数，无法分辨「扫到了」与「提上了」');
else ok('R3 提权计数累加');
if (!/CONSUMER_ANCHORS|_emotionOppositeLine/.test(idx)) bad('R3 诊断行缺失', 'selfCheck 无' + NEEDLE_ROW + '子系统行');
else ok('R3 诊断行接线');

// ── R4 位置纪律 ──
const posOf = (needle) => idx.indexOf(needle);
const pMerge = posOf('const merged = this.hybridMerge(results);');
const pEmo = posOf('if (_emoOppositeKeys && _emoOppositeKeys.size) {');
const pRerank = (() => {
    const good = idx.indexOf('this.intentRerank(merged, query.text);');
    const badLit2 = idx.indexOf('this.intentRerank(merged, queryText);');
    if (good < 0) return badLit2;
    if (badLit2 < 0) return good;
    return Math.min(good, badLit2);
})();
if (pMerge < 0 || pEmo < 0 || pRerank < 0) {
    bad('R4 锚点缺失', 'hybridMerge=' + pMerge + ' emo=' + pEmo + ' rerank=' + pRerank);
} else {
    if (!(pMerge < pEmo)) bad('R4 位置错', '情绪提权未落在 hybridMerge 之后（merge@' + pMerge + ' emo@' + pEmo + '）');
    else ok('R4 提权在 merge 后');
    if (!(pEmo < pRerank)) bad('R4 位置错', '情绪提权未落在 intentRerank 之前（emo@' + pEmo + ' rerank@' + pRerank + '）');
    else ok('R4 提权在 rerank 前');
}
// 提权块切片：从 `if (_emoOppositeKeys &&` 起，到 rerank 调用为止。
const emoBlock = (() => {
    const i = idx.indexOf('if (_emoOppositeKeys && _emoOppositeKeys.size) {');
    if (i < 0) return '';
    const j = idx.indexOf('this.intentRerank(merged, query.text)', i);
    return idx.slice(i, j > i ? j : i + 3000);
})();
for (const forbidden of ['addEdge', 'removeRef', 'deleteEdge', '.splice(', 'graph.add']) {
    if (emoBlock.includes(forbidden)) bad('R4 越权写图', '提权块内出现 ' + forbidden + '（承诺只提名次，不写图/不删边）');
    else ok('R4 禁写 ' + forbidden);
}
const emoAmt = (emoBlock.match(/rrfScore\s*\+=\s*([0-9.]+)/) || [])[1]
    || (emoBlock.match(/rrfScore\s*=\s*\(\s*[^()]*\|\|\s*0\s*\)\s*\+\s*([0-9.]+)/) || [])[1];
if (!emoAmt) bad('R4 分值不可辨', '提权块内未找到 rrfScore += <常量> 或 rrfScore = (x||0) + <常量>');
else if (Number(emoAmt) > 0.05) bad('R4 分值越界', '提权 ' + emoAmt + ' 过大（应只动名次边界，不得把低相关条目抬进前排）');
else ok('R4 提权常量 ' + emoAmt);
if (!/_emoOppositeKeys\.has\(/.test(emoBlock)) bad('R4 未真匹配键', '提权块内未对 _emoOppositeKeys.has(...) 求值');
else ok('R4 键匹配在场');

// ── R5 读数可分辨 ──
// 取诊断行实现的**方法体**：靠定义行定位，不能靠「找第 N 次出现」（调用点也在同一文件里）。
//   提取纪律（实测教训）：初版用「遇到下一个 `xxx(...) {` 就停」的启发式断尾，结果被方法体
//   **内部的** `if (r.reason === 'ok') {` 命中——那行同样长得像「新方法定义」，
//   于是方法体被截在首个 return 分支之前，「生效读数」「无线索态」两条判据全成假红。
//   「判据把实现读残了，然后报实现缺东西」正是本仓最忌的假归因，故改为**花括号配平**提取：
//   只认「缩进相同的方法头 + 花括号直到配平」，不被内部语句的形状误导。
const lineBody = (() => {
    const lines = idxRaw.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const m = /^(\s{4,})_emotionOppositeLine\s*\(/.exec(lines[i]);
        if (!m) continue;
        const indent = m[1];
        const out = [];
        let depth = 0, started = false;
        for (let j = i; j < lines.length; j++) {
            const ln = lines[j];
            out.push(ln);
            // 只统计该行在**字符串外**的花括号（模板串里可能带 ${}，但本方法体内无嵌套模板花括号以外者）。
            for (const ch of ln) {
                if (ch === '{') { depth++; started = true; }
                else if (ch === '}') depth--;
            }
            if (started && depth <= 0) return out.join('\n');
            if (out.length > 60) break;
        }
        return out.join('\n');
    }
    return '';
})();
if (!lineBody) bad('R5 实现不可取', '未定位到 _emotionOppositeLine 方法体（结构漂移）');
for (const [label, needle] of [
    ['未启用态', '未启用（默认关）'],
    ['模块缺席态', '模块未加载'],
    ['待本轮态', '待本轮'],
    ['生效读数', '主导 →'],
    ['无线索态', '无反向线索'],
]) {
    if (!lineBody.includes(needle)) bad('R5 三态不可分辨', '诊断行缺「' + label + '」');
    else ok('R5 ' + label);
}
// reason 必须真的有多个取值（否则「没情绪词」与「词表不匹配」在模块层就已同形）。
const reasons = [...new Set([...npc.matchAll(/reason\s*:\s*'([a-z-]+)'/g)].map(m => m[1]))];
const reasonSets = [...new Set([...npc.matchAll(/out\.reason\s*=\s*'([a-z-]+)'/g)].map(m => m[1]))];
const allReasons = [...new Set([...reasons, ...reasonSets])].sort();
for (const r of ['empty', 'no-emotion', 'no-polarity', 'ok']) {
    if (!allReasons.includes(r)) bad('R5 三态不可分辨', '模块 reason 缺「' + r + '」（实得 ' + allReasons.join(',') + '）');
    else ok('R5 reason ' + r);
}
if (!/idle\s*\?\s*' ⚠️'\s*:\s*''/.test(idx) || !/Number\(this\._emoOppositeRounds \|\| 0\) >= 5/.test(idx)) {
    bad('R5 idle 警示不可分辨', '⚠️ 未与「真扫过 ≥5 轮且零提权」绑定——「机制白接」与「本轮无事」会同形');
} else ok('R5 idle 警示绑定');
if (new RegExp(NEEDLE_ROW).test(lineBody)) bad('R5 判据自我指涉', '诊断行实现内出现了行名本身');

// ── R6 口径与默认 ──
const KEY = 'emotionOppositeRecall';
if (!new RegExp(KEY + '\\s*:\\s*false').test(idx)) bad('R6 默认值不符', KEY + ' 默认必须为 false（默认关＝零行为变化承诺）');
else ok('R6 默认 false');
if (!new RegExp(KEY + "\\s*===\\s*true|" + KEY + "\\s*!==\\s*true").test(idx)) bad('R6 未被读取', KEY + ' 无消费点（死配置）');
else ok('R6 键有消费点');
if (!sui.includes("ck('" + KEY + "'")) bad('R6 无 UI 控件', KEY + ' 缺 settings-ui 控件（v3.160 纪律）');
else ok('R6 UI 控件');
// 行为证伪：机制真触发（反向提中、同类不提、正面主导不出线索）——不看文本，真跑函数。
const FIX_DOCS = [
    { key: 'sum_11', text: '他温柔地陪着她，说会一直守护她，让她安心。' },   // 反向目标（warm/joy 词）
    { key: 'sum_12', text: '她一个人哭到很晚，心里满是难过与孤独。' },       // 同类负面（不该被当反向提）
    { key: 'sum_13', text: '窗外的风很大，店铺已经打烊了。' },                // 无关
];
const FIX_QUERY = '她心里难过极了。';
const POS_WORDS = ['温柔', '守护', '安心'];
for (const w of POS_WORDS) {
    if (FIX_QUERY.includes(w)) { console.error('[emo-opposite] R6 夹具失效：查询里含正向词「' + w + '」⇒ 本组不再证明「独立增量」'); process.exit(2); }
}
let rNeg = null, rPos = null;
try {
    rNeg = NP.recallByOppositeEmotion({ queryText: FIX_QUERY, docs: FIX_DOCS });
    rPos = NP.recallByOppositeEmotion({ queryText: '她笑得很开心，心里甜丝丝的。', docs: FIX_DOCS });
    var rTen = NP.recallByOppositeEmotion({ queryText: '气氛紧绷，杀意在暗处浮动。', docs: FIX_DOCS });
    var rNone = NP.recallByOppositeEmotion({ queryText: '她走进房间，打开了窗户。', docs: FIX_DOCS });
} catch (e) {
    console.error('[emo-opposite] R6 行为判据异常：' + e.message); process.exit(2);
}
if (!rNeg.active || rNeg.reason !== 'ok') bad('R6 机制未生效', '负面主导维下机制未进入扫描态（' + rNeg.reason + '）');
else ok('R6 负面主导进入扫描态');
if (!rNeg.opposite.includes('sum_11')) bad('R6 反向线索缺失', '应反向提中 sum_11，实得 ' + JSON.stringify(rNeg.opposite));
else ok('R6 反向提中（' + rNeg.opposite.join(',') + '）');
if (rNeg.opposite.includes('sum_12')) bad('R6 同类误提', '同类负面条目被当成反向线索提中（机制跑偏成「同词提权」）');
else ok('R6 同类不误提');
if (rPos.active || rPos.reason !== 'no-polarity') bad('R6 正面主导未拦', '正面主导维不该出反向线索（reason=' + rPos.reason + '）');
else ok('R6 正面主导已拦');
if (rTen.active || rTen.reason !== 'no-polarity') bad('R6 氛围维未拦', 'tense 极性 0 是氛围不是情绪倾向，不该出线索（reason=' + rTen.reason + '）');
else ok('R6 氛围维已拦');
if (rNone.active || rNone.reason !== 'no-emotion') bad('R6 无情绪未拦', '无情绪词的文本不该出线索（reason=' + rNone.reason + '）');
else ok('R6 无情绪已拦');
// 口径纪律（用户要求「只要机制」）：原库的注入路线不得成为注册点。
//   允许出现在注释里说明来源（本仓惯例是把取舍写在原地），但不得是真事件注册。
const npcNoComment = npc;
const idxNoComment = idx;
const eventReg = /on\s*\(\s*['"]CHAT_COMPLETION_PROMPT_READY['"]/.test(idxNoComment)
    || /eventSource\.on\s*\(/.test(npcNoComment)
    || /['"]CHAT_COMPLETION_PROMPT_READY['"]\s*,/.test(npcNoComment.replace(/CHAT_CHANGED/g, ''));
if (eventReg) bad('R6 引入原库注入路线', '检测到 CHAT_COMPLETION_PROMPT_READY 真注册（用户要求只取机制、本仓沿用 setExtensionPrompt）');
else ok('R6 未引入原库注入路线');
if (!/setExtensionPrompt/.test(idx)) bad('R6 注入口径丢失', '本仓 setExtensionPrompt 路线不在场（注入口径被替换？）');
else ok('R6 本仓注入口径在场');

// ── 结论 ──
//   注意：这里**不**用运行期 checks 计数做自证下界（会掩盖真实归因，见 R0 注释）。
console.log('[emo-opposite] 判据点 ' + checks + ' 处（骨架调用点 ' + callSites + '，下界 ' + EXPECT_CALLSITE_MIN + '）｜缺陷 ' + defects.length + ' 项');
if (defects.length) {
    for (const d of defects) console.log('  ✗ ' + d);
    process.exit(1);
}
console.log('  ✓ ' + NEEDLE_ROW + '召回卫生：词表归属对得上、生产有消费者、位置正确、读数可分辨、默认零行为变化、未引入原库注入路线');
process.exit(0);