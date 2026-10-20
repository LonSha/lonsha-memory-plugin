#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.350.0 抬版连带：登记面与交棒（三件，全部有本仓先例）。

【一】台账补登（`catalog_reference_consumers.tsv`）：本版新增判据档
     `v3500_m5_batch.test.mjs` 必须进册 —— v3480 C1 判「台账与磁盘双向齐全」，
     磁盘新增而未登记即红（这正是它该做的事）。

【二】人读面**待验标记**（README / PLAN）：本版**未跑全量**（读数登记仍停 v3.349.0），
     按仓规必须把当版标成「**全量待验**」—— v3480 B3 判的就是这条**反向**一致：
     登记没对齐当版时，README/PLAN 必须标待验；不标就是把「没跑」说成「跑过了」。

【三】当版锚**交棒**（v3490 A1）：v3490 的 A1 用**硬等号**把自己锁在 3.349.0
     （当版锚的合法形态），抬版后本档不再是 frontier ⇒ 按本仓明写的交棒纪律
     退回**下界口径**（`>= BORN_V`），与 v3470 G1 / v3480 A1 同形。
     ★ 这不是「放宽判据」：它仍判「本档自锚在场 + 当版不早于出生版」，
     改的只是「当版锚由谁持有」—— 当版锚已交给 v3500 本档（version guard V4 计数）。
