#!/usr/bin/env python3
"""v3.286.0 O8 第二刀收尾：第四处登记面 —— v3247 的「接收方台账」REGISTRY。

为什么必须补（本轮实测的红）：
  tests/v3247_break_kit_consolidation.test.mjs 的 B1 判据要求
  「接入面台账 REGISTRY == 磁盘事实（双向差集皆空，不是计数相等）」。
  本刀两个新套件都从唯一真源 `tests/_break_kit.mjs` 取 `breakSource` / `assertSingleHit`，
  即它们**真的是接收方** —— 按台账纪律必须登记，否则该套件转红：
  「磁盘上新增了接收方却没登记（下一步就是接入面与判据面不同源）」。

★ 本刀踩到的第 4 处登记面（前三处：audit_scan_probe_matrix.tsv / catalog_reference_consumers.tsv /
  plan_currency.tsv）。教训写进 CHANGELOG：本仓的登记面是**四处**，新增测试档必须逐处核对。

幂等：台账里已含该文件名则跳过。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
TARGET = ROOT / 'tests' / 'v3247_break_kit_consolidation.test.mjs'
KEY = "'v3286_cost_truthfulness.test.mjs',"

ANCHOR = "'v3285_o7_doc_truthfulness.test.mjs',"
NEW_ROWS = ("    /* [v3.286.0 O8 第二刀] 两个新套件都从唯一真源取 breakSource / assertSingleHit，\n"
            "     *   故按台账纪律（接入面 == 磁盘事实）在此登记。 */\n"
            "    'v3286_cost_truthfulness.test.mjs',\n"
            "    'v3286_plan_currency.test.mjs',\n")

src = TARGET.read_text(encoding='utf-8')
if KEY in src:
    print('[o8b-reg3] 台账已含 v3286 两档（幂等），跳过')
    sys.exit(0)
n = src.count(ANCHOR)
if n != 1:
    print('[FATAL] 锚点命中 %d 次（要求恰 1 次），不写盘' % n)
    sys.exit(1)
TARGET.write_text(src.replace(ANCHOR, ANCHOR + '\n' + NEW_ROWS.rstrip('\n'), 1), encoding='utf-8')
print('[o8b-reg3] 已补登接收方台账：v3286_cost_truthfulness.test.mjs / v3286_plan_currency.test.mjs')