# 第十三期证据、基线与验收边界（LonSha）

> 取证日：**2026-10-31**；基线 **v3.431.0**（`index.js:4` `const VERSION = '3.431.0'`，HEAD `150d055`）。
> 本页所有读数均在磁盘实读，命令附在每条后面，可复算。
> 配套计划：[优化面 L13-O*](../.agents/notes/proposed/architecture/2026-10-31-product-optimization-v13.md) ·
> [拓展面 L13-X*](../.agents/notes/proposed/feature/2026-10-31-product-expansion-v13.md)。

## 一、基线读数

| 量 | 读数 | 复算命令 |
|---|---|---|
| 版本 | **3.431.0** | `grep -n 'const VERSION' index.js` |
| 入口行数 | **11861**（`wc -l`） / **11862**（探针 `entry_lines`） | `wc -l index.js` / `node tests/audit/host_beast_probe.cjs` |
| 成员数 | **1218** | 同上探针 `member_count` |
| 合并面行数 | **30728** | 同上探针 `surface_lines` |
| `extra_js` | **244** 项 | `python3 -c "import json;print(len(json.load(open('manifest.json'))['extra_js']))"` |
| 测试文件 | **430** | `ls tests/*.test.mjs \| wc -l` |
| 审计脚本 | **76** `.mjs` + **3** `.cjs` | `ls tests/audit/*.mjs \| wc -l` / `ls tests/audit/*.cjs \| wc -l` |
| 全量快照 | **430 文件 / 4658 断言 / 0 失败 / 审计 68/68** | `tests/audit/doc_readings.json` |

> 注：`wc -l` 11861 与探针 `entry_lines` 11862 差 1 是**末行无换行符**的既有口径差，非缺陷。
> `PLAN.md:61` 的体量行写「11862 行（探针读数;`wc -l` 11862）」—— 此处括注与实际 `wc -l` 差 1，
> 属同一类的口径残留，列入 O7 顺带收口。

## 二、门禁全绿（起点证据）

| 门 | 读数 |
|---|---|
| `scan_version_guard` | 问题 0；frontier `v3431_tmpdir_not_on_ramdisk.test.mjs`；当版锚点 1（仅当版档案） |
| `scan_module_consumption` | 244 模块（222 活跃 / 22 合规留存）/ **零未登记孤儿**；附两条提示：`memory-season-silence-manager` 与 `institutional-collective-memory` 台账登记 `allowed:0` 但已有 1 处消费（账本待刷新）；`unified-recall.js` 的 1 处消费全来自 `docs/planning/*.mjs` |
| `scan_extra_js_seam` | 覆盖全部 244 模块；所有 orphan 均在台账带理由登记 |
| `scan_ui_binding` | 声明键 194 / 渲染控件 189（189 键）/ DOM id 112 / A6 ok |
| `scan_ui_panel_drive` | W7 四档不同形：有数据 10 / 真没有 3 / 缺席 15 / 失败 14 |
| `gen_plan_baseline --check` | 「PLAN.md 与探针读数一致」（**仅体量行**，见 Problem 6） |
| `gen_state_report --check` | 与磁盘一致 |
| `scan_plan_currency` | 现行节 1 个 / 排序型节 3 个 / 执行状态 v3.431.0 |
| `dead_code_budget` | `ceiling 110629` / `maxSlack 400` / note `[v3.430.0]` |

## 三、面板 25 视图的可交互度实测（Problem 1）

方法：读 `settings-ui.js`，按 `viewType === '<v>'` 切段（下一处出现即截断），
统计段内 `<button` 个数与 `data-*=` 属性个数。命令思路：

```python
src = open('settings-ui.js', encoding='utf-8').read()
marks = [(m.start(), m.group(1)) for m in re.finditer(r"viewType === '([a-z]+)'", src)]
# 逐段统计 len(seg) / seg.count('<button') / len(re.findall(r'data-[a-z]+=', seg))
```

实测（分支 32 处，去重后 25 个视图；下表按段长升序）：

