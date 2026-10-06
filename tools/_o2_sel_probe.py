#!/usr/bin/env python3
"""探查：shim 的 `details > summary` 子选择器为何匹配不到真源的 <details><summary>。

为什么必须查：V7 报「原生 details 候选 0 个 —— 本仓未提供折叠头」，
而真源 settings-ui.js 第 1114 行明明写着 `<details id="ls-advanced"><summary>…</summary>`。
两种可能必须分清（结论完全不同）：
  A. 真源面板展开时那段 HTML 根本没进 DOM（渲染分支没走到）→ 本仓真无折叠头，V7 结论成立；
  B. 进了 DOM，但 shim 的 `matchesOne` 对 `details > summary`（含 `>` 的子组合器）不支持
     → 这是**测量盲区**，V7 的「无折叠头」是假结论，必须修 shim 或改选择器写法。
判据：从真源里抽出 `<details …>…</summary>` 那一小段 HTML，直接用 shim 的 parseHTML + querySelectorAll
跑三种写法（`details > summary` / `details summary` / `summary`），看各自命中数。
"""
import re
from pathlib import Path

SCAN = Path('/home/user/lonsha-memory-plugin/tests/audit/scan_ui_interaction.mjs')
UI = Path('/home/user/lonsha-memory-plugin/settings-ui.js')

src = SCAN.read_text(encoding='utf-8')
ui = UI.read_text(encoding='utf-8')

# 1) 真源里 details 结构是否在渲染模板里（不在注释/不在未用分支）
idx = ui.find('<details id="ls-advanced"')
seg = ui[idx:idx + 400]
print('=== 真源片段 ===')
print(seg[:300].replace('\n', '\\n'))
print()

# 2) shim 是否支持 '>' 子组合器？
print('=== shim 选择器支持情况 ===')
for pat in ['split(/\\s+/)', "'details > summary'", 'matchesOne', 'childCombinator']:
    print('  %-26s 出现 %d 次' % (pat, src.count(pat)))
print()
mt = re.search(r'function matchesOne\(el, sel\) \{(.*?)\n\}', src, re.S)
print('=== matchesOne 实现 ===')
print(mt.group(0) if mt else '(未找到)')
