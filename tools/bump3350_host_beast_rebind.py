#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.335.0 抬版连带:宿主分诊基线重建(读数零手抄,模式沿用 v3.334.0 轮)。"""
import hashlib
import io
import json
import os
import subprocess
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3350/'
BASE_REL = 'tests/audit/host_beast_baseline.json'
BASE = ROOT + BASE_REL
REASON = ('[v3.335.0] M4-O6「年鉴、正史与旧事重现接入真实数据」宿主侧增量:'
          '真实供数派生层(唯一取数口 _o6RealOwners + 六面派生 _o6Chapters/_o6Summary/'
          '_o6Outcomes/_o6PastDetails/_o6KnownFacts/_o6ConfirmedFacts/_o6KnownEntities/_o6Quotes/'
          '_o6Chat + 出口 annualSources)+ 四个装配点改走派生(私有槽仍优先)。'
          '全为活跃功能增长、非死代码回流。行上界按「实测 + slack」贴回;成员面在线内不抬。')


def main():
    os.makedirs(BAK, exist_ok=True)
    old = io.open(BASE, encoding='utf-8').read()
    io.open(BAK + 'host_beast_baseline.json.pre3350', 'w', encoding='utf-8').write(old)
    r = subprocess.run([sys.executable, ROOT + 'tools/_rebuild_host_beast.py', REASON, '--force'],
                       cwd=ROOT, capture_output=True, text=True, timeout=600)
    print(r.stdout[-2000:] if r.stdout else '')
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-2000:] if r.stderr else '')
        print('重建失败,未继续(基线保持原样)')
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
    assert t <= new_ceiling, '实测不得越新上界'
    lb['ceiling'] = new_ceiling
    lb['note'] = REASON
    entry = {'ceiling': new_ceiling, 'reason': REASON}
    if m > was_member:
        lb['member_ceiling'] = m + mslack
        entry['member_ceiling'] = lb['member_ceiling']
        print('成员实测 %d 已越过上界 %d ⇒ 抬到 %d' % (m, was_member, lb['member_ceiling']))
    else:
        entry['member_ceiling'] = was_member
        print('★ 成员实测 %d 未越上界 %d ⇒ 按先例不抬' % (m, was_member))
    lb['history'].append(entry)
    io.open(BASE, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
    print('line_budget: ceiling %d → %d(余量 %d)/ member_ceiling %d(余量 %d)'
          % (was_ceiling, new_ceiling, new_ceiling - t, lb['member_ceiling'], lb['member_ceiling'] - m))
    print('DONE 基线已重建')


if __name__ == '__main__':
    main()