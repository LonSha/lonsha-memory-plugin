#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# v3.343.0 lian dai: v3281 san cu cheng yuan, v3247 REGISTRY, catalog tsv. Pure-ASCII anchors.
import io
ROOT = '/home/user/lonsha-memory-plugin/'

def sub1(rel, old, new, label):
    p = ROOT + rel
    s = io.open(p, encoding='utf-8').read()
    n = s.count(old)
    if n == 0:
        print('SKIP %s: %s (0 hits)' % (rel, label)); return
    assert n == 1, '%s %s anchor %d' % (rel, label, n)
    io.open(p, 'w', encoding='utf-8').write(s.replace(old, new, 1))
    print('OK %s: %s' % (rel, label))

sub1('tests/v3281_o7_module_copy_ledger.test.mjs',
     "'relation-history.js', 'relation-mutual.js'], 'e41493e8'",
     "'relation-history.js', 'relation-mutual.js', 'testimony-board.js'], 'e41493e8'",
     'oneLine += testimony-board')
sub1('tests/v3281_o7_module_copy_ledger.test.mjs',
     "'perspective-card.js', 'relation-history.js'], '245e905a'",
     "'perspective-card.js', 'relation-history.js', 'testimony-board.js'], '245e905a'",
     'floorOrNull += testimony-board')
sub1('tests/v3281_o7_module_copy_ledger.test.mjs',
     "['clip', ['causal-chain.js', 'perspective-card.js'], '3a8dfbfa'",
     "['clip', ['causal-chain.js', 'perspective-card.js', 'testimony-board.js'], '3a8dfbfa'",
     'clip += testimony-board')
sub1('tests/v3247_break_kit_consolidation.test.mjs',
     "    'v3420_m4x3_canon_adoption.test.mjs',\n",
     "    'v3420_m4x3_canon_adoption.test.mjs',\n    'v3430_m4x5_testimony_board.test.mjs',\n",
     'REGISTRY += v3430')
print('DONE patch3430_ledgers')
