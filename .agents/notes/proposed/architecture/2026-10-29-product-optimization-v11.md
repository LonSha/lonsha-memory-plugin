# Agent Note: LonSha 第十一期优化提升计划
Status: proposed

> **期号口径（先说清，免得后人误读）**：V9（2026-10-24）是「第九期」提案；仓内 CHANGELOG 里的「第十期」已由 v3.410.0 承接（动态认知回路 18 项）。本份为**第十一期**，故文件名取 v11 而非 v10 —— v10 已被 v3.410.0 占用，不换名重报。

## Problem

当前代码基线 `v3.426.0 / f907a80`（V9 提案写的基线是 `v3.373.0 / ac5c21a`，已漂 53 版，V9 正文的接口描述整体失效，实施前必须按本份重算）。

本仓的病灶在 v3.42x 这几版被反复确认，而 V9 那套「把已有 owner 连成用户闭环」的处方**开对了、没吃**：

1. **最大的空缺不是机制，是接线。** 实测 `grep -c '<module>' index.js`：V9 两份计划点名的 41 个内核模块**一个不缺**（`OK 41/41`），但其中 **7 个在宿主里零引用** —— `memory-supersede`、`institutional-memory`、`symbolic-evolution`、`knowledge-network`、`relation-dynamics`、`character-agency-contract`、`era-inheritance`。它们 `manifest.extra_js` 登记在册（244 项）、真被加载、单测全绿、`selfCheck` 真跑 —— 产品端一次都没调用。这正是本仓 v2.0.0 起就在治的「功能级失效」，只是这次发生在**自己按计划建的新模块**上。
2. **死代码账本抓不到这一类。** `tests/audit/dead_code_budget.json` 顶层键只有 `_doc / _rule / _bump / ceiling / maxSlack / note / history / _history_last`，量的是**行数**；上面 7 个模块里只有 `knowledge-network` 一个进了账本，其余 6 个既不在预算面、也不在任何消费判据里。**「加载了但没人用」在本仓当前没有任何一道门能判。**
3. **消费判定的粒度是名字，不是绑定。** 在兄弟仓 ruby-phone 实测复现了一类假绿：`config/diff-review-pipeline.js:21 computeParagraphDiff` 是**真孤儿**，但 `config/diff-editor-desk.js:47` 有同名函数被产品消费 ⇒ 零消费门把名字当成了消费，真孤儿被遮蔽、门照绿；把 desk 那个改名后门立刻报出两条未登记零消费。本仓 `clone / record / reject / result / openCount / remove` 存在三账版与六账版并存（v3.281 台账 15 簇 / 60 对逐字副本即证据），同一形态迟早在这里落地。
4. **玩家面板的三态自述仍不成体系。** `settings-ui.js` 有 41 处 `show*` 出口，v3.303.0 只治了四处单点（`esc` 未定义 / 静默无反应 / 提示不诚实 / 属性值往返失真）。「模块缺席」「真的没有」「查询失败」三种情形在各面板仍各写各的 —— 与 v3.426.0 刚修的世界线那两处同族：**「判不了」被写成「没有」**。
5. **文档体量读数与磁盘脱节。** `PLAN.md:57` 写 `index.js` **12122 行 / 723 成员**，实测 `wc -l` = **11718**、`host_beast_probe.cjs` 成员数 = **1168**、`extra_js` = **244**（PLAN 写 243）。而 PLAN 自己在那张表下面写着「**本表仍没有判据看守** —— 台账量的是同一批事实，但本表这几行散文仍靠人记得复算」。探针早就有了，只是没接到这张表上。
6. **诚实边界连四版没动。** v3.424.0 / 3.424.1 / 3.425.0 / 3.426.0 都写着「**仍未跑真实 SillyTavern UI**」。仓里其实已有零依赖 CDP 探针（`tests/audit/_mo1_realhost_probe.mjs`，在真 ST 1.19.0 上跑过 23 条读数并全成立），只是它是 `_` 前缀的**一次性探针**，手工跑、没有入口、没有读数落盘。

结论：本期**不新增第二套事实库、不扩张守卫系统、不再新增「某某引擎」**。九项全部对准「已建的东西有没有真的被用」与「用户能不能摸到」。

## Proposal

每项至少包含：真实现场证据（可复算命令或读数）、现有 owner 接线点、用户可见入口、撤销/降级路径、定向回归。**不把守卫扩建当产品项**，守卫只作为该项的最小收口证据。

### L11-O1 · 零消费内核的接线清算（七件逐个定生死）

