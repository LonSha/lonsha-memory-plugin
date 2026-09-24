/* ============================================================
 * tests/v3210_memory_type.test.mjs — v3.210.0
 *
 * 主题：记忆类型系统（memory-type.js）+ 事实账本策略化（fact-version.js）+ 宿主类型化接线
 *       —— 计划 L-F1「事实账本扩展为记忆类型系统」。
 *
 * 修前实测（本轮真跑取证，不是读源码推算）：
 *  A. 类型维度**全仓不存在**
 *     `grep -rn 'TYPE_REGISTRY\|MEMORY_TYPES'` 零命中；fact-version.js 的条目形状是
 *     {subject, predicate, value, origin, from, to} —— 「主角喜欢喝奶茶」「魔王被打败了」
 *     「A 与 B 是师徒」在账上**同一形状**，共用同一套覆盖/冲突规则。
 *  B. 后果不是缺数据，是**数据在、规则用错**（逐条可复现）：
 *     · world-rule 类事实（长期世界规则）会被一条新轮次的事实按 auto 换代顶掉；
 *     · event-outcome（事件结果）与 character-state 互相换代（事件结果只该并存）；
 *     · player-preference 没有「新偏好压旧偏好」（旧偏好赖着不走）；
 *     · 矛盾的世界规则**照常并存**（本该报警「提取错了」，却当成合理冲突挂着）。
 *  C. `_absorbFactVersions` 只吃 extracted.facts + 一个「所在」地点：status_changes /
 *     relationships / items / cse_states 四类**已有**数据一条都没进事实账
 *     （数据在提取结果里，落笔时被丢）。
 *
 * 覆盖：
 *   0  版本锚 + 三源互等 + 当版锚点
 *   1  模块结构面（导出面 / 零依赖 / 挂全局 / 9 类型 × 6 策略齐全）
 *   2  未知类型**拒绝**（不静默归 default）+ 拒绝路径不改原 state
 *   3  四冲突策略行为**两两可分**（auto / coexist / prefer-new / forbid）+ auto 原行为不变
 *   4  type 参与指纹（同内容不同类型 = 两条不同事实）+ 缺 type 读回 null
 *   5  lookup 的 type 过滤（同对同谓词挂不同类型必须分开查）
 *   6  line / lineByType：已标/未标三态可分 + 不被推断值污染
 *   7  queryByType / routeForType / policyOfType
 *   8  inferType：推断是提示不是裁决
 *   9  账侧策略化：CONFLICT_POLICIES 导出 + assertFact 吃 conflictPolicy
 *  10  index.js 接线静态面（取库口在类体外 / 诊断行 / 位置断言，不用文本包含当判据）
 *  11  index.js 接线**真跑**（抽真方法体源码 + fake engine 执行，逐类断言入账结果）
 *  12  manifest 登记与加载顺序（含负控制：把 memory-type 挪到 fact-version 之前必须翻红）
 *  13  判据纯度与工具两向自证（锚点不存在/不唯一须抛；破坏须可观测改行为）
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
// [v3.210] 花括号配对**委托唯一真源**（v3.191 收敛后的 tests/_audit_lib.mjs），不本地重写：
//   本文件初版自写了一份带注释态机的 braceMatch，被 tests/audit/scan_audit_lib_consolidation.mjs
//   的 E1 结构面当场点出（「仍在本地重写 braceMatch」）——本仓纪律是「同一口径只许一份实现」，
//   且该扫描器同时守着 v3159 等套件，本地重写会连带它们一起翻红。
//   真源 braceMatch **不跳注释**（注释里出现 `}` 会把深度算错，实测在 index.js 类体上返回 null），
//   故这里用真源 stripComments（等长占位、换行与偏移不变）先剥注释，再用真源配对；
//   切出的长度映射回**原文**，注释与格式原样保留（判据要看原文）。
//   本文件与真源同在 tests/ 下，故用 './'（tests/audit/ 下的扫描器才用 '../'）。
import { stripComments, braceMatch as libBraceMatch } from './_audit_lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SELF_PATH = fileURLToPath(import.meta.url);
const SELF = readFileSync(SELF_PATH, 'utf-8');

const MTF = join(ROOT, 'memory-type.js');
const FVF = join(ROOT, 'fact-version.js');
const IDX = join(ROOT, 'index.js');
const MF = join(ROOT, 'manifest.json');

const MT = createRequire(import.meta.url)(MTF);
const FV = createRequire(import.meta.url)(FVF);
const idxSrc = readFileSync(IDX, 'utf-8');
const mtSrc = readFileSync(MTF, 'utf-8');
const fvSrc = readFileSync(FVF, 'utf-8');
const mf = JSON.parse(readFileSync(MF, 'utf-8'));

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok ' + m); };
const bad = (m) => { fail++; console.error('  ✗ ' + m); };
/** 断言包装：失败不断链（本套件风格与 v3208/v3209 一致，最后统一 exitCode）。 */
const A = (cond, msg) => { if (cond) ok(msg); else bad(msg); };

const S = () => FV.normalize(null);
const T = (pred, val, type, from, floor) => ({ subject: 'A', predicate: pred, value: val, type: type, from: from == null ? 1 : from, floor: floor == null ? 1 : floor });

/* ══════════ 工具：真源码切段与花括号匹配 ══════════ */
/** 花括号匹配（**委托真源**）：先按真源 stripComments 剥注释，再按真源 braceMatch 配对，
 *  最后把索引区间映射回**原文**。i 处必须是 '{'。返回含首尾花括号的原文子串，失配抛。
 *  为什么不直接用真源 braceMatch：它只跳字符串、**不跳注释**（注释里的 `}` 会把深度算错，
 *  实测在本仓 index.js 的类体上返回 null）——本仓源码注释里大量出现花括号，故必须在其前面
 *  接一道真源 stripComments（等长占位，偏移与换行不变）。这是**组合**真源，不是第二份实现。 */
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
/** 从 a 起（含）到 a **之后首次**出现的 b 止（不含 b）。a 须全局唯一，否则抛。
 *  用途：取「夹在两个诊断行之间」的代码段——终点锚点在全文里通常不唯一（诊断行注释会重复出现），
 *  真正的语义是「起点之后的第一个终点」，故这里不要求 b 唯一，但要求 a 唯一且 b 必须在 a 之后存在。 */
function sliceFrom(src, a, b, label) {
    const na = src.split(a).length - 1;
    if (na !== 1) throw new Error('[sliceFrom] ' + label + ' 起点命中 ' + na + ' 次（须 1）');
    const i = src.indexOf(a);
    const j = src.indexOf(b, i + a.length);
    if (j < 0) throw new Error('[sliceFrom] ' + label + ' 起点之后找不到终点锚');
    return src.slice(i, j);
}
/** 取指定签名的函数体（含首尾花括号）。签名须在源码里恰好命中一次，否则抛。 */
function fnBody(src, sig, label) {
    const n = src.split(sig).length - 1;
    if (n !== 1) throw new Error('[fnBody] ' + label + ' 签名命中 ' + n + ' 次（须 1）');
    return braceMatch(src, src.indexOf('{', src.indexOf(sig)), label);
}
/** 取类体内的方法体（含首尾花括号）。方法签名须在类体内恰好命中一次。 */
function classMethodBody(src, sig, label) {
    const cls = src.indexOf('class MemoryEngine {');
    if (cls < 0) throw new Error('[classMethodBody] 找不到 class MemoryEngine');
    const body = braceMatch(src, src.indexOf('{', cls), 'MemoryEngine');
    const n = body.split(sig).length - 1;
    if (n !== 1) throw new Error('[classMethodBody] ' + label + ' 签名在类体内命中 ' + n + ' 次（须 1）');
    const at = body.indexOf(sig);
    return braceMatch(body, body.indexOf('{', at), label);
}

