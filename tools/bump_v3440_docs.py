#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.440.0 文档三件套（CHANGELOG 新节 / PLAN 顶节 / TODO 顶节）。

为什么单独一支：首跑 `tools/bump_v3440.py` 在 CHANGELOG 处 abort ——
本仓 CHANGELOG **没有一级标题**，首行直接是 `## v3.439.0`，而脚本的守卫写的是
`cl.startswith('# ')`（那是另一个仓/早期的形态）。abort 是好的（不静默改一半），
但版本号与两份 audit json 已经落盘，重跑整支会在「index.js 里已经找不到 3.439.0」处再 abort。
故本脚本只做剩下三件，且把 CHANGELOG 的守卫改成按真实形态（首行 `## v`）。
"""
import sys

V_OLD = '3.439.0'
V_NEW = '3.440.0'
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


SECTION = """## v3.440.0
**L13-X7 习惯与成长证据面：把一个「登记在册但产品端零调用」的内核接成可读面，并顺势修掉两处真缺陷**
- **本版起点是一条硬读数，不是计划勾选**：`character-habit-growth-evidence.js` 在 `manifest.extra_js` 里登记（第 178 项）、真被加载、单测全绿，而 `prod_call_sites = 0` —— 产品端一次都没调用过。这就是本仓 L13 一直在清的那一类「功能级失效」：**模块活着，功能没接上**。而产品侧「他有这个习惯」这件事在两处都对不上：`habitRepos` 只记「形成了什么习惯 + 成形次数」，四阶段证迹（尝试 / 在特定条件下有效 / 遭遇过失败 / 迁移到新场景）没有任何读面。
- **两块账必须分开（本版最核心的架构决定）**：习惯本体在 `worldProg.habitRepos`（按 `context + approach` 二元组认人，累计 3 次 `success` 成形、`failure` 转 `under_review`）；成长证据束新建 `worldProg.growthBundles`（`habitKey` = `context|approach`，逐条记录 `stage / evidenceId / description / contextCondition`）。**分开存、分开报、不互相充抵** —— 并成一块就会让「形成了习惯」冒充「有据可查」。读面因此同时给出两组差额：`unproven`（本体在、证迹缺 ⇒ 成形待证）与 `orphan`（证迹在、本体缺 ⇒ 无主束），两者各自单列，互不合并。
- **写入同源（不新开写入口）**：证迹由**既有** `agencyContractAct(engine, 'practice', payload)` 分支顺带产出，返回值多一个 `evidence` 字段（`'recorded'` 或 `'skipped:<why>'`）。**没有** `habitGrowthAct` / `habitGrowthAppend` / `habitGrowthRecord` —— 在这里再开一个写入口就等于第二套习惯账。三条理由写进代码注：① 本体与证迹必须由同一次动作产出（分两入口会出现「本体记了、证迹漏了」）；② 证据 id 缺省取练习 id（能回查到那一楼）；③ **证据写入失败不得回滚本体**，但必须如实报 `skipped:<why>` —— 静默漏记比漏记更坏。
- **内核补三样（83 → 185 行，均为读面所需、不改既有语义）**：① `habitKey` 原样透传（旧 bundle 无该字段时读面回落 `skillOrHabit`，不迁移历史数据）；② `describeGrowth` 纯读摘要（四阶段计数 / 最远阶段 / 可读名 / 证据 id 去重 / 最近一条 / `degraded`），完全不改入参、不抛；③ `STAGE_LABELS` 与 `STAGE_ORDER`（面板与诊断行都从这里取可读名，不许各自写一份中文 —— 两份会漂）。`STAGE_ORDER` 只用于回答「最远到过哪一阶段」，**不求和、不加权**。
- **本版自己抓到并修掉的真缺陷：两处，都在内核/判据链上**：
  1. **`evaluateCompetencyAfterRevocation` 的产物进了读面就成了空束**。它返回 `validRecords` 而 `describeGrowth` 读 `records` —— 于是「撤回证据」这一步的结果交给读面时 `total: 0`、`status: 'empty'`，把本模块最核心的承诺（**绝不静默归零**）在链条上破了个口。修法：返回值补 `records: validRecords`（`validRecords` 原名保留，既有调用方与判据按它断言）。这条是判据档 A 段当场抓出来的，不是事后想到的。
  2. **负控制假绿第二形两处，改的是夹具与破坏点，不是放宽判据**。① N1 原把守卫写成 `st = "attempted"`，而 `st` 是 `const` ⇒ 破坏副本一进来就抛 `TypeError`、被 `describeGrowth` 自己的 `catch` 兜成 `degraded` 空摘要，断言确实翻红了，但红的原因是「破坏把自己弄崩了」。改为 `counts.attempted += 1`（行为真变）。② N2 原挑 `provenKeys.has(...) continue` 作破坏点，而该处只在「有本体而无 items」时才走到，夹具里 `growthBundles` 为空 ⇒ 守卫永假、破坏等于没写。改为挑 `if (!d.total) continue;`（只要有一束就必然执行），并给夹具补一条**零证迹的束**，让「空束不得进证据列表」这条断言真的可被破坏。
