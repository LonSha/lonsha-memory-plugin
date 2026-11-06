# LonSha / RubyPhone 第十八期（V18 · L18 & R18）产品演进与验证证据链

**日期**：2026-11-06  
**版本**：LonSha `v3.456.0` / RubyPhone `v4.136.0`  
**分支**：`feat/v18-pyramid-evolution-cycle`  
**核心特性**：提取驱动分层记忆折叠金字塔（Fan-in Rollup）与整合去重演化引擎（Evolution Links Engine）

---

## 1. 痛点背景与演化架构动因

在以往版本中，记忆折叠与摘要生成存在三大结构性缺陷：
1. **静态硬截断阈值**：传统 `maybeFold` 仅按 30 楼硬性截断，未考量事实的提取频度与语义热度。高频交互场景下重要事实因达到固定楼层被过早强行折叠为一句话，冷门场景却迟迟得不到压缩。
2. **多头同义碎片共存**：伴随剧情推进，同主题的事实（如同一人物的职务更迭、同一线索的推进）因表述微异不断新增，导致记忆图谱和摘要层中“旧版本”与“新更正版本”同时被召回，严重浪费模型生成 Token 预算并造成逻辑冲突。
3. **睡眠遗忘缺乏演化协同**：睡眠周期的保留价值计算仅考量重要度、新鲜度与访问频率，无法识别记忆节点是否已被更高阶、更新的演化节点替代。

为此，第十八期（V18）推出**提取驱动分层折叠金字塔**与**语义去重演化边链引擎**，使长线记忆网络具备仿生收敛与自净演化能力。

---

## 2. 核心架构与落地机制

### 2.1 分层折叠集群规划（Fan-in Rollup）
- 依据 `hierarchical-pyramid-evolution.js` 中的 2-gram 词法相似度判定与楼层临近度：
  - 相邻楼层、相同语义主题、累计访问强度达到 `fanInThreshold`（默认 3）的事实集合，自动聚类为折叠集群；
  - 升层折叠后，原事实平滑结转到高阶场景/纪事层（Level 1 细粒度 → Level 2 场景层 → Level 3 史记层）。

### 2.2 整合去重与演化边链（Evolution Links）
- 当相似度达到 `evolutionSimThreshold`（默认 0.80）时，系统自动识别高置信演化关系：
  - 基于时间戳区分新旧版本，由旧向新构建 `evolution` 演化边；
  - 相似度在 0.62 ~ 0.80 之间时，构建 `related` 关联边；
  - 建立演化边后，旧记忆的历史访问信用以 0.5 权重转移至新节点，保障语义连续性。

### 2.3 睡眠遗忘联动加速软归档（Sleep-Evolution Archival）
- 深度重构 `index.js` 中的 `sleepCycle()` 循环：
  - 若某一底层记忆已被更高阶的新节点建立 `evolution` 替代，其保留价值在原有公式基础上施加 `0.6` 的加速衰减系数；
  - 加速淘汰被替代的旧记忆，置其 `archivedForSleep = true`，使活跃检索面专注于最新确证事实，同时在快照存档中完整保留演变因果。

### 2.4 主管线动态补充与伴生端演化抑制
- **LonSha 主管线召回**：在 `engine-recall.js` 的摘要召回后，自动沿演化边链探查并动态补回关联事实（标注 `source: 'summary:evolution'`），赋予模型完整的事件前因后果上下文；
- **RubyPhone 伴生端过滤**：在 `lonsha-bridge.js` 中接入演化替代判定，在真实 `recall()` 链路中自动过滤已被换代的陈旧记忆，防止手机短信/私聊端出现信息错乱。

---

## 3. 全链路 22 处垂直贯通清单

