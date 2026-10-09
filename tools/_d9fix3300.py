#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.300.0 补丁：CHANGELOG 当前节补「退出码三档」声明（scan_doc_truthfulness D9 要求）。"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
p = ROOT / 'CHANGELOG.md'
s = p.read_text(encoding='utf-8')
anchor = '- **抬版连带**：版本六处 / 测试文件 280 → 281 / v3209 数量锁（项数仍 87，补版本出处）/'
n = s.count(anchor)
if n != 1:
    sys.exit('[d9fix] 锚点命中 %d 次（要求恰 1 次）' % n)
add = ('- **退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移**；本版读数均为**定向复验**'
       '（单套件 + 单扫描器），**绝不跑全量**。\n')
if '退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移**；本版读数均为**定向复验**（单套件 + 单扫描器）' in s.split('## v3.299.0')[0]:
    sys.exit('[d9fix] 本版节已含该声明（重复执行）')
s = s.replace(anchor, add + anchor, 1)
p.write_text(s, encoding='utf-8')
print('[d9fix] 完成：CHANGELOG v3.300.0 节补退出码三档声明')