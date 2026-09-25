# 双项目四批交付跟踪

状态：实施中，未发布。用户已授权四批及后续自主迭代；不把代码、自动化、实机验收混同。
基线：LonSha 3.212.0 / RubyPhone 3.0.0，工作区原始干净；1673断言+42审计、835测试+九门日志通过。旧启动未记录退出码，新门禁必须记录。
当前：**P 批（优化方向 · 第二批）已开批**，分四版做完（V1 ~ V4）。
LonSha 3.229.0（**P-1 死方法处置**：O-6 台账上 4 条零引用方法逐条实测后删除定义，
台账由「冻结基线」升级为「处置台账」，零引用 4 → 0；**反坐实** O-6 那条「删它需连配置键一起处置」
的推测不成立 —— `hybridAlpha` 的活消费点是 `hybridMerge()`，与遗留方法无绑定；
同轮修掉三处判据自身缺陷，含一处**负控制因自扫而假绿**（探针方法名被 A7 的 tests/ 扫描面
当成「有一条测试引用」，破坏没被观测到））/
RubyPhone（P-4 存储层 schema 版本戳，本版同轮，见下游计划）。

## 全范围与验收
1. **可信数据与可查记忆**（O1、O2基础、O6、F1/F2）：业务字段需求表；投影同源身份/修订/时间/权限；工作台与证据查询、修复预览确认及真实传播回执。隐藏不可旧桥回退，缺席≠空，切会话和过期不能冒充当前正常。
2. **准确记忆与受控行动**（O3/O4、O2保存、F3/F4）：固定剧情质量集，最终实际注入/预算/去重，取消和迟到隔离，约定→日历→提醒→处理→回执，双向关系/知情网络。幂等、修订校验；人工计划≠正文事实。
3. **长线生活与社交生态**（O5、O2长线、F5/F6）：先测量再优化、长列表及后台恢复；地点层级与剧情日程冲突；唯一事件传播、渠道权限、误传澄清和频率约束。1000楼压力及增长/监听器检查，不虚报实机性能。
4. **分支与玩法拓宽**（O2隔离增长、O6维护、F7/F8）：持久检查点/回滚预览/分支只读对照；四类可选玩法包及主动候选，暂停预览拒绝；旧分支不召回、关闭无残余注入。不自动合并互斥分支、不默认跨会话共享。

每批：完整用户流程、跨仓兼容、失败重试/回滚/切聊、测试与审计、版本公告同源、离线包；实机缺证必须显式记录。版本号在该批功能和门禁就绪后才抬，不为零散修复凑发布。

## 不动范围
存储归属/外部数据库/依赖体系/用户存档/凭据/原作者仓库；不重造既有事实、秘密、伏笔、迁移和修复机制。Windows结构规范当前不可读，已告知用户，遵循仓内现有规范。

## Gate R1-A：投影缺席语义
- Structural: Local Fix；Execution: Local Fix Only；授权：approved local fix（四批授权内）。
- 证据：真实 runPipeline provider返回undefined，object形状被归为empty，summary.absent=0；null同态；0正常value。
- 契约：undefined保持absent，显式null按声明空形归empty；0不改；API1/函数形状/存储/模块加载不变。
- 允许：projection-pipeline.js 与 tests/projection-absence.test.mjs；预算80行，另本计划文档。
- 验证：新回归先红后绿、旧v3208/v3212、全量test:audit；不删除功能。
- 回滚：仅逆转该小补丁及新增测试；出现历史契约冲突回AUDIT，不放宽门禁。
- 子agent：DeepSeek R1-A提供候选，我方真实模块复现。API Key不写入仓库。

## Gate R1-C：投影的导出期新鲜度（比「归属」，不比「时刻」）
- Structural: Local Fix；Execution: Local Fix Only；授权：approved local fix（四批授权内）。
- 证据：`_lastProjectionEnvelope` 的归属（conversationId + revision）只在 `readWorldLedger()`→`_buildProjectionEnvelope()` 写入的那一刻成立。
  切聊（CHAT_CHANGED）换 chatId、回滚/恢复（`_bumpEpoch`）只递增 `_mutationEpoch`，两条路径**都不清该缓存**；
  `buildBridgeSnapshot()` 于是把旧会话/旧代数的投影当作当下读数导出（不报错、只错结果）。
- 契约：同会话同代数 ⇒ 照常导出；会话或代数不符 ⇒ 不导出（`projection` 为 undefined ⇒ 自述 present=false）并留痕；
  取不到 chatId ⇒ 放行，原契约不变（拿不到判据不等于证伪）。`generatedAt` 只记生成时刻、不携带归属，改时间戳等于把陈旧内容伪装成新鲜，故只比对会话+代数。
- 允许：index.js（buildBridgeSnapshot 新鲜度守卫 + `snap.meta.projectionFreshness` 归因字段）、tests/v3213_projection_cache_freshness.test.mjs、catalog_reference_consumers.tsv 一行、本计划文档。上游预算 3 文件 / 60 行。
- 验证：新回归先红后绿（首跑 4a/4b/4c 因锚点不存在报红，实现后转绿）、v3212/v3174/projection-absence 联合35项通过、全量 test:audit RC=0；不删除功能。
- 回滚：仅逆转该小补丁及新增测试；出现历史契约冲突回 AUDIT，不放宽门禁。
- 子agent：DeepSeek R1-C 提供候选（主张**读取期校验**而非新增清理点：`_mutationEpoch` 递增点十处以上，逐点清缓存必漏；用 undefined 表「不可用」以与「无会话」区分），我方逐行复核并在真实模块上复现。API Key 不写入仓库。
- 「扔掉了」与「本来就没这面」分开：前者等宿主重跑、后者等上游升级，处置相反，压成一态即错读数。

## Gate R1-E：九账只读对账面（工作台与证据查询的上游出口）
- Structural: Local Fix；Execution: Local Fix Only；授权：approved local fix（四批授权内）。
- 证据：本仓九本账（伏笔 seed / 约定 commitment / 平行事实 parallel / 秘密 secret / 回扣 recall-echo /
  回声 echo / 事实版本 fact-version / 事件完整性 event-completeness / 修复闭环 repair）各自有
  `list()` / `summarize()`，但**对外是一排孤立文本行**：`ledger-replay.js` 的 `FLOOR_OWNERS` 只登记
  「谁有楼层归属」，不含条目正文、状态与引用键；快照 15 字段里**无一本账**（`worldProg` 只带四本账的
  原始状态，且不含 `_factVersionState` / `_eventThreadState` / `_repairState`）。下游要回答
  「她现在住哪里 / 这个承诺是哪一楼说的」只能逐 App 翻，且**拿不到出处**（无楼层、无来源账、无修订）。
- 契约：新增 `evidence-workbench.js`（纯函数、零依赖、双导出），把九账收成**一份可查对账面**：
  · `LEDGERS` 登记表是单一真源（id / label / 取状态 / 取账本 API / 列表过滤 / 引用前缀）；
  · 每账三态 `ok` / `empty` / `absent`（模块未挂载、状态取不到、条目为空**三者不得同形**）；
  · 每条条目带 `ref`（稳定引用键，如 `seed:sp_3`）+ `ledger`（来自哪本账）+ `floor`（出处楼层，
    取不到即 `null`，**不写 0** —— 0 是「第 0 楼」这个真实读数）；
  · `search()` 纯函数在面内检索，返回命中**与未命中的账**（「这本账里没有」≠「这本账不存在」）。
  不改既有账本 API、不改 `ledger-replay` 登记表、不写任何账本状态。
- 允许：evidence-workbench.js（新增）、index.js（`_evidenceWorkbench()` + 快照 `evidence` 字段）、
  manifest.json（extra_js 一行）、tests/v3214_evidence_workbench.test.mjs、
  tests/audit/catalog_reference_consumers.tsv 一行、dead_code_budget.json 抬 ceiling、本计划文档。预算 4 文件 / 260 行。
- 验证：新回归先红后绿；v3212/v3213/projection-absence 联合通过；全量 test:audit RC=0；不删除功能。
- 回滚：仅逆转该新增模块与快照接线；出现历史契约冲突回 AUDIT，不放宽门禁。

## Gate R1-F：修复预览与受控写入回执
- Structural: Local Fix；Execution: Local Fix Only；授权：approved local fix（四批授权内）。
- 证据：`repair-loop.js` 三类修复动作（retarget / split / revoke）与宿主 `requestRepair` / `settleRepair`
  已实现（v3.194），但**零真实调用点**：全库 grep `requestRepair` 只有两处定义与一条测试扫签名
  （`tests/v3194` 的字符串断言），产品代码**没有任何一处调用**。于是「撤销一条错误事实」在用户面前
  不存在入口，而它正是本仓治理过多轮的「源头改了、下游没跟着改」的唯一收口。
  另：`request()` **不幂等**（同一次修复重试会新增一条记录），且桥无写入口，下游无从发起。
- 契约：
  · `preview(rawState, input)`（新增纯函数）：只算 `affectedBy` 命中面，**不落账**、不改 state；
  · `request()` 增 `dedupeKey` 幂等（同键且未 abandoned ⇒ `replayed:true`，不新增记录；缺键时行为逐字同旧版）；
  · 桥新增**受控写入面** `window.lonsha_memory_bridge_v1.repair`（与只读 `snapshot` 分离）：
    `preview(input)` 只读预览；`apply(input, {idempotencyKey, expectRevision})` 落账并返回回执；
    `settle(input)` / `abandon(input)` 逐项落定与放弃。
  · 回执形状恒定：`{ok, reason, repairId, action, affected, total, revision, replayed, at}`；
    `expectRevision` 不符即拒（`reason='revision-mismatch'`）且**不改账**；缺 `idempotencyKey` 即拒
    （`reason='missing-idempotency-key'`）。
  · 只读面不变：`snapshot` 仍是只读，不含任何写入方法（既有注释纪律保持）。
- 允许：repair-loop.js（preview + dedupeKey）、index.js（previewRepair + 桥 repair 命名空间）、
  tests/v3215_repair_write_channel.test.mjs、catalog_reference_consumers.tsv 一行、dead_code_budget.json、本计划文档。
  预算 3 文件 / 220 行。
- 验证：新回归先红后绿（先证 request 不幂等、preview 不改账、修订不符拒写）；v3194/v3202 回归；全量 test:audit RC=0。
- 回滚：仅逆转本补丁；出现历史契约冲突回 AUDIT，不放宽门禁。
- 边界：**不自动改派生件**（改哪一处是产品决定，自动改会累积幻觉删改 —— repair-loop 原注释已立）。
  人工点「纠正归属」≠ 正文已发生；回执只记「账上落定了什么」，不推断剧情已经发生。

## Gate R2-A：注入读数真实性（**已完成**，v3.215.0）

主题：**最终实际注入**的读数只能由生成路径写；诊断必须另存；代际过期必须留痕；
零块必须有读数；注入面必须外供。

