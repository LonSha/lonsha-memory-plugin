#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.345.0 交棒:v3262 / v3263 对 v3209 数量锁的「等号形」断言 → 「仍在场(两形皆认)」。

★ 背景与事实(真源码,零手抄):
  · v3262 / v3263 各有一条**指针式**判据:`assert.ok(/mf\\.extra_js\\.length === \\d+/.test(V3209), 'v3209 数量锁须仍在场...')`
    —— 它守的不是值,而是「**锁仍在场**」(值由当版 manifest 真源接管,避免两份固定数字形成第二真源)。
  · v3.345.0 本刀按仓库长期交棒纪律把 v3209 的 `=== 109` 下界化为 `>= 109`
    (出生值语义:后版只抬不改,上限由各当版档自持)⇒ 该指针断言因「只认等号形」而打偏。

★ 交棒(不弱化):
  · 仍要求「v3209 里存在一条 extra_js 数量判据」——只是承认它已交棒为**下界**形;
  · 两形(`===` / `>=`)都认,缺一即红。
"""
import io
import os
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3445/'
PROBE = '/mf\\.extra_js\\.length === \\d+/.test(V3209)'
FILES = [
    ROOT + 'tests/v3262_native_tools_pristine_fetch.test.mjs',
    ROOT + 'tests/v3263_floor_identity_archive_audit.test.mjs',
]
NEW_MSG = ('v3209 数量锁须仍在场(本版已随交棒改为**下界形**:历史档只守「锁在位」,'
           '具体值由当版 manifest 真源接管)')

texts = {}
bad = 0
for path in FILES:
    texts[path] = io.open(path, encoding='utf-8').read().split('\n')
    hits = [i for i, l in enumerate(texts[path]) if PROBE in l]
    if len(hits) != 1:
        bad += 1
        print('FAIL: %s 探针命中 %d 次(应 1):%s' % (os.path.basename(path), len(hits), PROBE))
        continue
    i = hits[0]
    indent = texts[path][i][:len(texts[path][i]) - len(texts[path][i].lstrip())]
    texts[path][i] = (indent +
                      "assert.ok(/mf\\.extra_js\\.length (?:===|>=) \\d+/.test(V3209), '" +
                      NEW_MSG + "');")
    print('  ok %s 行 %d(缩进 %d 空格)' % (os.path.basename(path), i + 1, len(indent)))

if bad:
    sys.exit(41)

os.makedirs(BAK, exist_ok=True)
for path in texts:
    b = os.path.basename(path)
    io.open(BAK + b + '.pre3445ptr', 'w', encoding='utf-8').write(
        io.open(path, encoding='utf-8').read())
    io.open(path, 'w', encoding='utf-8').write('\n'.join(texts[path]))
    print('PATCHED', b)

for path in texts:
    t = io.open(path, encoding='utf-8').read()
    b = os.path.basename(path)
    print('-- %s 等号形探针残留=%d 两形探针在场=%d' % (
        b, t.count(PROBE), t.count('extra_js\\.length (?:===|>=) ')))