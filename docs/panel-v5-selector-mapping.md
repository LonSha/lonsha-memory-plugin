# 面板 v5（`css/lonsha-panel-v5.css`）选择器映射清单

> 状态：**施工前置清单**（本文只做映射，不含任何代码改动）
> 版本：仓 3.482.0 · HEAD `6655477`（`feat(ui): wire LoreCodex workbench to the memory graph (stage-2)`）
> 取证日期：2026-11-24 · 取证方式：静态扫描真源码（可复算）

---

## 0. 一句话结论

v5 现在是**三层都不要**的状态，不是一个缺口：

| 层 | 现场读数 | 状态 |
|---|---|---|
| 开关（属性） | `dashboard-v2.js:582` 把 `data-ui-rev="5"` 写上；`v5On()` 默认开（`KEYS.v5='lonsha.ui.v5'`，缺省 `'1'`） | ✅ 到位 |
| 样式（规则） | `css/style.css:20` 最后一位 `@import lonsha-panel-v5.css`；63 条规则 / 37 个 `.lsm5-*` 类 | ✅ 到位 |
| DOM（类名） | `dashboard-v2.js` + `dashboard-shell.js` + `settings-ui.js` 共 **164 个不同类名，`.lsm5-*` 命中 0** | ❌ 缺席 |

**而且即便把类名接上，还有第二层**：v5 规则全是**单类名**（特异性 `(0,1,0)`），而现有旧规则大量是 `.ls-dash[data-ui="v2"] .ls-card` 这种 `(0,3,0)`。同元素上两个类都挂时，旧规则**仍然赢**。

⇒ 这跟 RubyPhone v4.200.0 刚修完的那件事是**同一族缺陷的第二份现场**：「样式写了、属性也在，但一条都不生效，且不报任何错」。那一版的原因是 base 来源数 = 2（未分层 + 2008 处 `!important` 压死皮肤层）；这一版的原因是 **DOM 类名缺席 + 特异性不足**。修法必须同时收口这两层，只接类名等于再交一次「写了等于没写」。

---

## 1. 现场读数（逐条可复算）

```bash
# ① v5 的类名与规则规模
grep -o '\.lsm5-[a-z0-9-]*' css/lonsha-panel-v5.css | sort -u | wc -l   # 37
grep -c '{$' css/lonsha-panel-v5.css                                    # 63 条规则

# ② 现有产出点里 lsm5 的命中数（0 的证明）
grep -rn 'lsm5' --include=*.js . | wc -l                               # 0

# ③ 现有类名字面量总数
for f in dashboard-v2.js dashboard-shell.js settings-ui.js; do
  grep -o 'class="[^"]*"' $f | sed 's/class="//;s/"$//' | tr ' ' '\n'
done | grep -v '^$' | grep -v '\${' | sort -u | wc -l                   # 164

# ④ 开关真的在写属性
grep -n 'data-ui-rev\|uiRevOf\|KEYS.v5' dashboard-v2.js                 # 22/23/61/62/582/728/787/793/794
```

作用域：`:is(.ls-dash[data-ui-rev="5"], .lsm5)`。也就是说 —— **根上挂 `data-ui-rev="5"` 已足够让 v5 的令牌块生效，缺的只是元素级类名**。这一点很重要：不需要再动开关代码。

`--v5-*` 令牌全部在该作用域块里声明（`lonsha-panel-v5.css:18-37`），因此**只要元素挂着 `lsm5-*` 且处在 `data-ui-rev="5"` 的面板内，令牌自动可用**，JS 侧不需要声明任何变量。这是 v5 设计上最省事的部分，清单里不需要给令牌开列施工项。

---

## 2. 逐条映射（37 个 `.lsm5-*` → 现有 DOM 产出点）

图例：**A** = 可直接换/加类名（结构一对一）；**B** = 近似映射（语义一致但层数/命名不同，需同时调整选择器）；**C** = 现有 DOM **无对应**（要么新建包裹层，要么在 v5 里收敛掉）。

### 2.1 顶栏 / 标题

| v5 选择器 | 映射到 | 产出点 | 类 |
|---|---|---|---|
| `.lsm5-hd` | `.ls-dash-title`（头部容器） | `dashboard-shell.js:324`（`head.classList.add('ls-dash-title')`，内含 `ls-dash-title-ico` + `ls-dash-title-text`） | A |
| `.lsm5-title` / `.lsm5-hd > h2` | `.ls-dash-title-text` | `dashboard-shell.js:324` | A |
| `.lsm5-sub` | `.ls-hero-sub` / `.ls-v2-status-sub` | `dashboard-shell.js:163`；`dashboard-v2.js:262` | B |

