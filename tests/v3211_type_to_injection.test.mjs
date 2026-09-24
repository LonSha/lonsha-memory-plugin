/* ============================================================
 * tests/v3211_type_to_injection.test.mjs — v3.211.0
 *
 * 主题：事实类型从「登记」接到「注入」—— 修 v3.210.0 留下的三处**功能级失效**。
 *
 * 修前实测（本轮真跑取证，不是读源码推算）：
 *  A. 落笔侧「显式类型通道」是死的：`_absorbFactVersions` 的第一通道读 `extracted.facts[]`，
 *     但 extractionPrompt 的 schema 里**根本没有 facts 字段**
 *     （`"facts" in prompt == False`，实测 prompt 长 6197 字符、含 cse_states/location/plot_arcs）。
 *     于是「显式给 type」这条路在真实运行中不可达 —— 注释声称吃两种输入，通道①从未有输入。
 *  B. 注入侧三个出口零消费：`routeForType` / `typedBuckets` / `policyOfType` 在宿主侧
 *     **零调用点**；buildInjection 里 `factVersions` / `LonShaMemoryType` 一个字都没有。
 *     后果：类型系统把事实分了九类、每类定了可见性与生命周期，但**从不进模型上下文**，
 *     只活在 selfCheck 诊断行里。
 *  C. 拼错类型名会让一条**存在**的事实静默消失：
 *     `lookup(st, {subject:'A', predicate:'居住', type:'chracter-state'})`（拼错）返回
 *     `{ok:true, reason:'none', facts:[]}` —— 与「这个主语从没有过该属性的事实」**完全同形**。
 *  D. 「并列事实」被读成「矛盾未决」：E 的「结果=A 赢了」「结果=B 赢了」两条 coexist
 *     并存后，现状查询拿到 `ambiguous`（无法裁决）—— 而语义上它们是两条并列事实。
 *
 * 覆盖：
 *   0  版本锚 + 三源互等 + 当版锚点
 *   1  未知类型拒绝（三态可分：absent / ok / unknown）
 *   2  类型校验器注入口（setTypeValidator / typeStateOf）+ 未注入时降级放行
 *   3  conflictPolicy 落条（读回口径 + 旧条目向后兼容 + 与返回体同名布尔字段**不得混用**）
 *   4  lookup 的 multiple / ambiguous **两态可分**
 *   5  对键不得按策略分流（曾试行「值并入对键」实测有害，逐字守回）
 *   6  落笔侧 facts[] 通道：schema 在场 + 迁移补通道（对 HEAD 旧提示词真跑 fuzzy-patch）
 *   7  注入面真跑：抽真方法体 typedFactsBlocks + fake engine，稳定/波动两块可分辨
 *   8  常驻标记三处真源一致（index.js / injection-router / cost-ledger）
 *   9  三个零消费出口已被真消费（结构化判据，不用文本包含当判据）
 *  10  判据纯度：负控制必须是「真源码破坏 + 同款真判据重跑」
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { stripComments, braceMatch as libBraceMatch } from './_audit_lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SELF_PATH = fileURLToPath(import.meta.url);
const SELF = readFileSync(SELF_PATH, 'utf-8');

const MTF = join(ROOT, 'memory-type.js');
const FVF = join(ROOT, 'fact-version.js');
const IDX = join(ROOT, 'index.js');
const MF = join(ROOT, 'manifest.json');
const IRR = join(ROOT, 'injection-router.js');
const CLF = join(ROOT, 'cost-ledger.js');

const req = createRequire(import.meta.url);
const MT = req(MTF);
const FV = req(FVF);
const IR = req(IRR);
const CL = req(CLF);
const idxSrc = readFileSync(IDX, 'utf-8');
const fvSrc = readFileSync(FVF, 'utf-8');
const mtSrc = readFileSync(MTF, 'utf-8');
const irSrc = readFileSync(IRR, 'utf-8');
const clSrc = readFileSync(CLF, 'utf-8');
const mf = JSON.parse(readFileSync(MF, 'utf-8'));

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok ' + m); };
const bad = (m) => { fail++; console.error('  ✗ ' + m); };
/** 断言包装：失败不断链（与 v3208~v3210 同风格，最后统一 exitCode）。 */
const A = (cond, msg) => { if (cond) ok(msg); else bad(msg); };

const S = () => FV.normalize(null);
const T = (sub, pred, val, type, from) => ({ subject: sub, predicate: pred, value: val, type: type, from: from == null ? 1 : from, floor: from == null ? 1 : from });

