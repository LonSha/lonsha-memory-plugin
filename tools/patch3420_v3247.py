#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.342.0 M4-X3 抬版连带（第三批）：v3247 接入面台账登记本刀新档。
口径：本刀测试档 `tests/v3420_m4x3_canon_adoption.test.mjs` 从唯一真源
  `tests/_break_kit.mjs` 取 `breakOnce` / `BREAK_MSG`（八条真源码破坏），
  按 v3247 B1 台账纪律须登记进 REGISTRY（否则「磁盘上新增接收方却没登记」）。
  只加一行登记 + 一段理由注释，不动判据本体与其他登记项。
锚点：取末条登记项 `'v3410_m4x2_chapter_compose.test.mjs',` 之后插入（须恰中 1 次）。
"""
import io
import os
import sys
ROOT = '/home/user/lonsha-memory-plugin/'
T = ROOT + 'tests/v3247_break_kit_consolidation.test.mjs'
BAK = '/tmp/bak3420/'
src = io.open(T, encoding='utf-8').read()
if 'v3420_m4x3_canon_adoption.test.mjs' in src:
    sys.stderr.write('FAIL: v3247 里已有 v3420 登记（拒绝重跑）\n')
    sys.exit(1)
ANCHOR = "    'v3410_m4x2_chapter_compose.test.mjs',\n"
n = src.count(ANCHOR)
assert n == 1, 'v3410 登记锚点命中 %d 次（须 1）' % n
NEW = ("    /* [v3.342.0 · M4-X3] 本档从 tests/_break_kit.mjs 取 breakOnce / BREAK_MSG\n"
       "     *   （八条真源码破坏：内核落卷面五个锚点 + 宿主接线面三个锚点）；按 B1 台账纪律在此登记。 */\n"
       "    'v3420_m4x3_canon_adoption.test.mjs',\n")
src = src.replace(ANCHOR, ANCHOR + NEW, 1)
os.makedirs(BAK, exist_ok=True)
io.open(BAK + 'v3247.pre3420', 'w', encoding='utf-8').write(io.open(T, encoding='utf-8').read())
io.open(T, 'w', encoding='utf-8').write(src)
assert io.open(T, encoding='utf-8').read().count("'v3420_m4x3_canon_adoption.test.mjs',") == 1, '落盘自检未过'
print('v3247 已登记 v3420（%d 行）' % (src.count('\n') + 1))