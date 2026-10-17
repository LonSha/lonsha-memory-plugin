#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.341.0 M4-X2 内核刀：把 tools/frag3410/ 的四个片段拼进 story-annual.js。

口径：
  · 每个锚点**必须恰中 1 次**（0 次 / 多次一律退出，不写半成品）；
  · 片段逐字取自 tools/frag3410/part_{a,b,c,d}.js（唯一真源，不在本脚本里重打）；
  · 抬 SA_VERSION 2 → 3，并把新面挂进导出面（既有 31 项逐字不动，纯加法）。
"""
import io
import re
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
TARGET = ROOT + 'story-annual.js'
FRAG = ROOT + 'tools/frag3410/'
BAK = '/tmp/bak3410/'

src = io.open(TARGET, encoding='utf-8').read()
if 'M4-X2' in src:
    sys.stderr.write('FAIL: story-annual.js 里已有 M4-X2 痕迹（可能已打过补丁）\n')
    sys.exit(1)

parts = {}
for name in ('a', 'b', 'c', 'd'):
    parts[name] = io.open(FRAG + 'part_%s.js' % name, encoding='utf-8').read().rstrip('\n')


def sub1(text, anchor, repl, label):
    n = text.count(anchor)
    assert n == 1, '%s 锚点命中 %d 次（须 1）: %r' % (label, n, anchor[:80])
    return text.replace(anchor, repl, 1)


# ① 常量面（part_a）：挂在 FOUL_WORDS 之后
A_FOUL = ("    const FOUL_WORDS = Object.freeze(['出戏', '圈内', '系统提示', 'token', 'prompt', 'NSFW']);")
src = sub1(src, A_FOUL, A_FOUL + '\n' + parts['a'], '① 常量面插入点')

# ②③④ 三面（compose / composeForPlayer + rebuildAffected / applyEdits + composeLine + 草稿册）
A_DESC = '    function describe(deps) {'
src = sub1(src, A_DESC, parts['b'] + '\n' + parts['c'] + '\n' + parts['d'] + '\n' + A_DESC, '② 成稿三面插入点')

# ⑤ 版本：形状变了必须抬
src = sub1(src, 'const SA_VERSION = 2;', 'const SA_VERSION = 3;', '⑤ SA_VERSION')

# ⑥ describe 增加两格读数（与既有 smokeWords/foulWords 同形；不动任何既有键）
A_DE = 'smokeWords: SMOKE_WORDS.slice(), foulWords: FOUL_WORDS.slice(), itemMax: ITEM_MAX,'
src = sub1(src, A_DE,
           A_DE + '\n            sectionKinds: SECTION_KINDS.slice(), composeSources: COMPOSE_SOURCES.slice(),',
           '⑥ describe 读数字段')

# ⑦ 导出面：既有 31 项逐字不动，纯加法（+13）
A_API = '        describe, selfCheck, line,'
src = sub1(src, A_API,
           '        DRAFT_KIND, DRAFT_SECTION_FIELDS, SECTION_KINDS, SECTION_LABEL, COMPOSE_SOURCES, chapterKey, sectionOf,\n'
           '        compose, composeForPlayer, rebuildAffected, applyEdits, composeLine, normalizeDrafts, draftLine,\n'
           + A_API,
           '⑦ 导出面')

assert src.count('function compose(rev, opts) {') == 1
assert src.count('function composeForPlayer(rev, opts) {') == 1
assert src.count('function rebuildAffected(drafts, stale, opts) {') == 1
assert src.count('function applyEdits(draft, patch) {') == 1
assert src.count('function composeLine(read) {') == 1
assert src.count('function normalizeDrafts(raw) {') == 1
assert src.count('function draftLine(read) {') == 1
assert src.count('const DRAFT_KIND') == 1
assert src.count('const SA_VERSION = 3;') == 1
io.open(BAK + 'story-annual.js.pre3410', 'w', encoding='utf-8').write(
    io.open(TARGET, encoding='utf-8').read())
io.open(TARGET, 'w', encoding='utf-8').write(src)
print('story-annual.js 已拼装：%d 行' % (src.count('\n') + 1))
