#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.343.0 M4-X5 内核刀:由 tools/frag3430/ 的六个片段**重建** testimony-board.js。
口径:
  · 片段是**唯一真源**(不在本脚本里重打一个字);
  · 重建后与现有产物逐字节对比,一致则不改写(幂等);
  · 不一致则以片段为准落盘并打印差异读数(不静默改写)。
用法:python3 tools/build3430_kernel.py [--check]
"""
import io
import os
import sys
import hashlib
ROOT = '/home/user/lonsha-memory-plugin/'
FRAG = ROOT + 'tools/frag3430/'
TARGET = ROOT + 'testimony-board.js'
PARTS = ['part_a.js', 'part_b.frag', 'part_c.js', 'part_d.js', 'part_e.js', 'part_f.frag']
missing = [p for p in PARTS if not os.path.isfile(FRAG + p)]
if missing:
    sys.stderr.write('FAIL: 缺片段 %s\n' % ','.join(missing))
    sys.exit(1)
buf = ''.join(io.open(FRAG + p, encoding='utf-8').read() for p in PARTS)
md5 = hashlib.md5(buf.encode('utf-8')).hexdigest()
cur = io.open(TARGET, encoding='utf-8').read() if os.path.isfile(TARGET) else None
if cur == buf:
    print('IN-SYNC testimony-board.js (%d bytes, md5 %s)' % (len(buf), md5))
    sys.exit(0)
if '--check' in sys.argv:
    sys.stderr.write('FAIL: 产物与片段不一致(check 模式不写盘)\n')
    sys.exit(1)
if cur is not None:
    b = '/tmp/bak3430/'
    os.makedirs(b, exist_ok=True)
    io.open(b + 'testimony-board.js.pre3430', 'w', encoding='utf-8').write(cur)
io.open(TARGET, 'w', encoding='utf-8').write(buf)
print('REBUILT testimony-board.js: %d -> %d bytes (md5 %s)' % (len(cur or ''), len(buf), md5))
# 语法门(v3.343.0 教训:产物必须当场可解析)
import subprocess
r = subprocess.run(['node', '--check', TARGET], capture_output=True, text=True, timeout=60)
if r.returncode != 0:
    sys.stderr.write('FAIL: node --check: ' + r.stderr[-400:])
    sys.exit(1)
print('node --check OK')
