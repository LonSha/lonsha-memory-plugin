#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.323.0 抬版连带 · 宿主分诊基线重建 + 行/成员上界抬升（读数零手抄）。

为什么本版必须重建基线（账要算清，不是「顺手刷绿」）：
  1. 成员上界 675 已被 v3.321.0 的**四条真实接线**越过 —— v3.322.0 当版只把**行数**面交棒
     （17611 → 18003 / ceiling 18403），成员面当时 669 <= 675 仍在线内，故按纪律**未抬**，
     并在 CHANGELOG 里逐字写了「成员面 669 <= 675 仍在线内，不抬」。这不是遗漏，是本条
     history 的由来。本版三个新模块的**出口成员与诊断行**接进宿主 ⇒ 实测成员 680 > 675，
     越界成立，按 v3.296.0 先例抬到**实测 + slack**。
  2. 行数面：宿主 18003 → 18232（三个取库口 + 三个装配点 + 六处出口 + 自检诊断行 + 一处
     恒定键面修复）。ceiling 18403 余量 171 仍 <= maxSlack 400，**仍在线内**——故这次抬行数
     不是为了「过红线」，而是为了让 ceiling 与实测贴回 slack 距离（余量 171 逼近下界说明
     上界快要被下一条真实接线顶穿，登记面本就应该跟着读数走）。这条动机如实写进 reason。

纪律（沿用本仓既定）：
  - 读数**零手抄**：readings / domains / biggest_members_top40 / measured_at / rebuilds 全由
    探针 tests/audit/host_beast_probe.cjs 经 tools/_rebuild_host_beast.py 重建；
  - line_budget 抬升只走脚本（_rule 原文），三条读数（ceiling / history 末条 / note）自动同步；
  - lb.note 必须**逐字等于** history 末条 reason（由 v3266 C 把守）。
"""
import hashlib
import io
import json
import subprocess
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3323/'
BASE_REL = 'tests/audit/host_beast_baseline.json'
BASE = ROOT + BASE_REL

REASON = ('[v3.323.0] C 包记忆侧三项（M3-X2 关系变化史 / M3-X3 因果链导航 / M3-X4 视角记忆卡）：'
          'relation-history / causal-chain / perspective-card 三模块各自的取库口 + 唯一装配点 + 出口成员'
          '（含一处恒定键面修复：三出口缺席面按在场键序重排 + 补 version/degraded + 时点面补 floor/floorKnown）'
          '接进宿主，全为活跃功能增长、非死代码回流：宿主 18003 → 18232。'
          '行数上界按「实测 + slack」贴回（同时把 v3.321.0 四条接线越过 17801 的欠账一并结清）；'
          '成员上界抬到实测 680 + slack（v3.322.0 时 669 <= 675 仍在线内故未抬，本版真实接线越过 675）。')


def sha(t):
    return hashlib.sha256(t.encode('utf-8')).hexdigest()[:12]


def main():
    old = io.open(BASE, encoding='utf-8').read()
    io.open(BAK + 'host_beast_baseline.json.pre3323', 'w', encoding='utf-8').write(old)

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

    lb = d['line_budget']
    slack = lb['maxSlack']
    mslack = lb['member_max_slack']
    new_ceiling = t + slack
    new_member_ceiling = m + (mslack if mslack <= 30 else 30)

    was_ceiling = lb['ceiling']
    was_member = lb['member_ceiling']
    if t > was_ceiling:
        print('行数实测 %d 已越上界 %d ⇒ 抬升成立' % (t, was_ceiling))
    else:
        print('行数实测 %d 仍在上界 %d 内（余量 %d）⇒ 仍抬，理由是让 ceiling 与实测贴回 slack'
              % (t, was_ceiling, was_ceiling - t))
    if m > was_member:
        print('成员实测 %d 已越上界 %d ⇒ 抬升成立' % (m, was_member))
    else:
        print('★ 成员实测 %d 未越上界 %d —— 本脚本预期越界，请复核读数后再决定是否抬'
              % (m, was_member))

    lb['ceiling'] = new_ceiling
    lb['member_ceiling'] = new_member_ceiling
    lb['note'] = REASON
    hist = lb['history']
    hist.append({'ceiling': new_ceiling, 'reason': REASON, 'member_ceiling': new_member_ceiling})
    print('line_budget: ceiling %d → %d（slack %d）/ member_ceiling %d → %d（余量 %d）'
          % (was_ceiling, new_ceiling, new_ceiling - t, was_member, new_member_ceiling,
             new_member_ceiling - m))

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
    print('自证四条（note==末条 reason / 两上界==末条 history / 两余量 <= slack）通过')
    print('DONE')


if __name__ == '__main__':
    main()