- 修前实测四条真缺陷：①**归属塌陷**（`_lastInjection` 被真注入与 selfCheck 的
  「召回管线 dry-run（**不注入**，只验证链路通）」同时写，而面板文案是「即 AI 真实所见」）；
  ②**迟到污染**（代际守卫在 await 之后判定，写入点在 await 内部无条件执行，过期只打一行日志）；
  ③**零块未定义**（`if (inj2)` 短路使「本轮 0 块」与「还没跑」同形）；
  ④**注入面不外供**（快照 15 字段里没有注入面）。
- 收口：唯一构造点 `_injectionRecord`（恒定 10 键）/ 诊断 `_diagnostics.dryRun` /
  零块落地（`blocks:[] total:0` 且 `round` 照常推进）/ 逐块读数 `_injectionBlocksOf`
  （`kept` vs `dropped-budget`）/ 块引用键 `_injectionRefOf` / 过期留痕 `_injectionDiscardStale`
  （**不碰读数**）/ 外供面 `buildInjectionReadout()` 进快照 + 桥 `injectionRefOf`。
- 验证：v3216（T1-T10 + N1-N4，先红后绿；负控制一律真源码破坏 → 载入破坏副本 → 重跑同款判据）；
  全量 196/196 文件、1721 断言、42/42 审计 RC=0。
- 边界：**不声称**消除「过期代在 await 期间已写脏」——那要把记录延迟到 await 之后，属 R2-B；
  本 Gate 只保证「过期必留读数」与「读数只有一个构造点」成立且可分。
- 回滚：仅逆转本补丁；门禁失败只回滚不放宽。

## Gate R2-B：迟到隔离（读数落地不早于代际确认）（**已完成**，v3.216.0）

主题：R2-A 已如实声明的那条边界的收口 —— 迟到的结果不得写脏读数。

- 修前实测：`onBeforeGeneration()` 在 `await` **内部**无条件落地 `_injectionRecord`，
  而代际守卫在 await **之后**才判定。快速连发时先发那一轮已写脏读数，守卫只拦住
  `writeInjectSlot`，拦不住读数；面板上「最近一次实际注入」可能是**一次从未生效的注入**，
  而旁边写槽位的结果恰说明这轮没生效 —— 两行读数互相矛盾。
- 收口：`_injectionStage`（await 内只**暂存** `_injectionPending`，绝不动 `_lastInjection`）
  + `_injectionCommit(myGen)`（守卫**之后**的唯一落地点，内部再做一道代际核对，
  不符即返回 null 不静默落别的代的载荷）；**轮次号只由提交推进**（被丢弃那代不占号，
  于是「第 N 轮」恒等于「真正生效过的第 N 次注入」）；过期分支**必须清暂存**
  （不清则下一轮捡起旧载荷落成读数 —— 张冠李戴比不落地更坏），并把被丢弃载荷读数
  （`pendingDiscarded`/`payloadChars`/`payloadBlocks`）记进 `_lastInjectionDiscard`。
- 验证：v3217（11 条，先红后绿）；全量 197/197 文件、1732 断言、42/42 审计 RC=0。
- 边界：只保证「读数落地不早于代际确认」与「过期载荷不得被下一轮捡起」；
  **不声称**消除注入槽位之外的其它迟到写（charMem / 各账本），属后续 Gate。
- 回滚：仅逆转本补丁；门禁失败只回滚不放宽。

## Gate R2-C：消费侧接入注入面读数（**已完成**，RubyPhone v3.0.2）

主题：上游 R2-A/R2-B 做出来的「最终实际注入」读数，下游必须有人读 ——
且读的价值不在搬数字，而在**把上游已给、但没人读的那层分态读出来**。

- 归属仓：**ruby-phone**（消费侧）。上游两段（读数真实性 / 迟到隔离）已交付；
  本段是只读消费面，**不涉及** RubyPhone 侧写入授权（R1 结论：写面授权仍待确认）。
- 侦察（先证再改）：`snapshot.injection` 在 `apps/**` + `config/**` 全库零消费；
  上游读数形状逐键核对（顶层 9 键、逐块 6 键）与上游 `tests/v3216` 组 9 的键面锁一致。
- 裁定面（本 Gate 的核心）：上游做到了第一层分态（「跑过、真的 0 块」≠「还没跑过」），
  而**「0 块」内部还有第二义** —— `total === 0` 是「召回没给出可用素材」，
  `total > 0 && kept === 0` 是「素材有、全被注入预算裁掉」。两者处置方向相反
  （前者查召回键 / 上游编辑 / 键漂移，后者调 `injectionBudget` / 看预算策略），
  压成一态即错读数。故本版拆成 `candidates-empty` / `all-dropped` 两态，
  连总述文案也不许同形（有判据守）。
- 四类处境四句话互不相同：`no-injection-face`（等上游升级）/ `never-run`（等生成跑一轮）/
  `candidates-empty`（查召回）/ `all-dropped`（查预算）。缺席两态按 `fieldTypes` 自述判；
  无自述时按**较保守**的一边报，不硬猜。数值归一「没给」≠「给了 0」（`round` / `ts` / `tokens`）。
- 另加**归属复核** `strayOrigin`：经快照外供的读数只该由真生成写（`origin === 'generation'`）；
  非 generation 即上游归属又塌陷，本仓标红而不是当正常读数用（消费侧对上游 R2-A 的独立再判）。
- 落地：`config/injection-contract.js`（新增，消费侧单一真源）+ 诊断中心注入读数卡
  （七卡变八卡）+ 织光机回望页送达侧区块 + 第九道门 **J10**（消费点下限 2）+ `tests/system-v302`（21 条）。
- 边界：只读消费面；真实 SillyTavern 宿主实机未验；上游 R2-B 已声明的边界照旧
  （**不声称**消除注入槽位之外的其它迟到写）。
- 回滚：仅逆转本补丁；门禁失败只回滚不放宽。

## Gate R2-D：无主暂存不得被别的代捡起（**已完成**，lonsha v3.217.0）

主题：R2-B 已如实声明的那条边界的**另一半** —— 不是「同一条路径内的迟到」，
而是「载荷由 A 路径留下、被 B 路径提交」。

- 归属仓：**lonsha-memory-plugin**（上游注入面）。下游 R2-C 已完成（消费侧读数）。
- 修前实测两处：① `_injectionCommit(myGen)` 只核对「调用者传进来的代」与当前代，
  **从不核对载荷自己的代**（`p.gen`）⇒ 任何「留下暂存却没提交」的路径，其载荷会被
  **下一轮的提交**当成自己的载荷落成读数（`round` 照常前进，`gen` 停在旧代）；
  ② `window.lonsha_memory_interceptor`（保留的兼容发布路径）调完 `onBeforeGeneration()`
  只写注入槽位、**从不提交/丢弃** ⇒ 暂存永久悬空，成为 ① 的现成供体
  （该路径在真宿主上确实会被走到：「部分 ST 版本通过 manifest generate_interceptor 调用」）。
- 收口：`_injectionCommit` 增**载荷自身代核对**（不符即不落地 + 按过期收尾，既不落成读数也不静默消失，
  `Number.isFinite` 守卫使「无代」视同当代）；新增**收尾唯一入口** `_injectionClose(myGen)`
  （有暂存则提交，提交不成即按过期收尾且不重复留痕；`had` 在提交**之前**读，
  防「本来就没有」与「刚刚提交掉了」同形）；两条发布路径（事件 / interceptor）各占一代并共用它。
- 验证：v3218 11 条先红后绿（负控制一律真源码破坏 → 载入破坏副本 → 重跑同款判据，
  破坏点取**整块**守卫以防「只删条件行、留下块体」的假绿）；全量 198/198 文件、
  1743 断言 0 失败、42/42 审计 RC=0。
- 边界如实声明：只保证「每条发布路径的读数只属于它自己那一次」与「无主载荷不得被另一路径捡起」；
  **不声称**解决「两条发布路径同时活跃时谁赢」（宿主集成面，取决于 ST 版本实际走哪条路），
  也不声称消除注入槽位之外的其它迟到写（charMem / 各账本写入）。
- 回滚：仅逆转本补丁；门禁失败只回滚不放宽。

## Gate R2-F：双向关系对账 + 知情网络（**已完成**，lonsha v3.219.0）
- 修前实测（真源码重放）：
  ① 关系边单向主观，注入侧只原样列出召回边，**没有一格说「对侧那条在不在」**——
  「乙对甲是警惕」与「乙对甲从未登记」同形，而后者是提取漏了一条（该补记）。
  「对侧不在」有三种来源（本轮被披露条件挡下 / 已失效 / 压根没登记），压成一态会让模型去补一条不该补的关系。
  ② 认知隔离用 includes / !== 逐字比较：同一件事三种措辞记 **3 条**，用告知式措辞去解除**一条都清不掉**（认知隔离永不解除）；
  getReEntryNotice 只取前 3 条，前 3 格被旧措辞占死，真实新增的认知边界永远挤不进去。
- 收口：新增 `relation-mutual.js`（四态对账 mutual / mutualGated / mutualExpired / oneSided，只有末态该补记，注入只标 one-sided）与
  `knowledge-network.js`（三级同一性判据，判不开一律判不同；疑似档只报候选不合并）。
  宿主接线：markUnaware 同事实不重复登记、已知侧有同事实不再登记为「不知道」；revealKnowledge 按下标删；模块缺席回落逐字口径。
  诊断面增「双向对账」「知情网络」两行，报警只认真损失（oneSided / suspect）。
- 测试：`tests/v3220_relation_mutual_knowledge.test.mjs` 18 条（含四条真源码破坏负控制）；既有 v341 / v3184 全绿。
- 门禁：全量 200/200 文件 / 1772 断言 0 失败、42/42 审计 RC=0。
- 跨仓：本 Gate **无新增外供字段**（读数落在插件内诊断面），故下游本轮不接入、不抬版。

## Gate R2-E：取消留痕（**已完成**，lonsha v3.218.0 + RubyPhone v3.0.3）

主题：R2-A 的读数只回答了「AI 这一轮看到了什么」，没有回答「**这一轮到底有没有出稿**」——
用户按 Esc 中止与正常完成，在读数上**同形**。

- 归属仓：**lonsha-memory-plugin**（上游注入面）+ **ruby-phone**（消费侧，跨仓纪律同轮抬版）。
- 侦察（先证再改）：`GENERATION_ENDED` 处理器（`_h6`）当前只做一件事 ——
  复位 `_generationActive = false`（v3.12 兜底，防自愈永久延后）；
  于是**中止那一轮同样留下 `_lastInjection`**（注入确实发生过：STARTED 已写槽位、
  模型也确实收到了 prompt），而**没有任何格子说「这一轮没产出回复」**。
  两者处置相反 —— **被中止 ⇒ 该重发；已完成 ⇒ 该看回复**；压成一态即本仓最贵的错读数。
