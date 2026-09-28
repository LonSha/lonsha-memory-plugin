# 计划开项对账（只读，v3.251.0 未抬）

对照：上游 `TODO.md` 勾选滞后于 CHANGELOG。本文件以**磁盘实现**为准，不重做已完成 Gate。

## 已完成但 TODO 仍开着（不重做）

| 项 | 磁盘证据 | TODO 现状 |
| --- | --- | --- |
| P-1 | CHANGELOG v3.229.0；`v3230` | `[x]` 已勾 |
| P-2 | CHANGELOG v3.231.0；`v3232` + `host_beast_baseline.json`；本轮 `index_beast_map.tsv`（7702–7892） | `[ ]` **滞后** |
| P-3 | CHANGELOG v3.230.0；`v3231` + `snapshot_baseline.json`（线性、characters 80.6%） | `[ ]` **滞后** |
| P-6 下游 | ruby-phone v3.7.0 `not_done` | 下游 `[x]` |
| P-6 上游 | 本轮 `p6_lifecycle_feasibility.md`：7 闭包 + interceptor 第 8 路径；形态不同构 ⇒ `not_done` | `[ ]` 文案仍写「待取证」——**取证已做，实施否掉** |
| T8 `updatedFloor` 双口径 | `seed-ledger.js:56` `updatedFloor: finiteFloor(item.updatedFloor)`；`ledger-entity.js` v3.240 `finite(null)===null`；`v3240` E 组 | TODO 仍写 `items[0].updatedFloor === 0` —— **陈旧**。证据工作台注释已写「v3.240 闭环」 |
| F-2 / F-3 / F-6 / F-8 | 上下游 CHANGELOG | 计划尾「F 批进行中」计数陈旧 |
| F-1 / F-4 | 下游 v3.9.0 / v3.8.0 `not_now` | 不重做 |
| F-7 九账出桥 | 快照键 `evidence`（R1-E v3.214）+ 下游 J12 三消费点 | 计划仍列「待实施」——**对账面已出桥**；九本账正文仍不进快照（刻意，走 evidence） |

## 仍开、本环境不能验收（登记，不立无法验收的 Gate）

| 项 | 原因 |
| --- | --- |
| M-O2 known-gap / 定向 `v3250` | **【本批已实测】15/15 通过** —— 原「需 node fork」的前提已推翻（见 §4h） |
| T10 `MIGRATIONS` 0 条 | 升代际是产品决策（返档策略），不是漏实现；`v3209` 守「空表合法」 |
| 下游虚拟滚动 | 需真 DOM；TODO 已写「浏览器前不开工」 |
| 长时程泄漏 / 崩溃上报 | 已标测不了 |
| SillyTavern 实机 | 全程未验 |

## 本轮不改

生产 / VERSION / 快照键面 / 空 `MIGRATIONS` / 虚拟滚动。
测不出写 null。禁止把 T8 再当未修项开工。

---

## 本轮追加（v3.251.0 轮第二批，只读）

### 1. 过期状态已按磁盘补齐（计划一「共同配套」第 1 条）

| 位置 | 动作 |
| --- | --- |
| `TODO.md` P-2 / P-3 / P-6 | `[ ]` → `[x]`，附落地读数 + 判据 + 「原文末句已反向成立」说明 |
| `TODO.md` T8 观察项 | 加**更正块**（v3.240.0 已收口 `finite(null)`；读侧 `seed-ledger.js:56` 走 `finiteFloor`），原文保留追溯 |
| `TODO.md`「F-2 下游侧尚未接入」 | 已改为「已接入（v3.234.0 复校推翻）」，附两消费点 |
| `TODO.md` 头部 | 加本轮对账指针 |
| 下游 `TODO.md` F-1 | 加**当前复核**：①②③ 三条前提已被上游推翻（见下） |
| 下游 `TODO.md`「后续候选」 | 补记「上游侧已补齐 ⇒ 只剩下游是否接」 |

### 2. 下游 F-1 的当前复核（最重的一条，方向被推翻但**不推翻判定**）

