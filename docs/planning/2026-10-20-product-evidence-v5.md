# 第五期规划证据 · lonsha-memory-plugin · 2026-10-20

这是规划时的代码/模块证据，不是36项功能的实现或验收声明。全部输入为合成示例；没有读取真实聊天、修改业务存储或发送模型请求。

## 基线与复跑

- 本仓：3.349.0 / main@5fdb841；对仓：4.30.0 / main@5edf59a。调查阶段两仓 fetch 成功，HEAD...origin/main 均为0/0；推送结果以本次提交后核对为准。
- Node v24.18.0。探针导入真实生产模块，健康例的 storage/状态 owner 与群消息为内存替身。它的 rc=0 只表示探针执行成功，**不表示被测行为正确**。
- 重跑（仓库根目录）：

```sh
node --check docs/planning/2026-10-20-product-probe.mjs
node docs/planning/2026-10-20-product-probe.mjs
```

不接入常驻测试/审计框架；后续实施将相应反例并入已有定向套件。修复后输出改变是预期，不应为守住这份历史读数而改坏实现。

## 本轮模块实跑输出

```json
{
  "crosscheck": {
    "negative": "matched",
    "missing": "unrealized"
  },
  "materialConflict": {
    "materials": [
      {
        "id": "confirmed",
        "usable": false,
        "conflictGroup": "住所",
        "floor": 10,
        "origin": "confirmed",
        "state": "superseded",
        "supersededBy": "rumor",
        "why": "superseded"
      },
      {
        "id": "rumor",
        "usable": true,
        "conflictGroup": "住所",
        "floor": 11,
        "origin": "reported"
      }
    ],
    "superseded": [
      {
        "id": "confirmed",
        "conflictGroup": "住所",
        "supersededBy": "rumor",
        "floor": 10
      }
    ],
    "winnerOf": {
      "住所": "rumor"
    }
  },
  "thread": {
    "spec": {
      "actors": [
        "甲",
        "乙"
      ],
      "floorFrom": 20
    },
    "from": [
      "actors",
      "floorFrom"
    ],
    "writesNothing": true
  },
  "modalityCopy": [
    {
      "id": "f",
      "subject": "甲",
      "predicate": "状态",
      "value": "死亡",
      "type": null,
      "conflictPolicy": "auto",
      "origin": "stated",
      "trust": 0.8,
      "from": null,
      "to": null,
      "floor": 10,
      "source": "",
      "evidence": "",
      "supersededBy": null,
      "revoked": false,
      "revokeReason": "",
      "revision": 1,
      "history": []
    }
  ],
  "tailRecall": false,
  "importReorder": {
    "added": 0,
    "removed": 0,
    "changed": 2,
    "same": 0
  },
  "commitmentCap": {
    "kept": 200,
    "first": "c1",
    "retainedOldest": false
  }
}
```

## 证据分级与边界

| 计划 | 证据 | 本轮能证明 / 不能证明 |
|---|---|---|
| M5-O1 | threadSpec 与宿主子计划 Object.assign 合并 | spec只产actors/floorFrom已复现；完整问答/分支结果未验，旧下界契约不能直接倒转 |
| M5-O2 | fact-version::copyFact/normalize + narrativeLayer默认事实源 | modality丢失已复现；未实测模型混入梦境 |
| M5-O3 | lore-crosscheck::verdictOf | 否定子串matched、空结果unrealized已复现；应加入覆盖与命题边界 |
| M5-O4 | material-pack::resolveConflicts | 最新floor胜出已复现，不能据此声称实际生成已经用了传闻 |
| M5-O5 | index.js::_materialInventory | 显式来源仅旧事/关系/视角/调用方；真实返回形状及逐事实权限要再对齐 |
| M5-O6 | lore-import::changedSections | 同名段仅换序判两处修改已复现；需区分移动/歧义/改写 |
| M5-O7 | unified-recall::nodeToCandidate/SEARCH_TEXT_MAX | searchText丢尾部已复现；其他召回通道的兜底效果未测 |
| M5-O8 | commitment-ledger::normalize/open | 201条有效open归一化裁掉最旧；写入→保存→重开的全链待实施验证 |
| M5-O9 | index.js::returnGateAdmit/returnGateMark、return-gate、memory-organs持久化 | 能力确实存在；根生产JS检索仅定义/注释，未找到生成调用证据；需实际请求回执闭环 |

