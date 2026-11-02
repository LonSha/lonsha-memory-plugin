#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.441.0 抬版第二步：CHANGELOG 新节 + PLAN 顶节/待验句/版本表。

定位口径按各文件**真源形态**写，不按想象写（这是 v3.440.0 两记 abort 的直接教训）：
  · CHANGELOG：真源首行是 `## v<ver>`（不是 `# ` 一级标题）。新节插在**第一个 `\\n## v` 之前**，
    故守卫改成 `cl.startswith('## v')`；插之前再断言「新版本号尚未出现」（拒绝重复插入）。
  · PLAN：`> **当前执行状态（` 全文件恰 1 处（实测），用它做定位；另有「全量待验句」与
    「版本表行」两处逐字替换，各断言恰 1 处。
TODO 单独一支（bump_v3441_todo.py）：它的 `> **最近更新：` 全文件实测 22 处（历史留痕链），
要求「恰 1 处」就是在健康树上 abort —— 那一支取 `hit[0]`（第一处即当版），并顺读降级留痕链。
"""
import sys

V_OLD = '3.440.0'
V_NEW = '3.441.0'
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
SECTION = """## v3.441.0
**L13-X4 证据缺口工作台：把「我这些结论里哪些证据其实薄得撑不住」做成一个可审阅的面**
- **本版起点仍是一条硬读数**：`memory-archaeology-gap-bench.js` 登记在 `manifest.extra_js`、真被加载、`v3385` 单测绿，而 `module_consumption_ledger` 里 `prod_call_sites = 0` —— 产品端一次都没调用。它的能力此前只到「手工造线索树 + 单条准入」，**没有任何一面回答「哪些结论证据薄」**。于是「这条事实可不可信」在面板上只剩「有值 / 没值」一种读数；而「没值」被读成「没有这个事实」还是「没记过」，谁也说不清。
- **三档成因穷尽且互不同形（本版最核心的判定口径）**：`no-source`（从没证据：证据文本为空，且历史里也没有带来源的登记）/ `source-lost`（证据被删或裁：账上**写着**证据引用，但它在当前正文里已经找不到）/ `contradicted`（证据互相矛盾：同主语在未决矛盾账里有多版本）。计划原文点名「三档不许合成一个『缺证据』」，故：面板**分四格渲染**（矛盾 → 失效 → 从没 → 判不了），每格独立计数、独立人话，三档 `note` 逐档不同文；负控制就拆这一条。
- **「判不了」不是第四种成因，而是两个布尔**：`sourceChecked` / `conflictChecked`。内核 `resolveSource` 严格三态 —— `true` 找到 / `false` 找不到 / **`null` 判不了**（`sourceChecked` 留 false，**绝不凑一档**）。诊断层再套一道长度门槛：`evidence` 常是极短时间标签（「清晨」「第3天」），这类在正文里逐字找不到是**常态**，一律判 `source-lost` 会把几乎所有条目栽赃成「证据丢了」。故 `< 6` 字只做「找得到 → true」，找不到一律 `null`。同理 `conflictsAvailable === false`（宿主根本没这本账）时绝不报「查过没矛盾」。
- **双表并存（本仓最容易悄悄退化的那类口径）**：`counts` 按**主因**计数（一条只进一格，总和 = 薄条目数）、`hitCounts` 按**命中**计数（多因条目在多格出现，总和可 > 薄条目数）。只看 `counts` 会漏掉「这条也矛盾」，只看 `hitCounts` 会以为总条数变多了 —— 两张都出，各有各的读者。条目的 `causes` 保留全部命中（去重、按严重度降序），`cause` 只取最严重的一条当主因用于排序与徽章。
- **动作面只有两个，且没有「一键补全」**：`去补证` 只是**跳转**到 `lockedfacts` 让人手打一条正文事实（本面无法代劳 —— 代劳就是计划明令禁止的「由模型无凭捏造补全」）；`降级为推测` 是**逐条**（批量会掩盖误操作），走宿主 `evidenceGapDowngrade`，**不新开写入口**：落笔仍走既有两个 owner —— `fact-version.setOrigin`（改可信来源，`stated 0.8 → inferred 0.3` 低于 `DEFAULT_MIN_TRUST 0.5`，于是该条自动被「现状查询」挡住）与 `DeltaBook.add(summary, 'uncertain', floor)`（人读侧留痕，落进既有 `deltas` 视图）。②失败**不回滚**①（回滚会让「改了但没留痕」变成「什么都没发生」，比漏记更难查），但必须如实报 `skipped:<why>`。
- **只读面自证只读**：`evidenceGapBench` **不落任何缓存**（连 `_evidenceGapRead` 都不写）—— 缓存本身也是一次写，验收要求的「操作前后既有槽位逐字不变」会把缓存记成违规。判据 C1 双向核对：读数前后 `facts` / `seq` / `conflicts` 三段 JSON 逐字相同、engine 的键集合不变、重复读两次仍不改账。
- **已撤销条目单列不静默跳过**：`revoked === true` 不进缺口盘（撤销本身就是一次处置，再列一遍会催人做第二遍处置），但 `skippedRevoked` 单列计数 —— 静默跳过等于把它们藏了。这条有独立负控制（E4）。
- **面板 `archive` 视图改造成「🧾 证据缺口 · 存档体检」**：缺口面在上（内容体检）、存档体检在下（容器体检），`body = gapBlock + archiveBody` 拼装。三种态各有机读标记且**不同形**：缺席 `data-ls-face="absent"` + 文案明写「**不是「证据都齐了」**，是这个面没装上」；空态 `data-ls-gap-face="empty"` 且**必须念出** `scanned` / `thick` / `threshold`（只说「没有缺口」会让一次空扫（0 条事实）与一次真扫（扫了 40 条都够厚）同形）；有缺口按四格 `data-gap-group="<cause>"` 分列，条目带 `data-gap-fact` / `data-gap-cause`，多因条目显示「同时命中 X/Y」。两侧核验状态行常驻（`chk.source` / `chk.conflict`），整行颜色随是否双绿切换。
- **判据 `tests/v3441_l13_x4_evidence_gap.test.mjs` 18 条**（A 内核三档 5 / B 面板 3 / C 只读自证 2 / D 降级 3 / E 负控制 4 / F 当版锚 1），含**四条真源码破坏各配原版对照**：① 判不了被写成证据丢了；② 矛盾被并进从没证据；③ 矛盾账不在却当「查过」；④ 已撤销条目被静默跳过。
- **首跑 4 红，逐条归因为判据侧写错（内核与产品面零缺陷）**：
  1. A4「阈值抬到 2 就一条不剩」—— 阈值口径是「证据数 **<=** 阈值即入盘」，`2 > 2` 不成立 ⇒ f_thick 仍入盘。我把「<=」误读成「<」。改为断言可观测差异：threshold 1 → thick 1 / thin 4；threshold 2 → thick 0 / thin 5。
  2. C2「engine 传 null 就是面没装上」—— 实际语义是：`engine` 为 null 时本面照样能扫（事实账读成空、矛盾账读成不在），给的是 `ok:true / scanned:0` 的**空账**，不是缺席。这两态本来就该不同形（缺席 = 模块取不到 ⇒ `ok:false` + reason）。改为核实「不抛 + 空账如实报 0」，缺席态另用真·无库的 `bindDeps` 造。
  3. D3 切片起点错 —— 我从 `function _gapBenchLib() {` 起切，而口径注释写在函数**之前**，于是「与 memory-archaeology.js 的分野」那句被切在片外。起点改为注释块首行（本文件唯一），并补一条「真取数口必须在片内」防止只切到注释。
  4. F1 当版锚 —— 抬版前预期内（3.440.0 vs 3.441.0），抬版后转绿。
