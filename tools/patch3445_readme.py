#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.345.0 抬版连带:README 读数同步(磁盘枚举:325 文件 / extra_js 110 / 运行时模块 111)。

纪律(与 tools/patch3440_readme.py 同款):
  · 锚点按**行号 + 纯 ASCII 子串**定位(本仓注释混用全角标点,字面锚易失配);
  · 每处命中数不符即 abort;落盘前整份备份;
  · LINES 列表式(不跨行拼接,避免漏 `+` 的语法脆性)。
"""
import io
import os
import sys

R = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3445/'
P = R + 'README.md'
src = io.open(P, encoding='utf-8').read()
orig = src
lines = src.split('\n')


def sub_line(idx, old, new, label, expect=1):
    i = idx - 1
    n = lines[i].count(old)
    if n != expect:
        sys.stderr.write('FAIL: %s 第 %d 行命中 %d 次(应 %d):%s\n' % (label, idx, n, expect, old))
        sys.exit(41)
    lines[i] = lines[i].replace(old, new)
    print('  ok %s 行 %d: %s -> %s' % (label, idx, old, new))


# 真源第 52 / 122 行用的是**全角括号 U+FF08 / U+FF09 与全角冒号 U+FF1A**
# (第 1 版用 ASCII 括号 ⇒ 命中 0 次,与 tools/patch3445_lock.py 同款坑)。故用 chr() 构造。
FW_L, FW_R, FW_COLON = chr(0xFF08), chr(0xFF09), chr(0xFF1A)
sub_line(6, '`3.344.0`', '`3.345.0`', 'D1 当前版本')
sub_line(8, '**324 个测试文件**', '**325 个测试文件**', 'D2 在役面')
sub_line(10, 'v3.344.0 **全量待验**', 'v3.345.0 **全量待验**', 'D6 待验标记')
sub_line(10, 'v3440 专项套件', 'v3445 专项套件', 'D6 陈旧专项名')
sub_line(47, '324 个测试文件', '325 个测试文件', 'D2b 命令注释')
sub_line(52, '`extra_js`' + FW_L + '109 项' + FW_R,
         '`extra_js`' + FW_L + '110 项' + FW_R, 'D3 分支行')
sub_line(61, 'extra_js 109', 'extra_js 110', 'D3 目录树')
sub_line(113, '324 个测试文件', '325 个测试文件', 'D2b 目录树')
sub_line(122, '**运行时模块**' + FW_COLON + '110 个',
         '**运行时模块**' + FW_COLON + '111 个', 'D4 运行时模块')
sub_line(122, '**109 项**', '**110 项**', 'D3 运行时模块行')
sub_line(123, '`extra_js` 109 项', '`extra_js` 110 项', 'D3 载入面')
sub_line(124, '324 个测试文件', '325 个测试文件', 'D2b 在役面')

src = '\n'.join(lines)
if src == orig:
    print('NO-OP')
    sys.exit(0)
os.makedirs(BAK, exist_ok=True)
io.open(BAK + 'README.pre3445.md', 'w', encoding='utf-8').write(orig)
io.open(P, 'w', encoding='utf-8').write(src)
print('PATCHED README.md')