上游侧已交付三件面，原文「面不存在」的三条前提里 **① ② 全失效、③ 只部分失效**（见下）：

| 原文前提 | 现状 | 上游版本 |
| --- | --- | --- |
| 「以 checkpoint / 存档点 为名的**零个**」 | `snapshot-checkpoint.js`（450 行，**在 `extra_js` 分发面**）：`save/list/read/dropCheckpoint` 全在 | v3.237.0 |
| 「dryRun / 预检 / 干跑 / 预演**零命中**」 | 只读预览 `previewDrop/previewShift/previewLine/DROP_NOTHING` + `previewFloorRollback()` + `previewRestore()` + `opts.dryRun` | v3.235.0 / v3.236.0 |
| 「分支只读对照面上**没有内容**」 | `compareCheckpoints(a,b)` 只读并排。**本轮复核修正**：实际 `diffPayloads` 是**顶层键面级**（`onlyInA/onlyInB/shared` + `bytes`/`bytesDelta`/代际，`snapshot-checkpoint.js:343-364`；`v3237` F 组只断言键面/代际/缺失侧）⇒ **内容级对照仍无**，「没有内容」只算**部分**推翻：键面与规模有读数，「同键同长度但值不同」按现读数呈现不了（计划二 F7 点名的那类）。`changeset.js` 是运行时单池行级前后值账，**不是两载荷对拍**，不能顶替 | v3.237.0 |

**处置**：性质从「新做一个业务域」变为「消费既有外供面」，但**本轮不改判定、不开工** ——
下游消费属产品决策（计划二 T4 已排 F7），且真做须另立 Gate。**禁止当已确认缺陷原地开工。**

### 3. 测不出的量（写 null，不编 0）

| 量 | 读数 | 原因 |
| --- | --- | --- |
| `fork` / `node -v`（**交互 bash 会话**） | `Function not implemented`（`cd` 即报同错） | **【本批更正】限制只作用于 bash 会话**：`code_runner` 的独立 node（v24.18.0）可正常 spawn / execSync ⇒ **门禁可跑**。原「子进程全线不可用」的结论**已推翻** |
| 全量 `npm test` | **已实测**：修复前 **225/232**（7 文件红）→ 修复后 **232/232 · 2323 断言 · 0 失败 · 87.6s** | 改由 `code_runner` 的 node 运行（见 §4h） |
| 审计项数 / 测试文件数 | 审计脚本 **50**（手工按 `run.mjs` 的 `auditScripts()` 口径数：`tests/audit/*.mjs` 排除 `_` 前缀；**手工读数，非门禁读数**）。测试文件：**在役 232 / 退役 18 / 合计 250** —— **上一轮把 250 当测试文件数是错的**：`tests/run.mjs` 的 `collectTests()` 用 `readdirSync(HERE)` **不递归**，故只收在役 232（`tests/archived/` 的 18 个不参与门禁），250 = 232 + 18。**232 是真读数**：`out_npm_test.log` 的 runner 自报行就是 `232 个测试文件`，而 `collectTests()` 只做 `readdirSync`、不 spawn ⇒ **不受 fork 不可用影响**。 | 门禁基线 `gate_timing_baseline.json` 停在 `measured_at: v3.226.0` / 206 文件 / 42 审计项，**已陈旧、不得当本轮读数**（本轮那两格只能给手工计数，且已标注非门禁口径） |
| 定向 `node --test tests/v3250_story_eval.test.mjs` | **已实测 15/15 通过**（exit 0） | 同上 |
| `p3_snapshot_bytes` | `not_measured`（本轮未重跑探针） | **不再有环境障碍**，属「未做」而非「测不出」 |

### 4. 本轮追加（v3.251.0 轮第三批：能力索引复核 + F7 第一阶段复核 + 一处自审修正）

**(a) 能力索引：上游根 `README.md` 实测陈旧（登记，本环境不改）**

