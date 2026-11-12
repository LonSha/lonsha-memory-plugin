# Agent Note: LonSha 第二十一期拓展创新计划 (L21-X1 ~ L21-X9)
Status: proposed
Baseline: v3.461.0 / 9a6e158
Date: 2026-11-11

## Problem

本仓的拓展面**不缺引擎**。实勘读数（2026-11-11）：

- 根级模块 366 个，`manifest.extra_js` **365 项全部真加载**；
- v16 / v17 / v18 三期共 54 项拓展引擎**已全部落盘**；
- 剧本里已有的能力几乎覆盖了「心理防御 / 伏笔主动提起 / 默契暗号 / 创伤防御 / 谣言异化 /
  日常节律 / 世界线 / 视角投影 / 反事实」等全部方向。

⇒ **真正的缺口不是"再想一个心理机制"，而是「这些机制之间没有形成闭环」。**

三条实测证据：

1. **19 个模块 `prod_call_sites = 0`**（详见 L21-O1 清单），其中就包含
   `unified-narrative-clock-axis`（叙事钟轴）、`meaning-evolution-map`（意义演化）、
   `memory-action-symbiosis-circuit`（记忆-动作共生）—— 都是"已经有了但没人用"。
2. **`worldaxis-objective-to-subjective-assimilator.js`（61 行）连台账都没登记**，
   `prod_call_sites` 为 `None`（不是 0，是根本没进审计面）。
3. **系统有 27 个面板视图，但操作类只有少数几个**：多数是"看"，少数能"改"。
   玩家能诊断，但**不能"撤销我刚做的那一件事"这类日常操作**。

⇒ 本期九项全部是**收束型 / 闭环型**：要么把已有的孤立能力接成闭环，
要么补上"玩家真能操作"的那一层。**每一项都必须点出一个已存在的引擎作为底座**，
点不出来的不许立项。

## Proposal

### L21-X1 · 心理防御与自我叙事的一致性守门（复用 `ego-defense-mechanisms-engine.js`）
- **底座**：`ego-defense-mechanisms-engine.js`（136 行）已在 `extra_js` 真加载，
  台账 `prod_call_sites=0`。它**会**产出"合理化 / 投射 / 否认"三类扭曲叙事，
  但**没有任何东西检查扭曲之后的叙事是否还能与已锁定事实共存**。
- **核心机制**：新增 `defense-narrative-consistency-guard.js`：
  在防御引擎产出主观润色之后，比对「润色后的说法」与「`lockedFacts` 里的铁律」，
  三态：`consistent`（不冲突，放行）/ `strained`（换个说法还能自洽，给可用措辞）/
  `contradicts`（与铁律正面冲突，**必须挡下**并说明"这一句与已锁定事实不符"）。
  **绝不修改防御引擎的输出，也绝不修改铁律**（两侧都是 owner 的地盘）。
- **玩家入口**：角色档案「🧠 潜意识心防」卡片上，`contradicts` 的句子标红并给替代措辞。
- **验收旅程**：角色把"我答应过你"合理化成"我没明确答应"时 —— 若确有铁律记录，
  标红并给替代；若铁律里没有，则放行（不阻止自我欺骗，那本就是人设）。
- **为什么现在做**：v17-X1 交付了防御引擎，但"它会不会说出与事实矛盾的话"这个问题**从未被问过**。
- **判据**：`tests/v21_x1_defense_consistency.test.mjs` 八条 + 三条真源码破坏负控制
  （把 contradicts 压成 strained / 让守卫修改铁律 / 让守卫恒放行）。

### L21-X2 · 伏笔主动提起的"时机成熟度"可解释面（复用 `latent-plot-foreshadowing-engine.js`）
- **底座**：`latent-plot-foreshadowing-engine.js`（126 行）已加载，`prod_call_sites=0`。
- **核心机制**：新增 `foreshadow-timing-explain.js`：
  对每条未决伏笔给出「**为什么现在提 / 为什么不提**」的可读理由链（四因子：
  时间距离、情绪张力、话题邻近度、在场人物）。四因子**各自可读、不相加成一个分数**
  （v3.439.0 已验证：压成一个数会让"为什么"永远看不见）。
- **玩家入口**：未完约定卡片「🌟 悬念监测」每行可展开看四因子。
- **验收旅程**："数日前答应的约定"在合适情境触发时，玩家能点开看到"因为话题邻近 + 时间够了"；
  不触发时也能看到"因为当时在吵架，张力太高"。
- **判据**：`tests/v21_x2_foreshadow_timing.test.mjs` 七条 + 负控制（四因子压成一个数 ⇒ 红）。

