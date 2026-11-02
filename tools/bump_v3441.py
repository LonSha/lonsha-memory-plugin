#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.441.0 抬版第一步：只改**九处版本号**（index.js / package.json / manifest.json / 三个模块副本 /
README / state-report / realhost_readings）。

为什么拆成三支脚本（v3.440.0 的现场教训，本版沿用）：
  上一版把版本号 + CHANGELOG + PLAN + TODO 全塞进一支脚本，结果连吃两记 abort：
    ① CHANGELOG 守卫写成 `cl.startswith('# ')`，而真源首行是 `## v3.xxx` ⇒ 健康树上直接 abort；
    ② TODO 守卫要求「`> **最近更新：` 恰 1 处」，实测全文件 22 处（本仓该串是历史留痕链，
       `> **历史留痕：` 41 处、`> **上一版更新：` 2 处）⇒ 又是健康树上 abort。
  拆开的好处：第一支只管版本号，跑完即可用 `grep` 复核；文档三件各用自己那一支，
  定位口径按各文件真源写成（CHANGELOG 用 `## v` 前缀、PLAN 用 `> **当前执行状态（`、
  TODO 用 `hit[0]` 取第一处），不再互相牵连。
"""
import json
import sys

V_OLD = '3.440.0'
V_NEW = '3.441.0'
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


# ---------- 1. index.js 的 VERSION 常量 ----------
c = read('index.js')
c = sub_exact(c, "const VERSION = '%s';" % V_OLD, "const VERSION = '%s';" % V_NEW, 1, 'index.js VERSION')
write('index.js', c)

# ---------- 2. package.json / manifest.json ----------
for p, indent in (('package.json', 2), ('manifest.json', 4)):
    obj = json.loads(read(p))
    if obj.get('version') != V_OLD:
        sys.exit('[abort] %s version 期望 %s，实为 %s' % (p, V_OLD, obj.get('version')))
    obj['version'] = V_NEW
    with open(REPO + p, 'w', encoding='utf8') as f:
        json.dump(obj, f, indent=indent, ensure_ascii=False)
        f.write('\n')

# ---------- 3. 三个模块副本的 VERSION ----------
for p in ('memory-organs.js', 'memory-config.js', 'memory-core.js'):
    s = read(p)
    s = sub_exact(s, "let VERSION = '%s';" % V_OLD, "let VERSION = '%s';" % V_NEW, 1, p + ' VERSION')
    write(p, s)

# ---------- 4. README 当前版本 ----------
s = read('README.md')
s = sub_exact(s, '**当前版本**：`%s`' % V_OLD, '**当前版本**：`%s`' % V_NEW, 1, 'README 当前版本')
write('README.md', s)

# ---------- 5. state-report.json（生成器产物：只抬版本指针，读数面维持原状） ----------
sr = json.loads(read('tests/audit/state-report.json'))
if sr.get('version') != V_OLD:
    sys.exit('[abort] state-report.version 期望 %s，实为 %s' % (V_OLD, sr.get('version')))
sr['version'] = V_NEW
sr['version_sources'] = {k: V_NEW for k in sr.get('version_sources', {})}
sr['human_index_version'] = V_NEW
with open(REPO + 'tests/audit/state-report.json', 'w', encoding='utf8') as f:
    json.dump(sr, f, indent=2, ensure_ascii=False)
    f.write('\n')

# ---------- 6. realhost_readings.json（exit-bail reads：真机仍未执行，只抬版本指针） ----------
rh = json.loads(read('tests/audit/realhost_readings.json'))
if rh.get('version') != V_OLD:
    sys.exit('[abort] realhost_readings.version 期望 %s，实为 %s' % (V_OLD, rh.get('version')))
rh['version'] = V_NEW
rh['reason'] = 'ST 未就绪（http://127.0.0.1:1/ ⇒ 0）—— 先起 SillyTavern；本版未执行真机复核（按纪律不写成通过）'
with open(REPO + 'tests/audit/realhost_readings.json', 'w', encoding='utf8') as f:
    json.dump(rh, f, indent=2, ensure_ascii=False)
    f.write('\n')

print('bump versions done: %s -> %s' % (V_OLD, V_NEW))