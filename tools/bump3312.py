#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""bump3312.py - 抬版 v3.311.0 -> v3.312.0（M-X4 事实生命周期与「遗忘 / 撤回 / 保留」控制）。

锚点纪律：每处锚点先校验命中次数，全部通过后统一写盘。
★ v3.310.0 的 bump3310.py 曾「半执行」留下三处半成品（断言值未改 / tsv 未追加 / 磁盘数被误写），
  本脚本改为「先全量校验（含派生面），再逐文件写盘」；--dry 亦跑完全部校验。
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
edit('index.js', [('ver', "const VERSION = '3.311.0';", "const VERSION = '3.312.0';", 1)])
edit('manifest.json', [
    ('ver', '"version": "3.311.0",', '"version": "3.312.0",', 1),
    ('mod', '        "repair-settle.js"\n    ],',
     '        "repair-settle.js",\n        "fact-lifecycle.js"\n    ],', 1),
])
edit('package.json', [('ver', '"version": "3.311.0"', '"version": "3.312.0"', 1)])
edit('memory-config.js', [('ver', "let VERSION = '3.311.0';", "let VERSION = '3.312.0';", 1)])
edit('memory-core.js', [('ver', "let VERSION = '3.311.0';", "let VERSION = '3.312.0';", 1)])
edit('memory-organs.js', [('ver', "let VERSION = '3.311.0';", "let VERSION = '3.312.0';", 1)])

# -- 二、README 人读面读数（D2/D2b/D3/D4 四处 + 探针数自洽）--------------
edit('README.md', [
    ('rd-testcount', '**292 个测试文件**', '**293 个测试文件**', 1),
    ('rd-rootjs', '**运行时模块**：91 个（根目录 `.js`，含入口 `index.js`；与 `extra_js` **90 项**是两个口径',
     '**运行时模块**：92 个（根目录 `.js`，含入口 `index.js`；与 `extra_js` **91 项**是两个口径', 1),
    ('rd-extrajs', '`extra_js`（90 项）', '`extra_js`（91 项）', 1),
    ('rd-manifest', 'extra_js 90 / extra_css 2', 'extra_js 91 / extra_css 2', 1),
    ('rd-load', '`index.js` + `extra_js` 90 项 + CSS 3 项', '`index.js` + `extra_js` 91 项 + CSS 3 项', 1),
    ('rd-ver', '**当前版本**：`3.311.0`', '**当前版本**：`3.312.0`', 1),
    ('rd-cur', '当前版本 v3.311.0 **全量待验**', '当前版本 v3.312.0 **全量待验**', 1),
    ('rd-probe', '磁盘 **65** 个，4 个 `_` 前缀探针不进门禁扫描面',
     '磁盘 **65** 个，5 个 `_` 前缀探针不进门禁扫描面', 1),
])

# -- 三、PLAN 现状基线表 + 文首现行口径 -------------------------------
edit('PLAN.md', [
    ('pl-cur', '（2026-10-11，v3.311.0）', '（2026-10-11，v3.312.0）', 1),
    ('pl-ver', '| 版本 | **v3.311.0**（四源同源；本表原为 v3.266.0） |',
     '| 版本 | **v3.312.0**（四源同源；本表原为 v3.266.0） |', 1),
    ('pl-gate', '在役面 **292 测试文件 / 60 个 audit 脚本**', '在役面 **293 测试文件 / 60 个 audit 脚本**', 1),
    ('pl-size', '`index.js` **15955 行**（物理行；探针读数 15955 行 / **586** 成员 —— 原 A1 六刀后为 13883 / 521）+ extra_js **90** 项',
     '`index.js` **16706 行**（物理行；探针读数 16706 行 / **610** 成员 —— 原 A1 六刀后为 13883 / 521）+ extra_js **91** 项', 1),
    ('pl-snap', '当前 v3.311.0 **全量待验**', '当前 v3.312.0 **全量待验**', 1),
    ('pl-dir', '**当前 v3.310.0 全量待验**', '**当前 v3.312.0 全量待验**', 1),
])

