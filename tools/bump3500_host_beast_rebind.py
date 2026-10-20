#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.350.0 抬版连带：宿主分诊基线重建（读数零手抄）。

本版宿主侧增量（全是既有模块内的接线，**无新模块** ⇒ extra_js 仍 113）：
  · index.js `askMemoryQuestionFollowUp` 增 `opts.clear` 下传与 `cleared` / `clearAxes` 回送
    （缺件降级路径同键）；
  · `qaThread` 读数增 `cleared` / `clearAxes` 两格（重开可查「这一场清过哪些条件」）；
  · `loreCrosscheck` 增来源覆盖下传（`chatCoverage`），供 M5-O3 的 unchecked 判定。
"""
import io
import json
import os
import subprocess
import sys
ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3500/'
BASE = ROOT + 'tests/audit/host_beast_baseline.json'
REASON = ('[v3.350.0] 第五期第一批四项 + 手机 R5-O9 委托口的宿主接线：'
          'index.js 的 askMemoryQuestionFollowUp 增 opts.clear 下传与 cleared/clearAxes 回送'
          '（缺件降级路径同键，少一格会与「清除没发生」同形）、qaThread 读数增同两格、'
          'loreCrosscheck 增来源覆盖下传（chatCoverage）供 unchecked 判定。'
          '本版无新模块（extra_js 仍 113），全为活跃功能增长、非死代码回流。'
          '行上界按「实测 + slack」贴回；成员面在线内不抬。')
os.makedirs(BAK, exist_ok=True)
io.open(BAK + 'host_beast_baseline.json.pre3500', 'w', encoding='utf-8').write(io.open(BASE, encoding='utf-8').read())
r = subprocess.run([sys.executable, ROOT + 'tools/_rebuild_host_beast.py', REASON, '--force'],
                   cwd=ROOT, capture_output=True, text=True, timeout=600)
print(r.stdout[-2000:] if r.stdout else '')
if r.returncode != 0:
    sys.stderr.write(r.stderr[-2000:] if r.stderr else '')
    print('重建失败，基线保持原样')
    sys.exit(2)
d = json.loads(io.open(BASE, encoding='utf-8').read())
t = d['readings']['total_lines']
m = d['readings']['member_count']
print('实测 rebuilt: lines=%d members=%d' % (t, m))
lb = d['line_budget']
slack = lb['maxSlack']
mslack = lb['member_max_slack']
was_ceiling = lb['ceiling']
was_member = lb['member_ceiling']
new_ceiling = t + slack
assert t <= new_ceiling
lb['ceiling'] = new_ceiling
lb['note'] = REASON
entry = {'ceiling': new_ceiling, 'reason': REASON}
if m > was_member:
    lb['member_ceiling'] = m + mslack
    entry['member_ceiling'] = lb['member_ceiling']
    print('成员实测 %d 已越上界 %d ⇒ 抬到 %d' % (m, was_member, lb['member_ceiling']))
else:
    entry['member_ceiling'] = was_member
    print('成员实测 %d 未越上界 %d ⇒ 按先例不抬' % (m, was_member))
lb['history'].append(entry)
# ★ 缩进必须与真源（`tools/_rebuild_host_beast.py` 的 `indent=1`）一致：
#   写成 2 会让整个文件逐行重排（6000+ 行假 diff），而判据只读键值 ——
#   那属于「看起来没坏但把仓库搅了」的形态（本仓治理过的同类）。
io.open(BASE, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=1) + '\n')
print('line_budget: ceiling %d -> %d (余量 %d) / member_ceiling %d (余量 %d)'
      % (was_ceiling, new_ceiling, new_ceiling - t, lb['member_ceiling'], lb['member_ceiling'] - m))
print('DONE')