/* ══════════ 工具：真源码切段（委托唯一真源，不本地重写） ══════════ */
function braceMatch(src, i, label) {
    if (src[i] !== '{') throw new Error('[braceMatch] ' + (label || '') + ' 起点不是 {');
    const stripped = stripComments(src);
    const chunk = libBraceMatch(stripped, i);
    if (chunk == null) throw new Error('[braceMatch] ' + (label || '') + ' 未闭合');
    return src.slice(i, i + chunk.length);
}
/** 真源码切段：a 之后到 b 之前（a、b 各须恰好命中一次，否则抛）。 */
function seg(src, a, b, label) {
    const ia = src.split(a).length - 1;
    const ib = src.split(b).length - 1;
    if (ia !== 1 || ib !== 1) throw new Error('[seg] ' + label + ' 锚点命中 a=' + ia + ' b=' + ib + '（须各 1）');
    const i = src.indexOf(a), j = src.indexOf(b);
    if (!(i < j)) throw new Error('[seg] ' + label + ' 顺序不符');
    return src.slice(i, j);
}
/** 取类体内的方法体（含首尾花括号）。方法签名须在类体内恰好命中一次。 */
function classMethodBody(src, sig, label, className) {
    const cn = className || 'MemoryEngine';
    const cls = src.indexOf('class ' + cn + ' {');
    if (cls < 0) throw new Error('[classMethodBody] 找不到 class ' + cn);
    const body = braceMatch(src, src.indexOf('{', cls), cn);
    const n = body.split(sig).length - 1;
    if (n !== 1) throw new Error('[classMethodBody] ' + label + ' 签名在类体内命中 ' + n + ' 次（须 1）');
    const at = body.indexOf(sig);
    return braceMatch(body, body.indexOf('{', at), label);
}

/** 取模块级常量字符串字面量（须恰好命中 1 次，否则抛）。 */
function constStr(src, name) {
    const m = new RegExp("const " + name + " = '([^']*)';").exec(src);
    const n = src.split('const ' + name + ' = ').length - 1;
    if (!m || n !== 1) throw new Error('[constStr] ' + name + ' 命中 ' + n + ' 次（须 1）');
    return m[1];
}

/* ══════════ 0. 版本锚 ══════════ */
test('v3211 0. 版本锚：出生版本 + 三源互等 + 当版锚点', () => {
    A(SELF.includes('v3.211.0'), '★ 本套件必须锁自己的出生版本 v3.211.0（不随抬版上抬）');
    const vIdx = (idxSrc.match(/const VERSION = '([^']+)'/) || [])[1];
    assert.ok(vIdx, 'index.js 应有 const VERSION');
    assert.equal(vIdx, mf.version, 'index.js 与 manifest.json 版本必须一致');
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    assert.equal(mf.version, pkg.version, 'manifest.json 与 package.json 版本必须一致');
    const vnum = (s) => {
        const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
        return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
    };
    A(vnum(vIdx) >= vnum('3.211.0'), '版本 ' + vIdx + ' 不得低于出生版本 3.211.0');
    ok('版本锚 3.211.0；三源互等 ' + vIdx);
});

/* ══════════ 1. 未知类型拒绝（三态可分） ══════════ */
test('v3211 1. lookup 的 type 三态：absent / ok / unknown 必须可分', () => {
    A(MT.bindLedger(FV) === true, '★ memory-type 能把类型校验器注入事实账（返回是否成功）');
    // 写入侧走**真实落笔口**（带显式类型），否则「给合法类型且账上有」这一态无样本
    let st = MT.assertTyped(FV, S(), T('A', '居住', '北京', 'location-state', 1)).state;
    // 1a absent：不给 type ⇒ 走全量，不该被类型判定干扰
    const ra = FV.lookup(st, { subject: 'A', predicate: '居住' });
    A(ra.ok === true && ra.reason === 'ok', '① 不给 type ⇒ absent（照常全量查询，ok/ok）');
    // 1b ok：给合法类型且账上有 ⇒ ok
    const rb = FV.lookup(st, { subject: 'A', predicate: '居住', type: 'location-state' });
    A(rb.ok === true && rb.reason === 'ok', '② 给合法类型 ⇒ ok');
    // 1c ok-but-none：给合法类型但账上确实没有该类型 ⇒ ok/none（**不得**报 unknown）
    const rc = FV.lookup(st, { subject: 'A', predicate: '居住', type: 'world-rule' });
    A(rc.ok === true && rc.reason === 'none', '★ ③ 给了合法类型但账上无此类型 ⇒ ok/none（与「你问错了」可分）');
    // 1d unknown：拼错类型名 ⇒ **拒绝**，且不得与 none 同形（本版要修的 C 类病）
    const rd = FV.lookup(st, { subject: 'A', predicate: '居住', type: 'chracter-state' });
    A(rd.ok === false && rd.reason === 'unknown-type', '★ ④ 拼错类型名 ⇒ ok:false / unknown-type（修前返回 ok/none，与「真没有」同形）');
    A(rd.unknownType === 'chracter-state', '★ 未识别的类型名必须回报在 unknownType（可归因，不是「查无此物」）');
    A(JSON.stringify(rd.facts) === '[]' && rd.fact === null, '拒绝时不得回任何事实（避免调用方把「问错」当「查到」）');
    // 三态两两可分（用一个签名矩阵断言，任何两态同形即红）
    const sig = (r) => [r.ok === true, r.reason].join('|');
    A(new Set([sig(ra), sig(rc), sig(rd)]).size === 3, '★ 三态签名两两不同：absent=' + sig(ra) + ' / none=' + sig(rc) + ' / unknown=' + sig(rd));
    // 空串视同不给类型（absent），不是 unknown
    const re = FV.lookup(st, { subject: 'A', predicate: '居住', type: '' });
    A(re.ok === true && re.reason === 'ok', '空串 type 视同 absent（不给类型），不得判成 unknown');
    ok('type 三态可分，拼错类型名不再静默消失');
});

