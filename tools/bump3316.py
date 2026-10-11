#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""bump3316.py - 抬版 v3.315.0 -> v3.316.0（M-X7 提取质量反馈与可控策略配置）。

锚点纪律：每处锚点先校验命中次数，全部通过后统一写盘。--dry 亦跑完全部校验。
★ 本版**不新增跨仓外供面**（M-X7 拓展计划原文未要求）：open_face_registry.tsv 只做
  memoryToolsEnvelope 行的 producer_version 同步抬版（v3305:553 硬要求），**不追加行**。
"""
import io
import json
import os
import sys

ROOT = '/home/user/lonsha-memory-plugin'
DRY = ('--dry' in sys.argv)
EDIT = []


def edit(rel, pairs):
    EDIT.append((rel, pairs))


# -- 一、版本六源 -------------------------------------------------------
edit('index.js', [('ver', "const VERSION = '3.315.0';", "const VERSION = '3.316.0';", 1)])
edit('manifest.json', [
    ('ver', '"version": "3.315.0",', '"version": "3.316.0",', 1),
    ('mod', '        "knowledge-preview.js"\n    ],',
     '        "knowledge-preview.js",\n        "extract-feedback.js"\n    ],', 1),
])
edit('package.json', [('ver', '"version": "3.315.0"', '"version": "3.316.0"', 1)])
edit('memory-config.js', [('ver', "let VERSION = '3.315.0';", "let VERSION = '3.316.0';", 1)])
edit('memory-core.js', [('ver', "let VERSION = '3.315.0';", "let VERSION = '3.316.0';", 1)])
edit('memory-organs.js', [('ver', "let VERSION = '3.315.0';", "let VERSION = '3.316.0';", 1)])

# -- 二、README 人读面读数 ------------------------------------------------
edit('README.md', [
    ('rd-ver', '**当前版本**：`3.315.0`', '**当前版本**：`3.316.0`', 1),
    ('rd-testcount', '**296 个测试文件**', '**297 个测试文件**', 1),
    ('rd-wait', '当前版本 v3.315.0 **全量待验**', '当前版本 v3.316.0 **全量待验**', 1),
    ('rd-extrajs1', '`extra_js`（94 项）', '`extra_js`（95 项）', 1),
    ('rd-extrajs2', 'extra_js 94 / extra_css 2', 'extra_js 95 / extra_css 2', 1),
    ('rd-rootjs', '**运行时模块**：95 个（根目录 `.js`，含入口 `index.js`；与 `extra_js` **94 项**是两个口径',
     '**运行时模块**：96 个（根目录 `.js`，含入口 `index.js`；与 `extra_js` **95 项**是两个口径', 1),
    ('rd-load', '**载入面**：`index.js` + `extra_js` 94 项 + CSS 3 项',
     '**载入面**：`index.js` + `extra_js` 95 项 + CSS 3 项', 1),
])

# -- 三、PLAN 现状基线表 + 文首现行口径 -------------------------------
edit('PLAN.md', [
    ('pl-cur', '（2026-10-11，v3.315.0）', '（2026-10-11，v3.316.0）', 1),
    ('pl-wait', '**当前 v3.315.0 全量待验**', '**当前 v3.316.0 全量待验**', 1),
    ('pl-ver', '| 版本 | **v3.315.0**（四源同源；本表原为 v3.266.0） |',
     '| 版本 | **v3.316.0**（四源同源；本表原为 v3.266.0） |', 1),
    ('pl-gate', '在役面 **296 测试文件 / 60 个 audit 脚本**', '在役面 **297 测试文件 / 60 个 audit 脚本**', 1),
    ('pl-snap', '当前 v3.315.0 **全量待验**', '当前 v3.316.0 **全量待验**', 1),
    ('pl-size', '`index.js` **17219 行**（物理行；探针读数 17219 行 / **635** 成员 —— 原 A1 六刀后为 13883 / 521）+ extra_js **94** 项',
     '`index.js` **17401 行**（物理行；探针读数 17401 行 / **645** 成员 —— 原 A1 六刀后为 13883 / 521）+ extra_js **95** 项', 1),
])

# -- 四、v3209 数量锁：94 -> 95 ------------------------------------------
edit('tests/v3209_migration_registry.test.mjs', [
    ('lockv1', 'A(mf.extra_js.length === 94,', 'A(mf.extra_js.length === 95,', 1),
    ('lockv2', 'A(files.length === 94,', 'A(files.length === 95,', 1),
    ('lock1', "'extra_js 须 94 项（v3.315.0 M-X5 新增 knowledge-preview.js，当版 94；",
     "'extra_js 须 95 项（v3.316.0 M-X7 新增 extract-feedback.js，当版 95；v3.315.0 M-X5 新增 knowledge-preview.js，当版 94；", 1),
    ('lock2', "'extra_js 抽取器应得 94 项（v3.315.0 M-X5 knowledge-preview.js，当版 94；",
     "'extra_js 抽取器应得 95 项（v3.316.0 M-X7 extract-feedback.js，当版 95；v3.315.0 M-X5 knowledge-preview.js，当版 94；", 1),
])

# -- 五、v3247 REGISTRY ------------------------------------------------
edit('tests/v3247_break_kit_consolidation.test.mjs', [
    ('reg', "    'v3315_knowledge_preview.test.mjs',\n];",
     "    'v3315_knowledge_preview.test.mjs',\n    'v3316_extract_feedback.test.mjs',\n];", 1),
])

# -- 六、open_face_registry：只同步 producer_version（不新增面）---------
edit('tests/audit/open_face_registry.tsv', [
    ('face', 'memoryToolsEnvelope\tlonsha-memory-plugin\tv3.315.0\t',
     'memoryToolsEnvelope\tlonsha-memory-plugin\tv3.316.0\t', 1),
])

# -- 七、TODO：新「最近更新」行前插，旧当前行原地降为历史留痕 -----------
TODO_HEAD = open('/tmp/todo3316.txt', encoding='utf-8').read().rstrip(chr(10))
edit('TODO.md', [
    ('td-line', '> **最近更新：v3.315.0** —— ', TODO_HEAD + chr(10) + '> **历史留痕：v3.315.0** —— ', 1),
])

# -- 八、CHANGELOG 新顶节 -----------------------------------------------
CHANGELOG_HEAD = open('/tmp/chlog3316_head.md', encoding='utf-8').read()
edit('CHANGELOG.md', [('cl-head', '## v3.315.0\n', CHANGELOG_HEAD + '## v3.315.0\n', 1)])

# ---- 校验：先全量校验，再写盘 ----
STAGE = []
bad = 0
for rel, pairs in EDIT:
    p = os.path.join(ROOT, rel)
    s = io.open(p, encoding='utf-8').read()
    for tag, old, new, want in pairs:
        n = s.count(old)
        if n != want:
            print('[bump3316] MISS %s / %s 期望 %d 次，实测 %d' % (rel, tag, want, n))
            bad += 1
        s = s.replace(old, new)
    STAGE.append((p, s))

STAGED = dict((os.path.basename(p), s) for p, s in STAGE)

# 派生面一：catalog_reference_consumers.tsv 必须缺且只缺本档一行
tsvp = os.path.join(ROOT, 'tests/audit/catalog_reference_consumers.tsv')
tsv = io.open(tsvp, encoding='utf-8').read()
if 'v3316_extract_feedback.test.mjs' in tsv:
    print('[bump3316] MISS tsv 已含 v3316 行（重复追加会破坏双向差集）')
    bad += 1

# 派生面二：manifest 改后必须是 95 项且末位是本模块
try:
    mf = json.loads(STAGED['manifest.json'])
except Exception as e:
    print('[bump3316] MISS manifest.json 改后不是合法 JSON：%s' % e)
    bad += 1
    mf = None
if mf is not None:
    if len(mf['extra_js']) != 95:
        print('[bump3316] MISS manifest.extra_js 改后应 95 项，实 %d' % len(mf['extra_js']))
        bad += 1
    if mf['extra_js'][-1] != 'extract-feedback.js':
        print('[bump3316] MISS manifest.extra_js 末位应 extract-feedback.js，实 %s' % mf['extra_js'][-1])
        bad += 1
    if mf['extra_js'].count('extract-feedback.js') != 1:
        print('[bump3316] MISS extract-feedback.js 须恰出现 1 次')
        bad += 1
    if mf['extra_js'].count('knowledge-preview.js') != 1:
        print('[bump3316] MISS knowledge-preview.js 须恰 1 次（追加不得顶替邻居）')
        bad += 1

# 派生面三：open_face_registry 只同步 producer_version，不新增面
facep = os.path.join(ROOT, 'tests/audit/open_face_registry.tsv')
face_src = STAGED['open_face_registry.tsv']
face_rows = [l for l in face_src.split(chr(10)) if l.strip() and not l.strip().startswith('#')]
if len(face_rows) != 7:
    print('[bump3316] MISS open_face_registry 面数应仍为 7（本版不新增面），实 %d' % len(face_rows))
    bad += 1
if face_src.count('memoryToolsEnvelope' + chr(9) + 'lonsha-memory-plugin' + chr(9) + 'v3.316.0' + chr(9)) != 1:
    print('[bump3316] MISS memoryToolsEnvelope 行 producer_version 未同步到 v3.316.0（v3305:553 硬要求）')
    bad += 1
if face_src.count('phoneFactReceipt' + chr(9) + 'lonsha-memory-plugin' + chr(9) + 'v3.314.0' + chr(9)) != 1:
    print('[bump3316] MISS phoneFactReceipt 行应留在 v3.314.0（那是产出它的版本）')
    bad += 1

# 派生面四：v3209 两处数量锁与新 manifest 同源
v3209 = STAGED['v3209_migration_registry.test.mjs']
if 'A(mf.extra_js.length === 95,' not in v3209 or 'A(files.length === 95,' not in v3209:
    print('[bump3316] MISS v3209 两处数量锁未同步为 95')
    bad += 1

if bad:
    raise SystemExit('[bump3316] 有 %d 处未通过校验，未写盘' % bad)


def append_row(text, row):
    lines = text.split(chr(10))
    if lines and lines[-1] == '':
        lines.insert(len(lines) - 1, row)
    else:
        lines.append(row)
    return chr(10).join(lines)


new_tsv_row = open('/tmp/tsv3316_row.txt', encoding='utf-8').read().rstrip(chr(10))

if not DRY:
    for p, s in STAGE:
        io.open(p, 'w', encoding='utf-8').write(s)
        print('[bump3316] wrote', os.path.relpath(p, ROOT))
    io.open(tsvp, 'w', encoding='utf-8').write(append_row(tsv, new_tsv_row))
    print('[bump3316] wrote tests/audit/catalog_reference_consumers.tsv (+1 行)')
print('[bump3316] 完成' + ('（dry）' if DRY else ''))
