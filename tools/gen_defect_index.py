r"""tools/gen_defect_index.py —— 从 CHANGELOG.md 抽「缺陷索引」（L12-X7，零依赖）

为什么存在（X7 的真实现场）：
  本仓 CHANGELOG.md 已 80 万字符，其中「缺陷 / 踩到的坑 / 自伤」散落在各版正文里。
  每写一版都要重犯上一版踩过的同一形状 —— 因为没有一份能一次读完的索引。
  索引不是新台账（不新建真源）：它只从 CHANGELOG 单一真源抽取，自己不持有事实。

抽取口径（可复算，不看人眼）：
  · 小节切分按 markdown 标题层级：`## vX.Y.Z` 开版本节，其下 `###` 开子小节；
  · 关键词命中：标题含「缺陷 / 踩到的坑 / 自伤 / 假绿 / 判据自身」之一；
  · 版本归属：向上找最近的 `## vX.Y.Z`（找不到 ⇒ 记为 ?，不丢条目）；
  · 条目：^\s*(?:[-·*]\s+|\d+[.)]\s+)，续行（缩进非条目）并入上一条。

退出码（三档，全为字面量）：
  0 = 索引已生成
  1 = 抽取结构异常（CHANGELOG 读得到但版本节低于下限 ⇒ 判据口径与文件形态已漂移）
  2 = 结构漂移（CHANGELOG 不在场 / 不可读 ⇒ 没得判 ≠ 通过）

边界（与结论一起读）：
  索引只证明「CHANGELOG 里有这些条目、可一次读完」，不证明每条都写对了。
  它是阅读索引，不是复审判据。
"""
import io
import json
import os
import re
import sys

ROOT = os.environ.get('LONSHA_INDEX_ROOT') or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'CHANGELOG.md')
OUT_MD = os.path.join(ROOT, 'docs', 'archive', 'defect-index.md')
OUT_JSON = os.path.join(ROOT, 'docs', 'archive', 'defect-index.json')

MIN_VER_LINE = 50          # 结构下限：版本节少于这个数 ⇒ 判据口径已漂移（实测 400+）
KEYWORDS = ['缺陷', '踩到的坑', '自伤', '假绿', '判据自身']
ITEM = re.compile(r'^\s*(?:[-·*]\s+|\d+[.)]\s+)')
VER = re.compile(r'^##\s+v([0-9]+\.[0-9]+\.[0-9]+)')


def drift(msg):
    sys.stderr.write('[defect-index] ' + msg + '（结构漂移：没得判 ≠ 通过）\n')
    sys.exit(2)


if not os.path.exists(SRC):
    drift('CHANGELOG.md 不在场：' + SRC)
try:
    text = io.open(SRC, encoding='utf-8').read()
except Exception as e:                                   # noqa: BLE001
    drift('CHANGELOG.md 读不出：%s' % (e,))

lines = text.split('\n')
ver = '?'
sections = []           # [{ver, title, line, items:[...]}]
cur = None
ver_count = 0
for i, line in enumerate(lines, 1):
    m = VER.match(line)
    if m:
        ver = m.group(1)
        ver_count += 1
        cur = None
        continue
    if line.startswith('### '):
        title = line[4:].strip()
        if any(k in title for k in KEYWORDS):
            cur = {'ver': ver, 'title': title, 'line': i, 'items': []}
            sections.append(cur)
        else:
            cur = None
        continue
    if cur is not None and ITEM.match(line):
        cur['items'].append(re.sub(r'^\s*(?:[-·*]\s+|\d+[.)]\s+)', '', line).strip())
    elif cur is not None and line.startswith((' ', '\t')) and line.strip() and cur['items']:
        cur['items'][-1] = (cur['items'][-1] + ' ' + line.strip()).strip()
    elif cur is not None and not line.strip():
        continue

if ver_count < MIN_VER_LINE:
    sys.stderr.write('[defect-index] 版本节只有 %d 个（下限 %d）⇒ 标题口径与 CHANGELOG 形态已漂移\n'
                     % (ver_count, MIN_VER_LINE))
    sys.exit(1)

total_items = sum(len(s['items']) for s in sections)
by_kw = {}
for k in KEYWORDS:
    by_kw[k] = sum(1 for s in sections if k in s['title'])


def esc(t):
    return t.replace('|', '\\|')


md = []
md.append('# 缺陷索引（L12-X7 · 从 CHANGELOG.md 抽取）')
md.append('')
md.append('> **这不是新台账。** 索引只从 `CHANGELOG.md` 这一份单一真源抽取，自己不持有任何事实；')
md.append('> 改事实只能改 CHANGELOG，改完重跑 `npm run index:defects` 即可。')
md.append('>')
md.append('> 抽取口径（可复算）：小节标题含 %s 之一；版本归属向上找最近 `## vX.Y.Z`；'
          % ' / '.join('「%s」' % k for k in KEYWORDS))
md.append('> 条目按 `- ` / `* ` / `1. ` 起头，缩进续行并入上一条。')
md.append('')
md.append('| 读数 | 值 |')
md.append('| --- | --- |')
md.append('| 源文件 | `CHANGELOG.md`（%d 字符） |' % len(text))
md.append('| 版本节 | %d 个 |' % ver_count)
md.append('| 命中子小节 | %d 个 |' % len(sections))
md.append('| 条目 | %d 条 |' % total_items)
for k in KEYWORDS:
    md.append('| 标题含「%s」的子小节 | %d 个 |' % (k, by_kw[k]))
md.append('')
md.append('## 按版本倒序')
md.append('')

order = []
seen = set()
for s in sections:
    if s['ver'] not in seen:
        seen.add(s['ver'])
        order.append(s['ver'])
for v in order:
    md.append('### v%s' % v)
    md.append('')
    for s in sections:
        if s['ver'] != v:
            continue
        md.append('**%s**　`CHANGELOG.md:%d`' % (s['title'], s['line']))
        md.append('')
        if not s['items']:
            md.append('- （该小节无 `- ` 条目，正文为段落 ⇒ 只记标题与行号，不臆造条目）')
        for it in s['items']:
            md.append('- ' + it)
        md.append('')

io.open(OUT_MD, 'w', encoding='utf-8', newline='').write('\n'.join(md) + '\n')
io.open(OUT_JSON, 'w', encoding='utf-8', newline='').write(json.dumps({
    'schema': 'defect-index@1',
    'source': 'CHANGELOG.md',
    'sourceChars': len(text),
    'versionSections': ver_count,
    'sections': len(sections),
    'items': total_items,
    'byKeyword': by_kw,
    'index': sections,
}, ensure_ascii=False, indent=2) + '\n')

print('[defect-index] 版本节 %d / 命中子小节 %d / 条目 %d ⇒ %s'
      % (ver_count, len(sections), total_items, os.path.relpath(OUT_MD, ROOT)))
print('  ★ 边界：本索引证明「CHANGELOG 里有这些条目、可一次读完」，不证明每条都写对了。')
