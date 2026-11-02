#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.440.0 只剩 TODO 顶节（`tools/bump_v3440_docs.py` 在 TODO 处 abort）。

为什么第三支：`bump_v3440_docs.py` 的 TODO 定位写的是
`[i for i, l in enumerate(tlines) if l.startswith('> **最近更新：')]` 并要求**恰 1 处**，
而实测 TODO.md 里有 **22 行**以该串开头 —— 它们是各版抬版时留下的历史留痕（v3.355 / v3.341 …），
所以「最近更新」并不是全文件唯一键，**只有第一处是当版**。守卫写得比真源更严 ⇒ abort 是对的
（不静默改一半），但改成「取第一处」才是真源形态。

本脚本只改 TODO.md，做两件事：
  1) 第一处「最近更新」换成 v3.440.0 顶节；
  2) 把被换下的 v3.439.0 那一行降级为「上一版更新」，并把原「上一版更新（435~438）」降为「再前一版」
     —— 留痕不丢（本仓纪律：接手面要能顺读最近几版）。
"""
import sys

V_OLD = '3.439.0'
V_NEW = '3.440.0'
REPO = '/home/user/lonsha-memory-plugin/'

TODO_HEAD = """> **最近更新：v3.440.0**（**L13-X7 习惯与成长证据面**：把 `character-habit-growth-evidence.js` 从「登记在册但产品端零调用」接成可读面。两块账**分开存、分开报、不互相充抵** —— 习惯本体在 `worldProg.habitRepos`（`context+approach` 二元组、3 次 success 成形），成长证据束新建 `worldProg.growthBundles`（`habitKey=context|approach`）。写入口**不新开**：证迹由既有 `agencyContractAct('practice')` 分支顺带产出，返回值多一个 `evidence`（`recorded` / `skipped:<why>`）——本体与证迹必须由同一次动作产出，且证迹失败不回滚本体但必须如实报（静默漏记比漏记更坏）。读面同时给 `unproven`（成形待证）与 `orphan`（无主束）两组差额，各自单列 —— 并成一块就会让「形成了习惯」冒充「有据可查」。内核补 `habitKey` 透传 / `describeGrowth` 纯读摘要 / `STAGE_LABELS`+`STAGE_ORDER`（只答「最远到过哪阶段」，**不求和不加权**；本仓纪律：不把成长做成数值条）。面板 `protagonist` 视图新增「🌱 习惯与成长证据」三态分区（有据 / `empty` / `absent`，absent 明写「**不是『没有习惯』，是这个面没装上**」），**不走 `faceRead`**（抛错回落空数组会让「取数失败」与「模块缺席」同形）。★ 本版自己抓到的**内核真缺陷一处**：`evaluateCompetencyAfterRevocation` 返回 `validRecords` 而读面读 `records` ⇒ 撤回证据的产物进读面成了空束，把「绝不静默归零」破了个口（已补 `records: validRecords`）。★ 另修**负控制假绿第二形两处**与**判据自伤两处**（窗口起点错位 3589 字符、整块注释里的口径声明被当成数值条）。★ 判据 `tests/v3440_l13_x7_habit_growth.test.mjs` **7 条全绿**（A~F + G 当版锚，含三条真源码破坏 + 原版对照）；首跑 4 红全在判据侧与内核侧，产品行为面首跑即绿。★ 台账同版收口：`module_consumption_ledger` 按 R3 把该模块从 `allowed:0` 转 `allowed:1`（零消费 22 → 21）；`scan_module_consumption` / `scan_module_wiring` / `scan_ui_binding` / `scan_version_guard` 全通过；`host_beast_baseline` 由 `tools/rebind_host_beast_v3440.py` 抬到当版真读数（入口 11889 → 11906、成员 1246 → 1249、TOP40 42.0%；行上界**不抬**，12096 不动）。★ 同版补 `scan_ui_view_reach.mjs` 的 fail-closed 通道（`MIN_VIEWS = 20` + 三态自述 + 两条 exit 2），并整批复验历史 33 个红档 **33/33 全绿**。★ 边界：真机 ST 触摸 / 窄屏 / 刷新后加载**未执行**，全量回归**未跑**（按指令做完计划前不跑全量，读数登记仍停 v3.431.0、显式待验），`growthBundles` 只做导出/导入两向 + 畸形回落空账。**L13 进度**：X1 / X2 / X3 / **X7** 已交付，X4~X6 / X8~X9 待做。"""

REPO_ROOT = REPO
with open(REPO_ROOT + 'TODO.md', 'r', encoding='utf8') as f:
    td = f.read()

lines = td.split('\n')
hit = [i for i, l in enumerate(lines) if l.startswith('> **最近更新：')]
if not hit:
    sys.exit('[abort] TODO.md 缺「> **最近更新：」行')
# 取**第一处**（本仓该串不是全文件唯一键：历史留痕里有 22 处，只有第一处是当版）
k = hit[0]
if ('v' + V_OLD) not in lines[k]:
    sys.exit('[abort] TODO 第一处最近更新不是 v%s（实测：%r）' % (V_OLD, lines[k][:60]))
if ('v' + V_NEW) in lines[k]:
    sys.exit('[abort] TODO 第一处最近更新已是 v%s —— 拒绝重复插入' % V_NEW)

old_cur = '> **上一版更新：v%s**' % V_OLD + lines[k][len('> **最近更新：v%s**' % V_OLD):]
new_head = TODO_HEAD.strip('\n')
out = lines[:k] + [new_head, old_cur]

# 原来那条「上一版更新（v3.438.0 / …）」降级为「再前一版」，保持顺读链
rest = lines[k + 1:]
if rest and rest[0].startswith('> **上一版更新：v3.438.0'):
    rest[0] = '> **再前一版：v3.438.0' + rest[0][len('> **上一版更新：v3.438.0'):]
out += rest

with open(REPO_ROOT + 'TODO.md', 'w', encoding='utf8') as f:
    f.write('\n'.join(out))

print('TODO done: 顶节已按 v%s 收口（第一处命中行 %d；降级为上一版的是 v%s）' % (V_NEW, k + 1, V_OLD))
print('  首行:', out[1][:40])
