# -*- coding: utf-8 -*-
"""v3.309.0 收尾·C：CHANGELOG 追加「全量实跑抓出的 5 红」分类处置留痕。"""
import os
import re

ROOT = '/home/user/lonsha-memory-plugin'
C = os.path.join(ROOT, 'CHANGELOG.md')
s = open(C, encoding='utf-8').read()

anchor = re.search(r"^[ \t]*· 本版\*\*全量未跑\*\*.*\n", s, re.M).group(0)
assert s.count(anchor) == 1

add = (
    "- **全量实跑（`npm test`，290 档）抓出的 5 处红：1 处本刀回归 + 4 处既有真缺陷**：\n"
    "  逐处都做了**基线对照**（在已提交的 HEAD `77d5eaa` 上重跑同一档）来判归属，不靠印象：\n"
    "  ① **本刀真回归 —— `v3264 C`（已修）**：断言 `total_lines < 16000` 是 v3.264.0 留下的\n"
    "  **硬锁当版里程碑魔数**；本刀世界推进块头加闸 **+55 行** ⇒ 宿主 15955 → 16010，顶穿该死数。\n"
    "  而 16010 仍 **< 18401**（A1 首刀前基线）⇒「剥了又长回来」这条**真不变量未破**。\n"
    "  按同族先例（v3261 C / v3266 C：把「某版的一次性事实」当永久不变量，翻红只剩「数字不够小」）\n"
    "  **交棒**到 `host_beast_baseline.json` 的 `line_budget` 登记面（只读校验 ceiling / history /\n"
    "  maxSlack；登记面由 v3266 C 立起，本档**不另立第二份真源**），`< 18401` 单调守卫原样保留。\n"
    "  ② **既有真缺陷 ×2 —— `v3254 D9/D12` + `v3255 C1`（已修）**：破坏锚写的是裸串\n"
    "  `'revision: null,'`，而 v3.305.0 在 `_memoryToolsAbsent()`（index.js 回执面）引进了\n"
    "  **第二处**同形字面量 ⇒ 锚命中 **2 次** ⇒ 破坏工具按口径①（须恰中 1 次）**拒绝破坏** ⇒\n"
    "  三条负控制**整组空转**（红的是夹具，不是判据）。基线 `77d5eaa` 与引入刀 `9336e0e` 上\n"
    "  重跑同红 ⇒ 与本刀无关。修法：锚改用**唯一上下文形态**（revision 位 + 下一行同缩进的\n"
    "  `historyFingerprint:`），并把「锚恰中 1 次」这条自证同步改指新锚（**不放宽工具口径**）。\n"
    "  ③ **既有真缺陷 ×1 —— `v3203` 8/18 两处夹具（已修）**：真源 `hasAnchorFor()` 认\n"
    "  **两种**合法锚形（字面量 `vnum('<当版>')` 与**本档自锚常量** `vnum(NAME)`），\n"
    "  而夹具的 needles 写死了 `vnum(CUR)` —— 当 frontier 改用 `const BORN = '3.309.0'` +\n"
    "  `vnum(BORN)` 之后，夹具**一个锚都删不到** ⇒ V4 不翻红 ⇒ 负控制/正控**双双空转**。\n"
    "  修法：needle 改为在树里**按真源口径现场派生**（扫 `const NAME = '<当版>'` 得名字集），\n"
    "  frontier 改名不再让夹具打偏。\n"
    "  ④ **非缺陷（环境性）—— `v3159` 全量 TIMEOUT（120s）/ 单跑 rc=0（69s）**：\n"
    "  该档真跑 40+ 个审计脚本，7 路并发下争抢资源超时；单跑全绿 ⇒ 既有环境面，非本刀引入。\n"
    "  · 归因留痕口径：**「全量红了」不等于「本刀坏了」**——逐处在基线 HEAD 上重跑同档，\n"
    "    红/绿对照才定归属（本仓纪律：红绿都要能归因）。\n"
)
s = s.replace(anchor, add + anchor)
open(C, 'w', encoding='utf-8').write(s)
print('[chlog3309c] OK：5 红分类处置留痕已写入 CHANGELOG v3.309.0 节')