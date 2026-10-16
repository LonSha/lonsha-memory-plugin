#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""给 v3.338.0 的两个补丁脚本加幂等守卫。

问题：patch_v3380_host.py / patch_v3380_ui.py 都用 NEW = ANCHOR + 插入块
（锚点被保留在 NEW 里），因此脚本不可重复执行——第二次跑会把整块再插一遍。

修法：替换前加标记探测，已打过就 exit 0，不落第二次。
"""
import ast
import io
import sys

HOST = 'tools/patch_v3380_host.py'
UI = 'tools/patch_v3380_ui.py'


def patch_host():
    src = io.open(HOST, encoding='utf-8').read()
    old = "n = src.count(ANCHOR)\nif n != 1:\n"
    new = ("if 'correctionSourceFacts' in src:\n"
           "    print('host already patched (idempotent skip)')\n"
           "    sys.exit(0)\n"
           "n = src.count(ANCHOR)\nif n != 1:\n")
    if 'host already patched' in src:
        print('HOST script already guarded')
        return
    if src.count(old) != 1:
        sys.stderr.write('HOST guard anchor count=%d\n' % src.count(old))
        sys.exit(1)
    src = src.replace(old, new, 1)
    ast.parse(src)
    io.open(HOST, 'w', encoding='utf-8').write(src)
    print('OK host script guarded')


def patch_ui():
    src = io.open(UI, encoding='utf-8').read()
    old = "un = usrc.count(UANCHOR)\nif un != 1:\n"
    new = ("if \"_memoryCenterHandlers['row.detail']\" in usrc:\n"
           "    print('ui already patched (idempotent skip)')\n"
           "    sys.exit(0)\n"
           "un = usrc.count(UANCHOR)\nif un != 1:\n")
    if 'ui already patched' in src:
        print('UI script already guarded')
        return
    if src.count(old) != 1:
        sys.stderr.write('UI guard anchor count=%d\n' % src.count(old))
        sys.exit(1)
    src = src.replace(old, new, 1)
    ast.parse(src)
    io.open(UI, 'w', encoding='utf-8').write(src)
    print('OK ui script guarded')


if __name__ == '__main__':
    patch_host()
    patch_ui()