- **真实现场**：`for m in ...; do echo "$m=$(grep -c "$m" index.js)"; done` ⇒ `memory-supersede=0`、`institutional-memory=0`、`symbolic-evolution=0`、`knowledge-network=0`、`relation-dynamics=0`、`character-agency-contract=0`、`era-inheritance=0`。另记一处**拼写异体**：`memory-suppersede`（双 p）在 `index.js` 同样为 0 —— 当初接线尝试留下的痕迹本身就是错的。
- **工作包**：对每个模块做三选一并留证：
  - **接线**：给出宿主出口名（`_xxxLib` 取库口 + 业务方法）、面板可达路径、真调用点（不是测试）。参照 v3.344.0 `narrative-layer` 的成熟范式（取库口 + 三出口 + 诊断行 + 自检面一行）。
  - **降级**：明确它只是别人的私有实现 ⇒ 从 `extra_js` 撤登记、从 `manifest` 摘除，并在 CHANGELOG 写明「哪一版的哪项声明是虚的」。
  - **删除**：连同单测一起删，并在 `dead_code_budget.history` 记一条。
- **禁止的解法**：`--update` 抬预算、塞白名单、写一条「只读它一眼」的假消费（`const _unused = require(...)` 之类）。
- **产品结果**：V9 承诺的「组织制度记忆 / 意义演化 / 知识网络 / 关系动力学」要么在面板里真的能点开，要么从计划里消失。**不接受第三种状态。**
- **验收**：七件的 `grep -c` 全部落在「接线」或「已删」两类；破坏任一接线点后对应套件必须红（负控制）。
- **规模**：七件 × (侦察 + 接线 + 面板 + 判据 + 负控制) ≈ **3~4 天**。

### L11-O2 · 死代码预算从「行数」升级到「消费面」

- **真实现场**：`python3 -c "import json;print(list(json.load(open('tests/audit/dead_code_budget.json'))))"` ⇒ 全是行数口径；`knowledge-network in budget = True`，其余六件 `False`。
- **工作包**：新增**消费面台账** `tests/audit/module_consumption_ledger.json`（每模块一行：`module / surface / prod_call_sites / allowed / why`），并写审计脚本 `scan_module_consumption.mjs`：
  - **R1**：`manifest.extra_js` 里每个模块，必须在非测试源码中存在 ≥1 个**解析到该模块**的引用点，否则红；
  - **R2**：台账登记的「允许 0 消费」项必须写明理由，空理由红；
  - **R3**：台账项若已变成有消费（`prod_call_sites > 0`），属账本腐坏 ⇒ **只提示不判错**（漏报比误报更伤，参照兄弟仓 E4 口径）；
  - **R4**：结构健康下限 —— 扫描面模块数低于阈值即 `exit 2`（防探测器失效后以全绿通过，本仓 `scan_module_wiring` 已有先例）。
- **与既有门的分工**（不许重复造）：`scan_module_wiring` 判「加载冲突 / 符号供给 / 全局符号被消费」；`scan_live_wiring_dataflow` 判「幽灵守卫（`this._xxx` 读了没人写）」；本门判「**模块被加载但产品端零引用**」。三者扫描面互不重叠，写进各自散文。
- **验收**：把任一已接线模块的调用点归零 → 红且点名模块；台账 `allowed:0` 项变成有消费 → 只提示；拆掉扫描面 → `exit 2` 而非 `exit 0`。
- **规模**：**1.5~2 天**（含三向负控制）。

### L11-O3 · 消费判定必须按「模块解析后的绑定」，不按名字

- **真实现场（跨仓实测）**：ruby-phone `config/diff-review-pipeline.js:21 computeParagraphDiff` 是真孤儿，但 `config/diff-editor-desk.js:47` 有同名函数被消费 ⇒ 零消费门按名字判绿；把 desk 那个改名（`computeParagraphDiffX`）后门立刻报出两条未登记零消费，其中一条就是那个真孤儿。同一判据缺陷会在本仓复现。
- **工作包**：把消费判定单位从「标识符名」改为「`import` 解析后的模块内绑定」：
  - 有 `import { X } from './m.js'` ⇒ 消费记在 `m.js::X` 上，不记在「全仓任何叫 X 的东西」上；
  - 走 `_moduleLib` / `require` 回落路径的需单独登记（本仓模块大量走 CJS 回落，见 v3.300.0 装载面记录）；
  - 同名跨模块 ⇒ **不算消费**，并在报告里显式写「`m.js::X` 与 `n.js::X` 同名但不同体」。
- **验收**：夹具里造「A 有同名孤儿、B 的同名函数被消费」→ 旧口径绿、新口径红；反方向（真接线但同名）→ 两口径都绿，不许误杀。
- **规模**：**1 天**。

