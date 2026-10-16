#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.340.0：catalog_reference_consumers.tsv 追加当版在役测试行（P3 参考基准面）。"""
import io, os
TSV = '/home/user/lonsha-memory-plugin/tests/audit/catalog_reference_consumers.tsv'
LINE = ('v3400_m4x4_qa_thread.test.mjs\t\t第四期 M4-X4(带消歧与条件继承的多轮记忆问答)的成对套件'
        '(**19 条 test**:含 5 条真源码破坏负控制):A1 宿主四面各恰一处 + 取库口 + 持久化/契约面在位 + extra_js 107 / '
        'A2 内核面(QT_VERSION 1 / 四态含 awaiting-disambig / 六原语 / 自证不变式)/ '
        'B1 条件继承(唯一主体下代词继承)/ B2 消歧不静默(多主体 ⇒ awaiting-disambig + 候选 + 点选接回)/ '
        'B3 换人替换与切分支缺键具名 / B4 时点(有锚折算 / 无锚不猜且具名 / 无锚继承 / spec ⊆ FILTERS)/ '
        'B5 身份不越界(换会话作废重建)/ C1 宿主继承并真落进 spec.actors / C2 宿主待决闸(plans.length === 0)/ '
        'C3 宿主身份作废 / C4 读数与诊断行三态 / D1～D5 五条真源码破坏负控制(各带原版阳性对照)/ '
        'F1 H5 判据纯度 + F2 H6 工具两向自证 + G1 版本锚 v3.340.0。')
txt = io.open(TSV, encoding='utf-8').read()
assert 'v3400_m4x4_qa_thread.test.mjs' not in txt, '本行已在场，拒绝重复追加'
assert 'v3390_m4x1_lore_manual.test.mjs' in txt, '缺上一版锚点，文件形态异常'
if not txt.endswith('\n'):
    txt += '\n'
txt += LINE + '\n'
io.open(TSV, 'w', encoding='utf-8').write(txt)
print('TSV 追加 1 行；总行 %d' % len(txt.splitlines()))