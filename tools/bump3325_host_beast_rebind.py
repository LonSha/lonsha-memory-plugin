#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.325.0 抬版连带：宿主分诊基线重建 + 行/成员上界抬升（读数零手抄，沿用 v3.324.0 范式）。
"""
import hashlib
import io
import json
import subprocess
import sys
ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3325/'
BASE_REL = 'tests/audit/host_beast_baseline.json'
BASE = ROOT + BASE_REL
REASON = ('[v3.325.0] D 包记忆侧收口第二刀（M3-O8 记忆控制中心从技术表变成可操作资料页）：'
          '宿主 index.js 落两个出口（memoryCenterSourceText 真原文取数口：只走既有账本登记表 + '
          "facet.textFields 单一真源，不新造字段口径、不新开跨仓契约面；memoryCenterFactState "
          '事实账读口：引用而非拷贝）+ 装配点补四个**可选**依赖（缺席即相应能力降级并具名，'
          '不进 REQUIRED_DEPS：把落靠能力升为硬依赖等于把整面弄瞎）+ 两处 dispatch/step 传参 '
          '（textSource / factState / batchSelection / profileKinds）+ 诊断行并进组织层读数 '
          '（资料页 / 详情与正文通道 / 批量预览态）。全为活跃功能增长、非死代码回流。')
def sha(t):
    return hashlib.sha256(t.encode('utf-8')).hexdigest()[:12]
def main():
    old = io.open(BASE, encoding='utf-8').read()
    io.open(BAK + 'host_beast_baseline.json.pre3325', 'w', encoding='utf-8').write(old)
    r = subprocess.run([sys.executable, ROOT + 'tools/_rebuild_host_beast.py', REASON, '--force'],
                       cwd=ROOT, capture_output=True, text=True, timeout=600)
    print(r.stdout)
    if r.returncode != 0:
        sys.stderr.write(r.stderr)
        print('重建失败，未继续（基线保持原样）')
        sys.exit(2)
    d = json.loads(io.open(BASE, encoding='utf-8').read())
    t = d['readings']['total_lines']
    m = d['readings']['member_count']
    print('实测 rebuilt: lines=%d members=%d' % (t, m))
    lb = d['line_budget']
    slack = lb['maxSlack']
    mslack = lb['member_max_slack']
    new_ceiling = t + slack
    was_ceiling = lb['ceiling']
    was_member = lb['member_ceiling']
    if t > was_ceiling:
        print('行数实测 %d 已越上界 %d ⇒ 抬升成立' % (t, was_ceiling))
    else:
        print('行数实测 %d 仍在上界 %d 内（余量 %d）⇒ 仍抬，理由是让 ceiling 与实测贴回 slack'
              % (t, was_ceiling, was_ceiling - t))
    lb['ceiling'] = new_ceiling
    lb['note'] = REASON
    entry = {'ceiling': new_ceiling, 'reason': REASON}
    if m > was_member:
        lb['member_ceiling'] = m + mslack
        entry['member_ceiling'] = lb['member_ceiling']
        print('成员实测 %d 已越过上界 %d ⇒ 抬到 %d' % (m, was_member, lb['member_ceiling']))
    else:
        entry['member_ceiling'] = was_member
        print('★ 成员实测 %d 未越上界 %d ⇒ 按先例**不抬**（在线内就不抬）' % (m, was_member))
    lb['history'].append(entry)
    print('line_budget: ceiling %d → %d（余量 %d）/ member_ceiling %d（余量 %d）'
          % (was_ceiling, new_ceiling, new_ceiling - t, lb['member_ceiling'], lb['member_ceiling'] - m))
    io.open(BASE, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=1) + '\n')
    new = io.open(BASE, encoding='utf-8').read()
    print('write %s %d → %d 字节 (sha %s → %s)'
          % (BASE_REL, len(old.encode('utf-8')), len(new.encode('utf-8')), sha(old), sha(new)))
    chk = json.loads(io.open(BASE, encoding='utf-8').read())
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