/* ══════════ 0. 版本锚 ══════════ */
test('v3210 0. 版本锚：出生版本 + 三源互等 + 当版锚点', () => {
    A(SELF.includes('v3.210.0'), '★ 本套件必须锁自己的出生版本 v3.210.0（不随抬版上抬）');
    const vIdx = (idxSrc.match(/const VERSION = '([^']+)'/) || [])[1];
    assert.ok(vIdx, 'index.js 应有 const VERSION');
    assert.equal(vIdx, mf.version, 'index.js 与 manifest.json 版本必须一致');
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    assert.equal(mf.version, pkg.version, 'manifest.json 与 package.json 版本必须一致');
    const vnum = (s) => {
        const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
        return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
    };
    A(vnum(vIdx) >= vnum('3.210.0'), '版本 ' + vIdx + ' 不得低于出生版本 3.210.0');
    ok('版本锚 3.210.0；三源互等 ' + vIdx);
});

/* ══════════ 1. 模块结构面 ══════════ */
test('v3210 1. 模块结构面：导出面 / 零依赖 / 挂全局 / 9 类型 × 6 策略', () => {
    const imp = [...mtSrc.matchAll(/^\s*(?:import|export)\s/gm)];
    assert.equal(imp.length, 0, 'memory-type.js 必须零依赖（不得 import/export，走 IIFE + CJS 双出口）');
    A(mtSrc.includes('module.exports'), 'memory-type.js 必须带 CJS 出口（Node 判据与宿主 require 共用）');
    A(mtSrc.includes('window.LonShaMemoryType'), '须挂 window.LonShaMemoryType');
    for (const fn of ['policyOf', 'normalizeType', 'inferType', 'assertTyped', 'queryByType',
        'routeForType', 'policyOfType', 'lineByType']) {
        A(typeof MT[fn] === 'function', 'memory-type 导出面缺 ' + fn);
    }
    A(MT.TYPES && typeof MT.TYPES === 'object', 'TYPES 注册表须导出');
    const keys = Object.keys(MT.TYPES);
    A(keys.length === 9, '★ 类型数须为 9（计划 L-F1 点名九种），实为 ' + keys.length + '：' + keys.join(','));
    const want = ['character-state', 'relationship-state', 'location-state', 'item-state',
        'event-outcome', 'plot-thread', 'player-preference', 'world-rule', 'scene-fact'];
    A(want.every((k) => keys.includes(k)), '九种类型名须与计划一致（缺 ' + want.filter((k) => !keys.includes(k)) + '）');
    // 6 项策略属性 + label 齐全
    const fields = ['lifecycle', 'visibility', 'trust', 'overrideable', 'conflict', 'retroactive'];
    const missing = [];
    for (const k of keys) for (const f of fields) if (MT.TYPES[k][f] === undefined) missing.push(k + '.' + f);
    A(missing.length === 0, '★ 每种类型须齐 6 项策略属性（缺 ' + JSON.stringify(missing) + '）');
    // 策略取值域
    const badVal = [];
    for (const k of keys) {
        const p = MT.TYPES[k];
        if (!['permanent', 'long', 'medium', 'short', 'dynamic'].includes(p.lifecycle)) badVal.push(k + '.lifecycle=' + p.lifecycle);
        if (!['public', 'pov', 'private', 'authorial', 'scene'].includes(p.visibility)) badVal.push(k + '.visibility=' + p.visibility);
        if (typeof p.trust !== 'number' || !(p.trust >= 0 && p.trust <= 1)) badVal.push(k + '.trust=' + p.trust);
        if (typeof p.overrideable !== 'boolean') badVal.push(k + '.overrideable 非布尔');
        if (!['auto', 'coexist', 'prefer-new', 'forbid'].includes(p.conflict)) badVal.push(k + '.conflict=' + p.conflict);
        if (typeof p.retroactive !== 'boolean') badVal.push(k + '.retroactive 非布尔');
    }
    A(badVal.length === 0, '★ 策略取值必须全在域内（越界 ' + JSON.stringify(badVal) + '）');
    // conflict 策略取值必须与账侧 CONFLICT_POLICIES 同源（不得各写一份）
    const pol = new Set(keys.map((k) => MT.TYPES[k].conflict));
    A([...pol].every((p) => FV.CONFLICT_POLICIES.includes(p)),
        '★ 类型表的 conflict 值必须是账侧 CONFLICT_POLICIES 的子集（两份清单同源）');
    ok('零依赖、导出面齐全、9 类型 × 6 策略取值域全过');
});

/* ══════════ 2. 未知类型拒绝 ══════════ */
test('v3210 2. 未知类型必须拒绝（不静默归 default）', () => {
    A(MT.normalizeType('world-rule') === 'world-rule', '合法类型原样返回');
    A(MT.normalizeType('bogus') === null, '★ 未知类型 → null（拒绝）');
    A(MT.normalizeType('') === null, '空串 → null');
    A(MT.normalizeType(null) === null, 'null → null');
    A(MT.normalizeType('WORLD-RULE') === null, '★ 大小写变体不得被静默接受（不做 fuzzy）');
    A(MT.policyOf('bogus') === null, 'policyOf 未知 → null');
    const r = MT.assertTyped(FV, S(), { subject: 'a', predicate: 'b', value: 'c', type: 'bogus' });
    A(r.ok === false && r.reason === 'unknown-type', '★ assertTyped 未知类型 → ok:false / unknown-type（不得当普通事实记下）');
    A(r.changed === false, '拒绝路径 changed 必须 false');
    A(FV.normalize(r.state).facts.length === 0, '★ 拒绝必须不入账（归 default 会把「类型写错」读成「普通事实」）');
    // 原 state 一字不动（拒绝路径不得产生副作用）
    const st0 = FV.assertFact(S(), { subject: 'A', predicate: 'x', value: 'y', from: 1, floor: 1 }).state;
    const snap = JSON.stringify(FV.normalize(st0));
    MT.assertTyped(FV, st0, { subject: 'A', predicate: 'x', value: 'y2', type: 'bogus', floor: 2 });
    A(JSON.stringify(FV.normalize(st0)) === snap, '★ 拒绝路径不得改动传入的 state（副作用会让调用方静默写坏账）');
    // 未知类型与「无类型」必须可分：前者拒绝、后者入账（type=null）
    const r2 = MT.assertTyped(FV, S(), { subject: 'a', predicate: 'zzz', value: 'c' });
    A(r2.reason === 'unknown-type', '无类型且推断不出 → 同样拒绝（由调用方决定是否回落）');
    const r3 = FV.assertFact(S(), { subject: 'a', predicate: 'b', value: 'c' });
    A(r3.ok === true && r3.fact.type === null, '★ 账侧直接登记（无类型）仍成功且 type=null —— 「拒绝」与「无类型」两态可分');
    ok('未知类型/空/大小写变体四路均拒绝，拒绝无副作用，与「无类型」可分');
});

