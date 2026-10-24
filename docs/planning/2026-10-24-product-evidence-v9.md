# LonSha 第九期计划证据与边界

## Current baseline

- 仓库：`lonsha-memory-plugin`，分支 `main`。
- 当前代码基线：`v3.373.0 / ac5c21a`；旧 V8 提案中的 `v3.371.0 / c17c33b` 仅作历史参考。
- 当前代码已包含事实状态/生命周期/版本、证据查询与求解、双时间、召回编排、生成材料计划与事实回执、维护会话、迁移边界和记忆工作台等模块。
- 真实产品主轴：把这些既有 owner 连成可回源、可裁决、可撤销、可接续的记忆用户闭环，而非继续扩张守卫系统。

## Plan links

- 优化提升：[`2026-10-24-product-optimization-v9.md`](../../.agents/notes/proposed/architecture/2026-10-24-product-optimization-v9.md)，M9-O1 至 M9-O9。
- 拓展创新：[`2026-10-24-product-expansion-v9.md`](../../.agents/notes/proposed/feature/2026-10-24-product-expansion-v9.md)，L9-X1 至 L9-X9。

## Non-goals

守卫、审计、版本、台账、发布和纯重构不独立占产品项；它们只随功能提供最小收口证据。不得创建第二套全局事实库，不得复制正文绕开 owner。事实、推断、演出、用户确认必须分型；所有演出默认不写入正史。

## Delivery rule

每项按六个切片推进：领域内核、现有 owner 接线、用户入口、持久化/回执、真实混合样本、定向回归与恢复路径。六片均完成才结项；单文件、单测试、纯审计或一次性模型演示不能代表完成。每项按至少三天连续实施规模设计，按工作包分期交付，不以小机制数量填充。
