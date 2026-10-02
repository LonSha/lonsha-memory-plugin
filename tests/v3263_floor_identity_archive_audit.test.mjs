// tests/v3263_floor_identity_archive_audit.test.mjs - v3.261.0
//
// 主题：缝合 atonal519/ST-MyriadKnots（千织）的两个「说不清就别动」面。
//   · floor-identity.js —— 楼层身份匹配**证明**（四段判解：标记预留 → locator+内容 →
//     全局唯一指纹对 → 连续前缀）
//   · archive-audit.js  —— 存档体检**三分判定**（活真源 / 可清理候选 / 保留）
//
//   【为什么本档存在】
//     本插件有两处「判不了时的默认行为」此前是**隐式**的：
//       · ★ 身份面：持久记录（summary/pov/itemOps 的 floor + fp）还属不属于当前聊天？
//         此前由调用方各写一遍 —— 按 floor 号直接认领（改楼/插楼后静默错位）、
//         按指纹单条比对（同页不同代被当成同一楼）、导入外部档时干脆不判。
//         错位是**静默**的：不报错，事后无法回滚。
//       · ★ 存档面：导入的 payload 里有多少键是当前真源、多少已不消费、多少**根本判不了**？
//         此前只回答「认得的键回填了、不认得的收进备份袋」，没人回答三分。
//         最贵的形态是「说不清是谁的」被当成「可以删」——那是删别人的数据。
//     两条路径的共同纪律：**判不了 ⇒ 不认领 / 不动**，且必须能被点名（根因码）。
//
//   【判据与负控制跑同一份代码】
//     judgeSlice(idxSrc, uiSrc, fiSrc, aaSrc) 是纯函数；A/C 段对磁盘真源码跑它，
//     D 段对**真源码破坏后的副本**跑同一个它。破坏一律走唯一真源
//     tests/_break_kit.mjs 的 breakSource（锚点须恰中 1 次）。
//     B 段直接 require 真模块做真执行 —— 判据测的是真实现，不是文本形状。
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
/** 版本序（仅本档 E 段当版锚点用）：3.261.0 → 3261000。 */
const vnum = (v) => String(v).split('.').map(Number).reduce((a, b) => a * 1000 + b, 0);
const IDX = read('index.js');
const UI_SRC = read('settings-ui.js');
const FI_SRC = read('floor-identity.js');
const AA_SRC = read('archive-audit.js');
const SELF = read('tests/v3263_floor_identity_archive_audit.test.mjs');
const MOD_FI = 'floor-identity.js';
const MOD_AA = 'archive-audit.js';
/** 两模块的冻结出口面（A 段逐项在场；D 段破坏后必须消失）。 */
const FI_EXPORTS = [
    'FLOOR_MATCH_ISSUE_CODES', 'PREFIX_ERROR_CODES', 'sameLocator', 'contentOf',
    'matchFloorCandidates', 'inheritedPrefix', 'line',
];
const AA_EXPORTS = [
    'ARCHIVE_AUDIT_VERSION', 'AUDIT_GROUPS', 'VALUE_KINDS', 'kindOf', 'serializable',
    'bytesOf', 'inspectArchiveContract', 'classifyArchive', 'classifyGroup', 'line',
];

/**
 * 纯判据切片：对「入口 + 面板 + 两模块源码」做静态核对。
 * 返回缺陷清单（空数组 = 通过）。A/C 段与 D 段跑的是同一个它。
 */
