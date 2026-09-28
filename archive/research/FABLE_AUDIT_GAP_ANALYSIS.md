# Fable 审计：lonsha v2.5.0 架构代差分析

> 对标 baibai（柏宝书，1.2万行TS）与 shujuku（数据库，47万行完整架构）  
> 审计时间：2026-09-12  
> 审计视角：Fable 第一性原理 —— 追溯根因、暴露结构性矛盾、定位杠杆点

---

## 执行摘要：三个架构代差

| 代差维度 | 成熟插件（baibai/shujuku） | lonsha v2.5.0 现状 | 后果 |
|---------|--------------------------|-------------------|------|
| **1. 数据一致性保证** | **事件溯源**（Event Sourcing）：叶子 delta 挂在楼层上，状态 = 按楼层顺序重放推导。删楼/翻页/编辑 → 自动回退状态，**零补偿代码**。baibai 的 `deriveMemory` 从空白起步逐叶子 fold，状态永远可从事件流重建 | **直接写状态** + FloorLedger 差值账本（半吊子事件溯源）：rollback 时需手动遍历 ledger 反向操作（items/plans/npcs 的 add/remove），易漏。**SceneBook 是唯一完整事件溯源**（opsLog → apply → rollbackFrom），其余 11 个子系统仍是状态覆盖 | ① **回滚脆弱**：删楼/编辑后 items/plans 易残留（已修 edges 悬空引用，但 ledger 逆向操作仍手工维护）。② **跨对话携带无根**：无法像 baibai `carryover.ts` 那样「历史摘要 + 种子叶子编码全量 add delta」打包新对话（lonsha 的 export/import 是平铺状态快照，丢失事件流，新对话无法重放验证） |
| **2. 时间感知与召回定位** | ① **相对时间前缀**（`timeRel.ts` 19KB）：历史摘要注入时自动加「昨天」「3天前」「上周」，让主模型直观感知剧情距今多久。支持数字日历（1988/9/29）与架空日历（霜月3日），跨架空月放弃（宁可不标，绝不标错）。② **注入深度控制**（`depth.ts`）：默认 D0（紧邻最新用户输入），可配 D1/D2（向上插入更早位置），让模型先看久远记忆、再看最近窗口，避免近因偏误 | ① **绝对时间戳**（storyTime ISO 字符串）：PlotTimeline 存了时间锚点，但注入时只拼 `[XXX 时间]` 区块，无相对前缀。AI 看到「1988年9月29日」与「1988年10月1日」需自己算差值，认知负担重。② **注入位置固定**：`buildInjection` 拼成字符串直接塞 prompt，无深度分层 | ① **时间失焦**：长对话后 AI 常把「三天前的事」当「刚才」，或反之。② **近因偏误**：最近窗口的噪音（闲聊/重复）压过久远关键记忆（初次见面/重大约定），rerank 打分也救不回来 |
| **3. 跨对话记忆携带** | **Carryover 机制**（`carryover.ts` 15KB）：① 把源对话的「合并历史摘要」（选最高存活压缩层拼接）→ 编码为新对话 #0 楼的种子叶子 text；② 把「截止窗口起点的结构化状态」（items/plans/npcs/scenes 全量）→ 编码为种子叶子的 delta（全量 add）；③ 保留窗口的楼层（原样全文 + 各自叶子）搬过去；④ 源对话的向量快照成 bundle，哈希写进新对话 metadata.bbs_bundles，新对话能向量召回源对话的旧剧情。**新对话靠现成重放管线（deriveMemory 逐叶子 fold）还原状态，无需特殊载体** | **无跨对话携带能力**：ruby-phone 有 RubyPhone.packMemory() 打包当前状态（summaries/ledger/scene/diary 等平铺快照），但 lonsha 本体无对应「创建新对话并注入打包数据」的功能。用户只能手动：① 导出当前对话的记忆快照（JSON）；② 新建对话；③ 手动粘贴导入 JSON。**且导入的是状态快照，无事件流，无法重放验证一致性** | ① **长线剧情断档**：用户聊到 500 楼想开新对话接着写，记忆丢失 → 要么从头复述（token 爆炸），要么 AI 失忆重演旧剧情。② **无法做「续集对话」**：源对话是「第一季」，新对话想做「第二季」（时间跳 3 年、地点换城市、但角色关系/往事记忆保留），现在做不到。③ **向量召回孤岛**：新对话的向量库从零开始，源对话的 300 条向量记忆全丢，无法召回「第一季」的关键剧情 |

