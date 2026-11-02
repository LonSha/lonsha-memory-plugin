#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.443.0 同版收尾补测：两处真缺陷修复后，宿主读数变了，基线必须跟上（读数零手抄）。

为什么需要这一步（不是「跑两遍 rebind」）：
  `tools/rebind_host_beast_v3443.py` 有守卫 `if VER in base['rebuilds']` —— 它在首次重绑后
  就拒绝再跑（防「同一版反复重绑把读数刷成何值都算」）。但本轮在首绑**之后**又修了两处
  真缺陷（账本投影 / 快照真接入），入口从 11933 涨到 12060 行 —— 读数已经与基线不同源。
  按本仓口径「读数欠账不是产品缺陷」，这里做**同版补测**：只更新读数与理由，不伪造新版本。

与首绑的差别（三处，必须写清）：
  1. `delta_from` 仍记 v3.442.0 —— 差值基准取**上一版的 rebuilds 读数**，不是「自己跟自己」
     （拿自己当基准会让 delta 恒为 0，等于这笔账没有信息）。
  2. 理由末尾追加「同版收尾补测」并写明补了什么，读台账的人才知道为什么同一版有两条 history。
  3. history 追加**第二条**（不是改第一条）—— 第一条是首绑现场，抹掉就丢了「先绑成什么样」。
"""
import io
import json
import subprocess
import sys
import os

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in dir() else '/home/user/lonsha-memory-plugin/tools'
ROOT = '/home/user/lonsha-memory-plugin'
VER = 'v3.443.0'
BASE_VER = 'v3.442.0'

probe = json.loads(subprocess.run(
    ['node', os.path.join(ROOT, 'tests', 'audit', 'host_beast_probe.cjs')],
    cwd=ROOT, capture_output=True, text=True, check=True).stdout)
base_path = os.path.join(ROOT, 'tests', 'audit', 'host_beast_baseline.json')
with io.open(base_path, encoding='utf8') as f:
    base = json.load(f)

if base.get('measured_at') != VER:
    print('FAIL 基线不在当版（实测 %s）—— 本脚本只做同版补测' % base.get('measured_at'))
    sys.exit(2)
if VER not in base.get('rebuilds', {}):
    print('FAIL 当版还没有首绑记录 —— 应先跑 tools/rebind_host_beast_v3443.py')
    sys.exit(2)
if BASE_VER not in base.get('rebuilds', {}):
    print('FAIL 上一版读数缺失：' + BASE_VER)
    sys.exit(2)

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

APPEND = (
    '【同版收尾补测】首绑后又修了两处**真缺陷**，读数随之变化，故重测一次（不是新版本）：'
    '① 账本清单口的两本无 id 账（摘要 / 正史增量）必须投影出位置键 —— 修前这两本账'
    '「采集成功但一条也采不到」，面板显示新增 0 条像这轮没写入；'
    '② 快照 before/after 真接进生成链路（修前全仓零调用，面板永远 no-round）。'
    '读这条的理由：同一版出现两条 history 是因为首绑现场与收尾现场都必须留痕，'
    '抹掉首绑那条就丢了「先绑成什么样」。'
)

# ---------- 更新当版读数（保留首绑那条 history 不动） ----------
prev = base['rebuilds'][BASE_VER]['readings']
old_cur = base['rebuilds'][VER]['readings']

new_readings = dict(readings)
lb = base['line_budget']
max_slack = lb.get('maxSlack', 400)
member_slack = lb.get('member_max_slack', 30)
ceiling = lb['ceiling']
member_ceiling = lb['member_ceiling']
raise_ceiling = (t > ceiling) or ((ceiling - t) > max_slack)
raise_member = (probe['member_count'] > member_ceiling) or ((member_ceiling - probe['member_count']) > member_slack)
new_ceiling = (t + max_slack) if raise_ceiling else ceiling
new_member_ceiling = (probe['member_count'] + member_slack) if raise_member else member_ceiling

entry = {
    'ceiling': new_ceiling,
    'member_ceiling': new_member_ceiling,
    'milestone_version': VER,
    'reason': (
        '[v3.443.0] 同版收尾补测（两处真缺陷修复后重测）：'
        '入口 index.js %d 行、成员数 %d；行上界%s（余量 %d %s slack %d）、'
        '成员上界%s（余量 %d %s member_slack %d）。'
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
           surface, new_readings['top5_pct'], new_readings['top40_pct'])
    ),
}
lb['ceiling'] = new_ceiling
lb['member_ceiling'] = new_member_ceiling
lb['note'] = entry['reason']
lb.setdefault('history', []).append(entry)

base['readings'] = new_readings
base['domains'] = probe['domains']
base['biggest_members_top40'] = top40
base['split_candidates'] = probe['split_candidates']
base['total_lines'] = t
base['member_count'] = probe['member_count']

base['rebuilds'][VER] = {
    'reason': base['rebuilds'][VER]['reason'] + '\n' + APPEND,
    'readings': new_readings,
    'unchanged': base['rebuilds'][VER].get('unchanged', []),
    'not_done': base['rebuilds'][VER].get('not_done', ''),
    'delta_from': BASE_VER,
    'delta': {
        'total_lines': t - prev['total_lines'],
        'surface_lines': surface - (prev.get('surface_lines') or 0),
        'member_count': probe['member_count'] - prev['member_count'],
        'top40_lines': top40_lines - prev['top40_lines'],
        'top5_pct': round(new_readings['top5_pct'] - prev['top5_pct'], 1),
        'top40_pct': round(new_readings['top40_pct'] - prev['top40_pct'], 1),
    },
    'remeasured_from': {
        'total_lines': old_cur['total_lines'],
        'member_count': old_cur['member_count'],
        'note': '首绑现场（同版补测前）。两次读数之差 = 两处真缺陷修复带来的净增量。',
    },
}

# ---------- 自证 ----------
if new_readings['top40_pct'] > 100.0 or new_readings['top5_pct'] > 100.0:
    print('FAIL 占比超过 100%%（分母用错）')
    sys.exit(1)
if new_readings['top40_pct'] != round(top40_lines * 100.0 / surface, 1):
    print('FAIL 占比不可复算')
    sys.exit(1)
if lb['note'] != lb['history'][-1]['reason']:
    print('FAIL note 不是末条 history 理由的复述')
    sys.exit(1)
if lb['ceiling'] != lb['history'][-1]['ceiling'] or lb['member_ceiling'] != lb['history'][-1]['member_ceiling']:
    print('FAIL ceiling 与末条 history 不同源')
    sys.exit(1)
if base['readings']['total_lines'] != t:
    print('FAIL readings 与探针不同源')
    sys.exit(1)

with io.open(base_path, 'w', encoding='utf8') as f:
    json.dump(base, f, indent=2, ensure_ascii=False)
    f.write('\n')

print('remeasure %s done: entry=%d surface=%d members=%d top40=%d (%.1f%%)'
      % (VER, t, surface, probe['member_count'], top40_lines, new_readings['top40_pct']))
print('首绑 → 补测：entry %d -> %d（净 %+d）/ members %d -> %d（净 %+d）'
      % (old_cur['total_lines'], t, t - old_cur['total_lines'],
         old_cur['member_count'], probe['member_count'], probe['member_count'] - old_cur['member_count']))
print('ceiling: line=%d (余量 %d) / member=%d (余量 %d)'
      % (new_ceiling, new_ceiling - t, new_member_ceiling, new_member_ceiling - probe['member_count']))
print('history 条数：%d（首绑 + 补测各一条）' % len(lb['history']))
print('CHECK_OK')