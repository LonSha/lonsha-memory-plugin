# LonSha 第十四期：源码证据、差异化与执行批次

日期：2026-11-03。规划快照：v3.445.0 / `ff2d5da10aa93fe25a8f92b119eb9b987e562f67`，顶层测试文件447个。创建前`git status --short`为空。这里只记录本地已读事实；本轮未复跑全量测试、未联网核对远端、未验证真实酒馆宿主。

[优化九项](../../.agents/notes/proposed/architecture/2026-11-03-product-optimization-v14.md) · [拓展九项](../../.agents/notes/proposed/feature/2026-11-03-product-expansion-v14.md)

## 现场复核与旧信息纠偏

- v3.445.0源码与manifest一致；PLAN自称L13十八项全部落地，但这只代表交付记录，不等于全部旅程/真实宿主完成。
- `index.js` 在`applyExtractedPayload`前后已经调用`roundSnapshotBefore/After`，旧PLAN/CHANGELOG“未接主链”段落已陈旧；本期O1不重复接线。
- `rg -n --glob "*.js" _roundSnapshots .`的直接引用只有`round-entry-snapshot.js`。这是持久化需追踪的线索，不是已经证明刷新丢失；通用序列化可能间接保留。O1必须用保存/重载证据裁定。
- `generation-memory-plan.js`已有选材、预算和计划/实际比较，`engine-recall.js`已有aliases与路由反馈消费。O3/O4处理用户闭环，不重写同名算法。
- `memory-migrate-pack`在宿主与面板已有三桩/双按钮/三档决策；O6不是重新开发导入导出。
- `tests/audit/state-report.json`仍显式记录全量读数3.431.0而当前3.445.0；本轮不伪造新全量结果。
- 对照研究存档用于确认混合检索、证据与时间等底座已有来源；本期不按研究自评宣布超越，也不把参考机制换名当新功能。

## 历史提案审计与增量分类

已按模块、机制词和历次拓展标题检索活跃笔记，排除archived。以下是本次规划相关性分类，不修改历史实施状态；没有把旧提案整体吸收或宣布失效。

- [2026-10-31-product-optimization-v13](../../.agents/notes/implemented/architecture/2026-10-31-product-optimization-v13.md)：部分重叠：第十三期交付底座和遗留边界，双向链接接管后续排序。
- [2026-10-04-optimization-plan](../../.agents/notes/proposed/architecture/2026-10-04-optimization-plan.md)：部分重叠：保留底座理由；本期仅承接有新增验收的用户旅程，旧待办不自动重开。
- [2026-10-06-doc-truthfulness-split](../../.agents/notes/proposed/architecture/2026-10-06-doc-truthfulness-split.md)：无关：不属于本次产品闭环取舍。
- [2026-10-08-optimization-plan-v2](../../.agents/notes/proposed/architecture/2026-10-08-optimization-plan-v2.md)：部分重叠：保留底座理由；本期仅承接有新增验收的用户旅程，旧待办不自动重开。
- [2026-10-12-product-optimization-v3](../../.agents/notes/proposed/architecture/2026-10-12-product-optimization-v3.md)：部分重叠：保留底座理由；本期仅承接有新增验收的用户旅程，旧待办不自动重开。
- [2026-10-15-product-optimization-v4](../../.agents/notes/proposed/architecture/2026-10-15-product-optimization-v4.md)：部分重叠：保留底座理由；本期仅承接有新增验收的用户旅程，旧待办不自动重开。
- [2026-10-20-product-optimization-v5](../../.agents/notes/proposed/architecture/2026-10-20-product-optimization-v5.md)：部分重叠：保留底座理由；本期仅承接有新增验收的用户旅程，旧待办不自动重开。
- [2026-10-22-product-optimization-v6](../../.agents/notes/proposed/architecture/2026-10-22-product-optimization-v6.md)：部分重叠：保留底座理由；本期仅承接有新增验收的用户旅程，旧待办不自动重开。
- [2026-10-24-product-optimization-v7](../../.agents/notes/proposed/architecture/2026-10-24-product-optimization-v7.md)：部分重叠：保留底座理由；本期仅承接有新增验收的用户旅程，旧待办不自动重开。
- [2026-10-24-product-optimization-v8](../../.agents/notes/proposed/architecture/2026-10-24-product-optimization-v8.md)：部分重叠：保留底座理由；本期仅承接有新增验收的用户旅程，旧待办不自动重开。
- [2026-10-24-product-optimization-v9](../../.agents/notes/proposed/architecture/2026-10-24-product-optimization-v9.md)：部分重叠：保留底座理由；本期仅承接有新增验收的用户旅程，旧待办不自动重开。
- [2026-10-29-product-optimization-v12](../../.agents/notes/proposed/architecture/2026-10-29-product-optimization-v12.md)：部分重叠：保留底座理由；本期仅承接有新增验收的用户旅程，旧待办不自动重开。
- [2026-10-04-expansion-plan](../../.agents/notes/proposed/feature/2026-10-04-expansion-plan.md)：部分重叠：保留底座理由；本期仅承接有新增验收的用户旅程，旧待办不自动重开。
- [2026-10-08-expansion-plan-v2](../../.agents/notes/proposed/feature/2026-10-08-expansion-plan-v2.md)：部分重叠：保留底座理由；本期仅承接有新增验收的用户旅程，旧待办不自动重开。
- [2026-10-12-product-expansion-v3](../../.agents/notes/proposed/feature/2026-10-12-product-expansion-v3.md)：部分重叠：保留底座理由；本期仅承接有新增验收的用户旅程，旧待办不自动重开。
- [2026-10-15-product-expansion-v4](../../.agents/notes/proposed/feature/2026-10-15-product-expansion-v4.md)：部分重叠：保留底座理由；本期仅承接有新增验收的用户旅程，旧待办不自动重开。
- [2026-10-20-product-expansion-v5](../../.agents/notes/proposed/feature/2026-10-20-product-expansion-v5.md)：部分重叠：保留底座理由；本期仅承接有新增验收的用户旅程，旧待办不自动重开。
- [2026-10-22-product-expansion-v6](../../.agents/notes/proposed/feature/2026-10-22-product-expansion-v6.md)：部分重叠：保留底座理由；本期仅承接有新增验收的用户旅程，旧待办不自动重开。
- [2026-10-24-product-expansion-v7](../../.agents/notes/proposed/feature/2026-10-24-product-expansion-v7.md)：部分重叠：保留底座理由；本期仅承接有新增验收的用户旅程，旧待办不自动重开。
- [2026-10-24-product-expansion-v8](../../.agents/notes/proposed/feature/2026-10-24-product-expansion-v8.md)：部分重叠：保留底座理由；本期仅承接有新增验收的用户旅程，旧待办不自动重开。
- [2026-10-24-product-expansion-v9](../../.agents/notes/proposed/feature/2026-10-24-product-expansion-v9.md)：部分重叠：保留底座理由；本期仅承接有新增验收的用户旅程，旧待办不自动重开。
- [2026-10-29-product-expansion-v12](../../.agents/notes/proposed/feature/2026-10-29-product-expansion-v12.md)：部分重叠：保留底座理由；本期仅承接有新增验收的用户旅程，旧待办不自动重开。
- [2026-10-31-product-expansion-v13](../../.agents/notes/proposed/feature/2026-10-31-product-expansion-v13.md)：部分重叠：第十三期交付底座和遗留边界，双向链接接管后续排序。

