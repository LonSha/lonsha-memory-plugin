#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.335.0 文档真实性同步：PLAN.md / README.md / TODO.md / CHANGELOG.md 对齐磁盘真值。

真值（脚本内自读，不手抄）：
  - 版本 3.335.0（index.js const VERSION）
  - 测试文件 315 / 审计门禁 61（磁盘 67）
  - index.js 探针读数（tools/_rebuild_host_beast.py 重算后由 baseline 读回）

★ 本版**不重绑全量读数**（doc_readings.json 仍停在 v3.328.0）：
  第四期计划收口前禁跑全量（用户铁律），故 README/PLAN 一律写「当前版本 v3.335.0 全量待验」。
"""
import io
import json
import os
import re
import sys

ROOT = '/home/user/lonsha-memory-plugin'
PLAN = os.path.join(ROOT, 'PLAN.md')
README = os.path.join(ROOT, 'README.md')
TODO = os.path.join(ROOT, 'TODO.md')
CL = os.path.join(ROOT, 'CHANGELOG.md')


def disk_truth():
    idx = io.open(os.path.join(ROOT, 'index.js'), encoding='utf-8').read()
    m = re.search(r"const VERSION = '([0-9.]+)'", idx)
    assert m, 'index.js 读不到 const VERSION'
    ver = m.group(1)
    tests = [f for f in os.listdir(os.path.join(ROOT, 'tests')) if f.endswith('.test.mjs')]
    audit_all = [f for f in os.listdir(os.path.join(ROOT, 'tests', 'audit')) if f.endswith('.mjs')]
    audit_gated = [f for f in audit_all if not f.startswith('_')]
    base = json.load(io.open(os.path.join(ROOT, 'tests', 'audit', 'host_beast_baseline.json'), encoding='utf-8'))
    lines_probe = idx.count('\n') + (0 if idx.endswith('\n') else 1)
    return {
        'ver': ver,
        'tests': len(tests),
        'audit_gated': len(audit_gated),
        'audit_all': len(audit_all),
        'host_lines': base['readings']['total_lines'],
        'host_members': base['readings']['member_count'],
        'ceiling': base['line_budget']['ceiling'],
        'wc_l': base['readings']['total_lines'] - 1,   # 探针读数 = wc -l + 1（同 v3.332 口径）
        'probe_lines_recomputed': lines_probe,
    }


T = disk_truth()
assert T['ver'] == '3.335.0', '版本未抬到 3.335.0: %s' % T['ver']
print('磁盘真值: ver=%(ver)s tests=%(tests)d audit=%(audit_gated)d/%(audit_all)d host=%(host_lines)d/%(host_members)d' % T)

# ---------------------------------------------------------------- PLAN.md
plan = io.open(PLAN, encoding='utf-8').read()
OLD_STATUS_HEAD = '> **当前执行状态（2026-10-16，v3.334.0）**'
_i = plan.index(OLD_STATUS_HEAD)
_j = plan.index('\n', _i)
old_status = plan[_i:_j]
new_status = ('> **当前执行状态（2026-10-16，v3.335.0）**：规划基线 `main@0f2f7fd`。本版是第四期 **M4-O6**'
              '（年鉴、正史与旧事重现接入真实数据；P0 / L）实施点:四个装配点此前**只读**七个私有槽而全仓**零写入点**,'
              '真实会话里年鉴/正史/旧事/资料四面长期停在「依赖未给 ⇒ 未判」;本版加一层**真实供数派生层**'
              '(`_o6RealOwners` 唯一取数口 + 九件真源:SummarySystem 卷章与史记/WorldProgress 承诺与知识轨迹/'
              'PlotTimeline 真楼层与剧情日期/SceneBook 到访史/SuspenseBook/事实账/悬项簿/实体名册),'
              '四个装配点改走派生且**私有槽仍优先**;缺数据一律 null(未判)、真源在场而空才给空表/`{}`(查过没有),'
              '不新增账本、不缓存、对 owner 零写。★ **连带修一处真缺陷**:`branch-canon.js` 的 `CLASH` 表'
              '**漏了 `DIVERGENT`**(三处引用:分档/`blocked += 1`/planCanon 的 isClash 与 whyKind)⇒'
              '「同一位两条取值不同」落进 undefined,冲突闸静默失效、下游把未选的冲突结局当「没有冲突」交接;'
              '老判据只喂 `terminal:true` 夹具故从未现形,**只有真实供数才照出来**。'
              '专项套件 v3350 17 条,宿主基线 %(host_lines)d/%(host_members)d(ceiling %(ceiling)d)。'
              '上一项 M4-O5(v3.334.0,长资料完整读取)专项 17 条。'
              '本版 v3.335.0 未全量实跑,当前 v3.335.0 **全量待验**。') % T
plan = plan[:_i] + new_status + plan[_j:]

def sub1(text, old, new, label):
    n = text.count(old)
    assert n == 1, '%s 锚点命中 %d 次(应为 1): %r' % (label, n, old[:70])
    return text.replace(old, new, 1)

plan = sub1(plan, '| 版本 | **v3.334.0**（四源同源；本表原为 v3.266.0） |',
            '| 版本 | **v3.335.0**（四源同源；本表原为 v3.266.0） |', 'PLAN D5 版本行')
plan = sub1(plan, '| 门禁 | 在役面 **314 测试文件 / 61 个 audit 脚本**（磁盘 67）',
            '| 门禁 | 在役面 **%d 测试文件 / %d 个 audit 脚本**（磁盘 %d）' % (T['tests'], T['audit_gated'], T['audit_all']),
            'PLAN D5 门禁行')
plan = sub1(plan, '| 体量 | `index.js` **19443 行**(探针读数;`wc -l` 19442) / **731** 成员',
            '| 体量 | `index.js` **%(host_lines)d 行**(探针读数;`wc -l` %(wc_l)d) / **%(host_members)d** 成员' % T,
            'PLAN D5 体量行·当版读数')
plan = sub1(plan, 'v3.334.0 M4-O5 窗口解析出口后为 19443 / 731;+ extra_js **106** 项',
            ('v3.334.0 M4-O5 窗口解析出口后为 19443 / 731,'
             'v3.335.0 M4-O6 真实供数派生层后为 %(host_lines)d / %(host_members)d;+ extra_js **106** 项') % T,
            'PLAN D5 体量行·历史链')
io.open(PLAN, 'w', encoding='utf-8').write(plan)
print('PLAN.md 已写 5 处')

# ---------------------------------------------------------------- README.md
rd = io.open(README, encoding='utf-8').read()
rd = sub1(rd, '**当前版本**：`3.334.0`', '**当前版本**：`%s`' % T['ver'], 'README D1 当前版本')
rd = sub1(rd, '`npm test` 当前发现 **314 个测试文件**；`npm test -- --audit` 当前发现 **61/61** 审计脚本',
          '`npm test` 当前发现 **%d 个测试文件**；`npm test -- --audit` 当前发现 **%d/%d** 审计脚本'
          % (T['tests'], T['audit_gated'], T['audit_gated']), 'README D2 在役面读数行')
rd = sub1(rd, 'npm test             # 全部用例：314 个测试文件（在役面，磁盘枚举）',
          'npm test             # 全部用例：%d 个测试文件（在役面，磁盘枚举）' % T['tests'], 'README 用法行')
rd = sub1(rd, '├── tests/                # 在役面：314 个测试文件 + 61 个审计脚本',
          '├── tests/                # 在役面：%d 个测试文件 + %d 个审计脚本' % (T['tests'], T['audit_gated']),
          'README 目录树行')
rd = sub1(rd, '**在役面**（磁盘枚举，不代表已实跑）：`tests/` 314 个测试文件',
          '**在役面**（磁盘枚举，不代表已实跑）：`tests/` %d 个测试文件' % T['tests'], 'README 在役面段')
rd = sub1(rd, '当前版本 v3.334.0 **全量待验**(未实跑;最近一次全量快照仍是 v3.328.0,见上段)。',
          '当前版本 v%s **全量待验**(未实跑;最近一次全量快照仍是 v3.328.0,见上段)。' % T['ver'],
          'README D6 待验标记')
io.open(README, 'w', encoding='utf-8').write(rd)
print('README.md 已写 6 处')

# ---------------------------------------------------------------- TODO.md
td = io.open(TODO, encoding='utf-8').read()
anchor = '> **最近更新：v3.334.0'
assert td.count(anchor) == 1, 'TODO v3.334 最近更新锚点命中 %d 次' % td.count(anchor)
new_entry = ('> **最近更新：v3.335.0 —— 第四期第六项 M4-O6:年鉴、正史与旧事重现接入真实数据(P0 / L)**'
             '(第四期产品主线包A第四项)。★ **修的是什么(修前实测,读码可复算)**:'
             '`_storyAnnualChapters/_storyAnnualSummary/_storyAnnualQuotes/_branchOutcomes/_pastDetails/'
             '_knownFacts/_loreConfirmedFacts` 七个私有槽在全仓**只见读取、零写入点** ⇒ '
             '正常玩过的会话里年鉴/正史/旧事/资料四面长期停在「依赖未给 ⇒ 未判」,'
             '模块自检能出内容只是因为夹具手工塞了槽 —— **模块自检可用夹具不证明正常会话能产出内容**。'
             '★ **本刀(真实供数派生层,不新增账本/不缓存/对 owner 零写)**:'
             '① `_o6RealOwners()` 唯一取数口 + 九件真源(SummarySystem 卷章与史记 / WorldProgress 承诺与知识轨迹 / '
             'PlotTimeline 真楼层与剧情日期 / SceneBook 到访史 / SuspenseBook / 事实账 / 悬项簿 / 实体名册);'
             '② 六面派生:`_o6Chapters`(真卷记录 ⇒ 章节 + 章内事件/人物变化/未了事项/原话,原话取自**真聊天该楼**引号句) / '
             '`_o6Summary`(真读数快照) / `_o6Outcomes`(真分支对照 changed 差异 + 真终局项 terminal:true) / '
             '`_o6PastDetails`(时间线 person:/anniversary: + 场所 place:) / `_o6KnownFacts`(角色 × 真实体/事实/对手方) / '
             '`_o6ConfirmedFacts`(仅 origin:confirmed 与用户锁定);③ 四个装配点改走派生、**私有槽仍优先**(逐件判定);'
             '④ **两态不许同形**:真源缺席 ⇒ null(未判),真源在场而空 ⇒ 空表/`{}`(查过没有)。'
             '★ **连带修一处真缺陷(本刀照出来的)**:`branch-canon.js` 的 `CLASH` 表**漏了 `DIVERGENT`**,'
             '而它被三处引用(分档 / `blocked += 1` 闸 / planCanon 的 isClash 与 whyKind)⇒ '
             '「同一位上两条取值不同」这条真实冲突落进 `undefined`,三处闸静默失效、'
             '下游把「未选的冲突结局」当「没有冲突」继续交接;老判据只喂 `terminal:true` 夹具(走 BOTH_TERMINAL),'
             '**只有真实供数才照出来** —— 这正是 M4-O6 验收原文「纯函数与诊断行全绿不足以收口」的现场。'
             '★ **定向验收(全部真跑)**:`tests/v3350_m4o6_real_supply.test.mjs`(**17 条**):'
             'A 结构面(十一成员各恰一处 + 四装配点真改走派生 + 九键逐字对账)/'
             'B 真源派生真跑(六面真内容 + 原话三态)/C 缺席⇒null vs 在场而空⇒空表·{}(七面对照)/'
             'D 四面接通真内核(年鉴建册 2 章 2 事件证据可回源、正史 divergent 冲突现形 + blocked、'
             '旧事出建议带来源且不知情者挡下、资料面实体与已确认事实来自真源)/'
             'E 零写·零缓存·现算(owner 快照逐字节不变、源变更章面 2→3、两实例同读数)/'
             'F 三条真源码破坏负控制(各带原版阳性对照)+ 工具两向自证 + 判据纯度 + 版本锚。'
             '连带复验 `tests/v3328_f_pack_canon_fated.test.mjs` 23/23 仍绿(补表未改既有判定)。'
             '宿主基线重建至 %(host_lines)d 行/%(host_members)d 成员(ceiling %(ceiling)d,成员在线内不抬)。'
             '★ **诚实边界**:真实 SillyTavern 宿主的 UI 操作与真实模型问答**未跑**(原话面以同形状假 chat 验取数口径);'
             '本版**全量待验**。\n') % T
td = td.replace(anchor, new_entry + anchor, 1)
io.open(TODO, 'w', encoding='utf-8').write(td)
print('TODO.md 已写 1 处')

# ---------------------------------------------------------------- CHANGELOG.md
cl = io.open(CL, encoding='utf-8').read()
assert cl.startswith('## v3.334.0'), 'CHANGELOG 顶节不是 v3.334.0'
head = ('## v3.335.0\n'
        '**第四期第六项 M4-O6:年鉴、正史与旧事重现接入真实数据(P0 / L)**(第四期产品主线包A第四项)。'
        '★ **修的是什么(修前实测,读码可复算)**:`_storyAnnualChapters` / `_storyAnnualSummary` / '
        '`_storyAnnualQuotes` / `_branchOutcomes` / `_pastDetails` / `_knownFacts` / `_loreConfirmedFacts` '
        '七个私有槽在全部生产 `.js` 里**只命中四个装配点自身** —— 零写入点。'
        '于是年鉴 / 正史 / 旧事 / 资料四面在真实会话里长期停在「依赖未给 ⇒ 未判」,'
        '只有夹具自检能看见内容;**模块自检可用夹具不证明正常会话能产出内容**。\n'
        '★ **本刀(真实供数派生层:不新增账本、不引第二份事实库、不缓存、对 owner 零写)**:'
        '① `_o6RealOwners()` 四面共用的唯一取数口,装配九件真源(SummarySystem 卷章与史记 / '
        'WorldProgress 承诺与知识轨迹 / PlotTimeline 真楼层与剧情日期 / SceneBook 到访史 / SuspenseBook / '
        '事实账 / 悬项簿 / 实体名册);'
        '② 六面派生 —— `_o6Chapters`(真卷记录 ⇒ 章节,章内事件/人物变化/未了事项/原话;原话只取**真聊天该楼**的引号原句) / '
        '`_o6Summary`(真读数快照) / `_o6Outcomes`(真分支对照的 `changed` 差异 + 真终局项 `terminal:true`;'
        '对照侧一律 `terminal:null` —— 「不知道是不是结局」不得读成 false) / '
        '`_o6PastDetails`(时间线 `person:` 与 `anniversary:` + 场所 `place:`) / '
        '`_o6KnownFacts`(角色 × 真实体名/事实账/知识轨迹/对手方) / '
        '`_o6ConfirmedFacts`(只收 `origin:confirmed` 与用户锁定事实);'
        '③ 四个装配点改走派生、**私有槽仍优先**(逐件判定,不是整组让位);'
        '④ **两态不许同形**:真源缺席 ⇒ `null`(未判),真源在场而空 ⇒ 空表 / `{}`(查过、没有);'
        '⑤ 出口 `annualSources()` 只报派生读数(不是账本、不落盘)。\n'
        '★ **连带修一处真缺陷(本刀照出来的)**:`branch-canon.js` 的 `CLASH` 表**漏了 `DIVERGENT`**,'
        '而它被三处引用(`conflicts` 的分档 / `blocked += 1` 的闸 / `planCanon` 的 `isClash` 与 `whyKind`)⇒ '
        '「同一位上两条取值不同」这条真实冲突落进 `undefined`,三处闸全部静默失效'
        '(`blocked` 不增、`isClash` 恒 false),下游把「未选的冲突结局」当「没有冲突」继续交接。'
        '为什么直到本项才现形:老判据只喂 `terminal:true` 的夹具(走 `BOTH_TERMINAL` 那支),'
        '**只有真实供数**才会产出 terminal:null 的分支对照差异 —— 这正是 M4-O6 验收原文'
        '「纯函数与诊断行全绿不足以收口」的现场。修法=补表(`DIVERGENT: \'divergent\'`),'
        '并连带复验 v3328 套件 23/23 仍绿(补表不改既有判定)。\n'
        '★ **定向验收(全部真跑)**:`tests/v3350_m4o6_real_supply.test.mjs`(**17 条**,'
        '真装载 memory-core/memory-organs/memory-books/scene-book 与四个内核 + 从 `index.js` 真切片宿主侧):'
        'A 结构面(十一成员各恰一处 / 四装配点真改走派生 / 九键逐字对齐四个内核 `REQUIRED_DEPS`);'
        'B 真源派生真跑(六面取到真内容:章 2 / 结局 1 / 旧事 3 / 知情 2 / 已确认 2;原话三态不同形);'
        'C 缺席⇒`null` vs 在场而空⇒空表·`{}`(七面逐面对照);'
        'D 四面接通真内核(年鉴建册 2 章 2 事件、证据位可回源 / 正史 divergent 现形且 `blocked>=1`、'
        'planCanon 未选前 `blocked` / 旧事出建议带来源且不知情者具名挡下 / 资料面实体与已确认事实来自真源、'
        '受限正文键仍取自内核);E 零写·零缓存·现算(owner 快照逐字节不变 / 源变更章面 2→3 / 两实例同状态同读数 / '
        '私有槽逐件优先);F 三条真源码破坏负控制(各带原版阳性对照)+ 工具两向自证 + H5 判据纯度 + 版本锚。'
        '判据翻修留痕(第一版判据错,不是实现错):D2 首版拿 `terminal:true` 的终局去测 divergent 档(两件事)、'
        'F4 首版用「在 index.js 里恰好一次」的锚点测「多处命中须拒绝」(恒不成立,已改真多处锚点)、'
        'F4 判据纯度首版写「须声明两次」与实现相悖(实为一次,破坏调用走常量名)。'
        '· 退出码三档:0 卫生 / 1 真缺陷 / 2 结构漂移(本仓扫描器契约;本节同款声明供 D9 核对)。'
        '★ **诚实边界**:真实 SillyTavern 宿主的 UI 操作与真实模型问答**未跑**'
        '(原话面以同形状假 chat 验证取数口径);全量 `npm test` 按纪律集中到第四期计划收口点跑一次'
        '(本版为定向复验),本版**全量待验**。\n')
cl = head + cl
io.open(CL, 'w', encoding='utf-8').write(cl)
print('CHANGELOG.md 已写 1 处（新顶节）')

print('DONE v3.335.0 文档同步（**未重绑全量读数**：doc_readings.json 仍停 v3.328.0）')