- 上游收口（v3.218.0）：
  · `_injectionRecord` 键面 10 → 11（增 `outcome`，缺省 `'pending'`）；
  · 新增 `_injectionEnd(kind)` 作为**唯一** outcome 标注入口 —— 只从 `'pending'` 迁出
    （幂等门：ST 正常次序是 `MESSAGE_RECEIVED` 先于 `GENERATION_ENDED`，
    已判定的不再被后到的事件改写），无读数计 `noReadout`、已判定计 `afterReadout`；
  · 接线两处：`_h1`（MESSAGE_RECEIVED）落 `received → completed`；
    `_h6`（GENERATION_ENDED）落 `ended → aborted`（**先复位标志后标结局**，两步都不省）；
  · 外供面 `buildInjectionReadout()` 9 → 10 键（带出 `outcome`）；
  · 自检行与面板加结局徽标（✓已完成 / ⚠️被中止，零块分支同样带结局）。
- 下游同轮接上（v3.0.3，跨仓纪律：**上游给了就必须同一轮有人读**）：
  · `config/injection-contract.js` 读出面增 `outcome` / `outcomeAt` / `faceDrift`，
    新增 `outcomeText()`（未知结局**如实输出原值**，不兜底 `pending` ——
    那会把「上游给了个没见过的结局」伪装成「正常的进行中」，让本仓失去发现契约变更的能力）
    与 `injectionFaceKeys()`（跨仓契约快照：上游注入面 10 键）；
  · 「上游没给这格」与「给了 pending」严格分开：缺格如实 `null` 并计入 `faceDrift`，
    总述写「结局：未提供（上游这版还没外供 outcome）」，两者文案不许同形；
  · 诊断中心：**被中止进坏消息首行**（该重发），**已完成不进**（回复已在那儿，写进去只会
    稀释「需要用户做的事」）；注入卡结局单独一格（完成绿 / 中止红 / 未定灰）+ 契约漂移对账提示；
  · 织光机回望页「送达侧观测」带出并显示结局。
- 跨仓纪律的判据化：上游 `tests/v3219` 组 6 守「外供面带出 outcome」；
  下游 `tests/system-v303` A2 把**同一份键面**钉成契约快照逐键核对 ——
  任一侧改名，两侧各有一处会红。
- 验证：上游 v3219 11/11 先红后绿；全量 **199/199 文件 / 1754 断言 0 失败、42/42 审计 RC=0**。
  下游 v303 17/17 先红后绿（含镜像树自证 C0 + 6 条负控制）；`npm run check` 九门全绿。
- 本轮当场捐到并修掉的真缺陷（下游，由 dead-export 门禁捐到）：
  **契约快照 `injectionFaceKeys` 建好、导出、测试也引，但产品端零消费** ——
  正是本仓「建好不消费」的**第八次**形态（只有测试引用不算消费）。
  修法**不是**登记进冻结账本，而是让产品面真读它：诊断卡的契约漂移提示现在会列出
  **本机认得的整份注入面键面**（用户据此才能自证「是上游旧版，还是本机认错了格子」），
  并补 C6 负控制守它（破坏产品面消费 ⇒ 同款判据必须转红）。
- 边界如实声明：只保证「结局三态在读数上可分」与「标注入口唯一、幂等」；
  **不声称**覆盖宿主未发 `GENERATION_ENDED` 的情形（那仍是 `pending`，如实报「未定」），
  也不声称解决注入槽位之外的其它迟到写。真实 SillyTavern 宿主实机未验。
- 回滚：仅逆转本补丁；门禁失败只回滚不放宽。

## Gate R3-A：场所三面外供（**已完成**，lonsha v3.220.0 + RubyPhone v3.1.0）

主题：R3（长线生活与社交生态）第一批次的第一项。场所图景在账本**内部**早就有三面能力，
`summary()` 却只外供「当前链末级字符串 + 规模四数」—— 手机端由此成为「有表无实」。

- 归属仓：**lonsha-memory-plugin**（外供面）+ **ruby-phone**（消费侧，跨仓纪律同轮抬版）。
- 侦察（先证再改）：`scene-book.js` 内部已有层级树（`outlineOf` / `chainOf`）、到访史
  （`visitsOf` / `visitsList`，含次数 / 首末楼层 / 重访标记）、本楼场景头（`headerAt` / `headerLine`，
  含日期 / 时段 / 天气）；而 `summary()` 只返回 `current`（**末级键字符串**）+ `scale` 四数。
  ⇒ 只读快照桥 `snapshot.scene` 里**没有任何一格**能回答「这店在市里哪一区」「去过哪些、去过几次」
  「那天什么天气」。三问全部答不出，而数据就在手边 —— 这是「做了不外供」，不是没做。
- 上游收口（v3.220.0）：
  · 新增 `tree(limit)`（pre-order 扁平，逐行 key / path / name / **真实 depth** / desc / floor / visited / visits）、
    `visitHistory(limit)`（key / path / count / firstFloor / lastFloor / revisit / registered / desc）、
    `headerFace(floor)`（{floor, date, period, weather} 或 `null`）；三者只读、不抛、有界；
  · 新增上限常量 `MAX_TREE_ROWS = 240`（防单次读数无界，同 `MAX_BRIEF_LINES` 一类）；
  · `summary()` 外供面 7 → 11 键（增 `currentChain` **结构化数组** / `tree` / `visits` / `header`），
    **旧键一个未动** —— 旧消费方读数不变；
  · 新增 `numOrNull(v)`：`null` / `undefined` / `''` 三态直返 `null`，把「没给」与「给了 0」判开
    （`Number(null) === 0` 是 v3.212 线已吃过一次的老账），`tree.floor` 与
    `visitHistory` 的三个数值格全部改走它并按 `null` 排序（不当作第 0 楼）；
  · 宿主 `SceneBookFallback` 补 `tree()` / `visitHistory()` / `headerFace()` 三个**同形空方法**
    并同步补齐 `summary()` 四格 —— 模块缺席时必须与真实现同形，否则「这版没这面」在下游又塌成「这面是空的」。
- 下游同轮接上（v3.1.0）：`projectScene` 增 `tree` / `history` / `header` / `chainFace` 四块与
  `hasTreeFace` / `hasVisitFace` / `hasHeaderFace` 三格（判**格子在不在**，不判内容非空）；
  视图新增「场所层级」「到访史」「本楼场景头」三卡，三面各自分开「上游这版没这面…」与
  「有这面但这个会话是空的」两种相反文案；`registered:false` 的孤儿到访显式标「未登记」。
- 跨仓纪律的判据化：上游 v3221 组 B/G 守「三面均外供 + 退路同形」；下游 v310 组 B/D 守
  「三面分域 + 每面都有真消费点」——任一侧改名或摘掉一格，两侧各有一处会红。
- 本轮当场捐到并修掉的真缺陷（两处，均在下游）：
  ① `apps/place/place-data.js` 取数函数名 `num`，实现 `Number.isFinite(Number(v)) ? Number(v) : null`
     —— `Number(null) === 0` 与 `Number('') === 0` 双踩，「没给」与「给了 0」塌成同一读数
     （同文件注释写的就是「非数值如实 null，不编 0」，实现漏了这一格）。到访史正踩在上面：
     `firstFloor: null`（未跨楼层）被渲染成「第 0 楼」。改名 `numOrNull` 并补三态直返。
  ② 三张新卡的样式**只写进源文件 `apps/place/place.css`，没合并进运行时载体 `phone.css`**
     —— 运行时真正载入的是后者，实机会渲染成无样式裸标记。由 v246-A8「源文件不得多于运行时载体」
     当场捐到（修前 src=43 / phone=35，缺 8 类）。
- 验证：上游 v3221 17/17（先红后绿）；全量 **201/201 文件 / 1789 断言 0 失败、42/42 审计 RC=0**。
  下游 v310 19/19（先红后绿，含 F0 阳性对照 + 3 条镜像破坏负控制）；`npm run check` 九门全绿
  （首跑 8 红，均为抬版触发的既有当版锚与文档一致性守卫，已按仓内交棒口径逐条接管）。
- 边界如实声明：① 上游只把三面**外供**，未改场所图景内部语义（事实 / 覆盖度不动）；
  ② `count` 口径是**去过的不同楼层数**、`depth` 是**真实层级**（不按路径长度推断），
  这是如实外供而非新口径，「按楼层累加的次数」若要另开一格；
  ③ 真实 SillyTavern 宿主实机未验，无头门禁只证明模块间契约。
- 回滚：仅逆转本补丁；门禁失败只回滚不放宽。

## Gate R3-D：场所三面的回滚面收口（**已完成**，lonsha v3.221.0 + RubyPhone v3.2.0）

主题：R3（长线生活与社交生态）第一批次的第二项。R3-A 只把层级树 / 到访史 / 本楼场景头
「写出去」，而三面在 **import / 删楼 / 前移 / 重建** 四条路径上全部脱钩 —— 后果是**读数撒谎**
（`headerAt(7)` 照样答「8月2日 · 暴雨」而那一天已被删掉），比缺读数更糟。

- 归属仓：**lonsha-memory-plugin**（回读与回滚面）+ **ruby-phone**（诊断面，跨仓纪律同轮）。
- 侦察（先证再改，逐条在真模块上实测）：七项真缺陷 ——
  ① `import()` 全路径 `num(x) ?? 0` 把「没给」编成第 0 楼（`Number(null) === 0`），
     `headers` 的 `[null, ...]` / `['', ...]` 键同病；
  ② `setHeader(null)` 返回 `true` 并真写进第 0 楼、`headerAt('')` 读得出第 0 楼；
  ③ 删楼时 `headers` 一格不动，而宿主无条件 `clearPresence?.()` 把在场**整表全清**
     （单楼语义被悄悄扩成全清）；
  ④ 前移时 `headers` / `presence` 不跟，且不认「被删楼自身的残留」——第 8 楼前移成 7 楼后
     与残留撞成两条 7 楼（连做两次得 `track=[3,7,7]`）；
  ⑤ 导入旧格式存档（无 `opsLog`）后第一次单楼编辑把**整棵树清成 0 个节点**；
  ⑥ `coverage()` 不含任何场景头读数 ⇒ 删楼/前移对 `headers` 的处理**没有任何判据面**；
  ⑦ 退路 `SceneBookFallback.coverage()` 与真实现键面不同形（真 15 键 / 退路 13 键）。
