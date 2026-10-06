#!/usr/bin/env python3
# v3.288.0 文档收口：① CHANGELOG 节补「档自述读数」（tests/x.test.mjs（N 条））；
# ② 退出码行改回 D9 精确契约串；③ TODO 最近更新行抬到 v3.288.0（含当版自述）。
import pathlib
import re
import sys

ROOT = pathlib.Path('/home/user/lonsha-memory-plugin')
CH = ROOT / 'CHANGELOG.md'
TD = ROOT / 'TODO.md'

# ---------- 档自述读数：按磁盘真值生成，不手抄 ----------
def count_tests(rel):
    p = ROOT / rel
    if not p.exists():
        return None
    return len(re.findall(r'^test\(', p.read_text(encoding='utf-8'), re.M))

BAND = 'tests/v3288_plan_currency_xface.test.mjs'
n_band = count_tests(BAND)
if n_band is None:
    print('BAND-MISSING'); sys.exit(1)

ch = CH.read_text(encoding='utf-8')
lines = ch.split('\n')
# 定位 v3.288.0 节范围
try:
    start = next(i for i, l in enumerate(lines) if l.startswith('## v3.288.0'))
    end = next(i for i, l in enumerate(lines) if i > start and l.startswith('## '))
except StopIteration:
    print('SECTION-NOT-FOUND'); sys.exit(1)

# ① 退出码行 → D9 精确契约串
NEW_CC = ('- **退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移**'
          '（本门里 1 = 陈旧节无标记、已交付 O/X 项复活、双现行节；2 = PLAN/登记/版本源缺失）。')
cc_idx = [i for i in range(start, end) if lines[i].startswith('- **退出码三档')]
if len(cc_idx) != 1:
    print('CC-NOT-UNIQUE:', len(cc_idx)); sys.exit(1)
lines[cc_idx[0]] = NEW_CC

# ② 绝不跑全量 + 档自述（插在节末空行前）
end2 = next(i for i in range(start, end + 1) if i == end)
insert_at = end2
while insert_at - 1 > start and lines[insert_at - 1].strip() == '':
    insert_at -= 1

undated = [
    '- **判据套件（本档自述读数，核回磁盘）**：`' + BAND + '`（' + str(n_band) + ' 条），'
    + '逐条覆盖 P8 三态 / P4 纯度 / 事实面 / 锚点纯度 / 真源码破坏 / 当版锚点。',
    '- **绝不跑全量**：本门与它的套件都不执行 `npm test`（审计段跑全量会自指），'
    + '全量实跑集中到计划收口后一次。',
]
for l in undated:
    if l not in lines:
        lines.insert(insert_at, l)
        insert_at += 1
        end += 1

CH.write_text('\n'.join(lines), encoding='utf-8')
print('CHANGELOG: band claims=', n_band, 'lines now', len(lines))

# ---------- TODO 最近更新行 ----------
td = TD.read_text(encoding='utf-8')
td_lines = td.split('\n')
old_head = [i for i, l in enumerate(td_lines) if l.startswith('> **最近更新：v3.287.0**')]
if len(old_head) != 1:
    print('TODO-HEAD-NOT-UNIQUE:', len(old_head)); sys.exit(1)
i = old_head[0]
old = td_lines[i]
new = ('> **最近更新：v3.288.0** —— 计划陈旧口径门的**面补一类**：X 系列已交付项复活 + '
       '**判据纯度修正（两处漏判）**。新增 P8（已交付 X 项不得复活）+ 修正 P4（只认条目标题、'
       '交付事实按编号自己那一段读），套件 `' + BAND + '`（' + str(n_band) + ' 条）锚当版。')
td_lines[i] = new
# 原 v3.287.0 行降为历史留痕
td_lines.insert(i + 1, old.replace('> **最近更新：v3.287.0**', '> **最近更新：v3.287.0**（历史留痕，原当前行）'))
TD.write_text('\n'.join(td_lines), encoding='utf-8')
print('TODO: head ->', new[:60], '...')
print('TODO lines now', len(td_lines))