### L11-O4 · 玩家面板的空 / 缺席 / 失败三态统一

- **真实现场**：`settings-ui.js` 41 处 `show*` 出口；`scan_ui_panel_drive.mjs` 六条判据只覆盖诊断面板与条目浏览两条路径。
- **工作包**：定义统一三态出口（`absent / empty / failed`，**三态不同形**，不许压成一句「暂无数据」），落到面板各列表；`scan_ui_panel_drive.mjs` 的 W 段扩到覆盖 ≥8 个面板，其中至少两处是「故意把模块摘掉」的驱动。
- **验收**：摘掉内核模块 ⇒ 面板显示「不可用 + 原因」，不是「0 条」；造一个抛错取数口 ⇒ 失败态 + 保留「重试」；空盘 ⇒ 「真的没有」并给「怎么开始」一句话。
- **规模**：**2 天**。

### L11-O5 · 真实宿主最小回归集（把一次性探针变成可复跑的门）

- **真实现场**：诚实边界连四版写「仍未跑真实 ST UI」；但 `tests/audit/_mo1_realhost_probe.mjs`（零依赖 CDP，Node 自带 WebSocket 直连 Chromium）**已在真 ST 1.19.0 上跑过 23 条读数并全成立**。问题在于它手工跑、没有入口、没有读数落盘。
- **工作包**：整理成 `tests/audit/_realhost_suite.mjs`，一条命令跑三条最小回归：
  1. **装载面**：`moduleGlobalCount ≥ 85`、`_extraJsLoad.status === 'ok'`、`pageErrors === []`；
  2. **写盘闭环**：M-O1 那套五态 + 字节级错档检查（同会话 / await 期间切聊 / 排队批）；
  3. **世界线纪元**：真宿主里造「α线 1–39 → β线 40–46 → **回跳 α线 47–87**」的跳跃登记，断言第 60 楼看第 5 楼是 `blocked` —— v3.426.0 的修法要在**真宿主**上成立，而不只在无头仿真里成立。
- **边界（如实写）**：依赖本地 Chromium 与 ST clone，**不进 `npm test`**；读数落 `tests/audit/realhost_readings.json`，CHANGELOG「诚实边界」段改为「跑过哪三条、还有哪些没跑」。
- **验收**：一条命令、三个读数块、退出码三档（0 全成立 / 1 有真缺陷 / 2 环境缺失）。
- **规模**：**2~3 天**（真宿主调时序最费时）。

### L11-O6 · 文档体量读数直接由探针生成（消灭 PLAN 第 57 行的手抄）

- **真实现场**：`PLAN.md:57` = `index.js 12122 行 / 723 成员`；实测 `wc -l index.js` = **11718**、探针成员 = **1168**、`extra_js` = **244**。该表自身声明「没有判据看守」。
- **工作包**：写 `tools/gen_plan_baseline.py`（或复用 `gen_state_report.mjs` 的取数函数），消费 `host_beast_probe.cjs` 输出**直接改写** PLAN 的版本/体量/快照三行；加一条轻判据：表内数字与探针读数不一致即红。
- **验收**：手工改表里任一数字 → 红；`--write` 后 `--check` 通过；v3.426.0 的三处陈旧读数（12122 / 723 / 243）修正。
- **规模**：**0.5 天**。

### L11-O7 · extra_js 与宿主 seam 的耦合账

- **真实现场**：`manifest.extra_js` = **244** 项；`host_beast_probe.cjs` 的 `seam_modules` = `distinct_modules 148 / reference_sites 424 / call_shape_sites 552`。即 **96 个模块被加载但不在 seam 引用面**。其中多少是「被别的模块内部用」（正常）、多少是「纯挂着」（O1 的七件就属这类），当前没有任何一面说得清。
- **工作包**：出对账表 `tests/audit/extra_js_seam_ledger.tsv`（`module / loaded / seam_referenced / referenced_by / verdict`），`verdict` 三值：`host-seam`（宿主直接引用）/ `module-internal`（被别的模块引用）/ `orphan`（两者皆无 ⇒ 交给 O1）。
- **验收**：`orphan` 计数为 0 或全部在 `module_consumption_ledger.json` 里带理由；探针面塌陷时 `exit 2`。
- **规模**：**1 天**。

### L11-O8 · 世界线记忆对卡作者可用（口径对了，作者还摸不到）

