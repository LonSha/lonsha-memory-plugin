# lonsha-memory-plugin 发展规划

> 本文件是当前**前瞻性规划**，分「优化提升」与「拓宽·拓展·拓深」两部分。
> 区别于 `TODO.md`（滚动待办）与 `FOUR_RELEASE_PLAN.md`（历史追加台账）——本文件回答的是「下一步往哪走」。
> 每条均标注**现状读数**（来自磁盘实读）与**验收口径**。规划以本仓已清理基线为起点。

## 现状基线（规划起点）

| 量 | 读数 | 出处 |
|---|---|---|
| 版本 | v3.266.0（四源同源） | `scan_version_guard.mjs` |
| 门禁 | **246 测试文件 / 2475 断言 0 失败** + **53** 个 audit 脚本（`--audit` 53/53） | `npm test` / `npm test -- --audit` |
| 体量 | `index.js` **13883 行**（物理行；探针读数 13883 / **521** 成员 —— A1 六刀后，第六刀 -1856）+ extra_js **78** 项 | `wc -l` / `manifest.json` / `host_beast_baseline.json` |
| 跨仓外供 | 正向 **5 面**（`open_face_registry.tsv`）+ 反向 **1 面**（`open_face_registry_inbound.tsv`，下游产出 / 本仓消费） | v3.253.0 建表 / v3.258.0 建反向表 |

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
- **验收**：`tests/audit/host_beast_baseline.json` 的成员基线随每次剥离减项（561 → 553 → 549 → 536 → **530**）、瘦身进度转为可读数；门禁保持 0 失败。
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

### X1 · 世界书干跑从「取数」走向「预演」【拓展】
- **现状**：下游 F-9 已交付世界书干跑**取数层**（`worldbook-selection` 7 出口）。
- **路径**：上游侧配合做「预演层」——让用户注入前预览「这条世界书占多少 token、挤掉哪条记忆」，与上游 projection 面衔接。
- **验收**：projection 出口携带容量/挤占预演字段，下游可读。

---

## 优先级

1. **A1 + A2**（瘦身 + 兑现登记项）——成本最低、读数回报最快。
2. **T1**（反向面）——**已交付 v3.258.0**（另表另判据，见上）。**遗留**：下游侧的 PLAN / ITERATION_LOG 记账（下游仓自身的迭代轮次，不阻塞本仓）。
3. T2 / A3 / X1 按版本窗口排。

> 维护规则：本文件条目落地后，在条目末标注「已交付 v3.x.x」并附证据；不删历史条目，保持追加式。

---

# 2026-10-03 推进计划（v3.261.0 基线 · 双仓协同）

> 本节为当前执行计划。用户指令：「把计划存入远端和记忆库，然后开始推进，在做完全部内容前，别跑全量」。
> 执行铁律：本节全部落地前**不跑全量**（`npm test` 全量 / `--audit` 全量），只跑单门 / 单套件。
> 基线真读数（本节起手）:80 js / 43928 行 / `index.js` **17091 行**（A1 目标 <15000，差 2091 行）/ `extra_js` 76 项；门禁 244 文件 / 2447 断言 · 0 fail，`--audit` 59 脚本。
> **本节终态（v3.266.0 收口）**：79 js / `index.js` **13883 行**（A1 **已达成**）/ `extra_js` 78 项；门禁 **246 文件 / 2475 断言 · 0 fail**，`--audit` **53/53**。
> 本仓是「深度机」：最大杠杆仍是 **A1 瘦身 + 账本族判据面补强**，其次才是功能拓展。

## 优化提升

- **A1 · index.js 瘦身至 <15000 行【既定主线 · 杠杆最大】——第六刀已交付 v3.266.0（13883 行）· 目标达成**：`18401 → 13883`（六刀共剥 4518 行），已跨过验收线。
  后期可选续刀（非验收必需）：成员级候选 `recallMemory` 688 行 / `exportMemoryReport` 349 行（见 `host_beast_baseline.json` 的 `split_candidates.low_coupling_examples`）；
  或转向「账本族判据面补强」这条同样高杠杆的轴。
  每刀三件套（取库口 / 退路对账 / 统一构造点）+ 数量锁同步 + 「同名函数抄哪份」真行为断言。
- **A2 · 判据面卫生【对标 ruby-phone v3.54.0 的 58 项学费】**：固化三形态假绿自检（对原文件断言 / 破坏写死常量 / 破坏把判据自己删了），统一「真源码破坏 → 加载副本 → 副本上重跑同款真判据」范式；
  `npm test -- --audit` 纳入**定期全量**（非版本节点才跑），防 audit 脚本漂移。新判据须过 H5（锚点字面量只声明一次）/ H6（锚点不存在 / 不唯一须抛、破坏须可观测）两向自证。
- **A3 · 缓存正确性回归加固**：`cache-workload.js` 的 `cacheHit` 断言已交付 v3.256（勾掉）；剩余把同类「正确性被静默打掉」退化模式（`stale-guard` / projection 新鲜度）补同输入断言。

## 拓宽·拓展·拓深

- **B1 · 注入质量从「真实」走向「相关」【PLAN T2 既定】**：评测集从 40 样本扩到覆盖 12 类各自的边缘样本；5 项 known-gap 逐项转主指标。验收：known-gap 计数降至 0。
- **B2 · 世界书干跑从「取数」走向「预演」【双仓 X1】**：projection 出口携带「这条世界书占多少 token、挤掉哪条记忆」的容量 / 挤占预演字段，下游 ruby-phone 可读。
- **B3 · 跨仓反向面消费深化**：`ruby.lonshaBridge` 反向面新增（现仅 4 调用点 backfill / recall / onFloorCommitted / onFloorRollback）。候选 usage-tracker 使用画像 / ruby-phone 新缝 18 件 App 关键事实（health 孕程 / traveldesk 行程）上桥进引擎账本。验收：反向表新增面在册 + 六条判据 rc=0 + 两表实时对账。
- **B4 · 账本族可读出口**：`evidence-workbench` 九账对账面从诊断工具升级为调参工具，新增按楼层 / 按角色 / 按账三维检索，下游织光机 / 全局搜索联动呈现。

## 协同主线（与 ruby-phone 双仓拧一股）

1. **双仓瘦身对齐**：本仓 A1 与 ruby-phone A1（873KB index.js）同用四刀范式（本仓已验证成熟，对方直接复用）。
2. **判据卫生互鉴**：ruby-phone v3.54.0「判据交棒改写 + 活基线零手抄刷新」经验回喂本仓 A2；本仓三形态假绿自检 H5/H6 回喂对方。
3. **跨仓桥消费深化**：ruby-phone B1 互联层聚合事实，经本仓 B3 反向面上桥进引擎账本——「手机从孤岛陈列升级为引擎数据前端」。

## 起手两件（成本最低、读数回报最快）

① ruby-phone A2（80 App 消费点矩阵，纯只读零风险，立刻产出对账读数）；② 本仓 A1 续刀（按磁盘重算候选后剥下一刀）。
