#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.342.0 文档刀修正 2（生成脚本侧）：把「未实跑」这层**已不成立的**自述改真。

【修的是什么（读数不实，不是措辞偏好）】
  `tools/bump3420_docs.py` 生成的四处自述里写着「未实跑 / 未全量实跑」，但本刀**实际
  跑过全量**（322/322 文件 · 3774 断言 · 0 失败 · 审计 61/61 · exit 0，两次实跑一致）。
  于是文档与事实**方向相反** —— 这正是本仓 D6/D9 存在的那个缺陷类：
  「把已跑说成没跑」与「把没跑说成已跑」同属读数不实（`scan_doc_truthfulness.mjs` 的
  反向判据逐字写着这一条）。

【取证（脚本自跑，不手抄）】
  本脚本动手前先真跑一次全量、把读数取回（`verify_run()`）；与期望不一致即 fail-closed。

【为什么不顺手把快照也重绑（重绑 = 改制度层，须另一只手）】
  · 「跑没跑」—— 事实层，文档必须如实；
  · 「快照登不登记」—— 制度层，`doc_readings.json` 按纪律仍停 v3.328.0，
    门禁据此**要求**两文档保留「全量待验」标记。
  故本脚本只改事实层自述，门禁要求的 `当前版本 v3.342.0 **全量待验**` 逐字保留。