"""
import io
import json
import os
import re
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
NEW = '3.350.0'
PREV = '3.349.0'
WRITE = '--write' in sys.argv
BAK = '/tmp/bak3500/'
os.makedirs(BAK, exist_ok=True)


def rd(rel):
    with io.open(ROOT + rel, encoding='utf-8') as f:
        return f.read()


def wr(rel, s):
    with io.open(ROOT + rel, 'w', encoding='utf-8') as f:
        f.write(s)


def backup(rel, tag):
    if WRITE:
        io.open(BAK + rel.replace('/', '_') + '.' + tag, 'w', encoding='utf-8').write(rd(rel))


res = []

# ── 【一】台账补登 ──
TSV = 'tests/audit/catalog_reference_consumers.tsv'
tsv = rd(TSV)
NAME = 'v3500_m5_batch.test.mjs'
if NAME in tsv:
    res.append(('tsv/补登', 'SKIP(已在册)'))
else:
    note = ('v3.350.0 第五期第一批四项（M5-O1 时点追问与多人比较 / M5-O2 叙事层标签贯穿 / '
            'M5-O3 否定不当吻合·没找到不当未发生 / M5-O8 未履行约定不因容量消失）'
            '+ 手机 R5-O9 的条件清除委托口的成对套件（**20 条 test**：含 10 条真源码破坏负控制）：'
            'A1 时间方向与锚分列（at/as-of/since 三态可辨、无锚不猜、不认识归空）/ '
            'A2 多人比较各查一人 + as-of 上界走独立格 specEx.floorTo（本面键集合未扩）/ '
            'A3 层标注活过白名单重建并进指纹（旧档读回 null）/ '
            'A4 否定不当吻合 + 覆盖不足判 unchecked（不传 opts 旧口径一字未变）/ '
            'A5 未完成约定优先保留 + 满了显式拒绝 reason=capacity / '
            'A6 可清轴表自证 + 本句新设优先于清除 / '
            'B1 宿主 clear 下传 + cleared·clearAxes 回送（缺件降级路径同键）/ '
            'D1~D10 十条真源码破坏负控制（各带原版阳性对照）/ '
            'F1 H5 判据纯度（九锚点在本档各恰 1 次）+ F2 H6 工具两向自证 + '
            'G1 版本锚 v3.350.0（下界口径，不锁当版）。')
    if not tsv.endswith('\n'):
        tsv += '\n'
    tsv += NAME + '\t\t' + note + '\n'
    if WRITE:
        backup(TSV, 'pre3500')
        wr(TSV, tsv)
    res.append(('tsv/补登', 'bump'))

# ── 【二】人读面待验标记 ──
rm = rd('README.md')
m = re.search(r'当前版本 v' + re.escape(PREV) + r' \*\*已实跑并登记\*\*', rm)
if ('当前版本 v' + NEW + ' **全量待验**') in rm:
    res.append(('README/待验标记', 'SKIP(已标)'))
elif not m:
    res.append(('README/待验标记', 'SKIP(无「当前版本 v' + PREV + ' 已实跑并登记」锚，人工复核)'))
else:
    if WRITE:
        backup('README.md', 'pre3500')
        new_rm = rm[:m.start()] + ('当前版本 v' + NEW + ' **全量待验**'
                                   + '（第五期第一批四项 M5-O1/M5-O2/M5-O3/M5-O8 + 手机 R5-O9 的清除委托口；'
                                     '实施期按铁律只跑定向判据与定点回归，全量待验）'
                                   + '；上一版 v' + PREV + ' **已实跑并登记**') + rm[m.end():]
        wr('README.md', new_rm)
    res.append(('README/待验标记', 'bump'))

pl = rd('PLAN.md')
mp = re.search(r'当前 v' + re.escape(PREV) + r' \*\*已实跑并登记\*\*', pl)
if ('当前 v' + NEW + ' **全量待验**') in pl:
    res.append(('PLAN/待验标记', 'SKIP(已标)'))
elif not mp:
    res.append(('PLAN/待验标记', 'SKIP(无「当前 v' + PREV + ' 已实跑并登记」锚，人工复核)'))
else:
    if WRITE:
        backup('PLAN.md', 'pre3500')
        new_pl = pl[:mp.start()] + ('当前 v' + NEW + ' **全量待验**'
                                    + '（第五期第一批四项 + 手机 R5-O9 的清除委托口；'
                                      '实施期只跑定向判据与定点回归）'
                                    + '；上一版 v' + PREV + ' **已实跑并登记**') + pl[mp.end():]
        wr('PLAN.md', new_pl)
    res.append(('PLAN/待验标记', 'bump'))

# ── 【三】当版锚交棒（v3490 A1 退回下界口径） ──
T3490 = 'tests/v3490_condition_patch.test.mjs'
t49 = rd(T3490)
OLD_EQ = ("    assert.equal(vnum(BORN_V), vnum(MF.version), 'BORN_V 必须恰是当版(自锚常量不得漂到别版)');\n"
          "    assert.equal(vnum(BORN_V), vnum(PKG.version), 'package.json 必须与自锚同源');")
NEW_LB = ("    /* [v3.350.0 交棒] 本档不再是 frontier ⇒ 当版锚退回**下界口径**（与 v3470 G1 / v3480 A1 同形）：\n"
          "     *   仍判「自锚常量在场」与「当版不早于出生版」，但不再锁死等于某一版 ——\n"
          "     *   硬等号留在历史档里跨版就变成「锁上一版的死数」。当版锚已交给 v3500 本档（version guard V4 计数）。 */\n"
          "    assert.ok(vnum(idxVersionOf(MF)) >= vnum(BORN_V), '当版不得早于本档出生版本');\n"
          "    assert.ok(vnum(idxVersionOf(PKG)) >= vnum(BORN_V), 'package.json 不得早于本档出生版本');")
if 'v3.350.0 交棒' in t49:
    res.append(('v3490/A1交棒', 'SKIP(已交棒)'))
elif OLD_EQ not in t49:
    res.append(('v3490/A1交棒', 'SKIP(锚形态与预期不符，人工复核)'))
else:
    if WRITE:
        backup(T3490, 'pre3500')
        t49 = t49.replace(OLD_EQ, NEW_LB, 1)
        # 补一个本地取值器（不改既有判据语义：只是把「读哪份 manifest」这一句收成一处）。
        helper = ("const idxVersionOf = (o) => (o && o.version) ? o.version : '';\n")
        anchor = 'const BORN_V = '
        i = t49.index(anchor)
        t49 = t49[:i] + helper + t49[i:]
        wr(T3490, t49)
    res.append(('v3490/A1交棒', 'bump'))

for t, s in res:
    print('%-24s %s' % (t, s))
if not WRITE:
    print('--- DRY RUN (pass --write to apply) ---')
else:
    tsv2 = rd(TSV)
    assert NAME in tsv2, '台账未补登'
    assert ('当前版本 v' + NEW + ' **全量待验**') in rd('README.md'), 'README 待验标记未落'
    assert ('当前 v' + NEW + ' **全量待验**') in rd('PLAN.md'), 'PLAN 待验标记未落'
    assert 'v3.350.0 交棒' in rd(T3490), 'v3490 交棒未落'
    print('SELF-CHECK OK')