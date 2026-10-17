#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.344.0 M4-X6 宿主出口修一处**真实设计缺陷**:

首版 `narrativeLayer` 只认 `opts.items`,缺省恒空 ⇒
  · 宿主诊断行**永远**报「暂无」,层轴事实上没接进宿主数据面;
  · 与 M4-X5 的口径不一致(那一刀从 `this.worldProg.knowledgeTraces.traces` 取自有状态)。

修法:缺省回落到**事实账** `this._factVersionState.facts`(fact-version 的既有载体,
层标注(modality)正是要挂在那些条目上)——**不新增任何持久化键**。
"""
import io
import os
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
TARGET = ROOT + 'index.js'
BAK = '/tmp/bak3440/'

OLD = "        const items = Array.isArray(o.items) ? o.items : [];"
NEW = (
    "        const items = Array.isArray(o.items) ? o.items\n"
    "            : ((this._factVersionState && Array.isArray(this._factVersionState.facts)) ? this._factVersionState.facts : []);"
)

src = io.open(TARGET, encoding='utf-8').read()
n = src.count(OLD)
if n == 0 and src.count(NEW) == 1:
    print('SKIP 出口取数(已修)')
    sys.exit(0)
if n != 1:
    sys.stderr.write('FAIL: 出口取数锚点命中 %d 次(应为 1)\n' % n)
    sys.exit(31)
os.makedirs(BAK, exist_ok=True)
io.open(BAK + 'index.js.pre3440fix', 'w', encoding='utf-8').write(src)
io.open(TARGET, 'w', encoding='utf-8').write(src.replace(OLD, NEW))
print('FIXED 宿主出口取数:opts.items 优先,缺省回落事实账 facts')