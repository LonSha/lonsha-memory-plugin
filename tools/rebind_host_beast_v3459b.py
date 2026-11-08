#!/usr/bin/env python3
"""v3.459.0 宿主巨兽基线重建（**同版重绑**变体：读数零手抄，公式与 v3459 逐字一致）。

为什么需要它（本轮实测，不是洁癖）：
  第一次 rebind（rebind_host_beast_v3459.py）落在 index.js = 12712 行时；之后同一 release 内
  又做了两批**真实产品改动**：
    ① `pyramidFanInThreshold` 零消费 → 把 planHierarchicalClusters 接进维护管线（+19 行）；
    ② MemoryBooksFallback 补齐 BM25 四个方法（+8 行）；
  入口变成 12739 行。于是 11 个「基线行数须等于真 index.js 行数」的档集体转红
  （v3257/v3259/v3260/v3261/v3262/v3263/v3266/v3304/v3232/v3480/v34271）。
  这是**读数欠账**，不是产品缺陷；按纪律必须走脚本重绑、不手改数字。

与 v3459 的差别（只有三处，公式不动）：
  · 允许 prev_ver == VER（同版重跑）：Δ 的对照从 `readings` 换成 `rebuilds[VER].readings`；
  · history 仍**追加**一条（读到的是「这一版内读数变了多少」，如实留痕，不覆盖前一条）；
  · `delta_from` 记成 `v3.459.0(同版重绑)`，让下一读者一眼看出这是同 release 内的二次读数。
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
VER = 'v3.459.0'
prev_ver = base.get('measured_at', '')
if prev_ver not in ('v3.444.0', 'v3.459.0'):
    print('FAIL 上一版基线应为 v3.444.0 或 v3.459.0（实测 %s）—— 拒绝在未知基线上重建' % prev_ver)
    sys.exit(2)
RERUN = (prev_ver == VER)
if RERUN and VER not in base.get('rebuilds', {}):
    print('FAIL measured_at 已是 %s 但 rebuilds 面没有该版读数 —— 基线内部不自洽' % VER)
    sys.exit(2)
# Δ 的对照源：同版重跑时与「本版上一次读数」比，首次重建时与 `readings` 比。
old = base['rebuilds'][VER]['readings'] if RERUN else base['readings']
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
    '[v3.459.0 · 同版重绑] 设置面板极简重构 + 全量门禁修复轮：'
    '① 面板侧按玩家动线重划四面板（故事整理 / 物品记录 / 分类记录 / 推理与多路策略 …），'
    '控件契约 223 键 / 213 控件 / 124 id，扫描器全绿；'
    '② 门禁侧逐项修绿（参考基准重登记、seam 台账重生成、账本文本归一改走 LE.text、'
    '幽灵守卫补真实写入源、两个零引用宿主方法接上面板按钮、两处锚点扩形以认得 let merged、'
    '两个「承接即误判」的键进豁免表、PLAN 陈旧节登记、relations 视图三态用词纠偏）；'
    '③ 新增 tests/v3459_gates_green.test.mjs 把上述修复点逐条锁死；'
    '④ 本版第二批真实产品修复：pyramidFanInThreshold 零消费接进 pyramid-evolution 维护步骤'
    '（planHierarchicalClusters 规划 pendingClusters，+19 行）、MemoryBooksFallback 补齐 BM25 '
    '四个方法（+8 行）、L16 认知四桶把「未声明归属」从禁区改判共同基线（修复匿名记忆导致整段注入清空）。'
    '入口 index.js 12082 → %d 行，全部真实计入读数。' % t
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
        '[v3.459.0 同版重绑] 入口 index.js %d 行、成员数 %d；'
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
    'not_done': '本版做面板重划与门禁修复，未拆任何宿主巨兽成员',
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