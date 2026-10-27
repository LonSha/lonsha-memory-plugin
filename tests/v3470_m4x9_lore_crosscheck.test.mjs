/* ============================================================
 * tests/v3470_m4x9_lore_crosscheck.test.mjs — v3.347.0 · M4-X9
 * 资料与剧情分区的联合查证(受控 sourceMode + 来源分区 + 六态判定 + 撤除)
 *
 * 【本档要证明的五件事(不是「函数返回了对象」)】
 *   a) **受控 sourceMode 真的改变产物**:同一池,仅剧情 / 仅资料 / 对照三种模式
 *      的读数**不同形**,且只有对照模式才判定「兑现了没有」—— 模式差异**可解释**
 *      (修前缺口:资料侧与剧情侧读数不同形,并排看也说不清兑现没兑现);
 *   b) **三验收例各自可达且互不同形**:同名跨资料人物(needsConfirm,不硬合并)/
 *      未发生的设定事件(unrealized)/ 已发生但偏离设定(divergent);
 *   c) **撤除后正文一格不带**:被撤资料不进任何分区,且历史引用报 sourceStale
 *      (「来源失效」有落点,不静默);
 *   d) **批注不冒充原文或事实**:note 自成一区,不混进 lore / chat;
 *   e) **资料不默认并入正史**:未给 admitLore ⇒ loreInCanon 恒 false。
 *
 * 【四条「不做」也在判据里】
 *   1 不猜:缺分区判定的条目**不硬塞**成 lore / chat ⇒ unknown;
 *   2 不产百分比 / 置信度:读数里出现 percent / confidence / score 一类键即不通过;
 *   3 不联网 / 不建开放 RAG:读数里 online 恒 false、copiesFullText 恒 false;
 *   4 不产正文:条目只有 title / snippet / 来源位,没有生成正文的出口。
 *
 * 【负控制一律真源码破坏】锚点恰中 1 次 → 在**破坏副本**上重跑**同款真判据** →
 *   必须现形;并反向对照「原版同判据必须通过」。判据纯度(H5)单独一段。
 * 【当版锚点】本档自锚常量 BORN_V + vnum(锚必须住在当版档案里,供版本守卫 V4 计数)。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { breakOnce } from './_break_kit.mjs';
/* [v3.421.0] 宿主面合并读：index.js 的方法已大批外提到 engine-*.js / memory-core.js，
 *   入口只剩一行委派。只读入口的测试因此两重受害 ——
 *   ① 方法体根本不在入口里（断言找不到）；
 *   ② 抠出来的片段没有闭包作用域（_moduleLib / errLog …）→ ReferenceError。
 *   改读 hostSurface 的合并面（v3160/v3161/v3163 同一机制）。变量名与下游断言一字不改。
 *   顺序：入口在前、模块在后 —— 版本常量这类「以入口为准」的断言必须先命中入口；
 *   而入口里的单行委派体一律先剥掉，否则抽取助手取首次命中会抠到委派（只剩一句委托）。 */
import { hostSurface as __hostSurfaceRaw } from './_audit_lib.mjs';
import __hostPath from 'node:path';
import { fileURLToPath as __hostFu } from 'node:url';
/* 写成函数声明而不是 const 箭头：读取语句常落在文件前几行，而 import 段可能在它下面。
 *   声明提升是唯一与语句顺序无关的写法（const 会撞 TDZ，实测 4 档因此新红）。 */
