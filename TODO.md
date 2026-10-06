# TODO — LonSha 记忆插件

> [v3.280.0] O7 第四项：**逐字副本台账** —— 宿主 `index.js` 与根级模块里 **9 对 `function` 体逐字相同**（剥注释 + 折叠空白后比对），两套维护面此前**无任何一致性判据**。现在双向登记：新增未登记的副本即红、登记项漂移即红，且漂移给出第一处差异位置与两侧上下文。破坏三形态各有负控制（宿主侧 / 模块侧 / 凭空抄一份）。取块用跳过引号与注释的配平（裸数花括号会被正则字面量里的 `{` 提前收口）。
> [v3.281.0] O7 第四项（续）：**模块↔模块副本面** —— 既有的副本判据 100% 只覆盖「宿主 ↔ 模块」，把同一套归一化口径掉转横向用在 79 个根级模块之间，实测 **15 簇 / 60 对**逐字副本（族 A 账本状态形状：`reject`/`result`/`record`/`clone`/`openCount`/`remove`；族 B 哈希与文本原语：`hash32`/`fnv1a`/`textOf`/`stableStringify`/`toSet`/`fpOf`/`normTime`）。全仓唯一有「反重复」语义的 `scan_ledger_contract` R3 只钉三个字面量，这 15 簇一个都不在射程里。现在簇级双向登记：新增未登记簇即红、成员集合变了即红（点名掉出去的模块）。同名不同体（`reject`/`result` 的六账版与三账版）必须分成两条独立簇 —— 合簇会把两种语义的差异抹掉。破坏三向各有负控制（族 A 成员 / 族 B 成员 / 凭空多出一簇）。判据纯度按**转义形态**计数（多行锚点在源码里是 `\n` 两字符，真换行 split 恒 0 会让该断言空转）。
> 新面 `tests/v3281_o7_module_copy_ledger.test.mjs`（10 条）；台账双手登记（`catalog_reference_consumers.tsv` + `v3247` REGISTRY）。
> **最近更新：v3.283.0** —— O7 第四项（续三）：**常量表值级副本面**。O7 的副本判据到 v3.282.0 已有四层（v3280 宿主↔模块 `function` 体、v3281 模块↔模块 `function` 体、v3282 别名「同体不同名」、v3264/v3266 的 `VERBATIM_CONSTS`），**四层里没有一层在钉常量的值**：v3280/v3281 的枚举面只吃 `function` 形态（常量表不在面内）；v3282 虽然枚举常量表，但只收**名字不同**的簇，而这三对恰恰**同名**；`VERBATIM_CONSTS` 的判据体只做 `new RegExp('(const|let)\\s+' + c + '\\s*=').test(modSrc)` —— **只查声明是否存在、不含任何值比对**。这是「判据的面漏一类」的第六处（前五处：v3.227.0 **文件面**漏 `settings-ui.js`、v3.279.0 **声明面**漏 `function`/顶层 `const`、v3.279.0 **形态面**漏裸标识符、v3281 **副本面**漏「模块↔模块」、v3282 **副本面**漏「同体不同名」）。
> **实测证伪**：把 `memory-organs.js` 的 `ARCHIVE_TOP_LEVEL_KEYS` 副本在表尾 `'extensions',` 后插一个多余键（值级漂移、声明仍在）⇒ `node tests/run.mjs` **262 文件 / 2703 断言 / 0 失败，整片全绿** —— 该副本值漂移，整套测试面完全不可见。这正是 O7 第一条「减少实际重复实现」的反面：重复实现没人守，就是两份会各自腐化的真源。
> 登记 3 对同名常量表（实测两侧逐字相同）：`ARCHIVE_TOP_LEVEL_KEYS`（index.js ↔ memory-organs.js，629，`Object.freeze([`）、`RELATION_CONFLICT_GROUPS`（index.js ↔ memory-core.js，134）、`STORAGE_FP_FIELDS`（index.js ↔ memory-organs.js，65）。三对都在 v3264/v3266 名单里被**按名**登记过（在场性），本档补**值**这一维（互补非重复）。
> 新档 `tests/v3283_o7_const_table_copy_ledger.test.mjs`（10 条）：A 枚举面下限（根级 .js ≥60 / 常量表枚举 ≥200 / 同名跨文件对 ≥2）+ B1 三对值级双向一致 + B2 漂移可归因（带 md5；**声明形态单列一维** —— `[` 与 `Object.freeze([` 生命周期不同，摘了 freeze 值同契约不同须点名）+ C1/C2/C3 真源码破坏三向（宿主侧 / 模块侧 / 宿主真表整份复制进新模块），**C1 两侧各破一次**（两侧声明行逐字同形，只破一侧证明不了另一侧在面内）+ D 工具两向自证 + E 判据纯度 H5（**按「字面量的持有常量数」计** —— 宿主/模块同形那一对刻意共用同一常量，若照抄成两个同形常量名，本档就自己制造了一对冗余）+ F 自防护 / 三源同源。
> 边界（诚实）：只保证「登记在案的副本值两侧逐字相等 + 新出现的对必须登记」，不判定这三对是否应合并为单真源；面只覆盖数组/对象字面量表（含一层 `Object.freeze(`/`new Set(`/`new Map(` 包装），标量常量不收；与 v3282 常量面不重叠（v3282 收名字不同的，本档收名字相同的）。
> **最近更新：v3.282.0** —— O7 第四项（续二）：别名副本面。
> **最近更新：v3.282.0** —— O7 第四项（续二）：**别名副本面**。O7 的副本判据到此有三层（v3280 宿主↔模块、v3281 模块↔模块、v3264/v3266 的 `VERBATIM_CONSTS`），三层枚举面**都只按名字配对** —— 于是换个名字把同一段实现抄过去，三层全部静默。这就是「判据的面漏一类」的第五处（前四处：v3.227.0 **文件面**漏 `settings-ui.js`、v3.279.0 **声明面**漏 `function`/顶层 `const`、v3.279.0 **形态面**漏裸标识符、v3281 **副本面**漏「模块↔模块」）。
> 实测 8 簇（真源 `stripComments` 归一化，80 个根级 .js，function / 类方法 / 常量表与箭头常量三形态）：`_numOrNull`/`numOrNull`（258）、`floorOrNull`/`toNum`（208）、`RESIDENT_FALLBACK`/`RESIDENT_MARKERS`（159）、`keys`/`pFields`（64）、`_trunc`/`truncateText`（61）、`_num`/`_num0`（60）、`_text`/`txt`（56）、`normOp`/`normRef`/`normStr`（34）。
> 其中两条注释**自己承认**了跨文件重复（`archive-shift.js`「改口径必须两处同改」、`cost-ledger.js`「与 index.js RESIDENT_MARKERS 保持同字面量」），但注释所指的两条「钉」都是**行为等价**（v3239 A2 逐输入比对 / v3211 §8 成员集合），不是逐字副本台账 —— 值级漂移（改一个字面量、改一处空白布局）它们都看不见。另查证 `v3264` 的 `VERBATIM_CONSTS` 只查**声明是否存在**、不查值相等。
> 新档 `tests/v3282_o7_alias_copy_ledger.test.mjs`（10 条）：A 枚举面下限 + B1 簇级双向一致 + B2 漂移可归因（点名掉出去的成员）+ C1/C2/C3 真源码破坏三向 + D 工具两向自证 + E 判据纯度 H5（单行锚点，先钉「无多行锚点」防计数空转）+ F 自防护 / 三源同源。
> **最近更新：v3.281.0** —— O7 第四项（续）：模块↔模块副本面。
> **最近更新：v3.280.0** —— O7 第三批收尾：**扫描器的面漏了一类，结论就完全反了**。`scan_wiring` 的 A7 从「方法级」扩到**声明级**（方法 + 函数声明 + 顶层常量表），引用面补上 `tests/audit/*` 与 `tools/*`；扩面后当场现形两条**永不执行**的真死声明（`collectCycleTasks` / `const TIME_WORDS_ZH`）并删除。
> 修前的面：`DEF_RE` 负向断言显式排除函数声明形态，顶层 `const <表> = [` 也不在面内 —— 于是 A7 一直报「零引用 0」，被读成「没有死代码」。与 v3.227.0 的**文件面**漏洞（漏 `settings-ui.js`，`fetchModels` 被判零引用）同族。
> 读数：`A7 声明级…: 声明 579 / 有真引用 554 / 仅测试·审计 25 / 零引用 0`（旧读数「方法 474 / 462 / 12 / 0」）。
> 形态面再补一类：**裸标识符（`ref`）** —— 旧四形态全不认 `for (const x of NAME)` / `NAME.indexOf(...)` 这类最朴素写法，14 个在役常量被误标「仅测试·审计」；更要紧的是**真死代码只要被任一测试提一次就能藏进 A7.2、逃过 A7.1 硬失败**。`ref` **只在去注释的入口面上**算（读注释当调用是假绿通道）。补后读数：`声明 579 / 有真引用 567 / 仅测试·审计 12 / 零引用 0`。
> 处置：两条死声明删除（`index.js` 13776 → 13771 行）；台账头补扩面留痕；A7.1 失败文案补面说明、**保留**被 v3228/v3230 匹配的子串。
> 新面 `tests/v3279_o7_scanner_decl_surface.test.mjs`（8 段，判据与负控制跑同一个 `judge`）；`host_beast_baseline` 按探针重建到 3.279.0。
> [v3.278.0 上一版] O7 第二批：9 个历史抽取套件从「从源码抠已外移类 + `new Function` 重放」迁为真模块装载，减负账本 `new Function` 22→5 / `extractClass` 28→1 / `areLabelsInConflict` 4→0。
> 减负账本：`new Function` 22→5（余下 5 处全是宿主同文件函数，合法保留）/ `RELATION_CONFLICT_GROUPS` 8→0 / `areLabelsInConflict` 4→0 / `extractClass` 28→1 / `braceEnd` 20→0；九档字节 77082→70992。
> 真实行为证据增量（双向对照，不是单向破坏）：破坏 `memory-core.js` 的 `normalizeCharName` ⇒ `v360_graph_dedup` **迁移前 rc=0 / 迁移后 rc=1**；方法级破坏（`vacuum`/`addEdge`/`addNode`/…）迁移前后都红 —— 故增量**严格来自类外符号**，如实记录。
> 迁移边界（实证）：只迁已外移的类；宿主同文件函数（`buildNpcTierInjection`/`fmtNpcTiesContext`/`extractThinkingChain`/`stripMemoryOpsTags`）的 `new Function` 抽取面保留 —— `v343` 第 2 段仍需 `errLog`（首轮误删致 `ReferenceError`）。
> 新面 `tests/v3278_o7_extraction_to_real_load.test.mjs`（7 段）；`host_beast_baseline` 按探针重建到 v3.278.0（四条不变量断言一条未改）；台账两手登记（tsv + v3247 REGISTRY）。
> [v3.277.0 上一版] O7 第一批：真 vm 装载实测证出「宿主符号注入」在真实装载顺序下**从未生效**（构造期必定 module-missing），修四个真缺陷后同面给出「构造期如实缺席 / 装载后全补齐（organs 换满 8 项）」双轮读数；键面简写错名、config 模板被 null 清空（注释与实现相反）、诊断面不可真跑一并收口。
> 判据同步收紧：键面正则删 `(_?)` 假绿通道；注入口判据改为「收集点 >= 2 处且无裸语句调用」；负控制锚点改多行形只打构造期那一处。
> 新面 `tests/v3277_o7_dep_injection.test.mjs`（判据与负控制跑同一个 judge 函数）；v3264/v3266 的 C 段基线与真 index.js 重新同源。
> 同版全量回归暴出三条真缺陷（HEAD 上同样红，非既有基线）：`v312`/`v39` 的**固定字符窗口耦合**（断言目标被顶出 `slice(idx, idx+3000/2500)` 窗口，恰差 1 字符）改花括号配平取整块；`_m_o4_probe.mjs` 的命中面**未冻结时钟**（快照带 `exportedAt: Date.now()` ⇒ 测的是毫秒巧合，随机红）改量测窗内冻结。三处均附真源码负控制。
> 留出集真跑三阶段 24/24，冻结集对照 54/54 未回归；留出集首稿 10 例越过机制轴（零词面重叠）已按同标准修正**样本**、未动生产词表。
> 同版立 `tests/audit/scale_archive_baseline.json` 基线（1000/5000/10000 楼四路径，**合成数据非实机**），总判 `not-done-until-evidence` ⇒ 不改产品。
> 「改楼/切聊/恢复真失效」仍由 v3.254.0 的 `cache-identity.js` + `v3254` 把守，本版不另建第二真源。
> 同版收口两项全量回归暴露的真缺陷（**不是既有基线**）：① v3.271.0 修 D2 时误删了 `showBrowser` 的 4 段交互绑定
> （那是唯一实现），本版搬回并补 `eng` 别名 ⇒ `v374` / `v379` / `v380` 转绿；
> ② `v3266` C 的「死代码上限留痕」判据硬锁当版字面量（`note.includes('3.267.0')`），改成版本无关不变量
> （当前 `ceiling` 必须能被最后一条 `history` 记录解释）；死代码上界按 `--bump` 抬 `44883 → 45313`（附理由）。

