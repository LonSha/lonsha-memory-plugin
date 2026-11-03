# Agent Note: L14-O5 事实有效期与双时间统一解释

Status: implemented

## Problem
`fact-version.js` 已能按 `from/to` 读取历史版本，`dual-time.js` 已能按 `occurred/disclosed/learned` 投影角色视角，但详情、查证、召回和注入之前没有共同的解释入口。结果是同一事实可能在查询面被正确判为历史，在注入面却继续出现；迟到披露也可能被误读为早期已知；缺少日期的事实还可能被当成当前事实。

## Decision
统一解释层放在 `temporal-validity-workflow.js`，只组合既有 owner 的读数，不复制有效区间或知识可见性的判据。

- `explainFact` 返回生命周期、事实版本、双时间和最终准入原因。
- `selectFacts` 作为召回/选材准入面；当前查询只收当前版本，历史查询必须显式给时点并允许历史。
- `readAt` 与 `resolveQuery` 作为详情/查证和整账查询适配面，保留 `unknownTime`，未知时点不回退成当前日期或当前楼。
- `index.js` 的 `timeRead`、`resolveFactsByTime`、`lookupFact`、`typedFactsBlocks` 均经该适配层；旧模块缺席时仍按既有降级契约返回。
- 没有 `from/to` 或明确剧情时点的事实默认为 `uncertain`，不会进入当前注入；调用方必须显式允许不确定事实。
- `dual-time.visibleAt` 仍是唯一角色可知性判据。`learned` 未知、早于 `disclosed` 或尚未到获知楼层时，事实不得进入该角色视角。

## Alternatives considered
- **把发生、披露、获知和有效区间压成一个时间字段**：实现短，但会丢失闪回、迟到披露和“事实发生但人物尚未知”的语义，因此拒绝。
- **在每个消费点各写一套过滤逻辑**：接线快，但详情、召回和注入会再次漂移；拒绝，所有消费点统一通过适配层。
- **继续默认放行 `uncertain` 事实**：对旧数据更宽松，但会把未知伪装成当前事实；拒绝，改为显式 `allowUncertain`。

## Consequences
正向结果：历史事实仍可按历史时点查询，旧版本不会进入当前注入；事后披露不会反写早期知情；未知时间会留下可诊断状态。代价是没有有效期或获知点的旧条目可能从当前注入中消失，需要后续补充结构化时间或显式放行策略；完整全量测试未在本批重复执行，验证采用小范围定向测试和相关回归测试。

验证：`tests/v3445_l14_o5_temporal_validity.test.mjs` 5/5；`tests/v3372_eighth_cycle_batch_a.test.mjs` 与 `tests/v3550_m6_o1_o5.test.mjs` 合计 40/40；相关文件 `node --check` 与 `git diff --check` 通过。
