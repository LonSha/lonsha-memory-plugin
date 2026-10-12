/* ============================================================
 * tests/v3322_qa_host_exit.test.mjs — [v3.322.0 · B 包收尾 · M3-X1 宿主出口]（6 条）
 *
 * 【本套件要证明的是「问得出、答得出、答不出时说得清为何答不出」，不是「函数返回了对象」】
 *   M3-X1 **宿主出口**（index.js 的取人名 / 问答 / 诊断行三成员）：
 *      ① 取人名：两来源并集 + 去重 + 封顶；**单一来源失败不得把另一来源也带下去**（两处 try 各自独立）；
 *         只收 character 节点（事件节点不得混进「已知人名」）；
 *      ② **恒定键面**：内核缺席的降级回执与在场路径**逐字同键** ——
 *         这是下游「按键断言不必猜」的前提；修前缺席只有 14 键、缺 knownActors 一格（本刀修真缺陷）；
 *      ③ 缺席路径的 knownActors 是**真读数**（人名装配不依赖内核）——
 *         「模块没加载」不等于「一个已知人名都没有」，两者处置相反；
 *      ④ **不扩权**：出口只回合成句与逐计划读数，rows 一格不外带；
 *      ⑤ **只读**：跑真查询不得动注入面（_lastInjection 是哨兵）；
 *      ⑥ 读侧缺口**具名**：「未参与的账」与「账里确实没有」分列 ——
 *         不得再报「九账全部取不到」这种与场景不符的模板句（本刀修掉的正是这一处）；
 *      ⑦ 诊断行三态：上次读数 / **待用**（没问过 ≠ 没有答案）/ 模块未加载。
 *
 * 【为什么本档从 v3321 迁出】v3321 出生于 v3.321.0，而本段是**抬版之后**才加的、锚的是
 *   本刀新修的缺陷面 ⇒ 留在旧档等于让旧档替当版持锚（v3.298.0 已定性：历史档只锁自己的出生版本；
 *   V2 禁止历史档硬锁当版，V4 要求当版锚**恰 1 处**住在当版档案里）。
 *
 * 负控制一律：真源码破坏（锚点恰中 1 次）→ 在**破坏副本**上重跑**同款真判据** → 必须现形；
 *   并反向对照「原版同判据必须通过」。
 * 【当版锚点】本档自锚常量 + vnum（锚必须住在当版档案里）。
 * 【首跑自伤留痕】G1 首版拿 rows **子串匹配**判「不扩权」，被缺口类型名 no-rows 误伤
 *   ⇒ **判据错，不是实现错**（把对的实现判红了）；改为**按键名深度遍历**找 rows / row 键。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { breakOnce } from './_break_kit.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const require_ = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const IDX = read('index.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const EQ_SRC = read('evidence-query.js');
const SELF = read(path.join('tests', 'v3322_qa_host_exit.test.mjs'));
/** 在隔离 vm 里加载 IIFE 模块（与生产同形：window 即全局，module 缺席）。 */
function loadIIFE(src, globalName, extra) {
    const ctx = Object.assign({
        console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math,
        isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError
    }, extra || {});
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const api = ctx[globalName];
    if (!api) throw new Error('模块未挂 ' + globalName);
    return api;
}
const EQ = loadIIFE(EQ_SRC, 'LonShaEvidenceQuery');
const WB = require_(path.join(R, 'evidence-workbench.js'));
/** 负控制锚点（在判据层只声明一次 —— H5 判据纯度）。 */
const ANCHORS = Object.freeze({
    /* [v3.322.0] 宿主出口侧锚点：缺席回执的恒定键面。
     *   破坏形态 = **删掉这一格**（不是改值）—— 那样在场/缺席两条路径的键数不同，
     *   下游按键断言当场破；这正是本刀修掉的那处真缺陷的**反向**。 */
    x1AbsentKnown: String.raw`knownActors: known, reason: reason, writesNothing: true`,
});

/* ══════════════ G. M3-X1 宿主出口（真方法体 + 真内核 + 真账本） ══════════════
 *   与 A~D 段的分工：那几段证的是**内核**（纯函数、隔离 vm 加载）；
 *   本段证的是**宿主出口**——取的是 `index.js` 里那三段的**同一份函数体文本**，
 *   在 `new Function` 里与真内核、真账本装配起来跑。
 *   ★ 为什么不重写一份宿主逻辑：重写就是把实现抄进判据（第二份真源）。
 */
