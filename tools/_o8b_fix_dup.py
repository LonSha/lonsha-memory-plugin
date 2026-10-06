#!/usr/bin/env python3
"""修 _o8b_plan_stale.py 的幂等 bug 造成的重复行：删掉连续重复的那一行。

根因：脚本 SENTINEL 与 A_NEW 里的实际文本不一致（前者写「2026-10-04 之前的收尾轮」，
      实际插入文本同；但插入后 `src.count(A_ANCHOR)` 仍为 1 —— 因为 A_ANCHOR 是标题行，
      它本身没变，于是第二次跑又插了一遍，形成「标题行 + 两行相同标记」）。
教训（写进 CHANGELOG）：幂等判据必须是「替换后的产物是否已在场」，而不是「锚点是否还在」——
      追加型补丁的锚点在替换后**天然仍然存在**，用它当哨兵等于没有哨兵。

本脚本只做一件事：把连续两行完全相同的「陈旧节」标记压成一行。
幂等：只有一对重复时压缩；无重复则跳过。
"""
import sys
from pathlib import Path

PLAN = Path('/home/user/lonsha-memory-plugin/PLAN.md')
NEEDLE = '> **【陈旧节 · 勿当排序读】** 本节属 2026-10-04 之前的收尾轮'

lines = PLAN.read_text(encoding='utf-8').split('\n')
out = []
removed = 0
for i, ln in enumerate(lines):
    if (ln.startswith(NEEDLE) and out and out[-1] == ln):
        removed += 1
        continue
    out.append(ln)
if removed == 0:
    print('[fix-dup] 无重复行，跳过（幂等）')
    sys.exit(0)
PLAN.write_text('\n'.join(out), encoding='utf-8')
print('[fix-dup] 已删除 %d 行重复的陈旧标记' % removed)