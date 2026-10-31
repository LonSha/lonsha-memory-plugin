# TODO — LonSha 记忆插件
> **最近更新：v3.431.0**（**回归临时根从内存盘搬到磁盘，并在搬家路上抓到一个真缺陷** —— 起因不是计划项而是机器**没内存**了：本机 `/tmp` 是 tmpfs（`size=5792440k`，占用即吃 RAM），全量回归里 114 个测试/审计探针各自 `mkdtemp` 镜像树，一次全量累积实测 **4.3G · 3 万目录 · 12 万文件**，把内存压到 `free` 只剩 668MB、swap 吃掉 4.6G；清理只写在各自 `finally` 里 —— 被杀 / 超时 / 阻断就永久留在 **RAM**，下一轮继续叠。
> ★ 第一件事是搬家（`tests/run.mjs`）：临时根由 runner 统一决定并写回 `process.env.TMPDIR/TMP/TEMP`，子进程用 `env: process.env` 派生，故**单改一处即覆盖全部 114 个 `mkdtemp` 调用点**；取值顺序 `LONSHA_TEST_TMP` → 仓库同级 `.lonsha-test-tmp/`（磁盘）→ `os.tmpdir()` 兜底；每条 run 一个 `lonsha-run-*`，正常 / 异常 / `SIGINT`·`SIGTERM`·`SIGHUP` 整棵删，`kill -9` 残留在下一轮按 **>6h** 老化回收；路径全部由 `REPO` 推导，**零绝对路径字面量**（P1/P7 实测 0 问题）。
> ★ **搬家当场炸出一个躲了很久的真缺陷**：`scan_module_consumption.mjs` 的 `getProdFiles(root)` 用 `path.relative(ROOT, p)` 算相对名，调用方却 `path.join(rootDir, pf)` 拼回去读文件 —— 两处基准不是同一个。夹具在 `/tmp` 下时 `../../../tmp/x/f.js` **恰好还原**（缺陷隐形），夹具与 ROOT 同前缀时 relative 给出 `../<dir>/…`，拼回去多叠一层 ⇒ 生产代码全部读空 ⇒ 每个模块 `prodCallSites` 退化成 0 ⇒ **把有消费的模块报成零消费孤儿**。处置：`getProdFiles(dir, base = dir)` 让基准跟随传入 root、递归透传。
> ★ 判据两份：`tests/v3431_tmpdir_not_on_ramdisk.test.mjs` **9 条**（A 结构 4 / B 行为 2：真跑 runner 断言子进程 `os.tmpdir()` 落在磁盘基址 + 收尾真删本轮 run 根 / C 真源码破坏负控制 1 / D 当版锚与边界自述 2）与 `v34270` **新增第 3 条**（夹具**刻意**建在仓库同级这种「旧写法会拼错」的布局，**双向**断言：零消费的 alpha 必须被抓 + 有绑定的 beta 不得误杀 + 孤儿恰 1）。**只断前半句是假绿**：把一切判成零消费也能让前半句成立。
> ★ **本版抓到并修掉的缺陷 2 处，全是真产品/工具缺陷，无判据自伤**：① `getProdFiles` 路径基准；② 负控制假绿第二形（第一次把破坏写进**副本** `_mut_modcons_probe.mjs`，而测试 import 的是原文件 ⇒ 破坏没被加载、跑出 2/2 绿；改为**真源码破坏 + 签名校验还原**才拿到有效读数）。另记一条框架陷阱：在 `node --test` 内再 `execFileSync(node, [--test,…])` 会继承 `NODE_TEST_CONTEXT=child-v8`，内层 runner 认为自己是子测试上下文、**不执行任何用例、72ms 返回 0** —— 必须剥掉该变量，否则负控制永远「绿」。
> ★ 顺手清掉的欠账：`/tmp` 4.3G → 21M、`/dev/shm` 4.9M → 4K、磁盘可用 9.0G → **78G**（96% → 65%）；两仓 `.git` 垃圾对象（`lonsha` 274M → **11M**、`ruby-phone` 456M → **191M**，`gc --prune=now` 后 `git fsck` 无报错、`git status -sb` 均 `## main...origin/main`）；清可重建缓存（npm/pnpm/pipx/`/var/cache`，**保留** playwright 浏览器）与仓库内未跟踪的 `*.bak`/`.tmp/`/`__pycache__/`。**诚实边界**：只改临时根**位置**，不改并发与超时，**不承诺耗时变化**；`TMPDIR` 只对 runner 派生的子进程生效，直接 `node tests/x.test.mjs` 单跑仍用 `/tmp`（故本缺陷**无法靠单跑复现**，只能靠新判据钉住）；`/tmp` 仍余 21M 删不掉（属主 root、`unlink` Permission denied），如实记录而非谎报「已清空」。
> **上一版 v3.430.0**：（**L12-X1~X9 九项拓展接线** —— 与 v3.428.0 同一类病：九件拓展登记在册、真加载、单测全绿，而 `index.js` 里 grep 计数**全为 0**。本刀给九面各接「读 / 动作 / 诊断行」三件套：组织与制度记忆的真入口 / 意义演化与释义漂移 / 前史回填 / 事实纠错的可解释面 / 世界线跳转草稿 / 上下文卸载演练 / 反对意见的对象化反例 / 秘密事实的排除面 / 记忆沉默状态可解释。业务全部落 `engine-diagnostic-lines.js`（+1742 行），宿主只留转发桩（+146 行），面板 `settings-ui.js`（+661 行）承担九面，`engine-self-check.js` 承担自检行。★ 判据两份真跑全绿：`tests/v3430_l12_x1_x9_extensions.test.mjs` **19 条** / `tests/v3430_l12_x6_unload_drill.test.mjs` **18 条**；三条破坏锚点在真源**各恰中 1 次**、破坏副本仍须零装载失败，且每条破坏都配原版阳性对照（只断破坏侧是假绿第二形）。★ 本版自己抓到并修掉的缺陷 11 处：1 处**真产品缺陷**（`LONSHA_DRILL_FIXTURE` 死开关 —— 声明后从未被读，按「接线 → 验证仍零调用点 → 整块删除」处置）+ 10 处判据自伤（假设六面同形 / 跨 realm deepEqual / 读数层级读错 等，逐条写入 CHANGELOG）。★ 另一条**扫描器当场抓住的真缺陷**：`_safeCast` 里把能力探测写成内联 `if (engine && typeof engine._noteCaptureCastFail === ...)`，被 `scan_live_wiring_dataflow` 判成「幽灵守卫（0 次写入）」—— **处置是改代码形态**（探测上提为局部常量）而不是把它塞进白名单。★ 抬版留痕：两份当版档案同时锁当版会让守卫 V4 数出 2 处锚 ⇒ 当版锚归收口档，X6 改用数值下界 `const FLOOR = 3430000`，守卫转绿（frontier 2 / 当版锚点 1 / 问题 0）。**上一版 v3.429.0**：世界线跳跃表从「裸 textarea」变成**卡作者摸得到的**结构化编辑器 + 实时读数：`engine-diagnostic-lines.js` 抽出 `parseJumpsText` 作**唯一解析**并让闸改走它（坏行带行号 + 成因，不再静默丢掉）、新增零写入取数口 `worldlineJumpDraft`、`settings-ui.js` 一行三格可增可删 + 坏行当场标红 + `↥ 首跳移到第 1 楼` + 六属性实时读数（纪元 / why / 冲突 / 前史缺口）。★ 核心判据是**解析单源**（面板与闸必须吃同一段解析）与**读数与内核 `epochAt` 逐字一致**；前史三态 `none / gap / ok` 不同形，`gap` 说「判不了」并给可点出路，**绝不说「安全」**。★ 自纠两处：门的 `drift` 会吞掉已发现缺陷（先吐缺陷再退出）；`<textarea>` 初值必须显式写 `value`（shim 不反射元素内容）。判据 `tests/v3429_l12_o8_worldline_editor.test.mjs` 17 条（六条真源码破坏 + 两档 fail-closed）。**诚实边界**：门在最小 DOM shim 上，**不证明**真浏览器排版观感、真机触摸命中与跨会话 localStorage 行为（那些仍只有真 Chromium + 真 ST 能证，L12-O5 的 `_realhost_suite.mjs` 本版未新增块）。★ **全量已实跑**：`TEST_SUMMARY_JSON=<path> node tests/run.mjs --audit --jobs 3 --audit-jobs 2` ⇒ **427/427 文件 · 4609 断言 · 0 失败 · 审计 68/68**（300.3s）；`doc_readings.json` / `test_cost_readings.json` / `test_budget.json` / `state-report.json` / `host_beast_baseline.json` 全部对齐 v3.429.0（零手抄重绑）。★ **首跑 17 文件红的归因（重要）**：全是本刀改动的**连带读数欠账**，不是产品缺陷 —— host_beast 基线（入口 11773→11776 / 成员 1188→1190）连锁 6 份 A1 套件、`dead_code_budget` 越线 9 行（活跃功能增长 ⇒ `--bump` 到 109378）、`audit_scan_probe_matrix.tsv` 漏登新门（先实测 H/G/T=0/2/0 再登记）、`test_budget.json` 落后 3 个次版本、PLAN 执行状态与快照行陈旧。**「交付时不跑全量」本身就是欠账**，本版按纪律收口）。**下一步**：O2/O3/O7 的审计门已全 exit 0（`scan_module_consumption` 244 模块 / 220 活跃 / 24 留存 / 零未登记孤儿），但「docs 探针算不算产品消费」的口径决策仍留产品面（`unified-recall.js` 等 4 件）；X 面九项与 O5 真宿主读数未开工。
> **历史留痕：v3.426.0**（仿真打出来的**两处自纠**。按要求拿一张「命运石之门式」世界线跳跃卡端到端真跑（原创主角**三生**：1→39 楼 α线、40→46 β线、47→87 **回跳 α线**、88+ Steins;Gate线），**v3.425.0 的 54 条判据全绿**，但真跑立刻露出两处「判据绿、运行时错」：① **宿主从不推进当前纪元** —— 卡作者按 v3.425.0 文档**只登记 `worldlineJumps`、不填 `worldlineStartFloor`**（文档推荐口径）时，实测 `_worldlineState({}).current = {lineId:'', startFloor:null}` ⇒ `epoch` 空 ⇒「同号跨纪元不串」**整场不触发** ⇒ 第 60 楼（α线@47）把第 5 楼（α线@3）的第一纪元记忆判 `native` 当事实注入，**登记得越规范的卡反而失效**；② **证据不对称被判成 `same`** —— 只有粗线标 `worldline:'α线'` （楼层早于首跳登记、推不出纪元）的条目被当成「α线@47 的 α线」，用粗标冒充细纪元。修法一（宿主侧）：`_worldlineState` 在作者**没显式配** `worldlineStartFloor` 时，用**当前楼层**（`opts.floor` > `engine._currentFloor` > `engine.currentStoryFloor()`，全是磁盘事实）+ jumps 表，走内核既有的 `epochAt` 反推当前纪元，四条纪律 —— 手工配置一个字不动、拿不到楼层不猜、无 jumps 不推进、与作者 `lineId` 冲突时记 `current-line-id-vs-jump-conflict` 但**保留作者命名**；新增读数 `epochAdvance = {applied, floor, why, conflict}`（配的 vs 推的可查，可信度不同）。修法二（内核侧）：`relationOf` 在「线号相同、纪元不全」格里先判 `!!A.epoch !== !!B.epoch`，不对称 ⇒ `unknown / epoch-asymmetry / basis=epoch`（**判不了 ≠ 否**：缺证据不等于相反证据，判 far 会给「已知的远」的假身份）；对称两侧口径不变（都只有粗标仍 `same`、都有纪元仍 `same-epoch`）。**代价与出路**：前史条目（楼层早于首跳）由 `native` 降为 `undecided`（recall 仍放行、仍逐条留证），补法是**把首跳登记在第 1 楼** —— 这条出路本身也做成了判据。**保留者方向复核**：默认 `none` 下三生（含任何主角）跨纪元记忆一律 blocked；`allow` 也不给未来（第 60 楼仍拿不到 `Steins;Gate线@88`）。**判据 54 → 58**：新增 M 段 4 条（M1 自动推进读数 + 端到端跨纪元挡下；M2 四条纪律；M3 证据不对称 + 两条不倒退 + 「登记首跳 ⇒ undecided 变 blocked」；M4 **负控制三条**破坏真源码验行为真变），H1 锚点纯度清单扩到 7 条。**诚实边界**：自动推进依赖当前楼层真源在场（真实运行时由 `onBeforeGeneration` 的 `_currentFloor = chat.length - 1` 提供）；前史条目无法从 jumps 推纪元属信息缺失；**仍未跑真实 ST UI**，证据是无头契约 + 端到端仿真真跑 + 三向负控制；`WM_VERSION` 仍为 2。
> **历史留痕：v3.424.0**（M7-X1 世界线记忆与跨线污染闸：终于能回答「这条记忆属于哪条世界线」。新内核 `worldline-memory.js`（691 行、零依赖、双导出、`WM_VERSION=1`、导出面 32 项、selfCheck 九项全真）：**四态穷尽互斥** native/adjacent/foreign/unknown、两线关系 same/near/far/unknown、收束三态 converged/not-converged/unregistered、污染闸四档 kept/held/blocked/undecided、换线五桶 carry/shadow/invalidate/conflict/undecided；默认吸引域 alpha/beta/gamma。七条口径：无标 ≠ 本线（unknown 恒 undecided，绝不与 native 同形）／同 lineId 变动率差超 epsilon 判不了（`same-line-id-divergence-gap`，既不猜同线也不给「已知的远」的假身份）／邻近只由「同吸引域 + 够近」产生／未登记 ≠ 不会发生／名单外异线必挡而保留者仍带 `byState` 标注／换线同键异值单列 conflict 且计划不落盘／纯只读入参逐字不变。刻意不认裸 `line`（`MARK_FIELDS` 只收 worldline/originLine/lineId）。宿主接线：取库口 `_worldlineMemoryLib()` + 七个宿主出口转发（业务在 `engine-diagnostic-lines.js`，`_worldlineState` 为唯一装配点）；`memory-organs.js` 的 WorldProgress 三处成对补 `worldline` 子键；`engine-recall.js` 在 L11 后插跨线污染闸（**只摘 blocked/held，undecided 一律放行**）。默认关的纪律：关着如实报 disabled 且 counts 全零，绝不返回「全 kept」的假安全面。配置六键全进 `CARD_CFG_KEYS`、六个都有 UI 控件、滑块 min=0 用 `??` 不用 `||`。本版抓到并修一处真实自伤：结果写回键 `_worldlineRead` 遮蔽了同名原型方法 ⇒ 第二次调用起永久失效，已改 `_worldlineReadOut`（与 `returnGate` 写 `_returnGateRead` 同形）。判据 `tests/v34240_worldline_memory.test.mjs` 30 条全绿（含四条真源码破坏负控制）；死代码预算 bump 至 107197；六源同源抬版 3.424.0）。
> **历史留痕：v3.423.0**（玩家面板重构——FAB 直达玩家主页 + 设置全面去黑话（三件事原则：记忆能力在跑吗 / 这里有谁 / 过去发生了什么）：旧 FAB 七项菜单退役（能力零删除，入口全保留在总览/设置内），玩家主页 = 运行状态卡 + 三模式快捷切换（写 `extractionProfile` 即存）+ 最近发生的事 + 登场人物 + 三入口；「AI 接口连接」组从第三个 tab 前置到「常用」页顶（Embedding 三键随迁）；18 个 `[TAG]` 组标题翻成玩家语言、四 tab 改名（◈ 常用 / ◷ 故事与人物 / ⬡ 记录与世界 / ⚙ 高级）、面板标题翻新（⚙ 设置 / 📖 记忆总览）；上一轮两缺陷（token 宿主覆盖穿透白底淡字、模式 pill 无反应）的修复随重构保留并受本版套件把守；六源同源抬版（index/manifest/package + 三内核副本）；测试锚点同步 v377/v3160/v3161/v3162/v3238/v334/v337；五道 UI 审计门全绿（runtime/interaction/binding/panel_drive/narrow_layout）；当版套件 `tests/v34230_player_home_refactor.test.mjs`（6 条）。定向门禁全绿，全量待验）。记忆强度治理与主动销项额度：`strength-policy.js` 只读元数据给带理由链的建议、`automatic_ceiling = 79` 使机器爬不进 core；`strength-proposal.js` 高风险必须**换角色**会签（同角色换 id 不算）、四道闸 + 逐字快照回滚；`stm-close-quota.js` 把「销项」从「按当前状态算」改成「按本批新增 + 保底」双拦并具名。宿主三处真消费点：`_evJudge` 锁定免预算硬豁免、`memory-gc` 免预算项先扣、批末按楼层交集销项并把受阻/兜底报进总账；新增 `stmLtmCloseMinKeep`。判据 `tests/v34210_m4x10_strength_governance.test.mjs`（34 条含 8 条真源码破坏负控制）。提交前实跑另抓到两条既有测试回归并已修：新配置 `stmLtmCloseMinKeep` 无控件不可达（v3161 点名，补滑块）、`_evJudge` 涨长顶穿 v3370 的 2400 字符窗口（放宽到 2800，负控制锚点随保护项拆路换成 `normalList.length`）。六源同源抬版 3.421.0）。
> **现行产品待办（2026-10-17）**：见 [PLAN.md](PLAN.md) 的第四期 M4-O1～O9 / M4-X1～X9。**执行进度**：优化提升九项 **M4-O1～O9 已全部交付**（v3.329.0～v3.338.0）；拓展新功能九项 **M4-X1~X9 已全部交付**（v3.339.0 / v3.340.0 / v3.341.0 / v3.342.0 / v3.343.0 / v3.344.0 / v3.345.0 / v3.346.0 / v3.347.0），**第四期产品拓展项全部交付**，**下一刀 = 第四期计划收口**（全量实跑一次并登记读数）。下面保留旧迭代记录，不按"最近更新"或旧勾选直接施工，不把守卫/台账扩建当新产品项。

