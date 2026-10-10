#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""bump3309.py — 抬版 v3.308.0 → v3.309.0（M-O8 第四刀）。

锚点纪律：每处锚点先校验命中次数，全部通过后统一写盘。
"""
import io
import os

ROOT = '/home/user/lonsha-memory-plugin'


def edit(rel, pairs):
    p = os.path.join(ROOT, rel)
    s = io.open(p, encoding='utf-8').read()
    for tag, old, new, want in pairs:
        n = s.count(old)
        if n != want:
            raise SystemExit('[bump3309] %s / %s 期望 %d 次，实测 %d' % (rel, tag, want, n))
        s = s.replace(old, new)
    io.open(p, 'w', encoding='utf-8').write(s)
    print('ok', rel)


# ── 一、版本六源 ────────────────────────────────────────────────────────
edit('index.js', [('ver', "const VERSION = '3.308.0';", "const VERSION = '3.309.0';", 1)])
edit('manifest.json', [('ver', '"version": "3.308.0",', '"version": "3.309.0",', 1)])
edit('package.json', [('ver', '"version": "3.308.0"', '"version": "3.309.0"', 1)])
edit('memory-config.js', [('ver', "let VERSION = '3.308.0';", "let VERSION = '3.309.0';", 1)])
edit('memory-core.js', [('ver', "let VERSION = '3.308.0';", "let VERSION = '3.309.0';", 1)])
edit('memory-organs.js', [('ver', "let VERSION = '3.308.0';", "let VERSION = '3.309.0';", 1)])

# ── 二、README / PLAN 人读面数量读数（289 → 290 测试文件；64 → 65 审计磁盘）──
edit('README.md', [
    ('rd-testcount', '**289 个测试文件**', '**290 个测试文件**', 1),
    ('rd-auditdisk', '`tests/audit/` 磁盘 **64** 个', '`tests/audit/` 磁盘 **65** 个', 1),
])

# ── 三、v3209 数量锁：版本出处（不新增模块，仍 88 项，只补当版出处）──────
edit('tests/v3209_migration_registry.test.mjs', [
    ('lock1', "extra_js 须 88 项（v3.308.0 M-O8 第三刀**不新增模块**，仍 88；",
     "extra_js 须 88 项（v3.309.0 M-O8 第四刀**不新增模块**，仍 88；v3.308.0 M-O8 第三刀**不新增模块**，仍 88；", 1),
    ('lock2', "extra_js 抽取器应得 88 项（v3.308.0 M-O8 第三刀不新增模块，仍 88；",
     "extra_js 抽取器应得 88 项（v3.309.0 M-O8 第四刀不新增模块，仍 88；v3.308.0 M-O8 第三刀不新增模块，仍 88；", 1),
])

# ── 四、v3247 接入面台账：登记新档 ──────────────────────────────────────
edit('tests/v3247_break_kit_consolidation.test.mjs', [
    ('reg', "    'v3308_secret_scope_crossbranch.test.mjs',",
     "    'v3308_secret_scope_crossbranch.test.mjs',\n    'v3309_wp_branch_gate.test.mjs',", 1),
])

# ── 五、open_face_registry：memoryToolsEnvelope producer_version 随版 ───
edit('tests/audit/open_face_registry.tsv', [
    ('of',
     'memoryToolsEnvelope\tlonsha-memory-plugin\tv3.308.0\t',
     'memoryToolsEnvelope\tlonsha-memory-plugin\tv3.309.0\t', 1),
])
print('[bump3309] 完成（后续：catalog 登记尾行、host_beast 重绑、state-report 重生成、CHANGELOG）')