> 本版不新增未修项；P-1（**死方法处置：先证再删，并把「空集合」也变成有判据的状态**）已落地并留痕于 CHANGELOG v3.229.0：
> O-6（v3.227.0）把「定义在 `index.js` 里却没人调」的方法从 93 条误报降到 **4 条冻结台账**；
> 本版逐条实测后**删除定义**（`_legacyHybridMerge` 38 行 / `callGeneric` 9 行 / `breakPromise` 5 行 /
> `queryByFloor` 1 行，共 53 行），台账由「冻结基线」升级为「**处置台账**」（`# [已删·分类] 方法名 — 理由`）。
> **反坐实**：台账原记「删 `_legacyHybridMerge` 需连配置键一起处置」——实测**不成立**，
> 配置键 `hybridAlpha` 的活消费点是 `hybridMerge()`（删除前 index.js:6832），与遗留方法无绑定关系；
> 删除后仍是活配置，`scan_config_liveness` 仍绿。
> 为什么「归零」也要一整套判据：台账是双向判据（新增即红 / 清掉也要改表），
> 归零后它与实测都是空集 —— **「空对空」是永远成立的绿**。
> 怎么知道它还没变：`tests/v3230_dead_method_disposal.test.mjs`（A 定义确已删 + 保留面逐条在场 + 台账格式；
> B 空集合非空台账 + 反坐实留痕；C 扫描面未退回只扫 index.js；**N1/N2 两条整仓镜像端到端负控制**；
> D 版本锚）。
> 同轮修掉三处**判据自身**缺陷：① `v3156 [4f]` 把「两条读 α 路径并存」当不变量（**判据在保护已被设计淘汰的状态**）；
> ② `v3228 B1/B2/N3` 在空集合上退化成「空对空 / 空跑」；③ **`v3230 N1` 首版负控制假绿** ——
> 探针方法名完整字面量写在判据里，被 A7 的 `tests/` 扫描面当成「有一条测试引用」，
> 读数落进 A7.2 仅测试引用而 A7.1 零引用仍为 0（**破坏根本没被观测到**），修法为运行时拼接探针名。
> 边界：口径仍是**文本形态**判定（不解析 AST、不追动态拼名）；删除不可回滚（除 git 历史），
> 保留面已由 A2 钉住；真实宿主实机未验。

