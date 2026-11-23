# 记忆工作台：整碗端 LoreCodex 的 UI（决策与接线计划）

> 状态：**stage-1 已落盘**（vendored 副本 + 漂移闸 + 挂载壳）。适配器与 manifest 接线待做。
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

## 3. 落地分三步

**stage-1（已做）**：`ui/vendor/lorecodex/**` 只读副本 + `UPSTREAM.json` 台账 + `tools/verify_lorecodex_vendor.mjs` 漂移闸（已做正反验证：改一个字节就红，复原即绿）+ `ui-mem-workbench.js` 挂载壳（**默认不自动挂载**，`window.LonShaMemWorkbench.open()` 才拉起）。

**stage-2（下一步，只有一件事）**：把 `ui/vendor/lorecodex/js/api.js` 换成适配器，实现同名 20 个导出（形状不变，所以 `main/toc/reader/trace/modals/state` 六个模块一行都不用改）：

| 导出 | 接到本插件哪里 |
|---|---|
| `fetchCorpora` / `fetchCorpusDetail` | 会话列表 + 每个会话的条目数与最近写入 |
| `fetchTreeIndex` | 实体/事件/关系 → arcs+scenes（`order` 取消息楼层）|
| `fetchSceneText` | 条目正文 + 出处消息（楼层、说话人、原话片段）|
| `fetchGrep` | 走本插件现成召回（别名展开 + 关键词/向量混合），不自己扫全文 |
| `fetchRuns` / `runTreeSearch` | 召回轨迹（已有 retrieval-audit / recall-explain 读数）|
| `fetchConfig` / `saveConfig` | 设置页只暴露与本插件有关的几项（其余隐藏）|
| `importCorpus` / `upgradeCorpus` / `exportCorpusLorepack` 等 | stage-2 先返回 `{ unsupported: true }` 并隐藏按钮 |

**stage-3**：把 `ui-mem-workbench.js` 接进 `manifest.extra_js` + 给侧边栏加一个入口；同时补 `extra-js-retirement` / `ui_ratio` 两本账（新增呈现层会让 ui_ratio 读数上升，这是本仓想要的向）。

## 4. 许可与台账纪律

- 副本保留上游 `LICENSE`（MIT）。二次分发时保留版权声明即可，**不需要**把我们的改动回赠上游。
- `UPSTREAM.json` 记 repo / commit / tag / 逐文件 md5 / 未端过来的部分与理由。
- 要改副本的任何文件，必须先把它写进 `UPSTREAM.json` 的 `forks[]`（带 md5 + 为什么 diverge），否则闸会红。
- 上游升级 = 整份重取 + 更新 md5 + 跑闸；不许“手改一点点”就跑。

## 5. 已知风险

1. **语义余量**：壳里到处是“卷/幕/典籍”文案。stage-2 要不就改文案（进 `forks[]`），要不就接受这套词。建议先接受，看一轮真实使用再决定——改文案是最容易把上游 diff 搞脏的动作。
2. **iframe 与宿主隔离**：壳内拿不到酒馆全局；数据必须由 `postMessage` 桥或同源 `localStorage` 传入。上游自己就是 iframe 用法，契约现成。
3. **主题双轨**：壳有自己四套主题，酒馆也有主题。stage-2 只跟随一次系统深浅色即可，不做双向同步。
4. **不要端它的引擎**：`browser_engine.js` / `tree_agent.js` 是另一套检索范式，端进来就是两套记忆同时在线，串味风险比 UI 收益大得多。
