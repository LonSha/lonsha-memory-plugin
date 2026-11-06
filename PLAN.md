# lonsha-memory-plugin 发展规划
> **第十五期产品计划（2026-11-06，现行提案）**：优化9项＋拓展9项（`L15-O*` / `L15-X*`），双仓合计36项。规划基线 v3.446.0 / `a82a229`。全链路贯通拒绝纯内核：要求数据Owner、宿主API、诊断行、主生成注入及Settings UI五位一体，搭配真源码破坏负控制定向门禁推进。
> [优化提升九项](.agents/notes/proposed/architecture/2026-11-06-product-optimization-v15.md) · [拓展创新九项](.agents/notes/proposed/feature/2026-11-06-product-expansion-v15.md) · [源码证据与六个大批次](docs/planning/2026-11-06-product-evidence-v15.md)。

## 第十五期执行批次与当前优先级
1. 批次A：`L15-O1` 具身在场状态持久化 + `L15-X1` 具身密谈耳语私密注入（联动 RubyPhone R15-O9 / R15-X1）。
2. 批次B：`L15-O3` 事实纠错影响扩散版本树 + `L15-X4` 誓约决裂与违约心理烙印。
3. 批次C：`L15-O4` 动态长篇选材注意力弹性预算 + `L15-X6` 地点禁忌记忆反射激活。
4. 批次D：`L15-O2` 检索消歧人际图谱动态加权 + `L15-X3` 视角冲突记忆并列对照。
5. 批次E：`L15-O5` 事实有效期日历时间双锚定 + `L15-X2` 角色自传心路重述沙盘。
6. 批次F：`L15-O6` 周目差异比对增量合并 + `L15-O7` 混合检索分桶粗筛 + `L15-O8` 证据局部自愈 + `L15-O9` 健康矛盾巡检 + `L15-X5` 传闻异化 + `L15-X7` 潜意识微反应 + `L15-X8` 反事实推演 + `L15-X9` 隐秘解密。

> **第十四期产品计划（2026-11-03，历史基线已落地）**：优化9项＋拓展9项（`L14-O*` / `L14-X*`），双仓合计36项。规划基线v3.445.0 / `ff2d5da`；优化9项与拓展9项共18项纯函数契约内核、宿主对接与专项验证套件已全部实施完成。
> [优化提升九项](.agents/notes/proposed/architecture/2026-11-03-product-optimization-v14.md) · [拓展创新九项](.agents/notes/proposed/feature/2026-11-03-product-expansion-v14.md) · [源码证据与六个大批次](docs/planning/2026-11-03-product-evidence-v14.md)。
> 第十三期及更早内容为历史留痕，未完成项与交付声明均须按第十四期证据页复核，不直接当施工单。

## 第十四期当前优先级
1. 批次A：`L14-O1` / `L14-O8` / `L14-O5` —— 可靠地留下与返回。
2. 批次B：`L14-O2` / `L14-O6` / `L14-O9` —— 改错与办事可以放心。
3. 批次C：`L14-O3` / `L14-O4` / `L14-O7` —— 长篇与长用都流畅。
4. 批次D：`L14-X1` / `L14-X2` / `L14-X4` —— 交流与约定形成过程。
5. 批次E：`L14-X3` / `L14-X5` / `L14-X6` —— 准备下一幕与持续活动。
6. 批次F：`L14-X7` / `L14-X8` / `L14-X9` —— 回访、交接与体验收口。

