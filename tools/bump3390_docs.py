#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.339.0 文档真实性同步：PLAN.md / README.md / TODO.md / CHANGELOG.md 对齐磁盘真值。
真值（脚本内自读，不手抄）：版本 / 测试文件数 / 审计门禁数 / 宿主探针行数与成员数。
★ 本版不重绑全量读数（doc_readings.json 仍停在 v3.328.0）：第四期计划收口前禁跑全量，
  故 README/PLAN 一律写「当前版本 v3.339.0 全量待验」。
"""
import io, json, os, re
ROOT = '/home/user/lonsha-memory-plugin'
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
        'ver': ver, 'tests': len(tests), 'audit_gated': len(audit_gated), 'audit_all': len(audit_all),
        'host_lines': base['readings']['total_lines'], 'host_members': base['readings']['member_count'],
        'ceiling': base['line_budget']['ceiling'], 'wc_l': base['readings']['total_lines'] - 1,
        'probe_lines_recomputed': lines_probe,
    }
T = disk_truth()
assert T['ver'] == '3.339.0', '版本未抬到 3.339.0: %s' % T['ver']
assert T['host_lines'] == T['probe_lines_recomputed'], '基线行数与真文件不一致'
print('磁盘真值: ver=%(ver)s tests=%(tests)d audit=%(audit_gated)d/%(audit_all)d host=%(host_lines)d/%(host_members)d' % T)
def sub1(text, old, new, label):
    n = text.count(old)
    assert n == 1, '%s 锚点命中 %d 次(应为 1): %r' % (label, n, old[:70])
    return text.replace(old, new, 1)
# -------- PLAN.md
P = os.path.join(ROOT, 'PLAN.md')
plan = io.open(P, encoding='utf-8').read()
OLD_HEAD = '> **当前执行状态（2026-10-16，v3.338.0）**'
i = plan.index(OLD_HEAD); j = plan.index('\n', i)
new_status = ('> **当前执行状态（2026-10-16，v3.339.0）**：规划基线 `main@0f2f7fd`。本版是第四期**拓展九项第一项 M4-X1**'
              '（可校订的分层导入与源资料更新；P1 / L）实施点:内核 `lore-import.js::classify` 是**唯一分类口径**'
              '（优先关键词判规则），宿主八个 `loreImport*` 出口**全是只读**（`planApply` 的 `writesNothing: true`）、'
              '全仓零 `override`/`reclass`/`改类` 命中 ⇒ **能分类、不能校订，能出计划、不能落笔**。'
              '本版两刀:**① 内核人工校订面**（`LI_VERSION 1→2`；`MANUAL` 三态 `accept`/`override`/`split`，'
              '三态都**不改 origin**——人工改类只改归类，不改「这是导入资料」；`applyOverrides` 每条 item 增 '
              '`clsRule`（规则原判**永不丢**）/`cls`（最终）/`manual`/`judgeWhy`，非法类名拒收具名 `bad-class`、'
              '切点缺拒收 `split-point-absent`，拆分产出 `key#a`/`key#b` 两条；`splitText` 按 `atText`/`at` 切；'
              '`reclassify` 薄封装；`planApply` 增 `selected` 过滤——未选段具名 `not-selected`，**不静默丢**；'
              '`describe`/`selfCheck` 露 manual 面；导出面 29→34 项）;**② 宿主接线面**'
              '（`_loreImportOwners` 落笔 owner 唯一装配点:前情写面走 `PrequelSystem.importPrequel`、'
              '事实读面走 `_o6ConfirmedFacts` **只读**、幂等面;`_loreImportLedgerState` 导入账懒初始化，'
              '**只存幂等键与人工决定，不存整篇资料**;`loreImportOverride` 转发内核;'
              '`loreImportConfirmMapping` 把 needs-confirm 裁决接回，**不静默合并同名异人**;'
              '`async loreImportApply` 四步顺序**不可换**:叠校订出计划(未预览即拒)→只落选中段(敏感段跳过并具名 '
              '`sensitive-body`)→写 `PrequelSystem`（**不写事实账**——规则不冒充已发生）并读本行真账核验→落盘回读;'
              '回执含 `importId`/`duplicate`/`selected`/`applied`/`verified`/`persisted`/`readback`/`idempotentByImportId`/'
              '`undo`;`loreImportLedger` 重开可查落点;`collectExport` 增 `loreImportLedger` 键、'
              '`restoreFromPayload` 增还原分支）。专项套件 v3390 **13 条全绿**（含 F1/F2/F3/F4 四条真源码破坏负控制 '
              '+ G1 纯度 + H1 锚点）。宿主基线 %(host_lines)d/%(host_members)d(ceiling %(ceiling)d 余量 400)。'
              '上一项 M4-O8(v3.338.0,控制中心处置动作生产方)专项 16 条。'
              '本版 v3.339.0 未全量实跑，当前 v3.339.0 **全量待验**。') % T
plan = plan[:i] + new_status + plan[j:]
plan = sub1(plan, '| 版本 | **v3.338.0**（四源同源；本表原为 v3.266.0） |',
            '| 版本 | **v3.339.0**（四源同源；本表原为 v3.266.0） |', 'PLAN 版本行')
plan = sub1(plan, '| 门禁 | 在役面 **318 测试文件 / 61 个 audit 脚本**（磁盘 67）',
            '| 门禁 | 在役面 **%d 测试文件 / %d 个 audit 脚本**（磁盘 %d）' % (T['tests'], T['audit_gated'], T['audit_all']),
            'PLAN 门禁行')
plan = sub1(plan, '| 体量 | `index.js` **20563 行**(探针读数;`wc -l` 20562) / **758** 成员',
            '| 体量 | `index.js` **%(host_lines)d 行**(探针读数;`wc -l` %(wc_l)d) / **%(host_members)d** 成员' % T,
            'PLAN 体量行·当版读数')
plan = sub1(plan, 'v3.338.0 M4-O8 控制中心处置动作生产方后为 20563 / 758;',
            'v3.338.0 M4-O8 控制中心处置动作生产方后为 20563 / 758,'
            'v3.339.0 M4-X1 可校订分层导入后为 %(host_lines)d / %(host_members)d;' % T,
            'PLAN 体量行·历史链')
io.open(P, 'w', encoding='utf-8').write(plan)
print('PLAN.md 已写 5 处')
# -------- README.md
R = os.path.join(ROOT, 'README.md')
rd = io.open(R, encoding='utf-8').read()
rd = sub1(rd, '**当前版本**：`3.338.0`', '**当前版本**：`%s`' % T['ver'], 'README 当前版本')
rd = sub1(rd, '`npm test` 当前发现 **318 个测试文件**；`npm test -- --audit` 当前发现 **61/61** 审计脚本',
          '`npm test` 当前发现 **%d 个测试文件**；`npm test -- --audit` 当前发现 **%d/%d** 审计脚本'
          % (T['tests'], T['audit_gated'], T['audit_gated']), 'README 在役面读数行')
rd = sub1(rd, '当前版本 v3.338.0 **全量待验**(未实跑;最近一次全量快照仍是 v3.328.0,见上段)。',
          '当前版本 v%s **全量待验**(未实跑;最近一次全量快照仍是 v3.328.0,见上段)。' % T['ver'], 'README 待验标记')
rd = sub1(rd, 'npm test             # 全部用例：318 个测试文件（在役面，磁盘枚举）',
          'npm test             # 全部用例：%d 个测试文件（在役面，磁盘枚举）' % T['tests'], 'README 用法行')
rd = sub1(rd, '├── tests/                # 在役面：318 个测试文件 + 61 个审计脚本',
          '├── tests/                # 在役面：%d 个测试文件 + %d 个审计脚本' % (T['tests'], T['audit_gated']),
          'README 目录树行')
rd = sub1(rd, '**在役面**（磁盘枚举，不代表已实跑）：`tests/` 318 个测试文件',
          '**在役面**（磁盘枚举，不代表已实跑）：`tests/` %d 个测试文件' % T['tests'], 'README 在役面段')
io.open(R, 'w', encoding='utf-8').write(rd)
print('README.md 已写 6 处')
# -------- TODO.md
D = os.path.join(ROOT, 'TODO.md')
td = io.open(D, encoding='utf-8').read()
anchor = '> **最近更新：v3.338.0'
assert td.count(anchor) == 1, 'TODO v3.338 锚点命中 %d 次' % td.count(anchor)
new_entry = ('> **最近更新：v3.339.0 —— 第四期拓展第一项 M4-X1:可校订的分层导入与源资料更新(P1 / L)**'
             '(第四期产品拓展包第一项)。★ **修的是什么(修前实测,读码可复算)**:内核 `lore-import.js::classify` '
             '是**唯一分类口径**(优先关键词判规则),而宿主八个 `loreImport*` 出口(`loreImportParse`/`ParseWindow`/'
             '`Entities`/`Preview`/`Plan`/`Changed`/`Describe`/`Line`)**全是只读**(`planApply` 的 `writesNothing: true`),'
             '全仓零 `override`/`reclass`/`改类` 命中 ⇒ **能分类、不能校订,能出计划、不能落笔**。'
             '★ **本刀(两刀:内核人工校订面 / 宿主接线面,不建第三套状态机)**:'
             '① **内核人工校订面** —— `LI_VERSION 1→2`;`MANUAL` 三态 `accept`/`override`/`split`(三态都**不改 origin**'
             '—— 人工改类只改归类,不改「这是导入资料」);`applyOverrides` 每条 item 增 `clsRule`(规则原判**永不丢**)/'
             '`cls`(最终)/`manual`/`judgeWhy`,非法类名拒收具名 `bad-class`、切点缺拒收 `split-point-absent`,'
             '拆分产出 `key#a`/`key#b` 两条;`splitText` 按 `atText`/`at` 切;`reclassify` 薄封装;'
             '`planApply` 增 `selected` 过滤(未选段具名 `not-selected`,**不静默丢**);`describe`/`selfCheck` 露 manual 面;'
             '导出面 29→34 项。② **宿主接线面** —— `_loreImportOwners`(落笔 owner 唯一装配点:前情写面走 '
             '`PrequelSystem.importPrequel`、事实读面走 `_o6ConfirmedFacts` **只读**、幂等面);`_loreImportLedgerState`'
             '(导入账懒初始化,**只存幂等键与人工决定,不存整篇资料**);`loreImportOverride`(转发内核);'
             '`loreImportConfirmMapping`(把 needs-confirm 裁决接回,**不静默合并同名异人**);`async loreImportApply`'
             '(四步顺序**不可换**:叠校订出计划(未预览即拒)→只落选中段(敏感段跳过并具名 `sensitive-body`)→'
             '写 `PrequelSystem`(**不写事实账** —— 规则不冒充已发生)并读本行真账核验→落盘回读;回执含 `importId`/'
             '`duplicate`/`selected`/`applied`/`verified`/`persisted`/`readback`/`idempotentByImportId`/`undo`);'
             '`loreImportLedger`(重开可查落点);`collectExport` 增 `loreImportLedger` 键、`restoreFromPayload` 增还原分支。'
             '★ **定向验收(全部真跑)**:`tests/v3390_m4x1_lore_manual.test.mjs`(**13 条**,真切片宿主 + 真装载内核):'
             'A 宿主新面各恰一处 + 持久化面在位 / A2 内核人工校订面 / B1 人工改类(clsRule 与 cls 分列 / bad-class / '
             'split-point-absent / #a·#b)/ B2 选入面(selected 过滤 / 未选段具名)/ C1 宿主落笔(前情含选中段 / 事实账零写 / '
             'duplicate / 未选不写 / persisted+readback)/ C2 敏感段不落 / C3 同名映射确认回填 / '
             'F1～F4 四条真源码破坏负控制 + G1 判据纯度 + H1 版本锚。'
             '宿主基线重建至 %(host_lines)d 行 / %(host_members)d 成员(ceiling %(ceiling)d 余量 400)。'
             '★ **诚实边界**:真实 SillyTavern 宿主的 UI 点击流与真实模型问答**未跑**'
             '(宿主新面以真装载宿主切片验证调用口径);本版**全量待验**。\n') % T
td = td.replace(anchor, new_entry + anchor, 1)
io.open(D, 'w', encoding='utf-8').write(td)
print('TODO.md 已写 1 处')
# -------- CHANGELOG.md
CL = os.path.join(ROOT, 'CHANGELOG.md')
cl = io.open(CL, encoding='utf-8').read()
assert cl.startswith('## v3.338.0'), 'CHANGELOG 顶节不是 v3.338.0'
head = ('## v3.339.0\n'
        '**第四期拓展第一项 M4-X1:可校订的分层导入与源资料更新(P1 / L)**(第四期产品拓展包第一项)。'
        '★ **修的是什么(修前实测,读码可复算)**:内核 `lore-import.js::classify` 是**唯一分类口径**'
        '(优先关键词判规则);宿主八个 `loreImport*` 出口(`loreImportParse` / `ParseWindow` / `Entities` / `Preview` / '
        '`Plan` / `Changed` / `Describe` / `Line`)**全是只读** —— `planApply` 的 `writesNothing: true`,'
        '全仓零 `override` / `reclass` / `改类` 命中 ⇒ **能分类、不能校订,能出计划、不能落笔**;'
        '`entityCandidates` 出 `needs-confirm`、`diffPreview` 吃 `mappingNeedsConfirm`,但**没有面把确认结果接回**。\n'
        '★ **本刀(两刀:内核人工校订面 / 宿主接线面,不建第三套状态机)**:'
        '① **内核人工校订面** —— `LI_VERSION 1→2`;`MANUAL = Object.freeze({ACCEPT:\'accept\', OVERRIDE:\'override\', '
        'SPLIT:\'split\'})`(三态都**不改 origin** —— 人工改类只改归类,不改「这是导入资料」);'
        '`applyOverrides(parsed, overrides, opts)` 返回 `{ok, items, applied, rejected, counts, why}`,'
        '每条 item 增 `clsRule`(规则原判**永不丢**)/`cls`(最终)/`manual`/`judgeWhy`,未在 overrides 里的段保持规则判;'
        '非法 `cls` 拒收具名 `bad-class`、切点缺拒收具名 `split-point-absent`,拆分产出 `key#a`/`key#b` 两条;'
        '`splitText(text, ov, lines)` 按 `atText` / `at` 切(缺则拒 `split-point-absent` / `split-marker-not-found` / '
        '`split-empty-side` / `split-out-of-range`);`reclassify(parsed, itemKey, cls, opts)` 薄封装走 `applyOverrides`;'
        '`planApply` 增 `selected` 过滤(未选段具名 `not-selected`,**不静默丢**);`describe` 增 `manual` / '
        '`manualDecisions`;`selfCheck` 增 `manualDistinct`;导出面 29→34 项(增 `MANUAL` / `applyOverrides` / '
        '`reclassify` / `splitText`)。\n'
        '② **宿主接线面** —— `_loreImportOwners()`(落笔 owner 的**唯一装配点**:前情写面走 `PrequelSystem.importPrequel`、'
        '事实读面走 `_o6ConfirmedFacts` **只读**、幂等面 `seen()`);`_loreImportLedgerState()`(导入账懒初始化 '
        '`{version, seen, importedText, decisions, mappings, lastApply}`,随聊天持久化,**只存幂等键与人工决定,'
        '不存整篇资料**);`loreImportOverride(parsed, overrides, opts)`(转发内核 `applyOverrides`,留痕 '
        '`_lastLoreOverride`);`loreImportConfirmMapping(parsed, mapping, opts)`(把 needs-confirm 的裁决接回,'
        '未确认进 `mappingNeedsConfirm`,**不静默合并同名异人**);`async loreImportApply(parsed, preview, opts = {})`'
        '(四步顺序**不可换**:① 人工校订先叠 → 出计划(未预览 ⇒ 拒;`selected` 由内核过滤)→ ② 只落选中段'
        '(按原序拼文本,敏感段跳过并具名 `sensitive-body`)→ ③ 写 `PrequelSystem`(**不写事实账** —— 规则不冒充已发生)'
        '并读本行真账核验(前情文本真含各段标题)→ ④ 落盘 + 回读(一次);回执含 `ok` / `reason` / `importId` / '
        '`duplicate` / `selected` / `applied` / `verified` / `persisted` / `readback` / `items` / `rejected` / '
        '`writes` / `zeroWrite` / `idempotentByImportId` / `stale` / `undo`;异常降级返回 null 但先留 `_lastLoreApply` '
        '作废读数;`_leaseValid` / `_leaseDrop` 栅栏与 `applyCorrectionPlan` 同款);`loreImportLedger()`'
        '(导入账读数,**重开可查**落点,只读);`collectExport` 增 `loreImportLedger: this._loreImportLedger || null`;'
        '`restoreFromPayload` 增 `_imp(\'loreImportLedger\', true, ...)`(账是纯数据,不依赖 owner 在场)。\n'
        '★ **连带修一处真漂移**:`loreImportLedger` 进了 `collectExport` / `restoreFromPayload`,'
        '却漏登记进 `ARCHIVE_TOP_LEVEL_KEYS`(契约三方一致性契约)——`v3140` 判据当场照出「契约缺导出键」;'
        '本版加法补契约表(两处逐字副本)+ 显式豁免表(importedText 与携带面 prequel 同源异名,携带会双写;'
        'seen/decisions 是会话内幂等与校订痕迹),并同步 `v3283` 常量副本登记值(len 629→649 / md5 d5942cdc)'
        '与 `v3202` 豁免表键数(14→15)。\n'
        '★ **定向验收(全部真跑)**:`tests/v3390_m4x1_lore_manual.test.mjs`(**13 条**,宿主侧从 `index.js` 真切片 + '
        '真装载 `lore-import` 内核):A1 宿主六面各恰一处 + 持久化面在位;A2 内核人工校订面(`LI_VERSION 2` / '
        '`MANUAL` 三态 / 三原语 / `describe`·`selfCheck` 露 manual 面);B1 人工改类(`clsRule` 与 `cls` 分列 / '
        '`bad-class` / `split-point-absent` / `#a`·`#b`);B2 选入面(`selected` 过滤 / 未选段具名 / 未给则全落);'
        'C1 宿主落笔(前情含选中段 / **事实账零写** / `duplicate` / 未选不写 / `persisted`+`readback`);'
        'C2 敏感段不落(掩码不进前情 + 具名 `sensitive-body`);C3 同名映射确认回填(`needs-confirm` 裁决接回,'
        '不静默合并);F1～F4 四条真源码破坏负控制(各带原版阳性对照) + G1 H5 判据纯度 + H1 版本锚 v3.339.0。'
        '宿主基线重建至 v3.339.0:实测 %(host_lines)d 行 / %(host_members)d 成员(ceiling %(ceiling)d 余量 400)。'
        '· 退出码三档:0 卫生 / 1 真缺陷 / 2 结构漂移(本仓扫描器契约;本节同款声明供 D9 核对)。'
        '★ **诚实边界**:真实 SillyTavern 宿主的 UI 点击流程与真实模型问答**未跑**(宿主新面以真装载宿主切片'
        '验证调用口径);全量 `npm test` 按纪律集中到第四期计划收口点跑一次(本版为定向复验),本版**全量待验**。\n') % T
cl = head + cl
io.open(CL, 'w', encoding='utf-8').write(cl)
print('CHANGELOG.md 已写 1 处（新顶节）')