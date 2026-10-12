#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch_b_o4_fix2.py - [v3.321.0 · B 包 M3-O4 自伤修复 ②]

自伤现象：salienceIndex 的 postings 键是**整句**，归档等于把正文原样存了一份
  （既有「第二份真源」的味道，索引也完全没价值 —— 没有哪个查询会等于整句）。

根因：中文分词写成 `/[^\\p{L}\\p{N}]+/` 切分。汉字全部属于 \\p{L}，
  所以「约定好周一交东西。」只会在句号处断开，整句成了一个「词」。
  （ASCII 语言下这个写法是对的，中文下它静默失效 —— 又一个「判据声称在检查、
  实际没在检查」的形状。）

修法：新增 bigrams() —— 连续中文段按 2-gram 切、连续字母数字段按整词（长度≥2）切；
  salienceIndex 与 lookupSalient 都改用它。归档从此只存 2-gram 关键词，不含整句。
  匹配语义在 docstring 里如实写明：句子与查询**共享任一关键词片段**即命中。

自检纯度：断言只引用被替换掉的**旧代码行字面量**，且这些字面量在替换后
  必然不存在（新旧行不同），不出现「判据引用新写入内容导致自指」的形状。
"""
import io
import sys

P = 'stm-ltm.js'
src = io.open(P, encoding='utf-8').read()
lines = src.split('\n')

# 旧代码行字面量（用于锚点定位与替换后残留断言）
OLD_IDX_TOK = "for (const w of String(t).replace(/[^\\p{L}\\p{N}]+/gu, ' ').split(/\\s+/)) {"
OLD_LK_TOK = "? q.replace(/[^\\p{L}\\p{N}]+/gu, ' ').split(/\\s+/).filter(w => w.length >= 2)"


def only(pred, label):
    hits = [i for i, l in enumerate(lines) if pred(l, i)]
    if len(hits) != 1:
        sys.exit('[o4fix2] anchor %s hit %d (expect 1)' % (label, len(hits)))
    return hits[0]


def has(sub):
    return lambda l, i: sub in l


i_quote = only(has('const QUOTE_RE = '), 'quote-re')
i_idx_tok = only(has(OLD_IDX_TOK), 'idx-token')
i_lk_tok = only(has(OLD_LK_TOK), 'lk-token')
i_idx_doc = only(has(' * 只存「条目 id + 关键词」，**不复制正文**'), 'idx-doc')
i_lk_doc = only(has(' * recoverable 按**命中条目**如实报 true/false，不报 null：'), 'lk-doc')

BIGRAMS = [
    '/**',
    ' * [v3.321 · M3-O4] 关键词切片：连续中文段按 2-gram、连续字母数字段按整词（长度≥2）。',
    ' *',
    ' * 按「非字母数字字符」切分对中文是无效的：汉字本身就是字母类字符，',
    ' *   整句会被当成一个「词」—— 倒排归档于是退化成「把正文原样存一份」，',
    ' *   既没有索引价值，也成了第二份正文副本。改为按字切 2-gram 才有检索意义。',
    ' * 单字中文不产出（长度 < 2 的片段在检索里是噪声）。',
    ' */',
    'function bigrams(text) {',
    "  const s = String(text == null ? '' : text).toLowerCase();",
    '  const out = [];',
    '  const re = /[\\u3400-\\u9fff\\uf900-\\ufaff]+|[0-9a-z]+/g;',
    '  re.lastIndex = 0;',
    '  let m;',
    '  while ((m = re.exec(s))) {',
    '    const p = m[0];',
    '    if (/^[0-9a-z]+$/.test(p)) {',
    '      if (p.length >= 2) out.push(p);',
    '    } else if (p.length === 1) {',
    '      // 单字中文不进索引（噪声），此处显式跳过而非静默产出长度 1 的键',
    '    } else {',
    '      for (let i = 0; i + 1 < p.length; i++) out.push(p.slice(i, i + 2));',
    '    }',
    '  }',
    '  return out;',
    '}',
]

IDX_DOC_NEW = [
    ' * 只存「条目 id + 2-gram 关键词」，**不复制正文** —— 归档是为了「找得到」，',
    ' *   不是为了变成第二份摘要（第二份摘要就会变成第二个真源）。',
]

IDX_TOK_NEW = [
    '      for (const w of bigrams(t)) {',
]

LK_DOC_NEW = [
    ' * recoverable 按**命中条目**如实报 true/false，不报 null：',
    ' *   「这一条能不能回源」是二值的，含糊其辞等于把判据做没了。',
    ' * 匹配语义（**如实写明，不含糊**）：查询与句子**共享任一关键词片段**即命中。',
    ' *   这是「找得到」导向的召回口径，不是精确匹配 —— 精确匹配留给上层排序。',
]

LK_TOK_NEW = [
    '    ? bigrams(q)',
]

ops = [
    (i_quote + 1, i_quote + 1, BIGRAMS),
    (i_idx_doc, i_idx_doc + 1, IDX_DOC_NEW),
    (i_idx_tok, i_idx_tok + 1, IDX_TOK_NEW),
    (i_lk_doc, i_lk_doc + 1, LK_DOC_NEW),
    (i_lk_tok, i_lk_tok + 1, LK_TOK_NEW),
]
ops.sort(key=lambda x: x[0])
for a, b in zip(ops, ops[1:]):
    if a[1] > b[0]:
        sys.exit('[o4fix2] ops overlap %r %r' % (a, b))
for start, end, new in sorted(ops, key=lambda x: -x[0]):
    lines[start:end] = new

out = '\n'.join(lines)
if not out.endswith('\n'):
    out += '\n'
# H5 判据纯度：断言只引用旧行字面量与函数定义计数，不引用本次新写入的文本内容
if out.count(OLD_IDX_TOK) != 0:
    sys.exit('[o4fix2] 旧分词行仍在（salienceIndex）')
if out.count(OLD_LK_TOK) != 0:
    sys.exit('[o4fix2] 旧分词行仍在（lookupSalient）')
if out.count('function bigrams(') != 1:
    sys.exit('[o4fix2] bigrams 定义出现次数不为 1（%d）' % out.count('function bigrams('))
if out.count('bigrams(t)') != 1 or out.count('bigrams(q)') != 1:
    sys.exit('[o4fix2] 调用点缺失：bigrams(t)=%d bigrams(q)=%d'
             % (out.count('bigrams(t)'), out.count('bigrams(q)')))
io.open(P, 'w', encoding='utf-8').write(out)
print('[o4fix2] wrote %s lines %d -> %d' % (P, len(src.split('\n')), len(out.split('\n'))))