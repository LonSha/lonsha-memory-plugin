#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""bump3313.py - 抬版 v3.312.0 -> v3.313.0（M-X8 版本化记忆包与跨设备迁移）。

锚点纪律：每处锚点先校验命中次数，全部通过后统一写盘。
★ v3.310.0 的 bump3310.py 曾「半执行」留下半成品；v3.312.0 的 bump3312.py 也在首跑后
  补了两处锚点（v3209 的「⇒」与 README 探针数 5）。本脚本沿用「先全量校验（含派生面），
  再逐文件写盘」；--dry 亦跑完全部校验。
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
edit('index.js', [('ver', "const VERSION = '3.312.0';", "const VERSION = '3.313.0';", 1)])
edit('manifest.json', [
    ('ver', '"version": "3.312.0",', '"version": "3.313.0",', 1),
    ('mod', '        "fact-lifecycle.js"\n    ],',
     '        "fact-lifecycle.js",\n        "memory-package.js"\n    ],', 1),
])
edit('package.json', [('ver', '"version": "3.312.0"', '"version": "3.313.0"', 1)])
edit('memory-config.js', [('ver', "let VERSION = '3.312.0';", "let VERSION = '3.313.0';", 1)])
edit('memory-core.js', [('ver', "let VERSION = '3.312.0';", "let VERSION = '3.313.0';", 1)])
edit('memory-organs.js', [('ver', "let VERSION = '3.312.0';", "let VERSION = '3.313.0';", 1)])

# -- 二、README 人读面读数 -------------------------------------------
edit('README.md', [
    ('rd-ver', '**当前版本**：`3.312.0`', '**当前版本**：`3.313.0`', 1),
    ('rd-testcount', '**293 个测试文件**', '**294 个测试文件**', 1),
    ('rd-rootjs', '**运行时模块**：92 个（根目录 `.js`，含入口 `index.js`；与 `extra_js` **91 项**是两个口径',
     '**运行时模块**：93 个（根目录 `.js`，含入口 `index.js`；与 `extra_js` **92 项**是两个口径', 1),
    ('rd-extrajs', '`extra_js`（91 项）', '`extra_js`（92 项）', 1),
    ('rd-manifest', 'extra_js 91 / extra_css 2', 'extra_js 92 / extra_css 2', 1),
    ('rd-load', '`index.js` + `extra_js` 91 项 + CSS 3 项', '`index.js` + `extra_js` 92 项 + CSS 3 项', 1),
    ('rd-cur', '当前版本 v3.312.0 **全量待验**', '当前版本 v3.313.0 **全量待验**', 1),
])

# -- 三、PLAN 现状基线表 + 文首现行口径 -------------------------------
edit('PLAN.md', [
    ('pl-cur', '（2026-10-11，v3.312.0）', '（2026-10-11，v3.313.0）', 1),
    ('pl-ver', '| 版本 | **v3.312.0**（四源同源；本表原为 v3.266.0） |',
     '| 版本 | **v3.313.0**（四源同源；本表原为 v3.266.0） |', 1),
    ('pl-gate', '在役面 **293 测试文件 / 60 个 audit 脚本**', '在役面 **294 测试文件 / 60 个 audit 脚本**', 1),
    ('pl-size', '`index.js` **16706 行**（物理行；探针读数 16706 行 / **610** 成员 —— 原 A1 六刀后为 13883 / 521）+ extra_js **91** 项',
     '`index.js` **16862 行**（物理行；探针读数 16862 行 / **617** 成员 —— 原 A1 六刀后为 13883 / 521）+ extra_js **92** 项', 1),
    ('pl-snap', '当前 v3.312.0 **全量待验**', '当前 v3.313.0 **全量待验**', 1),
    ('pl-dir', '**当前 v3.312.0 全量待验**', '**当前 v3.313.0 全量待验**', 1),
])

