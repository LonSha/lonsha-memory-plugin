#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.355.0 抬版连带：宿主分诊基线重建（读数零手抄）。
本版宿主侧增量（两个**新模块** ⇒ extra_js 117 -> 119）：
  · 新增 experience-rebuild.js（M6-O1 连续经历重建）
  · 新增 dual-time.js（M6-O5 双时间经历）
  · index.js 增两个取库口（_experienceRebuildLib / _dualTimeLib）、两个宿主出口
    （queryExperience 12 op / queryDualTime 8 op）、selfCheck 面板两行
  · memory-organs.js 的 WorldProgress 增 experiences / timeCoords 两子键
    （构造器 + export + import 三处成对）
新模块本体不进宿主基线（基线只量 index.js），故行数增长全为**活跃功能增长**、非死代码回流。
"""
import io
import json
import os
import subprocess
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3550/'
BASE = ROOT + 'tests/audit/host_beast_baseline.json'
REASON = ('[v3.355.0] 第六期批次 A 两项（M6-O1 连续经历重建 / M6-O5 双时间经历）的宿主接线：'
          '新增两个内核模块 experience-rebuild.js 与 dual-time.js（extra_js 117 -> 119），'
          'index.js 增两个取库口（_experienceRebuildLib / _dualTimeLib）、两个宿主出口'
          '（queryExperience 十二 op / queryDualTime 八 op，含 versionAt）、'
          'selfCheck 面板增「连续经历」「双时间」两行；'
          'memory-organs.js 的 WorldProgress 增 experiences / timeCoords 两子键'
          '（构造器 / export / import 三处成对登记，不登记即存盘即丢、读档即空）。'
          '本版增量为**活跃功能增长**、非死代码回流；新模块本体不进宿主基线（基线只量 index.js）。'
          '行上界按「实测 + slack」贴回。')

os.makedirs(BAK, exist_ok=True)
io.open(BAK + 'host_beast_baseline.json.pre3550', 'w', encoding='utf-8').write(
    io.open(BASE, encoding='utf-8').read())

r = subprocess.run([sys.executable, ROOT + 'tools/_rebuild_host_beast.py', REASON, '--force'],
                   cwd=ROOT, capture_output=True, text=True, timeout=900)
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

io.open(BASE, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=1) + '\n')
print('line_budget: ceiling %d -> %d (余量 %d) / member_ceiling %d (余量 %d)'
      % (was_ceiling, new_ceiling, new_ceiling - t, lb['member_ceiling'], lb['member_ceiling'] - m))
print('DONE')
