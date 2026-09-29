# P-3 快照外供面瘦身 — 只读取证探针

状态：`p3_snapshot_bytes=measured`（探针 `tests/audit/_p3_snapshot_probe.mjs` 可复跑；本环境已出读数）。
纪律：不改快照键面。超线性才立增量快照候选；平庸则 `not_done_until_superlinear`。
最新读数（复跑）：N=0:169B / N=10:1152B / N=50:5292B / N=200:21207B；slope_per_item=98.3/102.46/105.19；ratio_200_50=4.007；superlinear=false。

## 源

- `index.js` `buildBridgeSnapshot` **7702–7892**
- `buildBridgeSnapshotJson` **7898–7908**
- 负载字节：`snap.meta.selfBytes` = `JSON.stringify(snap)` **不含 meta** 的 length；0 = 不可序列化。

## 测不出时写什么

| 字段 | 值 |
| --- | --- |
| measured | false |
| reason | fork_unavailable |
| bytes_empty | null |
| bytes_scale | null |
| time_ms | null |
| superlinear | null |
| recommendation | not_done_until_measured |

禁止把 null 编成 0。

## 恢复 fork 后的最小曲线（仍不跑全量）

对「提取执行」独立实例（无账本、不现跑管线）量：

1. 空宿主：`buildBridgeSnapshot()` 一次，记 `meta.selfBytes` 与墙钟。
2. 人造 `status.characters` 规模 N ∈ {0, 10, 50, 200}（只塞可 JSON 的浅对象）。
3. 人造 `lifeDetails` 条数同阶。
4. 若 `selfBytes(N)` / N 明显上升，或墙钟相对 N 超线性 → 才开「增量快照」候选 Gate。
5. 否则记 `not_done`：瘦身收益未证实，键面不动。

命令（fork 恢复后，定向、非全量）：

```
node --input-type=module -e "
  // 禁止 import 整仓 extra_js；只提取方法体做沙盒量测。
  // 若提取失败：写 not_measured，不要伪造曲线。
"
```

【v3.252.0 更正】可执行器**已落盘**：`tests/audit/_p3_snapshot_probe.mjs`（可复跑，`_` 前缀不进门禁扫描面，与 `_probe_v3199_r2shift.mjs` 同形）。
实测读数（真跑）：`bytes_empty=169` / `slope_per_item(N=10,50,200)=98.3,102.46,105.19` / `ratio_200_50=4.007` / `superlinear=false` ⇒ `recommendation=not_done_until_superlinear`（快照键面不动）。
^ 上面那句「不充当可执行器」留作历史记录，不再代表当前状态。
