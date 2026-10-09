#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.299.0 · M-O6「事实版本、冲突与撤回的状态统一」收口抬版。
纪律（沿用 tools/bump3298.py / bump3297.py / bump3296.py）：
  · 每处替换断言**恰中 1 次**；失配即退出；
  · **全部锚点先校验、通过后统一写盘** —— 不做「边校验边写」，否则后段失配时
    前几项已经落盘，文件停在半改造状态（v3.294 实测踩过）。
  · 版本源 = index.js / manifest.json / package.json + 三份模块副本
    （memory-config / memory-core / memory-organs 的 `let VERSION`，注入失败时它们就是真实现）。
  · 当版锚交接（版本守卫 V4）：v3298 的 `vnum('3.298.0')` 锚随抬版降为历史下界，
    由本版新增的 v3299 接管当版锚（`vnum('3.299.0') == 3299000`）。
  · 盘面连带（本版与 v3.298.0 的差别在**多了一个模块**）：
    extra_js 86 → 87、根级 .js 87 → 88、测试文件 279 → 280、index.js 物理行 15393 → 15434
    （探针读数 15435 行 / 568 成员 —— 成员数不变，只多了一个方法体）；
    数量锁（v3209 两处）、REGISTRY（v3247）、参考基准 tsv、人读面 README/PLAN
    与发布面 CHANGELOG/TODO 全部同步。
  · 锚点形态说明：README/PLAN 里的行首尾有反引号（`extra_js`（86 项）），
    本脚本的锚点逐字带上反引号；数量锁那两行则以纯 `86 项` 起头。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
OLD, NEW = '3.298.0', '3.299.0'
V_OLD_NUM, V_NEW_NUM = '3298000', '3299000'
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
            sys.exit('[bump3299] %s 锚点命中 %d 次（要求恰 1 次）：%s\n  锚点=%r'
                     % (self.rel, n, why, old[:200]))
        if old == new:
            sys.exit('[bump3299] %s 同值替换等于没改：%s' % (self.rel, why))
        self.s = self.s.replace(old, new, 1)
        self.dirty = True
        _log.append((self.rel, why))

    def append(self, text, sentinel, why):
        if sentinel in self.s:
            sys.exit('[bump3299] %s 已含哨兵（重复执行会重复追加）：%s' % (self.rel, why))
        self.s = self.s + text
        self.dirty = True
        _log.append((self.rel, why))

    def write(self):
        if self.dirty:
            self.p.write_text(self.s, encoding='utf-8')