- 上游收口（v3.221.0）：
  · 新增 `clearHeader(floor)`（单楼撤场景头，非数值如实 `false`）与
    `shiftFloorRefs(deleted)`（先清被删楼自身在 `track` / `opsLog` 的残留，再**同时**平移
    `track` / `opsLog` / `headers` / `presence` 四面；非有限数如实返回 0）；
  · `rollbackFloorOnly` / `rollbackFrom` 按同一语义撤场景头（单楼 / 级联），
    `setHeader` / `headerAt` / `import` 全路径改走 `numOrNull`；
  · `_rebuild(removedFloor)` 在**无 `opsLog` 真源**时不再清空式重建（如实降级：只摘掉被删那楼的登记）；
  · 场景头上限提为常量 `MAX_HEADERS = 400`（**载入侧此前无上限**）并进导出面；
  · `coverage()` 增 `headerFloors` / `headerCount`；宿主 `index.js` 删掉 `clearPresence?.()` 全清一句，
    `ledger-replay.js` 的 `scene` 登记项 drop 走 `rollbackFloorOnly`、shift 走 `shiftFloorRefs`
    （不再手抄循环 —— 手抄的那份必然漏掉后来新增的面）。
- 下游同轮接上（v3.2.0）：`coverageLines` 增场景头楼层行（第 N 楼逐楼列号，`headerCount` 只当前者缺位时的
  兜底），`projectScene` 增 `hasHeaderFloorsFace`（判**格子在不在**）并把覆盖度键面单列一格，
  诊断卡据此分开「上游这版没有场景头覆盖度」与「这版有面、这个会话还没有场景头」两种相反文案。
- 跨仓纪律的判据化：上游 `tests/v3222` 的 G3 守「退路覆盖度与真实现**逐键**同形」；
  下游 `tests/system-v311` 的 B/D 组守「场景头覆盖度真读进来 + 面缺席不与空同形」。
- 同轮接管的既有判据（**收紧，未放宽**）：`v3181` E2 由「宿主全清是在场清理方式」改为
  两条更强的正/反判据；`scan_v3181` N1 的 scene 面锚点随语义搬家并新增两组接线判据；
  `v39` 对 scene 面由「字面提到字段名」改为**真加载真跑一次 shift** 的行为验证；
  `v3203` todo 指针随抬版前移。
- 验证：上游 `v3222` 25/25（先 19/24 红 → 全绿）；全量 **202/202 文件 / 1814 断言 0 失败、42/42 审计 RC=0**
  （`dead_code_budget` 余量内，无需 `--bump`）。下游 `system-v311` 全绿；`npm run check` 九门全绿。
- 边界如实声明：① 上游只修**回读 / 回滚 / 重建**三条路径，未改场所图景对外语义
  （`count` 仍是「去过的不同楼层数」、`depth` 仍是真实层级、三面键面与 R3-A 一致）；
  ② 重复调用 `shiftFloorRefs` 仍会**再次平移**（平移语义，非 drop 侧幂等契约；`scan_v3190` 明确
  「不断言 shift 幂等」），已登记为观察项 T17；
  ③ 真实 SillyTavern 宿主实机未验，无头门禁只证明模块间契约。
- 回滚：仅逆转本补丁；门禁失败只回滚不放宽。

## Gate R3-E：短期长期记忆在「前移」面上的脱钩（**已完成**，lonsha v3.222.0；下游不抬版）

主题：R3（长线生活与社交生态）第一批次的第三项。删楼那一侧早就有级联清理（`removeByFloors`，
v3.170 还修过它「只摘 span」的谎），而**前移那一侧从来没有** —— `ledger-replay.js` 的登记表里
`stm-ltm` 那一项的 `shift` 写死为 `null`。

- 归属仓：**lonsha-memory-plugin**（回滚路径）。下游按跨仓纪律逐条核对后判定**无需同轮抬版**（见下）。
- 侦察（先证再改，逐条在真模块上实测）：
  ① 删楼 5 生效（`[[3],[5],[8]] → [[3],[],[8]]`，drop 返回 1），紧接着「前移 5」**完全无效** ——
     三处楼层引用前后逐字节相同、`state=no-op / count=0 / 整表 shifted=0`；
  ② 宿主 `SHIFT_FACE_LABELS`（33 个面的逐面诊断标签表）明写 `'stm-ltm': 'shiftFloorsFrom.短期长期记忆位移'`，
     与登记表的 `shift: null` **互相矛盾**（读者会各信一份）；
  ③ 三处既有判据把这个例外**白名单化**（`scan_v3190` 的 `if (o.id !== 'stm-ltm')`、`v3190` 的同款 filter、
     `v3182` 拿它当「声明为 null」的样本），而豁免理由「按楼层集合整体摘除，无单点位移语义」**不成立**：
     `unconsolidated_stm[].floor` 就是单点楼层号；
  ④ 后果是**持久化读数错位**：`floors` / `span` 落在 `chatMetadata.extensions.LonShaMemory.stmLtm`，
     楼层错位既不报错也不留痕（`recallView` 只被测试消费、`selfReport` 只聚合 loss 计数）。
- 上游收口（v3.222.0）：
  · 新增 `stm-ltm.shiftFloorRefs(state, deleted)`：三类引用（`unconsolidated_stm[].floor` 单点 /
    `stm_entries[].floors` 集合 / `ltm_entries[].span` 区间）同跟一个判据（`f > deleted` 时减一），
    累计处数并**返回计数**；只改**元素内部字段**、与传入 state 共享元素引用（改动当场生效、无需回写）。
  · **判开「没给」与「给了 0」**（同族于 v3.221.0 的 `numOrNull`）：只认数字与非空数字字符串，
    其余一律「没给」⇒ 如实 0 且一格不动。此条由本版新套件**当场抓出**修前真缺陷：
    `Number(deleted)` 把「没给」读成**第 0 楼**（`Number(null) === 0`），整表减一遍还报出一个正数。
  · 登记表 `stm-ltm` 的 `shift` 改为真调用模块入口（**只取计数、不回写**；旧模块如实 0）。
  · **刻意不落 loss 计数**（位移不是有损动作；记进去会让 `selfReport` 长期假报警），
    且**不改** `ltm_entries` 的 `gaps` / `kept` 口径（整体平移不改变区间疏密结构）。
- 同轮接管的既有判据（**收紧，未放宽**）：`scan_v3190` 撤白名单（任一 `shift === null` 即缺陷）、
  `v3190` 断言收紧为「无例外」、`v3182` 【C3】改用**显式构造**的 `x-noop` 面守「no-op 与 absent 不同形」
  并新增两条正向断言（`stm-ltm` 真参与前移 / 覆盖度如实报 `shifts: true`）。
- 下游判定（**不抬版**，同 R3-D 之前口径）：本轮改的是两模块**内部**，`summary()` 与快照外供键面未见变化；
  下游全仓 `grep -rn 'ledger-replay|replayShift|stmLtm|短期长期'` **零命中**；下游 `coverage()` 消费的是
  `LonShaFloorLedger.coverage(chat, opts)`（`floor-ledger.js`），与 `ledger-replay.js` 的
  `coverage(host, registry)` **不是同一面**。风险面（外供位移读数）在 R3-A/R3-D 两轮已各自对账过。
- 验证：上游新增 `tests/v3223_stm_ltm_shift_refs.test.mjs` 34 项（首跑 29/34：E1 真缺陷 + G2 抬版前预期红
  + N5/N6/N7 负控制自身写法误，修后 34/34）；全量 **203 文件 / 1848 断言 0 失败、42/42 审计 RC=0**
  （`dead_code_budget` 实测 37093 行 / 上界 37147 / 余量 54，上限 maxSlack=400 ⇒ 无需 `--bump`）。
- 边界如实声明：① 只补**前移**这一半，不改 LTM 区间疏密口径；② 重复调用 `shiftFloorRefs(d)` 仍会**再次平移**
  （平移语义，非 drop 侧幂等契约；观察项 T17，与本版新增的 `stm-ltm.shiftFloorRefs` 同名不同模块）；
  ③ 真实 SillyTavern 宿主实机未验，无头门禁只证明模块间契约。
- 回滚：仅逆转本补丁；门禁失败只回滚不放宽。

## Gate O-1：场所面「没给」与「给了 0」的真判开（**已完成**，lonsha v3.223.0；下游不抬版）

主题：**优化方向**第一批次的第一项。R3-D（v3.221.0）在 CHANGELOG 里声称
「`import()` 七格 + `headers` 键统一改走 `numOrNull`，把「没给」与「给了 0」判开」——
`headers` 键那一半是真的（`null` / `''` 键被跳过），而 `import()` 七格那一半**是改名**。

- 修前实测（真模块探针，十格全为 **0**）：
  · `nodes.floor` / `nodes.updatedAt` / `track[].floor` / `opsLog[].floor` /
    `visits.firstFloor` / `visits.lastFloor` / `presence.atFloor`（import 侧）；
  · `apply(ops, null)` / `setLocation(null, p)` / `setLocation('', p)` /
    `setPresence(n, p, null)` / `setPresence(n, p)`（写侧）。
  为什么是「改名不是修复」：`numOrNull(null) === null` ⇒ `null ?? 0 === 0`；
  而修前的 `num(null) === 0`（`Number(null) === 0` 且有限）⇒ `0 ?? 0 === 0`。**两条路径同值**。
  写侧三处更直接：`Number.isFinite(Number(floor)) ? Number(floor) : 0`，`Number(null) === 0`。
- **判据在保护缺陷**（本轮最值得记的一条）：`tests/v3222` 的 A1 组测试名写着
  「八格「没给」**不得落成第 0 楼**」，六条断言却把 `0` 钉死（附带说明「apply 侧的既有口径，未动」）。
  即：判据不但没抓到缺陷，还**承诺它必须继续存在**。判据撒谎比实现撒谎更难发现 ——
  它会让后来所有人（包括本轮的作者）以为这一面已经治过了。
- 上游收口（v3.223.0）：
  · import 七格：「没给」如实 `null`（与 `numOrNull` / `setHeader` / `headerAt` / `clearHeader` 同口径）；
  · 写侧三处：`apply` / `setLocation` / `setPresence` 楼层取不到一律拒绝
    （`apply` 返回 0、两个 setter 返回 `false`），**签名与返回语义未变**；
  · 正例必须照常：`apply(..., 0)` / `setLocation(0, ...)` / `setPresence(..., 0)` 与显式 `floor: 0` 一律保住 0。