> **第十三期产品计划（2026-10-31，历史提案）**：本仓优化9项＋拓展9项（编号 `L13-O*` / `L13-X*`）；与 RubyPhone 第十三期（`R13-*`）合计36项。**本轮只制定计划，不代表功能已实施或升版。**
> [优化提升九项](.agents/notes/implemented/architecture/2026-10-31-product-optimization-v13.md) · [拓展创新九项](.agents/notes/proposed/feature/2026-10-31-product-expansion-v13.md) · [基线、差异化与验收边界](docs/planning/2026-10-31-product-evidence-v13.md)。
> **期号口径**：本期用 `L13` 而非 L12 —— `CHANGELOG.md` 的 v3.420.0 已用 `L11-*` 指另外十八件模块，第十一期因此改名 L12；`L12-*` 已被 v3.428.0~v3.430.0 用掉，故顺延 L13（见证据页第一节）。
> **第九期产品计划（2026-10-24，历史提案）**：[优化九项](.agents/notes/proposed/architecture/2026-10-24-product-optimization-v9.md) · [拓展九项](.agents/notes/proposed/feature/2026-10-24-product-expansion-v9.md) · [证据页](docs/planning/2026-10-24-product-evidence-v9.md)。
> **当前执行状态（2026-11-02，v3.445.0）**：**L13-X5 记忆迁移包接线已交付 —— 本期 18 项（L13-O1~O9 / L13-X1~X9）至此全部落地**。起点是一条读码事实：内核 `memory-migrate-pack.js` 自 v3.345.0 起登记在册、真加载、单测绿，但**产品端零调用**（用户导不出也导不进），属「功能级失效」教科书形态。本版补宿主取库口 `_migratePackLib()` + 三桩（export/precheck/apply，模块缺席与器官缺席各自显式报因）、面板双按钮双 handler（打包落 localStorage + 下载 json；导入先预检→逐冲突 1/2/3 三档决策→apply→回写存档，全同则跳过）。★ 同版修掉一处接线真缺陷：`exportMigratePack` 成功路径返回内核**裸包**而面板按 `{ok,pack}` 取数 ⇒ 成功被误判为失败；已改为宿主侧包装 `{ok:true,pack,skipped}` 并对 `headSha` 缺失 fail-closed。判据 `tests/v3445_l13_x5_migrate_pack.test.mjs`（34 条，含 5 条真源码破坏负控制）；台账同版重生成（消费台账 migrate-pack `prod_call_sites=1 / why=active`、seam 台账 `host-seam`、state-report ver 3.445.0 / test_files 447 / extra_js 249）。**边界**：真机 ST 未执行（面板触摸·窄屏·刷新后重载）；全量 `npm test` 与 `--audit` 按纪律未跑，`doc_readings` 全量实跑读数仍停 3.431.0 并已在 state-report `unknown` 显式点名。
> **上一版 v3.444.0**：**L13-X9 跨代传承面已交付** —— 起点是一条读码事实：内核 `era-continuation-inheritance-tree.js` 在 `manifest.extra_js` 里**真加载、单测全绿、却产品端零调用**（`prod_call_sites=0`），四态常量写好了但从没人读得到。本版把它接成可读可声明的面，补三件：① **每态可读成因** `FATE_CAUSES` —— 同是 `lost`，「被明确宣告遗失」与「传接跑完了它却没被处置」是两件不同的事，读数必须分得开；② **对接既有槽** `buildInheritanceRoster(transitions)` 直接吃 `worldProg.eraTransitions` **原样**（不新开存储、不建第二套事实库；输入数组一个字节都不改、连读两次读数稳定），输出逐条四态 + 成因 + 秘密边界；③ **第五档 `pending`（还没传）** —— 本面最容易做错的一格：`lost`（传接已完成，它没留下来）与 `pending`（传接**还没发生**）若同形，用户会看到「我家传玉佩遗失了」而事实只是「还没走到那一段」。⇒ 四态是**结果轴**，`pending` 是**未到结果**，两轴分列、永不同形（转场被撤销或本来就 pending 却带残留 `appliedItems` 的，一律落 pending 并显式记成因 `pending:stale-applied-record` —— 残留是缺陷信号，不许静默当没有）。**秘密边界四档**：`disclosed`（这一代知道了）/ `withheld`（在册但没给这一代）/ `undecided`（判不了）/ `absent`（秘密账里根本没有这条）—— 判定**一律调既有账自己的 `knowledgeOf`**（`opts.knowledgeOf` 注入），本模块不另写一套「该不该给他看」（秘密上已有三刀历史，另写必然漂移）；`undecided` 与 `absent` 处置相反（前者要人去看、后者不用遮蔽），压成一个布尔会让「秘密账漏记」永远看不见。**写入面**落在既有槽 `eraTransitions[i].declarations[artifactId]`（随 worldProg 一并存档）：`inheritanceDeclare` 是唯一写入口，`confirm !== true` 即拒（连状态都不读）、**`pending` 不可声明**（允许它等于把「遗失」改写成「还没传」）、覆盖旧值如实报 `replaced`；`inheritanceRevokeDeclare` 撤完回**推导值**而不是 pending，二次撤销报 `not-declared` 不假装撤掉了什么。★ **同版抓到并修掉一处产品侧真缺陷**：`index.js` 里 `_eraContinuationLib` 出现**同名两份**（原有那份指向 `era-continuation-drama.js`，本版新加那份指向传承树），JS 同名函数声明后者静默覆盖前者 ⇒ `['时代续演', _eraContinuationLib, 'eraContinuationDramaSelfCheck']` 自检拿到错误的库、静默失效。这正是本仓 v3.430.0 记录过的缺陷形态、我这版又重复了一遍；新加的改名 `_eraContinuationTreeLib`（宿主声明 + libs 注入键 + 诊断层接收口 + 两处调用点同步），判据 H2 把「两个名字各恰一份、老名仍指 drama、新名整段跨行函数体整段匹配」钉成回归位。★ 判据 `tests/v3444_l13_x9_inheritance_roster.test.mjs` **32 条全绿**（A 4 / B 3 / C 2 / D 1 / E 5 / F 8 / G 3 / H 6），含三条真源码破坏各配原版对照（去掉 `applied` 门控 / 把「跑完却没处置」改判 pending / 秘密账缺这条当 absent）。★ **首跑 24 绿 5 红，五红全部红在判据侧夹具**（`require0` 的 `const` 暂时性死区 / H1 误按 CJS 断言而内核是 UMD / H2 用逐行 `find` 看跨行函数体 / G3 破坏注入产生悬空 `else` / H4 与 H6 的 emoji 转义与字面量不匹配），产品侧缺陷是上面那条重名，不在这五红里。★ **另外真渲染 E2E 47/47 全绿**（`/tmp/e2e_x9_panel.cjs`：把真 `settings-ui.js` + 真 `engine-diagnostic-lines.js` + 真内核 + 真 `secret-ledger.js` 装进同一 jsdom realm，真调 `showBrowser('prequel')`、真点声明/撤销按钮）—— 之所以另做这一层，是因为上一版正是「`node --check` 绿 + 字符串自证绿，但产物非法」。E2E 首跑 19/46 的五处偏差**全部是夹具问题**（realm 缓存用了全局变量 / UMD 走了 require 分支 / 未按 `manifest.extra_js` 真实顺序先装 `ledger-entity.js` / `setTimeout(mount,300)` 未同步执行 / 断言口径写错 —— 拿 `textContent` 数「遗失于历史」这个词，而那是每一行都有的按钮文案），逐条修完 47/47。**接线条数**：该模块从 orphan 转 host-seam，`module_consumption_ledger` 的 `prod_call_sites` 0 → 1、`allowed` 0 → 1；`scan_extra_js_seam` 报出的另两笔账（`round-entry-snapshot.js` 未登记、`memory-archaeology-gap-bench.js` 与 `character-habit-growth-evidence.js` 两个 orphan 缺理由）经重新生成台账后一并收口（前者本就是 host-seam，后两者随宿主接线转 host-seam）。视图总数仍 27（挂在既有 `prequel` 内 —— 它回答「上一代留下的东西现在怎样了」，与前情资料同页才看得出上下文）。**边界保留**：**真实 SillyTavern 会话里没跑过真机**（无真机环境），`prequel` 面板的触摸 / 窄屏 / 刷新后加载**未执行**；全量回归 `npm test` / `npm test -- --audit` **按纪律不跑**（用户指令「做完计划全部内容前别跑全量」仍有效），读数登记仍停 v3.431.0、此处显式标「全量待验」，不得当作已验。**L13 进度**：X1（沿革回放）/ X2（反事实推演）/ X3（视角投影）/ X7（习惯与成长证据）/ X4（证据缺口工作台）/ X6（静音清单）/ X8（本轮可撤销快照）/ **X9（跨代传承面）** 已交付；**仅余 X5**（X 面交付序：只读面先做，X5 最后）。
> **上一版 v3.443.0**：**L13-X8 本轮生成的可撤销快照已交付** —— 起点是一条读码事实：本仓能「撤」的只有 `row.revoke`（撤**证据裁决**）与 `snapshot-checkpoint`（**整份载荷**级检查点），**中间那一层是空的**（一轮生成往图谱加 3 节点 / 往锁定事实加 1 条，发现抽错只能各面对着手删、或整份回滚把同轮正确写入一起吞掉）⇒ 「这轮加错了」与「整份都废了」被压成同一种处置（Problem 8）。新内核 `round-entry-snapshot.js`（360 行，零依赖）五条边界：**不复制正文**（只记 `id` + 指纹 `{len, head24, tail24, h}` —— 复制正文等于绕开各账 owner 另建真源）/ **不新建存储**（挂 `engine._roundSnapshots`）/ **不回退修改**（只标 `pendingReview` —— 回退会吞掉别的动作）/ **不猜 id**（白名单键，取不到计入 `skippedNoId`）/ **无跨账强制清空**。三态纪律：`absent≠empty`（`ok:false+reason` vs `ok:true+counts 0`）、`modified≠added` 且**只有 added 可撤**、`unknown-fingerprint` 单列（拿不到判据既不算改过也不算没改）。`recordSnapshot` 在 `summary.ok!==true` 时**拒绝记假快照**（记了等于宣布「本轮新增 0 条」）。`roundUndoState` **四态**：`no-round` / `half-round`（`missing` 点名缺哪半）/ `ok` / `undone`（带 `undoneAt`，不重放）。`undoRound` 的 `confirm!==true` 是**硬门槛**（连删除口都不调），**只删 added**：`removed` 不可撤（`content-not-kept`）、`modified` 恒 `undoable:false`、无删除口的账 `skipped` 单列、删不掉 `partial`、无新增 `nothing-to-undo`（`writes:false`，与撤成功不同形）。宿主五桩两清单：账本纳入 `lockedFacts`/`graphNodes`/`graphEdges`/`summaries`/`deltas`，删除口**只给三本**（`summaries` 删了会牵动卷/折叠账、`deltas` 是 append-only —— 如实不给），删节点后 `rebuildNameIndex()`（否则「删了节点还能按名字查到」），**宿主不 splice 别人的数组**。面板 `oplog` 视图加「↩️ 撤销本轮写入」块 + `window.confirm` 二次确认（**两层**：面板问 + 内核卡）+ 撤销后审计链记一条 `rollback/undo-round`。★ 判据 `tests/v3443_l13_x8_round_snapshot.test.mjs` **25 条全绿**（A 3 / B 3 / C 3 / D 4 / E 4 / F 3 / G 5），含三条真源码破坏各配原版对照（`modified` 塞进 `added` / 指纹退化成整段正文 / 删掉 `missing` 分支）。★ **首跑 11 红逐条归因：3 产品侧真缺陷 + 1 形状不一致 + 6 判据侧夹具 + 1 抬版前预期内** —— ① `lastRoundPair` 第二个 `if` 带 `after &&` 前置 ⇒「记了 before、after 没记」被判成 `no-round`（应为 `half-round`，两者意义相反），修成两段扫且 `before` 只在 `after` **之前**找（否则与下一轮 `before` 错配）；② `undoRound` 写 `undone:true` 但 `roundUndoState` **从不读它** ⇒ 撤完再点一次拿已不存在的 id 去删、报三个 failed（「写了不读」族），补第四态 `undone`；③ `nothing-to-undo` 分支缺 `counts`（同一函数返回不同键）；④ 加载器用 `vm.runInNewContext` 是**另一个 realm**，`assert.deepEqual` 含原型严格深比 ⇒ `['f1','f2'] ≠ ['f1','f2']`，六条集体假红（红在夹具上等于判据没被测到），改 `new Function` 同 realm；⑤ F1 破坏写成 `st.added.concat(st.modified).length` 当上界 ⇒ 循环体取到 `undefined` 抛异常被 `safe()` 吞成 `failed` ⇒ 改过的条目其实没被删（**破坏没真的改行为**＝假绿），换成在 diff 层把 `modified` 塞进 `added`；⑥ G4 的次序判据原用 `indexOf('RS.undoRound')` 先命中 `typeof RS.undoRound !== 'function'` 那句**取库**检查（本来就该早于 confirm），改盯调用点；⑦ G5 抬版前预期内。**接线条数**：`extra_js` 247 → **248**（零未登记孤儿，228 活跃 / 20 已登记留存），视图总数仍 27（挂在既有 `oplog` 内 —— 它回答「这一轮」而非「所有轮」，与审计链同页才看得见上下文）。**边界保留**：计划验收「真跑一轮生成新增 3 条 → 撤销」用**夹具真跑**证到行为（真记账/真删/真回读），**真实 SillyTavern 会话里没跑过真生成**，登记为「夹具真跑 + 真机未跑」；★ 本版**没有**把 `roundSnapshotBefore/After` 挂进主生成链路（改生成主路径的风险与收益不成比例，先交付「可对拍 + 可只撤新增」这层能力），故「装了就有快照」不成立，须由调用方在生成前后各调一次；`summaries`/`deltas` 纳入摘要但**不给删除口**（撤销它们报 `skipped: no-remover` 并在面板逐条点名）；真机 ST 触摸/窄屏/刷新后加载**未执行**；全量回归**未跑**（读数登记仍停 v3.431.0、显式待验）。**L13 进度**：X1（沿革回放）/ X2（反事实推演）/ X3（视角投影）/ X7（习惯与成长证据）/ X4（证据缺口工作台）/ X6（静音清单）/ **X8（本轮可撤销快照）** 已交付；X9 / X5 待做（X 面交付序：只读面先做 —— X7、X4、X6 已落，X8 已落，其后 X9，最后 X5）。**上一版 v3.442.0**：L13-X6 静音清单面（先补「有地方存」再画面；两源分列永不合并；无「全部解除」）。**再前一版 v3.441.0**：L13-X4 证据缺口工作台（三档成因穷尽且互不同形，`null` 判不了绝不为凑一档写成「证据丢了」）。**再前一版 v3.440.0**：L13-X7 习惯与成长证据面（两块账分开存分报不互相充抵）。**再前一版 v3.439.0**：L13-X3 视角投影面（`blind` 与 `undecided` 永不同形）。**再前一版 v3.438.0**：L13-O6 注入面可复算。**再前一版 v3.437.0**：L13-O5 世界线口径对玩家的可读化。**再前一版 v3.436.0**：L13-O4 面板视图入口可达性。**再前一版 v3.435.0**：L13-O3 只读视图机器可读四态 + L13-O8 记忆软删闭环。**真宿主门**：v3.433.0 曾在真实 SillyTavern 1.19.0 隔离现场跑通过一次（29 条真实读数 / 0 缺陷 / exit 0）；此后盘面已多次变更，该读数按「历史跑通、当版待复跑」对待。
> **规划基线**：`v3.431.0 / 150d055`。旧 V8 提案基线 `v3.371.0 / c17c33b`、V9 提案基线 `v3.373.0 / ac5c21a` 已被本期取代，仅保留历史参考；V7 及更早历史不作为当前待办。实施前仍须针对届时代码复算接口与覆盖。
> **产品主轴**：把事实生命周期、证据裁决、时间、召回、生成回执、维护和迁移连成可回源、可撤销、可接续的用户闭环；拓展受证据约束的记忆体验。守卫、审计、台账、发布和纯重构只随功能收口，不独立占36项名额。
| 第六期编号（历史已承接） | 优化提升 | 第六期编号（历史已承接） | 拓展创新 |
|---|---|---|---|
| M6-O1 | 连续经历重建：把散落往事召回成一件完整的事 | M6-X1 | 信念演化：人物可以有理由地误解，也能有过程地改观 |
| M6-O2 | 记忆问题求解器：从找相关段落到跨证据回答复杂问题 | M6-X2 | 经验与习惯学习：记住怎么做、何时例外，而不只记住做过 |
| M6-O3 | 可展开的多分辨率记忆：压缩不再只剩结论 | M6-X3 | 条件后果推演：选择改变未来的哪些可能性 |
| M6-O4 | 人物自传式记忆：让角色带着自身经历进入下一幕 | M6-X4 | 多步反事实实验：比较两条人生路线，而非只试写两段话 |
| M6-O5 | 双时间经历：分清何时发生、何时被得知 | M6-X5 | 群体与制度记忆：组织不会随一次群聊结束而失忆 |
| M6-O6 | 场景上下文编排：让记忆服务当前互动，而非塞一包资料 | M6-X6 | 意象与意义变迁：同一地点、物件或话语能有不同分量 |
| M6-O7 | 关系动力记忆：从转折列表到理解关系为何保持或改变 | M6-X7 | 缺席与期待记忆：记住该发生却尚未发生的事 |
| M6-O8 | 持续研究记忆：资料改变时，结论能继续生长 | M6-X8 | 回忆再理解：同一往事被重新讲述时，人物会获得新认识 |
| M6-O9 | 长期意图推进：让目标会遇阻、改道与付出代价 | M6-X9 | 跨时代传承：世界进入新阶段，留下来的不只是摘要 |

