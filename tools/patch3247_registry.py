#!/usr/bin/env python3
"""v3.296.0 · X1 收口：v3247 B1 台账 ↔ 磁盘双向一致（补登 v3291/v3292/v3293）。

现象：v3247 B1 报「磁盘上新增了接收方却没登记」，差集为
  v3291_x5_knowledge_trace / v3292_x6_branch_semantics / v3293_x7_volume_continuation。
根因：X5/X6/X7 三档各自从 tests/_break_kit.mjs 取 breakSource，但**当版漏登记台账**
（v3247 的 B1 是「磁盘 ↔ 台账双向差集皆空」，磁盘实时扫描 ⇒ 漏登记立刻红）。
纪律同前：全部锚点先校验、通过后统一写盘。
"""
import io
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
F = ROOT / 'tests/v3247_break_kit_consolidation.test.mjs'

src = io.open(F, encoding='utf-8').read()
out = src
edits = []


def rep(label, old, new):
    global out
    n = out.count(old)
    if n == 0:
        print('[v3247-patch] 锚点未命中：' + label)
        sys.exit(1)
    if n > 1:
        print('[v3247-patch] 锚点命中 %d 次（须恰 1 次）：%s' % (n, label))
        sys.exit(1)
    if old == new:
        print('[v3247-patch] 同值替换，跳过：' + label)
        return
    out = out.replace(old, new)
    edits.append(label)


ANCHOR = "    'v3288_plan_currency_xface.test.mjs',\n"
ADD = (
    "    'v3288_plan_currency_xface.test.mjs',\n"
    "    /* [v3.291.0 X5 / v3.292.0 X6 / v3.293.0 X7 补登] 三档各自从 tests/_break_kit.mjs\n"
    "     *   取 breakSource（真源码破坏）；按 B1 台账纪律在此登记。\n"
    "     *   为什么迟到：三档当版各自独立落笔，漏了本表 —— 而 B1 是「磁盘 ↔ 台账双向差集皆空」\n"
    "     *   （磁盘实时扫描），漏登记不会静默，下一次跑本档即点名。 */\n"
    "    'v3291_x5_knowledge_trace.test.mjs',\n"
    "    'v3292_x6_branch_semantics.test.mjs',\n"
    "    'v3293_x7_volume_continuation.test.mjs',\n"
)
rep('REGISTRY 补登 v3291/v3292/v3293', ANCHOR, ADD)

if edits:
    io.open(F, 'w', encoding='utf-8').write(out)
    print('[v3247-patch] 全部锚点恰中 1 次，已写盘，共 %d 处。' % len(edits))
else:
    print('[v3247-patch] 无改动。')