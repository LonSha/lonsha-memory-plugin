#!/usr/bin/env python3
"""v3.286.0 O8 第二刀配套（通用）：实测任意扫描器的 H / G / T 三档退出码。

形态定义逐字来自 tests/audit/audit_scan_probe_matrix.tsv 表头（9~11 行）：
  「镜像整仓（排除 .git/node_modules），G = 删掉镜像根目录全部 .js；
    T = 镜像 tests/ 下（除 audit/ 与 _audit_lib.mjs）所有 .mjs 置为「// gutted」；
    H = 不改动。每个扫描器从**镜像内**路径执行，且带 LONSHA_AUDIT_ROOT=镜像。」

镜像为**最小镜像**：tests/ 全树 + 根级 *.js + manifest.json + PLAN.md（够两门读全部面）。
最小镜像不改变三档的语义，但比整仓复制快两个数量级。

用法：python3 tools/_o8b_gt_probe.py <扫描器相对路径> [更多扫描器...]
"""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
EXTRA = ['index.js', 'manifest.json', 'PLAN.md', 'README.md', 'CHANGELOG.md']


def make_mirror(dst: Path):
    (dst / 'tests').mkdir(parents=True, exist_ok=True)
    shutil.copytree(ROOT / 'tests', dst / 'tests', dirs_exist_ok=True)
    for name in EXTRA:
        p = ROOT / name
        if p.exists():
            shutil.copy2(p, dst / name)
    for p in sorted(ROOT.glob('*.js')):
        shutil.copy2(p, dst / p.name)


def run(mirror: Path, scan_rel: str):
    env = dict(os.environ)
    env['LONSHA_AUDIT_ROOT'] = str(mirror)
    r = subprocess.run([os.environ.get('NODE', 'node'), str(mirror / scan_rel)],
                       cwd=str(mirror), env=env, capture_output=True, text=True, timeout=300)
    lines = ((r.stdout or '') + (r.stderr or '')).strip().split('\n')
    return r.returncode, lines


def probe(scan_rel: str):
    tmp = Path(tempfile.mkdtemp(prefix='o8b-gt-'))
    try:
        h = tmp / 'h'
        make_mirror(h)
        rc_h, out_h = run(h, scan_rel)

        g = tmp / 'g'
        make_mirror(g)
        njs = 0
        for p in sorted(g.glob('*.js')):
            p.unlink()
            njs += 1
        rc_g, out_g = run(g, scan_rel)

        t = tmp / 't'
        make_mirror(t)
        nm = 0
        for p in sorted((t / 'tests').rglob('*.mjs')):
            rel = p.relative_to(t / 'tests').as_posix()
            if rel.startswith('audit/') or rel == '_audit_lib.mjs':
                continue
            p.write_text('// gutted\n', encoding='utf-8')
            nm += 1
        rc_t, out_t = run(t, scan_rel)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print('== %s ==' % scan_rel)
    print('  H = %d  %s   （删根 .js %d 个）' % (rc_h, (out_h[0] if out_h else '')[:110], njs))
    print('  G = %d  %s' % (rc_g, (out_g[0] if out_g else '')[:110]))
    print('  T = %d  %s   （掏空 tests/ .mjs %d 个）' % (rc_t, (out_t[0] if out_t else '')[:110], nm))
    ok = (rc_h == 0 and (rc_g != 0 or rc_t != 0))
    print('  判定：H 必须为 0；G/T 至少一列非 0（否则 = 恒绿探测器）⇒ %s'
          % ('通过' if ok else '★ 恒绿探测器风险'))
    return rc_h, rc_g, rc_t, ok


def main():
    targets = sys.argv[1:] or ['tests/audit/scan_cost_truthfulness.mjs']
    allok = True
    for t in targets:
        _, _, _, ok = probe(t)
        allok = allok and ok
        print()
    print('总结：%s' % ('全部通过' if allok else '★ 有恒绿探测器风险'))
    return 0 if allok else 1


if __name__ == '__main__':
    sys.exit(main())