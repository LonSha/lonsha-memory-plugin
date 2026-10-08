#!/usr/bin/env python3
"""v3.296.0 · A1 第八刀侦察：候选成员的 this.* 依赖面（决定剥哪一块最松）。

对每个候选成员，输出：行数、`this.X` 的 unique 名字集合（按出现次数排序）。
判据：依赖集合越小越松（剥走时注入面越窄）。
"""
import io
import re
from collections import Counter
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
LINES = io.open(ROOT / 'index.js', encoding='utf-8').read().split('\n')

CAND = ['exportMemoryReport', 'optimizeMemory', 'applyCarryover',
        'extractMemoryWithLLM', 'buildBridgeSnapshot', 'applyRepairPlan']


def span_of(name, lines):
    start = None
    for i, l in enumerate(lines):
        if re.match(r'^        (?:async\s+)?' + re.escape(name) + r'\s*\(', l):
            start = i
            break
    if start is None:
        return None
    end = start
    for j in range(start + 1, len(lines)):
        lj = lines[j]
        if not lj.strip():
            continue
        ind = len(lj) - len(lj.lstrip())
        if ind == 8 and lj.strip() == '}':
            end = j
            break
        if ind <= 8 and lj.strip() != '}':
            break
        end = j
    return start, end


for name in CAND:
    sp = span_of(name, LINES)
    if not sp:
        print('%-24s 未找到' % name)
        continue
    s, e = sp
    body = '\n'.join(LINES[s:e + 1])
    refs = Counter(re.findall(r'\bthis\.([A-Za-z_$][\w$]*)', body))
    n = e - s + 1
    print('=== %s  L%d-%d  %d 行 ===' % (name, s + 1, e + 1, n))
    print('    this.* 依赖 %d 个：%s' % (len(refs), ', '.join(
        '%s(%d)' % (k, v) for k, v in refs.most_common(40))))
    print()