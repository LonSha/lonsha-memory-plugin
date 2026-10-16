#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.340.0 连带登记：新增模块 qa-thread.js 抬升 extra_js 106→107 引发的既有档「加法补登记」。
纪律：每个锚点必须恰中 1 次；已改则幂等跳过。不改判据语义，只补当版读数。"""
import io, sys
ROOT = '/home/user/lonsha-memory-plugin/'
edits = []

def sub1(rel, old, new, label):
    p = ROOT + rel
    s = io.open(p, encoding='utf-8').read()
    n = s.count(old)
    if n == 0:
        print('SKIP %s: %s（锚点 0 次，视为已改）' % (rel, label))
        return
    assert n == 1, '%s %s 锚点 %d 次（应 1）: %r' % (rel, label, n, old[:60])
    io.open(p, 'w', encoding='utf-8').write(s.replace(old, new, 1))
    print('OK %s: %s' % (rel, label))

# v3209：extra_js 数量锁（两处）
sub1('tests/v3209_migration_registry.test.mjs',
     "A(mf.extra_js.length === 106, 'extra_js 须 106 项",
     "A(mf.extra_js.length === 107, 'extra_js 须 107 项（v3.340.0 M4-X4 新增 qa-thread.js，106 → 107）",
     'extra_js===106 (mf)')
sub1('tests/v3209_migration_registry.test.mjs',
     "A(files.length === 106, 'extra_js 抽取器应得 106 项",
     "A(files.length === 107, 'extra_js 抽取器应得 107 项（v3.340.0 M4-X4 新增 qa-thread.js，106 → 107）",
     'extra_js===106 (files)')
# v3324
sub1('tests/v3324_d_pack_extraction_driver.test.mjs',
     "assert.equal(MF.extra_js.length, 106, 'v3.328.0 F 包新增 branch-canon.js / fated-recall.js:分发面 104 → 106(v3.327.0 E 包记忆侧是 102 → 104),实 ' + MF.extra_js.length);",
     "assert.equal(MF.extra_js.length, 107, 'v3.328.0 F 包新增 branch-canon.js / fated-recall.js:分发面 104 → 106(v3.327.0 E 包记忆侧是 102 → 104);v3.340.0 M4-X4 新增 qa-thread.js:106 → 107,实 ' + MF.extra_js.length);",
     'len 106')
sub1('tests/v3324_d_pack_extraction_driver.test.mjs',
     "assert.equal(MF.extra_js.slice(-2).join(','), 'branch-canon.js,fated-recall.js',",
     "assert.equal(MF.extra_js.slice(-2).join(','), 'fated-recall.js,qa-thread.js',",
     'tail slice(-2)')
# v3325
sub1('tests/v3325_d_pack_memory_center_pages.test.mjs',
     "assert.equal(MF.extra_js.length, 106, 'extra_js 106(v3.328.0 F 包新增 branch-canon.js / fated-recall.js;102 → 104 是 v3.327.0 E 包记忆侧的账),实 ' + MF.extra_js.length);",
     "assert.equal(MF.extra_js.length, 107, 'extra_js 107(v3.340.0 M4-X4 新增 qa-thread.js,106 → 107;106 是 v3.328.0 F 包新增 branch-canon.js / fated-recall.js;102 → 104 是 v3.327.0 E 包记忆侧的账),实 ' + MF.extra_js.length);",
     'len 106')
# v3328
sub1('tests/v3328_f_pack_canon_fated.test.mjs',
     "assert.equal(MF.extra_js.length, 106, '分发面长度(本版新增两支)');",
     "assert.equal(MF.extra_js.length, 107, '分发面长度(v3.328.0 F 包两支 + v3.340.0 M4-X4 qa-thread.js)');",
     'len 106')
sub1('tests/v3328_f_pack_canon_fated.test.mjs',
     "assert.deepEqual(MF.extra_js.slice(-2), ['branch-canon.js', 'fated-recall.js']);",
     "assert.deepEqual(MF.extra_js.slice(-2), ['fated-recall.js', 'qa-thread.js']);",
     'tail slice(-2)')
print('DONE patch3400_extrajs')
