#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.336.0 版本抬升:六源 3.335.0 → 3.336.0(index / manifest / package / 三模块副本)。
锚点纪律:每个锚点必须恰中 1 次;已是新版则跳过(幂等)。
"""
import io
import json
import subprocess
import sys
ROOT = '/home/user/lonsha-memory-plugin/'
OLD, NEW = '3.335.0', '3.336.0'
TARGETS = [
    ('index.js', "const VERSION = '3.335.0';"),
    ('manifest.json', '"version": "3.335.0"'),
    ('package.json', '"version": "3.335.0"'),
    ('memory-config.js', "let VERSION = '3.335.0'"),
    ('memory-core.js', "let VERSION = '3.335.0'"),
    ('memory-organs.js', "let VERSION = '3.335.0'"),
]


def main():
    for rel, anchor in TARGETS:
        p = ROOT + rel
        t = io.open(p, encoding='utf-8').read()
        new_anchor = anchor.replace(OLD, NEW)
        if t.count(new_anchor) == 1:
            print('SKIP %s: 已是 %s(前次运行已改),跳过' % (rel, NEW))
            continue
        n = t.count(anchor)
        if n != 1:
            print('FAIL: %s 锚点 %r 命中 %d 次(须恰 1),拒绝改写' % (rel, anchor, n))
            sys.exit(1)
        io.open(p, 'w', encoding='utf-8', newline='\n').write(t.replace(anchor, new_anchor, 1))
        t2 = io.open(p, encoding='utf-8').read()
        assert t2.count(new_anchor) == 1, rel + ' 新串须恰在场 1 次'
        print('OK %s: %s → %s' % (rel, OLD, NEW))
    for rel in ('manifest.json', 'package.json'):
        d = json.loads(io.open(ROOT + rel, encoding='utf-8').read())
        assert d['version'] == NEW, rel + ' version 须为 ' + NEW
        print('JSON OK %s: version=%s' % (rel, d['version']))
    for rel in ('index.js', 'memory-config.js', 'memory-core.js', 'memory-organs.js'):
        r = subprocess.run(['node', '--check', ROOT + rel], capture_output=True, text=True, timeout=60)
        assert r.returncode == 0, rel + ' 语法校验失败: ' + r.stderr[-300:]
        print('node --check OK:', rel)
    print('DONE 六源 %s → %s' % (OLD, NEW))


if __name__ == '__main__':
    main()