# STBME + ANIMA 探索终稿

> 探索范围：stbme（14.8 万行，docs 1567 行全读 + 源码定点验证）、anima（约 2 万行，逻辑层精读）。
> 性质：工程认知存档，与 SHUJUKU_EXPLORATION_SUMMARY.md、BAIBAI_EXPLORATION_SUMMARY.md 并列，共同构成 lonsha 参考项目研究全集。

---

# 第一部分：STBME（仿生记忆生态）

## 一、项目定位

知识图谱记忆系统：节点+边的图谱（event/pov_memory/thread/synopsis/reflection/rule/实体），写入提取→读取召回→历史安全三链路。14.8 万行中 index.js 占 1.84 万（组合根）。

## 二、最高价值的工程认知

### A. 控制平面 vs 数据平面（stbme 最精华，直指 lonsha 的未来坑）

1. **核心洞察**：早期所有 bug（提取卡住/未进入聊天/reroll 乱召回/一致性漂移）都源于"身份、持久化确认、加载状态、可写性、脏标记从多个异步事件路径读写同一份模块级可变状态"。解决：把"做决定"（纯逻辑可测试模块）与"执行副作用"（IO 编排）结构分离。
2. **身份四通道分离**：active（只来自宿主上下文）/ graph-owner / queued / marker——**只有 active 通道能产出"当前聊天"，其余一律只进校验/恢复，绝不能偷偷升格为活动身份**。"未进入聊天"类 bug 的根治方案。lonsha 的 chatId 归属校验（v2.x field__chatId 同源思想）可升级为此模型。
3. **持久化确认状态机**：`已确认版本 >= 排队版本 且 同身份 且 规范tier ⟹ pending 必须为 false`。recovery-only 层（shadow/metadata）永远不能推进确认状态——"数据已安全落地"只能由规范主源证明。陈旧 pending 自动清除，"pending 卡住提取"结构上不可能。
4. **原子回合发布**：一切修改发生在 detached working graph；待提交快照（图谱+楼层指针+hash+journal+计数）一次性发布，pending/失败/切聊天都不部分推进 live 数据。
5. **历史安全三件套**：①楼层指针+消息 hash 与数据一起提交；②删楼/编辑/swipe → 反向应用 batch journal 回滚（journal 不足则停+dirty checkpoint，绝不自动全量重建）；③Restore Lock 所有权令牌——回滚期间阻断变更，旧聊天晚到的 finally 不能释放新聊天的锁。
6. **reroll 不变量**：召回注入可复用（父 user 楼层 bme_recall 确定性重放），但图谱回滚必须保留——两者不能混。"计算与注入解耦，信任宿主生成 type，不用输入源猜 reroll"。
7. **会话租约**：跨 await/timer 的任务开始时捕获 session lease + 内容 fingerprint，发布前再校验；lease 失效不得修改后来活动的聊天。

### B. 召回管线（13 阶段，业界最全）

8. **双 hash 对账**持久召回复用：no-new-user 生成（reroll/swipe/continue）直接重放父楼层注入块，命中即跳过全部检索。
9. **PEDSA 扩散激活**：`E(j) = Σ E(i) × W_ij × decay`，2 步、衰减 0.6、抑制边反向负能量（contradicts 边 edgeType 255 ×2.0 放大）、时序合成边 strength 0.2 让时间相邻记忆弱连接、teleport 0.15（PPR 式）。
10. **混合评分**：`(norm图×0.6 + norm向量×0.3 + norm词法×0.18 + norm重要度×0.1) × TimeDecay`；时间衰减 `0.8 + 0.2/(1+ln(1+天))`——旧记忆衰减到 0.8 封底不清零。
11. **访问强化**：被召回节点 accessCount+1、importance+0.1（上限 10）——使用频率正反馈，配遗忘公式构成生态循环。
12. **DPP 多样性采样**（贪心，质量项 score^weight，候选池×3）：避免召回一堆近义节点。
13. **认知边界过滤**：节点按"谁的视角"分四桶注入（角色 POV/用户 POV 带"非角色事实"警告/客观当前区域/客观全局）——防模型把用户知道的当角色知道的（反全知，lonsha 的反全知条目可借鉴此机制化思路）。

