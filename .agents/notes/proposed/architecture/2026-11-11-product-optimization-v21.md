# Agent Note: LonSha 第二十一期优化提升计划 (L21-O1 ~ L21-O9)
Status: proposed
Baseline: v3.461.0 / 9a6e158
Date: 2026-11-11
Depends-on: v3.461.0 R18 接线真源修复 / module-consumption-ledger@1

## Problem（全部为 2026-11-11 实勘机器读数）

> 读数来源：`tests/audit/module_consumption_ledger.json`、`manifest.json`、
> `realhost_readings.json`，以及本次逐文件扫描。取证脚本与输出见
> `docs/planning/2026-11-11-product-evidence-v21.md`。

1. **19 个模块 `prod_call_sites = 0`，而它们全在 `manifest.extra_js`（365 项）里真加载。**
   清单（逐条实测）：
   `config-effect-registry.js` / `modules_combined.js` / `graph_algorithms.js` /
   `world-clock-reader.js` / `world-ledger-reader.js` / `cse-engine.js` / `api-channels.js` /
   `fact-unified-lifecycle-bench.js` / `evidence-conflict-adjudication-bench.js` /
   `unified-narrative-clock-axis.js` / `recall-route-feedback-bench.js` /
   `generation-material-budget-plan.js` / `fact-postgen-replay-receipt.js` /
   `maintenance-cold-warm-session.js` / `project-migration-boundary-bench.js` /
   `memory-task-workbench.js` / `meaning-evolution-map.js` / `multi-perspective-theater-bench.js` /
   `memory-action-symbiosis-circuit.js`。
   台账里 19 条的理由**全部是同一条**：「存量独立算法库或工作台套件（待后续阶段接线或降级）」。
   ⇒ **"待后续阶段"已经连续多个期号没到**。这是本仓最缺的第一件东西。

2. **消费台账只覆盖 263 / 365 个模块 —— 102 个模块是审计盲区。**
   `manifest.extra_js` 365 项、根级 `.js` 366 个、台账 `total_modules: 263`。
   差集 **102 个模块在仓、在 `extra_js` 真加载、却完全不在台账里** ——
   台账生成的扫描口径没有覆盖它们，于是 `prod_call_sites=0` 这件事**对它们根本不会被报出来**。
   （对照：v3.461.0 刚修过「36 个 R18 引擎从未挂载成功」——**同一族病的另一个方向**：
   那次是"挂了但挂不上"，这次是"挂了但没人记账"。）
   ⇒ **第二件东西：让台账覆盖全部装载面，并对盲区逐条定性。**

3. **真机验证从未成立：`realhost_readings.json` 的 verdict 是 `environment-unavailable`。**
   原文：`"reason": "ST 未就绪（http://127.0.0.1:1/ ⇒ 0）—— 先起 SillyTavern"`，
   `generatedAt: 2026-11-09`、`version: 3.461.0`。
   而本仓有 `tests/v3428_l12_o5_realhost_suite.test.mjs` / `v3433_l13_o1_realhost.test.mjs` /
   `l18_e2e_mind_symphony_fusion.test.mjs` 三个真机套件 —— **它们在本环境全部只能 bail**。
   ⇒ **第三件东西：把"真机跑不了"从一句边界声明，变成一条带成因码的可读读数**，
   并给出一条**不需要真机也能守住装载面**的替代证据链。

4. **`memory-organs.js`（3053 行）上挂 74 个字段，但没有 `toJSON` / `fromJSON` / `serialize`。**
   导出/导入是**逐个字段手写枚举**。v3.441.0 / v3.442.0 两版各自抓到过一次
   「某个字段没进导出枚举 ⇒ 存盘即丢、读档即空」（`seasonState` / `topicSeasons`）。
   每次都是**事后发现**，**没有判据守「新增字段必须进三处枚举」**。
   ⇒ **第四件东西：让"新增一个持久化字段"不可能忘记登记。**

## Proposal

九项优化全部是**收账 / 收口**，不是新功能。
本仓从 v3.430.0 到 v3.461.0 反复抓到同一族病（建好不接线 / 写了不读 / 同名覆盖），
本期把这族病**做成机器可守的形状**。

