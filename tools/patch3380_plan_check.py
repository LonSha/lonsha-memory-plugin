# -*- coding: utf-8 -*-
"""[v3.338.0 计划勾选] 把 PLAN.md / TODO.md 的第四期执行状态从「M4-O8 实施点」
切到「优化九项全交付、拓展九项零开工、下一刀 M4-X1」，防止后续误读。

纪律约束（scan_plan_currency.mjs P1~P8）：
  · 不新增第二个「唯一现行排序」H2（P1）；
  · 「当前执行状态（…，vX.Y.Z）」版本必须 == index.js VERSION（P3）⇒ 本脚本**不抬版**；
  · 现行排序节的三条**条目标题加粗段**里不得出现已交付的 O/X 编号（P4/P8）
    ⇒ 进度说明一律写成正文（`>` 引用行），不写进 `N. **…**` 标题；
  · 排序型节集合与 plan_currency.tsv 登记不变（P5）。
幂等：锚点不存在（已切过）则原样返回。
"""
import io
import re

PLAN = '/home/user/lonsha-memory-plugin/PLAN.md'
TODO = '/home/user/lonsha-memory-plugin/TODO.md'

NEW_PLAN_HEAD3 = (
    '> **第四期产品计划（2026-10-15，唯一现行提案）**：本仓优化9项＋拓展9项，双仓共36项。'
    '**执行进度（2026-10-16）**：优化提升九项 **M4-O1～O9 已全部交付**（v3.329.0～v3.338.0）；'
    '拓展新功能九项 **M4-X1～X9 尚未开工**，下一刀 M4-X1。'
    '各项状态以下表勾选与文首「当前执行状态」为准，逐版留痕见 CHANGELOG。'
)

NEW_PLAN_STATUS = (
    '> **当前执行状态（2026-10-16，v3.338.0）**：规划基线 `main@cbaf3c5`。'
    '第四期**优化提升九项 M4-O1～O9 已全部交付**（v3.329.0 O1 回收去重尊重身份/世界/事件范围 · '
    'v3.330.0 O2 问句保留主题、多人物与时点 · v3.331.0 O3 回答变有据事件解释 · '
    'v3.332.0 O4 异步查询接真实问答与资料页 · v3.334.0 O5 长资料完整读取 · '
    'v3.335.0 O6 年鉴/正史/旧事接真实数据 · v3.336.0 O9 无剧透回顾按可知性裁剪 · '
    'v3.337.0 O7 长期压缩保住证据 · v3.338.0 O8 控制中心处置动作生产方；'
    '各项定向门全绿，CHANGELOG 逐版留痕）。'
    '**拓展新功能九项 M4-X1～X9 全仓零开工**（除本文件与 `.agents/notes/proposed/` 计划原文外无任何命中）。'
    '**下一刀 = M4-X1 可校订的分层导入与源资料更新（P1 / L）**，属第一包「查得准、导得进」（X1/X4），'
    '其依赖 O1/O2/O5/O6 **均已交付、依赖已满足**。'
    '本版 v3.338.0 **全量待验**（全量 `npm test` 按纪律集中到第四期全部收口点跑一次）。'
)

NEW_PLAN_THEAD = '| 编号 | 优化提升（M4-O1～O9 已交付） | 编号 | 拓展与新功能（M4-X1～X9 待实施） |'

NEW_PLAN_CURRENT_NOTE = (
    '> 第四期排序接管；下方第三期与更早的交付记录均为历史，旧全量快照与真实体验缺口保留。'
    '**执行进度（2026-10-16）**：产品包A 的 M4-O1/O2/O5/O6/O9 与产品包B 的 M4-O3/O4/O7/O8 '
    '**均已交付**（v3.329.0～v3.338.0）；产品包B 剩余 **M4-X1/X4** 与产品包C 的 '
    '**M4-X2/X3/X5/X6/X7/X8/X9** **尚未开工**。**下一刀 = M4-X1**'
    '（可校订的分层导入与源资料更新，P1 / L）。'
)

NEW_TODO_HEAD = (
    '> **现行产品待办（2026-10-16）**：见 [PLAN.md](PLAN.md) 的第四期 M4-O1～O9 / M4-X1～X9。'
    '**执行进度**：优化提升九项 **M4-O1～O9 已全部交付**（v3.329.0～v3.338.0）；'
    '拓展新功能九项 **M4-X1～X9 尚未开工**，**下一刀 M4-X1**'
    '（可校订的分层导入与源资料更新，第一包「查得准、导得进」，依赖 O1/O2/O5/O6 已满足）。'
    '下面保留旧迭代记录，不按“最近更新”或旧勾选直接施工，不把守卫/台账扩建当新产品项。'
)


def replace_line_prefix(src, prefix, newline):
    """整行替换：找到以 prefix 开头的行，整行换成 newline。"""
    out = []
    hit = 0
    for ln in src.split('\n'):
        if ln.startswith(prefix):
            out.append(newline)
            hit += 1
        else:
            out.append(ln)
    return '\n'.join(out), hit


def tick_table(src):
    """给第四期表格的 O 行打 ✅、X 行打 ⬜（仅作用于 `| M4-O<d> |` 数据行）。"""
    out = []
    hit = 0
    for ln in src.split('\n'):
        if re.match(r'^\| M4-O\d \|', ln) and '✅' not in ln:
            ln2 = re.sub(r'^\| (M4-O\d) \|', r'| ✅ \1 |', ln)
            ln2 = re.sub(r'\| (M4-X\d) \|', r'| ⬜ \1 |', ln2)
            if ln2 != ln:
                hit += 1
            out.append(ln2)
        else:
            out.append(ln)
    return '\n'.join(out), hit


def patch_plan():
    s = io.open(PLAN, encoding='utf-8').read()
    orig = s
    s, h1 = replace_line_prefix(s, '> **第四期产品计划（', NEW_PLAN_HEAD3)
    s, h2 = replace_line_prefix(s, '> **当前执行状态（', NEW_PLAN_STATUS)
    s, h3 = replace_line_prefix(s, '| 编号 | 优化提升（', NEW_PLAN_THEAD)
    s, h4 = replace_line_prefix(s, '> 第四期排序接管；', NEW_PLAN_CURRENT_NOTE)
    s, h5 = tick_table(s)
    print('PLAN hits: head3=%d status=%d thead=%d current=%d table=%d' % (h1, h2, h3, h4, h5))
    if s != orig:
        io.open(PLAN, 'w', encoding='utf-8').write(s)
        print('PLAN patched: %d -> %d chars' % (len(orig), len(s)))
    else:
        print('PLAN no change')


def patch_todo():
    s = io.open(TODO, encoding='utf-8').read()
    orig = s
    s, h1 = replace_line_prefix(s, '> **现行产品待办（', NEW_TODO_HEAD)
    print('TODO hits: head=%d' % h1)
    if s != orig:
        io.open(TODO, 'w', encoding='utf-8').write(s)
        print('TODO patched: %d -> %d chars' % (len(orig), len(s)))
    else:
        print('TODO no change')


if __name__ == '__main__':
    patch_plan()
    patch_todo()