### C. 写入链路

14. **双阶段提取**：客观阶段（事件/角色/地点/规则）与主观 POV 阶段（视角记忆/认知更新）分离调用、交叉过滤输出，都通过才合并提交——一次 batch 一次原子持久化。
15. **时序边**：update 时旧 updates 边失效→建 temporal_update 边（0.95）+状态更新 event 节点（重要度 4-8）。
16. **归档不删除**：节点只有 archived 标志——保护历史恢复与审计（与 shujuku 稳定行 id、baibai 失活不删除同哲学）。
17. **智能触发打分**：关键词+自定义正则+角色切换≥2+感叹问号≥2+实体正则，score≥2 才提取——省 API 的门控设计。

### D. 维护算法（记忆生态循环）

18. **整合去重**：向量 top-1 邻居（阈值 0.85）+ LLM 批量决策（keep/merge/skip）+ evolution 建 related 边（0.7）。
19. **分层压缩**：按类型/POV 分组、fan-in 2 一批、LLM 卷成 level+1 节点、外部边迁移、子节点归档。
20. **睡眠遗忘**：`retentionValue = (importance/10) × (1/(1+log10(1+ageHours))) × (1+accessFreq) < 0.5 → 归档`。**与 lonsha SF3 遗忘价值公式同源**（lonsha 已内化此思想）。
21. **分层总结金字塔**：小总结（每 3 次提取，80-220 字）→ 折叠（同层 >3 条卷成高层，120-260 字）→ 循环到顶——与 baibai 森林 L1/L2 异曲同工，但按提取次数而非楼层驱动。

### E. 快照契约（前向兼容三件套，源码验证）

22. `GRAPH_SNAPSHOT_TOP_LEVEL_KEYS` **Object.freeze 永久冻结**（schemaVersion/meta/nodes/edges/tombstones/state 六键）；宽容解析：未知字段 round-trip 保留不丢不炸；upgrade-on-read 就地升级，永不换命名空间。演化纪律："只在 meta/record 内加字段，绝不加/删/改顶层键" → 永不需要 v4 全库迁移。**lonsha 的 config 演化可直接套用此纪律**。

### F. Agent 双模式（vnext 方向）

23. **一份记忆权威，两种编排**：workflow（事件驱动固定节奏）vs agent（自有模型决定召回深度与所需维护子集）。Agent 只是"决策壳"，全部执行仍走既有控制器与原子发布边界。
24. **失败语义精确**：Steward 模型失败在尝试 disposition 前→回退全量 workflow；变更 disposition 已开始后失败→记录且绝不二次调用（防重复副作用），批次留待重试。
25. **产品纪律**："Agent 模式不得隐藏/禁用/绕过既有能力；workflow 必须保持完整产品"——灰度演进不破坏存量。

## 三、对 lonsha 的适用性判断

- **直接可用（零依赖）**：控制平面身份四通道思想、持久化确认状态机、快照冻结键+宽容解析、楼层指针+hash 同步提交、reroll 注入复用、分层总结金字塔（提取次数驱动版）。
- **需权衡**：图谱本身（lonsha 自由文本摘要 vs 图谱是路线之争，改造成本极大）；DPP/扩散（依赖 embedding）。
- **最大启示**：lonsha v3.0 SD 诊断基建还停留在"记录错误"，stbme 已到"让整类错误结构上不可能"——把决定与副作用分离、把身份收敛为单一通道。这是 lonsha 从 v3 走向 v4 的架构纲领。

---

# 第二部分：ANIMA（Anima Memory System）

## 一、项目定位

RAG+BM25+状态栏+GC 的记忆插件，逻辑/界面分离（*_logic.js / *.js），世界书作存储介质。

## 二、关键工程认知

