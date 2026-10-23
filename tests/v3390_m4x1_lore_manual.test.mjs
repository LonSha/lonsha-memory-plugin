/* ============================================================
 * tests/v3390_m4x1_lore_manual.test.mjs — v3.339.0 · M4-X1
 * 可校订的分层导入与源资料更新（人工校订 + 落笔 + 导入账）
 *
 * 【本档要证明的四件事（不是「函数返回了对象」）】
 *   a) **人工校订真能改类 / 拆分**：`applyOverrides` 把人工决定叠到规则判上，
 *      规则原判（`clsRule`）**永不丢**（人工痕迹与规则痕迹分列），非法类名 / 缺切点
 *      一律拒收并具名，不静默落回默认类。
 *   b) **选入面真过滤**：`planApply` 给了 `selected` ⇒ 只落选中段，未选段具名
 *      `not-selected`（「没选」与「选了但落不下」必须可分）。
 *   c) **落笔真写 owner**：宿主 `loreImportApply` 把选中段拼成前情文本写进
 *      `PrequelSystem`（**不写事实账** —— 规则不冒充已发生），读本行真账核验，
 *      落盘回读；同源重复导入幂等；敏感段不落。
 *   d) **同名映射确认回填**：`loreImportConfirmMapping` 把 needs-confirm 的裁决接回，
 *      未确认的段进 `mappingNeedsConfirm`（不静默合并同名异人）。
 *
 * 【负控制一律真源码破坏】锚点恰中 1 次 → 在**破坏副本**上重跑**同款真判据** → 必须现形；
 *   并反向对照「原版同判据必须通过」。判据纯度（H5）单独一段。
 * 【当版锚点】本档自锚常量 BORN_V + vnum（锚必须住在当版档案里，供版本守卫 V4 计数）。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { breakOnce } from './_break_kit.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const require_ = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const ok = (m) => console.log('  ok ' + m);
const IDX = read('index.js');
const SA_OPS_SRC = read('engine-story-annual.js');
const LI_SRC = read('lore-import.js');
const SELF = read(path.join('tests', 'v3390_m4x1_lore_manual.test.mjs'));
const MB = require_(path.join(R, 'memory-books.js'));
const BORN_V = '3.339.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));

/** 与生产同形地在隔离 vm 里加载 IIFE 模块（window 即全局、module 缺席）。 */
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
const LI = loadIIFE(LI_SRC, 'LonShaLoreImport');

/* ── 宿主切片：取新面 + 依赖的取库口，其余用桩 ── */
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

function methodBody(src, header) {
    const at = src.indexOf(header);
    if (at < 0) return null;
    const open0 = src.indexOf('(', at);
    if (open0 < 0) return null;
    let pd = 0, close = -1;
    for (let i = open0; i < src.length; i++) {
        if (src[i] === '(') pd++;
        else if (src[i] === ')') { pd--; if (pd === 0) { close = i; break; } }
    }
    if (close < 0) return null;
    const open = src.indexOf('{', close);
    if (open < 0) return null;
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return end > 0 ? src.slice(at, end + 1) : null;
}
const LIB_FNS = [
    'function _loreImportLib() {',
    'function _moduleLib(getGlobal, fileName) {',
];
const HOST_METHODS = [
    '_loreImportOwners() {',
    '_loreImportLedgerState() {',
    'loreImportOverride(parsed, overrides, opts) {',
    'loreImportConfirmMapping(parsed, mapping, opts) {',
    'async loreImportApply(parsed, preview, opts = {}) {',
    'loreImportLedger() {',
];
const HOST_HEADS = LIB_FNS.concat(HOST_METHODS);
function engineFrom(src, saOpsSrc = SA_OPS_SRC) {
    const J = String.fromCharCode(10);
    const libs = LIB_FNS.map((h) => methodBody(src, h));
    const meths = HOST_METHODS.map((h) => {
        const fnName = h.replace(/^(async\s+)?/, '').split('(')[0];
        const m = saOpsSrc.match(new RegExp('(?:async\\s+)?function\\s+' + fnName + '\\s*\\(engine(?:,\\s*(.*?))?\\)\\s*\\{'));
        if (m) {
            return extractModuleMethod(saOpsSrc, m[0]);
        }
        return methodBody(src, h);
    });
    const missL = LIB_FNS.filter((h, i) => !libs[i]);
    const missM = HOST_METHODS.filter((h, i) => !meths[i]);
    if (missL.length || missM.length) throw new Error('切片缺失：取库口[' + missL.join('/') + '] 出口[' + missM.join('/') + ']');
    const code = libs.join(J) + J + 'return ({ ' + meths.join(',' + J) + ' });';
    const win = { LonShaLoreImport: LI };
    const eng = new Function('errLog', 'window', 'require', code)(() => {}, win, () => null);
    /* 桩：会话 / 代际 / 栅栏 / 落盘 / 真源派生 / 前情 owner。 */
    eng.getCurrentChatId = () => 'chat-1';
    eng._mutationEpoch = 0;
    eng._leaseValid = () => true;
    eng._leaseDrop = () => {};
    eng.prequel = new MB.PrequelSystem();
    eng._o6RealOwners = () => ({ owners: [], missing: [] });
    eng._o6ConfirmedFacts = () => null;
    eng._loreImportDeps = () => ({ KNOWN_ENTITIES: null, CONFIRMED_FACTS: null, SECRET_BODY_KEYS: null });
    eng.collectExport = () => ({ prequel: eng.prequel.export(), loreImportLedger: eng._loreImportLedger || null });
    let stored = null;
    eng.storage = {
        save: async (id, data) => { stored = JSON.parse(JSON.stringify(data)); return true; },
        load: async () => stored,
    };
    return eng;
}

