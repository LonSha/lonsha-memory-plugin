#!/usr/bin/env python3
"""v3.426.0 宿主巨兽基线重建（读数零手抄：全部从探针输出直接落盘）。

为什么必须重建（实测读数，逐条可复算）：
  本版给 engine-diagnostic-lines.js 的 `_worldlineState` 新增「当前纪元自动推进」
  （epochAdvance 段，+63/-4 行），该成员从 208 行继续增长。
  基线是「读数锁当版」形态（不是永久契约）：功能真增长时必然推它，故走重建而不手改数字。

不动的面（探针复核，不是猜）：
  · entry_lines 与 readings.total_lines 一致 ⇒ 行上界 ceiling 不动；
  · member_count 与 member_ceiling 一致（余量仍在 maxSlack 内）⇒ 不动。
  两者都由下面的脚本按实测值判断，不在这里写死。
"""
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
probe = json.loads(subprocess.run(
    ['node', os.path.join(ROOT, 'tests', 'audit', 'host_beast_probe.cjs')],
    cwd=ROOT, capture_output=True, text=True, check=True).stdout)

base_path = os.path.join(ROOT, 'tests', 'audit', 'host_beast_baseline.json')
with open(base_path, 'r', encoding='utf-8') as f:
    base = json.load(f)

VER = 'v3.426.0'
prev_ver = base.get('measured_at', '')
old = base['readings']
t = probe['entry_lines']
surface = probe['surface_lines']
top40 = probe['biggest_members'][:40]
top5_lines = sum(m['lines'] for m in top40[:5])
top40_lines = sum(m['lines'] for m in top40)
classified = sum(d['lines'] for d in probe['domains'] if d['domain'] != '（未归类）')
unclassified = sum(d['lines'] for d in probe['domains'] if d['domain'] == '（未归类）')

# ★ 占比分母必须用**合并面**（surface_lines）：TOP40 成员大多住在外提模块，
#   用入口行数当分母会算出 >100% 的荒唐读数（v3.425.0 踩过，被 A3「占比可复算」抓红）。
readings = {
    'total_lines': t,
    'surface_lines': surface,
    'member_count': probe['member_count'],
    'duplicate_member_names': len(probe['duplicate_member_names']),
    'top5_lines': top5_lines,
    'top5_pct': round(top5_lines * 100.0 / surface, 1),
    'top40_lines': top40_lines,
    'top40_pct': round(top40_lines * 100.0 / surface, 1),
    'prefix_rule_coverage_lines': classified,
    'prefix_rule_coverage_pct': round(classified * 100.0 / surface, 1),
    'unclassified_lines': unclassified,
    'seam_distinct_modules': probe['seam_modules']['distinct_modules'],
    'seam_reference_sites': probe['seam_modules']['reference_sites'],
    'seam_call_shape_sites': probe['seam_modules']['call_shape_sites'],
    'members_over_80_lines': probe['split_candidates']['total_over_threshold'],
    'low_coupling_members': probe['split_candidates']['low_coupling_non_lifecycle'],
    'high_coupling_members': probe['split_candidates']['high_coupling_non_lifecycle'],
}

REASON = (
    '[v3.426.0] 仿真自纠（世界线跳跃卡端到端真跑打出来的两处缺陷）：'
    '① engine-diagnostic-lines.js 的 _worldlineState 新增「当前纪元自动推进」段 —— '
    '卡作者只登记 worldlineJumps、不填 worldlineStartFloor（v3.425.0 文档推荐口径）时，'
    '用当前楼层（opts.floor > _currentFloor > currentStoryFloor()）+ jumps 表走内核 epochAt '
    '反推当前纪元；含四条纪律（手工配置优先 / 拿不到楼层不猜 / 无 jumps 不推进 / '
    '冲突记因不夺权）与读数 epochAdvance。该成员因此继续增长。'
    '② worldline-memory.js 的 relationOf 新增「证据不对称 ⇒ unknown」一支'
    '（粗线标不得冒充细纪元）。两条都是活跃功能增长，非死代码回流。'
)

base['readings'] = readings
base['domains'] = probe['domains']
base['biggest_members_top40'] = top40
base['split_candidates'] = probe['split_candidates']
base['total_lines'] = t
base['member_count'] = probe['member_count']
base['measured_at'] = VER

