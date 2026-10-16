#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.339.0 计划勾选：PLAN.md 进度行 + 表格 X1 打 ✅。
纪律：不新增第二个「唯一现行排序」H2（P1）；现行排序节三条**条目标题加粗段**内不得出现已交付 O/X 编号（P4/P8）；
     排序型节集合与 tsv 登记不变（P5）。
"""
import io
ROOT = '/home/user/lonsha-memory-plugin/'
P = ROOT + 'PLAN.md'
s = io.open(P, encoding='utf-8').read()
def sub1(text, old, new, label):
    n = text.count(old)
    assert n == 1, '%s 锚点命中 %d 次(应为 1): %r' % (label, n, old[:80])
    return text.replace(old, new, 1)
# 第 3 行执行进度
s = sub1(s,
    '拓展新功能九项 **M4-X1～X9 尚未开工**，下一刀 M4-X1。',
    '拓展新功能九项 **M4-X1 已交付**（v3.339.0），**M4-X2～X9 尚未开工**，下一刀 M4-X4。',
    'PLAN 第3行进度')
# 第 64 行现行排序节进度
s = sub1(s,
    '产品包B 剩余 **M4-X1/X4** 与产品包C 的 **M4-X2/X3/X5/X6/X7/X8/X9** **尚未开工**。**下一刀 = M4-X1**（可校订的分层导入与源资料更新，P1 / L）。',
    '产品包B 剩余 **M4-X4** 与产品包C 的 **M4-X2/X3/X5/X6/X7/X8/X9** **尚未开工**。**下一刀 = M4-X4**（带消歧与条件继承的多轮记忆问答，P1 / L）。',
    'PLAN 第64行现行排序节进度')
# 表头
s = sub1(s,
    '| 编号 | 优化提升（M4-O1～O9 已交付） | 编号 | 拓展与新功能（M4-X1～X9 待实施） |',
    '| 编号 | 优化提升（M4-O1～O9 已交付） | 编号 | 拓展与新功能（M4-X1 已交付 / M4-X2～X9 待实施） |',
    'PLAN 表头')
# 表格 X1 行打 ✅
s = sub1(s,
    '| ✅ M4-O1 | 回收去重尊重身份、世界与事件范围 | ⬜ M4-X1 | 可校订的分层导入与源资料更新 |',
    '| ✅ M4-O1 | 回收去重尊重身份、世界与事件范围 | ✅ M4-X1 | 可校订的分层导入与源资料更新 |',
    'PLAN 表格 X1 行')
io.open(P, 'w', encoding='utf-8').write(s)
print('PLAN.md 勾选已写 4 处')
# TODO.md 头部进度行
D = ROOT + 'TODO.md'
t = io.open(D, encoding='utf-8').read()
t = sub1(t,
    '拓展新功能九项 **M4-X1～X9 尚未开工**，**下一刀 M4-X1**（可校订的分层导入与源资料更新，第一包「查得准、导得进」，依赖 O1/O2/O5/O6 已满足）。',
    '拓展新功能九项 **M4-X1 已交付**（v3.339.0），**M4-X2～X9 尚未开工**，**下一刀 M4-X4**（带消歧与条件继承的多轮记忆问答，第一包「查得准、导得进」，依赖 O2/O3/O4 已满足）。',
    'TODO 头部进度行')
io.open(D, 'w', encoding='utf-8').write(t)
print('TODO.md 头部已写 1 处')