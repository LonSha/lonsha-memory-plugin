#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.326.0 抬版连带:宿主分诊基线重建 + 行上界**收紧**到「实测 + slack」(读数零手抄)。

范式照 tools/bump3325_host_beast_rebind.py,唯一差别:本刀是 **A1 第九刀**(宿主 index.js
净删 114 行),实测降到上界之内且余量 514 > maxSlack 400 ⇒ 会让 v3232 C2 / v3266 C / v3261 C
三条「上界与实测脱节」判据翻红。故本脚本走「重建 + 把 ceiling 贴回实测 + slack」。
成员面按先例:在线内就不抬(member_ceiling 只在实测越过时才抬)。
"""
import hashlib
import io
import json
import os
import re
import subprocess
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3326/'
BASE_REL = 'tests/audit/host_beast_baseline.json'
BASE = ROOT + BASE_REL
REASON = ('[v3.326.0] A1 第九刀:五路回收算法（向量文本去重 / 向量遗忘价值淘汰 / 摘要硬上限 / '
          '孤儿物资 ops / 图谱同名角色合并）从宿主 MemoryEngine.optimizeMemory() 外移为 memory-gc.js'
          '（164 行块 → 44 行取库-注入-写回-落账），宿主净删 114 行 18512 → 18398；'
          '模块侧另做**故障隔离加固**（第 5 路与闭包归因各自 try/catch，失败时零写并具名 graphThrew / '
          'cascadeThrew），并补 `zeroWrite` 声明。全为活跃代码**外移与减量**，非死代码回流。'
          '行上界按「实测 + slack」收紧贴回（此前 18912 的余量 514 已越 maxSlack 400，'
          '会让上界自洽类判据翻红）。')


def sha(t):
    return hashlib.sha256(t.encode('utf-8')).hexdigest()[:12]


def main():
    os.makedirs(BAK, exist_ok=True)
    old = io.open(BASE, encoding='utf-8').read()
    io.open(BAK + 'host_beast_baseline.json.pre3326', 'w', encoding='utf-8').write(old)
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