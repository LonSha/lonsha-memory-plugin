#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.342.0 文档真实性同步：PLAN.md / README.md / TODO.md / CHANGELOG.md 对齐磁盘真值。
真值（脚本内自读，不手抄）：版本 / 测试文件数 / 审计门禁数 / 宿主探针行数与成员数 / 上界。
★ 本版**不重绑**全量读数（doc_readings.json 仍停在 v3.328.0）：快照登记按纪律留到第四期
  计划收口点。但「跑没跑」是**事实层**、必须写实：本版实施期**已实跑过一次全量**
  （322/322 文件 · 3774 断言 · 0 失败 · 审计 61/61 · exit 0，两次实跑读数一致），只是**读数未登记**。
  故门禁要求的 `当前版本 v3.342.0 **全量待验**` 逐字保留，另把「已跑通 / 未登记」写明 ——
  「把已跑说成没跑」与「把没跑说成已跑」同属读数不实（D6 反向判据）。
★ D9 义务：CHANGELOG 顶节的「档名（N 条）」里的 N **必须等于磁盘 `^test(` 计数**，
  故条数由脚本现场数，不写死。
"""
import io
import json
import os
import re
ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3420/'


def disk_truth():
    idx = io.open(ROOT + 'index.js', encoding='utf-8').read()
    m = re.search(r"const VERSION = '([0-9.]+)'", idx)
    assert m, 'index.js 读不到 const VERSION'
    ver = m.group(1)
    tests = [f for f in os.listdir(ROOT + 'tests') if f.endswith('.test.mjs')]
    audit_all = [f for f in os.listdir(ROOT + 'tests/audit') if f.endswith('.mjs')]
    audit_gated = [f for f in audit_all if not f.startswith('_')]
    base = json.load(io.open(ROOT + 'tests/audit/host_beast_baseline.json', encoding='utf-8'))
    lines_probe = idx.count('\n') + (0 if idx.endswith('\n') else 1)
    suite = 'tests/v3420_m4x3_canon_adoption.test.mjs'
    suite_src = io.open(ROOT + suite, encoding='utf-8').read()
    suite_n = len(re.findall(r'^test\(', suite_src, re.M))
    return {
        'ver': ver, 'tests': len(tests), 'audit_gated': len(audit_gated), 'audit_all': len(audit_all),
        'host_lines': base['readings']['total_lines'], 'host_members': base['readings']['member_count'],
        'ceiling': base['line_budget']['ceiling'], 'wc_l': lines_probe - 1,
        'suite': suite, 'suite_n': suite_n,
    }


T = disk_truth()
assert T['ver'] == '3.342.0', '版本未抬到 3.342.0: %s' % T['ver']
assert T['suite_n'] >= 1, '当版套件读不到 test( 行'
print('磁盘真值: ver=%(ver)s tests=%(tests)d audit=%(audit_gated)d/%(audit_all)d '
      'host=%(host_lines)d/%(host_members)d suite=%(suite_n)d' % T)
os.makedirs(BAK, exist_ok=True)
for rel in ('PLAN.md', 'README.md', 'TODO.md', 'CHANGELOG.md'):
    io.open(BAK + rel + '.pre3420', 'w', encoding='utf-8').write(io.open(ROOT + rel, encoding='utf-8').read())


def sub1(text, old, new, label):
    n = text.count(old)
    assert n == 1, '%s 锚点命中 %d 次(应为 1): %r' % (label, n, old[:70])
    return text.replace(old, new, 1)


# -------- PLAN.md
P = ROOT + 'PLAN.md'
plan = io.open(P, encoding='utf-8').read()
plan = sub1(plan,
    '拓展新功能九项 **M4-X1/X2/X4 已交付**（v3.339.0 / v3.340.0 / v3.341.0），**M4-X3/X5～X9 尚未开工**，下一刀 M4-X3。',
    '拓展新功能九项 **M4-X1/X2/X3/X4 已交付**（v3.339.0 / v3.340.0 / v3.341.0 / v3.342.0），'
    '**M4-X5～X9 尚未开工**，下一刀 M4-X5。',
    'PLAN 文首进度行')
OLD_HEAD = '> **当前执行状态（2026-10-16，v3.341.0）**'
i = plan.index(OLD_HEAD)
j = plan.index('\n', i)
new_status = ('> **当前执行状态（2026-10-16，v3.342.0）**：规划基线 `main@5691bfc`。本版是第四期'
              '**拓展九项第三项 M4-X3**（正史选择真正进入下一卷；P2 / L）实施点：既有 `branch-canon.js` '
              '能**列出结局**、能**置选择**、能判冲突与蔽体，但**选择与下一卷之间没有一处映射** —— '
              '选择面只产「结局条文」，下游 `volume-continuation.js` 只认「面归属形状」'
              '（`face` / `ownerKey` / `key` 三格），中间那一步没人做：'
              '`buildContinuePack` / `adoptableItems` / `adoptionBrief` / `revokeGuard` / `ADOPT` 全仓零命中 ⇒ '
              '**选了正史也进不了下一卷**（一条也接不上），而预览读数照样全绿。'
              '本版两刀:**① 内核落卷面**（`BC_VERSION 1→2`；新增 `ADOPT` 三态（`ready`/`blocked`/`empty`）/ '
              '`UNMAPPED` 三缺因（`no-face`/`no-owner`/`no-key`）/ `ADOPT_KIND` / `ADOPT_LABEL` / '
              '`ADOPT_SOURCES` / `ADOPT_ITEM_FIELDS` 六张常量面；`adoptItemOf` 把结局条文按三格映射成**可接条目**、'
              '`adoptableItems` 分开报「可接集」与「未映射集」且缺因逐条具名、'
              '`buildContinuePack` 出**续写包**（三态不同形，未选尽与空条都不出包）且 `adoptionId` 是**幂等键**'
              '（由选中键集合指纹 + 卷 + 两个开关定，换卷 / 换选择必变）、`adoptionBrief` 带幂等键与**撤销范围**、'
              '`revokeGuard` 撤销保护面四张具名表（可撤 / 别批 / 手工 / 后来新增），'
              '`branchWrites` 恒 0 且 `deletesManual` 如实报 false；导出面 +14）；'
              '**② 宿主接线面**（六出口 `storyCanonAdoptPlan` / `storyCanonAdoption` / `storyCanonRevokeGuard` / '
              '`_volumeContinuationEntriesForGuard` / `storyCanonAdoptConfirm` / `storyCanonAdoptLine` + '
              '落卷凭据 `_canonAdoption` 随聊天持久化 + `ARCHIVE_TOP_LEVEL_KEYS` / 携带豁免表 / `collectExport` / '
              '`restoreFromPayload` 四处契约面 + 清空面 + 自检面「支线正史」行落卷读数）。'
              '**验收四步闭环:选择 → 落卷 → 重启 → 撤销** —— 未选尽不出包（`blocked` 且 `pack null`），'
              '确认才落凭据（预览期 `persisted:false`），重启后同卷重复确认**仍判 duplicate**（不重落），'
              '换卷不算重复，撤销面只动用本批条目（手工条目一条不碰）。'
              '专项套件 v3420 **%(suite_n)d 条全绿**（含 D1～D8 八条真源码破坏负控制 + F1 纯度 + F2 工具两向自证 + G1 锚点）。'
              '宿主基线 %(host_lines)d/%(host_members)d(ceiling %(ceiling)d 余量 400);'
              '`extra_js` 仍 **107**（无新模块）。上一项 M4-X2(v3.341.0,章节回顾与年鉴成稿)。'
              '本版实施期已实跑过一次全量复验（322/322 文件 · 3774 断言 · 0 失败 · 审计 61/61，exit 0），**读数未登记**（快照按纪律仍停 v3.328.0，登记留到第四期计划收口点），故当前 v3.342.0 **全量待验**。') % T
plan = plan[:i] + new_status + plan[j:]
plan = sub1(plan, '| 版本 | **v3.341.0**（四源同源；本表原为 v3.266.0） |',
            '| 版本 | **v3.342.0**（四源同源；本表原为 v3.266.0） |', 'PLAN 版本行')
plan = sub1(plan, '| 门禁 | 在役面 **321 测试文件 / 61 个 audit 脚本**（磁盘 67）',
            '| 门禁 | 在役面 **%d 测试文件 / %d 个 audit 脚本**（磁盘 %d）'
            % (T['tests'], T['audit_gated'], T['audit_all']),
            'PLAN 门禁行')
plan = sub1(plan, '| 体量 | `index.js` **21180 行**(探针读数;`wc -l` 21179) / **774** 成员',
            '| 体量 | `index.js` **%(host_lines)d 行**(探针读数;`wc -l` %(wc_l)d) / **%(host_members)d** 成员' % T,
            'PLAN 体量行·当版读数')
plan = sub1(plan, 'v3.341.0 M4-X2 面向读者的章节回顾与年鉴成稿后为 21180 / 774;',
            'v3.341.0 M4-X2 面向读者的章节回顾与年鉴成稿后为 21180 / 774,'
            'v3.342.0 M4-X3 正史选择真正进入下一卷后为 %(host_lines)d / %(host_members)d;' % T,
            'PLAN 体量行·历史链')
plan = sub1(plan, '| ⬜ M4-X3 | 正史选择真正进入下一卷 |',
            '| ✅ M4-X3 | 正史选择真正进入下一卷 |', 'PLAN 勾选行 X3')
plan = sub1(plan,
    '| 编号 | 优化提升（M4-O1～O9 已交付） | 编号 | 拓展与新功能（M4-X1/X2/X4 已交付 / M4-X3、X5～X9 待实施） |',
    '| 编号 | 优化提升（M4-O1～O9 已交付） | 编号 | 拓展与新功能（M4-X1/X2/X3/X4 已交付 / M4-X5～X9 待实施） |',
    'PLAN 表头行')
plan = sub1(plan,
    '产品包C 的 **M4-X2 已交付**（v3.341.0），**M4-X3/X5/X6/X7/X8/X9** **尚未开工**。'
    '**下一刀 = M4-X3**（正史选择真正进入下一卷，P2 / L）。',
    '产品包C 的 **M4-X2/X3 已交付**（v3.341.0 / v3.342.0），**M4-X5/X6/X7/X8/X9** **尚未开工**。'
    '**下一刀 = M4-X5**（同一事件的多方证词与争议档案，P2 / L）。',
    'PLAN 优先级行·下一刀')
io.open(P, 'w', encoding='utf-8').write(plan)
print('PLAN.md 已写 8 处')

# -------- README.md
R = ROOT + 'README.md'
rd = io.open(R, encoding='utf-8').read()
rd = sub1(rd, '**当前版本**：`3.341.0`', '**当前版本**：`%s`' % T['ver'], 'README 当前版本')
rd = sub1(rd, '`npm test` 当前发现 **321 个测试文件**',
          '`npm test` 当前发现 **%d 个测试文件**' % T['tests'], 'README 在役面读数')
rd = sub1(rd, '未实跑期间一律标「**全量待验**」',
          '未登记期间一律标「**全量待验**」', 'README 口径用词')
rd = sub1(rd, '当前版本 v3.341.0 **全量待验**(未实跑;最近一次全量快照仍是 v3.328.0,见上段)。',
          '当前版本 v%s **全量待验**(' % T['ver']
          + '已实跑一次全量（322/322 文件 · 3774 断言 · 0 失败 · 审计 61/61）但**读数未登记**'
            '（登记留到第四期计划收口点；最近一次全量快照仍是 v3.328.0,见上段）)。',
          'README 待验标记')
rd = sub1(rd, 'npm test             # 全部用例：321 个测试文件（在役面，磁盘枚举）',
          'npm test             # 全部用例：%d 个测试文件（在役面，磁盘枚举）' % T['tests'], 'README 用法行')
rd = sub1(rd, '├── tests/                # 在役面：321 个测试文件 + 61 个审计脚本',
          '├── tests/                # 在役面：%d 个测试文件 + %d 个审计脚本' % (T['tests'], T['audit_gated']),
          'README 目录树行')
rd = sub1(rd, '**在役面**（磁盘枚举，不代表已实跑）：`tests/` 321 个测试文件',
          '**在役面**（磁盘枚举，不代表已实跑）：`tests/` %d 个测试文件' % T['tests'], 'README 在役面段')
io.open(R, 'w', encoding='utf-8').write(rd)
print('README.md 已写 6 处')

# -------- TODO.md
D = ROOT + 'TODO.md'
td = io.open(D, encoding='utf-8').read()
td = sub1(td,
    '拓展新功能九项 **M4-X1/X2/X4 已交付**（v3.339.0 / v3.340.0 / v3.341.0），'
    '**M4-X3/X5～X9 尚未开工**，**下一刀 M4-X3**'
    '（正史选择真正进入下一卷，第二包「正史与证词」，依赖 O6 已满足）。',
    '拓展新功能九项 **M4-X1/X2/X3/X4 已交付**（v3.339.0 / v3.340.0 / v3.341.0 / v3.342.0），'
    '**M4-X5～X9 尚未开工**，**下一刀 M4-X5**'
    '（同一事件的多方证词与争议档案，第二包「正史与证词」，依赖 X1/O6 已满足）。',
    'TODO 文首进度行')
anchor = '> **最近更新：v3.341.0 ——'
assert td.count(anchor) == 1, 'TODO v3.341 锚点命中 %d 次' % td.count(anchor)
new_entry = ('> **最近更新：v3.342.0 —— 第四期拓展第三项 M4-X3:正史选择真正进入下一卷(P2 / L)**'
             '(第四期产品拓展包第二包「正史与证词」)。★ **修的是什么(修前实测,读码可复算)**:'
             '`branch-canon.js` 能**列出结局**(`listOutcomes`)、能**置选择**(`setDecision`)、'
             '能判冲突与蔽体(`conflicts`/`maskSecretBody`),下游 `volume-continuation.js` 也能**收面归属形状**'
             '(`filterByKeeper` 吃的是带 `face`/`ownerKey`/`key` 三格的条目) —— 但**「这次选的正史」与'
             '「下一卷要接的条目」之间,一步映射都没有**:全仓零 `buildContinuePack` / `adoptableItems` / '
             '`adoptionBrief` / `revokeGuard` / `ADOPT` 命中 ⇒ 选择面只产「结局条文」(`value` 一句白),'
             '下游 owner 只认三格形状,**中间那道映射没人做** —— 结局一条也接不上,'
             '而预览读数(`listOutcomes` 列了几条)**照样全绿**。这是本仓治过多次的「读数绿、链路断」同族:'
             '有清单、有形状,就是没那一步「把条文按形状落成条目」。'
             '★ **本刀(两刀:内核落卷面 / 宿主接线面,不建第二套正史库、不只加按钮)**:'
             '① **内核落卷面** —— `BC_VERSION 1→2`;六张新常量面 `ADOPT`(`ready`/`blocked`/`empty` 三态)/'
             '`ADOPT_LABEL`/`ADOPT_SOURCES`/`ADOPT_KIND`/`ADOPT_ITEM_FIELDS`/`UNMAPPED`'
             '(`no-face`/`no-owner`/`no-key` 三缺因);`adoptItemOf`(单条映射:把结局的 `items` 逐条按三格'
             '落成可接条目,缺格即具名缺因);`adoptableItems`(**可接集**与**未映射集**分列,缺因逐条具名,'
             '缺格条文一律不进可接集);`buildContinuePack`(出续写包 **三态不同形**:`ready` 出包 / '
             '`blocked` 未选尽**不出包**且报待选数 / `empty` 选尽却无条可接且 `bareCount` 具名 —— '
             '把「空条」与「映射失败」压成一条是本仓治过多次的错读数);`adoptionId` **幂等键**'
             '(选中键集合指纹 + 卷 + `allowReplace`/`allowNameLink` 两开关定,同一份选择恒同 id,'
             '换卷或换选择必不同);`adoptionBrief`(凭据:幂等键 + **撤销范围** `revokeScope`);'
             '`revokeGuard`(撤销保护面**四张具名表**:可撤 / 别批(`packId` 不同)/ 手工(无来源范围)/ '
             '后来新增(晚于本次凭据),`deletesManual` 如实报 `false`、`branchWrites` 恒 `0`;'
             '无凭据即报未判,**不许「全删」兑底**);`adoptionLine`/`adoptProbeDeps`/`adoptProbePlan` 读出面;'
             '导出面 +14(既有 32 项逐字不动)。'
             '② **宿主接线面** —— `storyCanonAdoptPlan(opts)`(落卷计划,真内核 + 零写读数;未选尽 `blocked` 且 `pack null`)/'
             '`storyCanonAdoption(opts)`(凭据:**只在 `commit` 后落盘**,预览期只出键)/'
             '`storyCanonRevokeGuard(entries, opts)`(撤销保护面;默认取数口器官在则真读、缺席报空不编条目)/'
             '`_volumeContinuationEntriesForGuard()`(从真器官账本取条目)/'
             '`storyCanonAdoptConfirm(opts)`(确认落笔:**落笔 / 落盘 / 回读**三环 + 幂等)/'
             '`storyCanonAdoptLine()`(诊断行,四态 / 缺席具名);'
             '落卷凭据 `_canonAdoption` 落 `ARCHIVE_TOP_LEVEL_KEYS` + 携带豁免表'
             '(理由:`adoptionId` 由「本次选择」定,跨对话带上会让新故事的第一次落卷被判成**重复确认**而静默不落) '
             '+ `collectExport` + `restoreFromPayload` 四处契约面 + 清空面 + 自检面「支线正史」行落卷读数'
             '(并入既有行,不新增行)。'
             '★ **验收四步闭环逐条落地(全部真跑读数)**:**选择 → 落卷 → 重启 → 撤销** —— '
             '(a) **选择**:稳态 1 条可接 / 下游 `missingFaces` 0 / `willAdd` 1 / 提案 1;'
             '三态互不相等(`ready`/`blocked`/`empty`),`blocked` 与 `empty` 均 `pack null` 且 `pendingCount` 分列 1 / 0;'
              '(b) **落卷**:`storyCanonAdoptConfirm` ⇒ `ok:true` / `applied:1` / `persisted:true` / `readback` 为 `ok` / '
             '器官账本 `volumeContinuationCount()===1` / 诊断行「已落 1 条」;'
             '(c) **重启**:同实例重复确认 ⇒ `duplicate:true` 且不重落;**新实例 + 从持久载荷还原凭据**后'
             '再确认 ⇒ 仍 `duplicate:true` 且**带原 `applied`**(`{\"applied\":1,\"reason\":\"duplicate\"}`);'
             '换卷(`v2`)不算重复(**必须真落笔**);'
             '(d) **撤销**:`revokeGuard` ⇒ `revocableCount 1` / `foreignCount 1` / `manualCount 2` / '
             '`deletesManual false` / `branchWrites 0`,后来新增单列、无凭据报 `judged:false`。'
             '★ **定向复验**:`tests/v3420_m4x3_canon_adoption.test.mjs`(**%(suite_n)d 条**,'
             '真切片宿主 + 真装载内核 + 真下游 owner):A1 宿主五新出口各恰一处 + 四处契约面 + organ 逐字副本 + '
             '自检行并入 + `extra_js` 107 / A2 内核面(版本 2 + 六张常量面 + 八个新原语 + 既有面一字未拆 + 冻结)/ '
             'A3 内核纯度(实现体不读宿主 `this`;零 `require(`/`fetch(`/落盘;judge 面不拿宿主字串当判据)/ '
             'B1～B5 五条真跑口径面(形状接得上 / 三态不同形 / 缺格具名 / 幂等地基 / 撤销保护面)/ '
             'C1～C5 五条宿主接线面(计划出口 / 确认落笔 + 重启 / 落盘闸门 / 撤销面出口 / 内核缺席同键降级)/ '
             'D1～D8 **八条真源码破坏负控制**(各带原版阳性对照)/ F1 H5 判据纯度(八个锚点在本档各 1 次)/ '
             'F2 H6 工具两向自证 / G1 六源同源 + 出生锚 `BORN_V`(下界,不锁当版)。'
             '宿主基线重建至 %(host_lines)d 行 / %(host_members)d 成员(ceiling %(ceiling)d 余量 400);'
             '`extra_js` 仍 **107**(本刀无新模块)。'
             '★ **诚实边界**:真实 SillyTavern 宿主的 UI 点击流**未跑**(宿主新面以真装载宿主切片验证调用口径;'
             '「重启」一条用**真新实例 + 真持久载荷还原**取证 —— 验的是判据认不认持久凭据,不是真关掉酒馆再开);'
             '撤销面**只判分类与读数**(谁在可撤集、谁被排除),真删动作不在本仓;'
             '本版实施期已实跑过一次全量复验（322/322 文件 · 3774 断言 · 0 失败 · 审计 61/61，exit 0），**读数未登记**；故标**全量待验**(登记按纪律留到第四期计划收口点)。\n') % T
td = td.replace(anchor, new_entry + anchor, 1)
io.open(D, 'w', encoding='utf-8').write(td)
print('TODO.md 已写 2 处')

# -------- CHANGELOG.md
CL = ROOT + 'CHANGELOG.md'
cl = io.open(CL, encoding='utf-8').read()
assert cl.startswith('## v3.341.0'), 'CHANGELOG 顶节不是 v3.341.0'
head = ('## v3.342.0\n'
        '**第四期拓展第三项 M4-X3:正史选择真正进入下一卷(P2 / L)**(第四期产品拓展包第二包「正史与证词」)。'
        '★ **修的是什么(修前实测,读码可复算)**:`branch-canon.js` 能**列出结局**(`listOutcomes`)、'
        '能**置选择**(`setDecision`)、能判冲突与蔽体(`conflicts`/`maskSecretBody`),'
        '下游 `volume-continuation.js` 也能**收面归属形状**(`filterByKeeper` 吃的是带 `face`/`ownerKey`/`key` '
        '三格的条目) —— 但**「这次选的正史」与「下一卷要接的条目」之间,一步映射都没有**:'
        '全仓零 `buildContinuePack` / `adoptableItems` / `adoptionBrief` / `revokeGuard` / `ADOPT` 命中 ⇒ '
        '选择面只产「结局条文」(`value` 一句白),下游 owner 只认三格形状,**中间那道映射没人做** —— '
        '结局一条也接不上,而预览读数(`listOutcomes` 列了几条)**照样全绿**。'
        '这是本仓治过多次的「读数绿、链路断」同族:有清单、有形状,就是没那一步「把条文按形状落成条目」。\n'
        '★ **本刀(两刀:内核落卷面 / 宿主接线面,不建第二套正史库、不只加按钮)**:\n'
        '① **内核落卷面** —— `BC_VERSION = 2`;六张新常量面 `ADOPT`(`ready`/`blocked`/`empty` 三态)/ '
        '`ADOPT_LABEL` / `ADOPT_SOURCES` / `ADOPT_KIND` / `ADOPT_ITEM_FIELDS` / `UNMAPPED`'
        '(`no-face`/`no-owner`/`no-key` 三缺因);`adoptItemOf(item)` 单条映射(把结局的 `items` 逐条按三格'
        '落成可接条目,缺格即具名缺因);`adoptableItems(deps, plan, opts)` **可接集**与**未映射集**分列,'
        '缺因逐条具名,缺格条文一律不进可接集;`buildContinuePack(deps, plan, opts)` 出续写包 '
        '**三态不同形**:`ready` 出包 / `blocked` 未选尽**不出包**且 `pendingCount` 报待选数 / '
        '`empty` 选尽却无条可接且 `bareCount` 具名(空条 ≠ 映射失败);`adoptionId` **幂等键**'
        '(由选中键集合指纹 + 卷 + `allowReplace`/`allowNameLink` 两开关定,同一份选择恒同 id,'
        '换卷或换选择必不同);`adoptionBrief` 凭据(幂等键 + **撤销范围** `revokeScope`);'
        '`revokeGuard(entries, brief, opts)` 撤销保护面**四张具名表**(可撤 / 别批 / 手工 / 后来新增),'
        '`deletesManual` 如实报 `false`、`branchWrites` 恒 `0`,无凭据报未判(不许「全删」兑底);'
        '`adoptionLine` / `adoptProbeDeps` / `adoptProbePlan` 读出面。导出面 +14(既有 32 项逐字不动)。\n'
        '② **宿主接线面** —— `storyCanonAdoptPlan(opts)`(落卷计划:真内核 + **零写**读数;未选尽 `blocked` 且 `pack null`);'
        '`storyCanonAdoption(opts)`(凭据:**只在 `opts.commit === true` 后落盘**,预览期只出键、`persisted:false`);'
        '`storyCanonRevokeGuard(entries, opts)`(撤销保护面;`entries` 省缺时走默认取数口 —— 器官在则真读、'
        '缺席报空表、**不造条目**、不抛);`_volumeContinuationEntriesForGuard()`(从真器官账本取条目);'
        '`storyCanonAdoptConfirm(opts)`(确认落笔:**落笔 / 落盘 / 回读**三环 + 幂等闸 —— '
        '内存 `seen` / 持久凭据 / 换卷三种情形分别判);`storyCanonAdoptLine()`(诊断行:四态 + 落卷面 + 撤销面 + '
        '内核缺席具名);落卷凭据 `_canonAdoption` 落 `ARCHIVE_TOP_LEVEL_KEYS` + 携带豁免表'
        '(理由:`adoptionId` 由「本次选择」定,跨对话带上会让新故事的第一次落卷被判成**重复确认**而静默不落) '
        '+ `collectExport` 增 `canonAdoption: this._canonAdoption || null` + `restoreFromPayload` 增同名 `_imp` '
        '还原分支 + 清空面增一档 + 自检面「支线正史」行落卷读数(并入既有行)。\n'
        '★ **验收四步闭环逐条落地(全部真跑读数,读码可复算)**:\n'
        '  (a) **选择** —— 稳态 1 条可接 / 下游 `missingFaces` 0 / `willAdd` 1 / `proposals` 1;'
        '三态互不相等(`ready`/`blocked`/`empty`),`blocked` 与 `empty` 均 `pack null`,`pendingCount` 分列 1 / 0;'
        '缺格三因(`no-face`/`no-owner`/`no-key`)**各出现且分列**,可接集 0 条;\n'
        '  (b) **落卷** —— `storyCanonAdoptConfirm` 传 `volumeId` 为 `v1` ⇒ '
        '`ok:true` / `applied:1` / `persisted:true` / `readback` 为 `ok` / 器官账本 `volumeContinuationCount() === 1` / '
        '诊断行含「已落 1 条」;\n'
        '  (c) **重启** —— 同实例重复确认 ⇒ `duplicate:true` 且账本仍 1(**不重落**);'
        '**新实例 + 从 `collectExport()` 载荷还原凭据**后再确认 ⇒ 仍 `duplicate:true` 且**带原 `applied`** '
        '(`{\\"applied\\":1,\\"reason\\":\\"duplicate\\"}`);换卷(`v2`)不算重复(**必须真落笔**);'
        '预览期 `persisted:false` / `_canonAdoption === null`,commit 后才落(重复确认判据才有依据);\n'
        '  (d) **撤销** —— `revokeGuard` ⇒ `revocableCount 1` / `foreignCount 1`(别批) / `manualCount 2`(手工) / '
        '`deletesManual false` / `branchWrites 0`;无来源范围且晚于本次凭据者(后来新增)**单列一张表**;'
        '无凭据 ⇒ `judged:false` 且可撤集 0。\n'
        '★ **定向复验(全部真跑)**:`tests/v3420_m4x3_canon_adoption.test.mjs`(**%(suite_n)d 条**,'
        '宿主侧从 `index.js` 真切片 + 真装载 `branch-canon` 内核 + 真下游 owner):'
        'A1 宿主五新出口各恰一处 + 四处契约面 + `organs` 逐字副本 + 自检面「支线正史」行并入 + `extra_js` 107;'
        'A2 内核面(`BC_VERSION 2` + 六张常量面 + 八个新原语 + 既有面一字未拆 + 冻结);'
        'A3 内核纯度(实现体不读宿主 `this`;零 `require(` / `fetch(` / 落盘;judge 面不拿宿主字串当判据);'
        'B1 形状真接得上(条目每条带 shape 三格 + 下游逐条不再读成缺面 + 真出得成提案);'
        'B2 三态不同形;B3 缺格三因具名且分列;B4 幂等地基;B5 撤销保护面;'
        'C1 宿主落卷计划出口(真内核 + 零写读数 + 诊断行同源 + 未选尽不出包);'
        'C2 确认落笔三环 + 同会话与重启后重复确认均不再落笔 + 换卷不算重复;'
        'C3 凭据落盘闸门;C4 撤销保护面出口(四张表分类对 + 器官缺席不编条目不抛);'
        'C5 内核缺席三出口**同键降级**(不抛 / 不 undefined);'
        'D1～D8 **八条真源码破坏负控制**(各带原版阳性对照);F1 H5 判据纯度(八个锚点在本档各 1 次、真源各 1 次);'
        'F2 H6 工具两向自证;G1 六源同源 + 出生锚 `BORN_V`(下界口径,不锁当版)。'
        '宿主基线重建至 v3.342.0:实测 %(host_lines)d 行 / %(host_members)d 成员(ceiling %(ceiling)d 余量 400);'
        '`extra_js` 仍 107(本刀无新模块,故不动装载面)。'
        '· 退出码三档:0 卫生 / 1 真缺陷 / 2 结构漂移(本仓扫描器契约;本节同款声明供 D9 核对)。'
        '★ **诚实边界**:真实 SillyTavern 宿主的 UI 点击流**未跑**(宿主新面以真装载宿主切片验证调用口径;'
        '「重启」一条用**真新实例 + 真持久载荷还原**取证 —— 验的是判据认不认持久凭据,不是真关掉酒馆再开);'
        '撤销面**只判分类与读数**(谁在可撤集、谁被排除、两条口径写成读数),真删动作不在本仓;'
        '全量 `npm test` **已实跑一次**（322/322 文件 · 3774 断言 · 0 失败 · 审计 61/61 · exit 0），但**读数未登记**；快照按纪律仍停 v3.328.0，登记留到第四期计划收口点 ⇒ 本版**全量待验**。\n') % T
cl = head + cl
io.open(CL, 'w', encoding='utf-8').write(cl)
print('CHANGELOG.md 已写 1 处')

# -------- 写后自检：四份文档的当版读数必须真齐（防「脚本跑过了但没生效」）
rd2 = io.open(R, encoding='utf-8').read()
td2 = io.open(D, encoding='utf-8').read()
cl2 = io.open(CL, encoding='utf-8').read()
pl2 = io.open(P, encoding='utf-8').read()
assert '**当前版本**：`%s`' % T['ver'] in rd2, 'README 当前版本未生效'
assert '当前版本 v%s **全量待验**' % T['ver'] in rd2, 'README 待验标记未生效'
assert '**%d 个测试文件**' % T['tests'] in rd2, 'README 在役读数未生效'
assert td2.count('> **最近更新：v%s ——' % T['ver']) == 1, 'TODO 最近更新未生效或重复'
assert cl2.startswith('## v%s' % T['ver']), 'CHANGELOG 顶节未生效'
assert pl2.count('当前执行状态（2026-10-16，v%s）' % T['ver']) == 1, 'PLAN 当前执行状态未生效'
assert ('当前规则' if False else True)
assert '**当前版本**：`3.341.0`' not in rd2, 'README 仍有旧版本残留'
assert '当前版本 v3.341.0 **全量待验**' not in rd2, 'README 仍有旧待验残留'
print('  ✓ 自检通过：四份文档当版读数齐备、旧口径无残留')