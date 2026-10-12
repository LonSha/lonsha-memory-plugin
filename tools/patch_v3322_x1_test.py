# -*- coding: utf-8 -*-
"""[v3.322.0 收尾] 把「M3-X1 宿主出口」的判据面落进 tests/v3321。

【为什么必须补这一面】
  v3.321.0 交付时 M3-X1 只落了**内核**两面（planQuestion / composeAnswer，D1~D3 判据在册），
  宿主出口在**实施期内**才补上 —— 于是 `index.js` 里 `_qaKnownActors` / `askMemoryQuestion` /
  `memoryQaLine` 三个成员**全仓零判据**：它们是真的、但没人证明过它们真跑通。
  本仓治理过多轮的正是这一类（「导出了 API 但零调用点」的判据侧对偶：
  「写了出口但零判据」）。故本刀补 3 条：出口面（恒定键面 / 真读数 / 不扩权）、
  跑通面（真账本 → 真答案 → 真诊断行）、负控制（真源码破坏下同款判据必须现形）。

【为什么用「真方法体切片」而不是重写一份宿主逻辑】
  重写一份等于把宿主的实现抄进判据（改一处漏一处），本仓对这条的专用名是「第二份真源」。
  切片去的是**同一个函数体文本**，破坏副本上跑的也是**同一个判据函数** —— 与 v3296 / v3297
  同规格（那两份的先例已在仓内，夹具缺件与取库口漏给的坑也都留过痕）。
"""
import io
import sys

EDITS = []


def rep(path, old, new, must=1, label=''):
    EDITS.append((path, old, new, must, label))


T = 'tests/v3321_b_pack_long_memory_time.test.mjs'

# ── ① 档头：清单补「宿主出口」四条 + 条数 24 → 27 ─────────────────────────────
rep(T,
    " *      ⑤ 无答案给**缺口**而非编补（查不到 ≠ 没有这件事 ≠ 没查）。",
    """ *      ⑤ 无答案给**缺口**而非编补（查不到 ≠ 没有这件事 ≠ 没查）。
 *   M3-X1 **宿主出口**（index.js::_qaKnownActors / askMemoryQuestion / memoryQaLine）：
 *      ⑥ 恒定键面 —— 内核缺席时给**同键**回执（15 键与 15 键逐字相同），
 *         且缺席路径的 `knownActors` 是**真读数**（「模块没加载」≠「一个名字都没有」）；
 *      ⑦ 出口**不扩权** —— 只回合成句与逐计划读数，`rows` 一格不外带（档头写死的纪律）；
 *      ⑧ 读侧缺口**具名** —— 「未参与的账」与「账里确实没有」分列，不再报
 *         「九账全部取不到」这种与场景不符的模板句（本刀修掉的正是这一处）。""",
    1, '档头清单')

rep(T, "（24 条）", "（27 条）", 1, '档头条数')

# ── ② 负控制锚点：缺席路径的恒定键面 ──────────────────────────────────────────
rep(T,
    """    x1Masked: String.raw`                if (row && row.masked === true) {`,
});""",
    """    x1Masked: String.raw`                if (row && row.masked === true) {`,
    /* [v3.322.0 收尾] 宿主出口侧锚点：缺席回执的恒定键面。
     *   破坏形态 = **删掉这一格**（不是改值）—— 那样在场/缺席两条路径的键数不同，
     *   下游按键断言当场破；这正是本刀修掉的那处真缺陷的**反向**。 */
    x1AbsentKnown: String.raw`knownActors: known, reason: reason, writesNothing: true`,
});""",
    1, 'ANCHORS 新锚点')

# ── ③ G 段：宿主出口判据（函数 + 3 条 test），插在 E 段之前 ────────────────────
G = r"""/* ══════════════ G. M3-X1 宿主出口（真方法体 + 真内核 + 真账本） ══════════════
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
    /* ③ 不扩权 + 只读：rows 一格不外带；跑完真查询不动注入面。 */
    if (/rows/.test(JSON.stringify(r))) throw new Error('出口把 rows 外带了（档头写死的「不扩权」被破）');
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
test('v3321 G1. ★★★ M3-X1 宿主出口：恒定键面（缺席也是真读数）+ 不扩权 + 只读', () => {
    const r = x1JudgeHostFace(IDX);
    assert.equal(r.version, 1, '在场路径须报内核版本号');
    console.log('  ✓ 缺席与在场同键（' + Object.keys(r).length + ' 键）；缺席的 knownActors 是真读数；rows 一格不外带');
});
test('v3321 G2. ★★★ M3-X1 宿主出口真跑通：真账本 → 真答案 → 真诊断行，且读侧缺口具名', () => {
    x1JudgeHostRun(IDX);
    console.log('  ✓ 真账本答出「谁答应了什么」：3 句 / 可回源 2；未参与的账具名（空账 8 本）');
});
test('v3321 G3. ★★★ 破坏宿主出口的恒定键面 ⇒ G1 判据必须转红', () => {
    const bad = breakOnce(IDX, ANCHORS.x1AbsentKnown, 'reason: reason, writesNothing: true', 'x1 缺席键面');
    let threw = false, msg = '';
    try { x1JudgeHostFace(bad); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '缺席路径少一格键后判据必须转红（否则「恒定键面」没有任何判决力）');
    assert.match(msg, /键面/);
    x1JudgeHostFace(IDX);   // 反向对照：原版同判据必须过
});
/* ══════════════ E. 负控制（真源码破坏 → 破坏副本上重跑同款判据） ══════════════ */"""

rep(T,
    "/* ══════════════ E. 负控制（真源码破坏 → 破坏副本上重跑同款判据） ══════════════ */",
    G,
    1, 'G 段插入')


def main():
    for (path, old, new, must, label) in EDITS:
        src = io.open(path, encoding='utf-8').read()
        n = src.count(old)
        if n != must:
            print('FAIL 锚点命中 ' + str(n) + ' 次（期望 ' + str(must) + '）：' + label)
            sys.exit(1)
    print('锚点全部命中 (' + str(len(EDITS)) + ' 项)，开始写盘')
    for (path, old, new, must, label) in EDITS:
        src = io.open(path, encoding='utf-8').read()
        io.open(path, 'w', encoding='utf-8').write(src.replace(old, new))
        print('OK ' + label)


main()