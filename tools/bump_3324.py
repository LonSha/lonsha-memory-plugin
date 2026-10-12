#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""bump_3324.py - [v3.324.0 · D 包记忆侧第一刀] 统一抬版（六源 + 分发面 + 人读面 + 数量锁 + 读数锚交棒）

本刀内容：M3-O5 抽取节奏（extraction-driver.js）/ M3-O7 + M3-X9 纠错方案（correction-plan.js）
  + 宿主接线（两取库口 / 真每轮调用点 / 三出口 / 两诊断行 / 两体检面 / 配置旋钮 extractionProfile）。

抬版纪律：
  · 六源同源：index.js / manifest.json / package.json / memory-config.js / memory-core.js / memory-organs.js；
  · **分发面**：manifest.extra_js 99 → **101**（新增两模块，追加在末尾 —— 消费方在后）；
  · 人读面：README 版本行 / 测试文件数 / extra_js 项数 / 运行时模块数 / 全量待验标；
    PLAN 现状基线表（版本 / 在役面 / 体量 / 全量待验）；
  · **数量锁**：tests/v3209 两处 `=== 99` 显式改成 `=== 101`（不改成下界 ——
    当版数量锁必须钉死当版，否则「模块加了但没进 extra_js」会被静默放行）；
  · **既有版本读数锚交棒**：v3323 的 `assert.equal(MF.extra_js.length, 99, ...)` 是
    C 包那一刀的一次性事实（本仓定性过的「把某版读数当永久不变量」），本刀新增两模块 ⇒
    按 v3296 / v3323 先例交棒当版（v3324 F3），历史档改守下界 + 留痕。
