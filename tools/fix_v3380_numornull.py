#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.338.0 修正：宿主补丁里用了旧判据 `Number.isFinite(Number(it.floor))`，
本仓 v3.239.0 起检查点/事实面一律走 `_numOrNull`（E1 单真源判据）。

两处同步：① 已落盘的 index.js；② 补丁脚本 patch_v3380_host.py（否则重建即回退）。
"""
import ast
import io
import sys

OLD = "const fl = (it && Number.isFinite(Number(it.floor))) ? Number(it.floor) : null;"
NEW = "const fl = this._numOrNull((it && it.floor !== undefined) ? it.floor : (it && it.entry && it.entry.floor));"

idx = 'index.js'
src = io.open(idx, encoding='utf-8').read()
c = src.count(OLD)
if c == 0 and NEW in src:
    print('index.js already fixed')
else:
    if c != 1:
        sys.stderr.write('index.js old-judgement count=%d (\u987b\u6070 1)\n' % c)
        sys.exit(1)
    src = src.replace(OLD, NEW, 1)
    io.open(idx, 'w', encoding='utf-8').write(src)
    print('OK index.js fixed')

# 补丁脚本侧：把旧判据换成走真源口（脚本是唯一真源，不改则重建回退）
for f in ('tools/patch_v3380_host.py',):
    t = io.open(f, encoding='utf-8').read()
    if NEW in t:
        print('%s already fixed' % f)
        continue
    n = t.count(OLD)
    if n != 1:
        sys.stderr.write('%s old-judgement count=%d (\u987b\u6070 1)\n' % (f, n))
        sys.exit(1)
    t = t.replace(OLD, NEW, 1)
    ast.parse(t)
    io.open(f, 'w', encoding='utf-8').write(t)
    print('OK %s fixed' % f)