- **判据侧另外两处自伤（同样是当场改，不静默放宽）**：① E 档窗口原从「面标题」起算 5200 字符，而读数点（`hg.groups` / `counts.unproven`）在标题**前** 3589 字符 —— 判据在看拼装段而不是整块，对「面板其实没按分组渲染」这种真缺陷什么都不说（假绿）。改为「分区注释头 → `hgBlock;`」整块。② 该整块里写着「不做『经验值 / 等级』类展示」这句**口径声明**，对未剥注释的原文判，等于禁止在代码里写清自己不做数值条（判据反咬自己）。改为先 `stripComments` 再判；且起点必须回退到**该注释块的开始标记**（分区标记落在块注释内部，从标记处起切会把注释剖成两半，`stripComments` 认不出这半段，剥完长度不减、口径句仍命中 —— 实测抓到过）。
- **面板 `protagonist` 视图新增「🌱 习惯与成长证据」三态分区**：有据（按角色分组，逐条 `data-habit-key` / `data-habit-status`，凭据行列出 `evidenceIds`，无凭据编号时黄字警告「只记了次数，回不到那一楼」）/ `empty`（`faceHTML(...)` 带「怎么开始」一句话）/ `absent`（`data-ls-face="absent"` + `data-face-why`，文案明写「**不是『没有习惯』，是这个面没装上**」）。**不走 `faceRead`** —— 那是有意给列表用的：抛错回落空数组，于是「取数失败」与「模块缺席」在这里会同形，而本块必须把两件事分开报。块标题右侧带 `_habitGrowthLine()` 诊断行；底部口径句写明「只留有凭据的习惯；凭据被撤回 ⇒ 转「待复验」而不是静默归零；『学会了』只留凭据，不折算成任何数值」。
- **读面契约（与仓内十来个投影面同一条）**：absent 形与在场形**逐字同键**（全零 + `ok:false` + `reason`），`reason` 取值 `'' / 'degraded' / 'empty' / 'module-unavailable' / 'thrown: …'`；`version: 0` 且注明「内核 VERSION 不进读面 —— 自造的数会被当成第二份真源」。
- **判据 `tests/v3440_l13_x7_habit_growth.test.mjs` 7 条全绿**（A 内核四阶段摘要 / B 两块账分离 / C 写入同源 / D 只读面 / E 面板三态 / F 三条真源码破坏含原版对照 / G 当版锚）。首跑 4 红，全部红在**判据侧与内核侧**（见上四条），产品行为面在首跑即全绿。
- **台账与基线（读数零手抄，全部由脚本从探针/生成器落盘）**：`module_consumption_ledger.json` 里该模块按 R3 从 `allowed:0` 转 `allowed:1`（零消费 22 → 21）；`scan_module_consumption` 复跑 247 模块 / 226 活跃 / 21 合规留存 / 零未登记孤儿；`scan_module_wiring` 通过（248 脚本全加载、已挂载未消费 0）；`scan_ui_binding` 通过（194 键 / 189 控件 / 无重复 id）；`host_beast_baseline.json` 由 `tools/rebind_host_beast_v3440.py` 抬到当版真读数（入口 11889 → **11906** 行、成员 1246 → **1249**、合并面 31420 行、TOP40 42.0%），成员上界 1248 → 1279，行上界不抬（12096 不动 —— 余量仍在 slack 内，不抬即是不给增长开口子）；`v3232_host_beast_triage` 14/14 转绿。
- **顺带修掉一个工具缺陷**：上一版 `tools/rebind_host_beast_v3439.py` 里 `if lb['ceiling'] != ...:` 的分支体缩进错位（`print` 顶格），一旦真进入该分支会 `IndentationError` —— 那道加固校验本来是**死代码**，等于「看起来有校验」。v3440 脚本里补齐（并新增 `member_ceiling` 的同源校验）。
- **本版还清掉一笔历史欠账（红档清零，不是本计划项）**：`scan_ui_view_reach.mjs` 原只有「零可达 > 0 ⇒ exit 1」与隐式 exit 0 两个出口，**没有 fail-closed 的 exit 2** —— 而它的结论（「零可达 = 0」）是一条**否定式读数**：文件被截断 / 改名 / 正则失配时，视图盘面会塌成个位数，而「零可达 0」这句话依旧成立，即**审计失效被声明成一切正常**。本版给它补了 `MIN_VIEWS = 20` 下限、三态自述与两条 `exit 2` 通道（读不到面板源码 / 视图盘面塌陷），并在 `v3436_l13_o4_view_reach` 里补了 F 段三向观测（真源码 exit 0 / 22000 字符注释但盘面塌陷 exit 2 / 缺 `settings-ui.js` exit 2）。补完后 `/tmp/retest_summary.json` 里记录的 33 个历史红档**整批复验 33/33 全绿**。
- **诚实边界**：
  1. 真机 SillyTavern 的触摸 / 窄屏 / 刷新后加载**未执行**（`realhost_readings.json` 本版仍是 `environment-unavailable`），**不写成真机通过**。
  2. 全量回归**未跑**：按用户指令「做完计划全部内容前别跑全量」，本版只跑单门 / 单套件；全量读数登记仍停在 v3.431.0，显式标待验。
  3. `growthBundles` 的持久化只做到「导出/导入两向 + 畸形回落空账」，**未**做逐字段校验与版本迁移；历史快照里没有该字段时按空账读（不伪造）。
  4. 本版**不新增**经验值 / 等级 / 熟练度任何形式的数值条：`STAGE_ORDER` 只是推进序，读面不得据它算分。