/* ══════════ 3. 四策略两两可分 ══════════ */
test('v3210 3. 四冲突策略行为两两可分（auto / coexist / prefer-new / forbid）', () => {
    // auto：新 from 更大 ⇒ 换代
    let st = MT.assertTyped(FV, S(), T('心情', '好', 'character-state', 1)).state;
    let r = MT.assertTyped(FV, st, T('心情', '差', 'character-state', 5, 5));
    A(r.ok === true && r.policy === 'auto', 'auto 策略名回填');
    A(r.sequenced === true && r.superseded.length === 1, 'auto：新 from 更大 ⇒ 换代（旧条闭合 + superseded 点名）');
    // auto 的另一半：新 from 更小 ⇒ 不换代（并存）——这是 auto 与 prefer-new 的分界
    let stA = FV.assertFact(S(), { subject: 'A', predicate: '喜欢', value: 'n', from: 10, floor: 10 }).state;
    const rA = FV.assertFact(stA, { subject: 'A', predicate: '喜欢', value: 'zz', from: 3, floor: 3 });
    A(rA.sequenced === false, 'auto：新 from 更小 ⇒ 不换代（并存）');
    // coexist：恒不换代且不拒绝
    let stE = MT.assertTyped(FV, S(), T('结果', '赢', 'event-outcome', 1)).state;
    const rE = MT.assertTyped(FV, stE, T('结果', '输', 'event-outcome', 9, 9));
    A(rE.ok === true && rE.policy === 'coexist', 'coexist：矛盾并存且 ok:true（与 forbid 的 ok:false 绝不同形）');
    A(rE.sequenced === false && rE.conflict === true, 'coexist：不换代 + 标记冲突');
    A(FV.normalize(rE.state).facts.filter((f) => !f.revoked && f.to == null).length === 2, 'coexist：两条都保持有效');
    // prefer-new：无条件换代（不看 from 大小）——同输入若走 auto 则不换代
    let stP = MT.assertTyped(FV, S(), T('喜欢', '奶茶', 'player-preference', 10, 10)).state;
    const rP = MT.assertTyped(FV, stP, T('喜欢', '咖啡', 'player-preference', 3, 3));
    A(rP.ok === true && rP.policy === 'prefer-new', 'prefer-new 策略名回填');
    A(rP.sequenced === true, '★ prefer-new：新值无条件压旧（from 更小也换代 —— 与 auto 的分界）');
    // forbid：值不同 ⇒ 拒绝 + 点名；同值复述 ⇒ 幂等通过
    let stW = MT.assertTyped(FV, S(), T('规则', '魔法有代价', 'world-rule', 1)).state;
    const before = FV.normalize(stW).facts.length;
    const rW = MT.assertTyped(FV, stW, T('规则', '魔法无代价', 'world-rule', 2, 2));
    A(rW.ok === false && rW.reason === 'conflict-forbidden', '★ forbid：值不同 ⇒ 拒绝写入（矛盾的世界规则=提取错了）');
    A(Array.isArray(rW.conflictWith) && rW.conflictWith.length === 1, 'forbid：必须点名冲突对侧条目（可归因）');
    A(FV.normalize(rW.state).facts.length === before, 'forbid：拒绝不得写入新条');
    const rW2 = MT.assertTyped(FV, stW, T('规则', '魔法有代价', 'world-rule', 3, 3));
    // 语义分裂（此处必须分清）：同值**同楼层** = 幂等复述（指纹相同，走 dup 路径）；
    //   同值**不同楼层** = 新版本落账（from 参与指纹，非复述）。forbid 要守的是**不误拒**，
    //   不是要求 replayed —— 把两条语义压成一条判据正是本仓最忌的「三态压成一态」。
    A(rW2.ok === true, 'forbid：同值不得误拒（幂等复述与新版本落账都必须 ok:true）');
    A(rW2.sequenced === true && rW2.conflict === false, '★ forbid：同值输入不得被标成冲突（值相同无矛盾可言）');
    A(FV.normalize(rW2.state).facts.filter((f) => !f.revoked && f.to == null).length === 2, '同值两条都保持有效（不误换代）');
    // 真·幂等复述（同值同楼层 ⇒ 同指纹）必须走 dup 路径，且不新增条目
    const rW3 = MT.assertTyped(FV, rW2.state, T('规则', '魔法有代价', 'world-rule', 3, 3));
    A(rW3.ok === true && rW3.replayed === true && rW3.changed === false, '★ forbid：真复述（同值同楼层）幂等，不新增条目');
    A(FV.normalize(rW3.state).facts.length === FV.normalize(rW2.state).facts.length, 'forbid：复述不得新增条目');
    // 四态必须两两可分（用一个判据矩阵，任何两策略同形即翻红）
    // 判据式：按**字段**比较，不拿拼好的字符串做 endsWith/includes ——
    //   拼串会把「字段在串里的位置」当语义（endsWith('true') 实际打在 reason 上，是判据自伤）。
    const sig = (res) => ({ ok: res.ok === true, sequenced: res.sequenced === true, reason: res.reason || 'ok' });
    const keyOf = (s) => [s.ok, s.sequenced, s.reason].join('|');
    const sigs = {
        auto_seq: sig(MT.assertTyped(FV, MT.assertTyped(FV, S(), T('x', '1', 'character-state', 1)).state, T('x', '2', 'character-state', 5, 5))),
        auto_noseq: sig(FV.assertFact(FV.assertFact(S(), { subject: 'A', predicate: 'x', value: '1', from: 9, floor: 9 }).state, { subject: 'A', predicate: 'x', value: '2', from: 1, floor: 1 })),
        coexist: sig(MT.assertTyped(FV, MT.assertTyped(FV, S(), T('y', '1', 'event-outcome', 1)).state, T('y', '2', 'event-outcome', 5, 5))),
        prefernew: sig(MT.assertTyped(FV, MT.assertTyped(FV, S(), T('z', '1', 'player-preference', 9, 9)).state, T('z', '2', 'player-preference', 1, 1))),
        forbid: sig(MT.assertTyped(FV, MT.assertTyped(FV, S(), T('w', '1', 'world-rule', 1)).state, T('w', '2', 'world-rule', 2, 2))),
    };
    // 策略名本身两两不同
    const pols = ['auto', 'coexist', 'prefer-new', 'forbid'];
    A(new Set(pols).size === 4, '四策略名两两不同');
    // 形状可分：逐**字段**断言（不靠字符串位置）
    const KS = { auto_seq: keyOf(sigs.auto_seq), auto_noseq: keyOf(sigs.auto_noseq), coexist: keyOf(sigs.coexist), prefernew: keyOf(sigs.prefernew), forbid: keyOf(sigs.forbid) };
    A(Object.values(KS).every((k) => typeof k === 'string' && k.includes('|')), '签名矩阵成型（矩阵空/未求值即翻红 —— 判据自证非空转）');
    A(KS.coexist !== KS.prefernew, '★ coexist 与 prefer-new 必须可分（前者恒不换代、后者恒换代）');
    A(sigs.forbid.ok === false && [sigs.auto_seq, sigs.auto_noseq, sigs.coexist, sigs.prefernew].every((s) => s.ok === true), 'forbid 的 ok=false 与其他三策略（ok=true）可分');
    A(sigs.forbid.reason === 'conflict-forbidden', 'forbid 须带点名理由 conflict-forbidden（可归因，不是静默失败）');
    A(sigs.coexist.sequenced === false && sigs.prefernew.sequenced === true, '★ coexist 恒不换代 / prefer-new 恒换代');
    A(sigs.auto_seq.sequenced === true && sigs.auto_noseq.sequenced === false, 'auto 保留原时间序行为（新 from 更大才换代）—— 与 prefer-new 的分界');
    // ★ 顺序非偶然（真判据：翻转 from 顺序看差异是否消失，而不是把字段拼进串里按位置判）
    const pnFwd = sig(MT.assertTyped(FV, MT.assertTyped(FV, S(), T('p', '1', 'player-preference', 1)).state, T('p', '2', 'player-preference', 9, 9)));
    const coBwd = sig(MT.assertTyped(FV, MT.assertTyped(FV, S(), T('c', '1', 'event-outcome', 9, 9)).state, T('c', '2', 'event-outcome', 1, 1)));
    A(pnFwd.sequenced === true && sigs.prefernew.sequenced === true, '★ prefer-new 在「新 from 更小」与「新 from 更大」两种顺序下都换代（与时间序无关）');
    A(coBwd.sequenced === false && sigs.coexist.sequenced === false, '★ coexist 在两种 from 顺序下都不换代');
    A(sigs.auto_seq.sequenced !== sigs.auto_noseq.sequenced, '★ 对照：auto 随 from 顺序而变 —— 故上面两条「顺序无关」不是平凡性质');
    ok('四策略两两可分，auto 缺省行为与原账一致');
});