function judgeSlice(idxSrc, uiSrc, fiSrc, aaSrc) {
    const defects = [];
    const idx = stripComments(idxSrc);
    const ui = stripComments(uiSrc);
    // 1) 入口必须真消费两个新模块的全局符号（零容忍面：挂载了却无人取用 = 静默失效）
    if (!idx.includes('window.LonShaFloorIdentity')) defects.push('入口未消费 window.LonShaFloorIdentity（模块挂载了却无人取用）');
    if (!idx.includes('window.LonShaArchiveAudit')) defects.push('入口未消费 window.LonShaArchiveAudit（模块挂载了却无人取用）');
    // 2) 两取库口必须在场且被真调用（只定义不调用 = 取来不用）
    if (!idx.includes('function _floorIdentityLib()')) defects.push('缺 _floorIdentityLib() 取库口定义');
    if (!idx.includes('function _archiveAuditLib()')) defects.push('缺 _archiveAuditLib() 取库口定义');
    if (!idx.includes('const FI = _floorIdentityLib();')) defects.push('缺 _floorIdentityLib() 真调用（取库口取来不用）');
    if (!idx.includes('const AA = _archiveAuditLib();')) defects.push('缺 _archiveAuditLib() 真调用（取库口取来不用）');
    // 3) 消费点一：存档体检（恢复现场就地算，契约取现成真源 ARCHIVE_TOP_LEVEL_KEY_SET）
    if (!idx.includes('classifyArchive(data, ARCHIVE_TOP_LEVEL_KEY_SET)')) defects.push('存档体检未真调用 classifyArchive（模块取来不用）');
    if (!idx.includes('this._lastArchiveAudit = res.archiveAudit')) defects.push('缺存档体检留档（_lastArchiveAudit 未落盘）');
    if (!idx.includes("if (au.verdict !== 'classified') return ['存档体检'")) defects.push('存档体检自检行缺「判不了」态（三态被压成两态）');
    // 4) 消费点二：itemOps 忠实认领证明（只读：候选 locator 置负值，只让唯一指纹段生效）
    if (!idx.includes('const _entries = _chat.map((m, i) => {')) defects.push('缺物品认领的楼层侧 _entries 构造');
    if (!idx.includes("const _fp = String(o?.fp || '');")) defects.push('缺候选侧指纹读取（op 的 fp）');
    if (!idx.includes('matchFloorCandidates(_entries, _candidates)')) defects.push('物品认领未真调用 matchFloorCandidates');
    if (!idx.includes('engine._lastItemOpsClaim = _claim;')) defects.push('缺物品认领台账（_lastItemOpsClaim 未落盘）');
    if (!idx.includes("if (!c) return ['物品认领'")) defects.push('物品认领自检行缺「待导入」态');
    // 5) 面板面：卡片 + 视图（面板真调用，不是只留引擎出口）
    if (!ui.includes('data-view="archive"')) defects.push('settings-ui 缺存档体检卡片');
    if (!ui.includes("viewType === 'archive'")) defects.push('settings-ui 缺存档体检视图分支');
    if (!ui.includes('const aa = s._lastArchiveAudit;')) defects.push('存档体检视图未真读 _lastArchiveAudit');
    if (!ui.includes('const cl = s._lastItemOpsClaim;')) defects.push('存档体检视图未真读 _lastItemOpsClaim');
    // 6) 模块侧：IIFE 双导出 + 全局挂载名 + 零依赖
    for (const [src, g, tag] of [[fiSrc, 'LonShaFloorIdentity', MOD_FI], [aaSrc, 'LonShaArchiveAudit', MOD_AA]]) {
        if (!src.includes('global.' + g + ' = api')) defects.push(tag + ' 未挂载全局 ' + g);
        if (!src.includes('module.exports = api')) defects.push(tag + ' 缺 CommonJS 双导出');
        if (/^\s*(?:import|export)\s/m.test(src)) defects.push(tag + ' 必须零依赖（不得 import/export，走 IIFE + CJS 双出口）');
    }
    // 7) 身份面四段判解必须在场（缺一段即静默错位）
    if (!fiSrc.includes("if (marker?.status === 'none') continue;")) defects.push('floor-identity 缺段 1 标记预留（更早的无标记候选会吃掉靠标记认领的楼）');
    if (!fiSrc.includes("note('ambiguousLocatorCanonical', candidateIndex);")) defects.push('floor-identity 缺 locator 多命中判不了（ambiguousLocatorCanonical）');
    if (!fiSrc.includes("note('ambiguousFingerprint', candidateIndex);")) defects.push('floor-identity 缺指纹非唯一判不了（ambiguousFingerprint）');
    if (!fiSrc.includes("throw fail('NOT_PREFIX'")) defects.push('floor-identity 缺非连续前缀必须抛（NOT_PREFIX）');
    // 8) 存档面三分判定与契约门控必须在场
    if (!aaSrc.includes('const contractUsable = Array.isArray(activeKeys)')) defects.push('archive-audit 缺契约可用性门控（contractUsable）');
    if (!aaSrc.includes('const canCleanup = contractUsable && !activeSet.has(key)')) defects.push('★ 契约门控被摘：无契约时仍会产出可清理候选（把「说不清」当成「可以删」）');
    if (!aaSrc.includes('if (isAlive) {')) defects.push('archive-audit 缺活键分支（三分判定退化成两分）');
    if (!aaSrc.includes('Unreachable is not proof of ownership')) defects.push('archive-audit 缺源码纪律注释（不可达 ≠ 可以删）');
    return defects;
}

