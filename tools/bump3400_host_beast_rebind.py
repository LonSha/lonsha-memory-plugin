#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.340.0 抬版连带：宿主分诊基线重建（读数零手抄）。"""
import io
import json
import os
import subprocess
import sys
ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3400/'
BASE = ROOT + 'tests/audit/host_beast_baseline.json'
REASON = ('[v3.340.0] M4-X4「带消歧与条件继承的多轮记忆问答」宿主侧真实接线：'
          '新增内核模块 qa-thread.js（对话状态 + 消歧 + 条件继承；只存结构化查询约束与选中 ref，不存第二份答案事实）；'
          '宿主 index.js 新增取库口 _qaThreadLib 与四个方法 _qaThreadState（追问线程懒初始化）/ '
          'askMemoryQuestionFollowUp（与单问句同一 planQuestion，再走内核 advanceThread；'
          'awaiting 时直接返回不跑查询，避免把「指代不定」伪装成「查过了」）/ qaThreadResolve（消歧点选接回）/ '
          'qaThread（只读读数，模块缺席同键降级 version:0），并补 ARCHIVE_TOP_LEVEL_KEYS / CARRYOVER 豁免表 / '
          'collectExport / restoreFromPayload 四处契约与持久化接线 + 自检面「追问线程」诊断行。'
          '全为活跃功能增长、非死代码回流。行上界按「实测 + slack」贴回；成员面在线内不抬。')
os.makedirs(BAK, exist_ok=True)
io.open(BAK + 'host_beast_baseline.json.pre3400', 'w', encoding='utf-8').write(io.open(BASE, encoding='utf-8').read())
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