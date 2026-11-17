#!/usr/bin/env python3
"""宿主巨兽基线重绑（通用版，不绑定版号）。

为什么重写（本轮实测，v3.472.0）：
  · 旧版把 `measured_at = "v3.363.0"`、`index_total_lines = 20249`、`ceiling = 20649`
    三处**硬编码**在脚本里。v3.363.0 之后 100 余个版本再没人动过它 ——
    `git log -- tools/rebind_host_beast.py` 只有 1 个提交（cbc7f96）。
    期间每次重绑都是**复制一份带版号的脚本**（tools/rebind_host_beast_v3425.py …
    v3467.py，共 19 份），把「只换 VER / REASON」这个动作人工做了 19 次。
  · 后果不是「不整洁」，是**活的破坏面**：今天若有人直接跑旧脚本，会把
    measured_at 倒退 100 余版、index_total_lines 写成 20249（真值 11719）、
    ceiling 写成 20649（真值 13519），一次打翻 11 套 A1 基线门禁（v3232 / v3257 /
    v3259 / v3260 / v3261 / v3262 / v3263 / v3264 / v3266 / v3304 / v3480）。
    一个没人调用的孤儿脚本，持有一次打翻 11 道门的写权限。
  · 本版按「读数零手抄」纪律重写：版号从 index.js 真读并与 manifest.json 互相
    校验（不一致直接拒绝落盘），口径公式沿用 v3467（entry_lines / surface_lines
    / 两面抬升），并把旧脚本里那三个硬编码常量**删掉而不是改小**。

与 v3467 的差别（都是纪律性差异，不改口径）：
  ① VER 不再硬编码：从 `index.js` 的 `const VERSION = '...'` 真读，
     与 `manifest.json` / `package.json` 三方不一致时 exit 2（拒绝在错版上重建）。
  ② 不再写 `index_total_lines` / `index_line_ceiling`：实测这两个字段自
     v3.362.0（5eb22f7）起**既无脚本写、也无判据读**，是遗留死字段。
     旧脚本往它们写 `total_lines` 与 `total_lines + 400` 属语义错位
     （`index_total_lines` 是另一个口径的数，不等于入口行数）。
  ③ `ceiling` 仍只在「实测触顶」或「余量 > maxSlack」时抬升，且抬到
     `t + maxSlack` —— **不跟随实测漂移**（stash 里那版曾写成恒等于 t + 400，
     那会让「上界余量 <= maxSlack」这条判据永远刚好成立，等于取消上界）。
  ④ 幂等：同版重跑识别 RERUN，覆盖同一条 rebuilds[VER]，不叠加假 history。
  ⑤ 只准前进：目标版低于基线现存版时 exit 2（旧脚本的经典事故是把读数倒退）。

用法：
  python3 tools/rebind_host_beast.py [--reason "本版真实改动说明"]
"""
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def fail(msg):
    print('FAIL ' + msg)
    sys.exit(2)


def vnum(s):
    m = re.match(r'v?(\d+)\.(\d+)\.(\d+)', str(s or ''))
    if not m:
        return -1
    return int(m.group(1)) * 1000000 + int(m.group(2)) * 1000 + int(m.group(3))


def read_version():
    """从入口真读版号，并与 manifest / package 互校（三方不一致就拒绝重建）。"""
    with open(os.path.join(ROOT, 'index.js'), 'r', encoding='utf-8') as f:
        m = re.search(r"const VERSION = '([^']+)'", f.read())
    if not m:
        fail('index.js 里找不到 const VERSION —— 拒绝在未知版号上重建')
    ver = m.group(1)
    for name in ('manifest.json', 'package.json'):
        with open(os.path.join(ROOT, name), 'r', encoding='utf-8') as f:
            other = json.load(f).get('version')
        if other != ver:
            fail('%s 版本 %s 与 index.js %s 不一致（先抬版再重绑）' % (name, other, ver))
    return ver


