# Agent Note: L14-O4 人物消歧与召回偏好可控
Status: implemented
## Problem
在原召回与反馈机制中，`dynamic-recall-route-feedback-hub.js` 虽具备基础的路由重排与粗粒度模块/年龄消歧，但缺少：
1. 跨世界线/平行分支隔离机制，导致不同世界线的同名角色在多线推演中串扰召回；
2. 一次性排除与单次查询临时偏好微调机制，导致反馈容易原地污染全局持久偏好，且无法撤销/回退临时偏好并复现原排序；
3. 召回结果条目上缺少直观的消歧与命中解释结构，界面无法向用户展示条目命中的具体成因。

## Decision
在 `dynamic-recall-route-feedback-hub.js`、`engine-recall.js`、`index.js` 和 `settings-ui.js` 中实施系统性闭环改造：
- **世界线消歧隔离**：在 `disambiguateEntities` 中注入 `targetWorldline` 判定，同名两人分属不同世界线时不串命中（通用世界线 `isUniversalWorldline` 特殊豁免）。
- **一次性排除与单次微调**：支持 `excludeIds` 与 `temporaryExclusions`；引入 `applyTransientRouteOverrides` 与 `snapshotFeedbackState`，支持在单次查询中做临时路由权重覆盖（`isTransient: true`），不污染宿主全局持久偏好，用户回退临时偏好即可完全复原原始候选排序。
- **条目命中与消歧解释**：提供 `explainRecallHit`，解析召回条目的路由命中类型、基础分、路线加权系数、世界线归属与消歧通过状态，并在 `settings-ui.js` 召回轨迹监控面板中落地展示。
- **自检与宿主接线**：补齐 `recallRouteFeedbackHubSelfCheck`，在 `index.js` 的 `_collectNewFace()` 中完成自检登记；在 `engine-recall.js` 召回执行链路中真消费消歧与临时偏好。

## Verification
- 专项测试：`node tests/v3450_l14_o4_recall_disambiguate.test.mjs`（5/5 通过，覆盖世界线消歧隔离、一次性排除、临时偏好不污染全局与排序复现、条目命中解释、自检契约）。
- 历史回归：`node tests/v3404_recall_route_feedback.test.mjs`（3/3 通过）。
- 语法与架构门禁：`scan_syntax.mjs`（839 个文件语法解析通过）、`scan_ui_binding.mjs`（A面通过）、`scan_module_wiring.mjs`（256 脚本零冲突通过）、`scan_module_consumption.mjs`（255 模块审计通过，零孤儿）。