### 2.2 控件

| v5 选择器 | 映射到 | 产出点 | 类 |
|---|---|---|---|
| `.lsm5-search` | `.ls-v2-search`（label） | `dashboard-v2.js:319`；其内部 `<input type="search" data-v2-q>` 对应 `.ls-v2-search input`（`dashboard-v2.css:283`） | A |
| `.lsm5-input` | `.ls-input2` / `.ls-input` / `.ls-input-sm` | `settings-ui.js`（`ls-input`、`ls-input-sm` 字面量）；`.ls-input2` 规则在 `lonsha-settings.css:642` | B |
| `.lsm5-textarea` | `.ls-textarea` | `settings-ui.js`（`ls-textarea` 字面量）；规则 `lonsha-settings.css:682` | A |
| `.lsm5-select` | — | **无**（全仓 `grep '<select'` 零命中） | **C** |
| `.lsm5-seg` / `.lsm5-seg > button` | `.ls-seg` / `.ls-seg-btn` | `dashboard-shell.js:167-168`、`dashboard-v2.js:285`（档位）、`:320`（视图 `ls-v2-views`）、`:246-247`（主题） | A |
| `.lsm5-ib`（图标按钮） | `.ls-card-link` | `dashboard-shell.js:188/193/228`、`dashboard-v2.js:275/277/286`；关闭按钮 `.lonsha-sheet-close` | B |

### 2.3 列表与行

| v5 选择器 | 映射到 | 产出点 | 类 |
|---|---|---|---|
| `.lsm5-list` | `.ls-rows`（v2）/ `.ls-list`（v1） | `dashboard-v2.js:345`（`<ul class="ls-rows">`）、`:326`（骨架）；`dashboard-shell.js:198/205`（`<ul class="ls-list">`） | A |
| `.lsm5-row` | `.ls-row2`（v2）/ `.ls-list-item`（v1） | `dashboard-v2.js:345`（`<li class="ls-row2">`）；`dashboard-shell.js:200/205`（`<li class="ls-list-item">`） | A |
| `.lsm5-row-main` | `.ls-row2-main` / `.ls-list-main` | `dashboard-v2.js:345`；`dashboard-shell.js:200/205` | A |
| `.lsm5-row-txt` | `.ls-row2-text` / `.ls-list-text` | 同上两处 | A |
| `.lsm5-row-sub` | `.ls-row2-sub` | `dashboard-v2.js:345`（`${it.sub ? …}` 分支） | A |
| `.lsm5-row-acts` | — | **无**：现有列表项**没有任何操作区**（hover 浮出删除/编辑之类）。v5 里 `.lsm5-row:hover .lsm5-row-acts{display:flex}` 是空规则 | **C** |
| `.lsm5-dot`（含 `.on` / `.long`） | — | **无**：现有状态点只有 `.ls-hero-dot`（`dashboard-shell.js:162`）与 `.ls-v2-status-dot`（`dashboard-v2.js:261`），都是**整条状态条**的点，不是列表行首的点；`lsm5-dot.long`（"long"=长时记忆）在现有 DOM 里没有这个概念 | **C** |

### 2.4 空态

| v5 选择器 | 映射到 | 产出点 | 类 |
|---|---|---|---|
| `.lsm5-empty` | `.ls-empty2`（v2）/ `.ls-empty`（v1） | `dashboard-v2.js:212`（`emptyHTML()` 产出 `ls-empty2`），调用点 `:345/353`；`dashboard-shell.js:195/197/231`（`ls-empty` + `ls-empty-ico`） | A |
| `.lsm5-empty-icon` | `.ls-empty2-art` / `.ls-empty-ico` | `dashboard-v2.js:212`；`dashboard-shell.js:195/197/231` | B |
| `.lsm5-empty-txt` | `.ls-empty2-title` | `dashboard-v2.js:212` | B |
| `.lsm5-empty-sub` | `.ls-empty2-sub` | `dashboard-v2.js:212` | A |

> 注：v1 的 `.ls-empty` 是**单层文本**（无 title/sub 分层），接 v5 时需要先升级为 `ls-empty2` 的层数，否则 `empty-txt` / `empty-sub` 无落点。这也是 `dashboard-shell.js` 与 `dashboard-v2.js` 两套渲染器**必须一起改**的原因 —— 面板存在两条渲染路径（v1 原地增强 / v2 整体升级）。

