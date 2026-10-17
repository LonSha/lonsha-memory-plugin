#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.342.0 抬版连带：宿主分诊基线重建（读数零手抄）。
纪律（与 bump3410_host_beast_rebind.py 同款）：
  · 先把旧基线整份备份到 /tmp/bak3420/，重建失败即保持原样、不写坏基线；
  · 行 / 成员 / 上界三个读数**全由脚本自读**，不手抄；
  · ceiling 只走「实测 + maxSlack」贴回；成员**仅在越界时**才抬并写进 history。
"""
import io
import json
import os
import subprocess
import sys
ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3420/'
BASE = ROOT + 'tests/audit/host_beast_baseline.json'
REASON = ('[v3.342.0] M4-X3「正史选择真正进入下一卷」宿主侧真实接线：'
          '内核 branch-canon.js 新增落卷面（ADOPT 三态 / UNMAPPED 三缺因 / adoptItemOf / adoptableItems / '
          'buildContinuePack / adoptionBrief / revokeGuard / adoptionLine / adoptProbeDeps / adoptProbePlan + '
          '两张标签与来源表，导出面 +14）；宿主 index.js 新增落卷出口 storyCanonAdoptPlan / storyCanonAdoption / '
          'storyCanonRevokeGuard / _volumeContinuationEntriesForGuard / storyCanonAdoptConfirm / storyCanonAdoptLine，'
          '落卷凭据 _canonAdoption 随聊天持久化（四处契约面 ARCHIVE_TOP_LEVEL_KEYS / 携带豁免表 / '
          'collectExport / restoreFromPayload）+ 清空面 + 自检面「支线正史」行落卷读数。'
          '全为活跃功能增长、非死代码回流。行上界按「实测 + slack」贴回；成员面在线内不抬。')
os.makedirs(BAK, exist_ok=True)
io.open(BAK + 'host_beast_baseline.json.pre3420', 'w', encoding='utf-8').write(
    io.open(BASE, encoding='utf-8').read())
before = json.loads(io.open(BASE, encoding='utf-8').read())
r = subprocess.run([sys.executable, ROOT + 'tools/_rebuild_host_beast.py', REASON, '--force'],
                   cwd=ROOT, capture_output=True, text=True, timeout=1800)
print(r.stdout[-2000:] if r.stdout else '')
if r.returncode != 0:
    sys.stderr.write(r.stderr[-2000:] if r.stderr else '')
    io.open(BASE, 'w', encoding='utf-8').write(
        io.open(BAK + 'host_beast_baseline.json.pre3420', encoding='utf-8').read())
    print('重建失败，基线已回滚原样')
    sys.exit(2)
d = json.loads(io.open(BASE, encoding='utf-8').read())
t = d['readings']['total_lines']
m = d['readings']['member_count']
print('实测 rebuilt: lines=%d members=%d' % (t, m))
idx = io.open(ROOT + 'index.js', encoding='utf-8').read()
recomputed = idx.count('\n') + (0 if idx.endswith('\n') else 1)
assert t == recomputed, '基线行数 %d != 真文件探针值 %d' % (t, recomputed)
lb = d['line_budget']
slack = lb['maxSlack']
mslack = lb['member_max_slack']
was_ceiling = lb['ceiling']
was_member = lb['member_ceiling']
new_ceiling = t + slack
assert t <= new_ceiling, '实测行数已越新上界，slack 设置有问题'
assert new_ceiling >= was_ceiling, '新上界 %d 低于旧上界 %d（本刀为增长，请核对）' % (new_ceiling, was_ceiling)
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
tail = json.loads(io.open(BASE, encoding='utf-8').read())['line_budget']
assert tail['history'][-1]['ceiling'] == tail['ceiling'], 'history 末条解释不了当前 ceiling'
assert tail['ceiling'] - t <= slack, '余量超 slack'
print('line_budget: ceiling %d -> %d (余量 %d) / member_ceiling %d (余量 %d)'
      % (was_ceiling, new_ceiling, new_ceiling - t, tail['member_ceiling'], tail['member_ceiling'] - m))