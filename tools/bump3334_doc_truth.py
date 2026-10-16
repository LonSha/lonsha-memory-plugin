#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.334.0 文档真实性同步：PLAN.md / README.md / TODO.md 对齐磁盘真值。

真值（脚本内自读，不手抄）：
  - 版本 3.334.0（index.js const VERSION）
  - 测试文件 314 / 审计门禁 61（磁盘 67）
  - index.js 探针 19443 行（wc -l 19442）/ 731 成员（host_beast_baseline.json）
判据对照（scan_doc_truthfulness.mjs D1/D2/D5/D6 + scan_version_guard.mjs V6/V7）：
  - README D1 当前版本行、D2 在役面读数行、D6 待验标记（当前版本 vX **全量待验**）
  - PLAN  D5 版本行/门禁行/体量行 extra_js、D6 待验标记（当前 vX **全量待验**）
  - TODO  V7「最近更新：v3.334.0」
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
        'wc_l': base['readings']['total_lines'] - 1,  # wc -l 数换行符；探针读数 = wc+1（同 v3.332 口径）
    }


T = disk_truth()
assert T['ver'] == '3.334.0', '版本未抬到 3.334.0: %s' % T['ver']
print('磁盘真值: ver=%(ver)s tests=%(tests)d audit=%(audit_gated)d/%(audit_all)d host=%(host_lines)d/%(host_members)d' % T)

changes = []


def sub1(text, old, new, label):
    n = text.count(old)
    assert n == 1, '%s 锚点命中 %d 次(应为 1): %r' % (label, n, old[:60])
    changes.append(label)
    return text.replace(old, new, 1)


# ---------- PLAN.md ----------
plan = io.open(PLAN, encoding='utf-8').read()

old_status = ('> **当前执行状态（2026-10-15，v3.332.0）**：规划基线 `main@0f2f7fd`。本版是第四期 **M4-O4**'
              '（异步查询接到真实问答与资料页）实施点:`queryAsync` 增 `onShard` 与尾片最终进度(`QUERY_VERSION` 2→3)、'
              '`memory-tools-api.js` 六能力(`queryEvidenceAsync`)+六态(`canceled` 与 empty/partial 都不同形)、'
              '宿主双出口 `queryEvidenceAsync(spec,opts)` / `askMemoryQuestionAsync(question,opts)`'
              '(taskId/shouldCancel/onProgress/shardRows,取消时 gaps 具名 kind:canceled);'
              '`selfCheck` statesComplete 写死 5 的自伤已修(对齐词表自身);v3305 旧口径抬升六能力/六态(13/13)。'
              '专项套件 v3332 14 条,与 v3330/v3331 合计定向 68/68,宿主基线 19412/730(ceiling 19812)。'
              '上一项 M4-O3(v3.331.0,事件解释面)专项 26 条。本版 v3.332.0 未全量实跑,当前 v3.332.0 **全量待验**。')
new_status = ('> **当前执行状态（2026-10-16，v3.334.0）**：规划基线 `main@0f2f7fd`。本版是第四期 **M4-O5**'
              '（长资料完整读取与可恢复解析）实施点:`lore-import.js::parseSource` 对超 `MAX_SOURCE_CHARS=400000` '
              '的资料直接 `slice` 截断后仍 `ok:true`(42 万字符尾部唯一事实静默丢弃,200 万字符同形,`planApply` 照常放行)—— '
              '本版恒带 `completeness{state,totalChars,readChars,truncated,nextCursor}`,截断 ⇒ `ok:false`+`why:[\'source-truncated\']`+`state:\'partial\'`;'
              '`planApply` 对 `partial` 源拒入(`source-incomplete`+已读/总量+续读游标);'
              '新增 `parseSourceWindow(raw,{range})` 窗口解析(段边界 `\\n\\n` 对齐,3000 章窗口流去重恰 3000,'
              '`sourceRef` 带全文件坐标 fileFrom/fileTo+行号偏移);'
              '宿主出口 `loreImportParseWindow`+窗口留痕+模块缺席同键降级(`window-unsupported`,`completeness:\'unknown\'` 不冒充「没读完」);'
              '不抬常量不引外库。专项套件 v3334 17 条,宿主基线 19443/731(ceiling 19843)。'
              '上一项 M4-O4(v3.332.0,异步查询接线)专项 14 条。本版 v3.334.0 未全量实跑,当前 v3.334.0 **全量待验**。')
plan = sub1(plan, old_status, new_status, 'PLAN 当前执行状态行')

plan = sub1(plan,
            '| 版本 | **v3.332.0**（四源同源；本表原为 v3.266.0） |',
            '| 版本 | **v3.334.0**（四源同源；本表原为 v3.266.0） |',
            'PLAN D5 版本行')

plan = sub1(plan,
            '在役面 **313 测试文件 / 61 个 audit 脚本**（磁盘 67）',
            '在役面 **%d 测试文件 / %d 个 audit 脚本**（磁盘 %d）' % (T['tests'], T['audit_gated'], T['audit_all']),
            'PLAN D5 门禁行')

