#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""bump3319.py - 抬版 v3.318.0 -> v3.319.0（CI 忠实性修复 + P7 探测面盲区）。

锚点纪律：每处锚点先校验命中次数，全部通过后统一写盘。--dry 亦跑完全部校验。
★ 本版**不新增运行时模块**（新增 1 个测试档 + 1 个判据 + 两处真缺陷修复）：
  - manifest.extra_js **仍 96 项**（不动）；
  - open_face_registry.tsv 不追加行（面数仍 7）；
  - v3209 数量锁两处**仍 96**（本版不增模块），只补版本出处。
"""
import io
import json
import os
import sys

ROOT = '/home/user/lonsha-memory-plugin'
DRY = ('--dry' in sys.argv)
EDIT = []
V_OLD = '3.318.0'
V_NEW = '3.319.0'


def edit(rel, pairs):
    EDIT.append((rel, pairs))


# -- 一、版本六源 -------------------------------------------------------
edit('index.js', [('ver', "const VERSION = '" + V_OLD + "';", "const VERSION = '" + V_NEW + "';", 1)])
edit('manifest.json', [('ver', '"version": "' + V_OLD + '",', '"version": "' + V_NEW + '",', 1)])
edit('package.json', [('ver', '"version": "' + V_OLD + '"', '"version": "' + V_NEW + '"', 1)])
edit('memory-config.js', [('ver', "let VERSION = '" + V_OLD + "';", "let VERSION = '" + V_NEW + "';", 1)])
edit('memory-core.js', [('ver', "let VERSION = '" + V_OLD + "';", "let VERSION = '" + V_NEW + "';", 1)])
edit('memory-organs.js', [('ver', "let VERSION = '" + V_OLD + "';", "let VERSION = '" + V_NEW + "';", 1)])

# -- 二、README 人读面读数 -----------------------------------------------
edit('README.md', [
    ('rd-ver', '**当前版本**：`' + V_OLD + '`', '**当前版本**：`' + V_NEW + '`', 1),
    ('rd-surface', '`npm test` 当前发现 **299 个测试文件**；`npm test -- --audit` 当前发现 **61/61** 审计脚本（`tests/audit/` 磁盘 **67** 个，6 个 `_` 前缀探针不进门禁扫描面）。',
     '`npm test` 当前发现 **300 个测试文件**；`npm test -- --audit` 当前发现 **61/61** 审计脚本（`tests/audit/` 磁盘 **67** 个，6 个 `_` 前缀探针不进门禁扫描面）。', 1),
    ('rd-line46', 'npm test             # 全部用例：299 个测试文件（在役面，磁盘枚举），各自独立子进程（隔离全局态污染）',
     'npm test             # 全部用例：300 个测试文件（在役面，磁盘枚举），各自独立子进程（隔离全局态污染）', 1),
    ('rd-line112', '├── tests/                # 在役面：299 个测试文件 + 61 个审计脚本（磁盘 67，6 个 `_` 探针除外）',
     '├── tests/                # 在役面：300 个测试文件 + 61 个审计脚本（磁盘 67，6 个 `_` 探针除外）', 1),
    ('rd-line123', '**在役面**（磁盘枚举，不代表已实跑）：`tests/` 299 个测试文件（`*.test.mjs`，即 `npm test` 的扫描面）',
     '**在役面**（磁盘枚举，不代表已实跑）：`tests/` 300 个测试文件（`*.test.mjs`，即 `npm test` 的扫描面）', 1),
    ('rd-wait', '当前版本 v' + V_OLD + ' **已实跑收口**', '当前版本 v' + V_NEW + ' **全量待验**', 1),
])

# -- 三、PLAN 现状基线表 + 文首口径 ------------------------------------
edit('PLAN.md', [
    ('pl-cur', '（2026-10-11，v' + V_OLD + '）', '（2026-10-11，v' + V_NEW + '）', 1),
    ('pl-ver', '| 版本 | **v' + V_OLD + '**（四源同源；本表原为 v3.266.0） |',
     '| 版本 | **v' + V_NEW + '**（四源同源；本表原为 v3.266.0） |', 1),
    ('pl-gate', '在役面 **299 测试文件 / 61 个 audit 脚本**（磁盘 67）',
     '在役面 **300 测试文件 / 61 个 audit 脚本**（磁盘 67）', 1),
    ('pl-snap', '当前 v' + V_OLD + ' **已实跑收口**', '当前 v' + V_NEW + ' **全量待验**', 1),
])

# -- 四、v3209 数量锁：项数不变（本版不新增模块），只补版本出处 --------
edit('tests/v3209_migration_registry.test.mjs', [
    ('lock1', 'extra_js 须 96 项（v3.318.0 M-O2 真浏览器切片**不新增模块**，仍 96；',
     'extra_js 须 96 项（v3.319.0 CI 忠实性修复**不新增模块**，仍 96；v3.318.0 M-O2 真浏览器切片不新增模块，当版 96；', 1),
    ('lock2', 'extra_js 抽取器应得 96 项（v3.318.0 M-O2 真浏览器切片**不新增模块**，仍 96；',
     'extra_js 抽取器应得 96 项（v3.319.0 CI 忠实性修复**不新增模块**，仍 96；v3.318.0 M-O2 真浏览器切片不新增模块，当版 96；', 1),
])

# -- 五、v3247 REGISTRY ------------------------------------------------
edit('tests/v3247_break_kit_consolidation.test.mjs', [
    ('reg', "    'v3318_ui_narrow_layout_gate.test.mjs',\n];",
     "    'v3318_ui_narrow_layout_gate.test.mjs',\n"
     "    /* [v3.319.0 CI 忠实性修复] 本档从 tests/_break_kit.mjs 取 breakText（真源码破坏），\n"
     "     *   按 B1 台账纪律（接入面 == 磁盘事实）在此登记。 */\n"
     "    'v3319_ci_faithful_probe_and_attribution.test.mjs',\n];", 1),
])

# -- 五b、open_face_registry：只同步 producer_version（不新增面，v3305:553 硬要求）
edit('tests/audit/open_face_registry.tsv', [
    ('face', 'memoryToolsEnvelope' + chr(9) + 'lonsha-memory-plugin' + chr(9) + 'v' + V_OLD + chr(9),
     'memoryToolsEnvelope' + chr(9) + 'lonsha-memory-plugin' + chr(9) + 'v' + V_NEW + chr(9), 1),
])

# -- 六、TODO：新「最近更新」行前插，旧当前行降为历史留痕 -----------
TODO_HEAD = io.open('/tmp/todo3319.txt', encoding='utf-8').read().rstrip(chr(10))
edit('TODO.md', [
    ('td-line', '> **最近更新：v' + V_OLD + '** —— ', TODO_HEAD + chr(10) + '> **历史留痕：v' + V_OLD + '** —— ', 1),
])

# -- 七、CHANGELOG 新顶节 -----------------------------------------------
CHANGELOG_HEAD = io.open('/tmp/chlog3319_head.md', encoding='utf-8').read()
edit('CHANGELOG.md', [('cl-head', '## v' + V_OLD + '\n', CHANGELOG_HEAD + '## v' + V_OLD + '\n', 1)])

# ---- 校验：先全量校验，再写盘 ----
STAGE = []
bad = 0
for rel, pairs in EDIT:
    p = os.path.join(ROOT, rel)
    s = io.open(p, encoding='utf-8').read()
    for tag, old, new, want in pairs:
        n = s.count(old)
        if n != want:
            print('[bump3319] MISS %s / %s 期望 %d 次，实测 %d' % (rel, tag, want, n))
            bad += 1
        s = s.replace(old, new)
    STAGE.append((p, s))

STAGED = dict((os.path.basename(p), s) for p, s in STAGE)

# 派生面一：catalog_reference_consumers.tsv 必须缺且只缺本档一行
tsvp = os.path.join(ROOT, 'tests/audit/catalog_reference_consumers.tsv')
tsv = io.open(tsvp, encoding='utf-8').read()
if 'v3319_ci_faithful_probe_and_attribution.test.mjs' in tsv:
    print('[bump3319] MISS tsv 已含 v3319 行（重复追加会破坏双向差集）')
    bad += 1

# 派生面二：manifest 改后必须仍是 96 项
try:
    mf = json.loads(STAGED['manifest.json'])
except Exception as e:
    print('[bump3319] MISS manifest.json 改后不是合法 JSON：%s' % e)
    bad += 1
    mf = None
if mf is not None:
    if len(mf['extra_js']) != 96:
        print('[bump3319] MISS manifest.extra_js 改后应仍 96 项（本版不增模块），实 %d' % len(mf['extra_js']))
        bad += 1
    if mf['extra_js'][-1] != 'project-registry.js':
        print('[bump3319] MISS manifest.extra_js 末位应仍 project-registry.js，实 %s' % mf['extra_js'][-1])
        bad += 1

# 派生面三：open_face_registry 面数仍 7 且本版不动行
face_src = STAGED['open_face_registry.tsv'] if 'open_face_registry.tsv' in STAGED else io.open(os.path.join(ROOT, 'tests/audit/open_face_registry.tsv'), encoding='utf-8').read()
face_rows = [l for l in face_src.split(chr(10)) if l.strip() and not l.strip().startswith('#')]
if len(face_rows) != 7:
    print('[bump3319] MISS open_face_registry 面数应仍为 7（本版不新增面），实 %d' % len(face_rows))
    bad += 1

# 派生面四：v3209 两处数量锁与新 manifest 同源（仍 96）
v3209 = STAGED['v3209_migration_registry.test.mjs']
if 'A(mf.extra_js.length === 96,' not in v3209 or 'A(files.length === 96,' not in v3209:
    print('[bump3319] MISS v3209 两处数量锁应为 96（本版不增模块）')
    bad += 1

# 派生面五：六源同源 + v3319 自带当版锚
for f, pat in [('index.js', "const VERSION = '" + V_NEW + "';"),
               ('memory-config.js', "let VERSION = '" + V_NEW + "';"),
               ('memory-core.js', "let VERSION = '" + V_NEW + "';"),
               ('memory-organs.js', "let VERSION = '" + V_NEW + "';")]:
    if pat not in STAGED[f]:
        print('[bump3319] MISS %s 未抬至 %s' % (f, V_NEW))
        bad += 1
for f in ['manifest.json', 'package.json']:
    if V_NEW not in STAGED[f]:
        print('[bump3319] MISS %s 未抬至 %s' % (f, V_NEW))
        bad += 1
v3319 = io.open(os.path.join(ROOT, 'tests/v3319_ci_faithful_probe_and_attribution.test.mjs'), encoding='utf-8').read()
if "vnum('" + V_NEW + "')" not in v3319:
    print('[bump3319] MISS v3319 未自带当版锚 vnum(\'%s\')' % V_NEW)
    bad += 1
if 'v3319_ci_faithful_probe_and_attribution' not in v3319:
    print('[bump3319] MISS v3319 头部未自报文件名（frontier 判定要求同行出现文件名与当版号）')
    bad += 1

if bad:
    raise SystemExit('[bump3319] 有 %d 处未通过校验，未写盘' % bad)


def append_row(text, row):
    lines = text.split(chr(10))
    if lines and lines[-1] == '':
        lines.insert(len(lines) - 1, row)
    else:
        lines.append(row)
    return chr(10).join(lines)


new_tsv_row = io.open('/tmp/tsv3319_row.txt', encoding='utf-8').read().rstrip(chr(10))

if not DRY:
    for p, s in STAGE:
        io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
        print('[bump3319] wrote', os.path.relpath(p, ROOT))
    io.open(tsvp, 'w', encoding='utf-8', newline='\n').write(append_row(tsv, new_tsv_row) + chr(10) if not tsv.endswith(chr(10)) else append_row(tsv, new_tsv_row))
    print('[bump3319] wrote tests/audit/catalog_reference_consumers.tsv (+1 行)')
print('[bump3319] 完成' + ('（dry）' if DRY else ''))
