#!/usr/bin/env python3
"""v3.296.0 负控制验证 v2：v3266 C 交棒判据必须逐条可被真破坏翻红。

【v1 的两个踩坑（留痕，都是本仓治过的形态）】
  ① 破坏 ③ 写成「把 v3.266.0 的读数改成 1」—— 1 仍然 < 15000 ⇒ 破坏根本没发生，
     现象是假绿。真破坏须**抹掉 rebuilds 里的里程碑键**（那才是「抹史」）。
  ② 破坏 ①④ 只改 ceiling 没同步 history ⇒ 被更早的「ceiling 须等于最后一条 history」
     拦下，**目标断言（越过上界 / 余量过大）根本没跑到** —— 红是红了，但红在别处，
     等于这两条判据没被验到。修法：破坏时把 history 最后一条一并改，让流程走到目标断言。

每条破坏都断言「红在预期的那句话上」，并把命中的 AssertionError 打出来供核对。
"""
import io
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
BASE = ROOT / 'tests/audit/host_beast_baseline.json'
TEST = ROOT / 'tests/v3266_a1_memory_core.test.mjs'
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
    print('%-16s exit=%d %s 期望命中「%s」\n                 实：%s'
          % (label, ec, 'PASS' if good else 'FAIL', expect, hit[:120]))
    return good


def set_ceil_and_hist(v):
    def f(b):
        b['line_budget']['ceiling'] = v
        b['line_budget']['history'][-1]['ceiling'] = v
        b['line_budget']['note'] = b['line_budget']['history'][-1]['reason']
    return f


ok = True
ok &= probe('①越过上界', set_ceil_and_hist(10000), '须 <= 登记上界')
ok &= probe('②note 脱节', lambda b: b['line_budget'].__setitem__('note', '手改的理由'), '最后一条历史理由的复述')
ok &= probe('③抹掉里程碑', lambda b: b['rebuilds'].pop('v3.266.0', None), '里程碑版本必须在 rebuilds 面留读数')
ok &= probe('④余量过大', set_ceil_and_hist(99999), '不得超过 maxSlack')
ok &= probe('⑤删掉上界', lambda b: b.pop('line_budget', None), '宿主行数上界必须登记')
ok &= probe('⑥里程碑读数造假', lambda b: b['rebuilds']['v3.266.0']['readings'].__setitem__('total_lines', 20000),
            '须低于当时的 15000 线上')

ec, _ = run_test()
print('还原后 exit=%d %s' % (ec, 'GREEN(ok)' if ec == 0 else 'RED(坏!)'))
allok = ok and ec == 0
print('ALL-NEGCTL', 'PASS' if allok else 'FAIL')
sys.exit(0 if allok else 1)