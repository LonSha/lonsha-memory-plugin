#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/_v3560_check.py - 升版后自检：六版本源一致 + manifest 登记到位。"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(rel):
    with open(os.path.join(ROOT, rel), 'r', encoding='utf-8') as f:
        return f.read()


man = json.loads(read('manifest.json'))
pkg = json.loads(read('package.json'))
print('manifest.version =', man.get('version'))
print('package.version  =', pkg.get('version'))
print('extra_js count   =', len(man['extra_js']))
NEW = ['evidence-solver.js', 'resolution-ladder.js', 'scene-orchestrator.js']
for m in NEW:
    print('  registered %-24s %s' % (m, m in man['extra_js']))
print('index.js VERSION  =', [l.strip() for l in read('index.js').splitlines() if 'const VERSION' in l][:1])
for rel in ('memory-core.js', 'memory-config.js', 'memory-organs.js'):
    hit = [l.strip() for l in read(rel).splitlines() if l.startswith('let VERSION')]
    print('%-18s %s' % (rel, hit[:1]))
