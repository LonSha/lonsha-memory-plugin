#!/usr/bin/env python3
"""v3.296.0 · A1 第八刀侦察：宿主超线 326 行，找可剥的低耦合成员。

输出：候选成员的行范围、this. 调用计数、被 this.<name> 引用的次数、被外部文件引用次数。
"""
import io
import re
from pathlib import Path
from collections import Counter

ROOT = Path('/home/user/lonsha-memory-plugin')
SRC = io.open(ROOT / 'index.js', encoding='utf-8').read()
LINES = SRC.split('\n')


def member_spans(src):
    """粗扫 class MemoryEngine 内的成员（4 空格缩进的 name(...) { / get name() {）。"""
    out = []
    for i, l in enumerate(src):
        m = re.match(r'^        (?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\(', l)
        if not m:
            continue
        name = m.group(1)
        if name in ('if', 'for', 'while', 'switch', 'catch', 'return', 'function'):
            continue
        indent = len(l) - len(l.lstrip())
        if indent != 8:
            continue
        # 找到同名成员的匹配结束行（缩进回到 <=8 且非空）
        end = i
        for j in range(i + 1, len(src)):
            lj = src[j]
            if not lj.strip():
                continue
            ind = len(lj) - len(lj.lstrip())
            if ind <= 8 and lj.strip() != '}':
                break
            if ind == 8 and lj.strip() == '}':
                end = j
                break
            end = j
        out.append((name, i + 1, end + 1, end - i + 1))
    return out


spans = member_spans(LINES)
print('候选（>=120 行）:')
for name, s, e, n in spans:
    if n < 120:
        continue
    body = '\n'.join(LINES[s - 1:e])
    self_calls = len(re.findall(r'this\.' + re.escape(name) + r'\b', body))
    this_refs = len(re.findall(r'\bthis\.', body))
    print('  %-28s L%-6d-%-6d %4d 行 | 自身递归 %d | this. 引用 %d' % (name, s, e, n, self_calls, this_refs))
print()
print('总数 %d 行' % len(LINES))

# 外部（非 index.js）对 index.js 里方法的引用面：粗判 —— 各模块/测试里出现 `eng.<name>` 或 `.name(`
cand = [x for x in spans if x[3] >= 120]
files = [p for p in ROOT.rglob('*.js') if 'node_modules' not in str(p) and p.name != 'index.js']
files += [p for p in ROOT.rglob('*.mjs') if 'node_modules' not in str(p)]
print('\n外部引用计数（*.js/*.mjs，粗扫 .<name>( ）:')
for name, s, e, n in cand:
    c = 0
    for p in files:
        try:
            t = io.open(p, encoding='utf-8').read()
        except Exception:
            continue
        c += len(re.findall(r'\.' + re.escape(name) + r'\s*\(', t))
    print('  %-28s %4d 行 | 外部 .name( 出现 %d' % (name, n, c))