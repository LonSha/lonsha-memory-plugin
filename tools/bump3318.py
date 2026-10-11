#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""bump3318.py - 抬版 v3.317.0 -> v3.318.0（M-O2 真浏览器切片·窄屏布局容差收口）。

锚点纪律：每处锚点先校验命中次数，全部通过后统一写盘。--dry 亦跑完全部校验。
★ 本版**不新增运行时模块**（只新增 1 个审计门 + 1 个测试档 + 1 个只读工具）：
  - manifest.extra_js **仍 96 项**（不动）；
  - open_face_registry.tsv 只做 memoryToolsEnvelope 行的 producer_version 同步抬版
    （v3305:553 硬要求），**不追加行**（面数仍 7）；
  - v3209 数量锁两处**仍 96**（本版不增模块），只补版本出处。
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
edit('index.js', [('ver', "const VERSION = '3.317.0';", "const VERSION = '3.318.0';", 1)])
edit('manifest.json', [('ver', '"version": "3.317.0",', '"version": "3.318.0",', 1)])
edit('package.json', [('ver', '"version": "3.317.0"', '"version": "3.318.0"', 1)])
edit('memory-config.js', [('ver', "let VERSION = '3.317.0';", "let VERSION = '3.318.0';", 1)])
edit('memory-core.js', [('ver', "let VERSION = '3.317.0';", "let VERSION = '3.318.0';", 1)])
edit('memory-organs.js', [('ver', "let VERSION = '3.317.0';", "let VERSION = '3.318.0';", 1)])

# -- 二、README 人读面读数 -----------------------------------------------
edit('README.md', [
    ('rd-ver', '**当前版本**：`3.317.0`', '**当前版本**：`3.318.0`', 1),
    ('rd-surface', '`npm test` 当前发现 **298 个测试文件**；`npm test -- --audit` 当前发现 **60/60** 审计脚本（`tests/audit/` 磁盘 **65** 个，5 个 `_` 前缀探针不进门禁扫描面）。',
     '`npm test` 当前发现 **299 个测试文件**；`npm test -- --audit` 当前发现 **61/61** 审计脚本（`tests/audit/` 磁盘 **67** 个，6 个 `_` 前缀探针不进门禁扫描面）。', 1),
    ('rd-wait', '当前版本 v3.317.0 **全量待验**', '当前版本 v3.318.0 **全量待验**', 1),
    ('rd-tree', '277 个测试文件 + 59 个审计脚本（磁盘 63，4 个 `_` 探针除外）',
     '277 个测试文件 + 59 个审计脚本（磁盘 63，4 个 `_` 探针除外；**现值见行 8**）', 1),
    ('rd-now', '`tests/audit/` 59 个审计脚本（磁盘 63，4 个 `_` 探针不进门禁扫描面）',
     '`tests/audit/` 59 个审计脚本（磁盘 63，4 个 `_` 探针不进门禁扫描面；**现值见行 8**）', 1),
])

