#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.342.0 M4-X3 新档 v3420 两处缺陷修正（真因实测，不是猜测）。

【缺陷 1：mkHost 切片缺 `branchCanonDecide` ⇒ 六条假红】
  `METH_HEADS` 只切了落卷面五出口 + describe；而 `seedPlan()` 要先置三档选择，
  用的是**既有**出口 `branchCanonDecide`。切片缺它 ⇒ 真宿主实例上没这个方法
  ⇒ C1/C2/C3/C4/D6/D8 全报「不是函数」。这是**夹具缺件造成的假红**（判据没被测到），
  不是宿主缺陷。修法：把 `branchCanonDecide(input) {` 并入切片清单（它在真源恰 1 次）。
【缺陷 2：D3 破坏串把模块改成语法错 ⇒ 负控制测错了对象】
  首版替换 `'ca_fixed' + '' + (` 把括号配平破掉：破坏副本整模块 SyntaxError，
  那样**任何**判据都会红，负控制测的就成了「模块加载失败」而不是「幂等键失效」。
  修法：定点到幂等键里的**卷指纹**那一段（`'v1|' + volumeId + ...`），
  把它置成常量 —— 模块仍合法加载、同选择仍恒同 id，但**换卷不再换 id**
  ⇒ 「换卷必换 id」这条判据真的失效（正是幂等键该守的那条）。
  并加一步**自证破坏副本仍可加载**，防止坏语法再一次被当成有效负控制。
"""

import io
import sys
T = '/home/user/lonsha-memory-plugin/tests/v3420_m4x3_canon_adoption.test.mjs'
s = io.open(T, encoding='utf-8').read()
if 'METH_DECIDE' in s:
    sys.stderr.write('FAIL: v3420 已修过（拒绝重跑）\n')
    sys.exit(1)
def sub1(text, a, b, label):
    n = text.count(a)
    assert n == 1, '%s 锚点命中 %d 次（须 1）：%r' % (label, n, a[:90])
    return text.replace(a, b, 1)

# ── 修 1：mkHost 切片补 branchCanonDecide（既有出口，置选择要用） ──
s = sub1(s,
  """const LIB_HEADS = ['function _moduleLib(getGlobal, fileName) {', 'function _branchCanonLib() {'];
const METH_HEADS = HOST_METHODS.concat(['branchCanonDescribe() {']);""",
  """const LIB_HEADS = ['function _moduleLib(getGlobal, fileName) {', 'function _branchCanonLib() {'];
/* \u2605 切片要含**置选择**那个既有出口：`seedPlan()` 先置三档选择，落卷出口才吃得到计划。
 *   缺它 \u21d2 真宿主实例上没这个方法，六条 C/D 判据全报\u300c不是函数\u300d（夹具缺件造成的假红）。 */
const METH_HEADS = HOST_METHODS.concat(['branchCanonDecide(input) {', 'branchCanonDescribe() {']);
const METH_DECIDE = 'branchCanonDecide(input) {';""",
  '修 1：切片补 branchCanonDecide')

# ── 修 2：D3 锚点改为「选择指纹段置常量」 ──
s = sub1(s,
  """    /* 内核\u00b7幂等键：改成常量 \u21d2 换了卷 / 换了选择也同 id（重复确认判据失去意义）。 */
    kAdoptId: String.raw`const adoptionId = 'ca_' + hash32(`,""",
  """    /* 内核\u00b7幂等键：把**卷指纹那一段**置成常量 \u21d2 换卷不换 id。
     *   \u2605 破坏必须让模块**仍可加载**：截断整条表达式会得到语法错，那样任何判据都会红，
     *     负控制测的就成了\u300c模块加载失败\u300d而不是\u300c幂等键失效\u300d（本刀踩过这个坑）。 */
    kAdoptId: String.raw`'v1|' + volumeId + '|' + (o.allowReplace === true ? 'R' : 'r') + '|' + (o.allowNameLink === true ? 'N' : 'n')`,""",
  '修 2：D3 锚点改为卷指纹段')
s = sub1(s,
  """    const bad = loadIIFE(KIT.breakOnce(BC_SRC, ANCHORS.kAdoptId, String.raw`const adoptionId = 'ca_fixed' + '' + (`, 'kAdoptId'), 'LonShaBranchCanon');
    expectRed(() => judgeIdStable(bad), 'kAdoptId');
    judgeIdStable(BC);
    console.log('  ok 键变常量 \u21d2 换卷不换 id 被照出；原版阳性通过');""",
  """    const bad = loadIIFE(KIT.breakOnce(BC_SRC, ANCHORS.kAdoptId,
        String.raw`'v1|fixed|' + (o.allowReplace === true ? 'R' : 'r') + '|' + (o.allowNameLink === true ? 'N' : 'n')`, 'kAdoptId'), 'LonShaBranchCanon');
    /* \u2605 先自证**破坏副本仍可加载**：上一步坏语法会让任何判据都红（负控制空转的第三形）。 */
    if (typeof bad.buildContinuePack !== 'function' || typeof bad.adoptionBrief !== 'function') {
        throw new Error('kAdoptId：破坏副本不可加载 \u21d2 负控制测错了对象（须只坏判据、不坏语法）');
    }
    expectRed(() => judgeIdStable(bad), 'kAdoptId');
    judgeIdStable(BC);
    console.log('  ok 卷指纹置常量 \u21d2 换卷不换 id 被照出；原版阳性通过');""",
  '修 2：D3 调用点')
io.open(T, 'w', encoding='utf-8').write(s)
print('v3420 已修：%d 行' % (s.count('\n') + 1))