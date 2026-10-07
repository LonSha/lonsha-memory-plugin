# X 系列推进台账（v3.289.0 起）

> 用户指令（2026-10-06）：**继续推进 X2–X8，X2 放最后**；**双项目记得都推进**。
> 本台账是 X 系列实施的工作记录；验收原文以
> `.agents/notes/proposed/feature/2026-10-04-expansion-plan.md` 为**唯一真源**
> （本文件不复制验收原文，避免第二份真源）。

## 实施顺序（按用户指定：X2 放最后）

| 序 | 项 | 依赖 | 依赖是否满足 | 状态 |
|---|---|---|---|---|
| 1 | **X3** 注入策略对照与精确预演 | O3/O4 | ✅ 均已交付 | ✅ **v3.289.0 已交付**（`compareStrategies()` + 宿主消费点 + 诊断行 + `v3289` 判据 10 条全绿） |
| 2 | **X4** 手机事实受控准入 | 两仓保存与边界优化 | 部分（待核） | ✅ **v3.290.0 已交付**（判据 `tests/v3290_x4_fact_admission.test.mjs`） |
| 3 | **X5** 角色知识演变与传播证据 | X1/X4 | ✅ 均已交付 | ✅ **v3.291.0 已交付**（判据 `tests/v3291_x5_knowledge_trace.test.mjs`） |
| 4 | **X6** 分支语义对照与受控交接 | O1、X1/X2 | O1 ✅ / X1 ✅ / X2 未做 | ✅ **v3.292.0 已交付**（判据 `tests/v3292_x6_branch_semantics.test.mjs` 46 条） |
| 5 | **X7** 长篇剧情分卷与选择性接续 | X1/X5/X6 | ✅ 均已交付 | ✅ **v3.293.0 已交付**（判据 `tests/v3293_x7_volume_continuation.test.mjs` 48 条；含 G 段宿主真实落笔闭环 + 四条真源码破坏负控制） |
| 6 | **X8** 召回问题解释与有证据的策略建议 | O4/O6、X1/X3 | O4/O6 ✅ / X1 ✅ / X3 本批 | 待做 |
| 7 | **X2** 证据到真实修复的操作流程 | O1/O2/O4 | O1/O4 ✅ / O2 **仅交互逻辑切片、真浏览器面未执行** | 最后 |

## 双项目边界

- **lonsha-memory-plugin**（本仓，v3.293.0 → ）：X3–X8 主战场；X3/X4/X5/X6/X7 已交付，剩 X2（放最后）/X8。
- **ruby-phone**（实测 v3.63.0）：其拓展计划另有一套 X1–X8（编号相同、内容不同）。
  联动点在原文里点明：memory-plugin 的 **X3 与 RubyPhone X8 配套**、
  **X4 与 RubyPhone 手机事实**同源、**X5 联动 RubyPhone X5**、
  **X6/X7 与 RubyPhone X8 联动**。故两仓推进须**成对**核对契约（`open_face_registry` / 反向桥）。

### X6/X7 ↔ RubyPhone X8 联动核对（v3.293.0 实测）

**结论：本轮 X6/X7 落地对下游门禁零破坏，且不引入「必须先降级下游」的强耦合面。**
实测依据（两侧均为 `exit 0`，非推断）：

- 本仓外供登记表 `tests/audit/open_face_registry.tsv`：**5 面不变**（`projectionEnvelope` /
  `injectionReadout` / `eventPlatforms` / `evidenceWorkbench` / `checkpointCompare`），
  由 `scan_open_faces.mjs` 把守（`exit 0`）；反向表 1 面（`ruby.lonshaBridge`）由
  `scan_inbound_faces.mjs` 把守（`exit 0`）。
- 下游 ruby-phone 第十一道门 `scripts/upstream-face-audit.mjs`：**5 面 / 1 面（R12）/ 问题 0**
  （`exit 0`）。
- ★ **关键机制（本轮确认，决定了「能不能单方加行」）**：下游门禁的 **R3 是双向对账** ——
  它按「上游冻读取里的 face 集合 ↔ 本仓带 `upstreamFace` 的登记行」逐面互查。
  因此**上游单方新增一行外供面，会直接让下游门在无任何下游参数时翻红**
  （报「有面但下游没登记」）。⇒ X6/X7 的宿主入口（`buildBranchImport*` / `buildVolumePack` /
  `handoffVolumeContinuation` / `revokeVolumeHandoff` 与体检行）本轮**刻意不登记**进本表：
  它们目前不是下游已消费的面，登记即等于替下游「声明它已在消费」。
  真要外供，须与本仓表行、下游 `config/crossrepo-registry.js` 登记行 +
  `scripts/bridge-contract-audit.mjs` 的 `[face:]/[reader:]/[floor:]` 标签**三处同批**落地，
  并走下游 `--refresh` 重冻。
- `volume-continuation.js` 档头已显式声明：本模块**不 `require` X6、不引用其全局符号**，
  五面常量自持一份 ⇒ 本仓内部即无跨模块强耦合，X6/X7 可独立抬版（判据 H3/H4 钉住）。
- 下游侧现状：X8 第一切片（v3.62.0 分支对照工作区·只读）与第二切片（v3.63.0 受控恢复交接）
  已在 `feat/x8-resume-handoff` 分支落地；其消费面选型尚未指向本仓 X6/X7 的宿主入口
  ⇒ **联动待下游侧决定消费点后再成对登记**，本轮不做。

## 纪律（沿用本仓既有口径）

1. **成对判据**：每个新扫描器配判据套件，套件用合成仓 + 真源码破坏检验「判据真能翻红」。
2. **三档退出码**：0=卫生 / 1=真缺陷 / 2=结构漂移；「没得判 ≠ 通过」。
3. **判据纯度（H5）**：判定窗口不得混进说明文字 / 邻条内容；**判据不得被自己的解释掩盖**。
4. **当版锚**：全仓恰一个套件锚当版，其余退为下限锚；`vnum` 必为数值形态。
5. **诚实留痕**：把「首次踩坑 → 实际报错 → 根因 → 修法」写进 CHANGELOG / 扫描器档头。
6. **不跑全量**（用户纪律）：只跑单门 / 单套件；全量集中到计划收口后一次。
7. **不可测就写不可测**：缺模块 / 缺读数一律 `measurable:false` + `reason`，不用 0 冒充。