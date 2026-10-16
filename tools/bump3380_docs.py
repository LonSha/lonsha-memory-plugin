#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.338.0 文档真实性同步：PLAN.md / README.md / TODO.md / CHANGELOG.md 对齐磁盘真值。
真值（脚本内自读，不手抄）：版本 / 测试文件数 / 审计门禁数 / 宿主探针行数与成员数。
★ 本版不重绑全量读数（doc_readings.json 仍停在 v3.328.0）：第四期计划收口前禁跑全量，
  故 README/PLAN 一律写「当前版本 v3.338.0 全量待验」。
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
assert T['ver'] == '3.338.0', '版本未抬到 3.338.0: %s' % T['ver']
assert T['host_lines'] == T['probe_lines_recomputed'], '基线行数与真文件不一致'
print('磁盘真值: ver=%(ver)s tests=%(tests)d audit=%(audit_gated)d/%(audit_all)d host=%(host_lines)d/%(host_members)d' % T)
def sub1(text, old, new, label):
    n = text.count(old)
    assert n == 1, '%s 锚点命中 %d 次(应为 1): %r' % (label, n, old[:70])
    return text.replace(old, new, 1)
# -------- PLAN.md
P = os.path.join(ROOT, 'PLAN.md')
plan = io.open(P, encoding='utf-8').read()
OLD_HEAD = '> **当前执行状态（2026-10-16，v3.337.0）**'
i = plan.index(OLD_HEAD); j = plan.index('\n', i)
new_status = ('> **当前执行状态（2026-10-16，v3.338.0）**：规划基线 `main@0f2f7fd`。本版是第四期 **M4-O8**'
              '（记忆控制中心处置类动作的生产方落地；P0 / L）实施点:内核 `memory-center.js` 早声明 9 个动作'
              '（read/preview/write 三档）与「宿主没给 handler ⇒ 降级 unavailable、未给 availableHandlers ⇒ 只声明不判」'
              '两条纪律,而**面板一个 handler 都没接**（`_memoryCenterHandlers` 全仓零定义）⇒ 界面上所有处置按钮要么'
              '不存在、要么点了无声。本版四刀:① **宿主纠错落笔面**（`_correctionOwners`/`_verifyCorrectionItem`/'
              '`applyCorrectionPlan`/`undoCorrection`,四步顺序不可换:出提案(未圈范围即拒)⇒只落 selected⇒owner 改数据'
              '并读本行真账核验⇒落盘回读;回执含 applied/verified/persisted/readback/stale 与**两个互不触碰的撤销 token**）;'
              '② **面板取数口**（`correctionSourceFacts` 圈定范围取账上事实、`correctionReextractFacts` 向重提取管线要'
              '新一轮结果;提取器缺席 ⇒ 具名 extractor-absent,**不拿旧账当新结果**）;③ **单条撤回直写面**'
              '（`memoryCenterRevoke` 直走 `revokeFact`,不借道 `undoCorrection`——借道要伪造 journal,伪造会把'
              '「撤销这一批」的真流水覆盖掉）与**保存条件唯一出口**（`memoryCenterSaveQuery`:条件口径在内核 `buildSpec`、'
              '摘要口径在内核 `specLine`,面板各拼一份就成了第二套口径）;④ **saved 真源注入点**'
              '（`_memoryCenterStateWithSaved`:面板读 `state.saved` 而保存的真源在 `_evidenceSavedQueries`,'
              '两者此前**零同步** ⇒ 保存了却看不到、看不到却删不掉;浅拷贝注入,不反写调用方对象）。'
              '面板侧补齐 **9 个 handler**（`row.repair.preview`/`row.detail`/`row.revoke`/`row.dispute`/`row.export`/'
              '`query.save`/`query.reset`/`saved.remove`/`saved.replay`）,其中 `row.dispute` **如实报不可用**'
              '（事实账无「争议」写面,`disputed` 在 `fact-state.js` 是推导态）,**不编一个假写入**;'
              '旧「手写 state」三形态（伪造 journal token / `st.spec=hit.spec` / 第二张表 `_memoryCenterSaved`）全部清零。'
              '专项套件 v3380 16 条全绿(含 F1/F2/F3 三条真源码破坏负控制 + G1 纯度 + H1 锚点)。'
              '宿主基线 %(host_lines)d/%(host_members)d(ceiling %(ceiling)d 余量 400)。'
              '上一项 M4-O7(v3.337.0,长期压缩保住证据)专项 8 条。'
              '本版 v3.338.0 未全量实跑，当前 v3.338.0 **全量待验**。') % T
