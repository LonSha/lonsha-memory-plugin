#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.440.0 抬版 + CHANGELOG/TODO/PLAN 顶节改写（L13-X7 习惯与成长证据面）。

只做两类事：
  1) 版本号（index.js / package.json / manifest.json / 三个模块副本 / README / state-report / realhost_readings）；
  2) 往 CHANGELOG 顶部插新节、替换 TODO/PLAN 的「当前」段首句与版本表。
每处替换都先断言命中次数，不符立即 sys.exit，不静默改一半（本仓补丁纪律）。
"""
import json
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


# ---------- 1. 版本号 ----------
c = read('index.js')
c = sub_exact(c, "const VERSION = '%s';" % V_OLD, "const VERSION = '%s';" % V_NEW, 1, 'index.js VERSION')
write('index.js', c)

for p, indent in (('package.json', 2), ('manifest.json', 4)):
    obj = json.loads(read(p))
    if obj.get('version') != V_OLD:
        sys.exit('[abort] %s version 期望 %s，实为 %s' % (p, V_OLD, obj.get('version')))
    obj['version'] = V_NEW
    with open(REPO + p, 'w', encoding='utf8') as f:
        json.dump(obj, f, indent=indent, ensure_ascii=False)
        f.write('\n')

for p in ('memory-organs.js', 'memory-config.js', 'memory-core.js'):
    s = read(p)
    s = sub_exact(s, "let VERSION = '%s';" % V_OLD, "let VERSION = '%s';" % V_NEW, 1, p + ' VERSION')
    write(p, s)

s = read('README.md')
s = sub_exact(s, '**当前版本**：`%s`' % V_OLD, '**当前版本**：`%s`' % V_NEW, 1, 'README 当前版本')
write('README.md', s)

# state-report.json（生成器产物：只抬版本指针，读数面维持原状；下一轮 gen_state_report 会整份重生成）
sr = json.loads(read('tests/audit/state-report.json'))
if sr.get('version') != V_OLD:
    sys.exit('[abort] state-report.version 期望 %s，实为 %s' % (V_OLD, sr.get('version')))
sr['version'] = V_NEW
sr['version_sources'] = {k: V_NEW for k in sr.get('version_sources', {})}
sr['human_index_version'] = V_NEW
with open(REPO + 'tests/audit/state-report.json', 'w', encoding='utf8') as f:
    json.dump(sr, f, indent=2, ensure_ascii=False)
    f.write('\n')

# realhost_readings.json（exit-bail reads：verdict 仍是 environment-unavailable，只抬版本指针与来源说明）
rh = json.loads(read('tests/audit/realhost_readings.json'))
if rh.get('version') != V_OLD:
    sys.exit('[abort] realhost_readings.version 期望 %s，实为 %s' % (V_OLD, rh.get('version')))
rh['version'] = V_NEW
rh['reason'] = 'ST 未就绪（http://127.0.0.1:1/ ⇒ 0）—— 先起 SillyTavern；本版未执行真机复核（按纪律不写成通过）'
with open(REPO + 'tests/audit/realhost_readings.json', 'w', encoding='utf8') as f:
    json.dump(rh, f, indent=2, ensure_ascii=False)
    f.write('\n')

# ---------- 2. CHANGELOG 新节 ----------
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
- **判据 `tests/v3440_l13_x7_habit_growth.test.mjs` 6 条全绿**（A 内核四阶段摘要 / B 两块账分离 / C 写入同源 / D 只读面 / E 面板三态 / F 三条真源码破坏含原版对照）。首跑 4 红，全部红在**判据侧与内核侧**（见上四条），产品行为面在首跑即全绿。
- **台账与基线（读数零手抄，全部由脚本从探针/生成器落盘）**：`module_consumption_ledger.json` 里该模块按 R3 从 `allowed:0` 转 `allowed:1`（零消费 22 → 21）；`scan_module_consumption` 复跑 247 模块 / 226 活跃 / 21 合规留存 / 零未登记孤儿；`scan_module_wiring` 通过（248 脚本全加载、已挂载未消费 0）；`scan_ui_binding` 通过（194 键 / 189 控件 / 无重复 id）；`host_beast_baseline.json` 由 `tools/rebind_host_beast_v3440.py` 抬到当版真读数（入口 11889 → **11906** 行、成员 1246 → **1249**、合并面 31420 行、TOP40 42.0%），成员上界 1248 → 1279，行上界不抬（12096 不动——余量仍在 slack 内，不抬即是不给增长开口子）；`v3232_host_beast_triage` 14/14 转绿。
- **顺带修掉一个工具缺陷**：上一版 `tools/rebind_host_beast_v3439.py` 里 `if lb['ceiling'] != ...:` 的分支体缩进错位（`print` 顶格），一旦真进入该分支会 `IndentationError` —— 那道加固校验本来是**死代码**，等于「看起来有校验」。v3440 脚本里补齐（并新增 `member_ceiling` 的同源校验）。
- **诚实边界**：
  1. 真机 SillyTavern 的触摸 / 窄屏 / 刷新后加载**未执行**（`realhost_readings.json` 本版仍是 `environment-unavailable`），**不写成真机通过**。
  2. 全量回归**未跑**：按用户指令「做完计划全部内容前别跑全量」，本版只跑单门 / 单套件；全量读数登记仍停在 v3.431.0，显式标待验。
  3. `growthBundles` 的持久化只做到「导出/导入两向 + 畸形回落空账」，**未**做逐字段校验与版本迁移；历史快照里没有该字段时按空账读（不伪造）。
  4. 本版**不新增**经验值 / 等级 / 熟练度任何形式的数值条：`STAGE_ORDER` 只是推进序，读面不得据它算分。
"""
cl = read('CHANGELOG.md')
if not cl.startswith('# '):
    sys.exit('[abort] CHANGELOG 头部形态不符（应以一级标题开头）')
