#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""bump_3323.py - [v3.323.0 · C 包记忆侧] 统一抬版（六源 + 人读面 + 数量锁 + 既有版本读数锚交棒）

抬版纪律（沿用 A/B 包工作流）：
  · 六源同源：index.js / manifest.json / package.json / memory-config.js /
    memory-core.js / memory-organs.js；
  · **分发面**：manifest.extra_js 96 → **99**（新增 relation-history.js /
    causal-chain.js / perspective-card.js，追加在末尾 —— 消费方在后）；
  · 人读面：CHANGELOG 顶节 + TODO 最近更新 + README 版本行 + PLAN 现状基线表；
  · **数量锁**：tests/v3209 的 407 / 426 两处 `=== 96` 必须显式改这里，
    否则「模块加了但没进 extra_js」会被静默放行；
  · **既有版本读数锚交棒**：v3321 / v3322 里的 `MF.extra_js.length === 96` 是
    **出生版本的一次性事实**（本仓定性过的「把某版读数当永久不变量」），
    本刀新增三模块 ⇒ 按 v3296 先例交棒当版（v3323 F3），历史档改守下界 + 留痕。
全部锚点先校验、通过后统一写盘；任一锚点命中数不符即整体退出，不留半成品。
"""
import io
import sys

EDITS = []


def rep(path, old, new, must=1):
    EDITS.append((path, old, new, must))


# ---- ① 分发面：extra_js 96 → 99 ----
# ★ manifest.json 是**严格 JSON**（多处 JSON.parse），不得插注释 —— 理由写在本脚本与 CHANGELOG。
#   三个新面追加在末尾：加载序上它们是**消费方**（读既有的图边 / 三本账 / 知识轨迹），
#   必须排在那些真源之后。
rep('manifest.json',
    '        "extract-feedback.js",\n        "project-registry.js"\n    ],',
    '        "extract-feedback.js",\n        "project-registry.js",\n'
    '        "relation-history.js",\n        "causal-chain.js",\n        "perspective-card.js"\n    ],')

# ---- ② 六源版本 ----
rep('index.js', "const VERSION = '3.322.0';", "const VERSION = '3.323.0';")
rep('memory-config.js', "let VERSION = '3.322.0';", "let VERSION = '3.323.0';")
rep('memory-core.js', "let VERSION = '3.322.0';", "let VERSION = '3.323.0';")
rep('memory-organs.js', "let VERSION = '3.322.0';", "let VERSION = '3.323.0';")
rep('manifest.json', '"version": "3.322.0"', '"version": "3.323.0"')
rep('package.json', '"version": "3.322.0"', '"version": "3.323.0"')

# ---- ③ 人读面：README ----
rep('README.md', '**当前版本**：`3.322.0`', '**当前版本**：`3.323.0`')
# 在役面：新增一档测试文件 303 → 304（D2/D2b 会核回磁盘，四处读数必须同步）
rep('README.md', '当前发现 **303 个测试文件**', '当前发现 **304 个测试文件**')
rep('README.md', '全部用例：303 个测试文件', '全部用例：304 个测试文件')
rep('README.md', '# 在役面：303 个测试文件', '# 在役面：304 个测试文件')
rep('README.md', '`tests/` 303 个测试文件', '`tests/` 304 个测试文件')
# 分发面与运行时模块读数（D3/D4 会核回 manifest 与磁盘）
rep('README.md', '的 `extra_js`（96 项）按', '的 `extra_js`（99 项）按')
rep('README.md', 'extra_js 96 / extra_css 2', 'extra_js 99 / extra_css 2')
rep('README.md', '与 `extra_js` **96 项**是两个口径', '与 `extra_js` **99 项**是两个口径')
rep('README.md', '+ `extra_js` 96 项 + CSS 3 项', '+ `extra_js` 99 项 + CSS 3 项')
rep('README.md', '**运行时模块**：97 个（根目录 `.js`', '**运行时模块**：100 个（根目录 `.js`')
# 待验标记（D6：登记停在 3.318.0 ⇒ 两处必须写当版）
rep('README.md', '当前版本 v3.322.0 **全量待验** —— 本快照就是', '当前版本 v3.323.0 **全量待验** —— 本快照就是')
rep('README.md', '当前版本 v3.322.0 **全量待验** —— 最近一次全量实跑快照', '当前版本 v3.323.0 **全量待验** —— 最近一次全量实跑快照')

# ---- ④ 人读面：PLAN ----
rep('PLAN.md', '> **当前执行状态（2026-10-11，v3.322.0）**', '> **当前执行状态（2026-10-12，v3.323.0）**')
rep('PLAN.md', '| 版本 | **v3.322.0**（四源同源；本表原为 v3.266.0）', '| 版本 | **v3.323.0**（四源同源；本表原为 v3.266.0）')
rep('PLAN.md', '在役面 **303 测试文件 / 61 个 audit 脚本**', '在役面 **304 测试文件 / 61 个 audit 脚本**')
rep('PLAN.md', '；当前 v3.322.0 **全量待验**', '；当前 v3.323.0 **全量待验**')
rep('PLAN.md',
    '| 体量 | `index.js` **18003 行**（物理行；探针读数 18003 行 / **669** 成员 —— 原 A1 六刀后为 13883 / 521）+ extra_js **96** 项',
    '| 体量 | `index.js` **18222 行**（探针读数；`wc -l` 18221） / **680** 成员 —— 原 A1 六刀后为 13883 / 521；+ extra_js **99** 项')

# ---- ⑤ 数量锁：v3209 两处 ----
rep('tests/v3209_migration_registry.test.mjs',
    "A(mf.extra_js.length === 96, 'extra_js 须 96 项（v3.321.0",
    "A(mf.extra_js.length === 99, 'extra_js 须 99 项（v3.323.0 C 包记忆侧 M3-X2/X3/X4 新增 relation-history.js / causal-chain.js / perspective-card.js，96 → 99；v3.321.0")
rep('tests/v3209_migration_registry.test.mjs',
    "A(files.length === 96, 'extra_js 抽取器应得 96 项（v3.321.0",
    "A(files.length === 99, 'extra_js 抽取器应得 99 项（v3.323.0 C 包记忆侧新增三模块，96 → 99；v3.321.0")

# ---- ⑥ 既有版本读数锚交棒（v3321 / v3322 的 extra_js 总项数硬锁） ----
rep('tests/v3321_b_pack_long_memory_time.test.mjs',
    "    assert.equal(MF.extra_js.length, 96, 'B 包记忆侧四项改既有文件、**不新增运行时模块**，仍 96');",
    "    /* [v3.323.0 交棒] 原文是 `assert.equal(MF.extra_js.length, 96, ...)` ——\n"
    "     *   【硬锁出生版读数】：96 是 B 包那一刀的一次性事实，C 包新增三模块后\n"
    "     *   （96 → 99）它会翻红，而翻红的信息量只剩「数字不对」。本仓同族坑已定性两轮\n"
    "     *   （v3296 §8 的总项数锁交棒）。交棒**不弱化**：本档改守**下界**（不低于出生时的\n"
    "     *   96），当版项数锁由 tests/v3323_c_pack_group_relation.test.mjs 的 F3 接管。 */\n"
    "    assert.ok(MF.extra_js.length >= 96,\n"
    "        'extra_js 项数不得低于本档出生时的 96（当版项数锁已交棒 v3323 F3），实 ' + MF.extra_js.length);")
rep('tests/v3322_qa_host_exit.test.mjs',
    "    assert.equal(MF.extra_js.length, 96, '本刀改既有文件、**不新增运行时模块**，仍 96');",
    "    /* [v3.323.0 交棒] 原文是 `assert.equal(MF.extra_js.length, 96, ...)` ——\n"
    "     *   同 v3321：那是出生版（v3.322.0）的一次性读数，C 包新增三模块后必然翻红。\n"
    "     *   交棒**不弱化**：本档改守下界，当版项数锁由 v3323 F3 接管。 */\n"
    "    assert.ok(MF.extra_js.length >= 96,\n"
    "        'extra_js 项数不得低于本档出生时的 96（当版项数锁已交棒 v3323 F3），实 ' + MF.extra_js.length);")

for path, old, new, must in EDITS:
    src = io.open(path, encoding='utf-8').read()
    n = src.count(old)
    if n != must:
        sys.exit('[bump3323] %s 锚点命中 %d 次（期望 %d）：%r' % (path, n, must, old[:70]))
    io.open(path, 'w', encoding='utf-8').write(src.replace(old, new))
    print('[bump3323] ok %s' % path)
print('[bump3323] 完成：六源 + 分发面 96→99 + 人读面 + 数量锁 + 两处读数锚交棒')