- **第二批（首稿只改调用点，门本体没动 —— 这是同族缺陷反复回流的直接原因）**：
  · `numOrNull` 本体由 `Number.isFinite(Number(v))` 改为**先看类型**（只认数字与非空数字字符串），
    与仓内已立先例同口径：`stm-ltm.js` R3-E（v3.222.0）、`evidence-workbench.js` `finiteNumStrict`
    （v3.214.0，注释里就写着 `Number([]) === 0`）；`num` 别名同口径合一。
    修前实测：`[] → 0`、`true → 1`、`'  ' → 0`、`false → 0`（十格探针只测了 `null` / `''`，
    漏了这几个经 `Number()` 同样出数的「怪值」——首跑的新套件当场抓出）。
  · **回滚面三处**（最贵）：`rollbackFrom(null)` 实测被读成「删第 0 楼及以上」，
    把 `opsLog` / `track` / `headers` **一次清空**且返回正数；`rollbackFloorOnly(null)` 误删合法第 0 楼；
    `shiftFloorRefs(null)` 整表楼层号减一。现在「没给」一律拒绝且一格不动，真给 0 照常动手。
  · **列号面**：`coverage().floors` / `trackFloors` 修前走 `Number(o.floor)` —— 刚导入或刚回滚完的账本
    会凭空多出一列第 0 楼；`headerFloors` 与 `setPresence` 裁剪序同族。
  · **外供面**：`tree()[].floor` / `summary().currentChain[].floor` 修前会把「没给」读成 0 吐给下游。
  · **`visits[].floors`**：R3-D 只改了 `count` 那格，`floors` 漏了（`[] → 0`、`true → 1`，
    凭空造出第 1 楼比塌成 0 更难发现）。
- 同轮接管的既有判据（**收紧，未放宽**）：`v3222` A1 由「六格钉死 0」改为「七格如实 `null`」
  + 新增**正例半组**；同文件新增 **A2b** 覆盖写侧三处（此前写侧**没有任何判据面**）。
- **新增 `tests/v3224_floor_null_vs_zero.test.mjs`（32 条，承接本版 frontier）**：七面各配
  「正向 + 反向（真 0 必须保住）」+ 15 组负控制。其中 **N11 是整套件的地基**：把 `numOrNull` 本体
  退化成 `Number()` 门，怪值面 / `floors` / 列号 / 外供四面判据必须**集体转红**，常规面与真 0 面
  必须**仍成立** —— 不成立即说明「判据根本没挂在门上」（假绿三形之①），其余绿色不足采信。
- **同轮抓到并修掉的判据自身缺陷**（比实现缺陷更值得记）：
  ① `v3224` 首稿 N4 用 `readJudgeFails()` 去证 `visits` 面 —— 那条判据只查 `nodes` / `track` / `presence`，
  **不含 `visits`** ⇒ visits 坏了它照样成立，该组等于没测；已另立 `visitJudgeFails()` 并补「互不掩护」断言。
  ② `v3181` 与审计 `scan_v3181_..._negctl.mjs` 的破坏锚点用旧源码字面，收口后直接报
  「锚点须恰中 1 次（实 0）」—— 两处都**报错而非静默跳过**（它们若静默，本轮负控制会全体失效而无人知晓），
  故须把锚点搬到新字面（`v3181` 的 F1/F2/F4/I3-1/I3-2/I4-3、`negctl` 的 W1/W2/W4）。
- **连带登记/预算**：新套件登记进 `tests/audit/catalog_reference_consumers.tsv`（缺登记 ⇒ 跨仓守卫 P3 报
  「覆盖率缺口可静默」）；`dead_code_budget` 按仓内规则 `--bump` 到实测 + `maxSlack`
  （首稿只留 9 行余量，下一批任何增加即越界）。
- 下游判定（**不抬版**）：本轮未新增外供键，但既有键的取值域由「总是 number」变成 `number | null`。
  按跨仓纪律这属于「上游给了新东西就必须有人读」，而下游**已经在读**：
  `apps/place/place-data.js` 的 `presenceGroups` 用 `numOrNull(rec.atFloor)`、
  `visitRows` 用 `numOrNull(v.firstFloor|v.lastFloor)`，视图侧
  `(g.atFloor === null || undefined) ? '' : '第' + g.atFloor + '楼'` —— **null 与 0 在下游本就分开渲染**。
  故下游**无需改代码**，只需在计划文件登记这条判定依据（本轮已登记）。
- 验证：定向 `v3181` / `v3221` / `v3222` / `v3223` / `v3224` **144/144**
  （改动前 `v3222` A1 红、`v3224` 首跑 5 红，分别收紧与收口后转绿）；
  全量 **204/204 文件、1881 断言 0 失败、42/42 审计 RC=0**；
  版本守卫「当版 frontier 1 / 当版锚点 1 / 问题 0」；`dead_code_budget` 实测 37138 / 上界 37538 / 余量 400。
- 边界如实声明：① 只改楼层取值口径，不改场所面结构 / 键面 / 对外语义；
  ② `presence.at` 与 `headers[].at` 仍是时间戳（缺给 0），**不参与**楼层判读，故本版不动
  （避免把「时间未知」变成下游要新处理的一态）；
  ③ `coverage()` 列号面**本版改了实现**：首稿写「`Number.isFinite` 过滤会自动排除 `null`」——
  **实测不成立**，`Number(null) === 0` 且有限，第 0 楼照样列得出来；已改为同口径 `numOrNull`，
  且**真给了 0 仍列得出 0**（有正例判据，免得把「读数变准」做成「读数变少」）；
  ④ 真实 SillyTavern 宿主实机未验；
  ⑤ **未动**（避免读者以为全收干净）：`presence.at` / `headers[].at` 时间戳（缺给 0）；
  `rollbackFrom` 的 `cutoff` 传 `null` 时按 `floor` 处理；`index.js` 宿主侧各子系统自己的
  `removeByFloor(floor)` 系列（`charMem` / `diary` / `cards` / `status` / …）仍是各自的 `Number()` 门
  —— 它们由宿主在 `message.index`（永远是真数字）处调用，是宿主面另一族、需各自的行为判据，不在 O-1 范围内。
- 回滚：仅逆转本补丁；门禁失败只回滚不放宽。

## Gate O-2：回放/前移层的取值门收口（**已完成**，lonsha v3.224.0；下游不抬版）

主题：**优化方向**第二批次（同族普查）。O-1（v3.223.0）在**场所面**（`scene-book.js`）修掉的那条形态，
在**回放/前移层**是**第二次发病**，而且这次发生在 R3-E（v3.222.0）**新写的代码**里 ——
`const d0 = Number(d); if (!Number.isFinite(d0)) return 0;` 是一处**半收口**：
只挡 `undefined` / `NaN`，对 `` / `'  '` / `[]` / `true` 一律放行（`Number(null) === Number('') === Number([]) === 0`、
`Number(true) === 1`），而 **0 在本仓是合法楼层**（宿主 `message.index` 是 0 基）。
半收口比没收口更难发现：读者会以为这里有门。

- 修前实测（真模块探针）：`replayShift(host, null)` ⇒ `summary.volumes` 的 1..9 整段减到 0..8、
  归档集合 `[0,1,2,5]` → `[0,1,4]`、`_timelineInjectFloor` 5 → 4、`_diaryInjectFloor` 7 → 6
  —— **整树前移一格**，而且**返回 9**（读数反过来为缺陷作证：「看着像搬了 9 条」）。
  宿主侧 `MESSAGE_DELETED` 写着 `const floor = Number(messageId); if (!Number.isFinite(floor)) return;`，同款。
- 上游收口（v3.224.0）：
  · `ledger-replay.js` 新增**唯一取值门** `floorOrNull(v)`：只认数字（并 `isFinite`）与非空数字字符串
    （`trim` 后 `Number`），其余一律 `null` —— 与 `scene-book.js` 的 `numOrNull`（v3.223.0）、
    `stm-ltm.js` 的 `shiftFloorRefs`（v3.222.0）、`evidence-workbench.js` 的 `finiteNumStrict`（v3.214.0）同口径；
  · `replaySide` 入口：「没给」⇒ 返回 `{ floor: null, items: [], skipped: 'floor-not-given' }`，
    **一格子都不动**，且与真回放（`skipped: null` + 逐账明细）**不同形**；
  · 交给 owner 的是**门后的值**，不是原参数 —— 本路径上「门只有一道、位置固定」；
  · 同族六面一并收干净：`ledgerOwner` 工厂的 drop/shift、`shiftLedgerItemFloors` 本体、
    `floor-ledger` / `archived` / `inject-cursor` 的 drop+shift 入参；
  · 宿主侧三处入口门：`numOr` 补 `typeof v === 'object'`（防 `Number([]) === 0`）、
    `rollbackFloor` / `shiftFloorsFrom` / `MESSAGE_DELETED`。
- **正例必须照常**（否则就是把门关成「谁都不许搬」）：真给 `0` / `'0'` / `5` / `'5'` / `' 5 '` / `3.5`
  一律照常回放，且**第 0 楼自身保留为 0**（归档集合 `f === d0` 那一支）。
- **同轮抓到并修掉的判据自身缺陷**（比实现缺陷更值得记）：
  · **首稿的修复引入了新缺陷**：主循环里 `let target = null; target = owner.get(host);` **遮蔽**了
    函数顶层的 `const target = floorOrNull(floor)`，于是交给 owner 的是**宿主状态对象**而非楼层，
    每个 owner 再走一次门都得到 `null`、均匀 `return 0` —— 形态是「**门开过头**」：
    B 组（「没给」）全绿、**真回放全废**。新增的 C/D/N5 组当场抓住它（只验「不许动」的判据对任何过严的门都绿）。
  · **判据挂错路径**（首稿 N3 假红）：内层门退化后从 `replayShift` **观测不到**差异 ——
    入口门先一步拦成 `skipped`。实测确认内层门挡的是**另一条真实路径**（`FLOOR_OWNERS` 是**导出面**，
    `owner.shift(host, v)` 可直接调用），故新增常驻判据 J5 `ownerJudge` 改打该路径，
    并在组内如实写下「回放路径上这处破坏不可观测」。
  · **注释说得比实现更满**：首稿写「这样『门』只有一道」，而导出面上 owner 各有自己的门 ——
    已改为「**回放这条路径上**门只有一道」。
  · **撤回两处越界主张**：首稿曾主张 `archived` / `inject-cursor` / `floor-ledger` 不该参与前移
    （被 `tests/v3190` 第 8/9 条当场判死：既有判据明写「其后前移，其前保留」「前移跟随」），
    并曾把 `LEDGER_REPLAY_VERSION` 由 1 抬到 2（纯增量面，抬它是 v3.203.0 拆掉的抬版仪式）—— 均已撤回。
    **既有测试的意图优先于本轮作者的推演**。
- 同轮接管的既有判据：无收紧、无放宽（本版只改取值口径与入口门，不改「谁参与回放」）。
- 新增测试：`tests/v3225_replay_floor_gate.test.mjs`（20 条，承接 frontier；A 门本体 / B 回放入参 /
  C 反坐实 / D 两条时间线互不串 / E 宿主三处入口门 / F 既有面不许回退 / G 版本锚 / N0–N5 六条真源码负控制，
  含镜像树「门本体退化」「半收口形态复现」「面内门」「宿主数组门」「互不掩护」）。
- 验证：定向 20/20；全量 **205 文件 / 1901 断言 0 失败、42/42 审计 RC=0**、版本守卫 0 问题；
  `dead_code_budget` 实测 37235 / 上界 37538 / 余量 303（无需 `--bump`）；
  新增测试已登记进 `tests/audit/catalog_reference_consumers.tsv`（跨仓守卫由「问题 1」转为 0）。