/* ══════════════ A. 结构面 ══════════════ */
function judgeStruct(idxSrc) {
    const bad = [];
    for (const h of HOST_METHODS) {
        const n = idxSrc.split(h).length - 1;
        if (n !== 1) bad.push(h + ' 命中 ' + n + ' 次（应恰 1）');
    }
    for (const k of ['loreImportLedger:', '_loreImportLedger = data.loreImportLedger']) {
        if (idxSrc.indexOf(k) < 0) bad.push('持久化面缺 ' + k);
    }
    return bad;
}
function judgeKernel(li) {
    const bad = [];
    if (li.LI_VERSION !== 2) bad.push('LI_VERSION 应 2，实 ' + li.LI_VERSION);
    if (!li.MANUAL || li.MANUAL.ACCEPT !== 'accept' || li.MANUAL.OVERRIDE !== 'override' || li.MANUAL.SPLIT !== 'split') bad.push('MANUAL 三态不齐');
    for (const f of ['applyOverrides', 'reclassify', 'splitText']) if (typeof li[f] !== 'function') bad.push('缺内核面 ' + f);
    const d = li.describe({});
    if (!Array.isArray(d.manual) || d.manual.length !== 3) bad.push('describe 未露 manual 三态');
    if (d.manualDecisions !== 3) bad.push('describe manualDecisions 应 3');
    const sc = li.selfCheck({});
    if (sc.manualDistinct !== true) bad.push('selfCheck manualDistinct 未成立');
    return bad;
}
test('v3390 A1. **** 宿主新面各恰一处 + 持久化面在位', () => {
    assert.deepEqual(judgeStruct(IDX), [], judgeStruct(IDX).join('；'));
    ok('六面各恰 1 次 / 导出与还原面在位');
});
test('v3390 A2. **** 内核人工校订面：MANUAL 三态 + 三原语 + 自述/自证', () => {
    assert.deepEqual(judgeKernel(LI), [], judgeKernel(LI).join('；'));
    ok('LI_VERSION 2 / MANUAL 三态 / applyOverrides·reclassify·splitText / describe·selfCheck 露 manual 面');
});

/* ══════════════ B. 真跑（内核） ══════════════ */
const SRC_TEXT = '# 世界观规则' + String.fromCharCode(10) + '永久禁飞' +
    String.fromCharCode(10) + '# 前史' + String.fromCharCode(10) + '当年大战';