| 项 | README 现值 | 磁盘实现 |
| --- | --- | --- |
| 自报版本 | `v1.1.0 (Phase 9 完成)` | `3.251.0` |
| 里程碑口径 | `Phase 1-9` | 实为 R1→R4 / M-O1~M-O3 序列 |
| 支持规模 | `20000 节点`、`7x24 稳定运行` | 当版无判据背书 |
| 项目结构点名的 9 个文件 | `visualizer.js` / `graph-worker.js` / `worker-manager.js` / `virtual-renderer.js` / `wasm-bridge.js` / `storage.js` / `gpu-renderer.js` / `realtime-sync.js` / `cloud-sync.js` | **根目录全无**（`list_files` 实测），也不在 `manifest.extra_js` |
| 核心代码行数 | `~6041 行` | 磁盘合计远大于此 |

门禁口径（已核）：`scan_version_guard.mjs` 的扫描面是 index / manifest / package / CHANGELOG / TODO / tests，**不含 README**；
`scan_claim_truthfulness.mjs` 只吃 `index.js`。⇒ **README 是零门禁覆盖面**，陈旧不会被任何门禁抓住。
**处置：只登记、不改** —— README 是用户门面，改写属表现层产品取舍（`deepseek_harness` 那类托管服务不适用；此处是插件门面定位），且本环境无 fork 跑不了门禁复验。
**落到下游是可验收的**：计划二验收反复要求「不因图源/机制外观替代内容判断」，README 若被当能力索引取用，读到的会是已不存在的模块名。
（下游侧仓根未发现类似「能力索引」文档：`find *索引*` 零命中，`docs/` 只有 `runtime-verification-boundary.md`。）

**(b) 计划二 F7 第一阶段「只读内容对照」：证伪 ⇒ 未交付**

计划原文：*「先交付只读内容对照：沿稳定 id 与各域 schema 比较人物字段、关系、事实版本、承诺、事件、道具/资产等实际内容…余额 100→900、朋友→仇人的同长度改变无法由此呈现」*。
上游现状（本轮源级取证）：
- `snapshot-checkpoint.js` 的 `diffPayloads(a,b)` = 顶层键面 + 规模 + 代际，**无内容级比较**（源码 343-364）；
- `tests/v3237` F 组断言口径 = 键面差异 / 代际跨代标记 / 缺失侧如实报，**无内容级断言**；
- `changeset.js` 是**运行时**单池行级 before/after（写侧记录），不提供「两份载荷对拍」；`v3238`（产品面）/`v3239`（null 非零）也不含。
⇒ **与计划原文一致而未交付**：这才是计划二里「仍开 + 判据可写」的项。**本环境不做**（属新功能，不属「更正过期状态」；环境障碍已不存在，见 §4h —— 是**范围**取舍，不是能力限制）。

**(c) 自审修正（把上一轮自己写错的口径改掉）**

上一轮把 `compareCheckpoints` 的 `diffPayloads` 说成「内容级」——**实测是顶层键面级**。
已在本文件 §2 表与下游 `TODO.md` 的 F-1 复核块**同步更正**。
留痕理由：对账文件自带不准确口径，下一轮会把它当既有事实继续引用 —— 这正是本仓「判据撒谎比实现撒谎更难发现」那条纪律的文档层同形物。
**本批第二处自审更正**：上一轮记的测试文件数 **250 是错的**（把 `tests/archived/` 的 18 个退役文件也算进去了）。
门禁口径是 **在役 232**（`tests/run.mjs` 的 `collectTests()` 只 `readdirSync(tests/)`、**不递归**，退役文件不参与门禁）。
232 有独立佐证：`out_npm_test.log` 里 runner 自报「232 个测试文件」，而 `collectTests()` 在 spawn 之前 ⇒ **该读数不受 fork 不可用影响**。§3 表已同步改写。

**(d) 本轮新增的三处「计划仍写 X vs 磁盘已是 Y」（同第 1 条同类，已落盘更正）**