### 2.5 编辑区

| v5 选择器 | 映射到 | 产出点 | 类 |
|---|---|---|---|
| `.lsm5-edit` | — | **无**编辑区容器 | **C** |
| `.lsm5-field` | `.ls-row`（一行一控件的容器） | `dashboard-shell.js:249/253`（`<label class="ls-row ls-switch">`）；`settings-ui.js`（`ls-row`） | B |
| `.lsm5-field-row` | — | **无**两列表单行（现有全是单列全宽） | **C** |
| `.lsm5-label` | `.ls-switch-title` / `.ls-group-title` | `dashboard-shell.js:249/253`（`ls-switch-title`）、`:245/252/256`（`ls-group-title`） | B |
| `.lsm5-toggle` | `.ls-switch` | `dashboard.css:688`（规则）；DOM：`dashboard-shell.js:249/253`、`dashboard-v2.js:724/725/764` | A |
| `.lsm5-switch`（含 `::after`） | `.ls-switch input[type="checkbox"]` | `dashboard.css:176-208`（现有开关是 `input` 上的 `::after` 滑块）；DOM 同上 | B |
| `.lsm5-toggle-label` | `.ls-switch-text` | `dashboard.css:696-698`；DOM 同上 | B |

### 2.6 卡片 / KPI / 表格

| v5 选择器 | 映射到 | 产出点 | 类 |
|---|---|---|---|
| `.lsm5-card` | `.ls-card` | `dashboard-shell.js:177/185/192/203/227`；`dashboard-v2.js:274/276/277` | A |
| `.lsm5-card-hd` | `.ls-card-head` | 同上（每个 `ls-card` 的第一个子 div）；`dashboard-v2.css:45/53` 为旧规则 | A |
| `.lsm5-card-bd` | — | **无**：现有卡片是**三段平铺**（`ls-card-head` + 直接子元素 + 直接子元素），没有统一的 body 层 | **C** |
| `.lsm5-kpis` | `.ls-kpis` | `dashboard-shell.js:179`（`<div class="ls-kpis">`） | A |
| `.lsm5-kpi` | `.ls-kpi` | `dashboard-shell.js:180/181/182` | A |
| `.lsm5-kpi-num` | `.ls-kpi-v` | 同上三处 | A |
| `.lsm5-kpi-label` | `.ls-kpi-k` | 同上三处 | A |
| `.lsm5-table` | — | **无**：除 `dev-console-v3.js:413` 的 `class="dc-kv"` 诊断表外，产品面没有表格 | **C** |

> ⇒ v5 的「表格语言」在现有 DOM 里**只有一半落点**：`kpis`（`.ls-kpis/.ls-kpi/.ls-kpi-v/.ls-kpi-k`，4 个类）能做一对一，而 `table` / `card-bd` / `row-acts` / `dot` / `select` / `field-row` / `edit` 七处完全没有产出点。

### 2.7 页签

| v5 选择器 | 映射到 | 产出点 | 类 |
|---|---|---|---|
| `.lsm5-tabs` | `.ls-dash-nav` | `dashboard-shell.js:289`（`<div class="ls-dash-nav" role="tablist">`） | A |
| `.lsm5-tab` | `.ls-dash-tab` | `dashboard-shell.js:290`（`<button class="ls-dash-tab" role="tab" aria-selected>`） | A |
| `.lsm5-tab.on` / `[aria-selected="true"]` | `.ls-dash-tab[aria-selected="true"]` | 同上；`dashboard-shell.js:388/397` 负责切换 `aria-selected` | A |

> 注意：`lsm5-tab` 的 `.on` 与 `[aria-selected="true"]` **两条写了同一套样式**。现有 DOM 只维护 `aria-selected`（不写 `.on` 类），所以接上后只需让 `aria-selected` 这条路径生效即可，不必额外加 `.on` 类 —— 但 v5 里已写了 `.on` 分支，属于**冗余但无害**（保留即可，将来若有人改成 class 切换则自动可用）。

### 2.8 第 9 节（面板容器几何）

这两个不是 `.lsm5-*`，但同属 v5 且**已经在作用域内生效**（选择器是 `:is(.ls-dash[data-ui-rev="5"], .lsm5) :is(...)`）：

