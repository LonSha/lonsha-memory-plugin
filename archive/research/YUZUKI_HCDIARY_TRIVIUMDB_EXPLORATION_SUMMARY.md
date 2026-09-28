# YUZUKI + HCDIARY + TRIVIUMDB 探索终稿

> 探索范围：yuzuki（4 万行，floor-ledger/branch-snapshot/task-runner/tag-parser/vector-store 精读）、hcdiary（2.2 万行单文件，README+数据层+提示词体系）、triviumdb（Rust 三模数据库，README+SDK API 面）。
> 性质：工程认知存档，研究全集第三份（前两份：SHUJUKU、BAIBAI / STBME_ANIMA）。

---

# 第一部分：YUZUKI（与 lonsha 功能重合度最高的对标）

## 一、项目定位

表格化记忆插件（剧情摘要/角色档案/角色状态/物品追踪/世界设定/记忆总结六张固定表 + 自定义表），AI 通过 `<Memory>`/`<tableEdit>` 标签更新表格，前端解析后原子落盘。功能名与 lonsha 高度重合：floor-ledger（楼层台账）、branch-snapshot（分支快照）、variable-injector（变量注入）。

## 二、核心工程认知

### A. floor-ledger（894 行，楼层 delta 台账——lonsha v3.3 的最佳参考实现）

1. **混合台账结构**：`baselineRecords`（基线快照）+ `entries`（按楼 delta：rows/growthCompletionUpdates/storyTime/floorScope），每条 entry 通过 **marker 挂在消息 extra** 上（`yzm_memory_floor_delta`：version/ledgerId/entryId/swipe）——真源仍在楼层，与 baibai 哲学一致。
2. **楼层签名五元组**：`role|swipe_id|textHash|gen_id|send_date`——比 baibai 单 hash 更强的身份指纹，gen_id 可区分同 swipe 的不同生成代。
3. **重放三态对账**（reconcileNow 精髓）：扫出 activeEntries（marker 的 swipe 与当前楼层 swipe 一致才算活跃）→ **expected = 按旧分支重放 / rebuilt = 按新分支重放** → applyExternalOverlay 把当前记录中"用户手动改动"以覆盖层形式嫁接到 rebuilt 上 → 整体替换。**重放一致性不牺牲手动编辑**——这是 baibai 没有的设计。
4. **表结构变更即 rebase**：tableShape（表 id+列签名）不匹配时放弃重放，直接 rebase 到当前状态为新基线——schema 演进的降级路径，不做迁移幻想。
5. **对账触发**：1 秒轮询 chat fingerprint（sessionId+楼数+marker 数组）比对变化 → 防抖 120ms 重排；删除按钮捕获期监听（#dialogue_del_mes_ok）+ 220ms 延迟 force 重排；save 失败重试上限 4 次；branch busy 时不强制、延迟重试。
6. **事务句柄**：recordAppliedDelta 返回 `{commit, rollback}`——marker 写入前保存 previousMarker/hadExtra，rollback 精确还原。

### B. branch-snapshot（1009 行）

7. **分支快照守卫**：为 regenerate/swipe 分支保存状态快照（每会话最多 50 个、localStorage 按会话分桶），high-floor genesis guard（≥5 楼禁止无快照生成）、swipe resolve 定时器 + prepare 去重、pendingRequestRollbackFloors/pendingApplyRollbackFloors 分离请求期与应用期回滚。
8. 与 floor-ledger 联动：对账完成后 `BranchSnapshot.resetSnapshotHistory`——快照历史是重放的下游，不并列两套真源。

### C. 记忆标签与提取