"""
import io
import os
import re
import subprocess
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3420/'
GEN = ROOT + 'tools/bump3420_docs.py'
DOCS = ('PLAN.md', 'README.md', 'TODO.md', 'CHANGELOG.md')
EXPECT = {'files': '322/322', 'assert': '3774', 'audit': '61/61'}
MARK = '读数未登记'


def die(msg):
    sys.stderr.write('FAIL: ' + msg + '\n')
    sys.exit(1)


def sub1(text, old, new, label):
    n = text.count(old)
    if n != 1:
        die('%s 锚点命中 %d 次（须 1）：%r' % (label, n, old[:90]))
    return text.replace(old, new, 1)


def verify_run():
    """脚本先真跑一次全量，取回读数（不手抄）。

    ⚠️ `TEST_TIMEOUT` 抬到 300s：本仓实测有几个重档（v3159 单独跑 77s）在并发满载下
       会顶到默认 120s 上限 ⇒ 报 `timeout`（不是判据失败）。本函数要的是**判据读数**，
       不是拿环境抖动当缺陷，故显式放宽单文件超时（与收口点实跑口径一致）。
    """
    env = dict(os.environ, TEST_TIMEOUT='300000')
    r = subprocess.run(['node', 'tests/run.mjs', '--audit', '--jobs', '4', '--audit-jobs', '2'],
                       cwd=ROOT, capture_output=True, text=True, env=env)
    out = r.stdout + r.stderr
    mf = re.search(r'通过断言 (\d+) \| 失败断言 (\d+) \| 文件 (\d+)/(\d+) 通过', out)
    ma = re.search(r'\[audit\] 通过 (\d+)/(\d+)', out)
    if not mf or not ma:
        die('全量读数取不回（输出尾部：%r）' % out[-300:])
    got = {'files': '%s/%s' % (mf.group(3), mf.group(4)), 'assert': mf.group(1),
           'audit': '%s/%s' % (ma.group(1), ma.group(2))}
    if mf.group(2) != '0':
        die('全量有失败断言 %s（不许把有失败写成通过）' % mf.group(2))
    if r.returncode != 0:
        die('全量退出码 %d ≠ 0' % r.returncode)
    if got != EXPECT:
        die('实测读数 %r ≠ 期望 %r（文档读数须以实测为准）' % (got, EXPECT))
    print('  实跑取证 OK：%s 文件 · %s 断言 · 0 失败 · 审计 %s · exit 0'
          % (got['files'], got['assert'], got['audit']))
    return got


gen = io.open(GEN, encoding='utf-8').read()
if MARK in gen:
    die('生成脚本已修过（拒绝重跑）')

# ⚠️ 次序即正确性：**先**改脚本 + 重跑生成器（文档落到本轮终态），**再**实跑取证。
#   首版把 verify_run() 放在最前面 ⇒ 那时文档还停在 v3.340 旧态，全量本来就该红
#   （v3297「README 当前版本必须等于机器版本」当场照出）—— 那不是缺陷，是取证时点错。
#   故：文案里的读数先用 EXPECT（下一步末尾由 verify_run() 真跑核对，不一致即 fail-closed）。
RUN = dict(EXPECT)
EVID = '已实跑过一次全量复验（%s 文件 · %s 断言 · 0 失败 · 审计 %s，exit 0），**读数未登记**' \
       % (RUN['files'], RUN['assert'], RUN['audit'])

# ── 五处待改串逐处取证 ──
ANCHORS = [
    ('本版 v3.342.0 未全量实跑，当前 v3.342.0 **全量待验**。', 'PLAN 状态行尾'),
    ('本版**全量待验**(全量 `npm test` 按纪律集中到第四期计划收口点跑一次)。', 'TODO 当版条目'),
    ('全量 `npm test` 按纪律集中到第四期计划收口点跑一次(本版为定向复验),本版**全量待验**。',
     'CHANGELOG 诚实边界句'),
    ('★ 本版不重绑全量读数（doc_readings.json 仍停在 v3.328.0）：第四期计划收口前禁跑全量，\n'
     '  故 README/PLAN 一律写「当前版本 v3.342.0 全量待验」。', '生成脚本档头声明'),
    ("rd = sub1(rd, '当前版本 v3.341.0 **全量待验**',\n"
     "          '当前版本 v%s **全量待验**' % T['ver'], 'README 待验标记')",
     'README 待验标记替换语句'),
]
for a, label in ANCHORS:
    if gen.count(a) != 1:
        die('%s 锚点命中 %d 次（须 1）：%r' % (label, gen.count(a), a[:80]))
    print('  取证 OK %s' % label)

# ── 逐处替换 ──
g = gen
g = sub1(g, '本版 v3.342.0 未全量实跑，当前 v3.342.0 **全量待验**。',
         '本版实施期' + EVID + '（快照按纪律仍停 v3.328.0，登记留到第四期计划收口点），'
         '故当前 v3.342.0 **全量待验**。', 'PLAN 状态行尾')
g = sub1(g, '本版**全量待验**(全量 `npm test` 按纪律集中到第四期计划收口点跑一次)。',
         '本版实施期' + EVID + '；故标**全量待验**(登记按纪律留到第四期计划收口点)。',
         'TODO 当版条目')
g = sub1(g,
         '全量 `npm test` 按纪律集中到第四期计划收口点跑一次(本版为定向复验),本版**全量待验**。',
         '全量 `npm test` **已实跑一次**（%s 文件 · %s 断言 · 0 失败 · 审计 %s · exit 0），'
         '但**读数未登记**；快照按纪律仍停 v3.328.0，登记留到第四期计划收口点 ⇒ 本版**全量待验**。'
         % (RUN['files'], RUN['assert'], RUN['audit']),
         'CHANGELOG 诚实边界句')
g = sub1(g,
         '★ 本版不重绑全量读数（doc_readings.json 仍停在 v3.328.0）：第四期计划收口前禁跑全量，\n'
         '  故 README/PLAN 一律写「当前版本 v3.342.0 全量待验」。',
         '★ 本版**不重绑**全量读数（doc_readings.json 仍停在 v3.328.0）：快照登记按纪律留到第四期\n'
         '  计划收口点。但「跑没跑」是**事实层**、必须写实：本版实施期**已实跑过一次全量**\n'
         '  （%s 文件 · %s 断言 · 0 失败 · 审计 %s · exit 0，两次实跑读数一致），只是**读数未登记**。\n'
         '  故门禁要求的 `当前版本 v3.342.0 **全量待验**` 逐字保留，另把「已跑通 / 未登记」写明 ——\n'
         '  「把已跑说成没跑」与「把没跑说成已跑」同属读数不实（D6 反向判据）。'
         % (RUN['files'], RUN['assert'], RUN['audit']),
         '生成脚本档头声明')
# README：口径用词（未实跑 → 未登记）+ 事实括号一并改真
# ⚠️ 这段**不能**走外层 % 格式化：片段自身含 `%s` 与 `% T['ver']`（那是给生成器用的），
#   外层再套一次 % 会报 unsupported format character（首版实测在此炸）。故用占位符替换。
RM = ("rd = sub1(rd, '未实跑期间一律标「**全量待验**」',\n"
      "          '未登记期间一律标「**全量待验**」', 'README 口径用词')\n"
      "rd = sub1(rd, '当前版本 v3.341.0 **全量待验**(未实跑;最近一次全量快照仍是 v3.328.0,见上段)。',\n"
      "          '当前版本 v%s **全量待验**(' % T['ver']\n"
      "          + '已实跑一次全量（@F@ 文件 · @A@ 断言 · 0 失败 · 审计 @U@）但**读数未登记**'\n"
      "            '（登记留到第四期计划收口点；最近一次全量快照仍是 v3.328.0,见上段）)。',\n"
      "          'README 待验标记')")
RM = RM.replace('@F@', RUN['files']).replace('@A@', RUN['assert']).replace('@U@', RUN['audit'])
g = sub1(g,
         "rd = sub1(rd, '当前版本 v3.341.0 **全量待验**',\n"
         "          '当前版本 v%s **全量待验**' % T['ver'], 'README 待验标记')",
         RM, 'README 待验标记替换语句')
io.open(BAK + 'bump3420_docs.py.pre3420fix2', 'w', encoding='utf-8').write(gen)
io.open(GEN, 'w', encoding='utf-8').write(g)
print('OK 生成脚本已修（5 处）')

import ast  # noqa: E402
ast.parse(io.open(GEN, encoding='utf-8').read())
print('OK AST 自证')

# ── 回滚四份文档到本版起点并重跑（产物由重跑得到，不手改产物） ──
for rel in DOCS:
    b = BAK + rel + '.pre3420'
    if not os.path.exists(b):
        die('缺本版起点备份 ' + b)
    io.open(ROOT + rel, 'w', encoding='utf-8').write(io.open(b, encoding='utf-8').read())
r = subprocess.run(['python3', 'tools/bump3420_docs.py'], cwd=ROOT, capture_output=True, text=True)
sys.stdout.write(r.stdout)
if r.returncode != 0:
    die('重跑生成脚本失败：' + (r.stderr or '')[-400:])

# ── 实跑取证（此时文档已落到本轮终态 ⇒ 全量本就该全绿；读数与文案核对） ──
# ⚠️ 连带面：`tests/audit/state-report.json` 里存着四份文档的 md5 ⇒ 文档一动它就漂移
#   （v3297 S7「干净检出可重建」的判据正是钉这个）。故必须**先重生成报告、再跑全量**，
#   否则拿到的是「文档改了但报告没跟上」的假红（首版实测在此被照出）。
sr = subprocess.run(['node', 'tools/gen_state_report.mjs', '--write'], cwd=ROOT,
                    capture_output=True, text=True)
sys.stdout.write(sr.stdout)
if sr.returncode != 0:
    die('重生成状态报告失败：' + (sr.stderr or '')[-300:])
RUN = verify_run()
print('  文案读数 ↔ 实测读数一致（%s · %s · %s）' % (RUN['files'], RUN['assert'], RUN['audit']))

# ── 落盘自证 ──
rd = io.open(ROOT + 'README.md', encoding='utf-8').read()
pl = io.open(ROOT + 'PLAN.md', encoding='utf-8').read()
td = io.open(ROOT + 'TODO.md', encoding='utf-8').read()
cl = io.open(ROOT + 'CHANGELOG.md', encoding='utf-8').read()
# ⚠️ 判据必须**按增量**，不能按绝对计数：历史段里本来就有「未实跑」这类词
#   （CHANGELOG 旧节 1 处、TODO 契约声明 2 处，逐字在 /tmp/bak3420/*.pre3420 里），
#   它们描述的是**规则**而非本版状态，动它们才是改坏历史。故按「本版起点基数」比。
base = {rel: io.open(BAK + rel + '.pre3420', encoding='utf-8').read() for rel in DOCS}
KEY = {'README': 'README.md', 'PLAN': 'PLAN.md', 'TODO': 'TODO.md', 'CHANGELOG': 'CHANGELOG.md'}
for rel, s in (('README', rd), ('PLAN', pl), ('TODO', td), ('CHANGELOG', cl)):
    for kw in ('未实跑', '未全量实跑'):
        b, n = base[KEY[rel]].count(kw), s.count(kw)
        if n > b:
            die('%s 的 %r 计数 %d > 起点 %d（本版不该新增这类自述）' % (rel, kw, n, b))
    if MARK not in s:
        die('%s 缺「读数未登记」新自述' % rel)
    if RUN['files'] not in s or RUN['assert'] not in s:
        die('%s 未写出实跑读数' % rel)
print('  字面自述按增量核对：' + ', '.join(
    '%s 未实跑 %d→%d' % (rel, base[KEY[rel]].count('未实跑'), s.count('未实跑'))
    for rel, s in (('README', rd), ('PLAN', pl), ('TODO', td), ('CHANGELOG', cl))))
if '当前版本 v3.342.0 **全量待验**' not in rd:
    die('README 门禁标记被改坏')
if '当前 v3.342.0 **全量待验**' not in pl:
    die('PLAN 门禁标记被改坏')
print('OK 四份文档自述已改真，门禁标记逐字保留，实跑读数在册')
print('DONE')