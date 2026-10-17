#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.345.0 PLAN 同步:进度行 / 状态行 / 勾选表 / 基线表 / 体量行 / 现行排序节。

锚点纪律(承接 tools/patch3440_plan.py 的三条):
  1 全角标点一律 \\uXXXX 转义(字面全角会被编辑器规范化,锚点即失配);
  2 其余锚点取**无标点**片段(编号 / 词串 / 版本号);
  3 每处替换前 count 须恰 1,否则 abort(退出码 41)。
★ 本脚本用 LINES 列表式改整行,不用跨行 `+` 拼接(避免漏 `+` 的语法脆性)。
"""
import io
import os
import sys

P = '/home/user/lonsha-memory-plugin/PLAN.md'
BAK = '/tmp/bak3445/'
orig = io.open(P, encoding='utf-8').read()
lines = orig.split('\n')
FW_L = '\uff08'
FW_R = '\uff09'
FW_C = '\uff0c'
FW_T = '\uff5e'


def sub(idx, old, new, label, expect=1):
    n = lines[idx - 1].count(old)
    if n != expect:
        sys.stderr.write('FAIL: %s 第 %d 行命中 %d 次(应 %d):%s\n' % (label, idx, n, expect, old))
        sys.exit(41)
    lines[idx - 1] = lines[idx - 1].replace(old, new)
    print('  ok %s 行 %d: %s -> %s' % (label, idx, old, new))


# ---------- 行 3 文首执行进度 ----------
sub(3, '**M4-X1/X2/X3/X4/X5/X6 已交付**', '**M4-X1/X2/X3/X4/X5/X6/X7 已交付**', 'P-进度交付面')
# 真源里「v3.344.0」后面跟的是**全角右括号 U+FF09**(不是 ASCII `)`),故用 FW_R 构造;
# 波浪号是半角 ASCII `~`。锚点一律取 JSON 半角片段,避开全角字形差异。
sub(3, 'v3.344.0' + FW_R + FW_C + '**M4-X7', 'v3.344.0 / v3.345.0' + FW_R + FW_C + '**M4-X8', 'P-进度版本链')
sub(3, '尚未开工**' + FW_C + '下一刀 M4-X7', '尚未开工**' + FW_C + '下一刀 M4-X8', 'P-进度下一刀')

# ---------- 行 5 当前执行状态(整行替换)----------
lines[4] = (
    '> **当前执行状态' + FW_L + '2026-10-17' + FW_C + 'v3.345.0' + FW_R
    + '**:规划基线 `main@c37c52c`。本版是第四期**拓展九项第七项 M4-X7**'
    + FW_L + '旧事重现进入真实生成且由玩家控频;P1 / L' + FW_R + '实施点:' + FW_L
    + '第四期产品拓展包第三包「生成的时序」' + FW_R + '。'
    '`fated-recall.js`' + FW_L + 'v3.328.0 · F 包 M3-X8' + FW_R
    + '已交付四步「情境 → 触发键 → 候选' + FW_L + '相关性 + 冷却 + 知情面' + FW_R + '→ 用户可选策略」,'
    '并明写「候选只到**建议重现 + 来源**为止,不产出任何正文」;它答的是「此刻**为什么**该想起来」,'
    '**不答**三个下游问题:' + FW_L + '1' + FW_R + ' **候选可注入 ≠ 生成管线真的用过**'
    + FW_L + '`injectable` 是静态判断,读数上「给了 12 条可注入」与「真用了 1 条」**同形**' + FW_R + ';'
    + FW_L + '2' + FW_R + ' **没有生命周期**' + FW_L + '`markShown` 只记「展示过」,而**预览**与**使用**两种动作'
    '在账上**完全没有分列** ⇒ 「预览了一下就取消」会把冷却**误消耗**' + FW_R + ';'
    + FW_L + '3' + FW_R + ' **没有控频强度档**' + FW_L + '默认是什么、「重开/切回会不会重复轰炸」没有闸' + FW_R + '。'
    '本版两刀:**1 内核控频闸**(新模块 `return-gate.js`:`RG_VERSION 1`,585 行 / 32454 字节 / md5 '
    '`d9968a7407abb52edface48f929894cb`,零依赖 IIFE 双导出;'
    '**生命周期三通道分列** `preview`/`shown`/`used`,而冷却**只认 shown·used**'
    + FW_L + '「**预览一律不消耗冷却**」是本刀立身之本' + FW_R + ';'
    '**控频强度档** off / hint-only / inject' + FW_L + '默认 hint-only;**只有显式 inject 才产出可注入面**' + FW_R + ';'
    '**重复轰炸闸**' + FW_L + '同 (触发键, 旧事键) 在 `REPEAT_WINDOW 3` 楼内已 shown/used ⇒ held,'
    '**预览过不算**' + FW_R + ';**反馈只是呈现偏好**' + FW_L + '绝不删除任何历史标记' + FW_R + ';'
    '**情绪只读**;`hasPercentKey` **不产置信百分比**;`gate` 闸序即优先级;`selfCheck` **八项自证**;'
    '导出面 **38** 项);**2 宿主接线面**(取库口 `_returnGateLib` + 五出口 `_returnGateCandidates` / '
    '`returnGateAdmit` / `returnGateMark` / `returnGatePrefer` / `_returnGateLine` + 自检面「控频闸」行;'
    '候选缺省取数回落 `fated-recall` 的 `suggest()`' + FW_L + '给不出如实报 `no-fated`,不编候选' + FW_R
    + ';明写「**移交不算已用**」);**3 持久化收口**(本会话发现并修掉的真实缺口:'
    '`memory-organs.js` 的 `WorldProgress` export/import 是**逐项枚举子键**的,'
    '`returnGate` 不在表里 ⇒ 存盘即丢【假声明】,且回滚面不清 `marks.floor` ⇒ 被删楼层的命中永久 held;'
    '已五处落点修齐,实测 `memory-organs.js` 131378 → 133556 字节);'
    '**4 宿主候选装配三态塌陷**(同会话第二处真缺口:`Array.isArray` 判据会把「显式给了畸形候选」'
    '与「根本没给」**抹成同形**,已改 `!== undefined && !== null` 原样透传给内核判畸形)。'
    '**五条评判线索落地**:预览免费 / 展示与真用落冷却 / 三通道可分 / 控频强度档三态**不同形** / '
    '重复轰炸闸按窗生效且预览过不算 / 反馈只改偏好不删标记 / 不猜不编不产百分比 / 情绪只读。'
    '专项套件 v3445 **687 行 · 26 条全绿**' + FW_L + 'A 结构面与持久化面 / B 真跑六条 / C 宿主出口六条 / '
    'D1~D8 八条真源码破坏负控制 / F1 判据纯度 + F2 工具两向自证 / G1 版本锚' + FW_R + '。'
    '宿主基线 21739/787' + FW_L + 'ceiling 22139 余量 400' + FW_R + ';`extra_js` **109 → 110**'
    + FW_L + '新模块 return-gate.js' + FW_R + '。'
    '上一项 M4-X6' + FW_L + 'v3.344.0,梦境、假设、计划与现实的叙事层记忆' + FW_R + '。'
    '本面是**只读控频闸**:零顶层落盘面,状态经已持久化的 `worldProg.returnGate` 跨会话携带'
    + FW_L + '本版把它挂进 constructor/export/import 三面' + FW_R + '。'
    '本版全量**已实跑并逐类处置抬版连带面**,但**读数未登记**'
    + FW_L + '快照按纪律仍停 v3.328.0,登记留到第四期计划收口点' + FW_R + ',故当前 v3.345.0 **全量待验**。'
)
print('  ok P-状态行 行 5(整行替换)')

# ---------- 行 9 勾选表表头 ----------
sub(9, 'M4-X1/X2/X3/X4/X5/X6 已交付 / M4-X7' + FW_T + 'X9 待实施',
    'M4-X1/X2/X3/X4/X5/X6/X7 已交付 / M4-X8' + FW_T + 'X9 待实施', 'P-表头')

# ---------- 勾选表:把「⬜ M4-X7」勾上(按内容定位,不写死行号)----------
# 该表是**双列**排布:真源行以 `| ✅ M4-O7 | ... | ⬜ M4-X7 | ...` 开头 ⇒ 必须用 `in` 定位,
#   不能用 startswith(会假报「找不到 M4-X7 行」)。
for _i in range(8, 30):
    if '| ⬜ M4-X7 |' in lines[_i]:
        lines[_i] = lines[_i].replace('| ⬜ M4-X7 |', '| ✅ M4-X7 |', 1)
        print('  ok P-X7勾选 行 %d' % (_i + 1))
        break
else:
    if any('| ✅ M4-X7 |' in l for l in lines[8:30]):
        print('  ok P-X7 勾选(已是勾选态)')
    else:
        sys.stderr.write('FAIL: 勾选表里找不到 M4-X7 行\n')
        sys.exit(42)

# ---------- 基线表 ----------
sub(56, '**v3.344.0**', '**v3.345.0**', 'P-基线版本')
sub(57, '**324 测试文件', '**325 测试文件', 'P-门禁在役面')
# 体量行:头段**本刀一并修正陈旧读数**(3440 那次只把尾链推前,头段仍停在 v3.343.0 的 21514 / 783)
sub(59, '**21514 行**(探针读数;`wc -l` 21513) / **783** 成员',
    '**21740 行**(探针读数;`wc -l` 21739) / **793** 成员', 'P-体量行头')
sub(59, 'v3.344.0 M4-X6 叙事层记忆后为 21606 / 787;+ extra_js **109** 项',
    'v3.344.0 M4-X6 叙事层记忆后为 21606 / 787,v3.345.0 M4-X7 控频闸后为 21740 / 793;+ extra_js **110** 项',
    'P-体量行尾')

# ---------- 行 65 现行排序节 ----------
sub(65, '**M4-X2/X3/X5/X6 已交付**', '**M4-X2/X3/X5/X6/X7 已交付**', 'P-排序节交付面')
# 真源该行两处字形:版本链后是**全角右括号 U+FF09 + 全角逗号 U+FF0C**(逗号在 `**` 之前,
#   不是 `**,`);且版本链**漏了 v3.343.0**(M4-X5 当版交付)——本刀一并补回,文档不得说谎。
sub(65, 'v3.341.0 / v3.342.0 / v3.344.0' + FW_R + FW_C + '**M4-X7/X8/X9** **尚未开工**。**下一刀 = M4-X7**',
    'v3.341.0 / v3.342.0 / v3.343.0 / v3.344.0 / v3.345.0' + FW_R + FW_C + '**M4-X8/X9** **尚未开工**。**下一刀 = M4-X8**',
    'P-排序节版本链+待做面+下一刀')

src = '\n'.join(lines)
if src == orig:
    print('NO-OP')
    sys.exit(0)
os.makedirs(BAK, exist_ok=True)
io.open(BAK + 'PLAN.pre3445.md', 'w', encoding='utf-8').write(orig)
io.open(P, 'w', encoding='utf-8').write(src)
print('PATCHED PLAN.md')