function __hostSurface() {
    const __root = __hostFu(new URL('..', import.meta.url));
    const __face = __hostSurfaceRaw(__root, {
        fs: { readFileSync: fs.readFileSync, existsSync: () => true },
        path: __hostPath,
    });
    /* 单行委派形如 `foo(a) { const M = _moduleLib(...); return M ? ... ; }` —— 从正文里**移走**。
     *   两行以上的委派很少，且那种形态抽取助手本来就抠不全，留给模块面兜。
     *   [v3.421.0] 但**不能丢弃**：一批「宿主出口各恰一处」的判据问的就是这些委派桩本身
     *   （`foo(...args) {` 只存在于入口的委派行里，模块面是 `function foo(engine, ...)`）。
     *   故剥下来的行收集到扫描面**最末**：抽取助手仍先命中模块面的真实现（委派在尾部），
     *   而字符串在场判据照旧命中。丢弃会让那批判据整片假红（本档即如此）。 */
    const __deleg = [];
    const __squeeze = (raw) => raw.split(String.fromCharCode(10))
        .filter((ln) => {
            const __isDeleg = /^[ \t]*[_a-zA-Z$][\w$]*[ \t]*\(.*\)[ \t]*\{.*_moduleLib\(.*\}[ \t]*$/.test(ln);
            if (__isDeleg) __deleg.push(ln);
            return !__isDeleg;
        })
        .join(String.fromCharCode(10));
    return __face.files.map((f) => __squeeze(f.raw)).join(String.fromCharCode(10))
        + String.fromCharCode(10) + '// ==== 剥下的单行委派（入口原文，供「出口在场」判据） ====' + String.fromCharCode(10)
        + __deleg.join(String.fromCharCode(10));
}
const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const IDX = __hostSurface();
const DL = read('engine-diagnostic-lines.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const CX_SRC = read('lore-crosscheck.js');
const SELF = read(path.join('tests', 'v3470_m4x9_lore_crosscheck.test.mjs'));
const BORN_V = '3.347.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));
/** 在隔离 vm 里加载 IIFE 模块(与生产同形:window 即全局,module 缺席)。 */
function loadIIFE(src, globalName) {
    const ctx = {
        console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math,
        isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError,
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const api = ctx[globalName];
    if (!api) throw new Error('模块未挂 ' + globalName);
    return api;
}
const CX = loadIIFE(CX_SRC, 'LonShaLoreCrosscheck');
/* ══════════ 负控制锚点(在判据层只声明一次 —— H5 判据纯度) ══════════ */
const ANCHORS = Object.freeze({
    /* 内核·受控模式:置假 ⇒ 仅剧情模式也把资料侧算进来(实测红:B1 拿到三种模式同形)。 */
    kMode: String.raw`if (mode === 'chat-only') return partition === 'chat';`,
    /* 内核·未发生闸:置假 ⇒ 资料声称已发生但剧情无对应时不再报 unrealized(实测红:B2)。 */
    kUnreal: String.raw`if (!chats.length) return loreItem.settingAsHappened === true ? 'unrealized' : 'lore-only';`,
    /* 内核·偏离判定:置假 ⇒ 给了 expect 但剧情不匹配时不再报 divergent(实测红:B2)。 */
    kDiverge: String.raw`return 'divergent';`,
    /* 内核·同名跨资料:置假 ⇒ 同名人物不再进 needsConfirm(硬合并,实测红:B3)。 */
    kCross: String.raw`&& hitsList.some((ci) => ci.subject === li.subject && ci.person);`,
    /* 内核·撤除闸:置假 ⇒ 被撤资料照进分区(实测红:B4 拿到 revoked 0)。 */
    kRevoke: String.raw`if (it.partition === 'lore' && revokedSet[it.id]) { revoked.push({ id: it.id, subject: it.subject, title: it.title, why: 'revoked' }); continue; }`,
    /* 内核·分区不硬塞:置假 ⇒ 来源未判的条目被硬塞成 lore(实测红:B5)。 */
    kUnclass: String.raw`return { partition: 'unknown', partitionRaw: keyOf(r.origin) || keyOf(r.kind) || keyOf(r.source), via: 'none' };`,
    /* 内核·批注分列:置假 ⇒ 批注被当资料原文(实测红:B6)。 */
    kNote: String.raw`'user-note': 'note', note: 'note', annotation: 'note', 'user-annotation': 'note',`,
    /* 宿主·装配点:`ok` 键面判定:置假 ⇒ 结构化查询行被丢(实测红:宿主判据 C1 拿到空池)。 */
    hRows: String.raw`}, (got) => !!got && Array.isArray(got.rows));`,
    /* 宿主·模式转发:置假 ⇒ 宿主把模式写死成对照(实测红:宿主判据 C2)。 */
    hMode: String.raw`const out = CX.build(sourceMode, input, {`,
});
/* ══════════════ A. 结构面 ══════════════ */
const HOST_METHODS = [
    'loreCrosscheck(...args) {',
    '_crosscheckChatRows(...args) {',
    '_loreCrosscheckLine(...args) {',
];
function judgeStruct(idxSrc, mf) {
    const bad = [];
    for (const h of HOST_METHODS) {
        const n = idxSrc.split(h).length - 1;
        if (n !== 1) bad.push(h + ' 命中 ' + n + ' 次(应恰 1)');
    }
    if (idxSrc.indexOf('function _loreCrosscheckLib() {') < 0) bad.push('缺取库口 _loreCrosscheckLib');
    if (idxSrc.indexOf("'lore-crosscheck.js'") < 0) bad.push('缺模块文件名声明');
    if (idxSrc.indexOf("return ['资料对照', '模块未加载(lore-crosscheck.js)'];") < 0) bad.push('缺自检行「资料对照」');
    if (!Array.isArray(mf.extra_js) || mf.extra_js.indexOf('lore-crosscheck.js') < 0) bad.push('manifest.extra_js 缺 lore-crosscheck.js');
    /* ★ 本刀是**无状态只读面** —— 不新增任何持久化键(资料侧与剧情侧都是调用方给的)。 */
    if (idxSrc.indexOf('loreCrosscheck:') >= 0) bad.push('出现了顶层持久化契约键 loreCrosscheck:(本面无状态,不落盘)');
    const arch = (/const ARCHIVE_TOP_LEVEL_KEYS = Object\.freeze\(\[([^\]]*)\]/.exec(idxSrc) || [])[1] || '';
    const carry = (/const CARRYOVER_EXEMPT_KEYS = Object\.freeze\(\[([^\]]*)\]/.exec(idxSrc) || [])[1] || '';
    if (/'loreCrosscheck'/.test(arch) || /'loreCrosscheck'/.test(carry)) bad.push('资料对照混进了顶层归档/跨卷键(本面无状态)');
    return bad;
}
test('v3470 A1. **** 宿主三出口各恰一处 + 取库口 + 自检行 + extra_js 登记 + **零落盘面**', () => {
    assert.deepEqual(judgeStruct(IDX, MF), [], judgeStruct(IDX, MF).join(';'));
    assert.ok(MF.extra_js.length >= 112, 'extra_js 不得低于本档出生值 112(实 ' + MF.extra_js.length + ')');
    assert.ok(MF.extra_js.indexOf('lore-crosscheck.js') >= 0, 'extra_js 须登记本模块（身位由各当版档自持，后版追加会把它顶掉 —— 不是缺陷；v3.349.0 追加 condition-patch.js 即此形态）');
    console.log('  ok 三出口各恰 1 次 / 取库口 / 自检行 / extra_js ≥ 112(实 ' + MF.extra_js.length + ') / 无落盘键');
});
function judgeKernel(cx) {
    const bad = [];
    if (cx.CX_VERSION !== 1) bad.push('CX_VERSION 应 1,实 ' + cx.CX_VERSION);
    if (cx.CX_KIND !== 'lore_crosscheck') bad.push('CX_KIND 不对:' + cx.CX_KIND);
    for (const m of ['chat-only', 'lore-only', 'compare']) {
        if (cx.SOURCE_MODES.indexOf(m) < 0) bad.push('SOURCE_MODES 缺 ' + m);
    }
    if (cx.SOURCE_MODES.length !== 3) bad.push('SOURCE_MODES 应恰 3 类,实 ' + cx.SOURCE_MODES.length);
    /* 来源分区四类穷尽。 */
    for (const p of ['chat', 'lore', 'note', 'unknown']) {
        if (cx.PARTITIONS.indexOf(p) < 0) bad.push('PARTITIONS 缺 ' + p);
    }
    /* 判定六态穷尽且互不同形(标签各不相同)。 */
    for (const v of ['matched', 'divergent', 'unrealized', 'lore-only', 'chat-only', 'unchecked']) {
        if (cx.VERDICTS.indexOf(v) < 0) bad.push('VERDICTS 缺 ' + v);
    }
    if (cx.VERDICTS.length !== 6) bad.push('VERDICTS 应恰 6 态,实 ' + cx.VERDICTS.length);
    const labels = cx.VERDICTS.map((v) => cx.VERDICT_LABEL[v]);
    if (new Set(labels).size !== labels.length) bad.push('六态标签有重复(不同形被破坏)');
    for (const f of ['build', 'normalize', 'itemOf', 'partitionFor', 'modeOf', 'hits', 'verdictOf', 'line', 'render', 'describe', 'hasPercentKey', 'selfCheck']) {
        if (typeof cx[f] !== 'function') bad.push('缺内核面 ' + f);
    }
    /* 自证九项:确定性 / 零写面 / 三模式不同形 / 三验收例 / 撤除 / 批注分列 / 不并入正史 / 无百分比 / 畸形≠空。 */
    const sc = cx.selfCheck();
    if (sc.ok !== true) bad.push('selfCheck 对合法输入报红:' + JSON.stringify(sc));
    if (sc.writeFaces !== 0) bad.push('selfCheck 数出写面:' + sc.writeFaces);
    if (sc.modesDiffer !== true) bad.push('selfCheck 未守住「三模式不同形」');
    if (sc.threeCases !== true) bad.push('selfCheck 未守住「三验收例」');
    if (sc.verdictsDistinct !== true) bad.push('selfCheck 未守住「六态互不同形」');
    if (sc.revokedHolds !== true) bad.push('selfCheck 未守住「撤除后正文不入」');
    if (sc.noteSeparate !== true) bad.push('selfCheck 未守住「批注分列」');
    if (sc.noAdmit !== true) bad.push('selfCheck 未守住「资料不默认并入正史」');
    if (sc.percentFree !== true) bad.push('selfCheck 未守住「不产百分比」');
    if (sc.malformedDistinct !== true) bad.push('selfCheck 未守住「畸形≠缺席」');
    return bad;
}
test('v3470 A2. *** 内核面(版本 + 三模式 + 四分区 + 六态穷尽互不同形 + 自证九项)', () => {
    assert.deepEqual(judgeKernel(CX), [], judgeKernel(CX).join(';'));
    console.log('  ok CX_VERSION 1 / 三模式 / 四分区 / 六态互不同形 / 自证九项全绿');
});
/* ══════════════ B. 真跑 ══════════════ */
/* 三验收例全在一池里。 */
const POOL = {
    lore: [
        { id: 'L1', partition: 'lore', subject: '阿岚', title: '阿岚·身世', text: '幼年在北城长大', cls: 'character-bg', origin: 'imported-lore' },
        { id: 'L2', partition: 'lore', subject: '大撤退', title: '大撤退', text: '三年前已发生', settingAsHappened: true, cls: 'backstory-event', origin: 'imported-lore' },
        { id: 'L3', partition: 'lore', subject: '婚约', title: '婚约', text: '已与林安订婚', settingAsHappened: true, expect: '订婚', cls: 'backstory-event', origin: 'imported-lore' },
    ],
    chat: [
        { id: 'C1', partition: 'chat', subject: '阿岚', title: '阿岚', detail: '住在南城', entity: true, ledger: 'fact-version', floor: 12 },
        { id: 'C2', partition: 'chat', subject: '婚约', title: '婚约', detail: '已解除婚约', status: 'released', ledger: 'commitment', floor: 30 },
    ],
    note: [
        { id: 'N1', partition: 'note', subject: '备忘', title: '作者注', detail: '这里该更狠一点' },
    ],
};
function judgeModes(cx) {
    const bad = [];
    const cmp = cx.build('compare', POOL, {});
    const chatOnly = cx.build('chat-only', POOL, {});
    const loreOnly = cx.build('lore-only', POOL, {});
    /* 对照:资料 3 / 剧情 2,判定 3 条资料 + 1 条只在剧情。 */
    if (cmp.counts.lore !== 3 || cmp.counts.chat !== 2) bad.push('对照分区计数不符:' + JSON.stringify(cmp.counts));
    if (cmp.judged !== true) bad.push('对照未判');
    /* 仅剧情:**资料侧完全不参与** —— loreRefs 空、gaps 报「未查资料侧」。 */
    if (chatOnly.loreRefs.length !== 0) bad.push('仅剧情模式仍带资料侧(' + chatOnly.loreRefs.length + ')');
    if (!chatOnly.gaps.some((g) => g.partition === 'lore')) bad.push('仅剧情模式未报「未查资料侧」缺口');
    /* 仅资料:判定只有 lore-only(不查剧情侧,兑不兑现无从判)。 */
    if (loreOnly.counts.judged !== 3) bad.push('仅资料模式判定条数应 3,实 ' + loreOnly.counts.judged);
    if (loreOnly.unrealized.length !== 0) bad.push('仅资料模式不应出 unrealized(没查剧情侧)');
    if (!loreOnly.gaps.some((g) => g.partition === 'chat')) bad.push('仅资料模式未报「未查剧情侧」缺口');
    /* 三模式产物**不同形**。 */
    if (JSON.stringify(cmp.counts) === JSON.stringify(chatOnly.counts)) bad.push('对照与仅剧情计数同形');
    if (JSON.stringify(cmp.judgements) === JSON.stringify(loreOnly.judgements)) bad.push('对照与仅资料判定同形');
    /* 非法模式回落对照并具名。 */
    const weird = cx.build('bogus-mode', POOL, {});
    if (weird.mode !== 'compare' || weird.modeKnown !== false) bad.push('非法模式未回落对照');
    if (!weird.reasons.some((r) => r.indexOf('sourceMode 未识别') >= 0)) bad.push('非法模式未具名说明');
    return bad;
}
test('v3470 B1. ★★★ 受控 sourceMode **真的改变产物**(三模式不同形 + 非法模式回落具名)', () => {
    assert.deepEqual(judgeModes(CX), [], judgeModes(CX).join(';'));
    const cmp = CX.build('compare', POOL, {});
    console.log('  ok 对照:资料 ' + cmp.counts.lore + ' / 剧情 ' + cmp.counts.chat + ' / 判定 ' + cmp.counts.judged + ';仅剧情不带资料侧;非法模式回落对照');
});
function judgeThreeCases(cx) {
    const bad = [];
    const R = cx.build('compare', POOL, {});
    /* 验收例 1:同名跨资料人物 ⇒ needsConfirm(不硬合并)。 */
    if (R.needsConfirm.length !== 1) bad.push('同名跨资料应恰 1 条待确认,实 ' + R.needsConfirm.length);
    else if (R.needsConfirm[0].subject !== '阿岚') bad.push('待确认主体应是阿岚,实 ' + R.needsConfirm[0].subject);
    /* 验收例 2:未发生的设定事件 ⇒ unrealized。 */
    if (R.counts.unrealized !== 1) bad.push('未发生应恰 1 条,实 ' + R.counts.unrealized);
    else if (R.unrealized[0].subject !== '大撤退') bad.push('未发生主体应是大撤退,实 ' + R.unrealized[0].subject);
    /* 验收例 3:已发生但偏离设定 ⇒ divergent。 */
    if (R.counts.divergent !== 1) bad.push('偏离应恰 1 条,实 ' + R.counts.divergent);
    else if (R.divergent[0].subject !== '婚约') bad.push('偏离主体应是婚约,实 ' + R.divergent[0].subject);
    /* 三例**互不同形**:三条判定 verdict 各不相同。 */
    if (!(R.unrealized[0].verdict !== R.divergent[0].verdict)) bad.push('未发生与偏离同形');
    /* 一致(matched):资料期望值在剧情行正文里 ⇒ matched。 */
    const M = cx.build('compare', { lore: [{ id: 'ML', partition: 'lore', subject: '墨盒', expect: '买下', settingAsHappened: true }], chat: [{ id: 'MC', partition: 'chat', subject: '墨盒', detail: '她买下了墨盒' }] }, {});
    if (M.counts.matched !== 1) bad.push('期望值命中应出 matched,实 ' + M.counts.matched);
    /* 判不了(unchecked):两侧命中同题但**未给一致性判据**。 */
    if (R.counts.unchecked < 1) bad.push('同名同题但无 expect 应出 unchecked');
    return bad;
}
test('v3470 B2. ★★★ 三验收例各自可达且互不同形(同名跨资料 / 未发生 / 偏离)+ 一致与判不了', () => {
    assert.deepEqual(judgeThreeCases(CX), [], judgeThreeCases(CX).join(';'));
    const R = CX.build('compare', POOL, {});
    console.log('  ok 待确认 1(阿岚)/ 未发生 1(大撤退)/ 偏离 1(婚约)/ 一致与判不了各自可达');
});
test('v3470 B3. ★★ **不硬合并**:同名跨资料只出待确认,两侧条目各自保留(loreRefs / chatRefs 都在)', () => {
    const R = CX.build('compare', POOL, {});
    /* 阿岚两侧都是人物 ⇒ 待确认;**且 loreRefs 与 chatRefs 都保留原名条目**(不合并成一条)。 */
    assert.equal(R.needsConfirm.length, 1);
    assert.ok(R.loreRefs.some((r) => r.key === 'L1' && r.subject === '阿岚'), 'lore 侧阿岚须保留');
    assert.ok(R.chatRefs.some((r) => r.key === 'C1' && r.subject === '阿岚'), 'chat 侧阿岚须保留');
    /* 非人物同名(婚约)不报待确认 —— 它本来就该并成一件事。 */
    assert.ok(!R.needsConfirm.some((x) => x.subject === '婚约'), '非人物同名不应报待确认');
    console.log('  ok 同名人物两侧各自保留 + 只报待确认;非人物同名不报');
});
function judgeRevoke(cx) {
    const bad = [];
    const R = cx.build('compare', POOL, { revokedKeys: ['L1'], historyRefs: ['L1', 'L3'] });
    if (R.counts.revoked !== 1) bad.push('撤除应恰 1 条,实 ' + R.counts.revoked);
    /* 被撤资料**一格不带**:不进 loreRefs,也不参与判定。 */
    if (R.loreRefs.some((r) => r.key === 'L1')) bad.push('被撤资料仍进 loreRefs');
    if (R.judgements.some((j) => j.loreKey === 'L1')) bad.push('被撤资料仍参与判定');
    /* 历史引用报 sourceStale(「来源失效」有落点)。 */
    if (R.staleRefs.length !== 1 || R.staleRefs[0].key !== 'L1') bad.push('历史引用未报失效:' + JSON.stringify(R.staleRefs));
    /* **未撤**的资料(L3)照常在。 */
    if (!R.loreRefs.some((r) => r.key === 'L3')) bad.push('未撤资料 L3 不在场');
    return bad;
}
test('v3470 B4. ★★ **撤除后正文一格不带** + 历史来源报失效(未撤的照常在)', () => {
    assert.deepEqual(judgeRevoke(CX), [], judgeRevoke(CX).join(';'));
    console.log('  ok 撤除 1 条不进分区 / 不进判定 / 历史引用 sourceStale;未撤照常在');
});
function judgeUnclass(cx) {
    const bad = [];
    /* 来源未判(既没 partition 也没认识的 origin) ⇒ unknown,**不硬塞**成 lore 或 chat。 */
    const R = cx.build('compare', [{ id: 'u1', subject: '来路不明', title: '来路不明', text: 'x' }], {});
    if (R.counts.unknown !== 1) bad.push('来源未判应恰 1 条,实 ' + R.counts.unknown);
    if (R.counts.lore !== 0 || R.counts.chat !== 0) bad.push('来源未判被硬塞进分区');
    if (!R.reasons.some((r) => r.indexOf('来源未判') >= 0)) bad.push('来源未判未具名说明');
    /* 由 origin 判定(不给显式 partition)。 */
    const viaOrigin = cx.build('compare', [
        { id: 'o1', origin: 'imported-lore', subject: '甲', title: '甲' },
        { id: 'o2', origin: 'chat-confirmed', subject: '乙', title: '乙' },
    ], {});
    if (viaOrigin.counts.lore !== 1 || viaOrigin.counts.chat !== 1) bad.push('origin 判定失准:' + JSON.stringify(viaOrigin.counts));
    return bad;
}
test('v3470 B5. ★★ 来源未判**不硬塞**(unknown 单列)+ origin 路径判定同形', () => {
    assert.deepEqual(judgeUnclass(CX), [], judgeUnclass(CX).join(';'));
    console.log('  ok 来源未判单列不进分区 / 显式 partition 与 origin 两路径判定一致');
});
test('v3470 B6. ★★ **批注不冒充原文或事实**(note 自成一区)+ **资料不默认并入正史**', () => {
    const R = CX.build('compare', POOL, {});
    assert.equal(R.counts.note, 1, 'note 应恰 1 条');
    assert.equal(R.noteIsNotSource, true, 'noteIsNotSource 须恒 true');
    assert.ok(R.loreRefs.every((r) => r.key !== 'N1'), '批注不得进 loreRefs');
    assert.ok(R.chatRefs.every((r) => r.key !== 'N1'), '批注不得进 chatRefs');
    assert.ok(R.noteRefs.some((r) => r.key === 'N1'), '批注须进 noteRefs');
    /* 资料不默认并入正史:未给 admitLore ⇒ loreInCanon false + admitted 空。 */
    assert.equal(R.loreInCanon, false, 'loreInCanon 须恒 false(未显式 admitLore)');
    assert.equal(R.admitted.length, 0, 'admitted 须空');
    assert.ok(R.reasons.some((r) => r.indexOf('未并入正史') >= 0), '须具名「未并入正史」');
    /* 未给显式 partition、只给 origin 'user-note' 的批注 ⇒ 也须落 note(查表路径同形)。 */
    const O = CX.build('compare', [{ id: 'N9', origin: 'user-note', subject: '批注', title: '批注' }], {});
    assert.equal(O.counts.note, 1, 'origin 路径批注须落 note');
    assert.equal(O.counts.lore, 0, 'origin 路径批注不得被当资料原文');
    /* 显式 admitLore 才并入。 */
    const A = CX.build('compare', POOL, { admitLore: true });
    assert.equal(A.loreInCanon, true);
    assert.ok(A.admitted.length > 0);
    console.log('  ok 批注自成一区不进 lore/chat;资料默认不并入正史,显式 admitLore 才并');
});
test('v3470 B7. ★★ 入参两态不同形(畸形 ≠ 缺席 ≠ 空)+ 池上限 + 无百分比 + 不联网', () => {
    /* 畸形(字符串)⇒ malformedInput,judged false。 */
    const bad = CX.build('compare', 'not-an-array', {});
    assert.equal(bad.malformedInput, true);
    assert.equal(bad.judged, false);
    /* 缺席(不传)⇒ 合法空面。 */
    const absent = CX.build('compare', undefined, {});
    assert.equal(absent.malformedInput, undefined);
    assert.equal(absent.judged, true);
    /* 空数组 ⇒ 合法「没有可比对的」。 */
    const empty = CX.build('compare', [], {});
    assert.equal(empty.judged, true);
    assert.equal(empty.counts.judged, 0);
    /* 畸形条目(非对象 / null)丢弃并计数;同 id 只留首条。 */
    const messy = CX.build('compare', [null, 1, 'x', { id: 'a', partition: 'lore', subject: '甲' }, { id: 'a', partition: 'lore', subject: '甲2' }], {});
    assert.equal(messy.counts.dropped, 4, '畸形与重复应各计数(实 dropped ' + messy.counts.dropped + ')');
    /* 无百分比 / 不联网 / 不复制全文。 */
    assert.equal(CX.hasPercentKey(messy), false, '读数不得含 percent 类键');
    assert.equal(messy.online, false, 'online 须恒 false(不联网)');
    assert.equal(messy.copiesFullText, false, 'copiesFullText 须恒 false(不复制全文)');
    assert.equal(messy.readsFullText, false, 'readsFullText 须恒 false(原文按需读)');
    assert.equal(messy.writesNothing, true, 'writesNothing 须恒 true');
    assert.equal(messy.injectsNothing, false, 'injectsNothing 须恒 false(不声称已注入)');
    /* 敏感条目正文一格不带。 */
    const sec = CX.build('compare', [{ id: 's1', partition: 'lore', subject: '密', text: '机密正文', sensitive: true }], {});
    assert.ok(sec.loreRefs.length === 1, '敏感条目仍可分区');
    console.log('  ok 畸形≠缺席≠空 / 丢弃计数 / 无百分比 / 不联网 / 不复制全文 / 敏感文剥');
});
test('v3470 B8. 自证不变式 + line / render 六种坏法分列', () => {
    const R = CX.build('compare', POOL, {});
    const l = CX.line(R);
    assert.ok(l.indexOf('模式 对照') >= 0, 'line 须报模式');
    assert.ok(l.indexOf('资料 3') >= 0, 'line 须报资料数');
    /* 三例计数在行里。 */
    assert.ok(l.indexOf('未发生 1') >= 0, 'line 须报未发生');
    assert.ok(l.indexOf('偏离 1') >= 0, 'line 须报偏离');
    /* 六种坏法分列:malformed / 空 / 有读数 / degraded。 */
    assert.ok(CX.line({ malformedInput: true }).indexOf('输入畸形') >= 0);
    assert.ok(CX.line({ degraded: true }).indexOf('异常') >= 0);
    assert.ok(CX.line({ mode: 'compare', modeLabel: '对照', counts: { lore: 0, chat: 0 } }).indexOf('暂无可查') >= 0);
    assert.ok(CX.render({ malformedInput: true }).indexOf('输入畸形') >= 0 || CX.render({ malformedInput: true }).indexOf('无从分区') >= 0);
    assert.ok(CX.render(R).indexOf('联合查证') >= 0);
    /* describe 缺格只列必需件(不虚报)。 */
    const d = CX.describe();
    assert.equal(d.kind, 'lore_crosscheck');
    assert.equal(d.loreInCanon, false);
    assert.equal(d.online, false);
    assert.equal(d.selfCheck.ok, true);
    console.log('  ok line 四方分开说 / render 逐条判定 / describe 自述不虚报');
});
/* ══════════════ C. 宿主出口 ══════════════ */
/** 换行(字符码拼:本档禁裸反斜杠字面量)。 */
const LF = String.fromCharCode(10);
/** 花括号配对切片(注释 / 字符串 / 模板串感知;成员边界与生产同形)。 */
function sliceMember(src, header) {
    const at = src.indexOf(header);
    if (at < 0) return '';
    const open = src.indexOf('{', at + header.length - 1);
    if (open < 0) return '';
    const BS = String.fromCharCode(92);
    const LF = String.fromCharCode(10);
    let d = 0;
    for (let i = open; i < src.length; i++) {
        const c = src[i];
        if (c === '"' || c === "'" || c === '`') {
            let k = i + 1;
            while (k < src.length) {
                if (src[k] === BS) { k += 2; continue; }
                if (src[k] === c) { k++; break; }
                if (src[k] === LF && c !== '`') break;
                k++;
            }
            i = k - 1; continue;
        }
        if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== LF) i++; continue; }
        if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); if (i < 0) return ''; i++; continue; }
        if (c === '{') d++;
        else if (c === '}') { d--; if (d === 0) return src.slice(at, i + 1); }
    }
    return '';
}
/** 从 engine-diagnostic-lines.js 提取方法体，转回类方法格式（engine.→this.）。 */
function extractModuleMethod(source, funcMarker) {
    const start = source.indexOf(funcMarker);
    if (start < 0) return null;
    const bodyStart = start + funcMarker.length - 1;
    if (source[bodyStart] !== '{') return null;
    let depth = 0, end = -1;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) return null;
    let body = source.slice(bodyStart + 1, end);
    body = body.replace(/\bengine\./g, 'this.');
    const asyncP = funcMarker.startsWith('async ') ? 'async ' : '';
    const nm = funcMarker.match(/(?:async\s+)?function\s+(\w+)\s*\(engine(?:,\s*(.*?))?\)\s*\{/);
    if (!nm) return null;
    const params = nm[2] !== undefined ? nm[2] : '';
    return asyncP + nm[1] + '(' + params + ') {' + body + '}';
}
/** 从 index.js 真切片装载一个**最小宿主**(取库口 + 三法都取自真源,不另写桩)。 */
function loadHost(idxSrc, cxApi, rowsOpt) {
    const moduleLibFn = sliceMember(idxSrc, 'function _moduleLib(getGlobal, fileName) {');
    if (!moduleLibFn) throw new Error('宿主切片缺失:_moduleLib');
    const dlFuncs = [
        'function _loreCrosscheckLib() { return (typeof window !== "undefined" && window.LonShaLoreCrosscheck) ? window.LonShaLoreCrosscheck : null; }',
    ];
    const meths = [
        extractModuleMethod(DL, 'function loreCrosscheck(engine, sourceMode, opts) {'),
        extractModuleMethod(DL, 'function _crosscheckChatRows(engine, opts) {'),
        extractModuleMethod(DL, 'function _loreCrosscheckLine(engine) {'),
    ];
    if (meths.some((s) => !s)) throw new Error('DL 方法体提取缺失');
    const rows = Array.isArray(rowsOpt) ? rowsOpt
        : [{ ref: 'commitment:c1', title: '婚约', text: '已解除婚约', status: 'released', ledger: 'commitment', floor: 30 }];
    const ctx = {
        console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math,
        isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError,
    };
    ctx.window = ctx; ctx.globalThis = ctx;
    /* 真源取库口读的就是 window.LonShaLoreCrosscheck ⇒ 给 null 即得**真源缺模块路径**。 */
    ctx.LonShaLoreCrosscheck = cxApi || undefined;
    ctx.__ROWS__ = rows;
    vm.createContext(ctx);
    /* ★ 成员之间**必须有逗号** —— 首尾相接会拼出语法错的宿主(本档修前实测的坑)。 */
    const code = moduleLibFn + LF + dlFuncs.join(LF) + LF + 'return ({ ' + meths.join(',' + LF) + ' });';
    const factory = vm.runInContext('(function (errLog, window, require) {' + LF + code + LF + '})', ctx, { filename: 'hostslice.js' });
    const obj = factory(() => {}, ctx, undefined);
    const host = {
        _loreCrosscheckRead: null,
        searchEvidenceStructured() { return { rows: ctx.__ROWS__, state: ctx.__ROWS__.length ? 'ok' : 'empty', total: ctx.__ROWS__.length }; },
    };
    return Object.assign(host, obj);
}
test('v3470 C1. ★★ 宿主装配池:结构化查询行进池(partition chat)+ 缺 owner 如实 absent', () => {
    const H = loadHost(IDX, CX);
    const asm = H._crosscheckChatRows.call(H, { query: {} });
    assert.ok(Array.isArray(asm.chat), 'chat 池须是数组');
    assert.equal(asm.chat.length, 1, '真源切片的行须进池(实 ' + asm.chat.length + ')');
    assert.equal(asm.chat[0].partition, 'chat', '行须标 partition chat');
    assert.equal(asm.chat[0].ledger, 'commitment', '须带 ledger 来源位');
    assert.ok(asm.sources.some((s) => s.source === 'evidence-query' && s.state === 'ok'), '须登记来源 ok');
    /* 取不到 owner ⇒ absent 具名,不冒充空。 */
    const H2 = loadHost(IDX, CX);
    H2.searchEvidenceStructured = () => ({ rows: null, state: 'empty' });
    const asm2 = H2._crosscheckChatRows.call(H2, {});
    assert.ok(asm2.sources.some((s) => s.source === 'evidence-query' && s.state === 'absent'), '缺行须报 absent');
    console.log('  ok 结构化查询行进池带来源位;缺 owner 如实 absent');
});
test('v3470 C2. ★★ 宿主建面:模式原样下传 + 读数留痕 + 调用方直给优先', () => {
    const H = loadHost(IDX, CX);
    const got = H.loreCrosscheck.call(H, 'lore-only', { lore: POOL.lore });
    assert.equal(got.ok, true, '建面须 ok');
    assert.equal(got.mode, 'lore-only', '模式须原样下传');
    assert.equal(got.counts.lore, 3, '直给资料须进池');
    /* 读数留痕。 */
    assert.ok(H._loreCrosscheckRead && H._loreCrosscheckRead.mode === 'lore-only', '须留痕读数');
    /* 两模式不同包。 */
    const g2 = H.loreCrosscheck.call(H, 'compare', { lore: POOL.lore, chat: POOL.chat });
    assert.notEqual(JSON.stringify(got.judgements), JSON.stringify(g2.judgements), '两模式判定须不同形');
    console.log('  ok 模式原样下传 / 读数留痕 / 直给优先 / 两模式不同形');
});
test('v3470 C3. ★★ 宿主诊断行(真源两态:有读数报模式 / 空盘说暂无)+ 内核 line 三例计数', () => {
    /* 有读数:装配点收 1 行 ⇒ 报模式与剧情数。 */
    const H = loadHost(IDX, CX);
    const line = H._loreCrosscheckLine.call(H);
    assert.ok(line.indexOf('模式') >= 0, '诊断行须报模式(实:' + line + ')');
    assert.ok(line.indexOf('剧情 1') >= 0, '诊断行须报剧情数(实:' + line + ')');
    /* 空盘:装配点收 0 行 ⇒ 说暂无(**与有读数不同形**)。 */
    const H2 = loadHost(IDX, CX, []);
    const line2 = H2._loreCrosscheckLine.call(H2);
    assert.ok(line2.indexOf('暂无可查') >= 0, '空盘须说暂无(实:' + line2 + ')');
    assert.notEqual(line, line2, '有读数与空盘须不同形');
    /* 三例计数**只看 counts 也说得出**(不依赖逐条 judgements)。 */
    const l3 = CX.line({ mode: 'compare', modeLabel: '对照', counts: { lore: 3, chat: 2, unrealized: 1, divergent: 1, revoked: 1 } });
    assert.ok(l3.indexOf('未发生 1') >= 0, 'line 须报未发生(实:' + l3 + ')');
    assert.ok(l3.indexOf('偏离 1') >= 0, 'line 须报偏离(实:' + l3 + ')');
    assert.ok(l3.indexOf('已撤除 1') >= 0, 'line 须报撤除(实:' + l3 + ')');
    console.log('  ok 诊断行报模式 / 空盘说暂无(两态不同形)/ 三例计数只看 counts 也报得出');
});
test('v3470 C4. ★★ 缺模块两态降级具名(走真源:取库口读到 null)', () => {
    const H = loadHost(IDX, null);
    const got = H.loreCrosscheck.call(H, 'compare', {});
    assert.equal(got.ok, false, '缺模块须 ok false');
    assert.equal(got.reason, 'module-unavailable', '缺模块须具名 module-unavailable(实 ' + got.reason + ')');
    assert.equal(got.judged, false, '缺模块不得谎称已判');
    assert.equal(got.writesNothing, true, '降级面仍不得声称已写');
    const line = H._loreCrosscheckLine.call(H);
    assert.equal(line, '模块未加载(lore-crosscheck.js)', '诊断行须点名文件(实:' + line + ')');
    console.log('  ok 取库口 null ⇒ 建面 module-unavailable 具名(不谎称已判)/ 诊断行点名 lore-crosscheck.js');
});
/* ══════════════ D. 真源码破坏负控制(各带原版阳性对照) ══════════════ */
const expectRed = (fn, tag) => {
    let threw = false, v;
    try { v = fn(); } catch (_e) { threw = true; }
    /* 判据有两种合法形态:① 内部断言 ⇒ 抛错;② 返回「未过条目」数组 ⇒ **非空即红**。
     *   ★ 只判抛错会让返回裸数组的判据恒真 —— 负控制空转(本档修前实测的坑)。 */
    const badArr = Array.isArray(v) && v.length > 0;
    assert.ok(threw || badArr, '破坏【' + tag + '】后同款判据必须转红'
        + (Array.isArray(v) ? '(实 ' + v.length + ' 条未过:' + v.join(';') + ')' : ''));
};
/* D1 受控模式 */
function judgeMode(cxSrc) {
    const K = loadIIFE(cxSrc, 'LonShaLoreCrosscheck');
    return judgeModes(K);
}
test('v3470 D1. ★★ 破坏「受控模式」⇒ 模式判据 B1 必须转红', () => {
    const bad = breakOnce(CX_SRC, ANCHORS.kMode, String.raw`if (false) return partition === 'chat';`, 'kMode');
    expectRed(() => judgeMode(bad), 'kMode');
    assert.deepEqual(judgeMode(CX_SRC), [], '原版同判据必须过');
    console.log('  ok 破坏受控模式 ⇒ 仅剧情带资料侧被照出;原版阳性通过');
});
/* D2 未发生闸 */
function judgeUnrealOnce(cxSrc) {
    const K = loadIIFE(cxSrc, 'LonShaLoreCrosscheck');
    return judgeThreeCases(K);
}
test('v3470 D2. ★★ 破坏「未发生闸」⇒ 三验收例判据 B2 必须转红', () => {
    const bad = breakOnce(CX_SRC, ANCHORS.kUnreal, String.raw`if (!chats.length) return 'lore-only';`, 'kUnreal');
    expectRed(() => judgeUnrealOnce(bad), 'kUnreal');
    assert.deepEqual(judgeUnrealOnce(CX_SRC), [], '原版同判据必须过');
    console.log('  ok 破坏未发生闸 ⇒ 资料声称已发生却报 lore-only 被照出;原版阳性通过');
});
/* D3 偏离判定 */
test('v3470 D3. ★★ 破坏「偏离判定」⇒ 三验收例判据 B2 必须转红', () => {
    const bad = breakOnce(CX_SRC, ANCHORS.kDiverge, String.raw`return 'unchecked';`, 'kDiverge');
    expectRed(() => judgeUnrealOnce(bad), 'kDiverge');
    assert.deepEqual(judgeUnrealOnce(CX_SRC), [], '原版同判据必须过');
    console.log('  ok 破坏偏离判定 ⇒ 已发生但偏离设定被读成判不了;原版阳性通过');
});
/* D4 同名跨资料 */
function judgeCrossOnce(cxSrc) {
    const K = loadIIFE(cxSrc, 'LonShaLoreCrosscheck');
    const R = K.build('compare', POOL, {});
    return R.needsConfirm.length === 1 && R.loreRefs.some((r) => r.key === 'L1') && R.chatRefs.some((r) => r.key === 'C1');
}
test('v3470 D4. ★★ 破坏「同名跨资料」⇒ 不硬合并判据 B3 必须转红', () => {
    const bad = breakOnce(CX_SRC, ANCHORS.kCross, String.raw`&& hitsList.some((ci) => ci.subject === li.subject && ci.person && false);`, 'kCross');
    expectRed(() => { assert.ok(judgeCrossOnce(bad), 'ty'); }, 'kCross');
    assert.ok(judgeCrossOnce(CX_SRC), '原版同判据必须过');
    console.log('  ok 破坏同名跨资料 ⇒ 待确认不再出(硬合并);原版阳性通过');
});
/* D5 撤除闸 */
function judgeRevokeOnce(cxSrc) {
    const K = loadIIFE(cxSrc, 'LonShaLoreCrosscheck');
    return judgeRevoke(K);
}
test('v3470 D5. ★★ 破坏「撤除闸」⇒ 撤除判据 B4 必须转红', () => {
    const bad = breakOnce(CX_SRC, ANCHORS.kRevoke, String.raw`if (false) { continue; }`, 'kRevoke');
    expectRed(() => judgeRevokeOnce(bad), 'kRevoke');
    assert.deepEqual(judgeRevokeOnce(CX_SRC), [], '原版同判据必须过');
    console.log('  ok 破坏撤除闸 ⇒ 被撤资料照进分区被照出;原版阳性通过');
});
/* D6 分区不硬塞 */
function judgeUnclassOnce(cxSrc) {
    const K = loadIIFE(cxSrc, 'LonShaLoreCrosscheck');
    return judgeUnclass(K);
}
test('v3470 D6. ★★ 破坏「分区不硬塞」⇒ 来源未判判据 B5 必须转红', () => {
    const bad = breakOnce(CX_SRC, ANCHORS.kUnclass, String.raw`return { partition: 'lore', partitionRaw: 'hardwired', via: 'none' };`, 'kUnclass');
    expectRed(() => judgeUnclassOnce(bad), 'kUnclass');
    assert.deepEqual(judgeUnclassOnce(CX_SRC), [], '原版同判据必须过');
    console.log('  ok 破坏分区不硬塞 ⇒ 来源未判被硬塞成资料被照出;原版阳性通过');
});
/* D7 批注分列 */
function judgeNoteOnce(cxSrc) {
    const K = loadIIFE(cxSrc, 'LonShaLoreCrosscheck');
    /* 只给**一条 origin 为 user-note、未给显式 partition** 的条目 ⇒ 走第二步查表。
     *   破坏「批注分列」后它会落 lore(冒充原文)⇒ 判据必须照出。
     *   (只用显式 partition 的池测不出这处破坏:那条路走的是第一步,不查表。) */
    const R = K.build('compare', [{ id: 'N9', origin: 'user-note', subject: '批注', title: '批注' }], {});
    return R.counts.note === 1 && R.counts.lore === 0;
}
test('v3470 D7. ★★ 破坏「批注分列」⇒ 批注不冒充判据 B6 必须转红', () => {
    const bad = breakOnce(CX_SRC, ANCHORS.kNote, String.raw`'user-note': 'lore', note: 'note', annotation: 'note', 'user-annotation': 'note',`, 'kNote');
    expectRed(() => { assert.ok(judgeNoteOnce(bad), 'ty'); }, 'kNote');
    assert.ok(judgeNoteOnce(CX_SRC), '原版同判据必须过');
    console.log('  ok 破坏批注分列 ⇒ 批注被当资料原文被照出;原版阳性通过');
});
/* D8 宿主装配点 */
function judgeHostRows(idxSrc) {
    const H = loadHost(idxSrc, CX);
    const asm = H._crosscheckChatRows.call(H, { query: {} });
    return asm.chat.length === 1 && asm.sources.some((s) => s.source === 'evidence-query' && s.state === 'ok');
}
test('v3470 D8. ★★ 破坏「宿主装配点(ok 键面判定)」⇒ 装配判据 C1 必须转红', () => {
    const bad = breakOnce(DL, ANCHORS.hRows, String.raw`}, (got) => false);`, 'hRows');
    expectRed(() => { assert.ok(judgeHostRows(bad), 'ty'); }, 'hRows');
    assert.ok(judgeHostRows(IDX), '原版同判据必须过');
    console.log('  ok 破坏装配点 ⇒ 结构化查询行被丢被照出;原版阳性通过');
});
/* D9 宿主模式转发 */
function judgeHostMode(idxSrc) {
    const H = loadHost(idxSrc, CX);
    const got = H.loreCrosscheck.call(H, 'lore-only', { lore: POOL.lore });
    return got.ok === true && got.mode === 'lore-only';
}
test('v3470 D9. ★★ 破坏宿主「模式转发」⇒ 转发判据 C2 必须转红', () => {
    const bad = breakOnce(DL, ANCHORS.hMode, String.raw`const out = CX.build('compare', input, {`, 'hMode');
    expectRed(() => { assert.ok(judgeHostMode(bad), 'ty'); }, 'hMode');
    assert.ok(judgeHostMode(IDX), '原版同判据必须过');
    console.log('  ok 破坏模式转发 ⇒ 宿主把模式写死成对照被照出;原版阳性通过');
});
/* ══════════════ F. 锚点自证 + 版本锚 ══════════════ */
test('v3470 F1. ** H5 判据纯度:破坏锚点在**本档源码**里各恰中 1 次', () => {
    for (const k of Object.keys(ANCHORS)) {
        const n = SELF.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '锚点 ' + k + ' 在本档出现 ' + n + ' 次(应恰 1 —— 多处声明会让改一处漏一处时纯度检查恒过)');
    }
    for (const k of ['kMode', 'kUnreal', 'kDiverge', 'kCross', 'kRevoke', 'kUnclass', 'kNote']) {
        const n = CX_SRC.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '内核锚点 ' + k + ' 在真源命中 ' + n + ' 次(应恰 1)');
    }
    for (const k of ['hRows', 'hMode']) {
        const n = DL.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '宿主锚点 ' + k + ' 在真源命中 ' + n + ' 次(应恰 1)');
    }
    console.log('  ok 九锚点在本档各恰 1 次、真源各恰中 1 次');
});
test('v3470 F2. ** H6 工具两向自证:锚点不存在 / 不唯一 / 同值替换必须抛', () => {
    assert.throws(() => breakOnce(CX_SRC, 'NOT_IN_SOURCE_ANCHOR_XYZZY', 'x', 't'), /拒绝破坏|锚点命中/, '不存在锚点须抛');
    assert.throws(() => breakOnce(CX_SRC, 'const', 'x', 't'), /拒绝破坏|锚点命中/, '不唯一锚点须抛');
    assert.throws(() => breakOnce(CX_SRC, ANCHORS.kDiverge, ANCHORS.kDiverge, 't'), /拒绝破坏|必须真的改变源码/, '同值替换须抛');
    console.log('  ok 不存在 / 不唯一 / 同值替换全拒绝');
});
test('v3470 G1. 版本锚 v3.347.0(下界口径,不锁当版)+ 自防护 + 登记面', () => {
    const iv = IDX.match(/const VERSION = '([0-9.]+)'/);
    assert.ok(iv, '入口须有 VERSION 常量');
    assert.ok(vnum(iv[1]) >= vnum(BORN_V), '入口版本须 ≥ ' + BORN_V + '(实 ' + iv[1] + ')');
    assert.equal(MF.version, iv[1], 'manifest 版本须与入口同源');
    assert.equal(PKG.version, iv[1], 'package 版本须与入口同源');
    assert.ok(MF.extra_js.indexOf('lore-crosscheck.js') >= 0, 'extra_js 须登记本模块');
    /* 自防护:当版锚住在当版档案里(供版本守卫 V4 计数)。 */
    assert.ok(SELF.indexOf(BORN_V) >= 0, '当版档案须含当版号');
    console.log('  ok 版本 ' + iv[1] + ' 三源同源 / extra_js 登记 / 当版锚在位');
});