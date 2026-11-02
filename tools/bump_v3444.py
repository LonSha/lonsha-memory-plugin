#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.444.0 抬版第一步：只改**版本号**（index.js / package.json / manifest.json /
模块副本 / README / state-report / realhost_readings）。

拆支理由（沿用 v3.440.0 现场教训）：版本号 / 文档三件 / TODO 各自独立，
任一文件形态变化只 abort 自己那一支，不牵连已跑成的部分。
"""
import json
import sys

V_OLD = '3.443.0'
V_NEW = '3.444.0'
REPO = '/home/user/lonsha-memory-plugin/'


def read(p):
    with open(REPO + p, 'r', encoding='utf8') as f:
        return f.read()


def write(p, s):
    with open(REPO + p, 'w', encoding='utf8') as f:
        f.write(s)


def sub_exact(text, old, new, expect, label):
    n = text.count(old)
    if n != expect:
        sys.exit('[abort] %s: 期望 %d 处，实测 %d 处' % (label, expect, n))
    return text.replace(old, new)


def bump_or_skip(text, old_pat, new_pat, label):
    """幂等抬版：已是新值就跳过（上一轮可能已改过一部分），
    但**两种值同时出现或都不出现**一律 abort（形态异常必须停下看，不许猜）。"""
    n_new = text.count(new_pat)
    n_old = text.count(old_pat)
    if n_new == 1 and n_old == 0:
        return text, False
    if n_old == 1 and n_new == 0:
        return text.replace(old_pat, new_pat), True
    sys.exit('[abort] %s 形态异常：old=%d new=%d' % (label, n_old, n_new))


# ---------- 1. index.js 的 VERSION 常量 ----------
c = read('index.js')
c, _ = bump_or_skip(c, "const VERSION = '%s';" % V_OLD, "const VERSION = '%s';" % V_NEW, 'index.js VERSION')
write('index.js', c)

# ---------- 2. package.json / manifest.json ----------
for p, indent in (('package.json', 2), ('manifest.json', 4)):
    obj = json.loads(read(p))
    v = obj.get('version')
    if v not in (V_OLD, V_NEW):
        sys.exit('[abort] %s version 期望 %s 或 %s，实为 %s' % (p, V_OLD, V_NEW, v))
    obj['version'] = V_NEW
    with open(REPO + p, 'w', encoding='utf8') as f:
        json.dump(obj, f, indent=indent, ensure_ascii=False)
        f.write('\n')

# ---------- 3. 模块副本 + 本版内核的 VERSION ----------
for p, pat in (('memory-organs.js', "let VERSION = '%s';"),
               ('memory-config.js', "let VERSION = '%s';"),
               ('memory-core.js', "let VERSION = '%s';"),
               ('round-entry-snapshot.js', "var VERSION = '%s';"),
               ('era-continuation-inheritance-tree.js', "var VERSION = '%s';")):
    s = read(p)
    s, _ = bump_or_skip(s, pat % V_OLD, pat % V_NEW, p + ' VERSION')
    write(p, s)

# ---------- 4. README 当前版本 ----------
s = read('README.md')
s, _ = bump_or_skip(s, '**当前版本**：`%s`' % V_OLD, '**当前版本**：`%s`' % V_NEW, 'README 当前版本')
write('README.md', s)

# ---------- 5. state-report.json（生成器产物：只抬版本指针，读数面维持原状） ----------
sr = json.loads(read('tests/audit/state-report.json'))
if sr.get('version') not in (V_OLD, V_NEW):
    sys.exit('[abort] state-report.version 期望 %s 或 %s，实为 %s' % (V_OLD, V_NEW, sr.get('version')))
sr['version'] = V_NEW
sr['version_sources'] = {k: V_NEW for k in sr.get('version_sources', {})}
sr['human_index_version'] = V_NEW
with open(REPO + 'tests/audit/state-report.json', 'w', encoding='utf8') as f:
    json.dump(sr, f, indent=2, ensure_ascii=False)
    f.write('\n')

# ---------- 6. realhost_readings.json（真机仍未执行，只抬版本指针） ----------
rh = json.loads(read('tests/audit/realhost_readings.json'))
if rh.get('version') not in (V_OLD, V_NEW):
    sys.exit('[abort] realhost_readings.version 期望 %s 或 %s，实为 %s' % (V_OLD, V_NEW, rh.get('version')))
rh['version'] = V_NEW
rh['reason'] = ('本版未执行真机复核（按纪律不写成通过）—— 全量回归按用户指令'
                '「做完计划全部内容前别跑全量」亦未跑')
with open(REPO + 'tests/audit/realhost_readings.json', 'w', encoding='utf8') as f:
    json.dump(rh, f, indent=2, ensure_ascii=False)
    f.write('\n')

print('bumped %s -> %s' % (V_OLD, V_NEW))
print('CHECK_OK')