### L21-X3 · 默契暗号的"可解码性"双向校验（复用 `tacit-intimacy-code-engine.js`）
- **底座**：`tacit-intimacy-code-engine.js`（122 行）已加载，`prod_call_sites=0`。
- **核心机制**：暗号是"二人专属"，但**存在一个真问题**：观众（玩家）看不懂。
  新增 `tacit-code-legibility.js`：在暗号出现时同步给"**这句话有暗号，但意思不告诉你**"的标记
  （存在性与含义分离 —— 与 v3.439.0 秘密三刀同口径）。
  三态：`coded`（有暗号，含义遮蔽）/ `ambiguous`（可能是暗号也可能是正常话，列出候选不猜）/ `plain`。
- **玩家入口**：羁绊详情「🤫 默契词典」；对话里暗号句带小标记，点开只说"这是暗号"。
- **验收旅程**：第三者面前传警告时，玩家看到"（暗号）"但看不到含义；词典里已解锁的才给含义。
- **判据**：`tests/v21_x3_tacit_legibility.test.mjs` 八条 + 负控制（把 ambiguous 并进 coded ⇒ 红）。

### L21-X4 · 创伤防线的"退避程度"分档而非一个布尔（复用 `trauma-taboo-defense-matrix.js`）
- **底座**：`trauma-taboo-defense-matrix.js`（130 行）已加载，`prod_call_sites=0`。
- **核心机制**：现有引擎有"浅层礼貌推脱 / 中层戒备 / 深层应激"三层，
  但**没有任何读面能回答"这一句是第几层"**。新增 `trauma-defense-depth-read.js`：
  把三层映射为可读分档（`deflect` / `guard` / `flashback`）+ 每档的触发依据，
  **判不了时给 `undecided`**（不许猜层）。
- **玩家入口**：心境面板「🛡️ 心理戒备区」显示当前分档与依据。
- **验收旅程**：追问创伤 → 面板显示"guard：提到具体年份"；若无从判断 → "undecided，无法判断"。
- **判据**：`tests/v21_x4_trauma_depth.test.mjs` 六条 + 负控制（undecided 并进 deflect ⇒ 红）。

### L21-X5 · 谣言异化的"可回溯原始证据"链（复用 `rumor-mutation-entropy-engine.js`）
- **底座**：`rumor-mutation-entropy-engine.js`（107 行）已加载，`prod_call_sites=0`。
- **核心机制**：谣言会异化，但**"能不能回溯到最初那句真话"没人做过**。
  新增 `rumor-provenance-chain.js`：沿异化链反向追溯，每跳给"细节丢失了什么 / 情绪词加了什么"，
  终态三档：`traceable`（能回到原始证据）/ `broken`（中间某跳丢了来源，点名是哪跳）/ `no-origin`（本来就是无源传闻）。
- **玩家入口**：小道消息面板「🗣️ 传闻演化链」每行可"追溯源头"，能回到就展示原句。
- **验收旅程**：一条谣言经 4 轮转述后，玩家能点回第 1 轮的原始说法；若第 3 跳丢了来源，明确标出。
- **判据**：`tests/v21_x5_rumor_provenance.test.mjs` 七条 + 负控制（broken 报成 traceable ⇒ 红）。

### L21-X6 · 共同起居习惯的"已沉淀 vs 待观察"分档（复用 `circadian-shared-routine-engine.js`）
- **底座**：`circadian-shared-routine-engine.js`（83 行）已加载，`prod_call_sites=0`。
- **核心机制**：习惯需要"见过几次"才算沉淀。新增 `shared-routine-evidence.js`：
  每条习惯给 `observed`（见过但次数不足）/ `established`（已沉淀，可被角色主动提起）/
  `atypical`（今天反常，不提），**次数阈值必须可读**（不许藏一个魔数）。
- **玩家入口**：生活看板「☕ 共同起居」每行带"第 3/5 次"这类进度。
- **验收旅程**：第 2 次深夜聊天**不**主动提"你最近总熬夜"（还不到 established）；
  第 5 次才提（且有据可查）。
- **判据**：`tests/v21_x6_routine_evidence.test.mjs` 六条 + 负控制（observed 当 established ⇒ 红）。

### L21-X7 · 世界线跳跃的"作者可校验"草稿审计（复用 `worldline-memory.js`）
- **底座**：`worldline-memory.js`（691 行，`WM_VERSION=1`）已接入（`prod_call_sites` 有值）。
  v3.429.0 已做结构化编辑器与 `parseJumpsText` 单源解析。
- **核心机制**：新增 `worldline-draft-audit.js`：在**保存前**审一遍草稿
  —— 楼层是否单调、纪元编号是否冲突、前史缺口在哪、每跳的 `why` 是否为空。
  五档各报各的，**不合成"草稿有错"一个布尔**。
- **玩家入口**：世界线编辑器「✔ 保存前自检」按钮 + 每题可点跳到该行。
- **验收旅程**：故意把第 3 跳的楼层写成比第 2 跳小 → 自检精确指出"第 3 跳楼层 40 < 第 2 跳 47"。
- **为什么现在做**：v3.429.0 的解析器只报"坏行"，**不报"语义上不成立的跳"**。
- **判据**：`tests/v21_x7_worldline_draft_audit.test.mjs` 九条 + 负控制（五档合一 ⇒ 红）。

