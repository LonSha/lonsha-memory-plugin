# LonSha 第十二期计划证据与边界

> 取证日期 2026-10-29。本轮**只制定计划，不实施、不升版**。文中每个读数都写明复算命令，可在当版工作树上直接重跑。
>
> **期号修正（2026-10-31）**：本批原取名「第十一期」并用 `L11-*` 编号，与 v3.420.0 已交付的「第十一期」撞号（后者已占用整套 `L11-O1~O9 / L11-X1~X9`）。本版改为**第十二期**（`L12-*`），文件名同步 `v11 → v12`；本页各读数是取证当日的快照，**不随改号重算**，实施时须按当时代码复算。

## Current baseline

- 仓库 `lonsha-memory-plugin`，分支 `main`。
- 代码基线 **v3.426.0 / f907a80**（工作区干净、与 `origin/main` 同步）。
- V9 提案基线为 `v3.373.0 / ac5c21a` —— **已漂 53 版**，V9 正文里的接口名与覆盖描述整体失效，实施前必须重算。
- 当版读数：全量 **420 测试文件 / 4532 断言 / 0 失败 / 审计 61/61**（`TEST_SUMMARY_JSON=<path> node tests/run.mjs --audit --jobs 3 --audit-jobs 2`，测试 ~323s + 审计 ~133s）。
- 体量：`wc -l index.js` = **11718**；`node tests/audit/host_beast_probe.cjs` 成员 = **1168**、`seam_modules.distinct_modules` = **148** / `reference_sites` = **424**；`manifest.extra_js` = **244**。

## 本期核心取证：V9 的点名模块全都存在，但有一批没人用

```bash
cd /home/user/lonsha-memory-plugin
# ① V9 两份计划点名的 41 个内核：全部存在
for m in fact-lifecycle native-fact-admission evidence-solver ... era-inheritance; do
  [ -f "$m.js" ] && echo "OK $m" || echo "MISSING $m"; done
# ⇒ OK 41 / MISSING 0

# ② 其中 7 个在宿主 index.js 里零引用
for m in memory-supersede institutional-memory symbolic-evolution knowledge-network \
         relation-dynamics character-agency-contract era-inheritance; do
  echo "$m=$(grep -c "$m" index.js)"; done
# ⇒ 全部 = 0
```

**这七个模块的现场状态**：都在 `manifest.extra_js` 里登记（真被加载）、都有自己的单测（全绿）、`selfCheck` 真跑 —— 唯独产品端一次都没调用。这是一种**比「没写」更坏的形态**：它让 CHANGELOG 的「已落地」声明在文本上成立、在运行时无效。

**账本没抓到它们**：

```bash
python3 -c "import json; d=json.load(open('tests/audit/dead_code_budget.json')); print(list(d))"
# ⇒ ['_doc','_rule','_bump','ceiling','maxSlack','note','history','_history_last']   ← 全是行数口径
# 七个模块里只有 knowledge-network 出现在该文件里，其余六个既不进预算也不进任何消费判据
```

## 跨仓实测：消费判定按「名字」会救活真孤儿

在兄弟仓 `ruby-phone` 上做了破坏实验（不改本仓）：

```bash
# 现状：config/diff-review-pipeline.js 的 computeParagraphDiff 是零消费，但门照绿
node scripts/dead-export-check.mjs
# ⇒ ✓ 无新增零消费导出

# 把「同名但被消费的那个」改名（config/diff-editor-desk.js）
sed -i 's/export function computeParagraphDiff(/export function computeParagraphDiffX(/' config/diff-editor-desk.js
node scripts/dead-export-check.mjs
# ⇒ ✗ 发现 2 个未登记的零消费导出：
#     config/diff-editor-desk.js:47  computeParagraphDiffX
#     config/diff-review-pipeline.js:21  computeParagraphDiff   ← 真孤儿，此前被同名掩盖
```

结论：**名字级消费判定 = 假绿通道**。本仓 `clone / record / reject / result` 三账版与六账版并存（v3.281 台账 15 簇 / 60 对逐字副本），同一形态必然在此落地。

## 兄弟仓（ruby-phone）取证 —— 用于 L12-X5 与跨仓判断

