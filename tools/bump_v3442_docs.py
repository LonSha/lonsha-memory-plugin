#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.442.0 抬版第二步：CHANGELOG 新节 + PLAN 顶节/待验句/版本表。

★ 本版**必须提前防住** v3.441.0 踩过的「CHANGELOG 首行陷阱」：
  上一版脚本的插入锚是「第一个 `\\n## v` 之前」。而 CHANGELOG.md 的**首行就是 `## v<ver>`**
  （文件无任何前导换行），于是 v3.441.0 那一段被插到 v3.440.0 块**结束之后**（第 22 行），
  scan_version_guard 的 V6（「CHANGELOG 顶节 == VERSION」）当场判红，
  事后要另写 tools/fix_changelog_head_3441.py 整块搬到文件最前才修好。
  本脚本的定位口径改成**先判首行形态**：
    · 若 `cl.startswith('## v')` —— 直接前置（`SECTION + cl`），不找锚；
    · 否则才退化为「插在第一个 `\\n## v` 之前」，并在插入后断言顶节就是新版本号。
  插入前后都断言「顶节版本号 == V_NEW」，写入后**重新读盘**再断言一次（防写偏）。
"""
import sys

V_OLD = '3.441.0'
V_NEW = '3.442.0'
REPO = '/home/user/lonsha-memory-plugin/'


def read(p):
    with open(REPO + p, 'r', encoding='utf8') as f:
        return f.read()


def write(p, s):
    with open(REPO + p, 'w', encoding='utf8') as f:
        f.write(s)


def sub_exact(text, old, new, expect, label):
    n = text.count(old)
    if n != expect:
        sys.exit('[abort] %s: 期望 %d 处，实测 %d 处' % (label, expect, n))
    return text.replace(old, new)


# ---------- 1. CHANGELOG 新节 ----------
SECTION = """## v3.442.0
**L13-X6 静音清单面：把「我现在把什么静音了」做成一个常驻可解的面 —— 但在画面之前，先补上「有地方存」**
- **本版起点是两条硬读数，第二条比第一条更要紧**：① 全仓零常驻静音清单 —— `silenceExplainState` 只在「问为什么召不回」时才被调用，没有任何一面回答「我现在把什么静音了」；② `seasonState` / `topicSeasons` 在 `index.js` / `memory-organs.js` / `memory-core.js` 三个文件里**一次都没出现**（除诊断层读它之外零写入点），也不在 `WorldProgress` 的**构造 / 导出 / 导入**三处枚举里 —— 而对照组 `institutionRules` / `symbolicEntities` / `eraTransitions` / `growthBundles` 三处都在。也就是说：**静音存盘即丢、读档即空**。所以本版不是「再画一个视图」，而是先补「有地方存」，再画面。
- **持久化三处（memory-organs.js）**：构造处显式落格 `this.seasonState = null;` 与 `this.topicSeasons = [];`（不靠「反正后面会赋」），导出面带类型守卫（`seasonState` 必须是对象且非数组，否则落 `null`），导入面畸形回落空账（`topicSeasons` 走 `Array.isArray`）。**两格语义不同、不许合并成一个**：`seasonState` 是**动作表**（`topicId → 'mute'|'defer'|'embrace'|'probe'`，由 `memory-season.js` 的 `applySeasonAction` 写）、`topicSeasons` 是**主题本体表**（`id` / `location` / `actors` / `evidenceCount` / `isSecret` / `title`）。导入面**不逐字段校验** —— 合法性由内核归一，在这里再校一遍就是第二套判据。
- **两源分列，永不合并（本面最容易被「优化」掉的一条）**：`ctx`（本轮上下文 `mutedTopicIds`，重开对话即失效）与 `season`（持久存档 `userActions[mid] === 'mute'`，跨楼跨存档都在）各成一列；同一 `topicId` 在两源都出现时**两列都保留** —— 「持久静音 + 本轮又静了一次」本身就是两条信息，去重合并就把它压成一条。`counts` 的 `ctx + season = total` 是**条数不是主题数**（实测现场：4 条去重后是 3 个主题），面板文案逐字自述「**不相加成「当前被静音的主题数」**」，本档把这两个数写死成断言防后来者互换。
- **三态不同形**：不可用（`ok:false` + `reason:'module-unavailable'` + `state:'unavailable'`，面板明写「**不是「你没有静音任何东西」**，是这个面没装上」）/ 真的没有（`ok:true` + `total 0` + 说明「怎么才会有」）/ 有静音（两源分列 + 逐条可解）。缺席面与在场面**逐字同键**（面板才能用同一套渲染而不猜）。另有一个 `listable: {ctx, season}`：`season === false` 表示「**没有这份账**」，与「这份账是空的」不同形。
- **`since` / `until` 口径（最容易被读错的一处）**：内核 `applySeasonAction` 只写动作词、**不记时间**，`seasonState` 只有一个全局 `updatedAt`。故持久源只能报 `sinceKind: 'last-season-action'` + `since: updatedAt`，并**自报这是哪一种**（本轮源是 `this-run` + `since: null`，取不到就 `unknown`）—— 把全局时间冒充「这一条的静音起点」是本仓治过的错读数。`until` **恒 `null`**：本仓没有静音到期机制，写一个时间就是凭空承诺。
- **解除面只有「逐条」一个动作，且没有「全部解除」**：`silenceLift` 只认一个 `topicId`，**内核层与面板层都不存在批量入口**（判据有反向断言，`data-silence-(all|bulk|lift-all)` 一个都不许出现）。理由不是风格 —— 一键全解会掩盖误操作（事后分不清「原本就一条」与「刚被全解」）。解除走 `applySeasonAction(st, tid, 'embrace')`，**不 delete 键**：删键会让「曾经因用户意愿静音过」这段历史消失，而 `embrace` 是内核本来就认的动作词，落在同一张动作表里可审计。
- **五个失败原因码互不同形**：`topic-id-required` / `not-muted`（本来就没静音，`defer` 项也算这一类 —— 延后不是静音）/ `ctx-only-muted`（**只在轮上下文里静音，本面改不动调用方的 ctx**，如实报「要重开对话或让调用方移除」而**不假装已解除** —— 假承诺会让下一轮它还在）/ `module-unavailable` / `no-world-progress`。失败路径**一个字都不写账**（判据 D2 前后逐字比对 `seasonState`）。
- **只读自证抓到一处真缺陷**：`silenceListState` 的 `echo`（把四问的静音读数挂上来对账）原本直接调 `silenceExplainState(engine, { ctx })`，而该函数末尾要写 `engine._silenceExplainCtx`（它需要记住判定输入）—— 于是「列一次清单」就把调用方的判定输入覆盖成本面装配的那份 ctx（键序变 + 多出三个默认字段），状态行下一次归因会按被覆盖的输入走。修法：echo 用 `Object.create(engine)` 的**一次性代理**跑四问 —— 读（`worldProg` / `_silenceExplainCtx` / `_worldlineRecallFilter`）走原型链与真跑同源，写（`_silenceExplainRead` / `_silenceExplainCtx`）只落代理，真 engine 一格不沾。不用 `{ worldProg: wp }` 平面对象：那会丢掉 `_worldlineRecallFilter`，让 echo 的静音数与真跑不同源。
- **面板**：新增 `data-view="silence"` 入口卡（读数取 `s.silenceListState({})`，`ok !== true` 时显示 `—` 而**不是 0`）+ 渲染分支（+65 行，`slHead` / `slRow` 带 `data-silence-src` / `data-silence-id` / `data-silence-lift`，不可解条目明写「本轮静音改不动…要重开对话或让调用方移除」，有静音时念「本轮 N 条 · 持久 M 条 · 合计 T 条」+ 四问 `echo` 对账）+ 交互绑定（+36 行，逐条 `ov.querySelectorAll('[data-silence-lift]')` → `s.silenceLift({topicId})`，成功 toast「🔓 已解除…（mute → embrace，其它静音不受影响）」后 `showBrowser('silence')` 按同一视图重建，不在 DOM 上就地改）。视图总数 26 → **27**，`scan_ui_view_reach` **27 视图全导航可达 / 零可达 0**（nav 里含 `silence`）。
- **判据 `tests/v3442_l13_x6_silence_list.test.mjs` 14 条**（A 两源分列 3 / B 三态与面板 2 / C 只读自证 1 / D 逐条解除 3 / E 负控制 3 / F 接线面+当版锚 2），含**三条真源码破坏各配原版对照**：① 把两源合并成一列（`items = seasonItems.slice()`）；② 摘掉 ctx-only 短路（本轮静音会被报成已解除）；③ 解除时整表重建（`seasonState = { userActions: {} }`，等于全部解除）。
- **首跑 4 红，逐条归因（2 产品侧 / 1 判据侧 / 1 抬版前预期内）**：
  1. **B1 产品侧真缺陷** —— 缺席态 `state` 被写成字面量 `'ok'`，与 `noKernel` 无关 ⇒「内核没装上」与「你真没静音」在 `state` 上同形。修成 `state: noKernel ? 'unavailable' : 'ok'`（与 `absent()` 的 `state:'unavailable'` 对齐，同一语义只许一种写法）。
  2. **C1 产品侧真缺陷** —— 就是上面「只读自证抓到的那一处」：echo 回写了 `_silenceExplainCtx`。用一次性代理隔离后 `before/after` 逐字相同。
  3. **E3 判据侧写错（假绿）** —— 破坏注入写的是 `wp.seasonState = { userActions: {} };`，而判据只认 `userActions = {}` 这种独立赋值（真源里实测 count=0）⇒ 破坏注进去后判据仍返回 `[]`。这是**判据自己漏判**，不是产品缺陷。修法：整表重建认两种写法（独立赋值 / 对象字面量），并补一条「解除路径不得整对象重写 `seasonState`」。
  4. **F2 当版锚** —— 抬版前预期内（3.441.0 vs 3.442.0），抬版后转绿。
- **诚实边界**：
  1. 计划验收里「**召回面验证被解除条目真能召回**」一条**未执行**：本版只做到面板与账层（解除后 `userActions[tid]` 从 `mute` 变 `embrace`，账层可验），**没有真跑一次召回**证明它确实回到了候选里。如实登记为未执行，不写成通过。
  2. 真机 SillyTavern 的触摸 / 窄屏 / 刷新后加载**未执行**（`realhost_readings.json` 本版仍 `environment-unavailable`，reason 已写「本版未执行真机复核（按纪律不写成通过）」）。
  3. 全量回归**未跑**：按用户指令「做完计划全部内容前别跑全量」，本版只跑单门 / 单套件；全量读数登记仍停在 v3.431.0，显式标待验。
  4. `ctx` 源的静音**本面改不动**（那是调用方给的输入）：面板对该类条目只显示「不可解 + 原因」，不提供按钮 —— 提供一个点了没反应的按钮比不提供更坏。
"""

cl = read('CHANGELOG.md')
if ('## v' + V_NEW) in cl:
    sys.exit('[abort] CHANGELOG 已含 `## v%s` —— 拒绝重复插入' % V_NEW)
