#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""bump3314.py - 抬版 v3.313.0 -> v3.314.0（M-X6 手机事实桥 2.0：确认 / 撤回 / 双向回执）。

锚点纪律：每处锚点先校验命中次数，全部通过后统一写盘。--dry 亦跑完全部校验。
★ 沿革：v3.310.0 的 bump3310.py 曾「半执行」留下半成品；v3.312.0 的 bump3312.py 也在首跑后
  补了两处锚点。本脚本沿用「先全量校验（含派生面），再逐文件写盘」。
★ 本版新增一处结构面（不是纯读数替换）：`open_face_registry.tsv` 为手机桥回执面**新增一行**
  （第 7 面），故派生面校验里补一条「新行必须满足 T1~T6 且不影响 v3305 D2 的『恰 1 行指向
  memory-tools-api.js』」——行以 `phone-fact-bridge.js::` 开头，与 MT 面互不干扰。
"""
import io
import json
import os
import sys

ROOT = '/home/user/lonsha-memory-plugin'
DRY = ('--dry' in sys.argv)
EDIT = []


def edit(rel, pairs):
    EDIT.append((rel, pairs))


# -- 一、版本六源 -------------------------------------------------------
edit('index.js', [('ver', "const VERSION = '3.313.0';", "const VERSION = '3.314.0';", 1)])
edit('manifest.json', [
    ('ver', '"version": "3.313.0",', '"version": "3.314.0",', 1),
    ('mod', '        "memory-package.js"\n    ],',
     '        "memory-package.js",\n        "phone-fact-bridge.js"\n    ],', 1),
])
edit('package.json', [('ver', '"version": "3.313.0"', '"version": "3.314.0"', 1)])
edit('memory-config.js', [('ver', "let VERSION = '3.313.0';", "let VERSION = '3.314.0';", 1)])
edit('memory-core.js', [('ver', "let VERSION = '3.313.0';", "let VERSION = '3.314.0';", 1)])
edit('memory-organs.js', [('ver', "let VERSION = '3.313.0';", "let VERSION = '3.314.0';", 1)])

# -- 二、README 人读面读数（D1/D2/D3/D4/D6 五处）------------------------
edit('README.md', [
    ('rd-ver', '**当前版本**：`3.313.0`', '**当前版本**：`3.314.0`', 1),
    ('rd-testcount', '**294 个测试文件**', '**295 个测试文件**', 1),
    ('rd-rootjs', '**运行时模块**：93 个（根目录 `.js`，含入口 `index.js`；与 `extra_js` **92 项**是两个口径',
     '**运行时模块**：94 个（根目录 `.js`，含入口 `index.js`；与 `extra_js` **93 项**是两个口径', 1),
    ('rd-extrajs', '`extra_js`（92 项）', '`extra_js`（93 项）', 1),
    ('rd-manifest', 'extra_js 92 / extra_css 2', 'extra_js 93 / extra_css 2', 1),
    ('rd-load', '`index.js` + `extra_js` 92 项 + CSS 3 项', '`index.js` + `extra_js` 93 项 + CSS 3 项', 1),
    ('rd-cur', '当前版本 v3.313.0 **全量待验**', '当前版本 v3.314.0 **全量待验**', 1),
])

# -- 三、PLAN 现状基线表 + 文首现行口径 -------------------------------
edit('PLAN.md', [
    ('pl-cur', '（2026-10-11，v3.313.0）', '（2026-10-11，v3.314.0）', 1),
    ('pl-ver', '| 版本 | **v3.313.0**（四源同源；本表原为 v3.266.0） |',
     '| 版本 | **v3.314.0**（四源同源；本表原为 v3.266.0） |', 1),
    ('pl-gate', '在役面 **294 测试文件 / 60 个 audit 脚本**', '在役面 **295 测试文件 / 60 个 audit 脚本**', 1),
    ('pl-size', '`index.js` **16862 行**（物理行；探针读数 16862 行 / **617** 成员 —— 原 A1 六刀后为 13883 / 521）+ extra_js **92** 项',
     '`index.js` **17042 行**（物理行；探针读数 17042 行 / **626** 成员 —— 原 A1 六刀后为 13883 / 521）+ extra_js **93** 项', 1),
    ('pl-snap', '当前 v3.313.0 **全量待验**', '当前 v3.314.0 **全量待验**', 1),
    ('pl-dir', '**当前 v3.313.0 全量待验**', '**当前 v3.314.0 全量待验**', 1),
    ('pl-face', '正向 **6 面**（`open_face_registry.tsv`；v3.305.0 M-X9 新增 `memoryToolsEnvelope`（consumer `none@0`，下游接入属下一轮））',
     '正向 **7 面**（`open_face_registry.tsv`；v3.314.0 M-X6 新增 `phoneFactReceipt`（consumer `none@0`，手机侧回执面，下游接入属下一轮）；v3.305.0 M-X9 新增 `memoryToolsEnvelope`（consumer `none@0`，下游接入属下一轮））', 1),
])

# -- 四、v3209 数量锁：92 -> 93（★ 原文用「」全角分号，逐字核过）---------
edit('tests/v3209_migration_registry.test.mjs', [
    ('lockv1', 'A(mf.extra_js.length === 92,', 'A(mf.extra_js.length === 93,', 1),
    ('lockv2', 'A(files.length === 92,', 'A(files.length === 93,', 1),
    ('lock1', 'extra_js 须 92 项（v3.313.0 M-X8 新增 memory-package.js，当版 92；',
     'extra_js 须 93 项（v3.314.0 M-X6 新增 phone-fact-bridge.js，当版 93；v3.313.0 M-X8 新增 memory-package.js，当版 92；', 1),
    ('lock2', 'extra_js 抽取器应得 92 项（v3.313.0 M-X8 memory-package.js，当版 92；',
     'extra_js 抽取器应得 93 项（v3.314.0 M-X6 phone-fact-bridge.js，当版 93；v3.313.0 M-X8 memory-package.js，当版 92；', 1),
])

# -- 五、v3247 REGISTRY ------------------------------------------------
edit('tests/v3247_break_kit_consolidation.test.mjs', [
    ('reg', "    'v3313_memory_package.test.mjs',\n];",
     "    'v3313_memory_package.test.mjs',\n    'v3314_phone_fact_bridge.test.mjs',\n];", 1),
])

# -- 六、open_face_registry：producer_version 同步 + 新增手机桥回执面一行 --
edit('tests/audit/open_face_registry.tsv', [
    ('face', 'memoryToolsEnvelope\tlonsha-memory-plugin\tv3.313.0\t',
     'memoryToolsEnvelope\tlonsha-memory-plugin\tv3.314.0\t', 1),
])

# -- 七、TODO：新「最近更新」行前插，旧当前行原地降为历史留痕 -----------
TODO_HEAD = ('> **最近更新：v3.314.0** —— **M-X6（第二期拓展计划）手机事实桥 2.0（确认 / 撤回 / 双向回执）**：'
             '本仓此前能判「这条算不算事实」（X4 八栏身份 + 五态来源 + 五档裁决），但**判不了三件事** ——'
             '裁决之后**用户确认或拒绝**这一环在哪（X4 只有一个 `userConfirmed` 布尔钩子）；'
             '手机侧**编辑 / 删除 / 撤回**后记忆侧如何换代或撤回（X4 只把 `retracted` 一并拒掉，**没有换代链**）；'
             '记忆侧的**最终状态如何回传手机侧**（X4 全库**零回执面**）。缺这三环的后果是**桥的单向化**：'
             '手机侧只知道「送出去了」，不知道「记忆侧到底收没收、是不是还作数、我改了它知不知道」。'
             '本刀交付 `phone-fact-bridge.js`（纯函数、零依赖、双导出、595 行）+ 宿主七出口 + 自检面一行诊断：'
             '★ **证据守卫是结构硬守卫**：预测 / 报价 / 草稿三档**永不变事实**（X4 的 SOURCE_POLICY 对这些来源恒 '
             '`isFact:false`），故与用户是否接受**无关** —— 用户点接受也推不动（这是「不自动变成事实」的强形）；'
             '三档各自可达且理由不同形，不得都压成一个笼统词。★ **生命周期四态互不同形**：'
             '`accepted` / `rejected` / `pending` / `revoked`，且「判不了」（准入模块缺席）是**第三态**'
             '（`decidable:false`）—— 不假装 pending、不假装 rejected（本仓最贵的老账）。'
             '★ **回执只读**：`receiptFor` 返回**新对象**（绝不改传入的 fact / admission），理由必须取自 '
             '`RECEIPT_REASONS` **十条穷尽词表**（任何非 accepted 回执不得现编字符串），并自述 '
             '`nextStep`（这条手机侧该拿它怎么办）—— 手机侧不必猜包内的 X4 词表。'
             '★ **编辑换代与撤回不同形**：编辑 ⇒ `supersede`（留旧条、记换代链）；删除 / 撤回 ⇒ '
             '`withdraw`（不留）—— 把「改了口径」与「从来没有过」压成一件事会丢掉换代链；'
             '二者以同一 `rootEventId` 为轴（跨平台转发只进一次），计划**纯函数零写**（写法归 owner 侧经既有门）。'
             '★ **单装可解释降级**：依赖只一件（`FACT_ADMISSION`），缺席 ⇒ `bridgeState` 报 '
             '`indeterminate / admission-unavailable`（**不假装能判**，与 M-X8 的 migration-unavailable 同纪律）；'
             '桥能力三态 `absent` / `legacy`（桥在但缺回执面，旧版手机）/ `capable` **不得压成一态**。'
             '★ **离线**：源码零 `fetch` / `XMLHttpRequest` / `localStorage` / `indexedDB`。'
             '成对套件 `tests/v3314_phone_fact_bridge.test.mjs`（13 条，含六条真源码破坏负控制 + '
             '正控制地基 + 反向对照 + 判据纯度）。★ 跨仓面：`open_face_registry.tsv` 新增第 7 面 '
             '`phoneFactReceipt`（consumer `none@0` —— 下游未接入，如实写不假装已在消费），'
             '`memoryToolsEnvelope` 行 `producer_version` 同步抬版。')
edit('TODO.md', [
    ('td-line', '> **最近更新：v3.313.0** —— ', TODO_HEAD + chr(10) + '> **历史留痕：v3.313.0** —— ', 1),
])

# -- 八、CHANGELOG 新顶节（D9 要求：档自述条数 + 「退出码三档」声明）------
CHANGELOG_HEAD = '''## v3.314.0

**M-X6（第二期拓展计划）手机事实桥 2.0：准入之上叠确认环 / 生命周期四态互不同形 / 双向回执只读 / 编辑换代与撤回 / 单装可解释降级**

### 它补的是哪一格（修前实测逐点，非抽样）

- **能判「这条算不算事实」，判不了「算完之后走到哪一步」。** `native-fact-admission.js`（X4, v3.290.0）给了八栏身份 + 五态来源 + 五档裁决（admitted / observed / predicted / draft / quoted / rejected），但**用户确认环**只有一个 `userConfirmed` 布尔钩子 ——「谁点的确认、点没点」在这一层不可判。
- **手机侧只知道送出去了，不知道记忆侧收没收。** X4 全库**零回执面**：没有一处把「记忆侧的最终状态」折成手机侧可显示的读数。
- **手机侧改了 / 删了，记忆侧不知道。** X4 只把 `retracted` 一并拒掉，**没有换代链** ——「改了口径」与「从来没有过」在读数上同形。

本模块把三件收成一处：**事件分类 → 证据守卫（前置拦）→ 用户确认环 → 生命周期四态 → 回执 → 编辑换代 / 撤回计划**。与 X4 是**叠加**、不是替代：准入结果由 `deps.FACT_ADMISSION`（唯一真源）给出，本模块只在其上判上面那四件。

### 交付物

- **`phone-fact-bridge.js`**（纯函数、零依赖、IIFE 双导出、595 行 / 36K 字符）：常量面 `BRIDGE_VERSION=1` / `RECEIPT_VERSION=1` / `LIFECYCLE_STATES`（四态）/ `EVENT_CLASSES`（财务·日历·剧情）/ `EDIT_ACTIONS`（edit·delete·retract）/ `EDIT_EFFECT`（supersede·withdraw）/ `EVIDENCE_GUARDS`（predictive·quote-like·draft-like）/ `RECEIPT_REASONS`（**十条穷尽**）/ `BRIDGE_STATES`（absent·legacy·capable）/ `REQUIRED_DEPS`（**只一件**：`FACT_ADMISSION`）/ `OPTIONAL_DEPS`（`EVENT_CLASSES_HINT`）/ `DEFAULT_CLASS_HINT`。函数面 12 个：`eventClassOf` / `guardEvidence` / `lifecycleOf` / `receiptFor` / `probeCounterpart` / `planEdit` / `bridgeState` / `handleFact` / `handleBatch` / `describe` / `selfCheck` / `line`。
- **宿主七出口**（`index.js`）：模块级取库口 `_phoneFactBridgeLib()`；唯一装配点 `_phoneFactBridgeDeps()`（**只装一件**：`FACT_ADMISSION` 取 `native-fact-admission.js`，取不到 `null` 而非 `{}`）；降级面 `_phoneFactBridgeAbsent(reason)`（同键 + 明确降级）；出口 `phoneFactBridgeHandle` / `phoneFactBridgeBatch` / `phoneFactBridgeReceipt` / `phoneFactBridgePlanEdit` / `phoneFactBridgeState` / `phoneFactBridgeDescribe` / `phoneFactBridgeLine`（**出口不落笔**）；`selfCheck` 表新增一行 `['手机桥', this.phoneFactBridgeLine()]`，与 X4 的「手机准入」行**分列**（两种缺席归因不同，不得合成一行）。

### ① 证据守卫是结构硬守卫（预测 / 报价 / 草稿不自动变成事实）

`guardEvidence()` 三档各自可达且理由不同形：`predictive`（来源含 forecast / predict / suggest / simulat 或自述 `predicted`）/ `quote-like`（quote / transfer / repay / settle ——「这不是已发生的支出」）/ `draft-like`（draft / usage / `visibility:player-only` ——「它还不是角色剧情事实」）。**关键**：命中守卫一律落 `pending / evidence-guarded`，**与用户是否接受无关** —— 用户点 accept 也推不动（X4 的 SOURCE_POLICY 对这些来源恒 `isFact:false`，结构上就不该有「洗成 accepted」这条路）。

### ② 生命周期四态互不同形（本仓最贵的老账）

`lifecycleOf()` 判定顺序：撤回落定优先 → 用户明确拒绝 → `measurable===false` ⇒ `pending / admission-unavailable / decidable:false` → X4 拒收 / 撤回 → **证据守卫（结构硬守卫）** → `admitted`/`observed` + `accept` ⇒ `accepted`，否则 `awaiting-user` → 其余 ⇒ 判不了。★ 三态必须分得开：**`pending`（等用户确认，判得了但还悬着）≠ `rejected`（明确未进账）≠ `decidable:false`（判不了）**。把它们压成一态，就是本仓反复治过的「判不了与查了没有同形」。

### ③ 双向回执只读 + 理由穷尽

`receiptFor()` 返回**新冻结对象**（绝不改传入的 fact / admission），字段 `eventId` / `rootEventId` / `state` / `reason` / `decidable` / `accepted` / `nextStep` / `reasonText` / `version`。★ 理由必须取自 `RECEIPT_REASONS`（十条穷尽）；任何不在表内的理由一律回落 `admission-unavailable`（**不现编字符串**）。★ `nextStep` 自述「这条手机侧该拿它怎么办」（`ask-user-confirm` / `retry-when-module-present` / `retry-when-bridge-present` / `provide-event-id` / `none`），手机侧不必猜包内的 X4 词表。

### ④ 编辑换代与撤回不同形

`planEdit()`：编辑 ⇒ `supersede`（旧条置 `supersededBy=mobile-edit` **留痕**，新条以同 `rootEventId` 挂到换代链尾）；删除 / 撤回 ⇒ `withdraw`（逐条落撤回标记，**不留**作历史事实）。★ 二者以同一 `rootEventId` 为轴（跨平台转发只进一次）；无身份 ⇒ `no-identity` 拒（不猜待换代的旧条）；未知动作 ⇒ `unknown-action` 拒。★ 计划是**纯函数零写**：写法由 owner 侧经既有门落笔。

### ⑤ 单装可解释降级（依赖只一件）

`bridgeState()`：桥缺席 ⇒ `absent`（整条准入 / 回执分支不进入，**非「没事实」**）；`FACT_ADMISSION` 缺席或缺 `admitNativeFact` ⇒ `indeterminate / admission-unavailable`（**不假装能判**，与 M-X8 的 migration-unavailable 同纪律）。`probeCounterpart()` 桥能力三态 `absent` / `legacy`（桥在但缺回执面 = 旧版手机）/ `capable` **不得压成一态**。

### ⑥ 批量与同源去重

`handleBatch()` 与单条**同函**（不另写一份）：逐条出读数 + `byState` / `byReason` 计数可见；★ 同源重复（`rootEventId` 同）是**幂等读数**（`duplicate`）、**不是失败**，也不增条、不计入 `rejected`；★ 空批与「有但全被挡」不同形（空批不得报出任何事实类读数）。

### ⑦ 离线

源码零 `fetch` / `XMLHttpRequest` / `localStorage` / `indexedDB` / `WebSocket` / `navigator.sendBeacon` —— 由判据 `judgeOffline` 逐词钉住。

### ⑧ 跨仓面：新增第 7 面（不假装已在消费）

`tests/audit/open_face_registry.tsv` 新增一行 `phoneFactReceipt`（第 7 面）：`consumer` 如实写 `none@0`（下游 ruby-phone 尚未接入回执面，**不假装已在消费**）；四态与「缺席 vs 空」按 T5/T6 逐字呈现；`memoryToolsEnvelope` 行的 `producer_version` 同步抬到本版（v3305 D2 硬要求：「producer_version 必须与当前版本同步」）。

### ⑨ 新档 `tests/v3314_phone_fact_bridge.test.mjs`（13 条）

M1 登记面（`extra_js` 恰一次 + 与追加时邻居都在场，**位置不作判据**）· M2 导出面（12 函数 / 六登记表 / 十条理由 / 依赖声明面 / 离线）· C1 事件三类 + 未知来源报 `unknown`（**不落默认类**）· G1 证据守卫三档可达且用户接受也推不动 · L1 四态互不同形 + 撤回落定优先 · R1 回执只读 + 理由取自穷尽词表 + `nextStep` 指向真出路 · D1 依赖缺席 ⇒ `decidable:false` · E1 编辑换代 / 撤回两效不同形 · B1 批量与单条同函 + 同源去重是幂等读数 · H1 宿主接线逐符号（定义面恰一次 / 使用面 ≥1 次 / 装配点键名逐字 / 出口不落笔 / 诊断行与 X4 分列）· H2 端到端（真确认 / 未表态 / 守卫档 / 批量 / 模块缺席 / 依赖缺格 / 桥三态）· V1 版本锚 + 六源同源 · X1 六条真源码破坏各自现形 + 正控制地基 + 反向对照 + 判据纯度。

### ⑩ 修后验证真读数

- `node --test tests/v3314_phone_fact_bridge.test.mjs` ⇒ **13/13 pass / 0 fail**。
- `scan_doc_truthfulness` rc0（版本 3.314.0 / 测试 295 / 审计门禁 60（磁盘 65）/ 根级 .js 94 / extra_js 93）。
- `scan_module_wiring` rc0（加载顺序 94 个脚本 / 真加载成功 94/94 / 对外全局 93 个）—— 上一轮的 B3「`window.LonShaPhoneFactBridge` 无人供给」已解消。
- `scan_version_guard` rc0（frontier `v3314_phone_fact_bridge.test.mjs` / 当版锚点 1）；`scan_open_faces` rc0（7 面 0 问题）；`scan_cross_repo_binding` rc0（参考基准 = 磁盘）。

### ⑪ 抬版牵连面（逐项核）

六源（`index.js` / `manifest.json` / `package.json` / `memory-config.js` / `memory-core.js` / `memory-organs.js`）· `manifest.extra_js` 92 → **93**（末位 `phone-fact-bridge.js`）· README 版本行 / 测试文件数 294→**295** / 运行时模块 93→**94** / `extra_js` 三处 92→**93** · PLAN 状态行 / 版本行 / 门禁行 / 体量行（17042 行 / 626 成员 / extra_js 93）/ 两处待验标记 / 跨仓面 6→**7** · TODO 顶行新增「最近更新 v3.314.0」+ 旧行降为历史留痕 · **CHANGELOG 新顶节**（本版）· `v3209` 两处数量锁 92→**93** · `v3247` REGISTRY 追加本档 · `catalog_reference_consumers.tsv` 追加本档一行 · `open_face_registry.tsv` 新增 `phoneFactReceipt` 行 + `memoryToolsEnvelope` 行 `producer_version` 3.313.0→**3.314.0**。

### ⑫ 本版全量未跑

- **退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移**（全仓口径；`node --test` 单套件为 0/1）。
- 按用户纪律（「做完计划全部内容前别跑全量」）只跑单门 / 单套件；全量 `npm test` 与 `npm test -- --audit` 留到计划收口点跑一次。故 README / PLAN 的「全量待验」标记照旧由 `scan_doc_truthfulness` 的 D6 把守。

### ⑬ 抬版连带：三个派生账按真源刷新（读数零手抄）

- `host_beast_baseline.json`：按探针重绑（宿主 16862 → **17042** 行 / 617 → **626** 成员；全部来自 M-X6 宿主真实接线，非死代码回流），`measured_at` 前移到本版；`line_budget` 的 ceiling 17262 / member_ceiling 647 **不动**（余量 220 ≤ slack 400、成员余量 21 ≤ 30，仍在线内）。
- `dead_code_budget.json`：活跃代码实测 58820 行越过旧上界 58444（余量 -376）⇒ 走 `--bump` 抬到 59220（= 实测 + slack 400），理由写进 `note` 与 `history`。
- `state-report.json`：走 `node tools/gen_state_report.mjs --write` 重生成（S3 逐格对账）。

---

'''
edit('CHANGELOG.md', [('cl-head', '## v3.313.0\n', CHANGELOG_HEAD + '## v3.313.0\n', 1)])

# ---- 校验：先全量校验，再写盘 ----
STAGE = []
bad = 0
for rel, pairs in EDIT:
    p = os.path.join(ROOT, rel)
    s = io.open(p, encoding='utf-8').read()
    for tag, old, new, want in pairs:
        n = s.count(old)
        if n != want:
            print('[bump3314] MISS %s / %s 期望 %d 次，实测 %d' % (rel, tag, want, n))
            bad += 1
        s = s.replace(old, new)
    STAGE.append((p, s))

STAGED = dict((os.path.basename(p), s) for p, s in STAGE)

# 派生面一：catalog_reference_consumers.tsv 必须缺且只缺本档一行
tsvp = os.path.join(ROOT, 'tests/audit/catalog_reference_consumers.tsv')
tsv = io.open(tsvp, encoding='utf-8').read()
if 'v3314_phone_fact_bridge.test.mjs' in tsv:
    print('[bump3314] MISS tsv 已含 v3314 行（重复追加会破坏双向差集）')
    bad += 1

# 派生面二：manifest 改后必须是 93 项且末位是本模块
try:
    mf = json.loads(STAGED['manifest.json'])
except Exception as e:
    print('[bump3314] MISS manifest.json 改后不是合法 JSON：%s' % e)
    bad += 1
    mf = None
if mf is not None:
    if len(mf['extra_js']) != 93:
        print('[bump3314] MISS manifest.extra_js 改后应 93 项，实 %d' % len(mf['extra_js']))
        bad += 1
    if mf['extra_js'][-1] != 'phone-fact-bridge.js':
        print('[bump3314] MISS manifest.extra_js 末位应 phone-fact-bridge.js，实 %s' % mf['extra_js'][-1])
        bad += 1
    if mf['extra_js'].count('phone-fact-bridge.js') != 1:
        print('[bump3314] MISS phone-fact-bridge.js 须恰出现 1 次')
        bad += 1

# 派生面三：新增外供面行必须满足 T1~T6 且不撞 v3305 D2（恰 1 行指向 memory-tools-api.js）
NEW_FACE = ('phoneFactReceipt\tlonsha-memory-plugin\tv3.314.0\t'
            'phone-fact-bridge.js::receiptFor,lifecycleOf,handleFact,planEdit,probeCounterpart,BRIDGE_VERSION,RECEIPT_VERSION\t'
            '回执恒定键面 eventId / rootEventId / state / reason / decidable / accepted / nextStep / reasonText / version'
            '（receiptFor 返回冻结新对象）+ 生命周期四态 accepted|rejected|pending|revoked'
            '+ RECEIPT_REASONS 十条穷尽 + BRIDGE_STATES 三态 absent|legacy|capable'
            '+ REQUIRED_DEPS 只一件 FACT_ADMISSION\tnone@0\t'
            '缺席(宿主取不到 window.LonShaPhoneFactBridge = module-absent；依赖 FACT_ADMISSION 缺格 = admission-unavailable，'
            '回执 state 与 reason 具名)/旧版(桥在场但缺回执面 = probeCounterpart 报 legacy，回执按本地读数显示并留痕)'
            '/不产出(无 eventId 或 rootEventId = no-identity，不猜事实身份，换代计划拒)/'
            '空数据(批量传空数组 ⇒ 不得报出任何事实类读数：空批与「有但全被挡」不同形)\t'
            '模块未加载时宿主给同键降级读数（ok:false + state:absent + 诊断行「模块未加载（phone-fact-bridge.js）」），'
            '下游读不到 undefined；准入内核缺格 ⇒ decidable:false 且诊断行点名缺的那一格（不假装 pending、不假装 rejected）\t'
            '缺席｜桥缺席：state=absent 且整条分支不进入（非「没事实」）；依赖缺格：decidable:false + admission-unavailable'
            '｜空｜能力在场、真跑过、批量为空：rows 为空数组（不是「有但全被挡」）'
            '｜判不了｜准入模块不可测 ⇒ admission-unavailable 且 decidable=false，与 rejected 不同形')
facep = os.path.join(ROOT, 'tests/audit/open_face_registry.tsv')
face_src = STAGED['open_face_registry.tsv']
if 'phoneFactReceipt' in face_src:
    print('[bump3314] MISS open_face_registry 已含 phoneFactReceipt（重复追加破坏面标识唯一）')
    bad += 1
cols = NEW_FACE.split('\t')
if len(cols) != 9:
    print('[bump3314] MISS 新面行不是九列（实 %d）' % len(cols))
    bad += 1
else:
    for w in ['缺席', '旧版', '不产出', '空数据']:
        if w not in cols[6]:
            print('[bump3314] MISS 新面行失效条件缺四态词：%s' % w)
            bad += 1
    if len([x for x in cols[8].replace('/', '|').replace('｜', '|').split('|') if x.strip()]) < 2:
        print('[bump3314] MISS 新面行 absent_vs_empty 未分两态以上')
        bad += 1
    if cols[5] != 'none@0':
        print('[bump3314] MISS 新面行 consumer 应为 none@0，实 %s' % cols[5])
        bad += 1
# v3305 D2：指向 memory-tools-api.js 的行仍须恰 1 行
mt_rows = [l for l in face_src.split('\n')
           if l.strip() and not l.strip().startswith('#')
           and l.split('\t')[3].startswith('memory-tools-api.js::')]
if len(mt_rows) != 1:
    print('[bump3314] MISS 指向 memory-tools-api.js 的行应恰 1 行（v3305 D2），实 %d' % len(mt_rows))
    bad += 1

if bad:
    raise SystemExit('[bump3314] 有 %d 处未通过校验，未写盘' % bad)

# 追加行（tsv 与 open_face_registry 均在尾换行前插入）
def append_row(text, row):
    lines = text.split('\n')
    if lines and lines[-1] == '':
        lines.insert(len(lines) - 1, row)
    else:
        lines.append(row)
    return '\n'.join(lines)

new_tsv_row = ('v3314_phone_fact_bridge.test.mjs\t\tM-X6（手机事实桥 2.0：确认 / 撤回 / 双向回执）的成对套件'
               '（13 条 test：含 X1 六条真源码破坏）：M1 登记面（extra_js 恰一次 + 与追加时邻居都在场）'
               '· M2 导出面（12 函数 / 六登记表 / 十条理由 / 依赖声明面 / 离线）· C1 事件三类各自可达'
               '（未知来源报 unknown，不落默认类）· G1 证据守卫承重（三档可达 / 理由不同形 / 用户接受也推不动）'
               '· L1 生命周期四态互不同形（pending ≠ rejected ≠ 判不了）+ 撤回落定优先 · R1 回执只读 + 冻结 '
               '+ 理由取自穷尽词表 + nextStep 指向真出路 · D1 依赖缺席 ⇒ decidable:false（不假装在等 / 不假装被拒）'
               '· E1 编辑 ⇒ supersede（留旧条）/ 删除・撤回 ⇒ withdraw（不留）· B1 批量与单条同函 + 同 rootEventId '
               '只进一次（幂等读数 ≠ 失败 / 空批与全被挡不同形）· H1 宿主接线逐符号（定义面恰一次 / 使用面 ≥1 次 / '
               '装配点键名逐字 / 出口不落笔 / 与 X4 诊断行分列）· H2 端到端（真确认 / 未表态 / 守卫档 / 批量 / 模块缺席 '
               '/ 依赖缺格 / 桥三态）· V1 版本锚 + 六源同源 · X1 六条真源码破坏 + 正控制地基 + 反向对照。')

if not DRY:
    for p, s in STAGE:
        io.open(p, 'w', encoding='utf-8').write(s)
        print('[bump3314] wrote', os.path.relpath(p, ROOT))
    io.open(tsvp, 'w', encoding='utf-8').write(append_row(tsv, new_tsv_row))
    print('[bump3314] wrote tests/audit/catalog_reference_consumers.tsv (+1 行)')
    io.open(facep, 'w', encoding='utf-8').write(append_row(face_src, NEW_FACE))
    print('[bump3314] wrote tests/audit/open_face_registry.tsv (+1 行 phoneFactReceipt)')
print('[bump3314] 完成' + ('（dry）' if DRY else ''))
