# Agent Note: L14-O3 生成材料与实际注入逐条对拍

Status: implemented

## Problem

生成前的材料计划与真实注入链路已有各自的事实来源：`generation-memory-plan.js` 负责计划与预算选择，`injection-receipt.js` / `engine-injection-pipeline.js` 负责真实注入回执。但两者之间缺少稳定、逐条、可解释的对拍层，导致用户无法区分计划内已注入、预算裁剪、权限拒绝、一次性排除、计划外进入和无法归因。

相关的 L14 总体方案仍记录在 [L14 产品优化计划](../../proposed/architecture/2026-11-03-product-optimization-v14.md)；本笔记记录其中 O3 的实际落地边界，而不是宣称整期计划已完成。

## Decision

新增 `generation-material-reconcile.js` 作为纯函数、只读的 O3 派生层，并通过现有宿主注入链路消费它：

- 计划材料和实际块必须通过稳定 `materialId`（或显式的注入顺序映射）建立身份；禁止用正文文本 `includes` 或相似度猜测身份。
- 对拍层只消费既有 generation plan 与 `_lastInjectionDraft` / 注入回执，不复制预算算法、权限算法，不写入任何事实 owner。
- 状态保持可区分：`injected`、`temporarily-excluded`、`budget-trimmed`、`permission-rejected`、`plan-missing`、`outside-plan`、`unknown`；缺少身份映射时降级为 `partially-measurable`，而不是伪装成匹配。
- `excludeIds` 是本轮选择输入，不修改默认计划；取消准备返回 `writes:false` 与 `cancelled`，不产生 owner 写入。
- `engine-injection-pipeline.js` 只在调用方提供 `generationMaterialPlan` 时产生 `materialReconcile`，否则明确置空；设置面板只读展示该宿主结果，不重新计算预算或权限。
- 通过 `manifest.json`、`index.js` 自检登记、宿主依赖绑定和模块消费台账接入，保证加载、消费与审计口径一致。

## Alternatives considered

1. **复用 `generation-memory-plan.comparePlanConsumption` 并扩展为第二套裁剪器。**
   该方案看似改动小，但会把计划比较、实际回执、预算和权限判定再次混在一起，且不能保证真实注入块的稳定身份。改为独立派生适配层，保留各既有 owner 的单一事实来源。
2. **用注入正文与计划正文的 `includes` / 文本相似度进行匹配。**
   该方案在没有 ID 时容易给出“看起来匹配”的假阳性，无法证明权限边界和计划外进入。实现明确选择 `materialId` 优先，缺失时报告 `unknown`。
3. **把一次性排除写回 generation plan 或 owner。**
   这会把当前轮控制误变成默认配置变更，并破坏下一轮重算。实现将排除作为只读调用选项，下一轮不传排除集合即可恢复默认选择。
4. **仅在设置面板重新推导对拍结果。**
   这会产生第二个消费口径，可能与真实注入回执错位。实现让宿主在真实 `buildInjection` 完成后落下派生结果，UI 只消费 `materialReconcile`。

## Consequences

收益：

- 生成计划与实际注入之间有了稳定的逐条对拍结果和可解释状态。
- 权限拒绝、预算裁剪、临时排除、计划外进入和未知映射不会互相冒充。
- 对拍结果可被设置面板直接展示，且不新增事实写入或第二套预算算法。
- 没有计划时不会伪装成“已匹配”，异常时保持 `writes:false`，不阻断原有注入流程。

代价与边界：

- 真实调用方必须在本轮把 `generationMaterialPlan` 及必要的稳定 ID 映射传给 `buildInjection`；未提供计划时 `materialReconcile` 为 `null`，这不等于旅程已完成对拍。
- 没有 `materialId` 的实际块只能进入 `unknown` / `partially-measurable`，不能提供完整一致性结论。
- 本次验证覆盖模块、宿主静态接线、夹具回读和定向审计；尚未替代真实 SillyTavern 宿主中的触摸、窄屏、刷新与实际生成旅程验证。

## Verification

- O3 专项：`node --test tests/v3449_l14_o3_generation_material_reconcile.test.mjs`，4/4 通过。
- 相关回归与审计：合并执行 52 项测试，52/52 通过；覆盖生成计划、注入回执单一真源、L13-O6 注入回执面、模块接线和消费审计。
- `node tests/audit/scan_module_wiring.mjs`：256/256 脚本加载成功，已挂载未消费 0 个。
- `node tests/audit/scan_module_consumption.mjs`：255 个 extra_js 模块审计通过，零未登记孤儿；新增模块台账记录为活跃消费。
- `node --check` 已通过 `generation-material-reconcile.js`、`engine-injection-pipeline.js`、`index.js`、`settings-ui.js`，`manifest.json` 可解析。
- 待补充的发布前证据：全量 `npm test`、`npm test -- --audit` 以及真实 SillyTavern 宿主旅程验证；这些未完成前不将 O3 标记为完整真实用户旅程验收。