1. `manifest.json`（LonSha）：登记 `hierarchical-pyramid-evolution.js` 依赖文件与 `v3.456.0` 版本。
2. `manifest.json`（RubyPhone）：升级至 `v4.136.0`。
3. `package.json`（双仓）：版本号同步抬升。
4. `memory-config.js`：新增 `pyramidEvolutionEnabled`、`fanInThreshold`、`evolutionSimThreshold`、`sleepEvolutionDecay` 4 个核心配置项并合并进角色卡覆盖白名单。
5. `config-effect-registry.js`：登记配置项生效时机与范围。
6. `hierarchical-pyramid-evolution.js`：新建纯净且具备完整算法状态机（IIFE+CJS 双导出）的核心库。
7. `index.js`（取库口）：接入 `_pyramidEvolutionLib` 访问通道与加载状态显式暴露。
8. `index.js`（生命周期维护）：在 `_maintenancePipeline` 中接入定期演化边巡检。
9. `index.js`（睡眠遗忘联动）：在 `sleepCycle()` 中接入演化替代加速衰减。
10. `engine-persistence-ops.js`（对称落盘）：通过 `extensions.lonshaPyramidEvolutionState` 实施落盘。
11. `engine-persistence-ops.js`（宽容水合）：状态导入时实行容错与坏值兜底。
12. `engine-persistence-ops.js`（隔离契约）：严格保持 `ARCHIVE_TOP_LEVEL_KEYS` 冻结，不污染顶层快照键。
13. `engine-recall.js`（召回主链路）：在卷摘要后动态接入演化脉络补充。
14. `engine-diagnostic-lines.js`：在控制台/悬浮行输出实时透明读数 `_pyramidEvolutionLine`。
15. `settings-ui.js`：在全局面板增加开关与扇入阈值控制卡片。
16. `apps/memory/lonsha-bridge.js`（演化记录）：提供 `recordEvolutionLink` API。
17. `apps/memory/lonsha-bridge.js`（替代判定）：提供 `hasSupersedingEvolution` API。
18. `apps/memory/lonsha-bridge.js`（召回抑制）：在 `recall()` 链路实施换代压制。
19. `apps/memory/lonsha-bridge.js`（跨会话持久化）：`_load()` 与 `_save()` 支持演化边表落盘与恢复。
20. `tests/l18_pyramid_evolution.test.mjs`：覆盖集群聚合、演化边构建与睡眠衰减纯内核测试（3/3 绿标）。
21. `tests/l18_vertical_pyramid_recall.test.mjs`：真跑 `recallMemory` 演化动态补回与负控制测试（1/1 绿标）。
22. `tests/r18_evolution_bridge.test.mjs`：真跑伴生端演化抑制与跨会话恢复测试（2/2 绿标）。

---

## 4. 定向测试与负控制证据

```bash
# 1. LonSha 核心演化算法与召回主管线测试
$ node tests/l18_pyramid_evolution.test.mjs && node tests/l18_vertical_pyramid_recall.test.mjs
✔ L18-O1 分层折叠集群识别与同层合并规划 (Fan-in Cluster) (0.874692ms)
✔ L18-O2 语义演化与去重边构建规划 (Evolution Links) (1.237ms)
✔ L18-O3 睡眠遗忘与演化归档安全联动 (Sleep-Retention Plan) (0.230692ms)
ℹ tests 3 | pass 3 | fail 0
✔ L18-Vertical-1 真实 recallMemory 演化链动态补充召回 (8.081769ms)
ℹ tests 1 | pass 1 | fail 0

# 2. RubyPhone 伴生端演化抑制与跨会话测试
$ node tests/r18_evolution_bridge.test.mjs && node tests/r17_resonance_heat.test.mjs
✔ R18-O1 演化边跨会话落盘、恢复与演化换代抑制过滤 (3.437846ms)
✔ R18-O2 负控制：非 evolution 类型（如 related）边不触发硬过滤 (0.295615ms)
ℹ tests 2 | pass 2 | fail 0
✔ R17-O1 热键严格同键：真注入的记忆下轮必须真实升温并前移 (9.187693ms)
✔ R17-O2 负控制 + 防全知不回退：被封禁的记忆绝不能升温 (2.385539ms)
ℹ tests 2 | pass 2 | fail 0

# 3. 前序相邻回归抽样
$ node tests/l17_vertical_recall_wiring.test.mjs
✔ L17-V1 真跑 recallMemory：共振段必须执行并留下真实统计 (7.876693ms)
✔ L17-V2 真跑 recallMemory：图种子 + 时序边驱动多跳提权并就地改序 (3.829616ms)
✔ L17-V3 模块缺席不得静默伪装成功（失败必须点名） (0.305846ms)
ℹ tests 3 | pass 3 | fail 0
```

所有测试均包含明确的反向突变负控制验证（如 `pyramidEvolutionEnabled: false` 时演化补充严格归零、非 `evolution` 关联边不触发换代抑制等）。双仓语法自检 `node --check` 100% 通过。
