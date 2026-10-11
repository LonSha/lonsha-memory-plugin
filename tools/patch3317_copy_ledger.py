#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch3317_copy_ledger.py - v3.317.0：v3281 台账补登三簇（_t / _floorOf / surfaceDigest）。

实测（本刀抬版后跑 v3281 抓到，逐条取证）：
  ① `_t#bc94705d`        [extract-feedback.js, knowledge-preview.js] —— **既有真缺陷**：
     v3.316.0 · M-X7 给 extract-feedback.js 自持一份，与 v3.315.0 · M-X5 knowledge-preview.js
     的那份逐字相同，当次抬版漏同步本台账。取证：干净基线 3d54b62 上单跑本档同样翻红。
  ② `_floorOf#6fe7a611`  [extract-feedback.js, knowledge-preview.js] —— 同一抬版、同一漏项。
  ③ `surfaceDigest#445c2513` [extract-feedback.js, knowledge-preview.js, project-registry.js]
     —— 本刀 M-X3 给 project-registry.js 自持一份同形原语，成员由两份涨到三份。

三族都属「通用原语」（只吃一个值 / 一个对象，不认识任何账本字段），三模块装载时机互不包含；
收拢会把「本模块自足」换成「依赖另一个模块先挂载」——本仓反过的跨模块静默读旧值形态。
体 md5 由本档枚举函数在磁盘上现算后核对（不手抄）。纪律：先校验全部锚点，通过后统一写盘。
"""
import io

ROOT = '/home/user/lonsha-memory-plugin/'
F = ROOT + 'tests/v3281_o7_module_copy_ledger.test.mjs'
BS = chr(92)
NL = BS + 'n'

# [锚点一] 台账尾插入三簇
TAIL = "        + '由 v3308 H1 把守（下游不必认两句）。']," + chr(10) + '];' + chr(10)
BLOCK = chr(10).join(["    ['_t', ['extract-feedback.js', 'knowledge-preview.js'], 'bc94705d',", "        '控制字符剥离（C0 控制符 + DEL）+ trim + 可选截断的文本原语。\\n'", "        + '**为什么留两份**：与 text / numOrNull 族同形 —— 它是**通用文本原语**，只吃一个值、\\n'", "        + '不认识任何账本字段；两模块装载时机互不包含（预览面可缺席而反馈面在，反之亦然），\\n'", "        + '收拢会把「本模块自足」换成「依赖另一个模块先挂载」（本仓反过的跨模块静默读旧值）。\\n'", "        + '★ **补登（v3.317.0 轮）**：该簇由 v3.316.0 · M-X7 引入（extract-feedback.js 自持一份），\\n'", "        + '当次抬版**漏了同步本台账** —— 在干净基线 3d54b62 上单跑本档同样翻红（取证：非本刀引入），\\n'", "        + '与 numOrNull / text 两次补登是同一族教训（抬版牵连面必须逐项核）。体 md5 与磁盘同源。'],", "    ['_floorOf', ['extract-feedback.js', 'knowledge-preview.js'], '6fe7a611',", "        '数值归一（number 或非空整数字串 ⇒ trunc；其余如实 null，**不编 0**）。\\n'", "        + '**为什么留两份**：与 numOf / numOrNull 族同形 —— 通用数值原语；两模块装载时机互不包含。\\n'", "        + '★ **补登（v3.317.0 轮）**：与 _t 同批同源（v3.316.0 · M-X7 抬版漏同步，基线即红）。'],", "    ['surfaceDigest', ['extract-feedback.js', 'knowledge-preview.js', 'project-registry.js'], '445c2513',", "        '导出面指纹（导出名排序 + 值级形态 ⇒ FNV-1a 32 位摘要，返回 {names, count, digest}）。\\n'", "        + '**为什么留三份**：导出面指纹是**模块自证**用的原语（每模块对自己的 api 算一遍），\\n'", "        + '天然随模块走 —— 收拢成一份等于让「每个模块自证」变成「所有模块共用一个自证器」，\\n'", "        + '那会把「指纹反映本模块导出面」这件事抹掉。三模块装载时机互不包含，同族理由同上。\\n'", "        + '★ **补登（v3.317.0 轮）**：本刀 M-X3 给 project-registry.js 加第三份（同形同值），\\n'", "        + '与簇同批落盘、同批登记（前两份为 v3.315.0 / v3.316.0 遗留，基线即红）。'],"]) + chr(10)
s = io.open(F, encoding='utf-8').read()
n = s.count(TAIL)
if n != 1:
    raise SystemExit('[patch3317-copy-ledger] 台账尾锚点命中 %d 次（须恰 1 次），未写盘' % n)
s = s.replace(TAIL, "        + '由 v3308 H1 把守（下游不必认两句）。']," + chr(10) + BLOCK + '];' + chr(10), 1)

# [锚点二] 档头簇数口径 18 簇 → 24 簇
OLD_H = '//     实测 **18 个簇 / 63 对**逐字副本（v3.296.0 口径；建档时 15 簇 / 60 对，'
NEW_H = ('//     实测 **24 个簇**逐字副本（v3.317.0 口径 —— 本刀补登 _t / _floorOf / surfaceDigest '
         + '三簇后；v3.296.0 口径为 18 簇 / 63 对，建档时 15 簇 / 60 对，')
n = s.count(OLD_H)
if n != 1:
    raise SystemExit('[patch3317-copy-ledger] 档头簇数锚点命中 %d 次，未写盘' % n)
s = s.replace(OLD_H, NEW_H, 1)

# [锚点三] 下限注释 17 → 24
OLD_M = '/** 簇数下限（实 17）：登记表被清空或枚举面塌陷时立刻红。 */'
NEW_M = '/** 簇数下限（实 24）：登记表被清空或枚举面塌陷时立刻红。 */'
n = s.count(OLD_M)
if n != 1:
    raise SystemExit('[patch3317-copy-ledger] 下限注释锚点命中 %d 次，未写盘' % n)
s = s.replace(OLD_M, NEW_M, 1)

io.open(F, 'w', encoding='utf-8').write(s)
print('[patch3317-copy-ledger] wrote v3281（+3 簇 / 口径同步）')