def main():
    reason_arg = ''
    argv = sys.argv[1:]
    if '--reason' in argv:
        i = argv.index('--reason')
        if i + 1 < len(argv):
            reason_arg = argv[i + 1].strip()

    ver_tag = 'v' + read_version()

    probe = json.loads(subprocess.run(
        ['node', os.path.join(ROOT, 'tests', 'audit', 'host_beast_probe.cjs')],
        cwd=ROOT, capture_output=True, text=True, check=True).stdout)

    base_path = os.path.join(ROOT, 'tests', 'audit', 'host_beast_baseline.json')
    with open(base_path, 'r', encoding='utf-8') as f:
        base = json.load(f)

    prev_ver = base.get('measured_at', '')
    if not prev_ver:
        fail('基线缺 measured_at —— 拒绝在无上一版指针的基线上重建')
    if prev_ver == ver_tag:
        if ver_tag not in base.get('rebuilds', {}):
            fail('measured_at 已是 %s 但 rebuilds 面没有该版读数 —— 基线内部不自洽' % ver_tag)
        rerun = True
    else:
        rerun = False
        if vnum(ver_tag) < vnum(prev_ver):
            fail('目标版 %s 低于基线现存版 %s —— 拒绝把读数倒退' % (ver_tag, prev_ver))

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

    old = base['rebuilds'][ver_tag]['readings'] if rerun else base['readings']
    delta_t = t - old['total_lines']

    reason = (
        '[%s] %s入口 index.js %d → %d 行（%+d），成员 %d → %d，合并面 %d 行；'
        '全部读数由 tests/audit/host_beast_probe.cjs 直接落盘（零手抄）。'
        '本版只量不拆：未拆任何宿主巨兽成员。'
        % (ver_tag, (reason_arg + ' ') if reason_arg else '',
           old['total_lines'], t, delta_t, old['member_count'],
           probe['member_count'], surface)
    )

    base['readings'] = readings
    base['domains'] = probe['domains']
    base['biggest_members_top40'] = top40
    base['split_candidates'] = probe['split_candidates']
    base['total_lines'] = t
    base['member_count'] = probe['member_count']
    base['measured_at'] = ver_tag
    base['note'] = reason

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
        'milestone_version': ver_tag,
        'reason': (
            '[%s] 入口 index.js %d 行、成员数 %d；'
            '行上界%s（余量 %d %s slack %d）、成员上界%s（余量 %d %s member_slack %d）。'
            '合并面 %d 行，TOP5 占 %.1f%%，TOP40 占 %.1f%%。'
            % (ver_tag, t, probe['member_count'],
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

    base.setdefault('rebuilds', {})[ver_tag] = {
        'reason': reason,
        'readings': readings,
        'unchanged': [
            '生命周期接线面不变',
            '本版只量不拆：未拆任何宿主巨兽成员',
        ],
        'not_done': '本版只重绑读数，未拆任何宿主巨兽成员',
        'delta_from': ('%s(同版重绑)' % ver_tag) if rerun else prev_ver,
        'delta': {
            'total_lines': delta_t,
            'surface_lines': surface - (old.get('surface_lines') or 0),
            'member_count': probe['member_count'] - old['member_count'],
            'top40_lines': top40_lines - old['top40_lines'],
            'top5_pct': round(readings['top5_pct'] - old['top5_pct'], 1),
            'top40_pct': round(readings['top40_pct'] - old['top40_pct'], 1),
        },
    }

    # ── 落盘前自校验：任一条不成立就**不写文件**（旧数据保持完好） ──
    if readings['top40_pct'] > 100.0 or readings['top5_pct'] > 100.0:
        fail('占比超过 100%%（分母用错）：top5=%s%% top40=%s%%'
             % (readings['top5_pct'], readings['top40_pct']))
    if readings['top40_pct'] != round(top40_lines * 100.0 / surface, 1):
        fail('占比不可复算')
    if readings['total_lines'] != t:
        fail('total_lines 与探针入口行数不同源')
    if lb['note'] != lb['history'][-1]['reason']:
        fail('note 不是末条 history 理由的复述（v3480 B5 会翻红）')
    if lb['ceiling'] != lb['history'][-1]['ceiling']:
        fail('ceiling 与末条 history 不同源')
    if lb['member_ceiling'] != lb['history'][-1]['member_ceiling']:
        fail('member_ceiling 与末条 history 不同源')
    if lb['ceiling'] - t > max_slack:
        fail('行上界余量 %d > maxSlack %d（余量过大 = 上界与实测脱节）'
             % (lb['ceiling'] - t, max_slack))
    if lb['member_ceiling'] - probe['member_count'] > member_slack:
        fail('成员上界余量 %d > member_slack %d'
             % (lb['member_ceiling'] - probe['member_count'], member_slack))

    with open(base_path, 'w', encoding='utf-8') as f:
        json.dump(base, f, indent=2, ensure_ascii=False)
        f.write('\n')

    print('rebind %s done%s: entry=%d surface=%d members=%d top40=%d (%.1f%%)'
          % (ver_tag, '(rerun)' if rerun else '', t, surface,
             probe['member_count'], top40_lines, readings['top40_pct']))
    print('ceiling raised: line=%s member=%s (%d->%d / %d->%d, slack %d/%d)'
          % (raise_ceiling, raise_member, ceiling, new_ceiling,
             member_ceiling, new_member_ceiling, max_slack, member_slack))
    print('delta: total %+d surface %+d members %+d'
          % (delta_t, surface - (old.get('surface_lines') or 0),
             probe['member_count'] - old['member_count']))


if __name__ == '__main__':
    main()