- **台账与基线（读数零手抄，全部由脚本从探针/生成器落盘）**：`tools/gen_module_consumption_ledger.mjs` 重生成后该模块 `prod_call_sites 0 → 1` / `allowed 0 → 1` / `why: active`，零消费 **21 → 20**；`scan_module_consumption` 复跑 **247 模块 / 227 活跃 / 20 合规留存 / 零未登记孤儿**；`host_beast_baseline.json` 由 `tools/rebind_host_beast_v3441.py` 抬到当版真读数（入口 11906 → **11927** 行、成员 1249 → **1256**、合并面 31420 → **31646** 行、TOP40 **41.8%**），行上界与成员上界**均不抬**（12096 / 1279 不动 —— 余量仍在 slack 内，不抬即是不给增长开口子）。
- **诚实边界**：
  1. 真机 SillyTavern 的触摸 / 窄屏 / 刷新后加载**未执行**（`realhost_readings.json` 本版仍是 `environment-unavailable`，reason 已写「本版未执行真机复核（按纪律不写成通过）」），**不写成真机通过**。
  2. 全量回归**未跑**：按用户指令「做完计划全部内容前别跑全量」，本版只跑单门 / 单套件；全量读数登记仍停在 v3.431.0，显式标待验。
  3. `skip / 降级` 的落笔面只在 `archive` 视图提供，**未**做批量入口、**未**做撤销降级（`setOrigin` 回改仍是既有 `fact-version` 面的能力，本面不重造）。
  4. 证据引用核验依赖宿主聊天正文可读；不可读时本面报「来源侧未核验」而**不猜** —— 故离线/无聊天现场会看到大量「判不了」，这是正确读数，不是缺陷。
