#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.341.0 抬版：六源 3.340.0 → 3.341.0（本刀**不新增模块**，extra_js 仍 107）。"""
import io
import json
import subprocess
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
OLD, NEW = '3.340.0', '3.341.0'
TARGETS = [
    ('index.js', "const VERSION = '3.340.0';"),
    ('manifest.json', '"version": "3.340.0"'),
    ('package.json', '"version": "3.340.0"'),
    ('memory-config.js', "let VERSION = '3.340.0'"),
    ('memory-core.js', "let VERSION = '3.340.0'"),
    ('memory-organs.js', "let VERSION = '3.340.0'"),
]
for rel, anchor in TARGETS:
    p = ROOT + rel
    t = io.open(p, encoding='utf-8').read()
    na = anchor.replace(OLD, NEW)
    if t.count(na) >= 1 and t.count(anchor) == 0:
        print('SKIP %s: already %s' % (rel, NEW))
        continue
    n = t.count(anchor)
    if n != 1:
        sys.stderr.write('FAIL: %s anchor hits %d (need 1)\n' % (rel, n))
        sys.exit(1)
    io.open(p, 'w', encoding='utf-8').write(t.replace(anchor, na, 1))
    print('OK %s: %s -> %s' % (rel, OLD, NEW))
for rel in ('manifest.json', 'package.json'):
    d = json.loads(io.open(ROOT + rel, encoding='utf-8').read())
    assert d['version'] == NEW, rel + ' version mismatch'
n = len(json.loads(io.open(ROOT + 'manifest.json', encoding='utf-8').read())['extra_js'])
assert n == 107, '本刀不新增模块，extra_js 应仍 107，实测 %d' % n
print('JSON OK manifest/package: %s / extra_js %d' % (NEW, n))
for rel in ('index.js', 'memory-config.js', 'memory-core.js', 'memory-organs.js', 'story-annual.js'):
    r = subprocess.run(['node', '--check', ROOT + rel], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, rel + ' syntax: ' + r.stderr[-300:]
    print('node --check OK:', rel)
print('DONE bump')