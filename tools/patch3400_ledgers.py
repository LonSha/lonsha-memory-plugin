#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.340.0 连带登记：v3247 接入面台账补 v3390/v3400；v3281 numOrNull 簇补 qa-thread.js。"""
import io
ROOT = '/home/user/lonsha-memory-plugin/'

def sub1(rel, old, new, label):
    p = ROOT + rel
    s = io.open(p, encoding='utf-8').read()
    n = s.count(old)
    if n == 0:
        print('SKIP %s: %s' % (rel, label)); return
    assert n == 1, '%s %s 锚 %d 次: %r' % (rel, label, n, old[:60])
    io.open(p, 'w', encoding='utf-8').write(s.replace(old, new, 1))
    print('OK %s: %s' % (rel, label))

# v3247 B1 台账：v3390（v3.339.0 漏登）+ v3400（本版）
sub1('tests/v3247_break_kit_consolidation.test.mjs',
     "    'v3380_m4o8_center_actions.test.mjs',",
     "    'v3380_m4o8_center_actions.test.mjs',\n    'v3390_m4x1_lore_manual.test.mjs',\n    'v3400_m4x4_qa_thread.test.mjs',",
     'REGISTRY += v3390/v3400')

# v3281 numOrNull 簇：qa-thread.js 自持一份（与 fact-lifecycle 等模块同形同值）
sub1('tests/v3281_o7_module_copy_ledger.test.mjs',
     "['numOrNull', ['evidence-query.js', 'fact-lifecycle.js', 'memory-center.js', 'memory-package.js', 'memory-tools-api.js', 'repair-settle.js'], 'fe297bb9',",
     "['numOrNull', ['evidence-query.js', 'fact-lifecycle.js', 'memory-center.js', 'memory-package.js', 'memory-tools-api.js', 'qa-thread.js', 'repair-settle.js'], 'fe297bb9',",
     'numOrNull 成员 += qa-thread.js')

# v3325 extra_js 长度（另一处 hard 106，检查是否存在）
print('DONE patch3400_ledgers')