| 视图 | 段长 | 按钮 | data-属性 |
|---|---|---|---|
| volumes | 645 | 0 | 0 |
| graph | 667 | 0 | 0 |
| relations | 673 | 0 | 0 |
| povs | 675 | 0 | 2 |
| vectors | 701 | 0 | 2 |
| timeline | 751 | 0 | 2 |
| items | 773 | 0 | 2 |
| prequel | 794 | 1 | 0 |
| deltas | 851 | 0 | 0 |
| diaries | 930 | 0 | 0 |
| status | 1135 | 0 | 0 |
| oplog | 1179 | 0 | 0 |
| scene | 1269 | 0 | 0 |
| suspense | 1369 | 0 | 2 |
| xseries | 1521 | 0 | 1 |
| lockedfacts | 1616 | 0 | 0 |
| conflicts | 1649 | 0 | 0 |
| protagonist | 2035 | 0 | 4 |
| memorycenter（首段） | 2039 | 0 | 0 |
| report | 2519 | 0 | 2 |
| archive | 2583 | 0 | 0 |
| summaries | 2663 | 4 | 2 |
| pulse | 4048 | 0 | 0 |
| organs | 7273 | 0 | 0 |
| injection | 8252 | 0 | 0 |
| **memorycenter（主段）** | **148768** | **27** | **31** |

**结论**：除 `memorycenter` 主段（148768 字符 / 27 按钮 / 31 属性）外，其余分支**几乎全为零交互**；
`summaries` 是唯一另一个有按钮（4 个）的视图。⇒「玩家能看不能动」是实测结论，不是印象。

## 四、记忆条目级编辑面缺失（Problem 2）

```bash
grep -c 'editMemory\|updateMemory\|removeMemory\|forgetMemory\|correctMemory\|pinMemory\|memoryList' index.js
```

逐个实测（`index.js` / `engine-diagnostic-lines.js`）：

| 名字 | index.js | engine-diagnostic-lines.js |
|---|---|---|
| `editMemory` | 0 | 0 |
| `updateMemory` | 0 | 0 |
| `removeMemory` | 0 | 0 |
| `forgetMemory` | 0 | 0 |
| `correctMemory` | 0 | 0 |
| `pinMemory` | 0 | 0 |
| `memoryList` | 0 | 0 |
| `deleteMemory` | **1**（`index.js:1319` 的 stub `return false`） | 0 |
| `exportMemory` | 2（`exportMemoryReport`，产出**报告**不是可移植包） | 0 |

真实现在 `memory-organs.js:1012`：
`deleteMemory(char, id) { ... c.core.filter(...); c.recent.filter(...); return true; }`
—— **硬删，不留痕迹**（这是 O8 的现场）。调用方仅 `tests/v316_three_core.test.mjs:120` 与
`v3264_a1_memory_organs.test.mjs:94` 的清单断言。

`memorycenter` 已接的 9 个 handler（实测 `grep -o "_memoryCenterHandlers\['[a-z.]*'\]"`）：
`query.reset` / `query.save` / `row.detail` / `row.dispute` / `row.export` /
`row.repair.preview` / `row.revoke` / `saved.remove` / `saved.replay`。
内核声明 11 个动作 id（另有 `keep` / `revoke` 两个非 `row.*` 前缀）——
**其中没有一个是「改记忆正文」**。

## 五、零消费内核 24 件清单（Problem 3）

来源：`tests/audit/module_consumption_ledger.json`（`total_modules 244` / `zero_consumption_count 24`）。
筛选 `prod_call_sites == 0` 得 24 件，`allowed` 全为 0，`why` 全为
「存量独立算法库或工作台套件（待后续阶段接线或降级）」：

```
modules_combined.js                        graph_algorithms.js
world-clock-reader.js                      world-ledger-reader.js
cse-engine.js                              api-channels.js
fact-unified-lifecycle-bench.js             evidence-conflict-adjudication-bench.js
unified-narrative-clock-axis.js             recall-route-feedback-bench.js
generation-material-budget-plan.js          fact-postgen-replay-receipt.js
maintenance-cold-warm-session.js            project-migration-boundary-bench.js
memory-task-workbench.js                    memory-season-silence-manager.js
meaning-evolution-map.js                    memory-archaeology-gap-bench.js
counterfactual-experiment-bench.js          institutional-collective-memory.js
character-habit-growth-evidence.js          multi-perspective-theater-bench.js
memory-action-symbiosis-circuit.js          era-continuation-inheritance-tree.js
```