- **真实现场**：v3.425.0 换主键、v3.426.0 修自动推进，两版都把**口径**改对了；但卡作者要落地得读 CHANGELOG 才知道有五个键，`worldlineJumps` 还得手写「每行 `楼层:层标记`」。这些键已进 `CARD_CFG_KEYS` + 有 UI 控件，但**跳跃表编辑器与实时读数没有**。
- **工作包**：
  - 设置面板给「跳跃表」结构化编辑器（增删行、三格一行、坏行当场标红不静默吞 —— 与宿主解析器口径对齐）；
  - 实时读数行：当前推算纪元、`epochAdvance.why`（`configured / no-current-floor / no-jumps / …`）、冲突提示（`current-line-id-vs-jump-conflict`），以及「前史条目会判不了」的显式警告 + 「把首跳登记在第 1 楼」的出路提示（v3.426.0 的 M3 已把这条出路做成判据）。
- **验收**：面板里造三次跳线（含一次回跳）⇒ 读数与内核 `epochAt` 一致；删掉首跳行 ⇒ 前史条目读数从 `blocked` 退回 `undecided`，且面板给出「信息缺失」而非「安全」。
- **规模**：**1.5 天**。

### L11-O9 · 全量回归成本剖面与预算

- **真实现场**：v3.426.0 全量 = **420 文件 / 4532 断言 / 审计 61**，测试 ~323s + 审计 ~133s ≈ **8 分钟**（`--jobs 3 --audit-jobs 2`）。已有 `tests/audit/test_cost_readings.json` 与 `scan_cost_truthfulness.mjs`（量「覆盖范围是否自述」），但**没有逐档耗时的预算表**。
- **工作包**：出 `tests/audit/test_budget.json`（逐档 `ms / limit_ms / why`，余量 `limit = round(ms × 1.1)`、fail-open 不阻发布、告警不改退出码），并给一条「最慢 20 档」读数行。
- **验收**：超预算只告警不改退出码；预算缺项只报耗时并说明原因；审计面与测试面分开计。
- **规模**：**0.5 天**。

## Delivery sequence

1. **先清账（O3 → O2 → O7 → O1）** —— O3 是判据纯度问题，必须先于 O1 收口，否则 O1 的「已接线」会被名字级假绿误判成绿；不接线就谈新功能等于在死件上盖楼。
2. **再收口体验（O4 → O8）** —— 玩家与卡作者摸得到的那两面。
3. **再上证据（O5 → O6 → O9）** —— 真实宿主回归 + 文档读数 + 成本预算，都在前面稳了之后做，否则读数会反复推翻。

## Alternatives considered

- **直接开 V9 的九项优化工作包**：否决。V9 假设「零件齐了、只是没连」，实测更进一步 —— **连零件都没被加载进产品路径**，此时开工作包只会产出第二批死件。
- **用 `--update` 把七件塞进死代码预算**：否决。预算量行数，塞进去等于承认「它在」却不承认「它没被用」，正是本仓治过的「一次成功的失败声明」。
- **把 O2 做成 Gate 而不是台账**：否决。本仓纪律是「守卫只证明功能契约，不占功能名额」；O2 的意义是给 O1 供一张可复算的清单，做完即退到背景。
- **再写一份新计划覆盖 V9**：否决。V9 的问题不是写错，是没执行；本期把 V9 的九项拆成「可结项的接线动作」而不另立名词表。

## Acceptance criteria

九项都必须给出**可复算命令与读数**，并且满足：

- 每项的「真实现场」都能用一条 shell 命令复现（写进该项正文，不写「见某处」）；
- 每项的产品改动都能被至少一条**真源码破坏负控制**证伪（破坏 → 行为真变 → 恢复）；
- 不新增第二套事实库、不复制正文绕开 owner、不改 `WM_VERSION` 除非确实改数据结构；
- 诚实边界逐条如实写（哪些跑了真宿主、哪些只有无头契约）。

## Risks

- **接线面扩张**：七件接线会同时抬高 `index.js` 行数与成员数。纪律是：新出口优先落在既有模块（`engine-diagnostic-lines.js` / `engine-evidence-center.js` / `settings-ui.js`），宿主只加「取库口 + 转发」两行；接线完成后按 `host_beast_baseline.json` 的重建脚本重绑上界，**不许先抬上界再写代码**。
- **O3 会翻出旧账**：改成绑定级判定后，可能一次翻出多个「靠同名被救」的孤儿（兄弟仓一改就翻出 1 个）。这是**欠债显形**，不是新缺陷；按 O1 的同一套三选一处置，不许加白名单了事。
- **O5 的环境依赖**：真宿主回归依赖本地 Chromium + ST clone，新机器跑不了。必须 fail-open 且**如实报「环境缺失」**，不得把缺环境读成通过。