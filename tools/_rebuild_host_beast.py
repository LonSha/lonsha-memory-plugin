#!/usr/bin/env python3
"""Rebuild host_beast_baseline.json from live probe output. Readings are never hand-copied."""
import json, os, re, subprocess, sys
from pathlib import Path
ROOT = Path(os.environ.get('LONSHA_AUDIT_ROOT') or '/home/user/lonsha-memory-plugin')
BASE = ROOT / 'tests/audit/host_beast_baseline.json'
PROBE = ROOT / 'tests/audit/host_beast_probe.cjs'

_ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
_M = re.search(r"const VERSION = '([0-9.]+)'", (ROOT / 'index.js').read_text(encoding='utf-8'))
version_key = 'v' + _M.group(1)
reason = _ARGS[0] if _ARGS else (version_key + ' 重建（读数由探针生成，零手抄）')
force = '--force' in sys.argv
_ND = [a for a in sys.argv[1:] if a.startswith('--not-done=')]
not_done = _ND[0].split('=', 1)[1] if _ND else '本版仍未拆任何东西：只把新接线按读数并入基线。「按域拆」的形态决策沿用 v3.233.0 的按读数否掉。'
r = subprocess.run(['node', str(PROBE)], cwd=ROOT, capture_output=True, text=True, timeout=120)
if r.returncode != 0:
    sys.stderr.write(r.stderr)
    raise SystemExit(f'probe failed: {r.returncode}')
rep = json.loads(r.stdout)
base = json.loads(BASE.read_text())
classified = sum(d['lines'] for d in rep['domains'] if d['domain'] != '（未归类）')
unclassified = sum(d['lines'] for d in rep['domains'] if d['domain'] == '（未归类）')
top40 = [{'name': m['name'], 'lines': m['lines'], 'outside_refs': m.get('outside_refs', 0)} for m in rep['biggest_members']]
top5_lines = sum(x['lines'] for x in top40[:5])
top40_lines = sum(x['lines'] for x in top40)
t = rep['total_lines']
readings = {
    'total_lines': t,
    'member_count': rep['member_count'],
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
old = base['readings']
_prev_measured = base.get('measured_at')
base['readings'] = readings
base['measured_at'] = version_key
base['domains'] = rep['domains']
base['biggest_members_top40'] = top40
if 'split_candidates' in rep:
    # keep baseline extra fields if present; overwrite numeric faces from probe
    sc = dict(base.get('split_candidates') or {})
    sc.update(rep['split_candidates'])
    base['split_candidates'] = sc
rb = dict(base.get('rebuilds') or {})
if version_key in (base.get('rebuilds') or {}) and not force:
    raise SystemExit(version_key + ' 已在 rebuilds 里 —— 拒绝静默覆盖既有版本记录（要覆盖请显式 --force）')
rb[version_key] = {
    'reason': reason,
    'readings': readings,
    'unchanged': [
        'TOP40 头名仍是生命周期接线 `onMessageReceived`',
        '本版只量不拆',
    ],
    'not_done': not_done,
    'delta_from': (_prev_measured or '未标'),
    'delta': {
        'total_lines': readings['total_lines'] - old['total_lines'],
        'member_count': readings['member_count'] - old['member_count'],
        'top5_pct': round(readings['top5_pct'] - old['top5_pct'], 1),
    },
}
base['rebuilds'] = rb
BASE.write_text(json.dumps(base, ensure_ascii=False, indent=1) + '\n')
print('wrote', BASE)
print('readings', json.dumps(readings, ensure_ascii=False))
print('version', version_key)
print('delta', rb[version_key]['delta'])