D = {rel: Doc(rel) for rel in [
    'index.js', 'manifest.json', 'package.json',
    'memory-config.js', 'memory-core.js', 'memory-organs.js',
    'tests/v3298_mo3_receipt_single_source.test.mjs',
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

# ── ② extra_js 登记：fact-state.js 排在它所推导的两个模块之后 ──
#   加载序理由：本模块 derive 读的是 fact-version 的字段、准入叠的是 memory-type 的分桶，
#   三者都在 extra_js 里按文件名顺序加载 ⇒ 本模块必须排在二者之后。
#   ⚠️ 清单是 JSON 数组，**不得塞注释行**（JSON 无注释，塞进去会多出一条"文件名"），
#      加载序的理由写在文件头与 manifest 的 loading_order 说明里，不写在数组里。
D['manifest.json'].sub(
    '        "memory-config.js"\n    ],',
    '        "memory-config.js",\n        "fact-state.js"\n    ],',
    'extra_js 追加新模块（清单项数 86 → 87）')

# ── ③ v3298 当版锚交接（V4）+ 去掉总项数硬锁 ──
V8 = D['tests/v3298_mo3_receipt_single_source.test.mjs']
V8.sub("assert.strictEqual(vnum('3.298.0'), 3298000, '★ 当版锚：本档出生版本 vnum 须给出三段数值');",
       "assert.strictEqual(vnum('3.298.0'), 3298000, "
       "'出生版本锚（v3.299.0 起降为历史下界，当版锚交棒给 v3299）：vnum 须给出三段数值');",
       'v3298 当版锚降级为出生版本锚')
V8.sub("assert.strictEqual(MANIFEST.extra_js.length, 86, 'extra_js 项数锁：本版新增 injection-receipt.js（85 → 86）');",
       "/* 项数锁随抬版**交棒给当版**（v3299）：本档只判「自己登记的那一项在场且恰一次」，\n"
       "     *   不再锁总项数 —— 否则每加一个模块都要回头改历史档（本仓早已定性为抬版仪式）。 */\n"
       "    assert.strictEqual(MANIFEST.extra_js.filter((x) => x === 'injection-receipt.js').length, 1,\n"
       "        'injection-receipt.js 始终恰登记一次');",
       'v3298 去掉总项数硬锁（交棒给当版）')

# ── ④ 数量锁：extra_js 86 → 87（v3209 两处）──
V9 = D['tests/v3209_migration_registry.test.mjs']
V9.sub("A(mf.extra_js.length === 86, 'extra_js 须 86 项（v3.298.0 M-O3 新增 injection-receipt.js；",
       "A(mf.extra_js.length === 87, 'extra_js 须 87 项（v3.299.0 M-O6 新增 fact-state.js；v3.298.0 M-O3 新增 injection-receipt.js；",
       'v3209 数量锁 ①（真 manifest 项数）')
V9.sub("A(files.length === 86, 'extra_js 抽取器应得 86 项（v3.298.0 M-O3 injection-receipt.js；",
       "A(files.length === 87, 'extra_js 抽取器应得 87 项（v3.299.0 M-O6 fact-state.js；v3.298.0 M-O3 injection-receipt.js；",
       'v3209 数量锁 ②（抽取器退化守卫）')

# ── ⑤ REGISTRY：新档从 _break_kit 取 breakSource（B1 台账纪律）──
D['tests/v3247_break_kit_consolidation.test.mjs'].sub(
    "    'v3298_mo3_receipt_single_source.test.mjs',\n];",
    "    'v3298_mo3_receipt_single_source.test.mjs',\n"
    "    /* [v3.299.0 M-O6] 本档从 tests/_break_kit.mjs 取 breakSource（四条真源码破坏：\n"
    "     *   准入门恒真 / 闭合不判换代 / 读侧写回条目 / 无区间塌成 false）；按 B1 台账纪律在此登记。 */\n"
    "    'v3299_mo6_fact_state_single_source.test.mjs',\n];",
    'v3247 REGISTRY 登记新档')

# ── ⑥ 参考基准 tsv：追加本版新档 ──
D['tests/audit/catalog_reference_consumers.tsv'].append(
    'v3299_mo6_fact_state_single_source.test.mjs\t\t'
    'M-O6 事实状态单一真源的成对判据（14 个 test）：'
    'A 面结构（五态穷尽 / 导出面不含 migrate / 源码无写回语句）/ '
    'B ★ 纯读幂等（连读两次逐字相同 + 账本字节未变；selfCheck 两半自证）/ '
    'C 五态判定与理由码（含显式冲突取保守序、拼错状态名不回落）/ '
    'D 有效范围 rangeOf 三态（★ 无区间 coversNow 留 null 不塌成 false；★ 楼层 0 不拿 null 冒充）/ '
    'E ★★ 状态准入真跑宿主方法体（旧口径旧值进载荷 → 本版被挡，现行值保留）/ '
    'F leaked 与 memory-type 修前那一行同源（已撤回不计泄漏）/ '
    'G admitForLoad（五态分流；撤回/争议/不可判不受任何 opts 影响）/ '
    'H line 点名到 id / transitionOf 带范围与悬空可读 / '
    'I0~I4 四条**真源码破坏负控制**（准入门恒真 / 闭合不判换代 / 读侧写回 / 无区间塌成 false）'
    ' 各配「原版同判据真成立」阳性对照 + 判据纯度 / '
    'J 版本当版锚（字面量形 + 自锚常量形 vnum(CUR)）+ 登记面 + 加载序\n',
    'v3299_mo6_fact_state_single_source.test.mjs',
    '参考基准 tsv 追加新档')

# ── ⑦ 人读面 README ──
R = D['README.md']
R.sub("**当前版本**：`3.298.0`（版本四源同步由 `tests/audit/scan_version_guard.mjs` 把守）",
      "**当前版本**：`3.299.0`（版本四源同步由 `tests/audit/scan_version_guard.mjs` 把守）",
      'README 当前版本')
R.sub("`npm test` 当前发现 **279 个测试文件**；",
      "`npm test` 当前发现 **280 个测试文件**；",
      'README 在役面测试文件数')
R.sub("**运行时模块**：87 个（根目录 `.js`，含入口 `index.js`）",
      "**运行时模块**：88 个（根目录 `.js`，含入口 `index.js`）",
      'README 运行时模块数（87 → 88）')
R.sub("├── manifest.json             # 插件清单（js / css / extra_js 86 / extra_css 2）",
      "├── manifest.json             # 插件清单（js / css / extra_js 87 / extra_css 2）",
      'README extra_js 项数（目录树注释）')
R.sub("由 `manifest.json` 的 `extra_js`（86 项）按**文件名**加载，",
      "由 `manifest.json` 的 `extra_js`（87 项）按**文件名**加载，",
      'README extra_js 项数（分支行）')
R.sub("**载入面**：`index.js` + `extra_js` 86 项 + CSS 3 项",
      "**载入面**：`index.js` + `extra_js` 87 项 + CSS 3 项",
      'README extra_js 项数（载入面行）')
R.sub("当前版本 v3.298.0 **全量待验**", "当前版本 v3.299.0 **全量待验**", 'README 待验标记版本')

# ── ⑧ PLAN ──
P = D['PLAN.md']
P.sub("| 版本 | **v3.298.0**（四源同源；本表原为 v3.266.0） |",
      "| 版本 | **v3.299.0**（四源同源；本表原为 v3.266.0） |",
      'PLAN 版本行')
P.sub("| 门禁 | 在役面 **279 测试文件 / 59 个 audit 脚本**（磁盘 62）",
      "| 门禁 | 在役面 **280 测试文件 / 59 个 audit 脚本**（磁盘 62）",
      'PLAN 门禁行测试文件数')
P.sub("| 体量 | `index.js` **15329 行**（物理行；探针读数 15329 行 / **568** 成员 —— 原 A1 六刀后为 13883 / 521）+ extra_js **86** 项 |",
      "| 体量 | `index.js` **15434 行**（物理行；探针读数 15435 行 / **568** 成员 —— 原 A1 六刀后为 13883 / 521）+ extra_js **87** 项 |",
      'PLAN 体量行（行数 + 探针读数 + extra_js）')
P.sub("当前 v3.298.0 **全量待验**", "当前 v3.299.0 **全量待验**", 'PLAN 待验标记版本')

# ── 统一写盘 ──
for rel, d in D.items():
    d.write()
print('[bump3299] 完成：%d 项替换 / %d 个文件改动' % (len(_log), sum(1 for d in D.values() if d.dirty)))
for rel, why in _log:
    print('  · %-46s %s' % (rel, why))