| v5 选择器 | 现有 DOM | 产出点 | 说明 |
|---|---|---|---|
| `:is(.ls-dash[data-ui-rev="5"], .lsm5) .ls-sheet-header` / `.lonsha-sheet-header` | `.lonsha-sheet-header` | `settings-ui.js`（`lonsha-sheet-header`） | 已有落点，**这一条现在就该生效** —— 如果用户看到的还是旧内边距，说明 `data-ui-rev` 没挂到 `.ls-dash` 上，或该 sheet 不在 `.ls-dash` 之下（`css/dashboard-v3.css:32` 用的是 `:has()` 祖先匹配，v5 用的是后代匹配，二者对「sheet 在 dash 内部/外部」的假设不同 —— **这是需要现场确认的一处**） |
| `:is(.ls-dash[data-ui-rev="5"], .lsm5) .ls-sheet-body` / `.lonsha-sheet-body` | `.ls-sheet-body-scroll`（`settings-ui.js`） | 同上 | 名字不同：v5 找 `ls-sheet-body`，现有是 `ls-sheet-body-scroll`，**多半打不中** |

---

## 3. 特异性分析（第二层缺口，比缺类名更难发现）

现有旧规则的形状（实测抽样）：

| 旧规则 | 特异性 | v5 对应规则 | 特异性 |
|---|---|---|---|
| `.ls-dash[data-ui="v2"] .ls-card`（`dashboard-v2.css:45`） | (0,3,0) | `.lsm5-card` | (0,1,0) |
| `.ls-stat2-grid`（`:188`） | (0,1,0) | `.lsm5-kpis` | (0,1,0) |
| `.ls-v2-toolbar`（`:263`） | (0,1,0) | `.lsm5-hd` | (0,1,0) |
| `.ls-v2-search input`（`:283`） | (0,2,1) | `.lsm5-search` | (0,1,0) |
| `.ls-dash[data-ui="v2"] .ls-card-title`（`:53`） | (0,3,0) | `.lsm5-title` | (0,1,0) |
| `.ls-switch input[type="checkbox"]`（`dashboard.css:176`） | (0,2,1) | `.lsm5-switch` | (0,1,0) |
| `.ls-dash[data-ui-rev="3"] .ls-dash-tab`（`dashboard-v3.css:62`） | (0,2,0) | `.lsm5-tab` | (0,1,0) |
| `.lonsha-sheet:has(.ls-dash[data-ui-rev="3"]) .lonsha-sheet-header`（`:40`） | (0,4,0) | v5 第 9 节 | (0,2,0) |

结论：**v5 的每一条规则都输给对应的旧规则**（唯一例外是 `ls-dash-tab`，v5 若加上 `data-ui-rev="5"` 前缀可反超 v3 的 (0,2,0)）。

三条可选修法（**决策点，需要你拍**）：

| 方案 | 做法 | 代价 | 我的判断 |
|---|---|---|---|
| **① 加前缀** | 把 v5 全表选择器统一加 `.ls-dash[data-ui-rev="5"] ` 前缀 ⇒ 每条升到 (0,2,0)+ | CSS 侧 63 条规则全改；`flatten`（首屏要改的内容）+ 需要保证 `.ls-dash` 祖先存在 | 与 v3 的既有做法一致（`dashboard-v3.css:17` 就是这么干的），**最贴合本仓惯例** |
| **② 提高单个类** | 给元素同时挂 `lsm5-card` + 在 v5 里写 `.ls-dash[data-ui-rev="5"] .lsm5-card` | 同 ①，但只对需要赢的规则加 | 与 ① 实质相同 |
| **③ 收口旧规则** | 旧规则加 `:not([data-ui-rev="5"])` 或整体包 `@layer` | 动旧视觉层，风险高；本仓没有 `@layer` 使用先例 | **不推荐**：这正是 RubyPhone 那次「来源数 2」的翻版 —— 用新一层去压旧一层，而不是收口 |
| **④ 用 `@layer` 分层** | 把 `lonsha-panel-v5.css` 包在 `@layer lsm5` 里并让它在 `style.css` 中最后 import | 引入本仓未使用过的机制；`@import` 顺序已保证后置 | 可作长期方案，但不该在第一次接线就引入 |

我倾向 **①**（与 v3 同法，仓内已有先例、有判据可循）。

---

## 4. 施工方案（按依赖排序，不是按文件排序）

### 阶段 0：先立判据，再动代码

