#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.345.0 TODO 同步:文首待办行 + 插入「最近更新:v3.345.0」并把 v3.344.0 行降为历史留痕。

锚点纪律(承接 tools/patch3440_todo.py):
  1 全角标点一律 \\uXXXX 转义(字面全角会被规范化,锚点即失配);
  2 其余锚点取**无标点**片段;
  3 每处 count 须恰 1,否则 abort(退出码 41);
  4 新写的注释**不得逐字复述旧锚点**(H5 判据纯度)。
"""
import io
import os
import sys

P = '/home/user/lonsha-memory-plugin/TODO.md'
BAK = '/tmp/bak3445/'
orig = io.open(P, encoding='utf-8').read()
lines = orig.split('\n')
FW_L, FW_R, FW_C, FW_T, FW_S = '\uff08', '\uff09', '\uff0c', '\uff5e', '\uff1a'


def sub(idx, old, new, label, expect=1):
    n = lines[idx - 1].count(old)
    if n != expect:
        sys.stderr.write('FAIL: %s 第 %d 行「%s」命中 %d 次(应 %d)\n' % (label, idx, old, n, expect))
        sys.exit(41)
    lines[idx - 1] = lines[idx - 1].replace(old, new)
    print('  ok %s 行 %d' % (label, idx))


# ---------- 行 3 文首现行产品待办 ----------
sub(3, 'M4-X1/X2/X3/X4/X5/X6 已交付**', 'M4-X1/X2/X3/X4/X5/X6/X7 已交付**', 'T-待办交付面')
sub(3, 'v3.344.0' + FW_R + FW_C + '**M4-X7' + FW_T + 'X9 尚未开工**' + FW_C + '**下一刀 M4-X7**',
    'v3.344.0 / v3.345.0' + FW_R + FW_C + '**M4-X8' + FW_T + 'X9 尚未开工**' + FW_C + '**下一刀 M4-X8**',
    'T-待办版本链+待做面+下一刀')

# ---------- 行 19:v3.344.0 行降为历史留痕 ----------
sub(19, '> **最近更新' + FW_S + 'v3.344.0', '> **历史留痕' + FW_S + 'v3.344.0', 'T-降旧行为历史')

NEW19 = (
    '> **最近更新' + FW_S + 'v3.345.0 —— 第四期拓展第七项 M4-X7:旧事重现进入真实生成且由玩家控频'
    + FW_L + 'P1 / L' + FW_R + '**' + FW_L + '第四期产品拓展包第三包「生成的时序」' + FW_R + '。'
    '★ **修的是什么' + FW_L + '修前实测,读码可复算' + FW_R + '**:'
    '既有 `fated-recall.js`' + FW_L + 'v3.328.0 · F 包 M3-X8' + FW_R
    + '已走完「情境 → 触发键 → 候选 → 策略」四步,但它只到**建议重现 + 来源**为止,'
    '**不答**三个下游问题:' + FW_L + '1' + FW_R + ' **候选可注入 ≠ 生成管线真的用过**'
    + FW_L + '`injectable` 是静态判断,读数上「给了 12 条可注入」与「真用了 1 条」**同形**' + FW_R + ';'
    + FW_L + '2' + FW_R + ' **没有生命周期**' + FW_L + '`markShown` 只记「展示过」,而**预览**与**使用**'
    '两种动作在账上**完全没有分列** ⇒ 「预览了一下就取消」会把冷却**误消耗**' + FW_R + ';'
    + FW_L + '3' + FW_R + ' **没有控频强度档**' + FW_L + '默认是什么、「重开/切回会不会重复轰炸」没有闸' + FW_R + '。'
    '★ **本刀' + FW_L + '内核控频闸 / 宿主接线面 + 持久化收口,不建常驻提醒代理、不产正文、不写库' + FW_R + '**:'
    '1 **内核控频闸** —— 新模块 `return-gate.js`' + FW_L + '`RG_VERSION 1`,`RG_KIND `return_gate``,'
    '585 行 / 32454 字节 / md5 `d9968a7407abb52edface48f929894cb`,零依赖 IIFE 双导出' + FW_R + ';'
    '**生命周期三通道分列** `preview`/`shown`/`used`,而 `COOLDOWN_CHANNELS` **只含 shown·used** —— '
    '「**预览一律不消耗冷却**」是本刀立身之本;'
    '**控频强度档** `POLICY` off / hint-only / inject' + FW_L + '默认 `hint-only`,'
    '**只有显式 inject 才产出可注入面**,`off` 恒零,三态各自读数**不同形**' + FW_R + ';'
    '**重复轰炸闸** —— 同 ' + FW_L + '触发键, 旧事键' + FW_R + ' 在 `REPEAT_WINDOW 3` 楼内已 shown/used ⇒ 再问一律 '
    '`held`' + FW_L + 'reason `repeat-window`' + FW_R + ',且**预览过不算**;'
    '**反馈只是呈现偏好** `PREFERENCE` normal / less / never'
    + FW_L + '`never` ⇒ blocked、`less` ⇒ held,但**绝不删除任何历史标记**' + FW_R + ';'
    '**情绪只读**' + FW_L + '`emotionUsed:false`' + FW_R + ';`gate` 闸序即优先级;'
    '`hasPercentKey` **不产置信百分比**;`line` 四方**分开说**' + FW_L + '可提 / 押后 / 不出 / 可注入' + FW_R + ';'
    '`render` **只给建议与来源与闸态,不产正文**;`selfCheck` **八项自证**;导出面 **38** 项。'
    '2 **宿主接线面** —— 取库口 `_returnGateLib` + 五出口 `_returnGateCandidates` / `returnGateAdmit` / '
    '`returnGateMark` / `returnGatePrefer` / `_returnGateLine` + 自检面「控频闸」行;'
    '候选缺省取数回落 `fated-recall` 的 `suggest()`' + FW_L + '给不出如实报 `no-fated`,不编候选' + FW_R
    + ';明写「**移交不算已用**」;零顶层落盘面。'
    '3 **持久化收口' + FW_L + '本会话新发现并修掉的真实缺口一' + FW_R + '** —— '
    '`memory-organs.js` 的 `WorldProgress` export/import 是**逐项枚举子键**的,`returnGate` 不在表里 ⇒ '
    '存盘即丢**假声明**,且回滚面不清 `marks.floor` ⇒ 被删楼层的命中永久 held;'
    '已五处落点修齐' + FW_L + '真读 159916 → 163121 字节,md5 `73ef59b97ea96080ae00765a566c79f5` → '
    '`fdd8332d4f67454c1773d924ea90ebe4`' + FW_R + '。'
    '4 **宿主候选装配三态塌陷' + FW_L + '同会话第二处真缺口' + FW_R + '** —— '
    '`Array.isArray` 判据会把「显式给了畸形候选」与「根本没给」**抹成同形**,'
    '已改 `!== undefined && !== null` 原样透传给内核判畸形。'
    '★ **五条评判线索逐条落地' + FW_L + '全部真跑读数,读码可复算' + FW_R + '**:预览免费 / 展示与真用落冷却 / '
    '三通道可分 / 控频强度档三态**不同形** / 重复轰炸闸按窗生效且预览过不算 / 反馈只改偏好不删标记 / '
    '不猜不编不产百分比 / 情绪只读。'
    '★ **定向复验' + FW_L + '全部真跑' + FW_R + '**:`tests/v3445_m4x7_return_gate.test.mjs`' + FW_L
    + '**687 行 · 26 条全绿**,宿主侧从 `index.js` 真切片 + 真装载 `return-gate` 内核' + FW_R + ':'
    'A 结构面与持久化面 / B 真跑六条 / C 宿主出口六条 / D1' + FW_T + 'D8 **八条真源码破坏负控制**'
    + FW_L + '各带原版阳性对照' + FW_R + ' / F1 H5 判据纯度 + F2 H6 工具两向自证 / G1 版本锚。'
    '宿主基线重建至 v3.345.0:实测 **21740 行 / 793 成员**'
    + FW_L + 'ceiling 22006 → 22140 余量 400,成员 788 → 823' + FW_R + ';'
    '`extra_js` **109 → 110**' + FW_L + '新增模块 `return-gate.js`' + FW_R + '。'
    '· 退出码三档:0 卫生 / 1 真缺陷 / 2 结构漂移' + FW_L + '本仓扫描器契约' + FW_R + '。'
    '★ **诚实边界**:真实 SillyTavern 宿主的 UI 点击流与真实模型问答**未跑**'
    + FW_L + '宿主新面以真装载宿主切片验证调用口径' + FW_R + ';本面是**只读控频闸**,零顶层落盘面;'
    '全量 `npm test` 已实跑并按类处置抬版连带面' + FW_L + '49 个失败档,逐类定向复跑转绿' + FW_R + ','
    '但**读数未登记**' + FW_L + '快照按纪律仍停 v3.328.0,登记留到第四期计划收口点' + FW_R + ' ⇒ '
    '本版**全量待验**。'
)
lines.insert(18, NEW19)
print('  ok T-新最近更新行插在行 19')

src = '\n'.join(lines)
if src == orig:
    print('NO-OP')
    sys.exit(0)
os.makedirs(BAK, exist_ok=True)
io.open(BAK + 'TODO.pre3445.md', 'w', encoding='utf-8').write(orig)
io.open(P, 'w', encoding='utf-8').write(src)
print('PATCHED TODO.md')