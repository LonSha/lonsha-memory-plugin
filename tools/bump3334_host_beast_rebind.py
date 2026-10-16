#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.334.0 抬版连带:宿主分诊基线重建(读数零手抄,模式沿用 v3.332.0 轮)。"""
import hashlib
import io
import json
import os
import re
import subprocess
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3334/'
BASE_REL = 'tests/audit/host_beast_baseline.json'
BASE = ROOT + BASE_REL
REASON = ('[v3.334.0] M4-O5「长资料完整读取与可恢复解析」宿主侧增量:loreImportParseWindow 出口'
          '(窗口解析的宿主接线:段边界对齐窗口 / 完整度独立核算 readChars/totalChars/nextCursor / '
          '模块缺席同键降级 completeness:unknown 不冒充「没读完」/ 窗口留痕读数 window 键)。'
          '全为活跃功能增长、非死代码回流。行上界按「实测 + slack」贴回;成员面在线内不抬。')


def sha(t):
    return hashlib.sha256(t.encode('utf-8')).hexdigest()[:12]


def main():
    os.makedirs(BAK, exist_ok=True)
    old = io.open(BASE, encoding='utf-8').read()
    io.open(BAK + 'host_beast_baseline.json.pre3334', 'w', encoding='utf-8').write(old)
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
        print('★ 成员实测 %d 未越上界 %d ⇒ 按先例不抬' % (m, was_member))
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