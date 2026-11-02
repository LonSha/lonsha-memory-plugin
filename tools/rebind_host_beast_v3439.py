#!/usr/bin/env python3
"""v3.439.0 宿主巨兽基线重建（读数零手抄：全部从探针输出直接落盘）。

为什么必须重建（实测读数，逐条可复算）：
  上一版基线停在 v3.434.0（入口 11885 行 / 成员 1240）。此后五版都是活跃功能增长：
    v3.435.0 L13-O3 只读视图四态 + L13-O8 软删闭环（engine-evidence-center.js / settings-ui.js 增面）
    v3.436.0 L13-O4 视图入口可达性（新扫描器，宿主面零改动）
    v3.437.0 L13-O5 世界线可读化（engine-diagnostic-lines.js 增读口 + 宿主转发桩）
    v3.438.0 L13-O6 注入回执可复算（engine-injection-pipeline.js / 宿主读口）
    v3.439.0 L13-X3 视角投影面（新内核 pov-projection.js + 宿主两个转发桩 povProject / _povProjectionLine）
  实测入口 11885 → 11889 行、成员 1240 → 1246 ⇒ 6 份 A1 套件（v3257/v3259/v3260/v3261/v3264/v3266）
  与 v3232 / v3304 / v3263 / v3303 等按「基线读数须与真文件同源」的档转红。这是**读数欠账**，
  不是产品缺陷：本脚本按纪律把基线抬到当版真实读数，不手改任何一个数字。

与上一版脚本的关系（历史留痕不覆盖）：
  tools/rebind_host_beast_v3434.py 里的 VER 是硬编码的 'v3.434.0'，直接复用会把本版读数
  挂到上一版号下。故本脚本是它的 v3.439.0 克隆，只改 VER / prev_ver 与本段说明，
  公式逐字不动 —— 一份公式一个真源。
不动的面由下面的脚本按实测值判断，不在这里写死。
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
VER = 'v3.439.0'
prev_ver = base.get('measured_at', '')
if prev_ver != 'v3.434.0':
    print('FAIL 上一版基线应为 v3.434.0（实测 %s）—— 拒绝在未知基线上重建' % prev_ver)
    sys.exit(2)
if VER in base.get('rebuilds', {}):
    print('FAIL %s 已在 rebuilds 面留过读数 —— 请先确认是否重复执行' % VER)
    sys.exit(2)
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
    '[v3.439.0] L13-X3 视角投影面接线：新内核 pov-projection.js（零依赖纯函数，extra_js 第 247 项）；'
    'engine-diagnostic-lines.js 新增 povProject 装配口与 _povProjectionLine 诊断行（只装配 / 原样转发 / 留读数摘要，'
    '取数全部来自既有三账 pov / secretLedger / knowledgeTraces，不引入任何新存储）；'
    'index.js 新增 povProject / _povProjectionLine 两个薄转发桩；settings-ui.js 的 povs 视图由列名单改为三态投影面。'
    '同期 O3~O6 的增面也落在本区间（O3 四态 / O4 可达性扫描器 / O5 世界线读口 / O6 注入回执），'
    '全部是活跃功能增长，非死代码回流。'
)
base['readings'] = readings
base['domains'] = probe['domains']
base['biggest_members_top40'] = top40
base['split_candidates'] = probe['split_candidates']
base['total_lines'] = t
base['member_count'] = probe['member_count']
base['measured_at'] = VER

# ---- 行上界 / 成员上界：既有判据是「读数 <= 上界 且 余量 <= slack」----
lb = base['line_budget']
ceiling = lb['ceiling']
member_ceiling = lb['member_ceiling']
max_slack = lb.get('maxSlack', 400)
member_slack = lb.get('member_max_slack', 30)
raise_ceiling = (t > ceiling) or ((ceiling - t) > max_slack)
raise_member = (probe['member_count'] > member_ceiling) or ((member_ceiling - probe['member_count']) > member_slack)
new_ceiling = (t + max_slack) if raise_ceiling else ceiling
new_member_ceiling = (probe['member_count'] + member_slack) if raise_member else member_ceiling
entry = {
    'ceiling': new_ceiling,
    'member_ceiling': new_member_ceiling,
    'milestone_version': VER,
    'reason': (
        '[v3.439.0] L13-X3 视角投影面接线：index.js 新增 2 个转发桩成员（povProject / _povProjectionLine）。'
        '入口 index.js %d 行、成员数 %d；行上界%s（余量 %d %s slack %d）、成员上界%s（余量 %d %s member_slack %d）。'
        '合并面 %d 行，TOP5 占 %.1f%%，TOP40 占 %.1f%%。'
        % (t, probe['member_count'],
           ('**上抬至 %d**' % new_ceiling) if raise_ceiling else '**不抬，仍为 %d**' % ceiling,
           new_ceiling - t,
           ('触顶 >' if (new_ceiling - t) > max_slack else '<='),
           max_slack,
           ('**上抬至 %d**' % new_member_ceiling) if raise_member else '**不抬，仍为 %d**' % member_ceiling,
           new_member_ceiling - probe['member_count'],
           ('触顶 >' if (new_member_ceiling - probe['member_count']) > member_slack else '<='),
           member_slack,
           surface, readings['top5_pct'], readings['top40_pct'])
    ),
}
lb['ceiling'] = new_ceiling
lb['member_ceiling'] = new_member_ceiling
lb['note'] = entry['reason']
lb.setdefault('history', []).append(entry)

base.setdefault('rebuilds', {})[VER] = {
    'reason': REASON,
    'readings': readings,
    'unchanged': [
        '生命周期接线面不变',
        '本版只量不拆：未拆任何宿主巨兽成员',
    ],
    'not_done': '本版只做视角投影面（X3）与 O3~O6 增面接线，未拆任何宿主巨兽成员',
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
if readings['top40_pct'] > 100.0 or readings['top5_pct'] > 100.0:
    print('FAIL 占比超过 100%%（分母用错了）：top5=%s%% top40=%s%%' % (readings['top5_pct'], readings['top40_pct']))
    sys.exit(1)
if readings['top40_pct'] != round(top40_lines * 100.0 / surface, 1):
    print('FAIL 占比不可复算')
    sys.exit(1)
if lb['note'] != lb['history'][-1]['reason']:
    print('FAIL note 不是末条 history 理由的复述')
    sys.exit(1)
if lb['ceiling'] != lb['history'][-1]['ceiling']:
    print('FAIL ceiling 与末条 history 不同源')
    sys.exit(1)
with open(base_path, 'w', encoding='utf-8') as f:
    json.dump(base, f, indent=2, ensure_ascii=False)
    f.write('\n')
print('rebind %s done: entry=%d surface=%d members=%d top40=%d (%.1f%%)'
      % (VER, t, surface, probe['member_count'], top40_lines, readings['top40_pct']))
print('ceiling raised: line=%s member=%s (%d->%d / %d->%d)'
      % (raise_ceiling, raise_member, ceiling, new_ceiling, member_ceiling, new_member_ceiling))