# -- 四、v3209 数量锁：90 -> 91（★ 原文用「⇒」不是「=>」）--------------
edit('tests/v3209_migration_registry.test.mjs', [
    ('lockv1', 'A(mf.extra_js.length === 90,', 'A(mf.extra_js.length === 91,', 1),
    ('lockv2', 'A(files.length === 90,', 'A(files.length === 91,', 1),
    ('lock1', 'extra_js 须 90 项（v3.311.0 M-X2 新增 repair-settle.js ⇒ 90；',
     'extra_js 须 91 项（v3.312.0 M-X4 新增 fact-lifecycle.js，当版 91；v3.311.0 M-X2 新增 repair-settle.js，当版 90；', 1),
    ('lock2', 'extra_js 抽取器应得 90 项（v3.311.0 M-X2 repair-settle.js ⇒ 90；',
     'extra_js 抽取器应得 91 项（v3.312.0 M-X4 fact-lifecycle.js，当版 91；v3.311.0 M-X2 repair-settle.js，当版 90；', 1),
])

# -- 五、v3247 REGISTRY ------------------------------------------------
edit('tests/v3247_break_kit_consolidation.test.mjs', [
    ('reg', "    'v3311_repair_settle.test.mjs',\n];",
     "    'v3311_repair_settle.test.mjs',\n    'v3312_fact_lifecycle.test.mjs',\n];", 1),
])

# -- 六、open_face_registry producer_version（v3305 要求与当前版本同步）- - -
edit('tests/audit/open_face_registry.tsv', [
    ('face', 'memoryToolsEnvelope\tlonsha-memory-plugin\tv3.311.0\t',
     'memoryToolsEnvelope\tlonsha-memory-plugin\tv3.312.0\t', 1),
])

# -- 七、TODO：新「最近更新」行前插，旧当前行原地降为历史留痕 -----------
TODO_HEAD = ('> **最近更新：v3.312.0** —— **M-X4（第二期拓展计划）事实生命周期与「遗忘 / 撤回 / 保留」控制**：'
             '本仓此前能回答「这条事实是什么」，但**回答不了「它还算不算数、被我处置成了什么、处置后能不能反悔」** ——'
             '`memory-type` 只挡 `revoked`、`fact-state` 只给状态读数，**没有任何一处能回答「这一处置会动到哪些面、'
             '动了能不能回滚、回读出来算不算已生效」**。本刀交付 `fact-lifecycle.js`（纯函数、零依赖、双导出、'
             '702 行 / 32K 字符）+ 宿主五出口 + 自检面一行诊断：★ **五处置穷尽互斥**（keep / expire / revoke /'
             'author-only / no-generate）与**四动作不一一对应**（delete-source / revoke-derived /'
             'hide-from-generation / keep-audit）分开；★ 组合检查是本模块最核心的一格 —— `no-generate` /'
             '`author-only` 下出现 `delete-source` **先判并一律拒**且理由必须点名 `evidence-preserved`'
             '（删了原文就再查不出曾经记错过），`delete-source` 未配 `keep-audit` 拒并点名 `audit-required`，'
             '`allowed`（这一态允许什么）与 `actions`（这次要做什么）**分行**。★ 计划**纯函数零写**（出口不落笔），'
             '被挡分支显式写 `count:0`（**与环境弄混无处可辨**）；生成面两态 `targetState` 恒 `null` ——'
             '那一态**没有账本态**，不许凭空编一个。★ 回滚三档 `reversible / partial / irreversible`，'
             '`delete-source` 无快照 ⇒ `no-inverse` 不可逆；`revoke-derived` 的逆操作是 `replay-rebuild`'
             '**不是逐条反写**。★ 回读按面分开：账本面比现态与目标态，**账上无此条报 `not-on-ledger` 不当作已生效**；'
             '生成面 `checked:false` + 具名 reason，**不编 applied/pending**。★ 审计面受限正文一律站位串'
             '（且站位串**不随原文本长度变化**，否则长度本身就是读数）；撤回取证 `leaked` 必须为空'
             '**且证据必须仍在账上**，缺一条报 `some-evidence-gone`。成对套件 `tests/v3312_fact_lifecycle.test.mjs`'
             '（13 条，含六条真源码破坏负控制 + 正控制地基 + 反向对照 + 判据纯度）。'
             '★ 本刀自伤与修法留痕：判据首跑 7/13，六条失败**全有明确归因** —— '
             '① S1 红的不是内核而是**夹具**（未闭合条与已闭条同形，判据测的不是那一档）；'
             '② H1 判据自身口径过严（把「定义面」与「使用面」混成一类，改为定义面恰一次 / 使用面 ≥1 次）；'
             '③ E1/E2 是夹具拼装缺陷（改用 `buildCode()` 助手 + dump 复核）；'
             '④ E2 还有一条真因 —— `_moduleLib` **会回落 `require`**，夹具把全局设 `null` 制造不出「缺席」，'
             '须设 `{}`（在场但形状不对）；⑤ L1 暴露判据覆盖面不足（补「删原文不配保留审计」一格后当场翻红）。'
             '另修内核一处：`planFor` 被挡分支没有 `count`，与「圈定零条」同形。'
             '★ 抬版连带修一处历史档「把某版一次性事实当永久不变量」：`tests/v3311_repair_settle.test.mjs` 的'
             '「本模块须是 `extra_js` 末位」已按 v3305/v3310 同款范式改成「与追加时邻居都在场，位置不作判据」。')
