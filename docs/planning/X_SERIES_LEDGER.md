# X 系列推进台账（v3.289.0 起 · v3.296.0 收口）
> **收口读数（v3.296.0）**：拓展计划原文的 **X1–X8 八条全部落地**，各条判据套件在磁盘上齐备：`v3289`(X3) / `v3290`(X4) / `v3291`(X5) / `v3292`(X6) / `v3293`(X7) / `v3294`(X8) / `v3295`(X2) / `v3296`(X1)。★ 收口 ≠ 每条都收口：**X2 的依赖 O2 只交付了交互逻辑切片**（真浏览器 + 真 SillyTavern 面未执行，如实登记）；本台账不把「未执行」读成「已通过」（同 O2 验收原文）。

> 用户指令（2026-10-06）：**继续推进 X2–X8，X2 放最后**；**双项目记得都推进**。
> 本台账是 X 系列实施的工作记录；验收原文以
> `.agents/notes/proposed/feature/2026-10-04-expansion-plan.md` 为**唯一真源**
> （本文件不复制验收原文，避免第二份真源）。

## 实施顺序（按用户指定：X2 放最后）

| 序 | 项 | 依赖 | 依赖是否满足 | 状态 |
|---|---|---|---|---|
| 1 | **X3** 注入策略对照与精确预演 | O3/O4 | ✅ 均已交付 | ✅ **v3.289.0 已交付**（`compareStrategies()` + 宿主消费点 + 诊断行 + `v3289` 判据 10 条全绿） |
| 2 | **X4** 手机事实受控准入 | 两仓保存与边界优化 | 部分（待核） | ✅ **v3.290.0 已交付**（判据 `tests/v3290_x4_fact_admission.test.mjs`） |
| 3 | **X5** 角色知识演变与传播证据 | X1/X4 | ✅ 均已交付 | ✅ **v3.291.0 已交付**（判据 `tests/v3291_x5_knowledge_trace.test.mjs`） |
| 4 | **X6** 分支语义对照与受控交接 | O1、X1/X2 | O1 ✅ / X1 ✅ / X2 未做 | ✅ **v3.292.0 已交付**（判据 `tests/v3292_x6_branch_semantics.test.mjs` 46 条） |
| 5 | **X7** 长篇剧情分卷与选择性接续 | X1/X5/X6 | ✅ 均已交付 | ✅ **v3.293.0 已交付**（判据 `tests/v3293_x7_volume_continuation.test.mjs` 48 条；含 G 段宿主真实落笔闭环 + 四条真源码破坏负控制） |
| 6 | **X8** 召回问题解释与有证据的策略建议 | O4/O6、X1/X3 | O4/O6 ✅ / X1 ✅ / X3 本批 | ✅ **v3.294.0 已交付**（判据 `tests/v3294_x8_recall_explain.test.mjs`；七档互斥归因 + 四态纪律） |
| 7 | **X2** 证据到真实修复的操作流程 | O1/O2/O4 | O1/O4 ✅ / O2 **仅交互逻辑切片、真浏览器面未执行** | ✅ **v3.295.0 已交付**（判据 `tests/v3295_x2_repair_flow.test.mjs` 17 条：A 两态可分 / B 未覆盖范围 / C 悬空分列 / D 证据三态 / E 只读方案 / F 落笔链路 + N1–N6 真源码破坏负控制 + 版本卫生；实测 17/17 全绿） |

| 8 | **X1** 结构化证据查询与完整度（拓展计划原文里的 X1） | —（对既有九账的深化，不阻塞他项） | ✅ | ✅ **v3.296.0 已交付**（`evidence-query.js` 636 行 + 宿主六口与降级回执 + 诊断行「证据查询」；判据 `tests/v3296_x1_evidence_query.test.mjs` 16 条：A 登记表逐字对齐 / B **900 条账里找得到最老那条**（同一台机器上同时证工作台 `search()` 找不到它、`query()` 找得到 —— 只证后者是「函数能跑」，两件一起证才是「缺口真被补上」）/ C 楼层三态不压平 / D 分页不回落 / E 区间反转按空集且给理由 / F 四态不同形 / G 只存条件且重放走当前原账 / H 未知条件名不静默忽略且零写副作用 + N1–N5 真源码破坏负控制 + 7~9 宿主接线与加载面 + V 四源同源与当版锚）。★ 与序 1 注明的**旧 X1**（v3.270.0 `projection-pipeline.js` 注入容量预演）**同名不同物**，两条各自独立、登记与判据不得互认 |
## 双项目边界

