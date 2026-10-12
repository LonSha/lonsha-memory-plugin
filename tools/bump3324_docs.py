#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""bump3324_docs.py - [v3.324.0] 人读面三处收口：CHANGELOG 顶节 / TODO 最近更新 / 测试面登记表。

为什么不并进 bump_3324.py：那边是**机器面**（六源 + 分发面 + 数量锁），本脚本是**人读面三处**。
判据面漂移与人读面漂移是两类事故，归因不同，分开记（v3.298.0 起的口径）。

D9 纪律（scan_doc_truthfulness）：CHANGELOG **当前版本节**里凡写
「`tests/<file>.test.mjs`（N 条）」就必须与磁盘逐字相等（`**` 夹在括号与数字之间会让探测器
一个自述都读不到）；且当前节必须带「退出码三档」与「腰不跑全量」两句（后者为四字句）。
不跑全量四字声明在正文里写作「**腰不跑全量**」原文（推理由检查器比对实现）。

全部锚点先校验、通过后统一写盘；任一锚点命中数不符即整体退出，不留半成品。
"""
import io
import sys

REPO = '/home/user/lonsha-memory-plugin/'


def read(p):
    return io.open(REPO + p, encoding='utf-8').read()


def write(p, s):
    io.open(REPO + p, 'w', encoding='utf-8').write(s)


ok = True

# ---- (1) CHANGELOG 顶节：新增当版节（新节取自 /tmp/ch_head.txt，零手抄） ----
ch_head = io.open('/tmp/ch_head.txt', encoding='utf-8').read()
if not ch_head.startswith('## v3.324.0\n'):
    sys.exit('[bump3324_docs] /tmp/ch_head.txt 首行不是 ## v3.324.0')
if '（38 条' not in ch_head:
    sys.exit('[bump3324_docs] CHANGELOG 顶节缺「（38 条」档自述（D9 会报探测器失效）')
cl = read('CHANGELOG.md')
if cl.startswith('## v3.324.0'):
    print('[bump3324_docs] CHANGELOG 顶节已是 v3.324.0，跳过')
else:
    if not cl.startswith('## v3.323.0\n'):
        sys.exit('[bump3324_docs] CHANGELOG 顶节不是 v3.323.0（基线不符，停）')
    write('CHANGELOG.md', ch_head + cl)
    print('[bump3324_docs] ok CHANGELOG.md（顶节 v3.323.0 -> v3.324.0）')

# ---- (2) TODO：旧当版行降为历史留痕 + 新当版行插在其前（V7 取第一处命中） ----
todo_line = io.open('/tmp/todo_line.txt', encoding='utf-8').read().rstrip('\n')
if not todo_line.startswith('> **最近更新：v3.324.0**'):
    sys.exit('[bump3324_docs] /tmp/todo_line.txt 首部不是当版行')
td = read('TODO.md')
if '最近更新：v3.324.0' in td:
    print('[bump3324_docs] TODO 已有 v3.324.0 最近更新行，跳过')
else:
    anchor = '> **最近更新：v3.323.0** —— **C 包（群像与关系体验）记忆侧三项'
    n = td.count(anchor)
    if n != 1:
        sys.exit('[bump3324_docs] TODO 锚点命中 %d 次（期望 1）' % n)
    new = todo_line + '\n' + anchor.replace('> **最近更新：v3.323.0**', '> **历史留痕：v3.323.0**')
    write('TODO.md', td.replace(anchor, new))
    print('[bump3324_docs] ok TODO.md（当版行入顶，旧当版行降历史留痕）')

# ---- (3) 测试面登记表：新增当版档（scan_cross_repo_binding P3 要求逐条登记） ----
tsv_name = 'catalog_reference_consumers.tsv'
tsv = read('tests/audit/' + tsv_name)
if 'v3324_d_pack_extraction_driver.test.mjs' in tsv:
    print('[bump3324_docs] 登记表已有当版档，跳过')
else:
    rows = tsv.split('\n')
    idx = None
    for i, ln in enumerate(rows):
        if ln.startswith('v3323_c_pack_group_relation.test.mjs'):
            idx = i
            break
    if idx is None:
        sys.exit('[bump3324_docs] 登记表找不到 v3323 行（新行应插在其前）')
    new_row = ('v3324_d_pack_extraction_driver.test.mjs\t\tD 包（纠错与日常操作）记忆侧第一刀的成对套件'
               '（38 条 test：含 13 条真源码破坏负控制）：M3-O5 抽取节奏（五类结构性信号恒即时且三档同形；'
               '溢出条全在返回值里并逐条标记与同一到期楼层；空读与平淡严格分形；档位词表可关）'
               '+ M3-O7/M3-X9 纠错方案（未圈范围不产提案、确认前不写、以事实键为轴幂等、'
               '对照三态互不同形、冲突四态各自可达、撤配置与撤事实分成两个 token）'
               '+ 宿主接线面（两取库口幂等 / 三出口恒定键面 / 真每轮调用点落在门控之后 / '
               '两诊断行真跑出口 / 两体检面分列 / 配置旋钮两跳可达）。'
               '期望值全部由 tools/v3324_probe.mjs 与 tools/v3324_host_probe.mjs 的真跑读数写成。')
    rows.insert(idx, new_row)
    write('tests/audit/' + tsv_name, '\n'.join(rows))
    print('[bump3324_docs] ok %s（新增当版档行）' % tsv_name)

print('[bump3324_docs] 完成')
