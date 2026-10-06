#!/usr/bin/env python3
"""v3.287.0 · O2：scan_ui_interaction.mjs 的三档敏感度实测（反恒绿探测器）。

档位定义（本仓登记口径，与 v3226 J3 一致）：
  H = 不改动                          → 期望 exit 0
  G = 镜像根目录全部 .js 删掉          → 期望非 0（本门读 settings-ui.js 面）
  T = 镜像 tests/ 下（除 audit/ 与 _audit_lib.mjs）所有 .mjs 置为 `// gutted`
      → 期望 0 或非 0 都算合格，但必须**如实记录**；若 H/G/T 全 0 则是恒绿探测器。

关键：本门**不读 tests/ 面**（它只读 settings-ui.js），所以 T 档对它无影响是正常的，
只要 G 档非 0 就不是恒绿。脚本把三档实测值如实打印，写进登记表时照抄。
"""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path('/home/user/lonsha-memory-plugin')
SCAN = 'tests/audit/scan_ui_interaction.mjs'


def run_at(root: Path) -> int:
    env = dict(os.environ)
    env['LONSHA_AUDIT_ROOT'] = str(root)
    env.pop('LONSHA_AUDIT_FIXTURE', None)
    p = subprocess.run(['node', SCAN], cwd=str(REPO), env=env,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    out = p.stdout.decode('utf-8', 'replace')
    tag = out.strip().splitlines()
    print('    rc=%d | %s' % (p.returncode, (tag[-1][:110] if tag else '')))
    return p.returncode


def mirror(dst: Path):
    """最小镜像：只带本门真需要判的入口面 + 探针真源。"""
    dst.mkdir(parents=True, exist_ok=True)
    for name in ['settings-ui.js']:
        src = REPO / name
        if src.exists():
            shutil.copy2(src, dst / name)


def main():
    print('=== 三档敏感度实测 · scan_ui_interaction.mjs ===')
    with tempfile.TemporaryDirectory() as td:
        base = Path(td) / 'mirror'
        mirror(base)

        print('  H（不改动）')
        rcH = run_at(base)

        g = Path(td) / 'mirror_G'
        mirror(g)
        for f in g.glob('*.js'):
            f.unlink()
        print('  G（根目录 .js 全删）')
        rcG = run_at(g)

        t = Path(td) / 'mirror_T'
        mirror(t)
        (t / 'tests').mkdir(exist_ok=True)
        (t / 'tests' / 'x.test.mjs').write_text('// gutted\n', encoding='utf-8')
        print('  T（tests/ 面掏空）')
        rcT = run_at(t)

    print()
    print('  结果：H=%d  G=%d  T=%d' % (rcH, rcG, rcT))
    if rcH == 0 and rcG == 0 and rcT == 0:
        print('  ✗ 恒绿探测器：三档全 0 —— 本门不合格（J3）')
        return 1
    if rcH != 0:
        print('  ✗ H 档不为 0 —— 干净仓下本门就该通过，请先修门再登记')
        return 1
    print('  ✓ 非恒绿（H=0 且至少 G/T 之一非 0），可登记为 %d %d %d' % (rcH, rcG, rcT))
    return 0


if __name__ == '__main__':
    sys.exit(main())