必须先写一个 `tests/panel-v5-wiring.test.mjs`，至少 6 条：

- **P1 类名产出面**：`dashboard-v2.js` / `dashboard-shell.js` 里 `lsm5-` 字面量计数 **≥ 20**（当前 0，防「写了 CSS 没接线」）。
- **P2 一对一覆盖**：本文第 2 节标记为 **A** 的 17 个类，必须在产出点出现（逐条断言，不许只断总数）。
- **P3 无幽灵规则**：v5 里每个 `.lsm5-*` 选择器必须能在 JS 侧找到产出点，**或在白名单里写明「本版刻意不接」**（当前 C 类 7 个 + `row-acts`/`dot` 共 9 个需要这条）。
- **P4 特异性**：若采方案 ①，断言 v5 每条规则的选择器以 `[data-ui-rev="5"]` 开头（同 RubyPhone 的 C2 判据手法）。
- **P5 零 `!important`**：v5 表剥注释后 `!important` 计数 = 0（现有已满足，作为棘轮钉住）。
- **P6 负控制**：真源码副本上摘掉 `dashboard-v2.js` 里某一处 `lsm5-card` ⇒ P2 必须转红；删掉 v5 一条规则 ⇒ P3 必须转红。

判据写法直接照抄 RubyPhone `tests/system-v4200-layer.test.mjs` 的 `stripComments()` / `rulesOf()` / `withTamper()` 三件套（已实战验证过：注释里的字面量会骗到判据，`@keyframes` 的 `from/to` 会被误当选择器）。

### 阶段 1：A 类接线（17 个，机械且低风险）

按渲染器分组，**一次只动一组并复跑**：

1. **顶栏组**（`lsm5-hd`/`lsm5-title`）→ `dashboard-shell.js:324`。
2. **页签组**（`lsm5-tabs`/`lsm5-tab`）→ `dashboard-shell.js:289-290`。
3. **KPI 组**（`lsm5-kpis`/`kpi`/`kpi-num`/`kpi-label`）→ `dashboard-shell.js:179-182`。
4. **卡片组**（`lsm5-card`/`lsm5-card-hd`）→ `dashboard-shell.js` 5 处 + `dashboard-v2.js` 3 处。
5. **列表组**（`lsm5-list`/`row`/`row-main`/`row-txt`/`row-sub`）→ `dashboard-v2.js:345` + `dashboard-shell.js:198/200/205`。
6. **分段组**（`lsm5-seg`）→ `dashboard-shell.js:167-168` + `dashboard-v2.js:285/320/246`。
7. **搜索组**（`lsm5-search`）→ `dashboard-v2.js:319`。
8. **空态组**（`lsm5-empty`/`empty-sub`）→ `dashboard-v2.js:212` + `dashboard-shell.js:195/197/231`。

接线纪律（照 RubyPhone 那次的教训）：
- **只加类名、不删旧类名**（`class="ls-card lsm5-card"`）。删旧类会立刻打穿旧视觉层的 63 条规则，回退通道消失。
- **一处改完立刻能回退**：v5 的开关已经是默认开的，回退方式是关 `lonsha.ui.v5`。所以旧类必须留着，否则「关掉 v5 就一片空白」。
- **两套渲染器都要改**：v1（`dashboard-shell.js` 原地增强）与 v2（`dashboard-v2.js` 整体升级）是两条路径，只改一条会导致同一个用户在两种模式下看到不同结果。

### 阶段 2：B 类（10 个，需要同时调 v5 选择器）

B 类的共同形态是「v5 假设了现有 DOM 没有的层数」。两条路：
- **B-接**：把 DOM 改成 v5 的层数（如给 `.ls-empty` 补 title/sub 两层）。
- **B-收**：把 v5 选择器改成兼容现有层数（如 `.lsm5-empty-txt` 同时匹配 `.ls-empty2-title`）。

建议：**空态组走 B-接**（`emptyHTML()` 一处集中产出，改一处全覆盖）；**开关组走 B-收**（`.ls-switch input` 结构被 `dashboard.css:176-208` 的滑块逻辑深度绑定，动 DOM 风险大）。

### 阶段 3：C 类（9 个，需要决策）

