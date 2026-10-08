#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.296.0 收口轮 · v3239 判据自身缺陷修正（一次性）。

现象：B1 把 index.js:2981 的 `audit.floor` 改走 `this._numOrNull(_rec.floor)` 之后，
      v3239 的 A2/A3/C1/D1 四档齐报 SyntaxError: Unexpected token '.'。

根因（判据缺陷，不是实现缺陷）：本档的 extractMethod 用 `source.indexOf(name + '(')`
      取「方法体」—— 那命中**首次出现**。宿主定义在 12375 行，而新加的那处**调用**在
      2981 行，于是抽出来的是 `_numOrNull(_rec.floor),` 起的非法片段，
      `new Function` 解析期就炸：把「锚点漂了」误报成「实现有问题」。

修法：extractMethod 改锚**声明形态**（行首缩进 + 名字 + 参数表 + `{`，从该 `{` 配平取体）。
      判据强度不变（它要的本来就是方法体），但不再受「文件里哪儿先提到这个名字」影响。
"""
import io
import sys
import hashlib

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3296/'
REL = 'tests/v3239_null_is_not_zero.test.mjs'

ANCHOR = """function extractMethod(source, name) {
    const marker = name + '(';
    const start = source.indexOf(marker);
    if (start <= 0) return null;
    const bodyStart = source.indexOf('{', start);
    if (bodyStart < 0) return null;
    let depth = 0, end = -1;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) return null;
    return source.slice(start, end + 1);
}
"""

REPL = """/* [v3.296.0 判据自身缺陷修正] 原实现用 `source.indexOf(name + '(')` 取「方法体」——
 *   那命中**首次出现**，包括**调用点**。X1 落地后宿主里出现一处早于定义的
 *   `this._numOrNull(...)` 调用（召回解释读 recall 记录的 floor，见 index.js:2981），
 *   定义却在 12375 行；于是抽出来的是「调用点 + 后续代码」这段非法片段，
 *   `new Function` 解析期直接 SyntaxError —— A2/A3/C1/D1 四档齐报「实现有问题」，
 *   而实现本身没问题：这是「锚点漂了」被误报成「实现缺陷」（本仓 E6 形态）。
 *   改锚**声明形态**（行首缩进 + 名字 + 参数表 + `{`，从该 `{` 起配平取体）：
 *   判据要的一直是方法体，强度不变，但不再受「文件里哪儿先提到这个名字」影响。 */
function extractMethod(source, name) {
    const decl = new RegExp('(?:^|\\\\n)([ \\\\t]*)' + name + '\\\\s*\\\\([^)]*\\\\)\\\\s*\\\\{');
    const m = decl.exec(source);
    if (!m) return null;
    const start = m.index + (m[0].startsWith('\\n') ? 1 : 0) + m[1].length;
    const bodyStart = m.index + m[0].length - 1;
    let depth = 0, end = -1;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) return null;
    return source.slice(start, end + 1);
}
"""


def sha(t):
    return hashlib.sha256(t.encode('utf-8')).hexdigest()[:12]


def main():
    src = io.open(ROOT + REL, encoding='utf-8').read()
    n = src.count(ANCHOR)
    print('锚点命中 = %d（须为 1）' % n)
    if n != 1:
        print('未写盘。')
        sys.exit(2)
    out = src.replace(ANCHOR, REPL, 1)
    io.open(BAK + REL.replace('/', '__') + '.fixE', 'w', encoding='utf-8').write(src)
    io.open(ROOT + REL, 'w', encoding='utf-8').write(out)
    print('write %s %d → %d 字节 (sha %s → %s)' % (REL, len(src.encode('utf-8')), len(out.encode('utf-8')), sha(src), sha(out)))
    # 语法自检：把新文件按 ESM 解析（node --check 不支持 mjs 的 import 无关，node --input-type 亦可）
    print('DONE')


if __name__ == '__main__':
    main()