| 读数 | 命令 | 结果 |
|---|---|---|
| 版本 / 测试 | `update-log.json` latest / `ls tests/*.test.mjs \| wc -l` | 4.92.0 / **339** 套件 |
| R10 声明「18 项机制全量落地」(v4.85.0) | `grep 'this.<x>' config/subsystem-orchestrator.js` | 18 个实例**全部 new 出来** |
| 18 实例的产品端真读 | `grep -rn "subsystems\.<x>\|\.<x>\." apps phone index.js` | 只有 `notifications=1` / `moments=14`，**其余 16 个 = 0** |
| orchestrator 内部驱动 | 同上 | 6 个（battery / cellular / smartBand / calendarLife / atmosphere / autonomousScheduler）由 `advanceAutonomousLifeStep` 驱动 |
| 而 `advanceAutonomousLifeStep` 本身 | `grep -rn advanceAutonomousLifeStep` | **全库仅 1 处（定义处），零调用** |
| 42 个公开方法的外部调用 | `for m in ...; do grep -rn "\.$m(" ...` | **全部 = 0**（唯一被调的是 `runSelfChecksSync` / `runSelfChecks`，来自 `index.js:2070`） |
| R9 十八内核的归宿 | `grep -rln '第九期规划' config` | 18 个模块**全 import 进** `config/subsystem-orchestrator.js`，而 orchestrator 的方法零调用 ⇒ **集体悬空** |
| PLAN 现状基线表 | `grep -n 'v3.74.0' PLAN.md` | 第 48~50 行**仍停在 v3.74.0**（漂 118 版），第 55 行自述「本表仍没有判据看守」 |

⇒ 对 L12-X5 的意义：本仓要等的「手机侧行动回执」**目前不会产生**，所以桥必须是**缺席可用**的（报 `absent`，不伪造回执），不能把交付挂在下游修复上。

## 门禁面现状（本仓）

```bash
ls tests/audit/*.mjs | wc -l     # 61 条在役审计脚本（磁盘 67，含 6 个 _ 前缀探针）
```

与本计划相关、**已存在且扫描面互不重叠**的三条：

| 门 | 判什么 | 出处 |
|---|---|---|
| `scan_module_wiring.mjs` | 加载冲突 / `window.LonSha*` 符号供给 / 全局符号被消费（冻结账本） | v3.163 |
| `scan_live_wiring_dataflow.mjs` | 幽灵守卫：宿主在 `if` 里读的 `this._xxx` 必须有人写 | v3.421.0 补 exit 2 |
| `scan_ui_panel_drive.mjs` | 面板真驱动（六条 W 判据） | v3.303.0 |

**缺口**（= L12-O2 的立项依据）：**没有任何一条判「模块被加载了但产品端零引用」**。上面三条都不覆盖它。

## Non-goals

- 不新增第二套全局事实库；不复制正文绕开 owner。
- 不把守卫/审计/台账/发布/纯重构当产品项；它们只随功能提供最小收口证据。
- 不为清账而 `--update` 抬死代码预算（那是「一次成功的失败声明」）。
- 不修改 `WM_VERSION`，除非确实改数据结构形状。

## Delivery rule

每项按六个切片推进：**领域内核（或接线点）/ 现有 owner 接线 / 用户入口 / 持久化或回执 / 真实混合样本 / 定向回归与恢复路径**。六片全完成才结项。

- **禁止**「先建内核、下版再连」—— 本期所有项**落地当版即接线**（`index.js` 真引用 + 面板可达 + 真调用点）。
- 每项必须带至少一条**真源码破坏负控制**（破坏 → 行为真变 → 恢复）。参考 v3.426.0 的 M4 三条与 v3.303.0 的四条。
- 全量 `npm test` 按本仓纪律集中到收口点跑一次，平时只跑定向；**但每项结项前必须跑一次「该项 + 相关档」的定向组合**。

## 规模与节奏

| 项 | 规模 |
|---|---|
| L12-O1 七件接线清算 | 3~4 天 |
| L12-O2 消费面台账 | 1.5~2 天 |
| L12-O3 绑定级判定 | 1 天 |
| L12-O4 面板三态 | 2 天 |
| L12-O5 真宿主最小回归 | 2~3 天 |
| L12-O6 文档读数生成 | 0.5 天 |
| L12-O7 seam 耦合账 | 1 天 |
| L12-O8 世界线作者面 | 1.5 天 |
| L12-O9 成本预算 | 0.5 天 |
| L12-X1 组织制度入口 | 2 天 |
| L12-X2 意义演化面 | 2 天 |
| L12-X3 前史作者工具 | 1.5 天 |
| L12-X4 裁决影响回放 | 2.5 天 |
| L12-X5 跨仓回执链 | 2 天 |
| L12-X6 卸载演练 | 1.5 天 |
| L12-X7 缺陷索引 | 1 天 |
| L12-X8 卡作者口径表 | 1 天 |
| L12-X9 沉默可解释 | 2 天 |

合计约 **29~32 天**（18 项，单期工作量足以支撑一轮长跑；优化侧 9 项约 13.5 天，可先行收口）。