9. **AI 自适应标签过滤**：LLM 先分析回复文本决定"黑名单还是白名单"方案（正文是裸文本→绝不能白名单；正文在标签内→白名单剔除一切），再执行过滤——比固定正则更鲁棒，是「提取前清洗」的聪明解法。
10. **标签解析原子落盘**：`<Memory>/<GaigaiMemory>/<tableEdit>` 统一 pattern 解析，记忆更新与角色任务完成标签**一次原子状态保存**（applying 互斥锁防重入）；processedSignatures 队列去重（防同一回复重复处理）。
11. **六表 schema**：剧情摘要(#主线/#支线)、角色档案（含 #待办事项/约定）、角色状态（好感度/疲劳/属性）、物品追踪、世界设定、记忆总结——`#` 前缀列名表特殊语义（时间线分类）。

### D. 检索与注入

12. **向量库双轨**：世界书内嵌目录（Yuzuki_Memory_Vector_Library 条目）+ IndexedDB 实际索引，float32-base64 编码，**webllm 本地 embedding 后端**（零外部 API！VECTOR_BACKEND_SOURCE='webllm'）——本地 embedding 是 lonsha 可评估的零依赖路线。
13. **变量注入锚点系统**：`{{MEMORY_SUMMARY_x}}/{{MEMORY_TABLE_x}}/{{VECTOR_MEMORY}}/{{DATABASE_SCHEMA}}` 等宏在提示词方案中自由编排，VECTOR_MARKER『【系统检索到的历史记忆片段】』文本锚点定位注入位置。
14. task-runner（4377 行）：插件自有 trace/summary 任务不触碰 ST 聊天正文；LLM API 预设+任务路由（不同任务走不同 API）；historian 提示词预设体系。

## 三、对 lonsha 适用性

- **v3.3 台账重放化直接照抄 floor-ledger 骨架**：marker 挂楼层 + baseline+entries + 签名五元组 + 三态对账（expected/rebuilt/overlay）。比 baibai 方案更贴近 lonsha 现状（baibai 是自由文本流，yuzuki 是表格 delta，lonsha itemLedger 是表格）。
- **本地 embedding（webllm）**：若 lonsha 未来做检索，这是零 API 依赖的候选。
- AI 自适应标签过滤可用于 lonsha 摘要前的正文清洗。

---

# 第二部分：HCDIARY（角色日记 / LIWE，v2.17.0）

## 一、项目定位

角色第一人称日记 + 剧情档案双记忆系统 + RAG 注入，单文件 2.1 万行，TavernHelper API 深度使用（getVariables/insertOrAssignVariables/getChatMessages）。

## 二、核心工程认知

15. **双记忆品类分治**：剧情档案（客观多栏位：主线/支线/状态/未解决事项+自定义追踪项，增量追加从不断章取义覆盖）vs 角色日记（主观第一人称"活人感"，全知禁令只写角色亲历）。**客观记忆与主观记忆分开存储、分开提示词**——与 stbme 双阶段提取同思路，但提示词层面实现。
16. **增量/全量双提示词模式**（archiveFull 开关）：普通模式"本次新增楼层，基于已有进展做增量扩展，不得假设已记录"；全量重建模式"从最开头到当前的全部楼层，完整梳理，不得假设之前已记录而跳过"。**同一数据结构两条提示词路径**，手动补写大区间用全量。
17. **增量追加纪律**："所有已发生的事无论多小都不丢，只精简冗余描述"——压缩=瘦身不截肢（目标约原文一半）；"未解决事项真覆盖"（AI 判断已了结就清空，防越积越多）——解决记忆膨胀的两个方向性设计。
18. **按登场人物注入**：正则识别当前剧情出现的角色，只注入这些角色的近期日记——精准省 token。
19. **数据保护**：日记骤减检测→自动从本地备份补回（防丢记忆）；全量迁移导出/导入（聊天记录+插件回忆）。
20. **好感引擎**（设计资产而非代码）：8 阶段好感度（-100~100）+ 阶段锁（戒备锁/陌生人锁/朋友锁/知己锁/爱人锁）+ 突破条件（多选一/多选二任务清单）+ 情感维度系数公式（基础变动 × 阶段修正 × 行为契合度，价值观共鸣在亲密期系数 2.0+ 而浅层互动为负）——**完整的数值化关系模型**，ruby宇宙/韩玲卡 EJS 调色盘的更精细版本。
21. **合并式单路 API**：日记+档案合并一次 LLM 调用，提示词按勾选模块动态拼接；总结瘦身默认不带历史（可手动开）。

## 三、对 lonsha 适用性

- 增量/全量双提示词模式：lonsha 手动补写/重建场景可直接采用。
- "未解决事项真覆盖"：lonsha 反思系统的未了结计划可借鉴"AI 判断已了结就清除"防积压。
- 日记骤减备份补回：lonsha 摘要库的异常检测+自动恢复参考。
- 好感引擎：角色卡项目资产（与 lonsha 插件无关，但可复用于卡制作）。

---

# 第三部分：TRIVIUMDB（AI 原生嵌入式数据库，Rust）

## 一、项目定位

纯 Rust 三模嵌入式引擎（向量×图谱×文档同一内核），自称"AI 应用领域的 SQLite"。在 stbme 架构中作为 Trivium 搜索副本（Authority SQL 是规范主源、Trivium 只是搜索副本）。

## 二、关键认知（作为依赖候选评估，非模式来源）

22. **三模同内核**：每节点同时拥有稠密向量+稀疏倒排（AC 自动机+BM25）+元数据+图关系，ID 全局唯一——混合检索无需多库对齐。
23. **TQL 查询编排**：向量召回/属性索引/图扩展/图算法/集合代数/聚合/重排是可自由编排的算子，Cascades 确定性优化器统一规划；内嵌 15+ 图算法（PageRank/Leiden/SA-PPR/DPP 等）。
24. **四层数据安全**：原子替换+WAL+事务干跑验证+Mmap COW 隔离；`.flush_ok` v3 把多文件 generation/大小/CRC 绑定同一提交，混代输入 fail-closed——**单文件多副文件一致性协议**的教科书写法。
25. **Payload 冷热分层**：已发布 JSON 留 mmap 冷层、新写入进内存 delta、解析结果进有硬上限的 LRU——ANN 候选阶段零 payload 解析。
26. **QuIVer ANN**：按约 800 万向量分量工作量动态触发（2500-10000 节点），小规模 rayon 并行暴力搜索 100% 精确——**小数据量不做索引**的务实边界。
27. Rom/Mmap 双引擎：Rom 单文件 `*.tdb` 复制走人；Mmap 分离 `.vec`/`.pld` sidecar 由 generation 协议保护。

## 三、对 lonsha 适用性

- lonsha 零依赖单文件定位下**不引入**（WASM/Rust 原生均超重）。但它的设计词汇（generation 提交、fail-closed、payload 分层、小规模暴力搜索）是认知资产；若 lonsha 未来做向量检索，"2500 节点以下直接暴力余弦"的边界判断可直接借用——ST 单聊天记忆规模远达不到需要 ANN 的量级。

---

# 第四部分：七项目研究全集·最终总览

| 项目 | 体量 | 一句话哲学 | 对 lonsha 最大启示 |
|---|---|---|---|
| shujuku | 47 万行 | 纪律型：每个功能配一个防御 | 错误提示规则库、sanitizer、快照修订号 |
| baibai | 1.2 万行 | 结构型：让正确成为唯一可能 | 确定性 id+三态语义、时间锚点、森林选择 |
| stbme | 14.8 万行 | 架构型：让整类 bug 结构上不可能 | 控制平面分离、身份单通道、快照冻结契约 |
| anima | 2 万行 | 轻量型：零/低依赖下的完整功能 | BM25 词典、zod 校验、GC 校准器 |
| yuzuki | 4 万行 | 对标型：表格 delta 台账的完整实践 | **floor-ledger 是 v3.3 直接参考实现** |
| hcdiary | 2.2 万行 | 内容型：记忆的"写法"比机制更动人 | 增量/全量双提示词、活人感日记、未解决事项真覆盖 |
| triviumdb | Rust 库 | 底座型：AI 原生数据库的完备形态 | 设计词汇库；"小规模暴力搜索"边界判断 |

## 修订后的 lonsha 迭代路线

1. **v3.2 防御包**（不变）：错误规则库裁剪 + LEGACY 槽位清空 + fetch 外部取消不重试 + 台账数量 clamp。
2. **v3.3 台账重放化**（参考实现升级）：**以 yuzuki floor-ledger 为骨架**（marker 挂楼层 + baseline+entries + 签名五元组 + expected/rebuilt/overlay 三态对账 + 表结构变更 rebase），融合 baibai 确定性 id 与三态补丁语义。yuzuki 证明了这条路线在 ST 前端单文件环境完全可行。
3. **v3.4 内容升级**（hcdiary 启示）：摘要提示词的增量/全量双模式；未了结计划"AI 判断已了结即清除"防积压；摘要库骤减备份补回。
4. **v4.0 架构升级**（需决策）：控制平面分离 + 快照冻结键契约；正文时间锚点协议单独立项评估。