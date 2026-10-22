#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tools/bump3580.py - v3.358.0 upgrade (memory side, phase-6 batch D).
Six version sources stay in sync (scan_version_guard V1/V1b/V6/V7):
  index.js                    const VERSION = '3.358.0';
  manifest.json/package.json  "version": "3.358.0"
  memory-config.js / memory-core.js / memory-organs.js  let VERSION = '3.358.0';
manifest.extra_js appends three new modules:
  continuous-research.js / conditional-consequence.js / institutional-memory.js
Every anchor must hit exactly once, otherwise abort whole thing.
Idempotent: if already at NEW version, report and exit 0.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OLD = '3.357.0'
NEW = '3.358.0'
NEW_MODULES = [
    'continuous-research.js',
    'conditional-consequence.js',
    'institutional-memory.js'
]

def read(rel):
    with open(os.path.join(ROOT, rel), 'r', encoding='utf-8') as f:
        return f.read()

def write(rel, text):
    with open(os.path.join(ROOT, rel), 'w', encoding='utf-8') as f:
        f.write(text)

def sub_once(text, old, new, label):
    n = text.count(old)
    if n != 1:
        print('FAIL %s: anchor hit %d times (need exactly 1)' % (label, n))
        sys.exit(1)
    return text.replace(old, new)

def main():
    idx = read('index.js')
    if ("const VERSION = '%s';" % NEW) in idx:
        print('SKIP already at %s' % NEW)
    else:
        idx = sub_once(idx, "const VERSION = '%s';" % OLD, "const VERSION = '%s';" % NEW, 'index.js VERSION')
        write('index.js', idx)

    pkg = read('package.json')
    if ('"version": "%s"' % NEW) not in pkg:
        pkg = sub_once(pkg, '"version": "%s"' % OLD, '"version": "%s"' % NEW, 'package.json version')
        write('package.json', pkg)

    for rel in ('memory-core.js', 'memory-config.js', 'memory-organs.js'):
        s = read(rel)
        if ("let VERSION = '%s';" % NEW) not in s:
            s = sub_once(s, "let VERSION = '%s';" % OLD, "let VERSION = '%s';" % NEW, rel + ' VERSION')
            write(rel, s)

    man = json.loads(read('manifest.json'))
    if man.get('version') == OLD:
        man['version'] = NEW
    elif man.get('version') != NEW:
        print('FAIL manifest version is neither %s nor %s (actual %s)' % (OLD, NEW, man.get('version')))
        sys.exit(1)

    extra = man['extra_js']
    for m in NEW_MODULES:
        if m not in extra:
            extra.append(m)
    man['extra_js'] = extra
    write('manifest.json', json.dumps(man, ensure_ascii=False, indent=2) + '\n')
    print('OK version %s -> %s ; extra_js %d' % (OLD, NEW, len(extra)))

if __name__ == '__main__':
    main()