> **第五期历史入口**：[优化](.agents/notes/proposed/architecture/2026-10-20-product-optimization-v5.md) · [拓展](.agents/notes/proposed/feature/2026-10-20-product-expansion-v5.md)。记忆侧v3.350～3.353已有18项实现覆盖；旧“全部待实施”已不成立，但实现覆盖不等于所有真实宿主及模型内容验收通过。逐项映射与边界见第六期证据页。
> **第四期历史入口**：[优化](.agents/notes/proposed/architecture/2026-10-15-product-optimization-v4.md) · [拓展](.agents/notes/proposed/feature/2026-10-15-product-expansion-v4.md)。第四期收口记录为3.348.0，随后3.349.0另含conditionPatch；旧导航“下一刀M4-X9/未勾选X9”已过时，详细实施与历史全量读数留在CHANGELOG、旧计划及下方历史记录。这仅确认实现记录，不保证每条真实旅程通过；第五期发现的具体缺口不抹掉已实现底座。

> **历史边界**：以下第三期与更早的基线、起手顺序和完成声明均为当时留痕，不作本轮待办；第六期证据页的六个产品批次接管排序。

> 第三期实现映射：v3.320＝O2/O3/O9；v3.321～322＝O1/O4/O6/X1；v3.323＝X2/X3/X4；v3.324＝O5/O7/X9；v3.325＝O8；v3.327＝X5/X7；v3.328＝X6/X8。这里仅确认代码承接，不声称全部用户流程已验收。

> **第三期产品主线（2026-10-12，历史计划，排序由第四期接管）**：优化9项＋拓展9项；与另一仓合计36项。
> [优化提升](.agents/notes/proposed/architecture/2026-10-12-product-optimization-v3.md) · [拓展新功能](.agents/notes/proposed/feature/2026-10-12-product-expansion-v3.md) · [代码证据与执行包](docs/planning/2026-10-12-product-evidence.md)。
> 最新用户指令：重心回到手机体验和记忆质量。守卫、台账、发布只作必要配套，不占产品名额；旧计划勾选不是当前事实。此次仅交付并推送计划，不代表36项已实现。


