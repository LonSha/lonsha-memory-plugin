# -*- coding: utf-8 -*-
"""[v3.338.0] 修 v3232 F1：把 v3.336.0 的重建记录补成四件齐备、readings 补齐到全套读数。

取证：v3.336.0 记录只含 reason/readings（且 readings 被截成 total_lines/member_count 两键），
  其余 68 条均为 delta/delta_from/not_done/readings/reason/unchanged 六键；
  git show v3.336.0 即如此（HEAD-legacy，非本刀引入）。

修法（读数零手抄）：在 /tmp/v3360check（git archive v3.336.0 解出）跑真探针，
  按 _rebuild_host_beast.py 的同一形状重算 readings，并以「前一版 v3.335.0」
  为 delta_from 算 delta。unchanged/not_done 沿用本仓既定口径（本版只量不拆）。
"""
import io, json, subprocess, sys
ROOT = '/home/user/lonsha-memory-plugin/'
BASE = ROOT + 'tests/audit/host_beast_baseline.json'
CHECK = '/tmp/v3360check'
r = subprocess.run(['node', CHECK + '/tests/audit/host_beast_probe.cjs'], cwd=CHECK, capture_output=True, text=True, timeout=180)
if r.returncode != 0:
    sys.stderr.write(r.stderr[-1000:]); sys.exit(2)
rep = json.loads(r.stdout)

classified = sum(d['lines'] for d in rep['domains'] if d['domain'] != '（未归类）')
unclassified = sum(d['lines'] for d in rep['domains'] if d['domain'] == '（未归类）')
top40 = [{'name': m['name'], 'lines': m['lines'], 'outside_refs': m.get('outside_refs', 0)} for m in rep['biggest_members']]
top5_lines = sum(x['lines'] for x in top40[:5])
top40_lines = sum(x['lines'] for x in top40)
t = rep['total_lines']
readings = {
    'total_lines': t,
    'member_count': rep['member_count'],
    'duplicate_member_names': len(rep['duplicate_member_names']),
    'top5_lines': top5_lines,
    'top5_pct': round(top5_lines * 100 / t, 1),
    'top40_lines': top40_lines,
    'top40_pct': round(top40_lines * 100 / t, 1),
    'prefix_rule_coverage_lines': classified,
    'prefix_rule_coverage_pct': round(classified * 100 / t, 1),
    'unclassified_lines': unclassified,
    'seam_distinct_modules': rep['seam_modules']['distinct_modules'],
    'seam_reference_sites': rep['seam_modules']['reference_sites'],
    'seam_call_shape_sites': rep['seam_modules']['call_shape_sites'],
    'members_over_80_lines': rep['split_candidates']['total_over_threshold'],
    'low_coupling_members': rep['split_candidates']['low_coupling_non_lifecycle'],
    'high_coupling_members': rep['split_candidates']['high_coupling_non_lifecycle'],
}
base = json.loads(io.open(BASE, encoding='utf-8').read())
rb = base['rebuilds']
old = rb['v3.335.0']['readings']
rec = rb['v3.336.0']
reason = rec['reason']  # 保留原始 reason（逐字不动）
# 校验重算读数与旧截断值一致（防口径漂移）
assert rec['readings']['total_lines'] == readings['total_lines'], 'total_lines 重算不符'
assert rec['readings']['member_count'] == readings['member_count'], 'member_count 重算不符'
rb['v3.336.0'] = {
    'reason': reason,
    'readings': readings,
    'unchanged': [
        'TOP40 头名仍是生命周期接线 `onMessageReceived`',
        '本版只量不拆',
    ],
    'not_done': '本版仍未拆任何东西：只把新接线按读数并入基线。「按域拆」的形态决策沿用 v3.233.0 的按读数否掉。',
    'delta_from': 'v3.335.0',
    'delta': {
        'total_lines': readings['total_lines'] - old['total_lines'],
        'member_count': readings['member_count'] - old['member_count'],
        'top5_pct': round(readings['top5_pct'] - old['top5_pct'], 1),
    },
}
io.open(BASE, 'w', encoding='utf-8').write(json.dumps(base, ensure_ascii=False, indent=1) + '\n')
print('readings:', json.dumps(readings, ensure_ascii=False))
print('delta:', json.dumps(rb['v3.336.0']['delta'], ensure_ascii=False))
print('DONE')