const CL = require_(path.join(R, 'commitment-ledger.js'));
/** 取成员体（模块级函数或类方法），配平跳过字符串与模板串。
 *  裸 `{` 计数会被判据里的正则字面量提前收口 —— 本仓为这条留过两次痕。 */
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
                if (src[k] === '\\') { k += 2; continue; }
                if (src[k] === c) { k++; break; }
                if (src[k] === '\n' && c !== '`') break;
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
/** 装配真宿主出口：取库口 + 装配点 + 三个成员（缺一即抛，不静默降级成空壳）。 */
function mkQaHost(win, src) {
    const idx = src || IDX;
    const heads = ['function _moduleLib(getGlobal, fileName) {', 'function _evidenceQueryLib() {',
        'function _evidenceWorkbenchLib() {', 'function _evidenceQueryLedgersOf() {',
        'function _qaHelpDeps() {', 'function _ledgerApis() {', 'function _factVersionLib() {',
        'function _eventCompletenessLib() {', 'function _repairLoopLib() {'];
    const libs = heads.map((h) => sliceMember(idx, h));
    if (libs.some((x) => !x)) throw new Error('取库口切片缺失：' + heads.filter((h, i) => !libs[i]).join(' / '));
    const mHeads = ['_qaKnownActors(limit) {', 'askMemoryQuestion(question, opts) {', 'memoryQaLine() {'];
    const meths = mHeads.map((h) => sliceMember(idx, h));
    if (meths.some((x) => !x)) throw new Error('宿主出口切片缺失：' + mHeads.filter((h, i) => !meths[i]).join(' / '));
    return new Function('errLog', 'window',
        libs.join('\n') + '\nreturn ({ ' + meths.join(',\n') + ' });')(() => {}, win);
}
/** 夹具：真账本造的宿主状态（两条约定，一条已履行 —— 用真 `open/fulfill` 造，
 *  不手写条目形状：手写会在账本改字段时静默漂移）。 */