> **第三期及更早实施留痕（2026-10-15，v3.328.0）**：【历史口径，不作本轮待办】以下保留当时实施进度与验证边界；下方所有旧节均为**历史留痕**（含已交付的 A1/A2/A3/T1/T2/X1 与两份 2026-10-04 计划快照），不得当作待办读。
> · **优化计划 O1–O8**：O1（会话身份）/ O3（预算裁剪契约）/ O4（回执消费）/ O5（规模与归档）/ O6（留出与多轮）/ O7（外移依赖与历史测试减负，已交付**六刀**台账：v3.280 宿主↔模块、v3.281 模块↔模块、v3.282 别名、v3.283 常量表值级、v3.284 审计面副本、v3.285 文档读数真实性）**六项已交付各自定向门**；**O2（真实用户操作，**已收口** —— v3.287.0 交互逻辑切片（`scan_ui_interaction.mjs` + `v3287_ui_interaction.test.mjs`）+ v3.300.0~v3.303.0 三刀，+ **v3.318.0 真浏览器切片**：真 Chromium（CDP 直连，零依赖）+ 真 SillyTavern 1.19.0 实测 `boot/装载/真鼠标/真键盘/真 localStorage/Emulation 窄屏/重开保留` 33 条读数（探针 `_mo2_realbrowser_probe.mjs`，`_` 前缀不进 npm test）；★ 该切片当场抓到**产品面真缺陷**：320px 下 `.ls-hint` 的长不可断 ASCII 串无断行且 `.ls-row` 标签容器 `min-width:auto` ⇒ 行被撑到 474px、把 44px 的 checkbox 顶出视口（left=449 > 320），修后在册判据 `scan_ui_narrow_layout.mjs` + `v3318_ui_narrow_layout_gate.test.mjs` 把该形态钉住）**；**O8 为当前主线**（v3.285.0 第一刀：文档读数真实性 —— D1~D9；「当前在役面 / 最近一次全量实跑快照」分列 + 未实跑必须标「全量待验」（反向也判）+ 读数零手抄重绑 + **D9 档自述读数**（CHANGELOG 当前版本节的「档名（N 条）」与两句契约声明核回磁盘/实现）+ 七处真源码破坏负控制）；**第二期 M-O8 已开工**（v3.306.0 第一刀：秘密的「知识范围」注入侧隔离 —— 一份真源 / 三态不同形 / 提取通道接回 / fail-closed；诊断行「秘密隔离」进自检面）；**v3.307.0 第二刀**：秘密正文的三条外供路径收口 —— 证据工作台的投影行 / 结构化查询面 / 宿主导出报告**三面一律不外带正文**，行上增 `scope`（知识范围三态，非秘密账恒 null）与 `masked` 两列（`EVIDENCE_VERSION` 2 → 3 / `QUERY_VERSION` 1 → 2），诊断面报「存在但不可用 · 边界可判 X · 判不了 Y · 判据缺 Z」；**v3.308.0 第三刀**：跨支 / 跨卷的秘密边界改认**知情名单**（`branch-semantics` 与 `volume-continuation` 的 `filterByKeeper` 此前把 `keeper` 当「有权查看的人」，而它在 `secret-ledger` 里是「**不该知道的人**」—— 同名异义、方向整个反了：守密人被放行、在册知情者被挡住；本刀按**名单种类**分派，返回面增 `knowerOnly` / `knowerUndecided` / `knowersMatched` 三档、两模块版本 2 → 3），并把秘密**正文**从「对照读数 / 提案 / 接续包 / 冲突条」四条外供路径上一律剥除（入口剥 + 出口二道闸，剥了几份进 `shadowed` 读数）。
> · **v3.309.0 第四刀**：世界推进账本写入纳入**分支守卫**。★ 修前实测（探针 `tests/audit/_mo8_branch_probe.mjs`，rc=0）：承诺块 / 认知块 / 秘密块**早于**分支守护 295~422 行，`_branchOk` 的四个使用点里世界推进的 **21 个写入口被覆盖 0 处** ⇒ 翻页 / 重生成后被放弃那一分支的承诺 / 支线 / 认知 / 秘密照旧入账，而账本是会话级、无分支归属 —— 这是 M-O8 验收②「A 分支秘密不出现在 B」的字面反例。本刀：判定**前移**到世界推进块之前（只算一次，存 `this._branchVerdict`；§2 改为读它，不再重算 —— 两次判定会得出两个答案）、世界推进块头加闸（`judged === false` 一律放行，与 branch-guard 自己的「漏一点好过全消失」同纪律）、账本面拦截读数 `_wpBranchSkip` 单列进诊断行（与摘要面 `apply-skip` 分开记，不并成一处）。成对套件 `tests/v3309_wp_branch_gate.test.mjs`（16 条，含 5 条真源码破坏负控制 + 正控制地基）。
  **收尾·全量实跑抓出的 5 处红**（1 本刀回归 + 4 既有真缺陷，逐处在基线 `77d5eaa` 上重跑同档对照定归属，全部已修）：① 本刀回归 `v3264 C`（`< 16000` 硬锁当版魔数被 +55 行顶穿 ⇒ 交棒 `line_budget` 登记面）；② 既有 `v3254 D9/D12` + `v3255 C1`（破坏锚裸串因 v3.305.0 第二处同形字面量失去唯一性 ⇒ 负控制空转 ⇒ 改用唯一上下文锚）；③ 既有 `v3203` 8/18（夹具写死 `vnum(CUR)`，漏「任意自锚常量名」锚形 ⇒ needle 改按真源口径现场派生）；④ 非缺陷：`v3159` 全量 TIMEOUT / 单跑 rc=0（并发争抢）。
> · **拓展计划 X1–X8**：**X1 已交付**（v3.270.0，`projection-pipeline.js` 的 `predictInjection()` + `sourceLedger.prediction` 出口，判据 `tests/v3270_b2_injection_preview.test.mjs`）；**X3 已交付**（v3.289.0）、**X4 已交付**（v3.290.0）、**X5 已交付**（v3.291.0）、**X6 已交付**（v3.292.0）、**X7 已交付**（v3.293.0）、**X8 已交付**（v3.294.0）、**X2 已交付**（v3.295.0）、**X1 已交付**（v3.296.0，结构化证据查询与完整度 —— ★ 与 v3.270.0 那条旧 X1（注入容量预演）**同名不同物**，这一条才是拓展计划原文里的 X1）（X2 依赖 O1/O2/O4 —— **O2 仅交付交互逻辑切片、真浏览器面未执行 ⇒ 依赖部分满足**；X3 依赖 O3/O4；X4 依赖两仓保存与边界优化；X5 依赖 X1/X4；X6 依赖 O1/X1/X2；X7 依赖 X1/X5/X6；X8 依赖 O4/O6/X1/X3）。批次口径（拓展计划原文）：第一批 X1/X2/X3、第二批 X4/X5、第三批 X6/X7/X8。
> · **门禁纪律**：用户指令「做完计划全部内容前别跑全量」仍然有效 —— 只跑单门 / 单套件；全量 `npm test`、`npm test -- --audit` 与依赖其产物的断言重绑，集中到计划收口后跑一次。**当前 v3.444.0 **全量待验** —— 读数登记停在 v3.431.0，按本纪律须待 L13 计划全部内容做完后一次性收口实跑，此处显式标注，不得当作已验。****第二期计划（优化 M-O1~M-O9 / 拓展 M-X1~M-X9）已全部交付并收口** —— 故已于 v3.318.0 跑过那一次全量（299/299 文件 · 3302 断言 · 0 失败 · 审计 61/61，登记见 `doc_readings.json`）；上一次收口点是 v3.296.0（X 系列八条全部交付时的实跑读数）。此后回到「盘面一动即标待验」的口径（回到待验是规则，不是退步），由 `scan_doc_truthfulness.mjs` 把守。
> · **测试成本读数**：「测试成本热点读数」也走登记 + 重绑（`tests/audit/test_cost_readings.json`，由 `tools/_rebind_test_cost.py` 消费 `TEST_SUMMARY_JSON` 写入），由 `scan_cost_truthfulness.mjs` 把守 —— 覆盖范围（全量实跑 / 定向采样）必须自述，定向采样不得冒充全量。
> · **当前优先级**：见下方「当前优先级」节；只运行该节三级排序，旧排序节（如「## 优先级」）已陈旧，判据 `scan_plan_currency.mjs`。
> · **第二期计划入口（2026-10-08 核实，v3.296.0 / d0c4a78）**：【历史提案，后续排序已由第三期接管，基线 v3.296.0 —— 拓展计划八条与优化计划 O1–O8 均已交付（O2 仅交互逻辑切片），故第二期只保留仍成立的真实缺口。实施前请重算基线。】
> [优化提升计划（第二期）](.agents/notes/proposed/architecture/2026-10-08-optimization-plan-v2.md) ·
> [拓展计划（第二期）](.agents/notes/proposed/feature/2026-10-08-expansion-plan-v2.md)。
> 两份均为 `proposed`；各自开篇的「过时内容裁定」表已逐条把第一期条目转为「已完成 / 已并入 / 不再追求」。
> · **上一份现行计划入口（2026-10-04 核实，v3.271.0 / 1a0ba36）**：【核实日快照，非永久事实 —— 这些链接指向的 `proposed` 计划以 v3.271.0 为基线；本仓已推进到 v3.284.0，实施前请重算基线。】
> [优化提升计划](.agents/notes/proposed/architecture/2026-10-04-optimization-plan.md) ·
> [拓展计划](.agents/notes/proposed/feature/2026-10-04-expansion-plan.md) ·
> [本轮证据](docs/planning/2026-10-04-evidence.md)。
> 两份均为 `proposed`，本轮仅制定计划。下文保留历史规划与交付台账，其中 <15000 行、反向桥登记、固定集缺口清零和容量预演均已交付，不再是本轮待办；逐项裁定见新计划。当前能力仍以代码为准，实施前重算基线。

