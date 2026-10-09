#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.299.0 收口：写 CHANGELOG 顶节 + TODO「最近更新」行。
纪律：① 顶节哨兵不得已含（重复执行即退出）；② 原顶节整体降级为历史节（只改标题行）；
     ③ TODO 的「最近更新」行按**行首整行替换**（该行是超长单行，不能按内容锚）。
     ④ 两处写完立即交 `scan_version_guard.mjs` 复验（V6/V7）。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
NEW = '3.299.0'

# ── CHANGELOG 顶节 ──
CHANGELOG_SECTION = """## v3.299.0
**M-O6 事实版本、冲突与撤回的状态统一 —— 五态单一真源 + 有效范围 + 载荷准入门（只读、不写回）**
- **缺口（M-O6 原文）**：事实版本、supersede、stale guard 与修复链都已存在，但真实使用中最易出错的
  是「**新事实已写入，旧投影 / 关系 / 召回仍在使用**」。本轮先固定义、再定点修一处**实测在场**的消费缺陷。
- **★ 修前实测的真缺陷（本轮真跑取证，不是读源码推算）**：`memory-type.js#typedBuckets` 的准入行是
  `if (!o.includeRevoked && f && f.revoked === true) continue;` —— 它**只挡 `revoked`**，
  把 `to != null`（已被换代 / 已闭合）的旧事实**照放**。同一本账实测（A 所在 北京@1 楼 → 上海@5 楼）：
  `typedBuckets(st)['typed:location-state'].length === 2`，宿主载荷里**同时**出现
  「A所在：北京（第1楼起）」与「A所在：上海（第5楼起）」。这正是 M-O6 点名的「旧投影仍在被使用」。
- **交付**：新增模块 `fact-state.js`（纯函数、零依赖、双导出、400 行）—— 把「这条事实现在**算不算数**」
  收成**一处**判定：
  · 五态 `active / superseded / revoked / disputed / unknown`（**穷尽互斥**，每条事实恰落一态，
    自带自证：五态计数合计 == 条目数）；
  · 每态带**理由码**（`open-interval` / `closed-interval` / `revoked-flag` / `dangling-supersession` /
    `explicit-field` / `explicit-conflicts-derived` / `unreadable-entry` / `unknown-state-label`）——
    「状态是谁判的」必须可读，不得只给状态名；
  · `rangeOf`（M-O6 第 2 条「明确时间有效范围」）：`from / to / closed / coversNow` 四栏，
    `coversNow` **三态**（true 区间开着 / false 已闭合 / **null 判不了**（两端都缺））。
- **★ 设计转折：写回式迁移被否决，改为纯读**。首版按「把旧账迁成显式 state 字段」设计，实测**不可行
  且有害**：`fact-version.js#copyFact` 是**白名单逐字段重建**，未列入白名单的 `state` 活不过一次
  `normalize`（实测 `normalize({...f, state:'x'}).facts[i].state === undefined`）；更要紧的是写回会造出
  「推导说 superseded、持久说 active」的**第二份真源**，恰好违反 M-O6 第 4 条
  「**禁止只改展示层掩盖源数据未修复**」。故本模块**只读、幂等、不改入参**：
  `readState()` 每次现算，`selfCheck()` 用两条独立自证钉住这件事 —— ① 连读两次读数逐字相同；
  ② 连读后**账本字节未变**（只测 ① 会被「写回但每趟写同样的值」骗过，故两条都要）。
- **★ 修复的量化读数 `leaked`**：`readState()` 把「**旧口径会放行、新口径必须挡**」的条目**逐条点名**
  （判据与 `memory-type.js` 修前那一行**同源**：非 revoked 即放行），故「本版到底多挡了哪几条」
  是一个可断言、可复算的读数，不是一句自述。诊断行同步点名（`旧口径会放行 N：<id>…`）。
- **★ 载荷准入门收在消费点**：宿主 `typedFactsBlocks()` 在交给 `typedBuckets` **之前**先取
  `readState().entries` 的 `admissible` 集合作**过滤器**；分组口径仍只有 `typedBuckets` 一份
  （准入管「算不算数」、分组管「进哪个分区」，两件事不得合成一套 —— 也已加判据禁止把准入策略
  下沉进 `memory-type.js`）。模块缺席（`extra_js` 未加载）⇒ 退回既有行为，**不静默按新口径**。
- **判据 `tests/v3299_mo6_fact_state_single_source.test.mjs`（14 条，A~J 十段）**：面结构 / 纯读幂等 /
  五态判定 / 有效范围三态 / ★★ 状态准入真跑宿主方法体（旧口径旧值进载荷 → 本版被挡、现行值保留）/
  泄漏同源 / `admitForLoad` 五态分流 / 诊断行与状态回读 / **四条真源码破坏负控制** / 版本锚与登记面。
- **★ 三条不可让步的语义边界（各有判据）**：① `revoked` / `disputed` / `unknown` **不受任何 opts 影响**
  —— 撤回是绝对的，判不了与有争议的条目一律不许冒充「可用事实」进载荷（只有 `superseded` 可经
  `includeSuperseded` 放行，历史回放要用的正是旧版本）；② 无区间的 `coversNow` 必须是 **null**，
  塌成 false 会把「没有区间信息」读成「不在区间内」（**相反动作**）；③ 楼层 `0` 是**合法楼层**，
  不得用 null 冒充（「无区间」与「第 0 楼起」是两件事）。
- **★ 本版自伤三处（全部实测，附修法与判据）**：① `selfCheck` 的账本指纹原先在 `countsOf()` **之后**取，
  而 `countsOf` 自己就会跑一遍 `readState` ⇒ 一个「读时写回」的坏版本已经把字段写进去了、指纹却是
  写完才取，`noWriteBack` **假通过**（抓到它的正是 I3 负控制：破坏副本写回条目而判据仍报绿）；
  修法：指纹在任何读取**之前**取。② A 段的「源码无写回」判据首版把**自己的解释性注释**也数进去
  （锚点 9 处假阳性）⇒ 改为先剥注释、只认**非表达式上下文**的赋值、并用 `(?!=)` 排掉 `===`。
  ③ `v3298` 原先硬锁 `extra_js` 总项数 86 ⇒ 本版如实交棒给当版（历史档只判「自己那一项在场」），
  否则每加一个模块都要回头改历史档（本仓定性过的抬版仪式）；同轮把 v3298 的当版锚降为**出生版本锚**。
- **抬版连带**：版本六处（`index` / `manifest` / `package` + `memory-config` / `memory-core` /
  `memory-organs` 三份副本）；`manifest.extra_js` 86 → 87（新增 `fact-state.js`，排在它所推导的
  `fact-version.js` / `memory-type.js` 之后）；数量锁 `v3209` 两处、`v3247` REGISTRY、
  `catalog_reference_consumers.tsv` 参考基准、README/PLAN 人读读数（版本 / 在役面 279→280 /
  `extra_js` 87 / 运行时模块 88）、`host_beast_baseline` 同源重建、`dead_code_budget` 上界随活跃行数上抬；
  v3298 的当版锚**移交**给 v3299（V4）。
- **★ 逐条对齐 M-O6 原文（诚实版）**：① 五态 ✓；② 有效范围 ✓ + 写入 `revision` 由 `fact-version.js`
  的 `revision` 字段承担（本模块读侧只把它当不透明字段，**不另造一份版本号**）；③ 状态变化**传播** ——
  本轮只落**事实注入面**这一处消费点，摘要 / 图谱 / 时间线 / 召回 / 缓存的传播**另行推进**（不虚报覆盖）；
  ④ 不写回、不掩盖源数据 ✓（见上）。**验收四条**：新事实优先 ✓（旧值被挡、现行值保留）、旧事实仍可追溯 ✓
  （`superseded` 可经 opts 放行 + `transitionOf` 带范围与悬空可读）、撤回后不进载荷 ✓（任何 opts 不可放行）、
  冲突不按「更新时间更晚」自动覆盖 ✓（保守序取严者并点名冲突，`fact-version.js` 的换代仍需两侧 `from`
  且新值更大）、状态变更幂等且可回读 ✓（`selfCheck` 两半自证 + `readState` 逐条可读）。
- 边界（诚实）：**真宿主面未执行**（交付环境无任何可访问的 SillyTavern 实例）；宿主接线由
  「真方法体 + 真模块」在判据内真跑（E 段），不等于在酒馆里实跑过。本版**未跑全量**
  （用户纪律：计划全部内容做完前不跑全量）⇒ 文档如实标「全量待验」。
- **退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移**；本版读数均为**定向复验**（单套件 + 单扫描器），**绝不跑全量**。
"""

