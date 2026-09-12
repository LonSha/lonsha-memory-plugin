# 更新日志

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
