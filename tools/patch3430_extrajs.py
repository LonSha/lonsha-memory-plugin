#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.343.0 连带登记:extra_js 107 -> 108 引发的既有档加法补登。
纪律:锚点必须恰中 1 次;已改则幂等跳过;只补当版读数,不改判据语义。"""
import io
ROOT = '/home/user/lonsha-memory-plugin/'

def sub1(rel, old, new, label):
    p = ROOT + rel
    s = io.open(p, encoding='utf-8').read()
    n = s.count(old)
    if n == 0:
        print('SKIP %s: %s(锚点 0 次,视为已改)' % (rel, label))
        return
    assert n == 1, '%s %s 锚 %d 次(应 1)' % (rel, label, n)
    io.open(p, 'w', encoding='utf-8').write(s.replace(old, new, 1))
    print('OK %s: %s' % (rel, label))

# v3209:两处 107 锁
sub1('tests/v3209_migration_registry.test.mjs',
     "A(mf.extra_js.length === 107, 'extra_js 须 107 项(v3.340.0 M4-X4 新增 qa-thread.js,106 → 107)",
     "A(mf.extra_js.length === 108, 'extra_js 须 108 项(v3.343.0 M4-X5 新增 testimony-board.js,107 → 108)(v3.340.0 M4-X4 新增 qa-thread.js,106 → 107)",
     '108 (mf)')
sub1('tests/v3209_migration_registry.test.mjs',
     "A(files.length === 107, 'extra_js 抽取器应得 107 项(v3.340.0 M4-X4 新增 qa-thread.js,106 → 107)",
     "A(files.length === 108, 'extra_js 抽取器应得 108 项(v3.343.0 M4-X5 新增 testimony-board.js,107 → 108)(v3.340.0 M4-X4 新增 qa-thread.js,106 → 107)",
     '108 (files)')
# v3324
sub1('tests/v3324_d_pack_extraction_driver.test.mjs',
     "assert.equal(MF.extra_js.length, 107, 'v3.328.0 F 包新增 branch-canon.js / fated-recall.js:分发面 104 → 106(v3.327.0 E 包记忆侧是 102 → 104);v3.340.0 M4-X4 新增 qa-thread.js:106 → 107,实 ' + MF.extra_js.length);",
     "assert.equal(MF.extra_js.length, 108, 'v3.328.0 F 包新增 branch-canon.js / fated-recall.js:分发面 104 → 106(v3.327.0 E 包记忆侧是 102 → 104);v3.340.0 M4-X4 新增 qa-thread.js:106 → 107;v3.343.0 M4-X5 新增 testimony-board.js:107 → 108,实 ' + MF.extra_js.length);",
     'len')
sub1('tests/v3324_d_pack_extraction_driver.test.mjs',
     "assert.equal(MF.extra_js.slice(-2).join(','), 'fated-recall.js,qa-thread.js',",
     "assert.equal(MF.extra_js.slice(-2).join(','), 'qa-thread.js,testimony-board.js',",
     'tail slice(-2)')
# v3325
sub1('tests/v3325_d_pack_memory_center_pages.test.mjs',
     "assert.equal(MF.extra_js.length, 107, 'extra_js 107(v3.340.0 M4-X4 新增 qa-thread.js,106 → 107;106 是 v3.328.0 F 包新增 branch-canon.js / fated-recall.js;102 → 104 是 v3.327.0 E 包记忆侧的账),实 ' + MF.extra_js.length);",
     "assert.equal(MF.extra_js.length, 108, 'extra_js 108(v3.343.0 M4-X5 新增 testimony-board.js,107 → 108;107 是 v3.340.0 M4-X4 新增 qa-thread.js;106 是 v3.328.0 F 包新增 branch-canon.js / fated-recall.js;102 → 104 是 v3.327.0 E 包记忆侧的账),实 ' + MF.extra_js.length);",
     'len')
# v3328
sub1('tests/v3328_f_pack_canon_fated.test.mjs',
     "assert.equal(MF.extra_js.length, 107, '分发面长度(v3.328.0 F 包两支 + v3.340.0 M4-X4 qa-thread.js)');",
     "assert.equal(MF.extra_js.length, 108, '分发面长度(v3.328.0 F 包两支 + v3.340.0 M4-X4 qa-thread.js + v3.343.0 M4-X5 testimony-board.js)');",
     'len')
sub1('tests/v3328_f_pack_canon_fated.test.mjs',
     "assert.deepEqual(MF.extra_js.slice(-2), ['fated-recall.js', 'qa-thread.js']);",
     "assert.deepEqual(MF.extra_js.slice(-2), ['qa-thread.js', 'testimony-board.js']);",
     'tail slice(-2)')
print('DONE patch3430_extrajs')