edit('TODO.md', [
    ('td-line', '> **最近更新：v3.311.0** —— ', TODO_HEAD + chr(10) + '> **历史留痕：v3.311.0** —— ', 1),
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
            print('[bump3312] MISS %s / %s 期望 %d 次，实测 %d' % (rel, tag, want, n))
            bad += 1
        s = s.replace(old, new)
    STAGE.append((p, s))

# 派生面一：catalog_reference_consumers.tsv 必须缺且只缺本档一行
tsvp = os.path.join(ROOT, 'tests/audit/catalog_reference_consumers.tsv')
tsv = io.open(tsvp, encoding='utf-8').read()
if 'v3312_fact_lifecycle.test.mjs' in tsv:
    print('[bump3312] MISS tsv 已含 v3312 行（重复追加会破坏双向差集）')
    bad += 1

# 派生面二：manifest 改后必须是 91 项且末位是本模块
mf_txt = dict((os.path.basename(p), s) for p, s in STAGE)['manifest.json']
try:
    mf = json.loads(mf_txt)
except Exception as e:
    print('[bump3312] MISS manifest.json 改后不是合法 JSON：%s' % e)
    bad += 1
    mf = None
if mf is not None:
    if len(mf['extra_js']) != 91:
        print('[bump3312] MISS manifest.extra_js 改后应 91 项，实 %d' % len(mf['extra_js']))
        bad += 1
    if mf['extra_js'][-1] != 'fact-lifecycle.js':
        print('[bump3312] MISS manifest.extra_js 末位应 fact-lifecycle.js，实 %s' % mf['extra_js'][-1])
        bad += 1

if bad:
    raise SystemExit('[bump3312] 有 %d 处未通过校验，未写盘' % bad)

# tsv 追加行（需读磁盘列表，故单独处理）
newrow = ('v3312_fact_lifecycle.test.mjs\t\tM-X4（事实生命周期与「遗忘 / 撤回 / 保留」控制面）的成对套件'
          '（13 条 test：含 L1 六条真源码破坏）：M1 登记面（extra_js 恰一次 + 与追加时邻居都在场）'
          '· M2 导出面（15 函数 / 五处置 / 四动作 / 三面词表 / 双导出 / 冻结）· X1 处置 × 动作组合'
          '（★ 禁止生成与仅作者可见两态下删原文须点名 `evidence-preserved`，**不得**塌成普通越界；'
          'allowed 与 actions 分行）· S1 批量圈定（空条件 = 不限 / 未闭合区间 `to=null` 不得当 0 /'
          '未命中须具名 why）· P1 计划（被挡即出不了计划且 count 为 0 不与环境弄混 / 禁入生成两态'
          'targetState=null）· U1 审计（受限正文一律站位串，且**逐字反查**原文本不在输出里、站位串不随'
          '原文本长变化）· B1 回滚三档（删原文无快照 = irreversible 并点名 no-inverse）· R1 回读'
          '（生成面不编 applied/pending；账上无此条报 not-on-ledger，不算已生效）· W1 抑制取证'
          '（撤回后 leaked 必须为空且证据仍在）· H1 宿主接线逐符号在场（★ 定义面恰一次 / 使用面 ≥1次）'
          '· E1/E2 端到端（计划与依赖缺格降级）· L1 六条真源码破坏 + 正控制地基 + 反向对照。')
lines = tsv.split('\n')
if lines and lines[-1] == '':
    lines.insert(len(lines) - 1, newrow)
else:
    lines.append(newrow)

if not DRY:
    for p, s in STAGE:
        io.open(p, 'w', encoding='utf-8').write(s)
        print('[bump3312] wrote', os.path.relpath(p, ROOT))
    io.open(tsvp, 'w', encoding='utf-8').write('\n'.join(lines))
    print('[bump3312] wrote tests/audit/catalog_reference_consumers.tsv (+1 行)')
print('[bump3312] 完成' + ('（dry）' if DRY else ''))
