#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.341.0 文档真实性同步：PLAN.md / README.md / TODO.md / CHANGELOG.md 对齐磁盘真值。

真值（脚本内自读，不手抄）：版本 / 测试文件数 / 审计门禁数 / 宿主探针行数与成员数 / 上界。
★ 本版不重绑全量读数（doc_readings.json 仍停在 v3.328.0）：第四期计划收口前禁跑全量，
  故 README/PLAN 一律写「当前版本 v3.341.0 全量待验」。
★ D9 义务：CHANGELOG 顶节的「档名（N 条）」里的 N **必须等于磁盘 `^test(` 计数**，
  故条数由脚本现场数，不写死。
"""
import io
import json
import os
import re

ROOT = '/home/user/lonsha-memory-plugin/'


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
    # 当版专项套件的真实用例条数（D9 只认这个数）
    suite = 'tests/v3410_m4x2_chapter_compose.test.mjs'
    suite_src = io.open(ROOT + suite, encoding='utf-8').read()
    suite_n = len(re.findall(r'^test\(', suite_src, re.M))
    return {
        'ver': ver, 'tests': len(tests), 'audit_gated': len(audit_gated), 'audit_all': len(audit_all),
        'host_lines': base['readings']['total_lines'], 'host_members': base['readings']['member_count'],
        'ceiling': base['line_budget']['ceiling'], 'wc_l': base['readings']['total_lines'] - 1,
        'suite': suite, 'suite_n': suite_n,
    }


T = disk_truth()
assert T['ver'] == '3.341.0', '版本未抬到 3.341.0: %s' % T['ver']
assert T['suite_n'] >= 1, '当版套件读不到 test( 行'
print('磁盘真值: ver=%(ver)s tests=%(tests)d audit=%(audit_gated)d/%(audit_all)d '
      'host=%(host_lines)d/%(host_members)d suite=%(suite_n)d' % T)


def sub1(text, old, new, label):
    n = text.count(old)
    assert n == 1, '%s 锚点命中 %d 次(应为 1): %r' % (label, n, old[:70])
    return text.replace(old, new, 1)


# -------- PLAN.md
P = ROOT + 'PLAN.md'
plan = io.open(P, encoding='utf-8').read()
plan = sub1(plan,
    '拓展新功能九项 **M4-X1/X4 已交付**（v3.339.0 / v3.340.0），**M4-X2/X3/X5～X9 尚未开工**，下一刀 M4-X2。',
    '拓展新功能九项 **M4-X1/X2/X4 已交付**（v3.339.0 / v3.340.0 / v3.341.0），'
    '**M4-X3/X5～X9 尚未开工**，下一刀 M4-X3。',
    'PLAN 文首进度行')
OLD_HEAD = '> **当前执行状态（2026-10-16，v3.340.0）**'
i = plan.index(OLD_HEAD)
j = plan.index('\n', i)
new_status = ('> **当前执行状态（2026-10-16，v3.341.0）**：规划基线 `main@5691bfc`。本版是第四期'
              '**拓展九项第二项 M4-X2**（面向读者的章节回顾与年鉴成稿；P1 / L）实施点：既有 `story-annual.js` '
              '有三类产物 —— **词表读数**（`belletristic` 只判禁词，不生成也不改写文章）/ '
              '**草稿编辑**（`edit` 只收题 / 述 / 段白名单位）/ **过期检测**（`staleRefs` 指出对应段），'
              '但**没有一处回答「玩家回看某一章时该看什么」**：没有成篇的回顾、没有逐段证据位、'
              '没有作者版与玩家版之分、没有「只重建受影响的那几章」。本版两刀:'
              '**① 内核成稿面**（`SA_VERSION 2→3`；`chapterKey` / `sectionOf` 段身份 → '
              '`compose` 吃 `review` 产物出**可读编排**且**逐段带证据位**'
              '（`title`/`summary`/`event`/`change`/`unfinished`/`quote` 六类段，`evidenceRef` 指回原文；'
              '`evidenceBound` / `evidenceMissing` / `evidenceUndecided` **三条读数分开报**）→ '
              '`composeForPlayer` 玩家版（**不接作者版**，后续事实零泄漏且泄漏逐条具名）→ '
              '`rebuildAffected` 按章重建四格 `rebuilt`/`kept`/`gone`/`untouched` 且 `wholeBookRebuilt` 恒 `false`，'
              '判不了的如实具名 → `applyEdits` 对草稿与补丁**双向**过滤事实位（可机检形态）；导出面 31→45）；'
              '**② 宿主接线面**（六出口 `storyAnnualCompose`/`storyAnnualComposeForPlayer`/`storyAnnualRebuild`/'
              '`storyAnnualApplyEdits`/`storyAnnualDrafts`/`storyAnnualComposeLine` + 草稿册 `_annualDrafts` '
              '随聊天持久化 + `ARCHIVE_TOP_LEVEL_KEYS` / 携带豁免表 / `collectExport` / `restoreFromPayload` '
              '四处契约面 + 清空面 + 自检面「故事年鉴」诊断行）。'
              '**未调用真实模型只报结构成稿**（`source:\'structure-only\'` / `modelUsed:false` / `styleChecked:false`），'
              '过了模型且调用方回报 `styleOk` 才转 `polished`。'
              '专项套件 v3410 **%(suite_n)d 条全绿**（含 D1～D9 九条真源码破坏负控制 + F1 纯度 + F2 工具两向自证 + G1 锚点）。'
              '宿主基线 %(host_lines)d/%(host_members)d(ceiling %(ceiling)d 余量 400);'
              '`extra_js` 仍 **107**（无新模块）。上一项 M4-X4(v3.340.0,多轮追问)。'
              '本版 v3.341.0 未全量实跑，当前 v3.341.0 **全量待验**。') % T
plan = plan[:i] + new_status + plan[j:]
plan = sub1(plan, '| 版本 | **v3.340.0**（四源同源；本表原为 v3.266.0） |',
            '| 版本 | **v3.341.0**（四源同源；本表原为 v3.266.0） |', 'PLAN 版本行')
plan = sub1(plan, '| 门禁 | 在役面 **320 测试文件 / 61 个 audit 脚本**（磁盘 67）',
            '| 门禁 | 在役面 **%d 测试文件 / %d 个 audit 脚本**（磁盘 %d）'
            % (T['tests'], T['audit_gated'], T['audit_all']),
            'PLAN 门禁行')
plan = sub1(plan, '| 体量 | `index.js` **21042 行**(探针读数;`wc -l` 21041) / **768** 成员',
            '| 体量 | `index.js` **%(host_lines)d 行**(探针读数;`wc -l` %(wc_l)d) / **%(host_members)d** 成员' % T,
            'PLAN 体量行·当版读数')
plan = sub1(plan, 'v3.340.0 M4-X4 带消歧与条件继承的多轮追问后为 21042 / 768;',
            'v3.340.0 M4-X4 带消歧与条件继承的多轮追问后为 21042 / 768,'
            'v3.341.0 M4-X2 面向读者的章节回顾与年鉴成稿后为 %(host_lines)d / %(host_members)d;' % T,
            'PLAN 体量行·历史链')
plan = sub1(plan, '| ⬜ M4-X2 | 面向读者的章节回顾与年鉴成稿 |',
            '| ✅ M4-X2 | 面向读者的章节回顾与年鉴成稿 |', 'PLAN 勾选行 X2')
plan = sub1(plan,
    '| 编号 | 优化提升（M4-O1～O9 已交付） | 编号 | 拓展与新功能（M4-X1/X4 已交付 / M4-X2、X3、X5～X9 待实施） |',
    '| 编号 | 优化提升（M4-O1～O9 已交付） | 编号 | 拓展与新功能（M4-X1/X2/X4 已交付 / M4-X3、X5～X9 待实施） |',
    'PLAN 表头行')
plan = sub1(plan,
    '产品包B 的 M4-X1/X4 **均已交付**（v3.339.0 / v3.340.0）；产品包C 的 '
    '**M4-X2/X3/X5/X6/X7/X8/X9** **尚未开工**。**下一刀 = M4-X2**（面向读者的章节回顾与年鉴成稿，P1 / L）。',
    '产品包B 的 M4-X1/X4 **均已交付**（v3.339.0 / v3.340.0）；产品包C 的 **M4-X2 已交付**（v3.341.0），'
    '**M4-X3/X5/X6/X7/X8/X9** **尚未开工**。**下一刀 = M4-X3**（正史选择真正进入下一卷，P2 / L）。',
    'PLAN 优先级行·下一刀')
io.open(P, 'w', encoding='utf-8').write(plan)
print('PLAN.md 已写 8 处')

# -------- README.md
R = ROOT + 'README.md'
rd = io.open(R, encoding='utf-8').read()
rd = sub1(rd, '**当前版本**：`3.340.0`', '**当前版本**：`%s`' % T['ver'], 'README 当前版本')
rd = sub1(rd, '`npm test` 当前发现 **320 个测试文件**',
          '`npm test` 当前发现 **%d 个测试文件**' % T['tests'], 'README 在役面读数')
rd = sub1(rd, '当前版本 v3.340.0 **全量待验**',
          '当前版本 v%s **全量待验**' % T['ver'], 'README 待验标记')
rd = sub1(rd, 'npm test             # 全部用例：320 个测试文件（在役面，磁盘枚举）',
          'npm test             # 全部用例：%d 个测试文件（在役面，磁盘枚举）' % T['tests'], 'README 用法行')
rd = sub1(rd, '├── tests/                # 在役面：320 个测试文件 + 61 个审计脚本',
          '├── tests/                # 在役面：%d 个测试文件 + %d 个审计脚本' % (T['tests'], T['audit_gated']),
          'README 目录树行')
rd = sub1(rd, '**在役面**（磁盘枚举，不代表已实跑）：`tests/` 320 个测试文件',
          '**在役面**（磁盘枚举，不代表已实跑）：`tests/` %d 个测试文件' % T['tests'], 'README 在役面段')
io.open(R, 'w', encoding='utf-8').write(rd)
print('README.md 已写 6 处')

# -------- TODO.md
D = ROOT + 'TODO.md'
td = io.open(D, encoding='utf-8').read()
# 连带修：文首进度行前一版（v3.340.0）漏抬，停在「下一刀 M4-X4」——本版据实对齐。
td = sub1(td,
    '拓展新功能九项 **M4-X1 已交付**（v3.339.0），**M4-X2～X9 尚未开工**，**下一刀 M4-X4**'
    '（带消歧与条件继承的多轮记忆问答，第一包「查得准、导得进」，依赖 O2/O3/O4 已满足）。',
    '拓展新功能九项 **M4-X1/X2/X4 已交付**（v3.339.0 / v3.340.0 / v3.341.0），'
    '**M4-X3/X5～X9 尚未开工**，**下一刀 M4-X3**（正史选择真正进入下一卷，第二包「正史与证词」，'
    '依赖 O6 已满足）。',
    'TODO 文首进度行')
anchor = '> **最近更新：v3.340.0 ——'
assert td.count(anchor) == 1, 'TODO v3.340 锚点命中 %d 次' % td.count(anchor)
new_entry = ('> **最近更新：v3.341.0 —— 第四期拓展第二项 M4-X2:面向读者的章节回顾与年鉴成稿(P1 / L)**'
             '(第四期产品拓展包第二包「正史与证词」)。★ **修的是什么(修前实测,读码可复算)**:'
             '`story-annual.js` 已有四要素、证据引用、草稿编辑和过期检测,但三者**各自成立、合起来不成篇** —— '
             '`belletristic` 只是词表读数(**不生成、也不改写可读文章**);`edit` 只管白名单字段;'
             '`staleRefs` 只指段号。全仓零 `compose(` / `chapterKey` / `wholeBookRebuilt` 命中 ⇒ '
             '**玩家回看某一章时该看什么,没有任何一面回答**:没有成篇编排、没有逐段跳回原文的凭证、'
             '作者版与玩家版是同一种东西、改一章源文只能靠人自己想起来哪几章过期。'
             '★ **本刀(两刀:内核成稿面 / 宿主接线面,不建第二套摘要库)**:'
             '① **内核成稿面** —— `SA_VERSION 2→3`;段身份 `chapterKey(chapter,volume)` / `sectionOf(sec)`;'
             '`compose(rev,opts)` 吃 `review()` 产物出**可读编排**(六类段 `title`/`summary`/`event`/`change`/'
             '`unfinished`/`quote`),**每段带 `evidenceRef` 指回原文**(段落级 floor + ref + 指纹),'
             '`evidenceBound`/`evidenceMissing`/`evidenceUndecided` **三条读数分开报** —— '
             '把「没证据」与「没看证据面」压成一条,是本仓治过多次的错读数;'
             '`composeForPlayer` 玩家版走**同一**闸口,**不接作者版**;`rebuildAffected` 按章重建四格 '
             '`rebuilt`/`kept`/`gone`/`untouched` + `wholeBookRebuilt` 恒 `false` + 五种判不了逐条具名;'
             '`applyEdits(draft,patch)` 对草稿与补丁**双向**过滤事实位(`state`/`facts`/`floor`/`ref` 一律拒收并'
             '逐字理由 `draft-only`),证据位被抹**逐条具名**;`normalizeDrafts`/`draftLine`/`composeLine` 读出面;'
             '导出面 31→45。'
             '② **宿主接线面** —— `storyAnnualCompose`(成稿)/`storyAnnualComposeForPlayer`(玩家版,'
             '`_o9Gate()` 自动装配且**不覆盖调用方面**)/`storyAnnualRebuild`(按章重建,零写)/'
             '`storyAnnualApplyEdits`(编辑落笔)/`storyAnnualDrafts`(草稿册读写)/`storyAnnualComposeLine`(诊断行);'
             '草稿册 `_annualDrafts` 落 `ARCHIVE_TOP_LEVEL_KEYS` + 携带豁免表(理由:章节身份绑定当前会话的卷章结构,'
             '且它是**作品**不是剧情事实,跨对话带上会把上一部的回顾接进新故事) + `collectExport` + '
             '`restoreFromPayload` 四处契约面 + 清空面 + 自检面「故事年鉴」诊断行。'
             '★ **四条验收口径逐条落地(全部真跑读数)**:'
             '(a) **真有成稿** —— `compose(review(...))` 出 7 段,证据位逐段 '
             '`\'\',\'\',\'ch1#event@3\',\'ch1#event@9\',\'ch1#change@9\',\'ch1#unfinished@9\',\'ch1#quote@3\'`,'
             '`evidenceBound 5 / evidenceTotal 5`;'
             '(b) **未调用真实模型只报结构成稿** —— 四态实测:未给 `polish` ⇒ `structure-only` + `modelUsed:false` + '
             '`styleChecked:false` + 「未调用真实模型 ⇒ **不报文风通过**」;给了 `polish` 且文本真变**且**回调回报 '
             '`styleOk` ⇒ `polished`/`true`/`true`;给了 `polish` 真变但**未回报** ⇒ `polished`/`true`/`false` + '
             '「调用方**未**回报文风结论 ⇒ 不报通过」;文本无变化或抛错 ⇒ 退回 `structure-only` 且 `why` 含 `polish-no-change`;'
             '(c) **按章重建而非整本重写** —— `rebuilt=[\'p/v/1\'] / kept=[\'p/v/2\'] / gone=[\'p/v/3\'] / '
             'untouched=[\'p/v/9\']`,`wholeBookRebuilt:false`,`missing-chapter-unnamed`/`no-stale-read`/`no-drafts`/'
             '`stale-face-absent`/`draft-without-ref` 各自具名;'
             '(d) **改正文不篡改记忆可机检** —— `applyEdits({sections:[{evidenceRef:\'r1\'},{evidenceRef:\'r2\'}]},'
             '{sections:[{evidenceRef:\'r1\'}]})` ⇒ `dropped:[\'r2\']` / `evidenceIntact:false`;'
             '入参草稿自带 `state` ⇒ `rejected:[{key:\'state\',why:\'draft-only\','
             'note:\'入参草稿夹带的事实位不随编辑流传(事实不属于草稿)\'}]` 且 `state.state===undefined`。'
             '★ **定向复验**:`tests/v3410_m4x2_chapter_compose.test.mjs`(**%(suite_n)d 条**,真切片宿主 + 真装载内核):'
             'A1 宿主六出口与四处契约面各恰一处 + `organs` 逐字副本 + `extra_js` 107 / A2 内核面(版本 3 + 三张常量面 + '
             '九个新原语 + 既有九面一字不动 + 45 项冻结)/ A3 内核纯度(实现体不读宿主 `this`;零 '
             '`require(`/`fetch(`/`localStorage`/`indexedDB`/`XMLHttpRequest`;八个模块内标识不在宿主重复出现)/ '
             'B1～B7 七条真跑口径面 / C1～C5 五条宿主接线面(含内核缺席五出口同键降级)/ '
             'D1～D9 **九条真源码破坏负控制**(各带原版阳性对照)/ F1 H5 判据纯度(九个锚点在本档各 1 次)/ '
             'F2 H6 工具两向自证 / G1 六源同源 + 出生锚 `BORN_V`(下界,不锁当版)。'
             '宿主基线重建至 %(host_lines)d 行 / %(host_members)d 成员(ceiling %(ceiling)d 余量 400);'
             '`extra_js` 仍 **107**(本刀无新模块)。'
             '★ **诚实边界**:真实 SillyTavern 宿主的 UI 点击流与真实模型问答**未跑**(宿主新面以真装载宿主切片'
             '验证调用口径;「过了模型」一条用**注入的真函数**取证 —— 验的是判据认不认真模型通道,'
             '不是模型写得好不好);成稿文本的**文学质量不判**(那是人的事,本档只判结构化 + 逐段回源 + 读数如实);'
             '本版**全量待验**(全量 `npm test` 按纪律集中到第四期计划收口点跑一次)。\n') % T
td = td.replace(anchor, new_entry + anchor, 1)
io.open(D, 'w', encoding='utf-8').write(td)
print('TODO.md 已写 2 处')

# -------- CHANGELOG.md
CL = ROOT + 'CHANGELOG.md'
cl = io.open(CL, encoding='utf-8').read()
assert cl.startswith('## v3.340.0'), 'CHANGELOG 顶节不是 v3.340.0'
head = ('## v3.341.0\n'
        '**第四期拓展第二项 M4-X2:面向读者的章节回顾与年鉴成稿(P1 / L)**(第四期产品拓展包第二包「正史与证词」)。'
        '★ **修的是什么(修前实测,读码可复算)**:`story-annual.js` 已有四要素、证据引用、草稿编辑和过期检测'
        '(v3.327.0 起),但三者**各自成立、合起来不成篇** —— `belletristic` 只是词表读数'
        '(**不生成、也不改写可读文章**);`edit` 只管白名单字段;`staleRefs` 只指段号。'
        '全仓零 `compose(` / `chapterKey` / `wholeBookRebuilt` 命中 ⇒ **玩家回看某一章时该看什么,没有任何一面回答**:'
        '没有成篇编排、没有逐段跳回原文的凭证、作者版与玩家版是同一种东西(把它给玩家看就是剧透)、'
        '改一章源文只能靠人自己想起来哪几章过期。验收原文点名四格——'
        '逐段回源 / 未调用真实模型只报结构成稿 / 按章重建 / 改正文不篡改记忆——修前**一格都没有可机检形态**。\n'
        '★ **本刀(两刀:内核成稿面 / 宿主接线面,不建第二套摘要库、不只统计禁词)**:\n'
        '① **内核成稿面** —— `SA_VERSION = 3`;段身份 `chapterKey(chapter, volume)` / `sectionOf(sec)`;'
        '新常量面 `SECTION_KINDS`(`title`/`summary`/`event`/`change`/`unfinished`/`quote`)/ `SECTION_LABEL` / '
        '`COMPOSE_SOURCES`(`structure-only`/`polished`);`DRAFT_KIND` / `DRAFT_SECTION_FIELDS` 收窄草稿白名单;'
        '`compose(rev, opts)` 吃 `review()` 产物出**可读编排**,**每段带 `evidenceRef` 指回原文**'
        '(段落级 floor + ref + 指纹,不是整章一个号),'
        '`evidenceBound` / `evidenceMissing` / `evidenceUndecided` **三条读数分开报** —— '
        '把「没证据」与「没看证据面」压成一条,是本仓治过多次的错读数;'
        '`composeForPlayer(rev, opts)` 玩家版走**同一**闸口(`gatedVersions` / `spoilerGate` / `forPlayer`),'
        '**不接作者版**,后续事实零泄漏且泄漏逐条具名;'
        '`rebuildAffected(drafts, stale, opts)` 按章重建四格 `rebuilt`/`kept`/`gone`/`untouched` + '
        '`wholeBookRebuilt` 恒 `false`,五种判不了的(`missing-chapter-unnamed`/`no-stale-read`/`no-drafts`/'
        '`stale-face-absent`/`draft-without-ref`)逐条具名;'
        '`applyEdits(draft, patch)` 对草稿与补丁**双向**过滤事实位(`state`/`facts`/`floor`/`ref` 一律拒收并逐字理由 '
        '`draft-only`),证据位被抹**逐条具名**;`normalizeDrafts` / `draftLine` / `composeLine` 读出面;'
        '`selfCheck` 增成稿面不变式。导出面 31→45。\n'
        '② **宿主接线面** —— `storyAnnualCompose(rev, opts)`(成稿,模块缺席**同键降级**不是抛);'
        '`storyAnnualComposeForPlayer(rev, opts)`(玩家版,**自动装配** `_o9Gate()` 且**不覆盖调用方已给的面**,'
        '装配失败如实留痕);`storyAnnualRebuild(drafts, stale, opts)`(按章重建,零写;草稿册缺省取本会话已存的);'
        '`storyAnnualApplyEdits(draft, patch)`(编辑落笔,事实位一概不收);'
        '`storyAnnualDrafts(drafts)`(无参读 / 给入参归一化后**落进** `_annualDrafts` 随聊天持久化,重开可查);'
        '`storyAnnualComposeLine()`(诊断行,四态 / 三态不同形);'
        '`ARCHIVE_TOP_LEVEL_KEYS` 增 `\'annualDrafts\'`;`CARRYOVER_EXEMPT_KEYS` 增 `\'annualDrafts\'` 并写明行内理由'
        '(章节身份绑定当前会话的卷章结构,且它是**作品**不是剧情事实 —— 跨对话带上会把上一部的回顾接进新故事);'
        '`collectExport` 增 `annualDrafts: this._annualDrafts || null`;`restoreFromPayload` 增同名 `_imp` 还原分支;'
        '清空面增 `annualDrafts` 一档;自检面增「故事年鉴」行(三态可分:模块未加载 / 无草稿 / 有草稿报章数与段数)。\n'
        '★ **四条验收口径逐条落地(全部真跑读数,读码可复算)**:\n'
        '  (a) **真有成稿(不是只加按钮)** —— `compose(review(...))` 出 **7 段**,证据位逐段为 '
        '`\'\'`,`\'\'`,`\'ch1#event@3\'`,`\'ch1#event@9\'`,`\'ch1#change@9\'`,`\'ch1#unfinished@9\'`,`\'ch1#quote@3\'`;'
        '`evidenceBound = 5 / evidenceTotal = 5`,可读编排逐段回源 5/5;\n'
        '  (b) **未调用真实模型只能报结构成稿、不报文风通过** —— 四态实测:未给 `polish` ⇒ '
        '`source:structure-only` / `modelUsed:false` / `styleChecked:false` / `styleNote:"结构成稿:未调用真实模型 ⇒ '
        '**不报文风通过**"`;给了 `polish` 且文本真变**且**调用方回报 `styleOk:true` ⇒ `polished`/`true`/`true`;'
        '给了 `polish` 真变但**未回报** ⇒ `polished`/`true`/**`false`** + 「调用方**未**回报文风结论 ⇒ 不报通过」'
        '(★ 这是验收原文点名的那一格);文本无变化或抛错 ⇒ 退回 `structure-only` 且 `why` 含 `polish-no-change`;\n'
        '  (c) **按章重建而非整本重写** —— `rebuilt=[\'p/v/1\']` / `kept=[\'p/v/2\']` / `gone=[\'p/v/3\']` / '
        '`untouched=[\'p/v/9\']`,`wholeBookRebuilt:false`;判不了的各自具名;\n'
        '  (d) **改正文不篡改记忆(可机检形态而非承诺)** —— '
        '`applyEdits({sections:[{evidenceRef:\'r1\'},{evidenceRef:\'r2\'}]},{sections:[{evidenceRef:\'r1\'}]})` ⇒ '
        '`dropped:[\'r2\']` / `evidenceIntact:false`;入参草稿自带 `state` ⇒ '
        '`rejected:[{key:\'state\',why:\'draft-only\',note:\'入参草稿夹带的事实位不随编辑流传(事实不属于草稿)\'}]` '
        '且 `state.state === undefined`。\n'
        '★ **定向复验(全部真跑)**:`tests/v3410_m4x2_chapter_compose.test.mjs`(**%(suite_n)d 条**,'
        '宿主侧从 `index.js` 真切片 + 真装载 `story-annual` 内核):A1 宿主六出口与四处契约面各恰一处 + '
        '`organs` 逐字副本 + 自检面「故事年鉴」行 + `extra_js` 107;A2 内核面(`SA_VERSION 3` + 三张常量面 + '
        '九个新原语 + 既有九面一字不动 + 45 项冻结);A3 内核纯度(实现体不读宿主 `this`;零 '
        '`require(` / `fetch(` / `localStorage` / `indexedDB` / `XMLHttpRequest`;八个模块内标识不在宿主重复出现);'
        'B1 真成稿 7 段逐段带证据位 + 回源 5/5;B2 未调模型四态;B3 证据三态分开 + 无回顾与零段各自具名;'
        'B4 玩家版成稿(不接作者版 + 零泄漏 + 泄漏具名);B5 按章重建四格 + `wholeBookRebuilt` false + 五种判不了具名;'
        'B6 改正文不篡改记忆的双向过滤 + 证据位被抹逐条具名;B7 草稿册白名单 + 丢弃数 + 诊断行四态 / 三态不同形;'
        'C1 宿主成稿出口真方法体 + 真内核;C2 宿主草稿册落笔即持久化 + 读回 + 重建缺省取已存 + 诊断行报章数;'
        'C3 宿主编辑出口凭证进诊断行;C4 宿主玩家版闸自动装配 + 失败如实 + 不覆盖调用方面;'
        'C5 内核缺席五出口**同键降级**(不抛 / 不 `undefined`)+ 诊断行具名;'
        'D1～D9 **九条真源码破坏负控制**(各带原版阳性对照);F1 H5 判据纯度(九个锚点在本档各 1 次、真源各 1 次);'
        'F2 H6 工具两向自证;G1 六源同源 + 出生锚 `BORN_V`(下界口径,不锁当版)。'
        '宿主基线重建至 v3.341.0:实测 %(host_lines)d 行 / %(host_members)d 成员(ceiling %(ceiling)d 余量 400);'
        '`extra_js` 仍 107(本刀无新模块,故不动装载面)。'
        '· 退出码三档:0 卫生 / 1 真缺陷 / 2 结构漂移(本仓扫描器契约;本节同款声明供 D9 核对)。'
        '★ **诚实边界**:真实 SillyTavern 宿主的 UI 点击流与真实模型问答**未跑**(宿主新面以真装载宿主切片验证'
        '调用口径;「过了模型」一条用**注入的真函数**取证 —— 验的是判据认不认真模型通道,不是模型写得好不好);'
        '成稿文本的**文学质量不判**(那是人的事,本档只判结构化 + 逐段回源 + 读数如实);'
        '手机侧 R4-X3 的阅读编辑交互不在本仓;全量 `npm test` 按纪律集中到第四期计划收口点跑一次'
        '(本版为定向复验),本版**全量待验**。\n') % T
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
# 残留检查：四份文档里不得再有「上一版当版口径」的读数残留
assert '**当前版本**：`3.340.0`' not in rd2, 'README 仍有旧版本残留'
assert '当前版本 v3.340.0 **全量待验**' not in rd2, 'README 仍有旧待验残留'
print('写后自检通过：README / TODO / CHANGELOG / PLAN 四份当版读数齐')