### L21-X8 · 一次操作的完整"回声"（复用 `echo-ledger.js` + `oplog`）
- **底座**：`echo-ledger.js` 与面板 `oplog` 视图已存在。
- **核心机制**：玩家改一条记忆，会牵动图谱 / 摘要 / 注入面 / 时间线。
  现在 `oplog` 只记"改了什么"，**不记"牵动了哪些面"**。
  新增 `operation-echo-report.js`：每条操作给出四档回声
  （`graph` / `summary` / `injection` / `timeline`），每档"受影响 / 未受影响 / 判不了"三态。
- **玩家入口**：`oplog` 每行可展开「↩️ 这次改动牵动了什么」。
- **验收旅程**：改一条锁定事实后，能点开看到"图谱 2 节点受影响、注入面下次生成会变、摘要待重建"。
- **判据**：`tests/v21_x8_operation_echo.test.mjs` 八条 + 负控制（把判不了并进未受影响 ⇒ 红）。

### L21-X9 · 「我为什么不记得」的缺口归因面（复用 `memory-archaeology-gap-bench.js`）
- **底座**：`memory-archaeology-gap-bench.js` 已在 v3.441.0 接成 L13-X4 证据缺口工作台
  （三档成因 `no-source` / `source-lost` / `contradicted`）。
- **核心机制**：现有工作台回答"这条记忆为什么缺证据"，
  **但玩家更常问的是"这件事我怎么完全不记得"** —— 这是**不同的问**：
  前者是条目级，后者是**话题级**。新增 `topic-absence-explain.js`：
  对一个话题给出四态成因：`never-told`（从没被告知）/ `told-but-dropped`
  （说过，被裁掉了 —— 要给裁剪原因）/ `told-before-branch`（在另一个世界线）/
  `undecided`（判不了）。
- **玩家入口**：搜索"某件事"搜不到时，结果页底部一行「为什么没有这条？」可点开四态说明。
- **验收旅程**：问"我们第一次见面是什么时候"却搜不到 → 若确实没记过，说"从没记录过"；
  若记录过但被预算裁掉，说"记录过，但在第 N 楼因预算被裁，可展开看原文"。
- **为什么现在做**：`undecided` 与 `never-told` 处置相反（前者要人去看，后者不用）——
  压成一个"没找到"会让"记忆系统漏记"永远看不见（v3.444.0 已验证过同款纪律）。
- **判据**：`tests/v21_x9_topic_absence.test.mjs` 九条 + 负控制（undecided 并进 never-told ⇒ 红）。

---

## 与优化九项的关系

| 拓展项 | 复用哪个已存在引擎 | 是否解除一条 O1 欠债 |
|---|---|---|
| X1 防御一致性 | `ego-defense-mechanisms-engine` | ✅ 是（该引擎 `prod_call_sites 0→1`） |
| X2 伏笔时机 | `latent-plot-foreshadowing-engine` | ✅ 是 |
| X3 暗号可解码 | `tacit-intimacy-code-engine` | ✅ 是 |
| X4 创伤分档 | `trauma-taboo-defense-matrix` | ✅ 是 |
| X5 谣言溯源 | `rumor-mutation-entropy-engine` | ✅ 是 |
| X6 习惯沉淀 | `circadian-shared-routine-engine` | ✅ 是 |
| X7 世界线自检 | `worldline-memory`（已接） | ❌ 已在用，属能力加强 |
| X8 操作回声 | `echo-ledger` + `oplog`（已接） | ❌ 已在用，属能力加强 |
| X9 话题级不记得 | `memory-archaeology-gap-bench`（已接） | ❌ 已在用，属能力加强 |

> **本期九项里 6 项直接消掉 O1 的零消费欠债** —— 这是"拓展"与"收账"合流的刻意设计：
> 不为了做新功能而做新功能，而是**用真实产品需求去驱动那些已经写好却没人用的引擎**。
> 这比"为了让 `prod_call_sites` 变绿而随便加个假消费者"强，也符合本仓
> `do not add a consumer solely to satisfy the audit` 的原文纪律。

## 明确不做
- 不新建任何"从零开始的引擎"（X1~X6 的底座全部已存在，只是没人接）。
- 不把任何四档/五档压成一个布尔或一个总分（本仓已验证过的假绿形态）。
- 不让 `undecided` 与任何确定档同形。
- 不为"绿"而放宽判据：每条负控制都必须真源码破坏后转红。

## 诚实边界
- 全部为仓库内合成宿主验证；**真机 SillyTavern 未执行**
  （`realhost_readings.verdict` 仍是 `environment-unavailable`，见 L21-O3）。
- 真机上的实际生成效果（角色是否真的"像人"）**不是本计划能验收的**，
  本计划验收的是"机制与读数是否正确、是否可解释、是否可回源"。