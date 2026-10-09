#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.300.0 · M-O2（第一刀）「真宿主装载面修复」收口抬版。
纪律（沿用 tools/bump3299.py / bump3298.py / bump3297.py）：
  · 每处替换断言**恰中 1 次**；失配即退出；
  · **全部锚点先校验、通过后统一写盘** —— 不做「边校验边写」，否则后段失配时
    前几项已经落盘，文件停在半改造状态（v3.294 实测踩过）。
  · 版本源 = index.js / manifest.json / package.json + 三份模块副本
    （memory-config / memory-core / memory-organs 的 `let VERSION`，注入失败时它们就是真实现）。
  · 当版锚交接（版本守卫 V4）：v3299 的 `vnum('3.299.0')` 锚随抬版降为历史下界，
    由本版新增的 v3300 接管当版锚（`vnum('3.300.0') == 3300000`）。
  · 盘面连带（本版与 v3.299.0 的差别在**多了一个测试档、不改模块数**）：
    extra_js **仍 87 项**（本版不新增模块）、根级 .js 仍 88、测试文件 280 → 281；
    v3299 的 extra_js 总项数硬锁**交棒**（历史档只判「自己那一项在场恰一次」）；
    v3209 数量锁（两处）、`extra_js.length` 交棒、REGISTRY（v3247）、参考基准 tsv、
    人读面 README/PLAN 与发布面 CHANGELOG/TODO 全部同步。
  · 本版**收敛**而不是扩散数量锁：v3299 引出的「历史档硬锁总项数」在本轮按纪律交棒，
    之后新增模块不再需要回头改历史档（README 仍写总项数，因为它是人读面且被
    scan_doc_truthfulness D3 核回磁盘 —— 两种锁的职责不同，勿混）。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
OLD, NEW = '3.299.0', '3.300.0'
V_OLD_NUM, V_NEW_NUM = '3299000', '3300000'
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
            sys.exit('[bump3300] %s 锚点命中 %d 次（要求恰 1 次）：%s\n  锚点=%r'
                     % (self.rel, n, why, old[:200]))
        if old == new:
            sys.exit('[bump3300] %s 同值替换等于没改：%s' % (self.rel, why))
        self.s = self.s.replace(old, new, 1)
        self.dirty = True
        _log.append((self.rel, why))

    def append(self, text, sentinel, why):
        if sentinel in self.s:
            sys.exit('[bump3300] %s 已含哨兵（重复执行会重复追加）：%s' % (self.rel, why))
        self.s = self.s + text
        self.dirty = True
        _log.append((self.rel, why))

    def write(self):
        if self.dirty:
            self.p.write_text(self.s, encoding='utf-8')