function parsedOf() { return LI.parseSource({ file: 'a.md', text: SRC_TEXT }, {}); }
function judgeOverride(li) {
    const bad = [];
    const p = li.parseSource({ file: 'a.md', text: SRC_TEXT }, {});
    const k1 = p.items[0].key;
    const r = li.applyOverrides(p, [{ key: k1, decision: 'override', cls: 'backstory-event' }], {});
    if (r.applied !== 1) bad.push('override 应 applied 1，实 ' + r.applied);
    const it = r.items.filter((x) => x.key === k1)[0];
    if (!it || it.cls !== 'backstory-event') bad.push('改类未生效');
    if (!it || it.clsRule !== 'setting-rule') bad.push('规则原判 clsRule 丢了（应仍是 setting-rule）');
    if (!it || it.manual !== true) bad.push('manual 标记未置');
    /* 非法类名拒收且具名。 */
    const bad1 = li.applyOverrides(p, [{ key: k1, decision: 'override', cls: 'not-a-class' }], {});
    if (bad1.rejected.length !== 1 || bad1.rejected[0].why !== 'bad-class') bad.push('非法类名未具名拒收');
    /* 缺切点拒收。 */
    const bad2 = li.applyOverrides(p, [{ key: k1, decision: 'split' }], {});
    if (bad2.rejected.length !== 1 || bad2.rejected[0].why !== 'split-point-absent') bad.push('缺切点未具名拒收');
    /* 拆分真出两条（#a/#b）。 */
    const sp = li.applyOverrides(p, [{ key: k1, decision: 'split', atText: '永久禁飞', clsA: 'setting-rule', clsB: 'backstory-event' }], {});
    const ka = sp.items.filter((x) => x.key === k1 + '#a')[0];
    const kb = sp.items.filter((x) => x.key === k1 + '#b')[0];
    if (!ka || !kb) bad.push('拆分未产出 #a/#b 两条');
    if (ka && ka.cls !== 'setting-rule') bad.push('拆分段 A 类错');
    if (kb && kb.cls !== 'backstory-event') bad.push('拆分段 B 类错');
    /* 未在 overrides 里的段保持规则判。 */
    const k2 = p.items[1].key;
    const keep = r.items.filter((x) => x.key === k2)[0];
    if (!keep || keep.manual !== false || keep.cls !== keep.clsRule) bad.push('未覆盖段未保持规则判');
    return bad;
}
test('v3390 B1. **** 人工改类：规则原判永不丢 / 非法类名与缺切点具名拒收 / 拆分出两条', () => {
    assert.deepEqual(judgeOverride(LI), [], judgeOverride(LI).join('；'));
    ok('clsRule 与 cls 分列 / bad-class / split-point-absent / #a·#b');
});
function judgeSelected(li) {
    const bad = [];
    const p = li.parseSource({ file: 'a.md', text: SRC_TEXT }, {});
    const pv = li.diffPreview(p, null, {});
    const keys = p.items.map((x) => x.key);
    const only = li.planApply(p, pv, { selected: [keys[0]] });
    if (!only.ok) bad.push('selected 计划应 ok');
    if (only.applied.length !== 1) bad.push('应只落 1 段，实 ' + only.applied.length);
    const skipped = only.skipped.filter((x) => x.why === 'not-selected');
    if (skipped.length !== keys.length - 1) bad.push('未选段未具名 not-selected');
    const all = li.planApply(p, pv, {});
    if (all.applied.length !== keys.length) bad.push('未给 selected 应全落');
    return bad;
}
test('v3390 B2. **** 选入面：给了 selected 只落选中段，未选段具名 not-selected', () => {
    assert.deepEqual(judgeSelected(LI), [], judgeSelected(LI).join('；'));
    ok('selected 过滤生效 / 未选段具名 / 未给则全落');
});

