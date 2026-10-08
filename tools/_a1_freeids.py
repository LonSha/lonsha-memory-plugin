#!/usr/bin/env python3
"""v3.296.0 · A1 第八刀：提取面（报告域）的全局符号用量 + 判据体切片点普查。"""
import io
import re
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
SRC = io.open(ROOT / 'index.js', encoding='utf-8').read()
LINES = SRC.split('\n')

MEMBERS = ['exportMemoryReport', 'optimizeMemory', '_ledgerViolationReport',
           '_ledgerViolationMarkdown', '_ledgerViolationSummary']


def span_of(name):
    for i, l in enumerate(LINES):
        if re.match(r'^        (?:async\s+)?' + re.escape(name) + r'\s*\(', l):
            start = i
            break
    else:
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


KNOWN = set(MEMBERS) | {'push', 'console', 'window', 'require', 'module', 'globalThis',
                        'String', 'Number', 'Array', 'Object', 'Math', 'Set', 'Map', 'Date',
                        'JSON', 'Promise', 'Boolean', 'isFinite', 'parseInt', 'parseFloat'}
tot = 0
for name in MEMBERS:
    sp = span_of(name)
    s, e = sp
    tot += e - s + 1
    body = '\n'.join(LINES[s:e + 1])
    body_wo_this = re.sub(r'\bthis\.[A-Za-z_$][\w$]*', '', body)
    ids = set(re.findall(r'(?<![\w.$])([A-Za-z_$][\w$]*)\s*[\(\.]', body_wo_this))
    free = sorted(x for x in ids if x not in KNOWN and not re.match(r'^[A-Z][A-Z_]+$', x) is None or False)
    print('%-26s L%-6d-%-6d %4d 行' % (name, s + 1, e + 1, e - s + 1))
    print('     自由标识符：%s' % ', '.join(sorted(ids - KNOWN)))
print('合计 %d 行' % tot)
print('index.js %d 行 → 提取后约 %d 行' % (len(LINES), len(LINES) - tot))