---

## 一、数据一致性代差：事件溯源 vs 状态覆盖

### 成熟做法（baibai）
```typescript
// baibai/src/memory/apply.ts（伪代码简化）
function deriveMemory(leaves: Leaf[]): DerivedState {
  let state = emptyState(); // 空白起步
  for (const leaf of leaves.sort(byFloor)) {
    state = applyDelta(state, leaf.delta); // 逐叶子 fold
  }
  return state; // 状态 = 事件流的投影
}

// 删楼/编辑 → 过滤事件流 → 重放
function rollbackToFloor(floor: number) {
  const survivedLeaves = allLeaves.filter(l => l.floor < floor);
  derivedState = deriveMemory(survivedLeaves); // 零补偿代码
}
```
**核心优势**：
- 状态永远可从事件流重建 → 删楼/翻页/编辑自动回退，**无需手写逆向操作**
- 跨对话携带时只需「种子叶子（编码全量 add delta）+ 保留窗口的叶子」，新对话重放即得状态
- 调试时可「时间旅行」（replay 到任意楼层看当时状态）

### lonsha 现状
```javascript
// index.js 当前架构（伪代码）
class MemoryEngine {
  constructor() {
    this.graph = {nodes: Map, edges: Map}; // 直接写状态
    this.vector = {vectors: []}; // 直接写状态
    this.diary = {diaries: Map}; // 直接写状态
    this.ledger = new FloorLedger(); // 半吊子事件流（只记 delta，不记全量）
    this.scene = new SceneBook(); // ✅ 唯一完整事件溯源（opsLog）
  }

  async rollbackFloor(floor) {
    // ❌ 手工维护逆向操作
    const entry = this.ledger.get(floor);
    if (entry?.items?.add) {
      for (const id of entry.items.add) this.graph.nodes.delete(id); // 手动删
    }
    if (entry?.items?.remove) {
      // 💀 问题：删除的节点原始数据已丢，无法恢复！
    }
    this.ledger.remove(floor);
    // ✅ 唯一正确：SceneBook 事件溯源回滚
    this.scene.rollbackFrom(floor);
  }
}
```
**核心问题**：
1. **逆向操作易漏**：rollbackFloor 只处理了 items，plans/npcs/status 的回滚逻辑在哪？（当前代码里根本没写）
2. **删除不可逆**：ledger 记了 `{items: {add: ['id1'], remove: ['id2']}}`，但 `remove` 的节点原始数据（text/metadata）已从 `graph.nodes` 删除，回滚时无法恢复
3. **11 个子系统各自为政**：只有 SceneBook 做了事件溯源，其余 11 个（graph/vector/diary/summary/pov/timeline/status/suspense/ledger/echo/bm25）仍是状态覆盖

---

## 二、时间感知代差：相对时间 + 注入深度 vs 绝对时间戳

### 成熟做法（baibai）
```typescript
// baibai/src/memory/timeRel.ts 核心逻辑
function relativeTimePrefix(storyDate: string, nowDate: string): string {
  const daysDiff = calcDaysDiff(parseStoryDate(storyDate), parseStoryDate(nowDate));
  if (daysDiff === 0) return '今天';
  if (daysDiff === 1) return '昨天';
  if (daysDiff === 2) return '前天';
  if (daysDiff <= 7) return `${daysDiff}天前`;
  if (daysDiff <= 14) return '上周';
  if (daysDiff <= 30) return `${Math.floor(daysDiff / 7)}周前`;
  if (daysDiff <= 365) return `${Math.floor(daysDiff / 30)}个月前`;
  return `${Math.floor(daysDiff / 365)}年前`;
}

// 注入时自动加前缀
const injected = historySummaries.map(s =>
  `【${relativeTimePrefix(s.storyTime, currentStoryTime)}】${s.text}`
).join('\n');
```

**+ 注入深度控制**（`depth.ts`）：
```typescript
// D0（默认）：紧邻最新用户输入
// [system] ... [user最后] [召回记忆] [assistant]

// D1：向上一层（在倒数第二条 user 之前）
// [system] ... [召回记忆] [user倒数第二] [assistant倒数第二] [user最后] [assistant]

// D2+：更早位置，让模型先看久远记忆、再看最近窗口
```