# 插在第一个 '## v' 节之前（保持头部说明不变）
marker = '\n## v'
pos = cl.index(marker)
cl = cl[:pos + 1] + SECTION + cl[pos + 1:]
write('CHANGELOG.md', cl)

# ---------- 3. PLAN 顶节 ----------
PLAN_STATUS = """> **当前执行状态（2026-11-02，v3.440.0）**：**L13-X7 习惯与成长证据面已交付** —— 把一个 `prod_call_sites=0` 的内核（`character-habit-growth-evidence.js`，登记在册、真被加载、单测全绿、产品端一次都没调用）接成产品面。两块账**分开存、分开报、不互相充抵**：习惯本体在 `worldProg.habitRepos`（`context+approach` 二元组，3 次 success 成形），成长证据束新建 `worldProg.growthBundles`（`habitKey=context|approach`，逐条 stage/evidenceId）。写入口**不新开** —— 证迹由既有 `agencyContractAct('practice')` 分支顺带产出，返回值多一个 `evidence`（`recorded` / `skipped:<why>`），理由是「本体与证迹必须由同一次动作产出」且「证迹失败不回滚本体但必须如实报」。读面同时给 `unproven`（成形待证）与 `orphan`（无主束）两组差额，各自单列。内核补 `habitKey` 透传 / `describeGrowth` 纯读摘要 / `STAGE_LABELS`+`STAGE_ORDER`（后者只答「最远到过哪阶段」，**不求和不加权**，本仓纪律：不把成长做成数值条）。面板 `protagonist` 视图新增「🌱 习惯与成长证据」三态分区（有据 / `empty` / `absent`，absent 文案明写「**不是『没有习惯』，是这个面没装上**」），**不走 `faceRead`**（那是有意给列表用的：抛错回落空数组，「取数失败」与「模块缺席」会同形）。★ 本版自己抓到并修掉**内核真缺陷一处**：`evaluateCompetencyAfterRevocation` 返回 `validRecords` 而读面读 `records` ⇒ 撤回证据的产物进读面成了空束（`total:0 / status:'empty'`），把「绝不静默归零」在链条上破了个口；修法补 `records: validRecords`。★ 另修**负控制假绿第二形两处**（N1 把 `const` 赋值当破坏 ⇒ 副本自己抛错被 catch 兜成 degraded；N2 挑的破坏点在夹具上永假 ⇒ 破坏等于没写），以及**判据自伤两处**（E 档窗口从标题起算 5200 字符，而读数点在标题前 3589 字符；整块注释里的口径声明被当成数值条）。★ 判据 `tests/v3440_l13_x7_habit_growth.test.mjs` **6 条全绿**（A~F 六段，含三条真源码破坏 + 原版对照）；首跑 4 红全在判据侧与内核侧，产品行为面首跑即绿。★ 台账同版收口：`module_consumption_ledger` 该模块按 R3 从 `allowed:0` 转 `allowed:1`（零消费 22 → 21，`scan_module_consumption` 247 模块 / 226 活跃 / 21 合规留存 / 零孤儿）；`scan_module_wiring` / `scan_ui_binding` / `scan_version_guard` 全通过；`host_beast_baseline` 由 `tools/rebind_host_beast_v3440.py` 抬到当版真读数（入口 11889 → 11906 行、成员 1246 → 1249、合并面 31420 行、TOP40 42.0%），行上界**不抬**（12096 不动，余量仍在 slack 内）。★ 顺带修掉上一版 `rebind_host_beast_v3439.py` 的缩进错位缺陷（`if lb['ceiling'] != ...` 分支体 `print` 顶格 ⇒ 一进入就 `IndentationError`，那道加固校验本来是死代码）。**边界保留**：真机 ST 触摸 / 窄屏 / 刷新后加载**未执行**（`realhost_readings` 仍 `environment-unavailable`），全量回归**未跑**（用户指令：做完计划全部内容前别跑全量；读数登记仍停 v3.431.0，显式待验），`growthBundles` 只做导出/导入两向 + 畸形回落空账、未做逐字段校验与版本迁移。**L13 进度**：X1（沿革回放）/ X2（反事实推演）/ X3（视角投影）/ **X7（习惯与成长证据）** 已交付；X4~X6 / X8~X9 待做（X 面交付序：只读面先做 —— X7 已落，其后推演 X4，再 X5 / X6 / X8 / X9）。**上一版 v3.439.0**：L13-X3 视角投影面（`povs` 从「列名单」变成「用这个角色的眼睛看这一轮」，五档 knows/suspects/believes/blind/undecided，`blind` 与 `undecided` 永不同形）。**上一版 v3.438.0**：L13-O6 注入面「这一轮用了什么」可复算（逐条回执 + 列表可展开 + 被裁读数）。**上一版 v3.437.0**：L13-O5 世界线口径对玩家的可读化（三态各有人话且两两不同，none 态**不出现「安全」二字**）。**上一版 v3.436.0**：L13-O4 面板视图入口可达性（`scan_ui_view_reach.mjs`：26 视图全部导航可达 / 零可达 0；本版给它补了 fail-closed 的 exit 2 通道与三态自述）。**上一版 v3.435.0**：L13-O3 只读视图机器可读四态 + L13-O8 记忆软删闭环。**真宿主门**：v3.433.0 曾在真实 SillyTavern 1.19.0 隔离现场跑通过一次（29 条真实读数 / 0 缺陷 / exit 0）；此后盘面已多次变更，该读数按「历史跑通、当版待复跑」对待。
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

# ---------- 4. TODO 顶节 ----------
TODO_HEAD = """> **最近更新：v3.440.0**（**L13-X7 习惯与成长证据面**：把 `character-habit-growth-evidence.js` 从「登记在册但产品端零调用」接成可读面。两块账**分开存、分开报、不互相充抵** —— 习惯本体在 `worldProg.habitRepos`（`context+approach` 二元组、3 次 success 成形），成长证据束新建 `worldProg.growthBundles`（`habitKey=context|approach`）。写入口**不新开**：证迹由既有 `agencyContractAct('practice')` 分支顺带产出，返回值多一个 `evidence`（`recorded` / `skipped:<why>`）——本体与证迹必须由同一次动作产出，且证迹失败不回滚本体但必须如实报（静默漏记比漏记更坏）。读面同时给 `unproven`（成形待证）与 `orphan`（无主束）两组差额，各自单列 —— 并成一块就会让「形成了习惯」冒充「有据可查」。内核补 `habitKey` 透传 / `describeGrowth` 纯读摘要 / `STAGE_LABELS`+`STAGE_ORDER`（只答「最远到过哪阶段」，**不求和不加权**；本仓纪律：不把成长做成数值条）。面板 `protagonist` 视图新增「🌱 习惯与成长证据」三态分区（有据 / `empty` / `absent`，absent 明写「**不是『没有习惯』，是这个面没装上**」），**不走 `faceRead`**（抛错回落空数组会让「取数失败」与「模块缺席」同形）。★ 本版自己抓到的**内核真缺陷一处**：`evaluateCompetencyAfterRevocation` 返回 `validRecords` 而读面读 `records` ⇒ 撤回证据的产物进读面成了空束，把「绝不静默归零」破了个口（已补 `records: validRecords`）。★ 另修**负控制假绿第二形两处**与**判据自伤两处**（窗口起点错位 3589 字符、整块注释里的口径声明被当成数值条）。★ 判据 `tests/v3440_l13_x7_habit_growth.test.mjs` **6 条全绿**（A~F，含三条真源码破坏 + 原版对照）；首跑 4 红全在判据侧与内核侧，产品行为面首跑即绿。★ 台账同版收口：`module_consumption_ledger` 按 R3 把该模块从 `allowed:0` 转 `allowed:1`（零消费 22 → 21）；`scan_module_consumption` / `scan_module_wiring` / `scan_ui_binding` / `scan_version_guard` 全通过；`host_beast_baseline` 由 `tools/rebind_host_beast_v3440.py` 抬到当版真读数（入口 11889 → 11906、成员 1246 → 1249、TOP40 42.0%；行上界**不抬**，12096 不动）。★ 边界：真机 ST 触摸 / 窄屏 / 刷新后加载**未执行**，全量回归**未跑**（按指令做完计划前不跑全量，读数登记仍停 v3.431.0、显式待验），`growthBundles` 只做导出/导入两向 + 畸形回落空账。**L13 进度**：X1 / X2 / X3 / **X7** 已交付，X4~X6 / X8~X9 待做。
"""
td = read('TODO.md')
tlines = td.split('\n')
thit = [i for i, l in enumerate(tlines) if l.startswith('> **最近更新：')]
if len(thit) != 1:
    sys.exit('[abort] TODO 最近更新行：期望 1 处，实测 %d' % len(thit))
tlines[thit[0]] = TODO_HEAD.rstrip('\n')
write('TODO.md', '\n'.join(tlines))

print('bump done: %s -> %s' % (V_OLD, V_NEW))
