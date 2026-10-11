#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""bump3315.py - 抬版 v3.314.0 -> v3.315.0（M-X5 角色知识传播的可见范围预演）。

锚点纪律：每处锚点先校验命中次数，全部通过后统一写盘。--dry 亦跑完全部校验。
★ 沿革：v3.310.0 的 bump3310.py 曾「半执行」留下半成品；v3.314.0 的 bump3314.py 沿用
  「先全量校验（含派生面），再逐文件写盘」。本脚本照此办理。
★ 本版**不新增跨仓外供面**（M-X5 拓展计划原文未要求）：open_face_registry.tsv 只做
  memoryToolsEnvelope 行的 producer_version 同步抬版（v3305:553 硬要求
  「producer_version 必须与当前版本同步」），**不追加行** —— 所以派生面校验改成
  「该行已同步到本版 且 全表行数不变（仍 7 面）」。
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
edit('index.js', [('ver', "const VERSION = '3.314.0';", "const VERSION = '3.315.0';", 1)])
edit('manifest.json', [
    ('ver', '"version": "3.314.0",', '"version": "3.315.0",', 1),
    ('mod', '        "phone-fact-bridge.js"\n    ],',
     '        "phone-fact-bridge.js",\n        "knowledge-preview.js"\n    ],', 1),
])
edit('package.json', [('ver', '"version": "3.314.0"', '"version": "3.315.0"', 1)])
edit('memory-config.js', [('ver', "let VERSION = '3.314.0';", "let VERSION = '3.315.0';", 1)])
edit('memory-core.js', [('ver', "let VERSION = '3.314.0';", "let VERSION = '3.315.0';", 1)])
edit('memory-organs.js', [('ver', "let VERSION = '3.314.0';", "let VERSION = '3.315.0';", 1)])

# -- 二、README 人读面读数（D1/D2/D3/D4 四处 + 待验标记）----------------
edit('README.md', [
    ('rd-ver', '**当前版本**：`3.314.0`', '**当前版本**：`3.315.0`', 1),
    ('rd-testcount', '**295 个测试文件**', '**296 个测试文件**', 1),
    ('rd-wait', '当前版本 v3.314.0 **全量待验**', '当前版本 v3.315.0 **全量待验**', 1),
    ('rd-extrajs1', '`extra_js`（93 项）', '`extra_js`（94 项）', 1),
    ('rd-extrajs2', 'extra_js 93 / extra_css 2', 'extra_js 94 / extra_css 2', 1),
    ('rd-rootjs', '**运行时模块**：94 个（根目录 `.js`，含入口 `index.js`；与 `extra_js` **93 项**是两个口径',
     '**运行时模块**：95 个（根目录 `.js`，含入口 `index.js`；与 `extra_js` **94 项**是两个口径', 1),
    ('rd-load', '**载入面**：`index.js` + `extra_js` 93 项 + CSS 3 项',
     '**载入面**：`index.js` + `extra_js` 94 项 + CSS 3 项', 1),
])

# -- 三、PLAN 现状基线表 + 文首现行口径 -------------------------------
edit('PLAN.md', [
    ('pl-cur', '（2026-10-11，v3.314.0）', '（2026-10-11，v3.315.0）', 1),
    ('pl-wait', '**当前 v3.314.0 全量待验**', '**当前 v3.315.0 全量待验**', 1),
    ('pl-ver', '| 版本 | **v3.314.0**（四源同源；本表原为 v3.266.0） |',
     '| 版本 | **v3.315.0**（四源同源；本表原为 v3.266.0） |', 1),
    ('pl-gate', '在役面 **295 测试文件 / 60 个 audit 脚本**', '在役面 **296 测试文件 / 60 个 audit 脚本**', 1),
    ('pl-snap', '当前 v3.314.0 **全量待验**', '当前 v3.315.0 **全量待验**', 1),
    ('pl-size', '`index.js` **17042 行**（物理行；探针读数 17042 行 / **626** 成员 —— 原 A1 六刀后为 13883 / 521）+ extra_js **93** 项',
     '`index.js` **17219 行**（物理行；探针读数 17219 行 / **635** 成员 —— 原 A1 六刀后为 13883 / 521）+ extra_js **94** 项', 1),
])

# -- 四、v3209 数量锁：93 -> 94（注释链逐版追加）-------------------------
edit('tests/v3209_migration_registry.test.mjs', [
    ('lockv1', 'A(mf.extra_js.length === 93,', 'A(mf.extra_js.length === 94,', 1),
    ('lockv2', 'A(files.length === 93,', 'A(files.length === 94,', 1),
    ('lock1', "'extra_js 须 93 项（v3.314.0 M-X6 新增 phone-fact-bridge.js，当版 93；",
     "'extra_js 须 94 项（v3.315.0 M-X5 新增 knowledge-preview.js，当版 94；v3.314.0 M-X6 新增 phone-fact-bridge.js，当版 93；", 1),
    ('lock2', "'extra_js 抽取器应得 93 项（v3.314.0 M-X6 phone-fact-bridge.js，当版 93；",
     "'extra_js 抽取器应得 94 项（v3.315.0 M-X5 knowledge-preview.js，当版 94；v3.314.0 M-X6 phone-fact-bridge.js，当版 93；", 1),
])

