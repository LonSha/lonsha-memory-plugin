#!/usr/bin/env python3
"""v3.286.0 O8 第二刀：统一 scan_cost_truthfulness.mjs 的 C7 系列 drift 归因措辞。

为什么：本仓口径是「结构漂移必须如实 exit 2 **并说清为什么**」。
  首版的五条 C7 结构性 drift 里，只有两条带「结构漂移」字样，另三条
  （登记缺失 / 非法 JSON / 顶层非对象 / 缺 latest / 缺 rebinds）只说「拒绝给结论」——
  实测后果：判据套件按统一措辞断言「结构漂移」时，这三条被误判成没给归因（假红）。
  修法不是放宽断言，而是**统一归因措辞**（写入侧一致 > 读取侧宽容）。

幂等：哨兵已在场则跳过。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
SCAN = ROOT / 'tests' / 'audit' / 'scan_cost_truthfulness.mjs'
SENTINEL = '读数不存在，拒绝给结论（结构漂移）'

PAIRS = [
    ("drift('缺少测试成本读数登记 tests/audit/test_cost_readings.json ⇒ 读数不存在，拒绝给结论')",
     "drift('缺少测试成本读数登记 tests/audit/test_cost_readings.json ⇒ 读数不存在，拒绝给结论（结构漂移）')"),
    ("drift('成本读数登记非法 JSON：' + String(e && e.message))",
     "drift('成本读数登记非法 JSON：' + String(e && e.message) + '（结构漂移）')"),
    ("drift('成本读数登记顶层不是对象')",
     "drift('成本读数登记顶层不是对象（结构漂移）')"),
    ("drift('登记缺 latest 段 ⇒ 没有可比对的读数')",
     "drift('登记缺 latest 段 ⇒ 没有可比对的读数（结构漂移）')"),
    ("drift('登记缺 rebinds[] 历史留痕 ⇒ 无法核「只追加」口径')",
     "drift('登记缺 rebinds[] 历史留痕 ⇒ 无法核「只追加」口径（结构漂移）')"),
]

src = SCAN.read_text(encoding='utf-8')
if SENTINEL in src:
    print('[o8b-msg] 哨兵已在场 ⇒ 已应用过，跳过（幂等）')
    sys.exit(0)
for i, (old, new) in enumerate(PAIRS):
    n = src.count(old)
    if n != 1:
        print('[FATAL] 锚点 #%d 命中 %d 次（必须恰 1 次），不写盘' % (i, n))
        sys.exit(1)
    src = src.replace(old, new, 1)
SCAN.write_text(src, encoding='utf-8')
print('[o8b-msg] 五条 C7 结构性 drift 归因已统一带「结构漂移」')