承诺探针首稿错误使用title而非必需content，得到0条，那份结果无效且不采纳；修正后重新运行才得到200条且丢c0。探针最初字符串换行语法错误也已修正并通过node --check；本页只记录最终可复跑版本。

新X项已对照既有itemOps（物品状态/提取/回滚）、scene-book（到访/在场）、knowledge-trace（来源与知识状态）、causal-chain、视角卡、正史/叙事层与记忆包；不是“全仓没有物品/场景/知识链”。新增的是借还履约、目标依赖、多人物时间区间、独立证据根、群体知情交集、有意改设定影响、临时假设、周期实例、专题引用结论。它们是设计提案，不是缺陷复现结论。

## 规划验证记录

- 本轮探针语法/执行：rc=0；仅覆盖上述模块行为。
- 全库笔记校验的历史基线已在改动前运行：手机tree通过、format有第二期等21条格式错误；记忆tree有既存feature/层级错误，format共23行历史问题。不会静默洗绿，也不为纯规划重排历史笔记。变更后的新增问题差分及本次四份计划的定向结构检查在提交前执行。
- 根PLAN的记忆侧现行排序使用原scan_plan_currency判据；手机提交前遵守AGENTS的npm run check。检查本身不是计划功能完成证据。记忆侧本轮实跑：scan_plan_currency 与 scan_doc_truthfulness 均rc=0；三个相关定向套件 v3285_o7_doc_truthfulness / v3286_plan_currency / v3288_plan_currency_xface 分别16/13/10条通过，共39条、0失败。未另跑记忆全量。
- 浏览器/真实宿主/模型：本轮未执行。历史版本全量成绩不作为本次成绩，未实测问题与新功能验收都保留待验。

## 导航

[优化九项](../../.agents/notes/proposed/architecture/2026-10-20-product-optimization-v5.md) · [拓展九项](../../.agents/notes/proposed/feature/2026-10-20-product-expansion-v5.md) · [现行计划](../../PLAN.md)。

## 本次变更检查结果

- 四份新计划在两仓合计36个唯一编号；各仓2份新计划与2份仅增加接续链接的旧计划，技能格式定向校验各4篇通过。
- 新链接/UTF-8/编号/必备字段与git diff --check通过。全树技能校验相对改动前**新增错误0**；既有格式与层级错误保留，不声称全库笔记全绿。
- 本仓仅改计划、导航及docs/planning证据/只读探针；manifest/package/index/运行时业务代码未改。手机npm run check的成绩只记在手机证据页，不混作本仓回归。

## 双仓配对与不双计边界

[对仓现行计划](https://github.com/LonSha/ruby-phone/blob/main/PLAN.md)。以下每行是两个不同交付面，不是两个仓各实现一套同功能内核。

| 序号 | 记忆侧M5-X：语义与原生操作 | 手机侧R5-X：实际使用旅程 |
|---|---|---|
| 1 | 借还关系、持有权与约定证据 | 物品卡→查看→归还确认 |
| 2 | 目标依赖与有据达成 | 目标树→受阻原因→下一步入口 |
| 3 | 多人物时空区间与矛盾 | 时间带→出处→地点回访 |
| 4 | 传闻根与独立佐证 | 源头图→原消息→反证 |
| 5 | 群体可共享事实交集 | 换参与者→重算→群聊草稿 |
| 6 | 有意改设定的依赖与重算 | 影响选择→原生确认→撤销 |
| 7 | 假设工作集与正史隔离 | 双栏试写→丢弃或正式采纳 |
| 8 | 周期约定实例与履行 | 周期时段→例外→共同空档 |
| 9 | 专题证据引用与结论生命周期 | 选多书→专题组织→成稿交接 |

优化联动：M5-O1→R5-O9；M5-O4/O5→R5-O1；M5-O6→R5-O6。其余优化各自独立验证，不能因对仓通过而直接标完成。