# ---- 行上界 / 成员上界：既有判据是「读数 <= 上界 且 余量 <= slack」----
# ★ 自纠：首版把这条写成「余量 < slack 就抬上界」，判据方向反了 ——
#   slack 的含义是「上界与实测脱节不得超过 slack」，余量**小**才是常态；
#   余量还有 377（<= 400）就该如实记「不抬」，抬上去反而让上界与实测脱节。
#   既有判据两条（v3232 C 与 v3257 C）都要求当前值 == 最后一条 history，
#   故 history 每条都必须写全 ceiling/member_ceiling，不能只写抬抬的那几条。
lb = base['line_budget']
ceiling = lb['ceiling']
member_ceiling = lb['member_ceiling']
max_slack = lb.get('maxSlack', 400)
member_slack = lb.get('member_max_slack', 30)
# ★ 判据方向（逐字读 v3232 C2 / v3257 C 得来的，不是猜）：
#   ① idxLines <= ceiling           超上界 ⇒ 必须抬；
#   ② ceiling - idxLines <= maxSlack 余量**超过** slack ⇒ 上界与实测脱节过远 ⇒ 重新贴合（往回收）。
#   余量充足（<= slack）⇒ 如实记「不抬」。首版把这条写成「余量 < slack 就抬」，方向反了。
raise_ceiling = (t > ceiling) or ((ceiling - t) > max_slack)
raise_member = (probe['member_count'] > member_ceiling) or ((member_ceiling - probe['member_count']) > member_slack)
new_ceiling = (t + max_slack) if raise_ceiling else ceiling
new_member_ceiling = (probe['member_count'] + member_slack) if raise_member else member_ceiling
entry = {
    'ceiling': new_ceiling,
    'member_ceiling': new_member_ceiling,
    'milestone_version': VER,
    'reason': (
        '[v3.426.0] _worldlineState 新增「当前纪元自动推进」段（epochAdvance，四条纪律 + 新读数），'
        'relationOf 新增「证据不对称 ⇒ unknown」一支。入口 index.js %d 行、成员数 %d；'
        '行上界与成员上界%s（余量 %d / %d）。合并面 %d 行，TOP5 占 %.1f%%、TOP40 占 %.1f%%。'
        % (t, probe['member_count'],
           ('**均上抬**（余量触顶）' if (raise_ceiling or raise_member) else '**均不抬**（仍在 slack 内）'),
           new_ceiling - t, new_member_ceiling - probe['member_count'],
           surface, readings['top5_pct'], readings['top40_pct'])
    ),
}
lb['ceiling'] = new_ceiling
lb['member_ceiling'] = new_member_ceiling
# ★ 既有判据（v3266 :402 / v3261 :424）：`note` 必须**逐字等于**最后一条 history 的 reason
#   —— 「防理由与数脱节」。所以 note 不能是手写的旧版说明，必须跟着本条登记一起换。
lb['note'] = entry['reason']
lb.setdefault('history', []).append(entry)

base.setdefault('rebuilds', {})[VER] = {
    'reason': REASON,
    'readings': readings,
    'unchanged': [
        '生命周期接线面不变',
        '本版只量不拆：未拆任何宿主巨兽成员',
    ],
    'not_done': '本版只修世界线纪元推进与证据不对称判定，未拆任何宿主巨兽成员',
    'delta_from': prev_ver,
    'delta': {
        'total_lines': t - old['total_lines'],
        'surface_lines': surface - (old.get('surface_lines') or 0),
        'member_count': probe['member_count'] - old['member_count'],
        'top40_lines': top40_lines - old['top40_lines'],
        'top5_pct': round(readings['top5_pct'] - old['top5_pct'], 1),
        'top40_pct': round(readings['top40_pct'] - old['top40_pct'], 1),
    },
}

# 自检：占比不得越界（A3 的可复算口径）
if readings['top40_pct'] > 100.0 or readings['top5_pct'] > 100.0:
    print('FAIL 占比超过 100%%（分母用错了）：top5=%s%% top40=%s%%' % (readings['top5_pct'], readings['top40_pct']))
    sys.exit(1)
if readings['top40_pct'] != round(top40_lines * 100.0 / surface, 1):
    print('FAIL 占比不可复算')
    sys.exit(1)

with open(base_path, 'w', encoding='utf-8') as f:
    json.dump(base, f, indent=2, ensure_ascii=False)
    f.write('\n')

print('rebind %s done: entry=%d surface=%d members=%d top40=%d (%.1f%%)'
      % (VER, t, surface, probe['member_count'], top40_lines, readings['top40_pct']))
print('ceiling raised: line=%s member=%s' % (raise_ceiling, raise_member))
print('top5 %s%% -> top40 %s%%' % (readings['top5_pct'], readings['top40_pct']))