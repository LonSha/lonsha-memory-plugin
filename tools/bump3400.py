#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.340.0 抬版：六源 3.339.0 → 3.340.0 + manifest.extra_js 增 qa-thread.js。"""
import io
import json
import subprocess
import sys
ROOT = '/home/user/lonsha-memory-plugin/'
OLD, NEW = '3.339.0', '3.340.0'
TARGETS = [
    ('index.js', "const VERSION = '3.339.0';"),
    ('manifest.json', '"version": "3.339.0"'),
    ('package.json', '"version": "3.339.0"'),
    ('memory-config.js', "let VERSION = '3.339.0'"),
    ('memory-core.js', "let VERSION = '3.339.0'"),
    ('memory-organs.js', "let VERSION = '3.339.0'"),
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

# manifest.extra_js 追加 qa-thread.js（活跃模块，末位）
mp = ROOT + 'manifest.json'
d = json.loads(io.open(mp, encoding='utf-8').read())
if 'qa-thread.js' not in d.get('extra_js', []):
    d['extra_js'].append('qa-thread.js')
    io.open(mp, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=4) + '\n')
    print('OK manifest.extra_js += qa-thread.js (now %d)' % len(d['extra_js']))
else:
    print('SKIP manifest.extra_js already has qa-thread.js')

for rel in ('manifest.json', 'package.json'):
    d = json.loads(io.open(ROOT + rel, encoding='utf-8').read())
    assert d['version'] == NEW, rel + ' version mismatch'
    print('JSON OK %s: %s' % (rel, d['version']))
for rel in ('index.js', 'memory-config.js', 'memory-core.js', 'memory-organs.js', 'qa-thread.js'):
    r = subprocess.run(['node', '--check', ROOT + rel], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, rel + ' syntax: ' + r.stderr[-300:]
    print('node --check OK:', rel)
print('DONE bump')