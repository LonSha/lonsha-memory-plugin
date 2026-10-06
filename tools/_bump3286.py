#!/usr/bin/env python3
"""v3.286.0 抬版：四源 + 三模块副本 + CHANGELOG 顶节 + TODO + README/PLAN 在役面读数 + v3285 交棒。

口径逐条沿用 v3.285.0 的 _bump3285.py：
  · 四源 = index.js / manifest.json / package.json / CHANGELOG 顶节（+ TODO 当前「最近更新」行）；
  · 模块侧逐字副本（memory-config / memory-core / memory-organs 的 `let VERSION`）随宿主同改，
    否则 bindDeps 注入旧版本号（v3.266.0 静默降级同族）；
  · 历史套件的**当版硬锚必须交棒为下限锚**（v3285 是本版前一档的 frontier 锚）。
  · 本版额外：README / PLAN 的「在役面读数」数字随磁盘真值同改 ——
    本刀新增 1 个测试档 + 1 个扫描器，不改成对就会把 v3.285.0 刚立的 D2/D5 判据当场弄红。
每处替换断言**恰中 1 次**，失配即退出、不写盘。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
OLD, NEW = '3.285.0', '3.286.0'
edits = []
FAIL = []


def sub_once(rel, old, new, why, required=True):
    p = ROOT / rel
    s = p.read_text(encoding='utf-8')
    n = s.count(old)
    if n != 1:
        if required:
            sys.exit('[bump3286] %s 锚点命中 %d 次（要求恰 1 次）：%s\n  锚点=%r' % (rel, n, why, old[:120]))
        print('[bump3286] 跳过（未命中）: %s —— %s' % (rel, why))
        return
    if old == new:
        sys.exit('[bump3286] %s 同值替换等于没改：%s' % (rel, why))
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
    sys.exit('[bump3286] CHANGELOG 顶节锚点命中 %d 次' % src.count(head_old))
entry = '''## v3.286.0

**O8 第二刀：门禁成本一致性（为测试成本建立可判的热点读数 + 计划陈旧口径收口）**

- **真缺口（本轮实测，两条）**：
  ① 计划 O8 的工作项写着「为测试成本建立热点读数，不减少负控制来换快」，而磁盘上**没有任何成本读数** ——
     `tests/run.mjs` 的摘要只有 `failed[]` 带 duration（**只有失败档有耗时**），通过的档耗时只活在控制台输出流里，
     `--audit` 段的 `slowest` 也只收 top3 ⇒ 「哪个档最慢」在磁盘上无从复算，「成本热点」这句话没有交付物。
  ② `PLAN.md` 的旧「## 优先级」节仍把**已交付的** A1/A2/T1 列为下一步，与代码事实冲突 ——
     而文档读者（含新会话）**无从分辨哪一节是现行排序**。

- **本刀交付**：
  · `tests/run.mjs` 摘要追加两个出口：`scope`（`{ patterns, full, jobs, testedAt }` —— **覆盖范围自述**的机器可读凭据）
    与 `tests.slowest`（全量逐档耗时 top30，降序、并列按文件名升序以保证可复现）。**只追加字段，不改既有语义**
    （`scan_doc_truthfulness.mjs` 消费的 `tests.total` / `wall` / `failed` 一字不动）。
  · `tools/_rebind_test_cost.py`：与 `_rebind_doc_readings.py` 同源口径的零手抄重绑工具 ——
    只读不测、只追加（`rebinds[]` 保留最近 12 条）、覆盖范围原样透传、
    **只有 `scope.full === true` 才推进 `measured_at`**（定向采样不得冒充全量）、fail-closed 从不落盘。
  · `tests/audit/test_cost_readings.json`：首份成本读数登记（**定向采样**：9 档，8 档通过 / 103 断言 / 16.0s）。
  · `tests/audit/scan_cost_truthfulness.mjs`（C1~C8，退出码 0/1/2）+ `tests/v3286_cost_truthfulness.test.mjs`（12 个 test）。

- **首份读数就抓到一个真热点**：`tests/v3285_o7_doc_truthfulness.test.mjs` 单档 **15473ms**，
  是次慢档 `v3282`（5336ms）的近 3 倍，其余在 1.4–1.8s。本刀**只建读数、不做优化**（计划原文要求「先记录新基线，再定目标设备预算」）。

- ★ **本刀最要紧的一条判据是 C5「覆盖范围自述」**：本仓明令「定向采样不得冒充全量」，
  而修前连「这次是全量还是采样」这个字段都不存在。C5 双向判：
  `full=true` ⇒ `measured_at` 必须等于该档 `version`（全量实跑必须盖版本章）；
  `full=false` ⇒ 必须带至少一个 `pattern`（既非全量也非定向采样 = 覆盖范围不可解释）；
  `full` 缺席按旧登记记入 notes、不判红（历史口径豁免）。

- ★ **实测踩坑并修正（写下来防后人重复）**：
  ① 扫描器首版**是恒绿探测器** —— 它只读 `tests/` 面，G（镜像根目录 `.js` 全删）与 T（`tests/` 下 `.mjs` 置 `// gutted`）
     两档都照样 exit 0，而 `tests/v3226_audit_sensitivity.test.mjs` 的 J3 判定「两档皆 0 = 恒绿探测器」
     （永远通过，人以为有它守着）。修法不是凑敏感度，而是补两条**本门真实存在的前提**的在场检查：
     `index.js` 的 `const VERSION`（C8 比对真源）与 `tests/run.mjs` 的 `slowest`/`scope` 出口（**本门所核读数的产出者**）。
     修后**三档实测 H=0 / G=2 / T=2**（`tools/_o8b_gt_probe.py`，最小镜像 + `LONSHA_AUDIT_ROOT`）。
  ② 补丁首版**不幂等**：锚点原文出现在替换文本开头 ⇒ 重跑会再插一遍（141→180→218 行）。
     改为哨兵前置检查（已在场即跳过）+ **回滚后重做**（`git checkout` 干净基线）。
  ③ 五条 C7 结构性 drift 里只有两条带「结构漂移」字样，另三条被判据套件误判成「没给归因」（假红）。
     修法是**统一写入侧措辞**，不是放宽读取侧断言。
  ④ 面下限写死 200/40 ⇒ 合成仓（几十个文件）每条用例都卡在「枚举塌陷 exit 2」，判据永远到不了。
     改为与 `scan_doc_truthfulness.mjs` 同形的 `numEnv(...) || (FIXTURE_MODE ? 1 : N)`。

- **计划陈旧口径收口**：`PLAN.md` 新增 `## 当前优先级（唯一现行排序 · 判据 scan_plan_currency.mjs）` 节，
  并给旧「## 优先级」节加 `> **【陈旧节 · 勿当排序读】**` 标记 ——
  本仓历史上有多处「优先级 / 起手」节，每一处在自己那轮之后都会变成陈旧陈述。

- **边界（诚实）**：① 扫描器**不自己跑测试**（审计段跑全量会自指，且把审计拖成分钟级），
  只核对「登记 ↔ 磁盘」与「登记自洽」；实跑读数的权威来源始终是 `TEST_SUMMARY_JSON=<path> node tests/run.mjs`。
  ② 耗时为**本机并发 7 的单次读数**：它证明「谁贵」，不承诺目标设备预算。
  ③ 跨机 / 跨时段的耗时波动**不判**（那会产出必然 flaky 的红）。

'''
cl.write_text(src.replace(head_old, entry + head_old, 1), encoding='utf-8')
edits.append(('CHANGELOG.md', '插入 v3.286.0 顶节'))

# ── PLAN 现行排序节随抬版更新（判据 scan_plan_currency.mjs 的 P3 钉这一条） ──
sub_once('PLAN.md', '> **当前执行状态（2026-10-06，v3.285.0）**',
         '> **当前执行状态（2026-10-06，v3.286.0）**', 'PLAN 执行状态行版本')
sub_once('PLAN.md', '本刀补「测试成本热点读数」与「计划陈旧标记」两面，随后 O8 收口。',
         'v3.286.0 第二刀已补「测试成本热点读数」（`tests.slowest` + `scope` 覆盖范围自述 + '
         '`scan_cost_truthfulness.mjs`）与「计划陈旧标记」（本节的唯一性 + 旧节陈旧标记，判据 '
         '`scan_plan_currency.mjs`）⇒ **O8 收口**。下一档起按下方第 2/3 条推进。',
         'PLAN 现行节进度更新')

# ── 三张文档的在役面读数随磁盘同改（新增 1 测试档 / 1 扫描器） ──
sub_once('README.md', '当前发现 **265 个测试文件**', '当前发现 **266 个测试文件**', 'README 在役面测试数')
sub_once('README.md', '当前发现 **56/56** 审计脚本（`tests/audit/` 磁盘 **59** 个',
         '当前发现 **57/57** 审计脚本（`tests/audit/` 磁盘 **60** 个', 'README 在役面审计数')
sub_once('README.md', '# 全部用例：265 个测试文件', '# 全部用例：266 个测试文件', 'README 用例说明')
sub_once('README.md', '# 在役面：265 个测试文件 + 56 个审计脚本（磁盘 59，3 个 `_` 探针除外）',
         '# 在役面：266 个测试文件 + 57 个审计脚本（磁盘 60，3 个 `_` 探针除外）', 'README 目录树')
sub_once('README.md', '**在役面**（磁盘枚举，不代表已实跑）：`tests/` 265 个测试文件（`*.test.mjs`，即 `npm test` 的扫描面）/ `tests/audit/` 56 个审计脚本（磁盘 59，3 个 `_` 探针不进门禁扫描面）',
         '**在役面**（磁盘枚举，不代表已实跑）：`tests/` 266 个测试文件（`*.test.mjs`，即 `npm test` 的扫描面）/ `tests/audit/` 57 个审计脚本（磁盘 60，3 个 `_` 探针不进门禁扫描面）', 'README 在役面小结')
sub_once('README.md', '当前版本 v3.285.0 **全量待验**', '当前版本 v3.286.0 **全量待验**', 'README 待验标记版本')
sub_once('PLAN.md', '| 版本 | **v3.285.0**（四源同源；本表原为 v3.266.0） | `scan_version_guard.mjs` |',
         '| 版本 | **v3.286.0**（四源同源；本表原为 v3.266.0） | `scan_version_guard.mjs` |', 'PLAN 版本行')
sub_once('PLAN.md', '| 门禁 | 在役面 **265 测试文件 / 56 个 audit 脚本**（磁盘 59）',
         '| 门禁 | 在役面 **266 测试文件 / 57 个 audit 脚本**（磁盘 60）', 'PLAN 门禁行')
sub_once('PLAN.md', '当前 v3.285.0 **全量待验**', '当前 v3.286.0 **全量待验**', 'PLAN 待验标记版本')

# ── TODO 当前「最近更新」行 ──
td = ROOT / 'TODO.md'
ts = td.read_text(encoding='utf-8')
old_td = '> **最近更新：v%s**' % OLD
if ts.count(old_td) != 1:
    sys.exit('[bump3286] TODO 最近更新锚点命中 %d 次' % ts.count(old_td))
note = ('> **最近更新：v3.286.0** —— O8 第二刀：**门禁成本一致性**。计划要求「为测试成本建立热点读数」，'
        '而磁盘上此前**没有任何成本读数**（`run.mjs` 摘要只有失败档带 duration；`--audit` 的 slowest 只收 top3）⇒ '
        '「哪个档最慢」无从复算。本刀给摘要追加 `scope`（覆盖范围自述）与 `tests.slowest`（逐档耗时 top30），'
        '新增零手抄重绑工具 `tools/_rebind_test_cost.py` + 登记 `tests/audit/test_cost_readings.json` + '
        '扫描器 `tests/audit/scan_cost_truthfulness.mjs`（C1~C8）与判据套件 `tests/v3286_cost_truthfulness.test.mjs`（12 个 test）。\n'
        '> ★ 首份读数就抓到真热点：`v3285_o7_doc_truthfulness.test.mjs` 单档 **15473ms**，是次慢档的近 3 倍（本刀只建读数、不做优化）。\n'
        '> ★ 最要紧判据是 C5「覆盖范围自述」：`full=true` ⇒ 必须盖版本章；`full=false` ⇒ 必须带 pattern；'
        '缺席按旧登记如实报出不判红。定向采样**不得**推进 `measured_at`（不得冒充全量）。\n'
        '> ★ 实测修正四处：① 扫描器首版是**恒绿探测器**（G/T 两档皆 0）⇒ 补两条真源在场检查，修后三档实测 H=0/G=2/T=2；'
        '② 补丁首版不幂等（锚点含于替换文本）⇒ 哨兵前置 + 回滚重做；③ 五条 C7 drift 措辞不统一致判据假红 ⇒ 统一写入侧；'
        '④ 面下限写死 ⇒ 改 env 可覆盖（同 scan_doc_truthfulness 口径）。\n'
        '> ★ 计划陈旧口径收口：`PLAN.md` 新增「## 当前优先级（唯一现行排序）」节，旧「## 优先级」节加陈旧标记。\n'
        '> **最近更新：v3.285.0**（历史留痕，原当前行）')
td.write_text(ts.replace(old_td, note, 1), encoding='utf-8')
edits.append(('TODO.md', '当前「最近更新」行抬版 + 历史留痕'))

# ── v3285 当版硬锚交棒为下限锚 ──
p = ROOT / 'tests/v3285_o7_doc_truthfulness.test.mjs'
s = p.read_text(encoding='utf-8')
hard = "assert.equal(vnum('3.285.0'), vnum(pkg), '本档恰锚当版');"
soft = ("/* [v3.286.0 交棒] 本档写于 3.285.0；转下限锚：后续版本须 >= 它，不得把历史档锁成恰好等于当版。 */\n"
        "    assert.ok(vnum(pkg) >= vnum('3.285.0'), '本档版本下界 3.285.0 不得被绕过（实 ' + pkg + '）');")
if s.count(hard) != 1:
    sys.exit('[bump3286] v3285 当版硬锚命中 %d 次' % s.count(hard))
s = s.replace(hard, soft, 1)
old_ok = "ok('三源同源；manifest.extra_js ' + mf.extra_js.length + ' 项全部真实存在；本档锚 v3.285.0');"
new_ok = "ok('三源同源；manifest.extra_js ' + mf.extra_js.length + ' 项全部真实存在；本档下界 v3.285.0（当版锚已交棒给 v3286）');"
if s.count(old_ok) != 1:
    sys.exit('[bump3286] v3285 收尾行命中 %d 次' % s.count(old_ok))
p.write_text(s.replace(old_ok, new_ok, 1), encoding='utf-8')
edits.append(('tests/v3285_o7_doc_truthfulness.test.mjs', '当版硬锚 → 下限锚（交棒）'))

for rel, why in edits:
    print('[bump3286] %-52s %s' % (rel, why))
print('[bump3286] 完成：%d 处' % len(edits))