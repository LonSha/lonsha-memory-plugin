# 第二十三期产品证据（2026-11-17）

> 本文件是 L23 / R23 三十六项（双仓各十八）的**立项依据留档**。每条结论附可复跑命令与真实读数。
> 纪律：**读数不手抄**（本文数字全部来自下列命令的真实输出），**未跑过的不写**。
> **本期的「36 项」只数产品项**：判据套件、台账刷新、门禁不给名额 —— 那是每一项交付时的**默认纪律**。

## 0. 现场基线

```
lonsha-memory-plugin   main = 550b433   dirty=0   v3.472.0   与 origin/main 同步
ruby-phone-v4155       main = 7cac358   dirty=0   v4.157.0   与 origin/main 同步
```

## 0.1 开工前的账实对账（必须先做，不占本期名额）

立项实勘时发现：v22 的**拓展九项**（L22-X1~X9、R22-X1~X9）确实落了盘，
但**优化九项**（L22-O1~O9、R22-O1~O9）有多项与 `CHANGELOG` 的「十八项同批交付」措辞不符。
本仓纪律要求：**发现账实不符先记账，不许用一个「补登」抹平两种事实。**

```
lonsha:
  wc -l index.js                                  → 13546   （L22-O1 声称已拆，实际未拆）
  module_consumption_ledger.load_surface_only_count → 11      （L22-O7 声称已处置）
  ls tests/audit/written_not_read*                → 无      （L22-O9 声称已交付）
rubyphone:
  wc -l apps/wechat/chat-view.js                  → 19977   （v21 立项 19775，R22-O1 声称已拆）
  ls apps/wechat/chat-render-core.js              → 不存在
  grep -c 'Date.now()' apps/wechat/chat-view.js   → 83      （R22-O5 声称已分类收口）
  coverage_baseline.totals.zero_test_dirs         → 10      （R22-O6 声称已补判据）
  event_subscribers.debt                          → 5       （R22-O7 声称已处置）
```

⇒ 本期第 0 刀：把 v22 九项优化逐条按 **已做 / 部分 / 未做** 三态重登，逐条附读数。

### 0.2 一条方法论教训（本期纪律，来自本次实勘自身）

实勘时曾用 `grep -c 'settings-search|settingSearch|设置搜索' = 0` 判定 R22-O2 未做 —— **这是误判**。
真实现叫 `config/settings-filter.js`，导出 `filterSettings`，关键标识符与计划书里写的名字不一致。

⇒ **本期纪律：关键词命中数不能当判据。** 判定「某能力是否已交付」只认三种证据：
① 判据套件真跑绿；② 台账字段真读数；③ 消费点真调用链（不是字符串登记）。
单靠 grep 名字命中得出的「未做」结论，**必须先找同义实现再下判断**。

## 0.3 本仓 v23 现场读数

```
wc -l index.js                    → 13546
wc -l engine-diagnostic-lines.js  →  5915
wc -l settings-ui.js              →  5787
wc -l memory-organs.js            →  3255
wc -l engine-injection-pipeline.js→  2957
wc -l memory-core.js              →  2424
ls *.js | wc -l                   →   395
ls tests/*.test.mjs | wc -l       →   529
ls tests/audit/*.mjs | wc -l      →    85
manifest.extra_js                 →   394

module_consumption_ledger:
  total_modules            395
  host_injected_count      241
  zero_consumption_count     1
  load_surface_only_count   11
  docs_probe_only_count      0
```

## 1. 本仓九个真缺口

### 1.1 巨型装配文件仍在长

`index.js 13546` 行，`engine-diagnostic-lines.js 5915` 行（第二大文件，**从未进过任何拆解计划**）。
L22-O1 声称已按「装配 / 注册 / 生命周期」拆分，实测行数与文件结构都没变。
⇒ **L23-O1 拆 `index.js`；L23-O5 拆 `engine-diagnostic-lines.js`。**

