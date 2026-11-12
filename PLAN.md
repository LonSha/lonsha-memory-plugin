# lonsha-memory-plugin 发展规划
> **第二十一期产品计划（2026-11-11，现行 · 唯一现行排序）**：【收账收口 · 闭环复用双线计划】。双仓协同各18项，合起来一共36项。
> **立项依据**：全部来自 2026-11-11 实勘机器读数，见[第二十一期产品证据](docs/planning/2026-11-11-product-evidence-v21.md)（每条附可复跑命令与真实读数）。
> **核心使命**：本仓**不缺引擎**（`manifest.extra_js` 365 项全部真加载，v16/v17/v18 三期 54 项拓展已全部落盘）。
> 缺的是三件事，本期全部收掉：
> ① **19 个模块 `prod_call_sites = 0`**，台账理由全是同一句「待后续阶段接线或降级」——「待后续」已连续多个期号没到；
> ② **消费台账只覆盖 263 / 365** —— **102 个模块是审计盲区**，连 `memory-symphony-orchestrator.js`（1509 行，总调度器）自己都不在台账里；
> ③ **真机验证从未成立**（`realhost_readings.verdict = environment-unavailable`），而这份读数**没有任何门在读**。
> [优化提升九项](.agents/notes/proposed/architecture/2026-11-11-product-optimization-v21.md) · [拓展创新九项](.agents/notes/proposed/feature/2026-11-11-product-expansion-v21.md)。
> **基线**：v3.461.0 / `9a6e158`（两仓 `feat/*` 分支已全部合入 main，故为新立期号）。

## 第二十一期执行批次（双仓协同，共36项）
### 第一大部：LonSha 记忆插件收账与闭环（18项：L21-O1~O9 优化 + L21-X1~X9 拓展）
- **优化提升 9 项（全部是收账，不是新功能）**：
  `L21-O1` 19 个零消费模块逐条定性（接线 or 归档，**不许再「待后续」**）
  —— **已完成（v3.462.0）**：实测推翻原前提，19 个里 6 个是**判据假阳性**（早有真实消费点）、
  13 个是**装载面洗白**（那 1 次调用全来自注册表登记）；另挖出第三种漏判形态（模块不挂全局名，
  消费标识符只在注册表 entries 里，如 `index.js:11843` 的 `optEngines.X || typeof X !== 'undefined'` 取类）。
  最终把 11 个真休眠内核逐条定性为 `declared_dormant`（装载登记但业务零消费，不计入业务能力），
  判据 `tests/v21_o1_zero_consumption_triage.test.mjs` 11 条全绿（含 3 负控制）／
  `L21-O2` 消费台账覆盖全部装载面（263 → 365，`extra_js` 与台账双向恰一条）
  —— **已完成（v3.462.0）**：台账 263 → **366**（含 frame 壳 `index.js`），
  `zero_consumption_count` 19 → **0**，新增 `business_call_sites` / `load_surface_only` 分层口径；
  识别规则抽成唯一真源 `tests/_consumption_lib.mjs`（此前三个文件各内联一份旧正则，互相打架）；
  判据 `tests/v21_o2_ledger_coverage.test.mjs` 9 条全绿（含 4 负控制）／
  `L21-O3` 真机不可用 → 四态成因码 + 不依赖真机的五段替代证据链
  —— **已完成（v3.465.2 补登）**：五段装载面证明 `tests/audit/loading_surface_proof.mjs`（manifest 逐项 → 磁盘存在 → UMD 尾巴形态 → 全局名可求值 → 台账有消费，逐段可红）与四态成因码 `tests/audit/_realhost_judge.mjs`（ENV_CAUSES 4 态互斥 + 非环境 3 态明列 + 不许猜）均已交付，判据 `tests/v21_o3_loading_surface_proof.test.mjs` 22/22 绿；此前漏标「已完成」。／
  `L21-O4` 持久化字段三向对账（构造 ↔ 导出 ↔ 导入，豁免也双向）
  —— **已完成（v3.464.0）**：实勘推翻「一处缺口」的原假设，现场是**三条形态不同的真缺陷**、其中两条是产品缺陷需动代码：① `export()`/`import()` 都枚举、构造函数**一个都没建格**的三个字段（`knowledgeTraces` / `branchSemanticsRead` / `volumeContinuationRead`），补 5 个初始声明后 `ctor` 38 → 43；② 水合表 50 项里 **39 项登记的 `hydrateXxx` 在模块导出面上不存在**，按「函数库 / 类形态 / 无状态纯函数」三分类分别处置（补宽容合并 `hydrateState` + 别名 / 宿主支持 `new mod()` 调实例方法并加 `_stateForSave()` 走 `exportState()` / 纯函数撤登记并留标注），读数 `static 30 / instance 12` 且 `hydratorMissing 0`；③ `v21Initializers` **18/18 全不存在**（v3.460.0 宣称「18 项初始状态融合挂载」从未发生的机器证据），11 项补别名 + 7 项撤登记后归零。判据 `tests/v21_o4_persistence_enrollment.test.mjs` **18/18**（四条负控制 + instance 单列计数）／
  `L21-O5` 注入面「组装 ↔ 回执」双向相等（差异分三档，不合成一个布尔）
  —— **已完成（v3.465.2）**：判定体 `tests/audit/_assembly_receipt_judge.mjs` 纯函数化，三档差异单列：`silent`（组装有回执无）/ `lied`（回执有组装无）/ `swapped`（条数同但 id 不同）。接线判据五锚锁真码（`_allSrc` 写入回执 / `aligned` 长度门 / projection 透传 / 同代快照）。判据 `tests/v21_o5_assembly_receipt_parity.test.mjs` **5/5**（含两条真源码破坏负控制；证明 `aligned` 只比长度，重排/替换必须由 parity 判定体拦）。／
  `L21-O6` 27 视图每一个都**真能打开**（从静态可达升级到真驱动）
  —— **已完成（v3.465.2）**：`tests/v21_o6_view_drive_truth.test.mjs` 在最小 DOM shim + 万能引擎桩（Proxy 不变量合规）沙箱里对全部渲染分支**逐个真调** `showBrowser`：①不抛错 ②产物落 DOM ③带机器可读面态（`data-face-state` / `data-ls-face` / `data-pov-state`）。负控制：单视图取数注入必抛 ⇒ 被 faceRead 收口成 failed 面不炸面板、其余视图不连坐；empty 与 failed 不同形且失败带重试入口。判据 **5/5** 全绿（视图分支下限 fail-closed ≥20）。／
  `L21-O7` 冻读取 `ageDays` 三态（`fresh`/`stale`/`expired`，过期即红并给刷新命令）
  —— **已完成（v3.465.2）**：判定体 `tests/audit/_freshness_judge.mjs` 纯函数化
  （ISO `generatedAt` 与版本式 `measured_at` 双解析；缺时间戳 fail-closed 判 expired）。
  三态阈值 30/90 天；盘上两条 ISO 冻结读数（`realhost_readings.json` / `loading_surface_proof.json`）
  与生成器的对应关系登记在 `READING_PRODUCERS`（expired 时给可复制刷新命令）。
  判据 `tests/v21_o7_frozen_cache_freshness.test.mjs` **5/5**（三态各可造 + fail-closed +
  负控制：把 ageDays 改恒 0 ⇒ 三态归一形态被当场识破）。／
  `L21-O8` 「写了不读」反向扫描（两次历史偶然发现 → 变成常驻扫描器）
  —— **已完成（v3.465.2）**：`tools/scan_write_only_fields.mjs` 常驻扫描（engine./state. 写入点 ↔ 读取点比对，字符串键读算读、链式赋值不重复计）；实扫抓到 4 处写无读，逐条查证均为「state 写 + raw 读」跨对象合法形态，登记豁免 `tests/audit/write_only_ledger.json`（理由 + 读取点指向，双向卫生：已修条目留表必红）。判据 `tests/v21_o8_write_only_scan.test.mjs` 5/5 绿（两向自证 + 登记卫生）。／
`L21-O9` `_xxxLib` 取库口声明 ↔ 真码对账 + 同名恰一份（v3.444.0 同名覆盖的正面回归位）
  —— **已完成（v3.465.0）**：`index.js` 有 **171 个取库口**，真码一行、旁注却是一份独立声明，两份会漂移（v3.444.0 同名两份导致自检拿到错的库，且当时没有任何门能发现）。判定体 `tests/audit/_lib_handle_judge.mjs` 纯函数化，四档缺口单列：`duplicate` / `missingFile` / `globalNotMounted` / `commentMismatch`；豁免只允许登记取库原语。读数：171 / 唯一名 171（同名 **0**）/ 缺件 0 / 挂载名不符 0。**实勘推翻原文假设一处**：171 个里 84 个无注释、1 个分组共享块、1 个显式区分语句 —— 三者判红会逼人改空注释、删有用说明，故单列不判缺口。判据 `tests/v21_o9_lib_handle_truth.test.mjs` **14/14**（含两条计划要求的负控制）／

- **拓展创新 9 项（6 项直接把 `prod=0` 引擎接成闭环）**：
  `L21-X1` 防御叙事一致性守门（复用 `ego-defense-mechanisms-engine`）
  —— **已完成（v3.465.3）**：新增 `defense-narrative-consistency-guard.js`（UMD，挂 `LonShaDefenseConsistency`）：
  在防御引擎产出主观润色之后比对 `lockedFacts` 铁律，三态 `consistent`（放行）/
  `strained`（无法确定，诚实标注不假装一致）/ `contradicts`（与铁律正面冲突，挡下并给替代措辞）。
  **绝不修改防御引擎输出、绝不修改铁律**（两侧 owner 地盘，判据 A6/A7/N2 三向锁死）。
  事件级匹配：动词词干命中 + 人称代词归一（你/我≈同一对话双方）+ 虚词 bigram 过滤
  （「答应过帮小明」不会撞上「答应过帮我」，但「没答应修收音机」必被拦）。
  接线在 `memory-symphony-orchestrator.js` 阶段 3.12 防御引擎消费之后：
  `contradicts` 时注入「该句与铁律不符 + 替代措辞」的提醒指令（不删不改 egoDirs），
  判定存 `engine._defenseConsistencyVerdicts`，trace 记 `stages.defenseConsistency`。
  判据 `tests/v21_x1_defense_consistency.test.mjs` **12/12**（八判定 + 三真源码破坏负控制：
  压态/改铁律/恒放行各一条 + 接线面真消费）／
  `L21-X2` 伏笔时机四因子可解释（复用 `latent-plot-foreshadowing-engine`）
  —— **已完成（v3.465.4）**：新增 `foreshadow-timing-explain.js`（挂 `LonShaForeshadowTimingExplain`）：
  对每条未决伏笔回答「为什么现在提 / 为什么不提」——四因子（时间距离 / 情绪张力 / 话题邻近度 /
  在场人物）**各自独立给出布尔裁决 + 可读理由，绝不加权合成分数**（判据 N1 双向锁死：源码不得出现
  map+reduce 合成、因子不得携带 weight 字段）。裁决规则显式：时间门 + 张力一票否决 + （邻近 或 在场）支持。
  验收旅程闭环：时间够+话题邻近 ⇒ 提，理由「已经过了约 5 天；聊到『收音机』正好相关」；
  张力 0.9 ⇒ 不提，理由直说「正在气头或应激上」。接线在 orchestrator 阶段 3.12 伏笔引擎之后
  （`explainAll` 批量，判定存 `engine._foreshadowTimingExplains`，trace 记 `stages.foreshadowTiming`）。
  判据 `tests/v21_x2_foreshadow_timing.test.mjs` **9/9**（七判定 + 合成回潮负控制 + 接线真消费）／
  `L21-X3` 默契暗号存在性与含义分离（复用 `tacit-intimacy-code-engine`）
  —— **已完成（v3.465.5）**：新增 `tacit-code-legibility.js`（挂 `LonShaTacitCodeLegibility`）：
  三态 `coded`（有暗号，含义遮蔽）/ `ambiguous`（多命中或只沾一半，列候选**不猜**）/
  `plain`。存在性与含义分离（与 v3.439.0 秘密三刀同口径）：对话里暗号句只标「（暗号）」，
  含义只有羁绊 ≥60 且无第三者在场时才解锁；羁绊未到只给「还不到告诉你含义的时候」。
  接线在 orchestrator 阶段 3.12 默契引擎段（判定存 `engine._tacitLegibilityVerdict`，
  trace 记 `stages.tacitLegibility`）。判据 `tests/v21_x3_tacit_legibility.test.mjs` **10/10**
  （八判定 + ambiguous 并入 coded 负控制 + 接线真消费）／
  `L21-X4` 创伤防线分档含 `undecided`（复用 `trauma-taboo-defense-matrix`）
  —— **已完成（v3.465.6）**：新增 `trauma-defense-depth-read.js`（挂 `LonShaTraumaDefenseDepthRead`）：
  把三层映射为可读分档 `deflect`（浅层礼貌推脱）/ `guard`（中层戒备）/ `flashback`（深层应激）
  **+ `undecided`**（判不了不许猜层：无命中、余波、tier 读数异常三种情形都归 undecided）。
  每档带可读触发依据（关键词命中 + 压力读数 + 第几层）；读面**只读不改**引擎状态。
  验收旅程：追问创伤 ⇒ 「guard：提到具体年份相关内容，压力读数 0.68，处于第 2 层防线」；
  无从判断 ⇒ 「无法判断」。接线在 orchestrator 阶段 3.12 创伤引擎段
  （判定存 `engine._traumaDepthVerdict`，trace 记 `stages.traumaDepth`）。
  判据 `tests/v21_x4_trauma_depth.test.mjs` **8/8**（六判定 + undecided 并档负控制 + 接线）／
  `L21-X5` 谣言可回溯原始证据链（复用 `rumor-mutation-entropy-engine`）
  —— **已完成（v3.465.7）**：新增 `rumor-trace-back.js`（挂 `LonShaRumorTraceBack`）：
  把引擎的 trace DAG 变成玩家可读的证据链读面 —— 逐跳「改了什么」（新添/改写增量）、
  异化度直读不重算（`distortionPct` 与引擎 `distortionScore` 单一真源）、
  **originFact 原始证据永远可读**（判据 N1 双向锁死：直读字段 + 多手后与 currentNarrative 必须分叉）。
  `traceAll` 按转述手数排序（最该回溯的排最前）；读面只读不改引擎状态。
  接线在 orchestrator 阶段 3.12 谣言引擎段（判定存 `engine._rumorTraceBacks`，
  trace 记 `stages.rumorTraceBack`）。判据 `tests/v21_x5_rumor_traceback.test.mjs` **8/8**
  （六判定 + 原始证据覆盖负控制 + 接线真消费）／
  `L21-X6` 起居习惯「已沉淀 vs 待观察」（复用 `circadian-shared-routine-engine`） —— **已完成（v3.465.8）**：新增 `shared-routine-evidence.js`（挂 `LonShaRoutineEvidence`）：observed/established/atypical 三档互斥，阈值 `ESTABLISH_THRESHOLD = 5` 单一具名常量不藏魔数，atypical 优先于计数（今天反常不提）；生活看板每行带「第 n/5 次」进度。判据 `tests/v21_x6_routine_evidence.test.mjs` **8/8**（三档判定 + observed 当 established 负控制 + 魔数扫描 + 接线真消费落 `trace.stages.routineEvidence`）／
  `L21-X7` 世界线草稿保存前语义自检（复用 `worldline-memory`） —— **已完成（v3.465.9）**：新增 `worldline-draft-audit.js`（挂 `LonShaWorldlineDraftAudit`）：floorOrder/epochConflict/prehistoryGap/whyEmpty/duplicateFloor 五档各报各的，**不合成「草稿有错」一个布尔**；接线在 `engine.worldlineJumpDraft`（面板「跳跃表」唯一取数口）挂 `audit` 读面字段，每条 finding 带可点行号；验收旅程「第 3 跳楼层 40 < 第 2 跳 47」逐字可复现。判据 `tests/v21_x7_worldline_draft_audit.test.mjs` **10/10**（五档判定 + 五档合一负控制 + 接线真消费不并旧 ok 布尔）／
  `L21-X8` 一次操作的完整回声四档（复用 `echo-ledger` + `oplog`） —— **已完成（v3.466.0）**：新增 `operation-echo-report.js`（挂 `LonShaOperationEcho`）：每条 OpLog 操作四档回声（graph/summary/injection/timeline），每档「受影响/未受影响/判不了」三态，**判不了绝不并进未受影响**（读数缺席与没牵动不同形）；规则表显式可读一处真源；接线在 oplog 面板每行 `<details>`「↩️ 这次改动牵动了什么」。判据 `tests/v21_x8_operation_echo.test.mjs` **9/9**（四档三态判定 + unknown 并入 unaffected 负控制 + 异常吞并负控制 + 接线真消费）／
  `L21-X9` 「我为什么不记得」话题级四态归因（复用 `memory-archaeology-gap-bench`）。