| 位置 | 原文 | 磁盘读数 | 处置 |
| --- | --- | --- | --- |
| `FOUR_RELEASE_PLAN.md:874` | 「后续增量（未启动）：持久检查点 / 分支只读对照」 | 两项均由 **v3.237.0（R4-C）** 交付（`snapshot-checkpoint.js` + `v3237`） | 加更正块，**并同时标明「内容级对照仍待做」**（防止更正过头，见 §4b） |
| `FOUR_RELEASE_PLAN.md:845` | 「上游 3/6，下游 0/6 / 剩六项」里含 F-2 与 P-6；F-1 写「进行中」 | F-2 同段已列「**已完成**」（**自相矛盾**）；P-6 取证已交付、实施否掉；F-1 的 R4-A/B/C 三件均已完成 | 加更正块逐条对齐，**F-4 明确标「本轮未核」**不代断言 |
| `FOUR_RELEASE_PLAN.md:716` | 同一行标题**重复两遍**（`- **F-3 / F-6…** - **F-3 / F-6…**`） | 排版残句（非语义） | 直接去重 |

> 为什么只动文案不动代码：这三处与第 1 条同类（**过期状态**），属计划一「共同配套」点名的「工作量小」类，
> 改动面**不含任何判据 / 生产文件**，因此在本环境（无 fork）里是**可完全复核**的一类工作。
> 其余登记项（F7 首阶段、跨仓登记表、README 能力索引）都属于「要么新建机制、要么改用户门面」，本环境无 fork ⇒ 判据跑不了，故只登记不开工。

**(e) 本轮对下游 `ruby-phone/TODO.md` 的同步改动（同一批，四处）**

| 位置 | 动作 |
| --- | --- |
| F-1 条 ③ 前提行 | 把上一轮我自己写的「内容级 `diffPayloads`」按磁盘改为「**顶层键面级**」，并写明「内容级对照仍无」 |
| F-1 条复核结论 | 由「①②③ 三条均由上游补齐」改为「**① ② 已补齐；③ 只算部分补齐**」，并点明 ③ 的缺口就是 F7 首阶段要新建的那部分 |
| F-1 条「不改判定」的 ② 理由 | 原写「上游尚未在 FOUR_RELEASE_PLAN 的『未启动』里销账」——**该依据已随本文件 §4f 的更正而失效**，已加删除线并注明；③（真做须立 Gate）保留 |
| F-1「后续候选」补记 | 补一句口径限定：检查点与预检是整件补齐，**对照面只到顶层键面** ⇒ 若候选验收含「带回滚**内容**」，那一半仍未就绪 |

> 这四处是**同一处口径**在四个地方的残留，属「一改必须全改」——只改一处会让下一轮读到互相矛盾的两句话。
> 未动下游任何生产文件、未动下游 `update-log.json` / `manifest.json`（下游有独立版本脚本，见其自有纪律）。

**(f) 共同配套第 2 / 3 / 4 条状态（本轮只判定，不立新 Gate）**

| 条 | 计划要求 | 磁盘现状 | 本轮 |
| --- | --- | --- | --- |
| 2 | 跨仓功能登记：拥有者 / 生产者版本 / 契约形状 / 消费者 / 失效条件 / 单独安装行为；**缺席、旧版、不产出、空数据分别呈现** | **无统一登记表**。仅有逐功能形态：F-2 下游侧四态（`tests/system-v321.test.mjs` 把「面缺席 / 空 / 不可用」钉开）、下游基线 JSON 带「冻结证据 v3.233.0 / c97808c」。`scan_cross_repo_binding.mjs` 是**测试卫生**守卫（P1 禁绝对路径 / P2 禁绑兄弟仓），**不是登记表** | **未交付**。属新机制（登记表 + 常驻判据），本环境无 fork ⇒ 判据跑不了，**登记不开工** |
| 3 | 首批修复补关键行为回归；文档与低风险样式不机械添测试；旧形态断言按新行为有证据地接管 | 已在做（如 T8 更正是「改文案 + 加更正块」，未机械添测试）；`catalog_version_guard.tsv` 的 P6 已把「退役覆盖率转移必须有判据」钉住 | 纪律已在执行，**无待办** |
| 4 | 发布跑 `npm test`，审计面改动补 `npm run test:audit`，手机跑 `npm run check` 十道检查；全量输出落文件 | 上游 `out_npm_test.log` 本轮只到 runner 启动行 | **`not_measured`**（fork 不可用），全量输出落文件这一步本身可复核 |