"""


# ---------- 1. CHANGELOG ----------
cl = read('CHANGELOG.md')
if not cl.startswith('## v'):
    sys.exit('[abort] CHANGELOG 首行应是 `## v<版本>`（实测开头：%r）' % cl[:40])
if ('## v' + V_NEW) in cl:
    sys.exit('[abort] CHANGELOG 已有 v%s 节 —— 拒绝重复插入' % V_NEW)
cl = SECTION + cl
write('CHANGELOG.md', cl)

# ---------- 2. PLAN 顶节 ----------
PLAN_STATUS = """> **当前执行状态（2026-11-02，v3.440.0）**：**L13-X7 习惯与成长证据面已交付** —— 把一个 `prod_call_sites=0` 的内核（`character-habit-growth-evidence.js`，登记在册、真被加载、单测全绿、产品端一次都没调用）接成产品面。两块账**分开存、分开报、不互相充抵**：习惯本体在 `worldProg.habitRepos`（`context+approach` 二元组，3 次 success 成形），成长证据束新建 `worldProg.growthBundles`（`habitKey=context|approach`，逐条 stage/evidenceId）。写入口**不新开** —— 证迹由既有 `agencyContractAct('practice')` 分支顺带产出，返回值多一个 `evidence`（`recorded` / `skipped:<why>`），理由是「本体与证迹必须由同一次动作产出」且「证迹失败不回滚本体但必须如实报」。读面同时给 `unproven`（成形待证）与 `orphan`（无主束）两组差额，各自单列。内核补 `habitKey` 透传 / `describeGrowth` 纯读摘要 / `STAGE_LABELS`+`STAGE_ORDER`（后者只答「最远到过哪阶段」，**不求和不加权**，本仓纪律：不把成长做成数值条）。面板 `protagonist` 视图新增「🌱 习惯与成长证据」三态分区（有据 / `empty` / `absent`，absent 文案明写「**不是『没有习惯』，是这个面没装上**」），**不走 `faceRead`**（那是有意给列表用的：抛错回落空数组，「取数失败」与「模块缺席」会同形）。★ 本版自己抓到并修掉**内核真缺陷一处**：`evaluateCompetencyAfterRevocation` 返回 `validRecords` 而读面读 `records` ⇒ 撤回证据的产物进读面成了空束（`total:0 / status:'empty'`），把「绝不静默归零」在链条上破了个口；修法补 `records: validRecords`。★ 另修**负控制假绿第二形两处**（N1 把 `const` 赋值当破坏 ⇒ 副本自己抛错被 catch 兜成 degraded；N2 挑的破坏点在夹具上永假 ⇒ 破坏等于没写），以及**判据自伤两处**（E 档窗口从标题起算 5200 字符，而读数点在标题前 3589 字符；整块注释里的口径声明被当成数值条）。★ 判据 `tests/v3440_l13_x7_habit_growth.test.mjs` **7 条全绿**（A~F 六段 + G 当版锚，含三条真源码破坏 + 原版对照）；首跑 4 红全在判据侧与内核侧，产品行为面首跑即绿。★ 台账同版收口：`module_consumption_ledger` 该模块按 R3 从 `allowed:0` 转 `allowed:1`（零消费 22 → 21，`scan_module_consumption` 247 模块 / 226 活跃 / 21 合规留存 / 零孤儿）；`scan_module_wiring` / `scan_ui_binding` / `scan_version_guard` 全通过；`host_beast_baseline` 由 `tools/rebind_host_beast_v3440.py` 抬到当版真读数（入口 11889 → 11906 行、成员 1246 → 1249、合并面 31420 行、TOP40 42.0%），行上界**不抬**（12096 不动，余量仍在 slack 内）。★ 顺带修掉上一版 `rebind_host_beast_v3439.py` 的缩进错位缺陷（`if lb['ceiling'] != ...` 分支体 `print` 顶格 ⇒ 一进入就 `IndentationError`，那道加固校验本来是死代码）。★ 同版清掉一笔**历史红档欠账**：`scan_ui_view_reach.mjs` 补 fail-closed 的 exit 2 通道（`MIN_VIEWS = 20` 下限 + 三态自述 + 两条 exit 2），因它的结论「零可达 = 0」是**否定式读数**——盘面塌陷时这句话照样成立，等于审计失效被声明成一切正常；补完后 `/tmp/retest_summary.json` 记录的 33 个历史红档整批复验 **33/33 全绿**。**边界保留**：真机 ST 触摸 / 窄屏 / 刷新后加载**未执行**（`realhost_readings` 仍 `environment-unavailable`），全量回归**未跑**（用户指令：做完计划全部内容前别跑全量；读数登记仍停 v3.431.0，显式待验），`growthBundles` 只做导出/导入两向 + 畸形回落空账、未做逐字段校验与版本迁移。**L13 进度**：X1（沿革回放）/ X2（反事实推演）/ X3（视角投影）/ **X7（习惯与成长证据）** 已交付；X4~X6 / X8~X9 待做（X 面交付序：只读面先做 —— X7 已落，其后推演 X4，再 X5 / X6 / X8 / X9）。**上一版 v3.439.0**：L13-X3 视角投影面（`povs` 从「列名单」变成「用这个角色的眼睛看这一轮」，五档 knows/suspects/believes/blind/undecided，`blind` 与 `undecided` 永不同形）。**上一版 v3.438.0**：L13-O6 注入面「这一轮用了什么」可复算（逐条回执 + 列表可展开 + 被裁读数）。**上一版 v3.437.0**：L13-O5 世界线口径对玩家的可读化（三态各有人话且两两不同，none 态**不出现「安全」二字**）。**上一版 v3.436.0**：L13-O4 面板视图入口可达性（`scan_ui_view_reach.mjs`：26 视图全部导航可达 / 零可达 0；本版给它补了 fail-closed 的 exit 2 通道与三态自述）。**上一版 v3.435.0**：L13-O3 只读视图机器可读四态 + L13-O8 记忆软删闭环。**真宿主门**：v3.433.0 曾在真实 SillyTavern 1.19.0 隔离现场跑通过一次（29 条真实读数 / 0 缺陷 / exit 0）；此后盘面已多次变更，该读数按「历史跑通、当版待复跑」对待。
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