- **批次与依赖**：A=`O2→O1`（先让盲区可见再处置）｜B=`O4→O9`｜C=`O3→O7`｜D=`O5→O6`｜E=`O8` 可并行。

> **历史期号留档（勿当现行排序读）**：
> # lonsha-memory-plugin 发展规划
> **第十七期产品计划（2026-11-08，现行重大更新）**：【全息共生·心智防御与拟真生活双核跃升计划】。双仓协同各18项，合起来一共36项。
> **核心使命**：攻克长程叙事中的心理防御主观重塑、草蛇灰线主动提问、认知四桶硬隔离、全域Spotlight穿透、超长消息流60fps虚拟滚动、及手机记忆双向反哺闭环。
> [优化提升九项](.agents/notes/proposed/architecture/2026-11-08-product-optimization-v17.md) · [拓展创新九项](.agents/notes/proposed/feature/2026-11-08-product-expansion-v17.md)。

## 第十七期执行批次（双仓协同，共36项）
### 第一大部：LonSha 记忆插件心智深潜（18项：L17-O1~O9 优化 + L17-X1~X9 拓展）

> **第十六期产品计划（2026-11-08，现行重大更新）**：【双项目贯通·心智与手机双核跃升计划】。双仓协同各18项，合起来一共36项（`L16-O1~O9`、`L16-X1~X9`、`R16-O1~O9`、`R16-X1~X9`）。
> **核心使命**：彻底打破原本模块间的割裂孤岛，将原本已有的数十个引擎全部融会贯通；打造目前最迫切缺失的“鲜活拟真人际张力、日常陪伴呼吸感、手机生活拟真生态与时空因果深层反哺”，杜绝晦涩黑话，确保玩家端零理解成本。

## 第十六期执行批次（双仓协同，共36项）
### 第一大部：LonSha 记忆插件心智深潜（18项）
- **优化提升 9 项（L16-O1 ~ L16-O9：全引擎融会贯通与存量加速）**：
  - `L16-O1` 全引擎交响总线波纹级联贯通：将孤立的30+引擎统一纳入 `memory-symphony-orchestrator.js`，按感知、因果、防御、反刍、生成五级心智梯队统一调配。
  - `L16-O2` 检索多路召回仿生Hebbian能量扩散强化：让高频情感互动的事实天然具备召回加速度与关联扩散力。
  - `L16-O3` 玩家端诊断面板通俗化深度清洗：彻底替换任何技术名词，以通俗平稳的白话展示心智状态。
  - `L16-O4` 万级记忆分层折叠金字塔索引压缩：解决上千轮长对话下的内存占用与计算延迟。
  - `L16-O5` 实体指代消歧与时空冲突仲裁加速：彻底解决多角色在场时的“你我他”混淆与时间线错乱。
  - `L16-O6` 亲历/共历/传闻/禁区四桶认知视界物理隔离：确保角色绝不出现全知视角穿帮。
  - `L16-O7` 前摄因果校验与物理不变量主动熔断：杜绝死者复生、跨时空瞬间移动等违背客观事实的胡言乱语。
  - `L16-O8` 潜意识情绪移情与主观叙事扭曲校准：根据角色好恶对记忆事实进行微妙的主观情绪润色。
  - `L16-O9` 跨会话心智状态无损持久化快照：确保浏览器刷新、切卡后，情绪余韵与当前心流绝对不丢失。

- **拓展创新 9 项（L16-X1 ~ L16-X9：当前最急缺的全新心智引擎）**：
  - `L16-X1` 对话动量与心流势头维持引擎（`narrative-momentum-flow-inertia-engine.js`）：告别话题瞬间冷场，维持高潮情绪黏滞性。
  - `L16-X2` 隐性人情羁绊与互惠张力引擎（`latent-social-bond-reciprocity-engine.js`）：记录善意与歉疚，产生真实的人情牵引与补偿欲。
  - `L16-X3` 角色默契心领神会与未言明暗号引擎（`character-tacit-understanding-engine.js`）：相熟角色无需点破即可会意，激发专属暗号。
  - `L16-X4` 欲言又止与潜台词心机引擎（`unspoken-hesitation-subtext-engine.js`）：话到嘴边留半句，细腻捕捉神情停顿与未尽之意。
  - `L16-X5` 长期承诺与约定里程碑追踪引擎（`long-term-commitment-milestone-engine.js`）：跨数百轮不忘长远期许，时机契合主动提起。
  - `L16-X6` 日常生活习惯共生与节律共鸣引擎（`everyday-shared-routine-rhythm-engine.js`）：随现实时间流转感知晨起、午后、深夜的起居生活细节。
  - `L16-X7` 誓约心锚与背弃反噬共振中心（`emotional-anchor-binding-resonance-hub.js`）：重塑承诺被击碎时的心理震颤与行为反差。
  - `L16-X8` 创伤禁忌三层渐进心理防线（`obsessive-taboo-multi-tier-defense.js`）：当触及不可言说的痛处时展现逼真的闪避与防御。
  - `L16-X9` 客观世界因果桥主观折射摄入引擎（`worldaxis-objective-to-subjective-assimilator.js`）：将客观世界的物理变化化为角色的第一人称感触。

---

> **第十五期产品计划（2026-11-06，现行提案）**：优化9项＋拓展9项（`L15-O*` / `L15-X*`），双仓合计36项。规划基线 v3.446.0 / `a82a229`。全链路贯通拒绝纯内核：要求数据Owner、宿主API、诊断行、主生成注入及Settings UI五位一体，搭配真源码破坏负控制定向门禁推进。
> [优化提升九项](.agents/notes/proposed/architecture/2026-11-06-product-optimization-v15.md) · [拓展创新九项](.agents/notes/proposed/feature/2026-11-06-product-expansion-v15.md) · [源码证据与六个大批次](docs/planning/2026-11-06-product-evidence-v15.md)。

## 第十五期执行批次与当前优先级
> **【陈旧节 · 勿当排序读】** 本节属第十五期提案批次表（规划基线 v3.446.0 / `a82a229`），六个批次 L15-O1~O9 / L15-X1~X9 已全部交付（见各条目末「已交付 vX.Y.Z」），仅作交付史保留。**现行排序见文首「当前优先级（唯一现行排序 · 判据 `scan_plan_currency.mjs`）」节。**
1. 批次A：`L15-O1` 具身在场状态持久化 + `L15-X1` 具身密谈耳语私密注入（联动 RubyPhone R15-O9 / R15-X1）。
2. 批次B：`L15-O3` 事实纠错影响扩散版本树 + `L15-X4` 誓约决裂与违约心理烙印。
3. 批次C：`L15-O4` 动态长篇选材注意力弹性预算 + `L15-X6` 地点禁忌记忆反射激活。
4. 批次D：`L15-O2` 检索消歧人际图谱动态加权 + `L15-X3` 视角冲突记忆并列对照。
5. 批次E：`L15-O5` 事实有效期日历时间双锚定 + `L15-X2` 角色自传心路重述沙盘。
6. 批次F：`L15-O6` 周目差异比对增量合并 + `L15-O7` 混合检索分桶粗筛 + `L15-O8` 证据局部自愈 + `L15-O9` 健康矛盾巡检 + `L15-X5` 传闻异化 + `L15-X7` 潜意识微反应 + `L15-X8` 反事实推演 + `L15-X9` 隐秘解密。

> **第十四期产品计划（2026-11-03，历史基线已落地）**：优化9项＋拓展9项（`L14-O*` / `L14-X*`），双仓合计36项。规划基线v3.445.0 / `ff2d5da`；优化9项与拓展9项共18项纯函数契约内核、宿主对接与专项验证套件已全部实施完成。
> [优化提升九项](.agents/notes/proposed/architecture/2026-11-03-product-optimization-v14.md) · [拓展创新九项](.agents/notes/proposed/feature/2026-11-03-product-expansion-v14.md) · [源码证据与六个大批次](docs/planning/2026-11-03-product-evidence-v14.md)。
> 第十三期及更早内容为历史留痕，未完成项与交付声明均须按第十四期证据页复核，不直接当施工单。

## 第十四期当前优先级
> **【陈旧节 · 勿当排序读】** 本节属第十四期提案批次表（规划基线 v3.445.0 / `ff2d5da`），六个批次 L14-O1~O9 / L14-X1~X9 已全部交付，仅作交付史保留。**现行排序见文首「当前优先级（唯一现行排序 · 判据 `scan_plan_currency.mjs`）」节。**
1. 批次A：`L14-O1` / `L14-O8` / `L14-O5` —— 可靠地留下与返回。
2. 批次B：`L14-O2` / `L14-O6` / `L14-O9` —— 改错与办事可以放心。
3. 批次C：`L14-O3` / `L14-O4` / `L14-O7` —— 长篇与长用都流畅。
4. 批次D：`L14-X1` / `L14-X2` / `L14-X4` —— 交流与约定形成过程。
5. 批次E：`L14-X3` / `L14-X5` / `L14-X6` —— 准备下一幕与持续活动。
6. 批次F：`L14-X7` / `L14-X8` / `L14-X9` —— 回访、交接与体验收口。