# -- 四、v3209 数量锁：91 -> 92（★ 原文用「⇒」不是「=>」）--------------
edit('tests/v3209_migration_registry.test.mjs', [
    ('lockv1', 'A(mf.extra_js.length === 91,', 'A(mf.extra_js.length === 92,', 1),
    ('lockv2', 'A(files.length === 91,', 'A(files.length === 92,', 1),
    ('lock1', 'extra_js 须 91 项（v3.312.0 M-X4 新增 fact-lifecycle.js，当版 91；',
     'extra_js 须 92 项（v3.313.0 M-X8 新增 memory-package.js，当版 92；v3.312.0 M-X4 新增 fact-lifecycle.js，当版 91；', 1),
    ('lock2', 'extra_js 抽取器应得 91 项（v3.312.0 M-X4 fact-lifecycle.js，当版 91；',
     'extra_js 抽取器应得 92 项（v3.313.0 M-X8 memory-package.js，当版 92；v3.312.0 M-X4 fact-lifecycle.js，当版 91；', 1),
])

# -- 五、v3247 REGISTRY ------------------------------------------------
edit('tests/v3247_break_kit_consolidation.test.mjs', [
    ('reg', "    'v3312_fact_lifecycle.test.mjs',\n];",
     "    'v3312_fact_lifecycle.test.mjs',\n    'v3313_memory_package.test.mjs',\n];", 1),
])

# -- 六、open_face_registry producer_version --------------------------
edit('tests/audit/open_face_registry.tsv', [
    ('face', 'memoryToolsEnvelope\tlonsha-memory-plugin\tv3.312.0\t',
     'memoryToolsEnvelope\tlonsha-memory-plugin\tv3.313.0\t', 1),
])

# -- 七、TODO：新「最近更新」行前插，旧当前行原地降为历史留痕 -----------
TODO_HEAD = ('> **最近更新：v3.313.0** —— **M-X8（第二期拓展计划）版本化记忆包与跨设备迁移**：'
             '本仓此前能把「上一卷说了什么」接下去（X7 卷接续包），也能源在同一宿主的 localStorage 存命名检查点（R4-C），'
             '还有结构代际迁移注册表（v3.209）—— 但**没有任何一处**能把项目 / 角色 / 事实与知识边界'
             '打包成**可带走的版本化件**，也**没有一处**回答「用户从别的设备带回来的包能不能收、'
             '要不要迁、会不会静默丢字段」。本刀交付 `memory-package.js`（纯函数、零依赖、双导出、'
             '705 行）+ 宿主五出口 + 自检面一行诊断：★ **准入三态** `current / migrate / reject`，'
             '迁移路径一律**问** `schema-migration.plan()`（结构代际单一真源），它缺席 ⇒ '
             '`reject / migration-unavailable`（**不假装已是当前代际**）；包顶层出现不认识的键'
             '**默认拒**并逐条列 `unknownKeys`（静默丢字段正是验收①点名要治的那件），'
             '只有显式 `keepUnknown:true` 才放行且仍留痕。★ **幂等**：`importId` 由 包 id + 作用域 + '
             'revision 决定（确定性），`seen` 由**调用方**持有并回传 —— 本模块不偷偷写第二份导入账；'
             '重复导入是**正常读数**（`duplicate:true` / `ok:true`），不得与被挡同形。★ **来源悬空**：'
             '没给活源表 ⇒ `unknown`（判不了 ≠ 还在），给了空表 ⇒ `source-deleted`（查了，没有）；'
             '版本漂移仍是 live 但 `navigable:false`（旧锚点不可跳转）。★ **受限正文**：入口即剥，'
             '一律**定长**站位串（不随原文本长变化，否则长度就是读数），受限**键名整键清空**；'
             'keeper 过滤照走，挡掉的条数**必须计数可见**。★ **边界不打穿**：跨会话 / 跨分支的'
             '`sourceRef` 进 `blocked`，`planImport` 一律不出计划；`allowCrossBranch` 显式才放行且留痕。'
             '★ 撤销**有来源范围**（无范围即拒；范围外一条不动；重复条不再计）。'
             '★ 离线：源码零 `fetch` / `XMLHttpRequest` / `localStorage` / `indexedDB`。'
             '成对套件 `tests/v3313_memory_package.test.mjs`（14 条，含六条真源码破坏负控制 + '
             '正控制地基 + 反向对照 + 判据纯度）。')
