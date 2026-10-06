#!/usr/bin/env python3
"""v3.285.0 抬版：四源 + 三个模块副本 + v3284 当版硬锚交棒。

口径（沿用 v3.203.0 起的历史做法）：
  · 四源 = index.js / manifest.json / package.json / CHANGELOG 顶节（+ TODO「最近更新」）；
  · 模块侧逐字副本（memory-config / memory-core / memory-organs 的 `let VERSION`）随宿主同改，
    否则 bindDeps 注入的就是旧版本号（v3.266.0 静默降级同族）；
  · 历史测试**只锁自己出生版本**：v3284 的当版硬锚必须转为下限锚，不得随抬版改期望值。
每个替换都断言**恰中 1 次**（0 次 = 打偏，多次 = 不是定点），失配即退出、不写盘。
"""
import re
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
OLD, NEW = '3.284.0', '3.285.0'
edits = []


def sub_once(rel, old, new, why):
    p = ROOT / rel
    s = p.read_text(encoding='utf-8')
    n = s.count(old)
    if n != 1:
        sys.exit('[bump3285] %s 锚点命中 %d 次（要求恰 1 次）：%s' % (rel, n, why))
    if old == new:
        sys.exit('[bump3285] %s 同值替换等于没改：%s' % (rel, why))
    p.write_text(s.replace(old, new), encoding='utf-8')
    edits.append((rel, why))


# ── 四源 ──
sub_once('index.js', "const VERSION = '%s';" % OLD, "const VERSION = '%s';" % NEW, '入口版本常量')
sub_once('manifest.json', '"version": "%s"' % OLD, '"version": "%s"' % NEW, '插件清单版本')
sub_once('package.json', '"version": "%s"' % OLD, '"version": "%s"' % NEW, '包版本')

# ── 模块侧逐字副本（bindDeps 注入面） ──
for mod in ('memory-config.js', 'memory-core.js', 'memory-organs.js'):
    sub_once(mod, "let VERSION = '%s';" % OLD, "let VERSION = '%s';" % NEW, '模块侧副本（须 let）')

# ── CHANGELOG 顶节 ──
cl = ROOT / 'CHANGELOG.md'
src = cl.read_text(encoding='utf-8')
head_old = '## v%s\n' % OLD
if src.count(head_old) != 1:
    sys.exit('[bump3285] CHANGELOG 顶节锚点命中 %d 次' % src.count(head_old))
entry = '''## v3.285.0

**O8：当前事实、旧决策与门禁成本一致（第一刀：文档读数真实性）**

- **真缺口**：README/PLAN 的人读读数（当前版本 / 测试文件数 / 审计脚本数 / extra_js 项数 /
  根级模块数 / 断言数）此前**不在任何判据的枚举面内** —— 版本四源有 `scan_version_guard` 把守，
  运行时成功声称有 `scan_claim_truthfulness` 把守，但「文档里的数字」只有人眼。
  实测漂移已发生：README 同时写着 `extra_js`（79 项）与 78 项、版本停在 3.271.0、
  「248 个测试文件」与 PLAN「246」互相打架（磁盘真值都不是这两个）。
  与 v3.279.0「判据的面漏一类，结论就完全反了」同族：**文档面整个不在面内**。

- **本刀交付** `tests/audit/scan_doc_truthfulness.mjs`（D1~D8）+ `tests/v3285_o7_doc_truthfulness.test.mjs`（13 条）：
  · D1 README 当前版本 = `index.js` 的 `const VERSION`；
  · D2 README「在役面读数」行的测试数 / 审计门禁数 / 审计磁盘数 = 磁盘枚举；
  · D3 README 全文 `extra_js` 项数**只准一个值**且 = manifest 真值（防自相矛盾）；
  · D4 README 运行时模块数 = 根级 `.js` 数；
  · D5 PLAN 版本行 / 体量行 extra_js / 在役面门禁行 = 磁盘；
  · D6 **全量快照**四元组（版本·测试·断言·审计）↔ `tests/audit/doc_readings.json` 逐项一致，
      且登记滞后于当前版本时**两份文档都必须标「全量待验」**；
  · D7 面自证（文档非空 + 测试/审计/根级 JS 三条下限；枚举塌陷时「0 不一致」是空对空）；
  · D8 fail-closed：文档缺失 / 登记缺失或非法 JSON ⇒ **exit 2**（探测器失效，拒绝给结论）。
  退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移。

- **本刀的关键设计决定（写下来防后人改回去）**：**「当前在役面」与「最近一次全量实跑快照」必须分开陈述**。
  首版把「登记版本 ≠ 当前版本」直接判红，于是「新增一个测试文件」与「文档说谎」**同形** ——
  过门禁的唯一办法是提前跑全量，而用户纪律明确禁止（计划全部内容完成前不跑全量）。
  分成两条读数之后：盘上多了文件 ⇒ 在役面读数立刻变、门禁仍绿；
  未实跑 ⇒ 文档必须写「当前版本 vX **全量待验**」（写成已通过才是缺陷）。
  **反向也判**：登记已对齐当前版本却仍留「待验」标记，同属读数不实。

- **读数零手抄**：断言数只能来自一次真跑。`tools/_rebind_doc_readings.py` 消费
  `TEST_SUMMARY_JSON=<path> node tests/run.mjs --audit` 落盘的结构化摘要，写入
  `tests/audit/doc_readings.json`（含 `rebinds` 历史留痕，同 `host_beast_baseline` 口径：不覆盖、只追加）。
  扫描器只核对「文档 ↔ 登记」，**自己绝不跑全量**（审计段跑全量会自指，且把 33s 审计拖成 90s+）。

- **负控制（本刀自证不是装饰）**：合成仓上逐条造不一致 ⇒ exit 1 且点名到那条判据；
  文档/登记缺失、非法登记、三条面下限被顶高 ⇒ exit 2；健康仓 ⇒ exit 0；
  **真源码破坏四处**（摘掉 D1 比较 / 摘掉 D3 自相矛盾检查 / 摘掉 D6 登记滞后检查 / 拔掉面下限）
  ⇒ 对应判据必须**不再**翻红，证明判据真在起作用。
  ★ 实测踩到并已修：破坏副本首版写在仓根，而扫描器 `import '../_audit_lib.mjs'` 的解析基准是
  自身所在目录 ⇒ `MODULE_NOT_FOUND` ⇒ 恒 rc=1，四条负控制全部落空；
  且写进 `tests/audit/` 的**新增文件本身会改变被扫描面**（审计磁盘数与门禁数各多 1），
  D2/D5 继续翻红、掩盖被摘判据的效果。修法：覆盖夹具**已有**的门禁文件（`scan2.mjs`），
  保持与真源同形层级且不改变两个枚举读数。

- **边界（诚实）**：① 只判**可磁盘重算**的读数，叙事性文字与能力描述不判（那是人写的）；
  ② 历史口径段刻意豁免 —— README 有意保留「截至 v3.266.0，246 个测试文件」这类**如实留痕**，
  把它判红等于把诚实记录当缺陷（豁免须带版本/时点前缀，无前缀的数字仍判红）；
  ③ 断言数的权威来源是 `tests/run.mjs` 的摘要与 stdout 行，本刀不新增第二份真源。

'''
cl.write_text(src.replace(head_old, entry + head_old, 1), encoding='utf-8')
edits.append(('CHANGELOG.md', '插入 v3.285.0 顶节'))