# -- 五、v3247 REGISTRY ------------------------------------------------
edit('tests/v3247_break_kit_consolidation.test.mjs', [
    ('reg', "    'v3314_phone_fact_bridge.test.mjs',\n];",
     "    'v3314_phone_fact_bridge.test.mjs',\n    'v3315_knowledge_preview.test.mjs',\n];", 1),
])

# -- 六、open_face_registry：只同步 producer_version（不新增面）---------
edit('tests/audit/open_face_registry.tsv', [
    ('face', 'memoryToolsEnvelope\tlonsha-memory-plugin\tv3.314.0\t',
     'memoryToolsEnvelope\tlonsha-memory-plugin\tv3.315.0\t', 1),
])

# -- 七、TODO：新「最近更新」行前插，旧当前行原地降为历史留痕 -----------
TODO_HEAD = ('> **最近更新：v3.315.0** —— **M-X5（第二期拓展计划）角色知识传播的可见范围预演**：'
             '本仓此前能答「这条知识在第几楼、从谁、经哪条原始证据取得的」（X5 知识轨迹，答**过去**），'
             '但**答不了「下笔之前先看一眼」** —— 若按这条路传播下去，谁的认知会从哪一格变到哪一格？'
             '缺这一层的后果是**事后才知道越界**：秘密已经泄进公开线、误信已经落成「已知」，'
             '才发现某个角色根本不该知道（那时只能回滚，而回滚不覆盖已注入的上下文）。'
             '本刀交付 `knowledge-preview.js`（纯函数、零依赖、双导出、IIFE、591 行 / 27 个导出项）'
             '+ 宿主七出口 + 自检面一行诊断：'
             '★ **五条传播路径各自可达且取法不同**：`public`（参与者 + 目击者）/ `relay`（转述人）/ '
             '`private`（私聊对象，**不扩散**）/ `misbelieve`（误信）/ `correct`（纠正）—— '
             '四张表（方向 / 动作 / 理由码 / 途径）逐条对齐，**未知路径不落默认档**（写错路径名不再静默扩面）。'
             '★ **五档互斥**：`would-affect` / `no-change` / `would-reveal-secret` / `would-break-boundary` / '
             '`indeterminate`，且「判不了」**单独一档**（不得并入「改不动」—— 本仓最贵的老账）；'
             '面级档**认最坏一条**（indeterminate > 泄露 > 会变 > 改不动），不拿「大多数没事」把判不了淹没。'
             '★ **严格分离两面**：作者预览面带理由 / 途径 / 动作 / 证据键 / 改法建议；角色生成面**只带 who / after**，'
             '其余收敛成 `withheld` 计数，且禁止键表是**独立字面量真源**（不由作者面键集派生）。'
             '★ **零写**：预演不改传入的 payload / trace / opts（三处快照），**只产提案**，写法归 owner 侧经既有门。'
             '★ **同源不重复造证据**：同证据键 + 同角色 + 同动作 ⇒ `no-change / evidence-already-recorded` 并计 '
             '`duplicateEvidence`（M-X5 验收②「同一传播事件不生成多条重复证据」落在实现上）。'
             '★ **判不了就不假装判得了**：轨迹模块缺席 ⇒ 整面 indeterminate + `decidable:false` + 理由 '
             '`trace-module-absent`（**不假装改不动**）；碰秘密但边界无从判（无账 / 条目被剥空）⇒ '
             '`boundary-unjudgeable`（**不假装没边界**）；纠正无 misbelieve 前提 ⇒ `nothing-to-correct`。'
             '★ **离线**：源码零 require / fetch / XMLHttpRequest / localStorage / indexedDB / WebSocket。'
             '成对套件 `tests/v3315_knowledge_preview.test.mjs`（12 条，含七条真源码破坏负控制 + 正控制地基 + 判据纯度）。'
             '★ 跨仓面：本版**不新增外供面**（M-X5 拓展计划原文未要求），只把 `memoryToolsEnvelope` 行的 '
             '`producer_version` 同步抬到本版。')
edit('TODO.md', [
    ('td-line', '> **最近更新：v3.314.0** —— ', TODO_HEAD + chr(10) + '> **历史留痕：v3.314.0** —— ', 1),
])