> 只记**已确认、未修复**的项。修掉即从本文件删除，并在 CHANGELOG 里留痕。
> 不许写「待优化」这类没有判据的空条目：每条都要能回答「怎么知道它还没修」。
> 最近更新：v3.272.0
>
> **【UI 运行时面 · v3.271.0】用户报障「点 ⚙️ 设置，一个字都渲染不出来」**（本条=已修，留痕在此以免同类形态回流）：
> 五处缺陷**一次性**修掉，全部**只在运行时暴露**：D1 `showSettingsPanel` 函数体内 `esc` 未定义（调用即抛
> `ReferenceError`）/ D2 `showStatsPanel` 内 4 段判定块引用 `viewType`（那是 `showBrowser` 的形参，跨函数作用域错位）/
> D3 `\${ck(...)}` 被双反斜杠转义 / D5 `style="display:none;`（模板值缺右双引号）⇒ **属性吞并**后续整段 HTML，
> 致 `#ls-clear` 不存在、同函数后段 `querySelector('#ls-clear').addEventListener` 炸在 **null** 上。
> **为什么 250 个测试 + 5 个审计脚本全绿仍放行**：唯一的 UI 门禁 `scan_ui_binding.mjs` 的 A1–A6 全是**静态绑定卫生**，
> 它读文本、**从不执行任何 UI 入口** —— 这一整族（作用域错位 / HTML 属性吞并）在这一面没有出口。
> **本版新增** `tests/audit/scan_ui_runtime.mjs`（零依赖·自带最小 DOM shim·判据 U1–U5，含非零下限）+
> `tests/v3271_ls_settings_panel_ui_runtime.test.mjs`（13 个 test / 17 条断言，含三条真源码破坏负控制）。
> 读数：`settings-ui.js` 194472 → **185918** 字节；**8 个 `show*` 入口实调 0 异常**；面板 DOM 元素 1959 / 控件 75 个带 id。
> 边界：本门禁是**入门的近似**而非浏览器等价物 —— 它拦的是「函数一调用就抛」「控件根本没进 DOM」这两类，
> **不承诺渲染像素正确**；真实宿主实机仍未验。灵敏度矩阵实测 H/G/T = `0 / 2 / 0`。
> 本轮同时修掉门禁自身两处**归因**缺陷（入口数下限须先看 `loadError` 分档；U2 与 U3 须独立取数，否则入口一抛错 U3 就整段到不了）。
>
> **【A1 主线续刀 · v3.266.0】A1 宿主巨兽第六刀**：四个**内核数据模型类**（`CharacterState` 46 方法 755 行 /
> `SummarySystem` 34 / 641 / `MemoryGraph` 18 / 348 / `GameClock` 13 / 293）抽为 `memory-core.js`（`extra_js` 第 78 项）；
> `index.js` **15739 → 13883 行**（净 −1856），成员 530 → 521。**A1 立项目标（< 15000 行）本刀达成**（现余量 1117 行）。
> 与前五刀最大的不同：这四类是引擎的**数据中枢**，宿主消费点最密（86 / 93 / 79 / 68 处），且被十余个历史套件以
> 「抠整段进 `new Function`」形态重放 —— 故逐字副本（`normalizeCharName` / `sanitizeJson` / `areLabelsInConflict`
> + `PLUGIN_NAME` / `RELATION_CONFLICT_GROUPS` / `VERSION` + 四条取库链）必须在位；`bindDeps(deps)` 七键作为活口。
> **本刀真抓到一处静默降级（留痕，只跑真行为才发现）**：模块侧 `VERSION` 首版照抄宿主写成 `const`，而 `bindDeps` 要给它赋值，
> 当场 `TypeError: Assignment to constant variable`；宿主 `_bindCoreDeps` 外层的 `try/catch` 把它吞成「注入 0 项」——
> **整轮依赖注入在 version 这一键上静默中断且不报错**。修法：模块侧改 `let VERSION`（附留痕注释）、生成脚本同步 emit `let`；
> 判据面两条钉住（A 段判 `let` 形态 / D 段 `let`→`const` 真源码破坏），并在**全新实例**上真跑一次完整注入（`threw===null` 且 `n===7`）作为行为面根因探针。
> 代价面（本刀最宽）：`scan_v3180_three_faces` / `scan_v3184_final_four` / `scan_world_clock_reader` / `scan_world_ledger_reader`
> 四处门禁判据面改为「入口 + `memory-core.js`」合看，且**四个负控制夹具同步补搬该模块**（夹具缺文件会让门禁走 fail-closed，
> 而那个 exit 2 会被负控制读成「结构漂移判据工作正常」——**空对空**）；`scan_fixture_sync` 的 E2 清单与 `v3247` 的 `REGISTRY` 同步登记。
> 边界：真实宿主实机**仍未验**（本版读数依旧是无头读数）；四类里 `parseStoryDateLoose` / `storyDayDiff` 只在一条注释里出现、无代码引用，
> 故模块**不搬也不取**（避免长出第二个时间解析真源）；`RelativeTimeHelper` 的 else 分支是「形态在场、永不执行」的遗留，**不造假类去填**。
> 判据：`tests/v3266_a1_memory_core.test.mjs`（6/6，含十条真源码破坏负控制）；六处审计脚本 + 四套依赖守卫（`v3203`/`v3241`/`v3227`/`v3159`）全绿。
>
> **【同轮第四件 · v3.259.0】A1 宿主巨兽第四刀**：七个「书册 / 时间」类（`IncrementBookmark` / `EchoPool` / `SuspenseBook` /
> `PrequelSystem` / `RelativeTimeHelper` / `PlotTimeline` / `BM25`）抽为 `memory-books.js`（`extra_js` 第 72 项）；
> `index.js` **17444 → 16798 行**（净 −646）、成员 549 → 536。选型依据是**两条跨簇真依赖边**
> （`PrequelSystem.selectInjection` 内 `new BM25()`、`SuspenseBook.getOpenPrompts` 内 `new RelativeTimeHelper()`）——
> 拆成两个模块就得另造注入链，故同刀搬。交接纪律同前三刀：取库口 `_memoryBooksLib()` / 常量空实现退路
> `MemoryBooksFallback`（公开面 55 个方法名对账）/ 统一构造点 `_newMemoryBooks(name, ...args)`；
> `RelativeTimeHelper` 另有**唯一取用口** `_newRelativeTimeHelper()`（宿主 13 处零散读取收成一个，
> 4 处 `new` 全部处在「取用口优先、裸 new 兜底」形态里）。
> 判据真源随代码搬家：`v3130`（`extractDualTimeTags` 解析诊断）/ `v346`（悬项倒计时）/ `v386`（BM25 分支检索）等
> 十余处抽取面切到模块文件；`v3209` 数量锁 71 → 72；参考基准补登记 `v3261`。
> 新增常驻套件 `tests/v3261_a1_memory_books.test.mjs`（A 接线逐点 / B 真加载与逐类语义（含两条依赖边真行为）/
> C 基线同源 / D 六条真源码破坏 / E 出生版本下限锚 / F 判据面自防护），首版 4 处判据缺陷逐处修后 **6/6**。
> **本刀最大教训（已留痕 CHANGELOG）：抽类时「同名函数抄哪一份」不是笔误而是功能缺陷。**
> `index.js` 里 `parseStoryDateLoose` 有两份（IIFE 顶层那份返回 `{type, year, month, day}`、内层闭包那份返回 `{y, mo, d}`），
> 首版按「函数声明提升后生效的是后者」抄了闭包那份 —— 那句理由**是错的**（提升只在同一作用域内替换同名声明）。
> `PlotTimeline` 声明在 IIFE 顶层、读的正是前者的形状，于是带锚点日期时 `getChangesSince` **恒返回空数组**
> （无锚点那条路径不受影响 ⇒ 静默功能回归），由 v3261 的「带锚点真行为」断言当场抓住并已改抄正确的那一份。
> 另两处自伤：模块导出面漏 `bindErrLog`（宿主「取库口现算」分支恒 false、静默降级）已补；
> 模块内一处非可选链 `window.SillyTavern.getContext()`（在可选链守卫之下作二级兜底）已收敛为整条可选链。
> 边界：真实宿主实机**仍未验**（本版读数依旧是无头读数）；`index.js` 距 A1 验收线 15000 行仍差 **1798 行**。
> **【同轮第二件 · v3.258.0】A1 宿主巨兽第二刀**：六个工具类（`HolidayAware` / `Mutex` / `OpLog` / `FloorLedger` /
> `SnapshotManager` / `EmergencyBackup`）抽为 `memory-aux.js`（`extra_js` 第 70 项）；`index.js` **18124 → 17776 行**
> （净 −348）、成员 561 → 553。交接纪律对齐第一刀：取库口 `_memoryAuxLib()` / 常量空实现退路 `MemoryAuxFallback`
> （公开面按方法名对账）/ 统一构造点 `_newMemoryAux(name, opts)`；`EmergencyBackup` 的 `errLog` 改显式注入形态。
> 判据真源随代码搬家：`v3145`/`v3150`/`v3155`/`v3169`/`v340`/`v355`/`v3157` 七处执行面切到模块文件；
> `v3205`+`scan_v3202` 两处 P5 换判据形态（无转义子串）；`v358`/`v3230`/`v3209` 三处真源与数量锁同步；
> 新增常驻套件 `tests/v3259_a1_memory_aux.test.mjs`（A 接线逐点 / B 真加载行为 / C 基线同源 / D 四条真源码破坏 /
> E 出生版本下限锚 / F 判据面自防护）；`v3257` 的当版硬锚按纪律交棒为出生版本下限锚。
> 本刀自伤四处已留痕于 CHANGELOG（退路漏三个 getter、转义层数不可手推、加参需整函数替换、模块内类序与宿主不同）。
> 边界：真实宿主实机**仍未验**（本版读数依旧是无头读数）；`index.js` 距 A1 验收线 15000 行仍差 **2776 行**。
> 本批全量测试实跑通过：**240/240 文件、2440 断言、58.8s**（`npm test`，并发 7）；
> 首轮全量曾出三个「我改红」（`v3209`/`v3230`/`v358`，真源搬家未同步），逐处修完转绿；全量 `--audit` 仍未跑。
> **【同轮第三件 · v3.258.0】A1 宿主巨兽第三刀**：生成侧派生系统三个类（`DiarySystem` / `ReflectionSystem` / `OutlineDirector`）抽为 `narrative-generators.js`（`extra_js` 第 71 项）；`index.js` **17776 → 17444 行**（净 −332）、成员 553 → 549。
> 选型按类级轴量「判据面爆炸半径」（类行数 ÷ 被测试/审计文件引用数），与前两刀的整类抽取口径一致；交接纪律同第二刀（取库口 `_narrativeGeneratorsLib()` / 常量空实现退路 `NarrativeGeneratorFallback` / 统一构造点 `_newNarrativeGenerator(name)`）；新增常驻套件 `tests/v3260_a1_narrative_generators.test.mjs`（6/6，含四条真源码破坏负控制与判据面自防护）。
> **本刀最大的教训：抽类改造的隐性成本是「扫描面口径」。** `tests/audit/scan_config_liveness.mjs` 只读 `index.js`，三个生产侧消费点随类搬家后被判成「死配置 / 幽灵配置」，连带 `v3157`/`v3159`/`v3160`/`v3161`/`v3227`/`v3230`/`v391` 七处红。修法照本仓既有范式（扫描面 = 入口 + `manifest.extra_js`，入口固定在首位；无 `manifest.json` 的合成树退回单文件面）。
> 其余四处「真源跟代码走」：`v337`（2 锚）/`v338`（1 锚）/`v347`（**8 锚**，系一次全量锚点普查抽出，而非只修「第一个失败」）/`v3156`（`PROBES` 混合面清单）/`v3160 [1b]`与 `v391 [9]`（各带内联扫描面）。
> 本刀自伤五处已留痕于 CHANGELOG（全量首条错误≠根因、退路漏三成员、宿主依赖口径不是一刀切零依赖、转义坑三次与占位符纪律、探针键名不可猜与占比口径）。
> 边界：真实宿主实机**仍未验**（本版读数依旧是无头读数）；`index.js` 距 A1 验收线 15000 行仍差 **2444 行**。
> 本版全量测试实跑通过：**241/241 文件、2447 断言、0 失败**，并完整跑了 `node tests/run.mjs --audit`：**53/53 审计脚本全通过**（45.2s，含本轮改过的 `scan_config_liveness.mjs` 3.4s）。首轮全量曾出 **11 个红**（配置活性族 8 / 文本锚族 3），逐处归因修完转绿。
> **【本批更正】** 原文写「并对齐《优化提升计划》M-O1~M-O4 / R-O1~R-O4 与《拓展升级计划》F1~F9 的批次映射」——
> 实测该映射**当时并未建立**（该文件零条 M-O*/R-O*），系**声称过头**；本批已按磁盘补齐实际映射：
> · 上游 M-O1 = **v3.249.0**（`v3249`，13 项）/ M-O2 首批 = **v3.250.0 + v3.250.1**（`v3250`，40 样本 / 15 项）
> · 上游 M-O3 = **v3.251.0**（`v3251`，22 项）/ M-O4 = **v3.254.0**（`v3254`，21 项）。
>   本行原写「M-O4 **未做**（规模曲线与缓存身份无交付）」—— 那是 v3.251.0 轮的真实读数，已由 v3.254.0 作废：
>   缓存身份四位（会话 / 代际 / 修订号 / 历史指纹）与六词**具名**失效原因落 `cache-identity.js`；
>   长线规模四条消费路径（快照 / 候选化 / 序列化 / 设置界面）在 1000/5000/10000 档的量测落 `cache-workload.js`；
>   读数说不支持热点 ⇒ `not-done-until-evidence`，**不改产品代码**（计划原文「只有证明有收益的热点进入产品修改」）。
>   **同轮兑现审计（v3.255.0）**：刚交付的身份面被自查出一处**静默禁用缓存**——
>   `_cacheIdentityOf()` 首稿把 `revision` 位填成 `storage.getRevision()`（**无条件**自增的落盘计数器，三条即时存盘路径都踩）
>   ⇒ 同一楼编辑/swipe/删楼一次就换读数 ⇒ 缓存永不命中。已修（这一位不自行填）并把**C9 身份来源**判据落 `scan_v3254`
>   （静态在**剥注释**副本上看；行为面用**真源码抽出的方法体**真跑）+ 当版套件 `v3255`。
>   同轮另修：四位分工块里仍写旧口径的两行（实现已改、文档没改）；以及审计层本地重写
>   `stripComments` 被 `scan_audit_lib_consolidation` 当场判红 ⇒ 改为转调唯一真源 `tests/_audit_lib.mjs`。
> · 下游 R-O1 + R-O2 = **v3.17.0**（全历史检索两档化 + 搜索重依赖移除）/ R-O3、R-O4 **未做**；
> 计划二 F1~F9 见 `tests/audit/open_items_reconcile.md` §4；
> 计划一「共同配套」第 1 条点名的两组**过期状态**（上游 P-2/P-3 勾选、上游「手机未消费 eventPlatforms」）
> 已于本轮按磁盘读数补齐，勾选项不再滞后（T8 陈旧文案同步加更正块）。
> 同轮另核（第三批）：**能力索引**（根 `README.md` 自报 v1.1.0 / Phase 9，点名的 9 个模块文件
> —— `visualizer.js` / `graph-worker.js` / `worker-manager.js` / `virtual-renderer.js` / `wasm-bridge.js` /
> `storage.js` / `gpu-renderer.js` / `realtime-sync.js` / `cloud-sync.js` —— 磁盘全无）**陈旧且零门禁覆盖**
> **【v3.253.0 轮】** 计划一「共同配套」第 2 条（跨仓功能登记表）**已交付**：
> `tests/audit/open_face_registry.tsv`（5 面 × 9 列）+ 守卫 `tests/audit/scan_open_faces.mjs`（七判据 / `rc=0`）
> + 常驻套件 `tests/v3253_open_face_registry.test.mjs`（21 条）。四态逐字在 `invalid_conditions` 列，
> 「缺席与空不同形」在 `absent_vs_empty` 列且须真列两种以上态词。
> 同轮顺带收口 **F-4 projection 五态消费普查**：不是缺口，是「已闭环但无人断言」——
> 上游产品面**有意 0 消费**（裁定函数随 envelope 交下游），下游真消费 **6 处 / 下限 4** 并由其 J8 把守；
> 本轮把它从散点变成可查。完整读数见 `tests/audit/open_items_reconcile.md` §4n。
> **连带登记面不止两处**：新增测试文件须同时问三张表（参考基准 `catalog_reference_consumers.tsv` /
> 扫描器矩阵 `audit_scan_probe_matrix.tsv` / 破坏工具接收方台账 `v3247` 的 `REGISTRY`），第三处是抬版后跑全量才抓到的。
> （`scan_version_guard` 不含 README、`scan_claim_truthfulness` 只吃 `index.js`）；因属用户门面改写，**只登记不改**。
> 计划二 F7 首阶段「只读内容对照」经源级取证**未交付**：`diffPayloads` 实测只到**顶层键面**（`snapshot-checkpoint.js:343-364`），
> 内容级对照仍无；上一轮对账里「内容级 `diffPayloads`」一句**已自审更正**（对账文件 §2 与 §4c、下游 F-1 块同步）。
> **【v3.252.0 轮更正 —— 本条文案已陈旧，以磁盘为准】** 计划二 F7 首阶段已**交付**：`snapshot-checkpoint.js` 新增**并列出口**
> `diffPayloadsDeep`（键面读数继承既有 `diffPayloads`，新增逐条改动 / 集合对拍四态 / 有界三读数 / 三态 `deepContentCompared`），
> 引擎侧 `compareBranchCheckpointsDeep` + `checkpointContentDiffLines`，面板并排对照按钮**真调用**文案口；
> 判据面为 `tests/v3252_content_level_checkpoint_diff.test.mjs`（19 条，含三条真源码破坏负控制）。
> 上面那句「未交付」保留作历史记录，不再代表当前状态；计划二 F7 的**后续阶段**（实机真跑数据下的差异面展示、跨设备快照差异比对）仍为开项。
>
> **「证据面登记表无人守 + 违规账本只有人读读数」已于 v3.248.0 处置**（计划 #11 / #12 / #21）——
> 本版实测 `grep -rln 'apiGlobal' tests/` **零命中**：`evidence-workbench.js` 的九账登记表
> （`LEDGERS`）与宿主取库面（`_ledgerApis()`）**各写一份名单**，此前没有一道门守过。
> 后果是**静默失效**：把 `apiGlobal` 改个名，宿主仍取旧键 ⇒ 工作台永远显示「模块未挂」而全仓不响。
> 新门禁 `tests/audit/scan_evidence_binding.mjs` 七条判据（R1 证据面在场 / R2 登记表结构 /
> R3 `apiGlobal` 存活性 / R4 加载面（`extra_js` **且磁盘存在**）/ R5 键集**两向**对差 /
> R6 `project` 调用点兼容 / R7 反内联回潮），退出码三态（`0` 卫生 / `1` 真缺陷 / `2` 结构漂移）。
> **#12 口径裁决**：计划字面写「参数计数 ≥ 2」，但**实测 9 处定义中 8 处是 `(it)`、仅 1 处 `(it, api)`**
> ⇒ 按字面执行会误伤 8 处，故按原意改为查**调用点**必须传 `api`。
> **#21 落地口径**：新增 `_ledgerViolationReport` / `_ledgerViolationMarkdown` 两个出口，
> `_ledgerViolationSummary` 改为 report 的**派生读数**（原先两处各算一份，拆口径必漂移）；
> 环形账本裁剪补记 `_ledgerViolationsDropped`（此前只 `splice` ⇒「正好 200 条」与「已裁几千条」**同形**）。
> 怎么知道它还没变：负控制 8 组（`scan_evidence_binding_negctl.mjs`，含 V0 原版对照）+
> `tests/v3248_evidence_contract.test.mjs`（16 项，含真源码破坏的反向自证）+ 探针矩阵 H/G/T 实测 **0/2/0**。
> 同轮修掉**四处判据自身缺陷**（留痕于 CHANGELOG）：① `bodyOf` marker 落**调用点**（必须点名 `function _ledgerApis(`）；
> ② `keyOf` 是**可选**字段，判据列为必需即「判据比契约更严」；③ R7 作用域收窄到工作台体内
> （别处有合法直读）；④ 套件侧：缺陷走 `stderr` 须合并两股流、类方法简写**不是**函数表达式
> （`new Function` 必须补 `function` 关键字）。另：负控制夹具账本清单**必须从 `_ledgerApis()` 派生**
> —— 手抄清单喂不满门禁，V0 原版对照会与真缺陷**同形**（v3.240.0 记过的形态）。
>
> **「破坏工具 27 份各写一份」已于 v3.247.0 收编** —— 实测分化：名字 5 种、参数序 4 种、
> 错误类型 2 种、校验强度 3 种；后果不是「不整洁」，是**纪律没有出口**（措辞表散在各处，
> 读代码的人无法判断某个破坏工具守了什么）。
> 收编过程中发现更贵的一层：**正则锚点形态下「恰中 1 次」是空转的** ——
> `src.match(re)` 不带 `g` 返回首个匹配对象，`|| []` 把它当数组用 ⇒ `.length` 恒为 1，
> 锚点命中 3 次也照样放行（**判据看起来在守，实际数不出第二个命中**）。
> 唯一真源 `tests/_break_kit.mjs`（导出面 10 项 + 三别名同一函数对象 + 四条口径），
> 门禁 `scan_break_kit.mjs` 五层判据 + 外部观测点 `scan_break_kit_negctl.mjs`（5 组，两向自证）。
> 怎么知道它没变：`tests/v3247_break_kit_consolidation.test.mjs`（A 真源面 / B 收编面 /
> C 六处修复落点与磁盘同源 / D 六组真源码破坏负控制 / E 版本锚）+ `scan_fixture_sync.mjs` 的
> E2 行为探针（登记的整树复制必须真跑一次且 exit 0）+ `v3245 B1` 的 pairDiff 行为断言。
> 边界（如实登记）：
> · 同源判定是**文本形态**（剥注释 + 元字符分段核对），不解析 AST、不追动态拼名；
> · 「片段同源」只证明**写法**同源，不证明该断言真的会命中运行时消息（后者要靠各档自己的负控制）；
> · `scan_break_kit_negctl.mjs` 的整树复制探针实测约 12s/次，尚未进常规全量链路（需显式驱动）；
>
> **未收敛面（v3.245.0 登记）已于 v3.246.0 收编** —— 逐条核过「同一份名册还是同名异义」之后：
> 三处（`scan_ledger_contract.mjs` 的 `BOOKS` / `v3207` 的 `BOOKS` / `v3240` 的 `BOOK_FILES`）
> 是**同一份名册** ⇒ 已改为从唯一真源 `tests/_fixture_sync.mjs` 派生；
> `v3242`/`v3243` 的 `GAUGED` 是**同名异义**（mirror 树要搬的文件集，含 manifest / index / TSV）
> ⇒ 不按名册收编，只把其中「九本账」那一截换成派生。
> 同轮新增门禁 **R9**：名册（手写一处）与「谁真的在跑契约」（派生读数）必须**同源** ——
> 原先门禁断言的是「扫描面里有 N 本账」（判的是手抄清单），于是**新增一本账本级消费者**
> 能同时绕开 R1 与 R2/R2b/R3/R3b/R3c，全门禁零响应。
> 怎么知道它没变：`tests/v3246_roster_single_source.test.mjs`（A/B 同源面 + C 行为面 +
> D 六组真源码破坏负控制 + E 版本锚），以及 `scan_ledger_contract_negctl` 的 V13/V14 两向观测点。
>
> **F-2（跨平台事件来源构成）已于 v3.233.0 落地** —— 事件段的 `source` 从 40 字自由文本
> 折成**受控分级四态**（extract / platform / other / none，`other` 保留原串）；
> 平台标签由**登记方显式给出**（T11：不作文本猜测归类）；构成面计数恒为**截断前真值**，
> 且**不含任何判断字段**（trust / weight / priority / important / confidence / severity / truth
> 在序列化 JSON 上逐个钉住零出现）。
> 同轮探针抓到两条真缺陷：① 证据面事件账**出处列恒 null**（条目顶层本无 floor，登记表照抄别账）；
> ② `copySegment` **非幂等**（`ledger-entity.js:finite(null) === 0` ⇒ 二次归一化把「没给」塔成「第 0 楼」）。
> **反坐实**：计划行文把 `event-chain.js` 列为交付面 —— 实测它是 **agent run 生命周期**校验，
> 与「剧情事件的平台」无关（源码 `/platform/i` 零命中），已写进判据防后人照抄。
> 怎么知道它还没变：`tests/v3234_event_platform_composition.test.mjs`（24 项：出口与口径 /
> 分级四态 / 构成面 / 出处修正 / 幂等与三态 / 诊断接线 / 旧档逐字兼容 / 六条真源码破坏负控制 / 版本锚）。
>
> **F-2 的下游侧（ruby-phone）已接入 —— 本条已被 v3.234.0 复校推翻（原文写「尚未接入」）**：
> 实测下游 `config/world-bridge.js:287` 导出 `readLonshaEventPlatforms`，
> `apps/timeweaver/timeweaver-collector.js:139` 与 `apps/worldpulse/worldpulse-app.js:341`
> 各一处真消费（**2 消费点 / 2 文件**），常驻判据 `tests/system-v321.test.mjs` 已把
> 「面缺席 / 空 / 不可用」三态钉开（`face-absent` 与空面不同形）⇒ **计划文本陈旧，按读数修正、不重做**。
> 原文（保留以便追溯）：worldpulse / timeweaver 对 `readLonshaSnapshot().eventPlatforms`
> 的消费点**待做**；「本条就是怎么知道它还没做」—— 该句已反向成立。
>
> **F-3（同楼同刻 ≥2 在场读数）与 F-6（两条观察项口径自述）已于 v3.232.0 落地** ——
> 同一条纪律「**只给事实，不给判断**」：F-3 只回「同楼同刻有谁」（无冲突激烈程度字段），
> F-6 只回「我们怎么算的」（不改口径本身）。
> 怎么知道它还没变：`tests/v3233_co_presence_and_notes.test.mjs`（15 项：事实面字段恒定 /
> 三态「给了但解不出 ≠ 没给」/ 「没给楼层」不进任何一层楼 / 拼音稳定序且 keys 与 names 同序 /
> 有界且 count 是截断前 / 自述面无副作用 / 三条真源码破坏负控制）。
>
> **P-2（index.js 宿主巨兽分诊）已于 v3.231.0 落地** —— 只量不拆：成员 559 个（v3.233.0 重建后 560）、TOP5 占 21.7%、
> TOP40 占 51.3%、10 条前缀域规则只覆盖 24.7%（重建后 24.9%）、over-80 行成员 32 个、缝合模块 34 个/45 个引用点。
> 「按域拆」按读数**否掉**：最大成员是生命周期接线本身（外部引用极低＝「唯一入口」而非「松散」）、
> 引用读数只能当上界（同名成员混算）、规则外互调 4696 处（重建后 4697）且九道门禁无一道检查跨模块可见性。
> 唯一有读数支持的轴是「成员级预算 + 文件规模上界」，**本版只立判据不动手**。
> 怎么知道它还没变：`tests/v3232_host_beast_triage.test.mjs`（14 项：基线四件 / 探针口径自证
> （8 空格切分 + 假零防护）/ TOP40 按**同名第 k 条**对位在场 / 结论挂在读数上 / 三条镜像仓负控制）。
>
> **P-3（快照外供面规模取证）已于 v3.230.0 落地** —— 全仓唯一对外读数出口此前零规模读数；
> 实测三条缩放曲线近似线性（空 117 B / 400 角色 35 917 B·1.253 ms / 1600 角色 124 597 B·5.158 ms），
> **characters 一面占 80.6%**，成本 65% 在深克隆段且**与字节成正比、与面数无关** ⇒
> 「砍面数换不到收益」按读数否掉（13 面下游各有读者、快照是出口不是缓存、恒定承载面仅 3.3%）；
> 唯一有读数支持的瘦身轴是「每面预算 + 如实截断读数」，**本版只取证不动手**。
> 怎么知道它还没变：`tests/v3231_snapshot_scale_evidence.test.mjs`（12 项：基线四件 / 口径强制 /
> 缩放自洽 / 探针不得重演 O-5 口径错误 / 逐面账可复算 / 结论算术可复算 / 三条负控制 / 版本锚）。
> 本版不新增未修项；O-5（**性能取证：先有可比基线才谈优化**）已落地并留痕于 CHANGELOG v3.228.0：
> 合成数据 + 真模块量了六条热路径（`replayShift` 1000 楼 0.34ms / `replayDrop` 1.06ms / `coverage` 0.11ms /
> `summary` 1.53ms / 200 楼 0.04ms），缩放**未观察超线性**；
> 同轮修掉探针自身一处口径错误（把 `mkHost(1000)` 的 51.55ms 夹具成本算进被测调用，两次读数差 290 倍）。
> 怎么知道它还没变：`tests/v3229_perf_evidence.test.mjs`（基线四件齐备 + 「合成数据非实机」强制 + 
> 探针计时区不得含夹具构造 + 真跑探针读数同量级 + 三条负控制）。
> 边界：**合成探针不代表实机性能**；不覆盖向量检索 / LLM 调用 / 注入裁剪等 I/O 与网络路径；
> 本版只取证不改代码。
> 本版不新增未修项；O-6（**死代码方法级扫描：先修准判据，再让数字变小**）已落地并留痕于 CHANGELOG v3.227.0：
> 旧读数「A7 定义但检索不到调用点 (93)」经逐条复核，**绝大多数是扫描器自己的盲区** ——
> 不认可选调用 `name?.(`、不认引号里的名字 `'getPublicData'`、扫描面只有 `index.js`
> （`fetchModels` / `unlockFact` 的调用点在 `settings-ui.js`，活代码被报成零引用）。
> 修后读数：**方法 434 / 有真引用 397 / 仅测试 33 / 零引用 4**；4 条各自带分类理由，冻结在
> `tests/audit/scan_wiring_dead_methods.tsv`（新增即硬失败；清掉也要改表）。
> 怎么知道它还没变：`tests/v3228_dead_methods_ledger.test.mjs`（A 口径双向 + A2 扫描面完整 +
> B 基线双向一致 + B3 fail-closed + N 三条负控制）。
> 边界：口径是文本形态判定（不解析 AST，不追动态拼名调用），故 `zero` 只表示「文本面找不到引用形态」，
> 不自动判「可否删」。
> 本版不新增未修项；O-4（**门禁隔离与耗时：先量再决定改不改**）已落地并留痕于 CHANGELOG v3.226.0：
> 量出——全量 wall 37.6s / 子进程 CPU 149.2s（并行度 3.96x）/ tests 段 34.3s / audit 段 19.3s；
> **镜像瘦身是伪优化**（排除 .bak 只省 0.2s）故不做；**段间并行**不做（负控制 spawn 与 7 路测试叠加只会加剧竞争）。
> 实测抓到一条**真竞态**：`v3215` / `v3221` / `v3222` / `v3223` / `v3224` 把临时产物落在**仓根**，
> 与「整仓镜像」类测试（`v3206` / `v3225` / `v3159` / `v3203` / `v3204`）的 `cpSync` 互撞 ⇒
> `ENOENT … lstat '…/.tmp_v3224_n12_xxx'`，长期被归为「环境资源问题」（v3.205.0 的 T7 定性）。
> 已全部改落 `os.tmpdir()`（5 文件 6 处），并发复跑 143/143。
> 怎么知道它还没变：`tests/v3227_gate_isolation_and_timing.test.mjs` 的 B1（仓根禁写，实扫 ≥ 200 个 .mjs）、
> C1（跑批前后仓快照 + git status 零漂移）、C2（两组子集墙钟上界）；
> 基线四面对外可读：`tests/audit/gate_timing_baseline.json`（含 `not_done` —— 明确不做什么）。
> 边界：上界刻意宽（约实测 3 倍）——拦数量级倒退，不赌 CI 抖动；全量级隔离未自动化。
> 本版不新增未修项；O-3（**判据灵敏度体检：29 个审计扫描器里有没有已经不能判的**）已落地并留痕于 CHANGELOG v3.225.0：
> 三档退化形态（H 正常树 / G 根 .js 全删 / T tests/ 掏空）全量体检，实测 **H 列 29/29 全为 0、两档皆 0 的 0 个**；
> 抓到并修掉 1 处真 fail-open —— **语法门 `scan_syntax.mjs` 在根 .js 全删/全掏空时仍 exit 0**，
> 报「270 / 335 个文件均可解析」（0 个源文件的世界里「都能解析」为真，但本门存在的唯一理由就是入口文件；
> 旧代码只有 `total === 0` 一道，而掏空根 .js 后 tests/ 树里仍有 200+ 个 .mjs，那道兜不住）。
> 修法：默认根补「入口在场 + 非退化」守卫（exit 2），显式 `--root` 的语义逐字不动。
> 逐条读数落在 `tests/audit/audit_scan_probe_matrix.tsv`（29 行 × H/G/T + 判读）。
> 怎么知道它还没变：`tests/v3226_audit_sensitivity.test.mjs` 的四条性质判据 —— 双向齐全（新增扫描器不登记即红）、
> H 列全 0、G/T 至少一列非 0（无恒绿探测器）、D 组把语法门新守卫行为化（最小镜像两条路径 × 五种输入）。
> 边界：三档只覆盖「输入面不在场」这一维；8 个无负控制驱动的扫描器本版不动（已由 H/G/T 与 v3159/v3177 兜底）。
> 本版不新增未修项；O-1（**「没给」与「给了 0」在场所面上的判开是假的**）已落地并留痕于 CHANGELOG v3.223.0：
> **R3-D（v3.221.0）声称把 `import()` 七格改走 `numOrNull`、判开「没给」与「给了 0」，
> 而实现是 `numOrNull(x) ?? 0` —— 对 `` / `null` / `[]` / 非数字串，它与修前的 `num(x) ?? 0` 结果完全相同：
> 那是改名不是修复**（十格探针实测全为 0）。本版把 import 七格如实判成 `null`，
> 并把写侧 `apply` / `setLocation` / `setPresence` 三处的 `Number(...) ? ... : 0` 改成「取不到即拒绝」；
> 两处 setter 的**签名与返回语义未变**（仍是 false 表示没写成），`apply` 仍返回登记条数（拒绝即 0）。
> 同轮收紧 `tests/v3222` 的 A1 —— **它此前把未修状态写成断言、测试名却写「不得落成第 0 楼」，
> 即判据在保护缺陷**（这一条比缺陷本身更值得记：判据撒谎比实现撒谎更难发现），
> 并新增 A2b 覆盖写侧三处（此前写侧没有任何判据面）。
> 为什么第 0 楼必须与「没给」判开：宿主 `message.index` 是 **0 基**，0 是合法楼层；
> 下游 `ruby-phone` 的 `place-data.js` 对 `atFloor` / `firstFloor` / `lastFloor` 用的正是 `numOrNull`，
> 视图把 `null` 渲染成空、把 `0` 渲染成「第0楼」——**下游早已备好 null 这条路，上游从未喂过它**。
> 怎么知道它还没变：`tests/v3222` 组 A1 的七格 `null` 断言 + A2b 的写侧拒绝断言（任一退回 0 即红）。
> O-2（**同族普查：回放/前移层上「没给」与「给了 0」的第二次发病，且这次长在 R3-E v3.222.0 新写的代码里**）
> 已落地并留痕于 CHANGELOG v3.224.0：修前 `replayShift(host, null)` 把 volumes 1..9 整段减到 0..8、
> 归档集合 `[0,1,2,5]` → `[0,1,4]`、两个注入游标各减一（**整树前移一格**）并返回 9；
> `ledger-replay.js` 新增唯一取值门 `floorOrNull`，「没给」⇒ 一格子不动且报告写 `skipped: 'floor-not-given'`；
> 同族六面（ledgerOwner 工厂 / shiftLedgerItemFloors 本体 / floor-ledger / archived / inject-cursor 的入参）
> 一并收干净；宿主侧 `numOr` 补数组门、`rollbackFloor` / `shiftFloorsFrom` / `MESSAGE_DELETED` 三处入口门。
> 同轮修掉三处**判据自身**问题（首稿修复引入的变量遮蔽被反坐实组抓住；N3 判据挂错路径；注释说得比实现更满），
> 并撤回两处**越界主张**（三个面不该参与前移 / 抬 `LEDGER_REPLAY_VERSION`）—— 既有判据 v3190 第 8/9 条优先于推演。
> 怎么知道它还没变：`tests/v3225` 的 B 组（「没给」⇒ skipped 且逐字节不动）+ C 组（真给 0/'5'/' 5 ' 照常回放）
> + N1/N2/N3/N4/N5 五条真源码负控制（任一门退化 ⇒ 同款判据转红）。
> 边界：不改「谁参与回放」的既有语义；面内门保留静默 0 风格（与 `scene-book.js` 先例一致）；实机未验；
> 下游 ruby-phone 不抬版（新增外供面只有 `skipped` 字段，下游无消费点）。

