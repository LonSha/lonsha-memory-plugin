#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.339.0 抬版连带：宿主分诊基线重建（读数零手抄）。"""
import io
import json
import os
import subprocess
import sys
ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3390/'
BASE = ROOT + 'tests/audit/host_beast_baseline.json'
REASON = ('[v3.339.0] M4-X1 可校订的分层导入与源资料更新：'
          '宿主侧新增 _loreImportOwners（落笔 owner 唯一装配点：前情写面 + 事实读面 + 幂等面）/ '
          '_loreImportLedgerState（导入账懒初始化，只存幂等键与人工决定，不存整篇资料）/ '
          'loreImportOverride（人工校订叠加，转发内核 applyOverrides）/ '
          'loreImportConfirmMapping（同名映射确认回填，不静默合并同名异人）/ '
          'async loreImportApply（四步顺序不可换：叠校订出计划 → 只落选中段 → 写前情不写事实账 → 落盘回读）/ '
          'loreImportLedger（导入账读数，重开可查落点）；内核 lore-import.js 增人工校订三态与三原语。'
          '全为活跃功能增长、非死代码回流。行上界按「实测 + slack」贴回；成员面在线内不抬。')
os.makedirs(BAK, exist_ok=True)
io.open(BAK + 'host_beast_baseline.json.pre3390', 'w', encoding='utf-8').write(io.open(BASE, encoding='utf-8').read())
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
