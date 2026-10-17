#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.342.0 文档刀修正（生成脚本侧，产物由重跑得到，不手改产物）。

【修的是什么（读码可复算，不是审美偏好）】
  `tools/bump3420_docs.py` 的 CHANGELOG 顶节里，**四处**段落分隔写成了
  `;\\n'`（Python 源码里是两个反斜杠 ⇒ 输出的是**字面 `\\n` 两字符**），
  而同节其余段落分隔一律写成 `;\\n'` 的单反斜杠形态（真换行）。
  实测后果：产出的 `CHANGELOG.md` 顶节有 **4 处**把段落写成了同一行里的
  `...可接集 0 条;\n  (b) **落卷**...`（字面反斜杠 n），四步闭环 (a)/(b)/(c)/(d)
  与「定向复验」段的换行全部丢失，读者看到的是 `;\\n` 这种转义残渣。
  实测读数：`CHANGELOG.md` 里字面 `\\n` 计数 30 = 修正前 26（历史段既有）
  + **本刀节新增 4**（全部落在顶节同一行的四个位置上）。

【为什么必须改脚本而不是改 CHANGELOG.md】
  本仓纪律是「补丁脚本是唯一真源，产物可重建」。手改 CHANGELOG.md 会让脚本与产物
  失同步：下一次重建就把修掉的缺陷原样带回来。故：**改脚本 ⇒ 回滚四份文档到本版
  起点 ⇒ 重跑生成脚本 ⇒ 逐项自检**。

【本仓同款留痕（不是我一家踩）】
  历史段自己记过这条：v3.268.0 的「工具面留痕」逐字写着「补丁脚本首版把换行写成
  `\\n` 两字符（heredoc 会展开反斜杠）」；v3.340.0 段也留过「锚点值不再等于真源码行，
  四处恒 0」的同类教训。故本脚本的判据不是「看着顺眼」，而是**可复算的字面计数**。
"""
import io
import os
import subprocess
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3420/'
GEN = ROOT + 'tools/bump3420_docs.py'
BS = chr(92)                      # 单个反斜杠
DOUBLE = BS + BS + "n'"           # 源码形态：两个反斜杠 + n + 单引号（输出字面 \n）
SINGLE = BS + "n'"                # 目标形态：一个反斜杠 + n + 单引号（输出真换行）
DOCS = ('PLAN.md', 'README.md', 'TODO.md', 'CHANGELOG.md')


def die(msg):
    sys.stderr.write('FAIL: ' + msg + '\n')
    sys.exit(1)


# ── 0. 前置：本脚本只跑一次（幂等自证） ──
gen = io.open(GEN, encoding='utf-8').read()
if DOUBLE not in gen:
    die('生成脚本里已无字面 \\n 转义（可能已修过，拒绝重跑）')

# ── 1. 实测取证：四处错形态必须恰中 4 次（多一处少一处都说明形态变了） ──
n_double = gen.count(DOUBLE)
if n_double != 4:
    die('生成脚本里 %r 命中 %d 次（本刀实测应为 4 处）：形态已变，须重新取证' % (DOUBLE, n_double))
# 取证逐处位置（可复算留痕）
for i, line in enumerate(gen.split('\n'), 1):
    if DOUBLE in line:
        print('  错形态在生成脚本第 %d 行：%s' % (i, line.strip()[:66]))

# ── 2. 改脚本：四处错形态 ⇒ 正确形态（只改转义，文案一字不动） ──
gen2 = gen.replace(DOUBLE, SINGLE)
if gen2.count(DOUBLE) != 0:
    die('替换后仍有残留')
# 判据必须**无歧义**：`\\n'` 里含 `\n'` 作为子串 ⇒ 按 `\n'` 计数恒不守恒（首版在此
# 误判，实测 15→15）。改用「双反斜杠+n 清零 + 总反斜杠数恰少 4 + 长度恰少 4」三条：
if gen2.count(BS + BS + 'n') != 0:
    die('替换后仍有 %r 残留' % (BS + BS + 'n'))
if gen2.count(BS) != gen.count(BS) - 4:
    die('反斜杠总数不守恒：前 %d 后 %d（应恰少 4）' % (gen.count(BS), gen2.count(BS)))
if len(gen2) != len(gen) - 4:
    die('长度不守恒：前 %d 后 %d（应恰少 4，即只删了四个转义符）' % (len(gen), len(gen2)))
io.open(BAK + 'bump3420_docs.py.pre3420fix', 'w', encoding='utf-8').write(gen)
io.open(GEN, 'w', encoding='utf-8').write(gen2)
print('OK 生成脚本已修（4 处转义）')

# ── 3. 语法自证：脚本必须仍可解析 ──
import ast
ast.parse(io.open(GEN, encoding='utf-8').read())
print('OK AST 自证通过')

# ── 4. 回滚四份文档到本版起点（脚本要求前态，否则拒绝跑） ──
for rel in DOCS:
    b = BAK + rel + '.pre3420'
    if not os.path.exists(b):
        die('缺本版起点备份 %s（没有它就无法「重建」而只能「手改产物」）' % b)
    io.open(ROOT + rel, 'w', encoding='utf-8').write(io.open(b, encoding='utf-8').read())
print('OK 四份文档已回滚到 v3.341.0 起点')

# 起点字数留痕：字面 \n 的「历史基数」（本刀节应为 0 增量）
base_lit = {rel: io.open(BAK + rel + '.pre3420', encoding='utf-8').read().count(BS + 'n') for rel in DOCS}
print('  起点字面 \\n 基数（历史段既有）：' + ', '.join('%s=%d' % (k, v) for k, v in base_lit.items()))

# ── 5. 重跑生成脚本（产物由重跑得到） ──
r = subprocess.run(['python3', 'tools/bump3420_docs.py'], cwd=ROOT, capture_output=True, text=True)
sys.stdout.write(r.stdout)
if r.returncode != 0:
    die('重跑生成脚本失败：' + (r.stderr or '')[-500:])

# ── 6. 落盘自检：本刀节的字面 \n 增量必须为 0（即缺陷真消除） ──
after_lit = {rel: io.open(ROOT + rel, encoding='utf-8').read().count(BS + 'n') for rel in DOCS}
for rel in DOCS:
    delta = after_lit[rel] - base_lit[rel]
    if delta != 0:
        die('%s 字面 \\n 增量 %d（本刀节应为 0）：缺陷未消除' % (rel, delta))
    print('  %-12s 字面 \\n %d → %d（增量 0）' % (rel, base_lit[rel], after_lit[rel]))

# 正向自证：四步闭环四段必须**各自成行**（真换行），且顺序为 a→b→c→d
cl = io.open(ROOT + 'CHANGELOG.md', encoding='utf-8').read()
head = cl.split('\n## v3.341.0')[0]
lines = head.split('\n')
order = [l.strip()[:4] for l in lines if l.strip().startswith(('(a) ', '(b) ', '(c) ', '(d) '))]
if len(order) != 4:
    die('四段未各自成行（实测 %d 行：%r）' % (len(order), order))
if [o[:3] for o in order] != ['(a)', '(b)', '(c)', '(d)']:
    die('四段顺序不对：%r' % order)
print('OK 四步闭环四段各自成行且顺序 (a)(b)(c)(d)')
print('OK 顶节行数 %d（前态 7 行，修正后段间真换行 ⇒ 11 行）' % len(lines))
print('DONE')