- **lonsha-memory-plugin**（本仓，v3.296.0 → ）：**拓展计划的 X1–X8 八条全部交付**（X3 v3.289.0 / X4 v3.290.0 / X5 v3.291.0 / X6 v3.292.0 / X7 v3.293.0 / X8 v3.294.0 / X2 v3.295.0 / **X1 结构化证据查询与完整度 v3.296.0**）。★ 注意**同名不同物**：本仓另有两条历史 X1 —— v3.270.0 的注入容量预演（`projection-pipeline.js`）与 v3.272.0 前的一批早期编号，与拓展计划原文里的 X1（结构化证据查询）编号相同、内容不同，登记与判据**不得互认**。
- **ruby-phone**（实测 v3.63.0）：其拓展计划另有一套 X1–X8（编号相同、内容不同）。
  联动点在原文里点明：memory-plugin 的 **X3 与 RubyPhone X8 配套**、
  **X4 与 RubyPhone 手机事实**同源、**X5 联动 RubyPhone X5**、
  **X6/X7 与 RubyPhone X8 联动**。故两仓推进须**成对**核对契约（`open_face_registry` / 反向桥）。

### X6/X7 ↔ RubyPhone X8 联动核对（v3.293.0 实测）

**结论：本轮 X6/X7 落地对下游门禁零破坏，且不引入「必须先降级下游」的强耦合面。**
实测依据（两侧均为 `exit 0`，非推断）：

- 本仓外供登记表 `tests/audit/open_face_registry.tsv`：**5 面不变**（`projectionEnvelope` /
  `injectionReadout` / `eventPlatforms` / `evidenceWorkbench` / `checkpointCompare`），
  由 `scan_open_faces.mjs` 把守（`exit 0`）；反向表 1 面（`ruby.lonshaBridge`）由
  `scan_inbound_faces.mjs` 把守（`exit 0`）。
- 下游 ruby-phone 第十一道门 `scripts/upstream-face-audit.mjs`：**5 面 / 1 面（R12）/ 问题 0**
  （`exit 0`）。
- ★ **关键机制（本轮确认，决定了「能不能单方加行」）**：下游门禁的 **R3 是双向对账** ——
  它按「上游冻读取里的 face 集合 ↔ 本仓带 `upstreamFace` 的登记行」逐面互查。
  因此**上游单方新增一行外供面，会直接让下游门在无任何下游参数时翻红**
  （报「有面但下游没登记」）。⇒ X6/X7 的宿主入口（`buildBranchImport*` / `buildVolumePack` /
  `handoffVolumeContinuation` / `revokeVolumeHandoff` 与体检行）本轮**刻意不登记**进本表：
  它们目前不是下游已消费的面，登记即等于替下游「声明它已在消费」。
  真要外供，须与本仓表行、下游 `config/crossrepo-registry.js` 登记行 +
  `scripts/bridge-contract-audit.mjs` 的 `[face:]/[reader:]/[floor:]` 标签**三处同批**落地，
  并走下游 `--refresh` 重冻。
- `volume-continuation.js` 档头已显式声明：本模块**不 `require` X6、不引用其全局符号**，
  五面常量自持一份 ⇒ 本仓内部即无跨模块强耦合，X6/X7 可独立抬版（判据 H3/H4 钉住）。
### X8 交付（v3.294.0）—— 召回解释：一次真实轮次的阶段归因
- 新模块 `recall-explain.js`（纯函数、零依赖、IIFE + CJS 双导出、800 行，版本常量
  `RECALL_EXPLAIN_VERSION = 1`）。四个出口：`explainRecall`（主入口，永不抛）/ `suggestFor`（带证据的建议）/
  `feedback`（环形有界，显式 `writesHistoryFact:false`）/ `line`（面板一行）。
- **七档单一登记表 `STAGES`**（顺序即严重度）：`source-missing`（缺源）/ `no-hit`（无命中）/
  `alias-filtered`（别名·身份过滤）/ `validity-filtered`（有效性过滤）/ `budget-trimmed`（预算裁掉）/
  `injected`（已注入）/ `unknown`（判不了）。每档 `why` 把**归因与改法写在一处**，
  别处不得再解释一遍（本仓「同一事实两个真源」之忌）。
- **四态纪律**：`hit` / `empty` / `filtered` / `missing`，★ `missing` **只能**表示「判不了」
  （缺源表 / 缺模块 / 该轮没跑），与 `empty`（测了，确实 0）严格不同形；**测不到一律给 `null` 不记 0**。
  另设 `verdict.unproven`：链走完却无定论（前档都读到、载荷面没读数）既不算「已注入」也不算「判不了」。
