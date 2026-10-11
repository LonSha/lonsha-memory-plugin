#!/usr/bin/env python3
"""v3.318.0 · O2：scan_ui_narrow_layout.mjs 三档敏感度实测（口径与 tools/_o2b_gt_probe.py 一致）。

档位：H = 不改动 / G = 镜像根目录全部 .js 删掉 / T = 镜像 tests/ 面掏空。
本门只读 settings-ui.js ⇒ T 档对它无影响是正常的，只要 G 档非 0 就不是恒绿探测器。
"""
import os, shutil, subprocess, tempfile
from pathlib import Path

REPO = Path('/home/user/lonsha-memory-plugin')
SCAN = 'tests/audit/scan_ui_narrow_layout.mjs'


def run_at(root):
    env = dict(os.environ)
    env['LONSHA_AUDIT_ROOT'] = str(root)
    env.pop('LONSHA_AUDIT_FIXTURE', None)
    p = subprocess.run(['node', SCAN], cwd=str(REPO), env=env,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    out = p.stdout.decode('utf-8', 'replace').strip().splitlines()
    print('    rc=%d | %s' % (p.returncode, (out[-1][:120] if out else '')))
    return p.returncode


def mirror(dst):
    dst.mkdir(parents=True, exist_ok=True)
    for name in ['settings-ui.js']:
        src = REPO / name
        if src.exists():
            shutil.copy2(src, dst / name)


with tempfile.TemporaryDirectory() as td:
    td = Path(td)
    base = td / 'mirror'; mirror(base)
    print('  H（不改动）'); rcH = run_at(base)
    g = td / 'mirror_G'; mirror(g)
    for f in g.glob('*.js'): f.unlink()
    print('  G（根目录 .js 全删）'); rcG = run_at(g)
    t = td / 'mirror_T'; mirror(t)
    (t / 'tests').mkdir(exist_ok=True)
    (t / 'tests' / 'x.test.mjs').write_text('// gutted' + chr(10), encoding='utf-8')
    print('  T（tests/ 面掏空）'); rcT = run_at(t)
    print()
    print('  结果：H=%d  G=%d  T=%d' % (rcH, rcG, rcT))
    if rcH == 0 and rcG == 0 and rcT == 0:
        print('  X 恒绿探测器'); raise SystemExit(1)
    if rcH != 0:
        print('  X H 不为 0'); raise SystemExit(1)
    print('  OK 非恒绿，可登记为 %d %d %d' % (rcH, rcG, rcT))
