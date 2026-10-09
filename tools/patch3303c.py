#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.303.0 · 发布面补一节留痕：抬版连带暴露的**两处历史档自伤**。

定位口径：先把范围限在 CHANGELOG 的 v3.303.0 节内（该节尾以 *** 收口），
再在该范围内取唯一一处「退出码三档」声明插入 —— 全文该串出现 13 次，
裸锚点必然失配，这是本条判据自身的定位纪律。
"""
import sys
from pathlib import Path

NL = chr(10)
ROOT = Path('/home/user/lonsha-memory-plugin')
HEAD = '## v3.303.0'
TAIL = NL + '***' + NL
NEEDLE = '- **退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移**'

p = ROOT / 'CHANGELOG.md'
s = p.read_text(encoding='utf-8')
i = s.find(HEAD)
if i < 0 or s.count(HEAD) != 1:
    sys.exit('[patch3303c] CHANGELOG 找不到唯一的 %s 节' % HEAD)
j = s.find(TAIL, i)
if j < 0:
    sys.exit('[patch3303c] v3.303.0 节未见 *** 收口（格式漂移）')
sec = s[i:j]
if NEEDLE not in sec or sec.count(NEEDLE) != 1:
    sys.exit('[patch3303c] v3.303.0 节内「退出码三档」声明不唯一（%d 处）' % sec.count(NEEDLE))
INSERT = NL.join([
    '- **抬版连带暴露的两处历史档自伤（都已修，复跑全绿）**：',
    '  · `tests/v3302_mo1_write_closure.test.mjs` D2 用的是**硬等**形当版锚',
    '    （`assert.equal(vnum(CUR), vnum(v))`）⇒ 抬版后它自己转红。当版锚的本意是',
    '    「**本刀**证明自己是在这一版做的」，所以**当版锚应交给新档**、旧档退回',
    '    **出生版本下界**形（这正是 `scan_version_guard` V3 禁止「历史档跟着抬版」的理由）。',
    '  · `tests/v3206_process_reaping.test.mjs` 的空转负控制 N4 把退化清单**写死**成',
    '    两个文件 ⇒ 本版新增的真宿主探针也用异步 spawn（**占位**），掏空那两个后扫描面',
    '    仍有 1 个使用者 ⇒ 门照旧 exit 0、**负控制静默失效（假绿）**。修法：退化清单改为',
    '    按扫描面真值**动态枚举**（与门同一口径），以后新增使用者不会再让负控制失效。',
]) + NL
sec2 = sec.replace(NEEDLE, INSERT + NEEDLE, 1)
p.write_text(s[:i] + sec2 + s[j:], encoding='utf-8')
print('  · CHANGELOG.md  v3.303.0 节内插入「抬版连带两处自伤」')

T = ROOT / 'TODO.md'
t = T.read_text(encoding='utf-8')
A = chr(9733) + ' 本版自伤一处：F1 判据纯度首版'
if t.count(A) != 1:
    sys.exit('[patch3303c] TODO 锚点命中 %d 次' % t.count(A))
B = (chr(9733) + ' **抬版连带暴露两处历史档自伤**（都已修）：' + chr(40) + '1' + chr(41)
     + ' `v3302` D2 用**硬等**形当版锚 ⇒ 抬版后自己转红（当版锚应交给新档，'
     + '旧档退回**出生版本下界**形）；' + chr(40) + '2' + chr(41)
     + ' `v3206` 空转负控制 N4 把退化清单**写死**成两个文件、本版新增的真宿主探针**占了位**'
     + '⇒ 掏空那两个后门照旧 exit 0、**负控制静默失效**（已改为按扫描面真值动态枚举）。'
     + A)
T.write_text(t.replace(A, B, 1), encoding='utf-8')
print('  · TODO.md      当前行插入「抬版连带两处自伤」')
print('[patch3303c] 完成')