- 观察项（非缺陷、如实记账）：`v3225` 的 N 组用**整仓镜像**基建（仓内 v2.99.0 起的统一口径，
  故意不缩范围 —— 缩了就不再证明「只缺这一个文件」），在 7 路并发门禁下与 `v3206` 一样
  偶尔落进 T7 的「环境资源耗尽」指纹（`cpSync` / `lstatSync` 家族，非判据失败），
  按 runner 既有口径**明示重试 1 次后转绿**（打印在汇总里，未被静默吞掉）。
  这是沙箱并发下的环境现象，不是本版引入的判据抖动。
- **下游判定**：本轮上游新增外供面只有 `skipped` 字段（纯增量），下游 `ruby-phone` 无消费点
  ⇒ 按跨仓纪律逐条判定后**不抬版**、不改代码。
- 边界：面内门保留「返回 null ⇒ 调用点收敛为 0」的静默风格（与 `scene-book.js` 先例一致），
  **未**改成抛异常（不拿实现给判据让路）；时间戳面不在本版范围；真实 SillyTavern 宿主实机未验。
- 回滚：仅逆转本补丁；门禁失败只回滚不放宽。

## Gate O-3：判据灵敏度体检 —— 审计的审计（**已完成**，lonsha v3.225.0）

主题：**优化方向**第三项。本仓审计目录 29 个扫描器负责「判缺陷」，而「扫描器自己还有没有判的能力」
只在测试侧散点验过：`tests/v3159` 的 [2b] 覆盖 3 个扫描器；`tests/v3177` 的 C7 是测试里的一条断言
（默认根上 `index.js` 要出现在清单里）。**判据在测试里，不在门上。**

- 体检形态（可复现，逐字写进登记表表头）：
  · **H 正常树**（镜像零改动）—— 必须 exit 0；
  · **G 根目录 .js 全部删除**（入口不在场）；
  · **T tests/ 下（除 audit/ 与 `_audit_lib.mjs`）所有 .mjs 掏空**（被扫描的测试面退化）。
- **夹具教训（先记这个）**：首版拿「真仓里的扫描器 + cwd=退化树」当夹具 —— 所有按 `import.meta.url`
  推根的扫描器跑的还是真仓，量到的是真仓通过。改为**整仓镜像 + 从镜像执行**后矩阵才可信。
- 实测：**H 列 29/29 全为 0**（无一误红）；**G、T 两档皆 0 的 0 个**（无恒绿探测器）。
- **修前实测到的真缺陷（1 处，已修）**：`tests/audit/scan_syntax.mjs` 在根 .js 全删/全掏空后仍
  **exit 0**，报「270（掏空时 335）个文件均可解析」。0 个源文件的世界里那句话为真，
  但与本门存在的唯一理由无关（文件头：`index.js` 坏掉时回归全绿而插件根本不加载）。
  旧代码只有 `if (total === 0) exit(2)` 一道，而掏空根 .js 后 tests/ 树里仍有 200+ 个 .mjs，那道兜不住。
  修法：默认根补「入口在场 + 非退化」守卫（exit 2）；显式 `--root` 的语义逐字不动
  （`v3177` 的 C4/C5/C6 依赖它 —— 同一门两种用法，守卫只能加在其中一种上）。
- 常驻判据：新增 `tests/v3226_audit_sensitivity.test.mjs`（14 项）—— 表结构 + 双向齐全
  （新增扫描器不登记 ⇒ 红；退位项不摘 ⇒ 红）+ H 列全 0 + 无恒绿探测器 + D 组把新守卫**行为化**
  （最小镜像：入口删/掏空 ⇒ 2、健康小树 ⇒ 0、损坏小树 ⇒ 1、不存在 ⇒ 2、真仓 ⇒ 0）
  + N 组三条真表破坏负控制。
- 边界如实声明：① 三档只覆盖「输入面不在场」这一维，「输入在场但内容被换掉」属各扫描器自己的
  负控制面（13 个已有）；② H/G/T 是**登记基线**不是「永远正确」—— 判据读表的三条性质，读数由体检脚本重跑产生；
  ③ 8 个无负控制驱动的扫描器本版**不动**（已由 H/G/T 与 v3159/v3177 兜底），「为每个扫描器各写一份负控制」是另一件事；
  ④ 真实 SillyTavern 宿主实机未验。

## Gate O-4：门禁隔离与耗时（**已完成**，lonsha v3.226.0）

主题：**优化方向**第四项。**先量再决定改不改** —— 三条实测读数：

- 全量 `npm test`：wall 37.6s / 子进程 CPU 149.2s ⇒ **并行度 3.96x**（7 路测试 + 4 路审计）/ maxrss 262 MB；
  tests 段 34.3s、audit 段 19.3s。audit 段最慢 8 项**全是 negctl 族**（负控制，10.5s / 4.8s / 4.4s …）——
  那是「证明力」的成本，不砍。
- **镜像瘦身是伪优化**：整仓镜像排除 `.bak` 只省 0.2s（0.76 → 0.56s）、体积 9.00 → 6.33 MB ⇒ **不做**。
- 隔离：跑批前后仓快照（文件集合 + size + mtime）+ git status 对照，0 差异 ⇒ 隔离本身成立。

**实测抓到的真竞态**（修前长期被归为「环境资源问题」，v3.205.0 的 T7 定性为沙箱 I/O 抖动）：

- 「整仓镜像」测试（`v3206` / `v3225` / `v3159` / `v3203` / `v3204`）用 `cpSync` 递归复制整仓；
- 而 `v3215` / `v3221` / `v3222` / `v3223` / `v3224` 把临时产物落在**仓根**
  （`.tmp_v3221_n1_xxx` 目录、`.tmp_v3215_*.js` 文件）；
- 7 路并发下互撞：镜像方正遍历那个目录，对方 `rmSync` 掉了它 ⇒ `ENOENT … lstat '…/.tmp_v3224_n12_xxx'`。
  单独跑 `v3225` 即可复现（本轮第一次现场）。
- 修法：5 文件 6 处临时产物一律改落 `os.tmpdir()`；`v3215` 另加「require 前删 cache key」加固。
  修后并发复跑（受害者 + 加害者同批）**143/143 全绿**。

**本版交付**：基线 `tests/audit/gate_timing_baseline.json`（`full` / `subsets` / `isolation` / **`not_done`**）；
常驻判据 `tests/v3227_gate_isolation_and_timing.test.mjs`（10 项）—— 基线结构 + 「未做之事可读」+
**B 仓根禁写**（扫 `tests/` 与 `tests/audit/` 全量 `.mjs`，实扫 ≥ 200）+ **C1 隔离零漂移** +
C2 两组子集墙钟上界 + D 版本锚 + N 三条负控制。

**同轮捐到三处判据自身缺陷**：① 判据与负控制各抄一份模式 ⇒ 立刻漂移（B1 那份漏检拼接写法，
N1 当场转红；改为共用 `ROOT_MKDTEMP` / `ROOT_TMPWRITE` 两个常量，**负控制引用判据自己的模式**）；
② 自扫（B1 的扫描面含它自己，探针文本被当违规；改为跳过自身 + 补 `scanned >= 200` 防空跑断言）；
③ 给未来版本预写锚点（D1 首稿锚 3.226.0 而仓在 3.225.0，版本守卫 V3 报「不得承诺未来」）。

- 边界如实声明：① 上界刻意宽（约实测 3 倍 + 15s）——目标是拦一个数量级倒退，不赌 CI 瞬时抖动；
  ② 隔离子集只覆盖 2 个含镜像/写入通道的测试，**全量级隔离未自动化**；③ 段间并行与镜像瘦身明确不做；
  ④ 真实 SillyTavern 宿主实机未验。

## Gate O-6：死代码方法级扫描（**已完成**，lonsha v3.227.0）

主题：**优化方向**第六项。旧读数「A7 定义但检索不到调用点 (93)」经逐条复核，**绝大多数是扫描器自己的盲区**：

1. 不认**可选调用** `this.getNpcTiesPrompt?.()`（可选链在**名字之后**，旧口径只认 `name(`）；
2. 不认**引号里的名字** `'getPublicData'`（公共出口由桥按名调用）；
3. **扫描面只有 `index.js`** —— `fetchModels` / `unlockFact` 的调用点在 **`settings-ui.js`**
   （同目录另一模块），**活代码被报成零引用**。判据的面漏一个文件，结论就完全反了。

一处**确实存在**的读数错位：`breakPromise` 在旧表里**缺失**（它其实零引用）—— 93 条里真有 1 条，
却被前两类误报挤满而无法辨认。

**本版交付**：
- A7 重写为分域台账：`call` / `opt`（可选链）/ `prop`（键名）/ `q`（引号名）/ `test`（仅测试）/ `zero`；
  输出 `A7.1 零引用` 与 `A7.2 仅测试引用`；
- 扫描面扩到**全部根级 `.js` 模块**；
- **冻结基线** `tests/audit/scan_wiring_dead_methods.tsv`（4 条 + 分类理由）；新增零引用 ⇒ exit 1，
  基线长霉（名字不再零引用）⇒ 也报，基线缺失 ⇒ exit 2；
- 修后读数：**方法 434 / 有真引用 397 / 仅测试 33 / 零引用 4**：
  `_legacyHybridMerge`（已知遗留·待决策，删它需连 `hybridAlpha` 配置键一起处置）/ `breakPromise`（真死·承诺账本，
  产品路径走 `resolvePromise`）/ `callGeneric`（真死·旧生成路径 `/api/v1/generate`）/ `queryByFloor`（真死·退役测试，
  唯一消费者在 `tests/archived/`）；
- 新增 `tests/v3228_dead_methods_ledger.test.mjs`（9 项）。

**同轮捐到三处判据自身缺陷**：① 可选链写反（`opt` 形态写成名字前置 ⇒ 真写法全漏）；
② 探针把「定义」当「调用」（N1 直接拿整份 `index.js` 判 `fetchModels` ⇒ 定义行自己命中 ⇒ 探针自证为真，N1 转红；
修法：探针先排除定义行）；③ 正则转义层数写错（经补丁脚本落盘时反斜杠失真，扫描器当场 `SyntaxError`；
改为字符类常量 `WORD` / `QCH` 拼接）。

- 边界如实声明：① 口径是**文本形态**判定（不解析 AST，不追 `obj[name]()` 一类动态拼名调用），
  故 `zero` 只表示「文本面找不到任何引用形态」，不自动判「可否删」（`_legacyHybridMerge` 仍靠人工分类）；
  ② 扫描面覆盖**根目录** `.js`；③ 真实 SillyTavern 宿主实机未验。

## Gate O-5：性能取证（**已完成**，lonsha v3.228.0）