### L21-O1 · 19 个零消费模块逐条定性（接线 or 降级，二选一，不许再"待后续"）
- **现有底座与差距**：19 条台账理由全是同一句话，没有一条说明"为什么还没接"。
- **本期交付**：逐个模块给**二选一**的终局处置：
  - **接线**：找到真实宿主时机（主生成注入 / onMessageReceived / 面板出口），
    补「读口 + 动作 + 诊断行」三件套，`prod_call_sites` 0 → ≥1；
  - **降级**：从 `manifest.extra_js` 移出并移入 `_archive/`，台账记 `retired` + 理由。
  **两条路都必须有机器读数变化**（要么 `prod_call_sites` 涨，要么从 `extra_js` 消失）。
  分批推进：先做 5 个（`world-clock-reader` / `world-ledger-reader` / `meaning-evolution-map` /
  `memory-task-workbench` / `config-effect-registry`），其余按批推进。
- **玩家入口**：接线的那几个必须各有面板可见面（时钟读口 → 时间线视图；意义演化 → 关系页）。
- **本地测量与通过标准**：判据 `tests/v21_o1_zero_consumption_triage.test.mjs`：
  ① 台账里**不存在**「待后续阶段接线或降级」这句话（该措辞本身就是欠债标记）；
  ② 每个 `retired` 模块在 `_archive/` 真存在且不在 `extra_js`；
  ③ 每个 `active` 模块 `prod_call_sites ≥ 1`；
  ④ **负控制**：把某个 active 模块的调用点删掉重生成台账 ⇒ ①必须红。

### L21-O2 · 消费台账覆盖全部装载面（263 → 365）
- **现有底座与差距**：`tools/gen_module_consumption_ledger.mjs` 的扫描口径漏掉 102 个模块。
- **本期交付**：修 `getProdFiles` / 模块发现逻辑，让「根级 `.js` ∪ `manifest.extra_js` ∪ 已知宿主注入面」
  三源取并集，**不允许任何一个被加载的模块不在台账里**。
  生成后 `total_modules` 与 `extra_js` 项数必须**同源可比**（差值只能是 frame 壳 `index.js`）。
  对这 102 个模块逐条定性（同 O1 的二选一规则）。
- **玩家入口**：无（审计面）。
- **本地测量与通过标准**：判据 `tests/v21_o2_ledger_coverage.test.mjs`：
  ① `total_modules` 与 `extra_js.length` 之差 ≤ 2（frame 壳允许，其余不许）；
  ② 每个 `extra_js` 项在台账里**恰有一条**（双向，不多不少）；
  ③ 盲区清单为空（本次的 102 个全被覆盖）；
  ④ **负控制**：从台账里删掉一个模块 ⇒ ②必须红；往 `extra_js` 加一个不存在的文件 ⇒ ②必须红。

### L21-O3 · 真机不可用 → 可算的替代证据链（不是又一句边界声明）
- **现有底座与差距**：`realhost_readings.json` 只有 `environment-unavailable` 一句，
  且**没有任何门在读它**。三个真机套件 bail 掉之后，装载面就没人管了。
- **本期交付**：
  ① `realhost_readings.json` 的 schema 加 `cause` 字段，把 `environment-unavailable`
     拆成四个成因码：`no-st-endpoint`（端口不通）/ `st-version-mismatch` /
     `no-browser-driver` / `endpoint-timeout` —— 同是"跑不了"处置不同（前两个要人起环境，后两个要装驱动）。
  ② 新增**替代证据链** `tests/audit/loading_surface_proof.json`：不依赖真机，用
     「`manifest.extra_js` 逐项 → 磁盘存在 → UMD 尾巴形态合法 → 全局名可求值 → 台账有消费」五段证明装载面，
     每段独立可红。**它不能替代真机**，但能让"装载面"这件事在没有真机时也有读数
     （v3.461.0 的 ESM 语法错误正是只有真装载才暴露的，所以五段里"UMD 尾巴形态"是关键新增）。
- **玩家入口**：无。
- **本地测量与通过标准**：判据 `tests/v21_o3_loading_surface_proof.test.mjs`：
  ① 五段逐段可红（每段各配一条真源码破坏负控制）；
  ② `realhost_readings` 的 `cause` 四态互斥，`environment-unavailable` 时**必须**给 `cause`；
  ③ 诚实边界写进读数 `note`：**本证明不等价于真机**，真机结论仍只能由真机给。