> 以下为历史规划与交付记录，原分「优化提升」与「拓宽·拓展·拓深」两部分；当前提案以上方链接为准。> 截至 v3.284.0 的推进状态：O7 已交付五刀（v3.280.0 宿主↔模块副本、v3.281.0 模块↔模块副本、v3.282.0 别名副本、v3.283.0 常量表值级副本、v3.284.0 审计面副本 —— 共五档台账）；O1/O2/O3（存储身份、核心操作、预算契约）此前版本已交付各自定向门；O8 于 v3.284.0 起订正（README/PLAN 的版本与在役读数与磁盘真读数对齐）。
> 区别于 `TODO.md`（滚动待办）与 `FOUR_RELEASE_PLAN.md`（历史追加台账）——本文件回答的是「下一步往哪走」。
> 每条均标注**现状读数**（来自磁盘实读）与**验收口径**。规划以本仓已清理基线为起点。

## 现状基线（规划起点）

| 量 | 读数 | 出处 |
|---|---|---|
| 版本 | **v3.445.0**（index.js VERSION 真源） | index.js |
| 门禁 | 在役面 **447 测试文件 / 69 个 audit 脚本**（`tests/audit` 磁盘 77 `.mjs` + 3 `.cjs`，其中 8 个 `_` 前缀探针不参与执行）—— 磁盘枚举读数 | `tests/` 与 `tests/audit/` 实读 |
| 全量快照 | 最近全量快照 **v3.431.0：430 测试文件 / 4658 断言 0 失败 / 审计 68/68**（全量 `TEST_SUMMARY_JSON=<path> node tests/run.mjs --audit --jobs 3 --audit-jobs 2`；读数由 `tools/_rebind_doc_readings.py` 消费摘要零手抄重绑）；上一快照 v3.429.0：427 / 4609 / 68/68；上一快照 v3.427.0：423 / 4545 / 67/67（当版 **已实跑并登记**；上一快照 v3.426.0：420 / 4532 / 61/61；再上 v3.425.0：420 / 4528 / 61/61）（当版 **已实跑并登记**（全量 `TEST_SUMMARY_JSON=<path> node tests/run.mjs --audit --jobs 3 --audit-jobs 2`）；上一快照 v3.425.0:420 / 4528 / 61/61；再上快照 v3.424.1:420 / 4512 / 61/61；再上一快照 v3.424.0:420 / 4504 / 61/61;上一快照 v3.423.0:419 / 4474 / 61/61;再上一份 v3.355.0:334 / 4066 / 61/61;再上一份 v3.328.0:309 / 3528 / 61/61;再上一份 v3.318.0:299 / 3302 / 61/61;**第二期计划收口点**:优化 M-O1~M-O9 / 拓展 M-X1~M-X9 全部交付;更早 v3.296.0:277 / 2986 / 59/59) | `tests/audit/doc_readings.json` |
> 上一版 v3.430.0 **已实跑并登记**（全量 `TEST_SUMMARY_JSON=<path> node tests/run.mjs --audit --jobs 3 --audit-jobs 2` ⇒ **429/429 文件 · 4646 断言 · 0 失败 · 审计 68/68**；读数由 `tools/_rebind_doc_readings.py` / `tools/_rebind_test_cost.py` 消费结构化摘要零手抄重绑，`tools/gen_test_budget.mjs` 同步刷新预算）。本版 **L12-X1~X9 九项拓展接线**：九件拓展各接「读 / 动作 / 诊断行」三件套（业务落 `engine-diagnostic-lines.js`，宿主只留转发桩，面板承担九面），判据 `tests/v3430_l12_x1_x9_extensions.test.mjs` 19 条 + `tests/v3430_l12_x6_unload_drill.test.mjs` 18 条，三条破坏锚点在真源各恰中 1 次且各配原版对照；抬版锚归收口档（X6 改用数值下界）。**上一版 v3.429.0** 世界线跳跃表结构化编辑器 + 实时读数：解析单源 `parseJumpsText`（坏行带 1 基行号与可读成因）+ 结构化行编辑区 + 三态读数行（`none` / `gap` / `ok`，另加 `unwired` / `bad` / `conflict`），预览 `worldlineJumpDraft` 不写配置；判据 `scan_ui_worldline_editor.mjs`（X1~X7）+ 成对套件 17 条（含六条真源码破坏各配原版对照）。★ 全量首跑 **17 文件红**，逐条归因为**读数欠账而非产品缺陷**：host_beast 基线（入口 11773→11776 / 成员 1188→1190）带着 6 份 A1 套件连锁红、`dead_code_budget` 上界越线 9 行（活跃功能增长 ⇒ 按纪律 `--bump` 到 109378）、`audit_scan_probe_matrix.tsv` 漏登新门（灵敏度矩阵 H/G/T = 0/2/0 实测后补登）、`test_budget.json` 落后 3 个次版本、PLAN 执行状态与快照行陈旧。全部由**脚本重绑**收口，零手抄。；上一版 v3.428.0 **全量待验**（O1 五件零消费内核接管产品面：本版专项判据与定点回归已跑，全量读数随 3.429.0 收口一次性登记）；再上一版 v3.426.0 **已实跑并登记**（全量 `TEST_SUMMARY_JSON=<path> node tests/run.mjs --audit --jobs 3 --audit-jobs 2` ⇒ 420/420 文件 · 4532 断言 · 0 失败 · 审计 61/61；读数由 `tools/_rebind_doc_readings.py` 消费结构化摘要零手抄重绑，本版共修两处**运行时真缺陷**（仿真端到端跑出来的：宿主不推进当前纪元 / 证据不对称被判成同一纪元），判据 54 → 58、锚点 4 → 7）。上一版 上一版 v3.424.1 **已实跑并登记**（全量 `node tests/run.mjs --audit --jobs 3 --audit-jobs 2` ⇒ 420/420 文件 · 4512 断言 · 0 失败 · 审计 61/61；读数由 `tools/_rebind_doc_readings.py` 消费结构化摘要零手抄重绑，本版共修 v3.424.0 的两处世界线真缺陷（`clamp01` 压平 `>1` 段 + 吸引域分段无配置入口），判据 30 → 38、自证 9 → 12）。上一版 v3.424.0 **已实跑并登记**（全量 `node tests/run.mjs --audit --jobs 3 --audit-jobs 2` ⇒ 420/420 文件 · 4504 断言 · 0 失败 · 审计 61/61；本版 M7-X1 世界线记忆与跨线污染闸：新内核 `worldline-memory.js`（四态穷尽互斥 / 两线关系 / 收束三态 / 污染闸四档 / 换线五桶）+ 宿主七个出口转发 + 召回侧跨线闸 + 配置六键；默认关、判不了单列、无标 ≠ 本线））；上一版 v3.423.0 **已实跑并登记**（全量 `node tests/run.mjs --audit --jobs 3 --audit-jobs 2` ⇒ 419/419 文件 · 4474 断言 · 0 失败 · 审计 61/61；本版玩家面板重构：FAB 直达玩家主页、API 前置「常用」页顶、18 组标题去黑话、四 tab 改名、token 作用域化、pill 接实配；README 收敛为玩家门面、玩家无益的文档读数门禁（D1~D9）退场；能力零删除，宿主入口零变化）；上一版 v3.421.0 **全量待验**（实施期按铁律只跑定向判据与定点回归，绝不跑全量；本版完成 index.js 剥离第十批：证据中心/追踪索引/时间轴/悬念链外提至 engine-evidence-center.js，index.js 降至 12122 行；manifest extra_js 243 项）；上一版 v3.355.0 **已实跑并登记**（全量 `node tests/run.mjs --audit --jobs 3 --audit-jobs 2` ⇒ 334/334 文件 · 4066 断言 · 0 失败 · 审计 61/61；读数由 tools/_rebind_doc_readings.py 消费结构化摘要零手抄重绑，见上表）。
| 体量 | `index.js` **12122 行**(探针读数;`wc -l` 12122) / **1276** 成员 —— 宿主巨兽探针实读对账;+ extra_js **249** 项 | `wc -l` / `manifest.json` / `tests/audit/host_beast_probe.cjs` |
| 跨仓外供 | 正向 **7 面**（`open_face_registry.tsv`；v3.314.0 M-X6 新增 `phoneFactReceipt`（consumer `none@0`，手机侧回执面，下游接入属下一轮）；v3.305.0 M-X9 新增 `memoryToolsEnvelope`（consumer `none@0`，下游接入属下一轮））+ 反向 **1 面**（`open_face_registry_inbound.tsv`，下游产出 / 本仓消费） | v3.253.0 建表 / v3.258.0 建反向表 |

