#!/usr/bin/env python3
"""v3.286.0 O8 第二刀：让 tools/_rebind_test_cost.py 支持 LONSHA_AUDIT_ROOT。

为什么必须（本仓既有口径，非新引入）：
  tests/v3285 的 J 段用 `LONSHA_AUDIT_ROOT=<夹具>` 驱动 _rebind_doc_readings.py，
  在不碰真仓的前提下验「不合用摘要各自 exit 1 且从不落盘」。
  本刀的重绑工具首版把 ROOT 写死，于是它的 fail-closed 只能靠「真跑真仓」来验 ——
  那正是本刀要避免的事（写坏登记 = 污染唯一权威读数）。
  故与姊妹工具同形：默认真仓，env 可改根。

幂等：哨兵已在场则跳过。
"""
import sys
from pathlib import Path

ROOT_REPO = Path('/home/user/lonsha-memory-plugin')
TOOL = ROOT_REPO / 'tools' / '_rebind_test_cost.py'
SENTINEL = 'LONSHA_AUDIT_ROOT'

A_ANCHOR = "ROOT = Path('/home/user/lonsha-memory-plugin')\n"

A_NEW = (
    "# 根可改（同姊妹工具 _rebind_doc_readings.py 口径）：判据套件靠它在不碰真仓的前提下\n"
    "# 验本工具的 fail-closed —— 否则「拒绝落盘」这件事本身就无从安全测试。\n"
    "ROOT = Path(os.environ.get('LONSHA_AUDIT_ROOT') or '/home/user/lonsha-memory-plugin')\n"
)

src = TOOL.read_text(encoding='utf-8')
if SENTINEL in src:
    print('[o8b-tool] 哨兵已在场（%s）⇒ 已应用过，跳过（幂等）' % SENTINEL)
    sys.exit(0)
n = src.count(A_ANCHOR)
if n != 1:
    print('[FATAL] 锚点命中 %d 次（必须恰 1 次），不写盘' % n)
    sys.exit(1)
src = src.replace(A_ANCHOR, A_NEW, 1)
# 补 import os（原文件未导入）
IMP_ANCHOR = 'import json\nimport sys\n'
if src.count(IMP_ANCHOR) != 1:
    print('[FATAL] import 锚点命中 %d 次，不写盘' % src.count(IMP_ANCHOR))
    sys.exit(1)
src = src.replace(IMP_ANCHOR, 'import json\nimport os\nimport sys\n', 1)
TOOL.write_text(src, encoding='utf-8')
print('[o8b-tool] 重绑工具已支持 LONSHA_AUDIT_ROOT（默认仍为真仓）')