#!/usr/bin/env python3
"""v3.296.0 负控制（成员上界面）：v3261 C 交棒判据须逐条可被真破坏翻红。

破坏与预期命中断言一一对应；还原后须回绿。破坏点必须让流程**走到目标断言**
（v1 的教训：只改数值不同步 history 会被更早的「须等于最后一条 history」拦下）。
"""
import io
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
BASE = ROOT / 'tests/audit/host_beast_baseline.json'
TEST = ROOT / 'tests/v3261_a1_memory_books.test.mjs'
ORIG = io.open(BASE, encoding='utf-8').read()


def run_test():
    r = subprocess.run(['node', str(TEST)], cwd=str(ROOT), capture_output=True, text=True, timeout=300)
    return r.returncode, (r.stdout + r.stderr)


def probe(label, mutate, expect):
    b = json.loads(ORIG)
    mutate(b)
    io.open(BASE, 'w', encoding='utf-8').write(json.dumps(b, ensure_ascii=False, indent=1) + '\n')
    try:
        ec, out = run_test()
    finally:
        io.open(BASE, 'w', encoding='utf-8').write(ORIG)
    hit = ''
    for ln in out.split('\n'):
        if 'AssertionError' in ln:
            hit = ln.strip()
            break
    good = (ec != 0) and (expect in hit)
    print('%-18s exit=%d %s 期望「%s」\n                   实：%s'
          % (label, ec, 'PASS' if good else 'FAIL', expect, hit[:120]))
    return good


def set_member(v):
    def f(b):
        b['line_budget']['member_ceiling'] = v
        b['line_budget']['history'][-1]['member_ceiling'] = v
    return f


ok = True
ok &= probe('①越过成员上界', set_member(100), '须 <= 登记上界')
ok &= probe('②成员上界脱节', lambda b: b['line_budget'].pop('member_ceiling', None), '成员数上界必须登记')
ok &= probe('③里程碑成员被改', lambda b: b['line_budget']['history'][0].__setitem__('member_ceiling', 999),
            '首条历史必须是 A1 刀口前的成员基线 549')
ok &= probe('④静默改数', lambda b: b['line_budget'].__setitem__('member_ceiling', 9999),
            '最后一条历史的 member_ceiling')

ec, _ = run_test()
print('还原后 exit=%d %s' % (ec, 'GREEN(ok)' if ec == 0 else 'RED(坏!)'))
allok = ok and ec == 0
print('ALL-NEGCTL-MEMBER', 'PASS' if allok else 'FAIL')
sys.exit(0 if allok else 1)