### L21-O4 · 持久化字段登记判据（新增字段不可能忘记进三处枚举）
- **现有底座与差距**：`memory-organs.js` 74 个字段，导出/导入是手写枚举；
  v3.441.0 / v3.442.0 各漏过一次，都是事后抓的。
- **本期交付**：新增判据（不新增存储）：
  把 `WorldProgress` 的字段集合（从构造函数真源码抽）与
  导出枚举 / 导入枚举 / 水合表三处做**三向对账**，任一字段缺任一处即红。
  允许显式豁免（`_transient` 前缀或登记在 `tests/audit/transient_fields.json` 并给理由），
  **豁免也双向**（豁免了但其实在枚举里 ⇒ 红，防止豁免表腐烂）。
- **玩家入口**：无。
- **本地测量与通过标准**：判据 `tests/v21_o4_persistence_enrollment.test.mjs`：
  ① 三向对账全绿（当前应有 0 处缺口，若有则本项先修）；
  ② **负控制**：往构造函数加一个假字段不进任何枚举 ⇒ 必须红；
  ③ **反向负控制**：把已在枚举里的字段塞进豁免表 ⇒ 必须红。

### L21-O5 · 提示词注入面的「实际用了什么」逐条可复算（扩到全部分面）
- **现有底座与差距**：L13-O6 已做「注入面这一轮用了什么」可复算，
  但只覆盖回执侧；`engine-injection-pipeline.js`（2935 行）+ `generation-memory-plan.js`（245 行）
  两处组装，**合计组装逻辑**没有一条判据守「回执与注入一致」的全分面覆盖。
- **本期交付**：把 L13-O6 的一致性判据从"回执侧"扩到"组装侧"：
  逐条比对「组装进提示词的条目集合」与「回执记录的条目集合」**双向相等**，
  差异分三档（组装有回执无 = 静默条目；回执有组装无 = 谎报；条数同但 id 不同 = 替换）。
  **三档各有各的话，不许合成"不一致"一个布尔。**
- **玩家入口**：诊断面板「📥 注入面」视图新增三档计数。
- **本地测量与通过标准**：判据 `tests/v21_o5_injection_receipt_parity.test.mjs`：
  ① 三档各自可造（夹具自造，不依赖真仓当前状态 —— v3.20.3 教过的）；
  ② **负控制**：让组装多塞一条回执不记 ⇒ 第一档必须红；
  ③ 逐字快照回滚：判据跑完两处源码字节未变。

### L21-O6 · 面板 27 视图的「每个视图都真能开到」驱动门
- **现有底座与差距**：`settings-ui.js` 有 27 个 `data-view`，
  v3.438.0 O4 有 `scan_ui_view_reach.mjs` 判 nav/code/zero 三档（已 27/27 可达）。
  但**"可达"≠"能打开"** —— 只读 settings-ui.js 判静态可达，没真跑 `showBrowser(view)`。
- **本期交付**：扩 `scan_ui_view_reach.mjs` 增加 T 档（真驱动）：在最小 DOM shim 里
  对 27 个视图逐个真调打开函数，断言**不抛错 + 产出非空根节点 + 有 `data-face-state`**。
  T 档从当前"不敏感"变成"27/27 必须真开得了"。
- **玩家入口**：无（门禁面）。
- **本地测量与通过标准**：判据 `tests/v21_o6_view_drive_truth.test.mjs`：
  ① 27 视图逐个真开，全绿；
  ② **负控制**：给某个视图注一个必然抛错的取数 ⇒ 该视图必须单独红（其余不连坐）；
  ③ 空态与失败态**不同形**（`empty` vs `failed` 各自的 `data-face-state` 值不同）。

### L21-O7 · 跨仓外供面的实时复核（把「冻读取」的过期风险变成读数）
- **现有底座与差距**：第十一道门 `scripts/upstream-face-audit.mjs` 是**冻读取**形态
  （`tests/audit/upstream_face_cache.json` 记「上游说了什么」）。这是对的架构选择，
  但冻读取**会过期**：上游改了，本仓门照样绿，直到有人手动刷新。
- **本期交付**：给冻读取加 `ageDays` 读数与三态
  （`fresh` ≤ 7 天 / `stale` 8–30 天 / `expired` > 30 天），
  `expired` 时门**转红并给刷新命令**。**不引入直读兄弟仓**（v3203 已实测禁止：
  在役测试面引用兄弟仓绝对路径＝把开发机布局写进判据）。
