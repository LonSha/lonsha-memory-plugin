#!/usr/bin/env python3
# P8 负控制探针：真源码破坏 —— 把已交付的 X1 塞回现行节的下一步且不带状态字样。
import sys, shutil, subprocess, pathlib
ROOT = pathlib.Path('/home/user/lonsha-memory-plugin')
PLAN = ROOT / 'PLAN.md'
BAK = pathlib.Path('/tmp/PLAN.negprobe.bak')
ANCHOR = '3. **X 系列第二批起步（X2 证据到真实修复的操作流程 / X3 注入策略对照与精确预演）**'
BROKEN = '3. **X 系列首批（X1 结构化证据查询与完整度 / X2 证据到真实修复 / X3 注入策略对照）**'
src = PLAN.read_text(encoding='utf-8')
n = src.count(ANCHOR)
print('anchor hits =', n)
if n != 1:
    print('anchor not unique ==> fail-closed')
    sys.exit(3)
shutil.copyfile(PLAN, BAK)
try:
    PLAN.write_text(src.replace(ANCHOR, BROKEN), encoding='utf-8')
    after = PLAN.read_text(encoding='utf-8')
    assert 'X 系列首批' in after, 'break not landed'
    r = subprocess.run(['node', 'tests/audit/scan_plan_currency.mjs'], cwd=ROOT, capture_output=True, text=True)
    print('broken rc =', r.returncode)
    print(r.stdout.strip()[-600:])
    print(r.stderr.strip()[-400:])
finally:
    shutil.copyfile(BAK, PLAN)
    same = PLAN.read_bytes() == BAK.read_bytes()
    print('restored byte-identical =', same)
    assert same
