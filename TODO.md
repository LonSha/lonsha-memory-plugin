# TODO — LonSha 记忆插件

> 只记**已确认、未修复**的项。修掉即从本文件删除，并在 CHANGELOG 里留痕。
> 不许写「待优化」这类没有判据的空条目：每条都要能回答「怎么知道它还没修」。
> 最近更新：v3.202.0

## T1 版本守卫硬编码（反复咬人）
至少 9 个历史测试把上一版版本号写进**断言期望值**（不是 `vnum()` 滚动下界）：
`v3117_diagnostics` / `v3130_control_plane` / `v3147_cooldown_and_dual_hash` /
`v3169_ledger_selfreport` / `v3189_emotion_evidence` / `v3190_lifecycle_collapse` /
`v3193_recall_quality_and_cost` / `v3194_time_and_fact_version` /
`v3201_summary_reltime_and_diag_ledger`。
每次抬版都要人工批量替换（v3.202.0 实测替换 21 处，漏一处即门禁翻红）。
**怎么知道它还没修**：`grep -rn "'3\.202\.0'" tests/` 仍能命中非本版专属文件。
方向：统一改成「三源互等 + 不低于本版」的滚动口径（v3186 测试 21 / v3201 测试 18 已是该口径的样板），
或加一个审计脚本把硬编码版本号列为红灯。

## T2 并行跑假红（基线即存在）
`node tests/run.mjs` 并行执行时，`v348`~`v360` 等 8 个文件报红，
原因是对 `/tmp/ruby-phone-work/...` 的外部依赖缺失（单独跑有环境时全绿）。
**怎么知道它还没修**：并行跑一次门禁，看这 8 个是否仍在失败清单里。
方向：把这批测试的外部依赖夹具化（合成最小仓库 + 环境变量开关），
否则门禁的「红」永远要人工甄别真假。

## T3 v3116 死代码行数上界靠手抬
`tests/v3116_dead_code.test.mjs` 的总行数上界每次新增活跃模块都要人工改（v3.202.0 从 32450 →
32700）。上界本身是对的（不给死代码留余量），但「手抬」这件事产生了漏改风险。
方向：由「入口 + 已声明模块」的集合推导期望区间，或至少产出改写脚本 + 抬升理由模板。

## T4 九账楼层字段清单仍是手工枚举
`ledger-replay.js` 的 `LEDGER_ITEM_FLOOR_FIELDS` 是手写数组。若某本账将来新增楼层语义字段
（例如 `revealedAt` / `settledAt`），登记项不会自动跟上 —— 又是「新增忘了接线」的下一轮。
**怎么知道它还没修**：把某模块源码里的新楼层字段名与清单数组做差集，非空即未修。
方向：写一个审计脚本，扫 `*-ledger.js` / `fact-version.js` / `event-completeness.js` /
`repair-loop.js` 里出现 `Floor`/`floor` 的字段名，与清单比对并报差集。

## T5 豁免表里 `ledger` / `echo` 与 worldProg 子面的语义重叠待复核
v3.202.0 把 `ledger`（楼层账本）与 `echo`（回响池）列为豁免键，
但 `worldProg` 下已有 `echoLedger`（回声账本）与 `recallEcho`（前文回扣）——
三者是否指同一份真源、豁免是否正确，本轮未逐条实证。
**怎么知道它还没修**：读 `world-progress.js` 的 `export()` 与宿主 `this.echo` / `this.ledger` 的定义，比对字段来源。