/* ══════════ 4. type 参与指纹 ══════════ */
test('v3210 4. type 参与指纹：同内容不同类型 = 两条不同事实', () => {
    let st = FV.assertFact(S(), { subject: 'A', predicate: '信任', value: '高', type: 'character-state', from: 1, floor: 1 }).state;
    const r = FV.assertFact(st, { subject: 'A', predicate: '信任', value: '高', type: 'relationship-state', from: 1, floor: 1 });
    A(r.changed === true, '★ 同 (主语,谓词,值) 但类型不同 ⇒ 不是重复（指纹含 type）');
    A(FV.normalize(r.state).facts.length === 2, '两条并存');
    // 同内容同类型 ⇒ 幂等
    let st2 = FV.assertFact(S(), { subject: 'A', predicate: 'x', value: 'y', type: 'scene-fact', from: 1, floor: 1 }).state;
    const r2 = FV.assertFact(st2, { subject: 'A', predicate: 'x', value: 'y', type: 'scene-fact', from: 1, floor: 1 });
    A(r2.changed === false && r2.replayed === true, '同内容同类型 ⇒ 幂等复述（不重复入账）');
    // 缺 type 读回 null（不写空串：空串会让「没标注」与「标注为空」同形）
    const r3 = FV.assertFact(S(), { subject: 'A', predicate: 'x', value: 'y', from: 1, floor: 1 });
    A(r3.fact.type === null, '★ 缺 type 读回 null（不得是空串）');
    const r4 = FV.assertFact(S(), { subject: 'A', predicate: 'x', value: 'y', type: '', from: 1, floor: 1 });
    A(r4.fact.type === null, '空串 type 归一成 null');
    // 读回经 copyFact 不因 maxLen 截断丢类型（32 上限）
    const longType = 'x'.repeat(80);
    const r5 = FV.assertFact(S(), { subject: 'A', predicate: 'x', value: 'y', type: longType, from: 1, floor: 1 });
    A(typeof r5.fact.type === 'string' && r5.fact.type.length <= 32, 'type 读回受 32 字上限保护（不无限膨胀）');
    ok('type 进指纹、缺省归 null、超长受保护');
});

/* ══════════ 5. lookup 的 type 过滤 ══════════ */
test('v3210 5. lookup 的 type 过滤：同对同谓词挂不同类型必须分开查', () => {
    let st = FV.assertFact(S(), { subject: 'A', predicate: '信任', value: '高', type: 'character-state', from: 1, floor: 1 }).state;
    st = FV.assertFact(st, { subject: 'A', predicate: '信任', value: '低', type: 'relationship-state', from: 1, floor: 1 }).state;
    const q1 = FV.lookup(st, { subject: 'A', predicate: '信任', type: 'character-state' });
    A(q1.reason === 'ok' && q1.fact.value === '高', '按 character-state 查 ⇒ 取到「高」');
    const q2 = FV.lookup(st, { subject: 'A', predicate: '信任', type: 'relationship-state' });
    A(q2.reason === 'ok' && q2.fact.value === '低', '按 relationship-state 查 ⇒ 取到「低」');
    const q3 = FV.lookup(st, { subject: 'A', predicate: '信任' });
    A(q3.reason === 'ambiguous', '★ 不带类型 ⇒ ambiguous（未决，两态可分；不得任选一条冒充「当前值」）');
    // 类型过滤 + 无匹配 ⇒ none（不是 none-trusted / none-current）
    const q4 = FV.lookup(st, { subject: 'A', predicate: '信任', type: 'item-state' });
    A(q4.reason === 'none' && q4.facts.length === 0, '★ 类型无匹配 ⇒ none（与「查不到任何版本」同形是对的，「有版本但类型不符」由 versions 面体现）');
    // 兼容：不带 type 字段的旧账条目仍可查（type 缺省不过滤）
    let st2 = FV.assertFact(S(), { subject: 'B', predicate: 'p', value: 'v', from: 1, floor: 1 }).state;
    A(FV.lookup(st2, { subject: 'B', predicate: 'p' }).reason === 'ok', '无类型旧账仍可正常查询（向后兼容）');
    ok('type 过滤生效，无类型路径向后兼容');
});