"""
cl = read('CHANGELOG.md')
if not cl.startswith('## v'):
    sys.exit('[abort] CHANGELOG 头部形态不符（真源首行应为 `## v<ver>`，实为 %r）' % cl[:12])
if ('## v' + V_NEW) in cl:
    sys.exit('[abort] CHANGELOG 已含 `## v%s` —— 拒绝重复插入' % V_NEW)
marker = '\n## v'
pos = cl.index(marker)
cl = cl[:pos + 1] + SECTION + cl[pos + 1:]
write('CHANGELOG.md', cl)
print('CHANGELOG done: 新节已插在首个 `## v` 之前')

# ---------- 2. PLAN 顶节 ----------
PLAN_STATUS = """> **当前执行状态（2026-11-02，v3.441.0）**：**L13-X4 证据缺口工作台已交付** —— 把一个 `prod_call_sites=0` 的内核（`memory-archaeology-gap-bench.js`，登记在册、真被加载、单测绿、产品端零调用）接成产品面。三档成因**穷尽且互不同形**：`no-source`（从没证据）/ `source-lost`（证据被删被裁）/ `contradicted`（同主语在未决矛盾账里有多版本）。「判不了」不是第四种成因，而是两个布尔 `sourceChecked` / `conflictChecked` —— 内核 `resolveSource` 严格三态（`true` / `false` / **`null` 判不了**，绝不为凑一档把「没核验」写成「证据丢了」），诊断层再套长度门槛（`< 6` 字的短引用找不到一律 `null`，因为时间标签类引用在正文里找不到是常态）；`conflictsAvailable === false` 时绝不报「查过没矛盾」。双表并存：`counts` 按主因（一条只进一格）、`hitCounts` 按命中（多因条目多格出现）。动作面只有两个且**没有一键补全**：`去补证` 只是跳 `lockedfacts` 让人手打（本面不代劳 —— 代劳就是模型无凭捏造补全），`降级为推测` 逐条走宿主 `evidenceGapDowngrade`，落笔仍走既有 `fact-version.setOrigin`（`stated 0.8 → inferred 0.3` 低于门槛 0.5 ⇒ 自动被现状查询挡住）与 `DeltaBook.add(..., 'uncertain', floor)`（落进既有 `deltas` 视图）两个 owner，②失败不回滚①但如实报 `skipped:<why>`。只读面**不落任何缓存**（缓存本身也是一次写）。已撤销条目单列 `skippedRevoked` 不静默跳过。面板 `archive` 视图改造成「🧾 证据缺口 · 存档体检」，缺口在上容器在下（`body = gapBlock + archiveBody`），三态不同形（缺席明写「**不是「证据都齐了」**，是这个面没装上」；空态必须念 `scanned`/`thick`/`threshold`，否则空扫与真扫同形），四格分列 + 两侧核验状态行常驻。★ 判据 `tests/v3441_l13_x4_evidence_gap.test.mjs` **18 条全绿**（A 内核 5 / B 面板 3 / C 只读自证 2 / D 降级 3 / E 负控制 4 / F 当版锚 1），含四条真源码破坏各配原版对照（判不了写成证据丢了 / 矛盾并进从没证据 / 账不在却当查过 / 撤销被静默）。★ **首跑 4 红全部归因为判据侧写错**（阈值 `<=` 误读成 `<`；`engine=null` 是空账不是缺席；D3 切片起点切在注释之外；F1 抬版前预期内），内核与产品面零缺陷。★ 台账同版收口：`gen_module_consumption_ledger` 重生成后该模块 `prod_call_sites 0 → 1` / `allowed 0 → 1`，零消费 **21 → 20**（`scan_module_consumption` 247 模块 / 227 活跃 / 20 合规留存 / 零孤儿）；`host_beast_baseline` 由 `tools/rebind_host_beast_v3441.py` 抬到当版真读数（入口 11906 → **11927** 行、成员 1249 → **1256**、合并面 31646 行、TOP40 **41.8%**），行上界与成员上界**均不抬**（12096 / 1279 不动，余量仍在 slack 内）。**边界保留**：真机 ST 触摸 / 窄屏 / 刷新后加载**未执行**（`realhost_readings` 仍 `environment-unavailable`，reason 已写「本版未执行真机复核」），全量回归**未跑**（用户指令：做完计划全部内容前别跑全量；读数登记仍停 v3.431.0，显式待验），降级面未做批量入口、未做撤销降级（回改仍归既有 `fact-version` 面）；证据引用核验依赖聊天正文可读，不可读时报「来源侧未核验」而**不猜**（离线现场看到大量「判不了」是正确读数）。**L13 进度**：X1（沿革回放）/ X2（反事实推演）/ X3（视角投影）/ X7（习惯与成长证据）/ **X4（证据缺口工作台）** 已交付；X5 / X6 / X8 / X9 待做（X 面交付序：只读面先做 —— X7、X4 已落，其后 X6 / X8 / X9，最后 X5）。**上一版 v3.440.0**：L13-X7 习惯与成长证据面（两块账分开存分报不互相充抵，证迹由既有 `agencyContractAct('practice')` 顺带产出，读面同时给 `unproven` 与 `orphan`）。**再前一版 v3.439.0**：L13-X3 视角投影面（`povs` 从「列名单」变成「用这个角色的眼睛看这一轮」，五档 knows/suspects/believes/blind/undecided，`blind` 与 `undecided` 永不同形）。**再前一版 v3.438.0**：L13-O6 注入面「这一轮用了什么」可复算。**再前一版 v3.437.0**：L13-O5 世界线口径对玩家的可读化（none 态**不出现「安全」二字**）。**再前一版 v3.436.0**：L13-O4 面板视图入口可达性（26 视图全部导航可达 / 零可达 0，本版给它补了 fail-closed 的 exit 2 通道与三态自述）。**再前一版 v3.435.0**：L13-O3 只读视图机器可读四态 + L13-O8 记忆软删闭环。**真宿主门**：v3.433.0 曾在真实 SillyTavern 1.19.0 隔离现场跑通过一次（29 条真实读数 / 0 缺陷 / exit 0）；此后盘面已多次变更，该读数按「历史跑通、当版待复跑」对待。
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
print('PLAN done: 顶节 / 全量待验句 / 版本表 均已按 %s 收口' % V_NEW)