/* ========== A 模块面：出口清单冻结 + 双导出 + 静态判据（对磁盘真源码） ========== */
test('v3263 A. 模块面：出口清单冻结 + 双导出 + 静态判据', async () => {
    const FI = (await import('../floor-identity.js')).default;
    const AA = (await import('../archive-audit.js')).default;
    for (const k of FI_EXPORTS) assert.ok(k in FI, 'floor-identity 出口须在场: ' + k);
    for (const k of AA_EXPORTS) assert.ok(k in AA, 'archive-audit 出口须在场: ' + k);
    assert.deepEqual(Object.keys(FI).sort(), [...FI_EXPORTS].sort(), 'floor-identity 出口面须与冻结清单逐项一致');
    assert.deepEqual(Object.keys(AA).sort(), [...AA_EXPORTS].sort(), 'archive-audit 出口面须与冻结清单逐项一致');
    // 根因码表冻结：判不了必须能被点名，码表被改小等于丢根因
    assert.deepEqual([...FI.FLOOR_MATCH_ISSUE_CODES], [
        'markerRejected', 'markerConflict', 'duplicateMarker', 'duplicateBinding',
        'ambiguousLocatorCanonical', 'ambiguousFingerprint',
    ], '身份判不了根因码表冻结');
    assert.deepEqual([...FI.PREFIX_ERROR_CODES], ['FLOOR_MATCH_INVALID', 'NOT_PREFIX'], '前缀错误码表冻结');
    assert.deepEqual([...AA.AUDIT_GROUPS], ['ledger', 'state', 'config', 'other'], '存档分组表冻结');
    assert.equal(AA.ARCHIVE_AUDIT_VERSION, 1, '存档体检契约版本');
    const defects = judgeSlice(IDX, UI_SRC, FI_SRC, AA_SRC);
    assert.deepEqual(defects, [], '静态判据须零缺陷，实为: ' + JSON.stringify(defects));
});