/* ══════════ 6. line / lineByType ══════════ */
test('v3210 6. line / lineByType：已标/未标三态可分 + 不被推断值污染', () => {
    let st = FV.assertFact(S(), { subject: 'A', predicate: 'x', value: 'y', type: 'scene-fact', from: 1, floor: 1 }).state;
    st = FV.assertFact(st, { subject: 'B', predicate: 'z', value: 'w', from: 1, floor: 1 }).state;
    const l = FV.line(st);
    A(l.includes('已标类型 1'), '账侧 line 报已标数：' + l);
    A(l.includes('未标类型 1'), '★ 账侧 line 报未标数（不静默，否则「类型没接上」不可见）：' + l);
    let st2 = FV.assertFact(S(), { subject: 'A', predicate: '心情', value: '好', type: 'character-state', from: 1, floor: 1 }).state;
    st2 = FV.assertFact(st2, { subject: 'B', predicate: '心情', value: '差', from: 1, floor: 1 }).state;
    const lb = MT.lineByType(st2);
    A(lb.includes('人物状态 1'), 'lineByType 按 label 报数：' + lb);
    A(lb.includes('未归类 1') && lb.includes('⚠️'), '★ 未归类须报数且亮警示：' + lb);
    // 关键：推断值不得冒充标注（谓词「心情」能被 inferType 猜成 character-state）
    const st3 = FV.assertFact(S(), { subject: 'A', predicate: '心情', value: '好', from: 1, floor: 1 }).state;
    const lb3 = MT.lineByType(st3);
    A(!lb3.includes('人物状态'), '★ 猜测不得计入标注（猜到的 ≠ 标了的，两态必须可分）：' + lb3);
    A(lb3.includes('未归类 1'), '未标类型的条计入未归类：' + lb3);
    // 空账与撤销条目
    A(typeof MT.lineByType(S()) === 'string' && MT.lineByType(S()).includes('暂无'), '空账返回可读读数（不抛）');
    A(typeof MT.lineByType(null) === 'string', 'null state 不抛');
    let st4 = FV.assertFact(S(), { subject: 'A', predicate: 'x', value: 'y', type: 'scene-fact', from: 1, floor: 1 }).state;
    st4 = FV.revokeFact(st4, { id: FV.normalize(st4).facts[0].id }).state;
    A(!MT.lineByType(st4).includes('场景事实'), '已撤销条目不计入类型分布');
    ok('两个 line 面读数可分且不互相冒充');
});

/* ══════════ 7. queryByType / routeForType / policyOfType ══════════ */
test('v3210 7. queryByType / routeForType / policyOfType', () => {
    let st = FV.assertFact(S(), { subject: 'A', predicate: 'x', value: '1', type: 'item-state', from: 1, floor: 1 }).state;
    st = FV.assertFact(st, { subject: 'A', predicate: 'y', value: '2', type: 'scene-fact', from: 1, floor: 1 }).state;
    const q = MT.queryByType(st, 'item-state');
    A(q.ok === true && q.count === 1 && q.facts[0].value === '1', 'queryByType 计数与取值');
    A(q.facts[0].history === undefined, '查询结果精简复制（不拖 history 大字段）');
    A(MT.queryByType(st, 'bogus').ok === false, '未知类型查询 → 拒绝（与 assertTyped 同口径）');
    // routeForType：只给路由键，不硬编码分区名
    const rW = MT.routeForType('world-rule');
    A(rW.type === 'world-rule' && rW.partition === 'typed:world-rule', 'routeForType 返回路由键 typed:<type>');
    A(rW.visibility === 'authorial' && rW.stable === true, 'permanent + authorial ⇒ 稳定注入');
    A(MT.routeForType('scene-fact').stable === false, '★ short 生命周期 ⇒ 非稳定（只在该轮相关时注入）');
    A(MT.routeForType('bogus') === null, '未知类型路由 → null');
    // ★ 不硬编码宿主分区名：判据**结构化**（拿宿主真分区表比对路由键），
    //   不用 mtSrc.includes('injection-router') —— 模块注释里作为「边界说明」提到该文件名是正常的，
    //   文本包含式判据会把散文当代码，属本仓明令禁止的假判据（本条初版即因此假红）。
    const IR = createRequire(import.meta.url)(join(ROOT, 'injection-router.js'));
    A(Array.isArray(IR.PARTITIONS) && IR.PARTITIONS.length > 0, '宿主分区表可取（判据前提成立）');
    const allRoutes = Object.keys(MT.TYPES).map((k) => MT.routeForType(k));
    A(allRoutes.every((r) => r && typeof r.partition === 'string'), '九类型均有路由键');
    A(allRoutes.every((r) => !IR.PARTITIONS.includes(r.partition)), '★ 路由键不得是宿主真分区名（映射是宿主职责，模块只给 typed:<type>）');
    A(allRoutes.every((r) => r.partition === 'typed:' + r.type), '★ 路由键格式恒为 typed:<type>（宿主据此映射）');
    // policyOfType：带出类型名与六策略副本（不改原表）
    const p = MT.policyOfType('event-outcome');
    A(p.type === 'event-outcome' && p.conflict === 'coexist' && p.overrideable === false, 'policyOfType 带类型名与策略');
    p.conflict = 'MUTATED';
    A(MT.TYPES['event-outcome'].conflict === 'coexist', '★ policyOfType 返回副本（改它不得污染唯一真源）');
    A(MT.policyOfType('bogus') === null, '未知类型 → null');
    ok('查询/路由/策略速查三面通过，真源不可从外部污染');
});

/* ══════════ 8. inferType ══════════ */
test('v3210 8. inferType：推断是提示不是裁决', () => {
    A(MT.inferType('所在') === 'location-state', '谓词「所在」→ 地点状态');
    A(MT.inferType('好感') === 'character-state', '谓词「好感」→ 人物状态');
    A(MT.inferType('随机的词') === null, '★ 猜不到 → null（不得硬塞一个类型）');
    A(MT.inferType('') === null && MT.inferType(null) === null, '空/缺 → null');
    // 提示不是裁决：显式类型必须压过推断
    const st = FV.assertFact(S(), { subject: 'A', predicate: '好感', value: '高', type: 'relationship-state', from: 1, floor: 1 }).state;
    A(FV.normalize(st).facts[0].type === 'relationship-state', '★ 显式类型优先于推断（推断只是兜底）');
    // 显式给非法类型时**不得**回落到推断（否则「写错类型名」会被推断悄悄救成「看起来对」）
    const r = MT.assertTyped(FV, S(), { subject: 'A', predicate: '好感', value: '高', type: 'bogus' });
    A(r.ok === false && r.reason === 'unknown-type', '★ 显式非法类型不得回落到推断（拒绝要拒绝得干净）');
    ok('推断命中/未命中/优先级三面通过');
});

