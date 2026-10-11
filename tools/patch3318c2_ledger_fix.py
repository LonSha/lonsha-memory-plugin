#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.318.0 收口补刀 C2：改正 evalPage 簇登记值 —— 判据侧「体」的起算点是**参数括号**，
非 `function` 关键字（首版按后者的口径算出 374/765488cd，与判据实测 350/cf4d6596 不符）。
读数仍以判据实测为准（零手抄）：B1 的报错原文即带 350 / cf4d6596。
"""
import io, sys
S = '/home/user/lonsha-memory-plugin/tests/v3284_o7_audit_copy_ledger.test.mjs'
reps = [
 ("['evalPage', ['_mo1_realhost_probe.mjs', '_mo2_realbrowser_probe.mjs'], 374, '765488cd'],",
  "['evalPage', ['_mo1_realhost_probe.mjs', '_mo2_realbrowser_probe.mjs'], 350, 'cf4d6596'],"),
 ('//     evalPage                   2       374   765488cd',
  '//     evalPage                   2       350   cf4d6596'),
]
s = io.open(S, encoding='utf-8').read()
for i, (old, new) in enumerate(reps):
    n = s.count(old)
    if n != 1:
        print('[patch3318c2] 锚点 %d 失配 count=%d ⇒ 不写盘' % (i, n)); sys.exit(1)
for old, new in reps:
    s = s.replace(old, new, 1)
io.open(S, 'w', encoding='utf-8').write(s)
print('[patch3318c2] 写盘完成')
