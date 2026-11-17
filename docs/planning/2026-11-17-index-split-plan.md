# index.js 拆解方案（L22-O1）· 实测基线

> 状态：**基线已落地，拆解未动刀**。本文只记读数与顺序，不含未完成的改动。
> 基线工具：`tests/audit/snapshot_index_structure.mjs`（`--write` 写账，`--check` 判漂移）
> 基线账本：`tests/audit/index_structure.json`

## 一、结构实测（2026-11-17）

`index.js` **13546 行**，形态是单个 IIFE：

| 块 | 起止 | 行数 | 说明 |
|---|---|---|---|
| 常量与辅助函数区 | 1–2240 | ~2240 | 302 个 IIFE 局部名（函数 244 个合计 1760 行） |
| `class MemoryEngine` | **2241–10711** | **8471** | 引擎主体，占全文件 62.5% |
| 类间杂项 / 桥 / 工厂 | 10712–11779 | ~1068 | 含 `window.lonsha_memory_bridge_v1`（13272–13527，256 行）等 |
| `class LonShaMemoryPlugin` | **11780–13161** | **1382** | 装配 / 注册 / 生命周期 / 事件层 |

结构快照共量到 **175 个块，覆盖 12295 行（90.8%）**。

## 二、依赖实测（决定能不能整块搬）

| 目标 | 行数 | 引用到的 IIFE 局部名 | 结论 |
|---|---|---|---|
| `MemoryEngine` | 8471 | **201 / 302** | 不能裸搬。要搬必须先把 201 个依赖显式化（注入袋或先抽辅助层） |
| `LonShaMemoryPlugin` | 1382 | **56** | 可搬。56 个里 40+ 是 `_xxxLib()` 一行包装（内部就是 `_moduleLib` 取库），其余 16 个需注入 |

## 三、拆解顺序（可逐步验证，每步独立提交）

**第 1 步：辅助层外移（不动类）**
- 目标：`index-helpers.js`，承载 244 个辅助函数中的**纯函数部分**（`sanitizeJson`、`extractThinkingChain`、`compareVersion`、`hash32`、`numOr` 等无 `this`、无插件状态的）。
- 接入方式沿用仓内既有先例（`memory-core.js` / `memory-aux.js`）：模块自挂 `window.LonShaXxx` + `module.exports`，入口用 `_moduleLib(() => window.LonShaXxx, 'index-helpers.js')`，并保留**同形兜底**。
- 验证：`snapshot_index_structure --check` 只允许「被搬走的块消失 + 其余块整体平移」；仓内判据真跑绿。

**第 2 步：外壳外移（1382 行）**
- 目标：`plugin-shell.js`，导出 `createPluginShell(deps)` 工厂；`index.js` 改为 `const LonShaMemoryPlugin = SHELL.createPluginShell({...})`。
- 56 个依赖显式化：40+ 个 `_xxxLib` 包装在新模块内重建（它们只是一行取库，不复制业务），其余 16 个由 `deps` 注入。
- 注意点：类里若引用 `plugin`（自引用），必须改成惰性 `deps.getPlugin()`，否则搬出后时序改变。

**第 3 步：引擎主体外移（8471 行）**
- 目标：`memory-engine.js`。**先做第 1 步**，否则要注入 201 个名字。
- 第 1 步完成后，`MemoryEngine` 的依赖会分成两类：已外移到辅助层的（走 `_moduleLib`）+ 仍在 IIFE 内的。后者才是需要注入的残余，实测数量应在第 1 步做完后重新量。
- 这一步必须**分片搬**：按引擎内的功能簇（生成 / 注入 / 账本 / 归档 / 诊断）逐簇搬，每簇一次提交、一次快照比对。

## 四、行为等价怎么算（不靠感觉）

1. **结构**：`snapshot_index_structure --check` 无意外漂移。
2. **导出面**：拆前拆后 `Object.keys(require('./index.js'))` 逐字相同（导出面快照待第 1 步时补进本工具）。
3. **判据**：仓内针对性判据真跑绿（**注意**：全量 `node tests/run.mjs` 在本环境跑不起来，只能逐个跑目标档）。
4. **双向取库**：`window` 全局命中与 `require` 回落两条路径都试（`_moduleLib` 的两条腿）。
5. **负控制**：故意删掉新模块，入口必须走兜底且**不抛**、`selfCheck` 报缺席而不是报绿。

## 五、已知风险（写在这里，拆的时候对照）

- **零测试覆盖**：全仓没有任何测试提到 `L22-O1`。这是拆解最大的风险，第 1 步之前应先补一条「入口可装载 + 导出面稳定」的最小判据。
- **本环境跑不动全量套件**：验证只能逐个目标档跑，覆盖面比 CI 窄。**在 CI 上补跑一次全量之前，任何一步都不算最终验收。**
- **`_moduleLib` 的缺席归因已有专门实现**（`_noteModuleFailure` / `_moduleFailureSnapshot`）：新模块必须复用这套归因，不许自己写 `catch(e){return null}`。