主题：**优化方向**第五项。口径先说清：读数是**合成数据 + 真模块** —— 无浏览器、无 SillyTavern 宿主、
无真实 1000 楼聊天记录，故**不代表实机性能**，只用于量级漂移回归。

- 实测（v3.228.0）：场景书 apply ×1000 楼（建树，夹具基线）51.55 ms / 场景书 `summary()`（1000 楼含树）1.53 ms /
  `replayShift` 1000 楼 0.34 ms / `replayDrop` 1000 楼 1.06 ms / `coverage(host)` 1000 楼 0.11 ms /
  `replayShift` 200 楼 0.04 ms / `coverage()` 200 楼 0.04 ms。
- 缩放：`replayShift` 0.04ms（200 楼）→ 0.34ms（1000 楼），5 倍楼层约 8.5 倍耗时（含一次性建账成本）——
  **未观察到超线性（无 O(n²) 迹象）**。
- **同轮修掉探针自身一处口径错误**：首稿把 `mkHost(1000)`（≈51.55ms 建树）算进被测调用，
  报出 `replayShift 98.6ms`；改为 setup 不计时后是 0.34ms —— **两次读数差 290 倍**。
  已立成结构判据（计时区间内不得出现 `mkHost(` / `buildScene(`）。
- 交付：`tests/audit/perf_probe.cjs`（可复跑探针，输出自带 `synth: true`）+ `tests/audit/perf_baseline.json`
  （四件：读数 / 缩放 / 口径修正 / 没做什么）+ `tests/v3229_perf_evidence.test.mjs`（9 项）。
- 边界如实声明：① 不覆盖**向量检索 / LLM 调用 / 注入预算裁剪**等 I/O 与网络路径；
  ② 本版**只取证与立基线，不做优化**（任何优化都要先有可比基线）；③ 判据只拦量级漂移（5 倍容差）；
  ④ 真实 SillyTavern 宿主实机未验。

## P 批（优化方向 · 第二批）：P-1 ~ P-6（**已开批**）

主题：O 批管「判据与门禁本身的健康」，**P 批管代码资产与运行资产的健康**。
分四个版本做完（V1 ~ V4，每版两仓各出提交）；条目定义见 `TODO.md` 与各版本 CHANGELOG。

### Gate P-1：死方法处置（**已完成**，lonsha v3.229.0）
- Structural: Local Fix；Execution: Local Fix Only；授权：approved local fix（自主迭代授权内）。
- 主题：O-6（v3.227.0）把「定义在 `index.js` 里却没人调」的方法从 93 条误报降为 **4 条冻结台账**；
  本 Gate 把 4 条**逐条实测后处置**。台账从「冻结」升级为「处置台账」。
- 收口：`_legacyHybridMerge`（遗留融合，自 v3.50 无调用者）/ `breakPromise`（承诺账本旧入口）/
  `callGeneric`（旧 `/api/v1/generate` 路径）/ `queryByFloor`（退役测试专属）四处定义删除（53 行）；
  3 处历史注释改述；`tests/audit/scan_wiring_dead_methods.tsv` 转为处置台账；
  新增 `tests/v3230_dead_method_disposal.test.mjs`（9 项，含两条整仓镜像负控制）。
- **反坐实**：O-6 台账原记「删 `_legacyHybridMerge` 需连配置键一起处置」——实测**不成立**
  （`hybridAlpha` 的活消费点是 `hybridMerge()`，与遗留方法无绑定关系）；删除后 `scan_config_liveness` 仍绿。
- 同轮修掉三处**判据自身**缺陷：① `v3156 [4f]` 把「两条读 α 路径并存」当不变量（判据在保护已被淘汰的状态）；
  ② `v3228 B1/B2/N3` 在空集合上退化成「空对空 / 空跑」；③ **`v3230 N1` 首版负控制假绿** ——
  探针方法名字面量被 A7 的 `tests/` 扫描面当成「测试引用」，破坏没被观测到，改为运行时拼接。
- 验证：定向 9/9；全量 209 文件 / 1932 断言 0 失败、42/42 审计 RC=0；A7 零引用 **4 → 0**。
- 边界：文本形态口径（不解析 AST、不追动态拼名）；删除不可回滚（保留面由 v3230 A2 钉住）；
  宿主实机未验。

### Gate P-3：快照外供面瘦身评估（**已完成（取证）**，lonsha v3.230.0）
- Structural: Local Fix；Execution: Local Fix Only；授权：approved local fix（自主迭代授权内）。
- 主题：**先量再定**。`buildBridgeSnapshot()` 是全仓唯一对外读数出口，此前**零规模读数**；
  而它被下游 12 个 App 直接消费，任何改动都动跨仓契约 ⇒ 顺序只能是「先量 → 再定形态」。
- 实测：空宿主 117 B / 0.005 ms；400 角色 35 917 B / 1.253 ms；1600 角色 124 597 B / 5.158 ms；
  800 生活详情 55 947 B / 0.955 ms；800 场景行 53 698 B / 1.169 ms。三条曲线**近似线性**。
  **逐面账：`characters` 占 80.6%**；恒定承载面（含 meta 三态自述）合计 3.3%。
  **成本拆解：深克隆段 65%、自述段 24%**，成本与字节成正比、**与面数无关**。
- **结论（按读数否掉一个候选）**：「砍面数」换不到收益 —— ① 13 面在手机端各有直接读者（无一面零消费）；
  ② 快照是出口不是缓存，去掉「每次重建」＝用陈旧读数换速度；③ 恒定承载面只占 3.3%。
  唯一有读数支持的轴是「**每面预算 + 如实截断读数**」，**本版只取证不动手**。
- 落地：`tests/audit/snapshot_probe.cjs` + `tests/audit/snapshot_baseline.json`（读数 / 形状 /
  逐面账 / 成本拆解 / 结论 / 口径修正 / 没做什么）+ `tests/v3231_snapshot_scale_evidence.test.mjs`（12 项，
  含三条负控制：砍 characters 必须让「最大面」判据转红 / 缩放单调性破坏必须转红 / 抽掉读数据点必须转红）。
- 边界：① **未做任何瘦身、未改契约**；② 未验实机；③ 未覆盖下游消费成本；④ 未覆盖严格 JSON 出口的总成本。

### Gate P-4：存储层 schema 版本戳（下游 ruby-phone，V1 同轮）
- 见下游 `FOUR_RELEASE_PLAN.md` 的 Gate P-4 节。

## 状态检查点
- **P-3：已完成（取证）**（lonsha v3.230.0）—— 快照规模基线：空 117 B / 400 角色 35 917 B·1.253 ms /
  1600 角色 124 597 B·5.158 ms（线性）；**characters 占 80.6%**；成本 65% 在深克隆段且**与面数无关**；
  「砍面数」按读数**否掉**；唯一有读数支持的轴（每面预算 + 如实截断）留待后续版本，本版只取证；
  v3231（12 项，含三条负控制）。
- **P-1：已完成**（lonsha v3.229.0）—— 死方法处置：O-6 台账 4 条逐条实测后删除定义，台账转为处置台账；
  反坐实「与配置键无绑定关系」；同轮修掉三处判据自身缺陷（含负控制因自扫变假绿）；A7 零引用 4 → 0。
- **O-5：已完成**（lonsha v3.228.0）—— 性能取证：合成探针六条热路径（1000 楼 replayShift 0.34ms /
  replayDrop 1.06ms / coverage 0.11ms / summary 1.53ms），缩放未观察超线性；
  同轮修掉探针把 51.55ms 夹具算进被测调用的口径错误（两次读数差 290 倍）。
- **O-6：已完成**（lonsha v3.227.0）—— 死代码方法级扫描：旧 A7 的 93 条经复核多为扫描器盲区
  （可选调用 / 引号名 / 扫描面缺 `settings-ui.js`）；重写为分域台账 + 冻结基线，修后 4 条零引用带分类理由。
- **O-4：已完成**（lonsha v3.226.0）—— 门禁隔离与耗时：量出并行度 3.96x（tests 34.3s / audit 19.3s），
  镜像瘦身与段间并行**明确不做**（附实测理由）；实测抓到并修掉一条真竞态（5 个测试把临时产物落仓根，
  与整仓镜像类测试的 cpSync 互撞 ⇒ ENOENT 假红，长期被归为环境问题）；
  基线 `tests/audit/gate_timing_baseline.json` + 常驻判据 `tests/v3227`（10 项）。
- **O-3：已完成**（lonsha v3.225.0）—— 判据灵敏度体检（审计的审计）：三档退化矩阵覆盖 29 个扫描器，
  H 列全 0 / 无恒绿探测器；修掉语法门的入口在场性缺失（根 .js 全删仍报「均可解析」）；
  登记表 `tests/audit/audit_scan_probe_matrix.tsv` + 常驻判据 `tests/v3226`（14 项）。
- **O-2：已完成**（lonsha v3.224.0；下游不抬版）；回放/前移层的「没给」与「给了 0」真判开：
  `ledger-replay.js` 新增唯一取值门 `floorOrNull` + 入口「没给 ⇒ skipped 且整树一格不动」+ 同族六面收干净
  + 宿主三处入口门；**首稿修复自身引入的变量遮蔽缺陷被新增的反坐实组抓住**（形态是「门开过头」）；
  撤回两处越界主张（三个面不该参与前移 / 抬 `LEDGER_REPLAY_VERSION`）—— 既有判据 v3190 第 8/9 条优先于推演。
  验证：定向 20/20；全量 205 文件 / 1901 断言 0 失败、42/42 审计 RC=0、版本守卫 0 问题；预算余量 303。
  边界：不改「谁参与回放」语义；面内门保留静默 0 风格；实机未验。
- **O-1：已完成**（lonsha v3.223.0；下游不抬版）；场所面全路径真判开「没给」与「给了 0」：
  **门本体**（`numOrNull` / `num` 改「先看类型」）+ import 七格如实 `null` + 写侧三处「取不到即拒绝」
  + **同族残留六面**（列号 / 外供 tree+currentChain / 回滚三法 / `visits.floors`）一并收干净；
  同轮收紧 `v3222` A1（**它此前钉住的正是缺陷**）并新增 A2b 覆盖写侧；
  新增 `v3224`（32 条，承接 frontier，含「门本体退化 ⇒ 四面集体转红」的地基型负控制）。
  验证：五套件 144/144；全量 204 文件 / 1881 断言 0 失败、42/42 审计 RC=0；版本守卫 0 问题。
  附带修掉两处**判据自身**缺陷（N4 判据与主题不匹配；`v3181` 与 `negctl` 的破坏锚点漂移）。
  边界：只改楼层取值口径；时间戳 `at` 不动；`coverage` 列号面已真改实现（首稿「自动排除」的说法不成立）；
  宿主侧各子系统自己的 `removeByFloor` 系列未动；实机未验。