同词表重叠是有意复用：如记忆传播/口述史/改观/承诺/资料更新/分席/修复/传承/季候，以及手机交流/邀约/规则/清单/织信/分享/旅行/事务/离线均已有底座。X面逐项新增的是可操作的过程、状态和跨步骤结果；若现有产品已完整满足验收则合并该子项，不另造同名引擎。

## 六个大批次

| 批次 | 用户结果 | 记忆侧三项 | 手机侧三项 |
|---|---|---|---|
| A | 可靠地留下与返回 | L14-O1 / L14-O8 / L14-O5 | R14-O1 / R14-O2 / R14-O3 |
| B | 改错与办事可以放心 | L14-O2 / L14-O6 / L14-O9 | R14-O4 / R14-O5 / R14-O6 |
| C | 长篇与长用都流畅 | L14-O3 / L14-O4 / L14-O7 | R14-O7 / R14-O8 / R14-O9 |
| D | 交流与约定形成过程 | L14-X1 / L14-X2 / L14-X4 | R14-X1 / R14-X2 / R14-X4 |
| E | 准备下一幕与持续活动 | L14-X3 / L14-X5 / L14-X6 | R14-X3 / R14-X7 / R14-X8 |
| F | 回访、交接与体验收口 | L14-X7 / L14-X8 / L14-X9 | R14-X5 / R14-X6 / R14-X9 |

A–F覆盖全部36项且每项只分配一次。每批每仓三项，预计3–5个有效开发日、双仓并行；总容量约18–30日。工时依赖真实缺陷和宿主可用性，实施前再拆任务，不按一次小版本只改一行分散交付。跨仓不共建公共库、不互相写内部状态；桥版本、会话身份、来源id、权限缺席和操作回执逐边界核对。

## 验证与范围

本轮只改计划和导航，不升版本、不改运行时代码、不提交推送。验证四份计划各九项、双向相对链接、36项批次完整性、现有规划基线生成器与git diff。实施期间按仓库纪律做定向测试；整期收口再跑本仓全量，不把两仓测试入口混用。历史浏览器红点和真实宿主未验保留，不能靠更新计划文件消除。

侦察完整读取了手机AGENTS/CONTEXT；对巨大宿主文件按相关函数/调用点阅读，对旧提案按相关章节和标题做去重，未通读两仓全部源码。因此此处“已有底座”由已见符号及调用支撑；潜在行为缺口是实施假设，须先重现，不写成已证实缺陷。

## 本轮规划交付核验

- 四份计划各9项；六批覆盖36项且每项只出现一次，两仓批次表一致。
- 两仓 `node tools/gen_plan_baseline.mjs --check` 通过；PLAN/TODO当期入口、基线及编号已核对。
- 第十四期新笔记以字节副本通过技能原版format/tree校验；实际页面相对链接另由本轮检查器检查，不以副本校验代替仓内链接核验。
- 全库笔记校验仍不通过：历史笔记存在头块/必备章节格式遗留；记忆侧另有旧feature生命周期目录及v12断链，手机侧有v11断链。本轮不扩成历史治理，未声称全库校验通过。已修正本轮触及的记忆侧v13证据页和优化笔记链接。
- 改动仅Markdown文档；版本文件、更新日志、运行时代码和测试源码未改，未执行全量回归、真实酒馆测试或提交推送。