> **第二批（首稿只改调用点，门本体没动）**：`numOrNull` / `num` 改为「先看类型」
> （修前 `typeof` 门缺失 ⇒ `[] → 0`、`true → 1`、`'  ' → 0` 同样与「没给」同形），
> 并收干净同族残留六面：`coverage().floors` / `trackFloors`（凭空多出第 0 楼）、
> `coverage().headerFloors` 与 `setPresence` 裁剪序、外供面 `tree()[].floor` / `summary().currentChain[].floor`、
> **回滚三法**（`rollbackFrom(null)` 实测清空整本账并返回正数 / `rollbackFloorOnly(null)` 误删合法第 0 楼 /
> `shiftFloorRefs(null)` 整表减一）、`visits[].floors`（R3-D 漏的那格）。
> 怎么知道它还没变：`tests/v3224` 的 H 组（六面正向 + 反向）+ N11（**门本体退化 ⇒ 怪值/floors/列号/外供
> 四面判据必须集体转红，而常规面与真 0 面仍成立** —— 这一条不成立就说明判据没挂在门上）。
> 同轮修掉两处**判据自身**缺陷：`v3224` 首稿 N4 用错判据（`readJudgeFails` 不含 `visits`）、
> `v3181` 与审计 `scan_v3181_..._negctl.mjs` 的破坏锚点漂移（两处都报错而非静默跳过，故已把锚点搬到新字面）。
> 本版不新增未修项；仍复述既有**观察项 T17**（同名不同模块，勿与本版改动混同）：
> - `scene-book.js` 的 `shiftFloorRefs(d)` 重复调用会**再次平移**（第二次等于「再删一次第 d 楼」）；
>   `stm-ltm.js` 的同名方法（v3.222.0 新增）沿用同一平移语义。
>   怎么知道它还没变：`tests/v3222` 组 B 与 `tests/v3223` 组 B 各自钉住「前移跟随」，
>   `scan_v3190` 的 P1b 守「位移恰好一次」。
> 本版不新增未修项；R3-E（短期长期记忆在**前移**面上的脱钩）已落地并留痕于 CHANGELOG v3.222.0：
> `stm-ltm.js` 新增 `shiftFloorRefs(state, deleted)`（三类楼层引用同跟一个判据：`unconsolidated_stm[].floor`
> 单点 / `stm_entries[].floors` 集合 / `ltm_entries[].span` 区间；**只改元素内部字段、返回计数不回写**），
> 取值口径与 v3.221.0 的 `numOrNull` 同族（只认数字与非空数字字符串，其余一律「没给」⇒ 如实 0 且一格不动）；
> `ledger-replay.js` 的 `stm-ltm` 登记项 `shift: null` 改为真调用模块入口（只取计数）；
> 撤掉三处把这个例外白名单化的既有判据（`scan_v3190` 的 `o.id !== 'stm-ltm'`、`v3190` 的同款 filter、
> `v3182` 拿它当「声明为 null」样本），改为**任一** `shift === null` 即报缺陷。
> 本版**刻意不落 loss 计数**（位移不是有损动作，记进去会让 `selfReport` 长期假报警），
> 并**不改** `ltm_entries` 的 `gaps` / `kept` 口径（整体平移不改变区间疏密）。
> `summary()` 与快照外供键面未见变化 ⇒ **下游本轮不抬版**（下游全仓对 `ledger-replay` / `replayShift` /
> `stmLtm` / `短期长期` 零命中；其 `coverage()` 消费的是另一本账 `floor-ledger.js`）。
> 本版复述既有**观察项 T17**（同名不同模块，勿与被本版新增的 `stm-ltm.shiftFloorRefs` 混同）：
> - `scene-book.js` 的 `shiftFloorRefs(d)` 重复调用会**再次平移**（第二次等于「再删一次第 d 楼」）。
>   本版新增的 `stm-ltm.shiftFloorRefs` 沿用同一平移语义（同样不是 drop 侧幂等契约）。
>   怎么知道它还没变：`tests/v3222` 组 B 与 `tests/v3223` 组 B 各自把「前移跟随」钉住，
>   而 `scan_v3190` 的 P1b 守「位移恰好一次」（变 4 即双重位移）。
> 本版不新增未修项；R3-A（场所三面外供：层级树 / 到访史 / 本楼场景头）已落地并留痕于 CHANGELOG v3.220.0：
> `scene-book.js` 新增 `tree()` / `visitHistory()` / `headerFace()` 三方法与上限常量 `MAX_TREE_ROWS=240`，
> `summary()` 外供面 7 → 11 键（增 `currentChain` / `tree` / `visits` / `header`，旧键一个未动），
> 新增 `numOrNull()` 并把「没给」与「给了 0」判开，宿主 `SceneBookFallback` 补三个同形空方法。
> 本版新登记的**观察项 T16**（不构成 TODO：是刻意的边界，放宽会把「近似」读成「同一处」）：
> - `tree()` 的 `depth` 取**真实层级**而非路径长度推断，`visits.count` 口径是**去过的不同楼层数**
>   （同楼重复访问不累加）。两者都是既有内部语义的**如实外供**，本版不改口径；
>   若下游想要「按楼层累加的次数」，那是另一个读数、必须另开一格，不许就地改这一个。
>   怎么知道它还没变：`tests/v3221` 的 A/D 组会把 `depth` 与 `count` 的语义钉住（改口径即红）。
> 本版不新增未修项；R3-D（场所三面在**回读与回滚**面上的收口）已落地并留痕于 CHANGELOG v3.221.0：
> `scene-book.js` 新增 `clearHeader(floor)` 与 `shiftFloorRefs(deleted)`（先清被删楼自身残留，
> 再平移 `track` / `opsLog` / `headers` / `presence` 四面），`rollbackFloorOnly` / `rollbackFrom`
> 按同一语义撤场景头（单楼 / 级联），`_rebuild(removedFloor)` 在**无 `opsLog` 真源**时不再清空式重建；
> `setHeader` / `headerAt` / `import` 全路径改走 `numOrNull`（「没给」不再被编成第 0 楼），
> 新增上限常量 `MAX_HEADERS`（载入侧此前无上限）并进导出面，`coverage()` 增 `headerFloors` / `headerCount`；
> 宿主 `index.js` 删掉 `clearPresence?.()` 全清一句（按楼层清的职责归模块），
> `ledger-replay.js` 的 `scene` 登记项 drop 走 `rollbackFloorOnly`、shift 走 `shiftFloorRefs`（不再手抄循环）。
> `summary()` 外供键面与 R3-A 逐字一致（本轮改的是回滚路径上的读数，不是外供面），故**下游本轮不抬版**。
> 本版新登记的**观察项 T17**（不构成 TODO：是刻意的语义边界，改动会把「再删一次」读成「没删」）：
> - 重复调用 `shiftFloorRefs(d)` 会**再次平移**（第二次等于「再删一次第 d 楼」）。这是**平移语义**，
>   不是缺陷 —— 登记项自述的幂等契约只在 **drop 侧**成立，shift 侧从未承诺幂等，`scan_v3190` 也明确
>   「不断言 shift 幂等」。若要改成幂等，须先让调用方带上「这次的基准是哪个版本」，属另一个读数。
>   怎么知道它还没变：`tests/v3222` 组 B 的 `shiftFollowsFaces` 会把「四面同时前移 + 清残留」钉住，
>   而 `scan_v3190` 的 P1b 会守住「位移恰好一次」（变 4 即双重位移）。
> 本版不新增未修项；R2-F（双向关系对账 + 知情网络）已落地并留痕于 CHANGELOG v3.219.0：
> `relation-mutual.js` 四态对账（mutual / mutualGated / mutualExpired / oneSided，只有末态该补记）、
> `knowledge-network.js` 三级同一性判据 + 疑似档（判不开只报候选、不合并）、
> `index.js` 注入侧标注与认知侧登记/解除改走同一件事判定。
> 本版新登记的**观察项 T15**（不构成 TODO：是刻意的边界，放宽会把「疑似」读成「确定」）：
> - 告知式措辞（「博丽灵梦告知了水晶被盗的事」vs「地下室魔法水晶被神秘黑影盗走」，重合率 0.17）
>   **只进疑似档、不合并**。它清不掉是字符串判据的能力边界，不是缺陷；
>   出口是注入面把候选原文说出来，由作者用登记原措辞揭示。
>   怎么知道它还没变：`tests/v3220` 组 7 与 N3 会翻红（N3 把疑似提升成确定，同款判据必须转红）。
> 本版不新增未修项；L-F5 前半（投影契约的出口）已落地并留痕于 CHANGELOG v3.212.0：
> `projection-pipeline.js` 新增 envelope 出口（结构版 `PROJECTION_API_VERSION` 与语义版分离、11 项字段单一真源、缺席不伪装、契约五态裁定），
> `index.js` 新增 `_buildProjectionEnvelope()` 与快照 `projection` 字段（身份取真源、缺即 null、不在快照内现跑管线）。
> 本版新登记的**观察项 T14**（不构成 TODO：是刻意的边界，改动会把「没跑」读成「都是空」）：
> - 快照不带 `projection` 时必须是 `undefined`（自述 `present=false`），**不许用 `null` 占位**；
>   且**不许在 `buildBridgeSnapshot` 内现跑管线**（该方法会被「提取执行」模式的独立实例调用，
>   现跑会静默得到全空投影）。怎么知道它还没变：`tests/v3212` 组 5b 会翻红。
> 本版不新增未修项；L-F1 后半（事实类型从登记到注入）已落地并留痕于 CHANGELOG v3.211.0：
> 台账 10 态分离（`unknown-type` 与 `none` 不同形）、`conflictPolicy` 落条、`lookup` 的
> `multiple`/`ambiguous` 两态可分、提取提示词新增 `facts[]` 显式类型通道（含对旧配置的迁移）、
> 注入侧 `typedFactsBlocks` 稳定/波动两块接入常驻与触发分区。
> 本版新登记的**观察项 T12**（不构成 TODO：是刻意保留的边界，改动会把「并列」读成「未决」）：
> - `multiple` 只在**该类型全部取值都带多值策略（`coexist`）**时报；一旦混入 `auto` / `prefer-new`
>   条目即回落 `ambiguous`，**不许猜**。怎么知道它还没变：`tests/v3211` 组 4 含「混合写入仍报
>   ambiguous」的真跑断言，把「按多数取值猜」写进去会翻红。
> 本版新登记的**观察项 T13**（不构成 TODO：这是实测有害后撤回的设计，勿回退）：
> - `coexist` **不把值并入对键**（`pairKeyFor` 已撤，导出面不含它）。理由：`versionsOf` 会漏掉另一条，
>   依赖 `pairKey` 的一致性路径（幂等判重、换代定位、诊断）整体错位。怎么知道它还没回退：
>   `tests/v3211` 组 5 逐字守回存储对键与导出面。
> 本版不新增未修项；L-F1（记忆类型系统）已落地并留痕于 CHANGELOG v3.210.0：
> 新增 `memory-type.js`（187 行，9 类型 × 6 策略注册表）、事实账本策略化（`CONFLICT_POLICIES` 四态、
> `type` 参与指纹与查询过滤）、宿主五类字段类型化分派与三态读数、`selfCheck`「记忆类型」诊断行。
> 本版新登记的**观察项 T11**（不构成 TODO：是刻意的边界，改动会把「规则错」读成「普通事实」）：
> - `memory-type.js` **不做存储、不做提取解析、不猜类型**：谁在什么时候变成什么由提取管线给出并带 `type`；
>   未知类型**拒绝**而不是归 default。怎么知道它还没变：`tests/v3210` 组 2 会在有人给未知类型加
>   default 回落时翻红。
> - 六种类型（`event-outcome` / `plot-thread` / `player-preference` / `world-rule` / `scene-fact` /
>   `relationship-state`）当前**没有任何提取侧字段会显式标注它们** —— 它们靠调用方显式给类型或
>   `inferType` 的谓词提示命中。为什么登记：这是刻意的（`events` 有专属事件账，同一内容双存会挤占
>   `MAX_FACTS=400`；其余三类无一一对应的既有字段，硬猜会把普通叙述误归档，属「类型错配比不记更糟」）。
>   怎么知道它还没做：`tests/v3210` 组 11 的真跑分派逐类断言了「哪几类入账、哪几类不入账」，
>   擅自加隐式分派会翻红。
> 本版不新增未修项；M-P2 后半（数据迁移与恢复能力 / 脚本加载与运行时兼容性收口）已落地并留痕于
> CHANGELOG v3.209.0：新增 `schema-migration.js`（200 行）与 `module-registry.js`（137 行），
> 并修掉五处真缺陷（`orderCheck` 未知使用方误报 ok / `plan()` 的 no-payload 分支不可达 /
> `_moduleLib` 登记调用在不可达环境抛错致「降级变崩溃」/ 本版新套件的汇总行恒报 0 / 上一版 `v3208` 同款死读数）。
> 本版新登记的**观察项 T9**（不构成 TODO：这是刻意保留的行为，改动会破坏既有契约）：
> - `restoreFromPayload` 的**旧档迁移默认不执行**（须调用方显式 `opts.migrate === true`）。
>   怎么知道它还没修：恢复一个 `schemaVersion` 低于当前的档、不传 `opts.migrate` 时，
>   `res.migration.needsAction === true` 且载荷不被改写。这是**有意为之**（不在用户没点的情况下改数据结构），
>   登记在此只为免后人不明就里地「修」掉它。
> 本版新登记的**观察项 T10**（不构成 TODO：属另一件须专门决策的事）：
> - 生产注册表 `MIGRATIONS` 为 **0 条**。升代际（`ARCHIVE_SCHEMA_VERSION` 1 → 2）会让**旧版插件读不了新存档**，
>   须连同迁移实现、返档策略、用户提示一并决策；本版只把「登记与拒迁」的机制备好，
>   并由判据守住「空注册表是合法读数」。
>   怎么知道它还没做：`tests/v3209` 组 1 会在有人为可测性擅抬代际时翻红。
> 本版不新增未修项；M-P2（投影管线 + 成本预测）已落地并留痕于 CHANGELOG v3.208.0。
> 本版顺带修掉一个真缺陷：`index.js` 内联回落预算路径与 `injection-router.deriveBudget`
> **不等价**（1152 组枚举里 58 组分歧），已补地板与取整，并由 `tests/v3208` 的
> 13824 组真源码 parity 枚举（含负控制）守住。
> 上一版登记的两条观察项 T8（`updatedFloor` 两种口径并存）**本版仍不改**（属读侧语义问题，
> 需单独一版评估影响面）。
> 本版新登记的**观察项 T8**（不构成 TODO：口径已与改前逐字一致，改动会破坏「纯重构」性质）：
> **【v3.251.0 轮对账更正 —— 本条文案已陈旧，以磁盘为准】**
> `finite(null) === 0` 这一族已由 **v3.240.0** 收口（`ledger-entity.js` 的 `finite()` 改为
> `null` 入 `null` 出；`tests/v3240` E 组钉住四类输入逐条可证；证据工作台注释亦写「v3.240 闭环」）。
> 读侧同一收口已完成：`seed-ledger.js:56` 现为 `updatedFloor: finiteFloor(item.updatedFloor)`。
> ⇒ 原文末句「怎么知道它还没修：`items[0].updatedFloor === 0`」**已反向成立**
> （现在应为 `null`，是即为回归）。**禁止再把 T8 当未修项开工**；
> 本条保留仅为追溯「当时为何刻意不改」。
> - `updatedFloor` 有**两种口径**并存：`record`（走契约 `stampFloor`）把 `event.floor`
>   原样写入（`null` 保持 `null`，即「楼层未知」）；而各账 `copyItem` 仍写
>   `finite(item.updatedFloor)`，把 `null` / 缺失读回成 **0**（即「第 0 楼」）。
>   实测旧版同形，故本版**刻意不改**（改了就不是纯重构）。
>   怎么知道它还没修：在真账上 `seed.plant(null,{hook:'x',eventKey:'p'})` 后，
>   `items[0].updatedFloor === 0`（应为 `null`）。这是跨账读回语义问题，需单独一版评估读侧影响面。
>   **↑ 该读数已于 v3.240.0 变更：现为 `null`。**
> 历史销账（v3.205.0）：T3 / T4 / T5 / T6 / T7 五项全部修掉。
> - T3 行数上界靠手抬 → `tests/audit/dead_code_budget.json` 为唯一真源，`--bump` 必须带理由。
> - T4 楼层字段手工枚举 → 容器内事件由条目清单**派生**（shift/drop 两份，需求相反）。
> - T5 豁免表 `ledger`/`echo` 语义重叠 → 复核为**四方不同源**，固化为守卫 P5。
> - T6 退役面覆盖率转移只有人工核对 → 登记列 `covered_by` + 守卫 P6 + 地板（全标 `-` = 没判据）。
> - T7 并行偶发假红 → 真根因是**孙进程泄漏**（自劣化正反馈）与**环境资源耗尽冒充判据失败**；
>   阈值不是病根，未动。另修真根因前先修了**取证方法**：原记录测的 `tests/syntax-gate.mjs`
>   根本不存在（真实门是 `tests/audit/scan_syntax.mjs`），那批读数是 404 的耗时。
> 详见 CHANGELOG v3.205.0。

