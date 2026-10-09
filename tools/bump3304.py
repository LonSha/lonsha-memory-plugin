#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.304.0 · 抬版前真缺陷清扫收口抬版（五处缺陷的分类处置 + 新档登记）。

纪律（沿用 tools/bump3303.py / bump3302.py）：
  · 每处替换断言**恰中 1 次**；失配即退出；
  · **全部锚点先校验、通过后统一写盘**（不做「边校验边写」）；
  · 版本源 = index.js / manifest.json / package.json + 三份模块副本 `let VERSION`；
  · 当版锚（版本守卫 V4）= 本刀新档自带 vnum 字面量形；
  · 盘面连带（本版**不新增模块**、新增 1 个测试档）：
    extra_js 仍 87、测试文件 284 → 285、审计磁盘仍 64（不新增门）。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
OLD, NEW = '3.303.0', '3.304.0'
_log = []


class Doc:
    def __init__(self, rel):
        self.rel = rel
        self.p = ROOT / rel
        self.s = self.p.read_text(encoding='utf-8')
        self.dirty = False

    def sub(self, old, new, why):
        n = self.s.count(old)
        if n != 1:
            sys.exit('[bump3304] %s 锚点命中 %d 次（要求恰 1 次）：%s\n  锚点=%r'
                     % (self.rel, n, why, old[:200]))
        if old == new:
            sys.exit('[bump3304] %s 同值替换等于没改：%s' % (self.rel, why))
        self.s = self.s.replace(old, new, 1)
        self.dirty = True
        _log.append((self.rel, why))

    def append(self, text, sentinel, why):
        if sentinel in self.s:
            sys.exit('[bump3304] %s 已含哨兵（重复执行会重复追加）：%s' % (self.rel, why))
        self.s = self.s + text
        self.dirty = True
        _log.append((self.rel, why))

    def write(self):
        if self.dirty:
            self.p.write_text(self.s, encoding='utf-8')


D = {rel: Doc(rel) for rel in [
    'index.js', 'manifest.json', 'package.json',
    'memory-config.js', 'memory-core.js', 'memory-organs.js',
    'tests/v3209_migration_registry.test.mjs',
    'tests/v3247_break_kit_consolidation.test.mjs',
    'tests/audit/catalog_reference_consumers.tsv',
    'README.md', 'PLAN.md',
]}

# ── ① 版本六处 ──
D['index.js'].sub("const VERSION = '%s';" % OLD, "const VERSION = '%s';" % NEW, '入口版本常量')
D['manifest.json'].sub('"version": "%s"' % OLD, '"version": "%s"' % NEW, '插件清单版本')
D['package.json'].sub('"version": "%s"' % OLD, '"version": "%s"' % NEW, '包版本')
for mod in ('memory-config.js', 'memory-core.js', 'memory-organs.js'):
    D[mod].sub("let VERSION = '%s';" % OLD, "let VERSION = '%s';" % NEW, '模块侧副本（须 let）')

# ── ② v3209 数量锁：项数不变（本版不新增模块），只补版本出处 ──
D['tests/v3209_migration_registry.test.mjs'].sub(
    "A(mf.extra_js.length === 87, 'extra_js 须 87 项（v3.303.0 M-O2 第三刀**不新增模块**，仍 87；",
    "A(mf.extra_js.length === 87, 'extra_js 须 87 项（v3.304.0 真缺陷清扫**不新增模块**，仍 87；"
    "v3.303.0 M-O2 第三刀不新增模块，仍 87；",
    'v3209 数量锁 ①（项数不变，仅补版本出处）')

# ── ③ REGISTRY：新档登记（本档不取 _break_kit，只登记名）──
D['tests/v3247_break_kit_consolidation.test.mjs'].sub(
    "    'v3303_ui_panel_drive_gate.test.mjs',\n];",
    "    'v3303_ui_panel_drive_gate.test.mjs',\n"
    "    /* [v3.304.0] 本档自带夹具（scratch 逐文件复制 + 真进程跑门），不从 _break_kit 取；\n"
    "     *   按台账纪律登记名。 */\n"
    "    'v3304_head_defect_sweep.test.mjs',\n];",
    'v3247 REGISTRY 登记新档')

