# LonSha 记忆引擎

为 SillyTavern 打造的记忆与账本引擎。它要解决的不是「记得更多」，而是
**「记错了能被发现」** —— 每次写入都有出处，每条召回都有归因，每个读数都能回源到一次真实计算。

**当前版本**：`3.286.0`（版本四源同步由 `tests/audit/scan_version_guard.mjs` 把守）
**运行形态**：SillyTavern 第三方扩展（`manifest.json` + `index.js`）
**在役面读数**（磁盘枚举，**不代表已实跑**）：`npm test` 当前发现 **267 个测试文件**；`npm test -- --audit` 当前发现 **58/58** 审计脚本（`tests/audit/` 磁盘 **61** 个，3 个 `_` 前缀探针不进门禁扫描面）。逐条由 `tests/audit/scan_doc_truthfulness.mjs` 核回磁盘，不是手抄。
**最近一次全量实跑快照**（`tests/audit/doc_readings.json`，由 `tools/_rebind_doc_readings.py` 消费 `TEST_SUMMARY_JSON` 零手抄写入）：v3.284.0 · 264 个测试文件 · 2727 断言 · 0 失败 · 审计 55/55。当前版本 v3.286.0 **全量待验** —— 新增文件进入在役面，但不得冒充已通过（按用户纪律：计划全部内容完成前不跑全量）。两处读数**刻意分开**：合成一条就会把「盘上多了几个文件」写成「整片已通过」。
以下旧口径保留，供追溯这些数字是怎么变的：截至 v3.266.0，`npm test` 为 246 个测试文件 · 0 失败；v3.267.0 起按用户纪律以定向口径复验（新增 `tests/v3267_fakegreen_hygiene.test.mjs` 15/15 与门禁 `tests/audit/scan_fakegreen_hygiene.mjs`，在役面 248 文件 / 54 审计脚本）；v3.268.0（B1 注入质量）249 文件；v3.270.0（B2/X1 注入容量预演）250 文件；v3.271.0（UI 运行时面）**251 文件 / 55 审计脚本**；v3.284.0 恢复全量实跑（264 / 2727 / 55）。

> ⚠️ **本 README 于 v3.255.0 重写。**
> 旧版描述的是早期「Phase 1-9」阶段的形态（标注 v1.1.0，声称 WebGL GPU 渲染、
> WebSocket 实时协作、Firebase/Supabase 云端同步、WebWorker 多线程、Rust WASM 加速、
> OT 操作转换等）。逐词 grep 实测：**这些能力在代码里零命中**，现架构也不走那条路。
> 旧版全文保留在 git 历史里；本版按**磁盘真读数**重写，理由与本仓一贯口径相同 ——
> **给人读的那一处不得与真源脱节**。

## 设计立场

上下文窗口里「记住了什么」通常不可见、不可查、不可回滚。本引擎把这件事拆成**账本**：
写入 → 回读 → 判据三层可对账。每个数都有来源，每个「没读到」与「确实是空」都被判开
（这两者同形是本仓反复付代价的地方）。**看起来没坏但显示不对**，是本层唯一
能挡住、也必须挡住的那一类。

## 工程纪律（本项目的重心）

1. **版本四源同源** —— `index.js` 的 `VERSION` / `manifest.json` / `package.json` /
   `CHANGELOG.md` 顶节，由 `scan_version_guard.mjs`（V1/V6/V7）把守。
   抬版漏了发布面 ⇒ 用户看到的是上一版的说明。
2. **文档不得说谎** —— `TODO.md` 的「最近更新」必须等于当前版本（同一门 V7）；
   `CHANGELOG.md` 顶节必须就是当前版本（V6）。
3. **判据不许押在别人的进度上** —— 跨仓声明必须对账；缺口要登记成**台账**并**双向闭合**
   （有分歧无理由 ⇒ 报；有理由无分歧 ⇒ **也报**，登记着不存在的分歧就是掩饰）。
4. **退役不是删除** —— `tests/archived/` 保留 18 个退役测试的 git 历史与退役理据，
   `run.mjs` 按目录发现且**不递归**，故退役即出扫描面。退役面对外**哈希冻结**，
   防止「退役」变成「悄悄改判据」。
5. **派生数交给机器** —— 凡「套件 N 条」这类会随代码增长而腐坏的数字，由脚本单向回写
   （以判据文件真读数为准），不手抄。

## 运行与验证

```bash
npm test             # 全部用例：267 个测试文件（在役面，磁盘枚举），各自独立子进程（隔离全局态污染）
npm run test:serial  # 串行执行（排查偶发时的口径）
npm run test:audit   # 带审计面
```

模块位于**根目录**：由 `manifest.json` 的 `extra_js`（79 项）按**文件名**加载，
迁移目录即改变插件分发形态。**新增模块必须同时登记进 `extra_js`**
（由 `tests/audit/scan_module_wiring.mjs` 监控）。

