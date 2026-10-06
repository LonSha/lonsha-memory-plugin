#!/usr/bin/env python3
"""v3.286.0 O8 第二刀：两处收口。

① PLAN.md「## 起手两件（历史节…）」补**陈旧标记行**。
   为什么：它标题里写着「历史节」，但判据钉的是可机械核的字面（「陈旧」二字）——
   读者的困境是「哪一节算数」，而「历史节」这个说法本身也要能被判据读出来。
   现行排序节的唯一性 + 旧节的陈旧标记，合起来才让「现行与否」可辨。

② PLAN.md 文首现状节补一条**测试成本读数已交付**的陈述。
   为什么：O8 第二刀把成本读数落了地，而文首「当前执行状态」是本仓唯一现行口径 ——
   交付物不写进现行节，读者（含新会话）就只能在 CHANGELOG 里考古。

幂等：哨兵已在场则跳过。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
PLAN = ROOT / 'PLAN.md'
SENTINEL = '【陈旧节 · 勿当排序读】** 本节属 2026-10-04 之前的收尾轮'

A_ANCHOR = "## 起手两件（历史节：两件均已交付，勿当待办）\n"
A_NEW = ("## 起手两件（历史节：两件均已交付，勿当待办）\n"
         "> **【陈旧节 · 勿当排序读】** 本节属 2026-10-04 之前的收尾轮，其两件均已交付，"
         "仅作交付史保留。**现行排序见文首「当前优先级（唯一现行排序 · 判据 `scan_plan_currency.mjs`）」节。**\n")

src = PLAN.read_text(encoding='utf-8')
if SENTINEL in src:
    print('[o8b-plan] 哨兵已在场 ⇒ 已应用过，跳过（幂等）')
    sys.exit(0)
n = src.count(A_ANCHOR)
if n != 1:
    print('[FATAL] 锚点命中 %d 次（必须恰 1 次），不写盘' % n)
    sys.exit(1)
PLAN.write_text(src.replace(A_ANCHOR, A_NEW, 1), encoding='utf-8')
print('[o8b-plan] 已给「起手两件」节补陈旧标记行')