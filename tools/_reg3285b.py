#!/usr/bin/env python3
"""v3.285.0 第三处登记面：新扫描器登记进 audit_scan_probe_matrix.tsv（v3226 B1 双向齐全）。

为什么必须登记：tests/v3226_audit_sensitivity.test.mjs 的 J1 判据要求
「在役扫描器集合 == 表内登记集合」双向齐全，新增扫描器不登记 ⇒ 该套件转红。
本轮实测该套件正是红的（新 scan_doc_truthfulness.mjs 未登记）。

三个读数**实测**（镜像整仓 + 三档形态，见 tools/ 外的临时驱动）：
  H = 0  健康树上通过（不得误红）
  G = 2  根目录 .js 全删 ⇒ 缺 index.js ⇒ 结构漂移 exit 2（如实报「无法核对」而非通过）
  T = 0  tests/ 掏空 ⇒ 本门禁不读 tests/ 的测试面，如实记 0（不冒充敏感）
G 列非 0 ⇒ 不是恒绿探测器（满足 J3）。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
TABLE = ROOT / 'tests' / 'audit' / 'audit_scan_probe_matrix.tsv'

ANCHOR = 'scan_ui_runtime.mjs\t0\t2\t0\t读 settings-ui.js 面'
ROW = (
    'scan_doc_truthfulness.mjs\t0\t2\t0\t'
    '读根 .js 面（入口不在场即阻断：缺 index.js ⇒ 无 VERSION 真源 ⇒ exit 2）；'
    'T 档对它无影响（本门禁量的是「文档读数 ↔ 磁盘」与「文档 ↔ 登记」两个面，'
    '不读 tests/ 下的测试体），故如实记 0 —— G 列已非 0，非恒绿探测器\n'
)

src = TABLE.read_text(encoding='utf-8')
n = src.count(ANCHOR)
if n != 1:
    print('[FATAL] 锚点在 %s 命中 %d 次（必须恰 1 次），不写盘' % (TABLE.name, n))
    sys.exit(1)
lines = src.split('\n')
# 追加到表末（J1 判据按排序比较，不看顺序；表末追加最不易破坏既有行）
assert lines[-1] == '', '表尾应为空行（实为 %r）' % lines[-1]
lines.insert(len(lines) - 1, ROW.rstrip('\n'))
TABLE.write_text('\n'.join(lines), encoding='utf-8')
print('[reg3285b] 已登记 scan_doc_truthfulness.mjs（H=0 / G=2 / T=0）')