# -- 八、CHANGELOG 新顶节（D9：档自述条数 + 两句契约声明）----------------
CHANGELOG_HEAD = open('/tmp/chlog3315_head.md', encoding='utf-8').read()
edit('CHANGELOG.md', [('cl-head', '## v3.314.0\n', CHANGELOG_HEAD + '## v3.314.0\n', 1)])

# ---- 校验：先全量校验，再写盘 ----
STAGE = []
bad = 0
for rel, pairs in EDIT:
    p = os.path.join(ROOT, rel)
    s = io.open(p, encoding='utf-8').read()
    for tag, old, new, want in pairs:
        n = s.count(old)
        if n != want:
            print('[bump3315] MISS %s / %s 期望 %d 次，实测 %d' % (rel, tag, want, n))
            bad += 1
        s = s.replace(old, new)
    STAGE.append((p, s))

STAGED = dict((os.path.basename(p), s) for p, s in STAGE)

# 派生面一：catalog_reference_consumers.tsv 必须缺且只缺本档一行
tsvp = os.path.join(ROOT, 'tests/audit/catalog_reference_consumers.tsv')
tsv = io.open(tsvp, encoding='utf-8').read()
if 'v3315_knowledge_preview.test.mjs' in tsv:
    print('[bump3315] MISS tsv 已含 v3315 行（重复追加会破坏双向差集）')
    bad += 1

# 派生面二：manifest 改后必须是 94 项且末位是本模块
try:
    mf = json.loads(STAGED['manifest.json'])
except Exception as e:
    print('[bump3315] MISS manifest.json 改后不是合法 JSON：%s' % e)
    bad += 1
    mf = None
if mf is not None:
    if len(mf['extra_js']) != 94:
        print('[bump3315] MISS manifest.extra_js 改后应 94 项，实 %d' % len(mf['extra_js']))
        bad += 1
    if mf['extra_js'][-1] != 'knowledge-preview.js':
        print('[bump3315] MISS manifest.extra_js 末位应 knowledge-preview.js，实 %s' % mf['extra_js'][-1])
        bad += 1
    if mf['extra_js'].count('knowledge-preview.js') != 1:
        print('[bump3315] MISS knowledge-preview.js 须恰出现 1 次')
        bad += 1
    if mf['extra_js'].count('phone-fact-bridge.js') != 1:
        print('[bump3315] MISS phone-fact-bridge.js 须恰 1 次（追加不得顶替邻居）')
        bad += 1

# 派生面三：open_face_registry 只同步 producer_version，不新增面
facep = os.path.join(ROOT, 'tests/audit/open_face_registry.tsv')
face_src = STAGED['open_face_registry.tsv']
face_rows = [l for l in face_src.split(chr(10)) if l.strip() and not l.strip().startswith('#')]
if len(face_rows) != 7:
    print('[bump3315] MISS open_face_registry 面数应仍为 7（本版不新增面），实 %d' % len(face_rows))
    bad += 1
if face_src.count('memoryToolsEnvelope' + chr(9) + 'lonsha-memory-plugin' + chr(9) + 'v3.315.0' + chr(9)) != 1:
    print('[bump3315] MISS memoryToolsEnvelope 行 producer_version 未同步到 v3.315.0（v3305:553 硬要求）')
    bad += 1
if face_src.count('phoneFactReceipt' + chr(9) + 'lonsha-memory-plugin' + chr(9) + 'v3.314.0' + chr(9)) != 1:
    print('[bump3315] MISS phoneFactReceipt 行应留在 v3.314.0（那是产出它的版本）')
    bad += 1

# 派生面四：v3209 两处数量锁与新 manifest 同源
v3209 = STAGED['v3209_migration_registry.test.mjs']
if 'A(mf.extra_js.length === 94,' not in v3209 or 'A(files.length === 94,' not in v3209:
    print('[bump3315] MISS v3209 两处数量锁未同步为 94')
    bad += 1

if bad:
    raise SystemExit('[bump3315] 有 %d 处未通过校验，未写盘' % bad)


def append_row(text, row):
    lines = text.split(chr(10))
    if lines and lines[-1] == '':
        lines.insert(len(lines) - 1, row)
    else:
        lines.append(row)
    return chr(10).join(lines)


new_tsv_row = open('/tmp/tsv3315_row.txt', encoding='utf-8').read().rstrip(chr(10))

if not DRY:
    for p, s in STAGE:
        io.open(p, 'w', encoding='utf-8').write(s)
        print('[bump3315] wrote', os.path.relpath(p, ROOT))
    io.open(tsvp, 'w', encoding='utf-8').write(append_row(tsv, new_tsv_row))
    print('[bump3315] wrote tests/audit/catalog_reference_consumers.tsv (+1 行)')
print('[bump3315] 完成' + ('（dry）' if DRY else ''))