## P 批 · 优化方向（第二批，V1 ~ V4 分四版做完）

> O 批管「判据与门禁本身的健康」；**P 批管代码资产与运行资产的健康**。
> 分四版：V1 = P-1（本版，已完成）+ 下游 P-4；V2 = P-3 + 下游 P-5；V3 = P-2 + 下游 F-5；V4 = F-3 + F-6。

- [x] **P-1 死方法处置（O-6 挂账收口）—— 已于 v3.229.0 落地**
      台账 4 条逐条实测后删除定义（53 行），转为处置台账；反坐实「与配置键无绑定关系」；
      判据 `tests/v3230`（9 项，含两条整仓镜像负控制）。详见上文本版留痕与 CHANGELOG v3.229.0。

- [x] **P-2 `index.js` 宿主巨兽分诊**（V3 版）—— **已于 v3.231.0 落地（只量不拆）**；
      本行勾选此前滞后于 CHANGELOG（计划一「共同配套」点名的过期状态，v3.251.0 轮按磁盘读数补齐）。
      落地读数：成员 559（v3.233.0 重建后 560）/ TOP5 21.7% / TOP40 51.3% / 十条前缀域规则覆盖 24.7%
      （重建后 24.9%）/ over-80 行成员 32 / 缝合模块 34 个 45 引用点；「按域拆」按读数**否掉**
      （最大成员是生命周期接线本身 — 外部引用极低 = 唯一入口；引用读数只能当上界；规则外互调 4696 处）。
      唯一有读数支持的轴是「成员级预算 + 文件规模上界」，本版只立判据不动手。
      判据 `tests/v3232_host_beast_triage.test.mjs`（14 项）+ 基线 `tests/audit/host_beast_baseline.json`；
      `tests/audit/index_beast_map.tsv` 已补行号图（`buildBridgeSnapshot` 7702–7892，深绑 `this` ⇒ `keep_index_unsplit`）。
      ⇒ 原文末尾「怎么知道它还没做」已**反向成立**：该文件已存在，且行数守的是「不退回未分诊」而非「等拆分」。
      现状读数：`index.js` 磁盘末行 **18400**（原文写的 16972 已过期，勿照抄；
      18139 亦已过期 —— **这个数会随每次改动腐坏，以 `wc -l index.js` 现读为准**）。
      原立项理由（保留以便追溯）：
      `index.js` 实测 16972 行，占全仓 46%（65 个根模块共 37170 行）；O-6 已证「扫描面只有 index.js」
      是盲区来源之一 —— **体量本身就是判据失效的温床**。
      交付：**先量再拆** —— 按职责域（桥快照 / 注入面 / 事件接线 / 设置面板 / 账本装配）统计行数与耦合度，
      产出 `tests/audit/index_beast_map.tsv`；只拆「边界已清晰、判据已覆盖」的一个域（预计桥快照构造段），
      其余域登记「暂不拆 + 理由」。判据：拆分前后快照键面逐字节一致（`fieldTypes` 三态判据 + 下游契约快照
      双保险）、新模块进 `scan_syntax` 与死代码扫描面。
      怎么知道它还没做：`tests/audit/index_beast_map.tsv` 不存在，且 `index.js` 行数仍 > 15000。

