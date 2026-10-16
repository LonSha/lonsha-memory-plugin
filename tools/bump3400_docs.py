#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.340.0 文档真实性同步：PLAN.md / README.md / TODO.md / CHANGELOG.md 对齐磁盘真值。
真值（脚本内自读，不手抄）：版本 / 测试文件数 / 审计门禁数 / 宿主探针行数与成员数。
★ 本版不重绑全量读数（doc_readings.json 仍停在 v3.328.0）：第四期计划收口前禁跑全量，
  故 README/PLAN 一律写「当前版本 v3.340.0 全量待验」。
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
assert T['ver'] == '3.340.0', '版本未抬到 3.340.0: %s' % T['ver']
assert T['host_lines'] == T['probe_lines_recomputed'], '基线行数与真文件不一致'
print('磁盘真值: ver=%(ver)s tests=%(tests)d audit=%(audit_gated)d/%(audit_all)d host=%(host_lines)d/%(host_members)d' % T)
def sub1(text, old, new, label):
    n = text.count(old)
    assert n == 1, '%s 锚点命中 %d 次(应为 1): %r' % (label, n, old[:70])
    return text.replace(old, new, 1)
# -------- PLAN.md
P = os.path.join(ROOT, 'PLAN.md')
plan = io.open(P, encoding='utf-8').read()
plan = sub1(plan,
    '拓展新功能九项 **M4-X1 已交付**（v3.339.0），**M4-X2～X9 尚未开工**，下一刀 M4-X4。',
    '拓展新功能九项 **M4-X1/X4 已交付**（v3.339.0 / v3.340.0），**M4-X2/X3/X5～X9 尚未开工**，下一刀 M4-X2。',
    'PLAN 文首进度行')
OLD_HEAD = '> **当前执行状态（2026-10-16，v3.339.0）**'
i = plan.index(OLD_HEAD); j = plan.index('\n', i)
new_status = ('> **当前执行状态（2026-10-16，v3.340.0）**：规划基线 `main@5691bfc`。本版是第四期**拓展九项第四项 M4-X4**'
              '（带消歧与条件继承的多轮记忆问答；P1 / L）实施点：既有问答面 `evidence-query.js` 的 `planQuestion` 是**单问句规划**，'
              '**不接前问语义状态**——能问一句、不能追问，能记「未翻译」、不能继承；模糊代词与接续比较没有显式的「上一轮条件」可沿用。'
              '本版两刀:**① 新内核 `qa-thread.js`**（`QT_VERSION 1`；四态 `idle`/`open`/`awaiting-disambig`/`closed`；'
              '`advanceThread` 顺序**不可换**：身份对账（`chatKey`/`branchKey` 变即 `thread-identity-changed` 作废重建）→ 读字面标记 → '
              '定主体（显式人名优先 / 代词仅在**唯一**主体下继承 / ≥2 主体转消歧）→ 定条件（有锚折算 / 无锚继承或具名 `at-hint-unresolved` / '
              '切分支缺键具名 `branch-key-absent`）→ 落有界 trace；`resolveAmbiguity` 未选中即保持待决报 `unresolved`；'
              '`threadSpec` **只产 `actors`/`floorFrom` 两个既有 FILTERS 键**，**只存结构化查询约束与选中 ref，不存第二份答案事实**）；'
              '**② 宿主接线面**（`_qaThreadLib` 取库口 + 四个方法 `_qaThreadState`/`askMemoryQuestionFollowUp`'
              '（与单问句**同一** `planQuestion`，再走 `advanceThread`；`awaiting` 时**直接返回不跑查询**，避免把「指代不定」伪装成「查过了」）'
              '/`qaThreadResolve`/`qaThread`（只读读数，模块缺席同键降级 `version:0`）+ `ARCHIVE_TOP_LEVEL_KEYS` / 携带豁免表 / '
              '`collectExport` / `restoreFromPayload` 四处契约与持久化接线 + 自检面「追问线程」诊断行）。'
              '专项套件 v3400 **19 条全绿**（含 D1～D5 五条真源码破坏负控制 + F1 纯度 + F2 工具两向自证 + G1 锚点）。'
              '宿主基线 %(host_lines)d/%(host_members)d(ceiling %(ceiling)d 余量 400);`extra_js` 106→107(末位追加 `qa-thread.js`)。'
              '上一项 M4-X1(v3.339.0,可校订分层导入)。本版 v3.340.0 未全量实跑，当前 v3.340.0 **全量待验**。') % T