# ── ④ 参考基准 tsv：追加本版新档 ──
D['tests/audit/catalog_reference_consumers.tsv'].append(
    'v3304_head_defect_sweep.test.mjs\t\t'
    '抬版前真缺陷清扫（v3.303.0 提交自带的五处，全量实跑当场报出）：'
    '① settings-ui.js 的 preferModuleFiles 声明了却两侧都不可设（产品缺陷，补真开关）；'
    '② scan_v3180_three_faces.mjs 判时钟注入只查子串 ⇒ 构造器那处被破坏时恒绿（判据面缺陷，改分形状判定）；'
    '③ tests/v3259 的「构造点唯一」按整文本计数 ⇒ 把缺席退路替换点算成第二次构造（判据面缺陷，改分开计）；'
    '④ tests/v374 断言 v3.303.0 已修掉的旧写法（判据停在旧口径）；'
    '⑤ host_beast_baseline.json 的 measured_at 停在 v3.302.0（登记面陈旧，按真源刷新）。'
    '★ 边界：本档证明的是「五处各自的判据会响、产品开关真可达、登记与真源同源」，'
    '**不**证明真宿主 / 真浏览器上的行为（那归 M-O2 的浏览器门与真宿主台账）。\n',
    'v3304_head_defect_sweep.test.mjs',
    '参考基准 tsv 追加新档')

# ── ⑤ 人读面 README ──
R = D['README.md']
R.sub("**当前版本**：`%s`（版本四源同步由 `tests/audit/scan_version_guard.mjs` 把守）" % OLD,
      "**当前版本**：`%s`（版本四源同步由 `tests/audit/scan_version_guard.mjs` 把守）" % NEW,
      'README 当前版本')
R.sub("`npm test` 当前发现 **284 个测试文件**；`npm test -- --audit` 当前发现 **60/60** 审计脚本"
      "（`tests/audit/` 磁盘 **64** 个，4 个 `_` 前缀探针不进门禁扫描面）",
      "`npm test` 当前发现 **285 个测试文件**；`npm test -- --audit` 当前发现 **60/60** 审计脚本"
      "（`tests/audit/` 磁盘 **64** 个，4 个 `_` 前缀探针不进门禁扫描面）",
      'README 在役面读数行')
R.sub('当前版本 v%s **全量待验**' % OLD, '当前版本 v%s **全量待验**' % NEW, 'README 待验标记（粗体，D6 口径）')

# ── ⑥ PLAN ──
P = D['PLAN.md']
P.sub('> **当前执行状态（2026-10-10，v%s）**' % OLD,
      '> **当前执行状态（2026-10-11，v%s）**' % NEW,
      'PLAN 当前执行状态行版本')
P.sub('| 版本 | **v%s**（四源同源；本表原为 v3.266.0） |' % OLD,
      '| 版本 | **v%s**（四源同源；本表原为 v3.266.0） |' % NEW,
      'PLAN 版本行')
P.sub('| 门禁 | 在役面 **284 测试文件 / 60 个 audit 脚本**（磁盘 64）',
      '| 门禁 | 在役面 **285 测试文件 / 60 个 audit 脚本**（磁盘 64）',
      'PLAN 门禁行（测试文件数 / 门禁面 / 磁盘）')
P.sub('当前 v%s **全量待验**' % OLD, '当前 v%s **全量待验**' % NEW, 'PLAN 待验标记（粗体，D6 口径）')

# ── 统一写盘 ──
for rel, d in D.items():
    d.write()
print('[bump3304] 完成：%d 项替换 / %d 个文件改动' % (len(_log), sum(1 for d in D.values() if d.dirty)))
for rel, why in _log:
    print('  · %-52s %s' % (rel, why))