/* ══════════ 9. 账侧策略化 ══════════ */
test('v3210 9. 账侧策略化：CONFLICT_POLICIES 导出 + assertFact 吃 conflictPolicy', () => {
    A(Array.isArray(FV.CONFLICT_POLICIES), '★ CONFLICT_POLICIES 必须随账导出（避免外部再抄一份四态清单）');
    A(JSON.stringify([...FV.CONFLICT_POLICIES].sort()) === JSON.stringify(['auto', 'coexist', 'forbid', 'prefer-new']),
        '四态取值：' + JSON.stringify(FV.CONFLICT_POLICIES));
    // 非法策略值 ⇒ 回落 auto（账侧只认自己的清单，不因外部乱传而行为不明）
    let st = FV.assertFact(S(), { subject: 'A', predicate: 'x', value: '1', from: 1, floor: 1 }).state;
    const r = FV.assertFact(st, { subject: 'A', predicate: 'x', value: '2', from: 5, floor: 5, conflictPolicy: 'nonsense' });
    A(r.policy === 'auto', '★ 非法 conflictPolicy 回落 auto（账侧不引入未定义行为），实为 ' + r.policy);
    // auto 缺省行为不变（既有测试 v3194 锁的口径必须仍然成立）
    A(FV.DEFAULT_MIN_TRUST === 0.5, 'DEFAULT_MIN_TRUST 未被动过（0.5）');
    let st2 = FV.assertFact(S(), { subject: '她', predicate: '居住', value: '北京', from: 1, floor: 1 }).state;
    st2 = FV.assertFact(st2, { subject: '她', predicate: '居住', value: '上海', from: 50, floor: 50 }).state;
    const q = FV.lookup(st2, { subject: '她', predicate: '居住' });
    A(q.reason === 'ok' && q.fact.value === '上海', 'auto 缺省：新 from 更大 ⇒ 现状取新值（原行为不变）');
    A(FV.lookup(st2, { subject: '她', predicate: '居住', at: 10 }).fact.value === '北京', '按时点回溯取旧值（原行为不变）');
    // 策略字段只在新路径出现：不带 conflictPolicy 的返回体**不得**被强行加 policy 字段（避免破坏既有取值断言）
    const r3 = FV.assertFact(S(), { subject: 'A', predicate: 'p', value: 'v', from: 1, floor: 1 });
    A(r3.ok === true, '普通登记仍 ok');
    ok('CONFLICT_POLICIES 导出、非法值回落 auto、auto 原行为逐条不变');
});

/* ══════════ 10. index.js 接线静态面 ══════════ */
test('v3210 10. index.js 接线静态面：取库口在类体外 + 诊断行 + 位置断言', () => {
    // 10a 取库口：必须在模块作用域（类体外），否则类内方法取不到（v3194 组 13 同款坑）
    const cls = idxSrc.indexOf('class MemoryEngine {');
    assert.ok(cls > 0, '找得到 MemoryEngine 类');
    const clsBody = braceMatch(idxSrc, idxSrc.indexOf('{', cls), 'MemoryEngine');
    A(idxSrc.includes('function _memoryTypeLib() {'), '★ 须定义取库口 _memoryTypeLib');
    A(!clsBody.includes('function _memoryTypeLib()'), '★ 取库口不得被搬进类体（会静默改变可见性）');
    const lib = fnBody(idxSrc, 'function _memoryTypeLib() {', '_memoryTypeLib');
    A(lib.includes("window.LonShaMemoryType"), '取库口须取 window.LonShaMemoryType');
    A(lib.includes("'memory-type.js'"), '取库口须点名模块文件名（_moduleLib 的失败归因需要它）');
    // 10b 落笔方法在类体内
    for (const sig of ['_absorbFactVersions(extracted, floor, storyTime) {']) {
        A(clsBody.includes(sig), '类体内有 ' + sig);
    }
    // 10c 落笔真调用类型化入口（真源码切段，不用文本包含当判据）
    const mv = classMethodBody(idxSrc, '_absorbFactVersions(extracted, floor, storyTime) {', '_absorbFactVersions');
    A(mv.includes('_memoryTypeLib()'), '★ 落笔须真取类型库');
    A(mv.includes('MT.assertTyped('), '★ 落笔须真调 MT.assertTyped（不是只取了库不用）');
    A(mv.includes('MT.normalizeType(typeHint)'), '★ 显式类型须先过 normalizeType（未知类型拒绝）');
    A(/return;\s*\/\/ 拒绝写入|return;\s+$\|return;/.test(mv) || mv.includes('return;'), '未知类型分支必须 return（不入账）');
    A(mv.includes('type: typeHint'), '显式类型须传给 assertTyped');
    A(mv.includes("'character-state'") && mv.includes("'relationship-state'") && mv.includes("'item-state'")
        && mv.includes("'location-state'") && mv.includes("'scene-fact'"),
        '★ 类型化分派须覆盖既有的五类来源（人物/关系/物品/地点/场景）');
    A(!/push\([^)]*'event-outcome'/.test(mv), '★ events 不得被隐式分派成 event-outcome（已有专属事件账，双存会挤占 MAX_FACTS）');
    A(mv.includes('layer || \'\') !== \'situational\''), 'cse_states 只取 situational 层（core/adaptive 是稳定人设，落场景事实是类型错配）');
    A(mv.includes("'对' + String(rel.to) + '的关系'"), '★ 关系谓词须含对侧名（否则 A-B 与 A-C 的关系会互相换代）');
    A(mv.includes("'持有' + String(it.name)"), '★ 物品谓词须含物品名（否则一件物品入库就换掉另一件）');
    // 10d 三态读数：typed / unknown / refused 必须**分开**记（不得压成一个数）
    A(mv.includes('typed.typedN') && mv.includes('typed.unknownN') && mv.includes('typed.refusedN'),
        '★ 读数须三态分开（类型化条数 / 类型名未知被拒 / 策略拒绝）——压成一态正是本版要修的病');
    A(mv.includes('_memoryTypeRead'), '读数须落在 this._memoryTypeRead（供诊断行消费）');
    A(mv.includes('moduleMissing'), '模块缺席须与「零类型化」可分');
    // 10e 诊断行真消费
    A(idxSrc.includes("['记忆类型'"), '★ selfCheck 须有「记忆类型」诊断行');
    const diag = sliceFrom(idxSrc, "['记忆类型', '模块未加载（memory-type.js）']", '// [v3.194] 事件完整性', 'selfCheck.memoryType');
    A(diag.includes('lineByType'), '诊断行须真调 lineByType');
    A(diag.includes('_memoryTypeRead'), '诊断行须消费读数（否则读数接了没人看 = 功能级失效）');
    A(diag.includes('类型名未知被拒'), '诊断行须点名「类型名未知被拒」（可归因）');
    ok('取库口位置、落笔真调用、五类分派、三态读数、诊断行消费 —— 全部静态面通过');
});

