# 开发者控制台 v3.1：DOM 映射表

`ui/dev-console-v3.js` 只按下面这些 ID / 类名 / data 属性重排与重绘现有 DOM，不替换任何节点、不改任何绑定。
开关：`localStorage['lonsha.ui.v3'] === '1'`（与 dashboard v3 精修外观同一个开关，默认关）。关闭时按撤销日志逐项还原。

## 一、设置面板（`#lonsha-settings-overlay`，玩家构建 + 诊断构建）

| 现有 DOM（settings-ui.js） | 控制台里的角色 | 做法 |
|---|---|---|
| `#lonsha-settings-overlay` | 控制台根 | 加 `data-ls-dc="3"`；`.lonsha-sheet` 加 `dc-sheet`（1080 宽、16 圆角） |
| `.ls-tabs-nav` + `.ls-tab-btn[data-tab]` | 隐藏的真实页签 | 搬进 `.dc-panes`，CSS 隐藏；左侧导航点击时调用原按钮 `.click()`，由上游 `_syncTabs` 切换 |
| 新增 `.dc-side` | 左侧分区导航 | 5 个分区（general / narrative / health / retrieval / advanced），显示设置项数、未保存圆点；另一组构建的分区标 `data-remote` |
| `#ls-diag-entry` / `#ls-diag-back` | 跨构建切换 | 无未保存改动时代点；有改动时拦下并在保存栏说明；目标分区经 `sessionStorage['lonsha.dc.target']` 传给新面板 |
| `.ls-tab-pane[data-tab-pane]` | 分区内容 | 搬进 `.dc-panes`；搜索时加 `data-dc-title` 作为分区小标题 |
| 新增 `.dc-head` | 分区头 | 标题、说明、「N 项设置 / 只读」、「已修改 N」、「恢复默认」+ 确认条 |
| `.ls-group` / `.ls-group-title` | 内嵌分组卡片 / 分组标题 | 纯 CSS |
| `label.ls-row`（`ck()` 生成）+ `input[data-cfg]` | 开关行（标签+说明 / 开关） | CSS 把 checkbox 画成开关；行内追加 `code.dc-key`（配置键） |
| `.ls-slider-label` + `input.ls-slider[data-cfg-num]` + 紧随的 `.ls-hint` | 字段行（标签 / 说明 / 控件） | 原地包进 `div.dc-field`（兄弟顺序不变，上游 previousElementSibling 读数查找仍成立）；按档位数选控件：<=4 档分段控件，1 步长且 <=12 档步进器，其余滑杆 + 数值胶囊；新控件只改原 range 并派发 input / change |
| `.ls-slider-label` + `textarea.ls-textarea` / `input.ls-input` / `select` | 文本 / 等宽文本框 / 下拉字段 | 包进 `div.dc-field--textarea / --text / --block`；select 不包外层（上游档位同步依赖 previousElementSibling） |
| `#ls-secondary-apis`、`#ls-pyramid-tiers`、`[data-cfg-text=apiUrl/embeddingUrl/apiModel/embeddingModel]` | 行内校验 | JSON 对象 / 至少 3 层 / http(s) 地址 / 模型名无空格；只提示不拦截（上游保存器本来就会保留原值） |
| 连续的 `button.ls-btn` | 按钮排 | 包进 `div.dc-actions` |
| 分区级 `details`（渐进披露） | 全部展开 | 退出时恢复折叠 |
| `#ls-lab-search` / `#ls-lab-result` | 被全局搜索取代 | CSS 隐藏，DOM 与监听保留 |
| 新增 `[data-dc-search]` | 设置内搜索 | 匹配标签、说明、配置键；搜索时显示全部分区，未命中的行 / 组 / 分区隐藏；`/` 聚焦，Esc 清空 |
| `.ls-dirtybar` / `#ls-dirty-count` / `#ls-dirty-reset` / `#ls-save` | 粘底保存栏 | 玻璃底栏 + 状态点；点计数展开 `table.dc-kv` 改动表（配置键 / 已保存 / 当前）；Ctrl/Cmd+S 代点 `#ls-save` |
| `#ls-health-grid .ls-health-card[data-face]` | 状态列表 + 严重度徽标 | 纯 CSS（`::before` 写「正常 / 注意 / 严重 / 待测 / 缺席」） |
| `#ls-health-dev-body` | 等宽查看器 + 复制 | 包进 `div.dc-code`，加工具条 |
| `.ls-settings-footer` | 重操作卡片 | 搬到分区末尾，按分组卡片样式显示 |
| 内联 `style` | 归一 | 装饰性声明移走（颜色 -> `data-dc-tone`、左边框 -> `data-dc-edge`、粗体 / 等宽 / 小字号 -> `data-dc-strong / mono / small`）；`display` / `visibility` / 百分比宽高 / 自定义属性保留；还原时写回 |
| `hardenButtons()` 写的 `!important` 内联色 | 不再写 | settings-ui 补丁：`[data-ls-dc="3"]` 内跳过；未打补丁时由上面的归一移走 |

## 二、其他面板

| 面板 | 现有 DOM | 控制台做法 |
|---|---|---|
| 健康检查（`showDiagnose`，`#lonsha-diag-overlay`） | v3.1 补丁改成 `.ls-dg-*` 结构 | 严重度汇总徽标（零值不着色）、检查项状态列表、统计键值网格、等宽错误日志 + 复制 |
| 注入预览（`showBrowser('injection')`） | `[data-inj-list]` `[data-inj-row][data-inj-kept][data-inj-partial]` `[data-inj-trim]` `[data-material-reconcile]`；v3.1 补丁新增 `[data-inj-payload]` `[data-inj-line=head/new/same]` | 预算计量卡（字符 / Token / 块留存，`<meter>` 带语义阈值）、逐条清单差异行（+ 进 / ~ 半段 / - 裁）、带行号的载荷代码视图、「只看新增」、复制原始载荷 |
| 记忆控制中心（`memory-center.js` 的 `.ls-mc-*`） | 原样 | 行内勾选、等宽 ref、分页器、受限正文遮蔽态 |
| 总览（`#lonsha-stats-overlay`） | `.ls-stat-grid` `.ls-stat-card` | 指标卡 |
| 可视化（`modules_combined.js` 的 `#lonsha-viz-panel`） | `.lonsha-viz-*` | 分段页签、指标卡、时间线 / 社区卡片；关闭按钮的乘号字符换成图标（还原时写回） |
| `memory-views.js` / `memory-checkup-page.js` / `memory-health-board.js` / `memory-visual-panel.js` / `injection-panel.js` | 纯数据模块，不产 DOM | 无 DOM 可排；只做字符串去 emoji |