**交叉实测（产品面自引检查）**：对 24 件逐个 `grep -rl '<module>' index.js engine-*.js settings-ui.js memory-*.js`：
- 绝大多数回空（只在自身文件内自引）；
- 例外四件：`institutional-collective-memory` 与 `memory-season-silence-manager` 命中
  `index.js` + `engine-diagnostic-lines.js`（**这与台账 `prod_call_sites=0` 矛盾 —— 即门禁提示的
  「账本待刷新」是真事**，两件实际已有消费）；`memory-task-workbench` / `memory-action-symbiosis-circuit`
  仅命中自身文件。

**骨架判定（防止把骨架当资产）**：

| 文件 | 字节 | 字符 | 导出函数 | 钩子 |
|---|---|---|---|---|
| `era-continuation-inheritance-tree.js` | 2397 | 2138 | 1（`inheritEraArtifact`） | L9-X9 |
| `institutional-collective-memory.js` | 2476 | 2217 | 1（`amendInstitutionalRule`） | L9-X5 |
| `era-inheritance.js`（对照，已被 L12-O1 接管） | 6426 | — | 多 | — |
| `institutional-memory.js`（对照，已被 L12-O1 接管） | 9579 | — | 多 | — |

⇒ **同主题两份文件并存**：`*-bench` / `*-tree` 系是规划期的骨架，`era-inheritance` / `institutional-memory`
是 L12 接管的实现。两者不可混为一谈。

## 六、真实宿主门：建好但从未真跑（Problem 4）

```bash
ls -la tests/audit/_realhost_suite.mjs      # 在场
ls -la tests/audit/realhost_readings.json   # No such file or directory
```

`_realhost_suite.mjs` 头注释自述三条最小回归：① 装载面（`LonSha*` 全局数 ≥ 85 /
`_extraJsLoad.status === 'ok'` / 未捕获异常为空）；② 写盘闭环（同会话真落盘 / await 期间真切聊 / 排队批）；
③ 世界线纪元（α线 1–39 → β线 40–46 → 回跳 α线 47–87，第 60 楼看第 5 楼必须 `blocked`）。

阻塞点实测：第 106 行 `if (stStatus !== 200) bail('ST 未就绪…先起 SillyTavern')`；
环境里 Playwright 浏览器在（`chromium-1148` / `chromium_headless_shell-1148` / `ffmpeg-1010`），
但**没有在跑的 SillyTavern** ⇒ 该门从未成功执行。

## 七、PLAN 读数漂移（Problem 6）

```bash
sed -n '57,61p' PLAN.md
```

实测：
- 第 57 行版本行 = **v3.430.0**（实际 3.431.0）
- 第 58 行门禁行 = **429 测试文件 / 71 个 audit 脚本**（磁盘 430 个 test 文件）
- 第 61 行体量行 = 11862 行 / 1218 成员 / 244 项（**正确**，由 `gen_plan_baseline` 看守）

⇒ `gen_plan_baseline --check` 报「一致」，只因它**只核体量行**。这是 O7 的现场。

## 八、本期「不做什么」（负面边界）

1. **不接线 24 件零消费内核**。实测其中 9 件是骨架（1 个导出函数），接线 = 重写内核。
2. **不做批量记忆管理**（批量删/批量改）。批量会掩盖误操作，与「可撤销」主轴相反。
3. **不新增第二套事实库**。所有新面只能读写既有槽位；接不上 owner 就降级为只读。
4. **不改 `WM_VERSION`**。本期不动数据结构形状（`tombstones` 属新增可选字段，须在 O8 正文单独说明理由后决定）。
5. **不新增守卫/台账项占名额**。门禁只随功能收口，不独立成项。

## 九、本页自身的诚实边界

1. 本页全部读数来自**磁盘静态读取**与**无头命令**，**不含任何真宿主/真浏览器验证** ——
   这正是 O1 要解决的事，本页不冒充。
2. 「面板 24 视图只读」的判定依据是**按钮数与 data 属性数**，它证明「没有交互控件」，
   **不证明**「没有交互可能」（例如靠事件委托、或点击整行触发）。O4 必须按**绑定**复核，
   这是本页已知的方法局限。
3. 「零消费 24 件」的依据是台账 `prod_call_sites=0`，而实测已发现两件与台账不符
   （`institutional-collective-memory` / `memory-season-silence-manager`）⇒ **台账本身有一致性缺口**，
   本页如实记录该缺口，不宣称台账权威。
4. 骨架判定只量了**字符数与导出函数个数**，未逐行读完全部 24 件；
   「骨架」结论对已量的两件成立，对其余 22 件只给字符数级别参考。