> **第十三期产品计划（2026-10-31，历史提案）**：本仓优化9项＋拓展9项（编号 `L13-O*` / `L13-X*`）；与 RubyPhone 第十三期（`R13-*`）合计36项。**本轮只制定计划，不代表功能已实施或升版。**
> [优化提升九项](.agents/notes/implemented/architecture/2026-10-31-product-optimization-v13.md) · [拓展创新九项](.agents/notes/proposed/feature/2026-10-31-product-expansion-v13.md) · [基线、差异化与验收边界](docs/planning/2026-10-31-product-evidence-v13.md)。
> **期号口径**：本期用 `L13` 而非 L12 —— `CHANGELOG.md` 的 v3.420.0 已用 `L11-*` 指另外十八件模块，第十一期因此改名 L12；`L12-*` 已被 v3.428.0~v3.430.0 用掉，故顺延 L13（见证据页第一节）。
> **第九期产品计划（2026-10-24，历史提案）**：[优化九项](.agents/notes/proposed/architecture/2026-10-24-product-optimization-v9.md) · [拓展九项](.agents/notes/proposed/feature/2026-10-24-product-expansion-v9.md) · [证据页](docs/planning/2026-10-24-product-evidence-v9.md)。
> **当前执行状态（2026-11-12，v3.466.0）**：第二十一期**优化面 O1~O9 全部交付**（v3.465.2 收账提交 `27402ff` 已推送）；
> 拓展面 `L21-X1`（v3.465.3 12/12）、`L21-X2`（v3.465.4 9/9）、`L21-X3`（v3.465.5 10/10）、`L21-X4`（v3.465.6 8/8）、`L21-X5`（v3.465.7 8/8）、`L21-X6`（v3.465.8 8/8）、`L21-X7`（v3.465.9 10/10）、`L21-X8`（v3.466.0 9/9）已交付；X9 与 ruby-phone R21 18 项进行中。
> v3.465.1 是收账轮的自证复核版，把 v3.465.0 交付后暴露的**全仓审计 25 项红**逐条追到根因。v3.465.2 续收账：把全量审计（509 文件）暴露的 9 失败文件 / 12 失败断言逐条归因修复 —— 判据滞后 7 处只改判据并在判据内留痕归因（v21_o4 判定体类缩进、v21_o9 版本真源、v3156 / v337 去黑话文案锚、v34230 tab 锚、v3271 escAttr 三行锚、v3227 耗时上界并发余量、v323 collectExport 抽取口径）；真缺陷 2 处修产品（`_umd_reload_judge.mjs` 漏登 EXEMPT、本状态行停版）。
> **本版性质（先说清楚，避免被读成「又加了一批功能」）**：三项红**是我自己造成的**，两项是判据侧的死前提，一批是读数欠账。**没有一项是「顺手改了别人的东西」。**
> **① 写入侧从来没写过（本版最重的一条，排在所有其它项之前）**：`collectExport` 把 9 个含 `Map`/`Set` 的状态对象**原样**塞进存档，而 `JSON.stringify(Map)` 恒为 `{}` ——「存了 3 个沙盒」与「一个都没存」在文件上完全同形。我上一刀的 `hydrateState` **只修了读取端**，真实链路里 Map 根本到不了 JSON ⇒ 写得再对也是空转。**这一条同时掲出我自己的假绿探针**：拿 `JSON.stringify(默认状态)` 当「落盘」，元素早已丢光，而它只核 `instanceof Map` —— 空 Map 当然也是 Map，于是打印「通过」。修法一次补齐三段：写入段 `_flattenColl`/`_collForSave`（`Map`→`{__map:[[k,v],…]}`、`Set`→`{__set:[…]}`，**用带前缀的标记对象而不是裸数组**；`_collForSave` 先扫一遍、**只有真含容器才摊平** ⇒ 无容器模块存档格式一个字节不变）、还原段 `_unflattenColl`（**只在一处做**，9 份反向实现就是 9 个第二真源）、读取段（按形状归一化）。判据 `tests/v21_o4b_volatile_container_chain.test.mjs` **18/18**（判定体 `_volatile_container_judge.mjs` 纯函数不碰 fs），三段各自可证伪 + **四条负控制全真跑** + `D1` 落盘侧↔登记表双向一致（防幽灵键）+ `D2` 摊平不误伤 + `E1` 判据纯度。
> **② 我自己上一刀写出的真缺陷（`L21-O4` 的 19 份 `hydrateState`）**：v3.464.0 我给 19 个心智引擎补水合时，用**同一份**「以默认为底逐键浅合并」的函数体复制到 19 个文件 ⇒ `v3281` B1 当场翻红（19 份字节相同，本仓「两份实现即第二真源」）。更重的是**它本身就是它声称要修的那个病**：这些模块的状态里有 `Map` / `Set` 字段（`activeSandboxes` / `hiddenFragments` / `covertIdentities` / `activeCovenants` / `registeredEngines` / `tabooSensors` / `stressTension` / `actorResilience` / `timelineEvents` / `characterLifespans` / `characterDossiers` / `sharedPublicFacts` …），落盘走 JSON、读回来是普通对象/数组，浅合并把普通对象**原样写回字段** ⇒ 此后每次 `.get` / `.has` / `.add` / `.set` 全是 `TypeError`。**「登记成立」被我当成了「恢复正确」** —— 而 O4 那一刀的立论恰恰是「不许把原始 payload 直接塞进宿主字段」。
> **修法**：19 个模块各按自己的真实状态形状重写归一化体（Map 由 `entries` / 数组 / 普通对象重建、Set 由数组重建、数值按字段值域夹紧、枚举按受控词表回落、可空时间戳保持 `null` 而不用 `0` 冒充「公元 0 年亡故」）。**行为已实证**：把各模块的默认状态 `JSON` 往返后再走 `hydrateState`，`Map`/`Set` 字段回来的是**真的 Map/Set**（修前是普通对象/数组）；`v3281` 回到 **10/10**。原文备份在 `/tmp/bak19/`（仓库外，不入库）。
> **③ 我上一刀的判定体在别人身上复发**：`scan_audit_lib_consolidation` 的 N5 负控制（「漏接出口的 drift 必须被兜底拦下」）转红，`status=1` 而非期望的 `exit 2`。根因**不是**本轮新增的两个文件，而是 `tests/v3461_r18_wiring_truth.test.mjs:48` **本地重写了一份 `stripComments`**（只两条正则替换、不认字符串/模板串/正则字面量）。N5 的机制是把整个 `tests/` 镜像到临时目录再跑扫描器，扫描器在镜像里先报出这条真缺陷并以 `exit 1` **提前退出**，`exit 2` 的兜底检查**根本没跑到** —— 一份第二实现同时让「唯一真源」和「兜底自证」两项失效。修法：改走真源 `_audit_lib.mjs` 的 `stripComments`（严格更强、等长占位保偏移），三处用法都只需「注释不参与匹配」、**不存在「语义不同」**，故**不登记 EXEMPT**（登记才是放水）。修后：本地重写 **1 → 0**、N5 兜底真拦下并 `exit 2`、`v3461` 仍 **10/10**。
> **④ 三处判据的「死前提」被实勘推翻（判据问题，不是产品缺陷）**：`floor-fingerprint-self-healer.js` 在 v3.464.0 撤掉那条不成立的水合登记后，真实状态是**全仓零引用**（既无业务消费、也不在可选引擎注册表 entries 里）。四份判据仍假设它属于「装载面洗白」那一类，于是要求读数归零或要求「装载面引用 > 0」。
> | 判据 | 原文前提 | 实况 | 改法 |
> |---|---|---|---|
> | `v21_o1` ④ | `zero_consumption_count === 0` | 真实 1（已如实定性为休眠内核） | 改为「零引用必须逐条定性 + 差异**恰好**等于 triage 里写明「全仓无调用点」的那几条」，多一个都红 |
> | `v21_o1` ⑧ | dormant 模块 `load_surface_callers` 必非空 | 它连装载面都没有 | 改为「**若有**装载面引用，必须解释掉全部 prod」；零装载面的则强制要有「全仓无调用点」理由 |
> | `v3163` / `v3173` | 输出必须含「已挂载未消费 0 个（账本 0 个）」 | 账本 1 条（如实记账） | 改为「未消费数**必须等于**账本数」—— 多出来的才是没记账的静默腐烂 |
> 三条改动都**保留负控制**（删 triage 条目必红、篡改 business 读数必红、口径分叉必红仍在跑）。理由同一条：**判据要求一个只有造假才能满足的读数，它就退化成「防不绿」**。
> **⑤ 读数欠账（走脚本重绑，零手抄）**：`index.js` 入口 13034 → **13069** 行（`split('\n')` 口径，与判据 `__hostEntry().split(NL).length` 同源；「`wc -l` 13068 vs split 13069」已查明是末行无换行产生的尾部空元素）。按 v3461 公式写 `tools/rebind_host_beast_v3465.py`（只换 VER / REASON / 前置版本校验），探针实测落盘：入口 **13069** / 合并面 **35753** / 成员 **1342** / TOP40 **42.0%**，行上界 13112 与成员上界 1366 **均不需上抬**（余量仍在 slack 内，不抬即是不给增长开口子）。`dead_code_budget`：活跃代码 366 文件 / 实测 139653 行，登记上界 138664 → **140053**，抬升分两次并各带理由写进 `history`：① +912（19 个模块的归一化 `hydrateState` 与 `engine-persistence-ops.js` 水合表 50→42 改造）；② +477（把首版弱实现换成按形状归一后的净增，**这不是新增功能面**）。文件数 366 与声明 366 一致、无游离文件、**没有为了凑读数删任何文件**。
> **⑥ 诚实边界（本版不掩盖任何一条）**：
> - 本版**没有跑全量 `npm test`**；回归只覆盖上表涉及的那些档与被改动文件的直接下游。全量实跑仍留到双仓收口点，**读数登记不假装已经验过**。
> - `hydrateState` / `_flattenColl` / `_unflattenColl` 三段**只在单进程里做过端到端往返**（12 个容器字段逐一核对元素）；真实 SillyTavern 会话的存档 / 读档链路**未执行**（无真机环境）。
> - **老存档救不回来**：本版之前那些字段在文件里本来就是 `{}`，信息已丢；本版只保证「从现在起不再丢」。
> - 「未消费数 = 账本数」这一条**不保证零未消费**，它只保证「未消费的都有账」；`floor-fingerprint-self-healer.js` 仍是休眠内核、仍是零引用 —— 如实状态。
> **上一版 v3.465.0**：L21-O9 取库口「变量名 ↔ 目标模块 ↔ 注释声称」三者对账（171 声明 / 171 唯一名 / 同名 0 / 缺件 0 / 挂载名不符 0；判定体 `_lib_handle_judge.mjs` 纯函数化，判据 14/14）。
> **上一版执行状态（v3.465.0）**：第二十一期**批次 A 三项 + 批次 B 两项全部交付**（`L21-O2` / `L21-O1` / `L21-O3` / `L21-O4` / `L21-O9`）。
> **本版（L21-O9）**：取库口「变量名 ↔ 目标模块 ↔ 注释声称」三者对账。`index.js` 有 171 个 `_xxxLib()`，真码只有一行 `_moduleLib(() => window.Xxx, 'xxx.js')`，旁边却常有长注释介绍「本模块指向 xxx.js」—— 同一个事实**两份可能漂移的声明**。v3.444.0 的同名两份（`_eraContinuationLib` 后者静默覆盖前者、自检拿到错的库）**当时没有任何门能发现**，本版把那次缺陷变成正面回归位，并把对账覆盖到全量 171 个。判定体 `tests/audit/_lib_handle_judge.mjs` 纯函数化（不 import fs、以 `readModule` 参数注入读盘），四档缺口各自单列不压成布尔：`duplicate` / `missingFile` / `globalNotMounted` / `commentMismatch`；切片失败显式报 `slice-failed` 不许当通过；豁免**只允许登记取库原语 `_moduleLib`**（真取库口进豁免 / 理由为空 / 幽灵名，三种都红）。
> **读数**：171 声明 / 171 唯一变量名（同名 **0**，v3.444.0 那一刀没有复发）/ 目标文件缺件 **0** / 挂载名与声明不符 **0**（初版探针报 5 项，查清是我探针写死了前缀白名单——本仓实测有 `window` / `global` / `globalThis` / `root` / `self` / `g` 六种挂载写法，属**假阳性**，改正后归零）。
> **实勘推翻计划原文一处（如实记）**：原文写「注释里声称的文件名」，隐含假设「每个取库口旁边都有一句『本模块=x.js』」。实测 171 个里 **84 个无注释**、**1 个分组共享块**（`_institutionLib` 挨着讲「五件零消费内核」的块）、**1 个显式区分**（`_gapBenchLib` 特意写「与 `_archaeologyLib` **不是同一件**」—— 提到别的文件名正是为了防误合并）。三类都判红等于逼人去改 84 处空注释、删掉两条有用说明，那是**判据虚报逼着人做坏事**；故单列 `commentAbsent` / `commentShared` / `commentDisambiguated` 不判缺口。
> **两处自我纠错（判定标准侧，被负控制当场抓住）**：① 「显式区分」词表放了 `不同` 这类泛词 ⇒ 夹具「本件与别件不同」被误判成区分语句，**真缺口（真码指向 demo-new.js、注释声称 demo-old.js）被放过**—— 判据过宽造成的静默通过比漏报更坏，收紧成完整短语；② `A8` 夹具缺 `_moduleLib` 声明 ⇒ 任一豁免名都命中「名字不存在」这条**别的**理由，判据看似通过而实际测的是别的东西，补上原语后四条问各落预期分支。
> **顺带修掉两处「死数伪装成判据」**：`v21_o3` / `v21_o4` 的当版锚原写「manifest.version 必须恰好等于我出生那一版」，抬版即红、逼人每版回来改数字（V3 段头治的正是这种形态）。改为「出生版本写字面量（可读、可被 V4 数到锚）+ 比较用 `>=`（不得回退）」，改后 `v21_o3` **22/22**、`v21_o4` **18/18**。
> **一处被撤登记连带暴露的存量问题**：`floor-fingerprint-self-healer.js` 的 `prod_call_sites` 归 0 后，`v21_o3` 的 S5（台账每条有真实业务消费、dormant 单列不静默吞）转红。它不是新缺陷，而是**同一件被掩盖的事实第二次现形**：L21-O4 撤掉那条不成立的水合登记后，它的零消费状态才被看见。按 O1 纪律逐条定性进 `tests/audit/l21_o1_triage.json` 的 `declared_dormant`（11 → **12 项**），不设假消费点（`do not add a consumer solely to satisfy the audit`）。S5 随后转绿。
> **诚实边界**：本判定只做**静态**对账，证明「取库口声明 ↔ 磁盘真码 ↔ 注释」三者文字一致，**不能证明运行时真的取到了正确的库**（同名二次赋值、条件分支里的覆盖挂载在射程外）。它绿的含义是「不可能因为改名 / 重名 / 写错文件名而静默取到错的库」，不是「取库一定成功」—— 写进判定体 `BOUNDARY`，由判据 C2 钉住。
> **上一版 v3.464.0**：L21-O4 持久化字段登记判据（三条形态不同的真缺陷：字段缺初始声明 / 水合函数名对不上真码 39 项 / 初始化表 18 项全不存在；`ctor` 38→43、水合表 50→42、初始化表 18→11；判据 `v21_o4` 18/18）。
> **当前执行状态（2026-11-12，v3.464.0）**：第二十一期批次 A 已交付 `L21-O2` / `L21-O1` / `L21-O3`，批次 B 首项 `L21-O4` 已交付。
> **本版（L21-O4）**：持久化字段登记判据。计划原文只写「`WorldProgress` 的字段集合与导出 / 导入 / 水合表三向对账」；实勘下来同一个「登记不全」底下是**三条形态完全不同的真缺陷**，而其中**两条是产品缺陷、必须动代码**（不是口径调整）：
> - **形态甲 · 字段级漏格**：`export()` 写了 `knowledgeTraces` / `branchSemanticsRead` / `volumeContinuationRead` 三键、`import()` 也读回来了，但构造函数**一个都没建格**。全新实例上三者全是 `undefined`，而读取侧靠 `this.x || (this.x = {...})` 懒建 ⇒「还没记过」与「记了但读不到」在存档层同形。补 5 个初始声明（并写明「`null` = 还没算过、`{}` = 算过但为空，两者必须可分」）后 `ctor` 38 → **43**。
> - **形态乙 · 水合函数名对不上真码**：`v21Engines` 表登记 50 项，**39 项登记的水合函数在模块导出面上根本不存在**（表里写 `hydrateRippleState`，模块只有 `createOrchestrationState`）。三分类分别处置，**绝不统一补一个空函数**：函数库 19 项补宽容合并的 `hydrateState` + 按登记名补**别名**（单实现，不搞两份）；类形态 12 项**不动模块改宿主**（`restoreFromPayload` 展开三支：静态直调 / `new mod()` 调实例方法 / 回落但**必须计入** `res.hydrateFallback`），写入面加 `_stateForSave()` 走 `exportState()`（否则 `new Map()` 存成 `{}`，「存了」与「什么都没存」同形）；无状态纯函数 8 项**从两张表层撤登记并原位留标注**。
> - **形态丙 · 初始化表 18/18 全部不存在**：`v21Initializers` 登记的 `createInitialRippleState` 等 18 个名字在模块上全无对应 —— 这正是 v3.460.0 宣称「18 项心智引擎初始状态与宿主生命周期融合挂载」**从未发生**的机器证据。11 项补别名、7 项无状态撤登记后缺失归零。
> **读数**：`ctor 43 / export 34 / import 34` 三向零缺口；水合表 50 → **42**（`staticForm 30 / instanceForm 12` 单列计数）且 `hydratorMissing 0`；初始化表 18 → 11 且缺失 0。
> **判据**：`tests/v21_o4_persistence_enrollment.test.mjs` **18/18**（含假字段 / 豁免表反 / 导出独有键 / 撤销项加回表四条负控制；`B3` 钉死 `static + instance === table`，不许把 instance 并进 static 冒充「一样」；`A8` 切片失败必须显式报 `slice-failed`、不许当通过）。判定体 `tests/audit/_persistence_field_judge.mjs` 纯函数化。
> **三次自我纠错（全在判定标准侧，如实记）**：① `extractExports` 的 `[^}]*` 被函数体 `return base;` 截断 ⇒ **已经导出的** `hydrateState` 被判不存在（判据虚报比漏报更坏，会让人去修一个不存在的问题），改为从文件末尾按花括号配平；② 补丁统一补通用名而表中 18 项是专用名 ⇒ 补完仍缺 31 项，改「单实现 + 别名」；③ `B4` 断言 `miswired` 为空是语义误读（它指「模块有能力、宿主按静态登记」）⇒ 改为「必须被点名 + 宿主两型真支持 + 走 `exportState`」。
> **回归**：`v3368` 8/8、`v21_o3` 22/22、`v3461_r18_wiring_truth` **10/10**、`scan_version_guard` 问题 **0**。其中 `v3461` D1 一度转红，暴露一处**被掩盖的事实**：`LonShaFloorFingerprintSelfHealer` 此前一直靠「水合表登记」获得豁免（`scan_module_wiring.mjs` 的 `if (hydrateRegistered.has(sym)) continue;`），撤登记后真实状态暴露 —— **它从来没有被宿主消费过**。按纪律**不设假消费点**（那是 `do not add a consumer solely to satisfy the audit`），改为在 `UNCONSUMED_LEDGER` 如实登记并写明理由。
> **诚实边界**：本判据证明「声明面与真码面静态一致」，**不能证明运行时真的恢复正确**；两侧都漏登记的双错不在判定射程内。这句话写进判定体导出 `BOUNDARY`，由判据 C2 钉住。
> **上一版 v3.463.0**：L21-O3 真机不可用 → 四态成因码（`no-st-endpoint` / `endpoint-timeout` / `no-browser-driver` / `st-version-mismatch`）+ 装载面五段替代证据链（`loading_surface_proof.mjs`：disk / syntax / umd-tail / global-eval / ledger，每段独立可红）。修前 `realhost_readings.json` 只有一句 `environment-unavailable` 且**没有任何门在读它**。**实勘推翻计划原文一处**：原文只写「拆四态」，实勘 17 个 bail 点里 6 个不是环境问题（部署未同步 / 插件未装载 / init 未完成 / 块执行失败 / 落盘失败 / 仓库读不到），故分 `env` 与 `non-env` 两组 —— 把产品缺陷记成「环境不可用」正是本仓反复治过的「用一句话盖住两件事」。读数：五段全绿（365 模块 / S4 `evaluated=365` `mounted=449` / `dormantExcluded=11`），真机 `cause=deploy-unsynced`，`equivRealhost: false` 写进读数。顺带修 `_consumption_lib.mjs` 的两处假阳性（`report.global.state =` 的 `global` 是属性名 ⇒ `public-interface.js` 虚报 6435；`typeof global._x ===` 是比较被当赋值）。判据 `v21_o3` **22 条**。
> **上上版 v3.461.0**：**第十八期【灵魂深潜·主观认知失真与物联拟真双计划】已交付，本轮为交付后收口轮**。★ R18 接线真源修复：36 个 R18 内核此前是 ESM 形态，在宿主 extra_js 与审计沙箱里**整文件语法错误、从未挂载成功**，转回 UMD 尾巴后 13 个取库口 + 14 处消费方改名到真实挂载名，水合表 16 处同源回填，`_moduleStatus.v18Engines` 改三态派生（`ok` / `partial` / `unavailable`）+ `_v18EnginesRead`，`optional-engine-registry.js` 尾部 6 组重复登记去重（98 → 92）。门禁：`catalog_reference_consumers.tsv` 恢复 502 行、`extra_js_seam_ledger.tsv` 重生成（365 模块：host-seam 307 / module-internal 52 / orphan 6）、`state-report.json` 重生成、宿主巨兽基线走脚本重绑（13034 行 / 1342 成员，上界 13112 与 1366 **均不抬**）。判据 `v3461_r18_wiring_truth`（10 条）。边界：真机 ST 未执行。
> **上一版 v3.445.0**：**当前执行状态（2026-11-02，v3.445.0）**：**L13-X5 记忆迁移包接线已交付 —— 本期 18 项（L13-O1~O9 / L13-X1~X9）至此全部落地**。起点是一条读码事实：内核 `memory-migrate-pack.js` 自 v3.345.0 起登记在册、真加载、单测绿，但**产品端零调用**（用户导不出也导不进），属「功能级失效」教科书形态。本版补宿主取库口 `_migratePackLib()` + 三桩（export/precheck/apply，模块缺席与器官缺席各自显式报因）、面板双按钮双 handler（打包落 localStorage + 下载 json；导入先预检→逐冲突 1/2/3 三档决策→apply→回写存档，全同则跳过）。★ 同版修掉一处接线真缺陷：`exportMigratePack` 成功路径返回内核**裸包**而面板按 `{ok,pack}` 取数 ⇒ 成功被误判为失败；已改为宿主侧包装 `{ok:true,pack,skipped}` 并对 `headSha` 缺失 fail-closed。判据 `tests/v3445_l13_x5_migrate_pack.test.mjs`（34 条，含 5 条真源码破坏负控制）；台账同版重生成（消费台账 migrate-pack `prod_call_sites=1 / why=active`、seam 台账 `host-seam`、state-report ver 3.445.0 / test_files 447 / extra_js 249）。**边界**：真机 ST 未执行（面板触摸·窄屏·刷新后重载）；全量 `npm test` 与 `--audit` 按纪律未跑，`doc_readings` 全量实跑读数仍停 3.431.0 并已在 state-report `unknown` 显式点名。
> **上一版 v3.444.0**：**L13-X9 跨代传承面已交付** —— 起点是一条读码事实：内核 `era-continuation-inheritance-tree.js` 在 `manifest.extra_js` 里**真加载、单测全绿、却产品端零调用**（`prod_call_sites=0`），四态常量写好了但从没人读得到。本版把它接成可读可声明的面，补三件：① **每态可读成因** `FATE_CAUSES` —— 同是 `lost`，「被明确宣告遗失」与「传接跑完了它却没被处置」是两件不同的事，读数必须分得开；② **对接既有槽** `buildInheritanceRoster(transitions)` 直接吃 `worldProg.eraTransitions` **原样**（不新开存储、不建第二套事实库；输入数组一个字节都不改、连读两次读数稳定），输出逐条四态 + 成因 + 秘密边界；③ **第五档 `pending`（还没传）** —— 本面最容易做错的一格：`lost`（传接已完成，它没留下来）与 `pending`（传接**还没发生**）若同形，用户会看到「我家传玉佩遗失了」而事实只是「还没走到那一段」。⇒ 四态是**结果轴**，`pending` 是**未到结果**，两轴分列、永不同形（转场被撤销或本来就 pending 却带残留 `appliedItems` 的，一律落 pending 并显式记成因 `pending:stale-applied-record` —— 残留是缺陷信号，不许静默当没有）。**秘密边界四档**：`disclosed`（这一代知道了）/ `withheld`（在册但没给这一代）/ `undecided`（判不了）/ `absent`（秘密账里根本没有这条）—— 判定**一律调既有账自己的 `knowledgeOf`**（`opts.knowledgeOf` 注入），本模块不另写一套「该不该给他看」（秘密上已有三刀历史，另写必然漂移）；`undecided` 与 `absent` 处置相反（前者要人去看、后者不用遮蔽），压成一个布尔会让「秘密账漏记」永远看不见。**写入面**落在既有槽 `eraTransitions[i].declarations[artifactId]`（随 worldProg 一并存档）：`inheritanceDeclare` 是唯一写入口，`confirm !== true` 即拒（连状态都不读）、**`pending` 不可声明**（允许它等于把「遗失」改写成「还没传」）、覆盖旧值如实报 `replaced`；`inheritanceRevokeDeclare` 撤完回**推导值**而不是 pending，二次撤销报 `not-declared` 不假装撤掉了什么。★ **同版抓到并修掉一处产品侧真缺陷**：`index.js` 里 `_eraContinuationLib` 出现**同名两份**（原有那份指向 `era-continuation-drama.js`，本版新加那份指向传承树），JS 同名函数声明后者静默覆盖前者 ⇒ `['时代续演', _eraContinuationLib, 'eraContinuationDramaSelfCheck']` 自检拿到错误的库、静默失效。这正是本仓 v3.430.0 记录过的缺陷形态、我这版又重复了一遍；新加的改名 `_eraContinuationTreeLib`（宿主声明 + libs 注入键 + 诊断层接收口 + 两处调用点同步），判据 H2 把「两个名字各恰一份、老名仍指 drama、新名整段跨行函数体整段匹配」钉成回归位。★ 判据 `tests/v3444_l13_x9_inheritance_roster.test.mjs` **32 条全绿**（A 4 / B 3 / C 2 / D 1 / E 5 / F 8 / G 3 / H 6），含三条真源码破坏各配原版对照（去掉 `applied` 门控 / 把「跑完却没处置」改判 pending / 秘密账缺这条当 absent）。★ **首跑 24 绿 5 红，五红全部红在判据侧夹具**（`require0` 的 `const` 暂时性死区 / H1 误按 CJS 断言而内核是 UMD / H2 用逐行 `find` 看跨行函数体 / G3 破坏注入产生悬空 `else` / H4 与 H6 的 emoji 转义与字面量不匹配），产品侧缺陷是上面那条重名，不在这五红里。★ **另外真渲染 E2E 47/47 全绿**（`/tmp/e2e_x9_panel.cjs`：把真 `settings-ui.js` + 真 `engine-diagnostic-lines.js` + 真内核 + 真 `secret-ledger.js` 装进同一 jsdom realm，真调 `showBrowser('prequel')`、真点声明/撤销按钮）—— 之所以另做这一层，是因为上一版正是「`node --check` 绿 + 字符串自证绿，但产物非法」。E2E 首跑 19/46 的五处偏差**全部是夹具问题**（realm 缓存用了全局变量 / UMD 走了 require 分支 / 未按 `manifest.extra_js` 真实顺序先装 `ledger-entity.js` / `setTimeout(mount,300)` 未同步执行 / 断言口径写错 —— 拿 `textContent` 数「遗失于历史」这个词，而那是每一行都有的按钮文案），逐条修完 47/47。**接线条数**：该模块从 orphan 转 host-seam，`module_consumption_ledger` 的 `prod_call_sites` 0 → 1、`allowed` 0 → 1；`scan_extra_js_seam` 报出的另两笔账（`round-entry-snapshot.js` 未登记、`memory-archaeology-gap-bench.js` 与 `character-habit-growth-evidence.js` 两个 orphan 缺理由）经重新生成台账后一并收口（前者本就是 host-seam，后两者随宿主接线转 host-seam）。视图总数仍 27（挂在既有 `prequel` 内 —— 它回答「上一代留下的东西现在怎样了」，与前情资料同页才看得出上下文）。**边界保留**：**真实 SillyTavern 会话里没跑过真机**（无真机环境），`prequel` 面板的触摸 / 窄屏 / 刷新后加载**未执行**；全量回归 `npm test` / `npm test -- --audit` **按纪律不跑**（用户指令「做完计划全部内容前别跑全量」仍有效），读数登记仍停 v3.431.0、此处显式标「全量待验」，不得当作已验。**L13 进度**：X1（沿革回放）/ X2（反事实推演）/ X3（视角投影）/ X7（习惯与成长证据）/ X4（证据缺口工作台）/ X6（静音清单）/ X8（本轮可撤销快照）/ **X9（跨代传承面）** 已交付；**仅余 X5**（X 面交付序：只读面先做，X5 最后）。
> **上一版 v3.443.0**：**L13-X8 本轮生成的可撤销快照已交付** —— 起点是一条读码事实：本仓能「撤」的只有 `row.revoke`（撤**证据裁决**）与 `snapshot-checkpoint`（**整份载荷**级检查点），**中间那一层是空的**（一轮生成往图谱加 3 节点 / 往锁定事实加 1 条，发现抽错只能各面对着手删、或整份回滚把同轮正确写入一起吞掉）⇒ 「这轮加错了」与「整份都废了」被压成同一种处置（Problem 8）。新内核 `round-entry-snapshot.js`（360 行，零依赖）五条边界：**不复制正文**（只记 `id` + 指纹 `{len, head24, tail24, h}` —— 复制正文等于绕开各账 owner 另建真源）/ **不新建存储**（挂 `engine._roundSnapshots`）/ **不回退修改**（只标 `pendingReview` —— 回退会吞掉别的动作）/ **不猜 id**（白名单键，取不到计入 `skippedNoId`）/ **无跨账强制清空**。三态纪律：`absent≠empty`（`ok:false+reason` vs `ok:true+counts 0`）、`modified≠added` 且**只有 added 可撤**、`unknown-fingerprint` 单列（拿不到判据既不算改过也不算没改）。`recordSnapshot` 在 `summary.ok!==true` 时**拒绝记假快照**（记了等于宣布「本轮新增 0 条」）。`roundUndoState` **四态**：`no-round` / `half-round`（`missing` 点名缺哪半）/ `ok` / `undone`（带 `undoneAt`，不重放）。`undoRound` 的 `confirm!==true` 是**硬门槛**（连删除口都不调），**只删 added**：`removed` 不可撤（`content-not-kept`）、`modified` 恒 `undoable:false`、无删除口的账 `skipped` 单列、删不掉 `partial`、无新增 `nothing-to-undo`（`writes:false`，与撤成功不同形）。宿主五桩两清单：账本纳入 `lockedFacts`/`graphNodes`/`graphEdges`/`summaries`/`deltas`，删除口**只给三本**（`summaries` 删了会牵动卷/折叠账、`deltas` 是 append-only —— 如实不给），删节点后 `rebuildNameIndex()`（否则「删了节点还能按名字查到」），**宿主不 splice 别人的数组**。面板 `oplog` 视图加「↩️ 撤销本轮写入」块 + `window.confirm` 二次确认（**两层**：面板问 + 内核卡）+ 撤销后审计链记一条 `rollback/undo-round`。★ 判据 `tests/v3443_l13_x8_round_snapshot.test.mjs` **25 条全绿**（A 3 / B 3 / C 3 / D 4 / E 4 / F 3 / G 5），含三条真源码破坏各配原版对照（`modified` 塞进 `added` / 指纹退化成整段正文 / 删掉 `missing` 分支）。★ **首跑 11 红逐条归因：3 产品侧真缺陷 + 1 形状不一致 + 6 判据侧夹具 + 1 抬版前预期内** —— ① `lastRoundPair` 第二个 `if` 带 `after &&` 前置 ⇒「记了 before、after 没记」被判成 `no-round`（应为 `half-round`，两者意义相反），修成两段扫且 `before` 只在 `after` **之前**找（否则与下一轮 `before` 错配）；② `undoRound` 写 `undone:true` 但 `roundUndoState` **从不读它** ⇒ 撤完再点一次拿已不存在的 id 去删、报三个 failed（「写了不读」族），补第四态 `undone`；③ `nothing-to-undo` 分支缺 `counts`（同一函数返回不同键）；④ 加载器用 `vm.runInNewContext` 是**另一个 realm**，`assert.deepEqual` 含原型严格深比 ⇒ `['f1','f2'] ≠ ['f1','f2']`，六条集体假红（红在夹具上等于判据没被测到），改 `new Function` 同 realm；⑤ F1 破坏写成 `st.added.concat(st.modified).length` 当上界 ⇒ 循环体取到 `undefined` 抛异常被 `safe()` 吞成 `failed` ⇒ 改过的条目其实没被删（**破坏没真的改行为**＝假绿），换成在 diff 层把 `modified` 塞进 `added`；⑥ G4 的次序判据原用 `indexOf('RS.undoRound')` 先命中 `typeof RS.undoRound !== 'function'` 那句**取库**检查（本来就该早于 confirm），改盯调用点；⑦ G5 抬版前预期内。**接线条数**：`extra_js` 247 → **248**（零未登记孤儿，228 活跃 / 20 已登记留存），视图总数仍 27（挂在既有 `oplog` 内 —— 它回答「这一轮」而非「所有轮」，与审计链同页才看得见上下文）。**边界保留**：计划验收「真跑一轮生成新增 3 条 → 撤销」用**夹具真跑**证到行为（真记账/真删/真回读），**真实 SillyTavern 会话里没跑过真生成**，登记为「夹具真跑 + 真机未跑」；★ 本版**没有**把 `roundSnapshotBefore/After` 挂进主生成链路（改生成主路径的风险与收益不成比例，先交付「可对拍 + 可只撤新增」这层能力），故「装了就有快照」不成立，须由调用方在生成前后各调一次；`summaries`/`deltas` 纳入摘要但**不给删除口**（撤销它们报 `skipped: no-remover` 并在面板逐条点名）；真机 ST 触摸/窄屏/刷新后加载**未执行**；全量回归**未跑**（读数登记仍停 v3.431.0、显式待验）。**L13 进度**：X1（沿革回放）/ X2（反事实推演）/ X3（视角投影）/ X7（习惯与成长证据）/ X4（证据缺口工作台）/ X6（静音清单）/ **X8（本轮可撤销快照）** 已交付；X9 / X5 待做（X 面交付序：只读面先做 —— X7、X4、X6 已落，X8 已落，其后 X9，最后 X5）。**上一版 v3.442.0**：L13-X6 静音清单面（先补「有地方存」再画面；两源分列永不合并；无「全部解除」）。**再前一版 v3.441.0**：L13-X4 证据缺口工作台（三档成因穷尽且互不同形，`null` 判不了绝不为凑一档写成「证据丢了」）。**再前一版 v3.440.0**：L13-X7 习惯与成长证据面（两块账分开存分报不互相充抵）。**再前一版 v3.439.0**：L13-X3 视角投影面（`blind` 与 `undecided` 永不同形）。**再前一版 v3.438.0**：L13-O6 注入面可复算。**再前一版 v3.437.0**：L13-O5 世界线口径对玩家的可读化。**再前一版 v3.436.0**：L13-O4 面板视图入口可达性。**再前一版 v3.435.0**：L13-O3 只读视图机器可读四态 + L13-O8 记忆软删闭环。**真宿主门**：v3.433.0 曾在真实 SillyTavern 1.19.0 隔离现场跑通过一次（29 条真实读数 / 0 缺陷 / exit 0）；此后盘面已多次变更，该读数按「历史跑通、当版待复跑」对待。
> **规划基线**：`v3.431.0 / 150d055`。旧 V8 提案基线 `v3.371.0 / c17c33b`、V9 提案基线 `v3.373.0 / ac5c21a` 已被本期取代，仅保留历史参考；V7 及更早历史不作为当前待办。实施前仍须针对届时代码复算接口与覆盖。
> **产品主轴**：把事实生命周期、证据裁决、时间、召回、生成回执、维护和迁移连成可回源、可撤销、可接续的用户闭环；拓展受证据约束的记忆体验。守卫、审计、台账、发布和纯重构只随功能收口，不独立占36项名额。
| 第六期编号（历史已承接） | 优化提升 | 第六期编号（历史已承接） | 拓展创新 |
|---|---|---|---|
| M6-O1 | 连续经历重建：把散落往事召回成一件完整的事 | M6-X1 | 信念演化：人物可以有理由地误解，也能有过程地改观 |
| M6-O2 | 记忆问题求解器：从找相关段落到跨证据回答复杂问题 | M6-X2 | 经验与习惯学习：记住怎么做、何时例外，而不只记住做过 |
| M6-O3 | 可展开的多分辨率记忆：压缩不再只剩结论 | M6-X3 | 条件后果推演：选择改变未来的哪些可能性 |
| M6-O4 | 人物自传式记忆：让角色带着自身经历进入下一幕 | M6-X4 | 多步反事实实验：比较两条人生路线，而非只试写两段话 |
| M6-O5 | 双时间经历：分清何时发生、何时被得知 | M6-X5 | 群体与制度记忆：组织不会随一次群聊结束而失忆 |
| M6-O6 | 场景上下文编排：让记忆服务当前互动，而非塞一包资料 | M6-X6 | 意象与意义变迁：同一地点、物件或话语能有不同分量 |
| M6-O7 | 关系动力记忆：从转折列表到理解关系为何保持或改变 | M6-X7 | 缺席与期待记忆：记住该发生却尚未发生的事 |
| M6-O8 | 持续研究记忆：资料改变时，结论能继续生长 | M6-X8 | 回忆再理解：同一往事被重新讲述时，人物会获得新认识 |
| M6-O9 | 长期意图推进：让目标会遇阻、改道与付出代价 | M6-X9 | 跨时代传承：世界进入新阶段，留下来的不只是摘要 |

