#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.342.0 M4-X3 连带面（续）：把当版真值同步进既有套件的登记值。
（patch3420_tests.py 已管 v3328；本脚本管剩下两处**上一刀交下来的值锁**。）

同步项：
  · v3283   ARCHIVE_TOP_LEVEL_KEYS 值级副本：len 677→694 / md5 36a755a4→3b37d478
            （本刀 `canonAdoption` 顶层键加法；两处副本 index.js / memory-organs.js 已同步）
            —— 真值**不手抄**：脚本调 tools/derive3420.mjs（逐字切 v3283 自身算法）取权威读数并核对。
            —— 档头注释那行原文把体长写成 661（与随行的 md5 36a755a4 并非同口径，是上一刀的笔误），
               本次一并校正为与登记值同口径，并把历史链补进「上一刀」。
  · v3202   豁免表键数 17→18（本刀 `canonAdoption` 与 annualDrafts 同族：跨对话带上会让
            新故事的第一次落卷被判成「重复确认」而静默不落 ⇒ 必须显式豁免，不得静默带入）。
口径：每个锚点必须**恰中 1 次**；只改「期望值」，不放宽判据，判据本体与破坏锚点一字不动。
"""
import io
import os
import re
import subprocess
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3420/'
DERIVE = ROOT + 'tools/derive3420.mjs'

NEW_LEN, NEW_MD5 = 694, '3b37d478'
OLD_LEN, OLD_MD5 = 677, '36a755a4'

if not os.path.isdir(BAK):
    os.makedirs(BAK)


def die(msg):
    sys.stderr.write('FAIL: ' + msg + '\n')
    sys.exit(1)


def authoritative_reading():
    """跑派生脚本（逐字切 v3283 自身算法）取得权威真值 —— 禁自写算法。"""
    if not os.path.exists(DERIVE):
        die('缺 %s（须先落盘派生脚本）' % DERIVE)
    r = subprocess.run(['node', DERIVE], cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        die('派生脚本失败：' + (r.stderr or '')[-400:])
    for line in r.stdout.splitlines():
        if line.startswith('ARCHIVE_TOP_LEVEL_KEYS'):
            parts = [p.strip() for p in line.split('|')]
            return int(re.search(r'len=(\d+)', parts[2]).group(1)), re.search(r'md5=([0-9a-f]{8})', parts[3]).group(1)
    die('派生脚本未产出该常量读数')
    return None


def patch(rel, subs, label):
    """subs: [(old, new)]，每个锚点须恰中 1 次。"""
    p = ROOT + rel
    t = io.open(p, encoding='utf-8').read()
    io.open(BAK + rel.replace('/', '_') + '.pre3420b', 'w', encoding='utf-8').write(t)
    for old, new in subs:
        n = t.count(old)
        if n != 1:
            die('%s: 锚点命中 %d 次（须 1）：%r' % (label, n, old[:80]))
        t = t.replace(old, new, 1)
    io.open(p, 'w', encoding='utf-8').write(t)
    print('OK %s（%d 处）' % (rel, len(subs)))


# ── 0. 权威真值（v3283 自身算法） ──
got_len, got_md5 = authoritative_reading()
print('  权威真值（v3283 自身算法）：len=%d md5=%s' % (got_len, got_md5))
if (got_len, got_md5) != (NEW_LEN, NEW_MD5):
    die('真值与预期不符：实 %d/%s 预期 %d/%s' % (got_len, got_md5, NEW_LEN, NEW_MD5))

V3283 = 'tests/v3283_o7_const_table_copy_ledger.test.mjs'
src = io.open(ROOT + V3283, encoding='utf-8').read()
if 'M4-X3' in src:
    die('v3283 里已有 M4-X3 痕迹（拒绝重跑）')

# 档头注释整行（正则定位后写入同口径新文）
m = re.search(r'^//\s+ARCHIVE_TOP_LEVEL_KEYS\s+index\.js ↔ memory-organs\.js\s+.*$', src, re.M)
if not m:
    die('档头登记说明行未找到')
note_old = m.group(0)
note_new = ('//     ARCHIVE_TOP_LEVEL_KEYS   index.js ↔ memory-organs.js   %d 字符  md5 %s'
            '（v3.342.0 M4-X3 增 canonAdoption；上一刀为 %d / %s）' % (NEW_LEN, NEW_MD5, OLD_LEN, OLD_MD5))

patch(V3283, [
    ("['ARCHIVE_TOP_LEVEL_KEYS', ['index.js', 'memory-organs.js'], %d, '%s', 'Object.freeze(['],"
     % (OLD_LEN, OLD_MD5),
     "['ARCHIVE_TOP_LEVEL_KEYS', ['index.js', 'memory-organs.js'], %d, '%s', 'Object.freeze(['],"
     % (NEW_LEN, NEW_MD5)),
    (note_old, note_new),
], 'v3283')

patch('tests/v3202_carryover_rollback_breadth.test.mjs', [
    ("    assert.equal(exempt.length, 17, '豁免表本版应为 17 键（v3.341.0 M4-X2 新增 annualDrafts；上一刀 16），实际 ' + exempt.length);",
     "    assert.equal(exempt.length, 18, '豁免表本版应为 18 键（v3.342.0 M4-X3 新增 canonAdoption；上一刀 17），实际 ' + exempt.length);"),
], 'v3202')

# ── 自证：旧值清零、新值就位 ──
t2 = io.open(ROOT + V3283, encoding='utf-8').read()
if "%d, '%s'" % (NEW_LEN, NEW_MD5) not in t2:
    die('v3283 新值未就位')
if ".length, 18, '豁免表本版应为 18 键" not in io.open(ROOT + 'tests/v3202_carryover_rollback_breadth.test.mjs', encoding='utf-8').read():
    die('v3202 新值未就位')
print('  ✓ 自证通过：v3283 值级副本 / v3202 豁免键数已同口径回填')