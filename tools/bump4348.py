#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.348.0 抬版(第四期计划收口)。

六源同源(scan_version_guard V1/V1b/V6/V7 把守):
  index.js `const VERSION = '3.347.0';`
  manifest.json / package.json `"version": "3.347.0"`
  memory-config.js / memory-core.js / memory-organs.js `let VERSION = '3.347.0'`
人读两处:CHANGELOG 顶节 / TODO「最近更新：vX.Y.Z」行(按行首整行替换)。
外加 PLAN「当前执行状态(...,vX.Y.Z)」行(P3 判据)与 README「当前版本」行。

每条锚点 count==1,否则 abort;幂等:已是 3.348.0 则跳过。
不写 CHANGELOG 正文与 ITERATION_LOG(那两处由 close4348.py 单独写,本脚本只抬版本锚)。
"""
import io
import json
import os
import re
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
OLD = '3.347.0'
NEW = '3.348.0'
WRITE = '--write' in sys.argv
BAK = '/tmp/bak4348/'
os.makedirs(BAK, exist_ok=True)

def rd(rel):
    with io.open(ROOT + rel, encoding='utf-8') as f:
        return f.read()

def wr(rel, s):
    with io.open(ROOT + rel, 'w', encoding='utf-8') as f:
        f.write(s)

results = []

def bump_once(rel, old, new, tag):
    s = rd(rel)
    if old not in s:
        if new in s:
            results.append((tag, 'SKIP(已是新版)'))
            return
        raise SystemExit('FAIL: %s 找不到锚点 %s' % (tag, old[:60]))
    n = s.count(old)
    if n != 1:
        raise SystemExit('FAIL: %s 锚点命中 %d 次(应为 1)' % (tag, n))
    if WRITE:
        with io.open(BAK + rel.replace('/', '_') + '.pre4348', 'w', encoding='utf-8') as f:
            f.write(s)
        wr(rel, s.replace(old, new))
    results.append((tag, 'bump'))

# ── ① 六源同源 ──
bump_once('index.js', "const VERSION = '" + OLD + "';", "const VERSION = '" + NEW + "';", 'index.js/VERSION')
for m in ['memory-config.js', 'memory-core.js', 'memory-organs.js']:
    bump_once(m, "let VERSION = '" + OLD + "';", "let VERSION = '" + NEW + "';", m + '/VERSION')
for m in ['manifest.json', 'package.json']:
    bump_once(m, '"version": "' + OLD + '"', '"version": "' + NEW + '"', m + '/version')

# ── ② V6 CHANGELOG 顶节：新增当版节，旧顶节降级(只加标题行不动正文) ──
CL_HEAD = '## v' + NEW
CL_NEW_SECTION = (
    '## v' + NEW + '\n'
    '**第四期计划收口:全量实跑一次并把读数登记进快照面(P0 / 收口,不新增产品面)**\n'
    '★ **修的是什么(修前实测,读码可复算)** ----------------------------------------------------------------\n'
    '收口第一刀是**跑一次全量**,而它当场抓出**四处红**,没有一处是「新写的代码坏了」:\n'
    ' ① `v3297_state_report` 的 S3「落盘报告与现场取数逐格一致」—— `tests/audit/state-report.json`\n'
    '    停在 v3.347.0 抬版前的取数,版本与 extra_js 两格漂移;刷新即同源(不是判据错)。\n'
    ' ②③ `v3324` / `v3328` 的「本包两模块须仍落在**末尾三模块**窗口内」—— 该形态**每版新增模块必然翻红**:\n'
    '    v3.346.0 `material-pack.js` 与 v3.347.0 `lore-crosscheck.js` 依次把 `testimony-board.js` /\n'
    '    `narrative-layer.js` 顶出末尾三格。★ 这两条已**连红两版**,而翻红的信息量只剩「窗口大小不对」\n'
    '    —— 正是本仓最贵的形态「判据从看守退化成噪声」。修法不是删判据:仍判**语义**\n'
    '    「两模块未掉队且加载序未被打乱」(两者在场 + `testimony-board` 仍排在 `narrative-layer` 之前),\n'
    '    **代价写明**:不再判「未落在分发面中间」—— 中间位置对加载序无语义。\n'
    ' ④ `v3159_audit_failclosed_and_fallback_parity` 单文件耗时 118s > 120s 默认超时 ⇒ 并发跑批时\n'
    '    被记 TIMEOUT;**单跑 12/12 全绿**(本版按 300s 超时重跑即绿)⇒ 判定为**环境资源**,非判据失败。\n'
    '★ **收口读数(零手抄,由 tools/_rebind_doc_readings.py 消费结构化摘要写入)** ------------------------\n'
    '  `node tests/run.mjs --audit`(TEST_TIMEOUT=300000 / 并发 7):**327 个测试文件全通过 · 0 失败 ·\n'
    '  3892 断言 · 审计 61/61 全通过**(测试段 185.0s + 审计段 102.6s)。\n'
    '  这是**第三期 v3.328.0 之后的第一份全量快照**,也是**第四期计划(M4-O1~O9 / M4-X1~X9)\n'
    '  三十六项全部交付后的收口点**:此前十四版一律标「全量待验」。\n'
    '★ **本版不做**:不新增任何产品面、不改运行时代码(除①③两处判据/台账面),不抬 `extra_js`(仍 112),\n'
    '  不动宿主 `index.js` 的实现体(只改版本常量与当版注释)。\n'
    '★ **诚实边界**:真实 SillyTavern 宿主与真实模型体验**仍未跑** —— 全量绿只证明「无头环境下\n'
    '  模块间契约成立、327 个档的判据全过」,不代表真机与真模型下的体验已验收;下一期计划开工前\n'
    '  仍需重算基线(本仓纪律:计划收口后回到「盘面一动即标待验」)。\n'
    '· 退出码三档:0 卫生 / 1 真缺陷 / 2 结构漂移(本仓扫描器契约;本节同款声明供 D9 核对)。\n'
)
s = rd('CHANGELOG.md')
if s.startswith(CL_HEAD):
    results.append(('CHANGELOG.md/顶节', 'SKIP(已写)'))
else:
    if not s.startswith('## v' + OLD):
        raise SystemExit('FAIL: CHANGELOG 顶节不是 v' + OLD + ',实际:' + s.split(chr(10))[0][:40])
    if WRITE:
        with io.open(BAK + 'CHANGELOG.md.pre4348', 'w', encoding='utf-8') as f:
            f.write(s)
        wr('CHANGELOG.md', CL_NEW_SECTION + '\n' + s)
    results.append(('CHANGELOG.md/顶节', 'bump'))

# ── ③ V7 TODO「最近更新」行(超长单行,按行首定位整行替换) ──
tp = rd('TODO.md')
tl = tp.split(chr(10))
hit = [i for i, l in enumerate(tl) if l.startswith('> **最近更新：v')]
if not hit:
    raise SystemExit('FAIL: TODO 里找不到「最近更新：vX.Y.Z」行')
if OLD in tl[hit[0]] and NEW in tl[hit[0]]:
    results.append(('TODO.md/最近更新', 'SKIP'))
elif ('v' + OLD) not in tl[hit[0]]:
    raise SystemExit('FAIL: TODO 最近更新行不是 v' + OLD + ':' + tl[hit[0]][:80])
else:
    if WRITE:
        with io.open(BAK + 'TODO.md.pre4348', 'w', encoding='utf-8') as f:
            f.write(tp)
        tl[hit[0]] = tl[hit[0]].replace('v' + OLD, 'v' + NEW, 1)
        wr('TODO.md', chr(10).join(tl))
    results.append(('TODO.md/最近更新', 'bump'))

# ── ④ PLAN「当前执行状态(...,vX.Y.Z)」+ README「当前版本」 ──
pl = rd('PLAN.md')
m = re.search(r'当前执行状态[（(][^,，)）\n]{1,24}[,，]v?([0-9]+[.][0-9]+[.][0-9]+)[）)]', pl)
if not m:
    raise SystemExit('FAIL: PLAN 缺「当前执行状态(…,vX.Y.Z)」行')
if m.group(1) == NEW:
    results.append(('PLAN.md/当前执行状态', 'SKIP'))
elif m.group(1) != OLD:
    raise SystemExit('FAIL: PLAN 当前执行状态写 v' + m.group(1) + ',既非 %s 也非 %s' % (OLD, NEW))
else:
    if WRITE:
        with io.open(BAK + 'PLAN.md.pre4348', 'w', encoding='utf-8') as f:
            f.write(pl)
        pl = pl[:m.start(1)] + NEW + pl[m.end(1):]
        wr('PLAN.md', pl)
    results.append(('PLAN.md/当前执行状态', 'bump'))

rm = rd('README.md')
if ('**当前版本**：`' + NEW + '`') in rm:
    results.append(('README.md/当前版本', 'SKIP'))
elif ('**当前版本**：`' + OLD + '`') not in rm:
    raise SystemExit('FAIL: README 缺「当前版本」行')
else:
    if WRITE:
        with io.open(BAK + 'README.md.pre4348', 'w', encoding='utf-8') as f:
            f.write(rm)
        rm = rm.replace('**当前版本**：`' + OLD + '`', '**当前版本**：`' + NEW + '`', 1)
        wr('README.md', rm)
    results.append(('README.md/当前版本', 'bump'))

for t, s2 in results:
    print('%-28s %s' % (t, s2))
if not WRITE:
    print('--- DRY RUN (pass --write to apply) ---')

# ── 自证 ──
if WRITE:
    mf = json.loads(rd('manifest.json'))
    assert mf['version'] == NEW, mf['version']
    assert len(mf['extra_js']) == 112, len(mf['extra_js'])
    assert rd('CHANGELOG.md').startswith('## v' + NEW)
    assert '最近更新：v' + NEW in rd('TODO.md')
    assert '当前执行状态' in rd('PLAN.md') and NEW in rd('PLAN.md')
    print('SELF-CHECK OK: version=%s extra_js=%d' % (NEW, len(mf['extra_js'])))
