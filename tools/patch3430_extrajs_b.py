#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# v3.343.0 lian dai deng ji (bu): v3209 liang chu extra_js shu liang suo 107 -> 108.
# Mao dian zou u-escape chun ASCII yuan ma, bi mian CJK kuo hao zhuan lu cha cuo.
import io
P = '/home/user/lonsha-memory-plugin/tests/v3209_migration_registry.test.mjs'
s = io.open(P, encoding='utf-8').read()
A1 = "=== 107, 'extra_js \u987b 107 \u9879\uff08v3.340.0 M4-X4 \u65b0\u589e qa-thread.js,106 \u2192 107\uff09"
R1 = ("=== 108, 'extra_js \u987b 108 \u9879\uff08v3.343.0 M4-X5 \u65b0\u589e testimony-board.js"
      ",107 \u2192 108\uff09\uff08v3.340.0 M4-X4 \u65b0\u589e qa-thread.js,106 \u2192 107\uff09")
A2 = "=== 107, 'extra_js \u62bd\u53d6\u5668\u5e94\u5f97 107 \u9879\uff08v3.340.0 M4-X4 \u65b0\u589e qa-thread.js,106 \u2192 107\uff09"
R2 = ("=== 108, 'extra_js \u62bd\u53d6\u5668\u5e94\u5f97 108 \u9879\uff08v3.343.0 M4-X5 \u65b0\u589e"
      " testimony-board.js,107 \u2192 108\uff09\uff08v3.340.0 M4-X4 \u65b0\u589e qa-thread.js,106 \u2192 107\uff09")
print('A1', s.count(A1), 'A2', s.count(A2))
for A, R, lab in ((A1, R1, 'mf'), (A2, R2, 'files')):
    n = s.count(A)
    assert n == 1, '%s anchor %d' % (lab, n)
    s = s.replace(A, R, 1)
    print('OK', lab)
io.open(P, 'w', encoding='utf-8').write(s)
print('DONE v3209 fix')
