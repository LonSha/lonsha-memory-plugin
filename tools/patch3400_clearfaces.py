#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.340.0：清空面收编 loreImportLedger / qaThread（补 v3236 D1 缺口 3）。"""
import io
P = '/home/user/lonsha-memory-plugin/index.js'
s = io.open(P, encoding='utf-8').read()
A = "            A('direct', 'lastSave', '保存地面真源', true, () => { e._lastSaveGroundTruth = null; });\n            res.ok = res.failed.length === 0;"
NEW = ("            A('direct', 'lastSave', '保存地面真源', true, () => { e._lastSaveGroundTruth = null; });\n"
       "            /* [v3.339.0 · M4-X1] 资料导入账 / [v3.340.0 · M4-X4] 追问线程：与 restoreFromPayload\n"
       "             *   的 `_imp('loreImportLedger'…)` / `_imp('qaThread'…)` 同源（两侧按**键名**对齐，\n"
       "             *   缺口 3「恢复面有、清空面没有」由 v3236 D1 当场照出）。 */\n"
       "            A('direct', 'loreImportLedger', '资料导入账', true, () => { e._loreImportLedger = null; });\n"
       "            A('direct', 'qaThread', '追问线程', true, () => { e._qaThread = null; });\n"
       "            res.ok = res.failed.length === 0;")
assert s.count(A) == 1, s.count(A)
io.open(P, 'w', encoding='utf-8').write(s.replace(A, NEW, 1))
print('OK clearRuntimeMemory 补两行')