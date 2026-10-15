#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.331.0 抬版连带：宿主基线 reason 归位（账要算清，不是「顺手刷绿」）。

为什么必须重写 reason：上一步沿用 v3.330.0 的重建脚本，读数是新的（measured_at
已 v3.331.0、ceiling 已按实测 + slack 贴回），但 `note`/`history` 里写的仍是
**上一版的账目**（M4-O1 + M4-O2 那 192 行）。本版真实增量是 M4-O3 的宿主部分：
解释面外送（两向键面）、键空间桥（从因果链 node.kind 派生缩写）、裸 engine 容灾。
账目与读数不同源 = 本仓 D9 同族（自述读数必须核回实现）。
"""
import io
import json
import sys

P = '/home/user/lonsha-memory-plugin/tests/audit/host_beast_baseline.json'
REASON = ('[v3.331.0] M4-O3「回答从行拼接变成有据的事件解释」宿主侧增量：'
          '① 解释面外送 —— 在场与缺席**两向**同时补 readings/covered/dropped/dedup/'
          'events/keyPoints/explain 七格（恒定键面是「下游按键断言不必猜」的前提，'
          '只补一侧会当场打红 v3322 G1）；'
          '② 键空间桥 _qaCausalEdges —— 行的 ref 是 `<账id>:<键>`、因果链节点是 '
          '`<缩写>:<id>`，同一事实两种拼法，缩写**从因果链自己的 node.kind 派生**'
          '（不另立对照表，否则第二份真源会漂移）；只交**已确认**边，推测边一律不外送；'
          '③ 裸 engine 容灾 —— 夹具切片无该方法时降级为「没拿到边」，不得外抛。'
          '全为活跃功能增长、非死代码回流。行上界按「实测 + slack」贴回；'
          '成员面 728 <= 753 仍在线内，按先例不抬。')

d = json.load(io.open(P, encoding='utf-8'))
lb = d['line_budget']
t = d['readings']['total_lines']
slack = lb['maxSlack']
old_note = lb.get('note', '')
old_ceiling = lb['ceiling']
new_ceiling = t + slack
if False:
    print('[skip] reason 已是当版账目')
    sys.exit(0)
assert t <= new_ceiling, '实测不得越新上界'
lb['ceiling'] = new_ceiling
lb['note'] = REASON
assert isinstance(lb.get('history'), list), 'history 形状不对'
lb['history'] = [h for h in lb['history'] if h.get('version') != '3.331.0']
lb['history'].append({
    'version': '3.331.0',
    'ceiling': new_ceiling,
    'member_ceiling': lb.get('member_ceiling'),
    'reason': REASON
})
io.open(P, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=2) + '\n')
print('reason 归位到 v3.331.0；ceiling %d → %d（实测 %d + slack %d）'
      % (old_ceiling, new_ceiling, t, slack))