/* ============================================================
 * tests/v3420_m4x3_canon_adoption.test.mjs — v3.342.0 · M4-X3
 * 正史选择真正进入下一卷（选择 → 落卷 → 重启 → 撤销 四步闭环）
 *
 * 【本档要证明的四件事（不是「函数返回了对象」）】
 *   a) **形状真接得上**：选择面只产「结局条文」，落卷 owner 只认「面归属形状」——
 *      两者之间修前**一处映射都没有**，于是下游逐条被判「目标侧缺面」⇒ 一条也接不上，
 *      而预览读数（ok / preview / packId）看着全绿。本档钉住映射后的条目**每条都带
 *      face / ownerKey / key 三格**，且缺格时三种缺因（no-face / no-owner / no-key）**分列**；
 *   b) **三态不同形**：ready（有得接）/ blocked（还没选尽，**不出包**）/ empty（选尽了但
 *      一条可接条目都没带）—— 把 empty 压进 blocked，用户会一直以为「还没选完」；
 *   c) **重复确认不重复接续**：幂等键 `adoptionId` 只由**选择本身**决定（同一份选择重算恒同 id、
 *      换卷必须换 id），且凭据随聊天落盘 ⇒ **重启后**「这次与上次是不是同一件事」仍判得出
 *      （修前凭据只活在内存里，重开即失忆 ⇒ 再点一次就再落一遍）；
 *   d) **撤销不删原分支或后来手工新增**：撤销保护面摊成四张具名表（可撤 / 别批 / 手工 / 后来新增），
 *      `deletesManual:false` 与 `branchWrites:0` 写成**读数**而不是注释承诺。
 *
 * 【负控制一律真源码破坏】锚点恰中 1 次 → 在**破坏副本**上重跑**同款真判据** → 必须现形；
 *   并反向对照「原版同判据必须通过」。判据纯度（H5）与工具两向自证（H6）单独一段。
 * 【当版锚点】本档自锚常量 BORN_V + vnum（锚住在当版档案里，供版本守卫 V4 计数）。
 * 【诚实边界（本档不判的三条）】
 *   1 真实 SillyTavern 宿主的 UI 点击流与真实模型问答**未跑**：本档的「重启」用**重建宿主实例
 *     + 从持久载荷还原凭据**取证 —— 它验的是「凭据活得过分界」，不是「应用真的重启过」；
 *   2 「用户后来手工新增的事实」用**器官账本形状的桩**取证：验的是撤销保护面的**分类判据**，
 *     不是真实 Edit 面板的手工录入路径（那属 UI 面，另有套件）；
 *   3 落卷文本的**文学质量**不判（那是人的事）：本档只判「形状对得上 + 读数如实 + 幂等成立」。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as KIT from './_break_kit.mjs';
const NL = String.fromCharCode(10);
const BSL = String.fromCharCode(92);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const IDX = read('index.js');
const ORG = read('memory-organs.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const BC_SRC = read('branch-canon.js');
const SELF = read(path.join('tests', 'v3420_m4x3_canon_adoption.test.mjs'));
const BORN_V = '3.342.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));
/** 在隔离 vm 里加载 IIFE 模块（与生产同形：window 即全局，module 缺席）。 */
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
const BC = loadIIFE(BC_SRC, 'LonShaBranchCanon');
const ORG_API = loadIIFE(ORG, 'LonShaMemoryOrgans');
const VCLib = loadIIFE(read('volume-continuation.js'), 'LonShaVolumeContinuation');
const BSLib = loadIIFE(read('branch-semantics.js'), 'LonShaBranchSemantics');
const TARGET = { modules: { unfinished: true }, entries: [] };
/* ══════════════ 负控制锚点（在判据层只声明一次 —— H5 判据纯度） ══════════════ */
const ANCHORS = Object.freeze({
    /* 内核·上游面归属：摘掉 ⇒ 条文「没有面」，映射全部缺格（实测红：一条也接不上）。 */
    kUpstreamFace: String.raw`face: keyOf(c.face),`,
    /* 内核·空输入不出包：置假 ⇒ blocked 也出包（拿半份选择去接续）。 */
    kNotReady: String.raw`if (verdict !== ADOPT.READY) {`,
    /* 内核·幂等键：把**卷指纹那一段**置成常量 ⇒ 换卷不换 id。
     *   ★ 破坏必须让模块**仍可加载**：截断整条表达式会得到语法错，那样任何判据都会红，
     *     负控制测的就成了「模块加载失败」而不是「幂等键失效」（本刀踩过这个坑）。 */
    kAdoptId: String.raw`'v1|' + volumeId + '|' + (o.allowReplace === true ? 'R' : 'r') + '|' + (o.allowNameLink === true ? 'N' : 'n')`,
    /* 内核·无键条目不得进包：摘掉 ⇒ 无键条目混进可接集、撤销时无从定位。 */
    kNoKey: String.raw`if (!key) return { ok: false, why: UNMAPPED.NO_KEY };`,
    /* 内核·无来源范围一律不碰：置假 ⇒ 手工条目被算进可撤集（撤销会删用户的东西）。 */
    kManualKeep: String.raw`if (!pid) {`,
    /* 宿主·凭据持久化判幂等：只认内存 seen ⇒ 重启后再点一次会再落一遍。 */
    hPersistIdem: String.raw`const persistedId = (this._canonAdoption && this._canonAdoption.adoptionId) || '';`,
    /* 宿主·存档契约面：换成常量 ⇒ 凭据不再随聊天持久化（重启即失忆）。 */
    hContract: String.raw`canonAdoption: this._canonAdoption || null,`,
    /* 宿主·凭据只在确认后落：抹掉闸门 ⇒ 预览期就写凭据，重复确认判据失去依据。 */
    hCommit: String.raw`if (o.commit === true) {`,
});
/* ══════════════ A. 结构面 ══════════════ */
const HOST_HEADS = [
    'function _moduleLib(getGlobal, fileName) {',
    'function _branchCanonLib() {',
    'branchCanonDescribe() {',
    'storyCanonAdoptPlan(opts) {',
    'storyCanonAdoption(opts) {',
    'storyCanonRevokeGuard(entries, opts) {',
    '_volumeContinuationEntriesForGuard() {',
    'async storyCanonAdoptConfirm(opts = {}) {',
    'storyCanonAdoptLine() {',
];
const HOST_METHODS = HOST_HEADS.slice(2);
const CONTRACT_KEYS = ["'canonAdoption',", "_imp('canonAdoption'", "A('direct', 'canonAdoption'"];
function judgeStruct(idx, org, mf) {
    const bad = [];
    for (const h of HOST_METHODS) {
        const n = idx.split(h).length - 1;
        if (n !== 1) bad.push(h + ' 命中 ' + n + ' 次（应恰 1）');
    }
    for (const k of CONTRACT_KEYS) if (idx.split(k).length - 1 < 1) bad.push('持久化 / 契约面缺 ' + k);
    if (idx.split(ANCHORS.hContract).length - 1 !== 1) bad.push('collectExport 的 canonAdoption 面应恰 1 处');
    if (idx.split('落卷凭据', ).length - 1 < 2) bad.push('清空面缺「落卷凭据」登记');
    /* 逐字副本：存档键白名单在 organs 侧有一份，两边不同步 = 凭据跨对话被带成「重复确认」。 */
    if (org.split(CONTRACT_KEYS[0]).length - 1 !== 1) bad.push('memory-organs 的存档键副本未同源');
    /* 落卷读数并入**既有**「支线正史」行（不新增行：新行会让既有判据读不到）。 */
    if (idx.split("rows.push(['支线正史', this.storyCanonAdoptLine()])").length - 1 !== 1) bad.push('自检面缺落卷读数行');
    if (!Array.isArray(mf.extra_js) || mf.extra_js.indexOf('branch-canon.js') < 0) bad.push('manifest.extra_js 缺 branch-canon.js');
    return bad;
}
function judgeHostContract(src) {
    const bad = judgeStruct(src, ORG, MF);
    if (bad.length) throw new Error('宿主契约面不符：' + bad.join('；'));
    /* [v3.343.0 交棒] `!== 107` 是本档出生那一版的一次性事实,不是永久不变量;
     *   抬版即红而红的信息量只剩「数字不对」。改按下界口径(与 v3400 / v3264 / v3266 / v3296 / v3298 同族交棒);
     *   「当版总项数恰一处」由当版 frontier 套件把守(v3209 数量锁)。 */
    if (MF.extra_js.length < 107) throw new Error('extra_js 不得低于本档出生值 107,实 ' + MF.extra_js.length);
}
test('v3420 A1. **** 宿主五新出口各恰一处 + 四处契约面 + organs 逐字副本 + 自检行并入 + extra_js 107', () => {
    judgeHostContract(IDX);
    assert.deepEqual(judgeStruct(IDX, ORG, MF), [], judgeStruct(IDX, ORG, MF).join('；'));
    console.log('  ok 五出口各恰 1 次 / 四处契约面 / organs 副本同源 / 落卷读数并入既有一行 / extra_js ≥ 107');
});
/* ══════════════ B. 内核面（真映射 / 三态 / 幂等 / 撤销保护） ══════════════ */
const ADOPT_CONST = ['ADOPT', 'ADOPT_LABEL', 'ADOPT_SOURCES', 'ADOPT_KIND', 'ADOPT_ITEM_FIELDS', 'UNMAPPED'];
const ADOPT_FNS = ['adoptItemOf', 'adoptableItems', 'buildContinuePack', 'adoptionBrief', 'revokeGuard', 'adoptionLine', 'adoptProbeDeps', 'adoptProbePlan'];
const KEEP_BC = ['BC_KIND', 'DECISION', 'DECISION_LABEL', 'CLASH', 'PREVIEW', 'PROVENANCE', 'SECRET_BODY_KEYS', 'SECRET_MASK', 'REQUIRED_DEPS', 'MAX_OUTCOMES', 'conflicts', 'setDecision', 'planCanon', 'previewHandoff', 'revokeScopeOf', 'describe', 'describePlan', 'selfCheck', 'line', 'listOutcomes', 'outcomeOf', 'filterByKeeper', 'entryKeyOf', 'collisionKeyOf', 'maskSecretBody', 'keyOf', 'strOf', 'arrOf', 'numOr', 'clip', 'hash32'];
function judgeKernelFace(bc) {
    const bad = [];
    if (bc.BC_VERSION !== 2) bad.push('BC_VERSION 应为 2，实 ' + bc.BC_VERSION);
    for (const k of ADOPT_CONST) if (!bc[k]) bad.push('缺常量面 ' + k);
    for (const k of ADOPT_FNS) if (typeof bc[k] !== 'function') bad.push('缺原语 ' + k);
    for (const k of KEEP_BC) if (bc[k] === undefined) bad.push('既有面被拆丢 ' + k);
    if (bc.ADOPT_SOURCES.length !== 2) bad.push('来源两态必须恰好两条');
    if (bc.ADOPT_ITEM_FIELDS.length !== 8) bad.push('条目形状应为八格，实 ' + bc.ADOPT_ITEM_FIELDS.length);
    if (new Set(Object.keys(bc.UNMAPPED).map((k) => bc.UNMAPPED[k])).size !== 3) bad.push('缺格三因不得同形');
    if (Object.isFrozen(bc) !== true) bad.push('导出面未冻结');
    return bad;
}
test('v3420 A2. **** 内核面：BC_VERSION 2 + 六张新常量面 + 八个新原语 + 既有面一字未拆 + 冻结', () => {
    const bad = judgeKernelFace(BC);
    assert.deepEqual(bad, [], bad.join('；'));
    console.log('  ok BC_VERSION 2 / 46 导出 / 八格形状 / 三因不同形 / 冻结');
});
test('v3420 A3. *** 内核纯度：实现体不读宿主 this；零 require / fetch / 落盘；judge 面不拿宿主字串当判据', () => {
    const bad = [];
    if (/\bthis\./.test(BC_SRC)) bad.push('内核不得读宿主 this');
    if (/\brequire\s*\(/.test(BC_SRC)) bad.push('内核不得 require');
    if (/\b(fetch|localStorage|IndexedDB)\b/.test(BC_SRC)) bad.push('内核不得触网络 / 落盘');
    for (const id of ['storyCanonAdoptPlan', 'storyCanonAdoptConfirm', '_canonAdoption']) {
        if (BC_SRC.indexOf(id) >= 0) bad.push('宿主标识混进内核：' + id);
    }
    assert.deepEqual(bad, [], bad.join('；'));
    console.log('  ok 纯函数 / 零依赖 / 宿主标识零复制');
});
const deps = () => BC.adoptProbeDeps();
const plan = () => BC.adoptProbePlan();
/** 真映射：每一条进包的条目都带 shape 三格，且过得了下游 owner 的逐条比对。 */
function judgeShape(bc, vc) {
    const cp = bc.buildContinuePack(deps(), plan(), { volumeId: 'v1' });
    if (cp.verdict !== 'ready' || cp.ok !== true || !cp.pack) throw new Error('ready 态未出包：' + cp.verdict);
    const es = cp.pack.entries;
    if (!es.length) throw new Error('包内零条目');
    for (const e of es) {
        for (const k of ['face', 'ownerKey', 'key']) {
            if (!e[k]) throw new Error('条目缺 shape 格 ' + k + '：' + JSON.stringify(e));
        }
        if (e.link !== 'by-id' && e.link !== 'by-name') throw new Error('link 形态不符：' + e.link);
    }
    /* ★ 交到下游 owner：逐条不得进「目标侧缺面」，且真出得成提案（修前此处全缺面）。 */
    const pv = vc.previewContinuation(cp.pack, TARGET, {});
    if (pv.missingFaces.length) throw new Error('下游读成目标侧缺面：' + JSON.stringify(pv.missingFaces));
    if (pv.willAdd !== es.length) throw new Error('下游可接条数不符：willAdd ' + pv.willAdd + ' vs ' + es.length);
    const pr = vc.proposeHandoff(cp.pack, TARGET, {});
    if (pr.proposals.length !== es.length) throw new Error('下游提案条数不符：' + pr.proposals.length);
}
test('v3420 B1. **** 形状真接得上：条目每条带 shape 三格 + 下游逐条不再读成缺面 + 真出得成提案', () => {
    judgeShape(BC, VCLib);
    console.log('  ok 1 条可接 / 下游 missingFaces 0 / willAdd 1 / 提案 1');
});
/** 三态不同形：ready / blocked / empty 各真现场，且 blocked 与 empty 均不出包。 */
function judgeThreeStates(bc) {
    const cp = bc.buildContinuePack(deps(), plan(), { volumeId: 'v1' });
    const half = bc.setDecision(null, { key: 'k1', decision: 'canon', branch: 'b1' }).plan;
    const blocked = bc.buildContinuePack(deps(), half, { volumeId: 'v1' });
    const bareDeps = { BRANCH_OUTCOMES: [{ branch: 'b1', collision: 'k9', terminal: true, value: 'X' }], CONFIRMED_FACTS: {}, SECRET_BODY_KEYS: ['secret'] };
    const p9 = bc.setDecision(null, { key: 'k9', decision: 'canon', branch: 'b1' }).plan;
    const empty = bc.buildContinuePack(bareDeps, p9, { volumeId: 'v1' });
    const vs = [cp.verdict, blocked.verdict, empty.verdict];
    if (new Set(vs).size !== 3) throw new Error('三态同形：' + vs.join('/'));
    if (blocked.pack !== null || blocked.pendingCount <= 0) throw new Error('未选尽却出包 / 未报待选数');
    if (empty.pack !== null || empty.pendingCount !== 0) throw new Error('空条态与未选尽态同形');
    /* 结局在位但一条条文都没带 ⇒ bareOutcomes **具名**（空条 ≠ 映射失败，两者不同形）。 */
    if (empty.bareCount !== 1 || empty.unmappedCount !== 0 || empty.itemCount !== 0) throw new Error('空条态未具名：bare ' + empty.bareCount);
    const bare2 = { BRANCH_OUTCOMES: [{ branch: 'b1', collision: 'k9', terminal: true, value: 'X', items: [{ key: 'q', face: 'unfinished', entityId: 'c' }] }], CONFIRMED_FACTS: {}, SECRET_BODY_KEYS: ['secret'] };
    const some = bc.buildContinuePack(bare2, bc.setDecision(null, { key: 'k9', decision: 'canon', branch: 'b1' }).plan, { volumeId: 'v1' });
    if (some.verdict !== 'ready') throw new Error('带条文的结局应可接，实 ' + some.verdict);
}
test('v3420 B2. **** 三态不同形：ready / blocked（不出包且报待选）/ empty（选尽了却无条可接）', () => {
    judgeThreeStates(BC);
    console.log('  ok 三态互不相等 / blocked 与 empty 均 pack null / 空条与缺格分列');
});
/* ── 缺格具名：三种缺因各出现且分列（不许压成一条「映射失败」）。 */
function judgeUnmapped(bc) {
    const d = { BRANCH_OUTCOMES: [
        { branch: 'b1', collision: 'kA', terminal: true, value: 'A', items: [{ key: 'x1', entityId: 'c1', value: '1' }] },
        { branch: 'b2', collision: 'kB', terminal: true, value: 'B', items: [{ key: 'x2', face: 'unfinished', value: '2' }] },
        { branch: 'b3', collision: 'kC', terminal: true, value: 'C', items: [{ face: 'unfinished', entityId: 'c3', value: '3' }] },
    ], CONFIRMED_FACTS: {}, SECRET_BODY_KEYS: ['secret'] };
    let p = bc.setDecision(null, { key: 'kA', decision: 'canon', branch: 'b1' }).plan;
    p = bc.setDecision(p, { key: 'kB', decision: 'coexist', branch: '' }).plan;
    p = bc.setDecision(p, { key: 'kC', decision: 'coexist', branch: '' }).plan;
    const ad = bc.adoptableItems(d, p, {});
    const whys = ad.unmapped.map((u) => u.why);
    if (new Set(whys).size !== 3) throw new Error('缺格三因未分列：' + JSON.stringify(whys));
    for (const w of ['no-face', 'no-owner', 'no-key']) if (whys.indexOf(w) < 0) throw new Error('缺因缺失：' + w);
    if (ad.items.length !== 0) throw new Error('缺格条文不得混进可接集');
}
test('v3420 B3. *** 缺格具名：no-face / no-owner / no-key 三因各出现且分列，缺格条文不进可接集', () => {
    judgeUnmapped(BC);
    console.log('  ok 三因各现 / 可接集 0 条（修前无键条目被兑底成 entry 混进去）');
});
/** 幂等地基：同一份选择恒同 adoptionId，换卷 / 换选择必不同。 */
function judgeIdStable(bc) {
    const a = bc.buildContinuePack(deps(), plan(), { volumeId: 'v1' }).adoptionId;
    const b = bc.buildContinuePack(deps(), plan(), { volumeId: 'v1' }).adoptionId;
    const c = bc.buildContinuePack(deps(), plan(), { volumeId: 'v2' }).adoptionId;
    const p2 = bc.setDecision(null, { key: 'k1', decision: 'canon', branch: 'b2' }).plan;
    const p3 = bc.setDecision(p2, { key: 'k2', decision: 'exclude', branch: '' }).plan;
    const p4 = bc.setDecision(p3, { key: 'k3', decision: 'coexist', branch: '' }).plan;
    const d = bc.buildContinuePack(deps(), p4, { volumeId: 'v1' }).adoptionId;
    if (a === '' || a !== b) throw new Error('同一份选择未恒同 id');
    if (a === c) throw new Error('换卷未换 id');
    if (a === d) throw new Error('换选择未换 id');
    const br = bc.adoptionBrief(deps(), plan(), { volumeId: 'v1' });
    if (br.adoptionId !== a || !br.revokeScope || br.revokeScope.adoptionId !== a) throw new Error('凭据未带幂等键与撤销范围');
}
test('v3420 B4. **** 幂等地基：同一份选择恒同 adoptionId / 换卷与换选择必不同 / 凭据自带撤销范围', () => {
    judgeIdStable(BC);
    console.log('  ok 同选择同 id / 换卷换选择各自不同 / revokeScope 随凭据定下');
});
/** 撤销保护面：四张具名表 + 两条口径写成读数。 */
function judgeRevoke(bc) {
    const g = bc.revokeGuard([
        { key: 'q1', face: 'unfinished', ownerKey: 'id:c1', packId: 'cp_1' },
        { key: 'q2', face: 'unfinished', ownerKey: 'id:c2', packId: 'cp_9' },
        { key: 'm1', face: 'unfinished', ownerKey: 'id:c3' },
        { key: 'm2', face: 'unfinished', ownerKey: 'id:c4' },
        { key: 'q9', face: 'unfinished', ownerKey: 'id:c5', packId: 'cp_1', revoked: true },
    ], { revokeScope: { adoptionId: 'ca_1', packId: 'cp_1', volumeId: 'v1' } }, {});
    if (g.revocableCount !== 1) throw new Error('可撤集不符：' + g.revocableCount);
    if (g.foreignCount !== 1) throw new Error('别批条目必须一条不进可撤集：' + g.foreignCount);
    if (g.manualCount !== 2) throw new Error('手工条目必须一条不进可撤集：' + g.manualCount);
    if (g.deletesManual !== false) throw new Error('deletesManual 必须如实报 false');
    if (g.branchWrites !== 0) throw new Error('branchWrites 必须恒 0');
    /* 后来新增：无来源范围且晚于本次凭据 ⇒ 单独一张表（与手工条目不同形）。 */
    const g2 = bc.revokeGuard([{ key: 'n1', face: 'unfinished', ownerKey: 'id:c9', importedAt: 2000 }],
        { revokeScope: { adoptionId: 'ca_1', packId: 'cp_1' } }, { at: 1000 });
    if (g2.laterCount !== 1 || g2.manualCount !== 0) throw new Error('后来新增未单列：' + JSON.stringify([g2.laterCount, g2.manualCount]));
    /* 没凭据 ⇒ 范围未定（不许「全删」兑底）。 */
    const g3 = bc.revokeGuard([{ key: 'q1', packId: 'cp_1' }], {}, {});
    if (g3.judged !== false || g3.revocableCount !== 0) throw new Error('无凭据却出可撤集');
}
test('v3420 B5. **** 撤销保护面：四张具名表 + 手工 / 别批 / 已撤一条不进可撤集 + 两条口径写成读数', () => {
    judgeRevoke(BC);
    console.log('  ok 可撤 1 / 别批 1 / 手工 2 / 后来新增单列 / 无凭据报未判');
});
/* ══════════════ C. 宿主出口（真方法体 + 真内核 + 真下游 owner） ══════════════ */
function sliceMember(src, header) {
    const at = src.indexOf(header);
    if (at < 0) return null;
    const open = src.indexOf('{', at + header.length - 1);
    if (open < 0) return null;
    let d = 0;
    for (let i = open; i < src.length; i++) {
        const c = src[i];
        if (c === '"' || c === "'" || c === '`') {
            let k = i + 1;
            while (k < src.length) {
                if (src[k] === BSL) { k += 2; continue; }
                if (src[k] === c) { k++; break; }
                if (src[k] === NL && c !== '`') break;
                k++;
            }
            i = k - 1;
            continue;
        }
        if (c === '{') d++;
        else if (c === '}') { d--; if (d === 0) return src.slice(at, i + 1); }
    }
    return null;
}
const LIB_HEADS = ['function _moduleLib(getGlobal, fileName) {', 'function _branchCanonLib() {'];
/* ★ 切片要含**置选择**那个既有出口：`seedPlan()` 先置三档选择，落卷出口才吃得到计划。
 *   缺它 ⇒ 真宿主实例上没这个方法，六条 C/D 判据全报「不是函数」（夹具缺件造成的假红）。 */
const METH_HEADS = HOST_METHODS.concat(['branchCanonDecide(input) {', 'branchCanonDescribe() {']);
const METH_DECIDE = 'branchCanonDecide(input) {';
/** 真宿主实例：真方法体切片 + 真内核 + 真下游 owner（器官用真类，不造第二套账本）。 */
function mkHost(src, over) {
    const idx = src || IDX;
    const libs = LIB_HEADS.map((h) => sliceMember(idx, h));
    const meths = METH_HEADS.map((h) => sliceMember(idx, h));
    const miss = LIB_HEADS.filter((h, i) => !libs[i]).concat(METH_HEADS.filter((h, i) => !meths[i]));
    if (miss.length) throw new Error('切片缺失：' + miss.join(' / '));
    const code = libs.join(NL) + NL + 'return ({ ' + meths.join(',' + NL) + ' });';
    const win = { LonShaBranchCanon: BC, LonShaVolumeContinuation: VCLib, LonShaBranchSemantics: BSLib };
    const eng = new Function('errLog', 'window', code)(() => {}, win);
    const wp = new ORG_API.WorldProgress();
    let saved = null;
    const st = (over && over.storage) || {
        save: async (id, payload) => { saved = payload; return true; },
    };
    return Object.assign(eng, {
        worldProg: wp,
        storage: st,
        getCurrentChatId: () => 'chat1',
        _mutationEpoch: 1,
        _leaseValid: () => true,
        _leaseDrop: () => {},
        _canonAdoption: null,
        _canonAdoptSeen: null,
        _lastCanonAdopt: null,
        _lastCanonAdoptConfirm: null,
        _lastCanonRevokeGuard: null,
        collectExport: () => ({ canonAdoption: eng._canonAdoption || null }),
        _saved: () => saved,
    }, (over && over.mut) || {});
}
/** 把选择面真跑一遍（落卷出口吃的是宿主持有的计划容器）。 */
function seedPlan(h) {
    for (const [k, d, b] of [['k1', 'canon', 'b1'], ['k2', 'exclude', ''], ['k3', 'coexist', '']]) {
        h.branchCanonDecide({ key: k, decision: d, branch: b });
    }
    return h;
}
/** 落卷计划出口：真内核 + 真宿主，且写明**零写**（一个分支写指令都没出）。 */
function judgeHostPlan(src) {
    const h = seedPlan(mkHost(src));
    h._branchCanonDeps = () => BC.adoptProbeDeps();
    const p = h.storyCanonAdoptPlan({ volumeId: 'v1' });
    if (p.ok !== true || p.verdict !== 'ready' || !p.pack) throw new Error('落卷计划未就绪：' + p.verdict);
    if (p.writeNothing !== true) throw new Error('落卷计划必须零写');
    if (p.itemCount < 1) throw new Error('落卷计划未报可接条数');
    if (h.storyCanonAdoptLine().indexOf('可接续') < 0) throw new Error('诊断行未反映落卷读数：' + h.storyCanonAdoptLine());
    /* 未选尽 ⇒ 报未选尽（不出包）。 */
    const h2 = mkHost(src); h2._branchCanonDeps = () => BC.adoptProbeDeps();
    h2.branchCanonDecide({ key: 'k1', decision: 'canon', branch: 'b1' });
    const p2 = h2.storyCanonAdoptPlan({ volumeId: 'v1' });
    if (p2.verdict !== 'blocked' || p2.pack !== null) throw new Error('未选尽却出包');
}
test('v3420 C1. *** 宿主落卷计划出口：真内核 + 零写读数 + 诊断行同源 + 未选尽不出包', () => {
    judgeHostPlan(IDX);
    console.log('  ok ready 出包 / writeNothing true / 未选尽 blocked 且 pack null');
});
/** 确认落笔：四环都在（落笔 / 栅栏 / 落盘 / 回读），且幂等键与凭据双保险。 */
async function judgeHostConfirm(src) {
    const h = seedPlan(mkHost(src));
    h._branchCanonDeps = () => BC.adoptProbeDeps();
    const r = await h.storyCanonAdoptConfirm({ volumeId: 'v1', target: TARGET });
    if (!r || r.ok !== true || r.applied !== 1) throw new Error('落笔未成：' + JSON.stringify(r && { ok: r.ok, applied: r.applied, reason: r.reason }));
    if (r.persisted !== true) throw new Error('未真落盘（persisted 应 true，实 ' + r.persisted + '）');
    if (r.readback !== 'ok') throw new Error('保存后回读不一致：' + r.readback);
    if (h.worldProg.volumeContinuationCount() !== 1) throw new Error('器官账本未落：' + h.worldProg.volumeContinuationCount());
    if (h.storyCanonAdoptLine().indexOf('已落 1 条') < 0) throw new Error('诊断行未报已落条数：' + h.storyCanonAdoptLine());
    const id = r.adoptionId;
    /* 同会话重复确认：不得再落一遍。 */
    const again = await h.storyCanonAdoptConfirm({ volumeId: 'v1', target: TARGET });
    if (again.duplicate !== true || h.worldProg.volumeContinuationCount() !== 1) throw new Error('同会话重复确认又落了一遍');
    /* ★ 重启：新实例 + 从持久载荷还原凭据（这是「重启后仍判同一件事」的真形态）。 */
    const savedPayload = h.storage && h.collectExport();
    if (!savedPayload || !savedPayload.canonAdoption || savedPayload.canonAdoption.adoptionId !== id) throw new Error('凭据未随存档导出：' + JSON.stringify(savedPayload && savedPayload.canonAdoption));
    const h2 = seedPlan(mkHost(src));
    h2._branchCanonDeps = () => BC.adoptProbeDeps();
    h2._canonAdoption = savedPayload.canonAdoption;
    const after = await h2.storyCanonAdoptConfirm({ volumeId: 'v1', target: TARGET });
    if (after.duplicate !== true) throw new Error('重启后重复确认未被认出（会再落一遍）');
    if (after.applied !== 1 || after.reason !== 'duplicate') throw new Error('重启后回执不是 duplicate 且带原 applied：' + JSON.stringify({ applied: after.applied, reason: after.reason }));
    /* 换一卷 ⇒ 不是同一件事（必须真落笔）。 */
    const h3 = seedPlan(mkHost(src));
    h3._branchCanonDeps = () => BC.adoptProbeDeps();
    h3._canonAdoption = savedPayload.canonAdoption;
    const other = await h3.storyCanonAdoptConfirm({ volumeId: 'v2', target: TARGET });
    if (other.duplicate === true) throw new Error('换卷被误判成重复确认');
}
test('v3420 C2. **** 确认落笔：落笔 / 落盘 / 回读三环 + 同会话与重启后重复确认均不再落笔 + 换卷不算重复', async () => {
    await judgeHostConfirm(IDX);
    console.log('  ok applied 1 / persisted true / readback ok / 重复确认 duplicate / 重启后仍判得出 / 换卷不误判');
});
/** 凭据只在确认后落（预览期不得写凭据，否则重复确认判据失去依据）。 */
async function judgeCommitGate(src) {
    const h = seedPlan(mkHost(src));
    h._branchCanonDeps = () => BC.adoptProbeDeps();
    const b = h.storyCanonAdoption({ volumeId: 'v1' });
    if (b.adoptionId === '') throw new Error('凭据未给幂等键');
    if (b.persisted !== false || h._canonAdoption !== null) throw new Error('预览期就写了凭据');
    const b2 = h.storyCanonAdoption({ volumeId: 'v1', commit: true });
    if (b2.persisted !== true || !h._canonAdoption || h._canonAdoption.adoptionId !== b.adoptionId) throw new Error('commit 未落凭据');
}
test('v3420 C3. *** 凭据落盘闸门：预览期只出键不落盘，commit 后才落（重复确认判据才有依据）', async () => {
    await judgeCommitGate(IDX);
    console.log('  ok 预览期 persisted false / commit 后 persisted true 且键与预览一致');
});
/** 撤销保护面出口：真器官账本形状（别批 / 手工 / 已撤各一格），一条不进可撤集。 */
function judgeHostRevokeGuard(src) {
    const h = mkHost(src);
    const g = h.storyCanonRevokeGuard([
        { key: 'q1', face: 'unfinished', ownerKey: 'id:c1', packId: 'cp_1' },
        { key: 'q2', face: 'unfinished', ownerKey: 'id:c2', packId: 'cp_9' },
        { key: 'm1', face: 'unfinished', ownerKey: 'id:c3' },
    ], { brief: { revokeScope: { adoptionId: 'ca_1', packId: 'cp_1', volumeId: 'v1' } } });
    if (g.judged !== true || g.revocableCount !== 1 || g.foreignCount !== 1 || g.manualCount !== 1) {
        throw new Error('撤销保护面分类不符：' + JSON.stringify([g.judged, g.revocableCount, g.foreignCount, g.manualCount]));
    }
    if (g.deletesManual !== false || g.branchWrites !== 0) throw new Error('两条口径未写成读数');
    if (h.storyCanonAdoptLine().indexOf('撤销面') < 0) throw new Error('诊断行未反映撤销面读数：' + h.storyCanonAdoptLine());
    /* 默认取数口：器官在 ⇒ 真读；器官缺席 ⇒ 空表（不造条目、不抛）。 */
    const h2 = mkHost(src);
    h2.worldProg = null;
    const g2 = h2.storyCanonRevokeGuard(null, { brief: { revokeScope: { adoptionId: 'ca_1', packId: 'cp_1' } } });
    if (g2.revocableCount !== 0 || g2.manualCount !== 0) throw new Error('器官缺席却编出条目');
    /* 器官账本**空**（读了、确实没有）：四张表全 0，且不得编造条目。 */
    const h3 = mkHost(src);
    const g3 = h3.storyCanonRevokeGuard(null, { brief: { revokeScope: { adoptionId: 'ca_1', packId: 'cp_1' } } });
    if (g3.revocableCount !== 0 || g3.foreignCount !== 0 || g3.manualCount !== 0 || g3.laterCount !== 0) {
        throw new Error('器官账本空却编出条目：' + JSON.stringify([g3.revocableCount, g3.foreignCount, g3.manualCount, g3.laterCount]));
    }
}
test('v3420 C4. *** 撤销保护面出口：四张表分类对 + 两条口径进读数 + 器官缺席不编条目不抛', () => {
    judgeHostRevokeGuard(IDX);
    console.log('  ok 可撤 1 / 别批 1 / 手工 1 / deletesManual false / 器官缺席如实');
});
/* ══════════════ C5. 内核缺席 ⇒ 同键降级 ══════════════ */
function judgeAbsentDegrade(src) {
    const idx = src || IDX;
    const libs = LIB_HEADS.map((h) => sliceMember(idx, h));
    const meths = METH_HEADS.map((h) => sliceMember(idx, h));
    const abs = new Function('errLog', 'window', libs.join(NL) + NL + 'return ({ ' + meths.join(',' + NL) + ' });')(() => {}, {});
    Object.assign(abs, { _canonAdoption: null, worldProg: null, collectExport: () => ({}), _leaseValid: () => true, _leaseDrop: () => {} });
    const p = abs.storyCanonAdoptPlan({});
    if (p.ok !== false || p.verdict !== 'blocked' || p.pack !== null) throw new Error('落卷计划缺席未同键降级');
    if (String(p.note || '').indexOf('不报「没有可接条目」') < 0) throw new Error('缺席态归因未写明「不报无」');
    const b = abs.storyCanonAdoption({});
    if (b.adoptionId !== '' || b.persisted !== false) throw new Error('凭据缺席未同键降级');
    const g = abs.storyCanonRevokeGuard([], {});
    if (g.judged !== false || g.revocableCount !== 0) throw new Error('撤销保护面缺席未同键降级');
    if (abs.storyCanonAdoptLine().indexOf('落卷面模块未加载') < 0) throw new Error('诊断行缺席态未具名：' + abs.storyCanonAdoptLine());
}
test('v3420 C5. ** 内核缺席 ⇒ 三出口同键降级（不抛 / 不 undefined）+ 诊断行具名 + 不报「没有可接条目」', () => {
    judgeAbsentDegrade(IDX);
    console.log('  ok blocked/null / 凭据空 / 撤销未判 / 诊断行具名');
});
/* ══════════════ D. 负控制（真源码破坏 → 副本重跑同款判据 → 必须现形） ══════════════ */
function expectRed(fn, label) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    if (!threw) throw new Error(label + '：破坏后判据未转红（负控制空转）');
}
test('v3420 D1. ★★ 破坏「上游面归属」⇒ 形状判据 B1 必须转红', () => {
    const bad = loadIIFE(KIT.breakOnce(BC_SRC, ANCHORS.kUpstreamFace, String.raw`face: '',`, 'kUpstreamFace'), 'LonShaBranchCanon');
    expectRed(() => judgeShape(bad, VCLib), 'kUpstreamFace');
    judgeShape(BC, VCLib);
    console.log('  ok 条文丢面 ⇒ 形状断链当场现形；原版阳性通过');
});
test('v3420 D2. ★★ 破坏「空输入不出包」⇒ 三态判据 B2 必须转红', () => {
    const bad = loadIIFE(KIT.breakOnce(BC_SRC, ANCHORS.kNotReady, String.raw`if (false) {`, 'kNotReady'), 'LonShaBranchCanon');
    expectRed(() => judgeThreeStates(bad), 'kNotReady');
    judgeThreeStates(BC);
    console.log('  ok 未选尽也出包 ⇒ 转红；原版阳性通过');
});
test('v3420 D3. ★★ 破坏「幂等键」⇒ 幂等判据 B4 必须转红', () => {
    const bad = loadIIFE(KIT.breakOnce(BC_SRC, ANCHORS.kAdoptId,
        String.raw`'v1|fixed|' + (o.allowReplace === true ? 'R' : 'r') + '|' + (o.allowNameLink === true ? 'N' : 'n')`, 'kAdoptId'), 'LonShaBranchCanon');
    /* ★ 先自证**破坏副本仍可加载**：上一步坏语法会让任何判据都红（负控制空转的第三形）。 */
    if (typeof bad.buildContinuePack !== 'function' || typeof bad.adoptionBrief !== 'function') {
        throw new Error('kAdoptId：破坏副本不可加载 ⇒ 负控制测错了对象（须只坏判据、不坏语法）');
    }
    expectRed(() => judgeIdStable(bad), 'kAdoptId');
    judgeIdStable(BC);
    console.log('  ok 卷指纹置常量 ⇒ 换卷不换 id 被照出；原版阳性通过');
});
test('v3420 D4. ★★ 破坏「无键条目不得进包」⇒ 缺格判据 B3 必须转红', () => {
    const bad = loadIIFE(KIT.breakOnce(BC_SRC, ANCHORS.kNoKey, String.raw`if (false) return { ok: false, why: UNMAPPED.NO_KEY };`, 'kNoKey'), 'LonShaBranchCanon');
    expectRed(() => judgeUnmapped(bad), 'kNoKey');
    judgeUnmapped(BC);
    console.log('  ok 无键条目混进可接集被照出；原版阳性通过');
});
test('v3420 D5. ★★ 破坏「无来源范围一律不碰」⇒ 撤销保护判据 B5 必须转红', () => {
    const bad = loadIIFE(KIT.breakOnce(BC_SRC, ANCHORS.kManualKeep, String.raw`if (false) {`, 'kManualKeep'), 'LonShaBranchCanon');
    expectRed(() => judgeRevoke(bad), 'kManualKeep');
    judgeRevoke(BC);
    console.log('  ok 手工条目被算进可撤集被照出；原版阳性通过');
});
test('v3420 D6. ★★ 破坏「凭据持久化判幂等」⇒ 重启后重复确认判据 C2 必须转红', async () => {
    const badIdx = KIT.breakOnce(IDX, ANCHORS.hPersistIdem, String.raw`const persistedId = '';`, 'hPersistIdem');
    let threw = false;
    try { await judgeHostConfirm(badIdx); } catch (e) { threw = true; }
    if (!threw) throw new Error('hPersistIdem：破坏后判据未转红（负控制空转）');
    await judgeHostConfirm(IDX);
    console.log('  ok 重启后认不出同一件事 ⇒ 再落一遍被照出；原版阳性通过');
});
test('v3420 D7. ★★ 破坏「存档契约面」⇒ 宿主契约判据 A1 必须转红', () => {
    const badIdx = KIT.breakOnce(IDX, ANCHORS.hContract, String.raw`canonAdoption: null,`, 'hContract');
    expectRed(() => judgeHostContract(badIdx), 'hContract');
    judgeHostContract(IDX);
    console.log('  ok 凭据不随存档走 ⇒ 契约面转红；原版阳性通过');
});
test('v3420 D8. ★★ 破坏「凭据只在确认后落」⇒ 落盘闸门判据 C3 必须转红', async () => {
    const badIdx = KIT.breakOnce(IDX, ANCHORS.hCommit, String.raw`if (true) {`, 'hCommit');
    let threw = false;
    try { await judgeCommitGate(badIdx); } catch (e) { threw = true; }
    if (!threw) throw new Error('hCommit：破坏后判据未转红（负控制空转）');
    await judgeCommitGate(IDX);
    console.log('  ok 预览期就写凭据被照出；原版阳性通过');
});
/* ══════════════ F. 锚点自证 ══════════════ */
test('v3420 F1. ** H5 判据纯度：破坏锚点在**本档源码**里各恰中 1 次', () => {
    for (const k of Object.keys(ANCHORS)) {
        const n = SELF.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '锚点 ' + k + ' 在本档出现 ' + n + ' 次（应恰 1 —— 多处声明会让改一处漏一处时纯度检查恒过）');
    }
    for (const k of ['kUpstreamFace', 'kNotReady', 'kAdoptId', 'kNoKey', 'kManualKeep']) {
        const n = BC_SRC.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '内核锚 ' + k + ' 在 branch-canon.js 命中 ' + n + ' 次（应恰 1）');
    }
    for (const k of ['hPersistIdem', 'hContract', 'hCommit']) {
        const m = IDX.split(ANCHORS[k]).length - 1;
        assert.equal(m, 1, '宿主锚 ' + k + ' 在 index.js 命中 ' + m + ' 次（应恰 1）');
    }
    console.log('  ok 八个锚点在本档各 1 次、在真源各 1 次');
});
test('v3420 F2. ** H6 两向自证：锚点不存在 / 不唯一 / 同值替换时破坏必须被拒', () => {
    const W = KIT.BREAK_MSG;
    assert.throws(() => KIT.breakOnce('abc', 'zzz', 'x'), new RegExp(W.hits + '|' + W.refuse));
    assert.throws(() => KIT.breakOnce('aaa', 'a', 'b'), new RegExp(W.hits + '|' + W.refuse));
    assert.throws(() => KIT.breakOnce('abc', 'abc', 'abc'), new RegExp(W.mustChange));
    console.log('  ok 0 次 / 多次 锚点与同值替换均被唯一真源拒绝');
});
/* ══════════════ G. 版本锚 ══════════════ */
test('v3420 G1. ★★ 版本面：六源同源 + 本档出生锚 BORN_V（下界，不锁当版）', () => {
    const idxV = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(vnum(idxV) >= vnum(BORN_V), '宿主版本不得低于本档出生版本（实 ' + idxV + '）');
    assert.equal(MF.version, idxV, 'manifest.json 未与宿主同源');
    assert.equal(PKG.version, idxV, 'package.json 未与宿主同源');
    for (const rel of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        assert.match(read(rel), new RegExp("let VERSION = '" + idxV + "'"), rel + ' 未同源');
    }
    assert.ok(vnum(BORN_V) > vnum('3.341.0'), '版本序须前进');
    console.log('  ok 六源逐字同源（' + idxV + '）/ 出生锚 v' + BORN_V + ' / 版本序前进');
});
