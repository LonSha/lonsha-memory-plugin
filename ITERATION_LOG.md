# ITERATION_LOG — LonSha 记忆插件

> 自主迭代模式的流水账。每条：**做了什么 / 为什么 / 影响范围 / 门禁结果**。
> 版本级详情在 CHANGELOG.md，本文件只记迭代节奏与判据出处。

---
## 2026-09-28 · v3.249.0（M-O1 召回收尾唯一出口 + 候选资格分层）
**做了什么**：① 三源抬版 3.248.0 → **3.249.0**（`index.js` / `manifest.json` / `package.json`）+ TODO「最近更新」；
② `unified-recall.js` 候选三层分离（资格 / 保留 / 限额），补 `deferred` / `capFill` 读数，
默认返回与既有四个读数一字不改；③ `index.js` 召回收尾三段就地收口到唯一出口 `_finalize()`，
四条路径（精排成功 / 关闭 / 失败 / 回空值）审计与记账各恰一次，收尾不再覆盖精排顺序；
④ 精排结果去重 + 长度守恒（本版首跑自抓：`order=[9,1,1]` 会把名单撑成 5 条且重复）；
⑤ 图谱路改取全量候选，精排路径**有条件**入漏斗台账；⑥ 新增套件 `tests/v3249`（13 项，含真源码破坏负控制）。

**为什么**：两处都是「静默收口」缺陷 —— ① 断在**评分之前**：30 节点按 `updatedAt` 先截 24，
最旧节点根本不参赛（v3.172 只补了读数、没改分层）；② 断在**收尾之后**：精排成功即 `return`，
本地重排 / 召回审计 / 楼层记账三件事在那条路径上一次都没跑（实测 audit=0 / record=0 / intent=0）。
两条都不是「开关没开」，是默认路径上的观测与账本不同形。

**影响范围**：`unified-recall.js` 一个函数体（签名不动）+ `index.js` 召回收尾块与图谱接线；
`tests/` 新增一档、`tests/v3172` 一条字面判据按新行为接管、`tests/v3248` 当版锚交棒为下界锚；
`tests/audit/host_beast_baseline.json` 按当版 index.js 重建（17751 → 17791 行，成员 583 不变；
`recallMemory` 656 → 688 行、`onBeforeGeneration` 503 → 511 行）；`dead_code_budget.json` 上界 39679 → 40022（实测 39622）。

**门禁结果**：见本轮交付记录（全量 `node tests/run.mjs` 与 `--audit` 两档，落盘 `/tmp/run_*.txt`）。

---
## 2026-09-27 · v3.248.0（证据面契约门禁 + 违规结构化出口 —— 计划 #11 / #12 / #21）
**做了什么**：① 三源抬版 3.247.0 → **3.248.0**（`index.js` / `manifest.json` / `package.json`）；
② 新门禁 `tests/audit/scan_evidence_binding.mjs`（七条判据 R1~R7，退出码三态）；
③ 负控制 `tests/audit/scan_evidence_binding_negctl.mjs`（**8 组**，含 V0 原版对照）；
④ 套件 `tests/v3248_evidence_contract.test.mjs`（**16 项**）；
⑤ 产品代码 `index.js`：新增 `_ledgerViolationReport` / `_ledgerViolationMarkdown`，
`_ledgerViolationSummary` 改**派生读数**，`_recordLedgerViolations` 补裁剪留痕
`_ledgerViolationsDropped`，`exportMemoryReport` 接读侧；⑥ 两处登记面补齐
（`audit_scan_probe_matrix.tsv` 一行、`catalog_reference_consumers.tsv` 234→235 行）。

**为什么**：本版实测 `grep -rln 'apiGlobal' tests/` **零命中** —— `evidence-workbench.js` 的
九账登记表 `LEDGERS`（`id / label / apiGlobal / state / pick / project`）与宿主取库面 `_ledgerApis()`
**各写一份名单**，而这张表此前**从来没有一道门守过**。改一个 `apiGlobal` 名 ⇒ 宿主仍取旧键 ⇒
`readLedger` 落 `absent / module-unavailable` ⇒ **工作台永远显示「模块未挂」且全仓不响**。
这与本仓治理过多轮的形态同源：v3.191 `stripComments` 分裂 4 变体、v3.246 账本名册四处手抄、
v3.247 破坏形态 27 份各写一份 —— 都是**同一件事有多个可写点**。
另两处：`project` 第 2 参退化**不抛只是读数少一截**（#12）；违规账本只有一行中文 `_ledgerViolationSummary()`
⇒「违规发生了」「没发生」「发生了但记录被裁掉」三者对外**同形**（#21）。

**影响范围**：`evidence-workbench.js` 与 `index.js` 的读侧新增出口（不改既有语义）；
`tests/audit/` 新增两档；`tests/` 新增一档；两处 TSV；三处版本源。

**门禁结果**：全量 `node tests/run.mjs --audit` 待跑；本版三档单项实测已绿 ——
门禁健康树 `exit 0`（登记表 9 项 ↔ 宿主 9 键**零对差**，输出 `seed→LonShaSeedLedger … repair→LonShaRepairLoop`）；
负控制 **8/8**；套件 **16/16**（980.8ms）；`scan_wiring` A7.1 零引用 **0**（改前抓到
`_ledgerViolationMarkdown` 零引用 ⇒ 当场接进 `exportMemoryReport`，空账**整段不出现**，
理由：无条件输出空板块会把「没有违规」与「违规没被记录」混成同形）；
探针矩阵 H/G/T 实测 **0/2/0**（判读：读根 `.js` 面，入口不在场即阻断）。

**口径裁决（#12）**：计划字面写「`project` 参数计数 ≥ 2」，但**实测 9 处定义中 8 处是 `(it)`、
仅 1 处 `(it, api)`**（第 203 行 event-completeness，v3.233.0 F-2 引入）⇒ 按字面执行会**误伤 8 处**。
故按 #12 的**原意**落判据：查**调用点**必须传 `api`（唯一调用点 301 行 `spec.project(it, api)`），
不查定义签名一致性。**计划原文与实测不符时，按原意落判据，并把不符留痕。**

**判据自身缺陷留痕（本版实测四处，这是最贵的一层）**：
1. **`bodyOf` marker 落在调用点**：首跑健康树 fail-closed（`exit 2`，报「一个取库项都解析不出」）。
   写 `/tmp/dbg_eb.mjs` 打印 `indexOf = 712774` 与前后字符 repr，确认
   `bodyOf(idxCode, '_ledgerApis()')` 先命中的是 `_evidenceWorkbench()` 里的**调用点**
   `const apis = _ledgerApis();`，取到的是 `{ apis: apis }` 这个对象字面量。
   修法：marker 必须点名 `function _ledgerApis(`。
   连带禁忌：类方法简写（`_evidenceWorkbench() {`）也**不被 `bodyOf` 的裸名形态识别**，
   且用 `_evidenceWorkbench()` 作 marker 会先命中 7716 行调用点 ⇒ 必须写 `_evidenceWorkbench() {`。
2. **`keyOf` 判得比契约严**：初版列为必需 ⇒ 健康树上 8 项被判缺字段。真值：登记表注释原文写的是
   「`keyOf`（可选；条目没有 `id` 时用它）」——**判据比契约更严，就是判据错了**。
   改为「出现时必须是函数形态」。
3. **R7 作用域过宽**：初版用 `window.<global>` 在 **index.js 全文件**计数 ⇒ 8 项误红。
   真值：那些命中是**别处业务面的合法直读**（`const seedApi = window.LonShaSeedLedger`，实测 3~4 处/键）。
   R7 的原意是**工作台**不得内联（v3.214.0 那次内联**当场自伤**：六个未定义引用 ⇒ 每次抛
   ReferenceError ⇒ 被外层吞成 `reason:'thrown'` ⇒ 工作台永远「不可用」且不报错）⇒ 收窄到
   `_evidenceWorkbench()` 体内。
4. **套件侧两处**（首跑即暴露）：① 缺陷明细走 **`stderr`**（`console.error`）而断言只读 `r.stdout`
   ⇒ D3/A3 的点名永远看不到，加 `combined(r)` 合并两股流（退出码仍以进程为准）；
   ② `new Function('return (' + 方法体 + ')')` **SyntaxError** —— 类方法简写**不是**函数表达式，
   必须补 `function` 关键字再包（首版漏了，D1/C5 全崩在解析上，而「崩在解析」极易被误读成「判据失败」）。

**负控制的教训（必须记）**：首跑 V1~V7 全 ✓、**仅 V0 红** —— 手抄的三件夹具清单**喂不满门禁**：
R4 会逐个 `fs.existsSync` 九本账，夹具里没有它们 ⇒ V0 在夹具里 `exit 1`，**与真缺陷同形**。
负控制差点「空对空地全绿」。修法：账本清单**从 `_ledgerApis()` 派生**（不手抄）；
首版派生只抓到 6 本（三本走 helper，文件名写在 helper 体内）⇒ 再自纠：解析九键后对走 helper 的键
**展开 helper 体**取文件名，与门禁 R4 同源。修后 **8/8 全绿**。这与 v3.240.0 记过的形态同源：
**夹具少一本账 ⇒ 门禁在夹具里提前 bail ⇒ 红的不是判据。**

**登记面**：`audit_scan_probe_matrix.tsv` 列格式 `scanner | H | G | T | 判读`，
由 `tests/v3226_audit_sensitivity.test.mjs` 常驻校验（J1 双向齐全 / J2 H 全 0 / J3 G 或 T 非 0）；
`catalog_reference_consumers.tsv` 由 `scan_cross_repo_binding.mjs` 的 P3 守（缺口与残留都报）。

