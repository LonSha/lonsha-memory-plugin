# 第二十六期路线图 · LonSha 记忆插件（L26-O1~O9 / L26-X1~X9）

> **状态：十八项已于 2026-11-20 / v3.475.0 交付（登记见 §5）；仍非现行排序 —— 现行是第二十四期。**
> 本期按用户指令「把第二十六期内容也做完」提前落地（越过 L24/L25 排序）——这是排期上的例外，不是把前两期判为已交付。
> 本期建立在 L25「真删除 + 落界 + 基准台」完成之上。没有 `L25-X5` 基准台，本期的任何「更好」都无法成立。

## 0. 本期判断：从「记得住」到「说得清、带得走」

L21~L25 把「记得准、取得快、看得见、删得掉」补齐之后，剩下的问题不在引擎内部，而在**边界**：

1. **与宿主的关系没有契约**：SillyTavern 版本一动，哪些能力可用、哪些要降级，今天靠试。
2. **与另一仓的关系没有契约**：`ruby-phone` 那边也在记同一段对话（R26-X2），两边各记一份、互不知情。
3. **与以后的关系没有契约**：408 个 `extra_js` 是资产也是负债，没有「哪些可以退役」的机制。

本期两件事：**兼容矩阵**（对宿主）+ **可携与互通**（对用户与另一仓）。

## 1. 优化九项（L26-O1~O9）

| 编号 | 项 | 为什么它是最缺的（带状态） | 验收口径 |
|---|---|---|---|
| O1 | 宿主兼容矩阵 | 能力与宿主版本无对照表，装错版本只能试错 `【待复核】` | 矩阵逐格标注「可用/降级/不可用」；不可用项**明确拒载**并说原因 |
| O2 | 加载瘦身与退役机制 | `manifest.extra_js` 408 项全量加载 `【实读文档读数】`；无「谁能退役」判据 | 给出可退役候选与理由；退役后判据全绿；退役清单可回滚 |
| O3 | 检索质量回归 | 依赖 `L25-X5` 基准台，本期内做**跨版本回归** | 连续版本趋势可看；退步超阈值即拦（作为发布前置，不计入本期名额） |
| O4 | 日志分级与采样 | 现有输出无级别，出问题只能翻全量 `【待复核】` | 四级 + 采样率可调；error 永不采样；每条 error 带可复现上下文 |
| O5 | 迁移兼容矩阵 | 数据格式跨版本升级路径无矩阵 `【待复核】` | 每个版本对每版数据的读/升/拒三态明确；拒载不静默降级 |
| O6 | 多语言 | 全仓中文硬编码 `【待复核】` | 两语言键集合相等；缺键显示显式标记而非空串 |
| O7 | 容量治理（10w+ 条） | 大规模下的内存/检索/落界行为未测 `【待复核】` | 10w / 50w 档位各出读数；触顶时给出可执行的清理建议 |
| O8 | 错误可读化收尾 | 承接 `L25-O7`，把「人话」扩到全部诊断码 | 全部诊断码有人话，未登记不许上线（可扫） |
| O9 | 文档与实现同源 | 文档里的读数靠手抄，容易过期 | 关键读数由生成器产出，文档只引用生成物 |

## 2. 拓展九项（L26-X1~X9）

| 编号 | 项 | 为什么它是最缺的 | 验收口径 |
|---|---|---|---|
| X1 | 记忆档案可携 | 导出/导入缺失，换设备即失忆 | 导出人类可读；导入三种模式（替换/合并/只补空）结果不同形；导入前出差异预览 |
| X2 | 与 RubyPhone 互通 | 同一段对话两仓各记一份，互不知情（对应 `R26-X2`） | 一条消息两边都能查到；差异可列出；**不静默覆盖**；两仓同轮验收 |
| X3 | 记忆可视化面板 | 只有文本列表，没有关系/时间线的图 | 图可点回源到具体记忆；无数据时显示「还没有」而非空图 |
| X4 | 预设与模板分发 | 判据/参数组合只能手工复制 | 预设可导入导出、可校验；导入失败给原因 |
| X5 | 关系时间线 | 承接 `L25-X7`，做时间轴视图 | 时间轴可拖、可筛、可点到证据消息 |
| X6 | 冲突仲裁建议 | `L25-X8` 只标注冲突，本期内给**建议**（仍不自动改） | 每条冲突给 1~2 条建议 + 依据；用户不采纳不影响后续 |
| X7 | 记忆健康看板 | 用户看得见对话，看不见记忆的健康 | 一眼看出增长、异常、损坏、悬空引用；每项可点进去处理 |
| X8 | 批量操作台账 | 批量删除/批量纠错无统一台账 | 每次批量操作有台账（谁、多少、哪些）；可回滚 |
| X9 | 检索解释器 | 「为什么你记得这个」目前只能猜 | 给一条记忆或一个查询，能答「命中哪一路、哪几个词、哪条证据」 |