# ── TODO「最近更新」（只改第一处 = 当前那一处） ──
td = ROOT / 'TODO.md'
ts = td.read_text(encoding='utf-8')
old_td = '> **最近更新：v%s**' % OLD
if ts.count(old_td) != 1:
    sys.exit('[bump3285] TODO 最近更新锚点命中 %d 次' % ts.count(old_td))
note = ('> **最近更新：v3.285.0** —— O8 第一刀：**文档读数真实性门**。README/PLAN 的人读读数'
        '（版本 / 测试文件数 / 审计脚本数 / extra_js 项数 / 根级模块数 / 断言数）此前**不在任何判据的枚举面内**'
        '（版本四源有守卫、运行时声称有守卫，文档数字只有人眼）。本刀新增 `tests/audit/scan_doc_truthfulness.mjs`'
        '（D1~D8，三档退出码 0/1/2）+ `tests/v3285_o7_doc_truthfulness.test.mjs`（13 条，含四处真源码破坏负控制）。\n'
        '> ★ 关键设计：**「当前在役面」与「最近一次全量实跑快照」分开陈述**。首版把「登记版本 ≠ 当前版本」直接判红，'
        '于是「新增一个测试文件」与「文档说谎」同形，逼人提前跑全量；分开后盘上多文件 ⇒ 在役面立刻变、门禁仍绿，'
        '未实跑 ⇒ 文档必须写「当前版本 vX **全量待验**」（写成已通过才是缺陷），反向（对齐了还标待验）同样判红。\n'
        '> 读数零手抄：断言数由 `tools/_rebind_doc_readings.py` 消费 `TEST_SUMMARY_JSON` 摘要写入 '
        '`tests/audit/doc_readings.json`（含 `rebinds` 追加留痕）；扫描器只核对「文档 ↔ 登记」，自己绝不跑全量。\n'
        '> 实测修掉两处负控制假绿：破坏副本写在仓根 ⇒ `../_audit_lib.mjs` 解析失败恒 rc=1；写进 `tests/audit/` 的'
        '新增文件本身改变被扫描面（审计磁盘/门禁各 +1）⇒ D2/D5 继续翻红掩盖被摘判据。修法：覆盖夹具**已有**门禁文件。\n'
        '> **最近更新：v3.284.0**（历史留痕，原当前行）')
td.write_text(ts.replace(old_td, note, 1), encoding='utf-8')
edits.append(('TODO.md', '当前「最近更新」行抬版 + 历史留痕'))

# ── v3284 当版硬锚交棒为下限锚 ──
p = ROOT / 'tests/v3284_o7_audit_copy_ledger.test.mjs'
s = p.read_text(encoding='utf-8')
hard = "assert.equal(vnum('3.284.0'), vnum(pkg), '本档恰锚当版');"
soft = ("/* [v3.285.0 交棒] 本档写于 3.284.0；转下限锚：后续版本须 >= 它，不得把历史档锁成恰好等于当版。 */\n"
        "    assert.ok(vnum(pkg) >= vnum('3.284.0'), '本档版本下界 3.284.0 不得被绕过（实 ' + pkg + '）');")
if s.count(hard) != 1:
    sys.exit('[bump3285] v3284 当版硬锚命中 %d 次' % s.count(hard))
s = s.replace(hard, soft, 1)
old_ok = "ok('三源同源；本档锚 v3.284.0');"
new_ok = "ok('三源同源；本档下界 v3.284.0（当版锚已交棒给 v3285）');"
if s.count(old_ok) != 1:
    sys.exit('[bump3285] v3284 收尾行命中 %d 次' % s.count(old_ok))
p.write_text(s.replace(old_ok, new_ok, 1), encoding='utf-8')
edits.append(('tests/v3284_o7_audit_copy_ledger.test.mjs', '当版硬锚 → 下限锚（交棒）'))

for rel, why in edits:
    print('[bump3285] %-46s %s' % (rel, why))
print('[bump3285] 完成：%d 处；四源 + 三模块副本 + CHANGELOG + TODO + v3284 交棒' % len(edits))
