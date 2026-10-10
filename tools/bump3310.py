#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""bump3310.py — 抬版 v3.309.0 → v3.310.0（M-X1 用户侧记忆控制中心）。

锚点纪律：每处锚点先校验命中次数，全部通过后统一写盘。
"""
import io
import os
import sys

ROOT = '/home/user/lonsha-memory-plugin'
DRY = ('--dry' in sys.argv)


def edit(rel, pairs):
    p = os.path.join(ROOT, rel)
    s = io.open(p, encoding='utf-8').read()
    for tag, old, new, want in pairs:
        n = s.count(old)
        if n != want:
            raise SystemExit('[bump3310] %s / %s 期望 %d 次，实测 %d' % (rel, tag, want, n))
        s = s.replace(old, new)
    if not DRY:
        io.open(p, 'w', encoding='utf-8').write(s)
    print('ok', rel)


# ── 一、版本六源 ────────────────────────────────────────────────────────
edit('index.js', [('ver', "const VERSION = '3.309.0';", "const VERSION = '3.310.0';", 1)])
edit('manifest.json', [
    ('ver', '"version": "3.309.0",', '"version": "3.310.0",', 1),
    ('mod', '        "memory-tools-api.js"\n    ],', '        "memory-tools-api.js",\n        "memory-center.js"\n    ],', 1),
])
edit('package.json', [('ver', '"version": "3.309.0"', '"version": "3.310.0"', 1)])
edit('memory-config.js', [('ver', "let VERSION = '3.309.0';", "let VERSION = '3.310.0';", 1)])
edit('memory-core.js', [('ver', "let VERSION = '3.309.0';", "let VERSION = '3.310.0';", 1)])
edit('memory-organs.js', [('ver', "let VERSION = '3.309.0';", "let VERSION = '3.310.0';", 1)])

# ── 二、README 人读面数量（290 → 291；65 → 66）─────────────────────────
edit('README.md', [
    ('rd-testcount', '**290 个测试文件**', '**291 个测试文件**', 1),
    ('rd-auditdisk', '`tests/audit/` 磁盘 **65** 个', '`tests/audit/` 磁盘 **66** 个', 1),
])

# ── 三、v3209 数量锁：88 → 89 项（新增 memory-center.js）───────────────
edit('tests/v3209_migration_registry.test.mjs', [
    ('lock1', "extra_js 须 88 项（v3.309.0 M-O8 第四刀**不新增模块**，仍 88；",
     "extra_js 须 89 项（v3.310.0 M-X1 新增 memory-center.js；v3.309.0 M-O8 第四刀**不新增模块**，仍 88；", 1),
    ('lock1b', "仍 88；v3.308.0 M-O8 第三刀**不新增模块**，仍 88；v3.307.0 M-O8 第二刀不新增模块，仍 88；",
     "仍 89；v3.309.0 M-O8 第四刀不新增模块，仍 88；v3.308.0 M-O8 第三刀不新增模块，仍 88；", 1),
    ('lock2', "extra_js 抽取器应得 88 项（v3.309.0 M-O8 第四刀不新增模块，仍 88；",
     "extra_js 抽取器应得 89 项（v3.310.0 M-X1 memory-center.js；v3.309.0 M-O8 第四刀不新增模块，仍 88；", 1),
    ('lock2b', "仍 88；v3.308.0 M-O8 第三刀不新增模块，仍 88；v3.307.0 M-O8 第二刀不新增模块，仍 88；",
     "仍 89；v3.309.0 M-O8 第四刀不新增模块，仍 88；v3.308.0 M-O8 第三刀不新增模块，仍 88；", 1),
])

# ── 四、v3247 接入面台账：登记新档 ──────────────────────────────────────
edit('tests/v3247_break_kit_consolidation.test.mjs', [
    ('reg', "    'v3309_wp_branch_gate.test.mjs',",
     "    'v3309_wp_branch_gate.test.mjs',\n    'v3310_memory_center.test.mjs',", 1),
])

# ── 五、catalog_reference_consumers：补一行（P3 双向差集）─────────────
edit('tests/audit/catalog_reference_consumers.tsv', [
    ('ref', 'v3309_wp_branch_gate.test.mjs\n', 'v3309_wp_branch_gate.test.mjs\nv3310_memory_center.test.mjs\n', 1),
])
print('[bump3310] 完成' + ('（dry）' if DRY else ''))