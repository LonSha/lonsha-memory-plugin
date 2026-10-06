#!/usr/bin/env python3
"""v3.287.0 · O2 抬版：3.286.0 → 3.287.0（按本仓「五源」口径 + 三模块副本 + 文档在役面读数）。

为什么是「五源」而不是「四源」（v3.286.0 已留痕，照抄防再踩）：
  ①  index.js            const VERSION = 'x.y.z';
  ②  manifest.json       "version": "x.y.z"
  ③  package.json        "version": "x.y.z"
  ④  CHANGELOG.md        顶行 `## vX.Y.Z`（含顶节自述「tests/x.test.mjs（N 条）」）
  ⑤  README.md           「**当前版本**：`x.y.z`」行 —— 这一行被 scan_doc_truthfulness D1 硬校验，
                         只改前四处会让文档门直接翻红。
另加：模块侧三个 `let VERSION` 副本、TODO「最近更新」行、PLAN 现行节进度与在役面读数、
     README 在役面小结行（按磁盘真值）。

幂等：全部替换都先断言锚点恰命中 1 次；已抬版则整脚本跳过。
"""
from pathlib import Path

REPO = Path('/home/user/lonsha-memory-plugin')
OLD = '3.286.0'
NEW = '3.287.0'

# 磁盘真值（本脚本运行前实测）：上一版 267 档 / 58 门禁 / 61 audit .mjs
FACES = {
    'tests': ('267', '268'),
    'gates': ('58', '58'),
    'audit_mjs': ('61', '62'),
}


def sub_once(text, old, new, label):
    n = text.count(old)
    if n != 1:
        raise SystemExit('[FATAL] %s 锚点命中 %d 次（须恰 1 次），不写盘' % (label, n))
    return text.replace(old, new, 1)


def edit(rel, fn):
    p = REPO / rel
    s = p.read_text(encoding='utf-8')
    if s.count(OLD) == 0 and fn.__name__ != 'no_version':
        print('  [skip] %s 已无 %s' % (rel, OLD))
        return False
    ns = fn(s)
    if ns != s:
        p.write_text(ns, encoding='utf-8')
        print('  [ok] %s' % rel)
        return True
    print('  [skip] %s 无变化' % rel)
    return False


def no_version(s):
    return s


def v_index(s):
    return sub_once(s, "const VERSION = '" + OLD + "';", "const VERSION = '" + NEW + "';", 'index.js')


def v_pkg(s):
    return sub_once(s, '"version": "' + OLD + '"', '"version": "' + NEW + '"', 'package.json')


def v_manifest(s):
    return sub_once(s, '"version": "' + OLD + '"', '"version": "' + NEW + '"', 'manifest.json')


def v_module(s):
    return sub_once(s, "let VERSION = '" + OLD + "';", "let VERSION = '" + NEW + "';", 'module VERSION')


def main():
    print('=== 抬版 %s -> %s ===' % (OLD, NEW))
    changed = []
    for rel, fn in [
        ('index.js', v_index),
        ('package.json', v_pkg),
        ('manifest.json', v_manifest),
        ('memory-config.js', v_module),
        ('memory-core.js', v_module),
        ('memory-organs.js', v_module),
    ]:
        if edit(rel, fn):
            changed.append(rel)
    print('  已改 %d 处版本源' % len(changed))
    print()
    print('注意：CHANGELOG 顶节 / TODO / README / PLAN 的正文改写由 tools/_o2_docs.py 负责')
    print('     （含顶节新增、在役面读数按磁盘真值 %s 测试档 / %s 门禁 / %s audit .mjs）。'
          % (FACES['tests'][1], FACES['gates'][1], FACES['audit_mjs'][1]))


if __name__ == '__main__':
    main()