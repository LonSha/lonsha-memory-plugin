#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.345.0 · M4-X7:extra_js 硬锁交棒(109 → 110 下界化)。

本仓纪律(见 v3.326.0 / v3.327.0 / v3.328.0 / v3.340.0 四次同款交棒留痕):
  历史档对 `extra_js.length` 的**硬等号**在抬版时翻红,而翻红的信息量只剩「数字不对」;
  改为判**语义**「本档出生模块仍未掉队」:数量退到**出生值下界**(`>= N`),
  末尾硬列表改用 `includes` + 末尾窗口(而不是 `slice(-2)` 逐字相等)。

★ 锚点纪律(本脚本第 2 版重写原因):第 1 版用「ASCII 片段 + 中文文案」拼锚点,
  实测**命中 0 次** —— 真源消息里的括号/逗号是全角(与历史留痕同款坑)。
  本版:**探针一律纯 ASCII**,且替换单位是**整条语句**(起点 = 唯一 ASCII 探针,
  终点 = 该行行尾;跨行那条用其后的第一个 `));`)。中文文案只写「新内容」,不参与匹配。
"""
import io
import os
import sys

ROOT = '/home/user/lonsha-memory-plugin'
BAK = '/tmp/bak3445_lock/'
os.makedirs(BAK, exist_ok=True)


def rd(rel):
    with io.open(os.path.join(ROOT, rel), 'r', encoding='utf-8') as f:
        return f.read()


def wr(rel, s):
    with io.open(os.path.join(ROOT, rel), 'w', encoding='utf-8') as f:
        f.write(s)


def backup(rel):
    p = os.path.join(ROOT, rel)
    b = BAK + rel.replace('/', '__') + '.pre3445lock'
    if not os.path.exists(b):
        with io.open(p, 'r', encoding='utf-8') as f:
            io.open(b, 'w', encoding='utf-8').write(f.read())


def repl_stmt(s, probe, new_block, label, end_at_line=True):
    """把「以 probe 开头的那条语句」整条替换成 new_block。probe 须纯 ASCII 且恰中 1 次。"""
    n = s.count(probe)
    if n != 1:
        sys.stderr.write('!! ABORT %s:探针命中 %d 次(期望 1)\n' % (label, n))
        sys.exit(1)
    start = s.index(probe)
    if end_at_line:
        end = s.index('\n', start)
    else:
        end = s.index('));', start) + 3
    if end <= start:
        sys.stderr.write('!! ABORT %s:语句范围取失败\n' % label)
        sys.exit(2)
    print('   ok %s(语句 %d..%d,探针命中 1)' % (label, start, end))
    return s[:start] + new_block + s[end:]


def must_absent(s, probe, label):
    if probe in s:
        sys.stderr.write('!! ABORT %s:旧硬锁探针仍在场(改错了地方)\n' % label)
        sys.exit(3)
    print('   self-test %s 旧硬锁已消失' % label)


def must_present(s, probe, label):
    if probe not in s:
        sys.stderr.write('!! ABORT %s:新下界探针不在场\n' % label)
        sys.exit(4)
    print('   self-test %s 新下界在场' % label)


# ═══════════ v3209(两处数量锁)═══════════
P1 = 'tests/v3209_migration_registry.test.mjs'
backup(P1)
s1 = rd(P1)
if 'mf.extra_js.length >= 109' in s1:
    print('v3209 已下界化(跳过)')
else:
    s1 = repl_stmt(s1, 'A(mf.extra_js.length === 109,',
        "    /* [v3.345.0 M4-X7 交棒] 原文是**硬等号数量锁**(严格等于本档出生值)—— 新增 return-gate.js\n"
        "     *   后翻红,而翻红的信息量只剩「数字不对」。改为**出生值下界**:\n"
        "     *   历史档只保证「不低于自己交棒时的数量」,当版上限由各当版档自持。\n"
        "     *   (注释不复述旧锚点字面量:本档 H5 判据纯度要求锚点在文件里只声明一次。) */\n"
        "    A(mf.extra_js.length >= 109, 'extra_js 不得低于本档交棒下界 109 —— 出生值;后版只抬不改,数量上限由各当版档自持(实 ' + mf.extra_js.length + ')');",
        'v3209 mf 数量下界化')
    must_absent(s1, 'A(mf.extra_js.length === 109,', 'v3209 mf')
    must_present(s1, 'A(mf.extra_js.length >= 109,', 'v3209 mf')
    s1 = repl_stmt(s1, 'A(files.length === 109,',
        "    A(files.length >= 109, 'extra_js 不得低于本档交棒下界 109(同上,出生值语义)');",
        'v3209 files 数量下界化')
    must_absent(s1, 'A(files.length === 109,', 'v3209 files')
    wr(P1, s1)

# ═══════════ v3324(数量 + 末尾硬列表)═══════════
P2 = 'tests/v3324_d_pack_extraction_driver.test.mjs'
backup(P2)
s2 = rd(P2)
if 'MF.extra_js.length >= 109' in s2:
    print('v3324 已下界化(跳过)')
else:
    s2 = repl_stmt(s2, 'assert.equal(MF.extra_js.length, 109,',
        "    /* [v3.345.0 M4-X7 交棒] 原文是硬等号 109 —— 新增 return-gate.js 后翻红的信息量只剩「数字不对」。\n"
        "     *   改为**出生值下界**(本档只保证不低于自己交棒时的数量)。 */\n"
        "    assert.ok(MF.extra_js.length >= 109, 'extra_js 不得低于本档交棒下界 109(实 ' + MF.extra_js.length + ')');",
        'v3324 数量下界化')
    must_absent(s2, 'assert.equal(MF.extra_js.length, 109,', 'v3324 数量')
    s2 = repl_stmt(s2, "assert.equal(MF.extra_js.slice(-2).join(','), 'testimony-board.js,narrative-layer.js',",
        "    /* [v3.345.0 M4-X7 再交棒] 原文是「末尾恰两模块」的逐字相等 —— 新增 return-gate.js 后翻红。\n"
        "     *   仍判**语义**「本包两模块仍未掉队」:两项都须在分发面里,且都落在**末尾三模块**的加载窗口内。 */\n"
        "    for (const m of ['testimony-board.js', 'narrative-layer.js']) {\n"
        "        assert.ok(MF.extra_js.includes(m), m + ' 须仍在分发面里(实 ' + MF.extra_js.length + ' 项)');\n"
        "        assert.ok(MF.extra_js.slice(-3).includes(m), m + ' 须仍落在末尾三模块窗口内(实 ' + MF.extra_js.slice(-3).join(',') + ')');\n"
        "    }",
        'v3324 末尾硬列表下界化', end_at_line=False)
    must_absent(s2, "assert.equal(MF.extra_js.slice(-2).join(','), 'testimony-board.js", 'v3324 末尾')
    must_present(s2, "assert.ok(MF.extra_js.slice(-3).includes(m),", 'v3324 末尾')
    wr(P2, s2)

# ═══════════ v3325 ═══════════
P3 = 'tests/v3325_d_pack_memory_center_pages.test.mjs'
backup(P3)
s3 = rd(P3)
if 'MF.extra_js.length >= 109' in s3:
    print('v3325 已下界化(跳过)')
else:
    s3 = repl_stmt(s3, 'assert.equal(MF.extra_js.length, 109,',
        "    /* [v3.345.0 M4-X7 交棒] 原文是硬等号 109;改为出生值下界(理由同各档同款交棒留痕)。 */\n"
        "    assert.ok(MF.extra_js.length >= 109, 'extra_js 不得低于本档交棒下界 109(实 ' + MF.extra_js.length + ')');",
        'v3325 数量下界化')
    must_absent(s3, 'assert.equal(MF.extra_js.length, 109,', 'v3325')
    must_present(s3, 'assert.ok(MF.extra_js.length >= 109,', 'v3325')
    wr(P3, s3)

# ═══════════ v3328(数量 + 末尾硬列表)═══════════
P4 = 'tests/v3328_f_pack_canon_fated.test.mjs'
backup(P4)
s4 = rd(P4)
if 'MF.extra_js.length >= 109' in s4:
    print('v3328 已下界化(跳过)')
else:
    s4 = repl_stmt(s4, 'assert.equal(MF.extra_js.length, 109,',
        "    /* [v3.345.0 M4-X7 交棒] 原文是硬等号 109;改为出生值下界(理由同各档同款交棒留痕)。 */\n"
        "    assert.ok(MF.extra_js.length >= 109, '分发面长度不得低于本档交棒下界 109(实 ' + MF.extra_js.length + ')');",
        'v3328 数量下界化')
    must_absent(s4, 'assert.equal(MF.extra_js.length, 109,', 'v3328 数量')
    s4 = repl_stmt(s4, "assert.deepEqual(MF.extra_js.slice(-2), ['testimony-board.js', 'narrative-layer.js']);",
        "    /* [v3.345.0 M4-X7 再交棒] 原文是末尾恰两模块的逐字 deepEqual —— 抬版后翻红。\n"
        "     *   仍判**语义**「F 包两模块仍未掉队」:都在分发面里、且都在末尾三模块窗口内。 */\n"
        "    for (const m of ['testimony-board.js', 'narrative-layer.js']) {\n"
        "        assert.ok(MF.extra_js.includes(m), m + ' 须仍在分发面里(实 ' + MF.extra_js.length + ' 项)');\n"
        "        assert.ok(MF.extra_js.slice(-3).includes(m), m + ' 须仍落在末尾三模块窗口内(实 ' + MF.extra_js.slice(-3).join(',') + ')');\n"
        "    }",
        'v3328 末尾硬列表下界化')
    must_absent(s4, "assert.deepEqual(MF.extra_js.slice(-2),", 'v3328 末尾')
    must_present(s4, "assert.ok(MF.extra_js.slice(-3).includes(m),", 'v3328 末尾')
    wr(P4, s4)

# ═══════════ v3440 ═══════════
P5 = 'tests/v3440_m4x6_narrative_layer.test.mjs'
backup(P5)
s5 = rd(P5)
if 'MF.extra_js.length >= 109' in s5:
    print('v3440 已下界化(跳过)')
else:
    s5 = repl_stmt(s5, 'assert.equal(MF.extra_js.length, 109,',
        "    /* [v3.345.0 M4-X7 交棒] 原文是硬等号 109;改为**出生值下界**(与本档 A1 的\n"
        "     *   「narrative-layer.js 在册」在场性判据互补:那里判的是本模块在场,这里判的是数量不缩水)。 */\n"
        "    assert.ok(MF.extra_js.length >= 109, 'extra_js 不得低于本档出生值 109(实 ' + MF.extra_js.length + ')');",
        'v3440 数量下界化')
    must_absent(s5, 'assert.equal(MF.extra_js.length, 109,', 'v3440')
    must_present(s5, 'MF.extra_js.length >= 109', 'v3440')
    wr(P5, s5)

print('DONE')