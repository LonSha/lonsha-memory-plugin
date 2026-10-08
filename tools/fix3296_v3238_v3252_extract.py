#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.296.0 收口轮 · v3238 / v3252 判据自身缺陷修正（与 v3239 同族，一次性）。

根因：两档的 extractMethod 都用 `source.indexOf(name + '(')` 取「方法体」——
      命中**首次出现**，包括**调用点**。index.js:2981 那处 `this._numOrNull(_rec.floor)`
      调用早于 12375 行的定义，于是抽出来的是从调用点起的非法片段，
      `new Function` 解析期 SyntaxError：把「锚点漂了」误报成「实现有问题」。

修法：改锚**声明形态**（行首缩进 + 名字 + 参数表 + `{`，从该 `{` 起配平取体）。
"""
import io
import sys
import hashlib

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3296/'
FILES = ['tests/v3238_checkpoint_product_face.test.mjs',
         'tests/v3252_content_level_checkpoint_diff.test.mjs']

ANCHOR = """    const marker = name + '(';
    const start = source.indexOf(marker);
    assert.ok(start > 0, '找不到方法 ' + name);
    const bodyStart = source.indexOf('{', start);
"""

REPL = """    /* [v3.296.0 判据自身缺陷修正 · 与 v3239 同款] 原用 `source.indexOf(name + '(')` 取「方法体」——
     *   那命中**首次出现**，包括**调用点**：X1 落地后宿主里出现一处早于定义的
     *   `this._numOrNull(...)` 调用（召回解释读 recall 记录的 floor，index.js:2981），
     *   定义却在 12375 行，抽出来的片段以 `_numOrNull(_rec.floor),` 起头，
     *   `new Function` 解析期直接 SyntaxError —— 把「锚点漂了」误报成「实现坏了」。
     *   改锚**声明形态**（行首缩进 + 名字 + 参数表 + `{`，从该 `{` 起配平取体）：
     *   判据要的一直是方法体，强度不变，且不再受「文件里谁先提到这个名字」影响。 */
    const decl = new RegExp('(?:^|\\\\n)([ \\\\t]*)' + name + '\\\\s*\\\\([^)]*\\\\)\\\\s*\\\\{');
    const m = decl.exec(source);
    assert.ok(m, '找不到方法 ' + name);
    const start = m.index + (m[0].startsWith('\\n') ? 1 : 0) + m[1].length;
    const bodyStart = m.index + m[0].length - 1;
"""


def sha(t):
    return hashlib.sha256(t.encode('utf-8')).hexdigest()[:12]


def main():
    bad = 0
    for rel in FILES:
        src = io.open(ROOT + rel, encoding='utf-8').read()
        n = src.count(ANCHOR)
        print('%-8s %-46s 命中=%d' % (('OK' if n == 1 else 'BAD'), rel, n))
        if n != 1:
            bad += 1
    if bad:
        print('锚点校验未通过，未写盘。')
        sys.exit(2)
    for rel in FILES:
        src = io.open(ROOT + rel, encoding='utf-8').read()
        out = src.replace(ANCHOR, REPL, 1)
        io.open(BAK + rel.replace('/', '__') + '.fixE2', 'w', encoding='utf-8').write(src)
        io.open(ROOT + rel, 'w', encoding='utf-8').write(out)
        print('write %-46s %d → %d 字节 (sha %s → %s)' % (
            rel, len(src.encode('utf-8')), len(out.encode('utf-8')), sha(src), sha(out)))
    print('DONE 写盘文件数 = %d' % len(FILES))


if __name__ == '__main__':
    main()