# HUD 机制缝入方案（alewwi/HUD → lonsha-memory-plugin + ruby-phone）

> 用户已授权代码级缝合。按 HUD 源码头声明（AGPL-3.0，要求移植者保留声明并告知来源），
> **凡移植其代码的模块一律保留版权头注释**：`Ported from TavernOS HUD © 2026 alewwi
> (github.com/alewwi/HUD) — AGPL-3.0, see NOTICE-HUD.md`。两仓各补一份 NOTICE-HUD.md。
> 缝合增量各自走一轮抬版：记忆插件 v3.468.0、rubyphone v4.151.0。

## 0. 许可与合规清单
- [ ] 两仓根目录新增 `NOTICE-HUD.md`（来源、范围、AGPL-3.0 义务说明）
- [ ] 每个移植模块头部带来源注释（上面的模板）
- [ ] 记忆插件本轮先收口 v3.467.0 全量门禁，缝合作为下轮抬版增量（不击穿 13119 基线）

## 1. 三个值得缝的机制（按价值排序）

### M1 快照回喂（hud-snapshot 机制）→ 记忆插件
- HUD 做法：旧 HUD 块压成短代码、只把**最后一张快照**回喂模型，其余只留屏上。
- 我们同构面：旧楼层折叠摘要 + 末帧快照。缝入点：把 HUD 块解析出的结构化状态
  （场景/人物/时间）并入**末帧快照**的载荷来源——记忆注入时模型能"接着上次世界状态写"。
- 边界纪律：HUD 块本身从记忆正文**剥离**（它是 UI 状态，不是剧情事实）；
  结构化字段单独走台账映射（见 M3），永不把原始 HUD 文本塞进摘要。

### M2 差分计量（token-budget 机制）→ 记忆插件
- HUD 做法：要量某节占多少 token，把 prompt **重 build 一遍但不含该节**，两次相减。
  （原注释：不能在 build 函数里撒 30 个探针——加一个节就全漂。）
- 我们缝入点：`tools/` 新增 `token_budget_diff.mjs`，用同法量注入简报各节的
  真实开销，供 v3.468.0 的 `injectionBudget` 调优与上界治理引用。自己实现，口径声明来源。

### M3 HUD 块解析与台账映射（hud-parser + schema 机制）→ 双仓桥
- HUD 做法：模型每回复输出 `[HUD]` 块 → `hud-parser` 解析 → `schema.js` 先做
  **别名规范化再补默认值**（防"显示语言键 + 默认键"互相覆盖），缺键补 `'empty'`。
- 记忆插件侧：新增 `hud-block-bridge.js`（零依赖，UMD 尾巴同仓规）：
  ① `stripHudBlocks(text)` — 提取并剥除（进楼层正文管线）；
  ② `mapHudToLedgers(parsed)` — 字段映射进既有台账：
     `Guns`→悬念簿(suspense) / 钱包交易→moneyLedger / `Inv`(inventar)→itemLedger /
     `Trust` 偏移→CSE 信任面 / `T,Wt,Dt`(时间天气)→plotTimeline / `Th`(想法)→思维链侧账。
- rubyphone 侧：**给 `getSceneHudLine()` 补提供方**（现只有消费端 home-screen.js:751，
  一直走「📍当前现场 · 离线感知」兜底）：`lonsha-bridge.js` 挂 `getSceneHudLine`，
  数据源 = 记忆插件末帧快照的场景行（时间/天气/地点/在场人物），只读、缓存浅拷贝
  （对齐 worldaxis `peekCurrentStoryTime` 只读纪律）。

## 2. 实施顺序（双仓并行）
1. 记忆插件：v3.467.0 全量收口（进行中，最后 4 档已全绿，剩全量复跑）
2. 记忆插件 v3.468.0：hud-block-bridge.js + M1 剥离 + M3 映射 + 判据档
   `v3468_hud_bridge.test.mjs`（负控制：剥掉 strip 调用点 → 正文含 [HUD] → 判据红）
3. rubyphone v4.151.0：lonsha-bridge 挂 getSceneHudLine 提供方 + 判据
4. M2 差分计量工具最后做（只进 tools，不动产品面）

## 3. 判据文化约束（两仓一致）
- 读数零手抄；负控制真源码破坏 + 原版对照；不放宽判据换绿；
- `manifest.extra_js` 面随清单自动生长，hud-block-bridge.js 登记走官方重绑脚本。
