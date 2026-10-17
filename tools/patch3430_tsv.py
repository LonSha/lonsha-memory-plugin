#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.343.0:catalog_reference_consumers.tsv 追加当版在役测试行(P3 参考基准面)。"""
import io
TSV = '/home/user/lonsha-memory-plugin/tests/audit/catalog_reference_consumers.tsv'
LINE = ('v3430_m4x5_testimony_board.test.mjs\t\t第四期 M4-X5(同一事件的多方证词与争议档案)的成对套件'
        '(**21 条 test**:含 6 条真源码破坏负控制):A1 宿主三面各恰一处 + 取库口 + 自检行「证词面」+ extra_js 108 '
        '+ **零落盘面**(无持久化契约键 / 不混 ARCHIVE·CARRYOVER)/ '
        'A2 内核面(TB_VERSION 1 / 四态 supported·contested·undecided·withdrawn / 三档 ambiguous·below-threshold·transmittal-only / '
        '十三原语 / 自证六项)/ B1 来源去重(甲亲历 · 乙转述甲**同源** · 丙反证 ⇒ 独立 2 · 转述 1,不重复计)/ '
        'B2 争议未裁决(对立未裁决 ⇒ contested + 两条全保留 + kinds.ambiguous 2)/ '
        'B3 三档分列(transmittal-only / below-threshold / ambiguous 各 1,合成一格就说不出「为什么」)/ '
        'B4 揭密分面(surface·revealed 分列 + split)/ B5 撤回更新(命中列 revokedItems + contested→supported / '
        '未命中不动 unchanged 3 / 全撤 withdrawn)/ B6 五条不做之境(零落盘 / 无置信字段 / side 不抽语义 / dossiers 3 格自分面)/ '
        'C1 宿主取真源(worldProg.knowledgeTraces.traces ⇒ 争议态原样带出)/ C2 宿主撤回接线(喂被撤证据键 ⇒ 命中 + 重算)/ '
        'C3 缺模块三态降级具名 + 诊断行点名文件 / C4 宿主诊断行(四方分开说 + 未决争议永远报出来 + 空盘「暂无证词」)/ '
        'D1~D6 六条真源码破坏负控制(各带原版阳性对照:去重 / 对立判定 / 撤回命中 / 揭密分面 / 宿主取真源 / 宿主撤回接线)/ '
        'F1 H5 判据纯度(六锚点在本档各恰 1 次、真源各恰中 1 次)+ F2 H6 工具两向自证 + G1 版本锚 v3.343.0(下界口径,不锁当版)。')
txt = io.open(TSV, encoding='utf-8').read()
assert 'v3430_m4x5_testimony_board.test.mjs' not in txt, '本行已在场,拒绝重复追加'
assert 'v3420_m4x3_canon_adoption.test.mjs' in txt, '缺上一版锚点,文件形态异常'
if not txt.endswith('\n'):
    txt += '\n'
txt += LINE + '\n'
io.open(TSV, 'w', encoding='utf-8').write(txt)
print('TSV appended:', len(txt.splitlines()), 'lines')
