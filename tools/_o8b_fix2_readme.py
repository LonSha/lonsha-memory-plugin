#!/usr/bin/env python3
"""v3.286.0 O8 第二刀修正二：README 版本行抬版 + 在役面小结行同改。

两处残留（文档门实测）：
  ① README 第 6 行「**当前版本**：`3.285.0`」未随抬版同改 —— _bump3286.py 漏了这条
     （v3.285.0 那轮是手工改的）。教训：抬版脚本的「四源」在本仓实际是**五源**
     （README 的当前版本行也是被 scan_doc_truthfulness D1 硬校验的一处）。
  ② README 第 121 行「`tests/` 266 个测试文件」形态与 _o8b_fix_docs 匹配的锚点不同
     （该锚点跨了「/ `tests/audit/`」，而这一行没有那一段）⇒ 未被替换。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
README = ROOT / 'README.md'
edits = []


def sub_once(old: str, new: str, why: str):
    s = README.read_text(encoding='utf-8')
    n = s.count(old)
    if n != 1:
        sys.exit('[o8b-fix2] %s 锚点命中 %d 次（要求恰 1 次）' % (why, n))
    README.write_text(s.replace(old, new, 1), encoding='utf-8')
    edits.append(why)


tests = len(list((ROOT / 'tests').glob('*.test.mjs')))
sub_once('**当前版本**：`3.285.0`', '**当前版本**：`3.286.0`', 'README 当前版本行（抬版第五源）')
sub_once('**在役面**（磁盘枚举，不代表已实跑）：`tests/` 266 个测试文件',
         '**在役面**（磁盘枚举，不代表已实跑）：`tests/` %d 个测试文件' % tests,
         'README 在役面小结行的测试数')

for w in edits:
    print('[o8b-fix2] %s' % w)
print('[o8b-fix2] 完成：%d 处' % len(edits))