| 类 | 三个选项 |
|---|---|
| `lsm5-select` | ① 产品面无下拉 ⇒ 从 v5 删掉；② 把某处控件改成 `<select>`；③ 白名单「预留」 |
| `lsm5-table` | 同上（唯一 `<table>` 在诊断控制台，属另一层） |
| `lsm5-row-acts` | ① 给列表行加操作区（真功能增量）；② 从 v5 删掉 |
| `lsm5-dot`（`.on`/`.long`） | ① 列表行首加记忆类型点（语义：`.on`=本会话记忆 / `.long`=长时记忆）；② 删掉 |
| `lsm5-card-bd` | ① 给卡片加 body 包裹层；② 从 v5 删掉 |
| `lsm5-edit` / `lsm5-field-row` / `lsm5-field` | ① 建真编辑区；② 删掉 |

**我的建议**：本版只做 A + B（27 个类，覆盖 v5 的绝大部分视觉意图），C 类逐条写进白名单并注明「预留 / 无对应产出点」，**不为了用完 CSS 而发明 DOM**。理由与 RubyPhone 那次一致：CSS 写了不等于必须用，但**用了多少必须如实记账**，不能把「写了 37 个类只接了 20 个」说成「v5 已上线」。

### 阶段 4：v5 的第 9 节（面板容器几何）

这一节**已经生效**（选择器不需要 `lsm5-*`），但两处名字对不上：
- `ls-sheet-header` vs 现有 `lonsha-sheet-header` ⇒ v5 已用 `:is()` 两者都写了，**没问题**。
- `ls-sheet-body` vs 现有 `ls-sheet-body-scroll` ⇒ **打不中**，需要 v5 侧补上 `.ls-sheet-body-scroll`（或确认 `lonsha-sheet-body` 是否在场）。

**必须先做一次现场确认**：`data-ui-rev` 到底挂在哪个节点上。`dashboard-v2.js:582` 挂的是 `dash`（即 `.ls-dash`），而 sheet 是 `.lonsha-sheet` 的祖先链上 —— v5 用的是「`.ls-dash[data-ui-rev="5"]` 的后代」，v3 用的是「`.lonsha-sheet:has(.ls-dash[data-ui-rev="3"])`」。**如果 sheet 是 `.ls-dash` 的祖先，v5 这整节都打不中。** 这是清单里唯一需要真机/真 DOM 才能定的一件事。

---

## 5. 验收口径（诚实边界）

**能做（本仓可自证）**
- 类名产出计数：`grep -c 'lsm5-' dashboard-v2.js dashboard-shell.js`（现在 0）
- 规则与选择器的一对一/白名单完全覆盖（P1–P3）
- 特异性与零 `!important`（P4–P5）
- 负控制真转红（P6）

**不能做（必须明说）**
- **不能证明「用户看到的样子变了」** —— 这需要真 SillyTavern 宿主里打开记忆面板取证。本仓 `tests/` 没有浏览器层（RubyPhone 有 Chromium 驱动 + 场景文件，本仓没有）。所以本版接线完成后，外观是否真的变化**只能由你真机确认**。
- **不能证明特异性修法在所有宿主主题下都成立** —— 宿主主题可能注入自己的 `!important`（RubyPhone 那次就是 2008 处），`lonsha-panel-v5.css` 现在零 `!important` 是优点，但也意味着一旦宿主主题强势，v5 仍然会被压。这一点在本仓历史上没有取证过。

---

## 6. 与 RubyPhone v4.200.0 的形态对照（为什么值得记下来）

| | RubyPhone v4.200.0 | 本仓 v5 |
|---|---|---|
| 表面现象 | 「桌面改了但看起来原样」 | 「v5 写了但看起来原样」 |
| 第一层原因 | base 样式**两条来源**（未分层 + 2008 `!important`） | DOM **类名缺席**（0/37） |
| 第二层原因 | `@layer` 内的规则被 `!important` 恒压 | 单类名 (0,1,0) 输给旧规则 (0,3,0) |
| 共同形态 | **写了 ≠ 生效，且不报任何错** | 同左 |
| 判据缺位 | 语法门/导入门全绿 | 本仓 63 条 v5 规则**零判据盯住** |
| 修法方向 | 收口来源数 = 1 | 收口「CSS 类名」与「DOM 产出」两侧 |

两仓的教训可以合并成一句判据纪律：**任何视觉层引入新类名前缀时，必须先有「CSS 类名 ↔ DOM 产出点」的一对一判据，再写样式。** 先写样式后接线，必然出现这种「全绿但零效果」的静默期 —— 而且静默期可以很长（本仓 v5 从落盘到现在没有任何判据发现它一条都没生效）。

