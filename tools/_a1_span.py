#!/usr/bin/env python3
"""v3.296.0 · A1 第八刀：量报告域成员的行范围与 this 形态。"""
import io
import re
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
LINES = io.open(ROOT / 'index.js', encoding='utf-8').read().split('\n')

TARGETS = ['exportMemoryReport', '_ledgerViolationReport', '_ledgerViolationMarkdown',
           'optimizeMemory']


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


for name in TARGETS:
    sp = span_of(name)
    if not sp:
        print('%-26s 未找到' % name)
        continue
    s, e = sp
    body = LINES[s:e + 1]
    txt = '\n'.join(body)
    bare = re.findall(r'(?<![\w.$])this(?![\w$])', txt)
    print('%-26s L%-6d-%-6d %4d 行 | 裸 this %d 处 | this. 出现 %d'
          % (name, s + 1, e + 1, e - s + 1, len(bare), len(re.findall(r'this\.', txt))))
    for b in re.finditer(r'(?<![\w.$])this(?![\w$])', txt):
        ln = txt[:b.start()].count('\n') + s + 1
        print('      裸 this @ L%d: %s' % (ln, body[ln - s - 1].strip()[:90]))