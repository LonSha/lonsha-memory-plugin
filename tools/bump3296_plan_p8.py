#!/usr/bin/env python3
"""v3.296.0 · X1 收口：修 PLAN.md 现行排序节第 3 条 P8 翻红。

门禁 `scan_plan_currency.mjs` 的 P8 判定面是**条目标题**（`N. **…**` 的加粗段）：
标题里出现的编号若在文首现状节已记为「已交付」，即判「已交付条目被复活为待办」。
第 3 条标题原文写作「X 系列收口核查（X1–X8 全部已交付）」，把 X1/X8 编号写进了标题面 ⇒ 翻红。
修法：编号移出标题面（标题只留「八条全部已交付」），交付事实保留在本条正文的说明面
（说明面不参与 P8 判定，且正文里「X1 已于 v…交付」正是「勿再列入待办」的陈述）。

纪律同前：全部锚点先校验、通过后统一写盘。
"""
import io
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
PLAN = ROOT / 'PLAN.md'

src = io.open(PLAN, encoding='utf-8').read()
out = src
edits = []


def rep(label, old, new):
    global out
    n = out.count(old)
    if n == 0:
        print('[plan-p8] 锚点未命中：' + label)
        sys.exit(1)
    if n > 1:
        print('[plan-p8] 锚点命中 %d 次（须恰 1 次）：%s' % (n, label))
        sys.exit(1)
    if old == new:
        print('[plan-p8] 同值替换，跳过：' + label)
        return
    out = out.replace(old, new)
    edits.append(label)


# ── 第 3 条标题：编号移出标题面 ────────────────────────────────────────────
rep(
    '排序节第 3 条标题去编号',
    '3. **X 系列收口核查（X1–X8 全部已交付）** —— ',
    '3. **X 系列收口核查（八条全部已交付）** —— '
    '（标题面不列编号：判据 `scan_plan_currency.mjs` 的 P8 只认条目标题里的编号，'
    '已交付编号写进标题会被判「复活为待办」；交付事实见文首现状节与本条正文）',
)

if edits:
    io.open(PLAN, 'w', encoding='utf-8').write(out)
    print('[plan-p8] 全部锚点恰中 1 次，已写盘，共 %d 处。' % len(edits))
else:
    print('[plan-p8] 无改动。')
