#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.301.0 · M-O2（第二刀）「装配外提 + 装载后重建」收口抬版。

纪律（沿用 tools/bump3300.py / bump3299.py）：
  · 每处替换断言**恰中 1 次**；失配即退出；
  · **全部锚点先校验、通过后统一写盘**（不做「边校验边写」，否则后段失配时前几段已落盘）；
  · 版本源 = index.js / manifest.json / package.json + 三份模块副本 `let VERSION`；
  · 当版锚交接（版本守卫 V4）：本档自带 `const CUR = '3.301.0'` 自锚常量形 ⇒ 无需回头改历史档；
  · 盘面连带（本版与 v3.300.0 的差别是**多了一个测试档、不新增模块**）：
    extra_js **仍 87 项**、根级 .js 仍 88、测试文件 281 → 282；
    v3209 数量锁（项数不变，仅补版本出处）；v3247 REGISTRY 登记新档；
    参考基准 tsv 追加；人读面 README/PLAN 版本与在役读数同步。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
OLD, NEW = '3.300.0', '3.301.0'
_log = []


class Doc:
    """一个待改文件：所有替换先在内存里做，最后统一写盘。"""

    def __init__(self, rel):
        self.rel = rel
        self.p = ROOT / rel
        self.s = self.p.read_text(encoding='utf-8')
        self.dirty = False

    def sub(self, old, new, why):
        n = self.s.count(old)
        if n != 1:
            sys.exit('[bump3301] %s 锚点命中 %d 次（要求恰 1 次）：%s\n  锚点=%r'
                     % (self.rel, n, why, old[:200]))
        if old == new:
            sys.exit('[bump3301] %s 同值替换等于没改：%s' % (self.rel, why))
        self.s = self.s.replace(old, new, 1)
        self.dirty = True
        _log.append((self.rel, why))

    def append(self, text, sentinel, why):
        if sentinel in self.s:
            sys.exit('[bump3301] %s 已含哨兵（重复执行会重复追加）：%s' % (self.rel, why))
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
    "A(mf.extra_js.length === 87, 'extra_js 须 87 项（v3.300.0 M-O2 第一刀**不新增模块**，仍 87；",
    "A(mf.extra_js.length === 87, 'extra_js 须 87 项（v3.301.0 M-O2 第二刀**不新增模块**，仍 87；"
    "v3.300.0 M-O2 第一刀不新增模块，仍 87；",
    'v3209 数量锁 ①（项数不变，仅补版本出处）')

# ── ③ REGISTRY：新档从 _break_kit 取 breakSource（B1 台账纪律）──
D['tests/v3247_break_kit_consolidation.test.mjs'].sub(
    "    'v3300_mo2_host_loader.test.mjs',\n];",
    "    'v3300_mo2_host_loader.test.mjs',\n"
    "    /* [v3.301.0 M-O2 第二刀] 本档从 tests/_break_kit.mjs 取 breakSource（四条真源码破坏：\n"
    "     *   构造期不装配 / 重建不回灌 / 幂等分支吞新配置，另配一条「不得误伤」阴性对照）；\n"
    "     *   按 B1 台账纪律在此登记。 */\n"
    "    'v3301_mo2_component_rebuild.test.mjs',\n];",
    'v3247 REGISTRY 登记新档')

# ── ④ 参考基准 tsv：追加本版新档 ──
D['tests/audit/catalog_reference_consumers.tsv'].append(
    'v3301_mo2_component_rebuild.test.mjs\t\t'
    'M-O2 第二刀（装配外提 + 装载后重建）的成对判据（12 个 test）：'
    'A 装配段外提结构（唯一装配点恰一次定义 / 重建调用同一装配点 / 构造体不再内联装配且只剩一次调用 / '
    '七个 window 直取点全改为 this._winModule 且装配点内零 window 直取 / _winModule 必须是类方法、不得另有模块级同名函数）/ '
    'B 重建接线序（loadModules → rebindModuleDeps → 新配置实例 → rebuildComponents → registerEvents 五步齐、序正确；'
    '两处 try/catch + errLog 只留痕不抛穿；emergency 必须先判 _absent 再换）/ '
    'C ★★ 真装载两段对照（vm 按 manifest 顺序真装载：入口先、extra_js 后 ⇒ 构造期 absent≥20 且退路配置持 0 键；'
    '传入现造的真 ConfigManager 重建 ⇒ absent 归零、config 就是传入那个实例、键面 >100）/ '
    'D ★★ 重建不得清空用户数据（真 graph.addNode 写账 → 人为把不持数据的成员标退路逼出真重建 → 节点仍在；空面上不得凭空长数据）/ '
    'E ★ 幂等（已全真再调 ⇒ rebuilt=false / why=already-live / frozen=0；但传入不同真配置实例时必须装上并留痕 configSwapped）/ '
    'F ★ 失败只留痕（装配点抛错 ⇒ why 以 error: 开头、不抛穿、恢复后仍可重建）/ '
    'G0 工具两向自证（0 次 / 不唯一 / 同值替换均抛；四条正面判据须在原版上真成立）+ 判据纯度 / '
    'G1~G4 四条**真源码破坏负控制**（构造期摘掉装配 / 去掉回灌 / 幂等分支吞新配置）+ 一条「不得误伤」阴性对照 / '
    'H 版本当版锚（自锚常量形 vnum(CUR)）+ 登记面自锚下界（不锁已被交棒的总项数）+ memory-config.js 参考面在场面。'
    '★ 边界：本档在 Node vm 里真装载并真调 rebuildComponents，证明「装配可重建、数据不丢、幂等、失败不抛穿」，'
    '**不**证明浏览器 `<script>` 真解析（那是 v3300 与真宿主 probe 的活）。\n',
    'v3301_mo2_component_rebuild.test.mjs',
    '参考基准 tsv 追加新档')

# ── ⑤ 人读面 README ──
R = D['README.md']
R.sub("**当前版本**：`3.300.0`（版本四源同步由 `tests/audit/scan_version_guard.mjs` 把守）",
      "**当前版本**：`3.301.0`（版本四源同步由 `tests/audit/scan_version_guard.mjs` 把守）",
      'README 当前版本')
R.sub("`npm test` 当前发现 **281 个测试文件**；",
      "`npm test` 当前发现 **282 个测试文件**；",
      'README 在役面测试文件数')
R.sub("当前版本 v3.300.0 **全量待验**", "当前版本 v3.301.0 **全量待验**", 'README 待验标记版本')

# ── ⑥ PLAN ──
P = D['PLAN.md']
P.sub("> **当前执行状态（2026-10-09，v3.300.0）**",
      "> **当前执行状态（2026-10-09，v3.301.0）**",
      'PLAN 当前执行状态行版本')
P.sub("| 版本 | **v3.300.0**（四源同源；本表原为 v3.266.0） |",
      "| 版本 | **v3.301.0**（四源同源；本表原为 v3.266.0） |",
      'PLAN 版本行')
P.sub("| 门禁 | 在役面 **281 测试文件 / 59 个 audit 脚本**（磁盘 62）",
      "| 门禁 | 在役面 **282 测试文件 / 59 个 audit 脚本**（磁盘 62）",
      'PLAN 门禁行测试文件数')
P.sub("当前 v3.300.0 **全量待验**", "当前 v3.301.0 **全量待验**", 'PLAN 待验标记版本')

# ── 统一写盘 ──
for rel, d in D.items():
    d.write()
print('[bump3301] 完成：%d 项替换 / %d 个文件改动' % (len(_log), sum(1 for d in D.values() if d.dirty)))
for rel, why in _log:
    print('  · %-52s %s' % (rel, why))