plan = plan[:i] + new_status + plan[j:]
plan = sub1(plan, '| 版本 | **v3.337.0**（四源同源；本表原为 v3.266.0） |',
            '| 版本 | **v3.338.0**（四源同源；本表原为 v3.266.0） |', 'PLAN 版本行')
plan = sub1(plan, '| 门禁 | 在役面 **317 测试文件 / 61 个 audit 脚本**（磁盘 67）',
            '| 门禁 | 在役面 **%d 测试文件 / %d 个 audit 脚本**（磁盘 %d）' % (T['tests'], T['audit_gated'], T['audit_all']),
            'PLAN 门禁行')
plan = sub1(plan, '| 体量 | `index.js` **20159 行**(探针读数;`wc -l` 20103) / **749** 成员',
            '| 体量 | `index.js` **%(host_lines)d 行**(探针读数;`wc -l` %(wc_l)d) / **%(host_members)d** 成员' % T,
            'PLAN 体量行·当版读数')
plan = sub1(plan, 'v3.336.0 M4-O9 可知性裁剪判决口后为 20104 / 749;',
            'v3.336.0 M4-O9 可知性裁剪判决口后为 20104 / 749,v3.337.0 M4-O7 证据保护筛后为 20159 / 749,'
            'v3.338.0 M4-O8 控制中心处置动作生产方后为 %(host_lines)d / %(host_members)d;' % T,
            'PLAN 体量行·历史链')
io.open(P, 'w', encoding='utf-8').write(plan)
print('PLAN.md 已写 5 处')
# -------- README.md
R = os.path.join(ROOT, 'README.md')
rd = io.open(R, encoding='utf-8').read()
rd = sub1(rd, '**当前版本**：`3.337.0`', '**当前版本**：`%s`' % T['ver'], 'README 当前版本')
rd = sub1(rd, '`npm test` 当前发现 **317 个测试文件**；`npm test -- --audit` 当前发现 **61/61** 审计脚本',
          '`npm test` 当前发现 **%d 个测试文件**；`npm test -- --audit` 当前发现 **%d/%d** 审计脚本'
          % (T['tests'], T['audit_gated'], T['audit_gated']), 'README 在役面读数行')
rd = sub1(rd, '当前版本 v3.337.0 **全量待验**(未实跑;最近一次全量快照仍是 v3.328.0,见上段)。',
          '当前版本 v%s **全量待验**(未实跑;最近一次全量快照仍是 v3.328.0,见上段)。' % T['ver'], 'README 待验标记')
rd = sub1(rd, 'npm test             # 全部用例：317 个测试文件（在役面，磁盘枚举）',
          'npm test             # 全部用例：%d 个测试文件（在役面，磁盘枚举）' % T['tests'], 'README 用法行')
rd = sub1(rd, '├── tests/                # 在役面：317 个测试文件 + 61 个审计脚本',
          '├── tests/                # 在役面：%d 个测试文件 + %d 个审计脚本' % (T['tests'], T['audit_gated']),
          'README 目录树行')
rd = sub1(rd, '**在役面**（磁盘枚举，不代表已实跑）：`tests/` 317 个测试文件',
          '**在役面**（磁盘枚举，不代表已实跑）：`tests/` %d 个测试文件' % T['tests'], 'README 在役面段')