## 3. 批次与依赖

- **A 批（契约先立）**：`O1` → `O5` → `X1`
- **B 批（互通）**：`X2`（与 `ruby-phone` 同轮）→ `X8`
- **C 批（可见）**：`X3` → `X5` → `X7` → `X9`
- **D 批（治理）**：`O2` → `O7` → `O4` → `O9`
- **E 批（收尾）**：`O6` / `O8` / `X4` / `X6`

## 4. 本期纪律

1. **凡「兼容」必须有拒载路径**：不能只写「支持」，还要写「不支持时怎么退出且说明原因」。
2. **`X2` 是双仓项**：单边完成判未交付。
3. **`O3` 是发布前置而不是内容**：它不进十八项名额，但没它本期的「更好」不许宣称。

## 5. 交付登记（2026-11-20 · v3.475.0）

> **读数**：判据分组 `node tests/run.mjs l26_` ⇒ **18 个测试文件 / 167 条断言 / 0 失败**。
> 登记：`manifest.extra_js` **415 → 433**（+18）；`optional-engine-registry.entries` **111 → 129**（+18，`status()` 实测 129/129 可装载，L26 十八项 18/18 `loaded`）。
> 形态：十八项皆为 IIFE 双导出工厂对象（`module.exports` + `root.LonShaXxx`），按工厂消费、不 `new`。

### 5.1 优化九项（O1~O9）

| 编号 | 交付物 | 判据 | 落地要点 |
|---|---|---|---|
| O1 宿主兼容矩阵 | `host-refusal-gate.js`（`LonShaHostRefusalGate`） | `l26_o1_host_refusal`（9） | 三态闭集 `available/degraded/refused`；逐格 `verdict` + `reading`；`assertLoadable()` **拒载即抛** `HOST_REFUSED`（不返回 false 让调用方忽略） |
| O2 加载瘦身与退役 | `extra-js-retirement.js`（`LonShaExtraJsRetirement`） | `l26_o2_extra_js_retirement`（9） | 处置词表只有 `retire/keep/undisposed`（**没有「先放着」**）；`keep` 必写 ≥4 字理由否则落 `undisposed`；`applyRetirement` 撞上仍被消费的即抛 `RETIRE_BLOCKED`；`rollbackPlan` 按原序位插回并给 `identicalToOriginal` |
| O3 检索质量跨版本回归 | `recall-regression-guard.js`（`LonShaRecallRegressionGuard`） | `l26_o3_recall_regression`（9） | 阈值默认 `-0.03`，给 ≥0 直接 `TypeError`；非数字读数单列 `unknown`（不当 0、不当进步）；版本按数值升序（不按字典序）；逐段 `delta`/`blocking` |
| O4 日志分级与采样 | `log-level-gate.js`（`LonShaLogLevelGate`） | `l26_o4_log_level`（9） | 四级 + 采样率可调；**error 永不采样**；`error` 缺 context 直接抛；采样走注入 `rng` 可复现；`stats()` 深拷贝快照 |
| O5 迁移兼容矩阵 | `data-migration-matrix.js`（`LonShaDataMigrationMatrix`） | `l26_o5_data_migration`（10） | `read/upgrade/refuse` 三态；同版本 `read` 且**不改写**；升版逐级列 `vN→vN+1`；**降级一律 refuse**（宁可拒载也不写坏）；版本读不出也 refuse；拒载抛 `MIGRATION_REFUSED` |
| O6 多语言 | `i18n-keys-parity.js`（`LonShaI18nKeysParity`） | `l26_o6_i18n_parity`（8） | 缺键/空串/纯空白一律返回显式标记 `⟦缺键:…⟧`，**绝不返回空串**；双向 `missingInLeft/Right` + `emptyValues` 单列 |
| O7 容量治理 | `capacity-readings.js`（`LonShaCapacityReadings`） | `l26_o7_capacity_readings`（10） | 10w/50w 两档出 `estimatedBytes/withinBudget/usage`；清理按 `transient→duplicate→expired→lowSalience` 优先级；`strictNumber` 对 `'1024'/NaN/undefined/null` 一律抛（不许弱转换） |
| O8 错误可读化收尾 | `diag-codes-humanize.js`（`LonShaDiagCodesHumanize`） | `l26_o8_diag_codes`（9） | 7 个诊断码各带 `human` + `next` 两段；未登记返回 `⟦未登记诊断码:X⟧`（**不许回落成码本身**）；`auditCodes` 可扫源码未登记即红 |
| O9 文档与实现同源 | `doc-readings-generator.js`（`LonShaDocReadingsGenerator`） | `l26_o9_doc_readings`（9） | 读数只接受注入的测量函数（不许手抄）；`stale`（文档 X 实际 Y）与 `unverifiable`（量不出来）分开；`ok` 要求 `stale===0 且 claims>0`（空文档不算通过） |

