# LonSha / RubyPhone 第十七期（V17 · L17 & R17）
## 记忆能力超级加强：仿生记忆共振巩固与多跳推演引擎

> 分支：`feat/v17-resonance-consolidation-cycle`（双仓同名）
> 版本：LonSha `v3.455.0` / RubyPhone `v4.135.0`
> 定位：酒馆（SillyTavern）**通用多角色与动态群聊生态**，全部种子与在场角色由宿主动态供给，**零硬编码具体角色名**。

---

## 一、为什么这一期是「记忆插件最主要的东西」

既有召回管线虽有 15 路结果分区、HippoRAG 双路引燃、Personalized PageRank + DPP，但存在三个结构性缺口：

1. **图扩散推演深度不足**：`personalizedPageRank` 走全图均匀重启，无时序合成边、无抑制/矛盾边负能量、无衰减逐级传播 —— 关联是「平铺」而非「推演」。
2. **长程记忆衰减正反馈循环欠缺**：被反复用到的记忆不会变得更容易被召回；旧记忆只被时间衰减压制，没有「越用越强 / 可被重新引燃」的生态循环。
3. **跨实体时空关联未形成动态多级激活**：图谱命中、BM25 命中、楼层相邻三条线索彼此孤立，没有统一激活能面把它们缝起来。

V17 一次补齐三块，并**严格垂直贯通**（数据持久化 → 控制器 → 宿主接线 → 诊断行 → 主生成注入管线 → Settings UI → 负控制测试），无纯函数、无注册后零调用。

---

## 二、交付的实质能力（非常规工程工作）

### L17-O1 · PEDSA 多跳激活扩散（`memory-resonance-consolidation.js`）
- `E(j) = Σ E(i) × W_ij × decay + teleport·E_seed(j)`，2 跳、衰减 0.6、teleport 0.15。
- **时序合成边**：按楼层排序，相邻记忆自动建 strength 0.2 弱连接 → 跨实体时空关联可多级激活。
- **抑制边负能量**：`edgeType 255 / contradicts / superseded` 按 ×2.0 放大并 clamp 到 0（只削弱、不产生负分幻觉）。
- 双向关联边：A 想起 B、B 亦可反燃 A。
- 种子**完全由宿主动态供给**：`results.graph` 命中实体 + `results.bm25` 命中条目，无任何静态角色名。

### L17-O2 · 访问强化生态循环（Hebbian / STBME 生态化）
- **只有真正进入最终提示词的记忆才升温**：判据用裁剪后的 `full` 文本前 24 字，而非候选池 ⇒ 被预算裁掉 / 被 V16 四桶封禁的条目绝不会被误算成「用过」。
- `accessCount + 1`、`importance + 0.1`（上限 10）、`lastAccessTs` 更新；状态有界（400 节点，淘汰最低频）。
- 时间保留值 `0.8 + 0.2/(1+ln(1+天))`，**旧记忆 0.8 封底不清零**，可被多跳引燃重新捞起。

### L17-O3 · 混合评分共振重排
- `hybrid = 0.6×激活能 + 0.2×访问强化分 + 0.2×时间保留值`，以**有界量 ≤0.01** 叠加到 `rrfScore`，只动名次边界、不推翻既有 RRF/意图/情绪/跨链主排序。
- 位置纪律：`intentRerank / crosslink / 情绪反向 / fuseCandidates` 全部落位之后、`_finalize` 之前；就地 `splice` 改序，引用不换。

### L17-O4 · 跨会话持久化（STBME 快照契约纪律）
- `createState / hydrateState`：宽容解析、坏值 clamp、upgrade-on-read，**绝不新增/改动 `ARCHIVE_TOP_LEVEL_KEYS` 冻结顶层键**。
- 走既有 `extensions.lonshaResonanceState` 命名空间：`collectExport` 落盘 ↔ `restoreFromPayload` 恢复逐键对称，失败点名、跳过计数。
- 模块缺席必须点名 `module-missing`，**不静默伪装成「融合 0 条」**。