io.open(R, 'w', encoding='utf-8').write(rd)
print('README.md 已写 6 处')
# -------- TODO.md
D = os.path.join(ROOT, 'TODO.md')
td = io.open(D, encoding='utf-8').read()
anchor = '> **最近更新：v3.337.0'
assert td.count(anchor) == 1, 'TODO v3.337 锚点命中 %d 次' % td.count(anchor)
new_entry = ('> **最近更新：v3.338.0 —— 第四期第九项 M4-O8:记忆控制中心处置类动作的生产方落地(P0 / L)**'
             '(第四期产品主线包A第八项)。★ **修的是什么(修前实测,读码可复算)**:内核 `memory-center.js` 早声明'
             '9 个动作与两条纪律(宿主没给 handler ⇒ 降级 unavailable;未给 availableHandlers ⇒ 只声明不判),'
             '而 `plugin._memoryCenterHandlers` **全仓零定义** —— 界面上的处置按钮要么不存在、要么点了无声;'
             '且 `correction-plan.js` 的提案面 writes 恒 0 —— **没有一条落笔通道**。'
             '★ **本刀(四刀:落笔面 / 取数口 / 直写面 / 真源注入,不建第三套状态机)**:'
             '① **宿主纠错落笔** `applyCorrectionPlan`(四步顺序不可换:出提案(未圈范围即拒)→只落 selected→'
             'owner 改数据并读本行真账核验→落盘回读;回执 applied/verified/persisted/readback/stale '
             '+ **configUndo / factUndo 两个互不触碰的 token**)+ `undoCorrection`(分两路)+ `_verifyCorrectionItem`;'
             '② **取数口** `correctionSourceFacts`(圈范围取账上事实,未圈 ⇒ ok:false **绝不退回全量**)'
             '+ `correctionReextractFacts`(提取器缺席 ⇒ 具名 extractor-absent,不拿旧账当新结果);'
             '③ **直写面** `memoryCenterRevoke`(直走 `revokeFact`,不借道 `undoCorrection` —— 借道要伪造 journal,'
             '伪造会把「撤销这一批」的真流水覆盖掉) + `memoryCenterSaveQuery`(保存条件唯一出口);'
             '④ **真源注入** `_memoryCenterStateWithSaved`(面板读 `state.saved` 而真源在 `_evidenceSavedQueries`,'
             '两者此前零同步 ⇒ 保存了却看不到;浅拷贝注入不反写调用方)。面板补齐 **9 个 handler**,'
             '其中 `row.dispute` **如实报不可用**(事实账无争议写面,`disputed` 是推导态),**不编假写入**。'
             '★ **定向验收(全部真跑)**:`tests/v3380_m4o8_center_actions.test.mjs`(**16 条**,真切片宿主 + 真装载四内核):'
             'A 声明面(九处各恰一处 / 9 handler 各恰一处且旧手写模式清零 / 内核声明面 == 面板提供面)/'
             'B 六个出口真跑(保存同条件覆盖 / 浅拷贝同步 / 圈范围只取范围内 / 未圈不退回全量 / 三态不同形 / '
             '撤回幂等且 journal 保留)/C 端到端(face.saved 与真源同条 / 争议面无写调用)/'
             'F 三条真源码破坏负控制(各带原版阳性对照)+ G1 判据纯度 + H1 版本锚。'
             '宿主基线重建至 %(host_lines)d 行 / %(host_members)d 成员(ceiling %(ceiling)d 余量 400);'
             '死代码预算 71414 → 72714(实测 72314)。'
             '★ **诚实边界**:真实 SillyTavern 宿主的 UI 点击流与真实模型问答**未跑**'
             '(面板 handler 以真装载宿主切片验证调用口径);本版**全量待验**。\n') % T