# ---------- 3. TODO 顶节 ----------
TODO_HEAD = """> **最近更新：v3.440.0**（**L13-X7 习惯与成长证据面**：把 `character-habit-growth-evidence.js` 从「登记在册但产品端零调用」接成可读面。两块账**分开存、分开报、不互相充抵** —— 习惯本体在 `worldProg.habitRepos`（`context+approach` 二元组、3 次 success 成形），成长证据束新建 `worldProg.growthBundles`（`habitKey=context|approach`）。写入口**不新开**：证迹由既有 `agencyContractAct('practice')` 分支顺带产出，返回值多一个 `evidence`（`recorded` / `skipped:<why>`）——本体与证迹必须由同一次动作产出，且证迹失败不回滚本体但必须如实报（静默漏记比漏记更坏）。读面同时给 `unproven`（成形待证）与 `orphan`（无主束）两组差额，各自单列 —— 并成一块就会让「形成了习惯」冒充「有据可查」。内核补 `habitKey` 透传 / `describeGrowth` 纯读摘要 / `STAGE_LABELS`+`STAGE_ORDER`（只答「最远到过哪阶段」，**不求和不加权**；本仓纪律：不把成长做成数值条）。面板 `protagonist` 视图新增「🌱 习惯与成长证据」三态分区（有据 / `empty` / `absent`，absent 明写「**不是『没有习惯』，是这个面没装上**」），**不走 `faceRead`**（抛错回落空数组会让「取数失败」与「模块缺席」同形）。★ 本版自己抓到的**内核真缺陷一处**：`evaluateCompetencyAfterRevocation` 返回 `validRecords` 而读面读 `records` ⇒ 撤回证据的产物进读面成了空束，把「绝不静默归零」破了个口（已补 `records: validRecords`）。★ 另修**负控制假绿第二形两处**与**判据自伤两处**（窗口起点错位 3589 字符、整块注释里的口径声明被当成数值条）。★ 判据 `tests/v3440_l13_x7_habit_growth.test.mjs` **7 条全绿**（A~F + G 当版锚，含三条真源码破坏 + 原版对照）；首跑 4 红全在判据侧与内核侧，产品行为面首跑即绿。★ 台账同版收口：`module_consumption_ledger` 按 R3 把该模块从 `allowed:0` 转 `allowed:1`（零消费 22 → 21）；`scan_module_consumption` / `scan_module_wiring` / `scan_ui_binding` / `scan_version_guard` 全通过；`host_beast_baseline` 由 `tools/rebind_host_beast_v3440.py` 抬到当版真读数（入口 11889 → 11906、成员 1246 → 1249、TOP40 42.0%；行上界**不抬**，12096 不动）。★ 同版补 `scan_ui_view_reach.mjs` 的 fail-closed 通道（`MIN_VIEWS = 20` + 三态自述 + 两条 exit 2），并整批复验历史 33 个红档 **33/33 全绿**。★ 边界：真机 ST 触摸 / 窄屏 / 刷新后加载**未执行**，全量回归**未跑**（按指令做完计划前不跑全量，读数登记仍停 v3.431.0、显式待验），`growthBundles` 只做导出/导入两向 + 畸形回落空账。**L13 进度**：X1 / X2 / X3 / **X7** 已交付，X4~X6 / X8~X9 待做。
"""
td = read('TODO.md')
tlines = td.split('\n')
thit = [i for i, l in enumerate(tlines) if l.startswith('> **最近更新：')]
if len(thit) != 1:
    sys.exit('[abort] TODO 最近更新行：期望 1 处，实测 %d' % len(thit))
tlines[thit[0]] = TODO_HEAD.rstrip('\n')
write('TODO.md', '\n'.join(tlines))

print('docs done: CHANGELOG / PLAN / TODO 已按 v%s 收口' % V_NEW)