---

## 当前优先级（唯一现行排序 · 判据 `scan_plan_currency.mjs`）
> 第六期产品批次接管。第五期已有实现覆盖；本轮只提交规划，不把历史全量或模块探针当新功能验收。
1. **先交付经历与再连接，再深化理解与创作** —— 按第六期证据页A/B批完成完整用户旅程，不先造第二套治理系统。
2. **再交付人物与行动、世界与日常** —— 按C/D批持续强化长线人物、活动、研究、社媒与共营。
3. **最后交付意义与演出、长线与平行路线** —— 按E/F批完成回忆、声音叙事、推理、时代传承与分支试玩；测试和迁移随功能收口。

---

## 一、优化提升

### A1 · 宿主巨兽 `index.js` 继续瘦身【最大杠杆】
- **现状（已推进六刀 · 目标已达成）**：**13883 行**（18401 → 18124 → 17776 → 17444 → 16798 → 15739 → 13883）。
  **已跨过 < 15000 行验收线**。P-2 已分诊并按读数**否掉「按域拆」**，只留「成员级预算 + 文件规模上界」这条轴；
  六刀后实测 TOP5 集中度 **30.1%** / TOP40 **67.1%** / 前缀规则覆盖 **33.8%** / 成员 **521**（TO5/TO40 按**成员**计，不是按域）。
- **路径**：不拆域，每版剥 1~2 个聚簇为 extra_js 模块 —— 已落五刀：第一刀 **v3.257.0** 六个叶子账本类（`memory-ledgers.js`）、
  第二刀 **v3.258.0** 六个工具类（`memory-aux.js`）、同轮第三刀 **v3.258.0** 三个生成侧派生系统（`narrative-generators.js`）、
  第四刀 **v3.259.0** 七个书册/时间类（`memory-books.js`）、第五刀 **v3.264.0** 六个器官类（`memory-organs.js`）、
  第六刀 **v3.266.0** 四个内核数据模型类（`memory-core.js`）。
  **下一刀候选**（★ 下面这份是**四刀时代的旧清单**，其中多项已在 v3.259.0 第四刀剥进 `memory-books.js`；续刀须按磁盘重算。旧排序口径＝类级「判据面爆炸半径」即 类行数 ÷ 被测引用数）：`PrequelSystem`（爆炸半径最小，但依赖 `BM25`，须与它同刀或先提层）、
  再往后的类级候选 `SuspenseBook` / `CharacterMemoryBank` / `EntityLexicon` / `EchoPool` / `IncrementBookmark` / `RelativeTimeHelper`（零外部依赖）/ `PlotTimeline`；
  成员级候选见 `host_beast_baseline.json` 的 `split_candidates.low_coupling_examples`（`recallMemory` 688 / `exportMemoryReport` 349 等）。
- **目标**：index.js 降至 15000 行以下 —— **已达成**（第六刀后 **13883** 行，超出验收线 1117 行余量；六刀共剥 4518 行）。
- **已交付 v3.264.0（第五刀 · `memory-organs.js`）**：六个**器官级**类 —— `LLMCaller` 357 / `WorldProgress` 507 / `VectorStore` 220 /
  `StorageManager` 209 / `CharacterMemoryBank` 102 / `EntityLexicon` 78 行，共 -1352 行；`extra_js` 76 → 77。
  与前四刀（零依赖叶子类）最大的不同：这六类对**主人模块级符号**有真依赖，故采 **barrel 模式** —— 模块内置逐字副本 + 常量副本，
  宿主在引擎构造期经 `bindDeps(deps)` 注入真实现（八键）；`errLog` 是唯一非逐字副本。
  两条被否决的口径写在模块头注里：口径 B（宿主口代理成模块导出）会把宿主函数搬出宿主作用域 ⇒ 与两条读数轴的基线口径冲突（等于偷改尺子）；
  口径 C（改全部历史套件抽取面）单刀面太大且与主题无关。
  同时兑现了本条自列的「每刀必做项」：① 退路 `OrganFallback` 按**方法名**与真实现对账（74 项）；
  ② **扫描面口径跟着代码走** —— `scan_module_wiring` 消费面扩为 `entryCode + A1_CARRIERS` 五个刀口模块、`selfProvided` 认 `defineProperty` 形态，
  约 30 个历史套件按「换真源、语义一字不改」对齐；③ 数量锁与登记面同步（`extra_js` 计数 + `v3209` + `catalog_reference_consumers.tsv` + `v3247` 的 `REGISTRY`）。
  证据：`npm test` 245/245 · 2469 断言；`--audit` 245/245 + 53/53；`tests/v3264_a1_memory_organs.test.mjs` 6/6（含七条真源码破坏负控制）。
- **已交付 v3.266.0（第六刀 · `memory-core.js`）**：四个**内核数据模型类** —— `CharacterState` 755 / `SummarySystem` 641 / `MemoryGraph` 348 / `GameClock` 293 行，
  共 -1856 行（15739 → 13883，**目标达成**）；`extra_js` 77 → 78。与前五刀最大的不同：这四类是引擎的**数据中枢**（图谱 / 摘要 / 时钟 / 状态），
  宿主消费点最密（86 / 93 / 79 / 68 处），且被十余个历史套件以「抠整段进 `new Function`」形态重放 —— 故逐字副本（3 函数 + 3 常量 + 4 条取库链）必须在位，
  否则那些抽取面全部 `ReferenceError`。
  **本刀真抓到一处静默降级（留痕）**：模块侧 `VERSION` 首版照抄宿主写成 `const`，而 `bindDeps` 要给它赋值 ⇒ 当场 `TypeError: Assignment to constant variable`，
  宿主 `_bindCoreDeps` 外层的 `try/catch` 把它吞成「注入 0 项」——**整轮依赖注入在 version 这一键上静默中断**，且不报错。修法：模块侧改 `let VERSION`（附留痕注释），
  生成脚本同步 emit `let`；判据面两条钉住（A 段判 `let` 形态 / D 段把 `let`→`const` 做真源码破坏），B 段另在**全新实例**上真跑一次完整注入（`threw===null` + `n===7`）作为行为面根因探针。
  ② **扫描面口径跟着代码走（本刀面最宽）**：`scan_v3180_three_faces` / `scan_v3184_final_four` / `scan_world_clock_reader` / `scan_world_ledger_reader` /
  `scan_fixture_sync` / `scan_module_wiring` 六处判据面改为「入口 + `memory-core.js`」合看，且**四个负控制夹具同步补搬该模块**（否则门禁在 fixture 里走 fail-closed，
  而那个 exit 2 会被负控制读成「结构漂移判据工作正常」——空对空）；取库口类判据刻意仍只读**宿主自身**源码（模块内逐字副本会让「宿主取库口被换名」这类破坏不可观测）。
  ③ 数量锁与登记面同步（`extra_js` 78 + `v3209` 两处计数 + `catalog_reference_consumers.tsv` + `v3247` 的 `REGISTRY`）。
  证据：`npm test` **246/246 · 2475 断言 0 失败**；`--audit` **53/53**；`tests/v3266_a1_memory_core.test.mjs` 6/6（含十条真源码破坏负控制）；
  六处审计脚本 + 四套依赖守卫（`v3203` / `v3241` / `v3227` / `v3159`）52/52 全绿。
