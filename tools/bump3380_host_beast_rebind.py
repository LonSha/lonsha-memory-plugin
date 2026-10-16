#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.338.0 抬版连带：宿主分诊基线重建（读数零手抄）。"""
import io
import json
import os
import subprocess
import sys
ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3380/'
BASE = ROOT + 'tests/audit/host_beast_baseline.json'
REASON = ('[v3.338.0] M4-O8 记忆控制中心处置类动作的生产方落地：'
          '宿主侧新增 _correctionOwners / _verifyCorrectionItem / applyCorrectionPlan / undoCorrection'
          '（纠错方案落笔与两路撤销）+ 面板取数口 correctionSourceFacts / correctionReextractFacts'
          '+ 单条撤回直写面 memoryCenterRevoke + 保存条件唯一出口 memoryCenterSaveQuery'
          '+ saved 真源注入点 _memoryCenterStateWithSaved；settings-ui 侧补齐 9 个 handler。'
          '全为活跃功能增长、非死代码回流。行上界按「实测 + slack」贴回；成员面在线内不抬。')
os.makedirs(BAK, exist_ok=True)
io.open(BAK + 'host_beast_baseline.json.pre3380', 'w', encoding='utf-8').write(io.open(BASE, encoding='utf-8').read())
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
io.open(BASE, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
print('line_budget: ceiling %d -> %d (余量 %d) / member_ceiling %d (余量 %d)'
      % (was_ceiling, new_ceiling, new_ceiling - t, lb['member_ceiling'], lb['member_ceiling'] - m))
print('DONE')