> **第五期历史入口**：[优化](.agents/notes/proposed/architecture/2026-10-20-product-optimization-v5.md) · [拓展](.agents/notes/proposed/feature/2026-10-20-product-expansion-v5.md)。记忆侧v3.350～3.353已有18项实现覆盖；旧“全部待实施”已不成立，但实现覆盖不等于所有真实宿主及模型内容验收通过。逐项映射与边界见第六期证据页。
> **第四期历史入口**：[优化](.agents/notes/proposed/architecture/2026-10-15-product-optimization-v4.md) · [拓展](.agents/notes/proposed/feature/2026-10-15-product-expansion-v4.md)。第四期收口记录为3.348.0，随后3.349.0另含conditionPatch；旧导航“下一刀M4-X9/未勾选X9”已过时，详细实施与历史全量读数留在CHANGELOG、旧计划及下方历史记录。这仅确认实现记录，不保证每条真实旅程通过；第五期发现的具体缺口不抹掉已实现底座。

> **历史边界**：以下第三期与更早的基线、起手顺序和完成声明均为当时留痕，不作本轮待办；第六期证据页的六个产品批次接管排序。

> 第三期实现映射：v3.320＝O2/O3/O9；v3.321～322＝O1/O4/O6/X1；v3.323＝X2/X3/X4；v3.324＝O5/O7/X9；v3.325＝O8；v3.327＝X5/X7；v3.328＝X6/X8。这里仅确认代码承接，不声称全部用户流程已验收。