- ★ **本版最贵的一条：判定链停点之后 ≠ 观测面缺席**。停点（`_decidedIdx`）之后的档位
  **根本没有候选到达**，其 `missing` 是「没跑到」而非「观测面缺读数」。两者混读的实测后果：
  **全源关闭**（最有把握的一条结论）会被自己下游的空档反过来打成「判不了」——
  恰好把最确凿的一条报成最没把握的。故：
  · 逐档 `required`（`true`: source-missing / no-hit / unknown；`false`: 其余四档）；
  · 必需面缺 ⇒ 阻断（`blockingMissing`）；可选面缺 ⇒ 只**收窄覆盖范围**（`narrowed` 并进注记）；
  · 停点之后的空档记 `unreadDownstream`，且该档行内 `why` **跟随分类改写措辞**
    （否则读数表自己与自己矛盾：分类说「没跑到」、行内却写着「这一档判不了」）；
  · `degraded` 只认「必需面缺」与「轮次被证伪」。
- **轮次身份三态**：`floorMatched` ∈ `matched` / `mismatch` / `unknown`；`idMatched` ∈ `true` / `false` / `null`；
  另有 `evidence.identityLevel` ∈ `injected-ids` / `floor` / `unverifiable` / `none`。
  ★ 只有**被证伪**才降级；宿主**没给**可比身份 ⇒ 按成立处置、但必须留注记
  （把「无从核对」读成「对不上」⇒ 每轮解释都落 unknown，真正的「账本拿错了」反被淹没）。
  ★ 实测：本插件召回账本的 `floor` 取自 `query.floor`，而宿主**从不给它赋值**（恒 -1）
  ⇒ 该维度在真宿主里**恒无从核对**。故宿主侧另走**内容级**身份：
  账本记的本轮入选条目（`_finalize` 就近落的 `injectedIds`）vs 实际进载荷的块
  （`buildInjectionReadout().blocks[].ref`）—— 两处来自不同面，比对才有意义；
  两侧任一缺读数即 `null`（无从核对，**不算核对过**）。
- **缺源 ≠ 零命中**：源被禁用 / 本轮抛错是**明确的**结论（源闸挡住全部候选），不得占 `missing`；
  `no-hit` 另有其时：源在岗、无错、合计 0。★ 合计以**确证读数**为准（账本 `totalHits`），
  源级求和只作回落且要求齐全（不全就不倒推）；两路都有读数且源级求和 > 合计时如实抖出
  （`refs` 里记 `perSourceSum=`），不挑一条当对。无源在岗时零命中**不是独立读数**（上游停止的结果）
  ⇒ 如实记 `missing`，免得读数表出现「缺源 2 · 无命中 0」把人引去查查询词
  （判据 B 钉住；负控制拆 `state: allOff ? 'missing' : 'filtered'`）。
- **建议纪律**（对应 X8 验收「自动调参默认关闭」「用户选择后才改配置」「反馈不能自动改成历史事实」）：
  `apply.auto` 恒 `false`、`requiresUserChoice` 恒 `true`、`targets` ∈ `config` / `data` / `rerun`、
  `evidence[].field` 是输入上**真实存在的字段路径**、`verify.how` 指明以 X3 同候选重跑比较为依据；
  判不了时**只给一条**「先修观测面」建议（在错的读数上调参比不调更坏）。
- **源清单单一真源**：宿主 `_auditRecall` 的记录新增 `srcKeys`（`SRC` 常量实参快照），
  解释面拿它组装源表 ⇒「哪些源在册」全局只有一份真源；源表不全时解析面如实报
  「源表不全：账本名册里的 X 没进源表」（防宿主组装漏项）。
  ★ 实测关键约束：15 个审计源里 **10 个没有配置开关键**（`summary` / `graph` / `diary` / `diffusion` /
  `pov` / `timeline` / `volume` / `status` / `holiday` / `presence`），它们由**数据条件**入场
  （无节日 ⇒ 节日源不跑、无卷 ⇒ 卷源不跑）。那些门散在 `recallMemory` 里，
  宿主**不重列**（重列即「同一事实两个真源」）—— 无键源的开关态如实给 `null`（不知道，
  不得当成「关着」），源级命中数按 `perSource` 缺席即 0 读（在册且无错 ⇒ 缺席 == 0 条）。