CL = ROOT / 'CHANGELOG.md'
src = CL.read_text(encoding='utf-8')
if src.startswith('## v%s' % NEW):
    sys.exit('[close3299] CHANGELOG 顶节已是 v%s（重复执行会重复插入）' % NEW)
if not src.startswith('## v3.298.0'):
    sys.exit('[close3299] CHANGELOG 顶节不是 v3.298.0 —— 停止（不猜结构）')
# 原顶节降级为历史节（只改第一行标题）。用 index() 定位，不猜结构。
old_head = '## v3.298.0'
idx = src.index(old_head)
src = CHANGELOG_SECTION + '## v3.298.0（历史留痕）' + src[idx + len(old_head):]
CL.write_text(src, encoding='utf-8')

# ── TODO「最近更新」行 ──
TODO_LINE = (
    '> **最近更新：v3.299.0** —— **M-O6 事实版本、冲突与撤回的状态统一**（第二期优化计划第三条落版）。'
    '新增模块 `fact-state.js`（纯函数、零依赖、双导出、400 行）：五态 `active / superseded / revoked / '
    'disputed / unknown` **穷尽互斥** + 每态**理由码** + `rangeOf`（有效范围，`coversNow` **三态**，'
    '无区间**留 null** 不塌成 false，楼层 `0` 不拿 null 冒充）。★ **设计转折（实测否决写回式迁移）**：'
    '`fact-version.js#copyFact` 是白名单逐字段重建，`state` 字段活不过一次 `normalize`；且写回会造出'
    '「推导说 superseded、持久说 active」的**第二份真源**，违反 M-O6 第 4 条「禁止只改展示层掩盖源数据'
    '未修复」⇒ 本模块**只读、幂等、不改入参**，`selfCheck` 用两条独立自证钉住（读数连读两次逐字相同 + '
    '账本字节未变）。★ 修前实测的真缺陷：`memory-type.js#typedBuckets` **只挡 `revoked`**，'
    '放行 `to != null` 的已换代旧事实 ⇒ 旧值仍进类型化注入面（同账实测两条并列在场）。'
    '宿主 `typedFactsBlocks()` 现按 `readState().entries.admissible` 前置过滤（分组口径仍只有 '
    '`typedBuckets` 一份，准入不下沉）。★ `readState().leaked` 把「旧口径会放行、新口径必须挡」的条目'
    '**逐条点名**，「本版多挡了哪几条」是可复算读数。★ `revoked / disputed / unknown` **不受任何 opts 影响**'
    '（撤回是绝对的），只有 `superseded` 可经 `includeSuperseded` 放行。★ 本版自伤三处（附修法）：'
    '`selfCheck` 指纹原在首次读之后取 ⇒ 写回被漏判（`noWriteBack` 假通过，抓到它的正是 I3 负控制）；'
    '「源码无写回」判据首版把自己的解释性注释也数进去（9 处假阳性）；v3298 原硬锁 extra_js 总项数 ⇒ 如实交棒。'
    '判据 `tests/v3299_mo6_fact_state_single_source.test.mjs`（14 条）+ 四条真源码破坏负控制 + 抬版连带'
    '（版本六处 / `extra_js` 86→87 / 数量锁 / REGISTRY / tsv / README-PLAN 读数 / host_beast 重建）。'
    '★ 逐条对齐原文：本轮只落**事实注入面**这一处消费点，摘要 / 图谱 / 时间线 / 召回 / 缓存的传播另行推进'
    '（不虚报覆盖）。'
)

TODO = ROOT / 'TODO.md'
tlines = TODO.read_text(encoding='utf-8').split('\n')
hit = [i for i, l in enumerate(tlines) if l.startswith('> **最近更新：v3.298.0**')]
if len(hit) != 1:
    sys.exit('[close3299] TODO「最近更新：v3.298.0」行命中 %d 次（要求恰 1 次）' % len(hit))
tlines[hit[0]] = TODO_LINE
TODO.write_text('\n'.join(tlines), encoding='utf-8')

print('[close3299] CHANGELOG 顶节已换为 v%s（原顶节降级为历史节）；TODO 最近更新行已换。' % NEW)