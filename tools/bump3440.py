#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.344.0 抬版:六源 3.343.0 -> 3.344.0 + extra_js 108 -> 109(narrative-layer.js)。

六源(scan_version_guard V1/V2/V6/V7 把守):
  index.js `const VERSION = '3.343.0';`
  manifest.json / package.json `"version": "3.343.0"`
  memory-config.js / memory-core.js / memory-organs.js `let VERSION = '3.343.0'`
每条锚点必须 count==1,否则 abort。
"""
import io
import json
import os
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3440/'
os.makedirs(BAK, exist_ok=True)

OLD = '3.343.0'
NEW = '3.344.0'

TARGETS = [
    ('index.js', "const VERSION = '3.343.0';", "const VERSION = '3.344.0';"),
    ('manifest.json', '"version": "3.343.0"', '"version": "3.344.0"'),
    ('package.json', '"version": "3.343.0"', '"version": "3.344.0"'),
    ('memory-config.js', "let VERSION = '3.343.0';", "let VERSION = '3.344.0';"),
    ('memory-core.js', "let VERSION = '3.343.0';", "let VERSION = '3.344.0';"),
    ('memory-organs.js', "let VERSION = '3.343.0';", "let VERSION = '3.344.0';"),
]

for name, old, new in TARGETS:
    p = ROOT + name
    s = io.open(p, encoding='utf-8').read()
    n = s.count(old)
    if n != 1:
        sys.stderr.write('FAIL: %s 版本锚点命中 %d 次(应为 1)\n' % (name, n))
        sys.exit(21)
    io.open(BAK + name + '.pre3440', 'w', encoding='utf-8').write(s)
    io.open(p, 'w', encoding='utf-8').write(s.replace(old, new))
    print('bumped %s' % name)

# extra_js 登记:在 testimony-board.js 之后追加 narrative-layer.js
mp = ROOT + 'manifest.json'
raw = io.open(mp, encoding='utf-8').read()
ANCHOR = '        "testimony-board.js"\n'
ADD = '        "testimony-board.js",\n        "narrative-layer.js"\n'
if '"narrative-layer.js"' in raw:
    print('SKIP extra_js(已登记)')
elif raw.count(ANCHOR) != 1:
    sys.stderr.write('FAIL: extra_js 锚点命中 %d 次(应为 1)\n' % raw.count(ANCHOR))
    sys.exit(22)
else:
    raw = raw.replace(ANCHOR, ADD)
    io.open(mp, 'w', encoding='utf-8').write(raw)
    print('registered extra_js narrative-layer.js')

# 自证:JSON 可解析 + 条目数 + 顺序在场
m = json.loads(io.open(mp, encoding='utf-8').read())
print('manifest version =', m['version'], '| extra_js len =', len(m['extra_js']))
assert m['version'] == NEW, 'manifest version mismatch'
assert m['extra_js'][-1] == 'narrative-layer.js', 'extra_js tail mismatch'
assert os.path.isfile(ROOT + m['extra_js'][-1]), 'extra_js file missing on disk'
print('SELFCHECK OK')