---
## 2026-09-27 · v3.247.0（退出码归因 + 破坏形态库 —— 同一件事只准一处可写，计划 #19 及配套）
**做了什么**：① 三源抬版 3.246.0 → **3.247.0**（`index.js` / `manifest.json` / `package.json`）
+ CHANGELOG 顶节 + TODO「最近更新」；② 唯一真源 `tests/_break_kit.mjs` 收编 27 份破坏工具
（导出面 10 项：`breakOnce` 唯一实现 + 三别名**同一函数对象** + `breakFile` + `assertSingleHit`
+ `BREAK_MSG` 冻结措辞表 + 三个消息构造函数），四条口径（恰中 1 次 / 必须真改变源码 /
一律 `AssertionError` / 消息含历史全部措辞）；③ 门禁 `tests/audit/scan_break_kit.mjs` 五层判据
（A 真源面 / B 行为面含两种锚点形态 / C 接线面含 C4 消息面**自动对差** / D 活性面 / E 七组自证）
+ 外部观测点 `tests/audit/scan_break_kit_negctl.mjs`（5 组，整仓镜像 1.18s/10.4MB）；
④ 真源 `tests/_fixture_sync.mjs` 新增 `MIRROR_GATES` 登记面（整树复制门禁的唯一可写点）；
⑤ `pairDiff` 增登记感知（`isMirror` / `registered` / `missing`，行为特征判定）；
⑥ 新增 `tests/v3247_break_kit_consolidation.test.mjs`（17 项：A 真源面 / B 收编面台账↔磁盘双向 /
C 六处修复落点与磁盘同源 / D 六组真源码破坏负控制 / E 版本锚）。
**为什么**：同一份纪律在 27 个文件里各写一份，实测分化名字 5 / 参数序 4 / 错误类型 2 / 校验强度 3。
后果不是「不整洁」，是**纪律没有出口**。而收编过程中实测出更贵的一层：
正则锚点形态下 `src.match(re)` 漏 `g` 会返回**首个匹配对象**，`|| []` 把它当数组用 ⇒
`.length` 恒为 1 ——「恰中 1 次」在该形态下**空转**（锚点命中 3 次也放行）。
**判据看着在守，实际数不出第二个命中** —— 本仓最贵的形态，也是收编的真正理由。
**同轮负控制与收口逼出的真缺陷**：① `v3159` 正则猜结构（V2 已让样本改走 `shouldFail({kind})`，
正则失去对象）；② `v3174` 实参整体错位一格（读数认出来：被数的是**替换串**不是锚点）；
③ `v3213` 三处缺 `src`；④ `v3218` 注释写了走真源却没 import；⑤ `scan_exit_codes_negctl.mjs`
整树复制从未被登记口径量过（新判据上线即命中，真实漏登记）；⑥ **门禁自己 C4 判据的 `lastIndex`
缺陷**（模块级带 `g` 的正则被 `.test()` 推游标 ⇒ `matchAll` 每个文件漏首个片段）；
⑦ **N6 子 runner 没剥 `NODE_TEST*`**（被外层 `node --test` 拉起时 Node 递归保护整体跳过子 runner，
退出码 0 ⇒ 读成「28 个接收方全绿」报假红；最贵的是**单跑绿 / 夹具里红**结论相反）。
**口径冲突已裁决**：`v3218` N3 原借「同值替换」做一次不算破坏的自证，与真源口径②
（同值**必须拒绝**）不可并存 ⇒ 裁决「**真源口径高于接收方的旧假设**」，该组改回真破坏。
**纪律沉淀（本版实测逼出）**：破坏的锚点要点在**判据的检查对象**上，不是点在自己身上；
「改写打偏」与「破坏打偏」不得混进同一个 diff；调用方要按**真源的实际返回形状**取值
（`reachableCodes` 返回 `{ codes, dynamic }` 不是 Set）；内部自证发现不了「自证段被整体摘除」，
故必须有**外部**观测点；口径分散的收编要下沉到**唯一可写点**。
**影响范围**：32 个文件（收编接收方 30 + 真源 + 门禁 + 观测点）、6 处遗留红灯修复、
登记表补 2 条并全表重排、跨仓参考基准补登记 1 条、TODO / CHANGELOG / ITERATION_LOG 留痕。
**门禁结果**：`scan_break_kit` exit 0（30 接收方 / 29 判据点 / 手抄消息 0 / 7 组自证全绿）；
`scan_exit_codes` exit 0（48 份逐一核对）；`scan_fixture_sync` exit 0（16 对无缺口）；
`scan_cross_repo_binding` exit 0（参考基准 228 / 问题 0）；`scan_version_guard` exit 0（四源同源）；
`scan_break_kit_negctl` 5/5；**全量 `npm test` 228 文件 / 2255 断言 / 0 失败 / 68.8s**；
`npm test -- --audit` **48/48 / 41.0s**。
---