**(g) 上游「最近更新」与 CHANGELOG 顶节未动（V6 / V7 面）**

本轮所有改动都避开 `TODO.md` 的 `> 最近更新：v3.251.0` 那一行；未抬 `VERSION` / `manifest.version` / `package.json version`；未改 CHANGELOG 顶节。
⇒ `scan_version_guard.mjs` 的 V1 / V4 / V6 / V7 面**不受本轮影响**（V1 三源同源未动、V6 CHANGELOG 顶节仍为 v3.251.0、V7「最近更新」仍为 v3.251.0）。
本轮唯一触碰的上游发布面文件是 `TODO.md` 与 `tests/audit/open_items_reconcile.md`（后者不在任何守卫的扫描面里）。

### 5. 下一轮起点（fork 恢复后）

1. 定向 `node --test tests/v3250_story_eval.test.mjs`（M-O2 首批，5 例 known-gap 台账在里面）；
2. 复核 `bindEvent` 是否仍为 7（对账 P-6 手数）；
3. 若要做下游 F-1 消费面 Gate，先读上游 `snapshot-checkpoint.js` 的 `REASONS` 与 `probeStore` 三态，
   按 F-2/F-3/F-8 同形接法（接面 + 分态 + 常驻判据）立 Gate。

### 6. 本轮新增的「仍开且可做」项（下一轮候选，须先立判据）

1. **计划二 F7 首阶段「内容级只读对照」**（见 §4b）：现读数只到顶层键面 ⇒ 需**新建**内容级比较
   （按稳定 id + 各域 schema 比人物字段 / 关系 / 事实版本 / 承诺 / 事件 / 资产），
   且必须覆盖计划点名的反例「**同键同长度但值不同**」（余额 100→900、朋友→仇人）。
   **不要把 `diffPayloads` 直接扩成深比较** —— 它是「键面 + 规模 + 代际」的既有契约，已有 `v3237` F 组钉着；
   新增应是**并列的新出口**（如 `diffPayloadsDeep`），并必须自带负控制（否则又是一条「门从没开过」的假绿）。
   （环境障碍已排除，见 §4h；但仍属新功能，须先立判据再落地）。
2. **能力索引口径**（见 §4a）：README 陈旧已登记；若决定改，须先想清「谁是能力索引的真源」
   —— 本轮实测 `manifest.extra_js`（**66 项**，逐项数过该 JSON 数组）才是机器可核的分发面清单，`README.md` 是人读面且**零门禁覆盖**。
   若要让门禁守它，须新增扫描器（属新机制），不能在 README 里手抄后再无人守。
3. ~~**上游 `bindEvent` 是否仍为 7**（§5-2）与 **`out_npm_test.log` 全量复跑**~~ —— **两项均已完成**：
   · `out_npm_test.log` 已补为完整读数（232 文件 · 2323 断言 · 0 失败 · 89.8s）；
   · `bindEvent` 实测**仍为 7**（`index.js` `_h1`~`_h7`：MESSAGE_RECEIVED / CHAT_CHANGED / MESSAGE_EDITED /
     MESSAGE_SWIPED / MESSAGE_DELETED / GENERATION_ENDED / GENERATION_STARTED），与 `EXPECTED_EVENT_TYPES = 7`（`index.js:11`）一致。
## 本轮追加（v3.251.0 轮第四批：环境结论更正 + 门禁真跑 + 收尾修复）

### (h) `fork` 结论更正：限制只作用于**交互 bash 会话**，`code_runner` 的 node 可跑门禁

前三批把「`fork: Function not implemented`」读成「子进程全线不可用 ⇒ 门禁跑不了」。**本批实测推翻**：
- 终端工具（bash）确实 `cd` 即报 `Function not implemented`（rc=127）；
- 但 `code_runner` 的独立 node（**v24.18.0**）`spawnSync` / `execSync` / `spawn` **全部正常**，可直读 `/home/user/**`（顺带解决了 `grep_code` 对 `/home/user/**` 的 IO error —— 该 IO error 与 fork 无关，是检索工具自身的通道问题，故本批全部取证改写为 node 脚本）。
⇒ **前三批登记为 `not_measured` 的门禁类项，本批全部可测**。这更正影响 §3 表四行与 §4b 的「本环境不做」理由。