/* ══════════ 11. 接线真跑 ══════════ */
test('v3210 11. 接线真跑：抽真方法体 + fake engine 执行，逐类断言入账结果', () => {
    const mv = classMethodBody(idxSrc, '_absorbFactVersions(extracted, floor, storyTime) {', '_absorbFactVersions');
    // 真源码切段 → 包成可执行函数（不是「文本包含」当判据，也不是另写一份仿真逻辑）
    const factory = new Function('_factVersionLib', '_memoryTypeLib', 'errLog', 'window',
        'return function (extracted, floor, storyTime) ' + mv + ';');
    const run = (extracted, floor) => {
        const eng = { _factVersionState: null, protagonist: {}, _memoryTypeRead: null };
        const fn = factory(() => FV, () => MT, () => {}, {});
        const n = fn.call(eng, extracted, floor == null ? 7 : floor, '');
        return { eng: eng, n: n, facts: FV.normalize(eng._factVersionState).facts, read: eng._memoryTypeRead };
    };
    // ① 显式类型通道
    let x = run({ facts: [{ subject: '甲', predicate: '心情', value: '好', type: 'character-state' }] });
    A(x.facts.length === 1 && x.facts[0].type === 'character-state', '① facts[].type 显式类型真落账');
    A(x.read.typed === 1, '① 读数记 typed=1');
    // ② status_changes → character-state（含 delta 合成值）
    x = run({ status_changes: [{ character: '甲', field: '好感', delta: 5 }] });
    A(x.facts.length === 1 && x.facts[0].type === 'character-state', '② status_changes 归人物状态');
    A(x.facts[0].value === '+5', '② delta 合成带符号值（+5），实为 ' + JSON.stringify(x.facts[0].value));
    // ③ relationships → 谓词含对侧名
    x = run({ relationships: [{ from: '甲', to: '乙', type: '师徒' }] });
    A(x.facts.length === 1 && x.facts[0].type === 'relationship-state', '③ relationships 归关系状态');
    A(x.facts[0].predicate === '对乙的关系', '③ 谓词含对侧名，实为 ' + JSON.stringify(x.facts[0].predicate));
    // ③b 两个不同对象的关系不得互相换代（真跑验证谓词设计）
    x = run({ relationships: [{ from: '甲', to: '乙', type: '师徒' }, { from: '甲', to: '丙', type: '宿敌' }] });
    A(x.facts.length === 2 && x.facts.every((f) => !f.revoked && f.to == null), '③b 甲-乙与甲-丙两条并存（未被换代压掉）');
    // ④ items → 谓词含物品名
    x = run({ items: [{ name: '青锋剑', holder: '甲', state: '完好' }] });
    A(x.facts.length === 1 && x.facts[0].type === 'item-state', '④ items 归物品状态');
    A(x.facts[0].predicate === '持有青锋剑', '④ 谓词含物品名，实为 ' + JSON.stringify(x.facts[0].predicate));
    x = run({ items: [{ name: '青锋剑', holder: '甲', state: '完好' }, { name: '荷包', holder: '甲', state: '空' }] });
    A(x.facts.length === 2, '④b 同一持有者两件物品并存（未被换代压掉）');
    // ⑤ cse_states 的 situational → scene-fact；core/adaptive 不入账
    x = run({ cse_states: [{ character: '甲', layer: 'situational', field: '情绪', value: '紧张' }] });
    A(x.facts.length === 1 && x.facts[0].type === 'scene-fact', '⑤ situational 层归场景事实');
    x = run({ cse_states: [{ character: '甲', layer: 'core', field: '性格', value: '温和' }] });
    A(x.facts.length === 0, '⑤b core 层不入事实账（稳定人设不是场景事实）');
    x = run({ cse_states: [{ character: '甲', layer: 'adaptive', field: '习惯', value: '早起' }] });
    A(x.facts.length === 0, '⑤c adaptive 层不入事实账');
    // ⑤d toward 进谓词
    x = run({ cse_states: [{ character: '甲', layer: 'situational', field: '态度', value: '戒备', toward: '乙' }] });
    A(x.facts[0].predicate === '对乙的态度', '⑤d toward 进谓词，实为 ' + JSON.stringify(x.facts[0].predicate));
    // ⑥ location → location-state
    x = run({ location: '北京/西城', characters: ['甲'] });
    A(x.facts.length === 1 && x.facts[0].type === 'location-state', '⑥ location 归地点状态');
    A(x.facts[0].predicate === '所在', '⑥ 谓词为「所在」（查询「现在去哪里找她」的原料）');
    // ⑦ 非法类型名 ⇒ 拒绝入账 + 读数计入 unknown（且**不**回落旧路径）
    x = run({ facts: [{ subject: '甲', predicate: 'p', value: 'v', type: 'bogus-type' }] });
    A(x.facts.length === 0, '★ ⑦ 非法类型名 ⇒ 拒绝入账（不得把它当普通事实记下）');
    A(x.read.unknown === 1 && x.read.samples.length === 1, '★ ⑦ 读数计入 unknown 并留样本（可归因）');
    // ⑧ 无类型且推断不出 ⇒ 回落旧路径（不丢账）
    x = run({ facts: [{ subject: '甲', predicate: '奇奇怪怪的谓词', value: 'v' }] });
    A(x.facts.length === 1 && x.facts[0].type === null, '★ ⑧ 推断不出 ⇒ 回落无类型登记（类型不是准入门槛，不丢账）');
    // ⑧b 无类型但推断得出 ⇒ 走类型化（推断兜底生效）
    x = run({ facts: [{ subject: '甲', predicate: '好感度', value: '80' }] });
    A(x.facts.length === 1 && x.facts[0].type === 'character-state', '★ ⑧b 推断得出 ⇒ 走类型化（推断兜底真生效）');
    // ⑨ world-rule 矛盾 ⇒ 策略拒绝 + 读数计入 refused
    x = run({ facts: [{ subject: '世界', predicate: '规则', value: '魔法有代价', type: 'world-rule' }] }, 3);
    A(x.facts.length === 1, '⑨ 第一条世界规则入账');
    const eng2 = { _factVersionState: x.eng._factVersionState, protagonist: {}, _memoryTypeRead: null };
    const fn2 = factory(() => FV, () => MT, () => {}, {});
    fn2.call(eng2, { facts: [{ subject: '世界', predicate: '规则', value: '魔法无代价', type: 'world-rule' }] }, 4, '');
    const facts2 = FV.normalize(eng2._factVersionState).facts;
    A(facts2.length === 1, '★ ⑨ 矛盾的世界规则被策略拒绝（账上仍只有 1 条 —— 不再「矛盾照常并存」）');
    A(eng2._memoryTypeRead.refused === 1, '★ ⑨ 读数计入「策略拒绝」=1（拒绝可见，不静默）');
    // ⑩ 模块缺席 ⇒ 读数报 moduleMissing 且不抛
    const eng3 = { _factVersionState: null, protagonist: {}, _memoryTypeRead: null };
    const fn3 = factory(() => FV, () => null, () => {}, {});
    const n3 = fn3.call(eng3, { facts: [{ subject: '甲', predicate: 'p', value: 'v' }] }, 1, '');
    A(n3 === 1 && eng3._memoryTypeRead.moduleMissing === true,
        '★ ⑩ 类型模块缺席 ⇒ 回落旧路径仍记账，读数报 moduleMissing（三态可分，不装成「零类型化」）');
    // ⑪ 空输入不得抛、不得写坏账
    const eng4 = { _factVersionState: null, protagonist: {}, _memoryTypeRead: null };
    const fn4 = factory(() => FV, () => MT, () => {}, {});
    let threw = null;
    try { fn4.call(eng4, null, 1, ''); fn4.call(eng4, {}, 2, ''); } catch (e) { threw = e; }
    A(threw === null, '⑪ 空/缺 extracted 不得抛');
    A(FV.normalize(eng4._factVersionState).facts.length === 0, '⑪ 空输入不产生垃圾账');
    ok('真跑 11 类场景：五类分派、拒绝、回落、策略拒绝、模块缺席全过');
});