function qaHostState() {
    let cs = CL.normalize(undefined);
    cs = CL.open(cs, { actor: '苏晴', counterpart: '林一', content: '答应周三还书', floor: 3, eventKey: 'e1' }).state;
    cs = CL.open(cs, { actor: '苏晴', counterpart: '林一', content: '答应带的伞', floor: 9, eventKey: 'e2' }).state;
    cs = CL.fulfill(cs, { actor: '苏晴', content: '答应带的伞', floor: 12, eventKey: 'e3' }).state;
    return { worldProg: { commitmentLedger: cs } };
}
/** 在场宿主：真内核 + 真工作台 + 真账本 + 两个来源的已知人名。 */
function qaSelf(win, src) {
    const eng = mkQaHost(win, src);
    return Object.assign({}, eng, {
        _entityIdByName: new Map([['林一', 'ent_lin'], ['王五', 'ent_wang']]),
        graph: { nodes: new Map([['n1', { type: 'character', name: '苏晴' }], ['n2', { type: 'event', name: '不该进来的事件' }]]) },
        worldProg: qaHostState().worldProg,
        _lastInjection: 'SENTINEL'
    });
}
const QA_WIN = () => ({ LonShaEvidenceQuery: EQ, LonShaEvidenceWorkbench: WB, LonShaCommitmentLedger: CL });
/** G 判据一：出口面 —— 恒定键面 + 缺席是真读数 + 不扩权 + 只读。 */
function x1JudgeHostFace(src) {
    const self = qaSelf(QA_WIN(), src);
    /* ① 已知人名装配：两来源并集 + 去重 + 只收 character（事件节点不得混进来）。 */
    const names = self._qaKnownActors();
    if (names.join(',') !== '林一,王五,苏晴') throw new Error('已知人名装配不对（实得 ' + names.join(',') + '）');
    if (self._qaKnownActors(1).length !== 1) throw new Error('上限未生效');
    const one = Object.assign({}, self, { _entityIdByName: { keys() { throw new Error('boom'); } } })._qaKnownActors();
    if (one.join(',') !== '苏晴') throw new Error('单一来源失败把另一来源也带下去了（两处 try 必须各自独立）');
    /* ② 恒定键面：缺席路径与在场路径**逐字同键**。 */
    const r = self.askMemoryQuestion('苏晴答应了什么？', {});
    const engNo = mkQaHost({}, src);
    const noState = Object.assign({}, engNo, {
        _entityIdByName: self._entityIdByName, graph: self.graph, worldProg: self.worldProg
    });
    const rNo = engNo.askMemoryQuestion.call(noState, '苏晴答应了什么？', {});
    const k1 = Object.keys(r).join(','), k2 = Object.keys(rNo).join(',');
    if (k1 !== k2) throw new Error('缺席与在场键面不同（恒定键面是「下游按键断言不必猜」的前提）：\n  在场 ' + k1 + '\n  缺席 ' + k2);
    if (rNo.version !== 0 || !rNo.gaps.some((g) => g.kind === 'module')) throw new Error('内核缺席未给同键降级回执');
    if (rNo.knownActors !== 3) throw new Error('缺席路径的 knownActors 不是真读数（实 ' + rNo.knownActors + '）—— 「模块没加载」不等于「一个名字都没有」');
    /* ③ 不扩权 + 只读：rows 一格不外带；跑完真查询不动注入面。
     *   ★ 按键名深扫，**不**用子串匹配：缺口类型里就有 `no-rows` 这个词，
     *     首版拿 `/rows/.test(JSON.stringify(r))` 判 ⇒ 判据自己把正确实现判红
     *     （判据错与实现错必须分开记 —— 本档头部那两条留痕是同一道理）。 */
    const keyHits = [];
    const walk = (v, pathStr, d) => {
        if (!v || typeof v !== 'object' || d > 4) return;
        for (const k of Object.keys(v)) {
            if (k === 'rows' || k === 'row') keyHits.push(pathStr + '.' + k);
            walk(v[k], pathStr + '.' + k, d + 1);
        }
    };
    walk(r, 'r', 0);
    if (keyHits.length) throw new Error('出口把 rows 外带了（档头写死的「不扩权」被破）：' + keyHits.join('、'));
    if (self._lastInjection !== 'SENTINEL') throw new Error('问答跑了真查询却动了注入面（出口只读）');
    return r;
}
/** G 判据二：跑通面 —— 真账本 → 真答案（可回源 / 分档）→ 真诊断行 + 读侧缺口具名。 */
function x1JudgeHostRun(src) {
    const self = qaSelf(QA_WIN(), src);
    const r = self.askMemoryQuestion('苏晴答应了什么？', {});
    if (r.actor !== '苏晴') throw new Error('问句里的人名没被认出（只应从 knownActors 认，不猜别名）');
    if (r.plans.length !== 1 || r.plans[0].id !== 'promise') throw new Error('规划面不对：' + JSON.stringify(r.plans.map((p) => p.id)));
    if (r.total !== 3 || r.resourced !== 2) throw new Error('答案句数 / 可回源数不对：' + r.total + ' / ' + r.resourced);
    if (!r.refs.length || String(r.refs[0].ref).indexOf('commitment:') !== 0) throw new Error('句子没回得到出处：' + JSON.stringify(r.refs));
    const kinds = r.answer.map((s) => s.kind);
    if (kinds.indexOf('open') < 0 || kinds.indexOf('settled') < 0) throw new Error('未结 / 已结没按各账真状态分档：' + JSON.stringify(kinds));
    /* 读侧缺口：本问只扫一本账 ⇒ 必须点名「未参与」并分「空账 / 读不到」两档。 */
    const nr = r.gaps.filter((g) => g.kind === 'no-rows')[0];
    if (!nr) throw new Error('未参与的账没有进缺口（未参与与「没有」必须分列）');
    if (nr.why.indexOf('未参与') < 0) throw new Error('读侧缺口未具名：' + nr.why);
    if (nr.why.indexOf('空账 8 本') < 0) throw new Error('空账未点数：' + nr.why);
    if (nr.why.indexOf('九账全部取不到') >= 0) throw new Error('仍在报「九账全部取不到」的模板句 —— 那不是本问的读数：' + nr.why);
    /* 诊断行三态：上次读数 / 未问过（待用，不是「没有答案」）/ 模块未加载。 */
    const line = self.memoryQaLine();
    if (line.indexOf('可回源 2') < 0 || line.indexOf('缺口') < 0) throw new Error('诊断行没带读数：' + line);
    if (line.indexOf('按人 苏晴') < 0) throw new Error('诊断行没报「按谁筛」：' + line);
    const line0 = Object.assign({}, self, { _memoryQaLast: null }).memoryQaLine();
    if (line0.indexOf('待用') < 0) throw new Error('未问过时须说「待用」（不是「没有答案」）：' + line0);
    const engNo = mkQaHost({}, src);
    const lineNo = engNo.memoryQaLine.call(engNo);
    if (lineNo.indexOf('模块未加载') < 0) throw new Error('模块缺席时诊断行未如实归因：' + lineNo);
    return r;
}
test('v3322 G1. ★★★ M3-X1 宿主出口：恒定键面（缺席也是真读数）+ 不扩权 + 只读', () => {
    const r = x1JudgeHostFace(IDX);
    assert.equal(r.version, 1, '在场路径须报内核版本号');
    console.log('  ✓ 缺席与在场同键（' + Object.keys(r).length + ' 键）；缺席的 knownActors 是真读数；rows 一格不外带');
});
test('v3322 G2. ★★★ M3-X1 宿主出口真跑通：真账本 → 真答案 → 真诊断行，且读侧缺口具名', () => {
    x1JudgeHostRun(IDX);
    console.log('  ✓ 真账本答出「谁答应了什么」：3 句 / 可回源 2；未参与的账具名（空账 8 本）');
});
test('v3322 G3. ★★★ 破坏宿主出口的恒定键面 ⇒ G1 判据必须转红', () => {
    const bad = breakOnce(IDX, ANCHORS.x1AbsentKnown, 'reason: reason, writesNothing: true', 'x1 缺席键面');
    let threw = false, msg = '';
    try { x1JudgeHostFace(bad); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '缺席路径少一格键后判据必须转红（否则「恒定键面」没有任何判决力）');
    assert.match(msg, /键面/);
    x1JudgeHostFace(IDX);   // 反向对照：原版同判据必须过
});
/* ══════════════ F. 锚点自证 + 版本锚 ══════════════ */
test('v3322 F1. ★★ H5 判据纯度：破坏锚点在**本档源码**里恰中 1 次', () => {
    for (const k of Object.keys(ANCHORS)) {
        const n = SELF.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '锚点 ' + k + ' 在本档里出现 ' + n + ' 次（判据纯度要求恰 1 次；两处各写一份会让纯度检查恒过）');
    }
});
test('v3322 F2. ★★ H6 工具两向自证：锚点不存在 / 不唯一 / 同值替换必须抛', () => {
    assert.throws(() => breakOnce(IDX, '这段源码根本不存在', 'x', '不存在锚点'), /恰中 1 次|命中 0 次/);
    assert.throws(() => breakOnce(IDX, 'const ', 'x', '不唯一锚点'), /恰中 1 次|要求恰好 1 次/);
    assert.throws(() => breakOnce(IDX, ANCHORS.x1AbsentKnown, ANCHORS.x1AbsentKnown, '同值替换'), /必须真的改变源码/);
});
const vnum = (s) => { const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s).trim()); return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN; };
const BORN = '3.322.0';
test('v3322 F3. ★★★ 版本锚：本档出生版本 + 六源同源（V4 当版锚点形态）', () => {
    assert.equal(vnum(BORN), 3322000, 'vnum 序数必须可数（当版锚点）');
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(codeVer, '入口版本常量必须在场');
    assert.ok(vnum(codeVer) >= vnum(BORN), '本套件只在 ' + BORN + ' 及以后成立；当前 ' + codeVer);
    assert.equal(MF.version, codeVer, 'manifest 与入口同源');
    assert.equal(PKG.version, codeVer, 'package.json 与入口同源');
    for (const m of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const mv = (/let VERSION = '([^']+)'/.exec(read(m)) || [])[1];
        assert.equal(mv, codeVer, m + ' 副本须与入口同源（须是 let：bindDeps 可换，const 会 TypeError）');
    }
    assert.equal(MF.extra_js.length, 96, '本刀改既有文件、**不新增运行时模块**，仍 96');
    assert.ok(SELF.includes("const BORN = '3.322.0'"), '当版锚点必须显式留在本档里');
    assert.equal(SELF.includes('vnum(BORN)'), true, '锚形须可被守卫计数');
});