- [x] **P-3 快照外供面瘦身评估**（V2 版）—— **已于 v3.230.0 落地（只取证不动手）**；
      本行勾选此前滞后于 CHANGELOG（计划一「共同配套」点名的过期状态，v3.251.0 轮按磁盘读数补齐）。
      落地读数（近似线性）：空 117 B / 400 角色 35 917 B·1.253 ms / 1600 角色 124 597 B·5.158 ms；
      **characters 一面占 80.6%**；成本 65% 在深克隆段且**与字节成正比、与面数无关** ⇒「砍面数」按读数**否掉**
      （13 面下游各有读者、快照是出口不是缓存、恒定承载面仅 3.3%）；唯一有读数支持的瘦身轴是
      「每面预算 + 如实截断读数」。
      判据 `tests/v3231_snapshot_scale_evidence.test.mjs`（12 项）+ 基线 `tests/audit/snapshot_baseline.json`；
      本环境探针文档 `tests/audit/p3_snapshot_probe.md` 已订正为 `p3_snapshot_bytes=measured`（`_p3_snapshot_probe.mjs` 可复跑；读数近线性，`superlinear=false`，不编 0）。
      ⇒ 改快照键面属跨仓契约变更，仍须另立 Gate（本版不顺手改，此边界未变）。
      原立项理由（保留以便追溯）：
      `index.js:10768` 注释自证「九账各有 list/summarize/render，但快照**一本账都不带**」；
      反向问题（快照带了什么、多大、长会话下全量深克隆成本）**从未量过**。
      交付：合成探针量 `buildBridgeSnapshot()` 的耗时与字节数随楼层/条目数的缩放曲线
      （沿用 O-5 口径：setup 不计时、先预热；基线四件含 `not_done`）；超线性或数十毫秒级
      ⇒ 立「增量快照 / 字段按需」候选；读数平庸 ⇒ 记入 `not_done` 附实测理由。
      边界：**只取证**；改快照键面属跨仓契约变更，须另立 Gate（禁在本版顺手改）。

