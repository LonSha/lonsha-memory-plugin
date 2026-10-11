#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch3317_alias_ledger.py - v3.317.0：v3282 别名副本台账补登三簇。

实测（本刀抬版后跑 v3282 抓到；取证：干净基线 3d54b62 上同三簇已红 ⇒ 前两条为既有真缺陷）：
  ① fn _t/text            [extract-feedback.js, knowledge-preview.js, knowledge-trace.js] 142 bc94705d
     —— v3.316.0 · M-X7 抬版漏同步（v3.315.0 · M-X5 knowledge-preview 与 knowledge-trace 已同体）。
  ② fn _floorOf/floorOf   [extract-feedback.js, knowledge-preview.js, knowledge-trace.js] 228 6fe7a611
     —— 同一抬版、同一漏项。
  ③ fn _isPlain/isPlainObject [extract-feedback.js, project-registry.js, projection-pipeline.js] 57 dd6bb22c
     —— 本刀 M-X3 给 project-registry.js 自持一份（前两份两模块已同体，本刀把成员由两份涨到三份）。

三簇均为「通用原语」（文本归一 / 数值归一 / 普通对象判定），成员模块装载时机互不包含；
收拢会把「本模块自足」换成「依赖另一个模块先挂载」——本仓反过的跨模块静默读旧值形态。
体长与 md5 由本档枚举函数在磁盘上现算后核对（不手抄）。先校验全部锚点，通过后统一写盘。
"""
import io

ROOT = '/home/user/lonsha-memory-plugin/'
F = ROOT + 'tests/v3282_o7_alias_copy_ledger.test.mjs'
BS = chr(92)
NL = BS + 'n'

# [锚点一] 登记表尾（最后一条目 + 其后的注释块之后、`];` 之前）插入三簇
TAIL = "     *   ★ 判据真抓到东西（不是为过门禁而补登记）：既有两模块的簇成员集合确实变了。 */" + chr(10) + '];' + chr(10)
BLOCK = chr(10).join(["    ['fn', ['_t', 'text'], ['extract-feedback.js', 'knowledge-preview.js', 'knowledge-trace.js'], 142, 'bc94705d'],", "    ['fn', ['_floorOf', 'floorOf'], ['extract-feedback.js', 'knowledge-preview.js', 'knowledge-trace.js'], 228, '6fe7a611'],", "    ['fn', ['_isPlain', 'isPlainObject'], ['extract-feedback.js', 'project-registry.js', 'projection-pipeline.js'], 57, 'dd6bb22c'],"]) + chr(10)
s = io.open(F, encoding='utf-8').read()
n = s.count(TAIL)
if n != 1:
    raise SystemExit('[patch3317-alias-ledger] 登记表尾锚点命中 %d 次（须恰 1 次），未写盘' % n)
NEW_BLOCK = "     *   ★ 判据真抓到东西（不是为过门禁而补登记）：既有两模块的簇成员集合确实变了。 */" + chr(10) + chr(10).join(["    ['fn', ['_t', 'text'], ['extract-feedback.js', 'knowledge-preview.js', 'knowledge-trace.js'], 142, 'bc94705d'],", "    ['fn', ['_floorOf', 'floorOf'], ['extract-feedback.js', 'knowledge-preview.js', 'knowledge-trace.js'], 228, '6fe7a611'],", "    ['fn', ['_isPlain', 'isPlainObject'], ['extract-feedback.js', 'project-registry.js', 'projection-pipeline.js'], 57, 'dd6bb22c'],"]) + chr(10) + '];' + chr(10)
s = s.replace(TAIL, NEW_BLOCK, 1)

# [锚点二] 文档簇数口径：实测 9 个簇 / 实 11 / 读盘实测 11 簇 → 13
REPL = [('**9 个簇**', '**13 个簇**'), ('（实 11）', '（实 13）'), ('B  读盘实测：11 簇逐字相同', 'B  读盘实测：13 簇逐字相同')]
for old, new in REPL:
    if s.count(old) != 1:
        raise SystemExit('[patch3317-alias-ledger] 口径锚点命中 %d 次：' % s.count(old) + old)
    s = s.replace(old, new, 1)

io.open(F, 'w', encoding='utf-8').write(s)
print('[patch3317-alias-ledger] wrote v3282（+3 簇 / 口径同步）')
