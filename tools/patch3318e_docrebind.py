#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.318.0 收口补刀 E：全量实跑读数落文档（scan_doc_truthfulness D6 当场点名的 3 处）。

全量已于本版跑过（299/299 文件 · 3302 断言 · 0 失败 · 审计 61/61，已由
  tools/_rebind_doc_readings.py 零手抄重绑进 doc_readings.json）。
但两份文档仍停在「v3.296.0 快照 + 当前版本全量待验」——D6 两个方向同时翻红：
  ① 快照四元组 ≠ 登记值；② 登记已对齐当前版本却仍标「待验」（把已实跑说成没跑）。
纪律：每处锚点先校验恰中 1 次，全部通过后才写盘。
"""
import io, sys
R = '/home/user/lonsha-memory-plugin'
reps = []

# ---------- README L9：全量快照四元组对齐 + 撤销待验标记 ----------
reps.append((
 '**最近一次全量实跑快照**（`tests/audit/doc_readings.json`，由 `tools/_rebind_doc_readings.py` 消费 `TEST_SUMMARY_JSON` 零手抄写入）：v3.296.0 · 277 个测试文件 · 2986 断言 · 0 失败 · 审计 59/59。当前版本 v3.318.0 **全量待验** —— 上一快照 v3.296.0 是 X 系列八条全部交付时那个**计划收口点**的实跑读数（按用户纪律「做完计划全部内容前别跑全量」，集中到计划收口才跑一次）；本版起进入**第二期计划**（优化 M-O1~M-O9 / 拓展 M-X1~M-X9），盘面一动登记即不再同源，故回到「未实跑即标待验」的口径。**回到待验是规则，不是退步**（上一快照为 v3.284.0 · 264 · 2727 · 55/55）。两处读数**刻意分开**：合成一条就会把「盘上多了几个文件」写成「整片已通过」。',
 '**最近一次全量实跑快照**（`tests/audit/doc_readings.json`，由 `tools/_rebind_doc_readings.py` 消费 `TEST_SUMMARY_JSON` 零手抄写入）：v3.318.0 · 299 个测试文件 · 3302 断言 · 0 失败 · 审计 61/61。当前版本 v3.318.0 **已实跑收口** —— 本快照就是**第二期计划收口点**那一次的读数（优化 M-O1~M-O9 / 拓展 M-X1~M-X9 全部交付后跑的全量 `npm test -- --audit`：299/299 文件 · 3302 断言 · 0 失败 · 61/61 审计）。上一快照为 v3.296.0 · 277 · 2986 · 59/59（X 系列八条全部交付时那个计划收口点；再上一份 v3.284.0 · 264 · 2727 · 55/55）。两处读数**刻意分开**：合成一条就会把「盘上多了几个文件」写成「整片已通过」。'))

# ---------- README L46 / L112 / L123：历史括注从 3.296.0/277 换为 v3.318.0 现值 ----------
reps.append((
 '# 全部用例：（v3.296.0 现行为 277，见上）277 个测试文件',
 '# 全部用例：299 个测试文件'))
reps.append((
 '├── tests/                # 在役面：（v3.296.0 现行为 277，见上）277 个测试文件 + 59 个审计脚本（磁盘 63，4 个 `_` 探针除外；**现值见行 8**）',
 '├── tests/                # 在役面：299 个测试文件 + 61 个审计脚本（磁盘 67，6 个 `_` 探针除外）'))
reps.append((
 '**在役面**（磁盘枚举，不代表已实跑）：`tests/` （v3.296.0 现行为 277，见上）277 个测试文件（`*.test.mjs`，即 `npm test` 的扫描面）/ `tests/audit/` 59 个审计脚本（磁盘 63，4 个 `_` 探针不进门禁扫描面；**现值见行 8**）',
 '**在役面**（磁盘枚举，不代表已实跑）：`tests/` 299 个测试文件（`*.test.mjs`，即 `npm test` 的扫描面）/ `tests/audit/` 61 个审计脚本（磁盘 67，6 个 `_` 探针不进门禁扫描面；**现值见行 8**）'))

# ---------- PLAN L8：撤销待验标记 ----------
reps.append((
 '上一次收口点是 v3.296.0（X 系列八条全部交付时跑的实跑读数，登记见 `doc_readings.json`）；**当前 v3.318.0 全量待验** —— 本版起进入**第二期计划**（优化 M-O1~M-O9 / 拓展 M-X1~M-X9），盘面一动登记即不再同源，故回到「未实跑即标待验」的口径（回到待验是规则，不是退步），由 `scan_doc_truthfulness.mjs` 把守。',
 '**第二期计划（优化 M-O1~M-O9 / 拓展 M-X1~M-X9）已全部交付并收口** —— 故已于 v3.318.0 跑过那一次全量（299/299 文件 · 3302 断言 · 0 失败 · 审计 61/61，登记见 `doc_readings.json`）；上一次收口点是 v3.296.0（X 系列八条全部交付时的实跑读数）。此后回到「盘面一动即标待验」的口径（回到待验是规则，不是退步），由 `scan_doc_truthfulness.mjs` 把守。'))

# ---------- PLAN L31：全量快照表格行 ----------
reps.append((
 '| 全量快照 | 最近全量快照 **v3.296.0：277 测试文件 / 2986 断言 0 失败 / 审计 59/59**（上一快照 v3.284.0：264 / 2727 / 55/55）；当前 v3.318.0 **全量待验** | `tests/audit/doc_readings.json` |',
 '| 全量快照 | 最近全量快照 **v3.318.0：299 测试文件 / 3302 断言 0 失败 / 审计 61/61**（上一快照 v3.296.0：277 / 2986 / 59/59；再上一份 v3.284.0：264 / 2727 / 55/55）；当前 v3.318.0 **已实跑收口** | `tests/audit/doc_readings.json` |'))

s = {}
for name, rel in [('README', 'README.md'), ('PLAN', 'PLAN.md')]:
    s[name] = io.open(R + '/' + rel, encoding='utf-8').read()

for i, (old, new) in enumerate(reps):
    n = s['README'].count(old) + s['PLAN'].count(old)
    if n != 1:
        print('[patch3318e] 锚点 %d 命中 %d 次（应为 1）⇒ 退出，不写盘' % (i, n))
        sys.exit(1)

s['README'] = s['README']
for old, new in reps[:4]:
    s['README'] = s['README'].replace(old, new, 1)
for old, new in reps[4:]:
    s['PLAN'] = s['PLAN'].replace(old, new, 1)

io.open(R + '/README.md', 'w', encoding='utf-8').write(s['README'])
io.open(R + '/PLAN.md', 'w', encoding='utf-8').write(s['PLAN'])
print('[patch3318e] 写盘完成：README 4 处 + PLAN 2 处')