- **宿主真接线**：`manifest.extra_js` 注册（83→84，含 `v3209` 数量锁同步）+ `index.js` 三出口
  （`_recallExplainLib` 取库口照 `_moduleLib` 契约 / `explainRecallHost` 同轮取数 / `suggestRecallFixes`）
  + 诊断面「召回解释」体检行（与「召回自检」「注入读数」**分列**；报警只认「判不了」那一档 ——
  那一档说明连有没有候选都不知道，其余五档都是正常断点）。
- 判据 `tests/v3294_x8_recall_explain.test.mjs`（14 条）锚当版：A 段轮次身份（含「无从核对」反向）、
  B 段缺源 ≠ 零命中、C 段建议纪律、D 段三态不混、E 七档登记表、F 证据路径、G 反馈、H 宿主接线、
  I 三源同源；N0 为「原版全绿」前置，N1~N4 为**真源码破坏负控制**
  （拆身份闸门 / 拆全关明确结论 / 拆降级早退 / 拆测不到给 null）。
- ★ 本版修复留痕六处（全部实测，详见 CHANGELOG v3.294.0）：① 全关被标 `missing` ⇒ 下游归 unknown；
  ② 降级只给通用文案 ⇒ 丢掉可观测的具体原因；③ 可选面缺读数也 break 判定链 ⇒ 每轮落 unknown；
  ④ 停点之后 missing 被算进阻断面 ⇒ 同上；⑤ `readStage()` 引用外层 `_idLevel` ⇒ 取不到即抛、
  被自身兜底吞成「整份解释异常」（改为**显式传参**）；⑥ `no-hit` 要求源级读数齐全 ⇒
  本插件源级天然不齐、每轮都判不了（改为优先采信账本确证合计）。
- ★ 工具面留痕：补丁脚本首版把换行写成 `\n` 两字符（heredoc 会展开反斜杠）⇒ 锚点恒 0 命中；
  用 Python `ast.parse` 校验 JS ⇒ 报 `invalid character '—'`（JS 校验一律走 `node --check`）；
  另踩到**半改造**（脚本在后半段锚点校验失败时 `sys.exit(1)`，而写盘在循环之后 ⇒
  前几项补丁静默作废、文件停在半改造状态）⇒ 改为「**全部锚点先校验、通过后统一替换写盘**」。
- ★ 既有判据抓到的真发现（本轮）：O7 **别名副本账本**（`tests/v3282`）翻红 ——
  X8 的 `strOf` 与 X6/X7 的 `keyOf` **逐字同体**（归一化 100 字符，md5 `cb4883eb`）。
  这正是本仓「同体不同名」那层判据的射程（按名配对的三层整片看不见）。处置同 X6/X7：
  **补登记 + 留痕理由**（本模块刻意自持一份、不引 X6/X7 常量 ⇒ 不合并），不是并实现。
  取证口径：簇真值必须实测 —— 占位值会让账本同时报「新增未登记」与「登记项漂移」。
- ★ 外供面：本版宿主入口（`explainRecallHost` / `suggestRecallFixes` / 体检行）**刻意不登记**
  进 `tests/audit/open_face_registry.tsv` —— 与 X6/X7 同一理由：下游门禁 R3 是**双向对账**，
  上游单方加行会让下游门在无任何下游参数时翻红。真要外供须与本仓表行、
  下游 `config/crossrepo-registry.js` 登记行 + `scripts/bridge-contract-audit.mjs` 标签**三处同批**落地。

- 下游侧现状：X8 第一切片（v3.62.0 分支对照工作区·只读）与第二切片（v3.63.0 受控恢复交接）
  已在 `feat/x8-resume-handoff` 分支落地；其消费面选型尚未指向本仓 X6/X7 的宿主入口
  ⇒ **联动待下游侧决定消费点后再成对登记**，本轮不做。
  ★ 注意**同名不同物**：本仓 X8 = 召回解释（v3.294.0，本版交付）；下游 X8 = 分支对照/
  受控恢复交接（v3.62.0 / v3.63.0）。两侧编号相同、内容不同，登记与判据**不得互认**。
  本仓 X8 的下游消费点候选：诊断面「召回解释」读数可进手机端诊断页。
  按同一 R3 双向对账纪律，**待下游侧先决定消费点**再成对落地，本轮不登记外供面。