> **第三期产品主线（2026-10-12，历史计划，排序由第四期接管）**：优化9项＋拓展9项；与另一仓合计36项。
> [优化提升](.agents/notes/proposed/architecture/2026-10-12-product-optimization-v3.md) · [拓展新功能](.agents/notes/proposed/feature/2026-10-12-product-expansion-v3.md) · [代码证据与执行包](docs/planning/2026-10-12-product-evidence.md)。
> 最新用户指令：重心回到手机体验和记忆质量。守卫、台账、发布只作必要配套，不占产品名额；旧计划勾选不是当前事实。此次仅交付并推送计划，不代表36项已实现。


> **第三期及更早实施留痕（2026-10-15，v3.328.0）**：【历史口径，不作本轮待办】以下保留当时实施进度与验证边界；下方所有旧节均为**历史留痕**（含已交付的 A1/A2/A3/T1/T2/X1 与两份 2026-10-04 计划快照），不得当作待办读。
> · **优化计划 O1–O8**：O1（会话身份）/ O3（预算裁剪契约）/ O4（回执消费）/ O5（规模与归档）/ O6（留出与多轮）/ O7（外移依赖与历史测试减负，已交付**六刀**台账：v3.280 宿主↔模块、v3.281 模块↔模块、v3.282 别名、v3.283 常量表值级、v3.284 审计面副本、v3.285 文档读数真实性）**六项已交付各自定向门**；**O2（真实用户操作，**已收口** —— v3.287.0 交互逻辑切片（`scan_ui_interaction.mjs` + `v3287_ui_interaction.test.mjs`）+ v3.300.0~v3.303.0 三刀，+ **v3.318.0 真浏览器切片**：真 Chromium（CDP 直连，零依赖）+ 真 SillyTavern 1.19.0 实测 `boot/装载/真鼠标/真键盘/真 localStorage/Emulation 窄屏/重开保留` 33 条读数（探针 `_mo2_realbrowser_probe.mjs`，`_` 前缀不进 npm test）；★ 该切片当场抓到**产品面真缺陷**：320px 下 `.ls-hint` 的长不可断 ASCII 串无断行且 `.ls-row` 标签容器 `min-width:auto` ⇒ 行被撑到 474px、把 44px 的 checkbox 顶出视口（left=449 > 320），修后在册判据 `scan_ui_narrow_layout.mjs` + `v3318_ui_narrow_layout_gate.test.mjs` 把该形态钉住）**；**O8 为当前主线**（v3.285.0 第一刀：文档读数真实性 —— D1~D9；「当前在役面 / 最近一次全量实跑快照」分列 + 未实跑必须标「全量待验」（反向也判）+ 读数零手抄重绑 + **D9 档自述读数**（CHANGELOG 当前版本节的「档名（N 条）」与两句契约声明核回磁盘/实现）+ 七处真源码破坏负控制）；**第二期 M-O8 已开工**（v3.306.0 第一刀：秘密的「知识范围」注入侧隔离 —— 一份真源 / 三态不同形 / 提取通道接回 / fail-closed；诊断行「秘密隔离」进自检面）；**v3.307.0 第二刀**：秘密正文的三条外供路径收口 —— 证据工作台的投影行 / 结构化查询面 / 宿主导出报告**三面一律不外带正文**，行上增 `scope`（知识范围三态，非秘密账恒 null）与 `masked` 两列（`EVIDENCE_VERSION` 2 → 3 / `QUERY_VERSION` 1 → 2），诊断面报「存在但不可用 · 边界可判 X · 判不了 Y · 判据缺 Z」；**v3.308.0 第三刀**：跨支 / 跨卷的秘密边界改认**知情名单**（`branch-semantics` 与 `volume-continuation` 的 `filterByKeeper` 此前把 `keeper` 当「有权查看的人」，而它在 `secret-ledger` 里是「**不该知道的人**」—— 同名异义、方向整个反了：守密人被放行、在册知情者被挡住；本刀按**名单种类**分派，返回面增 `knowerOnly` / `knowerUndecided` / `knowersMatched` 三档、两模块版本 2 → 3），并把秘密**正文**从「对照读数 / 提案 / 接续包 / 冲突条」四条外供路径上一律剥除（入口剥 + 出口二道闸，剥了几份进 `shadowed` 读数）。
> · **v3.309.0 第四刀**：世界推进账本写入纳入**分支守卫**。★ 修前实测（探针 `tests/audit/_mo8_branch_probe.mjs`，rc=0）：承诺块 / 认知块 / 秘密块**早于**分支守护 295~422 行，`_branchOk` 的四个使用点里世界推进的 **21 个写入口被覆盖 0 处** ⇒ 翻页 / 重生成后被放弃那一分支的承诺 / 支线 / 认知 / 秘密照旧入账，而账本是会话级、无分支归属 —— 这是 M-O8 验收②「A 分支秘密不出现在 B」的字面反例。本刀：判定**前移**到世界推进块之前（只算一次，存 `this._branchVerdict`；§2 改为读它，不再重算 —— 两次判定会得出两个答案）、世界推进块头加闸（`judged === false` 一律放行，与 branch-guard 自己的「漏一点好过全消失」同纪律）、账本面拦截读数 `_wpBranchSkip` 单列进诊断行（与摘要面 `apply-skip` 分开记，不并成一处）。成对套件 `tests/v3309_wp_branch_gate.test.mjs`（16 条，含 5 条真源码破坏负控制 + 正控制地基）。
  **收尾·全量实跑抓出的 5 处红**（1 本刀回归 + 4 既有真缺陷，逐处在基线 `77d5eaa` 上重跑同档对照定归属，全部已修）：① 本刀回归 `v3264 C`（`< 16000` 硬锁当版魔数被 +55 行顶穿 ⇒ 交棒 `line_budget` 登记面）；② 既有 `v3254 D9/D12` + `v3255 C1`（破坏锚裸串因 v3.305.0 第二处同形字面量失去唯一性 ⇒ 负控制空转 ⇒ 改用唯一上下文锚）；③ 既有 `v3203` 8/18（夹具写死 `vnum(CUR)`，漏「任意自锚常量名」锚形 ⇒ needle 改按真源口径现场派生）；④ 非缺陷：`v3159` 全量 TIMEOUT / 单跑 rc=0（并发争抢）。
