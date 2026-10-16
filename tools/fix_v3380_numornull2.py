#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.338.0 修正二：`_correctionOwners().fact` 被以 `owners.fact(it)` 调用，
方法内的 `this` 是 **owners 对象**而非引擎 —— `this._numOrNull` 会是 undefined ⇒ TypeError。
必须走闭包里的 `self`（= 引擎）。

同步：① index.js；② 补丁脚本 patch_v3380_host.py。
"""
import ast
import io
import sys

OLD = "const fl = this._numOrNull((it && it.floor !== undefined) ? it.floor : (it && it.entry && it.entry.floor));"
NEW = "const fl = self._numOrNull((it && it.floor !== undefined) ? it.floor : (it && it.entry && it.entry.floor));"

idx = 'index.js'
src = io.open(idx, encoding='utf-8').read()
if NEW in src and OLD not in src:
    print('index.js already fixed')
else:
    c = src.count(OLD)
    if c != 1:
        sys.stderr.write('index.js count=%d (\u987b\u6070 1)\n' % c)
        sys.exit(1)
    src = src.replace(OLD, NEW, 1)
    io.open(idx, 'w', encoding='utf-8').write(src)
    print('OK index.js -> self._numOrNull')

f = 'tools/patch_v3380_host.py'
t = io.open(f, encoding='utf-8').read()
if NEW in t and OLD not in t:
    print('%s already fixed' % f)
else:
    n = t.count(OLD)
    if n != 1:
        sys.stderr.write('%s count=%d (\u987b\u6070 1)\n' % (f, n))
        sys.exit(1)
    t = t.replace(OLD, NEW, 1)
    ast.parse(t)
    io.open(f, 'w', encoding='utf-8').write(t)
    print('OK %s -> self._numOrNull' % f)
