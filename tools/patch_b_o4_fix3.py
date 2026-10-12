#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch_b_o4_fix3.py - [v3.321.0 · B 包 M3-O4 自伤修复 ③]

自伤现象（成对套件 v3321 B4 首跑抓到）：`keepSalient` 的「原话」一类**恒不命中**。
  `keepSalient(['说好周三给答复。','但是他改了主意。','「我不等了。」','三个小时。'])`
  实测只回 3 条（open / turn / number），quote 类永远为空。

根因（实测定位）：`splitSentences` 用 `/(?<=[。！？!?；;…])|\\n+/` 切分，
  **不区分引号内外** —— `「我不等了。」` 在句号处被切成 `「我不等了。` 与 `」`，
  两半都不含成对引号，而 `QUOTE_RE` 要求引号成对（`[「『“"][^」』”"]{2,}[」』”"]`），
  于是「原话」这一类**在实现里存在、在行为上永不工作**。
  这正是本仓点名的形态：一个恒为空的读数混在健康读数里、看起来完全正常
  （保底段照样渲染，只是永远少一类）。

修法：切句改为**逐字符扫描 + 引号深度**：引号内（含「」『』“”（）《》与半角 "）的
  句末标点不当句末；换行无论深度都断句（换行是硬边界，不是标点）。
  ASCII 语言下原写法没问题，中文引号对话里它静默失效 —— 故此处按字扫。
"""
import io
import sys

P = 'stm-ltm.js'
src = io.open(P, encoding='utf-8').read()
lines = src.split('\n')

OLD = [
    'function splitSentences(text) {',
    "  return String(text == null ? '' : text)",
    '    .split(/(?<=[。！？!?；;…])|\\n+/)',
    '    .map(x => x.trim())',
    '    .filter(Boolean);',
    '}',
]
NEW = [
    'function splitSentences(text) {',
    "  const s = String(text == null ? '' : text);",
    '  const out = [];',
    "  let buf = '';",
    '  let depth = 0;',
    '  /* 成对引号/括号表：**引号内的句末标点不是句末**。',
    '     修前按 `(?<=[。！？!?；;…])` 一刀切，`「我不等了。」` 会被切成两半，',
    '     两半都不含成对引号 ⇒ QUOTE_RE 永不命中 ⇒「原话」这一类恒为空。 */',
    "  const OPENERS = '「『“（《';",
    "  const CLOSERS = '」』”）》';",
    "  const ENDERS = '。！？!?；;…';",
    '  for (let i = 0; i < s.length; i++) {',
    '    const ch = s[i];',
    '    buf += ch;',
    "    if (ch === '\\n') { out.push(buf); buf = ''; depth = 0; continue; }",
    '    /* 半角双引号按 toggle 计深度（它没有开闭之分，无法用表判）。 */',
    "    if (ch === '\"') { depth = depth > 0 ? 0 : 1; continue; }",
    '    if (OPENERS.indexOf(ch) >= 0) { depth += 1; continue; }',
    '    if (CLOSERS.indexOf(ch) >= 0) { if (depth > 0) depth -= 1; continue; }',
    '    if (depth === 0 && ENDERS.indexOf(ch) >= 0) { out.push(buf); buf = \'\'; }',
    '  }',
    "  if (buf.trim()) out.push(buf);",
    '  return out.map((x) => x.trim()).filter(Boolean);',
    '}',
]

hits = [i for i, l in enumerate(lines) if l.strip() == OLD[0].strip()]
if len(hits) != 1:
    sys.exit('[o4fix3] splitSentences 头命中 %d 次（应恰 1）' % len(hits))
i0 = hits[0]
seg = [l for l in lines[i0:i0 + len(OLD)]]
for a, b in zip(seg, OLD):
    if a.strip() != b.strip():
        sys.exit('[o4fix3] 函数体不匹配：%r vs %r' % (a, b))
lines[i0:i0 + len(OLD)] = NEW

out = '\n'.join(lines)
if not out.endswith('\n'):
    out += '\n'
for mark in ['const OPENERS', 'const CLOSERS', "if (ch === '\\n')", 'ENDERS.indexOf(ch)']:
    if mark not in out:
        sys.exit('[o4fix3] self-check missing: %s' % mark)
if out.count('function splitSentences(') != 1:
    sys.exit('[o4fix3] splitSentences 出现次数不为 1')
if out.count('.split(/(?<=[。！？!?；;…])|\\n+/)') != 0:
    sys.exit('[o4fix3] 旧切分写法仍残留')
io.open(P, 'w', encoding='utf-8').write(out)
print('[o4fix3] wrote %s lines %d -> %d' % (P, len(src.split('\n')), len(out.split('\n'))))