plan = plan[:i] + new_status + plan[j:]
plan = sub1(plan, '| 版本 | **v3.339.0**（四源同源；本表原为 v3.266.0） |',
            '| 版本 | **v3.340.0**（四源同源；本表原为 v3.266.0） |', 'PLAN 版本行')
plan = sub1(plan, '| 门禁 | 在役面 **319 测试文件 / 61 个 audit 脚本**（磁盘 67）',
            '| 门禁 | 在役面 **%d 测试文件 / %d 个 audit 脚本**（磁盘 %d）' % (T['tests'], T['audit_gated'], T['audit_all']),
            'PLAN 门禁行')
plan = sub1(plan, '| 体量 | `index.js` **20823 行**(探针读数;`wc -l` 20822) / **764** 成员',
            '| 体量 | `index.js` **%(host_lines)d 行**(探针读数;`wc -l` %(wc_l)d) / **%(host_members)d** 成员' % T,
            'PLAN 体量行·当版读数')
plan = sub1(plan, 'v3.339.0 M4-X1 可校订分层导入后为 20823 / 764;',
            'v3.339.0 M4-X1 可校订分层导入后为 20823 / 764,'
            'v3.340.0 M4-X4 带消歧与条件继承的多轮追问后为 %(host_lines)d / %(host_members)d;' % T,
            'PLAN 体量行·历史链')
plan = sub1(plan, '+ extra_js **106** 项', '+ extra_js **107** 项', 'PLAN 体量行·extra_js')
plan = sub1(plan,
    '产品包B 剩余 **M4-X4** 与产品包C 的 **M4-X2/X3/X5/X6/X7/X8/X9** **尚未开工**。**下一刀 = M4-X4**（带消歧与条件继承的多轮记忆问答，P1 / L）。',
    '产品包B 的 M4-X1/X4 **均已交付**（v3.339.0 / v3.340.0）；产品包C 的 **M4-X2/X3/X5/X6/X7/X8/X9** **尚未开工**。'
    '**下一刀 = M4-X2**（面向读者的章节回顾与年鉴成稿，P1 / L）。',
    'PLAN 优先级行·下一刀')
io.open(P, 'w', encoding='utf-8').write(plan)
print('PLAN.md 已写 7 处')
# -------- README.md
R = os.path.join(ROOT, 'README.md')
rd = io.open(R, encoding='utf-8').read()
rd = sub1(rd, '**当前版本**：`3.339.0`', '**当前版本**：`%s`' % T['ver'], 'README 当前版本')
rd = sub1(rd, '`npm test` 当前发现 **319 个测试文件**', '`npm test` 当前发现 **%d 个测试文件**' % T['tests'], 'README 在役面读数')
rd = sub1(rd, '当前版本 v3.339.0 **全量待验**', '当前版本 v%s **全量待验**' % T['ver'], 'README 待验标记')
rd = sub1(rd, 'npm test             # 全部用例：319 个测试文件（在役面，磁盘枚举）',
          'npm test             # 全部用例：%d 个测试文件（在役面，磁盘枚举）' % T['tests'], 'README 用法行')
rd = sub1(rd, '├── tests/                # 在役面：319 个测试文件 + 61 个审计脚本',
          '├── tests/                # 在役面：%d 个测试文件 + %d 个审计脚本' % (T['tests'], T['audit_gated']),
          'README 目录树行')
rd = sub1(rd, '**在役面**（磁盘枚举，不代表已实跑）：`tests/` 319 个测试文件',
          '**在役面**（磁盘枚举，不代表已实跑）：`tests/` %d 个测试文件' % T['tests'], 'README 在役面段')