/* ========== B 行为面：真模块真执行 ========== */
test('v3263 B. 行为面：四段判解 + 前缀纪律 + 三分判定', async () => {
    const FI = (await import('../floor-identity.js')).default;
    const AA = (await import('../archive-audit.js')).default;
    const loc = (i) => ({ messageIndex: i, swipeId: 0, selectedSwipeIndex: 0 });
    const entry = (id, i, fp) => ({ id, hostLocator: loc(i), content: { canonicalFingerprint: fp, rawFingerprint: fp } });
    const cand = (i, fp, anchor) => ({ hostLocator: loc(i), canonicalFingerprint: fp, rawFingerprint: fp, messageAnchor: anchor || { status: 'none' } });

    // B1 locator 三键全等才叫同一位置；缺键按 undefined 比（不比「看起来像」）
    assert.equal(FI.sameLocator(loc(0), loc(0)), true);
    assert.equal(FI.sameLocator(loc(0), { messageIndex: 0, swipeId: 0 }), false, '★ 缺键不算同一位置');
    assert.equal(FI.sameLocator({ messageIndex: 0, swipeId: 0, selectedSwipeIndex: 1 }, loc(0)), false, '★ 同页不同 swipe 不算同一位置');
    assert.deepEqual(FI.contentOf(undefined), {}, '缺内容 = 空对象（不抛）');

    // B2 段 1 先行：靠标记认领的候选必须赢过更早的无标记候选（源码纪律）
    const r1 = FI.matchFloorCandidates([entry('a', 0, 'X')], [cand(0, 'X'), cand(9, 'Z', { status: 'valid', anchor: { entryId: 'a' } })]);
    assert.deepEqual(r1.matches.map((m) => [m.candidateIndex, m.entryIndex, m.kind]), [[1, 0, 'marker']], '★ 段 1 标记预留须先行');
    assert.deepEqual([...r1.unmatchedCandidateIndexes], [0], '无标记候选须落未认领（不得抢占已被标记认领的楼）');
    assert.equal(r1.issue, null, '全程可证明时 issue 须为 null');

    // B3 段 2 歧义：locator 命中多楼且内容相等 ⇒ 判不了（不得任选其一）
    const r2 = FI.matchFloorCandidates([entry('a', 0, 'X'), entry('b', 0, 'X')], [cand(0, 'X')]);
    assert.equal(r2.matches.length, 0, '歧义时不得产出任何匹配');
    assert.equal(r2.issue.code, 'ambiguousLocatorCanonical');
    assert.equal(r2.issue.candidateIndex, 0, '根因须点名候选序号');

    // B4 段 3 全局唯一指纹对：无 locator 可依时，(raw, canonical) 两侧都唯一才认领
    const r3 = FI.matchFloorCandidates([entry('a', 0, 'X')], [cand(7, 'X')]);
    assert.deepEqual(r3.matches.map((m) => m.kind), ['uniqueFingerprint'], 'locator 不同但指纹全局唯一 ⇒ 可证');
    assert.equal(r3.issue, null);
    const r4 = FI.matchFloorCandidates([entry('a', 0, 'X')], [cand(7, 'X'), cand(8, 'X')]);
    assert.equal(r4.matches.length, 0, '★ 竞争候选侧不唯一 ⇒ 判不了');
    assert.equal(r4.issue.code, 'ambiguousFingerprint');

    // B5 段 1 的三个拒绝态：状态非 valid / 标记指向不在册 / 两候选标记同楼
    assert.equal(FI.matchFloorCandidates([entry('a', 0, 'X')], [cand(0, 'X', { status: 'foreign' })]).issue.code, 'markerRejected');
    assert.equal(FI.matchFloorCandidates([], [cand(0, 'X', { status: 'valid', anchor: { entryId: 'zzz' } })]).issue.code, 'markerConflict');
    const mk = { status: 'valid', anchor: { entryId: 'a' } };
    assert.equal(FI.matchFloorCandidates([entry('a', 0, 'X')], [cand(0, 'X', mk), cand(1, 'X', mk)]).issue.code, 'duplicateMarker');

    // B6 前缀纪律：连续前缀可证；前缀外仍有匹配 ⇒ 必须抛 NOT_PREFIX（不得「尽量多取」）
    const p = FI.inheritedPrefix({ entries: [entry('p0', 0, 'A'), entry('p1', 1, 'B')] }, [cand(0, 'A'), cand(1, 'B')]);
    assert.equal(p.count, 2, '连续前缀须全取');
    assert.equal(p.candidates.length, 2);
    assert.equal(p.entries.length, 2);
    const outside = { hostLocator: loc(5), canonicalFingerprint: 'Y', rawFingerprint: 'Y', messageAnchor: { status: 'none' } };
    const marked = { hostLocator: loc(9), canonicalFingerprint: 'Z', rawFingerprint: 'Z', messageAnchor: { status: 'valid', anchor: { entryId: 'p0' } } };
    assert.throws(() => FI.inheritedPrefix({ entries: [entry('p0', 0, 'A')] }, [outside, marked]), (e) => e.code === 'NOT_PREFIX', '★ 前缀外仍有可证匹配 ⇒ 必须抛 NOT_PREFIX');
    assert.throws(() => FI.inheritedPrefix({ entries: [entry('p0', 0, 'A')] }, [cand(0, 'A', { status: 'foreign' })]), (e) => e.code === 'FLOOR_MATCH_INVALID', '判不了 ⇒ 抛 FLOOR_MATCH_INVALID（不得退回「空前缀」）');

    // B7 一行读数：判不了必须点名根因（不许被压成「0 对」）
    assert.match(FI.line(r2), /判不了（ambiguousLocatorCanonical @ 候选 0）/, '判不了须点名根因');
    assert.match(FI.line(r3), /已证 1 对（uniqueFingerprint 1）/, '可证须报段别与对数');

    // B8 存档面：值形态六态 + 序列化 + 字节
    assert.deepEqual([AA.kindOf(null), AA.kindOf([]), AA.kindOf(1), AA.kindOf('s'), AA.kindOf(true), AA.kindOf(undefined), AA.kindOf(() => {})],
        ['null', 'array', 'number', 'string', 'boolean', 'unreadable', 'unreadable'], '值形态六态 + 判不了');
    const cyc = {}; cyc.self = cyc;
    assert.equal(AA.serializable(cyc), false, '循环引用须判不了');
    assert.equal(AA.bytesOf(cyc), 0, '判不了不编造体积');
    assert.equal(AA.bytesOf({ a: 1 }), 7, '字节按 JSON.stringify 后 UTF-8 计');

    // B9 契约诊断：无契约 / 不可读 / 完好三态可分（无契约 ≠ 契约是空的）
    assert.equal(AA.inspectArchiveContract(null), null, '★ 无契约 = null（≠「契约是空的」）');
    assert.equal(AA.inspectArchiveContract(42), 'unreadable', '给了但不可枚举 ⇒ unreadable');
    assert.equal(AA.inspectArchiveContract(['a']), 'unreadable', '数组不是契约对象形态');
    assert.deepEqual(AA.inspectArchiveContract('a,b c').activeKeys, 3, '字符串契约按分隔符切');
    assert.deepEqual([...AA.inspectArchiveContract({ a: 'ledger', b: 'nope' }).unusable], ['b'], '组名不合法须进 unusable（不静默吞）');

    // B10 三分判定：活 / 可清理 / 保留（含两条判不了的原因）
    const payload = { ledgerX: { n: 1 }, extraFoo: [1, 2], gone: undefined, cyc };
    const c1 = AA.classifyArchive(payload, { ledgerX: 'ledger' });
    assert.equal(c1.ok, true);
    assert.equal(c1.verdict, 'classified');
    assert.deepEqual([c1.stats.active.count, c1.stats.cleanup.count, c1.stats.retained.count], [1, 1, 2], '三分读数');
    assert.deepEqual(c1.entries.map((e) => [e.key, e.verdict, e.reason || '']), [
        ['ledgerX', 'active', ''], ['extraFoo', 'cleanup', ''],
        ['gone', 'retained', 'value-unreadable'], ['cyc', 'retained', 'value-cyclic'],
    ], '逐键三元组须可点名（含原因）');

    // ★ B11 本档抓到的真设计缺陷：无契约时不得产出任何可清理候选
    //   （初版把「说不清是谁的」当成「可以删」；与源码 malformed/foreign 同一条纪律）
    const c2 = AA.classifyArchive({ a: 1, b: 2 }, null);
    assert.equal(c2.ok, true, '无契约仍可产出读数');
    assert.equal(c2.stats.cleanup.count, 0, '★ 无契约 ⇒ 零可清理候选（判不了就必须留）');
    assert.equal(c2.stats.retained.count, 2, '无契约 ⇒ 全部落保留');
    assert.deepEqual([...new Set(c2.entries.map((e) => e.reason))], ['contract-mismatch'], '保留原因须可点名');

    // B12 畸形载荷：不硬判（ok=false + 原因），不抛
    assert.equal(AA.classifyArchive([1, 2], ['a']).ok, false, '数组载荷不是可分类对象');
    assert.equal(AA.classifyArchive(null, ['a']).ok, false);
    assert.equal(AA.classifyArchive(null, ['a']).verdict, 'invalid-payload');
    assert.ok(AA.classifyArchive(null, ['a']).reason.length > 0, '判不了须给原因');

    // B13 分组启发式 + 一行读数
    assert.equal(AA.classifyGroup('ledgerBook', 1), 'ledger');
    assert.equal(AA.classifyGroup('myConfig', { x: 1 }), 'config');
    assert.equal(AA.classifyGroup('plainArr', []), 'state');
    assert.equal(AA.classifyGroup('weird', 1), 'other', '认不出来归 other（不猜）');
    assert.match(AA.line(c1), /活 1 键\/7B · 可清理 1 键\/5B · 保留 2 键\/0B（共 4 键\/12B）/, '三个数必须都在（判不了不许被压成 0）');
    assert.match(AA.line(AA.classifyArchive(null, ['a'])), /体检失败（载荷不是可分类的对象）/, '失败态须如实说');
});

