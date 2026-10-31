#!/usr/bin/env python3
"""v3.429.0 宿主巨兽基线重建（读数零手抄：全部从探针输出直接落盘）。

为什么必须重建（实测读数，逐条可复算）：
  本版 L12-O8 把世界线跳跃表从「一段裸文本」变成「结构化编辑器 + 实时读数」——
  engine-diagnostic-lines.js 新增解析单源 parseJumpsText（坏行具名 + 逐行原文 1:1）与
  预览读数 worldlineJumpDraft（writesNothing，供面板读而不写），闸侧改为消费同一解析结果；
  settings-ui.js 把裸 textarea 换成结构化行区 + 读数行 + 坏行区（原始文本折叠保留同键）；
  index.js 只加一行转发（worldlineJumpDraft）。三条都是活跃功能增长，非死代码回流。

不动的面（探针复核，不是猜）：
  · 行上界：入口 11776 行，余量 12096-11776=320（<= maxSlack 400）⇒ 如实记「不抬」；
  · 成员上界：1190 对 1210，余量 20（<= member_max_slack 30）⇒ 不抬。
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

VER = 'v3.429.0'
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
    '[v3.429.0] L12-O8 世界线跳跃表结构化编辑器 + 实时读数：本版把「写错一行被闸静默丢弃、'
    '当前纪元只在诊断行可见」这两个产品面真欠账收掉 —— engine-diagnostic-lines.js 新增解析单源 '
    'parseJumpsText（rows / rejects / warns / entries 四桶，坏行带 1 基行号与可读成因）与 '
    '预览读数 worldlineJumpDraft（writesNothing:true，供面板读而不写配置），闸侧 _worldlineState '
    '改为消费同一解析结果（行为逐字不变：坏行跳过 + 楼层升序，区别是坏行**有名字**了）；'
    'settings-ui.js 把裸 textarea 换成结构化行区 + 三态读数行（none / gap / ok，另加 '
    'unwired / bad / conflict）+ 坏行具名区，原始文本折叠保留并**仍绑同一个配置键**；'
    'index.js 只加一行 worldlineJumpDraft 转发。三条都是活跃功能增长，非死代码回流。'
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
        '[v3.429.0] L12-O8 世界线跳跃表结构化编辑器：index.js +%d 行（世界线预览读数的单行转发）、'
        '解析单源与预览读数承担业务、settings-ui.js 承担编辑器 UI。入口 index.js %d 行、成员数 %d；'
        '行上界与成员上界%s（余量 %d / %d）。合并面 %d 行，TOP5 占 %.1f%%、TOP40 占 %.1f%%。'
        % (t - old['total_lines'], t, probe['member_count'],
           ('**均上抬**（余量触顶）' if (raise_ceiling or raise_member) else '**均不抬**（仍在 slack 内）'),
           new_ceiling - t, new_member_ceiling - probe['member_count'],
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
    'not_done': '本版只做「零消费内核接管产品面」的接线与判据，未拆任何宿主巨兽成员',
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