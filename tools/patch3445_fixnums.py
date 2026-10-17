#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.345.0 数字订正:CHANGELOG 与 PLAN 中 memory-organs.js 的字节数 / 前态 md5
与真磁盘不符(文档不得说谎),按真读数改回。

真读数(本机实测,零手抄):
  3445 修补前(= /tmp/bak3445/memory-organs.js.pre3445,同时是 git HEAD 版)
      159916 字节 / md5 73ef59b97ea96080ae00765a566c79f5
  3445 修补后(工作区)
      163121 字节 / md5 fdd8332d4f67454c1773d924ea90ebe4
锚点一律纯 ASCII(数字串 / 十六进制串),避开全角标点字形差异。
"""
import io
import sys

CH = '/home/user/lonsha-memory-plugin/CHANGELOG.md'
PL = '/home/user/lonsha-memory-plugin/PLAN.md'
BAK = '/tmp/bak3445/'

FIXES = [
    (CH, '131378', '159916', 'C-前态字节'),
    (CH, '133556', '163121', 'C-后态字节'),
    (CH, '5f4313e12bb08fd916e81adc73dbe3fc', '73ef59b97ea96080ae00765a566c79f5', 'C-前态md5'),
    (PL, '131378', '159916', 'P-前态字节'),
    (PL, '133556', '163121', 'P-后态字节'),
]

texts = {}
bad = 0
for path, old, new, label in FIXES:
    if path not in texts:
        texts[path] = io.open(path, encoding='utf-8').read()
    n = texts[path].count(old)
    if n != 1:
        bad += 1
        print('FAIL: %s 命中 %d 次(应 1):%s' % (label, n, old))
        continue
    texts[path] = texts[path].replace(old, new)
    print('  ok %s: %s -> %s' % (label, old, new))

if bad:
    sys.exit(41)

import os
os.makedirs(BAK, exist_ok=True)
for path, text in texts.items():
    base = os.path.basename(path)
    io.open(BAK + base + '.pre3445nums', 'w', encoding='utf-8').write(
        io.open(path, encoding='utf-8').read())
    io.open(path, 'w', encoding='utf-8').write(text)
    print('PATCHED', base)

# 复验:旧串必须全消失,新串必须在场(逐文件)
for path in texts:
    t = io.open(path, encoding='utf-8').read()
    print('-- %s 旧串残留 131378=%d 133556=%d 旧md5=%d | 新读数在场 159916=%d 163121=%d' % (
        os.path.basename(path), t.count('131378'), t.count('133556'),
        t.count('5f4313e12bb08fd916e81adc73dbe3fc'), t.count('159916'), t.count('163121')))