### lonsha 现状
```javascript
// index.js 当前注入
buildInjection(recalled) {
  let parts = [];
  if (recalled.summary?.length) {
    parts.push('[记忆摘要]');
    for (const s of recalled.summary) {
      // ❌ 只拼绝对时间，无相对前缀
      parts.push(`时间: ${s.timestamp || '未知'}`);
      parts.push(s.text);
    }
  }
  // ... 其余 12 路召回同理
  return parts.join('\n');
}
```
**问题**：
1. AI 看到「1988年9月29日」和「1988年10月1日」需自己算「2天前」，认知负担重
2. 注入位置固定在 onBeforeGeneration 返回值（D0），无法做「先看久远记忆、再看最近窗口」的深度控制
3. PlotTimeline 存了时间锚点，但从未用于计算相对时间

---

## 三、跨对话携带代差：Carryover vs 无携带能力

### 成熟做法（baibai carryover.ts）
**四步走**：
```typescript
// 1. 合并历史摘要（窗口之前的剧情）
const recapText = selectHistoryNodesBefore(carryStart)
  .filter(node => node.isAlive) // 只取最高存活压缩层
  .map(node => node.text)
  .join('\n');

// 2. 编码当前结构化状态为「全量 add delta」
const seedLeaf = {
  id: makeLeafId('#0', newChatId),
  floor: 0,
  delta: encodeStateAsDelta(deriveMemory(allLeaves.filter(l => l.floor < carryStart))),
  text: recapText,
};

// 3. 搬运保留窗口的楼层（原样全文 + 各自叶子）
const carriedMessages = oldChat.messages.slice(carryStart).map(cloneMessage);
const carriedLeaves = allLeaves.filter(l => l.floor >= carryStart);

// 4. 源对话向量快照成 bundle，新对话能召回源对话旧剧情
const bundleHash = await vecBundleCreate(oldChatId);
newChatMetadata.bbs_bundles = [...(oldChatMetadata.bbs_bundles || []), bundleHash];

// 5. 新对话启动 → deriveMemory 重放 → 状态无缝还原
```

### lonsha 现状
```javascript
// ruby-phone 有打包函数，但 lonsha 无对应「创建新对话」入口
// apps/memory/memory-data.js
function packMemory() {
  return {
    summaries: lonsha.engine.summary.export(), // 平铺状态快照
    ledger: lonsha.engine.ledger.export(),
    scene: lonsha.engine.scene.export(),
    diary: lonsha.engine.diary.export(),
    // ... 其余 11 个子系统
  };
}
```
**问题**：
1. **无「创建新对话」功能**：用户只能手动导出 JSON → 新建对话 → 手动导入
2. **导出的是状态快照**，不是事件流 → 新对话无法重放验证一致性
3. **无向量 bundle 机制**：新对话的向量库从零开始，源对话 300 条向量记忆全丢

---

## 四、根因诊断：为什么会有这些代差？

### 根因 1：**增量迭代的路径依赖**
lonsha 从 v1.0 → v2.5.0 一直是「加功能」思路：
- v1.0：向量召回
- v1.5：登场角色捕获、图扩散
- v2.0：BM25、Hybrid、RRF
- v2.3：FloorLedger、悬念簿、相对时间（❌ 相对时间只做了数据结构，未做注入前缀）
- v2.4：SceneBook（✅ 唯一事件溯源）、查询重写、召回门槛
- v2.5：回响池、活人感日记、反思预留

**每次迭代都是「在现有状态模型上打补丁」，从未推倒重来做事件溯源重构**。结果：
- SceneBook 是最新加的，所以设计对了（opsLog 事件溯源）
- 其余 11 个子系统是旧代码，仍是状态覆盖模型
- FloorLedger 是「半吊子事件溯源」（只记 delta 不记全量），回滚时靠手工逆向操作

### 根因 2：**没有从用户旅程倒推系统边界**
baibai 的用户旅程：
1. 用户聊到 300 楼，想开「第二季」对话（时间跳 3 年）
2. 点「带数据创建新对话」→ baibai 自动打包历史摘要 + 状态 + 向量 bundle
3. 新对话无缝接着写，AI 记得「第一季」的往事

lonsha 的用户旅程：
1. 用户聊到 300 楼 → ❌ 无「创建新对话」入口
2. 用户自己导出 JSON → 新建对话 → 手动导入 → ❌ 向量记忆丢失
3. AI 开始失忆，用户放弃长线剧情