26. **BM25 词典系统**：trigger→index 映射词典（如"魔法, 法术"→"魔法"）、每聊天绑定词典、脏标记批量重建、**LLM 自动更新词典**（从对话提取新词加入触发词）——零 embedding 依赖的词法检索完整方案，与 lonsha 零依赖定位最契合。
27. **queryDual 双路检索**：向量（后端）+ BM25（词法）并行，chat 库与知识库双上下文，六步策略 payload：base/important(标签)/status(状态触发)/period(周期事件)/special(节日)/diversity。
28. **智能感知模块**（检索前置）：虚拟时间（故事内日期）→节日判定→周期事件判定（生理期/事件状态）→正则状态标签→规则引擎标签，各命中类型给不同检索配额——**"当前剧情状态影响检索什么"的机制化**，lonsha 可做轻量版（如物品台账变动时提高相关楼层权重）。
29. **配置三级合并**：角色卡 data.extensions > 全局 extensionSettings，strategy 子对象深度合并、数组直接覆盖——lonsha 角色级配置可参考。
30. **zod 状态校验**（最值得借鉴）：UI 配置规则或脚本两种模式；**z.coerce 宽容类型转换**（"150"→150）；**delta 幅度限制**（|新-旧|>maxDelta 则 clamp 到旧±max）；min/max 边界 clamp；失败抛 ZodError 带 path 定位。这就是 MVU 卡「行为限制器/硬阈值禁令」的插件级实现——lonsha 物品台账数量校验可直接套用。
31. **GC 数据校准器**：LLM 扮演 STRICT Data Calibrator，输入背景信息（已建立事实，严格排除重复）+ 最近上下文 + 臃肿状态，输出增量校准 JSON（修 schema violation/冗余/幻觉/情感水分/缺失事实）——**状态膨胀的 LLM 级清洗方案**，配合 Grok 4.6 指出的"stat_data 长线熵增"问题，ruby宇宙未来可评估。
32. **状态栏工程**：replyIntegrity 完整性校验、AbortSignal 贯穿（AbortError 专用类型识别）、YAML 注入消息、状态同步世界书条目、设置可存角色卡。
33. **swipe 感知**：_isSwipeMode 全局态传给后端，重绘时检索行为可区分。

## 三、对 lonsha 的适用性

- **直接可用**：BM25 词典方案（若 lonsha 做楼层检索）、zod 式台账校验（数量 delta clamp）、GC 校准器思想（摘要膨胀治理）、配置三级合并。
- **不适用**：后端依赖（db_api/外部 RAG 服务）与 lonsha 零依赖定位冲突，只取其前端侧设计。

---

# 第三部分：四项目总览（研究全集收官）

| 项目 | 体量 | 一句话哲学 | 对 lonsha 最大启示 |
|---|---|---|---|
| shujuku | 47 万行 | 纪律型：每个功能配一个防御 | 错误提示规则库、sanitizer、快照修订号 |
| baibai | 1.2 万行 | 结构型：让正确成为唯一可能 | 确定性 id+三态语义、状态重放化、时间锚点 |
| stbme | 14.8 万行 | 架构型：让整类 bug 结构上不可能 | 控制平面分离、身份单通道、快照冻结契约 |
| anima | 2 万行 | 轻量型：零/低依赖下的完整功能 | BM25 词典、zod 校验、GC 校准器 |

**lonsha 迭代路线建议（综合四项目）**：
1. **v3.2（防御包）**：shujuku 错误规则库裁剪 10-15 条 + baibai LEGACY 槽位清空 + fetch 外部取消不重试 + 物品台账 zod 式校验（数量 clamp）。全是小改动高收益。
2. **v3.3（台账重放化）**：物品台账从独立存储改为楼层 delta + 确定性 id 重放（baibai 路线），翻 swipe 一致性免费获得。
3. **v4.0（架构升级，需用户决策）**：控制平面分离（stbme 纲领）——身份收敛单一通道、持久化确认状态机、快照冻结键契约；可选：正文时间锚点协议（baibai，收益/侵入性最大）。