### R17 · RubyPhone 记忆访问热表闭环
- 真实 `recall()` 侧按热表有界加权（≤ +30%）并重排；`recallBlock()` 侧只给真进 system 块的证据回写；`_heatKeyOf()` **单一真源**保证两侧严格同键。
- 热表随 `lonsha_bridge_v1` 跨会话落盘/恢复。
- **顺带修复一处源码级真断点**：BM25 索引三层（`_rebuildIndex → rebuild → search → recall`）此前全丢 `character/owner/scope/knownBy/knowledge/origin/tags` ⇒ V16 防全知在真实 BM25 主通道上**恒失效却"假绿"**（旧测试整体 mock 掉 `recall` 绕过了链路）。现在由 `BridgeBM25.cognitionMeta()` 单一提取器全链路保真，并加回归锁断言。

---

## 三、垂直贯通接线证据（逐层）

| 层 | 文件 | 真实接线 |
|---|---|---|
| 数据内核 | `memory-resonance-consolidation.js` | PEDSA / reinforce / rescore / state 四组导出 |
| 加载清单 | `manifest.json` | `extra_js` 登记 + 双仓版本号 |
| 配置 | `memory-config.js` / `config-effect-registry.js` | 4 个键 + 角色卡覆盖白名单 + 生效时机 |
| 宿主控制器 | `index.js` | 取库口 `_resonanceLib`、引擎 `_resonanceState`、诊断代理、`assembleComponents` 的 `bindDeps` 真注入、`loadModules` 成功/失败双出口 |
| 召回主管线 | `engine-recall.js` | `RS.diffuseActivationEnergy` + `RS.rescoreByResonance(finalMerged)` 真调用 + 统计留痕 |
| 主生成注入 | `engine-injection-pipeline.js` | `buildInjection` 收口处 `RS.reinforceOnAccess` 真回写 |
| 持久化 | `engine-persistence-ops.js` | collectExport / restoreFromPayload 对称 |
| 诊断 | `engine-diagnostic-lines.js` | `_resonanceConsolidationLine` 真实读数（种子/边/提权/累计访问） |
| UI | `settings-ui.js` | 真实开关 `ck('resonanceConsolidationEnabled')` + 诊断卡片 |
| RubyPhone | `lonsha-bridge.js` | 热表字段/加载/落盘/召回加权/注入回写/元数据保真 8 处 |

---

## 四、验证（定向，不做全量回归 —— 遵循双项目双计划收口纪律）

- `l17_memory_resonance.test.mjs`：3/3（PEDSA 一跳二跳/抑制边/时序边、访问强化/时间封底/有界重排、真 `buildInjection` 回写 + 存档对称 + 破坏性负控制）
- `l17_vertical_recall_wiring.test.mjs`：3/3（**真跑 `recallMemory`**：共振统计、图种子多跳提权就地改序、模块缺席点名）
- `r17_resonance_heat.test.mjs`：2/2（**真跑 `recall/recallBlock`**：热键同键、跨会话落盘、防全知不回退、索引元数据保真回归锁 + 负控制）
- 防回退：`l16_omniscience_ban` / `l16_vertical_omniscience` / `r16_omniscience_sanitizer` 全绿；相邻既有 `v3109/v3114/v3120/v3150` 抽样全绿。
- 全仓 `node --check` 零语法错误。

---

## 五、下一批次候选（未纳入本期，留待双计划收口后排期）

1. 分层记忆压缩巩固金字塔（提取次数驱动的小总结→折叠→高层，STBME #21 / BAIBAI 森林 L1/L2）。
2. 整合去重 evolution 边（向量 top-1 阈值 0.85 → related 0.7）与睡眠遗忘 `retentionValue` 联动归档。
3. 智能感知前置配额（剧情状态/物品台账变动 → 动态检索配额，ANIMA #28 轻量版）。
4. Agent 双模式编排（一份记忆权威，workflow / agent 两种决策壳）。
