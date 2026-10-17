#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.342.0：catalog_reference_consumers.tsv 追加当版在役测试行（P3 参考基准面）。
纪律同 patch3410_tsv.py：断言不在场（拒重复追加）+ 断言上一版锚点在位（形态自检）
+ 每条锚点**恰中 1 次**；数据取自磁盘真值（条数由脚本自数，不手抄）。
"""
import io
import re
TSV = '/home/user/lonsha-memory-plugin/tests/audit/catalog_reference_consumers.tsv'
SELF = '/home/user/lonsha-memory-plugin/tests/v3420_m4x3_canon_adoption.test.mjs'
NAME = 'v3420_m4x3_canon_adoption.test.mjs'
PREV = 'v3410_m4x2_chapter_compose.test.mjs'
src = io.open(SELF, encoding='utf-8').read()
n = len(re.findall(r'^test\(', src, re.M))
assert n > 0, '磁盘测试档读不到 test( 行，形态异常'
NEG = len(re.findall(r"test\('v3420 D[0-9]", src))
assert NEG > 0, '读不到负控制条数'
LINE = (NAME + '\t\t第四期 M4-X3(正史选择真正进入下一卷)的成对套件'
        + '(**' + str(n) + ' 条 test**:含 ' + str(NEG) + ' 条真源码破坏负控制):'
        + 'A1 宿主五新出口各恰一处 + 四处契约面 + organs 逐字副本 + 自检面「支线正史」行并入 + extra_js 107 / '
        + 'A2 内核面(BC_VERSION 2 / 六张常量面 / 八个新原语 / 既有面一字未拆 / 冻结)/ '
        + 'A3 内核纯度(实现体不读宿主 this / 零 require、fetch 与落盘 / judge 面不拿宿主字串当判据)/ '
        + 'B1 形状真接得上(条目每条带 shape 三格 + 下游逐条不再读成缺面 + 真出得成提案)/ '
        + 'B2 三态不同形(ready/blocked/empty;未选尽与空条均不出包)/ '
        + 'B3 缺格三因具名且分列(no-face / no-owner / no-key;缺格条文不进可接集)/ '
        + 'B4 幂等地基(同选择恒同 adoptionId / 换卷换选择必不同 / 凭据自带撤销范围)/ '
        + 'B5 撤销保护面(四张具名表 + 手工与别批一条不进可撤集 + 两条口径写成读数)/ '
        + 'C1 宿主落卷计划出口(真内核 + 零写读数 + 诊断行同源 + 未选尽不出包)/ '
        + 'C2 确认落笔(落笔/落盘/回读三环 + 同会话与重启后重复确认均不再落笔 + 换卷不算重复)/ '
        + 'C3 凭据落盘闸门(预览期只出键不落盘)/ '
        + 'C4 撤销保护面出口(四张表分类对 + 器官缺席不编条目不抛)/ '
        + 'C5 内核缺席三出口同键降级(不抛 / 不 undefined)+ 诊断行具名 / '
        + 'D1～D' + str(NEG) + ' ' + str(NEG) + ' 条真源码破坏负控制(各带原版阳性对照)/ '
        + 'F1 H5 判据纯度 + F2 H6 工具两向自证 + G1 版本锚 v3.342.0(下界口径，不锁当版)。')
txt = io.open(TSV, encoding='utf-8').read()
assert txt.count(NAME) == 0, '本行已在场，拒绝重复追加'
assert txt.count(PREV) == 1, '缺上一版锚点（命中 %d 次），文件形态异常' % txt.count(PREV)
if not txt.endswith('\n'):
    txt += '\n'
txt += LINE + '\n'
io.open(TSV, 'w', encoding='utf-8').write(txt)
assert io.open(TSV, encoding='utf-8').read().count(NAME) == 1, '落盘后自检未过'
print('ok 追加 %s（%d 条 test，含 %d 条负控制）' % (NAME, n, NEG))