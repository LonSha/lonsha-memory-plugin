#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.318.0 收口补刀 B：PLAN 现行排序节第 2 条如实收口（全量批跑 scan_plan_currency 当场点名的真缺陷）。

全量 61 门批跑：60 门 rc=0，唯一 rc=1 为 scan_plan_currency.mjs ——
  归因：「现行排序节第 2 条标题里仍把已交付的『O2』列为待做却未标状态 ⇒ 已交付条目被复活为待办」。
本刀（v3.318.0）正是 O2 的收口刀（真浏览器切片），文档滞后于交付事实。
纪律：锚点先校验唯一（恰中 1 次），通过后才写盘；写盘后复核新文本恰中 1 次。
"""
import io, sys
PLAN = '/home/user/lonsha-memory-plugin/PLAN.md'
OLD = '2. **O2 真实用户操作层** —— 入口渲染已交付（v3.271.0 U1–U5，零依赖 DOM shim 实调入口）；**真浏览器按 manifest 顺序装载生产模块 + 真实控件操作（展开 / 滑块 / 输入 / 焦点 / 窄屏）+ 重开保留**尚未做。真宿主（SillyTavern 本体）侧交付者环境无此条件，如实登记**未执行**。'
NEW = '2. **O2 收口（真实用户操作层 · 真浏览器切片已交付）** —— 入口渲染已交付（v3.271.0 U1–U5，零依赖 DOM shim 实调入口）；**真 Chromium（CDP 直连、零依赖）+ 真 SillyTavern 1.19.0** 的控件交互回归已于 **v3.318.0** 交付（探针 `tests/audit/_mo2_realbrowser_probe.mjs`，33 条读数全成立：真鼠标 / 真键盘 / 真 localStorage / Emulation 320px 窄屏 / 重开保留），并**当场抓到产品面真缺陷**：`.ls-hint` 的长不可断 ASCII 串无断行 + `.ls-row` 的 flex 子项 `min-width:auto` 不允许收缩 ⇒ 44px 开关被顶出视口（left=449 > 320，视口 320），修后 **161/161**、`narrow.overflow = []`，在册判据 `scan_ui_narrow_layout.mjs` + `v3318_ui_narrow_layout_gate.test.mjs` 把该形态钉住。真宿主侧其余流程面（生成 / 楼层重生成与删除 / 切角色 / 与手机插件双扩展共装）**如实登记未执行**（不在本刀范围，仍是可续做项）。'
s = io.open(PLAN, encoding='utf-8').read()
n = s.count(OLD)
if n != 1:
    print('[patch3318b] 锚点失配：count=%d（应为 1）⇒ 退出，不写盘' % n)
    sys.exit(1)
s2 = s.replace(OLD, NEW)
m = s2.count(NEW)
if m != 1:
    print('[patch3318b] 新文本复核失败：count=%d ⇒ 不写盘' % m)
    sys.exit(1)
s = s2
io.open(PLAN, 'w', encoding='utf-8').write(s)
print('[patch3318b] 写盘完成：PLAN 现行排序节第 2 条已如实收口（O2 ⇒ 已收口）')