/* ══════════════ C. 真跑（宿主落笔） ══════════════ */
async function judgeApply(idxSrc, saOpsSrc = SA_OPS_SRC) {
    const bad = [];
    const eng = engineFrom(idxSrc, saOpsSrc);
    const p = parsedOf();
    const pv = LI.diffPreview(p, null, {});
    const keys = p.items.map((x) => x.key);
    const r = await eng.loreImportApply(p, pv, { selected: keys });
    if (!r || r.ok !== true) return ['落笔失败：' + ((r && r.reason) || 'null')];
    if (r.applied !== keys.length) bad.push('应落 ' + keys.length + ' 段，实 ' + r.applied);
    if (r.verified !== keys.length) bad.push('真账核验应 ' + keys.length + '，实 ' + r.verified);
    const body = eng.prequel.export().text;
    for (const it of p.items) if (body.indexOf(it.title) < 0) bad.push('前情文本缺段 ' + it.title);
    /* ★ 规则不冒充已发生：事实账**未被写**（本面无事实写面）。 */
    if (eng._factVersionState) bad.push('导入写进了事实账（规则冒充已发生）');
    /* 幂等：同源重复导入不重复落。 */
    const r2 = await eng.loreImportApply(p, pv, { selected: keys });
    if (!r2 || r2.duplicate !== true) bad.push('同源重复导入未报 duplicate');
    if (eng.prequel.export().text.length !== body.length) bad.push('重复导入改变了前情文本长度');
    /* 未选段不写。 */
    const eng2 = engineFrom(idxSrc);
    const r3 = await eng2.loreImportApply(p, pv, { selected: [keys[0]] });
    if (r3.applied !== 1) bad.push('选 1 段应落 1 段，实 ' + r3.applied);
    const b3 = eng2.prequel.export().text;
    if (b3.indexOf(p.items[1].title) >= 0) bad.push('未选段被写进了前情');
    /* 落盘回读。 */
    if (r.persisted !== true || r.readback !== true) bad.push('落盘回读未成立（persisted/readback）');
    /* 导入账可查。 */
    const lg = eng.loreImportLedger();
    if (lg.seen !== 1) bad.push('导入账 seen 应 1，实 ' + lg.seen);
    return bad;
}
test('v3390 C1. ***** 宿主落笔：选中段入前情 / 不写事实账 / 幂等 / 未选不写 / 落盘回读', async () => {
    const bad = await judgeApply(IDX);
    assert.deepEqual(bad, [], bad.join('；'));
    ok('前情含选中段 / 事实账零写 / duplicate / 未选不写 / persisted+readback');
});
test('v3390 C2. *** 敏感段不落：受限正文掩码不进前情', async () => {
    const eng = engineFrom(IDX);
    const p = LI.parseSource({ text: 'x' }, { secretBodyKeys: LI.SECRET_BODY_KEYS, carriers: [{ key: 'k', title: '秘密', secret: 'y' }] });
    const pv = LI.diffPreview(p, null, {});
    const r = await eng.loreImportApply(p, pv, { selected: p.items.map((x) => x.key) });
    const body = eng.prequel.export().text;
    assert.ok(body.indexOf(LI.SECRET_MASK) < 0, '掩码不得进前情');
    assert.ok(r.rejected.some((x) => x.why === 'sensitive-body'), '敏感段须具名 sensitive-body');
    ok('敏感段具名拒落，掩码不进前情');
});
function judgeMapping(idxSrc, saOpsSrc = SA_OPS_SRC) {
    const bad = [];
    const eng = engineFrom(idxSrc, saOpsSrc);
    const p = LI.parseSource({ file: 'a.md', text: '# 人物' + String.fromCharCode(10) + '甲与乙' }, {});
    const known = [{ name: '甲', owner: 'A' }, { name: '甲', owner: 'B' }];
    const r1 = eng.loreImportConfirmMapping(p, {}, { knownEntities: known });
    if (r1.mappingNeedsConfirm.length !== 1) bad.push('未确认的 needs-confirm 段应进 mappingNeedsConfirm');
    const r2 = eng.loreImportConfirmMapping(p, { [p.items[0].key]: 'A' }, { knownEntities: known });
    if (r2.resolved.length !== 1 || r2.resolved[0].owner !== 'A') bad.push('确认后未解析到 owner');
    if (r2.mappingNeedsConfirm.length !== 0) bad.push('确认后不应再进 mappingNeedsConfirm');
    return bad;
}
test('v3390 C3. *** 同名映射确认回填：未确认进 needsConfirm，确认后解析 owner', () => {
    assert.deepEqual(judgeMapping(IDX), [], judgeMapping(IDX).join('；'));
    ok('needs-confirm 裁决接回，不静默合并');
});

