# DeepSeek 视角：shujuku 47万行探索最终总结

> 探索范围：src/data（gateways/repositories/sqlite/storage）、src/service（19个子服务）、src/presentation（v1+v2 UI层）、src/shared（工具层）
> 探索方式：按「先目录规模→再头文件→再精华函数」逐层扫读，全程关注**可移植的模式**与**架构级认知**
> 生成：多轮深挖后由 DeepSeek 视角整理

---

## 一、47 万行真正沉淀的东西：20 个「工程级认知」

按价值密度排序，这些才是 shujuku 之所以「成熟」的根因——

### A. 数据一致性层（已部分内化，仍需补）
1. **pending/accepted 发布模式**：所有变更先在 detached 副本做，宿主确认后一次性发布。stbme/baibai/shujuku 三家收敛到此模式——这是跨项目验证过的「升级不炸」答案。
2. **事件溯源（楼层语义）**：diary/向量/表格状态都按「checkpoint@C + 逐层 delta 重放」。lonsha 已有 SceneBook/status/items 走真源重放，但 summary/vector 还是平铺覆盖。
3. **快照修订号（乐观并发）**：`setStateIfRevision(expected, snapshot)` 拒绝旧快照写入。lonsha 没有（mutex 是悲观锁）。
4. **隔离键三件套**：chatKey×isolationKey×targetIndex 三维 scope 锁。lonsha 的全局提取锁粗于此。

### B. 存储管理
5. **字段清单单一事实来源**：`MESSAGE_TABLE_FIELDS` 常量 + 注释「新增存储字段必须同步更新」——防清空遗漏的工程纪律。
6. **三层存储衰减**：tavernSettings → IndexedDB → memory，带 pending reload 调度。lonsha 只有 chatMetadata 一层。
7. **稳定行 ID 分配**：`allocateStableRowId` 只增不减（从 max+1 开始），绝不回收 gap——「row_id 是身份不是位置」。
8. **物理表名确定性纯函数**：表名 = 显示名的 slug（**拼音 slug**），同音冲突 fail-loud 抛错而非静默 hash 分叉。

### C. 检索与向量
9. **BM25 语料缓存**：键=indexId+writeGeneration+候选集合指纹，容量上限淘汰最旧键，防旧语料误用。
10. **BM25 中文 bigram 分词**：单字 + 双字滑窗，CJK 专用路径。
11. **embedding/rerank 网关**：超时+分类重试（5xx/429 重试、4xx 不重试）、**凭据指纹冷却**（403/401 后同凭据全 scope 停 30 分钟）。
12. **rerank 分批**：300 条/批，4 并发，超时回退 embedding 排序；**CORS 安全注释**（绝不能混入宿主请求头）。

### D. 防御与健壮
13. **json-sanitizer**：全角引号归一 + 未转义引号状态机修复——为 LLM 烂输出写的完整解析器。
14. **渲染切片保护**：`inspectHistoryMutation` 跳过「ST 只渲染最近 N 条」误判，防误清空。
15. **Restore Lock 所有权令牌**：品牌 Symbol + WeakSet + 单调 ID，防旧实例迟到清理污染新实例。
16. **错误提示规则库**：43 条规则把报错翻译成人话（「这是什么问题+你可以怎么做」），**通用兜底保底**。
17. **开场白抑制**：无用户消息时禁止创建/更新，只清理。

### E. 模板与交互
18. **世界书模板引擎**：`<if seed="…">`/`<random>`/`{[db.表.方法]}` 条件渲染 + SQL 查询变量。叙事用的「弱编程语言」。
19. **翻译/别名映射**：中英双向 NameMapper（DDL 注释自动构建）；NFKC+空白折叠归一化（lonsha 已在 v3.1 SF4 内化）。
20. **刷新时机**：setExtensionPrompt 持久化 + 「变了才刷新」；多槽位分层（历史在顶、状态居中、指令贴底）。

---

## 二、已经内化的（lonsha 已具备）

- **事件溯源真源重放**：SceneBook/status/items（v2.4/v2.7）
- **多槽位分层注入**：双槽位卷摘要顶部 + 细粒度贴对话（v3.1 SF6）
- **遗忘价值公式**：importance×recency×(1+accessFreq)（v3.1 SF3）
- **角色名 NFKC 归一化**（v3.1 SF4）
- **fetch 超时+分类重试**（v3.1 SF1）
- **渲染切片保护**（v3.1 SF2，简化版）
- **番外楼排除**（v3.1 SF5）
- **快照恢复**（v2.9 RU-C，IndexedDB 每 50 楼）
- **诊断基建**（v3.0 SD：errLog + selfCheck + 诊断面板）

## 三、差异大、尚待评估的

| 项 | 差异 | 适配性 |
|---|---|---|
| **SQLite wasm 内联** | lonsha 纯 JS 内存对象；shujuku 内联 wasm 单文件 | 高（lonsha 目前无 SQL 查询需求，低优先） |
| **worldbook 模板引擎** | lonsha 无世界书写入能力；shujuku 是世界书+表格写入系统 | 中（若做「记忆主动写入世界书」才有用） |
| **Agent 决策/绿色放行** | shujuku Agent 决定哪些世界书条目触发 | 低（lonsha 无世界书通路） |
| **三层存储衰减** | lonsha 单层 chatMetadata | 中（跨设备同步需求出现时） |
| **表格 CRUD/锁定/编辑** | shujuku 核心（5351 行 orchestrator） | 低（lonsha 无表格概念） |

## 四、最重要的认知（优于任何功能）

> **shujuku 的成熟度不在「功能多」，而在「每个功能都有对应的防御」**：
> - 有快照 → 有修订号防旧写
> - 有 SQL → 有只读校验/锁定补偿
> - 有报错 → 有人话提示规则库
> - 有重试 → 有凭据冷却防连锁
> - 有事件源 → 有 pending/accepted 防半提交
>
> lonsha 已用 v3.0 的诊断基建 + v3.1 的安全收编逐步对齐这个纪律，方向正确。**继续的方向不是加功能，而是给已有功能补防御。**

---

## 五、可供 lonsha 下一步借鉴（按优先级）

1. **错误提示规则库**（log-error-hints 裁剪到 10-15 条）→ 诊断面板加分
2. **日志分级开关**（error 恒记 / debug 按开关）→ errLog 小升级
3. **json-sanitizer**（全角引号+未转义修复）→ LLM 提取鲁棒性
4. **BM25 语料缓存 + bigram 分词** → 召回质量
5. **快照修订号** → 存档乐观并发

（此文件作为 shujuku 探索的终稿存档，供后续批次立项参考）