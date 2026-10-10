# -*- coding: utf-8 -*-
"""v3.309.0 CHANGELOG 追加：破坏工具收编（名集边界真缺陷）+ 台账留痕 + 门禁读数刷新。"""
import os
import re

ROOT = '/home/user/lonsha-memory-plugin'
C = os.path.join(ROOT, 'CHANGELOG.md')

s = open(C, encoding='utf-8').read()

anchor = re.search(r"^[ \t]*· 本版\*\*全量未跑\*\*.*\n", open(C, encoding='utf-8').read(), re.M).group(0)
if s.count(anchor) != 1:
    raise SystemExit('[FATAL] CHANGELOG 尾锚命中 %d 次' % s.count(anchor))

add = (
    "- **抬版后定向套件当场抓出的两处红：一条**真缺陷**，不是登记口径问题**：\n"
    "  ① `v3247 B1`（接入面台账 == 磁盘事实，**双向差集**）与 `D2`（负控制：抬掉一个接收方的\n"
    "  import 必须转红）转红 —— 本档被抬版脚本登记进「接收方」台账，却**并不** `import _break_kit.mjs`\n"
    "  ⇒「台账有、磁盘无」非空。\n"
    "  ② **只把登记移出**是**压红**，不是治根：本档首版自带\n"
    "  `function sabotage(src, anchor, replacement)` —— 与真源 `breakOnce` **语义等价**\n"
    "  （锚点恰中 1 次才动手 / 同值替换拒绝），只是**名字**不在门禁的名字集里，\n"
    "  故静默通过了 `scan_break_kit` C1 与 `v3247 B2`（两侧都按**出口名集**判「不得本地重写」）。\n"
    "  这是「唯一真源」纪律的**换名逃逸**形态：**名集只能追已有名字，追不到下一次改名**。\n"
    "  ⇒ 裁决：按纪律**收编**（`import { breakOnce } from './_break_kit.mjs'`，删本地实现，\n"
    "  8 处调用点按原名接线）—— 收编后本档**成为真接收方**，B1 双向差集与 D2 自行转绿，\n"
    "  且不再有「本档自己那套口径」与真源漂移的空间。\n"
    "  · **名集边界的如实登记（不靠判据松一档来遮掩）**：`scan_break_kit` C1 与 `v3247 B2`\n"
    "    的检测面是「出口名集 + 调用点」，改名重写落在检测面之外。本版**不**为此加语义探测\n"
    "    （按函数体猜「这是不是破坏工具重写」会误报 `braceMatch` / `seg` / `classMethodBody`\n"
    "    这等结构读工具 —— 名字表要按「语义是什么」写，不是按「名字像什么」写，本仓已留过此痕），\n"
    "    故把边界写在这里：**新档必须走真源**，而不是「起个新名字自己写一份」。\n"
    "  · 连带补强：`D2`（前移段两端点须都在场、段长 > 0）与 `D5`（第二遍判定的插入点须恰中 1 次）\n"
    "    各补一条**锚点自证** —— 打偏时 `slice` 会得到空段、`replace` 退化成**同值替换**，\n"
    "    负控制就变回「对原文件断言」（假绿第一形态）。\n"
    "- **门禁读数（v3.309.0 复跑真值，超集于本刀前）**：`scan_break_kit.mjs` exit 0 ——\n"
    "  **89 接收方 / 87 判据点 / 手抄消息 0 / 7 组自证全绿**（含 N6 真接收方真跑 40 个）；\n"
    "  定向套件 11 档 **128 tests / 128 pass / 0 fail**（v3309 16/16、v3247 17/17）。\n"
    "  退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移。\n"
)
s = s.replace(anchor, add + anchor)
open(C, 'w', encoding='utf-8').write(s)
print('[chlog3309b] OK：CHANGELOG v3.309.0 节已追加收编留痕与门禁读数')