# -- 三、PLAN 现状基线表 + 文首现行口径 -------------------------------
edit('PLAN.md', [
    ('pl-cur', '（2026-10-11，v3.317.0）', '（2026-10-11，v3.318.0）', 1),
    ('pl-o2', '**O2（真实用户操作，部分交付 —— 交互逻辑切片 v3.287.0：控件真操作 / 状态真改变 / 重开真保留 / 展开与窄屏，判据 `scan_ui_interaction.mjs` + `v3287_ui_interaction.test.mjs`；真浏览器 + 真 SillyTavern 面因交付者环境无任何 headless 浏览器与真宿主，**如实登记未执行、故 O2 未收口**）**',
     '**O2（真实用户操作，**已收口** —— v3.287.0 交互逻辑切片（`scan_ui_interaction.mjs` + `v3287_ui_interaction.test.mjs`）+ v3.300.0~v3.303.0 三刀，+ **v3.318.0 真浏览器切片**：真 Chromium（CDP 直连，零依赖）+ 真 SillyTavern 1.19.0 实测 `boot/装载/真鼠标/真键盘/真 localStorage/Emulation 窄屏/重开保留` 33 条读数（探针 `_mo2_realbrowser_probe.mjs`，`_` 前缀不进 npm test）；★ 该切片当场抓到**产品面真缺陷**：320px 下 `.ls-hint` 的长不可断 ASCII 串无断行且 `.ls-row` 标签容器 `min-width:auto` ⇒ 行被撑到 474px、把 44px 的 checkbox 顶出视口（left=449 > 320），修后在册判据 `scan_ui_narrow_layout.mjs` + `v3318_ui_narrow_layout_gate.test.mjs` 把该形态钉住）**', 1),
    ('pl-wait', '**当前 v3.317.0 全量待验**', '**当前 v3.318.0 全量待验**', 1),
    ('pl-ver', '| 版本 | **v3.317.0**（四源同源；本表原为 v3.266.0） |',
     '| 版本 | **v3.318.0**（四源同源；本表原为 v3.266.0） |', 1),
    ('pl-gate', '在役面 **298 测试文件 / 60 个 audit 脚本**（磁盘 65）', '在役面 **299 测试文件 / 61 个 audit 脚本**（磁盘 67）', 1),
    ('pl-snap', '当前 v3.317.0 **全量待验**', '当前 v3.318.0 **全量待验**', 1),
])

# -- 四、v3209 数量锁：项数不变（本版不新增模块），只补版本出处 --------
edit('tests/v3209_migration_registry.test.mjs', [
    ('lock1', 'extra_js 须 96 项（v3.317.0 M-X3 新增 project-registry.js，当版 96；',
     'extra_js 须 96 项（v3.318.0 M-O2 真浏览器切片**不新增模块**，仍 96；v3.317.0 M-X3 新增 project-registry.js，当版 96；', 1),
    ('lock2', 'extra_js 抽取器应得 96 项（v3.317.0 M-X3 project-registry.js，当版 96；',
     'extra_js 抽取器应得 96 项（v3.318.0 M-O2 真浏览器切片**不新增模块**，仍 96；v3.317.0 M-X3 project-registry.js，当版 96；', 1),
])

# -- 五、v3247 REGISTRY ------------------------------------------------
edit('tests/v3247_break_kit_consolidation.test.mjs', [
    ('reg', "    'v3317_project_registry.test.mjs',\n];",
     "    'v3317_project_registry.test.mjs',\n"
     "    /* [v3.318.0 M-O2 真浏览器切片] 本档从 tests/_break_kit.mjs 取 breakSource / assertSingleHit，\n"
     "     *   按 B1 台账纪律（接入面 == 磁盘事实）在此登记。 */\n"
     "    'v3318_ui_narrow_layout_gate.test.mjs',\n];", 1),
])

# -- 六、open_face_registry：只同步 producer_version（不新增面）---------
edit('tests/audit/open_face_registry.tsv', [
    ('face', 'memoryToolsEnvelope' + chr(9) + 'lonsha-memory-plugin' + chr(9) + 'v3.317.0' + chr(9),
     'memoryToolsEnvelope' + chr(9) + 'lonsha-memory-plugin' + chr(9) + 'v3.318.0' + chr(9), 1),
])

# -- 七、TODO：新「最近更新」行前插，旧当前行原地降为历史留痕 -----------
TODO_HEAD = io.open('/tmp/todo3318.txt', encoding='utf-8').read().rstrip(chr(10))
edit('TODO.md', [
    ('td-line', '> **最近更新：v3.317.0** —— ', TODO_HEAD + chr(10) + '> **历史留痕：v3.317.0** —— ', 1),
])

# -- 八、CHANGELOG 新顶节 -----------------------------------------------
CHANGELOG_HEAD = io.open('/tmp/chlog3318_head.md', encoding='utf-8').read()
edit('CHANGELOG.md', [('cl-head', '## v3.317.0\n', CHANGELOG_HEAD + '## v3.317.0\n', 1)])