plan = sub1(plan,
            '`index.js` **19244 行**(探针读数;`wc -l` 19243) / **728** 成员',
            '`index.js` **%(host_lines)d 行**(探针读数;`wc -l` %(wc_l)d) / **%(host_members)d** 成员' % T,
            'PLAN D5 体量行·当版读数')
plan = sub1(plan,
            'v3.331.0 M4-O3 宿主接线后为 19244 / 728;+ extra_js **106** 项',
            ('v3.331.0 M4-O3 宿主接线后为 19244 / 728,v3.332.0 M4-O4 异步出口后为 19412 / 730,'
             'v3.334.0 M4-O5 窗口解析出口后为 %(host_lines)d / %(host_members)d;+ extra_js **106** 项') % T,
            'PLAN D5 体量行·历史链')

io.open(PLAN, 'w', encoding='utf-8').write(plan)
print('PLAN.md 已写 %d 处' % 5)

# ---------- README.md ----------
rd = io.open(README, encoding='utf-8').read()
rd = sub1(rd, '**当前版本**：`3.332.0`（版本四源同步由 `tests/audit/scan_version_guard.mjs` 把守）',
          '**当前版本**：`%s`（版本四源同步由 `tests/audit/scan_version_guard.mjs` 把守）' % T['ver'],
          'README D1 当前版本')
rd = sub1(rd, '`npm test` 当前发现 **313 个测试文件**',
          '`npm test` 当前发现 **%d 个测试文件**' % T['tests'],
          'README D2 在役面')
rd = sub1(rd,
          '当前版本 v3.332.0 **全量待验**(未实跑;最近一次全量快照仍是 v3.328.0,见上段)。',
          '当前版本 v%s **全量待验**(未实跑;最近一次全量快照仍是 v3.328.0,见上段)。' % T['ver'],
          'README D6 待验标记')
io.open(README, 'w', encoding='utf-8').write(rd)
print('README.md 已写 3 处')

# ---------- TODO.md ----------
td = io.open(TODO, encoding='utf-8').read()
anchor = '> **最近更新：v3.332.0'
assert td.count(anchor) == 1, 'TODO v3.332 最近更新锚点命中 %d 次' % td.count(anchor)
new_entry = ('> **最近更新：v3.334.0 —— 第四期第五项 M4-O5:长资料完整读取与可恢复解析(P0 / L)**'
             '(第四期产品主线包A第三项)。★ **修的是什么(修前实测,双探针实锤)**:`lore-import.js::parseSource` '
             '对超 `MAX_SOURCE_CHARS=400000` 的资料直接 `slice` 截断 —— 42 万字符资料的尾部唯一事实被静默丢弃'
             '(`ok:true`+部分 items 被当完整输入),200 万字符同样只读前 40 万,且 `planApply` 对截断资料照常 `ok:true` 放行。'
             '★ **本刀(完整度面+窗口流,不抬常量不引外库)**:① `parseSource` 恒带 '
             '`completeness{state,totalChars,readChars,truncated,nextCursor}`,截断 ⇒ `ok:false`+`why:[\'source-truncated\']`+'
             '`state:\'partial\'`;② `planApply` 对 `partial` 源拒入(`reason:\'source-incomplete\'`+已读/总量+续读游标);'
             '③ 新增 `parseSourceWindow(raw,{range})` 窗口解析 —— 段边界 `\\n\\n` 对齐(修前行对齐实测把跨窗段切成'
             '「完整段+无题半段」,3000 章流去重后 3002 条;修后恰 3000),`sourceRef` 全文件坐标(fileFrom/fileTo+行号偏移),'
             '完整度独立核算(本窗读完≠全文件读完);④ 宿主出口 `loreImportParseWindow`+窗口留痕读数+模块缺席同键降级'
             '(`window-unsupported`,不冒充「没读完」)。★ **定向验收(全部真跑)**:`tests/v3334_m4o5_long_source_read.test.mjs`'
             '(**17 条**):A 截断拒读三态/B 窗口解析(段边界、全文件坐标、3000 章去重、尾窗 complete)/C 长流真跑'
             '(42 万+200 万字符首中尾唯一事实存活)/D 零写不抛/E 宿主接线与缺席降级/F 版本锚+N1~N3 真源码破坏负控制+Z1 工具两向自证。'
             '宿主基线重建至 19443 行/731 成员(ceiling 19812→19843,成员 753 在线内不抬)。'
             '★ **诚实边界**:真实 SillyTavern 宿主 UI 操作与真实模型问答未跑;本版**全量待验**。\n')
td = td.replace(anchor, new_entry + anchor, 1)
changes.append('TODO V7 最近更新')
io.open(TODO, 'w', encoding='utf-8').write(td)
print('TODO.md 已写 1 处')

print('\n共 %d 处:' % len(changes))
for c in changes:
    print('  +', c)
print('DONE')