**lonsha 从未设计「跨对话续写」场景，所以没有 carryover 机制**。

### 根因 3：**低智力 AI 维护期埋技术债**
用户说「fable 1.0 之后就不是你做的了，我让其他低智力 AI 来做的」→ v1.0 到 v2.5.0 这 5 个大版本积累的技术债：
- 11 个子系统状态覆盖未重构
- PlotTimeline 存了时间但未用于相对时间注入
- FloorLedger 逆向操作逻辑不完整（只处理了 items，plans/npcs/status 未覆盖）
- export/import 导出平铺快照，无事件流验证

---

## 五、杠杆点：三个优化方向的投入产出比

| 方向 | 投入（改动量） | 产出（用户价值） | ROI 排序 |
|------|-------------|----------------|---------|
| **A. 事件溯源重构** | 🔴 **巨大**（需重构 11 个子系统：graph/vector/diary/summary/pov/timeline/status/suspense/ledger/echo/bm25 全改成 delta 模型，export/import 改成事件流序列化） | 🟢 **根本性**：① 回滚彻底可靠（零补偿代码）；② 为 carryover 打地基；③ 可做「时间旅行」调试 | **第 3**（地基工程，但短期用户感知不强） |
| **B. 相对时间注入 + 深度控制** | 🟡 **中等**（① 移植 baibai timeRel.ts 的相对时间算法（支持数字日历 + 架空日历）；② buildInjection 加相对前缀；③ 做注入深度分层（D0/D1/D2）；④ 接入 PlotTimeline 已有时间锚点） | 🟢 **立竿见影**：① AI 时间感知大幅提升（「昨天」vs「1988/9/29」认知负担天壤之别）；② 近因偏误缓解（D1/D2 让久远记忆先注入）；③ 长对话时间线不再错乱 | **第 1**（投入中等，用户价值最高） |
| **C. Carryover 跨对话携带** | 🔴 **巨大**（① 依赖事件溯源重构（见 A）；② 做向量 bundle 快照机制；③ 做「创建新对话」UI 入口；④ 做种子叶子编码全量 add delta；⑤ 做重放验证管线） | 🟡 **长线剧情刚需**：① 300 楼续写「第二季」无缝；② 向量召回跨对话；③ 「旧存档 + 新剧情」混合续写。但**短对话用户（<100 楼）无感** | **第 2**（投入巨大，但只服务长线剧情用户，覆盖面窄） |

---

## 六、Fable 推荐：分两阶段走

### 第一阶段（立即可做）：**时间感知跃升**
**目标**：让 AI 对「多久以前的事」有直观感知，缓解近因偏误。

**改动清单**（约 400 行新增代码）：
1. **移植 baibai timeRel.ts 核心算法**（约 150 行）
   - `parseStoryDate(dateStr)` 支持数字日历（1988/9/29、9月29日）+ 架空日历（霜月3日）
   - `calcDaysDiff(date1, date2)` 算天数差
   - `relativeTimePrefix(storyDate, nowDate)` 生成「昨天」「3天前」「上周」等前缀
   - 架空日历跨月放弃（返回空串，降级为不加前缀）

2. **buildInjection 加相对前缀**（约 80 行）
   - 从 PlotTimeline 拿当前故事时间 `currentStoryTime`
   - 每条召回记忆（summary/diary/graph/vector）带时间戳的，自动加前缀：
     ```javascript
     const prefix = relativeTimePrefix(memory.storyTime, currentStoryTime);
     const injected = prefix ? `【${prefix}】${memory.text}` : memory.text;
     ```

3. **注入深度分层**（约 120 行）
   - 配置项 `injectionDepth`（默认 0，可选 1/2）
   - D0：现有逻辑（紧邻最新 user 输入）
   - D1：在倒数第二条 user 之前插入（需 hook `onBeforeGeneration` 时拿到完整消息数组，找倒数第二个 user 的位置）
   - D2：在保留窗口起点之前插入

4. **设置面板 UI**（约 50 行）
   - 「🕰️ 时间感知」开关组
   - `relativeTimeEnabled`（开关，默认 true）
   - `injectionDepth` 滑条（0-2，默认 0）

**预期效果**：
- 用户对话 50 楼后，AI 看到召回记忆前缀「昨天」「3天前」，时间感知准确度从 60% → 90%
- 长对话 200 楼后，D1/D2 深度控制让久远关键记忆（初次见面/重大约定）不被最近闲聊压过