- **验收**：`tests/audit/host_beast_baseline.json` 的成员基线随每次剥离减项（561 → 553 → 549 → 536 → 530 → **521**）、瘦身进度转为可读数；门禁保持 0 失败。
  **目标达成（v3.266.0）**：`index.js` **13883 行 < 15000**，超出验收线 1117 行。后续若继续瘦身属可选加固（最大存量是 `MemoryEngine` 单类 10205 行 ——
  它是生命周期接线本身，外部引用极低，属「唯一入口」形态，P-2 已按读数否掉按域拆；成员级候选见基线 `split_candidates`）。
  **每刀必做项**（三刀各踩一次的教训）：① 退路对账（缺席退路的公开面必须按**方法名**与真实现对账，含 getter）；② **扫描面口径跟着代码走** —— 只读 `index.js` 的审计脚本/内联判据会因消费点外迁而假报死配置；
  ③ 数量锁与登记面同步（`extra_js` 计数、README 人读面、`catalog_reference_consumers.tsv`、`v3247` 的 `REGISTRY`）。

### A2 · 兑现已登记的「未做」
- **`p3_snapshot_bytes` 重跑**：环境障碍已除；探针早已可跑。文档头部曾滞后写 `not_measured`。
- **README 能力索引改写**：已于 v3.255.0（`8b9ea65`）按磁盘真读数重写。
- **验收**：两项在 TODO 勾掉并附读数/证据。
- **已交付 v3.256.0**：订正 `tests/audit/p3_snapshot_probe.md` 头部为 `measured`（读数 N=0:169B … N=200:21207B，superlinear=false）；TODO 同步去掉 `not_measured`。README 无需再改。

### A3 · 缓存正确性的回归加固
- **现状**：v3.255.0 刚修「`_cacheIdentityOf()` 把 revision 填成 `getRevision()` 致缓存被静默禁用」。这类「正确性被静默打掉」的退化最危险。
- **路径**：把 `cache-workload.js` 的七档 `{0,10,...,10000}` 从「只测耗时」扩一档「缓存命中断言」——同等输入下断言缓存确实被命中。
- **验收**：新增断言能把「缓存静默禁用」钉成测试失败。
- **已交付 v3.256.0**：`cache-workload.js` 新增 `cacheHit`（同等输入连读两次：第二次必须 hit；测不出与未命中不同形）。`scan_v3254` 导出面纳入该函数。

---

## 二、拓宽·拓展·拓深

### T1 · 打通「下游→上游」0 面【已交付 v3.258.0 · 另表另判据】
- **现状（订正）**：**「0 面」这句已不真，两个仓的 PLAN 都写过它，两边都没人核过。** 实测下游 `ruby-phone` 的手机记忆桥
  `lonshaBridge`（`apps/memory/lonsha-bridge.js` 导出 `mountLonShaBridge`）早已在本仓真被消费：`index.js` 四处调用点
  （回填 `backfill` / 召回 `recall` / 楼层生命周期 `onFloorCommitted`、`onFloorRollback`）—— 「功能早在跑，登记面 0 面」。
- **路径（已按实测修正）**：「在 `open_face_registry.tsv` 新增第 6 行」**行不通** —— 那张表的判据 （T2 要在**本仓**磁盘上找 `upstream_symbol` 的定义 / T4 `consumer` 语法 / T5 四态 / T6 分态 / `v3253` N0 阳性对照）
  全部按「上游产出、下游消费」设计，方向反转后逐条错位（硬塞会当场把新行判红）。故改为**另起一张同样可核的表 + 一份方向反转的判据集**。
- **已交付 v3.258.0**：`tests/audit/open_face_registry_inbound.tsv`（1 面 × 9 列，`owner` 列是产出方）+ `tests/audit/scan_inbound_faces.mjs`（六条判据 I1~I6，含方向硬断）+ 常驻套件 `tests/v3258_inbound_face_registry.test.mjs`
  （A 表本体 / B 真源码面 / C 负控制七例 / D 工具两向自证 / E 版本锚 / F 判据面自防护 / G 两表实时对账）；
  并订正正向表表头那句「下游→上游方向当前 0 面，故无行」+ 本文件上一行基线读数。
- **价值**：把单向供给做成双向回路，结构性最强；两份表各自保持单一方向，两个问题（「供了几面」/「被供了几面」）都能有一处干净回答。
- **验收**：反向表 1 面在册、六条判据 rc=0、两表实时对账通过、两仓 PLAN 都不再写「0 面」。**已达成**（v3.258.0 全量 241/241 · 2446 断言 · 0 失败）。

### T2 · 注入质量从「真实」走向「相关」【拓深】
- **现状**：已交付注入回执真实性（v3.251.0）+ 剧情质量 40 样本评测（v3.250.0，含 5 项 known-gap）。
- **路径**：评测集从 40 样本扩到覆盖 12 类各自的边缘样本；把 5 项 known-gap 逐项转为「主指标」。
- **验收**：known-gap 计数降至 0，样本数显著上升且三层命中率保持。

### X1 · 世界书干跑从「取数」走向「预演」【拓展 · **已交付 v3.270.0**】
- **交付形态**：`projection-pipeline.js` 新增 `predictInjection()`（纯函数，复用真路径同一批 `deriveBudget`），预演随 `sourceLedger.prediction` 恒有键外供；三态实测（模块缺席 ⇒ 预算面全 null / 世界书未知 ⇒ `chars:null` 而非 0 / 有读数 ⇒ 挤占可复算）；判据 `tests/v3270_b2_injection_preview.test.mjs`。**完成，不再作待办。**

---

## 优先级
> **【陈旧节 · 勿当排序读】** 本节属 2026-10-04 那一轮（v3.271.0 基线），其「1. A1 + A2」「3. T2 / A3 / X1」在 v3.266.0~v3.270.0 已全部交付，仅作交付史保留。**现行排序见文首「当前优先级」节。**
1. **A1 + A2**（瘦身 + 兑现登记项）——成本最低、读数回报最快。
2. **T1**（反向面）——**已交付 v3.258.0**（另表另判据，见上）。**遗留**：下游侧的 PLAN / ITERATION_LOG 记账（下游仓自身的迭代轮次，不阻塞本仓）。
3. T2 / A3 / X1 按版本窗口排。

> 维护规则：本文件条目落地后，在条目末标注「已交付 v3.x.x」并附证据；不删历史条目，保持追加式。

---

# 2026-10-03 推进计划（v3.261.0 基线 · 双仓协同）

> **【历史节，已收口，勿当待办】** 本节是 2026-10-03 那一轮的执行计划（v3.261.0 基线）。它列出的 A1/A2/A3/B1/B2/B3/B4 全部已交付（见各条目末「已交付 vX.Y.Z」）；用户当年指令「做完全部内容前别跑全量」**现在仍然有效**，并已升格为长期纪律（见文首「当前执行状态」）。本节保留作为交付史。
> 执行铁律：本节全部落地前**不跑全量**（`npm test` 全量 / `--audit` 全量），只跑单门 / 单套件。
> 基线真读数（本节起手）:80 js / 43928 行 / `index.js` **17091 行**（A1 目标 <15000，差 2091 行）/ `extra_js` 76 项；门禁 244 文件 / 2447 断言 · 0 fail，`--audit` 59 脚本。
> **本节终态（v3.266.0 收口）**：79 js / `index.js` **13883 行**（A1 **已达成**）/ `extra_js` 78 项；门禁 **246 文件 / 2475 断言 · 0 fail**，`--audit` **53/53**。
> 本仓是「深度机」：最大杠杆仍是 **A1 瘦身 + 账本族判据面补强**，其次才是功能拓展。

## 优化提升

