#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.331.0 · M4-O3「回答从行拼接变成有据的事件解释」收口抬版。

纪律（沿用 tools/bump3300.py 一脉）：
  · 每处替换断言**恰中 1 次**；失配即退出；先验全部锚点，再统一写盘；
  · 版本源 = index.js / manifest.json / package.json + 三份模块副本
    （memory-config / memory-core / memory-organs 的 `let VERSION`，
     注入失败时它们就是真实现，故必须 let）；
  · **当版锚交接**（版本守卫 V4 形态）：v3330 出生时就地持有 `QA_VERSION === 2`
    这一格；本版把问答面抬到 3 ⇒ 该断言必须改判「**不低于 2**」并注明
    当版读数由 v3331 接管，否则 v3330 会把自己**曾经正确**的读数判红。
  · `EQ.QA_VERSION` 的**当版锚**落在 v3331（== 3），不在这里重复声明。
"""
import io
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
OLD, NEW = '3.330.0', '3.331.0'
_log = []


class Doc(object):
    def __init__(self, rel):
        self.rel = rel
        self.s = io.open(ROOT + rel, encoding='utf-8').read()
        self.dirty = False

    def sub(self, old, new, why):
        n = self.s.count(old)
        if n != 1:
            sys.exit('[bump3331] %s 锚点命中 %d 次（要求恰 1 次）：%s' % (self.rel, n, why))
        if old == new:
            sys.exit('[bump3331] %s 同值替换等于没改：%s' % (self.rel, why))
        self.s = self.s.replace(old, new, 1)
        self.dirty = True
        _log.append((self.rel, why))

    def write(self):
        if self.dirty:
            io.open(ROOT + self.rel, 'w', encoding='utf-8').write(self.s)


# ── ① 六源同源 ─────────────────────────────────────────────
six = ['index.js', 'manifest.json', 'package.json', 'memory-config.js', 'memory-core.js', 'memory-organs.js']
docs = {}
for rel in six:
    docs[rel] = Doc(rel)
for rel in six:
    d = docs[rel]
    if rel == 'index.js':
        d.sub("const VERSION = '%s'" % OLD, "const VERSION = '%s'" % NEW, '入口版本')
    elif rel == 'manifest.json':
        d.sub('"version": "%s"' % OLD, '"version": "%s"' % NEW, 'manifest 版本')
    elif rel == 'package.json':
        d.sub('"version": "%s"' % OLD, '"version": "%s"' % NEW, 'package 版本')
    else:
        d.sub("let VERSION = '%s'" % OLD, "let VERSION = '%s'" % NEW, '模块副本版本（须 let）')

# ── ② v3330 出生版锚交棒 ────────────────────────────────────
t30 = Doc('tests/v3330_m4o2_qa_topic_actors.test.mjs')
t30.sub(
    "    assert.equal(EQ.QA_VERSION, 2, '本档出生时问答面版本为 2（M4-O2 抬版读数由本档持有）');",
    "    /* [v3.331.0 交棒] 本档出生时该面为 2（M4-O2 抬版读数由本档持有）；\n"
    "     *   v3.331.0 M4-O3 把它抬到 3 ⇒ 这里改判「不低于 2」的下界，\n"
    "     *   当版锚（== 3）由 v3331 持有（版本守卫 V4：出生版读数不得被新抬版判红）。 */\n"
    "    assert.ok(EQ.QA_VERSION >= 2, '本档只在问答面不低于 2 时成立（出生时为 2）');",
    'v3330 出生版锚交棒（F1）')
t30.sub(
    "    assert.equal(EQ.QA_VERSION, 2, '问答面版本锚必须在场');",
    "    assert.ok(EQ.QA_VERSION >= 2, '问答面版本锚必须在场（不低于出生时的 2）');",
    'v3330 出生版锚交棒（F2）')

for d in list(docs.values()) + [t30]:
    d.write()
for rel, why in _log:
    print('[ok] %-46s %s' % (rel, why))
print('[OK] v3.331.0 六源同源 + v3330 出生版锚交棒完成')