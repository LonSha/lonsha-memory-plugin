#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch_3324_fix2.py — [v3.324.0] 抬版连带：v3323 F3 的「末尾三模块」锚点

为什么必须改（真实的连带翻红，不是刷绿）：
  · v3323 F3 原写 `assert.equal(MF.extra_js.slice(-3).join(','), MODS.join(','), '三新模块须追加在分发面末尾')`
    —— 它把「C 包三模块在**绝对末尾**」当成了永久不变量。D 包两模块追加在末尾后，
    C 包三模块退到倒数第 5~3 位，该断言翻红，而翻红的信息量只剩「位置不对」。
  · 该断言真正要守的不变量是「**C 包三模块仍连续相邻且在 D 包之前**」（加载序：消费方在后），
    而不是「它们必须在文件最后一行」。修法改成按**相对位置**断言（连续 + 在末尾两模块之前），
    并把「当版绝对末尾」交给 v3324 F3 接管：
      · 绝对末尾须是 D 包两模块（当版项）；
      · C 包三模块须**连续**且整体位于 D 包两模块之前。
  · 交棒**不弱化**：新写法同时钉死「连续」与「先后」，比原写法信息量更大
    （原写法只能证明在最末尾，证明不了三段之间的相邻关系）。
"""
import io
import sys

EDITS = []


def rep(path, old, new, must=1):
    EDITS.append((path, old, new, must))


rep('tests/v3323_c_pack_group_relation.test.mjs',
    "    assert.equal(MF.extra_js.slice(-3).join(','), MODS.join(','), '三新模块须追加在分发面末尾（加载序：消费方在后）');",
    "    /* [v3.324.0 交棒] 原文是 `assert.equal(MF.extra_js.slice(-3).join(','), MODS.join(','), ...)` ——\n"
    "     *   【把「在绝对末尾」当永久不变量】：D 包两模块（extraction-driver / correction-plan）\n"
    "     *   追加在末尾后，C 包三模块退到倒数第 5~3 位，该断言翻红而信息量只剩「位置不对」。\n"
    "     *   本条要守的不变量是「**消费方在后**」：C 包三模块须**连续**且整体位于末尾两模块之前。\n"
    "     *   新写法同时钉死「连续」与「先后」两件事（比原写法信息量更大），\n"
    "     *   当版绝对末尾锚（末尾须是 D 包两模块）由 v3324 F3 接管。 */\n"
    "    const tail5 = MF.extra_js.slice(-5);\n"
    "    assert.equal(tail5.slice(0, 3).join(','), MODS.join(','),\n"
    "        'C 包三模块须连续相邻（加载序上它们是一组消费方），实 ' + tail5.slice(0, 3).join(','));\n"
    "    assert.equal(tail5.slice(3).join(','), 'extraction-driver.js,correction-plan.js',\n"
    "        'D 包两模块须位于 C 包三模块之后（当版追加在末尾），实 ' + tail5.slice(3).join(','));\n")

for path, old, new, must in EDITS:
    src = io.open(path, encoding='utf-8').read()
    n = src.count(old)
    if n != must:
        sys.exit('[fix2_3324] %s 锚点命中 %d 次（期望 %d）：%r' % (path, n, must, old[:80]))
    io.open(path, 'w', encoding='utf-8').write(src.replace(old, new))
    print('[fix2_3324] ok %s' % path)
print('[fix2_3324] 完成：v3323 F3 末尾锚改为「连续 + 先后」相对位置断言')