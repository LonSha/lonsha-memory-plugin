# LonSha 记忆引擎

> **产品规划（2026-10-22）**：[第六期18项大更新](PLAN.md)，与另一项目合计36项；仅规划、尚未实施。以连续记忆/生活/创作为主，守卫不独立计项。既有能力及本轮证据见[取证记录](docs/planning/2026-10-22-product-evidence-v6.md)。

为 SillyTavern 打造的记忆与账本引擎。它要解决的不是「记得更多」，而是
**「记错了能被发现」** —— 每次写入都有出处，每条召回都有归因，每个读数都能回源到一次真实计算。

**当前版本**：`3.423.0`（版本四源同步由 `tests/audit/scan_version_guard.mjs` 把守）
**运行形态**：SillyTavern 第三方扩展（`manifest.json` + `index.js`）
**在役面读数**（磁盘枚举，**不代表已实跑**）：`npm test` 当前发现 **420 个测试文件**；`npm test -- --audit` 当前发现 **62/62** 审计脚本（`tests/audit/` 磁盘 **68** 个，6 个 `_` 前缀探针不进门禁扫描面）。逐条由 `tests/audit/scan_doc_truthfulness.mjs` 核回磁盘，不是手抄。
**最近一次全量实跑快照**(`tests/audit/doc_readings.json`,由 `tools/_rebind_doc_readings.py` 消费 `TEST_SUMMARY_JSON` 零手抄写入：v3.355.0 · 334 个测试文件 · 4066 断言 · 0 失败 · 审计 61/61。这就是 **v3.349.0 第四期计划收口点**那一次的读数(`TEST_TIMEOUT=600000 node tests/run.mjs --audit --jobs 3 --audit-jobs 2`:**329/329 文件 · 3935 断言 · 0 失败 · 61/61 审计**;测试段 221.0s + 审计段 106.6s)。上一快照为 v3.348.0 · 328 · 3910 · 61/61(**第四期收口前的最后一版**);再上一份 v3.328.0 · 309 · 3528 · 61/61(**第三期 F 包收口点**);再上一份 v3.318.0 · 299 · 3302 · 61/61(**第二期计划收口点**:优化 M-O1~M-O9 / 拓展 M-X1~M-X9 全部交付);更早 v3.296.0 · 277 · 2986 · 59/59;v3.284.0 · 264 · 2727 · 55/55。两处读数**刻意分开**:合成一条就会把「盘上多了几个文件」写成「整片已通过」。
**全量口径**:`npm test` 全量跑批以分钟计,本仓纪律是**计划收口点才跑一次**(实施期只跑单门 / 单套件,铁律见 `PLAN.md` 门禁纪律节);未登记期间一律标「**全量待验**」。当前版本 v3.423.0 **全量待验**（本版玩家面板重构：FAB 直达玩家主页 + 设置去黑话 + API 前置「常用」页顶，能力零删除；宿主入口零变化，实施期只跑定向门禁与五道 UI 审计，全量待验）；上一版 当前版本 v3.421.0 **全量待验**（v3.421.0 完成 index.js 剥离第十批：证据中心/追踪索引/时间轴/悬念链外提至 engine-evidence-center.js，index.js 降至 12122 行；全套件与门禁通过；实施期按铁律只跑定向门禁，全量待验）；上一版 v3.355.0 **已实跑并登记**（本版新增第六期批次 A 记忆仓侧两项：M6-O1 连续经历重建 `experience-rebuild.js` + M6-O5 双时间经历 `dual-time.js`，并接入 worldProg 持久化三处、两个取库口、两个宿主出口与两行诊断；全量 `TEST_TIMEOUT=600000 node tests/run.mjs --audit --jobs 3 --audit-jobs 2` ⇒ **334/334 文件 · 4066 断言 · 0 失败 · 审计 61/61**；读数由 `tools/_rebind_doc_readings.py` 消费结构化摘要零手抄写入）。上一版 v3.354.0 **全量待验**（本版唯一改动：tests/run.mjs 单文件超时默认 120000ms → 300000ms，v3159 在 7 路并发下单文件实测 103s，120s 不再是安全余量；环境变量覆写口 TEST_TIMEOUT 不变。实施期按铁律只跑定向门禁，全量待验）（第五期第一批四项 M5-O1/M5-O2/M5-O3/M5-O8 + 手机 R5-O9 的清除委托口；实施期按铁律只跑定向判据与定点回归，全量待验）；上一版 v3.349.0 **已实跑并登记**(本版缝入上游 conditionPatch:新内核 `condition-patch.js` + 宿主取库口与两处 hasAny 接线、退路类同形补齐、两处键表恢复六字段共享形态;读数见上段快照。n-1 版 v3.348.0 亦为**已实跑并登记**(第四期计划收口点)。上一版 v3.348.0 **已实跑并登记**(第四期计划收口点的一次全量,读数见上段快照;收口前 v3.329.0~v3.347.0 各版在实施期只跑定向门禁与 v3445 / v3455 专项套件,不跑全量 —— 铁律见 `PLAN.md` 门禁纪律节)。
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
   当版锚点（V4）只认**当版档案**里的一处 `vnum` 锚（字面量形或本档自锚常量形）；
   历史测试只锁**自己的**出生版本 —— V2 与 V4 的旧口径互斥已修（[v3.298.0]）。
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
npm test             # 全部用例：420 个测试文件（在役面，磁盘枚举），各自独立子进程（隔离全局态污染）
npm run test:serial  # 串行执行（排查偶发时的口径）
npm run test:audit   # 带审计面
```
模块位于**根目录**：由 `manifest.json` 的 `extra_js`（243 项）按**文件名**加载，
迁移目录即改变插件分发形态。**新增模块必须同时登记进 `extra_js`**
（由 `tests/audit/scan_module_wiring.mjs` 监控）。
## 目录
```
lonsha-memory-plugin/
├── index.js                  # 主入口（VERSION 唯一锚点 / 事件接线 / 注入汇总）
├── manifest.json             # 插件清单（js / css / extra_js 243 / extra_css 2）
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
├── tests/                # 在役面：420 个测试文件 + 62 个审计脚本（磁盘 68，6 个 `_` 探针除外）
│   └── archived/         # 18 个退役测试（保留历史与理据，不参与跑批）
├── tools/                # 一次性修崩助手（_ 前缀不进门禁扫描面）
└── archive/              # 历史存档（不参与运行时）
    ├── *.md              # 早期 Phase 报告（13 份）
    ├── research/         # 参考项目考察存档（6 份）
    └── rust/             # pagerank.rs + Cargo.toml（未接入）
```

**运行时模块**：244 个（根目录 `.js`，含入口 `index.js`；与 `extra_js`（243 项）是两个口径 —— 后者是分发清单项数）
**载入面**：`index.js` + `extra_js`（243 项）+ CSS 3 项
**在役面**（磁盘枚举，不代表已实跑）：`tests/` 420 个测试文件（`*.test.mjs`，即 `npm test` 的扫描面）/ `tests/audit/` 62 个审计脚本（磁盘 68，6 个 `_` 探针不进门禁扫描面；**现值见行 8**）
**当前版本**：见 `CHANGELOG.md` 顶节（版本四源同步由 `scan_version_guard` 把守）

## 安装

放入 SillyTavern 的 third-party extensions 目录，刷新宿主即可。
插件按 `manifest.json` 自动装载，无需构建步骤、无外部数据库依赖。

## 致谢

本项目站在这几个开源项目的考察基础上（完整考察存档在 `archive/research/`）：

shujuku · ST-BaiBai-Book · yuzuki-Memory · HCDiary · Anima-Memory-System ·
ST-Bionic-Memory-Ecology · TriviumDB

## 许可证

MIT License —— 全文见仓根 [`LICENSE`](LICENSE)（Copyright (c) 2026 LonSha）。

本仓**不含**任何第三方版权代码：根级模块与 `extra_js` 全部为本项目自有实现。
致谢段列出的项目仅作**机制考察**（存档在 `archive/research/`），其源码不在本仓内。

## 发布

版本以 git tag（`v<version>`）与 GitHub Release 发行；Release 附件是该版本的离线运行包，由 `python3 tools/release_zip.py` 现场构建（成员集自 `git ls-files` 派生、排除 `tests/ tools/ docs/ archive/` 等开发面）。

## 反馈

- GitHub Issues: https://github.com/LonSha/lonsha-memory-plugin/issues
- 调试信息：浏览器控制台过滤 `[LonSha记忆引擎]`

---

**Made with ❤️ by LonSha**