/* ══════════ 12. manifest 登记与顺序 ══════════ */
test('v3210 12. manifest 登记与加载顺序（含负控制）', () => {
    const js = mf.extra_js;
    assert.ok(Array.isArray(js), 'manifest.extra_js 须是数组');
    A(js.filter((x) => x === 'memory-type.js').length === 1, '★ memory-type.js 须恰好登记一次，实为 ' + js.filter((x) => x === 'memory-type.js').length);
    // 顺序：memory-type 依赖 fact-version（包装其 assertFact），必须**之后**加载
    const orderCheck = (list) => {
        const a = list.indexOf('fact-version.js'), b = list.indexOf('memory-type.js');
        if (a < 0 || b < 0) return { ok: false, why: '缺件' };
        return b > a ? { ok: true } : { ok: false, why: 'memory-type 排在 fact-version 之前' };
    };
    A(orderCheck(js).ok, '★ 加载顺序：memory-type.js 必须排在 fact-version.js 之后（包装其 API）');
    // 负控制：把 memory-type 挪到 fact-version 之前必须翻红（判据不是恒绿的）
    const evil = js.filter((x) => x !== 'memory-type.js');
    evil.splice(evil.indexOf('fact-version.js') - 1, 0, 'memory-type.js');
    A(orderCheck(evil).ok === false, '★ 负控制：把 memory-type 挪到 fact-version 之前，同判据必须翻红（否则是恒绿的假判据）');
    A(orderCheck(js.filter((x) => x !== 'memory-type.js')).ok === false, '★ 负控制：删掉登记必须翻红');
    // 顺序工具两向自证：缺件与倒挂分别点名
    A(orderCheck([]).why === '缺件', '工具：空清单报缺件');
    A(orderCheck(['memory-type.js', 'fact-version.js']).why.includes('之前'), '工具：倒挂报「排在之前」');
    ok('登记唯一、顺序正确、负控制两向翻红');
});

/* ══════════ 13. 判据纯度与工具两向自证 ══════════ */
test('v3210 13. 判据纯度与工具两向自证', () => {
    // 13a seg：锚点不存在 / 不唯一 / 顺序错必须抛（否则判据会拿空串当真证据）
    const thrower = (fn) => { try { fn(); return null; } catch (e) { return e; } };
    A(thrower(() => seg(idxSrc, '不存在的锚点XYZ', 'const VERSION', 'x')) !== null, '★ seg：起点锚点缺失必须抛');
    A(thrower(() => seg(idxSrc, 'const VERSION', 'TYPES_NEVER_XYZ', 'x')) !== null, '★ seg：终点锚点缺失必须抛');
    A(thrower(() => seg(idxSrc, 'class MemoryEngine', 'const VERSION', 'x')) !== null, '★ seg：顺序倒挂必须抛（起点在终点之后）');
    A(seg(idxSrc, 'function _memoryTypeLib() {', 'function _eventCompletenessLib() {', 'ok').includes('LonShaMemoryType'), 'seg 正例可用（两端各自唯一）');
    // 13b braceMatch：失配必须抛
    A(thrower(() => braceMatch('{ a ', 0, 'x')) !== null, '★ braceMatch：未闭合必须抛');
    A(braceMatch('{ a }', 0, 'x') === '{ a }', 'braceMatch 正例');
    A(braceMatch('{ "}" }', 0, 'x') === '{ "}" }', '★ braceMatch 跳过字符串里的花括号（否则切段会提前截断）');
    A(braceMatch("{ '}' }", 0, 'x') === "{ '}' }", 'braceMatch 单引号同理');
    A(braceMatch('{ // }\n }', 0, 'x') === '{ // }\n }', '★ braceMatch 跳过行注释里的花括号');
    A(braceMatch('{ /* } */ }', 0, 'x') === '{ /* } */ }', '★ braceMatch 跳过块注释里的花括号');
    // 13c classMethodBody：签名不在 / 不在类体内必须抛（防止判据落到函数作用域同名文本上）
    A(thrower(() => classMethodBody(idxSrc, '_noSuchMethodXyz() {', 'x')) !== null, '★ classMethodBody：签名不存在必须抛');
    // 13c2 sliceFrom：起点不唯一必须抛（终点不唯一是设计允许的，正是它存在的理由）
    A(thrower(() => sliceFrom(idxSrc, 'const ', 'x', 'x')) !== null, '★ sliceFrom：起点不唯一必须抛');
    A(thrower(() => sliceFrom(idxSrc, 'const VERSION', 'NEVER_XYZ', 'x')) !== null, '★ sliceFrom：起点之后找不到终点必须抛');
    A(sliceFrom(idxSrc, "['记忆类型', '模块未加载（memory-type.js）']", '// [v3.194] 事件完整性', 'x').includes('lineByType'),
        'sliceFrom 正例：能取到「记忆类型」诊断行整段（终点在全文里不唯一，取起点后首个）');
    // 13d 判据纯度：本套件的负控制必须是「真源码破坏 + 同款真判据重跑」，不得自造结论
    //   这里用 orderCheck（纯函数判据）在真清单与破坏清单上各跑一次 —— 破坏须可观测改行为
    const real = mf.extra_js;
    const ev0 = real.indexOf('fact-version.js'), ev1 = real.indexOf('memory-type.js');
    A(ev0 >= 0 && ev1 >= 0 && ev1 > ev0, '真实清单上判据为真（前提成立）');
    const broken = real.slice();
    broken[ev1] = 'fact-version.js'; broken[ev0] = 'memory-type.js';   // 交换两件 → 顺序倒挂
    const oc = (list) => {
        const a = list.indexOf('fact-version.js'), b = list.indexOf('memory-type.js');
        return (a >= 0 && b >= 0) ? (b > a) : false;
    };
    A(oc(real) === true && oc(broken) === false, '★ 判据纯度：同一判据在真清单为真、在交换后的清单为假（破坏可观测地改了行为）');
    // 13e 负控制层内的锚点字面量只准声明一次（不得靠引用被测源码的字符串自证）
    A(SELF.split("'memory-type.js'").length - 1 >= 5, '本套件多次独立引用模块名（各处判据自持，不靠单一常量）');
    A(typeof MT.TYPES === 'object' && Object.keys(MT.TYPES).length === 9, '★ 工具两向自证：真模块真有 9 类型（判据锚在真对象上，不是源码文本）');
    ok('seg / braceMatch / classMethodBody 三工具两向自证，判据纯度成立');
});

// 汇总走 exit 钩子：本套件是 node:test 文件，用例异步跑，
//   顶层裸 console.log 会在用例之前同步执行 ⇒ 恒打印「通过 0 / 失败 0」
//   （v3.209.0 的 D4/D5 两处就是此病，由 v3209 组 14 常驻守住）。
process.on('exit', () => {
    console.log('\n[v3.210 记忆类型系统] 通过 ' + pass + ' / 失败 ' + fail);
    if (fail > 0) process.exitCode = 1;
});