> · **拓展计划 X1–X8**：**X1 已交付**（v3.270.0，`projection-pipeline.js` 的 `predictInjection()` + `sourceLedger.prediction` 出口，判据 `tests/v3270_b2_injection_preview.test.mjs`）；**X3 已交付**（v3.289.0）、**X4 已交付**（v3.290.0）、**X5 已交付**（v3.291.0）、**X6 已交付**（v3.292.0）、**X7 已交付**（v3.293.0）、**X8 已交付**（v3.294.0）、**X2 已交付**（v3.295.0）、**X1 已交付**（v3.296.0，结构化证据查询与完整度 —— ★ 与 v3.270.0 那条旧 X1（注入容量预演）**同名不同物**，这一条才是拓展计划原文里的 X1）（X2 依赖 O1/O2/O4 —— **O2 仅交付交互逻辑切片、真浏览器面未执行 ⇒ 依赖部分满足**；X3 依赖 O3/O4；X4 依赖两仓保存与边界优化；X5 依赖 X1/X4；X6 依赖 O1/X1/X2；X7 依赖 X1/X5/X6；X8 依赖 O4/O6/X1/X3）。批次口径（拓展计划原文）：第一批 X1/X2/X3、第二批 X4/X5、第三批 X6/X7/X8。
> · **门禁纪律**：真实用户指令「做完计划全部内容前别跑全量」已在第二阶段解除 —— v3.459.0 阶段已实际跑过多轮全量（第三轮读数：494 文件 · 通过断言 4964 · 失败断言 86 · 435/494 文件通过），正在逐条收敛失败族；全量产物读数的重绑一律走脚本、零手抄。当前 v3.465.2 **全量待验** —— 读数登记停在 v3.431.0，按本纪律须待 L13 计划全部内容做完后一次性收口实跑，此处显式标注，不得当作已验。**第二期计划（优化 M-O1~M-O9 / 拓展 M-X1~M-X9）已全部交付并收口** —— 故已于 v3.318.0 跑过那一次全量（299/299 文件 · 3302 断言 · 0 失败 · 审计 61/61，登记见 `doc_readings.json`）；上一次收口点是 v3.296.0（X 系列八条全部交付时的实跑读数）。此后回到「盘面一动即标待验」的口径（回到待验是规则，不是退步），由 `scan_doc_truthfulness.mjs` 把守。
> · **测试成本读数**：「测试成本热点读数」也走登记 + 重绑（`tests/audit/test_cost_readings.json`，由 `tools/_rebind_test_cost.py` 消费 `TEST_SUMMARY_JSON` 写入），由 `scan_cost_truthfulness.mjs` 把守 —— 覆盖范围（全量实跑 / 定向采样）必须自述，定向采样不得冒充全量。
> · **当前优先级**：见下方「当前优先级」节；只运行该节三级排序，旧排序节（如「## 优先级」）已陈旧，判据 `scan_plan_currency.mjs`。
> · **第二期计划入口（2026-10-08 核实，v3.296.0 / d0c4a78）**：【历史提案，后续排序已由第三期接管，基线 v3.296.0 —— 拓展计划八条与优化计划 O1–O8 均已交付（O2 仅交互逻辑切片），故第二期只保留仍成立的真实缺口。实施前请重算基线。】
> [优化提升计划（第二期）](.agents/notes/proposed/architecture/2026-10-08-optimization-plan-v2.md) ·
> [拓展计划（第二期）](.agents/notes/proposed/feature/2026-10-08-expansion-plan-v2.md)。
> 两份均为 `proposed`；各自开篇的「过时内容裁定」表已逐条把第一期条目转为「已完成 / 已并入 / 不再追求」。
> · **上一份现行计划入口（2026-10-04 核实，v3.271.0 / 1a0ba36）**：【核实日快照，非永久事实 —— 这些链接指向的 `proposed` 计划以 v3.271.0 为基线；本仓已推进到 v3.284.0，实施前请重算基线。】
> [优化提升计划](.agents/notes/proposed/architecture/2026-10-04-optimization-plan.md) ·
> [拓展计划](.agents/notes/proposed/feature/2026-10-04-expansion-plan.md) ·
> [本轮证据](docs/planning/2026-10-04-evidence.md)。
> 两份均为 `proposed`，本轮仅制定计划。下文保留历史规划与交付台账，其中 <15000 行、反向桥登记、固定集缺口清零和容量预演均已交付，不再是本轮待办；逐项裁定见新计划。当前能力仍以代码为准，实施前重算基线。

> 以下为历史规划与交付记录，原分「优化提升」与「拓宽·拓展·拓深」两部分；当前提案以上方链接为准。> 截至 v3.284.0 的推进状态：O7 已交付五刀（v3.280.0 宿主↔模块副本、v3.281.0 模块↔模块副本、v3.282.0 别名副本、v3.283.0 常量表值级副本、v3.284.0 审计面副本 —— 共五档台账）；O1/O2/O3（存储身份、核心操作、预算契约）此前版本已交付各自定向门；O8 于 v3.284.0 起订正（README/PLAN 的版本与在役读数与磁盘真读数对齐）。
> 区别于 `TODO.md`（滚动待办）与 `FOUR_RELEASE_PLAN.md`（历史追加台账）——本文件回答的是「下一步往哪走」。
> 每条均标注**现状读数**（来自磁盘实读）与**验收口径**。规划以本仓已清理基线为起点。

## 现状基线（规划起点）

| 量 | 读数 | 出处 |
|---|---|---|
| 版本 | **v3.465.2**（index.js VERSION 真源） | index.js |
| 门禁 | 在役面 **509 测试文件 / 70 个 audit 脚本**（`tests/audit` 磁盘 83 `.mjs` + 3 `.cjs`，其中 13 个 `_` 前缀探针不参与执行）—— 磁盘枚举读数 | `tests/` 与 `tests/audit/` 实读 |
| 全量快照 | 最近全量快照 **v3.431.0：430 测试文件 / 4658 断言 0 失败 / 审计 68/68**（全量 `TEST_SUMMARY_JSON=<path> node tests/run.mjs --audit --jobs 3 --audit-jobs 2`；读数由 `tools/_rebind_doc_readings.py` 消费摘要零手抄重绑）；上一快照 v3.429.0：427 / 4609 / 68/68；上一快照 v3.427.0：423 / 4545 / 67/67（当版 **已实跑并登记**；上一快照 v3.426.0：420 / 4532 / 61/61；再上 v3.425.0：420 / 4528 / 61/61）（当版 **已实跑并登记**（全量 `TEST_SUMMARY_JSON=<path> node tests/run.mjs --audit --jobs 3 --audit-jobs 2`）；上一快照 v3.425.0:420 / 4528 / 61/61；再上快照 v3.424.1:420 / 4512 / 61/61；再上一快照 v3.424.0:420 / 4504 / 61/61;上一快照 v3.423.0:419 / 4474 / 61/61;再上一份 v3.355.0:334 / 4066 / 61/61;再上一份 v3.328.0:309 / 3528 / 61/61;再上一份 v3.318.0:299 / 3302 / 61/61;**第二期计划收口点**:优化 M-O1~M-O9 / 拓展 M-X1~M-X9 全部交付;更早 v3.296.0:277 / 2986 / 59/59) | `tests/audit/doc_readings.json` |
> 上一版 v3.430.0 **已实跑并登记**（全量 `TEST_SUMMARY_JSON=<path> node tests/run.mjs --audit --jobs 3 --audit-jobs 2` ⇒ **429/429 文件 · 4646 断言 · 0 失败 · 审计 68/68**；读数由 `tools/_rebind_doc_readings.py` / `tools/_rebind_test_cost.py` 消费结构化摘要零手抄重绑，`tools/gen_test_budget.mjs` 同步刷新预算）。本版 **L12-X1~X9 九项拓展接线**：九件拓展各接「读 / 动作 / 诊断行」三件套（业务落 `engine-diagnostic-lines.js`，宿主只留转发桩，面板承担九面），判据 `tests/v3430_l12_x1_x9_extensions.test.mjs` 19 条 + `tests/v3430_l12_x6_unload_drill.test.mjs` 18 条，三条破坏锚点在真源各恰中 1 次且各配原版对照；抬版锚归收口档（X6 改用数值下界）。**上一版 v3.429.0** 世界线跳跃表结构化编辑器 + 实时读数：解析单源 `parseJumpsText`（坏行带 1 基行号与可读成因）+ 结构化行编辑区 + 三态读数行（`none` / `gap` / `ok`，另加 `unwired` / `bad` / `conflict`），预览 `worldlineJumpDraft` 不写配置；判据 `scan_ui_worldline_editor.mjs`（X1~X7）+ 成对套件 17 条（含六条真源码破坏各配原版对照）。★ 全量首跑 **17 文件红**，逐条归因为**读数欠账而非产品缺陷**：host_beast 基线（入口 11773→11776 / 成员 1188→1190）带着 6 份 A1 套件连锁红、`dead_code_budget` 上界越线 9 行（活跃功能增长 ⇒ 按纪律 `--bump` 到 109378）、`audit_scan_probe_matrix.tsv` 漏登新门（灵敏度矩阵 H/G/T = 0/2/0 实测后补登）、`test_budget.json` 落后 3 个次版本、PLAN 执行状态与快照行陈旧。全部由**脚本重绑**收口，零手抄。；上一版 v3.428.0 **全量待验**（O1 五件零消费内核接管产品面：本版专项判据与定点回归已跑，全量读数随 3.429.0 收口一次性登记）；再上一版 v3.426.0 **已实跑并登记**（全量 `TEST_SUMMARY_JSON=<path> node tests/run.mjs --audit --jobs 3 --audit-jobs 2` ⇒ 420/420 文件 · 4532 断言 · 0 失败 · 审计 61/61；读数由 `tools/_rebind_doc_readings.py` 消费结构化摘要零手抄重绑，本版共修两处**运行时真缺陷**（仿真端到端跑出来的：宿主不推进当前纪元 / 证据不对称被判成同一纪元），判据 54 → 58、锚点 4 → 7）。上一版 上一版 v3.424.1 **已实跑并登记**（全量 `node tests/run.mjs --audit --jobs 3 --audit-jobs 2` ⇒ 420/420 文件 · 4512 断言 · 0 失败 · 审计 61/61；读数由 `tools/_rebind_doc_readings.py` 消费结构化摘要零手抄重绑，本版共修 v3.424.0 的两处世界线真缺陷（`clamp01` 压平 `>1` 段 + 吸引域分段无配置入口），判据 30 → 38、自证 9 → 12）。上一版 v3.424.0 **已实跑并登记**（全量 `node tests/run.mjs --audit --jobs 3 --audit-jobs 2` ⇒ 420/420 文件 · 4504 断言 · 0 失败 · 审计 61/61；本版 M7-X1 世界线记忆与跨线污染闸：新内核 `worldline-memory.js`（四态穷尽互斥 / 两线关系 / 收束三态 / 污染闸四档 / 换线五桶）+ 宿主七个出口转发 + 召回侧跨线闸 + 配置六键；默认关、判不了单列、无标 ≠ 本线））；上一版 v3.423.0 **已实跑并登记**（全量 `node tests/run.mjs --audit --jobs 3 --audit-jobs 2` ⇒ 419/419 文件 · 4474 断言 · 0 失败 · 审计 61/61；本版玩家面板重构：FAB 直达玩家主页、API 前置「常用」页顶、18 组标题去黑话、四 tab 改名、token 作用域化、pill 接实配；README 收敛为玩家门面、玩家无益的文档读数门禁（D1~D9）退场；能力零删除，宿主入口零变化）；上一版 v3.421.0 **全量待验**（实施期按铁律只跑定向判据与定点回归，绝不跑全量；本版完成 index.js 剥离第十批：证据中心/追踪索引/时间轴/悬念链外提至 engine-evidence-center.js，index.js 降至 12122 行；manifest extra_js 243 项）；上一版 v3.355.0 **已实跑并登记**（全量 `node tests/run.mjs --audit --jobs 3 --audit-jobs 2` ⇒ 334/334 文件 · 4066 断言 · 0 失败 · 审计 61/61；读数由 tools/_rebind_doc_readings.py 消费结构化摘要零手抄重绑，见上表）。
| 体量 | `index.js` **13069 行**(探针读数;`wc -l` 13069) / **1342** 成员 —— 宿主巨兽探针实读对账;+ extra_js **365** 项 | `wc -l` / `manifest.json` / `tests/audit/host_beast_probe.cjs` |
| 跨仓外供 | 正向 **7 面**（`open_face_registry.tsv`；v3.314.0 M-X6 新增 `phoneFactReceipt`（consumer `none@0`，手机侧回执面，下游接入属下一轮）；v3.305.0 M-X9 新增 `memoryToolsEnvelope`（consumer `none@0`，下游接入属下一轮））+ 反向 **1 面**（`open_face_registry_inbound.tsv`，下游产出 / 本仓消费） | v3.253.0 建表 / v3.258.0 建反向表 |