### X2 状态（**v3.295.0 已交付**）
- 依赖面复核：O1（✅）/ O4（✅）/ O2 **仅交互逻辑切片**（真浏览器面未执行，仍待补）。
- ★ 侦察期把一条前置从「阻塞」改为「可补齐」：真浏览器通道**可用且零依赖** ——
  `/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome` 与 `chromium_headless_shell-1148` 二进制在场；
  `playwright` / `puppeteer` / `jsdom` / `linkedom` 驱动包**均未安装**；
  但 Node v24.18.0 自带全局 `WebSocket` ⇒ 可**零依赖直连 CDP**
  （实测 `/tmp/cdp_probe.mjs`：`--headless=new --no-sandbox --disable-gpu --remote-debugging-port=0`
  能起，devtools ws 地址可抽，`/json/version` 返回 `Chrome/131.0.6778.33`、`Protocol-Version 1.3`）。
  ⇒ 补 O2 真浏览器面不必引入第三方依赖，自建最小 CDP 客户端即可（**本轮未做**）。
- 交付面（本版落地）：
  · **模块侧** `repair-loop.js`：`affectedBy` 返回 `{items, coverage, dangling}`（不再裸数组）；
    两态 `basis`（`ref` 确切引用 / `needle` 文本候选，去重留更强的那条）；`coverage` 报
    「池缺席」与「截断（扫到/总数）」；`dangling` 与受影响**分列**；新增只读 `plan()` 与
    `evidenceOf()`，导出 `BASES`/`EVIDENCE`/`COVERAGE_STATE`/`INVERSE`。
  · **宿主侧** `index.js`：新增池装配口 `_repairPoolFor(input)`（`refId` / `knownRefs` 的通路，
    三个判定入口共用）；`_repairPool()` 的 `info` 按 **kind（单数）** 写、`facts` 透出
    `supersededBy`；`_repairOwners()` 六类逆操作接线表；`applyRepairPlan()` 四步
    「改数据 → 核原数据 → 落盘回读 → 带证据 settle」；`_verifyRepairItem()` 逐类核验。
  · **桥面**：只读 `plan(input)`（不对表、不碰账）、写 `applyPlan(input)`（两道门与
    `apply` **逐字同规格**）；回执 9 键 → **13 键**（新增 `applied/verified/readback/items`），
    `readback` 三态 `true/false/null`。
- ★ 本版实测修掉三条「**只在夹具里成立**」的死通路（判据在测试里过、生产上永不生效）：
  ① 宿主按**池键（复数）**写 `info`，模块按 **kind（单数）** 读 ⇒ `meta` 恒 null、
     截断读数永不触发（「900 条只看了 200 条」与「真的只有 200 条」同形）；
  ② `refsOf` 读的 `sourceRefs` / `derivedFrom` **全仓零产出** ⇒ `hitRef` 恒假、`basis` 恒
     `needle`，「按确切引用找影响」在生产上从来没生效过（现接本仓真实存在的跨条引用
     `eventKey` / `supersededBy`）；
  ③ `refId` **无路可入池** ⇒ 模块只能退化拿 `target` 文本去比，而池项自报的是 id，两者永不相遇
     （现经 `_repairPoolFor` 装配）。
- 判据 `tests/v3295_x2_repair_flow.test.mjs` 17 条（A–F + N1–N6 真源码破坏 + 版本卫生），
  实测 17/17 全绿；相邻门禁 `tests/v3194_time_and_fact_version.test.mjs` 20/20、
  `tests/v3215_repair_write_channel.test.mjs` 14/14、`tests/v3209_migration_registry.test.mjs` 15/15
  均零破坏（`manifest.extra_js` 未新增模块，仍 84 项）。

## 纪律（沿用本仓既有口径）

1. **成对判据**：每个新扫描器配判据套件，套件用合成仓 + 真源码破坏检验「判据真能翻红」。
2. **三档退出码**：0=卫生 / 1=真缺陷 / 2=结构漂移；「没得判 ≠ 通过」。
3. **判据纯度（H5）**：判定窗口不得混进说明文字 / 邻条内容；**判据不得被自己的解释掩盖**。
4. **当版锚**：全仓恰一个套件锚当版，其余退为下限锚；`vnum` 必为数值形态。
5. **诚实留痕**：把「首次踩坑 → 实际报错 → 根因 → 修法」写进 CHANGELOG / 扫描器档头。
6. **不跑全量**（用户纪律）：只跑单门 / 单套件；全量集中到计划收口后一次。
7. **不可测就写不可测**：缺模块 / 缺读数一律 `measurable:false` + `reason`，不用 0 冒充。