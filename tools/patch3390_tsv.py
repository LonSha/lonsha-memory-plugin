#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.339.0 参考基准面登记：catalog_reference_consumers.tsv 追加 v3390 套件。
否则 scan_cross_repo_binding.mjs 的 P3 会报「新增测试未登记进参考基准」。
"""
import io
ROOT = '/home/user/lonsha-memory-plugin/'
T = ROOT + 'tests/audit/catalog_reference_consumers.tsv'
s = io.open(T, encoding='utf-8').read()
assert 'v3390_m4x1_lore_manual.test.mjs' not in s, 'v3390 已登记，勿重复'
assert 'v3380_m4o8_center_actions.test.mjs' in s, 'v3380 登记行不在场，行尾锚点失效'
if not s.endswith('\n'):
    s += '\n'
DESC = ('第四期 M4-X1(可校订的分层导入与源资料更新)的成对套件(**13 条 test**:含 4 条真源码破坏负控制):'
        'A1 宿主六面各恰一处 + 持久化面在位 / A2 内核人工校订面(LI_VERSION 2 / MANUAL 三态 / 三原语 / '
        'describe·selfCheck 露 manual 面)/ B1 人工改类(clsRule 与 cls 分列 / bad-class / split-point-absent / '
        '#a·#b)/ B2 选入面(selected 过滤 / 未选段具名 / 未给则全落)/ C1 宿主落笔(前情含选中段 / 事实账零写 / '
        'duplicate / 未选不写 / persisted+readback)/ C2 敏感段不落(掩码不进前情 + 具名 sensitive-body)/ '
        'C3 同名映射确认回填(needs-confirm 裁决接回，不静默合并)/ F1～F4 四条真源码破坏负控制(各带原版阳性对照)/ '
        'G1 H5 判据纯度(四锚点在本档各恰 1 次、真源各恰中 1 次)/ H1 自防护 + 当版锚 v3.339.0。')
s += 'v3390_m4x1_lore_manual.test.mjs\t\t' + DESC + '\n'
io.open(T, 'w', encoding='utf-8').write(s)
print('tsv 已追加 v3390 行；总行数', len(s.split('\n')))
