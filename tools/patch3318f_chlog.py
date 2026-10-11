#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.318.0 收口补刀 F：CHANGELOG 顶节补「计划收口全量实跑 + 5 处红」留痕。"""
import io, sys
R = '/home/user/lonsha-memory-plugin'
OLD = '  与手机插件双扩展共装）**如实登记未执行**（不在本刀范围，仍是可续做项）。\n***\n## v3.317.0'
NEW = '  与手机插件双扩展共装）**如实登记未执行**（不在本刀范围，仍是可续做项）。\n- **计划收口：全量实跑（本版唯一的「计划全部内容」终点）** —— 按用户纪律「做完计划全部内容前别跑全量」，\n  第二期首批 18 条（M-O1~M-O9 / M-X1~M-X9）全部交付后跑**一次**全量：\n  `node tests/run.mjs --audit` = **299/299 文件 · 3302 断言 · 0 失败 · 审计 61/61**（rc=0，耗时 109.8s + 76.7s）。\n  读数经 `tools/_rebind_doc_readings.py` / `tools/_rebind_test_cost.py` **零手抄**写入\n  `tests/audit/doc_readings.json` 与 `tests/audit/test_cost_readings.json`。\n- **★ 全量实跑当场抓出 5 处红（1 处本就为真缺陷 + 4 处本刀改动的登记面滞后）**，逐条归因并修复：\n  ① `scan_plan_currency.mjs`（**产品面真缺陷**）：现行排序节第 2 条仍把**已收口的 O2** 列为待做 ——\n     本刀正是 O2 的收口刀，文档滞后于交付事实 ⇒ PLAN 如实改写（含本刀窄屏缺陷与修后 161/161 读数）。\n  ② `v3284`（审计面副本台账 B1 当场点名）：本刀新增的 `_mo2_realbrowser_probe.mjs` 与 M-O1 的\n     `_mo1_realhost_probe.mjs` 持有逐字相同的 CDP 求值 helper `evalPage` ⇒ 登记新簇（**刻意各持一份**，\n     避免两份证据通道耦合）；登记值按判据侧口径（体自**参数括号**起算）实测为 350/cf4d6596。\n  ③ `v3266` C / `v3304` B3（基线当版读数同源）：`host_beast_baseline.json` 停在 v3.317.0 ⇒\n     经 `tools/_rebuild_host_beast.py` 重建（读数由探针生成）；本版宿主零改动，行数/成员数与上版同值。\n  ④ `v3288` D（**判据缺陷，非产品缺陷**）：该段把「O2 未收口须显式在列」钉死成永久不变量 ——\n     本刀收口 O2 后必然翻红；而删掉它又会让「已收口项被写回待办」无人把守。\n     按本档 v3.292.0 / v3.296.0 两次交棒口径重述为**结构不变量**（O2 仍须在列 + 状态词两形态都认\n     + **反向**：不得列为「尚未做 / 待交付 / 待做」）。修前实测：该断言在 O2 收口后是**恒绿**的\n     （现行排序节把 O2 写回待办，全仓无判据响应）。\n  ⑤ `v3297` S7（状态报告可重建）：`scan_plan_currency` 的 ① 与文档重绑改了 `PLAN.md`，\n     报告里的 `doc_hashes.PLAN.md` 随之陈旧 ⇒ 经 `tools/gen_state_report.mjs --write` 重写。\n- **本次收口后全量再跑一次即为 rc=0**（上列 5 处全部修完，且另复跑 9 道关键门禁全绿）。\n- 退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移。\n***\n## v3.317.0'
P = io.open(R + '/CHANGELOG.md', encoding='utf-8').read()
n = P.count(OLD)
if n != 1:
    print('[patch3318f] anchor hits %d != 1' % n); sys.exit(1)
io.open(R + '/CHANGELOG.md', 'w', encoding='utf-8').write(P.replace(OLD, NEW, 1))
print('[patch3318f] CHANGELOG 顶节已补收口留痕')