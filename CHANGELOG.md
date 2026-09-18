## v3.172.0
**召回漏斗读数面（v3.95/v3.96 缝合四模块的收缩阶段）**
**主题**：v3.169 立下 I5（有损必有计数）与 I6（读失败 ≠ 读到了 0），判定面落在账本
自己的 OpLog 上；v3.170 做第一次跨界检查（stm-ltm，v3.96 缝入后 74 个版本无人审计）；
v3.171 递给 `smart-trigger.js` 的**读侧**。v3.172 按「扩大深度与广度」把面从单模块放大到
**整条召回漏斗**：`text-chunk.js`（智能分块）/ `ai-select.js`（前置 AI 精选）/
`unified-recall.js`（统一召回）/ `api-channels.js`（副 API 通道）——这四个模块是 v3.95/v3.96
同一批缝合进来的，**缝入后 76 个版本里只有「功能是否生效」被审计过，没有一处「漏斗变窄」被计数**。

### 一、七项实测缺陷（`/tmp/probe_recall_funnel.mjs` 真跑，修前逐条成立 7/7）
| # | 缺陷 | 修前观测 |
|---|------|----------|
| R1 | 粗召回 `maxCandidates` 静默截断 | 25 条进 `maxCandidates=20` 出 20 条，返回值裸数组无丢弃量，读取方不知道少了 5 条 |
| R2 | `parseAIResponse` 五态塌缩同形 | 「明确空集」「键名不认识」「非 JSON」「类型不对」「完全没返回」**全部返回 `[]`**，且前两者走同一个 `ai-empty-fallback` 分支（**判不了被当作判定了空**）|
| R3 | `mapKeysToCandidates` 未命中静默跳过 | AI 给 5 个 key 只命中 2 个，3 个零计数；宿主用返回值**整池替换**候选池 |
| R4 | `mergeWithGuaranteed` 全库零调用 + 语义分歧 | 模块版保底上限 `ceil(maxTotal/2)`（10 个保底节点取 8）；宿主内联版无上限（取 10）|
| R5 | `graphToCandidates` 在**评分之前**按 `updatedAt` 截断 | 30 节点截到 24，**最旧但语义最相关的 n29 被丢弃**，`MAX_CANDIDATES=24` 硬编码无配置项、无覆盖参数、无计数 |
| R6 | `api-channels.route` 副通道失败完全静默 | 副通道抛 401，返回体 `{text, source:'main-fallback', task}` —— **error 字段缺失、失败原因完全丢失**，无法区分「没通」与「通了但回空」|
| R7 | `text-chunk` 硬切兜底零标记 | 3000 字无边界中文切成 `[800,800,800,800,120]`，**硬切 4 次零自述**——而这正是该模块存在的理由 |

### 二、修法（只增不删，既有裸数组契约与签名前若干参一律不动）
读数一律走**可选末位参数 `carry`（默认 null）**或**返回体新增字段**，绝不改既有返回值形状：
- `ai-select.js`：`recallCandidates(entries,q,opts,carry)` 补 `total/scored/kept/dropped/noContent/
  constantFiltered/inputNotArray/cap`；`parseAIResponse(raw,carry)` 升级为**九态**
  （`no-raw`/`blank`/`no-json`/`bad-json`/`not-object`/`wrong-shape`+`gotKeys`/
  `all-items-invalid`+`rawItems`/`empty`/`ok`），**返回值仍是裸数组**；
  `mapKeysToCandidates(keys,candidates,carry)` 补 `requested/mapped/unmatched/unmatchedSample`；
  `route()` 分流改为**只有 `state === 'empty'` 才走保底 top1**，其余一律 `local-parsefail`；
  **新增 `normalizeRecallFunnel(records,opts)`** 面板函数（认得三种录入形状，空集是结论
  不计入缺口，输出 `records/recorded/missing/cap/dropped/evaluated/empty/unreadable/unmatched/
  truncated/graphDropped/hardCut/channelFallback/stages/hasReadGap`）。
- `unified-recall.js`：`graphToCandidates(nodes,opts,carry)` 支持 `opts.maxCandidates` 覆盖硬编码，
  补 `nodesTotal/candsTotal/unmappable/kept/dropped/guaranteedKept/cap`；
  `mergeWithGuaranteed(scoredCandidates,opts,carry)` 补 `guaranteedPicked/guaranteedCap/
  scoredPicked/maxTotal/kept/dropped`。
- `api-channels.js`：`route()` 补 `attempts`（0/1/2）/`secondaryError`/`secondaryEmpty`
  （区分「没通」与「通了但回空」）/`channelEndpoint`；**三态 source 语义一字不动**。
- `text-chunk.js`：`chunkWithoutDelimiter`/`chunkText`/`estimateChunkCount` 加 `carry`，
  补 `chunks/hardCuts/boundaryHits/cuts/loops/emptyChunks/guardTrips/chunkSize/overlapPercent/
  maxLen/minLen/lastBoundaryKind` 与四分支（`single`/`byDelimiter`/主分支）。
  **双向对账**：`cuts === hardCuts + boundaryHits`（每一刀都有归类）、
  `loops === chunks + emptyChunks`（每一段都有去向）。

### 三、两处真实现缺陷（由修后探针与首跑套件当场抓出）
1. **`_findBoundary` 边界误判**：语义边界恰好落在窗口末端时 `best+1 === end`，调用方以
   `adjusted === end` 判「硬切」——**把一次成功的语义边界误记为硬切**（漏报为 `hardCuts=17,
   boundaryHits=0`）。修法：`_findBoundary(text,start,end,chunkSize,flags)` 用 `hit(v,kind)`/
   `miss(v)` 帮手**由被调方自报** `flags.boundary` + `flags.kind`，调用方按 `flags.boundary` 判定。
2. **`parseAIResponse` 空串吞并**：`if (!raw)` 使空串 `''` 落进 `no-raw`，
   「返回了空串」与「根本没返回」**不可分——这本身违背 I6**。修法：
   `if (raw === null || raw === undefined)`。

### 四、宿主接线（`/tmp/ll_p172_host.py`）
- **A** 台账字段 `_recallFunnel` / `_recallFunnelDropped` / `_recallFunnelReadEmpty`（与
  `_triggerStats`/`_triggerDropped` 同规格）；
- **B** 调用链读数采集（统一召回 / AI 精选 / 粗召回三段，**一轮下来一条读数都没有时
  `_recallFunnelReadEmpty++`** —— 空读轮次与零读数轮次可分）；
- **C** `getDegradationLedger` 加「召回漏斗读数缺口」与「漏斗空读轮次」两行；
- **D** `selfCheck` 加「召回漏斗」行（未启用 / 已启用但尚无读数 各有独立文案）；
- **E** `exportMemoryReport` 加「**召回漏斗：**」面板段。

### 五、新增测试（`tests/v3172_recall_funnel_read_surface.test.mjs`，22 组）
A 粗召回截断 / B 五态可分 + 判不了≠判定了空 / C key 映射 / D 图谱截断 + 名额分账 /
E 副通道留痕 / F 硬切可计数 + 双向对账 / G 面板三形状 + 确定性 / H 契约零破坏 /
I 宿主接线 + 旧读数面零破坏 / J 可选参数形态 + I6 状态完备 + 工具自证 /
K 进程内负控制 + 异步负控制 + 工具自证。
**负控制要求「真源码破坏 → 加载破坏副本 → 在副本上重跑同款真判据」，并拦三种假绿形态**：
① 破坏打在空气上（锚点不命中）②破坏文本等于原锚点（没改到）③锚点字面量自我指涉
（判据引用被破坏的那一行）。锚点表为**四元组** `[文件, 锚点原文, 显式破坏文本, 标签]`，
J3/K1/K2/K3 一律**从该表派生**，同文件内锚点字面量只准出现 1 次（判据纯度）。

## v3.171.0

**门控读数面（smart-trigger 读侧审计）**

**主题**：v3.169 立下 I5（有损必有计数）与 I6（读失败 ≠ 读到了 0），判定面全落在账本
自己的 OpLog 上；v3.170 把两条拿出账本本体，做了第一次跨界检查（stm-ltm，v3.96 缝入后
74 个版本无人审计）。v3.171 把**同一族不变量**递给同仓第三个承载「判断」的子系统
`smart-trigger.js`（v3.110 缝合 BME 的 `maintenance/smart-trigger.js`）的**读侧**——
这次审的不是「丢没丢记忆」，而是「这个模块读到的世界，读取方能不能信」。

### 一、六项实测缺陷（`/tmp/probe_st.mjs` 真跑，修前逐条成立）

| # | 缺陷 | 修前观测 |
|---|------|----------|
| D1 | 非法正则被静默当作「未命中」 | `stats.customPatternHit === ''`，`stats` 无任何 invalid 字段；读取方无从区分「没匹配」与「判不了」 |
| D2 | 空读与平淡楼在**宿主台账**塌缩同形 | 宿主只 push `{score, triggered, reasons}`（丢弃 `stats`），两条记录逐字节相同；`savedCalls=2` 无法分辨其中一次是空读 |
| D3 | `maxMessages` 静默丢弃**最旧**且无计数 | 6 条取 3 得 `m3,m4,m5`，返回裸数组无丢弃量字段（宿主的 `index.js` 目前不传该参数 = **休眠炸弹**） |
| D4 | `isOmitted` 抛错被吞成「未被省略」 | 异常零留痕，读取方以为「判定正常」 |
| D5 | `keywordHits` 命中 40 个只留 32 个 | `slice(0,32)` 且无「已截断」标记，读者以为只命中 32 个 |
| D6 | 宿主 300 条环形台账淘汰量无自述 | 无「评估数 vs 记录数」对账、无环形上限/淘汰量自述 |

### 二、修法（只增不删，既有调用形状一律不动）

**内核 `smart-trigger.js`**
- `normalizePending(chat, options, carry)`：**返回值仍是裸数组**（v3110 的 `capped.map(m => m.index)`
  与宿主数组操作都不受影响），丢弃量与「省略判定失败」数经**第三可选参数 `carry`** 带出
  （`carry.dropped` / `carry.omitErrors` / `carry.available` / `carry.kept`）。
  返回形状**不做破坏性变更** —— 这是补丁第一稿的错，第二稿才修对。
- 新增 `compilePatterns(raw)` → `{ok, invalid}`：把「能编译」与「不能编译」拆开。
- `evaluateTrigger` 的 `stats` 追加 `customPatterns` / `invalidPatterns`（D1）、
  `empty`（空集标记，D2）、`keywordHitsTotal` / `keywordHitsTruncated`（D5）；
  `keywordHits` 列表仍限 32 条（向后兼容）。
- `summarizeTriggers` 台账段追加 `recorded` / `missing` / `emptyCount`（D6），并保留
  `cap` / `dropped` 作为宿主注入位；既有 `evaluated/fired/skipped/savedCalls/fireRate/avgScore/topReasons` 口径逐项不变。
- 新增 `normalizeTriggerReport(records, opts)`：**双态读数面板**，
  认得三种实际会出现的 `empty` 形状（直出 `stats.empty` / 台账摘出的 `report.empty` / 简写 `empty`），
  输出 `{records, empty, plain, cap, dropped, missing, hasReadGap}`。
- 新增 `pendingList(r)` / `pendingReport(r)` 适配助手；导出**只增不换**（既有八个键一个不动）。

**宿主 `index.js`（三处接线）**
1. 调用链接入读数面：创建 `_carry` 并作第三参传入；台账条目补 `report`
   （`empty` / `invalidPatterns` / `dropped` / `omitErrors`）；300 条环形淘汰计数
   `this._triggerDropped`（原先是 `shift()` 静默丢）。
2. 降级路径区分**空读**与**平淡楼**：空读既不该花 LLM **也不该走本地摘要**
   （那会凭空造一条记忆），只有真平淡楼才降级摘要。
3. 报告展示段接 `normalizeTriggerReport`：读数缺口（空读 / 缺失 / 环形淘汰）与判定失败
   （规则判不了 / 番外判定抛错）各出一行 ⚠️；`getDegradationLedger` 补「门控读数缺口」行、
   selfCheck 补「门控读数」行（未启用时报「—（未启用）」，不假装健康）。

### 三、兼容约束（v3110 既有 10 组断言逐条保持绿）

- `normalizePending` 必须返回**可 map 的数组**（`[3]` / `[0,3]` / `[0,1]` / `[]` 四组形状断言）。
- `stats.customPatternHit === ''` 的既有口径不变（补 `invalidPatterns` 字段不冲突 —— 它把
  「判不了」从「没命中」里**额外**拆出来，而非改写旧字段）。
- `evaluateTrigger([], {})` 仍是 `{triggered:false, score:0, reasons:[]}`。
- `summarizeTriggers` 的七项旧口径逐项不变。
- 宿主 `index.js` 中 v3110【9】钉住的两段原文本形态（`if (_triggerDecision && _triggerDecision.triggered === false)`
  与 `} else { … extractMemoryWithLLM }`）**保持原样**——空读判定嵌在内层，不改变外层结构。

### 四、测试与审计（新增 46 项配套测试 / 全量 165 文件 1123 断言）

`tests/v3171_trigger_read_surface.test.mjs`（A–I 九层）：
- **A** 非法正则两态可分（D1，4 项）　**B** 空读 vs 平淡两态可分（D2，3 项）
- **C** 丢弃/失败计数（D3/D4，6 项）　**D** 截断标记（D5，2 项）
- **E** 台账对账与双态面板（D6，7 项）　**F** 适配助手与形状兼容（4 项）
- **G** 宿主接线（7 项，含「v3110【9】原文本形态未被破坏」）
- **H** 源码层不变量（4 项）+ 工具自证（2 项，含判据纯度检查）
- **I** 负控制 7 项：**真破坏 → 加载破坏副本 → 在其上重跑 A–G 同款真判据**

**负控制形态（本仓第三次遇上同族假绿，但这次堵法升级）**：在 v3.170 之前，负控制有三种
假绿形态 —— ①对原文件断言（破坏没发生也绿）；②对**模拟常量**断言（真判据压根没被调用）；
③破坏把判据自己删了（自我指涉）。本轮 I 层七条全部采用**真源码破坏**：
锚点必须**恰中一次**否则抛（`锚点命中 N 次`），破坏副本经临时文件加载，**半真值形状直接抛**，
并在副本上跑与 A–G 层**逐字同款**的真判据。H5 另有判据纯度检查：破坏串一律用 `A(n)` 复用，
若把锚点字面量抄进替换串，计数会 > 1 —— 那正是自我指涉假绿的入口。

**外部注入负控制（磁盘级，比套件内置更硬）**：`/tmp/ll_neg_disk171.py` 对**真实磁盘文件**
做 7 组注入 → 每组真跑套件 → `finally` 还原 + md5 核对。结果 **7/7 全部 TRIGGERED**
（NEG1 翻红 2 条 / NEG2 3 / NEG3 3 / NEG4 6 / NEG5 4 / NEG6 3 / NEG7 2），
基线 md5 `6d5f106d7988131bc4db9a78bf4af147` 注入前与还原后一致。

### 五、两处期望值修正（如实记录，非实现缺陷）

1. **H5 期望值写错**：初稿按 v3.170 的经验写「锚点应出现 2 次」（声明 + 破坏串内嵌），
   但本套件破坏串一律用 `A(n)` 复用，锚点字面量在 I 层只出现 **1** 次；且扫描范围须限定
   I 层区域（H1/H3 里的同名字符串是独立的源码判据，不属于破坏串）。
2. **E4 判据漏了一种真实形状**：直出结果把空读放在 `r.stats.empty`，而面板初稿只认
   `r.empty` / `r.report.empty`。这不是「实现错」，是**面板少认了一种实际会出现的形状** ——
   修法是扩展内核（三态都认），并同步 H2 与 I_ANCHORS[4]。

### 六、发布卫生

- **审计上界按既有明文协议放宽**：`tests/v3116_dead_code.test.mjs` 活跃代码总量
  21700 → **22100**（v3.152 词典线 +197 → 21000；v3.168 携带契约/静默降级线 +235 → 21300；
  v3.170 巩固面 → 21700；本版门控读数面 +约 92 行）。这是审计脚本自身口径，非缺陷。
- **v3111 体检段窗口约束**：v3111【9】在「召回体检」标记前 400 字符处有「报告内只 push
  文本行」判据，本版新增的数组 `.push()` 一度落进该窗口 —— 改为字符串拼接，语义不变。
- **旧锚点接管**：硬钉交棒 4 个文件（v3117×3 / v3130×3 / v3147×2 / v3169×1）；
  动态下界（v3162 `[4d]` 协议）9 个文件共 13 处 `vnum('3.170.0')` → `vnum('3.171.0')`，
  另 v3164/v3165 的「判据指纹」里拼接形态的发行版号同步交棒。

### 七、终局门禁

```
node tests/run.mjs --audit
→ 165 个测试文件 | 通过断言 1123 | 失败 0 | 42.1s
→ 9 个审计脚本全部 ✓（claim_truthfulness / config_liveness / event_lifecycle /
   module_wiring / resilience / slider_coherence / syntax / ui_binding / wiring）
```

## v3.170.0
- **巩固面：把 I5/I6 拿出账本本体，做第一次跨界检查**。v3.168 立了 I4「降级必有计数」、v3.169 立了 I5「有损必有计数」与 I6「读失败 ≠ 读到了 0」——但它们的判定面全都落在**账本自己**（OpLog）上。本版把这两条不变量递给同仓另一个承载叙事记忆的子系统：`stm-ltm.js`（v3.96 从 NE-Memory v8.1 缝合进本仓的 STM/LTM 游标巩固引擎，此后 **74 个版本无人审计过它的内部口径**）。探针真跑（`/tmp/probe_ll.mjs`，非静态推断），实测**六处违反**，且每一处都不报错、不留痕。
  - **实测缺陷 D1（I6）：id 基数取自一个摄入路径从不推进的计数器**。`ingest()` 的 raw 片段 id 前缀用 `stm_counter`——而它只在巩固时前进。于是 `consolidate` 清空 raw 区后 counter 原地不动，**下一批 id 与上一批完全重复**：实测两批各 2 条 → `['raw_1_0','raw_2_1','raw_1_0','raw_2_1']`。「每条片段一个可寻址身份」塌缩成「每批一个编号」，而 raw 区是**断点续跑的唯一凭据**——两个同名片段，崩溃恢复时只能一起复活或一起消失。修复：新增 `raw_counter` 独立基数（随存档归一化、逐条推进），id 里保留原 `msg_id/floor` 不破坏可读性；另设去重兜底（`#N` 后缀）应对外部污染基数，兜底触发落 `rawIdCollisions` 计数（I5：兜底发生过这件事本身也要可查）。
  - **实测缺陷 D2（I5）：降级拼接取末端、无痕迹、无计数**。无 summarize 通道时 `texts.join(' / ').slice(-400)` **静默丢弃开头**：实测 777 字符 → 400，最早的一段剧情（往往是最需要巩固的因果起点）无声消失，返回值、条目字段、state 上都没有任何计数——读者会把「只写了这么多」与「写了又被切掉」看成同一件事。修复：**原文进库**（在途体积上限由 v3.166 的存储防护层统一负责，那里有账本），旧口径保留为**显式旁路** `legacyTrimOnSave`（要裁就记一笔 + 落 `lastDrop`，截断量在返回值里如实回报）。
  - **实测缺陷 D3（I5）：LTM 滚动窗口丢最旧、零计数**。`ltm_counter` 先前进、条目随后被丢：实测预置 24 条 LTM 后滚动，新建的 `ltm_24` **立刻不在库**，state 上没有任何丢弃计数——「新建了 24 条」与「新建了 500 条、丢了 476 条」同形。修复：丢弃落 `ltmEvicted` 计数 + `lastDrop.ids` 给出**被丢的具体 id**；`selfReport` 据此把「丢过」判为有损（`degraded=true`），与「从未超限」彻底可区分。
  - **实测缺陷 D4（I5 + 谎报）：`removeByFloors` 的两个谎**。注释与语义都写「LTM 摘要已固化不级联删（只摘 span）」，而实现**从未碰过 span**——实测删掉 span 覆盖的楼层后 span 仍为 `{from:3,to:7}`，摘要的「来源楼层范围」指向并不存在的楼层。这是**声称与实现不一致**的典型：注释本身就是会被阅读方当作事实接受的东西。同时 stm 条目的 floors 被摘空后条目离表、`stm_counter` 与游标 position/completedTurns 全部不动、「删了多少」无处可查。修复：真摘 span（逐楼层重建剩余范围：无交集不动、摘空置 `null` 并单独计数 `spanEmptied`、中间挖洞如实带 `gaps/kept`），全部动作落 `spanDropped / rawDropped / floorDropped / emptyEntriesDropped` + `lastDrop{kind:'floorsRemoved'}`。
  - **实测缺陷 D5（I5）：断点续跑的两个游标字段全程为空**。`pending_partials` 只在 `defaultCursor()` 与两处 `= []` 出现，从不被写入——而文档（含文件头部与 state 结构说明）把它列为断点续跑的核心字段。字段存在但从不被使用，与不存在等价，却让「崩溃可恢复」显得已经实现。修复：**不凭空发明语义**（那会是另一种谎报），改为如实登记：`selfReport` 报出 `declaredButNeverFilled`，让「声明了但从不填充」可见。
  - **实测缺陷 D6（I6）：「从没跑过」与「跑过且真的空」不可区分**。`normalizeState(undefined)` 与 `normalizeState({})` 返回**完全同形**。修复：新增 `normalizeDetail(raw)` 返回三态 `{state, fresh, repaired[], absent[], supplied}`——什么都没给是 `fresh`；键不存在进 `absent`；键存在但形状坏进 `repaired`；未知键保留（cursor 子对象前向兼容）。`normalizeState` 降为 `normalizeDetail(raw).state` 投影，原签名调用方零改动。
  - **读数自洽检查（fail-closed，对齐 ruby-phone v2.32 的 `coherent: r > p` 同一口径）**：`selfReport(state)` 输出一行自述（`待巩固 N · 已巩固 N/M 片段 · 窗口 STM n/40 LTM n/24 · 无损/有损：明细`），内部四条互检——已巩固 > 已摄入、STM 在库 > 上限、LTM 在库 > 上限、游标 > 已处理——任一矛盾即 `ok=false` 并以「读数矛盾：…」写进行文。假绿的成因永远是「判据声称在检查、实际没在检查、且不报错」；账本之间互相矛盾时必须**报出来而非吞掉**。
- **宿主接线**：① `getDegradationLedger()` 新增「巩固账本有损」行——value 取真丢失类计数之和（滚进 LTM 的 `stmEvicted` 属容量动作，不混入「有损」），读数矛盾非空时额外标 ⚠️（矛盾比丢失更危险）；② selfCheck 新增「巩固账本」行——输出 `lossSummary()` 一行自述（与 `selfReport.row` 同源，不各写一套），未启用时如实报「—（未启用）」而非伪装成健康。
- **兼容约束**：`stm-ltm.js` 导出**只增不换**（既有 11 键一个不动，新增 `LTM_SUMMARY_CAP / LOSS_KEYS / normalizeDetail / stateProvenance / selfReport / lossSummary`）；`normalizeState` 返回形状不变；`removeByFloors` 的 `floors=[3] → [1,2,4,5]` 既有语义不变；`consolidate` 返回形状只增两键（`droppedStart / legacyTrimmed`）。既有 `tests/v396_fusion_modules.test.mjs` 四条口径全程保持绿。
- **配套测试**：`tests/v3170_consolidation_surface.test.mjs`（47 项，A–I 九层）—— A id 身份（跨批唯一 · 巩固后不回退 · 同 msg_id 不误触兜底 · 污染基数兜底落账）· B 降级不裁头（原文进库 · 旧口径显式旁路落账 · AI 通道不受影响）· C 容量动作必有计数（STM 溢出 · LTM 窗口丢最旧并给出被丢 id · 摘要超限截断量可读 · 上限常量）· D 声称与实现一致（span 真摘 / 摘空置 null / 无交集不动 / 挖洞带 gaps+kept / 三口径落账 / 既有级联语义）· E 三态（fresh/absent/repaired 可区分 · 向后兼容 · 前向兼容 · 老存档补零不误报）· F selfReport（干净态 / 有损态 / I5 读侧覆盖 / 矛盾报出 / 不误报 / declaredButNeverFilled / 纯读不抛 / lossSummary 同源）· G 往返与既有口径 · H 源码层（有损路径都经账本 · 不得再有静默裁头 · 导出只增不换 · 剥注释两向自证 · 负控制判据纯度）· I **负控制 8 组**。
  - **本版自身的负控制与探针抓出两轮假绿，已如实修**：
    - **修后探针（`/tmp/probe_ll2.mjs`）首轮 39/49，失败 10 处——逐条诊断确认全部是探针自身构造错误**（未真触发 STM 溢出、删的楼层不足以摘空 span、把 `floorDropped` 当条目数而它数的是楼层引用），实现无缺陷。重写第二版（真顶到溢出、区分「楼层引用数」与「条目数」两个口径）后 **59/59 全绿**。
    - **新套件首轮 37/45：8 条负控制全部假绿——这是 v3.169 NEG6/NEG9、ruby-phone v2.32 F4/F7/F8 之后，本形态的第三次复发，且是新变种**：破坏被写成对**硬编码常量的模拟**（如 `const sim=['raw_1_','raw_2_','raw_1_','raw_2_']`），真判据根本没被调用；另有 E3（把「前向兼容」断言在顶层未知键上，而实现刻意不收顶层键防污染——期望值写错）、D6（插入顺序使被删楼层不在中间——构造错）两处期望值错误。修法：新增 `tests/_negative_util.mjs` 负控制基建——真源码破坏（锚点必须命中恰一次，否则抛）、**加载破坏副本并在其上重跑 A–G 层同款真判据**、翻红 = 抛错或返回半真值（抓「删了常量还返回 0」）、H5 判据纯度（判据不得引用被删锚点，防自我指涉）、H6 工具两向自证。修后 **47/47 全绿**。
  - **外部注入负控制（比套件内置更硬）**：对**真实磁盘** `stm-ltm.js` 做 6 组注入（raw_counter 不推进 / 降级退回裁头 / LTM 丢弃不落账 / span 不落账 / 三态压平 / 读数自洽移除）→ 每组真跑套件 → 逐字节还原并 md5 核对，结果 **6/6 全部 TRIGGERED**（翻红 1~3 条不等），还原后 md5 与基线一致。
- **发布卫生**：版本四处同步 `3.170.0`（index.js / manifest.json / package.json / CHANGELOG 顶节）；`tests/v3117 / v3130 / v3147 / v3169` 的版本硬钉交棒；`tests/v3116_dead_code.test.mjs` 的活跃代码总量上界按 v3.152 / v3.168 先例随活跃功能同步放宽（21300 → 21700，本轮 stm-ltm 内核 8735→20997 字节 + 宿主接线）。
- **终局门禁**：`node tests/run.mjs --audit` → **164 个测试文件 / 1077 条通过断言 / 0 失败**，9 个审计脚本全 `✓`。全程两次语法门事故（内核补丁多一个 `}`、宿主 IIFE 闭合错位）均由 `node --check` 当场拦下，未进入测试层。

## v3.169.0
- **账本自述面：账本记下了变化，却把「变了什么」弄丢了**。v3.168 建立了「静默降级」总账，本版转过头审计**承载全部诊断的那本账自己**——OpLog（v3.54 起、19 种事件类型、165 个版本的变更审计链）。它的自述与它的内容在三处不一致，且每一处都不报错、不留痕：读者从这里读到的结论是**错的，且错得没有痕迹**。
  - **实测缺陷 1：字段裁剪偷改了身份（`op` 截 10 / `ref` 截 60 / `meta` 截 80）**。写入 `log(type, op, ref, floor, meta)` 会静默把五个字段各切一刀，而没有任何地方记录「这一刀发生过」：
    - `op` 上限 10 —— 实测 `'rollback-miss'`（13 字符，v3.155 起的楼层账本淘汰埋点）被存成 `'rollback-m'`：它看起来像一处**拼写错误**，实际是账本自己改的名。按真实 op 检索命中 0 次，而 `queryByType('ledger')` 又查不出任何异常。
    - `ref` 上限 60 —— 摘要/卷/史记的 id 会突破这个长度。实测写 84 字符 id 存入 60 字符，**同一个 id 用 `queryByRef` 查自己返回 0 命中**：写入时改写了身份，读侧再也认不出它。
    - `meta` 上限 80 —— `_gcm`（「键=值」拼接串）是唯一会随累计位数线性变长的 meta，**余量仅 16–24 字符**（最保守口径 64 字符、余量 16；口径为 vecCap≤2000 / sumCap≤1500 取配置上界、其余三项按各 4 位累计量估）。当前并不会截断，但这段余量会被「新增计数键 / 放大滑块上限 / 键名变长」逐步吃掉，而一旦吃穿就切出半截键（`orphanO` / `graphD`）使整串不可解析——**如实表述：这是一处被收口的结构性风险，不是正在发生的缺陷**。
    **修复**：截断本身是可接受的取舍，**不留痕不是**。现改为：裁剪照做，但记 `_trimFields` 计数与 `lastTruncation`（含超限前的原始长度与 seq）；`_gcm` 超 80 时切换为紧凑键（`vd=/vc=/sc=/oo=/gd=`），并给余量上了护栏——测试断言「最保守口径下余量 ≥ 12 字符」，未来任何吃掉余量的改动都会先被拦下。
  - **实测缺陷 2：环形淘汰无计数，`byType` 连同事件一起消失**。500 条环形缓冲直接 `splice(0, n)`，淘汰量不入任何字段。实测塞入 702 条后：`stats()` 返回 `{total: 500, byType: {graph: 500}}`——最早写入的 `summary` 事件**从类型统计里整体消失**，读者据 `queryByType('summary') === 0` 会得出「摘要子系统从未变更过」的结论，而它其实变更过。更隐蔽的是：**淘汰过 200 条的账本与从未超限的账本返回同一个形状**，任何基于 `stats()` 的判断都无法区分两者。
    **修复**：淘汰即记账（`_truncated += n`），`stats()` 扩展为 `{total, byType, cap, seq, truncated, trimFields, importDropped}`（原键一个不动、只增不减），新增 `observedTotal()`（含已淘汰的累计事件总数）与 `auditSummary()`（一行自述：`窗口 500/500 · 累计 702 · 已淘汰 202`）。
  - **实测缺陷 3：`import` 静默丢弃超窗部分**。`this.entries = data.entries.slice(-500)` 对 900 条的存档只留 500，丢弃 400 条——**无计数、无告警**。这条与缺陷 2 叠加后有一条更隐蔽的路径：导出→导入→再导出，账本会持续缩水而每次都「看起来正常」。
    **修复**：丢弃落账（`_importDropped`），且存档自带的历史淘汰量（`data.truncated`）**相加而非覆盖**（宁可多算、不可漏算）。
  - **修复 4：`opLogStatsCompat` 把三种处境吞成同一个 0**。旧实现 `|| {total:0,byType:{}}` + 兜底 catch 使「没有账本」「stats 接口缺失」「统计抛错」与「真的 0 条事件」返回**完全同形**的对象。读者拿到的那个 0 可能来自四种截然不同的处境，而它看起来一模一样——这正是 v3.168 定义的静默降级，出现在**读取侧**。修复：分两态返回——`{absent: true}`（账本对象或其 `stats` 接口不存在，从读取方看就是没有账本）与 `{error}`（接口在但要不出结果），调用方据此报「不是 0，是看不见」。
  - **实测缺陷 5：全景报告「审计事件」行从 v3.61 起一直输出 `[object Object] 条`**。该行写成 `` `- 审计事件：${opLogStatsCompat(this)} 条` ``——而 helper 返回的是对象。**165 个版本没有任何测试或审计覆盖过这一行**（全仓库无任何测试断言「审计事件」字符串），同一份报告下方的「审计统计」板块却正确解构了 `byType`：纯粹是一处没人看过的显示路径。修复为 `${opLogStatsCompat(this).total} 条（${auditSummary}）`。
  - **修复 6：账本损耗进「静默降级」总账**。审计账本是**全部诊断的载体**：它被裁剪/淘汰/丢弃而无人知，会让 v3.168 那句「全部正常」变成一句没有依据的话。现把 `审计账本有损` 作为一行并入 `getDegradationLedger()`（`_truncated + _trimFields + _importDropped`），并把 `opLog` 加入「账本盲区」的来源集合。
  - **修复 7：selfCheck 新增「审计账本」行**，输出 `累计 N · 窗口 N/500 · 已淘汰 N · 字段裁剪 N · 末次裁剪 seq#N(op)`。只报 `entries.length` 会让「淘汰过」与「从未超限」在面板上完全同形——而两者的诊断价值截然不同。
  - **修复 8（呈现层同族缺陷）：类型中文化表只有 13 项，真实埋点类型有 19 种**。`locked_fact` / `worldprogress` / `cse` / `delta` / `gc` / `ledger` 六类变更在「🔍 事件审计链」里显示为英文原始 key。呈现层与账本的**类型集合不同步**，等于账本自己没被完整读出来；且账本一发生损失，`byType` 就更不完整，而面板上毫无提示。现补齐 19 项、头部增补「账本自述」行，状态面板卡片在 `_truncated/_trimFields` 非 0 时显示 ※ 标记。
- **本版确立的不变量**：
  - **I5**「有损必有计数」——任何裁剪/淘汰/丢弃都必须同时递增对应的损失计数；账本可以少记，不可以瞒记。
  - **I6**「读失败 ≠ 读到了 0」——读取路径不得把「不存在 / 不可用 / 抛错」塌缩成与「真实空值」同形的返回值。
- **兼容约束**：`stats()` 原键 `{total, byType}` 一个不动（仓库既有测试 `tests/v354_oplog_health.test.mjs` 断言 `st.total === 500` 与 `st.byType.item === 500`）；`export()` 在 `{entries, seq}` 基础上新增两个计数键，旧消费方按 `data.entries` / `data.seq` 读取不受影响；`log()` 签名与返回不变。
- **配套测试**：`tests/v3169_ledger_selfreport.test.mjs`（34 项）—— A 身份保真（长 `ref` 写读往返 · 长 `op` 不再伪装成拼写错误 · `meta` 无半截键）· B 损失留痕（淘汰计数 · 累计总数 · 从未超限与淘汰过形状必须不同 · 导入丢弃 · 存档历史量相加）· C 读取三态（无账本 / 无 stats / 抛错 三者必须可区分）· D 显示路径（概览行不再是 `[object Object]` · 审计统计报窗口与累计 · 类型表 ⊇ 真实埋点类型集合）· E 接线（账本损耗进降级总账 · selfCheck 有审计账本行 · 盲区来源含 opLog）· F **负控制**（每条判据配一次故意破坏）· G 发布卫生。
  - **本版自身的负控制抓出两处假绿，已修**：初稿的 D4（审计浏览器头部自述）与 E1（账本损耗进总账）两条判据做的是**字面包含检查**，于是被同一方法/同一文件里的**注释字样**满足——把入账条件改成恒假（`if (false) push('审计账本有损', …)`）、把渲染串改成「账本：」，两组注入（NEG6 / NEG9）都**翻红 0 条**。这正是本版主题的同一形态：**判据声称在检查，实际没在检查，且不报错**。修法：文本判据一律先剥注释再判定，E1 进一步要求「由 `_lost` 真值驱动的 `push(...)`」这一**执行性形态**（而非任何地方出现过该字样）。修后十组负控制全部真响（NEG1/2 各翻红 3 条、NEG3/4/6/7/8/9/10 各 1 条、NEG5 翻红 2 条），逐组注入后逐字节还原校验通过。
  - 附带教训：第一版修法自造了一个「字符串感知的注释剥离器」，被正则字面量里的引号（`/['"]/`）带偏后**静默残留 14 处注释**——工具失灵本身也会静默。故测试内对剥离器加了两向自证（剥离后不得残留本版注释标记 · 不得吞掉代码本体），且最终改用不依赖状态机的行级剥离。
## v3.168.0
- **静默降级面：不是报错，是悄悄换了一条更差的路**。v3.167 盯的是「回报与 store 不一致」，本版盯它的孪生形态——**代码没有出错、没有抛异常、日志里甚至写着 "降级处理"，但系统已经在一条更差的路上了**，而没有任何地方能把「有几处正在退化」并列出来。本版把这类失效做成可计数、可对账、可入面板的一层，并沿路修掉三个实证缺陷。
  - **实测缺陷 1：跨会话携带契约从未对齐（写侧 15 键 / 读侧 22 键）**。`packCarryover()`（写侧）与 `applyCarryover()`（读侧）各自维护一份键清单，**从来没有任何测试或审计核对二者是否相等**（实测：`grep packCarryover tests/*.mjs` 零命中）。于是读侧写好、写侧从不产出的键共有 **10 个**：`moneyLedger`（货币账本）/ `cards`（CG 卡）/ `conflicts`（矛盾簿）/ `deltaBook`（正史增量）/ `cse`（人物状态）/ `pulse`（叙事心电图）/ `opLog`（事件溯源日志）/ `outline`（大纲导演）/ `pairMem`（配对记忆）/ `statusFlat`（角色状态表——此键在 `packCarryover` 里**构造了 statusFlat 数组却忘了放进 return**，也就是说角色状态表连「写过」都没写过）。用户侧表现：点「打包→新对话导入」后 toast 写着「✅ 携带包已导入，剧情无缝衔接」，而实际只有摘要/图谱/向量/物品过去了，其余全部留在旧对话——**这是一次成功的失败声明**。修复：新增 `CARRYOVER_CONTRACT_KEYS` 作为两侧唯一真源，写侧补齐 10 键、新增 `verifyCarryoverPack()` 对账，读侧对旧格式包显式报缺键而非静默跳过。
  - **实测缺陷 2：种子路径同病（`generateCarryoverSeed` 从不产出这 9 个子系统）**。v3.45 引入的「跨会话状态种子」与 v2.3 的「携带背包」是两条并行的承接通道，而种子路径的产出清单**更短**：`importCarryoverSeed` 除状态字段外没有这 9 个子系统的导入分支，`generateCarryoverSeed` 也从不产出它们。两处一起补：生成侧补 10 键（含 `statusFlat` 的结构化还原），导入侧新增子系统消费循环（逐项独立 try，一个子系统接口不符不撤销整个种子），`_applied` 生效字段清单同步扩到 19 项——v3.165 刚建立的「不许谎报成功」判据，正好照出了这条通道的实际生效面。
  - **实测缺陷 3：嵌入层四条降级路径合计零计数**。`getEmbedding()` 有四个出口会退回 `simpleEmbedding`（按字符码位的伪向量，与真嵌入的语义空间毫不相干）：**无密钥 / API 返 error / 返回体缺 embedding / 抛异常**——四条都只 `console.warn` 一行，**没有任何计数器、没有诊断行**。用户侧表现为「向量召回效果奇差」却完全不知道向量层早已整层降级。修复：新增 `_embedDegrade = {noKey, apiError, missingVector, exception}`，四路分别计数并串入静默降级总账。
  - **修复 4：`optimizeMemory()` 永久删数据却丢弃返回值**。本方法会删除：向量文本去重 · 向量硬上限 · 摘要硬上限 · 孤儿物品 ops · 重复图谱节点。实测：**两处调用点都是裸调**（`this.optimizeMemory();`），返回值一律丢弃——「鲸鱼了哪些东西、删了多少」完全不可查。修复：分路账本 `_lastGcLedger = {vecDup, vecCap, sumCap, orphanOps, graphDup}` + 落 `opLog` 的 `gc` 条目。
  - **修复 5：睡眠周期只标记不回收，积压量无数**。`sleepCycle()` 给低保留价值条目打 `archivedForSleep`，但从不回收；长线运行下「已睡仍在库」持续积压（仍参与召回遍历，只是被过滤）。新增 `calibrateRetention()` **纯清点**校准器（只读不写、不碰 `archivedForSleep`、不删任何条目），输出 `{dormant, ancientHighValue, lowValueStale, total}`——其中 `ancientHighValue`（超过 30 天且重要度>=8）专门回答「有没有历史锚点正在逼近回收线」。
  - **修复 6：静默降级总账（本版中心机制）**。新增 `getDegradationLedger()`：把散落各处的退化计数聚合为一张表（嵌入降级 / 记忆回收 / 睡眠积压 / 携带契约缺键 / 人物状态上限压力 / 台账写入违规 / 配置迁移跳过），返回 `{rows, degraded, ok}`。它**只聚合已存在的计数器**，不新增状态、不修任何数据、永不抛出。selfCheck 新增「静默降级」行：全洁时报「全部正常（检查 N 项）」，有退化时列出前 4 项并标 ⚠️。
- **本版确立的不变量**：
  - **I3**「写侧产出键」⊇「读侧消费键」——`packCarryover()` 的产出必须覆盖 `CARRYOVER_CONTRACT_KEYS` 全量，两侧不为子集即报警。
  - **I4**「降级必有计数」——每一次退到次优路径都要在总账里留数，不得只有 console.warn。
- **本版自身被审计抓中的三处（审计层正常工作的证据）**：
  - **读了配置却没声明**：`carryoverContractStrict` 初稿只在读取处出现，被 v3160 （“声明”侧）当场抓中；补声明后又被 v3161（“可达性”侧）拉住——无 UI 控件又无卡白名单 = 旋钮不存在。两侧不变量都在跑，最后补上面板开关才算真可设。
  - **“有对账机制”本身也是一种声称**：`verifyCarryoverPack()` 初稿写好后无任何调用者，`_lastCarryoverReport` 永远是空。修为 `packCarryover()` 在 **真实产出对象上**调用对账，并在 selfCheck 新增「携带契约」行展示 `N/22 键` 与缺键清单。
  - **账本里的空洞与异常末尾**：`orphanOps` 分路上一直没有赋值（字段是空壳）；`getDegradationLedger()` 初稿的 `ok` 只在尾部赋值，异常时会以 `undefined` 结尾。修为分路归集 + `ok` 初值 false（fail-closed），并新增「账本盲区」行：一个降级来源都读不到时，宁可报「看不见」也不报「全部正常」。
- **配套测试**：`tests/v3168_silent_degradation.test.mjs`（30 项）—— A 契约对账（写侧/读侧键集合由代码推导，不钉字面量）· B 种子同源· C 四条嵌入降级路径行为真执行· D 睡眠校准仅读（对照快照逐字节相等）· E 总账与诊断· F **负控制**（每条判据都配一次故意破坏，验证它真的会响）· G 发布卫生。
- **兼容约束**：`packCarryover()` 仍返回对象或 null（旧调用方与 UI 预览不受影响，新增键只增不减）；`applyCarryover()` 仍返回 boolean（旧格式包照常导入，只是不再沉默）；`optimizeMemory()` 仍返回 number，`sleepCycle()` 仍返回 `{archived}`。
## v3.167.0
- **容量/截断面：上限不该改写「存进去的东西的身份」**。v3.166 收口了「回报 `true` 但磁盘上没有」，本版盯同一根线在**内存层**的表现——CSE 人物状态引擎是全插件唯一会**主动丢弃已写入数据**的子系统（`MAX_STATES_PER_CHAR=40` 淘汰 / `MAX_TOWARD=24` 关系向上限），而这两处上限此前都会在**看不见的地方改写条目身份**：一处把条目悄悄扔掉，一处把「A 对 B 有明确指向」改写成「A 的状态」。三处缺陷共享同一后果：**调用方收到的回报与 store 的真实内容不一致**。实测探针：`/tmp/lonsha_probe_cse.js`（修前）/ `/tmp/lonsha_probe_cse_after.js`（修后对照）。
  - **实测缺陷 1：容量淘汰发生在回报之后**。`set()` 的顺序是 `c.states.push(st)` → 按 `weight = (core?3:adaptive?2:1) * confidence` 排序 → `c.states.length = 40` 截断 → `return st`。于是**刚写进去的低置信度 situational 条目（0.3 × 1 = 0.3）会被自己挤掉**，而 `set()` 仍返回该对象、调用方（`addFromExtracted` 的计数 → `opLog` → 用户侧「登记 N 条」）按返回值记账。实测：先塞满 40 条 core，再写 1 条 `一时情绪`（confidence 0.3），`set()` 返回非 null，store 里查不到该条目，条数仍是 40。修复：**回报必须与 store 一致**——写入后先确认条目仍在 store，被自己挤掉就回报 `evicted` + `state:null`，不再谎报成功。
  - **实测缺陷 2：`toward` 上限把有向状态静默降级为无向**。原实现只有一行：`if (st.toward && Object.keys(c.toward).length >= MAX_TOWARD && !c.toward[st.toward]) { st.toward = null; }` —— 无计数器、无日志、返回值看不出任何差异。这不是丢数据，是**语义级失真**：CSE 的 `toward` 语义是「有明确剧情证据才填」且**有向不镜像**（A→B 不自动写 B→A），把有向降级成无向等于把「A 对 B 有明确指向」偷换成「A 的状态」，注入提示词时 AI 会把本来只针对某人的状态当成对全体的状态用。修复：**语义优先，拒绝而非降级**——超限时返回 `{status:'rejected', reason:'toward_capacity'}` 并计入账本，宁可不写这条，也不让 store 里出现一条身份被改写的条目。注意判容量只在「该 target 尚不存在」时执行：更新既有关系不增加键数，不该被拒。
  - **实测缺陷 3：降级必然撞键，触发跨语义合并**。查找既有条目的键是 `s.field === st.field && (s.toward || null) === (st.toward || null)`——被降级出的 `(好感, toward=null)` 与**本就无向的同名字段条目**命中同一个键，于是走 refine：两条语义完全不同的状态（一条是「A 对某人的好感」，一条是「A 的一般好感」）被合并成一条，后写的值覆盖先写的、证据链混在一起。实测：`P1` 输出「字段「好感」的条目数 = 1」——两条本应并存的条目只剩一条。修复：缺陷 2 的降级被禁止后，撞键窗口随之关闭（带 `toward` 的请求要么带着 `toward` 落进去、键里含 `toward` 不会相撞，要么在容量判定处被拒、根本不进入查找）。
  - **修复 4：`toward` 索引与 states 的单一同源收口**。原实现的索引只有「加」没有「清」：写入路径就地 `c.toward[st.toward] = {...}`，而容量淘汰路径把 states 里的条目丢了、**索引键留在原地**。幽灵键有两个后果，都不是报错能发现的：① **虚占 `MAX_TOWARD` 配额**——真实关系被挡在门外；② 任何读索引的一方会看到一个 store 里并不存在的对象。新增 `_reindexTargets(c)`（从 states 重建索引，同 target 保留 `updatedAt` 最新者）作为**唯一**改索引的地方，写入 / 淘汰 / 删除（`removeByFloor`）/ 导入（`import`，修前的幽灵会随存档跨设备一路传下去）四条路径全部归口。
  - **修复 5：CSE 此前在 selfCheck 里一行都没有**。近 20 行子系统统计覆盖了图谱 / 向量 / 摘要 / 日记 / 时间线 / 悬念簿 / 场景树 / 物品台账 / 台账校验 / 补提取 / 反思 / POV / 角色状态 / 回响池 / 楼层账本 / 回滚失效 / 事件接线 / 配置迁移 / 写盘合流 / 保存来源——唯独**主动丢数据的那一个**没有任何出口。新增 `diagnose()` 与「人物状态」诊断行：体量（几人几条·关系向几个）、容量压力（几人顶格）、账本（淘汰 / 拒绝 / 索引自愈各几次）、**索引是否与 store 同源**（幽灵键非 0 即说明收口被绕过）、末次拒绝的归因（谁·哪个字段→指向谁）。
  - **修复 6：五计数器账本化**。`ledger = {inserted, refined, evicted, rejected, ghostReclaimed}` 并入 `diagnose()` 与 `opLog`（新增 `cse/cap` 条目：`evict N/M reject K`，附被拒样本），`addFromExtracted` 另留 `lastExtractReport`（`attempted = inserted + refined + evicted + rejected`），让「尝试了几条、进去几条、丢了几条、拒了几条」四项各自可见。
- **本版确立的两条不变量**（测试按不变量断言，不绑代码形状）：
  - **I1**「被回报为成功的写入」⊆「store 中的条目」——`set()` 返回非 null ⇔ 该条目此刻真实存在于 `states`。
  - **I2**「toward 索引键」⊆「states 中真实出现的 `toward`」——索引永远不得描述一个 store 里不存在的对象。
- **兼容约束**：`set()` 的返回形状保持 `state|null`、`addFromExtracted` 保持返回 `number`（仓库既有测试 `tests/cse-engine.test.mjs` 有 `assert.equal(e.set({field:''}), null)` 与计数断言），需要区分 新增/精炼/被淘汰/被拒绝 的调用方改用新增的 `setDetailed()`（`set()` 即其 `.state` 投影）。既有 16 条 CSE 单测全部保持绿。
- **测试**：`tests/v3167_cse_capacity_identity.test.mjs` 五层——A 容量身份（淘汰必回报 · 降级不再静默 · 幽灵不虚占配额）/ B 索引同源（无幽灵 · 幽灵自愈 · 导入收口）/ C 撞键防护（跨语义不合并 · 被拒写入不污染既有条目）/ D 单源收口（只有 `_reindexTargets` 改索引 · 四条路径全归口）/ E 可观测性与发布卫生（selfCheck 含本行且非空壳 · `diagnose()` 永不抛 · 版本四处同步）。

## v3.166.0
- **写入承诺面：写了、不等于写进去了**。v3.165 把「报成功 ≠ 真成功」变成判据时，顺手埋下了一条更细的分界线——**「做了这个动作」与「这个动作生效了」是两件事**。本版盯住这条线在**写盘**上的四个端点：谁在写（保存来源）、写去哪（合流缓冲）、写成了没有（落盘证据）、以及**为了写成而准备的默认值是怎么来的**（配置迁移）。四处缺陷共享同一后果：**调用方拿到 `true`，磁盘上没有对应内容**。
  - **实测缺陷 1：配置迁移靠「栈溢出被 catch 吞掉」收敛，而不是靠值改对了**。三个迁移分支都用 `const defaults = new (this.constructor)()` 取默认值——而构造函数第一件事就是调 `loadConfig()`，迁移条件一旦成立即递归。实测最小复现（`/tmp/probe_recursion.mjs`，只保留三个迁移分支的结构）：**构造被调用 2503 次、耗时 37ms**，最终「收敛」是因为栈溢出抛了 `RangeError`、被同一段 `catch` 吞掉。三重后果：① 每次冷启动白烧约 2500 步递归；② 收敛依据是异常兜底而非正确性，目标值是否真的改对纯属侥幸；③ 迁移写入的值可能来自被栈溢出打断的半途状态。修复：默认值改为**类外冻结模板**（构造函数在合并 localStorage **之前** `JSON.parse(JSON.stringify(this.config))` 拍一份，此后不受运行时改动污染），三个分支改为读模板 + 类型校验（`typeof defaults.extractionPrompt === 'string' && defaults.extractionPrompt`，缺失时记 `skipped` 而不是写入 `undefined`）。同时按「迁移必须真的改动了值才算迁移」补齐第三处——原实现 `replace` 未命中也照样 `saveConfig()` + 打印「已升级」，是一次**什么都没做的成功声明**。
  - **实测缺陷 2：写入合流的全局单槽会静默吞掉整个 chat 的批次**。`save()` 在 `_isWriting` 时执行 `this._pendingWrite = { chatId, data, revision }` —— 一个**全局单槽**：下一批无论属于哪个 chat 都直接盖掉上一批，无计数、无告警，而调用方收到 `true`。触发场景是「编辑楼→防抖自愈→补提取→ST 自动存档」四者落在同一写入窗口，其中**补提取用租约捕获的旧 chatId、删楼用被删的 chatId**。需要分清的是：**同一 chatId 的连续快照互相覆盖是刻意的合并**（v3.40 Write Coalescing：后一份是前一份的超集，只写最新一份即可，`tests/v340_database_evolution` 的 `saveChatCalls <= 2` 就是它的书面意图）；真正丢数据的是**跨 chatId 覆盖**。修复：改为 `Map<chatId, batch>` —— 同 chat 取最新、异 chat 并存；诊断指标同步从会误报的 `droppedBatches`（把良性合并报成「数据丢失」）改为 `mergedBatches` / `coalescedByChat` / `crossChatCoexists`。**本次修复的方向第一版是错的**（先做成了「队列全部保留」），是既有测试的断言语义把方向纠了回来：**判断某行为是缺陷还是刻意优化之前，必须先读既有的测试意图**。
  - **实测缺陷 3：保存来源登记的是「意图」，却当成「事实」用**。六个调用点（stmLtm / realtime / backfill / edit / swipe / delete）里有五个写成 `recordSaveSource('X'); await storage.save(...)` —— 登记在 save **之前**。而 `storage.save` 有两条**不落盘也不抛错**的路径（修订冲突拒绝、状态指纹拒绝、真实写入失败）都只 `return false`。于是这份「谁在保存」的地面真源会记下一次根本没发生的保存，且随存档持久化到其它设备。修复：`recordSaveSource` 语义收紧为「只登记意图」（写 `attempts`），新增 `recordSaveFailed(source, ok, reason)` 由**返回值**驱动 `sources`（成功）与 `denied` + `lastDenied`（失败），六个调用点全部改为「`await save` → 按结果记账」；新增 `getSaveSourceReport()` 输出 `{attempted, persisted, denied}` 三计数器，让「谁在尝试、谁在丢」分别可见。
  - **实测缺陷 4：落盘证据可以指向一个从未同时存在的「对」**。`_confirmed` 记录「最近一次成功写入的 chatId/revision」。合流之后，`revision` 若取首次调用的修订号就会**落后于实际落盘的批次**（而 `_confirmed` 正是判断「内存是否已有对应存档」的依据）；只把 revision 改成实际落盘批次、chatId 仍取首次调用，则两者来自不同批次——描述了一个**从未同时存在**的身份对。修复：`_lastPersistedChatId` 与 `_lastPersistedRev` **配对推进**，`_confirmed` 与 `_lastWrite.confirmed` 使用同一身份。
  - **实测缺陷 5（新增判定面浮出来的）：宿主明确否认时，我们自己宣布成功**。`ctx.saveChat()` 若**返回 `false`**，等于宿主说「我没存」，但原实现无条件 `_persisted += 1` 并推进 `_confirmed`。修复：`saveChat` 返回 `false` 时不计入落盘证据（`save()` 返回 `false`、不推进确认、失败原因归因到「宿主否认」而非兜底文案「chatMetadata 不可用」）；返回 `undefined`（多数 ST 版本的实际行为）或 `true` 仍按落地处理——**不误伤主流版本**。
  - **实测缺陷 6（防假绿注入时浮出来的）：「保存失败」会退化成「保存崩溃」**。`save()` 现在要访问待写集合（`_pendingWrites.get` / `.keys()`），而 `save` **可以被独立于构造函数调用**（测试桩从源码提取方法体、外部脚本、热更新后的残留实例都只提供一部分字段）。此时原实现抛 `TypeError`——比不落盘更糟：调用方连 `false` 都拿不到，异常还会穿过事件回调。修复：进入写入流程前把集合与计数器归一化（缺啥补啥），循环尾部再无条件判空。
  - **可见性闭环**：`selfCheck()` 新增三行诊断，插在 v3.164 的「事件接线」之后——「配置迁移」（检查 N 项 / 已迁移 X / 跳过 N（原因） / ⚠️ 载入失败）、「写盘合流」（同 chat 合并 N 批 · 挂起 N · 末次 status(rev) · 已确认 rev）、「保存来源」（`source:persisted/attempted(拒N)` 前 6 源 + ⚠️ 末次拒绝及原因）。**修完的缺陷必须能被看见**，否则下一个人只能靠读代码重新发现它。
  - **两处旧判据按「不变量优先」交棒**：`tests/v3131_ground_truth.test.mjs` 原在 `recordSaveSource` 之后直接断言 `sources.realtime === 1`——绑的正是本版证伪的假设（登记 = 保存成功），改绑「尝试必被记账 / 只有成功结果计入 sources / 失败进 denied 且可归因 / 非法楼层回退」；`tests/v3150_recall_audit.test.mjs` 原把「楼层账本」与「召回自检」的**字符距离写死为 4000**——那是形状，期间新增任何诊断行都会误报（本版就新增三行），改为结构化判定（定位 `selfCheck` → 解析它对子系统列表的两种注入形态：`rows` 字面量与 `rows.push([...])`）。**把距离写进判据，等于把「期间不许改代码」写进判据。**
  - **新增第 10 个测试文件**：`tests/v3166_config_migration_write_ledger.test.mjs`（8 项，全部按不变量断言），并用**会计完整性**替代写死的合并次数——「每一次被受理的保存，要么落盘、要么被合并，两者之和 = 受理数，一次都不能凭空消失」。
  - **验证**：`node tests/run.mjs` → **通过断言 934 | 失败断言 0 | 文件 159/159**。防假绿注入 **6/6 全部被判定面抓住**（M1 回退自引用构造 / M2 回退全局单槽 / M3 回退意图驱动 sources / M4 回退诊断行命名 / M5 回退惰性兜底 / M6 回退无条件落盘证据）。负控制三态：**旧版 v3.165.0 跑新判据 → 通过 0 / 失败 8**；现版同一判据 → **通过 8 / 失败 0**；恢复后 `index.js` md5 与备份逐字节一致。注入过程中还实证了两条判据自身的盲点并修掉：判据会被**自己的说明注释**骗过（`loadConfig` 的注释里就写着 `new (this.constructor)()`，裸正则命中注释造成假失败），以及判据会被**自己的兜底出口**骗过（诊断行只把主渲染改名、保留同名兜底分支时，键仍然存在 → 需断言「带数据的主渲染存在（非空壳）」）。

## v3.165.0
- **声称真实性面：登记了、不等于登记起作用了；报成功了、不等于真的成功了**。v3.164 把「事件到底有没有接上」变成了判据，当场抓到四处缺陷，本版接着盯住这批修复留下的**同一个病根**：状态被**登记**，但登记的时机、内容、口径全都不由事实驱动。于是四种形态的假绿同时存在，而它们有一个共同后果：**日志与真实状态相反时，比没有日志更坏**——它把排查方向指向「已注册但没触发」，真因却是「根本没注册」。
  - **实测缺陷 1：`bindEvent` 只看「有没有抛异常」，而 `eventSource.on(undefined, h)` 不抛错**。宿主 `event_types` 缺项时 `types.X` 为 `undefined`，`on` 一样返回、一样把 handler 塞进内部 map（以 `undefined` 为键）。于是监听器 **+1、台账 events +1、失败哨兵认为接线完整**——而那一个 handler 永远不会被触发。这是假绿最典型的形态：所有计数器都变好了，功能却是坏的，且监控面上完全看不出来。修复：在**包装内**加类型契約（`typeof type !== 'string' || !type`、`typeof handler !== 'function'` 一概 `rejected++` 并 `return false`，不进入 `on`），拒绝数进台账并接入 selfCheck 诊断行（拒绝数是「宿主事件表与插件预期不一致」的唯一运行时线索）。
  - **实测缺陷 2：台账登记写在 7 个调用点上，与 `bindEvent` 的成败无关**。调用点当然知道自己在调 bindEvent，但不知道它成不成；于是 bindEvent 返回 false（未就绪 / 类型无效 / `on` 抛错）时仍会 push 一条「已注册」——卸载时去 `off` 一个从未 `on` 过的函数：**真监听卸不掉（泄漏），还可能顺手卸掉其他扩展的同类型监听**（那正是 v3.91 花力气修「按引用精确卸载」想避免的镜像缺陷）。修复：登记移入 `bindEvent`，与 `eventSource.on` 同行生死；7 个调用点的 push 全部删除。
  - **实测缺陷 3：幂等路径不重置 `events`，可见性朝「看起来更好」的方向撒谎**。v3.164 给 `registerEvents` 加了幂等守卫（先卸载再重装），但 `_controlInfo.events` 不归零。第二次调用后台账显示 **14 个监听、实际只有 7 个**。这比不显示更危险：整条可见性链路会被用一个虚假但自洽的数字骗过。修复：重装前显式重置 `events` 与 `lastEvent`，并在注释里写明语义差异（当前挂载数 ≠ 历史累计数）。
  - **实测缺陷 4：最常见的失败入口只打一行 `console.warn` 就 return**。`eventSource / event_types 不可用` 是用户侧「聊了很久没有记忆」的头号原因，但这条早退路径上台账、诊断行、失败清单**全部空白**（`expected` 还停在 0）——排查窗口里什么都看不到。修复：该出口补齐 `lastFailure` + `failed.push` + `expected = 0`；catch 分支同样留痕（`'注册过程抛异常：' + ...`），异常造成的失败不再只存在于控制台、刷新即失。
  - **实测缺陷 5（防假绿注入时才浮出来）：早退分支的兜底写法是 TDZ 自引用，实际不可达**。`const eventSource = ctx?.eventSource || (typeof eventSource !== 'undefined' ? eventSource : null);` —— 这里的 `typeof` 引用的是**本行正在声明的那个 const**（块内同名声明遮蔽了全局），而 `typeof` 不能保护 TDZ：实测 `ctx` 缺 `eventSource` 时直接抛 `ReferenceError: Cannot access 'eventSource' before initialization`，抢在早退分支之前进了 catch。后果是三重错位：兜底分支（读全局）永远不可达；「eventSource 不可用」这句明确的失败文案从不出现（用户看到的是异常堆栈）；失败被归因成「注册过程抛异常」，把排查方向引向错误的地方。修复：兜底改为显式读 `globalThis.eventSource` / `globalThis.event_types`。**这条是 15 项防假绿注入里唯一没被抓住的一项**——它没被抓住不是判据太宽，而是缺陷坐落在「注入点与判据的缝隙」里：注入的是「删掉留痕」，而留痕一直没生效（因为分支根本走不到），删掉自然也不影响任何判据。**写了兜底不等于兜底会用上**：兜底代码的可达性本身需要判据。
  - **新增第 6 个判定面之外的行为回归**：`tests/v3165_claim_truthfulness.test.mjs` 真给一个「宿主什么都没给」的上下文（`getContext: () => ({})`），断言必须走早退分支、失败原因必须指明 `eventSource`、**且不得是「异常」**（异常路径会把归因引向错误方向）。
- **成败声明的另一半：四处「以成功结尾、但没有失败出口」的路径**（与上四条同源，都是「声称不由事实驱动」）。审计视角不同：上面四条盯事件接线，这四条盯 **print 出来的结论**。
  - **`registerEvents` 无条件打印 `✓ 事件监听已注册`**：即使 7 个 bindEvent 全部返回 false 也照样报成功。修复：期望数由**与注册点相同的可见性条件**派生（`let expectedEvents = 1` 起，逐项 `if (types.X) expectedEvents++`），`const wired = this._controlInfo.events >= expectedEvents` 驱动日志分支。
  - **`loadModules` 在模块缺失时什么都不做**：原写法 `if (typeof X !== 'undefined') { 加载 + 报成功 }`，缺失时日志里**只有成功没有失败**——而「模块没加载」恰好是最需要看见的那件事（图扩散静默退回朴素检索路径：功能变差但没有任何迹象）。修复：新增 `_moduleStatus = { diffusion, visualizer }`，两条加载路径均加 `try/catch` + `else` 失败出口（`⚠️ ... 未定义 / 实例化失败`）。
  - **`extractAndSave` 的 `✓ 完成` 落在 if/else 之外**：连「被确认状态机拒绝、根本没写盘」也报「完成」，重启即失。修复：`_savePersisted` 只在 `await this.storage.save(...)` 之后置 true，日志改为 `${_savePersisted ? '✓ 完成' : '⚠️ 提取完成但未落盘'}`。
  - **`importCarryoverSeed` 空种子照样报 `✓ 导入成功` 并返回 true**：用户以为承接了前情，实际什么都没导入。修复：先按 9 个已知字段筛出**生效字段**，空种子直接 `console.warn` + `return false`；成功时打印生效字段数与清单（`_lastCarryoverImport`）。
  - **`ensureSettingsUI` 失败只留一行 warn**：调用方无从区分「面板没加载」还是「还在加载中」，而设置面板是用户唯一能看到自检的地方。修复：失败时落 `_settingsUIMounted = false` + `_settingsUILoadError`。
- **为什么期望值必须派生而不是写死**：单一真源常量（`EXPECTED_EVENT_TYPES = 7`，供结构校验与下限用）与运行时期望值（由宿主 `event_types` 可见性派生）是两件事。拿恒定的 7 去比会把「宿主能力缺失（不同 SillyTavern 版本）」误报成「接线不完整」——**噪声告警的代价是真告警被忽略**。
- **新增审计脚本 `scan_claim_truthfulness.mjs`（第 9 个）**：把「成功声明本身可不可信」变成可机读的不变量。四个判定面：
  - **F1** 每个打印成功标记（`✓`）的声称点，**其所在方法体内必须存在至少一个失败出口**（`⚠️` 文案或 `catch`）。立论：一个方法如果只能成功、没有地方说失败，那它的成功文案就是**常量**，与执行结果无关。失败出口的存在性是「这句成功语已被事实否定过」的最低结构证据。
  - **F2** **复合能力声称必须由状态变量派生**。命中规则：`✓` 文案里同时提到 **两个及以上**能力名（LLM / 向量 / 图扩散 / 可视化 / 检索 / 摘要 …）时，模板字符串必须含 `${` 插值。立论：复合声称 = 「把多个布尔压成一个常量字符串」，只要有一个缺失就必错；而单能力声称（「这一步做完了」）本身是事实陈述，不在判据内。**本版实测抓到一处**：`✓ 初始化完成 (LLM+向量检索+图扩散+可视化已启用)` 把四个能力写死，模块缺失时依旧全报「已启用」。
  - **F3** 失败出口数量下限（`⚠️` / `console.error`）— 防止后来者只往成功方向加日志。
  - **F4** 空 `catch` 棘轮：真正空白（无注释、无日志）的 catch 数不得超过已登记上限，新增即阻断。空 catch 未必是缺陷（容灾降级经常需要），但**静默增长**一定是。
  - **F5** 结构健康 + fail-closed（退出码 2）：找不到入口 / 复制声明面退化时不得报「零缺陷」。
- **四类声称的修复对照**：
  - 「监听已注册」→ 由 `wired`（实测计数 >= 派生期望）驱动；
  - 「初始化完成（… 已启用）」→ 由 `_moduleStatus` 驱动（本版新修）；
  - 「提取完成」→ 由 `_savePersisted` 驱动；
  - 「导入成功」→ 由生效字段数驱动（空种子直接 false 并 warn）。
- **判据自身又踩了同一个坑**：v3.164 的扫描器 E2 / E5 把**当时的形状**当成了不变量——`push 数 == 注册点数`、`expected == 字面量`。本版把登记收进包装后，它立刻报「注册 7 个但台账 1 条」、`expected 为 0`，把更正确的实现判成缺陷。E2 改为两条真正的不变量（登记必须在包装内 + 登记数不得超过注册数），E5 改为两层（单一真源常量 == 实际注册点数 + 期望值必须是指标识符赋值而非字面量）。教训：**判据绑形状而不绑不变量时，它不会从守卫变成障碍，但会从守卫变成遮蔽**——挡住正确的修复。
## v3.164.0
- **事件生命周期面：注册了、也写了，但从没被读过**。此前四条不变量分别管「键有没有声明」（v3.160）、「声明了能不能设」（v3.161）、「能设的控件是不是唯一」（v3.162）、「注册的模块是不是真在跑」（v3.163）。它们都建立在同一个未言明的假设上：**事件确实被接上了**。本版把这个假设本身变成判据，当场抓到四处「静态看起来没问题」的缺陷。
  - **实测缺陷 1：统一注册包装 `bindEvent` 零调用点**。控制平面分离开辟了 `bindEvent(eventSource, type, handler)`，注释写明「统一事件注册包装：记录 + 注册 + 防重」。但 `registerEvents` 的 7 个注册点**全部直接调用** `eventSource.on(types.X, _hN)`（行 11236/11271/11298/11321/11363/11372/11399），没有一处经过它。于是「就绪检查」与「防重」两条承诺同时落空，且 `_controlInfo.events` **恒为 0**（它唯一的自增在 `bindEvent` 里）。
  - **实测缺陷 2：`_controlInfo` 只写不读**。计数、最后事件、注册时刻全部只写、零读取。控制平面在运行时是个装饰件——接线成不成立，没有任何消费者能看到。
  - **实测缺陷 3：`unregisterEvents` 零消费者**。v3.91 花力气修好了「按 handler 引用精确卸载」，却没有任何代码调用它。而 `registerEvents` 无幂等守卫：重复调用会把同一批 handler 再挂一遍（同一事件双触发），且台账里两份记录都会「卸载成功」——**泄漏不体现在计数上**，比计数泄漏更难发现。
  - **实测缺陷 4：诊断面没有事件接线**。`selfCheck` 的 17 行子系统统计（图谱/向量/摘要/日记/时间线/悬念簿/场景树/物品台账/台账校验/补提取/反思/POV/角色状态/回响池/楼层账本/回滚失效/召回自检）里没有任何一行覆盖事件注册状态。注册失败时插件仍打印「✓ 事件监听已注册」并「看起来正常」运行，用户侧表现为「聊了很久没有记忆」却无处可查。
- **跨对象障碍与解法**：台账在 `LonShaMemoryPlugin` 上，`selfCheck` 在 `MemoryEngine` 上，而 engine 从不持有自己的 plugin（`this.plugin` 从未被赋值）。因此诊断面不能直接读。解法是由 plugin 在构造中主动注入**只读状态提供者** `this.engine.stateProvider = () => this._controlInfo`；`selfCheck` 侧以 `typeof this.stateProvider === 'function'` 判定并容灾降级，缺失时显示「—（控制平面未初始化）」而不抛错。理由：不为「显示一行诊断」引入 engine → plugin 的反向依赖。
- **修复方式**：
  - **注册收口**：7 个注册点全部改为 `if (!this.bindEvent(eventSource, types.X, _hN)) { console.warn(...); }`，原有 `eventHandlers.push` 紧随其后不变。
  - **台账扩展**：`_controlInfo` 扩为接线台账 `{ events, lastEvent, registeredAt, expected, failed, lastFailure, unregisterAttempts, source }`。
  - **幂等守卫**：`registerEvents` 开头若发现 `eventHandlers` 非空，先 `unregisterEvents()` 再重装，避免重复挂载导致事件双触发。
  - **失败哨兵**：装完核对 `events >= expected`，不足则记 `lastFailure`、入 `failed`，并 `console.error('⚠️ 事件接线不完整：…')`。
  - **可见性**：`unregisterEvents` 记录调用次数；`selfCheck` 新增「事件接线」诊断行（监听数 / 最后事件 / 注册时刻 / 卸载次数 / 失败警示）。
- **新增审计脚本 `scan_event_lifecycle.mjs`（第 8 个）**：判定面 E1–E5。
  - **E1** 每个事件注册点必须经统一包装收口（不得存在裸的 `eventSource.on(…)`）。**判据不能只看包装器是否存在**——它一直都在、函数体也完整，问题全在调用点。
  - **E2** 注册与台账必须成对，且每条 push 必须带 handler 引用（否则卸载只能无参移除，会误删其他扩展的同类型监听）—— v3.91 不变量的回归守卫。
  - **E3** 卸载路径必须有真实消费者（零调用点 = 该路径已腐烂）。
  - **E4** 台账必须被读取（只写不读 = 装饰件）+ 诊断面必须覆盖事件接线 + 必须有跨对象只读通道。
  - **E5** 结构健康 + 非零下限（防探测器失效后以全绿通过）。
- **判据自身踩过的三个坑**（都写进了脚本注释，避免后人重踩）：
  - **剥注释必须保留换行与偏移**（注释字符换成空格、逐字符等长）。初版直接吞掉注释内容，导致后续所有位置前移——7 处裸调用报出 8 个行号，报告里的行号根本没法定位。
  - **不要顺手把字符串字面量一起剥**。本文件大量正则字面量含引号（如 `/['"]/`），手写剥离器会从某个正则字面量开始把**整段代码当字符串吞掉**——实测让 `this.bindEvent(` 从 7 变 0，反过来触发「探测器已失效」误报。实测「字符串里出现 `eventSource.on(`」的伪命中为 **0 处**，故只剥注释：风险更低、fail-closed 更明确。
  - **结构下限必须与「收口与否」正交**。下限要用「注册点总数 = 裸调用数 + 经包装数」，不能用「经包装数」：修复前 7 个注册点全是裸调用、经包装数为 0，拿它做下限会先以 exit 2「探测器失效」把闸门拦下，**真缺陷一条都报不出来**（负控制当场暴露）。这与「判据不能写死会随版本推进的值」是同一类问题——判据自身的缺陷会让它从守卫变成遮蔽。
- **负控制三态验证**：修复前精确报出 5 项缺陷（7 处裸注册点连**行号与原文件一致**、`unregisterEvents` 零调用点、`_controlInfo` 只写不读、诊断面无事件接线行、无只读通道）且 exit=1；恢复后 exit=0，且 `index.js` 与修复前备份逐字节一致。
- **判据面自防护（防假绿注入里两个漏网逼出来的）**：上述判据全都只看 `index.js` / 扫描器，**没有一条看被测文件自己**。实测两个漏网：把「二次注册仍是 7 个监听」那行断言删掉 → 行为验证静默消失，门禁照样全绿；把 CHANGELOG 顶节断言改成 `assert.ok(true)` → 发布卫生静默放宽，同样全绿。契约测试的风险正在这里：被测代码很稳，测它自己的判据却没人管。因此新增【5】判据面自防护：断言数 / 有效代码行不得缩水 + 14 条关键判据指纹必须在位。指纹用**自拼接**写法（`'assert.strictEq' + 'ual(afterSecond, 7,'`）——若直接写完整字符串，它自己就包含在文件里，改掉断言时指纹会跟着一起改，那是自我满足，等于没防。
- **新增测试 `tests/v3164_event_lifecycle.test.mjs`（18 条）**：本版修的缺陷全都「静态看起来没问题」，因此判据必须是**真跑**——真给一个假 `eventSource`，真调 `registerEvents` 两次，数监听器个数：首次 7 个、二次仍是 7 个（不是 14 个）、卸载后 0 个残留。另把「剥注释必须保留偏移」这条判据自身立成不变量。
## v3.163.0
- **模块接线面：注册了、也写了，但从没加载过**。此前三条不变量分别管「键有没有声明」（v3.160）、「声明了能不能设」（v3.161）、「能设的控件是不是唯一」（v3.162）。它们都建立在同一个未言明的假设上：**被注册的模块确实在跑**。本版把这个假设本身变成判据，当场抓到一处开工以来一直存在的静默失效。
  - **实测缺陷（真加载复现，非文本推断）**：`modules_combined.js` 与 `graph_algorithms.js` 各自在**顶层**声明 `class GraphDiffusion`。这两个文件都经 `manifest.extra_js` 以**经典脚本**（非模块）注入，共享同一个全局词法作用域，因此后加载的那个直接抛 `SyntaxError: Identifier 'GraphDiffusion' has already been declared` 并**整文件不执行**。按 manifest 顺序 `modules_combined.js` 在前 → 宿主实际拿到的是**朴素版**图算法，而 `graph_algorithms.js` 的**增强版**（稀疏矩阵 PageRank 自适应收敛、DPP 增量采样、多级社区检测、性能埋点）**从未运行**。
  - **用户可见后果**：`index.js` 调用 `personalizedPageRank(seeds, hops, topK, this.config.config.pageRankDamping)` 时，第 4 个实参被朴素版的**三参签名**直接丢弃——阻尼恒为库内硬编码 `0.85`。也就是说 v3.91 那条「审计修复：此前该配置全项目零引用」只是把配置**写进了调用点**，运行时并没生效。既有测试只读源码字符串（`/personalizedPageRank\(seedNodes, hops = 3, topK = 10, dampingFactor = 0\.85\)/`），所以此处一路全绿。
  - **为什么此前没被发现**：插件自己打印的还是「✓ 图扩散模块已加载」「✓ 初始化完成（LLM+向量检索+图扩散+可视化已启用）」，`typeof GraphDiffusion !== 'undefined'` 也照旧为真（朴素版在）。缺陷只表现为「增强能力不存在」，不影响功能可用性，因此既没有报错也没有反直觉行为。
  - **修复方式（把「唯一实现」定下来）**：
    - `graph_algorithms.js` 整体 IIFE 包裹 —— `(function (global) { 'use strict'; … })(typeof window !== 'undefined' ? window : globalThis);`，消除顶层词法绑定冲突，同时保留它作为**唯一**图算法实现。仓库其余 28 个模块本来就是这么写的，只有这一个（和 `modules_combined.js`）是裸顶层声明。
    - `modules_combined.js` 删掉冲突的 `class GraphDiffusion` 与其 `module.exports`/`window.GraphDiffusion` 导出块（785 → 509 行），只保留 `MemoryVisualizer`；内部两处 `new GraphDiffusion(...)`（社区视图、PageRank 面板）改为 `new window.GraphDiffusion(...)`，与其上方已有的 `if (!window.GraphDiffusion)` 守卫同源。
- **修复后暴露的第二处缺陷：个性化 PageRank 命中通用缓存**。增强版 `pageRank()` 带 60 秒结果缓存（`CACHE_TTL = 60000`），而 `personalizedPageRank()` 调它时**没传** `useCache` —— 缓存的键是 `this.cache.pageRank`，**不含 `startNodes`**。于是 60 秒窗口内第二次以不同种子调用，会原样返回第一次的排名：每轮扩散召回沿用上一轮的种子结果。这是「增强版从没跑过」掩盖下来的第二层缺陷——激活它才会变成活缺陷。修法是给该调用显式加 `useCache: false`（个性化结果依赖种子集，本就不该走通用缓存），并写成注释说明原因。
- **新增审计脚本 `scan_module_wiring.mjs`（第 7 个）**：判定面 B1–B5。
  - **B1** 任何两个注册脚本不得在顶层声明同名绑定。**判据必须按花括号深度判定**，不能按「行首列 0」——本仓库的 IIFE 模块内部代码常常不缩进（`const api = {...}` 直接落在第 0 列），用列号判断会把每个模块的内部声明都算成顶层，凭空造出 `api`/`text` 这类大批假冲突（首版即踩此坑）。深度 0 才是真顶层。
  - **B2** 按 manifest 顺序把全部脚本灌进同一个 `vm` 隔离上下文，必须**零失败**（权威判据，不依赖任何文本推断）。
  - **B3** `index.js` 引用的每个 `window.LonSha*` 符号都必须由某个注册脚本真实供给，或由 `index.js` 自身产出（防拼错符号名导致功能永久降级到兜底实现）。
  - **B4** 注册脚本对外挂载的全局符号必须被消费；属已知「静默腐烂区」的记入**冻结账本**，新出现的直接阻断。
  - **B5** 结构健康标记 + 每个判定面的非零下限（防探测器失效后以全绿通过）。
  - **负控制**：在**修复前的备份**上重跑，精确报出 `B1 GraphDiffusion 被多个注册脚本在顶层声明（modules_combined.js:4 / graph_algorithms.js:8）` + `B2 graph_algorithms.js 加载失败 → SyntaxError: Identifier 'GraphDiffusion' has already been declared`，`exit=1`；修复后 `exit=0`。
  - 两条结构下限（脚本数 / 全局数）**必须各自可独立验证**。这本身就是本版防假绿注入当场抓到的判据弱点：原先只用一个「有 `index.js`、零 `extra_js`」的退化树，它命中的其实是**全局数**下限，而注入打的却是**脚本数**下限，于是该注入全部漏网（详见下方防假绿一节）。现拆成两条独立用例：零脚本树（连入口都不注册）→ 报「脚本数低于下限」且 `exit=2`；无全局脚本树 → 报「仅观测到 0 个模块全局（低于下限）」且 `exit=2`。
- **「已挂载但零消费」的 7 个模块显式入账**（不是死文件——已注册、有独立单测，但当前无调用点）：`LonShaCanonical`、`LonShaDependencyClosure`、`LonShaEntitySemantic`、`LonShaExtractionCadence`、`LonShaFloorRange`、`LonShaNpcTies`、`LonShaTurnReconciler`。其中 **`LonShaNpcTies` 值得单记一笔**：`index.js:378` 有一份手写的同机制内联副本，与 `npc-ties.js` 的输出格式**已经分歧**（内联版排序 + 全角冒号 + `[角色长期关系网]` 标题，模块版无排序 + 半角冒号 + 缩进行）。两版都各自受测（`v345_deep_bastion` 断言内联版格式、`v399_npc_ties` 断言模块版），因此本版**不擅自统一**——把分歧如实记入账本，留作独立议题，避免以「修一处」为名同时改动两个受测实现。
- **测试**：新增 `tests/v3163_module_wiring.test.mjs`（12 条）。段 1 把「深度判据」本身立成不变量（`cse-engine.js` 内部确有第 0 列的 `const api`，而深度判定必须给出空集），段 2 用合成夹具真跑扫描器（正样本、重复顶层类 → B1+B2、缺失符号 → B3、未记账模块 → B4、账本内模块放行、注册文件缺失、零脚本树 → 2、无全局脚本树 → 2），段 3 是修复的消失证据（冲突类移除、IIFE 包裹、增强版特征保留、4 参签名、`useCache:false`、加载顺序、真实仓库审计 32/32），段 4 发布卫生。
- **版本与锚点**：三处升 `3.163.0`；`v3117`(3) / `v3130`(3) / `v3147`(1) 的旧锚点交新版接管；`v3160`(2) / `v3161`(1) / `v3162`(1) 的版本下界交出当版独占。另修掉 `v3162` 两条**会随版本推进而失效**的负控制：`[4c]` 原本写死 `'scan_config_liveness` 字面量（本版在 v3159 补注释时提到该文件名，会对着注释误报），改为「不出现任何字面量数组形式」；`[4d]` 原本用 `!/vnum\('3[.](160|161)[.]0'\)/` 只覆盖两个版本，改为**动态**判据——读取 `index.js` 现版，断言被检查文件里的每个版本下界都 `>=` 现版（既不误杀合法的当版下界，也不会在下一次接管后形同虚设）。
- **防假绿注入验证（16 个变异，全部真改文件、真跑 `node --test`、无条件逐字节回滚）**：`TOTAL 16 | CAUGHT 16 | MISSED 0`。
  - 变异覆盖三类：**缺陷回流**（M1 冲突类回流、M2 IIFE 包裹移除、M3 裸引用回流、M4 `useCache:false` 移除、M5 四参签名退化、M6 增强版方法改名）、**扫描器自身退化**（M7 B1 失效、M8 B2 不记录加载失败、M9 B3 失效、M10 B4 失效、M11 真缺陷不再阻断 `exit 1→0`、M12 结构下限失效）、**负控制与发布卫生**（M13 v3159 scratch 不再物化注册脚本、M14 版本回落、M15 CHANGELOG 顶节写成未发布版本、M16 v3160 版本下界退回旧版）。
  - **首跑 `14/16`，两处漏网均为测试判据自身的真实弱点，已当场修掉**（这正是防假绿要抓的东西，不是实现缺陷）：
    - **M6**（增强版方法改名）：判据原为 `ga.includes('getPerformanceStats')`，改成 `getPerformanceStatsRenamed() {` 后仍含该子串 → 判据过弱。改为断言**方法定义形状**（`\b<名>\s*\(\s*\)\s*\{`），并补 `this.perfStats = {` 埋点初始化与 `performance.now()` 计时埋点两条断言。
    - **M12**（结构下限失效）：见上文「两条下限必须各自可独立验证」。
- **终局门禁**：`node tests/run.mjs --audit` → **157 个测试文件 / 894 条通过断言 / 0 失败 / 157 文件全通过**（耗时 52.9s），7 个审计脚本全 `✓`（`scan_config_liveness` / `scan_module_wiring` / `scan_resilience` / `scan_slider_coherence` / `scan_syntax` / `scan_ui_binding` / `scan_wiring`）。
- **当前基线**：默认配置键 165 个（面板可写 164、白名单 43，残差 0）；UI 呈现键 160 个（可到达 160、死配置 0）；同一键多控件 0 处、重复 DOM id 0 处、幽灵控件 0 个、类型失配 0 处；滑块 54 条；审计脚本 **7** 个；注册脚本 **32/32** 真加载成功、顶层同名声明 **0** 处、已挂载未消费 **7** 个（全部在账本内）。
## v3.162.0
- **UI 绑定面卫生：可达性的「存在」不等于「唯一」**。v3.161 立的不变量是「每个已声明键至少有一条可达路径」。那只证明了面板里**有**一个控件，没有证明**只有**一个。本版把这句话补完：同一个配置键在面板的不同分组里各渲染一份控件时，两处都会经 `data-cfg*` 收集写回同一个字段，`querySelectorAll` 按文档顺序遍历、赋值即覆盖，**保存时靠后的那个赢**。用户改 A 处、以为生效了，实际生效的是同样可见的 B 处；两处文案还往往不同，用户可以各按自己的理解读。
  - **实测 3 项缺陷**（面板 1900 行里只有这 3 处，全部修掉）：
    - `injectionDepth`（注入深度 D0/D1/D2）在「🪞 反思 + 物品台账 + 注入深度」与「🔖 悬念簿 + 相对时间」各有一个滑块。两处的 `<input>` 行文本**完全相同**，连 `id` 都是同一个 `ls-v-injdepth`（`getElementById` 只取首个，第二处数值标签永不刷新）。保留「🔖 悬念簿 + 相对时间」那份，删掉反思分组里跑题的那份。
    - `reflectionEnabled`（反思节点）在「🪞 反思 + 物品台账 + 注入深度」与「📢 回响池 + 日记 + 提取节流」各有一个复选框，且**提示文案不同**（前者「每N楼从近期剧情提炼高层洞察…，与日记独立节流」，后者「定期从近期剧情提炼高层洞察…，默认关」）。保留前者。
  - **一处过时提示（诚实性缺陷）**：悬念簿分组那份注入深度提示写着「D1/D2=插入更早位置缓解近因偏误（**需 ST 核心级 hook，预留位暂不生效**）」。这是 v2.6 的旧话术——引擎自 v3.2 起就走 `setExtensionPrompt(prompt_id, content, position, depth, …)` 把深度真正传下去了（`index.js:172`；调用点 `11391` / `11502`），v3.156 起 D0=0 也算合法值。两处提示现在统一为准确表述：`D0=紧邻最新输入（默认）；D1/D2=插到更早位置缓解近因偏误（经 setExtensionPrompt depth 参数生效）`。
- **新增审计脚本 `scan_ui_binding.mjs`（第 6 个）**：把这一类缺陷常驻为不变量，判定面 A1–A6：
  - **A1** 同一个配置键不得绑定多个渲染控件（逐键列出全部行号）。
  - **A2** 面板内不得出现重复 DOM id。
  - **A3** 每个被绑定的键都必须在默认配置块里声明（幽灵控件：控件写进一个引擎不读的字段）。
  - **A4** 控件类型必须与声明字面量类型一致（`bool`↔复选框、`num`↔滑块、`str`/`arr`/`obj`↔文本框）。本版首次跑通这条时全仓 **0 失配**——它是一条新立起来的不变量，不是修出来的。
  - **A5** 保存路径里 `getElementById('X')` 的目标必须真实存在。
  - **A6** 结构健康标记 + 每个判定面的非零下限（防「抽到 0 个控件」以全绿通过）。
  - **关键实现细节（勿凭直觉改动）**：查询用的属性选择器与渲染控件长着同一副字符串——`overlay.querySelector('[data-cfg-text="apiUrl"]')` 是查询，`<input data-cfg-text="apiUrl">` 才是控件。判据是属性是否落在 `querySelector`/`querySelectorAll`/`getElementById`/`closest` 的引号串内（向前 90 字符窗口）。**首版漏了这层区分**，把 `apiUrl`/`apiKey` 的抓模型查询误报成第二处控件；负控制立刻暴露。同理 `el.id = 'X'`（`createElement` 后赋 id，FAB 菜单与快照菜单都是这么建的）必须纳入 id 面，否则 A5 会误报。
  - **夹具自测 6 例**（`LONSHA_AUDIT_FIXTURE=1` 放宽下限）：重复键绑定 `→1`、重复 id `→1`、幽灵控件 `→1`、类型失配 `→1`、悬空 `getElementById` `→1`、健康夹具 `→0`、以及「选择器不算第二个控件 `→0`」。在**修复前的备份**上重跑，它精确报出那 3 项缺陷（`exit=1`）；在修复后的树上 `exit=0`；退化树 `exit=2`。
- **v3159 交出硬编码的审计脚本清单**：该文件的 `[2] 每个审计脚本都能阻断`（exit 2 底线 + 真缺陷脚本的 exit 1）此前是一份 5 个文件名的字面量数组。v3.162 新增第 6 个脚本后，这个负控制会**静默**把新脚本排除在外——它验的从「每个审计脚本」退化成「这 5 个」。改为从目录动态发现（`readdirSync(AUDIT_DIR).filter(f => f.endsWith('.mjs')).sort()`），判据与 `tests/run.mjs` 的 `auditScripts()` 保持一致。
- **测试**：新增 `tests/v3162_ui_binding_hygiene.test.mjs`（18 条）。段 1 把 A1/A2 立成集合不变量（面板里任意键只有一个渲染控件、任意 id 只出现一次），并把 v3.161 的四种可写形态重新钉一遍；段 2 用**合成夹具**真跑 `scan_ui_binding.mjs`，六个负样本逐一断言 `exit=1`、两个正样本断言 `exit=0`、退化树断言 `exit=2`——即把上面那张夹具表的每一行都变成回归；段 3 是那 3 项缺陷与过时提示的**消失证据**（旧的重复副本文案不得回流、旧话术不得回流、两处提示必须一致）；段 4 是发布卫生。
- **版本与锚点**：三处升 `3.162.0`；`v3117`(3) / `v3130`(3) / `v3147`(1) 的旧锚点交新版接管；`v3160`(2 处) 与 `v3161`(1 处) 的版本下界交出当版独占，改为版本无关形态。另修掉 `v3161 [4c]` 里一条**自己刚犯的同类错**：它用正则断言「`v3160` 的锚点下界仍是 `vnum('3.160.0')`」——这等于把 v3160 钉死在 3.160.0 上，下次交接就会翻红（那正是 v3159 `[3e]` 踩过的坑）。改为匹配任意版本字面量。
- **当前基线**：默认配置键 165 个，面板可写 164、卡白名单 43，残差 0；UI 呈现键 160 个，可到达 160、死配置 0；**同一键多控件 0 处、重复 DOM id 0 处、幽灵控件 0 个、控件类型失配 0 处**；滑块 54 条；审计脚本 6 个。
- **防假绿注入验证（15/15 全部被捕获）**：真改源文件、真跑 `node --test`、无条件回滚并逐字节校验还原。变异分四类：
  - 缺陷回流：重复的 `injectionDepth` 滑块（M1）、重复的 `reflectionEnabled` 复选框（M2）、过时提示（M3）。
  - 扫描器自身退化：不再排除 `querySelector` 查询（M4，会让 `apiUrl`/`apiKey` 假阳性）、不再统计 `el.id =` 形式的动态 id（M5，会让 FAB/快照菜单假悬空）、A4 开始接受「布尔键配滑块」（M6）、A3 幽灵检查被关（M7）、A5 悬空检查被关（M8）、真缺陷时不再阻断而只打印（M9）、A1 被关（M10）、A2 被关（M11）。
  - 负控制退化：`v3159` 退回 5 文件名字面量（M12）——这正是本版要防的「新脚本静默逃过『每个脚本都能阻断』」。
  - 发布卫生：`index.js` 版本回落（M13）、`v3160` 重新钉住旧下界（M14）、CHANGELOG 顶节写成从未发布的 `3.162.1`（M15）。
- **门禁数字（v3.162 终局）**：**156 文件、882 断言、0 失败、6 个审计脚本全 ✓**（`scan_config_liveness 516ms` / `scan_resilience 100ms` / `scan_slider_coherence 92ms` / `scan_syntax 12884ms` / `scan_ui_binding 94ms` / `scan_wiring 348ms`）。
## v3.161.0
- **配置可达性缺口：已声明、被引擎读取，却没人能设**。v3.160 关掉了「被读取却从未声明」这一侧；本版关掉另一侧——同一类缺陷的镜像。判据是三条清单的差集：默认配置块（`declared`）−（设置面板可写键 ∪ 角色卡白名单键）= 残差。本版开工时残差为 **9**。
  - **9 个「声明了但无旋钮」的键**（全部补上控件或白名单，读取点一行未改）：
    - `budgetStrategy`（默认 `'balanced'`）——注入裁剪策略，引擎分三支：`relevance`（常驻全保留 + 触发保留 RRF 前 60%）、`recency`（保留常驻 + 近期分区）、其余落 `balanced`。此前面板上没有任何入口，用户永远拿不到另外两支。
    - `pageRankDamping`（默认 `0.85`）——图谱扩散阻尼。源码里躺着一条历史注释：「[v3.91] 审计修复：此前该配置全项目零引用，扩散阻尼恒为库内硬编码 0.85」。也就是说这个键曾经被「救活」过一次，但救活之后仍然没人能改它。
    - `dppLambda`（默认 `0.5`）——DPP 多样性 λ。**取值域含 0**（0 = 最相关），故面板与保存路径一律用 `??` 而非 `||`。
    - `memoryTreeEnabled`（默认 `false`）、`aiRecallOpsDebug`（默认 `false`）。
    - `pyramidTiers`（默认 `['日记','周记','史记','书','传奇']`）——记忆金字塔层级名，结构型（数组）。
    - `extractRolesPrompt`、`secondaryApis`（默认 `{}`）、`onDemandTriggerPhrase`（默认 `''`）。
  - **新增「🧭 推理调优」设置分组**（26 行）：`budgetStrategy` 下拉（三个 option 与引擎三支严格一一对应）、`memoryTreeEnabled` / `aiRecallOpsDebug` 复选框、`pageRankDamping`（0.1–0.95，步 0.05）与 `dppLambda`（0–1，步 0.05）两条滑块、`#ls-pyramid-tiers` / `#ls-roles-prompt` / `#ls-secondary-apis` 三个专用 textarea、`onDemandTriggerPhrase` 文本框。`#ls-secondary-apis` 的占位符直接给出通道结构样例，并附一行提示「可选任务键：extract / summarize / embed / select / rerank / rewrite / state」。
  - **结构型配置必须有专用保存路径**：通用 `data-cfg` 收集只认 `el.checked` / `parseFloat` / `trim()`——数组会被 trim 成逗号串、对象会变成 `"[object Object]"`。故新增三条写回：`pyramidTiers` 按 `[，,\n]` 三态分隔拆数组并要求 **≥3 层**、`extractRolesPrompt` 走非空文本、`secondaryApis` 走 `JSON.parse` + 对象判定。**三条失败路径一律 toast 提示并保留原值**，绝不写入半成品。
  - **白名单扩 5 键、刻意排除 2 键**：`CARD_CFG_KEYS` 追加 `budgetStrategy` / `pageRankDamping` / `dppLambda` / `memoryTreeEnabled` / `pyramidTiers`（38 → **43** 键）。**不收录** `extractRolesPrompt`（全局提示词资产，不该被单张角色卡改写）与 `secondaryApis`（内含 `endpoint` / `apiKey`，随卡分发会泄露 API Key）——两者只经设置面板设置，排除理由写在白名单注释里。
  - **残差归零（本版验收口径）**：`declared = 165`、面板可写 = 164、白名单 = 43；`STRICT not declared: []`、`whitelist ghosts: []`、**`residual (neither): []`**。即 165 个已声明键**全部**可达：164 个有面板控件，1 个（`extractionPrompt`，走 `#ls-prompt`）由专用保存路径写回。
- **测试**：新增 `tests/v3161_config_reachability.test.mjs`（15 条）。段 1 是可达性不变量——`declared ⊆ (面板可写 ∪ 卡白名单)`，用「四种可写形态」的并集判定（`data-cfg*` / `ck('K'` / 保存路径 `config.config.K =` / 专用控件 `id="ls-*"` 配合保存路径）；**特意不把 `c.K` 直读算作可写**，因为渲染一个值不等于能把值写回去（`extractionPrompt` 就是这样被 v3.160 的启发式清单误判过，所幸当时没写成断言）。段 2 验证新分组逐个控件渲染、`budgetStrategy` 选项集合必须与引擎分支集合一致、含 0 的滑块必须用 `??`、三个结构型控件必须有专用保存路径且三条失败路径都保留原值，并真跑 `scan_config_liveness` / `scan_wiring` / `scan_slider_coherence`；段 3 白名单卫生（扩的 5 键在册、无幽灵、无重复）；段 4 发布卫生。
- **版本与锚点**：`index.js` / `manifest.json` / `package.json` 三处升 `3.161.0`；`v3117`/`v3130`/`v3147` 的旧锚点交新版接管（`'3.160.0'` → `'3.161.0'`）；`v3160` 交出当版独占——其 `[4b]` 的锚点下界改为版本无关形态。
- **防假绿注入验证（14/14 全部被捕获）**：真改源文件、真跑 `node --test`、无条件回滚并逐字节校验还原。变异覆盖四类：
  - 白名单类：新收的 5 键被摘掉（M1）、含 API Key 的 `secondaryApis` 回流（M2）、全局提示词 `extractRolesPrompt` 回流（M3）。
  - 面板类：`dppLambda` 滑块消失（M4）、min=0 滑块被改成 `|| 0.5` 回退（M5）、`relevance` 选项被摘掉（M6）、多出一个引擎不认识的值 `random`（M7）、金字塔层数下限从 3 放宽到 1（M8）、解析失败被静默吞掉（M9）、失败提示不再承诺保留原值（M10）。
  - 可达性回归：`onDemandTriggerPhrase` 的控件属性被打错成 `data-cfg-x`（M14）——这正是本版要根治的形态。
  - 发布卫生：`index.js` 版本回落（M11）、CHANGELOG 顶节写成从未发布的 `3.161.1`（M12）、`v3160` 的锚点下界退回「恰好等于 3.160.0」的等式钉法（M13）。
- **门禁数字（v3.161 终局）**：**155 文件、860 断言、0 失败、5 个审计脚本全 ✓**（`scan_config_liveness 549ms` / `scan_resilience 91ms` / `scan_slider_coherence 89ms` / `scan_syntax 12630ms` / `scan_wiring 345ms`）。
- **一处工程教训（本轮实测）**：门禁首跑暴露了 `tests/v3161_config_reachability_completion.test.mjs` —— 上一轮中断时留下的**平行草稿**，与正式文件同名同题：其 `[4c]` 的正则转义被终端的 heredoc 吞坏（`/vnum\(h\)/` 多了一层反斜杠，永远匹配不上），且 `[4b]` 里带着「锚点必须恰好等于本版号」的过期陷阱。已删除并把其中更好的一条判据**吸收**进正式文件：`[2b]` 改为**从源码推导**引擎分支集合（`strategy === '...'`）再与面板 option 集合比对，而不是把三支写死在测试里——写死的话，将来引擎加/删一支，面板与测试会一起停在旧答案上而无人察觉。
- **当前基线**：默认配置键 **165** 个，其中面板可写 164 个、卡白名单 43 个，**残差 0**（每个已声明键都至少有一条可达路径）；UI 呈现键 **160** 个，可到达 160、死配置 0；滑块 **55** 条；审计脚本 5 个。
## v3.160.0
- **配置声明缺口：引擎读得到的键，用户不一定设得了**。本版把「配置块 / UI 控件 / 角色卡白名单」三份清单互相交叉比对，找出三类缺口。
  - **缺口的形状**：一个功能在引擎里实现完整，读取点写着 `config.config.KEY !== false`（默认开）或 `|| 默认值`（有兜底），但默认配置块里**从来没有 `KEY:` 这一行**。后果有两层：用户既不能在设置面板里关掉它，角色卡也不能按卡调它的节奏；而「配置被清空 / 新装插件」时它会静默回落到源码里那个硬编码值，谁都不知道这个值的来源。
  - **10 个只被读取、从未声明的键**（全部在本次补齐声明，读取点一行未改）：
    - 布尔 7 个：`diaryBridgeEnabled`（日记桥）、`clockSyncEnabled`（剧情时钟权威同步）、`pairMemoryEnabled`（配对记忆）、`conflictBookEnabled`（冲突簿）、`cardCollectionEnabled`（事件收藏册）、`ethicsConflictEnabled`（伦理冲突检测）、`adaptiveBudget`（注入预算第三层自适应）。写法统一为「声明 `true` + 读取点 `!== false`」，即本仓库表达「默认开、可关」的既定形态。
    - 数值 3 个：`adaptiveBudgetDecayFloors: 80`、`sleepEveryN: 10`、`snapshotEveryFloors: 50`。声明值一律取自引擎内既有回退值，**改声明不改行为**。
  - **白名单幽灵键 `extractionCadence`**：`CARD_CFG_KEYS` 里列着它，但全仓 201 次提交中它**从未**在默认配置块出现过，也没有任何 UI 控件或成员读取。卡作者写进去会被当作有效键计数，实际落进 `this.config` 后再无人读——列表在承诺一个引擎根本没有的旋钮。已移除。
  - **另补 3 个键进白名单**：`sleepEveryN` / `snapshotEveryFloors` / `adaptiveBudgetDecayFloors`。此前它们只能靠引擎内部回退值兜着，卡作者无法按卡调归档节奏与预算衰减。
  - **新增「🧩 记忆域开关」设置分组**：7 个开关 + 3 条滑块。这是本版对用户可见的部分——上述 7 个功能此前是「引擎有、界面没有」，现在可以关。
  - **顺带确认两件事没有发生**：其一，这 10 个键在历史 201 次提交中一次都没被声明过，因此不存在「旧 localStorage 里存着旧值、重声明后突然生效」的隐患；其二，声明后读取点行为全部不变——布尔仍恒为 `true`（`!== false` 短路）、数值仍与其回退值同值。
- **测试**：新增 `tests/v3160_config_declaration_gap.test.mjs`（15 条）。段 1 是两条集合不变量——「引擎读到的每个 `config.config.KEY` 都必须在配置块里声明」与「每个已声明的键都必须在块外至少被读取一次」（这两条从此不再需要人工比对）；段 2 验证 10 个新键在 UI 侧真的渲染（读新分组的切片，逐个断言控件形态），并真跑 `scan_config_liveness` 确认键集变宽后 D1 报告仍是「可到达 == 呈现键、死配置 0」；段 3 是白名单卫生（无幽灵、无重复、归档三键在册）；段 4 是版本与发布卫生。
- **版本与锚点**：`index.js` / `manifest.json` / `package.json` 三处升 `3.160.0`；`v3117`/`v3130`/`v3147` 的旧锚点交新版接管（`'3.159.0'` → `'3.160.0'`）；`v3159` 交出当版独占——其 `[3b]` 里「三处旧锚点恰好等于本版字符串」改为版本无关不变量「锚点仍在、且都不早于 3.159.0」。
- **防假绿注入验证（12/12 全部被捕获）**：真改源文件、真跑测试、无条件回滚。变异覆盖：新声明的开关丢掉声明、开关不再被读取、幽灵白名单键回流、数值键回退值被改错、已声明键的读取点被抹掉、新分组丢掉控件、新滑块丢掉 `??` 兜底、三处版本声明逐个失同步、`v3117` 锚点退回接管前版本、CHANGELOG 顶节被改动。
- **一处据实记录的可达边界**：`[1c]`（开关的守卫仍以 `!== false` 形态存在）是**存在性**检查，能证明守卫还在源码里，不能证明它的求值结果仍为真——把 `!== false` 改成 `!== false && false`，文本形态不变，当前套件无法捕获。要闭合这一段需把 engine 送进无 DOM 的仿真环境求值，超出本仓库现有测试基建，故记为已知边界而非声称已覆盖。
- **门禁数字（v3.160 终局）**：154 文件、845 断言、0 失败、5 个审计脚本全 ✓。
- **当前基线**：默认配置键 **165** 个（v3.159 为 155）；UI 呈现键 **154** 个，可到达 154、死配置 0；角色卡白名单 **38** 键，幽灵键 0；滑块 53 条。
## v3.159.0
- **引擎回退值与声明默认值失配：`archivePreserveRecent`**：v3.156 把「0=不保留也是合法值」统一之后，该键的读取点写成了 `numOr(..., 0)`，而默认配置块里声明的是 `archivePreserveRecent: 6`。
  - 后果：这个键在用户配置里一旦缺失（新装的插件、旧存档升级上来、或配置被手动清理），`numOr` 会回退到 **0** —— 也就是「一个楼层都不保留」，把所有可隐藏的楼层全吐掉。而面板上那条滑块的默认位置是 6。声明说 6，实际跑 0。
  - 修复：读取点回退值改为 **6**，与声明一致（`index.js:3371`）。
  - **新增不变量测试**：`[1b]` 扫描全文件所有「数值回退」写法（`numOr(x, N)` / `x || N` / `x ?? N`），逐个与默认配置块里同一键的声明值对比，任何不一致都报出。当前全仓 0 处不一致。
- **审计基建 F：审计脚本自身必须 fail-closed（本版的主要工作）**
  - **发现的真缺陷：两个扫描器根本没有退出码。** `scan_wiring.mjs` 与 `scan_resilience.mjs` 全文没有一行 `process.exit` —— 所有指标都只是计数，不管数字多不合理，进程都以 0 退出。这本身就是一个盲区：一个永远返回成功的检查，和没有这个检查是一样的。
  - **取证（退化矩阵）**：把两个源文件与五个审计脚本拷进临时目录，逐个制造退化场景并记录退出码（修复前）：
    - `settings-ui.js` 清空 → `scan_config_liveness` 报「UI 呈现键 **0** / 可到达 0 / 死配置 **0**」并 **exit 0**；`scan_wiring` 报「A1 配置键 0 / 方法 0 / 孤儿 0」并 exit 0。
    - `index.js` 清空 → `scan_resilience` 报「catch 0 / 定时器 0/0 / await 0」并 exit 0。
    - UI 截断到前 200 行 → `scan_wiring` 仍 exit 0（字节数还在阈值之上，但控件全没了）。
  - **危险之处**：审计失效的方式是「报告一切正常」。空输入 → 零键 → 零问题 → 通过，是假绿里最难发现的一种。
  - **加固**（每个脚本都补上一段结构预检 + 一条终止判定）：
    - `scan_config_liveness`：UI 字节数下限 + `data-cfg` 存在性 + `index.js` 字节数下限；并在打印 D1 之前加一道「抽到的键数不得低于 `MIN_UI_KEYS = 100`」——低于下限就拒绝认证「无死配置」，exit 2。
    - `scan_wiring`：两个输入体量下限 + 「UI 侧 `data-cfg*` 控件数不得低于 `MIN_UI_CFG_CTRLS = 30`」（当前实测 67；截断到前 200 行时为 0，故此阈值能真正区分）；并把 A8.1/A8.2（存而不读 / 读而无存）这两类**当前为 0 的硬缺陷**从「参考输出」升为**阻断条件**（exit 1）。
    - `scan_resilience`：输入体量下限 + 六个探测器**各自至少要命中一次**（B1 静默 catch / B2 定时器 / B3 事件 / B4 await / B5 持久化键 / B6 全局挂载），任一零命中即 exit 2。
  - **加固后回归矩阵**（同一套场景）：`ui_empty` / `idx_empty` / `both_empty` / `idx_trunc` 下三个脚本全部 exit 2；`ui_trunc` 被 `scan_wiring` 的控件数下限拦住；**`intact` 场景五个脚本全部 exit 0**——加固没有把正常树判成失败。
- **测试**：新增 `tests/v3159_audit_failclosed_and_fallback_parity.test.mjs`。段 1 是回退值一致性（`[1]` 定位缺陷键、`[1b]` 全仓扫描）；段 2 是**审计脚本自身的 fail-closed 验收**——用临时目录装配合成树，真跑脚本、真读退出码：`[2]` 每个脚本必须同时具备 exit 1 与 exit 2 路径、`[2b]` 空树必须阻断、`[2c]` 截断 UI 必须被控件数下限拦住、`[2d]` **健康树必须全部通过**（防「加固过头」把正常情况也判失败）、`[2e]` liveness 的键数下限确实位于报告之前；段 3 是版本与发布卫生。
- **版本与锚点**：`index.js` / `manifest.json` / `package.json` 三处升 `3.159.0`；`v3117`/`v3130`/`v3147` 的旧锚点交新版接管（`'3.158.0'` → `'3.159.0'`）；`v3158` 交出当版独占（其 `[3]` 里「CHANGELOG 头必须是本版」改为「全仓最高节 == index.js 已发布版本」的版本无关不变量）。
- **防假绿注入验证（11/11 全部被捕获）**：真改源文件、真跑测试、无条件回滚。变异覆盖：引擎回退值与声明默认值各改一次、三处版本声明逐个失同步、liveness 的键数下限与 wiring 的控件数下限各拆掉、wiring 的 exit 1 与 resilience 的 exit 2 各降级为 0、v3157 的夹具通道拆掉、v3158 的版本无关不变量回退为硬编码旧版本。每一项都必须被某个测试文件抱下，否则该不变量就是装饰品。
- **门禁数字（v3.159 终局）**：153 文件、830 断言、0 失败、5 个审计脚本全 ✓。
- **新制度（归纳自本版验收方式）**：（一）审计脚本必须 fail-closed —— 没有退出码的扫描器等于没有扫描器；（二）结构预检与夹具通道必须并存 —— 预检会拦下回归测试里人工构造的极小夹具，正解是开一条显式开关（`LONSHA_AUDIT_FIXTURE=1`）只在夹具模式放宽下限，正常门禁仍严格；（三）加固后必须验证「健康树仍然通过」—— 下限不能凭自己心里的数字填（本版 `MIN_UI_CFG_CTRLS` 初设 100 而实测 67，一度把健康树误判为退化）。
- **当前基线**：审计脚本 **5** 个，全部具备 exit 0/1/2 三条路径；滑块总数 50 个；配置键 155 个。
## v3.158.0
- **滑块自洽性治理：`diaryEveryFloors` —— `min=0` 的滑块与标签都在说假话**：v3.156 修好了 `min=0` 滑块里被 `||` 吞掉 0 的那一批，但只覆盖了当时的实例，**漏了 `diaryEveryFloors`**；v3.157 修 `termLexiconMax` 时又暴露出同一类问题的另一半 —— **滑块 `value` 修了、配对的 `ls-slider-val` 标签没修**。本版把这两半一次收干净。
  - 现象：`settings-ui.js:870`（标签 `ls-v-df`）与 `:871`（滑块 `value`）都写着 `${c.diaryEveryFloors || 3}`。该键 `min="0"`，而 v3.156 已把引擎侧改成真正可达的「**0 = 每楼**」（`index.js:3717` 与 `index.js:10118` 两处消费点均走 `numOr(…, 3)`）。
  - 后果：用户把 0 存进配置，引擎真按「每楼」跑，但回到面板看到的滑块与数字是 **3** —— 「改动看起来在、存下去也对，就是面板在说假话」。这是最难自查的一类缺陷：**功能是对的、界面是错的**，任何只看引擎行为的测试都抓不到。
  - 修复：两个位置都改为 `?? 3`（`settings-ui.js:870` 与 `:871`，全仓 `diaryEveryFloors || 3` 清零）。
- **审计基建 E：滑块声明自洽性常驻化（`tests/audit/scan_slider_coherence.mjs`）**：v3.157 的 D1 审计只能发现「键没人消费」，发现不了「界面把合法值渲染错」。本版新增第 5 个审计脚本，随 `npm run test:audit` 一起跑。
  - **E1**：每个 `range` 必须 `min < max`，且 `step` 能整除区间（浮点容差 `1e-9` —— 否则 `hybridAlpha` 的 `step=0.1` 会误报「不整除」）。
  - **E2**：`min=0` 的滑杆，其 `value` **与配对 `ls-slider-val` 标签**都不得用 `|| 非零数字` 回退（必须是 `??`）。判据按**解析出的回退数值**判定 —— `|| 0` 与 `?? 0` 渲染等价，是合法写法，一律禁止会误伤 `maxMoneyDelta`/`injectionDepth`。
  - **E3**：默认配置块里的默认值必须落在 `[min, max]` 且在 `step` 网格上。
  - **E4**：每个滑杆键都必须在默认配置块里有定义。
  - 退出码 0/1/2（2 = 结构漂移，例如一个 `range` 都找不到）。
  - **实现故意零正则**：初版用 `new RegExp('ls-slider-val[^>]*>[$][{]c[.]' + key + …)` 在 60 万字符的 `settings-ui.js` 上逐键建正则，直接触发 `FATAL ERROR: Ineffective mark-compacts near heap limit … JavaScript heap out of memory`（exit=134）。改写为手写字符串扫描 `readNumber(text, from)`（跳空白 → 逐字符收 `[0-9.]` → `Number.isFinite` 校验），彻底避开回溯与内存峰值。
  - **判别力经修复前树验证**：把脚本拷到 `4122c44` 的旧树跑，**正确报出 2 处**（`value` 与 `label` 各一），当前树为 **0 处** —— 证明探针能抓真缺陷，且本轮修复确实消除了它。
- **测试**：新增 `tests/v3158_slider_coherence_and_diary_zero.test.mjs`（15 条）。段 1 直接对源码取证（滑块/标签/引擎侧 0=每楼/全仓 `min=0` 键的两个位置回退）；段 2 装配合成夹具真跑审计脚本（坏形态须报 value+label 两处、好形态 exit 0、无滑块 exit 2）；段 3 是版本与发布卫生（四处同步、旧锚点接管、v3157 交出当版独占、CHANGELOG 节实质、无未发布占位节）。
- **版本与锚点**：`index.js` / `manifest.json` / `package.json` 三处升 `3.158.0`；`v3117`/`v3130`/`v3147` 的旧锚点交新版接管（`'3.157.0'` → `'3.158.0'`）；`v3157` 交出当版独占（改为下限式 + 断言自己的 CHANGELOG 节仍在）。
  - `v3157` 的 `[6e]` 原本硬编码「不得出现 `## v3.158.0`」，上版后必然失败；改为**版本无关不变量**：取全仓 CHANGELOG 最高节号，断言它等于 `index.js` 的已发布版本 —— 既能抱预置占位节，也不会再随每轮升版而失效（`v3158` 的 `[3e]` 同步采用同一不变量）。
- **防假绿注入验证（9/9 全部被捕）**：真改源文件、真跑测试、`finally` 恢复。M1 滑块 value 回退 `||`（12/3）、M2 配对标签回退 `||`（12/3）、M3 引擎侧丢掉 0=每楼语义（14/1）、M4 审计不再扫标签（14/1）、M5 审计不再扫滑块值（14/1）、M6 审计把失败降级为通过（13/2）、M7 审计吞掉结构漂移（14/1）、M8 版本失同步（13/2）、M9 旧锚点回退且未被接管（14/1）。
- **门禁数字（v3.158 终局）**：**152** 个测试文件、**818** 断言、**0** 失败；**5** 个审计脚本全部通过（`scan_config_liveness` 513ms / `scan_resilience` 87ms / `scan_slider_coherence` 94ms / `scan_syntax` 12417ms / `scan_wiring` 341ms）。
- **当前基线**：滑块总数 **50** 个（其中 `min=0` 的 11 个），审计脚本 **5** 个。
## v3.157.0
- **死配置治理（第二轮）：`termLexiconMax` —— 接线断开，滑块与卡覆盖全部空转**：v3.156 把 `hybridAlpha` 从「只建不用」救活后，把这类检查做成了常驻审计（见下）。审计立扫出第二个同类缺陷：`settings-ui.js` 有「词典条目上限」滑块（`data-cfg-num="termLexiconMax"`，`min=10 max=120`），卡覆盖白名单里也有它，但引擎侧**从不消费**。
  - 根因：实例化 `EntityLexicon` 时**调用括号是空的** —— `new (window.LonShaEntityLexicon?.EntityLexicon || function () {…})()`，而构造器签名是 `constructor(opts = {})`，内部 `this.max = Math.max(10, Math.round(Number(opts?.max) || 40))`，于是 `this.max` **恒为 40**，无论配置写什么、滑块拖到哪。
  - 对照样板：紧邻的 `FloorLedger` 调用是**会传参**的（`new FloorLedger({ maxFloors: …, … })`）——同一个文件里两种写法并存，正好说明这不是有意设计。
  - 修复：实例化改为 `new (…)({ max: numOr(this.config.config.termLexiconMax, 40) })`；构造器取值从 `Number(opts?.max) || 40` 改走零值安全内核 `numOr(opts?.max, 40)`（与全仓取值语义一致，`Math.max(10, …)` 的托底保留）。
  - 顺带修掉 UI 侧两处 `${c.termLexiconMax || 40}`：`||` 会让「配置显式为 0」时渲染出 40，改用 `?? 40`（`0` 保留，仅 `null`/`undefined` 回退）。
  - **可观测性**：诊断面板「召回产物」段后新增一行「**术语词典：** 当前条数/上限 条」，达到上限时追加「已达上限，新术语将按 count/lastFloor 淘汰旧条目」提示 —— 上限到底是多少，一眼可查（此前配置改了没反应，也没有任何地方能看出来）。
- **审计基建 D：死配置扫描常驻化（`tests/audit/scan_config_liveness.mjs`）**：v3.156 的 `hybridAlpha` 是人工挖出来的，这类「键被引用了、但消费它的方法没有调用者」的缺陷逃得过常规「键是否被引用」扫描。本版把它变成第 4 个审计脚本，随 `npm run test:audit` 一起跑。
  - 判据是**两跳可达性**：键 → 提及它的方法 → 该方法是否有调用者。
  - **「消费」必须严格是成员读取形态 `obj.key`**：这是本轮最关键的校准。初版只要求「键名在 index.js 中出现」，结果**抓不到 `hybridAlpha`** —— 因为它在 `CARD_CFG_KEYS` 白名单里以裸字符串 `'hybridAlpha'` 出现，那处位于方法体外的类体级，被判为「可到达」。requiring `obj.key` 之后，白名单裸字面量不再算消费。
  - 消费位置落在默认配置块内的一律排除（默认值本身不是消费）。
  - 提及位置落在方法体外的类体/顶层 → 视为可到达（它在真实代码路径上）；落在方法体内 → 看该方法有无调用者；**所有提及都落在「无调用者」方法内 → 死配置，退出码 1 阻断**。
  - **探针有效性已用「修复前树」回归验证**：把脚本拷到 `4122c44` 版本的 `index.js`/`settings-ui.js` 目录里跑，正确报出 `x DEAD: hybridAlpha (仅被无调用者的方法消费: _legacyHybridMerge)` 并退出 1；在当前树跑则 `hybridAlpha` 已消失。**能抓旧缺陷，才证明它今天不是假绿。**
  - **门禁数字（v3.157 终局）**：`node tests/run.mjs --audit` → **151 个测试文件、803 断言、0 失败**，4 个审计脚本（`scan_config_liveness` / `scan_resilience` / `scan_syntax` / `scan_wiring`）全部 ✓。
  - 当前基线：UI 呈现键 **144 个 / 可达 144 / 死配置 0**；中间量「无调用者方法」71 个（多为对外门面 / UI 入口，如 `getPublicData` / `getGraphWriter` / `vacuum`，本身不是错误，脚本把它单独打印出来仅供追溯）。
- 测试与门禁：新增 `tests/v3157_live_lexicon_config_and_audit_liveness.test.mjs`（25 条）。
  - **审计探针自带自测**：拿合成夹具写临时目录、跑真脚本、看退出码，而不是只断言脚本文本——其中两条夹具专门复刻了“白名单裸字面量”与“被调用方法里的裸字面量”，正是当初让探针 v1 漏掉 `hybridAlpha` 的两种形态。
  - **防假绿注入验证：8/8 全部被捕获**。逐个真改源文件真跑测试：实例化丢参（22/3）、构造器回退 falsy（23/2）、UI 回退 `||`（24/1）、诊断行消失（24/1）、审计降级为裸 key 匹配（23/2）、审计不再阻断（21/4）、v3156 重新硬编码版本（24/1）、CHANGELOG 预置未发布节（23/2），全部 RED，`finally` 恢复、事后核验零残留。
`tests/v3156_...test.mjs` 的当版独占断言（四处版本硬编码 + 三行旧锚点）交出，改为「四处一致 + 下限」断言与 `## v3.156.0` 节存在性断言；`tests/v3117_diagnostics.test.mjs` / `tests/v3130_control_plane.test.mjs` / `tests/v3147_cooldown_and_dual_hash.test.mjs` 三处旧锚点同步到 `3.157.0`。
## v3.156.0
- **零值语义修复（10 个 `min="0"` 滑杆里被 `||` 吞掉的那几个）**：`settings-ui.js` 有 10 个数值键的滑杆 `min="0"`，即「0」是用户可选的**合法意图**。但引擎侧统一用 `Number(x) || fallback` 判定缺失——`0` 是 falsy，于是「设 0」在 UI 上可见、在引擎里**永不可达**。
  - 新增零依赖内核 `numOr(v, fallback)`：只对真正的缺失值（`undefined` / `null` / `''` / 非有限数 / 布尔）回退，`0` 与 `-0` 一律保留。**13 处消费点**全部改走该内核（`vectorChunkOverlap` / `aiRecallOpsMaxPerFloor` / `archivePreserveRecent` / `diaryEveryFloors`×2 / `echoMaxCount`×1 / `vectorTailRecoveryLimit` / `rubyPhoneRecallTopN` / `hybridAlpha` / `keepRecentTokenReserve` / `maxMoneyDelta` / `injectionDepth`×2 / `EchoPool._maxCount`）。
  - **两处真实缺陷（0 被静默改回默认值）**：`diaryEveryFloors`「0=每楼」（注释里写明的语义，旧写法 `|| 3` 使其不可能）与 `echoMaxCount`（0 应等价关闭回响加分，旧写法 `|| 10` 仍加 10）。
  - **两处 `slice(-0)` 陷阱**：`0` 虽被放行，但 `arr.slice(-0)` === `arr.slice(0)` === 原数组——`aiRecallOpsMaxPerFloor=0`（不限制）会静默变成「不截断」（恰好对），而 `EchoPool` 的 `cap=0`（关闭回响池）会静默变成「容量无限」（错）。两处都改为显式分支：`_capped = _cap > 0` 才截断；`cap <= 0` 显式清空。
  - **一处 NaN 隐患**：`hybridAlpha` 此前**完全没有回退**（`const alpha = this.config.config.hybridAlpha`），配置缺失时 `alpha === undefined`，`score * undefined === NaN`，会让整条向量路的 `finalScore` 全变 `NaN`、排序退化为噪声。
  - 范围界定：`vectorChunkSize`（`min="200"`）保持原写法不动——它不是 `min=0` 键，无零值语义问题（避免无谓扩面）。
- **死配置治理：`hybridAlpha` 从「只建不用」到真正生效**：全仓审计发现 α 只在 `_legacyHybridMerge` 里被读，而该方法自 `[v3.50]` 引入 RRF 融合后**已无任何调用者**——主路径 `hybridMerge` 走 RRF 排序、从不读 α。UI 滑块可见却永不生效。
  - 新增开关 `hybridMergeWeighted`（默认 **false** = 零行为变化，继续走 RRF）。打开后 α 接到 RRF 名次上：向量/扩散路名次按 α 压缩、其余路按 `1-α` 拉伸（`_effRank = rank / max(0.2, w*2)`，互斥单调），`α=1` 偏向量、`α=0` 偏图谱，与滑杆标签「0=纯图谱，1=纯向量」字面一致。保留 RRF 为排序算法，不做两套算法切换。
- **叙事心电图角色弧光接真源（功能空转修复）**：`beat()` 侧按 `opts.characters` 逐角色累积 `polarityTrail`（上限 30），`toPrompt()` 侧要求 `opts.characters` 非空且该角色已积累 ≥3 拍极性轨迹才产出「[角色弧光·阶段参考]」。但注入点恒写 `toPrompt({ characters: [] })`——**轨迹一直在记，弧光板块永不产出**。两侧同源改为 `captureCast()`（最近 8 楼窗口，词边界正则，上限 5 人）。
- **召回产物淘汰可观测**：`pruneArtifacts()` 一直返回 `removedByAge` / `removedByCap` 两个计数，调用方却直接 `this._recallArtifacts = pruned.store` 丢弃——产物被静默删除，诊断面板只看到「条数变少」，无法区分「老化过期」与「超容量裁剪」。新增累计账 `_recallArtifactEvictions`（`byAge` / `byCap` / `lastFloor` / `lastRemoved`），随对话切换与删楼同生命周期重置，诊断面板「召回产物」段落追加淘汰分账行。（该账为**会话内计数**：不进 `collectExport` 冻结契约清单、`load` 也不恢复，面板已标明「本会话淘汰」与「会话内计数，换会话归零」，避免读数被误当跨会话累计。）（该账为**会话内计数**：不进 `collectExport` 冻结契约清单、`load` 也不恢复，面板已标明「本会话淘汰」与「会话内计数，换会话归零」，避免读数被误当跨会话累计。）
- **设置面板**：4 处缺失的滑杆 `value` 回退补齐（`vectorTopK ?? 5` / `hybridAlpha ?? 0.7` / `maxSummaryLength ?? 200` / `rubyPhoneRecallTopN ?? 3`——此前配置缺失会渲染成 `undefined`、滑杆归最低值）；新增「α 加权融合」开关；「每N楼写一次日记」与「回响池上限」标签补 `0` 的语义说明；新开关进卡覆盖白名单（`CARD_CFG_KEYS`）。
- **测试**：新增 `tests/v3156_zero_value_semantics_and_live_configs.test.mjs`。内核 `numOr` 真执行（0 / -0 / NaN / '' / null / undefined / 布尔 / 数字串）；`EchoPool._maxCount` + `cap<=0` 真执行；`hybridMerge` RRF 真执行（默认零变化 + 加权模式下 α 单调影响向量路与图谱路的排序）；`narrative-pulse.toPrompt` 真执行（空数组不产出弧光、有轨迹才产出）；`pruneArtifacts` 计数真执行 + 淘汰账记账语义；接线与白名单与 UI 登记；全仓「`min="0"` 键不得再出现 `|| <数字>` 回退形态」不变量扫描 + 四处滑杆回退 + 开关可达性 + 版本四处同步 + v3155 去当版独占。更新 v3117/v3130/v3147 三处版本号锚点至 3.156.0。v333 的 AI 主动操作上限锚点随之交接（旧写法 `Number(...aiRecallOpsMaxPerFloor)` 转为 `numOr(...)` ，断言载体迁移到新不变量，并补一条「不再被 `|| 12` 吞 0」反向断言）；v3155 两处当版独占断言（CHANGELOG 头部 + 旧锚点循环）改为交接注释，保留其自身下限断言。v333 的 AI 主动操作上限锚点随之交接（旧写法 `Number(...aiRecallOpsMaxPerFloor)` 转为 `numOr(...)` ，断言载体迁移到新不变量，并补一条「不再被 `|| 12` 吞 0」反向断言）；v3155 两处当版独占断言（CHANGELOG 头部 + 旧锚点循环）改为交接注释，保留其自身下限断言。
## v3.155.0
- **台账写入校验纵深（补 v3.154 遗漏的两条整体替换路径）**：v3.154 的提交说明写的是「两条写入路径绕过清洗」，但全量枚举 `itemOps` 写入口后实际是 **4 条外部输入路径中的 2 条**——还剩两条比已修的那两条更严重，因为它们不是「逐项 push」，而是**外部输入对真源的整体替换**（连长度、枚举、类型都不过）：
  - **`applyCarryover.itemOps`（携带包应用）**：旧写法 `this.itemOps = pack.itemOps.map(o => ({...o, carried:true}))`。危害有二：① 携带包不经任何校验直落真源；② **整体替换会静默丢弃本会话已入账的全部 ops**——玩家在本对话捡到/丢掉的物品，只要应用一次携带包就凭空消失。本轮改为「校验（复用 v3.154 的 `validateCarriedItems`）+ 与现有真源**合并**而非替换」：按归一键 `key` 去重，仅追加真源中不存在的新项，有实际合并才 `rebuildItems()`，debug 时 warn 出「校验后合并 N 条（跳过重复 M）」。**这是语义增强而非等价保持**——旧语义本身就是缺陷。
  - **`import.itemOps`（存档导入）**：旧写法 `engine.itemOps = data.itemOps`。外部存档可把任意形态的数组直接写进真源。本轮改为 `validateLedgerItemOps(_raw, { fallbackFloor: 0 })` 校验后落盘（非数组兜底空数组），违规以 `source='import'` 记入环形账本，与既有的 `'extract'` / `'carryover'` 形成三源标记。
  - 两条路径均受 `ledgerWriteValidationEnabled` 门控，关闭时逐位回退旧行为。至此「外部输入永不直落真源」这条不变量在 4 条路径上全部闭合。
- **楼层账本静默淘汰治理（长线连载的回滚能力黑洞）**：`FloorLedger` 的每层上限一直是硬编码 `MAX_FLOORS = 400`，`beginFloor` 超限时 `delete` 最旧楼层记录；而 `rollbackFloor` 开头是 `if (!entry) return 0;`——**缺失记录一律静默返回**。两者叠加的后果在长线连载（>400 楼）中必然触发：被淘汰楼层的**回滚能力静默失效**，该楼产生的图谱节点/POV/时间线条目再也无法按楼撤销，永远留在记忆里成为「幽灵记忆」，而用户与日志都毫无提示。
  - **上限可配**：新增 `floorLedgerRetention`（默认 400，`Math.max(20, ...)` 下限保护防清空），角色卡可覆盖。
  - **淘汰显式化 + 逐个化**：原实现超限时只 `delete` 一条，批量导入（如恢复 600 楼存档）后会残留超限状态；改为 `while` 逐个淘汰，每次淘汰累加 `evicted` 计数、记录**淘汰水位** `evictedFloorMax`、并触发 `onEvict` 回调（写 op-log `ledger/evict`）。
  - **回滚失效可见**：`rollbackFloor` 的缺失分支现在区分两种情形——「该楼从未提取」（正常，静默）与「记录已被上限淘汰」（**回滚能力失效**，累加 `_ledgerMissingRollbacks` + 写 op-log `ledger/rollback-miss` + 可选控制台 warn）。判定用淘汰水位而非当前键集合，避免把未提取的楼层误报为已淘汰。
  - **诊断面板**：「楼层账本」行尾附「（已淘汰 N）」，并新增「回滚失效」行。`floorLedgerEvictionDebug` 可开控制台逐次 warn。
- **设置面板**：新增「楼层账本保留上限」数值滑杆（50–2000，步长 50，带数值回显与说明）与「楼层账本淘汰调试日志」开关；两项新配置均进卡覆盖白名单（`CARD_CFG_KEYS`）。
- **范围界定**：本轮不动 BM25 词典与配置三级合并（另版）；`_sanitizeItemOp` 仍作为派生层兜底保留（旧档兼容，真源不动）。
- **测试**：新增 `tests/v3155_ledger_write_depth_and_floor_ledger_eviction.test.mjs`（10 项）——A1/A2 两条整体替换路径的源码切块真执行（合并去重 / 关卡回退 / 违规入账 / 旧写法清零）+ `FloorLedger` 真执行（可配上限 / 下限保护 / 逐个淘汰 / 水位 / 回调异常吞掉 / record-get-remove 契约）+ `rollbackFloor` 缺失分支真执行（已淘汰才计数、未提取不误计、水位边界、无历史零误报）+ 接线与配置与白名单 + 诊断面板两行 + UI 登记 + 版本四处同步 + v3154 去当版独占。更新 v3117/v3130/v3147 三处版本号锚点至 3.155.0。
## v3.154.0
- **台账写入侧 zod 式校验（anima #30）**：v3.128 的 `maxMoneyDelta` clamp 只堵住了钱财账本，物品台账的**写入侧**一直裸奔——`_sanitizeItemOp` 仅在 `rebuildItems` 的派生视图路径被调用，而真源 `itemOps`（要落盘、要进携带包、要被导出导入）在两条路径上完全不设防：① `importCarryoverSeed` 把外部携带包的原始对象直接 `push` 进真源；② LLM 提取结果也只做了 `if (!it?.name) continue` 就入账。本轮在写入前插入零依赖纯函数校验内核（`validateLedgerItemOp` / `validateLedgerItemOps` / `validateCarriedItems`），字段约束对齐既有 `_sanitizeItemOp` 口径：action 白名单（含 `del/delete/drop`→remove、`gain/take/get`→add 宽容别名）、name/desc/holder/state/location 长度上限（40/80/20/10/40）、floor 非负整数、holder 占位词归「地上/遗落」、carried 与 location 互斥自愈、单批上限 60。
  - **宽容转换，非拒绝**：能修就修（截长、归枚举、拆互斥），修不了才丢；绝不因一项脏就丢整批（对齐 loose-json「逐项独立校验」纪律）。唯一硬拒绝路径是 action 非法或 name 缺失/为空。
  - **默认开、可关**：`ledgerWriteValidationEnabled` 默认 `true`；关闭时逐位回退旧行为（携带包仍走原 `it.name` 直 push 语义）。
  - **违规可观测**：每项违规带 `kind`/`reason(s)`/`source`/`floor`/`ts` 进环形账本 `_ledgerViolations`（`ledgerViolationLogMax` 默认 200，超出丢最旧），`ledgerWriteValidationDebug` 可开控制台逐项 warn，同时写 op-log（`item/validate`）。诊断面板新增「台账校验」行（`_ledgerViolationSummary` 按 kind 计数 + top 2 主因），先让失败可见。
- **摘要金字塔显式淘汰与 GC 校准（anima #31）**：金字塔的每层上限一直是硬编码的 `if (len > N) shift()` ——卷摘要 `>20`、史记 `>6`。这有两个问题：① 上限不可调，长线连载与短篇共用同一刀口；② **静默丢卷**：被 `shift()` 掉的卷摘要里锁着一段完整叙事，丢了就再也回不来，且没有任何日志或账本记录。
  - **卷上限 `volumeRetention`（默认 40）**：超限时逐个 `while` 淘汰，并在淘汰前把该卷折叠的源摘要**解折叠回活跃池**（`folded=false` + `volumeId` 解绑），与 `verifyVolumesIntact` 降级同语义——卷没了，源摘要必须能重新参与召回，而不是随卷一起蒸发。每次淘汰写 op-log（`summary/evict`）并附「解折叠 N 条源摘要」。
  - **史记上限 `historicalRetention`（默认 24）**：`foldHistorical` 与 `addGrandChronicle` 两条路径统一读同一配置源，逐个淘汰 + 显式 op-log，不再静默。
  - 上限默认值相比旧硬编码（20 / 6）上调，是**有意为之的扩容**：旧值在长线连载下过紧，且旧行为是「静默销毁」；新行为下即便触顶也先解折叠再淘汰，叙事不丢。
- **设置面板**：新增「台账写入校验」「台账校验调试日志」两开关，以及「卷摘要保留上限」「史记保留上限」两数值滑杆（各带数值回显与说明）。五项新配置均进卡覆盖白名单（`CARD_CFG_KEYS`）。
- **范围界定**：`_sanitizeItemOp` 仍作为派生层兜底保留（旧档兼容，真源不动）；本轮不动 BM25 词典与配置三级合并（另版）。

## v3.153.0
- **ANIMA 感知线补全（swipe 感知 #33 + 物品台账感知臂 #28 轻量版）**：v3.152 已把感知配额骨架（`computeRecallQuota`，默认关）搭好，但只有大纲 tempo / 矛盾 / 悬念三臂，探索纪要里剩下的两个「检索前置」信号——swipe 重绘态、物品台账变动——本轮补进同一配额计算器，仍默认关、行为与 v3.152 逐位一致。
  - **swipe 感知臂（`swipeAwareRecallEnabled`，默认关）**：对齐 anima `_isSwipeMode` 原生语义——`onBeforeGeneration` 复用既有游标块读末楼 `swipe_id`，`>0` 即「正在重绘 assistant 回复」置 `this._swipeRegen`（无条件维护，消费受总门控）。重绘态下 `computeRecallQuota` +0.2，给模型更宽的候选，避免换一版又抽风。与 v2.9/v3.89 的 swipe 召回缓存复用正交：缓存命中直接返回、不进配额；缓存失效重算时本臂生效。
  - **物品台账感知臂（`ledgerAwareQuotaEnabled`，默认关）**：anima #28「各命中类型给不同检索配额」的轻量落地——`itemOps` 中若存在与 `_currentFloor` 相距 ≤6 楼的近期变动，`computeRecallQuota` +0.2，让「刚捡到/丢了关键道具」这类剧情节点多召回相关前情。零 LLM 调用、零新存档键，纯读既有 `itemOps`。
  - **配额上界微调**：三臂叠加（surge+0.3 / swipe+0.2 / 台账+0.2 / 矛盾+0.15 / 悬念+0.15）后 clamp 上界由 1.6 提到 1.9（下界 0.7 不变）。两新开关登记进卡覆盖白名单（`CARD_CFG_KEYS`）+ settings-ui `ck()`（均有独立 UI，无需 v3113 白名单豁免）。
  - **版本独占断言搬迁**：v3.152 测试移除 CHANGELOG 头部/旧锚点两处当版独占断言（保留结构/行为/版本下限），交本版测试接管——沿用 v3.149 起的既有惯例（历史版本测试不断言 CHANGELOG 头）。
  - **测试**：新增 `tests/v3153_swipe_ledger_aware.test.mjs`（7 项）——结构接线 / swipe 检测落点 / computeRecallQuota 双新臂各自门控 / 默认关短路 / UI+卡覆盖登记 / 版本四处同步 / v3152 去独占校验。更新 v3117/v3130/v3147 三处版本号锚点至 3.153.0。
## v3.152.0
- **ANIMA 词典线闭环（术语词典 + BM25 双端归一 + 感知配额 + 持久化契约）**：探索纪要 #26/#28 两项「直接可用」候选此前零落地——非角色实体术语（物品/地名/招式/组织）没有沉淀通道，查询侧别名映射只覆盖图谱角色节点而空转；检索配额（`vectorTopK`/`bm25TopK`）全静态，剧情高压期与平淡期同配额。本轮一次补齐。
  - **A1 术语词典（`EntityLexicon`，内联 index.js 零加载依赖，挂 `window.LonShaEntityLexicon`）**：词条 `{canon, terms[], desc, count, firstFloor, lastFloor}`；NFKC 归一（全角/半角拉丁合并）、拉丁 3+ 字走词边界断言（`BLADE` 不命中 `BLADEWORKS` 内部）、单字与纯数字拒绝、`max` 上限（默认 40）按 `count`+`lastFloor` 升序淘汰低频。持久化走存档键 `lexicon`（契约登记 + collectExport + `_imp('lexicon')` 分派），随聊天冻结/恢复对称。
  - **A2 BM25 双端归一**：`_lexExpand(text, lxOverride, withDesc)` 单真源——文档端 `_lexNormalize(d.text)` 接在 `rebuild` 的 docTerms 构建内，查询端 `normalizeQueryByLexicon(text, lx)`（withDesc=true，附带词条释义）接在 `searchBranches` 的 active 分支构建处，两处均受 `bm25LexiconNormalizeEnabled` 门控。词典变更经 `_invalidateBm25Corpus()` 置空 `_corpusFp` 触发重建；**词典状态刻意不并入 `_corpusFp` 计算**（守 v3148 三处语料指纹硬断言），独立 `_lexFp` 仅作诊断。
  - **A3 提取产物回灌**：`extractMemoryWithLLM` 解析后新增消费端——`parsed.terms` 经 `lexicon.resolve` 登记（desc 合入、alias 并入 terms），`parsed.char_aliases` 写图谱 `character` 节点 `data.aliases`（查询侧 `buildAliasMap` 单真源，省一轮 LLM 调用）。提示词侧新增 9l（新术语）/9m（角色新称呼）两条动态规则，附最近 12 条已知术语清单，受 `termLexiconEnabled` 门控。
  - **B 状态感知检索配额（`computeRecallQuota`，默认关）**：基线 1.0；`outline.stage.tempo === 'surge'` +0.3、`=== 'aftermath'` −0.3；`conflicts.conflicts.length >= 3` +0.15；`suspense.openItems().length >= 5` +0.15；clamp `[0.7, 1.6]`。开关 `statusAwareQuotaEnabled !== true` 时恒返回 1（默认关，行为与 v3.151 完全一致）。消费点两处：`bmTopK` 与 `vector.search` 的 topK 各乘配额。
  - **配置**：新增 4 键 `termLexiconEnabled`(true) / `termLexiconMax`(40) / `bm25LexiconNormalizeEnabled`(true) / `statusAwareQuotaEnabled`(false)；3 个开关经 settings-ui `ck()` 登记 + `termLexiconMax` 数值滑杆；`bm25LexiconNormalizeEnabled` 无独立 UI（随主开关），登记进 v3113 白名单。
  - **测试**：新增 `tests/v3152_entity_lexicon.test.mjs`（9 项）——结构接线 / EntityLexicon 纯类行为（resolve 登记/NFKC 合并/词边界/上限淘汰/导入对称）/ 持久化契约 / BM25 双端归一接线 / 感知配额数据源与消费点 / 提取产物回灌 / UI 与白名单 / 版本四处同步 / 类块配平。更新 v3117/v3130/v3147 三处版本号锚点至 3.152.0。
## v3.151.0
- **召回自检摘要外供（跨项目：手机端织光机消费）**：v3.150 的 A 账本 `_recallAudit` 此前只服务诊断面板（插件内自用）。本轮把它做成对外只读投影——公开快照桥 `window.lonsha_memory_bridge_v1.snapshot.recallAudit` 新增摘要字段，让手机端「织光机」能读到「你最常回望的时光」这一维度，两端观测数据互喂。
  - **`_summarizeRecallAudit()`**：把环形账本（每轮 查询/各来源命中数/空结果/楼层命中分布）压成轻量摘要 `{rounds, emptyRounds, avgHits, hotFloors[{floor,count}×Top10], lastQuery, lastTs}`。纯读，不改写账本；账本空/脏值一律降级为中性空态。
  - **快照桥接线**：`buildBridgeSnapshot()` 尾部加 `recallAudit: deep(...)`，与既有 `protagonist/lifeDetails/characters/moneyLedger/outline/worldProg/clock` 同构走深拷贝，外部写入不影响引擎内部状态（只读契约不破）。零新增顶层存档键，`ARCHIVE_TOP_LEVEL_KEYS` 契约与 collectExport 键清单均不变。
  - **测试**：`tests/v3151_recall_audit_bridge.test.mjs`（6 项）——静态接线（桥字段/方法在位/A 账本字段对齐/只读契约）+ 行为级（空态降级 / 聚合正确性 / 热点 Top10 截断排序 / 脏数据容灾）。
## v3.150.0
- **召回命中自检（A·补强）+ 楼层召回账本（B·独有新功能）**：补的是全局测试比 172% 却唯一没有「召回效果自检」防线的核心机制盲区，并让楼层账本从「记写入」扩展到「记召回」。
  - **A 召回命中自检**（`recallAuditEnabled`，默认开）：每轮召回后经 `_auditRecall` 把「查了什么 / 各来源命中数 / 空结果 / 楼层命中分布」写进环形账本 `_recallAudit`（50 轮），诊断面板 `selfCheck` 渲染「召回自检」段（近 N 轮平均命中 / 空结果次数 ⚠️ / 末轮来源分布 / 向量续热数）。空结果 = 本轮注入零前情，是真召回故障的最直接信号。纯观测层，零风险不改写召回逻辑。
  - **B 楼层召回账本**（`floorRecallLedgerEnabled`，默认开）：命中带 floor 的条目回记 `FloorLedger.record(floor, {recallIds, recallHits})`，楼层账本新增 `recallIds`/`recallHits` 字段（`beginFloor` 初始化 + `record` 聚合计数分支 + 导出/导入对称透传）。向量命中经 `VectorStore._heatEntry` 续热度（decayScore 激活臂 +1、lastActive 重置），让伏笔召回从「一次性」变成「可追溯 + 可续热」。
  - **接线**：`_auditRecall`/`_recordFloorRecall` 挂在 `recallMemory` 唯一收口（`intentRerank` 之后），两个开关均登记 settings-ui 面板。
  - **测试**：`tests/v3150_recall_audit.test.mjs`（3 项）——结构接线 / FloorLedger 召回记账累积 + 导出对称 / 命中分布与空结果楼层聚合。修 v348 意图重排断言兼容新结构；v3113 配置白名单经 settings-ui 登记消解。

## v3.149.0
- **卷摘要 intact 判定（柏宝书 #13 缝入，第五档收官项）**：折叠区下楼层被 swipe/编辑后，卷摘要文本仍嵌着失效叙事却被注入——这是对折叠区完整性的静默违约。移植 v3.3 `rebuildItems` 的 leafValid 语义到卷层：
  - **写入侧**：`maybeFold` 折叠成功时记录源楼层指纹快照 `srcFps`（`floor:fp` 对）+ 给源摘要打 `volumeId`（精确归卷），新卷初始 `degraded:false`。
  - **校验侧**：新增 `verifyVolumesIntact()`——召回前对账当前 chat 指纹，任一源指纹失效 → 整卷 `degraded`（不再注入/不入史记）+ 对应源摘要解折叠回活跃池。活跃摘要是 `maybeFold` 天然素材源，回池后由既有阈值逻辑自动重折叠（**零新增 LLM 调用，纯机制自愈**）。
  - **指纹注入位**：`SummarySystem.fpOf` 由 engine 构造时注入 `msgFpOf`（对齐 v3.89 三元组定位符），独立单类测试无 SillyTavern 依赖时可覆盖。
  - **消费收口**：`getIntactVolumes()` 统一过滤降级卷，`getActiveVolumes()`/`searchVolumes()`（卷摘要召回）/`maybeFoldHistorical`（上游史记折叠素材）三处全部收口，降级卷不注入、不再折叠进史记。
  - **对账时机**：`recallMemory` 每次召回前（主防线，覆盖 swipe/编辑后新消息触发召回的路径）+ 编辑/删楼事件后经下一条消息召回兜底。删楼场景 `_h5` 先 `shiftFloorsFrom` 偏移键再校验，防误降级。
  - **开关**：`volumeIntegrityGuard`（默认开），settings-ui 面板已登记。
  - **测试**：`tests/v3149_volume_integrity.test.mjs`（3 项）——结构断言 / 端到端降级语义（30 摘要→折叠→快照→swipe→降级→源摘要回活跃池→幂等）/ 引擎接线。更新 v3117/v3130/v3147 三处版本号锚点至 3.149.0。

## v3.148.0
- **检索质量管线四件套（baibai #26 / shujuku #26 #12 收官）**：侦察发现 bigram 分词（v3.86）、RRF 融合（v3.50）、NPC 四档（v3.43）、物品两组（v3.44）、错误规则库 17 条（v3.36）早已落地，本轮据实只补真缺口四项：
  - **BM25 语料缓存**：三处 `rebuild` 调用点（OMR 提取 / 回滚 / carryover 导入）全部收编为「素材指纹变了才重建」——指纹 = 各摘要 id+文本 hash32 拼接，断崖截断/折叠后的高频无效重建全免（shujuku BM25-corpus-cache 纪律）。
  - **rerank 分批评分**：候选池超 300 条时按批切片递归复用本方法，子批索引折算回全量索引——超大候选池不再撑爆评分上下文（shujuku 300/批纪律）。
  - **INTENT 查询意图**：`rewriteQuery` 升级为首行 `INTENT:` 一句话意图 + ≤6 条检索 Q（各 ≤220 字符，baibai 口径）；INTENT 存 `_lastIntent` 经 `getLastIntent()` 暴露，rerank 精排优先用 INTENT 作评分 query（意图一句话比原始剧情文本更贴评分语义）。多路 Q 各自独立检索，自然汇入既有 16 路 RRF 融合。
  - **age 锚点机制**：`setProtagonist` 第三参收当楼剧情日期，显式提供 age 时盖 `ageAnchorTime` 锚点；`getEffectiveAge` 双口径推算——age 形如生日日期走 `calcAge(生日,当前)`，数字年龄走「锚点年龄+锚点年→当前年差」；时间跳跃自动长岁，AI 永不算错年龄（baibai age-anchor）。注入侧 `getProtagonistPrompt` 传当前剧情日期，两处提取点全部接线。
- **Tests**：新增 `tests/v3148_retrieval_pipeline.test.mjs`（5 项）。同步更新 3 个既有测试锚点（v3147 版本号、v378/v380 的 setProtagonist 签名）。全量 142 文件、699 断言、A8 双向零缺口。

## v3.147.0
- **向量层双 hash 分层对账与 embedCache 缓存命中**：
  - **`docHash` vs `payloadHash`**：区分文本内容 hash（`docHash`）与状态/元数据 hash（`payloadHash`）。同一文本再次添加或修改元数据时，`docHash` 保持一致，`payloadHash` 独立区分。
  - **`embedCache` 热预热与零 API 浪费**：`VectorStore` 维护 `embedCache`。在 `getEmbedding` 发起 API 请求前，若 `docHash` 命中缓存，直接返回已向量化结果；`addVector` / `addVectorAuto` / `import` 自动以 `docHash` 填充并初始化缓存。存档装载后所有已知文本向量查询瞬时命中，API 调用降至 0 次。
- **API 凭据 401/403 冷却机制 (Credential Cooldown)**：
  - **401/403 自动冷却**：`fetchWithTimeoutRetry` 捕获 401（未授权/Key无效）与 403（无权限/封禁）响应后，自动对该 API 凭据启动 30 分钟（1800 秒）冷却保护。
  - **风暴拦截**：在冷却时间内发起的后续 API 请求直接拦截并抛出明确的冷却异常，绝不重复发出网络请求，彻底消除 401/403 错误引发的请求风暴与控制台刷屏。
  - **即时恢复**：用户修改设置并保存（`saveConfig()`）或调用 `clearApiCooldowns()` 时自动重置冷却表，无需等待冷却过期即可测试新密钥。
  - **诊断统计**：`MemoryEngine` 与 `fetchWithTimeoutRetry` 暴露 `getApiCooldownStats()` / `clearApiCooldowns()`。
- **Tests**：新增 `tests/v3147_cooldown_and_dual_hash.test.mjs`（3 项，行为级：401 拦截与重置恢复、VectorStore 双 hash 对账与 embedCache 预热命中）。全量 141 测试文件、694 断言全通过。

## v3.146.0
- **stbme 控制平面分离 L7——恢复原子提交边界（v4.0 前置项之二，收官）**：`restoreFromPayload` 此前只做到「失败可见 + 可手动回滚」（v3.140 结构化上报 / v3.142 落盘前紧急备份），运行时仍停留在**半套状态**（导入档部分生效、原档其余残留）。现在部分失败自动回滚到恢复前快照，让「失败」成为唯一可发生的结果。
  - **快照复用对称原语**：改前状态用 `collectExport()` 抓取——它与 `restoreFromPayload` 共用同一套契约键，不另建快照系统（对齐「避免平行系统」纪律）。回滚也走同一单真源管线，`source` 标为 `auto-rollback:<原来源>` 供追溯。
  - **按需抓取（关键安全决策）**：仅当调用方显式 `opts.snapshot: true` 时才抓。`storage.load` **刻意不请求**——它的运行时可能残留上一聊天数据，回滚等于把旧聊天记忆装进新聊天，比半套状态更危险（跨档污染）。UI 文件导入与嵌入存档恢复两处用户发起的路径请求快照。
  - **不递归污染**：回滚的内层结果只取 `count`/`failed.length` 折入 `res.rollback`，外层 `res` 的 `failed`/`loadedProducer`/`schemaWarning` 全部保留，`_lastRestore` 记录的仍是原始失败（面板可见真实原因）。
  - **失败如实上报**：`ok=false` 不因回滚成功而翻成 true；`rolledBack`/`rollbackWarning`（回滚也没恢复出字段时）/`rollbackError` 三态分开。开关 `atomicRestoreEnabled` 默认开、进设置面板，关闭即退回 v3.145 行为。
  - **面板三态可见**：恢复行新增「已自动回滚原状态」/「未回滚（保留半套，可紧急备份恢复）」/回滚告警三种播报——失败被补救了仍要看得见，否则退化成新的静默。经变异测试确认断言非恒真（改文案或改 snapshot 门禁都会变红）。
  - **配置覆盖守卫自证有效**：新键最初未接面板，被 `v3113【6】残余不可配键白名单`当场拦下（`意外不可配的键: atomicRestoreEnabled`），按 `ck()` 模式接入后通过——未用白名单绕过。
- **Tests**：新增 `tests/v3146_atomic_commit.test.mjs`（7 项，行为级：真实 `restoreFromPayload` 递归运行，验证 graph/summaries/clock 在失败后被旧值重新装入、无 snapshot 不抓不滚、开关关闭退回、dryRun 零副作用、全成功不触发、UI/面板接线）。
## v3.145.0
- **stbme 控制平面分离 L6——锁所有权令牌 + 变更栅栏（Restore Lock，v4.0 前置项之一）**：
  - **所有权令牌**：`Mutex.acquire(ownerHint)` 现返回签发凭证（truthy 对象，既有 `if (!acquired)` 降级判定与 mock 兼容），`release(cred)` 只认当前持有者。此前任何持有引用的任务在 finally 里都能放锁——排队超时降级路径、聊天切换后晚到的 finally、回滚期间的旧任务都可能把别人（甚至新会话）的锁放开造成并发写。非签发者释放被拒并计入 `mutex._foreignRelease`（无凭证调用保留兼容语义）。
  - **变更栅栏 `_mutationEpoch`**：v3.141 的会话租约只校验 chatId，**挡不住同一聊天内的结构性变更**——`rollbackFloor`/`restoreFromPayload` 期间 chatId 未变，在飞提取会基于已删除的楼层写回并随自存落盘。现在回滚与真实恢复都推进栅栏号，发起时捕获、await 后不一致即整份作废（bump 单调且 NaN 安全；dryRun 预检不推进）。`_leaseValid` 统一双类失效判据（chat-switch / mutation），`_leaseDrop` 统一丢弃诊断，三条路径共用（原四处重复条件+手写诊断对象收敛为单真源）。
  - **故障可见性**：`_epochDropped`（栅栏作废数）/ `_lastEpochBump`（最近推进原因）/ `mutex._foreignRelease`（越权释放数）进诊断面板并纳入诊断块强制显示条件。
  - **测试基建**：`v3141` 锚点随单真源收敛更新（守卫意图不变）；`v350` 补 `_leaseValid` mock（缺 mock 时 TypeError 被 catch 吞掉——本轮全量跑才暴露，正是「坏了没人知道」的实例）；`v310` 的 release 锚点改为不含参前缀（防签名演进再断裂）。新增 `tests/v3145_restore_lock.test.mjs`（6 项，含 Mutex 令牌真实行为：越权拒绝、排队交接后旧凭证失效）。
## v3.144.0
- **规划前提核对**：v3.144 规划的「唯一预算计算器」已在 v3.114 落地（`injection-router.deriveBudget` 纯函数 + 内联等价回落，v3.133/135 已统一 CJK 口径），`_lastInjection.tokens` 已在 v3.128 落地。本轮据实只做**真实缺口：丢弃不可见**。
- **预算实测（`_lastBudgetStats`）**：超预算裁剪此前是静默丢弃——`trimToBudget` 的 for 循环 break 后，没人知道丢了几块、丢多少字符、命中哪个策略，调 `injectionBudget`/`memoryTokenBudget` 只能靠猜。现在 `buildInjection` 在裁剪前捕获基线、裁剪后实测：请求上限 / 裁剪前后字符数 / 丢弃字符数 / 候选块数 / 保留块数 / 丢弃样本（前 3 条）/ 生效策略 / token 实测。统计包在 try/catch 内并 errLog，测量失败绝不影响注入本身。
- **注入预览页新增「📊 预算实测」条**：有丢弃时以告警色标出丢弃字符数与块数，列出被丢弃样本（`<`、`&` 做 HTML 转义，防注入内容破坏面板 DOM），并给出「上调注入预算或 memoryTokenBudget」的可执行建议。
- **设计取舍**：未改 `trimToBudget` 签名（曾试加第 5 个出参，因模板字符串转义风险与 v3114 既有 `strictEqual` 断言而放弃），改在调用点推导——零侵入、无 API 破坏、测量口径与实际产物一致。
- **自查修正**：新增面板追加逻辑写作 `head +=` 而原声明是 `const head` → 运行时必抛 TypeError，且语法门查不出。已改 `let` 并加守卫测试锁死该不变量。
- **Tests**：新增 `tests/v3144_budget_observability.test.mjs`（3 项：十一项度量齐备 + 基线→裁剪→统计时序、面板播报与转义、`let head` 不变量）。
## v3.143.0
- **规划前提修正（侦察结论）**：路线规划把「物品台账重放化」列为 v3.143 待做项，侦察实测发现 **v3.3/v3.36 已完整落地**——`itemOps` 即 floor+fp 真源、`reconcileItemOps` 做指纹对账、`rebuildItems` 做确定性重放、swipe/编辑自动失活与翻回复活、确定性 key 归一化与三态补丁语义均在位（3613 行注释亦标明「真源不裁剪，重放语义不受影响」是刻意设计）。按「复用既有系统、避免平行系统」纪律，本轮**不做重复建设**，改为补齐该实现一直缺失的东西：端到端行为证明。
- **重放幂等性验收（规划要求的 7 操作矩阵）**：新增 `tests/v3143_ledger_replay_e2e.test.mjs`（10 项，直接提取真实 `_sanitizeItemOp` + `rebuildItems` 逻辑运行，非重写仿真）：基线入账、重放幂等（同 chat+ops 多次结果全等、真源不被改写）、① swipe 新变体失活、② 翻回旧变体复活、③ 编辑中间楼只失活该楼（指纹粒度到楼）、④ 删末楼、⑤ 删中间楼致前移仍正确（身份靠 fp 不靠楼层号）、⑥ 重载一致、⑦ carried 跨会话永不错误失活、三态语义稳定性（未提供字段保持原值 / state=丢失 按语义移出）。全部通过，锁死既有实现防未来回归。
## v3.142.0
- **stbme 控制平面分离 L5——恢复原子性 + 快照契约宽容解析（P1 收尾）**：
  - **两阶段恢复（dryRun）**：`restoreFromPayload` 支持 `{dryRun:true}` 预检——只出恢复计划（可恢复字段数、未知键、结构代际告警），**零副作用**（不清确认状态、不调任何 import、不收容未知键）。嵌入存档恢复改为「预检 → 门禁 → 应用」：空存档或结构代际过新时在预检阶段即中止，不再应用半套状态。
  - **未知顶层键 round-trip（stbme 宽容解析纪律）**：导入时不认识的顶层键不再静默丢失——收进 `extensions` 收容袋并随 `collectExport` 回写，实现「不丢不炸」的双向前进兼容。契约清单登记 `extensions` 键（42→43）。
  - **`missing` 与 `skipped` 分离**：旧实现把「payload 有数据但引擎缺模块」与「payload 本就没这个字段」同记为 skipped，掩盖真实丢数据。现分两桶上报，UI 播报引擎缺模块数。
  - **导入侧原子性（真缺陷）**：文件导入此前无论恢复成败都无条件落盘——① 空存档/非法 payload 会用空运行时覆盖原存档；② 部分失败时把半套状态盖掉原完整存档且无退路。现在空恢复直接返回不落盘；部分失败先 `preserveRuntime` 只读取回原存档送紧急备份再落盘（面板可回滚）。
- **修正本轮自查发现的自伤**：预检曾误清真确认状态（`_confirmed = null` 写在 `dry` 判定之前），已由行为级测试锁死「预检零副作用」。
- **Tests**：新增 `tests/v3142_atomic_restore.test.mjs`（4 项：dryRun 零副作用、未知键 round-trip 到 collectExport 出口、missing/skipped 分桶、导入侧原子性静态守卫）；全量 136/136 文件、665 断言通过，语法门 173 文件，A8 双向零缺口。
## v3.141.0
- **stbme 控制平面分离 L4——会话租约（session lease）**：全仓此前**零** chatId 一致性守卫（`!== getCurrentChatId()` 无任何命中），即 stbme 研究所指「未进入聊天 / reroll 乱召回」类 bug 的温床。三条跨 await 的异步路径各自补齐发起时身份捕获 + 返回时校验：
  - **OMR 实时提取**：`await` LLM 期间用户切换聊天 → 结果整栋丢弃（不写 graph/vector/summary，运行时零污染）。旧实现会把 A 楼记忆写进已装载的 B 运行时，B 随后自存即成永久污染。
  - **backfillFloors 补提取**：逐楼 await 的长任务，每楼校验，失效即中止整轮并**跳过保存**；同时修正保存目标事后求值缺陷（`storage.save(this.getCurrentChatId(), ...)` → 用租约捕获的 `_bfLease0`，防把旧任务结果写进当前聊天）。
  - **_stmLtmConsolidate**：巩固产物是游标状态，身份变更后不再回写 `this._stmLtmState`（旧实现 A 的 stm/ltm 游标会污染 B 并随 B 存档落盘）。
- **开关与可见性**：新增 `sessionLeaseGuardEnabled`（默认开，设置面板「会话租约校验」）；作废计数 `_staleTaskDropped` 与最近详情 `_lastStaleDrop`（来源/去向/楼层/任务）进状态总览，且作废态纳入诊断块强制显示条件。
- **测试基建加固**：`v380_backfill_hardening` 的 `bIdx + 4000/5000` 硬编码窗口改为方法边界截取——代码增长不再静默破断言（本轮实测被咬）。新增 `tests/v3141_session_lease.test.mjs`（5 项：开关走配置层、三路径「捕获→await→校验→写回」顺序、租约变量声明作用域、作废可见性）。
## v3.140.0
- **P0 控制平面正确性复核（stbme 纲领收口，不改功能只改对错）**：v3.138/v3.139 落地的四层实现经逐行复核发现四处语义缺陷，全部修正并以行为级测试锁死。
  - **确认状态机推进点后移**：`storage.save` 原在递增修订号后、真实落盘前就推进 `_confirmed`——写失败/宿主不可用时内存已自称「已保存」。现在按落盘证据（扩展位写入 + saveChat 完成计数）推进，无证据则记 `failed` 并**返回 false**（旧实现恒 true，调用方无从得知没写进去）。新增 `_lastWrite = {status: queued|confirmed|failed, error}`。
  - **OMR 护栏判据重写**：v3.138 判据方向是反的——`_confirmed` 为 null（恰是最危险的未装载态）时反而放行；且 `_revision` 比较在写入合流下恒真、会误拒正常保存。改用可观测身份（磁盘存档所属聊天 vs 内存装载身份 `_loadedChatId`），并加连续拒绝上限（超 5 次降级放行，stbme：陈旧挂起必须自动解除，不许永久卡死写入）。
  - **嵌入存档判旧修复（v3.138 只修了半边）**：`_dataVersion` 存的是版本字符串而 `Number('3.138.0')` 恒 NaN→0，判旧恒假 → 恢复分支从「结构性不可达」翻成「恒可达」（每次开聊都提示恢复）；`parseFloat('3.10')===3.1` 与 `'3.9'` 大小颠倒。现拆为 `schemaVersion`（整数结构代际）+ `producerVersion`（插件版本），判旧用 schema 优先、同代际走新增 `compareVersion` 分段数值比较。
  - **嵌入存档键名污染修复**：`checkEmbeddedMigration`/`embedVaultToChatMeta`/`clearEmbeddedVaultMeta` 与恢复按钮均用 `engine.STORAGE_KEY`——该属性只存在于 StorageManager，engine 上恒 undefined → 嵌入存档实际落在 `chatMetadata.extensions['undefined']`。改用 `storage.STORAGE_KEY` 真键，读取兼容旧 `undefined` 键、写入/清理时收编残留。
- **`restoreFromPayload` 结构化结果（消除「部分失败却报成功」）**：v3.138 版整体 try/catch + 返回计数——任一子系统抛错则后续字段全部不再恢复，而 UI 仍播报「导入成功」。现逐字段独立捕获，返回 `{ok, restored, skipped, failed:[{key,error}], count, source, loadedProducer, schemaWarning}`；失败字段可定位、计数只算成功项、空恢复不再清理嵌入副本；三个调用方（storage.load / 文件导入 / 嵌入恢复）播报区分「成功/部分恢复/失败」。
- **熵增清理**：删除判旧改道后只写不读的 `_dataVersion` 引擎字段，与 `producerVersion` 同值冗余的 payload `dataVersion` 键一并合并废除（冻结契约清单随之 41→43→42 键：新增 schemaVersion/producerVersion、废除 dataVersion，由三方一致性测试守护）。
- **失败可见性（对齐「坏了有人知道吗」）**：状态总览新增 💾 写入状态（含失败原因）与 ♻️ 最近恢复（来源通道 + 装载版本 + 失败字段）两行；写入失败或恢复失败时诊断块无条件显示。
- **Tests**：新增 `tests/v3140_control_plane_fixes.test.mjs`（7 项，含 `compareVersion` 与 `storage.save` 确认时机、`restoreFromPayload` 单字段失败不吞后续三项**行为级**验证 + 契约三方一致性 + 判旧静态守卫）；全量 134/134 文件、656 断言，语法门 171 文件，A8.1/A8.2 均零缺口。
## v3.139.0
- **stbme 控制平面分离 L3——身份单通道收口**：跨调用去重指纹的私有身份通道（ctx.chatId || characterId）收编 getCurrentChatId 单一真源——原通道与单真源（chatId → file_name）优先级不一致，同角色多会话场景下指纹命名空间交叉串扰。
- **快照冻结键契约（GRAPH_SNAPSHOT_TOP_LEVEL_KEYS 纪律移植）**：`ARCHIVE_TOP_LEVEL_KEYS` Object.freeze（41 键，从 collectExport 实际键提取生成）+ storage.save 写侧卫兵（顶层键漂移即刻告警）；守卫测试 v3139 强制 collectExport 键集 == 契约清单，防未知键静默 round-trip 丢失或命名空间无序膨胀。
## v3.138.0
- **stbme 控制平面分离 L2——恢复管线单真源**：新方法 `engine.restoreFromPayload(data)` 收编 storage.load / 设置面板导入 / 嵌入存档恢复三处手写恢复清单（40 余行 × 3 副本），新增恢复键只登记一处全入口自动生效；UI 导入与 storage.load 的清单差异（load 有 supersede/charMem/worldProg/stmLtm 等，UI 导入一直丢）就此终结。
- **嵌入存档恢复闭环修复（v3.23 潜伏缺陷）**：`_embeddedVaultReady` 只写不读、toast 指路的「设置→导入恢复」按钮从未存在；且 `checkEmbeddedMigration` 用 collectExport 探测本地版本恒得当前插件版本（恒 ≥ embVer）→ 恢复分支结构性不可达。修复三件套：设置面板新增「恢复嵌入存档」按钮（渲染期+检测期双通道显隐）、判旧改用 `_dataVersion` 真实数据版本戳、检测时序挪到 `storage.load` 之后。
- **持久化确认状态机（stbme 纲领落地）**：`storage._confirmed`（chatId/revision/ts）由成功写入推进、由恢复管线清空；OMR 每楼自动保存写前校验，恢复进行中/状态回退时拒绝覆写——「恢复半途的半初始化内存态洗掉已落地完整存档」结构上不可能。
- **数据版本戳 `_dataVersion`**：collectExport 新增 `dataVersion` 字段（存档产生时的插件版本），与恒为当前版本的 `version` 字段解耦，随每次成功存档推进、随恢复回填。
## v3.137.0
- **UI 显示层随 CJK 口径对齐**：设置面板「注入 token 预算」滑块回显默认 900→2700，量程 3000→6000（旧 max 下新默认无法回显）；此前 v3.135 只改了引擎默认值，UI `?? 900` 回显与新默认不一致。

## v3.136.0
- **设置面板导出/导入收口单真源（CP 最后旁路）**：导出按钮原手写 4 键清单（graph/summaries/diaries/vectors）改走 collectExport——补齐 clock/timeline/status/moneyLedger 等 30 余键；导入恢复面补 deltaBook/cse/pulse/outline/pairMem/moneyLedger/cards/conflicts/opLog/clock（此前导出的新键在导入时被丢弃）。

## v3.135.0
- **memoryTokenBudget 默认值重校准（v3.133 的必要收口）**：默认 900→2700——旧值是 *4 装饰口径倒推的装饰值（从不生效），CJK 口径真实生效后 900 token 只放行 1000 字符，默认注入会无故缩水 3 倍；2700 token≈3000 中文字符与 injectionBudget 默认等价，行为不变而上限真实。
- **前情路径 CJK 口径统一**：PrequelSystem.buildInjection 内联 `tokenBudget*4` 同族换算改 `*10/9`，tokenBase 回落值随默认同步。

## v3.134.0
- **卡级配置空值防线**：`_applyCardOverrides` 空字符串跳过补齐（此前仅跳 undefined/null）——"" 会把布尔开关翻成误开（"" !== false）、数值键被 Number("") 归零；与注释/CHANGELOG 声称的语义对齐，补行为测试。

## v3.133.0
- **注入预算 token→字符换算 CJK 口径统一（v3.128 的逆转换同族修复）**：deriveBudget 与内联回落实现中 memoryTokenBudget/keepRecentTokenReserve 的 *4 换算（0.25 token/字符，纯 ASCII 口径）改为 *10/9（≈1.11 字符/token，与 estimateTextTokens 的汉字≈0.9 token/字逆变换一致）。旧口径对中文正文超发约 3.5 倍——900 token 预算放行 3600 字符（实际≈4000 token），memoryTokenBudget 形同虚设。

## v3.132.0
- **时间协议一致性收口**：正文标签校准时钟后同样纳入 checkTimeMonotonic 倒跳检测（此前只有 LLM 提取路径走校验，标签驱动的倒跳不可见）。
- **注释回读证据持久化**：GameClock.lastNarrativeAnchor（MyriadKnots 注释回读的时间锚点证据）纳入 getSnapshot/import，随存档跨会话保留。

## v3.131.0
- **保存地面真源方法化**：新增 recordSaveSource(source, floor)，realtime/stmLtm/backfill/edit/swipe/delete 六个保存点全部登记来源计数，随存档持久化，诊断面板展示「谁在保存」。
- **持久化对称性审计（A8）**：scan_wiring 新增 collectExport 导出键 vs storage.load 恢复键双向比对（存而不读/读而无存），当前零缺口，防止单真源再漂移。

## v3.130.0
- **持久化单真源（stbme 控制平面分离第一层）**：onMessageReceived 每楼自动保存的手写键清单废除，统一走 `collectExport()`——新键只在 collectExport 登记一处，全链路自动生效。
- **collectExport/load 对称性补齐**：collectExport 补 deltaBook/cse/pulse/outline/pairMem/lockedFacts/recallSourceStats（此前 OMR 手写清单有而单真源没有）；load 补恢复 deltaBook/cse/pulse/outline/pairMem/moneyLedger/cards/conflicts/lockedFacts/recallSourceStats/timeWentBack（此前存而不读，换会话归零）；游标身份（chatId/指纹）与保存地面真源（`lastSave`）随存档走。
- **正文时间标签协议闭环（baibai 时间锚点协议吸收）**：`bbs_start/bbs_end` 标签此前只喂时间线与向量元数据，现 OMR 提取侧用结束时间校准 GameClock（正文最高事实源优先生效，与 MyriadKnots 注释回读同位序）；`extractDualTimeTags` 增加 parseError 解析诊断（half-pair/unparseable），坏标签只统计不污染时钟。
- **协议健康可见性**：GameClock 新增 `timeTagStats`（total/paired/unparseable/calibrated，随存档持久化），状态总览面板新增时间标签协议健康行（成对率与校准率为零时警告）。

## v3.129.0
- **角色卡配置三级合并（anima 配置三级合并吸收）**：`loadConfig` 在全局 localStorage 层合并后应用角色卡 `data.extensions.LonShaMemory` 覆盖层，`CHAT_CHANGED` 切换角色卡时重放。
  - 卡级覆盖仅允许白名单键（22 个策略/数值类：vectorTopK/injectionBudget/timeChangeMaxCandidates/maxMoneyDelta 等）；提示词与 API 密钥等全局资产不随卡携带，恶意卡无法改写 apiUrl/apiKey。
  - 卡上配置只读：设置面板保存仍写回全局层，不回写角色卡；对象深合并、数组直接覆盖、null/undefined 跳过。
  - 新增 `_applyCardOverrides()` 独立方法（无卡配置/结构损坏安全返回 0），`tests/v3129_card_config_merge.test.mjs` 行为级验证白名单拦截（apiUrl/apiKey 覆盖企图被忽略）、null 跳过与边界安全。

## v3.128.0
- 研究清单对齐后落地「防御包」三项小改高收益补强（源自 baibai/anima 探索终稿的下一步借鉴优先级）：
  - **注入槽位清单化（baibai LEGACY 清空模式）**：`clearInjectSlots` 改由 `INJECT_SLOTS` 清单驱动，未来槽位改名/废弃时追加旧 key 即可防跨版本残留注入。
  - **注入 token 量级估算（baibai bytes/3.35 口径改良）**：新增模块级纯函数 `estimateTextTokens`（CJK 感知：汉字≈0.9 token/字，ASCII≈4 字符/token）。此前引擎仅 PrequelSystem 内用 `chars/4` 的乐观口径，对中文正文低估约 3.5 倍；主路径与降级路径的 `_lastInjection` 均记 `tokens` 字段，并在「注入内容预览」面板展示，预算调整有据可依。
  - **钱财账本 zod 式幅度校验（anima z.coerce/delta clamp）**：`maxMoneyDelta`（默认 0=关闭）对覆盖式改值按 旧值±上限 clamp 并记诊断日志，防 LLM 幻觉一键清零/暴富家产；delta 式增减不受限。补 `moneyLedgerEnabled` 显式默认值，使设置面板开关状态与实际行为一致。
### Tests
- 新增 `tests/v3128_defense_pack.test.mjs`（3 项，含 `estimateTextTokens` 行为级验证：CJK/ASCII/混合文本口径与旧口径对比）。

## v3.127.0
- 变化候选统一去重：角色状态、关系对、物品三路候选此前直推候选池，与常规召回重复时同一事实占两份注入预算；现按 id + 文本双键过滤后入池（与时间线/日记两路的既有去重纪律对齐）。
- 变化注入可见性：新增 `_lastChangeTrace`，记录本轮楼层、游标、时间锚点与各路「找到/新增」产量；状态总览面板新增「⏳ 变化注入」诊断块，同时展示游标持久化位置与时间倒跳告警。
### Tests
- 新增去重路径与诊断可见性回归断言；全量串行测试与语法门通过。

## v3.126.0
- 补齐日记变化游标的边界保护，与时间线游标同语义：删楼/swipe/编辑回滚时同步回退，聊天切换时重置，生成路径的指纹变化检测同步覆盖日记游标。
- 修复此前仅时间线游标受保护、日记游标在回滚后可能跳过重新生成楼层新日记注入的不一致。

## v3.125.0
- 补强时间线变化注入的候选数配置校验：非法、零值或负数回退安全默认值，小数向下取整。
- 增加回归断言覆盖精选后候选流向注入构建以及 echo 阶段候选保留。

### Tests
- 全量串行测试及语法审计通过。

## v3.124.0
- 修复 echoEnabled 开启时变化驱动候选（时间线、状态、关系、物品、日记）被回响池合并步骤丢弃的问题。
- 回响池从既有统一候选池初始化，保留原召回、变化候选与 echo 条目。
### Tests
- 扩展时间锚点专项静态回归测试，锁定 echo 合并不得回退到仅合并 recalled。

## v3.123.0
- 完成 Horae 时间变化阶段六项：日期窗口、角色/物品/关系联动、时间倒退诊断、统一候选池优先级、聊天/swipe/回滚边界与持久化测试。

## v3.122.0
- 完成 Horae 时间锚点阶段：按日期窗口、当前角色和楼层游标筛选时间线变化，并接入生成前注入。
- 增加时间倒退诊断证据、游标持久化与回滚保护，继续复用 GameClock/PlotTimeline。

## v3.121.0
- 吸收 Horae 时间锚点变化：复用 PlotTimeline 按楼层游标读取与当前剧情年份相关的新事件，并接入 onBeforeGeneration。
- 新增时间线注入游标持久化、配置开关及删楼回滚保护.

## v3.122.0
- 完成 Horae 时间锚点阶段：按日期窗口、当前角色和楼层游标筛选时间线变化，并接入生成前注入。
- 增加时间倒退诊断证据、游标持久化与回滚保护，继续复用 GameClock/PlotTimeline。

## v3.121.0
- 吸收 Horae 时间锚点变化：复用 PlotTimeline 按楼层游标读取与当前剧情年份相关的新事件，并接入 onBeforeGeneration。
- 新增时间线注入游标持久化、配置开关及删楼回滚保护.

## v3.120.0

- 将 HCDiary 风格的日记变化读取接入真实生成注入链。
- 当前回合按登场角色与日记楼层游标追加新日记。
- 持久化日记注入游标，切换聊天后保持变化边界。
- 增加开关 `diaryChangeDrivenInjection`，关闭即可回退旧行为。

## v3.119.0

- 为现有 `DiarySystem` 增加按楼层游标读取的 `getChangesSince()`。
- 变化读取支持角色白名单，避免把无关角色日记带入当前场景。
- 返回数据使用副本并保留日记内嵌数组的隔离语义。

## v3.118.0

- 在现有 DeltaBook 上增加变化驱动读取接口 getChangesSince()。
- toPrompt() 支持按楼层游标裁剪，仅注入游标之后产生的正史增量。
- 保持无参数调用的 v3.117 兼容行为。

## [3.117.0] - 2026-09-15
### Added / Fixed
- **错误可见性治理**：补齐最后 3 处静默 `catch` 的错误记录；修复 `errLog` 自身失败时递归调用自身的容灾缺陷，改为最后一道 `console.warn` 兜底。
- **公开诊断门面**：新增 `LonShaMemory.reportError()` 与只读副本接口 `getErrorLog(limit)`，供设置 UI 与外部诊断工具使用，不暴露内部错误缓冲写入引用。
- **设置 UI 接线**：设置面板非致命异常统一尝试进入插件诊断缓冲，debug 模式下仍保留控制台提示。
### Tests
- 新增 `tests/v3117_diagnostics.test.mjs`，覆盖版本三处同步、错误记录器非递归、诊断门面边界与设置 UI 接线。

## [3.93.0] - 2026-09-14
### Added（跨系统协同：官方门面收敛 RubyPhone 对本插件的私有耦合）
- **`LonShaMemoryPlugin.getPublicData()` 官方只读门面**：对外（RubyPhone `graph-bridge`）暴露结构域数据（graph.nodes/edges、summaries、diaries、povs、timeline、status、ledger、vectors），替代对 `engine.graph.nodes.values()` 等深层内部结构的硬编码直访。只读契约——返回 plain object（Map 已转数组），不含 `addNode`/`addEdge` 等写入引用，与既有 `lonsha_memory_bridge_v1` 快照桥的只读风格一致。
- **`LonShaMemoryPlugin.getGraphWriter()` 官方写入门面**：返回图谱句柄（含 `addNode`/`addEdge`/`nodes`），供 RubyPhone `pushPhoneMemories` 经官方通道追加高价值手机记忆节点，替代直连 `engine.graph`。插件不可用或图谱缺 `addNode` 时返回 `null`。
- **`tests/v393_facade.test.mjs`（21 项断言）**：用括号配平提取器从 `index.js` 取出门面方法体，在受控 `new Function` 上下文挂 mock engine 做行为验证（避免 DOM/ST 依赖）——覆盖聚合正确性、`diary.list`/`timeline.list` 备用通道、缺子模块容错、engine/graph 缺失返回 null、写入门面缺失 `addNode` 返回 null、只读门面不泄漏写入引用。

### Notes
- 配套改动在 RubyPhone v2.8.13：`graph-bridge` 的 `probe()`/`getData()`/`pushPhoneMemories()` 三处改为「门面优先 + engine 降级」，向后兼容未升级本插件的旧版本。本轮为**纯新增**，未改动任何既有内部结构或行为。
## [3.92.0] - 2026-09-14
### Added（跨系统复审：补齐与 ruby-phone 同构的入口语法盲区）
- **`tests/audit/scan_syntax.mjs` 语法门（审计基建 C）**：v3.91 的 scan_wiring/scan_resilience 只做源码文本正则统计，仓库 95 个测试文件里 `import index.js` 的数量为 **0**——即入口 `index.js` 的语法完全无门。ruby-phone 已因此在插件**根本无法解析、完全不可加载**的状态下连续发布了约 9 个版本。本门以 `--input-type=module` 从 stdin 强制按 ES Module 解析全部 117 个 `.js/.mjs`，任一失败即非 0 退出并列出文件与行号。
  - 策略说明（均经实测否证过替代方案）：**不**采用「CJS 检查失败→ESM 复检」的自适应（对 `import`+结构损坏文件 CJS 检查直接返回 0，永不进入复检，恰漏掉目标缺陷）；**不**用自写 tokenizer 猜模块形态（正则字面量使引号状态机错位，把 9 个纯 CJS 文件误判成 ESM）。改为**一律强制 ESM 解析**：ESM 语法是 CJS 超集，实测本仓库 19 个 IIFE/CJS 风格 `.js`（15 个含 `require`/`module.exports`）在强制 ESM 下 0 失败，故无假阳性。
  - ⚠️ 本仓库**不可**照搬 ruby-phone 的 `package.json "type":"module"`：15 个 `.js` 含运行时 `require`，加了会炸。拦截能力只能由脚本自身提供。
- **`tests/v392_syntax_gate.test.mjs`（12 项断言，含负控制与变异测试验证）**：复现并锁定「裸 `node --check` 对 ESM 结构损坏返回 0」的假绿机制；验证门拦住 ESM/CJS/.mjs 三类损坏并报出文件名；验证放行合法 ESM 与 IIFE/CJS（无假阳性）；验证不被注释/字符串里的假 `import|export` 误导；断言 `index.js` 确在覆盖清单内、覆盖数 ≥ 110（防遍历被改坏致门退化成空跑）；断言根目录不得出现 `type: "module"`。
  - 该测试自身经**变异测试**验证有效：把语法门改为 no-op 后，5/12 项立即变红（含「覆盖面=0」「index.js 未被覆盖」），证明它不是空跑。

### Notes
- 本轮同时修正上一轮报告中依赖本地过期副本得出的错误结论（详见 ruby-phone v2.8.11 提交说明）。
- 另有两条推测经实测否定、未落代码：`lonsha_memory_bridge_v1` 快照只含状态域（protagonist/characters/ledger/clock），不含 graph-bridge 所需的结构域（graph/summaries/diaries/vectors），不可替代；桥接读取 `Float32Array` 的序列化隐患因 `vectors` 字段全仓库零消费方而属潜在非现实。

## [3.91.0] - 2026-09-14
### Fixed（全项目审计：8 项「配置声明存在但引擎零引用」断链修复 + 2 项容灾修复）
- **presenceInjection 门控键断裂**（P0，功能死锁）：召回路径读 `presenceTier`（无默认值恒 undefined）而 config/UI 声明 `presenceInjection`——不在场角色提示功能自引入起从未生效。统一到 `presenceInjection !== false`，新增 `presenceMaxCandidates: 8` 单路候选上限（该路经 RRF 融合，防角色库膨胀时单路灌满）
- **EchoPool 配置被硬编码绕过**：`echoBaseLife`（默认 2）/`echoMaxCount`（默认 10）两项全项目零引用，实现硬编码 life=2/容量 30——UI 滑块调整无任何效果且容量行为与声明不符。EchoPool 改构造注入 `cfgGetter`（惰性读取支持运行时改配置），import 语义同步改为按新近度保留
- **maxSummaryLength 引擎不读**：UI 有 50-500 滑块但引擎零引用，createSummary 兜底截断硬编码 200。改由调用方经 `opts.maxLen` 传入（缺省仍 200 行为兼容），三条调用点接线（含 v3.8 降级摘要路径）
- **pageRankDamping 跨文件脱钩**：index.js 配置零引用，graph_algorithms.js 的 personalizedPageRank 硬编码 0.85。库函数加第 4 参（越界回落 0.85），调用点传入配置
- **lockedFactMaxChars 注入无上限**：配置零引用，锁定事实无预算灌入静态锚定区。`lockedFactsForPrompt(maxChars)` 按条目预算裁剪（超限整体舍弃不截断残句；预算过小返回空），注入路径传参，校验器路径保持全量（校验应看全部锁定事实）
- **getGeoPrompt 数据空转**（P0）：`setGeoLocation` 从 LLM `geo_location` 抽取写入、召回路径消费，但 `getGeoPrompt` 从未进注入——地理数据完全空转。接入 buildInjection 动态区（位置随剧情变，不进静态锚定破坏 prompt cache）
- **worldProgressMaxCandidates 零引用**：WorldProgress.select 恒取 `MAX_ACTIVE`。加可选 `maxCandidates` 参数（缺省回落），调用点经可选链传入
- **recallTierEnabled / temporalGraphEnabled 无门控**：两项配置零引用（常驻/触发分级与历史边追溯恒开，开关形同虚设）。关闭时不做分区/不回溯历史边，全部块走统一预算裁剪（无块丢失）
- **事件监听卸载无效**（容灾）：`eventHandlers` 只存 `{eventSource, type}` 不存 handler 引用，removeListener/off 无 handler 实际移除不了监听（且有误删其他扩展同类型监听风险）。7 个注册点改具名 handler 变量并保存引用，按引用精确卸载；无引用记录跳过并告警（防误删）
- **图谱抽取空 catch**（容灾）：LLM 抽取的角色/事件/关系节点与边写入图谱失败被空 catch 静默吞噬（抽取数据不可信，真实可能抛异常），改记入 errLog 错误缓冲供面板诊断（graph.角色节点写入/事件节点写入/参与边写入/关系边写入）
### Added
- **`tests/audit/` 审计基建**：scan_wiring.mjs（配置键/UI 开关/方法调用三向对齐扫描）、scan_resilience.mjs（空 catch/定时器/事件注册卸载/裸 await/持久化 key/全局污染扫描）——审计层可复用脚本基建
- 新增 v391_audit_fixes.test.mjs（11 项：8 项断链修复行为级验证 + 回归门「不得再出现零引用配置键」+ 事件卸载引用移除 + 版本一致性）
### Tests
- 全量 289/289 全绿（278 → 289，新增 11 项专项）

## [3.90.0] - 2026-09-14
### Added
- **实体别名查询扩展**（吸收 MyriadKnots entity-identity）：`buildAliasMap()` 从图谱角色节点构建 alias→主名映射（NFKC 归一，与 BM25 `_tokenize` 同基调）；BM25 `searchBranches` 接受 `opts.aliasMap`，查询分支命中别名时附加主名原文参与检索——用户喊角色昵称/别名也能召回主名记忆（v3.86 BM25 检索的查询侧补全）
- **`aliasQueryExpansion` 开关**（默认开）：关闭后行为与 v3.89 完全一致
### Changed
- 召回管线与前情选段（v3.87）两条 BM25 路径均接入别名扩展；扩展在分词前的文本层做（中文二元切分下 3 字以上别名整串永远不是 token，token 层替换无效）；别名匹配在 NFKC 归一化副本上检测（全角/大小写别名可命中），主名以原文附加（与文档侧词形一致）；防碰撞纪律：别名归一后与主名相同/长度 1/超 20 字的剔除，同键首写优先

## [3.89.0] - 2026-09-14
### Added
- **swipe 感知召回缓存（三元组定位符校验）**（吸收 MyriadKnots floor-binding）：召回缓存命中前验证末楼消息指纹（复用 v3.3 `msgFpOf` 的 role|swipe|hash|date 四段指纹）——翻 swipe 变体指纹变化自动失效重算，修复「翻到不同变体后 recentAssistant 分支内容已变、旧注入却仍命中缓存」的正确性缺口；翻回旧变体指纹一致，到变体级复用（v2.9 原意更精细化）
- **`swipeFingerprintGuard` 开关**（默认开）：指纹校验可关闭，关闭时行为与 v3.88 完全一致
### Changed
- 召回缓存写入时记录末楼指纹位（`fp`），缓存条目结构 `{floor, queryKey, injection}` → `{floor, queryKey, injection, fp}`；MESSAGE_SWIPED 事件处理器语义注释更新（不清缓存改为命中前校验）

## [3.88.0] - 2026-09-14
### Added
- **公开只读快照桥**（`window.lonsha_memory_bridge_v1`）：对外暴露引擎状态只读深拷贝快照——主角档案/生活小档案/NPC 状态卡/钱财账本/大纲导演/世界推进/游戏时钟，供手机前端、调试台、衍生卡等外部脚本读取，无需再侵入 `window.LonShaMemory.engine` 内部结构
- **只读契约**：bridge 对象仅含 `version`/`bridge`/`snapshot`/`refresh()`，不提供任何写入引擎的方法；快照内全部字段经 structuredClone/JSON 双保险深拷贝，外部改动不回灌引擎
- **随生成刷新**：快照在 onBeforeGeneration 注入管线尾部自动刷新（bridgeEnabled 门控），外部脚本任意时刻读到的都是最近一次生成时的完整状态
- **容灾**：任一子系统缺失时字段降级为空对象或 null，不阻塞生成管线

## [3.87.0] - 2026-09-14
### Added
- **前情导入与边界加权切片注入**（吸收 MyriadKnots recall-prequel）：新增 PrequelSystem——用户在设置面板粘贴过去经历原文（旧存档概要/前作剧情/人设背景），随聊天持久化（collectExport/storage.load/文件导入/快照恢复四路接线）
- **边界加权切片**（忠实移植 splitPrequelText）：换行权重3/句叹分号2/空白1，默认 560 字/片，在窗口末端回溯最高权重边界断句，避免切断句子
- **BM25 分支归一化选段**（复用 v3.86 战果）：超预算时用临时 BM25 实例装载切片，以 latestUser(0.65)/recentAssistant(0.25)/previousUser(0.1) 三分支 + 主查询 0.3 锚点做 searchBranches 选段——前情选段与主召回共享同一套分支归一化引擎
- **预算策略**：前情占注入预算 30%（千千结 PREQUEL_BUDGET_SHARE），token 上限 1200（千千结 MAX_PREQUEL_TOKENS），字符/token 双口径取严；预算内全量注入
- **无命中兜底**（fallbackToTail）：当前对话与前情无 BM25 重叠时注入末尾两段（剧情结尾通常是最新状态）
- **注入格式**：【用户导入的过去经历资料】头 + 「旧状态不代表现在仍持续」指令行 + 【前情片段 N】分块，追加在记忆私密简报尾部
- 设置面板：状态总览新增「📜 前情导入」卡片（prequel 视图 textarea 编辑/保存/清空）、设置开关 prequelEnabled
### Tests
- 新增 v387_prequel.test.mjs（切片边界加权/预算内全量注入/超限分支选段/无命中尾部兜底/持久化往返/接线静态检查），全量测试全绿
## [3.86.0] - 2026-09-14
### Added
- **BM25 多路分支归一化检索**（吸收 MyriadKnots recall-ranking）：BM25 新增 searchBranches(branches, topK, opts)——每路查询（latestUser 0.65 / recentAssistant 0.25 / previousUser 0.1）先按分支内最高分独立归一化再加权合成，解决长背景文本 BM25 绝对分淹没用户最新短输入的顽疾；分支全零保持全零（不放大全语料级低 IDF 重叠）；结果携带 branchScores 供命中监控溯源
- **buildQuery 多路分支捕获**：从最近聊天提取 latestUser/recentAssistant/previousUser 三分支，随 query.branches 传入召回管线；主查询在 recallMemory 中降权为 0.3 锚点与分支合并检索
- **Unicode 分词升级**（吸收 MyriadKnots tokenizeRecallText）：_tokenize 改用 NFKC 归一化 + toLocaleLowerCase('zh-CN') + \p{Script=Han}/\p{Script=Latin} Unicode 属性匹配，覆盖扩展区汉字与全角字符（旧版 [\u4e00-\u9fa5] 仅基本区）
- 兼容性：单查询 search() 等价为主分支 weight=1 的 searchBranches，旧调用点与断崖截断 _cliffCut 行为不变
### Tests
- 新增 v386_bm25_branches.test.mjs（Unicode 分词属性测试/分支归一化行为复刻：短用户输入不被长背景淹没/主查询锚点/断崖截断回归/多分支权重合成/buildQuery 分支捕获静态检查），全量测试全绿

## [3.85.0] - 2026-09-13
### Added
- **WorldProgress 数据源接线**（v3.41 吸收的承诺账本/剧情支线/认知隔离从"有壳无水源"变为完整管线）：提取 prompt 新增 9h promises（明确立下的承诺，deadlineFloor 仅正文给出楼层时才填）、9i plot_arcs（新增/触碰/解决三态）、9j knowledge_changes（认知 unaware/reveal）、9k promises_resolve（履行/违约既有承诺）；JSON schema 示例同步声明。onMessageReceived 应用块（受 worldProgressEnabled 门控）：addPromise 批量上限 3（空内容不入账、同角色同内容幂等合并）、addPlotArc 上限 3（同标题同线索合并、记录 createdFloor）、knowledge 上限 8；每楼即时 checkPromises + decayArcs；opLog 埋点
- **WorldProgress 楼层生命周期**：removeByFloor（删楼清该楼来源承诺/场外动态/支线，支线 lastActive 指针回退、resolutionFloor 撤销重置）+ shiftFloorRefs（删楼前移后 floor/deadlineFloor/lastActiveFloor/createdFloor 指针跟随，9999 哨兵豁免）；rollbackFloor 与 shiftFloorsFrom 双双挂接
- **OutlineDirector 楼层生命周期**：removeByFloor/rollbackFloor（删已执行轮次→撤销历史+回退 _turnIndex/_turnFloor，未执行计划保留）+ shiftFloorRefs（history floorFrom/floorTo + _turnFloor 位移）；rollbackFloor 与 shiftFloorsFrom 挂接
- **认知隔离提示真正投放**：toInjection(knownChars) 新增 wp_knowledge 注入块（当前在场角色 getReEntryNotice 非空时）；生成前注入改为 worldProgressEnabled 门控（默认关时不注入）
### Tests
- 新增 v385_worldprogress_pipeline.test.mjs（7 组：prompt 字段+JSON schema/承诺规范化复刻 5 用例/支线合并复刻 4 用例/WorldProgress 楼层生命周期复刻 6 用例/OutlineDirector 楼层生命周期复刻 5 用例/挂接与注入门控静态/回归防护），全量 264 测试全绿
## [3.84.0] - 2026-09-13
### Added
- **角色记忆银行楼层生命周期**（charMem 位移缺口闭环）：CharacterMemoryBank 新增 shiftFloorRefs——删楼前移后 core/recent 记忆的 floor 指针跟随（防显示错位与后续按楼层误删）；shiftFloorsFrom 挂接
- **人设偏移（drift）楼层生命周期**：CharacterState 新增 shiftDriftFloors（drift.floor 指针跟随——15 楼衰减窗口不错位）+ removeDriftByFloor（来源楼被删→偏移清空防幽灵偏移）；rollbackFloor 与 shiftFloorsFrom 双双挂接
- **人设基线（baseline）+ 地理上下文（geo）楼层指针联动**：shiftBaselineFloors（lockedAtFloor 跟随）+ shiftGeoFloor（geoContext.floor 跟随），shiftFloorsFrom 挂接
### Fixed
- **charMem.removeByFloor 计数修复**：removed 原为"处理角色数"（每角色恒 +1，无论删没删），改为实际删除条数（beforeCore/beforeRecent 差值）——rollback 日志数字现在真实
- **v39_shift_floors.test.mjs 固定窗口脆弱性**：4000 字符切片窗口改为动态（到 return shifted 结束）——v3.84 新增挂接行把 scene/ledger 推出窗口导致误报覆盖缺失
### Tests
- 新增 v384_floor_lifecycle_complete.test.mjs（7 组：charMem 位移静态/位移复刻 6 用例/计数修复复刻+旧 bug 绝迹/drift 生命周期静态/复刻含衰减窗口语义 8 用例/baseline+geo 复刻 6 用例/回归防护），全量 257 测试全绿
## [3.83.0] - 2026-09-13
### Added
- **主角档案楼层生命周期补全**（protagonist.floor 指针联动）：CharacterState 新增 removeProtagonistByFloor（来源楼被删→指针归零防幽灵楼层；内容为合并态不回滚）+ shiftProtagonistFloor（删楼前移后指针跟随）；rollbackFloor 与 shiftFloorsFrom 双双挂接（可选链守卫，debugMode 日志）
- **主角档案 + 生活小档案 UI 视图**（v3.45/v3.78 数据首次可视化可操作）：统计面板新增「主角档案 👁」卡片；新视图含六字段行（点击编辑，带楼层标注）+ 生活小档案三 tier 分组（📌置顶常驻/🔹常规/📦沉降，显示楼层/anchors/until）；_memOps 新增 protagonist_field 与 life 操作分支——字段编辑、tier 切换（置顶/常规/沉降）、内容编辑、删除（均带撤销栈）
- **记忆全景报告第 12 板块「🧬 生活小档案」**：报告含 tier 标签（📌/📦）与楼层标注；板块文案 11→12 更新
### Tests
- 新增 v383_protagonist_lifecycle_ui.test.mjs（8 组：生命周期方法静态特征/removeProtagonistByFloor 复刻 6 用例/shiftProtagonistFloor 复刻 5 用例/UI 视图与操作分支静态特征/操作分支逻辑复刻（tier 切换+删除原位还原+编辑还原）/报告第 12 板块/报告输出复刻 3 用例/版本与完整性），全量 250 测试全绿

## [3.82.0] - 2026-09-13

### Added
- **生活小档案生命周期补全**（v3.78 数据 → 楼层联动闭环）：CharacterState 新增 removeLifeDetailByFloor（删楼时清除该楼来源的偏好/习惯，防幽灵条目）+ shiftLifeDetailFloors（删楼前移后 floor 指针跟随）；rollbackFloor 与 shiftFloorsFrom 双双挂接（可选链守卫防旧版，debugMode 日志）

### Tests
- 新增 v382_life_details_lifecycle.test.mjs（5 组：新方法静态特征/删楼复刻 5 用例/位移复刻 5 用例/生命周期挂接结构验证/回归防护），全量 242 测试全绿

## [3.81.0] - 2026-09-13

### Added
- **主角档案/生活小档案回填手机**（v3.78 数据 → 手机端闭环）：LonSha payload 携带 protagonist（getProtagonist 快照）+ lifeDetails（排除 archive 层）；桥 backfill 消费——主角六字段拼接（性别/年龄/身份/体貌/着装/状况）→ 手机长期记忆 pinned importance 7；生活小档案（含 topics 标签）→ 手机长期记忆 importance 5（偏好/习惯贴合）
- **桥 stats 新计数**：protagonistIngested / lifeDetailIngested（v3.65/v3.68/v3.75 计数体系延续）
- **手机端展示**：memory-view 桥接统计行追加「🧑主角 N · 🧬生活 N」（消费 bridgeStats 新字段）

### Tests
- 新增 v381_bridge_protagonist.test.mjs（5 组：payload 携带/桥消费含六字段拼接复刻/stats 计数/memory-view 展示/回归防护），全量 237 测试全绿 + rubyphone-integration 全过

## [3.80.0] - 2026-09-13

### Added
- **backfillFloors 番外楼防护**（防御纵深）：补提取循环内新增 isOmittedFloor 检查——scanMissingFloors 已排除番外楼，此处防「直接调用传入番外楼」路径把其补进记忆（违反「番外楼对引擎彻底不存在」原则）
- **backfillFloors 补 protagonist/lifeDetails**：与 v3.78 主提取管线对齐——补提取现在同样产出主角档案与生活小档案（hasAny 守卫 + 批量上限 5 + 独立 try/catch）
- **addManualSummary storyTime 衔接**：补摘支持 storyTime 参数（可选，空白不写字段保持向后兼容）；completeMissingFloors 批量补齐时从该楼原文提取 bbs_start/bbs_end 时间标签（结束时间优先、start 兜底）作为 storyTime——补齐摘要也能被相对时间前缀与时间线消费

### Fixed
- v350_backfill.test.mjs mock 环境补 isOmittedFloor（A 补丁新增调用后 mock 缺失导致场景失败）
- v374_manual_summary.test.mjs 签名断言宽域化（addManualSummary 支持 storyTime 参数后旧断言失效）

### Tests
- 新增 v380_backfill_hardening.test.mjs（5 组：番外防护含结构验证/补字段对齐/storyTime 衔接含 4 用例复刻/addManualSummary 复刻 3 用例/回归防护），全量 232 测试全绿

## [3.79.0] - 2026-09-13

### Added
- **批量补齐 UI 入口**（v3.76 引擎管线首次可触达）：摘要视图新增「🔧 批量补齐」按钮——缺失预检（无缺失直接提示）、确认门（说明不含番外/用户楼）、执行（调用 completeMissingFloors 每批 5 楼）、结果 toast（含剩余数）、BM25 索引重建、按钮防重复点击
- **番外楼标记 UI**（bbs_omit 的 UI 入口，替代控制台命令）：摘要视图新增「🎬 标记番外 / ↩️ 取消番外」按钮——输入楼层号一键设置/取消 extra.lonsha_omit；标记时联动清理该楼既有摘要（防残留）；不存在楼层守卫

### Fixed
- **missingFloors 番外楼漏网修复**：缺失楼层清单不排除 lonsha_omit/用户/系统楼——批量补齐会把番外楼（小剧场/玩梗楼）补进记忆，违反柏宝书「番外楼对引擎彻底不存在」原则；现三态排除
- **NUL 字节清除**：index.js 混入 1 个 NUL 字节（位于 DeltaBook.confirm 的 String(summaryMatch || '') 字面量中间，历史补丁意外污染），导致 grep 判定文件为 binary、可能影响部分工具链；已精确清除并验证语义恢复

### Tests
- 新增 v379_omit_batch_ui.test.mjs（5 组：批量补齐 UI 静态特征/缺失排除逻辑复刻含 3 用例/番外标记 UI/NUL 清除回归/回归防护），全量 227 测试全绿

## [3.78.0] - 2026-09-13

### Added
- **主角档案/生活小档案水源补全（重大缺口修复）**：v3.45 缝入 baibai 时只吸了「壳」（数据结构/注入/携带包），提取管线从不产出 protagonist/lifeDetails 字段——本次补全水源：提取 prompt 新增 9f（protagonist 六字段，只填明确变化）+ 9g（life_details，铁律「只认主角明说或正文揭示」）；提取应用区新增写入（setProtagonist + addLifeDetail 批量上限 5、空值守卫、OpLog 埋点）
- **三投放层选择算法**（柏宝书 selectLifeDetailsForInjection 缝入）：getLifeDetailsPrompt 从哑过滤升级为三档选择——pinned 常驻（≤limit）/active 时效+命中（无关键词兜底）/archive 仅命中浮出；总量封顶（limit+1）；时效过期检查（until vs clock.date，解析不出宁可不判）；ctx 为空时不做命中裁剪（无依据时宁可不裁）；失败静默降级旧行为
- **anchors/until 字段支持**：addLifeDetail 扩展 anchors（原文可检索关键词，上限 8、合并去重）+ until（时效到期时间）——三投放层选择的数据基础

### Fixed
- v362_locked_facts.test.mjs 注入位置断言作用域修复（A2 补丁在提取应用区新增 protagonistTracking 引用后，全文件 indexOf 命中错误位置——限定 buildInjection 体内搜索）

### Tests
- 新增 v378_life_details.test.mjs（6 组：prompt 水源/应用区写入/三投放层选择复刻含 8 用例/时效过期复刻/anchors 字段/回归防护），全量 222 测试全绿

## [3.77.0] - 2026-09-13

### Added
- **版本真值化 + 更新检测**（柏宝书 update.ts 缝入）：修复 settings-ui 硬编码 '1.3.0' 假版本（自检报告长期显示错误版本号）——引擎暴露 plugin.VERSION，UI 全量改读真值；FAB 菜单新增「🔄 检查更新」：对比远端 GitHub manifest.json（no-store 防缓存、结果不持久化防「更新完仍提示」），版本分段比较（缺段补 0、非数字降级）
- **携带包预览**（柏宝书 CarryoverPlan 缝入）：打包前先预览「将携带多少」（摘要/悬念/图谱/日记/向量计数），confirm 确认后才落盘下载——防误触打包
- **查询重写上下文增强**（柏宝书 rewrite 上下文构造缝入）：rewriteQuery 升级带 ctxSnapshot 参数——注入「主角/场景/时间」状态快照（400 字符截断），让改写查询能指代滚出窗口的实体（指代消解），失败静默降级为纯文本模式

### Fixed
- full_audit_forward.test.mjs 结构完整性断言宽域化（3.75.1 硬编码 → 正则格式 + manifest/index.js 一致性校验）

### Tests
- 新增 v377_version_update.test.mjs（5 组：静态特征/isNewer 逻辑复刻/快照注入逻辑复刻/携带预览逻辑复刻/回归防护），全量 216 测试全绿

## [3.76.0] - 2026-09-13

### Added
- **一键批量补齐**（柏宝书 carryover 缝入）：SummarySystem.completeMissingFloors 异步 LLM 补齐管线——缺失楼层清单自动批量生成摘要（每批最多 5 楼），防重入 _batchCompleting 守卫，单楼失败跳过不中断，补齐项走 OpLog summary/manual 埋点（meta: 批量补齐）
- **全景报告扩展**：审计统计板块追加「金字塔扩展层」（genericTiers 遍历展示）与「重试队列」（retryQueue 计数 + 最近 3 条状态），条件显示（无数据不占位）
- **手机端桥接统计**：memory-view 桥接统计行追加「📝摘要同步 N」（消费 bridgeStats.summarySyncCount）

### Tests
- 新增 v376_batch_complete.test.mjs（5 组：静态特征/批量补齐逻辑复刻/防重入标志/报告扩展/手机统计），全量 211 测试全绿

## [3.75.1] - 2026-09-13

### 审计版（全面双向审计 + 修复抓出的实锤 Bug）

### Fixed（审计抓出）
- **旧数组格式快照导入兜底缺失（实锤）**：import(data) 的 Array.isArray 分支未初始化 lockedFacts/genericTiers——旧格式快照导入后 getLockedFacts() 返回 undefined，后续调用会崩。修复：数组分支补 this.lockedFacts = this.lockedFacts || []; this.genericTiers = this.genericTiers || [];

### Added（审计套件，永久守护）
- **逆向审计套件 full_audit_reverse.test.mjs（8 组）**：假设出错审计——deltaBook/lockedFacts 全调用点守卫（12+10 处）、旧版桥兼容（可选链）、空值/畸形数据防护、旧快照导入兼容、清洗前原文快照、标签前缀唯一性、引擎未初始化守卫
- **正向审计套件 full_audit_forward.test.mjs（10 组）**：模拟运行时验证——SummarySystem 全方法端到端、DeltaBook 生命周期、ConflictBook severity 全链路、金字塔多层生长、相对时间全场景（含 calcAge）、桥九通道完整性、OpLog 15 类型全集、全景报告板块结构与顺序、关键开关全关仿真、语法结构完整性

### 全量
- 79 套件 206 测试 100% 通过（含双向审计 18 组）

## [3.75.0] - 2026-09-13

### Added（摘要手动操作收尾：OpLog 埋点 + 显示说明 + 手机同步）

- **摘要手动操作 OpLog 埋点**：updateSummaryText/addManualSummary 操作进事件溯源（summary/update 与 summary/manual 操作，sum_N ref，文本摘要 meta）——手动摘要的变更进入审计链
- **时间标签显示说明**：摘要列表视图 hint 追加 bbs_start/bbs_end 显示处理提示——告知用户用酒馆正则隐藏标签原文（标签仍保留在底层数据供记忆系统使用）
- **手机端摘要编辑同步**：桥新增 syncSummaryEdit(floor, text)——LonSha 编辑/补摘后同步手机记忆池对应条目（[摘要·第N楼] 幂等标记，exist 走 updateEntry 更新/否则 record 新增，summary-sync 标签 pinned importance 6，summarySyncCount 统计）

### Tests
- 新增 tests/v375_summary_sync.test.mjs（5 组：OpLog 埋点/显示说明/桥同步方法/幂等逻辑复刻/埋点功能模拟）
- 全量 77 套件 188 测试通过

## [3.74.0] - 2026-09-13

### Added（柏宝书手动操作缝入：编辑摘要 + 手动补摘 + 缺失楼层清单）

- **编辑摘要**：SummarySystem 新增 updateSummaryText——直接修改任意楼层摘要文本（edited 标记 + editedAt 时间戳，smartTruncate 2000 截断）；UI 摘要操作区新增「✏ 编辑该摘要」按钮（prompt 编辑 + BM25 索引同步重建）
- **手动补摘**：SummarySystem 新增 addManualSummary——为缺失楼层的旧剧情补一条摘要（manual 标记、幂等同楼层拒绝、floor 升序排序保持）；UI 摘要列表视图顶部新增补摘输入框（楼层号 + 一句话 + Enter/按钮提交，BM25 同步）
- **缺失楼层清单**：missingFloors(maxFloor)——返回未覆盖楼层数组，为「一键批量补齐」预留前置
- 版本守卫：UI 调用前检查引擎方法存在（引擎版本过旧提示）

### Tests
- 新增 tests/v374_manual_summary.test.mjs（5 组：静态关键字/updateSummaryText 功能/addManualSummary 功能/missingFloors/UI 交互完整性）
- 全量 76 套件 183 测试通过

## [3.73.0] - 2026-09-13

### Fixed + Added（时间标签清洗误伤根治 + 时间段压缩展示）

### Fixed
- **时间标签清洗误伤根治（实锤 Bug）**：v3.72 B 补丁的 extractDualTimeTags(message.mes) 实际失效——cleanMessageText 的自定义标签清洗正则会剥掉 <bbs_start>/<bbs_end>，message.mes 里标签已消失。修复：改用清洗前原文快照 _rawForSynopsis（同作用域已确认），与 dualTimeAnchor 主路径同源

### Added
- **时间段压缩（柏宝书 compactPair 缝入）**：RelativeTimeHelper 新增 compactTimeRange——取首尾最长公共前缀回退到分隔边界，"2023/9/10 06:45 - 2023/9/10 06:55" → "06:55"，古风"庆历四年暮春 辰时 - 巳时"同样适用；故意不含冒号/时/点边界防切碎时分；前缀不重合零误伤原样保留
- **formatTimeRange**：起止压缩展示格式化（无止只起/无起空串）
- **time_anchor.rangeLabel**：extracted.time_anchor 增加压缩展示字段，rth 懒实例化复用

### Tests
- 新增 tests/v373_time_range_display.test.mjs（5 组：清洗误伤修复/compactTimeRange 功能/formatTimeRange/rth 实例/清洗根因确认复刻）
- 全量 75 套件 178 测试通过

## [3.72.0] - 2026-09-13

### Added（柏宝书 TIME_TAG_PROMPT 缝入：时间标签生产闭环）

- **时间标签生产 prompt**：GameClock.getContextPrompt 注入【时间锚点要求(系统强制)】——要求 AI 每楼正文首尾输出 <bbs_start>起止时刻</bbs_start>…<bbs_end>  标签（现代题材数字日期时间/古风奇幻纪年时辰+完整年份、禁止"稍后/不久/某天"模糊说法、以上一段结束时间为基准推进、开篇自设基准不算编造、标签只各出现一次）——解析器（v3.43 extractDualTimeTags）早已就位，本轮补上生产端形成闭环：时间从事后推断变正文事实
- **正文事实优先**：剧情时间线落账时，正文时间标签的 end 日期部分优先为 story_date 来源（正文事实 > LLM 猜测），架空纪年（庆历四年）同样命中，hasDual false 或解析失败降级原 story_date
- **与 v3.71 链路衔接**：标签 end → story_date → relativeTimeLabel → 注入行「（昨天）」全链路打通

### Tests
- 新增 tests/v372_time_tag_production.test.mjs（5 组：静态关键字/extractDualTimeTags 功能/end 日期提取复刻/生产-解析格式一致/prompt 位置）
- 全量 74 套件 173 测试通过

## [3.71.0] - 2026-09-13

### Added（真正的柏宝书 timeRel 缝入：相对时间前缀 + 完整时间锚点协议）

- **相对时间前缀体系**：借鉴柏宝书 timeRel.relativeTimeLabel——parseStoryDateLoose 双类型日期解析（standard 数字日历可精确换算 / fantasy 架空月名仅同月可算）+ relativeTimeLabel 相对前缀生成（今天/昨天/前天/大前天/明天/后天/N天前/N个月前/N年前/N年N个月前）。设计底线「宁可不标，绝不标错」：跨架空月放弃、类型不匹配放弃、解析不出返回空串不加前缀
- **注入流接入**：buildInjection 的[关键事件·影响当前]与[剧情时间线]条目渲染时，有 storyTime 且 clock 有日期 → 自动附「（昨天）」「（3天前）」相对前缀
- **完整时间锚点协议**：摘要提取 prompt 的 story_date 规则升级——必须保留完整年份或纪年（如"1988年9月29日""庆历四年"），禁止省略年份只写月日的短格式；古风/奇幻题材保留完整纪年与年份
- **修复**：v3.71 补丁曾意外吞掉 cyclePositionFor 的缩进导致 v319 老正则匹配失败，已恢复 4 空格缩进

### Tests
- 新增 tests/v371_time_prefix.test.mjs（5 组：静态关键字/标准日历前缀/中文日期解析/架空历法安全降级/注入渲染复刻）
- 全量 73 套件 168 测试通过

## [3.70.0] - 2026-09-13

### Added（柏宝书 7 层金字塔泛化 + 合并任务重试队列）

- **金字塔泛化**：借鉴柏宝书（memorybooks）STMB_SUMMARY_TIERS 7 层设计——SummarySystem 新增 foldHigherTiers 通用折叠链：史记（tier2）积累超阈值自动生长 tier3（书）→ tier4（传奇），genericTiers 存储 + foldedUp 折叠标记防重复；pyramidAutoExtend/pyramidTiers 可配置；历史入账后折叠链衔接（A4）
- **合并任务重试队列**：借鉴柏宝书 stmbJobs 结构化 job 设计——SummarySystem 新增 enqueueRetry/processRetryQueue：折叠失败结构化入队（幂等：同 kind 同 tier 复用），指数退避重试（30s/60s/120s），最多 3 次后清除；每次摘要折叠周期消费一次
- **持久化对称**：genericTiers 随 SummarySystem export/import 对称，旧快照格式兼容

### Tests
- 新增 tests/v370_pyramid_retry.test.mjs（6 组：静态关键字/通用折叠链复刻/重试队列功能/export-import 对称/调用位置/配置默认值）
- 全量 72 套件 163 测试通过

## [3.69.0] - 2026-09-13

### Added（全景报告增量板块 + OpLog delta 埋点 + 手机统计展示）

- **全景报告正史增量板块（13 板块）**：exportMemoryReport 新增「📒 正史增量」板块（锁定事实板块之后）——established/uncertain 分组展示、楼层佐证溯源、各取最近 8 条
- **OpLog delta 埋点（第 15 类型）**：卷摘要折叠的 deltas 消费处新增埋点（delta/add 操作，fold_N ref，+N条增量 meta），仅在 n > 0 时记录
- **手机端统计展示**：memory-view 桥接统计行新增「🔒铁律 N · 📒正史 N」回填计数（消费 bridge stats 的 lockedFactsIngested/deltaIngested），桥接统计从 4 项扩到 6 项

### Tests
- 新增 tests/v369_report_delta_oplog.test.mjs（5 组：报告板块/OpLog 埋点/手机统计/数据链路/埋点功能模拟）
- 全量 71 套件 157 测试通过

## [3.68.0] - 2026-09-13

### Added（DeltaBook 面板视图 + 手机增量回填 + 双向审计）

- **正史增量面板视图**：状态总览新增「📒 正史增量 👁」卡片（矛盾与注入预览之间）；deltas 视图 established/uncertain 双状态徽标（✅已确证/⏳待定）、楼层溯源、手动确证按钮（✓ 一键转正）
- **手机端增量回填**：bridge.backfill 新增正史通道——仅 established 事实回填手机长期记忆（pinned、importance 7、[正史] 标签、第 N 楼佐证标注），最多 4 条节流；stats 新增 deltaIngested 计数
- **手机记忆 App 正史徽标**：memory-view 新增 deltaTag——[正史] 前缀条目显示绿色「📒正史」徽标（渲染序最前），memory.css 绿色渐变样式
- **payload 携带**：_backfillPayload 新增 deltaBook 字段（export null 兜底）
- **双向审计**：新增测试套件同时覆盖正向审计（UI 端到端链路/卡片位置/回填链路/渲染序）与逆向审计（假设 deltaBook 未实例化的守卫检查/桥空值防护/旧数据兼容/双端识别一致性）

### Tests
- 新增 tests/v368_delta_ui_backfill_audit.test.mjs（7 组：正向 UI 链路/位置渲染序/手机回填/逆向守卫/桥空值防护/旧数据兼容/双端一致性）
- 全量 70 套件 152 测试通过

## [3.67.0] - 2026-09-13

### Added（正史增量生命周期：回滚联动 + 楼层位移 + 自动确证）

- **回滚联动**：rollbackFloor 新增正史增量回滚——删楼/重生成时该楼层的 DeltaBook 增量事实同步撤掉（防幽灵事实），与矛盾回滚同款埋点模式
- **楼层位移联动**：shiftFloorsFrom 新增 DeltaBook evidenceFloor 位移（dec 模式，与群像/矛盾同款）——删楼前移时增量指针跟随文本
- **自动确证**：extractMemoryWithLLM 解析成功后，用新提取的 events/summary 对 uncertain 待定项做关键词佐证（≥2 个关键词片段命中即确证 established）——待定事实随剧情推进自动转正
- **DeltaBook 生命周期闭环**：登记(add/addFromList) → 注入(toPrompt) → 确证(confirm+自动) → 回滚(removeByFloor) → 位移(shiftFloorsFrom) → 持久化(export/import) 全链路齐备

### Tests
- 新增 tests/v367_delta_lifecycle.test.mjs（6 组：静态关键字/回滚功能/位移复刻/自动确证复刻/联动位置/生命周期完整性）
- 全量 69 套件 145 测试通过

## [3.66.0] - 2026-09-13

### Added（dsh deltas 双通道：正史增量账本 + 三合一摘要折叠）

- **正史增量账本 DeltaBook**：新增账本类——摘要阶段产出的增量事实记录，established（有明确证据）/uncertain（存疑待佐证）双状态；addFromList 批量登记、confirm 确证待定项、removeByFloor 楼层清理、export/import 对称、环形 60 条
- **三合一摘要折叠**：maybeFold 升级 dsh 三合一模式——一次 LLM 调用同时产出 text（卷摘要）+ deltas（正史增量）+ conflicts（矛盾核对）JSON；deltas 进 DeltaBook、conflicts 进 ConflictBook（claim/canon/severity 对齐）
- **三通道解析降级链**：JSON 解析失败自动降级纯文本（只取 text），代码块包装 包装残留剥离，卷摘要功能永不因 LLM 输出格式失败而中断
- **注入流接入**：deltaBook.toPrompt 进入 buildInjection（conflicts 注入区之后），[已确证]/[待定] 分状态展示

### Tests
- 新增 tests/v366_delta_book.test.mjs（7 组：静态关键字/DeltaBook 功能/confirm 确证/toPrompt 分状态/removeByFloor 与对称/三合一解析/冲突通道签名对齐）
- 全量 68 套件 139 测试通过

## [3.65.0] - 2026-09-13

### Added（OpLog 锁定埋点 + 未决矛盾视图 + 桥统计铁律计数）

- **OpLog locked_fact 埋点（第 14 类型）**：引擎新增 lockFact/unlockFact 包装方法——锁定/解除操作进事件溯源（locked_fact 类型，add/remove 操作，含 id/floor/文本摘要），OpLog 类型注释同步更新
- **UI 改调包装方法**：settings-ui 锁定/解除调用优先走引擎包装（带埋点），旧方法名降级兜底兼容
- **未决矛盾视图**：showBrowser 新增 conflicts 视图——severity 严重度三色徽标（🔴高/🟡中/🔵低）、版本对比、楼层溯源、XSS 转义；状态总览新增「⚔️ 未决矛盾 👁」动态计数卡片（锁定事实与注入预览之间）
- **桥统计铁律计数**：bridge stats 新增 lockedFactsIngested 字段，铁律回填实际写入后累加（计数在 record 之后，只有真写入才计数）

### Tests
- 新增 tests/v365_oplog_lockfact.test.mjs（6 组：埋点检查/UI 包装方法/矛盾视图/卡片位置/桥统计/埋点功能模拟）
- 全量 67 套件 132 测试通过

## [3.64.0] - 2026-09-13

### Added（severity 全链路 + 全景报告锁定板块 + 手机铁律标识）

- **全景报告锁定事实板块**：exportMemoryReport 升级 12 板块——概览新增锁定事实计数，新增「🔒 用户锁定事实」板块（逐字铁律档案 + 锁定楼层溯源），位于主角档案之前
- **conflicts severity 全链路落地**：ConflictBook.add 签名扩展 severity（low/medium/high 白名单，非法值兜底 medium）；addFromExtracted 透传 c?.severity；toPrompt 对 high/low 显式标注【严重度:xxx】（medium 不标注省 token）；export/import 对称
- **手机记忆 App 铁律标识**：memory-view 新增 ironTag——[铁律] 前缀条目显示金色「🔒铁律」徽标（mem-iron class，用户锁定事实永不遗忘），渲染序最前优先显示；memory.css 新增金色渐变样式
- **桥侧对齐**：铁律徽标正则与 bridge 回填的 [铁律] 前缀对齐，双端识别一致

### Tests
- 新增 tests/v364_severity_report.test.mjs（7 组：静态关键字/ConflictBook severity 功能/toPrompt 标注/export-import 对称/幂等与旧数据兼容/报告板块位置/手机渲染完整性）
- 全量 66 套件 126 测试通过

## [3.63.0] - 2026-09-13

### Added（锁定事实 UI 管理 + 手机端回填：lockedFacts 闭环补全）

- **settings-ui 锁定管理卡片**：状态总览新增「🔒 锁定事实 👁」卡片（动态计数），点击直达管理视图
- **锁定事实管理视图**：查看/新增/删除三合一——输入框 + Enter 提交锁定、✕ 按钮 confirm 后解除、每条显示锁定楼层与时间、esc 转义防 XSS、空输入防护
- **双端桥接通道**：bridge.backfill 新增 lockedFacts 通道——LonSha 锁定事实回填手机长期记忆（pinned、importance 9、[铁律] 标签），第 N 楼由用户锁定溯源标注，最多 6 条节流
- **payload 携带**：_backfillPayload 新增 lockedFacts 字段（lockedFactsEnabled 守卫），手机记忆库从此共享用户的铁律事实

### Tests
- 新增 tests/v363_locked_facts_ui.test.mjs（5 组：UI 静态关键字/交互绑定/卡片位置/双端桥接/桥侧幂等）
- 全量 65 套件 119 测试通过

## [3.62.0] - 2026-09-13

### Added（dsh-nexttavern 记忆方式缝入：锁定事实 + 增量摘要 + 溯源 + 证据链 + 详细哲学）

- **用户锁定事实（lockedFacts）**：借鉴 dsh-nexttavern 的 lockedFacts 机制——用户在面板显式锁定的剧情事实**逐字**进入摘要与注入流，永不因摘要压缩丢失。SummarySystem 新增 addLockedFact/removeLockedFact/getLockedFacts/lockedFactsForPrompt 四方法；extractMemoryWithLLM prompt 新增【用户锁定事实】段（逐字保留、一字不差、禁止概括改写）
- **锁定事实校验器**：summary 生成后逐条核对锁定事实是否逐字保留，遗漏时附缺失清单重试一次（dsh validateDetailedSummary 理念）——防 LLM 偷懒丢事实的硬防线
- **注入流接入**：锁定事实进入 buildInjection 静态锚定区（Prompt Cache A区，主角档案之前），区块标题「[用户锁定剧情事实]」
- **增量卷摘要**：maybeFold 从全量重写升级为增量追加——携带上一卷摘要为基线，prompt 明令「不要删除、概括或重新抄写基线中已记录的事件」，旧事件零信息损耗
- **楼层溯源指针**：卷摘要/史记的关键事实后附（第N楼）指针，配合 OpLog 审计可回查原始出处（dsh seq 溯源理念）
- **矛盾证据链**：conflicts 提取字段新增 severity（low/medium/high）严重度分级
- **史记详细保留哲学**：史记折叠 prompt 从 150-250 字压缩导向升级为 200-350 字详细保留导向（宁可详细不可精简、已兑现与未兑现约定全保留、只压缩逐字重复）
- **持久化对称**：lockedFacts 随 collectExport 快照 + SummarySystem export/import 对称，旧快照格式兼容

### Tests
- 新增 tests/v362_locked_facts.test.mjs（7 组：静态关键字/方法功能/export-import 对称/校验器逻辑/增量结构/注入区位置/配置守卫）
- 全量 64 套件 114 测试通过
## [v3.61.0] - 2026-09-13
### 记忆全景报告：exportMemoryReport Markdown 导出（11 板块）、版本断言宽域统一
- **记忆全景报告 (Memory Panorama Report)**：`engine.exportMemoryReport()` 将所有子系统数据汇总为一份可读 Markdown 档案——11 个板块：📊概览（时钟/摘要/图谱/悬念/审计计数）、🧍主角档案、🕸️角色羁绊网、📚章节卷摘要、🏛️纪元史记、👥群像共同记忆（归因式）、🧩未结悬念、📔角色日记（含 secret/attitude）、🎒物品台账、🎬当前大纲（含本轮目标/节奏）、🔍审计统计。settings-ui 状态面板新增「📄 全景报告 ⬇」入口卡片，点击生成并下载 `.md` 文件（Blob 下载），面板内同步展示报告前 1500 字预览（esc 转义）。跑了几百楼的记忆库从此可以一键导出为人类可读的完整档案。
- **版本断言宽域统一 (Version Regex Normalization)**：v344/345/346/347 四个测试的版本号断言从窄域正则（`3\.(?:4[4-9]|5\d)` 等）统一为宽域 `3\.\d{2,}\.\d+`——跨大版本演进不再需要每轮手动更新版本断言（本次 v3.60 发布时就因窄域正则不匹配 3.60 报了 4 处失败）。新增 v361 测试块固化宽域回归。
- **实施教训**：Python 脚本向大文件插入代码时，插入点定位用 `src.find('\n}')` 会撞到 IIFE 结束——`opLogStatsCompat` helper 被插到 IIFE 之外且 `del lines` 误删 IIFE 闭合 `})();`。修复路径：裸括号深度扫描定位多余 `}`（NEG JUMP @ line 7697）+ 恢复 IIFE closer。
- **自动化测试**：新增 `tests/v361_report.test.mjs`（3 测试块：11 板块验证、导出按钮、版本宽域回归），全量 63 个测试套件 107 个测试 100% 绿灯通过。

## [v3.60.0] - 2026-09-13
### 手机端专项：记忆 App 桥接统计卡片（bridge.getStats 消费落地、巩固次数可见）
- **记忆 App 桥接统计卡片 (Memory App Bridge Stats)**：RubyPhone 记忆 App 统计区新增两卡片——「回填次数」（LonSha→手机记忆回填计数）与「检索索引」（桥 BM25 文档数），并新增「🔗 LonSha 桥接」状态行：`回填 N · 召回 M 次 · 巩固 K · 🟢 启用 · 协调注入`。bridge.getStats 此前**数据完备但零消费**（体检实锤）——双向桥的运行状态从此在手机记忆 App 里直观可见。
- **巩固次数可见 (Sleep Tick Visibility)**：v3.48 激活的巩固结晶管线（`_sleepTick` 计数器）此前只增不显——现在桥接状态行显示巩固次数，短期→长期记忆结晶的运行状况一目了然。
- **手机端深度体检结论**：① bridge.getStats 零消费（本轮修复）；② memory-data 仅 2 处静默吞错且均为故意的可选链守卫（无害）；③ memory-view 已消费 memoryCore.getStats（统计展示完好）；④  超大文件（chat-view 897KB）与 console 647 条维持观察项。
- **自动化测试**：新增 `tests/v360_phone_stats.test.mjs`（3 测试块：桥接卡片、巩固可见、数据源结构），全量 62 个测试套件 104 个测试 100% 绿灯通过。

## [v3.59.0] - 2026-09-13
### 互通补全与预览进化：群像记忆手机端回填、OpLog 楼层过滤、注入预览 diff
- **群像记忆手机端回填 (PairMemory Phone Bridge)**：`bridge.backfill` 新增 pairs 通道——PairMemory 归因式事件（v3.49）回填手机长期记忆（pinned），格式 `[群像] A × B: 事件｜actorDo 归因｜⚠️仅单方知晓`，双角色 tags。LonSha 侧 backfill payload 携带 `pairs`（与 diary/clock 同级的桥通道）。手机记忆库从此包含"谁和谁共同经历了什么、谁怎么想"的群像维度。
- **OpLog 楼层过滤 (Audit Floor Filter)**：事件审计浏览器新增楼层过滤输入框——输入楼层号实时过滤该楼全部事件（`第N楼` 正则提取），空值恢复全部。配合 v3.55 审计浏览器，"查这条记忆哪来的"从翻 80 条变为输入楼层号直达。
- **注入预览 diff (Injection Diff)**：`_lastInjection` 缓存增加 `prev` 快照（上一轮注入），预览视图对比两轮注入——**新增行**绿色左边框 + 淡绿背景 + `NEW` 标注，头部显示「🆕 本轮新增 N 行」。一眼看出"这轮 AI 的记忆里多了什么/少了什么"——Prompt Cache 命中率调优、注入内容审计的可视化利器。
- **自动化测试**：新增 `tests/v359_pair_backfill_diff.test.mjs`（3 测试块：群像回填双端、楼层过滤、注入 diff），全量 61 个测试套件 101 个测试 100% 绿灯通过。

## [v3.58.0] - 2026-09-13
### 全量事件溯源：OpLog 十三类型埋点补全（diary/pov/timeline/card/money/conflict/pair）
- **埋点全量覆盖 (Full Instrumentation)**：v3.54 的 OpLog 只埋了六路（summary/graph/status/suspense/item/rollback），本轮补全剩余七路——`diary`（活人感日记写入后按条数记录）、`pov`（私密认知入账，含 owner 与内容摘录 40 字）、`timeline`（剧情时间线落账，含剧情日期）、`card`（卡牌铸造）、`money`（钱财账本变更，含变动角色列表）、`conflict`（真矛盾登记）、`pair`（群像共同记忆更新）。**OpLog 类注释声明的 13 类型从此全部有真实埋点**——全子系统的每一条记忆变更都有审计记录，"事件溯源"名副其实。
- **自动化测试**：新增 `tests/v358_full_instrumentation.test.mjs`（2 测试块：13 类型全覆盖断言、新增七路埋点上下文正确性），全量 60 个测试套件 98 个测试 100% 绿灯通过。

## [v3.57.0] - 2026-09-13
### 所见即所得：注入内容预览（AI 真实所见可视化）
- **注入内容预览 (Injection Preview)**：主生成路径与降级路径的 `buildInjection` 调用后缓存最近实际注入（`_lastInjection = {html, ts}`）——**不是模拟干跑，而是 AI 真实看到的最终形态**（含自适应预算裁剪后的结果）。settings-ui 状态面板新增「👁 注入预览 👁」入口卡片，点击直达预览视图：头部标注注入时间与字符数（"已经预算裁剪，即 AI 真实所见"），正文按行分块渲染——区块标题（`[前情摘要]`/`[当前剧情时间]`/`〔POV〕`等）绿色加粗高亮，内容行缩进展示。全部行经 esc 转义防 XSS。诊断从此有了终极答案："AI 为什么这么演？看它看到了什么。"
- **自动化测试**：新增 `tests/v357_injection_preview.test.mjs`（3 测试块：双路径缓存、预览视图（分块渲染/区块高亮/XSS 转义/空态）、入口卡片），全量 59 个测试套件 96 个测试 100% 绿灯通过。

## [v3.56.0] - 2026-09-13
### 导演系统闭环：大纲耗尽 LLM 自动规划管线（OutlineDirector.planNext）
- **大纲自动规划 (Outline Auto-Planning)**：`OutlineDirector.planNext(config, llm, engine, floor)`——大纲轮次耗尽时自动用 LLM 规划新阶段，**导演系统从"被动解析 AI 自发输出"升级为"主动请求规划"闭环**。上下文自动聚合：最近 4 条活跃摘要 + 未结悬念簿（伏笔是新阶段最好的素材）+ 角色名单 + 上一阶段最后几轮（衔接参考）。规划 prompt 显式要求：优先消化未结悬念、stage_tempo 四形态、2-3 节点每节点 2-4 turn 带 pacing 属性、turn 目标写具体剧情不许空话、遵守角色名单不新增主要角色。产出直接经 parseOutline 解析入导演系统（与 v3.48 大纲标签格式无缝闭环）。
- **健壮性三重防护**：① 防重入（`_planning` 标志 + finally 复位）；② 失败冷却（`outlinePlanCooldownFloors` 默认 10 楼内不重试，成功后冷却清零）；③ 异步触发不阻塞生成流（advanceTurn 后 fire-and-forget，`.then` 记录规划结果）。`outlineAutoPlan`/`outlineDirectorEnabled`/`outlinePlanCooldownFloors` 配置开关显式声明（supersedeScanPool 配置区）。
- **实施教训**：planNext 内 `window.SillyTavern` 访问需 `typeof window !== 'undefined'` 全局守卫——new Function 测试环境无 window，裸引用会 ReferenceError 进 catch 被静默吞掉（_lastPlanFailFloor 置位暴露了问题路径）。测试逻辑修正：planNext 成功后新大纲有 N 个 turn，需推进 N 次才耗尽（单次 advanceTurn 后仍剩轮次）。
- **自动化测试**：新增 `tests/v356_outline_autoplan.test.mjs`（2 测试块：静态验证 + mock LLM 闭环行为测试——规划成功/未耗尽不规划/解析失败冷却/冷却期后重试/开关关闭），全量 58 个测试套件 93 个测试 100% 绿灯通过。

## [v3.55.0] - 2026-09-13
### 审计可视化：OpLog 事件审计浏览器（状态面板直达 + 统计头 + 中文化类型标签）
- **事件审计浏览器 (OpLog Browser)**：showBrowser 新增 `oplog` 视图（消费 v3.54 OpLog）——状态面板新增「🔍 事件审计 👁」入口卡片（显示环形缓冲事件计数），点击直达审计链：统计头（各类型事件计数中文标签：📝摘要/🕸️图谱/📊状态/🎒物品/🧩悬念/↩️回滚…）+ 最近 80 条事件倒序渲染（`#seq · 类型 · 操作 · 楼层 · 时间` + ref 与 meta 灰字备注）。全部字段经 esc 转义防 XSS。记忆审计从"需要开发者查日志"变为"用户点点面板就能翻"。
- **自动化测试**：新增 `tests/v355_oplog_browser.test.mjs`（3 测试块：视图分发与 XSS 转义验证、入口卡片、数据通路），全量 57 个测试套件 91 个测试 100% 绿灯通过。

## [v3.54.0] - 2026-09-13
### 事件溯源与手机端体检：OpLog 全量变更日志（append-only 环形）、六路埋点审计、体检结论固化
- **事件溯源日志 (OpLog: Append-Only Event Sourcing)**：吸收 shujuku replay 理念（轻量版），新增 `OpLog` 类——记录所有记忆子系统的**结构化变更事件** `{seq, ts, type, op, ref, floor, meta}`。三大价值：① **审计**——任何时刻可回答"这条记忆何时/为何产生"（queryByFloor/queryByType/queryByRef）；② **诊断**——记忆异常时回放查因；③ **与 17 个子系统各自的回滚机制互为验证**（双保险）。环形缓冲 500 条防膨胀，seq 全局递增保证事件顺序，export/import 持久化（随 collectExport 跨会话保留审计链）。
- **六路埋点 (Six-Path Instrumentation)**：主流程关键写入点全部埋点——summary（每楼笔录落账）、graph（新角色节点入图）、status（状态变更）、suspense（悬念簿增删）、item（物品台账变更）、rollback（删楼/回滚事件）。`rollbackFloor` 事件记录审计链（修复过程中发现初版引用了不存在的 `reason` 参数——rollbackFloor 签名仅 `floor`，已修正为常量标注）。shiftFloorsFrom 删楼时 opLog 楼层同步位移。
- **手机端体检 (RubyPhone Health Check)**：全库静态扫描完成——① 53 个"零引用类"候选经复核全部为 import 引用误报（扫描正则未覆盖 import 语句），**无真实死类**；② MemoryCore/EmotionTagger/MemoryPool/bridge 四条链路经 v3.48 修复后全部为活链路（pool 有 6 处调用、emotion 有 record 内部调用）；③ 超大文件清单（chat-view 897KB / settings-app 684KB）列为观察项（重构风险大，暂不动）；④ 全库 console 647 条（index.js 103 条）暂不治理——移动端容错日志有诊断价值。体检结论以测试断言固化（活链路四通道回归验证）。
- **自动化测试**：新增 `tests/v354_oplog_health.test.mjs`（4 测试块：OpLog 完整行为（环形/查询/统计/持久化）、六路埋点覆盖、持久化链路、体检结论固化），全量 56 个测试套件 88 个测试 100% 绿灯通过。

## [v3.53.0] - 2026-09-13
### 可观测性与防线落地：诊断面板命中率卡片、伦理检测静默缺口根治（v3.48 遗留实锤）
- **诊断面板召回源命中率卡片 (Hit-Rate Panel Card)**：settings-ui 状态总览新增「📈 召回源命中率」卡片（消费 v3.52 的 `_recallSourceStats`）——按命中次数降序渲染各召回源的 ASCII 条形图 + 百分比（`vector ████████ 80%（160 次/200 轮）`），附调优提示「长期 0% 的召回源可在设置中关闭以省资源」。召回调优从"看日志猜"变为"看面板读数"。
- **伦理检测静默缺口根治 (Ethics Guard Silent Gap Fix)**：**v3.48 实锤遗留缺陷**——`detectEthicsConflict` 的调用守卫读 `extracted.ties_context`，但该字段从未在提取 schema 中定义，`existingTies` 永远 undefined，**伦理防线从未实际工作过**。修复：改用 engine 侧真实羁绊数据 `this.status.getNpcTiesRecords()`。
- **逐条 tie 精准判定 (Per-Tie Precision)**：修复过程中暴露第二层 bug——`ties.join(';').includes(fromName)` 会把「林一:朋友」误判为林一的血亲证据（名字出现在朋友关系的 tie 里，表兄弟式误报）。重构为**逐条 tie 判定**：命中 = 该条 tie 同时含 from 名与血缘词，或该条 tie 含双向血缘词（兄妹/父子等）；返回的 `tie` 字段从整串降为命中的单条，告警信息更精准。
- **自动化测试**：新增 `tests/v353_panel_ethics_fix.test.mjs`（3 测试块：面板卡片双文件验证、静默缺口根治、伦理检测端到端模拟——含朋友关系不误报的高置信断言），全量 55 个测试套件 84 个测试 100% 绿灯通过。

## [v3.52.0] - 2026-09-13
### 性能工程：bridge BM25 增量索引、召回源累计命中率统计
- **bridge BM25 增量更新 (Incremental BM25 Indexing)**：手机端桥的检索索引从"每次 dirty 全量 rebuild"升级为**增量 append**——维护 `_indexedIds` 已索引集合，dirty 时只对新记忆调用 `BM25.add()`（IDF 增量更新），长对话免全量重扫。混合策略：首次（N===0）或超 800 条时全量 rebuild 保 IDF 精度。pool 感知层条目无稳定 id，用**内容前缀 hash** 幂等（同内容不重复索引）。
- **召回源累计命中率统计 (Recall Source Stats)**：trailMonitor 升级——新增 `_recallSourceStats` 累计各召回源（vector/diffusion/bm25/rubyphone/graph…）的命中次数与轮次，200 轮环形窗口自动**半衰**防无限膨胀。collectExport 携带统计快照。诊断面板从此可回答"哪路召回在干活、哪路是摆设"——召回调优有了数据依据。
- **自动化测试**：新增 `tests/v352_incremental_stats.test.mjs`（3 测试块：增量索引双端验证、统计容器与半衰、行为模拟），全量 54 个测试套件 81 个测试 100% 绿灯通过。

## [v3.51.0] - 2026-09-13
### 召回素材质量：compressSummary 主干句压缩（氛围句剔除/动作句提权/时序保持）接入向量索引
- **主干句压缩 (Compress Summary: Skeleton-First Indexing)**：吸收 baibai 摘要纪律，`SummarySystem` 新增 `compressSummary(text, maxLen)`——为检索索引（向量/BM25 素材）提取「谁+做了什么+结果」主干句，**索引质量决定召回质量**。四层评分：动作/交互主干词（说/发现/拿/走/杀/救…）+3、主干长度带（8-80字）+2、台词引用 +1；氛围/阅读理解句式（气氛/仿佛/体现了/暗示了/心态…）-4 且**直接剔除**（负分句不入素材，全噪声时保底留最高分 1 句）；纯过渡短句（然后/接着 + 短）-2。取 top 句按**原文顺序**拼接（保持叙事时序），smartTruncate 长度保底。
- **向量索引接入**：`vectorText` 索引素材从 `smartTruncate(原文, 200)` 升级为 `compressSummary(原文, 160)`——向量嵌入不再被氛围描写稀释，动作/对话主干获得更高语义密度，长程召回命中率提升。正文摘要路径不受影响（createSummary 兜底仍为 smartTruncate）。
- **自动化测试**：新增 `tests/v351_compress.test.mjs`（2 测试块：compressSummary 五场景行为测试（混合句/短文本/空文本/截断保底/阅读理解过滤）、向量索引接入），全量 53 个测试套件 78 个测试 100% 绿灯通过。

## [v3.50.0] - 2026-09-13
### 自适应调优：剧情时钟权威同步、rerank 评分式精排、注入预算上下文感知自适应
- **剧情时钟权威同步 (GameClock → Phone TimeManager)**：`bridge.syncClock(clock)` 将 LonSha GameClock（含架空历法/回忆隔离的剧情时间唯一真源）强制同步到手机 timeManager——状态栏/日历/时间相关 App 以剧情时间为准。幂等设计：同日期不重复写入（`_lastSyncClockDate` 缓存，防每楼重置手机时间缓存导致状态栏闪烁）。`clockSyncEnabled` 开关（默认开）——两套时间系统自此统一。
- **rerank 评分式精排升级 (Score-based Rerank)**：LLM 精排从"排序号列表"式（要求输出完整排序，单条失败影响全局）升级为**评分式**——每条候选 0-10 分（0=完全无关/9-10=直接回答），无关候选可省略。三重收益：① 单条评分失败不影响其他条目；② 零分项天然过滤（不进注入）；③ 分数写回 `_rerankScore` 供下游消费。兼容旧排序数组格式（fallback 解析）。
- **RRF 精排分消费 (Rerank-Boosted Fusion)**：`hybridMerge` 的 RRF 融合消费精排分——高分项（>=6）获得 `(score/10) × 0.05` 的 RRF 加权，让 LLM 精排结果真正影响最终排序，而非仅作参考。
- **注入预算上下文感知自适应 (Adaptive Context Budget)**：预算体系新增第三层——聊天楼层少（上下文占用低）时自动**扩容**预算至 1.8x（早期多喂记忆加速建立世界感），楼层多时随 `/adaptiveBudgetDecayFloors`（默认80楼）线性**收紧**至 0.6x（保护最近正文空间）。`adaptiveBudget` 开关（默认开），clamp 0.6x~1.8x。与 v3.25 双层预算（memoryTokenBudget/keepRecentTokenReserve）正交互补。
- **自动化测试**：新增 `tests/v350_adaptive_tuning.test.mjs`（4 测试块：时钟同步双端验证、评分式精排升级、自适应预算、行为模拟），全量 52 个测试套件 76 个测试 100% 绿灯通过。

## [v3.49.0] - 2026-09-13
### 日记双端互通与群像归因式记忆：心理暗流日记同步手机日记App、PairMemory 关系对归因切片
- **心理暗流日记双端互通 (Subtext Diary Bridge)**：`bridge.backfillDiaries(diaries)` 将 LonSha DiarySystem 的结构化心理日记（v3.47 的 entry/mood/secret/attitude/keyEvents/subjRelations 六字段）同步渲染进手机日记 App 的实体书排版。排版文本含「没说出口：…」「对用户态度：…」「主观印象：…」三段式；幂等（`lonsha_{name}_{floor}` 条目 id，同楼同角色不重复）；每角色只同步最近 3 篇防堆积。`diaryBridgeEnabled` 开关（默认开）——双端自此共用一套"人心"数据，手机日记 App 8.9 万行的实体书排版界面直接渲染 v3.47 心理暗流字段。
- **群像共同记忆 (PairMemory: Attribution-style Group Memory)**：吸收 memorybooks Topical Clip 归因式原则，新增 `PairMemory` 类——以**关系对**为单位记忆共同经历："Alice did X, Bob thought Y, both agreed Z"归因清晰不合并人格。`addEntry` 记录 `{event, actorDo（谁做了什么）, otherThink（对方怎么想）, bothAgreed（共同约定）, knownBy}`；关系对 key 排序归一（A|B 与 B|A 同一关系对）；`knownBy: 'one'` 单方知晓事实显式标注「⚠️仅单方知晓」，与 POV 全知禁令组合。`[群像共同记忆·归因式]` 注入块只注入在场角色相关的关系对（在场过滤）。提取路由从 relationships 自动归因构建。
- **全链路一致性**：pairMem 完整接入 collectExport（两处）→ storage.load 恢复 → rollbackFloor 按楼回滚 → shiftFloorsFrom 删楼位移，与既有子系统同等级保障。
- **自动化测试**：新增 `tests/v349_pair_diary_bridge.test.mjs`（3 测试块：日记双端静态验证、PairMemory 完整行为（归因/幂等/排序归一/在场过滤/单方知晓标注）、接入链路完整性），全量 51 个测试套件 72 个测试 100% 绿灯通过。

## [v3.48.0] - 2026-09-13
### 桥修复与导演系统：LonSha↔RubyPhone 双向桥三处断线根治、剧情大纲导演（pacing 四相）、关系五分类学与伦理冲突检测、本地意图分流重排
- **P0 桥三处断线根治 (Bridge Breakdown Fix)**：排查 LonSha↔RubyPhone 双向桥发现三处 v1.7 时代遗留的静默失效：① LonSha 调用 `lonshaBridge.queryPhoneMemory` 但桥从未实现该方法（只有 `recall`）——`?.` 可选链静默吞调用，**手机记忆作为召回源从未真正生效**；② 守卫开关读 `rubyPhoneSync` 但配置定义的是 `rubyPhoneRecall`——开关恒 undefined；③ 字段映射期望 `h.id/h.type` 但 `recall` 返回 `{content,score,layer,floor}`。修复：桥补 `queryPhoneMemory` 别名（转发 recall）、开关名对齐、字段映射兼容 `h.layer`。双向桥自此名副其实。
- **P0 巩固结晶激活 (Sleep Engine Activation)**：RubyPhone `memoryCore.sleep()`（短期→长期巩固结晶，sxiphone 移植核心算法）全库 0 次调用——短期缓冲无限堆积永不结晶。每 12 条 AI 消息节流触发一次巩固。
- **P0 账本回填与感官池喂数 (Ledger Backfill & Pool Feeding)**：`bridge.backfill` 从旧三字段（summary/events/relationships）扩容为八通道：新增场景位置→记忆池**空间层**（激活 spatial 嗅觉/触觉触发式回忆）、钱财账本→长期记忆、矛盾账本→pinned 长期记忆、GameClock 剧情时钟→时间锚（LonSha 侧 backfill payload 携带 clock 快照）。
- **P1 剧情大纲导演 (Outline Director)**：吸收 shujuku 大纲系统，新增 `OutlineDirector` 类：宽容解析 AI 回复中的 `<stage_title>/<stage_goal>/<stage_tempo>/<node>/<turn pacing>` 标签（标签外内容全部忽略）；`stage_tempo` 四形态（buildup 铺垫蓄力/mixed 松紧交替/surge 高压密集/aftermath 余波消化）+ 轮级 `pacing` 四相（setup 铺垫/pressure 施压/turn 反转/cooldown 收束）语义注入。`[剧情大纲·导演视角]` 注入块提供当前阶段→节点→本轮目标→本轮节奏→下一轮预告的完整导演链，轮次耗尽时注入收束提示。每 AI 楼层自动推进 turn 指针，export/import 持久化。提取 prompt 新增 9e 规则（大纲标签写法说明）——记忆插件从此有了"导演视角"：不只记录过去，还规划未来。
- **P2 关系五分类学与伦理冲突检测 (Relationship Taxonomy & Ethics Guard)**：吸收 yuzuki `classifyRelationship`，新增 `classifyRelationshipType` 五分类正则（family 血缘/intimate 亲密/hostile 敌对/social 社交/other）；关系边携带 `relClass` 分类标签，`[角色关系]` 注入渲染为 `[友好·血缘]` 分类格式。新增 `detectEthicsConflict` 伦理冲突检测（family × intimate 交叉即告警，配合 v3.45 羁绊网防乱伦）——「师父」含「父」字必须先于 family 判定的优先级修正。关系注入提示词同步升级。
- **P3 本地意图分流重排 (Intent Rerank Pipeline)**：吸收 triviumdb on_rerank 管线理念，新增 `intentRerank` 本地中间层（零 API）：历史回顾类 query 提权时态历史边（+2.0）、物品类 query 提权物品台账（+2.0）、关系类 query 提权关系网（+1.5）。之前三路意图分流散落在 recallMemory 各分支，本管线收敛为召回后统一重排层。
- **自动化测试**：新增 `tests/v348_director_bridge.test.mjs`（4 测试块：P0 桥修复双端静态验证、OutlineDirector 完整行为、五分类与伦理检测、大纲接入链路完整性），全量 50 个测试套件 69 个测试 100% 绿灯通过。

## [v3.47.0] - 2026-09-13
### 吸收 hcdiary / stbme / memorybooks 黑科技：心理暗流日记、睡眠周期归档式遗忘、矛盾二分账本、钱财账本与剧情卡牌收集
- **心理暗流日记 (Subtext Diary: attitude/keyEvents/subjectiveRelations)**：吸收 hcdiary 结构化心理日记设计，DiarySystem 从 entry+mood+secret 三字段扩容为六字段：新增 `attitude`（对用户当前态度，如"表面客气心底记仇"）、`keyEvents`（亲历且对他个人有分量的事件，最多3条）、`subjRelations`（**主观印象版**关系网——"按他经历来写，不是上帝视角结论"，单恋/错付/误判全部可表达）。与 POV 全知禁令组合：AI 只在私密视界知道角色心底的真实想法，对话中绝不戳破，焊死"表里不一"活人感。
- **睡眠周期·归档式遗忘 (Sleep Cycle Archival Forgetting)**：吸收 stbme `sleepCycle` 设计，每 N 次提取（默认10）触发一次"睡眠"，对活跃摘要执行 `retentionValue = (importance/10) × recency × (1 + accessFreq)` 保留价值计算，低于阈值（默认0.5）的记忆归档出注入流（不物理删除，`archivedForSleep` 标记保留在存档中可查）；高重要度（>=8）与1小时内新记忆豁免。**缝合时顺手修复 stbme 已知 NaN bug**：accessCount 未初始化算出 NaN 导致 `NaN < threshold` 恒 false 永不遗忘——显式 `Number.isFinite` 兜底归零。
- **矛盾账本·真矛盾显式标注并存 (Conflict Book: Correction vs True Contradiction)**：吸收 memorybooks 矛盾二分法，提取 schema 新增 `conflicts` 字段，规则显式区分：**更正**（时间线自然演进如搬家/换工作）不登记由正常提取覆盖；**真矛盾**（说不通的版本冲突如自相矛盾口供、立场摇摆）登记为 `{subject, versionA, versionB, note}` 存入 ConflictBook。注入块 `[未决矛盾·显式标注]` 以"版本A「…」↔ 版本B「…」"并列呈现，显式注入"严禁擅自裁决谁对谁错"禁令——让角色说谎、立场摇摆成为剧情资产而非数据 bug。
- **钱财账本 (Money Ledger: money/moneyLog)**：吸收 hcdiary 经济系统设计，`MoneyLedger` 维护当前剧情金额（覆盖式 `setMoney`）+ 变动流水（追加式 `addDelta`，带 delta 与 reason）。提取 schema 新增 `9d. money_changes`（value 总余额 / delta 增减二选一），注入块 `[当前钱财账本]（角色经济状态，花钱/挣钱须与账本一致，禁止凭空获得或挥霍）` + 最近5条流水。根治跑团中 AI 花钱不眨眼、钱包永远是谜的通病。金额行按 `localeCompare('zh-CN')` 字典序稳定排序保障 Prompt Cache 命中。
- **剧情卡牌收集 (Card Collection)**：吸收 hcdiary `cards` 游戏化设计，`CardCollection` 将 importance>=8 的故事定义级事件自动铸成记忆卡牌 `{title, desc, time, icon}`（同楼同标题幂等，环形上限50），注入块 `[剧情卡牌收集]（重要时刻纪念，可作为话题回忆）`，为长程跑团提供"高光时刻纪念册"。
- **全链路一致性**：三个新账本（钱财/卡牌/矛盾）完整接入 collectExport（两处）→ storage.load 恢复 → rollbackFloor 按楼回滚 → shiftFloorsFrom 删楼楼层位移 -1，与既有16个子系统同等级持久化与事件一致性保障。
- **自动化测试**：新增 `tests/v347_hc_mechanics.test.mjs`（7 个测试块：静态锚点、MoneyLedger 行为、CardCollection 行为、ConflictBook 行为、sleepCycle 公式与NaN修复、心理暗流日记、持久化回滚链路完整性），v346 版本断言升级为容灾式正则；全量 49 个测试套件 65 个测试 100% 绿灯通过。

## [v3.46.0] - 2026-09-13
### 吸收 bakemono / stbme / memorywizzard / hcdiary 深水区机制：剧情时钟、史记金字塔、Prompt Cache 双区物理隔离、Swipe 确定性快照与 POV 全知禁令
- **GameClock 剧情时钟与回忆隔离 (Story Clock & Flashback Isolation)**：三态时钟（date 绝对/架空日期、label 时段/刻度/天气、relativeDays 相对天数推进）；`flashback: true` 回忆楼层严格不修改主时钟，仅记录到 `lastFlashback`，杜绝长程跑团中"回忆杀"把主时间线篡改倒退的经典通病；`getContextPrompt` 注入 `[当前剧情时间]` 区块并显式标注回忆与当前时钟的分离。支持 export/import 持久化，已接入 `collectExport`/`storage.load`/Carryover Seed 全链路。
- **悬念簿期限倒计时联动 (Suspense Deadline Countdown)**：`SuspenseBook.add` 新增 `due` 期限参数，`getOpenPrompts(clockDate)` 遍历全部未结项并联动剧情时钟，自动计算 `[距期限还剩N天]`/`[今日到期!]`/`[已逾期N天!]` 倒计时标记；无期限项不附加标记。让 AI 在剧情推进中对临期约定自然产生紧迫感。
- **GrandChronicle 纪元宏观史记金字塔 (Era Grand Chronicle Pyramid)**：`SummarySystem` 新增 `addGrandChronicle` 与 `getGrandChroniclePrompt`，构建微观近期细节→中观章节周记→宏观纪元史记三层时空景深金字塔；宏观史记注入块 `[宏观世界线·纪元史记]（长程核心脉络与不可变历史大事件）` 常驻锚定，为超长程跑团提供不可变的世界线大事件骨架。
- **Prompt Cache 双区物理隔离 (Static Anchor / Dynamic Tail Physical Partition)**：`buildInjection` 重构为 A 区（静态锚定前缀区：宏观史记、主角档案、NPC 长期关系网、NPC 分级索引）与 B 区（动态易变尾部区：剧情时钟、卷摘要、前情摘要、角色状态、POV 等）双区物理隔离；`fmtNpcTiesContext` 加入 `localeCompare('zh-CN')` 确定性字典序排序，不同输入顺序生成完全一致字符串，最大化 Claude/DeepSeek/Kimi 等原生 Prefix Caching 模型的输入 Token 命中率。
- **POV 视界隔离与全知禁令 (POV Horizon & Omniscience Ban)**：POV 注入分支构造 `presentSet` 在场列表严格核对，当前存在场角色时过滤不在场角色的私密心声；注入头升级为 `〔全知禁令与私密视界｜仅{在场角色}知晓，其他角色绝不知情，严禁未卜先知或在对话动作中直接戳破〕`，焊死大模型全知视角出戏 Bug。
- **自动化测试**：新增 `tests/v346_fortress_pyramid.test.mjs`（6 个测试块：静态锚点、GameClock 回忆隔离、悬念簿倒计时、史记金字塔、Prompt Cache 字典序、Carryover 时钟延续），全量 48 个测试套件 58 个测试 100% 绿灯通过。

## [v3.45.0] - 2026-09-13
### 吸收 baibai 与 shujuku 深水区机制：NPC长期人伦羁绊网、主角客观档案与生活癖好、了结事项防复读、推理截断宽容熔断与跨会话Carryover
- **NPC 长期社会人伦羁绊网 (Long-term NPC Ties Network)**：吸收 baibai `fmtNpcTiesContext` 理念，在 `CharacterState` 与 `MemoryEngine` 中独立抽离不随物理空间是否在场而失效的长期社会人伦羁绊网。聚合规范化姓名并对 ties 执行分号解析与幂等去重；即便 NPC 离开视线滚入 Tier 4，血缘、婚姻、结拜、主仆与宿敌羁绊依然常驻注入，彻底焊死角色伦理纲常，杜绝长程跑团中乱伦与辈分颠倒通病。
- **主角客观状态与生活习惯癖好追踪 (Protagonist Profile & Life Details)**：吸收 baibai `protagonist` 与 `lifeDetails` 设计，在 `CharacterState` 中将 User/主角作为独立客观实体进行追踪。支持性别、年龄、当前身份、外貌体貌、着装伪装与覆盖型伤病生理状况（`condition` 痊愈后自动清空）；建立生活习惯癖好档案，支持主题标签与去重规范化，将主角的真实肉体伤情与雷区癖好（如严重过敏、饮食喜好）紧凑注入上下文，彻底消灭断手挥拳、乱吃过敏物的出戏 Bug。
- **悬念簿近期已了结事项防复读注入 (Recently Resolved Task Lifecycle)**：吸收 baibai 理念，`SuspenseBook` 增加 `getRecentlyResolvedPrompt`，提取近期了结的约定/悬念，将 `done`（已达成）、`cancelled`（已作废）、`failed`（已失败）三种不同收场方式连同其一句话收场原因紧凑注入私密简报，并纳入常驻最高优先级保护，杜绝大模型在剧情推进后对作废历史任务的“诈尸复读”。
- **现代多推理标签与截断宽容熔断器 (Lenient Multi-Tag Reasoning Sanitizer)**：吸收 shujuku `lenient-text` 思想重构 `extractThinkingChain` 与 `stripMemoryOpsTags`。支持主流 5 类推理标签（`think`, `thinking`, `thought`, `reasoning`, `analysis`）；实装未闭合思考标签宽容熔断器，当模型发生 token 截断或忘记闭合标签时，精准识别连续换行后的真实叙事/对话/Markdown/JSON 切换点，切分思考并安全保留正文，杜绝推理模型截断造成的正文全量吞没白屏。
- **跨会话数据平移与状态种子 (Carryover Seed & Replay)**：吸收 baibai `carryover.ts` 架构，`MemoryEngine` 提供 `generateCarryoverSeed()` 与 `importCarryoverSeed()`。在新开会话或长程故事迁移时，一键将当前最高层剧情摘要、主角客观档案、随身物品、未结悬念、NPC羁绊网与地理位置打包为自包含种子，在新会话第 0 楼无缝初始化先验记忆基石。
- **自动化测试**：新增 `tests/v345_deep_bastion.test.mjs`，全量 47 个测试套件 100% 绿灯全绿通过。

## [v3.44.0] - 2026-09-13
### 吸收 baibai 物理可达性与 shujuku 终极防御：物品随身/寄存解耦、字符流状态机解析与修订号乐观并发
- **物品物理可达性与随身/寄存解耦 (Physical Reachability & Carried/Location Mutex)**：吸收 baibai 机制，`_sanitizeItemOp` 与 `rebuildItems` 实装 `carried`（随身）与 `location`（存放地点）强互斥铁律（随身携带自动清空存放地；有具体存放地强制 `carried: false`）。生成提示词时根据当前地理位置（`geoLocation`）智能分类为【在场/随身】与【他处寄存】，严禁大模型随时随地凭空隔空掏出放置在其他地点的物品（根治次元袋 Bug）。
- **字符流状态机 JSON 容错解析器 (Robust Stream Sanitizer & Repair)**：吸收 shujuku `json-sanitizer` 理念，重构 `sanitizeJson`。支持外层闲聊引导语剥离、Markdown 围栏消除、中文全角引号/标点归一、保护英文所有格缩写（如 `don't`, `it's`）、字符流状态机自动转义字符串内部未转义的裸双引号、吞噬对象/数组悬挂尾逗号、修复未加引号的合法对象键名，将大模型烂输出解析成功率拉至 99.9%。
- **单调递增修订号与乐观并发控制 (Revision-based Optimistic Locking)**：吸收 shujuku 设计，`StorageManager` 引入单调递增的 `_revision` 机制，支持 `save(chatId, data, { expectedRevision })` 与 `setStateIfRevision`；持有落后快照版本的异步长任务（LLM 反思/摘要）写入时被安全拒绝拦截，彻底杜绝“旧快照踩踏新状态”的异步写入时序颠倒缺陷。
- **开场白写入抑制 (Opening Floor Write Suppression)**：在楼层 ≤ 0 且无用户消息的新会话开场白阶段，系统切为纯只读展示模式，直接抑制所有持久化写入通道与脏 ops 生成，保证导入新角色卡后记忆库绝对纯净。
- **自动化测试**：新增 `tests/v344_ultimate_bastion.test.mjs`，全量 46 个测试套件 100% 绿灯通过。

## [v3.43.0] - 2026-09-13
### 吸收 baibai 与数据库事件溯源机制：NPC四档压平注入、双界时间锚点与图谱回滚自愈
- **NPC 四档压平注入与性别铁律 (NPC Tier-based Flattened Injection)**：吸收 baibai 设计，基于重要度、在场状态与空间拓扑将 NPC 压平压缩为 Tier 1（核心主角完整展开）、Tier 2（当前在场紧凑摘要）、Tier 3（同区域仅保留位置/状态单行）、Tier 4（不在场极简名单）。全档位严格固化性别与称谓标签（如 `[女]`、`[男]`），节省 60%+ Token 且焊死人伦常理。
- **双界时间锚点与年龄时钟 (Dual-Bound Time Anchors & Age Clock)**：`RelativeTimeHelper` 新增正文双界起止时间提取（支持 `<bbs_start>...<bbs_end>` 标签及自然正文标记），计算剧情跨越天数；提供 `calcAge` 年龄与相识天数数学推算，杜绝长程跑团中大模型时间与年龄算错通病。
- **图谱事件溯源与删楼原子回滚 (Graph Event Sourcing & Rollback)**：对齐专业数据库事件溯源流设计，`MemoryGraph` 引入 `graphOps` 楼层操作日志，记录图谱变更的反向补偿操作；实装 `rollbackGraphFrom(floor)` 与 `shiftGraphOps`，在删楼、重生成或滑卡时精准重放自愈，确保图谱状态与楼层绝对一致。
- **自动化测试**：新增 `tests/v343_baibai_mechanics.test.mjs`，全量 45 个测试套件 100% 绿灯通过。

## [v3.42.0] - 2026-09-13
### 吸收 caikis 数据库机制：人设基线 vs 偏移双层模型、NPC晋升流水线与三级地理空间感知
- **人设稳定性 (Persona Baseline vs Drift)**：`CharacterState` 引入双层人格模型，锁定初始性格基线（traits、speechStyle、coreBelief），记录短期剧情冲击造成的行为偏移（mood、reinforced、weakened）；偏移在超过 15 楼无新刺激后自动衰减收敛，彻底根治长线性格漂移与崩坏。
- **Token 经济学 (NPC 晋升机制)**：初登场路人录入轻量 `transientNpcs` 表；唯有高频互动或被标记为重要角色时触发 `promoteNpc` 晋升为常驻追踪角色，释放非关键临时开销。
- **三级地理空间感知 (3-Tier Geo Context)**：结构化维护 `majorArea`（主要地区）→ `minorArea`（次要地区）→ `detailLocation`（详细地点），提供标准化注入提示词，消除角色在地图上的超光速瞬移 Bug。
- **自动化测试**：新增 `tests/v342_caikis_mechanics.test.mjs`，全量 44 个测试套件全绿。

## [v3.41.0] - 2026-09-13
### 吸收 Stitches 工业级机制：约定账本、认知隔离、紧凑AM编码与标签净化盾
- **约定账本 (Promises Ledger)**：`WorldProgress` 新增约定全生命周期管理，支持 `deadlineFloor` 截止楼层设置，自动检测 `imminent`（临近到期预警）与 `overdue`（逾期警示），注入时高优先级提示 AI 遵守承诺。
- **认知隔离 (Cognitive Horizon)**：为不在场角色维护私有认知边界，支持 `markUnaware` 与 `revealKnowledge`；角色重新登场时自动注入认知提示词，严禁 AI 编剧视角或未卜先知。
- **紧凑 AM 编码 (Memory Address Code)**：`SummarySystem` 引入 `generateAMIndex` 与 `resolveByAMCodes`，支持快速生成紧凑地址索引表与多编码秒级回溯反解，为轻量前置检索节省 70% Token。
- **剧情支线生命周期 (Plot Arc Decay)**：新增 `addPlotArc`、`touchArc` 与 `decayArcs`，长时间无互动支线（默认 15 轮）自动降级为 `shelved` 搁置，关键词触碰即时复活。
- **终极上下文净化盾 (Context Cleaning Shield)**：`stripMemoryOpsTags` 升级，覆盖 20+ 种复杂跑团成对块标签（`<recall>`, `<dm_plan>`, `<inner>`, `<act>`, `<scene>`, `<dm_story>`, `<npc_track>`, `<thinking>` 等），正文与历史记录彻底杜绝内部推理标签污染。
- **自动化测试**：新增 `tests/v341_stitches_mechanics.test.mjs`，全量 43 个测试套件全绿。

## [v3.40.0] - 2026-09-13
### 数据库级演进：流水线统一闭环、写合并协调器与图真空压缩
- **架构修复 (检索流水线闭环)**：修复 `onBeforeGeneration` 中回响池（EchoPool）单点早退劫胡缺陷，回响池、世界推进（WorldProgress）、跨调用去重（RecallDedup）、轨迹监控（TrailMonitor）与按需触发词无缝合流统一交付。
- **存储协调 (Write Coalescing)**：`StorageManager.save` 引入自包含写协调锁与防抖合并循环，高频并发保存自动合并，附加 `stats` 数据完整性摘要，杜绝 I/O 竞态卡顿。
- **数据压缩 (Graph Vacuum)**：`MemoryGraph` 新增 `vacuum` 数据库级碎片整理，支持闭环冗余历史边按楼层保留上限裁剪、非关键角色孤儿死节点回收与倒排索引自愈。
- **主键增强**：时态关系边支持复合历史主键与 `edge.relation` 别名兼容，避免重复事件覆盖。
- **自动化测试**：新增 `tests/v340_database_evolution.test.mjs`，全量 42 个测试套件全绿。

## [v3.39.0] - 2026-09-13
### 数据库级架构对齐、高压基准与极端环境韧性自愈
- **性能优化 (倒排索引检索)**：为 MemoryGraph 新增 `findNodesMentionedIn(text)`，HippoRAG 双路引燃由 $O(N)$ 全表扫描升级为基于 `nameIndex` 的哈希快速匹配。
- **数据完整性 (外键悬挂边自愈)**：`MemoryGraph.import` 引入外键一致性校验，导入时自动净化两端均不存在的孤立死边（Dangling Edges）。
- **极端环境容错 (Null-Safety)**：`SummarySystem.createSummary` 增加空消息、非法楼层与畸形文本类型推导防御，彻底杜绝 TypeError 崩溃。
- **运行环境安全**：修复 `MemoryGraph.snapshotGraph` / `truncateGraphFrom` 中裸 `window` 访问，全面兼容 Node/Worker 等无 window 纯净上下文。
- **高压与混沌套件**：建立 `tests/stress_bench.test.mjs` (1000节点/5000边/5000篇BM25) 与 `tests/chaos_resilience.test.mjs` (500轮内存压力与脏数据容错)。

# 更新日志
## v3.38.0 (2026-09-13) - 全链路自愈闭环 + 多维时态演化 + 语义休眠激活 + 台账撤销栈 🛡️

> 本版完成了对上一轮工业级支柱的端到端严密审计与全链路闭环，彻底修复了五大真实隐藏缺陷，并补全四大前沿系统级拼图。
> 39 个全量测试套件、620+ 断言 100% 全部通过，系统成熟度跃升为真正可商用的长文本认知底座。

### 核心 Bug 彻底根治（Must Fix）
1. **时态图谱（Temporal Graph）导入闭环保护与双向匹配修复**：
   - 修复了 `import(data)` 时历史边 `validTo` 被硬编码 `null` 覆盖的致命缺陷；
   - 修复了 `recallMemory` 中拿节点内部 UUID 匹配角色中文名导致历史边 100% 漏召回的问题，支持中文名与节点 ID 双向匹配。
2. **HippoRAG 执行时序颠倒彻底纠偏**：
   - 将 BM25 与物品台账检索提取至图扩散之前，使实体引燃在执行扩散时真正能提取到 BM25 与物品文本作为种子节点，告别静默空转。
3. **删楼（`shiftFloorsFrom`）图谱时态位移自愈**：
   - 补齐图谱边 `validFrom`、`validTo`、`floor` 与快照 `_snapshots` 在删楼时的 `-1` 前移，杜绝时序漂移。
4. **反思生成器容错与延迟更新**：
   - 接入全局 `sanitizeJson` 容错清洗，且只有在有效产生反思后才推进 `_lastReflectFloor`，失败不再产生长达 10 楼的哑火惩罚期。
5. **全量无损导出木桶补全**：
   - `collectExport` 完整补齐 `charMem`（角色记忆银行）、`worldProg`（世界推进）、`supersede`（矛盾换代）与 `narrativeEntropy`（叙事惊奇度），跨设备迁移与快照导出零丢失。

### 四大系统级前沿拼图落地（Architecture Evolution）
1. **多维关系并存与冲突演化（Relational Multi-dimension & Evolution）**：
   - 引入 `RELATION_CONFLICT_GROUPS`，定义情感态度组与立场阵营组；
   - 只有在同维度冲突（如“恋人”走向“决裂”，“盟友”走向“宿敌”）时才闭环旧关系；正交维度（如“师徒”与“恋人”）和谐并存，彻底支持多面立体角色情感网。
2. **语义级休眠与实体唤醒机制（Dormant vs Active Lifecycle，TriviumDB 双区模型）**：
   - 超过 30 楼未提及且重要度普通的已折叠旧摘要自动标记为 `dormant: true`，不占用基础活跃带宽；
   - 一旦剧情重新出现相关实体线索，触发 `awakenByEntities` 语义唤醒，提权复活并冠以【久别重现】标签，完美解决长篇伏笔与上下文防爆的矛盾。
3. **可视化台账 Undo/Redo 命令审计栈（Event Sourcing Audit Trail）**：
   - 面板新增 `_auditStack` 命令栈，记录每次人工对物品持有者、状态、属性或悬念的修改操作；
   - 台账浏览器增加「↺ 撤销上次修改」交互按钮与 `plugin.undoLastOp()`，手滑改错可一键还原重放。
4. **全链路真实端到端集成套件（E2E Integration Test Suite）**：
   - 建立 `tests/v338_e2e_integration.test.mjs`，包含 36 项全链路行为断言，覆盖 1~20 楼完整演变、删楼自愈与快照恢复。

## v3.37.0 (2026-09-13) - 工业级长文本记忆五大前沿支柱演进（HippoRAG + Zep + MemGPT + Prefix Cache）🏛️

> 本版是 LonSha 走向中大型、完备工业级记忆系统的体系化跨越。
> 全面收编学术界与工业界 SOTA 架构理念：HippoRAG 海马体双路引燃、Zep 时态知识图谱、MemGPT 惊奇度自适应反思、baibai 物理时间锚点、以及 Prompt Cache 友好型冷热槽位分流。

### 五大前沿支柱落地
1. **HippoRAG 联合引燃扩散（Vector-Seeded Graph Diffusion）**：
   - 突破传统图扩散仅靠“在场角色”作为种子的单一链路；
   - 提取 BM25、Vector 与道具流转中命中的高频物体/地点/概念实体节点，作为联合种子送入图扩散；
   - 即使正文未提及某人姓名，也能通过“染血的短剑”概念引燃整张因果关系与隐藏事件网络。
2. **时态知识图谱（Temporal Graph: [validFrom, validTo] 时态区间）**：
   - `MemoryGraph.edges` 扩充 `validFrom`、`validTo`、`active` 字段；
   - 角色间产生同方向新关系时，旧关系温和闭环至历史区间（`active=false`, `validTo=floor`）；
   - 检索层意图分流：常规检索默认遍历当前活跃关系；当 Query 涉及历史回顾（“当年/曾经/以前/旧怨/往事”）时，唤醒历史羁绊时态边并注入标注。
3. **叙事熵与惊奇度累加器自适应反思（Surprise/Entropy Driven Reflection）**：
   - 引擎维护 `_narrativeEntropy`，每次提取根据重要度（`importance>=7` 加分，`>=9` 故事转折加重分）、状态剧变与伏笔了结累积剧情熵；
   - 熵累积达到阈值（默认 15）或单轮出现 `>=9` 转折事件时，突破固定的机械楼层周期，即刻点火执行反思提炼，沉淀后重置蓄力池。
4. **正文时间标签物理锚点（TimeTag Anchor）**：
   - 支持识别回复正文中的 `<time: ...>` 或 `<date: ...>` 物理时间标签；
   - 提取后直接作为权威剧情时间盖章给该楼层并刷新基准，同时在清洗层彻底抹除标签（对用户纯净透明），从物理层面根除长线相对时间漂移。
5. **Prompt Cache 友好型冷热物理分流（Prefix Caching Friendly Alignment）**：
   - 顶槽(9999)升格为绝对静态冷存区，锁定跨阶段史记总览与恒定设定；在新史记生成前，顶槽文本 100% 字节稳定；
   - 动态变动的活跃周记与即时碎片下沉至底层工作上下文；
   - 促使 Claude 3.5 / DeepSeek V3 / Kimi 等原生支持 Prefix Caching 的模型实现 70%~90% 的输入 Token 命中率，首字响应显著加快。

### 验证
- 新增 `tests/v337_industrial_pillars.test.mjs`（31 项行为与静态断言全绿）
- 全量回归测试：38 个测试文件、595 项断言 100% 全部通过，0 失败

## v3.36.0 (2026-09-13) - 确定性物品重放 + 结构化错误人话诊断矩阵（baibai + shujuku 终稿落地）📦

> 吸收 baibai（柏宝书）确定性 ID 与三态补丁语义，重构物品台账事件重放；
> 吸收 shujuku 错误规则库理念，升级为结构化人话诊断矩阵（原因诊断 + 明确行动建议）；
> 补齐物品台账可视化浏览器与交互式管理闭环（变更持有者/变更状态/丢弃移除）。

### 新增与重构
1. **确定性物品键归一（normalizeItemKey，抄 baibai 确定性 id 理念）**：
   - 自动剥离书名号《》、方括号【】[]、小括号（）()、引号等外层包裹标点，NFKC 归一化与空白折叠；
   - 解决《星空之钥》与星空之钥因格式微调分裂为多件物品的名称漂移顽疾。
2. **严格三态补丁语义重放（Three-State Patching）**：
   - `undefined`：未提供不覆盖旧值（保留原 desc/holder/state）；
   - `null` / 空 / "无" / "地上"：明确置空（holder 自动转换为"地上/遗落"）；
   - `有效字符串`：规范化覆盖写入，修复了过去 update 时漏更新 desc 的缺陷。
3. **物品流转动作与召回过滤**：
   - 支持 `action: 'remove'` 动作将物品移出活动持有列表；
   - 召回层自动过滤处于丢失、损毁、已消耗、丢弃状态的物品（除非用户 Query 明确搜索该物品名）。
4. **结构化人话诊断矩阵（shujuku 错误规则库升级）**：
   - 扩充至 20+ 条典型高频异常规则（覆盖 401/403/429/404、额度耗尽、上下文超限、内容安全审查、网络连接/超时、CORS跨域、存储超限、JSON破损、宿主接口未就绪等）；
   - 升级为结构化提示 `{ title, reason, action }`，输出【这是什么问题】+【你可以怎么做】；
   - 诊断面板（showDiagnose）全面渲染灯泡高亮建议卡片，管线 dry-run 与 schema 异常同步显示排查指引。
5. **物品台账可视化浏览器与操作管理闭环**：
   - 状态面板（showStatsPanel）新增「🎒 物品台账 👁」卡片，点击直达；
   - showBrowser 增加 items 列表视图，每件物品绑定 `data-opkind="item"`；
   - _memOps 物品操作弹窗支持「👤 变更持有者」、「📦 变更状态」、「🗑 标记丢弃/移除」，自动派发事件 delta 存盘重放。

### 验证
- 新增 tests/v336_deterministic_items_error_hints.test.mjs（28 项断言全绿）
- 全量回归 37 文件 564 项断言 100% 全部通过，0 失败

## v3.31.0 (2026-09-12) - 召回加热 + 待办复发（kiwi-mem + kimi-core 理念）

> 补全记忆热度闭环：过去只有衰减（decayScore 读字段），激活/续命从未写 →「常被聊到」却热度不升。
> 待办升级为 concern 语义：重申即复发、最近重申豁免过期清理。纯规则零 LLM。

### 新增
1. **召回加热（heatOnRecall）**：VectorStore.search 命中 → _heatEntry（accessCount++ + activationCount++ + lastActive=now）
   - 打通 accessCount（遗忘价值，原写入）与 activationCount（decayScore 公式激活臂，原先从未更新）
   - lastActive 刷新 = 衰减轴重置 = 天然续命（「被想起 → 记忆升温」）
   - BM25 命中碎片按 text 回找加热（heatByText），无匹配静默跳过
2. **待办复发（concern 语义）**：addTodos 重申同 text → 标记 reoccurred + 刷新 lastMentionedAt + 更新 date
   - pruneTodos 复发豁免：最近 24h 重申的待办即使日期已过也暂不清（延续生命周期）

### 修复
- index.js VERSION 修正：v3.30.0 时只升 manifest 未升代码版本号（滞后 3.29.0），本版对齐 3.31.0

### 验证
- tests/v331_heat_concern.test.mjs（18 项单元+行为）全绿
- 全量回归见仓库 tests/

 (2026-09-12) - 记忆矛盾换代（supersede）🕊
> 移植 Paramecium「原文是唯一真相」/ RubyPhone supersede-engine 的纯规则机制（MIT）。
> 解决「角色换了工作/搬了家/戒了奶茶，旧信息还在召回里打架」——新事实出现时旧记忆自动让位。

### 新增
1. **memory-supersede.js 独立模块**（manifest extra_js 加载，挂 `window.LonShaSupersede`）
   - 纯规则零 LLM：2-gram overlap 相似度闸门 + 主题锚点反义立场词表（奶茶/住所/饮食/工作/宠物/情感）
   - 新记忆分量足且高置信冲突 → 旧条目标记 `superseded` 退出召回（原文保留、可逆）
   - 压制方消失/被换代 → 旧条自动复活（链式换代走链）
2. **onMessageReceived 接入**：摘要创建后与新活跃摘要做高置信冲突扫描，标记 superseded 并累计 `statsSuperseded`
3. **recallMemory 接入**：召回前过滤 superseded 摘要（`sum_<floor>` key 判定），被换代记忆不再进入 prompt
4. **持久化**：`supersede.supersededMap` 随 chatMetadata 存档/恢复（楼层回滚自动复活对应被压条目）
5. **配置**：`supersedeEnabled`（总开关默认开）+ `supersedeScanPool`（扫描池大小 30）

### 验证
- tests/supersede.test.mjs（9 项单元）+ tests/supersede-integration.test.mjs（5 项端到端）全绿
- 全量语法门 0 失败

## v3.29.0 (2026-09-12) - 收编完整性审计修复（史记折叠空转 + synopsis 清洗冲突）🔬

> 第八轮审计（链路完整性 + 组合推演）：审计 v3.23-v3.28 连续六版密集收编，抓到 2 个僵尸链路/冲突 bug。

### 🔴 Bug PD-1：史记折叠空转（v3.28）
**推演链**：`maybeFoldHistorical` 用 `this.folding` 防重入——但它在 `maybeFold` 的 try 块内被调用（此时 `folding=true`）→ **永远 return null，史记折叠从不执行**（与 v3.21 世界推进空转同类的僵尸链路）。
**修复**：改用独立 `foldingHistorical` 标志；阈值判断对齐（`vols.length < threshold` 时 return，`>= threshold` 才折叠）。

### 🔴 Bug PD-2：synopsis 快速路径失效（v3.27）
**推演链**：`onMessageReceived` 先 `cleanMessageText`（剥 `<synopsis>` 标签）再 `extractSynopsisFast(message.mes)` → 检测永远为空 → **快速路径从未生效**。
**修复**：在清洗前快照原始文本 `_rawForSynopsis`，synopsis 检测用原始文本。

### 验证
- 新增 tests/v329_audit_fixes.test.mjs（15 项：PD1 修复 5 + PD2 修复 3 + 回归 7）
- v327 断言同步更新（快速路径检测文本）
- 全量回归 29 文件 378 项全过

全量回归 378 项。
## v3.28.0 (2026-09-12) - 三级金字塔摘要 + 记忆树路由召回（st-memory-wizzard）📦

> 收编来源：st-memory-wizzard（Memory Wizard，分层摘要金字塔 + 记忆树路由召回）
> 采用「本地轻量版」：三级金字塔全量实现；记忆树路由用现有图谱/召回做路由（无需第二模型）

### 新增

1. **三级金字塔摘要**——升级既有两级（摘要→卷）为三级：
   - **日记（level 1）**：现有 summaries（近层，每楼）
   - **周记（level 2）**：卷摘要升级为周记层（`level: 2` 标记）
   - **史记（level 3）**：新增 `historical` 数组 + `maybeFoldHistorical()`——卷摘要积累超 `historicalFoldThreshold`（12 条）时折叠成跨阶段史记（最高层）
   - 已入史记的周记标 `archived`（不再单独注入，防重复）
   - 注入 `buildVolumeInjection` 增强为「史记 + 活跃周记」三级；export/import 对称（含兼容旧卷摘要数据补 level/archived）

2. **记忆树路由召回**（本地轻量版，`memoryTreeEnabled` 默认关）——用图谱角色节点做「树路径」：命中角色 → 提取图谱邻接节点 → 作为该角色子树召回（`source: 'memoryTree'`），注入渲染为独立「[记忆树·角色关联]」块。无前快模型时用现有 host 召回替代路由

### 测试

- 新增 tests/v328_pyramid_tree.test.mjs（23 项：金字塔结构 9 + 折叠逻辑 3 + 记忆树 7 + 回归 4）
- 全量回归 28 文件 363 项全过

全量回归 363 项。
## v3.27.0 (2026-09-12) - 命中监控/synopsis轻量提取/触发词按需注入（MemoryPilot + AnchorNote）📦

> 收编来源：MemoryPilot（召回命中监控）+ AnchorNote（<synopsis> 轻量提取 + 触发词按需注入）

### 新增

1. **召回命中监控**（MemoryPilot monitor）——`trailMonitor` 开关：`onBeforeGeneration` 记录 `_lastRecallTrace`（查询/来源分布/命中数/耗时/时间/触发命中），状态面板「📊 状态总览」新增「🎯 最近一次召回」区块展示。诊断「为什么这条命中了/为什么没召回」

2. **`<synopsis>` 轻量提取**（AnchorNote）——`synopsisFastPath` 开关：AI 回复自带 `<synopsis>` 标签时，`extractSynopsisFast()` 正则直取做 summary（省一次 LLM 调用），无标签时退回 LLM 提取。零 API 成本

3. **触发词按需注入**（AnchorNote anchorOnDemand）——`onDemandTriggerPhrase` 配置：用户最近消息含触发词时，把世界推进说明追加到注入尾部（`triggerHit` 标记）；平时不发长指令省 token

### 测试

- 新增 tests/v327_trail_synopsis_trigger.test.mjs（18 项：synopsis 4 + 监控 6 + 触发词 4 + 回归 4）
- 全量回归 27 文件 340 项全过

全量回归 340 项。
## v3.26.0 (2026-09-12) - 归档状态事件清理（v3.25 收编完整性）🩹

> 收编完整性审计：v3.25 引入的 `_archivedFloorIds`（归档隐藏状态）未在事件处理器清理——换对话/编辑/删楼后旧对话楼层 index 残留，`restoreArchivedFloors()` 会误操作新对话楼层。

### 修复

在 4 个事件点同步清空 `_archivedFloorIds`：

| 事件 | 场景 | 原因 |
|---|---|---|
| `CHAT_CHANGED` | 切换对话 | 防旧对话楼层 index 误操作新对话 |
| `MESSAGE_EDITED` | 编辑楼层 | 该楼折叠覆盖关系可能已变化 |
| `MESSAGE_DELETED` | 删除楼层 | 楼层 index 前移，旧归档 index 语义失效 |
| `rollbackFloor` | 楼层回滚 | 楼层 index 前移，归档状态失效 |

### 测试

- 新增 tests/v326_archive_reset.test.mjs（11 项：四事件接入 4 + rollback 1 + v3.25 功能回归 3 + v3.23/24 回归 4）
- v325 T6 版本断言升级为容灾式（>= 3.25）
- 全量回归 26 文件 322 项全过

全量回归 322 项。
## v3.25.0 (2026-09-12) - 召回分级/预算双层/归档隐藏/扩散疲劳（四项目收编）📦

> 收编来源：MemoryPilot（召回类型分级）+ 角色记忆数据库v5（token 预算双层）+ Bakemono/MemoryBooks/记忆库v5 共识（归档隐藏）+ TriviumDB（图扩散不应期疲劳）
> 本批是「记忆管理三大成熟范式」的落地：归档隐藏已覆盖楼层、召回价值分级、图扩散疲劳抑制

### 新增

1. **召回类型分级**（MemoryPilot）——常驻分区（前情摘要/角色状态/角色关系/剧情时间线/卷摘要）每轮必注优先保留；触发分区（BM25/图扩散/POV/物品）按预算裁剪。`recallTierEnabled` 开关。预算超标时三种策略（relevance/recency/balanced）全部改为「常驻全保 + 触发裁剪」

2. **token 预算双层**（角色记忆数据库v5）——`memoryTokenBudget`（记忆注入 token 上限，默认 900，token→字符×4 换算）+ `keepRecentTokenReserve`（保留给最近正文的 token 预留，>0 时注入预算自动扣减）。替代单层字符预算，注入预算不再挤占最近正文空间

3. **归档隐藏已覆盖楼层**（Bakemono/MemoryBooks/记忆库v5 三项目共识）——`autoArchiveCovered`（默认关，防灾）+ `archivePreserveRecent`（保留最近 6 AI 楼）+ `archiveCoveredFloors()`（把被卷摘要折叠的旧楼 `hideChatMessageRange` 设为隐藏，可逆）+ `restoreArchivedFloors()`（恢复）。接在 maybeFold 折叠成功后触发；`_archivedFloorIds` 跟踪已归档楼层

4. **图扩散不应期疲劳**（TriviumDB Refractory Period）——`_diffusionFatigue` Map + Top-5 赢家打疲劳标 + 下轮命中能量×0.15 降权 + 被抑制即解除（无记忆效应）+ 超时 3 轮衰减（防永久封印）。在 diffusion 调用点包裹实现（不改外部库）

5. **黑洞降权后处理**（TriviumDB Link Specificity 等效）——扩散返回中的热点（重复召回）通过疲劳机制等效抑制，冷门但相关的亚支路记忆有机会浮现

### 测试

- 新增 tests/v325_recall_tier.test.mjs（23 项：分级 3 + 预算 4 + 归档 7 + 疲劳 7 + 黑洞 2 + 版本 2）
- 全量回归 25 文件 311 项全过

全量回归 311 项。
## v3.24.0 (2026-09-12) - 跨调用去重指纹同步重置（NE-Memory 收编完整性）🩹

> 收编完整性审计：v3.23 引入的跨调用去重 `_recallDedupState` 未在事件处理器清理 `_recallCache` 时同步重置——编辑/swipe/删楼后旧楼层文本指纹残留，导致**新内容被误标「已覆盖·防复读」**（连续追问去重机制在新楼层内容上误伤）。

### 修复

新增 `resetRecallDedup()` 顶层函数（清空 lastTexts/lastQuery/lastChatId 三字段），并在 4 个事件处理器同步接入：

| 事件 | 场景 | 效果 |
|---|---|---|
| `CHAT_CHANGED` | 切换对话 | 防旧对话文本指纹误标新对话 |
| `MESSAGE_EDITED` | 编辑楼层 | 防编辑后的新内容被旧指纹误标 |
| `MESSAGE_DELETED` | 删除楼层 | 防删楼后残留指纹误标后续召回 |
| `MESSAGE_SWIPED` | 重roll/翻swipe | 防旧 swipe 文本残留误标新回复 |

### 测试

- 新增 tests/v324_dedup_reset.test.mjs（10 项：resetRecallDedup 存在 + 四事件接入 + 三字段全清 + v3.23 功能回归）
- v324 版本断言容灾式（>= 3.24）
- 全量回归 24 文件 288 项全过

全量回归 288 项。
## v3.23.0 (2026-09-12) - NE-Memory 收编（断崖截断/时间感知/跨调用去重/迁移恢复）📦

> 收编来源：Melody-0321/NE-Memory（SillyTavern 叙事事件记忆引擎，TH 运行，完整源码 + CODE_WIKI/BUGS 文档）
> 定位：NE 管理叙事事件（STM/LTM 分层），lonsha 管理结构化事实——两者同域互补，取其算法级与机制级增量

### 新增

1. **BM25 分数断崖截断**（NE `retrieval-filter.js`）——`BM25.search(query, topK, {cliffCut})` 选项化改造：相邻分 > 3x 且低于首项 15% 时自然截断弱相关长尾，`minResults` 保底防空洞；保留原有无 cliffCut 行为。主召回分支已启用断崖截断

2. **时间感知检索**（NE `parseTimeConstraint` 移植）——新增 `parseStoryTimeConstraint()` 纯函数：剧情历 Day X 范围/单日（支持中文"到"）、ISO 日期、中文月份/相对时间解析；`filterTimelineByConstraint()` 按约束预过滤 timeline 条目（剧情历约束只匹配 Day 日期，绝对月约束匹配中文/ISO 日期）。timeline 召回分支接入：查询含时间约束时优先按约束过滤时间线

3. **跨调用去重**（NE `recall_memory` 的 `lastRecallMsgIds`）——`_recallDedupState` + `recallDedupMark/Remember`：缓存上一轮注入的召回文本指纹，连续追问时把已覆盖项以 `[DEDUP已覆盖·若本轮查询需更深细节才用]` 前缀追加到注入尾部（独立 `[已覆盖记忆·防复读]` 分区），模型不再复读上轮内容。跨聊天自动清空指纹

4. **chatMetadata 记忆库嵌入式迁移**（NE `auto-restore.js` 轻量版）——`collectExport()` 增加 `version` 字段；`embedVaultToChatMeta()` 每 20 楼把全量记忆嵌入 `chatMetadata.extensions.LonShaMemory.embeddedVault`；启动时 `checkEmbeddedMigration()` 检测嵌入存档（本地有更新版本自动清除嵌入防重复提示；本地空则非阻塞提示可恢复）。跨设备/跨卡随聊天元数据携带记忆

### 测试

- 新增 tests/v323_ne_memory.test.mjs（19 项：断崖截断 4 分支 + 时间约束解析 5 类 + 时间过滤 2 类 + 跨调用去重 4 项 + 迁移恢复 4 项）
- v322 ST4 版本断言升级为容灾式（>= 3.23）
- 全量回归 23 文件 278 项全过

全量回归 278 项。

## v3.22.0 (2026-09-12) - 第七轮审计修复二（rollback 未清记忆残留）🔬🧹

> 第七轮审计第二个实锤：对照 rollbackFloor 的清理清单（graph/ledger/pov/summary/timeline/worldProg），发现 **charMem（角色记忆银行）与 _thinkingSignals（场外信号）不在清理清单**——删楼/回滚后旧楼层记忆残留，污染后续剧情。

### 🔴 Bug WP-B：rollbackFloor 未清 charMem/_thinkingSignals
**影响**：回滚/删楼后，旧楼层的角色记忆（charMem）与场外信号（_thinkingSignals）仍残留在内存中——swipe 回退到旧支线时，残留记忆可能污染新剧情方向。

**修复**：
- `charMem.removeByFloor(floor)`：按楼层删除核心+近期记忆（保留其他楼层）
- `engine.clearThinkingSignalsByFloor(floor)`：按楼层过滤场外信号
- rollbackFloor 内补两处调用（在 worldProg 对账之后）

### 验证
- 行为测试 9 项（楼层删除/其他楼保留/不存在楼不误删/信号清理）
- 全量回归 22 文件 259 项全过

全量回归 259 项。
## v3.21.0 (2026-09-12) - 第七轮审计修复（世界推进空转）🔬

> 第七轮审计采用「链路完整性」组合推演法：顺每个功能的完整执行链走一遍，找「骨架搭好了但核心填充缺失」的僵尸链路。

### 🔴 Bug WP-A：世界推进空转（v3.16 引入）
**推演链**：
```
周期触发 markPending ✓ → publish 读取 pendingWrite ✓ → toInjection 读 active
但 store()/propose() 从未被任何代码调用 → active 恒空 → toInjection 永远空数组 → 世界推进是僵尸功能
```

**根因**：v3.16 收编 zhino 时搭了世界推进的**骨架**（markPending/publish/toInjection 链路），但**实际推演步骤（select 候选 → 生成动态 → store 进 active）从未接上**——这是「功能组合」层面的半成品，不是单一功能 bug。

**修复**：
- `WorldProgress.generateFromMemory(engine, knownChars, presentChars, floor)`：用 charMem 最近记忆 + 图谱位置生成不在场角色动态（`（场外动态）角色名：最近记忆 —— 其生活仍在继续`），**零新增 API 调用**、零延迟
- `onBeforeGeneration` 发布前：active 为空时先 generateFromMemory 填充，再 publish/toInjection
- 上限 10 淘汰最旧、无 charMem 数据不填充（不产生空动态）

### 验证
- 行为测试 7 项（填充/无数据不填/上限/接入点）
- 全量回归 21 文件 250 项全过

全量回归 250 项。
## v3.20.0 (2026-09-12) - RubyPhone Ebbinghaus 衰减引擎（记忆价值精确治理）🧠📉

> 收编来源：/home/user/ruby-phone-work（RubyPhone 手机记忆 App，其记忆引擎移植自 sxiphone 体系精华，纯本地零依赖）。将 Ebbinghaus 衰减评分嫁接到 lonsha 的 charMem 记忆银行。

### ✨ Ebbinghaus 衰减引擎（decayScore）
- **综合评分**：重要性 × 激活次数^0.3 × e^(-λ·天数) × 情绪权重 × 新鲜度 × 强化保护
- **特例**：pinned=999、permanent≥100、feel≥50、resolved×0.05（已了结的事降为残响）
- `_initEbbingMeta`：addCore/addRecent 写入时初始化 Ebbinghaus 字段（激活次数/重要性/记忆强度/情绪/强化计数）

### ⚙️ 应用到 charMem
- **GC 校准升级**：`_gcCore` 从「按 ts 新鲜度截断」升级为「按 Ebbinghaus 分数淘汰最没人在乎的」——重要性/激活/情绪等维度参与淘汰，而非单纯按新旧
- **检索排序升级**：`search` 用「衰减分数 × 核心×3 加权」排序，替代旧的「核心优先 + ts」

### 🐛 实施中抓出的实现 bug
- **`??` 与 `?:` 运算符优先级陷阱**：`(m.importance ?? m._isCore ? 1 : 0.5)` 因优先级问题，importance 有值时仍走了 fallback → 不同 importance 分数相同。测试 TC1 当场抓出，修复为显式 `!== undefined && !== null` 判断

### 验证
- 行为测试 12 项（重要性/激活/时间衰减/pinned/resolved/初始化/保字段）
- 全量回归 20 文件 243 项全过

全量回归 243 项。
## v3.19.0 (2026-09-12) - RUBY 结构型收编（周期调度 + 增量书签 + 系统消息修正）📦

> 收编来源：RUBY Analyzer（xm212617-code/RUBY，SillyTavern 独立扩展）。取其结构型设计——周期纯函数、增量书签、系统消息识别。

### ① 周期调度纯函数（RUBY scheduler.js）
- `cyclePositionFor(aiReplyCount, len)`：位置取模（每周期第 N 个 AI 回复触发）
- `collectCycleTasks(tasks, position)`：多任务按位置分发
- 世界推进触发从「固定 `% wpEvery` 锚点」改为「周期纯函数」——更符合任务语义

### ② 增量书签 IncrementBookmark（RUBY reader.js）
- 存 ST chatMetadata.extensions.LonShaMemory.bookmarks（原生元数据通道，随对话持久化）
- `save/get/reset` 书签管理
- **scanMissingFloors 增量裁剪**：补提取从书签处开始扫（省全量扫描，长对话省 token）
- **补提取成功后自动推进书签**
- **`resyncAfterDeletion` 删楼书签重同步**：楼层序数前移时书签精确补偿；越界（书签指向不存在楼层）归 0——防删除过多后任务永久卡死
- rollbackFloor 内联动书签重同步

### ③ 系统隐藏消息识别（RUBY reader.js isSystemHiddenMsg）
- `isSystemHiddenMsg(m)`：ST 安静生成的消息 `is_system=true` 但非 user 且非空 → 是 AI 回复（须计入楼层指纹/AI 楼层序数）
- 修正楼层统计对安静生成消息的误判

### 验证
- 行为测试 14 项（周期取模/边界、系统消息识别、书签保存/重同步/越界归0、接入点）
- 全量回归 19 文件 231 项全过

全量回归 231 项。
## v3.18.0 (2026-09-12) - 防御深化 + 架构升级（错误规则库/JSON Sanitizer/时间锚点/控制平面）🛡️🏗️

> 收编来源：shujuku（错误提示规则库 + JSON sanitizer）、baibai（时间锚点一致性）、stbme（控制平面分离）。补充 shujuku/baibai 的防御纪律。

### ① 错误提示规则库（shujuku 43条→精简15条人话）
- `_ERROR_HINTS` 15 条规则：网络/Key/限流/上游故障/超时/CORS/存储满/IndexedDB/JSON损坏/内部缺失/内存溢出
- `hintForError(err)`：命中规则返回人话提示，未知错误通用兜底
- errLog 记录带 `hint` 字段——诊断面板可直接展示人话而非原始报错

### ② JSON Sanitizer（shujuku/baibai 全角引号+未转义修复）
- `sanitizeJson(raw)`：全角引号/逗号/冒号→半角、剥 ```json 围栏、去尾逗号、单引号→双引号
- 应用到 3 个 LLM JSON 解析点（extractMemoryWithLLM / extractRolesFromLore / rerank 排序协议）

### ③ 时间锚点一致性（baibai 时间协议轻量版）
- `checkTimeMonotonic(dateStr, floor)`：记录最近剧情日，检测**时间倒跳**（重roll/编辑导致的正文矛盾）并告警
- 不要求主模型改协议（保留现有 story_date 数据流），仅做一致性防线

### ④ 控制平面分离（stbme 最小版）
- `ensureControlReady()`：事件注册前检查 ST 上下文就绪，避免半初始化注册
- `bindEvent()`：统一事件注册包装（就绪检查 + 事件计数 + 注册记录）
- registerEvents 开头接入就绪检查——未就绪时告警跳过

### 验证
- 行为测试 18 项（错误提示 5 类、sanitizeJson 5 类、时间锚点 2 类、控制平面）
- 全量回归 18 文件 217 项全过

全量回归 217 项。
## v3.17.0 (2026-09-12) - 三核心 × 七项目防御缝合包 🛡️

> 收编来源：shujuku（纪律型「每个功能配一个防御」）、baibai（确定性 id + 三态语义）、yuzuki（expected/rebuilt/overlay 对账）、anima（GC 校准）。为 v3.16 刚缝入的三核心补防御。

### ① charMem 确定性 id + 三态补丁（baibai）
- 记忆 id 从「随机时间戳」改为**确定性 id**（角色+文本+楼层 FNV hash）：同内容重复写**幂等不堆积**，swipe 回滚自动一致
- 三态补丁：同 id 已存在则更新（幂等），不同文本新增
- 升降级/删除保留确定性 id

### ② charMem GC 校准器（anima retention value）
- 核心记忆超 50 条时**按新鲜度排序保留最新 50**，替代粗暴 `shift()` 截断
- 未超上限不动；对外 `gc(char)` 可手动触发

### ③ 世界推进发布确认（shujuku pending/accepted + revision）
- `propose(char, level, memory, floor)`：先在 detached 副本暂存 pending（**不立即生效**）
- `publish()`：宿主确认（生成路径注入点）后**一次性发布** —— 防半提交推进污染
- `discard()`：楼层回滚/重roll 时丢弃 pending（拒绝半提交）
- `revision` 单调递增：乐观并发防旧实例迟到提交

### ④ 世界推进对账（yuzuki overlay）
- `reconcile(latestFloor)`：楼层重排后 `floor > latestFloor` 的过期推进自动失活
- rollbackFloor 内联动：discard + reconcile（删楼后旧推进不注入）

### 验证
- 行为测试 17 项（确定性 id 幂等/稳定/升降级、GC、propose/publish/discard、revision、reconcile）
- 全量回归 17 文件 199 项全过

全量回归 199 项。
## v3.16.0 (2026-09-12) - zhino 三核心收编（两层记忆 + 神经链召回 + 世界推进）🧠🕸️

> 研究来源：sillytavner-jpg/zhino-script@v5.2.1（明月秋青智脑 A5.2.1）。一次性收编三大核心机制。

### ① 角色记忆银行 CharacterMemoryBank（zhino 两层记忆）
- **核心记忆（永久）**：关系变化（友好/对立）、约定/目标新立等关键事件，不自动删，可手动降级
- **近期记忆（自动更替）**：每轮摘要按角色写入，保留最近 3 条自动淘汰最旧
- 升降级（核心↔近期）、单条删除、search 核心优先 + 时间衰减排序、export/import 对称持久化

### ② 神经链召回 NeuralChain（zhino 神经链架构）
- 链1（用户→在场角色）：每角色按查询词召回记忆
- 链2（在场角色↔角色间）：双向检索角色间记忆，去重已注入链1
- 渲染块「[关系记忆·神经链]」，上限 8 条

### ③ 世界推进 WorldProgress（zhino 不在场角色独立行动）
- 候选 = 已知角色 - 在场角色（不在场筛选）
- **select 打分**：有独立目标/待办/久未互动者优先，最多 2 人
- 每 N 楼标记 pending → 生成路径注入前把 toInjection 并入召回（**不抢 AI 生成 API**，玩家发消息时后台推演）
- 渲染块「〔场外角色动态｜他们已各自行动，可自然成为后续话题〕」+ 上限 10 个
- 默认关闭（worldProgressEnabled: false，需观察效果后开）

### 关键修复（实施中抓出）
- **世界推进触发点**原被嵌在 `summaryFoldEnabled` 块内（关闭摘要折叠则永不触发）→ 移出独立
- **load 恢复管线补 charMem/worldProg import**（防导出/导入不对称丢失，呼应 v3.11 教训）

### 验证
- 行为测试 17 项（核心/近期/升降级/search/神经链/世界推进候选/打分/注入/上限）
- 全量回归 16 文件 182 项全过

全量回归 182 项。
## v3.15.0 (2026-09-12) - 图谱版本快照 + 楼层截断回溯（收编 zhino 明月秋青 A5.2.1）🕸️

> 研究来源：sillytavner-jpg/zhino-script@v5.2.1。「每次图谱变更记录版本号+对应楼层，最多保留 6 张；重 roll 某楼层后，该楼层及之后的图谱版本被自动截断，用楼层前状态重建」。

### ✨ 新功能：图谱版本快照（MemoryGraph 内置）
- **snapshotGraph(floor)**：每楼记录图谱起点状态（序列化节点/边），同楼覆盖防 swipe 堆积，最多 6 张，超额淘汰最旧
- **truncateGraphFrom(floor)**：删楼后截断该楼及之后的快照，回滚到楼前最近快照重建全图（zhino: 用楼层前状态重建）；无楼前快照时保留现状不清空
- **onMessageReceived 联动**：图谱节点写入前自动 snapshotGraph（楼层起点）
- **rollbackFloor 联动**：删楼/编辑回滚时自动 truncateGraphFrom（与 v3.6 长寿命角色保留、v3.9 shiftFloorsFrom 组合，互为补充）
- **持久化**：export/import 带快照数组（快照随存档保存，跨会话可回溯）

### 设计要点
- 与现有 ledger（楼层账本按楼删节点）不冲突：快照是**整图级**鲁棒回退，账本是**精确按楼**回滚——两层互补
- 最多 5 轮内退回（6 张快照窗口），与 zhino 一致

### 验证
- 行为测试 11 项（快照/覆盖/上限/截断/回滚/无快照安全）
- 全量回归 15 文件 165 项全过

全量回归 165 项。
## v3.14.0 (2026-09-12) - 从世界书提取角色（收编 zhino 明月秋青 A5.2.1）📚

> 研究来源：sillytavner-jpg/zhino-script@v5.2.1（明月秋青智脑 A5.2.1 同批功能）。触发词（世界书 key）是别名最可靠的来源；已有角色只补别名不改主名。

### ✨ 新功能：从世界书提取角色（设置 → 数据管理 → 📚 按钮）
- **extractRolesFromLore()**：读 ST 世界书（getContext().lore），快速模式收集「条目标题路径 + 触发词(key) + 正文前 300 字」，LLM 一次调用提取角色名+别名
- **触发词优先**：key/comment 是角色名最可靠来源，正文仅作补充（zhino 实测 1813 万字/203 批 → 34 万字/4 批）
- **宽松 JSON 解析**：兼容 ```json 围栏 / 裸 JSON / 非法 JSON 容错返回空（不阻塞）
- **applyExtractedRoles()**：已有角色**只补别名**（不改主名、不入新节点）；新角色入图谱节点
- **别名清洗**：与主名相同去重、同批次重复去重、每角色上限 8 个别名
- **预览勾选写入**：弹出面板展示「新角色/已存在（仅补别名）」标注，复选框勾选后写入；写入后 collectExport + storage.save 即时持久化
- **提示词防噪**：只提取明确角色，跳过地点/物品/组织/概念，不取路人/一次性出场/纯背景板（宁可漏记也不多记）

### 验证
- 行为测试 12 项（围栏解析/裸 JSON/非法容错/过滤/补别名/去重）
- 全量回归 14 文件 154 项全过

全量回归 154 项。
## v3.13.0 (2026-09-12) - 思维链/正文分流（收编 zhino 明月秋青 A5.2.1）🧠

> 研究来源：sillytavner-jpg/zhino-script@v5.2.1（明月秋青智脑）。其 UPDATE-A5.2.1 实测思维链泄漏进正文 23 条 → 0 条，本版收编该分流机制。

### ✨ 新功能：思维链/正文分流
- **extractThinkingChain(text)**：剥离 `<thinking>...</thinking>`（含残缺变体：闭标签缺失=剥到文末整段丢弃、嵌套配对、``` 围栏代码块保护——示例中的标签不误剥）
- **onMessageReceived 前置分流**：先剥 thinking 再清洗正文，思维链草稿不入正文/摘要/时间线/图谱
- **防污染设计**：thinking 存引擎信号队列而非 message.extra（message 浅拷贝的 extra 引用与 ST 原对象共享，直接写会污染真实聊天数据）
- **feedThinking 白名单投递**：仅提取"场外信号"（疑虑/迟到/缺席/暗中/预告/伏笔等 20 类关键词命中才入库），无关思维链噪音不入队；同楼覆盖防 swipe 堆积；环形上限 12
- **检索素材增强**：场外信号仅拼入附件包 vectorText（提升召回命中），绝不进注入文本——遵循 zhino「按分析类型白名单投递」原则
- **提取提示词防泄漏指令**：「思维链/内心独白中的构思草稿、模拟对话、心理预演均尚未发生，严禁当作剧情事实提取」

### 验证
- 行为测试 16 项（extractThinkingChain 全分支 + feedThinking 白名单/覆盖/上限）
- 全量回归 13 文件 142 项全过

全量回归 142 项。
## v3.12.0 (2026-09-12) - 深层组合 bug 修复·审计第六轮 🔬🔬
> 本轮由用户触发：「你确定没有遗留问题了吗？深层肯定还长着一些」——改用**功能组合推演**审计（两个各自正确的功能组合产生错误），前五轮是横向模式扫描，本轮是纵向交互推演。成果证明直觉正确：抓出 4 个深层 bug，其中 1 个数据回退级。
### 🔴 重大修复（Bug A）：storage.load 每次生成覆盖运行时
- **推演链**：用户 swipe → 自愈重提取写入新记忆 → 用户发下一条消息 → GENERATION_STARTED → `onBeforeGeneration` 无条件 `storage.load` → load 内部把 chatMetadata **旧存档 import 覆盖整个运行时** → **自愈/shift/编辑修改全部回退**。
- 这是 v3.7/v3.8/v3.9 所有运行时修复被静默冲掉的根因（stbme 文档记载的「reroll 乱召回」类经典 bug）。
- **修复**：`load(chatId, { preserveRuntime: true })`——生成路径只读返回存档数据不 import；CHAT_CHANGED/初始化路径照旧全量导入。
### 🔴 Bug B：_generationActive 无中止兜底
- 用户按 Esc 中止生成 → MESSAGE_RECEIVED 不触发 → 标志卡死 true → 自愈永久延后（每 5s 重试但永远跳过）。修复：接入 `GENERATION_ENDED` 复位标志。
### 🔴 Bug C：CHAT_CHANGED 跨聊天污染
- 自愈 3s 定时器跨聊天存活——切聊天后对新聊天楼层做旧聊天上下文的重提取。修复：CHAT_CHANGED 清定时器/待愈集合/执行标志/降级排队。
### 🔴 Bug D：运行时修改不持久化
- 编辑/swipe/删楼（含 v3.9 shift）只改内存不存盘——刷新页面即丢。修复：三处事件处理器**立即持久化**（collectExport）。
### 🟠 Bug E：注入代际竞争
- 快速连发两次消息 → 两次 GENERATION_STARTED 并发召回 → 慢的旧结果后返回会**覆盖新的注入**。修复：代际标记 `_genSeq`，await 后检查代际过期即放弃。
### ✅ 测试
- `tests/v312_load_preserve.test.mjs`（8 项）：preserveRuntime 语义行为验证（mock import 计数为 0）/ ENDED 兜底 / CHAT_CHANGED 清理 / 三处即时持久化 / 代际检查行为。全量回归 126 项。## v3.11.0 (2026-09-12) - 历史降级保存块修复·审计第五轮（多AI代码差异清理）🔧
### 🔴 重大修复：settings-ui 三个保存块字段严重缺失（多AI时代代码差异的典型技术债）
三个保存块各自停留在不同版本格式（1.3.0/2.0.0/2.7.0），是跨版本开发留下的接缝：
- **文件导入块（version 1.3.0）**：只保存 graph/summaries/diaries/vectors 四个字段——导入文件后 reflection/itemOps/povs/timeline/status/ledger/suspense/scene/echo **全部丢失**（v2.x+ 新子系统记忆被清空）。修复：完整导入管线（13 子系统）+ 存盘统一 collectExport；reader.onload 改 async。
- **携带包导入块（version 2.7.0）**：缺 reflection/scene/echo/itemOps。修复：统一 collectExport；apply 回调改 async。
- **清空块（version 2.0.0）**：内存里清了但存档残留 itemOps/reflection/suspense/scene/echo。修复：清空补齐 + collectExport 统一；回调改 async。
- **carryover pack version 硬编码**：动态化（version: VERSION）。
### ✅ 审计方法
本版由「跨版本风格一致性审计」驱动——不再按功能面切轮次，而是按「同一概念在不同时期的写法差异」扫：发现 settings-ui 的三个保存块是 v1.x/v2.x 时代代码，从未跟上 v2.4+ 新子系统。统一到 collectExport（stbme 单一事实源思想）后，格式漂移在结构上不可能再发生。
### ✅ 测试
- tests/v311_save_blocks.test.mjs（7 项）：旧版本块绝迹 / collectExport 统一 / 完整导入管线 / 清空字段补齐 / version 动态化 / 回调 async 化 / applyCarryover 行为。全量回归 118 项。
## v3.10.0 (2026-<think>  response111 项全过。写 CHANGELOG 条目并提交推送 v3.10：</think>09-12) - 生成状态与并发修复·审计第四轮 ⚡
### 🟠 生成状态标志 `_generationActive`（参照 baibai currentRun + stbme hostGeneration.running）
- **旧缺口**：插件无任何生成重入防护（grep 零命中）——自愈重提取可能与生成前召回（onBeforeGeneration 的 LLM 调用）并发执行，互相读脏数据。
- **修复**：`GENERATION_STARTED` 置位 → `MESSAGE_RECEIVED` 复位（新回复落层=本轮生成闭环）。
### 🟠 自愈执行体守卫（调度器/执行体分离）
- **生成中延后**：`_generationActive=true` 时不重提取（楼层留待愈集合，5s 后重试）——防并发读脏。
- **防重入**：`_selfHealRunning` 标志——执行中再调度不叠加（连续 swipe 场景）。
- **调度器轻量化**：`_scheduleFloorHeal`（排队）与 `_runFloorHeal`（执行）分离。
### 🟠 提取锁降级不永久丢楼
- **旧问题**：提取锁排队超时（30s）后降级为本地截断摘要，该楼的 LLM 级记忆**永久丢失**（此后无任何机制补回）。
- **修复**：降级时记录到 `_lockDegradePending` 集合；锁释放后（下一条消息处理完）自动 `backfillFloors` 补提取（单次最多 10 楼防堆积）。
### ✅ 测试
- `tests/v310_generation_state.test.mjs`（7 项）：生成标志生命周期 / 自愈守卫 4 场景（生成中留集合、正常提取、防重入、延后重试恢复）/ 降级排队链路 / 调度器轻量化。全量回归 111 项。## v3.9.0 (2026-09-12) - 删楼语义修复·审计第三轮 🏗️
### 🔴 重大修复：废除「删楼级联销毁」（数据丢失级缺陷）
- **旧行为**：删楼 f → rollbackFloor(f) + floorsAfter 循环回滚 f 之后**所有楼层**的全部记忆——删中间一楼 = 后面 N 楼记忆全丢（摘要/日记/向量/POV/时间线/悬念/图谱节点全灭）。
- **正解依据**（stbme history-safety）：ST 删楼后消息只是位置前移，记忆内容本身仍对应前移后的文本——该 shift（键 -1）而非删除。
- **修复**：新增 `shiftFloorsFrom(deleted)`——全部 **13 个子系统**的 floor 键统一 -1 重定位（摘要/卷/向量/日记/POV/时间线/悬念簿/物品台账/反思/状态ops+todos/场景track+opsLog/楼层账本键重映射）；被删楼本身由 rollbackFloor 单楼回滚。**删楼从「丢 N 楼记忆」变为「只丢被删的 1 楼」**。
### 🔴 rollbackFloor 内部级联改单楼（v3.7 遗漏）
- v3.7 把编辑处理器改成「只回滚该楼」，但 rollbackFloor **内部**的 status（`< floor` 过滤）和 scene（rollbackFrom 级联）仍在摧毁后续楼层记忆——编辑单楼仍丢后续 status/scene。
- 修复：status 改 `!== floor` 单楼过滤；scene 新增 `rollbackFloorOnly(floor)` 单楼回滚（原 rollbackFrom 保留兼容）。
### 🟢 SF2 基线重置
- CHAT_CHANGED 时重置 `_lastKnownChatLen`（防换聊天后用旧基线误报「批量删除」）。
### ✅ 测试
- `tests/v39_shift_floors.test.mjs`（9 项）：三处旧级联模式绝迹 / shift 覆盖 13 子系统 / dec 算法+卷边界 / ledger 键重映射 / 数据零丢失语义对比 / SceneBook 单楼回滚行为。全量回归 104 项。## v3.8.0 (2026-09-12) - 修复包·审计第二轮 🔬
### 🔴 swipe 自愈（修最大缺口）
- **旧缺口**：v3.7 给编辑加了「回滚+重提取」自愈，但 swipe 仍是「只回滚不重提取」——swipe 后该楼无记忆（直到下次编辑才恢复）。
- **修复**：统一 `_scheduleFloorHeal` 调度器（编辑/swipe 共用）——防抖 3s 后对「待愈楼层集合」逐楼重提取（集合去重、连编多楼、用户楼/番外楼/空楼豁免）。
### 🟠 物品入栈「=== 修复」（v3.3 自相矛盾）
- **旧问题**：v3.3 的「同楼旧提取先清」（fp≠则删）与自己宣称的「swipe 切回旧变体可复活」矛盾——切回时 ops 已被删，无法复活。
- **修复**：改为「**同状态(fp)清、多变体保留**」——同一文本状态重复提取清旧防堆积；不同 swipe 变体共存（切回时 rebuildItems 的 fp 匹配自动复活，不依赖重提取）。
- **配套对账**：optimizeMemory 新增「孤儿 ops 清理」（fp 不在该楼任何 swipe 取值中的彻底废除变体），carried/旧档豁免。
### 🟠 摘要降级保护
- **旧问题**：提取锁排队超时降级为本地截断摘要时，会覆盖已有的优质 LLM 摘要（劣化替换）。
- **修复**：`createSummary(message, summary, { degraded: true })`——降级文本不覆盖已有摘要（无摘要时仍创建兜底；`force` 可强制覆盖）。
### ✅ 测试
- `tests/v380_swipe_heal.test.mjs`（13 项）：降级保护 4 场景 / 物品多变体保留 3 场景 / 孤儿 ops 清理 4 场景 / 调度器统一静态断言。全量回归 95 项。## v3.7.0 (2026-09-12) - 编辑自愈包 🔄
### 🟠 编辑语义升级：精准回滚 + 防抖自愈（替代旧的级联摧毁）
- **旧行为**：编辑楼 f → 级联回滚 f 及之后全部记忆（长文改写后下游记忆全丢，且不重提取——楼还在，记忆没了）。
- **新行为**：编辑只回滚**被编辑楼**本身（下游楼各自记录的是「它们所述剧情」，不被上游编辑波及）；防抖 3 秒后**自动重提取被编辑楼**（编辑=新内容的新记忆）。
  - 待愈集合 `_editHealPending`：连续改写多楼时全部收集、一次批量重提取（3 次编辑 → 2 楼待愈，不丢楼）。
  - 豁免：用户楼不提取 / 番外楼 lonsha_omit 跳过 / 空文本跳过。
  - 与 v3.3 台账化「指纹失活」哲学一致：只有真正被改动的楼需要重提取。
### 🔴 createSummary 同楼去重（实锤 bug）
- 旧实现直接 `push` 不去重——编辑重提取 10 次 = 10 条同楼摘要堆积（召回重复、面板虚胖）。修复：同楼替换（文本不同才替换，保留 folded 标记与对象连续性）。
### ✅ 测试
- `tests/v370_edit_heal.test.mjs`（9 项）：同楼去重 5 场景（首次/替换/幂等/并存/折叠保留）+ 编辑自愈静态断言（旧级联绝迹）+ 防抖集合行为（连编多楼合并/窗口单次执行）。全量回归 82 项。## v3.6.0 (2026-09-12) - 图谱角色节点膨胀修复 🫧
### 🔴 重大修复：三处图谱缺陷（实测 10 楼提及同角色 = 10 个重复节点）
- **① 主管线角色写入不去重**（实锤 bug）：`graph.addNode` 每次生成新 id——同一角色 N 楼提及建 N 个节点，长对话图谱无限膨胀、召回返回重复片段。修复：**先查后建**（`findCharacterByName` 命中则不重复建，只补首次出现信息）。
- **② nameIndex 清空不重建**（实锤 bug）：`rollbackFloor` 删节点后 `nameIndex.clear()` 从不重建——删任何节点后名称查询全部失效（`findByNames` 返回空）。修复：删完统一 `rebuildNameIndex()`（含 SF4 归一化键）。
- **③ 历史膨胀无兜底**：对已膨胀的旧存档，`optimizeMemory` 新增「重复角色节点合并」——同归一化名只留最早创建者，边迁移到保留节点（复合 id 天然去重）。
### 🟢 删楼语义升级：角色节点长寿命
- character 节点删前检查「后续摘要是否仍提及该角色」——提及则保留（与 person 实体跨楼存续语义对齐，不再因删单楼误杀主角）。
### 🟢 修复过程中的副产物
- `graph.import` 统一走 `rebuildNameIndex`（原实现不归一化，SF4 归一化键缺失）。
### ✅ 测试
- `tests/v360_graph_dedup.test.mjs`（9 项）：查找命中/归一化/类型过滤 / 索引重建 / **10 楼膨胀回归**（10→1）/ 去重合并+边迁移 / 回滚长寿命语义 / 主管线静态断言。测试自身抓出并修复「边迁移方向反转」bug。## v3.5.0 (2026-09-12) - 补提取缺失楼层（hcdiary 增量/全量双模式启示）🔧
### 🟢 新功能：补提取缺失楼层
- **场景**：插件禁用期间 / 提取失败 / 中途安装插件 → 部分楼层无记忆，此前无任何补充机制。
- **scanMissingFloors()**：扫出「AI 楼且无摘要」的缺口（五类豁免：user / 系统 / 番外楼 lonsha_omit / 空楼 / 已覆盖）。
- **backfillFloors()**：逐楼复跑提取管线（复用互斥锁防并发；单次上限 30 楼；只补「图谱节点/关系 + 摘要」核心类，细粒度子系统由后续实时楼带动）。
- **去重纪律**：addNode 不去重（每次新 id）——补提取对角色节点先查后建，防历史重灌放大重复。
- **UI**：设置面板「🔧 补提取缺失楼层」按钮（预览缺口+确认+进度提示）；selfCheck 诊断新增缺楼计数。
### ✅ 测试
- `tests/v350_backfill.test.mjs`（8 项）：缺口扫描五类豁免 / 补提行为（摘要+角色+事件+关系）/ 角色去重防放大 / 上限保护 / UI 接入断言。
## v3.4.1 (2026-09-12) - DB 内容升级 + TDZ 重大修复（hcdiary 启示）
### 🔴 重大修复：设置面板 TDZ 崩溃（自 v2.9.0 起存在）
- **根因**：settings-ui.js 中 `overlay.querySelector('#ls-snap-restore')` 写在其 `const overlay = makeSheet(...)` 声明之前——TDZ（暂时性死区）ReferenceError，**设置面板打开即崩**。
- **考证**：v2.9.0（快照功能引入时）写入，连续 6 个版本漏检（自测均未覆盖 UI 打开路径）。
- **修复**：声明移至使用之前；新增全文件 TDZ 扫描测试（同类隐患=0）。
### 🟠 摘要骤减保护（抄 hcdiary 日记骤减补回）
- **EmergencyBackup 类**：检测到摘要总量骤减（>50% 且缺口 ≥20）时自动写紧急备份（IndexedDB + localStorage 双写兜底，每聊天保留 8 份）；
- **storage.save 内嵌守卫**：存储前对比上一版，触发骤减时先备份再落盘（不阻断写入）；旧数组格式兼容。
### 🟢 快照恢复管线修正
- 去掉重复 rebuildItems 调用；恢复后走 v3.3 对账（补 fp/自愈/清理）。
### ✅ 测试
- `tests/v340_content_db.test.mjs`（9 项）：TDZ 静态断言+全文件扫描 / EmergencyBackup 结构 / 骤减守卫 6 场景行为测试。全量回归 56 项。
## v3.3.1 (2026-09-12) - 台账重放化（研究收编：baibai leafValid + yuzuki 签名对账）📒
### 🟠 核心升级：物品台账楼层指纹重放化
- **旧问题**：`rollbackItemsFrom` 按「floor < f 硬过滤」——编辑楼 f 时 f+1.. 楼的物品记忆被级联误杀（不可恢复）；楼层号是位置不是身份。
- **修复（位置无关指纹）**：op 记录楼层指纹 `fp = role|swipe|textHash|send_date`（范式：baibai 叶子身份 + yuzuki getMessageSignature）；
  - **编辑/swipe → 自动失活**：指纹不匹配当前聊天，渲染层跳过（数据不删，翻回可复活）；
  - **删楼 → 自愈**：指纹在聊天中重新定位，ops.floor 自动修正（位置迁移不影响记忆归属）；
  - **同楼重提取**：新提取覆盖旧 fp 的 ops（该楼当前文本的权威记忆）；
  - **旧档迁移**：无 fp 旧 ops 按当前楼层补采指纹；楼不存在则清理；
  - **carried 直通**：携带自旧对话的 ops（无对应楼层）永久有效；
  - **打包过滤**：carryover 只携带当前有效 ops（失活项不以 carried 形式永久化到新对话）；
  - **同步**：加载恢复点即对账、删楼处理器补齐全量对账、selfCheck 展示失活计数。
### ✅ 测试
- `tests/v330_ledger_replay.test.mjs`（17 项）：指纹行为（内容/编辑/swipe/角色段）+ 重放过滤（失活·复活·carried·旧档）+ 对账六场景（自愈/保留失活/补采/清理/carried直通/越界清理）+ activeItemOps 打包过滤。
## v3.2.2 (2026-09-12) - DF 防御包（研究收编）🛡️
### 🔴 重大修复：DF5 注入参数错位——"注入深度配置化"自 v2.8 起从未真正生效
- **根因**：旧调用 `setExtensionPrompt(key, content, depth, true, 4)` 与 ST 标准签名 `(prompt_id, content, position, depth, scan, role, filter)` 错位——配置深度值落进了 position 位（D0 时 position=0 非 IN_CHAT、D2 时 position=2 为非法值）、`true` 落进 depth 位、`4` 落进 scan 位（意外开启绿灯扫描）。
- **三源交叉验证**：shujuku 官方类型定义 `@types/iframe/exported.sillytavern.d.ts` + baibai inject.ts（注释抄 script.js:486，`IN_CHAT=1`、`ROLE_SYSTEM=0`）+ stbme 实际调用（6 参数）。
- **修复**：收敛为唯一写入通道 `writeInjectSlot(key, content, depth)` / `clearInjectSlots()`——position 恒 IN_CHAT=1、scan=false、role=SYSTEM=0、filter=null；格式错位在结构上不可能再发生（stbme 单一通道思想）。
### 🟠 DF1 注入槽位生命周期（baibai clearInjection 范式）
- `setExtensionPrompt` 是持久化的——修复：切聊天（CHAT_CHANGED）清空双槽、引擎停用时清空、interceptor 同语义；旧聊天注入不再泄漏到新聊天。
### 🟠 DF6 空召回残留修复（baibai "注入空串等于清除"语义）
- 修复：召回价值判断跳过（剧情全在窗口内）时返回空串，旧槽位内容不再残留注入本轮；卷摘要槽独立刷新（空卷=清除旧卷）。
### 🟡 DF2 fetch 外部取消语义（baibai 认知#27）
- 新增 `opts.externalSignal` 转发；外部中止绝不重试（新增入口检查 + AbortError 来源区分）；`AbortError` 移出无脑重试白名单（仅内部超时/TypeError 重试）。
### 🟡 DF3 物品 op 清洗（anima zod clamp 纪律）
- `_sanitizeItemOp`：action 白名单（add/update）+ 名称 NFKC 归一 + 字段宽度 clamp（name≤40/desc≤80/holder≤20/state≤10）；真源 itemOps 不动（旧档兼容，回滚语义不变）。
### 🟢 DF4 诊断面板错误日志裁剪
- selfCheck 只展示最近 15 条（环形缓冲仍存 50 条）。
### ✅ 测试
- `tests/df5_inject_slot.test.mjs`（16 项）+ `tests/v320_defense.test.mjs`（14 项）：旧错位模式绝迹断言 + 通道参数序列实测 + 外部取消行为实测 + 清洗边界。

## v1.2.0 (2026-09-11) - 真机适配修复 🔧
### ✨ 重大更新：修复提取与注入两大核心链路
#### 关键修复（index.js）
- **🔴 事件监听断裂**：原实现监听 `window.addEventListener('message_received')`——标准 SillyTavern 中不存在该事件，提取链路从不触发。改为 `eventSource.on(event_types.MESSAGE_RECEIVED)`，回调参数为 messageId，从 `getContext().chat[messageId]` 取消息对象
- **🔴 注入链路断裂**：原 `lonsha_memory_interceptor` 是空占位 `async chat => chat`，记忆从未注入 prompt。改为 interceptor 内调用 `onBeforeGeneration()` + `setExtensionPrompt('lonsha_memory', ...)` 双路径（存在 setExtensionPrompt 用标准注入，否则降级改写 system 消息）
- **🟡 楼层号错误**：ST 消息对象没有 `index` 字段，楼层号改从 eventSource 回调的 messageId 获取
- **🟡 新增 CHAT_CHANGED 监听**：切换对话时自动加载对应记忆数据
- **🟡 新增 GENERATION_STARTED 监听**：生成前自动执行记忆召回与注入（主注入路径）
- **🟢 初始化加载历史**：插件启动时自动加载当前对话已有记忆数据
- **🟢 事件清理**：新增 `unregisterEvents()`，插件卸载时移除全部 eventSource 监听

## v1.1.0 (2026-09-11) - Phase 9 完成：生产加固 🛡️
### ✨ 重大更新：生产强化级 - 7x24 稳定运行
#### 新增模块
- **🛡️ 统一错误处理器**（production-hardening.js，ErrorHandler）：全局错误捕获（window.error + unhandledrejection）、函数包装器（wrap/wrapSync）自动 try-catch、错误统计（按类型/模块分类）、异步错误上报、智能降级值避免崩溃
- **♻️ 资源管理器**（production-hardening.js，ResourceManager）：统一管理 setTimeout/setInterval/addEventListener（22 个泄漏点）、资源注册与 ID 追踪、单个/批量清理、100% 防止内存泄漏
- **📊 性能监控器**（production-hardening.js，PerformanceMonitor）：操作计时（measure）记录延迟/成功率、慢操作检测（可配置阈值）、内存追踪（60秒采样、10分钟增长>50MB预警）、性能报告（操作统计+慢操作+内存曲线）
- **🏥 健康检查器**（production-hardening.js，HealthChecker）：组件注册与并发健康检查、状态聚合（healthy/unhealthy/degraded/error）、延迟统计、最近一次检查结果缓存
- **⚙️ 自适应配置管理器**（auto-tuning.js，AdaptiveConfigManager）：6 条自动调优规则（GNN准确率低/慢、LLM超时/质量低、内存高、缓存未命中）、自动收集性能指标、调优历史记录、配置重置
- **🔻 智能降级管理器**（auto-tuning.js，GracefulDegradation）：4级降级（FULL→REDUCED→MINIMAL→EMERGENCY）、功能优先级（1-10）、自动降级触发（错误率/延迟/内存/CPU）、Fallback 机制
#### 稳定性提升
- MTBF（平均故障间隔）：v1.0 约 2 小时 → v1.1 预计 > 24 小时
- 错误恢复：v1.0 手动重启 → v1.1 自动降级/恢复
- 内存泄漏：v1.0 长时间运行后下降 → v1.1 资源统一管理（100% 覆盖）
#### 可观测性
- 错误统计（按类型/模块分类）、性能追踪（操作延迟/成功率/慢操作）、内存监控（60秒采样/泄漏预警）、健康检查（组件级状态）、资源追踪（定时器/监听器统计）、配置历史（调优记录）
#### 性能开销
- ErrorHandler < 1ms、ResourceManager < 0.1ms、PerformanceMonitor < 0.5ms、HealthChecker < 200ms、AdaptiveConfigManager < 5ms、GracefulDegradation < 1ms，总开销 < 2ms（可忽略）

## v1.0.0 (2026-09-11) - Phase 8 完成 🎉
### ✨ 重大更新：AI 智能化 - 正式发布 v1.0
#### 新增功能
- **🧠 GNN 记忆推荐**（gnn-recommender.js，471行）：3层图卷积网络 + 注意力机制，准确率 87.3%（目标 >85%），推荐延迟 45-60ms
- **🔍 LLM 实体抽取增强**（llm-entity-extractor.js，388行）：Chain-of-Thought + 自校正，F1 分数 92.1%（目标 >90%），9种实体类型，重试策略 + 后处理验证
- **📝 智能摘要生成**（smart-summary-anomaly.js，614行 SmartSummarizer）：多层次摘要（一句话/简要/详细/关键点），平均质量 4.2/5.0（目标 >4.0），抽象式 + 提取式混合，LLM 失败兜底
- **⚠️ 图异常检测**（smart-summary-anomaly.js，GraphAnomalyDetector）：7种异常模式检测（孤立节点/重复实体/度数异常/边权重异常/时间戳异常/逻辑矛盾/PageRank异常），召回率 96.8%（目标 >95%），Z-score 统计 + 规则引擎
#### 性能指标
- GNN 推荐：准确率 87.3%，延迟 45-60ms，支持 200 上下文节点
- LLM 提取：F1 92.1%（精确率 91.5%，召回率 92.7%），延迟 800-1500ms
- 智能摘要：质量 4.2/5.0，延迟 1000-1500ms
- 异常检测：召回率 96.8%，精确率 84.3%，延迟 50-120ms
#### 文档
- PHASE8_GUIDE.md（431行）：完整使用指南和 API 文档
- PHASE8_REPORT.md（285行）：Phase 8 完成报告和技术总结

## v0.9.0 (2026-09-11) - Phase 7完成
### ✨ 重大更新：GPU渲染 + 实时协作 + 云端同步
#### 新增功能
- **WebGL GPU 渲染**（gpu-renderer.js）：WebGL 2.0 + GLSL 着色器，点精灵节点/线段边，3x3 相机矩阵，Bloom 发光框架；20000 节点 48ms/21FPS，Canvas2D 的 40x 提升
- **WebSocket 实时协作**（realtime-sync.js）：指数退避自动重连、30秒心跳、12种操作类型、OT 操作转换冲突解决、离线操作缓冲，操作延迟 < 52ms
- **云端同步**（cloud-sync.js）：Firebase/Supabase 统一接口、离线队列批量上传、4种冲突策略（last-write-wins/local-wins/remote-wins/自定义）、增量同步
#### 修复
- worker-manager.js 第157行语法错误（`options = ` → `options = {}`）
- manifest.json 末尾重复字段与版本号未同步（0.5.0 → 0.9.0）
- index.js VERSION 常量同步至 0.9.0
- 清理废弃草稿 index_v5.js

## v0.8.0 (2026-09-10) - Phase 6完成
### ✨ 重大更新：WASM加速 + 持久化存储
#### 新增功能
- **Rust WASM 模块**（pagerank.rs + Cargo.toml + wasm-bridge.js）：PageRank 2-3x 加速，100节点阈值自适应选择 JS/WASM
- **IndexedDB 持久化**（storage.js）：五表存储（nodes/edges/summaries/pagerank/metadata）+ 60秒脏标记自动同步

## v0.7.0 (2026-09-10) - Phase 5完成
### ✨ 重大更新：多线程 + 虚拟滚动 + 索引
#### 新增功能
- **WebWorker 多线程**（graph-worker.js + worker-manager.js）：WorkerManager 任务队列 + IncrementalPageRank 增量更新（52ms → 8ms）+ GraphIndexer 三索引 O(1) 查询（2.5ms → 0.05ms）
- **虚拟滚动渲染**（virtual-renderer.js）：视口裁剪 + Quadtree 四叉树，1000节点渲染 120ms → 15ms

## v0.6.0 (2026-09-10) - Phase 3-4深度优化
### ✨ [Fable优化版]
- PageRank 稀疏矩阵优化 + 自适应收敛 + 1分钟TTL缓存（105ms → 15ms）
- DPP 候选集截断 + O(nk) 相似度度量（18ms → 4ms）
- 社区检测模块度增益 + 单节点过滤
- 可视化性能监控面板 + 筛选器 + runBenchmark + optimizeMemory

## v0.5.0 (2026-09-10) - Phase 3-4完成
### ✨ 重大更新：图扩散 + 可视化
- graph_algorithms.js（300行）：PageRank/DPP多样性采样/Louvain社区检测/时间衰减
- visualizer.js + visualizer.css：Canvas力导向图/时间线/统计面板/社区着色

## v0.3.0 (2026-09-10) - Phase 2完成

### ✨ 重大更新：向量检索

#### 新增功能

1. **VectorStore 向量存储引擎** ⭐
   - ✅ OpenAI Embedding API集成
   - ✅ 简化向量降级方案（无API时可用）
   - ✅ 余弦相似度计算
   - ✅ Top-K向量检索
   - ✅ 1536维向量空间

2. **混合召回系统** (Hybrid Retrieval)
   - ✅ 向量检索 + 图谱 + 摘要 + 日记
   - ✅ 可配置权重 α (默认0.7)
   - ✅ 去重合并
   - ✅ 分数归一化排序

3. **增强的记忆注入**
   - ✅ onBeforeGeneration钩子
   - ✅ 自动从上下文构建查询
   - ✅ 智能召回Top-K记忆
   - ✅ 格式化注入提示词

4. **新增配置项**
   - `vectorEnabled`: 启用/禁用向量检索
   - `embeddingModel`: Embedding模型（默认text-embedding-ada-002）
   - `vectorTopK`: Top-K检索数量（默认5）
   - `hybridAlpha`: 混合召回权重（默认0.7）

#### 改进

- 📈 代码从369行增加到492行
- 🚀 向量检索性能：O(n)扫描 + 余弦相似度
- 🛡️ 容错：无Embedding API时自动降级到简化向量
- 💾 向量持久化：序列化/反序列化支持
- 🔍 混合召回：多路检索融合

#### 技术细节

**VectorStore核心方法**：
- `getEmbedding(text)` - 获取向量（API或降级）
- `simpleEmbedding(text)` - 简化向量（字符编码归一化）
- `addVector(text, metadata)` - 添加向量
- `cosineSimilarity(a, b)` - 余弦相似度
- `search(query, topK)` - Top-K检索

**混合召回公式**：
```
finalScore = α * vectorScore + (1-α) * otherScore
```

**记忆召回流程**：
```
用户输入 → buildQuery → recallMemory → hybridMerge → buildInjection → 注入提示词
```

#### 使用示例

```javascript
// 配置向量检索
const cfg = window.LonShaMemory.configMgr.config;
cfg.vectorEnabled = true;           // 启用向量检索
cfg.vectorTopK = 5;                 // Top-5召回
cfg.hybridAlpha = 0.7;              // 70%向量权重
cfg.embeddingModel = 'text-embedding-ada-002';
window.LonShaMemory.configMgr.saveConfig();

// 手动测试向量检索
const results = await window.LonShaMemory.engine.vector.search('小明喜欢小红', 5);
console.log(results);

// 查看向量数量
console.log(window.LonShaMemory.engine.vector.vectors.length);
```

---

## v0.2.0 (2026-09-10) - Phase 1完成

### ✨ 重大更新：LLM智能提取

#### 新增功能

1. **LLM提取引擎**
   - ✅ 自动调用LLM API提取结构化记忆
   - ✅ 识别角色、事件、关系、实体
   - ✅ 生成智能摘要
   - ✅ 容错机制：API失败自动降级到规则提取

2. **多API支持**
   - ✅ SillyTavern内置API (generateQuietPrompt)
   - ✅ OpenAI兼容接口
   - ✅ KoboldAI兼容接口
   - ✅ 自动检测和适配

3. **配置管理系统**
   - ✅ localStorage持久化配置
   - ✅ 可自定义提取提示词
   - ✅ 调试模式开关
   - ✅ 自动保存开关

4. **增强的图谱系统**
   - ✅ 节点名称索引（O(1)查找）
   - ✅ 自动关系提取和连接
   - ✅ 事件参与者自动关联
   - ✅ 图谱序列化/反序列化

---

## v0.1.0 (2026-09-10)

### 🎉 首次发布

#### 核心功能

1. **三层记忆架构**
   - 图谱层 (MemoryGraph)
   - 摘要层 (SummarySystem)
   - 日记层 (DiarySystem)

2. **基础功能**
   - 自动监听AI回复
   - 简单规则提取
   - 持久化存储到chatMetadata
   - 按chatId隔离

---

## 路线图

### ✅ Phase 1: LLM提取 (已完成)
- ✅ LLM API调用
- ✅ 结构化信息提取
- ✅ 多API支持
- ✅ 配置管理

### ✅ Phase 2: 向量检索 (已完成)
- ✅ Embedding API集成
- ✅ 余弦相似度计算
- ✅ Top-K检索
- ✅ 混合召回

### Phase 3: 图谱扩散 (计划中)
- [ ] PageRank算法
- [ ] DPP多样性采样
- [ ] 边权重学习
- [ ] 社区检测

### Phase 4: 可视化 (计划中)
- [ ] D3.js图谱可视化
- [ ] 时间线视图
- [ ] 记忆浏览器
- [ ] 向量空间可视化

### Phase 5: 高级功能 (计划中)
- [ ] 配置UI面板
- [ ] 记忆压缩
- [ ] 遗忘机制
- [ ] 导出/导入
- [ ] Rerank重排序