io.open(R, 'w', encoding='utf-8').write(rd)
print('README.md 已写 6 处')
# -------- TODO.md
D = os.path.join(ROOT, 'TODO.md')
td = io.open(D, encoding='utf-8').read()
anchor = '> **最近更新：v3.339.0 ——'
assert td.count(anchor) == 1, 'TODO v3.339 锚点命中 %d 次' % td.count(anchor)
new_entry = ('> **最近更新：v3.340.0 —— 第四期拓展第四项 M4-X4:带消歧与条件继承的多轮记忆问答(P1 / L)**'
             '(第四期产品拓展包第一包「查得准、导得进」)。★ **修的是什么(修前实测,读码可复算)**:`evidence-query.js` 的 '
             '`planQuestion` 是**单问句规划**,**不接前问语义状态** —— `askMemoryQuestion` 只吃一句问句,'
             '**能问一句、不能追问**;M4-O2 已能「记下有未翻译」,**不能继承**;模糊代词(「她后来呢」)与接续比较(「与上次相比」)'
             '没有显式的「上一轮条件」可沿用,只能每句独立规划 ⇒ 追问要么问错主体、要么悄悄扩大范围。'
             '★ **本刀(两刀:新内核 `qa-thread.js` / 宿主接线面,不建第二套查询真源)**:'
             '① **新内核 `qa-thread.js`**(`QT_VERSION 1`;四态 `idle`/`open`/`awaiting-disambig`/`closed`;'
             '`advanceThread` 顺序**不可换** —— 身份对账(`chatKey`/`branchKey` 变即 `thread-identity-changed` **作废重建**)'
             '→ 读字面标记(`switch`/`branch`/`at`/`cmp`/`pronoun` 五表,**不引词典依赖以保重放一致**)'
             '→ 定主体(显式人名优先 / 代词仅在**唯一**主体下继承 / ≥2 主体转消歧)'
             '→ 定条件(有锚折算 / 无锚继承或具名 `at-hint-unresolved` / 切分支缺 `branchKey` 具名 `branch-key-absent`)'
             '→ 落有界 trace;`resolveAmbiguity` 未选中即保持待决报 `unresolved`;'
             '`threadSpec` **只产 `actors`/`floorFrom` 两个既有 FILTERS 键** —— **只存结构化查询约束与选中 ref,不存第二份答案事实**);'
             '② **宿主接线面** —— `_qaThreadLib`(取库口);`_qaThreadState`(线程懒初始化 '
             '`{version,state,chatKey,branchKey,subjects,candidates,atFloor,atHint,compareAxis,scope,turn,trace}`);'
             '`askMemoryQuestionFollowUp`(与单问句**同一** `planQuestion`,再走 `advanceThread`;'
             '`awaiting` 时**直接返回、不跑查询** —— 跑了就是把「指代不定」伪装成「查过了」,否则 `Object.assign` 合并 `p.spec`+`ts.spec` '
             '后走**同一个** `Q.query`/`Q.composeAnswer`);`qaThreadResolve`(消歧点选接回);`qaThread`(只读读数,模块缺席同键降级 `version:0`);'
             '`ARCHIVE_TOP_LEVEL_KEYS` 增 `qaThread` / 携带豁免表增 `qaThread`(跨对话继承会把 A 的追问答成 B 的)/ '
             '`collectExport` 增 `qaThread` 键 / `restoreFromPayload` 增还原分支 + 自检面「追问线程」诊断行。'
             '★ **连带修一处同族漂移**:`memory-organs.js` 侧的 `ARCHIVE_TOP_LEVEL_KEYS` **逐字副本**需与宿主同步 —— '
             '本版加法补进后两侧逐字相等(len 661 / md5 127993d2),并同步 `v3283` 常量副本登记值(649→661 / d5942cdc→127993d2)'
             '与 `v3202` 豁免表键数(15→16)。'
             '★ **定向验收(全部真跑)**:`tests/v3400_m4x4_qa_thread.test.mjs`(**19 条**,真切片宿主 + 真装载内核与答问内核):'
             'A1 宿主四面各恰一处 + 取库口 + 持久化/契约面在位 + `extra_js` 107 / A2 内核面(版本 + 四态含 `awaiting-disambig` + 六原语 + 自证不变式)/ '
             'B1 条件继承(唯一主体下代词继承)/ B2 消歧不静默(多主体 ⇒ `awaiting-disambig` + 候选 + 点选接回)/ '
             'B3 换人替换与切分支缺键具名 / B4 时点(有锚折算 / 无锚不猜且具名 / 无锚继承 / spec ⊆ FILTERS)/ '
             'B5 身份不越界(换会话作废重建)/ C1 宿主继承并**真落进 spec.actors** / C2 宿主待决闸(`plans.length === 0`)/ '
             'C3 宿主身份作废 / C4 读数与诊断行三态 / D1～D5 五条真源码破坏负控制(各带原版阳性对照)/ F1 判据纯度 + F2 工具两向自证 + G1 版本锚。'
             '宿主基线重建至 %(host_lines)d 行 / %(host_members)d 成员(ceiling %(ceiling)d 余量 400)。'
             '★ **诚实边界**:真实 SillyTavern 宿主的 UI 点击流与真实模型问答**未跑**'
             '(宿主新面以真装载宿主切片验证调用口径);本版**全量待验**。\n') % T