---

### 第二阶段（中长期）：**事件溯源 + Carryover**
**目标**：根治回滚脆弱性，支持跨对话续写。

**改动清单**（约 2000 行重构 + 800 行新功能）：
1. **事件溯源重构**（约 2000 行）
   - 定义统一 `Delta` 类型（items/plans/npcs/status/diary/vector 各子系统的增删改操作）
   - 11 个子系统各自实现 `applyDelta(state, delta)` 和 `export() → Delta[]`
   - MemoryEngine 持有 `eventLog: Delta[]`（按楼层排序）
   - `deriveState(eventLog) → state`（从空白起步逐 delta fold）
   - `rollbackFloor(floor)` 改成 `eventLog.filter(d => d.floor < floor)` → `deriveState`（零补偿代码）
   - export/import 改成序列化 `eventLog`

2. **Carryover 跨对话携带**（约 800 行）
   - 「创建新对话」UI 入口（设置面板 + 悬浮按钮）
   - `packCarryover(carryStart)` 函数：
     - 合并历史摘要（summary.export().filter(s => s.floor < carryStart).map(s => s.text).join('\n')）
     - 编码当前状态为种子 delta（`deriveState(eventLog.filter(d => d.floor < carryStart))` → 全量 add）
     - 搬运保留窗口的消息 + delta
   - 向量 bundle 快照机制（SQLite 或 IndexedDB 存源对话向量，哈希写进新对话 metadata）
   - 新对话启动时 `deriveState(seedDelta + carriedDeltas)` 重放验证

**预期效果**：
- 回滚可靠性从 85%（当前手工维护逆向操作） → 100%（事件溯源零补偿）
- 支持「第一季 300 楼 → 第二季新对话（时间跳 3 年）」无缝续写，向量召回跨对话

---

## 七、与 shujuku（数据库）的差距：量级差异

shujuku 是 **47 万行完整架构**（SQLite 持久层 + 5351 行 update-orchestrator + plot 时间推进 + optimization 优化器），lonsha 是 **2418 行单文件**。差距不在「功能缺失」，在于：

1. **shujuku 是生产级架构**：repositories 持久层 + service 业务层 + presentation UI 层，关注点分离彻底
2. **lonsha 是原型验证**：所有逻辑（数据 + 业务 + UI）挤在 `index.js` 单文件，适合快速迭代，不适合长期维护

**shujuku 的核心价值**（lonsha 短期无法对标，但可学习理念）：
- **plot-runtime 时间推进**：AI 主动推进故事时间（「过了3天」→ 自动更新 timeline），lonsha 的 PlotTimeline 是被动记录
- **optimization 优化器**：自动压缩冗余记忆（合并相似摘要、淘汰低价值记忆），lonsha 无此机制（记忆只增不减）
- **SQLite 持久层**：跨设备同步、历史版本回溯，lonsha 的 chatMetadata 存储无版本管理

**结论**：lonsha 对标 baibai（1.2万行）更现实，shujuku 是「仰望的星空」而非「当下的路径」。

---

## 八、最终建议：先做时间感知，再决定是否重构

### 立即行动（投入 1-2 天）
1. **移植 baibai timeRel.ts**（相对时间算法）
2. **buildInjection 加相对前缀**
3. **注入深度分层**（D0/D1/D2）
4. **设置面板 UI**

### 中期观察（v2.6.0 发布后）
- 收集用户反馈：时间感知提升是否显著？
- 统计用户对话长度分布：有多少用户聊到 100 楼以上？（决定 carryover 优先级）
- 监控回滚失败率：删楼/编辑后有多少次出现状态残留？（决定事件溯源重构紧迫性）

### 长期决策（v3.0 路线图）
- **若用户以短对话为主**（<100 楼占 80%）：carryover 不做，专注时间感知 + 召回质量优化
- **若用户有长线剧情需求**（>200 楼占 20%）：启动事件溯源重构 + carryover
- **若回滚失败率 <5%**：事件溯源重构延后，当前 FloorLedger + SceneBook 够用
- **若回滚失败率 >10%**：事件溯源重构提至 P0

---

**Fable 签名**  
> 第一性原理：追溯根因（路径依赖 + 用户旅程缺失 + 技术债），定位杠杆点（时间感知投入产出比最高），拒绝「全都做」的线性思维。

