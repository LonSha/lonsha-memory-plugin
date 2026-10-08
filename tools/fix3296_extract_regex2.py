#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""v3.296.0 收口轮 · 修正上一修补丁里的 regex 缺陷（一次性）。

上一版把三档 extractMethod 改成「声明形态锚」，但锚不含 `function` 前缀，于是
v3252 要从模块里抽 `function diffPayloads(a, b) {` 时匹配失败（报「找不到方法 diffPayloads」）。
本次补上可选前缀（文件里的 JS 串须保留双反斜杠转义，故 Python 侧一律用 raw 串写 \\）：

    (?:^|\\n)([ \\t]*)(?:async[ \\t]+)?(?:function[ \\t]+)?<name>\\s*\\([^)]*\\)\\s*\\{

仍只认「行首缩进 + 名字 + 参数表 + `{`」这一形态；`this._numOrNull(...)` 这类带接收者的
调用点天然不匹配 —— 这正是本修的目的。
"""
import io
import sys
import hashlib

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3296/'
FILES = ['tests/v3239_null_is_not_zero.test.mjs',
         'tests/v3238_checkpoint_product_face.test.mjs',
         'tests/v3252_content_level_checkpoint_diff.test.mjs']

OLD = r"    const decl = new RegExp('(?:^|\\n)([ \\t]*)' + name + '\\s*\\([^)]*\\)\\s*\\{');"
RE = r"'(?:^|\\n)([ \\t]*)(?:async[ \\t]+)?(?:function[ \\t]+)?' + name + '\\s*\\([^)]*\\)\\s*\\{'"
NEW = ("    /* [v3.296.0] 声明形态锚：行首缩进 + 可选的 async/function 前缀 + 名字 + 参数表 + `{`。\n"
       "     *   不含前缀的版本会漏掉模块级 function 声明（v3252 抽 diffPayloads 时即栽在此）。 */\n"
       "    const decl = new RegExp(" + RE + ");")


def sha(t):
    return hashlib.sha256(t.encode('utf-8')).hexdigest()[:12]


def main():
    bad = 0
    for rel in FILES:
        src = io.open(ROOT + rel, encoding='utf-8').read()
        n = src.count(OLD)
        print('%-8s %-52s 命中=%d' % (('OK' if n == 1 else 'BAD'), rel, n))
        if n != 1:
            bad += 1
    if bad:
        print('锚点校验未通过，未写盘。')
        sys.exit(2)
    for rel in FILES:
        src = io.open(ROOT + rel, encoding='utf-8').read()
        out = src.replace(OLD, NEW, 1)
        io.open(BAK + rel.replace('/', '__') + '.fixE3', 'w', encoding='utf-8').write(src)
        io.open(ROOT + rel, 'w', encoding='utf-8').write(out)
        print('write %-46s %d → %d 字节 (sha %s → %s)' % (
            rel, len(src.encode('utf-8')), len(out.encode('utf-8')), sha(src), sha(out)))
    print('DONE 写盘文件数 = %d' % len(FILES))


if __name__ == '__main__':
    main()