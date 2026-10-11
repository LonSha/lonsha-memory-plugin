#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.318.0 收口补刀 C：v3284 审计面副本台账登记 evalPage 簇（全量批跑 B1 当场点名）。

全量批跑 B1 归因：「新增未登记的审计面副本：350 字符 md5=cf4d6596 names=evalPage
  files=[_mo1_realhost_probe.mjs,_mo2_realbrowser_probe.mjs]」——
本刀新增的 `_mo2_realbrowser_probe.mjs` 与 M-O1 的 `_mo1_realhost_probe.mjs` 持有逐字相同的
CDP 求值 helper `evalPage`。
★ 登记值**不手抄**：用与判据同口径（唯一真源 stripComments + 折叠空白 + md5(8)）现场重算所得。
纪律：每处锚点先校验恰中 1 次，全部通过后才写盘。
"""
import io, sys
S = '/home/user/lonsha-memory-plugin/tests/v3284_o7_audit_copy_ledger.test.mjs'
reps = []

reps.append((
 '//   【本档登记（14 簇，实测逐字相同；体长 ≥ 40；v3.293.0 口径起，v3.303.0 补 3 簇）】',
 '//   【本档登记（15 簇，实测逐字相同；体长 ≥ 40；v3.293.0 口径起，v3.303.0 补 3 簇，v3.318.0 补 1 簇）】'))

reps.append((
 '//     methodBody                 2       328   69503fb4' + chr(10),
 '//     methodBody                 2       328   69503fb4' + chr(10)
 + '//     evalPage                   2       374   765488cd   ← v3.318.0 补（M-O2 真浏览器探针与 M-O1 真宿主探针的 CDP 求值 helper）' + chr(10)))

reps.append((
 "    ['methodBody', ['_m_o4_probe.mjs', '_p3_snapshot_probe.mjs'], 328, '69503fb4']," + chr(10),
 "    ['methodBody', ['_m_o4_probe.mjs', '_p3_snapshot_probe.mjs'], 328, '69503fb4']," + chr(10)
 + '    /* v3.318.0 补（M-O2 真浏览器切片新增 `_mo2_realbrowser_probe.mjs` 后与 M-O1 真宿主探针形成的跨档簇）：' + chr(10)
 + '     *   两档各自持有同一份 CDP `Runtime.evaluate` 求值 helper。**刻意各持一份**：让一个探针 import 另一个，' + chr(10)
 + '     *   会把两份证据通道耦在一起（真浏览器探针的会话 / 端口假设渗进真宿主探针）。 */' + chr(10)
 + "    ['evalPage', ['_mo1_realhost_probe.mjs', '_mo2_realbrowser_probe.mjs'], 374, '765488cd']," + chr(10)))

reps.append((
 'const A_METHODBODY = ' + chr(39) + 'function methodBody(src, name) {' + chr(39) + ';' + chr(10),
 'const A_METHODBODY = ' + chr(39) + 'function methodBody(src, name) {' + chr(39) + ';' + chr(10)
 + 'const A_EVALPAGE = ' + chr(39) + 'function evalPage(expr) {' + chr(39) + ';' + chr(10)))

reps.append((
 "        ['READNULL', A_READNULL], ['READ', A_READ], ['FACE_IN', A_FACE_IN], ['FACE_OPEN', A_FACE_OPEN]," + chr(10),
 "        ['READNULL', A_READNULL], ['READ', A_READ], ['FACE_IN', A_FACE_IN], ['FACE_OPEN', A_FACE_OPEN]," + chr(10)
 + "        ['EVALPAGE', A_EVALPAGE]," + chr(10)))

reps.append((
 "    assert.deepEqual(declNames, ['A_MUTATE', 'A_RUNAT', 'A_RUNSCANAT', 'A_EXMETHOD', 'A_EXBLOCK', 'A_METHODBODY'," + chr(10),
 "    assert.deepEqual(declNames, ['A_MUTATE', 'A_RUNAT', 'A_RUNSCANAT', 'A_EXMETHOD', 'A_EXBLOCK', 'A_METHODBODY'," + chr(10)
 + "        'A_EVALPAGE'," + chr(10)))

s = io.open(S, encoding='utf-8').read()
for i, (old, new) in enumerate(reps):
    n = s.count(old)
    if n != 1:
        print('[patch3318c] 锚点 %d 失配：count=%d ⇒ 退出，不写盘' % (i, n))
        sys.exit(1)
for i, (old, new) in enumerate(reps):
    s = s.replace(old, new, 1)
io.open(S, 'w', encoding='utf-8').write(s)
print('[patch3318c] 写盘完成：%d 处（头部计数 + 头部表行 + 台账行 + 锚点常量 + 锚点数组 + 声明序）' % len(reps))
