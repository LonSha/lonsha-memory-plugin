#!/usr/bin/env python3
"""v3.425.0 宿主巨兽基线重建（读数零手抄：全部从探针输出直接落盘）。

为什么必须重建（三条实测读数，逐条可复算）：
  ① recallMemory 849 → 875（+26）：本版给召回闸加了「判不了逐条留证」
     （_worldlineRecallFilter.undecidedSample，至多 20 条 {key, why}）。
     旧基线把 849 当契约锁死 ⇒ 只要召回侧有真功能增长就必红。
  ② _worldlineState 208 行新进 TOP40：本版它要解析 jumps / startFloor /
     layerAlias / readerPolicy 四张表，从「读三个标量」变成「读四张表」。
  ③ handoffVolumeContinuation 106 行被挤出 TOP40（不是变短，是别人变长）。

不动的面（探针复核，不是猜）：
  · entry_lines 11719 与 readings.total_lines 一致 ⇒ 行上界 ceiling 12096 不动；
  · member_count 1168 与 member_ceiling 1190 一致（余量 22 ≤ maxSlack 30）⇒ 不动。
"""
import json, subprocess, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
probe = json.loads(subprocess.run(
    ['node', os.path.join(ROOT, 'tests', 'audit', 'host_beast_probe.cjs')],
    cwd=ROOT, capture_output=True, text=True, check=True).stdout)

base_path = os.path.join(ROOT, 'tests', 'audit', 'host_beast_baseline.json')
with open(base_path, 'r', encoding='utf-8') as f:
    base = json.load(f)

VER = 'v3.425.0'
old = base['readings']
t = probe['entry_lines']
surface = probe['surface_lines']
top40 = probe['biggest_members'][:40]
top5_lines = sum(m['lines'] for m in top40[:5])
top40_lines = sum(m['lines'] for m in top40)
classified = sum(d['lines'] for d in probe['domains'] if d['domain'] != '（未归类）')
unclassified = sum(d['lines'] for d in probe['domains'] if d['domain'] == '（未归类）')

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
    '[v3.425.0] 世界线记忆主键换血（去世界观化）：内核主键从「变动率」改为'
    '「纪元 = 层标记@切换楼层」。宿主侧 ① engine-diagnostic-lines.js 的 '
    '_worldlineState 新增四张表的解析（jumps / startFloor / layerAlias / '
    'readerPolicy）⇒ 该成员 208 行新进 TOP40；② engine-recall.js 的 recallMemory '
    '给召回闸加「判不了逐条留证」（_worldlineRecallFilter.undecidedSample，'
    '至多 20 条）⇒ 849 行增至 875 行（+26）。'
    '两条都是活跃功能增长，非死代码回流；入口 index.js 行数不变（11719），'
    '故行上界与成员上界均不动。'
)

base['readings'] = readings
base['domains'] = probe['domains']
base['biggest_members_top40'] = top40
base['split_candidates'] = probe['split_candidates']
base['total_lines'] = t
base['member_count'] = probe['member_count']
base['measured_at'] = VER

base.setdefault('rebuilds', {})[VER] = {
    'reason': REASON,
    'readings': readings,
    'unchanged': [
        '生命周期接线面不变',
        '入口 index.js 行数不变（11719）⇒ line_budget.ceiling 不动',
        '宿主成员数不变（1168）⇒ member_ceiling 不动',
        '本版只量不拆',
    ],
    'not_done': '本版仅换世界线判定主键，未拆任何宿主巨兽成员',
    'delta_from': 'v3.424.1',
    'delta': {
        'total_lines': t - old['total_lines'],
        'surface_lines': surface - (old.get('surface_lines') or 0),
        'member_count': probe['member_count'] - old['member_count'],
        'top40_lines': top40_lines - old['top40_lines'],
        'top5_pct': round(readings['top5_pct'] - old['top5_pct'], 1),
    },
}

with open(base_path, 'w', encoding='utf-8') as f:
    json.dump(base, f, indent=2, ensure_ascii=False)
    f.write('\n')

print('rebind done: entry=%d surface=%d members=%d top40=%d' % (t, surface, probe['member_count'], top40_lines))
print('changed top40:', {m['name']: m['lines'] for m in top40[:6]})