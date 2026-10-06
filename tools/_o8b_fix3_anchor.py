#!/usr/bin/env python3
"""v3.286.0 O8 第二刀修正三：两个新套件补**当版锚**（V4 计数形态）。

根因（版本守卫实测）：V4 的计数口径是 `boundRe`（`vnum('X.Y.Z')` 形态），
  而首版把当版锚写成 `assert.equal(pkg, '3.286.0', …)` —— 它是硬等号，但**不是 boundRe 形态**，
  于是 V4 报「没有任何测试恰好锚着当版 3.286.0 ⇒ 版本守卫失去基准」。
  这不是守卫太严：V4 的存在理由就是「当版锚被静默删空时必须响」，而首版恰恰是那种形态
  （看起来锚了，守卫看不见）。修法与 v3285 同形：用 `assert.equal(vnum('当版'), vnum(pkg), …)`。

幂等：已含 vnum 当版锚则跳过。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
FILES = ['tests/v3286_cost_truthfulness.test.mjs', 'tests/v3286_plan_currency.test.mjs']
NEW_ANCHOR = ("    const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);\n"
              "    assert.equal(vnum('3.286.0'), vnum(pkg), '本档恰锚当版（V4 计数形态）');")
edits = []

for rel in FILES:
    p = ROOT / rel
    s = p.read_text(encoding='utf-8')
    if "vnum('3.286.0')" in s:
        print('[o8b-fix3] %s 已含当版锚（幂等）' % rel)
        continue
    old = "    assert.equal(pkg, '3.286.0', '本档恰锚当版（实 ' + pkg + '）');"
    n = s.count(old)
    if n != 1:
        print('[FATAL] %s 锚点命中 %d 次，不写盘' % (rel, n))
        sys.exit(1)
    s = s.replace(old, NEW_ANCHOR, 1)
    p.write_text(s, encoding='utf-8')
    edits.append(rel)

for e in edits:
    print('[o8b-fix3] %s —— 当版锚已改为 vnum 形态' % e)
print('[o8b-fix3] 完成：%d 处' % len(edits))