## 2026-09-27 · v3.246.0（名册单一真源 —— 判据面与派生读数同源，计划 #1/#4/#5/#8/#9/#18）
**做了什么**：① 契约新增第三张域声明表 `TEXT_DOMAINS`（24 条样本，覆盖 ZWSP/ZWNJ/ZWJ/BOM/NBSP/
全角空格/细空格/旁点/CRLF/TAB），导出面 16 → 17 项；② 门禁补 **R3c**（文本一族不得就地重写，
五类形态）/**R2b**（九账一律按名点名委派 `finiteFloor`）/**R5b**（导出面按**真形状**点名：加载真源、
按真导出键集逐项判 `typeof`）/**R9**（名册与扫描面**同源**）；③ 负控制 12 组 → **14 组**
（新增 R9 两向观测点 V13/V14），夹具清单改为从 `manifest.extra_js` 派生；④ 四处手抄名册收编：
`scan_ledger_contract.mjs` / `v3207` / `v3240` 改为从唯一真源派生，`v3242`/`v3243` 的 `GAUGED`
（**同名异义**）只把九账那一截派生；⑤ 真源新增 `ledgerLevelConsumers` / `LE_BLOCK` /
`NON_BOOK_CONSUMERS` / `RUNTIME_DEPS`；⑥ 新增 `tests/v3246_roster_single_source.test.mjs`（19 项）。
**为什么**：门禁原先断言「扫描面里有 N 本账」—— 判的是**手抄的那份清单**，不是磁盘事实。
于是**新增一本账本级的契约消费者**能同时绕开 R2/R2b/R3/R3b/R3c（不在 `books` 里）
与 R1（它在 manifest 里、装载面正常），全门禁一字不说。这是本仓最贵的形态：
「收编了谁」与「判据覆盖谁」不同源；绿着，但绿的成因不是判据在守。
**同轮负控制逼出的真判据缺口**：把 `const finiteFloor = LE.finiteFloor;` 整行摘掉时**全门禁零响应**
（R3b 是形态判据，只抓 `floor: finite(`，而 floor 的绝大多数用法是按名点名的 `finiteFloor(...)`，
名字还在就「看起来像走了契约」）—— V10 组把它逼了出来，R2b 是修法。
**判据自身的缺陷（本版 8 处，全部留痕）**：
① 用 python 的 `ast.parse` 校验 **JS** 源码（`invalid character '—'`）—— python 的 AST 判不了 JS，
   本版栽两次后固化：JS 的语法只能由 `node --check` 判；
② 负控制自证把 `index.js` 当成 `manifest.extra_js` 成员（实测它在 `manifest.js` 主入口）⇒
   守卫把健康仓判成结构漂移（**假红**，错误方向与判据失灵相反但同样要拦）；
③ V8 的点名串写错（点名必须逐字对得上，「红得对」与「红得巧」分不开）；
④ V14 的 target 多写一个 `]`（`node --check` 当场拦住）；
⑤ V14 的镜像项文件名写成了已存在的源文件（自我复制 ⇒ 构造不出被测形态）；
⑥ V14 的 target 少一层数组（`manifest.json` 成了同级元素 ⇒ ENOENT 崩在构造上）；
⑦ V13 的锚点只覆盖取库块的**第一行**（残留第二行 ⇒ 破坏后无法解析；守卫按纪律拦成「构造失败」）；
⑧ V14 行少两个**位置占位字段**（`marker`/`why` 被读成 `expectHits`/`expectCode`）。
**判据面扩面带来的夹具缺口（第 9 处，实测暴露）**：门禁新增 `await import('../_fixture_sync.mjs')`
后，`v3240` 的**逐文件**夹具（非整树 cpSync）缺真源 ⇒ 门禁在夹具里走 fail-closed `exit 2`，
而那个 2 会被读成「判据红了」（归因错）。修法：真源导出 `RUNTIME_DEPS`（**两项**，不是一项 ——
真源自己还依赖 `_audit_lib.mjs`；首版只列新加那个 import，是「按改动写清单」而非「按加载图写清单」），
并在 v3240 夹具里按它补件。
**门禁结果**：`scan_ledger_contract` `exit 0`（读数：「契约导出面 17 项（真源读数）｜关键函数 12 项
逐一为 function」「账本级名册 9 本（由 tests/_fixture_sync.mjs 派生，非手抄）｜名册登记 9 本｜
在场且在跑 9 本｜楼层取值口按名点名委派 6 本」）；其负控制 **14/14 成立**；
`v3207` 10/10、`v3240` 19/19、`v3242` 16/16、`v3243` 17/17、`v3245` 8/8、`v3246` 19/19。
**#18 反坐实**：`catalog_reference_consumers.tsv` 的重复行检查**早已存在**（门禁 R7 常驻，
`v3242` 的 E4/E5 已用真源码破坏钉住）⇒ 该项不必重做；实测四张 TSV 第一列全唯一。
## 2026-09-27 · v3.245.0（判据吃的药与门禁同一份 —— 负控制夹具自动同步，计划 #2）

**做了什么**：① 新增唯一真源 `tests/_fixture_sync.mjs`（清单提取一处收敛，含运行时派生识别）；
② 新增门禁 `tests/audit/scan_fixture_sync.mjs`（E1–E6，退出码 0/1/2）；③ 补
`tests/audit/scan_world_clock_reader_negctl.mjs`（8 组）；④ 补 `tests/v3245_fixture_sync.test.mjs`；
⑤ 4 份负控制补「卫生态对照」；⑥ `scan_world_clock_reader.mjs` 补 W7（判据不看注释）+ W4 收严。

**为什么**：负控制「跑绿」不等于「夹具喂满」—— 缺的文件会让门禁在 fixture 里提前 fail-closed
（`exit 2`），而那个退出码被负控制静默读成「结构漂移判据工作正常」。本版把 v3.240.0 / v3.242.0
两次**人工补救**升格为**常驻结构判据**：清单不再由谁记得去同步，而是每次都从门禁源码与
负控制源码里各自提取、当场对差。

**影响范围**：审计面 43 → 44 个脚本（负控制 13 → 14 份 / 门禁 28 → 29 份）；
`scan_world_clock_reader.mjs` 判据口径收严（可能暴露存量缺陷 —— 实测真仓仍全绿，8 项结构证据）；
`scan_ledger_contract_negctl` 与 `scan_v3193_host_matrix_negctl` 的对差读数从「有缺口」转为「零缺口」
（本版未改这两份的搬运清单 —— 它们的缺口由 E2 常驻判据点名，等候独立的收编改动，已登记在 TODO）。

**判据自身的缺陷（本版 4 处，全部留痕）**：
① 段号口径（新门禁 E6 只认数字段号、本文件段号是字母 ⇒ 数出 1 段自红）；
② 集合划分（E4 把负控制当成门禁 ⇒ 10 条荒谬缺陷）；
③ 派生识别（E2 对两份运行时派生清单的负控制误报缺口）；
④ 补丁幂等与转义层（整行复刻锚点 0 命中：源里是双反斜杠、且重跑必然 FAIL ⇒ 改行内定点替换）；
⑤ 新门禁在探针矩阵 T 档下**崩在 ESM 加载栈**（exit 1）：唯一真源也在 tests/*.mjs 扫描面里，
   静态 import 一个被掏空的模块 ⇒ 判据来不及跑、归因不可读（修法：动态加载 + 导出面逐项核对 ⇒ 如实 exit 2）。

**门禁结果**：`scan_fixture_sync` 通过（44 脚本 / 14 对负控制 / 逐对零缺口 / 每份有卫生态对照 /
每个门禁有观测点 / 活性面由目录真值点出）；`scan_world_clock_reader` `exit 0`；
其负控制 8 组成立 / 0 组失败；`v3245_fixture_sync.test.mjs` 8 项全绿。

---

## 2026-09-26 · v3.244.0（建议面带数值 —— 死代码预算的抬升建议，计划 #14 / P1）

**做了什么**：`tests/audit/dead_code_budget.mjs` —— ① 抽出**唯一算式**
`export function suggestCeiling(m, b)`（返回 `{ceiling, delta, measured, maxSlack}`，
纯函数：不读环境 / 不写盘 / 不改入参 / 不抛）；② `--bump` 改走同一函数
（原文自己又算了一遍 `m.total + b.maxSlack` ⇒ 一份算式两处代码，被 A2 判据当场抓红）；
③ 新增 `--suggest`（机器可读一行、零写盘、恒 `exit 0`）；④ 越界 / 余量过大 / 余量将尽
三种情形各给出**数值与可复制命令**；⑤ 「将尽」阈值抽成导出常量 `THIN_SLACK_RATIO`。
新增 `tests/v3244_budget_suggestion.test.mjs`（17 项，含 CLI 四态真跑与三组真源码破坏负控制）。

**为什么**：此前翻红只有结论没有数值 —— 越界只说「越了」、余量过大只说「脱节」、
余量将尽**毫无预告**；而「实测 + maxSlack」这个算式在 `--bump` 里已有一份，
读数面若再手写就是「一份契约 N 份拷贝」。

**判据自身的缺陷（本版 3 处，全部留痕）**：
① **判据该看代码，不看注释**：A2 用裸 `split(字面量)` 计算式出现次数，而我自己写的
解释性注释里引用了那个表达式 ⇒ 计数顶成 2、判据自红（与 v3241 A2 同款）。
修法：加 `stripComments` 再计数 + 给剥离器两向自证。
② **计数面差 1**：夹具文件带尾部换行 ⇒ `.split('\n')` 多数出一行（12 → 13），四态全错位。
修法：夹具不带尾部换行。
③ **保绿对照把被测对象弄坏了**：D4 把注释加在**首行之前**，而首行是 `#!` shebang
⇒ shebang 不再居中首行 ⇒ node 当语法错误 ⇒ 脚本跑不起来。修法：注释加在末尾。
④ **我自己违反了仓库的「唯一真源」纪律**（本版最有价值的一条）：为「剥注释再计数」
在套件里本地写了一个 `stripComments`，全量跑时被 `scan_audit_lib_consolidation.mjs` 抓红
——「仍在本地重写 stripComments（v3.191 已收敛到唯一真源）」。它抓得对：我在同一版里
刚写完「算式只有一处」的判据，转头就复制了另一条口径。修法：改 import `tests/_audit_lib.mjs`；
并改掉自证 —— 真源口径是**把注释位换成空格**（保长度、保换行），首版自证写「剥完更短」也翻红。

**影响范围**：审计脚本 1 个 + 新套件 1 个 + 五源抬版 + TSV 登记；**产品代码零改动**
（本版只动 `tests/audit/` 下的审计脚本，故活跃代码量与上界均不动）。

**门禁结果**：`v3244` 定向 17/17；死代码读数与 `--suggest` 真跑一致（建议 39801 = 39401 + 400）。

---

## 2026-09-26 · v3.243.0（别名与口径同族 —— numOrNull 归位「原样数」族）

**做了什么**：`ledger-entity.js` —— ① 新增 `finiteNum`（原样数原语，与全仓七处既有
`Number.isFinite(n) ? n : null` 判据逐输入等价，并继承 v3.242.0 的隐形空白口径）；
② `numOrNull` 由「转发 `finite`（取整）」改为「转发 `finiteNum`（原样）」，
`finiteFloor` 仍转发 `finite`；③ 新增第二张域声明表 `NUM_OR_NULL_DOMAINS`
（`outputs: ['null','num']` + `cases` 25 条）；④ 清除那句自相矛盾的注释并留痕
（「与 `finite` 同判据的另一个名字 —— 与 snapshot 对齐」：前半句取整、后半句不取整）。
门禁补 **R8**（名字即口径：取整族/原样族按名核对，转发递归判定）与
**R6b**（第二张表成表，且至少一条 num 样本），`finiteNum` / `NUM_OR_NULL_DOMAINS` 并入 R5 白名单。
新增 `tests/v3243_numornull_semantics.test.mjs`（17 项）。

**为什么**：v3.240.0 把 `finiteFloor` 与 `numOrNull` 当「同判据的两个名字」，
于是 `numOrNull` 成了取整版；而全仓另外七处同名函数都不取整。实测分歧 **5/18** 样本
（`0.5` / `-0.5` / `3.9` / `'0.5'` / `-0`）—— **同一次调用换个模块就换了答案**，
而两边注释都自称是同一个判据。`numOrNull` 管的是时间戳 / 字节 / 计数 / 版本号，
对这些量取整是丢信息而不是「规范化」。

**判据自身的缺陷（本版 5 处，全部留痕）**：
① **固定窗口取段会串表**（本版最值得记的一条）：R6b 沿用 R6 的 `slice(at, at+2600)`，
而第二张表后 **657 字符**就是 `FINITE_DOMAINS` ⇒ 窗口跨进下一张表、读到 **48 条**
（自己只有 25 条）、还能匹到别人表里的期望值。**是 D4 的负控制抓出来的**：
把第二张表 cases 抽到 2 条，R6b 仍绿。修法：`declSegAt(marker)` 按声明边界取段，R6 一并改。
② **同一个坑第三次**：`rows2.some((r) => r[1] === 'num')` —— `matchAll` 结果里
下标 1 是标签、2 才是期望值（上一行刚解构对，下一行又用回下标）。
③ **判据自己踩自己的禁语**：C1 找那句假注释，而套件源码为定义 `BAD` 直写了它 ⇒ 首跑自红；
改为把禁语**拼出来**。
④ **取函数体不能用第一个 `}`**：A3 截 `numOrNull` 体时被注释里的 `}` 截错；改为花括号配对。
⑤ **归因串的在场判据别写正则**：D7 的反引号+转义一叠就写坏；改 `includes`。

**影响范围**：契约模块 1 个 + 门禁 1 个 + 新套件 1 个 + 五源抬版 + TSV 登记；
**九本账与产品行为零改动**（本版只动取值契约的别名归属与门禁）。

**门禁结果**：`v3243` 定向 17/17；门禁真跑 exit 0（含 R6b/R8）；
负控制 V0–V7 全绿；死代码实测 39401 行、余量 278 ≤ 400（上界不动）。

---

## 2026-09-26 · v3.242.0（契约面三项深化 —— 看不见的空白 / `-0` / 域声明表）

**做了什么**：`ledger-entity.js` 三处 ——
① `text` 的隐形字符集具名化（新增 `const INVISIBLE = /[\u200b\u200c\u200d\ufeff\u00a0]/g`，
先归半角空格再走既有 `\s+` 折叠与 `trim()`；**刻意只收五类**，U+2000–U+200A 等 Unicode 空格同族
不拉进来 —— 那些是用户真写的空格）；② `finite` 的 `-0` 归一（`return f === 0 ? 0 : f;`，
输出集恰为 `null` / `+0` / 整数三种）；③ 新增 `FINITE_DOMAINS` 域声明表（`Object.freeze`，
`outputs` 三种形态 + `cases` 23 条，与实现**同文件同版本**）并入导出面（12 键）。
门禁 `scan_ledger_contract.mjs` 补 **R6**（域声明表成表）/ **R7**（登记表无重复行），
`FINITE_DOMAINS` 并入 R5 白名单；负控制夹具补搬 TSV 并支持子目录复制。
新增 `tests/v3242_contract_domain_table.test.mjs`（17 项：A 结构 / B 表驱动对拍 / C 空白口径 /
D `-0` 归一 / E 门禁真跑 + 三组真源码破坏负控制 + 保绿对照 + 工具两向自证 / F 自防护 + 版本锚）。

**为什么**：契约的**输入域 → 输出域**此前只存在于实现里，没有任何**声明** ——
「判据写得对不对」本身不可判。实测三处错读数：`text('\u200b')` 得长度 1 的串（看着是空串）、
`names('若雪,\u200b若雪')` 把同一个人记成两个人（去重键不再相等）、
`Object.is(finite(-0), -0) === true`（读侧形状判据把它与 `+0` 分成两态）。

**判据自身的缺陷（本版 4 处，全部留痕）**：
① R6 首跑报 22 项「表自相矛盾」—— `for (const [, exp] of rows)` 取到的下标 1 是**样本标签**
而非期望值，23 条全报「不在 outputs 里」；改为 `[, label, exp]`。留痕：**正则捕获组的下标
不是「谁看起来像」**。
② E 组取值姿势 —— `runGate` 回的是 `spawnSync` 的**原样对象**，只有 `withTree` 才折成
`{status, out}`；把两者当同一个形状 ⇒ 在 `r.out.slice(-400)` 上 `TypeError`。
红的不是判据，是**取值姿势**。
③ E2 破坏**没踩到判据线** —— 手抄 5 条换掉 1 条，23 条删完还剩 19 条（≥ R6 下限 10），
数量判据根本没被踩到，「破坏写进去了、结论却不变」看着像判据失灵；
修法：锚点改为**从真源码整段切出来**的 `cases` 数组体（恰中 1 次、掉到 3 条）。
④ **同一个坑第二次**（本版最值得记的一条）：`v3240` 的 A2 把判据钉在
「上一版实现的那一行字面量恰好 1 次」（`return Number.isFinite(n) ? Math.floor(n) : null;`）——
这是**实现的文本指纹**，被本版为 `-0` 归一而重写该行所误伤。同时误伤的还有它的
F1（手抄 5 行锚点随字符串判定收窄而过期）与 C3（钉在白名单尾巴 `]` 上，白名单长了就红）。
三处一律改为**行为锚**：检测器两向自证（缺陷样本必须命中 / 真源码必须不命中）、
锚点**从真源码就地切段**（并加形状断言）、白名单钉「名在场」不钉尾巴。

**影响范围**：契约模块 1 个 + 门禁与负控制 2 个 + 新套件 1 个 + 历史套件自纠 1 个
（`v3240`）+ 四源抬版 + TSV 登记；**九本账与产品行为零改动**（本版只动取值契约与门禁）。

**门禁结果**：`v3242` 定向 17/17；`v3240` 修订后 19/19；全量 `TEST_SUMMARY_JSON=… node tests/run.mjs --audit`：**223/223 文件、2181 断言、失败 0；audit 42/42**；结构摘要 `{version:"3.242.0", ok:true}`。（其中 1 个文件经「环境资源耗尽」重试后转绿，运行器已打印重试痕迹 —— 非判据失败。）

---

## 2026-09-26 · v3.241.0（抬版四源同步 + 失败汇总表）

**做了什么**：`scan_version_guard.mjs` 补 **V6/V7** —— CHANGELOG 顶节与 TODO「最近更新」
必须就是当前版本（**缺席容忍、在场必一致**，同 V1 对 package.json 的口径）；
报告行升级为**四源读数**（`manifest✓ package✓ CHANGELOG TODO`，缺席如实标 `(缺席)`）；
`tests/run.mjs` 补 `firstError(r)` 归因抽取 + 测试段与 audit 段合并的**失败汇总表**
（阶段|名|退出码|耗时|第一条错误）+ `TEST_SUMMARY_JSON` 结构化摘要；
新增 `tests/v3241_four_source_and_summary_table.test.mjs`（13 项，含一组 run.mjs 端到端真跑）。

**为什么**：① 版本守卫只查了**机器读的三份**，而发布面还有两份**人读**的 ——
抬版时最常漏，且漏了不会有任何机器读数报警（只在下一版被历史测试
`startsWith('## v'+CUR)` 抓住，那时归因已经远了）；②「门禁时只看汇总表」这句话
当时**没有可看的东西**：失败清单只活在输出流里，audit 段只给一行「通过 N/M」。

**判据自身的缺陷（本版 2 处）**：① A2 的「守卫版本无关」扫描把 V6/V7 新增的
**注释里**的版本示例算进去了 —— 判据该看代码不看注释，改为先剥注释；
② D1/D2 的夹具**原样继承了外层 harness 的注入环境**（本套件自己跑在 `node --test` 里，
`NODE_TEST_CONTEXT` 等标记被传给夹具的 run.mjs，再传给它的子进程，子进程 TAP 行为随之改变
⇒ 夹具里的退出码不再等于真判据结果，报「有红文件必须 exit 1」）。修法：夹具改用
`cleanEnv()` 剥掉 `NODE_TEST*` / `NODE_OPTIONS` 再跑 —— **夹具要把被测对象放到干净环境里跑**，
与 v3207 那次「红的不是判据，是夹具」同形。

**为什么两处判据同坏的负控制是必要的**：C3 让 CHANGELOG 与 TODO **各坏一处**，
要求 V6 与 V7 **同时点名** —— 若只测「坏一处能红」，另一条完全可以写成死判据而全绿。

**影响范围**：2 个基建文件（审计守卫 / 测试运行器）+ 1 个新套件 + 四源抬版 + TSV 登记；
**产品代码零改动**（本版只动门禁与运行器）。

**门禁结果**：v3241 定向 13/13；全量见本版收尾读数。

---

## 2026-09-26 · v3.240.0（账本实体契约 floor 一族：补完「没给 ≠ 给了 0」的另一半）

**做了什么**：`ledger-entity.js` 的 `finite` 本体由「`Number.isFinite(Number(v)) ? Math.floor(Number(v)) : null`」
改为**先挡「没给」与非数值**（`null`/`undefined`/空串/空白串/布尔/数组/函数 ⇒ `null`；
有限数含 0 与数字串 ⇒ 该数取整；`NaN`/对象/非数字串/`±Infinity` ⇒ `null`）；
新增两个**一行转发**别名 `finiteFloor` / `numOrNull`（同判据，按名点名用）；
三本原本自带 `text`+`finite` 拷贝的独立账（`recall-echo.js` / `echo-ledger.js` / `repair-loop.js`）收编进契约；
`scan_ledger_contract.mjs` 的 `BOOKS` 6→9、`MIN_BOOKS` 6→9、`NEEDS` 按账登记取值原语、新增 R3b
（floor 一族不得走 `finite(`，须走 `finiteFloor(`）、R3 扩「本地 `function finite(` 也不许」；
新增 `tests/v3240_ledger_null_is_not_zero.test.mjs`（8 组）。

**为什么**：v3.239.0 只改了 `snapshot-checkpoint.js` 模块侧的那一半，而**九本账共享的契约**
那一半没改 —— `finite(null) === 0` 仍把「楼层未知」写成「第 0 楼」，而 0 是合法楼层。
同一形态本仓修过三次（O-1 / R3-D / R4-E），每次只修出问题的那一处。
本版改的是**那份真源**：九本账全部改走它，判据只此一份，改一处就全都改到。

**本版探针当场抓到的真缺陷**：`scan_ledger_contract_negctl.mjs` 的夹具清单是**手抄的 6 本账**；
门禁下限抬到 9 后，负控制**自己先** exit 2，V0–V5 全线报「破坏不可归因」——
**红的不是判据，是夹具**，且那个 exit 2 会被静默读成「结构漂移判据工作正常」（空对空）。
修法：夹具清单改为**从门禁源码提取** `BOOKS` / `MIN_BOOKS` 并自证喂满下限，`V7` 点名随下限走。
同族第二处：`v3215` 的破坏副本原落 tmpdir **单文件**，`repair-loop.js` 改为
`require('./ledger-entity.js')` 后相对解析落空 —— 夹具改成一个**目录 + 一并拷契约**。

**判据自身的缺陷（本版 7 处，全在新套件首跑）**：`-0` 被 `Object.is` 判成非零；
`0.5` 被误放进「真给了数」样本（契约是楼层口径取整）；`seed.sweep` 是两参签名却只传一参；
E1 宿主形状写成 `_seedState`（实际 `h.worldProg.seedLedger`）⇒ 读到 `absent` 后 TypeError；
G1 负控制把 `NEEDS` 表切出 `SyntaxError`；A2 的 `includes` 恒真；
H1 版本锚（抬版前必红，属预期）。

**反向交棒**：`v3207` 第 2 组原把 `finite(null) === 0` 当「现行为忠实保留」，
与本文件第 3 组「`floor` 必须原样戳」**自相矛盾** ⇒ 判据在保护一个已被设计淘汰的状态，
改两态断言并留痕根因；第 5 组 `updatedFloor` 期望 0 → `null` 并补「真第 0 楼仍读 0」（两向自证）；
新增 `NO_REVISION_BOOKS` 分叉（三本独立账没有 revision 面）。
`v3234` 的 `N3` 破坏锚点交棒为 `floor: finiteFloor(s.floor)`，破坏形态改为**回潮到老判据**。

**影响范围**：10 个 `.js`（契约本体 + 九本账 + 门禁）+ 3 个测试文件 + 预算登记；
产品行为对既有读者**零变化**（floor 一族的取值只由「逢 `null` 得 0」改为 `null`，
真给了数的一律原样），新增键只增不改。

**门禁结果**：定向见本版收尾读数；全量 `npm test` + `node tests/run.mjs --audit` 逐段复跑。

---

## 2026-09-26 · v3.233.0（F-2 跨平台事件来源构成）

**做了什么**：`event-completeness.js` 新增 `SOURCE_PLATFORMS`（受控词表，冻结）、
`SOURCE_LEVELS`（extract / platform / other / none）、`sourceFace(raw)`（字面量精确分级，
`other` 保留原串）、`platformFace(state, opts)`（恒定九键构成面，计数恒为截断前真值）、
`platformLine(state)`（自检行），`EC_VERSION` 1 → 2；`evidence-workbench.js` 的事件账出处列
改为按**段真值**取首个有楼层的段（修前恒 null）+ detail 带来源构成，`EVIDENCE_VERSION` 1 → 2
（面键不变、取值更准）；`index.js` 自检新增「事件来源」行 + 快照新增 `eventPlatforms` 面 +
`_eventPlatformsFace()`（四态：module-unavailable / thrown / no-events / ok）；
新增 `tests/v3234_event_platform_composition.test.mjs`（24 项）。

**为什么**：段的 `source` 一直是 40 字自由文本，唯一赋值点是宿主写死的 `'extract'`，
`'phone:diary'` 与 `'phone:weibo'` 压成一态 ⇒ 下游答不出「这条是插件提的还是手机侧发生的」。

**本版探针当场抓到的两条真缺陷**：① 证据面事件账出处列恒 null（`copyEvent()` 产出顶层无 floor，
登记表照抄别账写 `finiteFloor(it.floor)`；同块 `it.status` 恒空是同一形态且已被修过）；
② `copySegment` 非幂等（共享契约 `finite(null) === 0` ⇒ 第二次归一化把「没给」塔成第 0 楼），
与 O-1 / O-2 / T8 同族。

**反坐实**：计划 F-2 把 `event-chain.js` 列为交付面，实测它是 agent run 生命周期校验
（`/platform/i` 零命中），与事件平台无关 —— 已写进套件判据 A3，不照抄计划行文。

**判据自身的缺陷（本版 1 处）**：`v3234 F1` 首版把「两个诊断标签必须分野」写成「标签命中恰 2 次」，
实测 8 次（每个分支各一个 return）；改为对**结构**断言（两标签各自只能接自己的读数函数）。

**抬版连带的接管**：`host_beast_baseline.json` 按当版 index.js 重建并新增 `rebuilds` 面；
`v3232 C1` 的「成员数/总行数 == 基线」退成「本套件自洽 + 代理真读数」（原写法一抬版就必红，
且会把「基线陈旧」错报成「实现漂移」）；`v3214` 两处把当版字面量当锤点的自证判据改为运行时取锚点；
`dead_code_budget` 37538 → 37960（实测 37560，`--bump` 留理由）；
`catalog_reference_consumers.tsv` 登记本版套件（跨仓守卫问题 1 → 0）。

**影响范围**：三个 `.js`（事件完整性面 / 证据面 / 宿主），产品行为对既有读者零变化
（新键只增不改；`evidence` 面键不变，只修取值）；旧档（`version: 1`）读出逐字不变。

**门禁结果**：定向 24/24；全量见 FOUR_RELEASE_PLAN 的状态检查点。

---

## 2026-09-26 · v3.232.0（F-3 同楼同刻读数 + F-6 口径自述）

**做了什么**：`scene-book.js` 新增 `coPresence(floor)`（同楼同刻 ≥2 在场的事实读数，
不含判断）与 `observationNotes()`（T17/T16 两条观察项的机器可读自述，纯读无副作用）；
`summary()` 带上两面；新增常量 `MAX_CO_PRESENCE_ROWS`；`tests/v3233`（15 项）。

**为什么**：`presence` 记着「谁在哪一楼」，却**没有出口回答「同一层楼里有没有两个人」** ——
而那正是冲突的事实前提；下游只能自己遍历再分组（同一口径抄 N 份的种子）。
T17/T16 两条观察项则一直只活在注释与文档里，下游无法在自己的诊断页如实转述。

**本版探针当场抓到的真缺陷**：`coPresence('没给')` 首版与 `coPresence()` 同义 ——
「给了但解不出」被当成「没给」，读数从空变全量而调用方看不出差别。与 O-1 同族，新形态为
「给了但解不出 ≠ 没给」；已改为返回空 + `rejected: 'floor-unparsable'`。

**影响范围**：`scene-book.js` 加两个方法 + 一个常量 + `summary()` 两键；产品行为对既有读者零变化
（新键只增不改）。**口径统一**：本版顺带把 `coPresence` 的地点键排序从码点序改为拼音序
（与名单同口径）—— 首版实现与判据**同时**用了裸 `.sort()`，两边都错而全绿，
这是「判据复制实现口径」的隐蔽形态，已在套件 B5 留痕。

**门禁结果**：定向 15/15；全量见 FOUR_RELEASE_PLAN 的状态检查点。

---

## 2026-09-26 · v3.231.0（P-2 index.js 宿主巨兽分诊）

**做了什么**：为 `index.js`（16922 行 / 占全仓 46%）立分诊基线 —— 成员切分（559 个）、
域账、外部引用面、拆分候选分诊；新增探针 + 基线 + `tests/v3232_host_beast_triage.test.mjs`（14 项）。

**为什么**：「它是巨兽」此前只是一句话，没有任何「长在哪几个方法上、哪些能搬、搬一块要改多少接线」的读数，
而没有读数就动 16922 行的宿主文件＝拿猜测改架构。

**读数**：TOP5 占 21.7%、TOP40 占 51.3%、10 条前缀域规则只覆盖 24.7%、over-80 行成员 32 个、
缝合模块 34 个 / 45 个引用点。

**结论（按读数否掉一个候选）**：「按域拆」不成立 —— 最大成员是生命周期接线本身（`onMessageReceived`
1217 行、外部引用仅 1 次 ⇒「低引用 ≠ 低耦合」）、引用读数只能当上界（同名成员 4/3 处）、
规则外互调 4696 处且九道门禁无一道检查跨模块可见性。唯一有读数支持的轴是「成员级预算 + 文件规模上界」，
**本版只立判据不动手**。

**影响范围**：只新增 3 个文件 + 参考基准追加一行 + 三源抬版；**产品代码零改动**。

**门禁结果**：定向 14/14；全量见 FOUR_RELEASE_PLAN 的状态检查点。

---

## 2026-09-26 · v3.230.0（P-3 快照外供面规模取证）

**做了什么**：为全仓唯一对外读数出口 `buildBridgeSnapshot()` 立规模基线 ——
四条缩放曲线（角色 / 生活详情 / 场景行 + 空宿主）、逐面字节账、两段成本拆解；
新增 `tests/audit/snapshot_probe.cjs` + `tests/audit/snapshot_baseline.json` +
`tests/v3231_snapshot_scale_evidence.test.mjs`（12 项，含三条负控制）。

**为什么**：「快照要不要瘦」此前**没有任何读数**能回答。读数是：空 117 B / 400 角色 35 917 B·1.253 ms /
1600 角色 124 597 B·5.158 ms，三条曲线近似线性；**characters 一面占 80.6%**；
成本 **65% 在深克隆段**，且**与字节成正比、与面数无关**。

**结论（按读数否掉一个候选）**：「砍面数」换不到收益 —— 13 面在手机端各有直接读者（无一面零消费）、
快照是出口不是缓存（去掉「每次重建」＝用陈旧读数换速度）、恒定承载面只占 3.3%。
唯一有读数支持的轴是**为按规模放大的面设每面预算 + 如实截断读数**，本版**只取证不动手**。

**影响范围**：只新增 3 个文件（探针 / 基线 / 套件）+ 参考基准追加一行 + 三源抬版；
**产品代码零改动**（口径：先量再定，不拿猜测改跨仓契约）。

**门禁结果**：定向 21/21；全量见 CHANGELOG v3.230.0 与 FOUR_RELEASE_PLAN 的状态检查点。

---

## 2026-09-26 · v3.229.0（P-1 死方法处置 —— O-6 挂账收口）

**做了什么**
- `index.js`：删除 4 处零引用方法定义（`_legacyHybridMerge` 38 行 / `callGeneric` 9 行 /
  `breakPromise` 5 行 / `queryByFloor` 1 行，共 53 行）；3 处历史注释改述。
- `tests/audit/scan_wiring_dead_methods.tsv`：改为**处置台账**（`# [已删·分类] 方法名 — 理由`），
  零引用集合归零；台账首段写明「空集合是期望状态，不是基线失效」。
- 新增 `tests/v3230_dead_method_disposal.test.mjs`（9 项）；登记进 `catalog_reference_consumers.tsv`（214 → 215 行）。
- `v3229 D1` 当版锚交棒（精确 → 下限）；三源版本 3.228.0 → 3.229.0。

**为什么**
- O-6（v3.227.0）把「定义在 index.js 里却没人调」的方法从 93 条误报降为 4 条冻结台账，本版把 4 条**处置掉**。
- O-6 台账里那条「删 `_legacyHybridMerge` 需连配置键一起处置」是**推测**，实测不成立
  （`hybridAlpha` 的活消费点是 `hybridMerge()`，与它无绑定）。这条反坐实必须留痕。
- 台账是双向判据；集合归零后它与实测都是空集，**空对空的绿是会骗人的**，故另立判据钉住「确实是空的、确实是删了的」。

**同轮修掉的三处判据自身缺陷**（本仓一贯：判据自身的毛病比实现缺陷更值得记）
1. `v3156 [4f]` 断言 `=== 2`（两条读 α 路径并存）—— 判据在保护已被设计淘汰的状态，改 1。
2. `v3228 B1/B2/N3` 在空集合上退化成「空对空 / 空跑」—— 改造为「空集合 + 台账记账 + 理由齐备」，
   N3 升级为整仓镜像端到端负控制。
3. **`v3230 N1` 首版负控制假绿（本轮实测）**：探针方法名字面量写在判据里 ⇒ 被 A7 的 `tests/` 扫描面
   当成「有一条测试引用」⇒ 读数落进 A7.2 仅测试引用、A7.1 零引用仍 0 ⇒ **破坏没被观测到**。
   修法：探针名运行时拼接。形态是「判据自扫把自己当成了被观测对象」。

**影响范围**
- 删除面：4 处方法定义（无调用者，删除不改变任何运行路径）；配置键面**零影响**（实测为活配置）。
- 判据面：TSV 语义（冻结基线 → 处置台账）、v3228 B1/B2/N3、v3156 [4f]、v3229 D1。
- 测试面：+1 文件（v3230，9 项）。

**门禁结果**
- 定向 9/9；全量 209 文件 / 1932 断言 / 0 失败（含新增 v3230）；`--audit` 42/42 RC=0。
- A7 读数：零引用 4 → 0；`scan_config_liveness`、`scan_wiring` 均 exit 0。
- 死代码预算无需 `--bump`（实测 37184 < 上界 37538）。

**边界**
文本形态口径（不解析 AST）；删除不可回滚（保留面由 v3230 A2 钉住）；宿主实机未验。

## 2026-09-24 · v3.211.0（事实类型从登记到注入 —— 计划 L-F1 后半）

**做了什么**
- `fact-version.js`：`REASONS` 十态（新增 `unknown-type`，与 `none` 可分、带 `unknownType` 归因）；
  条目字段 `conflictPolicy` 落盘（旧条目读回 `auto`）；`lookup` 新增 `multiple`（带 `multi: n`、
  `from` 升序 + `id` 字典序稳定排序）/ `ambiguous` 两态可分；撤回 `pairKeyFor`（值并入对键实测有害）。
- `index.js`：extractionPrompt 新增 `9l. facts` 规则段与 schema 的 `facts[]` 字段；配套配置迁移
  `v3.211-facts通道`（对面版本之前的持久化提示词真跑 fuzzy-patch，exact 命中 1 次 + 幂等 + 负控制 notfound）；
  新增 `typedFactsBlocks()` 消费 `MT.typedBuckets` / `MT.routeForType` / `MT.policyOfType` 三个零调用出口，
  稳定块/波动块**分开 push** 进 `buildInjection`。
- 常驻标记三处真源同步 12 → 13（index.js `RESIDENT_MARKERS` / injection-router.js `RESIDENT_PREFIXES` /
  cost-ledger.js `RESIDENT_FALLBACK`），波动块标记**不入**常驻表。
- 新增 `tests/v3211_type_to_injection.test.mjs`（11 组 / 134 断言），登记进 `catalog_reference_consumers.tsv`（195 → 196 行）；
  死代码预算无需 `--bump`（余量 122 / 上限 400）。
- 三源版本 3.210.0 → 3.211.0。

**为什么**
- 真跑实测（不是读源码推算）：三个出口在宿主侧**零调用点**（`routeForType` / `typedBuckets` / `policyOfType`），
  `buildInjection` 里类型系统一个字都没有 ⇒ 九类事实**从不进模型上下文**，只活在 `selfCheck` 诊断行。
- 落笔侧第一通道读 `extracted.facts[]`，但 schema 里没有 `facts` 字段 ⇒ 该通道**真实运行中不可达**。
- 拼错类型名返回 `{ok:true, reason:'none'}`，与「真没有」**完全同形**（查询侧的「规则错读成普通事实」）。
- 两条 coexist 并存被读成 `ambiguous`（矛盾未决）⇒ 语义上它们是**并列**事实。

**本版抓到的缺陷（都已修，都在 CHANGELOG 留痕）**
- D1 🔴 **键名一致性**：`assertFact` 写入侧原写 `conflict`（返回体上的布尔），而 `copyFact` 已按
  `conflictPolicy` 读回 ⇒ 策略在落盘后**丢失**、coexist 写入退回 auto、`lookup` 报 `ambiguous` 而非 `multiple`。
  修法是让写入侧用与入参同名同义的 `conflictPolicy`，并在注释里钉住「不得叫 conflict」的理由。
- D2 🔴 **迁移块落点错位**：facts 迁移块原被插进 summary 迁移 `if` 的 **else 分支内部**，
  其 `_fuzzyPatchRead` 尾部成孤行。用行号手术整块（33 行）摘除并移到同级兄弟位置。
- D3 🔴 **含花括号字面量内联破坏配平**：迁移块里内联的 JSON 锚点串让 `scan_claim_truthfulness`
  的裸花括号配平算歪，`loadConfig` 区间被算短 ⇒ F1 误报 4 处「方法无失败出口」⇒ `v3159` 翻红。
  修法是把锚点提到类外，方法体内只留标识符引用。

**门禁结果**
- 全量 `npm test`：**190 文件 / 1643 断言 / 0 失败文件**（含新套件）。
- 关键审计六项全绿（module_wiring / version_guard / audit_lib_consolidation / config_liveness /
  syntax / cross_repo_binding）；`scan_audit_lib_consolidation` 的 E1 例外表新增
  `tests/v3211_type_to_injection.test.mjs`（同 v3210 形态：真源 stripComments + 真源 braceMatch 的串联）。

（记忆类型系统 —— 计划 L-F1）

**做了什么**
- 新增 `memory-type.js`（187 行，零依赖，挂 `window.LonShaMemoryType`）：9 类型 × 6 策略注册表；
  `normalizeType` 未知即拒、`inferType` 只作提示、`routeForType` 只给路由键 `typed:<type>`、
  `lineByType` 只认显式标注。
- `fact-version.js` 策略化：条目加 `type`（不透明存储）、`factFp` 纳入 `type`、
  新增 `CONFLICT_POLICIES` 四态（`auto`/`coexist`/`prefer-new`/`forbid`）并进 `api` 导出面、
  `assertFact` 吃 `conflictPolicy`、`lookup` 加 `wantType`、`line` 加类型分布。
- `index.js` 三处接线：取库口 `_memoryTypeLib()`（类体外）、`_absorbFactVersions` 五类字段类型化分派
  + 三态读数 `_memoryTypeRead`、`selfCheck`「记忆类型」诊断行。
- 新增 `tests/v3210_memory_type.test.mjs`（613 行，14 组 / 189 断言），登记进
  `catalog_reference_consumers.tsv`（194 → 195 行）；预算 `--bump`（ceiling 34336 → 34690，实测 34290 + 400）。
- 三源版本 3.209.0 → 3.210.0；`manifest.extra_js` 60 → 61（`memory-type.js` 紧随 `fact-version.js`：
  它包装账侧 `assertFact`，被包装方须先加载）。

**为什么**
- 修前实测：事实账**没有类型维度**（`grep -rn 'TYPE_REGISTRY\|MEMORY_TYPES'` 零命中），
  `{subject, predicate, value, origin, from, to}` 是唯一形状 —— 「喜欢喝奶茶」「魔王被打败了」
  「A 与 B 是师徒」同形、共用一套处置。后果是**数据在、规则用错**：世界规则被换代顶掉、
  事件结果与人物状态互相换代、旧偏好赖着不走、矛盾的世界规则照常并存。
- 落笔侧 `_absorbFactVersions` 只吃 `extracted.facts` + 一个「所在」地点，`status_changes` /
  `relationships` / `items` / `cse_states` 四类已有数据一条都没进账（数据在，落笔时被丢）。

**本版抓到的缺陷（都已修，都在 CHANGELOG 留痕）**
- D1 🔴 **本地重写了 `tests/_audit_lib.mjs` 的 `braceMatch`**（同口径第二份实现）——
  由 `scan_audit_lib_consolidation` 的 E1 结构面当场点名，且连带 `v3159` 一起翻红。
  修法是**委托**而非改名：真源 `braceMatch` 只跳字符串、**不跳注释**（实测在 index.js 类体上返回 `null`），
  故组合真源 `stripComments`（等长占位）+ 真源配对，长度映射回原文。
- D2 判据把「同值复述」两种语义（同楼层 = 幂等复述 / 不同楼层 = 新版本落账）压成一条 → 拆两侧。
- D3 判据拿拼好的字符串 `endsWith('true')`（实际打在 `reason` 上）→ 改逐字段断言。
- D4 判据 `!mtSrc.includes('injection-router')` 扫到模块**注释散文**（本仓明令禁止的文本包含式判据）
  → 改结构化：拿宿主真 `IR.PARTITIONS` 比对九类型路由键。
- D5 `seg(src, a, '}')`：`}` 在 index.js 出现 5958 次，违反「锚点须各命中一次」→ 不放宽 `seg`，
  另配 `fnBody` / `sliceFrom`。
- D6 `v3209` 的 `extra_js === 60` 硬数字锁在新模块登记后翻红 → 抬到 61 并注明来由。

**自伤（留痕）**
- 本套件首跑 136/3：三处失败里 **D1 是真缺陷**（会连带其他套件），D2/D3 是判据自伤，
  D4 是假红。修后 189/0。
- 全量门禁首跑 18 文件翻红：17 个是「CHANGELOG/TODO 未写顶节」（本仓所有套件都校验顶节），
  1 个是 D1，另 `v3209` 是 D6。

---

## 2026-09-24 · v3.209.0（迁移、恢复与运行时兼容性收口 —— M-P2 后半）

**做了什么**
- 新增 `schema-migration.js`（200 行，零依赖）+ `module-registry.js`（137 行，零依赖），并登记进 `manifest.extra_js`（58 → 60）。
- `index.js` 四处接线：取库失败登记表（`_moduleFailures` / `_noteModuleFailure` / `_moduleFailureSnapshot`）、
  两个取库口（`_schemaMigrationLib` / `_moduleRegistryLib`）、`restoreFromPayload` 的**旧档方向**、`selfCheck` 两行。
- 新增 `tests/v3209_migration_registry.test.mjs`（480 行，14 组 / 175 断言），登记进
  `catalog_reference_consumers.tsv`（193 → 194 行）；预算 `--bump`（ceiling 33870 → 34331，实测 33931 + 400）。
- 三源版本 3.208.0 → 3.209.0（`index.js` VERSION / `manifest.json` / `package.json`）。

**为什么**
- 修前实测：`restoreFromPayload` 对 `schemaVersion` **只处理一个方向**（`_sv > 当前` 才报警），
  「存档比插件旧」完全无人处理 —— 旧档被逐字段塞进新运行时，而全仓**零迁移函数**（59 个根模块里
  `migrat` 只命中 14 处且全属「检查/上报」）。计划 M-P2「数据迁移与恢复能力」点名的就是这个。
- 探针实测（`/tmp/probe209a.mjs`）：`_moduleLib` 把一个**存在但语法错**的模块吞成与「没这个文件」
  **完全同形**的 `null`；6 个账本模块真依赖 `ledger-entity.js`，顺序正确但**没有任何判据守着**
  （探针 209b 把 `ledger-entity.js` 挪末位，抛错模块 5 → 7）。计划 M-P2「脚本加载与运行时兼容性收口」点名的就是这个。

**本版抓到的三处真缺陷（都已修，都在 CHANGELOG 留痕）**
- D1 `orderCheck` 对「依赖表里出现不在清单中的使用方」返回 `ok:true`（探针实测）。
- D2 `plan()` 的 `no-payload` 分支被 `absent` 遮蔽（不可达），非对象载荷被误诊成「旧载荷」。
- D3 `_moduleLib` 里 `_noteModuleFailure(...)` 未判可达 → 在「登记者不可达」的环境（`tests/v3173`【C1】
  用 `new Function` 单独重放该函数）抛 `ReferenceError`，**降级当场变崩溃** —— 恰好违反它自己上一行注释的纪律。
- D4 `tests/v3209` 自己的末尾汇总用裸 `console.log`（用例异步跑、该行同步执行）⇒ **恒打印「通过 0 / 失败 0」**；
  由「175 断言」与打印值不符核对出来，改为 `process.on('exit', …)`，并加组 14 扫全目录。
- D5 同款死读数在 `tests/v3208`（**上一版留下的既有缺陷**），被组 14 的扫描一跑就点出来，一并修正。

**自伤（留痕）**
- 首版 `line()` 把 `unknown` 的两类成因压成同一个读数（冒烟 22/23 当场抓到）。
- 迁移块首版写在 `const dry` 声明之前 ⇒ TDZ `ReferenceError` 被外层 `catch` 吞成日志（静默不生效）；
  **首次「修正」只改了注释、没搬位置**，本版实测复现后才真正搬移。
- 同一搬移里补丁切点落在 `catch` 行内部，把 `errLog(...)` 劈成 `errL` / `og`，而 **`node --check` 返回 0**。
  教训：语法通过不等于没被劈开；切段一律按行 + 每步断言行内容。
- 套件自调试四处口径错误（`schemaOf([])` 应为 `absent` 非 `no-payload`、探针数组当读数串、
  折叠阈值只有单向断言、留痕注释被 `catch` 判据当活代码扫成假红）+ 主动删掉一条自己留下的恒真假断言。
- D3 的修法又引出一次审计翻红：内层空 `catch` 把 `scan_claim_truthfulness` 的「真正空白 catch」从 14 顶到 15。
  **没有放宽上限**（那是把棘轮拆掉），而是按该扫描的原意补「为什么吞」的注释。
- 首次 `dead_code_budget --bump` 的 `note` 里把 `schema-migration.js` 写成「189 行」（实为 200），
  重跑 `--bump` 按真测值改正 —— 写文档时的行数一律现测。

**影响范围**
- `index.js` 的 `_moduleLib` 行为**不变**（失败仍返回 `null`，只是不再丢证据）；
  `restoreFromPayload` **默认不改数据结构**（须 `opts.migrate === true`），既有调用方行为不变。
- `manifest.extra_js` 尾部多两项；`dead_code_budget` 上界随活跃量上抬。

**门禁结果**（真跑落盘：`/tmp/last.log`、`/tmp/lasta.log`、最终确认 `/tmp/fin.log`、`/tmp/fina.log`）
- `npm test`（全量）：**188 文件 / 1638 断言 / 0 失败 / EXIT 0**（最终确认 69.3s）。
- `node tests/run.mjs --audit`：**42/42 审计脚本通过 / EXIT 0**（最终确认 23.1s）。
- `v3209`：15 组 / 183 断言 / 0 失败（534 行）；`scan_syntax` 314 文件可解析；
  `scan_module_wiring` 61/61 真加载、已挂载未消费 0；`scan_claim_truthfulness` 真正空白 catch 14（上限 14）；
  `scan_cross_repo_binding` 在役 188 / 问题 0；`scan_version_guard` 当前 3.209.0 / 问题 0；
  `dead_code_budget` ceiling 33870 → **34336**（实测 33936）。
- 首跑曾 18 文件红：17 个是「CHANGELOG 顶节须为本版」（当时还没写），1 个是真缺陷 D3；两者处理后复跑全绿。

**做了什么**
- 36 个文件的本仓绝对路径（`/home/user/lonsha-memory-plugin/…`，共 60 处）→ `REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))`，语义等价、位置无关。
- 17 个死桥测试整体退役到 `tests/archived/`（git mv + 退役说明头）：199 → 182 个在役测试。
- 新增 `tests/audit/scan_cross_repo_binding.mjs`（P1 绝对路径 / P2 兄弟仓+相对逃逸 / P3 参考基准一致 / P4 退役复活 / P5b 退役面哈希冻结；exit 0/1/2）。
- 新增两张登记表：`catalog_reference_consumers.tsv`（在役面，只记文件名）、`catalog_version_guard.tsv`（退役面，文件名 + sha1）。
- 新增 `tests/v3204_no_cross_repo_binding.test.mjs`（18 组，含十组负控制 + 保绿对照 + 可移植性证明）。
- 清掉 `v3165` 一条无判据价值的绝对路径占位断言；`v3203` 交棒到 3.204.0；TODO 销账 T2、新增 T6。

**为什么**
- 实测：整仓复制到 `/tmp/portable/lonsha` 后门禁 **EXIT 1**。绑本机路径 = 绿是假绿、红是假红。
- 17 个文件断言的是 ruby-phone 旧一代桥（`queryPhoneMemory` / `backfillDiaries` / `syncClock` …），
  这些方法在活体项目 2.6.0 → 2.92.0 里已整体移除 → **换成活体树后 17/17 全红**。
  即门禁的一半判据在守一份无 git、停在 2.6.0-modular 的死快照。
- 定位时发现 v3.202.0 记的 T2（「并行假红 / 依赖 `/tmp/ruby-phone-work`」）三项全过期：
  路径不在 /tmp、并行不红、单独跑 17/17 通过。真问题是跨仓绑定 + 死快照。

**影响范围**
- 在役测试 199 → 183（退役 17、新增 v3204）；`tests/archived/` 18 个文件。
- 36 个测试文件 + 1 个 audit 探针被改写（去绝对化）。
- 新增 1 个审计脚本（audit 面 37 → 38）与 2 张登记表、1 个负控制夹具。

**门禁**
- `node tests/run.mjs`：**183 文件 / 1568 断言 / 0 失败 / EXIT 0**（57.0s）；`--audit` 38 个审计脚本全通过。
- `scan_cross_repo_binding.mjs`：在役 183 / 退役 18 / 参考基准 183 / **问题 0**。
- 可移植性（本版核心）：改动前 `/tmp/portable/lonsha` EXIT 1；改动后 EXIT 0。
- `v3204` 18 组全绿（含十组负控制 + 保绿对照 + 失败关闭）。

**踩坑留痕**
- **换行符与「裸扫描」的先后**：第一版把守卫写成裸文本扫描，结果 10 条命中全部来自注释散文
  （「历史上兄弟树叫 ruby-phone-work」）。判据必须在代码上做 —— 但改成剥注释后又要处理
  「剥完变空 = 纯注释行」的豁免，否则 stripComments 把注释整段抹掉、Guard 反而看不出那行是注释。
- **守卫会把自己的词表当缺陷**：v3204 首跑被 P1/P2 命中 8 处 —— 全都是它自己的负控制注入串。
  修法：负控制针料移入 `fixtures_xr_negative.json`（守卫只扫 `.mjs`），并把「在役面只登记文件名、
  不记内容哈希」定成纪律 —— **记哈希会让每次改测试都欠一次维护，那是 T1 式抬版仪式换马甲**。
- **Windows 盘符分支撞上正则转义**：`[A-Za-z]:\` 被 `type:\`（正则字面量里的转义串）命中。
  收成 `(?:^|[\s'"`(,=\[])[A-Za-z]:[\/]` 后消失。
- **ESM 里 `require` 会炸**：v3204 第一版用 `require('node:fs')`，与 `--test` 的 ESM 上下文冲突。
- **守卫太松的第三次（本版内）**：抬版后 `scan_version_guard` 报 `当版 frontier 32` —— 去绝对化注记
  里的「[v3.204.0]」落在前 12 行，被 `head.includes('v' + current)` 误判为 frontier 豁免，
  V2/V3 对 32 个文件静默失效。判据收成「同一行同时含本文件名与当版号」。教训再三出现：
  **守卫的宽严必须自己带负控制**，否则「放宽一点」总是无声的。
- **负控制载荷不能住在被测源码里**：v3203 的 `vnum('9.999.0')` 与当版锚点字面量写在自身源码，
  抬版后它不再是 frontier，守卫就把它的载荷当成缺陷（V3）——负控制把被测系统弄红了，
  那「红」就不再可归因。两款夹具（`fixtures_vg_negative.json` / `fixtures_xr_negative.json`）
  就是这条纪律的产物。
- **锚点冗余会腐蚀负控制**：N4「删空当版锚点」在新增 v3204 后失效（删了 v3203 的锚，
  v3204 的锚还在）；N5「改 frontier 头」同样。二者改为遍历全目录、删/改**所有**命中项。
- **静态 import 说明符不能走模板**：探针里的 `import … from '<绝对路径>'` 换成 `${REPO_ROOT}` 会语法错误，
  必须改相对导入。以及一处 `const src` 在 `import` 之前触发 TDZ，需连声明块一起上移。

---
## 2026-09-24 · v3.203.0（版本守卫交接 —— 拆掉抬版仪式，改由版本无关的守卫守门）

**做了什么**
- 9 处硬等号改「三源互等 + `vnum(v) >= vnum(<出生版本>)`」；21 个后继文件的下界逐文件回退到出生版本。
- 7 处交棒链断言（v3159 [3b] / v3161 [4c] / v3162 [4d] / v3164 【4】 / v3165 【4】 / v3168 G /
  v3185 19,20 / v3186 23）统一改为版本无关的「下界不得高于现版」，自防护指纹同步更新。
- 新增 `tests/audit/scan_version_guard.mjs`（V1 三源同源 / V2 不得硬锁当前版 / V3 下界不承诺未来 /
  V4 当版锚点在场 / V5 结构面；exit 0/1/2；版本无关，抬版时不用改）。
- 新增 `tests/v3203_version_guard_handover.test.mjs`（16 组，含六组负控制 + 保绿对照）。
- 发布：三源抬到 3.203.0；CHANGELOG 顶部插 v3.203.0 节；v3202 的硬等号与顶节断言按交棒口径交出；
  TODO 删掉 T1（销账）。

**为什么**
- T1 记的是「每次抬版人工改 21 处，漏一处翻红」。但本轮实测真正的机制更贵：不只是那 9 个文件，
  而是一整套「交棒链」—— 21 个后继文件把**别的文件**的下界手工抬到当前版，与上游硬等号互为锁扣：
  只改一边，另一边立刻翻红。`git log -S` 确认这些数字正是 v3.202.0 那次提交一起改上去的。
- 本条不修「某处写错了」，而是把「抬版」这件事从**必须手工做对**改成**结构上不需要做**。
  假红的真正代价不是浪费一次重跑，是培训出「红了先重跑」的习惯 —— 那会让真红也被忽略。

**影响范围**
`index.js`（VERSION）、`manifest.json`、`package.json`、`CHANGELOG.md`、`TODO.md`、
`tests/`（1 新测试 + 1 新审计 + 24 个历史文件改口径 + 1 个 frontier 交棒）。

**门禁**：199 文件 / 1637 断言 / 37 审计脚本 / **EXIT=0**（上一版 198 / 1621 / 36）。

**本轮踩到的坑（已留痕）**
1. 新审计脚本把 `package.json` 写成必读，会让 v3159 `[2d]`（健康树夹具）翻红 ——
   `runInScratch` 不物化 package.json（它是构建产物，不进插件分发）。改成可选。
2. V2 初版用动态 `RegExp` 拼 `current`，转义层数一多就静默失灵：负控制 N1 注入
   `assert.strictEqual(v, "3.203.0")` 时它仍报 exit 0。随后收窄成只认单引号，双引号形态又被放过。
   最终改为纯字符串判定 + 引号三态全认。**审计脚本自己失灵 = 报告一切正常**，这条判据自己踩了两次。
3. 拆链时发现 `v3161` / `v3162` 改用运行时算出的 `cur` 比较后，身上一个 `vnum('X.Y.Z')` 字面量都没有，
   于是下游六条「应有版本下界断言」同时翻红 —— 补回各自出生版本下界才一次性转绿。
   教训：**把判据做成版本无关时，要同时保住「结构性锚点仍在场」这条不变量**，否则放宽一处、收紧六处。

## 2026-09-23 · v3.202.0（三方向并行收口 · 第三次/第四次复发同族缺陷）

**做了什么**
- D1 回滚面拓深：`ledger-replay.js` 新增九账统一 helper + 并入 `FLOOR_OWNERS`（33 → 42 本账）。
- D2 携带面拓宽：`CARRYOVER_CONTRACT_KEYS` 26 → 38 键，新增 `CARRYOVER_EXEMPT_KEYS`（14 键，带理由）。
- D3 差集守门：新增 `tests/audit/scan_v3202_carryover_archive_diff.mjs` + 9 组负控制。
- 测试：新增 `tests/v3202_carryover_rollback_breadth.test.mjs`（22 组）。
- 发布：四源抬到 3.202.0；11 文件 frontier 集合 + 9 个硬绑版本守卫同步；v3116 行数上界 32450 → 32700；
  `v3201` 测试 18 的顶节断言改为滚动口径。

**为什么**
- 本仓已两次治理同一族缺陷（v3.168「写侧不产出=读侧死分支」、v3.182「新增子系统忘了接回滚」），
  v3.194~v3.197 新增的九本账把两条路同时踩了一遍 —— 属**治理面没跟上机制增长**的结构性问题，
  不是孤立 bug。D3 的意义在于把「忘了登记」本身变成红灯，而不是再修一次具体漏项。

**影响范围**
`index.js`（携带面四侧 + 两个常量表）、`ledger-replay.js`（登记表 + 5 个新 helper）、
`tests/`（1 新测试 + 2 新审计 + 9 个旧守卫抬版 + 1 个旧断言改口径）、`CHANGELOG.md`、新增 `TODO.md`。

**门禁**：198 文件 / 1621 断言 / 36 审计脚本 / **EXIT=0**（上一版 197 / 1599 / 34）。

**本轮踩到的坑（已留痕）**
1. 门禁**并行跑**会因外部依赖缺失产生 8 个假红 —— 判真假必须单跑（见 TODO T2）。
2. 我加的 `seed.diaries` / `seed.status` 承接分支被 v3.168 的 B 判据正确报为死分支（生成侧不产出），
   据其撤销并入豁免 —— **旧判据抓住了新补丁的错**，这是判据面在起作用而非阻碍。
3. `bodyOf` 对 `xxx(options = {}) {` 只截到形参花括号（得回 `{}`），
   种子两方法体的抽取因此为空 —— 本版测试自持 `methodBody` 收口（该坑写进了测试注释）。
4. 简写对象键（`statusFlat,`）被 `key:` 口径的抽取器漏掉 —— 与 v3.168 记录的同一个坑，本轮重现。

## 2026-09-24 · v3.205.0（基建不得假装通过 · 五项积压一次收口）

**做了什么**
- T3 行数上界唯一真源化：新增 `tests/audit/dead_code_budget.json`（15 条 history）+ 导出口
  `dead_code_budget.mjs`（`--bump` 必须带 `--reason`、只抬不降）；`v3116` 改为 import 真源，
  并额外守「余量 ≤ maxSlack」（余量过大本身即判据失效）。
- T4 容器字段派生化：`ledger-replay.js` 新增两份**派生**集合（shift 侧含 floor / drop 侧排除 floor），
  两处容器循环共用容器名清单；修掉中途自伤回归（v3202 测试 4）。
- T5 复核并固化：`ledger`(=this.ledger/FloorLedger)、`echo`(=this.echo)、`echoLedger`、`recallEcho`
  **四方不同源**；固化为 `scan_v3202_carryover_archive_diff.mjs` 的 P5（真源须在宿主验证到 +
  理由不得称「同源」）。
- T6 覆盖率转移判据化：`catalog_version_guard.tsv` 加第三列 `covered_by`；`scan_cross_repo_binding.mjs`
  新增 P6（缺列 / 空洞引用 / 空理由 / 地板）；`v3204` 加 4 组负控制 + 1 组保绿对照。
- T7 真根因两条：① 孙进程泄漏（`detached` + 按进程组杀）；② 环境资源耗尽冒充判据失败
  （窄指纹 + 明示重试 + 汇总点名）。配套新增 `TEST_FAIL_DUMP` 失败现场落盘。
  另把 `v3159` 的 44 次串行 spawn 改受控并发池（49.5s → 17.4s），**未动任何阈值**。
- 发布：三源抬到 3.205.0；新增 frontier `tests/v3205_infrastructure_truthfulness.test.mjs`（18 组，
  含 3 组 T7 负控制）；`catalog_reference_consumers.tsv` 补登记；TODO 五项销账。

**为什么**
- 这五项的共同形态是**判据失灵时门禁照报绿**。它们不是「某个数字没写对」，而是
  「怎么知道它还没修」这个问题本身没有机器答案 —— 于是 v3.202 记下的四项拖了两版，
  T7 更是记了三个月没定住。
- T7 的教训最贵：**取证方法本身没被取证**。原记录（和我自己的第一轮探针）测的
  `tests/syntax-gate.mjs` 根本不存在，于是「47–62ms，远低于 6000ms 阈值」这个结论
  建立在 404 上。修正被测对象后，真根因浮出水面，且两条都与阈值无关 ——
  TODO 自己写的「不要先改阈值 —— 阈值不是病根」是对的，但它连「病根在哪」都还没定位。
- 因此本版把 T7 的验收协议从「连跑 ≥10 轮」补成「连跑 ≥10 轮 **+ 失败现场落盘**」：
  没有现场的长跑只能产出「又红了」，不能产出结论。

**影响范围**
`ledger-replay.js`、`tests/run.mjs`、`tests/v3116_dead_code.test.mjs`、
`tests/v3159_audit_failclosed_and_fallback_parity.test.mjs`、
`tests/v3203_version_guard_handover.test.mjs`、`tests/v3177_syntax_gate_perf.test.mjs`、
`tests/audit/scan_cross_repo_binding.mjs`、`tests/audit/scan_v3202_carryover_archive_diff.mjs`、
`tests/v3204_no_cross_repo_binding.test.mjs`、新增 `tests/audit/dead_code_budget.{json,mjs}`、
新增 `tests/v3205_infrastructure_truthfulness.test.mjs`、两张登记表、`CHANGELOG.md`、`TODO.md`。

**门禁**：184 文件 / 1591 断言 / 39 审计脚本 / **EXIT=0**（上一版 183 / 1568 / 38）。
T7 验收：修后干净连跑 12/12 全绿（31.9–51.8s）。

**本轮踩到的坑（已留痕）**
1. **被测对象不存在**：`tests/syntax-gate.mjs` 是幻觉路径，真实门在 `tests/audit/scan_syntax.mjs`。
   报告任何读数前先 `ls` 一下被测对象。
2. 沙箱进程数上限导致后台长跑批中途崩（`fork: Function not implemented`）；验收须受控分批。
3. `pkill -f '<repo>'` 抓不到 argv 为相对路径的 audit 孙进程 → 漏杀 → 后续轮次被抢 CPU
   （同构建 31.9s ↔ 94.5s）。
4. 跑批中途改文件会自伤（临时夹具被 P3 登记判据抓到，v3159/v3204 双红）——跑批期间只读。
5. 判据放宽与收紧要分别论证：`v3203` 的 frontier 断言在「真仓库面」放宽为「≥1」，
   但在**负控制**里反而收紧为「与基线逐位相等」（`=== 1` 在注记被蹭宽时会静默失效）。
6. **负控制被测试环境传染**：`v3205` 由 `run.mjs` 以 `node --test` 拉起，环境里带着
   `NODE_TEST_CONTEXT`，传承给夹具后使它整段哑掉（一行没跑，却报「文件 1/1 通过」）。
   该负控制因此测的是「什么都没跑」。修法：剥环境变量 + 以夹具状态文件做强断言（真跑两次）。
7. 夹具不许住在本仓 `tests/` 下：既会自伤（被 P3 登记判据抓到），又会让同一文件
   「单独跑绿、并发跑红」—— 正是本版要根治的不稳定形态。改放临时仓，本仓只读。

## 2026-09-24 · v3.208.0（投影管线 + 成本预测 —— 把「缺席不可见」从两个面各修一次）

**做了什么**
- 新增 `projection-pipeline.js`（202 行，零依赖，挂 `window.LonShaProjectionPipeline`）：声明式
  `PROJECTIONS` 登记表（6 项）+ 三态读数（`value` / `empty` / `absent`）+ 缺席原因
  （`no-provider` / `thrown: <msg>` / `skipped-by-config`）+ `identity` 自洽 + `faceValues` 归拢
  + `pipelineLine`（**必须报缺席数**）。
- 新增 `cost-forecast.js`（255 行，挂 `window.LonShaCostForecast`）：`forecast` **复用真路径同一批
  纯函数**（`deriveBudget` / `trimToBudget`）复算；不可测三态 `no-router` / `derive-threw` /
  `trim-threw` 一律 `measurable:false` + `why`，不编 0；
  `reconcile` 三态 `match` / `drift` / `not-measurable`，drift 点名偏差量。
- `index.js`：两个取库口（`_costForecastLib` / `_projectionLib`）+ `_runProjections()`（6 提供器）
  + `readWorldLedger` 走管线（`projection: pipe` 下传）+ 注入现场「预测 → 实测 → 对账」
  + 两行诊断（投影管线 / 成本预测）+ 修内联回落预算路径缺陷。
- `manifest.json`：`extra_js` 56 → 58（`ledger-entity.js` 仍居首）。
- 新增 `tests/v3208_projection_forecast.test.mjs`（10 组 / 123 断言 / 434 行，含 13824 组 parity 枚举 + 负控制）。

**为什么**
- 投影面实测「通路只通了两根线」：v3.176 只有两次手工调用，WorldAxis 对外 12 条面；且缺席
  与源空同形（都返回 `{}`），下游 `diffPeople` 把「查不出来」当成「两边一致」。
- 成本面实测「只有事后账」：`cost-ledger.js` 全文件 `forecast` / `predict` 键计数为 **0**，
  「改配置之前会怎样」无人回答。

**门禁结果**
- `tests/v3208`：10/10 全绿；parity 枚举 13824 组 0 分歧（负控制 536 组翻红）。
- `npm test`：187 文件 / 0 失败（前序基线 186 / 1613 断言）。
- `node tests/run.mjs --audit`：全绿。
- 三源版本 3.208.0；`scan_version_guard` 问题 0；`scan_cross_repo_binding` 问题 0；
  `dead_code_budget` ceiling 33251 → 33870（实测 33470 + slack 400）。

**本轮踩到的坑（已留痕）**
1. **同名不同义 ⇒ 假 drift**：`dropped.chars`（被丢弃块字符和）≠ 账本 `totals.droppedChars`
   （含 NOTE / END / 分隔符），冒烟 C 组假报偏 +11。修法：新增等价口径 `overBudgetChars` / `preTrimChars`。
2. **判据按猜的文本形态写**（三处，全在 `tests/v3208` 首跑暴露）：源空数误写 1（实为 2）；
   断言读数里并不存在的「有 N」字样；8e 锚点窗口 900 字符而内联段实为 21 行 ⇒ 报「未定位」。
   三处都是**判据问题而非实现问题**——须先读实现再写断言。8e 改为真源码切段枚举后硬化。
3. **新套件必须同时构成当版锚点**：`scan_version_guard` V4 报「当版锚点被删空」，补
   `vnum(...) >= vnum('3.208.0')` 后归零。
4. **新增测试文件要登记参考基准**：`scan_cross_repo_binding` P3 点名 `v3208_…` 未登记，已补 TSV。
5. **合法功能增长要走 `--bump` 并写理由**：`dead_code_budget` 直接红（33470 > 33251），
   走 `--bump --reason=…` 抬到 33870。