### (i) 全量门禁真跑：修复前 **225/232**（7 文件红）→ 修复后 **232/232 全绿**

| 阶段 | 读数 |
| --- | --- |
| 测试段（修前） | 232 文件 · **225/232 通过** · 14 失败断言 · 93.1s |
| 测试段（修后） | 232 文件 · **232/232 通过** · 2323 断言 · 0 失败 · 87.6s / 100.1s |
| 审计段 | **50/50 通过** · 62.7s（最慢 `scan_break_kit_negctl` 29.8s）—— 与 §3 手工数的 50 **一致** |
| 审计脚本数复核 | `[audit] 执行 50 个审计脚本` = **33 在役扫描器**（`audit_scan_probe_matrix.tsv` 实测 33 行）+ **17 个 `_negctl` 驱动** |

**七个失败文件的根因（全部属「v3.251.0 未提交发布的收尾」，非缺陷实现）：**

| 失败 | 根因 | 修复 |
| --- | --- | --- |
| `scan_cross_repo_binding` exit 1（连累 v3159 / v3204 / v3205 / v3227） | `catalog_reference_consumers.tsv` **参考基准 231 < 在役 232**：新套件 `v3251` 未登记（该表自述「新增测试文件时补一行」） | 补登记 `v3251_…test.mjs` 一行 |
| 版本守卫 V2 + V5（连累 v3203 / v3241 / v3227） | `v3251` **缺 frontier 文件头**（豁免按「首 12 行内同行出现文件名+当版号」结构化判定）⇒ 其 414 行 `assert.equal(vnum(v), vnum('3.251.0'))` 落入 V2，且 `frontier 0` 触发 V5 | 补 `// tests/v3251_….test.mjs — v3.251.0` 头 |
| `v3232 F1` | `host_beast_baseline.json` 的 `v3.251.0` 重建记录**四件不齐**（缺 `not_done`；其余六条都在） | 补 `not_done` 字段 |

修复后逐项复验：版本守卫 `问题 0 / frontier 1 / 当版锚点 1`；跨仓守卫 `在役 232 / 参考基准 232 / 问题 0`；`v3232`、`v3241` exit 0。
**口径**：这是「当版收尾」不是「新做功能」——判据、生产代码、VERSION 一律未动。

### (j) 下游 `ruby-phone` v3.17.0 十道检查真跑（计划一共同配套第 4 条后半）

| 阶段 | 读数 |
| --- | --- |
| 修前 | syntax ✓（436 文件）· import-resolve ✓ · **test ✗ 1356/1357**（1 失败）⇒ `&&` 链断裂，后 7 道未执行 |
| 失败 | `tests/system-v328.test.mjs` C1「文档里的实测数字必须与当前门禁真跑的一致」：`docs/runtime-verification-boundary.md:220` 写 `语法 435 文件`，真跑 **436** |
| 修复 | 文档 `435 → 436`（复校标记已是 `v3.17.0 复校`，导入面 `250 文件 382 条` 本就一致） |
| 修后 | **11 道全部执行 · test 1357/1357 · fail 0 · 全链无红** |

> 注：下游日志里 `[registry] ✗ R3`（`apps/diagnose/diagnose.css` 未投递）、`[keys] ✗ K1`、`[source-derivation] ✗`、`[dead-export] ✗` 等行均为**各门负控制夹具**的输出，同一份日志内随后有 `[registry] ✓ 样式投递无未覆盖 · 未覆盖 0` 等正向结论 —— 真判据全绿。不把负控制的 `✗` 读成缺陷。

### (k) 意外收获：仓库已推进到 **v3.251.0**，计划批次实际已交付

