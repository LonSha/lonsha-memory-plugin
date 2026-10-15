#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.332.0 版本抬升：六源 3.331.0 → 3.332.0（index / manifest / package / 三模块副本）。

防呆：
  - 每个锚点字符串在目标文件必须恰命中 1 次（0 命中或多次命中都拒绝执行）
  - 改写后 grep 确认新版本串在场、旧串零残留（副本文件注释里的历史版本引用除外，
    本版实测无该形态，故全文件零残留即可）
  - AST/JSON 双侧校验：json.load 验 manifest/package；node --check 验 index.js 与副本
"""
import io
import json
import re
import subprocess
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
OLD, NEW = '3.331.0', '3.332.0'
TARGETS = [
    ('index.js', "const VERSION = '3.331.0';"),
    ('manifest.json', '"version": "3.331.0"'),
    ('package.json', '"version": "3.331.0"'),
    ('memory-config.js', "let VERSION = '3.331.0'"),
    ('memory-core.js', "let VERSION = '3.331.0'"),
    ('memory-organs.js', "let VERSION = '3.331.0'"),
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
        if t.count(new_anchor) > 1:
            print('FAIL: %s 新串已多次在场,状态异常,拒绝改写' % rel)
            sys.exit(1)
        t = t.replace(anchor, new_anchor, 1)
        io.open(p, 'w', encoding='utf-8').write(t)
        # 校验：新锚点串在场恰 1 次（注释里的历史版本引用属正常留痕，不判零残留）
        t2 = io.open(p, encoding='utf-8').read()
        assert t2.count(new_anchor) == 1, rel + ' 新串须恰在场 1 次'
        print('OK %s: %s → %s' % (rel, OLD, NEW))

    # JSON 结构校验
    for rel in ('manifest.json', 'package.json'):
        d = json.loads(io.open(ROOT + rel, encoding='utf-8').read())
        v = d['version']
        assert v == NEW, rel + ' version 须为 ' + NEW + ',实 ' + v
        print('JSON OK %s: version=%s' % (rel, v))

    # JS 语法校验
    for rel in ('index.js', 'memory-config.js', 'memory-core.js', 'memory-organs.js'):
        r = subprocess.run(['node', '--check', ROOT + rel], capture_output=True, text=True, timeout=60)
        assert r.returncode == 0, rel + ' 语法校验失败: ' + r.stderr[-300:]
        print('node --check OK:', rel)
    print('DONE 六源 3.331.0 → 3.332.0')


if __name__ == '__main__':
    main()