### 5.2 拓展九项（X1~X9）

| 编号 | 交付物 | 判据 | 落地要点 |
|---|---|---|---|
| X1 记忆档案可携 | `memory-archive-portability.js`（`LonShaMemoryArchivePortability`） | `l26_x1_archive_portability`（10） | `SCHEMA = lonsha-archive/1`，导出键排序且人类可读；导入三模式 `replace/merge/fill-empty` 行为互不相同；导入前 `previewImport` 出 adds/conflicts/identical/onlyLocal；未知模式抛 `ARCHIVE_REFUSED` |
| X2 与 RubyPhone 互通 | `rubyphone-bridge-contract.js`（`LonShaRubyphoneBridgeContract`） | `l26_x2_rubyphone_bridge`（10） | 吃手机仓字段（`msgId/content/timestamp`）；**无 messageId 直接抛**（不许按文本相似度猜身份）；`merge` 默认 `prefer:'local'` 且冲突点名；`strict` 带 `BRIDGE_CONFLICT`；`acceptance()` 一份共同消息都没有 ⇒ `bridge-no-shared-message` 且 `ok=false` |
| X3 记忆可视化面板 | `memory-visual-panel.js`（`LonShaMemoryVisualPanel`） | `l26_x3_visual_panel`（8） | 节点带 `messageId` 可点回源；`dangling` / `isolated` 单列；空态给人话 `还没有记忆` 而非空图 |
| X4 预设与模板分发 | `preset-pack.js`（`LonShaPresetPack`） | `l26_x4_preset_pack`（9） | `SCHEMA = lonsha-preset/1`；五项字段各有 type/min/max/label，未知字段点名「拼写错了？」；导出也校验；导入失败抛 `PRESET_INVALID` 并带 `errors` |
| X5 关系时间线 | `relation-timeline-view.js`（`LonShaRelationTimelineView`） | `l26_x5_relation_timeline`（10） | 六种事件；非数字时间进 `unanchored`（**不许当 0 排最前**）；`evidenceCoverage` 百分比；`viewport` 报 `hidden`，起点晚于终点抛错 |
| X6 冲突仲裁建议 | `conflict-advice.js`（`LonShaConflictAdvice`） | `l26_x6_conflict_advice`（9） | 每条冲突最多 2 条建议、每条带 `basis` + `risk`；`AUTO_APPLY = false`；`applyAdvice()` **显式抛** `ADVICE_NOT_APPLICABLE`（只建议不自动改） |
| X7 记忆健康看板 | `memory-health-board.js`（`LonShaMemoryHealthBoard`） | `l26_x7_health_board`（10） | 五态闭集；损坏（无 id/重复 id/空正文/悬空引用）**优先于增长**；无基线判 `unknown` 不判 `ok`；条数比基线少判 `anomaly`；每块砖带 action |
| X8 批量操作台账 | `batch-op-ledger.js`（`LonShaBatchOpLedger`） | `l26_x8_batch_ledger`（10） | 记谁/多少/哪些；`undo` 按台账交回 `restoreIds`，过期抛 `BATCH_UNDO_EXPIRED`（带「多少秒前」）、未知 id 抛 `BATCH_UNDO_UNKNOWN`；台账不可变 |
| X9 检索解释器 | `recall-explainer.js`（`LonShaRecallExplainer`） | `l26_x9_recall_explainer`（9） | 五路由闭集；逐条给 route/terms/score/rank/evidence + 人话；缺路由说「无法解释，不猜」、缺词说「没有词级证据」、缺证据说「没有证据消息」；分数只抄入参（不重算） |

### 5.3 本期不宣称（边界，逐条写清为什么）

