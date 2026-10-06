#!/usr/bin/env python3
"""v3.286.0 O8 第二刀修正：文档在役面读数随磁盘（+1 扫描器 / +1 测试档）+ CHANGELOG 顶节补 D9 两处声明。

三处真问题（抬版后实测，不是猜的）：
  ① 两个新扫描器进 `tests/audit/` 后，磁盘面变成 267 测试档 / 58 门禁 / 61 audit .mjs，
     而抬版脚本只按「新增 1 个测试档 + 1 个扫描器」写死了 266/57/60 —— 少算了一个扫描器
     （plan_currency 那个）。教训：文档读数不能按「本轮新增几件」手推，必须读磁盘真值。
  ② CHANGELOG 顶节缺 D9 要求的两处**可机械核对**的声明：
     「`tests/x.test.mjs`（N 条）」自述 与 「退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移」。
     这不是格式洁癖：D9 的存在理由就是「文档里的读数也要核回磁盘」，而顶节不写就无从核。
  ③ catalog 行里把 plan_currency 套件写成「13 个 test」，实际 12 个（自己数错）。
"""
import re
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
CHANGELOG = ROOT / 'CHANGELOG.md'
README = ROOT / 'README.md'
PLAN = ROOT / 'PLAN.md'
CATALOG = ROOT / 'tests' / 'audit' / 'catalog_reference_consumers.tsv'
MATRIX = ROOT / 'tests' / 'audit' / 'audit_scan_probe_matrix.tsv'
SENTINEL = 'O8 第二刀（成本口径）'

edits = []


def sub_once(path: Path, old: str, new: str, why: str):
    s = path.read_text(encoding='utf-8')
    n = s.count(old)
    if n != 1:
        sys.exit('[o8b-fix] %s 锚点命中 %d 次（要求恰 1 次）：%s' % (path.name, n, why))
    path.write_text(s.replace(old, new, 1), encoding='utf-8')
    edits.append((path.name, why))


def disk_counts():
    tests = len(list((ROOT / 'tests').glob('*.test.mjs')))
    aud_all = len(list((ROOT / 'tests' / 'audit').glob('*.mjs')))
    aud_gated = len([p for p in (ROOT / 'tests' / 'audit').glob('*.mjs') if not p.name.startswith('_')])
    return tests, aud_gated, aud_all


def main():
    tests, gated, aud_all = disk_counts()
    print('[o8b-fix] 磁盘真值：测试档 %d / 门禁 %d / audit .mjs %d' % (tests, gated, aud_all))
    if (tests, gated, aud_all) != (267, 58, 61):
        print('[WARN] 磁盘读数与预期不同，仍按真值写（这才是零手抄的做法）')

    # ── ① README 四处 + PLAN 一处：按磁盘真值改 ──
    sub_once(README, '当前发现 **266 个测试文件**', '当前发现 **%d 个测试文件**' % tests, 'README 在役面测试数')
    sub_once(README, '当前发现 **57/57** 审计脚本（`tests/audit/` 磁盘 **60** 个',
             '当前发现 **%d/%d** 审计脚本（`tests/audit/` 磁盘 **%d** 个' % (gated, gated, aud_all),
             'README 在役面审计数')
    sub_once(README, '# 全部用例：266 个测试文件', '# 全部用例：%d 个测试文件' % tests, 'README 用例说明')
    sub_once(README, '# 在役面：266 个测试文件 + 57 个审计脚本（磁盘 60，3 个 `_` 探针除外）',
             '# 在役面：%d 个测试文件 + %d 个审计脚本（磁盘 %d，3 个 `_` 探针除外）'
             % (tests, gated, aud_all), 'README 目录树')
    sub_once(README, '（`*.test.mjs`，即 `npm test` 的扫描面）/ `tests/audit/` 57 个审计脚本（磁盘 60，',
             '（`*.test.mjs`，即 `npm test` 的扫描面）/ `tests/audit/` %d 个审计脚本（磁盘 %d，'
             % (gated, aud_all), 'README 在役面小结')
    sub_once(PLAN, '| 门禁 | 在役面 **266 测试文件 / 57 个 audit 脚本**（磁盘 60）',
             '| 门禁 | 在役面 **%d 测试文件 / %d 个 audit 脚本**（磁盘 %d）' % (tests, gated, aud_all),
             'PLAN 门禁行')

    # ── ② CHANGELOG 顶节：补 D9 两处声明（自述条数 + 退出码三档） ──
    cl = CHANGELOG.read_text(encoding='utf-8')
    if SENTINEL in cl:
        print('[o8b-fix] CHANGELOG 已含该段（幂等）')
    else:
        anchor = '- **边界（诚实）**：① 扫描器**不自己跑测试**'
        if cl.count(anchor) != 1:
            sys.exit('[o8b-fix] CHANGELOG 边界锚点命中 %d 次' % cl.count(anchor))
        block = (
            '- **本刀两个交付档的自述读数**（D9 要求：文档里的「N 条」也要核回磁盘，'
            '故此处逐字给出路径与条数）：`tests/v3286_cost_truthfulness.test.mjs`（12 条）、'
            '`tests/v3286_plan_currency.test.mjs`（12 条）。\n'
            '  两个扫描器各自带配对判据套件：`tests/audit/scan_cost_truthfulness.mjs`（C1~C8）与 '
            '`tests/audit/scan_plan_currency.mjs`（P1~P7）。\n'
            '  退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移。\n'
            '\n')
        cl = cl.replace(anchor, block + anchor, 1)
        CHANGELOG.write_text(cl, encoding='utf-8')
        edits.append(('CHANGELOG.md', '顶节补 D9 两处声明（档自述条数 + 退出码三档）'))

    # ── ③ 矩阵表补一行 plan_currency（本轮 reg2 已加，此处仅兜底校验） ──
    mx = MATRIX.read_text(encoding='utf-8')
    if 'scan_plan_currency.mjs' not in mx:
        sys.exit('[o8b-fix] 矩阵表缺 scan_plan_currency.mjs 登记行 —— 应由 _o8b_reg2_bump.py 补，请先跑它')
    print('[o8b-fix] 矩阵表已含 plan_currency 行')

    # ── ④ catalog 行修正：plan_currency 套件是 12 条不是 13 条 ──
    cat = CATALOG.read_text(encoding='utf-8')
    if '计划陈旧口径门的成对套件（13 个 test）' in cat:
        CATALOG.write_text(cat.replace('计划陈旧口径门的成对套件（13 个 test）',
                                       '计划陈旧口径门的成对套件（12 个 test）', 1), encoding='utf-8')
        edits.append(('catalog_reference_consumers.tsv', 'plan_currency 套件条数 13→12（自述读数纠错）'))

    for name, why in edits:
        print('[o8b-fix] %-34s %s' % (name, why))
    print('[o8b-fix] 完成：%d 处' % len(edits))
    return 0


if __name__ == '__main__':
    sys.exit(main())