/* ══════════════ F. 真源码破坏负控制 ══════════════ */
const F1 = String.raw`if (it && body.indexOf(kOf(it.title)) >= 0) verified += 1;`;
const F2 = String.raw`if (selected && selected.indexOf(ek) < 0) { out.skipped.push({ key: ek, why: 'not-selected' }); continue; }`;
const F3 = String.raw`if (it.sensitive === true) { rejected.push({ key: a.key, why: 'sensitive-body' }); continue; }`;
const F4 = String.raw`clsRule: keyOf(it.cls), judgeWhy: keyOf(it.judgeWhy), manual: false,`;
test('v3390 F1. *** 破坏真账核验 ⇒ 落笔核验当场现形', async () => {
    const broken = breakOnce(SA_OPS_SRC, F1, String.raw`if (false) verified += 1;`, 'F1');
    assert.notEqual(broken, SA_OPS_SRC, '破坏必须真改源码');
    const bad = await judgeApply(IDX, broken);
    assert.notDeepEqual(bad, [], '真账核验被摘必须翻红');
    assert.deepEqual(await judgeApply(IDX), [], '原版上同判据必须真成立');
    ok('负控制成立：真账核验被摘 ⇒ verified 归零');
});
test('v3390 F2. *** 破坏选入过滤 ⇒ 未选段不写判据当场现形', () => {
    const broken = breakOnce(LI_SRC, F2, String.raw`if (false) { out.skipped.push({ key: ek, why: 'not-selected' }); continue; }`, 'F2');
    assert.notEqual(broken, LI_SRC, '破坏必须真改源码');
    assert.notDeepEqual(judgeSelected(loadIIFE(broken, 'LonShaLoreImport')), [], '选入过滤被摘必须翻红');
    assert.deepEqual(judgeSelected(LI), [], '原版上同判据必须真成立');
    ok('负控制成立：selected 过滤被摘 ⇒ 未选段照落');
});
test('v3390 F3. *** 破坏敏感段闸 ⇒ 掩码进前情判据当场现形', async () => {
    const broken = breakOnce(SA_OPS_SRC, F3, String.raw`if (false) { rejected.push({ key: a.key, why: 'sensitive-body' }); continue; }`, 'F3');
    assert.notEqual(broken, SA_OPS_SRC, '破坏必须真改源码');
    const eng = engineFrom(IDX, broken);
    const p = LI.parseSource({ text: 'x' }, { secretBodyKeys: LI.SECRET_BODY_KEYS, carriers: [{ key: 'k', title: '秘密', secret: 'y' }] });
    const pv = LI.diffPreview(p, null, {});
    const r = await eng.loreImportApply(p, pv, { selected: p.items.map((x) => x.key) });
    assert.ok(r.rejected.every((x) => x.why !== 'sensitive-body'), '敏感段闸被摘必须不再具名');
    assert.deepEqual(await judgeApply(IDX), [], '原版上同判据必须真成立');
    ok('负控制成立：敏感段闸被摘 ⇒ 掩码可进前情');
});
test('v3390 F4. *** 破坏规则原判留痕 ⇒ clsRule 丢失当场现形', () => {
    const broken = breakOnce(LI_SRC, F4, String.raw`clsRule: '', judgeWhy: keyOf(it.judgeWhy), manual: false,`, 'F4');
    assert.notEqual(broken, LI_SRC, '破坏必须真改源码');
    assert.notDeepEqual(judgeOverride(loadIIFE(broken, 'LonShaLoreImport')), [], '规则原判被抹必须翻红');
    assert.deepEqual(judgeOverride(LI), [], '原版上同判据必须真成立');
    ok('负控制成立：clsRule 被抹即红');
});

/* ══════════════ G. H5 判据纯度 + H1 当版锚 ══════════════ */
test('v3390 G1. *** H5 判据纯度：四个破坏锚点在本档各恰 1 次', () => {
    for (const [nm, a] of [['F1', F1], ['F2', F2], ['F3', F3], ['F4', F4]]) {
        const n = SELF.split(a).length - 1;
        assert.equal(n, 1, nm + ' 在本档出现 ' + n + ' 次（纯度要求恰 1 次）');
    }
    for (const [nm, a, src] of [['F1', F1, SA_OPS_SRC], ['F2', F2, LI_SRC], ['F3', F3, SA_OPS_SRC], ['F4', F4, LI_SRC]]) {
        assert.equal(src.split(a).length - 1, 1, nm + ' 在真源上须恰中 1 次');
    }
    ok('四锚点：本档各 1 次、真源各恰中 1 次');
});
test('v3390 H1. *** 自防护 + 当版锚点(供版本守卫 V4 计数)', () => {
    assert.ok(SELF.length > 8000, '本档自身不得被清空(实 ' + SELF.length + ' 字符)');
    assert.ok(SELF.includes('BORN_V'), '当版锚点必须显式留在本档里');
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(vnum(codeVer) >= vnum(BORN_V), '本套件只在 ' + BORN_V + ' 及以后成立；当前 ' + codeVer);
    ok('自防护 / 当版锚 v' + BORN_V);
});