1. **`X2` 仍不按「已交付」结账**：本仓只交**契约侧**；对端 `ruby-phone` 的 `R26-X2` 已交付并推送（`cb30ed3`），但**两侧同一批真数据同轮取证未跑**（本机 ST 未就绪）。按 §4 纪律 2，单边完成判未交付 —— 本条等可跑轮再结账。
2. **`O3` 只有闸，没有趋势**：仓库里没有历史检索质量读数序列，`normalizeSeries` 对缺读数一律 `unknown`（不当 0）。趋势要等基准台在有读数的轮次里填，现在不能宣称「跨版本趋势可看」。
3. **`O7` 是参数化估算，不是真机实测**：10w / 50w 两档按「每条约 400B」假设算，算式写在判据里可复算；真机内存/时延读数缺席，不得当已测。
4. **`O6` 只做键集合对等**：缺键标记与双向差异已交；第二语言全文词条翻译属内容工作，本轮未做，界面上英文包仍是中文占位。
5. **真机复核未执行**：`tests/audit/realhost_readings.json` 只抬版本指针，`reason` 由 `gen_state_report` 每轮重写为「ST 未就绪…先起 SillyTavern」——即「为什么没跑」有据，且**不写成通过**（判据锁语义不锁措辞）。
6. **全量回归**：见 §5.5 读数；本版实跑读数落在 CHANGELOG 顶节与 `tests/audit/` 相应台账，不以「本期做完」替代「全量 0 失败」的如实标注。

### 5.4 纪律落地账（§4 两条，可扫）

**拒载路径（凡「兼容」必须有退出路径且说原因）—— 7 处，全部「抛错」而非「返回假值」**：

| 项 | 入口 | 错误码 |
|---|---|---|
| O1 | `assertLoadable()` | `HOST_REFUSED` |
| O2 | `applyRetirement()` | `RETIRE_BLOCKED` |
| O5 | `applyMigration()` | `MIGRATION_REFUSED` |
| X1 | `importArchive()` | `ARCHIVE_REFUSED` |
| X4 | `importPreset()` | `PRESET_INVALID` |
| X6 | `applyAdvice()` | `ADVICE_NOT_APPLICABLE` |
| X8 | `undo()` | `BATCH_UNDO_EXPIRED` / `BATCH_UNDO_UNKNOWN` |

**「量不出来不是 0」—— 五处一致口径**：O3 `unknown` / O5 版本读不出即 refuse / X5 `unanchored` / O9 `unverifiable` / X9 `no-evidence`。这些值都不许并进「正常」那一桶。

### 5.5 本轮真教训（含两个实现 bug、三处判据自伤）

1. **永不成立的分支**：`memory-health-board.js` 的异常判据原本写 `growth < 0`，而条数不可能为负 ⇒ 该分支永不触发、看板永远不告警。判据 X7-7 抓住了它，改成 `records.length < baseCount`。教训：**条件必须能被数据触发**，写完要问「什么数据能让它为真」。
2. **回滚序位不能拍平成名字**：`extra-js-retirement.js` 的 `rollback.removed` 原本存文件名字符串，`rollbackPlan` 只能一律追加到末尾，回滚后顺序失真。判据 O2-7 用「逐项相等」抓住，改成保留 `{file,index}` 对象。
3. **判据自己算错三次**（比实现 bug 更常见）：O6-2 夹具只有 4 个叶子键却断言 5；O7-3 的 10w 档 `400B×1.6×100000 = 64,000,000 < 64MiB` 本来就没越界；X2-5 拿本用例没传入的 `m-3` 当期望。三条都是**期望值没手算**。纪律：数字类断言先手算一遍再写。
4. **自比较的假断言**：O9 曾写成 `deepEqual(r.readings, {...}.测试文件数 ? r.readings : r.readings)` —— 两边同一个对象，永远绿。改成断言键集合。教训：**断言里不许出现「左边和右边是同一个表达式」**。
5. **heredoc 在 PTY 下会污染写入**：`python3 - <<'PY'` 被回显搅乱（连中文都插进多余空格）。本轮一律「先 `create_file` 落脚本到 `/tmp`，再 `python3 /tmp/x.py`」。

### 5.6 下轮开工前必须先做的三件

1. `X2` 双仓同轮取证（本机 ST 起得来之后）：两侧各跑一次 `acceptance()`，把 `bridge-both-sides-ok` 的实数登记进 `tests/audit/`。
2. `O3` 趋势填数：基准台出一批版本读数序列后，用 `recall-regression-guard` 出一次 `gate()` 真结论（当版阈值下是否拦发布）。
3. `O7` 真机读数替换估算：10w/50w 两档换成真机内存与时延，替换 `capacity-readings.js` 的假设常量并留下读数来源。
