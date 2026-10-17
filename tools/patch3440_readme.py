#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.344.0 抬版连带:README 读数同步(磁盘枚举:324 文件 / extra_js 109 / 运行时模块 110)。

纪律:锚点按**行号 + ASCII 子串**定位(本仓注释混用全角标点,字面锚易失配);
     每处命中数不符即 abort;落盘前整份备份。
"""
import io
import os
import sys

R = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3440/'
P = R + 'README.md'
src = io.open(P, encoding='utf-8').read()
orig = src
lines = src.split('\n')


def sub_line(idx, old, new, label, expect=1):
    """行内子串替换(下标从 1 起),命中数必须等于 expect。"""
    i = idx - 1
    n = lines[i].count(old)
    if n != expect:
        sys.stderr.write('FAIL: %s 第 %d 行「%s」命中 %d 次(应 %d)\n' % (label, idx, old, n, expect))
        sys.exit(41)
    lines[i] = lines[i].replace(old, new)
    print('  ok %s 行 %d: %s -> %s' % (label, idx, old, new))


sub_line(6, '`3.343.0`', '`3.344.0`', 'D1 当前版本')
sub_line(8, '**323 个测试文件**', '**324 个测试文件**', 'D2 在役面')
sub_line(10, '当前版本 v3.343.0 **全量待验**', '当前版本 v3.344.0 **全量待验**', 'D6 待验标记')
# 本仓正文用的全角括号是 U+FF08 / U+FF09 —— 字面写全角会被编辑器规范化,改用 chr() 构造。
FW_L, FW_R = chr(0xFF08), chr(0xFF09)
FW_C, FW_COLON = chr(0xFF0C), chr(0xFF1A)
sub_line(10,
         '已实跑一次全量' + FW_L + '323 文件 · 3748 断言 ·' + FW_R + '但**读数未登记**',
         '实施期已跑定向门禁与 v3440 专项套件;全量**读数未登记**', 'D6 陈旧读数')
sub_line(47, '323 个测试文件', '324 个测试文件', 'D2b 命令注释')
sub_line(52, '`extra_js`' + FW_L + '108 项' + FW_R,
         '`extra_js`' + FW_L + '109 项' + FW_R, 'D3 分支行')
sub_line(61, 'extra_js 108', 'extra_js 109', 'D3 目录树')
sub_line(113, '323 个测试文件', '324 个测试文件', 'D2b 目录树')
sub_line(122, '**运行时模块**' + FW_COLON + '109 个',
         '**运行时模块**' + FW_COLON + '110 个', 'D4 运行时模块')
sub_line(122, '**108 项**', '**109 项**', 'D3 运行时模块行')
sub_line(123, '`extra_js` 108 项', '`extra_js` 109 项', 'D3 载入面')
sub_line(124, '323 个测试文件', '324 个测试文件', 'D2b 在役面')

src = '\n'.join(lines)
if src == orig:
    print('NO-OP')
    sys.exit(0)
os.makedirs(BAK, exist_ok=True)
io.open(BAK + 'README.pre3440.md', 'w', encoding='utf-8').write(orig)
io.open(P, 'w', encoding='utf-8').write(src)
print('PATCHED README.md')