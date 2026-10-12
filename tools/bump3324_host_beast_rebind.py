#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.324.0 抬版连带 · 宿主分诊基线重建 + 行/成员上界抬升（读数零手抄，沿用 v3.323.0 范式）。

为什么本版必须抬（账要算清，不是顺手刷绿）：
  1. 行数面：宿主 18232 -> 18417。D 包第一刀在宿主里落了两个取库口、一处真每轮调用点
     （onMessageReceived 门控之后）、三出口 + 两诊断行 + 自检面两行 + 配置旋钮。
     ceiling 18632 余量 215 仍 <= maxSlack 400，**仍在线内** —— 抬的理由是让 ceiling 与实测
     贴回 slack 距离（登记面本就该跟着读数走），这条动机如实写进 reason。
  2. 成员面：实测 686 > 上界 710？否 —— 686 <= 710，**在线内**。按 v3.322.0 先例
     （669 <= 675 时不抬、并在 CHANGELOG 逐字写明），本版若在线内则同样**不抬**，
     由脚本断言把关，不硬抬。脚本若发现未越界即打印，不擅自改上界。

纪律（沿用本仓既定：
  - 读数零手抄：readings / domains / biggest_members_top40 / measured_at / rebuilds 全由
    探针 tests/audit/host_beast_probe.cjs 经 tools/_rebuild_host_beast.py 重建；
  - line_budget 抬升只走脚本（_rule 原文），三条读数（ceiling / history 末条 / note）自动同步；
  - lb.note 必须逐字等于 history 末条 reason（由 v3266 C 把守）。
"""
import hashlib
import io
import json
import subprocess
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3324/'
BASE_REL = 'tests/audit/host_beast_baseline.json'
BASE = ROOT + BASE_REL
REASON = ('[v3.324.0] D 包记忆侧第一刀（M3-O5 抽取节奏 / M3-O7 可比较修正方案 + M3-X9 局部重提取对照）：'
          'extraction-driver / correction-plan 两模块各自的取库口 + 三个出口成员 + 真每轮调用点'
          '（onMessageReceived 门控之后，只算不写、不改门控判定）+ 两诊断行真跑出口 + 自检面两行，'
          '并新增配置旋钮 extractionProfile（UI → 方法体内提及 → 有调用者，两跳可达）；'
          '另含一处内核真缺陷修复（纠错方案配置面 proofWhy 在对照读数缺失时改为防御性取值，'
          '由本版真源码破坏负控制当场抓出）。全为活跃功能增长、非死代码回流：宿主 18232 → 18417，'
          '成员 680 → 686。行数上界按「实测 + slack」贴回；成员面 686 <= 现有上界 710 仍在线内，'
          '按 v3.322.0 先例**不抬**（在线内就不抬，由脚本断言把关）。')


def sha(t):
    return hashlib.sha256(t.encode('utf-8')).hexdigest()[:12]


def main():
    old = io.open(BASE, encoding='utf-8').read()
    io.open(BAK + 'host_beast_baseline.json.pre3324', 'w', encoding='utf-8').write(old)
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
    hist = lb['history']
    entry = {'ceiling': new_ceiling, 'reason': REASON}
    if m > was_member:
        new_member_ceiling = m + mslack
        lb['member_ceiling'] = new_member_ceiling
        entry['member_ceiling'] = new_member_ceiling
        print('成员实测 %d 已越上界 %d ⇒ 抬到 %d' % (m, was_member, new_member_ceiling))
    else:
        entry['member_ceiling'] = was_member
        print('★ 成员实测 %d 未越上界 %d ⇒ 按先例**不抬**（在线内就不抬）' % (m, was_member))
    hist.append(entry)
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
    print('自证六条（note==末条 reason / 两上界==末条 history / 实测两读数 <= 两上界 / 两余量 <= slack）通过')
    print('DONE')


if __name__ == '__main__':
    main()
