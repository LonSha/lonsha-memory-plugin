#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch3317_chlog_tail.py - v3.317.0：把 v3281/v3282 两处台账补登与三档行数锁交棒写进本版 CHANGELOG 顶节。

为什么补：本刀抬版后跑门禁链抓到 v3281（3 簇）/ v3282（3 簇）与你既有档相同的硬锁当版行数魔数；
这些是**既往抬版漏同步的既有真缺陷**（在干净基线 3d54b62 上同样翻红）与**本刀 M-X3 扩成员/新增**，
已在同一版就地处置（补登 + 交棒），须在本版档里留痕 —— 否则下一轮读档的人只看到「15/15 全绿」，
看不到这六处是怎么来的。
纪律：锚点先校验，通过后统一写盘。
"""
import io
ROOT = '/home/user/lonsha-memory-plugin/'
F = ROOT + 'CHANGELOG.md'
s = io.open(F, encoding='utf-8').read()
ANCHOR = '### ⑩ 抬版连带：三个派生账按真源刷新（读数零手抄）'
R = (chr(10).join([    '### ⑨b 门禁链当场抓红六处（三档行数锁交棒 + 两台账补登，全为既往漏同步的既有真缺陷与本刀扩成员）',
    '',
    '本刀抬版后跑门禁链（单套件 / 逐门，**不含全量**）当场抓到六处红，逐处在干净基线 `3d54b62` 上重跑同档对照定归属：',
    '',
    '- **`v3259 C` / `v3260 C` / `v3261 C` 三档「硬锁当版行数魔数」**（`< 18124`+`<= 17800` / `< 17776`+`<= 17500` / `< 17444`）：',
    '  它们是各刀**一次性事实**，与 v3264 C / v3266 C 踩过的完全同族（CHANGELOG v3.273.0 留痕）—— 主动接线把宿主推到 17611 行后翻红，',
    '  而翻红的信息量只剩「数字不够小」。按同族先例**交棒**到 `host_beast_baseline.json` 的 `line_budget` 登记面（`tools/patch3317_line_locks.py`）：',
    '  三档改守 `line_budget.ceiling`（余量须 ≤ maxSlack）+ 单调守卫 `18401` 照旧；不新建第二份真源（该登记面由 v3266 C 立起）。',
    '- **`v3281` 模块↔模块副本台账漏三簇**（`_t` / `_floorOf` / `surfaceDigest`）：前两簇是 **v3.316.0 · M-X7 抬版漏同步**（基线即红，取证见脚本头），',
    '  第三簇由本刀 M-X3 给 `project-registry.js` 加成员所致。三者均为「通用原语、装载时机互不包含」，故**补登**而不收拢（`tools/patch3317_copy_ledger.py`）。',
    '- **`v3282` 别名副本台账漏三簇**（`_t/text` / `_floorOf/floorOf` / `_isPlain/isPlainObject`）：前两簇同属 **v3.316.0 抬版漏同步**，',
    '  第三簇由本刀加成员所致（`tools/patch3317_alias_ledger.py`）。两档台账的簇数口径同步到实测（24 / 13）。',
    '',
    '★ 归因口径：**「门禁红了」不等于「本刀坏了」**，红绿都要能归因 —— 三档行数锁与两簇副本是既往遗留，本刀只是让它们显形（并就地处置）；',
    '剩余一簇（`surfaceDigest` / `_isPlain`）是本刀扩成员带来的真实增量，已按档设计登记。',
    '',]))
if s.count(ANCHOR) != 1:
    raise SystemExit('[patch3317-chlog] 锚点命中 %d 次' % s.count(ANCHOR))
s = s.replace(ANCHOR, R + chr(10) + chr(10) + ANCHOR, 1)
io.open(F, 'w', encoding='utf-8').write(s)
print('[patch3317-chlog] wrote CHANGELOG（+ 门禁链抓红留痕节）')