# ---- 校验：先全量校验，再写盘 ----
STAGE = []
bad = 0
for rel, pairs in EDIT:
    p = os.path.join(ROOT, rel)
    s = io.open(p, encoding='utf-8').read()
    for tag, old, new, want in pairs:
        n = s.count(old)
        if n != want:
            print('[bump3318] MISS %s / %s 期望 %d 次，实测 %d' % (rel, tag, want, n))
            bad += 1
        s = s.replace(old, new)
    STAGE.append((p, s))

STAGED = dict((os.path.basename(p), s) for p, s in STAGE)

# 派生面一：catalog_reference_consumers.tsv 必须缺且只缺本档一行
tsvp = os.path.join(ROOT, 'tests/audit/catalog_reference_consumers.tsv')
tsv = io.open(tsvp, encoding='utf-8').read()
if 'v3318_ui_narrow_layout_gate.test.mjs' in tsv:
    print('[bump3318] MISS tsv 已含 v3318 行（重复追加会破坏双向差集）')
    bad += 1

# 派生面二：manifest 改后必须仍是 96 项
try:
    mf = json.loads(STAGED['manifest.json'])
except Exception as e:
    print('[bump3318] MISS manifest.json 改后不是合法 JSON：%s' % e)
    bad += 1
    mf = None
if mf is not None:
    if len(mf['extra_js']) != 96:
        print('[bump3318] MISS manifest.extra_js 改后应仍 96 项（本版不增模块），实 %d' % len(mf['extra_js']))
        bad += 1
    if mf['extra_js'][-1] != 'project-registry.js':
        print('[bump3318] MISS manifest.extra_js 末位应仍 project-registry.js，实 %s' % mf['extra_js'][-1])
        bad += 1

# 派生面三：open_face_registry 只同步 producer_version，不新增面
face_src = STAGED['open_face_registry.tsv']
face_rows = [l for l in face_src.split(chr(10)) if l.strip() and not l.strip().startswith('#')]
if len(face_rows) != 7:
    print('[bump3318] MISS open_face_registry 面数应仍为 7（本版不新增面），实 %d' % len(face_rows))
    bad += 1
if face_src.count('memoryToolsEnvelope' + chr(9) + 'lonsha-memory-plugin' + chr(9) + 'v3.318.0' + chr(9)) != 1:
    print('[bump3318] MISS memoryToolsEnvelope 行 producer_version 未同步到 v3.318.0（v3305:553 硬要求）')
    bad += 1
if face_src.count('phoneFactReceipt' + chr(9) + 'lonsha-memory-plugin' + chr(9) + 'v3.314.0' + chr(9)) != 1:
    print('[bump3318] MISS phoneFactReceipt 行应留在 v3.314.0（那是产出它的版本）')
    bad += 1

# 派生面四：v3209 两处数量锁与新 manifest 同源（仍 96）
v3209 = STAGED['v3209_migration_registry.test.mjs']
if 'A(mf.extra_js.length === 96,' not in v3209 or 'A(files.length === 96,' not in v3209:
    print('[bump3318] MISS v3209 两处数量锁应为 96（本版不增模块）')
    bad += 1

if bad:
    raise SystemExit('[bump3318] 有 %d 处未通过校验，未写盘' % bad)


def append_row(text, row):
    lines = text.split(chr(10))
    if lines and lines[-1] == '':
        lines.insert(len(lines) - 1, row)
    else:
        lines.append(row)
    return chr(10).join(lines)


new_tsv_row = io.open('/tmp/tsv3318_row.txt', encoding='utf-8').read().rstrip(chr(10))

if not DRY:
    for p, s in STAGE:
        io.open(p, 'w', encoding='utf-8').write(s)
        print('[bump3318] wrote', os.path.relpath(p, ROOT))
    io.open(tsvp, 'w', encoding='utf-8').write(append_row(tsv, new_tsv_row))
    print('[bump3318] wrote tests/audit/catalog_reference_consumers.tsv (+1 行)')
print('[bump3318] 完成' + ('（dry）' if DRY else ''))