---

## 7. v5.1 施工决议（本轮已落地，**取代第 1 节的三条待拍板问题**）

### 7.1 参照物：baibai-git / SillyTavern-Horae（MIT）

同类记忆增强插件（★10，`github.com/baibai-git/SillyTavern-Horae`），外观上的做法不是「更漂亮的花纹」，而是**三条接线纪律**：

| Horae 的做法 | 为什么它不翻车 | 本仓原先的做法 | 后果 |
|---|---|---|---|
| 变量定义在**顶级容器**上（`#horae_drawer, .horae-modal, …`），规则只 `var(--horae-*)` | 换主题 = 改 20 个变量，不碰任何规则 | v5 已做到（`--v5-*` 从 `--lt-*` 派生） | ✅ 这层本来是对的 |
| 根作用域用 **`#horae_drawer`（ID，(1,0,0)）**，所有规则挂在它下面 | 不写 `!important` 也赢过宿主任意 class 规则 | v5 写**单类名** `.lsm5-x` (0,1,0) | ❌ 输给 `.ls-dash[data-ui="v2"] .ls-card` (0,3,0) |
| 覆盖**现有 DOM**，绝不给 DOM 加新类名去追样式 | 样式一写就生效，没有接线窗口期 | v5 发明 37 个 `.lsm5-*`，DOM 命中 **0** | ❌ 63 条规则全静默 |
| `!important` 只集中用在「抵抗宿主全局 button/input/checkbox」一处 | 债务可数、可审计 | v5 零 `!important`（这一条我们比它干净） | ✅ |

**结论：我们不需要抄 Horae 的变量表（本仓 `--lt-*` 有 300+ 个 token，比它全得多），要抄的是第 2、3 条 —— 那是它外观能落地、而我们落地不了的真正原因。**

### 7.2 决议一：用「别名接线」取代「给 DOM 加 164 个类名」

原方案（第 1 节 A 类 17 个逐条加类名）需要改 `dashboard-v2.js` / `dashboard-shell.js` / `settings-ui.js` 共 164 个类名产出点，且改完仍有特异性问题。**改为在 CSS 侧做别名**：

```css
:is(.ls-dash[data-ui-rev="5"], .lsm5) :is(.lsm5-card, .ls-card) { … }
```

- 根 `:is(.ls-dash[data-ui-rev="5"], .lsm5)` = (0,2,0)，别名 `:is(...)` = (0,1,0)，合计 **(0,3,0)**；
- 与旧层 `.ls-dash[data-ui="v2"] .ls-card` **打平**，平局由 `@import` 顺序裁决 —— v5 是最后一个导入（`css/style.css:20`），故必胜；
- 需要绝对安全的地方（开关、搜索输入）已经靠元素/属性再叠一层：(0,4,1) vs (0,2,1)。
- **DOM 零改动**：164 个类名一个都不用加，`lsm5-*` 仍作为语义 API 保留，未来真接线时零改动生效。

收益：C 类 9 个「无对应」问题**自动消失**（不再需要 DOM 产出），只剩 5 个真预留（`select / table / row-acts / dot / card-bd`）。

### 7.3 决议二：C 类不再「处置」，改为 RESERVED 登记

`tests/panel-v5-wiring.test.mjs` 里 `RESERVED = { lsm5-select, lsm5-table, lsm5-card-bd, lsm5-edit, lsm5-field, lsm5-field-row, lsm5-row-acts, lsm5-dot }`。判据要求：**每条规则的落点要么能被 DOM 源码证实，要么在 RESERVED 里留下指纹**。想偷偷加一条永不生效的规则，就得先改这张表。

### 7.4 决议三：第 9 节 `:has()` 已按 v3 同法改写

`.lonsha-sheet:has(.ls-dash[data-ui-rev="5"]) :is(.ls-sheet-header, .lonsha-sheet-header)` —— 与 `dashboard-v3.css:32/40` 同法；同时补上真实类名 `.ls-sheet-body-scroll`（`settings-ui.js`）。**仍未在真 DOM 验证**（见第 5 节诚实边界）。

### 7.5 判据（已落盘，6 条全绿 + 负控制已验证）

`tests/panel-v5-wiring.test.mjs`：

