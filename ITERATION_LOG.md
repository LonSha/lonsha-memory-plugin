# ITERATION_LOG — LonSha 记忆插件

> 自主迭代模式的流水账。每条：**做了什么 / 为什么 / 影响范围 / 门禁结果**。
> 版本级详情在 CHANGELOG.md，本文件只记迭代节奏与判据出处。

---

## 2026-09-24 · v3.204.0（门禁去本机化 —— 拆掉 36 个绝对路径 + 退役 17 个死兄弟树测试）

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
