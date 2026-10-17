#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.342.0 宿主刀**干跑**：把补丁脚本对着 index.js 的副本跑一遍，不碰真源。
用途：在落盘前把「锚点恰中一次」与「断言计数」全部验穿。
"""
import io
import os
import shutil
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
DRY = '/tmp/dry3420/'
if not os.path.isdir(DRY):
    os.makedirs(DRY)
shutil.copy(ROOT + 'index.js', DRY + 'index.js')
shutil.copy(ROOT + 'memory-organs.js', DRY + 'memory-organs.js')
src = io.open(ROOT + 'tools/patch3420_host.py', encoding='utf-8').read()
src2 = src.replace("ROOT = '/home/user/lonsha-memory-plugin/'", "ROOT = '/tmp/dry3420/'")
assert src2 != src, 'ROOT 替换未命中（脚本形态已变）'
g = {'__name__': '__dry__'}
try:
    exec(compile(src2, 'patch3420_host.py', 'exec'), g)
except AssertionError as e:
    print('DRY-FAIL:', e)
    sys.exit(3)
except SystemExit as e:
    print('DRY-EXIT:', e)
    sys.exit(4)
out = io.open(DRY + 'index.js', encoding='utf-8').read()
morg = io.open(DRY + 'memory-organs.js', encoding='utf-8').read()
print('org \'canonAdoption\'', morg.count("'canonAdoption'"))
print('DRY-OK')
print('dry lines', out.count('\n') + 1)
for pat in ["'canonAdoption'", '_canonAdoption =', 'storyCanonAdoptPlan(',
            'storyCanonAdoptConfirm(', 'storyCanonRevokeGuard(',
            'storyCanonAdoption(', 'storyCanonAdoptLine()']:
    print('%-28s %d' % (pat, out.count(pat)))