/* ========== C 接线面：六处接线 + 面板 + 两行自检 + 加载序 ========== */
test('v3263 C. 接线面：消费点 + 面板 + 自检行 + 加载序 + 数量锁 + 基线', () => {
    const mf = JSON.parse(read('manifest.json'));
    for (const m of [MOD_FI, MOD_AA]) {
        assert.equal(mf.extra_js.filter((f) => f === m).length, 1, m + ' 须在 extra_js 恰好 1 次');
        assert.ok(mf.extra_js.includes(m), m + ' 须在 extra_js 内');
    }
    assert.equal(mf.extra_js[mf.extra_js.length - 1], MOD_AA, '本刀模块须接管 extra_js 末项（加载序 frontier）');
    // 两行自检（三态可分：模块不可用 / 待导入 / 有读数）
    assert.ok(IDX.includes("'存档体检'"), 'selfCheck 缺「存档体检」一栏');
    assert.ok(IDX.includes("'物品认领'"), 'selfCheck 缺「物品认领」一栏');
    assert.ok(IDX.includes('this._lastArchiveAudit'), 'selfCheck 须读 _lastArchiveAudit 留档');
    assert.ok(IDX.includes('this._lastItemOpsClaim'), 'selfCheck 须读 _lastItemOpsClaim 台账');
    // 面板：卡片 + 视图（面板真调用，不是只留引擎出口）
    assert.ok(UI_SRC.includes('data-view="archive"'), 'settings-ui 缺存档体检卡片');
    assert.ok(UI_SRC.includes("viewType === 'archive'"), 'settings-ui 缺存档体检视图分支');
    // 只读纪律：认领证明不得改数据（不写回 itemOps）
    const _c0 = IDX.indexOf('忠实认领**证明**');
    const _c1 = IDX.indexOf('engine._lastItemOpsClaim = _claim;');
    // 切片边界必须先自证：`indexOf` 为 -1 时 `slice(-1, …)` 会**静默假绿**
    //   （负控制抓不到 —— 与 v3262 D 段那两类假绿同族：破坏打在判据的观测点上）。
    assert.ok(_c0 > 0 && _c1 > _c0, '★ 认领证明切片边界须有效（起 ' + _c0 + ' / 止 ' + _c1 + '）');
    const claim = IDX.slice(_c0, _c1);
    assert.ok(!/engine\.itemOps\s*=/.test(claim), '★ 认领证明须只读（不得在证明段写回 itemOps）');
    assert.ok(claim.includes('messageIndex: -1'), '候选 locator 须置负值（只让全局唯一指纹段生效）');
    // 基线与本档同源
    const b = JSON.parse(read('tests/audit/host_beast_baseline.json'));
    assert.equal(b.readings.total_lines, IDX.split(NL).length, '基线行数须等于真 index.js 行数');
    assert.ok(b.rebuilds[b.measured_at], '当版须在 rebuilds 面留读数');
    assert.equal(b.rebuilds[b.measured_at].readings.member_count, b.readings.member_count, 'rebuilds 与 readings 同读数');
    // 数量锁已被本刀接管
    const V3209 = read('tests/v3209_migration_registry.test.mjs');
    assert.ok(V3209.includes('mf.extra_js.length === 76'), 'v3209 数量锁须已接管为 76');
    // 判据面自防护
    assert.ok(SELF.length > 9000, '本套件不得被掏空（当前 ' + SELF.length + ' 字节）');
    assert.ok((SELF.match(/assert\./g) || []).length >= 40, '断言密度须 >= 40，实为 ' + (SELF.match(/assert\./g) || []).length);
    assert.ok(SELF.includes('★'), '关键判据须带 ★ 标记');
});

