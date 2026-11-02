#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.441.0 抬版第三步：只改 TODO.md 顶节（最近更新链）。

为什么单独一支（v3.440.0 的现场实测，不许重犯）：
  TODO.md 里 `> **最近更新：` 实测 **22 处**，因为它是本仓的**历史留痕链**：
    `> **历史留痕：` 41 处 / `> **最近更新：` 22 处 / `> **上一版更新：` 2 处。
  上一版脚本要求「恰 1 处」，于是在健康树上 abort；而 version-guard 的 V7 口径是
  `const m = /最近更新：v([0-9]+[.][0-9]+[.][0-9]+)/.exec(todoRaw);` —— **正则取首次命中**，
  即「第一处即当版」才是真源形态。故本脚本取 `hit[0]`，不要求唯一。

降级链（留痕不丢）：
   第一处   `> **最近更新：v3.440.0** ...`  →  整行换成新的当版内容
   紧随其后 `> **上一版更新：v3.439.0**`     →  这是被顶下来的那一版的新位置
   再后     `> **再前一版：v3.438.0**`
  本版执行顺序：先把原「最近更新 v3.440.0」那一行**就地替换**成新版顶节；
  原来的 v3.440.0 内容会以「上一版 v3.440.0」的形式出现在新顶节正文的尾部（PLAN 同款）。
  若新顶节正文未包含 v3.440.0 的摘要，则额外插一行 `> **上一版更新：v3.440.0** …`，
  并把紧随其后的原「上一版更新 v3.439.0」降级为「再前一版」—— 保证顺读链完整。
