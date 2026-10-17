#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.342.0 M4-X3 内核刀：把 tools/frag3420/ 的四个片段拼进 branch-canon.js。
口径：
  · 每个锚点**必须恰中 1 次**（0 次 / 多次一律退出，不写半成品）；
  · 片段逐字取自 tools/frag3420/part_{a,b,c}.js 与 part_d.frag（唯一真源，不在本脚本里重打）；
    ★ part_d 用 `.frag` 后缀而非 `.js`：它是**对象成员片段**（注入点在 `selfCheck` 返回对象
    字面量内部），本身不是可独立解析的模块 —— 叫 `.js` 会被 `scan_syntax` 语法门按 ESM 解析
    而报「Unexpected token ':'」（v3.342.0 实测抓出）。`.frag` 既不进语法门的 `.js/.mjs/.cjs`
    扫描面，也如实表明「这是源码片段、不是模块」。
  · 抬 BC_VERSION 1 → 2，并把新面挂进导出面（既有 32 项逐字不动，纯加法）。
"""
import io
import sys
ROOT = '/home/user/lonsha-memory-plugin/'
TARGET = ROOT + 'branch-canon.js'
FRAG = ROOT + 'tools/frag3420/'
BAK = '/tmp/bak3420/'
src = io.open(TARGET, encoding='utf-8').read()
if 'M4-X3' in src:
    sys.stderr.write('FAIL: branch-canon.js 里已有 M4-X3 痕迹（可能已打过补丁）\n')
    sys.exit(1)
PART_EXT = {'a': 'js', 'b': 'js', 'c': 'js', 'd': 'frag'}
parts = {}
for name in ('a', 'b', 'c', 'd'):
    parts[name] = io.open(FRAG + 'part_%s.%s' % (name, PART_EXT[name]), encoding='utf-8').read().rstrip('\n')


def sub1(text, anchor, repl, label):
    n = text.count(anchor)
    assert n == 1, '%s 锚点命中 %d 次（须 1）: %r' % (label, n, anchor[:90])
    return text.replace(anchor, repl, 1)


# ① 落卷常量面 + 映射面（part_a）：挂在 SECRET_MASK 定义之后
A_MASK = "    const SECRET_MASK = String.fromCharCode(10216) + '受限正文已隐去' + String.fromCharCode(10217);"
assert src.count(A_MASK) == 1, 'SECRET_MASK 锚点 %d' % src.count(A_MASK)
src = sub1(src, A_MASK, A_MASK + '\n' + parts['a'], '① 落卷常量面 + 映射面')
# ①' **上游病根**：outcomeOf 归一化条文时丢掉了面归属三格 ⇒ 下面各面拿不到 face / 主 / 值。
A_ITEM = "                sensitive: m.masked > 0, text: clip(c.text || '', 200), textHash: hash32(strOf(c.text)),"
NEW_ITEM = (A_ITEM + '\n'
            "                /* [v3.342.0 · M4-X3] **面归属原样带过**：修前只留 key / title / floor / keeper / text,\n"
            "                 *   于是下游落卷面拿到的条文「没有面、没有主」⇒ 逐条被判目标侧缺面、\n"
            "                 *   **一条也接不上**（而预览读数全绿）。这就是形状断链的病根，在本行治。\n"
            "                 *   值另取 value：text 是**裁剪本**（200 字），拿裁剪本当值是静默截断。 */\n"
            "                face: keyOf(c.face), faceKey: keyOf(c.key !== undefined ? c.key : c.field),\n"
            "                owner: { id: keyOf(c.entityId !== undefined ? c.entityId : (c.ownerId !== undefined ? c.ownerId : '')), name: keyOf(c.name !== undefined ? c.name : ((typeof c.owner === 'string') ? c.owner : '')) },\n"
            "                value: (c.value === undefined ? null : c.value),")
src = sub1(src, A_ITEM, NEW_ITEM, '①\' outcomeOf 面归属')
# ②③ 接续包 / 凭据 / 撤销保护面 + 探针夹具（part_b/part_c）：插在人读面之前
A_DESC = '    /* ── 4 人读面与自证 ── */'
src = sub1(src, A_DESC, parts['b'] + '\n' + parts['c'] + '\n' + A_DESC, '② 接续包/凭据/撤销保护面')
# ④ 自证探针（part_d）：插进 selfCheck 的返回对象（note 之前）
A_NOTE = "            note: missing.length ? ('依赖缺 ' + missing.length + ' 格(' + missing.map((m) => m.key).join('、') + ')') : '依赖齐备',"
src = sub1(src, A_NOTE, parts['d'] + '\n' + A_NOTE, '④ selfCheck 探针')
# ⑤ 版本：形状变了必须抬
src = sub1(src, 'const BC_VERSION = 1;', 'const BC_VERSION = 2;', '⑤ BC_VERSION')
# ⑥ 导出面：既有 32 项逐字不动，纯加法
A_API = '        describe, describePlan, selfCheck, line,'
src = sub1(src, A_API,
           '        ADOPT, ADOPT_LABEL, ADOPT_SOURCES, ADOPT_KIND, ADOPT_ITEM_FIELDS, UNMAPPED, adoptItemOf,\n'
           '        adoptableItems, buildContinuePack, adoptionBrief, revokeGuard, adoptionLine,\n'
           '        adoptProbeDeps, adoptProbePlan,\n'
           + A_API,
           '⑥ 导出面')
assert src.count('function adoptableItems(deps, rawPlan, opts) {') == 1
assert src.count('function buildContinuePack(deps, rawPlan, opts) {') == 1
assert src.count('function adoptionBrief(deps, rawPlan, opts) {') == 1
assert src.count('function revokeGuard(entries, brief, opts) {') == 1
assert src.count('function adoptItemOf(raw, source, ctx) {') == 1
assert src.count('function adoptionLine(read) {') == 1
assert src.count('function adoptProbeDeps() {') == 1
assert src.count('function adoptProbePlan() {') == 1
assert src.count('const ADOPT = Object.freeze') == 1
assert src.count('const BC_VERSION = 2;') == 1
import os
if not os.path.isdir(BAK):
    os.makedirs(BAK)
io.open(BAK + 'branch-canon.js.pre3420', 'w', encoding='utf-8').write(
    io.open(TARGET, encoding='utf-8').read())
io.open(TARGET, 'w', encoding='utf-8').write(src)
print('branch-canon.js 已拼装：%d 行' % (src.count('\n') + 1))
