# 记忆工作台：整碗端 LoreCodex 的 UI（决策与接线计划）

> 状态：**stage-1 + stage-2 已落盘**（vendored 副本 + 漂移闸 + 挂载壳 + 21 个导出的数据面适配器 + 14 条判据）。
> 只剩 stage-3（把挂载壳接进 `manifest.extra_js` 与侧边栏入口）。
> 上游：`lena13144/lorecodex` v2.4.0（commit `d1a921e`），MIT。

## 1. 为什么是“端过来”而不是“重画”

| 口径 | 自建一套工作台 | 端 LoreCodex UI |
|---|---|---|
| 代码量 | 三栏布局 + 主题 + 轨迹台 + 移动端，保守 4000+ 行 | 0 行自写（副本 5815 行，含 CSS）|
| 依赖 | 要自己选框架/构建 | 纯静态 HTML/CSS/ESM，无构建、无框架 |
| 主题 | 要自己设计 | 四套现成（素笺/墨灯/净台/曜夜）|
| 改造成本 | 一次性的全部 | 一个适配器文件（20 个导出）+ 若干文案 |
| 许可 | — | MIT（保留 LICENSE + 上游台账即可）|

结论：UI 整碗端；**引擎一行不端**（它的树检索/建目录与我们的向量+图谱+页阶是两套东西）。

## 2. 为什么范式对得上（不只是“好看”）

| LoreCodex 概念 | 本插件对应物 | 复用度 |
|---|---|---|
| corpus（书库）| 会话记忆库（每聊天一个）| 高 |
| series → arc（卷 → 篇）| 记忆分组 → 条目组（人物 / 事件 / 关系 / 时间线）| 高 |
| scene（幕）| 一条记忆条目（含摘要与出处）| 高 |
| `scene.order` | 消息楼层号 | 高 |
| 防剧透 `maxOrder` | “只召回当前楼层之前的记忆” | **白送**：口径本就是楼层锁 |
| `aliases` 别名展开 | 人物别名表（已有）| 高 |
| `[CAMEO]` 未署名登场 | “被提到但没登记的人物” | 中（需我们去重）|
| 检索轨迹 trace | 召回轨迹/注入回执（已有 ledger）| 高 |

## 3. 落地分三步（stage-1 / stage-2 已完成，stage-3 未完）

**stage-1（已做）**：`ui/vendor/lorecodex/**` 只读副本 + `UPSTREAM.json` 台账 + `tools/verify_lorecodex_vendor.mjs` 漂移闸（已做正反验证：改一个字节就红，复原即绿）+ `ui-mem-workbench.js` 挂载壳（**默认不自动挂载**，`window.LonShaMemWorkbench.open()` 才拉起）。

**stage-2（已做）**：不改上游任何 JS 字节，用 `ui/vendor/lorecodex/index.html` 里的一段 **importmap** 把 `"./js/api.js"`
这个说明符整份重定向到 `ui/mem-workbench-api.js`（660 行 / **21 个同名同形只读导出**）—— 上游 `main/toc/reader/trace/modals/state`
六个模块一行未改。唯一被改的 `index.html` 登记进 `UPSTREAM.json` 的 `forks[]`（fork 后 md5 + 上游原 md5 + 注入位置 + 升级重贴法）。

| 导出 | 实际接到什么（不是计划，是已实现）|
|---|---|
| `fetchHealth` / `fetchCorpora` / `fetchCorpusDetail` | 当前会话一个库；`stats` 的每个数当场从 `engine.graph.nodes` 数出来 |
| `fetchTreeIndex` | 卷=条目类型、篇=楼层段（每 100 楼）、幕=一条图谱节点；`stats.hidden_by_order` 单列「被楼层锁挡下的条数」 |
| `fetchSceneText` | 节点的结构化全文（name/楼层/时间/地点/描述/正文/状态变更 + 未认领字段逐条列出）；`maxOrder` 拦下时报 `spoiler gate` |
| `fetchGrep` | 现场扫节点文本：**AND 语义** + 命中计数 + 命中片段，报 `scanned` 与当前楼层口径 |
| `fetchRuns` / `runTreeSearch` | 工作台**自己**的检索记录（最多 30 条，localStorage）；检索是关键词覆盖加权直扫，**不是 LLM 逐轮翻书** |
| `fetchConfig` | 只读引擎的三个开关读数；`saveConfig` 拒绝 |
| `importCorpus` / `upgradeCorpus` / `exportCorpusLorepack` / `deleteCorpus` / `previewLocalImportFile` / `saveCorpusConfig` | **明确抛「只读视图」错误**（不静默成功）|

判据 `tests/ui-workbench-adapter.test.mjs` 14 条全绿，三条反向验证实测过（去掉 maxOrder → C1/C2 红；`fetchGrep` 改名 → A1/D1 红；importmap 改指不存在文件 → F1/F2 红）。

**stage-2 自己抓到的真缺陷**（记下来，因为它是同源 iframe 这类接法里最容易重犯的一次）：
首轮判据 6 红、`arcs=0`，根因不是映射写错，而是 `bag instanceof Map` —— 工作台在同源 iframe 里读父窗口的 Map 时，
那对象属于**父 realm**，子 realm 的 `instanceof` **不认**，于是 `Object.keys(map)` 得空数组、一个节点都读不到，
而产品表现是「工作台打开了、目录空的、不报错」。修法：按形状认（`typeof bag.values === 'function'`），不按构造器身份认。

**stage-3**：把 `ui-mem-workbench.js` 接进 `manifest.extra_js` + 给侧边栏加一个入口；同时补 `extra-js-retirement` / `ui_ratio` 两本账（新增呈现层会让 ui_ratio 读数上升，这是本仓想要的向）。

## 4. 许可与台账纪律

- 副本保留上游 `LICENSE`（MIT）。二次分发时保留版权声明即可，**不需要**把我们的改动回赠上游。
- `UPSTREAM.json` 记 repo / commit / tag / 逐文件 md5 / 未端过来的部分与理由。
- 要改副本的任何文件，必须先把它写进 `UPSTREAM.json` 的 `forks[]`（带 md5 + 为什么 diverge），否则闸会红。
- 上游升级 = 整份重取 + 更新 md5 + 跑闸；不许“手改一点点”就跑。

## 5. 已知风险

1. **语义余量**：壳里到处是“卷/幕/典籍”文案。stage-2 要不就改文案（进 `forks[]`），要不就接受这套词。建议先接受，看一轮真实使用再决定——改文案是最容易把上游 diff 搞脏的动作。
2. **iframe 与宿主隔离（stage-2 更正）**：壳与酒馆页面**同源**，所以壳内可以直接读 `window.parent.LonShaMemory`，
   **不需要 postMessage 桥，也不需要把数据写进 localStorage 绕一圈**。代价是跨 realm 的坑：`instanceof` 在
   两个 realm 之间不可靠（Map 那次就是栽在这里），凡按「构造器身份」判类型的写法一律改成按形状判。
3. **主题双轨**：壳有自己四套主题，酒馆也有主题。stage-2 只跟随一次系统深浅色即可，不做双向同步。
4. **不要端它的引擎**：`browser_engine.js` / `tree_agent.js` 是另一套检索范式，端进来就是两套记忆同时在线，串味风险比 UI 收益大得多。
