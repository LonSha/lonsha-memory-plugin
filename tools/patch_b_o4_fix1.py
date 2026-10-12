#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch_b_o4_fix1.py - [v3.321.0 · B 包 M3-O4 自伤修复 ①]

自伤现象：保底段在「有 summarize 通道」的真实路径下**永远为空**。
根因（实测定位，非推测）：keepSalient 被放在 _rolloverToLtm 里抽，
  但那时手上只有 stmList[].text —— 而 consolidate 写进 STM 的 text
  **已经是摘要产物**（distilled），被压掉的承诺/转折/原话在更早一步就不在了。
  「从原始片段挑关键句」这句注释是错的：那一步的输入根本不是原始片段。
  （无 summarize 通道时 text 是原文拼接，所以早期手工探针看起来是对的 —— 这正是它藏得住的原因。）

修法（改自己的接法，不改任何门禁）：
  1) consolidate 在 pending 原文还在手上时抽好保底句，随 STM 条目携带（salient 字段）；
  2) _rolloverToLtm 优先用条目携带的保底句；老条目（无该字段）回退现抽，
     并在条目上登记回退条数（fallbackSalientEntries），不假装老条目也有。
  3) 总量仍封顶 8 句；被截掉的句数记在条目上（salientDropped），不静默丢。
  4) renderSalient 增 carried 标签（老条目回退路径用）。
"""
import io
import sys

P = 'stm-ltm.js'
src = io.open(P, encoding='utf-8').read()
lines = src.split('\n')


def only(pred, label):
    hits = [i for i, l in enumerate(lines) if pred(l, i)]
    if len(hits) != 1:
        sys.exit('[o4fix1] anchor %s hit %d (expect 1)' % (label, len(hits)))
    return hits[0]


def eqline(sub):
    return lambda l, i: l.strip() == sub


def has(sub):
    return lambda l, i: sub in l


# ---- 锚点 ----
i_entry = only(eqline('const entry = {'), 'entry-literal')
i_score = only(eqline('score: 0'), 'entry-score')
if lines[i_score + 1].strip() != '};':
    sys.exit('[o4fix1] entry 收尾不是 }; -> %r' % lines[i_score + 1])
i_rollsal = only(has('const salient = keepSalient(stmList, { maxPerKind: 2, maxTotal: 8 });'), 'roll-salient')
i_label = only(has("const label = { open: '未结', turn: '转折', quote: '原话', number: '数字' };"), 'label')
i_ltmobj = only(has('salient: salient.map(x => x.text),'), 'ltm-salient')

# ---- 新内容 ----
CONS_INS = [
    '  // [v3.321 · M3-O4] 关键保底句必须在**原文还在手上**时抽。',
    '  //   放在 _rolloverToLtm 抽是错的：那时手上只有 consolidated 后的 text（已是摘要产物），',
    '  //   被压掉的承诺/转折/原话在更早一步就已经不在了 —— 保底段会静默变成空段。',
    '  const entrySalient = keepSalient(pending, { maxPerKind: 2, maxTotal: 8 })',
    '    .map(x => ({ kind: x.kind, text: x.text }));',
]

SCORE_NEW = [
    '    score: 0,',
    '    // [v3.321 · M3-O4] 随条目携带的保底句（原文阶段抽取，供 rollover 使用）',
    '    salient: entrySalient',
]

ROLL_NEW = [
    '  // [v3.321 · M3-O4] 优先用条目携带的保底句（consolidate 在原文阶段抽好）；',
    '  //   老条目没有该字段 → 回退现抽（此时手上只有摘要产物，能抽到多少算多少），',
    '  //   并在条目上如实登记「有几条走了回退路径」，不假装它们也有原文级保底。',
    '  const SALIENT_TOTAL_CAP = 8;',
    '  const salient = [];',
    '  let fallbackSalientEntries = 0;',
    '  for (let i = 0; i < stmList.length; i++) {',
    '    const carried = stmList[i] && stmList[i].salient;',
    '    if (Array.isArray(carried) && carried.length) {',
    '      for (const t of carried) {',
    '        const o = (t && typeof t === \'object\') ? t : { kind: \'carried\', text: t };',
    '        salient.push({ kind: o.kind || \'carried\', text: o.text, src: i });',
    '      }',
    '    } else {',
    '      fallbackSalientEntries += 1;',
    '      for (const x of keepSalient([stmList[i]], { maxPerKind: 2, maxTotal: 8 })) {',
    '        salient.push({ kind: x.kind, text: x.text, src: i });',
    '      }',
    '    }',
    '  }',
    '  const salientDropped = Math.max(0, salient.length - SALIENT_TOTAL_CAP);',
    '  if (salientDropped > 0) salient.length = SALIENT_TOTAL_CAP;',
]

LABEL_NEW = [
    "  const label = { open: '未结', turn: '转折', quote: '原话', number: '数字', carried: '保底' };",
]

LTM_NEW = [
    '    salient: salient.map(x => x.text),',
    '    // [v3.321 · M3-O4] 保底段自身的账：被总量上限截掉的句数 / 走回退抽取的条目数。',
    '    salientDropped, fallbackSalientEntries,',
]

ops = [
    (i_entry, i_entry, CONS_INS),
    (i_score, i_score + 1, SCORE_NEW),
    (i_rollsal, i_rollsal + 1, ROLL_NEW),
    (i_label, i_label + 1, LABEL_NEW),
    (i_ltmobj, i_ltmobj + 1, LTM_NEW),
]
ops.sort(key=lambda x: x[0])
for a, b in zip(ops, ops[1:]):
    if a[1] > b[0]:
        sys.exit('[o4fix1] ops overlap %r %r' % (a, b))
for start, end, new in sorted(ops, key=lambda x: -x[0]):
    lines[start:end] = new

out = '\n'.join(lines)
if not out.endswith('\n'):
    out += '\n'
for mark in ['entrySalient', 'SALIENT_TOTAL_CAP', 'salientDropped', 'fallbackSalientEntries', "carried: '保底'"]:
    if mark not in out:
        sys.exit('[o4fix1] self-check missing: %s' % mark)
if out.count('const salient = keepSalient(stmList') != 0:
    sys.exit('[o4fix1] 旧接法仍残留')
io.open(P, 'w', encoding='utf-8').write(out)
print('[o4fix1] wrote %s lines %d -> %d' % (P, len(src.split('\n')), len(out.split('\n'))))