- **R3-E：已完成**（lonsha v3.222.0；下游按跨仓纪律判定**无需抬版**）；
  `stm-ltm.js` 新增 `shiftFloorRefs(state, deleted)`（三类楼层引用同跟一个判据、返回计数不回写、
  取值口径判开「没给」与「给了 0」），`ledger-replay.js` 的 `stm-ltm` 登记项 `shift: null` 改为真调用，
  撤掉三处白名单化的既有判据（改为「任一 `shift === null` 即缺陷」）。
  验证：上游 v3223 34/34（首跑 29/34，E1 当场抓出真缺陷后修）；全量 203 文件 / 1848 断言 0 失败、42/42 审计 RC=0。
  边界：只补前移这一半、不改 LTM 区间疏密口径；重复调用仍再次平移（T17）；宿主实机未验。
- **R3-D：已完成**（lonsha v3.221.0 + RubyPhone v3.2.0）；三面在 import / 删楼 / 前移 / 重建四条路径上
  收口：新增 `clearHeader(floor)` / `shiftFloorRefs(deleted)`（先清被删楼残留，再同时平移四面），
  `rollbackFloorOnly` / `rollbackFrom` 按同一语义撤场景头，`_rebuild` 无真源时不再清空式重建，
  `numOrNull` 铺到 `import` 七格 + `headers` 键，新增 `MAX_HEADERS`（载入侧此前无上限），
  `coverage()` 增 `headerFloors` / `headerCount`，宿主不再全清在场，登记表 scene 面交给模块。
  验证：上游 v3222 25/25；全量 202/202 文件 / 1814 断言 0 失败、42/42 审计 RC=0。
  下游 system-v311 全绿；`npm run check` 九门全绿。
  边界：不改对外语义（三面键面与 R3-A 逐字一致）；`shiftFloorRefs` 重复调用仍会再次平移（T17）；宿主实机未验。
- **R3-A：已完成**（lonsha v3.220.0 + RubyPhone v3.1.0）；`summary()` 外供面 7 → 11 键
  （增 `currentChain` / `tree` / `visits` / `header`，旧键未动），新增 `tree()` / `visitHistory()` /
  `headerFace()` 三方法与上限 `MAX_TREE_ROWS=240`，新增 `numOrNull()` 把「没给」与「给了 0」判开，
  宿主 `SceneBookFallback` 补三个同形空方法；下游同轮接三面并渲染三卡（缺席 / 空两种文案分开）。
  验证：上游 v3221 17/17；全量 201/201 文件 / 1789 断言 0 失败、42/42 审计 RC=0。
  下游 v310 19/19；`npm run check` 九门全绿（两处真缺陷由既存判据当场捐到并修掉：
  `num(null) === 0`、新样式未合并进 `phone.css`）。
  边界：不改场所内部语义；真实宿主实机未验。
- **R2-E：已完成**（lonsha v3.218.0 + RubyPhone v3.0.3）；`_injectionRecord` 键面 10 → 11（增 `outcome`），
  新增 `_injectionEnd(kind)` 唯一标注入口（只从 `'pending'` 迁出，幂等），
  `_h1` 落 `received → completed`、`_h6` 落 `ended → aborted`（先复位标志后标结局），
  外供面 9 → 10 键；下游同轮接 `outcome` / `outcomeAt` / `faceDrift` + `outcomeText()` +
  `injectionFaceKeys()` 契约快照，被中止进坏消息首行（已完成不进）。
  验证：上游 v3219 11/11；全量 199/199 文件 / 1754 断言 0 失败、42/42 审计 RC=0。
  下游 v303 17/17；`npm run check` 九门全绿（dead-export 同轮捐到并修掉契约快照产品面零消费）。
  边界：宿主未发 `GENERATION_ENDED` 时如实为 `pending`（不猜结局）；宿主实机未验。

- **R2-D：已完成**（lonsha v3.217.0）；`_injectionCommit` 增载荷自身代核对（`p.gen !== gen`
  ⇒ 不落地 + 按过期收尾）、新增收尾唯一入口 `_injectionClose(myGen)`（提交不成即收尾、不重复留痕、
  `had` 前置读），两条发布路径（GENERATION_STARTED 事件 / interceptor 兼容入口）各占一代并共用它。
  验证：v3218 11/11（含破坏点取**整块**守卫的负控制）；全量 198/198 文件 / 1743 断言 0 失败、
  42/42 审计 RC=0（新测试已登记进参考基准）。
  边界：**不声称**解决两条发布路径同时活跃时谁赢（宿主集成面），也不声称消除注入槽位之外的其它迟到写。

- **R2-C：已完成**（RubyPhone v3.0.2）；注入读数消费侧单一真源 `config/injection-contract.js`
  （`readInjection` 结构恒定 22 键 / `injectionBlocksOf` 逐块归一 / `injectionLine` 四类处境四句话 /
  文案表未知原因如实输出原值），缺席两态按 `fieldTypes` 自述判（无自述取保守边），
  数值「没给」≠「给了 0」，另加归属复核 `strayOrigin`；接入诊断中心（七卡变八卡）与
  织光机回望页（送达侧观测）；第九道门新增 **J10**（`readInjection` 消费点下限 2，实测 2）。
  验证：v302 21/21（含镜像树自证 C0 + 5 条负控制）；`npm run check` 全绿。
  边界：只读消费面、不涉及写入授权；宿主实机未验；注入槽位之外的迟到写属后续 Gate。

- **R2-B：已完成**（v3.216.0）；`_injectionStage` / `_injectionCommit` 两段式（暂存 → 代际确认后提交），
  轮次只由提交推进，过期清暂存并记载荷读数；v3217（11 条，先红后绿）；
  全量 197/197 文件 / 1732 断言 0 失败、42/42 审计 RC=0。
- **R2-A：已完成**（v3.215.0）；注入读数收口到唯一构造点 `_injectionRecord`（恒定 10 键），
  逐块读数 `_injectionBlocksOf`（kept/dropped-budget 两态）、代际过期留痕 `_injectionDiscardStale`
  （累计计数、刻意不碰读数）、外供面 `buildInjectionReadout()` 进快照 + 桥 `injectionRefOf(i)`；
  面板为真生成读数作证并单独一格展示诊断（明写「没有进入 AI 上下文」）；v3216（14 项，先红后绿）；
  全量 196/196 文件 / 1721 断言 0 失败、42/42 审计 RC=0（新测试已登记进参考基准）。
  边界：**不声称**消除「过期代在 await 期间已写脏」（记录延迟到 await 之后属 R2-B）。
- R1-E：**已完成**；新增 evidence-workbench.js（413 行）+ 宿主接线 + v3214（11 项，先红后绿）；
  全量 194/194 文件、42/42 审计 RC=0（新测试已登记进参考基准）。
- R1-F：**已完成**；repair-loop preview/validate + dedupeKey 幂等；index.js abandonRepair /
  repairRevision / 桥 `repair` 受控写入面（恒定回执 9 键 + 两道门）；v3215（12 项，先红后绿）；
  全量 195/195 文件 / 1705 断言 0 失败、42/42 审计 RC=0。
- R1-A：已修复；先红后绿22项定向通过；全量1675断言、42审计通过（补齐测试登记后RC=0）。
- R1-B：已修复；先红后绿32项定向通过；手机838项测试及九门RC=0。
- R1-C：已修复；先红后绿35项定向通过；全量193文件/1682断言/0失败、42审计RC=0（新测试已登记进参考基准）。
- R1业务投影/工作台/证据修复：**读面（R1-A/C/E）与写面（R1-F）均已落地**。
- R2（准确记忆与受控行动）：**已落四段** —— R2-A 注入读数真实性（lonsha v3.215.0）、
  R2-B 迟到隔离（lonsha v3.216.0）、R2-C 注入读数消费侧接入（RubyPhone v3.0.2）、
  R2-D 无主暂存不得被别的代捡起（lonsha v3.217.0）、R2-E 取消留痕（lonsha v3.218.0 + RubyPhone v3.0.3）。
  R2-F 双向关系对账 + 知情网络（lonsha v3.219.0）。
  **R2 剩余（已取证、待实施）**：
  ① **取消留痕**：**已完成**（R2-E，lonsha v3.218.0 + RubyPhone v3.0.3）——
     详见上文 Gate R2-E 与状态检查点。
  ② **双向关系 / 知情网络**：**已完成**（R2-F，lonsha v3.219.0）——
     详见下文 Gate R2-F 与状态检查点。
- R3：**已启动** —— 第一批次 A 项（场所三面外供）**已完成**（R3-A，见上）；
  B 项（三面的回滚与回读面收口）**已完成**（R3-D，见上）；
  E 项（短期长期记忆在**前移**面上的脱钩）**已完成**（R3-E，见上）；
  其余（到访冲突、跨平台事件、O5 性能、F5/F6）待实施。
- **优化方向（O 批）：O-1 ~ O-6 全部完成** —— O-1（场所面「没给」与「给了 0」的真判开）**已完成**（v3.223.0，见上）；
  O-2（同族普查：回放/前移层的同一根因第二次发病）**已完成**（v3.224.0，见上）；
  O-3（判据灵敏度体检 —— 审计的审计：29 个扫描器 × 三档退化形态）**已完成**（v3.225.0，见上）：
  实测 H 列 29/29 全 0、无恒绿探测器，抓到并修掉 1 处真 fail-open（语法门缺入口在场性守卫）；
  逐条读数落 `tests/audit/audit_scan_probe_matrix.tsv`，常驻判据 `tests/v3226`（14 项）。
  O-4（门禁隔离与耗时 —— 先量再决定改不改）**已完成**（v3.226.0，见上）：
  量出并行度 3.96x / tests 34.3s / audit 19.3s，镜像瘦身与段间并行**明确不做**（附实测理由）；
  抓到并修掉一条真竞态（5 个测试把临时产物落仓根，与整仓镜像类测试的 cpSync 互撞）；
  基线 `tests/audit/gate_timing_baseline.json` + 常驻判据 `tests/v3227`（10 项）。
  O-6（死代码方法级扫描）**已完成**（v3.227.0，见上）：A7 由「93 条误报」升级为「分域 + 冻结基线」，
  修后 4 条零引用各自带分类理由；判据面扩到全部根级模块。
  O-5（性能取证）**已完成**（v3.228.0，见上）：合成探针 + 六条热路径读数 + 缩放判断；
  **O 批（O-1 ~ O-6）至此全部完成**。
- **功能拓展（F 批）：未启动** —— F-1 分支与玩法（R4）、F-2 跨平台事件、F-3 到访冲突、
  F-4 projection 五态、F-5 沉默降级告警面、F-6 T16/T17 读数化。
- R4：待实施。
- 真实SillyTavern宿主验证：未验（写入面的两道门与回执形状已在无头环境逐条验证，宿主侧实机未验）。

- R1-A追加GATE：全量失败根因为新增测试未按仓内纪律登记，允许catalog_reference_consumers.tsv追加一行；不放宽守卫。上游预算4文件/150行。
