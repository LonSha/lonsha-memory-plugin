# 双项目四批交付跟踪

状态：实施中，未发布。用户已授权四批及后续自主迭代；不把代码、自动化、实机验收混同。
基线：LonSha 3.212.0 / RubyPhone 3.0.0，工作区原始干净；1673断言+42审计、835测试+九门日志通过。旧启动未记录退出码，新门禁必须记录。

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

## 状态检查点
- **R2-A：已完成**（v3.215.0）；注入读数收口到唯一构造点 `_injectionRecord`（恒定 10 键），
  诊断另存 `_diagnostics.dryRun`（不写也不覆盖读数），零块也落地（`blocks:[]/total:0/round+1`），
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
- R2/R3/R4：待实施。
- 真实SillyTavern宿主验证：未验（写入面的两道门与回执形状已在无头环境逐条验证，宿主侧实机未验）。

- R1-A追加GATE：全量失败根因为新增测试未按仓内纪律登记，允许catalog_reference_consumers.tsv追加一行；不放宽守卫。上游预算4文件/150行。
