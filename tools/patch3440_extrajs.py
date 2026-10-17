#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# v3.344.0 lian dai deng ji: extra_js 108 -> 109 yin fa de ji you dang jia fa bu deng.
# Mao dian yi lu chun ASCII (shu zi / fan yi ming / yin hao), bu yong CJK zi mian ye bu yong \\u zhuan yi
# (ben hui hua shi ce: zi mian CJK bei bian ji qi gui fan hua, er shou xie \\u zhuan yi you yi wei bei xie cheng
#  shuang fan xie gang; zui wen de ban fa shi mao dian zhi qu ASCII)。
# Ji lv: mao dian bi xu qia zhong 1 ci; 0 ci shi wei yi gai; zhi bu dang ban du shu, bu gai pan ju yu yi.
import io

ROOT = '/home/user/lonsha-memory-plugin/'

def sub1(rel, old, new, label):
    p = ROOT + rel
    s = io.open(p, encoding='utf-8').read()
    n = s.count(old)
    if n == 0:
        print('SKIP %s: %s (0 ci)' % (rel, label))
        return
    assert n == 1, '%s %s mao %d ci (ying 1)' % (rel, label, n)
    io.open(p, 'w', encoding='utf-8').write(s.replace(old, new, 1))
    print('OK %s: %s' % (rel, label))

# ---- v3209: liang chu shu liang suo 108 -> 109 (chun ASCII mao dian) ----
sub1('tests/v3209_migration_registry.test.mjs',
     "A(mf.extra_js.length === 108, 'extra_js ",
     "A(mf.extra_js.length === 109, 'extra_js ",
     'v3209 mf 109')
sub1('tests/v3209_migration_registry.test.mjs',
     "A(files.length === 108, 'extra_js ",
     "A(files.length === 109, 'extra_js ",
     'v3209 files 109')

# ---- v3324 ----
sub1('tests/v3324_d_pack_extraction_driver.test.mjs',
     "assert.equal(MF.extra_js.length, 108, 'v3.328.0 F",
     "assert.equal(MF.extra_js.length, 109, 'v3.328.0 F",
     'v3324 len 109')
sub1('tests/v3324_d_pack_extraction_driver.test.mjs',
     "assert.equal(MF.extra_js.slice(-2).join(','), 'qa-thread.js,testimony-board.js',",
     "assert.equal(MF.extra_js.slice(-2).join(','), 'testimony-board.js,narrative-layer.js',",
     'v3324 tail slice(-2)')

# ---- v3325 ----
sub1('tests/v3325_d_pack_memory_center_pages.test.mjs',
     "assert.equal(MF.extra_js.length, 108, 'extra_js 108(v3.343.0 M4-X5",
     "assert.equal(MF.extra_js.length, 109, 'extra_js 109(v3.344.0 M4-X6 + v3.343.0 M4-X5",
     'v3325 len 109')

# ---- v3328 ----
sub1('tests/v3328_f_pack_canon_fated.test.mjs',
     "assert.equal(MF.extra_js.length, 108, '",
     "assert.equal(MF.extra_js.length, 109, '",
     'v3328 len 109')
sub1('tests/v3328_f_pack_canon_fated.test.mjs',
     "assert.deepEqual(MF.extra_js.slice(-2), ['qa-thread.js', 'testimony-board.js']);",
     "assert.deepEqual(MF.extra_js.slice(-2), ['testimony-board.js', 'narrative-layer.js']);",
     'v3328 tail slice(-2)')

print('DONE patch3440_extrajs')