- [x] **P-6 声明式生命周期注册（可行性取证）**（V4 之后排期，可与下游 P-6 合并评估）
      —— **取证已交付，实施按读数否掉**；本行勾选此前滞后于 CHANGELOG
      （计划一「共同配套」点名的过期状态，v3.251.0 轮按磁盘读数补齐）。
      上游侧取证（`tests/audit/p6_lifecycle_feasibility.md`，只读取证、不跑扫描器）：
      `plugin_shell` / `registerEvents` 处静态数出 **7 处 `bindEvent`（7/7 全闭包）**，
      与 `runtime expected` 由 types 派生（**不等于常量 7**）对齐；另有 interceptor 第 8 条注入路径
      **不经 `bindEvent`**；与下游 `onChatChanged` 出口形态**不同构**（参数契约 / 路径语义 / 非 App 接线占比）。
      ⇒ 结论 `not_done`：替代轴是「路径 × 资源处置矩阵」，**不是**统一 `lifecycleExits`。
      与下游同族结论一致（下游 v3.7.0 取证 79.7% / 三态不可统一 / 45.5% / 20.3% 四项准入全不达）。
      ⇒ 本条不立 Gate（覆盖不足即如实记 `not_done`、不做半套 —— 这正是原文自己写的处置）。
      原立项理由（保留以便追溯）：
      与 `ruby-phone` 的同名诉求同族：让边界自声明出口与覆盖关系，由框架统一调用，
      从根上消除「写了出口但没人调」。本仓侧先做**可行性取证**（出口形态矩阵 + 覆盖面判定），
      覆盖不足即如实记入 `not_done`，不做半套。

