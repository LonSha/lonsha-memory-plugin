#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""取 M4-X5 宿主接线所需精确锚点(ASCII 转义输出,规避终端中文回显错乱)。"""
import io
import json
ROOT = '/home/user/lonsha-memory-plugin/'
s = io.open(ROOT + 'index.js', encoding='utf-8').read()
L = s.split('\n')


def show(tag, a, b):
    seg = '\n'.join(L[a - 1:b])
    print('### %s (%d-%d) hits=%d' % (tag, a, b, s.count(seg)))
    print(json.dumps(seg, ensure_ascii=True))
    print()


def findone(needle):
    return [n for n, l in enumerate(L, 1) if needle in l]


i = findone('function _qaThreadLib() {')
print('qaThreadLib def lines', i)
if i:
    show('GETTER_TAIL', i[0] - 4, i[0] + 2)

for key in ['\u5bbf\u4e3b\u63a5\u7ebf,\u4e94\u51fa\u53e3', '\u552f\u4e00\u88c5\u914d\u70b9', 'memoryToolsSources()']:
    print(key, findone(key)[:6])

n = findone('\u8d26\u672c\u5b9e\u4f53\u5951\u7ea6\uff1a\u56de\u7b54')
print('selfcheck ledger-entity', n)
if n:
    show('SELFCHECK_ANCHOR', n[0] - 1, n[0] + 1)

p = findone('\u89c6\u89d2\u5361\u4f53\u68c0\u9762')
print('perspective row', p)

e = findone('perspectiveCard(opts) {')
q = findone('qaThread() {')
print('perspectiveCard export', e, 'qaThread export', q)
if e:
    show('PC_EXPORT_HEAD', e[0] - 12, e[0] + 1)
if q:
    show('QT_EXPORT_HEAD', q[0] - 1, q[0] + 1)
