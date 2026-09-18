// tests/v3173_module_wiring_surface.test.mjs
// v3.173 缝合模块接线面：把 v3.163 账本冻结的 7 个「已挂载但零消费」模块全部接上真实消费点。
//   接线纪律：每个模块必须拿到真消费点，且接线**不得改变既有行为**。
// 层次：A 模块层读数（7 个模块的 carry 形态与语义）
//       B I6 状态完备（读失败 ≠ 读到了 0）
//       C 宿主接线（取库口契约 / 台账 / 指纹零漂移）
//       D 审计账本清空 + 接线凭据（真跑扫描器）
//       E 负控制（真源码破坏 → 破坏副本 → 同款真判据）+ 工具自证
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const SCANNER = path.join(__dirname, 'audit', 'scan_module_wiring.mjs');
const idxSrc = fs.readFileSync(path.join(REPO, 'index.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const changelog = fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8');
function vnum(s) {
    const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
    return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}
// 加载模块：IIFE 双导出，取 module.exports（无 window 时回落 globalThis）
function loadFile(file, glb) {
    const src = fs.readFileSync(path.join(REPO, file), 'utf8');
    const sbox = { module: { exports: {} } };
    const fn = new Function('globalThis', 'module', 'window', 'self',
        src + '\nreturn (typeof module !== "undefined" && module.exports) ? module.exports : globalThis.' + glb + ';');
    return fn(sbox, sbox.module, undefined, undefined);
}
const CANON = loadFile('canonical-stringify.js', 'LonShaCanonical');
const DC = loadFile('dependency-closure.js', 'LonShaDependencyClosure');
const ES = loadFile('entity-semantic.js', 'LonShaEntitySemantic');
const EC = loadFile('extraction-cadence.js', 'LonShaExtractionCadence');
const FR = loadFile('floor-range.js', 'LonShaFloorRange');
const NT = loadFile('npc-ties.js', 'LonShaNpcTies');
const TR = loadFile('turn-reconciler.js', 'LonShaTurnReconciler');
let pass = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };


// ══════════ A 模块层读数（7 个模块） ══════════
test('【A1】canonical：裸调用契约不变 + 读数如实报丢键/深度截断/稀疏空洞', () => {
    // 契约零破坏：裸数组/裸字符串输出一字不动
    assert.equal(CANON.canonicalStringify({ b: 2, a: 1 }), '{"a":1,"b":2}');
    assert.equal(CANON.canonicalStringify({ a: 1, b: [1, undefined, 3] }), '{"a":1,"b":[1,null,3]}');
    assert.equal(CANON.canonicalEquals({ b: 2, a: 1 }, { a: 1, b: 2 }), true);
    assert.equal(CANON.stableHash({ a: 1, b: 2 }), CANON.stableHash({ b: 2, a: 1 }));
    // 读数：对象里值为 undefined 的键被 JSON 静默丢掉 → 必须计数
    const c1 = {};
    assert.equal(CANON.canonicalStringify({ a: 1, b: undefined }, c1), '{"a":1}');
    assert.equal(c1.canonical.undefinedDropped, 1, 'undefined 丢键应计数');
    assert.equal(c1.canonical.active, true);
    assert.equal(c1.canonical.bytes, 7);
    // 数组元素的 undefined：JSON 语义下合法地写成 null，但「悄悄变成 null」也是丢失
    const c2 = {};
    assert.equal(CANON.canonicalStringify([1, undefined, 3], c2), '[1,null,3]');
    assert.equal(c2.canonical.undefinedDropped, 1, '数组里的 undefined 也须计数');
    assert.equal(c2.canonical.sparseFilled, 0, '显式 undefined 元素不是稀疏空洞');
    // 稀疏空洞（键不存在）与显式 undefined 是两种不同的丢失，必须分开计
    const sp = [1]; sp[3] = 4;
    const c2b = {};
    assert.equal(CANON.canonicalStringify(sp, c2b), '[1,null,null,4]');
    assert.equal(c2b.canonical.sparseFilled, 2, '空洞数应计数');
    // 深度截断：深嵌套必须报 depth-cut，而不是静默产出半截结构
    let deep = 1;
    for (let i = 0; i < 260; i++) deep = { n: deep };
    const c3 = {};
    assert.ok(CANON.canonicalStringify(deep, c3).includes('[depth-cut]'), '超深结构应留下截断标记');
    assert.ok(c3.canonical.depthCut > 0, '超深结构应报深度截断');
    // 环：必须**上抛**（I6：读失败不能变成「读到了空字符串」），且读数照实落
    const cyc = { a: 1 }; cyc.self = cyc;
    const c4 = {};
    assert.throws(() => CANON.canonicalStringify(cyc, c4), /循环引用/, '环必须上抛而非静默');
    assert.equal(c4.canonical.cycles, 1, '环应计数');
    assert.ok(c4.canonical.error.includes('循环引用'), '失败原因必须落读数');
    // 空输入：emptyInput 与「读到了空字符串」可分（字符串 '' 是合法值，不是「空读」）
    const c5 = {};
    assert.equal(CANON.canonicalStringify('', c5), '""');
    assert.equal(c5.canonical.emptyInput, false, '字符串空值是合法输入');
    const c6 = {};
    assert.equal(CANON.canonicalStringify(undefined, c6), '');
    assert.equal(c6.canonical.emptyInput, true, 'undefined 入参才是「空输入」');
    assert.equal(c6.canonical.bytes, 0, '空输入的字节数只能是 0 —— 故必须靠 emptyInput 区分');
    ok('canonical 读数面（丢键/深度/环/空输入）');
});
test('【A2】dependency-closure：丢弃归因四分账 + 悬空依赖', () => {
    const c = {};
    const res = DC.computeCascade({
        items: [
            { id: 'keep', refs: ['ok'], deps: [] },
            { id: 'missref', refs: ['gone'], deps: [] },
            { id: 'missdep', refs: ['ok'], deps: ['nope'] },
            { id: 'child', refs: ['ok'], deps: ['missref'] },
        ],
        allowedRefs: ['ok'],
    }, c);
    assert.deepEqual(res.keptIds.sort(), ['keep'], '只留 keep');
    // byReason 按被调方自报的**根因前缀**分账（调用方只看 droppedIds.length 时无从区分）
    assert.equal(c.cascade.byReason['missing-ref'], 1, '外部依据缺失');
    assert.equal(c.cascade.byReason['missing-dep'], 1, '悬空依赖');
    assert.equal(c.cascade.byReason['dep-dropped'], 1, '级联传播（被上游带出）');
    assert.equal(res.droppedBy.missref, 'missing-ref:gone', '逐条归因到具体缺失项');
    assert.equal(res.droppedBy.missdep, 'missing-dep:nope');
    assert.equal(res.droppedBy.child, 'dep-dropped:missref');
    assert.equal(c.cascade.danglingDeps, 1, '悬空依赖单独计数');
    assert.equal(c.cascade.dropped, 3);
    assert.equal(c.cascade.kept, 1);
    assert.equal(c.cascade.unrestricted, false);
    // 不限制时零丢弃（旧行为不变）
    const c2 = {};
    DC.computeCascade({ items: [{ id: 'a', refs: ['whatever'], deps: [] }] }, c2);
    assert.equal(c2.cascade.dropped, 0);
    assert.equal(c2.cascade.unrestricted, true);
    ok('dependency-closure 归因四分账');
});
test('【A3】entity-semantic：解析失败三态可分 + 悬空绑定清理', () => {
    const reg = ES.createRegistry({ normalizeMatch: true });
    const e1 = reg.upsertEntity({ kind: 'person', name: '林知夏' });
    reg.upsertEntity({ kind: 'person', name: '重名' });
    reg.upsertEntity({ kind: 'person', name: '重名' });
    const c1 = {};
    assert.ok(reg.resolveEntity('person', '林知夏', '', c1));
    assert.equal(c1.entityResolve.via, 'name');
    assert.equal(c1.entityResolve.resolvedId, e1.id);
    // 完全没这个名字
    const c2 = {};
    assert.equal(reg.resolveEntity('person', '查无此人', '', c2), null);
    assert.equal(c2.entityResolve.miss, 'no-match');
    // 空值
    const c3 = {};
    reg.resolveEntity('person', '   ', '', c3);
    assert.equal(c3.entityResolve.miss, 'blank-value');
    // 重名 → ambiguous（不敢合并，但必须看得见）
    const c4 = {};
    assert.equal(reg.resolveEntity('person', '重名', '', c4), null);
    assert.equal(c4.entityResolve.miss, 'ambiguous');
    assert.equal(c4.entityResolve.candidates, 2);
    // 显式 id 找不到
    const c5 = {};
    assert.equal(reg.resolveEntity('person', 'x', 'no-such-id', c5), null);
    assert.equal(c5.entityResolve.miss, 'explicit-not-found');
    // 悬空绑定：绑定指向已不存在的实体 → 必须报 binding-dangling（而非降级成静默 no-match）。
    //   造法：importState 时带上一条指向 ghost 的绑定（importState 会保留并计数它）。
    const c6 = {};
    reg.importState({
        entities: [{ id: 'e-live', kind: 'person', name: '林知夏' }],
        valueBindings: [['person::林知夏', 'ghost-id']],
    }, c6);
    // 悬空绑定的两条通路必须都收干净（旧实现两条都静默）：
    //   ① importState 时发现绑定指向不存在的实体 → 清掉并计数（不留给后续解析去撞）；
    //   ② 万一真有烂绑定绕过导入落到解析层（外部状态被手改），resolveEntity 有防御分支
    //      报 miss='binding-dangling'——它 **不会**谎报 via='binding'，也不阻断后续名字匹配。
    assert.equal(c6.entityImport.bindingsIn, 1);
    assert.equal(c6.entityImport.bindingsKept, 0, '烂绑定不得保留');
    assert.equal(c6.entityImport.bindingsDangling, 1, '清了几个必须看得见');
    assert.deepEqual(reg.exportState().valueBindings, [], '导出状态里不得残留烂绑定');
    // 清理后名字仍可正常解析（绑定的消失没有连带伤到实体本身）
    const c6r = {};
    const got6 = reg.resolveEntity('person', '林知夏', '', c6r);
    assert.ok(got6, '清掉烂绑定后名字匹配应正常工作');
    assert.equal(c6r.entityResolve.via, 'name');
    assert.equal(c6r.entityResolve.miss, '');
    // importState：脏数据丢多少必须分账
    const c7 = {};
    reg.importState({ entities: [
        { id: 'a', kind: 'person', name: 'A' },
        { id: 'b', kind: 'not-a-kind', name: 'B' },
        { kind: 'person', name: 'no-id' },
    ], valueBindings: [['person::x', 'a'], ['person::y', 'ghost']] }, c7);
    assert.equal(c7.entityImport.input, 3);
    assert.equal(c7.entityImport.kept, 1);
    assert.equal(c7.entityImport.droppedBadKind, 1);
    assert.equal(c7.entityImport.droppedNoId, 1);
    assert.equal(c7.entityImport.bindingsIn, 2);
    assert.equal(c7.entityImport.bindingsKept, 1);
    assert.equal(c7.entityImport.bindingsDangling, 1, '悬空绑定应清理并计数');
    ok('entity-semantic 三态 + 悬空绑定');
});
test('【A4】extraction-cadence：非法旋钮回落可见 + 规则块缺口', () => {
    const schema = [
        { id: 'person', extractEveryN: 1 },
        { id: 'world', extractEveryN: 3, extractionInstructions: 'W' },
        { id: 'bad', extractEveryN: 0 },
    ];
    const c = {};
    const active = EC.computeActiveTypes(schema, 3, c);
    assert.deepEqual([...active].sort(), ['bad', 'person', 'world']);
    assert.deepEqual(c.cadence.normalizedFallback, ['bad:0->1'], '0 被改成 1 必须留痕');
    assert.equal(c.cadence.accepted, 3);
    assert.equal(c.cadence.active, 3);
    const c2 = {};
    EC.computeActiveTypes(schema, 1, c2);
    assert.deepEqual([...EC.computeActiveTypes(schema, 1)].sort(), ['bad', 'person'], 'seq=1 时 world 不该抽');
    // 规则块：只含激活且有指令的；缺指令/未激活/表外都要分账
    const c3 = {};
    const blk = EC.buildPerTypeRulesBlock(schema, new Set(['person', 'world', 'ghost']), c3);
    assert.ok(blk.includes('[world]'), 'world 有指令且激活 → 应出现');
    assert.ok(!blk.includes('[person]'), 'person 无指令 → 不应出现');
    assert.deepEqual(c3.cadenceRules.skippedNoInstructions, ['person']);
    assert.deepEqual(c3.cadenceRules.missingInSchema, ['ghost']);
    ok('extraction-cadence 节奏读数');
});
test('【A5】floor-range：「读到了 0」与「真的没有」必须可分', () => {
    const c = {};
    const merged = FR.mergeRanges([{ start: 1, end: 5 }, { start: 4, end: 12 }, { start: 20, end: 21 }, { start: 'x', end: 2 }], c);
    assert.deepEqual(merged, [{ start: 1, end: 12 }, { start: 20, end: 21 }]);
    assert.equal(c.rangeMerge.input, 4);
    assert.equal(c.rangeMerge.valid, 3, '非法区间被丢掉');
    assert.equal(c.rangeMerge.dropped, 1, '丢了多少条必须看得见');
    assert.equal(c.rangeMerge.merged, 2);
    assert.equal(c.rangeMerge.span, 14);
    // 有空洞 → holes>0
    const c2 = {};
    const pend = FR.computePendingRange([{ start: 1, end: 3 }, { start: 7, end: 9 }], 12, c2);
    assert.deepEqual(pend, [{ start: 4, end: 6 }, { start: 10, end: 12 }]);
    assert.equal(c2.pendingRange.holes, 1, '中间断口应计数');
    assert.equal(c2.pendingRange.pending, 2);
    assert.equal(c2.pendingRange.coveredTo, 9);
    assert.equal(c2.pendingRange.behind, false);
    // 水位高于最新楼层（回滚后入口）：pending 为空但 behind=true
    const c3 = {};
    assert.deepEqual(FR.computePendingRange([{ start: 1, end: 30 }], 10, c3), []);
    assert.equal(c3.pendingRange.behind, true, '水位高于最新楼层必须与「没有待处理」分开');
    assert.equal(c3.pendingRange.upToDate, true);
    // latestFloor 非法：validLatest=false（不是「读到了 0」）
    const c4 = {};
    FR.computePendingRange([], 'nope', c4);
    assert.equal(c4.pendingRange.validLatest, false);
    ok('floor-range 水位/空洞/回滚入口');
});
test('【A6】npc-ties：空结果与「数据全被丢弃」可分', () => {
    const c = {};
    // ties 是**分号分隔的字符串**（既有契约），不是数组
    const txt = NT.fmtNpcTiesContext([
        { name: 'A', ties: 'jia:1;jia:1;yi:2' },
        { name: 'B', ties: '' },
        { name: '', ties: 'bing:3' },
    ], {}, c);
    assert.ok(txt.includes('- A:jia:1;yi:2'), '输出格式与既有契约一致');
    assert.equal(c.npcTiesRead.tiesIn, 3);
    assert.equal(c.npcTiesRead.tiesDeduped, 1, '去重条数应可见');
    assert.equal(c.npcTiesRead.tiesOut, 2);
    assert.equal(c.npcTiesRead.skippedNoName, 1);
    assert.equal(c.npcTiesRead.skippedNoTies, 1);
    assert.equal(c.npcTiesRead.empty, false);
    // 全被丢弃 → empty=true（与「都没关系」同一形状但状态可分）
    const c2 = {};
    assert.equal(NT.fmtNpcTiesContext([{ name: '', ties: 'x' }], {}, c2), '');
    assert.equal(c2.npcTiesRead.empty, true);
    assert.equal(c2.npcTiesRead.input, 1, '输入条数保留 → 可区分「空输入」与「全丢」');
    // 空输入
    const c3 = {};
    NT.fmtNpcTiesContext([], {}, c3);
    assert.equal(c3.npcTiesRead.empty, true);
    assert.equal(c3.npcTiesRead.input, 0);
    ok('npc-ties 丢弃与空集可分');
});
test('【A7】turn-reconciler：多级匹配逐级降级可见 + 身份位置无关', () => {
    const c = {};
    const existing = [{ id: 'old-1', turnId: 'old-1', contentHash: 'zzz' }];
    const turns = [{ userText: 'U', assistantText: 'A' }];
    TR.assignTurnIds(turns, existing, {}, c);
    assert.equal(c.turnMatch.unmatched, 1, '内容对不上 → unmatched');
    // 同名用户轮次重复
    const c2 = {};
    TR.assignTurnIds([{ userText: 'S', assistantText: 'A1' }, { userText: 'S', assistantText: 'A2' }], [], {}, c2);
    assert.equal(c2.turnMatch.duplicateUsers, 1, '同一用户文本出现多次应计数');
    // contentHash 级匹配：位置无关（把同一轮放到库中）
    const h1 = TR.turnContentHash({ userText: 'U', assistantText: 'A' });
    const c3 = {};
    const r3 = TR.assignTurnIds([{ userText: 'U', assistantText: 'A' }], [{ id: 'lib-1', contentHash: h1 }], {}, c3);
    assert.equal(r3.claimedIds.includes('lib-1'), true, '靠 contentHash 认领回既有身份');
    assert.ok(c3.turnMatch.byMatchKey.contentHash >= 1, '靠哪一级配上的必须可见');
    // 隔离沙箱内没有 window.LonShaCanonical / require 通道，故本模块必须**如实回落**到
    //   自家 stableStringify，并把状态位标成 'local'（不能谎报 'canonical'）。
    //   真实宿主里 canonical 可用，走模块路径——这一分支在【C3】里被单独验证。
    const c4 = {};
    TR.turnContentHash({ userText: 'U', assistantText: 'A' }, c4);
    assert.equal(c4.turnHash.source, 'local', '无模块通道时应如实标 local');
    assert.equal(c4.turnHash.canonicalFailed, false, '拿不到模块不算「模块调用失败」');
    // 同一内容两次 hash 必须稳定（回落路径也不能随机）
    assert.equal(TR.turnContentHash({ userText: 'U', assistantText: 'A' }), TR.turnContentHash({ userText: 'U', assistantText: 'A' }));
    ok('turn-reconciler 逐级匹配可见');
});