前三批只核「计划仍写 X vs 磁盘已是 Y」，没查**计划条目本身是否已交付**。本批实测：
- `git log` 最后三条 = `v3.249.0 M-O1` / `v3.250.0 M-O2 首批` / `v3.250.1 M-O2 语料修正`；工作区未提交的正是 **v3.251.0 = M-O3**（13 个已改 + `v3251` 等未跟踪文件）；
- ⇒ **M-O1 / M-O2 首批 / M-O3 均已交付**（判据 `v3249` / `v3250` / `v3251`），与 `TODO.md` 第 25~26 行那句「对齐 M-O1~M-O4 / R-O1~R-O4 批次映射」**实测不符**（该文件当时零条 M-O*/R-O*）⇒ 已更正为真实映射，见该文件头部。

### (l) 本批**未做**（范围取舍，不再以环境为由）

| 项 | 状态 |
| --- | --- |
| F7 内容级只读对照（新建 `diffPayloadsDeep`） | **未做**：属新功能，须先立判据与负控制（环境障碍已排除） |
| 共同配套第 2 条跨仓功能登记表 | **未做**：属新机制 |
| 根 `README.md` 能力索引改写 | **未做**：用户门面产品取舍（改写价值与风险已在 §4a 登记） |
| `p3_snapshot_bytes` 重跑 | **未做**（不再是「测不出」） |
| 上游 `bindEvent` 是否仍为 7 | **未复核**（不再是「测不出」） |

### (m) v3.252.0 轮：F7 首阶段已交付 + P-3 已闭环（关掉 §4b / §4l 两条）

| 项 | 前一轮状态 | 本轮读数 | 关法 |
| --- | --- | --- | --- |
| 计划二 F7 首阶段「只读内容对照」 | 未做（属新功能，须先立判据） | **已交付**：`snapshot-checkpoint.js` 新增**并列**出口 `diffPayloadsDeep`（键面读数继承既有 `diffPayloads`，新增 `changes[]`/`sets[]`/`capped[]`/`cycles[]`/`changesTruncated`/`limits`/`deepContentCompared`）+ 引擎 `compareBranchCheckpointsDeep` / `checkpointContentDiffLines` + 面板**真调用** | `tests/v3252`（19 条，含三条真源码破坏负控制）|
| `p3_snapshot_bytes` 重跑 | not_measured（need_node_to_time） | **measured**：`tests/audit/_p3_snapshot_probe.mjs`（可复跑）测出线性读数（N=0→169B / 每项 98.3~105.19B / ratio_200_50=4.007 / superlinear=false）⇒ 结论 `not_done_until_superlinear`（快照键面不动）| 该表 `p3_snapshot_bytes` 行已改（不再写 not_measured）|

**本轮两处**更正**（都是「文档说自己是什么、磁盘不是」的形态，与 §4c 同族）：
1. `tools/_rebuild_host_beast.py` 把记录键写死成 `v3.251.0`（ROOT 也硬编码）⇒ 同一工作区再跑一次会**静默改写已有版本的历史读数**（实测：v3.251.0 的历史读数被换成当前读数的副本，`window.v3252` 的 before 因此失真，已改用镜像时点重建）。已修：键从 `index.js` 真版本号取、已存在的键**拒绝静默覆盖**（须显式 `--force`）、ROOT 读 `LONSHA_AUDIT_ROOT`。
2. 同一脚本**从不写 `not_done`**（`v3232 F1`「重建记录四件齐备」的第四件）⇒ 它跑出来的记录**必过不了门禁**。已修（默认文案，可用 `--not-done=` 覆盖），并已对 v3.251.0 / v3.252.0 两条记录补齐。

> 更正口径（防止后人误读基线）：`host_beast_baseline.json` 的 `measured_at` 是**当版**、`rebuilds[ver].delta_from` 是**上一时点**。
> 本轮脚本第三处根因：`delta_from` 取的是**已被抬版后的** `measured_at` ⇒ 记录里的 `delta_from` 恒等于自己（实测 v3.252.0 最初写成 `delta_from: v3.252.0`）。已修（先存旧值）并就地修正两条。