> [v3.280.0] O7 第四项：**逐字副本台账** —— 宿主 `index.js` 与根级模块里 **9 对 `function` 体逐字相同**（剥注释 + 折叠空白后比对），两套维护面此前**无任何一致性判据**。现在双向登记：新增未登记的副本即红、登记项漂移即红，且漂移给出第一处差异位置与两侧上下文。破坏三形态各有负控制（宿主侧 / 模块侧 / 凭空抄一份）。取块用跳过引号与注释的配平（裸数花括号会被正则字面量里的 `{` 提前收口）。
> [v3.281.0] O7 第四项（续）：**模块↔模块副本面** —— 既有的副本判据 100% 只覆盖「宿主 ↔ 模块」，把同一套归一化口径掉转横向用在 79 个根级模块之间，实测 **15 簇 / 60 对**逐字副本（族 A 账本状态形状：`reject`/`result`/`record`/`clone`/`openCount`/`remove`；族 B 哈希与文本原语：`hash32`/`fnv1a`/`textOf`/`stableStringify`/`toSet`/`fpOf`/`normTime`）。全仓唯一有「反重复」语义的 `scan_ledger_contract` R3 只钉三个字面量，这 15 簇一个都不在射程里。现在簇级双向登记：新增未登记簇即红、成员集合变了即红（点名掉出去的模块）。同名不同体（`reject`/`result` 的六账版与三账版）必须分成两条独立簇 —— 合簇会把两种语义的差异抹掉。破坏三向各有负控制（族 A 成员 / 族 B 成员 / 凭空多出一簇）。判据纯度按**转义形态**计数（多行锚点在源码里是 `\n` 两字符，真换行 split 恒 0 会让该断言空转）。
> 新面 `tests/v3281_o7_module_copy_ledger.test.mjs`（10 条）；台账双手登记（`catalog_reference_consumers.tsv` + `v3247` REGISTRY）。
> **历史留痕：v3.302.0**（原当前行） —— **M-O1（第一刀 + 第二刀）会话身份写入闭环**（第二期优化计划第一条落版）。★ 修前实测三条真缺陷：① `save()` 在循环入口取一次 `ctx`，之后跨两次 await 才写盘 —— 期间切聊（ST 走 `chat_metadata = {}` **重新赋值**）让旧引用脱钩 ⇒ **一个字节都没落地**，却被计为落盘证据并推进 `_confirmed`（**纯 chatId 比对读不出来**：取数与被写是同一个旧对象）；② `return true` 的条件是 `_persisted > 0`（整队任一批）而非调用方那一批 ⇒ `A→await→B` 交错下 A 的调用方拿到 true、被记成「已保存」（验收⑤ 点名禁止）；③ 落盘证据无批次身份（验收④要求五态可分辨）。★ **第二刀由第一刀的判据当场逼出**：写盘循环把**排干批**（挂起集合里别人的批次）写进**当前会话**的 metadata（`当前会话=B 槽.chatId=A`）—— 根因是第一查第二条用的是**入口那次调用**的快照 `_liveChatId`，而排干批**没有属于自己的快照**，于是 v3.272 修掉的错档在**队列路径**上仍可达。修法：三处重核点（循环入口 / 写入前 / `saveChat` 之后）+ 批次回执对象（五态归宿）+ 返回值只描述调用方那一批（整队另有落盘时如实 `partial`）+ 第三查用「约定槽里的本批唯一标记」判写入是否还在当前 metadata 里；第二刀则**每批就地重绑**第一查的比对对象（第一查前插一行 `const _liveChatId = _curLiveId;`，块内 `const` 遮蔽方法入口那次捕获）—— 判据行与变量名配对**一个字未动**、**不新增判据**（多一道绝对锁会抹平第一查的唯一性；改名会破 v3272 A1/C1 的逐字契约，两条错路都实测踩过）。判据 `tests/v3302_mo1_write_closure.test.mjs`（**19 条全绿**，含五条真源码破坏负控制——含第二刀枢轴 C6——与带字节级证据的切聊负例）。★ 本版自伤四处（TDZ / 块级作用域 / 锚点没吃下结构行 / 复判抹平第一查）+ 第二刀三处（注释复述判据字面量致自证翻倍失败 / 吃掉 A1 收尾 `});` 致判据文件语法错 / C6 阳性对照期望写错）全部记在补丁脚本与判据头部。★ **真宿主证据（同版补交，M-O1 验收项收官）**：探针 `tests/audit/_mo1_realhost_probe.mjs`（零依赖 CDP：Node v24 自带 WebSocket 直连 Chromium，不引入 playwright）在真 ST 1.19.0 上对**真装载的** `window.LonShaMemory.engine.storage` 调 save()，用真 ST 的 `updateChatMetadata` 在真 await 窗口里真切聊 —— **23 条读数全成立**：同会话 `ret=true/confirmed`、★ await 期间切聊 `ret=false/deferred/detached-after-await/confirmed=null` 且当前会话不留本批数据、★ 排队批 `retC=false, retD=true, 整队=partial`、★ **字节级错档检查**四次真落盘（槽 chatId，当前会话 chatId）逐对相等、`page.errors=[]`。两条只有真宿主才暴露的实测结论已写进探针头部（`getContext()` 每次返回新对象故换 chat 必须走`updateChatMetadata`；`ctx.saveChat` 是每次重新绑定的引用故观测点须代理 `getContext`）。⇒ **M-O1 至此全线收口**（代码缺陷 + 合成宿主判据 + 真宿主可复现证据）。
> **历史留痕：v3.309.0** —— **M-O8（第四刀）世界推进账本写入纳入分支守卫**。★ 修前实测（探针 `tests/audit/_mo8_branch_probe.mjs`，rc=0）：承诺块 / 认知块 / 秘密块**早于**分支守护 295~422 行，`_branchOk` 的四个使用点里世界推进的 **21 个写入口被覆盖 0 处** ⇒ 翻页 / 重生成后被放弃那一分支的承诺 / 支线 / 认知 / 秘密照旧入账（静默、无报错），而账本是会话级、条目无分支归属。本刀三件交付：判定**前移**（只算一次，存 `this._branchVerdict`；§2 改为读它、不再重算）、世界推进块头**加闸**（`judged === false` 一律放行，与 branch-guard 「漏一点好过全消失」同纪律；一处覆盖全部 21 个写入口）、账本面读数 `_wpBranchSkip` 单列进诊断行（与摘要面 `apply-skip` 分开记）。成对套件 `tests/v3309_wp_branch_gate.test.mjs`（16 条，含 5 条真源码破坏负控制 + 正控制地基）。
> **本刀收尾：全量实跑抓出的 5 处红（1 本刀回归 + 4 既有真缺陷，全部已修）**。逐处在已提交基线 `77d5eaa` 上重跑同档对照定归属：① **本刀回归** `v3264 C` —— `total_lines < 16000` 是 v3.264.0 的**硬锁当版里程碑魔数**，本刀 +55 行顶穿（15955 → 16010，仍 **< 18401** 单调守卫）⇒ 按 v3261/v3266 先例**交棒**到 `line_budget` 登记面；② **既有真缺陷** `v3254 D9/D12` + `v3255 C1` —— 破坏锚裸串 `'revision: null,'` 因 v3.305.0 的回执面引进第二处同形字面量 ⇒ 命中 2 次 ⇒ 工具拒绝破坏 ⇒ 三组负控制**空转** ⇒ 锚改**唯一上下文形态**；③ **既有真缺陷** `v3203` 8/18 —— 夹具写死 `vnum(CUR)`，漏了真源认的「**任意**自锚常量名」锚形（frontier 用 `vnum(BORN)`）⇒ 一个锚都删不到 ⇒ 负控制/正控双双空转 ⇒ needle 改**按真源口径现场派生**；④ **非缺陷（环境性）** `v3159` 全量 TIMEOUT / 单跑 rc=0（69s，该档真跑 40+ 审计脚本，7 路并发争抢）。★ 归因口径：**「全量红了」不等于「本刀坏了」**，红绿都要能归因。
> **历史留痕：v3.308.0**（原当前行） —— **M-O8（第三刀）跨支 / 跨卷的秘密边界收口**（`branch-semantics` / `volume-continuation` 的 `filterByKeeper` 此前把 `keeper` 当「有权查看的人」，而它在 `secret-ledger` 里是「不该知道的人」—— 同名异义、方向整个反了；本刀按**名单种类**分派，返回面增 `knowerOnly` / `knowerUndecided` / `knowersMatched` 三档、两模块版本 2 → 3），并把秘密正文从「对照读数 / 提案 / 接续包 / 冲突条」四条外供路径上一律剥除（入口剥 + 出口二道闸，剥了几份进 `shadowed` 读数）。
> **历史留痕：v3.307.0**（原当前行） —— **M-O8（第二刀）秘密正文的三条外供路径收口**（诊断面 / 检索面 / 导出面一律不外带正文；`evidence-workbench.js` 增 `SECRET_MASK` / `SCOPE_LABEL` / `knowledgeScopeOf` 与行上 `scope`·`masked` 两列、`EVIDENCE_VERSION` 2 → 3；`evidence-query.js` 的 secret facet `textFields` 清空、`QUERY_VERSION` 1 → 2；`index.js` 导出报告新增「🤫 未揭露的秘密」段，只报存在性与知识范围）。
> **历史留痕：v3.306.0**（原当前行）
> **历史留痕：v3.305.0**（原当前行） —— 抬版前真缺陷清扫（全量实跑报出的五处，分类处置：产品 1 / 判据面 2 / 登记面 2）。
> **历史留痕：v3.303.0**（原当前行） —— **M-O2（第三刀）面板逐条驱动门**（第二期优化计划第四条第三刀）。★ 修前实测四处真缺陷（全在 `settings-ui.js`，全部在新门禁的真 Chromium/最小 DOM 驱动下当场暴露）：① `showDiagnose` 拼数据却没有 `esc` 定义 ⇒ 带数据调用抛错、诊断面板整块打不开；② 条目摘要与 `_memOps` 的 key 直接 `===` 比 ⇒ 数字型字符串 key 陷入**静默无反应**；③ `opHint` 无条件挂 ⇒ 把**不可用**说成可用；④ `showBrowser` 属性值直接用 `esc` ⇒ 含双引号的物品名属性值往返失真、寻不回来。新门禁 `tests/audit/scan_ui_panel_drive.mjs` 六条判据：W1 诊断面板带数据驱动 / W2 条目真点 / W3 静默无反应数为 0 / W4 寻址口在册 + W4b 属性值往返双基准 / W5 提示诚实 / W6 面自证；成对套件 `tests/v3303_ui_panel_drive_gate.test.mjs`（10 条全绿，含四条真源码破坏负控制）。★ **连带修两处**（都不是新写功能）：(1) 探针 `tests/audit/_mo1_realhost_probe.mjs` 的子进程回收缺陷（由 `scan_process_reaping.mjs` 当场点名）—— 裸 `spawn` + 收尾只 `chrome.kill` ⇒ 孙进程孤儿化；修成 `detached: true` + 进程组收割（与 `tests/run.mjs` 的 `killGroup` 同形）。**实测承重**：机制级（长命孙进程）裸 spawn + 单杀 ⇒ 2 个孙进程孤儿化存活，detached + 组杀 ⇒ 0 个；Chromium 同款两模式残留都是 0（行为面观测不到）⇒ 这正是该门判**结构**的理由；修后真宿主探针复跑 23 条仍全成立。(2) 两处台账补登（新门禁引入的连带）：v3284 审计副本台账 +3 簇 / `walk` 簇成员 2 → 3；v3226 探针灵敏度矩阵补登本门一行（实测 H/G/T = 0/2/0）。★ **抬版连带暴露两处历史档自伤**（都已修）：(1) `v3302` D2 用**硬等**形当版锚 ⇒ 抬版后自己转红（当版锚应交给新档，旧档退回**出生版本下界**形）；(2) `v3206` 空转负控制 N4 把退化清单**写死**成两个文件、本版新增的真宿主探针**占了位**⇒ 掏空那两个后门照旧 exit 0、**负控制静默失效**（已改为按扫描面真值动态枚举）。★ 本版自伤一处：F1 判据纯度首版用**运行时字面量** `includes()` 判文件是否持有常量，而含 `\\s` 的锚点在源码文件里写作双反斜杠 ⇒ 恒假（已改为双形态检查）。
> **历史留痕：v3.299.0**（原当前行） —— **M-O6 事实版本、冲突与撤回的状态统一**（第二期优化计划第三条落版）。新增模块 `fact-state.js`（纯函数、零依赖、双导出、400 行）：五态 `active / superseded / revoked / disputed / unknown` **穷尽互斥** + 每态**理由码** + `rangeOf`（有效范围，`coversNow` **三态**，无区间**留 null** 不塌成 false，楼层 `0` 不拿 null 冒充）。★ **设计转折（实测否决写回式迁移）**：`fact-version.js#copyFact` 是白名单逐字段重建，`state` 字段活不过一次 `normalize`；且写回会造出「推导说 superseded、持久说 active」的**第二份真源**，违反 M-O6 第 4 条「禁止只改展示层掩盖源数据未修复」⇒ 本模块**只读、幂等、不改入参**，`selfCheck` 用两条独立自证钉住（读数连读两次逐字相同 + 账本字节未变）。★ 修前实测的真缺陷：`memory-type.js#typedBuckets` **只挡 `revoked`**，放行 `to != null` 的已换代旧事实 ⇒ 旧值仍进类型化注入面（同账实测两条并列在场）。宿主 `typedFactsBlocks()` 现按 `readState().entries.admissible` 前置过滤（分组口径仍只有 `typedBuckets` 一份，准入不下沉）。★ `readState().leaked` 把「旧口径会放行、新口径必须挡」的条目**逐条点名**，「本版多挡了哪几条」是可复算读数。★ `revoked / disputed / unknown` **不受任何 opts 影响**（撤回是绝对的），只有 `superseded` 可经 `includeSuperseded` 放行。★ 本版自伤三处（附修法）：`selfCheck` 指纹原在首次读之后取 ⇒ 写回被漏判（`noWriteBack` 假通过，抓到它的正是 I3 负控制）；「源码无写回」判据首版把自己的解释性注释也数进去（9 处假阳性）；v3298 原硬锁 extra_js 总项数 ⇒ 如实交棒。★ 抬版连带首轮漏网三处（专项复验当场抓到）：v3296 **也**硬锁 extra_js 总项数（同款交棒）；PLAN 的「当前执行状态」现行口径行漏抬（scan_plan_currency 巡逻面）；v3211 抽真方法体自建的夹具缺 `_factStateLib` 注入 ⇒ 方法体抛错被自身吞成空块、7a~7d 全红（症状像产品坏了、实为夹具缺件；已按**真实模块**补齐注入，并顺带补「状态模块缺席不得整块变空」新三态判据）。判据 `tests/v3299_mo6_fact_state_single_source.test.mjs`（14 条）+ 四条真源码破坏负控制 + 抬版连带（版本六处 / `extra_js` 86→87 / 数量锁 / REGISTRY / tsv / README-PLAN 读数 / host_beast 重建）。★ 逐条对齐原文：本轮只落**事实注入面**这一处消费点，摘要 / 图谱 / 时间线 / 召回 / 缓存的传播另行推进（不虚报覆盖）。
> **历史留痕：v3.300.0**（原当前行） —— **M-O2（第一刀）真宿主装载面修复**（第二期优化计划第四条开工）。★ **推翻边界声明**：长期登记的「交付者环境无任何可访问的 SillyTavern 实例」**实测不成立** —— SillyTavern 1.19.0 本地 clone + Playwright Chromium 可用，7 轮探针（probe1~probe7）把真宿主面从声明变成读数。★ **修前实测的真缺陷**：宿主**从不加载 `manifest.extra_js`**（`addExtensionScript` 只注入 `manifest.js`；`grep -rn 'extra_js' public/scripts/extensions.js` 返回**空**）⇒ 真浏览器全局里本仓模块 **0 个**，`_moduleLib` 的 require 回落求值出**空 api**（各模块的 `root.LonShaXxx = api` 在 `typeof window !== 'undefined'` 下不成立），**近几版新接的机制在真宿主上恒不生效**（fact-state / memory-type / unified-recall …），而文档一直读成「装载面 88 模块」。★ **交付**：`ensureExtraJsOnce()` + `plugin.ensureExtraJs()` —— 插件**自己**把 extra_js 挂上去：浏览器原生 `<script type="module">` 注入（**不 eval 内容**：清单是行为契约，自带解析器等于在宿主侧再造一套模块系统）/ **base 目录不写死**（候选来自宿主实际注入的 script 标签，逐个用 `manifest.json` **反证** `display_name`，取不到即 `unavailable`，**不猜路径、不退 CDN**）/ **清单项必须裸文件名**（挡 `../`、绝对 URL、查询串、子目录；要的是**拒绝**而不是解析出一个能用的地址）/ **三态互斥** ok·partial·unavailable 另加 disabled（把 partial 读成 ok 就是「一次成功的失败声明」）/ **幂等**（清单只读一次、同一 URL 只注入一次，已在 `document.scripts` 里的记 already ⇒ 宿主未来自己开始读 extra_js 时两向都安全）。★ **修复后真宿主读数**：`moduleGlobalCount` **1 → 85**、`_extraJsLoad = {status:'ok', okCount:87, triedCount:87, fail:[]}`、三关键模块全局皆 `object`、**pageErrors = 0**。★ **端到端真跑（走引擎真实入口 `_absorbFactVersions`，不是自造字段）**：提取 schema 原生形状写 8 条事实、`auto` 策略**真换代**（好感 62→74、北京→上海）、`fact-state.readState` 在真宿主**首次真执行**（`有效 6 · 已换代 2 · 旧口径会放行 2：fct_2、fct_6`）、`selfCheck` 四项全真、`typedFactsBlocks()` 真产出 stable（取换代后 74）/ volatile（上海）。★ **真控件交互**：FAB → 菜单 **7 项** →「⚙️ 设置」→ overlay 可见 **190 控件** → `#ls-save` toast「✅ 设置已保存」→ `#ls-export` 真落盘（blob **9551 字节** / `lonsha-memory-1791527939356.json`）。★ **归因取证**：桥快照 `projection` 缺席**不是缺陷**（`_lastProjectionEnvelope === null` 且 `_projectionDropped === null` = 本代尚无这面），与「有面但归属不同代被扔掉」是两件事，据实登记未按缺陷处理。★ 新增配置键 `preferModuleFiles`（默认 true）：置 false ⇒ 第四态 `disabled` 且**不调用装载器**，同时明确告警「本仓模块全部走 CJS 回落、机制不生效」。判据 `tests/v3300_mo2_host_loader.test.mjs`（12 条）+ 四条真源码破坏负控制（base 不再认领 / 正则放宽 / partial 读成 ok / 开关失效）+ 抬版连带（版本六处 / 测试文件 280→281 / v3209 数量锁补版本出处 / REGISTRY / tsv / README-PLAN 读数）。★ 本版自伤三处（附修法）：判据夹具把闭包出口写成 `this.xxx`（真实现是闭包直接引 `_extraJsLoad`）；`new Function` 漏注入 `PLUGIN_NAME`；「候选为空」首跑没造出来（忘 `_LOADED_SRC` 是第一候选）⇒ 已补成两条互斥判据。★ **收敛**：v3299 引出的「历史档硬锁 extra_js 总项数」本轮按纪律**交棒**（历史档只判「自己那一项在场恰一次」），与 README 总项数职责不同（后者是人读面、被 D3 核回磁盘），勿混。★ **边界（诚实）**：本刀只收**装载面**；M-O2 其余验收项（展开/滑块/输入/焦点/窄屏/重开保留）只跑了保存与导出两条；M-O1 仍未收口。真宿主探针依赖本地 Chromium 与 ST clone，**不进 `npm test`**。
> **历史留痕：v3.301.0**（原当前行） —— **M-O2（第二刀）装配外提 + 装载后重建**（第二期优化计划第四条续）。★ **本刀修的是比第一刀更坏的一类形态**：v3.300.0 把 `extra_js` 挂上了（模块真在场），但引擎/插件是**加载期**构造的、模块是 `init()` 期挂的 —— 于是构造期 34 个成员全落空退路，装载后 `init()` 只重跑 `rebindModuleDeps()`（注入**模块**），**没人重建实例**。真宿主读数：engine 32 + plugin 2 个成员 `_absent=true`、`ConfigManagerFallback` 持 **0 键**（真实现 181 键）、`saveConfig()` 是 `return undefined` ⇒ 面板报「✅ 设置已保存」而 localStorage 一字未写。修法：装配段外提为 `_assembleComponents()`（唯一装配点）、装载后 `rebuildComponents()` 重装配并**冻结/回灌用户数据面**（否则重建=清空存档）、七个 `window.LonShaX?.Y` 直取改 `this._winModule()` 惰性读取、`init()` 接线序改为 `rebind → 新配置 → rebuild → emergency → registerEvents`（失败只留痕）；另堵一处窄缺陷：**幂等分支也要装传入的新配置实例**（`configSwapped` 留痕），否则 `plugin.configMgr` 与 `engine.config` 各持一份。真宿主三轮 probe 全绿：`_assembleRead.before{32,real:1,absent:31} → after{32,real:32,absent:0}`、保存真落盘 12338 字节/181 键、重开读回同值、滑块/文本输入/焦点/窄屏全通、`pageErrors=[]`。判据 `tests/v3301_mo2_component_rebuild.test.mjs`（12 条，含四条真源码破坏负控制）。
> **最近更新：v3.355.0 —— 第六期批次 A 两项交付（M6-O1 连续经历重建 / M6-O5 双时间经历），当版全量已实跑并登记**（全量 `TEST_TIMEOUT=600000 node tests/run.mjs --audit --jobs 3 --audit-jobs 2` ⇒ **334/334 文件 · 4066 断言 · 0 失败 · 审计 61/61**；读数由 `tools/_rebind_doc_readings.py` 消费结构化摘要零手抄写入 `tests/audit/doc_readings.json`）。★ **内核**：`experience-rebuild.js`（33791B）把散在多个楼层的起因/经过/转折/结果重建成一个单元，每段带 source+refId 可回源；turn/pending 缺了不算缺口；candidate 永不自动升 confirmed；`splitExperience` 不是删除而是原单元只留 keepRefIds、其余组成新单元（标题加「（拆出）」），此后 addRef 报 already-split 防止问答把误并自动缝回。`dual-time.js`（19651B）三轴 occurred/disclosed/learned 可连接但不互相代替，learned >= disclosed 违反只标 inconsistent 不修正；null 不回落成「现在」；端点颠倒不静默交换；半开区间不补另一端；日期压成 y*10000+m*100+d 数字键。★ **接线**：取库口 `_experienceRebuildLib`/`_dualTimeLib`，宿主出口 `queryExperience`（12 op）/`queryDualTime`（8 op，含 versionAt），写侧经 `_commit()` 落回 `worldProg`；selfCheck 新增两行（模块未加载也有名字）；extra_js 117→119。★ **持久化面**：WorldProgress 子键逐项枚举，construct/export/import 三处成对补 `experiences` 与 `timeCoords`（不初始化=首轮 undefined 与「真的没有」同形，不登记=存盘即丢/读档即空）。★ **判据抓到的两层真实缺陷**：versions 只存字符串 ⇒ 无「第110楼当时读到哪个版本」的答案；visibleAt 只看 learned 当值 ⇒ upsert 把 learned 推到 140 后第 110 楼被误判为不知道（此人第 100 楼就已知旧版）。修法：新增 `versionTrail:[{version,learnedAt}]` + `versionAt(coord,floor)` 三态（版本 / not-yet / unknown），visibleAt 改为优先取轨迹最早的 learnedAt。★ **抬版连带修的两处判据债**（本版全量首次抓到）：v3520/v3530 用硬等号锁死「VERSION 恰为 3.353.0」⇒ 改为下界锚（BORN_V + vnum）；v3205 的「不许抬阈值」判据钉死 120000ms，而 v3.354.0 因并发余量合法抬到 300000ms 却漏同步 ⇒ 改为钉住 300000 上界且不得再抬。★ **诚实边界**：真实 SillyTavern 宿主的 UI 点击流与真实模型问答未跑；两个内核是无状态纯函数。
> **历史留痕：v3.353.0 —— 第五期全部18项已交付，全量回归收口**(全量实跑一次并重绑读数：**328 测试文件 / 3910 断言 / 0 失败 / 审计 61/61**；同源六面、基线/上界/台账当版有账，当版收口档 `tests/v3480_closeout_fourth_phase.test.mjs` 18 条全绿)。上一版 **v3.347.0 第四期拓展第九项 M4-X9:资料与剧情分区的联合查证(P2 / L)**(第四期产品拓展包第三包「生成的时序」,**本项是第四期计划的最后一项**)。★ **修的是什么(修前实测,读码可复算)**:`lore-import.js`(v3.327.0 · E 包 M3-X5)保存段落来源与类别,`evidence-query.js` 主要查账本 —— 两者**来源位是两套口径**:同一件事在资料侧与剧情侧**同形**;同名人物两侧各一份却**没有一处报「需人工确认」**;资料撤除后引用过它的历史答案**照旧引用**;作者批注与资料原文**混在一格**。★ **本刀(内核资料对照面 / 宿主接线面,不建第二套查询)**:1 **内核 `lore-crosscheck.js`**(`CX_VERSION 1`,33061 字节 / md5 `ac2896fe3cc92591229bdd15ee7a9d76`,零依赖 IIFE 双导出,**零反斜杠构造**):**受控三模式** chat-only / lore-only / compare(默认 compare;非法值回落对照**并具名**);**四分区** chat / lore / note / unknown(显式 partition → origin/kind/source 查表(与 lore-import 的 ORIGIN 同词表)→ 都不中 ⇒ unknown,**不硬塞**);**六态判定** matched / divergent / unrealized / lore-only / chat-only / unchecked(「**未发生**」与「**判不了**」**必须不同形**);**撤除**后被撤资料**一格不带**且历史引用报 `sourceStale`;**批注自成一区不冒充原文**;**资料不默认并入正史**(显式 `admitLore` 才并);命中判据**可复算**(主体键相等或标题互含且长度 ≥ 2,**不硬凑**);池上限 400、畸形丢弃计数;`selfCheck` **九项自证**;导出面 **38** 项。2 **宿主接线面** —— 取库口 `_loreCrosscheckLib` + 三法 `_crosscheckChatRows`(唯一装配点:从既有结构化查询 owner `searchEvidenceStructured` 收剧情事实行;**逐源守** —— 取不到报 absent、抛异常报 thrown,**缺席绝不冒充空**;取样判据**由调用方给**,因为 `ok` 键面逐源不同) / `loreCrosscheck` / `_loreCrosscheckLine` + 自检面「资料对照」行;**零落盘面**。3 **两处现场纪律** —— 补丁首版按「别处有」写成 `evidenceQuery()`,实跑确认宿主**根本没有该出口**、真实出口是 `searchEvidenceStructured`(**state 键面**)⇒ **回滚重做**;自收紧两处(同名跨资料只对**人物类**生效、省略号走字符码)。★ **五条评判线索落地**:三模式**真的不同形** / 三验收例各自可达且互不同形 / **撤除后正文一格不带** / **批注不冒充原文或事实** / **资料不默认并入正史**。★ **定向复验**:`tests/v3470_m4x9_lore_crosscheck.test.mjs` **26 条全绿**(A + 内核面 / B1~B8 / C1~C4 / D1~D9 九条真源码破坏负控制 / F1 + F2 / G1),9 条负控制各带原版阳性对照;首跑七处红**逐条归因**(五处测试档自身缺陷 + 两处连带面)。宿主基线 21964 行 / 798 成员(ceiling 22364);`extra_js` **111 → 112**。★ **诚实边界**:真实宿主的 UI 点击流与真实模型问答**未跑**;本面是**无状态只读投影**(不缓存原文、不联网、不默认并入正史);全量 `npm test` **读数未登记**(快照按纪律仍停 v3.328.0) ⇒ 当前 v3.347.0 **全量待验**。
> **历史：v3.346.0 —— 第四期拓展第七项 M4-X7:旧事重现进入真实生成且由玩家控频（P1 / L）**（第四期产品拓展包第三包「生成的时序」）。★ **修的是什么（修前实测,读码可复算）**:既有 `fated-recall.js`（v3.328.0 · F 包 M3-X8）已走完「情境 → 触发键 → 候选 → 策略」四步,但它只到**建议重现 + 来源**为止,**不答**三个下游问题:（1） **候选可注入 ≠ 生成管线真的用过**（`injectable` 是静态判断,读数上「给了 12 条可注入」与「真用了 1 条」**同形**）;（2） **没有生命周期**（`markShown` 只记「展示过」,而**预览**与**使用**两种动作在账上**完全没有分列** ⇒ 「预览了一下就取消」会把冷却**误消耗**）;（3） **没有控频强度档**（默认是什么、「重开/切回会不会重复轰炸」没有闸）。★ **本刀（内核控频闸 / 宿主接线面 + 持久化收口,不建常驻提醒代理、不产正文、不写库）**:1 **内核控频闸** —— 新模块 `return-gate.js`（`RG_VERSION 1`,`RG_KIND `return_gate``,585 行 / 32454 字节 / md5 `d9968a7407abb52edface48f929894cb`,零依赖 IIFE 双导出）;**生命周期三通道分列** `preview`/`shown`/`used`,而 `COOLDOWN_CHANNELS` **只含 shown·used** —— 「**预览一律不消耗冷却**」是本刀立身之本;**控频强度档** `POLICY` off / hint-only / inject（默认 `hint-only`,**只有显式 inject 才产出可注入面**,`off` 恒零,三态各自读数**不同形**）;**重复轰炸闸** —— 同 （触发键, 旧事键） 在 `REPEAT_WINDOW 3` 楼内已 shown/used ⇒ 再问一律 `held`（reason `repeat-window`）,且**预览过不算**;**反馈只是呈现偏好** `PREFERENCE` normal / less / never（`never` ⇒ blocked、`less` ⇒ held,但**绝不删除任何历史标记**）;**情绪只读**（`emotionUsed:false`）;`gate` 闸序即优先级;`hasPercentKey` **不产置信百分比**;`line` 四方**分开说**（可提 / 押后 / 不出 / 可注入）;`render` **只给建议与来源与闸态,不产正文**;`selfCheck` **八项自证**;导出面 **38** 项。2 **宿主接线面** —— 取库口 `_returnGateLib` + 五出口 `_returnGateCandidates` / `returnGateAdmit` / `returnGateMark` / `returnGatePrefer` / `_returnGateLine` + 自检面「控频闸」行;候选缺省取数回落 `fated-recall` 的 `suggest()`（给不出如实报 `no-fated`,不编候选）;明写「**移交不算已用**」;零顶层落盘面。3 **持久化收口（本会话新发现并修掉的真实缺口一）** —— `memory-organs.js` 的 `WorldProgress` export/import 是**逐项枚举子键**的,`returnGate` 不在表里 ⇒ 存盘即丢**假声明**,且回滚面不清 `marks.floor` ⇒ 被删楼层的命中永久 held;已五处落点修齐（真读 159916 → 163121 字节,md5 `73ef59b97ea96080ae00765a566c79f5` → `fdd8332d4f67454c1773d924ea90ebe4`）。4 **宿主候选装配三态塌陷（同会话第二处真缺口）** —— `Array.isArray` 判据会把「显式给了畸形候选」与「根本没给」**抹成同形**,已改 `!== undefined && !== null` 原样透传给内核判畸形。★ **五条评判线索逐条落地（全部真跑读数,读码可复算）**:预览免费 / 展示与真用落冷却 / 三通道可分 / 控频强度档三态**不同形** / 重复轰炸闸按窗生效且预览过不算 / 反馈只改偏好不删标记 / 不猜不编不产百分比 / 情绪只读。★ **定向复验（全部真跑）**:`tests/v3445_m4x7_return_gate.test.mjs`（**687 行 · 26 条全绿**,宿主侧从 `index.js` 真切片 + 真装载 `return-gate` 内核）:A 结构面与持久化面 / B 真跑六条 / C 宿主出口六条 / D1～D8 **八条真源码破坏负控制**（各带原版阳性对照） / F1 H5 判据纯度 + F2 H6 工具两向自证 / G1 版本锚。宿主基线重建至 v3.345.0:实测 **21740 行 / 793 成员**（ceiling 22006 → 22140 余量 400,成员 788 → 823）;`extra_js` **109 → 110**（新增模块 `return-gate.js`）。· 退出码三档:0 卫生 / 1 真缺陷 / 2 结构漂移（本仓扫描器契约）。★ **诚实边界**:真实 SillyTavern 宿主的 UI 点击流与真实模型问答**未跑**（宿主新面以真装载宿主切片验证调用口径）;本面是**只读控频闸**,零顶层落盘面;全量 `npm test` 已实跑并按类处置抬版连带面（49 个失败档,逐类定向复跑转绿）,但**读数未登记**（快照按纪律仍停 v3.328.0,登记留到第四期计划收口点） ⇒ 本版**全量待验**。
> **历史留痕：v3.344.0 —— 第四期拓展第六项 M4-X6:梦境、假设、计划与现实的叙事层记忆（P2 / L）**（第四期产品拓展包第二包「正史与证词」）。★ **修的是什么（修前实测,读码可复算）**:既有 `memory-type.js` 有 9 类事实与来源、`knowledge-trace.js` / `secret-ledger.js` 能表达误信、`narrative-pulse.js` 可排除不可信情绪,但**「事实类型」与「叙事层（梦 / 假设 / 计划 / 引述）」不是同一轴** —— 梦到角色死亡会被当成现实写进生成面;「如果搬走」读成「已经搬走」;「打算去」与「已经去过」分不开;引述他人说法与亲历同权;五层及嵌套例没有一条可机检形态。★ **本刀（两刀:内核层轴 / 宿主接线面,不另建一套时间线、不新增持久化键）**:1 **内核层轴** —— 新模块 `narrative-layer.js`（`NL_VERSION 1`,`NL_KIND 'narrative_layer'`,零依赖 IIFE 双导出）;五层 `reality`/`dream`/`hypothesis`/`plan`/`quote` + `unspecified`（与已知层**不同形**,不硬塞进五层）;`modalityOf` 判定序（显式字段 > `frame.modality` > `unspecified`）**不靠关键词**;`frameOf` **嵌套链**（上限 `MAX_FRAMES 4`）;`planStateOf` **计划闸**（说 done 但**无事件关联** ⇒ 仍 `planned`）;`realityView` **现实面隔离**;`hintOf` 关键词**只作提示读数、不参与层判定**;`hasPercentKey` **不产置信百分比**;`build` / `projectOf` / `line` / `selfCheck` 七项自证;导出面 **22** 项。2 **宿主接线面** —— 取库口 `_narrativeLayerLib` + 三出口 `narrativeLayer` / `narrativeReality` / `narrativeProject` + 诊断行 `_narrativeLayerLine` + 自检面「叙事层」行;取数缺省回落**事实账** `_factVersionState.facts`（层标注就落在既有条目上）,**不新增任何持久化键**（不动 `ARCHIVE_TOP_LEVEL_KEYS` / `CARRYOVER_EXEMPT_KEYS` / `collectExport` / `restoreFromPayload` / `clearRuntimeMemory` 五面）。★ **五条评判线索逐条落地（全部真跑读数,读码可复算）**:五类及嵌套例各一条;**现实面 6 条取 1 排除 5**（梦 / 假设 / 计划 / 引述 / 未标注全挡在现实面外）;计划说落实却无事件关联仍 `planned`（`planAwaitingEvent 1`）;嵌套 `depth 2` 且超 `MAX_FRAMES` 截断;有「梦」线索词仍落 `unspecified`（不猜）。★ **定向复验（全部真跑）**:`tests/v3440_m4x6_narrative_layer.test.mjs`（**22 条**,宿主侧从 `index.js` 真切片 + 真装载 `narrative-layer` 内核）:A 结构面（宿主四面 + 取库口 + 自检行 + `extra_js` 109 + 零落盘面 / 内核版本 + 五层 + 十原语 + 七项自证） / B 真跑五条（层轴 / 现实面隔离 / 计划闸 / 嵌套可见且有界 / 不猜） / C 宿主六出口（取真源 / 现实面接线 / 分层投影 / 缺模块三态降级 / 诊断行 / 缺省取数且两路读数逐字一致） / D1~D6 **六条真源码破坏负控制**（各带原版阳性对照） / F1 H5 判据纯度 + F2 H6 工具两向自证 / G1 版本锚。宿主基线重建至 v3.344.0:实测 21606 行 / 787 成员（ceiling 21914 → 22006 余量 400,成员 788 在线内不抬）;`extra_js` **108 → 109**（新增模块 `narrative-layer.js`）。· 退出码三档:0 卫生 / 1 真缺陷 / 2 结构漂移（本仓扫描器契约）。★ **诚实边界**:真实 SillyTavern 宿主的 UI 点击流与真实模型问答**未跑**（宿主新面以真装载宿主切片验证调用口径）;本面是**纯只读层判定**,层标注落在既有条目上,**不新增持久化键**;全量 `npm test` **读数未登记**（快照按纪律仍停 v3.328.0,登记留到第四期计划收口点） ⇒ 本版**全量待验**。
> **历史留痕：v3.343.0 —— 第四期拓展第五项 M4-X5:同一事件的多方证词与争议档案(P2 / L)**(第四期产品拓展包第二包「正史与证词」)。★ **修的是什么(修前实测,读码可复算)**:`knowledge-trace.js` 能**记证词**、`perspective-card.js` 能**报两人信息差**,但**「同一事件的多方说法」与「争议未裁决」没有一面聚合** —— 谁亲历、谁转述、谁反证看不出来;同一条原始证据经甲传乙、乙传丙会被读成三份独立证明(来源不去重);立场对立且判不开时无法区分「转述独有 / 低于门槛 / 真正判不开」三档;揭密前后视角不分;撤回证据后不重算争议状态。★ **本刀(两刀:内核证词面 / 宿主接线面,不建第二套证词库、不新增持久化键)**:1 **内核证词面** —— 新模块 `testimony-board.js`(`TB_VERSION 1`;四态 `supported`/`contested`/`undecided`/`withdrawn`;三档 `ambiguous`/`below-threshold`/`transmittal-only`;`supportsOf` **来源去重**(同一条原始证据只算一份独立支持,其余计入转述并报同源对象)、`disputesOf` **三档分列**、`stateOfOf` 四态判定序、`identitiesOf` **揭密前后分面**(`surface`/`revealed`/`homonym`/`unspecified` + `split`)、`revokeEvidence` **重算状态**(全撤 ⇒ `withdrawn`);导出面 24 项,零依赖 IIFE 双导出);2 **宿主接线面** —— 取库口 `_testimonyBoardLib` + 三出口 `testimonyBoard` / `testimonyRevoke` / `_testimonyBoardLine` + 自检面「证词面」行(**零落盘**:不新增持久化键,复用已随 `worldProg` 持久化的 `knowledgeTraces.traces`)。★ **定向复验(全部真跑)**:`tests/v3430_m4x5_testimony_board.test.mjs`(**21 条**,宿主侧从 `index.js` 真切片 + 真装载内核):A 结构面 / B 真跑口径 / C 宿主三出口 / D1~D6 **六条真源码破坏负控制** / F1 判据纯度 / F2 工具两向自证 / G1 版本锚。宿主基线重建至 21514 行 / 783 成员(ceiling 21914 余量 400);`extra_js` **107 → 108**(新模块)。★ **诚实边界**:真实 SillyTavern 宿主的 UI 点击流与真实模型问答**未跑**;本面纯只读聚合投影,**不新增持久化键**;本版实施期已实跑过一次全量复验(323/323 文件 · 通过断言 3795 · 失败 0 · 审计 61/61,exit 0;首跑曾报 47 处失败断言 均为抬版连带面,已逐项修复并定向复验全绿),**读数未登记** ⇒ 标**全量待验**(登记按纪律留到第四期计划收口点)。
> **历史留痕：v3.342.0 —— 第四期拓展第三项 M4-X3:正史选择真正进入下一卷(P2 / L)**(第四期产品拓展包第二包「正史与证词」)。★ **修的是什么(修前实测,读码可复算)**:`branch-canon.js` 能**列出结局**(`listOutcomes`)、能**置选择**(`setDecision`)、能判冲突与蔽体(`conflicts`/`maskSecretBody`),下游 `volume-continuation.js` 也能**收面归属形状**(`filterByKeeper` 吃的是带 `face`/`ownerKey`/`key` 三格的条目) —— 但**「这次选的正史」与「下一卷要接的条目」之间,一步映射都没有**:全仓零 `buildContinuePack` / `adoptableItems` / `adoptionBrief` / `revokeGuard` / `ADOPT` 命中 ⇒ 选择面只产「结局条文」(`value` 一句白),下游 owner 只认三格形状,**中间那道映射没人做** —— 结局一条也接不上,而预览读数(`listOutcomes` 列了几条)**照样全绿**。这是本仓治过多次的「读数绿、链路断」同族:有清单、有形状,就是没那一步「把条文按形状落成条目」。★ **本刀(两刀:内核落卷面 / 宿主接线面,不建第二套正史库、不只加按钮)**:① **内核落卷面** —— `BC_VERSION 1→2`;六张新常量面 `ADOPT`(`ready`/`blocked`/`empty` 三态)/`ADOPT_LABEL`/`ADOPT_SOURCES`/`ADOPT_KIND`/`ADOPT_ITEM_FIELDS`/`UNMAPPED`(`no-face`/`no-owner`/`no-key` 三缺因);`adoptItemOf`(单条映射:把结局的 `items` 逐条按三格落成可接条目,缺格即具名缺因);`adoptableItems`(**可接集**与**未映射集**分列,缺因逐条具名,缺格条文一律不进可接集);`buildContinuePack`(出续写包 **三态不同形**:`ready` 出包 / `blocked` 未选尽**不出包**且报待选数 / `empty` 选尽却无条可接且 `bareCount` 具名 —— 把「空条」与「映射失败」压成一条是本仓治过多次的错读数);`adoptionId` **幂等键**(选中键集合指纹 + 卷 + `allowReplace`/`allowNameLink` 两开关定,同一份选择恒同 id,换卷或换选择必不同);`adoptionBrief`(凭据:幂等键 + **撤销范围** `revokeScope`);`revokeGuard`(撤销保护面**四张具名表**:可撤 / 别批(`packId` 不同)/ 手工(无来源范围)/ 后来新增(晚于本次凭据),`deletesManual` 如实报 `false`、`branchWrites` 恒 `0`;无凭据即报未判,**不许「全删」兑底**);`adoptionLine`/`adoptProbeDeps`/`adoptProbePlan` 读出面;导出面 +14(既有 32 项逐字不动)。② **宿主接线面** —— `storyCanonAdoptPlan(opts)`(落卷计划,真内核 + 零写读数;未选尽 `blocked` 且 `pack null`)/`storyCanonAdoption(opts)`(凭据:**只在 `commit` 后落盘**,预览期只出键)/`storyCanonRevokeGuard(entries, opts)`(撤销保护面;默认取数口器官在则真读、缺席报空不编条目)/`_volumeContinuationEntriesForGuard()`(从真器官账本取条目)/`storyCanonAdoptConfirm(opts)`(确认落笔:**落笔 / 落盘 / 回读**三环 + 幂等)/`storyCanonAdoptLine()`(诊断行,四态 / 缺席具名);落卷凭据 `_canonAdoption` 落 `ARCHIVE_TOP_LEVEL_KEYS` + 携带豁免表(理由:`adoptionId` 由「本次选择」定,跨对话带上会让新故事的第一次落卷被判成**重复确认**而静默不落) + `collectExport` + `restoreFromPayload` 四处契约面 + 清空面 + 自检面「支线正史」行落卷读数(并入既有行,不新增行)。★ **验收四步闭环逐条落地(全部真跑读数)**:**选择 → 落卷 → 重启 → 撤销** —— (a) **选择**:稳态 1 条可接 / 下游 `missingFaces` 0 / `willAdd` 1 / 提案 1;三态互不相等(`ready`/`blocked`/`empty`),`blocked` 与 `empty` 均 `pack null` 且 `pendingCount` 分列 1 / 0;(b) **落卷**:`storyCanonAdoptConfirm` ⇒ `ok:true` / `applied:1` / `persisted:true` / `readback` 为 `ok` / 器官账本 `volumeContinuationCount()===1` / 诊断行「已落 1 条」;(c) **重启**:同实例重复确认 ⇒ `duplicate:true` 且不重落;**新实例 + 从持久载荷还原凭据**后再确认 ⇒ 仍 `duplicate:true` 且**带原 `applied`**(`{"applied":1,"reason":"duplicate"}`);换卷(`v2`)不算重复(**必须真落笔**);(d) **撤销**:`revokeGuard` ⇒ `revocableCount 1` / `foreignCount 1` / `manualCount 2` / `deletesManual false` / `branchWrites 0`,后来新增单列、无凭据报 `judged:false`。★ **定向复验**:`tests/v3420_m4x3_canon_adoption.test.mjs`(**24 条**,真切片宿主 + 真装载内核 + 真下游 owner):A1 宿主五新出口各恰一处 + 四处契约面 + organ 逐字副本 + 自检行并入 + `extra_js` 107 / A2 内核面(版本 2 + 六张常量面 + 八个新原语 + 既有面一字未拆 + 冻结)/ A3 内核纯度(实现体不读宿主 `this`;零 `require(`/`fetch(`/落盘;judge 面不拿宿主字串当判据)/ B1～B5 五条真跑口径面(形状接得上 / 三态不同形 / 缺格具名 / 幂等地基 / 撤销保护面)/ C1～C5 五条宿主接线面(计划出口 / 确认落笔 + 重启 / 落盘闸门 / 撤销面出口 / 内核缺席同键降级)/ D1～D8 **八条真源码破坏负控制**(各带原版阳性对照)/ F1 H5 判据纯度(八个锚点在本档各 1 次)/ F2 H6 工具两向自证 / G1 六源同源 + 出生锚 `BORN_V`(下界,不锁当版)。宿主基线重建至 21437 行 / 780 成员(ceiling 21837 余量 400);`extra_js` 仍 **107**(本刀无新模块)。★ **诚实边界**:真实 SillyTavern 宿主的 UI 点击流**未跑**(宿主新面以真装载宿主切片验证调用口径;「重启」一条用**真新实例 + 真持久载荷还原**取证 —— 验的是判据认不认持久凭据,不是真关掉酒馆再开);撤销面**只判分类与读数**(谁在可撤集、谁被排除),真删动作不在本仓;本版实施期已实跑过一次全量复验（322/322 文件 · 3774 断言 · 0 失败 · 审计 61/61，exit 0），**读数未登记**；故标**全量待验**(登记按纪律留到第四期计划收口点)。
> **最近更新：v3.341.0 —— 第四期拓展第二项 M4-X2:面向读者的章节回顾与年鉴成稿(P1 / L)**(第四期产品拓展包第二包「正史与证词」)。★ **修的是什么(修前实测,读码可复算)**:`story-annual.js` 已有四要素、证据引用、草稿编辑和过期检测,但三者**各自成立、合起来不成篇** —— `belletristic` 只是词表读数(**不生成、也不改写可读文章**);`edit` 只管白名单字段;`staleRefs` 只指段号。全仓零 `compose(` / `chapterKey` / `wholeBookRebuilt` 命中 ⇒ **玩家回看某一章时该看什么,没有任何一面回答**:没有成篇编排、没有逐段跳回原文的凭证、作者版与玩家版是同一种东西、改一章源文只能靠人自己想起来哪几章过期。★ **本刀(两刀:内核成稿面 / 宿主接线面,不建第二套摘要库)**:① **内核成稿面** —— `SA_VERSION 2→3`;段身份 `chapterKey(chapter,volume)` / `sectionOf(sec)`;`compose(rev,opts)` 吃 `review()` 产物出**可读编排**(六类段 `title`/`summary`/`event`/`change`/`unfinished`/`quote`),**每段带 `evidenceRef` 指回原文**(段落级 floor + ref + 指纹),`evidenceBound`/`evidenceMissing`/`evidenceUndecided` **三条读数分开报** —— 把「没证据」与「没看证据面」压成一条,是本仓治过多次的错读数;`composeForPlayer` 玩家版走**同一**闸口,**不接作者版**;`rebuildAffected` 按章重建四格 `rebuilt`/`kept`/`gone`/`untouched` + `wholeBookRebuilt` 恒 `false` + 五种判不了逐条具名;`applyEdits(draft,patch)` 对草稿与补丁**双向**过滤事实位(`state`/`facts`/`floor`/`ref` 一律拒收并逐字理由 `draft-only`),证据位被抹**逐条具名**;`normalizeDrafts`/`draftLine`/`composeLine` 读出面;导出面 31→45。② **宿主接线面** —— `storyAnnualCompose`(成稿)/`storyAnnualComposeForPlayer`(玩家版,`_o9Gate()` 自动装配且**不覆盖调用方面**)/`storyAnnualRebuild`(按章重建,零写)/`storyAnnualApplyEdits`(编辑落笔)/`storyAnnualDrafts`(草稿册读写)/`storyAnnualComposeLine`(诊断行);草稿册 `_annualDrafts` 落 `ARCHIVE_TOP_LEVEL_KEYS` + 携带豁免表(理由:章节身份绑定当前会话的卷章结构,且它是**作品**不是剧情事实,跨对话带上会把上一部的回顾接进新故事) + `collectExport` + `restoreFromPayload` 四处契约面 + 清空面 + 自检面「故事年鉴」诊断行。★ **四条验收口径逐条落地(全部真跑读数)**:(a) **真有成稿** —— `compose(review(...))` 出 7 段,证据位逐段 `'','','ch1#event@3','ch1#event@9','ch1#change@9','ch1#unfinished@9','ch1#quote@3'`,`evidenceBound 5 / evidenceTotal 5`;(b) **未调用真实模型只报结构成稿** —— 四态实测:未给 `polish` ⇒ `structure-only` + `modelUsed:false` + `styleChecked:false` + 「未调用真实模型 ⇒ **不报文风通过**」;给了 `polish` 且文本真变**且**回调回报 `styleOk` ⇒ `polished`/`true`/`true`;给了 `polish` 真变但**未回报** ⇒ `polished`/`true`/`false` + 「调用方**未**回报文风结论 ⇒ 不报通过」;文本无变化或抛错 ⇒ 退回 `structure-only` 且 `why` 含 `polish-no-change`;(c) **按章重建而非整本重写** —— `rebuilt=['p/v/1'] / kept=['p/v/2'] / gone=['p/v/3'] / untouched=['p/v/9']`,`wholeBookRebuilt:false`,`missing-chapter-unnamed`/`no-stale-read`/`no-drafts`/`stale-face-absent`/`draft-without-ref` 各自具名;(d) **改正文不篡改记忆可机检** —— `applyEdits({sections:[{evidenceRef:'r1'},{evidenceRef:'r2'}]},{sections:[{evidenceRef:'r1'}]})` ⇒ `dropped:['r2']` / `evidenceIntact:false`;入参草稿自带 `state` ⇒ `rejected:[{key:'state',why:'draft-only',note:'入参草稿夹带的事实位不随编辑流传(事实不属于草稿)'}]` 且 `state.state===undefined`。★ **定向复验**:`tests/v3410_m4x2_chapter_compose.test.mjs`(**27 条**,真切片宿主 + 真装载内核):A1 宿主六出口与四处契约面各恰一处 + `organs` 逐字副本 + `extra_js` 107 / A2 内核面(版本 3 + 三张常量面 + 九个新原语 + 既有九面一字不动 + 45 项冻结)/ A3 内核纯度(实现体不读宿主 `this`;零 `require(`/`fetch(`/`localStorage`/`indexedDB`/`XMLHttpRequest`;八个模块内标识不在宿主重复出现)/ B1～B7 七条真跑口径面 / C1～C5 五条宿主接线面(含内核缺席五出口同键降级)/ D1～D9 **九条真源码破坏负控制**(各带原版阳性对照)/ F1 H5 判据纯度(九个锚点在本档各 1 次)/ F2 H6 工具两向自证 / G1 六源同源 + 出生锚 `BORN_V`(下界,不锁当版)。宿主基线重建至 21180 行 / 774 成员(ceiling 21580 余量 400);`extra_js` 仍 **107**(本刀无新模块)。★ **诚实边界**:真实 SillyTavern 宿主的 UI 点击流与真实模型问答**未跑**(宿主新面以真装载宿主切片验证调用口径;「过了模型」一条用**注入的真函数**取证 —— 验的是判据认不认真模型通道,不是模型写得好不好);成稿文本的**文学质量不判**(那是人的事,本档只判结构化 + 逐段回源 + 读数如实);本版**全量待验**(全量 `npm test` 按纪律集中到第四期计划收口点跑一次)。
> **最近更新：v3.340.0 —— 第四期拓展第四项 M4-X4:带消歧与条件继承的多轮记忆问答(P1 / L)**(第四期产品拓展包第一包「查得准、导得进」)。★ **修的是什么(修前实测,读码可复算)**:`evidence-query.js` 的 `planQuestion` 是**单问句规划**,**不接前问语义状态** —— `askMemoryQuestion` 只吃一句问句,**能问一句、不能追问**;M4-O2 已能「记下有未翻译」,**不能继承**;模糊代词(「她后来呢」)与接续比较(「与上次相比」)没有显式的「上一轮条件」可沿用,只能每句独立规划 ⇒ 追问要么问错主体、要么悄悄扩大范围。★ **本刀(两刀:新内核 `qa-thread.js` / 宿主接线面,不建第二套查询真源)**:① **新内核 `qa-thread.js`**(`QT_VERSION 1`;四态 `idle`/`open`/`awaiting-disambig`/`closed`;`advanceThread` 顺序**不可换** —— 身份对账(`chatKey`/`branchKey` 变即 `thread-identity-changed` **作废重建**)→ 读字面标记(`switch`/`branch`/`at`/`cmp`/`pronoun` 五表,**不引词典依赖以保重放一致**)→ 定主体(显式人名优先 / 代词仅在**唯一**主体下继承 / ≥2 主体转消歧)→ 定条件(有锚折算 / 无锚继承或具名 `at-hint-unresolved` / 切分支缺 `branchKey` 具名 `branch-key-absent`)→ 落有界 trace;`resolveAmbiguity` 未选中即保持待决报 `unresolved`;`threadSpec` **只产 `actors`/`floorFrom` 两个既有 FILTERS 键** —— **只存结构化查询约束与选中 ref,不存第二份答案事实**);② **宿主接线面** —— `_qaThreadLib`(取库口);`_qaThreadState`(线程懒初始化 `{version,state,chatKey,branchKey,subjects,candidates,atFloor,atHint,compareAxis,scope,turn,trace}`);`askMemoryQuestionFollowUp`(与单问句**同一** `planQuestion`,再走 `advanceThread`;`awaiting` 时**直接返回、不跑查询** —— 跑了就是把「指代不定」伪装成「查过了」,否则 `Object.assign` 合并 `p.spec`+`ts.spec` 后走**同一个** `Q.query`/`Q.composeAnswer`);`qaThreadResolve`(消歧点选接回);`qaThread`(只读读数,模块缺席同键降级 `version:0`);`ARCHIVE_TOP_LEVEL_KEYS` 增 `qaThread` / 携带豁免表增 `qaThread`(跨对话继承会把 A 的追问答成 B 的)/ `collectExport` 增 `qaThread` 键 / `restoreFromPayload` 增还原分支 + 自检面「追问线程」诊断行。★ **连带修一处同族漂移**:`memory-organs.js` 侧的 `ARCHIVE_TOP_LEVEL_KEYS` **逐字副本**需与宿主同步 —— 本版加法补进后两侧逐字相等(len 661 / md5 127993d2),并同步 `v3283` 常量副本登记值(649→661 / d5942cdc→127993d2)与 `v3202` 豁免表键数(15→16)。★ **定向验收(全部真跑)**:`tests/v3400_m4x4_qa_thread.test.mjs`(**19 条**,真切片宿主 + 真装载内核与答问内核):A1 宿主四面各恰一处 + 取库口 + 持久化/契约面在位 + `extra_js` 107 / A2 内核面(版本 + 四态含 `awaiting-disambig` + 六原语 + 自证不变式)/ B1 条件继承(唯一主体下代词继承)/ B2 消歧不静默(多主体 ⇒ `awaiting-disambig` + 候选 + 点选接回)/ B3 换人替换与切分支缺键具名 / B4 时点(有锚折算 / 无锚不猜且具名 / 无锚继承 / spec ⊆ FILTERS)/ B5 身份不越界(换会话作废重建)/ C1 宿主继承并**真落进 spec.actors** / C2 宿主待决闸(`plans.length === 0`)/ C3 宿主身份作废 / C4 读数与诊断行三态 / D1～D5 五条真源码破坏负控制(各带原版阳性对照)/ F1 判据纯度 + F2 工具两向自证 + G1 版本锚。宿主基线重建至 21042 行 / 768 成员(ceiling 21442 余量 400)。★ **诚实边界**:真实 SillyTavern 宿主的 UI 点击流与真实模型问答**未跑**(宿主新面以真装载宿主切片验证调用口径);本版**全量待验**。
> **最近更新：v3.339.0 —— 第四期拓展第一项 M4-X1:可校订的分层导入与源资料更新(P1 / L)**(第四期产品拓展包第一项)。★ **修的是什么(修前实测,读码可复算)**:内核 `lore-import.js::classify` 是**唯一分类口径**(优先关键词判规则),而宿主八个 `loreImport*` 出口(`loreImportParse`/`ParseWindow`/`Entities`/`Preview`/`Plan`/`Changed`/`Describe`/`Line`)**全是只读**(`planApply` 的 `writesNothing: true`),全仓零 `override`/`reclass`/`改类` 命中 ⇒ **能分类、不能校订,能出计划、不能落笔**。★ **本刀(两刀:内核人工校订面 / 宿主接线面,不建第三套状态机)**:① **内核人工校订面** —— `LI_VERSION 1→2`;`MANUAL` 三态 `accept`/`override`/`split`(三态都**不改 origin**—— 人工改类只改归类,不改「这是导入资料」);`applyOverrides` 每条 item 增 `clsRule`(规则原判**永不丢**)/`cls`(最终)/`manual`/`judgeWhy`,非法类名拒收具名 `bad-class`、切点缺拒收 `split-point-absent`,拆分产出 `key#a`/`key#b` 两条;`splitText` 按 `atText`/`at` 切;`reclassify` 薄封装;`planApply` 增 `selected` 过滤(未选段具名 `not-selected`,**不静默丢**);`describe`/`selfCheck` 露 manual 面;导出面 29→34 项。② **宿主接线面** —— `_loreImportOwners`(落笔 owner 唯一装配点:前情写面走 `PrequelSystem.importPrequel`、事实读面走 `_o6ConfirmedFacts` **只读**、幂等面);`_loreImportLedgerState`(导入账懒初始化,**只存幂等键与人工决定,不存整篇资料**);`loreImportOverride`(转发内核);`loreImportConfirmMapping`(把 needs-confirm 裁决接回,**不静默合并同名异人**);`async loreImportApply`(四步顺序**不可换**:叠校订出计划(未预览即拒)→只落选中段(敏感段跳过并具名 `sensitive-body`)→写 `PrequelSystem`(**不写事实账** —— 规则不冒充已发生)并读本行真账核验→落盘回读;回执含 `importId`/`duplicate`/`selected`/`applied`/`verified`/`persisted`/`readback`/`idempotentByImportId`/`undo`);`loreImportLedger`(重开可查落点);`collectExport` 增 `loreImportLedger` 键、`restoreFromPayload` 增还原分支。 ★ **连带修一处真漂移**:`loreImportLedger` 进了 `collectExport`/`restoreFromPayload` 却漏登记进 `ARCHIVE_TOP_LEVEL_KEYS`(v3140 契约三方一致性当场照出「契约缺导出键」);本版加法补契约表(两处逐字副本)+ 显式豁免表(importedText 与携带面 prequel 同源异名,携带会双写;seen/decisions 是会话内幂等与校订痕迹),并同步 v3283 常量副本登记值(len 629→649 / md5 d5942cdc)与 v3202 豁免表键数(14→15)。★ **定向验收(全部真跑)**:`tests/v3390_m4x1_lore_manual.test.mjs`(**13 条**,真切片宿主 + 真装载内核):A 宿主新面各恰一处 + 持久化面在位 / A2 内核人工校订面 / B1 人工改类(clsRule 与 cls 分列 / bad-class / split-point-absent / #a·#b)/ B2 选入面(selected 过滤 / 未选段具名)/ C1 宿主落笔(前情含选中段 / 事实账零写 / duplicate / 未选不写 / persisted+readback)/ C2 敏感段不落 / C3 同名映射确认回填 / F1～F4 四条真源码破坏负控制 + G1 判据纯度 + H1 版本锚。宿主基线重建至 20823 行 / 764 成员(ceiling 21223 余量 400)。★ **诚实边界**:真实 SillyTavern 宿主的 UI 点击流与真实模型问答**未跑**(宿主新面以真装载宿主切片验证调用口径);本版**全量待验**。
> **最近更新：v3.338.0 —— 第四期第九项 M4-O8:记忆控制中心处置类动作的生产方落地(P0 / L)**(第四期产品主线包A第八项)。★ **修的是什么(修前实测,读码可复算)**:内核 `memory-center.js` 早声明9 个动作与两条纪律(宿主没给 handler ⇒ 降级 unavailable;未给 availableHandlers ⇒ 只声明不判),而 `plugin._memoryCenterHandlers` **全仓零定义** —— 界面上的处置按钮要么不存在、要么点了无声;且 `correction-plan.js` 的提案面 writes 恒 0 —— **没有一条落笔通道**。★ **本刀(四刀:落笔面 / 取数口 / 直写面 / 真源注入,不建第三套状态机)**:① **宿主纠错落笔** `applyCorrectionPlan`(四步顺序不可换:出提案(未圈范围即拒)→只落 selected→owner 改数据并读本行真账核验→落盘回读;回执 applied/verified/persisted/readback/stale + **configUndo / factUndo 两个互不触碰的 token**)+ `undoCorrection`(分两路)+ `_verifyCorrectionItem`;② **取数口** `correctionSourceFacts`(圈范围取账上事实,未圈 ⇒ ok:false **绝不退回全量**)+ `correctionReextractFacts`(提取器缺席 ⇒ 具名 extractor-absent,不拿旧账当新结果);③ **直写面** `memoryCenterRevoke`(直走 `revokeFact`,不借道 `undoCorrection` —— 借道要伪造 journal,伪造会把「撤销这一批」的真流水覆盖掉) + `memoryCenterSaveQuery`(保存条件唯一出口);④ **真源注入** `_memoryCenterStateWithSaved`(面板读 `state.saved` 而真源在 `_evidenceSavedQueries`,两者此前零同步 ⇒ 保存了却看不到;浅拷贝注入不反写调用方)。面板补齐 **9 个 handler**,其中 `row.dispute` **如实报不可用**(事实账无争议写面,`disputed` 是推导态),**不编假写入**。★ **定向验收(全部真跑)**:`tests/v3380_m4o8_center_actions.test.mjs`(**16 条**,真切片宿主 + 真装载四内核):A 声明面(九处各恰一处 / 9 handler 各恰一处且旧手写模式清零 / 内核声明面 == 面板提供面)/B 六个出口真跑(保存同条件覆盖 / 浅拷贝同步 / 圈范围只取范围内 / 未圈不退回全量 / 三态不同形 / 撤回幂等且 journal 保留)/C 端到端(face.saved 与真源同条 / 争议面无写调用)/F 三条真源码破坏负控制(各带原版阳性对照)+ G1 判据纯度 + H1 版本锚。宿主基线重建至 20563 行 / 758 成员(ceiling 20963 余量 400);死代码预算 71414 → 72714(实测 72314)。★ **诚实边界**:真实 SillyTavern 宿主的 UI 点击流与真实模型问答**未跑**(面板 handler 以真装载宿主切片验证调用口径);本版**全量待验**。
> **最近更新：v3.337.0 —— 第四期第八项 M4-O7:长期压缩与遗忘保住不可替代证据(P1 / L)**(第四期产品主线包A第六项)。★ **修的是什么(修前实测,读码可复算)**:① GC 删除层零保护判定(首段关键约定/数额无声被删);② LTM 滚动丢旧条目时 salient 连句带体一起丢;③ 撤回/保留标记在 GC 删除层不生效。★ **本刀(证据保护筛 + salient 滚动前移,不建第二库、不无限增库、撤回绝不复活)**:① memory-gc.js 导出面 13→15,GC_VERSION 1→2,新增 evidenceScreen(三态保护+超额降级),三路接入,runGc 汇总结算 evidence 读数;② stm-ltm.js 的 LTM 滚动前移 salient,LOSS_KEYS 新增 salientCarriedOver 计数,lookupSalient 查回;③ index.js 接入 _evJudge 判定器(显式保留 > revoked 绝不保 > 文本特征),_protectBudget 默认 32,_lastGcEvidence 收账,getDegradationLedger 并档。★ 定向套件 tests/v3370_m4o7_evidence_protect.test.mjs 8 条全绿(含 F1/F2/F3 三条真源码破坏负控制 + G1 纯度 + H1 锚点)。六源同源抬至 3.337.0;宿主基线重建至 20159 行 / 749 成员(ceiling 20245 余量 86,成员 753 在线内不抬)。★ 诚实边界:真实 ST 宿主 UI 操作与模型未跑;本版全量待验。

> **历史留痕：v3.336.0** —— 第四期第七项 M4-O9:按事实可知性裁剪故事年鉴/玩家版输出(P0 / L)**(第四期产品主线包A第五项)。★ **修的是什么(修前实测,读码可复算)**:`story-annual.js::twoVersions` 的无剧透版只看 `allowedChars`(在场白名单)与 `knownChars`(名册) ⇒ 四处必然漏:① 同一在场角色**后来才揭露的秘密**也算「能看」(在场 ≠ 可知);② **没有角色名的秘密**(chars 为空)按「不因缺字段被裁」**默认放行**;③ 泄漏扫描只按名册**原名逐字**找 ⇒ 伪装期的旧名一个都扫不出来;④ 未了事项一律清空 ⇒ 已公开的未结伏笔被一并抹掉(「安全但整篇空白」不算完成)。★ **本刀(可知性判决口,不新增账本、不建第二份权限表、零写零缓存现算)**:① 内核面:`spoilerGate`+`gatedVersions`+`forPlayer` 三新面(五面全覆盖/三态不同形/判不了单独计数/未了面 undecidedKept 单列),导出面 28→31,`SA_VERSION` 1→2;`forPlayer` 生成侧**绝不回退作者版**(未给可知性面/没回顾/整篇裁空 ⇒ ok:false+reason);② 宿主面:`_o9Owners/_o9AliasIndex/_o9FactOf/_o9NamesIn/_o9Gate/o9Sources` 六成员(真源装配:秘密账本/知识轨迹/事实版本账/时点,缺席逐件具名;别名族展开让伪装期旧名扫得出来;判决口零写);两出口 `storyAnnualTwoVersions`/`storyAnnualForPlayer` 自动装配判决口(显式传入仍优先)。★ **定向验收(全部真跑)**:`tests/v3360_m4o9_knowledge_gate.test.mjs` **22/22 全绿**:A 结构面/B 内核闸真跑/C 验收四例真跑(同角色后揭密/匿名秘密/旧名伪装/已公开未结伏笔)/D 生成侧/E 宿主四面真接通/F 零写·零缓存·现算+四条真源码破坏负控制(各带原版阳性对照)+H6 工具两向自证+H5 判据纯度/G 版本锚。★ **判据翻修留痕(第五版,前四版都是判据错不是实现错)**:B2 首版把泄漏源放在旧口径从不扫的 open 面;C1/F2 首版用了 secret-ledger `find()` 不存在的嵌套 ref 形(实际只读扁平 id/secret)⇒ reveal 返回 not-found;F3 首版三重错(锚点缩进打偏/内核锚点误拿去破坏宿主文件/判据只比 decision+basis 故拆掉中间判决后兜底同形假绿)—— 修法:锚点从源码真行提取、内核破坏走 loadKernel、J1/J2 增 why 具名比对。六源抬至 3.336.0;宿主基线重建至 20104 行/749 成员(ceiling 20245 余量 141,成员 753 在线内不抬)。★ **诚实边界**:真实 SillyTavern 宿主的 UI 操作与真实模型问答**未跑**(chat 用同形状假数据);全量 `npm test` 按纪律集中到第四期计划收口点跑一次(本版为定向复验),本版**全量待验**。
> **历史留痕：v3.335.0 —— 第四期第六项 M4-O6:年鉴、正史与旧事重现接入真实数据(P0 / L)**(第四期产品主线包A第四项)。★ **修的是什么(修前实测,读码可复算)**:`_storyAnnualChapters/_storyAnnualSummary/_storyAnnualQuotes/_branchOutcomes/_pastDetails/_knownFacts/_loreConfirmedFacts` 七个私有槽在全仓**只见读取、零写入点** ⇒ 正常玩过的会话里年鉴/正史/旧事/资料四面长期停在「依赖未给 ⇒ 未判」,模块自检能出内容只是因为夹具手工塞了槽 —— **模块自检可用夹具不证明正常会话能产出内容**。★ **本刀(真实供数派生层,不新增账本/不缓存/对 owner 零写)**:① `_o6RealOwners()` 唯一取数口 + 九件真源(SummarySystem 卷章与史记 / WorldProgress 承诺与知识轨迹 / PlotTimeline 真楼层与剧情日期 / SceneBook 到访史 / SuspenseBook / 事实账 / 悬项簿 / 实体名册);② 六面派生:`_o6Chapters`(真卷记录 ⇒ 章节 + 章内事件/人物变化/未了事项/原话,原话取自**真聊天该楼**引号句) / `_o6Summary`(真读数快照) / `_o6Outcomes`(真分支对照 changed 差异 + 真终局项 terminal:true) / `_o6PastDetails`(时间线 person:/anniversary: + 场所 place:) / `_o6KnownFacts`(角色 × 真实体/事实/对手方) / `_o6ConfirmedFacts`(仅 origin:confirmed 与用户锁定);③ 四个装配点改走派生、**私有槽仍优先**(逐件判定);④ **两态不许同形**:真源缺席 ⇒ null(未判),真源在场而空 ⇒ 空表/`{}`(查过没有)。★ **连带修一处真缺陷(本刀照出来的)**:`branch-canon.js` 的 `CLASH` 表**漏了 `DIVERGENT`**,而它被三处引用(分档 / `blocked += 1` 闸 / planCanon 的 isClash 与 whyKind)⇒ 「同一位上两条取值不同」这条真实冲突落进 `undefined`,三处闸静默失效、下游把「未选的冲突结局」当「没有冲突」继续交接;老判据只喂 `terminal:true` 夹具(走 BOTH_TERMINAL),**只有真实供数才照出来** —— 这正是 M4-O6 验收原文「纯函数与诊断行全绿不足以收口」的现场。★ **定向验收(全部真跑)**:`tests/v3350_m4o6_real_supply.test.mjs`(**17 条**):A 结构面(十一成员各恰一处 + 四装配点真改走派生 + 九键逐字对账)/B 真源派生真跑(六面真内容 + 原话三态)/C 缺席⇒null vs 在场而空⇒空表·{}(七面对照)/D 四面接通真内核(年鉴建册 2 章 2 事件证据可回源、正史 divergent 冲突现形 + blocked、旧事出建议带来源且不知情者挡下、资料面实体与已确认事实来自真源)/E 零写·零缓存·现算(owner 快照逐字节不变、源变更章面 2→3、两实例同读数)/F 三条真源码破坏负控制(各带原版阳性对照)+ 工具两向自证 + 判据纯度 + 版本锚。连带复验 `tests/v3328_f_pack_canon_fated.test.mjs` 23/23 仍绿(补表未改既有判定)。宿主基线重建至 19845 行/742 成员(ceiling 20245,成员在线内不抬)。★ **诚实边界**:真实 SillyTavern 宿主的 UI 操作与真实模型问答**未跑**(原话面以同形状假 chat 验取数口径);本版**全量待验**。
> **最近更新：v3.334.0 —— 第四期第五项 M4-O5:长资料完整读取与可恢复解析(P0 / L)**(第四期产品主线包A第三项)。★ **修的是什么(修前实测,双探针实锤)**:`lore-import.js::parseSource` 对超 `MAX_SOURCE_CHARS=400000` 的资料直接 `slice` 截断 —— 42 万字符资料的尾部唯一事实被静默丢弃(`ok:true`+部分 items 被当完整输入),200 万字符同样只读前 40 万,且 `planApply` 对截断资料照常 `ok:true` 放行。★ **本刀(完整度面+窗口流,不抬常量不引外库)**:① `parseSource` 恒带 `completeness{state,totalChars,readChars,truncated,nextCursor}`,截断 ⇒ `ok:false`+`why:['source-truncated']`+`state:'partial'`;② `planApply` 对 `partial` 源拒入(`reason:'source-incomplete'`+已读/总量+续读游标);③ 新增 `parseSourceWindow(raw,{range})` 窗口解析 —— 段边界 `\n\n` 对齐(修前行对齐实测把跨窗段切成「完整段+无题半段」,3000 章流去重后 3002 条;修后恰 3000),`sourceRef` 全文件坐标(fileFrom/fileTo+行号偏移),完整度独立核算(本窗读完≠全文件读完);④ 宿主出口 `loreImportParseWindow`+窗口留痕读数+模块缺席同键降级(`window-unsupported`,不冒充「没读完」)。★ **定向验收(全部真跑)**:`tests/v3334_m4o5_long_source_read.test.mjs`(**17 条**):A 截断拒读三态/B 窗口解析(段边界、全文件坐标、3000 章去重、尾窗 complete)/C 长流真跑(42 万+200 万字符首中尾唯一事实存活)/D 零写不抛/E 宿主接线与缺席降级/F 版本锚+N1~N3 真源码破坏负控制+Z1 工具两向自证。宿主基线重建至 19443 行/731 成员(ceiling 19812→19843,成员 753 在线内不抬)。★ **诚实边界**:真实 SillyTavern 宿主 UI 操作与真实模型问答未跑;本版**全量待验**。
> **最近更新：v3.332.0 —— 第四期第四项 M4-O4:异步查询接到真实问答与资料页(P0 / L)**(第四期产品主线包B第二项)。★ **修的是什么(修前实测)**:`evidence-query.js::queryAsync` 内核能力(分片扫描/让出事件循环/片间取消检查)早已在盘上,但没有任何真实出口:`index.js::askMemoryQuestion` 仍是同步问答出口、`memory-tools-api.js` 只包装同步 `query`。★ **本刀(三面接线)**:① 内核面:`queryAsync` 增 `onShard` 回调,尾片额外触发最终进度,`QUERY_VERSION` 2→3;② 统一面:能力表五→六(`queryEvidenceAsync`),词表五态→六态(`canceled` 与 empty/partial 都不同形);修自伤一处 —— `selfCheck` statesComplete 写死 `STATES.length === 5` 在六态下恒 false,改为对齐词表自身;外供登记表 memoryToolsEnvelope 行同步六能力/六态;③ 宿主面:`memoryToolsSources()` 第六格装载,新出口 `plugin.queryEvidenceAsync(spec,opts)` 与异步问答 `plugin.askMemoryQuestionAsync(question,opts)`(taskId/shouldCancel/onProgress/shardRows,取消时 gaps 具名 kind:canceled),同步问答出口原样保留。★ **定向验收**:`tests/v3332_m4o4_async_query.test.mjs` 14 条全绿(含三条真源码破坏负控制);v3305 旧口径抬升六能力/六态(13/13);与 v3330/v3331 合计定向 68/68;宿主基线重建至 19412 行/730 成员(ceiling 19812)。★ **诚实边界**:真实宿主 UI 与真实模型问答未跑;全量 `npm test` 按纪律集中到第四期收口点跑一次;本版**全量待验**。
> **历史留痕：v3.331.0 —— 第四期第三项 M4-O3:回答从行拼接变成有据的事件解释(P0 / L)**(第四期产品主线包B第一项)。★ **修的是什么(修前实测)**:`evidence-query.js` 的 `composeAnswer()` 把覆盖面读数句(exists 带总数与账分布、关系侧单独命中、关系共现结论)与证据句放进**同一个候选池**,`QA_BUDGET` 触顶时读数与证据互相挤压;多计划命中同一 `ref` 重复输出同一事实;「为什么」式追问把「没拿到因果边」当「没有因果」,不区分来源。★ **本刀**:读数句分池(`readingIdx` + `addReading`,不占证据预算;证据按 `ref` 去重,`dedup` 记合并数;`emit()` 触顶仍保关键句与至少一条证据);答案新增 `readings` / `covered` / `dropped` / `dedup` / `events` / `keyPoints` 解释面,事件聚合按引用键不按标题;`explain.causal` 三态 `cause` / `sequence` / `unknown` 带严格门槛——confirmed edge 落入命中事件且调用方给 `causalKeyOf` 键空间映射(问答 `commitment:c1` ↔ 因果链 `cmt:c1`)才判 `cause`,只有顺序回 `sequence`,没有边时 `causalSource: 'no-source'` 如实说明;宿主 `_qaCausalEdges()` 从因果链节点 `kind`/ID 推导缩写(不硬编码第二份映射表),裸 engine 缺方法降级不抛错;`QA_VERSION` 2 → 3,`absent()` 回执与在场回执恒定键面齐平。★ **定向验收(全部真跑)**:`tests/v3331_m4o3_event_explanation.test.mjs`(26 条,含真源码破坏负控制 + H5 判据纯度 + H6 工具两向自证 + 版本锚 `QA_VERSION === 3` 当版持有、v3330 出生版锚交棒「不低于 2」);与 v3330 合计定向 **54/54** 全绿;宿主基线类定向 **25/25** 全绿(基线重建至 v3.331.0:19244 行 / 728 成员,行预算 19644,成员上界 753)。★ **诚实边界**:真实宿主 UI 与真实模型问答**未跑**;全量 `npm test` 按纪律集中到第四期收口点跑一次(本版曾误启动一次、按铁律中止,结果不作验收);本版**全量待验**。
> **历史留痕：v3.330.0 —— 第四期第二项 M4-O2:问句保留主题、多人物与时点(P0 / L)**(第四期产品主线包A第二项)。★ **修的是什么(修前实测,不是「顺手重构」)**:`evidence-query.js` 的问句面在五个格子上丢信息 —— ① **首个子串命中获选**(顺序依赖):`knownActors=['林','林安']` 时「林安答应…」选到「林」,**名单顺序一变答案就变**;② **影子名**:短名是长名的前缀 ⇒ 被当成第二个在场者,双人问句读成「两人都在场」;③ **主题恒空**:promise 计划的 `text` 固定 `''` ⇒ 问「答应送什么生日礼物」返回该人**全部**承诺(宽答冒充精确答);④ **双人关系退化**:条件面的 `actors` 是「命中任一」,单条 OR 计划把「甲和乙之间」退化成「甲乙任选其一」;⑤ **相对时点被静默吞掉**:「那时候 / 当年」既不保留也不提示。★ **本刀**:`QA_VERSION` 1 → 2 并新增 `relation` 意图;`planQuestion()` 支持长名优先 + 影子名登记(gap 具名 `actor-shadow`,不静默) + 宿主别名表(`via:'alias'`,纪律不变:没给就不猜) + 主题词 + 相对时点 +多人物 promise/later **每人各一条计划** + 关系两侧拆分(弱形态按**结构**判:两名人名由连接词紧邻,不扩词表);`composeAnswer()` 按引用键求交集分四态(`co-occur` / `no-co-occur` / `partial` / 一侧缺席登记 `relation-side-absent` 缺口)。★ **修中实测的自伤(记录在案)**:主题原与兜底宽查共用同一个 `text` ⇒ 问「那台冰箱」把一次**宽查**上报成「主题 = 那台冰箱」;且功能字原按**位置无关的全局替换** ⇒ 「周三**还**书」的「还」被当功能字剥掉、主题退化成「周三」——问句里最有内容的词反而丢了。修法:`topics`(读数)与 `literals`(兜底宽查正文)**分列**,功能字清理改**只剥词首 / 词尾**(`FNHEAD` / `FNTAIL`),词中实词完整保留;纯骨架问句仍不产主题(不强塞)。★ **宿主接线**:`_qaActorAliases()` 是别名表的**唯一装配点**(只从 `character` 图谱节点的 `data.aliases` 派生「别名 → 本名」一向,本名必须在 `_qaKnownActors()` 里,同名不入表,事件节点不贡献别名,上限 200,取不到即 `{}`);`askMemoryQuestion()` 把它注入规划器,并把 `actors` / `topics` / `timeHints` / `relation` 逐格外送;`memoryQaLine()` 增「关系 <state> 共现 N」读数(共现条数不是「查到几条」的一种说法)。★ **定向验收(全部真跑,读数取自本轮实跑)**:`tests/v3330_m4o2_qa_topic_actors.test.mjs`(**28 条**)真加载`evidence-query.js`(隔离 vm,与生产同形)+ 从 `index.js` 抽**同一份函数体文本**在 `new Function` 里装起来跑宿主侧(不重写宿主逻辑);A1~A5 规划面 / B1 关系四态 / C1~C2 宿主别名装配与出口真跑;**D1~D14 十四条真源码破坏负控制**(锚点真源恰中 1 次 → 破坏副本上重跑**同款真判据** → 必须现形;反向对照原版必过);E1~E4 判据纯度 H5 + 工具两向自证 H6 + 真源锚活 + 40 条问句面自证;F1~F2 版本锚与自防护。★ **本档判据翻修留痕(第一版判据错,不是实现错)**:首版五个判据声明成无参、内部闭包在**原版**模块上 ⇒ 破坏副本被静默丢弃、D 段十条负控制「仍然绿」;另有四个锚点**不可观测**(被兜底路径接住)被换成本轮实测承重的锚(影子名判定 / 别名登记位 / 字符级功能字清理 / 停止词次序),以及宿主夹具两道守卫重叠(事件节点名改已知人名「王五」后两道守卫才各自承重)。★ **同轮结清的欠账**:v3.329.0 M4-O1 收口**漏跑依赖基线的测试面** ⇒ `host_beast_baseline.json` 停在 v3.328.0(18964 / 723),本版重建到 19156 / 727(v3.330.0)并把行上界贴回「实测 + slack」(19364 → 19556),死代码上界按 `--bump` 由 69800 抬到 70314(活跃增长留账);修前实测翻红的判据:v3232 C1 / v3257 C / v3259 C / v3260 C / v3261 C / v3262 C / v3263 C / v3264 C / v3266 C / v3304 B3,修后各自全绿。★ **诚实边界**:真实 SillyTavern 宿主的 UI 操作与真实模型问答**未跑**;全量 `npm test` 按纪律集中到第四期计划收口点跑一次,本版为定向复验,`doc_readings.json` 的全量快照仍停在 v3.328.0(**如实待验,未冒充当版读数**)。本版**全量待验**。
> **历史留痕:v3.327.0** —— E 包记忆侧：设定资料与前史分层导入(M3-X5)+ 章节回顾与可编辑故事年鉴(M3-X7)**(第三期产品主线第四包,两个产品项**同批交付**,新增两模块 `lore-import.js` / `story-annual.js`,`extra_js` 102 → 104)。★ **M3-X5 修的是「设定被当史实注入」**：修前只有 `PrequelSystem.importPrequel(text)` 把整篇文本当一团前情,本刀给四类分层(`setting-rule` / `backstory-event` / `character-bg` / `reference-only`,穷尽且各带 `judgeWhy`)、来源性质三态、段落级来源、受限正文入口即剥(定长掩码)、映射三态、冲突默认不覆盖、变更段四态。★ **M3-X7 修的是「回顾不指向原文 + 作者玩家同形」**：四要素 + 证据绑定(缺据单独计数;ref 带条目类防同楼撞号)、两版可分(无剧透版清空未了事项 + 在场角色白名单 + 泄漏点名)、草稿白名单(`FACT_FIELDS` 一律 `draft-only` 拒,纯函数)、文风面只报读数不改写、过期四态(`gone` / `hash-changed` / `missingChapters`)。两模块均**零依赖 IIFE 双导出**,能力一律经 `deps` 注入;宿主接线 15 项出口 + 两行自检诊断。**诚实边界**：类目判定是关键词启发式(不判「分得对不对」);文风面只报读数(不判「写得好不好」)。本版**全量待验**。
> **历史留痕：v3.325.0** —— **D 包（纠错与日常操作）记忆侧收口：M3-O8 记忆控制中心从技术表变成可操作资料页**（第三期产品主线第四包记忆侧最后一项，**不新增模块**：`manifest.extra_js` 仍 101；增量全落在既有的 `memory-center.js` / `index.js` / `settings-ui.js`）。★ 修前实测三处缺口：① 没有人物 / 事件 / 时间三轴组织（九本账靠人脑拼）；② `row.detail` 动作登了表但 **handler 一处未接**（`grep _memoryCenterHandlers` 返回空）⇒ 点了没反应；③ 批量三档在界面上**没有入口**。★ 四条纪律逐条落测：**一行可属多张、不合并合著页**；**正文三档可分**（`ledger-source` 真原文 / `projection` 投影摘要并自述「不是全文」/ `source-failed` 带 reason / `masked` 两档 **一个字符都不带**）；**浅链与换代链分开说**（`versioned` / `empty` / absent 四态互不同形，**不拿浅链冒充换代信息**）；**批量影响面真读自 `fact-lifecycle`**（撤回含 `delete-source` ⇒ 可逆 0 / 不可逆 2，「隐藏于生成」账本态不动只作用生成面 / 审计 —— 两档不得同形）。★ 验收原文「批量操作失败保留未完成选择」的落点：选区住**状态**里，未完成项仍在选区、逐条具名 `not-on-this-page`，**不静默丢弃**。★ 「进出详情保留筛选与页码」由 `navigate()` 只动组织态保证，并**回报 `kept`**（看不见回报时「保留」与「被重置」同形）。★ 宿主两出口 （`memoryCenterSourceText` 真原文取数口**自包含**：只走既有账本登记表 + `facet.textFields` 单一真源，**不新开跨仓契约面**；`memoryCenterFactState` 引用而非拷贝）+ 四个**可选**依赖（缺席降级并具名，**不进 REQUIRED_DEPS**）+ 诊断行并进组织层读数；面板回写点真读数 4 处、`stepOrg` 5 次、**不重建状态**。★ 成对套件 `tests/v3325_d_pack_memory_center_pages.test.mjs`（15 条，含 12 条真源码破坏负控制），期望值全由 `tools/v3325_probe.mjs` 真跑读数写成。★ 本版自伤七处（判据 / 夹具侧，**与实现缺陷分开记**）：夹具字节阈值抄错、回写点阈值写成「≥6」（真 4，少一处与多一处同形）、`stepOrg` 数错、锚点缩进抄错、破坏锚点顺手删掉判据依赖的那一行（先 TypeError）、遮蔽破坏打在一次写死上（没生效）、**多行锚点又按转义形态计数**（本仓老账）。★ 抬版连带：宿主 18417 → **18512 行 / 686 → 688 成员**（`line_budget` → **18912**，成员面在线内不抬）；活跃代码 66462 → **67071**；在役测试面 305 → **306**。★ 边界：**未跑全量回归**；M3-O8 手机侧消费不在本版。 —— **D 包（纠错与日常操作）记忆侧第一刀：M3-O5 抽取节奏 / M3-O7 可比较修正方案 / M3-X9 局部重提取与原文对照**（第三期产品主线第四包，**新增两模块**：`extraction-driver.js` / `correction-plan.js`；`manifest.extra_js` 99 → **101**）。★ **M3-O5**：五类结构性信号（身份/承诺/物品/关系/事件）**恒即时** —— 三档同一输入下 `due` **逐字同形**（档位只动平淡楼的批处理到期楼层，永远动不了关键事件）；**溢出不是丢**（溢出条全在返回值里 + 逐条标 `overflowToNextBatch` + 带**同一**到期楼层 + `deferredBatchCalls` 如实计数）；**空读与平淡严格分形**（`unreadable` / `noFloor` 单列，读失败 ≠ 读到了 0）；档位词表**可关**（注入空数组即该类彻底关闭）；**不拿省调用数当验收**（`savedCalls` 是读数不是成绩）。★ **M3-O7 + M3-X9**：范围归一与暂存**只有一份真源**（`floorRange()` / `stage()`）、**未圈范围不产提案**（「没选范围」≠「全选」）、**确认前不写**（`writes` 恒 0）、**以事实键为轴幂等**（重试只出一项）、对照**三态互不同形**（absent / unmeasurable / measurable）、与原文对照**四态各自可达**（**冲突不得被吞进「替换」**）、撤配置与撤事实**分成两个 token**（两个撤销凭证、两种 kind）。★ **本版内核真缺陷一处**（由真源码破坏负控制当场抓出）：`proofWhy` 在 `cmpState === 'unmeasurable'` 分支直接读 `tr.compare.reason` —— 该态恰是「对照读数缺失」，`compare` 不存在时当场 TypeError（**为「判不了」而设的那一格，在判不了时崩**）；修法改防御性取值。★ **本档自伤七处**（判据/夹具侧，与实现缺陷分开记）：夹具 10 楼文本不含 `item` 词表词 / balanced 档真溢出组合写成吃 2 留 1（真溢出要 4 条才出现）/ `SillyTavern` 挂在方法对象上而真源读的是**闭包捕获的 window**（窗口取数恒 0 条）/ 三种范围形态 reason 期望写错 / 诊断行期望手抄实现注释（改为与真跑输出逐字相等比对）/ `regen.untouched` 未减圈定条 / **判据纯度检查未按转义形态计数 ⇒ 恒 0 命中、纯度检查反向空转**。★ 成对套件 `tests/v3324_d_pack_extraction_driver.test.mjs`（**38 条**，含 13 条真源码破坏负控制 + 逐条反向对照 + H5 判据纯度 + H6 工具两向自证 + 当版版本锚），期望值全由 `tools/v3324_probe.mjs` / `tools/v3324_host_probe.mjs` 的**真跑读数**写成。★ 两处**出生版读数锚**（v3323 的 `extra_js.length === 99` 与「三模块在绝对末尾」）按 v3296 先例交棒当版（前者改守下界、后者改守「**连续且整体位于末尾两模块之前**」）。★ **抬版连带读数**：宿主 18232 → **18417 行 / 680 → 686 成员**（`line_budget` 18632 → **18817**；成员面 686 <= 710 在线内**不抬**）；活跃代码 65332 → **66462**（实测 66062 + slack 400，文件 100 → 102）；基线三条读数由脚本自动同步并当场自证。定向复验：当版档 38/38、v3323 32/32、v3321 24/24、v3322 6/6、v3209 15/15；**审计门禁 scan_*.mjs 全跑 0 红**。★ 边界：**未跑全量回归**；M3-O8 与手机侧 R3-O5/O9/X8 在其后。
> **历史留痕：v3.324.0** —— **D 包（纠错与日常操作）记忆侧第一刀：M3-O5 抽取节奏 / M3-O7 可比较修正方案 / M3-X9 局部重提取与原文对照**（第三期产品主线第四包，**新增两模块**：`extraction-driver.js` / `correction-plan.js`；`manifest.extra_js` 99 → **101**）。★ **M3-O5**：五类结构性信号（身份/承诺/物品/关系/事件）**恒即时** —— 三档同一输入下 `due` **逐字同形**（档位只动平淡楼的批处理到期楼层，永远动不了关键事件）；**溢出不是丢**（溢出条全在返回值里 + 逐条标 `overflowToNextBatch` + 带**同一**到期楼层 + `deferredBatchCalls` 如实计数）；**空读与平淡严格分形**（`unreadable` / `noFloor` 单列，读失败 ≠ 读到了 0）；档位词表**可关**（注入空数组即该类彻底关闭）；**不拿省调用数当验收**（`savedCalls` 是读数不是成绩）。★ **M3-O7 + M3-X9**：范围归一与暂存**只有一份真源**（`floorRange()` / `stage()`）、**未圈范围不产提案**（「没选范围」≠「全选」）、**确认前不写**（`writes` 恒 0）、**以事实键为轴幂等**（重试只出一项）、对照**三态互不同形**（absent / unmeasurable / measurable）、与原文对照**四态各自可达**（**冲突不得被吞进「替换」**）、撤配置与撤事实**分成两个 token**（两个撤销凭证、两种 kind）。★ **本版内核真缺陷一处**（由真源码破坏负控制当场抓出）：`proofWhy` 在 `cmpState === 'unmeasurable'` 分支直接读 `tr.compare.reason` —— 该态恰是「对照读数缺失」，`compare` 不存在时当场 TypeError（**为「判不了」而设的那一格，在判不了时崩**）；修法改防御性取值。★ **本档自伤七处**（判据/夹具侧，与实现缺陷分开记）：夹具 10 楼文本不含 `item` 词表词 / balanced 档真溢出组合写成吃 2 留 1（真溢出要 4 条才出现）/ `SillyTavern` 挂在方法对象上而真源读的是**闭包捕获的 window**（窗口取数恒 0 条）/ 三种范围形态 reason 期望写错 / 诊断行期望手抄实现注释（改为与真跑输出逐字相等比对）/ `regen.untouched` 未减圈定条 / **判据纯度检查未按转义形态计数 ⇒ 恒 0 命中、纯度检查反向空转**。★ 成对套件 `tests/v3324_d_pack_extraction_driver.test.mjs`（**38 条**，含 13 条真源码破坏负控制 + 逐条反向对照 + H5 判据纯度 + H6 工具两向自证 + 当版版本锚），期望值全由 `tools/v3324_probe.mjs` / `tools/v3324_host_probe.mjs` 的**真跑读数**写成。★ 两处**出生版读数锚**（v3323 的 `extra_js.length === 99` 与「三模块在绝对末尾」）按 v3296 先例交棒当版（前者改守下界、后者改守「**连续且整体位于末尾两模块之前**」）。★ **抬版连带读数**：宿主 18232 → **18417 行 / 680 → 686 成员**（`line_budget` 18632 → **18817**；成员面 686 <= 710 在线内**不抬**）；活跃代码 65332 → **66462**（实测 66062 + slack 400，文件 100 → 102）；基线三条读数由脚本自动同步并当场自证。定向复验：当版档 38/38、v3323 32/32、v3321 24/24、v3322 6/6、v3209 15/15；**审计门禁 scan_*.mjs 全跑 0 红**。★ 边界：**未跑全量回归**；M3-O8 与手机侧 R3-O5/O9/X8 在其后。
> **历史留痕：v3.323.0** —— **C 包（群像与关系体验）记忆侧三项：M3-X2 关系变化史 / M3-X3 因果链导航 / M3-X4 视角记忆卡**（第三期产品主线第三包，**新增三模块**：`relation-history.js` / `causal-chain.js` / `perspective-card.js`；`manifest.extra_js` 96 → **99**）。★ **M3-X2**：`pairOf` 用**字典序固化的无序键**、两侧看法逐侧保留（**明确不做好感度**）、三类未解决各自可达、**出处不明恒排末尾且单列**、自指单列、`byName` 可见、`asOf` 语义是「**截至该楼层已经发生**」（无楼号的边**不进任何时点**，时点读不到不猜 0 楼）。★ **M3-X3**：判空只看**前缀之后有没有内容**（首跑自伤：按 kind 全名比长度会把约定与事件**整类丢掉**而面板照样正常）、收口四分互不同形、**推测边与已确认边结构分离**、`traceBack` 只走已确认边、畸形边三态各自计数；**修真缺陷**：候选出口要求 `actor` 字段相等而伏笔**没有这个字段** ⇒ 提议**恒空**（导出了、有判据、真数据上一次都不触发），改为「主体名从约定取、到伏笔文本里找，单字不收」，并补 `selfCheck` 第⑤条 `proposalsReachable`。★ **M3-X4**：四格判据 + **判不开的动作不落任何一格**（进 `unrecorded` 且处处可见 —— 把「我们没记过」写成「确实不知道」是本仓最贵的无据断言）、via 空 ⇒ 亲历但标 `viaUnknown`、无楼层不进任何时点、`contrast` 四类差异（**刻意不合成**，误信侧单列）。★ **本版真缺陷一处**（当版套件 D1 首跑抓住）：三个出口**缺席面的键面与在场不同**（缺 `version`/`degraded`，多 `ok`/`reason`）—— 与 v3.322.0 的 `memoryQaAnswer` 缺 `knownActors` **同族**；修法＝按在场键序重排 + `version: 0` + 时点面补 `floor:null`/`floorKnown:false`。★ **本档自伤四处**（判据/补丁侧，分开记）：锚点串含判据消息原文破纯度、「视为相等」的假破坏、切断花括号的 SyntaxError 破坏、`break` 版假绿。★ 成对套件 `tests/v3323_c_pack_group_relation.test.mjs`（32 条，含 7 条真源码破坏负控制），期望值全由探针真跑读数写成。★ 跨仓面 +3（`none@0` 如实写——下游未接入）；两处出生版读数锚（v3321 / v3322 的 96）按 v3296 先例交棒当版。★ **抬版连带读数**：宿主 18003 → **18232 行 / 669 → 680 成员**（`line_budget` 18403 → 18632、`member_ceiling` 675 → **710** —— 成员面本版**越界成立**，行数面仍在线内但余量只剩 171，两条动机都写进基线 `reason`）；活跃代码 63705 → **65332**（实测 64932 + slack 400，文件 97 → 100）；基线三条读数由脚本自动同步并当场自证。定向复验：当版档 32/32、v3321 24/24、v3322 6/6、v3257/v3259/v3260/v3116/v3232/v3205/v3247/v3209 全绿、**审计门禁 scan_*.mjs 全跑 0 红**。★ **本档自伤第五处（文档侧）**：顶节条数写成 `（**32 条**` 使 D9 探测器**一个自述都读不到**（报的不是条数写错而是「探测器可能已失效」），已恢复 `（32 条` —— 判据错与实现错分开记同样适用于文档面。★ 边界：**未跑全量回归**；手机侧 R3-O3/X3/X5 在其后。
> **历史留痕：v3.322.0** —— **B 包收尾：M3-X1 宿主出口判据面 + 读侧缺口具名化（含一处真缺陷）+ 宿主上界/基线交棒**（改既有 `index.js`，**不新增模块**）。★ **修真缺陷**：内核缺席的降级回执只有 14 键、在场 15 键（缺 `knownActors`）—— 跨仓登记表的 `memoryQaAnswer` 行**逐字声明「恒定键面」**，下游按同键断言的前提被破（「模块没加载」被读成「一个名字都没有」）；修法＝缺席路径就地取真读数 + 整段 try **不改写归因**。★ **读侧缺口具名化**：`no-rows` 的 why 原是模板句「九账全部取不到」，与场景不符（本问只扫一本账、另八本**没参与**）；现按被跳过账表收集 → 新装配点 `_qaHelpDeps()` 逐账三态（有内容/空/读不到）→ 具名读数，**「空账」与「读不到」分列**。★ **不扩权**（深扫无 `rows`/`row` 键）+ **不自算第二真源**（上次读数只存读数）。★ 成对套件 `tests/v3322_qa_host_exit.test.mjs`（6 条，含真源码破坏负控制）；**G 段自 v3321 迁出** —— 历史档只锁自己的出生版本，当版锚须住当版档案，迁移后 v3321 回到 24 条。★ **本版自伤五处**（探针装配错 / 合成面 coverage 假接线 / 越权加摘要 / 锚点缩进 17≠16 / 判据被 no-rows 误伤 —— 判据错与实现错分开记）。★ **宿主上界交棒**：v3.321.0 接线后 17927 行已越登记上界 17801（v3264 D 系欠账），本刀 +76 ⇒ 实测 18003/669；按 v3296 先例抬到 18403（基线读数由探针重建脚本重绑，此前停 17611/659）。★ 边界：**未跑全量回归**；手机侧 R3-O4/X1/X2 在其后。
> **最近更新：v3.321.0** —— **B 包（长篇记忆与往事查询）记忆侧四项：M3-O1 召回融合 / M3-O4 摘要保底 / M3-O6 大库查询 / M3-X1 带证据问答**（第三期产品主线第二包，改既有四文件、**不新增模块**）。★ **M3-O1**：`fuseCandidates` 近重复抑制（留分更高那条，确定性）+ 角色/事件覆盖（把**被去重误删的分组代表找回来** —— 去重的副作用由覆盖补）+ 未结关键事实上浮；**无键不分组**（没有 eventId/actor 的条目不得被当同一件事）；接线在 `intentRerank` **之后**、`_finalize` **之前**（避开 v3185/v3186 锁定的提权次序），且**刻意不传 budget**（注入预算 owner 是既有注入面，召回侧再截就是第二个真源）。★ **M3-O4**：`keepSalient` 四类关键句（未结>转折>原话>数字，**单一归档**）+ `renderSalient`（尾部 `【关键保底】` 段，无句可保返回空串不留空标题）+ `salienceIndex`/`lookupSalient`（**只存 2-gram 关键词、不复制正文**）；**差量更新**（上一版摘要作摘要通道首元素，不做每轮从零重写）；**保底段附在截断之后**；`LOSS_KEYS` 追加 `unrecoverableSources` ——「保住了」与「保住了但回不到出处」不得同形。★ **M3-O6**：`QUERY_VERSION` 2→3；账条件收窄（被跳过的账 `state=skipped`+`total=null`，「被筛掉」≠「不存在/空」）；逐账投影缓存（指纹是**启发式**，只用于复用投影、绝不用于「账没变所以不用重算」；命中时行浅拷贝 + `_score` 归零）；`assemble` 抽为 query/queryAsync **唯一真源**；协作式查询分片让出、**取消报 canceled + processed 不报 empty**；`continueWith` **触顶才给**。★ **M3-X1**：`planQuestion`（**只产出 FILTERS 登记键**，未知意图进 gaps）+ `composeAnswer`（**只基于已许可结果行**，每句带 ref/ledger/floor）；**认不出人名不编**（只从 knownActors 认原名）；「后来怎样」**不做互斥过滤**；遮蔽行只报存在性 + 知识范围。★ **本版自伤四处**（成对套件首跑跑出，判据错与实现错分开记）：① **O4「原话」类恒空**（实现真缺陷：切句不区分引号内外，`「我不等了。」` 被切成两半、两半都不含成对引号 ⇒ `QUOTE_RE` 永不命中 —— 恒为空的读数混在健康读数里、看起来完全正常）；② **O6 缓存三态塌陷**（实现真缺陷：宿主刚 new 的空对象与旧格式压进同一个 false ⇒ **首跑永远进不去缓存路径**）；③④ 两处是**本档判据自己的期望写错**（把「保底段必在额度之外」与「未结必排第一」当成恒真 —— 判据错与实现错必须分开记，否则会去改对的实现）。★ 成对套件 `tests/v3321_b_pack_long_memory_time.test.mjs`（24 条，含 5 条真源码破坏负控制）；定向复验新增档 24/24 与 11 套既有相关档全绿。★ 边界：**未跑全量回归**；M3-X1 目前只落查询/合成两面，宿主出口与手机侧在其后。
> **历史留痕：v3.320.0** —— **A 包（身份、时态与聊天记忆）记忆侧三项：M3-O2 候选保真 / M3-O3 时段身份 / M3-O9 时态一致**（第三期产品主线第一包，改既有四文件、**不新增模块**）。★ **M3-O2（候选保真）**：`unified-recall.js::nodeToCandidate` 修前把节点压到 **200 字**且只切 8 条 secondary，**候选层的损失无法被后续任何评分挽回** —— 评分只能排它拿到的候选，「超过 200 字才出现的关键结论」在候选化那一刻就不存在了，后面的 rerank 再准也没用。修法：**检索面与展示面分离**（`searchText` 保留完整正文 4000 字、`content` 仍守 200 字既有契约不动；`ai-select.scoreEntry` 的词项命中判定改走 `searchText`）+ **结构化关键字段索引**（身份/时间/**关系/结果**四类 —— 修前只有身份与时间进了 primary，关系与结果字段在候选层就已消失）+ **完整源 ref**（选中后能回到出处）+ `extractEvidenceSentences`（完整原文**不全量注入**：按任务预算取证据句，**不切断否定与数额** ——「他不想还钱」截成「他想还钱」是语义反转、「欠 3 万」截成「欠 3」是数额失真，两者不是少信息而是信息变错）+ `dedupeByEvent`（同一事件的多节点不再各占一个候选位；**无事件键的节点一律保留** ——「没有键」不等于「属于同一件事」）。★ **M3-O3（时段身份）**：`entity-semantic.js` 补别名的**项目 / 分支 / 有效时段 / 称呼者范围**（`aliasMeta`，**aliases 形状不动**仍是字符串数组 ⇒ 老状态零迁移）+ `resolveEntityAt`（四类阻塞各自可归因：project / branch / time / speaker / reveal）+ `referentCandidates`（「她/老师」结合**在场者与最近指代**生成候选，歧义时返回多条而不是猜一个）+ `markReveal`/`setAliasScope`/`removeAliasScope`/`removeAlias`（**撤回范围 ≠ 删别名**，两者分开）。★ **本版最贵的一条**：「已揭穿身份**不反向泄露到旧楼**」—— 修前别名一旦登记就永久可查，伪装期的旧楼会因为后来的揭穿被反向改写。现在失败态拆成 **missing / ambiguous / scope-excluded / reveal-blocked**，**「名字存在但被时段排除」与「登记表里根本没有这个名字」处置完全不同，不得同形**（`scope-excluded` + `blockedBy:'reveal'`）。宿主侧 `buildAliasMap` 按当前剧情楼层过滤（**签名不改**：它是 v390_alias 花括号计数式 `extractMethod` 的 marker；时点走 `this._aliasMapAt`），且**裸 engine 容灾**（宿主成员缺席 ⇒ 按「未给时点」处理而不是抛）。★ **M3-O9（时态一致）**：`fact-version.js` 新增 `readAt`（整账按时点分类读：current / historical / ambiguous / none-at / unversioned / none-trusted / none-revoked）+ `classifyIntent`（现在/当时/回忆；**时间未知不补现实日期**）+ `resolveQuery`。★ **修前实测的真缺陷**：后补一条 **from 更小**的旧事实（用户回头补叙「她以前住北京」，from=5），因为新值不比旧的晚 ⇒ 不换代（写侧既有契约），而它 `to == null` ⇒ **一直开着、同时覆盖 now** ⇒ 「现在住哪」被拖成 **ambiguous**。★ **修法纪律（本版最该记的一条）**：`v3210_memory_type` 有 3 条**既有锁定**断言要求 auto 策略「新 from 更小 ⇒ 不换代（并存）」且被登记为「与 prefer-new 的分界」—— 改 `assertFact` 会把那三条打红。**那是把写入侧的既有语义换掉，不是修缺陷**，故**写侧一字不动**，改到**读侧**：一条 from 更早的开放事实，在同谓词上已存在 from 更晚的开放事实时，按**剧情有效时间**不可能是「现在」——这不是替用户裁决，是时序事实。判据只在「from 都存在且互不相同」时生效；from 相同/缺失 ⇒ **仍 ambiguous**（判不了就不裁决）。更早那条进 `staleOpen`/**可见可归因**，回看旧时点仍查得到。★ **时段映射用于实际注入**（计划验收原文）：`typedFactsBlocks` 的载荷准入挂**第二道** `gatedStale`，判据**复用 `readAt` 同一份实现**（不在宿主再写一遍时序规则，否则「查询答对、注入答错」）。★ **本版自伤五处（附修法，全部由探针/门禁跑出来，不是推演）**：① 证据句的查询词提取首版用 `[\u4e00-\u9fa5]{2,}` —— 中文无空格，`她签约了吗` 被整体当一个词、命中判定恒假，**「按查询词挑句」实际退化**；修法对齐 `ai-select.extractQueryTerms` 既有口径（段长 > 6 才做 2-4 字滑窗），不另立第二套分词真源。② 意图优先级首版把「回忆动词」排在「时间副词」之前 ⇒ `我记得她以前说话很轻` 判成 flashback、`她现在还记得吗` 判反；修法**时间副词压过回忆动词**（「记得/想起」是引语框架，只说明这句是回忆，**不定**回忆的是哪一段）。③ 首版在注释里写了带裸花括号的字面量 ⇒ v390_alias 的**花括号计数式方法提取**被带偏、方法体被截在注释中间；④ 首版把 `gated` 一行拆成两行 ⇒ v3299 负控制 I1 的破坏锚点**命中 0 次**、那道门**静默失效**（门空转比门红危险得多）；⑤ 首版 `buildQuery` 里无条件调 `this.currentStoryFloor()` ⇒ 裸 engine 容灾红。★ 成对套件 `tests/v3320_a_pack_identity_memory_time.test.mjs`（25 条，含 **6 条真源码破坏负控制** + 逐条反向对照「原版同判据必须过」+ 判据纯度）。三个行为探针（`/tmp/m3o2_probe.mjs` 21 项 / `m3o3_probe.mjs` 27 项 / `m3o9_probe.mjs` 26 项）全绿；定向 13 套既有套件全绿（含 v3210 189/189、v3299 14/14、v390_alias 5/5 复绿）。★ 边界（诚实）：本版**未跑全量回归**（按实施期铁律，计划收口时才跑一次）；`readAt` 是**新增读面**，其消费点目前只有注入面准入与宿主出口，手机问答侧要等 B 包接上。
> **历史留痕：v3.319.0** —— **CI 忠实性修复**：跨仓双仓首跑，memory-plugin CI 红而本机绿。拉云 runner 真实日志（jobs/<jid>/logs 返 302，须手取 Location 直取 SAS）得决定性读数：**串行也是 297/299、失败 2** —— 推翻上一轮「并发抖动假红」假设。两处真缺陷：① `tests/audit/perf_probe.cjs` 把仓库根写死成本机 checkout（本地该路径恰是本机 ⇒ 探针读的是**主仓**而非被测树；干净检出/CI 上 require ENOENT ⇒ v3229 B2 必红）；② `tests/run.mjs` 的 `firstError()` 与报告器耦合（spec 首行是 AssertionError；TAP 首行是不含断言原文的标题行 ⇒ v3241 D1 必红）。修法：探针根按文件位置推导；`run.mjs` 新增 TAP 形态分支 + ERR_SIG 兜底（报告器无关）。忠实复现：下载 **Node 20.20.2 (arm64)** 逐字复现与 CI 一字不差的失败线；**补 P7 闲区**（`scan_cross_repo_binding` 的 P1 用 `CODE_EXEMPT=/tests\/audit\//` 把整个审计面豁免 ⇒ 探测面 64 个模式文件纳入，实测 0 命中属安全扩面）；成对套件 `tests/v3319_ci_faithful_probe_and_attribution.test.mjs`（9 条）+ v3204 15b/15c / v3241 D3 加固。
> **历史留痕：v3.318.0** —— **M-O2 收口（真浏览器切片）**：真 Chromium（CDP 直连，零依赖）+ 真 SillyTavern 1.19.0 上把控件交互跑成 **33 条真读数**（探针 `tests/audit/_mo2_realbrowser_probe.mjs`，`_` 前缀不进 npm test）：真鼠标开 FAB 与菜单 / 真鼠标点 checkbox 与 `#ls-save` / 真键盘输入 / 真 `localStorage` 回读 / 真 Emulation 320x640 / 重开保留。★ **当场抓到产品面真缺陷**：320px 下 `.ls-hint` 的长不可断 ASCII 串无断行、且 `.ls-row` 标签容器 `min-width:auto`（flex 子项不允许收缩到内容以下）⇒ 行被撑到 474px，把 44px 的 checkbox **顶出视口**（left=449 > 320，读数 160/161）。修法两处配套（断行 + `min-width:0`），修后 **161/161 且 overflow 空**；新门禁 `tests/audit/scan_ui_narrow_layout.mjs`（N1 断行在册 / N2 flex 收缩 / N2b 可断 / N4 内容驱动 / N5 面自证）配成对套件 `tests/v3318_ui_narrow_layout_gate.test.mjs`（8 条，两条真源码破坏负控制）。第二期两条计划至此**全部交付**。
> **历史留痕：v3.317.0** —— **M-X3（第二期拓展计划）项目 / 卷 / 章节管理面**：本仓此前能答「这一卷怎么接出去」（X7 分卷接续，v3.293）—— 卷目录 / 接续包 / 预览 / 提案 / 撤销都在，但**用户层不存在**：修前全仓 `normalizeProject` / `listVolumes` / `volumeAt` 在 `index.js` 里命中 **0 次**，项目只能由调用方临时拼一个 `{ projectId, volumes }` 现喂；四个后果逐条可指认：① 「创建项目 / 给卷起名 / 把这一支挂到项目上」没有落点；② 多个项目并存时无隔离读数（「未选项目」与「选了但零条」在读数上同形）；③ 同名角色跨宇宙没有可判之处 （owner 键只有 id / name，宇宙在全仓 `index.js` 命中 0 —— 靠名字对表就自然串了）；④ 导入幂等账与撤销来源边界散在调用方。本刀交付 `project-registry.js`（纯函数、零依赖、双导出、IIFE、896 行 / 36 个导出项，导出面指纹 `021bc091`）+ 宿主三处接线（模块级取库口 `_projectRegistryLib` / 唯一装配点 `_projectRegistryDeps` / 十四出口 + 自检面一行诊断）：★ **未选项目维持完全隔离**（验收①）—— `scopeOf` 未选 ⇒ `selected:false` 且 `verdict:'isolated'`（**不是** indeterminate；项目门在身份门**之前**：身份判不了也不得把隔离塌成判不了）；`planImport` 未选 ⇒ `blocked/no-project`（不产计划，也不产空计划）。★ **同名不同宇宙不合并**（验收②）—— 身份键恒含 universe（`u:<universe>|id:<owner>`，宇宙缺省取项目 id —— **项目即宇宙**）；`mergable` 对同名不同宇宙给 `different-universe`、对同宇宙仅名字对得上给 `name-only`，两者**不同形**（处置相反：前者是两个世界，后者是同一世界里的候选，须用户显式认领）。★ **重复导入幂等 + 撤销有来源边界**（验收③）—— `importIdOf` 由包身份件确定性派生；`seen` 命中 ⇒ `duplicate`（`ok:true`，**正常读数**，不与被挡同形）；无来源件 ⇒ `unbounded` 且**拒撤**（无边界不能撤 —— 撤销不是整批回滚更不是清库）。★ **旧源删除后不伪装仍可跳**（验收④）—— `relink` **不重写判定**，把 X7 `resolveSourceState` 如实镜像（**单一真源**）；X7 缺席 ⇒ `unknown / navigable:false / liveness-unavailable`（不假装还在、也不假装可跳）。★ **零写**：不改传入的 project / pack / seen（三处快照），`planImport` 恒带 `zeroWrite:true`，源码零 require / fetch / localStorage。★ **离线**。成对套件 `tests/v3317_project_registry.test.mjs`（15 条，含十二条真源码破坏负控制 + 正控制地基 + 判据纯度）。★ 跨仓面：本版**不新增外供面**（M-X3 拓展计划原文未要求），只把 `memoryToolsEnvelope` 行的 `producer_version` 同步抬到本版。
> **历史留痕：v3.316.0** —— **M-X7（第二期拓展计划）提取质量反馈与可控策略配置**：本仓此前能答「**召回链路**断在哪一格」（X8 召回解释，v3.294），也能做「同一候选 × 多套配置」的容量对照（X3），但**答不了 M-X7 点名的这一问**：**这次为什么提取错了、怎样减少同类错误**。修前「漏记 / 错记 / 错角色 / 旧事实未被替换 / 不应记录」五种错法在读数上**同形**（都只是「结果不如意」），无法按类减少；想改只能直接改配置 —— 而**「改了到底有没有用」无处证明**。本刀交付 `extract-feedback.js`（纯函数、零依赖、双导出、IIFE、625 行 / 27 个导出项）+ 宿主十出口 + 自检面一行诊断：★ **五类错法各自可指认且指向不同面**：漏记 → 提取触发面 / 错记 → 提取内容面 / 错角色 → 身份消歧面 / 旧事实未被替换 → 事实换代面 / 不应记录 → 受控准入门 —— 得压成一句「提错了」就等于「反馈收了一堆，但改哪个开关无从判断」。**未知类别不落默认档**；多信号共存一律**判不了**（按一面处置会改错地方）。★ **建议的背书只看真读数**（M-X7 验收②「建议来自真实 trace 与对照重跑，不由模型编原因」）：`proven`（对照重跑可测 **且** 留出集真跑且改善）/ `overfit`（对照跑过但留出集未验或**退化** ⇒ 只优化了当前样本）/ `unproven`（无对照读数 ⇒ **判不了**，不编原因）。★ **自动调参默认关闭**（验收③）：`apply.auto` **恒为 false**（不是「默认值是 false」），`autoParamTuning:false` 随每一处返回面带出。★ **反馈不得直接成为历史事实**（验收①）：返回面显式带 `writesHistoryFact:false`；原文依据只存**摘要**（≤ 80 字，不整段携带 —— 反馈面不是第二条事实库）；类别判不了时**只给一条**「先修归类」，绝不在错的类别上编配置建议。★ **应用闸四态不得压格**（等待用户 ≠ 不可用 ≠ 判不了）：`awaiting-user` / `planned` / `not-applicable` / `indeterminate` —— 无背书时哪怕用户已确认也**不得可应用**（判不了，先补读数）。★ **坏源降级**（验收③）：轨迹入参畸形 / 对照不可测 ⇒ 一律 unproven 且**不外抛**。★ **零写**：不改传入的 list / item / trace（三处快照），源码零写口 —— 写法归 owner 侧经既有门。★ **离线**：源码零 require / fetch / XMLHttpRequest / localStorage / indexedDB / WebSocket。成对套件 `tests/v3316_extract_feedback.test.mjs`（16 条，含八条真源码破坏负控制 + 正控制地基 + 判据纯度）。★ 跨仓面：本版**不新增外供面**（M-X7 拓展计划原文未要求），只把 `memoryToolsEnvelope` 行的 `producer_version` 同步抬到本版。
> **历史留痕：v3.315.0** —— **M-X5（第二期拓展计划）角色知识传播的可见范围预演**：本仓此前能答「这条知识在第几楼、从谁、经哪条原始证据取得的」（X5 知识轨迹，答**过去**），但**答不了「下笔之前先看一眼」** —— 若按这条路传播下去，谁的认知会从哪一格变到哪一格？缺这一层的后果是**事后才知道越界**：秘密已经泄进公开线、误信已经落成「已知」，才发现某个角色根本不该知道（那时只能回滚，而回滚不覆盖已注入的上下文）。本刀交付 `knowledge-preview.js`（纯函数、零依赖、双导出、IIFE、591 行 / 27 个导出项）+ 宿主七出口 + 自检面一行诊断：★ **五条传播路径各自可达且取法不同**：`public`（参与者 + 目击者）/ `relay`（转述人）/ `private`（私聊对象，**不扩散**）/ `misbelieve`（误信）/ `correct`（纠正）—— 四张表（方向 / 动作 / 理由码 / 途径）逐条对齐，**未知路径不落默认档**（写错路径名不再静默扩面）。★ **五档互斥**：`would-affect` / `no-change` / `would-reveal-secret` / `would-break-boundary` / `indeterminate`，且「判不了」**单独一档**（不得并入「改不动」—— 本仓最贵的老账）；面级档**认最坏一条**（indeterminate > 泄露 > 会变 > 改不动），不拿「大多数没事」把判不了淹没。★ **严格分离两面**：作者预览面带理由 / 途径 / 动作 / 证据键 / 改法建议；角色生成面**只带 who / after**，其余收敛成 `withheld` 计数，且禁止键表是**独立字面量真源**（不由作者面键集派生）。★ **零写**：预演不改传入的 payload / trace / opts（三处快照），**只产提案**，写法归 owner 侧经既有门。★ **同源不重复造证据**：同证据键 + 同角色 + 同动作 ⇒ `no-change / evidence-already-recorded` 并计 `duplicateEvidence`（M-X5 验收②「同一传播事件不生成多条重复证据」落在实现上）。★ **判不了就不假装判得了**：轨迹模块缺席 ⇒ 整面 indeterminate + `decidable:false` + 理由 `trace-module-absent`（**不假装改不动**）；碰秘密但边界无从判（无账 / 条目被剥空）⇒ `boundary-unjudgeable`（**不假装没边界**）；纠正无 misbelieve 前提 ⇒ `nothing-to-correct`。★ **离线**：源码零 require / fetch / XMLHttpRequest / localStorage / indexedDB / WebSocket。成对套件 `tests/v3315_knowledge_preview.test.mjs`（12 条，含七条真源码破坏负控制 + 正控制地基 + 判据纯度）。★ 跨仓面：本版**不新增外供面**（M-X5 拓展计划原文未要求），只把 `memoryToolsEnvelope` 行的 `producer_version` 同步抬到本版。
> **历史留痕：v3.314.0** —— **M-X6（第二期拓展计划）手机事实桥 2.0（确认 / 撤回 / 双向回执）**：本仓此前能判「这条算不算事实」（X4 八栏身份 + 五态来源 + 五档裁决），但**判不了三件事** ——裁决之后**用户确认或拒绝**这一环在哪（X4 只有一个 `userConfirmed` 布尔钩子）；手机侧**编辑 / 删除 / 撤回**后记忆侧如何换代或撤回（X4 只把 `retracted` 一并拒掉，**没有换代链**）；记忆侧的**最终状态如何回传手机侧**（X4 全库**零回执面**）。缺这三环的后果是**桥的单向化**：手机侧只知道「送出去了」，不知道「记忆侧到底收没收、是不是还作数、我改了它知不知道」。本刀交付 `phone-fact-bridge.js`（纯函数、零依赖、双导出、595 行）+ 宿主七出口 + 自检面一行诊断：★ **证据守卫是结构硬守卫**：预测 / 报价 / 草稿三档**永不变事实**（X4 的 SOURCE_POLICY 对这些来源恒 `isFact:false`），故与用户是否接受**无关** —— 用户点接受也推不动（这是「不自动变成事实」的强形）；三档各自可达且理由不同形，不得都压成一个笼统词。★ **生命周期四态互不同形**：`accepted` / `rejected` / `pending` / `revoked`，且「判不了」（准入模块缺席）是**第三态**（`decidable:false`）—— 不假装 pending、不假装 rejected（本仓最贵的老账）。★ **回执只读**：`receiptFor` 返回**新对象**（绝不改传入的 fact / admission），理由必须取自 `RECEIPT_REASONS` **十条穷尽词表**（任何非 accepted 回执不得现编字符串），并自述 `nextStep`（这条手机侧该拿它怎么办）—— 手机侧不必猜包内的 X4 词表。★ **编辑换代与撤回不同形**：编辑 ⇒ `supersede`（留旧条、记换代链）；删除 / 撤回 ⇒ `withdraw`（不留）—— 把「改了口径」与「从来没有过」压成一件事会丢掉换代链；二者以同一 `rootEventId` 为轴（跨平台转发只进一次），计划**纯函数零写**（写法归 owner 侧经既有门）。★ **单装可解释降级**：依赖只一件（`FACT_ADMISSION`），缺席 ⇒ `bridgeState` 报 `indeterminate / admission-unavailable`（**不假装能判**，与 M-X8 的 migration-unavailable 同纪律）；桥能力三态 `absent` / `legacy`（桥在但缺回执面，旧版手机）/ `capable` **不得压成一态**。★ **离线**：源码零 `fetch` / `XMLHttpRequest` / `localStorage` / `indexedDB`。成对套件 `tests/v3314_phone_fact_bridge.test.mjs`（13 条，含六条真源码破坏负控制 + 正控制地基 + 反向对照 + 判据纯度）。★ 跨仓面：`open_face_registry.tsv` 新增第 7 面 `phoneFactReceipt`（consumer `none@0` —— 下游未接入，如实写不假装已在消费），`memoryToolsEnvelope` 行 `producer_version` 同步抬版。
> **历史留痕：v3.313.0** —— **M-X8（第二期拓展计划）版本化记忆包与跨设备迁移**：本仓此前能把「上一卷说了什么」接下去（X7 卷接续包），也能源在同一宿主的 localStorage 存命名检查点（R4-C），还有结构代际迁移注册表（v3.209）—— 但**没有任何一处**能把项目 / 角色 / 事实与知识边界打包成**可带走的版本化件**，也**没有一处**回答「用户从别的设备带回来的包能不能收、要不要迁、会不会静默丢字段」。本刀交付 `memory-package.js`（纯函数、零依赖、双导出、705 行）+ 宿主五出口 + 自检面一行诊断：★ **准入三态** `current / migrate / reject`，迁移路径一律**问** `schema-migration.plan()`（结构代际单一真源），它缺席 ⇒ `reject / migration-unavailable`（**不假装已是当前代际**）；包顶层出现不认识的键**默认拒**并逐条列 `unknownKeys`（静默丢字段正是验收①点名要治的那件），只有显式 `keepUnknown:true` 才放行且仍留痕。★ **幂等**：`importId` 由 包 id + 作用域 + revision 决定（确定性），`seen` 由**调用方**持有并回传 —— 本模块不偷偷写第二份导入账；重复导入是**正常读数**（`duplicate:true` / `ok:true`），不得与被挡同形。★ **来源悬空**：没给活源表 ⇒ `unknown`（判不了 ≠ 还在），给了空表 ⇒ `source-deleted`（查了，没有）；版本漂移仍是 live 但 `navigable:false`（旧锚点不可跳转）。★ **受限正文**：入口即剥，一律**定长**站位串（不随原文本长变化，否则长度就是读数），受限**键名整键清空**；keeper 过滤照走，挡掉的条数**必须计数可见**。★ **边界不打穿**：跨会话 / 跨分支的`sourceRef` 进 `blocked`，`planImport` 一律不出计划；`allowCrossBranch` 显式才放行且留痕。★ 撤销**有来源范围**（无范围即拒；范围外一条不动；重复条不再计）。★ 离线：源码零 `fetch` / `XMLHttpRequest` / `localStorage` / `indexedDB`。成对套件 `tests/v3313_memory_package.test.mjs`（14 条，含六条真源码破坏负控制 + 正控制地基 + 反向对照 + 判据纯度）。
> **历史留痕：v3.312.0** —— **M-X4（第二期拓展计划）事实生命周期与「遗忘 / 撤回 / 保留」控制**：本仓此前能回答「这条事实是什么」，但**回答不了「它还算不算数、被我处置成了什么、处置后能不能反悔」** ——`memory-type` 只挡 `revoked`、`fact-state` 只给状态读数，**没有任何一处能回答「这一处置会动到哪些面、动了能不能回滚、回读出来算不算已生效」**。本刀交付 `fact-lifecycle.js`（纯函数、零依赖、双导出、702 行 / 32K 字符）+ 宿主五出口 + 自检面一行诊断：★ **五处置穷尽互斥**（keep / expire / revoke /author-only / no-generate）与**四动作不一一对应**（delete-source / revoke-derived /hide-from-generation / keep-audit）分开；★ 组合检查是本模块最核心的一格 —— `no-generate` /`author-only` 下出现 `delete-source` **先判并一律拒**且理由必须点名 `evidence-preserved`（删了原文就再查不出曾经记错过），`delete-source` 未配 `keep-audit` 拒并点名 `audit-required`，`allowed`（这一态允许什么）与 `actions`（这次要做什么）**分行**。★ 计划**纯函数零写**（出口不落笔），被挡分支显式写 `count:0`（**与环境弄混无处可辨**）；生成面两态 `targetState` 恒 `null` ——那一态**没有账本态**，不许凭空编一个。★ 回滚三档 `reversible / partial / irreversible`，`delete-source` 无快照 ⇒ `no-inverse` 不可逆；`revoke-derived` 的逆操作是 `replay-rebuild`**不是逐条反写**。★ 回读按面分开：账本面比现态与目标态，**账上无此条报 `not-on-ledger` 不当作已生效**；生成面 `checked:false` + 具名 reason，**不编 applied/pending**。★ 审计面受限正文一律站位串（且站位串**不随原文本长度变化**，否则长度本身就是读数）；撤回取证 `leaked` 必须为空**且证据必须仍在账上**，缺一条报 `some-evidence-gone`。成对套件 `tests/v3312_fact_lifecycle.test.mjs`（13 条，含六条真源码破坏负控制 + 正控制地基 + 反向对照 + 判据纯度）。★ 本刀自伤与修法留痕：判据首跑 7/13，六条失败**全有明确归因** —— ① S1 红的不是内核而是**夹具**（未闭合条与已闭条同形，判据测的不是那一档）；② H1 判据自身口径过严（把「定义面」与「使用面」混成一类，改为定义面恰一次 / 使用面 ≥1 次）；③ E1/E2 是夹具拼装缺陷（改用 `buildCode()` 助手 + dump 复核）；④ E2 还有一条真因 —— `_moduleLib` **会回落 `require`**，夹具把全局设 `null` 制造不出「缺席」，须设 `{}`（在场但形状不对）；⑤ L1 暴露判据覆盖面不足（补「删原文不配保留审计」一格后当场翻红）。另修内核一处：`planFor` 被挡分支没有 `count`，与「圈定零条」同形。★ 抬版连带修一处历史档「把某版一次性事实当永久不变量」：`tests/v3311_repair_settle.test.mjs` 的「本模块须是 `extra_js` 末位」已按 v3305/v3310 同款范式改成「与追加时邻居都在场，位置不作判据」。
> **历史留痕：v3.311.0** —— **M-X2（第二期拓展计划）修复落定面：从「流程完成」到「所有派生面落盘完成」**。X2 已把落笔链做通，但**落定之后**还空着五格：仅登记与「事实已纠正」同形（界面只能读 `applied`，而它答的是**流程**）/ 部分成功不显示 partial / 失败项只能整批重放 / 切聊后旧预览无人拦（`expectRevision` 比的是变更栅栏号，**切聊不递增它**）/ 召回缓存不跟随同代变化（`isArtifactStale` 是被动的，落定流程从不去问）。本刀交付 `repair-settle.js`（386 行，纯函数面，**零写**）+ 宿主九出口 + 一行诊断：`verdictOf` 四态穷尽互斥（registered / partial / settled / corrected）、`coherenceOf` 同代三态（★ 有一项没盖戳判 unknown，**不得用缺席补证据**）、`checkTicket` 五形（没票 / 切聊 / 换代 / 过期 / 有效）、`retryOf` 只挑坏项并明说 skipped、`cacheOf` 列出该作废的召回产物。★ 本刀自伤两处**由判据当场逼出**并修：`seal()` 一律写自己的 rev ⇒ 同代判据恒过（改为自有戳优先）；`verdictOf` 把 unproven 并进 partial ⇒ `settled` **不可达**（改为流程走完后未全证 ⇒ settled）；另修自述里一处**自我指涉判据**（对常量自己断言）。成对套件 `tests/v3311_repair_settle.test.mjs`（15 条，含 6 条真源码破坏 + 正控制地基 + 反向对照 + 判据纯度 + 当版锚）。
> **历史留痕：v3.310.0** —— **M-X1（第二期拓展计划）用户侧记忆控制中心**：证据工作台把九账投影成消费者摘要面时每本账只取**尾部 200 条**，在此之前「更早的记忆在盘上、界面上却与没有同形」。本刀交付 `memory-center.js` + `index.js` 宿主接线 + `settings-ui.js` 面板薄接线：四态（有命中 / 确实没有 / 判不了 / 面不可用）**互不同形且各带具名 reason**，由渲染串的 `data-view` 自证；条件归一 / 判重 / 回放全走 `evidence-query`（单一真源），本模块只声明「界面字段 → 条件键」映射并与真源 `FILTERS` 逐字对账（含反向自证）；动作**只声明不执行**（缺 handler 降级 `unavailable`，处置类如实回报 `handled:false` + `ignored`）；查询**零写副作用**；保存的是**条件**不是结果。★ 本刀自伤两处已修并留痕：面板 `mcState()` 手抄了一份空白字段表（第二套字段清单，改为取自内核 `memoryCenterBlankState()`）；抬版脚本 `tools/bump3310.py` **半执行**（第五段锚点写成「文件名+换行」而真实是「文件名+Tab」⇒ 打偏退出，而前九段已落盘）留下三处半成品（v3209 数量锁只改消息没改断言值 88→89、tsv 未追加新档行、README 审计磁盘数被误写成 66）。★ 负控制还揪出**判据自身**两处空转（面板手抄表只打变量名看不见 / 改条件回第一页从第 1 页起测同形），已修。成对套件 `tests/v3310_memory_center.test.mjs`（16 条，含 6 条真源码破坏 + 面板侧破坏 + 判据纯度 + 当版锚）。
> **历史留痕：v3.294.0**（X 系列第六条落地） —— **召回解释（X8）**。`recall-explain.js`（纯函数、零依赖、双导出、800 行）把一次召回从源到载荷的路径落成**七档互斥归因**：缺源 / 无命中 / 别名·身份过滤 / 有效性过滤 / 预算裁掉 / 已注入 / 判不了，每档 `why` 把归因与改法写在一处。四态纪律：`missing` 只表示「判不了」，与 `empty`（测了确实 0）严格不同形；★ **测不到一律给 `null` 不记 0**；另设 `unproven`（链走完却无定论，既不算已注入也不算判不了）。★ 本版最贵的一条：**判定链停点之后 ≠ 观测面缺席** —— 停点之后的档位「根本没跑到」，其 `missing` 混进阻断面会让**全源关闭**（最有把握的一条结论）被自己下游的空档反打成「判不了」；故引入逐档 `required`（必需面缺 ⇒ 阻断；可选面缺 ⇒ 只**收窄覆盖范围**并注明）、停点 `decidedIdx` 与 `unreadDownstream` 三面分开曝光。轮次身份取**三态**（`floorMatched: matched/mismatch/unknown`、`idMatched: true/false/null`）：只有**被证伪**才降级，宿主没给可比身份 ⇒ 按成立处置但必须留注记 —— 把「无从核对」读成「对不上」会让每轮解释都落 unknown，真正的「账本拿错了」反而看不出来。本插件账本 `floor` 取自 `query.floor`（宿主从不赋值）⇒ 该维度恒无从核对，故宿主侧另走**内容级**身份（账本入选条目 vs 实际进载荷的块）。缺源 ≠ 零命中：合计以账本 `totalHits` 为准，源级求和只作回落且要求齐全；无源在岗时零命中不是独立读数（如实记 missing，免得出现「缺源 2 · 无命中 0」）。建议纪律：`apply.auto` 恒 false、`requiresUserChoice` 恒 true、证据指向真实字段路径、判不了只给一条「先修观测面」；反馈是纯函数且显式 `writesHistoryFact:false`。源清单单一真源：账本记 `srcKeys`（`SRC` 快照），宿主不重列开关名单（实测 15 源里 10 个**无配置键**、由数据条件入场）。宿主真接线：`manifest` 注册（83→84）+ `index.js` 三出口 + 诊断面「召回解释」体检行（与「召回自检」「注入读数」分列，报警只认「判不了」）。判据 `tests/v3294_x8_recall_explain.test.mjs`（14 条）锚当版，含 4 条**真源码破坏负控制**（拆身份闸门 / 拆全关明确结论 / 拆降级早退 / 拆测不到给 null，各配「原版全绿」前置对照）。★ 本版修复留痕六处（全部实测）：① 全关曾被标 `missing` ⇒ 被下游归成 unknown；② 降级只给通用文案 ⇒ 丢掉「楼层不符」这条可观测原因；③ 可选面缺读数也 break 判定链 ⇒ 每轮落 unknown；④ 停点之后 missing 被算进阻断面 ⇒ 见上；⑤ `readStage()` 引用外层 `_idLevel` ⇒ 取不到即抛、被自身兜底吞成「整份解释异常」（改为显式传参）；⑥ `no-hit` 要求源级读数齐全 ⇒ 本插件源级天然不齐、每轮都判不了（改为优先采信账本确证合计）。★ 工具面留痕：补丁首版换行写成 `\n` 两字符 + 用 `ast.parse` 校验 JS；另踩到**半改造**（脚本后半段锚点校验失败即 exit，写盘在循环之后 ⇒ 前几项补丁静默作废），已改为「全部锚点先校验、再统一替换写盘」。
> **历史留痕：v3.293.0** —— X 系列第五条落地：**长篇剧情分卷与选择性接续（X7）**。`volume-continuation.js`（纯函数、零依赖、909 行、33 个出口）把「上一卷结束时说了什么、还剩什么没结、这一卷该接什么」落成可复算判定：不选项目 ⇒ 不产包且**不产空包**（`ok:false/no-project`，空包会被读成「这卷确实没内容」）、读数单列「未选项目（维持隔离）」；卷/章节导航 `navKey` 稳定可寻址、`floorStart` 缺省排后且记 `null` 不拿 0 冒充首卷；同名不同宇宙**不合并**（id 优先、按名字条进 `nameOnly` 候选永不自动落笔、目标侧索引分 id/名字两张表且跨表不比对）；缺面 ≠ 空面（键缺席 `face-absent` / 空数组 `present+count:0`，许可收窄 summary-only ⇒ 五面逐面点名）；源引用三态 `live / source-deleted / unknown`，判不了（无活源表）**不得**报可跳转、版本漂移 ⇒ live 但不可跳；`proposalId` 确定性 + X6 `seen` 幂等表 ⇒ 重试不重复；撤销**必须有来源范围**（没范围拒绝、域外一条不动、多级取与、重试不重复计）且回执自带 `revokeScope`；秘密按 keeper 过滤且挡掉条数计数可见；交接三步不可合并（借 X6 一份语义 / 缺席走自持退路留痕）、源已删 ⇒ 预览 blocked 连提案都不出。宿主真接线：`manifest` 注册（82→83）+ `index.js` 四入口与缺席退路 + 诊断面「分卷接续」体检行（与「分支语义」「知识轨迹」分列）+ `memory-organs` 五法（`applyVolumeContinuation` 只落 unfinished 面 / 按来源计数 / 逐条导出供撤销寻址 / 按范围撤销 / 读数）与 `volumeContinuationRead` 随 export/import。判据 `tests/v3293_x7_volume_continuation.test.mjs`（48 条）锚当版，含 G 段**宿主真实落笔闭环**（真方法体 + 真器官 + 真 storage + 真租约 + 真配置闸门）与 4 条真源码破坏负控制。★ 本版修复留痕（七处，全部实测）：① 夹具缺 `config.config` ⇒ 真实现的 `_leaseValid` 抛错被出口吞成 null，G 段读到的其实是「夹具缺件」而非「落笔失败」；② 判据 A 把「任何 add」当违规而目标在场那面本就该 add ⇒ 原版恒翻红，已按「只盯缺的那几面」重写；③ 判据 C 用「不传 scope」触发 ⇒ 破坏副本在 `sc.packId` 抛 TypeError，「判据翻红」与「判据自己炸了」同形，已改空范围走通全流程；④ **真隐患**：落笔成功（账本真增条）后任一步抛错都被吞成 null，上层读成「没成」并重试 ⇒ **重复落笔**，已补 `_lastVolumeHandoff` 作废读数；⑤ 该留痕块首版恒不落：`applied`/`persisted` 声明在 try 内（块级作用域），catch 引用抛 ReferenceError 又被内层兜底吞掉 ⇒ 留痕永不在场，已提到 try 外；⑥ 读数只存 `absentFaceCount` ⇒ 任一处少传即「告警恒假」，已同时存面名并由面名兜计数；⑦ 判据 D 首版破坏锚点打偏（判据走「源标识缺失」分支而破坏锚在 liveSources 那行）⇒ 破坏不可观测（假绿），已锚到 `unknown-liveness` 行。★ 另修：判据 B 缺 `return ''` 收尾、H5 锚点在测试源码散落两处、H9 判定窗口向后取越出体检块。★ 判据面（本轮另两处，均属「防线自己的读数过期」）：⑧ `v3279` 的声明级台账读数断言写死量级 `5[0-9][0-9]`（建档时 5xx，本版真值 603 / 591）⇒ 与本轮 ② 同族的**锁当版读数**，已改钉不变量「有真引用 + 仅测试·审计 = 声明总数」；⑨ O7 副本账本**登记滞后**（`tests/v3281` / `v3282` / `v3283` / `v3284` 四档）：X6/X7 两新模块之间的五簇逐字副本（`numOf`/`keyOf`、`PRECHECK`↔`PREVIEW`、`FACES`/`ACTION`）未登记 ⇒ B1/D1 双向一致判据翻红。处置为**补登记 + 留痕理由**（`volume-continuation.js` 档头逐字声明过「自持一份、不引 X6 常量」以防跨模块静默读旧值），不是合并成一份；另两簇（两个 UI 门各自 DOM shim 里的 `matches`/`walk`，自 v3.287.0 起潜伏）同属此理。`branch-semantics.js`（纯函数、零依赖、672 行）把「两条分支各是什么、差在哪、能不能合」落成可复算判定：五面（事实版本/角色状态/未了事项/金钱/剧情时间）逐 owner 带来源楼层与有效范围、**缺模块与空字段不同形**（显式缺席 `comparable:false` 不参与冲突判定）；冲突四档且**不靠「较新一律覆盖」**（`newer-wins` 只在较新侧有效、较旧侧失效时成立；两侧均有效/均失效/楼层未知 ⇒ `undecided` 留空不猜）；秘密按**实体 ID** 过滤、走名字的另计 `nameMatched` 风险；受控交接三步不可合并（提案 `applied:0` / 预检 `blocked/warn/ok` / 确认无预检或缺 `applyFn` 不得假装成功 + `proposalId` 幂等 + 回源 + 回读三态）；`index.js` 三入口 + 缺席退路 + 诊断面「分支语义」体检行；判据 `tests/v3292_x6_branch_semantics.test.mjs`（46 条）锚当版，含 I 段**宿主真实落笔闭环**（真方法体 + 真 organ + 真 storage + 真租约真跑）。★ 本版修复：名字匹配风险原先只统计被隐藏条目 ⇒ 改同时暴露 `nameMatched`；F4 首版破坏用 changed+缺楼层 ⇒ 破坏后仍走 skip 的假绿，改 only-in-b 差异使不可比面被放行时产生可观测 add 提案。
> **历史留痕：v3.291.0** —— X 系列第三条落地：**知识演变与传播证据（X5）**。`knowledge-trace.js`（纯函数、零依赖）把「这条知识在第几楼、从谁、经哪条证据取得的」落成可复算轨迹：五态（得知/怀疑/误信/未知/**未记录**）**不得压格**、`knewAt` 三态判「获知之前不得引用秘密」（unclear 不得当 no 用）、同文转述不算两条独立证据、回档撤销且**纠正链断裂可见**、身份按明面/揭穿后分格；`index.js` 提取路径并行记轨迹 + 诊断面「知识轨迹」体检行（与「知情网络」分列）；判据 `tests/v3291_x5_knowledge_trace.test.mjs`（24 条）锚当版。★ 本版真缺陷：`lastActive` 把 `retract` 自己算进去 ⇒ 撤销判据恒不触发、撤销被静默读成 knows（靠 F 段真源码破坏抓到）；`evidenceKeyOf` 非对象入参原会抛。
> **历史留痕：v3.290.0** —— X 系列第二条落地：**手机事实受控准入（X4）**。`native-fact-admission.js`（纯函数、零依赖）把八栏身份与五态来源收成一条判定（六档裁决，`admitted` 仅 `confirmed`）；`index.js` 召回侧接入唯一过滤门（`player-only` 不进角色面，两栏计数）+ 诊断面「手机准入」体检行；判据 `tests/v3290_x4_fact_admission.test.mjs`（16 条）锚当版。★ 两处实测坑：`global !== window` 在无 window 环境抛 ReferenceError（加载即崩）；F 段首版破坏点选「自述升档防线」而 `quote` 未自述时走来源默认路径 ⇒ 破坏不可观测（假绿），已改破坏来源台账整行。
> **本页契约声明**：**退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移**；本页读数均为**定向复验**，新增判据**绝不跑全量**（**例外：计划收口点**）。**当前版本 v3.296.0 已跑全量**（277/277 文件 · 2986 断言 · 0 失败 · 审计 59/59，登记 `tests/audit/doc_readings.json`）—— X 系列八条全部交付即该收口点；此后动盘面仍须回到「未实跑即标待验」的旧口径。

> **最近更新：v3.289.0**（历史留痕） —— X 系列第一条落地：**注入策略对照（X3）**。`projection-pipeline.js` 新增 `compareStrategies()`（同一候选 × 多套配置 × 同一个 `predictInjection`），`index.js` 新增 `_projectionStrategyCompare()` 宿主消费点 + 诊断面「策略对照」体检行；判据 `tests/v3289_x3_strategy_compare.test.mjs`（10 条）锚当版。★ 两处实测坑：F 组首版 `eligible.slice()` 破坏**读数面不可观测**（`predictInjection` 只读不回写）⇒ 已改「按 plan 现算候选」的真可观测破坏；vm 沙箱须提供 `window`（真源按 `typeof window` 挂载）。
> **最近更新：v3.288.0**（历史留痕）+ —— 计划陈旧口径门的**面补一类**：X 系列已交付项复活 + **判据纯度修正（两处漏判）**。新增 P8（已交付 X 项不得复活）+ 修正 P4（只认条目标题、交付事实按编号自己那一段读），套件 `tests/v3288_plan_currency_xface.test.mjs`（10 条）锚当版。
> **最近更新：v3.287.0**（历史留痕，原当前行） —— O2 真实用户操作层（**可做切片**）：**交互逻辑门**。
> 计划 O2 的验收原文是「控件有 DOM、可见、可操作、**改变正确状态**且**重开保留**；测展开、滑块、输入、焦点与窄屏」，
> 而 v3.271.0 的 `scan_ui_runtime.mjs`（U1~U5）只到**渲染层**、**从未点过任何控件** ——
> 「控件有 DOM」与「控件可用」之间没有蕴含关系（disabled 滑块 / 写进死变量的 handler / 没接存储的保存键都满足 U1~U5）。
> 新增 `tests/audit/scan_ui_interaction.mjs`（V1~V10，自带最小 DOM shim）+ `tests/v3287_ui_interaction.test.mjs`（17 条 test）。
> ★ 实测五处假红**全是测量侧错**：① shim 未模拟 checkbox 原生 checked 翻转；② 把 `.ls-group-title`（纯标题样式，34 处）
> 当折叠头（真源是原生 `<details id="ls-advanced">`，仅 1 处）；③ **shim 的 `matchesOne` 不支持 `>` 子组合器** ⇒
> `details > summary` 候选恒 0 ⇒ 报出「本仓无折叠头」的**假结论**（测量盲区冒充事实，比红着更坏）；
> ④ 判据断言「click 后 config 立即反转」，而真源复选框无 change 监听、写回走 `#ls-save` 收集循环（判据按想象写）；
> ⑤ 顺序弄反 —— 真源 `value="${c.vectorTopK ?? 5}"` 每次开面板从配置重渲染，改值后再重开会被旧值覆盖。
> ★ 边界（同 O2 验收原文「未执行不算通过」）：本环境**无任何 headless 浏览器**（chromium/chrome/firefox 全无）、
> **无 Playwright/Puppeteer** ⇒ 宿主 CSS / 真实点击坐标 / 真实 localStorage 配额与跨会话行为**未覆盖**，
> 真 SillyTavern 侧（生成 / 楼层重生成删除 / 切角色 / 两插件共装）**如实登记未执行**。
> ★ 抬版交棒两坑：① v3287 成新 frontier ⇒ **v3286 两档当版硬锚必须退为下限锚**（`assert.ok(vnum(pkg) >= vnum('3.286.0'), …)`），
> 否则 V4 计数 > 1、两档 G 条当场翻红（`3286000 ≠ 3287000`）；② H1 的 `vnum` 首版写成 `split('.').map(Number)` 返回**数组**，
> `assert.equal` 严格相等下 `[3,287,0] === [3,287,0]` 引用不等**恒假** ⇒ 「版本同源却常红」；须用数值形态（版本守卫 V4 的计数口径同形）。
> ★ 敏感度三档实测 `H=0 / G=2 / T=0`（G 非 0 ⇒ 非恒绿探测器）；三处登记面已补。
> **最近更新：v3.286.0** —— O8 第二刀：**门禁成本一致性**。计划要求「为测试成本建立热点读数」，而磁盘上此前**没有任何成本读数**（`run.mjs` 摘要只有失败档带 duration；`--audit` 的 slowest 只收 top3）⇒ 「哪个档最慢」无从复算。本刀给摘要追加 `scope`（覆盖范围自述）与 `tests.slowest`（逐档耗时 top30），新增零手抄重绑工具 `tools/_rebind_test_cost.py` + 登记 `tests/audit/test_cost_readings.json` + 扫描器 `tests/audit/scan_cost_truthfulness.mjs`（C1~C8）与判据套件 `tests/v3286_cost_truthfulness.test.mjs`（12 个 test）。
> ★ 首份读数就抓到真热点：`v3285_o7_doc_truthfulness.test.mjs` 单档 **15473ms**，是次慢档的近 3 倍（本刀只建读数、不做优化）。
> ★ 最要紧判据是 C5「覆盖范围自述」：`full=true` ⇒ 必须盖版本章；`full=false` ⇒ 必须带 pattern；缺席按旧登记如实报出不判红。定向采样**不得**推进 `measured_at`（不得冒充全量）。
> ★ 实测修正四处：① 扫描器首版是**恒绿探测器**（G/T 两档皆 0）⇒ 补两条真源在场检查，修后三档实测 H=0/G=2/T=2；② 补丁首版不幂等（锚点含于替换文本）⇒ 哨兵前置 + 回滚重做；③ 五条 C7 drift 措辞不统一致判据假红 ⇒ 统一写入侧；④ 面下限写死 ⇒ 改 env 可覆盖（同 scan_doc_truthfulness 口径）。
> ★ 计划陈旧口径收口：`PLAN.md` 新增「## 当前优先级（唯一现行排序）」节，旧「## 优先级」节加陈旧标记。
> **最近更新：v3.285.0**（历史留痕，原当前行） —— O8 第一刀：**文档读数真实性门**。README/PLAN 的人读读数（版本 / 测试文件数 / 审计脚本数 / extra_js 项数 / 根级模块数 / 断言数）此前**不在任何判据的枚举面内**（版本四源有守卫、运行时声称有守卫，文档数字只有人眼）。本刀新增 `tests/audit/scan_doc_truthfulness.mjs`（D1~D9，三档退出码 0/1/2）+ `tests/v3285_o7_doc_truthfulness.test.mjs`（16 条，含七处真源码破坏负控制）。
> ★ D9 是**档自述读数**：CHANGELOG 当前版本节里「`tests/<file>.test.mjs`（N 条）」也要核回磁盘；
> 它上线第一件事就是抓出本刀自己写错的条数（13→15→16 三轮），随后又抓出历史节三处时点差
> （v3220 17/18、v3164 18/19、v3162 18/22）——那三处按 T1 口径**不回头改写**，写进 CHANGELOG 边界段。
> ★ 关键设计：**「当前在役面」与「最近一次全量实跑快照」分开陈述**。首版把「登记版本 ≠ 当前版本」直接判红，于是「新增一个测试文件」与「文档说谎」同形，逼人提前跑全量；分开后盘上多文件 ⇒ 在役面立刻变、门禁仍绿，未实跑 ⇒ 文档必须写「当前版本 vX **全量待验**」（写成已通过才是缺陷），反向（对齐了还标待验）同样判红。
> 读数零手抄：断言数由 `tools/_rebind_doc_readings.py` 消费 `TEST_SUMMARY_JSON` 摘要写入 `tests/audit/doc_readings.json`（含 `rebinds` 追加留痕）；扫描器只核对「文档 ↔ 登记」，自己绝不跑全量。
> 实测修掉两处负控制假绿：破坏副本写在仓根 ⇒ `../_audit_lib.mjs` 解析失败恒 rc=1；写进 `tests/audit/` 的新增文件本身改变被扫描面（审计磁盘/门禁各 +1）⇒ D2/D5 继续翻红掩盖被摘判据。修法：覆盖夹具**已有**门禁文件。
> **最近更新：v3.284.0**（历史留痕，原当前行） —— O7 第四项（续四）：**审计面副本**。四层副本判据（v3280 宿主↔模块、v3281 模块两两、v3282 别名、v3283 常量表）的**枚举面全部是「仓库根级 .js」**，`tests/` 目录整个不在任何一档的面内 —— 而 `tests/audit/*.mjs` 那 58 个文件是**探测器的实现**，不是被测对象，它们自己腐化时本仓没有任何东西会响（「判据的面漏一类」第七处）。
> **实测证伪**：把 `scan_v3193_lexicon_drift_negctl.mjs` 的 `runAt` 里 `e.status == null ? -1 : e.status` 改成 `(e.status ?? -1)`（值级漂移、语义等价）⇒ `node tests/run.mjs --audit` **55/55 仍全绿**。这段 `runAt` 在 **5 个 negctl 档**里逐字复制了 5 份 —— 改一处、漏四处，门禁照样全绿。这比 v3.283.0 更尖锐：**探测器的实现若在副本间漂移，探测器给出的结论本身就该被怀疑**。
> 登记 9 簇（实测逐字相同，体长 ≥ 40）：`mutate` 2×640、`extractMethod` 2×399、`methodBody` 2×328、**`runAt`/`runScanAt` 5×314**、`extractBlock` 3×238、`distributionFace`/`inboundDistributionFace` 2×218、`downstreamModule`/`faceModule` 2×91、`readOrNull` 2×75、`read`/`readOrNull` 2×74。
> 新档 `tests/v3284_o7_audit_copy_ledger.test.mjs`（14 条）：A 枚举面下限（audit 面 .mjs ≥45 / function 体 ≥100 / 跨文件簇 ≥6）+ B1 九簇双向一致 + B2 改声明名 ⇒ B2c（并断言不误报成员集合变化）+ B3 改体内一行 ⇒ B2b（含 md5 与掉出去的档名）+ C1/C2 改声明名 ⇒ B2c + C3 凭空复制一份**唯一实现** ⇒ B1 + **C4/C5/C6 改 3 档/2 档/5 档簇各自的体内一行 ⇒ B2b（3→2 / 2→1 / 5→4）** + D 工具两向自证 + E 判据纯度 H5（14 个锚点各只有 1 个持有常量、**3 个替换文本不得与任何锚点同串**、锚点声明序稳定、14 个坐标单命中、**3 个体内锚点的面内命中数须恰为 3/2/5 = 各簇成员数**）+ F 自防护 / 三源同源。
> 本轮实测到的两条口径（已写进档头，防后人踩）：① **簇的成员按「体」算** —— 「改名」只动名字集合（B2c），不动成员集合；只有「改体/加一处同体」才动成员集合（B2b/B1）。首版把两者混为一谈，断言含糊。② **归一化会吃掉尾部空白** —— 首版 C6 用「替换文本加一个尾空格」造破坏，折叠后与原文逐字相同 ⇒ 破坏根本没发生（假红）；改体必须动到折叠后仍在的字符。
> 边界（诚实）：只保证「登记在案的审计面副本仍在、值仍逐字相同 + 新出现的簇必须登记」，不判定这些 helper 是否该收敛到 `tests/_audit_lib.mjs`（它们大多不在该库接口面内，收拢是设计决定）；面只覆盖 `function` 声明形态；与 `scan_audit_lib_consolidation` 不重叠（那档管唯一真源库的四个助手是否被本地重写，本档管审计面内部的实现副本是否与登记值一致）。
> **最近更新：v3.283.0** —— O7 第四项（续三）：常量表值级副本面。
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
