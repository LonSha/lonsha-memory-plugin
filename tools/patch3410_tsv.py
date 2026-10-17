#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.341.0：catalog_reference_consumers.tsv 追加当版在役测试行（P3 参考基准面）。
纪律同 patch3400_tsv.py：断言不在场（拒重复追加）+ 断言上一版锚点在位（形态自检）
+ 每条锚点**恰中 1 次**；数据取自磁盘真值（条数由脚本自数，不手抄）。
"""
import io
import re

TSV = '/home/user/lonsha-memory-plugin/tests/audit/catalog_reference_consumers.tsv'
SELF = '/home/user/lonsha-memory-plugin/tests/v3410_m4x2_chapter_compose.test.mjs'
NAME = 'v3410_m4x2_chapter_compose.test.mjs'
PREV = 'v3400_m4x4_qa_thread.test.mjs'

# 「本档 N 条」由磁盘真值自数（D9 的同一判据口径：^test( 计数）。
n = len(re.findall(r'^test\(', io.open(SELF, encoding='utf-8').read(), re.M))
assert n > 0, '磁盘测试档读不到 test( 行，形态异常'

NEG = len(re.findall(r"test\('v3410 D[0-9]", io.open(SELF, encoding='utf-8').read()))
assert NEG > 0, '读不到负控制条数'
LINE = (NAME + '\t\t第四期 M4-X2(面向读者的章节回顾与年鉴成稿)的成对套件'
        + '(**' + str(n) + ' 条 test**:含 ' + str(NEG) + ' 条真源码破坏负控制):'
        + 'A1 宿主六出口各恰一处 + 取库口 + 四处契约面 + organs 逐字副本 + 自检面行 + extra_js 107 / '
        + 'A2 内核面(SA_VERSION 3 / 三张常量面 / 九个新原语 / 既有九面一字不动 / 冻结)/ '
        + 'A3 内核纯度(不读宿主 this / 零外部依赖 / 八个模块内标识不在宿主重复出现)/ '
        + 'B1 真成稿(7 段逐段带证据位 + 可读编排 + 回源 5/5)/ '
        + 'B2 未调用真实模型只报结构成稿(**过了模型未回报也不报通过**，四态实测)/ '
        + 'B3 证据三态分开(回源 / 缺证 / 未判)+ 无回顾与零段各自具名 / '
        + 'B4 玩家版成稿(不接作者版 + 后续事实零泄漏 + 泄漏逐条具名)/ '
        + 'B5 按章重建(受影响 / 未变 / 整章过期 / 未判四格 + wholeBookRebuilt false)/ '
        + 'B6 改正文不篡改记忆的可机检形态(双向过滤事实位 + 证据位被抹逐条具名)/ '
        + 'B7 草稿册(只收白名单 + 丢弃数如实 + 诊断行四态 / 三态不同形)/ '
        + 'C1～C5 宿主五出口(成稿 / 草稿册持久化 / 编辑凭证进诊断行 / 玩家版闸自动装配 / 内核缺席同键降级)/ '
        + 'D1～D' + str(NEG) + ' ' + str(NEG) + ' 条真源码破坏负控制(各带原版阳性对照)/ '
        + 'F1 H5 判据纯度 + F2 H6 工具两向自证 + G1 版本锚 v3.341.0(下界口径，不锁当版)。')

txt = io.open(TSV, encoding='utf-8').read()
assert txt.count(NAME) == 0, '本行已在场，拒绝重复追加'
assert txt.count(PREV) == 1, '缺上一版锚点（命中 %d 次），文件形态异常' % txt.count(PREV)
if not txt.endswith('\n'):
    txt += '\n'
txt += LINE + '\n'
io.open(TSV, 'w', encoding='utf-8').write(txt)
assert io.open(TSV, encoding='utf-8').read().count(NAME) == 1, '落盘后自检未过'
print('ok 追加 %s（%d 条 test）' % (NAME, n))