## 已确认但**不在本仓**范围（仅记录，不修）

暂无。

## 判据面观察（不构成 TODO：已有判据守着，此处只记现象）

- `v3159` 的 44 次 audit spawn 已并发化（49.5s → 17.4s），其 `spawnOne` 的子进程回收
  已在 v3.206.0 补齐（`detached` + 进程组收割，与 `run.mjs` 同形），并由常驻门禁
  `tests/audit/scan_process_reaping.mjs` 守着。
- 审计段（`run.mjs --audit`）本身也已并发化：47.5s → 16.0s，`--audit` 总耗时 74.1s → 51.6s
  （并发度 `--audit-jobs`，默认 `min(4, 测试段并发)`）。等价性由 `--audit-jobs 1` 对照组实证。
- 同族的 `v3204` 仍偏贵（12 次镜像 + 12 次 spawn，实测 22.0s）。**实测后决定不做**：
  ·「共享只读基线免去复制」被证伪 —— 基线放本地或 tmpfs 再拷进 scratch 与直接从仓库拷**同价**
    （178ms vs 179ms），真正的成本在每个 node 启动 ~1.1s；
  ·「共享 scratch 树」会把 12 个用例串成一条链（改坏一处全族红，正是本版要根治的那类不稳定），
    且非破坏用例可改成对被拷副本打快照 + 还原，收益仅 ~0.6s/用例、纯工程收益；
  · 它**没有**超时风险（22s 远低于 120s 上限），故不列为未修项。
  若将来单个文件超时上限收紧，或并发门禁扩到更多镜像用例，此处第一个值得回头看。
- 本沙箱的进程数上限会让长跑批中途 `fork: Function not implemented`。这是**环境**限制
  （已在 CHANGELOG 留痕），不是本仓缺陷；验收走受控分批即可绕开。