/* ========== D 真源码破坏负控制（副本上跑同一份判据） ========== */
test('v3263 D. 负控制：真源码破坏后同一条判据必须翻红', () => {
    const cases = [
        // —— 入口接线面 ——
        { label: '存档体检取库口被摘', f: 'idx', anchor: 'const AA = _archiveAuditLib();', repl: 'const AA = null;', want: /缺 _archiveAuditLib\(\) 真调用/ },
        { label: '存档体检未真调用分类器', f: 'idx', anchor: 'classifyArchive(data, ARCHIVE_TOP_LEVEL_KEY_SET)', repl: 'classifyArchiveXXXX(data, ARCHIVE_TOP_LEVEL_KEY_SET)', want: /未真调用 classifyArchive/ },
        { label: '楼层身份取库口被摘', f: 'idx', anchor: 'const FI = _floorIdentityLib();', repl: 'const FI = null;', want: /缺 _floorIdentityLib\(\) 真调用/ },
        { label: '物品认领台账被摘', f: 'idx', anchor: 'engine._lastItemOpsClaim = _claim;', repl: 'engine._lastItemOpsClaimXXXX = _claim;', want: /缺物品认领台账/ },
        { label: '楼层侧 _entries 构造被摘', f: 'idx', anchor: 'const _entries = _chat.map((m, i) => {', repl: 'const _entriesXXXX = _chat.map((m, i) => {', want: /缺物品认领的楼层侧 _entries 构造/ },
        { label: '候选指纹读取被摘', f: 'idx', anchor: "const _fp = String(o?.fp || '');", repl: "const _fpXXXX = String(o?.fp || '');", want: /缺候选侧指纹读取/ },
        // —— 面板面 ——
        { label: '存档体检视图被摘', f: 'ui', anchor: "viewType === 'archive'", repl: "viewType === 'archiveXX'", want: /缺存档体检视图分支/ },
        { label: '存档体检卡片被摘', f: 'ui', anchor: 'data-view="archive"', repl: 'data-view="archiveXX"', want: /缺存档体检卡片/ },
        // —— 身份面四段 ——
        { label: '段 1 标记预留被摘', f: 'fi', anchor: "if (marker?.status === 'none') continue;", repl: "if (marker?.status === 'noneXX') continue;", want: /缺段 1 标记预留/ },
        { label: 'locator 歧义判据被摘', f: 'fi', anchor: "note('ambiguousLocatorCanonical', candidateIndex);", repl: "note('ambiguousLocatorCanonicalXX', candidateIndex);", want: /缺 locator 多命中判不了/ },
        { label: '指纹非唯一判据被摘', f: 'fi', anchor: "note('ambiguousFingerprint', candidateIndex);", repl: "note('ambiguousFingerprintXX', candidateIndex);", want: /缺指纹非唯一判不了/ },
        { label: '非连续前缀必须抛被摘', f: 'fi', anchor: "throw fail('NOT_PREFIX'", repl: "throw fail('NOT_PREFIX_XX'", want: /缺非连续前缀必须抛/ },
        { label: '身份模块全局挂载名被改', f: 'fi', anchor: 'global.LonShaFloorIdentity = api', repl: 'global.LonShaFloorIdentityXX = api', want: /未挂载全局 LonShaFloorIdentity/ },
        // —— 存档面三分与门控 ——
        { label: '★ 契约门控被摘', f: 'aa', anchor: 'const canCleanup = contractUsable && !activeSet.has(key)', repl: 'const canCleanup = !activeSet.has(key)', want: /契约门控被摘/ },
        { label: '契约可用性门控定义被摘', f: 'aa', anchor: 'const contractUsable = Array.isArray(activeKeys)', repl: 'const contractUsableXX = Array.isArray(activeKeys)', want: /缺契约可用性门控/ },
        { label: '活键分支被摘', f: 'aa', anchor: 'if (isAlive) {', repl: 'if (isAliveXX) {', want: /缺活键分支/ },
        { label: '源码纪律注释被摘', f: 'aa', anchor: 'Unreachable is not proof of ownership', repl: 'Unreachable IS proof of ownership', want: /缺源码纪律注释/ },
        { label: '存档模块全局挂载名被改', f: 'aa', anchor: 'global.LonShaArchiveAudit = api', repl: 'global.LonShaArchiveAuditXX = api', want: /未挂载全局 LonShaArchiveAudit/ },
    ];
    for (const c of cases) {
        const src = c.f === 'idx' ? IDX : (c.f === 'ui' ? UI_SRC : (c.f === 'fi' ? FI_SRC : AA_SRC));
        const broken = breakSource(src, c.anchor, c.repl, c.label);
        assert.notEqual(broken, src, c.label + '：破坏须真的改变源码');
        const d = judgeSlice(
            c.f === 'idx' ? broken : IDX,
            c.f === 'ui' ? broken : UI_SRC,
            c.f === 'fi' ? broken : FI_SRC,
            c.f === 'aa' ? broken : AA_SRC,
        );
        const hit = d.some((x) => c.want.test(x));
        assert.ok(hit, c.label + '：破坏后同一条判据必须翻红，实得 ' + JSON.stringify(d));
    }
    // 负控制锚点纯度：破坏串不得包含锚点（否则 includes 判据仍命中 = 破坏打在观测点上）
    for (const c of cases) {
        assert.ok(!c.repl.includes(c.anchor), c.label + '：替换串不得包含锚点（会退化成打在判据观测点上）');
    }
});

/* ========== E 版本锚 ========== */
test('v3263 E. 版本锚：四源同版 + 本档随版冻结', () => {
    const ver = (IDX.match(/const VERSION = '([0-9.]+)'/) || [])[1];
    assert.equal(ver, '3.261.0', 'index.js 版本须为本刀版本');
    assert.equal(JSON.parse(read('manifest.json')).version, ver, 'manifest 版本须与入口同源');
    assert.equal(JSON.parse(read('package.json')).version, ver, 'package 版本须与入口同源');
    assert.match(read('CHANGELOG.md'), /^## v3\.261\.0/, 'CHANGELOG 顶节须为本版');
    assert.match(read('TODO.md'), /最近更新：v3\.261\.0/, 'TODO「最近更新」须为本版');
    // V4 当版锚点：以 vnum 恰好锚着当版（不写死等号，供下一版接管时平滑交棒）
    assert.equal(vnum('3.261.0'), 3261000, '本档即当版：vnum 须恰好锚着 3.261.0');
});
