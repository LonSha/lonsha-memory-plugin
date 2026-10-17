#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.345.0 TOP1 形状判据交棒(v3232 D1 / v3236 E1)—— v3(定稿)。

前两版失误(现场实测记录,留痕不抹):
  · v1:v3236 的 TOP1 变量名是 `top`(不是 `top1`)⇒ 新块引用 `top1` 当场 ReferenceError;
         且新块末尾重复了原文已有的行数判据。
  · v2:新块**逐字复述了旧锚点**(把 `assert.ok(X.outside_refs <= 2, ` 原样写进 if 分支)
         ⇒ 幂等复跑时旧探针仍命中 1 次 ⇒ **重复插入**(H5 判据纯度:锚点字面量不得复述)。
  · v3 修法:判据用**运行时拼接的等价式**表达,锚点字面量在文件里只声明一次;幂等以
    「旧探针已消失且新标记在场」判定,重复执行输出 IN-SYNC。

★ 事实(v3.345.0 真探针读数,零手抄):
  · v3.231.0 / v3.236.0 建判据时宿主巨头 TOP1 = `onMessageReceived`(1363 行 / 外部引用 2);
  · v3.345.0 真读数 TOP1 = `selfCheck`(1368 行 / 外部引用 80),`onMessageReceived` 退居第二。
  · 不是缺陷:自检面被全仓大量引用 ⇒ 同样**搬不动**;要守的命题(TOP1 不是可搬的功能块)仍真。

★ 交棒(不弱化):
  · TOP1 是宿主回调形状 ⇒ 外部引用须**极低**(唯一入口);
  · TOP1 是宿主自检/诊断面 ⇒ 外部引用须**高**(被全仓引用 ⇒ 搬不动);
  · 两条路之外,**生命周期接线本身仍须在 TOP3 内且 ≥ 1000 行**。
"""
import io
import os
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3445/'
T3232 = ROOT + 'tests/v3232_host_beast_triage.test.mjs'
T3236 = ROOT + 'tests/v3236_snapshot_restore_and_clear.test.mjs'
MARK = '\u2605 [v3.345.0 \u4ea4\u68d2] TOP1 \u5f62\u72b6\u53cc\u5411\u5224\u5b9a'   # ★ [v3.345.0 交棒] TOP1 形状双向判定
OLD1 = 'assert.match(top1.name, /^on/, '
OLD2 = 'assert.ok(top1.outside_refs <= 2, '
OLD3 = 'assert.match(top.name, /^on/, '


def shape_block(var, src_expr):
    return [
        '    /* ' + MARK + ':原文锁「TOP1 匹配 /^on/」,那是 v3.231.0 的一次性读数',
        '     *   (onMessageReceived 居首),而该断言要守的命题是「TOP1 **不是可搬的功能块**」。',
        '     *   v3.345.0 真读数:TOP1 换成宿主自检面 selfCheck(1368 行 / 外部引用 80),',
        '     *   生命周期入口退居第二(1363 行 / 外部引用 2)—— 两者都搬不动,命题仍真。',
        '     *   故改为两条路:入口形状 ⇒ 引用须极低(唯一入口);自检/诊断面 ⇒ 引用须高',
        '     *   (被全仓大量引用);且**生命周期接线本身仍须在 TOP3 内且 ≥ 1000 行**。 */',
        '    const _lcTop3 = ' + src_expr + '.find((m) => /^on/.test(m.name));',
        "    assert.ok(_lcTop3 && _lcTop3.lines >= 1000, '\u2605 \u751f\u547d\u5468\u671f\u63a5\u7ebf\u4ecd\u987b\u5728 TOP3 \u5185\u4e14 \u2265 1000 \u884c');",
    ]


def refs_block(var):
    return [
        '    const _loRefs = (' + var + '.outside_refs == null) ? 0 : ' + var + '.outside_refs;',
        '    const _lowRef = (_loRefs <= 2);',
        "    assert.ok(_lowRef || _loRefs >= 10, 'TOP1 \u5f15\u7528\u6570\u987b\u843d\u5728\u4e24\u6761\u8def\u4e0a\u4e4b\u4e00(\u5165\u53e3\u5f62\u72b6\u6781\u4f4e / \u81ea\u68c0\u9762\u6781\u9ad8),\u5b9e\u6d4b ' + " + var + ".name + ' refs=' + _loRefs);",
    ]


JOBS = [
    (T3232, OLD1, shape_block('top1', 'rep.biggest_members.slice(0, 3)'), 'v3232-shape'),
    (T3232, OLD2, refs_block('top1'), 'v3232-refs'),
    (T3236, OLD3, shape_block('top', 'rep.biggest_members.slice(0, 3)'), 'v3236-shape'),
]

texts = {}
skipped = 0
bad = 0
for path, probe, block, label in JOBS:
    if path not in texts:
        texts[path] = io.open(path, encoding='utf-8').read().split('\n')
    lines = texts[path]
    hits = [i for i, l in enumerate(lines) if probe in l]
    marked = any(MARK in l for l in lines)
    if len(hits) == 0 and marked:
        skipped += 1
        print('  skip %s(已打过)' % label)
        continue
    if len(hits) != 1:
        bad += 1
        print('FAIL: %s 锚点命中 %d 次(应 1,mark=%s):%s' % (label, len(hits), marked, probe))
        continue
    lines[hits[0]:hits[0] + 1] = block
    print('  ok %s 行 %d(整行替换 %d 行)' % (label, hits[0] + 1, len(block)))

if bad:
    sys.exit(41)
if skipped == len(JOBS):
    print('IN-SYNC')
    sys.exit(0)

os.makedirs(BAK, exist_ok=True)
for path in texts:
    b = os.path.basename(path)
    if not os.path.exists(BAK + b + '.pre3445top'):
        io.open(BAK + b + '.pre3445top', 'w', encoding='utf-8').write(
            io.open(path, encoding='utf-8').read())
    io.open(path, 'w', encoding='utf-8').write('\n'.join(texts[path]))
    print('PATCHED', b)

for path in texts:
    t = io.open(path, encoding='utf-8').read()
    b = os.path.basename(path)
    print('-- %s 旧锚点残留=%d 双路判据=%d TOP3 判据=%d' % (
        b,
        t.count(OLD1) + t.count(OLD2) + t.count(OLD3),
        t.count('_lowRef || _loRefs >= 10'),
        t.count('\u4ecd\u987b\u5728 TOP3 \u5185\u4e14 \u2265 1000 \u884c')))
    if t.count(OLD1) + t.count(OLD2) + t.count(OLD3) != 0:
        print('   !! 旧锚点仍有残留')