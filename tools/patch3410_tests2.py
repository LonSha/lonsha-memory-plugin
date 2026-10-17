#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.341.0 补丁二：v3360 / v3327 的导出面词表按**排序后的真值**重建。

上一版把新面追加在末尾，而两侧判据都用 `Object.keys(SA).sort()` 对账 ——
预期值必须**整体排序**（追加即错位）。本脚本以磁盘真值为源重写词表。
"""
import io

ROOT = '/home/user/lonsha-memory-plugin/'
SA = io.open(ROOT + 'story-annual.js', encoding='utf-8').read()
api_at = SA.index('    const api = Object.freeze({')
api_end = SA.index('});', api_at)
body = SA[api_at:api_end]
names = []
for line in body.split('\n')[1:]:
    line = line.split('//')[0]
    for x in line.replace('{', '').replace('}', '').split(','):
        x = x.strip()
        if x and ':' not in x and x != 'Object.freeze(':
            names.append(x)
names = sorted(set(names))
print('真源导出 %d 项' % len(names))

OLD_BLOCK = """        'SA_KIND', 'SA_VERSION', 'SMOKE_WORDS', 'VERSIONS', 'arrOf', 'belletristic', 'build', 'clip', 'describe', 'edit',
        'evidenceOf', 'forPlayer', 'gatedVersions', 'hash32', 'keyOf', 'line', 'numOr', 'review', 'selfCheck',
        'splitPoints', 'spoilerGate', 'staleRefs', 'strOf', 'twoVersions',
        /* [v3.341.0 · M4-X2] 成稿面加法（既有 31 项逐字不动）。 */
        'DRAFT_KIND', 'DRAFT_SECTION_FIELDS', 'SECTION_KINDS', 'SECTION_LABEL', 'COMPOSE_SOURCES',
        'chapterKey', 'sectionOf', 'compose', 'composeForPlayer', 'rebuildAffected',
        'applyEdits', 'composeLine', 'normalizeDrafts', 'draftLine'];"""


def line_of(ns, indent):
    rows = ["%s'%s'," % (indent, n) for n in ns]
    return '\n'.join(rows) + '];'


NEW_BLOCK = ('        /* [v3.341.0 · M4-X2] 词表按**排序后真值**逐字对账'
             '（既有 31 项在场，新增成稿面 14 项）。 */\n'
             + line_of(names, '        '))

for rel in ('tests/v3360_m4o9_knowledge_gate.test.mjs', 'tests/v3327_e_pack_lore_annual.test.mjs'):
    p = ROOT + rel
    t = io.open(p, encoding='utf-8').read()
    n = t.count(OLD_BLOCK)
    assert n == 1, '%s 锚点 %d 次' % (rel, n)
    io.open(p, 'w', encoding='utf-8').write(t.replace(OLD_BLOCK, NEW_BLOCK, 1))
    print('OK', rel)
print('DONE')