edit('TODO.md', [
    ('td-line', '> **最近更新：v3.312.0** —— ', TODO_HEAD + chr(10) + '> **历史留痕：v3.312.0** —— ', 1),
])

# ---- 校验：先全量校验，再写盘 ----
STAGE = []
bad = 0
for rel, pairs in EDIT:
    p = os.path.join(ROOT, rel)
    s = io.open(p, encoding='utf-8').read()
    for tag, old, new, want in pairs:
        n = s.count(old)
        if n != want:
            print('[bump3313] MISS %s / %s 期望 %d 次，实测 %d' % (rel, tag, want, n))
            bad += 1
        s = s.replace(old, new)
    STAGE.append((p, s))

# 派生面一：catalog_reference_consumers.tsv 必须缺且只缺本档一行
tsvp = os.path.join(ROOT, 'tests/audit/catalog_reference_consumers.tsv')
tsv = io.open(tsvp, encoding='utf-8').read()
if 'v3313_memory_package.test.mjs' in tsv:
    print('[bump3313] MISS tsv 已含 v3313 行（重复追加会破坏双向差集）')
    bad += 1

# 派生面二：manifest 改后必须是 92 项且末位是本模块
mf_txt = dict((os.path.basename(p), s) for p, s in STAGE)['manifest.json']
try:
    mf = json.loads(mf_txt)
except Exception as e:
    print('[bump3313] MISS manifest.json 改后不是合法 JSON：%s' % e)
    bad += 1
    mf = None
if mf is not None:
    if len(mf['extra_js']) != 92:
        print('[bump3313] MISS manifest.extra_js 改后应 92 项，实 %d' % len(mf['extra_js']))
        bad += 1
    if mf['extra_js'][-1] != 'memory-package.js':
        print('[bump3313] MISS manifest.extra_js 末位应 memory-package.js，实 %s' % mf['extra_js'][-1])
        bad += 1

if bad:
    raise SystemExit('[bump3313] 有 %d 处未通过校验，未写盘' % bad)

# tsv 追加行
newrow = ('v3313_memory_package.test.mjs\t\tM-X8（版本化记忆包与跨设备迁移）的成对套件'
          '（14 条 test：含 L1 六条真源码破坏）：M1 登记面（extra_js 恰一次 + 与追加时邻居都在场）'
          '· M2 导出面（17 函数 / 五登记表 / 四状态词表 / 离线）· O1 造包七件齐 + 完全隔离'
          '· D1 准入三态（未知键默认拒 / 迁移缺席不假装当前代际 / 键面未判不报「无未知键」）'
          '· D2 当版版本锚 · S1 来源悬空（unknown ≠ live）· U1 受限正文（定长站位串 + 逐字反查）'
          '· P1 预览（同值幂等 / 冲突默认不替用户决定 / 悬空可见）· B1 幂等 + 边界不打穿'
          '· R1 撤销有来源边界 · H1 宿主接线逐符号 · E1/E2 端到端（缺格 / 模块缺席 / 键面未判）'
          '· L1 六条真源码破坏 + 正控制地基 + 反向对照。')
lines = tsv.split('\n')
if lines and lines[-1] == '':
    lines.insert(len(lines) - 1, newrow)
else:
    lines.append(newrow)

if not DRY:
    for p, s in STAGE:
        io.open(p, 'w', encoding='utf-8').write(s)
        print('[bump3313] wrote', os.path.relpath(p, ROOT))
    io.open(tsvp, 'w', encoding='utf-8').write('\n'.join(lines))
    print('[bump3313] wrote tests/audit/catalog_reference_consumers.tsv (+1 行)')
print('[bump3313] 完成' + ('（dry）' if DRY else ''))
