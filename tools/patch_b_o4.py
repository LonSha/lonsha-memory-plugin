#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch_b_o4.py - [v3.321.0 · B 包 M3-O4] 长篇摘要保住承诺、转折和关键原话。

落点：既有 stm-ltm.js（**不新增运行时模块**，manifest.extra_js 保持 96）。
锚点纪律：先全量校验每个锚点唯一命中，全部通过后统一写盘；失败即整体退出，不留半成品。
"""
import io
import sys

P = 'stm-ltm.js'
src = io.open(P, encoding='utf-8').read()
lines = src.split('\n')


def only(pred, label):
    hits = [i for i, l in enumerate(lines) if pred(l, i)]
    if len(hits) != 1:
        sys.exit('[o4] anchor %s hit %d (expect exactly 1)' % (label, len(hits)))
    return hits[0]


def has(sub):
    return lambda l, i: sub in l


def eqline(sub):
    return lambda l, i: l.strip() == sub


# ---------- 锚点定位（全部先校验）----------
# R1: LOSS_KEYS 收尾
i_losskey = only(lambda l, i: l.strip().startswith("'legacyTrimOnSave'"), 'losskey')
if lines[i_losskey + 1].strip() != ']);':
    sys.exit('[o4] LOSS_KEYS 结束行不是 ]);  -> %r' % lines[i_losskey + 1])
# R2: 关键保底函数插入点（LTM 滚动段之前）
i_ltmsec = only(has('3) LTM 滚动'), 'ltm-section')
# R3: 原始片段行
i_texts = only(eqline('const texts = stmList.map(e => e.text);'), 'texts')
# R4: 摘要通道调用行
i_sumcall = only(lambda l, i: l.strip().startswith('try { summary = String(await opts.summarize(texts)'), 'sumcall')
# R5: 截断行（其后紧跟 if 的收尾 }）
i_cap = only(eqline('summary = summary.slice(-LTM_SUMMARY_CAP);'), 'cap')
if lines[i_cap + 1].strip() != '}':
    sys.exit('[o4] 截断块收尾不是 } -> %r' % lines[i_cap + 1])
# R6: floors 行
i_floors = only(eqline('const floors = stmList.flatMap(e => e.floors || []);'), 'floors')
# R6b: span 行
i_span = only(lambda l, i: l.strip().startswith('span: floors.length ? { from: Math.min(...floors)'), 'span')
# R7: 归档函数插入点
i_report = only(has('8) [v3.170] 巩固自述'), 'report-section')
# R8: selfReport nz 行
i_nz = only(eqline("nz('输入侧丢弃', L.inputDropped);"), 'nz')
# R9: counters 字段行
i_cnt = only(eqline('legacyTrimOnSave: L.legacyTrimOnSave'), 'counters')
# R10: 导出行
i_exp = only(eqline('normalizeDetail, stateProvenance, selfReport, lossSummary'), 'exports')

# ---------- 新内容 ----------
LOSSKEY_NEW = [
    "  'legacyTrimOnSave',   // 走 legacyTrimOnSave 旁路被截断的条目数（要裁就记一笔）",
    "  // [v3.321 · M3-O4] 保底句所引用的片段没有楼层号（无法回到出处）的句子数。",
    "  //   摘要「保住了」承诺/转折/数字/原话，但如果它引用的楼层已被 removeByFloors 摘掉，",
    "  //   那就只能报「不可恢复」—— 读侧不变量：不可回源必须计数，不许假装还能回源。",
    "  'unrecoverableSources'",
    ']);',
]

HELPERS = [
    '// ── [v3.321 · M3-O4] 关键保底：承诺 / 转折 / 数字 / 原话 ──────────────────',
    '//   摘要通道（AI 摘要或降级拼接）都会优先丢掉「长句、低频词、数字」，',
    '//   而这三样恰好是「谁答应了什么、后来怎样、为何改变」的载体。',
    '//   本段不改变摘要通道的任何行为，只在摘要**尾部**附一段受控的关键句保底，',
    '//   并如实登记「这些句子还能不能回到原楼层」（不能回源就计数，不假装能）。',
    'const OPEN_ITEM_RE = /未结|没结|还没|仍未|待办|悬着|答应|约定|说好|保证|发誓|承诺|欠|约好/;',
    'const TURNING_RE = /但是|不过|然而|突然|结果|后来|其实|原来|反而|居然|竟然|决定|改成|变卦|反悔/;',
    'const NUMBER_RE = /[0-9０-９]+|[一二三四五六七八九十百千万]+\\s*(?:天|周|月|年|次|点|号|块|元|个|条|遍)/;',
    'const QUOTE_RE = /[「『“"][^」』”"]{2,}[」』”"]/;',
    '/** 把片段切成句子（**纯函数**，不改入参）。保留原始顺序。 */',
    'function splitSentences(text) {',
    "  return String(text == null ? '' : text)",
    '    .split(/(?<=[。！？!?；;…])|\\n+/)',
    '    .map(x => x.trim())',
    '    .filter(Boolean);',
    '}',
    '/**',
    ' * 从若干片段里挑出关键句（**纯函数**，不改入参、不改 opts）。',
    ' *',
    ' * 四类按优先级**单一归档**（未结 > 转折 > 原话 > 数字）：一句只进一个类，',
    ' *   否则同一句话会在保底段里出现四次，保底段自己变成噪声源。',
    ' * 每类最多 maxPerKind 句、总量最多 maxTotal 句；顺序 = 类的优先级顺序，',
    ' *   类内按片段原始顺序 —— 不按分数重排（保底段要的是可预期，不是好看）。',
    ' *',
    ' * @param {Array<string|{text:string}>} texts 片段（字符串或带 text 的对象）',
    ' * @returns {Array<{kind, text, src}>} src = 该句来自 texts 的下标（供回源判定）',
    ' */',
    'function keepSalient(texts, opts = {}) {',
    '  const list = Array.isArray(texts) ? texts : [];',
    '  const maxPerKind = Math.max(0, Number(opts.maxPerKind) || 2);',
    '  const maxTotal = Math.max(0, Number(opts.maxTotal) || 8);',
    '  const kinds = [',
    "    { kind: 'open', re: OPEN_ITEM_RE },",
    "    { kind: 'turn', re: TURNING_RE },",
    "    { kind: 'quote', re: QUOTE_RE },",
    "    { kind: 'number', re: NUMBER_RE }",
    '  ];',
    '  const out = [];',
    '  const seen = new Set();',
    '  for (const k of kinds) {',
    '    if (out.length >= maxTotal) break;',
    '    let taken = 0;',
    '    for (let i = 0; i < list.length && taken < maxPerKind && out.length < maxTotal; i++) {',
    "      const raw = (list[i] && typeof list[i] === 'object') ? list[i].text : list[i];",
    '      for (const s of splitSentences(raw)) {',
    '        const key = i + "\\u0000" + s;',
    '        if (seen.has(key)) continue;',
    '        // 全局正则必须复位 lastIndex：否则第二次调用会从上次位置继续，命中结果随机。',
    '        k.re.lastIndex = 0;',
    '        if (!k.re.test(s)) continue;',
    '        seen.add(key);',
    '        out.push({ kind: k.kind, text: s, src: i });',
    '        taken += 1;',
    '        break;',
    '      }',
    '    }',
    '  }',
    '  return out;',
    '}',
    '/**',
    ' * 把关键保底句渲染成摘要尾部的 `【关键保底】` 段（**纯函数**）。',
    ' * 无句可保时返回空串 —— 空段不写、不留一个空标题骗读者「保住了」。',
    ' */',
    'function renderSalient(items) {',
    '  const arr = Array.isArray(items) ? items.filter(x => x && x.text) : [];',
    "  if (!arr.length) return '';",
    "  const label = { open: '未结', turn: '转折', quote: '原话', number: '数字' };",
    '  const rows = arr.map(x => `- [${label[x.kind] || x.kind}] ${x.text}`);',
    "  return '\\n【关键保底】\\n' + rows.join('\\n');",
    '}',
]

ROLL_TEXT_INS = [
    '  // [v3.321 · M3-O4] 关键保底：从**原始片段**挑未结/转折/数字/原话。',
    '  //   从原始片段挑而不是从摘要挑：摘要是「已经压过一轮」的产物，',
    '  //   被压掉的恰恰是长句、低频词与数字 —— 也就是承诺与转折的载体。',
    '  const salient = keepSalient(stmList, { maxPerKind: 2, maxTotal: 8 });',
    '  const salientBlock = renderSalient(salient);',
    '  const prevLtm = s.ltm_entries.length ? s.ltm_entries[s.ltm_entries.length - 1] : null;',
]

SUM_CALL_NEW = [
    '  // [v3.321 · M3-O4] 差量更新：把上一版摘要作为**首元素**喂回摘要通道，',
    '  //   让它做「增量合并」而不是每轮从零重写 —— 后者正是反复摘要漂移的主因。',
    '  //   摘要函数签名不变（仍是 (texts) => Promise<string>），只是首元素换成了上一版摘要；',
    '  //   上游不必改一行代码。',
    '  const deltaInput = (prevLtm && prevLtm.summary)',
    "    ? ['【上一版摘要·增量合并】' + prevLtm.summary, ...texts]",
    '    : texts;',
    "  try { summary = String(await opts.summarize(deltaInput) || '').trim(); } catch (e) { summary = ''; }",
]

CAP_INS = [
    '  // [v3.321 · M3-O4] 保底段附在摘要尾部。',
    '  //   先截断再加保底：保底句本来就是「摘要压掉的那部分」，不该再被摘要额度挤掉。',
    '  if (salientBlock) summary = summary + salientBlock;',
]

FLOORS_INS = [
    '  // [v3.321 · M3-O4] 回源能力如实登记：保底句来自哪个片段、那个片段有没有楼层号。',
    '  //   没有楼层号 = 读侧回不到出处 —— 计数进 unrecoverableSources，不假装能回源。',
    '  const noSource = salient.filter(x => {',
    '    const e = stmList[x.src];',
    '    return !(e && Array.isArray(e.floors) && e.floors.length);',
    '  }).length;',
    '  if (noSource > 0) s.loss.unrecoverableSources += noSource;',
]

SPAN_NEW = [
    '    span: floors.length ? { from: Math.min(...floors), to: Math.max(...floors) } : null,',
    '    // [v3.321 · M3-O4] 保底读数：句子本身 + 能不能回源（三者同进同出）。',
    '    salient: salient.map(x => x.text),',
    '    recoverable: noSource === 0,',
    '    noSourceCount: noSource',
]

ARCHIVE = [
    '// ── [v3.321 · M3-O4] 关键保底句的倒排归档（**纯读**，不改 state）─────────',
    '/**',
    ' * 只存「条目 id + 关键词」，**不复制正文** —— 归档是为了「找得到」，',
    ' *   不是为了变成第二份摘要（第二份摘要就会变成第二个真源）。',
    ' */',
    'function salienceIndex(state) {',
    '  const s = normalizeState(state);',
    '  const entries = [];',
    '  const postings = Object.create(null);',
    '  for (const e of s.ltm_entries) {',
    '    const items = Array.isArray(e && e.salient) ? e.salient : [];',
    '    if (!items.length) continue;',
    '    entries.push({',
    '      id: e.id, count: items.length,',
    '      recoverable: e.recoverable !== false,',
    '      noSourceCount: Number(e.noSourceCount) || 0,',
    '      span: e.span || null',
    '    });',
    '    for (const t of items) {',
    "      for (const w of String(t).replace(/[^\\p{L}\\p{N}]+/gu, ' ').split(/\\s+/)) {",
    '        if (w.length < 2) continue;',
    '        if (!postings[w]) postings[w] = [];',
    '        if (postings[w].indexOf(e.id) < 0) postings[w].push(e.id);',
    '      }',
    '    }',
    '  }',
    '  return { version: 1, entries, postings };',
    '}',
    '/**',
    ' * 按关键词查关键保底句（**纯读**）。',
    ' *',
    ' * recoverable 按**命中条目**如实报 true/false，不报 null：',
    ' *   「这一条能不能回源」是二值的，含糊其辞等于把判据做没了。',
    ' * 空查询 = 列出全部（仍是分页语义：limit 截断时 truncated=true）。',
    ' */',
    'function lookupSalient(state, query, opts = {}) {',
    '  const s = normalizeState(state);',
    "  const q = String(query == null ? '' : query).trim();",
    '  const limit = Math.max(1, Number(opts.limit) || 20);',
    '  const terms = q',
    "    ? q.replace(/[^\\p{L}\\p{N}]+/gu, ' ').split(/\\s+/).filter(w => w.length >= 2)",
    '    : [];',
    '  const hits = [];',
    '  for (const e of s.ltm_entries) {',
    '    const items = Array.isArray(e && e.salient) ? e.salient : [];',
    '    if (!items.length) continue;',
    '    const matched = items.filter(t => {',
    '      if (!terms.length) return true;',
    '      const low = String(t).toLowerCase();',
    '      return terms.some(w => low.indexOf(w.toLowerCase()) >= 0);',
    '    });',
    '    if (!matched.length) continue;',
    '    hits.push({',
    '      id: e.id,',
    '      recoverable: e.recoverable !== false,',
    '      noSourceCount: Number(e.noSourceCount) || 0,',
    '      span: e.span || null,',
    '      matched',
    '    });',
    '    if (hits.length >= limit) break;',
    '  }',
    '  return { query: q, terms, hits, count: hits.length, truncated: hits.length >= limit };',
    '}',
]

NZ_INS = [
    "  nz('源楼层不可回源', L.unrecoverableSources);",
]

CNT_NEW = [
    '      legacyTrimOnSave: L.legacyTrimOnSave,',
    '      unrecoverableSources: Number(L.unrecoverableSources) || 0',
]

EXP_NEW = [
    '  normalizeDetail, stateProvenance, selfReport, lossSummary,',
    '  // [v3.321 · M3-O4] 追加（只增不换，既有键与签名不动）',
    '  keepSalient, renderSalient, salienceIndex, lookupSalient',
]

# ---------- 组装区间替换（按 start 降序应用，保证下标不漂）----------
ops = [
    (i_losskey, i_losskey + 2, LOSSKEY_NEW),
    (i_ltmsec, i_ltmsec, HELPERS),
    (i_texts + 1, i_texts + 1, ROLL_TEXT_INS),
    (i_sumcall, i_sumcall + 1, SUM_CALL_NEW),
    (i_cap + 2, i_cap + 2, CAP_INS),
    (i_floors + 1, i_floors + 1, FLOORS_INS),
    (i_span, i_span + 1, SPAN_NEW),
    (i_report, i_report, ARCHIVE),
    (i_nz + 1, i_nz + 1, NZ_INS),
    (i_cnt, i_cnt + 1, CNT_NEW),
    (i_exp, i_exp + 1, EXP_NEW),
]
# 区间不得重叠
ops.sort(key=lambda x: x[0])
for a, b in zip(ops, ops[1:]):
    if a[1] > b[0]:
        sys.exit('[o4] ops overlap: %r %r' % (a, b))
for start, end, new in sorted(ops, key=lambda x: -x[0]):
    lines[start:end] = new

out = '\n'.join(lines)
if not out.endswith('\n'):
    out += '\n'
# 落盘前自检：关键标记必须都在
for mark in ['unrecoverableSources', 'keepSalient', 'renderSalient', 'salienceIndex',
             'lookupSalient', '【关键保底】', '上一版摘要·增量合并']:
    if mark not in out:
        sys.exit('[o4] self-check missing: %s' % mark)
if out.count('function keepSalient') != 1 or out.count('function lookupSalient') != 1:
    sys.exit('[o4] self-check: 新函数出现次数不为 1')
io.open(P, 'w', encoding='utf-8').write(out)
print('[o4] wrote %s  lines %d -> %d' % (P, len(src.split('\n')), len(out.split('\n'))))