#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.330.0 抬版连带:宿主分诊基线重建 + 行上界贴回「实测 + slack」(读数零手抄)。

为什么要重建(账要算清,不是「顺手刷绿」):
  host_beast_baseline.json 的 measured_at 停在 v3.328.0、readings.total_lines 停在 18964;
  而真 index.js 已是 19156。两版欠账合起来:
    · v3.329.0 M4-O1(GC 回收范围轴):宿主 +139 行(会话戳 / 范围键 / 三处派生点 / 两路注入),
      当版收口只跑了定向门与 61 个审计扫描器,漏跑依赖基线的测试面 ⇒ 欠账未记;
    · v3.330.0 M4-O2(问句保留主题/多人物/时点):宿主 +53 行(别名装配点 / 关系求交出口 /
      主题与宽查分列外送),本版一并结清。
  两条都是活跃功能增长、非死代码回流。行上界按「实测 + slack」贴回。
  成员面:实测 727 <= member_ceiling 753,按先例在线内就不抬(只在实测越过时才抬)。

受影响判据(修前各自翻红,同一根:基线行数与真 index.js 不同源):v3232 C1 / v3257 C /
  v3259 C / v3260 C / v3261 C / v3262 C / v3263 C / v3264 C / v3266 C / v3304 B3。
"""
import hashlib
import io
import json
import os
import re
import subprocess
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3330/'
BASE_REL = 'tests/audit/host_beast_baseline.json'
BASE = ROOT + BASE_REL
REASON = ('[v3.330.0] 结清两版宿主接线欠账(M4-O1 + M4-O2):v3.329.0 M4-O1(GC 回收范围轴)宿主 +139 行 —— 会话范围戳 _currentScopeStamp / 范围键 _gcScopeKey / 三处建节点唯一派生点 _scopeData / optimizeMemory 两路注入 + 四条范围读数,当版收口漏跑依赖基线的测试面故未记'
          'v3.330.0 M4-O2(问句保留主题、多人物与时点)宿主 +53 行 —— 宿主别名装配点 _qaActorAliases(只从 character 节点 data.aliases 派生别名→本名一向、事件节点不入表) / 关系求交出口 / 主题与宽查分列外送(18964 → 19156 行)。'
          '全为活跃功能增长、非死代码回流。行上界按「实测 + slack」贴回;成员面 727 <= 753 仍在线内,按先例不抬。')


def sha(t):
    return hashlib.sha256(t.encode('utf-8')).hexdigest()[:12]


def main():
    os.makedirs(BAK, exist_ok=True)
    old = io.open(BASE, encoding='utf-8').read()
    io.open(BAK + 'host_beast_baseline.json.pre3330', 'w', encoding='utf-8').write(old)
    r = subprocess.run([sys.executable, ROOT + 'tools/_rebuild_host_beast.py', REASON, '--force'],
                       cwd=ROOT, capture_output=True, text=True, timeout=600)
    print(r.stdout)
    if r.returncode != 0:
        sys.stderr.write(r.stderr)
        print('重建失败,未继续(基线保持原样)')
        sys.exit(2)
    d = json.loads(io.open(BASE, encoding='utf-8').read())
    t = d['readings']['total_lines']
    m = d['readings']['member_count']
    print('实测 rebuilt: lines=%d members=%d' % (t, m))
    lb = d['line_budget']
    slack = lb['maxSlack']
    mslack = lb['member_max_slack']
    was_ceiling = lb['ceiling']
    was_member = lb['member_ceiling']
    new_ceiling = t + slack
    print('行数:实测 %d / 旧上界 %d(余量 %d → 目标余量 %d)' % (t, was_ceiling, was_ceiling - t, slack))
    assert t <= new_ceiling, '实测不得越新上界'
    lb['ceiling'] = new_ceiling
    lb['note'] = REASON
    entry = {'ceiling': new_ceiling, 'reason': REASON}
    if m > was_member:
        lb['member_ceiling'] = m + mslack
        entry['member_ceiling'] = lb['member_ceiling']
        print('成员实测 %d 已越过上界 %d ⇒ 抬到 %d' % (m, was_member, lb['member_ceiling']))
    else:
        entry['member_ceiling'] = was_member
        print('★ 成员实测 %d 未越上界 %d ⇒ 按先例**不抬**(在线内就不抬,但 history 仍须带上 member_ceiling)'
              % (m, was_member))
    lb['history'].append(entry)
    print('line_budget: ceiling %d → %d(余量 %d)/ member_ceiling %d(余量 %d)'
          % (was_ceiling, new_ceiling, new_ceiling - t, lb['member_ceiling'], lb['member_ceiling'] - m))
    io.open(BASE, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=1) + '\n')
    new = io.open(BASE, encoding='utf-8').read()
    print('write %s %d → %d 字节 (sha %s → %s)'
          % (BASE_REL, len(old.encode('utf-8')), len(new.encode('utf-8')), sha(old), sha(new)))
    chk = json.loads(io.open(BASE, encoding='utf-8').read())
    _mv = re.search(r"const VERSION = '([0-9.]+)'", io.open(ROOT + 'index.js', encoding='utf-8').read()).group(1)
    assert chk['measured_at'] == 'v' + _mv, 'measured_at 须逐字等于宿主当版(实 %s / 期望 v%s)' % (chk['measured_at'], _mv)
    assert chk['line_budget']['note'] == chk['line_budget']['history'][-1]['reason'], 'note 须逐字等于末条 history.reason'
    assert chk['line_budget']['ceiling'] == chk['line_budget']['history'][-1]['ceiling'], 'ceiling 须等于末条 history'
    assert chk['line_budget']['member_ceiling'] == chk['line_budget']['history'][-1]['member_ceiling'], '成员上界须等于末条 history'
    assert chk['readings']['member_count'] <= chk['line_budget']['member_ceiling'], '实测成员须 <= 上界'
    assert chk['line_budget']['member_ceiling'] - chk['readings']['member_count'] <= chk['line_budget']['member_max_slack'], '成员余量须 <= slack'
    assert chk['line_budget']['ceiling'] - chk['readings']['total_lines'] <= chk['line_budget']['maxSlack'], '行数余量须 <= slack'
    print('自证六条通过')
    print('DONE')


if __name__ == '__main__':
    main()