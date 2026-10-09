#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.301.0 · M-O2 第二刀 补丁 b：装配段里的 `_winModule` 必须写 `this._winModule`。

自伤留痕：patch3301a 的惰性化替换表把 `window.LonShaX?.Y` 直译成**裸名** `_winModule(...)`，
而它同时被定义成 MemoryEngine 的**方法**（与模块级 `_new*` 工厂不同）⇒ 真宿主首跑
`_winModule is not defined`（pageError）。

同时修 patch3301a 的拼接瑕疵：装配段末行不以换行结尾，导致 `return this;` 被并到同一行
（语法有效但可读性差，且让「装配段末行」这个锚点变得不可预测）。
"""
import io
import sys
import hashlib

P = 'index.js'
S = io.open(P, encoding='utf-8').read()
BEFORE = hashlib.md5(S.encode('utf-8')).hexdigest()

# ── ① 修拼接瑕疵：`|| null;            return this;` → 正常换行 ──
A_CONCAT = "|| null;            return this;"
if S.count(A_CONCAT) != 1:
    print('[patch3301b] 拼接锚点命中 %d 次' % S.count(A_CONCAT)); sys.exit(2)
S = S.replace(A_CONCAT, "|| null;\n            return this;", 1)

# ── ② 裸调用 → this. 调用（两类形态各恰中 N 次） ──
n_new = S.count('new (_winModule(')
n_assign = S.count('= _winModule(')
if n_new != 4 or n_assign != 3:
    print('[patch3301b] 调用点形态异常：new=%d / assign=%d（期望 4 / 3）' % (n_new, n_assign)); sys.exit(2)
S2 = S.replace('new (_winModule(', 'new (this._winModule(').replace('= _winModule(', '= this._winModule(')

# ── ③ 定义处未被误改 + 无残留裸调用 ──
import re
if S2.count('        _winModule(globalName, propName) {') != 1:
    print('[patch3301b] 定义处异常'); sys.exit(2)
bare = len(re.findall(r'(?<![.\w])_winModule\(', S2))
if bare != 1:
    print('[patch3301b] 仍剩 %d 处裸调用（应为 1 = 仅定义行）' % bare); sys.exit(2)
if S2.count('this._winModule(') != 7:
    print('[patch3301b] this. 调用点 %d 处（期望 7 = 4 个 new + 3 个赋值）' % S2.count('this._winModule(')); sys.exit(2)

io.open(P, 'w', encoding='utf-8').write(S2)
print('[patch3301b] 完成：md5 %s -> %s' % (BEFORE, hashlib.md5(S2.encode('utf-8')).hexdigest()))