---

## 当前优先级（第六期 · 陈旧节：本期排序以文首「## 优先级」节为准）
> **【陈旧标记 · 勿当现行排序读】** 本节属第六期产品批次（已交付留档），**现行排序见文首「## 优先级」节（第二十一期 R21）**。第六期产品批次已由后续各期接管，此处仅作排序史保留。
> 原注：第六期产品批次接管。第五期已有实现覆盖；本轮只提交规划，不把历史全量或模块探针当新功能验收。
1. **先交付经历与再连接，再深化理解与创作** —— 按第六期证据页A/B批完成完整用户旅程，不先造第二套治理系统。
2. **再交付人物与行动、世界与日常** —— 按C/D批持续强化长线人物、活动、研究、社媒与共营。
3. **最后交付意义与演出、长线与平行路线** —— 按E/F批完成回忆、声音叙事、推理、时代传承与分支试玩；测试和迁移随功能收口。

---

## 一、优化提升

### A1 · 宿主巨兽 `index.js` 继续瘦身【最大杠杆】
- **现状（已推进六刀 · 目标已达成）**：**13883 行**（18401 → 18124 → 17776 → 17444 → 16798 → 15739 → 13883）。
  **已跨过 < 15000 行验收线**。P-2 已分诊并按读数**否掉「按域拆」**，只留「成员级预算 + 文件规模上界」这条轴；
  六刀后实测 TOP5 集中度 **30.1%** / TOP40 **67.1%** / 前缀规则覆盖 **33.8%** / 成员 **521**（TO5/TO40 按**成员**计，不是按域）。
- **路径**：不拆域，每版剥 1~2 个聚簇为 extra_js 模块 —— 已落五刀：第一刀 **v3.257.0** 六个叶子账本类（`memory-ledgers.js`）、
  第二刀 **v3.258.0** 六个工具类（`memory-aux.js`）、同轮第三刀 **v3.258.0** 三个生成侧派生系统（`narrative-generators.js`）、
  第四刀 **v3.259.0** 七个书册/时间类（`memory-books.js`）、第五刀 **v3.264.0** 六个器官类（`memory-organs.js`）、
  第六刀 **v3.266.0** 四个内核数据模型类（`memory-core.js`）。
  **下一刀候选**（★ 下面这份是**四刀时代的旧清单**，其中多项已在 v3.259.0 第四刀剥进 `memory-books.js`；续刀须按磁盘重算。旧排序口径＝类级「判据面爆炸半径」即 类行数 ÷ 被测引用数）：`PrequelSystem`（爆炸半径最小，但依赖 `BM25`，须与它同刀或先提层）、
  再往后的类级候选 `SuspenseBook` / `CharacterMemoryBank` / `EntityLexicon` / `EchoPool` / `IncrementBookmark` / `RelativeTimeHelper`（零外部依赖）/ `PlotTimeline`；
  成员级候选见 `host_beast_baseline.json` 的 `split_candidates.low_coupling_examples`（`recallMemory` 688 / `exportMemoryReport` 349 等）。
- **目标**：index.js 降至 15000 行以下 —— **已达成**（第六刀后 **13883** 行，超出验收线 1117 行余量；六刀共剥 4518 行）。
- **已交付 v3.264.0（第五刀 · `memory-organs.js`）**：六个**器官级**类 —— `LLMCaller` 357 / `WorldProgress` 507 / `VectorStore` 220 /
  `StorageManager` 209 / `CharacterMemoryBank` 102 / `EntityLexicon` 78 行，共 -1352 行；`extra_js` 76 → 77。
  与前四刀（零依赖叶子类）最大的不同：这六类对**主人模块级符号**有真依赖，故采 **barrel 模式** —— 模块内置逐字副本 + 常量副本，
  宿主在引擎构造期经 `bindDeps(deps)` 注入真实现（八键）；`errLog` 是唯一非逐字副本。
  两条被否决的口径写在模块头注里：口径 B（宿主口代理成模块导出）会把宿主函数搬出宿主作用域 ⇒ 与两条读数轴的基线口径冲突（等于偷改尺子）；
  口径 C（改全部历史套件抽取面）单刀面太大且与主题无关。
  同时兑现了本条自列的「每刀必做项」：① 退路 `OrganFallback` 按**方法名**与真实现对账（74 项）；
  ② **扫描面口径跟着代码走** —— `scan_module_wiring` 消费面扩为 `entryCode + A1_CARRIERS` 五个刀口模块、`selfProvided` 认 `defineProperty` 形态，
  约 30 个历史套件按「换真源、语义一字不改」对齐；③ 数量锁与登记面同步（`extra_js` 计数 + `v3209` + `catalog_reference_consumers.tsv` + `v3247` 的 `REGISTRY`）。
  证据：`npm test` 245/245 · 2469 断言；`--audit` 245/245 + 53/53；`tests/v3264_a1_memory_organs.test.mjs` 6/6（含七条真源码破坏负控制）。
- **已交付 v3.266.0（第六刀 · `memory-core.js`）**：四个**内核数据模型类** —— `CharacterState` 755 / `SummarySystem` 641 / `MemoryGraph` 348 / `GameClock` 293 行，
  共 -1856 行（15739 → 13883，**目标达成**）；`extra_js` 77 → 78。与前五刀最大的不同：这四类是引擎的**数据中枢**（图谱 / 摘要 / 时钟 / 状态），
  宿主消费点最密（86 / 93 / 79 / 68 处），且被十余个历史套件以「抠整段进 `new Function`」形态重放 —— 故逐字副本（3 函数 + 3 常量 + 4 条取库链）必须在位，
  否则那些抽取面全部 `ReferenceError`。
  **本刀真抓到一处静默降级（留痕）**：模块侧 `VERSION` 首版照抄宿主写成 `const`，而 `bindDeps` 要给它赋值 ⇒ 当场 `TypeError: Assignment to constant variable`，
  宿主 `_bindCoreDeps` 外层的 `try/catch` 把它吞成「注入 0 项」——**整轮依赖注入在 version 这一键上静默中断**，且不报错。修法：模块侧改 `let VERSION`（附留痕注释），
  生成脚本同步 emit `let`；判据面两条钉住（A 段判 `let` 形态 / D 段把 `let`→`const` 做真源码破坏），B 段另在**全新实例**上真跑一次完整注入（`threw===null` + `n===7`）作为行为面根因探针。
  ② **扫描面口径跟着代码走（本刀面最宽）**：`scan_v3180_three_faces` / `scan_v3184_final_four` / `scan_world_clock_reader` / `scan_world_ledger_reader` /
  `scan_fixture_sync` / `scan_module_wiring` 六处判据面改为「入口 + `memory-core.js`」合看，且**四个负控制夹具同步补搬该模块**（否则门禁在 fixture 里走 fail-closed，
  而那个 exit 2 会被负控制读成「结构漂移判据工作正常」——空对空）；取库口类判据刻意仍只读**宿主自身**源码（模块内逐字副本会让「宿主取库口被换名」这类破坏不可观测）。
  ③ 数量锁与登记面同步（`extra_js` 78 + `v3209` 两处计数 + `catalog_reference_consumers.tsv` + `v3247` 的 `REGISTRY`）。
  证据：`npm test` **246/246 · 2475 断言 0 失败**；`--audit` **53/53**；`tests/v3266_a1_memory_core.test.mjs` 6/6（含十条真源码破坏负控制）；
  六处审计脚本 + 四套依赖守卫（`v3203` / `v3241` / `v3227` / `v3159`）52/52 全绿。
- **验收**：`tests/audit/host_beast_baseline.json` 的成员基线随每次剥离减项（561 → 553 → 549 → 536 → 530 → **521**）、瘦身进度转为可读数；门禁保持 0 失败。
  **目标达成（v3.266.0）**：`index.js` **13883 行 < 15000**，超出验收线 1117 行。后续若继续瘦身属可选加固（最大存量是 `MemoryEngine` 单类 10205 行 ——
  它是生命周期接线本身，外部引用极低，属「唯一入口」形态，P-2 已按读数否掉按域拆；成员级候选见基线 `split_candidates`）。
  **每刀必做项**（三刀各踩一次的教训）：① 退路对账（缺席退路的公开面必须按**方法名**与真实现对账，含 getter）；② **扫描面口径跟着代码走** —— 只读 `index.js` 的审计脚本/内联判据会因消费点外迁而假报死配置；
  ③ 数量锁与登记面同步（`extra_js` 计数、README 人读面、`catalog_reference_consumers.tsv`、`v3247` 的 `REGISTRY`）。

### A2 · 兑现已登记的「未做」
- **`p3_snapshot_bytes` 重跑**：环境障碍已除；探针早已可跑。文档头部曾滞后写 `not_measured`。
- **README 能力索引改写**：已于 v3.255.0（`8b9ea65`）按磁盘真读数重写。
- **验收**：两项在 TODO 勾掉并附读数/证据。
- **已交付 v3.256.0**：订正 `tests/audit/p3_snapshot_probe.md` 头部为 `measured`（读数 N=0:169B … N=200:21207B，superlinear=false）；TODO 同步去掉 `not_measured`。README 无需再改。

### A3 · 缓存正确性的回归加固
- **现状**：v3.255.0 刚修「`_cacheIdentityOf()` 把 revision 填成 `getRevision()` 致缓存被静默禁用」。这类「正确性被静默打掉」的退化最危险。
- **路径**：把 `cache-workload.js` 的七档 `{0,10,...,10000}` 从「只测耗时」扩一档「缓存命中断言」——同等输入下断言缓存确实被命中。
- **验收**：新增断言能把「缓存静默禁用」钉成测试失败。
- **已交付 v3.256.0**：`cache-workload.js` 新增 `cacheHit`（同等输入连读两次：第二次必须 hit；测不出与未命中不同形）。`scan_v3254` 导出面纳入该函数。

---

## 二、拓宽·拓展·拓深

### T1 · 打通「下游→上游」0 面【已交付 v3.258.0 · 另表另判据】
- **现状（订正）**：**「0 面」这句已不真，两个仓的 PLAN 都写过它，两边都没人核过。** 实测下游 `ruby-phone` 的手机记忆桥
  `lonshaBridge`（`apps/memory/lonsha-bridge.js` 导出 `mountLonShaBridge`）早已在本仓真被消费：`index.js` 四处调用点
  （回填 `backfill` / 召回 `recall` / 楼层生命周期 `onFloorCommitted`、`onFloorRollback`）—— 「功能早在跑，登记面 0 面」。
- **路径（已按实测修正）**：「在 `open_face_registry.tsv` 新增第 6 行」**行不通** —— 那张表的判据 （T2 要在**本仓**磁盘上找 `upstream_symbol` 的定义 / T4 `consumer` 语法 / T5 四态 / T6 分态 / `v3253` N0 阳性对照）
  全部按「上游产出、下游消费」设计，方向反转后逐条错位（硬塞会当场把新行判红）。故改为**另起一张同样可核的表 + 一份方向反转的判据集**。