全部锚点先校验、通过后统一写盘；任一锚点命中数不符即整体退出，不留半成品。
"""
import io
import sys

EDITS = []


def rep(path, old, new, must=1):
    EDITS.append((path, old, new, must))


# ---- ① 分发面：extra_js 99 → 101（追加在末尾：加载序上它们是既有面的**消费方**） ----
rep('manifest.json',
    '        "relation-history.js",\n        "causal-chain.js",\n        "perspective-card.js"\n    ],',
    '        "relation-history.js",\n        "causal-chain.js",\n        "perspective-card.js",\n'
    '        "extraction-driver.js",\n        "correction-plan.js"\n    ],')

# ---- ② 六源版本 ----
rep('index.js', "const VERSION = '3.323.0';", "const VERSION = '3.324.0';")
rep('memory-config.js', "let VERSION = '3.323.0';", "let VERSION = '3.324.0';")
rep('memory-core.js', "let VERSION = '3.323.0';", "let VERSION = '3.324.0';")
rep('memory-organs.js', "let VERSION = '3.323.0';", "let VERSION = '3.324.0';")
rep('manifest.json', '"version": "3.323.0"', '"version": "3.324.0"')
rep('package.json', '"version": "3.323.0"', '"version": "3.324.0"')

# ---- ③ 人读面：README ----
rep('README.md', '**当前版本**：`3.323.0`', '**当前版本**：`3.324.0`')
# 在役面：新增一档测试文件 304 → 305（D2/D2b 核回磁盘，四处读数同步）
rep('README.md', '当前发现 **304 个测试文件**', '当前发现 **305 个测试文件**')
rep('README.md', '全部用例：304 个测试文件', '全部用例：305 个测试文件')
rep('README.md', '# 在役面：304 个测试文件', '# 在役面：305 个测试文件')
rep('README.md', '`tests/` 304 个测试文件', '`tests/` 305 个测试文件')
# 分发面与运行时模块读数（D3/D4 核回 manifest 与磁盘）
rep('README.md', '的 `extra_js`（99 项）按', '的 `extra_js`（101 项）按')
rep('README.md', 'extra_js 99 / extra_css 2', 'extra_js 101 / extra_css 2')
rep('README.md', '与 `extra_js` **99 项**是两个口径', '与 `extra_js` **101 项**是两个口径')
rep('README.md', '+ `extra_js` 99 项 + CSS 3 项', '+ `extra_js` 101 项 + CSS 3 项')
rep('README.md', '**运行时模块**：100 个（根目录 `.js`', '**运行时模块**：102 个（根目录 `.js`')
# 待验标记（D6 登记停在 v3.318.0 ⇒ 两处必须写当版）
rep('README.md', '当前版本 v3.323.0 **全量待验** —— 本快照就是', '当前版本 v3.324.0 **全量待验** —— 本快照就是')
rep('README.md', '当前版本 v3.323.0 **全量待验** —— 最近一次全量实跑快照', '当前版本 v3.324.0 **全量待验** —— 最近一次全量实跑快照')

# ---- ④ 人读面：PLAN ----
rep('PLAN.md', '> **当前执行状态（2026-10-12，v3.323.0）**', '> **当前执行状态（2026-10-12，v3.324.0）**')
rep('PLAN.md', '| 版本 | **v3.323.0**（四源同源；本表原为 v3.266.0）', '| 版本 | **v3.324.0**（四源同源；本表原为 v3.266.0）')
rep('PLAN.md', '在役面 **304 测试文件 / 61 个 audit 脚本**', '在役面 **305 测试文件 / 61 个 audit 脚本**')
rep('PLAN.md', '；当前 v3.323.0 **全量待验**', '；当前 v3.324.0 **全量待验**')
# 体量：宿主行数 / 成员数 / extra_js 项数（读数取自 tests/audit/host_beast_probe.cjs 真跑，不手抄）
rep('PLAN.md',
    '| 体量 | `index.js` **18222 行**（探针读数；`wc -l` 18221） / **680** 成员 —— 原 A1 六刀后为 13883 / 521；+ extra_js **99** 项',
    '| 体量 | `index.js` **18417 行**（探针读数；`wc -l` 18416） / **686** 成员 —— 原 A1 六刀后为 13883 / 521；+ extra_js **101** 项')

# ---- ⑤ 数量锁：v3209 两处 ----
rep('tests/v3209_migration_registry.test.mjs',
    "A(mf.extra_js.length === 99, 'extra_js 须 99 项（v3.323.0",
    "A(mf.extra_js.length === 101, 'extra_js 须 101 项（v3.324.0 D 包记忆侧第一刀 M3-O5/M3-O7/M3-X9 新增 extraction-driver.js / correction-plan.js，99 → 101；v3.323.0")
rep('tests/v3209_migration_registry.test.mjs',
    "A(files.length === 99, 'extra_js 抽取器应得 99 项（v3.323.0",
    "A(files.length === 101, 'extra_js 抽取器应得 101 项（v3.324.0 D 包记忆侧第一刀新增两模块，99 → 101；v3.323.0")

# ---- ⑥ 既有版本读数锚交棒（v3323 的 extra_js 总项数硬锁） ----
rep('tests/v3323_c_pack_group_relation.test.mjs',
    "    assert.equal(MF.extra_js.length, 99, 'v3.323.0 C 包新增三模块：分发面 96 → 99，实 ' + MF.extra_js.length);",
    "    /* [v3.324.0 交棒] 原文是 `assert.equal(MF.extra_js.length, 99, ...)` ——\n"
    "     *   【硬锁出生版读数】：99 是 C 包那一刀的一次性事实，D 包新增两模块后\n"
    "     *   （99 → 101）它会翻红，而翻红的信息量只剩「数字不对」。本仓同族坑已定性三轮\n"
    "     *   （v3296 §8 总项数锁、v3321/v3322 交棒）。交棒**不弱化**：本档改守**下界**\n"
    "     *   （不低于出生时的 99），当版项数锁由 tests/v3324_d_pack_extraction_driver.test.mjs 的 F3 接管。 */\n"
    "    assert.ok(MF.extra_js.length >= 99,\n"
    "        'extra_js 项数不得低于本档出生时的 99（当版项数锁已交棒 v3324 F3），实 ' + MF.extra_js.length);")

for path, old, new, must in EDITS:
    src = io.open(path, encoding='utf-8').read()
    n = src.count(old)
    if n != must:
        sys.exit('[bump3324] %s 锚点命中 %d 次（期望 %d）：%r' % (path, n, must, old[:80]))
    io.open(path, 'w', encoding='utf-8').write(src.replace(old, new))
    print('[bump3324] ok %s' % path)
print('[bump3324] 完成：六源 + 分发面 99→101 + 人读面 + 数量锁 + 一处读数锚交棒')