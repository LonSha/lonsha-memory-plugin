#!/usr/bin/env python3
"""v3.467.0 宿主巨兽基线重建（沿用 v3465 的公式，一字不改；只换版号与理由）。
为什么需要它（本轮实测事实）：
  · 上一版基线 measured_at = v3.465.2、入口 13085 行；
  · 本轮 v3.467.0（ST-Persistent-Memory 三项增量缝合）的真实产品改动落在入口 index.js：
      ① 本地确定性 N-gram 向量器降级出口接入（memory-organs.js 侧为主，入口只加来源读数口）；
      ② recency 预算裁剪三级降级阶梯的内联回落逐字同步（engine-injection-pipeline.js 侧）；
      ③ 玩法流派预设第四入口 /lonsha-preset（public-interface.js 注册 + 入口注入三条配置薄口）；
      ④ OrganFallback 退路补齐 embedSourceOf / getEmbedSourceStats（与 memory-organs.js 公开面同形，
         v3264 A「退路缺方法 VectorStore.embedSourceOf」当场顶出来）；
      ⑤ 六源版本号统一抬到 3.467.0。
  · 入口 index.js 行数随之增加（Node split('\n') 口径，与判据同源）⇒ 9 个「基线行数须等于真 index.js 行数」
    的档集体转红（v3232/v3257/v3259/v3260/v3261/v3262/v3263/v3266/v3304）。
    这是**读数欠账**，不是产品缺陷；按纪律必须走脚本重绑、零手抄。
与 v3465 的差别：只有 VER、REASON、prev_ver 三处。
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

VER = 'v3.467.0'
prev_ver = base.get('measured_at', '')
if prev_ver not in ('v3.465.2', 'v3.467.0'):
    print('FAIL 上一版基线应为 v3.465.2 / v3.467.0（实测 %s）—— 拒绝在未知基线上重建' % prev_ver)
    sys.exit(2)
RERUN = (prev_ver == VER)
if RERUN and VER not in base.get('rebuilds', {}):
    print('FAIL measured_at 已是 %s 但 rebuilds 面没有该版读数 —— 基线内部不自洽' % VER)
    sys.exit(2)

old = base['rebuilds'][VER]['readings'] if RERUN else base['readings']
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
    '[v3.467.0] ST-Persistent-Memory 三项增量缝合落在入口：'
    '① 本地确定性 N-gram 向量器（local-ngram-vectorizer.js）接入 embedding 降级出口，'
    '入口补逐条来源读数口；'
    '② recency 预算裁剪三级降级阶梯（injection-router.js + engine-injection-pipeline.js 内联回落逐字同步）；'
    '③ 玩法流派预设四档与 /lonsha-preset 斜杠入口（gameplay-preset.js + public-interface.js 第四入口）；'
    '④ OrganFallback 退路补齐 embedSourceOf / getEmbedSourceStats，与 memory-organs.js 公开面同形'
    '（v3264 A「退路缺方法 VectorStore.embedSourceOf」当场顶出来）；'
    '⑤ 六源版本号统一抬到 3.467.0（抬版前 package/manifest 3.465.2 与 index.js 3.466.1 本就不一致）。'
    '入口 index.js %d → %d 行（%+d），成员 %d → %d，全部真实计入读数。'
    % (t, t - old['total_lines'], t - old['total_lines'], old['member_count'], probe['member_count'])
)
base['readings'] = readings
base['domains'] = probe['domains']
base['biggest_members_top40'] = top40
base['split_candidates'] = probe['split_candidates']
base['total_lines'] = t
base['member_count'] = probe['member_count']
base['measured_at'] = VER
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
        '[' + VER + '] 入口 index.js %d 行、成员数 %d；'
        '行上界%s（余量 %d %s slack %d）、成员上界%s（余量 %d %s member_slack %d）。'
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
    'not_done': '本版做向量降级出口/预算降级阶梯/玩法预设三项缝合，未拆任何宿主巨兽成员',
    'delta_from': ('%s(同版重绑)' % VER) if RERUN else prev_ver,
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
if lb['member_ceiling'] != lb['history'][-1]['member_ceiling']:
    print('FAIL member_ceiling 与末条 history 不同源')
    sys.exit(1)
with open(base_path, 'w', encoding='utf-8') as f:
    json.dump(base, f, indent=2, ensure_ascii=False)
    f.write('\n')
print('rebind %s done%s: entry=%d surface=%d members=%d top40=%d (%.1f%%)'
      % (VER, '(rerun)' if RERUN else '', t, surface, probe['member_count'], top40_lines, readings['top40_pct']))
print('ceiling raised: line=%s member=%s (%d->%d / %d->%d)'
      % (raise_ceiling, raise_member, ceiling, new_ceiling, member_ceiling, new_member_ceiling))
print('delta: total %+d surface %+d members %+d'
      % (t - old['total_lines'], surface - (old.get('surface_lines') or 0), probe['member_count'] - old['member_count']))