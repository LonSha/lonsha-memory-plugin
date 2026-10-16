#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.338.0 补丁脚本守卫收尾。

① host 脚本：守卫标记 'correctionSourceFacts' 换成自身标记 '_correctionOwners'。
   原标记是 ui 脚本宿主段插入的内容，单独重跑 host 脚本时守不住。
② ui 脚本：宿主段补守卫（此前缺），重复执行会把数据源出口插成两份。
"""
import ast
import io
import sys

H = 'tools/patch_v3380_host.py'
h = io.open(H, encoding='utf-8').read()
o1 = "if 'correctionSourceFacts' in src:"
n1 = "if '_correctionOwners' in src:"
if n1 in h:
    print('HOST guard already self-owned')
else:
    c = h.count(o1)
    if c != 1:
        sys.stderr.write('HOST guard line count=%d\n' % c)
        sys.exit(1)
    h = h.replace(o1, n1, 1)
    ast.parse(h)
    io.open(H, 'w', encoding='utf-8').write(h)
    print('OK host guard -> _correctionOwners')

U = 'tools/patch_v3380_ui.py'
txt = io.open(U, encoding='utf-8').read()
if "if 'correctionSourceFacts' not in src:" in txt:
    print('UI host-section guard already present')
else:
    lines = txt.split('\n')
    i0 = i1 = None
    for i, l in enumerate(lines):
        if i0 is None and l == 'n = src.count(ANCHOR)':
            i0 = i
        if i0 is not None and i1 is None and l.startswith("print('OK host data-source patched')"):
            i1 = i
    if i0 is None or i1 is None:
        sys.stderr.write('UI host-section not found\n')
        sys.exit(1)
    block = lines[i0:i1 + 1]
    if len(block) != 6 or block[0] != 'n = src.count(ANCHOR)' or block[1] != 'if n != 1:':
        sys.stderr.write('UI host-section shape unexpected: %r\n' % (block,))
        sys.exit(1)
    body = ['    ' + b if b.strip() else b for b in block]
    lines[i0:i1 + 1] = ["if 'correctionSourceFacts' not in src:"] + body + [
        'else:',
        "    print('host data-source already patched (idempotent skip)')",
    ]
    txt = '\n'.join(lines)
    ast.parse(txt)
    io.open(U, 'w', encoding='utf-8').write(txt)
    print('OK ui host-section guarded')