| # | 断言 | 负控制（注入后是否变红） |
|---|---|---|
| V5-1 | v5 是 `style.css` 最后一个 `@import`，且晚于 dashboard/v2/v3/settings | — |
| V5-2 | 每条规则 DOM 可证 或 RESERVED 登记（≥40 条） | 加 `.lsm5-ghost` → **红 ✅** |
| V5-3 | 每条顶层选择器都以根作用域开头 | 加裸 `.ls-dash-tab{}` → **红 ✅** |
| V5-4 | `measure()` 五项全零（复用 design-debt 口径） | — |
| V5-4b | 关键字色名也为零（补总门禁只数 hex/rgb 的漏） | 加 `color: red` → **红 ✅** |
| V5-5 | 根真的写 `data-ui-rev="5"`、`v5On()`、`lonsha.ui.v5`、`uiRevOf()` | — |

现有 5 个相关套件（v3476/v3478/v3480/v3481/v3482）复跑 **54/0**，无回归。

### 7.6 设计债门禁：从「从未生效」到真闸（本轮已落地）

`.design-debt-baseline.json` 之前**不存在** ⇒ `--ci` 永远 `exit 1` ⇒ 这道门禁从未跑通过一次。本轮：

- `node tools/design-debt-check.mjs --update-baseline` 写入基线；
- `package.json` 新增 `"check:design": "node tools/design-debt-check.mjs --ci"`；
- 实测 `--ci` **rc=0**，五项指标 `=` 不变。

**棘轮指向的是改善后的水位**，不是原始水位：

| 指标 | 改前 | 现在（= 基线） |
|---|---|---|
| 写死颜色 | 947 | **555**（−392，−41%） |
| !important | 122 | 122 |
| 内联样式 | 686 | 686 |
| <11px 字号 | 36 | 36 |
| 毛玻璃 | 31 | 31 |

颜色那一档的降幅全部来自一件事：`settings-ui.js` 里 **391 处 `var(--ls-x, #旧色)` 的死兜底**被删掉。这些兜底永远走不到（token 全部声明在 `css/lonsha-design.css` 与面板防御性副本上），但它们装的是 **2024 年的旧色值**，且已经和真源分叉 —— `--ls-warn` 真源是 `#fbbf24`，兜底写的是 `#d29922`。删掉等于顺手修掉一处「换主题不生效」的暗坑。

配套改了 4 个把旧形态写进断言的判据（`v3318` 的 `A_HINT/R_HINT`、`v357`、`v3437` 的破坏锚点），并把新增判据登记进 `tests/audit/catalog_reference_consumers.tsv`。改后重跑 143 个直连套件：**1564 通过 / 3 失败**，与改动前的 3 条**完全同一批**（`v374 静态关键字`、`scan_config_liveness` 的未声明键、`v3159 审计脚本全绿`）—— 都是存量红，与本轮无关。

### 7.7 中途放弃的一条路（记录在案，避免下次重走）

我先做的是**更彻底的那一版**：把 `settings-ui.js` 里那 246 行注入式 CSS（`style.textContent = \`...\``）整块外迁成 `css/lonsha-panel-settings.css`，把 394 处静态内联样式外化成 170 个 `ls-u-*` 工具类。数字很好看：颜色再降到 487、内联 686 → 293，而且 token 副本与真源合并成一份。

**但它把 15 条判据打红，且这些红是正确的** —— 它们咬的正是「样式住在 settings-ui.js 里」这个事实：`tests/audit/scan_ui_narrow_layout.mjs` 用 `CSS_ANCHOR = 'style.textContent = \`'` 抽 CSS、`v3271`/`v34230` 断言 token 作用域化在注入块里、`v3428O4`/`v3437`/`v3444`/`v357` 断言带内联属性的 HTML 片段。

结论：那次外迁不是「顺手改改」，而是一次**门禁面迁移**，要同步改 11 个文件（2 个 audit 扫描器 + 9 个判据）外加合成夹具。它值得做，但必须一个提交做完，不能夹在设计债清理里做一半。本轮已回滚，安全水位保住。

### 7.8 下一步（按性价比排序）

1. **真机确认**：切到 `data-ui-rev="5"` 看四个页签、列表、开关、空态、弹层 —— 本仓无浏览器层，只能由用户看；
2. **样式层外迁（7.7 那条路）**：一次提交做完 11 处门禁面迁移，收益是 colors→487、inline→293、token 单一真源；
3. 剩余 555 色里最大两块是 `css/lonsha-settings.css`（197）与 `css/lonsha-ui-kit.css`（152），都是纯 CSS 文件，可按 token 逐条收，无结构风险。