- **A1 · index.js 瘦身至 <15000 行【既定主线 · 杠杆最大】——第六刀已交付 v3.266.0（13883 行）· 目标达成**：`18401 → 13883`（六刀共剥 4518 行），已跨过验收线。
  后期可选续刀（非验收必需）：成员级候选 `recallMemory` 688 行 / `exportMemoryReport` 349 行（见 `host_beast_baseline.json` 的 `split_candidates.low_coupling_examples`）；
  或转向「账本族判据面补强」这条同样高杠杆的轴。
  每刀三件套（取库口 / 退路对账 / 统一构造点）+ 数量锁同步 + 「同名函数抄哪份」真行为断言。
- **A2 · 判据面卫生【对标 ruby-phone v3.54.0 的 58 项学费】—— 已落地 v3.267.0**：三形态假绿（对原文件断言 / 破坏写死常量 / 破坏把判据自己删了）已固化为**可机检读数**：
  `tests/_fakegreen_hygiene.mjs`（判据唯一真源，9 条硬信号 K1–K9 + 不饱和读数 + 三形态名）+
  `tests/audit/scan_fakegreen_hygiene.mjs`（门禁，A/B/C/D 四面 + 三态出口）+ `tests/v3267_fakegreen_hygiene.test.mjs`（常驻套件，含三条真源码破坏负控制）。
  **实测读数**：17 份 `*_negctl.mjs` 全部具备「真源码破坏 → 独立树上真跑 → 按归因翻红」的形状；破坏①掏空一份负控制 ⇒ exit 1 点名、破坏②裁判断某条信号 ⇒ 归因点名该条、破坏③扫描面塌成 0 份 ⇒ exit 2（不得用「找不到东西」冒充「东西没问题」）。
  **负控制跟随真源迁移**：判据首版把「阳性对照」写成过窄正则（只 11/17 饱和），实测核实后确认是**判据自己的正则过窄**而非 6 份缺项 —— 已修并留痕（这是「把『我没想到的写法』读成『对方有缺陷』」的老毛病）。
  剩余：`npm test -- --audit` 纳入**定期全量**（防 audit 脚本漂移）—— 按用户纪律（本节全部落地前不跑全量）留待计划收口后随终局全量一并执行。
- **A3 · 缓存正确性回归加固【已落地 v3.267.0】**：`cache-workload.js` 的 `cacheHit` 断言交付 v3.256；本轮把同类「正确性被静默打掉」退化模式补成常驻断言 —— 新增 `tests/v3268_cache_same_input.test.mjs`（15/15）：
  A 纯函数面（stale-guard）同输入不变量：同输入 ⇒ 同 id/指纹/**幂等键**且跨时钟不变（强推时钟后逐字不变 —— 幂等重放的承重面）、键序无关、三入口不改入参、三态可分、behind 门控两向；
  B 投影新鲜度**面**：同实例重复导出与不同实例同输入必须同形、三态键集冻结（同代 `null` / 丢弃 `dropped,from,reason,to` / 本来没这面 `null` 且与丢弃不同形）；
  C 四条真源码破坏负控制（seed 塞 `createdAt` ⇒ 幂等键逐轮漂移 / behind 门控摘掉 ⇒ `no-fingerprint` 消失且不连坐读集闸 / 面里塞 `at` ⇒ 键集 `+at` 现形 / 面里删 `reason` ⇒ 键集递减现形），每条都带阳性对照；
  D 工具两向自证 + 判据纯度；E 两张台账；F 版本锚。
  **连带修掉 A2 的三处真遗留**（登记面 × 2 + 坏锚点 × 1，不是本刀引入）：① 破坏工具接收方台账漏登 A2 新建档；② 灵敏度矩阵漏登 `scan_negctl_hygiene`（根因是名字含 `negctl` 子串，被四处按名分类器当成「配对负控制」，修法是改子串而非补登）；③ `v3241` C1 的坏锚点 ` —— 实测值面随时钟变化（值断言必 flaky），而键集在破坏副本上跨时钟逐字稳定。首版拿「键序判据」做 C1 的「不连坐」时实测到偶发假红（并发 4 路下 3/5 轮出现），已改用时钟无关的三态判据并留痕。

## 拓宽·拓展·拓深

- **B1 · 注入质量从「真实」走向「相关」【已落地 v3.268.0】**：评测集扩到覆盖 12 类各自的边缘样本；known-gap 逐项转主指标。
  验收：**known-gap 计数降至 0（实测 4 → 0）**，且三层命中率保持。
  落地形态：`EVAL_VERSION` 2→3（主样本 8→11，原三缺口转正）、`STORY_EVAL_VERSION` 1→2（样本 43→55，12 类各 +1 边缘样本、`gp2` 借生产既有的节点 `aliases` 通道转正）；
  ★ 先扩缺口、再让词表真命中（**不是放宽判据**：期望集一个字没动）：`EMO_LEXICON.warm` +5 / `anger` +1 + `EMOTION_OPPOSITES` 同步（+新键「气得」）——
  探针实证「只扩词表对召回零影响」，故两处必须同改；判据交棒为「缺口为空 + 反坐实」（喂自造 gap 须复现），套件 `tests/v3269_b1_injection_relevance.test.mjs`（16/16）
  用**真源码降级副本**两向证明缺口真会回来（命中率 0.75→1.0、主导维 0.909→1.0）。
- **B2 · 世界书干跑从「取数」走向「预演」【双仓 X1 · 已落地 v3.270.0】**：projection 出口携带「这条世界书占多少 token、挤掉哪条记忆」的容量 / 挤占预演字段，下游 ruby-phone 可读。
  验收：**预演随 `sourceLedger.prediction` 恒有键外供**（实测三态：模块缺席 ⇒ 预算面全 null / 世界书未知 ⇒ `chars:null` 而非 0 / 有读数 ⇒ 挤占可复算）。
  落地形态：`projection-pipeline.js` 新增 `predictInjection()`（纯函数，复用真路径同一批 `deriveBudget`）；「世界书占用并入 reserve 槽」即得挤占量，**不是另写的近似公式**；
  ★ 关键设计结论：下游 `projection-contract.js` 认死 `SUPPORTED_API_VERSION = 1`，抬 api 版会当场打断四个现役业务 App ⇒ 预演**只能**做 `sourceLedger` 子键，`ENVELOPE_FIELDS` 与 api 版一字不动；
  口径纪律：世界书条目「要不要进提示词」由宿主的激活引擎定（**不在本插件可观测面内**）⇒ 只算 `enabled && constant === true`（每轮必进），全库量单列 `upperChars` 作上限、不得当实际占用；
  交付档 `tests/v3270_b2_injection_preview.test.mjs`（19/19，三条真源码破坏 + 阳性对照 + 出口面不变式）。
- **B3 · 跨仓反向面消费深化**：`ruby.lonshaBridge` 反向面新增（现仅 4 调用点 backfill / recall / onFloorCommitted / onFloorRollback）。候选 usage-tracker 使用画像 / ruby-phone 新缝 18 件 App 关键事实（health 孕程 / traveldesk 行程）上桥进引擎账本。验收：反向表新增面在册 + 六条判据 rc=0 + 两表实时对账。
- **B4 · 账本族可读出口**：`evidence-workbench` 九账对账面从诊断工具升级为调参工具，新增按楼层 / 按角色 / 按账三维检索，下游织光机 / 全局搜索联动呈现。

## 协同主线（与 ruby-phone 双仓拧一股）

1. **双仓瘦身对齐**：本仓 A1 与 ruby-phone A1（873KB index.js）同用四刀范式（本仓已验证成熟，对方直接复用）。
2. **判据卫生互鉴**：ruby-phone v3.54.0「判据交棒改写 + 活基线零手抄刷新」经验回喂本仓 A2；本仓三形态假绿自检 H5/H6 回喂对方。
3. **跨仓桥消费深化**：ruby-phone B1 互联层聚合事实，经本仓 B3 反向面上桥进引擎账本——「手机从孤岛陈列升级为引擎数据前端」。

## 起手两件（历史节：两件均已交付，勿当待办）
> **【陈旧节 · 勿当排序读】** 本节属 2026-10-04 之前的收尾轮，其两件均已交付，仅作交付史保留。**现行排序见文首「当前优先级（唯一现行排序 · 判据 `scan_plan_currency.mjs`）」节。**

① ruby-phone A2（80 App 消费点矩阵，纯只读零风险，立刻产出对账读数）；② 本仓 A1 续刀（按磁盘重算候选后剥下一刀）。