D = {rel: Doc(rel) for rel in [
    'index.js', 'manifest.json', 'package.json',
    'memory-config.js', 'memory-core.js', 'memory-organs.js',
    'tests/v3299_mo6_fact_state_single_source.test.mjs',
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

# ── ② v3299 当版锚交接（V4）+ 总项数硬锁交棒 ──
V9 = D['tests/v3299_mo6_fact_state_single_source.test.mjs']
V9.sub("assert.strictEqual(vnum('3.299.0'), 3299000, '★ 当版锚：本档出生版本 vnum 须给出三段数值');",
       "assert.strictEqual(vnum('3.299.0'), 3299000, "
       "'出生版本锚（v3.300.0 起降为历史下界，当版锚交棒给 v3300）：vnum 须给出三段数值');",
       'v3299 当版锚降级为出生版本锚')
V9.sub("    assert.strictEqual(MANIFEST.extra_js.length, 87, 'extra_js 项数锁：本版新增 fact-state.js（86 → 87）');",
       "    /* 项数锁随抬版**交棒给当版**（v3300）：本档只判「自己登记的那一项在场且恰一次」，\n"
       "     *   不再锁总项数 —— 否则每加一个模块都要回头改历史档（本仓早已定性为抬版仪式）。\n"
       "     *   与 v3298 同一处交棒，理由同源：数量锁的职责是「新增模块必须显式改**当版**」，\n"
       "     *   不是给历史档留维护债。 */\n"
       "    assert.strictEqual(MANIFEST.extra_js.filter((x) => x === 'fact-state.js').length, 1,\n"
       "        'fact-state.js 始终恰登记一次');",
       'v3299 去掉总项数硬锁（交棒给当版）')

# ── ③ 数量锁：测试文件 280 → 281（v3209 两处，extra_js 仍 87 不变）──
D['tests/v3209_migration_registry.test.mjs'].sub(
    "A(mf.extra_js.length === 87, 'extra_js 须 87 项（v3.299.0 M-O6 新增 fact-state.js；",
    "A(mf.extra_js.length === 87, 'extra_js 须 87 项（v3.300.0 M-O2 第一刀**不新增模块**，仍 87；v3.299.0 M-O6 新增 fact-state.js；",
    'v3209 数量锁 ①（项数不变，仅补版本出处）')

# ── ④ REGISTRY：新档从 _break_kit 取 breakSource（B1 台账纪律）──
D['tests/v3247_break_kit_consolidation.test.mjs'].sub(
    "    'v3299_mo6_fact_state_single_source.test.mjs',\n];",
    "    'v3299_mo6_fact_state_single_source.test.mjs',\n"
    "    /* [v3.300.0 M-O2] 本档从 tests/_break_kit.mjs 取 breakSource（四条真源码破坏：\n"
    "     *   base 不再认领本插件 / 裸文件名正则放宽 / partial 读成 ok / 配置开关失效）；\n"
    "     *   按 B1 台账纪律在此登记。 */\n"
    "    'v3300_mo2_host_loader.test.mjs',\n];",
    'v3247 REGISTRY 登记新档')

# ── ⑤ 参考基准 tsv：追加本版新档 ──
D['tests/audit/catalog_reference_consumers.tsv'].append(
    'v3300_mo2_host_loader.test.mjs\t\t'
    'M-O2 真宿主装载面（manifest.extra_js 自装载）的成对判据（12 个 test）：'
    'A 面结构（幂等入口 / 三态齐备 / module 型原生注入 / 失败必 reject / 装载面零 eval）/ '
    'B ★ base 反证（display_name 不认本插件 ⇒ unavailable 且**一条不注入**；候选为空 vs 入口 src 在场必须可分；manifest 取不到不抛穿）/ '
    'C ★★ 裸文件名准入（路径穿越/绝对路径/查询串/子目录/非 .js ⇒ **整份清单拒绝**且合法项也不注入；合法裸名不得误伤）/ '
    'D ★★ 三态互斥（部分失败必须 partial、全挂 unavailable、空清单不得冒充 ok；幂等不重复注入；已在页面上的 URL 记 already）/ '
    'E ★ 开关真关（preferModuleFiles=false ⇒ 第四态 disabled 且**不调用装载器**；读数原样透传同一对象；装载抛错吞成 null 但必须留痕）/ '
    'F 接线序（init 内 ensureExtraJs 先于 loadModules/rebindModuleDeps/createUI；失败不阻断 init）/ '
    'G0~G4 四条**真源码破坏负控制**（base 不再认领 / 正则放宽 / partial 读成 ok / 开关失效）'
    ' 各配「原版同判据真成立」阳性对照 + 判据纯度 / '
    'H 版本当版锚（字面量形 + 自锚常量形 vnum(CUR)）+ 登记面自锚下界（不锁已被交棒的总项数）\n',
    'v3300_mo2_host_loader.test.mjs',
    '参考基准 tsv 追加新档')

# ── ⑥ 人读面 README ──
R = D['README.md']
R.sub("**当前版本**：`3.299.0`（版本四源同步由 `tests/audit/scan_version_guard.mjs` 把守）",
      "**当前版本**：`3.300.0`（版本四源同步由 `tests/audit/scan_version_guard.mjs` 把守）",
      'README 当前版本')
R.sub("`npm test` 当前发现 **280 个测试文件**；",
      "`npm test` 当前发现 **281 个测试文件**；",
      'README 在役面测试文件数')
R.sub("当前版本 v3.299.0 **全量待验**", "当前版本 v3.300.0 **全量待验**", 'README 待验标记版本')

# ── ⑦ PLAN ──
P = D['PLAN.md']
P.sub("> **当前执行状态（2026-10-09，v3.299.0）**",
      "> **当前执行状态（2026-10-09，v3.300.0）**",
      'PLAN 当前执行状态行版本')
P.sub("| 版本 | **v3.299.0**（四源同源；本表原为 v3.266.0） |",
      "| 版本 | **v3.300.0**（四源同源；本表原为 v3.266.0） |",
      'PLAN 版本行')
P.sub("| 门禁 | 在役面 **280 测试文件 / 59 个 audit 脚本**（磁盘 62）",
      "| 门禁 | 在役面 **281 测试文件 / 59 个 audit 脚本**（磁盘 62）",
      'PLAN 门禁行测试文件数')
P.sub("当前 v3.299.0 **全量待验**", "当前 v3.300.0 **全量待验**", 'PLAN 待验标记版本')

# ── 统一写盘 ──
for rel, d in D.items():
    d.write()
print('[bump3300] 完成：%d 项替换 / %d 个文件改动' % (len(_log), sum(1 for d in D.values() if d.dirty)))
for rel, why in _log:
    print('  · %-52s %s' % (rel, why))