- **玩家入口**：无。
- **本地测量与通过标准**：判据 `tests/v21_o7_frozen_cache_freshness.test.mjs`：
  ① 三态各可造（改 `generatedAt` 造假时间）；
  ② `expired` 必须红且提示可复制的刷新命令；
  ③ **负控制**：把 `ageDays` 计算改成返回 0 ⇒ 三态归一，必须红。

### L21-O8 · 「写了不读」的反向扫描（字段/键被写但全仓零读）
- **现有底座与差距**：v3.443.0 抓到过「写 `undone:true` 但 `roundUndoState` 从不读它」；
  v3.430.0 抓到过「`LONSHA_DRILL_FIXTURE` 死开关」。**每次都是偶然发现**，没有扫描器。
- **本期交付**：新增 `tools/scan_write_only_fields.mjs`：
  扫 `engine.X = ...` / `state.X = ...` 形式的写入点，与全仓 `X` 的读取点比对；
  `写 ≥ 1 且读 = 0` 的进欠账清单，**逐条给理由或修掉**。
  已知误报形态必须排除（链式赋值、`this.X = this.Y`、字符串键、动态属性访问）。
- **玩家入口**：无。
- **本地测量与通过标准**：判据 `tests/v21_o8_write_only_scan.test.mjs`：
  ① 扫描器在两向自证上有效（自造一个只写不读的字段 ⇒ 必须被抓；
     自造一个写了也读的 ⇒ 不许误杀 —— 只断前半句是假绿）；
  ② 当前欠账清单逐条有理由或已修；
  ③ 已知误报形态逐条有夹具（防扫描器靠排除项把真缺陷也排掉）。

### L21-O9 · 版本同源的「第六源」收口（宿主声明 ↔ 磁盘实读）
- **现有底座与差距**：本仓抬版是"六源同源"。v3.444.0 抓到过
  `_eraContinuationLib` **同名两份**导致后者静默覆盖前者（自检拿到错误的库、静默失效）。
  当前有 `module_consumption_ledger` 与 `host_beast_baseline`，但**没有一条判据守
  「`index.js` 里每个 `_xxxLib` 取库口指向的模块名，与它注释里声称的文件名一致」**。
- **本期交付**：新增判据扫 `index.js` 全部 `_xxxLib` 取库口，
  逐个断言「变量名 ↔ 目标模块 ↔ 前置注释声称的文件名」三者一致，
  且**同一变量名全文件恰声明一次**（v3.444.0 那个缺陷的正面回归位）。
- **玩家入口**：无。
- **本地测量与通过标准**：判据 `tests/v21_o9_lib_handle_truth.test.mjs`：
  ① 当前全绿（若有不符则本项先修）；
  ② **负控制**：造一个同名两份的 `_xxxLib` ⇒ 必须红；
  ③ **负控制**：把某个 `_xxxLib` 指向另一个模块但注释不改 ⇒ 必须红（声明与真码对账）。

---

## 批次与依赖

| 批次 | 内容 | 理由 |
|---|---|---|
| A | L21-O2（台账覆盖）→ L21-O1（19 项定性） | 先让盲区可见，再逐条处置；否则改完也不知道有没有漏 |
| B | L21-O4（持久化登记）→ L21-O9（取库口） | 两件都是"声明 ↔ 真码"对账，同族可复用工具 |
| C | L21-O3（替代证据链）→ L21-O7（冻读取新鲜度） | 都属"证据的可信度"面 |
| D | L21-O5（注入回执）→ L21-O6（视图真开） | 都扩既有门禁的射程 |
| E | L21-O8（写了不读） | 独立扫描器，可与任一批并行 |

## 明确不做（如实登记）
- **不新写任何产品功能引擎**（本期全是收账；新功能在 L21-X 里）。
- 不引入直读兄弟仓绝对路径（v3.20.3 已实测禁止）。
- 不为了 `prod_call_sites > 0` 好看而"随便加一个消费者"——
  `config-effect-registry.js` 的相关纪律原文：`do not add a consumer solely to satisfy the audit`。
  接线必须有真实宿主时机，否则走"降级归档"那条路。
- 不承诺真机行为：`realhost_readings` 仍是 `environment-unavailable`，
  本环境不立无法验收的真机门。