#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""bump_3321.py - [v3.321.0] 统一抬版（六源 + 人读面 + 台账 + 既有版本读数锚）

抬版纪律（沿用 A 包 v3320 工作流）：
  · 六源同源：index.js / manifest.json / package.json / memory-config.js /
    memory-core.js / memory-organs.js；
  · 人读面：CHANGELOG 顶节 + TODO 最近更新 + README 版本行 + PLAN 现状基线表；
  · 台账：catalog_reference_consumers.tsv +1 行；open_face_registry.tsv 同步 producer_version；
  · **既有版本读数锚**：v3307 断 `QUERY_VERSION === 2`，本轮 M3-O6 抬到 3 ⇒
    该断言记的是「v3.307 秘密面收口时的读数」，必须随版本同步并留痕（否则每次跑都红一片）。
"""
import io
import json
import re
import sys

EDITS = []


def rep(path, old, new, must=1):
    EDITS.append((path, old, new, must))


# ---- 六源 ----
rep('index.js', "const VERSION = '3.320.0';", "const VERSION = '3.321.0';")
rep('memory-config.js', "let VERSION = '3.320.0';", "let VERSION = '3.321.0';")
rep('memory-core.js', "let VERSION = '3.320.0';", "let VERSION = '3.321.0';")
rep('memory-organs.js', "let VERSION = '3.320.0';", "let VERSION = '3.321.0';")
rep('manifest.json', '"version": "3.320.0"', '"version": "3.321.0"')
rep('package.json', '"version": "3.320.0"', '"version": "3.321.0"')

# ---- 既有版本读数锚（v3307 记的是 v3.307 的读数；本轮 M3-O6 抬 QUERY_VERSION 2→3） ----
rep('tests/v3307_secret_scope_surface.test.mjs',
    "assert.equal(EQ.QUERY_VERSION, 2, '查询面版本须抬到 2（修后 row.text 不再含正文）');",
    "/* [v3.321.0 · B 包 M3-O6] 本行原为 `assert.equal(EQ.QUERY_VERSION, 2, ...)` ——\n"
    "     *   它记的是 **v3.307.0 秘密面收口那一刻的读数**。M3-O6 新增三面\n"
    "     *   （投影缓存 / 轻索引 / 协作式查询）后查询面抬到 **3**；\n"
    "     *   本档要守的是「查询面有版本常量在场且 ≥ 收口时的读数」，不是那个具体数字。 */\n"
    "    assert.ok(EQ.QUERY_VERSION >= 2, '查询面版本须在场且不低于 2（v3.307 收口读数；M3-O6 后为 3）');\n"
    "    assert.equal(EQ.QA_VERSION, 1, 'M3-X1 问答面版本须在场（v3.321.0）');")

# ---- README 人读面 ----
rep('README.md', '**当前版本**：`3.320.0`', '**当前版本**：`3.321.0`')
rep('README.md',
    "`npm test` 当前发现 **301 个测试文件**",
    "`npm test` 当前发现 **302 个测试文件**")
rep('PLAN.md', '| 版本 | **v3.320.0**', '| 版本 | **v3.321.0**')
rep('PLAN.md',
    '在役面 **301 测试文件 / 61 个 audit 脚本**',
    '在役面 **302 测试文件 / 61 个 audit 脚本**')

# ---- v3209 数量锁：B 包记忆侧**不新增模块**，仍 96，只补版本出处 ----
rep('tests/v3209_migration_registry.test.mjs',
    "A(mf.extra_js.length === 96, 'extra_js 须 96 项（v3.320.0 A 包记忆侧 M3-O2/O3/O9 改既有四文件**不新增模块**，仍 96；",
    "A(mf.extra_js.length === 96, 'extra_js 须 96 项（v3.321.0 B 包记忆侧 M3-O1/O4/O6/X1 改既有四文件**不新增模块**，仍 96；v3.320.0 A 包记忆侧 M3-O2/O3/O9 改既有四文件**不新增模块**，当版 96；")
rep('tests/v3209_migration_registry.test.mjs',
    "A(files.length === 96, 'extra_js 抽取器应得 96 项（v3.320.0 A 包记忆侧 M3-O2/O3/O9 改既有四文件**不新增模块**，仍 96；",
    "A(files.length === 96, 'extra_js 抽取器应得 96 项（v3.321.0 B 包记忆侧 M3-O1/O4/O6/X1 改既有四文件**不新增模块**，仍 96；v3.320.0 A 包记忆侧 M3-O2/O3/O9 改既有四文件**不新增模块**，当版 96；")

# ---- v3247 破坏套件台账：登记 v3321 ----
rep('tests/v3247_break_kit_consolidation.test.mjs',
    "    'v3320_a_pack_identity_memory_time.test.mjs',\n];",
    "    'v3320_a_pack_identity_memory_time.test.mjs',\n"
    "    /* [v3.321.0 B 包记忆侧] 本档从 tests/_break_kit.mjs 取 breakOnce（真源码破坏），\n"
    "     *   按 B1 台账纪律（接入面 == 磁盘事实）在此登记。 */\n"
    "    'v3321_b_pack_long_memory_time.test.mjs',\n];")

# ---- open_face_registry：memoryToolsEnvelope 的 producer_version 同步（能力面本身未变） ----
rep('tests/audit/open_face_registry.tsv',
    'memoryToolsEnvelope\tlonsha-memory-plugin\tv3.320.0\t',
    'memoryToolsEnvelope\tlonsha-memory-plugin\tv3.321.0\t')

for path, old, new, must in EDITS:
    src = io.open(path, encoding='utf-8').read()
    n = src.count(old)
    if n != must:
        sys.exit('[bump] %s 锚点命中 %d 次（期望 %d）：%r' % (path, n, must, old[:70]))
    io.open(path, 'w', encoding='utf-8').write(src.replace(old, new))
    print('[bump] ok %s' % path)
print('[bump] v3.321.0 六源 + 人读面 + 台账 + 版本读数锚 全部完成')