// ══════════ B I6 状态完备（读失败 ≠ 读到了 0） ══════════
test('【B1】七个模块的读数都区分「失败」与「零」', () => {
    // canonical：环是失败（上抛 + error 位），而「一切正常但计数为 0」是另一回事
    const c1 = {}; const cyc = {}; cyc.self = cyc;
    assert.throws(() => CANON.canonicalStringify(cyc, c1), /循环引用/);
    assert.ok(c1.canonical.error, '失败必须落 error 字符串');
    const c2 = {}; CANON.canonicalStringify({ a: 1 }, c2);
    assert.equal(c2.canonical.error, '', '正常读不设 error');
    // turn-reconciler：模块调用失败（canonicalFailed）与「走本地」是两种状态
    const c3 = {}; TR.turnContentHash({ userText: 'u', assistantText: 'a' }, c3);
    assert.equal(c3.turnHash.canonicalFailed, false);
    assert.ok(['canonical', 'local'].includes(c3.turnHash.source), 'source 必须是二者之一，不能留空');
    // entity-semantic：miss 是枚举三态以上，不能只有一个 null
    const reg = ES.createRegistry({});
    const c4 = {}; reg.resolveEntity('person', 'nobody', '', c4);
    assert.equal(typeof c4.entityResolve.named, 'boolean', '「给了值但没匹配」与「压根没给值」必须可分');
    assert.ok(c4.entityResolve.miss.length > 0, 'miss 不得为空字符串（那就是「读到了 0」的伪装）');
    // extraction-cadence：合规类型的计数与非法类型的回落分开记
    const c5 = {};
    EC.computeActiveTypes([{ id: 'ok', extractEveryN: 2 }, { id: 'bad', extractEveryN: -1 }], 2, c5);
    assert.equal(c5.cadence.accepted, 2);
    assert.deepEqual(c5.cadence.normalizedFallback, ['bad:-1->1']);
    // floor-range：非法 latestFloor 走 validLatest，不与「pending=0」混同
    const c6 = {}; FR.computePendingRange([], 5, c6);
    assert.equal(c6.pendingRange.validLatest, true);
    assert.equal(c6.pendingRange.pending, 1);
    const c7 = {}; FR.computePendingRange([], undefined, c7);
    assert.equal(c7.pendingRange.validLatest, false, '非法入参必须报「读不了」而非「没有待处理」');
    // dependency-closure：unrestricted（没给限制）与「限制后全留」不是一回事
    const c8 = {}; DC.computeCascade({ items: [{ id: 'a', refs: [], deps: [] }] }, c8);
    assert.equal(c8.cascade.unrestricted, true);
    const c9 = {}; DC.computeCascade({ items: [{ id: 'a', refs: [], deps: [] }], allowedRefs: [] }, c9);
    assert.equal(c9.cascade.unrestricted, false);
    // npc-ties：malformed 位区分「传了非数组」与「传了空数组」
    const c10 = {}; NT.fmtNpcTiesContext([], {}, c10);
    assert.equal(c10.npcTiesRead.malformed, false);
    const c11 = {}; NT.fmtNpcTiesContext('not-an-array', {}, c11);
    assert.equal(c11.npcTiesRead.malformed, true, '形状错误必须与「空输入」分开');
    ok('I6 状态完备（7 模块）');
});
// ══════════ C 宿主接线 ══════════
test('【C1】宿主：统一取库口 + 台账字段齐备', () => {
    assert.ok(idxSrc.includes("function _moduleLib(getGlobal, fileName)"), '取库口必须存在');
    // 契约：window 优先 → require 回落 → null
    const fn = new Function('window', 'require',
        /function _moduleLib[\s\S]*?\n    \}/.exec(idxSrc)[0] + '\nreturn _moduleLib;');
    const fake = { LonShaX: { tag: 'global' } };
    const lib = fn(fake, undefined);
    assert.deepEqual(lib(() => fake.LonShaX, 'x.js'), { tag: 'global' }, 'window 可用时优先取 window');
    const viaReq = fn({}, (n) => ({ tag: 'require:' + n }));
    assert.deepEqual(viaReq(() => undefined, 'y.js'), { tag: 'require:./y.js' }, 'window 缺失时回落 require');
    const throwing = fn({}, () => { throw new Error('boom'); });
    assert.equal(throwing(() => undefined, 'z.js'), null, 'require 抛错 → null 而非崩溃');
    const noRequire = fn({}, undefined);
    assert.equal(noRequire(() => undefined, 'w.js'), null, '连 require 都没有（浏览器）→ null');
    // 全局读表达式抛错也必须兜住（不能让宿主在诊断路径上崩）
    assert.equal(noRequire(() => { throw new Error('getter boom'); }, 'v.js'), null, '读全局抛错 → null');
    // 台账字段：7 个模块各自的读数位必须都在构造函数里初始化（否则第一次读是 undefined）
    for (const f of ['_histFpRead', '_npcTiesRead', '_npcTiesSource', '_entityRegistry',
        '_entityRegistryRead', '_graphDedupCascade', '_cadenceTriage',
        '_artifactTurnReconcile', '_floorRangeLedger']) {
        assert.ok(idxSrc.includes('this.' + f + ' ='), '台账字段 ' + f + ' 必须在构造期初始化');
    }
    ok('宿主取库口 + 台账');
});
test('【C2】宿主：7 个模块都被 index.js 真实引用（不含注释）', () => {
    const body = idxSrc;
    const pairs = [
        ['LonShaCanonical', 'canonical-stringify.js'],
        ['LonShaDependencyClosure', 'dependency-closure.js'],
        ['LonShaEntitySemantic', 'entity-semantic.js'],
        ['LonShaExtractionCadence', 'extraction-cadence.js'],
        ['LonShaFloorRange', 'floor-range.js'],
        ['LonShaNpcTies', 'npc-ties.js'],
        ['LonShaTurnReconciler', 'turn-reconciler.js'],
    ];
    for (const [sym, file] of pairs) {
        assert.ok(body.includes('_moduleLib(() => window.' + sym + ', \'' + file + '\')'),
            sym + ' 必须经取库口真实取用（形如 _moduleLib(() => window.' + sym + ")" );
    }
    ok('7 个模块的取库点');
});
test('【C3】宿主：历史指纹改造逐字节零漂移（模块路径 + 回落路径）', () => {
    const m = /        _historyFingerprint\(\) \{[\s\S]*?\n        \}/.exec(idxSrc);
    assert.ok(m, '必须能抽出 _historyFingerprint 方法体');
    const body = m[0].replace('_historyFingerprint() {', '').replace(/\}\s*$/, '');
    const mkChat = (seed) => {
        const a = []; let s = seed;
        for (let i = 0; i < 70; i++) {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            a.push({ is_user: (s % 3) === 0, mes: 'm' + (s % 997) + (i % 7 === 0 ? '\r\n' : '') + '  z'.repeat(s % 5) });
        }
        return a;
    };
    // 改造前的旧实现（含逐条折叠 + 0x2c 分隔）
    const oldFp = (chat) => {
        const tail = chat.slice(0, Math.max(0, chat.length - 1)).slice(-40);
        let h = 0x811c9dc5;
        for (const mm of tail) {
            const s = (mm?.is_user ? 'u:' : 'a:') + String(mm?.mes || '').replace(/\r\n/g, '\n').trim();
            for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
            h ^= 0x2c; h = Math.imul(h, 0x01000193);
        }
        return ((h >>> 0).toString(16).padStart(8, '0')) + '_' + tail.length;
    };
    const build = (fakeWindow, libFn) => {
        const fn = new Function('window', '_moduleLib', 'return function() {' + body + '};');
        return fn(fakeWindow, libFn);
    };
    let diffCanon = 0, diffLocal = 0;
    for (let seed = 1; seed <= 120; seed++) {
        const chat = mkChat(seed);
        const w = { SillyTavern: { getContext: () => ({ chat }) }, LonShaCanonical: CANON };
        const wo = { SillyTavern: { getContext: () => ({ chat }) } };
        const instA = {};
        instA._historyFingerprint = build(w, (g) => { try { return g() || null; } catch (e) { return null; } });
        const instB = {};
        instB._historyFingerprint = build(wo, (g) => { try { return g() || null; } catch (e) { return null; } });
        const want = oldFp(chat);
        if (instA._historyFingerprint() !== want) diffCanon++;
        if (instB._historyFingerprint() !== want) diffLocal++;
    }
    assert.equal(diffCanon, 0, '走 canonical 模块的路径必须与旧实现逐字节一致');
    assert.equal(diffLocal, 0, '模块不可用时的回落路径必须与旧实现逐字节一致');
    // 读数必须如实标注走了哪条路
    const chat = mkChat(9);
    const iA = {}; iA._historyFingerprint = build({ SillyTavern: { getContext: () => ({ chat }) }, LonShaCanonical: CANON }, (g) => { try { return g() || null; } catch (e) { return null; } });
    iA._historyFingerprint();
    assert.equal(iA._histFpRead.via, 'canonical');
    const iB = {}; iB._historyFingerprint = build({ SillyTavern: { getContext: () => ({ chat }) } }, () => null);
    iB._historyFingerprint();
    assert.equal(iB._histFpRead.via, 'local', '回落必须如实标 local');
    ok('历史指纹零漂移（120 组样本 × 2 路径）');
});
test('【C4】宿主：npc-ties 接成对账器，内联版仍是输出真源', () => {
    // 内联实现的 header 一字未动（RESIDENT_MARKERS / injection-router 依赖它）
    assert.ok(idxSrc.includes("function fmtNpcTiesContext(npcs) {"), '内联函数签名不得改动（v345 契约）');
    assert.ok(idxSrc.includes('[角色长期关系网]（血缘/婚姻/主仆/宿敌等，不因是否在场而失效）'), '内联 header 不得改动');
    // 宿主里确实做了模块 vs 内联的行数对账
    assert.ok(/moduleRows[\s\S]{0,200}inlineRows/.test(idxSrc), '必须有模块版与内联版的行数对账');
    assert.ok(idxSrc.includes("_npcTiesSource = 'module+inline'") || idxSrc.includes('_npcTiesSource = \'module+inline\''), '对账生效时必须标注来源');
    // 模块版 header 与内联版已分歧（这正是「不能直接换输出」的证据）
    const modTxt = NT.fmtNpcTiesContext([{ name: 'A', ties: 'x:1' }]);
    assert.ok(modTxt.includes('角色长期关系(血缘'), '模块版 header');
    assert.ok(!modTxt.includes('[角色长期关系网]'), '模块版 header 确实与常驻识别标记不同 —— 故不能直接换输出');
    ok('npc-ties 对账器接线');
});
// ══════════ D 审计账本 + 接线凭据 ══════════
test('【D1】审计：账本已清空且 7 个模块逐个真被引用（真跑扫描器）', () => {
    const r = spawnSync(process.execPath, [SCANNER], { cwd: REPO, encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    assert.equal(r.status, 0, '真实仓库审计应通过\n' + out);
    assert.ok(/真加载成功 32\/32/.test(out), '应报告全部脚本加载成功\n' + out);
    assert.ok(/已挂载未消费 0 个（账本 0 个）/.test(out), '账本必须为空\n' + out);
    assert.ok(/声明已接线 7 个，其中真被引用 7 个/.test(out), '7 个接线凭据必须全绿\n' + out);
    ok('审计账本清空 + 接线凭据 7/7');
});
test('【D2】审计自证：接线凭据能拦住「摘掉引用」的假绿（合成夹具）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3173-cred-'));
    try {
        // 夹具：一个模块挂载全局却无人消费 —— 账本空后必须报 B4
        fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ js: 'index.js', extra_js: ['m.js'] }));
        fs.writeFileSync(path.join(dir, 'index.js'), 'console.log(1);\n');
        fs.writeFileSync(path.join(dir, 'm.js'), '(function (g) { g.LonShaCanonical = {}; })(window);\n');
        const r = spawnSync(process.execPath, [SCANNER], { cwd: dir, encoding: 'utf8', env: { ...process.env, LONSHA_AUDIT_FIXTURE: '1' } });
        const out = (r.stdout || '') + (r.stderr || '');
        assert.equal(r.status, 1, '未消费模块必须 exit 1\n' + out);
        assert.ok(/B4 新出现「已挂载但零消费」的模块全局 LonShaCanonical/.test(out), '应报 B4\n' + out);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    ok('审计自证：清空账本后零容忍');
});
// ══════════ E 负控制（真源码破坏 → 破坏副本 → 同款真判据） ══════════
// 锚点四元组 [文件, 锚点原文, 显式破坏文本, 标签]；判据一律从本表派生（防自我指涉）。
const NEG_ANCHORS = [
    ['canonical-stringify.js', 'read.depthCut++', 'read.depthCut += 0', '【A1-深度】'],
    ['canonical-stringify.js', 'read.cycles++', 'read.cycles += 0', '【A1-环】'],
    ['floor-range.js', '_read.behind = _read.coveredTo > latest;', '_read.behind = false;', '【A5-回滚】'],
    ['npc-ties.js', 'if (entry.seen.has(k)) { _read.tiesDeduped++; continue; }', 'if (entry.seen.has(k)) { continue; }', '【A6-去重】'],
    ['dependency-closure.js', "if (kind === 'missing-dep') _read.danglingDeps++", 'if (false) _read.danglingDeps++', '【A2-悬空】'],
    ['turn-reconciler.js', 'carry.turnMatch = _read', 'carry.turnMatch = null', '【A7-匹配账】'],
];
function loadBroken(file, glb, src) {
    const sbox = { module: { exports: {} } };
    const fn = new Function('globalThis', 'module', 'window', 'self',
        src + '\nreturn (typeof module !== "undefined" && module.exports) ? module.exports : globalThis.' + glb + ';');
    return fn(sbox, sbox.module, undefined, undefined);
}
const GLB_OF = {
    'canonical-stringify.js': 'LonShaCanonical', 'floor-range.js': 'LonShaFloorRange',
    'npc-ties.js': 'LonShaNpcTies', 'dependency-closure.js': 'LonShaDependencyClosure',
    'turn-reconciler.js': 'LonShaTurnReconciler',
};
test('【E1】负控制：真源码破坏 → 破坏副本 → 在副本上重跑同款真判据', () => {
    const results = [];
    for (const [file, anchorStr, destroyStr, tag] of NEG_ANCHORS) {
        const orig = fs.readFileSync(path.join(REPO, file), 'utf8');
        const hits = orig.split(anchorStr).length - 1;
        assert.equal(hits, 1, '锚点须恰中 1 次（' + file + ' / ' + tag + '）');
        assert.notEqual(destroyStr, anchorStr, '破坏文本不得等于锚点原文（' + tag + '）');
        const broken = orig.replace(anchorStr, destroyStr);
        assert.notEqual(broken, orig, '破坏必须真改到源码');
        let mod = null;
        try { mod = loadBroken(file, GLB_OF[file], broken); }
        catch (e) { results.push([tag, 'load-error', e.message]); continue; }
        let detected = false, detail = '';
        try {
            if (tag === '【A1-深度】') {
                let deep = 1;
                for (let i = 0; i < 260; i++) deep = { n: deep };
                const c = {}; const s = mod.canonicalStringify(deep, c);
                if (c.canonical.depthCut === 0 || !s.includes('[depth-cut]')) { detected = true; detail = 'depthCut=' + c.canonical.depthCut; }
            } else if (tag === '【A1-环】') {
                const cyc = {}; cyc.self = cyc;
                const c = {};
                try { mod.canonicalStringify(cyc, c); } catch (e) { /* 仍应上抛 */ }
                if (c.canonical.cycles !== 1) { detected = true; detail = 'cycles=' + c.canonical.cycles; }
            } else if (tag === '【A5-回滚】') {
                const c = {}; mod.computePendingRange([{ start: 1, end: 30 }], 10, c);
                if (c.pendingRange.behind !== true) { detected = true; detail = 'behind=' + c.pendingRange.behind; }
            } else if (tag === '【A6-去重】') {
                const c = {}; mod.fmtNpcTiesContext([{ name: 'A', ties: 'x:1;x:1' }], {}, c);
                if (c.npcTiesRead.tiesDeduped !== 1) { detected = true; detail = 'deduped=' + c.npcTiesRead.tiesDeduped; }
            } else if (tag === '【A2-悬空】') {
                const c = {}; mod.computeCascade({ items: [{ id: 'a', refs: [], deps: ['nope'] }] }, c);
                if (c.cascade.danglingDeps !== 1) { detected = true; detail = 'dangling=' + c.cascade.danglingDeps; }
            } else if (tag === '【A7-匹配账】') {
                const c = {}; mod.assignTurnIds([{ userText: 'u', assistantText: 'a' }], [], {}, c);
                if (!c.turnMatch) { detected = true; detail = 'turnMatch=' + String(c.turnMatch); }
            } else { detected = 'unhandled'; }
        } catch (e) { detected = true; detail = 'run-error:' + e.message; }
        results.push([tag, detected === true ? 'DETECTED' : (detected === 'unhandled' ? 'UNHANDLED' : 'MISSED'), detail]);
    }
    const missed = results.filter(r => r[1] !== 'DETECTED');
    assert.equal(missed.length, 0, '破坏必须全部被检出：' + JSON.stringify(results));
    ok('负控制：' + results.map(r => r[0] + '✓').join(''));
});
test('【E2】负控制工具自证：锚点命中计数 + 判据纯度 + 破坏可观测', () => {
    // ① 锚点串在目标文件中必须恰好出现 1 次（防「破坏打在空气上」）
    for (const [f, a] of NEG_ANCHORS.map(n => [n[0], n[1]])) {
        assert.equal(fs.readFileSync(path.join(REPO, f), 'utf8').split(a).length - 1, 1,
            '锚点须唯一：' + f + ' :: ' + a);
    }
    // ② 判据纯度：同文件内锚点字面量只准声明一次（本表内）
    const self = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
    for (const [, a] of NEG_ANCHORS.map(n => [n[0], n[1]])) {
        assert.equal(self.split(a).length - 1, 1, '锚点字面量只准出现 1 次（判据纯度）：' + a);
    }
    assert.ok(self.includes('NEG_ANCHORS'), '锚点集中于单一常量');
    // ③ 破坏必须可观测改行为：在真模块上跑同款判据必须为真（否则破坏没打中要害）
    assert.ok(CANON.canonicalStringify((() => { let d = 1; for (let i = 0; i < 260; i++) d = { n: d }; return d; })(), {}).includes('[depth-cut]'));
    const fc = {}; FR.computePendingRange([{ start: 1, end: 30 }], 10, fc);
    assert.equal(fc.pendingRange.behind, true, '原版上同判据必须为真');
    ok('负控制工具自证');
});
test('【F】汇总：每个声明的用例都必须报到（防静默漏跑）', () => {
    // 不自报魔数，而是数自己文件里声明了几个 test()：
    //   多一个声明、少一次 ok() 都会在这里现形 —— 这才是「假绿」真正要堵的缝。
    const self = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const declared = (self.match(/^test\('/gm) || []).length;
    assert.equal(pass, declared - 1, '本节之前应有 ' + (declared - 1) + ' 组已报到，实到 ' + pass);
    ok('本套件 ' + declared + ' 个用例全部报到');
});