- **已交付 v3.258.0**：`tests/audit/open_face_registry_inbound.tsv`（1 面 × 9 列，`owner` 列是产出方）+ `tests/audit/scan_inbound_faces.mjs`（六条判据 I1~I6，含方向硬断）+ 常驻套件 `tests/v3258_inbound_face_registry.test.mjs`
  （A 表本体 / B 真源码面 / C 负控制七例 / D 工具两向自证 / E 版本锚 / F 判据面自防护 / G 两表实时对账）；
  并订正正向表表头那句「下游→上游方向当前 0 面，故无行」+ 本文件上一行基线读数。
- **价值**：把单向供给做成双向回路，结构性最强；两份表各自保持单一方向，两个问题（「供了几面」/「被供了几面」）都能有一处干净回答。
- **验收**：反向表 1 面在册、六条判据 rc=0、两表实时对账通过、两仓 PLAN 都不再写「0 面」。**已达成**（v3.258.0 全量 241/241 · 2446 断言 · 0 失败）。

### T2 · 注入质量从「真实」走向「相关」【拓深】
- **现状**：已交付注入回执真实性（v3.251.0）+ 剧情质量 40 样本评测（v3.250.0，含 5 项 known-gap）。
- **路径**：评测集从 40 样本扩到覆盖 12 类各自的边缘样本；把 5 项 known-gap 逐项转为「主指标」。
- **验收**：known-gap 计数降至 0，样本数显著上升且三层命中率保持。

### X1 · 世界书干跑从「取数」走向「预演」【拓展 · **已交付 v3.270.0**】
- **交付形态**：`projection-pipeline.js` 新增 `predictInjection()`（纯函数，复用真路径同一批 `deriveBudget`），预演随 `sourceLedger.prediction` 恒有键外供；三态实测（模块缺席 ⇒ 预算面全 null / 世界书未知 ⇒ `chars:null` 而非 0 / 有读数 ⇒ 挤占可复算）；判据 `tests/v3270_b2_injection_preview.test.mjs`。**完成，不再作待办。**

---

## 优先级（唯一现行排序 · 判据 `tests/audit/scan_plan_currency.mjs`）

> 本节由机器校对：**当期全部 18 个编号必须逐字出现在本节内**（缺一个即红）。
> 本节只管「编号是否齐全」，不管「排序是否合理」。

1. 批次A：`L21-O2` / `L21-O1` —— 先让 102 个审计盲区可见，再逐条处置 19 个零消费模块。顺序不可颠倒。
2. 批次B：`L21-O4` / `L21-O9` —— 两件都是「声明 ↔ 真码」对账，同族可复用工具。（**两项均已交付**：`L21-O4` v3.464.0、`L21-O9` v3.465.0）
3. 批次C：`L21-O3` / `L21-O7` —— 都属「证据的可信度」面（真机不可用 → 替代证据链 → 冻读取新鲜度）。
4. 批次D：`L21-O5` / `L21-O6` —— 扩既有门禁射程（注入回执全分面 / 27 视图真开）。
5. 批次E：`L21-O8` —— 独立扫描器，可与任一批并行。
6. 拓展：`L21-X1` / `L21-X2` / `L21-X3` / `L21-X4` / `L21-X5` / `L21-X6` 直接把 6 个 prod=0 引擎接成闭环；
   `L21-X7` / `L21-X8` / `L21-X9` 加强已接入能力。**拓展与收账合流，不新建孤岛引擎。**

## 历史优先级（第十七期 R17 · 已换挡至第二十一期 R21）
> **【陈旧节 · 勿当排序读】** 本节属 2026-10-04 那一轮（v3.271.0 基线），其「1. A1 + A2」「3. T2 / A3 / X1」在 v3.266.0~v3.270.0 已全部交付，仅作交付史保留。**现行排序见文首「当前优先级」节。**
1. **A1 + A2**（瘦身 + 兑现登记项）——成本最低、读数回报最快。
2. **T1**（反向面）——**已交付 v3.258.0**（另表另判据，见上）。**遗留**：下游侧的 PLAN / ITERATION_LOG 记账（下游仓自身的迭代轮次，不阻塞本仓）。
3. T2 / A3 / X1 按版本窗口排。

> 维护规则：本文件条目落地后，在条目末标注「已交付 v3.x.x」并附证据；不删历史条目，保持追加式。

---

# 2026-10-03 推进计划（v3.261.0 基线 · 双仓协同）

> **【历史节，已收口，勿当待办】** 本节是 2026-10-03 那一轮的执行计划（v3.261.0 基线）。它列出的 A1/A2/A3/B1/B2/B3/B4 全部已交付（见各条目末「已交付 vX.Y.Z」）；用户当年指令「做完全部内容前别跑全量」**现在仍然有效**，并已升格为长期纪律（见文首「当前执行状态」）。本节保留作为交付史。
> 执行铁律：本节全部落地前**不跑全量**（`npm test` 全量 / `--audit` 全量），只跑单门 / 单套件。
> 基线真读数（本节起手）:80 js / 43928 行 / `index.js` **17091 行**（A1 目标 <15000，差 2091 行）/ `extra_js` 76 项；门禁 244 文件 / 2447 断言 · 0 fail，`--audit` 59 脚本。
> **本节终态（v3.266.0 收口）**：79 js / `index.js` **13883 行**（A1 **已达成**）/ `extra_js` 78 项；门禁 **246 文件 / 2475 断言 · 0 fail**，`--audit` **53/53**。
> 本仓是「深度机」：最大杠杆仍是 **A1 瘦身 + 账本族判据面补强**，其次才是功能拓展。

## 优化提升

- **A1 · index.js 瘦身至 <15000 行【既定主线 · 杠杆最大】——第六刀已交付 v3.266.0（13883 行）· 目标达成**：`18401 → 13883`（六刀共剥 4518 行），已跨过验收线。
  后期可选续刀（非验收必需）：成员级候选 `recallMemory` 688 行 / `exportMemoryReport` 349 行（见 `host_beast_baseline.json` 的 `split_candidates.low_coupling_examples`）；
  或转向「账本族判据面补强」这条同样高杠杆的轴。
  每刀三件套（取库口 / 退路对账 / 统一构造点）+ 数量锁同步 + 「同名函数抄哪份」真行为断言。
- **A2 · 判据面卫生【对标 ruby-phone v3.54.0 的 58 项学费】—— 已落地 v3.267.0**：三形态假绿（对原文件断言 / 破坏写死常量 / 破坏把判据自己删了）已固化为**可机检读数**：
  `tests/_fakegreen_hygiene.mjs`（判据唯一真源，9 条硬信号 K1–K9 + 不饱和读数 + 三形态名）+
  `tests/audit/scan_fakegreen_hygiene.mjs`（门禁，A/B/C/D 四面 + 三态出口）+ `tests/v3267_fakegreen_hygiene.test.mjs`（常驻套件，含三条真源码破坏负控制）。
  **实测读数**：17 份 `*_negctl.mjs` 全部具备「真源码破坏 → 独立树上真跑 → 按归因翻红」的形状；破坏①掏空一份负控制 ⇒ exit 1 点名、破坏②裁判断某条信号 ⇒ 归因点名该条、破坏③扫描面塌成 0 份 ⇒ exit 2（不得用「找不到东西」冒充「东西没问题」）。
  **负控制跟随真源迁移**：判据首版把「阳性对照」写成过窄正则（只 11/17 饱和），实测核实后确认是**判据自己的正则过窄**而非 6 份缺项 —— 已修并留痕（这是「把『我没想到的写法』读成『对方有缺陷』」的老毛病）。
  剩余：`npm test -- --audit` 纳入**定期全量**（防 audit 脚本漂移）—— 按用户纪律（本节全部落地前不跑全量）留待计划收口后随终局全量一并执行。
- **A3 · 缓存正确性回归加固【已落地 v3.267.0】**：`cache-workload.js` 的 `cacheHit` 断言交付 v3.256；本轮把同类「正确性被静默打掉」退化模式补成常驻断言 —— 新增 `tests/v3268_cache_same_input.test.mjs`（15/15）：
  A 纯函数面（stale-guard）同输入不变量：同输入 ⇒ 同 id/指纹/**幂等键**且跨时钟不变（强推时钟后逐字不变 —— 幂等重放的承重面）、键序无关、三入口不改入参、三态可分、behind 门控两向；
  B 投影新鲜度**面**：同实例重复导出与不同实例同输入必须同形、三态键集冻结（同代 `null` / 丢弃 `dropped,from,reason,to` / 本来没这面 `null` 且与丢弃不同形）；
  C 四条真源码破坏负控制（seed 塞 `createdAt` ⇒ 幂等键逐轮漂移 / behind 门控摘掉 ⇒ `no-fingerprint` 消失且不连坐读集闸 / 面里塞 `at` ⇒ 键集 `+at` 现形 / 面里删 `reason` ⇒ 键集递减现形），每条都带阳性对照；
  D 工具两向自证 + 判据纯度；E 两张台账；F 版本锚。
  **连带修掉 A2 的三处真遗留**（登记面 × 2 + 坏锚点 × 1，不是本刀引入）：① 破坏工具接收方台账漏登 A2 新建档；② 灵敏度矩阵漏登 `scan_negctl_hygiene`（根因是名字含 `negctl` 子串，被四处按名分类器当成「配对负控制」，修法是改子串而非补登）；③ `v3241` C1 的坏锚点 ` —— 实测值面随时钟变化（值断言必 flaky），而键集在破坏副本上跨时钟逐字稳定。首版拿「键序判据」做 C1 的「不连坐」时实测到偶发假红（并发 4 路下 3/5 轮出现），已改用时钟无关的三态判据并留痕。

## 拓宽·拓展·拓深

- **B1 · 注入质量从「真实」走向「相关」【已落地 v3.268.0】**：评测集扩到覆盖 12 类各自的边缘样本；known-gap 逐项转主指标。
  验收：**known-gap 计数降至 0（实测 4 → 0）**，且三层命中率保持。
  落地形态：`EVAL_VERSION` 2→3（主样本 8→11，原三缺口转正）、`STORY_EVAL_VERSION` 1→2（样本 43→55，12 类各 +1 边缘样本、`gp2` 借生产既有的节点 `aliases` 通道转正）；
  ★ 先扩缺口、再让词表真命中（**不是放宽判据**：期望集一个字没动）：`EMO_LEXICON.warm` +5 / `anger` +1 + `EMOTION_OPPOSITES` 同步（+新键「气得」）——
  探针实证「只扩词表对召回零影响」，故两处必须同改；判据交棒为「缺口为空 + 反坐实」（喂自造 gap 须复现），套件 `tests/v3269_b1_injection_relevance.test.mjs`（16/16）
  用**真源码降级副本**两向证明缺口真会回来（命中率 0.75→1.0、主导维 0.909→1.0）。
- **B2 · 世界书干跑从「取数」走向「预演」【双仓 X1 · 已落地 v3.270.0】**：projection 出口携带「这条世界书占多少 token、挤掉哪条记忆」的容量 / 挤占预演字段，下游 ruby-phone 可读。
  验收：**预演随 `sourceLedger.prediction` 恒有键外供**（实测三态：模块缺席 ⇒ 预算面全 null / 世界书未知 ⇒ `chars:null` 而非 0 / 有读数 ⇒ 挤占可复算）。
  落地形态：`projection-pipeline.js` 新增 `predictInjection()`（纯函数，复用真路径同一批 `deriveBudget`）；「世界书占用并入 reserve 槽」即得挤占量，**不是另写的近似公式**；
  ★ 关键设计结论：下游 `projection-contract.js` 认死 `SUPPORTED_API_VERSION = 1`，抬 api 版会当场打断四个现役业务 App ⇒ 预演**只能**做 `sourceLedger` 子键，`ENVELOPE_FIELDS` 与 api 版一字不动；
  口径纪律：世界书条目「要不要进提示词」由宿主的激活引擎定（**不在本插件可观测面内**）⇒ 只算 `enabled && constant === true`（每轮必进），全库量单列 `upperChars` 作上限、不得当实际占用；
  交付档 `tests/v3270_b2_injection_preview.test.mjs`（19/19，三条真源码破坏 + 阳性对照 + 出口面不变式）。
- **B3 · 跨仓反向面消费深化**：`ruby.lonshaBridge` 反向面新增（现仅 4 调用点 backfill / recall / onFloorCommitted / onFloorRollback）。候选 usage-tracker 使用画像 / ruby-phone 新缝 18 件 App 关键事实（health 孕程 / traveldesk 行程）上桥进引擎账本。验收：反向表新增面在册 + 六条判据 rc=0 + 两表实时对账。
- **B4 · 账本族可读出口**：`evidence-workbench` 九账对账面从诊断工具升级为调参工具，新增按楼层 / 按角色 / 按账三维检索，下游织光机 / 全局搜索联动呈现。

## 协同主线（与 ruby-phone 双仓拧一股）

1. **双仓瘦身对齐**：本仓 A1 与 ruby-phone A1（873KB index.js）同用四刀范式（本仓已验证成熟，对方直接复用）。
2. **判据卫生互鉴**：ruby-phone v3.54.0「判据交棒改写 + 活基线零手抄刷新」经验回喂本仓 A2；本仓三形态假绿自检 H5/H6 回喂对方。
3. **跨仓桥消费深化**：ruby-phone B1 互联层聚合事实，经本仓 B3 反向面上桥进引擎账本——「手机从孤岛陈列升级为引擎数据前端」。

## 起手两件（历史节：两件均已交付，勿当待办）
> **【陈旧节 · 勿当排序读】** 本节属 2026-10-04 之前的收尾轮，其两件均已交付，仅作交付史保留。**现行排序见文首「当前优先级（唯一现行排序 · 判据 `scan_plan_currency.mjs`）」节。**

① ruby-phone A2（80 App 消费点矩阵，纯只读零风险，立刻产出对账读数）；② 本仓 A1 续刀（按磁盘重算候选后剥下一刀）。