拆解纪律：**只搬不改**。导出面逐字不变 + 同一批 fixture 快照对拍零差异。
出现任一差异，回头改搬运方式，**不许改判据**。

### 1.2 十一个模块只挂在装载面

```
load_surface_only_count → 11
```

被 `loadAll` 取到 ≠ 被业务用。L22-O7 承诺「真接线或明确降级」，实测计数未变。
⇒ **L23-O2：11 个逐个定性为 `wired` 或 `declared_dormant`，计数归 0，理由不许写「待后续」。**

### 1.3 仍有一个零消费模块

```
zero_consumption_count → 1
```

⇒ **L23-O3：接线或归档，计数归 0。** 负控制：把消费点注释掉，判据必须翻红。

### 1.4 realhost 读数无人读

```
tests/audit/realhost_readings.json:  "verdict": "environment-unavailable"
```

生成器在写，没有门在读。⇒ **L23-O4：给 realhost 接一道门。**
`available` ⇒ 必须真有读数且过阈值；`unavailable` ⇒ 必须如实记 `cause`。**两态不同形**，不许压成一句「没环境」。

### 1.5 写了不读无扫描

无 `written_not_read*` 台账。历史上这类缺陷两次靠运气发现。
⇒ **L23-O6：键/字段级扫描，产出可处置清单。** 空清单本身要能被判据证明「真的空」，不是「扫描器没跑」。

### 1.6 注入回执覆盖不全

`tests/audit/_assembly_receipt_judge.mjs` 已存在，三档差异（`silent` / `lied` / `swapped`）已分列，
但只覆盖部分注入路径。⇒ **L23-O7：覆盖全部路径，含失败 / 跳过 / 降级，每面不同形。**

### 1.7 视图真开未逐个成立

`settings-ui.js` 有 34 处 `showBrowser` 分支。L22-O3 承诺「静态可达 → 真打开」，未见逐分支判据。
⇒ **L23-O8：逐个**真调**：不抛 + 产物落 DOM + 带机器可读面态（`data-face-state` / `data-ls-face` / `data-pov-state`）。**

### 1.8 冻读取新鲜度无独立冻读表

`tests/audit/_freshness_judge.mjs` 存在（三态判定体），但盘上没有对应冻读取集合。
⇒ **L23-O9：冻读取带时间戳，三态 `fresh/stale/expired`，过期即红并给可复制刷新命令。
缺时间戳一律判 `expired`（fail-closed）。**

### 1.9 可回源能力稀薄（喂给拓展面）

L21 交付的 `evidence-query.js`（1669 行）是条目级证据查询，
但「一条记忆能不能回溯到某次对话的某句话」没有机器守的出口。
⇒ **L23-X1 / X6 / X7 这一族全部围绕「可回源」立。**

## 2. 复跑命令

```bash
cd /home/user/lonsha-memory-plugin
wc -l index.js engine-diagnostic-lines.js settings-ui.js
ls *.js | wc -l ; ls tests/*.test.mjs | wc -l ; ls tests/audit/*.mjs | wc -l
node -e "const m=require('./manifest.json');console.log(m.version,(m.extra_js||[]).length)"
node -e "const d=require('./tests/audit/module_consumption_ledger.json');console.log({total:d.total_modules,host:d.host_injected_count,zero:d.zero_consumption_count,lso:d.load_surface_only_count})"
node -e "console.log(require('./tests/audit/realhost_readings.json').verdict)"
node --test --test-reporter=tap tests/v3480_closeout_fourth_phase.test.mjs | grep -E '^# (tests|pass|fail)'
```

## 3. 与 rubyphone 的关系

两仓共用本证据书。RubyPhone 侧读数见 §4（由 ruby-phone 仓维护），
L23 的「可回源族」与 R23 的「跨 App 时间轴族」在语义上互相依赖：
**LonSha 提供记忆层的可回源标识，RubyPhone 提供事件层的时间锚**，两侧都只报可回源/不可回源，不互相猜。
