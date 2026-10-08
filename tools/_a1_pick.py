#!/usr/bin/env python3
"""v3.296.0 · A1 第八刀选面：候选成员的规模 / 依赖数 / 判据耦合面。

输出每候选：行数、this.* 依赖名集合、提及它的测试文件、其体内独有文本字面量被测试锚着的处数。
"""
import io
import re
from pathlib import Path
from collections import Counter

ROOT = Path('/home/user/lonsha-memory-plugin')
LINES = io.open(ROOT / 'index.js', encoding='utf-8').read().split('\n')
TESTS = sorted(list((ROOT / 'tests').glob('*.mjs')))
AUDITS = sorted(list((ROOT / 'tests/audit').glob('*.mjs')))
ALLTXT = {}
for p in TESTS + AUDITS:
    try:
        ALLTXT[p] = io.open(p, encoding='utf-8').read()
    except Exception:
        pass

CAND = ['exportMemoryReport', 'optimizeMemory', 'typedFactsBlocks',
        '_absorbFactVersions', 'feedThinking', 'extractMemoryWithLLM',
        'showPanel', 'applyRepairPlan', 'applyCarryover', 'buildBridgeSnapshot']


def span_of(name):
    start = None
    for i, l in enumerate(LINES):
        if re.match(r'^        (?:async\s+)?' + re.escape(name) + r'\s*\(', l):
            start = i
            break
    if start is None:
        return None
    end = start
    for j in range(start + 1, len(LINES)):
        lj = LINES[j]
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
    sp = span_of(name)
    if not sp:
        print('%-24s 未找到' % name)
        continue
    s, e = sp
    body = '\n'.join(LINES[s:e + 1])
    deps = Counter(re.findall(r'\bthis\.([A-Za-z_$][\w$]*)', body))
    # 中文/专有字面量（用于估判据耦合）
    lits = set(re.findall(r"'([^']{2,20})'", body)) | set(re.findall(r'`([^`]{2,20})`', body))
    lits = {x for x in lits if not x.startswith('./') and not x.startswith('_')}
    hit_files = []
    for p, t in ALLTXT.items():
        n = t.count(name)
        if n:
            hit_files.append('%s(%d)' % (p.name, n))
    lit_hits = 0
    for lit in lits:
        for p, t in ALLTXT.items():
            if lit in t and p.name != 'index.js':
                lit_hits += 1
    print('=== %s  L%d-%d  %d 行 | deps %d | 提及文件 %d 个 | 字面量跨文件命中 %d ==='
          % (name, s + 1, e + 1, e - s + 1, len(deps), len(hit_files), lit_hits))
    print('    提及：%s' % (', '.join(hit_files[:14]) or '无'))
    print()