if cl.startswith('## v'):
    # ★ 首行陷阱的正解：真源首行就是 `## v<ver>`，无前置换行 ⇒ 直接前置。
    cl = SECTION + cl
    how = '首行即 `## v` ⇒ 直接前置'
else:
    marker = '\n## v'
    pos = cl.index(marker)
    cl = cl[:pos + 1] + SECTION + cl[pos + 1:]
    how = '退化：插在首个 `\\n## v` 之前'
write('CHANGELOG.md', cl)
# 写盘后重新读盘自证顶节（防写偏 / 防插到别处）
head = read('CHANGELOG.md').split('\n')[0]
if head != '## v' + V_NEW:
    sys.exit('[abort] 顶节断言失败：期望 `## v%s`，实为 %r' % (V_NEW, head))
print('CHANGELOG done: %s（顶节 = %s）' % (how, head))

# ---------- 2. PLAN 顶节 ----------
PLAN_STATUS = """> **当前执行状态（2026-11-02，v3.442.0）**：**L13-X6 静音清单面已交付** —— 但在画面之前先补了「有地方存」。起点两条硬读数：① 全仓零常驻静音清单（`silenceExplainState` 只在「问为什么召不回」时才用）；② `seasonState` / `topicSeasons` 在 `index.js` / `memory-organs.js` / `memory-core.js` 里**一次都没出现**、也不在 `WorldProgress` 的构造/导出/导入三处枚举里（对照组 `institutionRules` / `symbolicEntities` / `eraTransitions` / `growthBundles` 三处都在）⇒ **静音存盘即丢、读档即空**。故 `memory-organs.js` 先补三处（构造显式落格 / 导出带类型守卫 / 导入畸形回落空账），两格语义不同不许合并：`seasonState` 是**动作表**（`applySeasonAction` 写 `mute|defer|embrace|probe`）、`topicSeasons` 是**主题本体表**；导入面**不逐字段校验**（合法性归内核，再校一遍即第二套判据）。内核三出口：`silenceListState`（只读、`writesNothing:true`）/ `silenceLift`（**只认一个 topicId，无批量入口**）/ `_silenceListLine`。**两源分列永不合并**：`ctx`（本轮）与 `season`（持久）各成一列，同 id 双源都保留（「持久静音 + 本轮又静了一次」是两条信息），`ctx + season = total` 是**条数不是主题数**（现场 4 条去重后 3 个主题），面板逐字自述「不相加成主题数」。三态不同形：缺席（`ok:false` + `module-unavailable` + `state:'unavailable'`，面板明写「**不是「你没有静音任何东西」**，是这个面没装上」）/ 空账（`ok:true` + `total 0` + 怎么才会有）/ 有静音；`listable.season === false` 表示「**没有这份账**」而非「账是空的」。`since` 口径：内核只写动作词不记时间 ⇒ 持久源只能报 `sinceKind:'last-season-action'`（取全局 `updatedAt`）并自报这是哪一种，本轮源 `this-run` + `since:null`，**绝不把全局时间冒充逐条起点**；`until` **恒 null**（无到期机制，写时间=凭空承诺）。解除只逐条、走 `applySeasonAction(...,'embrace')`、**不删键**（删键抹掉「曾经静音过」的历史），五个原因码互不同形（`topic-id-required` / `not-muted`（defer 也算这类）/ `ctx-only-muted`（本面改不动调用方 ctx，如实报而不假装解除）/ `module-unavailable` / `no-world-progress`），失败路径**一个字不写账**。面板新增 `data-view="silence"`（入口卡读数 `ok!==true` 时显示 `—` 不是 0；渲染 +65 行带 `data-silence-src`/`-id`/`-lift`；绑定 +36 行逐条解除后按同一视图重建），视图 26 → **27**，`scan_ui_view_reach` **27 视图全导航可达 / 零可达 0**。★ 判据 `tests/v3442_l13_x6_silence_list.test.mjs` **14 条全绿**（A 3 / B 2 / C 1 / D 3 / E 3 / F 2），含三条真源码破坏各配原版对照（两源合并 / 摘掉 ctx-only 短路 / 解除时整表重建）。★ **首跑 4 红逐条归因：2 产品侧真缺陷 + 1 判据侧假绿 + 1 抬版前预期内** —— ① 缺席态 `state` 写成字面量 `'ok'`（与 `noKernel` 无关，两态同形）修成 `noKernel ? 'unavailable' : 'ok'`；② `echo` 直接调 `silenceExplainState(engine,...)` 会回写 `engine._silenceExplainCtx` ⇒ 列一次清单就覆盖调用方的判定输入（只读自证抓到），改用 `Object.create(engine)` 一次性代理（读走原型链、写只落代理；不用平面对象是为了不丢 `_worldlineRecallFilter`）；③ E3 判据只认 `userActions = {}` 独立赋值（真源 count=0），破坏注入 `seasonState = { userActions: {} }` 后判据仍绿 ⇒ 扩成两种写法 + 补「不得整对象重写 seasonState」；④ F2 抬版前预期内。**边界保留**：计划验收里「**召回面验证被解除条目真能召回**」**未执行**（只做到面板与账层，没真跑召回，不写成通过）；真机 ST 触摸 / 窄屏 / 刷新后加载**未执行**（`realhost_readings` 仍 `environment-unavailable`）；全量回归**未跑**（按指令做完计划前不跑全量，读数登记仍停 v3.431.0、显式待验）；`ctx` 源静音本面改不动，面板只显示「不可解 + 原因」，不提供点了没反应的按钮。**L13 进度**：X1（沿革回放）/ X2（反事实推演）/ X3（视角投影）/ X7（习惯与成长证据）/ X4（证据缺口工作台）/ **X6（静音清单）** 已交付；X5 / X8 / X9 待做（X 面交付序：只读面先做 —— X7、X4、X6 已落，其后 X8 / X9，最后 X5）。**上一版 v3.441.0**：L13-X4 证据缺口工作台（三档成因穷尽且互不同形，`null` 判不了绝不为凑一档写成「证据丢了」；双表 `counts`/`hitCounts` 并存；无「一键补全」）。**再前一版 v3.440.0**：L13-X7 习惯与成长证据面（两块账分开存分报不互相充抵）。**再前一版 v3.439.0**：L13-X3 视角投影面（`blind` 与 `undecided` 永不同形）。**再前一版 v3.438.0**：L13-O6 注入面可复算。**再前一版 v3.437.0**：L13-O5 世界线口径对玩家的可读化。**再前一版 v3.436.0**：L13-O4 面板视图入口可达性。**再前一版 v3.435.0**：L13-O3 只读视图机器可读四态 + L13-O8 记忆软删闭环。**真宿主门**：v3.433.0 曾在真实 SillyTavern 1.19.0 隔离现场跑通过一次（29 条真实读数 / 0 缺陷 / exit 0）；此后盘面已多次变更，该读数按「历史跑通、当版待复跑」对待。
"""

pl = read('PLAN.md')
lines = pl.split('\n')
hit = [i for i, l in enumerate(lines) if l.startswith('> **当前执行状态（')]
if len(hit) != 1:
    sys.exit('[abort] PLAN 当前执行状态行：期望 1 处，实测 %d' % len(hit))
lines[hit[0]] = PLAN_STATUS.rstrip('\n')
pl = '\n'.join(lines)
pl = sub_exact(pl, '**当前 v%s **全量待验**' % V_OLD, '**当前 v%s **全量待验**' % V_NEW, 1, 'PLAN 全量待验句')
pl = sub_exact(pl, '| 版本 | **v%s**（index.js VERSION 真源） | index.js |' % V_OLD,
               '| 版本 | **v%s**（index.js VERSION 真源） | index.js |' % V_NEW, 1, 'PLAN 版本表')
write('PLAN.md', pl)
print('PLAN done: 顶节 / 待验句 / 版本表（%s -> %s）' % (V_OLD, V_NEW))