td = td.replace(anchor, new_entry + anchor, 1)
io.open(D, 'w', encoding='utf-8').write(td)
print('TODO.md 已写 1 处')
# -------- CHANGELOG.md
CL = os.path.join(ROOT, 'CHANGELOG.md')
cl = io.open(CL, encoding='utf-8').read()
assert cl.startswith('## v3.337.0'), 'CHANGELOG 顶节不是 v3.337.0'
head = ('## v3.338.0\n'
        '**第四期第九项 M4-O8:记忆控制中心处置类动作的生产方落地(P0 / L)**(第四期产品主线包A第八项)。'
        '★ **修的是什么(修前实测,读码可复算)**:`memory-center.js` 的 `ACTIONS` 冻结表早声明 9 个动作'
        '(read / preview / write 三档)与两条纪律 —— 宿主没提供的 handler ⇒ `kind:\'unavailable\'` 且 `unavailable:true`、'
        '未给 `availableHandlers` ⇒ 只按声明 kind 原样给出并附 `declaredOnly:true`(「我没问」与「宿主说没有」是两件事);'
        '而 `plugin._memoryCenterHandlers` 在**全仓零定义** —— 消费方 `settings-ui.js` 按 `data-action` 取 handler 时恒取到'
        '`undefined`,界面上所有处置动作要么不存在、要么点了无声。同时 `correction-plan.js` 的提案面 `writes` 恒 0,'
        '**没有一条落笔通道** —— 提案能出、没人能落。\n'
        '★ **本刀(四刀:落笔面 / 取数口 / 直写面 / 真源注入,不建第三套状态机)**:'
        '① **宿主纠错落笔面** —— `_correctionOwners()`(事实写面走 `fact-version` 既有 `assertFact`/`revokeFact`,'
        '**新增/换代/撤回三条路都不另造语义**;同主语+同谓词+同值且未撤 ⇒ 幂等不重复落) + '
        '`_verifyCorrectionItem(kind, item)`(**读本行真账**核验这一项真在账上/真被撤) + '
        '`applyCorrectionPlan(opts)`(四步顺序**不可换**:出提案(未圈范围 ⇒ 拒、一个字节不改)→ 只落 '
        '`decision===\'selected\'` 的项(选 2 拒 1 ⇒ 拒的那条字节不动)→ 逐项 owner 改数据并读本行真账核验 → '
        '落盘 + 一次回读;回执含 `applied`/`verified`/`persisted`/`readback`/`stale`/`duplicatesPrevented` 与 '
        '`undo{configUndo, factUndo}` **两个互不触碰的 token** —— 撤配置不动事实、撤事实不动配置);'
        '`undoCorrection(opts)`(分 `fact`/`config` 两路,事实路**保留换代链的可查性**:把 `to`/`supersededBy` 还原,'
        '不删条目)。② **面板取数口** —— `correctionSourceFacts(range)`(圈定范围取账上事实;'
        '范围判不了 ⇒ `ok:false` + 具名 reason,**绝不退回全量** —— 「没圈范围」不等于「全选」)+ '
        '`correctionReextractFacts(opts)`(向重提取管线要新一轮结果;提取器缺席 ⇒ 具名 `extractor-absent`,'
        '**不拿旧账当新结果**;fixture 通道原样透传并如实标 `source:\'fixture\'`)。'
        '③ **直写面** —— `memoryCenterRevoke(id, note)`(单条撤回**直走** `revokeFact`,不借道 `undoCorrection`'
        '—— 借道要伪造一份 journal,而伪造会把「撤销**这一批**」的真流水覆盖掉,那一批从此撤不回来) + '
        '`memoryCenterSaveQuery(state)`(保存条件的**唯一出口**:条件口径在内核 `buildSpec`、摘要口径在内核 `specLine`,'
        '面板各拼一份就成了第二套口径;存储面复用 `evidence-query` 的 saved 表,不另开第二张表)。'
        '④ **saved 真源注入点** —— `_memoryCenterStateWithSaved(state)`:面板「保存的查询条件」读的是 `state.saved`,'
        '而保存的真源在宿主 `_evidenceSavedQueries`,两者此前**零同步** ⇒ 保存了却看不到、看不到却删不掉;'
        '本口浅拷贝注入(不改调用方对象),接在 `memoryCenterView` / `memoryCenterStep` 两处装配点。\n'
        '★ **面板侧 9 个 handler 全就位**(`row.repair.preview` / `row.detail` / `row.revoke` / `row.dispute` / '
        '`row.export` / `query.save` / `query.reset` / `saved.remove` / `saved.replay`),其中 `row.dispute` '
        '**如实报不可用** —— 事实账**没有**「争议」写面(`disputed` 在 `fact-state.js` 是**推导态**:指涉悬空 / 显式字段),'
        '本仓纪律是「拿不到就不装」,**不编一个假写入**;旧「手写 state」三形态(伪造 journal token / '
        '`st.spec = hit.spec` / 第二张表 `this._memoryCenterSaved`)全部清零。\n'
        '★ **定向验收(全部真跑)**:`tests/v3380_m4o8_center_actions.test.mjs`(**16 条**,宿主侧从 `index.js` '
        '真切片 + 真装载 `memory-center` / `evidence-query` / `correction-plan` / `fact-version` 四内核):'
        'A 声明面(九处声明各恰一处 / 9 handler 各恰一处且旧手写模式 0 处 / 内核声明面 == 面板提供面);'
        'B 六个出口真跑(保存 → 真源 1 条且同条件覆盖 `replaced` / 浅拷贝同步且调用方对象不被反写 / '
        '圈范围只取范围内未撤事实 / 未圈 ⇒ `ok:false` 且不退回全量 / 三态不同形(fixture 透传 · extractor-absent 具名) / '
        '撤回真落 + 幂等 `replayed` + **journal 未被覆盖** + 缺 id 具名);C 端到端(`face.saved` 与宿主真源同条 ⇒ '
        '零同步缺陷闭合 / 争议面块内零写调用);F 三条真源码破坏负控制(各带原版阳性对照) + G1 H5 判据纯度'
        '(三锚点在本档各恰 1 次、真源各恰中 1 次) + H1 版本锚 v3.338.0。'
        '宿主基线重建至 v3.338.0:实测 %(host_lines)d 行 / %(host_members)d 成员(ceiling %(ceiling)d 余量 400);'
        '死代码预算 71414 → 72714(实测 72314,净增 624 行宿主接线)。'
        '· 退出码三档:0 卫生 / 1 真缺陷 / 2 结构漂移(本仓扫描器契约;本节同款声明供 D9 核对)。'
        '★ **诚实边界**:真实 SillyTavern 宿主的 UI 点击流与真实模型问答**未跑**(面板 handler 以真装载宿主切片'
        '验证调用口径);全量 `npm test` 按纪律集中到第四期计划收口点跑一次(本版为定向复验),本版**全量待验**。\n') % T
cl = head + cl
io.open(CL, 'w', encoding='utf-8').write(cl)
print('CHANGELOG.md 已写 1 处（新顶节）')
