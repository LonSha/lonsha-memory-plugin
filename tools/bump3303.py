#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.303.0 · M-O2（第三刀：面板逐条驱动门）收口抬版。

纪律（沿用 tools/bump3302.py / bump3301.py）：
  · 每处替换断言**恰中 1 次**；失配即退出；
  · **全部锚点先校验、通过后统一写盘**（不做「边校验边写」）；
  · 版本源 = index.js / manifest.json / package.json + 三份模块副本 `let VERSION`；
  · 当版锚（版本守卫 V4）= 本刀新档自带 `vnum('3.303.0')` 字面量形；
  · 盘面连带（本版**不新增模块**、新增 1 个测试档 + 1 个审计门）：
    extra_js 仍 87、根级 .js 仍 88、测试文件 283 → 284、审计磁盘 63 → 64（门禁面 59 → 60）。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
OLD, NEW = '3.302.0', '3.303.0'
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
            sys.exit('[bump3303] %s 锚点命中 %d 次（要求恰 1 次）：%s\n  锚点=%r'
                     % (self.rel, n, why, old[:200]))
        if old == new:
            sys.exit('[bump3303] %s 同值替换等于没改：%s' % (self.rel, why))
        self.s = self.s.replace(old, new, 1)
        self.dirty = True
        _log.append((self.rel, why))

    def append(self, text, sentinel, why):
        if sentinel in self.s:
            sys.exit('[bump3303] %s 已含哨兵（重复执行会重复追加）：%s' % (self.rel, why))
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
    "A(mf.extra_js.length === 87, 'extra_js 须 87 项（v3.302.0 M-O1**不新增模块**，仍 87；",
    "A(mf.extra_js.length === 87, 'extra_js 须 87 项（v3.303.0 M-O2 第三刀**不新增模块**，仍 87；"
    "v3.302.0 M-O1 不新增模块，仍 87；",
    'v3209 数量锁 ①（项数不变，仅补版本出处）')

# ── ③ REGISTRY：新档从 _break_kit 取 breakSource（B1 台账纪律）──
D['tests/v3247_break_kit_consolidation.test.mjs'].sub(
    "    'v3302_mo1_write_closure.test.mjs',\n];",
    "    'v3302_mo1_write_closure.test.mjs',\n"
    "    /* [v3.303.0 M-O2 第三刀] 本档从 tests/_break_kit.mjs 取 breakSource / assertSingleHit\n"
    "     *   （四条真源码破坏：摘 showDiagnose 的 esc 定义 / summary 分支类型比对回退 /\n"
    "     *   opHint 无条件挂 / items 的 data-opid 回退成 esc；锚点取自 settings-ui.js）；\n"
    "     *   按 B1 台账纪律在此登记。 */\n"
    "    'v3303_ui_panel_drive_gate.test.mjs',\n];",
    'v3247 REGISTRY 登记新档')

# ── ④ 参考基准 tsv：追加本版新档 ──
D['tests/audit/catalog_reference_consumers.tsv'].append(
    'v3303_ui_panel_drive_gate.test.mjs\t\t'
    'M-O2 第三刀（面板逐条驱动门 scan_ui_panel_drive.mjs）的成对套件（10 个 test）：'
    'A1 结构（门在位 / W1·W2·W3·W4b·W5·W6 判据名在册 / 三个面下限常量 / 边界声明与两层 UI 门关系）/ '
    'B1 真仓必须 exit 0（防「永远红」的另一种假绿，且必须给面自证读数）/ '
    'C1~C4 四条**真源码破坏负控制**（与门头 D1~D4 一一对应：摘 esc 定义 ⇒ W1 带数据抛错；'
    '`String(x.floor) === key` 回退 ⇒ W3 静默无反应；opHint 无条件挂 ⇒ W5 说不可用为可用；'
    'items 的 data-opid 回退成 esc ⇒ W4b 属性值往返失败）每条各配**原版对照**（同合成仓必须 exit 0）+ '
    '破坏后 `node --check` 归因前提 / D1 fail-closed（缺文件 / 退化输入两条路径 ⇒ exit 2）/ '
    'E1 面下限非装饰（抬高字节阈值 ⇒ exit 2）/ F1 判据纯度（五个单行锚点片段各只有 1 个持有常量、'
    '真源上各命中 1 次、两向自证）/ G1 当版下界锚 + 三处登记面（探针矩阵 / 在役名册 / v3247 台账）。'
    '★ 边界：本档证明「**门的判据可信**」（能翻红、fail-closed、下限非装饰），'
    '**不**证明真浏览器 / 真 SillyTavern 上的面板行为（那需要真 Chromium 会话）。\n',
    'v3303_ui_panel_drive_gate.test.mjs',
    '参考基准 tsv 追加新档')

# ── ⑤ 人读面 README ──
R = D['README.md']
R.sub("**当前版本**：`%s`（版本四源同步由 `tests/audit/scan_version_guard.mjs` 把守）" % OLD,
      "**当前版本**：`%s`（版本四源同步由 `tests/audit/scan_version_guard.mjs` 把守）" % NEW,
      'README 当前版本')
R.sub("`npm test` 当前发现 **283 个测试文件**；`npm test -- --audit` 当前发现 **59/59** 审计脚本"
      "（`tests/audit/` 磁盘 **63** 个，4 个 `_` 前缀探针不进门禁扫描面）",
      "`npm test` 当前发现 **284 个测试文件**；`npm test -- --audit` 当前发现 **60/60** 审计脚本"
      "（`tests/audit/` 磁盘 **64** 个，4 个 `_` 前缀探针不进门禁扫描面）",
      'README 在役面读数行')
R.sub('当前版本 v%s **全量待验**' % OLD, '当前版本 v%s **全量待验**' % NEW, 'README 待验标记（粗体，D6 口径）')

# ── ⑥ PLAN ──
P = D['PLAN.md']
P.sub('> **当前执行状态（2026-10-09，v%s）**' % OLD,
      '> **当前执行状态（2026-10-10，v%s）**' % NEW,
      'PLAN 当前执行状态行版本')
P.sub('| 版本 | **v%s**（四源同源；本表原为 v3.266.0） |' % OLD,
      '| 版本 | **v%s**（四源同源；本表原为 v3.266.0） |' % NEW,
      'PLAN 版本行')
P.sub('| 门禁 | 在役面 **283 测试文件 / 59 个 audit 脚本**（磁盘 63）',
      '| 门禁 | 在役面 **284 测试文件 / 60 个 audit 脚本**（磁盘 64）',
      'PLAN 门禁行（测试文件数 / 门禁面 / 磁盘）')
P.sub('当前 v%s **全量待验**' % OLD, '当前 v%s **全量待验**' % NEW, 'PLAN 待验标记（粗体，D6 口径）')

# ── 统一写盘 ──
for rel, d in D.items():
    d.write()
print('[bump3303] 完成：%d 项替换 / %d 个文件改动' % (len(_log), sum(1 for d in D.values() if d.dirty)))
for rel, why in _log:
    print('  · %-52s %s' % (rel, why))
