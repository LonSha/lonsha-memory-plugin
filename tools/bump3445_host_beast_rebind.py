#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.345.0 host_beast 基线重建(承接 tools/bump3440_host_beast_rebind.py 同款纪律):

  · readings 一律走 `tools/_rebuild_host_beast.py`(读数零手抄,由探针生成);
  · ceiling 只走「实测 + maxSlack」贴回;
  · 成员**仅在越界时**才抬并写进 history;未越界则如实记旧值。
"""
import io
import json
import os
import subprocess
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
BASE = ROOT + 'tests/audit/host_beast_baseline.json'
BAK = '/tmp/bak3445/'

REASON = (
    '[v3.345.0] M4-X7「旧事重现进入真实生成且由玩家控频」宿主侧真实接线:'
    '内核 return-gate.js(生命周期三通道 preview/shown/used 分列、冷却只认 shown·used、'
    '控频强度档 POLICY off/hint-only/inject、重复轰炸闸 REPEAT_WINDOW、呈现偏好 PREFERENCE、'
    'gate 闸序即优先级 + build·render·line·selfCheck 八项自证,导出面 38);'
    '宿主 index.js 新增取库口 _returnGateLib 与五出口 _returnGateCandidates / returnGateAdmit / '
    'returnGateMark / returnGatePrefer / _returnGateLine + 自检面「控频闸」行;'
    '候选缺省取数回落 fated-recall 的 suggest(),给不出如实报 no-fated,不编候选。'
    '★ 本面是只读控频闸:零顶层落盘面,状态经已持久化的 worldProg.returnGate 跨会话携带'
    '(本版把它挂进 memory-organs.js 的 constructor/export/import 三面)。'
    '全为活跃功能增长、非死代码回流。行上界按「实测 + slack」贴回。'
)

# ---------- 1 先跑真探针与重建工具 ----------
os.makedirs(BAK, exist_ok=True)
io.open(BAK + 'host_beast_baseline.json.pre3445', 'w', encoding='utf-8').write(
    io.open(BASE, encoding='utf-8').read())

r = subprocess.run([sys.executable, ROOT + 'tools/_rebuild_host_beast.py', REASON, '--force'],
                   cwd=ROOT, capture_output=True, text=True, timeout=300)
print(r.stdout.strip()[-400:])
if r.returncode != 0:
    io.open(BASE, 'w', encoding='utf-8').write(
        io.open(BAK + 'host_beast_baseline.json.pre3445', encoding='utf-8').read())
    sys.stderr.write(r.stderr)
    raise SystemExit('rebuild failed, 已回滚: %d' % r.returncode)

# ---------- 2 line_budget 抬升 ----------
base = json.loads(io.open(BASE, encoding='utf-8').read())
lb = base['line_budget']
t = base['readings']['total_lines']
m = base['readings']['member_count']
slack = lb['maxSlack']
mslack = lb['member_max_slack']

was_ceiling = lb['ceiling']
was_member = lb['member_ceiling']
new_ceiling = t + slack
assert t <= new_ceiling, '实测行数已越新上界,slack 设置有问题'
assert new_ceiling >= was_ceiling, '新上界 %d 低于旧上界 %d(本刀为增长,请核对)' % (new_ceiling, was_ceiling)
lb['ceiling'] = new_ceiling

entry = {'ceiling': new_ceiling, 'reason': REASON}
if m > was_member:
    lb['member_ceiling'] = m + mslack
    entry['member_ceiling'] = lb['member_ceiling']
    print('成员实测 %d 已越上界 %d ⇒ 抬到 %d' % (m, was_member, lb['member_ceiling']))
else:
    entry['member_ceiling'] = was_member
    print('成员实测 %d 在线内(上界 %d)⇒ 不抬' % (m, was_member))

lb['note'] = REASON
lb['member_note'] = lb.get('member_note', '')
hist = lb['history']
hist.append(entry)

# 断言链(与 3440 同款)
assert hist[-1]['ceiling'] == lb['ceiling'], 'history 末条解释不了当前 ceiling'
assert lb['ceiling'] - t <= slack, '余量超 slack'
assert base['readings']['member_count'] <= lb['member_ceiling'], '成员越上界'
assert lb['member_ceiling'] == hist[-1]['member_ceiling'], '成员上界须与 history 末条相等'

io.open(BASE, 'w', encoding='utf-8').write(json.dumps(base, ensure_ascii=False, indent=1) + '\n')
print('line_budget: ceiling %d -> %d (余量 %d) / member_ceiling %d -> %d (余量 %d)' % (
    was_ceiling, lb['ceiling'], lb['ceiling'] - t,
    was_member, lb['member_ceiling'], lb['member_ceiling'] - m))
print('measured_at', base['measured_at'])
print('readings', json.dumps(base['readings'], ensure_ascii=False))