td = td.replace(anchor, new_entry + anchor, 1)
io.open(D, 'w', encoding='utf-8').write(td)
print('TODO.md 已写 1 处')
# -------- CHANGELOG.md
CL = os.path.join(ROOT, 'CHANGELOG.md')
cl = io.open(CL, encoding='utf-8').read()
assert cl.startswith('## v3.339.0'), 'CHANGELOG 顶节不是 v3.339.0'
head = ('## v3.340.0\n'
        '**第四期拓展第四项 M4-X4:带消歧与条件继承的多轮记忆问答(P1 / L)**(第四期产品拓展包第一包「查得准、导得进」)。'
        '★ **修的是什么(修前实测,读码可复算)**:`evidence-query.js` 的 `planQuestion` 是**单问句规划**,'
        '**不接前问语义状态** —— `askMemoryQuestion` 只吃一句问句,**能问一句、不能追问**;'
        'M4-O2(v3.330.0)已能给问句保留主题与多人物,**不能继承**前问已确认的主体/时点;'
        '模糊代词(「她后来呢」)与接续比较(「与上次相比」)没有显式的「上一轮条件」可沿用,只能每句独立规划'
        '⇒ 追问要么问错主体、要么悄悄扩大范围。\n'
        '★ **本刀(两刀:新内核 `qa-thread.js` / 宿主接线面,不建第二套查询真源)**:'
        '① **新内核 `qa-thread.js`** —— `QT_VERSION = 1`;`QT_STATES = [\'idle\',\'open\',\'awaiting-disambig\',\'closed\']`;'
        '有界常量 `QT_MAX_SUBJECTS 8` / `QT_MAX_TRACE 16` / `QT_MAX_CANDIDATES 8`;'
        '字面标记表 `QT_MARK_SWITCH` / `QT_MARK_BRANCH` / `QT_MARK_AT` / `QT_MARK_CMP` / `QT_MARK_PRONOUN`,'
        '时点锚只认 `QT_AT_FLOOR = /第\\s*([0-9０-９]{1,6})\\s*楼/`(全角数字归一)——**只用字面表、不引词典依赖**,以保「重放一致」;'
        '`normalizeThread` 是 thread 形状的**唯一**声明处(`drops` 如实记丢弃);'
        '`advanceThread` 顺序**不可换**:① 身份对账(`chatKey`/`branchKey` 变即 `thread-identity-changed` **作废重建**)'
        '→ ② 读标记 → ③ 定主体(显式人名优先 / 代词仅在**唯一**主体下继承 / ≥2 主体转消歧)'
        '→ ④ 定条件(有锚折算 / 无锚继承或具名 `at-hint-unresolved` / 切分支缺 `branchKey` 具名 `branch-key-absent`)'
        '→ ⑤ 落有界 trace;`resolveAmbiguity`(未选中候选 ⇒ 保持待决、报 `unresolved`);'
        '`threadSpec` **只产 `actors` / `floorFrom` 两个既有 FILTERS 键**(不造第二份条件真源);`describe` / `selfCheck`'
        '(不变式:`awaiting-disambig` 必须有 ≥2 候选)/ `threadLine`。'
        '**它不查任何东西、不定义过滤键**。\n'
        '② **宿主接线面** —— `_qaThreadLib()`(取库口,紧随 `_evidenceQueryLib`);`_qaThreadState()`(线程懒初始化 '
        '`{version:1,state:\'idle\',chatKey:\'\',branchKey:\'\',subjects:[],candidates:[],atFloor:null,atHint:\'\','
        'compareAxis:\'\',scope:{},turn:0,trace:[]}`);`askMemoryQuestionFollowUp(question, opts)`'
        '(与 `askMemoryQuestion` **逐字同参**调 `planQuestion`,再 `advanceThread`;**`awaiting === true` 时直接返回、不跑查询** —— '
        '跑了就是把「指代不定」伪装成「查过了」;否则 `Object.assign({}, p.spec, ts.spec)` 合并后走**同一个** '
        '`Q.query` / `Q.composeAnswer`, `gaps = composed.gaps ++ adv.gaps`);'
        '`qaThreadResolve(pick, opts)`(消歧点选接回);`qaThread()`(只读读数,模块缺席**同键降级** `version:0`);'
        '`ARCHIVE_TOP_LEVEL_KEYS` 增 `\'qaThread\'`(紧邻 v3.339.0 的 `\'loreImportLedger\'` 行);'
        '`CARRYOVER_EXEMPT_KEYS` 增 `\'qaThread\'` 并写明行内理由(追问条件绑定当前会话语境,跨对话继承会把 A 的追问答成 B 的);'
        '`collectExport` 增 `qaThread: this._qaThread || null`;`restoreFromPayload` 增同名 `_imp` 还原分支;'
        '自检面增「追问线程」行(三态可分:模块未加载 / 未开始追问 / 有 thread 报轮次与主体与待消歧候选)。\n'
        '★ **连带修一处同族漂移**:`memory-organs.js` 侧的 `ARCHIVE_TOP_LEVEL_KEYS` **逐字副本**须与宿主同步'
        '(v3.339.0 时两处同步,供 `v3264` 的 `nz()` 归一化比对)——本版加法补进后两侧逐字相等(len 661 / md5 127993d2),'
        '并同步 `v3283` 常量副本登记值(len 649→661 / md5 d5942cdc→127993d2)与 `v3202` 豁免表键数(15→16)。\n'
        '★ **定向验收(全部真跑)**:`tests/v3400_m4x4_qa_thread.test.mjs`(**19 条**,宿主侧从 `index.js` 真切片 + '
        '真装载 `qa-thread` 内核与 `evidence-query` 答问内核):A1 宿主四面各恰一处 + 取库口 + 持久化/契约面在位 + `extra_js` 107;'
        'A2 内核面(版本 + 四态含 `awaiting-disambig` + 六原语 + 自证不变式);B1 条件继承(唯一主体下代词继承);'
        'B2 消歧不静默(多主体 ⇒ `awaiting-disambig` + 候选 + 点选接回);B3 换人替换与切分支缺键具名;'
        'B4 时点(有锚折算 / 无锚不猜且具名 / 无锚继承 / `spec ⊆ FILTERS`);B5 身份不越界(换会话作废重建);'
        'C1 宿主继承并**真落进 `spec.actors`**;C2 宿主待决闸(`plans.length === 0`);C3 宿主身份作废;'
        'C4 读数与诊断行三态;D1～D5 五条真源码破坏负控制(各带原版阳性对照);F1 H5 判据纯度 + F2 H6 工具两向自证 + G1 版本锚 v3.340.0。'
        '宿主基线重建至 v3.340.0:实测 %(host_lines)d 行 / %(host_members)d 成员(ceiling %(ceiling)d 余量 400);'
        '`extra_js` 106→107。'
        '· 退出码三档:0 卫生 / 1 真缺陷 / 2 结构漂移(本仓扫描器契约;本节同款声明供 D9 核对)。'
        '★ **诚实边界**:真实 SillyTavern 宿主的 UI 点击流程与真实模型问答**未跑**(宿主新面以真装载宿主切片'
        '验证调用口径);M4-X4 验收中的「5 轮追问 / 两人比较 / 切分支」目前只在探针与测试夹具层面取证,'
        '尚未在真实宿主会话里走过完整旅程;全量 `npm test` 按纪律集中到第四期计划收口点跑一次(本版为定向复验),本版**全量待验**。\n') % T
cl = head + cl
io.open(CL, 'w', encoding='utf-8').write(cl)
print('CHANGELOG.md 已写 1 处（新顶节）')