/* ══════════ 2. 类型校验器注入口 + 降级放行 ══════════ */
test('v3211 2. setTypeValidator / typeStateOf：注入即可判，未注入即降级放行', () => {
    A(typeof FV.setTypeValidator === 'function', '账本须导出 setTypeValidator（类型清单真源在 memory-type，账本只持钩子）');
    A(typeof FV.typeStateOf === 'function', '账本须导出 typeStateOf（三态判定，供诊断面复用同一口径）');
    // 未注入 ⇒ 降级放行（退回 v3.210 口径：不新增拒绝，避免既有测试平白翻红）
    A(FV.typeStateOf(null) === 'absent' && FV.typeStateOf('') === 'absent', 'typeStateOf(null/空串) ⇒ absent');
    const real = FV.setTypeValidator(null);
    A(real === false, 'setTypeValidator(非函数) ⇒ 注销并返回 false');
    A(FV.typeStateOf('anything-at-all') === 'ok', '★ 校验器缺席 ⇒ 降级放行（不说「未知」，也不新增拒绝）');
    // 注回真校验器
    A(MT.bindLedger(FV) === true, '注回 memory-type 的校验器');
    A(FV.typeStateOf('character-state') === 'ok', '合法类型 ⇒ ok');
    A(FV.typeStateOf('chracter-state') === 'unknown', '★ 拼错类型 ⇒ unknown（注入后立即生效）');
    // 校验器只有一份真源：账本里不得有第二份类型名清单
    A(!/character-state['"]\s*[,:)]/.test(seg(fvSrc, 'let TYPE_VALIDATOR = null;', 'const text = LE.text;', 'fv-validator')), '★ 账本不得内嵌第二份类型清单（判据真源：类型表只在 memory-type.js）');
    const keysOk = Object.keys(MT.TYPES).every((k) => FV.typeStateOf(k) === 'ok');
    A(keysOk, '★ 九种类型全部被校验器认（memory-type 的 TYPES 与注入口径同源）');
    // 排除手写清单后注回，避免影响后续用例
    MT.bindLedger(FV);
    ok('注入/注销/降级放行三面通过，校验器单一真源');
});

/* ══════════ 3. conflictPolicy 落条 ══════════ */
test('v3211 3. conflictPolicy 落条目（读回口径 / 向后兼容 / 不与返回体同名字段混用）', () => {
    const r1 = FV.assertFact(S(), { subject: 'A', predicate: 'x', value: '1', conflictPolicy: 'coexist', from: 1 });
    A(r1.ok === true && r1.fact.conflictPolicy === 'coexist', '★ 策略必须落进条目（此前只活在单次调用的局部变量里，落盘即丢）');
    const r2 = FV.assertFact(r1.state, { subject: 'A', predicate: 'y', value: '2', conflictPolicy: 'prefer-new', from: 1 });
    A(r2.fact.conflictPolicy === 'prefer-new', 'prefer-new 同样落条');
    // 缺省/非法 ⇒ 读回 auto（向后兼容口径，不是「兜底默认值」：写进去的一定是四态之一）
    const r3 = FV.assertFact(r2.state, { subject: 'A', predicate: 'z', value: '3', from: 1 });
    A(r3.fact.conflictPolicy === 'auto', '缺省 conflictPolicy ⇒ 读回 auto');
    const r4 = FV.assertFact(r3.state, { subject: 'A', predicate: 'w', value: '4', conflictPolicy: 'bogus', from: 1 });
    A(r4.fact.conflictPolicy === 'auto', '非法 conflictPolicy ⇒ 读回 auto（四态之外一律不落）');
    // 旧条目（v3.210 及更早）无该字段 ⇒ 读回 auto，语义本就如此
    const legacy = FV.normalize({ version: 1, seq: 1, facts: [{ id: 'fct_1', subject: 'L', predicate: 'p', value: 'v' }] });
    A(legacy.facts[0].conflictPolicy === 'auto', '★ 旧条目（无该字段）读回 auto —— 向后兼容口径');
    // ★ 同名不同义必须分开：条目侧是策略名（字符串），返回体侧 conflict 是布尔
    const coex = MT.assertTyped(FV, S(), T('E', '结果', 'A 赢了', 'event-outcome', 1));
    const coex2 = MT.assertTyped(FV, coex.state, T('E', '结果', 'B 赢了', 'event-outcome', 2));
    A(coex2.conflict === true, '★ 返回体 conflict 是布尔（本次写入与既有取值分歧）—— 修前条目侧也用 conflict 存策略名，读者会把字符串当布尔判');
    A(coex2.fact.conflictPolicy === 'coexist', '★ 条目侧字段名是 conflictPolicy（策略名）—— 两个口径不得共用同一字段名');
    // 条目里不得再出现 conflict 字段（防回退）
    A(!Object.prototype.hasOwnProperty.call(coex2.fact, 'conflict'), '★ 条目不得带 conflict 字段（防回退到同名混用）');
    ok('策略落条、向后兼容、与返回体字段分离三面通过');
});

/* ══════════ 4. multiple / ambiguous 两态可分 ══════════ */
test('v3211 4. lookup：并列事实（multiple）与冲突未决（ambiguous）必须可分', () => {
    // 4a coexist 两条 ⇒ multiple（并列），不是 ambiguous
    let st = MT.assertTyped(FV, S(), T('E', '结果', 'A 赢了', 'event-outcome', 1)).state;
    st = MT.assertTyped(FV, st, T('E', '结果', 'B 赢了', 'event-outcome', 2)).state;
    const rm = FV.lookup(st, { subject: 'E', predicate: '结果' });
    A(rm.ok === true && rm.reason === 'multiple', '★ 两条 coexist ⇒ multiple（修前返回 ambiguous，把「并列事实」读成「矛盾」）');
    A(rm.multi === 2 && rm.facts.length === 2, 'multiple 态须报并列条数（multi）与全部事实');
    A(rm.facts.every((f) => f.conflictPolicy === 'coexist'), 'multiple 态的事实都按 coexist 写入（判据依据）');
    A([...rm.facts].sort((a, b) => (a.from - b.from)).every((f, i) => f.from === i + 1), 'multiple 态按 from 升序（稳定次序，可复现）');
    // 4b auto 两条 ⇒ ambiguous（未决），与 multiple 签名字段不同
    let sa = FV.assertFact(S(), { subject: 'X', predicate: '状态', value: '甲', from: 1 }).state;
    sa = FV.assertFact(sa, { subject: 'X', predicate: '状态', value: '乙', from: 1 }).state;   // 同 from ⇒ auto 不换代
    const ra = FV.lookup(sa, { subject: 'X', predicate: '状态' });
    A(ra.ok === true && ra.reason === 'ambiguous', 'auto 同 from 两条 ⇒ ambiguous（仍旧口径，不得被本次改动搅乱）');
    A(ra.multi === undefined, 'ambiguous 态不得带 multi（两态字段不同 —— 调用方据此分流）');
    A(rm.reason !== ra.reason, '★ 两态 reason 不同：multiple vs ambiguous');
    // 4c 混合（一 auto 一 coexist）⇒ 仍 ambiguous（**不猜**：只有全部按 coexist 写入才算并列）
    let sm = FV.assertFact(S(), { subject: 'Y', predicate: 'z', value: '1', from: 1 }).state;
    sm = MT.assertTyped(FV, sm, T('Y', 'z', '2', 'event-outcome', 2)).state;
    const rmm = FV.lookup(sm, { subject: 'Y', predicate: 'z' });
    A(rmm.reason === 'ambiguous', '★ 混合写入（auto + coexist）⇒ 仍 ambiguous（不把混合状态猜成并列）');
    // 4d REASONS 十态齐全且含两个新态
    A(Array.isArray(FV.REASONS) && FV.REASONS.length === 10, 'REASONS 须为 10 态（8 → 10），实为 ' + (FV.REASONS || []).length);
    A(FV.REASONS.includes('multiple') && FV.REASONS.includes('unknown-type'), '★ REASONS 须含 multiple 与 unknown-type（新态必须进清单，否则调用方无从判断）');
    // 4e 诊断行分开报（并列 / 未决不得压成一个数）
    const line = FV.line(st);
    A(line.includes('并列'), '★ line 须报「并列」组数（多值类型）');
    A(!line.includes('未决'), '★ 全为 coexist 时不得报「未决 ⚠️」（两态在诊断面也必须分开）');
    A(FV.line(sa).includes('未决'), 'auto 未决时 line 仍报「未决 ⚠️」（原口径不变）');
    ok('multiple / ambiguous 两态可分，混合态不猜');
});

/* ══════════ 5. 对键不按策略分流（守回既有口径） ══════════ */
test('v3211 5. 存储对键不按策略分流（曾试行「值并入对键」实测有害）', () => {
    // 5a coexist 两条必须落在**同一对键**上：versionsOf 取该格全部版本，时间线不得残缺
    let st = MT.assertTyped(FV, S(), T('E', '结果', 'A 赢了', 'event-outcome', 1)).state;
    st = MT.assertTyped(FV, st, T('E', '结果', 'B 赢了', 'event-outcome', 2)).state;
    const tl = FV.timeline(st, { subject: 'E', predicate: '结果' });
    A(tl.versions.length === 2, '★ coexist 两条仍在同一对键 ⇒ 时间线视图取到 2 版（值并入对键会让它只剩 1 条）');
    const lk = FV.lookup(st, { subject: 'E', predicate: '结果' });
    A(lk.versions.length === 2, '★ lookup.versions 同样取到全部 2 版（对键一致性的下游）');
    // 5b auto 换代仍**必须**触发（对键不分流才能让换代/拒绝生效）
    let sa = MT.assertTyped(FV, S(), T('F', '好感', '高', 'character-state', 1)).state;
    const ra = MT.assertTyped(FV, sa, T('F', '好感', '低', 'character-state', 5));
    A(ra.sequenced === true && ra.superseded.length === 1, '★ auto 换代仍触发（对键若被策略分流，换代将永不触发 = 静默废掉策略）');
    // 5c forbid 拒绝仍生效（同对键才判得出矛盾）
    let sw = MT.assertTyped(FV, S(), T('W', '规则', '魔力有代价', 'world-rule', 1)).state;
    const rw = MT.assertTyped(FV, sw, T('W', '规则', '魔力无代价', 'world-rule', 2));
    A(rw.ok === false && rw.reason === 'conflict-forbidden', '★ forbid 仍拒绝（同对键下才判得出矛盾）');
    // 5d 导出面不得再有 pairKeyFor（回退痕迹）
    A(FV.pairKeyFor === undefined, '★ 导出面不得含 pairKeyFor（「值并入对键」方案已撤，防回退）');
    A(FV.isMultiValue('coexist') === true && FV.isMultiValue('auto') === false, 'isMultiValue 是策略判定的唯一真源');
    A(FV.MULTI_VALUE_POLICY === 'coexist', 'MULTI_VALUE_POLICY 常量为唯一真源');
    ok('对键口径守回：coexist 同键并列、auto 换代、forbid 拒绝、回退痕迹清除');
});

/* ══════════ 6. 落笔侧 facts[] 通道 ══════════ */
test('v3211 6. 落笔侧 facts[] 显式类型通道：schema 在场 + 迁移补通道真跑', () => {
    // 6a schema 必须有 facts 字段（修前实测：`"facts" in prompt == False`，第一通道从未有输入）
    const promptSeg = seg(idxSrc, 'extractionPrompt: `你是剧情记忆整理员', 'type\": \"九类型名之一\"}]}`', 'extractionPrompt');
    A(promptSeg.includes('"facts": [{"subject"'), '★ extractionPrompt 的 schema 必须含 facts[] 字段（否则落笔侧第一通道永远为空）');
    A(promptSeg.includes('9l. facts'), '★ schema 须有 9l 规则说明（含九个类型名逐字清单，模型才知道填什么）');
    for (const t of ['character-state', 'relationship-state', 'location-state', 'item-state',
        'event-outcome', 'plot-thread', 'player-preference', 'world-rule', 'scene-fact']) {
        A(promptSeg.includes(t), '★ 九类型名须在提示词里逐字给出：' + t);
    }
    // 6b 落笔侧读 facts[] 的代码必须在场（否则 schema 与消费者脱节）
    const absorb = classMethodBody(idxSrc, '_absorbFactVersions(extracted, floor, storyTime) {', 'absorb');
    A(absorb.includes('extracted?.facts'), '落笔侧须读 extracted.facts[]');
    A(absorb.includes("f.type"), '★ 显式通道须把 facts[].type 透传给类型化入口（否则 schema 白加）');
    // 6c 迁移：老用户的提示词持久化在配置里，必须能补上该通道
    A(idxSrc.includes('v3.211-facts通道'), '★ 须有迁移项把 facts 通道补进已存配置（否则老用户永远拿不到）');
    const FP = req(join(ROOT, 'fuzzy-patch.js'));
    const ANCHOR_OLD = constStr(idxSrc, '_FACTS_PROMPT_ANCHOR_OLD');
    const ANCHOR_NEW = constStr(idxSrc, '_FACTS_PROMPT_ANCHOR_NEW');
    const IDEM = constStr(idxSrc, '_FACTS_PROMPT_IDEMPOTENT');
    A(IDEM === '"facts": [{"subject"', '幂等键取 facts 通道开头（与 schema 里写的逐字一致）');
    // 6d 锚点字面量必须在类外：内联在方法体里会让扫描器的裸花括号配平算歪（v3159 的 F1 会翻红）
    const loadCfg = classMethodBody(idxSrc, 'loadConfig() {', 'loadConfig', 'ConfigManager');
    A(loadCfg.includes(ANCHOR_OLD) === false && loadCfg.includes(ANCHOR_NEW) === false,
        '★ 含花括号的锚点字面量不得内联在 loadConfig 方法体内（否则方法区间配平错位 ⇒ v3159 的 F1 误报）');
    A(loadCfg.includes('_FACTS_PROMPT_ANCHOR_OLD') && loadCfg.includes('_FACTS_PROMPT_ANCHOR_NEW'),
        '★ 迁移块以标识符引用锚点（配平不受字符串内花括号影响）');
    // 6e 往返真跑：从**当版默认提示词**反向剥出旧版（= 老用户的真实起点），再补回去
    const promptRaw = promptSeg + 'type\": \"九类型名之一\"}]}`';
    const back = FP.applyPatch(promptRaw, ANCHOR_NEW, ANCHOR_OLD, { normalize: true });
    A(back.ok === true && back.mode === 'exact' && back.hits === 1, '★ 反向剥除：当版默认提示词里 facts 锚点 exact 命中 1 次（取证起点真实）');
    const oldPrompt = back.text;
    A(oldPrompt.includes(IDEM) === false, '剥除后的旧版提示词确实没有 facts 通道（= 老用户的真实起点）');
    const rp = FP.applyPatch(oldPrompt, ANCHOR_OLD, ANCHOR_NEW, { normalize: true });
    A(rp.ok === true && rp.mode === 'exact' && rp.hits === 1, '★ 迁移补通道：对旧版提示词末尾锚点 exact 命中 1 次（不是模糊凑合）');
    A(rp.text.includes(IDEM), '补后文本含 facts 通道');
    A(rp.text.split(IDEM).length - 1 === 1, '★ 幂等键：补后恰好出现 1 次（宿主据此跳过二次迁移）');
    const neg = FP.applyPatch(oldPrompt.replace(ANCHOR_OLD, 'XXX'), ANCHOR_OLD, ANCHOR_NEW, { normalize: true });
    A(neg.ok === false, '★ 负控制：锚点被破坏 ⇒ 迁移判 notfound（不得报成功）');
    ok('schema 在场、消费者在场、迁移对旧版提示词 exact 命中且幂等');
});

/* ══════════ 7. 注入面真跑 ══════════ */
test('v3211 7. typedFactsBlocks 真跑：稳定/波动两块可分（抽真方法体 + fake engine）', () => {
    const body = classMethodBody(idxSrc, 'typedFactsBlocks() {', 'typedFactsBlocks');
    const mk = new Function('_memoryTypeLib', '_factVersionState', 'errLog',
        'const m = function()' + body + '; return m.call({ _memoryTypeLib: _memoryTypeLib, _factVersionState: _factVersionState });');
    const LIB = { typedBuckets: MT.typedBuckets, routeForType: MT.routeForType, policyOfType: MT.policyOfType };
    // 7a 稳定块：long/permanent 类型（人物状态 / 世界规则）
    let st = MT.assertTyped(FV, S(), T('A', '好感', '高', 'character-state', 1)).state;
    st = MT.assertTyped(FV, st, T('世界', '规则', '夜晚禁行', 'world-rule', 1)).state;
    // 7b 波动块：medium/short 类型（地点状态）
    st = MT.assertTyped(FV, st, T('A', '所在', '北京', 'location-state', 1)).state;
    const out = mk(() => LIB, st, () => {});
    A(out.stable.startsWith('[类型化事实·长期]'), '★ 稳定块首行必须是常驻标记 `[类型化事实·长期]`（前缀判定靠它进常驻分区）');
    A(out.volatile.startsWith('[类型化事实·当下]'), '★ 波动块首行是 `[类型化事实·当下]`（**不得**与稳定块同标记）');
    A(out.stable.includes('世界规则') && out.stable.includes('人物状态'), '稳定块含长期类型（世界规则 / 人物状态）');
    A(!out.stable.includes('地点状态'), '★ 地点状态（medium）不得进稳定块 —— 否则被当成每轮必注');
    A(out.volatile.includes('地点状态'), '波动块含地点状态');
    A(!out.volatile.includes('世界规则'), '★ 世界规则不得进波动块 —— 否则会被预算裁掉（正是本版要防的「长期规则被裁」）');
    // 7c 三态：无账 / 无模块 / 空账 ⇒ 两块皆空（不得报内容）
    const noState = mk(() => LIB, null, () => {});
    A(noState.stable === '' && noState.volatile === '', '无事实账 ⇒ 两块皆空（三态：无内容 ≠ 有内容）');
    const noMod = mk(() => null, st, () => {});
    A(noMod.stable === '' && noMod.volatile === '', '模块缺席 ⇒ 两块皆空且不抛（降级安全）');
    const empty = mk(() => LIB, FV.normalize(null), () => {});
    A(empty.stable === '' && empty.volatile === '', '空账 ⇒ 两块皆空');
    // 7d 每型行数上限（防单一类型吃掉注入预算）
    let many = FV.normalize(null);
    for (let i = 1; i <= 6; i++) many = MT.assertTyped(FV, many, T('E', '结果' + i, '值' + i, 'event-outcome', i)).state;
    const mo = mk(() => LIB, many, () => {});
    const lines = mo.stable.split('\n').filter((l) => l.startsWith('- '));
    A(lines.length <= 3, '★ 单一类型最多 3 行（防事件结果堆积吃掉注入预算），实为 ' + lines.length);
    // 7e buildInjection 必须真调用（结构化：方法体内出现对 typedFactsBlocks 的调用）
    const bi = classMethodBody(idxSrc, 'buildInjection(recalled) {', 'buildInjection');
    A(bi.includes('typedFactsBlocks'), '★ buildInjection 必须真调用 typedFactsBlocks（否则注入面接了没人用）');
    A(bi.split('blocks.push(_tf.stable)').length - 1 === 1 && bi.split('blocks.push(_tf.volatile)').length - 1 === 1,
        '★ 两块必须**分开 push**（合成一块 ⇒ 短生命周期内容被当常驻，或长期规则被裁）');
    ok('稳定/波动可分、三态安全、行数受限、宿主真调用');
});

/* ══════════ 8. 常驻标记三处真源一致 ══════════ */
test('v3211 8. 常驻标记三处真源一致（index.js / injection-router / cost-ledger）', () => {
    const m = /const RESIDENT_MARKERS = (\[[\s\S]*?\]);/.exec(idxSrc);
    assert.ok(m, 'index.js RESIDENT_MARKERS 存在');
    const inIndex = JSON.parse(m[1].replace(/'/g, '"'));
    const NEW_MARK = '[类型化事实·长期]';
    A(inIndex.includes(NEW_MARK), '★ index.js RESIDENT_MARKERS 须含 ' + NEW_MARK);
    A(!inIndex.includes('[类型化事实·当下]'), '★ 波动块标记**不得**进常驻表（medium/short 本就该随预算裁剪）');
    // injection-router 逐字对齐（判据：IS[ResidentBlock] 对 index 表每一项都为真）
    for (const marker of inIndex) {
        A(IR.isResidentBlock(marker) === true, 'injection-router 与 index.js 一致：' + marker);
    }
    A(IR.isResidentBlock('[类型化事实·当下]') === false, '★ injection-router 必须把波动块判为非常驻（同标记不得两处不同判）');
    // cost-ledger 回落表逐字一致（它的注释声明「与 index.js RESIDENT_MARKERS 保持同字面量」）
    const fallback = CL.RESIDENT_FALLBACK;
    A(Array.isArray(fallback), 'cost-ledger 须导出 RESIDENT_FALLBACK（常驻口径的回落值）');
    A(fallback.length === inIndex.length, '★ 回落表长度须与 index.js 一致（' + fallback.length + ' vs ' + inIndex.length + '）');
    A(inIndex.every((marker) => fallback.includes(marker)), '★ 回落表须逐字覆盖 index.js 的每一项');
    A(fallback.includes(NEW_MARK), '★ cost-ledger 回落表须含 ' + NEW_MARK + '（否则模块缺席时成本账把常驻算成触发）');
    ok('三处常驻真源逐字一致（含新增标记），波动块未误入常驻');
});

/* ══════════ 9. 三个零消费出口已被真消费 ══════════ */
test('v3211 9. routeForType / typedBuckets / policyOfType 已被宿主真消费', () => {
    // 结构化判据：在**真源码**（剥注释）里找调用形态，不用 includes 匹配散文
    const bare = stripComments(idxSrc);
    const callOf = (name) => new RegExp('MT\\.' + name + '\\s*\\(').test(bare);
    A(callOf('typedBuckets'), '★ 宿主须真调用 MT.typedBuckets（修前零调用点）');
    A(callOf('routeForType'), '★ 宿主须真调用 MT.routeForType（修前零调用点；稳定性判定靠它）');
    A(callOf('policyOfType'), '★ 宿主须真调用 MT.policyOfType（修前零调用点；类型中文标签靠它）');
    // 调用点须落在 typedFactsBlocks 内（不是散在别处凑数）
    const body = stripComments(classMethodBody(idxSrc, 'typedFactsBlocks() {', 'typedFactsBlocks'));
    A(/MT\.typedBuckets\s*\(/.test(body), '三个出口须在 typedFactsBlocks 内被消费（同一处，语义连贯）');
    A(/MT\.routeForType\s*\(/.test(body), 'routeForType 在 typedFactsBlocks 内被消费');
    A(/MT\.policyOfType\s*\(/.test(body), 'policyOfType 在 typedFactsBlocks 内被消费');
    // 宿主不得再自建一份类型清单（真源只在 memory-type.js）
    const TYPE_NAMES = ['character-state', 'relationship-state', 'location-state', 'item-state',
        'event-outcome', 'plot-thread', 'player-preference', 'world-rule', 'scene-fact'];
    // 判据收窄到注入面方法体（注释已剥）：这里只应用 routeForType/policyOfType 拿稳定性与标签，
    // 一旦内嵌类型名就成了第二份真源。（仓库其他地方的类型名住在提示词正文与校验器缺省，属既有设计）
    const listedInBody = TYPE_NAMES.filter((n) => body.indexOf(n) >= 0);
    A(listedInBody.length === 0, '★ typedFactsBlocks 内不得内嵌类型名清单（真源只在 memory-type.js）：' + listedInBody.join(','));
    ok('三个出口在真源码里被消费，且宿主无第二份类型清单');
});

/* ══════════ 10. 判据纯度：真源码破坏 + 同款判据重跑 ══════════ */
test('v3211 10. 判据纯度：负控制是真源码破坏 + 同款真判据重跑', () => {
    const thrower = (fn) => { try { fn(); return null; } catch (e) { return e; } };
    A(thrower(() => seg(idxSrc, '不存在的锚点XYZ', 'const VERSION', 'x')) !== null, '★ seg：起点锚点缺失必须抛');
    A(thrower(() => seg(idxSrc, 'const VERSION', 'NEVER_XYZ', 'x')) !== null, '★ seg：终点锚点缺失必须抛');
    A(thrower(() => classMethodBody(idxSrc, '_noSuchMethodXyz() {', 'x')) !== null, '★ classMethodBody：签名不存在必须抛');
    A(thrower(() => braceMatch('{ a ', 0, 'x')) !== null, '★ braceMatch：未闭合必须抛');
    A(braceMatch('{ "}" }', 0, 'x') === '{ "}" }', '★ braceMatch 跳过字符串里的花括号');

    // ★ 真源码破坏：把 typedFactsBlocks 里的 routeForType 调用改成常量 true，
    //   同款判据（stable 分支）必须可观测改行为 —— 这是「破坏可观测」的两向自证。
    const src0 = idxSrc;
    const anchor = 'const route = (typeof MT.routeForType === \'function\') ? MT.routeForType(t) : null;';
    A(src0.split(anchor).length - 1 === 1, '★ 破坏锚点在真源码里恰好命中 1 次（负控制前提成立）');
    const broken = src0.replace(anchor, 'const route = null;');   // 破坏：路由恒缺席 ⇒ 全落波动块
    const mkFrom = (src) => {
        const body = classMethodBody(src, 'typedFactsBlocks() {', 'typedFactsBlocks');
        return new Function('_memoryTypeLib', '_factVersionState', 'errLog',
            'const m = function()' + body + '; return m.call({ _memoryTypeLib: _memoryTypeLib, _factVersionState: _factVersionState });');
    };
    const LIB = { typedBuckets: MT.typedBuckets, routeForType: MT.routeForType, policyOfType: MT.policyOfType };
    let st = MT.assertTyped(FV, S(), T('世界', '规则', '夜晚禁行', 'world-rule', 1)).state;
    const rt = mkFrom(src0)(() => LIB, st, () => {});
    const rb = mkFrom(broken)(() => LIB, st, () => {});
    A(rt.stable.includes('世界规则') && !rb.stable.includes('世界规则'),
        '★ 判据纯度：真源码破坏（路由恒 null）后同款判据翻红 —— 稳定块不再含世界规则，证明判据真读源码行为而非恒绿');
    A(rb.volatile.includes('世界规则'), '破坏后世界规则被误降级进波动块（可观测地改了行为，不是「破坏没生效」）');

    // ★ 第二条负控制：删掉 buildInjection 的调用 ⇒ 注入面判据必须翻红
    const callAnchor = 'const _tf = (typeof this.typedFactsBlocks === \'function\') ? this.typedFactsBlocks() : null;';
    A(src0.split(callAnchor).length - 1 === 1, '★ 注入调用锚点恰好命中 1 次');
    const brokenBi = classMethodBody(src0.replace(callAnchor, 'const _tf = null;'), 'buildInjection(recalled) {', 'buildInjection');
    A(brokenBi.includes('typedFactsBlocks') === false || !/blocks\.push\(_tf\.stable\)/.test(brokenBi),
        '★ 破坏后注入判据（真调用）可观测失效 —— 判据读的是真实调用形态');
    A(/blocks\.push\(_tf\.stable\)/.test(classMethodBody(src0, 'buildInjection(recalled) {', 'buildInjection')),
        '原源码上同款判据为真（两向自证）');

    // 判据纯度：本套件的关键锚点字面量各自独立引用，不靠单一常量自证
    A(SELF.split('typedFactsBlocks').length - 1 >= 3, '本套件多次独立引用被测方法名（各处判据自持）');
    ok('seg/braceMatch/classMethodBody 两向自证，负控制为真源码破坏且可观测');
});

process.on('exit', () => {
    console.log('\n[v3.211 类型到注入] 通过 ' + pass + ' / 失败 ' + fail);
    if (fail > 0) process.exitCode = 1;
});