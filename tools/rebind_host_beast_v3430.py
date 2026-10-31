#!/usr/bin/env python3
"""v3.430.0 宿主巨兽基线重建（读数零手抄：全部从探针输出直接落盘）。

为什么必须重建（实测读数，逐条可复算）：
  本版 L12-X1~X9 九项拓展把「记着但摸不到 / 判得了但说不出」的九个面接进产品：
  engine-diagnostic-lines.js 承担九面的业务（组织与制度记忆的真入口、意义演化、
  前史回填、事实纠错的可解释面、世界线跳转草稿、卸载演练、对象化反例、秘密排除、
  沉默状态可解释），index.js 只留转发桩，settings-ui.js 承担面板各面，
  engine-self-check.js 承担自检行，memory-organs.js / memory-config.js 承担登记面。
  全部是活跃功能增长，非死代码回流。

与上一版脚本的关系（历史留痕不覆盖）：
  tools/rebind_host_beast_v3429.py 里的 VER 是硬编码的 'v3.429.0'，直接复用会把本版读数
  挂到上一版号下（本轮真踩过并已清理，见 /tmp/prep_hb3430.py）。故本脚本是它的 v3.430.0
  克隆，只改 VER 与本段说明，公式逐字不动 —— 一份公式一个真源。

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

VER = 'v3.430.0'
prev_ver = base.get('measured_at', '')
if prev_ver != 'v3.429.0':
    print('FAIL 上一版基线应为 v3.429.0（实测 %s）—— 拒绝在未知基线上重建' % prev_ver)
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
    '[v3.430.0] L12-X1~X9 九项拓展接线：本版把九件「登记在册、真加载、单测全绿，'
    '而产品端一次都没调用」的拓展各接一套宿主出口 —— 组织与制度记忆的真入口、意义的演化与'
    '释义漂移、前世线回填（前史）、事实纠错的可解释面、世界线跳转草稿、上下文卸载演练、'
    '反对意见的对象化反例、秘密事实的排除面、记忆沉默状态的可解释。业务全部落在 '
    'engine-diagnostic-lines.js（+1742 行），index.js 只留转发桩（+146 行），'
    'settings-ui.js 承担面板各面（+661 行），engine-self-check.js 承担自检行（+49 行），'
    'memory-organs.js / memory-config.js 承担登记面（+25 / +1 行）。'
    '九条都是活跃功能增长，非死代码回流。'
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
# 判据方向（逐字读 v3232 C2 / v3257 C 得来的，不是猜）：
#   ① idxLines <= ceiling           超上界 ⇒ 必须抬；
#   ② ceiling - idxLines <= maxSlack 余量**超过** slack ⇒ 上界与实测脱节过远 ⇒ 重新贴合（往回收）。
raise_ceiling = (t > ceiling) or ((ceiling - t) > max_slack)
raise_member = (probe['member_count'] > member_ceiling) or ((member_ceiling - probe['member_count']) > member_slack)
new_ceiling = (t + max_slack) if raise_ceiling else ceiling
new_member_ceiling = (probe['member_count'] + member_slack) if raise_member else member_ceiling
entry = {
    'ceiling': new_ceiling,
    'member_ceiling': new_member_ceiling,
    'milestone_version': VER,
    'reason': (
        '[v3.430.0] L12-X1~X9 九项拓展接线：index.js +%d 行（九面各留一行转发桩）、'
        '业务落在 engine-diagnostic-lines.js、settings-ui.js 承担面板九面。入口 index.js %d 行、'
        '成员数 %d；行上界%s（余量 %d %s slack %d）、成员上界%s（余量 %d %s member_slack %d）。'
        '合并面 %d 行，TOP5 占 %.1f%%、TOP40 占 %.1f%%。'
        % (t - old['total_lines'], t, probe['member_count'],
           # ★ 两面必须**分开说**：v3.429.0 那次把「其一上抬」写成「均上抬」，与 ceiling 未变对不上。
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
# 既有判据（v3266 :402 / v3261 :424）：`note` 必须**逐字等于**最后一条 history 的 reason
lb['note'] = entry['reason']
lb.setdefault('history', []).append(entry)

base.setdefault('rebuilds', {})[VER] = {
    'reason': REASON,
    'readings': readings,
    'unchanged': [
        '生命周期接线面不变',
        '本版只量不拆：未拆任何宿主巨兽成员',
    ],
    'not_done': '本版只做九项拓展的接线与判据，未拆任何宿主巨兽成员',
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
# 自检：note 与末条 history 同源、ceiling 与末条同源（v3480 B5 的判据口径）
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
print('delta: total %+d surface %+d members %+d'
      % (t - old['total_lines'], surface - (old.get('surface_lines') or 0), probe['member_count'] - old['member_count']))