## 目录

```
lonsha-memory-plugin/
├── index.js                  # 主入口（VERSION 唯一锚点 / 事件接线 / 注入汇总）
├── manifest.json             # 插件清单（js / css / extra_js 79 / extra_css 2）
├── package.json              # 版本源之一（不参与运行时加载）
├── style.css | lonsha-design.css | visualizer.css
│
├── ── 账本族（写入 → 回读 → 判据） ──
├── commitment-ledger.js  cost-ledger.js    coverage-ledger.js  echo-ledger.js
├── floor-ledger.js       ledger-entity.js  ledger-replay.js    parallel-ledger.js
├── secret-ledger.js      seed-ledger.js    cache-identity.js   cache-workload.js
│
├── ── 召回与注入 ──
├── injection-router.js   unified-recall.js recall-artifact.js  recall-echo.js
├── ai-select.js          smart-trigger.js  retrieval-audit.js  text-chunk.js
├── fuzzy-patch.js        scene-book.js
│
├── ── 图谱与关系 ──
├── graph_algorithms.js   knowledge-network.js  crosslink.js      entity-semantic.js
├── relation-disclosure.js relation-mutual.js   npc-ties.js
│
├── ── 时间与世界 ──
├── world-clock-reader.js world-ledger-reader.js story-clock-parse.js event-chain.js
├── event-completeness.js  narrative-pulse.js
│
├── ── 事实与版本 ──
├── fact-version.js       memory-supersede.js memory-type.js      age-anchor.js
├── changeset.js          canonical-stringify.js  summary-provenance.js
│
├── ── 快照与迁移 ──
├── snapshot-checkpoint.js schema-migration.js module-registry.js  dependency-closure.js
├── public-interface.js
│
├── ── 流水线 ──
├── projection-pipeline.js step-pipeline.js   turn-reconciler.js  extraction-cadence.js
├── sleep-awaken.js       archive-shift.js   branch-guard.js     stale-guard.js
├── repair-loop.js        floor-range.js     cost-forecast.js
│
├── ── 存储与桥接 ──
├── stm-ltm.js            api-channels.js    model-response.js   loose-json.js
├── cse-engine.js         node-rollup.js     evidence-workbench.js task-inbox.js
│
├── ── 协议与传输（v3.260.0 缝合 shujuku） ──
├── native-tools.js       pristine-fetch.js
│
├── ── 身份与体检（v3.261.0 缝合 MyriadKnots） ──
├── floor-identity.js     archive-audit.js
│
├── ── A1 内核外移模块（index.js 瘦身刀口） ──
├── memory-ledgers.js     memory-aux.js          narrative-generators.js
├── memory-books.js       memory-organs.js       memory-core.js       memory-config.js
│
├── ── UI 与打包 ──
├── settings-ui.js        modules_combined.js
│
├── tests/                # 在役面：267 个测试文件 + 58 个审计脚本（磁盘 61，3 个 `_` 探针除外）
│   └── archived/         # 18 个退役测试（保留历史与理据，不参与跑批）
├── tools/                # 一次性修崩助手（_ 前缀不进门禁扫描面）
└── archive/              # 历史存档（不参与运行时）
    ├── *.md              # 早期 Phase 报告（13 份）
    ├── research/         # 参考项目考察存档（6 份）
    └── rust/             # pagerank.rs + Cargo.toml（未接入）
```

**运行时模块**：80 个（根目录 `.js`，含入口 `index.js`）
**载入面**：`index.js` + `extra_js` 79 项 + CSS 3 项
**在役面**（磁盘枚举，不代表已实跑）：`tests/` 267 个测试文件（`*.test.mjs`，即 `npm test` 的扫描面）/ `tests/audit/` 58 个审计脚本（磁盘 61，3 个 `_` 探针不进门禁扫描面）
**当前版本**：见 `CHANGELOG.md` 顶节（版本四源同步由 `scan_version_guard` 把守）

## 安装

放入 SillyTavern 的 third-party extensions 目录，刷新宿主即可。
插件按 `manifest.json` 自动装载，无需构建步骤、无外部数据库依赖。

## 致谢

本项目站在这几个开源项目的考察基础上（完整考察存档在 `archive/research/`）：

shujuku · ST-BaiBai-Book · yuzuki-Memory · HCDiary · Anima-Memory-System ·
ST-Bionic-Memory-Ecology · TriviumDB

## 许可证

MIT License

## 反馈

- GitHub Issues: https://github.com/LonSha/lonsha-memory-plugin/issues
- 调试信息：浏览器控制台过滤 `[LonSha记忆引擎]`

---

**Made with ❤️ by LonSha**
