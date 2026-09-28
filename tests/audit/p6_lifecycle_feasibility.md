# P-6 声明式生命周期注册 — 上游可行性取证（只读）

状态：静态抽样已做；运行时扫描 `not_measured`（fork 不可用）。
纪律：产品代码零改动、不抬 `3.251.0`、不做半套声明式框架。
对照：下游 ruby-phone v3.7.0 已判 **`not_done`**（覆盖 79.7% / 三路径语义一致率 45.5%）。

## 已读到的上游形态（index.js）

| 点 | 行号（磁盘） | 形态 |
| --- | --- | --- |
| `EXPECTED_EVENT_TYPES` | 11 | 结构校验下限常量 **7**（≠ 运行时 expected） |
| 运行时 `expectedEvents` | 17741–17748 | 由 `types.*` 可见性派生：MESSAGE_RECEIVED 硬前提 + 6 个条件项 |
| `LonShaMemoryPlugin` | 17144 | 插件壳 |
| `init` | 17201 | waitForST → loadModules → **registerEvents** → createUI |
| `bindEvent` | 17373–17397 | **唯一** on() 包装：类型校验 / 拒绝计数 / 登记与 on 同处 |
| `registerEvents` | 17399–17775 | 幂等：已有 handlers 则先 unregister |
| `unregisterEvents` | 17825–17841 | 按 handler 引用 off；无引用则跳过（防误删他人监听） |
| interceptor | 17863+ | 与 GENERATION_STARTED **并列**的注入入口（R2-D 已收尾到 `_injectionClose`） |

## 静态 `bindEvent(` 调用点（产品侧，本轮手数）

1. MESSAGE_RECEIVED `_h1` ~17474  
2. CHAT_CHANGED `_h2` ~17521  
3. MESSAGE_EDITED `_h3` ~17558  
4. MESSAGE_SWIPED `_h4` ~17605  
5. MESSAGE_DELETED `_h5` ~17662  
6. GENERATION_ENDED `_h6` ~17682  
7. GENERATION_STARTED `_h7` ~17731  

`bindEvent_call_sites = 7`（与 `EXPECTED_EVENT_TYPES` 字面相等）。  
运行时 `this._controlInfo.expected` **不使用该常量**，而用 types 派生 —— 常量是下限/结构哨，不是覆盖率。

七个 handler **全部是闭包**（`_h1`…`_h7`），零 App 实例、无可挂 `static lifecycleExits` 的对象。

## 与下游同名项是否同构

**否。** 下游对象是「每个 App 的 onChatChanged / 槽位回收」。  
上游对象是「宿主 eventSource 上 7 个 ST 事件 → MemoryEngine」。

- 三路径语义本就不要求相同：CHAT_CHANGED 走存档 load + 一长串会话隔离清理；MESSAGE_DELETED 走 preview→rollback→shift→save；unregister 只 off。
- interceptor 是 **第 8 条注入路径**，不经 bindEvent。声明式「7 事件表」会漏掉这条（假绿：表满了、注入仍可从 interceptor 进来）。
- 把下游方案原样搬上来 = 把唯一入口闭包伪装成可枚举 App 表，与 v3.165 bindEvent 假绿同族。

## 读数表

| 字段 | 值 |
| --- | --- |
| measured_static | true |
| measured_runtime | false（fork_unavailable） |
| bindEvent_call_sites | 7 |
| expected_event_types_const | 7 |
| runtime_expected_derives_from_types | true |
| interceptor_extra_injection_path | true（不经 bindEvent） |
| handler_shape | 100% closures |
| coverage_pct | null（闭包没有「App 覆盖率」可算） |
| three_path_agreement | not_applicable |
| recommendation | **not_done** |

禁止把 coverage_pct 编成 100（7/7 调用点 ≠ 声明式框架适用）。

## 结论

准入「声明式生命周期」在上游 **形态不成立**：没有 App 实例可声明出口。  
替代轴（有静态证据、未实施）：**按路径分档的处置矩阵**（CHAT_CHANGED / MESSAGE_* / GENERATION_* / interceptor / unregister），不是统一 `lifecycleExits`。

现有 `bindEvent` + 失败哨兵 + 派生 expected **保留**。否决候选 ≠ 放过接线。

本文件不充当可执行器；不改生产。