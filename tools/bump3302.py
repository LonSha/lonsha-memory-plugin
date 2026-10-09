#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.302.0 · M-O1（第一刀 + 第二刀）「会话身份写入闭环」收口抬版。

纪律（沿用 tools/bump3301.py / bump3300.py）：
  · 每处替换断言**恰中 1 次**；失配即退出；
  · **全部锚点先校验、通过后统一写盘**（不做「边校验边写」）；
  · 版本源 = index.js / manifest.json / package.json + 三份模块副本 `let VERSION`；
  · 当版锚交接（版本守卫 V4）：本档自带 `const CUR = '3.302.0'` 自锚常量形 ⇒ 无需回头改历史档；
  · 盘面连带（本版**不新增模块**，只多一个测试档）：
    extra_js **仍 87 项**、测试文件 282 → 283；
    v3209 数量锁（项数不变，仅补版本出处）；v3247 REGISTRY 登记新档；
    参考基准 tsv 追加；人读面 README/PLAN 版本与在役读数同步。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
OLD, NEW = '3.301.0', '3.302.0'
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
            sys.exit('[bump3302] %s 锚点命中 %d 次（要求恰 1 次）：%s\n  锚点=%r'
                     % (self.rel, n, why, old[:200]))
        if old == new:
            sys.exit('[bump3302] %s 同值替换等于没改：%s' % (self.rel, why))
        self.s = self.s.replace(old, new, 1)
        self.dirty = True
        _log.append((self.rel, why))

    def append(self, text, sentinel, why):
        if sentinel in self.s:
            sys.exit('[bump3302] %s 已含哨兵（重复执行会重复追加）：%s' % (self.rel, why))
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
    "A(mf.extra_js.length === 87, 'extra_js 须 87 项（v3.301.0 M-O2 第二刀**不新增模块**，仍 87；",
    "A(mf.extra_js.length === 87, 'extra_js 须 87 项（v3.302.0 M-O1**不新增模块**，仍 87；"
    "v3.301.0 M-O2 第二刀不新增模块，仍 87；",
    'v3209 数量锁 ①（项数不变，仅补版本出处）')

# ── ③ REGISTRY：新档从 _break_kit 取 breakSource（B1 台账纪律）──
D['tests/v3247_break_kit_consolidation.test.mjs'].sub(
    "    'v3301_mo2_component_rebuild.test.mjs',\n];",
    "    'v3301_mo2_component_rebuild.test.mjs',\n"
    "    /* [v3.302.0 M-O1] 本档从 tests/_break_kit.mjs 取 breakSource（四条真源码破坏：\n"
    "     *   摘约定槽判据 / 摘「本批没落 ⇒ false」这道闸 / 挪声明顺序 / 摘循环入口重核；\n"
    "     *   按 B1 台账纪律在此登记）。 */\n"
    "    'v3302_mo1_write_closure.test.mjs',\n];",
    'v3247 REGISTRY 登记新档')

# ── ④ 参考基准 tsv：追加本版新档 ──
D['tests/audit/catalog_reference_consumers.tsv'].append(
    'v3302_mo1_write_closure.test.mjs\t\t'
    'M-O1（第一刀 + 第二刀）会话身份写入闭环的成对判据（18 个 test）：'
    'A1 结构（取数器内联 / 三处重核读数 / 可变读数声明在取数器之前 / 入口批承载量声明在 try 之外 / 批次回执 pending·queued）/ '
    'A2 ★ **绝对口径不得重复**（`目标 vs 当前` 只许第一查一处，且比对对象必须是**本批当下身份**、不得是入口快照）/ '
    'A3 分支结构完整（既有分支头恰一次 + 花括号配平）/ '
    'A4 ★ 两个 await 之间恰隔一个 await（入口重核 → 紧急备份 → 写入前重核 → 宿主落盘 → 落盘后重核 五点序）/ '
    'B1 ★★ await 之后切聊（**两个子场景**：切到别的会话 / **同名换对象**）⇒ 字节级证据（宿主存下去的那一份里不得有本批数据）+ 不计证据 + 不推进确认 + 回 false + 批次回挂 / '
    'B2 ★ 延期批不得因「别批落盘」拿到 true（M-O1 验收⑤；真交错：A→await→B + 队列交错 ⇒ A 回 false、整队状态如实 partial）/ '
    'B3 ★ 宿主否认 / 抛错 ⇒ 回 false、归因进 `error`、归宿 denied / write-threw / '
    'B4 同会话主流路径不得误伤 / B5 身份未知放行 / B6 合流批归宿 queued 且对外仍「已受理」/ '
    'C1~C4 四条**真源码破坏负控制**（约定槽判据 / 批次回执闸 / 声明顺序 / 重核点）+ 阳性对照同配方 / '
    'C5 工具两向自证 / D1 判据纯度（锚点字面量只此一处声明，破坏走真源库 + 真模块装载）/ '
    'D2 版本当版锚（自锚常量形）+ 三源同源 / D3 登记面（tsv + v3247 REGISTRY）。'
    '★ 边界：本档用**合成宿主**（真对象 + 真切聊动作）证明底层边界成立，'
    '**不**证明真 SillyTavern 里的时序（那是真宿主 probe 的活）。\n',
    'v3302_mo1_write_closure.test.mjs',
    '参考基准 tsv 追加新档')

# ── ⑤ 人读面 README ──
R = D['README.md']
R.sub("**当前版本**：`3.301.0`（版本四源同步由 `tests/audit/scan_version_guard.mjs` 把守）",
      "**当前版本**：`3.302.0`（版本四源同步由 `tests/audit/scan_version_guard.mjs` 把守）",
      'README 当前版本')
R.sub('`npm test` 当前发现 **282 个测试文件**；',
      '`npm test` 当前发现 **283 个测试文件**；',
      'README 在役面测试文件数')
R.sub('当前版本 v3.301.0 **全量待验**', '当前版本 v3.302.0 **全量待验**', 'README 待验标记版本')

# ── ⑥ PLAN ──
P = D['PLAN.md']
P.sub('> **当前执行状态（2026-10-09，v3.301.0）**',
      '> **当前执行状态（2026-10-09，v3.302.0）**',
      'PLAN 当前执行状态行版本')
P.sub('| 版本 | **v3.301.0**（四源同源；本表原为 v3.266.0） |',
      '| 版本 | **v3.302.0**（四源同源；本表原为 v3.266.0） |',
      'PLAN 版本行')
P.sub('| 门禁 | 在役面 **282 测试文件 / 59 个 audit 脚本**（磁盘 62）',
      '| 门禁 | 在役面 **283 测试文件 / 59 个 audit 脚本**（磁盘 62）',
      'PLAN 门禁行测试文件数')
P.sub('当前 v3.301.0 **全量待验**', '当前 v3.302.0 **全量待验**', 'PLAN 待验标记版本')

# ── 统一写盘 ──
for rel, d in D.items():
    d.write()
print('[bump3302] 完成：%d 项替换 / %d 个文件改动' % (len(_log), sum(1 for d in D.values() if d.dirty)))
for rel, why in _log:
    print('  · %-52s %s' % (rel, why))