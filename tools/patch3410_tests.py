#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.341.0 M4-X2 连带面：把当版真值同步进既有套件的登记值。

同步项（逐项都是**上一刀交下来的数量/值锁**，不抬版就必红）：
  · v3283   ARCHIVE_TOP_LEVEL_KEYS 值级副本：len 661→677 / md5 127993d2→36a755a4
            （`annualDrafts` 加法；qaThread 时已是 661，本刀再 +1 键）
  · v3202   豁免表键数 16→17
  · v3360   A1 导出面本档出生值 31 + 既有 31 项逐字不动；SA_VERSION ≥ 2
  · v3327   saWant 词表同步为含成稿面的组合
"""
import io

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3410/'


def patch(rel, pairs, label):
    p = ROOT + rel
    t = io.open(p, encoding='utf-8').read()
    io.open(BAK + rel.replace('/', '_') + '.pre3410', 'w', encoding='utf-8').write(t)
    for old, new in pairs:
        n = t.count(old)
        assert n == 1, '%s: %r 命中 %d 次（须 1）' % (label, old[:70], n)
        t = t.replace(old, new, 1)
    io.open(p, 'w', encoding='utf-8').write(t)
    print('OK %s（%d 处）' % (rel, len(pairs)))


SA_OLD = """        'SA_KIND', 'SA_VERSION', 'SMOKE_WORDS', 'VERSIONS', 'arrOf', 'belletristic', 'build', 'clip', 'describe', 'edit',
        'evidenceOf', 'forPlayer', 'gatedVersions', 'hash32', 'keyOf', 'line', 'numOr', 'review', 'selfCheck',
        'splitPoints', 'spoilerGate', 'staleRefs', 'strOf', 'twoVersions'];"""
SA_NEW = """        'SA_KIND', 'SA_VERSION', 'SMOKE_WORDS', 'VERSIONS', 'arrOf', 'belletristic', 'build', 'clip', 'describe', 'edit',
        'evidenceOf', 'forPlayer', 'gatedVersions', 'hash32', 'keyOf', 'line', 'numOr', 'review', 'selfCheck',
        'splitPoints', 'spoilerGate', 'staleRefs', 'strOf', 'twoVersions',
        /* [v3.341.0 · M4-X2] 成稿面加法（既有 31 项逐字不动）。 */
        'DRAFT_KIND', 'DRAFT_SECTION_FIELDS', 'SECTION_KINDS', 'SECTION_LABEL', 'COMPOSE_SOURCES',
        'chapterKey', 'sectionOf', 'compose', 'composeForPlayer', 'rebuildAffected',
        'applyEdits', 'composeLine', 'normalizeDrafts', 'draftLine'];"""

patch('tests/v3283_o7_const_table_copy_ledger.test.mjs', [
    ("['ARCHIVE_TOP_LEVEL_KEYS', ['index.js', 'memory-organs.js'], 661, '127993d2', 'Object.freeze(['],",
     "['ARCHIVE_TOP_LEVEL_KEYS', ['index.js', 'memory-organs.js'], 677, '36a755a4', 'Object.freeze(['],"),
    ("md5 127993d2（v3.340.0 M4-X4 增 qaThread）",
     "md5 36a755a4（v3.341.0 M4-X2 增 annualDrafts；上一刀为 661 / 127993d2）"),
], 'v3283')

patch('tests/v3202_carryover_rollback_breadth.test.mjs', [
    ("    assert.equal(exempt.length, 16, '豁免表本版应为 16 键（v3.340.0 M4-X4 新增 qaThread），实际 ' + exempt.length);",
     "    assert.equal(exempt.length, 17, '豁免表本版应为 17 键（v3.341.0 M4-X2 新增 annualDrafts；上一刀 16），实际 ' + exempt.length);"),
], 'v3202')

patch('tests/v3360_m4o9_knowledge_gate.test.mjs', [
    ("test('v3360 A1. ★★★★ 内核导出面 +3 且既有 27 项逐字不动;SA_VERSION=2', () => {",
     "test('v3360 A1. ★★★★ 内核导出面 +3 且既有 27 项逐字不动;SA_VERSION≥2', () => {"),
    (SA_OLD, SA_NEW),
    ("    assert.equal(SA.SA_VERSION, 2, '形状变了必须抬版本');",
     "    assert.ok(SA.SA_VERSION >= 2, '形状变了必须抬版本（v3.341.0 成稿面后为 3）');"),
    ("    ok('导出 31 项（+3）;SA_VERSION 1→2;依赖面键名逐字未动');",
     "    ok('导出 ' + got.length + ' 项（本档出生 31，v3.341.0 M4-X2 成稿面加至 45）;依赖面键名逐字未动');"),
], 'v3360')

patch('tests/v3327_e_pack_lore_annual.test.mjs', [
    (SA_OLD, SA_NEW),
    ("    ok('lore-import 29 项导出 / story-annual 28 项导出,键名与宿主装配点逐字对齐');",
     "    ok('lore-import 29 项导出 / story-annual ' + gotSa.length + ' 项导出,键名与宿主装配点逐字对齐');"),
], 'v3327')
print('DONE')