"""
import re
import sys

V_OLD = '3.440.0'
V_NEW = '3.441.0'
REPO = '/home/user/lonsha-memory-plugin/'

with open(REPO + 'TODO.md', 'r', encoding='utf8') as f:
    td = f.read()

lines = td.split('\n')
hit = [i for i, l in enumerate(lines) if l.startswith('> **最近更新：')]
if not hit:
    sys.exit('[abort] TODO 里找不到 `> **最近更新：` 行 —— 形态已变，先核真源')
k = hit[0]                      # 取第一处：本仓该串不是全文件唯一键（历史留痕链）
if ('v' + V_NEW) in lines[k]:
    sys.exit('[abort] TODO 第一处「最近更新」已是 v%s —— 拒绝重复插入' % V_NEW)

V440 = ('v3.440.0 L13-X7 习惯与成长证据面：两块账**分开存、分开报、不互相充抵**（习惯本体在 '
        '`worldProg.habitRepos`，成长证据束新建 `worldProg.growthBundles`）；写入口**不新开** —— '
        '证迹由既有 `agencyContractAct(\'practice\')` 分支顺带产出，失败不回滚本体但如实报 '
        '`skipped:<why>`；读面同时给 `unproven`（成形待证）与 `orphan`（无主束）；内核补 '
        '`describeGrowth` / `STAGE_LABELS` / `STAGE_ORDER`（不求和、不加权）。★ 修内核真缺陷一处：'
        '`evaluateCompetencyAfterRevocation` 返回 `validRecords` 而读面读 `records` ⇒ 撤回证据的产物'
        '成了空束（已补 `records: validRecords`）。判据 7 条全绿。')

NEW_HEAD = ('> **最近更新：v3.441.0**（**L13-X4 证据缺口工作台**：把 `memory-archaeology-gap-bench.js` '
            '从「登记在册但产品端零调用」接成可审阅的面。三档成因**穷尽且互不同形** —— '
            '`no-source`（从没证据）/ `source-lost`（账上写着证据引用、但当前正文里已找不到）/ '
            '`contradicted`（同主语在未决矛盾账里有多版本），面板四格分列、三档说明逐档不同文，'
            '**绝不合成一个「缺证据」**。「判不了」不是第四种成因，而是两个布尔 '
            '`sourceChecked` / `conflictChecked`：内核 `resolveSource` 严格三态（`true` / `false` / '
            '**`null` 判不了**，绝不为凑一档把「没核验」写成「证据丢了」），诊断层再套长度门槛'
            '（`< 6` 字的短引用找不到一律 `null` —— 时间标签类引用在正文里找不到是常态）；'
            '`conflictsAvailable === false` 时绝不报「查过没矛盾」。双表并存：`counts` 按主因'
            '（一条只进一格）、`hitCounts` 按命中（多因条目多格出现）—— 只看一张都会读错。'
            '动作面只有两个且**没有一键补全**：`去补证` 只是跳 `lockedfacts` 让人手打（本面不代劳，'
            '代劳就是模型无凭捏造补全），`降级为推测` **逐条**走宿主 `evidenceGapDowngrade`，落笔仍走'
            '既有两 owner（`fact-version.setOrigin`：`stated 0.8 → inferred 0.3` 低于门槛 0.5 ⇒ 自动被'
            '现状查询挡住；`DeltaBook.add(..., \'uncertain\', floor)`：落进既有 `deltas` 视图），'
            '②失败不回滚①但如实报 `skipped:<why>`。只读面**不落任何缓存**（缓存本身也是一次写）。'
            '已撤销条目单列 `skippedRevoked` 不静默跳过。面板 `archive` 视图改造成'
            '「🧾 证据缺口 · 存档体检」，缺口在上容器在下（`body = gapBlock + archiveBody`），'
            '三态不同形（缺席明写「**不是「证据都齐了」**，是这个面没装上」；空态必须念 '
            '`scanned`/`thick`/`threshold`，否则空扫与真扫同形），四格分列 + 两侧核验状态行常驻。'
            '★ 判据 `tests/v3441_l13_x4_evidence_gap.test.mjs` **18 条全绿**（A 内核 5 / B 面板 3 / '
            'C 只读自证 2 / D 降级 3 / E 负控制 4 / F 当版锚 1），含四条真源码破坏各配原版对照。'
            '★ **首跑 4 红全部归因为判据侧写错**（阈值 `<=` 误读成 `<`；`engine=null` 是空账不是缺席；'
            'D3 切片起点切在注释之外；F1 抬版前预期内），内核与产品面零缺陷。★ 台账同版收口：'
            '`gen_module_consumption_ledger` 重生成后该模块 `prod_call_sites 0 → 1` / '
            '`allowed 0 → 1`，零消费 **21 → 20**（247 模块 / 227 活跃 / 20 合规留存 / 零孤儿）；'
            '`host_beast_baseline` 由 `tools/rebind_host_beast_v3441.py` 抬到当版真读数'
            '（入口 11906 → **11927** 行、成员 1249 → **1256**、合并面 31646 行、TOP40 **41.8%**），'
            '行上界与成员上界**均不抬**（12096 / 1279 不动）。★ 边界：真机 ST 触摸 / 窄屏 / 刷新后'
            '加载**未执行**，全量回归**未跑**（按指令做完计划前不跑全量，读数登记仍停 v3.431.0、'
            '显式待验），降级面未做批量入口与撤销降级；证据核验依赖聊天正文可读，不可读时报'
            '「来源侧未核验」而**不猜**（离线现场大量「判不了」是正确读数）。**L13 进度**：'
            'X1 / X2 / X3 / X7 / **X4** 已交付；X5 / X6 / X8 / X9 待做。')

lines[k] = NEW_HEAD
# 顺读降级链：把紧随其后的原「上一版更新」再降一级，并在中间插入被顶下来的 v3.440.0 摘要。
#   本仓既有形态（实测）：k 后面第一行就是 `> **上一版更新：v3.439.0**...`。
nxt = k + 1
if nxt < len(lines) and lines[nxt].startswith('> **上一版更新：'):
    old_prev = lines[nxt]
    # 原来那行的版本号（v3.439.0）降级为「再前一版」
    m = re.match(r'> \*\*上一版更新：(v[0-9.]+)\*\*', old_prev)
    tag = m.group(1) if m else ''
    lines[nxt] = '> **上一版更新：v%s**（%s）' % (V_OLD, V440)
    if tag:
        lines.insert(nxt + 1, '> **再前一版：%s**%s' % (tag, old_prev[len('> **上一版更新：' + tag + '**'):]))
else:
    # 形态不同：不动别的行，但把 v3.440.0 摘要挂在顶节后面，保证链上有它
    lines.insert(k + 1, '> **上一版更新：v%s**（%s）' % (V_OLD, V440))

out = '\n'.join(lines)
with open(REPO + 'TODO.md', 'w', encoding='utf8') as f:
    f.write(out)

# 自证：第一处「最近更新」必须是当版
hit2 = [i for i, l in enumerate(out.split('\n')) if l.startswith('> **最近更新：')]
head2 = out.split('\n')[hit2[0]]
if ('v' + V_NEW) not in head2:
    sys.exit('[abort] 自证失败：第一处「最近更新」不是 v%s' % V_NEW)
print('TODO done: 顶节已按 v%s 收口（第一处命中行 %d）' % (V_NEW, hit2[0] + 1))